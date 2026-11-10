// Missions (author, 2026-11-07: "a system that rewards slow but steady progress"): short goals, each teaching one tool.
// A mission hands you a cell that almost works; you add the one missing thing. The simulation judges: each star is a
// goal (alive at a time, above a depth by a time, out of the glare, a part under a size) that is decided as the tank
// runs, and a mission ends when every star is decided. Pure (no DOM): the sandbox and tools/missions-check.mjs share it.
import { PARAMS } from '../sim/params.js';
import { makeWorld, addCell } from '../sim/world.js';
import { PART_TEMPLATES } from './parts.js';
import { prepEntry } from '../sim/entry.js';

const M = PARAMS.metab, TH = PARAMS.tank.h, DT = PARAMS.time.dt;
const HOUR = M.day / 24;   // sim seconds in an hour of the day

// A part as the Build panel makes it (its build record, so Edit can change it)
export function part(body, tpl, where, id, size, depth = 1, extra = {}) {
  const ps = PART_TEMPLATES[tpl](body, where, id, size, extra.tilt || 0, depth, 'strangers', extra.len, undefined, extra.content, extra.pull);
  ps[0].build = { tpl, where, tilt: extra.tilt || 0, size, depth, feels: 'strangers', flip: false, id,
    ...(extra.content ? { content: extra.content } : {}), ...(extra.len ? { length: extra.len } : {}), ...(extra.pull ? { pull: true } : {}) };
  return ps;
}
const rule = (sensor, min, max) => [{ sensor, min, max }];

// ----- the cells the missions hand you -----
const ROUND = { radius: 10 };
const nucleus = (body, where, rest) => {
  const n = part(body, 'Nucleus (the brain)', where, 'nucleus', 0.35);
  n[0].joint = rest ? { type: 'rest', controls: rule('eye', 0, rest) } : { type: 'rest' };
  return n;
};
// chapter 2's drifter: a rod with room in front for a buoyancy chamber
const ROD = { radius: 10, length: 34 };
const drifter = (rest) => [
  ...nucleus(ROD, 180, rest),
  { type: 'inclusion', id: 'plastid', label: 'Plastid', at: [-6, 4], radius: 4.5, length: 16, material: 'plastid', pigment: 'sun' },
  { type: 'inclusion', id: 'store', label: 'Energy store', at: [-5, -6.3], radius: 3, length: 14, material: 'starch' },
  ...part(ROD, 'Light sensor (eyespot)', 0, 'eye', 1),
];
const chamber = (below = 0.25) => { const c = part(ROD, 'Buoyancy chamber', 0, 'chamber', 1); c[0].joint.controls = rule('eye', 0, below); return c; };
// chapter 3's surface drifter: a longer rod (20 × 70 µm) whose rod-shaped chamber keeps it in the bright water, with a gap
// between the chamber and the plastid for one more organelle
const LONG = { radius: 10, length: 50 };
const surfaceDrifter = () => {
  const n = nucleus(LONG, 180, 0.01), c = part(LONG, 'Buoyancy chamber', 0, 'chamber', 1, 1, { len: 4 });
  c[0].joint.controls = rule('eye', 0, 0.6);
  return [...n,
    { type: 'inclusion', id: 'plastid', label: 'Plastid', at: [-14, 4], radius: 4.5, length: 16, material: 'plastid', pigment: 'sun' },
    { type: 'inclusion', id: 'store', label: 'Energy store', at: [-13, -6.3], radius: 3, length: 14, material: 'starch' },
    ...part(LONG, 'Light sensor (eyespot)', 0, 'eye', 1), ...c];
};
// chapter 2's swimmer: round, plastids on both sides, an oil store and an eyespot in front, resting in the dark
const swimmer = () => [
  ...nucleus(ROUND, 180, 0.01),
  ...part(ROUND, 'Plastid (makes energy)', 90, 'plastidA', 0.4), ...part(ROUND, 'Plastid (makes energy)', 270, 'plastidB', 0.4),
  ...part(ROUND, 'Energy store', 0, 'oil', 0.4, 1, { content: 'oil' }), ...part(ROUND, 'Light sensor (eyespot)', 0, 'eye', 1),
];
export const tail = (min, max, where = 0, pull = true) => {
  const t = part(ROUND, 'Wave tail (swims)', where, 'tail', 0.4, 1, { len: 48, pull });
  for (const s of t) if (s.joint && s.joint.type === 'motor') s.joint.controls = rule('eye', min, max);
  return t;
};

