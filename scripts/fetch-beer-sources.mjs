// Downloads Randall Beer's EvolutionaryAgents C++ sources into reference/ (gitignored).
// The original code carries no license, so it is fetched rather than redistributed.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = 'https://rdbeer.pages.iu.edu/Software/EvolutionaryAgents/';
const FILES = [
  'CTRNN.cpp', 'CTRNN.h', 'LeggedAgent.cpp', 'LeggedAgent.h', 'TSearch.cpp', 'TSearch.h',
  'VectorMatrix.h', 'random.cpp', 'random.h', 'VisualAgent.cpp', 'VisualAgent.h',
  'VisualObject.h', 'SimpleCTRNNMain.cpp', 'SimpleSearchMain.cpp', 'SimpleVisualMain.cpp',
  'SimpleWalkingMain.cpp', 'cpg.ns', 'categorize.ns', 'ReleaseNotes.txt',
  'CTRNNDoc.pdf', 'SearchDoc.pdf', 'AnimateWalk.nb',
];
const dest = join(import.meta.dirname, '..', 'reference', 'beer-evolutionary-agents');

await mkdir(dest, { recursive: true });
for (const f of FILES) {
  const res = await fetch(BASE + f);
  if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`);
  await writeFile(join(dest, f), Buffer.from(await res.arrayBuffer()));
  console.log('fetched', f);
}
