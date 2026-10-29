#!/usr/bin/env python3
"""Local Databricks SQL Statement Execution API for adapter tests.

DuckDB runs the SQL. The adapter sends Databricks SQL (backtick identifiers
and :name parameters). Those are rewritten to DuckDB double quotes and $name
binds. The fixture matches the other warehouse clusters: orders, revenue, and
the paid_orders view. Compose caps the process at 512 MiB.
"""

from __future__ import annotations

import hmac
import json
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import duckdb

PORT = int(os.environ.get("DASH_DATABRICKS_PORT", "14439"))
TOKEN = os.environ.get("DASH_DATABRICKS_TOKEN", "dash")
WAREHOUSE = os.environ.get("DASH_DATABRICKS_WAREHOUSE", "dash")
CATALOG = os.environ.get("DASH_DATABRICKS_CATALOG", "dash")
SCHEMA = os.environ.get("DASH_DATABRICKS_SCHEMA", "analytics")
IDENT = re.compile(r"[A-Za-z_][A-Za-z0-9_-]*")

if not IDENT.fullmatch(CATALOG) or not IDENT.fullmatch(SCHEMA) or not IDENT.fullmatch(WAREHOUSE):
    raise SystemExit("catalog, schema, and warehouse must be identifiers")

lock = threading.Lock()
statements: dict[str, dict] = {}
con = duckdb.connect(":memory:")


def rewrite_statement(sql: str, names: set[str]) -> str:
    """Rewrite Databricks backticks and :name binds outside strings and comments."""
    out: list[str] = []
    index = 0
    length = len(sql)
    while index < length:
        if sql.startswith("--", index):
            end = sql.find("\n", index)
            if end < 0:
                out.append(sql[index:])
                break
            out.append(sql[index:end])
            index = end
            continue
        if sql.startswith("/*", index):
            end = sql.find("*/", index + 2)
            if end < 0:
                raise ValueError("unterminated comment")
            out.append(sql[index : end + 2])
            index = end + 2
            continue
        char = sql[index]
        if char == "'":
            cursor = index + 1
            while cursor < length:
                if sql.startswith("''", cursor):
                    cursor += 2
                    continue
                if sql[cursor] == "'":
                    cursor += 1
                    break
                cursor += 1
            else:
                raise ValueError("unterminated string")
            out.append(sql[index:cursor])
            index = cursor
            continue
        if char == "`":
            cursor = index + 1
            while cursor < length and sql[cursor] != "`":
                cursor += 1
            if cursor >= length:
                raise ValueError("unterminated identifier")
            ident = sql[index + 1 : cursor].replace('"', "")
            out.append('"' + ident + '"')
            index = cursor + 1
            continue
        if char == ":" and index + 1 < length and (sql[index + 1].isalpha() or sql[index + 1] == "_"):
            cursor = index + 1
            while cursor < length and (sql[cursor].isalnum() or sql[cursor] == "_"):
                cursor += 1
            name = sql[index + 1 : cursor]
            if name in names:
                out.append("$" + name)
                index = cursor
                continue
        if char == ";":
            raise ValueError("multiple statements are not allowed")
        out.append(char)
        index += 1
    return "".join(out).strip()


def leading_keyword(sql: str) -> str:
    index = 0
    length = len(sql)
    while index < length:
        if sql[index].isspace():
            index += 1
            continue
        if sql.startswith("--", index):
            newline = sql.find("\n", index)
            index = length if newline < 0 else newline + 1
            continue
        if sql.startswith("/*", index):
            end = sql.find("*/", index + 2)
            if end < 0:
                return ""
            index = end + 2
            continue
        break
    match = re.match(r"[A-Za-z]+", sql[index:])
    return match.group(0).upper() if match else ""


def logical_type(type_obj: object, sample: object) -> str:
    text = str(type_obj).upper()
    if "BOOL" in text or isinstance(sample, bool):
        return "BOOLEAN"
    if "INTERVAL" not in text and "INT" in text:
        return "BIGINT" if "BIG" in text or "HUGE" in text else "INT"
    if any(token in text for token in ("DOUBLE", "FLOAT", "DECIMAL", "REAL")):
        return "DOUBLE"
    if isinstance(sample, int) and not isinstance(sample, bool):
        return "INT"
    if isinstance(sample, float):
        return "DOUBLE"
    if "NUMBER" in text and sample is None:
        return "STRING"
    return "STRING"


def encode_cell(value: object, type_name: str) -> str | None:
    if value is None:
        return None
    if type_name == "BOOLEAN" or isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def decode_param(param: dict) -> tuple[str, object]:
    name = str(param.get("name") or "")
    if not IDENT.fullmatch(name):
        raise ValueError("invalid parameter name")
    raw = param.get("value")
    kind = str(param.get("type") or "STRING").upper()
    if raw is None:
        return name, None
    if kind == "BOOLEAN":
        return name, str(raw).lower() == "true"
    if kind in {"INT", "BIGINT", "SMALLINT", "TINYINT", "INTEGER"}:
        return name, int(raw)
    if kind in {"DOUBLE", "FLOAT", "DECIMAL"}:
        return name, float(raw)
    return name, str(raw)


