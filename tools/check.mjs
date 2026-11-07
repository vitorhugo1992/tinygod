// Physics-law checks for the sandbox, headless. Run: node tools/check.mjs
// Each check prints what it measured and PASS/FAIL; the exit code is the number of failures.
import { PARAMS } from '../sim/params.js';
import { makeWorld, addCell, stepWorld, worldTime } from '../sim/world.js';
import { cellWeight } from '../sim/build.js';
import { PRESETS } from '../sim/presets.js';
import { MATERIALS } from '../sim/materials.js';
import { fire } from '../sim/physics.js';
import { clock, daylight, lightAt } from '../sim/light.js';
import { PART_TEMPLATES, mirrorGroup } from '../sandbox/parts.js';
import { slotsOf, brainUse, brainProblem } from '../sim/brain.js';
import { buildCell as build } from '../sim/build.js';
import { volumeOf } from '../sim/shape.js';
import { moveTo, dragSpot, toOutline, ownPoints, relax } from '../sandbox/mould.js';
import { DEG } from '../sim/dmath.js';
import { feedingLevel, sizeLevel, padLevel } from '../sim/sense.js';
import { regrow, organelleGrowth } from '../sim/grow.js';

const DT = PARAMS.time.dt;
// A cocked spring (a latched springy joint), for the no-coasting and one-flick laws; not a part in the Build panel
const SPRING = { body: { radius: 6 }, parts: [{ type: 'segment', at: [-6, 0], angle: 180, length: 30, radius: 0.4,
  joint: { type: 'hinge', stiffness: 2000, rest: 150, latched: true } }] };
// A latched coiled ribbon (a cryptophyte ejectisome), for the extending-ribbon law; not a part in the Build panel
const EJECT = { body: { radius: 6 }, parts: [{ type: 'segment', at: [-6, 0], angle: 180, length: 30, radius: 0.3,
  joint: { type: 'extend', stiffness: 20, latched: true } }] };
const MU = PARAMS.water.viscosity;
const PER_DAY = 86400 * 1e-6;  // µm/s -> m/day
let failures = 0;

function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n      ${detail}` : ''}`);
  if (!ok) failures++;
}

// Run one design alone for `seconds`; returns the cell and its start and end pose
function run(design, seconds, x = 300, y = 1000, angle = 0) {
  const w = makeWorld(1);
  const cell = addCell(w, design, x, y, angle);
  const q0 = Array.from(cell.q);
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) stepWorld(w);
  return { cell, q0, q1: Array.from(cell.q), seconds };
}
const sinking = (r) => (r.q0[1] - r.q1[1]) / r.seconds;   // µm/s, positive down
const fmt = (v, d = 2) => v.toFixed(d);
const sphere = (radius, wall = 'protein') => ({ body: { radius, wall }, parts: [] });

// 1. Stokes: a sphere sinks at weight / (6 pi mu a); with its density excess fixed, speed grows with size squared
{
  const rows = [];
  let ok = true;
  for (const a of [5, 10, 20, 40]) {
    const r = run(sphere(a), 1);
    const w = cellWeight(r.cell);
    const stokes = w / (6 * Math.PI * MU * a);
    const vol = (4 / 3) * Math.PI * a ** 3;
    const excess = w / (vol * PARAMS.gravity * 1e-6);           // mean density excess, kg/m³
    const law = sinking(r) / (excess * a * a);                    // should be the same for every size
    rows.push(`a=${a} µm: ${fmt(sinking(r))} µm/s (${fmt(sinking(r) * PER_DAY, 2)} m/day), Stokes ${fmt(stokes)}, ` +
      `excess ${fmt(excess, 1)} kg/m³, v/(excess·a²) ${law.toExponential(4)}`);
    ok &&= Math.abs(sinking(r) / stokes - 1) < 1e-3;
  }
  check('sphere sinks at Stokes speed; speed ∝ size² × density excess', ok, rows.join('\n      '));
}

// 2. Density excess: a plated wall sinks faster, an oil droplet slows it, a big light buoyancy chamber floats
{
  const plain = sinking(run(sphere(20), 1));
  const plated = sinking(run({ body: { radius: 20, wall: 'plates', plates: 1 }, parts: [] }, 1));
  const oil = sinking(run({ body: { radius: 20 }, parts: [{ type: 'inclusion', at: [0, 0], radius: 10, material: 'oil' }] }, 1));
  const sap = sinking(run({ body: { radius: 20 }, parts: [{ type: 'inclusion', at: [0, 0], radius: 18, material: 'chamber', density: 900 }] }, 1));
  check('wall and inclusions change sinking through density', plated > plain && oil < plain && sap < 0,
    `protein ${fmt(plain)}, 1 µm plates ${fmt(plated)}, oil droplet ${fmt(oil)}, light chamber ${fmt(sap)} µm/s (negative rises)`);
}

// 3. Spines slow sinking (drag), longer ones more
{
  const spined = (material, length) => ({
    body: { radius: 10 },
    parts: [45, 135, 225, 315].map((deg) => {
      const t = deg * Math.PI / 180;
      return { type: 'segment', at: [10 * Math.cos(t), 10 * Math.sin(t)], angle: deg, length, radius: 0.5, material };
    }),
  });
  const bare = sinking(run(sphere(10), 1));
  const prot = sinking(run(spined('protein', 40), 1));
  const long = sinking(run(spined('protein', 80), 1));
  check('spines slow sinking', prot < bare && long < prot,
    `bare ${fmt(bare)}, 4 spines 40 µm ${fmt(prot)}, 4 spines 80 µm ${fmt(long)} µm/s`);
}

// 4. A long rod sinks faster end-on than broadside; tilted, it slides sideways as it sinks and does not turn
{
  const rod = { body: { radius: 4, length: 80, wall: 'plates', plates: 1 }, parts: [] };
  const flat = run(rod, 1, 300, 1000, 0), end = run(rod, 1, 300, 1000, 90), tilt = run(rod, 1, 300, 1000, 45);
  const side = (tilt.q1[0] - tilt.q0[0]) / tilt.seconds;
  const turn = Math.abs(tilt.q1[2] - tilt.q0[2]);
  check('rods: end-on sinks faster than broadside; tilted slides sideways without turning',
    sinking(end) > sinking(flat) && Math.abs(side) > 0.1 * sinking(tilt) && turn < 1e-9,
    `broadside ${fmt(sinking(flat))}, end-on ${fmt(sinking(end))}, tilted 45°: down ${fmt(sinking(tilt))} and sideways ${fmt(side)} µm/s, turned ${turn.toExponential(1)} rad`);
}

// 5. Self-righting: an off-centre oil droplet turns the cell until the light side is up
{
  const design = { body: { radius: 10 }, parts: [{ type: 'inclusion', at: [5, 0], radius: 4, material: 'oil' }] };
  const r = run(design, 600, 300, 1500, 0);   // droplet starts to the side (body axis horizontal)
  const deg = r.q1[2] * 180 / Math.PI;
  let t90 = null;
  { // time to get within 5° of upright
    const w = makeWorld(1); const c = addCell(w, design, 300, 1500, 0);
    for (let i = 0; i < 600 / DT; i++) { stepWorld(w); if (Math.abs(c.q[2] * 180 / Math.PI - 90) < 5) { t90 = (i + 1) * DT; break; } }
  }
  check('off-centre oil droplet turns the cell light side up', Math.abs(deg - 90) < 1,
    `final body angle ${fmt(deg, 1)}° (90 = droplet on top), within 5° after ${t90 === null ? 'never' : fmt(t90, 1) + ' s'}`);
}

// 6. A sinking cell comes to rest on the floor
{
  const r = run({ body: { radius: 10, wall: 'plates', plates: 2 }, parts: [] }, 20, 300, 40);
  const v = Math.abs(r.cell.v[1]);
  check('cell rests on the floor', r.q1[1] > 9.5 && r.q1[1] < 10.5 && v < 1e-3,
    `centre ${fmt(r.q1[1], 3)} µm above the floor (radius 10), speed ${v.toExponential(1)} µm/s`);
}

// 7. Determinism: the same world twice, bit for bit
{
  const designs = [sphere(10), sphere(20, 'plates'),
    { body: { radius: 4, length: 80 }, parts: [{ type: 'segment', at: [40, 0], angle: 30, length: 50, radius: 1 }] }];
  const go = () => {
    const w = makeWorld(7);
    designs.forEach((d, i) => addCell(w, d, 100 + 150 * i, 1200, 20 * i));
    for (let i = 0; i < 20000; i++) stepWorld(w);
    return new Uint8Array(Float64Array.from(w.cells.flatMap((c) => Array.from(c.q))).buffer);
  };
  const a = go(), b = go();
  check('same world twice is bit-identical', a.every((x, i) => x === b[i]), `${a.length / 8} numbers compared after 10 s`);
}

// Swimming, with gravity off so only the strokes move the cell. Returns µm/s and fW over `seconds`
// after half a second of settling.
function swim(design, seconds = 2) {
  const w = makeWorld(1, { gravity: false });
  const c = addCell(w, design, 300, 1000, 0);
  for (let i = 0; i < 0.5 / DT; i++) stepWorld(w);
  const x0 = c.q[0], y0 = c.q[1], e0 = c.energy.motor;
  for (let i = 0; i < seconds / DT; i++) stepWorld(w);
  return { w, c, vx: (c.q[0] - x0) / seconds, vy: (c.q[1] - y0) / seconds,
    speed: Math.hypot(c.q[0] - x0, c.q[1] - y0) / seconds, fw: (c.energy.motor - e0) / seconds / 1000 };
}
const flapper = (stroke, stiffness) => ({ body: { radius: 8 }, parts: stiffness === undefined
  ? [{ type: 'segment', at: [-8, 0], angle: 180, length: 40, radius: 0.25, joint: { type: 'motor', rate: 20, swing: 60, stroke } }]
  : [{ type: 'segment', id: 'b', at: [-8, 0], angle: 180, length: 15, radius: 0.25, joint: { type: 'motor', rate: 20, swing: 60, stroke } },
     { type: 'segment', parent: 'b', at: [7.5, 0], length: 25, radius: 0.25, joint: { type: 'hinge', stiffness } }] });

// 8. Scallop theorem: a stiff flap goes nowhere however unequal its stroke and recovery; a springy one swims
{
  const stiff = [0.5, 0.25, 0.1].map((s) => swim(flapper(s)));
  const oar = swim(flapper(0.25, 700));
  const oarEven = swim(flapper(0.5, 700));
  const worst = Math.max(...stiff.map((r) => r.speed));
  check('scallop theorem: a stiff flap goes nowhere; a springy one (flexible oar) swims',
    worst < 0.01 * oar.speed && oar.speed > 5,
    `stiff flap, stroke 50/25/10% of the beat: ${stiff.map((r) => fmt(r.speed, 4)).join(' / ')} µm/s ` +
    `(spending ${stiff.map((r) => fmt(r.fw, 0)).join(' / ')} fW for nothing)\n      ` +
    `flexible oar, fast stroke: ${fmt(oar.speed)} µm/s; even stroke: ${fmt(oarEven.speed)} µm/s ` +
    `(the springy tail lags behind the beat, turning the flap into a wave, so even an even beat swims)`);
}

// 9. The flexible oar has a sweet spot: too floppy trails, too stiff is a stiff flap again
{
  const ks = [50, 200, 700, 2500, 10000];
  const v = ks.map((k) => swim(flapper(0.25, k)).speed);
  const best = v.indexOf(Math.max(...v));
  check('flexible oar works best at a middle stiffness', best > 0 && best < ks.length - 1,
    ks.map((k, i) => `k ${k}: ${fmt(v[i], 1)}`).join(', ') + ' µm/s');
}

// 10. A travelling wave swims, and reversing the wave reverses the swimming
{
  const wave = PRESETS['Wave tail'];
  const back = { ...wave, parts: wave.parts.map((p) => ({ ...p, joint: { ...p.joint, phase: -p.joint.phase } })) };
  const a = swim(wave), b = swim(back);
  check('a travelling wave swims; the reversed wave swims the other way', a.speed > 20 && a.vx * b.vx < 0,
    `wave from body to tip: ${fmt(a.vx)} µm/s along x (${fmt(a.speed / 16, 1)} body lengths/s, ${fmt(a.fw, 0)} fW); ` +
    `tip to body: ${fmt(b.vx)} µm/s`);
}

// 11. No coasting: motors off, the cell stops in the same step; a cocked spring hops a short way, then stops
{
  const r = swim(PRESETS['Wave tail'], 1);
  for (const j of r.c.joints) j.on = false;
  const x0 = r.c.q[0];
  stepWorld(r.w);
  const after = Math.abs(r.c.v[0]) + Math.abs(r.c.v[1]);
  for (let i = 0; i < 1000; i++) stepWorld(r.w);
  const drift = Math.abs(r.c.q[0] - x0);

  const w = makeWorld(1, { gravity: false });
  const c = addCell(w, SPRING, 300, 1000, 0);
  for (const j of c.joints) j.latched = false;
  const p0 = [c.q[0], c.q[1]];
  let tStop = null;
  for (let i = 0; i < 2000; i++) { stepWorld(w); if (tStop === null && Math.hypot(c.v[0], c.v[1]) < 0.01) tStop = (i + 1) * DT; }
  const hop = Math.hypot(c.q[0] - p0[0], c.q[1] - p0[1]);
  check('no coasting: motors off stops the cell at once; a spring burst hops a short way and stops',
    after < 1e-9 && drift < 1e-9 && hop > 0.5 && hop < 12 && Math.hypot(c.v[0], c.v[1]) < 1e-6,
    `after the motors stop: speed ${after.toExponential(1)} µm/s next step, moved ${drift.toExponential(1)} µm in 1 s\n      ` +
    `spring jump: ${fmt(hop, 1)} µm (cell 12 µm across), under 0.01 µm/s after ${tStop === null ? '-' : fmt(tStop * 1000, 0) + ' ms'}`);
}

// 12. One flick goes as far whatever its force: a stronger spring hops faster, not farther (only the shape change counts)
{
  const hop = (stiffness) => {
    const d = JSON.parse(JSON.stringify(SPRING));
    d.parts[0].joint.stiffness = stiffness; d.parts[0].joint.latched = false;
    const w = makeWorld(1, { gravity: false });
    const c = addCell(w, d, 300, 1000, 0);
    let t90 = null;
    for (let i = 0; i < 3000; i++) { stepWorld(w); if (t90 === null && c.q[3] > 0.9 * d.parts[0].joint.rest * Math.PI / 180) t90 = (i + 1) * DT; }
    return { d: Math.hypot(c.q[0] - 300, c.q[1] - 1000), t90 };
  };
  const r = [500, 2000, 8000].map(hop);
  check('a stronger spring hops faster, not farther', Math.max(...r.map((x) => x.d)) / Math.min(...r.map((x) => x.d)) < 1.01 && r[2].t90 < r[0].t90,
    [500, 2000, 8000].map((k, i) => `k ${k}: ${fmt(r[i].d, 3)} µm, 90% sprung in ${fmt(r[i].t90 * 1000, 0)} ms`).join('; '));
}

const copy = (name) => JSON.parse(JSON.stringify(PRESETS[name]));

// 13. An extending ribbon (ejectisome) pushes the cell back; again, a stronger spring goes no farther
{
  const shoot = (stiffness, length = 30) => {
    const d = JSON.parse(JSON.stringify(EJECT));
    Object.assign(d.parts[0], { length });
    Object.assign(d.parts[0].joint, { stiffness, latched: false });
    const w = makeWorld(1, { gravity: false });
    const c = addCell(w, d, 300, 1000, 0);
    for (let i = 0; i < 3000; i++) stepWorld(w);
    return { d: Math.hypot(c.q[0] - 300, c.q[1] - 1000), back: c.q[0] - 300, out: c.q[3] };
  };
  const r = [5, 20, 80].map((k) => shoot(k));
  const long = shoot(20, 60);
  check('an extending ribbon pushes the cell back; stronger is not farther; longer is farther',
    r[0].back > 0.5 && Math.max(...r.map((x) => x.d)) / Math.min(...r.map((x) => x.d)) < 1.01 && long.d > r[1].d && r[1].out > 29.9,
    `30 µm ribbon, k 5/20/80: ${r.map((x) => fmt(x.d, 3)).join(' / ')} µm (cell 12 µm across); 60 µm ribbon: ${fmt(long.d, 2)} µm`);
}

// 14. A buoyancy chamber: neutral (no rule) the cell sinks as it would and the chamber costs nothing; FLOAT when its rule
// holds, it pumps itself light over a minute or two (slow since 2026-11-03) and the cell rises; SINK if (which wins) heavy, it sinks faster; held
// light or heavy it costs energy every second
{
  const always = { sensor: 'energy', min: 0, max: 1 };
  const go = (rule, y = 1000) => {   // where it starts: room to rise or sink for the 2 minutes it runs
    const w = makeWorld(1, { metab: true });
    const c = addCell(w, { body: { radius: 10 }, parts: [{ type: 'inclusion', at: [0, 0], radius: 6.5, material: 'chamber',
      ...(rule ? { joint: { type: 'chamber', controls: rule } } : {}) }] }, 300, y, 0);
    c.metab.C = c.metab.E = 1e12;
    let tTurn = null;
    for (let i = 0; i < 120000; i++) { const y = c.q[1]; stepWorld(w); if (tTurn === null && i > 10 && c.q[1] > y) tTurn = (i + 1) * DT; }
    const y0 = c.q[1];
    for (let i = 0; i < 1000; i++) stepWorld(w);
    return { v: c.q[1] - y0, hold: c.metab.chamber, rho: c.pieces[0].inclusions[0].density, tTurn };
  };
  const neutral = go(null, 1900), up = go([always], 300), down = go([always, { ...always, stop: true }], 1900);
  check('a buoyancy chamber: neutral it costs nothing; FLOAT pumps it light and the cell rises; SINK (winning) sinks it faster; held, it costs',
    neutral.v < 0 && neutral.hold === 0 && up.v > 0 && up.tTurn > 1 && up.hold > 0 && down.v < neutral.v && down.hold > 0 && down.rho === PARAMS.chamber.heavy,
    `neutral: ${fmt(neutral.v)} µm/s, holding ${fmt(neutral.hold, 0)} pJ/s; FLOAT: rises ${fmt(up.v)} µm/s (turned after ${fmt(up.tTurn, 1)} s), ` +
    `${fmt(up.hold, 0)} pJ/s; FLOAT and SINK both: ${fmt(down.v)} µm/s at ${down.rho} kg/m³, ${fmt(down.hold, 0)} pJ/s`);
}

