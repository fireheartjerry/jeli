// Physics for Fig. 404: a body knocked off a closed orbit and onto a hyperbola.
//
// A star of one solar mass, a body on an ellipse round it, and one impulsive
// kick that leaves the body faster than the local escape speed. From that
// instant its path is a hyperbola with the star at the focus: it falls in,
// rounds the star once, and leaves along the asymptote for good.
//
// Pure functions, no DOM. Shared by the server render (the still frame) and
// the client script (every frame), so the two can never disagree.
//
// Units: AU, days, and km/s where a speed is shown. Angles in radians, in the
// usual frame (x right, y up); the plate flips y when it draws.

/** GM of the Sun, AU³/day²: the square of the Gaussian gravitational constant. */
export const MU = 0.01720209895 ** 2;
/** One AU a day, in km/s. */
export const KMS = 149597870.7 / 86400;
/** The interval between the marks left along the path, and of each swept sector, days. */
export const STEP = 30;
/** How long the body is shown on its old orbit before the kick, days. */
export const BEFORE = 100;

// ---------------------------------------------------------------- Kepler

/**
 * Kepler's equation for a hyperbola, M = e·sinh H − H, solved for H by
 * Newton's method. M runs linearly with time; H is what gives the position.
 * Returns the number of steps taken as well: the plate shows it.
 */
export function solveH(M: number, e: number): { H: number; steps: number } {
  // Far out sinh dominates; near periapsis the equation is nearly linear. Start from whichever fits.
  let H = Math.abs(M) > 4 * e ? Math.sign(M) * Math.log((2 * Math.abs(M)) / e + 1.8) : M / (e - 1 + 0.4 * Math.abs(M));
  let steps = 0;
  for (; steps < 40; steps++) {
    const f = e * Math.sinh(H) - H - M;
    const dH = f / (e * Math.cosh(H) - 1);
    H -= dH;
    if (Math.abs(dH) < 1e-13) break;
  }
  return { H, steps: steps + 1 };
}

/** Kepler's equation for an ellipse, M = E − e·sin E, the same way. */
export function solveE(M: number, e: number): number {
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 30; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-13) break;
  }
  return E;
}

// ---------------------------------------------------------------- one departure

export interface Departure {
  /** The orbit it had: semi-major axis, eccentricity, direction of periapsis, mean motion, mean anomaly at the kick. */
  a0: number;
  e0: number;
  w0: number;
  n0: number;
  M0: number;
  /** Where and how hard it was kicked: position, the change of velocity, and its size in km/s. */
  kick: { x: number; y: number; dvx: number; dvy: number; dv: number };
  /** The orbit it has now. a is the distance from the centre to the vertex (the semi-major axis is −a). */
  a: number;
  e: number;
  w: number;
  n: number;
  /** Mean and hyperbolic anomaly at the kick: negative, it is still on its way in. */
  Mk: number;
  Hk: number;
  /** Periapsis distance, the speed left at infinity, and the direction it leaves in. */
  q: number;
  vinf: number;
  out: number;
  /** Twice the area swept per day: the angular momentum, constant along the whole path. */
  h: number;
}

export interface State {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  v: number;
  H: number;
  steps: number;
}

const rot = (x: number, y: number, a: number): [number, number] => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

/** Mulberry32: small, fast, and the same numbers everywhere. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The i-th departure. The same i always gives the same orbit, kick and escape:
 * the elements are drawn from a generator seeded by the number of the page
 * that was not found and by i, and redrawn until the result fits the plate.
 */
