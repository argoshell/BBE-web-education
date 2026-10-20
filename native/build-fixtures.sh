#!/usr/bin/env bash
# Builds Beer's original C++ (from reference/) plus the fixture harness with emscripten,
# runs it under node and writes tests/fixtures/reference.json.
# Requires emsdk: set EMSDK or install it next to this repo (../emsdk).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/reference/beer-evolutionary-agents"
OUT="$ROOT/native/build"
EMSDK_DIR="${EMSDK:-$ROOT/../emsdk}"

[ -f "$SRC/CTRNN.cpp" ] || node "$ROOT/scripts/fetch-beer-sources.mjs"
# shellcheck disable=SC1091
source "$EMSDK_DIR/emsdk_env.sh" >/dev/null 2>&1
mkdir -p "$OUT" "$ROOT/tests/fixtures"

em++ -O2 -std=c++14 -Wno-register -Wno-deprecated -w \
  -I"$SRC" "$SRC/CTRNN.cpp" "$SRC/LeggedAgent.cpp" "$SRC/TSearch.cpp" "$SRC/random.cpp" \
  "$ROOT/native/harness/fixtures.cpp" \
  -sENVIRONMENT=node -sNODERAWFS=1 -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=4MB \
  -o "$OUT/fixtures.cjs"

(cd "$SRC" && node "$OUT/fixtures.cjs") > "$ROOT/tests/fixtures/reference.json"
node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); console.log('fixtures:', Object.keys(j).join(', '))" "$ROOT/tests/fixtures/reference.json"
