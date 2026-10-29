#!/bin/bash
# Start the emulator, wait until the YAML seed is queryable, then create the
# paid_orders view. The process stays in the foreground so Compose can signal it.
set -euo pipefail

pid=""
cleanup() {
  if [[ -n "${pid}" ]]; then
    kill "${pid}" 2>/dev/null || true
    wait "${pid}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

/bin/bigquery-emulator \
  --project=dash \
  --dataset=analytics \
  --data-from-yaml=/seed/analytics.yaml \
  --log-level=info \
  &
pid=$!

ready=0
for _ in $(seq 1 50); do
  if bash /opt/dash/healthcheck.sh orders; then
    ready=1
    break
  fi
  if ! kill -0 "${pid}" 2>/dev/null; then
    echo "bigquery emulator exited during startup" >&2
    exit 1
  fi
  sleep 0.2
done

if [[ "${ready}" -ne 1 ]]; then
  echo "bigquery emulator did not load the orders fixture" >&2
  exit 1
fi

view_body='{"query":"CREATE VIEW `dash.analytics.paid_orders` AS SELECT id, total, status, region FROM `dash.analytics.orders` WHERE status = '\''paid'\''","useLegacySql":false,"timeoutMs":8000}'
exec 3<>/dev/tcp/127.0.0.1/9050
printf 'POST /bigquery/v2/projects/dash/queries HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: %s\r\nConnection: close\r\n\r\n%s' "${#view_body}" "$view_body" >&3
view_response=$(cat <&3)
exec 3<&-
exec 3>&-
if ! printf '%s' "$view_response" | grep -q '"jobComplete":true'; then
  echo "failed to create paid_orders view" >&2
  printf '%s\n' "$view_response" >&2
  exit 1
fi

wait "${pid}"
