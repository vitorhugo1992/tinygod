// The AI tournament (docs/DESIGN-A-SPECIES.md): every entry in designs/entries/ (or a round's folder) in one tank, one
// cell each from the floor, moving water, several seeds in parallel; score: mean growth (author, 2026-11-04: "counting only
// cells is unfair"): its living biomass (cell volume) ÷ what it started with, averaged over every half-day census and the
// runs, so a species of giants and one of tiny cells score alike for doubling; cells, deaths and kills beside it.
//   node tools/tournament.mjs [--round=1] [--seeds=3] [--days=5] [--cap=40] [--dir=designs/entries]
//   node tools/tournament.mjs --round=1 --report    (the results so far, from the runs' saved state, while or after they run)
// Sized to take ~30 minutes (author, 2026-11-03: "30 mins max"; a tank of 200 cells simulates ~17 s per sim second).
// Writes tournament/round-N/results.json and results.md; each seed runs in its own process (--run=SEED, internal) and
// saves its state there every half day (run-SEED.json), so a stopped tournament still has its results so far.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PARAMS } from '../sim/params.js';
import { makeWorld, addCell, stepWorld, worldTime } from '../sim/world.js';
import { daylight } from '../sim/light.js';
import { prepEntry, entryProblem } from '../sim/entry.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const opt = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const round = +opt('round', 1), seeds = +opt('seeds', 3), days = +opt('days', 5), cap = +opt('cap', 40);
const out = join(ROOT, 'tournament', `round-${round}`);
const dir = join(ROOT, opt('dir', 'designs/entries'));
const DAY = PARAMS.metab.day, TH = PARAMS.tank.h;

// The entries: { file, ai, name, note, design, problem }
function entries() {
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => {
    const e = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const ai = e.ai || f.replace(/\.json$/, '');
    return { file: f, ai, name: e.name || ai, note: e.note || '', design: e.design, problem: entryProblem(e.design) };
  });
}
// A species' name in the tank: its AI's, so two AIs can't clash and the results read by AI
const speciesOf = (e) => e.ai;

// One run: every valid entry, one cell each spread along the floor (the order shuffled by the seed, as contest.mjs)
function runOne(seed) {
  PARAMS.grow.cap = cap;
  const list = entries().filter((e) => !e.problem);
  const w = makeWorld(seed, { day: true, metab: true, grow: true, flow: true });
  const spot = list.map((_, i) => i);
  if (seed !== 1) { let r = seed; const rnd = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648); for (let i = spot.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [spot[i], spot[j]] = [spot[j], spot[i]]; } }
  const bio0 = {};
  list.forEach((e, i) => {
    const d = prepEntry(e.design); d.name = speciesOf(e);
    const c0 = addCell(w, d, 100 + spot[i] * (1400 / Math.max(1, list.length - 1)), 60, 0);
    bio0[d.name] = c0.pieces[0].volume;
  });
  const sp = list.map(speciesOf);
  const census = [], growth = [], deaths = [], depth = Object.fromEntries(sp.map((s) => [s, { day: 0, dayN: 0, night: 0, nightN: 0 }]));
  const count = () => { const n = Object.fromEntries(sp.map((s) => [s, 0])); for (const c of w.cells) if (!c.dead) n[c.species]++; return n; };
  let nextCensus = 0, nextDepth = 0;
  while (worldTime(w) < days * DAY) {
    stepWorld(w);
    const t = worldTime(w);
    if (w.gone && w.gone.length) {
      for (const c of w.gone) deaths.push({ day: +(c.diedAt * PARAMS.time.dt / DAY).toFixed(2), species: c.species, why: c.diedWhy || (c.eatenBy ? `swallowed by a ${c.eatenBy}` : 'died'), depth: Math.round(TH - c.q[1]) });
      w.gone.length = 0;
    }
    if (t >= nextDepth) {   // where each species is, by day and by night (every 10 s)
      const lit = daylight(w) > 0.05;
      for (const c of w.cells) if (!c.dead && depth[c.species]) { const d = depth[c.species]; if (lit) { d.day += TH - c.q[1]; d.dayN++; } else { d.night += TH - c.q[1]; d.nightN++; } }
      nextDepth += 10;
    }
    if (t >= nextCensus) {
      census.push({ day: +(t / DAY).toFixed(1), ...count() });
      const bio = Object.fromEntries(sp.map((s) => [s, 0])); for (const c of w.cells) if (!c.dead && c.species in bio) bio[c.species] += c.pieces[0].volume;
      growth.push({ day: +(t / DAY).toFixed(1), ...Object.fromEntries(sp.map((s) => [s, bio0[s] ? +(bio[s] / bio0[s]).toFixed(3) : 0])) });
      nextCensus += DAY / 2;
      writeFileSync(join(out, `run-${seed}.json`), JSON.stringify(state()));
      process.stderr.write(`  seed ${seed}: day ${(t / DAY).toFixed(1)}, ${w.cells.filter((c) => !c.dead).length} cells
`);
    }
  }
  function state() {
    const where = Object.fromEntries(sp.map((s) => { const d = depth[s]; return [s, { day: d.dayN ? Math.round(d.day / d.dayN) : null, night: d.nightN ? Math.round(d.night / d.nightN) : null }]; }));
    return { seed, reached: +(worldTime(w) / DAY).toFixed(1), final: count(), census, growth, deaths, where };
  }
  const st = state();
  writeFileSync(join(out, `run-${seed}.json`), JSON.stringify(st));
  return st;
}

