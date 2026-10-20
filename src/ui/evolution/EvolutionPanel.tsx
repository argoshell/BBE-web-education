// Run TSearch for any agent and browse the results.

import { useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { AnyAgentModule } from '../../sim/agent';
import { defaultSearchConfig, type SearchConfig } from '../../sim/core/tsearch';
import { CheckField, IntField, NumberField, SelectField } from '../components/controls';
import { fmt } from '../plot';
import { controllerFor, type RunFile } from './controller';
import { AncestorChain, FitnessChart, PopulationScatter } from './views';

type SearchSettings = Omit<SearchConfig, 'vectorSize'>;

interface Props {
  agent: AnyAgentModule;
  evoConfig: unknown;
  agentConfig: ReactNode;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onPin: (id: number) => void;
}

export function useEvolution(agentId: string) {
  const ctl = controllerFor(agentId);
  const version = useSyncExternalStore(ctl.subscribe, ctl.getVersion);
  return { ctl, version };
}

export function EvolutionPanel({ agent, evoConfig, agentConfig, selectedId, onSelect, onPin }: Props) {
  const { ctl, version } = useEvolution(agent.id);
  const [search, setSearch] = useState<SearchSettings>({ ...defaultSearchConfig });
  const [tab, setTab] = useState<'fitness' | 'lineage' | 'population'>('fitness');
  const fileRef = useRef<HTMLInputElement>(null);
  const run = ctl.run;
  const set = <K extends keyof SearchSettings>(k: K, v: SearchSettings[K]) => setSearch((s) => ({ ...s, [k]: v }));
  const busy = ctl.status === 'running' || ctl.status === 'paused';
  const genomeSize = agent.genomeSize(evoConfig);
  const last = run?.generations[run.generations.length - 1];
  const progress = run ? (last?.gen ?? 0) / Math.max(1, run.search.maxGenerations) : 0;

  const download = () => {
    const f = ctl.toFile();
    if (!f) return;
    const blob = new Blob([JSON.stringify(f)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${agent.id}-run-seed${f.search.seed}-gen${f.generations.length - 1}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2>Evolution</h2>
        <span className="muted small">TSearch · {genomeSize} genes</span>
        <div className="spacer" />
        {run && <span className="small num secondary">
          gen {last?.gen ?? 0}/{run.search.maxGenerations} · best {fmt(last?.bestSoFar ?? 0, 4)}
          {ctl.status === 'running' && ` · ${Math.round(ctl.evalsPerSecond)} evals/s`}
          {ctl.status === 'loaded' && ' · loaded from file'}
        </span>}
      </div>
      <div className="evo-grid">
        <div>
          <details className="section" open>
            <summary>Genome</summary>
            <div className="section-body">{agentConfig}</div>
          </details>
          <details className="section" open>
            <summary>Search</summary>
            <div className="section-body">
              <IntField label="population" value={search.populationSize} min={2} max={2000} onChange={(v) => set('populationSize', v)} />
              <IntField label="generations" value={search.maxGenerations} min={1} max={100000} onChange={(v) => set('maxGenerations', v)} />
              <IntField label="seed" value={search.seed} min={0} max={2147483646} onChange={(v) => set('seed', v)} />
              <SelectField label="reproduction" value={search.reproduction} onChange={(v) => set('reproduction', v)}
                options={[{ value: 'ga', label: 'Genetic algorithm' }, { value: 'hill', label: 'Parallel hill climbing' }]} />
              <SelectField label="selection" value={search.selection} onChange={(v) => set('selection', v)}
                options={[{ value: 'rank', label: 'Rank-based' }, { value: 'fitprop', label: 'Fitness-proportionate' }]} />
              <NumberField label="mutation var" value={search.mutationVariance} min={0.001} max={1} step={0.001} onChange={(v) => set('mutationVariance', Math.max(1e-6, v))} />
              <NumberField label="elitism" value={search.elitistFraction} min={0} max={0.5} step={0.01} onChange={(v) => set('elitistFraction', Math.max(0, Math.min(1, v)))} />
              <NumberField label="max offspring" value={search.maxExpectedOffspring} min={1} max={2} step={0.01} onChange={(v) => set('maxExpectedOffspring', Math.max(1, Math.min(2, v)))} />
              <NumberField label="crossover p" value={search.crossoverProbability} min={0} max={1} step={0.01} onChange={(v) => set('crossoverProbability', Math.max(0, Math.min(1, v)))} />
              {search.crossoverProbability > 0 && (
                <SelectField label="crossover" value={search.crossover} onChange={(v) => set('crossover', v)}
                  options={[{ value: 'twopoint', label: 'Two-point' }, { value: 'uniform', label: 'Uniform' }]} />
              )}
              <div className="inline">
                <CheckField label="clip to [-1, 1]" value={search.constrain} onChange={(v) => set('constrain', v)} />
                <CheckField label="re-evaluate" value={search.reEvaluate} onChange={(v) => set('reEvaluate', v)} />
              </div>
            </div>
          </details>
          <div className="inline" style={{ marginTop: 8 }}>
            {!busy && <button className="btn primary" disabled={genomeSize === 0} onClick={() => void ctl.start(agent, structuredClone(evoConfig), search)}>
              {run ? 'Start new run' : 'Start evolution'}</button>}
            {ctl.status === 'running' && <button className="btn" onClick={() => ctl.pause()}>Pause</button>}
            {ctl.status === 'paused' && <button className="btn primary" onClick={() => ctl.resume()}>Resume</button>}
            {busy && <button className="btn" onClick={() => ctl.reset()}>Stop</button>}
            {ctl.status === 'done' && <button className="btn" onClick={() => ctl.extend(search.maxGenerations)}>+{search.maxGenerations} gens</button>}
          </div>
          <div className="inline" style={{ marginTop: 8 }}>
            <button className="btn small" disabled={!run} onClick={download}>Export run</button>
            <button className="btn small" disabled={busy} onClick={() => fileRef.current?.click()}>Import run…</button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const file = JSON.parse(await f.text()) as RunFile;
                if (file.agentId !== agent.id) throw new Error(`This run is for agent "${file.agentId}"`);
                ctl.load(file);
              } catch (err) { alert(String(err)); }
            }} />
          </div>
          {ctl.error && <p className="error small">{ctl.error}</p>}
          {genomeSize === 0 && <p className="note">This controller has no evolvable parameters.</p>}
        </div>
        <div style={{ minWidth: 0 }}>
          {run && <div className="progress" style={{ marginBottom: 8 }}><div style={{ width: `${progress * 100}%` }} /></div>}
          <div className="tabs" role="tablist">
            {(['fitness', 'lineage', 'population'] as const).map((t) => (
              <button key={t} role="tab" className="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                {{ fitness: 'Fitness', lineage: 'Lineage', population: 'Population' }[t]}
              </button>
            ))}
          </div>
          {!run ? (
            <p className="muted">Configure the genome and search, then start a run. Every individual is kept, so you can
              click any point to load it into the views above, follow its ancestry, and pin individuals to compare.</p>
          ) : tab === 'fitness' ? (
            <FitnessChart run={run} version={version} selectedId={selectedId} onSelect={onSelect} />
          ) : tab === 'lineage' ? (
            <AncestorChain run={run} version={version} selectedId={selectedId} onSelect={onSelect} onPin={onPin} />
          ) : (
            <PopulationScatter run={run} version={version} selectedId={selectedId} onSelect={onSelect} />
          )}
        </div>
      </div>
    </div>
  );
}
