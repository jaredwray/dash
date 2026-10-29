"""Local Stripe list and search API for adapter tests.

Fixture rows are fixed so query tests can assert customers and charges.
The bearer token is the DASH_STRIPE_KEY environment variable.
"""

from __future__ import annotations

import json
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

PORT = int(os.environ.get("DASH_STRIPE_PORT", "12119"))
KEY = os.environ.get("DASH_STRIPE_KEY", "sk_test_dash")
REQUESTS: list[str] = []

CUSTOMERS = [
    {"id": "cus_ada", "object": "customer", "email": "ada@example.com", "name": "Ada", "created": 1767225600, "currency": "usd"},
    {"id": "cus_grace", "object": "customer", "email": "grace@example.com", "name": "Grace", "created": 1769904000, "currency": "usd"},
    {"id": "cus_lin", "object": "customer", "email": "lin@example.com", "name": "Lin", "created": 1772323200, "currency": "eur"},
]

CHARGES = [
    {"id": "ch_1", "object": "charge", "amount": 1000, "currency": "usd", "status": "succeeded", "paid": True, "customer": "cus_ada", "created": 1767225600},
    {"id": "ch_2", "object": "charge", "amount": 2500, "currency": "usd", "status": "succeeded", "paid": True, "customer": "cus_ada", "created": 1769904000},
    {"id": "ch_3", "object": "charge", "amount": 500, "currency": "usd", "status": "failed", "paid": False, "customer": "cus_grace", "created": 1772323200},
    {"id": "ch_4", "object": "charge", "amount": 4000, "currency": "eur", "status": "succeeded", "paid": True, "customer": "cus_lin", "created": 1775001600},
]

for index in range(100):
    CUSTOMERS.append(
        {
            "id": f"cus_x{index:03d}",
            "object": "customer",
            "email": f"user{index:03d}@fixture.test",
            "name": f"User {index:03d}",
            "created": 1000 + index,
            "currency": "usd",
        }
    )
    CHARGES.append(
        {
            "id": f"ch_z{index:03d}",
            "object": "charge",
            "amount": 9000,
            "currency": "usd",
            "status": "failed",
            "paid": False,
            "customer": "cus_ada",
            "created": 1_800_000_000 + index,
        }
    )

INVOICES = [
    {"id": "in_1", "object": "invoice", "customer": "cus_ada", "status": "paid", "currency": "usd", "total": 1000, "created": 1767225600},
    {"id": "in_2", "object": "invoice", "customer": "cus_lin", "status": "open", "currency": "eur", "total": 4000, "created": 1775001600},
]

SUBSCRIPTIONS = [
    {"id": "sub_1", "object": "subscription", "customer": "cus_ada", "status": "active", "currency": "usd", "created": 1767225600},
    {"id": "sub_2", "object": "subscription", "customer": "cus_grace", "status": "canceled", "currency": "usd", "created": 1769904000},
]

RESOURCES = {
    "customers": CUSTOMERS,
    "charges": CHARGES,
    "invoices": INVOICES,
    "subscriptions": SUBSCRIPTIONS,
}


def _integer(value: str | None) -> int | None:
    if value is None or not re.fullmatch(r"-?\d+", value):
        return None
    return int(value)


def _split_top(text: str, separator: str) -> list[str]:
    parts: list[str] = []
    buf: list[str] = []
    depth = 0
    quote = False
    escape = False
    index = 0
    while index < len(text):
        char = text[index]
        if quote:
            buf.append(char)
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                quote = False
            index += 1
            continue
        if char == '"':
            quote = True
            buf.append(char)
            index += 1
            continue
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
        if depth == 0 and text.startswith(separator, index):
            parts.append("".join(buf).strip())
            buf = []
            index += len(separator)
            continue
        buf.append(char)
        index += 1
    parts.append("".join(buf).strip())
    return parts


def _unescape(value: str) -> str:
    chars: list[str] = []
    escape = False
    for char in value:
        if escape:
            chars.append(char)
            escape = False
        elif char == "\\":
            escape = True
        else:
            chars.append(char)
    if escape:
        raise ValueError("bad escape")
    return "".join(chars)


def _parse_value(text: str):
    if text == "null":
        return None
    if text == "true":
        return True
    if text == "false":
        return False
    if text.startswith('"'):
        if len(text) < 2 or not text.endswith('"'):
            raise ValueError("bad string")
        return _unescape(text[1:-1])
    parsed = _integer(text)
    if parsed is None:
        raise ValueError("bad value")
    return parsed


