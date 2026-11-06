// All tunable numbers. Units: length µm, time s, force pN, density kg/m³, viscosity pN·s/µm² (= Pa·s × 1).
// The physics runs in real units; "made playable" happens in the viewer (display speed), not here.
export const PARAMS = {
  water: {
    density: 1025,          // seawater
    viscosity: 1.08e-3,     // seawater at ~20 °C, in pN·s/µm²
  },
  gravity: 9.81,            // m/s²
  tank: { w: 1600, h: 2000 },// y up from the floor
  // Moving water (author, 2026-11-03: "how to do it in a contained tank is crucial"; sim/flow.js): the tank's water turns
  // in slow loops side by side (convection rolls), rising in one column, crossing at the top, sinking in the next, back
  // along the floor; never through a wall. Two loops and three loops are blended, the blend turning over `shift` s, so
  // the loops' edges wander and no cell circles one path forever. Stronger at night (the surface cools and sinks), calm
  // by day. Each piece's drag is against the water, so drifters ride it, swimmers fight it, and the loops' curl turns cells.
  flow: {
    night: 10,              // µm/s: the fastest the water moves at night
    day: 2,                 // µm/s: by day (in between at dawn and dusk, with the light)
    shift: 1800,            // s: the loops' blend turns over in this time (three sandbox days)
    // The stirred bottom (author, 2026-11-03: "sometimes the bottom doesn't stir, sometimes it does"): now and then the
    // water near the floor is stirred and lifts what lies there; light, slow-sinking cells are carried up, heavy ones stay.
    stir: {
      lift: 20,             // µm/s: the stirred water rises this fast at the floor at its strongest
      layer: 300,           // µm: thinning to nothing this high above the floor
      every: 200,           // s: one chance of a stirring spell in each stretch this long (a third of a day)
      chance: 0.4,          // of a stretch having one (from the world's seed: same seed, same spells)
      patch: 0.5,           // stronger in some places along the floor than others, by this share (it turns the cells)
    },
    mix: 4,                 // nitrogen layers even out up to 1 + this many times faster, as the water moves (night mixing)
  },
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
    attenuation: 0.0015,    // per µm: the 2 mm tank's light is a water column squeezed (made playable)
    // a darker floor (balance, author 2026-11-05: every design ended on the floor, the upper water unused): the bottom
    // `murkBand` µm dim faster by `murk` per µm more (murky water by the sediment): noon light at the floor 2% (was 5%);
    // a shade plastid earns there about a third of its best (was two thirds); above the band nothing changes
    murkBand: 300,
    murk: 0.003,
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
    oil: { energy: 9000, fill: 1 / 400, burn: 1 / 300 },      // denser energy, light, slower both ways (author 2026-11-02:
                                                              // was 1/600 each; then oil lost to starch every night)
  },
  sensor: {
    threshold: 0.5,         // 'light' / 'dark' wiring splits here
    scatter: 0.2,           // share of the light an eyespot sees facing away (scattered light, and through its shield)
    hysteresis: 0.03,       // a wired part changes state only this far inside or outside its range (no flicker)...
    hysteresisShare: 0.3,   // ...but never more than this share of the room to the scale's end or of the range's width, so a
                            // small threshold ("more than 2% sun") still switches in dim water (Claude, 2026-11-01: it needed 5%)
    touchRange: 2,          // µm from a touch sensor's spot that counts as touching
    nearRange: 60,          // µm a proximity sensor feels another species from (default)
    // A feeler set to feel moving water (author, 2026-11-03; real cells feel shear through stretch-sensitive channels): it
    // reads how rough the water is where it sits plus the wakes of cells moving through the water near it (any species:
    // it is only water moving; a cell carried along by a current makes no wake). 0 still, 1 very rough.
    flowCurl: 0.25,         // rad/s of the water's turning that reads 1 (loops at night up to ~0.04, a stirring spell ~0.08:
                            // rough water reads up to ~0.3, so a cell passing close still stands out)
    flowWake: 6,            // µm/s through the water of a cell touching the feeler that reads 1; fading to 0 at its range
    flowSmooth: 0.5,        // s: a cell's speed for its wake is averaged over this (not its beat-by-beat bounce)
    compareMargin: 0.05,    // a compare condition holds once one reading is this much more than the other
  },
  // The buoyancy chamber (made playable): an ion vacuole pumped light, neutral or heavy by its rule (author, 2026-10-28)
  chamber: {
    neutral: 1025,          // kg/m³: seawater, no lift and no cost
    // balance (author, 2026-11-03, from the AI tournament: every AI built a chamber drifter, none swam): less lift and slow
    // pumping, so a drifter can't hold a depth precisely (real buoyancy regulation takes hours) and a swimmer's precision pays
    light: 800,             // FLOAT: lighter than seawater (was 500, 2026-10-29 to 11-03; 900 before that)...
    heavy: 1100,            // ...SINK: heavier (to sink on purpose)
    rate: 2.5,              // kg/m³ per s it can change (neutral to light ~90 s, about 3.5 game hours; light to heavy 120 s; was 25)
    holdLight: 0.25,        // pJ/s per µm³ held fully light, in proportion on the way (was 0.5 at light 500: the same cost per pN of lift)
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
    drill: 2000,            // pJ/s a latched tube spends drilling through plates (2026-11-05, the author's parked
                            // "drilling"): what plates add to the piercing price is paid as a flow, from the pool above
                            // burnBelow only (never the night's stores); it drains nothing until through; letting go
                            // loses the progress. Unplated prey: as before (the price at once)
  },
  // Nitrogen (sim/nutrient.js): poor at the surface, rich deep, a nutricline between; with world.grow a field cells use up
  nutrient: {
    // balance (author, 2026-11-03, from the AI tournament): the nutricline deeper, so no depth is good for both light and
    // nitrogen (at 1 mm the light at noon is 22%, at 1.4 mm 12%): moving between them pays (was 0.5)
    cline: 0.7,             // depth of the nutricline (share of the tank: ~1,400 µm)
    width: 0.08,            // how sharp it is (share of the tank)
    surface: 0.06,          // the surface water's richness against the deep's (1)
    layers: 40,             // horizontal layers of the field (50 µm each)...
    columns: 16,            // ...and columns across it (100 µm each)
    water: 600,             // N units the water holds per µm of the tank's height at richness 1 (a layer: 30,000)
    resupply: 600,          // s: a used-up layer eases back toward the usual profile on this time (a day)
    fade: 1800,             // s: a square richer than the profile (recycled nitrogen: sloppy feeding, the dead rotting where
                            // they die) eases back on this slower time (3 days), so recycling feeds the water where life is
    spread: 0.002,          // share per s a layer evens out with each neighbour above and below...
    spreadX: 0.002,         // ...and each column with its neighbours across
    // patches (balance, author 2026-11-03: nothing was worth moving sideways for): the water's richness varies across the
    // tank, `count` rich patches `width` µm wide (a Gaussian) on a `base` share of the mean, each wandering across
    // `reach` of the tank over about `wander` s (each a little slower than the last); mean richness across stays 1
    patches: { count: 2, width: 150, base: 0.3, wander: 1800, reach: 0.7 },
    every: 100,             // steps between mixings
  },
  // The armoured wall (author, 2026-11-02): cellulose thecal plates, body.wall 'plates', body.plates µm thick. A peduncle
  // pays its piercing price × (1 + pierce × thickness); each division builds the daughter's plates (energy by their
  // volume, no nitrogen: cellulose is carbon); heavy (MATERIALS.plates). They don't take room from the organelles.
  plates: {
    min: 0.25, max: 2,      // µm (max: the most any cell may carry; bigger cells more, see maxShare)
    maxShare: 0.1,          // ... a cell may carry up to this share of its radius (author, 2026-11-04: thick walls for giants;
                            // a radius-50 giant up to 5 µm), never less than max
    harpoon: 2,             // a harpoon's wound ÷ (1 + 2 × thickness) (author, 2026-11-04: plates soften harpoons too):
                            // ÷3 at 1 µm, ÷5 at 2 µm, ÷11 at 5 µm; the stun stays (the blow still lands)
    start: 0.5,             // µm, when Plates is first picked
    pierce: 2,              // the piercing price × (1 + 2 × thickness): ×3 at 1 µm, ×5 at 2 µm
    energy: 300,            // pJ per µm³ of plate each division needs (as PARAMS.grow.energy)
  },
  // The alarm (author 2026-11-02, swarm defence): a cell being drained leaks a cue (like wounded diatoms' oxylipins); kin
  // within `range` read it, 1 touching to 0 at the range; it fades over `fade` s once the attack stops
  alarm: {
    range: 60,              // µm between the bodies' surfaces
    fade: 3,                // s
  },
  // Kamikaze (author 2026-11-02, swarm defence): a toxin sac's rule "Bursts when…" kills the cell and poisons other
  // species within `range` µm (surface to surface): per µm³ of sac, at contact, `energy` pJ lost (pool, then stores) and
  // plastid damage of `damage` × the sac's share of the victim's volume; both fall to nothing at the range; kin immune.
  // The sac costs upkeep and `nitrogen` N per µm³ at each doubling (toxins are nitrogen-rich)
  toxin: {
    range: 30,
    energy: 5000,           // a sac 5% of an r 10 cell (~210 µm³) at contact: ~1 million pJ
    damage: 10,             // ... and half the plastid health of a same-size victim
    nitrogen: 2,
    // Kind Leak (author, 2026-11-03; sim/toxin.js): released into the water while its rule holds (no rule: always)
    leak: {
      rate: 1,              // toxin units a second per µm³ of sac (a r 4 sac: ~270 a second)
      energy: 3.7,          // pJ a unit (that sac: ~1,000 pJ/s, ~10% of a good day's income)
      nitrogen: 0.0087,     // N a unit (that sac, leaking all the time: ~a third of an r 10 division's nitrogen a day)
      cell: 40,             // µm: the cloud's grid squares
      every: 100,           // steps between the clouds' drift, spread and fading (0.1 s)
      spread: 20,           // µm²/s: how fast a cloud spreads to neighbouring squares
      half: 60,             // s for a cloud to fade by half (~2.4 sandbox hours)
      harm: 0.001,          // pJ/s lost per unit of cloud per µm² of the victim's surface (a lone leaker 20 µm away
                            // from an r 10 cell: ~a quarter of its income)
      damage: 5e-6,         // plastid damage a second per unit of cloud (repair evens it at ~25% in a lone leaker's cloud)
      felt: 1,              // below this a cloud does nothing
      full: 5000,           // the Poisoned reading is 1 at this much cloud
      gone: 1,              // a cloud with less than this in all is dropped
    },
  },
  // Engulfing (author 2026-11-02): a Mouth on the rim swallows another species' cell touching it whole, if the prey's body
  // is at most `gape` of the predator's width and its volume fits in the predator's free cytoplasm (room for the meal);
  // the prey leaves the tank and is digested over `time` s (drawn shrinking
  // inside), the predator keeping `keep` of its energy and `keepN` of its nitrogen; it can't swallow while digesting
  engulf: {
    gape: 0.5,              // prey radius at most this share of the predator's
    reach: 2,               // µm from the mouth to the prey's body
    time: 60,               // s to digest a meal
    keep: 0.2,              // share of the prey's energy kept (as the peduncle's)
    keepN: 0.5,             // share of its nitrogen kept
    upkeep: 100,            // pJ/s per mouth (author, 2026-11-03: a mouth costs; as much as 20 µm of an outside part)
  },
  // The harpoon (author, 2026-11-03; Polykrikos, Nematodinium): a spine set to fire shoots a dart straight out along
  // itself, blind (author: it must not "know magically where the enemy is"); the spine IS the dart: thrown, it is gone
  // and grows back over `reload` (author). The first thing in its line takes it: any cell's body, kin too (the wound is
  // mechanical, author), is stunned (its flagella, springs, tubes, mouths and harpoons stop: a hunter lets go) and loses
  // energy; a spine or a flagellum catches the dart harmlessly. A miss wastes the shot.
  harpoon: {
    range: 40,              // µm the dart flies past the spine's tip
    cost: 3000,             // pJ per µm of spine, each shot (regrowing it; the pool must hold it): 20 µm, 60k (author:
                            // "make it costly, as it can severely damage bigger predators")
    reload: 150,            // s to grow the spine back (a quarter of a day; author: "needs considerable time"); it can't fire until it has
    // the wound (author: "a smaller cell will hurt more or die, but a larger cell will also suffer damage"): a fixed
    // part, heavy for a small or hungry cell, and a share of all it holds, felt by a big fed one; more than it holds kills it
    venom: 400000,          // pJ every wound takes (an r 10 swimmer late at night holds ~500k)
    wound: 0.1,             // plus this share of all its energy (pool and stores)
    stun: 8,                // s it stays stunned
  },
  // The tether (author, 2026-11-04: "a whip that latches on the prey", "reels in and out as a way to maintain distance or
  // shorten as wished", and released by choice): a spine of Kind Tether is fired blind like a harpoon (FIRES when…), but
  // its dart stays on a line: it sticks to whatever it hits (a body, spine or flagellum, kin too), no wound, no stun. The
  // line is a rope: slack until pulled tight, then a spring; REELS IN when… / LETS OUT when… (reeling in wins; neither:
  // it holds its length); LETS GO when…; it also lets go when either cell dies, and snaps under a sustained pull. A miss
  // or a release winds the dart back for reload.
  tether: {
    range: 40,              // µm the dart flies past the spine's tip (as the harpoon)
    cost: 1000,             // pJ per µm of spine, each shot (a third of a harpoon's: the dart isn't lost)
    reload: 20,             // s to wind the dart back after a miss or a release
    hold: 40,               // pN the line holds, its pull averaged over loadTime (a kin pad's strength; a mucus pad's ×10)
    loadTime: 0.1,          // s (a swimming stroke's jerk doesn't snap it; a jump or a strong swimmer does)
    stiffness: 5,           // pN/µm once the line is tight (as a pad)
    reel: 10,               // µm/s it reels in or lets out
    max: 100,               // µm: the longest the line can be let out
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
    share: 0.05,            // share of the difference in fullness (energy pool, nitrogen bar) kin joined by pads even out a second
    shield: [1, 0.85, 0.75],   // a body's drag with 0, 1, 2+ kin joined by pads (author: chains of swimmers swim faster;
                               // not real fluid dynamics, the shape of it; passive chains sink a bit faster too)
    attract: 15,            // µm: a free kin pad gently pulls a free kin pad of its species this close (author 2026-11-02)
    pull: 3,                // pN of that pull (drifting cells come together; a swimmer passing by isn't caught)
    grace: 1,               // s a chain's links can't snap after a daughter slots in (contact pushes the cells apart)
    maxChain: 32,           // hidden backstop: a new link may not make a group bigger than this
    // a chain holds at most this much cell volume (author 2026-11-02: "8 max or more depending on the size"): 8 cells
    // of r 10 µm; smaller cells make longer chains (up to maxChain), bigger ones shorter (never fewer than 2 cells)
    chainVolume: 8 * 4 / 3 * Math.PI * 1000,
  },
};
