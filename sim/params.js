// All tunable numbers. Units: length µm, time s, force pN, density kg/m³, viscosity pN·s/µm² (= Pa·s × 1).
// The physics runs in real units; "made playable" happens in the viewer (display speed), not here.
export const PARAMS = {
  water: {
    density: 1025,          // seawater
    viscosity: 1.08e-3,     // seawater at ~20 °C, in pN·s/µm²
  },
  gravity: 9.81,            // m/s²
  tank: { w: 600, h: 2000 },// still water, y up from the floor
  time: { dt: 1 / 2000 },   // fixed physics step (s); motors up to ~100 Hz get >= 20 steps a beat
  cell: {
    cytoplasm: 1060,        // density of the living cell without wall or inclusions
    wallThickness: 0.3,     // µm; the wall material's share of the body
    maxInclusionFraction: 0.9, // inclusions may fill at most this share of the body (a diatom is mostly vacuole)
  },
  drag: {
    minLogAspect: 2,        // ln(length/radius) floor for the slender-rod formulas, so stubby pieces stay sane
  },
  contact: {
    stiffness: 20,          // pN/µm, walls and floor (treated implicitly, so stiff is stable)
  },
};