// 15. Cells don't pass through each other: one dropped on another settles touching it
{
  const w = makeWorld(1);
  const a = addCell(w, sphere(10), 300, 10, 0);
  const b = addCell(w, { body: { radius: 8, wall: 'plates', plates: 2 }, parts: [] }, 300, 60, 0);
  for (let i = 0; i < 20000; i++) stepWorld(w);
  const gap = Math.hypot(a.q[0] - b.q[0], a.q[1] - b.q[1]);
  check('a cell dropped on another comes to rest on it', b.q[1] > a.q[1] && gap > 17.5 && gap < 18.5,
    `centres ${fmt(gap, 2)} µm apart (radii add to 18), the upper one ${fmt(b.q[1] - a.q[1], 2)} µm higher`);
}

// 16. Pads: kin pads hold kin pads end to end, not strangers; mucus holds anyone, weakly; links snap
{
  const pair = (da, db, gap = 22.5) => {
    const w = makeWorld(1, { gravity: false });
    const a = addCell(w, da, 300, 1000, 0), b = addCell(w, db, 300 + gap, 1000, 0);
    for (let i = 0; i < 500; i++) stepWorld(w);
    return { w, a, b };
  };
  const kin = pair(copy('Kin chain'), copy('Kin chain'));
  const stranger = copy('Kin chain'); stranger.species = 'B';
  const strangers = pair(copy('Kin chain'), stranger);
  const mucusDesign = copy('Kin chain'); mucusDesign.species = 'C'; mucusDesign.parts[0].kind = 'mucus';
  const mucus = pair(mucusDesign, stranger);
  // pull apart: a kin link holds a 5 µm stretch (25 pN) but not 10 µm (50 pN); mucus snaps at 2 µm (10 pN)
  // (at 1 µm it snaps but is still within its 1 µm reach, so it sticks again at once)
  const yank = (p, by) => { p.b.q[0] += by; for (let i = 0; i < 5; i++) stepWorld(p.w); return p.w.links.length; };
  const kinHolds = yank(pair(copy('Kin chain'), copy('Kin chain')), 5);
  const kinSnaps = yank(pair(copy('Kin chain'), copy('Kin chain')), 10);
  const mucusSnaps = yank(pair(mucusDesign, stranger), 2);
  check('kin pads hold kin end to end, not strangers; mucus holds anyone weakly; pulled too hard, links snap',
    kin.w.links.length === 1 && Math.abs(kin.b.q[0] - kin.a.q[0] - 22) < 0.1 && strangers.w.links.length === 0 &&
    mucus.w.links.length === 1 && kinHolds === 1 && kinSnaps === 0 && mucusSnaps === 0,
    `kin + kin: ${kin.w.links.length} link, ${fmt(kin.b.q[0] - kin.a.q[0], 2)} µm centre to centre (22 = touching); ` +
    `kin + stranger: ${strangers.w.links.length}; mucus + stranger: ${mucus.w.links.length}\n      ` +
    `yanked: kin 5 µm ${kinHolds ? 'holds' : 'snaps'}, kin 10 µm ${kinSnaps ? 'holds' : 'snaps'}, mucus 2 µm ${mucusSnaps ? 'holds' : 'snaps'}`);
}

// 16b. Cells of different species push each other apart like kin (author, 2026-11-02: collisions between species were
// never tested): overlapped bodies part, and a swimmer driven into a stranger goes round it, not through it
{
  const bodyGap = (A, B) => Math.hypot(A.q[0] - B.q[0], A.q[1] - B.q[1]) - A.pieces[0].a - B.pieces[0].a;
  const w = makeWorld(1, { gravity: false });
  const roundA = copy('Round cell'); roundA.species = 'A';
  const roundB = copy('Round cell'); roundB.species = 'B';
  const a = addCell(w, roundA, 800, 1000, 0), b = addCell(w, roundB, 808, 1000, 0);   // 12 µm into each other
  for (let i = 0; i < 1000; i++) stepWorld(w);
  const parted = bodyGap(a, b);
  const w2 = makeWorld(1, { gravity: false });
  const sw = addCell(w2, copy('Wave tail'), 700, 1000, 0), still = addCell(w2, roundB, 745, 1000, 0);
  let worst = 0;
  for (let i = 0; i < 8000; i++) { stepWorld(w2); worst = Math.min(worst, bodyGap(sw, still)); }
  check('cells of different species push apart: overlapped bodies part, a swimmer goes round a stranger, not through',
    parted > -0.2 && worst > -1.5 && Number.isFinite(sw.q[0] + still.q[0]),
    `two species 12 µm into each other: ${fmt(parted, 2)} µm apart after 1 s; a wave tail swimming into a round stranger: ` +
    `deepest overlap ${fmt(-worst, 2)} µm, it ended at x ${fmt(sw.q[0], 0)} (the stranger at ${fmt(still.q[0], 0)})`);
}

// 17. The hidden chain backstop: no group grows past PARAMS.pads.maxChain (lowered to 3 here to test it)
{
  const cap = PARAMS.pads.maxChain;
  PARAMS.pads.maxChain = 3;
  const w = makeWorld(1, { gravity: false });
  for (let i = 0; i < 6; i++) addCell(w, copy('Kin chain'), 200 + 22.5 * i, 1000, 0);
  for (let i = 0; i < 500; i++) stepWorld(w);
  PARAMS.pads.maxChain = cap;
  const sizes = {};
  for (const c of w.cells) sizes[c.group] = (sizes[c.group] || 0) + 1;
  const biggest = Math.max(...Object.values(sizes));
  check('chains stop at the hidden backstop', biggest === 3 && w.links.length === 4,
    `6 kin cells in a row with the cap at 3: groups of ${Object.values(sizes).join(', ')}, ${w.links.length} links`);
}

// 18. Determinism with cells meeting, sticking and pushing
{
  const go = () => {
    const w = makeWorld(3);
    addCell(w, copy('Mucus hitchhiker'), 250, 1000, 0);
    addCell(w, copy('Kin chain'), 300, 1000, 90);
    addCell(w, copy('Kin chain'), 300, 1023, 90);
    addCell(w, { body: { radius: 20 }, parts: [{ type: 'inclusion', at: [0, 0], radius: 18.5, material: 'chamber' }] }, 380, 1000, 0);
    for (let i = 0; i < 5000; i++) stepWorld(w);
    return new Uint8Array(Float64Array.from(w.cells.flatMap((c) => Array.from(c.q))).buffer);
  };
  const a = go(), b = go();
  check('a world of meeting cells runs bit-identical twice', a.every((x, i) => x === b[i]), `${a.length / 8} numbers compared after 5 s`);
}

// 19. A light sensor reads the light where it is (fading with depth) by the way it faces; a motor wired to it runs
// only while the reading is in its range, and its beat resumes where it froze (no jump)
const eyeTail = (min, max) => ({
  body: { radius: 8 },
  parts: [
    { type: 'sensor', id: 'eye', at: [8, 0], kind: 'light' },
    ...PRESETS['Wave tail'].parts.map((p) => ({ ...p, joint: { ...p.joint, control: { sensor: 'eye', min, max } } })),
  ],
});
{
  const readAt = (deg, y = 1950, light = true) => {
    const w = makeWorld(1, { gravity: false, light });
    const c = addCell(w, eyeTail(0.5, 1), 300, y, deg);
    stepWorld(w);
    return { w, c, value: c.sensors[0].value, on: c.joints[0].on };
  };
  const up = readAt(90), deep = readAt(90, 500), side = readAt(0), down = readAt(-90), off = readAt(90, 1950, false);
  const expected = Math.exp(-PARAMS.light.attenuation * (PARAMS.tank.h - up.c.cy[0] - 8));
  // facing up it swims; turned down mid-run its motors stop with the tail where it was, and resume from there
  const r = readAt(90, 1900);
  for (let i = 0; i < 500; i++) stepWorld(r.w);
  const y1 = r.c.q[1];
  r.c.q[2] = -Math.PI / 2;
  stepWorld(r.w);
  const frozen = Array.from(r.c.q.slice(3));
  for (let i = 0; i < 500; i++) stepWorld(r.w);
  const still = r.c.q.slice(3).every((a, i) => a === frozen[i]);
  r.c.q[2] = Math.PI / 2;
  stepWorld(r.w);
  const jump = Math.max(...Array.from(r.c.q.slice(3)).map((a, i) => Math.abs(a - frozen[i])));
  const j0 = r.c.joints[0], beatStep = j0.swing * Math.PI / Math.min(j0.stroke, 1 - j0.stroke) * j0.rate * DT;  // most a beating joint moves in a step
  check('a light sensor reads the light where it is by the way it faces (facing away, the scattered share); a wired motor runs only in range, resuming without a jump',
    Math.abs(up.value - expected) < 0.01 && deep.value < up.value * 0.15 && Math.abs(side.value - PARAMS.sensor.scatter * expected) < 0.01 &&
    Math.abs(down.value - PARAMS.sensor.scatter * expected) < 0.01 &&
    off.value === 0 && up.on && !deep.on && !down.on && y1 > 1910 && still && jump <= beatStep * 1.001,
    `facing up 50 µm from the surface ${fmt(up.value)}, 1.5 mm deep ${fmt(deep.value)}, sideways ${fmt(side.value)}, ` +
    `down ${fmt(down.value)}, light off ${fmt(off.value)}; swam ${fmt(y1 - 1900, 1)} µm up in 0.5 s\n      ` +
    `turned down: tail frozen ${still ? 'in place' : 'NOT in place'}; turned back up, its first step moves ` +
    `${fmt(jump * 180 / Math.PI, 2)}° (an ordinary beat step is up to ${fmt(beatStep * 180 / Math.PI, 2)}°)`);
}

// 20. Wired to run while the light is below 0.8, a sinking swimmer climbs until the light is enough, then hovers
// there (a range of 0.3-0.8 would also stop it in water too dark, and it would sink away). It needs an oil droplet
// at its front to stay pointed up (gyrotaxis): without one its tail makes it veer, it ends up facing sideways or
// down, and swims away downward (found when the tank got wider: the old narrow tank's wall had been steering it).
{
  const w = makeWorld(1);
  const design = eyeTail(0, 0.8);
  design.parts.push({ type: 'inclusion', at: [2.6, 0], radius: 5, material: 'oil' });   // smaller (r 4) is too weak to keep it up
  const c = addCell(w, design, 300, 1300, 90);
  const ys = [];
  for (let i = 0; i < 60000; i++) { stepWorld(w); if (i >= 40000 && i % 100 === 0) ys.push(c.q[1]); }
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const level = PARAMS.tank.h - Math.log(1 / 0.8) / PARAMS.light.attenuation;   // where facing-up light is 0.8
  check('wired to run while the light is below 0.8, a swimmer climbs until the light is enough, then hovers',
    lo > level - 60 && hi < level + 40,
    `started 700 µm down; over its last 20 s it stays ${fmt(PARAMS.tank.h - hi, 0)}–${fmt(PARAMS.tank.h - lo, 0)} µm ` +
    `from the surface (light 0.8 at ${fmt(PARAMS.tank.h - level, 0)} µm)`);
}

// 21. Touch and proximity sensors feel another species, not their own kind; a spring wired to touch fires on contact
{
  const feeler = {
    species: 'F',
    body: { radius: 8 },
    parts: [
      { type: 'sensor', id: 'touch', at: [8, 0], kind: 'touch' },
      { type: 'sensor', id: 'near', at: [8, 0], kind: 'near', range: 50 },
      { type: 'segment', at: [-8, 0], angle: 180, length: 30, radius: 0.4,
        joint: { type: 'hinge', stiffness: 2000, rest: 150, latched: true, control: { sensor: 'touch', min: 0.5, max: 1 } } },
    ],
  };
  const read = (other, gap) => {
    const w = makeWorld(1, { gravity: false });
    const c = addCell(w, feeler, 300, 1000, 0);
    addCell(w, other, 300 + 16 + gap, 1000, 0);
    stepWorld(w);
    return { touch: c.sensors[0].value, near: c.sensors[1].value, fired: !c.joints[0].latched };
  };
  const stranger = { species: 'X', body: { radius: 8 }, parts: [] };
  const far = read(stranger, 80), mid = read(stranger, 25), touching = read(stranger, 1), kin = read(feeler, 1);
  check('touch and proximity sensors feel another species (not kin); a spring wired to touch fires on contact',
    far.near === 0 && mid.near > 0.4 && mid.near < 0.6 && mid.touch === 0 && touching.touch === 1 && touching.fired &&
    !mid.fired && kin.touch === 0 && kin.near === 0,
    `stranger 80 µm away: proximity ${fmt(far.near)}; 25 µm: proximity ${fmt(mid.near)}, touch ${mid.touch}; ` +
    `1 µm: touch ${touching.touch}, spring ${touching.fired ? 'fired' : 'waits'}; kin 1 µm away: touch ${kin.touch}`);
}

// 22. Inclusions can't overlap: the room inside a cell is limited
{
  const tryBuild = (parts) => { try { addCell(makeWorld(1), { body: { radius: 10 }, parts }, 300, 1000); return 'built'; } catch (e) { return e.message; } };
  const apart = tryBuild([{ type: 'inclusion', at: [4.5, 0], radius: 4, material: 'oil' }, { type: 'inclusion', at: [-4.5, 0], radius: 4, material: 'oil' }]);
  const stacked = tryBuild([{ type: 'inclusion', at: [1, 0], radius: 4, material: 'oil' }, { type: 'inclusion', at: [-1, 0], radius: 4, material: 'chamber' }]);
  check('inclusions side by side fit; overlapping ones are refused', apart === 'built' && stacked.startsWith('inclusions overlap'),
    `side by side: ${apart}; overlapping: "${stacked}"`);
}

// 23. An eyespot's cone: a narrow one sees only when pointed almost straight up (precise), a wide one more loosely
{
  const read = (cone, tiltDeg) => {
    const w = makeWorld(1, { gravity: false });
    const c = addCell(w, { body: { radius: 8 }, parts: [{ type: 'sensor', at: [8, 0], kind: 'light', cone }] }, 300, 1990, 90 + tiltDeg);
    stepWorld(w);
    return c.sensors[0].value;
  };
  const narrow = [0, 10, 30].map((t) => read(40, t)), wide = [0, 10, 30].map((t) => read(180, t));
  check('a narrow eyespot sees only near straight up (beyond its cone, only scattered light); a wide one falls off gently',
    Math.abs(narrow[2] - PARAMS.sensor.scatter * narrow[0]) < 0.01 && wide[2] > 0.8 && narrow[0] > 0.98 && narrow[1] < wide[1],
    `tilted 0/10/30° from up: 40° cone ${narrow.map((v) => fmt(v)).join(' / ')}, 180° cone ${wide.map((v) => fmt(v)).join(' / ')}`);
}

// 24. A burst organ: fired, a 20 µm coiled tail beats very fast for a moment and throws the cell ~200 µm, then stops
// dead; it can't fire again until it has recharged; it costs much more than ordinary swimming
{
  const organ = { body: { radius: 8 }, parts: Array.from({ length: 4 }, (_, i) => ({
    type: 'segment', id: `b${i}`, parent: i ? `b${i - 1}` : 'body', at: i ? [2.5, 0] : [-8, 0], angle: i ? 0 : 180,
    length: 5, radius: 0.3, joint: { type: 'motor', rate: 500, swing: 40, phase: -i * 0.2, burst: { duration: 0.8, recharge: 3, group: 'b' } } })) };
  const w = makeWorld(1, { gravity: false });
  const c = addCell(w, organ, 300, 1000, 0);
  for (let i = 0; i < 100; i++) stepWorld(w);
  const idle = Math.hypot(c.q[0] - 300, c.q[1] - 1000);
  fire(c);
  for (let i = 0; i < 800; i++) stepWorld(w);
  const thrown = Math.hypot(c.q[0] - 300, c.q[1] - 1000);
  const x1 = c.q[0], y1 = c.q[1];
  for (let i = 0; i < 500; i++) stepWorld(w);
  const after = Math.hypot(c.q[0] - x1, c.q[1] - y1);
  const again = fire(c);
  for (let i = 0; i < 3000; i++) stepWorld(w);
  const recharged = c.joints[0].burst.state === 'charged';
  const swimFw = 263;   // the Wave tail's swimming power (check 10), fW
  check('a burst organ throws the cell ~200 µm, stops dead, must recharge, and costs a lot',
    idle === 0 && thrown > 180 && after < 0.5 && !again && recharged,
    `charged, it waits (moved ${fmt(idle, 1)} µm); fired: ${fmt(thrown, 0)} µm in 0.8 s; then ${fmt(after, 2)} µm in 0.5 s; ` +
    `fire again at once: ${again ? 'fired' : 'refused, recharging'}; charged again after 3 s: ${recharged}\n      ` +
    `the burst cost ${fmt(c.energy.motor / 1000, 0)} fJ, as much as ${fmt(c.energy.motor / (swimFw * 1000), 0)} s of wave-tail swimming`);
}

// ----- metabolism (energy, plastids, stores, day and night) -----
const phototroph = (y = 4, extra = []) => ({ body: { radius: 8 }, parts: [
  { type: 'inclusion', at: [0, y], radius: 3, material: 'plastid' },
  { type: 'inclusion', at: [0, -4], radius: 3, material: 'starch', fill: 0.3 },
  ...extra ] });
