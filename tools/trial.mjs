// Trial: check a design the way the AI tournament will, then run it alone from the floor in moving water.
// node tools/trial.mjs <file.json> [days=3] [--seed=N]   (the file: { name, design } or a bare design)
// Prints whether it builds (and why not), then every half day: cells, energy, depth; then deaths and their causes.
import { readFileSync } from 'fs';
import { PARAMS } from '../sim/params.js';
import { prepEntry, entryProblem, readAnswer } from '../sim/entry.js';
import { makeWorld, addCell, stepWorld, worldTime } from '../sim/world.js';
import { clock } from '../sim/light.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const seedArg = process.argv.find((a) => a.startsWith('--seed='));
const seed = seedArg ? +seedArg.slice(7) : 1, days = +(args[1] || 3);
if (!args[0]) { console.log('node tools/trial.mjs <file.json> [days] [--seed=N]'); process.exit(1); }
PARAMS.grow.cap = 200;

const got = readAnswer(readFileSync(args[0], 'utf8')), name = got.name;
const bad = entryProblem(got.design);
if (bad) { console.log(`${name}: REFUSED: ${bad}`); process.exit(2); }
const d = prepEntry(got.design);
d.name = name;
console.log(`${name}: builds. Alone from the floor, moving water, ${days} days, seed ${seed}`);

const w = makeWorld(seed, { day: true, metab: true, grow: true, flow: true });
addCell(w, d, 800, 60, 0);
const DAY = PARAMS.metab.day;
let next = 0, minE = 1, starvedS = 0;
const deaths = [];
while (worldTime(w) < days * DAY) {
  stepWorld(w);
  for (const c of w.cells) if (!c.dead) { minE = Math.min(minE, c.metab.E / c.metab.C); if (c.metab.starving) starvedS += PARAMS.time.dt; }
  if (w.gone && w.gone.length) {
    for (const c of w.gone) deaths.push(`day ${(c.diedAt * PARAMS.time.dt / DAY).toFixed(2)}: ${c.diedWhy} at ${Math.round(2000 - c.q[1])} µm`);
    w.gone.length = 0;
  }
  if (worldTime(w) >= next) {
    const live = w.cells.filter((c) => !c.dead), h = clock(w);
    console.log(`day ${(worldTime(w) / DAY).toFixed(1)} ${String(Math.floor(h)).padStart(2, '0')}h: ${live.length} cells` +
      (live.length ? `, energy ${live.map((c) => Math.round(100 * c.metab.E / c.metab.C) + '%').join(' ')}, depth ${live.map((c) => Math.round(2000 - c.q[1])).join(' ')} µm, size ${live.map((c) => (c.size || 1).toFixed(1) + '×').join(' ')}` : ''));
    next += DAY / 4;
  }
}
const live = w.cells.filter((c) => !c.dead).length;
console.log(`FINAL ${name}: ${live} cells after ${days} days; lowest energy ${Math.round(100 * minE)}%, ${Math.round(starvedS)} cell-seconds starving`);
for (const x of deaths) console.log('  died', x);
