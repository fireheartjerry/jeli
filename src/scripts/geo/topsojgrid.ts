// Layout of Fig. "topsojmap": the Equal Earth frame, the hexagonal dot grid,
// and the curves drawn over it. Pure functions, shared by the build step and
// the browser.
import { project, latOf, rowScale, northing } from "./equalearth";

export const VIEW_W = 1200;
/** Screen units per unit of the projection. */
export const K = 218;
export const CX = VIEW_W / 2;
/** Grid pitch (about 2.2 degrees of longitude at the equator) and row height. */
export const S = 7.2;
export const ROW = (S * Math.sqrt(3)) / 2;
export const DOT_R = 2.05;
export const LAT_TOP = 83.7, LAT_BOT = -56.2;
export const PAD_T = 18; // headroom above the Arctic
const Y_TOP = project(0, LAT_TOP)[1];
export const X0 = CX - Math.floor((CX - 4) / S) * S;
export const TORONTO = { lon: -79.38, lat: 43.65 };

export const px = (lon: number, lat: number): [number, number] => {
  const [x, y] = project(lon, lat);
  return [CX + x * K, PAD_T + (Y_TOP - y) * K];
};
export const cellX = (r: number, c: number) => X0 + c * S + (r % 2 ? S / 2 : 0);
export const cellY = (r: number) => PAD_T + r * ROW;
export const rowLat = (r: number) => latOf(Y_TOP - (cellY(r) - PAD_T) / K);
export const lonAt = (x: number, scale: number) => (((x - CX) / K) / scale) * (180 / Math.PI);
export const ROWS = Math.floor(((Y_TOP - project(0, LAT_BOT)[1]) * K) / ROW) + 1;
export const VIEW_H = Math.ceil(cellY(ROWS - 1) + 8);

type Pt = [number, number];

/**
 * Graticule every 30 degrees, as screen polylines grouped by opacity: the
 * meridians fade out in steps toward the top and bottom of the frame, so the
 * crop never reads as a hard edge.
 */
export const GRAT_STEPS: [number, number, number][] = [
  [LAT_BOT, -46, 0.3], [-46, -38, 0.65], [-38, 58, 1], [58, 68, 0.65], [68, 76, 0.35], [76, LAT_TOP, 0.12],
];
export function graticule(): { a: number; lines: Pt[][] }[] {
  const groups = GRAT_STEPS.map(([, , a]) => ({ a, lines: [] as Pt[][] }));
  for (let lon = -180; lon <= 180; lon += 30) {
    GRAT_STEPS.forEach(([lo, hi], k) => {
      const l: Pt[] = [];
      for (let lat = lo; lat < hi; lat += 2) l.push(px(lon, lat));
      l.push(px(lon, hi));
      groups[k].lines.push(l);
    });
  }
  const full = groups[GRAT_STEPS.findIndex(([, , a]) => a === 1)];
  for (const lat of [-30, 0, 30, 60]) {
    const l: Pt[] = [];
    for (let lon = -180; lon <= 180; lon += 10) l.push(px(lon, lat));
    (lat === 60 ? groups[1] : full).lines.push(l);
  }
  return groups;
}

const RAD = Math.PI / 180;
/**
 * The circle of points `d` radians (great-circle) from a centre, projected and
 * cut where it crosses the antimeridian or leaves the frame. It is walked
 * rather than returned: `move` starts a run and `line` continues it, so it can
 * be drawn afresh every frame without making anything.
 */
export function walkRing(lon0: number, lat0: number, d: number, steps: number, move: (x: number, y: number) => void, line: (x: number, y: number) => void) {
  const p1 = lat0 * RAD, sd = Math.sin(d), cd = Math.cos(d), sp = Math.sin(p1), cp = Math.cos(p1);
  let prevLon = NaN, pen = false;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    const lat = Math.asin(sp * cd + cp * sd * Math.cos(a));
    let lon = lon0 * RAD + Math.atan2(Math.sin(a) * sd * cp, cd - sp * Math.sin(lat));
    lon = ((((lon / RAD + 180) % 360) + 360) % 360) - 180;
    const latD = lat / RAD;
    const out = latD > LAT_TOP || latD < LAT_BOT;
    if (out || Math.abs(lon - prevLon) > 180) pen = false;
    prevLon = lon;
    if (out) continue;
    const x = CX + lon * RAD * rowScale(latD) * K, y = PAD_T + (Y_TOP - northing(latD)) * K;
    if (pen) line(x, y);
    else move(x, y);
    pen = true;
  }
}

/**
 * A meridian is the same curve at every longitude, stretched sideways: at
 * height ys[j] it stands kx[j] screen units from the central meridian for each
 * degree of longitude. Sampled from the top of the frame to the bottom.
 */
export function meridians(n = 44): { ys: Float32Array; kx: Float32Array } {
  const ys = new Float32Array(n + 1), kx = new Float32Array(n + 1);
  for (let j = 0; j <= n; j++) {
    const lat = LAT_TOP + ((LAT_BOT - LAT_TOP) * j) / n;
    ys[j] = PAD_T + (Y_TOP - northing(lat)) * K;
    kx[j] = rowScale(lat) * K * RAD;
  }
  return { ys, kx };
}

/**
 * The great circle from one place to another, as `n + 1` screen points written
 * into `out` (x, y pairs) at equal steps of distance. `cut[i]` is 1 where the
 * step from point i to i + 1 crosses the antimeridian, and so jumps from one
 * edge of the map to the other. Near the pole the route runs along the top of
 * the map: on this projection the pole is a line, not a point. Returns the
 * distance in radians.
 */
export function geodesic(lon1: number, lat1: number, lon2: number, lat2: number, n: number, out: Float32Array, cut: Uint8Array) {
  const a1 = lon1 * RAD, b1 = lat1 * RAD, a2 = lon2 * RAD, b2 = lat2 * RAD;
  const x1 = Math.cos(b1) * Math.cos(a1), y1 = Math.cos(b1) * Math.sin(a1), z1 = Math.sin(b1);
  const x2 = Math.cos(b2) * Math.cos(a2), y2 = Math.cos(b2) * Math.sin(a2), z2 = Math.sin(b2);
  const w = Math.acos(Math.max(-1, Math.min(1, x1 * x2 + y1 * y2 + z1 * z2)));
  const sw = Math.sin(w) || 1;
  let prev = NaN;
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = w < 1e-6 ? 1 - f : Math.sin((1 - f) * w) / sw, B = w < 1e-6 ? f : Math.sin(f * w) / sw;
    const x = A * x1 + B * x2, y = A * y1 + B * y2, z = A * z1 + B * z2;
    const lon = Math.atan2(y, x) / RAD, lat = Math.asin(Math.max(-1, Math.min(1, z))) / RAD;
    out[i * 2] = CX + lon * RAD * rowScale(lat) * K;
    out[i * 2 + 1] = PAD_T + (Y_TOP - northing(lat)) * K;
    if (i) cut[i - 1] = Math.abs(lon - prev) > 180 ? 1 : 0;
    prev = lon;
  }
  cut[n] = 0;
  return w;
}

export const polyline = (pts: Pt[]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");

/** Dot opacity for a country's engaged sessions: log scale, floor so one session still reads. */
export const litAlpha = (s: number, max: number) => 0.24 + 0.76 * (Math.log10(Math.max(1, s)) / Math.log10(max));