// ----- the missions -----
// start: the clock hour, depth (µm), angle; settings: still water. stars[0] is the goal; the others need it too. Each
// condition: { alive: hour } alive then · { above: µm, by: hour } shallower than that by then · { above: µm, at: hour } alive
// and shallower than that at that hour · { below: µm, from, to }
// never shallower than that between the two hours (and alive) · { deeper: µm, from, to } never deeper (off the floor) · { share: material, max } that part under a share of the
// cell's volume. An hour is its first time after the start; day: 1 the next time after that.
// Chapter 3 on (2026-11-10): { grown: ×, by, day } any cell of it that many times its newborn volume by then (or already
// divided) · { cells: n, by, day } that many living cells of it by then. `about`: what a mission with no new part teaches.
export const CHAPTERS = ['Staying alive', 'Your first rules', 'Growing', 'Other species'];
// Chapter 4's swallower: Claude's Gula (designs/gula.json) widened to r 22, so its mouths (gape: half its radius, 11 µm)
// take a cell 20 µm across; it sinks to the floor and lies there
const GULPER = {"body":{"radius":22,"length":66},"parts":[{"type":"inclusion","id":"float","material":"chamber","at":[32.34,0],"radius":14.4,"length":1.33,"joint":{"type":"chamber","controls":[{"sensor":"e0","min":0,"max":0.12,"also":[{"sensor":"e1","min":0,"max":0.12},{"sensor":"e2","min":0,"max":0.12}],"all":true},{"sensor":"e0","min":0.005,"max":1,"also":[{"sensor":"e1","min":0.005,"max":1},{"sensor":"e2","min":0.005,"max":1}]},{"sensor":"near","min":0.7,"max":1,"or":true}]}},{"type":"inclusion","id":"plastid","material":"plastid","at":[1.81,0],"radius":14.4,"length":1.33,"pigment":"shade"},{"type":"inclusion","id":"oil","material":"oil","at":[-23.71,0],"radius":10.05},{"type":"inclusion","id":"nucleus","material":"nucleus","at":[-38.46,0],"radius":4.3,"joint":{"type":"rest","controls":[{"sensor":"energy","min":0,"max":0.4}]}},{"type":"sensor","id":"e0","kind":"light","cone":180,"at":[55,0],"angle":0},{"type":"sensor","id":"e1","kind":"light","cone":180,"at":[16.5,22],"angle":90},{"type":"sensor","id":"e2","kind":"light","cone":180,"at":[16.5,-22],"angle":270},{"type":"sensor","id":"near","kind":"near","at":[0,-22],"angle":270,"range":150,"feels":"anything"},{"type":"mouth","id":"mouthF","at":[55,0],"joint":{"type":"engulf"}},{"type":"mouth","id":"mouthL","at":[-16.5,22],"joint":{"type":"engulf"}},{"type":"mouth","id":"mouthR","at":[-16.5,-22],"joint":{"type":"engulf"}},{"type":"mouth","id":"mouthB","at":[-55,0],"joint":{"type":"engulf"}}]};
export const MISSIONS = [
  { id: 'm1', chapter: 0, title: 'Catch the light', teaches: ['Plastid (makes energy)'],
    story: 'This cell has a nucleus and nothing to live on: it starves before noon.',
    task: 'Add a plastid: it turns light into energy.',
    design: { body: ROUND, parts: nucleus(ROUND, 270) },
    start: { hour: 7, depth: 100, angle: 90 },
    stars: [
      { text: 'Alive at 13:00', all: [{ alive: 13 }], hint: 'Nothing in it makes energy. Add → Plastid, then ＋ Add to body.' },
      { text: 'Alive at dusk (18:00)', all: [{ alive: 18 }], hint: 'Its plastid can\'t pay for the whole cell: make it bigger (Size).' },
      { text: 'Alive at dusk with a plastid under 7% of the cell', all: [{ alive: 18 }, { share: 'plastid', max: 0.07 }],
        hint: 'A smaller plastid costs less to keep: shrink it (Size; the line under it says how much of the cell it is) and see if it still pays.' },
    ] },
  { id: 'm2', chapter: 0, title: 'Survive the night', teaches: ['Energy store'],
    story: 'It earns well by day, but has nothing put by: it starves soon after dark.',
    task: 'Add an energy store: it fills with the day\'s surplus and pays for the night.',
    design: { body: ROUND, parts: [...nucleus(ROUND, 270), ...part(ROUND, 'Plastid (makes energy)', 45, 'plastid', 0.5)] },
    start: { hour: 11, depth: 50, angle: 90 },
    stars: [
      { text: 'Alive at midnight', all: [{ alive: 0 }], hint: 'Nothing carries it through the dark. Add → Energy store.' },
      { text: 'Alive at 04:00', all: [{ alive: 4 }], hint: 'The store runs out before morning: make it bigger.' },
      { text: 'Alive at 08:00', all: [{ alive: 8 }],
        hint: 'On the floor at dawn there is too little light to refill. A bigger store, or Oil (Content): it holds more for its room and is light, so the cell sinks slower.' },
    ] },
  { id: 'm3', chapter: 1, title: 'Stay off the floor', teaches: ['Buoyancy chamber'],
    story: 'Cells are heavier than water: this one sinks to the dark floor and wastes the day there.',
    task: 'Add a buoyancy chamber at the front, as big as it goes, and give it a rule: it floats when its eyespot sees little light.',
    design: { body: ROD, parts: drifter() },
    start: { hour: 7, depth: 800, angle: 0 },
    stars: [
      { text: 'Off the floor at noon', all: [{ above: 1900, at: 12 }],
        hint: 'It still sinks. A chamber lifts only when it is big (about a quarter of the cell: Size all the way) and only while its rule says Float: open its card and tap "+ when…".' },
      { text: 'Above 1,200 µm at 16:00', all: [{ above: 1200, at: 16 }],
        hint: 'It rises too slowly: a bigger chamber lifts harder; "floats when the eyespot sees less than 25%" keeps it rising until the light is good.' },
      { text: 'Alive at dawn', all: [{ alive: 6 }],
        hint: 'Floating all night costs energy and the store is small. (The next mission has a better answer.)' },
    ] },
  { id: 'm4', chapter: 1, title: 'Sleep through the night', teaches: ['Light sensor (eyespot)'],
    story: 'It lives the day well, but burns its store awake all night and starves before dawn.',
    task: 'Tap the nucleus\'s card (Rests when…) and make it rest when its eyespot sees less than 1%: resting costs less than half.',
    design: { body: ROD, parts: [...drifter(), ...chamber()] },
    start: { hour: 14, depth: 1000, angle: 0 },
    stars: [
      { text: 'Alive at dawn', all: [{ alive: 6 }], hint: 'Make it rest in the dark: the nucleus\'s card, Rests when… the eyespot sees less than 1%.' },
      { text: 'Alive at 10:00', all: [{ alive: 10 }], hint: 'It should wake when the light comes back: rest only when the eyespot sees almost nothing (less than 1%).' },
      { text: 'Alive at noon, never on the floor', all: [{ alive: 12 }, { deeper: 1950, from: 15, to: 12 }],
        hint: 'Resting, it sinks. If it rests too long it reaches the floor: rest only in true darkness.' },
    ] },
  { id: 'm5', chapter: 1, title: 'Swim', teaches: ['Wave tail (swims)'],
    story: 'A round swimmer without its tail: it lies on the floor in the dark.',
    task: 'Add a wave tail at the FRONT (Where 0°) with ⇠ Pull on: it pulls the cell up after it (behind, it would push the cell over). Then make it run while the eyespot sees less than 25%.',
    builder: { where: 0, pull: true },   // the Add panel opens set this way
    design: { body: ROUND, parts: swimmer() },
    start: { hour: 6.5, depth: 1990, angle: 90 },
    stars: [
      { text: 'Up in the light: above 1,000 µm by noon', all: [{ above: 1000, by: 12 }],
        hint: 'A tail at the back pushes, and the cell tips front-down into the floor. Put it at the front (Where 0°) and turn on ⇠ Pull: it pulls the cell after it.' },
      { text: 'Above 1,000 µm by 09:00', all: [{ above: 1000, by: 9 }], hint: 'Climb faster: let the tail run whenever the light is dim (its card: Runs when the eyespot sees less than 25%).' },
      { text: 'Back above 1,000 µm by 08:00 the next morning', all: [{ above: 1000, by: 8, after: 20 }],
        hint: 'It sinks while it rests at night: it must wake and swim again at dawn. Rest only in true darkness.' },
    ] },
  { id: 'm6', chapter: 1, title: 'Fix the rule', teaches: [],
    story: 'Someone wired this tail the wrong way round: it runs only in bright light, so it never leaves the dark floor.',
    task: 'Open the tail\'s card and turn its rule round: run while the eyespot sees LESS than 25%.',
    design: { body: ROUND, parts: [...swimmer(), ...tail(0.25, 1)] },
    start: { hour: 6.5, depth: 1990, angle: 90 },
    stars: [
      { text: 'Up in the light: above 1,000 µm by noon', all: [{ above: 1000, by: 12 }], hint: 'Tap the tail\'s rule ("sees more than 25%") and drag the range to the dim end, or tap the zone "dim".' },
      { text: 'Out of the glare: never above 400 µm from 10:00 to 16:00', all: [{ below: 400, from: 10, to: 16 }],
        hint: 'It swims too high, where noon light hurts its plastids: stop the tail at less light (a lower number).' },
      { text: 'Above 1,000 µm by 09:00', all: [{ above: 1000, by: 9 }], hint: 'Climb sooner: the tail should run in dim light as well as dark.' },
    ] },
  // Chapter 3. Measured (2026-11-10, this cell from 800 µm at 07:00, still water): floating below 60% it sits at ~30 µm
  // with its energy bar full and its nitrogen bar near empty: 1.3× after 2 days, 1.5× after 4, never two cells; below
  // 45%: 1.8× after 4 days; below 35%: two cells at day 2.42; below 25%: 1.7× at day 2, two cells at day 2.27; below 15%
  // or less it rides too deep and starves on the second night.
  { id: 'm7', chapter: 2, title: 'Feed in the deep', teaches: [], about: 'the growth meter: energy and nitrogen',
    story: 'It floats in the bright water near the surface. On its growth meter (🌱) the energy bar ⚡ is full and the nitrogen bar N is almost empty: the surface is poor in nitrogen, the deep is rich. It never grows enough to divide.',
    task: 'Open the chamber\'s card and make it float only in dimmer light: by day it then rides deeper, where it can feed. Not too deep: in the dark it starves.',
    design: { body: ROD, parts: [...drifter(0.01), ...chamber(0.6)] },
    start: { hour: 7, depth: 800, angle: 0 },
    stars: [
      { text: 'Grown to 1.5× its newborn size by 07:00 on day 3', all: [{ grown: 1.5, by: 7, day: 1 }],
        hint: 'Growth needs both bars: it has the energy, not the nitrogen. Let it sink deeper by day: the chamber should float only when the eyespot sees less light (a lower number than 60%). If it starved, it rode too deep in the dark: a higher number.' },
      { text: 'Two cells by 07:00 on day 4', all: [{ cells: 2, by: 7, day: 2 }],
        hint: 'It grows, but too slowly to divide in time: it still spends too long in poor water. Float at less light.' },
      { text: 'Two cells by 15:00 on day 3', all: [{ cells: 2, by: 15, day: 2 }],
        hint: 'A little deeper still by day (try 25%). Much lower and it rides in the dark and starves.' },
    ] },
  // Measured (2026-11-10, from 100 µm at 07:00, still water, 5 days), nitroplast as the Add panel places it: none 1.3×,
  // never two cells; 1.2% of the cell 1.9×; 2.3% two cells at day 3.30, 3.1% at 3.02, 3.9% at 3.33, 5.0% at 4.37; 6.3% and
  // up: the nitrogen bar fills, the energy bar empties (the nitroplast spends what the plastid earns), never two cells. By
  // day 3: none 1.2×, the default (0.5%) 1.3×: hence ★ at 1.3×.
  { id: 'm8', chapter: 2, title: 'Make your own nitrogen', teaches: ['Nitroplast (fixes nitrogen)'],
    story: 'This one lives in the bright upper water and has energy to spare, but the water up here has almost no nitrogen, and it has no way to fetch it from the deep.',
    task: 'Add a nitroplast: it turns spare energy into nitrogen. Watch both bars of its growth meter (🌱): too small does little, too big eats all its energy.',
    design: { body: LONG, parts: surfaceDrifter() },
    start: { hour: 7, depth: 100, angle: 0 },
    stars: [
      { text: 'Grown to 1.3× its newborn size by 07:00 on day 4', all: [{ grown: 1.3, by: 7, day: 2 }],
        hint: 'Its nitrogen bar barely moves: Add → Nitroplast, then ＋ Add to body. Already has one? Make it bigger (Size).' },
      { text: 'Two cells by 19:00 on day 5', all: [{ cells: 2, by: 19, day: 4 }],
        hint: 'Watch the growth meter: if the nitrogen bar (N) still lags, make the nitroplast bigger; if the energy bar (⚡) sits empty, it is too big: smaller.' },
      { text: 'Two cells by 19:00 on day 4', all: [{ cells: 2, by: 19, day: 3 }],
        hint: 'Close: find the size where both bars fill together (about 2-4% of the cell; the line under Size says how much it is).' },
    ] },
  // Measured (2026-11-10): eaten at once with no spines, two (front and back, or the sides), or four at 60/120/240/300
  // (a gap front and back); three spread round (90/210/330), 6-100 µm, are safe, all climb by ~08:00-10:30 and live two
  // nights (spines' drag and upkeep don't decide anything here, so the stars count spines: spread them well).
  // Chapter 4. The swimmer starts touching the swallower's upper mouth (author chose this over a chance meeting, so the
  // verdict is the cell's size, not luck): a mouth takes a cell whose narrowest width, spines included, fits its gape.
  { id: 'm9', chapter: 3, title: 'Too spiky to swallow', teaches: ['Spine'],
    story: 'A swallower lies on the floor, and this swimmer starts right on its mouth. A mouth takes any cell that fits across it: this one, 20 µm wide, does.',
    task: 'Add spines so it no longer fits: a mouth takes a cell if it fits across it any way round, so spread them (two leave a narrow way in).',
    design: { body: ROUND, parts: [...swimmer(), ...tail(0, 0.25)] },
    start: { hour: 6.5, depth: 1944.5, angle: 90, rivals: [{ name: 'Gulper', design: GULPER, dx: 16.5, y: 22.5, angle: 0 }] },
    stars: [
      { text: 'Not eaten: alive at 08:00', all: [{ alive: 8 }],
        hint: 'It still fits across the mouth some way round. Add → Spine, and spread them round the cell: its narrowest width, spines included, must be over 22 µm.' },
      { text: 'Not eaten, with 4 spines or fewer', all: [{ alive: 8 }, { parts: 'Spine', max: 4 }],
        hint: 'Safe, but with more spines than it needs: spread fewer of them evenly round the cell.' },
      { text: 'Not eaten, with only 3 spines', all: [{ alive: 8 }, { parts: 'Spine', max: 3 }],
        hint: 'Three can do it, a third of the way round from each other (say 90°, 210°, 330°).' },
    ] },
];

