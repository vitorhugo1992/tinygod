// What a crowded Ocean costs (2026-11-18, the Ocean's step 2): 12 species × n cells at random spots, the full world
// (day, growth, moving water, shading), stepped for a stretch; prints ms per sim second and a fingerprint of the end
// state (tools/bench.mjs's), so a faster contact search can be checked to change nothing.
//   node tools/ocean-cost.mjs [cells per species = 5] [sim seconds = 10] [--seed=N]
import { readFileSync } from 'fs';
import { newMatch, stepMatch } from '../sim/match.js';
import { saveState } from '../sim/save.js';

const ROOT = new URL('../', import.meta.url);
const load = (f) => JSON.parse(readFileSync(new URL(f, ROOT), 'utf8')).design;
const pos = process.argv.filter((a) => !a.startsWith('--'));
const each = Number(pos[2] || 5), secs = Number(pos[3] || 10);
const seed = Number((process.argv.find((a) => a.startsWith('--seed=')) || '--seed=1').slice(7));
const SP = [['Plebella', 'designs/plebella.json'], ['Laqueella', 'designs/laqueella.json'], ['Gula', 'designs/gula.json'],
  ['Bobber', 'tournament/bobber-blind-opus.json'], ['Needle Drifter', 'tournament/fixer-blind-opus2.json'], ['Deepdweller II', 'designs/deepdweller2.json'],
  ['Deepline Spindle', 'designs/_deep.json'], ['Noctilla', 'designs/noctilla.json'], ['Raptilla 2', 'designs/raptilla2.json'],
  ['Saltella', 'designs/saltella.json'], ['Lanternrod', 'tournament/fixer-blind-opus.json'], ['Trochilla', 'designs/trochilla.json']];
const m = newMatch({ entries: SP.map(([name, f]) => ({ name, design: load(f) })), seed, days: 100, each, cap: 200 });
const t0 = performance.now();
stepMatch(m, Math.round(secs * 1000));
const ms = (performance.now() - t0) / secs;
// FNV-1a over the whole saved state: every number in the tank
let h = 0x811c9dc5; const s = saveState(m.world);
for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
console.log(`${each * SP.length} cells -> ${m.world.cells.length}: ${ms.toFixed(0)} ms per sim second, state ${h.toString(16).padStart(8, '0')}`);
