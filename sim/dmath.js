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

// (2026-11-19, the live Ocean: Edge 157 and Node 24 were found to differ in Math.cbrt, sin, cos, atan2, exp and log, so
// a browser drifted from the nightly run within 5 sim seconds; these replace every such call in sim/.)
export const dhypot = (x, y) => Math.sqrt(x * x + y * y);

// Cube root: a first guess from the exponent's bits (integer arithmetic), then Newton's method
const F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);
export function dcbrt(x) {
  if (x === 0 || x !== x || x === Infinity || x === -Infinity) return x;
  const neg = x < 0;
  if (neg) x = -x;
  F64[0] = x;
  U32[1] = Math.floor(U32[1] / 3) + 715094163; U32[0] = 0;   // ~5% off (fdlibm's trick)
  let y = F64[0];
  for (let i = 0; i < 6; i++) y -= (y * y * y - x) / (3 * y * y);
  return neg ? -y : y;
}

// Arctangent ported from fdlibm (s_atan.c): argument reduction and a polynomial, arithmetic only (~1 ulp)
const ATANHI = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00];
const ATANLO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const AT = [3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01,
  9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02,
  4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02];
export function datan(x) {
  if (x !== x) return x;
  const neg = x < 0;
  if (neg) x = -x;
  let id = -1;
  if (x >= 0.4375) {
    if (x < 1.1875) { if (x < 0.6875) { id = 0; x = (2 * x - 1) / (2 + x); } else { id = 1; x = (x - 1) / (x + 1); } }
    else if (x < 2.4375) { id = 2; x = (x - 1.5) / (1 + 1.5 * x); }
    else { id = 3; x = -1 / x; }
  }
  const z = x * x, w = z * z;
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  const r = id < 0 ? x - x * (s1 + s2) : ATANHI[id] - ((x * (s1 + s2) - ATANLO[id]) - x);
  return neg ? -r : r;
}
export function datan2(y, x) {
  if (x !== x || y !== y) return NaN;
  const yPos = y > 0 || (y === 0 && 1 / y > 0);
  if (x === 0) return y === 0 ? (1 / x > 0 ? y : yPos ? Math.PI : -Math.PI) : yPos ? Math.PI / 2 : -Math.PI / 2;
  const a = datan(y / x);
  if (x > 0) return a;
  return yPos ? a + Math.PI : a - Math.PI;
}

// Standard normal approximation from four uniforms (Irwin-Hall): arithmetic only.
export function gauss(rng) {
  return (rng.next() + rng.next() + rng.next() + rng.next() - 2) * SQRT3;
}
