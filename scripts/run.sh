#!/usr/bin/env bash
#
# Run LearnHarness from source as a desktop window (Linux, macOS).
#
#   bash scripts/run.sh
#
# Installs dependencies on first run (npm ci), starts the Next dev server
# on 127.0.0.1:3000 in the background unless one is already answering
# there, then opens the Electron window against it. Closing the window
# leaves the server running so the next launch is fast; stop it with
# `pkill -f "next dev -H 127.0.0.1 -p 3000"`. Server log: $TMPDIR/lh-dev.log.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
URL="http://127.0.0.1:3000"
LOG="${TMPDIR:-/tmp}/lh-dev.log"

command -v npm >/dev/null || { echo "error: Node.js is not installed (https://nodejs.org, version 22 or newer)" >&2; exit 1; }
command -v curl >/dev/null || { echo "error: curl is required" >&2; exit 1; }
cd "$ROOT"

if [ ! -d node_modules ]; then
	echo "Installing dependencies (first run)…"
	npm ci
fi

up() { curl -fsS -o /dev/null --max-time 5 "$URL/api/settings"; }

if ! up; then
	echo "Starting the dev server (log: $LOG)…"
	nohup npx next dev -H 127.0.0.1 -p 3000 >"$LOG" 2>&1 &
	for _ in $(seq 120); do up && break; sleep 1; done
	up || { echo "error: the dev server did not start within 2 minutes; see $LOG" >&2; exit 1; }
fi

# An inherited ELECTRON_RUN_AS_NODE turns Electron into plain Node.
unset ELECTRON_RUN_AS_NODE
echo "Opening the LearnHarness window…"
LH_DEV_URL="$URL" exec npx electron .
