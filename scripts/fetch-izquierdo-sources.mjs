// Downloads Eduardo Izquierdo's C. elegans klinotaxis model (CE_orientation) into reference/
// (gitignored). The repository carries no license, so it is fetched rather than redistributed.
// Pinned to a commit so the fixtures stay reproducible.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const REPO = 'edizquierdo/CE_orientation';
const SHA = 'be69bd59c4657a2a9977e0b280116bf816bbf8b9';
const BASE = `https://raw.githubusercontent.com/${REPO}/${SHA}/`;
const FILES = [
  'WormAgent.cpp', 'WormAgent.h', 'main.cpp', 'CTRNN.cpp', 'CTRNN.h', 'TSearch.cpp', 'TSearch.h',
  'random.cpp', 'random.h', 'VectorMatrix.h', 'viz.py', 'makefile', 'README.md',
];
const dest = join(import.meta.dirname, '..', 'reference', 'ce-orientation');

await mkdir(dest, { recursive: true });
for (const f of FILES) {
  const res = await fetch(BASE + f);
  if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`);
  await writeFile(join(dest, f), Buffer.from(await res.arrayBuffer()));
  console.log('fetched', f);
}
