// The Ocean (2026-11-18, the plan's step 3; every rule decided with the author on 2026-11-13/14): one shared tank that
// never resets, advanced one ocean day (dawn to dawn) a night, every player's species living in it.
//   node tools/ocean.mjs found                                   a new Ocean: the house species arrive (refuses if one exists)
//   node tools/ocean.mjs release <player> <design.json | TG1.code> [--name=]   queue a release for the next night
//   node tools/ocean.mjs night [n = 1]                           run n nights
//   node tools/ocean.mjs board                                   print the board
//   node tools/ocean.mjs story                                   rebuild every species' life story (story.json) from the nights
//   --dir=<folder> (default ocean/: a scratch Ocean for tests) · --seconds=<n> (a shorter night, for tests)
// The rules: the tank of the Lab (1,600 × 2,000 µm, moving water, days, shading); a species arrives as 3 cells at random
// spots; at most 100 cells and 25 of one species (at its ceiling a species can't divide but still grows and stores;
// nothing is removed by a rule); one species per player: a new release replaces the old one (its cells taken out that
// night, its history kept), at most one release per player every 3 nights; an extinct species returns by itself 3
// nights after its last cell died (house species only while 12 species or fewer live there); the board ranks by growth
// since arrival (living biomass ÷ what its 3 cells arrived with, 0 while extinct) averaged over the last 7 nights.
// Files in the folder: state.json (species, designs, history, the queue), world.json.gz (the tank saved exactly,
// sim/save.js), board.json (for the page: no designs), nights/<n>.json.gz (the night's timeline, each species' life,
// replay frames: sim/record.js), nights/<n>.rich.json.gz (every cell posed, sim/rich.js), story.json (each species' line
// and milestones a night: tools/ocean-story.mjs; public like the board).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync, inflateRawSync } from 'node:zlib';
import { PARAMS } from '../sim/params.js';
import { makeWorld, addCell, stepWorld } from '../sim/world.js';
import { prepEntry, entryProblem } from '../sim/entry.js';
import { startSpots } from '../sim/start.js';
import { takeOut } from '../sim/death.js';
import { newRecord, recordStep, lifeSummary } from '../sim/record.js';
import { richRecord, richStep, richDone } from '../sim/rich.js';
import { saveState, loadState } from '../sim/save.js';
import { clock } from '../sim/light.js';
import { storyNight } from './ocean-story.mjs';

export const OCEAN = { cap: 100, capSpecies: 25, arrive: 3, returnAfter: 3, releaseEvery: 3, houseUntil: 12, boardNights: 7, seed: 20261118 };
export const HOUSE = [
  ['Noctilla', 'designs/noctilla.json'], ['Plebella', 'designs/plebella.json'], ['Nutricline Bobber', 'tournament/bobber-blind-opus.json'],
  ['Deepdweller II', 'designs/deepdweller2.json'], ['Needle Drifter', 'tournament/fixer-blind-opus2.json'], ['Laqueella', 'designs/laqueella.json'],
  ['Bloomeater', 'designs/_gulper.json'], ['Raptilla 2', 'designs/raptilla2.json'],
];

const opt = (k, v) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : v; };
const ROOT = new URL('../', import.meta.url), DIR = new URL(opt('dir', 'ocean').replace(/\/?$/, '/'), ROOT), NDIR = new URL('nights/', DIR);
const STATE = new URL('state.json', DIR), WORLD = new URL('world.json.gz', DIR), BOARD = new URL('board.json', DIR), STORY = new URL('story.json', DIR);
const DT = PARAMS.time.dt, DAY = PARAMS.metab.day, TH = PARAMS.tank.h;
const NIGHT = Math.round(Number(opt('seconds', DAY)) / DT);
const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) % 1000000 + 1; };
const vol = (c) => c.pieces[0].volume;
const r2 = (v) => Math.round(v * 100) / 100;

function readDesign(src) {
  if (src.startsWith('TG1.')) { const g = JSON.parse(inflateRawSync(Buffer.from(src.slice(4), 'base64url')).toString('utf8')); return { name: g.name, design: g.design || g }; }
  const g = JSON.parse(readFileSync(src, 'utf8'));
  return { name: g.name || (g.design && g.design.species), design: g.design || g };
}

const loadSt = () => JSON.parse(readFileSync(STATE, 'utf8'));
function loadWorld(st) {
  if (existsSync(WORLD)) return loadState(gunzipSync(readFileSync(WORLD)).toString('utf8')).world;
  const w = makeWorld(st.seed, { day: true, metab: true, grow: true, flow: true });
  w.cap = OCEAN.cap; w.capSpecies = OCEAN.capSpecies;
  return w;
}
function saveAll(st, world) {
  writeFileSync(WORLD, gzipSync(saveState({ world })));
  writeFileSync(STATE, JSON.stringify(st));
  writeFileSync(BOARD, JSON.stringify(board(st), null, 1));
}

