// The tank as a living microscope (author, 2026-11-03: "it feels robotic and monotonous… make it feel more alive";
// mock-up design/microscope-mockup.html, approved: "i love it"). Drawing only: nothing here touches the simulation.
// The water: its colour by depth and hour (from the game's own light), shafts of light from above, ripple light near the
// surface, marine snow and specks drifting with the moving water (and sinking), out-of-focus cells far away, a lit
// surface, a sediment floor, and a soft vignette.
import { PARAMS } from '../sim/params.js';
import { daylight, lightAt, clock } from '../sim/light.js';
import { flowState, flowAt } from '../sim/flow.js';
import { NX, NY } from '../sim/toxin.js';
import { NX as SX, NY as SY } from '../sim/shade.js';

const TW = PARAMS.tank.w, TH = PARAMS.tank.h;
const rnd = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
export const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// each species its own tint (its membrane, its glow, its far-away blur): a palette in order of first appearance
const TINTS = ['#7fe0c8', '#8fb7ff', '#f0a77a', '#c7a2ff', '#bfe57e', '#ff9fbd', '#f5d36a', '#ff7d6b', '#6fd0ff', '#e0e070', '#ffb0e0', '#9fe0a0'];
const tintOf = new Map();
export function speciesTint(name) {
  if (!tintOf.has(name)) tintOf.set(name, TINTS[tintOf.size % TINTS.length]);
  return tintOf.get(name);
}

// the water's colour at depth fraction z (0 surface, 1 floor): teal near the top, ink-blue deep; lit by the sun there,
// warm at dawn and dusk, moonlit at night
const SURF = [38, 128, 150], MID = [14, 58, 96], DEEP = [6, 20, 42], NIGHT = [3, 8, 18], MOON = [12, 22, 44], WARM = [255, 130, 80];
// Twilight, 0 (night) to 1 (day): eases over about an hour either side of sunrise and sunset (author, 2026-11-03: "the
// sunset to night colour is abrupt"), where the game's sun itself drops to nothing at once. Drawing only.
export function twilight(world) {
  if (!world.light) return 0;
  if (!world.day) return 1;
  const s = Math.sin(2 * Math.PI * (clock(world) - 6) / 24), u = clamp((s + 0.26) / 0.52, 0, 1);   // ±1 hour
  return u * u * (3 - 2 * u);
}
export function waterColor(world, z) {
  const base = z < 0.5 ? mix(SURF, MID, z / 0.5) : mix(MID, DEEP, (z - 0.5) / 0.5);
  const L = world.light ? lightAt(world, TH * (1 - z)) : 0, tw = twilight(world);
  const s = world.day ? Math.sin(2 * Math.PI * (clock(world) - 6) / 24) : 1, ease = clamp(s / 0.3, 0, 1);   // the sun's share eases in its last hour
  const c = mix(mix(NIGHT, MOON, 0.6 * (1 - z)), base, clamp(0.25 * tw + 1.4 * Math.sqrt(L) * ease * (2 - ease), 0, 1));
  // the warm glow of dawn and dusk: strongest as the sun touches the horizon, fading into the night and into the day
  const glow = world.light ? clamp(1 - Math.abs(s) / 0.45, 0, 1) : 0;
  return mix(c, WARM, 0.45 * glow * glow * (1 - z));
}

// sprites, made once
function sprite(size, draw) { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); return c; }
let SNOW = null, CAUSTIC = null;
const BLUR = new Map();
function sprites() {
  if (SNOW) return;
  SNOW = Array.from({ length: 6 }, (_, s) => sprite(64, (g, n) => {
    for (let i = 0; i < 14; i++) {
      const a = rnd(s * 50 + i) * 6.28, d = rnd(s * 50 + i + 9) * 14, r = 3 + rnd(s * 50 + i + 3) * 8;
      const x = n / 2 + Math.cos(a) * d, y = n / 2 + Math.sin(a) * d, gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(225,230,215,.32)'); gr.addColorStop(1, 'rgba(225,230,215,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
    }
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(160,150,120,.5)'; g.beginPath(); g.arc(n / 2 + (rnd(s * 9 + i) - .5) * 20, n / 2 + (rnd(s * 9 + i + 4) - .5) * 20, 1 + rnd(i + s) * 1.5, 0, 6.28); g.fill(); }
  }));
  CAUSTIC = sprite(256, (g, n) => {   // bright wavy lines, like sunlight focused by ripples; tiles seamlessly
    const img = g.createImageData(n, n), d = img.data;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const u = x / n * 6.283, v = y / n * 6.283;
      const f = Math.sin(u * 2 + Math.sin(v * 3) * 1.3) + Math.sin(v * 2 + Math.sin(u * 3 + 1) * 1.3) + Math.sin((u + v) * 3 + Math.sin(u - v) * 2) * 0.6;
      const b = Math.max(0, 1 - Math.abs(f) * 1.6), i = (y * n + x) * 4;
      d[i] = 220; d[i + 1] = 245; d[i + 2] = 255; d[i + 3] = Math.pow(b, 3) * 255;
    }
    g.putImageData(img, 0, 0);
  });
}
function blurOf(tint) {
  if (!BLUR.has(tint)) BLUR.set(tint, sprite(96, (g, s) => {
    const c = hexRGB(tint), gr = g.createRadialGradient(s / 2, s / 2, s * 0.1, s / 2, s / 2, s / 2);
    gr.addColorStop(0, rgba(c, 0.10)); gr.addColorStop(0.55, rgba(c, 0.16)); gr.addColorStop(0.8, rgba(c, 0.07)); gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    g.fillStyle = 'rgba(120,190,90,.10)'; g.beginPath(); g.arc(s * 0.45, s * 0.5, s * 0.12, 0, 6.28); g.fill();
  }));
  return BLUR.get(tint);
}

