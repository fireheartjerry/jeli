// Geometry for Fig. "daedalus": a MediaPipe hand pinches a mesh, pulls it like
// clay, then spreads to scale it, in a small flat-shaded 3D viewport. Pure
// functions, shared by the server render (final frame) and the scroll script
// (every frame). No Three.js: an icosphere, a pinhole camera and a painter's
// sort are all this needs.

export const VIEW = { w: 640, h: 380 };
/** Mesh: screen centre, pixels per unit at depth 0, camera distance. */
export const MESH = { cx: 380, cy: 184, R: 78, D: 5.2 };
/** Home view: yaw about world y, and the camera's elevation (radians). */
export const CAM0 = { yaw: -0.52, tilt: 0.34 };
/** The webcam picture-in-picture: a scaled copy of the viewport's hand. */
export const PIP = { x: 488, y: 12, w: 140, h: 96 };
const FLOOR = -1.5;

type V3 = [number, number, number];
type P = [number, number];
const r1 = (v: number) => Math.round(v * 10) / 10;
const smooth = (a: number, b: number, x: number) => {
  const u = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return u * u * (3 - 2 * u);
};
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

// ---------------------------------------------------------------- the mesh

function norm(p: number[]): V3 {
  const l = Math.hypot(p[0], p[1], p[2]);
  return [p[0] / l, p[1] / l, p[2] / l];
}
function icosphere(levels: number): { v: V3[]; f: [number, number, number][] } {
  const t = (1 + Math.sqrt(5)) / 2;
  const v: V3[] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(norm) as V3[];
  // Wound counter-clockwise seen from outside, so (b - a) x (c - a) points out.
  let f: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  // Each subdivision splits every edge at its midpoint, pushed out to the sphere.
  for (let l = 0; l < levels; l++) {
    const cache = new Map<string, number>();
    const mid = (a: number, b: number) => {
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      let i = cache.get(k);
      if (i === undefined) {
        i = v.push(norm([(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2])) - 1;
        cache.set(k, i);
      }
      return i;
    };
    f = f.flatMap(([a, b, c]) => {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]] as [number, number, number][];
    });
  }
  return { v, f };
}
export const ICO = icosphere(2); // 162 vertices, 320 faces

// ---------------------------------------------------------------- the hand

/**
 * MediaPipe's 21 hand landmarks, authored in 2D (x right, y up, wrist at the
 * origin). 0 wrist; 1-4 thumb; 5-8 index; 9-12 middle; 13-16 ring; 17-20 pinky.
 */
