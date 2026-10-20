# beer_web

Web ports of Randall Beer's EvolutionaryAgents C++ (CTRNN, TSearch, agents) with interactive
analysis and in-browser evolution. Plan and status: `docs/PLAN.md`.

## Commands

- `npm run dev`: dev server (http://localhost:5173)
- `npm test`: Vitest (TS port vs. C++ fixtures, analysis, lineage)
- `npm run typecheck` / `npm run lint` / `npm run build`
- `npm run fixtures`: rebuild `tests/fixtures/*.json` from the original C++ via emscripten (needs emsdk in `../emsdk`)
- `npx tsx scripts/evolve.ts --agent walker|visual ...`: command-line evolution (used for presets)
- `node scripts/screenshot.mjs <url> <out.png>`: headless screenshot with local Chrome

## Rules

- Beer's C++ has no license: never commit it. `scripts/fetch-beer-sources.mjs` puts it in gitignored `reference/`.
- Ports must match the C++ **bit-for-bit**: same operation order, same random draws, same loop structure
  (e.g. `for (t = 0; t < T; t += dt)` gives 2001 steps for T=200, dt=0.1). Add a C++ harness in
  `native/harness/` and a fixture test for every ported class before building UI on it.
- Index conventions: TS is 0-based; CTRNN weights are row-major by source neuron (`w[from * n + to]`).
- Everything in `src/sim/` is worker-safe (no DOM/React); configs passed to workers must be structured-cloneable.

## Adding an agent

1. Port the body/environment to `src/sim/agents/<name>/` and test it against new C++ fixtures.
2. Implement `AgentModule` (`src/sim/agent.ts`): params, `simulate` → named channels, `circuitView`,
   genome (`genomeSize`/`decode`/`evaluate`/`genomeLabels`), optional `inputSweep`.
3. Register it in `src/sim/agents/registry.ts` (the evaluation workers look agents up there).
4. Build a page from `useExplorer` (`src/ui/agents/useExplorer.ts`), the generic `TraceStack`,
   `PhasePortrait`, `EvolutionPanel`, `CompareCard`, plus an agent-specific body view and controls
   (see `src/ui/agents/legged/` and `src/ui/agents/visual/`). Add it to `src/App.tsx`.

## Charts

Colors come from CSS tokens in `src/index.css` (validated categorical palette, light/dark).
Neuron identity uses fixed categorical slots (`neuronColor`); never reuse a slot for a different
meaning in the same view. Canvas views read tokens via `useTheme()`.
