// Moving water (PARAMS.flow): convection loops in a closed tank. The water's stream function is
//   psi = sin(pi y / H) * (a2 sin(2 pi x / W) + a3 sin(3 pi x / W)),
// zero on every wall, so no water crosses one (it slides along the floor and the walls). Two loops (a2) and three (a3)
// are blended, the blend turning over PARAMS.flow.shift seconds, so the loops' edges wander across the tank.
// Velocity u = d psi / dy, v = -d psi / dx; the curl (how fast the water turns) w = -laplacian psi.
import { PARAMS } from './params.js';
import { dsin, dcos, TAU } from './dmath.js';
import { hash01 } from './rng.js';
import { daylight } from './light.js';
import { worldTime } from './world.js';

const F = PARAMS.flow, W = PARAMS.tank.w, H = PARAMS.tank.h, KY = Math.PI / H;

// The water's state this step: { speed, a2, a3 }, or null in still water. speed: the fastest it moves now (µm/s).
export function flowState(world) {
  if (!world.flow) return null;
  const speed = F.day + (F.night - F.day) * (1 - daylight(world));
  const ph = TAU * worldTime(world) / F.shift, c2 = dcos(ph), c3 = dsin(ph);
  const sum = (c2 < 0 ? -c2 : c2) + (c3 < 0 ? -c3 : c3);
  // each loop's amplitude so its fastest (upright) stream is `speed`; the blend's shares add to 1
  return { speed, a2: speed * W / (2 * Math.PI) * c2 / sum, a3: speed * W / (3 * Math.PI) * c3 / sum, ...stirNow(world) };
}

// The stirred bottom now: { stir: how fast it lifts at the floor (µm/s, 0 when calm), stirPh: where along the floor it is
// strongest }. Each stretch of S.every seconds has a spell or not, from the world's seed; a spell rises and fades smoothly.
const S = F.stir;
export function stirNow(world) {
  const t = worldTime(world), k = Math.floor(t / S.every), seed = (world.seed | 0) * 7919;
  if (hash01(seed + 3 * k) >= S.chance) return { stir: 0, stirPh: 0 };
  const strength = 0.5 + 0.5 * hash01(seed + 3 * k + 1), env = dsin(Math.PI * (t / S.every - k));
  return { stir: S.lift * strength * env * env, stirPh: TAU * hash01(seed + 3 * k + 2) };
}

// The water at (x, y): into out[0..2] = u, v (µm/s), w (rad/s, counter-clockwise; a small body turns at w / 2)
export function flowAt(fs, x, y, out) {
  if (x < 0) x = 0; else if (x > W) x = W;
  if (y < 0) y = 0; else if (y > H) y = H;
  const sy = dsin(KY * y), cy = dcos(KY * y);
  let u = 0, v = 0, w = 0;
  for (let m = 2; m <= 3; m++) {
    const a = m === 2 ? fs.a2 : fs.a3;
    if (a === 0) continue;
    const kx = m * Math.PI / W, sx = dsin(kx * x), cx = dcos(kx * x);
    u += a * sx * KY * cy;
    v -= a * kx * cx * sy;
    w += a * (kx * kx + KY * KY) * sx * sy;
  }
  if (fs.stir && y < S.layer) {   // the stirred bottom: rising water, thinning upward, patchy along the floor
    const g = 1 - y / S.layer, k = 4 * Math.PI / W, ax = k * x + fs.stirPh;
    v += fs.stir * g * (1 + S.patch * dsin(ax));
    w += fs.stir * g * S.patch * k * dcos(ax);
  }
  out[0] = u; out[1] = v; out[2] = w;
  return out;
}

// The water at (x, y) and how it changes around there (fast mode, stage 2, 2026-11-10): into out[0..6] = u, v, w as
// flowAt, then du/dx, du/dy, dv/dx, dv/dy (1/s). A cell reads this once at its body's centre and each of its pieces
// takes the water as u + the change over its offset: one look in place of one per piece, exact to first order (the
// loops are ~500 µm across, a cell a tenth of that), keeping the stretch that turns a rod along the stream.
export function flowGradAt(fs, x, y, out) {
  if (x < 0) x = 0; else if (x > W) x = W;
  if (y < 0) y = 0; else if (y > H) y = H;
  const sy = dsin(KY * y), cy = dcos(KY * y);
  let u = 0, v = 0, ux = 0, uy = 0, vx = 0;
  for (let m = 2; m <= 3; m++) {
    const a = m === 2 ? fs.a2 : fs.a3;
    if (a === 0) continue;
    const kx = m * Math.PI / W, sx = dsin(kx * x), cx = dcos(kx * x);
    u += a * sx * KY * cy;
    v -= a * kx * cx * sy;
    ux += a * kx * cx * KY * cy;
    uy -= a * sx * KY * KY * sy;
    vx += a * kx * kx * sx * sy;
  }
  let vy = -ux;   // the loops neither squeeze nor swell the water
  if (fs.stir && y < S.layer) {
    const g = 1 - y / S.layer, k = 4 * Math.PI / W, ax = k * x + fs.stirPh, lift = fs.stir * (1 + S.patch * dsin(ax));
    v += lift * g;
    vx += fs.stir * g * S.patch * k * dcos(ax);
    vy -= lift / S.layer;
  }
  out[0] = u; out[1] = v; out[2] = vx - uy; out[3] = ux; out[4] = uy; out[5] = vx; out[6] = vy;
  return out;
}
