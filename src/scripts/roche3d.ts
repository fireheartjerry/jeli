/**
 * The Roche potential of the binary drawn as a landscape.
 *
 * In the frame that turns with the two stars, a parcel of gas feels
 *   Φ(x, y) = -m_d/r_d - m_a/r_a - (x² + y²)/2
 * (separation, total mass and orbital rate all 1; centre of mass at the
 * origin; donor at x = -m_a, accretor at x = +m_d). Height here is Φ: each
 * star sits in a well, the wells meet at the saddle L1, and the ground falls
 * away at the rim where the centrifugal term wins. A star's surface lies on
 * one level of Φ, so a star is a basin filled to that level; one that fills
 * its Roche lobe is filled exactly to the level of the pass, and anything
 * more spills into the other well.
 *
 * The scene is sampled along rows of constant depth and drawn with a floating
 * horizon, nearest row first, so no line shows through the ground in front
 * of it. The same code draws the live canvas and the static fallback image.
 */
import { masses, aBallistic, aConservative, roche } from "./binary";

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

/**
 * Is this point under the surface of the donor, when the donor is filled to
 * `level` (a potential)? The level of the pass is a donor that fills its lobe.
 */
export const inDonor = (F: Field, x: number, y: number, p: number, level = F.crit) =>
  p < level && x < F.l1 && Math.hypot(x - F.x1, y) < (F.l1 - F.x1) * 1.04;

/** Height of the drawn surface for potential p, relative to the reference level. */
export function shape(F: Field, p: number) {
  const knee = F.crit - KNEE;
  if (p < knee) p = knee - DEPTH * (1 - Math.exp((p - knee) / DEPTH));
  return p - Z0;
}

/** The potential that is drawn at height h: `shape` undone. Below the floor of the wells there is none. */
export function unshape(F: Field, h: number) {
  const p = h + Z0, knee = F.crit - KNEE;
  if (p >= knee) return p;
  const t = 1 - (knee - p) / DEPTH;
  return t <= 1e-6 ? -Infinity : knee + DEPTH * Math.log(t);
}

/** The lowest height drawn: the floor the wells ease down to. */
export const floorOf = (F: Field) => F.crit - KNEE - DEPTH - Z0;

/**
 * The potential the donor's surface lies on when its basin is `fill` full
 * (0 an empty well, 1 filled to the pass). Its drawn height rises evenly.
 */
export function fillLevel(F: Field, fill: number) {
  if (fill >= 1) return F.crit;
  if (fill <= 0) return -Infinity;
  const lo = floorOf(F), hi = shape(F, F.crit);
  return unshape(F, lo + (hi - lo) * (0.04 + 0.96 * fill));
}

/** Height at a point, with the donor's basin filled to `level`. */
export function height(F: Field, x: number, y: number, level = F.crit) {
  const p = phi(F, x, y);
  return shape(F, inDonor(F, x, y, p, level) ? level : p);
}

export interface View {
  /** Screen position of the centre of mass, and pixels per separation. */
  cx: number;
  cy: number;
  s: number;
  rows: number;
  cols: number;
}

/**
 * Where the drawing sits in a box of w × h: the centre of mass, the scale,
 * and the scale bar in the top left corner. On a narrow plate the ground
 * moves down to leave the bar its corner.
 */
export function layout(w: number, h: number) {
  const compact = w < 520;
  const s = compact ? Math.min(w / 3.7, (h - 62) / 2.6) : Math.min(w / 3.75, h / 2.95);
  const cy = compact ? h - 6 - 1.5 * s : h * 0.47;
  const bar = compact ? { x: 14, y: 30, gap: 17 } : { x: 28, y: 36, gap: 21 };
  return { cx: w / 2, cy, s, compact, bar };
}

/** How many rows and columns to sample for a scale of s px a separation: about one line every 4.6 px of depth and one sample every 2.6 px across. */
export const grid = (s: number) => ({
  rows: Math.max(40, Math.min(96, Math.round((2 * R * s * Math.sin(EL)) / 4.6))),
  cols: Math.max(96, Math.min(260, Math.round((2 * R * s) / 2.6))),
});

