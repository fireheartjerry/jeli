// A small deterministic universe, after Worldline Engine: a seed string is
// hashed to a 32-bit fingerprint, the fingerprint seeds a PRNG, the PRNG
// places one heavy body and 52 to 80 orbiters, and a fixed-step velocity
// Verlet integrator runs the whole history up front. Every frame is stored,
// so the timeline can be played in either direction and always lands on the
// same state. Shared by the build-time snapshot and the live canvas.
//
// Alongside positions, each frame records the system's total energy
// (kinetic plus softened pairwise potential), so the figure can show how far
// the integrator drifts from exact conservation.

export const FRAMES = 900;
export const MAX_BODIES = 81; // 1 central + up to 80 orbiters
export const VIEW_W = 640;
export const VIEW_H = 400;
export const SUBSTEPS = 3;
/** Integrator step in simulation time units; one stored frame is one unit. */
export const DT = 1 / SUBSTEPS;

/** cyrb53 string hash, folded to 32 bits. */
export function fingerprint(str: string): number {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

export const hex = (h: number) => "0x" + h.toString(16).padStart(8, "0");

/** mulberry32: a tiny, fast, well-mixed 32-bit PRNG. */
export function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Orbit families, by osculating semi-major axis at t = 0. */
export const FAMILY_INNER = 1, FAMILY_OUTER = 2;
export const A_INNER = 120, A_OUTER = 240;

export interface Camera {
  /** Azimuth of the disk on screen, radians. */
  phi: number;
  /** Cosine of the viewing angle (1 = face on). */
  tilt: number;
}

export interface Universe {
  n: number; // bodies including the central one at index 0
  accent: number; // index of the highlighted orbiter
  /** Projected positions for the seeded camera, frame-major: [(f * MAX_BODIES + i) * 2 + {0,1}]. */
  pos: Float32Array;
  /** Positions relative to the central body, frame-major: [(f * MAX_BODIES + i) * 3 + {0,1,2}]. */
  xyz: Float32Array;
  /** Dot radius in CSS pixels, from mass (radius ∝ m^1/3). */
  size: Float32Array;
  /** Mass in units of the central body. */
  mass: Float32Array;
  /** Sum of all masses, in units of the central body. */
  totalMass: number;
  /** Osculating semi-major axis at t = 0 (Infinity if unbound). */
  sma: Float32Array;
  /** 0 = ink, FAMILY_INNER, FAMILY_OUTER. */
  family: Uint8Array;
  /** Total energy at each frame (in G = 1 units scaled by the central mass). */
  energy: Float64Array;
  /** |E(f) - E(0)| / |E(0)| at each frame. */
  dE: Float32Array;
  dEmax: number;
  dEmaxFrame: number;
  /** The seeded camera. */
  cam: Camera;
}

export function createUniverse(): Universe {
  return {
    n: 0,
    accent: 1,
    pos: new Float32Array(FRAMES * MAX_BODIES * 2),
    xyz: new Float32Array(FRAMES * MAX_BODIES * 3),
    size: new Float32Array(MAX_BODIES),
    mass: new Float32Array(MAX_BODIES),
    totalMass: 0,
    sma: new Float32Array(MAX_BODIES),
    family: new Uint8Array(MAX_BODIES),
    energy: new Float64Array(FRAMES),
    dE: new Float32Array(FRAMES),
    dEmax: 0,
    dEmaxFrame: 0,
    cam: { phi: 0, tilt: 0.5 },
  };
}

// Integrator scratch, allocated once.
const X = new Float64Array(MAX_BODIES), Y = new Float64Array(MAX_BODIES), Z = new Float64Array(MAX_BODIES);
const VX = new Float64Array(MAX_BODIES), VY = new Float64Array(MAX_BODIES), VZ = new Float64Array(MAX_BODIES);
const AX = new Float64Array(MAX_BODIES), AY = new Float64Array(MAX_BODIES), AZ = new Float64Array(MAX_BODIES);
const MU = new Float64Array(MAX_BODIES);

const GM = 150; // central body's gravitational parameter, world units
const EPS2 = 25; // softening length squared
const R_IN = 48, R_OUT = 300; // extent of the disk

/** Centre of the disk on screen. */
export const CX = VIEW_W / 2, CY = VIEW_H / 2 - 10;

function accelerations(n: number) {
  AX.fill(0, 0, n);
  AY.fill(0, 0, n);
  AZ.fill(0, 0, n);
  for (let i = 0; i < n; i++) {
    const xi = X[i], yi = Y[i], zi = Z[i], mi = MU[i];
    for (let j = i + 1; j < n; j++) {
      const dx = X[j] - xi, dy = Y[j] - yi, dz = Z[j] - zi;
      const r2 = dx * dx + dy * dy + dz * dz + EPS2;
      const inv = 1 / (r2 * Math.sqrt(r2));
      const fx = dx * inv, fy = dy * inv, fz = dz * inv;
      const mj = MU[j];
      AX[i] += fx * mj; AY[i] += fy * mj; AZ[i] += fz * mj;
      AX[j] -= fx * mi; AY[j] -= fy * mi; AZ[j] -= fz * mi;
    }
  }
}

/**
 * Total energy, times G: sum of mu v^2 / 2 minus sum over pairs of
 * mu_i mu_j / sqrt(r^2 + eps^2), the potential whose gradient is exactly the
 * softened force the integrator uses.
 */
function totalEnergy(n: number) {
  let k = 0, u = 0;
  for (let i = 0; i < n; i++) {
    k += 0.5 * MU[i] * (VX[i] * VX[i] + VY[i] * VY[i] + VZ[i] * VZ[i]);
    const xi = X[i], yi = Y[i], zi = Z[i], mi = MU[i];
    for (let j = i + 1; j < n; j++) {
      const dx = X[j] - xi, dy = Y[j] - yi, dz = Z[j] - zi;
      u -= (mi * MU[j]) / Math.sqrt(dx * dx + dy * dy + dz * dz + EPS2);
    }
  }
  return (k + u) / GM;
}

/**
 * Place body i on an orbit of radius r about the centre: in-plane position
 * and velocity, then the orbit plane is tipped by `inc` about a line of nodes
 * at angle `node` (Rodrigues rotation about a horizontal axis).
 */
function place(i: number, r: number, th: number, v: number, pitch: number, inc: number, node: number) {
  const px = r * Math.cos(th), py = r * Math.sin(th);
  const a = th + Math.PI / 2 + pitch;
  const qx = v * Math.cos(a), qy = v * Math.sin(a);
  const kx = Math.cos(node), ky = Math.sin(node);
  const c = Math.cos(inc), s = Math.sin(inc);
  // For a vector (x, y, 0) and unit axis (kx, ky, 0):
  // v' = v c + (k x v) s + k (k . v)(1 - c)
  const rot = (x: number, y: number, out: 0 | 1) => {
    const d = (kx * x + ky * y) * (1 - c);
    const rx = x * c + kx * d, ry = y * c + ky * d, rz = (kx * y - ky * x) * s;
    if (out === 0) { X[i] = rx; Y[i] = ry; Z[i] = rz; }
    else { VX[i] = rx; VY[i] = ry; VZ[i] = rz; }
  };
  rot(px, py, 0);
  rot(qx, qy, 1);
}

/** Dot radius from mass (in central masses): constant density, so r ∝ m^1/3. */
const radius = (m: number) => 0.75 + 10.5 * Math.cbrt(m);

/** Generate and fully simulate the universe for a seed, into `u`. */
export function generate(seed: string, u: Universe): Universe {
  const rnd = mulberry32(fingerprint(seed));
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) * 1.41; // ~N(0, 1)
  const n = 1 + 52 + Math.floor(rnd() * 29); // 52 to 80 orbiters
  u.n = n;

  // Camera: orientation of the disk and how steeply we look down on it.
  const phi = rnd() * Math.PI * 2;
  const tilt = 0.5 + rnd() * 0.14; // cos of the viewing angle
  const lift = Math.sqrt(1 - tilt * tilt);
  const cphi = Math.cos(phi), sphi = Math.sin(phi);
  u.cam = { phi, tilt };

  X[0] = Y[0] = Z[0] = 0;
  MU[0] = GM;

  // The accent body is the system's one sizeable planet, on a clearly
  // elliptical orbit through the middle of the disk, so its neighbours feel it.
  // The draw order below is fixed: changing it would change every universe.
  const acc = 1 + Math.floor(rnd() * (n - 1));
  let px = 0, py = 0, pz = 0;
  for (let i = 1; i < n; i++) {
    const th = rnd() * Math.PI * 2;
    const node = rnd() * Math.PI * 2;
    const vc = (r: number) => Math.sqrt(GM / r);
    if (i === acc) {
      const r = 120 + rnd() * 50;
      MU[i] = GM * (0.008 + rnd() * 0.004);
      place(i, r, th, vc(r) * (0.84 + rnd() * 0.06), 0.1 * gauss(), 0.03 * gauss(), node);
    } else {
      const kind = rnd();
      const r = R_IN + (R_OUT - R_IN) * Math.pow(rnd(), 0.72);
      // Mostly near-circular with modest seeded eccentricity; a few plunging
      // eccentric orbits; the odd body fast enough to escape.
      const f = kind < 0.025 ? 1.42 + rnd() * 0.12
        : kind < 0.11 ? 0.62 + rnd() * 0.14
        : 0.965 + rnd() * 0.07;
      const heavy = rnd() < 0.08;
      MU[i] = GM * (heavy ? 0.002 + rnd() * 0.003 : 0.00002 + 0.0003 * rnd() * rnd());
      place(i, r, th, vc(r) * f, 0.05 * gauss(), 0.07 * gauss(), node);
      rnd(); // formerly the dot size; still drawn so every seed keeps its universe
    }
    px += MU[i] * VX[i]; py += MU[i] * VY[i]; pz += MU[i] * VZ[i];
  }
  // The central body recoils so total momentum is zero.
  VX[0] = -px / GM; VY[0] = -py / GM; VZ[0] = -pz / GM;
  u.accent = acc;

  // Masses, sizes and orbit families (osculating a about the central body).
  let mt = 0;
  for (let i = 0; i < n; i++) {
    const m = MU[i] / GM;
    u.mass[i] = m;
    mt += m;
    u.size[i] = i === 0 ? 4.5 : radius(m);
    if (i === 0) { u.sma[0] = 0; u.family[0] = 0; continue; }
    const dx = X[i] - X[0], dy = Y[i] - Y[0], dz = Z[i] - Z[0];
    const dvx = VX[i] - VX[0], dvy = VY[i] - VY[0], dvz = VZ[i] - VZ[0];
    const mu = MU[0] + MU[i];
    const eps = 0.5 * (dvx * dvx + dvy * dvy + dvz * dvz) - mu / Math.sqrt(dx * dx + dy * dy + dz * dz);
    const a = eps < 0 ? -mu / (2 * eps) : Infinity;
    u.sma[i] = a;
    u.family[i] = i === acc || !isFinite(a) ? 0 : a < A_INNER ? FAMILY_INNER : a > A_OUTER ? FAMILY_OUTER : 0;
  }
  u.totalMass = mt;

  // Positions are stored relative to the central body, then projected: the
  // disk stays centred however the star wobbles.
  const store = (f: number) => {
    const b2 = f * MAX_BODIES * 2, b3 = f * MAX_BODIES * 3;
    const ox = X[0], oy = Y[0], oz = Z[0];
    for (let i = 0; i < n; i++) {
      const x = X[i] - ox, y = Y[i] - oy, z = Z[i] - oz;
      u.xyz[b3 + i * 3] = x;
      u.xyz[b3 + i * 3 + 1] = y;
      u.xyz[b3 + i * 3 + 2] = z;
      u.pos[b2 + i * 2] = CX + x * cphi - y * sphi;
      u.pos[b2 + i * 2 + 1] = CY + (x * sphi + y * cphi) * tilt - z * lift;
    }
  };

  const dt = DT;
  accelerations(n);
  store(0);
  const e0 = totalEnergy(n);
  u.energy[0] = e0;
  u.dE[0] = 0;
  let dmax = 0, dmaxF = 0;
  for (let f = 1; f < FRAMES; f++) {
    for (let s = 0; s < SUBSTEPS; s++) {
      for (let i = 0; i < n; i++) {
        VX[i] += 0.5 * AX[i] * dt; VY[i] += 0.5 * AY[i] * dt; VZ[i] += 0.5 * AZ[i] * dt;
        X[i] += VX[i] * dt; Y[i] += VY[i] * dt; Z[i] += VZ[i] * dt;
      }
      accelerations(n);
      for (let i = 0; i < n; i++) {
        VX[i] += 0.5 * AX[i] * dt; VY[i] += 0.5 * AY[i] * dt; VZ[i] += 0.5 * AZ[i] * dt;
      }
    }
    store(f);
    const e = totalEnergy(n);
    const d = Math.abs((e - e0) / e0);
    u.energy[f] = e;
    u.dE[f] = d;
    if (d > dmax) { dmax = d; dmaxF = f; }
  }
  u.dEmax = dmax;
  u.dEmaxFrame = dmaxF;
  return u;
}

