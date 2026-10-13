/**
 * The cover figure: the Roche potential of the binary drawn as a landscape.
 *
 * In the frame that turns with the two stars, a parcel of gas feels
 *   Φ(x, y) = -m_d/r_d - m_a/r_a - (x² + y²)/2
 * (separation, total mass and orbital rate all 1; centre of mass at the
 * origin; donor at x = -m_a, accretor at x = +m_d). Height here is Φ: each
 * star sits in a well, the wells meet at the saddle L1, and the ground falls
 * away at the rim where the centrifugal term wins. A donor that fills its
 * Roche lobe is a basin filled exactly to the level of that pass, so the
 * surface is flat across it and anything more spills into the other well.
 *
 * The scene is sampled along rows of constant depth and drawn with a floating
 * horizon, nearest row first, so no line shows through the ground in front
 * of it. The same code draws the live canvas and the static fallback image.
 */
import { masses, aBallistic, roche } from "./binary";

export const R = 1.74; // radius of the patch of ground drawn, in separations
export const EL = 0.78; // camera elevation above the orbital plane, radians
export const HS = 0.56; // height drawn per unit of potential
const Z0 = -1.42; // reference level, about the height of L4 and L5
const KNEE = 0.2; // wells are true to scale down to this far below the pass,
const DEPTH = 0.4; // then ease to a floor this much further down, so the disc stays in view

export interface Field {
  f: number;
  md: number;
  ma: number;
  /** Separation in units of the initial one (the ballistic result). */
  a: number;
  x1: number;
  x2: number;
  l1: number;
  /** Φ at L1: the level the donor is filled to. */
  crit: number;
  /** The accretor's lobe outline, for the dashed rim around its well. */
  lobe: [number, number][];
}

export function field(f: number): Field {
  const { md, ma } = masses(f);
  const x1 = -ma, x2 = md;
  const g = roche(md, ma);
  const crit = -md / (g.l1 - x1) - ma / (x2 - g.l1) - (g.l1 * g.l1) / 2;
  return { f, md, ma, a: aBallistic(f), x1, x2, l1: g.l1, crit, lobe: g.accretor() };
}

export const phi = (F: Field, x: number, y: number) =>
  -F.md / Math.hypot(x - F.x1, y) - F.ma / Math.hypot(x - F.x2, y) - (x * x + y * y) / 2;

/** Is this point inside the donor's lobe, i.e. under the surface of the star? */
export const inDonor = (F: Field, x: number, y: number, p: number) =>
  p < F.crit && x < F.l1 && Math.hypot(x - F.x1, y) < (F.l1 - F.x1) * 1.04;

/** Height of the drawn surface for potential p, relative to the reference level. */
export function shape(F: Field, p: number) {
  const knee = F.crit - KNEE;
  if (p < knee) p = knee - DEPTH * (1 - Math.exp((p - knee) / DEPTH));
  return p - Z0;
}

/** Height at a point, with the donor's basin filled to the pass. */
export function height(F: Field, x: number, y: number) {
  const p = phi(F, x, y);
  return shape(F, inDonor(F, x, y, p) ? F.crit : p);
}

export interface View {
  /** Screen position of the centre of mass, and pixels per separation. */
  cx: number;
  cy: number;
  s: number;
  rows: number;
  cols: number;
}

export interface Frame {
  view: View;
  /** Screen y of every sample, row-major. */
  sy: Float32Array;
  /** 0 off the patch, 1 ground, 2 the donor's surface. */
  kind: Uint8Array;
  /** 1 where the sample is not hidden by ground in front of it. */
  vis: Uint8Array;
  /** The horizon after each row: lowest screen y seen so far in that column. */
  hz: Float32Array;
}

export function makeFrame(view: View): Frame {
  const n = view.rows * view.cols;
  return { view, sy: new Float32Array(n), kind: new Uint8Array(n), vis: new Uint8Array(n), hz: new Float32Array(n) };
}

const SIN = Math.sin(EL), COS = Math.cos(EL);

/** Screen x of a column; columns are evenly spaced so every row shares them. */
export const colX = (v: View, F: Field, i: number) => v.cx + v.s * F.a * (-R + (2 * R * i) / (v.cols - 1));

/** Project a point of the co-rotating frame, turned by theta, with height h. */
export function project(v: View, F: Field, theta: number, x: number, y: number, h: number, out: Float32Array) {
  const c = Math.cos(theta), s = Math.sin(theta);
  const xr = x * c - y * s, yr = x * s + y * c;
  out[0] = v.cx + v.s * F.a * xr;
  out[1] = v.cy - v.s * (F.a * yr * SIN + (HS * COS * h) / F.a);
  // Fractional column and row, for looking up the horizon in front of the point.
  out[2] = ((xr + R) / (2 * R)) * (v.cols - 1);
  out[3] = ((yr + R) / (2 * R)) * (v.rows - 1);
}