const runDay = (design, y, seconds, opts = {}) => {
  const w = makeWorld(1, { gravity: false, day: true, metab: true, ...opts });
  const c = addCell(w, design, 800, y, 90);
  const log = [];
  let starved = 0;
  for (let i = 1; i <= seconds / DT; i++) { stepWorld(w); if (c.metab.starving) starved++; if (!(i % 1000)) log.push({ h: clock(w), fill: c.pieces[0].inclusions[1]?.fill, E: c.metab.E / c.metab.C }); }
  return { w, c, log, starved: starved * DT };
};

// 25. The sun rises and sets: noon light, dark at midnight; with the day off it is always noon
{
  const w = makeWorld(1, { day: true });
  const at = (h) => { while (Math.abs(clock(w) - h) > 0.05) stepWorld(w); return daylight(w); };
  const noon = at(12), dusk = at(18.5), midnight = at(0);
  const still = makeWorld(1);
  check('the sun rises and sets (a day of 10 minutes); with the day off it is always noon',
    noon > 0.99 && dusk === 0 && midnight === 0 && daylight(still) === 1,
    `sunlight at noon ${fmt(noon)}, 18:30 ${fmt(dusk)}, midnight ${fmt(midnight)}; day off: ${fmt(daylight(still))}`);
}

// 26. A plastid earns by the light where it is: in good light (not so bright it is damaged) a cell lives through the
// night on its starch; deep down it cannot earn its keep and starves
{
  const top = runDay(phototroph(), 1550, 720), deep = runDay(phototroph(), 500, 720);
  check('in good light (450 µm down) a plastid feeds the cell through day and night; deep down it starves',
    top.starved === 0 && deep.starved > 100,
    `450 µm down: starving ${fmt(top.starved, 0)} s of 720; 1.5 mm down: starving ${fmt(deep.starved, 0)} s`);
}

// 27. Starch fills by day and is burned at night; full, it makes the cell heavier
{
  const r = runDay(phototroph(), 1900, 720);
  const at = (h) => r.log.reduce((best, x) => (Math.abs(x.h - h) < Math.abs(best.h - h) ? x : best)).fill;
  const sink = (fill) => {
    const w = makeWorld(1, { day: true, metab: false });
    const c = addCell(w, { body: { radius: 8 }, parts: [{ type: 'inclusion', at: [0, 0], radius: 4, material: 'starch', fill }] }, 800, 1000);
    for (let i = 0; i < 1000; i++) stepWorld(w);
    return 1000 - c.q[1];
  };
  const empty = sink(0), full = sink(1);
  check('starch fills by day, is burned at night, and full it sinks the cell faster',
    at(17) > at(9) && at(5) < at(17) && full > empty * 1.1,
    `starch at 9 h ${fmt(100 * at(9), 0)}%, 17 h ${fmt(100 * at(17), 0)}%, 5 h ${fmt(100 * at(5), 0)}%; ` +
    `sinking empty ${fmt(empty)} µm/s, full ${fmt(full)} µm/s`);
}

// 28. Starving stops the motors: a swimmer with no plastid runs its tail until its pool is empty
{
  const swimmer = { body: { radius: 8 }, parts: PRESETS['Wave tail'].parts };
  const w = makeWorld(1, { gravity: false, metab: true });
  const c = addCell(w, swimmer, 800, 1000, 0);
  let stoppedAt = null;
  for (let i = 1; i <= 120 / DT; i++) { stepWorld(w); if (stoppedAt === null && c.metab.starving) stoppedAt = i * DT; }
  const x1 = c.q[0];
  for (let i = 0; i < 2000; i++) stepWorld(w);
  check('starving stops the motors', stoppedAt !== null && !c.joints[0].on && Math.abs(c.q[0] - x1) < 1e-9,
    `no plastid: pool empty after ${fmt(stoppedAt ?? 0, 0)} s, then the tail stops and the cell stays put`);
}

// 28b. The built-in energy level can be wired: a tail set to run while energy is above 0.5 stops at 0.5, saving the rest
{
  const saver = { body: { radius: 8 }, parts: PRESETS['Wave tail'].parts.map((p) => ({ ...p, joint: { ...p.joint, control: { sensor: 'energy', min: 0.5, max: 1 } } })) };
  const w = makeWorld(1, { gravity: false, metab: true });
  const c = addCell(w, saver, 800, 1000, 0);
  let stoppedAt = null;
  for (let i = 1; i <= 60 / DT; i++) { stepWorld(w); if (stoppedAt === null && !c.joints[0].on) stoppedAt = c.metab.E / c.metab.C; }
  check('the built-in energy level can be wired: a tail stops when energy falls below its range',
    stoppedAt !== null && Math.abs(stoppedAt - 0.5) < 0.05,   // (with no plastid its upkeep still starves it later)
    `tail wired to run while energy is 0.5-1: it stopped at ${fmt(100 * (stoppedAt ?? 0), 0)}% (the range's edge less a small dead band)`);
}

// 28c. Several conditions on one part, all must hold; a proximity sensor that feels "anything" feels the tank's wall
{
  const tail = PRESETS['Wave tail'].parts;   // swims toward +x (its front)
  const swimmer = (feels) => ({ body: { radius: 8 }, parts: [
    { type: 'sensor', id: 'near', at: [8, 0], kind: 'near', range: 50, feels },
    ...tail.map((p) => ({ ...p, joint: { ...p.joint, controls: [
      { sensor: 'energy', min: 0.3, max: 1 },
      { sensor: 'near', min: 0, max: 0.3 },
    ] } })) ] });
  const run = (feels) => {
    const w = makeWorld(1, { gravity: false, metab: true });
    const c = addCell(w, swimmer(feels), PARAMS.tank.w - 200, 1000, 0);
    for (let i = 0; i < 10 / DT; i++) stepWorld(w);
    return { gap: PARAMS.tank.w - (c.q[0] + 8), on: c.joints[0].on, conds: c.joints[0].controls.length };
  };
  const anything = run('anything'), strangers = run('strangers');
  check('a part can need several conditions at once; a proximity sensor set to "anything" feels the wall',
    anything.conds === 2 && !anything.on && anything.gap > 25 && anything.gap < 45 && strangers.gap < 5,
    `tail runs while energy 0.3-1 AND proximity 0-0.3 (range 50 µm): feeling anything it stops ${fmt(anything.gap, 0)} µm ` +
    `from the wall; feeling only other species it swims into it (${fmt(strangers.gap, 1)} µm)`);
}

// 28d. Logic in wiring: NOT (outside a range) and OR (groups); energy is full (metabolism off), the wall near or far
{
  const tail = PRESETS['Wave tail'].parts;
  const swimmer = (controls) => ({ body: { radius: 8 }, parts: [
    { type: 'sensor', id: 'near', at: [8, 0], kind: 'near', range: 50, feels: 'anything' },
    ...tail.map((p) => ({ ...p, joint: { ...p.joint, controls } })) ] });
  const on = (controls, gap) => {   // is the tail on after one step, its sensor `gap` µm from the wall?
    const w = makeWorld(1, { gravity: false });
    const c = addCell(w, swimmer(controls), PARAMS.tank.w - 8 - 8 - gap, 1000, 0);
    stepWorld(w);
    return c.joints[0].on;
  };
  const both = (controls) => `${on(controls, 200) ? 'on' : 'off'} far, ${on(controls, 10) ? 'on' : 'off'} near`;
  const nearNot = [{ sensor: 'near', min: 0.3, max: 1, not: true }];
  const hungryOrNear = [{ sensor: 'energy', min: 0, max: 0.5 }, { sensor: 'near', min: 0.3, max: 1, or: true }];
  const hungryAndNear = [{ sensor: 'energy', min: 0, max: 0.5 }, { sensor: 'near', min: 0.3, max: 1 }];
  const fullOrNot = [{ sensor: 'near', min: 0.3, max: 1 }, { sensor: 'energy', min: 0, max: 0.5, not: true, or: true }];
  const loneOr = [{ sensor: 'near', min: 0.3, max: 1, or: true }];
  const r = [both(nearNot), both(hungryOrNear), both(hungryAndNear), both(fullOrNot), both(loneOr)];
  check('wiring logic: NOT takes the outside of a range, OR joins groups of conditions',
    r.join('|') === 'on far, off near|off far, on near|off far, off near|on far, on near|off far, on near',
    `NOT near: ${r[0]}; hungry OR near: ${r[1]}; hungry AND near: ${r[2]}; near OR NOT hungry: ${r[3]}; ` +
    `an "or" on the first condition is ignored: ${r[4]}`);
}

// 28e. A mirror copy (the Build panel's ⇅) swims as the exact reflection of the original
{
  const oar = PART_TEMPLATES['Flexible oar (swims)']({ radius: 8 }, 150, 'oar', 0.4, 20);   // off-axis: it swims in a curve
  const swim = (parts) => {
    const w = makeWorld(1, { gravity: false });
    const c = addCell(w, { body: { radius: 8 }, parts }, 1000, 1000, 0);
    for (let i = 0; i < 5 / DT; i++) stepWorld(w);
    return [c.q[0] - 1000, c.q[1] - 1000, c.q[2] * 180 / Math.PI];
  };
  const a = swim(oar), b = swim(mirrorGroup(oar, 0, 'copy'));
  const off = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] + b[1]));
  check('a mirrored part swims as the mirror image of the original',
    Math.hypot(a[0], a[1]) > 5 && off < 1e-6 && Math.abs(a[2] + b[2]) < 1e-6,
    `flexible oar at 150°, tilt 20°, 5 s: moved (${fmt(a[0], 1)}, ${fmt(a[1], 1)}) µm, turned ${fmt(a[2], 1)}°; ` +
    `its mirror (${fmt(b[0], 1)}, ${fmt(b[1], 1)}) µm, ${fmt(b[2], 1)}° (off by ${off.toExponential(1)} µm)`);
}

// 28f. A statolith reads which way is up; a nutrient sensor reads the nutricline
{
  const read = (angle, facing = 0, gravity = true) => {
    const w = makeWorld(1, { gravity });
    const c = addCell(w, { body: { radius: 10 }, parts: [
      { type: 'inclusion', id: 'st', material: 'statolith', at: [-4, 0], radius: 3, angle: facing }] }, 800, 1000, angle);
    stepWorld(w);
    return c.sensors[0].value;
  };
  const r = [read(90), read(0), read(-90), read(90, 180), read(90, 0, false)];
  const chem = (y) => {
    const w = makeWorld(1, { gravity: false });
    const c = addCell(w, { body: { radius: 10 }, parts: [{ type: 'sensor', id: 'n', kind: 'chem', at: [10, 0] }] }, 800, y, 0);
    stepWorld(w);
    return c.sensors[0].value;
  };
  const n = [chem(PARAMS.tank.h - 50), chem(PARAMS.tank.h * (1 - PARAMS.nutrient.cline)), chem(50)];   // surface, at the nutricline, deep
  check('a statolith reads which way is up; a nutrient sensor reads poor water above the nutricline, rich below',
    Math.abs(r[0] - 1) < 1e-6 && Math.abs(r[1] - 0.5) < 1e-6 && Math.abs(r[2]) < 1e-6 && Math.abs(r[3]) < 1e-6 && r[4] === 0.5
      && Math.abs(n[0] - PARAMS.nutrient.surface) < 0.01 && Math.abs(n[1] - (1 + PARAMS.nutrient.surface) / 2) < 0.02 && n[2] > 0.95,
    `statolith facing the front: front up ${fmt(r[0])}, level ${fmt(r[1])}, down ${fmt(r[2])}; facing back, front up ` +
    `${fmt(r[3])}; no gravity ${fmt(r[4])}. Nutrients near the surface ${fmt(n[0])}, at the nutricline ${fmt(n[1])}, near the floor ${fmt(n[2])}`);
}

// 28j. A compare condition: a part runs while one sensor reads more than another (here two statoliths facing opposite
// ways: the one facing up reads more)
{
  const on = (angle, not = false) => {
    const w = makeWorld(1);
    const c = addCell(w, { body: { radius: 10 }, parts: [
      { type: 'inclusion', id: 'front', material: 'statolith', at: [-4, 0], radius: 3, angle: 0 },
      { type: 'inclusion', id: 'back', material: 'statolith', at: [4, 0], radius: 3, angle: 180 },
      ...PRESETS['Wave tail'].parts.map((p) => ({ ...p, joint: { ...p.joint, controls: [{ sensor: 'front', vs: 'back', not }] } }))] },
      800, 1000, angle);
    stepWorld(w);
    return c.joints[0].on;
  };
  const r = [on(60), on(-60), on(0), on(-60, true)];
  check('a compare condition holds while one sensor reads more than another (and "is not" flips it)',
    r.join() === 'true,false,false,true',
    `tail runs while the front-facing statolith reads more than the back-facing one: front up ${r[0]}, front down ${r[1]}, ` +
    `level (equal) ${r[2]}; "is not more than", front down ${r[3]}`);
}

// 28k. A wave running toward the body pulls the cell after the tail; a beat that follows a reading slows in proportion
{
  const go = (pull, speed) => {
    const parts = PART_TEMPLATES['Wave tail (swims)']({ radius: 8 }, 180, 't', 0.4, 0, 1, 'strangers', 48, undefined, undefined, pull);
    if (speed) for (const p of parts) p.joint.speed = speed;
    const w = makeWorld(1, { gravity: false });
    const c = addCell(w, { body: { radius: 8 }, parts }, 800, 1000, 0);
    for (let i = 0; i < 5 / DT; i++) stepWorld(w);
    return (c.q[0] - 800) / 5;
  };
  const push = go(false), pull = go(true), half = go(false, { sensor: 'energy', min: 0, max: 2 });
  check('a pulling tail (wave toward the body) moves the cell toward the tail; a beat that follows a reading slows in proportion',
    push > 10 && Math.abs(pull + push) < 1e-3 * push && Math.abs(half / push - 0.5) < 0.02,
    `tail behind, pushing: ${fmt(push, 1)} µm/s forward; pulling: ${fmt(pull, 1)} µm/s (toward the tail); ` +
    `speed following the energy level (1 of a 0-2 range): ${fmt(half, 1)} µm/s`);
}

// 28l. Rod-shaped inclusions: a rod weighs its capsule's volume; two rods side by side fit until they touch; in a long
// cell a rod holds far more than the biggest round inclusion
{
  const body = { radius: 8, length: 40 };
  const oil = (extra) => ({ type: 'inclusion', material: 'oil', ...extra });
  const weightOf = (parts) => cellWeight(addCell(makeWorld(1), { body, parts }, 800, 1000, 0));
  const bare = weightOf([]), rod = weightOf([oil({ at: [0, 0], radius: 3, length: 20 })]);
  const capsule = Math.PI * 9 * 20 + (4 / 3) * Math.PI * 27;   // µm³
  const expected = MATERIALS.oil.density - PARAMS.cell.cytoplasm;
  const perVolume = (rod - bare) / capsule / (PARAMS.gravity * 1e-6);
  const builds = (parts) => { try { addCell(makeWorld(1), { body, parts }, 800, 1000, 0); return true; } catch (e) { return false; } };
  const apart = builds([oil({ at: [0, 3.2], radius: 3, length: 20 }), oil({ at: [0, -3.2], radius: 3, length: 20 })]);
  const touching = builds([oil({ at: [0, 2.5], radius: 3, length: 20 }), oil({ at: [0, -2.5], radius: 3, length: 20 })]);
  const crossing = builds([oil({ at: [0, 0], radius: 2, length: 20 }), oil({ at: [0, 0], radius: 2, length: 8, angle: 90 })]);
  const roundMax = (4 / 3) * Math.PI * 7.6 ** 3, rodBig = Math.PI * 7.6 ** 2 * 38 + roundMax;   // r 7.6 fits inside 8 - wall
  const bigRod = builds([oil({ at: [0, 0], radius: 7.6, length: 38 })]), tooLong = builds([oil({ at: [0, 0], radius: 7.6, length: 44 })]);
  check('rod-shaped inclusions: weight of their real volume, overlap and room for the real shape',
    Math.abs(perVolume - expected) < 0.01 && apart && !touching && !crossing && bigRod && !tooLong,
    `an oil rod (r 3, 20 µm straight) weighs ${fmt(perVolume, 1)} kg/m³ × its capsule volume (oil minus cytoplasm: ${expected}); ` +
    `two rods 6.4 µm apart fit: ${apart}, 5 µm apart: ${touching}, crossing: ${crossing}; in a cell 8 µm × 56 µm a rod ` +
    `holds ${fmt(rodBig / roundMax, 1)}× the biggest round one: ${bigRod}, one too long sticks out: ${!tooLong}`);
}