// The other cells a mission puts in its tank (m.start.rivals: { name, design, dx from the player's cell, y above the
// floor, angle }); the sandbox's reset and the check both call it
export function addRivals(world, m, cell) {
  for (const r of (m.start && m.start.rivals) || []) {
    const d = prepEntry(r.design);
    d.name = d.species = r.name;
    addCell(world, d, cell.q[0] + (r.dx || 0), r.y, r.angle || 0);
  }
}

// ----- time: a clock hour as sim seconds after the start -----
function wait(m, h, day = 0, after = 0) {   // after: count only times at least this many hours after the start
  let d = h - m.start.hour; d -= 24 * Math.floor(d / 24); if (d === 0) d = 24;
  while (d < after) d += 24;
  return (d + 24 * day) * HOUR;
}
export const stepsAt = (h) => { let t = ((h - 6) / 24 - M.dawn) * M.day; t -= M.day * Math.floor(t / M.day); return Math.round(t / DT); };

// A mission's tank: still water, the cell where the mission puts it, at its hour
export function startWorld(m, design) {
  const w = makeWorld(1, { gravity: true, light: true, day: true, flow: false, metab: true, grow: true });
  w.steps = stepsAt(m.start.hour);
  const s = m.start;
  const c = addCell(w, design, s.x ?? PARAMS.tank.w / 2, TH - s.depth, s.angle ?? 0);
  addRivals(w, m, c);
  return { world: w, cell: c };
}

