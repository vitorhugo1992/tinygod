// Missions (author, 2026-11-07: "a system that rewards slow but steady progress"): short goals, each teaching one tool.
// A mission hands you a cell that almost works; you add the one missing thing. The simulation judges: each star is a
// goal (alive at a time, above a depth by a time, out of the glare, a part under a size) that is decided as the tank
// runs, and a mission ends when every star is decided. Pure (no DOM): the sandbox and tools/missions-check.mjs share it.
import { PARAMS } from '../sim/params.js';
import { makeWorld, addCell } from '../sim/world.js';
import { PART_TEMPLATES } from './parts.js';
import { prepEntry } from '../sim/entry.js';
import { regrow } from '../sim/grow.js';
import { mouthSize } from '../sim/interact.js';
import { drainedLevel } from '../sim/sense.js';

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
// Chapter 4's hunter: Claude's Raptilla (designs/raptilla.json): a swimmer with a 20 µm feeding tube; its tail stops while it feeds
const RAPTILLA = {"body":{"radius":10},"parts":[{"type":"sensor","id":"eye","label":"Light sensor","at":[9.397,3.42],"angle":20,"kind":"light","cone":180},{"type":"sensor","id":"eyeL","label":"Light sensor","at":[0,10],"angle":90,"kind":"light","cone":180},{"type":"sensor","id":"eyeR","label":"Light sensor","at":[0,-10],"angle":270,"kind":"light","cone":180},{"type":"segment","id":"tail_0","parent":"body","at":[10,0],"angle":0,"length":8,"radius":0.25,"material":"protein","joint":{"type":"motor","rate":30,"swing":35,"phase":0,"controls":[{"sensor":"eye","min":0,"max":0.25,"also":[{"sensor":"eyeL","min":0,"max":0.25},{"sensor":"eyeR","min":0,"max":0.25}],"all":true},{"sensor":"feeding","min":0.5,"max":1,"stop":true}]},"label":"Wave tail"},{"type":"segment","id":"tail_1","parent":"tail_0","at":[4,0],"angle":0,"length":8,"radius":0.25,"material":"protein","joint":{"type":"motor","rate":30,"swing":35,"phase":0.15,"controls":[{"sensor":"eye","min":0,"max":0.25,"also":[{"sensor":"eyeL","min":0,"max":0.25},{"sensor":"eyeR","min":0,"max":0.25}],"all":true},{"sensor":"feeding","min":0.5,"max":1,"stop":true}]}},{"type":"segment","id":"tail_2","parent":"tail_1","at":[4,0],"angle":0,"length":8,"radius":0.25,"material":"protein","joint":{"type":"motor","rate":30,"swing":35,"phase":0.3,"controls":[{"sensor":"eye","min":0,"max":0.25,"also":[{"sensor":"eyeL","min":0,"max":0.25},{"sensor":"eyeR","min":0,"max":0.25}],"all":true},{"sensor":"feeding","min":0.5,"max":1,"stop":true}]}},{"type":"segment","id":"tail_3","parent":"tail_2","at":[4,0],"angle":0,"length":8,"radius":0.25,"material":"protein","joint":{"type":"motor","rate":30,"swing":35,"phase":0.45,"controls":[{"sensor":"eye","min":0,"max":0.25,"also":[{"sensor":"eyeL","min":0,"max":0.25},{"sensor":"eyeR","min":0,"max":0.25}],"all":true},{"sensor":"feeding","min":0.5,"max":1,"stop":true}]}},{"type":"segment","id":"tail_4","parent":"tail_3","at":[4,0],"angle":0,"length":8,"radius":0.25,"material":"protein","joint":{"type":"motor","rate":30,"swing":35,"phase":0.6,"controls":[{"sensor":"eye","min":0,"max":0.25,"also":[{"sensor":"eyeL","min":0,"max":0.25},{"sensor":"eyeR","min":0,"max":0.25}],"all":true},{"sensor":"feeding","min":0.5,"max":1,"stop":true}]}},{"type":"segment","id":"tail_5","parent":"tail_4","at":[4,0],"angle":0,"length":8,"radius":0.25,"material":"protein","joint":{"type":"motor","rate":30,"swing":35,"phase":0.75,"controls":[{"sensor":"eye","min":0,"max":0.25,"also":[{"sensor":"eyeL","min":0,"max":0.25},{"sensor":"eyeR","min":0,"max":0.25}],"all":true},{"sensor":"feeding","min":0.5,"max":1,"stop":true}]}},{"type":"inclusion","id":"nucleus","label":"Nucleus","at":[-5.35,0],"radius":4.3,"material":"nucleus","joint":{"type":"rest","controls":[{"sensor":"eye","min":0,"max":0.01,"also":[{"sensor":"eyeL","min":0,"max":0.01},{"sensor":"eyeR","min":0,"max":0.01}],"all":true}]}},{"type":"inclusion","id":"plastid","label":"Plastid","at":[0,6.35],"radius":3.3,"material":"plastid"},{"type":"inclusion","id":"plastid2","label":"Plastid","at":[0,-6.35],"radius":3.3,"material":"plastid"},{"type":"inclusion","id":"store","at":[5.95,0],"radius":3.7,"label":"Oil store","material":"oil"},{"type":"segment","id":"ped","label":"Peduncle","at":[7.66,6.428],"angle":20,"length":20,"radius":0.6,"material":"protein","joint":{"type":"feed"}}]};
// Chapter 4's hungry hunter: Raptilla without its plastids and with a small oil store (holds ~330k pJ: one harpoon kills it)
const HUNGRY = { body: RAPTILLA.body, parts: RAPTILLA.parts.filter((p) => p.material !== 'plastid').map((p) => (p.material === 'oil' ? { ...p, radius: 1.5 } : p)) };
// Chapter 4's prey: a fat, still cell (a plastid and a big store, no nucleus)
const PB = { radius: 12 };
const PEBBLE = { body: PB, parts: [...part(PB, 'Plastid (makes energy)', 90, 'pl', 0.5), ...part(PB, 'Energy store', 270, 'st', 0.5)] };
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
  // Measured (2026-11-11): the swimmer at 1.9× with one growth step banked, on the upper mouth at 06:30. No Division rule:
  // it reaches 2× and divides at once, a newborn (20 µm) is swallowed. Size above 2.1×: divides 11:24, up in the water;
  // the eyespot above 25%: 07:48; above 2.4×: 02:36 that night (daughters 21.3 µm); above 2.7×: 07:00 the next dawn on the
  // floor, daughters 1.35× (22.1 µm: over the gape). It grows fast at night (2.1× at dusk, 2.6× by dawn). The swallower
  // starves at 09:18 on day 2, after the mission is decided.
  { id: 'm10', chapter: 3, title: 'Too big to swallow', teaches: [], about: 'the Division rule and the Size reading',
    story: 'The swimmer is back on the swallower\'s mouth, grown to almost twice its newborn size: 24 µm across, it no longer fits. But it is about to divide, and each newborn, 20 µm across, will.',
    task: 'Open its Division card (Parts) and make it wait: "and its Size is more than…". Big cells are safe; newborns are not.',
    design: { body: ROUND, parts: [...swimmer(), ...tail(0, 0.25)] },
    start: { hour: 6.5, depth: 1942.1, angle: 90, size: 1.9, rivals: [{ name: 'Gulper', design: GULPER, dx: 16.5, y: 22.5, angle: 0 }] },
    stars: [
      { text: 'None of it eaten at 08:00', all: [{ uneaten: 8 }],
        hint: 'It divided on the mouth and a newborn was swallowed. Its Division card (Parts, under Life cycle): add "and its Size is more than…" so it waits until it is bigger.' },
      { text: 'Two cells by 08:00 on day 3, none eaten', all: [{ uneaten: 8, day: 2 }, { cells: 2, by: 8, day: 2 }],
        hint: 'It waits too long: it must still divide by the third morning. Ask for a smaller Size.' },
      { text: 'Its two newborns too wide for that mouth (over 22 µm across), by 08:00 on day 3', all: [{ uneaten: 8, day: 2 }, { split: 22, by: 8, day: 2 }],
        hint: 'Each newborn gets half its volume. To be over 22 µm across a newborn must be over 1.33× the newborn size, so it should divide at about 2.7× (the Size reading). It grows fastest at night, deep.' },
    ] },
  // Measured (2026-11-11): Raptilla's tube touching the swimmer at 10:00, 900 µm. No spring, or a spring with no rule,
  // or a 10 µm one: drained all day (its plastids keep it alive in light), dragged to the floor, dead ~02:00. A 20 µm
  // spring at the back firing on Drained: torn free in about a minute wherever the tube latched (front, sides, back);
  // two at 150°/210°: as fast; at the side (90°): caught again, free at ~10:38; 40 µm at the back: re-caught four
  // times, free ~10:10; at the front (0°): dies.
  { id: 'm11', chapter: 3, title: 'Jump away', teaches: ['Burst organ (escape)'],
    story: 'A hunter has stuck its feeding tube into this swimmer and is drinking its energy. By day its plastids keep it going; at night it will be drained to death.',
    task: 'Add a Spring and give it a rule: it fires when the cell is being drained (Drained). A jump tears the tube off.',
    builder: { where: 180 },
    design: { body: ROUND, parts: [...swimmer(), ...tail(0, 0.25)] },
    start: { hour: 10, depth: 900, angle: 90, rivals: [{ name: 'Raptilla', design: RAPTILLA, dx: 40, y: 1103.4, angle: 160 }] },
    stars: [
      { text: 'Alive at dawn', all: [{ alive: 6 }],
        hint: 'Still drained. Add → Spring, then give it a rule on its card: fires when… Drained. A spring with no rule never fires.' },
      { text: 'Free within 5 minutes, and not caught again before dusk', all: [{ alive: 6 }, { free: true, from: 10 + 5 / 60, to: 18 }],
        hint: 'It gets free too slowly or is caught again. A spring at the back (Where 180°) throws it straight away from the hunter; a short one is too weak, a long one drags.' },
      { text: 'All that with one spring', all: [{ alive: 6 }, { free: true, from: 10 + 5 / 60, to: 18 }, { parts: 'Spring', max: 1 }],
        hint: 'One spring, well placed, is enough: at the back, 20 µm.' },
    ] },
  // Measured (2026-11-11): mission 7's drifter (floating below 25%) at 1.9× lying on the swallower's upper mouth at 06:30,
  // about to divide. No pads: a newborn is swallowed at once (06:31). Kin pads front and back, both sides, or one at the
  // back: the newborns stay joined, and a chain is swallowed only whole, if it fits across the swallower (44 µm): two
  // 54 µm rods don't. Both live and are still joined at the next dawn (rested near the surface).
  { id: 'm12', chapter: 3, title: 'Stick together', teaches: ['Pad'], about: 'chains',
    story: 'This drifter lies on the swallower\'s mouth, about to divide. Each newborn rod, 20 µm wide, fits the mouth end-first. But a mouth takes a chain only whole, and only if the chain fits across the swallower.',
    task: 'Add a kin pad: when it divides, the newborns stay stuck together, pad to pad, a chain too long to swallow.',
    builder: { where: 180 },
    design: { body: ROD, parts: [...drifter(0.01), ...chamber(0.25)] },
    start: { hour: 6.5, depth: 1942.5, angle: 0, size: 1.9, rivals: [{ name: 'Gulper', design: GULPER, dx: 16.5, y: 22.5, angle: 0 }] },
    stars: [
      { text: 'None of it eaten at 08:00', all: [{ uneaten: 8 }],
        hint: 'A newborn was swallowed. Add → Pad (Sticks to: its own kind), then ＋ Add to body: the two newborns stay joined. A pad with a rule holds only while its rule does.' },
      { text: 'Two cells still joined at dawn', all: [{ uneaten: 6 }, { chain: 2, at: 6 }],
        hint: 'They came apart: a pad that holds only while some rule holds lets go. Leave its card on "Holds always".' },
      { text: 'All that with one pad', all: [{ uneaten: 6 }, { chain: 2, at: 6 }, { parts: 'Kin pad', max: 1, type: 'pad' }],
        hint: 'One pad is enough: the newborn is placed pad to pad, so both share it.' },
    ] },
  // Measured (2026-11-11): the hunter (mission 5's swimmer without plastids, a small oil store) on the floor at 06:30, a
  // Pebble 40 µm to its right. No tube: starves at 13:00. A tube at Where 270°, 40-60 µm, with the tail stopping while
  // Feeding: one latch, held; the Pebble drained to death at 14:43. Without that rule a long tube is torn off two or
  // three times by its own tail (80-100k pJ a latch) before one holds (the Pebble dies ~15:36); aimed off (240°) or too
  // short (30 µm) it latches only after drifting into it (~15:45). In the mission a 60 µm tube without the rule held too (only 40-50 µm tear), and a 20 µm tube latched at 07:48 (the swimmer tumbled over to the Pebble) and held: ★★★ too. Short tubes were never torn.
  { id: 'm13', chapter: 3, title: 'Drain it', teaches: ['Peduncle (feeds on others)'],
    story: 'This swimmer has no plastids: it cannot make its own energy, and its oil runs out before noon. A Pebble, a fat slow cell, lies on the floor 40 µm to its right.',
    task: 'Add a feeding tube (Peduncle) on the side facing the Pebble (Where 270°). Its tip latches on any other cell it touches and drinks.',
    builder: { where: 270 },
    design: { body: ROUND, parts: [...nucleus(ROUND, 180, 0.01), ...part(ROUND, 'Energy store', 0, 'oil', 0.3, 1, { content: 'oil' }),
      ...part(ROUND, 'Light sensor (eyespot)', 0, 'eye', 1), ...tail(0, 0.25)] },
    start: { hour: 6.5, depth: 1990, angle: 90, rivals: [{ name: 'Pebble', design: PEBBLE, dx: 62.5, y: 12, angle: 0 }] },
    stars: [
      { text: 'Alive at dusk', all: [{ alive: 18 }],
        hint: 'It never fed. Add → Peduncle at Where 270° (the Pebble side): its tip must touch the Pebble.' },
      { text: 'Fed with one latch, never torn off', all: [{ alive: 18 }, { latches: 1, at: 18 }],
        hint: 'Its own tail tore the tube out, and every new latch costs energy. Open the tail card: + unless… Feeding (the tail stops while it feeds).' },
      { text: 'All that, and the Pebble drained by 15:00', all: [{ alive: 18 }, { latches: 1, at: 18 }, { gone: 15 }],
        hint: 'Latch sooner: a tube long enough to reach the Pebble at once (Length 40 µm or more), pointing straight at it (270°).' },
    ] },
  // Measured (2026-11-11): mission 11's start, but the Raptilla is starved (no plastids, a small oil store: it holds ~330k
  // pJ). No defence: the swimmer drained, dead 04:00 (the hunter starves 02:35). A harpoon at 270° (10, 20 or 30 µm)
  // firing on Drained: hits at 10:00, the wound (400k + 10%) kills it at once. 40 µm: the dart flies past the hunter's
  // body (it reaches only past the tip), a miss; aimed at 300°: a miss; both 0 stars. Mission 11's spring: free, the
  // hunter starves 14:40 (★★). (A fed Raptilla, ~2.1 million pJ, survives the wound and latches again 23-100 min later;
  // the drained swimmer then can't pay for a second shot.)
  { id: 'm14', chapter: 3, title: 'Strike back', teaches: [], about: 'the harpoon (a Spine of Kind Harpoon)',
    story: 'A starving Raptilla, with no plastids of its own, has stuck its tube into this swimmer. It holds little: one good wound would kill it.',
    task: 'Add a Spine, Kind: Harpoon, pointing at the hunter (Where 270°), and give it a rule: fires when the cell is being drained. The dart flies from the spine’s tip, up to 40 µm: the hunter is 20 µm from the swimmer.',
    builder: { tpl: 'Spine', where: 270, material: 'harpoon' },
    design: { body: ROUND, parts: [...swimmer(), ...tail(0, 0.25)] },
    start: { hour: 10, depth: 900, angle: 90, rivals: [{ name: 'Raptilla', design: HUNGRY, dx: 40, y: 1103.4, angle: 160 }] },
    stars: [
      { text: 'Alive at dawn', all: [{ alive: 6 }],
        hint: 'Still drained. Add → Spine, Kind: Harpoon, at Where 270° (the hunter side), and on its card: fires when… Drained. Fired and missed? The dart flies from the spine’s tip: a 40 µm spine starts it beyond the hunter. Make it 30 µm or shorter (Size).' },
      { text: 'The hunter dead by dusk', all: [{ alive: 6 }, { gone: 18 }],
        hint: 'It got away, or your dart missed: point the harpoon straight at the hunter (270°).' },
      { text: 'The hunter dead within half an hour', all: [{ alive: 6 }, { gone: 10.5 }],
        hint: 'Strike it at once: the harpoon must hit its body. Too long a spine and the dart starts beyond it: keep it 30 µm or shorter.' },
    ] },
];

