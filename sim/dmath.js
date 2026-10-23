// The simulation uses only + - * / and sqrt, which every JS engine computes bit-identically.
// Math.exp/log/sin/cos/pow may differ between engines, so the same seed would grow different worlds (from MONAD).
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const SQRT3 = Math.sqrt(3);

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function dexp(x) {
  let k = 0;
  while (x > 0.5 || x < -0.5) { x *= 0.5; k++; }
  let term = 1, sum = 1;
  for (let i = 1; i <= 12; i++) {
    term = term * x / i;
    sum += term;
    if (term < 1e-17 && term > -1e-17) break;   // the rest no longer changes the sum (the same on every engine)
  }
  while (k-- > 0) sum *= sum;
  return sum;
}

// Natural log from dexp alone (Halley's iteration); for build-time constants, not the hot loop
export function dlog(x) {
  let y = 0;
  for (let i = 0; i < 40; i++) { const e = dexp(y); y += 2 * (x - e) / (x + e); }
  return y;
}

// Sine from arithmetic only (Taylor series on [-pi/2, pi/2]); error below 1e-7.
export function dsin(x) {
  x -= TAU * Math.floor(x / TAU + 0.5);
  if (x > Math.PI / 2) x = Math.PI - x;
  else if (x < -Math.PI / 2) x = -Math.PI - x;
  const x2 = x * x;
  return x * (1 - x2 / 6 * (1 - x2 / 20 * (1 - x2 / 42 * (1 - x2 / 72 * (1 - x2 / 110)))));
}

export const dcos = (x) => dsin(x + Math.PI / 2);

// Standard normal approximation from four uniforms (Irwin-Hall): arithmetic only.
export function gauss(rng) {
  return (rng.next() + rng.next() + rng.next() + rng.next() - 2) * SQRT3;
}
