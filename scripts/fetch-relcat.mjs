// Downloads Nathaniel Rodriguez's relcat (relational categorization task of Williams, Beer & Gasser 2008 and
// Williams & Beer 2013) into reference/relcat (gitignored) at a pinned commit. It has no license, so it is
// fetched for generating reference fixtures, not redistributed.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SHA = 'e12fc8473e63027af248c808afeb73dab1ea7b17';
const FILES = ['relcat/__init__.py', 'relcat/relcat.py', 'relcat/sensor_agent.py', 'relcat/sensor_ctrnn.py', 'relcat/visual_objects.py', 'setup.py', 'README.rst'];
const dest = join(import.meta.dirname, '..', 'reference', 'relcat');
for (const f of FILES) {
  const res = await fetch(`https://raw.githubusercontent.com/Nathaniel-Rodriguez/relcat/${SHA}/${f}`);
  if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`);
  const out = join(dest, f);
  await mkdir(join(out, '..'), { recursive: true });
  await writeFile(out, Buffer.from(await res.arrayBuffer()));
  console.log('fetched', f);
}
