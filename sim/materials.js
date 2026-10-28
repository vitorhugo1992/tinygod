// What a piece is made of. Densities in kg/m³ (seawater 1025).
// Chalk and mucus come later (CLAUDE.md). Oil and starch are energy stores (metab.js); a plastid makes energy; a
// statolith is a sensor (sense.js); gas vesicles' density comes from their strength (PARAMS.gas).
export const MATERIALS = {
  protein: { density: 1100, label: 'protein', note: 'flexible, cheap: thecal plates, flagella' },
  glass:   { density: 2000, label: 'glass',   note: 'stiff and heavy: hydrated biogenic opal' },
  sap:     { density: 1025, min: 1005, max: 1040, label: 'sap', note: 'ion vacuole: pumpable lighter or heavier than seawater' },
  oil:     { density: 920,  label: 'oil',     note: 'light: lipid droplets; an energy store, compact and slow', store: 'oil' },
  starch:  { density: 1500, label: 'starch',  note: 'heavy: starch or chrysolaminarin; an energy store, quick', store: 'starch' },
  plastid: { density: 1100, label: 'plastid', note: 'a chloroplast: makes energy from light' },
  statolith: { density: 1400, label: 'statolith', note: 'a chamber with a loose mineral grain that rolls to the lower wall (like Loxodes): it reads which way is down' },
  nucleus: { density: 1100, label: 'nucleus', note: 'the brain box: DNA and protein, a little denser than the cytoplasm' },
  gas:     { density: 300,  label: 'gas vesicles', note: 'gas-filled protein shells: very light, crushed for good below a depth (cyanobacteria)', gas: true },
};

export function material(name) {
  const m = MATERIALS[name];
  if (!m) throw new Error(`unknown material: ${name}`);
  return m;
}
