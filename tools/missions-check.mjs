// Every mission: its broken cell earns no star; the fixes it teaches earn the stars they should.
//   node tools/missions-check.mjs [m1 m3 …]
import { stepWorld } from '../sim/world.js';
import { buildCell } from '../sim/build.js';
import { prepEntry } from '../sim/entry.js';
import { MISSIONS, runMission, part, tail } from '../sandbox/missions.js';

const by = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));
const plus = (m, ...extra) => ({ body: m.design.body, parts: [...JSON.parse(JSON.stringify(m.design.parts)), ...extra.flat()] });
const withRule = (m, test) => { const d = plus(m); test(d); return d; };
const ROUND = { radius: 10 }, ROD = { radius: 10, length: 34 };
const chamberRule = (d) => { const c = part(ROD, 'Buoyancy chamber', 0, 'chamber', 1); c[0].joint.controls = [{ sensor: 'eye', min: 0, max: 0.25 }]; d.parts.push(...c); };

// [mission, what was done, design, stars it should earn]
const CASES = [
  ['m1', 'as handed over', (m) => plus(m), 0],
  ['m1', 'the default plastid (11%)', (m) => plus(m, part(ROUND, 'Plastid (makes energy)', 90, 'p', 0.5)), 2],
  ['m1', 'a smaller plastid (6%)', (m) => plus(m, part(ROUND, 'Plastid (makes energy)', 90, 'p', 0.42)), 3],
  ['m2', 'as handed over', (m) => plus(m), 0],
  ['m2', 'the default store', (m) => plus(m, part(ROUND, 'Energy store', 165, 's', 0.4)), 2],
  ['m2', 'a bigger oil store', (m) => plus(m, part(ROUND, 'Energy store', 165, 's', 0.45, 1, { content: 'oil' })), 3],
  ['m3', 'as handed over', (m) => plus(m), 0],
  ['m3', 'a small chamber', (m) => withRule(m, (d) => { const c = part(ROD, 'Buoyancy chamber', 0, 'chamber', 0.5); c[0].joint.controls = [{ sensor: 'eye', min: 0, max: 0.25 }]; d.parts.push(...c); }), 0],
  ['m3', 'a full chamber, floats below 25%', (m) => withRule(m, chamberRule), 2],
  ['m4', 'as handed over', (m) => plus(m), 0],
  ['m4', 'rests below 1%', (m) => withRule(m, (d) => { d.parts.find((p) => p.id === 'nucleus').joint.controls = [{ sensor: 'eye', min: 0, max: 0.01 }]; }), 3],
  ['m5', 'as handed over', (m) => plus(m), 0],
  ['m5', 'a tail at the back, pushing', (m) => plus(m, tail(0, 0.25, 180, false)), 0],
  ['m5', 'a tail at the front, pulling', (m) => plus(m, tail(0, 0.25)), 3],
  ['m6', 'as handed over', (m) => plus(m), 0],
  ['m6', 'runs below 50%', (m) => withRule(m, (d) => { for (const p of d.parts) if (p.joint && p.joint.type === 'motor') p.joint.controls = [{ sensor: 'eye', min: 0, max: 0.5 }]; }), 2],
  ['m6', 'runs below 25%', (m) => withRule(m, (d) => { for (const p of d.parts) if (p.joint && p.joint.type === 'motor') p.joint.controls = [{ sensor: 'eye', min: 0, max: 0.25 }]; }), 3],
  ['m7', 'as handed over (floats below 60%)', (m) => plus(m), 0],
  ['m7', 'floats below 45%', (m) => withRule(m, (d) => { d.parts.find((p) => p.id === 'chamber').joint.controls = [{ sensor: 'eye', min: 0, max: 0.45 }]; }), 0],
  ['m7', 'floats below 35%', (m) => withRule(m, (d) => { d.parts.find((p) => p.id === 'chamber').joint.controls = [{ sensor: 'eye', min: 0, max: 0.35 }]; }), 2],
  ['m7', 'floats below 25%', (m) => withRule(m, (d) => { d.parts.find((p) => p.id === 'chamber').joint.controls = [{ sensor: 'eye', min: 0, max: 0.25 }]; }), 3],
  ['m7', 'floats below 10%: too deep', (m) => withRule(m, (d) => { d.parts.find((p) => p.id === 'chamber').joint.controls = [{ sensor: 'eye', min: 0, max: 0.1 }]; }), 0],
  ...[[0, 0, 'as handed over'], [0.3, 1, 'the default nitroplast (0.5%)'], [0.4, 1, 'a small one (1.2%)'], [0.5, 3, '2.3%'], [0.6, 3, '3.9%'], [0.65, 2, '5.0%'], [0.75, 0, 'too big (7.9%)']]
    .map(([size, want, what]) => ['m8', what, (m) => (size ? withNitroplast(m, size) : plus(m)), want]),
  ...[[[], 0, 'no spines'], [[0, 180], 0, 'two spines, front and back'], [[90, 270], 0, 'two spines, the sides'],
    [[90, 210, 330], 3, 'three 40 µm spines', 0.4], [[90, 210, 330], 3, 'three 10 µm spines', 0.1], [[90, 210, 330], 3, 'three 25 µm spines (the default)', 0.25],
    [[60, 120, 240, 300], 0, 'four spines, none at front or back', 0.1], [[45, 135, 225, 315], 2, 'four spines on the diagonals'],
    [[30, 90, 150, 210, 270, 330], 1, 'six spines']]
    .map(([at, want, what, len = 0.25]) => ['m9', what, (m) => plus(m, ...at.map((deg, i) => part(ROUND, 'Spine', deg, 'sp' + i, len))), want]),
  ['m10', 'as handed over (no Division rule)', (m) => plus(m), 0],
  ...[[1.5, 0], [2.1, 2], [2.4, 2], [2.6, 2], [2.7, 3], [3, 3], [4, 1]]
    .map(([x, want]) => ['m10', `divides above ${x}×`, (m) => plus(m, divideWhen([{ sensor: 'size', min: (x - 1) / 7, max: 1 }])), want]),
  ['m10', 'divides when the eyespot sees more than 25%', (m) => plus(m, divideWhen([{ sensor: 'eye', min: 0.25, max: 1 }])), 2],
  ...[[[], 0, 'as handed over'], [[180], 0, 'a spring with no rule', 20, false], [[180], 0, 'a 10 µm spring at the back', 10],
    [[0], 0, 'a spring at the front'], [[90], 1, 'a spring at the side'], [[180], 1, 'a 40 µm spring at the back', 40],
    [[150, 210], 2, 'two springs, back left and right'], [[180], 3, 'a 20 µm spring at the back']]
    .map(([at, want, what, len = 20, wired = true]) => ['m11', what, (m) => plus(m, ...at.map((w, i) => spring(w, i, len, wired))), want]),
  ...[[[], 0, 'as handed over'], [[0, 180], 2, 'pads front and back'], [[90, 270], 2, 'pads on both sides'],
    [[180], 0, 'one pad, holding only while the eyespot sees more than 25%', [0.25, 1]], [[180], 1, 'one pad, holding only while the eyespot sees less than 5%', [0, 0.05]], [[180], 3, 'one pad at the back']]
    .map(([at, want, what, ruled]) => ['m12', what, (m) => plus(m, ...at.map((w, i) => {
      const p = part(ROD, 'Pad', w, 'pad' + i, 1);
      if (ruled) p[0].joint.controls = [{ sensor: 'eye', min: ruled[0], max: ruled[1] }];
      return p;
    })), want]),
  ...[[0, 0, 0, 'as handed over'], [270, 20, 3, 'a 20 µm tube, no rule (it swims over and latches)'], [270, 40, 1, 'a 40 µm tube at 270°, no rule (torn by its own tail)'], [270, 60, 3, 'a 60 µm tube at 270°, no rule (held)'], [240, 40, 3, 'a 40 µm tube aimed off (240°), the tail stops while feeding', true],
    [270, 30, 3, 'a 30 µm tube (too short at first), the tail stops while feeding', true], [270, 40, 3, 'a 40 µm tube at 270°, the tail stops while feeding', true],
    [270, 60, 3, 'a 60 µm tube at 270°, the tail stops while feeding', true]]
    .map(([where, len, want, what, stop]) => ['m13', what, (m) => {
      const d = plus(m, len ? part(ROUND, 'Peduncle (feeds on others)', where, 'ped', 1, 1, { len }) : []);
      if (stop) for (const p of d.parts) if (p.joint && p.joint.type === 'motor') p.joint.controls.push({ sensor: 'feeding', min: 0.5, max: 1, stop: true });
      return d;
    }, want]),
];
function spring(where, i, len, wired) {
  const s = part(ROUND, 'Burst organ (escape)', where, 'spring' + i, 0.4, 1, { len });
  if (wired) s[0].joint.controls = [{ sensor: 'drained', min: 0.5, max: 1 }];
  return s;
}
function divideWhen(controls) { return [{ type: 'rule', id: 'divide', label: 'Division', joint: { type: 'divide', controls } }]; }

