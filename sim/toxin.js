// Toxins in the water (author, 2026-11-03: "we need that"; Karenia, Prymnesium, Alexandrium): a toxin sac of Kind
// Leak releases toxin where its cell is while its rule holds (no rule: always), paying energy and nitrogen for it. Each
// toxic species has its own cloud on a coarse grid over the tank (PARAMS.toxin.leak.cell µm squares): carried by the
// moving water, spreading to neighbouring squares, fading by half every `half` s. Other species inside a cloud lose
// energy through their surface and their plastids are damaged, in proportion to how strong it is; kin are immune.
import { PARAMS } from './params.js';
import { dexp } from './dmath.js';
import { flowAt } from './flow.js';

const T = PARAMS.toxin.leak, TW = PARAMS.tank.w, TH = PARAMS.tank.h, D = T.cell;
export const NX = Math.ceil(TW / D), NY = Math.ceil(TH / D);
const FU = new Float64Array(3);

// The cloud of `species` (made on first use)
export function cloudOf(world, species) {
  if (!world.toxins) world.toxins = new Map();
  let f = world.toxins.get(species);
  if (!f) { f = new Float64Array(NX * NY); world.toxins.set(species, f); }
  return f;
}
const idx = (x, y) => {
  let i = Math.floor(x / D), j = Math.floor(y / D);
  i = i < 0 ? 0 : i >= NX ? NX - 1 : i; j = j < 0 ? 0 : j >= NY ? NY - 1 : j;
  return j * NX + i;
};
// How strong a cloud is at (x, y): between the squares' middles
export function sample(f, x, y) {
  let gx = x / D - 0.5, gy = y / D - 0.5;
  gx = gx < 0 ? 0 : gx > NX - 1 ? NX - 1 : gx; gy = gy < 0 ? 0 : gy > NY - 1 ? NY - 1 : gy;
  const i = Math.floor(gx), j = Math.floor(gy), i1 = i < NX - 1 ? i + 1 : i, j1 = j < NY - 1 ? j + 1 : j, a = gx - i, b = gy - j;
  return (f[j * NX + i] * (1 - a) + f[j * NX + i1] * a) * (1 - b) + (f[j1 * NX + i] * (1 - a) + f[j1 * NX + i1] * a) * b;
}
// Release `amount` into the square at (x, y)
export function release(world, species, x, y, amount) { cloudOf(world, species)[idx(x, y)] += amount; }

// Every T.every steps: each cloud drifts with the water, spreads and fades; a cloud gone to nothing is dropped
let tmp = null;
export function stepToxins(world) {
  if (!world.toxins || !world.toxins.size || world.steps % T.every) return;
  const dt = T.every * PARAMS.time.dt, fade = dexp(-Math.LN2 * dt / T.half), k = T.spread * dt / (D * D), fs = world.flowNow;
  if (!tmp) tmp = new Float64Array(NX * NY);
  for (const [sp, f] of world.toxins) {
    // drift: each square takes what was upstream of it
    if (fs) {
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const x = (i + 0.5) * D, y = (j + 0.5) * D;
        flowAt(fs, x, y, FU);
        tmp[j * NX + i] = sample(f, x - FU[0] * dt, y - FU[1] * dt);
      }
      f.set(tmp);
    }
    // spread to the four neighbours (nothing through the walls), then fade
    let total = 0;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const c = f[j * NX + i];
      let s = 0, n = 0;
      if (i > 0) { s += f[j * NX + i - 1]; n++; }
      if (i < NX - 1) { s += f[j * NX + i + 1]; n++; }
      if (j > 0) { s += f[(j - 1) * NX + i]; n++; }
      if (j < NY - 1) { s += f[(j + 1) * NX + i]; n++; }
      const v = (c + k * (s - n * c)) * fade;
      tmp[j * NX + i] = v; total += v;
    }
    f.set(tmp);
    if (total < T.gone) world.toxins.delete(sp);
  }
}

// A cell's toxin sacs of Kind Leak: release while its rule holds (inc.go), paying for it; returns pJ/s spent
export function leak(world, cell, dt) {
  const m = cell.metab;
  let spent = 0, q = 0;
  for (const inc of cell.pieces[0].inclusions) {
    if (!inc.leak || !inc.go || m.starving) continue;
    const amount = T.rate * inc.v * dt, e = amount * T.energy, n = amount * T.nitrogen;
    if (m.E < e) continue;
    if (world.grow) { if (cell.grow.N < n) continue; cell.grow.N -= n; }
    m.E -= e; spent += e; q += amount;
  }
  if (q > 0) release(world, cell.species, cell.q[0], cell.q[1], q);
  cell.leaking = spent / dt;
  return spent / dt;
}

// The clouds of other species round a cell: energy lost through its surface, its plastids damaged. Sets cell.poison
// { level (all clouds), loss (pJ/s), by (the strongest cloud's species), step } while it is in one.
export function poison(world, cell, dt) {
  cell.poison = null;
  if (!world.toxins || !world.toxins.size) return;
  let level = 0, worst = 0, by = null;
  for (const [sp, f] of world.toxins) {
    if (sp === cell.species) continue;   // kin are immune
    const c = sample(f, cell.q[0], cell.q[1]);
    level += c;
    if (c > worst) { worst = c; by = sp; }
  }
  if (level < T.felt) return;
  const body = cell.pieces[0], loss = T.harm * level * body.area;
  cell.metab.E -= loss * dt;
  for (const inc of body.inclusions) if (inc.material === 'plastid') inc.damage = Math.min(1, (inc.damage || 0) + T.damage * level * dt);
  cell.poison = { level, loss, by, step: world.steps };
}
