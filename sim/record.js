// A match recorded (2026-11-13, the ladder; author: "players should know how it killed or got killed, how much it
// reproduced, how many died, when: a timeline of its life and events"). Read-only: it watches the world after each step
// and never changes it, so a recorded match plays out exactly as an unrecorded one. Three parts:
//   events  the timeline: births (divisions), deaths with their cause, tube latches and let-gos, swallows, harpoon and
//           tether shots, each with its day, depth and the two species
//   life    every LIFE steps, per species: living cells, mean / shallowest / deepest depth (its migration), mean energy
//           (0-1) and mean size (× newborn), for the report's graphs
//   frames  every FRAME steps, every cell: [uid, species index, x, y, angle°, radius, length, dead]: a light replay (it
//           plays back exactly what was scored, whatever the browser)
import { PARAMS } from './params.js';

const DT = PARAMS.time.dt, DAY = PARAMS.metab.day, TH = PARAMS.tank.h;
export const LIFE = Math.round(10 / DT), FRAME = Math.round(5 / DT);
const r1 = (v) => Math.round(v * 10) / 10;

export function newRecord(m) {
  const rec = { events: [], life: [], frames: [], names: m.names.slice(), seen: new Set(), last: new Map(), links: new Set() };
  for (const c of m.world.cells) rec.seen.add(c.uid);
  return rec;
}

const depthOf = (c) => Math.round(TH - c.q[1]);

// After a step, before the match empties world.gone
export function recordStep(rec, m) {
  const w = m.world, day = w.steps * DT / DAY, ev = (e) => rec.events.push({ day: Math.round(day * 1000) / 1000, ...e });
  // births: cells not seen before (a daughter knows her mother)
  for (const c of w.cells) if (!rec.seen.has(c.uid)) {
    rec.seen.add(c.uid);
    const n = w.cells.filter((x) => !x.dead && x.species === c.species).length;
    ev({ kind: 'born', species: c.species, uid: c.uid, mother: c.mother, depth: depthOf(c), cells: n });
  }
  // deaths, with their cause (a hunter's species is in the cause: "eaten whole by a X", "drained by a X", "killed by a X's harpoon")
  for (const c of w.gone || []) {
    const by = c.eatenBy || (/by an? (.+?)(?:'s|$)/.exec(c.diedWhy || '') || [])[1] || null;
    ev({ kind: 'died', species: c.species, uid: c.uid, why: c.diedWhy || 'starved', by, depth: depthOf(c),
      cells: w.cells.filter((x) => !x.dead && x !== c && x.species === c.species).length });
  }
  // what each cell did this step: compare the marks interact.js leaves with the ones seen last time
  for (const c of w.cells) {
    const was = rec.last.get(c.uid) || {};
    if (c.lastSwallow && c.lastSwallow !== was.sw) ev({ kind: 'swallowed', species: c.species, uid: c.uid, prey: c.lastSwallow.prey, n: c.lastSwallow.n, depth: depthOf(c) });
    if (c.lastShot && c.lastShot !== was.shot) ev({ kind: c.lastShot.tether ? 'tether' : 'harpoon', species: c.species, uid: c.uid, hit: c.lastShot.hit, kin: !!c.lastShot.kin, depth: depthOf(c) });
    if (c.lastMeal && c.lastMeal !== was.meal) ev({ kind: 'letgo', species: c.species, uid: c.uid, prey: c.lastMeal.prey, why: c.lastMeal.why, took: Math.round(c.lastMeal.took || 0), depth: depthOf(c) });
    rec.last.set(c.uid, { sw: c.lastSwallow, shot: c.lastShot, meal: c.lastMeal });
  }
  // tube latches: feed links not seen before
  for (const l of w.links || []) if (l.feed && !rec.links.has(l)) {
    rec.links.add(l);
    const A = w.cells[l.a], B = w.cells[l.b];
    if (A && B) ev({ kind: 'latched', species: A.species, uid: A.uid, prey: B.species, preyUid: B.uid, depth: depthOf(B) });
  }
  if (w.steps % LIFE === 0) {
    const row = { day: Math.round(day * 1000) / 1000, s: {} };
    for (const sp of rec.names) {
      const cs = w.cells.filter((c) => !c.dead && c.species === sp);
      if (!cs.length) { row.s[sp] = { n: 0 }; continue; }
      const d = cs.map(depthOf), e = cs.map((c) => (w.metab ? Math.max(0, c.metab.E / c.metab.C) : 1));
      row.s[sp] = { n: cs.length, d: Math.round(d.reduce((a, b) => a + b, 0) / d.length), lo: Math.min(...d), hi: Math.max(...d),
        e: Math.round(100 * e.reduce((a, b) => a + b, 0) / e.length) / 100, z: r1(cs.reduce((a, c) => a + (c.size || 1), 0) / cs.length) };
    }
    rec.life.push(row);
  }
  if (w.steps % FRAME === 0) {
    rec.frames.push({ day: Math.round(day * 1000) / 1000, c: w.cells.filter((c) => !c.eatenBy).map((c) => [c.uid, rec.names.indexOf(c.species), r1(c.q[0]), r1(c.q[1]),
      Math.round(c.q[2] * 180 / Math.PI), r1(c.pieces[0].a), r1(c.pieces[0].L || 0), c.dead ? 1 : 0]) });
  }
}

// The story of each species in numbers: born, died (by cause), kills it made, its most cells and when
export function lifeSummary(rec) {
  const out = {};
  for (const sp of rec.names) {
    const mine = rec.events.filter((e) => e.species === sp);
    const died = mine.filter((e) => e.kind === 'died');
    const causes = {};
    for (const d of died) causes[d.why] = (causes[d.why] || 0) + 1;
    const kills = rec.events.filter((e) => e.kind === 'died' && e.by === sp).length;
    let most = 0, mostDay = 0;
    for (const r of rec.life) if (r.s[sp] && r.s[sp].n > most) { most = r.s[sp].n; mostDay = r.day; }
    out[sp] = { born: mine.filter((e) => e.kind === 'born').length, died: died.length, causes, kills,
      latches: mine.filter((e) => e.kind === 'latched').length, shots: mine.filter((e) => e.kind === 'harpoon').length,
      hits: mine.filter((e) => e.kind === 'harpoon' && e.hit && !e.kin).length, most, mostDay };
  }
  return out;
}
