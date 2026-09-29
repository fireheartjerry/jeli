// The Equal Earth projection (Šavrič, Patterson and Jenny, 2018), in the few
// lines it takes. Parallels are straight, so a row of the dot grid is one
// latitude and each column is a longitude found by dividing out the row's
// horizontal scale. Shared by the build step and the browser.

const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796;
const M = Math.sqrt(3) / 2;
const RAD = Math.PI / 180;

/** Unit-sphere projection: lon/lat in degrees to (x, y), y pointing north. */
export function project(lon: number, lat: number): [number, number] {
  const t = Math.asin(M * Math.sin(lat * RAD));
  const t2 = t * t, t6 = t2 * t2 * t2;
  const x = (lon * RAD * Math.cos(t)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
  const y = t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
  return [x, y];
}

/** Horizontal scale of the parallel at `lat`: x = lon (radians) * rowScale(lat). */
export function rowScale(lat: number) {
  const t = Math.asin(M * Math.sin(lat * RAD));
  const t2 = t * t, t6 = t2 * t2 * t2;
  return Math.cos(t) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
}

/** Inverse of y (Newton on the parametric latitude): unit y to latitude in degrees. */
export function latOf(y: number) {
  let t = y / A1;
  for (let i = 0; i < 8; i++) {
    const t2 = t * t, t6 = t2 * t2 * t2;
    const f = t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2)) - y;
    const df = A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2);
    t -= f / df;
  }
  return Math.asin(Math.sin(t) / M) / RAD;
}

/** Great-circle angle between two lon/lat points, in radians. */
export function arc(lon1: number, lat1: number, lon2: number, lat2: number) {
  const p1 = lat1 * RAD, p2 = lat2 * RAD, dl = (lon2 - lon1) * RAD;
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