// 28l2. Soft blobs: an organelle's shape is its outline. An outline traced round a rod or a band holds what the rod or
// band holds; a bump that adds area adds volume, a dent takes some away; an outline sticking out of the wall, or into
// another organelle, does not build; a bump on one side moves the weight that way.
{
  const body = { radius: 10 };
  const oil = (extra) => ({ type: 'inclusion', material: 'oil', at: [0, 0], ...extra });
  const shape = (p) => build({ body, parts: [p] }).pieces[0].inclusions[0];
  const own = (p) => { const s = shape(p); return s.outline.map(([x, y]) => [x - p.at[0], y - p.at[1]]); };   // its points round `at`
  const rod = oil({ radius: 3, length: 8, angle: 30 }), band = oil({ at: [0, 5], radius: 2.5, length: 10, bend: 1 / 5, angle: 180 });
  const rodBack = shape({ ...oil({ angle: 30 }), outline: own(rod).map(([x, y]) => [x * 0.866 + y * 0.5, -x * 0.5 + y * 0.866]) });
  const bandBack = shape({ ...oil({ at: [0, 5] }), outline: own(band) });
  const round = oil({ radius: 4 }), pts = own(round), bump = pts.map((p, k) => { const f = 1 + 0.25 * Math.max(0, p[0] / Math.hypot(p[0], p[1])) ** 3; return [p[0] * f, p[1] * f]; });
  const dent = pts.map((p) => { const f = 1 - 0.2 * Math.max(0, p[0] / Math.hypot(p[0], p[1])) ** 3; return [p[0] * f, p[1] * f]; });
  const v0 = shape(round).v, vb = shape(oil({ outline: bump })), vd = shape(oil({ outline: dent })).v;
  const builds = (parts) => { try { build({ body, parts }); return true; } catch (e) { return false; } };
  const out = builds([oil({ at: [5.6, 0], outline: bump })]), inWall = builds([oil({ at: [4, 0], outline: bump })]);
  const crossing = builds([oil({ at: [-1, 0], outline: bump }), oil({ at: [4.5, 0], radius: 1 })]);
  const beside = builds([oil({ at: [-1, 0], outline: pts }), oil({ at: [4.5, 0], radius: 1 })]);
  const near = (a, b) => Math.abs(a / b - 1) < 1e-3;
  check('soft blobs: an outline holds what its shape holds; bumps add volume, dents take it; the wall and neighbours count',
    near(rodBack.v, shape(rod).v) && near(bandBack.v, shape(band).v) && vb.v > v0 * 1.05 && vd < v0 * 0.97 && vb.x > 0.2 &&
    !out && inWall && !crossing && beside,
    `a rod traced as an outline: ${fmt(rodBack.v, 1)} µm³ (the rod: ${fmt(shape(rod).v, 1)}); a band: ${fmt(bandBack.v, 1)} ` +
    `(${fmt(shape(band).v, 1)}); round r 4: ${fmt(v0, 1)}, a bump on its right: ${fmt(vb.v, 1)} (weight ${fmt(vb.x, 2)} µm ` +
    `to the right), a dent: ${fmt(vd, 1)}; bumped, against the wall: ${out ? 'builds' : 'sticks out'}, clear of it: ${inWall}; ` +
    `its bump into a neighbour: ${crossing ? 'builds' : 'overlaps'}, the same without the bump: ${beside}`);
}

// 28l3. Moulding by hand (sandbox/mould.js): pressed into the wall an organelle flattens there, keeps its volume and
// still fits; a pulled spot adds volume; Squish to fit packs a crowded cell (they dent each other, each keeping its
// volume), even four right on top of each other; a mirror copy of a moulded one is its exact reflection
{
  const body = { radius: 10 };
  const inc = (material, at, radius, extra) => ({ type: 'inclusion', material, at, radius, ...extra });
  const fits = (d) => { try { build(d); return true; } catch (e) { return false; } };
  const B = inc('oil', [0, 0], 4), p = JSON.parse(JSON.stringify(B));
  moveTo(p, B, [7.5, 0], body);
  const pressed = volumeOf(p) / volumeOf(B), pressedFits = fits({ body, parts: [p] }) && !!p.outline;
  const q = JSON.parse(JSON.stringify(B)); toOutline(q);
  dragSpot(q, ownPoints(q), 0, [ownPoints(q)[0][0], ownPoints(q)[0][1] - 2], body);
  const pulled = volumeOf(q) / volumeOf(B);
  const crowd = { body, parts: [0, 120, 240].map((a, k) => inc(['oil', 'starch', 'plastid'][k], [2 * Math.cos(a * DEG), 2 * Math.sin(a * DEG)], 4.6))
    .concat([inc('statolith', [0, 0], 1.5, { id: 's' })]) };
  const v0 = crowd.parts.map(volumeOf), crowdedBefore = fits(crowd);
  relax(crowd, -1, 150, 5000);
  const kept = Math.max(...crowd.parts.map((x, i) => Math.abs(volumeOf(x) / v0[i] - 1)));
  const stack = { body: { radius: 12 }, parts: ['oil', 'starch', 'plastid', 'chamber'].map((mat) => inc(mat, [1, 1], 3)) };
  relax(stack, -1, 150, 5000);
  const unstacked = fits(stack);
  const [m] = mirrorGroup([q], 90, 'm'), A = build({ body, parts: [q] }).pieces[0].inclusions[0].outline, M = build({ body, parts: [m] }).pieces[0].inclusions[0].outline;
  let off = 0; for (const [x, y] of M) off = Math.max(off, Math.min(...A.map(([u, v]) => Math.hypot(u + x, v - y))));
  check('moulding by hand: pressed into the wall it flattens and keeps its volume; Squish to fit packs a crowded cell',
    Math.abs(pressed - 1) < 0.01 && pressedFits && pulled > 1.05 && !crowdedBefore && fits(crowd) && kept < 0.01 && unstacked && off < 1e-6,
    `r 4 pressed 3.5 µm into the wall: volume ×${fmt(pressed, 3)}, fits: ${pressedFits}; a spot pulled out 2 µm: volume ×${fmt(pulled, 2)}; ` +
    `three r 4.6 round a statolith in a r 10 cell: ${crowdedBefore ? 'fit' : 'overlap'}, after Squish to fit: ${fits(crowd) ? 'fit' : 'still overlap'} ` +
    `(volumes within ${fmt(100 * kept, 1)}%); four right on top of each other: ${unstacked ? 'fit' : 'still overlap'}; a mirror copy is off its reflection by ${fmt(off, 6)} µm`);
}

// 28m. The built-in starch level: a tail wired to "starch 0.2-1" (AND another condition) stops once the starch is low
{
  const on = (fill) => {
    const w = makeWorld(1, { gravity: false });
    const c = addCell(w, { body: { radius: 10 }, parts: [
      { type: 'inclusion', id: 'st', material: 'starch', at: [-4, 0], radius: 4, fill },
      ...PRESETS['Wave tail'].parts.map((p) => ({ ...p, joint: { ...p.joint, controls: [
        { sensor: 'energy', min: 0.1, max: 1 }, { sensor: 'starch', min: 0.2, max: 1 }] } }))] }, 800, 1000, 0);
    stepWorld(w);
    return c.joints[0].on;
  };
  const r = [on(0.8), on(0.25), on(0.1), on(0)];
  check('the starch level can be wired: a tail needing "starch 0.2-1" AND energy stops when the starch runs low',
    r.join() === 'true,true,false,false', `starch 80%: ${r[0]}, 25%: ${r[1]}, 10%: ${r[2]}, empty: ${r[3]}`);
}

// 28n. STOP conditions override GO; a beat can slow as a reading rises ("down"); a shade plastid (phycobilins) earns
// more deep and less near the surface than a sun plastid
{
  const tailOn = (controls, angle) => {
    const w = makeWorld(1);
    const c = addCell(w, { body: { radius: 10 }, parts: [
      { type: 'inclusion', id: 'up', material: 'statolith', at: [-4, 0], radius: 3 },
      ...PRESETS['Wave tail'].parts.map((p) => ({ ...p, joint: { ...p.joint, controls } }))] }, 800, 1000, angle);
    stepWorld(w);
    return c.joints[0].on;
  };
  const go = [{ sensor: 'energy', min: 0.1, max: 1 }], stop = { sensor: 'up', min: 0.6, max: 1, stop: true };
  const r = [tailOn([...go, stop], 0), tailOn([...go, stop], 90), tailOn([stop], 0), tailOn([stop], 90)];
  const speed = (down) => {
    const parts = PRESETS['Wave tail'].parts.map((p) => ({ ...p, joint: { ...p.joint, speed: { sensor: 'energy', min: 0, max: 4, down } } }));
    const w = makeWorld(1, { gravity: false });
    const c = addCell(w, { body: { radius: 8 }, parts }, 800, 1000, 0);
    for (let i = 0; i < 3 / DT; i++) stepWorld(w);
    return c.joints[0].gain;
  };
  const up = speed(false), down = speed(true);
  const income = (pigment, depth) => {
    const w = makeWorld(1, { metab: true, gravity: false });
    const c = addCell(w, { body: { radius: 10 }, parts: [{ type: 'inclusion', material: 'plastid', at: [0, 0], radius: 4, pigment }] },
      800, PARAMS.tank.h - depth, 0);
    stepWorld(w);
    return c.metab.income;
  };
  const sunTop = income('sun', 20), shadeTop = income('shade', 20), sunDeep = income('sun', 1800), shadeDeep = income('shade', 1800);
  check('STOP conditions override GO; a beat can slow as a reading rises; a shade plastid wins deep, a sun plastid near the top',
    r.join() === 'true,false,true,false' && Math.abs(up - 0.25) < 1e-9 && Math.abs(down - 0.75) < 1e-9 && sunTop > shadeTop && shadeDeep > sunDeep,
    `tail GO energy 0.1-1, STOP statolith above 0.6: level ${r[0]}, front up ${r[1]}; STOP only: level ${r[2]}, up ${r[3]}. ` +
    `Speed following the energy level (1 of 0-4): rising ${fmt(up)}, "down" ${fmt(down)}. Plastid income 20 µm down: ` +
    `sun ${fmt(sunTop, 0)}, shade ${fmt(shadeTop, 0)} pJ/s; 1800 µm down: sun ${fmt(sunDeep, 0)}, shade ${fmt(shadeDeep, 0)} pJ/s`);
}

// 28o. Too much light: a plastid held in bright light is damaged and earns less (after repair) than one a little
// deeper; in the dark it mends, unless the cell is starving. Beating costs by length while it beats, nothing at rest.
{
  const plastid = { body: { radius: 10 }, parts: [{ type: 'inclusion', material: 'plastid', at: [0, 0], radius: 5 }] };
  const held = (depth, seconds) => {
    const w = makeWorld(1, { metab: true, gravity: false });
    const c = addCell(w, plastid, 800, PARAMS.tank.h - depth, 0);
    c.metab.C = c.metab.E = 1e12;   // never starves
    let net = 0;
    for (let i = 0; i < seconds / DT; i++) { stepWorld(w); net += c.metab.income - c.metab.repair; }
    return { w, c, net: net * DT / seconds, damage: c.pieces[0].inclusions[0].damage };
  };
  const top = held(20, 100), mid = held(500, 100);
  const mend = (starving) => {
    const { w, c } = held(20, 100), d0 = c.pieces[0].inclusions[0].damage;
    w.light = false;
    if (starving) { c.metab.C = 100; c.metab.E = 0; }
    for (let i = 0; i < 50 / DT; i++) stepWorld(w);
    return c.pieces[0].inclusions[0].damage / d0;
  };
  const fed = mend(false), starved = mend(true);
  const beating = (on) => {
    const controls = [{ sensor: 'energy', min: on ? 0 : 0.99, max: 1 }];
    const parts = PRESETS['Wave tail'].parts.map((p) => ({ ...p, joint: { ...p.joint, controls } }));
    const w = makeWorld(1, { metab: true, gravity: false });
    const c = addCell(w, { body: { radius: 8 }, parts }, 800, 1000, 0);
    for (let i = 0; i < 1 / DT; i++) stepWorld(w);
    return c.metab.motors;
  };
  const tailL = PRESETS['Wave tail'].parts.reduce((a, p) => a + p.length, 0);
  const run1 = beating(true), rest = beating(false);
  check('too much light damages plastids (repair costs; mends in the dark, not while starving); beating costs while it beats',
    top.net < 0.8 * mid.net && top.damage > 0.2 && mid.damage < 0.1 && fed < 0.3 && starved > 0.999 &&
    run1 >= PARAMS.metab.beat * tailL && rest < 1e-9,
    `noon, held 20 µm down: damage ${fmt(top.damage)}, earns ${fmt(top.net, 0)} pJ/s after repair; 500 µm down: damage ` +
    `${fmt(mid.damage)}, ${fmt(mid.net, 0)} pJ/s. Damage left after 50 s dark: fed ${fmt(fed)}, starving ${fmt(starved)}. ` +
    `Wave tail (${tailL} µm) beating ${fmt(run1, 0)} pJ/s, resting ${fmt(rest, 0)}`);
}

// 28s. Division (step 1): a cell grown to twice its newborn volume splits into two newborns of its design, beside each
// other, not overlapping; each keeps half the pool and half of each store's energy; the tank's cap stops it
{
  const design = { body: { radius: 10 }, parts: [{ type: 'inclusion', id: 'st', material: 'starch', at: [0, -4], radius: 4, fill: 0.8 }] };
  const storeE = (c) => c.pieces[0].inclusions[0].fill * c.pieces[0].inclusions[0].v;
  const split = (cap) => {
    const w = makeWorld(1, { gravity: false, metab: true, grow: true });
    const c = addCell(w, design, 800, 1000, 90);
    regrow(w, c, 2);
    const E0 = c.metab.E, S0 = storeE(c);
    const was = PARAMS.grow.cap; PARAMS.grow.cap = cap;
    for (let i = 0; i < PARAMS.grow.every; i++) stepWorld(w);
    PARAMS.grow.cap = was;
    return { w, c, E0, S0 };
  };
  const { w, c, E0, S0 } = split(12), full = split(1);
  const d = w.cells[1], newborn = addCell(makeWorld(1), design, 0, 0, 0);
  const gap = d && Math.hypot(d.q[0] - c.q[0], d.q[1] - c.q[1]) - 20;
  const halfE = d && Math.abs(c.metab.E + d.metab.E - E0) < 0.05 * E0 && Math.abs(c.metab.E - d.metab.E) < 0.05 * E0;
  const halfS = d && Math.abs(storeE(c) - S0 / 2) < 0.01 * S0 && Math.abs(storeE(d) - S0 / 2) < 0.01 * S0;
  check('a cell grown to 2× divides into two newborns of its design, side by side; pool and store energy halved; the cap stops it',
    w.cells.length === 2 && d.design === c.design && c.size === 1 && d.size === 1 && Math.abs(d.pieces[0].volume - newborn.pieces[0].volume) < 1e-6
      && Math.abs(c.pieces[0].volume - newborn.pieces[0].volume) < 1e-6 && gap > -0.1 && gap < 8 && halfE && halfS
      && full.w.cells.length === 1 && full.c.waiting === 'tank full',
    `cells ${w.cells.length}, sizes ${c.size}× and ${d ? d.size : '–'}×; bodies ${d ? fmt(gap, 2) : '–'} µm apart; pool ${fmt(E0, 0)} -> ${d ? `${fmt(c.metab.E, 0)} + ${fmt(d.metab.E, 0)}` : '–'}; ` +
    `starch energy ${fmt(S0, 0)} -> ${d ? `${fmt(storeE(c), 0)} + ${fmt(storeE(d), 0)}` : '–'} µm³ full; with a cap of 1: ${full.w.cells.length} cell, waits: ${full.c.waiting}`);
  // the DIVIDE rule: a grown cell waits while it doesn't hold (here: "when its starch is more than 90% full"), divides once it does
  const ruled = { ...design, parts: [...design.parts, { type: 'rule', id: 'divide', joint: { type: 'divide', controls: [{ sensor: 'starch', min: 0.9, max: 1 }] } }] };
  const w2 = makeWorld(1, { gravity: false, metab: true, grow: true });
  const r = addCell(w2, ruled, 800, 1000, 90);
  regrow(w2, r, 2);
  for (let i = 0; i < 2 * PARAMS.grow.every; i++) stepWorld(w2);
  const waited = w2.cells.length === 1 && /DIVIDE rule/.test(r.waiting || '');
  r.pieces[0].inclusions[0].fill = 1;
  for (let i = 0; i < 2 * PARAMS.grow.every; i++) stepWorld(w2);
  check('a DIVIDE rule holds a grown cell back until it holds (none: it divides at 2×)',
    waited && w2.cells.length === 2, `starch 80% of a grown store, rule "starch more than 90%": ${waited ? 'waits' : 'did not wait'}; starch full: ${w2.cells.length} cells`);
}

// 28x. Growing (author, 2026-11-02): with a growth step's energy and nitrogen banked, a cell grows a tenth of its newborn
// volume: the body and its rim parts by its width, organelles with it (beyond 2×: half its gain); its stores keep their energy
// (emptier); it reads its Size; held back from dividing, it stops at PARAMS.grow.max
{
  const design = { body: { radius: 10 }, parts: [
    { type: 'inclusion', id: 'st', material: 'starch', at: [0, -4], radius: 4, fill: 0.8 },
    { type: 'inclusion', id: 'pl', material: 'plastid', at: [0, 5], radius: 3 },
    { type: 'segment', id: 'sp', at: [10, 0], angle: 0, length: 30, radius: 0.5 },
    { type: 'rule', id: 'divide', joint: { type: 'divide', controls: [{ sensor: 'feeding', min: 0.5, max: 1 }] } }] };   // never divides
  const w = makeWorld(1, { gravity: false, metab: true, grow: true });
  const c = addCell(w, design, 800, 1000, 90);
  const r0 = c.pieces[0].a, sp0 = c.pieces[1].L, pl0 = c.pieces[0].inclusions[1].v, st = () => c.pieces[0].inclusions[0], S0 = st().fill * st().v, f0 = st().fill;
  c.grow.E = c.grow.stepE; c.grow.N = c.grow.stepN;
  for (let i = 0; i < PARAMS.grow.every; i++) stepWorld(w);
  const one = { size: c.size, r: c.pieces[0].a / r0, sp: c.pieces[1].L / sp0, pl: c.pieces[0].inclusions[1].v / pl0, S: st().fill * st().v, fill: st().fill, left: c.grow.E };
  regrow(w, c, PARAMS.grow.max - 0.05);
  c.grow.E = c.grow.Eneed; c.grow.N = c.grow.Nneed;
  for (let i = 0; i < 3 * PARAMS.grow.every; i++) stepWorld(w);
  const w1 = Math.cbrt(1.1);
  check('growing: a step of 10%: the body and its spine by its width, organelles with it (half its gain beyond 2×); store energy kept; it stops at its largest',
    Math.abs(one.size - 1.1) < 1e-9 && Math.abs(one.r - w1) < 1e-6 && Math.abs(one.sp - w1) < 1e-6 && Math.abs(one.pl - 1.1) < 1e-3 && Math.abs(organelleGrowth(4) - 3) < 1e-9
      && Math.abs(one.S - S0) < 1e-6 * S0 && one.fill < f0 && one.left < 1e-6 && c.size === PARAMS.grow.max && w.cells.length === 1
      && Math.abs(sizeLevel(c) - 1) < 1e-9,
    `after one step: ${fmt(one.size, 2)}×, body radius ×${fmt(one.r, 3)}, spine ×${fmt(one.sp, 3)}, plastid volume ×${fmt(one.pl, 3)}; ` +
    `starch ${fmt(f0)} -> ${fmt(one.fill)} full (the same energy); bars full near the top: ${c.size}× (its largest), ${w.cells.length} cell`);
}