// The rest of a mission's start: the cell grown to m.start.size with one growth step banked (so it grows again at once),
// and the other cells it puts in its tank (m.start.rivals: { name, design, dx from the player's cell, y above the floor,
// angle }); the sandbox's reset and the check both call it
export function addRivals(world, m, cell) {
  if (m.start && m.start.size > 1 && regrow(world, cell, m.start.size)) { cell.grow.E = 1.02 * cell.grow.stepE; cell.grow.N = 1.02 * cell.grow.stepN; }
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
  const split = m.stars.some((st) => st.all.some((c) => c.split !== undefined));   // widths only where a star asks
  const decidedBy = (c) => (c.free !== undefined ? wait(m, c.to) : c.latches !== undefined ? wait(m, c.at) : c.gone !== undefined ? wait(m, c.gone) : c.chain !== undefined ? wait(m, c.at, c.day) : c.grown !== undefined || c.cells !== undefined || c.split !== undefined ? wait(m, c.by, c.day) : c.uneaten !== undefined ? wait(m, c.uneaten, c.day) : c.alive !== undefined ? wait(m, c.alive, c.day) : c.at !== undefined ? wait(m, c.at)
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
    if (c.uneaten !== undefined) {   // none of its kind swallowed until then
      const last = J.samples[J.samples.length - 1];
      if (last && last.eaten > 0) return 'lost';
      return J.t >= wait(m, c.uneaten, c.day) ? 'won' : 'pending';
    }
    if (c.free !== undefined) {   // no tube in it between the two hours (and alive)
      const from = wait(m, c.from), to = wait(m, c.to);
      if (J.samples.some((s) => s.t >= from && s.t <= to && s.drained)) return 'lost';
      if (J.dead && J.diedT < to) return 'lost';
      return J.t >= to ? 'won' : 'pending';
    }
    if (c.latches !== undefined) {   // its tube latched on at least once and at most that many times by then
      const last = J.samples[J.samples.length - 1];
      if (last && last.latches > c.latches) return 'lost';
      return J.t >= wait(m, c.at) ? (last && last.latches >= 1 ? 'won' : 'lost') : 'pending';
    }
    if (c.gone !== undefined) {   // no other species' cell left alive by then
      if (J.samples.some((s) => s.t <= wait(m, c.gone) && s.others === 0)) return 'won';
      return J.t >= wait(m, c.gone) ? 'lost' : 'pending';
    }
    if (c.chain !== undefined) {   // at that hour, at least that many cells of its kind joined to kin
      const at = wait(m, c.at, c.day), s = J.samples.find((x) => x.t >= at);
      return s ? (s.joined >= c.chain ? 'won' : 'lost') : J.samples.length && J.samples[J.samples.length - 1].n === 0 ? 'lost' : 'pending';
    }
    if (c.split !== undefined) {   // its first division: every cell of its kind then at least that wide (narrowest, µm)
      const s = J.samples.find((x) => x.n >= 2);
      if (s) return s.t <= wait(m, c.by, c.day) && s.minW > c.split ? 'won' : 'lost';
      const last = J.samples[J.samples.length - 1];
      return J.t >= wait(m, c.by, c.day) || (last && last.n === 0) ? 'lost' : 'pending';
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
    if (c.parts !== undefined) return (cell.design.parts || []).filter((p) => p.type === (c.type || 'segment') && p.label === c.parts).length <= c.max ? 'won' : 'lost';
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
    let n = 0, size = 0, minW = Infinity, joined = 0, others = 0;
    for (const x of w.cells) if (!x.dead && x.species !== c.species) others++;
    for (const x of w.cells) if (!x.dead && x.species === c.species) {
      n++; if ((x.size || 1) > size) size = x.size || 1;
      if (x.neighbours > 0) joined++;
      if (split) minW = Math.min(minW, 2 * mouthSize(x));
    }
    J.samples.push({ t: J.t, depth, dead: !!c.dead, n, size, minW, eaten: (w.eatenOf || {})[c.species] || 0, drained: !c.dead && drainedLevel(w, c) > 0, joined, others, latches: c.latches || 0 });
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
