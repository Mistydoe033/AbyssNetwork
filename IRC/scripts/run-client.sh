#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IRC_DIR="$ROOT_DIR/IRC"

exec npm --prefix "$IRC_DIR/client" run dev