// ----- the judge: sample the mission's cell once a sim second; each star won, lost or not yet -----
export function judge(m, world, cell) {
  const t0 = world.steps;
  const body = cell.pieces[0];
  const shareOf = (mat) => body.inclusions.filter((i) => i.material === mat && !i.stolen).reduce((s, i) => s + i.v, 0) / body.volume;
  const J = { m, t0, t: 0, dead: false, diedT: null, samples: [], status: [], over: false };
  const decidedBy = (c) => (c.grown !== undefined || c.cells !== undefined ? wait(m, c.by, c.day) : c.alive !== undefined ? wait(m, c.alive, c.day) : c.at !== undefined ? wait(m, c.at)
    : c.by !== undefined ? wait(m, c.by, c.day, c.after || 0) : c.to !== undefined ? wait(m, c.to) : 0);
  J.eta = (i) => Math.max(0, ...m.stars[i].all.map(decidedBy)) - J.t;   // sim seconds until star i is decided at the latest
  J.clock = (t) => { const h = m.start.hour + t / HOUR; return h - 24 * Math.floor(h / 24); };
  const cond = (c) => {
    if (c.grown !== undefined || c.cells !== undefined) {   // growth: won the moment it is reached; lost when the time runs out or none is left
      const by = wait(m, c.by, c.day);
      if (J.samples.some((s) => s.t <= by && (c.cells !== undefined ? s.n >= c.cells : s.size >= c.grown || s.n >= 2))) return 'won';
      const last = J.samples[J.samples.length - 1];
      return J.t >= by || (last && last.n === 0) ? 'lost' : 'pending';
    }
    if (c.alive !== undefined) {
      const at = wait(m, c.alive, c.day);
      return J.dead && J.diedT < at ? 'lost' : J.t >= at ? 'won' : 'pending';
    }
    if (c.above !== undefined && c.at !== undefined) {
      const at = wait(m, c.at), s = J.samples.find((x) => x.t >= at);
      if (J.dead && J.diedT < at) return 'lost';
      return s ? (s.depth < c.above ? 'won' : 'lost') : 'pending';
    }
    if (c.above !== undefined) {
      const by = wait(m, c.by, c.day, c.after || 0), from = c.after ? c.after * HOUR : 0;
      if (J.samples.some((s) => s.t >= from && s.t <= by && s.depth < c.above && !s.dead)) return 'won';
      return J.t >= by || J.dead ? 'lost' : 'pending';
    }
    if (c.below !== undefined || c.deeper !== undefined) {
      const from = wait(m, c.from), to = wait(m, c.to);
      const bad = (s) => (c.below !== undefined ? s.depth < c.below : s.depth > c.deeper);
      if (J.samples.some((s) => s.t >= from && s.t <= to && bad(s))) return 'lost';
      if (J.dead && J.diedT < to) return 'lost';
      return J.t >= to ? 'won' : 'pending';
    }
    if (c.share !== undefined) return shareOf(c.share) <= c.max ? 'won' : 'lost';
    if (c.parts !== undefined) return (cell.design.parts || []).filter((p) => p.type === 'segment' && p.label === c.parts).length <= c.max ? 'won' : 'lost';
    return 'pending';
  };
  J.update = () => {
    J.status = m.stars.map((st) => {
      const r = st.all.map(cond);
      return r.includes('lost') ? 'lost' : r.every((x) => x === 'won') ? 'won' : 'pending';
    });
    if (J.status[0] === 'lost') J.status = J.status.map(() => 'lost');   // every star needs the goal
    J.over = J.status.every((s) => s !== 'pending');
    J.stars = J.status[0] === 'won' ? J.status.filter((s) => s === 'won').length : 0;
  };
  J.sample = (w, c) => {
    J.t = (w.steps - t0) * DT;
    const depth = TH - c.q[1];
    if (c.dead && !J.dead) { J.dead = true; J.diedT = J.t; J.diedDepth = depth; J.diedWhy = c.diedWhy || 'starved'; }
    // the living cells of its kind, and the most grown of them (chapter 3's goals)
    let n = 0, size = 0;
    for (const x of w.cells) if (!x.dead && x.species === c.species) { n++; if ((x.size || 1) > size) size = x.size || 1; }
    J.samples.push({ t: J.t, depth, dead: !!c.dead, n, size });
    J.update();
  };
  J.update();
  return J;
}

