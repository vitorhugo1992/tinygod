// The fast mode's yardstick (2026-11-10): fixed small tanks, each run for a stretch; prints the computing time per
// simulated second and a fingerprint of the tank's state at the end. The same fingerprint before and after a change
// means the results did not move at all (bit for bit); a different one means every recorded contest may shift.
//   node tools/bench.mjs [sim seconds = 60] [tank 1-4: only that one]
import { readFileSync } from 'fs';
import { newMatch, stepMatch } from '../sim/match.js';

const ROOT = new URL('../', import.meta.url);
const load = (f) => JSON.parse(readFileSync(new URL(f, ROOT), 'utf8')).design;
const D = { noctilla: 'designs/noctilla.json', plebella: 'designs/plebella.json', deep2: 'designs/deepdweller2.json',
  bobber: 'tournament/bobber-blind-opus.json', needle: 'tournament/fixer-blind-opus2.json', lantern: 'tournament/fixer-blind-opus.json' };
const TANKS = [
  ['drifters: 6 Deepdweller II', ['deep2'], 6],
  ['swimmers: 6 Noctilla', ['noctilla'], 6],
  ['mixed: 2 each of Noctilla, Plebella, Bobber, Deepdweller II, Needle Drifter', ['noctilla', 'plebella', 'bobber', 'deep2', 'needle'], 2],
  ['springs and tails: 4 Lanternrod', ['lantern'], 4],
];
const secs = Number(process.argv[2] || 60);

// FNV-1a over the bits of every cell's position, angles and energy
function fingerprint(world) {
  let h = 0x811c9dc5;
  const buf = new Float64Array(1), bytes = new Uint8Array(buf.buffer);
  const eat = (v) => { buf[0] = v; for (let i = 0; i < 8; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; } };
  eat(world.cells.length);
  for (const c of world.cells) { for (let i = 0; i < c.q.length; i++) eat(c.q[i]); eat(c.metab ? c.metab.E : 0); eat(c.dead ? 1 : 0); }
  return h.toString(16).padStart(8, '0');
}

let total = 0;
const only = Number(process.argv[3] || 0);
for (const [title, names, each] of only ? [TANKS[only - 1]] : TANKS) {
  const m = newMatch({ entries: names.map((n) => ({ name: n, design: load(D[n]) })), seed: 3, days: 100, each, cap: 12 });
  const t0 = performance.now();
  stepMatch(m, secs * 1000);
  const ms = performance.now() - t0; total += ms;
  console.log(`${(ms / secs).toFixed(0).padStart(6)} ms per sim second  ${fingerprint(m.world)}  ${m.world.cells.length} cells  ${title}`);
}
console.log(`${(total / 1000).toFixed(1)} s in all (${secs} sim seconds each)`);
