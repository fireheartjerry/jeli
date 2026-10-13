// Physics for Fig. "intercept": the fire-control problem. A round leaves the
// mount at a fixed speed, loses speed to air resistance and falls; the drone
// keeps flying while it is in the air. The solver finds the one elevation that
// puts the round and the drone at the same point at the same time.
//
// Pure functions, no DOM. Shared by the server render (the finished frame)
// and the client script (every frame), so the two can never disagree.
//
// Every number here is a generic, textbook-scale value chosen to make the
// mechanism visible. None of it describes the team's hardware.

// ---------------------------------------------------------------- the model

/** The round: a point mass with quadratic drag, dv/dt = -k |v| v - g ŷ. */
export const GUN = {
  v0: 250, // muzzle speed, m/s
  k: 0.01, // drag per metre of travel, 1/m
  g: 9.81, // m/s²
  dt: 0.001, // RK4 step, s
} as const;

/** The drone: constant velocity over the flight (the lead model), level and inbound. */
export const TARGET = {
  speed: 12, // m/s
  fps: 30, // camera frames per second
  frames: 45, // detections kept in the track
  sigma: 0.14, // detection noise, m
} as const;

/** The solver stops when one more pass would move the aim point less than this. */
export const TOL = 1e-3; // m
export const MAX_ITER = 8;
/** Samples kept along the solved trajectory, and along each candidate. */
export const NS = 33;
export const NC = 9;

// ---------------------------------------------------------------- integrator

// One shared state vector; nothing is allocated while integrating.
let X = 0, Y = 0, VX = 0, VY = 0, T = 0;

function launch(theta: number) {
  X = 0;
  Y = 0;
  T = 0;
  VX = GUN.v0 * Math.cos(theta);
  VY = GUN.v0 * Math.sin(theta);
}

/** One classical RK4 step of size h on (x, y, vx, vy). */
function step(h: number) {
  const k = GUN.k, g = GUN.g;
  let s = Math.sqrt(VX * VX + VY * VY);
  const ax1 = -k * s * VX, ay1 = -k * s * VY - g;
  const vx2 = VX + 0.5 * h * ax1, vy2 = VY + 0.5 * h * ay1;
  s = Math.sqrt(vx2 * vx2 + vy2 * vy2);
  const ax2 = -k * s * vx2, ay2 = -k * s * vy2 - g;
  const vx3 = VX + 0.5 * h * ax2, vy3 = VY + 0.5 * h * ay2;
  s = Math.sqrt(vx3 * vx3 + vy3 * vy3);
  const ax3 = -k * s * vx3, ay3 = -k * s * vy3 - g;
  const vx4 = VX + h * ax3, vy4 = VY + h * ay3;
  s = Math.sqrt(vx4 * vx4 + vy4 * vy4);
  const ax4 = -k * s * vx4, ay4 = -k * s * vy4 - g;
  X += (h / 6) * (VX + 2 * vx2 + 2 * vx3 + vx4);
  Y += (h / 6) * (VY + 2 * vy2 + 2 * vy3 + vy4);
  VX += (h / 6) * (ax1 + 2 * ax2 + 2 * ax3 + ax4);
  VY += (h / 6) * (ay1 + 2 * ay2 + 2 * ay3 + ay4);
  T += h;
}

/**
 * Fly a round launched at `theta` until it is `xp` metres downrange. Fixed
 * steps, then one shortened step that lands on xp exactly (two Newton
 * corrections on its length). Leaves the state in X, Y, VX, VY, T.
 * Returns false if the round never gets there.
 */
function flyTo(theta: number, xp: number): boolean {
  launch(theta);
  const dt = GUN.dt;
  for (let i = 0; i < 4000; i++) {
    if (VX <= 1) return false;
    if (X + VX * dt >= xp) {
      const x0 = X, y0 = Y, vx0 = VX, vy0 = VY, t0 = T;
      let h = (xp - X) / VX;
      for (let j = 0; j < 3; j++) {
        X = x0; Y = y0; VX = vx0; VY = vy0; T = t0;
        step(h);
        const err = xp - X;
        if (Math.abs(err) < 1e-11) break;
        h += err / VX;
      }
      return true;
    }
    step(dt);
  }
  return false;
}

/**
 * The elevation whose drag trajectory passes through (xp, yp): secant
 * iteration on the height error at xp. Leaves the arrival state in the
 * integrator (T is the time of flight). Returns NaN if out of reach.
 */
function elevationThrough(xp: number, yp: number): number {
  let a = Math.atan2(yp, xp);
  if (!flyTo(a, xp)) return NaN;
  let fa = Y - yp;
  // First correction: lift the bore by the angle the miss subtends.
  let b = a - (fa * Math.cos(a) * Math.cos(a)) / xp;
  for (let i = 0; i < 12; i++) {
    if (!flyTo(b, xp)) return NaN;
    const fb = Y - yp;
    if (Math.abs(fb) < 1e-8 || fb === fa) return b;
    const c = b - (fb * (b - a)) / (fb - fa);
    a = b;
    fa = fb;
    b = c;
  }
  flyTo(b, xp);
  return b;
}

