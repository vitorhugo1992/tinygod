// Metabolism v0: one currency, energy (pJ), kept in the cytoplasm's pool.
// - Income: plastids, by the light where they are, saturating in bright light ('shade' plastids, with phycobilins,
//   saturate in dim light: better deep, less at the top, dearer to keep). Too much light damages a plastid
//   (photoinhibition): its output falls with its damage, and repairing it, all the time, costs energy (a shade plastid
//   is hurt sooner and faster). Starving, it can't be repaired.
// - Spending: upkeep (the body by its volume, segments by their length, plastids and stores by their size), and the
//   motors' and pumps' real power, sped up like every other flow (PARAMS.metab.speedup), and beating itself, by each
//   running flagellum's length and beat speed (made playable: real beating is nearly free; this makes resting pay).
// - Stores, automatic: while the pool is fuller than fillAbove, surplus goes into starch (quick) then oil (slow);
//   while it is emptier than burnBelow, starch then oil are burned to refill it. A store's weight follows how full it
//   is: starch is heavy, oil light, so buoyancy changes as the cell eats and fasts.
// - A buoyancy chamber costs nothing while neutral (seawater's density) and, held light or heavy, energy every second in
//   proportion to its size and how far it is from neutral (PARAMS.chamber.holdLight / holdHeavy); a starving cell can't hold it: neutral.
// - Starving: an empty pool stops the motors (and pumps) until energy comes back.
// - Growth (world.grow, step 1): a meter of two bars. Nitrogen comes in through the cell's surface by the water's
//   nitrogen where it is (saturating; slowed while resting, none while starving) and is taken from the water; energy is
//   what is left above fillAbove once the stores have taken their share (the surplus that was wasted). Both bars cost
//   in proportion to the cell's volume (PARAMS.grow); full, the cell is ready to divide.
// - Feeding (a peduncle latched on another species, interact.js): it sucks the prey's pool (which the prey refills from
//   its own stores at their burn speed) and its growth meter's nitrogen, up to PARAMS.feed.rate and .nitrogen; the
//   predator keeps PARAMS.feed.keep of it. From a dead prey it sucks the stores directly; nothing left, it lets go.
// Numbers are round and tuned for play (CLAUDE.md), not measured.
import { PARAMS } from './params.js';
import { lightAt } from './light.js';
import { nitrogenAt, takeNitrogen } from './nutrient.js';

const M = PARAMS.metab, P = PARAMS, DT = PARAMS.time.dt, CYTO = PARAMS.cell.cytoplasm;
const G = PARAMS.gravity * 1e-6;
const REAL = 1e-6 * M.speedup;   // aJ of real motor or pump work -> pJ of sandbox energy

// Once per cell: its upkeep (total and by design part, for the budget), its pool size, a starting pool
export function initMetab(cell) {
  const body = cell.pieces[0];
  const byPart = new Map();
  const add = (k, v) => byPart.set(k, (byPart.get(k) || 0) + v);
  const bodyUpkeep = body.volume * M.bodyUpkeep;
  for (const p of cell.pieces) if (p.kind === 'segment') add(p.part, (p.ext ? p.ext.max : p.L) * M.partUpkeep);
  for (const inc of body.inclusions) if (inc.store || ['plastid', 'chamber', 'statolith'].includes(inc.material)) {
    add(inc.part, inc.v * M.insideUpkeep * (inc.material === 'plastid' && inc.pigment === 'shade' ? M.shade.upkeep : 1));
  } else if (inc.material === 'nucleus') add(inc.part, inc.v * P.brain.upkeep);
  let upkeep = bodyUpkeep;
  for (const v of byPart.values()) upkeep += v;
  for (const inc of body.inclusions) if (inc.material === 'plastid') inc.damage = 0;
  // each beating motor's length: its own piece and the passive pieces hanging from it (a flexible oar's blade)
  const driver = (i) => {   // the beating motor that moves piece i, or -1
    for (let k = i; k > 0; k = cell.pieces[k].parent) {
      const jt = cell.joints[cell.pieces[k].joint];
      if (!jt) continue;   // fixed to its parent: look further up
      if (jt.type === 'motor') return jt.burst ? -1 : cell.pieces[k].joint;
      if (jt.type !== 'hinge') return -1;
    }
    return -1;
  };
  const beatL = new Map();
  for (let i = 1; i < cell.pieces.length; i++) {
    const d = driver(i);
    if (d >= 0) beatL.set(d, (beatL.get(d) || 0) + cell.pieces[i].L);
  }
  const C = body.volume * M.pool;
  cell.metab = {
    C, E: M.start * C, upkeep, bodyUpkeep, byPart, beatL,
    income: 0, motors: 0, pumps: 0, chamber: 0, repair: 0,   // the last step's flows, pJ/s (for the budget)
    lastMotor: cell.energy.motor, lastPump: cell.energy.pump,
    starving: false,
  };
  // the growth meter (used with world.grow): what a division needs, and what the cell has gathered toward it
  cell.grow = { E: 0, N: 0, Eneed: body.volume * P.grow.energy, Nneed: body.volume * P.grow.nitrogen, uptake: 0 };
}

