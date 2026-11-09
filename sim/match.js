// A match (2026-11-09): a few species in one tank, `each` cells of each at spots the seed picks, moving water, `days`
// sandbox days. The score is the tournament's: a species' living biomass ÷ what it started with, averaged over a census
// at the start and at every half day. Pure: the sandbox's worker (sandbox/match-worker.js) and tools/match.mjs share it.
// The same entries and seed always give the same match.
import { PARAMS } from './params.js';
import { makeWorld, addCell, stepWorld } from './world.js';
import { prepEntry } from './entry.js';
import { startSpots } from './start.js';

const DAY = PARAMS.metab.day, DT = PARAMS.time.dt, TH = PARAMS.tank.h;
const HALF = Math.round(DAY / 2 / DT);   // steps between censuses
const POP = Math.round(10 / DT);         // steps between the counts the graph draws
const vol = (c) => c.pieces[0].volume;

// entries: [{ name, design }], names all different
export function newMatch({ entries, seed = 1, days = 3, each = 4, cap = 40 }) {
  const world = makeWorld(seed, { day: true, metab: true, grow: true, flow: true });
  const names = entries.map((e) => e.name), n = names.length;
  const spots = startSpots(seed, n * each);
  const m = { world, names, seed, days, each, cap, end: Math.round(days * DAY / DT), over: false,
    bio0: {}, growSum: {}, censuses: 0, census: [], pop: [], deaths: [] };
  entries.forEach((e, i) => {
    const d = prepEntry(e.design);
    d.name = d.species = e.name;
    m.bio0[e.name] = 0; m.growSum[e.name] = 0;
    for (let k = 0; k < each; k++) { const s = spots[i + k * n]; m.bio0[e.name] += vol(addCell(world, d, s.x, s.y, 0)); }
  });
  count(m, true);
  return m;
}

// The living cells and biomass of each species now; a census also counts toward the score
function count(m, census) {
  const w = m.world, n = {}, bio = {};
  for (const s of m.names) { n[s] = 0; bio[s] = 0; }
  for (const c of w.cells) if (!c.dead && n[c.species] !== undefined) { n[c.species]++; bio[c.species] += vol(c); }
  const day = w.steps * DT / DAY;
  m.pop.push({ day, n });
  if (!census) return;
  m.censuses++;
  for (const s of m.names) m.growSum[s] += bio[s] / m.bio0[s];
  m.census.push({ day, n, grow: Object.fromEntries(m.names.map((s) => [s, bio[s] / m.bio0[s]])) });
}

export function stepMatch(m, steps) {
  const w = m.world;
  PARAMS.grow.cap = m.cap;
  for (let k = 0; k < steps && !m.over; k++) {
    stepWorld(w);
    if (w.gone && w.gone.length) {
      for (const c of w.gone) m.deaths.push({ species: c.species, why: c.diedWhy || 'starved', day: (c.diedAt ?? w.steps) * DT / DAY, depth: Math.round(TH - c.q[1]) });
      w.gone.length = 0;
    }
    if (w.steps % HALF === 0) count(m, true); else if (w.steps % POP === 0) count(m, false);
    if (w.steps >= m.end) m.over = true;
  }
}

// How far it is, and each species so far: score (mean growth), growth now, living cells, its deaths
export function matchResult(m) {
  const last = m.pop[m.pop.length - 1], lastC = m.census[m.census.length - 1];
  return { day: m.world.steps * DT / DAY, days: m.days, over: m.over, seed: m.seed, each: m.each,
    species: m.names.map((s) => ({ name: s, score: m.growSum[s] / m.censuses, now: lastC.grow[s], cells: last.n[s],
      deaths: m.deaths.filter((d) => d.species === s) })) };
}

// ★ alive at the end · ★★ a higher score than every rival · ★★★ twice the best rival's score
export function matchStars(result, you) {
  const me = result.species.find((s) => s.name === you), best = Math.max(...result.species.filter((s) => s.name !== you).map((s) => s.score));
  if (!me || !result.over || !me.cells) return 0;
  return me.score >= 2 * best ? 3 : me.score > best ? 2 : 1;
}

// A species' deaths in words: "3 starved (day 0.4-1.2, 1,950-1,990 µm deep)"
export function deathsText(deaths) {
  const by = {};
  for (const d of deaths) (by[d.why] ||= []).push(d);
  const range = (a, f) => { const lo = Math.min(...a), hi = Math.max(...a); return lo === hi ? f(lo) : `${f(lo)}-${f(hi)}`; };
  return Object.entries(by).sort((a, b) => b[1].length - a[1].length).map(([why, l]) =>
    `${l.length} ${why} (day ${range(l.map((d) => d.day), (v) => v.toFixed(1))}, ${range(l.map((d) => d.depth), (v) => Math.round(v).toLocaleString('en'))} µm deep)`).join('; ');
}
