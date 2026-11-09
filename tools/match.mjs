// A ladder match in Node, exactly as the page runs it (sim/match.js, sandbox/matches.js):
//   node tools/match.mjs <your design.json> [rung 1-6 | all]     (the file: { name, design } or a bare design)
// Prints the census every half day, then the scores, the stars and how each species' cells died.
import { readFileSync } from 'fs';
import { newMatch, stepMatch, matchResult, matchStars, deathsText } from '../sim/match.js';
import { RUNGS, MATCH_DAYS, MATCH_CAP, rungSeed, rungEach, yourName } from '../sandbox/matches.js';

const ROOT = new URL('../', import.meta.url);
const [file, which = '1'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
// to try another format: --days=2 --each=1 --cap=24 (the page plays matches.js's)
const opt = (k, v) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? Number(a.slice(k.length + 3)) : v; };
if (!file) { console.log('node tools/match.mjs <design.json> [rung 1-6 | all]'); process.exit(1); }
const got = JSON.parse(readFileSync(file, 'utf8')), mine = got.design || got;
if (got.name && !mine.species) mine.species = got.name.replace(/ \(.*/, '');

for (const i of which === 'all' ? RUNGS.map((_, k) => k) : [Number(which) - 1]) {
  const r = RUNGS[i], you = yourName(mine, r);
  const entries = [{ name: you, design: mine }, ...r.rivals.map((x) => ({ name: x.name, design: JSON.parse(readFileSync(new URL(x.file, ROOT), 'utf8')).design }))];
  const m = newMatch({ entries, seed: rungSeed(i), days: opt('days', MATCH_DAYS), each: opt('each', rungEach(r)), cap: opt('cap', MATCH_CAP) });
  console.log(`Rung ${i + 1}, ${r.title}: ${you} against ${r.rivals.map((x) => x.name).join(', ')}; ${m.each} cells each, ${m.days} days, at most ${m.cap} cells`);
  const T0 = Date.now(); let told = 0;
  while (!m.over) {
    stepMatch(m, 1000);
    if (m.census.length > told) { const c = m.census[told = m.census.length, told - 1]; console.log(`  day ${c.day.toFixed(1)} [${Math.round((Date.now() - T0) / 1000)} s]: ${m.names.map((s) => `${s} ${c.n[s]} (${c.grow[s].toFixed(1)}×)`).join(', ')}`); }
  }
  const res = matchResult(m);
  for (const s of [...res.species].sort((a, b) => b.score - a.score)) console.log(`  ${s.name}: SCORE ${s.score.toFixed(2)}× (now ${s.now.toFixed(2)}×), ${s.cells} cells${s.deaths.length ? '; died: ' + deathsText(s.deaths) : ''}`);
  console.log(`  ${'★'.repeat(matchStars(res, you)) || 'no star'} for ${you}`);
}