// A store's full energy
const capacity = (inc) => inc.v * M[inc.store].energy;

// One step of a peduncle's drain: returns the energy the predator keeps (pJ)
function feed(world, cell, l) {
  const F = P.feed, prey = world.cells[l.b], pm = prey.metab, most = F.rate * DT;
  let e = Math.min(most, pm.E);
  pm.E -= e;
  if (prey.dead) for (const inc of prey.pieces[0].inclusions) {   // rotting: straight from its stores
    if (!inc.store || inc.fill <= 0 || e >= most) continue;
    const cap = capacity(inc), more = Math.min(most - e, inc.fill * cap);
    inc.fill -= more / cap; e += more;
    inc.wpt.w = (inc.density - CYTO) * inc.v * inc.fill * G;
  }
  let n = 0;
  if (prey.grow) { n = Math.min(F.nitrogen * DT, prey.grow.N); prey.grow.N -= n; }
  l.took += e; l.tookN += n;
  if (cell.grow) cell.grow.N = Math.min(cell.grow.Nneed, cell.grow.N + n * F.keep);
  prey.drainedBy = { species: cell.species, step: world.steps };
  if (prey.dead && e === 0 && n === 0) l.done = true;   // nothing left
  cell.metab.E += e * F.keep;
  return e * F.keep;
}

