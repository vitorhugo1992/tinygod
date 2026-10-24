// Starting designs for the sandbox and the checks. Plain JSON (see build.js for the format).
const spines = (r, n, length, material, start = 45) => Array.from({ length: n }, (_, i) => {
  const deg = start + i * 360 / n, t = deg * Math.PI / 180;
  return { type: 'segment', at: [r * Math.cos(t), r * Math.sin(t)], angle: deg, length, radius: 0.5, material };
});

export const PRESETS = {
  'Round cell': {
    note: 'A plain sphere: sinks at its Stokes speed.',
    body: { radius: 10 }, parts: [],
  },
  'Spiny cell': {
    note: 'Four protein spines: about three times slower sinking.',
    body: { radius: 10 }, parts: spines(10, 4, 40, 'protein'),
  },
  'Glass rod': {
    note: 'A long glass cell (like a pennate diatom). Start it tilted: it slides sideways as it sinks, never turns.',
    body: { radius: 4, length: 80, wall: 'glass' }, parts: [],
    start: { angle: 45 },
  },
  'Oil droplet': {
    note: 'An off-centre oil droplet: the cell turns its light side up.',
    body: { radius: 10 }, parts: [{ type: 'inclusion', at: [5, 0], radius: 4, material: 'oil' }],
  },
  'Stiff flapper': {
    note: 'A stiff tail flapping fast one way, slowly back. Goes nowhere: the scallop theorem.',
    body: { radius: 8 },
    parts: [{ type: 'segment', at: [-8, 0], angle: 180, length: 40, radius: 0.25,
      joint: { type: 'motor', rate: 20, swing: 45, stroke: 0.25 } }],
  },
  'Flexible oar': {
    note: 'The same flap with a springy joint halfway: the tail bends differently each way, so it swims. ' +
      'Too floppy or too stiff and it stops working.',
    body: { radius: 8 },
    parts: [
      { type: 'segment', id: 'base', at: [-8, 0], angle: 180, length: 15, radius: 0.25,
        joint: { type: 'motor', rate: 20, swing: 60, stroke: 0.25 } },
      { type: 'segment', parent: 'base', at: [7.5, 0], angle: 0, length: 25, radius: 0.25,
        joint: { type: 'hinge', stiffness: 700 } },
    ],
  },
  'Wave tail': {
    note: 'Six tail pieces beating one after another: a travelling wave, like a sperm tail.',
    body: { radius: 8 },
    parts: [0, 1, 2, 3, 4, 5].map((i) => ({
      type: 'segment', id: `t${i}`, parent: i ? `t${i - 1}` : 'body', at: i ? [4, 0] : [-8, 0],
      angle: i ? 0 : 180, length: 8, radius: 0.25,
      joint: { type: 'motor', rate: 30, swing: 35, phase: -i * 0.15 },
    })),
  },
  'Ejectisome': {
    note: 'A coiled ribbon, latched. Press Release: it shoots out (like a cryptophyte ejectisome) and the cell ' +
      'jumps the other way, a short hop: a thin ribbon gets little grip on the water.',
    body: { radius: 6 },
    parts: [{ type: 'segment', at: [-6, 0], angle: 180, length: 30, radius: 0.3,
      joint: { type: 'extend', stiffness: 20, latched: true } }],
  },
  'Sap vacuole': {
    note: 'A big cell that is mostly sap vacuole. Slide its target density: lighter than seawater (1025) and it ' +
      'rises, heavier and it sinks. Pumping takes time and costs energy.',
    body: { radius: 20 },
    parts: [{ type: 'inclusion', at: [0, 0], radius: 18.5, material: 'sap', density: 1025 }],
  },
  'Kin chain': {
    note: 'Kin pads at both ends. Drop copies and push them together with the mouse: pads of the same species ' +
      'stick, end to end. Pull hard and they snap.',
    body: { radius: 6, length: 10 },
    parts: [{ type: 'pad', at: [11, 0], kind: 'kin' }, { type: 'pad', at: [-11, 0], kind: 'kin' }],
  },
  'Mucus hitchhiker': {
    note: 'A swimmer with a mucus pad on its nose: it sticks to anything it bumps into, but only weakly.',
    body: { radius: 8 },
    parts: [{ type: 'pad', at: [8, 0], kind: 'mucus' }].concat([0, 1, 2, 3, 4, 5].map((i) => ({
      type: 'segment', id: `t${i}`, parent: i ? `t${i - 1}` : 'body', at: i ? [4, 0] : [-8, 0],
      angle: i ? 0 : 180, length: 8, radius: 0.25,
      joint: { type: 'motor', rate: 30, swing: 35, phase: -i * 0.15 },
    }))),
  },
  "Vesperella (Claude's species)": {
    note:
      "Claude's species, a daily migrator (built from the Build panel's parts, tested over three days). By " +
      "day it swims toward any light and rests just under the surface, its two plastids filling a starch " +
      "granule. At dusk its eyespot goes dark, the tail stops and the starch carries it down (~600 µm by " +
      "dawn), burned through the night; at first light it climbs back. Gas vesicles in front and starch " +
      "behind keep it upright; the front spine balances the tail's drag so a sinking cell doesn't tip over " +
      "like a shuttlecock (without it, it flips and never sees dawn).",
    species: 'Vesperella',
    body: { radius: 9 },
    parts: [
      { type: 'segment', id: 'tail_0', parent: 'body', at: [-9, 0], angle: 180, length: 8, radius: 0.25, material: 'protein', joint: { type: 'motor', rate: 30, swing: 35, phase: 0, controls: [{ sensor: 'eye', min: 0.05, max: 1 }, { sensor: 'energy', min: 0.2, max: 1 }] }, label: 'Wave tail', build: { tpl: 'Wave tail (swims)', where: 180, tilt: 0, size: 0.4, depth: 1, feels: 'strangers', flip: false, id: 'tail', length: 48 } },
      { type: 'segment', id: 'tail_1', parent: 'tail_0', at: [4, 0], angle: 0, length: 8, radius: 0.25, material: 'protein', joint: { type: 'motor', rate: 30, swing: 35, phase: -0.15, controls: [{ sensor: 'eye', min: 0.05, max: 1 }, { sensor: 'energy', min: 0.2, max: 1 }] } },
      { type: 'segment', id: 'tail_2', parent: 'tail_1', at: [4, 0], angle: 0, length: 8, radius: 0.25, material: 'protein', joint: { type: 'motor', rate: 30, swing: 35, phase: -0.3, controls: [{ sensor: 'eye', min: 0.05, max: 1 }, { sensor: 'energy', min: 0.2, max: 1 }] } },
      { type: 'segment', id: 'tail_3', parent: 'tail_2', at: [4, 0], angle: 0, length: 8, radius: 0.25, material: 'protein', joint: { type: 'motor', rate: 30, swing: 35, phase: -0.45, controls: [{ sensor: 'eye', min: 0.05, max: 1 }, { sensor: 'energy', min: 0.2, max: 1 }] } },
      { type: 'segment', id: 'tail_4', parent: 'tail_3', at: [4, 0], angle: 0, length: 8, radius: 0.25, material: 'protein', joint: { type: 'motor', rate: 30, swing: 35, phase: -0.6, controls: [{ sensor: 'eye', min: 0.05, max: 1 }, { sensor: 'energy', min: 0.2, max: 1 }] } },
      { type: 'segment', id: 'tail_5', parent: 'tail_4', at: [4, 0], angle: 0, length: 8, radius: 0.25, material: 'protein', joint: { type: 'motor', rate: 30, swing: 35, phase: -0.75, controls: [{ sensor: 'eye', min: 0.05, max: 1 }, { sensor: 'energy', min: 0.2, max: 1 }] } },
      { type: 'sensor', id: 'eye', label: 'Light sensor', at: [9, 0], angle: 0, kind: 'light', cone: 180, build: { tpl: 'Light sensor (eyespot)', where: 0, tilt: 0, size: 1, depth: 1, feels: 'strangers', flip: false, id: 'eye' } },
      { type: 'inclusion', id: 'plastid', label: 'Plastid', at: [0, 5.75], radius: 2.9, material: 'plastid', build: { tpl: 'Plastid (makes energy)', where: 90, tilt: 0, size: 0.35, depth: 1, feels: 'strangers', flip: false, id: 'plastid' } },
      { type: 'inclusion', id: 'plastid2', label: 'Plastid', at: [0, -5.75], radius: 2.9, material: 'plastid', build: { tpl: 'Plastid (makes energy)', where: 270, tilt: 0, size: 0.35, depth: 1, feels: 'strangers', flip: false, id: 'plastid2' } },
      { type: 'inclusion', id: 'starch', at: [-5.25, 0], radius: 3.4, label: 'Starch granule', material: 'starch', fill: 0.5, build: { tpl: 'Vacuole (store or float)', where: 180, tilt: 0, size: 0.4, depth: 1, feels: 'strangers', flip: false, id: 'starch', content: 'starch' } },
      { type: 'inclusion', id: 'gas', at: [5.05, 0], radius: 3.6, label: 'Gas vesicles', material: 'gas', strength: 1, build: { tpl: 'Vacuole (store or float)', where: 0, tilt: 0, size: 0.43, depth: 1, feels: 'strangers', flip: false, id: 'gas', content: 'gas', strength: 1 } },
      { type: 'segment', id: 'anchor', label: 'Protein spine', at: [9, 0], angle: 0, length: 60, radius: 0.5, material: 'protein', build: { tpl: 'Spine, protein', where: 0, tilt: 0, size: 0.6, depth: 1, feels: 'strangers', flip: false, id: 'anchor' } },
    ],
  },
};