def _eval_pred(text: str, row: dict) -> bool:
    match = re.fullmatch(r"(-?)([A-Za-z_]+)(>=|<=|>|<|:|~)(.+)", text.strip())
    if not match:
        raise ValueError("bad predicate")
    negate, field, operator, raw_value = match.groups()
    value = _parse_value(raw_value)
    current = row.get(field)
    if operator == ":":
        ok = current == value
    elif operator == "~":
        ok = isinstance(current, str) and isinstance(value, str) and value in current
    elif operator in {">", ">=", "<", "<="}:
        if not isinstance(current, int) or isinstance(current, bool) or not isinstance(value, int):
            ok = False
        elif operator == ">":
            ok = current > value
        elif operator == ">=":
            ok = current >= value
        elif operator == "<":
            ok = current < value
        else:
            ok = current <= value
    else:
        raise ValueError("bad operator")
    return (not ok) if negate else ok


def _eval_term(text: str, row: dict) -> bool:
    body = text.strip()
    if body.startswith("(") and body.endswith(")"):
        return any(_eval_pred(part, row) for part in _split_top(body[1:-1], " OR "))
    return _eval_pred(body, row)


def apply_search(rows: list[dict], query: str) -> list[dict]:
    if query == "":
        return list(rows)
    terms = _split_top(query, " AND ")
    return [row for row in rows if all(_eval_term(term, row) for term in terms)]


def list_page(rows: list[dict], query: dict[str, list[str]], cursor_key: str) -> dict:
    items = list(rows)
    for field in ("email", "customer", "status"):
        if field in query:
            wanted = query[field][0]
            items = [row for row in items if row.get(field) == wanted]
    gt = _integer((query.get("created[gt]") or [None])[0])
    gte = _integer((query.get("created[gte]") or [None])[0])
    lt = _integer((query.get("created[lt]") or [None])[0])
    lte = _integer((query.get("created[lte]") or [None])[0])
    if gt is not None:
        items = [row for row in items if row["created"] > gt]
    if gte is not None:
        items = [row for row in items if row["created"] >= gte]
    if lt is not None:
        items = [row for row in items if row["created"] < lt]
    if lte is not None:
        items = [row for row in items if row["created"] <= lte]
    items.sort(key=lambda row: (-row["created"], row["id"]))
    raw_limit = (query.get("limit") or ["10"])[0]
    if not raw_limit.isdigit() or not 1 <= int(raw_limit) <= 100:
        return {"error": "invalid_limit"}
    limit = int(raw_limit)
    cursor = (query.get(cursor_key) or [None])[0]
    start = 0
    if cursor:
        ids = [row["id"] for row in items]
        if cursor not in ids:
            return {"error": "unknown_cursor"}
        start = ids.index(cursor) + 1
    page = items[start : start + limit]
    has_more = start + limit < len(items)
    payload = {"object": "list", "data": page, "has_more": has_more, "url": "/v1"}
    if has_more and page:
        payload["next_page"] = page[-1]["id"]
    return payload


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args) -> None:
        return

    def _send(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        REQUESTS.append(self.path)
        if len(REQUESTS) > 200:
            del REQUESTS[:-200]
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self._send(200, {"ok": True})
            return
        if self.headers.get("Authorization") != f"Bearer {KEY}":
            self._send(401, {"error": {"type": "invalid_request_error", "message": "Invalid API key"}})
            return
        if parsed.path == "/v1/_requests":
            self._send(200, {"requests": list(REQUESTS)})
            return
        if parsed.path == "/v1/balance":
            self._send(200, {"object": "balance", "livemode": False, "available": [], "pending": []})
            return
        query = parse_qs(parsed.query, keep_blank_values=False)
        resource = parsed.path.removeprefix("/v1/")
        searching = resource.endswith("/search")
        if searching:
            resource = resource.removesuffix("/search")
        if resource not in RESOURCES or "/" in resource:
            self._send(404, {"error": {"type": "invalid_request_error", "message": "Unrecognized request"}})
            return
        rows = RESOURCES[resource]
        if searching:
            try:
                rows = apply_search(rows, (query.get("query") or [""])[0])
            except ValueError:
                self._send(400, {"error": {"type": "invalid_request_error", "message": "Invalid search query"}})
                return
        page = list_page(rows, query, "page" if searching else "starting_after")
        if page.get("error") == "unknown_cursor":
            self._send(400, {"error": {"type": "invalid_request_error", "message": "Unknown cursor"}})
            return
        if "error" in page:
            self._send(400, {"error": {"type": "invalid_request_error", "message": "Invalid limit"}})
            return
        self._send(200, page)

    def do_POST(self) -> None:
        self._send(405, {"error": {"message": "Method not allowed"}})


def main() -> None:
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
