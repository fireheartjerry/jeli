/**
 * The quarry rock on the cover: a small body built from a seed.
 *
 * An icosphere is pushed in and out along its radius by layered noise (broad
 * lumps, then ridges), dented by craters with raised rims, and cut by an
 * open pit: three overlapping digs, each stepping down in benches the way a
 * surface mine does. The result is squashed, because 16 Psyche is far from
 * round: its shortest axis is roughly two thirds of its longest.
 *
 * Everything is generated once, from the same seed as the rest of the cover,
 * so it is the same rock on every visit. Building it takes tens of
 * milliseconds, so it is done in slices: `rockBuilder` returns a function to
 * call with a time budget until it hands back the rock.
 *
 * With `mine` off the same recipe makes a plain boulder, with no pit and no
 * lamps: the stragglers the camera passes on its way out.
 */
import { mulberry32 } from "../worldline";

export interface Rock {
  /** Interleaved per vertex: position xyz, normal xyz, height above the mean sphere, depth into the pit 0..1. */
  vertices: Float32Array;
  indices: Uint32Array;
  /** The pit: unit direction of its centre in the rock's own frame, and where cargo lifts off from. */
  pit: [number, number, number];
  pad: [number, number, number];
  /** Four floodlights standing in the pit, xyz each. */
  masts: Float32Array;
  /** Lamps on the surface: xyz in the rock's frame, kind (0 work lamp, 1 beacon), phase. */
  lamps: Float32Array;
}

export const AXES: [number, number, number] = [1, 0.84, 0.66];
const PIT_REACH = 0.62; // radians from the pit's centre: nothing is dug beyond this
const PIT_DEPTH = 0.21;

type V3 = [number, number, number];
const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const angle = (a: V3, b: V3) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));

