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
};
