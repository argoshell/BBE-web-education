// UI blocks shared by agent explorer pages.

import type { ReactNode } from 'react';
import type { AnyAgentModule } from '../../sim/agent';
import type { EvolutionController } from '../evolution/controller';
import { GenomeDiff } from '../evolution/views';
import { fmt } from '../plot';
import type { LoadedIndividual, Pin } from './useExplorer';

export function LoadedBanner({ loaded, onPin, onRevert }: { loaded: LoadedIndividual | null; onPin: (id: number) => void; onRevert: (id: number) => void }) {
  if (!loaded) return null;
  return (
    <div className="note inline" style={{ marginBottom: 8 }}>
      Viewing evolved individual <b>#{loaded.id}</b> (born generation {loaded.born}, fitness {fmt(loaded.perf, 4)})
      {loaded.modified && <span> · <b>modified</b> since loading</span>}
      <div style={{ flex: 1 }} />
      <button className="btn small" onClick={() => onPin(loaded.id)}>Pin to compare</button>
      {loaded.modified && <button className="btn small" onClick={() => onRevert(loaded.id)}>Revert</button>}
    </div>
  );
}

interface CompareProps<P> {
  agent: AnyAgentModule;
  ctl: EvolutionController;
  pins: Pin<P>[];
  colors: string[];
  /** Summary columns: label and value extractor. */
  columns: { label: string; value: (p: Pin<P>) => string }[];
  onSelect: (id: number) => void;
  onUnpin: (id: number) => void;
  onClear: () => void;
  children?: ReactNode;
}

export function CompareCard<P>({ agent, ctl, pins, colors, columns, onSelect, onUnpin, onClear, children }: CompareProps<P>) {
  if (pins.length === 0) return null;
  return (
    <div className="card">
      <div className="card-head">
        <h2>Compare pinned individuals</h2>
        <span className="muted small">up to 3</span>
        <div className="spacer" />
        <button className="btn small" onClick={onClear}>Clear</button>
      </div>
      <table className="data" style={{ marginBottom: 8 }}>
        <thead><tr><th>individual</th>{columns.map((c) => <th key={c.label} className="num">{c.label}</th>)}<th></th></tr></thead>
        <tbody>
          {pins.map((p, k) => (
            <tr key={p.id} className="clickable" onClick={() => onSelect(p.id)}>
              <td><span className="swatch" style={{ background: colors[k], marginRight: 6 }} />{p.label}</td>
              {columns.map((c) => <td key={c.label} className="num">{c.value(p)}</td>)}
              <td><button className="btn small" onClick={(e) => { e.stopPropagation(); onUnpin(p.id); }}>unpin</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {children}
      <h3 style={{ margin: '10px 0 4px' }}>Genome differences</h3>
      {ctl.run && <GenomeDiff labels={agent.genomeLabels(ctl.run.evoConfig)}
        items={pins.flatMap((p, k) => { const a = ctl.run!.archive.get(p.id); return a ? [{ label: p.label, color: colors[k], rec: a }] : []; })} />}
    </div>
  );
}