export interface Frame {
  view: View;
  /** Screen y of every sample, row-major. */
  sy: Float32Array;
  /** Drawn height of every sample: the surface, with the donor's flat top where the donor is. */
  h: Float32Array;
  /** Drawn height of the bare ground at every sample, as if the donor were not there. */
  g: Float32Array;
  /** 0 off the patch, 1 ground, 2 the donor's surface. */
  kind: Uint8Array;
  /** 1 where the sample is not hidden by ground in front of it. */
  vis: Uint8Array;
  /** The horizon after each row: lowest screen y seen so far in that column. */
  hz: Float32Array;
}

export function makeFrame(view: View): Frame {
  const n = view.rows * view.cols;
  return { view, sy: new Float32Array(n), h: new Float32Array(n), g: new Float32Array(n), kind: new Uint8Array(n), vis: new Uint8Array(n), hz: new Float32Array(n) };
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

/** Sample the surface for one orientation and resolve what is hidden. The donor is filled to `level`. */
export function scan(fr: Frame, F: Field, theta: number, level = F.crit) {
  const { rows, cols, cy, s } = fr.view;
  const c = Math.cos(theta), sn = Math.sin(theta);
  const R2 = R * R;
  const flat = level === -Infinity ? 0 : shape(F, level);
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
      const star = inDonor(F, x, y, p, level);
      const bare = shape(F, p);
      const hh = star ? flat : bare;
      const y2 = base - (s * HS * COS * hh) / F.a;
      fr.kind[k] = star ? 2 : 1;
      fr.h[k] = hh;
      fr.g[k] = bare;
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

/**
 * The heights of every sample of ground in a scanned frame, sorted. Entry
 * q·(n − 1) is the level below which a fraction q of the ground lies, which
 * is what lets the ground be plotted at an even rate by area.
 */
export function levels(fr: Frame) {
  const n = fr.kind.length;
  let m = 0;
  for (let k = 0; k < n; k++) if (fr.kind[k] === 1) m++;
  const out = new Float32Array(m);
  m = 0;
  for (let k = 0; k < n; k++) if (fr.kind[k] === 1) out[m++] = fr.h[k];
  return out.sort();
}

/** The lowest and highest ground on the edge of the patch in a scanned frame: the levels between which a level line still runs off the edge. */
export function rimLevels(fr: Frame) {
  const { rows, cols } = fr.view, { kind, g } = fr;
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      if (!kind[k]) continue;
      const edge = !i || !j || i === cols - 1 || j === rows - 1 || !kind[k - 1] || !kind[k + 1] || !kind[k - cols] || !kind[k + cols];
      if (!edge) continue;
      if (g[k] < lo) lo = g[k];
      if (g[k] > hi) hi = g[k];
    }
  }
  return { lo, hi };
}

/** Which part of a level line to trace. */
export const ALL = 0, BY_STAR = 1, INNER = 2, OUTER = 3;

/**
 * One level line of the scanned surface, by marching squares: the curve where
 * the drawn height is `level`, as segments x0, y0, x1, y1 in screen px
 * written into `out`. Parts behind the ground in front of them are left out.
 * Returns how many numbers were written. Every point of the curve is at the
 * same height, so it is the ground's own rows and columns moved straight up.
 *
 * `bare` traces the level on the ground under the donor instead of on its
 * flat top: at the donor's own level that is its outline, placed between
 * samples rather than on them. `part` keeps only the cells beside the donor
 * (BY_STAR), or those inside or outside 0.8 of the patch's radius.
 */
