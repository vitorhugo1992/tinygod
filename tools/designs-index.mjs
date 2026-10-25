// Writes designs/index.json: the designs Claude left in designs/ (marked from: 'Claude'), for the sandbox's
// 📥 From Claude on the website, where there is no sandbox server to list them. Run after writing one, then push.
//   node tools/designs-index.mjs
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'designs');
const out = [];
for (const f of await readdir(DIR)) {
  if (!f.endsWith('.json') || f === 'index.json') continue;
  try { const j = JSON.parse(await readFile(join(DIR, f), 'utf8')); if (j.from === 'Claude' && j.design) out.push({ name: j.name, note: j.note, design: j.design }); } catch { /* not a design */ }
}
await writeFile(join(DIR, 'index.json'), JSON.stringify(out));
console.log(`designs/index.json: ${out.length} from Claude (${out.map((d) => d.name).join(', ')})`);
