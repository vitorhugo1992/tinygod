// Contest: one cell of each design from the floor, N sandbox days (default 10), cap 200; prints the census every half
// day and every death. node tools/contest.mjs [bathyscapha,noctilla,...] [days] [--still] [--seed=N]
// (moving water unless --still; a seed shuffles which species starts where along the floor: seed 1 keeps the list's order)
import { readFileSync } from 'fs';
import { PARAMS } from '../sim/params.js';
import { makeWorld, addCell, stepWorld, worldTime } from '../sim/world.js';

const ROOT = new URL('../designs/', import.meta.url);
const still = process.argv.includes('--still'), seedArg = process.argv.find((a) => a.startsWith('--seed='));
const seed = seedArg ? +seedArg.slice(7) : 1, args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const names = (args[0] || 'deepdweller2,noctilla,saltella,trochilla,raptilla2').split(',');
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
const species = [], bio0 = {};   // the biomass each species started with
const spot = names.map((_, i) => i);
if (seed !== 1) { let r = seed; const rnd = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648); for (let i = spot.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [spot[i], spot[j]] = [spot[j], spot[i]]; } }
names.forEach((n, i) => {
  const f = JSON.parse(readFileSync(new URL(n + '.json', ROOT), 'utf8'));
  const d = prep({ ...f.design, name: f.name.replace(/ \(.*/, '') });
  species.push(d.name);
  const c0 = addCell(w, d, 100 + spot[i] * (1400 / Math.max(1, names.length - 1)), 60, 0);
  bio0[d.name] = (bio0[d.name] || 0) + c0.pieces[0].volume;
});
const DAY = PARAMS.metab.day, T0 = Date.now();
const deaths = [];
let nextCensus = 0;
const shareSum = {}, growSum = {}, kills = {};   // biomass share summed at every census; kills by killer: { cells, biomass }
let censuses = 0;
const vol = (c) => c.pieces[0].volume;
const shots = {};   // harpoons: shooter -> { shots, hits: { target: n } }
const census = () => {
  const n = {}; for (const s of species) n[s] = 0;
  for (const c of w.cells) if (!c.dead) n[c.species] = (n[c.species] || 0) + 1;
  return species.map((s) => `${s} ${n[s]}`).join(', ');
};
while (worldTime(w) < days * DAY) {
  stepWorld(w);
  for (const c of w.cells) for (const h of c.harpoons || []) if (h.shot && h.shot.step === w.steps - 1) {
    const t = shots[c.species] || (shots[c.species] = { shots: 0, hits: {} }); t.shots++;
    if (h.shot.hit) t.hits[h.shot.hit] = (t.hits[h.shot.hit] || 0) + 1;
  }
  if (w.gone && w.gone.length) {
    for (const c of w.gone) { const m = / by a (.+?)(?:'s |$| bursting)/.exec(c.diedWhy || ''); if (m) { const k = kills[m[1]] || (kills[m[1]] = { cells: 0, biomass: 0 }); k.cells++; k.biomass += vol(c); } }
    for (const c of w.gone) deaths.push(`day ${(c.diedAt * PARAMS.time.dt / DAY).toFixed(2)}: ${c.species} ${c.diedWhy} (${Math.round(2000 - c.q[1])} µm)`);
    for (const c of w.gone) console.log('  †', deaths[deaths.length - 1]);
    w.gone.length = 0;
  }
  if (worldTime(w) >= nextCensus) {
    const live = w.cells.filter((c) => !c.dead), all = live.reduce((a, c) => a + vol(c), 0);
    if (all > 0) { censuses++; for (const s of species) { const b = live.filter((c) => c.species === s).reduce((a, c) => a + vol(c), 0); shareSum[s] = (shareSum[s] || 0) + b / all; growSum[s] = (growSum[s] || 0) + b / bio0[s]; } }
    console.log(`day ${(worldTime(w) / DAY).toFixed(1)} [${Math.round((Date.now() - T0) / 1000)} s]: ${census()} (cells ${w.cells.length})`);
    nextCensus += DAY / 2;
  }
}
console.log('FINAL', census());
console.log('SCORES, best first. Score: mean growth = its living biomass (cell volume) ÷ what it started with, averaged over every half-day census; biomass share: of all living cell volume, averaged the same way');
for (const s of [...species].sort((a, b) => (growSum[b] || 0) - (growSum[a] || 0))) {
  const live = w.cells.filter((c) => c.species === s && !c.dead), k = kills[s] || { cells: 0, biomass: 0 };
    const now = live.reduce((a, c) => a + vol(c), 0);
  console.log(`  ${s}: SCORE ${((growSum[s] || 0) / Math.max(1, censuses)).toFixed(2)}× (now ${(now / bio0[s]).toFixed(2)}×), cells ${live.length}, biomass ${Math.round(live.reduce((a, c) => a + vol(c), 0) / 1000)}k µm³, mean biomass share ${(100 * (shareSum[s] || 0) / Math.max(1, censuses)).toFixed(1)}%, kills ${k.cells} (${Math.round(k.biomass / 1000)}k µm³)`);
}
for (const [s, t] of Object.entries(shots)) console.log('  harpoons', s, t.shots, 'shots, hits', JSON.stringify(t.hits));
for (const s of species) {
  const live = w.cells.filter((c) => c.species === s && !c.dead);
  if (live.length) console.log(' ', s, 'sizes', live.map((c) => (c.size || 1).toFixed(1)).join(' '), 'depths', live.map((c) => Math.round(2000 - c.q[1])).join(' '));
}