// ---------------------------------------------------------------- the solver

/** One pass of the fixed-point iteration. */
export const IT = { guess: 0, px: 1, py: 2, theta: 3, tof: 4, miss: 5, n: 6 } as const;

export interface Solution {
  ok: boolean;
  /** Drone position at the moment of firing, and its velocity (m, m/s). */
  dx: number; dy: number; vx: number; vy: number;
  /** Launch elevation (rad), time of flight (s), and the intercept point (m). */
  theta: number; tof: number; ix: number; iy: number;
  /** Line of sight to the drone now (rad) and the angle the bore adds to it. */
  los: number; lead: number;
  /** Slant range to the drone now, and to the intercept point (m). */
  range: number; rangeI: number;
  /** How far below the bore line the round is when it arrives (m). */
  drop: number;
  /** Speed on arrival (m/s). */
  vImpact: number;
  /** The same shot without drag: time to the intercept range, and its drop there. */
  tofVac: number; dropVac: number;
  /** How far apart round and drone are at the solved time of flight (m). */
  miss: number;
  /** Passes used, and each pass: [guess, px, py, theta, tof, miss]. */
  n: number;
  it: Float64Array;
  /** The solved trajectory at NS equal time steps: position, speed, path length. */
  tx: Float64Array; ty: Float64Array; tv: Float64Array; tl: Float64Array;
  /** Each candidate trajectory at NC equal time steps. */
  cx: Float64Array; cy: Float64Array;
}

export function createSolution(): Solution {
  return {
    ok: false,
    dx: 0, dy: 0, vx: 0, vy: 0,
    theta: 0, tof: 0, ix: 0, iy: 0,
    los: 0, lead: 0, range: 0, rangeI: 0, drop: 0, vImpact: 0, tofVac: 0, dropVac: 0, miss: 0,
    n: 0,
    it: new Float64Array(MAX_ITER * IT.n),
    tx: new Float64Array(NS), ty: new Float64Array(NS), tv: new Float64Array(NS), tl: new Float64Array(NS),
    cx: new Float64Array(MAX_ITER * NC), cy: new Float64Array(MAX_ITER * NC),
  };
}

/** Fly `theta` for exactly `tof` seconds in n equal intervals, recording each. */
function sample(theta: number, tof: number, n: number, xs: Float64Array, ys: Float64Array, o: number, vs?: Float64Array, ls?: Float64Array) {
  launch(theta);
  const sub = Math.max(1, Math.ceil(tof / (n - 1) / GUN.dt));
  const h = tof / (n - 1) / sub;
  let len = 0;
  xs[o] = 0;
  ys[o] = 0;
  if (vs) vs[0] = GUN.v0;
  if (ls) ls[0] = 0;
  for (let i = 1; i < n; i++) {
    for (let j = 0; j < sub; j++) {
      const x0 = X, y0 = Y;
      step(h);
      len += Math.hypot(X - x0, Y - y0);
    }
    xs[o + i] = X;
    ys[o + i] = Y;
    if (vs) vs[i] = Math.hypot(VX, VY);
    if (ls) ls[i] = len;
  }
}

/**
 * The firing solution for a drone at (dx, dy) moving at (vx, vy), with the
 * mount at the origin. Guess a time of flight (first guess: none, aim at the
 * drone itself), predict where the drone will be, find the elevation that
 * passes through that point with drag, read off the real time of flight,
 * and repeat until the prediction stops moving. Writes into `out`.
 */
