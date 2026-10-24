// Physics-law checks for the sandbox, headless. Run: node tools/check.mjs
// Each check prints what it measured and PASS/FAIL; the exit code is the number of failures.
import { PARAMS } from '../sim/params.js';
import { makeWorld, addCell, stepWorld, worldTime } from '../sim/world.js';
import { cellWeight } from '../sim/build.js';
import { PRESETS } from '../sim/presets.js';
import { MATERIALS } from '../sim/materials.js';
import { fire } from '../sim/physics.js';
import { clock, daylight } from '../sim/light.js';
import { PART_TEMPLATES, mirrorGroup } from '../sandbox/parts.js';

const DT = PARAMS.time.dt;
// A cocked spring (a latched springy joint), for the no-coasting and one-flick laws; not a part in the Build panel
const SPRING = { body: { radius: 6 }, parts: [{ type: 'segment', at: [-6, 0], angle: 180, length: 30, radius: 0.4,
  joint: { type: 'hinge', stiffness: 2000, rest: 150, latched: true } }] };
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

// 2. Density excess: a glass wall sinks faster, an oil droplet slows it, a big light sap vacuole floats
{
  const plain = sinking(run(sphere(20), 1));
  const glass = sinking(run(sphere(20, 'glass'), 1));
  const oil = sinking(run({ body: { radius: 20 }, parts: [{ type: 'inclusion', at: [0, 0], radius: 10, material: 'oil' }] }, 1));
  const sap = sinking(run({ body: { radius: 20 }, parts: [{ type: 'inclusion', at: [0, 0], radius: 18, material: 'sap', density: 1005 }] }, 1));
  check('wall and inclusions change sinking through density', glass > plain && oil < plain && sap < 0,
    `protein ${fmt(plain)}, glass wall ${fmt(glass)}, oil droplet ${fmt(oil)}, light sap vacuole ${fmt(sap)} µm/s (negative rises)`);
}

// 3. Spines slow sinking (drag), even glass ones that add weight, if long and thin enough
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
  const glass = sinking(run(spined('glass', 40), 1));
  const longGlass = sinking(run(spined('glass', 80), 1));
  check('spines slow sinking', prot < bare && glass < bare,
    `bare ${fmt(bare)}, 4 protein spines ${fmt(prot)}, 4 glass spines ${fmt(glass)}, 4 long glass spines ${fmt(longGlass)} µm/s`);
}

// 4. A long rod sinks faster end-on than broadside; tilted, it slides sideways as it sinks and does not turn
{
  const rod = { body: { radius: 4, length: 80, wall: 'glass' }, parts: [] };
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
  const r = run(sphere(10, 'glass'), 20, 300, 40);
  const v = Math.abs(r.cell.v[1]);
  check('cell rests on the floor', r.q1[1] > 9.5 && r.q1[1] < 10.5 && v < 1e-3,
    `centre ${fmt(r.q1[1], 3)} µm above the floor (radius 10), speed ${v.toExponential(1)} µm/s`);
}