/** Sample the surface for one orientation and resolve what is hidden. */
export function scan(fr: Frame, F: Field, theta: number) {
  const { rows, cols, cy, s } = fr.view;
  const c = Math.cos(theta), sn = Math.sin(theta);
  const R2 = R * R;
  for (let j = 0; j < rows; j++) {
    const yr = -R + (2 * R * j) / (rows - 1);
    const base = cy - s * F.a * yr * SIN;
    const row = j * cols, prev = row - cols;
    for (let i = 0; i < cols; i++) {
      const k = row + i;
      const xr = -R + (2 * R * i) / (cols - 1);
      const before = j ? fr.hz[prev + i] : Infinity;
      if (xr * xr + yr * yr > R2) {
        fr.kind[k] = 0;
        fr.vis[k] = 0;
        fr.hz[k] = before;
        continue;
      }
      // Back into the frame that turns with the stars.
      const x = xr * c + yr * sn, y = -xr * sn + yr * c;
      const p = phi(F, x, y);
      const star = inDonor(F, x, y, p);
      const y2 = base - (s * HS * COS * shape(F, star ? F.crit : p)) / F.a;
      fr.kind[k] = star ? 2 : 1;
      fr.sy[k] = y2;
      const seen = y2 < before;
      fr.vis[k] = seen ? 1 : 0;
      fr.hz[k] = seen ? y2 : before;
    }
  }
}

/** Is a projected point (from `project`) in front of the ground between it and the camera? */
export function visible(fr: Frame, pt: Float32Array, slack = 1.5) {
  const { rows, cols } = fr.view;
  const i = Math.round(pt[2]), j = Math.floor(pt[3]);
  if (i < 0 || i >= cols || j < 0 || j >= rows) return false;
  return pt[1] < fr.hz[j * cols + i] + slack;
}

/**
 * Visible runs of one row as polylines, split by kind. Used for the static
 * image; the canvas walks the arrays directly.
 */
export function rowRuns(fr: Frame, F: Field, j: number) {
  const { cols } = fr.view;
  type Run = { star: boolean; pts: [number, number][] };
  const runs: Run[] = [];
  let cur: Run | undefined;
  for (let i = 0; i < cols; i++) {
    const k = j * cols + i;
    if (!fr.vis[k]) {
      cur = undefined;
      continue;
    }
    const star = fr.kind[k] === 2;
    if (!cur || cur.star !== star) {
      // Start the new run at the previous point so runs of different kinds meet.
      const join: [number, number] | undefined = cur ? cur.pts[cur.pts.length - 1] : undefined;
      cur = { star, pts: join ? [join] : [] };
      runs.push(cur);
    }
    cur.pts.push([colX(fr.view, F, i), fr.sy[k]]);
  }
  return runs.filter((r) => r.pts.length > 1);
}

// ---------------------------------------------------------------------------
// The stream: test particles released at L1, in the co-rotating frame.
// ---------------------------------------------------------------------------

export interface Stream {
  n: number;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  /** Negative while a particle waits to be released. */
  age: Float32Array;
}

/** A small deterministic generator, so the static image never changes between builds. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeStream(n: number, rand: () => number, spread = 2.4): Stream {
  const st: Stream = { n, x: new Float32Array(n), y: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n), age: new Float32Array(n) };
  // Stagger the first releases so the stream grows out of L1 instead of appearing.
  for (let i = 0; i < n; i++) st.age[i] = -rand() * spread;
  return st;
}

function release(st: Stream, F: Field, i: number, rand: () => number) {
  // Gas leaves the pass slowly, at about the sound speed, towards the companion.
  st.x[i] = F.l1 + 0.006 + rand() * 0.01;
  st.y[i] = (rand() - 0.5) * 0.018;
  st.vx[i] = 0.05 + rand() * 0.035;
  st.vy[i] = (rand() - 0.5) * 0.02;
  st.age[i] = 0;
}

/**
 * Advance the stream by dt orbital time units (one orbit is 2π). Each parcel
 * follows the restricted three-body equations with the Coriolis term. Close to
 * the accretor a drag towards a slightly sub-circular orbit stands in for the
 * disc's viscosity; that part is a model, the fall from L1 is not.
 */