export function departure(i: number): Departure {
  const next = rng(404 * 2654435761 + i * 40503);
  const pick = (lo: number, hi: number) => lo + (hi - lo) * next();
  for (let tries = 0; ; tries++) {
    // The orbit it had, with its periapsis along +x for now.
    const a0 = pick(0.95, 1.3), e0 = pick(0.12, 0.45);
    const p0 = a0 * (1 - e0 * e0);
    // Kicked on the way in, in the outer half of the orbit.
    const nu0 = -pick(0.55, 0.92) * Math.PI;
    const r = p0 / (1 + e0 * Math.cos(nu0));
    const x = r * Math.cos(nu0), y = r * Math.sin(nu0);
    const k0 = Math.sqrt(MU / p0);
    const vx0 = -k0 * Math.sin(nu0), vy0 = k0 * (e0 + Math.cos(nu0));
    // The kick: it leaves the body a little over the local escape speed and
    // turned in toward the star, so that it falls a long way before it leaves.
    const over = pick(1.04, 1.26), turn = pick(0.1, 0.8);
    const v0 = Math.hypot(vx0, vy0), v1 = over * Math.sqrt((2 * MU) / r);
    const [vx, vy] = rot((vx0 / v0) * v1, (vy0 / v0) * v1, turn);

    // The orbit it has now, from the state alone.
    const v2 = vx * vx + vy * vy, rv = x * vx + y * vy;
    const energy = v2 / 2 - MU / r;
    const a = MU / (2 * energy);
    const ex = ((v2 - MU / r) * x - rv * vx) / MU, ey = ((v2 - MU / r) * y - rv * vy) / MU;
    const e = Math.hypot(ex, ey);
    const w = Math.atan2(ey, ex);
    const h = x * vy - y * vx;
    const q = a * (e - 1);
    // Where it is on the hyperbola at the kick: true anomaly, then the hyperbolic anomaly, then the mean.
    let nu = Math.atan2(y, x) - w;
    nu = Math.atan2(Math.sin(nu), Math.cos(nu));
    const Hk = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2));
    const Mk = e * Math.sinh(Hk) - Hk;
    const vinf = Math.sqrt(MU / a);
    const dvx = vx - vx0, dvy = vy - vy0;

    // Fit for the plate: a real swing round the star, not too close to it, and a kick that can be read.
    const fits = h > 0 && rv < 0 && e > 1.08 && e < 1.9 && q > 0.2 && q < 0.5 && nu < -0.9;
    if (!fits && tries < 400) continue;

    // Turn the whole system so that it leaves across the open side of the plate.
    const leave = w + Math.acos(-1 / e);
    const to = pick(-0.34, 0.3) - leave;
    const E0 = 2 * Math.atan(Math.sqrt((1 - e0) / (1 + e0)) * Math.tan(nu0 / 2));
    const [kx, ky] = rot(x, y, to), [kdx, kdy] = rot(dvx, dvy, to);
    return {
      a0, e0, w0: to, n0: Math.sqrt(MU / a0 ** 3), M0: E0 - e0 * Math.sin(E0),
      kick: { x: kx, y: ky, dvx: kdx, dvy: kdy, dv: Math.hypot(dvx, dvy) * KMS },
      a, e, w: w + to, n: Math.sqrt(MU / a ** 3), Mk, Hk, q, vinf, out: leave + to, h,
    };
  }
}

/** Where the body is t days after the kick, on the hyperbola. */
export function escaping(d: Departure, t: number): State {
  const { H, steps } = solveH(d.Mk + d.n * t, d.e);
  return atH(d, H, steps);
}

/** The state at a given hyperbolic anomaly. Everything the plate shows is read off this. */
export function atH(d: Departure, H: number, steps = 0): State {
  const ch = Math.cosh(H), sh = Math.sinh(H), b = d.a * Math.sqrt(d.e * d.e - 1);
  const r = d.a * (d.e * ch - 1);
  // dH/dt = n / (e·cosh H − 1): the body moves fastest where it is nearest.
  const dH = d.n / (d.e * ch - 1);
  const [x, y] = rot(d.a * (d.e - ch), b * sh, d.w);
  const [vx, vy] = rot(-d.a * sh * dH, b * ch * dH, d.w);
  return { x, y, vx, vy, r, v: Math.hypot(vx, vy), H, steps };
}

/** Where it would be t days after the kick had there been no kick: still on its ellipse. Also where it was before (t < 0). */
export function bound(d: Departure, t: number): State {
  const E = solveE(d.M0 + d.n0 * t, d.e0);
  const b = d.a0 * Math.sqrt(1 - d.e0 * d.e0), dE = d.n0 / (1 - d.e0 * Math.cos(E));
  const [x, y] = rot(d.a0 * (Math.cos(E) - d.e0), b * Math.sin(E), d.w0);
  const [vx, vy] = rot(-d.a0 * Math.sin(E) * dE, b * Math.cos(E) * dE, d.w0);
  return { x, y, vx, vy, r: Math.hypot(x, y), v: Math.hypot(vx, vy), H: E, steps: 0 };
}

/** The local escape speed at distance r, AU/day. */
export const escapeSpeed = (r: number) => Math.sqrt((2 * MU) / r);

/** Vis-viva for the hyperbola: v² = μ(2/r + 1/a). A check on the state, never its source. */
export const visViva = (d: Departure, r: number) => Math.sqrt(MU * (2 / r + 1 / d.a));

/**
 * What an observer would work out from one position and velocity, knowing
 * nothing else: the eccentricity of the orbit, and the speed left at infinity
 * if there is any. The plate's readouts all come through here.
 */
