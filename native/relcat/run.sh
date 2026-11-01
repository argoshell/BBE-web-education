#!/usr/bin/env bash
# Runs the original relcat Python (fetched into reference/relcat) in Docker and writes tests/fixtures/relcat.json.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
[ -f "$ROOT/reference/relcat/relcat/relcat.py" ] || node "$ROOT/scripts/fetch-relcat.mjs"
to_docker() { if command -v cygpath >/dev/null; then cygpath -w "$1"; else echo "$1"; fi; }
MSYS_NO_PATHCONV=1 docker run --rm -v "$(to_docker "$ROOT"):/work" python:3.12-slim \
  bash -c "pip install -q numpy==2.1.3 matplotlib==3.9.2 2>/dev/null && python /work/native/relcat/harness.py"