// A species arrives: 3 cells at random spots (the same Ocean and night always picks the same spots)
function arrive(st, world, sp, night) {
  const d = prepEntry(sp.design);
  d.name = d.species = sp.name;
  const spots = startSpots(hash(`${st.seed}|${night}|${sp.name}|${sp.stays.length}`), OCEAN.arrive);
  let bio = 0;
  for (const s of spots) bio += vol(addCell(world, d, s.x, s.y, 0));
  sp.status = 'living'; sp.bio0 = bio;
  sp.stays.push({ from: night, to: null, why: null });
}

function found() {
  if (existsSync(STATE)) throw new Error(`an Ocean exists in ${DIR.pathname}: it never resets (delete the folder to start again)`);
  mkdirSync(NDIR, { recursive: true });
  const st = { created: new Date().toISOString(), seed: Number(opt('seed', OCEAN.seed)), night: 0, rules: OCEAN, species: {}, queue: [], climate: [] };
  for (const [name, file] of HOUSE) {
    const design = JSON.parse(readFileSync(new URL(file, ROOT), 'utf8')).design;
    st.species[name] = { name, player: 'house', house: true, design, version: 1, released: 0, status: 'queued', stays: [], nights: [], kills: 0 };
    st.queue.push({ name });
  }
  writeFileSync(STATE, JSON.stringify(st));
  console.log(`Founded an Ocean in ${DIR.pathname}: ${HOUSE.length} house species arrive on night 1.`);
}

function release(player, src) {
  const st = loadSt(), next = st.night + 1, { name: n0, design } = readDesign(src);
  const problem = entryProblem(design);
  if (problem) throw new Error(`not released: ${problem}`);
  let old = Object.values(st.species).find((s) => s.player === player && s.status !== 'replaced');
  if (old && old.status === 'queued') {   // a release not yet arrived is swapped, not counted twice
    st.queue = st.queue.filter((q) => q.name !== old.name);
    delete st.species[old.name];
    old = old.replaces ? st.species[old.replaces] : null;
  }
  if (old && next - old.released < OCEAN.releaseEvery) throw new Error(`not released: ${player} released ${old.name} on night ${old.released}; the next release can arrive on night ${old.released + OCEAN.releaseEvery}`);
  let name = String(opt('name', n0 || `${player}'s species`)).slice(0, 40);
  if (st.species[name] && st.species[name].player !== player) name = `${name} (${player})`;
  if (st.species[name] && st.species[name].player === player) name = `${name} v${(old ? old.version : 1) + 1}`;   // a name keeps one history
  st.species[name] = { name, player, house: false, design, version: old ? old.version + 1 : 1, released: next, status: 'queued', stays: [], nights: [], kills: 0, replaces: old ? old.name : null };
  st.queue.push({ name });
  writeFileSync(STATE, JSON.stringify(st));
  console.log(`${name} (${player}) arrives on night ${next}${old ? `, replacing ${old.name}` : ''}.`);
}

