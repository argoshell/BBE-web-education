# beer_web

Interactive web ports of Randall Beer's evolutionary agent simulations
([EvolutionaryAgents](https://rdbeer.pages.iu.edu/): CTRNN, TSearch, LeggedAgent, …).

Three agents so far: a bodiless **CTRNN oscillator** (central pattern generator), the **one-legged walker**, and the
**visual categorizer** (Beer 2003). For each:

- an animated body/arena, neural traces, and a phase portrait with flow, nullclines and fixed points
  for any two neurons, all linked to one time cursor (plus equilibria-vs-leg-angle sweeps for sensory walkers,
  an all-trials overview for the categorizer, and cycle statistics, a frequency spectrum and parameter-space maps
  for the oscillator);
- every parameter (time constants, biases, gains, weights, sensor weights, body constants) is editable live;
- evolution runs in the browser (TSearch on Web Workers). Every individual is kept, so you can load any of them,
  follow ancestor chains, explore the whole population, and pin up to three individuals to compare gaits,
  trajectories and genomes;
- the URL encodes the current walker, so links are shareable.

See [docs/PLAN.md](docs/PLAN.md) for the architecture and roadmap.

## Development

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest: TS port vs. fixtures from the original C++
npm run build      # static site in dist/
```

Evolve walkers from the command line (used to make the presets):

```sh
npx tsx scripts/evolve.ts --controller cpg --size 5 --pop 96 --gens 250 --seed 2
```

## Fidelity to the original C++

The original C++ is **not redistributed** here (it has no license). `npm run fetch-sources` downloads it
into `reference/` (gitignored). `npm run fixtures` compiles it plus `native/harness/fixtures.cpp` with
[emscripten](https://emscripten.org/), runs it under Node, and writes `tests/fixtures/reference.json`. The
tests compare the TypeScript port against those fixtures: RandomState, CTRNN (Euler and RK4), all
LeggedAgent step variants, the visual agent and several TSearch runs agree with the C++: random numbers bit-for-bit,
integrated trajectories to within floating-point rounding (`Math.exp` can differ from the C library's `exp` in the last bit,
e.g. 3e-16 after thousands of steps; many fixtures, such as the `cpg.ns` walker, still match exactly).

`npm run fixtures` expects emsdk in `../emsdk` (or set `EMSDK`). In CI, the `reference-fixtures` job rebuilds the
fixtures and fails if they change.

## Adding an agent

Implement `AgentModule` (`src/sim/agent.ts`): parameters, simulation into named channels, genome
encoding and fitness. Register it in `src/sim/agents/registry.ts` so the evaluation workers can find it.
The trace, phase-portrait, evolution and lineage views are generic; an agent page only adds its body view
and parameter panel (see `src/ui/agents/legged/`).

## Deploying

`.github/workflows/pages.yml` builds and deploys to GitHub Pages on every push to `main`
(enable Pages → "GitHub Actions" in the repository settings).