def bind_sql(statement: str, parameters: list[dict] | None) -> tuple[str, dict[str, object]]:
    values: dict[str, object] = {}
    names: list[str] = []
    for param in parameters or []:
        name, value = decode_param(param)
        values[name] = value
        names.append(name)
    sql = rewrite_statement(statement, set(names))
    if leading_keyword(sql) != "SELECT":
        raise ValueError("only SELECT statements are allowed")
    return sql, values


def run_sql(sql: str, values: dict[str, object]):
    def attempt(statement: str):
        if values:
            return con.execute(statement, values)
        return con.execute(statement)

    try:
        return attempt(sql)
    except duckdb.Error as first:
        rewritten = re.sub(
            rf'"{re.escape(CATALOG)}"\."information_schema"\.',
            "information_schema.",
            sql,
        )
        if rewritten == sql:
            raise
        try:
            return attempt(rewritten)
        except duckdb.Error as second:
            raise second from first


def execute_statement(statement: str, parameters: list[dict] | None) -> dict:
    sql, values = bind_sql(statement, parameters)
    cursor = run_sql(sql, values)
    rows = cursor.fetchall()
    description = list(cursor.description or [])
    columns = []
    data_array = []
    samples = rows[0] if rows else (None,) * len(description)
    type_names = [
        logical_type(column[1], samples[index] if index < len(samples) else None)
        for index, column in enumerate(description)
    ]
    for position, column in enumerate(description):
        type_name = type_names[position]
        columns.append(
            {
                "name": column[0],
                "type_text": type_name,
                "type_name": type_name,
                "position": position,
            }
        )
    for row in rows:
        data_array.append(
            [encode_cell(value, type_names[index]) for index, value in enumerate(row)]
        )
    return {
        "status": {"state": "SUCCEEDED"},
        "manifest": {
            "format": "JSON_ARRAY",
            "schema": {"column_count": len(columns), "columns": columns},
            "total_chunk_count": 1,
            "total_row_count": len(rows),
        },
        "result": {
            "chunk_index": 0,
            "row_offset": 0,
            "row_count": len(rows),
            "data_array": data_array,
        },
    }


def failed(message: str) -> dict:
    return {
        "status": {
            "state": "FAILED",
            "error": {"error_code": "BAD_REQUEST", "message": message},
        }
    }


def load_fixture() -> None:
    con.execute(f'ATTACH \':memory:\' AS "{CATALOG}"')
    databases = [row[0] for row in con.execute("SELECT database_name FROM duckdb_databases()").fetchall()]
    if CATALOG not in databases:
        raise SystemExit(f"attached catalogs are {databases}, expected {CATALOG}")
    con.execute(f'USE "{CATALOG}"')
    con.execute(f'CREATE SCHEMA "{SCHEMA}"')
    con.execute(
        f"""
        CREATE TABLE "{SCHEMA}".orders (
          id INTEGER PRIMARY KEY,
          total INTEGER NOT NULL,
          status VARCHAR NOT NULL,
          region VARCHAR,
          note VARCHAR
        )
        """
    )
    con.execute(
        f"""
        INSERT INTO "{SCHEMA}".orders VALUES
          (1, 10, 'paid', 'Europe', 'first'),
          (2, 25, 'paid', 'Europe', NULL),
          (3, 5, 'open', 'Asia Pacific', 'third'),
          (4, 40, 'paid', 'North America', NULL)
        """
    )
    con.execute(
        f"""
        CREATE TABLE "{SCHEMA}".revenue (
          month VARCHAR PRIMARY KEY,
          amount INTEGER NOT NULL
        )
        """
    )
    con.execute(
        f"""
        INSERT INTO "{SCHEMA}".revenue VALUES
          ('2026-01', 10),
          ('2026-02', 20),
          ('2026-03', 15)
        """
    )
    con.execute(
        f"""
        CREATE VIEW "{SCHEMA}".paid_orders AS
        SELECT id, total, status, region
        FROM "{SCHEMA}".orders
        WHERE status = 'paid'
        """
    )


