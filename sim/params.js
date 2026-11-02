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
    wallThickness: 0.3,     // µm; the wall material's share of the body (plates: their own thickness, PARAMS.plates)
    maxInclusionFraction: 0.9, // inclusions may fill at most this share of the body (a diatom is mostly vacuole)
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
    plastidMax: 55,         // pJ/s per µm³ of plastid in full light...
    plastidHalf: 0.2,       // ...and half of that at this light
    // a shade plastid (phycobilins catch the green light that reaches deep): half its top at 1/5 of the light, a lower
    // top, and its upkeep this many times a sun plastid's (phycobilins are costly protein); it earns more below ~1 mm
    shade: { max: 33, half: 0.04, upkeep: 2.5, safe: 0.15, damage: 2 },
    // too much light (photoinhibition): light above `safe` damages a plastid (damage 0-1, faster the brighter; a shade
    // plastid has its own lower `safe` and is damaged `shade.damage` times faster), cutting its output in proportion;
    // it is repaired all the time (share of the damage per s), paying `cost` pJ per µm³ of plastid per whole damage
    // repaired; a starving cell can't repair
    photo: { safe: 0.4, damage: 0.06, repair: 0.04, cost: 200 },
    // beating costs (made playable: real flagella cost well under 1% of income, CLAUDE.md): pJ/s per µm of a beating
    // part (a motorised piece and the passive pieces hanging from it) at full beat speed, nothing while it rests;
    // on top of the motors' real work
    beat: 10,
    // resting (author, 2026-10-28: "like slowing the metabolism"): while the nucleus's REST rule holds, upkeep AND plastid
    // income run at this share; flagella stop and plastids aren't repaired (stores and buoyancy chambers keep working)
    rest: 0.4,
    pool: 60,               // pJ per µm³ of body the cytoplasm holds (about a minute of upkeep)
    start: 0.8,             // pool at birth, share of full
    fillAbove: 0.8,         // stores fill while the pool is above this share...
    burnBelow: 0.3,         // ...and are burned while it is below this
    starch: { energy: 6000, fill: 1 / 200, burn: 1 / 150 },   // pJ per µm³; share of a full store per s
    oil: { energy: 9000, fill: 1 / 600, burn: 1 / 600 },      // denser energy, light, but slow both ways
  },
  sensor: {
    threshold: 0.5,         // 'light' / 'dark' wiring splits here
    scatter: 0.2,           // share of the light an eyespot sees facing away (scattered light, and through its shield)
    hysteresis: 0.03,       // a wired part changes state only this far inside or outside its range (no flicker)...
    hysteresisShare: 0.3,   // ...but never more than this share of the room to the scale's end or of the range's width, so a
                            // small threshold ("more than 2% sun") still switches in dim water (Claude, 2026-11-01: it needed 5%)
    touchRange: 2,          // µm from a touch sensor's spot that counts as touching
    nearRange: 60,          // µm a proximity sensor feels another species from (default)
    compareMargin: 0.05,    // a compare condition holds once one reading is this much more than the other
  },
  // The buoyancy chamber (made playable): an ion vacuole pumped light, neutral or heavy by its rule (author, 2026-10-28)
  chamber: {
    neutral: 1025,          // kg/m³: seawater, no lift and no cost
    light: 500,             // FLOAT: far lighter than seawater (made playable, author 2026-10-29: at 900 a chamber had to
                            // be a third of the cell's volume; at 500 one about half the cell's width floats a typical cell)...
    heavy: 1100,            // ...SINK: heavier (to sink on purpose)
    rate: 25,               // kg/m³ per s it can change (neutral to light ~21 s, light to heavy ~24 s)
    holdLight: 0.5,         // pJ/s per µm³ held fully light (r 5.5: ~350 pJ/s, ~5% of income), in proportion on the way
    holdHeavy: 0.3,         // pJ/s per µm³ held fully heavy, the same
  },
  // The peduncle (step 1, author 2026-11-02): a feeding tube; latched on another species' body it drains energy (what the
  // prey releases into its pool) and nitrogen (its growth meter), keeping a fifth
  feed: {
    length: 20,             // µm by default (the Build panel's Length: 10-80; stretching later)
    radius: 0.6,            // µm, the tube's thickness
    mouth: 1.5,             // µm: its tip latches on a body this close
    rate: 20000,            // pJ/s it sucks at most (a typical cell spends ~5,000 to live)
    nitrogen: 50,           // N units/s it sucks at most from the prey's growth meter
    keep: 0.2,              // share of what it sucks the predator keeps (author, 2026-11-02: was 0.5; at half one rich
                            // kill paid 3+ divisions and one hunter wiped out three species; real food chains pass on ~10-30%)
    pierce: 2000,           // pJ per µm of tube each latch costs (20 µm: 40k; 80 µm: 160k; paid from the pool, it can't
                            // latch without it): a longer tube reaches past spines but costs more to use (author)
    hold: 40,               // pN the link holds before it snaps (as a kin pad)
    loadTime: 0.1,          // s the pull is averaged over before it snaps (a stroke's jerk doesn't count)
  },
  // Nitrogen (sim/nutrient.js): poor at the surface, rich deep, a nutricline between; with world.grow a field cells use up
  nutrient: {
    cline: 0.5,             // depth of the nutricline (share of the tank)
    width: 0.08,            // how sharp it is (share of the tank)
    surface: 0.06,          // the surface water's richness against the deep's (1)
    layers: 40,             // horizontal layers of the field (50 µm each)
    water: 600,             // N units the water holds per µm of the tank's height at richness 1 (a layer: 30,000)
    resupply: 600,          // s: a used-up layer eases back toward the usual profile on this time (a day)
    spread: 0.002,          // share per s a layer evens out with each neighbour
    every: 100,             // steps between mixings
  },
  // The armoured wall (author, 2026-11-02): cellulose thecal plates, body.wall 'plates', body.plates µm thick. A peduncle
  // pays its piercing price × (1 + pierce × thickness); each division builds the daughter's plates (energy by their
  // volume, no nitrogen: cellulose is carbon); heavy (MATERIALS.plates). They don't take room from the organelles.
  plates: {
    min: 0.25, max: 2,      // µm
    start: 0.5,             // µm, when Plates is first picked
    pierce: 2,              // the piercing price × (1 + 2 × thickness): ×3 at 1 µm, ×5 at 2 µm
    energy: 300,            // pJ per µm³ of plate each division needs (as PARAMS.grow.energy)
  },
  // Stolen plastids (kleptoplasty, author 2026-11-02; Dinophysis, Mesodinium): every `every` s a peduncle stays latched,
  // the prey's biggest plastid that fits in the thief moves through the tube (the prey lives on without it, and rebuilds
  // it from its growth meter before growing further); a prey drained to death gives up the rest that fit (round, at
  // their own size). They earn
  // and cost like its own but fade (no genes to keep them) and bright light damages them for good (never repaired);
  // at division they are shared out
  steal: {
    every: 30,              // s latched for each plastid taken from a living prey
    half: 600,              // s: a stolen plastid's output halves every sandbox day
    gone: 0.05,             // below this share of its output it is gone (its room freed)
    grid: 0.5,              // µm between the spots tried when placing one
    squeeze: 0.6,           // soft: it squeezes into a gap down to this share of its radius (keeping its volume and output)
  },
  // Growth and division (step 1, author 2026-11-01): a meter of two bars, energy and nitrogen; full, the cell divides.
  // Both cost in proportion to the cell's volume; nitrogen comes in through its surface, so smaller cells fill faster.
  grow: {
    energy: 300,            // pJ per µm³ of cell grown (doubling an r 10 cell: ~1.26 million, about a good design's wasted surplus)
    nitrogen: 1,            // N units per µm³ of cell
    // growing (author 2026-11-02): the design is the newborn; it grows `step` of its newborn volume at a time (the bars
    // bank up to a doubling's worth), up to `max` times it; organelles gain `organelles` of the cell's volume gain
    step: 0.1,
    max: 8,                 // twice its newborn width: there it stops growing (surplus to its stores)
    organelles: 0.5,        // beyond 2× organelles gain half the cell's growth (8×: organelles 5×): big cells earn less per
                            // µm³ (steal or divide); up to 2× they keep pace (author 2026-11-02)
    uptake: 0.0222,         // N units per µm² of surface per s at the most (r 10: its bar in ~300 s in the rich deep)...
    half: 1,                // ...half of that at this richness (so ~1/10 as fast at the surface)
    cap: 12,                // cells the sandbox tank holds (author 2026-11-02: lowered from 24, full physics is costly); at
                            // the cap a ready cell waits
    every: 100,             // steps between looks for cells ready to divide (and dead ones to remove)
    die: 60,                // s with an empty pool, in a row, before a cell dies (a tenth of a day)
    gone: 30,               // s a dead cell sinks before it is removed (sooner on the floor); its nitrogen goes back
  },
  // The nucleus, the brain box (sim/brain.js): each brain module takes a slot of its cross-section
  brain: {
    radius: 4.3,            // µm: one nucleus size for now (16 slots; author 2026-11-01: room to create in the sandbox); bigger later
    slotArea: 3.6,          // µm² of nucleus cross-section a slot (was 7, 8 slots; r 2 µm: 3 slots)
    upkeep: 1,              // pJ/s per µm³ of nucleus (as much as the body's own)
  },
  // Organelle outlines (sim/shape.js): a closed polygon round each one
  shape: {
    points: 48,             // corners round a round one (a cap of 24 at each end of a rod or a band)
    arcPieces: 24,          // straight pieces along a bent one's middle line
  },
  pads: {
    stiffness: 5,          // pN/µm, the spring of a stuck pad
    kinBreak: 40,           // pN a kin pad holds before it snaps
    mucusBreak: 4,          // pN a mucus pad holds
    maxChain: 32,           // hidden backstop: a new link may not make a group bigger than this
  },
};
