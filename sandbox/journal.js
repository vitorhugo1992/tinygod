// The journal: what happened to a cell over the last day (depth, energy, stores, float, plastids, light), and the moments that
// explain its fate (running out of energy, tipping over, the floor, a crushed float...), for the day graph and the
// trouble log. Nothing here changes the simulation; it only watches. "Test a day" runs a copy ahead to forecast.
import { PARAMS } from '../sim/params.js';
import { makeWorld, addCell, stepWorld, worldTime } from '../sim/world.js';
import { daylight, lightAt, clock } from '../sim/light.js';
import { plastidHealth } from '../sim/sense.js';

const TH = PARAMS.tank.h, M = PARAMS.metab, DT = PARAMS.time.dt;
const EVERY = 1000;          // steps between samples (1 s)
const KEEP = 2 * M.day;      // samples kept (two sandbox days)

const avgFill = (list) => (list.length ? list.reduce((a, i) => a + i.fill, 0) / list.length : null);

// Watch a cell after a step (cheap: it samples once a second)
export function note(world, c) {
  if (world.steps % EVERY) return;
  const j = c.journal || (c.journal = { s: [], ev: [], was: {} });
  const t = worldTime(world), depth = TH - c.q[1], E = world.metab ? c.metab.E / c.metab.C : 1;
  const inc = c.pieces[0].inclusions;
  const starch = avgFill(inc.filter((i) => i.store === 'starch')), oil = avgFill(inc.filter((i) => i.store === 'oil'));
  const floats = inc.filter((i) => i.crush), gas = avgFill(floats);
  const sun = world.light ? (world.day ? daylight(world) : 1) : 0;
  const up = Math.sin(c.q[2]);   // 1: its front points straight up
  const health = inc.some((i) => i.material === 'plastid') ? plastidHealth(world, c) : null;
  j.s.push({ t, depth, E, starch, oil, gas, health, sun, up });
  if (j.s.length > KEEP) j.s.shift();

  const w = j.was;
  const say = (text, serious = false) => { j.ev.push({ t, h: clock(world), text, serious }); if (j.ev.length > 40) j.ev.shift(); };
  const starving = !!(world.metab && c.metab.starving);
  if (starving && !w.starving) say('ran out of energy: its motors stopped', true);
  if (!starving && w.starving) say('has energy again');
  const floor = depth > TH - c.reach - 1, top = depth < c.reach + 1;
  if (floor && !w.floor) say('reached the floor', true);
  if (top && !w.top) say('reached the surface');
  if (up < -0.5 && w.upright === true) say(c.v[1] < -0.5 ? 'tipped over while sinking: its front points down' : 'turned front-down', true);
  if (up > 0.5) w.upright = true; else if (up < -0.5) w.upright = false;
  if (w.sun !== undefined && sun > 0 && w.sun === 0) {   // dawn: can it see?
    const eyes = c.sensors.filter((s) => s.kind === 'light');
    if (eyes.length && eyes.every((s) => s.value < 0.02) && lightAt(world, c.q[1]) > 0.02) say('at dawn its eyespot faced away from the light', true);
    else say('dawn');
  }
  if (w.sun > 0 && sun === 0) say('dusk');
  for (const f of floats) if (f.crushed && !f.noted) { f.noted = true; say(`its gas vesicles were crushed ${depth.toFixed(0)} µm down`, true); }
  if (starch === 0 && w.starch > 0) say('its starch is used up');
  if (oil === 0 && w.oil > 0) say('its oil is used up');
  // too much light: said once as its plastids fall below 3/4 healthy, again once they have mended
  if (health !== null && health < 0.75 && !w.hurt) { w.hurt = true; say(`bright light damaged its plastids (${(100 * health).toFixed(0)}% healthy)`, true); }
  if (health !== null && health > 0.95 && w.hurt) { w.hurt = false; say('its plastids have mended'); }
  Object.assign(w, { starving, floor, top, sun, starch, oil });
}

// How many nights the cell's energy would last: the pool and its stores against its upkeep over a night
export function nightsLeft(c) {
  if (!c.metab) return null;
  let stored = c.metab.E;
  for (const i of c.pieces[0].inclusions) if (i.store) stored += i.fill * i.v * M[i.store].energy;
  return stored / (c.metab.upkeep * M.day / 2);
}