// The water behind everything: v = { W, H, X, Y, s (px per µm), x0, x1, y0, y1 (the view in µm) }, t: seconds (drawing time)
export function drawWater(ctx, world, v, t) {
  sprites();
  const { W, H, X, Y, s } = v;
  const top = Y(TH), bot = Y(0), left = X(0), right = X(TW);
  // the water's colour over the whole tank, a stop every tenth of its depth
  const g = ctx.createLinearGradient(0, top, 0, bot);
  for (let k = 0; k <= 10; k++) g.addColorStop(k / 10, rgba(waterColor(world, k / 10), 1));
  ctx.fillStyle = g; ctx.fillRect(left, top, right - left, bot - top);
  const zMid = clamp(1 - (v.y0 + v.y1) / 2 / TH, 0, 1), sun = world.light ? daylight(world) : 0;
  const L = world.light ? lightAt(world, (v.y0 + v.y1) / 2) : 0;
  ctx.save();
  ctx.beginPath(); ctx.rect(left, top, right - left, bot - top); ctx.clip();   // light only in the water
  // ripple light near the surface: only in the top RIPPLE µm, fading with depth (author, 2026-11-03: zoomed out it covered
  // the whole tank: "too much"), its pattern sized in µm (not pixels) and softer when zoomed out
  const RIPPLE = 200, bandTop = Math.max(top, 0), bandBot = Math.min(Y(TH - RIPPLE), H);
  if (sun > 0.01 && bandBot > bandTop) {
    const sz = Math.max(60, 320 * s), soft = clamp(s, 0.35, 1);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let b = 0; b < 4; b++) {   // four bands, each fainter than the one above
      const y0 = Math.max(Y(TH - RIPPLE * b / 4), bandTop), y1 = Math.min(Y(TH - RIPPLE * (b + 1) / 4), bandBot);
      if (y1 <= y0) continue;
      ctx.save(); ctx.beginPath(); ctx.rect(left, y0, right - left, y1 - y0); ctx.clip();
      const a = sun * soft * [1, 0.6, 0.32, 0.12][b];
      ctx.globalAlpha = 0.11 * a;
      const ox = (t * 6) % sz, oy = (t * 3.5) % sz;
      for (let x = -ox - sz; x < W; x += sz) for (let y = -oy - sz + Math.floor((y0 + oy) / sz) * sz; y < y1; y += sz) ctx.drawImage(CAUSTIC, x, y, sz, sz);
      ctx.globalAlpha = 0.07 * a;
      const s2 = sz * 1.3, ox2 = (-t * 4) % s2, oy2 = (t * 2) % s2;
      for (let x = ox2 - s2; x < W; x += s2) for (let y = oy2 - s2 + Math.floor((y0 - oy2) / s2) * s2; y < y1; y += s2) ctx.drawImage(CAUSTIC, x, y, s2, s2);
      ctx.restore();
    }
    ctx.restore();
  }
  // shafts of light from above, slanting and swaying, fainter with depth
  if (L > 0.003) {
    ctx.globalCompositeOperation = 'lighter';
    const fade = clamp(lightAt(world, v.y0) / Math.max(L, 1e-6), 0.15, 1);
    for (let i = 0; i < 6; i++) {
      const x0 = W * (0.05 + 0.18 * i) + Math.sin(t * 0.13 + i * 1.7) * W * 0.05, w = W * (0.06 + 0.05 * rnd(i + 3)), slant = W * 0.18;
      const a = clamp(0.10 * Math.sqrt(L) * (0.6 + 0.4 * Math.sin(t * 0.21 + i * 2.3)), 0, 0.12);
      const sg = ctx.createLinearGradient(0, Math.max(0, top), 0, H);
      sg.addColorStop(0, `rgba(210,240,255,${a.toFixed(3)})`); sg.addColorStop(1, `rgba(210,240,255,${(a * fade).toFixed(3)})`);
      ctx.fillStyle = sg; ctx.beginPath();
      const y0 = Math.max(0, top);
      ctx.moveTo(x0, y0); ctx.lineTo(x0 + w, y0); ctx.lineTo(x0 + w * 1.8 + slant, H); ctx.lineTo(x0 + slant - w * 0.4, H); ctx.closePath(); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  // far away, out of focus: the species in the tank, drifting (depth of field; fixed to the view, slow parallax)
  const names = [...new Set(world.cells.map((c) => c.species))];
  if (names.length) for (let i = 0; i < 7; i++) {
    const tint = speciesTint(names[i % names.length]), size = (40 + rnd(i + 1200) * 50) * Math.max(s, 0.6) * 0.9;
    const x = ((rnd(i + 1000) * W + t * 3 + (v.x0 * s) * 0.15) % (W + size) + W + size) % (W + size) - size / 2;
    const y = ((rnd(i + 1100) * H + Math.sin(t * 0.1 + i) * 20 - (v.y0 * s) * 0.15) % (H + size) + H + size) % (H + size) - size / 2;
    ctx.globalAlpha = 0.5 + 0.5 * Math.sqrt(L); ctx.drawImage(blurOf(tint), x - size / 2, y - size / 2, size, size); ctx.globalAlpha = 1;
  }
  ctx.restore();
  // the surface: a bright line where the light comes in; the floor: settled sediment
  if (top > -4 && top < H) {
    const sg = ctx.createLinearGradient(0, top - 6, 0, top + 10);
    sg.addColorStop(0, 'rgba(200,235,255,0)'); sg.addColorStop(0.4, `rgba(220,245,255,${(0.25 + 0.5 * sun).toFixed(2)})`); sg.addColorStop(1, 'rgba(200,235,255,0)');
    ctx.fillStyle = sg; ctx.fillRect(left, top - 6, right - left, 16);
  }
  if (bot > 0 && bot < H + 40) {
    const fg = ctx.createLinearGradient(0, bot - 14, 0, bot + 30);
    fg.addColorStop(0, 'rgba(60,48,34,0)'); fg.addColorStop(0.35, 'rgba(60,48,34,.75)'); fg.addColorStop(1, 'rgba(30,24,18,1)');
    ctx.fillStyle = fg; ctx.fillRect(left, bot - 14, right - left, H - bot + 14 + 30);
    ctx.fillStyle = 'rgba(150,130,100,.35)';
    for (let i = 0; i < 60; i++) {   // grains on the floor, fixed to the tank
      const gx = rnd(i + 2000) * TW, x = X(gx); if (x < -4 || x > W + 4) continue;
      ctx.beginPath(); ctx.arc(x, bot + 2 + rnd(i + 2100) * 10, Math.max(1, (0.6 + rnd(i + 2200) * 1.4) * s), 0, 6.28); ctx.fill();
    }
  }
}

// Marine snow and specks: always about as many in view whatever the zoom (they live in the view), carried by the moving
// water (so they show it), the snow sinking slowly, the specks jiggling. Replaces the old streaks.
let bits = [], bitT = null, bitView = null;
const FU = new Float64Array(3);
export function drawDrift(ctx, world, v, simT, t) {
  sprites();
  const { W, H, X, Y, s } = v, fs = flowState(world);
  const dt = bitT === null ? 0 : Math.max(0, Math.min(1, simT - bitT));
  bitT = simT;
  const lx = Math.max(0, v.x0), hx = Math.min(TW, v.x1), ly = Math.max(0, v.y0), hy = Math.min(TH, v.y1);
  if (hx <= lx || hy <= ly) return;
  const vw = hx - lx, vh = hy - ly, mv = bitView;
  if (!mv || Math.abs(vw - mv.w) > 0.15 * mv.w || Math.abs(vh - mv.h) > 0.15 * mv.h || Math.abs(lx - mv.x) > 0.5 * vw || Math.abs(ly - mv.y) > 0.5 * vh) bits = [];
  bitView = { x: lx, y: ly, w: vw, h: vh };
  const fresh = (i) => ({ x: lx + Math.random() * vw, y: ly + Math.random() * vh, snow: i % 8 === 0, far: Math.random() < 0.35, k: i % 6,
    size: 4 + Math.random() * 8, p: Math.random() * 6.28, age: 0 });
  while (bits.length < 90) bits.push(fresh(bits.length));
  const L = world.light ? lightAt(world, (ly + hy) / 2) : 0, lit = 0.35 + 0.65 * Math.min(1, Math.sqrt(L) * 1.3);
  for (let i = 0; i < bits.length; i++) {
    const b = bits[i];
    if (fs) { flowAt(fs, b.x, b.y, FU); b.x += FU[0] * dt; b.y += FU[1] * dt; }
    if (b.snow) b.y -= (b.far ? 1.2 : 2.4) * dt;
    b.age += dt;
    if (b.x < lx - 20 || b.x > hx + 20 || b.y < ly - 20 || b.y > hy + 20) { bits[i] = fresh(i); bits[i].y = b.snow ? hy + 10 : bits[i].y; continue; }
    const fade = Math.min(1, b.age / 1.5);
    if (b.snow) {
      const sz = Math.min(b.size * s, 60) * (b.far ? 0.6 : 1);   // no bigger than a fingertip at close zoom
      ctx.globalAlpha = (b.far ? 0.3 : 0.6) * lit * fade;
      ctx.drawImage(SNOW[b.k], X(b.x) - sz / 2, Y(b.y) - sz / 2, sz, sz);
    } else {
      const x = X(b.x + Math.sin(t * 2.3 + b.p) * 1.2), y = Y(b.y + Math.cos(t * 1.9 + b.p * 2) * 1.2);
      ctx.globalAlpha = (0.18 + 0.25 * lit) * fade; ctx.fillStyle = '#dcebf0';
      ctx.beginPath(); ctx.arc(x, y, Math.max(0.6, 0.35 * s), 0, 6.28); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// Toxin clouds (sim/toxin.js): a soft haze in each toxic species' tint, stronger where the cloud is; the grid drawn small and
// stretched with smoothing, so it looks like a cloud, not squares
const hazeCv = new Map();
export function drawToxins(ctx, world, v) {
  if (!world.toxins || !world.toxins.size) return;
  const full = PARAMS.toxin.leak.full, D = PARAMS.toxin.leak.cell;
  for (const [sp, f] of world.toxins) {
    let h = hazeCv.get(sp);
    if (!h) { const c = document.createElement('canvas'); c.width = NX; c.height = NY; h = { c, g: c.getContext('2d'), img: null }; h.img = h.g.createImageData(NX, NY); hazeCv.set(sp, h); }
    const [r, g, b] = hexRGB(speciesTint(sp)), d = h.img.data;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const k = ((NY - 1 - j) * NX + i) * 4, a = Math.min(1, Math.sqrt(f[j * NX + i] / (0.4 * full)));   // row 0 at the top
      d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = Math.round(150 * a);
    }
    h.g.putImageData(h.img, 0, 0);
    ctx.save(); ctx.imageSmoothingEnabled = true;
    ctx.drawImage(h.c, v.X(0), v.Y(NY * D), NX * D * v.s, NY * D * v.s);
    ctx.restore();
  }
}

// Self-shading (sim/shade.js): the water darker below a crowd of plastids, as much as the light it loses (by day; at
// night there is nothing to shade). The grid stretched smooth, like the toxin haze.
let shadeCv = null;
export function drawShade(ctx, world, v) {
  const sh = world.shade;
  if (!sh || !world.light) return;
  const sun = daylight(world);
  if (sun <= 0.02) return;
  if (!shadeCv) { const c = document.createElement('canvas'); c.width = SX; c.height = SY; shadeCv = { c, g: c.getContext('2d') }; shadeCv.img = shadeCv.g.createImageData(SX, SY); }
  const d = shadeCv.img.data;
  let any = false;
  for (let j = 0; j < SY; j++) for (let i = 0; i < SX; i++) {
    const k = ((SY - 1 - j) * SX + i) * 4, lost = 1 - Math.exp(-sh.above[j * SX + i]);
    d[k] = 0; d[k + 1] = 6; d[k + 2] = 14; d[k + 3] = Math.round(170 * Math.min(1, sun * 1.5) * lost);
    if (lost > 0.01) any = true;
  }
  if (!any) return;
  shadeCv.g.putImageData(shadeCv.img, 0, 0);
  const D = PARAMS.shading.cell;
  ctx.save(); ctx.imageSmoothingEnabled = true;
  ctx.drawImage(shadeCv.c, v.X(0), v.Y(SY * D), SX * D * v.s, SY * D * v.s);
  ctx.restore();
}

// The microscope's soft vignette, over the cells
export function drawVignette(ctx, W, H) {
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,4,10,.55)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}