// A whole attempt without drawing (the check; ⏩ in the page steps the live tank instead)
export function runMission(m, design, stepWorld, maxS = 5 * M.day) {
  const { world, cell } = startWorld(m, JSON.parse(JSON.stringify(design)));
  const J = judge(m, world, cell);
  const every = Math.round(1 / DT);
  for (let k = 1; k <= maxS / DT && !J.over; k++) { stepWorld(world); if (k % every === 0) J.sample(world, cell); }
  return J;
}

// The parts a player may add: the ones the missions taught so far; parts no mission teaches yet open once chapter 2 is done
export const TAUGHT = new Set(MISSIONS.flatMap((m) => m.teaches));
export const ALWAYS = ['Nucleus (the brain)'];
export function partOpen(name, best, all) {
  if (all || ALWAYS.includes(name)) return true;
  if (TAUGHT.has(name)) return MISSIONS.some((m) => m.teaches.includes(name) && best[m.id] > 0);
  return coreDone(best);   // the rest: after the last mission of chapters 1 and 2
}
// Chapters 1 and 2 each have a star: every part not taught yet is open (later chapters don't close them again)
export const coreDone = (best) => MISSIONS.filter((m) => m.chapter < 2).every((m) => best[m.id] > 0);
export const missionOpen = (i, best) => i === 0 || best[MISSIONS[i - 1].id] > 0;