// 28u. The peduncle (step 1): its tip latches on another species' body (paying to pierce), never on kin; it drains the
// prey's energy and nitrogen, keeping PARAMS.feed.keep, until the prey dies of it; a swimmer that latches stays on (its own strokes'
// jerks don't tear it off)
{
  const ped = (species) => ({ species, body: { radius: 10 }, parts: [{ type: 'segment', at: [10, 0], angle: 0, length: 20, radius: 0.6, joint: { type: 'feed' } }] });
  const plain = (species) => ({ species, body: { radius: 10 }, parts: [] });
  const meet = (prey) => {
    const w = makeWorld(1, { gravity: false, light: false, metab: true, grow: true });
    const A = addCell(w, ped('hunter'), 800, 1000, 0), B = addCell(w, prey, 841, 1000, 0);
    B.grow.N = B.grow.Nneed;
    const E0 = A.metab.E;
    stepWorld(w);
    const paid = E0 - A.metab.E;
    let kept = 0;
    for (let i = 0; i < 90000 && w.cells.includes(B) && !B.dead; i++) { stepWorld(w); kept += A.metab.feeding * PARAMS.time.dt; }
    return { A, B, paid, kept, latched: !!A.feeders[0].link || !!A.lastMeal };
  };
  const hunt = meet(plain('prey')), kin = meet(plain('hunter'));
  // a swimmer with a peduncle in front, the prey in its path
  const sw = copy('Wave tail'); sw.species = 'swimmer';
  sw.parts.push({ type: 'segment', at: [sw.body.radius, 0], angle: 0, length: 20, radius: 0.6, joint: { type: 'feed' } });
  const w = makeWorld(1, { gravity: false, metab: true, grow: true });
  const S = addCell(w, sw, 800, 1000, 0); addCell(w, plain('prey'), 800 + S.reach + 12, 972, 0);
  let held = 0;
  for (let i = 0; i < 9000; i++) { stepWorld(w); if (S.feeders[0].link) held++; }
  check('a peduncle latches on another species (not kin), pays to pierce, drains it to death keeping its share; a swimmer stays latched',
    hunt.latched && !kin.latched && Math.abs(hunt.paid - PARAMS.feed.pierce * 20) < 0.2 * PARAMS.feed.pierce * 20 && hunt.B.dead
      && /drained by a hunter/.test(hunt.B.diedWhy) && hunt.A.grow.N > 0.8 * PARAMS.feed.keep * hunt.B.grow.Nneed && held > 5000,
    `on a stranger: paid ${fmt(hunt.paid / 1000, 0)}k to pierce, kept ${fmt(hunt.kept / 1000, 0)}k pJ and ${fmt(hunt.A.grow.N, 0)} N, ` +
    `the prey ${hunt.B.diedWhy || 'alive'}; on kin: ${kin.latched ? 'latched' : 'no latch'}; a swimming hunter held its prey ${fmt(held / 1000, 1)} of 9 s`);
}

// 28v. The armoured wall (author, 2026-11-02): cellulose plates make a cell sink faster, need more energy at each division
// (their volume, no nitrogen), and multiply a peduncle's piercing price by (1 + 2 × thickness: the tube's own price at
// once, the rest drilled, check 28am); a predator that can't pay the tube's own price doesn't latch; an old design's glass wall loads as protein
{
  const body = (plates) => ({ species: 'prey', body: plates ? { radius: 10, wall: 'plates', plates } : { radius: 10 }, parts: [] });
  const ped = { species: 'hunter', body: { radius: 10 }, parts: [{ type: 'segment', at: [10, 0], angle: 0, length: 20, radius: 0.6, joint: { type: 'feed' } }] };
  const sinks = (d) => sinking(run(d, 1));
  const v0 = sinks(body(0)), v1 = sinks(body(1));
  const meet = (plates, E) => {
    const w = makeWorld(1, { gravity: false, light: false, metab: true, grow: true });
    const A = addCell(w, ped, 800, 1000, 0), B = addCell(w, body(plates), 841, 1000, 0);
    if (E !== undefined) A.metab.C = A.metab.E = E;
    const E0 = A.metab.E;
    stepWorld(w);
    return { paid: A.feeders[0].link ? A.feeders[0].link.price : E0 - A.metab.E, latched: !!A.feeders[0].link, cant: A.cantPierce, B };   // the price on the latch (a big pool also fills the growth meter that step)
  };
  const p0 = meet(0), p1 = meet(1, 1e6), poor = meet(2, 30000);
  const g0 = p0.B.grow, g1 = p1.B.grow, oldGlass = run({ body: { radius: 10, wall: 'glass' }, parts: [] }, 1);
  check('plates: sink faster, cost energy at division (no nitrogen), triple the piercing price at 1 µm; a predator short of its tube price can\'t latch',
    v1 > 1.3 * v0 && g1.Eneed > 1.25 * g0.Eneed && g1.Nneed === g0.Nneed && Math.abs(p1.paid - 3 * PARAMS.feed.pierce * 20) < 1e-6 && Math.abs(p0.paid - PARAMS.feed.pierce * 20) < 1e-6 && p1.latched
      && !poor.latched && poor.cant && poor.cant.price === PARAMS.feed.pierce * 20 && Math.abs(sinking(oldGlass) - v0) < 1e-9,
    `sinks ${fmt(v0)} → ${fmt(v1)} µm/s with 1 µm plates; energy per division ${fmt(g0.Eneed / 1e6)} → ${fmt(g1.Eneed / 1e6)} million pJ; ` +
    `pierce ${fmt(p0.paid / 1000, 0)}k → ${fmt(p1.paid / 1000, 0)}k; 2 µm plates with 30k in the pool: ${poor.latched ? 'latched' : 'no latch'}; old glass wall: as protein`);
}

// 28am. Drilling (2026-11-05): a tube latched on a plated prey pays the tube's own price at once and drills the rest
// (what the plates add) as a flow from its pool above burnBelow, draining nothing until through; letting go loses it
{
  const prey = { species: 'prey', body: { radius: 10, wall: 'plates', plates: 2 }, parts: [] };
  const ped = (rule) => ({ species: 'hunter', body: { radius: 10 }, parts: [{ type: 'segment', id: 'p', at: [10, 0], angle: 0, length: 20, radius: 0.6, joint: { type: 'feed', ...(rule ? { controls: rule } : {}) } }] });
  const go = (design, secs, pool) => {
    const w = makeWorld(1, { gravity: false, light: false, metab: true });
    const A = addCell(w, design, 800, 1000, 0), B = addCell(w, prey, 841, 1000, 0);
    A.metab.C = A.metab.E = pool; B.metab.C = B.metab.E = 1e7;   // a rich prey (dark, no plastid: it would starve first)
    let through = null, tookWhile = 0, drillMax = 0;
    for (let i = 0; i < secs / DT; i++) {
      stepWorld(w); A.metab.E = Math.max(A.metab.E, pool * 0.5);   // its pool kept topped up (a fed cell), so drilling runs at full speed
      const l = A.feeders[0].link;
      if (l) { drillMax = Math.max(drillMax, l.drillAll); if (l.drill > 0) tookWhile = l.took; else if (through === null) through = (w.steps - l.since) * DT; }
    }
    return { A, B, l: A.feeders[0].link, through, tookWhile, drillMax };
  };
  const d = go(ped(), 150, 200000);
  const want = 4 * PARAMS.feed.pierce * 20 / PARAMS.feed.drill;   // 2 µm plates: 160k to drill at 2,000 pJ/s = 80 s
  // a tube that feeds while energy is above 60%: latching leaves 80%, drilling draws it down, at ~20 s it lets go
  const torn = go(ped([{ sensor: 'energy', min: 0.6, max: 1 }]), 25, 200000);
  check('drilling: a tube on a plated prey drills what the plates add before it drains, then feeds; letting go loses the drilling',
    d.drillMax === 4 * PARAMS.feed.pierce * 20 && d.tookWhile === 0 && Math.abs(d.through - want) < 3 && d.l && d.l.took > 0
      && torn.A.lastMeal && torn.A.lastMeal.drillLost > 0 && torn.A.lastMeal.took === 0,
    `2 µm plates: drilled ${fmt(d.drillMax / 1000, 0)}k, through after ${fmt(d.through, 0)} s (expected ${fmt(want, 0)}), drained ${fmt(d.tookWhile, 0)} while drilling, ${fmt(d.l && d.l.took / 1000, 0)}k after; ` +
    `a tube that let go early: ${torn.A.lastMeal ? fmt(torn.A.lastMeal.drillLost / 1000, 0) + 'k of drilling lost' : 'never let go'}`);
}

// 28w. The feeding reading (author, 2026-11-02): 1 while a peduncle of the cell is latched, else 0; a tail wired to stop
// while feeding stops; a dead prey drained of everything is never pierced again
{
  const sw = copy('Wave tail'); sw.species = 'hunter';
  for (const p of sw.parts) if (p.joint && p.joint.type === 'motor') p.joint.controls = [{ sensor: 'feeding', min: 0.5, max: 1, stop: true }];
  sw.parts.push({ type: 'segment', at: [sw.body.radius, 0], angle: 0, length: 20, radius: 0.6, joint: { type: 'feed' } });
  const w = makeWorld(1, { gravity: false, metab: true, grow: true });
  const S = addCell(w, sw, 800, 1000, 0), B = addCell(w, { species: 'prey', body: { radius: 10 }, parts: [] }, 800 + S.reach + 12, 972, 0);
  S.metab.C = S.metab.E = 1e7;
  let before = null, latched = 0, stopped = 0, feeding = 0, latches = 0, was = false;
  for (let i = 0; i < 120000 && w.cells.includes(B); i++) {
    stepWorld(w);
    const on = !!S.feeders[0].link;
    if (on && !was) latches++;
    if (!on && before === null && i === 100) before = { feeding: feedingLevel(S), tail: S.joints.some((j) => j.on) };
    if (on && was) { latched++; if (!S.joints.some((j) => j.on)) stopped++; if (feedingLevel(S) === 1) feeding++; }
    was = on;
  }
  check('the feeding reading is 1 only while latched; a tail wired "stops while feeding" stops; an emptied corpse is not pierced again',
    before && before.feeding === 0 && before.tail && latched > 1000 && feeding === latched && stopped > 0.99 * latched && B.dead && latches === 1,
    `before: feeding ${before && before.feeding}, tail ${before && before.tail ? 'running' : 'stopped'}; latched ${fmt(latched / 1000, 1)} s: feeding ` +
    `${fmt(100 * feeding / Math.max(latched, 1), 0)}% of it, tail stopped ${fmt(100 * stopped / Math.max(latched, 1), 0)}%; the prey ${B.dead ? B.diedWhy : 'alive'}; ${latches} latch(es)`);
}

// 28y. Stealing plastids (author, 2026-11-02): a prey drained to death gives up its plastids; the predator keeps those
// that fit in its free room (soft: squeezed into a gap down to 60% of their radius, keeping their volume); they fade by half a day; at division they are shared out;
// from a living prey one goes through the tube every PARAMS.steal.every s latched, and the prey rebuilds it later
{
  const hunter = (hold) => {
    const sw = copy('Wave tail'); sw.species = 'hunter';
    for (const p of sw.parts) if (p.joint && p.joint.type === 'motor') p.joint.controls = [{ sensor: 'feeding', min: 0.5, max: 1, stop: true }];
    sw.parts.push({ type: 'segment', at: [sw.body.radius, 0], angle: 0, length: 20, radius: 0.6, joint: { type: 'feed' } });
    if (hold) sw.parts.push({ type: 'rule', id: 'divide', joint: { type: 'divide', controls: [{ sensor: 'energy', min: 2, max: 3 }] } });   // never
    return sw;
  };
  const prey = { species: 'prey', body: { radius: 10 }, parts: [{ type: 'inclusion', material: 'plastid', at: [0, 5], radius: 3.5 }, { type: 'inclusion', material: 'plastid', at: [0, -5.5], radius: 3 }] };
  const hunt = (size) => {
    const w = makeWorld(1, { gravity: false, light: false, metab: true, grow: true });
    const S = addCell(w, hunter(true), 800, 1000, 0);
    if (size > 1) regrow(w, S, size);
    S.metab.C = S.metab.E = 1e7;
    addCell(w, prey, 800 + S.reach + 12, 972, 0);
    for (let i = 0; i < 200000 && !S.lastSteal; i++) stepWorld(w);
    return { w, S, got: S.lastSteal ? S.lastSteal.got : 0, lost: S.lastSteal ? S.lastSteal.lost : 0, n: S.pieces[0].inclusions.filter((x) => x.stolen).length };
  };
  const small = hunt(1), big = hunt(4);
  // soft: in the newborn's gaps one squeezes (smaller radius, its whole volume kept)
  const squeezed = small.S.stolen.some((s) => s.r < Math.cbrt(3 * s.v / (4 * Math.PI)) - 1e-6 && s.r >= PARAMS.steal.squeeze * Math.cbrt(3 * s.v / (4 * Math.PI)) - 1e-6);
  const f0 = big.S.stolen[0].fade;
  for (let i = 0; i < 30000; i++) stepWorld(big.w);
  const fade = big.S.stolen[0].fade / f0, want = 2 ** (-30 / PARAMS.steal.half);
  // division: without its rule the big one divides at once (twice: 4× -> 2× -> 1×); the two are shared out, one each
  big.S.design = hunter(false); regrow(big.w, big.S, big.S.size);
  big.S.metab.E = big.S.metab.C; big.S.metab.starving = false;   // fed (it starves in the dark)
  for (let i = 0; i < 2 * PARAMS.grow.every; i++) stepWorld(big.w);
  const each = big.w.cells.filter((c) => c.species === 'hunter').map((c) => (c.stolen || []).length);
  // a living prey (in light it lives on while drained): a plastid every 30 s latched
  const w3 = makeWorld(1, { gravity: false, light: true, metab: true, grow: true });
  const T = addCell(w3, hunter(true), 800, 1500, 0); regrow(w3, T, 4);
  const L = addCell(w3, { ...prey, parts: [...prey.parts, { type: 'rule', id: 'divide', joint: { type: 'divide', controls: [{ sensor: 'energy', min: 2, max: 3 }] } }] }, 800 + T.reach + 12, 1472, 0);
  for (let i = 0; i < (PARAMS.steal.every + 5) * 1000; i++) stepWorld(w3);
  const live = { thief: (T.stolen || []).length, lost: (L.lost || []).length, alive: !L.dead };
  // rebuilt from its growth meter, away from the thief
  w3.links = []; T.feeders[0].link = null; T.q[1] = 200;
  L.grow.E = L.grow.Eneed; L.grow.N = L.grow.Nneed; L.metab.E = L.metab.C; L.metab.starving = false;   // fed again (a starving cell builds nothing)
  for (let i = 0; i < 2 * PARAMS.grow.every; i++) stepWorld(w3);
  check('stealing plastids: a kill gives up what fits (a big cell keeps more); stolen plastids fade by half a day; division shares them out; a living prey loses one per 30 s latched and rebuilds it',
    live.thief === 1 && live.lost === 1 && live.alive && (L.lost || []).length === 0 && L.rebuilt === 1 && small.n === 2 && squeezed && big.n === 2 && Math.abs(fade - want) < 1e-3 * want
      && each.length >= 2 && each.reduce((x, y) => x + y, 0) === 2 && each.every((k) => k <= 1),
    `newborn hunter: holds ${small.n} (${squeezed ? 'one squeezed' : 'none squeezed'}); at 4×: holds ${big.n}; after 30 s ${fmt(fade, 4)} of its output (should be ${fmt(want, 4)}); ` +
    `divided: ${each.join(' + ')} stolen plastids; from a living prey after 35 s: the thief has ${live.thief}, the prey lost ${live.lost} (${live.alive ? 'alive' : 'dead'}), then rebuilt ${L.rebuilt || 0}`);
}