export function observe(s: State) {
  const v2 = s.v * s.v, rv = s.x * s.vx + s.y * s.vy, energy = v2 / 2 - MU / s.r;
  const ex = ((v2 - MU / s.r) * s.x - rv * s.vx) / MU, ey = ((v2 - MU / s.r) * s.y - rv * s.vy) / MU;
  return { e: Math.hypot(ex, ey), over: s.v / escapeSpeed(s.r), r: s.r, vinf: energy > 0 ? Math.sqrt(2 * energy) * KMS : null };
}

// ---------------------------------------------------------------- the plate

/** The plate: its size, where the star stands, pixels to the AU, and pixels of arrow to the km/s. */
export const PLATE = { w: 640, h: 400, cx: 224, cy: 204, au: 84, arrow: 1.05 } as const;
const px = (x: number) => PLATE.cx + PLATE.au * x;
const py = (y: number) => PLATE.cy - PLATE.au * y;
const f1 = (v: number) => v.toFixed(1);
/** Three places, with a true minus sign and no negative zero. */
const signed = (v: number) => (v.toFixed(3) === "-0.000" ? "0.000" : v.toFixed(3).replace("-", "\u2212"));
const inside = (x: number, y: number, pad: number) => x > -pad && x < PLATE.w + pad && y > -pad && y < PLATE.h + pad;

/** Everything about one departure that does not change while it plays. */
export interface Chart {
  i: number;
  d: Departure;
  /** The old orbit, as an ellipse element: centre, radii, and the turn of its long axis in degrees. */
  orbit: { cx: number; cy: number; rx: number; ry: number; turn: number };
  /** The hyperbola from the kick to past the edge of the plate, the anomalies it was sampled at, and the length along it to each. */
  path: string;
  Hs: number[];
  len: number[];
  asym: [number, number, number, number];
  /** Where the asymptote is named: near where it leaves the plate, on the side away from the path. */
  named: { x: number; y: number };
  /** The kick: where, and the far end of the stroke that shows its direction. */
  kick: { x: number; y: number; x2: number; y2: number; turn: number; label: string; lx: number; ly: number; anchor: "start" | "end" };
  /** The sector swept in the STEP days centred on periapsis, and the nearest approach, named on the side away from the star. */
  peri: string;
  near: { x: number; y: number; label: string; anchor: "start" | "end" };
  /** Days after the kick of periapsis, and of leaving the plate. */
  tPeri: number;
  tExit: number;
}

/** The sector swept by the line from the star to the body between two times, as a path. */
function sector(d: Departure, t0: number, t1: number, n = 8) {
  let out = `M${PLATE.cx} ${PLATE.cy}`;
  for (let k = 0; k <= n; k++) {
    const s = escaping(d, t0 + ((t1 - t0) * k) / n);
    out += `L${f1(px(s.x))} ${f1(py(s.y))}`;
  }
  return out + "Z";
}

export function chart(i: number): Chart {
  const d = departure(i);
  const { cx, cy, au } = PLATE;
  // The old ellipse: its centre is a0·e0 behind the star along its long axis.
  const orbit = {
    cx: cx - au * d.a0 * d.e0 * Math.cos(d.w0), cy: cy + au * d.a0 * d.e0 * Math.sin(d.w0),
    rx: au * d.a0, ry: au * d.a0 * Math.sqrt(1 - d.e0 * d.e0), turn: (-d.w0 * 180) / Math.PI,
  };
  // The hyperbola, sampled evenly in H (so most closely where it bends most) until it is off the plate.
  const Hs: number[] = [], len: number[] = [];
  let path = "", lx = 0, ly = 0, total = 0, tExit = 0;
  for (let k = 0; k < 400; k++) {
    const H = d.Hk + k * 0.045;
    const s = atH(d, H), x = px(s.x), y = py(s.y);
    if (k) total += Math.hypot(x - lx, y - ly);
    Hs.push(H);
    len.push(total);
    path += `${k ? "L" : "M"}${f1(x)} ${f1(y)}`;
    lx = x;
    ly = y;
    if (k && !inside(x, y, 26)) {
      tExit = (d.e * Math.sinh(H) - H - d.Mk) / d.n;
      break;
    }
  }
  // The asymptote: through the hyperbola's centre, a·e beyond the star along the periapsis line, in the direction of leaving.
  // It is drawn from the point on it nearest the star, which is the star's miss distance, outward.
  const ox = px(d.a * d.e * Math.cos(d.w)), oy = py(d.a * d.e * Math.sin(d.w));
  const ux = Math.cos(d.out), uy = -Math.sin(d.out);
  const foot = (cx - ox) * ux + (cy - oy) * uy;
  const asym: Chart["asym"] = [ox + ux * foot, oy + uy * foot, ox + ux * (foot + 900), oy + uy * (foot + 900)];
  // Its name sits a little in from the right edge, across the line from the star.
  const run = (PLATE.w - 16 - asym[0]) / ux, far = (asym[1] + uy * run > cy ? 1 : -1);
  const named = { x: PLATE.w - 16, y: Math.min(PLATE.h - 10, Math.max(16, asym[1] + uy * run + (far > 0 ? 15 : -7))) };
  // The kick is drawn as a stroke along the change of velocity, and named on the side away from the star.
  const kx = px(d.kick.x), ky = py(d.kick.y);
  const stroke = (d.kick.dv * PLATE.arrow) / Math.hypot(d.kick.dvx, d.kick.dvy);
  const away = Math.hypot(kx - cx, ky - cy), nx = (kx - cx) / away, ny = (ky - cy) / away;
  const kick = {
    x: kx, y: ky, x2: kx + d.kick.dvx * stroke, y2: ky - d.kick.dvy * stroke, turn: (Math.atan2(-d.kick.dvy, d.kick.dvx) * 180) / Math.PI,
    label: `kick, ${f1(d.kick.dv)} km/s`, lx: kx + nx * 12, ly: ky + ny * 12 + 4, anchor: (nx < 0 ? "end" : "start") as "start" | "end",
  };
  const tPeri = -d.Mk / d.n;
  const qx = Math.cos(d.w), qy = -Math.sin(d.w);
  const near = { x: cx + qx * (au * d.q + 10), y: cy + qy * (au * d.q + 10) + (qy > 0 ? 9 : 0), label: `nearest, ${d.q.toFixed(2)} AU`, anchor: (qx < 0 ? "end" : "start") as "start" | "end" };
  return { i, d, orbit, path, Hs, len, asym, named, kick, peri: sector(d, tPeri - STEP / 2, tPeri + STEP / 2), near, tPeri, tExit };
}