export function solve(dx: number, dy: number, vx: number, vy: number, out: Solution): Solution {
  out.dx = dx; out.dy = dy; out.vx = vx; out.vy = vy;
  out.ok = false;
  out.n = 0;
  const speed = Math.hypot(vx, vy);
  let t = 0;
  for (let n = 0; n < MAX_ITER; n++) {
    const px = dx + vx * t, py = dy + vy * t;
    const theta = elevationThrough(px, py);
    if (!(theta === theta)) return out;
    const tof = T, vImpact = Math.hypot(VX, VY);
    const miss = speed * Math.abs(tof - t);
    const o = n * IT.n;
    out.it[o + IT.guess] = t;
    out.it[o + IT.px] = px;
    out.it[o + IT.py] = py;
    out.it[o + IT.theta] = theta;
    out.it[o + IT.tof] = tof;
    out.it[o + IT.miss] = miss;
    out.n = n + 1;
    sample(theta, tof, NC, out.cx, out.cy, n * NC);
    if (miss < TOL || n === MAX_ITER - 1) {
      out.ok = miss < TOL;
      out.theta = theta;
      out.tof = tof;
      out.ix = px;
      out.iy = py;
      out.vImpact = vImpact;
      break;
    }
    t = tof;
  }
  sample(out.theta, out.tof, NS, out.tx, out.ty, 0, out.tv, out.tl);
  // Where the drone really is when the round arrives, against where the round is.
  out.miss = Math.hypot(out.tx[NS - 1] - (dx + vx * out.tof), out.ty[NS - 1] - (dy + vy * out.tof));
  out.los = Math.atan2(dy, dx);
  out.lead = out.theta - out.los;
  out.range = Math.hypot(dx, dy);
  out.rangeI = Math.hypot(out.ix, out.iy);
  out.drop = out.ix * Math.tan(out.theta) - out.iy;
  out.tofVac = out.ix / (GUN.v0 * Math.cos(out.theta));
  out.dropVac = 0.5 * GUN.g * out.tofVac * out.tofVac;
  return out;
}

/** Where the solved round is at time t (linear between samples). Writes [x, y, speed, path length]. */
export function roundAt(s: Solution, t: number, out: Float64Array) {
  const u = Math.min(1, Math.max(0, t / s.tof)) * (NS - 1);
  const i = Math.min(NS - 2, Math.floor(u)), f = u - i;
  out[0] = s.tx[i] + (s.tx[i + 1] - s.tx[i]) * f;
  out[1] = s.ty[i] + (s.ty[i + 1] - s.ty[i]) * f;
  out[2] = s.tv[i] + (s.tv[i + 1] - s.tv[i]) * f;
  out[3] = s.tl[i] + (s.tl[i + 1] - s.tl[i]) * f;
  return out;
}

/** The same shot with no air: a parabola. Writes [x, y]. */
export function vacuumAt(s: Solution, t: number, out: Float64Array) {
  out[0] = GUN.v0 * Math.cos(s.theta) * t;
  out[1] = GUN.v0 * Math.sin(s.theta) * t - 0.5 * GUN.g * t * t;
  return out;
}

// ---------------------------------------------------------------- the track

// Detection noise, fixed once so the server and the client draw the same
// marks. The constant and linear parts are projected out, so a least-squares
// line through the noisy detections is exactly the drone's true track: the
// figure's estimate and its truth are the same line.
const NOISE = (() => {
  const n = TARGET.frames;
  let a = 0x9e3779b9;
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const axis = () => {
    const v = Array.from({ length: n }, () => rnd() + rnd() + rnd() - 1.5);
    // Remove the mean and the slope against the frame index.
    const m = (n - 1) / 2;
    let s0 = 0, s1 = 0, s2 = 0;
    for (let j = 0; j < n; j++) { s0 += v[j]; s1 += v[j] * (j - m); s2 += (j - m) * (j - m); }
    const mean = s0 / n, slope = s1 / s2;
    let ss = 0;
    for (let j = 0; j < n; j++) { v[j] -= mean + slope * (j - m); ss += v[j] * v[j]; }
    const k = TARGET.sigma / Math.sqrt(ss / n);
    return Float64Array.from(v, (x) => x * k);
  };
  return { x: axis(), y: axis() };
})();

/** Detections of a drone that is at (dx, dy) now: frame j was j / fps seconds ago. Writes [x0, y0, x1, y1, ...]. */
export function detections(dx: number, dy: number, vx: number, vy: number, out: Float64Array) {
  for (let j = 0; j < TARGET.frames; j++) {
    const t = -j / TARGET.fps;
    out[2 * j] = dx + vx * t + NOISE.x[j];
    out[2 * j + 1] = dy + vy * t + NOISE.y[j];
  }
  return out;
}

/** Least-squares constant-velocity fit through the detections. Writes [x, y, vx, vy] at the newest frame. */
export function fitTrack(det: Float64Array, out: Float64Array) {
  const n = TARGET.frames, m = (n - 1) / 2;
  let sx = 0, sy = 0, stx = 0, sty = 0, stt = 0;
  for (let j = 0; j < n; j++) {
    const t = -(j - m) / TARGET.fps;
    sx += det[2 * j];
    sy += det[2 * j + 1];
    stx += t * det[2 * j];
    sty += t * det[2 * j + 1];
    stt += t * t;
  }
  const vx = stx / stt, vy = sty / stt, t0 = m / TARGET.fps;
  out[0] = sx / n + vx * t0;
  out[1] = sy / n + vy * t0;
  out[2] = vx;
  out[3] = vy;
  return out;
}

