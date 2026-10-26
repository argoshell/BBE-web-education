import { lazy, Suspense, useEffect, useState } from 'react';

// Each agent page is loaded on demand so the first page loads quickly
const WalkerPage = lazy(() => import('./ui/agents/legged/WalkerPage').then((m) => ({ default: m.WalkerPage })));
const VisualPage = lazy(() => import('./ui/agents/visual/VisualPage').then((m) => ({ default: m.VisualPage })));
const GuidedPage = lazy(() => import('./ui/agents/visual/GuidedPage').then((m) => ({ default: m.GuidedPage })));
const OscillatorPage = lazy(() => import('./ui/agents/oscillator/OscillatorPage').then((m) => ({ default: m.OscillatorPage })));
const ChemotaxisPage = lazy(() => import('./ui/agents/chemotaxis/ChemotaxisPage').then((m) => ({ default: m.ChemotaxisPage })));
import { AboutPage } from './ui/AboutPage';
import { parseHash } from './ui/urlState';

const pages = [
  { id: 'oscillator', label: 'Oscillator', ready: true },
  { id: 'walker', label: 'One-legged walker', ready: true },
  { id: 'visual', label: 'Visual categorizer', ready: true },
  { id: 'guided', label: 'Visually guided tasks', ready: true },
  { id: 'chemotaxis', label: 'Klinotaxis (C. elegans)', ready: true },
  { id: 'about', label: 'About', ready: true },
];

export default function App() {
  const [page, setPage] = useState(() => parseHash().page);
  useEffect(() => {
    const onHash = () => setPage(parseHash().page);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <>
      <header className="app-header">
        <h1>Evolutionary Agents</h1>
        <nav>
          {pages.map((p) => (
            <button key={p.id} className="tab" aria-current={page === p.id ? 'page' : undefined} disabled={!p.ready}
              title={p.ready ? undefined : 'Coming soon'} onClick={() => { window.location.hash = `#/${p.id}`; }}>
              {p.label}{!p.ready && ' (soon)'}
            </button>
          ))}
        </nav>
        <div className="spacer" />
        <span className="muted small">Web port of Randall Beer's EvolutionaryAgents</span>
      </header>
      <Suspense fallback={<p className="muted" style={{ padding: 16 }}>Loading…</p>}>
        {page === 'about' ? <AboutPage /> : page === 'visual' ? <VisualPage key="visual" /> : page === 'guided' ? <GuidedPage key="guided" /> : page === 'chemotaxis' ? <ChemotaxisPage key="chemotaxis" /> : page === 'oscillator' ? <OscillatorPage key="oscillator" /> : <WalkerPage key="walker" />}
      </Suspense>
    </>
  );
}
