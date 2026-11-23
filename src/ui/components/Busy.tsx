// Indicators for results computed in the background: a small "updating" chip, and a wrapper that dims
// results while newer ones are on their way.

export function Busy({ pending, ms, label = 'updating…' }: { pending: boolean; ms?: number; label?: string }) {
  if (!pending) return null;
  return (
    <span className="busy small" title={ms !== undefined ? `computing in the background (the last update took ${Math.round(ms)} ms)` : 'computing in the background'}>
      <span className="busy-dot" aria-hidden="true" />{label || <span className="visually-hidden">updating</span>}
    </span>
  );
}

export function Stale({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return <div style={{ opacity: pending ? 0.55 : 1, transition: 'opacity 0.2s' }}>{children}</div>;
}