/** Everything that does change: one instant of one departure, ready to be written to the plate. */
export interface Frame {
  /** After the kick, and so on the hyperbola. */
  free: boolean;
  /** The body, the point it would be at on its old orbit, the head of its velocity arrow and the mark of escape speed along it. */
  x: number; y: number; gx: number; gy: number; tx: number; ty: number; ex: number; ey: number;
  /** The arrowhead's turn in degrees, the length of path behind the body, the sector of the last STEP days, the marks dropped so far. */
  heading: number;
  flown: number;
  wedge: string;
  marks: number;
  /** The sector at periapsis is shown once the body is past it. */
  past: boolean;
  /** The readouts. The excess speed is empty while the orbit is closed: there is none. */
  e: string; over: string; r: string; vinf: string; day: string; kepler: string;
}

export function frame(c: Chart, t: number): Frame {
  const { d } = c;
  const free = t >= 0;
  const s = free ? escaping(d, t) : bound(d, t);
  const g = bound(d, t);
  const x = px(s.x), y = py(s.y);
  // The arrow is the velocity, to scale; the mark on it is the local escape speed at the same scale.
  const k = PLATE.arrow * KMS, dirx = s.vx / s.v, diry = -s.vy / s.v, esc = escapeSpeed(s.r) * k;
  // How far along the drawn path the body is: found between the two samples its anomaly lies between.
  let flown = 0;
  if (free) {
    const u = Math.min(c.Hs.length - 1.001, Math.max(0, (s.H - d.Hk) / 0.045)), j = Math.floor(u);
    flown = c.len[j] + (c.len[j + 1] - c.len[j]) * (u - j);
  }
  const o = observe(s);
  return {
    free, x, y, gx: px(g.x), gy: py(g.y),
    tx: x + dirx * s.v * k, ty: y + diry * s.v * k, ex: x + dirx * esc, ey: y + diry * esc,
    heading: (Math.atan2(diry, dirx) * 180) / Math.PI,
    flown,
    wedge: free && t > 0.5 ? sector(d, Math.max(0, t - STEP), t) : "",
    marks: free ? Math.floor(t / STEP) : 0,
    past: t > c.tPeri + STEP / 2,
    e: o.e.toFixed(3), over: o.over.toFixed(2), r: o.r.toFixed(2), vinf: o.vinf === null ? "" : f1(o.vinf),
    day: `${Math.round(t) < 0 ? "\u2212" : "+"}${Math.abs(Math.round(t))}`,
    kepler: `${free ? "H" : "E"} = ${signed(s.H)}${free ? ` in ${s.steps} ${s.steps === 1 ? "step" : "steps"}` : ""}`,
  };
}

/** The marks left every STEP days along the path, up to the n-th, as one path of small circles. */
export function marks(c: Chart, n: number, r = 2) {
  let out = "";
  for (let k = 1; k <= n; k++) {
    const s = escaping(c.d, k * STEP);
    out += `M${f1(px(s.x) - r)} ${f1(py(s.y))}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
  }
  return out;
}
