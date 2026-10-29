#!/bin/bash
# Probe the in-memory emulator. `orders` is loaded from the YAML seed.
# `view` is the paid_orders fixture created by entrypoint.sh after startup.
set -euo pipefail

mode=${1:-view}
if [[ "$mode" == "orders" ]]; then
  sql='SELECT id FROM `dash.analytics.orders` ORDER BY id LIMIT 1'
else
  sql='SELECT id FROM `dash.analytics.paid_orders` ORDER BY id LIMIT 1'
fi

body=$(printf '{"query":"%s","useLegacySql":false,"timeoutMs":4000}' "$sql")
exec 3<>/dev/tcp/127.0.0.1/9050
printf 'POST /bigquery/v2/projects/dash/queries HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: %s\r\nConnection: close\r\n\r\n%s' "${#body}" "$body" >&3
response=$(cat <&3)
exec 3<&-
exec 3>&-
printf '%s' "$response" | grep -q '"jobComplete":true'
printf '%s' "$response" | grep -q '"v":"1"'
