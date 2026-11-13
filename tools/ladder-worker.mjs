// One recorded ladder match in a worker thread (tools/ladder.mjs runs several at once)
import { parentPort, workerData } from 'node:worker_threads';
import { newMatch, stepMatch, matchResult } from '../sim/match.js';
import { lifeSummary } from '../sim/record.js';

const { entries, seed, days, each, cap } = workerData;
const t0 = Date.now();
const m = newMatch({ entries, seed, days, each, cap, record: true });
while (!m.over) stepMatch(m, 2000);
const res = matchResult(m);
parentPort.postMessage({
  seed, days, each, cap, secs: Math.round((Date.now() - t0) / 1000),
  species: res.species.map((s) => ({ name: s.name, score: s.score, now: s.now, cells: s.cells })),
  summary: lifeSummary(m.rec), events: m.rec.events, life: m.rec.life, frames: m.rec.frames, names: m.rec.names,
});
