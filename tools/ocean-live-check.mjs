// Does the live Ocean in a browser match the nightly run? (2026-11-19) Loads ocean/world.json.gz as the page's worker
// does (sandbox/ocean-worker.js), runs n steps and prints the fingerprint of the whole state; the page's worker, sent
// { type: 'steps', n }, prints the same if the browser computes bit for bit as Node.
//   node tools/ocean-live-check.mjs [steps = 10000] [--dir=ocean] [--every=k: a fingerprint every k steps]
//     [--text=file: the final state, to compare with the worker's]
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { PARAMS } from '../sim/params.js';
import { stepWorld } from '../sim/world.js';
import { loadState, saveState } from '../sim/save.js';

const opt = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const dir = opt('dir', 'ocean'), every = Number(opt('every', 0)), textTo = opt('text', null);
const n = Number(process.argv.slice(2).find((a) => !a.startsWith('--')) || 10000);
const world = loadState(gunzipSync(readFileSync(new URL(`../${dir}/world.json.gz`, import.meta.url))).toString('utf8')).world;
if (world.cap) PARAMS.grow.cap = world.cap;
const fp = (w) => { const s = saveState({ world: w }); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); };
console.log(`loaded: ${world.cells.length} cells, step ${world.steps}, fingerprint ${fp(world)}`);
const t0 = performance.now();
for (let k = 1; k <= n; k++) {
  stepWorld(world); if (world.gone) world.gone.length = 0;
  if (every && k % every === 0) console.log(`  step ${world.steps}: ${fp(world)}`);
}
const ms = performance.now() - t0;
if (textTo) writeFileSync(textTo, saveState({ world }));
console.log(`after ${n} steps (${n * PARAMS.time.dt} sim s): ${world.cells.length} cells, fingerprint ${fp(world)}, ${Math.round(ms / (n * PARAMS.time.dt))} ms per sim second`);
