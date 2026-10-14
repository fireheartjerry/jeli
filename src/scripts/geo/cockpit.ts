// Geometry for Fig. "cockpit": the whole pipeline in one plate. A webcam finds
// two printed ArUco markers (the stick and the throttle), a Python bridge merges
// their pose with the BLE badge's button into JSON frames over a local
// WebSocket, and the Godot sim flies them. Pure functions, shared by the server
// render (final frame) and the scroll script (every frame).

/**
 * DICT_4X4_50, id 23, from OpenCV's predefined dictionary bytes {221, 130}
 * read row-major, most significant bit first. 1 is a white cell.
 */
export const BITS = ["1101", "1101", "1000", "0010"];
/**
 * The throttle card: DICT_4X4_50 id 0, bytes {181, 50}. (Its stored rotations
 * {235, 72} and {18, 215} are this grid turned 90 degrees each way.)
 */
export const BITS_THR = ["1011", "0101", "0011", "0010"];

export const VIEW = { w: 640, h: 568 };

// ---------------------------------------------------------------- layout

/** The webcam frame. */
export const CAMV = { x: 0, y: 0, w: 400, h: 214 };
/** Pinhole camera looking at the stick card: centre, focal length, distance, and a fixed viewing angle. */
export const CAM = { cx: 162, cy: 106, f: 330, D: 3.6, yaw: -20, tilt: 18 };
/** The throttle card slides on a cardboard rail: x, top and bottom of travel, card scale. */
export const THR = { x: 346, y0: 64, y1: 164, s: 0.3 };
/** The BLE badge. */
export const BADGE = { cx: 524, cy: 102, w: 96, h: 132 };
/** The bridge's WebSocket log. */
export const LOG = { x: 0, y: 236, w: 640, h: 114, n: 5, top: 276, step: 16 };
/** The sim: glass-cockpit instrument and the map. */
export const PFD = { x: 0, y: 374, w: 316, h: 194 };
/** Attitude display inside the PFD (absolute coords), pixels per degree of pitch, bank-scale radius. */
export const ADI = { cx: 158, cy: 464, hw: 94, hh: 64, k: 2.4, bank: 54 };
/** Speed and altitude tapes (x span, pixels per unit), and the heading strip. */
export const SPD = { x0: 10, x1: 56, k: 2.6 };
export const ALT = { x0: 260, x1: 306, k: 0.26 };
export const HDG = { x0: 64, x1: 252, y0: 537, y1: 561, k: 2.2 };
export const MAP = { x: 332, y: 374, w: 308, h: 194 };

// ---------------------------------------------------------------- the flight

// A short manoeuvre, keyed on scroll progress: roll left and climb, bank right
// hard, roll back, settle into a gentle right turn.
const KEYS = {
  roll: [0, -20, 26, -8, 12],
  pitch: [0, 10, -7, 12, -4],
  thr: [0.34, 0.55, 0.86, 0.7, 0.62],
};
/**
 * Beats, in scroll progress. The plate is read top to bottom and comes up the
 * window top first, so the story is told in that order: the detector finds
 * the two markers in the webcam frame, frames start to flow through the
 * bridge, and the manoeuvre is flown while the sim's panels come into view.
 * Nothing after 0.93: with the plate in the middle of the window the scripted
 * flight is over (and the aircraft is flown on from there, see the script).
 */
export const BEATS = {
  stick: [0, 0.36], // the stick's marker: outline, bits, id, pose
  throttle: [0.13, 0.31], // the smaller one on the rail
  fly: [0.36, 0.93],
} as const;
/**
 * Within the stick's beat: its outline is traced, its sixteen bits are read,
 * then the pose axes are raised. The outline starts as soon as the top of the
 * card is in view and is traced no faster than the plate comes up, so each
 * edge is drawn just after it can be seen.
 */
