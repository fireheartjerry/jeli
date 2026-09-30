// The formulas behind Fig. "research", shared by the build-time SVG and the
// script so both draw exactly the same curves.

/** RNAAS 2026, ballistic transfer. f = ΔM/Md0, q0 = Md0/Ma0, total mass 1. */
export const aBallistic = (f: number, q0: number) => (1 + f * q0) ** -2;
export const muBallistic = (f: number, q0: number) => (1 - f) * (1 + f * q0);
/** L ∝ μ √a, so L/L0 = (μ/μ0) √(a/a0); this reduces to 1 − f for every q0. */
export const lBallistic = (f: number, q0: number) => muBallistic(f, q0) * Math.sqrt(aBallistic(f, q0));

/** JHSS 2026: 15% of the donor over `tmax` orbits; the conservative limit the closure follows. */
export const aClosure = (t: number, q0: number, tmax: number) => {
  const f = (0.15 * t) / tmax;
  return ((1 - f) * (1 + f * q0)) ** -2;
};

/**
 * arXiv:2608.19107. A parcel δm leaves the donor M1 for the accretor M2 with
 * velocity η v1 + (1 − η) v2, and ΔL/L = δm [(1 − η)/M2 − η/M1].
 * In units of M2 (so M1 = q = M1/M2):
 */
export const respL = (eta: number, q: number) => 1 - eta - eta / q;
/**
 * The separation follows from L = M1 M2 √(G a / M) at fixed M:
 * Δa/a = 2 (ΔL/L − ΔM1/M1 − ΔM2/M2) = 2 δm [(1 − η)/M1 − η/M2].
 * Zero at η = 1/(1 + q), which is not where ΔL = 0 unless q = 1.
 */
export const respA = (eta: number, q: number) => 2 * ((1 - eta) / q - eta);

/** Mass ratios drawn in panels (a) and (c), with their series colours. */
export const QS = [0.4, 1, 2] as const;
export const QCOL = ["red", "green", "violet"] as const;

/** The live binary diagram beside panel (c). */
export const BIN = { A0: 46, EMAX: 0.26 };
export function binary(q: number, eta: number, th: number, cx: number, cy: number, k = 1) {
  const m1 = q / (1 + q), m2 = 1 / (1 + q); // fractions of the total mass
  const da = respA(eta, q);
  const e = BIN.EMAX * Math.tanh(da / 2); // drawn change of separation, sign exact, size compressed
  const r1 = k * BIN.A0 * m2, r2 = k * BIN.A0 * m1; // distances from the centre of mass
  const c = Math.cos(th), s = Math.sin(th);
  return {
    da, dl: respL(eta, q), e, r1, r2,
    x1: cx + r1 * c, y1: cy + r1 * s,
    x2: cx - r2 * c, y2: cy - r2 * s,
    s1: k * (2.6 + 6 * Math.cbrt(m1)), s2: k * (2.6 + 6 * Math.cbrt(m2)),
  };
}
