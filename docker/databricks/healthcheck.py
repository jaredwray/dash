#!/usr/bin/env python3
"""Require the paid_orders fixture to be queryable through the statement API."""

import json
import os
import re
import sys
import urllib.request

IDENT = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")


def main() -> None:
    port = os.environ.get("DASH_DATABRICKS_PORT", "14439")
    token = os.environ.get("DASH_DATABRICKS_TOKEN", "dash")
    warehouse = os.environ.get("DASH_DATABRICKS_WAREHOUSE", "dash")
    catalog = os.environ.get("DASH_DATABRICKS_CATALOG", "dash")
    schema = os.environ.get("DASH_DATABRICKS_SCHEMA", "analytics")
    if not IDENT.fullmatch(catalog) or not IDENT.fullmatch(schema) or not IDENT.fullmatch(warehouse):
        sys.exit(1)
    body = json.dumps(
        {
            "warehouse_id": warehouse,
            "statement": (
                f"SELECT id FROM `{catalog}`.`{schema}`.`paid_orders` ORDER BY id LIMIT 1"
            ),
            "disposition": "INLINE",
            "format": "JSON_ARRAY",
            "wait_timeout": "10s",
        }
    ).encode()
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}/api/2.0/sql/statements",
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=4) as response:
        payload = json.load(response)
    rows = (payload.get("result") or {}).get("data_array") or []
    if payload.get("status", {}).get("state") != "SUCCEEDED":
        sys.exit(1)
    if not rows or rows[0][0] != "1":
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.exit(1)