/** Lateral scatter for the camera view, in metres across the line of sight: a third, zero-mean noise axis. */
const SIDE = (() => {
  const n = TARGET.frames;
  let a = 0x51ed270b;
  const out = new Float64Array(n);
  let mean = 0;
  for (let j = 0; j < n; j++) {
    a = (Math.imul(a, 1664525) + 1013904223) | 0;
    const u = (a >>> 0) / 4294967296;
    a = (Math.imul(a, 1664525) + 1013904223) | 0;
    out[j] = u + (a >>> 0) / 4294967296 - 1;
    mean += out[j] / n;
  }
  for (let j = 0; j < n; j++) out[j] = (out[j] - mean) * TARGET.sigma * 1.6;
  return out;
})();

// ---------------------------------------------------------------- the drawing

/** Where the drone is when the figure opens, and how far a reader may drag it (m from the mount). */
export const D0 = { x: 62, y: 16 } as const;
export const BOUNDS = { x0: 36, x1: 76, y0: 7, y1: 22 } as const;
/** Barrel elevation before a solution exists (deg). */
export const REST = 0;
/** The fixed camera: where its axis points and half its field of view (deg). */
export const CAMERA = { tilt: 18, half: 16 } as const;
/** Spacing of the time marks along the trajectory (s). */
export const TICK = 0.05;
/** Ambient replay runs at this fraction of real time. */
export const SLOW = 0.25;

export interface Layout {
  key: "w" | "n";
  wide: boolean;
  W: number; H: number;
  /** Pivot of the mount in px, and px per metre. Distances in the sky are to this scale. */
  ox: number; oy: number; s: number;
  top: number; right: number;
  /** Scale of the mount and drone drawings (they are not to the sky's scale). */
  art: number;
  /** Clearances around the drone and the intercept marker, and the label size, in px. */
  glyph: number; ring: number; f: number;
  /** Camera inset: frame, view window, centre column, px per degree, lead bracket x. */
  cam: { x: number; y: number; w: number; h: number; x0: number; x1: number; y0: number; y1: number; cx: number; k: number; bx: number };
  /** Solver plot: frame, first pass x and pitch, y of a 1 m miss and px per decade. */
  plot: { x: number; y: number; w: number; h: number; x0: number; dx: number; y1m: number; dec: number };
  /** Instrument cells. */
  ins: { x: number; y: number; cw: number; ch: number; cols: number };
}

export const WIDE: Layout = {
  key: "w", wide: true, W: 1200, H: 496,
  ox: 108, oy: 356, s: 13.2, top: 6, right: 1200,
  art: 1.25, glyph: 22, ring: 12, f: 12.5,
  cam: { x: 10, y: 8, w: 226, h: 178, x0: 46, x1: 228, y0: 40, y1: 178, cx: 137, k: 24, bx: 178 },
  plot: { x: 250, y: 396, w: 192, h: 96, x0: 304, dx: 19, y1m: 429, dec: 11 },
  ins: { x: 462, y: 396, cw: 123, ch: 96, cols: 6 },
};

export const NARROW: Layout = {
  key: "n", wide: false, W: 400, H: 626,
  ox: 30, oy: 128, s: 4.8, top: 6, right: 400,
  art: 0.6, glyph: 12, ring: 6, f: 14.5,
  cam: { x: 0, y: 208, w: 192, h: 204, x0: 42, x1: 186, y0: 244, y1: 404, cx: 114, k: 30, bx: 150 },
  plot: { x: 208, y: 208, w: 192, h: 204, x0: 264, dx: 22, y1m: 272, dec: 28 },
  ins: { x: 0, y: 428, cw: 400 / 3, ch: 98, cols: 3 },
};

export const LAYOUTS = [WIDE, NARROW] as const;

const RAD = Math.PI / 180;
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const pt = new Float64Array(4);

export const toX = (L: Layout, x: number) => L.ox + L.s * x;
export const toY = (L: Layout, y: number) => L.oy - L.s * y;
/** Camera view: elevation (deg) to y, given the elevation at the window's centre. */
export const camY = (L: Layout, el: number, mid: number) => (L.cam.y0 + L.cam.y1) / 2 - (el - mid) * L.cam.k;
/** Solver plot: a miss in metres to y (log scale). */
export const plotY = (L: Layout, miss: number) => L.plot.y1m - Math.log10(Math.max(miss, 1e-5)) * L.plot.dec;

/** Numbers as the figure prints them (true minus sign, fixed decimals). */
export const fx = (v: number, d: number) => {
  const s = Math.abs(v).toFixed(d);
  return (v < 0 && +s !== 0 ? "−" : "") + s;
};

/** Where the vacuum round leaves the sky, as a time (or its full time of flight if it stays in). */
function vacuumExit(L: Layout, s: Solution) {
  const vx = GUN.v0 * Math.cos(s.theta), vy = GUN.v0 * Math.sin(s.theta);
  const tx = (L.right - 6 - L.ox) / L.s / vx;
  // Height reaches the top of the sky: vy t - g t²/2 = h.
  const h = (L.oy - L.top - 4) / L.s;
  const disc = vy * vy - 2 * GUN.g * h;
  const ty = disc > 0 ? (vy - Math.sqrt(disc)) / GUN.g : Infinity;
  return Math.min(s.tof, tx, ty);
}