// 28z. Chains (author, 2026-11-02): a cell with kin pads places its daughter pad to pad and they stay joined (front-back
// pads: a straight line; a middle cell's daughter slots in); a chain holds at most PARAMS.pads.chainVolume (8 r 10
// cells); joined kin even out their energy; a pad's rule "holds while not drained" lets a victim go; a joined body is
// shielded (a passive chain sinks a little faster)
{
  const line = (extra = [], hold) => ({ species: 'line', body: { radius: 10 }, parts: [...[0, 180].map((a, i) => ({ type: 'pad', id: `p${i}`, at: [10 * Math.cos(a * Math.PI / 180), 10 * Math.sin(a * Math.PI / 180)], kind: 'kin', joint: { type: 'hold', ...(hold ? { controls: hold } : {}) } })), ...extra] });
  const was = PARAMS.grow.cap; PARAMS.grow.cap = 200;
  const w = makeWorld(1, { gravity: false, light: false, metab: true, grow: true });
  addCell(w, line(), 800, 1000, 0);
  for (let g = 0; g < 4; g++) { for (const k of w.cells) { regrow(w, k, 2); k.metab.E = k.metab.C; } for (let i = 0; i < 1500; i++) stepWorld(w); }
  PARAMS.grow.cap = was;
  let members = [];
  const longest = (() => {   // the biggest group of cells joined by pads (its cells in members)
    let best = 0; const seen = new Set();
    for (const c of w.cells) { if (seen.has(c)) continue; const todo = [c]; let n = 0; seen.add(c); const group = []; while (todo.length) { const x = todo.pop(); n++; group.push(x); for (const l of w.links) { const A = w.cells[l.a], B = w.cells[l.b], o = A === x ? B : B === x ? A : null; if (o && !seen.has(o)) { seen.add(o); todo.push(o); } } } if (n > best) { best = n; members = group; } }
    return best;
  })();
  const ys = members.map((c) => c.q[1]), xs = members.map((c) => c.q[0]).sort((a, b) => a - b);
  const straight = Math.max(...ys) - Math.min(...ys) < 2 && members.every((c) => Math.abs(Math.sin(c.q[2])) < 0.05);
  // sharing: one cell's pool emptied, its neighbours fill it
  const s = w.cells.find((c) => w.links.some((l) => w.cells[l.a] === c || w.cells[l.b] === c));
  s.metab.E = 0;
  for (let i = 0; i < 10000; i++) stepWorld(w);
  const shared = s.metab.E / s.metab.C;
  // a victim cut loose: a hunter latches on one of two joined cells whose pads hold while not drained
  const w2 = makeWorld(1, { gravity: false, light: false, metab: true, grow: true });
  const pair = line([], [{ sensor: 'drained', min: 0, max: 0.5 }]);
  addCell(w2, pair, 800, 1000, 0); regrow(w2, w2.cells[0], 2); w2.cells[0].metab.E = w2.cells[0].metab.C;
  for (let i = 0; i < 300; i++) stepWorld(w2);
  const joinedBefore = w2.links.length;
  const hunter = { species: 'hunter', body: { radius: 8 }, parts: [{ type: 'segment', at: [0, -8], angle: -90, length: 20, radius: 0.6, joint: { type: 'feed' } }] };
  const V = w2.cells[1], H = addCell(w2, hunter, V.q[0], V.q[1] + 10 + 8 + 20 + 1, 0);
  H.metab.C = H.metab.E = 1e7;
  for (let i = 0; i < 2000; i++) stepWorld(w2);
  const cut = joinedBefore === 1 && !w2.links.some((l) => !l.feed) && w2.links.some((l) => l.feed);
  // shielding: three joined cells sink faster than one, the same cells
  const sinkOf = (n) => {
    const w3 = makeWorld(1, { metab: false });
    const cs = [];
    for (let k = 0; k < n; k++) cs.push(addCell(w3, line(), 800 + 20.5 * k, 1000, 0));
    for (let k = 1; k < n; k++) { const L = { a: k - 1, b: k, padA: cs[k - 1].pads[0], padB: cs[k].pads[1], holds: PARAMS.pads.kinBreak }; cs[k - 1].pads[0].link = L; cs[k].pads[1].link = L; w3.links.push(L); }
    const y0 = cs[0].q[1]; for (let i = 0; i < 5000; i++) stepWorld(w3);
    return (y0 - cs[0].q[1]) / 5;
  };
  const one = sinkOf(1), three = sinkOf(3);
  check('chains: daughters join pad to pad in a straight line (middle ones slot in), at most 8 r 10 cells; joined kin share energy; a "holds while not drained" pad lets a victim go; a chain sinks a little faster',
    straight && longest === 8 && w.cells.length > 8 && shared > 0.2 && cut && three > 1.05 * one,
    `${w.cells.length} cells, the longest chain ${longest}, ${straight ? 'straight' : 'not straight'} (x ${fmt(xs[0] - 800, 0)} to ${fmt(xs[xs.length - 1] - 800, 0)} µm); ` +
    `an emptied pool refilled to ${fmt(100 * shared, 0)}% by its neighbours in 10 s; drained: ${cut ? 'cut loose' : 'still joined'}; sinking ${fmt(one)} alone, ${fmt(three)} µm/s three joined`);
}

// 28aa. Pads that sense and attract (author, 2026-11-02): a free kin pad gently pulls a free kin pad of its species within
// PARAMS.pads.attract, so drifting kin come together and join (strangers and mucus pads don't); the Neighbours reading
// counts the kin a cell is joined to (a chain of three: ends 1, middle 2); a pad reads free / joined to kin / a stranger
{
  const cellWith = (species, kind) => ({ species, body: { radius: 10 }, parts: [
    { type: 'pad', id: 'pf', at: [10, 0], kind, joint: { type: 'hold' } }, { type: 'pad', id: 'pb', at: [-10, 0], kind, joint: { type: 'hold' } },
    { type: 'segment', id: 'tail', at: [0, 10], angle: 90, length: 8, radius: 0.25, joint: { type: 'motor', rate: 30, swing: 0, controls: [{ sensor: 'pf', min: 0.25, max: 1 }, { sensor: 'neighbours', min: 0.375, max: 1, or: true }] } }] });
  const meet = (a, b, gap = 5) => {
    const w = makeWorld(1, { gravity: false, light: false });
    const A = addCell(w, a, 800, 1000, 0), B = addCell(w, b, 800 + 20 + gap, 1000, 0);
    for (let i = 0; i < 20000; i++) stepWorld(w);
    return { w, A, B, joined: w.links.length > 0, gap: Math.hypot(A.q[0] - B.q[0], A.q[1] - B.q[1]) - 20 };
  };
  const kin = meet(cellWith('k', 'kin'), cellWith('k', 'kin')), strangers = meet(cellWith('k', 'kin'), cellWith('s', 'kin')), mucus = meet(cellWith('m', 'mucus'), cellWith('m', 'mucus'));
  // a chain of three, joined by hand
  const w = makeWorld(1, { gravity: false, light: false });
  const cs = [0, 1, 2].map((k) => addCell(w, cellWith('k', 'kin'), 800 + 20.5 * k, 1000, 0));
  for (let k = 1; k < 3; k++) { const L = { a: k - 1, b: k, padA: cs[k - 1].pads[0], padB: cs[k].pads[1], holds: PARAMS.pads.kinBreak }; cs[k - 1].pads[0].link = L; cs[k].pads[1].link = L; w.links.push(L); }
  for (let i = 0; i < 5; i++) stepWorld(w);
  const n = cs.map((c) => c.neighbours), pads = cs.map((c) => padLevel(w, c, c.pads[0]));
  // the wired tail: runs while its front pad is joined OR it has 2+ neighbours (the middle: both; the last: neither)
  const runs = cs.map((c) => c.joints[0].on);
  check('pads sense and attract: kin drift together and join (strangers, mucus: no); Neighbours counts joined kin; a pad reads what it holds',
    kin.joined && kin.gap < 1 && !strangers.joined && strangers.gap > 4 && !mucus.joined && mucus.gap > 4
      && n.join() === '1,2,1' && pads.join() === '0.5,0.5,0' && runs.join() === 'true,true,false',
    `kin 5 µm apart: ${kin.joined ? 'joined' : 'apart'} (gap ${fmt(kin.gap)}); strangers: ${strangers.joined ? 'joined' : 'apart'} (${fmt(strangers.gap)}); mucus: ${mucus.joined ? 'joined' : 'apart'} (${fmt(mucus.gap)}); ` +
    `a chain of three: neighbours ${n.join(', ')}, front pads ${pads.join(', ')}; tails "front pad joined or 2+ neighbours": ${runs.map((r) => (r ? 'run' : 'stop')).join(', ')}`);
}

// 28ac. The alarm (author, 2026-11-02, swarm defence): kin near a cell being drained read how near (1 touching, 0 at
// PARAMS.alarm.range); far kin and strangers read nothing; it fades once the attack stops
{
  const sw = copy('Wave tail'); sw.species = 'hunter';
  for (const p of sw.parts) if (p.joint && p.joint.type === 'motor') p.joint.controls = [{ sensor: 'feeding', min: 0.5, max: 1, stop: true }];
  sw.parts.push({ type: 'segment', at: [sw.body.radius, 0], angle: 0, length: 20, radius: 0.6, joint: { type: 'feed', controls: [{ sensor: 'energy', min: 0.5, max: 1 }] } });
  const prey = (species) => ({ species, body: { radius: 10 }, parts: [] });
  const w = makeWorld(1, { gravity: false, light: false, metab: true, grow: true });
  const H = addCell(w, sw, 800, 1000, 0);
  H.metab.C = H.metab.E = 1e7;
  const V = addCell(w, prey('p'), 800 + H.reach + 12, 972, 0);
  const near = addCell(w, prey('p'), V.q[0], 972 - 40, 0), far = addCell(w, prey('p'), V.q[0] + 120, 972, 0), other = addCell(w, prey('q'), V.q[0], 972 + 40, 0);
  for (const c of [V, near, far, other]) { c.metab.C = c.metab.E = 1e7; }
  let latched = false, during = null;
  for (let i = 0; i < 20000 && !during; i++) { stepWorld(w); if (H.feeders[0].link) { latched = true; if (i % 100 === 0) during = { near: near.alarm, far: far.alarm || 0, other: other.alarm || 0, gap: Math.hypot(near.q[0] - V.q[0], near.q[1] - V.q[1]) - 20 }; } }
  H.metab.E = 0.4 * H.metab.C;   // its rule (energy above 50%) fails: it lets go
  for (let i = 0; i < 3000; i++) stepWorld(w);
  const after = near.alarm || 0, gap = during ? during.gap : 0;
  check('the alarm: kin near a drained cell read how near; far kin and strangers read nothing; it fades once the attack stops',
    latched && during && Math.abs(during.near - (1 - gap / PARAMS.alarm.range)) < 0.1 && during.far === 0 && during.other === 0 && after < 0.5 * during.near && !H.feeders[0].link,
    `kin ${fmt(gap, 0)} µm away: ${during ? fmt(during.near) : '-'}; kin 100 µm away: ${during ? fmt(during.far) : '-'}; a stranger close by: ${during ? fmt(during.other) : '-'}; 3 s after the hunter let go: ${fmt(after)}`);
}

// 28ad. Kamikaze (author, 2026-11-02): a toxin sac whose rule says "bursts when it is being drained" kills its cell and
// poisons other species close by (energy lost, plastids damaged, by sac size and nearness); kin and far cells are spared;
// the sac needs extra nitrogen at each doubling
{
  const sw = copy('Wave tail'); sw.species = 'hunter';
  for (const p of sw.parts) if (p.joint && p.joint.type === 'motor') p.joint.controls = [{ sensor: 'feeding', min: 0.5, max: 1, stop: true }];
  sw.parts.push({ type: 'segment', at: [sw.body.radius, 0], angle: 0, length: 20, radius: 0.6, joint: { type: 'feed' } }, { type: 'inclusion', material: 'plastid', at: [0, 0], radius: 3 });
  const sac = { type: 'inclusion', id: 'sac', material: 'toxin', at: [0, 4], radius: 4, joint: { type: 'lyse', controls: [{ sensor: 'drained', min: 0.5, max: 1 }] } };
  const prey = (species, withSac) => ({ species, body: { radius: 10 }, parts: withSac ? [sac] : [{ type: 'inclusion', material: 'plastid', at: [0, 0], radius: 3 }] });
  const w = makeWorld(1, { gravity: false, light: false, metab: true, grow: true });
  const H = addCell(w, sw, 800, 1000, 0);
  H.metab.C = H.metab.E = 5e6;
  const V = addCell(w, prey('p', true), 800 + H.reach + 12, 972, 0), kin = addCell(w, prey('p', false), V.q[0], 972 - 35, 0), far = addCell(w, prey('q', false), V.q[0] + 80, 972, 0);
  for (const c of [kin, far]) c.metab.C = c.metab.E = 1e6;
  const E0 = H.metab.E;
  for (let i = 0; i < 20000 && !V.dead; i++) stepWorld(w);
  const lost = E0 - H.metab.E, health = 1 - H.pieces[0].inclusions.find((x) => x.material === 'plastid').damage;
  const plain = addCell(makeWorld(1, { metab: true, grow: true }), prey('p', false), 0, 0, 0), sacked = addCell(makeWorld(1, { metab: true, grow: true }), { ...prey('p', true), parts: [sac, { type: 'inclusion', material: 'plastid', at: [0, -5], radius: 3 }] }, 0, 0, 0);
  check('kamikaze: drained, a toxin sac bursts its cell and poisons the attacker (energy, plastids); kin and far cells are spared; the sac costs nitrogen',
    V.dead && /burst/.test(V.diedWhy) && lost > 1e5 && health < 0.9 && !kin.poisoned && !far.poisoned && sacked.grow.Nneed > plain.grow.Nneed,
    `the prey ${V.dead ? V.diedWhy : 'alive'}; the hunter lost ${fmt(lost / 1000, 0)}k pJ, plastids ${fmt(100 * health, 0)}% healthy; kin 35 µm away ${kin.poisoned ? 'poisoned' : 'spared'}, a stranger 80 µm away ${far.poisoned ? 'poisoned' : 'spared'}; ` +
    `nitrogen for a doubling ${fmt(plain.grow.Nneed, 0)} -> ${fmt(sacked.grow.Nneed, 0)} with the sac`);
}

// 28ae. Engulfing (author, 2026-11-02): a mouth swallows another species' cell touching it whole if it is at most half
// as wide and fits in the predator's free room; the prey leaves the tank (out of its chain cleanly) and is digested over
// PARAMS.engulf.time, the predator keeping its share; too wide, a packed predator, or kin: no; a chain counts as one (it
// must fit across the predator: a pair of r 8 cells fits an r 20 predator, three don't)
{
  const pred = (packed) => ({ species: 'eater', body: { radius: 20 }, parts: [{ type: 'mouth', id: 'm', at: [20, 0], joint: { type: 'engulf' } },
    ...(packed ? [{ type: 'inclusion', material: 'starch', at: [0, 0], radius: 19.3, fill: 1 }] : [])] });
  const prey = (species, r, pads) => ({ species, body: { radius: r }, parts: pads ? [{ type: 'pad', id: 'pf', at: [r, 0], kind: 'kin', joint: { type: 'hold' } }, { type: 'pad', id: 'pb', at: [-r, 0], kind: 'kin', joint: { type: 'hold' } }] : [] });
  const meet = (p, q, opts = {}) => {
    const w = makeWorld(1, { gravity: false, light: false, metab: true, grow: true });
    const A = addCell(w, p, 800, 1000, 0);
    A.metab.C = 1e7; A.metab.E = 0.5e7;
    const B = addCell(w, q, 800 + 20 + q.body.radius + 1, 1000, 0);
    B.metab.C = B.metab.E = 1e6;
    const mates = [];
    for (let k = 1; k < (opts.chain || 1); k++) {   // kin joined behind it in a line
      const prev = k === 1 ? B : mates[k - 2], m = addCell(w, q, B.q[0] + k * (2 * q.body.radius + 0.5), 1000, 0);
      const L = { a: w.cells.indexOf(prev), b: w.cells.indexOf(m), padA: prev.pads[0], padB: m.pads[1], holds: PARAMS.pads.kinBreak }; prev.pads[0].link = L; m.pads[1].link = L; w.links.push(L);
      mates.push(m);
    }
    const E0 = A.metab.E;
    for (let i = 0; i < 300; i++) stepWorld(w);
    const swallowed = !w.cells.includes(B), digesting = !!A.meal;
    for (let i = 0; i < (PARAMS.engulf.time + 1) * 1000; i++) stepWorld(w);
    return { w, A, swallowed, digesting, gained: A.metab.E - E0, done: !A.meal, links: w.links.length, left: w.cells.length - 1, n: A.lastSwallow ? A.lastSwallow.n : 0 };
  };
  const control = meet(pred(false), prey('p', 8)), idle = (() => { const w = makeWorld(1, { gravity: false, light: false, metab: true, grow: true }); const A = addCell(w, pred(false), 800, 1000, 0); A.metab.C = 1e7; A.metab.E = 0.5e7; const E0 = A.metab.E; for (let i = 0; i < (PARAMS.engulf.time + 1) * 1000 + 300; i++) stepWorld(w); return A.metab.E - E0; })();
  const small = control, wide = meet(pred(false), prey('p', 12)), full = meet(pred(false), prey('p', 8)), packed = meet(pred(true), prey('p', 9.5)), roomy = meet(pred(false), prey('p', 9.5)), kin = meet(pred(false), { ...prey('eater', 8) });
  const pair = meet(pred(false), prey('p', 8, true), { chain: 2 }), three = meet(pred(false), prey('p', 8, true), { chain: 3 });
  // spines count (2026-11-05): an r 5 prey (gape 10 fits it) with one 14 µm spine still goes in; with three pointing
  // three ways it is 12 across at its narrowest: spared
  const spine = (deg, r) => ({ type: 'segment', at: [r * Math.cos(deg * Math.PI / 180), r * Math.sin(deg * Math.PI / 180)], angle: deg, length: 14, radius: 0.5, material: 'protein' });
  const oneSpine = meet(pred(false), { species: 'p', body: { radius: 5 }, parts: [spine(0, 5)] });
  const threeSpines = meet(pred(false), { species: 'p', body: { radius: 5 }, parts: [spine(0, 5), spine(90, 5), spine(270, 5)] });
  const want = PARAMS.engulf.keep * 1e6;   // the prey's pool (no stores)
  check('engulfing: a small enough prey touching the mouth is swallowed and digested (its share kept); too wide, a packed predator, or kin: no; a chain counts as one (a pair fits, three do not); spines spread three ways make a small prey too wide, one spine does not',
    small.swallowed && small.digesting && small.done && Math.abs(small.gained - idle - want) < 0.3 * want && !wide.swallowed && !packed.swallowed && roomy.swallowed && !kin.swallowed
      && pair.swallowed && pair.n === 2 && pair.left === 0 && pair.links === 0 && !three.swallowed && three.left === 3 && oneSpine.swallowed && !threeSpines.swallowed,
    `r 8 prey: ${small.swallowed ? 'swallowed' : 'not'}, kept ${fmt((small.gained - idle) / 1000, 0)}k pJ over ${PARAMS.engulf.time} s (expected ~${fmt(want / 1000, 0)}k); r 12: ${wide.swallowed ? 'swallowed' : 'too wide'}; ` +
    `r 9.5 prey: an empty predator ${roomy.swallowed ? 'swallows it' : 'no'}, a packed one ${packed.swallowed ? 'swallows it' : 'has no room'}; kin: ${kin.swallowed ? 'swallowed' : 'spared'}; a joined pair: ${pair.swallowed ? `swallowed together (${pair.n})` : 'not'}; a chain of three: ${three.swallowed ? 'swallowed' : 'safe'} (${three.left} left); r 5 prey with one spine: ${oneSpine.swallowed ? 'swallowed' : 'spared'}, with three: ${threeSpines.swallowed ? 'swallowed' : 'spared'}`);
}

