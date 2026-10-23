// The tank and what lives in it. Still water in v0: cells feel gravity, drag, the walls and the floor.
import { PARAMS } from './params.js';
import { Rng } from './rng.js';
import { DEG } from './dmath.js';
import { buildCell } from './build.js';
import { stepCell, updatePose } from './physics.js';

export function makeWorld(seed = 1) {
  return { seed, steps: 0, rng: new Rng(seed), cells: [] };
}

// Drop a design into the tank at (x, y) µm (y up from the floor), turned by `angle` degrees
export function addCell(world, design, x, y, angle = 0) {
  const cell = buildCell(design);
  cell.q[0] = x; cell.q[1] = y; cell.q[2] = angle * DEG;
  updatePose(cell);
  world.cells.push(cell);
  return cell;
}

export function stepWorld(world) {
  for (const cell of world.cells) stepCell(cell);
  world.steps++;
}

export const worldTime = (world) => world.steps * PARAMS.time.dt;