export const FOUND = { trace: [0.03, 0.56], bits: [0.5, 0.76], id: 0.78, axes: [0.78, 1] } as const;
/** Where in the flight the badge's fire button is held. */
export const FIRE = [0.6, 0.7];

function catmull(ys: number[], t: number) {
  const n = ys.length - 1;
  const x = Math.min(Math.max(t, 0), 1) * n;
  const i = Math.min(Math.floor(x), n - 1);
  const u = x - i;
  const p0 = ys[Math.max(i - 1, 0)], p1 = ys[i], p2 = ys[i + 1], p3 = ys[Math.min(i + 2, n)];
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
}

export function attitude(fly: number) {
  return { roll: catmull(KEYS.roll, fly), pitch: catmull(KEYS.pitch, fly), thr: catmull(KEYS.thr, fly) };
}

/** Indicated airspeed from throttle, and the sim's integrated heading, altitude and track. */
export const speedOf = (thr: number) => 80 + 120 * thr;
const H0 = 98; // initial heading, degrees
const ALT0 = 1500; // ft
const KH = 22; // heading change per degree of bank per unit of flight
const KA = 0.8; // altitude gain per knot per radian of pitch per unit of flight
const STEPS = 320;

type P = [number, number];
const r1 = (v: number) => Math.round(v * 10) / 10;
const d2r = Math.PI / 180;

/** The sim's state: heading (degrees, clockwise from north), altitude (ft) and place. */
export type Sim = { hdg: number; alt: number; x: number; y: number };
/**
 * One step of the sim, `du` units of flight long: heading follows bank,
 * altitude follows pitch, and the aircraft goes where it points. `k` is the
 * size of a unit of distance (1 in the sim's own units, FLIGHT.scale on the map).
 * The scripted flight is integrated with this, and so is the flying after it.
 */
export function advance(s: Sim, roll: number, pitch: number, thr: number, du: number, k = 1) {
  const v = speedOf(thr);
  s.hdg += KH * roll * du;
  s.alt += KA * v * Math.sin(pitch * d2r) * du * 60;
  s.x += v * Math.sin(s.hdg * d2r) * du * k;
  s.y -= v * Math.cos(s.hdg * d2r) * du * k;
}

/** Integrate the flight once: heading follows bank, altitude follows pitch, the track follows heading. */
export const FLIGHT = (() => {
  const hdg: number[] = [], alt: number[] = [], world: P[] = [];
  const s: Sim = { hdg: H0, alt: ALT0, x: 0, y: 0 };
  for (let i = 0; i <= STEPS; i++) {
    const f = i / STEPS;
    const { roll, pitch, thr } = attitude(f);
    hdg.push(s.hdg);
    alt.push(s.alt);
    world.push([s.x, s.y]);
    advance(s, roll, pitch, thr, 1 / STEPS);
  }
  // Fit the track into the map, leaving room for the title and the trend line.
  const xs = world.map((p) => p[0]), ys = world.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const box = { x: MAP.x + 34, y: MAP.y + 40, w: MAP.w - 90, h: MAP.h - 74 };
  const sc = Math.min(box.w / (x1 - x0), box.h / (y1 - y0));
  const ox = box.x + (box.w - (x1 - x0) * sc) / 2, oy = box.y + (box.h - (y1 - y0) * sc) / 2;
  const pts = world.map(([x, y]) => [ox + (x - x0) * sc, oy + (y - y0) * sc] as P);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const d = `M${pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join("L")}`;
  return { hdg, alt, pts, cum, d, scale: sc, len: cum[cum.length - 1], hdgRange: [Math.min(...hdg), Math.max(...hdg)], altRange: [Math.min(...alt), Math.max(...alt)] };
})();