// 28t. Death (step 1): a cell starving PARAMS.grow.die s in a row dies, sinks, is removed, and its nitrogen (its body's
// share and its meter's) goes back to the water
{
  const w = makeWorld(1, { light: false, metab: true, grow: true });
  const c = addCell(w, { body: { radius: 10 }, parts: [] }, 800, 1500, 90);
  c.grow.N = 2000;
  const nb = c.grow.Nbody;   // zeroed once it rots
  const sum = () => w.nitro.c.reduce((a, b) => a + b, 0) * w.nitro.held;
  let t = 0, starve = null, dead = null, lowest = Infinity;
  const ref = makeWorld(1, { light: false, metab: true, grow: true });   // the same water without the cell, mixing alike
  while (w.cells.length && t < 300) {
    stepWorld(w); stepWorld(ref); t += PARAMS.time.dt;
    if (starve === null && c.metab.starving) starve = t;
    if (dead === null && c.dead) { dead = t; lowest = c.q[1]; }
  }
  const back = sum() - ref.nitro.c.reduce((a, b) => a + b, 0) * ref.nitro.held;   // its meter's N was set by hand, not taken from this water
  check('a cell starving 60 s in a row dies, sinks, is removed, and gives its nitrogen back to the water (where it dies)',
    starve !== null && dead !== null && Math.abs(dead - starve - PARAMS.grow.die) < 0.5 && w.cells.length === 0 && w.deaths === 1
      && c.q[1] < lowest && Math.abs(back - (nb + 2000)) < 0.05 * (nb + 2000) && c.rotted,
    `starving at ${fmt(starve ?? 0, 1)} s, dead at ${fmt(dead ?? 0, 1)} s, removed by ${fmt(t, 1)} s, ${fmt(lowest - c.q[1], 0)} µm lower; ` +
    `water +${fmt(back, 0)} N (body ${fmt(nb, 0)} + meter 2000), released where it died`);
}

// 28r. Several sensors in one condition: ANY of them reading so is enough, ALL must; the first and the extra ones each
// tested on their own values
{
  const tail = (cond) => ({ type: 'segment', at: [-10, 0], angle: 180, length: 8, radius: 0.25, joint: { type: 'motor', rate: 30, swing: 35, controls: [cond] } });
  const run = (cond) => {
    const w = makeWorld(1, { gravity: false });
    const c = addCell(w, { body: { radius: 10 }, parts: [
      { type: 'inclusion', material: 'nucleus', at: [0, -5.35], radius: 4.3 },
      { type: 'sensor', id: 'up', at: [0, 10], angle: 90, kind: 'light' }, { type: 'sensor', id: 'down', at: [0, -10], angle: -90, kind: 'light' },
      tail(cond)] }, 300, 1990, 0);
    for (let i = 0; i < 50; i++) stepWorld(w);
    return { on: c.joints[0].on, up: c.sensors[0].value, down: c.sensors[1].value };
  };
  const probe = run({ sensor: 'energy', min: 0, max: 1 }), mid = (probe.up + probe.down) / 2;
  const cond = (all) => ({ sensor: 'up', min: mid, max: 1, also: [{ sensor: 'down', min: mid, max: 1 }], ...(all ? { all: true } : {}) });
  const any = run(cond(false)), every = run(cond(true)), both = run({ ...cond(true), also: [{ sensor: 'down', min: 0, max: mid }] });
  check('several sensors in one condition: ANY of them is enough, ALL need every one (each on its own values)',
    probe.up > probe.down && any.on && !every.on && both.on,
    `eyespot up ${fmt(probe.up)}, down ${fmt(probe.down)}; "above ${fmt(mid)}": any ${any.on ? 'runs' : 'stops'}, all ${every.on ? 'runs' : 'stops'}; all with down "below": ${both.on ? 'runs' : 'stops'}`);
}

// 28q. Resting: while the nucleus's REST rule holds, upkeep and plastid income run at PARAMS.metab.rest, flagella stop
{
  const day = (rest) => {
    const w = makeWorld(1, { metab: true, gravity: false });
    const parts = [{ type: 'inclusion', material: 'nucleus', at: [0, -5.35], radius: 4.3, joint: { type: 'rest', ...(rest ? { controls: [{ sensor: 'energy', min: 0, max: 1 }] } : {}) } },
      { type: 'inclusion', material: 'plastid', at: [0, 5], radius: 3 },
      ...PRESETS['Wave tail'].parts.map((p) => ({ ...p, at: p.parent ? p.at : [-10, 0] }))];
    const c = addCell(w, { body: { radius: 10 }, parts }, 800, 1500, 0);
    c.metab.C = c.metab.E = 1e12;
    const e0 = c.metab.E;
    for (let i = 0; i < 2000; i++) stepWorld(w);
    return { income: c.metab.income, spent: e0 - c.metab.E + c.metab.income * 2, tail: c.joints[0].on, resting: c.resting };
  };
  const awake = day(false), asleep = day(true), k = PARAMS.metab.rest;
  check('resting slows the metabolism: income and upkeep fall to the resting share, flagella stop',
    asleep.resting && !awake.resting && Math.abs(asleep.income / awake.income - k) < 0.01 && !asleep.tail && awake.tail && asleep.spent < awake.spent,
    `income awake ${fmt(awake.income, 0)}, resting ${fmt(asleep.income, 0)} pJ/s (share ${fmt(asleep.income / awake.income)}); tail ${asleep.tail ? 'beats' : 'stopped'} while resting`);
}

// 28p. The nucleus is the brain box: a bigger one has more slots; each sensor, wired built-in reading and rule box
// takes one; a design that needs more slots than its nucleus has, or with two nuclei, does not build
{
  const nucleus = (r, at = [0, 0]) => ({ type: 'inclusion', material: 'nucleus', at, radius: r });
  const tail = (controls) => ({ type: 'segment', at: [-10, 0], angle: 180, length: 8, radius: 0.25,
    joint: { type: 'motor', rate: 30, swing: 35, controls } });
  const eye = { type: 'sensor', id: 'eye', at: [10, 0], kind: 'light' };
  const rule = [{ sensor: 'eye', min: 0.1, max: 1 }, { sensor: 'energy', min: 0.2, max: 1 }, { sensor: 'starch', min: 0.5, max: 1, stop: true }];
  const d = (r) => ({ body: { radius: 10 }, parts: [nucleus(r), eye, tail(rule)] });
  const use = brainUse(d(2));   // eyespot, energy, starch, one GO box, the STOP box
  const refuses = (x) => { try { build(x); return ''; } catch (e) { return e.message; } };
  const small = refuses(d(2)), big = refuses(d(4.5)), two = refuses({ body: { radius: 10 }, parts: [nucleus(2, [-4, 0]), nucleus(2, [4, 0])] });
  check('the nucleus is the brain box: slots grow with its size; too many modules for its slots, or two nuclei, do not build',
    slotsOf(2) < slotsOf(3) && slotsOf(3) < slotsOf(4.5) && use.total === 5 && use.boxes === 2 && small.startsWith('nucleus full') && big === '' &&
    two === 'a cell has one nucleus' && brainProblem({ body: { radius: 10 }, parts: [eye, tail(rule)] }) === '',
    `slots at r 2, 3, 4.5 µm: ${slotsOf(2)}, ${slotsOf(3)}, ${slotsOf(4.5)}. Eyespot + energy + starch, a GO box and a STOP box: ` +
    `${use.total} modules; r 2: "${small}"; r 4.5: builds; two nuclei: "${two}"`);
}

// 28af. Moving water (author, 2026-11-03; sim/flow.js): a drifting cell (no weight) moves with the water and turns with
// its curl; the loops never cross a wall (no flow into the floor, the surface or the sides); faster at night; a mouth costs
// upkeep; the same world twice is bit-identical
{
  const { flowState, flowAt } = await import('../sim/flow.js');
  const plain = { name: 'drifter', body: { radius: 10 }, parts: [] };
  const w = makeWorld(1, { gravity: false, flow: true });
  const c = addCell(w, plain, 800, 1000, 0);
  stepWorld(w);
  const f = flowAt(w.flowNow, 800, 1000, [0, 0, 0]), y0 = c.q[1];
  for (let i = 0; i < 5000; i++) stepWorld(w);
  const vy = (c.q[1] - y0) / 5;
  const w2 = makeWorld(1, { gravity: false, flow: true });
  const d = addCell(w2, plain, 400, 1000, 0);   // a loop's middle: the water only turns
  stepWorld(w2);
  const spin = flowAt(w2.flowNow, 400, 1000, [0, 0, 0])[2] / 2, a0 = d.q[2];
  for (let i = 0; i < 5000; i++) stepWorld(w2);
  const turn = (d.q[2] - a0) / 5;
  // walls: no water through them, at any blend of the loops
  let leak = 0;
  const night = makeWorld(1, { flow: true, day: true }), noon = makeWorld(1, { flow: true });
  night.steps = Math.round(0.75 * PARAMS.metab.day / PARAMS.time.dt);
  for (let k = 0; k < 8; k++) {
    night.steps += Math.round(PARAMS.flow.shift / 8 / PARAMS.time.dt);
    const fs = { ...flowState(night), stir: 0 };   // the loops (the stirred bottom lifts on purpose: 28ag)
    for (let x = 0; x <= PARAMS.tank.w; x += 100) leak = Math.max(leak, Math.abs(flowAt(fs, x, 0, [0, 0, 0])[1]), Math.abs(flowAt(fs, x, PARAMS.tank.h, [0, 0, 0])[1]));
    for (let y = 0; y <= PARAMS.tank.h; y += 100) leak = Math.max(leak, Math.abs(flowAt(fs, 0, y, [0, 0, 0])[0]), Math.abs(flowAt(fs, PARAMS.tank.w, y, [0, 0, 0])[0]));
  }
  const sNight = flowState(night).speed, sNoon = flowState(noon).speed;
  const mouth = (n) => { const x = build({ body: { radius: 10 }, parts: Array.from({ length: n }, (_, i) => ({ type: 'mouth', id: 'm' + i, at: [10 * Math.cos(i), 10 * Math.sin(i)], angle: i * 57.3 })) }); return x; };
  let up0 = null, up2 = null;
  try { const { initMetab } = await import('../sim/metab.js'); const a = mouth(0), b = mouth(2); initMetab(a); initMetab(b); up0 = a.metab.upkeep; up2 = b.metab.upkeep; } catch (e) { up2 = e.message; }
  const go = () => {
    const ww = makeWorld(3, { day: true, metab: true, flow: true });
    addCell(ww, phototroph(4, PRESETS['Wave tail'].parts), 700, 1500, 90);
    addCell(ww, phototroph(), 900, 1800, 0);
    for (let i = 0; i < 20000; i++) stepWorld(ww);
    return new Uint8Array(Float64Array.from(ww.cells.flatMap((x) => [...x.q])).buffer);
  };
  const A = go(), B = go();
  check('moving water carries a drifter at its speed and turns it with its curl, never crosses a wall, is faster at night; a mouth costs upkeep; deterministic',
    Math.abs(vy - f[1]) < 0.05 * Math.abs(f[1]) && Math.abs(turn - spin) < 0.05 * Math.abs(spin) && leak < 1e-6 &&
    Math.abs(sNight - PARAMS.flow.night) < 0.01 && Math.abs(sNoon - PARAMS.flow.day) < 0.01 && up2 - up0 === 2 * PARAMS.engulf.upkeep && A.every((x, i) => x === B[i]),
    `water ${fmt(f[1], 2)} µm/s up, the cell ${fmt(vy, 2)}; curl/2 ${spin.toExponential(2)}, the cell turns ${turn.toExponential(2)} rad/s; ` +
    `most through a wall ${leak.toExponential(1)} µm/s; night ${fmt(sNight, 1)}, noon ${fmt(sNoon, 1)} µm/s; two mouths +${up2 - up0} pJ/s`);
}

// 28ag. The stirred bottom (author, 2026-11-03: "sometimes the bottom doesn't stir, sometimes it does"): about
// PARAMS.flow.stir.chance of the stretches have a spell, the same ones for the same seed; during one a weightless cell
// near the floor rises with the water; in a calm stretch the floor's water is still
{
  const { stirNow, flowAt } = await import('../sim/flow.js');
  const S = PARAMS.flow.stir, per = Math.round(S.every / PARAMS.time.dt);
  const w = makeWorld(1, { flow: true });
  let spells = 0, calm = -1, spell = -1;
  for (let k = 0; k < 300; k++) {
    w.steps = k * per + per / 2;
    if (stirNow(w).stir > 0) { spells++; if (spell < 0) spell = k; } else if (calm < 0) calm = k;
  }
  const same = (() => { const a = makeWorld(1, { flow: true }), b = makeWorld(1, { flow: true }), c = makeWorld(2, { flow: true }); let eq = true, diff = false;
    for (let k = 0; k < 50; k++) { a.steps = b.steps = c.steps = k * per + per / 2; const x = stirNow(a).stir, y = stirNow(b).stir; if (x !== y) eq = false; if (x !== stirNow(c).stir) diff = true; } return eq && diff; })();
  const rise = (k) => {
    const ww = makeWorld(1, { gravity: false, flow: true, day: true });
    ww.steps = k * per + Math.round(per * 0.45);
    const c = addCell(ww, { name: 'drifter', body: { radius: 10 }, parts: [] }, 800, 30, 0), y0 = c.q[1];
    for (let i = 0; i < 2000; i++) stepWorld(ww);
    return (c.q[1] - y0) / 2;
  };
  const up = rise(spell), still = rise(calm);
  check('the bottom stirs now and then (seeded): a cell near the floor rises with it in a spell, not in a calm',
    Math.abs(spells / 300 - S.chance) < 0.08 && same && up > 3 && Math.abs(still) < 0.5,
    `${spells} of 300 stretches stir (chance ${S.chance}); a weightless cell 30 µm up rises ${fmt(up, 1)} µm/s in a spell, ${fmt(still, 2)} in a calm`);
}

// 28ah. The harpoon (author, 2026-11-03; PARAMS.harpoon): a spine set to fire is thrown straight out, blind. A body in
// its line, kin too, is stunned (its tail stops) and loses energy; the shooter pays and its spine is gone, grown back after
// the reload; a spine in the way catches the dart; nothing in line: a wasted shot
{
  const HP = PARAMS.harpoon;
  const shooter = (name) => ({ name, body: { radius: 10 }, parts: [
    { type: 'segment', id: 'h', at: [10, 0], angle: 0, length: 20, radius: 0.5, material: 'protein',
      joint: { type: 'fire', controls: [{ sensor: 'energy', min: 0, max: 1 }] } }] });
  const tailed = (name, spine) => ({ name, body: { radius: 10 }, parts: [
    ...PRESETS['Wave tail'].parts.filter((p) => p.type === 'segment').map((p) => (p.parent === 'body' ? { ...p, at: [-10, 0] } : p)),
    ...(spine ? [{ type: 'segment', id: 'sp', at: [10, 0], angle: 0, length: 30, radius: 0.5, material: 'protein' }] : []) ] });
  const shoot = (target, gap) => {
    const w = makeWorld(1, { gravity: false, metab: true });
    const A = addCell(w, shooter('Hunter'), 500, 1000, 0);
    const B = addCell(w, target, 500 + 30 + gap + 10, 1000, 180);   // its body's near edge `gap` µm past the spine's tip, its tail away
    const eA = A.metab.E, eB = B.metab.E;
    w.gravity = false;
    stepWorld(w); stepWorld(w);
    const tailOn = B.joints.some((j) => j.type === 'motor' && j.on), L1 = A.pieces[A.harpoons[0].piece].L;
    const shot = A.lastShot, paid = eA - A.metab.E, lost = eB - B.metab.E, stun = B.stunT || 0;
    for (let i = 0; i < Math.round((HP.reload - 1) / DT); i++) stepWorld(w);   // a second before it has grown back
    return { shot, paid, lost, stun, tailOn, L1, L2: A.pieces[A.harpoons[0].piece].L };
  };
  const hit = shoot(tailed('Prey'), 20), kin = shoot(tailed('Hunter'), 20), far = shoot(tailed('Prey'), HP.range + 10);
  const shielded = shoot(tailed('Prey', true), 20);
  check('a harpoon throws its spine straight out, blind: a body in line (kin too) is stunned and wounded; the spine grows back; a spine catches it; a miss wastes it',
    hit.shot && hit.shot.hit === 'Prey' && hit.stun > HP.stun - 0.1 && !hit.tailOn && hit.lost > 0 && hit.paid >= HP.cost * 20 - 1 && hit.L1 < 0.01 && Math.abs(hit.L2 - 20 * (1 - 1 / HP.reload)) < 0.05 &&
    kin.shot && kin.shot.hit === 'Hunter' && kin.shot.kin && !kin.tailOn &&
    far.shot && !far.shot.hit && !far.shot.caught &&
    shielded.shot && !shielded.shot.hit && shielded.shot.caught === 'a spine or flagellum' && shielded.stun === 0,
    `hit: tail ${hit.tailOn ? 'ON' : 'off'}, lost ${Math.round(hit.lost / 1000)}k pJ, shooter paid ${Math.round(hit.paid / 1000)}k (with upkeep), stunned ${fmt(hit.stun, 1)} s, spine ${fmt(hit.L1, 3)} µm then ${fmt(hit.L2, 1)} µm ${HP.reload - 1} s later; ` +
    `kin: ${kin.shot && kin.shot.kin ? 'wounded' : 'spared'}; out of range: ${far.shot && far.shot.hit ? 'hit' : 'missed'}; behind a spine: ${shielded.shot && shielded.shot.caught}`);
}

