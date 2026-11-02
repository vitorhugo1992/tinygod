// The journal: what happened to a cell over the last day (depth, energy, stores, float, plastids, light), and the moments that
// explain its fate (running out of energy, tipping over, the floor, a store used up...), for the day graph and the
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
  // buoyancy chambers: 1 light (floating), 0 heavy (sinking), neutral between
  const ch = inc.filter((i) => i.material === 'chamber');
  const gas = ch.length ? ch.reduce((a, i) => a + (PARAMS.chamber.heavy - i.density) / (PARAMS.chamber.heavy - PARAMS.chamber.light), 0) / ch.length : null;
  const sun = world.light ? (world.day ? daylight(world) : 1) : 0;
  const up = Math.sin(c.q[2]);   // 1: its front points straight up
  const health = inc.some((i) => i.material === 'plastid') ? plastidHealth(world, c) : null;
  const g = world.grow ? c.grow : null;
  const gE = g ? Math.min(1, g.E / g.Eneed) : null, gN = g ? Math.min(1, g.N / g.Nneed) : null;
  j.s.push({ t, depth, E, starch, oil, gas, health, sun, up, gE, gN });
  if (j.s.length > KEEP) j.s.shift();
  // how squarely each eyespot has faced the light lately (its reading against the light there; ~1 min memory), for the
  // rule maps
  const here = lightAt(world, c.q[1]);
  if (here > 0.01) for (const s of c.sensors) if (s.kind === 'light') {
    const f = Math.min(1, s.value / here), face = j.face || (j.face = {});
    face[s.id] = face[s.id] === undefined ? f : face[s.id] * 0.98 + f * 0.02;
  }

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
    const L = lightAt(world, c.q[1]);   // facing away, an eyespot sees only the scattered share
    if (eyes.length && L > 0.02 && eyes.every((s) => s.value <= PARAMS.sensor.scatter * L * 1.01 + 1e-9)) say('at dawn its eyespot faced away from the light', true);
    else say('dawn');
  }
  if (w.sun > 0 && sun === 0) say('dusk');
  if (starch === 0 && w.starch > 0) say('its starch is used up');
  if (oil === 0 && w.oil > 0) say('its oil is used up');
  if (c.resting && !w.resting) say('began resting (metabolism slowed)');
  if (!c.resting && w.resting) say('woke from resting');
  w.resting = !!c.resting;
  // too much light: said once as its plastids fall below 3/4 healthy, again once they have mended
  if (health !== null && health < 0.75 && !w.hurt) { w.hurt = true; say(`bright light damaged its plastids (${(100 * health).toFixed(0)}% healthy)`, true); }
  if (health !== null && health > 0.95 && w.hurt) { w.hurt = false; say('its plastids have mended'); }
  if ((c.gen || 0) > (w.gen ?? (c.born !== undefined ? c.gen : 0))) say(`divided: two cells now (generation ${c.gen})`);
  if (c.born !== undefined && w.gen === undefined) say(`born by division (generation ${c.gen})`);
  if (c.dead && !w.dead) say(`died: ${c.diedWhy || 'starved'} (${Math.round(depth)} µm deep, ${Math.round(PARAMS.grow.die)} s without energy)`, true);
  w.dead = !!c.dead;
  // the peduncle: latching, letting go, being fed on
  const feeding = (c.feeders || []).find((f) => f.link);
  if (feeding && !w.feeding) {
    const prey = world.cells[feeding.link.b], price = feeding.link.price ?? feeding.cost;
    say(`latched onto a ${prey.species} (${Math.round(price / 1000)}k pJ to pierce${prey.pieces[0].plates ? `: plated, ×${(price / feeding.cost).toFixed(1)}` : ''})`);
  }
  // touching a plated prey it can't afford to pierce: said once per prey species until it latches on something
  if (c.cantPierce && w.cantPierce !== c.cantPierce.prey) say(`can't afford to pierce a plated ${c.cantPierce.prey} (${Math.round(c.cantPierce.price / 1000)}k pJ; it has ${Math.round(c.metab.E / 1000)}k)`);
  if (c.cantPierce) w.cantPierce = c.cantPierce.prey; else if (feeding) w.cantPierce = null;
  if (!feeding && w.feeding && c.lastMeal) {
    const why = { drained: 'nothing left', died: 'it died', rule: 'its rule let go', torn: 'torn off' }[c.lastMeal.why];
    say(`let go of a ${c.lastMeal.prey} (${why}): took ${Math.round(c.lastMeal.took / 1000)}k pJ, kept ${Math.round(100 * PARAMS.feed.keep)}%`);
  }
  w.feeding = !!feeding;
  const eaten = (world.links || []).find((l) => l.feed && world.cells[l.b] === c);
  if (eaten && !w.eaten) say(`a ${world.cells[eaten.a].species} latched on: it is being drained`, true);
  if (!eaten && w.eaten) say('the predator let go');
  w.eaten = !!eaten;
  if (c.waiting && c.waiting !== w.waiting) say(`ready to divide, but waits: ${c.waiting}`);
  if (gE === 1 && w.gE < 1) say(gN === 1 ? 'has the energy for a division: ready to divide' : 'has the energy for a division (nitrogen still short)');
  if (gN === 1 && w.gN < 1) say(gE === 1 ? 'has the nitrogen for a division: ready to divide' : 'has the nitrogen for a division (energy still short)');
  Object.assign(w, { starving, floor, top, sun, starch, oil, gE, gN, gen: c.gen || 0, waiting: c.waiting });
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
  ['gas', '#8fd0ff', 'float'], ['health', '#a6e36a', 'plastids'], ['gE', '#ff8fd2', 'growth ⚡'], ['gN', '#d9b46a', 'growth N']];
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
  if (from.grow && c.grow) { c.grow.E = from.grow.E * c.grow.Eneed; c.grow.N = from.grow.N * c.grow.Nneed; }
  if (from.nitro && w.nitro) w.nitro.c.set(from.nitro);
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