export function contour(fr: Frame, F: Field, level: number, out: Float32Array, bare = false, part = ALL) {
  const { rows, cols, cx, cy, s } = fr.view;
  const x0 = cx - s * F.a * R, dx = (2 * s * F.a * R) / (cols - 1);
  const dy = -(2 * R * s * F.a * SIN) / (rows - 1);
  const lift = cy + s * F.a * R * SIN - (s * HS * COS * level) / F.a; // screen y of row 0 at this height
  // The same 0.8 of the radius, in cells, measured from the middle of the grid.
  const ci = (cols - 2) / 2, cj = (rows - 2) / 2, zi = 0.8 * ci, zj = 0.8 * cj;
  const max = out.length - 8;
  const { kind, vis } = fr;
  const h = bare ? fr.g : fr.h;
  let n = 0;
  for (let j = 0; j < rows - 1 && n < max; j++) {
    const row = j * cols;
    const vj = ((j - cj) / zj) ** 2;
    for (let i = 0; i < cols - 1 && n < max; i++) {
      // The cell's corners: a nearest and left, b to its right, d and c behind them.
      const a = row + i, b = a + 1, d = a + cols, c = d + 1;
      const ka = kind[a], kb = kind[b], kc = kind[c], kd = kind[d];
      if (part === BY_STAR ? ka !== 2 && kb !== 2 && kc !== 2 && kd !== 2 : part !== ALL && ((i - ci) / zi) ** 2 + vj > 1 !== (part === OUTER)) continue;
      // A cell on the edge of the patch has a corner missing; the line may still cross its two whole edges.
      if ((ka ? 1 : 0) + (kb ? 1 : 0) + (kc ? 1 : 0) + (kd ? 1 : 0) < 3) continue;
      if ((ka && !vis[a]) || (kb && !vis[b]) || (kc && !vis[c]) || (kd && !vis[d])) continue;
      const ha = h[a] - level, hb = h[b] - level, hc = h[c] - level, hd = h[d] - level;
      // Where the line crosses each edge that is whole: west (a-d), south (a-b), east (b-c), north (d-c).
      let m = 0;
      if (ka && kd && ha < 0 !== hd < 0) {
        Q[m++] = x0 + i * dx;
        Q[m++] = lift + (j + ha / (ha - hd)) * dy;
      }
      if (ka && kb && ha < 0 !== hb < 0) {
        Q[m++] = x0 + (i + ha / (ha - hb)) * dx;
        Q[m++] = lift + j * dy;
      }
      if (kb && kc && hb < 0 !== hc < 0) {
        Q[m++] = x0 + (i + 1) * dx;
        Q[m++] = lift + (j + hb / (hb - hc)) * dy;
      }
      if (kd && kc && hd < 0 !== hc < 0) {
        Q[m++] = x0 + (i + hd / (hd - hc)) * dx;
        Q[m++] = lift + (j + 1) * dy;
      }
      if (m === 4) {
        out[n++] = Q[0]; out[n++] = Q[1]; out[n++] = Q[2]; out[n++] = Q[3];
      } else if (m === 8) {
        // A saddle inside the cell: join the pairs the middle of the cell says belong together.
        const low = (ha + hb + hc + hd) / 4 < 0;
        const k = ha < 0 === low ? 6 : 2; // west joins north, or west joins south
        out[n++] = Q[0]; out[n++] = Q[1]; out[n++] = Q[k]; out[n++] = Q[k + 1];
        out[n++] = Q[k === 6 ? 2 : 4]; out[n++] = Q[k === 6 ? 3 : 5]; out[n++] = Q[k === 6 ? 4 : 6]; out[n++] = Q[k === 6 ? 5 : 7];
      }
    }
  }
  return n;
}
const Q = new Float32Array(8);

/**
 * The point of ground under a screen position: the nearest strip of surface
 * between two rows that spans it and is not hidden. Writes the co-rotating
 * x and y into `out`; false if the position is off the ground.
 */
export function ground(fr: Frame, F: Field, theta: number, px: number, py: number, out: Float32Array) {
  const { rows, cols, cx, s } = fr.view;
  const fi = ((px - cx) / (s * F.a) + R) / (2 * R) * (cols - 1);
  if (!(fi >= 0 && fi < cols - 1)) return false;
  const i = Math.floor(fi), t = fi - i;
  const { sy, kind, hz } = fr;
  for (let j = 1; j < rows; j++) {
    const a = (j - 1) * cols + i, b = j * cols + i;
    if (!kind[a] || !kind[a + 1] || !kind[b] || !kind[b + 1]) continue;
    const near = sy[a] + (sy[a + 1] - sy[a]) * t, far = sy[b] + (sy[b + 1] - sy[b]) * t;
    if (!(far <= py && py < near)) continue; // this strip faces away, or does not reach the pointer
    // In front of it there must be nothing higher on screen: the horizon up to the nearer row.
    const front = hz[a] + (hz[a + 1] - hz[a]) * t;
    if (py > front + 0.5) continue;
    const u = (near - py) / (near - far);
    const xr = -R + (2 * R * fi) / (cols - 1), yr = -R + (2 * R * (j - 1 + u)) / (rows - 1);
    const c = Math.cos(theta), sn = Math.sin(theta);
    out[0] = xr * c + yr * sn;
    out[1] = -xr * sn + yr * c;
    return true;
  }
  return false;
}

