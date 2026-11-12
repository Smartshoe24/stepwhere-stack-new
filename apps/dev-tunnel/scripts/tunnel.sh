#!/usr/bin/env bash
# Exposes the local API server on the persistent Pinggy dev domain that the
# dev firmware posts to. Started by the root `pnpm dev` alongside server/admin.
set -uo pipefail

cd "$(dirname "$0")/.."

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

PINGGY_BIN="${PINGGY_BIN:-bin/pinggy}"
PINGGY_DOMAIN="${PINGGY_DOMAIN:-npafhgmeij.a.pinggy.link}"
TUNNEL_PORT="${TUNNEL_PORT:-8223}"

# Exit 0 on missing setup so turbo keeps the server and admin running.
if [[ -z "${PINGGY_TOKEN:-}" ]]; then
  echo "[tunnel] PINGGY_TOKEN is not set; copy .env.example to apps/dev-tunnel/.env.local. Tunnel disabled."
  exit 0
fi
if [[ ! -x "$PINGGY_BIN" ]]; then
  echo "[tunnel] Pinggy CLI not found at $PINGGY_BIN; copy it there or set PINGGY_BIN. Tunnel disabled."
  exit 0
fi

echo "[tunnel] http://$PINGGY_DOMAIN -> localhost:$TUNNEL_PORT"

# Report once the server answers through the tunnel. The firmware needs a
# direct 200 over plain HTTP, so redirects are not followed.
(
  last=""
  while true; do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://$PINGGY_DOMAIN/health" || true)"
    if [[ "$code" != "$last" ]]; then
      echo "[tunnel] http://$PINGGY_DOMAIN/health -> HTTP $code"
      last="$code"
    fi
    sleep 5
  done
) &
health_pid=$!

# The CLI reconnects on its own; run it in the background so a stop signal
# from turbo reaches both it and the health check.
"$PINGGY_BIN" -p 443 -R0:localhost:"$TUNNEL_PORT" \
  -o StrictHostKeyChecking=no -o ServerAliveInterval=30 \
  "$PINGGY_TOKEN@pro.pinggy.io" &
pinggy_pid=$!

# SIGTERM makes the CLI close the tunnel on Pinggy's side before exiting.
cleanup() {
  kill -TERM "$pinggy_pid" "$health_pid" 2>/dev/null
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    kill -0 "$pinggy_pid" 2>/dev/null || exit 0
    sleep 0.5
  done
  kill -KILL "$pinggy_pid" 2>/dev/null
  exit 0
}
trap cleanup INT TERM HUP

wait "$pinggy_pid"
status=$?
kill "$health_pid" 2>/dev/null
exit "$status"
