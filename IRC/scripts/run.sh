#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IRC_DIR="$ROOT_DIR/IRC"
SERVER_PORT="${IRC_SERVER_PORT:-7001}"
SERVER_URL="${IRC_SERVER_URL:-ws://127.0.0.1:${SERVER_PORT}}"

if [ ! -d "$IRC_DIR/server/node_modules" ] || [ ! -d "$IRC_DIR/client/node_modules" ]; then
  "$IRC_DIR/scripts/setup.sh"
fi

cleanup() {
  if [ -n "${SERVER_PID:-}" ] && kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

"$IRC_DIR/scripts/run-server.sh" &
SERVER_PID=$!

for _ in $(seq 1 30); do
  if (echo >/dev/tcp/127.0.0.1/"$SERVER_PORT") >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

VITE_IRC_SERVER_URL="$SERVER_URL" "$IRC_DIR/scripts/run-client.sh"
