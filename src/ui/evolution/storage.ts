// Persist the latest evolution run per agent in IndexedDB so a reload doesn't lose it.
// Every call is best-effort: storage may be unavailable (private mode, blocked site data).

import type { RunFile } from './controller';

const DB = 'beer-web';
const STORE = 'runs';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRun(agentId: string, run: RunFile | null): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      if (run) tx.objectStore(STORE).put(run, agentId);
      else tx.objectStore(STORE).delete(agentId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}

export async function loadRun(agentId: string): Promise<RunFile | null> {
  try {
    const db = await open();
    const run = await new Promise<RunFile | null>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(agentId);
      req.onsuccess = () => resolve((req.result as RunFile) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return run;
  } catch {
    return null;
  }
}
