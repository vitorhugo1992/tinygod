// The ladder (2026-11-13; decided with the author one question at a time): one species per player; a new entry replaces
// the player's old one (kept in history) and plays 8 placement matches at once: the 2 house species (a fixed yardstick)
// and up to 6 players nearest its rating; a nightly top-up replays matches between entries. Each match is one against
// one, 2 cells each, 2 days, moving water, at most 12 cells (the Match tab's format); the higher growth score wins,
// within 10% a draw; a chess-like rating (Elo, K 32, start 1000). Every match is recorded (sim/record.js): the report's
// timeline, each species' life and a replay, in ladder/matches/<id>.json.
//   node tools/ladder.mjs enter <player> <design.json | TG1.code> [--issue=N]   enter (or replace) and place it
//   node tools/ladder.mjs nightly [matches=4]                                   rematch close ratings
//   node tools/ladder.mjs board                                                 print the board
// Files: ladder/state.json (players with their designs, history, every match's result), ladder/board.json (what the
// page reads: no designs, each species described by its size and parts), ladder/matches/<id>.json.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { Worker } from 'node:worker_threads';
import { cpus } from 'node:os';
import { prepEntry, entryProblem } from '../sim/entry.js';
import { MATCH_DAYS, MATCH_CELLS, MATCH_CAP } from '../sandbox/matches.js';

const opt = (k, v) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : v; };
// --dir=<folder> (a scratch ladder for tests) · --days=<n> (shorter matches for tests)
const ROOT = new URL('../', import.meta.url), DIR = new URL(opt('dir', 'ladder').replace(/\/?$/, '/'), ROOT), MDIR = new URL('matches/', DIR);
const STATE = new URL('state.json', DIR), BOARD = new URL('board.json', DIR);
const HOUSE = [{ player: 'house', name: 'Noctilla', file: 'designs/noctilla.json' }, { player: 'house', name: 'Deepdweller II', file: 'designs/deepdweller2.json' }];
const START = 1000, K = 32, DRAW = 1.1, PLACEMENT = 8, NEAR = PLACEMENT - HOUSE.length;
const POOL = Math.max(1, Math.min(4, cpus().length - 1));
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const today = () => new Date().toISOString().slice(0, 10);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'x';
const hash = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) % 100000 + 1; };

function load() {
  mkdirSync(MDIR, { recursive: true });
  if (existsSync(STATE)) return JSON.parse(readFileSync(STATE, 'utf8'));
  const st = { players: {}, history: [], matches: [] };
  for (const h of HOUSE) {   // the house species: always on the board, the yardstick a new entry is measured by
    const d = JSON.parse(readFileSync(new URL(h.file, ROOT), 'utf8')).design;
    st.players[`house:${h.name}`] = { key: `house:${h.name}`, player: 'house', species: h.name, design: d, rating: START, w: 0, d: 0, l: 0, entered: today(), house: true };
  }
  return st;
}
function save(st) {
  writeFileSync(STATE, JSON.stringify(st));
  // the page's board: ranks, records, each species described (its size and parts), never its design
  const describe = (d) => {
    const parts = {};
    for (const p of d.parts || []) {
      const what = p.type === 'inclusion' ? (p.label || p.material) : p.type === 'segment' ? (p.label || null) : p.type === 'sensor' ? (p.kind === 'light' ? 'Eyespot' : p.label || p.kind) : p.type === 'rule' ? null : (p.label || p.type);
      if (what) parts[what] = (parts[what] || 0) + 1;
    }
    return { size: `${Math.round(2 * d.body.radius)} × ${Math.round(2 * d.body.radius + (d.body.length || 0))} µm`, parts };
  };
  const players = Object.values(st.players).sort((a, b) => b.rating - a.rating)
    .map((p, i) => ({ rank: i + 1, key: p.key, player: p.player, species: p.species, house: !!p.house, rating: Math.round(p.rating), w: p.w, d: p.d, l: p.l, entered: p.entered, ...describe(p.design) }));
  writeFileSync(BOARD, JSON.stringify({ updated: new Date().toISOString(), players, history: st.history, matches: st.matches.slice(-200) }, null, 1));
}

function readDesign(src) {
  if (src.startsWith('TG1.')) { const g = JSON.parse(inflateRawSync(Buffer.from(src.slice(4), 'base64url')).toString('utf8')); return { name: g.name, design: g.design || g }; }
  const g = JSON.parse(readFileSync(src, 'utf8'));
  return { name: g.name || (g.design && g.design.species), design: g.design || g };
}

// One match in a worker; the two species by names that differ
function play(A, B, n) {
  let nb = B.species; if (nb === A.species) nb = `${B.species} (${B.player})`;
  const seed = hash(`${A.key}|${B.key}`) + n;
  return new Promise((res, rej) => {
    const w = new Worker(new URL('./ladder-worker.mjs', import.meta.url), {
      workerData: { entries: [{ name: A.species, design: A.design }, { name: nb, design: B.design }], seed, days: Number(opt('days', MATCH_DAYS)), each: MATCH_CELLS / 2, cap: MATCH_CAP } });
    w.once('message', (r) => res({ A, B, r })); w.once('error', rej);
  });
}
async function runAll(pairs) {
  const out = [], queue = pairs.slice();
  const lane = async () => { while (queue.length) { const [A, B, n] = queue.shift(); const t = await play(A, B, n); out.push(t); console.log(`  ${A.species} (${A.player}) vs ${B.species} (${B.player}): ${t.r.species.map((s) => `${s.name} ${s.score.toFixed(2)}×`).join(', ')} [${t.r.secs} s]`); } };
  await Promise.all(Array.from({ length: Math.min(POOL, pairs.length) }, lane));
  return out;
}

