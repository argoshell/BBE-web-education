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

# C. elegans klinotaxis: Eduardo Izquierdo's CE_orientation (its own copies of CTRNN/TSearch/random),
# fetched separately into reference/ce-orientation. The genomes of this project's evolved presets
# (derived data) are compiled in so the C++ also runs circuits that really perform klinotaxis.
CE="$ROOT/reference/ce-orientation"
[ -f "$CE/WormAgent.cpp" ] || node "$ROOT/scripts/fetch-izquierdo-sources.mjs"
node -e '
const g = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).map((p) => p.genome);
console.log("const int NumEvolvedGenomes = " + g.length + ";");
console.log("static const double EvolvedGenomes[" + Math.max(1, g.length) + "][93] = {" +
  (g.length ? g.map((r) => "{" + r.join(",") + "}").join(",") : "{0}") + "};");
' "$ROOT/src/sim/agents/chemotaxis/evolvedPresets.json" > "$OUT/chemotaxis_genomes.inc"
CE_FLAGS=(-O2 -std=c++14 -w -I"$CE" -I"$OUT" -sENVIRONMENT=node -sNODERAWFS=1 -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=4MB)
em++ "${CE_FLAGS[@]}" "$CE/CTRNN.cpp" "$CE/WormAgent.cpp" "$CE/TSearch.cpp" "$CE/random.cpp" \
  "$ROOT/native/harness/chemotaxis_fixtures.cpp" -o "$OUT/chemotaxis_fixtures.cjs"
node "$OUT/chemotaxis_fixtures.cjs" > "$ROOT/tests/fixtures/chemotaxis.json"

for f in reference visual chemotaxis; do
  node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); console.log(process.argv[2]+':', Object.keys(j).join(', '))" \
    "$ROOT/tests/fixtures/$f.json" "$f"
done
