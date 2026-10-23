// What a piece is made of. Densities in kg/m³ (seawater 1025).
// Chalk, mucus and gas come later (CLAUDE.md). Oil and starch are energy stores (metab.js); a plastid makes energy.
export const MATERIALS = {
  protein: { density: 1100, label: 'protein', note: 'flexible, cheap: thecal plates, flagella' },
  glass:   { density: 2000, label: 'glass',   note: 'stiff and heavy: hydrated biogenic opal' },
  sap:     { density: 1025, min: 1005, max: 1040, label: 'sap', note: 'ion vacuole: pumpable lighter or heavier than seawater' },
  oil:     { density: 920,  label: 'oil',     note: 'light: lipid droplets; an energy store, compact and slow', store: 'oil' },
  starch:  { density: 1500, label: 'starch',  note: 'heavy: starch or chrysolaminarin; an energy store, quick', store: 'starch' },
  plastid: { density: 1100, label: 'plastid', note: 'a chloroplast: makes energy from light' },
};

export function material(name) {
  const m = MATERIALS[name];
  if (!m) throw new Error(`unknown material: ${name}`);
  return m;
}
