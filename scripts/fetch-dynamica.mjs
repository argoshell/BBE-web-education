// Downloads Randall Beer's Dynamica package (Mathematica) into reference/dynamica (gitignored).
// It has no license, so it is fetched for generating reference results, not redistributed.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = 'https://rdbeer.pages.iu.edu/Software/Dynamica/';
const dest = join(import.meta.dirname, '..', 'reference', 'dynamica');
await mkdir(dest, { recursive: true });
for (const f of ['Dynamica.m', 'ReleaseNotes.txt']) {
  const res = await fetch(BASE + f);
  if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`);
  await writeFile(join(dest, f), Buffer.from(await res.arrayBuffer()));
  console.log('fetched', f);
}
