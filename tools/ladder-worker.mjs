// One ladder pairing in a worker thread (tools/ladder.mjs runs several at once): the same two species over several
// seeds, each game recorded. The arena's width is set before the simulation loads (it is read once, at load).
import { parentPort, workerData } from 'node:worker_threads';
import { PARAMS } from '../sim/params.js';
if (workerData.width) PARAMS.tank.w = workerData.width;
const { newMatch, stepMatch, matchResult } = await import('../sim/match.js');
const { lifeSummary } = await import('../sim/record.js');

const { entries, seeds, days, each, cap } = workerData;
const t0 = Date.now(), games = [];
for (const seed of seeds) {
  const m = newMatch({ entries, seed, days, each, cap, record: true });
  while (!m.over) stepMatch(m, 2000);
  const res = matchResult(m);
  games.push({ seed, species: res.species.map((s) => ({ name: s.name, score: s.score, now: s.now, cells: s.cells })),
    summary: lifeSummary(m.rec), events: m.rec.events, life: m.rec.life, frames: m.rec.frames });
}
parentPort.postMessage({ days, each, cap, width: PARAMS.tank.w, names: entries.map((e) => e.name), secs: Math.round((Date.now() - t0) / 1000), games });