const OPEN: P[] = [
  [0, 0],
  [0.22, 0.14], [0.42, 0.34], [0.58, 0.6], [0.7, 0.87],
  [0.26, 0.8], [0.32, 1.08], [0.37, 1.3], [0.42, 1.5],
  [0.06, 0.84], [0.08, 1.18], [0.09, 1.42], [0.1, 1.62],
  [-0.13, 0.78], [-0.17, 1.09], [-0.2, 1.3], [-0.22, 1.48],
  [-0.3, 0.67], [-0.38, 0.91], [-0.43, 1.07], [-0.47, 1.22],
];
const PINCH: P[] = [
  [0, 0],
  [0.2, 0.14], [0.42, 0.34], [0.57, 0.6], [0.62, 0.95],
  [0.26, 0.8], [0.4, 1.06], [0.53, 1.12], [0.62, 1.05],
  [0.06, 0.84], [0.11, 1.15], [0.14, 1.36], [0.16, 1.53],
  [-0.13, 0.78], [-0.14, 1.06], [-0.15, 1.25], [-0.16, 1.4],
  [-0.3, 0.67], [-0.35, 0.89], [-0.37, 1.03], [-0.39, 1.15],
];
/** Thumb and index spread wide, the other three fingers relaxed and bent toward the camera. */
const SPREAD: P[] = [
  [0, 0],
  [0.24, 0.12], [0.5, 0.26], [0.74, 0.38], [0.97, 0.46],
  [0.26, 0.8], [0.34, 1.1], [0.4, 1.34], [0.45, 1.56],
  [0.06, 0.84], [0.12, 1.06], [0.17, 1.18], [0.21, 1.26],
  [-0.13, 0.78], [-0.1, 0.98], [-0.05, 1.08], [-0.01, 1.14],
  [-0.3, 0.67], [-0.28, 0.84], [-0.24, 0.93], [-0.2, 0.99],
];
export const BONES = [
  [0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [5, 9], [9, 10, 11, 12],
  [9, 13], [13, 14, 15, 16], [13, 17], [0, 17], [17, 18, 19, 20],
];

/** Hand placement on screen: pixels per unit and rotation (radians, clockwise). */
const HAND = { S: 98, rot: 0.3 };
function place(pose: P[], wrist: P, S = HAND.S): P[] {
  const c = Math.cos(HAND.rot), s = Math.sin(HAND.rot);
  // Rotate clockwise on screen, flip y (authored y-up, SVG y-down).
  return pose.map(([x, y]) => [wrist[0] + S * (x * c + y * s), wrist[1] - S * (-x * s + y * c)]);
}
const tipMid = (lm: P[]): P => [(lm[4][0] + lm[8][0]) / 2, (lm[4][1] + lm[8][1]) / 2];
const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mix = (a: P[], b: P[], u: number) => a.map(([x, y], i) => [lerp(x, b[i][0], u), lerp(y, b[i][1], u)] as P);

/** Pinch as MediaPipe apps usually measure it: thumb-index gap over palm length. */
export const pinchOf = (lm: P[]) => dist(lm[4], lm[8]) / dist(lm[0], lm[9]);

// ---------------------------------------------------------------- the story

// Where the pinch closes on the mesh, as a screen angle from its centre (y up).
const GRAB = (186 * Math.PI) / 180;
const CONTACT: P = [MESH.cx + MESH.R * 1.02 * Math.cos(GRAB), MESH.cy - MESH.R * 1.02 * Math.sin(GRAB)];
const DRAG = 50; // px the pinch travels after it grabs
const DRAG_DIR: P = [Math.cos((168 * Math.PI) / 180), -Math.sin((168 * Math.PI) / 180)]; // screen, y down
const APPROACH: P = [-70, 44]; // where the pinch starts, relative to the contact
const PULLED: P = [CONTACT[0] + DRAG_DIR[0] * DRAG, CONTACT[1] + DRAG_DIR[1] * DRAG];
const S_MAX = 1.26;

/** Beats, in scroll progress. */
export const BEATS = { grab: [0.04, 0.3], sculpt: [0.34, 0.6], scale: [0.66, 0.94] } as const;
export const TOOLS = ["add", "move", "scale", "sculpt"] as const;
export const CHIPS = ["pinch to grab", "drag to sculpt", "spread to scale"] as const;

export function gesture(t: number) {
  const close = smooth(0.06, 0.3, t); // open hand -> pinch
  const reachIn = smooth(0.02, 0.3, t); // how far it has come in
  const pull = smooth(BEATS.sculpt[0], BEATS.sculpt[1], t); // how far it has dragged since grabbing
  const spread = smooth(BEATS.scale[0] + 0.02, BEATS.scale[1], t); // pinch -> spread
  const S = 1 + (S_MAX - 1) * spread;

  // The pinch point: in to the surface, out along the drag, then riding the
  // lump's tip outward as the mesh grows.
  const target: P = spread > 0
    ? [MESH.cx + (PULLED[0] - MESH.cx) * S + DRAG_DIR[0] * 44 * spread, MESH.cy + (PULLED[1] - MESH.cy) * S + DRAG_DIR[1] * 44 * spread]
    : [CONTACT[0] + APPROACH[0] * (1 - reachIn) + DRAG_DIR[0] * DRAG * pull, CONTACT[1] + APPROACH[1] * (1 - reachIn) + DRAG_DIR[1] * DRAG * pull];
  const pose = spread > 0 ? mix(PINCH, SPREAD, spread) : mix(OPEN, PINCH, close);
  const m = tipMid(place(pose, [0, 0]));
  const lm = place(pose, [target[0] - m[0], target[1] - m[1]]);

  const grabbed = t >= 0.3;
  // The clay keeps its shape once the pinch lets go.
  const clayAt: P | null = grabbed ? (t < BEATS.sculpt[1] ? tipMid(lm) : PULLED) : null;
  const beat = t < 0.32 ? 0 : t < 0.63 ? 1 : 2;
  const prog = [smooth(0.02, 0.3, t), smooth(0.34, 0.6, t), smooth(0.66, 0.94, t)][beat];
  const tool = (["move", "sculpt", "scale"] as const)[beat];
  // The view holds still while the hand works on the surface.
  const engage = smooth(0, 0.12, t) * (1 - smooth(0.6, 0.7, t));
  return { lm, close, pull, spread, S, sculpt: 1 + 0.08 * pull, grabbed, clayAt, pinch: pinchOf(lm), beat, prog, tool, engage };
}

// ---------------------------------------------------------------- the camera

export type Cam = { yaw: number; tilt: number };
function viewer(cam: Cam) {
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), ct = Math.cos(cam.tilt), st = Math.sin(cam.tilt);
  /** World -> view: turn about y, then tip toward the camera so the top shows. z points at the viewer. */
  const view = ([x, y, z]: V3): V3 => {
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    return [x1, y * ct - z1 * st, y * st + z1 * ct];
  };
  /** View -> world (the inverse rotation). */
  const unview = ([x, y, z]: V3): V3 => {
    const y1 = y * ct + z * st, z1 = -y * st + z * ct;
    return [x * cy - z1 * sy, y1, x * sy + z1 * cy];
  };
  const f = MESH.R * MESH.D;
  const project = ([x, y, z]: V3): P => {
    const d = MESH.D - z;
    return [MESH.cx + (f * x) / d, MESH.cy - (f * y) / d];
  };
  return { view, unview, project };
}