function runNight() {
  const st = loadSt(), night = st.night + 1, world = loadWorld(st);
  PARAMS.grow.cap = OCEAN.cap;   // (the world's own cap wins; this is for anything that reads the global)
  const told = [], t0 = performance.now();
  const rec = { events: [] };
  const ev = (e) => rec.events.push({ day: Math.round(world.steps * DT / DAY * 1000) / 1000, ...e });
  // 1. releases: the player's old version taken out, the new one arrives
  for (const q of st.queue) {
    const sp = st.species[q.name];
    if (sp.replaces && st.species[sp.replaces]) {
      const old = st.species[sp.replaces], n = takeOut(world, old.name, 'taken out: a new version was released');
      if (old.status === 'living') { const stay = old.stays[old.stays.length - 1]; stay.to = night - 1; stay.why = 'replaced'; }
      old.status = 'replaced'; old.replacedBy = sp.name;
      ev({ kind: 'replaced', species: old.name, by: sp.name, cells: n });
      told.push(`${old.name} replaced by ${sp.name} (${n} cells taken out)`);
    }
    arrive(st, world, sp, night);
    ev({ kind: 'arrived', species: sp.name, cells: OCEAN.arrive, released: true });
    told.push(`${sp.name} (${sp.player}) arrived`);
  }
  st.queue = [];
  // 2. returns: extinct 3 nights or more (a house species only while few species live here)
  const living = () => Object.values(st.species).filter((s) => s.status === 'living').length;
  for (const sp of Object.values(st.species)) {
    if (sp.status !== 'extinct' || night - sp.lastDied < OCEAN.returnAfter) continue;
    if (sp.house && living() > OCEAN.houseUntil) continue;
    arrive(st, world, sp, night);
    ev({ kind: 'arrived', species: sp.name, cells: OCEAN.arrive, returned: true });
    told.push(`${sp.name} returned`);
  }
  if (world.gone) world.gone.length = 0;
  // 3. one ocean day, recorded
  const names = Object.values(st.species).filter((s) => s.status === 'living').map((s) => s.name);
  const m = { world, names };
  const R = newRecord(m); R.events.push(...rec.events);
  const RR = richRecord(names);   // the rich record: every cell posed every second, for drawing the night exactly (sim/rich.js)
  const startDay = world.steps * DT / DAY, deaths = [];
  for (let k = 0; k < NIGHT; k++) {
    stepWorld(world);
    recordStep(R, m);
    richStep(RR, world);
    if (world.gone && world.gone.length) { for (const c of world.gone) deaths.push({ species: c.species, why: c.diedWhy || 'starved', depth: Math.round(TH - c.q[1]) }); world.gone.length = 0; }
    if (k && k % Math.round(DAY / 4 / DT) === 0) process.stdout.write(`  night ${night}: ${Math.round(100 * k / NIGHT)}% · ${world.cells.length} cells · ${((performance.now() - t0) / 60000).toFixed(1)} min\n`);
  }
  // 4. the census: each living species' cells, biomass, growth since arrival; extinctions with their cause
  const sum = lifeSummary(R), total = world.cells.reduce((t, c) => t + (c.dead ? 0 : vol(c)), 0);
  for (const sp of Object.values(st.species)) {
    if (sp.status !== 'living') { if (sp.status === 'extinct') sp.nights.push({ night, cells: 0, bio: 0, growth: 0, share: 0 }); continue; }
    const cs = world.cells.filter((c) => !c.dead && c.species === sp.name), bio = cs.reduce((t, c) => t + vol(c), 0);
    const s = sum[sp.name] || { kills: 0, born: 0, died: 0 };
    sp.kills += s.kills;
    sp.nights.push({ night, cells: cs.length, bio: Math.round(bio), growth: r2(bio / sp.bio0), share: Math.round(1e4 * (total ? bio / total : 0)) / 1e4, born: s.born, died: s.died, kills: s.kills });
    if (!cs.length) {
      const last = R.events.filter((e) => e.kind === 'died' && e.species === sp.name).pop();
      const stay = sp.stays[sp.stays.length - 1];
      const corpse = world.cells.find((c) => c.dead && c.species === sp.name);   // its last cells may still lie dead in the tank
      stay.to = night; stay.why = last ? last.why : corpse ? corpse.diedWhy || 'starved' : 'died out';
      sp.status = 'extinct'; sp.lastDied = night;
      told.push(`${sp.name} died out (${stay.why})`);
    }
  }
  // 5. save: the tank, the state, the board, the night's record
  st.night = night;
  st.last = { night, at: new Date().toISOString(), cells: world.cells.length, minutes: r2((performance.now() - t0) / 60000), told, clock: Math.round(clock(world) * 10) / 10 };
  mkdirSync(NDIR, { recursive: true });
  const N = { night, from: startDay, to: world.steps * DT / DAY, names: R.names, events: R.events, life: R.life, frames: R.frames, summary: sum, deaths };
  writeFileSync(new URL(`${night}.json.gz`, NDIR), gzipSync(JSON.stringify(N)));
  writeFileSync(new URL(`${night}.rich.json.gz`, NDIR), gzipSync(JSON.stringify({ night, ...richDone(RR) })));
  saveAll(st, world);
  // the life stories: this night added (or all rebuilt if the file is missing or behind)
  let story = existsSync(STORY) ? JSON.parse(readFileSync(STORY, 'utf8')) : null;
  if (story && story.night === night - 1) writeFileSync(STORY, JSON.stringify(storyNight(story, st, N))); else rebuildStory(st);
  console.log(`Night ${night}: ${world.cells.length} cells, ${st.last.minutes} min. ${told.join('; ') || 'nothing arrived or died out'}.`);
}

// Every species' story from night 1, from the nights' records (node tools/ocean.mjs story)
function rebuildStory(st = loadSt()) {
  const story = { night: 0, species: {}, mem: {} };
  for (let n = 1; n <= st.night; n++) {
    const file = new URL(`${n}.json.gz`, NDIR);
    if (existsSync(file)) storyNight(story, st, JSON.parse(gunzipSync(readFileSync(file)).toString('utf8')));
  }
  story.night = st.night;
  writeFileSync(STORY, JSON.stringify(story));
  return story;
}

