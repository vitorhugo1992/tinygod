// Moving water (PARAMS.flow): convection loops in a closed tank. The water's stream function is
//   psi = sin(pi y / H) * (a2 sin(2 pi x / W) + a3 sin(3 pi x / W)),
// zero on every wall, so no water crosses one (it slides along the floor and the walls). Two loops (a2) and three (a3)
// are blended, the blend turning over PARAMS.flow.shift seconds, so the loops' edges wander across the tank.
// Velocity u = d psi / dy, v = -d psi / dx; the curl (how fast the water turns) w = -laplacian psi.
import { PARAMS } from './params.js';
import { dsin, dcos, dexp, TAU } from './dmath.js';
import { hash01 } from './rng.js';
import { daylight } from './light.js';
import { worldTime } from './world.js';
import { inTank } from './wrap.js';

const F = PARAMS.flow, W = PARAMS.tank.w, H = PARAMS.tank.h, KY = Math.PI / H;

// The water's state this step: { speed, a2, a3 }, or null in still water. speed: the fastest it moves now (µm/s).
export function flowState(world) {
  if (!world.flow) return null;
  if (world.weather) return oceanState(world);   // the Ocean's weather (below)
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
  if (fs.ocean) return oceanAt(fs, x, y, out, false);
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
  if (fs.ocean) return oceanAt(fs, x, y, out, true);
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

// ---- The Ocean's weather (PARAMS.flow.weather; author, 2026-11-20) ----
// Every flow here is periodic across the tank (it joins up: sim/wrap.js) and has no water through the surface or the
// floor. Spells are a pure function of the world's seed and the day, so a saved Ocean, the nightly run and the page's
// live view all have the same weather.
const WX = F.weather, DAYS = PARAMS.metab.day;
const pick = (odds, r) => { let a = 0; for (const [k, p] of Object.entries(odds)) { a += p; if (r < a) return k; } return Object.keys(odds).pop(); };
// The spells of sandbox day k: [{ from, to (0-1 of the day), kind, strong, U (current, µm/s at the surface), rolls (share
// of two loops vs four), A (up / downwelling: its stream function's size), x0 (its middle) }]
const UPB = [1, 0.7, 0.4, 0.15], UPSUM = UPB.reduce((a, b) => a + b, 0);
const spellCache = new Map();
export function spellsOfDay(seed, k) {
  const key = seed * 100003 + k;
  let got = spellCache.get(key);
  if (got) return got;
  const h = (n) => hash01((seed | 0) * 7919 + k * 131 + n * 17 + 5);
  const n = WX.spells[0] + Math.floor(h(1) * (WX.spells[1] - WX.spells[0] + 1));
  const cuts = [0];
  for (let i = 1; i < n; i++) cuts.push((i + 0.6 * (h(20 + i) - 0.5)) / n);
  cuts.push(1);
  const dramatic = h(2) < WX.dramatic, strongAt = Math.floor(h(3) * n);
  got = [];
  for (let i = 0; i < n; i++) {
    const r = (m) => h(40 + 7 * i + m), strong = dramatic && i === strongAt;
    const kind = pick(strong ? WX.strong : WX.gentle, r(0)), mag = r(1), dir = r(2) < 0.5 ? 1 : -1;
    const sp = { from: cuts[i], to: cuts[i + 1], kind, strong, U: 0, rolls: 0, A: 0, x0: r(3) * W,
      y0: H - WX.layer[0] - (WX.layer[1] - WX.layer[0]) * r(4), dl: WX.shear[0] + (WX.shear[1] - WX.shear[0]) * r(5) };   // a current: where its shear layer lies, how thin
    if (kind === 'current') sp.U = dir * (strong ? WX.current[2] + (WX.current[3] - WX.current[2]) * mag : WX.current[0] + (WX.current[1] - WX.current[0]) * mag);
    if (kind === 'rolls') sp.rolls = mag;
    if (kind === 'up' || kind === 'down') {
      const v = strong ? WX.rise[2] + (WX.rise[3] - WX.rise[2]) * mag : WX.rise[0] + (WX.rise[1] - WX.rise[0]) * mag;
      sp.A = (kind === 'up' ? 1 : -1) * v / UPSUM;   // its middle rises (sinks) at v at mid-depth
    }
    got.push(sp);
  }
  if (spellCache.size > 64) spellCache.clear();
  spellCache.set(key, got);
  return got;
}
// The weather now: the spell (or the two being blended) at this moment of the day
export function weatherNow(world) {
  const t = worldTime(world) / DAYS, k = Math.floor(t), f = t - k, e = WX.blend;
  const today = spellsOfDay(world.seed, k);
  let i = today.findIndex((sp) => f < sp.to); if (i < 0) i = today.length - 1;
  const sp = today[i], parts = [[sp, 1]];
  const next = i < today.length - 1 ? today[i + 1] : spellsOfDay(world.seed, k + 1)[0];
  const prev = i > 0 ? today[i - 1] : (() => { const y = spellsOfDay(world.seed, k - 1); return y[y.length - 1]; })();
  if (f > sp.to - e) { const w = (f - (sp.to - e)) / (2 * e); parts[0][1] = 1 - w; parts.push([next, w]); }
  else if (f < sp.from + e) { const w = (sp.from + e - f) / (2 * e); parts[0][1] = 1 - w; parts.push([prev, w]); }
  return { spell: sp, parts };
}
function oceanState(world) {
  const { spell, parts } = weatherNow(world);
  const roll = F.day + (F.night - F.day) * (1 - daylight(world));   // the rolls still turn faster at night
  let speed = 0, stirW = 0;
  const P = parts.map(([sp, w]) => {
    const a2 = sp.kind === 'rolls' ? w * roll * W / (2 * Math.PI) * (1 - sp.rolls) : 0, a4 = sp.kind === 'rolls' ? w * roll * W / (4 * Math.PI) * sp.rolls : 0;
    speed += w * (sp.kind === 'rolls' ? roll : sp.kind === 'current' ? Math.abs(sp.U) : Math.abs(sp.A) * UPSUM);
    if (sp.kind !== 'still') stirW += w;
    return { U: w * sp.U, a2, a4, A: w * sp.A, x0: sp.x0, y0: sp.y0, dl: sp.dl };
  });
  const st = stirNow(world);
  return { ocean: true, speed, parts: P, kind: spell.kind, strong: spell.strong, dir: Math.sign(spell.U), stir: st.stir * stirW, stirPh: st.stirPh };
}
// The water at (x, y) in the Ocean: out[0..2] = u, v, w; with grad, also du/dx, du/dy, dv/dx, dv/dy (as flowGradAt)
function oceanAt(fs, x, y, out, grad) {
  x = inTank(x);
  if (y < 0) y = 0; else if (y > H) y = H;
  const sy = dsin(KY * y), cy = dcos(KY * y);
  let u = 0, v = 0, ux = 0, uy = 0, vx = 0;
  for (const p of fs.parts) {
    if (p.U) {   // a current: the surface layer moves, the deep water stays still, a thin shear layer between (cells tilt and tumble there)
      const fz = 1 / (1 + dexp(-(y - p.y0) / p.dl));
      u += p.U * fz; uy += p.U * fz * (1 - fz) / p.dl;
    }
    for (let m = 2; m <= 4; m += 2) {   // the rolls: two loops or four (both periodic across)
      const a = m === 2 ? p.a2 : p.a4;
      if (!a) continue;
      const kx = m * Math.PI / W, sx = dsin(kx * x), cx = dcos(kx * x);
      u += a * sx * KY * cy; v -= a * kx * cx * sy;
      ux += a * kx * cx * KY * cy; uy -= a * sx * KY * KY * sy; vx += a * kx * kx * sx * sy;
    }
    if (p.A) {   // up- or downwelling round x0: psi = A sin(pi y / H) G(x)
      const th = TAU * (x - p.x0) / W;
      let G = 0, Gp = 0, Gpp = 0;
      for (let k = 1; k <= 4; k++) {
        const b = UPB[k - 1], sk = dsin(k * th), ck = dcos(k * th);
        G -= b * W / (TAU * k) * sk; Gp -= b * ck; Gpp += b * TAU * k / W * sk;
      }
      u += p.A * KY * cy * G; v -= p.A * sy * Gp;
      ux += p.A * KY * cy * Gp; uy -= p.A * KY * KY * sy * G; vx -= p.A * sy * Gpp;
    }
  }
  let vy = -ux;   // none of these squeezes or swells the water
  if (fs.stir && y < S.layer) {
    const g = 1 - y / S.layer, k = 4 * Math.PI / W, ax = k * x + fs.stirPh, lift = fs.stir * (1 + S.patch * dsin(ax));
    v += lift * g; vx += fs.stir * g * S.patch * k * dcos(ax); vy -= lift / S.layer;
  }
  out[0] = u; out[1] = v; out[2] = vx - uy;
  if (grad) { out[3] = ux; out[4] = uy; out[5] = vx; out[6] = vy; }
  return out;
}
