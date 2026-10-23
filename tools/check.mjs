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

// 13. Speed (not a pass test yet)
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
