// One match for tools/ladder-noise.mjs; the tank's width is set before the simulation loads (it is read once, at load)
import { parentPort, workerData } from 'node:worker_threads';
import { PARAMS } from '../sim/params.js';
if (workerData.width) PARAMS.tank.w = workerData.width;
const { newMatch, stepMatch, matchResult } = await import('../sim/match.js');
const { entries, seed, days, each, cap } = workerData;
const t0 = Date.now();
const m = newMatch({ entries, seed, days, each, cap, record: true });
while (!m.over) stepMatch(m, 2000);
const ev = m.rec.events, cross = (e) => (e.kind === 'latched' || e.kind === 'swallowed' || (e.kind === 'harpoon' && e.hit && !e.kin) || (e.kind === 'died' && e.by));
parentPort.postMessage({ seed, secs: Math.round((Date.now() - t0) / 1000), scores: matchResult(m).species.map((s) => s.score), cells: matchResult(m).species.map((s) => s.cells),
  contacts: ev.filter(cross).length, kills: ev.filter((e) => e.kind === 'died' && e.by).length, born: ev.filter((e) => e.kind === 'born').length });
