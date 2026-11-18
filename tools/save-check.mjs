// Does a saved world resume exactly? (2026-11-18, the Ocean's step 1.) A mixed tank (lobes, partner pads, tubes,
// mouths, harpoons, tethers, a toxin leaker, chains, fixers, moving water, shading) is run two ways: unbroken for
// A + B sim seconds, and for A, saved to text, loaded, then B more (saved and loaded again every `every` s on the way).
// Passes if the two end states are the same bit for bit (their whole saved text is compared, not a fingerprint).
//   node tools/save-check.mjs [A = 60] [B = 60] [every = 20] [--seed=N]
import { readFileSync } from 'fs';
import { newMatch, stepMatch } from '../sim/match.js';
import { saveState, loadState } from '../sim/save.js';

const ROOT = new URL('../', import.meta.url);
const load = (f) => JSON.parse(readFileSync(new URL(f, ROOT), 'utf8')).design;
const arg = (i, d) => Number(process.argv.filter((a) => !a.startsWith('--'))[i] || d);
const A = arg(2, 60), B = arg(3, 60), EVERY = arg(4, 20);
const seed = Number((process.argv.find((a) => a.startsWith('--seed=')) || '--seed=2').slice(7));
const ENTRIES = [
  ['Cunabella', 'designs/cunabella.json'], ['Azotella', 'designs/azotella.json'], ['Laqueella', 'designs/laqueella.json'],
  ['Jaculella', 'designs/jaculella.json'], ['Raptilla', 'designs/raptilla.json'], ['Plebella', 'designs/plebella.json'],
  ['Leviathella', 'designs/leviathella.json'], ['Needle Drifter', 'tournament/fixer-blind-opus2.json'], ['Saltella', 'designs/saltella.json'],
].map(([name, f]) => ({ name, design: load(f) }));
const fresh = () => newMatch({ entries: ENTRIES, seed, days: 100, each: 2, cap: 40 });
const S = (s) => Math.round(s * 1000);

let t0 = performance.now();
const one = fresh();
stepMatch(one, S(A + B));
const want = saveState(one);
console.log(`unbroken: ${A + B} s in ${((performance.now() - t0) / 1000).toFixed(0)} s, ${one.world.cells.length} cells, state ${(want.length / 1024).toFixed(0)} KB`);

t0 = performance.now();
let m = fresh(), done = 0, saves = 0;
stepMatch(m, S(A)); done = A;
while (done < A + B) {
  m = loadState(saveState(m)); saves++;
  const d = Math.min(EVERY, A + B - done);
  stepMatch(m, S(d)); done += d;
}
const got = saveState(m);
console.log(`saved and loaded ${saves} times: ${((performance.now() - t0) / 1000).toFixed(0)} s`);

const w = one.world;
const kinds = { lobes: w.cells.filter((c) => c.pieces[0].lobes).length, partners: w.cells.filter((c) => c.partners).length,
  links: w.links ? w.links.length : 0, toxins: w.toxins ? w.toxins.size : 0, deaths: one.deaths.length, births: w.births || 0 };
console.log('in the tank:', JSON.stringify(kinds));
if (got === want) { console.log('PASS: the resumed world is the unbroken one, bit for bit'); process.exit(0); }
let i = 0; while (got[i] === want[i]) i++;
console.log(`FAIL: differs at character ${i}:\n  unbroken: …${want.slice(Math.max(0, i - 120), i + 80)}\n  resumed:  …${got.slice(Math.max(0, i - 120), i + 80)}`);
process.exit(1);
