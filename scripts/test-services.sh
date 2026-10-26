#!/usr/bin/env bash
# Start or stop the Docker Compose clusters used by adapter tests.
# Usage: scripts/test-services.sh start|stop

set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"

if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker is required to manage adapter test clusters" >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "error: docker compose v2 is required (the \`docker compose\` plugin)" >&2
  exit 1
fi

compose=(docker compose -p dash-test -f docker-compose.test.yml)

action=${1:-}
case "$action" in
  start)
    "${compose[@]}" up -d --wait --remove-orphans
    echo "PostgreSQL test cluster is ready at postgres://dash:dash@127.0.0.1:${DASH_TEST_POSTGRES_PORT:-54329}/dash"
    echo "MongoDB test cluster is ready at mongodb://dash:dash@127.0.0.1:${DASH_TEST_MONGODB_PORT:-27029}/dash?authSource=admin"
    ;;
  stop)
    "${compose[@]}" down --volumes --remove-orphans
    echo "Adapter test clusters stopped."
    ;;
  *)
    echo "usage: scripts/test-services.sh start|stop" >&2
    exit 1
    ;;
esac