export function rockBuilder(seed: number, level = 5, mine = true): (budget: number) => Rock | null {
  const rnd = mulberry32(seed ^ 0x9e3779b9);
  const salt = (rnd() * 0xffffffff) | 0;

  // ---- lattice noise, seeded ----
  const hash = (x: number, y: number, z: number) => {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177) + salt) | 0;
    h = Math.imul(h ^ (h >>> 13), 1103515245);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const fade = (t: number) => t * t * (3 - 2 * t);
  const noise = (x: number, y: number, z: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    return lerp(
      lerp(lerp(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), lerp(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
      lerp(lerp(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), lerp(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v),
      w,
    );
  };
  const fbm = (x: number, y: number, z: number, octaves: number) => {
    let s = 0, a = 0.5, f = 1;
    for (let k = 0; k < octaves; k++) {
      s += a * noise(x * f + 11.3 * k, y * f - 7.1 * k, z * f + 3.7 * k);
      a *= 0.5;
      f *= 2.03;
    }
    return s;
  };

  // ---- craters and the pit ----
  const dir = (): V3 => {
    const z = rnd() * 2 - 1, t = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    return [r * Math.cos(t), r * Math.sin(t), z];
  };
  // The pit is cut into the rock's broad face.
  const pit = norm([0.3, 0.42, 0.86]);
  const e1 = norm([pit[1], -pit[0], 0]);
  const e2: V3 = [pit[1] * e1[2] - pit[2] * e1[1], pit[2] * e1[0] - pit[0] * e1[2], pit[0] * e1[1] - pit[1] * e1[0]];
  /** The direction `t` radians from the pit's centre, at bearing `ang` round it. */
  const around = (ang: number, t: number): V3 => {
    const ca = Math.cos(t), sa = Math.sin(t), cx = Math.cos(ang), sx = Math.sin(ang);
    return norm([pit[0] * ca + (e1[0] * cx + e2[0] * sx) * sa, pit[1] * ca + (e1[1] * cx + e2[1] * sx) * sa, pit[2] * ca + (e1[2] * cx + e2[2] * sx) * sa]);
  };
  // Three digs that run into one another: where they overlap, the deeper one wins.
  const digs = [
    { c: around(0.6, 0.07), rho: 0.4, depth: PIT_DEPTH, benches: 4 },
    { c: around(3.5, 0.27), rho: 0.3, depth: 0.14, benches: 3 },
    { c: around(1.9, 0.33), rho: 0.21, depth: 0.09, benches: 2 },
  ];
  const craters: { c: V3; rho: number; depth: number }[] = [];
  for (let i = 0; i < 34; i++) {
    const c = dir();
    const rho = 0.06 + 0.44 * rnd() ** 2.6;
    const depth = rho * (0.17 + 0.13 * rnd());
    // Keep craters off the pit so its benches stay clean.
    if (!mine || angle(c, pit) > PIT_REACH + rho * 0.9) craters.push({ c, rho, depth });
  }

  /** Height above the mean sphere along unit direction d, and how deep into the pit that is (0 outside, 1 on the floor). */
  const shape = (d: V3): [number, number] => {
    let h = 0.3 * (fbm(d[0] * 1.2, d[1] * 1.2, d[2] * 1.2, 4) - 0.47);
    h += 0.085 * (1 - Math.abs(2 * fbm(d[0] * 2.9 + 5, d[1] * 2.9, d[2] * 2.9 - 2, 3) - 0.94));
    h += 0.03 * (fbm(d[0] * 8, d[1] * 8, d[2] * 8, 3) - 0.5);
    for (const k of craters) {
      const t = angle(d, k.c) / k.rho;
      if (t > 1.7) continue;
      if (t < 1) h -= k.depth * (1 - t * t) ** 1.4;
      h += 0.26 * k.depth * Math.exp(-(((t - 1) / 0.17) ** 2));
    }
    if (!mine || angle(d, pit) > PIT_REACH) return [h, 0];
    // No dig is a true circle: each one's edge wanders in and out.
    const wander = 1 + 0.3 * (fbm(d[0] * 3.3 + 7, d[1] * 3.3 + 1, d[2] * 3.3 - 4, 3) - 0.5);
    let dug = 0, edge = 9;
    for (const k of digs) {
      const t = angle(d, k.c) / (k.rho * wander);
      edge = Math.min(edge, t);
      if (t >= 1) continue;
      // Benches: flat steps with short steep faces between them.
      const f = (1 - t) * k.benches, i = Math.floor(f);
      dug = Math.max(dug, (k.depth * (i + fade(Math.min(1, (f - i) / 0.28)))) / k.benches);
    }
    if (dug === 0) return [h + 0.022 * Math.exp(-(((edge - 1) / 0.1) ** 2)), 0]; // spoil heaped round the rim
    return [h * (1 - Math.min(1, (dug / PIT_DEPTH) * 3)) - dug, dug / PIT_DEPTH];
  };
  const place = (d: V3, lift: number): V3 => {
    const r = 1 + shape(d)[0] + lift;
    return [d[0] * r * AXES[0], d[1] * r * AXES[1], d[2] * r * AXES[2]];
  };

  // ---- icosphere ----
  const T = (1 + Math.sqrt(5)) / 2;
  let verts: V3[] = (
    [[-1, T, 0], [1, T, 0], [-1, -T, 0], [1, -T, 0], [0, -1, T], [0, 1, T], [0, -1, -T], [0, 1, -T], [T, 0, -1], [T, 0, 1], [-T, 0, -1], [-T, 0, 1]] as V3[]
  ).map(norm);
  let faces = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  const subdivide = () => {
    const mid = new Map<number, number>();
    const between = (a: number, b: number) => {
      const key = a < b ? a * 1048576 + b : b * 1048576 + a;
      let m = mid.get(key);
      if (m === undefined) {
        m = verts.length;
        verts.push(norm([verts[a][0] + verts[b][0], verts[a][1] + verts[b][1], verts[a][2] + verts[b][2]]));
        mid.set(key, m);
      }
      return m;
    };
    const next: number[] = [];
    for (let i = 0; i < faces.length; i += 3) {
      const a = faces[i], b = faces[i + 1], c = faces[i + 2];
      const ab = between(a, b), bc = between(b, c), ca = between(c, a);
      next.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
    }
    faces = next;
  };

  let stage = 0; // subdivisions done, then the displacement, then the rest
  let at = 0;
  let out = new Float32Array(0);
  return (budget) => {
    const until = performance.now() + budget;
    while (stage < level) {
      subdivide();
      stage++;
      if (performance.now() > until) return null;
    }
    if (!out.length) out = new Float32Array(verts.length * 8);
    for (const n = verts.length; at < n; at++) {
      if ((at & 255) === 255 && performance.now() > until) return null;
      const d = verts[at];
      const [h, inPit] = shape(d);
      const r = 1 + h;
      out[at * 8] = d[0] * r * AXES[0];
      out[at * 8 + 1] = d[1] * r * AXES[1];
      out[at * 8 + 2] = d[2] * r * AXES[2];
      out[at * 8 + 6] = h;
      out[at * 8 + 7] = inPit;
    }

    // Normals: every face adds its own, weighted by its area, to its three corners.
    for (let i = 0; i < faces.length; i += 3) {
      const a = faces[i] * 8, b = faces[i + 1] * 8, c = faces[i + 2] * 8;
      const ux = out[b] - out[a], uy = out[b + 1] - out[a + 1], uz = out[b + 2] - out[a + 2];
      const vx = out[c] - out[a], vy = out[c + 1] - out[a + 1], vz = out[c + 2] - out[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const k of [a, b, c]) {
        out[k + 3] += nx;
        out[k + 4] += ny;
        out[k + 5] += nz;
      }
    }
    for (let i = 0; i < verts.length; i++) {
      const k = i * 8 + 3, l = Math.hypot(out[k], out[k + 1], out[k + 2]) || 1;
      out[k] /= l;
      out[k + 1] /= l;
      out[k + 2] /= l;
    }

    // Lamps: work lights scattered over the benches and along the rim, and beacons out on the rock.
    const lamps: number[] = [];
    for (let i = 0; mine && i < 400 && lamps.length < 52 * 5; i++) {
      const d = around(rnd() * Math.PI * 2, PIT_REACH * Math.sqrt(rnd()));
      // Anywhere in the digs, or just outside their lip.
      const inward = norm([d[0] * 0.93 + pit[0] * 0.07, d[1] * 0.93 + pit[1] * 0.07, d[2] * 0.93 + pit[2] * 0.07]);
      if (shape(d)[1] > 0 || shape(inward)[1] > 0) lamps.push(...place(d, 0.014), 0, rnd());
    }
    for (let i = 0; mine && i < 9; i++) {
      let d = dir();
      while (angle(d, pit) < PIT_REACH * 1.15) d = dir();
      lamps.push(...place(d, 0.03), 1, rnd());
    }
    // Floodlights: one over the deepest dig, the rest out on the benches.
    const masts = new Float32Array(12);
    [digs[0].c, around(3.6, 0.3), around(1.8, 0.36), around(5.3, 0.3)].forEach((d, i) => masts.set(place(d, i ? 0.11 : 0.15), i * 3));

    return { vertices: out, indices: new Uint32Array(faces), pit, pad: place(digs[0].c, 0.06), masts, lamps: new Float32Array(lamps) };
  };
}