def self_check() -> None:
    paid = execute_statement(
        f"SELECT id FROM `{CATALOG}`.`{SCHEMA}`.`paid_orders` ORDER BY id LIMIT 1",
        [],
    )
    rows = paid["result"]["data_array"]
    if paid["status"]["state"] != "SUCCEEDED" or not rows or rows[0][0] != "1":
        raise SystemExit(f"paid_orders fixture check failed: {paid}")
    matched = execute_statement(
        f"SELECT id FROM `{CATALOG}`.`{SCHEMA}`.`orders` WHERE `region` ILIKE :p0 ORDER BY id",
        [{"name": "p0", "value": "%EUROPE%", "type": "STRING"}],
    )
    ids = [row[0] for row in matched["result"]["data_array"]]
    if ids != ["1", "2"]:
        raise SystemExit(f"ILIKE fixture check failed: {ids}")
    page = execute_statement(
        f"SELECT month FROM `{CATALOG}`.`{SCHEMA}`.`revenue` ORDER BY month LIMIT 1 OFFSET 1",
        [],
    )
    if page["result"]["data_array"] != [["2026-02"]]:
        raise SystemExit(f"LIMIT check failed: {page}")
    columns = execute_statement(
        " ".join(
            [
                "SELECT c.table_name AS name, c.column_name AS column_name,",
                "c.data_type AS data_type, c.is_nullable AS is_nullable",
                f"FROM `{CATALOG}`.`information_schema`.`columns` AS c",
                f"WHERE c.table_schema = '{SCHEMA}' AND c.table_name = 'orders'",
                "ORDER BY c.ordinal_position",
            ]
        ),
        [],
    )
    int_types = {"INTEGER", "INT", "INT4"}
    text_types = {"VARCHAR", "STRING", "TEXT"}

    def matches(row: list, column: str, types: set[str], nullable: str) -> bool:
        return (
            len(row) >= 4
            and row[0] == "orders"
            and row[1] == column
            and str(row[2]).upper() in types
            and str(row[3]).upper() == nullable
        )

    actual = columns["result"]["data_array"]
    expected_ok = (
        len(actual) == 5
        and matches(actual[0], "id", int_types, "NO")
        and matches(actual[1], "total", int_types, "NO")
        and matches(actual[2], "status", text_types, "NO")
        and matches(actual[3], "region", text_types, "YES")
        and matches(actual[4], "note", text_types, "YES")
    )
    if not expected_ok:
        raise SystemExit(f"information_schema check failed: {actual}")


def authorized(header: str | None) -> bool:
    if not header or not header.startswith("Bearer "):
        return False
    presented = header[7:].encode()
    expected = TOKEN.encode()
    if len(presented) != len(expected):
        return False
    return hmac.compare_digest(presented, expected)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:
        return

    def _json(self, status: int, payload: dict) -> None:
        raw = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _unauthorized(self) -> None:
        self._json(401, {"message": "Invalid Databricks SQL token"})

    def _read_json(self) -> dict | None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._json(400, failed("Content-Length is invalid"))
            return None
        if length < 0 or length > 1_000_000:
            self._json(413, {"message": "request is too large"})
            return None
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            self._json(400, failed("request body is not JSON"))
            return None
        if not isinstance(payload, dict):
            self._json(400, failed("request body must be an object"))
            return None
        return payload

    def do_POST(self) -> None:
        path = self.path.split("?", 1)[0]
        cancel = re.fullmatch(r"/api/2.0/sql/statements/([0-9a-f]+)/cancel", path)
        if cancel:
            if not authorized(self.headers.get("Authorization")):
                self._unauthorized()
                return
            with lock:
                statements.pop(cancel.group(1), None)
            self._json(200, {"status": {"state": "CANCELED"}})
            return
        if path != "/api/2.0/sql/statements":
            self._json(404, {"message": "not found"})
            return
        if not authorized(self.headers.get("Authorization")):
            self._unauthorized()
            return
        payload = self._read_json()
        if payload is None:
            return
        if payload.get("warehouse_id") != WAREHOUSE:
            self._json(404, failed("Unknown Databricks SQL warehouse"))
            return
        statement = payload.get("statement")
        if not isinstance(statement, str) or not statement.strip():
            self._json(400, failed("statement is required"))
            return
        parameters = payload.get("parameters") or []
        if not isinstance(parameters, list):
            self._json(400, failed("parameters must be an array"))
            return
        try:
            with lock:
                result = execute_statement(statement, parameters)
                statement_id = os.urandom(8).hex()
                result["statement_id"] = statement_id
                statements[statement_id] = result
                if len(statements) > 32:
                    statements.pop(next(iter(statements)))
        except (duckdb.Error, ValueError) as exc:
            self._json(400, failed(str(exc).split("\n", 1)[0]))
            return
        self._json(200, result)

    def do_GET(self) -> None:
        if not authorized(self.headers.get("Authorization")):
            self._unauthorized()
            return
        path = self.path.split("?", 1)[0]
        statement_match = re.fullmatch(r"/api/2.0/sql/statements/([0-9a-f]+)", path)
        chunk_match = re.fullmatch(
            r"/api/2.0/sql/statements/([0-9a-f]+)/result/chunks/(\d+)",
            path,
        )
        with lock:
            if statement_match:
                stored = statements.get(statement_match.group(1))
                if not stored:
                    self._json(404, {"message": "statement not found"})
                    return
                self._json(200, stored)
                return
            if chunk_match:
                stored = statements.get(chunk_match.group(1))
                if not stored or chunk_match.group(2) != "0":
                    self._json(404, {"message": "chunk not found"})
                    return
                self._json(200, stored["result"])
                return
        self._json(404, {"message": "not found"})


def main() -> None:
    load_fixture()
    self_check()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Databricks SQL test cluster listening on {PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
