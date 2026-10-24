// All tunable numbers. Units: length µm, time s, force pN, density kg/m³, viscosity pN·s/µm² (= Pa·s × 1).
// The physics runs in real units; "made playable" happens in the viewer (display speed), not here.
export const PARAMS = {
  water: {
    density: 1025,          // seawater
    viscosity: 1.08e-3,     // seawater at ~20 °C, in pN·s/µm²
  },
  gravity: 9.81,            // m/s²
  tank: { w: 1600, h: 2000 },// still water, y up from the floor
  time: {
    dt: 1 / 1000,           // fixed physics step (s), midpoint method; motors up to ~50 Hz get >= 20 steps a beat
    subPerRelax: 16,        // a stiff spring gets sub-steps of at most 1/16 of its relaxation time
    stepsPerBeat: 20,       // a running motor gets at least this many sub-steps a beat (fast bursts need more)
    maxSub: 64,
  },
  cell: {
    cytoplasm: 1060,        // density of the living cell without wall or inclusions
    wallThickness: 0.3,     // µm; the wall material's share of the body
    maxInclusionFraction: 0.9, // inclusions may fill at most this share of the body (a diatom is mostly vacuole)
    pumpRate: 1,            // kg/m³ per s a sap vacuole's density can change (made playable: real cells take hours)
    pumpCost: 0.05,         // aJ per (kg/m³ × µm³) of density change pumped (placeholder until costs are designed)
  },
  drag: {
    minLogAspect: 2,        // ln(length/radius) floor for the slender-rod formulas, so stubby pieces stay sane
  },
  contact: {
    stiffness: 20,          // pN/µm, walls and floor (treated implicitly, so stiff is stable)
    cells: 20,              // pN/µm, cell against cell
  },
  light: {
    strength: 1,            // light from above, at the surface (relative)
    attenuation: 0.0015,    // per µm: the 2 mm tank's light is a water column squeezed (made playable): 5% at the floor
  },
  // Metabolism (made playable, numbers round and tuned for play, CLAUDE.md). Energy in pJ; flows per sandbox second.
  // A sandbox day lasts `day` seconds; every energy flow runs `speedup` times faster than real, together, so each
  // part's share of the budget stays honest while motion stays in real seconds.
  metab: {
    day: 600,               // s
    dawn: 0.06,             // a world starts this far into its day (just after sunrise)
    speedup: 144,           // real day / sandbox day: motors' and pumps' real power counts this many times
    bodyUpkeep: 1,          // pJ/s per µm³ of body
    partUpkeep: 5,          // pJ/s per µm of segment
    insideUpkeep: 0.2,      // pJ/s per µm³ of plastid, store, gas vesicles or statolith
    plastidMax: 50,         // pJ/s per µm³ of plastid in full light...
    plastidHalf: 0.2,       // ...and half of that at this light
    // a shade plastid (phycobilins catch the green light that reaches deep): half its top at 1/5 of the light, a lower
    // top, and its upkeep this many times a sun plastid's (phycobilins are costly protein); it earns more below ~1 mm
    shade: { max: 30, half: 0.04, upkeep: 2.5 },
    pool: 60,               // pJ per µm³ of body the cytoplasm holds (about a minute of upkeep)
    start: 0.8,             // pool at birth, share of full
    fillAbove: 0.8,         // stores fill while the pool is above this share...
    burnBelow: 0.3,         // ...and are burned while it is below this
    starch: { energy: 6000, fill: 1 / 200, burn: 1 / 150 },   // pJ per µm³; share of a full store per s
    oil: { energy: 9000, fill: 1 / 600, burn: 1 / 600 },      // denser energy, light, but slow both ways
  },
  sensor: {
    threshold: 0.5,         // 'light' / 'dark' wiring splits here
    hysteresis: 0.03,       // a wired part changes state only this far inside or outside its range (no flicker)
    touchRange: 2,          // µm from a touch sensor's spot that counts as touching
    nearRange: 60,          // µm a proximity sensor feels another species from (default)
    compareMargin: 0.05,    // a compare condition holds once one reading is this much more than the other
  },
  // Gas vesicles (made playable): stronger ones survive deeper but lift less (more protein per bubble)
  gas: {
    weak: 150,              // kg/m³ of the weakest vesicles (strength 0)...
    strong: 600,            // ...and of the strongest (strength 1)
    wear: 0.00116,          // per s: vesicles wear out, losing half their lift in about a sandbox day (600 s)...
    rebuild: 1 / 300,       // ...and are rebuilt (share of full per s) while the energy pool is above rebuildAbove,
    rebuildAbove: 0.1,      // (share of the pool; below metab.burnBelow, so stores burned at night keep them)
    cost: 400,              // pJ per µm³ of vesicles rebuilt (with metabolism on; off, they neither wear nor cost)
    shallowest: 0.45,       // the weakest are crushed this far down the tank (share of its depth; new cells start at 0.4); the
                            // strongest at the floor
  },
  // Nutrients (a fixed layer until step 1's ecology): poor at the surface, rich deep, a nutricline between
  nutrient: {
    cline: 0.5,             // depth of the nutricline (share of the tank)
    width: 0.08,            // how sharp it is (share of the tank)
  },
  pads: {
    stiffness: 5,           // pN/µm, the spring of a stuck pad
    kinBreak: 40,           // pN a kin pad holds before it snaps
    mucusBreak: 4,          // pN a mucus pad holds
    maxChain: 32,           // hidden backstop: a new link may not make a group bigger than this
  },
};