export function stepStream(st: Stream, F: Field, dt: number, rand: () => number) {
  const { ma, x1, x2 } = F;
  const disc = (x2 - F.l1) * 0.72;
  for (let i = 0; i < st.n; i++) {
    if (st.age[i] < 0) {
      st.age[i] += dt;
      if (st.age[i] >= 0) release(st, F, i, rand);
      continue;
    }
    let x = st.x[i], y = st.y[i], vx = st.vx[i], vy = st.vy[i];
    // Midpoint substeps, more of them where the orbits are tight.
    const near = Math.hypot(x - x2, y);
    const sub = near < 0.1 ? 6 : near < 0.2 ? 3 : 2;
    const h = dt / sub;
    for (let k = 0; k < sub; k++) {
      accel(F, x, y, vx, vy);
      const mx = x + (vx * h) / 2, my = y + (vy * h) / 2;
      const mvx = vx + (A[0] * h) / 2, mvy = vy + (A[1] * h) / 2;
      accel(F, mx, my, mvx, mvy);
      x += mvx * h;
      y += mvy * h;
      vx += A[0] * h;
      vy += A[1] * h;

      const rx = x - x2, ry = y, r = Math.hypot(rx, ry);
      if (r < disc) {
        // Slightly slower than circular, so the drag carries angular momentum away
        // and the gas spirals in over a few turns of the disc.
        const wk = Math.sqrt(ma / (r * r * r)) * SUBKEPLER - 1; // seen from the turning frame
        const pull = 1 - Math.exp(-DRAG * (1 - r / disc) * h);
        vx += (-wk * ry - vx) * pull;
        vy += (wk * rx - vy) * pull;
      }
    }
    st.age[i] += dt;
    const ra = Math.hypot(x - x2, y);
    // Accreted, flung off the patch, or back inside the donor: release a new parcel.
    if (ra < ACCRETE || x * x + y * y > R * R * 0.94 || st.age[i] > 40 || (x < F.l1 - 0.02 && Math.hypot(x - x1, y) < F.l1 - x1)) {
      st.age[i] = -rand() * 0.2;
      continue;
    }
    st.x[i] = x;
    st.y[i] = y;
    st.vx[i] = vx;
    st.vy[i] = vy;
  }
}
const SUBKEPLER = 0.93;
const DRAG = 7;
const ACCRETE = 0.06;

/**
 * Fill a stream as if it had been flowing forever. One parcel is followed
 * from L1 until it is accreted; with a steady release, parcels are spread
 * evenly in age along that same path, so each one starts at a random moment
 * of it.
 */
export function seedStream(st: Stream, F: Field, rand: () => number) {
  const next = seeder(st, F, rand);
  while (!next(Infinity)) {}
}

/**
 * The same seeding in resumable pieces: each call works for about `budget`
 * milliseconds and returns true once the stream is filled. The first run of
 * the integrator is slow, and done in one go it could hold a frame.
 */
export function seeder(st: Stream, F: Field, rand: () => number) {
  const one = makeStream(1, rand, 0);
  one.age[0] = -1e-9;
  const dt = 0.004;
  const path: number[] = [];
  let k = 0, done = false;
  return (budget: number) => {
    if (done) return true;
    const t0 = performance.now();
    for (; k < 9000; k++) {
      if ((k & 15) === 15 && performance.now() - t0 > budget) return false;
      stepStream(one, F, dt, rand);
      if (one.age[0] < 0 && path.length) break;
      if (one.age[0] >= 0) path.push(one.x[0], one.y[0], one.vx[0], one.vy[0]);
    }
    const steps = path.length / 4;
    for (let i = 0; i < st.n; i++) {
      const j = Math.floor(rand() * steps) * 4;
      st.x[i] = path[j] + (rand() - 0.5) * 0.006;
      st.y[i] = path[j + 1] + (rand() - 0.5) * 0.006;
      st.vx[i] = path[j + 2];
      st.vy[i] = path[j + 3];
      st.age[i] = (j / 4) * dt;
    }
    return (done = true);
  };
}

/** Acceleration in the turning frame: both stars, centrifugal, Coriolis. Written into A. */
const A = new Float32Array(2);
const SOFT = 1e-4;
function accel(F: Field, x: number, y: number, vx: number, vy: number) {
  const dx1 = x - F.x1, dx2 = x - F.x2;
  const r1 = (dx1 * dx1 + y * y + SOFT) ** 1.5, r2 = (dx2 * dx2 + y * y + SOFT) ** 1.5;
  A[0] = (-F.md * dx1) / r1 - (F.ma * dx2) / r2 + x + 2 * vy;
  A[1] = (-F.md * y) / r1 - (F.ma * y) / r2 + y - 2 * vx;
}