// 28ai. A feeler set to feel moving water (author, 2026-11-03): a cell swimming by reads, a still one doesn't (nor one
// beyond its range); the loops' turning reads at night, not in still water. And the harpoon's wound is a share of all the
// stricken cell's energy (author: "potent"), as bad for a big, fed cell
{
  const feeler = { name: 'Listener', body: { radius: 10 }, parts: [{ type: 'sensor', id: 'f', label: 'Feeler', at: [10, 0], kind: 'flow', range: 60, feels: 'anything' }] };
  const pass = (d, start) => {
    const w = makeWorld(1, { gravity: false });
    const A = addCell(w, feeler, 500, 1000, 0), B = addCell(w, d, 500 + 10 + start, 1000, 180);
    let max = 0; for (let i = 0; i < 4000; i++) { stepWorld(w); max = Math.max(max, A.sensors[0].value); }
    return max;
  };
  const swim = pass({ name: 'Swim', ...PRESETS['Wave tail'] }, 120), still = pass({ name: 'Still', body: { radius: 9 }, parts: [] }, 20);
  const far = (() => { const w = makeWorld(1, { gravity: false }); const A = addCell(w, feeler, 500, 1000, 0); addCell(w, { name: 'Swim', ...PRESETS['Wave tail'] }, 500, 1200, 90);
    let max = 0; for (let i = 0; i < 3000; i++) { stepWorld(w); max = Math.max(max, A.sensors[0].value); } return max; })();
  const night = (flow) => { const w = makeWorld(1, { gravity: false, day: true, flow }); w.steps = Math.round(0.75 * PARAMS.metab.day / DT);
    const A = addCell(w, feeler, 300, 1000, 0); for (let i = 0; i < 50; i++) stepWorld(w); return A.sensors[0].value; };
  const rough = night(true), calm = night(false);
  const { energyOf } = await import('../sim/metab.js');
  const w = makeWorld(1, { gravity: false, metab: true });
  const A = addCell(w, { name: 'Hunter', body: { radius: 10 }, parts: [{ type: 'segment', id: 'h', at: [10, 0], angle: 0, length: 20, radius: 0.5, material: 'protein',
    joint: { type: 'fire', controls: [{ sensor: 'energy', min: 0, max: 1 }] } }] }, 500, 1000, 0);
  const B = addCell(w, { name: 'Big', body: { radius: 25 }, parts: [] }, 500 + 30 + 20 + 25, 1000, 0);   // a big, fed cell
  B.metab.E = B.metab.C;
  const e0 = energyOf(B); stepWorld(w); stepWorld(w);
  const share = (e0 - energyOf(B)) / e0, want = (PARAMS.harpoon.venom + PARAMS.harpoon.wound * e0) / e0;
  const small = addCell(w, { name: 'Tiny', body: { radius: 4 }, parts: [] }, 500, 1000 - 30 - 20 - 4, 0);   // below the hunter
  A.harpoons[0].t = DT; A.q[2] = -Math.PI / 2; A.metab.E = A.metab.C;   // grown back at once, turned to face it, fed
  for (let i = 0; i < 3; i++) stepWorld(w);
  check('a moving-water feeler feels a swimmer passing, not a still cell nor one out of range; the loops at night; a harpoon takes a share of its energy',
    swim > 0.5 && still === 0 && far === 0 && rough > 0.05 && calm === 0 && want < 1 && !B.dead && Math.abs(share - want) < 0.02 && small.dead && /harpoon/.test(small.diedWhy),
    `a swimmer passing reads up to ${fmt(swim)}, a still cell ${fmt(still)}, a swimmer 200 µm away ${fmt(far)}; midnight water ${fmt(rough)} (still water ${fmt(calm)}); a harpoon took ${fmt(100 * share, 1)}% of a big cell's energy (${Math.round(e0 / 1000)}k), a tiny cell: ${small.diedWhy}`);
}

// 28aj. Toxins leaked into the water (author, 2026-11-03; sim/toxin.js): a sac of Kind Leak pays to release toxin while its
// rule holds (none: always); another species near it loses energy and plastid health and reads Poisoned; kin are
// immune; the cloud drifts with moving water and fades by half in PARAMS.toxin.leak.half s
{
  const T = PARAMS.toxin.leak;
  const { sample } = await import('../sim/toxin.js');
  const leaker = (name) => ({ name, body: { radius: 10 }, parts: [
    { type: 'inclusion', id: 'p', at: [4, 0], radius: 4, material: 'plastid' },
    { type: 'inclusion', id: 't', at: [-5, 0], radius: 4, material: 'toxin', joint: { type: 'leak' } }] });
  const plain = (name) => ({ name, body: { radius: 10 }, parts: [{ type: 'inclusion', id: 'p', at: [0, 0], radius: 5, material: 'plastid' }] });
  const w = makeWorld(1, { gravity: false, metab: true });
  const L = addCell(w, leaker('Toxica'), 800, 1000, 0), V = addCell(w, plain('Victim'), 840, 1000, 0), K = addCell(w, plain('Toxica'), 760, 1000, 0);
  for (let i = 0; i < 20000; i++) stepWorld(w);
  const spent = L.metab.leak, loss = V.poison ? V.poison.loss : 0, dmg = V.pieces[0].inclusions[0].damage || 0;
  const { poisonedLevel } = await import('../sim/sense.js');
  const reads = poisonedLevel(V), kin = !!K.poison;
  // fading: with the leaker gone, the cloud halves in T.half s
  const f = w.toxins.get('Toxica'), tot0 = f.reduce((a, b) => a + b, 0);
  w.cells = [V, K]; w.links = [];
  for (let i = 0; i < Math.round(T.half / PARAMS.time.dt); i++) stepWorld(w);
  const tot1 = (w.toxins.get('Toxica') || []).reduce((a, b) => a + b, 0);
  // drifting: in moving water the cloud's middle moves
  const m = makeWorld(1, { gravity: false, metab: true, flow: true, day: true });
  m.steps = Math.round(0.75 * PARAMS.metab.day / DT);
  const L2 = addCell(m, leaker('Toxica'), 400, 1000, 0);
  for (let i = 0; i < 300; i++) stepWorld(m);
  L2.pieces[0].inclusions.forEach((x) => { x.leak = false; });   // stop leaking: watch the cloud move
  const mid = (g) => { let sx = 0, sy = 0, s = 0; for (let j = 0; j < 50; j++) for (let k = 0; k < 40; k++) { const c = g[j * 40 + k]; sx += c * (k + 0.5) * T.cell; sy += c * (j + 0.5) * T.cell; s += c; } return [sx / s, sy / s]; };
  const a = mid(m.toxins.get('Toxica'));
  for (let i = 0; i < 20000; i++) stepWorld(m);
  const b = mid(m.toxins.get('Toxica')), moved = Math.hypot(b[0] - a[0], b[1] - a[1]);
  check('a leaking toxin sac pays, harms another species near it (Poisoned), spares kin; its cloud fades by half in its half-life and drifts with the water',
    spent > 500 && loss > 500 && dmg > 0.02 && reads > 0.1 && !kin && Math.abs(tot1 / tot0 - 0.5) < 0.05 && moved > 20,
    `the leaker spends ${fmt(spent, 0)} pJ/s; a stranger 30 µm away loses ${fmt(loss, 0)} pJ/s, plastids ${fmt(100 * dmg, 0)}% damaged, reads Poisoned ${fmt(reads)}; kin poisoned: ${kin}; ` +
    `after ${T.half} s ${fmt(100 * tot1 / tot0, 0)}% left; in moving water its middle moved ${fmt(moved, 0)} µm in 20 s`);
}

// 28ak. Plates soften harpoons (author, 2026-11-04): the wound ÷ (1 + 2 × thickness), the stun stays; bigger cells may
// carry thicker plates (up to a tenth of their radius, never less than 2 µm)
{
  const { energyOf } = await import('../sim/metab.js');
  const wound = (wall) => {
    const w = makeWorld(1, { gravity: false, metab: true });
    addCell(w, { name: 'Hunter', body: { radius: 10 }, parts: [{ type: 'segment', id: 'h', at: [10, 0], angle: 0, length: 20, radius: 0.5, material: 'protein',
      joint: { type: 'fire', controls: [{ sensor: 'energy', min: 0, max: 1 }] } }] }, 500, 1000, 0);
    const B = addCell(w, { name: 'Big', body: { radius: 25, ...wall }, parts: [] }, 500 + 30 + 20 + 25, 1000, 0);
    B.metab.E = B.metab.C;
    const e0 = energyOf(B); stepWorld(w); stepWorld(w);
    return { lost: e0 - energyOf(B), want: PARAMS.harpoon.venom + PARAMS.harpoon.wound * e0, stun: B.stunT || 0, t: B.pieces[0].plates };
  };
  const bare = wound({}), plated = wound({ wall: 'plates', plates: 2.5 });
  const thick = (r, t) => build({ body: { radius: r, wall: 'plates', plates: t }, parts: [] }).pieces[0].plates;
  const k = 1 + PARAMS.plates.harpoon * plated.t;
  check('plates soften the wound of a harpoon (÷ 1 + 2 × thickness) but not its stun; big cells may carry thicker plates',
    Math.abs(bare.lost / bare.want - 1) < 0.02 && Math.abs(plated.lost / (plated.want / k) - 1) < 0.02 && plated.stun > PARAMS.harpoon.stun - 0.1 &&
    thick(10, 5) === 2 && thick(25, 5) === 2.5 && thick(50, 8) === 5,
    `bare r 25 lost ${Math.round(bare.lost / 1000)}k pJ; with ${plated.t} µm plates ${Math.round(plated.lost / 1000)}k (÷${fmt(bare.lost / plated.lost, 1)}, want ÷${fmt(k, 1)}), stunned ${fmt(plated.stun, 1)} s; ` +
    `thickest allowed: r 10 ${thick(10, 5)} µm, r 25 ${thick(25, 5)}, r 50 ${thick(50, 8)}`);
}

// 28al. The tether (author, 2026-11-04): a spine of Kind Tether fires blind like a harpoon but ties what it hits on a
// line (no wound); its rules reel the line in or let it out, and let go; the line snaps under a sustained pull; the Tied
// reading is 1 while it holds something
{
  const { tiedLevel } = await import('../sim/sense.js');
  const all = [{ sensor: 'energy', min: 0, max: 1 }];
  const roper = (reel, release) => ({ name: 'Roper', body: { radius: 10 }, parts: [
    { type: 'inclusion', id: 'nuc', material: 'nucleus', at: [-4, 0], radius: 4.3, joint: { type: 'rest' } },
    { type: 'segment', id: 't', at: [10, 0], angle: 0, length: 20, radius: 0.5, material: 'protein', joint: { type: 'tether', controls: all } },
    { type: 'rule', id: 't-reel', of: 't', joint: { type: 'reel', controls: reel } },
    { type: 'rule', id: 't-go', of: 't', joint: { type: 'release', controls: release } }] });
  const run = (reel, release, secs, prey = { name: 'Prey', body: { radius: 10 }, parts: [] }, preyAngle = 0) => {
    const w = makeWorld(1, { gravity: false, metab: true });
    const A = addCell(w, roper(reel, release), 500, 1000, 0), B = addCell(w, prey, 560, 1000, preyAngle);
    const e0 = B.metab.E; let tied = 0, read = 0;
    for (let i = 0; i < secs / DT; i++) { stepWorld(w); if (A.tethers[0].link) { tied++; read = Math.max(read, tiedLevel(A)); } }
    const t = A.tethers[0];
    return { gap: B.q[0] - A.q[0], tied: !!t.link, len: t.link ? t.link.len : null, last: A.lastTie, lost: e0 - B.metab.E, stun: B.stunT || 0, read, t: t.t };
  };
  const hold = run([], [], 3), reelIn = run(all, [], 4), out = run([{ ...all[0], stop: true }], [], 3), free = run(all, all, 1);
  const towed = run([], [], 6, { name: 'Swim', ...PRESETS['Wave tail'] }, 0);   // steady swimming (a few pN) tows the roper along
  const hold0 = PARAMS.tether.hold; PARAMS.tether.hold = 2;   // a line weaker than that pull snaps
  const away = run([], [], 6, { name: 'Swim', ...PRESETS['Wave tail'] }, 0);
  PARAMS.tether.hold = hold0;
  check('a tether ties what its dart hits (no wound), reels in, lets out, lets go and winds back; a strong pull snaps it',
    hold.tied && Math.abs(hold.gap - 60) < 1 && Math.abs(hold.len - 20.5) < 0.6 && hold.stun === 0 && hold.read === 1 &&
    reelIn.tied && reelIn.len === 0 && reelIn.gap < 41 &&
    out.tied && out.len > 45 &&
    !free.tied && free.last.why === 'let go' && free.t > PARAMS.tether.reload - 1.5 &&
    towed.tied && !away.tied && away.last && away.last.why === 'snapped',
    `held: line ${fmt(hold.len, 1)} µm, centres ${fmt(hold.gap, 1)} µm apart, prey stunned ${fmt(hold.stun, 1)} s, Tied read ${hold.read}; reeled in: line ${fmt(reelIn.len, 1)} µm, centres ${fmt(reelIn.gap, 1)} µm; ` +
    `let out: line ${out.len && fmt(out.len, 1)} µm; let go: ${free.last && free.last.why}, winding back ${fmt(free.t, 1)} s; a swimmer pulling away: ${towed.tied ? 'towed it along' : 'broke free'}, on a 2 pN line ${away.last ? away.last.why : 'still tied'}`);
}

// 28am. A nitroplast turns surplus energy into nitrogen (PARAMS.fix): only above the stores' line, never past the bar
{
  const design = (nf) => ({ body: { radius: 10 }, parts: nf ? [{ type: 'inclusion', material: 'nitroplast', at: [0, 0], radius: 5 }] : [] });
  const run = (nf, pool, secs = 10) => {
    const w = makeWorld(1, { light: false, metab: true, grow: true }), c = addCell(w, design(nf), 500, 1000, 0);
    let spent = 0;
    for (let i = 0; i < secs / PARAMS.time.dt; i++) { c.metab.E = pool * c.metab.C; stepWorld(w); spent += (c.metab.fixing || 0) * PARAMS.time.dt * PARAMS.fix.cost; }
    return { N: c.grow.N, Nneed: c.grow.Nneed, spent, c };
  };
  const v = 4 / 3 * Math.PI * 125, want = PARAMS.fix.rate * v * 10;
  const plain = run(false, 1), fixer = run(true, 1), poor = run(true, 0.5);
  const full = (() => { const w = makeWorld(1, { light: false, metab: true, grow: true }), c = addCell(w, design(true), 500, 1000, 0); c.grow.N = c.grow.Nneed; c.metab.E = c.metab.C; stepWorld(w); return c.metab.fixing; })();
  const fixed = fixer.N - plain.N;
  check('a nitroplast turns surplus energy into nitrogen: its rate by its volume, its price a unit, nothing below the stores line or with the bar full',
    Math.abs(fixed - want) < 0.03 * want && Math.abs(fixer.spent - fixed * PARAMS.fix.cost) < 0.03 * fixer.spent && Math.abs(poor.N - plain.N) < 0.01 * want && full === 0,
    `r 5 nitroplast in 10 s: +${fmt(fixed, 1)} N (expected ${fmt(want, 1)}), ${fmt(fixer.spent / 1000, 1)}k pJ spent; pool at 50%: +${fmt(poor.N - plain.N, 2)} N; bar full: ${full} N/s`);
}

// 28an. Self-shading (2026-11-07, sim/shade.js): plastids darken the water below them, in their column only; a cell alone
// (or above the crowd, or beside it) gets the clear water's light, never shaded by its own plastids
{
  const probe = (n, x2) => {
    const w = makeWorld(1, { gravity: false, metab: true, grow: true });
    const c = addCell(w, phototroph(), 820, 800, 90);
    for (let k = 0; k < n; k++) addCell(w, phototroph(), x2, 1200 + 35 * k, 90);
    stepWorld(w);
    return lightAt(w, c.q[1], c.q[0], c) / lightAt(w, c.q[1]);
  };
  const alone = probe(0, 820), under = probe(20, 820), beside = probe(20, 1300);
  const want = Math.exp(-20 * PARAMS.shading.k * (4 / 3 * Math.PI * 27) / PARAMS.shading.cell);
  check('self-shading: 20 plastids above a cell darken its water as their volume says; alone or beside the crowd, clear water',
    Math.abs(alone - 1) < 1e-9 && Math.abs(under - want) < 0.01 && Math.abs(beside - 1) < 1e-9,
    `alone ${fmt(alone, 3)}, under 20 cells ${fmt(under, 3)} (expected ${fmt(want, 3)}), 480 µm beside them ${fmt(beside, 3)}`);
}

// 29. Determinism with day, metabolism and stores
{
  const go = () => {
    const w = makeWorld(5, { day: true, metab: true });
    addCell(w, phototroph(4, PRESETS['Wave tail'].parts), 700, 1500, 90);
    addCell(w, phototroph(), 900, 1800, 0);
    for (let i = 0; i < 20000; i++) stepWorld(w);
    return new Uint8Array(Float64Array.from(w.cells.flatMap((c) => [...c.q, c.metab.E, ...c.pieces[0].inclusions.map((x) => x.fill)])).buffer);
  };
  const a = go(), b = go();
  check('a world with day, metabolism and stores runs bit-identical twice', a.every((x, i) => x === b[i]), `${a.length / 8} numbers compared after 20 s`);
}

// 30. Speed (not a pass test yet)
{
  for (const name of ['Spiny cell', 'Wave tail']) {
    const w = makeWorld(1); addCell(w, PRESETS[name], 300, 1500, 0);
    const steps = 20000, t0 = performance.now();
    for (let i = 0; i < steps; i++) stepWorld(w);
    const ms = performance.now() - t0;
    console.log(`INFO  speed: ${name} (${w.cells[0].pieces.length} pieces, ${w.cells[0].n} unknowns): ` +
      `${fmt(ms / (steps * DT), 2)} ms per simulated second, ${fmt(ms / (steps * DT) * 60, 0)} ms per simulated minute`);
  }
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures);
