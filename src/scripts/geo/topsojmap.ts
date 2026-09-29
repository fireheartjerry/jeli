// Build-time geometry for Fig. "topsojmap": a dot-matrix world on the Equal
// Earth projection. Land is sampled on a regular hexagonal grid in screen
// space; each dot belongs to the world-atlas country it falls in, and the
// countries in the Google Analytics export light up by log(engaged sessions).
// Build only (it reads world-atlas); the browser gets the packed result.
import { feature } from "topojson-client";
import { rowScale } from "./equalearth";
import { S, ROW, X0, PAD_T, ROWS, VIEW_W, px, cellX, cellY, rowLat, lonAt } from "./topsojgrid";
import ga from "../../data/ga-countries.json";
// Natural Earth 1:50m admin-0 countries, read as text so the type checker never walks it.
import worldRaw from "world-atlas/countries-50m.json?raw";

// Google Analytics names that differ from Natural Earth's (world-atlas).
const ALIAS: Record<string, string> = {
  "United States": "United States of America",
  "Türkiye": "Turkey",
  "Dominican Republic": "Dominican Rep.",
  "Côte d’Ivoire": "Côte d'Ivoire",
  "Myanmar (Burma)": "Myanmar",
  "Congo - Brazzaville": "Congo",
  "Congo - Kinshasa": "Dem. Rep. Congo",
  "Bosnia & Herzegovina": "Bosnia and Herz.",
  "North Macedonia": "Macedonia",
  "Trinidad & Tobago": "Trinidad and Tobago",
  "Western Sahara": "W. Sahara",
  "Cape Verde": "Cabo Verde",
  "South Sudan": "S. Sudan",
  "British Virgin Islands": "British Virgin Is.",
  "Cayman Islands": "Cayman Is.",
  "Faroe Islands": "Faeroe Is.",
  "St. Lucia": "Saint Lucia",
  "St. Vincent & Grenadines": "St. Vin. and Gren.",
  "Turks & Caicos Islands": "Turks and Caicos Is.",
  "U.S. Virgin Islands": "U.S. Virgin Is.",
};
// Natural Earth splits a few territories off; fold them into the country GA reports.
const FOLD: Record<string, string> = { "N. Cyprus": "Cyprus", Somaliland: "Somalia" };
const pretty = (s: string) =>
  s.replace(/ Is\.$/, " Islands").replace(/ I\. /, " Island ").replace(/\bRep\./, "Republic").replace(/^Dem\. /, "Democratic ")
    .replace(/^S\. /, "South ").replace(/^N\. /, "North ").replace(/^W\. /, "Western ").replace(/^Eq\. /, "Equatorial ")
    .replace(/^Fr\. /, "French ").replace(/Herz\./, "Herzegovina").replace(/ and /, " & ");

type Ring = number[][];
/** A polygon's rings; `wrap` polygons cross the antimeridian and are stored in 0..360. */
type Poly = Ring[] & { wrap?: boolean };
interface Country { name: string; polys: Poly[]; box: [number, number, number, number] }

function inPoly(lon: number, lat: number, rings: Poly) {
  if (rings.wrap && lon < 0) lon += 360;
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** Area-weighted centroid of a country's largest polygon (its main landmass). */
function mainPoint(c: Country): [number, number] {
  let best: Ring | null = null, bestA = -1;
  for (const p of c.polys) {
    const r = p[0];
    let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
    if (Math.abs(a) > bestA) { bestA = Math.abs(a); best = r; }
  }
  let cx = 0, cy = 0, a = 0;
  const r = best!;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
    a += f; cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f;
  }
  const [lon, lat] = Math.abs(a) < 1e-9 ? [r[0][0], r[0][1]] : [cx / (3 * a), cy / (3 * a)];
  return [lon > 180 ? lon - 360 : lon, lat];
}

export interface MapCountry { name: string; s: number; lit: boolean }
export interface MapData {
  countries: MapCountry[];
  /** Packed dots: [row, col, country index] triples. */
  dots: number[];
  lit: number;
  unmatched: string[];
}

let cache: MapData | null = null;

