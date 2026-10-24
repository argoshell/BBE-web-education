// Downloads Eduardo Izquierdo's VisuallyGuidedAgent C++ (with Randall Beer and Matthew Setzler)
// into reference/visually-guided-agent/ (gitignored). The repository carries no license, so it is
// fetched at a pinned commit rather than redistributed. Only derived outputs (fixtures) are committed.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const REPO = 'edizquierdo/VisuallyGuidedAgent';
const SHA = 'df626aba72680620c04675d0364680c800f04033';
const BASE = `https://raw.githubusercontent.com/${REPO}/${SHA}/`;
const FILES = [
  'CTRNN.cpp', 'CTRNN.h', 'TSearch.cpp', 'TSearch.h', 'VectorMatrix.h', 'random.cpp', 'random.h',
  'VisualAgent.cpp', 'VisualAgent.h', 'VisualObject.h', 'main.cpp', 'makefile', 'runscript.py',
  'README.md',
];
const dest = join(import.meta.dirname, '..', 'reference', 'visually-guided-agent');

await mkdir(dest, { recursive: true });
for (const f of FILES) {
  const res = await fetch(BASE + f);
  if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`);
  await writeFile(join(dest, f), Buffer.from(await res.arrayBuffer()));
  console.log('fetched', f);
}