/**
 * Project a stored body into view coordinates for a camera, writing
 * [x, y] into `out`. With the seeded camera this reproduces `pos` exactly
 * (up to float32 rounding).
 */
export function projector(cam: Camera) {
  const c = Math.cos(cam.phi), s = Math.sin(cam.phi);
  const t = cam.tilt, l = Math.sqrt(1 - t * t);
  return { c, s, t, l };
}

/** Scientific notation parts: v = m × 10^e, with m rounded to `digits`. */
export function sciParts(v: number, digits = 1): { m: string; e: string } {
  if (!isFinite(v) || v <= 0) return { m: "0", e: "0" };
  let e = Math.floor(Math.log10(v));
  let m = v / 10 ** e;
  if (Number(m.toFixed(digits)) >= 10) { m /= 10; e += 1; }
  return { m: m.toFixed(digits), e: e < 0 ? `−${-e}` : String(e) };
}

/** a×10^b as HTML, e.g. 3.2×10<sup>−5</sup>. */
export function sci(v: number, digits = 1): string {
  const { m, e } = sciParts(v, digits);
  return `${m}×10<sup>${e}</sup>`;
}

export const TRAIL = 90;
export const ACCENT_TRAIL = 300;
/** Opacity of each equal piece of a trail, oldest first. */
export const TRAIL_ALPHA = [0.04, 0.08, 0.13, 0.19, 0.26, 0.34, 0.44, 0.56];
export const ACCENT_ALPHA = [0.06, 0.12, 0.2, 0.3, 0.42, 0.56, 0.72, 0.9];