export function metabolize(world, cell) {
  const m = cell.metab, body = cell.pieces[0];
  if (cell.dead) {   // nothing earned or spent; still, and its chambers drift neutral (sim/death.js removes it)
    m.E = 0; m.starving = true; m.income = m.motors = m.pumps = m.repair = m.chamber = 0; cell.resting = false;
    for (const j of cell.joints) if (j.type === 'motor') j.on = false;
    for (const inc of body.inclusions) if (inc.pumpable) inc.target = P.chamber.neutral;
    return;
  }
  // resting: flagella stop, plastids earn less and aren't repaired, upkeep falls (PARAMS.metab.rest)
  const slow = cell.resting ? M.rest : 1;
  if (cell.resting) for (const j of cell.joints) if (j.type === 'motor' && !j.burst) j.on = false;
  // income: each plastid by the light where it is, less its damage; too much light damages it, repair costs energy
  let income = 0, repair = 0;
  for (const inc of body.inclusions) {
    if (inc.material !== 'plastid') continue;
    const y = cell.cy[0] + cell.sn[0] * inc.x + cell.cs[0] * inc.y;
    const L = lightAt(world, y), shade = inc.pigment === 'shade';
    income += slow * (1 - inc.damage) * (shade ? M.shade.max * inc.v * L / (L + M.shade.half) : M.plastidMax * inc.v * L / (L + M.plastidHalf));
    const over = L - (shade ? M.shade.safe : M.photo.safe);
    if (over > 0) inc.damage += M.photo.damage * (shade ? M.shade.damage : 1) * over * (1 - inc.damage) * DT;
    if (!m.starving && !cell.resting && inc.damage > 0) {
      const fixed = M.photo.repair * inc.damage * DT;
      inc.damage -= fixed; repair += fixed * inc.v * M.photo.cost;
    }
  }
  // the motors' and pumps' real work since last step, and what beating costs (each running motor's length, by its speed)
  let beat = 0;
  if (!m.starving) for (const [j, L] of m.beatL) { const jt = cell.joints[j]; if (jt.on) beat += M.beat * L * jt.gain; }
  const motors = (cell.energy.motor - m.lastMotor) * REAL + beat * DT, pumps = (cell.energy.pump - m.lastPump) * REAL;
  m.lastMotor = cell.energy.motor; m.lastPump = cell.energy.pump;
  m.income = income; m.motors = motors / DT; m.pumps = pumps / DT; m.repair = repair / DT;
  // buoyancy chambers held away from neutral
  let hold = 0;
  for (const inc of body.inclusions) if (inc.material === 'chamber') {
    const C = P.chamber, dn = inc.density - C.neutral;
    hold += inc.v * (dn < 0 ? C.holdLight * dn / (C.light - C.neutral) : C.holdHeavy * dn / (C.heavy - C.neutral));
  }
  m.chamber = hold;
  m.E += (income - m.upkeep * slow - hold) * DT - motors - pumps - repair;
  m.feeding = 0;
  for (const f of cell.feeders) if (f.link) m.feeding += feed(world, cell, f.link) / DT;

  // stores: surplus in (starch first: it is quick), shortfall out (starch first, then oil)
  const stores = body.inclusions.filter((x) => x.store).sort((a, b) => (a.store === 'starch' ? 0 : 1) - (b.store === 'starch' ? 0 : 1));
  for (const inc of stores) {
    const cap = capacity(inc), S = M[inc.store];
    if (m.E > M.fillAbove * m.C && inc.fill < 1) {
      const move = Math.min(m.E - M.fillAbove * m.C, S.fill * cap * DT, (1 - inc.fill) * cap);
      m.E -= move; inc.fill += move / cap;
    } else if (m.E < M.burnBelow * m.C && inc.fill > 0) {
      const move = Math.min(M.burnBelow * m.C - m.E, S.burn * cap * DT, inc.fill * cap);
      m.E += move; inc.fill -= move / cap;
    }
    if (inc.fill < 0) inc.fill = 0; else if (inc.fill > 1) inc.fill = 1;   // rounding
    inc.wpt.w = (inc.density - CYTO) * inc.v * inc.fill * G;   // weight follows what it holds
  }
  // growth: nitrogen through the surface, and the surplus the stores didn't take
  if (world.grow) {
    const g = cell.grow, R = P.grow;
    g.uptake = 0;
    if (!m.starving && g.N < g.Nneed) {
      const n = nitrogenAt(world, cell.q[1]);
      const want = Math.min(slow * R.uptake * body.area * n / (n + R.half) * DT, g.Nneed - g.N);
      const got = takeNitrogen(world, cell.q[1], want);
      g.N += got; g.uptake = got / DT;
    }
    if (m.E > M.fillAbove * m.C && g.E < g.Eneed) {
      const move = Math.min(m.E - M.fillAbove * m.C, g.Eneed - g.E);
      m.E -= move; g.E += move;
    }
  }
  if (m.E > m.C) m.E = m.C;                 // a full pool wastes the rest (no store has room)
  m.starving = m.E <= 0;
  if (world.grow) {   // starving too long, it dies
    cell.starveT = m.starving ? (cell.starveT || 0) + DT : 0;
    if (cell.starveT >= P.grow.die) {
      cell.dead = true; cell.diedAt = world.steps;
      const d = cell.drainedBy;   // fed on lately: killed by a predator
      cell.diedWhy = d && (world.steps - d.step) * DT < P.grow.die ? `drained by a ${d.species}` : 'starved';
    }
  }
  if (m.starving) {
    m.E = 0;
    for (const j of cell.joints) if (j.type === 'motor') j.on = false;   // no energy, no beating
    for (const inc of body.inclusions) if (inc.pumpable) inc.target = P.chamber.neutral;   // nothing holds it: it drifts neutral
  }
}
