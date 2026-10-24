import { useEffect, useState } from 'react';
import { WalkerPage } from './ui/agents/legged/WalkerPage';
import { VisualPage } from './ui/agents/visual/VisualPage';
import { OscillatorPage } from './ui/agents/oscillator/OscillatorPage';
import { ChemotaxisPage } from './ui/agents/chemotaxis/ChemotaxisPage';
import { AboutPage } from './ui/AboutPage';
import { parseHash } from './ui/urlState';

const pages = [
  { id: 'oscillator', label: 'Oscillator', ready: true },
  { id: 'walker', label: 'One-legged walker', ready: true },
  { id: 'visual', label: 'Visual categorizer', ready: true },
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
      {page === 'about' ? <AboutPage /> : page === 'visual' ? <VisualPage key="visual" /> : page === 'chemotaxis' ? <ChemotaxisPage key="chemotaxis" /> : page === 'oscillator' ? <OscillatorPage key="oscillator" /> : <WalkerPage key="walker" />}
    </>
  );
}
