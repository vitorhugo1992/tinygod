// Contest: one cell of each design from the floor, N sandbox days (default 10), cap 200; prints the census every half
// day and every death. node tools/contest.mjs [bathyscapha,noctilla,...] [days] [--still] [--seed=N]
// (moving water unless --still; a seed shuffles which species starts where along the floor: seed 1 keeps the list's order)
import { readFileSync } from 'fs';
import { PARAMS } from '../sim/params.js';
import { makeWorld, addCell, stepWorld, worldTime } from '../sim/world.js';

const ROOT = new URL('../designs/', import.meta.url);
const still = process.argv.includes('--still'), seedArg = process.argv.find((a) => a.startsWith('--seed='));
const seed = seedArg ? +seedArg.slice(7) : 1, args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const names = (args[0] || 'bathyscapha,noctilla,saltella,trochilla,caecella,raptilla2,scalella,gula').split(',');
const days = +(args[1] || 10);
PARAMS.grow.cap = 200;

function prep(d) {   // the sandbox's withoutTimers stubs
  for (const p of d.parts || []) {
    if (p.type === 'inclusion' && p.material === 'nucleus' && !p.joint) p.joint = { type: 'rest' };
    if (p.type === 'inclusion' && p.material === 'chamber' && !p.joint) p.joint = { type: 'chamber' };
    if (p.type === 'pad' && !p.joint) p.joint = { type: 'hold' };
  }
  if (!(d.parts || []).some((p) => p.type === 'rule' && p.joint && p.joint.type === 'divide')) d.parts.push({ type: 'rule', id: 'divide', label: 'Division', joint: { type: 'divide' } });
  return d;
}

const w = makeWorld(seed, { day: true, metab: true, grow: true, flow: !still });
const species = [];
const spot = names.map((_, i) => i);
if (seed !== 1) { let r = seed; const rnd = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648); for (let i = spot.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [spot[i], spot[j]] = [spot[j], spot[i]]; } }
names.forEach((n, i) => {
  const f = JSON.parse(readFileSync(new URL(n + '.json', ROOT), 'utf8'));
  const d = prep({ ...f.design, name: f.name.replace(/ \(.*/, '') });
  species.push(d.name);
  addCell(w, d, 100 + spot[i] * (1400 / Math.max(1, names.length - 1)), 60, 0);
});
const DAY = PARAMS.metab.day, T0 = Date.now();
const deaths = [];
let nextCensus = 0;
const census = () => {
  const n = {}; for (const s of species) n[s] = 0;
  for (const c of w.cells) if (!c.dead) n[c.species] = (n[c.species] || 0) + 1;
  return species.map((s) => `${s} ${n[s]}`).join(', ');
};
while (worldTime(w) < days * DAY) {
  stepWorld(w);
  if (w.gone && w.gone.length) {
    for (const c of w.gone) deaths.push(`day ${(c.diedAt * PARAMS.time.dt / DAY).toFixed(2)}: ${c.species} ${c.diedWhy} (${Math.round(2000 - c.q[1])} µm)`);
    for (const c of w.gone) console.log('  †', deaths[deaths.length - 1]);
    w.gone.length = 0;
  }
  if (worldTime(w) >= nextCensus) {
    console.log(`day ${(worldTime(w) / DAY).toFixed(1)} [${Math.round((Date.now() - T0) / 1000)} s]: ${census()} (cells ${w.cells.length})`);
    nextCensus += DAY / 2;
  }
}
console.log('FINAL', census());
for (const s of species) {
  const live = w.cells.filter((c) => c.species === s && !c.dead);
  if (live.length) console.log(' ', s, 'sizes', live.map((c) => (c.size || 1).toFixed(1)).join(' '), 'depths', live.map((c) => Math.round(2000 - c.q[1])).join(' '));
}
