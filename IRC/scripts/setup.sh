#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IRC_DIR="$ROOT_DIR/IRC"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but not found."
  exit 1
fi

npm --prefix "$IRC_DIR/server" install
npm --prefix "$IRC_DIR/client" install
npm --prefix "$IRC_DIR/server" install @abyss/irc-shared@file:../shared --force
npm --prefix "$IRC_DIR/client" install @abyss/irc-shared@file:../shared --force

echo "IRC setup complete."
