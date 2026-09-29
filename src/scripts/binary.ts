/**
 * The binary-star model behind the hero figure, straight from the papers.
 *
 * f is the fraction of the donor's initial mass handed to the accretor and
 * q0 = Md0/Ma0. Masses are in units of the total mass, which is conserved.
 *
 * Classical (conservative) transfer keeps orbital angular momentum, so
 *   a/a0 = [(1 - f)(1 + f·q0)]^-2,
 * which widens the orbit whenever the donor is the lighter star.
 *
 * Ballistic transfer lets the gas keep the donor's velocity. The orbit then
 * loses angular momentum as L/L0 = 1 - f, and
 *   a/a0 = (1 + f·q0)^-2 < 1
 * for every mass ratio (Li 2026, RNAAS 10, 32; the η = 1 case of arXiv:2608.19107).
 */
export const Q0 = 0.4; // as in Fig. 1 of the RNAAS note
export const F_MAX = 0.15; // the note follows transfer out to 15% of the donor
export const MD0 = Q0 / (1 + Q0);
export const MA0 = 1 / (1 + Q0);

export const masses = (f: number) => ({ md: MD0 * (1 - f), ma: MA0 + MD0 * f });

export const aConservative = (f: number) => ((1 - f) * (1 + f * Q0)) ** -2;
export const aBallistic = (f: number) => (1 + f * Q0) ** -2;

/** Kepler's third law: angular speed ∝ a^(-3/2) at fixed total mass. */
export const omega = (a: number) => a ** -1.5;

/**
 * Roche geometry in the co-rotating frame, in units of the separation with
 * the centre of mass at the origin: donor at x = -ma, accretor at x = +md.
 *   Φ(x, y) = -md/r1 - ma/r2 - (x² + y²)/2
 * The critical surface through L1 is the classic figure-eight; a donor that
 * fills its lobe is exactly the left loop of it.
 */
export function roche(md: number, ma: number) {
  const x1 = -ma, x2 = md;
  const phi = (x: number, y: number) =>
    -md / Math.hypot(x - x1, y) - ma / Math.hypot(x - x2, y) - (x * x + y * y) / 2;
  const dphidx = (x: number) =>
    (md * Math.sign(x - x1)) / (x - x1) ** 2 + (ma * Math.sign(x - x2)) / (x - x2) ** 2 - x;

  // L1: the saddle on the axis between the stars.
  let lo = x1 + 1e-4, hi = x2 - 1e-4;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (dphidx(mid) > 0) lo = mid; else hi = mid;
  }
  const l1 = (lo + hi) / 2;
  const crit = phi(l1, 0);

  /** Lobe outline around star (cx) as a closed polygon, by marching rays out to Φ = Φ_L1. */
  const lobe = (cx: number, reach: number, steps = 96) => {
    const pts: [number, number][] = [];
    for (let i = 0; i < steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      const dx = Math.cos(t), dy = Math.sin(t);
      // Step out to the first crossing, then bisect it.
      let a = 1e-3, b = a;
      const step = reach / 40;
      while (b < reach && phi(cx + b * dx, b * dy) < crit) { a = b; b += step; }
      b = Math.min(b, reach);
      for (let k = 0; k < 24; k++) {
        const m = (a + b) / 2;
        if (phi(cx + m * dx, m * dy) < crit) a = m; else b = m;
      }
      pts.push([cx + a * dx, a * dy]);
    }
    return pts;
  };

  return {
    l1,
    donor: () => lobe(x1, l1 - x1),
    accretor: () => lobe(x2, x2 - l1),
  };
}

export const toPath = (pts: [number, number][], map: (x: number, y: number) => [number, number]) =>
  pts.map(([x, y], i) => {
    const [px, py] = map(x, y);
    return `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`;
  }).join("") + "Z";