/** Everything the scripted flight shows `fly` of the way through it (0 to 1), before live turbulence or a hand on the card. */
export function flight(fly: number) {
  fly = Math.min(Math.max(fly, 0), 1);
  const { roll, pitch, thr } = attitude(fly);
  const x = fly * STEPS, i = Math.min(Math.floor(x), STEPS - 1), u = x - i;
  const lerp = (a: number[], ) => a[i] + (a[i + 1] - a[i]) * u;
  const F = FLIGHT;
  const pos: P = [F.pts[i][0] + (F.pts[i + 1][0] - F.pts[i][0]) * u, F.pts[i][1] + (F.pts[i + 1][1] - F.pts[i][1]) * u];
  return {
    fly,
    roll,
    pitch,
    thr,
    fire: fly >= FIRE[0] && fly <= FIRE[1],
    hdg: lerp(F.hdg),
    alt: lerp(F.alt),
    len: lerp(F.cum),
    /** The last point of the stored track at or before here. */
    at: i,
    pos,
  };
}

// ---------------------------------------------------------------- flying on

// When the scripted manoeuvre is over the aircraft is not parked: someone goes
// on flying it. What they fly is a lazy eight over the middle of the map (a
// figure of eight, banked one way and then the other, climbing into each turn
// and descending out of it), with its size and its lean drifting slowly so
// that no two laps are the same. The stick is moved to
// follow it, the card tilts as the stick is moved, and the sim is stepped with
// the same equations as before, so the HUD and the map stay true to each other.

/** Seconds on screen that one unit of flight time takes, flown on. */
export const PACE = 14;
/** The most bank and pitch asked for, degrees, and how far ahead along the eight the aircraft steers for (map units). */
const BANK = 24, CLIMB = 8, AHEAD = 50;
const wrap180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

/** The eight, at angle `th` round it, as it stands `s` seconds into the flying on. */
export function eight(th: number, s: number): P {
  const A = 96 + 8 * Math.sin(0.043 * s + 1), B = 50 + 5 * Math.sin(0.031 * s + 2.4);
  const lean = 0.22 * Math.sin(0.027 * s);
  return [MAP.x + MAP.w * 0.5 + A * Math.sin(th), MAP.y + MAP.h * 0.5 + B * Math.sin(2 * th + lean)];
}
/** Where on the eight the scripted flight hands over: just past its eastern end, heading the way the aircraft already is. */
export const EIGHT_FROM = Math.PI / 2 - 0.25;
/**
 * What is asked of the stick and the throttle. `th` is how far round the
 * eight the point being steered for has got; it is moved on (backwards: the
 * aircraft arrives turning right) until it is AHEAD of the aircraft again.
 * The bank asked for is the one that flies the arc through that point (pure
 * pursuit), worked back through the sim's own turn rate, so the aircraft is
 * led round the eight without hunting from side to side.
 */
export function autopilot(sim: Sim, thr: number, th: number, s: number) {
  let [tx, ty] = eight(th, s);
  for (let i = 0; i < 60 && Math.hypot(tx - sim.x, ty - sim.y) < AHEAD; i++) [tx, ty] = eight((th -= 0.01), s);
  const far = Math.hypot(tx - sim.x, ty - sim.y) || 1;
  const off = wrap180(Math.atan2(tx - sim.x, -(ty - sim.y)) / d2r - sim.hdg);
  // Degrees of heading per unit of flight that the arc needs, over what a degree of bank gives.
  const arc = (speedOf(thr) * FLIGHT.scale * 2 * Math.sin(off * d2r)) / far / d2r / KH;
  const roll = Math.abs(off) > 90 ? Math.sign(off) * BANK : Math.min(Math.max(arc, -BANK), BANK);
  // A lazy eight climbs into each of its turns and comes down through the crossing: highest at the two ends.
  // (The nose follows the height wanted gently enough that it never hunts: about four degrees either way.)
  const height = 1830 - 180 * Math.cos(2 * th) + 30 * Math.sin(0.023 * s);
  return {
    th,
    roll,
    pitch: Math.min(Math.max((height - sim.alt) * 0.02, -CLIMB), CLIMB),
    thr: 0.64 + 0.09 * Math.sin(0.071 * s + 1.9) + 0.04 * Math.sin(0.19 * s),
  };
}
/** The sim's own floor and ceiling, ft: the altitude tape is printed between them. */
export const ALT_LIMITS = [1300, 2200];