// What a species carries, counted (the page draws its cells with them; described, never given: no layout, no rules)
function partsOf(d) {
  const c = {};
  for (const p of d.parts || []) {
    const j = p.joint && p.joint.type;
    const w = p.type === 'inclusion' ? (['starch', 'oil'].includes(p.material) ? 'store' : p.material)
      : p.type === 'segment' ? (j === 'feed' ? 'tube' : j === 'motor' ? 'tail' : j === 'fire' ? 'harpoon' : j === 'tether' ? 'tether' : p.joint && p.joint.burst ? 'spring' : 'spine')
      : p.type === 'sensor' ? (p.kind === 'light' ? 'eyespot' : 'feeler') : p.type === 'rule' ? null : p.type === 'pad' ? (p.kind === 'partner' ? 'partner pad' : 'pad') : p.type;
    if (w) c[w] = (c[w] || 0) + 1;
  }
  return c;
}

// The board (what the page reads; no designs): ranked by growth since arrival over the last 7 nights (0 while extinct)
function board(st) {
  const rows = Object.values(st.species).filter((s) => s.status === 'living' || s.status === 'extinct').map((s) => {
    const last = s.nights.slice(-OCEAN.boardNights), now = s.nights[s.nights.length - 1] || {};
    const stay = s.stays[s.stays.length - 1];
    return { name: s.name, player: s.player, house: s.house, version: s.version, status: s.status,
      score: last.length ? r2(last.reduce((t, n) => t + n.growth, 0) / last.length) : 0,
      cells: now.cells || 0, share: now.share || 0, growth: now.growth || 0, kills: s.kills,
      nightsAlive: s.status === 'living' && stay ? st.night - stay.from + 1 : 0,
      returns: s.status === 'extinct' ? s.lastDied + OCEAN.returnAfter : null,
      extinctions: s.stays.filter((x) => x.why && x.why !== 'replaced').map((x) => ({ from: x.from, to: x.to, why: x.why })),
      size: `${Math.round(2 * s.design.body.radius)} × ${Math.round(2 * s.design.body.radius + (s.design.body.length || 0))} µm`, parts: partsOf(s.design) };
  }).sort((a, b) => b.score - a.score || b.share - a.share);
  rows.forEach((r, i) => { r.rank = i + 1; });
  // the picture: each species' share of the living biomass, night by night
  const bands = [];
  for (let n = 1; n <= st.night; n++) {
    const row = { night: n, s: {} };
    for (const s of Object.values(st.species)) { const x = s.nights.find((y) => y.night === n); if (x && x.share) row.s[s.name] = x.share; }
    bands.push(row);
  }
  const past = Object.values(st.species).filter((s) => s.status === 'replaced').map((s) => ({ name: s.name, player: s.player, replacedBy: s.replacedBy, nights: s.nights.filter((n) => n.cells).length, kills: s.kills }));
  return { night: st.night, updated: st.last ? st.last.at : st.created, rules: OCEAN, last: st.last || null, rows, bands, past };
}

function printBoard() {
  const b = board(loadSt());
  console.log(`The Ocean after night ${b.night}${b.last ? ` (${b.last.cells} cells)` : ''}:`);
  for (const r of b.rows) console.log(`${String(r.rank).padStart(3)}. ${r.name.padEnd(22)} ${(r.house ? 'house' : r.player).padEnd(12)} score ${r.score.toFixed(2).padStart(6)}  ${String(r.cells).padStart(3)} cells  ${String(Math.round(100 * r.share)).padStart(3)}% of biomass  ${r.kills} kills  ${r.status === 'living' ? `${r.nightsAlive} nights` : `extinct, back on night ${r.returns}`}${r.extinctions.length ? `  died out ${r.extinctions.length}× (${r.extinctions.map((x) => x.why).join('; ')})` : ''}`);
}

const [cmd, ...rest] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (cmd === 'found') found();
else if (cmd === 'release') release(rest[0], rest[1]);
else if (cmd === 'night') { const n = Number(rest[0] || 1); for (let i = 0; i < n; i++) runNight(); printBoard(); }
else if (cmd === 'board') { const st = loadSt(); writeFileSync(BOARD, JSON.stringify(board(st), null, 1)); printBoard(); }
else if (cmd === 'story') { const s = rebuildStory(); for (const [sp, rows] of Object.entries(s.species)) for (const r of rows) console.log(`night ${r.night} ${sp}: ${r.line} ${r.ms.map((m) => `[${m.text} @${m.t}]`).join(' ')}`); }
else console.log('node tools/ocean.mjs found | release <player> <design> | night [n] | board | story   [--dir= --seconds=]');
