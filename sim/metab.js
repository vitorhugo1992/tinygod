// Metabolism v0: one currency, energy (pJ), kept in the cytoplasm's pool.
// - Income: plastids, by the light where they are, saturating in bright light ('shade' plastids, with phycobilins,
//   saturate in dim light: better deep, less at the top, dearer to keep).
// - Spending: upkeep (the body by its volume, segments by their length, plastids and stores by their size), and the
//   motors' and pumps' real power, sped up like every other flow (PARAMS.metab.speedup), so their small share is honest.
// - Stores, automatic: while the pool is fuller than fillAbove, surplus goes into starch (quick) then oil (slow);
//   while it is emptier than burnBelow, starch then oil are burned to refill it. A store's weight follows how full it
//   is: starch is heavy, oil light, so buoyancy changes as the cell eats and fasts.
// - Gas vesicles wear out and are rebuilt from the pool while it holds a little (gas.rebuildAbove; below where stores
//   are burned, so a night on starch keeps them): a starving cell slowly sinks.
// - Starving: an empty pool stops the motors (and pumps) until energy comes back.
// Numbers are round and tuned for play (CLAUDE.md), not measured.
import { PARAMS } from './params.js';
import { lightAt } from './light.js';

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
  for (const inc of body.inclusions) if (inc.store || ['plastid', 'gas', 'statolith'].includes(inc.material)) {
    add(inc.part, inc.v * M.insideUpkeep * (inc.material === 'plastid' && inc.pigment === 'shade' ? M.shade.upkeep : 1));
  }
  let upkeep = bodyUpkeep;
  for (const v of byPart.values()) upkeep += v;
  const C = body.volume * M.pool;
  cell.metab = {
    C, E: M.start * C, upkeep, bodyUpkeep, byPart,
    income: 0, motors: 0, pumps: 0, gasBuild: 0,          // the last step's flows, pJ/s (for the budget)
    lastMotor: cell.energy.motor, lastPump: cell.energy.pump,
    starving: false,
  };
}

// A store's full energy
const capacity = (inc) => inc.v * M[inc.store].energy;

export function metabolize(world, cell) {
  const m = cell.metab, body = cell.pieces[0];
  // income: each plastid by the light where it is
  let income = 0;
  for (const inc of body.inclusions) {
    if (inc.material !== 'plastid') continue;
    const y = cell.cy[0] + cell.sn[0] * inc.x + cell.cs[0] * inc.y;
    const L = lightAt(world, y);
    income += inc.pigment === 'shade' ? M.shade.max * inc.v * L / (L + M.shade.half) : M.plastidMax * inc.v * L / (L + M.plastidHalf);
  }
  // the motors' and pumps' real work since last step
  const motors = (cell.energy.motor - m.lastMotor) * REAL, pumps = (cell.energy.pump - m.lastPump) * REAL;
  m.lastMotor = cell.energy.motor; m.lastPump = cell.energy.pump;
  m.income = income; m.motors = motors / DT; m.pumps = pumps / DT;
  m.E += (income - m.upkeep) * DT - motors - pumps;

  // gas vesicles: protein that wears out and is rebuilt from the pool while it holds enough, so a fed cell keeps its
  // float and a starving one slowly loses it (fill: the share of the vesicles intact)
  m.gasBuild = 0;
  for (const inc of body.inclusions) {
    if (!inc.crush || inc.crushed) continue;
    inc.fill -= inc.fill * P.gas.wear * DT;
    if (m.E > P.gas.rebuildAbove * m.C && inc.fill < 1) {
      const add = Math.min(P.gas.rebuild * DT, 1 - inc.fill), cost = add * inc.v * P.gas.cost;
      if (cost < m.E) { m.E -= cost; inc.fill += add; m.gasBuild += cost / DT; }
    }
    inc.wpt.w = (inc.density - CYTO) * inc.v * inc.fill * G;
  }

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
  if (m.E > m.C) m.E = m.C;                 // a full pool wastes the rest (no store has room)
  m.starving = m.E <= 0;
  if (m.starving) {
    m.E = 0;
    for (const j of cell.joints) if (j.type === 'motor') j.on = false;   // no energy, no beating
    for (const inc of body.inclusions) if (inc.pumpable) inc.target = inc.density;   // pumps stop where they are
  }
}
