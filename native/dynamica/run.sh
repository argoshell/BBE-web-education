#!/usr/bin/env bash
# Runs Beer's Dynamica in the Free Wolfram Engine (official Docker image) to produce reference
# results for the site's dynamics analyses: tests/fixtures/dynamica.json.
#
# One-time setup (needs your own Wolfram ID; the free engine license is per user):
#   docker run -it --rm -v "<license dir>:/home/wolframengine/.WolframEngine/Licensing" \
#     wolframresearch/wolframengine wolframscript -activate
# The license dir defaults to ../wolfram-license next to this repo (keep it out of git).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LICENSE_DIR="${WOLFRAM_LICENSE_DIR:-$ROOT/../wolfram-license}"
[ -f "$ROOT/reference/dynamica/Dynamica.m" ] || node "$ROOT/scripts/fetch-dynamica.mjs"
to_docker() { if command -v cygpath >/dev/null; then cygpath -w "$1"; else echo "$1"; fi; }
MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$(to_docker "$LICENSE_DIR"):/home/wolframengine/.WolframEngine/Licensing" \
  -v "$(to_docker "$ROOT"):/work" \
  wolframresearch/wolframengine wolframscript -file /work/native/dynamica/reference.wl
