// Physics-law checks for the sandbox, headless. Run: node tools/check.mjs
// Each check prints what it measured and PASS/FAIL; the exit code is the number of failures.
import { PARAMS } from '../sim/params.js';
import { makeWorld, addCell, stepWorld } from '../sim/world.js';
import { cellWeight } from '../sim/build.js';

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

// 8. Speed (not a pass test yet): one cell with a body and four spines
{
  const design = { body: { radius: 10 }, parts: [0, 90, 180, 270].map((deg) => ({ type: 'segment',
    at: [10 * Math.cos(deg * Math.PI / 180), 10 * Math.sin(deg * Math.PI / 180)], angle: deg, length: 30, radius: 0.5 })) };
  const w = makeWorld(1); addCell(w, design, 300, 1500, 0);
  const steps = 200000, t0 = performance.now();
  for (let i = 0; i < steps; i++) stepWorld(w);
  const ms = performance.now() - t0;
  console.log(`INFO  speed: 5-piece cell, ${fmt(ms / (steps * DT), 2)} ms per simulated second ` +
    `(${fmt(steps / ms * 1000 / 1e6, 2)} M steps/s, dt ${DT * 1000} ms)`);
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures);