// 7. Determinism: the same world twice, bit for bit
{
  const designs = [sphere(10), sphere(20, 'glass'),
    { body: { radius: 4, length: 80 }, parts: [{ type: 'segment', at: [40, 0], angle: 30, length: 50, radius: 1, material: 'glass' }] }];
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
    const d = copy('Ejectisome');
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

// 14. A sap vacuole pumped lighter than seawater turns a sinking cell into a rising one, slowly, at a cost
{
  const w = makeWorld(1);
  const c = addCell(w, copy('Sap vacuole'), 300, 1000, 0);
  for (let i = 0; i < 1000; i++) stepWorld(w);
  const sinkBefore = 1000 - c.q[1];
  const inc = c.pieces[0].inclusions[0];
  inc.target = 1005;
  let tFloat = null;
  for (let i = 0; i < 40000; i++) { const y = c.q[1]; stepWorld(w); if (tFloat === null && c.q[1] > y) tFloat = (i + 1) * DT; }
  const y0 = c.q[1];
  for (let i = 0; i < 1000; i++) stepWorld(w);
  const rise = c.q[1] - y0;
  check('pumping a sap vacuole light makes a sinking cell rise, after a delay, at an energy cost',
    sinkBefore > 0 && rise > 0 && tFloat > 1 && c.energy.pump > 0,
    `sinks ${fmt(sinkBefore)} µm/s at 1025; pumped to 1005 it starts rising after ${fmt(tFloat, 1)} s and rises ` +
    `${fmt(rise)} µm/s; pumping cost ${fmt(c.energy.pump / 1000, 1)} fJ`);
}

// 15. Cells don't pass through each other: one dropped on another settles touching it
{
  const w = makeWorld(1);
  const a = addCell(w, sphere(10), 300, 10, 0);
  const b = addCell(w, sphere(8, 'glass'), 300, 60, 0);
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
    addCell(w, copy('Sap vacuole'), 380, 1000, 0);
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
  check('a light sensor reads the light where it is by the way it faces; a wired motor runs only in range, resuming without a jump',
    Math.abs(up.value - expected) < 0.01 && deep.value < up.value * 0.15 && side.value < 1e-6 && down.value === 0 &&
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
  const stacked = tryBuild([{ type: 'inclusion', at: [1, 0], radius: 4, material: 'oil' }, { type: 'inclusion', at: [-1, 0], radius: 4, material: 'sap' }]);
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
  check('a narrow eyespot sees only near straight up; a wide one falls off gently',
    narrow[2] === 0 && wide[2] > 0.8 && narrow[0] > 0.98 && narrow[1] < wide[1],
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

// 26. A plastid earns by the light where it is: near the surface a cell lives through the night on its starch;
// deep down it can't earn its keep and starves
{
  const top = runDay(phototroph(), 1900, 720), deep = runDay(phototroph(), 500, 720);
  check('near the surface a plastid feeds the cell through day and night; deep down it starves',
    top.starved === 0 && deep.starved > 100,
    `100 µm down: starving ${fmt(top.starved, 0)} s of 720; 1.5 mm down: starving ${fmt(deep.starved, 0)} s`);
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
  const n = [chem(PARAMS.tank.h - 50), chem(PARAMS.tank.h / 2), chem(50)];
  check('a statolith reads which way is up; a nutrient sensor reads poor water above the nutricline, rich below',
    Math.abs(r[0] - 1) < 1e-6 && Math.abs(r[1] - 0.5) < 1e-6 && Math.abs(r[2]) < 1e-6 && Math.abs(r[3]) < 1e-6 && r[4] === 0.5
      && n[0] < 0.01 && Math.abs(n[1] - 0.5) < 0.02 && n[2] > 0.99,
    `statolith facing the front: front up ${fmt(r[0])}, level ${fmt(r[1])}, down ${fmt(r[2])}; facing back, front up ` +
    `${fmt(r[3])}; no gravity ${fmt(r[4])}. Nutrients near the surface ${fmt(n[0])}, mid-tank ${fmt(n[1])}, near the floor ${fmt(n[2])}`);
}

// 28g. A timer reset by an eyespot at dawn is a clock: it reads the share of the day since sunrise
{
  const w = makeWorld(1, { gravity: false, day: true });
  const c = addCell(w, { body: { radius: 10 }, parts: [
    { type: 'sensor', id: 'eye', kind: 'light', at: [0, 10], angle: 90 },
    { type: 'sensor', id: 'clock', kind: 'timer', at: [0, 0], span: PARAMS.metab.day,
      trigger: [{ sensor: 'eye', min: 0.05, max: 1 }] }] }, 800, 1800, 0);
  const clockAt = (s) => { while (worldTime(w) < s - 1e-9) stepWorld(w); return c.sensors[1].value; };
  const day = PARAMS.metab.day, firstDawn = (1 - PARAMS.metab.dawn) * day;   // the world starts just after a sunrise
  const a = clockAt(day * 0.25), b = clockAt(firstDawn - 5), d = clockAt(firstDawn + 0.25 * day);
  const started = c.sensors[1].start;
  check('a timer reset by an eyespot at dawn works as a clock (and restarts each dawn)',
    Math.abs(a - 0.25) < 0.01 && b > 0.85 && Math.abs(d - 0.25) < 0.03 && started > firstDawn - 5,
    `a quarter day in: ${fmt(a)}; just before the next dawn: ${fmt(b)}; a quarter day after it: ${fmt(d)} ` +
    `(restarted at ${fmt(started, 0)} s, sunrise at ${fmt(firstDawn, 0)} s; the eyespot sees light a little after it)`);
}

// 28h. Gas vesicles lift a cell, and below their depth are crushed for good; stronger ones survive deeper but lift less
{
  const cellWith = (strength) => ({ body: { radius: 10 }, parts: [
    { type: 'inclusion', id: 'g', material: 'gas', at: [0, 0], radius: 6, strength }] });
  const go = (strength, depth, secs = 5) => {
    const w = makeWorld(1);
    const c = addCell(w, cellWith(strength), 800, PARAMS.tank.h - depth, 0);
    const y0 = c.q[1];
    for (let i = 0; i < secs / DT; i++) stepWorld(w);
    return { v: (c.q[1] - y0) / secs, crushed: c.pieces[0].inclusions[0].crushed };
  };
  const weakUp = go(0, 200), weakDeep = go(0, 1300), strongDeep = go(1, 1300), bare = run({ body: { radius: 10 } }, 5);
  const bareV = -sinking(bare);
  check('gas vesicles float a cell; below their depth they are crushed for good, and strong ones survive deeper but lift less',
    weakUp.v > 0 && !weakUp.crushed && weakDeep.crushed && Math.abs(weakDeep.v - bareV) < 0.05 * Math.abs(bareV)
      && !strongDeep.crushed && strongDeep.v > 0 && strongDeep.v < weakUp.v,
    `weak vesicles 200 µm down: rise ${fmt(weakUp.v, 1)} µm/s; 1300 µm down: crushed, ${fmt(weakDeep.v, 1)} µm/s ` +
    `(a bare cell ${fmt(bareV, 1)}); strong ones 1300 µm down: intact, rise ${fmt(strongDeep.v, 1)} µm/s`);
}

// 28i. Gas vesicles wear out; a fed cell rebuilds them, a starving one slowly loses its float
{
  const float = (plastid) => ({ body: { radius: 10 }, parts: [
    { type: 'inclusion', id: 'g', material: 'gas', at: [-4, 0], radius: 4, strength: 1 },
    ...(plastid ? [{ type: 'inclusion', id: 'p', material: 'plastid', at: [4, 0], radius: 4 }] : [])] });
  const left = (plastid, light) => {
    const w = makeWorld(1, { gravity: false, metab: true, light });
    const c = addCell(w, float(plastid), 800, PARAMS.tank.h - 50, 0);
    for (let i = 0; i < PARAMS.metab.day / DT; i++) stepWorld(w);
    return c.pieces[0].inclusions[0].fill;
  };
  const fed = left(true, true), starving = left(false, false);
  check('gas vesicles wear out: a fed cell keeps rebuilding them, a starving one loses about half its float in a day',
    fed > 0.97 && starving > 0.4 && starving < 0.65,
    `after one sandbox day: a cell with a plastid in the light keeps ${fmt(100 * fed, 0)}% of its vesicles; ` +
    `one in the dark without a plastid ${fmt(100 * starving, 0)}% (it rebuilt them until its pool ran low)`);
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
