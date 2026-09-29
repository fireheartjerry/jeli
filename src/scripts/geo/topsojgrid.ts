// Layout of Fig. "topsojmap": the Equal Earth frame, the hexagonal dot grid,
// and the curves drawn over it. Pure functions, shared by the build step and
// the browser.
import { project, latOf } from "./equalearth";

export const VIEW_W = 1200;
/** Screen units per unit of the projection. */
export const K = 218;
export const CX = VIEW_W / 2;
/** Grid pitch (about 2.2 degrees of longitude at the equator) and row height. */
export const S = 7.2;
export const ROW = (S * Math.sqrt(3)) / 2;
export const DOT_R = 2.05;
export const LAT_TOP = 83.7, LAT_BOT = -56.2;
export const PAD_T = 6;
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

/** Graticule every 30 degrees, as screen polylines. */
export function graticule(): Pt[][] {
  const lines: Pt[][] = [];
  for (let lon = -180; lon <= 180; lon += 30) {
    const l: Pt[] = [];
    for (let lat = LAT_BOT; lat < LAT_TOP; lat += 2) l.push(px(lon, lat));
    l.push(px(lon, LAT_TOP));
    lines.push(l);
  }
  for (const lat of [-30, 0, 30, 60]) {
    const l: Pt[] = [];
    for (let lon = -180; lon <= 180; lon += 10) l.push(px(lon, lat));
    lines.push(l);
  }
  return lines;
}

const RAD = Math.PI / 180;
/**
 * The circle of points `d` radians (great-circle) from a centre, projected and
 * cut where it crosses the antimeridian or leaves the frame.
 */
export function ring(lon0: number, lat0: number, d: number, steps = 180): Pt[][] {
  const p1 = lat0 * RAD, sd = Math.sin(d), cd = Math.cos(d), sp = Math.sin(p1), cp = Math.cos(p1);
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  let prevLon = NaN;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    const lat = Math.asin(sp * cd + cp * sd * Math.cos(a));
    let lon = lon0 * RAD + Math.atan2(Math.sin(a) * sd * cp, cd - sp * Math.sin(lat));
    lon = ((((lon / RAD + 180) % 360) + 360) % 360) - 180;
    const latD = lat / RAD;
    const jump = Math.abs(lon - prevLon) > 180;
    prevLon = lon;
    if (latD > LAT_TOP || latD < LAT_BOT || jump) {
      if (cur.length > 1) out.push(cur);
      cur = [];
      if (latD > LAT_TOP || latD < LAT_BOT) continue;
    }
    cur.push(px(lon, latD));
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

export const polyline = (pts: Pt[]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");

/** Dot opacity for a country's engaged sessions: log scale, floor so one session still reads. */
export const litAlpha = (s: number, max: number) => 0.24 + 0.76 * (Math.log10(Math.max(1, s)) / Math.log10(max));