/** Sparkline of |ΔE/E0| over the timeline: `cols` max-pooled columns in a w×h box. */
export function sparkPath(u: Universe, w: number, h: number, cols = 120, pad = 2): string {
  const max = u.dEmax || 1;
  let d = "";
  for (let c = 0; c < cols; c++) {
    const a = Math.floor((c * FRAMES) / cols), b = Math.floor(((c + 1) * FRAMES) / cols);
    let m = 0;
    for (let f = a; f < b; f++) if (u.dE[f] > m) m = u.dE[f];
    const x = (c / (cols - 1)) * w;
    const y = h - pad - (m / max) * (h - 2 * pad);
    d += `${c ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

/** Counts per family, excluding the central body and the accent planet: [ink, inner, outer]. */
export function familyCounts(u: Universe): [number, number, number] {
  const k: [number, number, number] = [0, 0, 0];
  for (let i = 1; i < u.n; i++) if (i !== u.accent) k[u.family[i]]++;
  return k;
}

/** Camera azimuth and elevation in degrees, for the viewport readout. */
export const camDeg = (phi: number, tilt: number) => ({
  az: (((phi * 180) / Math.PI) % 360 + 360) % 360,
  el: (Math.asin(Math.min(1, tilt)) * 180) / Math.PI,
});
