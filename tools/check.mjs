// Physics-law checks for the sandbox, headless. Run: node tools/check.mjs
// Each check prints what it measured and PASS/FAIL; the exit code is the number of failures.
import { PARAMS } from '../sim/params.js';
import { makeWorld, addCell, stepWorld } from '../sim/world.js';
import { cellWeight } from '../sim/build.js';
import { PRESETS } from '../sim/presets.js';

const DT = PARAMS.time.dt;
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
  const c = addCell(w, PRESETS['Spring jump'], 300, 1000, 0);
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
    const d = JSON.parse(JSON.stringify(PRESETS['Spring jump']));
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

// 19. A light sensor reads the light by the way it faces; a motor wired to it runs only while it is lit, and its
// beat resumes where it froze (no jump)
{
  const eyeTail = {
    body: { radius: 8 },
    parts: [
      { type: 'sensor', id: 'eye', at: [8, 0], kind: 'light' },
      ...PRESETS['Wave tail'].parts.map((p) => ({ ...p, joint: { ...p.joint, control: { sensor: 'eye', when: 'light' } } })),
    ],
  };
  const readAt = (deg, light = true) => {
    const w = makeWorld(1, { gravity: false, light });
    const c = addCell(w, eyeTail, 300, 1000, deg);
    stepWorld(w);
    return { w, c, value: c.sensors[0].value, on: c.joints[0].on };
  };
  const up = readAt(90), side = readAt(0), down = readAt(-90), off = readAt(90, false);
  // facing up it swims; turned down mid-run its motors stop with the tail where it was, and resume from there
  const r = readAt(90);
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
  check('a light sensor reads by the way it faces; a motor wired to it runs only while lit, resuming without a jump',
    up.value > 0.99 && side.value < 1e-6 && down.value === 0 && off.value === 0 && up.on && !down.on && y1 > 1010 && still && jump <= beatStep * 1.001,
    `facing up ${fmt(up.value)}, sideways ${fmt(side.value)}, down ${fmt(down.value)}, light off ${fmt(off.value)}; ` +
    `swam ${fmt(y1 - 1000, 1)} µm up in 0.5 s; turned down: tail frozen ${still ? 'in place' : 'NOT in place'}; ` +
    `turned back up, the tail's first step moves ${fmt(jump * 180 / Math.PI, 2)}° (an ordinary beat step is up to ${fmt(beatStep * 180 / Math.PI, 2)}°)`);
}

// 20. Speed (not a pass test yet)
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