type Attrs = Record<string, string | number>;
export interface Geom {
  /** Attributes by element key, and text by text key. */
  a: Record<string, Attrs>;
  t: Record<string, string>;
  /** Detection marks, newest first, for the track and for the camera view. */
  det: string[];
  cdet: string[];
  /** Numbers the script animates from. */
  n: {
    dX: number; dY: number; iX: number; iY: number;
    los: number; th: number; elI: number; mid: number;
    oldX: number; arcLen: number; ghostT: number; ghostIn: boolean; ghostLabel: boolean;
  };
}

/** A rotated label: placed at radius r along a ray at angle a (rad), `off` px to the ray's right-hand (lower) side. */
function along(L: Layout, a: number, r: number, off: number) {
  const x = L.ox + r * Math.cos(a) + off * Math.sin(a);
  const y = L.oy - r * Math.sin(a) + off * Math.cos(a);
  return `translate(${r1(x)} ${r1(y)}) rotate(${r2(-a / RAD)})`;
}

/**
 * Everything in the plate that depends on where the drone is: the solved
 * diagram, as attributes keyed by element. The server prints it; the script
 * applies it again after every solve.
 */
export function geom(L: Layout, s: Solution, det: Float64Array): Geom {
  const a: Record<string, Attrs> = {};
  const t: Record<string, string> = {};
  const { ox, oy } = L;
  const dX = toX(L, s.dx), dY = toY(L, s.dy), iX = toX(L, s.ix), iY = toY(L, s.iy);
  const ct = Math.cos(s.theta), st = Math.sin(s.theta), cl = Math.cos(s.los), sl = Math.sin(s.los);
  const th = s.theta / RAD, los = s.los / RAD;
  const elI = Math.atan2(s.iy, s.ix) / RAD;
  const rD = s.range * L.s;

  // ---- the track: detections (newest first), the fitted line through them, the prediction ahead.
  const marks: string[] = [];
  for (let j = 0; j < TARGET.frames; j++) marks.push(`M${r1(toX(L, det[2 * j]))} ${r1(toY(L, det[2 * j + 1]))}h0`);
  const span = (TARGET.frames - 1) / TARGET.fps;
  const oldX = toX(L, s.dx - s.vx * span), oldY = toY(L, s.dy - s.vy * span);
  a.det = { d: marks.join("") };
  a.trk = { x1: r1(oldX), y1: r1(oldY), x2: r1(dX), y2: r1(dY) };
  const dir = Math.sign(s.vx) || -1; // the drone flies toward -x
  const p0 = dX + dir * (L.glyph + 2), p1 = iX - dir * (L.ring + 5);
  const gap = (p1 - p0) * dir;
  a.prd = { x1: r1(p0), y1: r1(dY), x2: r1(gap > 4 ? p1 : p0), y2: r1(iY) };

  // ---- rays from the mount: line of sight to the drone now, and the bore line.
  const r0 = 15 * L.art;
  a.los = { x1: r1(ox + r0 * cl), y1: r1(oy - r0 * sl), x2: r1(dX - (L.glyph + 2) * cl), y2: r1(dY + (L.glyph + 2) * sl) };
  const aimR = Math.min((L.right - 4 - ox) / ct, (oy - L.top - 2) / st);
  a.aim = { x1: r1(ox + r0 * ct), y1: r1(oy - r0 * st), x2: r1(ox + aimR * ct), y2: r1(oy - aimR * st) };

  // ---- the solved trajectory, the wedge it falls away from the bore line, and its time marks.
  let arc = "", back = "";
  for (let i = 0; i < NS; i++) {
    const p = `${r1(toX(L, s.tx[i]))} ${r1(toY(L, s.ty[i]))}`;
    arc += (i ? "L" : "M") + p;
    if (i % 2 === 0) back = `L${p}` + back;
  }
  const aimIY = oy - (iX - ox) * (st / ct);
  a.arcP = { d: arc };
  a.arcF = { d: arc };
  a.wedge = { d: `M${ox} ${oy}L${r1(iX)} ${r1(aimIY)}${back}Z` };
  let ticks = "";
  const tl = 3.4 * (L.wide ? 1 : 0.8);
  for (let k = 1; k * TICK < s.tof; k++) {
    roundAt(s, k * TICK, pt);
    const x = toX(L, pt[0]), y = toY(L, pt[1]);
    if (Math.hypot(iX - x, iY - y) < L.ring + 6) break;
    // Perpendicular to the bore line: close enough to the path at this scale.
    ticks += `M${r1(x - st * tl)} ${r1(y - ct * tl)}L${r1(x + st * tl)} ${r1(y + ct * tl)}`;
  }
  a.tks = { d: ticks };
  // "0.05 s apart" sits over the gap between the second and third marks.
  roundAt(s, 2.5 * TICK, pt);
  const tickR = Math.hypot(pt[0], pt[1]) * L.s;
  a.tkl = { transform: along(L, s.theta, tickR, -L.f * 0.62) };

  // ---- the same shot without drag: a parabola, drawn as one exact quadratic.
  const gT = vacuumExit(L, s), ghostIn = gT >= s.tof;
  vacuumAt(s, gT, pt);
  const gX = toX(L, pt[0]), gY = toY(L, pt[1]);
  const cX = toX(L, (GUN.v0 * ct * gT) / 2), cY = toY(L, (GUN.v0 * st * gT) / 2);
  a.ghost = { d: `M${r1(ox + r0 * ct)} ${r1(oy - r0 * st)}Q${r1(cX)} ${r1(cY)} ${r1(gX)} ${r1(gY)}` };
  a.gdot = { cx: r1(gX), cy: r1(gY), opacity: ghostIn ? 1 : 0 };
  const gA = Math.atan2(GUN.v0 * st - GUN.g * gT, GUN.v0 * ct);
  let ghostLabel = true;
  {
    // The label hangs under the ghost just short of its end. Where the track
    // runs close beneath (a low, far drone) it sits above the bore line instead.
    const back = L.f * (ghostIn ? 1.1 : 0.6);
    const bx = gX - back * Math.cos(gA), by = gY + back * Math.sin(gA);
    const under = L.f * 1.12, room = dY - (by + under);
    const off = room > L.f * 1.5 || bx < dX ? under : -(L.f * 0.62 + s.dropVac * L.s * (gT / s.tofVac) ** 2 + 2);
    a.gl = { transform: `translate(${r1(bx + off * Math.sin(gA))} ${r1(by + off * Math.cos(gA))}) rotate(${r2(-gA / RAD)})`, opacity: 1 };
    // If the ghost leaves the sky right beside the intercept, its label (about
    // 3.6 ems long, ending here) would run into the ring: it has nowhere to go.
    ghostLabel = Math.hypot(bx - iX, by - iY) > L.ring + L.f * 3.6 + 8;
    a.gl.opacity = ghostLabel ? 1 : 0;
  }

  // ---- markers.
  a.ring = { transform: `translate(${r1(iX)} ${r1(iY)})` };
  a.pulse = { cx: r1(iX), cy: r1(iY) };
  a.dD = { transform: droneAt(L, dX, dY) };
  a.dr = { transform: droneAt(L, dX, dY) };
  a.rnd = { cx: r1(iX), cy: r1(iY) };
  a.focus = { cx: r1(dX), cy: r1(dY) };
  a.grab = { cx: r1(dX), cy: r1(dY) };
  // Speed, with an arrow the way the drone is going.
  const vy = dY + L.glyph * 0.62 + L.f * 1.15, vx0 = dX - L.glyph * 0.2, al = L.f * 1.1;
  a.varr = { d: `M${r1(vx0)} ${r1(vy - L.f * 0.33)}h${r1(dir * al)}m${r1(-dir * 4)} -3l${r1(dir * 4)} 3l${r1(-dir * 4)} 3` };
  a.vl = { x: r1(vx0 + 5), y: r1(vy) };
  a.hint = { x: r1(vx0 - al), y: r1(vy + L.f * 1.35) };
  // The detections get their label under the trail, if the trail is on the plate.
  const tlx = dX - dir * (L.glyph + L.f * 11);
  a.tl = { x: r1(tlx), y: r1(vy), opacity: tlx + L.f * 5.6 < L.right - 28 ? 1 : 0 };

  // ---- dimensions: the drop at the intercept, the lead between the two rays, the track's height.
  // The callout rises from the intercept ring.
  const up = L.ring + L.f * 3.3;
  a.dlead = { d: `M${r1(iX)} ${r1(iY - L.ring - 2.5)}V${r1(iY - up)}` };
  a.il = { x: r1(iX - 7), y: r1(iY - up + L.f * 0.3) };
  a.dl = { x: r1(iX - 7), y: r1(iY - up + L.f * 1.6) };
  // Labels ride the two rays in a fixed order outward from the mount: line of
  // sight (below), time marks (above), lead (below), aim line (above). A near
  // drone leaves less ray to share, so each one yields to the one before it.
  const losR = Math.max(rD * 0.3, 120 * L.art + 88);
  const rl = L.wide ? Math.max(rD * 0.57, losR + L.f * 6.2) : rD * 0.57, pad = 7 / rl;
  const la0 = s.los - pad, la1 = s.theta + pad;
  a.la = {
    d: `M${r1(ox + rl * Math.cos(la0))} ${r1(oy - rl * Math.sin(la0))}A${r1(rl)} ${r1(rl)} 0 0 0 ${r1(ox + rl * Math.cos(la1))} ${r1(oy - rl * Math.sin(la1))}`,
  };
  a.ll = { transform: along(L, s.los, rl + 6, L.f * 1.12) };
  a.losl = { transform: along(L, s.los, losR, L.f * 1.12) };
  // The aim label sits before the intercept if there is room after the time
  // marks' own label, and otherwise on the bore line beyond it.
  const rI = s.rangeI * L.s, before = rD * 0.74, half = L.f * 3.8;
  const fits = before - half > tickR + L.f * 3.6 && before + half < rI - L.ring - 8;
  const beyond = rI + L.ring + 14 + half;
  // Beyond the intercept it must also stay clear of the no-drag label near the ghost's end.
  const clear = beyond + half < Math.min(aimR - 6, Math.hypot(gX - ox, gY - oy) - L.f * 7);
  a.aiml = { transform: along(L, s.theta, fits ? before : beyond, -L.f * 0.62), opacity: fits || clear ? 1 : 0 };
  const hx = L.right - 12, hy = dY;
  a.hdim = { d: `M${r1(hx - 3)} ${oy}H${r1(hx + 3)}M${r1(hx)} ${oy}V${r1(hy)}M${r1(hx - 3)} ${r1(hy)}H${r1(hx + 3)}` };
  a.hext = { x1: r1(Math.min(oldX + 5, hx - 5)), y1: r1(hy), x2: r1(hx - 5), y2: r1(hy) };
  a.hl = { x: r1(hx - 7), y: r1((oy + hy) / 2 + 4) };

  // ---- the mount follows.
  a.rifle = { transform: `rotate(${r2(-th)})` };

  // ---- candidates: each pass's trajectory, and where it thought the drone would be.
  for (let n = 0; n < MAX_ITER; n++) {
    let d = "";
    if (n < s.n) for (let i = 0; i < NC; i++) d += `${i ? "L" : "M"}${r1(toX(L, s.cx[n * NC + i]))} ${r1(toY(L, s.cy[n * NC + i]))}`;
    a[`cand${n}`] = { d };
    // Where this pass aimed (a tick on the track), and how far the drone would
    // have flown past it by the time the round arrived (a bracket above).
    let mark = "";
    if (n < s.n) {
      const o = n * IT.n, px = toX(L, s.it[o + IT.px]), py = toY(L, s.it[o + IT.py]);
      const qx = toX(L, s.dx + s.vx * s.it[o + IT.tof]), by = py - L.glyph * 0.5 - 5;
      mark = `M${r1(px)} ${r1(py - 4.5)}V${r1(py + 4.5)}`;
      if (Math.abs(qx - px) > 3) mark += `M${r1(px)} ${r1(by + 3)}V${r1(by)}H${r1(qx)}V${r1(by + 3)}`;
    }
    a[`cpt${n}`] = { d: mark };
  }

  // ---- the camera view: a window in elevation, centred between the drone and the bore.
  const C = L.cam, mid = (los + th) / 2;
  const yOf = (el: number) => camY(L, el, mid);
  let tape = "", grid = "";
  const lo = Math.ceil((mid - (C.y1 - C.y0) / 2 / C.k) * 2) / 2, hi = mid + (C.y1 - C.y0) / 2 / C.k;
  let li = 0;
  for (let e = lo; e <= hi; e += 0.5) {
    const y = r1(yOf(e)), whole = Math.abs(e - Math.round(e)) < 1e-9;
    tape += `M${C.x0} ${y}h${whole ? -6 : -3}`;
    if (whole) {
      grid += `M${C.x0 + 2} ${y}H${C.x1}`;
      // Labels stay clear of the window's top and bottom edges.
      if (y > C.y0 + L.f * 0.5 && y < C.y1 - L.f * 0.3 && li < 7) {
        a[`ctl${li}`] = { y: r1(y + L.f * 0.32), opacity: 1 };
        t[`ctl${li}`] = `${Math.round(e)}°`;
        li++;
      }
    }
  }
  for (; li < 7; li++) {
    a[`ctl${li}`] = { y: 0, opacity: 0 };
    t[`ctl${li}`] = "";
  }
  a.ctape = { d: tape };
  a.cgrid = { d: grid };
  a.ccross = { transform: `translate(0 ${r1(yOf(th))})` };
  a.cring = { transform: `translate(${C.cx} ${r1(yOf(elI))})` };
  a.cbox = { transform: `translate(${C.cx} ${r1(yOf(los))})` };
  a.crnd = { cx: C.cx, cy: r1(yOf(elI)) };
  const cmarks: string[] = [];
  for (let j = 0; j < TARGET.frames; j++) {
    const e = Math.atan2(det[2 * j + 1], det[2 * j]) / RAD;
    const az = Math.atan2(SIDE[j], Math.hypot(det[2 * j], det[2 * j + 1])) / RAD;
    cmarks.push(`M${r1(C.cx + az * C.k)} ${r1(yOf(e))}h0`);
  }
  a.ctrail = { d: cmarks.join("") };
  const by0 = yOf(los), by1 = yOf(th);
  a.cbr = { d: `M${C.bx - 3} ${r1(by0)}h6M${C.bx} ${r1(by0)}V${r1(by1)}M${C.bx - 3} ${r1(by1)}h6` };
  a.cbt = { y: r1((by0 + by1) / 2 - L.f * 0.18) };
  a.cbv = { y: r1((by0 + by1) / 2 + L.f * 0.92) };
  const by2 = yOf(elI);
  a.cdb = { d: `M${C.cx - 23} ${r1(by1)}h6M${C.cx - 20} ${r1(by1)}V${r1(by2)}M${C.cx - 23} ${r1(by2)}h6` };
  a.cdt = { y: r1(Math.max((by1 + by2) / 2 + L.f * 0.34, by1 + L.f * 0.95)) };
  a.cll = { y: r1(by1 - L.f * 0.45) };
  a.cdl = { y: r1(by0 + L.f * 1.1) };

  // ---- the solver plot: how far each pass's aim point was from where the
  // drone would really be on arrival (the correction the next pass makes), on a log scale.
  let line = "";
  for (let n = 0; n < MAX_ITER; n++) {
    const on = n < s.n;
    const x = L.plot.x0 + n * L.plot.dx, y = on ? r1(plotY(L, s.it[n * IT.n + IT.miss])) : L.plot.y1m;
    a[`sd${n}`] = { cx: x, cy: y, opacity: on ? 1 : 0 };
    a[`sn${n}`] = { opacity: on ? 1 : 0 };
    if (on) line += `${n ? "L" : "M"}${x} ${y}`;
  }
  a.sline = { d: line };
  a.slast = { cx: L.plot.x0 + (s.n - 1) * L.plot.dx, cy: r1(plotY(L, s.it[(s.n - 1) * IT.n + IT.miss])) };

  // ---- the numbers.
  t.range = fx(s.range, 1);
  t.rangeI = fx(s.rangeI, 1);
  t.tof = fx(s.tof, 3);
  t.tofVac = fx(s.tofVac, 3);
  t.lead = `${fx(s.lead / RAD, 2)}°`;
  t.moved = fx(Math.hypot(s.vx, s.vy) * s.tof, 2);
  t.elev = `${fx(th, 2)}°`;
  t.los = fx(los, 2);
  t.drop = fx(s.drop, 2);
  t.dropVac = fx(s.dropVac, 2);
  t.speed = fx(s.vImpact, 0);
  t.height = fx(s.dy, 1);
  t.tofL = fx(s.tof, 3);
  t.dropL = fx(s.drop, 2);
  t.leadL = fx(s.lead / RAD, 2);
  t.leadC = fx(s.lead / RAD, 2);
  t.rangeL = fx(s.range, 1);
  t.elevL = fx(th, 1);

  return { a, t, det: marks, cdet: cmarks, n: { dX, dY, iX, iY, los, th, elI, mid, oldX, arcLen: s.tl[NS - 1] * L.s, ghostT: gT, ghostIn, ghostLabel } };
}

/**
 * When the round clears the muzzle as drawn. The mount is drawn larger than
 * the sky's scale, so its muzzle sits several metres downrange on the plate;
 * the round is shown from there on (speed along the path is v0 e^(-ks)).
 */
export const muzzleTime = (L: Layout) => (Math.exp((GUN.k * 89 * L.art) / L.s) - 1) / (GUN.k * GUN.v0);

/**
 * The art scale as a transform. The build rounds SVG geometry in the emitted
 * HTML to one decimal place, which would turn scale(1.25) into scale(1.3), so
 * a factor with more decimals is written as two one-decimal factors.
 */
export const artScale = (L: Layout) => (Number.isInteger(L.art * 10) ? `scale(${L.art})` : `scale(${L.art * 2}) scale(0.5)`);

/** The drone glyph's transform: it pitches a little into its direction of travel. */
export const droneAt = (L: Layout, x: number, y: number) => `translate(${r1(x)} ${r1(y)}) ${artScale(L)} rotate(-7)`;

/** The plate's live readout at each stage. */
export const readoutFlight = (s: Solution, t: number, drop: number) =>
  `t ${fx(t, 3)} s  lead ${fx(s.lead / RAD, 2)}°  drop ${fx(drop, 2)} m`;
