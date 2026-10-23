// The tank and what lives in it. Still water in v0: cells feel gravity, drag, the walls, the floor and each other.
import { PARAMS } from './params.js';
import { Rng } from './rng.js';
import { DEG } from './dmath.js';
import { buildCell } from './build.js';
import { stepCell, updatePose, motorAngle, planSubsteps } from './physics.js';
import { interact } from './interact.js';

// gravity: false switches weight and buoyancy off, to watch swimming alone
export function makeWorld(seed = 1, { gravity = true } = {}) {
  return { seed, steps: 0, gravity, rng: new Rng(seed), cells: [], links: [] };
}

// Drop a design into the tank at (x, y) µm (y up from the floor), turned by `angle` degrees
export function addCell(world, design, x, y, angle = 0) {
  const cell = buildCell(design);
  cell.q[0] = x; cell.q[1] = y; cell.q[2] = angle * DEG;
  const t = worldTime(world);
  cell.joints.forEach((j, i) => {
    if (j.type === 'motor') cell.q[3 + i] = motorAngle(j, t);
    if (j.type === 'extend') cell.q[3 + i] = j.start;
  });
  planSubsteps(cell);
  updatePose(cell);
  world.cells.push(cell);
  return cell;
}

export function stepWorld(world) {
  const t = worldTime(world);
  for (const cell of world.cells) updatePose(cell);
  if (world.cells.length > 1) interact(world);
  for (const cell of world.cells) stepCell(cell, t, world.gravity);
  world.steps++;
}

export const worldTime = (world) => world.steps * PARAMS.time.dt;