const fmtH = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
export const eventText = (e) => `${fmtH(e.h)} ${e.text}`;

// The day graph: the last day (or a forecast) in a strip at (x, y, w, h): night shaded, then depth (white, the surface
// at the top), energy (yellow), starch (cream), oil (gold), the float (blue) and plastid health (green); serious
// moments as red ticks
const LINES = [['depth', '#e8f0f4', 'depth'], ['E', '#ffd84a', 'energy'], ['starch', '#ece3c4', 'starch'], ['oil', '#f2a93c', 'oil'],
  ['gas', '#8fd0ff', 'float'], ['health', '#a6e36a', 'plastids']];
export function drawJournal(ctx, j, x, y, w, h, title) {
  ctx.fillStyle = 'rgba(6,10,18,.88)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#23324a'; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  const top = y + 16, gh = h - 22;
  ctx.font = '10px system-ui'; ctx.fillStyle = '#8197a8';
  if (!j || j.s.length < 2) { ctx.fillText(`${title}: watching… (a sample a second)`, x + 6, y + 12); return; }
  const s = j.s, t1 = s[s.length - 1].t, t0 = Math.max(s[0].t, t1 - M.day);
  const X = (t) => x + 4 + (w - 8) * (t - t0) / Math.max(M.day, 1e-9);
  // night
  ctx.fillStyle = 'rgba(40,50,90,.35)';
  for (let k = 1; k < s.length; k++) if (s[k].t >= t0 && s[k].sun === 0) ctx.fillRect(X(s[k - 1].t), top, X(s[k].t) - X(s[k - 1].t) + 0.5, gh);
  // lines
  for (const [key, color] of LINES) {
    if (s.every((p) => p[key] == null)) continue;
    ctx.strokeStyle = color; ctx.lineWidth = key === 'depth' ? 2 : 1.2; ctx.beginPath();
    let pen = false;
    for (const p of s) {
      if (p.t < t0 || p[key] == null) { pen = false; continue; }
      const v = key === 'depth' ? p.depth / TH : 1 - p[key];   // depth down from the top; shares up from the bottom
      const py = top + gh * Math.min(Math.max(v, 0), 1);
      if (pen) ctx.lineTo(X(p.t), py); else { ctx.moveTo(X(p.t), py); pen = true; }
    }
    ctx.stroke();
  }
  // serious moments
  ctx.fillStyle = '#ff5a4a';
  for (const e of j.ev) if (e.serious && e.t >= t0) ctx.fillRect(X(e.t) - 1, top, 2, gh);
  // title, legend, the latest serious moment
  ctx.fillStyle = '#8197a8'; ctx.fillText(title, x + 6, y + 12);
  let lx = x + 6 + ctx.measureText(title).width + 10;
  for (const [key, color, label] of LINES) {
    if (s.every((p) => p[key] == null)) continue;
    ctx.fillStyle = color; ctx.fillText(label, lx, y + 12); lx += ctx.measureText(label).width + 8;
  }
  const last = [...j.ev].reverse().find((e) => e.serious && e.t >= t0);
  if (last) {
    ctx.fillStyle = '#ff8a7a';
    const text = `⚠ ${eventText(last)}`;
    ctx.fillText(text, x + w - 6 - ctx.measureText(text).width, y + h - 6);
  }
}

// Test a day: a copy of the cell (its design, where it is, the time of day, its energy share) runs a sandbox day
// ahead, in slices so the page stays alive; onDone gets its journal
export function forecast(design, from, settings, onProgress, onDone) {
  const w = makeWorld(1, settings);
  w.steps = from.steps;
  const c = addCell(w, design, from.x, from.y, from.angle);
  if (c.metab && from.share !== undefined) c.metab.E = from.share * c.metab.C;
  if (from.damage) c.pieces[0].inclusions.filter((i) => i.material === 'plastid').forEach((i, k) => { i.damage = from.damage[k] || 0; });
  const end = w.steps + Math.round(M.day / DT);
  let cancelled = false;
  const slice = () => {
    if (cancelled) return;
    const until = performance.now() + 30;
    while (w.steps < end && performance.now() < until) { stepWorld(w); note(w, c); }
    onProgress((w.steps - from.steps) / (end - from.steps));
    if (w.steps < end) setTimeout(slice, 0); else onDone(c.journal);
  };
  setTimeout(slice, 0);
  return () => { cancelled = true; };
}