mkdirSync(out, { recursive: true });
if (opt('run')) { runOne(+opt('run')); process.exit(0); }

const list = entries();
let runs;
if (process.argv.includes('--report')) {   // the results so far: whatever the runs saved
  runs = readdirSync(out).filter((f) => /^run-d+.json$/.test(f)).map((f) => JSON.parse(readFileSync(join(out, f), 'utf8')));
  if (!runs.length) { console.log('no runs saved yet'); process.exit(1); }
} else {
  // the tournament: every seed in its own process, at once
  for (const f of readdirSync(out)) if (/^run-d+.json$/.test(f)) unlinkSync(join(out, f));
  console.log(`Round ${round}: ${list.length} entries, ${seeds} seeds, ${days} days, tank cap ${cap} cells`);
  for (const e of list) console.log(`  ${e.ai}: ${e.name}${e.problem ? `  REFUSED: ${e.problem}` : ''}`);
  const T0 = Date.now();
  runs = await Promise.all(Array.from({ length: seeds }, (_, i) => new Promise((ok, fail) => {
    const p = spawn(process.execPath, [fileURLToPath(import.meta.url), `--run=${i + 1}`, `--round=${round}`, `--days=${days}`, `--cap=${cap}`, `--dir=${opt('dir', 'designs/entries')}`], { stdio: ['ignore', 'ignore', 'inherit'] });
    p.on('close', (code) => { if (code) fail(new Error(`seed ${i + 1} failed`)); else { console.log(`  seed ${i + 1} done [${Math.round((Date.now() - T0) / 1000)} s]`); ok(JSON.parse(readFileSync(join(out, `run-${i + 1}.json`), 'utf8'))); } });
  })));
}
const reached = Math.min(...runs.map((r) => r.reached));

// Scores: mean growth (biomass ÷ start, averaged over the censuses, then the runs); mean living cells at the end; deaths
// by cause; kills; where they lived
const scores = list.map((e) => {
  const s = speciesOf(e), finals = runs.map((r) => (r.final[s] ?? 0));
  const grew = runs.map((r) => (r.growth && r.growth.length ? r.growth.reduce((a, g) => a + (g[s] ?? 0), 0) / r.growth.length : 0));
  const died = runs.flatMap((r) => r.deaths.filter((d) => d.species === s));
  const causes = {}; for (const d of died) causes[d.why] = (causes[d.why] || 0) + 1;
  const kills = {}; for (const r of runs) for (const d of r.deaths) { const m = d.why.match(/by a (.+?)(?:'s|$)/); if (m && m[1] === s) kills[d.species] = (kills[d.species] || 0) + 1; }
  const wd = runs.map((r) => r.where[s]).filter(Boolean);
  const avg = (k) => { const v = wd.map((x) => x[k]).filter((x) => x !== null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
  return { ai: e.ai, name: e.name, refused: e.problem || null, score: e.problem ? 0 : +(grew.reduce((a, b) => a + b, 0) / runs.length).toFixed(2), grew: e.problem ? [] : grew.map((g) => +g.toFixed(2)),
    mean: e.problem ? 0 : +(finals.reduce((a, b) => a + b, 0) / runs.length).toFixed(1),
    finals: e.problem ? [] : finals, deaths: died.length, causes, kills, firstDeath: died.length ? Math.min(...died.map((d) => d.day)) : null,
    dayDepth: avg('day'), nightDepth: avg('night') };
}).sort((a, b) => b.score - a.score || b.mean - a.mean);

writeFileSync(join(out, 'results.json'), JSON.stringify({ round, seeds: runs.length, days: reached, cap, run: new Date().toISOString(), scores, entries: list.map(({ file, ai, name, note, design, problem }) => ({ file, ai, name, note, problem, design })), runs }, null, 2));
const md = [`# TinyGod AI tournament, round ${round}`, '', `All entries in one tank (at most ${cap} cells in all), one cell each from the floor, moving water, ${reached} days${reached < days ? ` (stopped early; planned ${days})` : ''}; ${runs.length} runs with different starting spots. Score: mean growth, its living biomass (cell volume) ÷ what it started with, averaged over every half day and the runs.`, '',
  '| # | AI | Species | Score (growth) | Each run | Cells at the end (mean; each run) | Deaths | Lives by day / night (µm deep) |', '|---|---|---|---|---|---|---|---|',
  ...scores.map((s, i) => `| ${i + 1} | ${s.ai} | ${s.name} | ${s.refused ? 'refused' : s.score + '×'} | ${s.grew.map((g) => g + '×').join(', ')} | ${s.refused ? '-' : s.mean}; ${s.finals.join(', ')} | ${s.deaths}${s.deaths ? ` (first day ${s.firstDeath})` : ''} | ${s.dayDepth ?? '-'} / ${s.nightDepth ?? '-'} |`),
  '', '## How they died', '',
  ...scores.map((s) => `- **${s.ai}** (${s.name}): ${s.refused ? `refused: ${s.refused}` : s.deaths ? Object.entries(s.causes).map(([k, v]) => `${v}× ${k}`).join('; ') : 'no deaths'}${Object.keys(s.kills).length ? `. Killed: ${Object.entries(s.kills).map(([k, v]) => `${v} ${k}`).join(', ')}` : ''}`),
  ''].join('\n');
writeFileSync(join(out, 'results.md'), md);
writeFileSync(join(ROOT, 'tournament', 'latest.json'), JSON.stringify({ round }));   // the entry page's next-round messages read this round
console.log('\n' + md);
