// How much luck is in a ladder match? Each pairing over many seeds: how often the winner flips, how often the two
// species touch at all (a tube latch, a swallow, a harpoon hit, a kill).
//   node tools/ladder-noise.mjs [--seeds=10] [--width=1600] [--days=2] [--each=2] [--pool=8]
import { readFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
const opt = (k, v) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? Number(a.slice(k.length + 3)) : v; };
const ROOT = new URL('../', import.meta.url), d = (f) => JSON.parse(readFileSync(new URL(f, ROOT), 'utf8')).design;
const S = { 'Needle Drifter': 'tournament/fixer-blind-opus2.json', 'Deepdweller II': 'designs/deepdweller2.json', Raptilla: 'designs/raptilla.json',
  'Nutricline Bobber': 'tournament/bobber-blind-opus.json', Noctilla: 'designs/noctilla.json', Plebella: 'designs/plebella.json' };
const PAIRS = [['Needle Drifter', 'Deepdweller II'], ['Raptilla', 'Nutricline Bobber'], ['Noctilla', 'Plebella'], ['Deepdweller II', 'Nutricline Bobber']];
const seeds = opt('seeds', 10), width = opt('width', 0), days = opt('days', 2), each = opt('each', 2), pool = opt('pool', 8);
const jobs = [];
for (const [a, b] of PAIRS) for (let s = 1; s <= seeds; s++) jobs.push({ a, b, seed: s });
const out = [];
const run = (j) => new Promise((res, rej) => { const w = new Worker(new URL('./ladder-noise-worker.mjs', import.meta.url), { workerData: { entries: [{ name: j.a, design: d(S[j.a]) }, { name: j.b, design: d(S[j.b]) }], seed: j.seed, days, each, cap: 12, width } }); w.once('message', (r) => res({ ...j, ...r })); w.once('error', rej); });
const lane = async () => { while (jobs.length) { const r = await run(jobs.shift()); out.push(r); process.stderr.write('.'); } };
const T0 = Date.now();
await Promise.all(Array.from({ length: pool }, lane));
console.log(`\nwidth ${width || 1600} µm, ${days} days, ${each} cells each, ${seeds} seeds [${Math.round((Date.now() - T0) / 1000)} s]`);
let flips = 0, total = 0, quiet = 0;
for (const [a, b] of PAIRS) {
  const rs = out.filter((r) => r.a === a && r.b === b).sort((x, y) => x.seed - y.seed);
  const res = rs.map((r) => (Math.max(...r.scores) <= 1.1 * Math.min(...r.scores) ? 'd' : r.scores[0] > r.scores[1] ? 'a' : 'b'));
  const n = (k) => res.filter((x) => x === k).length, top = Math.max(n('a'), n('b'), n('d'));
  flips += rs.length - top; total += rs.length; quiet += rs.filter((r) => !r.contacts).length;
  console.log(`${a} vs ${b}: ${a} wins ${n('a')}, draws ${n('d')}, ${b} wins ${n('b')} | no contact in ${rs.filter((r) => !r.contacts).length} of ${rs.length}, kills ${rs.reduce((s, r) => s + r.kills, 0)}, births ${rs.reduce((s, r) => s + r.born, 0)}`);
  console.log('   ' + rs.map((r) => `${r.scores[0].toFixed(2)}:${r.scores[1].toFixed(2)}`).join('  '));
}
console.log(`against each pairing's usual result: ${flips} of ${total} matches went another way (${Math.round(100 * flips / total)}%); ${quiet} of ${total} had no contact (${Math.round(100 * quiet / total)}%)`);
