#!/usr/bin/env bash
# Builds Beer's original C++ (from reference/) plus the fixture harnesses with emscripten,
# runs them under node and writes tests/fixtures/*.json.
# Requires emsdk: set EMSDK or install it next to this repo (../emsdk).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/reference/beer-evolutionary-agents"
OUT="$ROOT/native/build"
EMSDK_DIR="${EMSDK:-$ROOT/../emsdk}"

[ -f "$SRC/CTRNN.cpp" ] || node "$ROOT/scripts/fetch-beer-sources.mjs"
# In CI the emsdk action already puts em++ on PATH (EMSDK_SKIP_ENV=1)
if [ -z "${EMSDK_SKIP_ENV:-}" ]; then
  # shellcheck disable=SC1091
  source "$EMSDK_DIR/emsdk_env.sh" >/dev/null 2>&1
fi
mkdir -p "$OUT" "$ROOT/tests/fixtures"

FLAGS=(-O2 -std=c++14 -w -I"$SRC" -sENVIRONMENT=node -sNODERAWFS=1 -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=4MB)

# Walker, CTRNN, RandomState and TSearch
em++ "${FLAGS[@]}" "$SRC/CTRNN.cpp" "$SRC/LeggedAgent.cpp" "$SRC/TSearch.cpp" "$SRC/random.cpp" \
  "$ROOT/native/harness/fixtures.cpp" -o "$OUT/fixtures.cjs"
(cd "$SRC" && node "$OUT/fixtures.cjs") > "$ROOT/tests/fixtures/reference.json"

# Visual categorization agent
em++ "${FLAGS[@]}" "$SRC/CTRNN.cpp" "$SRC/VisualAgent.cpp" "$SRC/random.cpp" \
  "$ROOT/native/harness/visual_fixtures.cpp" -o "$OUT/visual_fixtures.cjs"
(cd "$SRC" && node "$OUT/visual_fixtures.cjs") > "$ROOT/tests/fixtures/visual.json"

# Izquierdo/Beer/Setzler VisuallyGuidedAgent: size discrimination and perceiving affordances
IZQ="$ROOT/reference/visually-guided-agent"
[ -f "$IZQ/main.cpp" ] || node "$ROOT/scripts/fetch-izquierdo-visual.mjs"
em++ -O2 -std=c++14 -w -I"$IZQ" -sENVIRONMENT=node -sNODERAWFS=1 -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=4MB \
  "$IZQ/CTRNN.cpp" "$IZQ/VisualAgent.cpp" "$IZQ/TSearch.cpp" "$IZQ/random.cpp" \
  "$ROOT/native/harness/guided_fixtures.cpp" -o "$OUT/guided_fixtures.cjs"
node "$OUT/guided_fixtures.cjs" > "$ROOT/tests/fixtures/visual-tasks.json"

for f in reference visual visual-tasks; do
  node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); console.log(process.argv[2]+':', Object.keys(j).join(', '))" \
    "$ROOT/tests/fixtures/$f.json" "$f"
done
