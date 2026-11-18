// Save and restore anything the simulation holds (a world, a match), exactly (2026-11-18; the Ocean's first piece:
// a world saved one night must run on the next as if it had never stopped). Not a list of fields: the whole object
// graph is walked, so a field added later is saved without touching this file. Kept bit for bit: shared objects stay
// shared (a cell's design, a link both cells point to), cycles, the order of Map and Set entries, typed arrays (as
// their bytes), -0, NaN, ±Infinity, undefined, holes, and the random stream (Rng's state). A function or an unknown
// class anywhere refuses to save, naming where it is, rather than silently losing it.
//   saveState(root) -> a JSON string · loadState(string) -> the root, rebuilt
import { Rng } from './rng.js';

const TYPED = { Float64Array, Float32Array, Int32Array, Uint32Array, Int16Array, Uint16Array, Int8Array, Uint8Array, Uint8ClampedArray };
const CLASSES = { Rng };   // classes kept with their prototype (their own fields saved as a plain object's)

const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => { const bin = atob(s), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; };

export function saveState(root) {
  const ids = new Map(), objs = [];
  // a value as JSON: plain strings, booleans, null and ordinary numbers as themselves; everything else a tagged array
  // (data arrays are objects with an id, so an array in a value's place is always a tag)
  function val(v, path) {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number') {
      if (Number.isNaN(v)) return ['n', 'NaN'];
      if (v === Infinity) return ['n', 'Inf'];
      if (v === -Infinity) return ['n', '-Inf'];
      if (v === 0 && 1 / v < 0) return ['n', '-0'];
      return v;
    }
    if (v === undefined) return ['u'];
    if (typeof v === 'bigint') return ['b', v.toString()];
    if (typeof v === 'function' || typeof v === 'symbol') throw new Error(`saveState: a ${typeof v} at ${path}`);
    return ['r', ref(v, path)];
  }
  function ref(o, path) {
    if (ids.has(o)) return ids.get(o);
    const id = objs.length; ids.set(o, id); objs.push(null);
    let rec;
    const proto = Object.getPrototypeOf(o);
    if (Array.isArray(o)) {
      const items = new Array(o.length);
      for (let i = 0; i < o.length; i++) items[i] = i in o ? val(o[i], `${path}[${i}]`) : ['h'];
      rec = { t: 'a', i: items };
      const extra = Object.keys(o).filter((k) => !/^\d+$/.test(k));   // named fields on an array
      if (extra.length) rec.p = Object.fromEntries(extra.map((k) => [k, val(o[k], `${path}.${k}`)]));
    } else if (ArrayBuffer.isView(o)) {
      const name = o.constructor.name;
      if (!TYPED[name]) throw new Error(`saveState: a ${name} at ${path}`);
      if (o.byteOffset !== 0 || o.byteLength !== o.buffer.byteLength) throw new Error(`saveState: a ${name} sharing its buffer at ${path}`);
      rec = { t: name, d: b64(new Uint8Array(o.buffer)) };
    } else if (o instanceof Map) {
      let k = 0; rec = { t: 'm', e: [...o].map(([a, b]) => [val(a, `${path}<key ${k}>`), val(b, `${path}<${k++}>`)]) };
    } else if (o instanceof Set) {
      let k = 0; rec = { t: 's', e: [...o].map((a) => val(a, `${path}{${k++}}`)) };
    } else {
      let t = 'o';
      if (proto !== Object.prototype && proto !== null) {
        t = Object.keys(CLASSES).find((n) => CLASSES[n].prototype === proto);
        if (!t) throw new Error(`saveState: an object of class ${proto.constructor && proto.constructor.name} at ${path}`);
      }
      const p = {};
      for (const k of Object.keys(o)) p[k] = val(o[k], `${path}.${k}`);
      rec = { t, p };
      if (proto === null) rec.np = 1;
    }
    objs[id] = rec;
    return id;
  }
  const r = val(root, 'root');
  return JSON.stringify({ tinygod: 'state', v: 1, root: r, objs });
}

export function loadState(text) {
  const S = typeof text === 'string' ? JSON.parse(text) : text;
  if (S.tinygod !== 'state' || S.v !== 1) throw new Error('loadState: not a saved TinyGod state (v1)');
  const objs = S.objs;
  // first make every object empty (so references can point anywhere), then fill them
  const made = objs.map((r) => {
    if (r.t === 'a') return new Array(r.i.length);
    if (r.t === 'm') return new Map();
    if (r.t === 's') return new Set();
    if (r.t === 'o') return r.np ? Object.create(null) : {};
    if (TYPED[r.t]) { const u8 = unb64(r.d); return new TYPED[r.t](u8.buffer); }
    if (CLASSES[r.t]) return Object.create(CLASSES[r.t].prototype);
    throw new Error(`loadState: unknown kind ${r.t}`);
  });
  const val = (v) => {
    if (!Array.isArray(v)) return v;
    switch (v[0]) {
      case 'r': return made[v[1]];
      case 'u': return undefined;
      case 'b': return BigInt(v[1]);
      case 'n': return v[1] === 'NaN' ? NaN : v[1] === 'Inf' ? Infinity : v[1] === '-Inf' ? -Infinity : -0;
      default: throw new Error(`loadState: unknown tag ${v[0]}`);
    }
  };
  objs.forEach((r, id) => {
    const o = made[id];
    if (r.t === 'a') { r.i.forEach((v, i) => { if (!(Array.isArray(v) && v[0] === 'h')) o[i] = val(v); }); if (r.p) for (const k in r.p) o[k] = val(r.p[k]); }
    else if (r.t === 'm') for (const [a, b] of r.e) o.set(val(a), val(b));
    else if (r.t === 's') for (const a of r.e) o.add(val(a));
    else if (r.p) for (const k of Object.keys(r.p)) o[k] = val(r.p[k]);
  });
  return val(S.root);
}