/** The dashed trend: where the current bank and speed carry the aircraft next. */
export function trend(pos: P, hdg: number, roll: number, thr: number) {
  const v = speedOf(thr) * FLIGHT.scale, dt = 0.012;
  let [x, y] = pos, h = hdg, d = `M${r1(x)} ${r1(y)}`;
  for (let i = 0; i < 12; i++) {
    h += KH * roll * dt;
    x += v * Math.sin(h * d2r) * dt;
    y -= v * Math.cos(h * d2r) * dt;
    d += `L${r1(x)} ${r1(y)}`;
  }
  return d;
}

// ---------------------------------------------------------------- the cards

/**
 * Card pose -> camera. Roll turns the card in its own plane (positive is
 * clockwise on screen, right wing down); pitch tips its top edge away from the
 * camera (nose up). The fixed yaw and tilt are just where the webcam sits.
 */
function projector(roll: number, pitch: number, cx = CAM.cx, cy = CAM.cy, s = 1) {
  const a = -roll * d2r, b = (CAM.tilt - pitch) * d2r, c = CAM.yaw * d2r;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  return (x: number, y: number, z = 0): P => {
    x *= s; y *= s; z *= s;
    // Rz(a)
    let X = x * ca - y * sa, Y = x * sa + y * ca, Z = z;
    // Rx(b)
    const Y2 = Y * cb - Z * sb, Z2 = Y * sb + Z * cb;
    Y = Y2; Z = Z2;
    // Ry(c)
    const X3 = X * cc + Z * sc, Z3 = -X * sc + Z * cc;
    X = X3; Z = Z3;
    const d = CAM.D - Z;
    return [cx + (CAM.f * X) / d, cy - (CAM.f * Y) / d];
  };
}

const quad = (pts: P[]) => `M${pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join("L")}Z`;
const seg = (a: P, b: P) => `M${r1(a[0])} ${r1(a[1])}L${r1(b[0])} ${r1(b[1])}`;
/** A rounded blob (superellipse) in the card plane, projected. */
function blob(p: (x: number, y: number) => P, cu: number, cv: number, ru: number, rv: number, n = 22) {
  const pts: P[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    pts.push(p(cu + ru * Math.sign(c) * Math.abs(c) ** 0.75, cv + rv * Math.sign(s) * Math.abs(s) ** 0.75));
  }
  return quad(pts);
}