// A nitroplast where the Add panel's nudge would put it (from Where 90°: round the body, then nearer the centre)
function withNitroplast(m, size) {
  const B = m.design.body;
  for (let k = 0; k <= 18; k++) for (const sign of k ? [1, -1] : [1]) for (const dp of [1, 0.8, 0.6, 0.4, 0.2, 0]) {
    const d = plus(m, part(B, 'Nitroplast (fixes nitrogen)', ((90 + sign * k * 10) % 360 + 360) % 360, 'nitro', size, dp));
    try { buildCell(prepEntry(d)); return d; } catch (e) { /* next spot */ }
  }
  throw new Error('no room for a nitroplast of size ' + size);
}

const only = process.argv.slice(2);
let bad = 0;
for (const [id, what, make, want] of CASES) {
  if (only.length && !only.includes(id)) continue;
  const m = by[id], t0 = Date.now();
  const J = runMission(m, make(m), stepWorld);
  const ok = J.stars === want;
  if (!ok) bad++;
  const marks = J.status.map((s) => (s === 'won' ? '★' : s === 'lost' ? '·' : '?')).join('');
  console.log(`${ok ? 'ok ' : 'BAD'} ${id} ${what}: ${J.stars} stars ${marks} (wanted ${want})${J.dead ? `, died ${(J.diedT / 25).toFixed(1)} h in, ${Math.round(J.diedDepth)} µm` : ''} [${((Date.now() - t0) / 1000).toFixed(0)} s]`);
}
console.log(bad ? `${bad} case(s) off` : 'all missions as intended');
process.exit(bad ? 1 : 0);