export function buildMap(): MapData {
  if (cache) return cache;
  const topo = JSON.parse(worldRaw);
  const fc = feature(topo, topo.objects.countries);

  const byName = new Map<string, Country>();
  for (const f of fc.features) {
    if (!f.geometry) continue;
    const raw = f.properties.name;
    if (raw === "Antarctica") continue;
    const name = FOLD[raw] ?? raw;
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    let c = byName.get(name);
    if (!c) byName.set(name, (c = { name, polys: [], box: [180, 90, -180, -90] }));
    for (const p of polys as Poly[]) {
      // Russia and Fiji cross 180 degrees; unwrap them so ray casting stays planar.
      if (p[0].some((q, i) => i && Math.abs(q[0] - p[0][i - 1][0]) > 180)) {
        for (const ring of p) for (const q of ring) if (q[0] < 0) q[0] += 360;
        p.wrap = true;
        c.box[0] = -180; c.box[2] = 180;
      }
      c.polys.push(p);
      for (const [lon, lat] of p[0]) {
        if (!p.wrap) { c.box[0] = Math.min(c.box[0], lon); c.box[2] = Math.max(c.box[2], lon); }
        c.box[1] = Math.min(c.box[1], lat); c.box[3] = Math.max(c.box[3], lat);
      }
    }
  }
  const list = [...byName.values()];

  // Match the analytics export.
  const sessions = new Map<string, { s: number; ga: string }>();
  const unmatched: string[] = [];
  for (const g of ga.countries) {
    const atlas = ALIAS[g.name] ?? g.name;
    if (!byName.has(atlas)) { unmatched.push(g.name); continue; }
    sessions.set(atlas, { s: g.engagedSessions, ga: g.name });
  }
  if (unmatched.length) console.warn(`[topsojmap] GA countries without a world-atlas shape: ${unmatched.join(", ")}`);

  const countries: MapCountry[] = list.map((c) => {
    const m = sessions.get(c.name);
    return { name: m ? m.ga : pretty(c.name), s: m?.s ?? 0, lit: (m?.s ?? 0) > 0 };
  });

  // Sample the grid.
  const owner = new Map<number, number>(); // row * 256 + col -> country index
  for (let r = 0; r < ROWS; r++) {
    const lat = rowLat(r);
    const scale = rowScale(lat);
    for (let c = 0; c < 256; c++) {
      const x = cellX(r, c);
      if (x > VIEW_W) break;
      const lon = lonAt(x, scale);
      if (lon < -180 || lon > 180) continue;
      for (let i = 0; i < list.length; i++) {
        const b = list[i].box;
        if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
        if (list[i].polys.some((p) => inPoly(lon, lat, p))) { owner.set(r * 256 + c, i); break; }
      }
    }
  }

  // Countries too small for the grid still get a dot if they have sessions:
  // the grid cell nearest their main landmass, taken from ocean or from a
  // neighbour that has dots to spare.
  const count = new Map<number, number>();
  for (const i of owner.values()) count.set(i, (count.get(i) ?? 0) + 1);
  const small = list.map((_, i) => i).filter((i) => countries[i].lit && !count.get(i))
    .sort((a, b) => countries[b].s - countries[a].s);
  for (const i of small) {
    const [lon, lat] = mainPoint(list[i]);
    const [x, y] = px(lon, lat);
    const cands: { k: number; d: number }[] = [];
    const r0 = Math.round((y - PAD_T) / ROW);
    for (let r = r0 - 2; r <= r0 + 2; r++) {
      if (r < 0 || r >= ROWS) continue;
      const c0 = Math.round((x - X0 - (r % 2 ? S / 2 : 0)) / S);
      for (let c = c0 - 2; c <= c0 + 2; c++) cands.push({ k: r * 256 + c, d: Math.hypot(cellX(r, c) - x, cellY(r) - y) });
    }
    cands.sort((a, b) => a.d - b.d);
    const pick = cands.find(({ k }) => {
      const o = owner.get(k);
      return o === undefined || (count.get(o)! > 3 && !small.includes(o));
    });
    if (!pick) continue;
    const prev = owner.get(pick.k);
    if (prev !== undefined) count.set(prev, count.get(prev)! - 1);
    owner.set(pick.k, i);
    count.set(i, 1);
  }

  const dots: number[] = [];
  for (const [k, i] of [...owner.entries()].sort((a, b) => a[0] - b[0])) dots.push(k >> 8, k & 255, i);
  const lit = countries.filter((c, i) => c.lit && count.get(i)).length;
  cache = { countries, dots, lit, unmatched };
  return cache;
}