/** Closed Catmull-Rom spline through screen points, as cubic Beziers. */
function spline(pts: P[]) {
  const n = pts.length, at = (i: number) => pts[(i + n) % n];
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    d += `C${r1(p1[0] + (p2[0] - p0[0]) / 6)} ${r1(p1[1] + (p2[1] - p0[1]) / 6)} ${r1(p2[0] - (p3[0] - p1[0]) / 6)} ${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return d + "Z";
}
// One hand's outline in the card plane (u right, v up), right side; the forearm runs out of frame.
const HAND: P[] = [
  [0.6, 0.28], [0.78, 0.34], [0.92, 0.28], [1.0, 0.1], [1.0, -0.16], [0.95, -0.4],
  [0.99, -0.7], [1.12, -1.4], [1.2, -2.2], [0.9, -2.2], [0.82, -1.4], [0.78, -0.74], [0.6, -0.46],
];
const hand = (p: (x: number, y: number) => P, side: 1 | -1) => spline(HAND.map(([u, v]) => p(side * u, v)));

const CARD = 0.68; // half-width of the cardboard, in marker widths
const AXIS = 0.5; // length of the drawn pose axes, in marker widths
const S6 = 1 / 6; // one cell, in marker widths

/** The printed marker: its black ink (even-odd, white cells cut out), cell grid and corners. */
function marker(p: (x: number, y: number, z?: number) => P, bits: string[]) {
  const cell = (r: number, c: number): P[] => {
    const u0 = -0.5 + c * S6, u1 = u0 + S6, v1 = 0.5 - r * S6, v0 = v1 - S6;
    return [p(u0, v1), p(u1, v1), p(u1, v0), p(u0, v0)];
  };
  // OpenCV corner order: top-left, top-right, bottom-right, bottom-left.
  const corners: P[] = [p(-0.5, 0.5), p(0.5, 0.5), p(0.5, -0.5), p(-0.5, -0.5)];
  let ink = quad(corners);
  bits.forEach((row, r) => [...row].forEach((bit, c) => { if (bit === "1") ink += quad(cell(r + 1, c + 1)); }));
  let grid = "";
  for (let i = 1; i < 6; i++) {
    const k = -0.5 + i * S6;
    grid += seg(p(k, 0.5), p(k, -0.5)) + seg(p(-0.5, k), p(0.5, k));
  }
  // Where the detector samples each of the sixteen bits: the middle of its cell, row by row.
  const cells: P[] = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) cells.push(p(-0.5 + (c + 1.5) * S6, 0.5 - (r + 1.5) * S6));
  return { ink, grid, corners, cells };
}

export function scene(roll: number, pitch: number, gap = 1) {
  const p = projector(roll, pitch);
  const { ink, grid, corners, cells } = marker(p, BITS);

  // The card has a little thickness; its back face peeks out below the front.
  const card = quad([p(-CARD, CARD), p(CARD, CARD), p(CARD, -CARD), p(-CARD, -CARD)]);
  const back = quad([p(-CARD, CARD, -0.05), p(CARD, CARD, -0.05), p(CARD, -CARD, -0.05), p(-CARD, -CARD, -0.05)]);
  // Two hands hold it by the sides: palms and forearms behind, thumbs on the margin.
  const palms = hand(p, 1) + hand(p, -1);
  const thumbs = blob(p, -0.595, 0.04, 0.066, 0.18, 16) + blob(p, 0.595, 0.04, 0.066, 0.18, 16);

  const o = p(0, 0);
  // Pose axes in the marker frame: x right, y up, z out of the card toward the camera.
  const axes = { x: p(AXIS, 0, 0), y: p(0, AXIS, 0), z: p(0, 0, AXIS) };
  const label = (q: P, gap: number): P => {
    const dx = q[0] - o[0], dy = q[1] - o[1], l = Math.hypot(dx, dy) || 1;
    return [q[0] + (dx / l) * gap, q[1] + (dy / l) * gap];
  };
  const mid: P = [(corners[0][0] + corners[2][0]) / 2, (corners[0][1] + corners[2][1]) / 2];
  const cornerLabels = corners.map((c) => {
    const dx = c[0] - mid[0], dy = c[1] - mid[1], l = Math.hypot(dx, dy) || 1;
    return [c[0] + (dx / l) * 15 * gap, c[1] + (dy / l) * 15 * gap] as P;
  });
  return {
    ink,
    grid,
    card,
    back,
    palms,
    thumbs,
    quad: quad(corners),
    corners,
    cells,
    cornerLabels,
    o,
    axes,
    axisLabels: { x: label(axes.x, 12 * gap), y: label(axes.y, 12 * gap), z: label(axes.z, 12 * gap) },
  };
}

/** The throttle card: a smaller marker riding a rail, higher is more throttle. */
export const thrY = (thr: number) => THR.y1 - thr * (THR.y1 - THR.y0);
export function throttleCard(thr: number, jitter = 0) {
  const p = projector(jitter, 0, THR.x, thrY(thr), THR.s);
  const { ink, corners } = marker(p, BITS_THR);
  let around = 0;
  for (let i = 0; i < 4; i++) around += Math.hypot(corners[(i + 1) % 4][0] - corners[i][0], corners[(i + 1) % 4][1] - corners[i][1]);
  return {
    card: quad([p(-CARD, CARD), p(CARD, CARD), p(CARD, -CARD), p(-CARD, -CARD)]),
    ink,
    quad: quad(corners),
    /** The length of its outline, for tracing it. */
    around,
  };
}

// ---------------------------------------------------------------- the instrument

/** The horizon moves opposite the aircraft: it counter-rotates with roll and drops as the nose rises. */
export const horizon = (roll: number, pitch: number) =>
  `translate(${ADI.cx} ${ADI.cy}) rotate(${r1(-roll)}) translate(0 ${r1(pitch * ADI.k)})`;
export const pointer = (roll: number) => `translate(${ADI.cx} ${ADI.cy}) rotate(${r1(-roll)})`;
/** Tapes slide so the current value sits on the centre line. */
export const spdTape = (v: number) => `translate(0 ${r1(v * SPD.k)})`;
export const altTape = (v: number) => `translate(0 ${r1(v * ALT.k)})`;
/**
 * The heading strip is drawn round the nearest multiple of 30 degrees (its
 * base) and slid by what is left over. Its ticks repeat every 10, so the same
 * few serve any heading, and only the five labels are rewritten as the base
 * moves on: the strip never runs out, however long the aircraft turns.
 */
export const HDG_SPAN = [-60, -30, 0, 30, 60];
export const hdgBase = (h: number) => Math.round(h / 30) * 30;
export const hdgTape = (h: number) => `translate(${r1(-(h - hdgBase(h)) * HDG.k)} 0)`;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Tape and ladder labels fade as they slide under a value box or out of the window. */
// Both ends: clear of the value box, and soft at the window's edges rather than clipped.
export const fadeTape = (dy: number) =>
  Math.round(Math.min(clamp01((Math.abs(dy) - 13) / 7), clamp01((ADI.hh - 8 - Math.abs(dy)) / 14)) * 100) / 100;
export const fadeHdg = (dx: number) =>
  Math.round(Math.min(clamp01((Math.abs(dx) - 24) / 10), clamp01(((HDG.x1 - HDG.x0) / 2 - 10 - Math.abs(dx)) / 18)) * 100) / 100;
export const fadeRung = (y: number) => Math.round(clamp01((38 - Math.abs(y)) / 8) * 100) / 100;

export const wrap = (h: number) => ((Math.round(h) % 360) + 360) % 360;
export const hdgText = (h: number) => `${wrap(h)}`.padStart(3, "0");
export const hdgName = (h: number) => {
  const w = wrap(h);
  return ({ 0: "N", 90: "E", 180: "S", 270: "W" } as Record<number, string>)[w] ?? `${w / 10}`.padStart(2, "0");
};

// ---------------------------------------------------------------- the bridge

const fx = (v: number, n: number) => {
  const s = v.toFixed(n);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
};
/** One WebSocket frame's values, formatted the way json.dumps would round them. */
export const frame = (roll: number, pitch: number, thr: number, fire: boolean) =>
  [fx(roll, 1), fx(pitch, 1), fx(thr, 2), fire ? "true" : "false"] as const;

const deg = (v: number) => {
  const n = Math.round(v);
  return `${n < 0 ? "−" : ""}${Math.abs(n)}°`;
};
export const readout = (roll: number, pitch: number, thr: number) =>
  `roll ${deg(roll)}  pitch ${deg(pitch)}  thr ${Math.round(thr * 100)}%`;

/** Small, smooth idle turbulence (degrees, and throttle fraction), deterministic in time. */
export const turbulence = (s: number) => ({
  roll: 0.32 * Math.sin(1.3 * s) + 0.14 * Math.sin(3.7 * s + 1.1),
  pitch: 0.26 * Math.sin(1.7 * s + 2) + 0.1 * Math.sin(4.3 * s),
  thr: 0.004 * Math.sin(2.1 * s + 0.5),
});
