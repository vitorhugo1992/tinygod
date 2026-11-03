// Moving water (PARAMS.flow): convection loops in a closed tank. The water's stream function is
//   psi = sin(pi y / H) * (a2 sin(2 pi x / W) + a3 sin(3 pi x / W)),
// zero on every wall, so no water crosses one (it slides along the floor and the walls). Two loops (a2) and three (a3)
// are blended, the blend turning over PARAMS.flow.shift seconds, so the loops' edges wander across the tank.
// Velocity u = d psi / dy, v = -d psi / dx; the curl (how fast the water turns) w = -laplacian psi.
import { PARAMS } from './params.js';
import { dsin, dcos, TAU } from './dmath.js';
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
  return { speed, a2: speed * W / (2 * Math.PI) * c2 / sum, a3: speed * W / (3 * Math.PI) * c3 / sum };
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
  out[0] = u; out[1] = v; out[2] = w;
  return out;
}