// The census: how many living cells of each species the tank holds, every CENSUS_EVERY steps (5 s), ten days kept,
// for the population graph. It lives on the world (rebuilds carry it over).
const CENSUS_EVERY = 5000, CENSUS_KEEP = 10 * M.day / 5;
const POP_COLORS = ['#7fd6ff', '#ffb35c', '#a6e36a', '#ff7fa8', '#c9a2ff', '#ffe066', '#5ce0c0', '#ff8a5c'];
export function census(world) {
  if (world.steps % CENSUS_EVERY) return;
  const c = world.census || (world.census = { s: [], colors: {} });
  const n = {};
  for (const k of world.cells) if (!k.dead) n[k.species] = (n[k.species] || 0) + 1;
  for (const sp of Object.keys(n)) if (!c.colors[sp]) c.colors[sp] = POP_COLORS[Object.keys(c.colors).length % POP_COLORS.length];
  c.s.push({ t: worldTime(world), sun: world.light ? (world.day ? daylight(world) : 1) : 0, n,
    births: world.births || 0, deaths: world.deaths || 0 });
  if (c.s.length > CENSUS_KEEP) c.s.shift();
}

// The population graph: cells of each species over the census kept (up to ten days), nights shaded, a line per species
// in its colour, the counts now in the legend; days marked along the bottom
export function drawCensus(ctx, cz, x, y, w, h) {
  ctx.fillStyle = 'rgba(6,10,18,.88)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#23324a'; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  const top = y + 21, gh = h - 35;
  ctx.font = '10px system-ui'; ctx.fillStyle = '#8197a8';
  if (!cz || cz.s.length < 2) { ctx.fillText('population: counting… (every 5 s)', x + 6, y + 12); return; }
  const s = cz.s, t0 = s[0].t, t1 = s[s.length - 1].t, span = Math.max(t1 - t0, M.day / 4);
  const X = (t) => x + 4 + (w - 8) * (t - t0) / span;
  const species = Object.keys(cz.colors);
  let max = 1;
  for (const p of s) for (const sp of species) max = Math.max(max, p.n[sp] || 0);
  const Y = (n) => top + gh * (1 - n / max);
  ctx.fillStyle = 'rgba(40,50,90,.35)';
  for (let k = 1; k < s.length; k++) if (s[k].sun === 0) ctx.fillRect(X(s[k - 1].t), top, X(s[k].t) - X(s[k - 1].t) + 0.5, gh);
  // a faint line at each whole count when few, at the top count always
  ctx.strokeStyle = '#1c2a40'; ctx.lineWidth = 1;
  const step = max <= 6 ? 1 : max <= 30 ? 5 : 10;
  for (let n = step; n <= max; n += step) { ctx.beginPath(); ctx.moveTo(x + 4, Y(n) + 0.5); ctx.lineTo(x + w - 4, Y(n) + 0.5); ctx.stroke(); }
  ctx.fillStyle = '#5d7085'; ctx.fillText(String(max), x + w - 4 - ctx.measureText(String(max)).width, Y(max) + 10);
  // a line per species, in steps (counts change by whole cells)
  // (each species a little apart, so equal counts don't hide each other)
  species.forEach((sp, i) => {
    const off = (i - (species.length - 1) / 2) * 1.8;
    ctx.strokeStyle = cz.colors[sp]; ctx.lineWidth = 1.6; ctx.beginPath();
    let prev = null;
    for (const p of s) {
      const py = Y(p.n[sp] || 0) + off;
      if (prev === null) ctx.moveTo(X(p.t), py); else { ctx.lineTo(X(p.t), prev); ctx.lineTo(X(p.t), py); }
      prev = py;
    }
    ctx.stroke();
  });
  // days along the bottom (day 1 begins at the world's start)
  const now = s[s.length - 1], tally = `${now.births} births · ${now.deaths} deaths`;
  const room = x + w - 12 - ctx.measureText(tally).width;   // day labels stop short of the tally
  ctx.fillStyle = '#5d7085';
  const d0 = Math.ceil(t0 / M.day), d1 = Math.floor(t1 / M.day), every = Math.max(1, Math.ceil((d1 - d0 + 1) / 8));
  for (let d = d0; d <= d1; d += every) { const px = X(d * M.day); ctx.fillRect(px, top + gh, 1, 4); if (px + 2 + ctx.measureText(`day ${d + 1}`).width < room) ctx.fillText(`day ${d + 1}`, px + 2, y + h - 4); }
  // title and legend: each species with its count now
  ctx.fillStyle = '#8197a8'; ctx.fillText('population ⇄', x + 6, y + 12);
  let lx = x + 6 + ctx.measureText('population ⇄').width + 10;
  for (const sp of species) {
    const label = `${sp} ${now.n[sp] || 0}`;
    ctx.fillStyle = cz.colors[sp]; ctx.fillText(label, lx, y + 12); lx += ctx.measureText(label).width + 8;
  }
  ctx.fillStyle = '#8197a8'; ctx.fillText(tally, x + w - 6 - ctx.measureText(tally).width, y + h - 4);
}
