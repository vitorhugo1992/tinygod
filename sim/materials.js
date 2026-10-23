// What a piece is made of. Densities in kg/m³ (seawater 1025).
// v0 has four; chalk, mucus, sugar and gas come later (CLAUDE.md).
export const MATERIALS = {
  protein: { density: 1100, label: 'protein', note: 'flexible, cheap: thecal plates, flagella' },
  glass:   { density: 2000, label: 'glass',   note: 'stiff and heavy: hydrated biogenic opal' },
  sap:     { density: 1025, min: 1005, max: 1040, label: 'sap', note: 'ion vacuole: pumpable lighter or heavier than seawater' },
  oil:     { density: 920,  label: 'oil',     note: 'light: lipid droplets' },
};

export function material(name) {
  const m = MATERIALS[name];
  if (!m) throw new Error(`unknown material: ${name}`);
  return m;
}