// The result into the ratings, the match into its file and the list
function settle(st, { A, B, r }) {
  const [sa, sb] = r.species.map((s) => s.score);
  const res = Math.max(sa, sb) <= DRAW * Math.min(sa, sb) ? 0.5 : sa > sb ? 1 : 0;
  const ea = 1 / (1 + 10 ** ((B.rating - A.rating) / 400)), dA = K * (res - ea);
  A.rating += dA; B.rating -= dA;
  if (res === 0.5) { A.d++; B.d++; } else if (res === 1) { A.w++; B.l++; } else { A.l++; B.w++; }
  const id = `${today()}-${slug(A.species)}-vs-${slug(B.species)}-${st.matches.length + 1}`;
  const side = (P, s) => ({ key: P.key, player: P.player, species: s.name, score: Math.round(s.score * 100) / 100, cells: s.cells, ...r.summary[s.name] });
  writeFileSync(new URL(`${id}.json`, MDIR), JSON.stringify({ id, date: today(), seed: r.seed, days: r.days, each: r.each, cap: r.cap, names: r.names,
    a: side(A, r.species[0]), b: side(B, r.species[1]), result: res === 0.5 ? 'draw' : res === 1 ? 'a' : 'b', change: Math.round(dA),
    events: r.events, life: r.life, frames: r.frames }));
  st.matches.push({ id, date: today(), a: A.key, b: B.key, sa: Math.round(sa * 100) / 100, sb: Math.round(sb * 100) / 100, result: res === 0.5 ? 'draw' : res === 1 ? 'a' : 'b', change: Math.round(dA) });
  return { res, dA, other: B };
}

async function enter(player, src) {
  const st = load();
  const { name, design } = readDesign(src);
  const problem = entryProblem(design);
  if (problem) { console.log(`Refused: ${problem}`); process.exit(2); }
  const key = `player:${player}`, old = st.players[key];
  if (old) st.history.push({ player, species: old.species, rating: Math.round(old.rating), w: old.w, d: old.d, l: old.l, entered: old.entered, retired: today() });
  const species = String(name || design.species || 'Unnamed').replace(/ \(.*/, '').slice(0, 40);
  const me = st.players[key] = { key, player, species, design: prepEntry(design), rating: START, w: 0, d: 0, l: 0, entered: today(), issue: opt('issue', null) };
  const others = Object.values(st.players).filter((p) => p !== me);
  const house = others.filter((p) => p.house), near = others.filter((p) => !p.house).sort((a, b) => Math.abs(a.rating - START) - Math.abs(b.rating - START)).slice(0, NEAR);
  const pairs = [...house, ...near].map((B) => [me, B, st.matches.length]);
  console.log(`${player} enters ${species}: ${pairs.length} placement matches, ${POOL} at a time`);
  const lines = [];
  for (const t of await runAll(pairs)) {
    const { res, other } = settle(st, t);
    lines.push(`${res === 1 ? 'beat' : res === 0 ? 'lost to' : 'drew with'} ${other.species}${other.house ? '' : ` (${other.player})`}`);
  }
  save(st);
  const rank = Object.values(st.players).sort((a, b) => b.rating - a.rating).indexOf(me) + 1;
  const msg = `${species} placed #${rank} of ${Object.keys(st.players).length} (rating ${Math.round(me.rating)}): ${lines.join(', ')}.`;
  writeFileSync(new URL('last.txt', DIR), msg);
  console.log(msg);
}

async function nightly(count) {
  const st = load();
  const ps = Object.values(st.players);
  const played = new Map();   // how many times each pair has met
  for (const m of st.matches) { const k = [m.a, m.b].sort().join('|'); played.set(k, (played.get(k) || 0) + 1); }
  const cand = [];
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const k = [ps[i].key, ps[j].key].sort().join('|');
    cand.push({ A: ps[i], B: ps[j], cost: Math.abs(ps[i].rating - ps[j].rating) + 300 * (played.get(k) || 0) });
  }
  cand.sort((a, b) => a.cost - b.cost);
  const pairs = cand.slice(0, count).map((c) => [c.A, c.B, st.matches.length]);
  console.log(`nightly: ${pairs.length} matches`);
  for (const t of await runAll(pairs)) settle(st, t);
  save(st);
}

function board() {
  const st = load();
  for (const [i, p] of Object.values(st.players).sort((a, b) => b.rating - a.rating).entries())
    console.log(`${String(i + 1).padStart(3)}. ${Math.round(p.rating)}  ${p.species} (${p.player})  ${p.w}-${p.d}-${p.l}`);
}

const [cmd, a1, a2] = args;
if (cmd === 'enter' && a1 && a2) await enter(a1, a2);
else if (cmd === 'nightly') await nightly(Number(a1 || 4));
else if (cmd === 'board') board();
else console.log('node tools/ladder.mjs enter <player> <design.json | TG1.code> [--issue=N] | nightly [n] | board');
