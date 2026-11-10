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
];

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
