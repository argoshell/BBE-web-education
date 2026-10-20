// Encode page state into the URL hash so configurations can be shared: #/<page>?s=<base64url JSON>

export function parseHash(): { page: string; state: unknown } {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [page, query = ''] = h.split('?');
  const s = new URLSearchParams(query).get('s');
  let state: unknown = null;
  if (s) {
    try {
      const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
      state = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
    } catch {
      state = null;
    }
  }
  return { page: page || 'walker', state };
}

export function hashFor(page: string, state?: unknown): string {
  if (state === undefined) return `#/${page}`;
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const s = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `#/${page}?s=${s}`;
}

let timer = 0;
/** Update the hash without adding history entries (debounced). */
export function writeHash(page: string, state: unknown) {
  clearTimeout(timer);
  timer = window.setTimeout(() => history.replaceState(null, '', hashFor(page, state)), 300);
}
