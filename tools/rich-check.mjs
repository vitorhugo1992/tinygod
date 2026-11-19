// The rich night record checked (2026-11-19): runs the Ocean on from ocean/world.json.gz, records it (sim/rich.js), and
// at every recorded moment rebuilds each cell from the record and compares it with the real one, piece by piece. Prints
// the worst differences and the record's size.   node tools/rich-check.mjs [sim seconds = 60] [--dir=ocean]
import { readFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { PARAMS } from '../sim/params.js';
import { stepWorld } from '../sim/world.js';
import { updatePose } from '../sim/physics.js';
import { loadState } from '../sim/save.js';
import { richRecord, richStep, richDone, replay } from '../sim/rich.js';

const dir = (process.argv.find((a) => a.startsWith('--dir=')) || '--dir=ocean').slice(6);
const secs = Number(process.argv.slice(2).find((a) => !a.startsWith('--')) || 60), DT = PARAMS.time.dt;
const world = loadState(gunzipSync(readFileSync(new URL(`../${dir}/world.json.gz`, import.meta.url))).toString('utf8')).world;
if (world.cap) PARAMS.grow.cap = world.cap;
const R = richRecord([...new Set(world.cells.map((c) => c.species))]);
const snaps = new Map();   // steps -> the real cells' piece positions and states, taken as recorded
const snap = () => new Map(world.cells.filter((c) => !c.eatenBy).map((c) => (updatePose(c), c)).map((c) => [c.uid, { cx: [...c.cx], cy: [...c.cy], pieces: c.pieces.map((p) => p.L),
  orgs: c.pieces[0].inclusions.map((i) => (i.store ? i.fill : i.pumpable ? i.density : i.material === 'plastid' ? i.damage || 0 : null)),
  links: (world.links || []).filter((l) => world.cells[l.a] === c).length, dead: !!c.dead, size: c.size || 1 }]));
const t0 = performance.now();
for (let k = 0; k < secs / DT; k++) {
  stepWorld(world);
  richStep(R, world);
  if (world.steps % R.every === 0) snaps.set(world.steps, snap());
  if (world.gone) world.gone.length = 0;
}
const run = (performance.now() - t0) / 1000;
// back from the record: the same moments, posed
const rec = JSON.parse(JSON.stringify(richDone(R))), rp = replay(rec);
let worst = 0, worstAt = '', worstOrg = 0, missing = 0, cellsSeen = 0, linkDiff = 0;
const t1 = performance.now();
for (const [s, real] of snaps) {
  const w = rp.at(s);
  for (const c of w.cells) {
    const r = real.get(c.uid);
    if (!r) { missing++; continue; }
    cellsSeen++;
    if (r.cx.length !== c.cx.length) { console.log(`uid ${c.uid} (${c.species}) at ${s}: ${c.cx.length} pieces, real ${r.cx.length}`); missing++; continue; }
    for (let i = 0; i < c.cx.length; i++) {
      const d = Math.hypot(c.cx[i] - r.cx[i], c.cy[i] - r.cy[i]);
      if (d > worst) { worst = d; worstAt = `${c.species} uid ${c.uid} piece ${i} at step ${s}`; }
    }
    c.pieces[0].inclusions.forEach((inc, i) => {
      const v = inc.store ? inc.fill : inc.pumpable ? inc.density : inc.material === 'plastid' ? inc.damage || 0 : null;
      if (v !== null && r.orgs[i] !== null) worstOrg = Math.max(worstOrg, Math.abs(v - r.orgs[i]) / (inc.pumpable ? 1000 : 1));
    });
    linkDiff += Math.abs(w.links.filter((l) => w.cells[l.a] === c).length - r.links);
  }
}
const json = JSON.stringify(rec), gz = gzipSync(json).length;
console.log(`${secs} sim s, ${world.cells.length} cells at the end, run ${run.toFixed(0)} s; replayed ${snaps.size} moments in ${((performance.now() - t1) / 1000).toFixed(1)} s`);
console.log(`cells compared ${cellsSeen}, missing ${missing}; worst piece off by ${worst.toFixed(4)} µm (${worstAt}); worst organelle state off ${worstOrg.toFixed(4)}; link count differences ${linkDiff}`);
console.log(`record: ${(json.length / 1024).toFixed(0)} KB, gzipped ${(gz / 1024).toFixed(0)} KB, so a 600 s night ~${(gz / 1024 * 600 / secs / 1024).toFixed(1)} MB gzipped`);