/** The scale bar: where the two answers put the separation after a fraction f of the donor has moved, in px from the bar's origin. */
export const barLengths = (s: number, f: number) => ({ start: s, ballistic: s * aBallistic(f), classical: s * aConservative(f) });

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
  /** How long a parcel takes from the pass to the edge of the disc, and to be accreted (orbital time; set when the stream is seeded). */
  fall: number;
  life: number;
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
  const st: Stream = { n, x: new Float32Array(n), y: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n), age: new Float32Array(n), fall: 0, life: 0 };
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

/** Position and velocity of the parcel being advanced: x, y, vx, vy. */
const P = new Float64Array(4);

/**
 * Advance the parcel in P by dt: the restricted three-body equations with the
 * Coriolis term, in midpoint substeps, more of them where the orbits are
 * tight. Close to the accretor a drag towards a slightly sub-circular orbit
 * stands in for the disc's viscosity; that part is a model, the fall from L1
 * is not.
 */
function advance(F: Field, dt: number) {
  const { ma, x2 } = F;
  const disc = (x2 - F.l1) * DISC;
  let x = P[0], y = P[1], vx = P[2], vy = P[3];
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
  P[0] = x;
  P[1] = y;
  P[2] = vx;
  P[3] = vy;
}

/** Has a parcel at (x, y) left the picture: accreted, off the patch, or back inside the donor? */
const gone = (F: Field, x: number, y: number) =>
  Math.hypot(x - F.x2, y) < ACCRETE || x * x + y * y > R * R * 0.94 || (x < F.l1 - 0.02 && Math.hypot(x - F.x1, y) < F.l1 - F.x1);

/**
 * Advance the stream by dt orbital time units (one orbit is 2π). Each parcel
 * follows the equations in `advance`, and is released again from the pass
 * once it has been accreted.
 */
export function stepStream(st: Stream, F: Field, dt: number, rand: () => number) {
  for (let i = 0; i < st.n; i++) {
    if (st.age[i] < 0) {
      st.age[i] += dt;
      if (st.age[i] >= 0) release(st, F, i, rand);
      continue;
    }
    P[0] = st.x[i];
    P[1] = st.y[i];
    P[2] = st.vx[i];
    P[3] = st.vy[i];
    advance(F, dt);
    st.age[i] += dt;
    if (st.age[i] > 40 || gone(F, P[0], P[1])) {
      st.age[i] = -rand() * 0.2;
      continue;
    }
    st.x[i] = P[0];
    st.y[i] = P[1];
    st.vx[i] = P[2];
    st.vy[i] = P[3];
  }
}
const SUBKEPLER = 0.93;
const DRAG = 7;
const ACCRETE = 0.06;
const DISC = 0.72; // the disc's edge, as a fraction of the way from the accretor to the pass

/**
 * Where a parcel let go at rest at (x, y) goes over the next `span` of
 * orbital time: its path in the co-rotating frame, as x, y pairs written
 * into `out`. Returns how many numbers were written. A parcel at rest in
 * this frame can never climb above the level it started on, which is why
 * its path stays inside the level line through that point.
 */
export function drift(F: Field, x: number, y: number, span: number, out: Float32Array) {
  const dt = 0.02;
  P[0] = x;
  P[1] = y;
  P[2] = 0;
  P[3] = 0;
  let n = 0;
  out[n++] = x;
  out[n++] = y;
  for (let t = 0; t < span && n < out.length - 1; t += dt) {
    advance(F, dt);
    if (gone(F, P[0], P[1])) break;
    out[n++] = P[0];
    out[n++] = P[1];
  }
  return n;
}

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
  const disc = (F.x2 - F.l1) * DISC;
  let k = 0, done = false, fall = 0;
  return (budget: number) => {
    if (done) return true;
    const t0 = performance.now();
    for (; k < 9000; k++) {
      if ((k & 15) === 15 && performance.now() - t0 > budget) return false;
      stepStream(one, F, dt, rand);
      if (one.age[0] < 0 && path.length) break;
      if (one.age[0] >= 0) {
        path.push(one.x[0], one.y[0], one.vx[0], one.vy[0]);
        if (!fall && Math.hypot(one.x[0] - F.x2, one.y[0]) < disc) fall = (path.length / 4) * dt;
      }
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
    st.life = steps * dt;
    st.fall = fall || st.life * 0.3;
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