// ---------------------------------------------------------------- render

const LIGHT = norm([-0.45, 0.62, 0.64]); // key light, fixed in view space (upper left, in front)
const PANEL = [253, 253, 251], INK = [20, 20, 19], ACC = [39, 67, 214];

export type Face = { d: string; fill: string; stroke: string; z: number };

/**
 * The deformed, lit, sorted mesh. The pinch point (screen, at home view) pulls
 * the vertices facing it: each moves toward it by a smooth falloff of the
 * angle between its normal and the pull direction, so it stretches like clay.
 * The lump lives in world space, so it orbits with the mesh.
 */
export function mesh(cam: Cam, S: number, clayAt: P | null, sculpt = 1) {
  const { view, project } = viewer(cam);
  const home = viewer(CAM0);
  const { R, cx, cy } = MESH;
  let g: V3 = [1, 0, 0], reach = 0;
  if (clayAt) {
    const P3: V3 = [(clayAt[0] - cx) / R, -(clayAt[1] - cy) / R, 0];
    const l = Math.hypot(P3[0], P3[1]);
    g = home.unview([P3[0] / l, P3[1] / l, 0]);
    reach = Math.max(0, l - sculpt);
  }
  // Falloff: a Gaussian in the angle from the pull direction, normalised so
  // the vertex nearest the pinch lands on it.
  const V = ICO.v;
  const cs = V.map((n) => n[0] * g[0] + n[1] * g[1] + n[2] * g[2]);
  const raw = cs.map((c) => Math.exp(-((Math.acos(Math.min(1, c)) / 0.46) ** 2)));
  const top = Math.max(...raw);
  const w = raw.map((k) => (reach > 0 ? k / top : 0));
  const ramp = Math.min(reach / 0.3, 1);
  const pv: V3[] = V.map((n, i) => {
    const c = cs[i], k = w[i];
    // Pull along g; the vertex nearest the pinch closes onto the pull axis
    // (so the tip meets the fingers), and the neck draws in a little.
    const lat = sculpt * (1 - 0.4 * k * ramp) * (1 - k ** 4 * ramp);
    const along = c * sculpt + k * (reach + sculpt * (1 - c));
    const p: V3 = [
      ((n[0] - c * g[0]) * lat + g[0] * along) * S,
      ((n[1] - c * g[1]) * lat + g[1] * along) * S,
      ((n[2] - c * g[2]) * lat + g[2] * along) * S,
    ];
    return view(p);
  });
  const pts = pv.map(project);

  const faces: Face[] = [];
  for (const [a, b, c] of ICO.f) {
    const A = pv[a], B = pv[b], C = pv[c];
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = norm([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
    const m: V3 = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3];
    // Cull faces turned away from the eye at (0, 0, D).
    if (n[0] * -m[0] + n[1] * -m[1] + n[2] * (MESH.D - m[2]) <= 0) continue;
    const lit = 0.16 + 0.84 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
    const shade = Math.round((0.05 + 0.5 * (1 - lit)) * 100) / 100;
    const fw = reach > 0.02 ? (w[a] + w[b] + w[c]) / 3 : 0;
    const tint = Math.round(Math.min(1, fw * 1.25) * 0.5 * 100) / 100;
    const col = PANEL.map((p, i) => {
      const grey = p + (INK[i] - p) * shade;
      return Math.round(grey + (ACC[i] - grey) * tint * (0.35 + 0.65 * lit));
    });
    faces.push({
      d: `M${r1(pts[a][0])} ${r1(pts[a][1])}L${r1(pts[b][0])} ${r1(pts[b][1])}L${r1(pts[c][0])} ${r1(pts[c][1])}Z`,
      fill: `rgb(${col[0]} ${col[1]} ${col[2]})`,
      stroke: tint > 0.2 ? "rgb(39 67 214 / 0.55)" : "rgb(20 20 19 / 0.2)",
      z: m[2],
    });
  }
  faces.sort((p, q) => p.z - q.z);
  return { faces, reach };
}

/** A ground grid under the mesh, in perspective, plus its two centre axes. */
export function floor(cam: Cam) {
  const { view, project } = viewer(cam);
  const L = 3, step = 0.5;
  const seg = (a: V3, b: V3) => {
    const p = project(view(a)), q = project(view(b));
    return `M${r1(p[0])} ${r1(p[1])}L${r1(q[0])} ${r1(q[1])}`;
  };
  let grid = "";
  for (let k = -L; k <= L + 1e-9; k += step) {
    if (Math.abs(k) < 1e-9) continue;
    grid += seg([k, FLOOR, -L], [k, FLOOR, L]) + seg([-L, FLOOR, k], [L, FLOOR, k]);
  }
  return { grid, x: seg([-L, FLOOR, 0], [L, FLOOR, 0]), z: seg([0, FLOOR, -L], [0, FLOOR, L]) };
}

/** The axis gizmo: world axes turned by the view, no perspective, far ones first. */
export function gizmo(cam: Cam, len = 17) {
  const { view } = viewer(cam);
  return (["x", "y", "z"] as const)
    .map((a, i) => {
      const e: V3 = [i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0];
      const [x, y, z] = view(e);
      return { a, x: r1(x * len), y: r1(-y * len), z };
    });
}

/** The same landmarks, as the webcam sees them in the picture-in-picture. */
const CROP = { x: 30, y: 64, w: 470 }; // the part of the viewport the hand moves through
export const pip = (lm: P[]): P[] => {
  const k = PIP.w / CROP.w;
  return lm.map(([x, y]) => [PIP.x + (x - CROP.x) * k, PIP.y + (y - CROP.y) * k]);
};

/** A dimension line between the thumb and index tips, offset away from the palm. */
export function dimension(lm: P[], gapScale = 1) {
  const a = lm[4], b = lm[8];
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  let nx = -dy / l, ny = dx / l;
  const m: P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  // Offset toward the mesh, into the open space in front of the fingers.
  if (nx * (m[0] - MESH.cx) + ny * (m[1] - MESH.cy) > 0) { nx = -nx; ny = -ny; }
  const shut = 1 - smooth(0.25, 0.6, l / 60);
  const o = 12 - 5 * shut;
  const A: P = [a[0] + nx * o, a[1] + ny * o], B: P = [b[0] + nx * o, b[1] + ny * o];
  const tick = (p: P) => `M${r1(p[0] - 3)} ${r1(p[1] + 3)}L${r1(p[0] + 3)} ${r1(p[1] - 3)}`;
  const lo = o + 14 * gapScale;
  return {
    ext: `M${r1(a[0] + nx * 4)} ${r1(a[1] + ny * 4)}L${r1(A[0] + nx * 4)} ${r1(A[1] + ny * 4)}M${r1(b[0] + nx * 4)} ${r1(b[1] + ny * 4)}L${r1(B[0] + nx * 4)} ${r1(B[1] + ny * 4)}`,
    line: `M${r1(A[0])} ${r1(A[1])}L${r1(B[0])} ${r1(B[1])}${tick(A)}${tick(B)}`,
    label: [r1(m[0] + nx * lo), r1(m[1] + ny * lo)] as P,
  };
}

export const bonesPath = (lm: P[]) =>
  BONES.map((c) => c.map((i, j) => `${j ? "L" : "M"}${r1(lm[i][0])} ${r1(lm[i][1])}`).join("")).join("");

export const fmt = (v: number) => v.toFixed(2);
export const readout = (pinch: number, S: number) => `pinch ${fmt(pinch)}  scale ${S.toFixed(2)}×`;
/** Slow orbit while the hand is away. */
export const sway = (s: number) => 0.5 * Math.sin(0.21 * s);
