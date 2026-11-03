// The tank and what lives in it. Still water in v0: cells feel gravity, drag, the walls, the floor and each other.
import { PARAMS } from './params.js';
import { Rng } from './rng.js';
import { DEG } from './dmath.js';
import { buildCell } from './build.js';
import { stepCell, updatePose, motorAngle, planSubsteps } from './physics.js';
import { interact } from './interact.js';
import { sense } from './sense.js';
import { initMetab, metabolize, shareChains } from './metab.js';
import { stepToxins } from './toxin.js';
import { initNitrogen, mixNitrogen } from './nutrient.js';
import { divideCells } from './divide.js';
import { growCells } from './grow.js';
import { removeDead } from './death.js';
import { flowState } from './flow.js';

// gravity: false switches weight and buoyancy off, to watch swimming alone; light: false turns the light off;
// day: the sun rises and sets (off: always noon); metab: cells earn and spend energy, stores fill and empty;
// grow (step 1, needs metab): a nitrogen field cells use up, and a growth meter (energy and nitrogen) in every cell;
// flow: the water moves in slow loops (sim/flow.js)
export function makeWorld(seed = 1, { gravity = true, light = true, day = false, metab = false, grow = false, flow = false } = {}) {
  const w = { seed, steps: 0, gravity, light, day, metab, grow: grow && metab, flow, rng: new Rng(seed), cells: [], links: [] };
  if (w.grow) initNitrogen(w);
  return w;
}

// Drop a design into the tank at (x, y) µm (y up from the floor), turned by `angle` degrees
export function addCell(world, design, x, y, angle = 0) {
  const cell = buildCell(design);
  cell.size = 1;   // newborn (grow.js)
  cell.q[0] = x; cell.q[1] = y; cell.q[2] = angle * DEG;
  cell.joints.forEach((j, i) => {
    if (j.type === 'motor') cell.q[3 + i] = motorAngle(j, 0);
    if (j.type === 'extend') cell.q[3 + i] = j.start;
  });
  planSubsteps(cell);
  initMetab(cell);
  updatePose(cell);
  cell.uid = world.nextUid = (world.nextUid || 0) + 1;
  world.cells.push(cell);
  return cell;
}

export function stepWorld(world) {
  const t = worldTime(world);
  world.flowNow = flowState(world);
  for (const cell of world.cells) updatePose(cell);
  for (const cell of world.cells) sense(world, cell);   // after every pose is current: sensors look at others
  if (world.metab) { for (const cell of world.cells) metabolize(world, cell); shareChains(world); stepToxins(world); }   // after sensing: starving overrides wiring
  if (world.grow) { mixNitrogen(world); growCells(world); divideCells(world); }
  if (world.grow || world.cells.some((c) => c.eatenBy)) removeDead(world);
  if (world.cells.length > 1) interact(world); else if (world.cells.length) { world.cells[0].shield = 1; world.cells[0].neighbours = 0; }   // alone: nobody shields it
  for (const cell of world.cells) stepCell(cell, t, world.gravity, world.flowNow);
  world.steps++;
}

export const worldTime = (world) => world.steps * PARAMS.time.dt;
