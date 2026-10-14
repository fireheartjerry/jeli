// Fig: one MP4 export at Mathos, start to finish.
//
// The whole figure is a pure function of a few clocks. `draw(layout, frame, sink)`
// decides every moving attribute for a moment and hands it to a sink. On the
// server the sink collects attributes, so the page ships the finished state; in
// the browser the sink writes to the DOM and skips anything that has not
// changed. Nothing is drawn twice in two places.
//
// Story time is in seconds. Our job is queued at 0. Other jobs (all examples)
// run on a fixed schedule around it, one sandbox each, so the scroll story is
// just a window onto a system that is already working. The scroll runs that
// clock as far as the video coming back into the chat; from there the same
// clock is left running, and that is the ambient loop.
//
// Two things keep the picture calm at any speed. What happens is decided by
// story time, but how a thing arrives has a floor in screen time: the browser's
// sink lets an opacity, a row or a label take a few frames to follow its value,
// however fast the scroll is running the clock. And what the eye could not
// follow at that speed (other people's packets, a scan line) thins out as the
// clock runs faster, the way it would in a time-lapse.
//
// The page imports this module to render the finished state, so nothing here
// may need a browser to load: the motion helpers (and GSAP with them) are
// fetched inside the default export, which only ever runs in one.

// =====================================================================
// The schedule
// =====================================================================

/** Where the scroll story begins. */
const T_START = -6;
/** The moment the page is served at: the finished drawing. The running clock passes it a few seconds after the delivery. */
export const T_END = 16.9;
/** Frames a sandbox renders per second of story time. A pace for the drawing, not a measurement. */
const FPS = 30;
/** Sandboxes drawn: the large one and two small ones. A slot never holds two jobs. */
const SLOTS = 3;
/** Seconds between one job starting and the next. */
const GAP = 3.5;
const CYCLE = GAP * SLOTS;
/** Our job is picked up. */
const S0 = 1.6;
const LEAD = 0.35; // the hand-off from the queue, before a sandbox exists
const PROV = 0.6; // the sandbox is drawn and sealed
const PACK = 0.4; // frames become one file
const DOWN = 0.9; // its one render over, the sandbox leaves the drawing
const TRAVEL = 1.4; // the file reaches the store
const DROP = 0.3; // the last of that: falling into the store
/** How far through being made a sandbox is when its outline is closed, and when its lock shuts. Its render begins at 1. */
const DRAWN = 0.62, SEAL = 0.68;
/**
 * The sandbox we follow stands empty while the request is made, so that ours
 * is seen being made for it: on the turn before ours for that slot nobody
 * queued a job. Every other turn has one.
 */
const NONE = -SLOTS;
/**
 * And it stands empty again while our video goes back to the chat: the jobs
 * that follow ours into that slot are handed over this much late, so the next
 * sandbox is the first thing drawn once the story is told, at the speed things
 * happen.
 */
const REST = 1.9;
/** A slot says it is empty only if it will be for at least this long, and a moment after its last sandbox has gone. */
const IDLE = 1.5, PAUSE = 0.3;

/** Our job: 240 frames, rendered from 2.2 to 10.2, stored at 12. */
export const OURS = { id: "7c2e", frames: 240, file: "derivative.mp4" };
const R0 = S0 + PROV;
const R1 = R0 + OURS.frames / FPS;
const STORED = R1 + PACK + TRAVEL;

// The request. Only the scroll ever plays it, so its parts overlap: each is
// given long enough to be seen at a reading scroll, and the next begins before
// it has finished.
const TYPE0 = -5.6, TYPE1 = -4.1; // the question is typed
const CHIP = -3.8; // the assistant answers with a tool call
const CALL0 = -3.3, CALL1 = -2.4; // which goes down to the gate, and stops there
const PRESS = -2.1; // the user allows it
const TOKEN0 = -1.95, TOKEN1 = -1.05; // a token goes back up to the chat
const PASS0 = -1.2; // and the call goes through: it is a job in the queue at 0
// The delivery.
const BACK0 = STORED + 0.1; // the file leaves the store
const BACK = STORED + 0.75; // it is in the chat
const DONE = STORED + 1.4; // and the reply under it is written

/**
 * Lifecycle email keeps its own time, in real seconds, and never the same gap
 * twice running. Nothing in the export feeds it, and the scroll does not run it.
 */
const MAIL_AT = [0, 9.5, 16.5, 28.5, 36.5];
const MAIL_LOOP = 47;
const MAIL_LANDS = 2.8; // from the event to the message in the inbox
/** Where that clock stands in the finished drawing: the last message delivered, the next event a moment away. */
const MAIL0 = 8.7;

/** How long an opacity takes to follow its value, seconds of screen time. Nothing on the plate changes in one frame. */
const SOFT = 0.045;
/** The same, for what has to be out of the way before something else is drawn where it stood. */
const FAST = 0.02;
/** And for what is in a sandbox as it leaves: a large part of the plate, which goes more slowly than it would at the scroll's pace. */
const LEAVE = 0.075;
/** And a row, a file on the stack or a marker to reach the place it has been sent to. */
const GLIDE = 0.07;
/** The same, for a thing that is only followed while it can be seen. */
const SEEN = -GLIDE;

const mod = (a: number, n: number) => ((a % n) + n) % n;
/** Linear map with clamping: where p sits between a and b, from 0 to 1. */
const phase = (p: number, a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)));
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
/**
 * The site's two curves, the ones motion.ts registers with GSAP as "arrive"
 * (something coming to rest) and "swap" (one state for another, at rest at
 * both ends). They are worked out here, once, so the page can make its still
 * without GSAP: a cubic bezier from (0,0) to (1,1), sampled, and read back by
 * interpolation.
 */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const N = 96, ys = new Float32Array(N + 1);
  const at = (t: number, a: number, b: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  for (let i = 0; i <= N; i++) {
    let lo = 0, hi = 1;
    for (let k = 0; k < 32; k++) {
      const t = (lo + hi) / 2;
      if (at(t, x1, x2) < i / N) lo = t;
      else hi = t;
    }
    ys[i] = at((lo + hi) / 2, y1, y2);
  }
  return (u: number) => {
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    const f = u * N, i = Math.floor(f);
    return ys[i] + (ys[i + 1] - ys[i]) * (f - i);
  };
}
const arrive = bezier(0.22, 1, 0.36, 1);
const swap = bezier(0.65, 0, 0.35, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r1 = (v: number) => Math.round(v * 10) / 10;

const FRAMES = [165, 180, 240, 195, 210, 150, 225];
const WAITS = [3.2, 2.0, 2.6, 1.5, 2.8];
const IDS = ["a1f4", "9b03", "c81d", "e7a2", "3d5f", "b260", "58c9", "f0a7", "2e91", "d43b", "6a0c", "91e8", "4f7d"];

/** When job j's turn comes round: one every GAP, each slot in its turn. */
const turn = (j: number) => S0 + j * GAP;
/** When job j is handed to a sandbox: on its turn, or a little after it in the slot we follow once ours has been through it. */
const jobS = (j: number) => turn(j) + (j > 0 && j % SLOTS === 0 ? REST : 0);
const jobFrames = (j: number) => (j === 0 ? OURS.frames : FRAMES[mod(j, FRAMES.length)]);
/** When job j joins the queue. */
const jobA = (j: number) => turn(j) - (j === 0 ? S0 : WAITS[mod(j, WAITS.length)]);
const jobId = (j: number) => (j === 0 ? OURS.id : IDS[mod(j, IDS.length)]);
/** When job j's render is over and its sandbox has left the drawing. */
const jobGone = (j: number) => jobS(j) + PROV + jobFrames(j) / FPS + PACK + DOWN;
/** When job j's file is in the store. */
const jobT = (j: number) => jobS(j) + PROV + jobFrames(j) / FPS + PACK + TRAVEL;
/** The job after job j in the queue, and the job that follows it into its slot. */
const nextJob = (j: number) => (j + 1 === NONE ? j + 2 : j + 1);
const nextIn = (j: number) => (j + SLOTS === NONE ? j + 2 * SLOTS : j + SLOTS);
/** A job's place in the order they were queued (the turn nobody took is not counted), and the job at a place. */
const place = (j: number) => (j > NONE ? j : j + 1);
const jobAt = (q: number) => (q > NONE ? q : q - 1);
/** The job a slot holds at a moment (or is about to be handed). */
function slotJob(s: number, tau: number) {
  if (s > 0) return s + SLOTS * Math.floor((tau + LEAD - S0 - s * GAP) / CYCLE);
  if (tau >= S0 - LEAD) return SLOTS * Math.max(0, Math.floor((tau - REST + LEAD - S0) / CYCLE));
  const j = SLOTS * Math.floor((tau + LEAD - S0) / CYCLE);
  return j === NONE ? NONE - SLOTS : j;
}
/** The newest job in the queue. */
function newest(tau: number) {
  let j = Math.floor((tau - S0 + GAP) / GAP) + 1;
  while (j === NONE || jobA(j) > tau) j--;
  return j;
}

// =====================================================================
// The lesson in the frame
// =====================================================================

interface Lesson {
  f: (x: number) => number;
  d: (x: number) => number;
  /** The window: x from v[0] to v[1], y from v[2] to v[3]. */
  v: [number, number, number, number];
  /** Where the point of tangency travels over the render. */
  dom: [number, number];
  /** The label: italic, a function name set upright, a superscript, italic. */
  lab: [string, string, string, string];
  /** Where the label sits, as fractions of the frame. */
  at: [number, number];
  /** The y axis is drawn down to here, so it stops short of the slope readout. */
  foot: number;
}
/** The first is ours (why the derivative of x² is 2x). The others belong to other jobs. */
const LESSONS: Lesson[] = [
  { f: (x) => x * x, d: (x) => 2 * x, v: [-2.2, 2.2, -1.35, 3.5], dom: [-1.5, 1.5], lab: ["y = x", "", "2", ""], at: [0.545, 0.15], foot: -0.28 },
  { f: Math.sin, d: Math.cos, v: [-3.7, 3.7, -1.95, 1.75], dom: [-2.9, 2.9], lab: ["y = ", "sin ", "", "x"], at: [0.06, 0.16], foot: -1.12 },
  { f: Math.exp, d: Math.exp, v: [-2.3, 2.3, -1.45, 4.6], dom: [-2.0, 1.4], lab: ["y = e", "", "x", ""], at: [0.06, 0.16], foot: -0.3 },
];
const lessonOf = (j: number) => (j === 0 ? 0 : 1 + mod(Math.round(j / SLOTS), 2));

/** Liang–Barsky: the part of a segment inside a box, or null. */
function clipSeg(x1: number, y1: number, x2: number, y2: number, bx0: number, by0: number, bx1: number, by1: number) {
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  const edge = (pk: number, qk: number) => {
    if (pk === 0) return qk >= 0;
    const t = qk / pk;
    if (pk < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
    return true;
  };
  if (!edge(-dx, x1 - bx0) || !edge(dx, bx1 - x1) || !edge(-dy, y1 - by0) || !edge(dy, by1 - y1)) return null;
  return [x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy];
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

/** Everything about a job's video that is drawn once: the plot, its thumbnails, its timeline. */
function lessonArt(L: Layout, li: number, seed: number) {
  const l = LESSONS[li], P = L.pv, F = L.fs, T = L.tl;
  const X = (x: number) => P.x + ((x - l.v[0]) / (l.v[1] - l.v[0])) * P.w;
  const Y = (y: number) => P.y + ((l.v[3] - y) / (l.v[3] - l.v[2])) * P.h;

  let axes = `M${P.x} ${r1(Y(0))}H${P.x + P.w}M${r1(X(0))} ${P.y}V${r1(Y(l.foot))}`;
  for (let i = Math.ceil(l.v[0]); i <= l.v[1]; i++) if (i) axes += `M${r1(X(i))} ${r1(Y(0) - 2)}v4`;
  for (let i = Math.ceil(l.foot); i <= l.v[3]; i++) if (i) axes += `M${r1(X(0) - 2)} ${r1(Y(i))}h4`;

  let curve = "";
  for (let i = 0; i <= 44; i++) {
    const x = lerp(l.v[0], l.v[1], i / 44);
    curve += `${i ? "L" : "M"}${r1(X(x))} ${r1(Y(l.f(x)))}`;
  }

  // One thumbnail per cell of the filmstrip: the same plot, with the tangent
  // where it stands at that cell's frame.
  let th = "", tg = "";
  for (let c = 0; c < F.n; c++) {
    const bx = F.x + c * F.pitch + F.pad + 1.5, by = F.cy + 1.5, bw = F.cw - 3, bh = F.ch - 3;
    const tx = (x: number) => bx + ((x - l.v[0]) / (l.v[1] - l.v[0])) * bw;
    const ty = (y: number) => by + ((l.v[3] - y) / (l.v[3] - l.v[2])) * bh;
    let pen = false;
    for (let i = 0; i <= 12; i++) {
      const x = lerp(l.v[0], l.v[1], i / 12), y = l.f(x);
      if (y > l.v[3] || y < l.v[2]) { pen = false; continue; }
      th += `${pen ? "L" : "M"}${r1(tx(x))} ${r1(ty(y))}`;
      pen = true;
    }
    const x0 = lerp(l.dom[0], l.dom[1], (c + 0.5) / F.n), m = l.d(x0);
    const dx = bw / (l.v[1] - l.v[0]), dy = -(bh / (l.v[3] - l.v[2])) * m, h = (bw * 0.34) / Math.hypot(dx, dy);
    const cx = tx(x0), cy = ty(l.f(x0));
    const s = clipSeg(cx - dx * h, cy - dy * h, cx + dx * h, cy + dy * h, bx, by, bx + bw, by + bh);
    if (s) tg += `M${r1(s[0])} ${r1(s[1])}L${r1(s[2])} ${r1(s[3])}`;
  }

  // The timeline: a few scenes end to end, and narration that pauses at each cut.
  const rnd = rng(seed * 2654435761 + 97);
  const cuts = [0, 0.2 + rnd() * 0.1, 0.46 + rnd() * 0.12, 0.72 + rnd() * 0.1, 1];
  let sc = "";
  for (let i = 0; i < 4; i++) {
    const a = lerp(T.x0, T.x1, cuts[i]) + (i ? 1.25 : 0), b = lerp(T.x0, T.x1, cuts[i + 1]) - (i < 3 ? 1.25 : 0);
    sc += `M${r1(a)} ${T.sy - T.sh / 2}H${r1(b)}v${T.sh}H${r1(a)}z`;
  }
  let na = "";
  for (let x = T.x0 + 1.5; x <= T.x1 - 1; x += 3) {
    const u = (x - T.x0) / (T.x1 - T.x0);
    let near = 1;
    for (const c of cuts) near = Math.min(near, Math.abs(u - c));
    const h = Math.max(0.7, T.nh * clamp(near / 0.03, 0.1, 1) * (0.25 + 0.75 * rnd()));
    na += `M${r1(x)} ${r1(T.ny - h)}V${r1(T.ny + h)}`;
  }
  return { axes, curve, th, tg, sc, na };
}

// =====================================================================
// The two drawings
// =====================================================================

/** A route for something that travels: points, and the distance to each. */
interface Poly { p: number[]; at: number[]; total: number }
function poly(...p: number[]): Poly {
  const at = [0];
  for (let i = 2; i < p.length; i += 2) at.push(at[at.length - 1] + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]));
  return { p, at, total: at[at.length - 1] };
}
/** The point a fraction u along a route, written here so nothing is allocated per frame. */
const PT = [0, 0];
function along(pl: Poly, u: number) {
  const d = clamp(u, 0, 1) * pl.total;
  let i = 1;
  while (i < pl.at.length - 1 && pl.at[i] < d) i++;
  const a = pl.at[i - 1], b = pl.at[i], k = b > a ? (d - a) / (b - a) : 0;
  PT[0] = lerp(pl.p[2 * i - 2], pl.p[2 * i], k);
  PT[1] = lerp(pl.p[2 * i - 1], pl.p[2 * i + 1], k);
}

const head = (x: number, y: number, dir: "u" | "d" | "l" | "r", s = 3.4) =>
  dir === "d" ? `M${x - s} ${y - s - 0.6}L${x} ${y}L${x + s} ${y - s - 0.6}`
  : dir === "u" ? `M${x - s} ${y + s + 0.6}L${x} ${y}L${x + s} ${y + s + 0.6}`
  : dir === "r" ? `M${x - s - 0.6} ${y - s}L${x} ${y}L${x - s - 0.6} ${y + s}`
  : `M${x + s + 0.6} ${y - s}L${x} ${y}L${x + s + 0.6} ${y + s}`;

/** A rounded rectangle as a path, drawn clockwise from its top left corner. */
const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}H${x + w - r}a${r} ${r} 0 0 1 ${r} ${r}V${y + h - r}a${r} ${r} 0 0 1${-r} ${r}H${x + r}a${r} ${r} 0 0 1${-r}${-r}V${y + r}a${r} ${r} 0 0 1 ${r}${-r}Z`;
const inset = (b: { x: number; y: number; w: number; h: number }, r = 7) => rr(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, r);

/** A window edge cut short: the conversation carries on past it. */
function zig(x0: number, x1: number, y: number, amp: number, teeth: number) {
  let d = "";
  const st = (x1 - x0) / (2 * teeth);
  for (let i = 1; i <= 2 * teeth; i++) d += `L${r2(x0 + st * i)} ${r2(y + (i % 2 ? amp : 0))}`;
  return d;
}

/** A height in the drawing, and how far down the window it stands (0 the top, 1 the bottom) when something is due. */
type Mark = readonly [y: number, at: number];

/**
 * One drawing. Wide is 640 across on a twelve-column grid; narrow is 400 across
 * and stacked, for a phone. Both carry the same parts under the same keys.
 */
export function layout(wide: boolean) {
  const W = wide ? 640 : 400;

  // ---------- 1. the request: the chat, the server, the app ----------
  const chat = wide ? { x: 0, y: 0, w: 421, h: 124, bar: 19 } : { x: 0, y: 0, w: 400, h: 146, bar: 22 };
  const bub = wide
    ? { x: 197, y: 27, w: 214, h: 38, tx: 209, y1: 41.5, y2: 55.5, w1: 176, w2: 118 }
    : { x: 150, y: 31, w: 240, h: 44, tx: 163, y1: 46, y2: 62, w1: 204, w2: 138 };
  const ask = wide ? { ax: 15, y: 80, x0: 28, x1: 150 } : { ax: 16, y: 92, x0: 30, x1: 170 };
  const cr = wide ? { x: 28, y: 90, w: 228, h: 22 } : { x: 30, y: 102, w: 276, h: 26 };
  const chip = { ...cr, gx: cr.x + 13, gy: cr.y + cr.h / 2, tx: cr.x + 24, kx: cr.x + cr.w - 14 };
  const cb = cr.y + cr.h;
  const strip = wide ? { x: 0, y: 140, w: 421, h: 36 } : { x: 0, y: 164, w: 400, h: 40 };
  /** The spine: our request runs straight down this line, from the chat into the queue. */
  const sx = wide ? 48 : 50;
  const gy = strip.y + strip.h / 2;
  const btn = wide ? { x: 212, y: gy - 10, w: 48, h: 20 } : { x: 220, y: gy - 11, w: 52, h: 22 };
  const tokX = btn.x + btn.w / 2;
  const gate = { x: sx, y: gy, px: sx + 2.8, py: gy - 1.5, tx: sx + 16, ox: btn.x + btn.w + 10 };

  const app = wide ? { x: 437, y: 0, w: 203, h: 176, bar: 19 } : { x: 160, y: 220, w: 240, h: 66, bar: 22 };
  const abtn = wide ? { x: app.x + 10, y: 140, w: 108, h: 24 } : { x: app.x + 10, y: 250, w: 124, h: 26 };
  const player = { x: app.x + 10, y: app.y + 27, w: app.w - 20, h: 103 };
  const jy = wide ? 190 : abtn.y + abtn.h / 2;
  const ax0 = abtn.x + 30;

  // ---------- 2. the render: the queue and the sandboxes ----------
  const qy = wide ? 208 : 304;
  const queue = wide
    ? { x: 0, y: qy, w: 148, h: 230, bar: 22, rows: 10, pitch: 20, src: false, gx: 15, ix: 27, fx: 0, y0: qy + 24 }
    : { x: 0, y: qy, w: 400, h: 164, bar: 24, rows: 6, pitch: 22, src: true, gx: 17, ix: 31, fx: 86, y0: qy + 26 };
  const bxX = wide ? 164 : 26, bxW = wide ? 452 : 348, ch = wide ? 28 : 30;
  const hero = { x: bxX, y: wide ? qy : queue.y + queue.h + 16, w: bxW, h: wide ? 154 : 240, bar: wide ? 22 : 24 };
  const c1 = { x: bxX, y: hero.y + hero.h + 12, w: bxW, h: ch, bar: ch };
  const c2 = { x: bxX, y: c1.y + ch + 8, w: bxW, h: ch, bar: ch };
  const cells = wide ? 16 : 12;
  const boxes = [hero, c1, c2].map((b) => {
    const sx0 = b.x + (wide ? 124 : 66), sx1 = b.x + b.w - (wide ? 80 : 84);
    return {
      ...b,
      lx: b.x + 14, ly: b.y + b.bar / 2,
      ix: b.x + 26,
      rx: b.x + 64,
      sx0, sx1, sp: (sx1 - sx0) / cells,
    };
  });

  const pv = wide ? { x: hero.x + 10, y: hero.y + 30, w: 144, h: 81, tan: 30 } : { x: hero.x + 10, y: hero.y + 32, w: 176, h: 99, tan: 36 };
  const tl = wide
    ? { tx: pv.x + pv.w + 12, ty: hero.y + 36, cx: hero.x + hero.w - 10, cy: hero.y + 36, lx: pv.x + pv.w + 12, x0: pv.x + pv.w + 74, x1: hero.x + hero.w - 10, sy: hero.y + 58, sh: 12, ny: hero.y + 80, nh: 8, ry: hero.y + 92, ly: hero.y + 103.5, top: hero.y + 50, bot: hero.y + 96 }
    : { tx: pv.x + pv.w + 12, ty: hero.y + 42, cx: pv.x + pv.w + 12, cy: hero.y + 74, lx: hero.x + 10, x0: hero.x + 80, x1: hero.x + hero.w - 10, sy: hero.y + 150, sh: 13, ny: hero.y + 173, nh: 9, ry: hero.y + 188, ly: hero.y + 200, top: hero.y + 140, bot: hero.y + 192 };
  const fr = wide ? { x: hero.x + 10, y: hero.y + 118, w: hero.w - 20, h: 28 } : { x: hero.x + 10, y: hero.y + 208, w: hero.w - 20, h: 26 };
  const pitch = fr.w / cells;
  const fs = { ...fr, n: cells, pitch, pad: 1.25, cw: pitch - 2.5, cy: fr.y + 6, ch: fr.h - 12 };

  /** Two rails beside the sandboxes: jobs go in down one, files come out down the other. */
  const dx = wide ? 156 : 12, ox = wide ? 628 : 388;
  const py = hero.y + hero.bar / 2;
  const dtap = [py, c1.y + ch / 2, c2.y + ch / 2];
  const taps = [fs.y + fs.h / 2, c1.y + ch / 2, c2.y + ch / 2];
  const turnY = c2.y + ch + (wide ? 18 : 16);

  // ---------- 3. delivery: the file store, and the chat again ----------
  const bk = wide ? { cx: 265.5, y: turnY + 43, rx: 32, ry: 6, h: 58, bw: 25.5 } : { cx: 334, y: turnY + 26, rx: 36, ry: 7, h: 72, bw: 28 };
  const tile = wide ? { w: 40, h: 15 } : { w: 44, h: 17 };
  const store = { ...bk, s0: bk.y + (wide ? 15 : 17), sp: tile.h + 2 };
  /** The store's half-width at a height. */
  const bhw = (y: number) => bk.rx - (bk.rx - bk.bw) * ((y - bk.y) / bk.h);
  const y3 = wide ? turnY + 16 : bk.y + bk.h + 20;
  // Wide: the file on top of the stack and the attachment sit on one line.
  const reply = wide ? { x: 0, y: y3, w: 203, h: 116 } : { x: 222, y: y3, w: 178, h: 124 };
  const H = y3 + reply.h;
  const att = wide
    ? { x: reply.x + 28, y: reply.y + 27, w: 165, h: 30 }
    : { x: reply.x + 28, y: reply.y + 30, w: 140, h: 34 };
  const rep = {
    yt: reply.y + 5, lx: reply.x + (wide ? 28 : 12), ly: reply.y + (wide ? 17 : 19),
    ax: reply.x + (wide ? 15 : 14), ay: att.y + att.h / 2,
    sy: att.y + att.h + (wide ? 12 : 14), x0: att.x, x1: att.x + (wide ? 122 : 100),
    comp: wide ? { x: reply.x + 10, y: reply.y + 84, w: reply.w - 20, h: 22 } : { x: reply.x + 8, y: reply.y + 90, w: reply.w - 16, h: 24 },
  };

  // ---------- beside it, and fed by none of it: lifecycle email ----------
  // An account event, EventBridge, SES, an inbox. It has no wire to the export.
  const lane = wide ? { x: 328, y: y3, w: 312, h: reply.h } : { x: 0, y: turnY + 2, w: 200, h: H - turnY - 2 };
  const mx = wide ? 390.5 : 100; // the lane's own axis
  const pw = wide ? 93 : 112, ph = wide ? 22 : 24;
  const pill = (dy: number, w = pw) => ({ x: mx - w / 2, y: lane.y + dy, w, h: ph });
  const src = pill(wide ? 22 : 38), eb = pill(wide ? 54 : 72), ses = pill(wide ? 86 : 106, wide ? 57 : 60);
  const mail = wide
    ? { x: 453, y: lane.y + 22, w: 187, h: 90, bar: 19 }
    : { x: 0, y: lane.y + 143, w: 200, h: H - lane.y - 143, bar: 22 };
  const mm = {
    hx: lane.x + (wide ? 16 : 2), hy: lane.y + 8,
    x: mail.x + 19, dot: mail.x + 11, top: mail.y + mail.bar + 6, pitch: wide ? 30 : 32,
    ty: wide ? 9 : 10, sy: wide ? 21 : 23, len: wide ? 150 : 160,
  };

  // ---------- wires, as drawn and as travelled ----------
  const sey = ses.y + ses.h / 2;
  const resY = rep.ay;
  const seg = {
    call: `M${sx} ${cb}V${queue.y - 1.5}` + head(sx, queue.y - 1, "d"),
    tok: `M${tokX} ${btn.y}V${cb + 1.5}` + head(tokX, cb + 1, "u"),
    app: wide ? `M${ax0} ${abtn.y + abtn.h}V${jy}H${sx}` : `M${abtn.x} ${jy}H${sx}`,
    disp0: (wide ? `M${queue.x + queue.w} ${py}` : `M${dx} ${queue.y + queue.h}V${py}`) + `H${hero.x - 1.5}` + head(hero.x - 1, py, "r"),
    dispR: [1, 2].map((i) => `M${dx} ${i === 1 ? py : dtap[1]}V${dtap[i]}H${bxX - 1.5}` + head(bxX - 1, dtap[i], "r")).join(""),
    out0: `M${hero.x + hero.w} ${taps[0]}H${ox}V${turnY}H${bk.cx}V${bk.y - 2.5}` + head(bk.cx, bk.y - 2, "d"),
    outR: `M${bxX + bxW} ${taps[1]}H${ox}M${bxX + bxW} ${taps[2]}H${ox}`,
    res: wide
      ? `M${r2(bk.cx - bhw(resY) - 1)} ${resY}H${reply.x + reply.w + 1.5}` + head(reply.x + reply.w + 1, resY, "l")
      : `M${bk.cx} ${bk.y + bk.h + 6}V${reply.y - 1.5}` + head(bk.cx, reply.y - 1, "d"),
    // The email lane's own wires: never part of our job's route.
    m1: `M${mx} ${src.y + src.h}V${eb.y - 1.5}` + head(mx, eb.y - 1, "d"),
    m2: `M${mx} ${eb.y + eb.h}V${ses.y - 1.5}` + head(mx, ses.y - 1, "d"),
    m3: wide
      ? `M${ses.x + ses.w} ${sey}H${mail.x - 1.5}` + head(mail.x - 1, sey, "r")
      : `M${mx} ${ses.y + ses.h}V${mail.y - 1.5}` + head(mx, mail.y - 1, "d"),
  };
  const route = {
    app: wide ? poly(ax0, abtn.y + abtn.h, ax0, jy, sx, jy, sx, queue.y) : poly(abtn.x, jy, sx, jy, sx, queue.y),
    disp: [0, 1, 2].map((i) =>
      wide
        ? i === 0 ? poly(queue.x + queue.w, py, hero.x, py) : poly(queue.x + queue.w, py, dx, py, dx, dtap[i], bxX, dtap[i])
        : poly(dx, queue.y + queue.h, dx, dtap[i], bxX, dtap[i]),
    ),
    out: taps.map((t) => poly(ox, t, ox, turnY, bk.cx, turnY)),
    res: wide ? poly(bk.cx, resY, reply.x + reply.w + 22, resY) : poly(bk.cx, bk.y + bk.h - 8, bk.cx, reply.y + 16),
    m1: poly(mx, src.y + src.h, mx, eb.y),
    m2: poly(mx, eb.y + eb.h, mx, ses.y),
    m3: wide ? poly(ses.x + ses.w, sey, mail.x + 5, sey) : poly(mx, ses.y + ses.h, mx, mail.y + 5),
  };
  // How far along its drawn route our file is at three moments: on the rail,
  // at the end of the level run, in the store.
  const outLen = ox - (hero.x + hero.w) + route.out[0].total + (bk.y - turnY);
  const trOut = { a: (ox - (hero.x + hero.w)) / outLen, b: (ox - (hero.x + hero.w) + route.out[0].total) / outLen };

  // ---------- frames and fixed shapes ----------
  const d = {
    chat: `M${chat.x + 0.5} ${chat.y + chat.h - 5}V${chat.y + 7.5}a7 7 0 0 1 7-7H${chat.x + chat.w - 7.5}a7 7 0 0 1 7 7V${chat.y + chat.h - 5}` + zig(chat.x + chat.w - 0.5, chat.x + 0.5, chat.y + chat.h - 5, 4, wide ? 30 : 28) + "Z",
    reply: `M${reply.x + 0.5} ${rep.yt}` + zig(reply.x + 0.5, reply.x + reply.w - 0.5, rep.yt, -4, wide ? 14 : 12) + `V${reply.y + reply.h - 7.5}a7 7 0 0 1-7 7H${reply.x + 7.5}a7 7 0 0 1-7-7Z`,
    strip: inset(strip), app: inset(app), queue: inset(queue), mail: inset(mail),
    box: [hero, c1, c2].map((b, i) => inset(b, i ? 6 : 8)),
    // Wires in three sets: the request's, the render's, the delivery's.
    w1: seg.call + seg.tok + seg.app,
    w2: seg.disp0 + seg.dispR + seg.out0 + seg.outR,
    w3: seg.res,
    wm: seg.m1 + seg.m2 + seg.m3,
    divide: wide ? `M321 ${y3 + 4}V${H - 2}` : `M208.5 ${lane.y + 6}V${H - 2}`,
    store:
      `M${bk.cx - bk.rx} ${bk.y}a${bk.rx} ${bk.ry} 0 0 0 ${2 * bk.rx} 0a${bk.rx} ${bk.ry} 0 0 0 ${-2 * bk.rx} 0` +
      `L${bk.cx - bk.bw} ${bk.y + bk.h}a${bk.bw} ${r2((bk.ry * bk.bw) / bk.rx)} 0 0 0 ${2 * bk.bw} 0L${bk.cx + bk.rx} ${bk.y}`,
    ruler: `M${tl.x0} ${tl.ry}H${tl.x1}` + Array.from({ length: 9 }, (_, i) => `M${r2(lerp(tl.x0, tl.x1, i / 8))} ${tl.ry}v${i % 4 ? 2.5 : 4.5}`).join(""),
    playhead: `M0 ${tl.top}V${tl.bot}M-3 ${tl.top - 3.5}h6l-3 3.5z`,
    sprockets: [fs.y + 3, fs.y + fs.h - 3].map((y) => `M${r2(fs.x + pitch / 4 - 1.5)} ${y}H${fs.x + fs.w}`).join(""),
    cells: Array.from({ length: cells }, (_, c) => `M${r2(fs.x + c * pitch + fs.pad)} ${fs.cy}h${r2(fs.cw)}v${fs.ch}h${r2(-fs.cw)}z`).join(""),
    needle: `M0 ${fs.y - 3}V${fs.y + fs.h + 3}M-2.6 ${fs.y - 3}h5.2M-2.6 ${fs.y + fs.h + 3}h5.2`,
  };

  // ---------- where the story is when the scroll has brought each part into view ----------
  // The plate lets its sheet out from the top at about 0.94 of the window's
  // height (reveal.ts), so every one of these stands clear of that line. Side
  // by side the whole plate nearly fits a window, and the story is told by the
  // time its foot has come in: a plate at rest in the middle of the window is
  // already running by itself. Stacked it is taller than a window, and the
  // story follows the reader down it.
  const marks: Record<"type" | "queued" | "disp" | "s0" | "r0" | "r1" | "stored" | "done" | "mail", Mark> = wide
    ? {
        type: [bub.y + bub.h, 0.903], queued: [queue.y0 + queue.pitch, 0.866],
        disp: [hero.y + hero.h, 0.923], s0: [hero.y + hero.h, 0.91], r0: [hero.y + hero.h, 0.845],
        r1: [turnY, 0.786], stored: [H, 0.849], done: [H, 0.787], mail: [lane.y + 34, 0.9],
      }
    : {
        type: [bub.y + bub.h, 0.895], queued: [queue.y0 + queue.pitch, 0.78],
        disp: [hero.y + 12, 0.795], s0: [hero.y + hero.h, 0.981], r0: [hero.y + hero.h, 0.887],
        r1: [hero.y + hero.h, 0.59], stored: [bk.y + bk.h, 0.697], done: [att.y + att.h, 0.676], mail: [lane.y + 60, 0.9],
      };

  // Each stage answers to a pointer, a finger and the keyboard through one
  // rectangle. The hit area is the part plus a margin (more above and below a
  // shallow part, so a fingertip has 40px to land on); the ring hugs the part
  // and shows keyboard focus. Hit areas never overlap.
  const hit = (st: Stage, b: { x: number; y: number; w: number; h: number }, tab = true, padY = 3) => ({
    st, tab, x: b.x - 3, y: b.y - padY, w: b.w + 6, h: b.h + 2 * padY,
    ring: { x: b.x - 3, y: b.y - 3, w: b.w + 6, h: b.h + 6 },
  });
  const hits = [
    hit("chat", chat),
    hit("oauth", strip, true, 7),
    hit("app", app),
    hit("queue", queue),
    hit("box", { x: bxX, y: hero.y, w: bxW, h: c2.y + ch - hero.y }),
    hit("store", wide
      ? { x: bk.cx - bk.rx - 5, y: bk.y - 7, w: 2 * bk.rx + 10, h: H - bk.y + 4 }
      : { x: bk.cx - bk.rx - 84, y: bk.y - 7, w: 2 * bk.rx + 89, h: bk.h + 19 }),
    hit("mail", { x: lane.x + (wide ? 11 : 0), y: lane.y, w: lane.w - (wide ? 11 : 0), h: lane.h }),
    // The chat again, lower down: the pointer's only; the keyboard reads the chat once.
    hit("chat", reply, false),
  ];

  return {
    wide, W, H, chat, bub, ask, chip, cb, strip, sx, btn, tokX, gate, app, abtn, player, jy,
    queue, boxes, pv, tl, fs, dx, ox, turnY, store, tile, reply, att, rep, lane, mx, src, eb, ses, mail, mm,
    seg, route, trOut, d, marks, hits,
    sup: wide ? 4.2 : 5,
    pr: wide ? 2.4 : 2.8,
    call: { y0: cb, stop: gy - 12, y1: queue.y },
    tok: { y0: btn.y - 4, y1: cb + 5 },
    cur: {
      ax0: btn.x + btn.w + 28, ay0: btn.y + btn.h + 14, ax1: btn.x + btn.w - 7, ay1: gy + 2,
      px0: abtn.x + abtn.w + (wide ? 44 : 60), py0: abtn.y + (wide ? 18 : 16), px1: abtn.x + abtn.w - 12, py1: abtn.y + abtn.h / 2 + 1,
    },
    notes: {
      call: [sx + 7, (cb + strip.y) / 2 + 4] as const,
      tok: [tokX + 13, (cb + strip.y) / 2 + 4] as const,
      job: [sx - 8, queue.y - (wide ? 9 : 19)] as const,
      down: [bk.cx - 30, turnY] as const,
      store: wide ? ([bk.cx, H - 12, "middle"] as const) : ([bk.cx - bk.rx - 12, bk.y + 42, "end"] as const),
    },
  };
}
export type Layout = ReturnType<typeof layout>;
export const LAYOUTS = [layout(true), layout(false)];

// =====================================================================
// The scroll, and what it has reached
// =====================================================================

/** Where a drawing stands in the window, measured when the page is. Lengths in px. */
export interface Geo {
  /** The window's height. */
  vh: number;
  /** The plate's top, from the top of the window, as the story begins and as the scroll lets go of it. */
  t0: number;
  t1: number;
  /** The drawing's top inside the plate, and px to one of its units. */
  y0: number;
  s: number;
}
/** Scroll progress at which a height in the drawing stands a given way down the window. */
const see = (G: Geo, m: Mark) => (G.t0 - (m[1] * G.vh - G.y0 - m[0] * G.s)) / (G.t0 - G.t1);

/** How far either side of a corner the story clock is rounded, as scroll progress: it changes speed over a few frames, never in one. */
const ROUND = 0.012;

/**
 * Scroll progress to story time: corner points of a broken line, placed so
 * that each part of the story plays once the scroll has brought its part of
 * the plate clear of the edge the plate is being let out from.
 */
export function schedule(L: Layout, G: Geo) {
  const span = Math.max(1, G.t0 - G.t1), px = (n: number) => n / span, M = L.marks;
  const P = [0, see(G, M.type), see(G, M.queued), see(G, M.disp), see(G, M.s0), see(G, M.r0), see(G, M.r1), see(G, M.stored), see(G, M.done), 1];
  const TAU = [T_START, TYPE0, 0, S0 - LEAD, S0, R0, R1, STORED, DONE, DONE];
  // No part of it in less scroll than this, whatever the window.
  const least = [0, 16, 110, 20, 10, 36, 110, 50, 50];
  const last = P.length - 2;
  for (let i = 1; i <= last; i++) P[i] = Math.max(P[i], P[i - 1] + px(least[i]));
  // In a window too short for all of that the story closes up, so that it is
  // told by the time the plate stands in the middle of the window (which, side
  // by side, is at 0.92 of the way or later whatever the window's height).
  if (P[last] > 0.92) {
    const k = 0.92 / P[last];
    for (let i = 1; i <= last; i++) P[i] *= k;
  }
  // Past the delivery the clock is not the scroll's (see the loop below); the
  // line simply carries on at the pace it had, so it comes up to that point
  // without changing speed.
  TAU[last + 1] = TAU[last] + ((TAU[last] - TAU[last - 1]) / (P[last] - P[last - 1])) * (1 - P[last]);
  return {
    P, TAU,
    /** From here on the video is back in the chat, and the clock runs by itself. */
    hand: P[last],
    /** Scrolling back this far past that point takes the drawing back into the story. */
    back: px(64),
    /** The email lane is in view from here. */
    mail: see(G, M.mail),
  };
}
export type Schedule = ReturnType<typeof schedule>;

/** The area under the broken line, from 0 to q. */
function area(S: Schedule, q: number) {
  const P = S.P, T = S.TAU, n = P.length - 1;
  if (q <= 0) return T[0] * q;
  let s = 0;
  for (let i = 1; i <= n; i++) {
    const a = P[i - 1], b = P[i];
    if (q >= b) { s += ((T[i - 1] + T[i]) / 2) * (b - a); continue; }
    return s + ((T[i - 1] + lerp(T[i - 1], T[i], (q - a) / (b - a))) / 2) * (q - a);
  }
  return s + T[n] * (q - 1);
}
/** Scroll progress to story time: the broken line, averaged over a short stretch so its corners are rounded. */
export function tauOf(S: Schedule, p: number) {
  const d = Math.min(ROUND, p, 1 - p);
  if (d < 1e-5) return p <= 0 ? S.TAU[0] : S.TAU[S.TAU.length - 1];
  return (area(S, p + d) - area(S, p - d)) / (2 * d);
}

// =====================================================================
// The drawing, for any moment
// =====================================================================

/** Where draw() sends what it decides. Keys name elements (their data-k). */
export interface Sink {
  /**
   * A numeric attribute, rounded to d places. With `tc` it follows its value
   * over about that many seconds of screen time. A negative `tc` follows the
   * same way while the element can be seen, and simply moves it while it cannot
   * (a thing that comes back somewhere else should not be seen flying there).
   */
  n(k: string, a: string, v: number, d?: number, tc?: number): void;
  /** Any other attribute. */
  s(k: string, a: string, v: string): void;
  /** Text content. */
  t(k: string, v: string): void;
  /** A class, on or off. */
  c(k: string, name: string, on: boolean): void;
  /** Position, and optionally turn and scale. With `tc` the position follows. */
  m(k: string, x: number, y: number, rot?: number, sc?: number, tc?: number): void;
  /** Opacity. It always follows (SOFT) unless told to cut with a `tc` of 0. */
  o(k: string, v: number, tc?: number): void;
  /** Whether a key has moved on to a new version since it was last asked. Always true on the server. */
  fresh(k: string, v: number): boolean;
  /** One mark for another: the element dips, `set` changes it at the bottom of the dip, and it comes back. `now` skips the dip. */
  dip(k: string, set: () => void, now?: boolean): void;
  /** One label rolling over to the next: `k` takes the new text and rises into place as its twin `k2` carries the old one out. `now` skips the roll. */
  roll(k: string, k2: string, v: string, now?: boolean): void;
}

export interface Frame {
  /** Story time, seconds. */
  tau: number;
  /** Wall clock, for things that turn or blink. */
  now: number;
  /** The email lane's own clock, seconds. */
  mail: number;
  /** 1 while the clock runs at the speed things happen; toward 0 as the scroll runs it faster than the eye can follow. */
  calm: number;
  /** The frame of the big sandbox's render the reader is pointing at, as a fraction of it; below 0 for none. */
  peek: number;
  /** How far the picture in the sandbox has gone over to that frame, 0 to 1. */
  mix: number;
  /** Measured widths of the two lines of the question, when known. */
  w1: number;
  w2: number;
}
/** The finished drawing: the moment the page is served at, and the scroll story ends on. */
export const still = (): Frame => ({ tau: T_END, now: 0, mail: MAIL0, calm: 1, peek: -1, mix: 0, w1: 0, w2: 0 });

/** What the big sandbox is showing, left here by draw() for the readout: frames in its render (0 if it has none), the one in its picture, the slope there. */
const SHOWN = { n: 0, frame: 0, slope: 0 };

export const transform = (x: number, y: number, rot = 0, sc = 1) =>
  `translate(${r2(x)} ${r2(y)})` + (rot ? ` rotate(${r2(rot)})` : "") + (sc !== 1 ? ` scale(${r2(sc)})` : "");

/** Dash length of anything drawn on with pathLength="1"; a hair over, so a finished stroke has no gap. */
const DASH = 1.002;
/** The bright stroke at the head of a sandbox's outline while it is being drawn, as a share of the outline. */
const NIB = 0.024;
const STATE = ["queued", "rendering", "done"];
const SEALS = ["1 render · starting", "1 render · sealed"];
/** Queue glyphs, drawn about their own centre: a ring, three quarters of one (it turns), a tick. */
const GLYPH = ["M3.4 0A3.4 3.4 0 1 1-3.4 0A3.4 3.4 0 1 1 3.4 0", "M0-3.6A3.6 3.6 0 1 1-3.6 0", "M-3.4 .2l2.3 2.4 4.4-4.9"];
const MINUS = "−";
const slopeText = (hundredths: number) => (hundredths < 0 ? MINUS : "") + (Math.abs(hundredths) / 100).toFixed(2);

// Keys are built once; nothing is concatenated per frame.
const ROW = Array.from({ length: 12 }, (_, i) => ({ g: `q${i}`, gl: `q${i}g`, id: `q${i}i`, src: `q${i}f`, s: `q${i}s`, r: `q${i}r` }));
const BOX = Array.from({ length: SLOTS }, (_, i) => ({ g: `b${i}`, o: `b${i}o`, c: `b${i}c`, l: `b${i}l`, id: `b${i}i`, st: `b${i}s`, p: `b${i}p`, n: `b${i}n`, pk: `d${i}`, pg: `b${i}g` }));
const TILES = 8;
const TILE = Array.from({ length: TILES }, (_, i) => `t${i}`);
const MSG = Array.from({ length: 3 }, (_, i) => ({ g: `mr${i}`, dot: `mr${i}d`, sk: `mr${i}s` }));
/** How much of its line each message's subject takes: they are not all alike. */
const SUBJECT = [0.62, 0.86, 0.5, 0.74, 0.94];

export function draw(L: Layout, f: Frame, out: Sink) {
  const tau = f.tau, now = f.now, calm = f.calm;

  // ---------- the question types itself into the chat ----------
  const ty = phase(tau, TYPE0, TYPE1);
  const w1 = f.w1 || L.bub.w1, w2 = f.w2 || L.bub.w2, k1 = w1 / (w1 + w2);
  const u1 = phase(ty, 0, k1), u2 = phase(ty, k1, 1);
  out.o("bub", phase(tau, TYPE0 - 0.35, TYPE0));
  out.n("bub.l1", "width", ty >= 1 ? L.bub.w : 3 + w1 * u1, 1);
  out.n("bub.l2", "width", ty >= 1 ? L.bub.w : u2 > 0 ? 3 + w2 * u2 : 0, 1);
  const typing = ty > 0 && ty < 1;
  out.o("bub.caret", typing ? 1 : 0);
  if (typing) out.m("bub.caret", L.bub.tx + (u2 > 0 ? w2 * u2 : w1 * u1) + 2, u2 > 0 ? L.bub.y2 : L.bub.y1);

  // ---------- the assistant answers with a tool call ----------
  out.o("ask", phase(tau, TYPE1, TYPE1 + 0.35));
  out.n("ask.sk", "x2", lerp(L.ask.x0, L.ask.x1, arrive(phase(tau, TYPE1 + 0.1, TYPE1 + 0.9))), 1);
  const chp = arrive(phase(tau, CHIP, CHIP + 0.8));
  out.o("chip", chp);
  out.m("chip", 0, (1 - chp) * 5);
  // It turns until the video is back; then a tick is drawn in its place.
  const ok = phase(tau, BACK, BACK + 0.25), tick = phase(tau, BACK + 0.1, BACK + 0.5);
  out.o("chip.spin", 1 - ok);
  if (ok < 1) out.m("chip.spin", L.chip.gx, L.chip.gy, (now * 300) % 360);
  out.o("chip.tick", tick > 0 ? 1 : 0);
  out.n("chip.tick", "stroke-dashoffset", (1 - tick) * DASH, 3);
  out.o("chip.key", phase(tau, TOKEN1 - 0.15, TOKEN1 + 0.2));

  // The call stops at the gate until the user has authorised, then goes through.
  const g1 = swap(phase(tau, CALL0, CALL1)), g2 = swap(phase(tau, PASS0, -0.05));
  const cy = lerp(lerp(L.call.y0, L.call.stop, g1), L.call.y1, g2);
  const calling = tau > CALL0 && tau < 0.1;
  out.o("pk.call", calling ? Math.min(phase(tau, CALL0, CALL0 + 0.15), 1 - phase(tau, -0.05, 0.1)) : 0);
  if (calling) out.n("pk.call", "cy", cy, 1);
  out.n("tr.call", "stroke-dashoffset", (1 - (cy - L.call.y0) / (L.call.y1 - L.call.y0)) * DASH, 3);

  const open = arrive(phase(tau, PRESS + 0.55, PRESS + 1.05));
  out.m("gate.sh", L.gate.px, L.gate.py - 1.6 * open, 24 * open);
  ping(out, "gate.ping", phase(tau, PRESS + 0.75, PRESS + 1.5), 1);
  out.c("consent", "wait", tau >= CALL1 - 0.1 && tau < PRESS);
  out.c("allow", "press", tau >= PRESS && tau < PRESS + 0.25);
  out.c("allow", "done", tau >= PRESS);
  out.o("consent.ok", phase(tau, PRESS + 0.1, PRESS + 0.6));
  const ci = arrive(phase(tau, CALL0 + 0.3, PRESS - 0.05));
  out.o("cur.allow", Math.min(phase(tau, CALL0 + 0.3, CALL0 + 0.55), 1 - phase(tau, PRESS + 0.35, PRESS + 0.8)));
  out.m("cur.allow", lerp(L.cur.ax0, L.cur.ax1, ci), lerp(L.cur.ay0, L.cur.ay1, ci));
  // The token goes back up to the chat, which sends it with every call from then on.
  const tk = swap(phase(tau, TOKEN0, TOKEN1));
  out.o("tok", Math.min(phase(tau, TOKEN0, TOKEN0 + 0.15), 1 - phase(tau, TOKEN1 - 0.1, TOKEN1 + 0.1)));
  out.m("tok", L.tokX, lerp(L.tok.y0, L.tok.y1, tk));
  out.n("tr.tok", "stroke-dashoffset", (1 - tk) * DASH, 3);

  // ---------- meanwhile, other people press Export MP4 in the app ----------
  const n = newest(tau), n1 = nextJob(n);
  let au = 0, ain = 0, press = false;
  if (n1 !== 0) {
    const a = jobA(n1);
    au = phase(tau, a - 0.9, a);
    ain = arrive(phase(tau, a - 1.5, a - 1.02)) * (1 - arrive(phase(tau, a - 0.8, a - 0.3))) * calm;
    press = calm > 0.5 && tau >= a - 1.02 && tau < a - 0.8;
  }
  out.m("cur.app", lerp(L.cur.px0, L.cur.px1, ain), lerp(L.cur.py0, L.cur.py1, ain));
  out.c("app.btn", "press", press);
  const sent = au > 0 && au < 1;
  out.o("pk.app", sent ? Math.min(1, au * 10, (1 - au) * 10) * calm : 0);
  if (sent) {
    along(L.route.app, swap(au));
    out.n("pk.app", "cx", PT[0], 1);
    out.n("pk.app", "cy", PT[1], 1);
  }

  // ---------- the queue: one row per job, newest first ----------
  // A job joins at the top, where its wire comes in, and the rest move down a row.
  const Q = L.queue, R = Q.rows;
  const arr = jobA(n);
  const shift = arrive(phase(tau, arr, arr + 0.4));
  let ourY = -1, ourO = 0;
  const top = place(n);
  for (let q = top - R; q <= top; q++) {
    const j = jobAt(q), K = ROW[mod(q, R + 1)];
    const taken = out.fresh(K.g, j);
    const y = Q.y0 + (top - q - 1 + shift) * Q.pitch;
    const o = q === top - R ? 1 - shift : q === top ? shift : 1;
    if (taken) {
      out.t(K.id, jobId(j));
      out.c(K.g, "our", j === 0);
      if (Q.src) out.t(K.src, j === 0 ? "from chat" : "from app");
      // A row comes in from the end of the list it joins at, at the pace the others make room for it.
      const from = q === top ? Q.y0 - Q.pitch : q === top - R ? Q.y0 + R * Q.pitch : y;
      out.m(K.g, 0, from);
      out.o(K.g, q === top || q === top - R ? 0 : o, 0);
      if (j === 0) {
        out.n("q.our", "y", from + 1, 1);
        out.o("q.our", 0, 0);
      }
    }
    out.m(K.g, 0, y, 0, 1, GLIDE);
    out.o(K.g, o);
    const state = tau < jobS(j) ? 0 : tau < jobT(j) ? 1 : 2;
    if (out.fresh(K.s, state)) {
      out.c(K.g, "st-q", state === 0);
      out.c(K.g, "st-r", state === 1);
      out.c(K.g, "st-d", state === 2);
      out.roll(K.s, K.r, STATE[state], taken);
      out.dip(K.gl, () => out.s(K.gl, "d", GLYPH[state]), taken);
    }
    out.m(K.gl, Q.gx, Q.pitch / 2, state === 1 ? (now * 300 + j * 67) % 360 : 0);
    if (j === 0) { ourY = y; ourO = o; }
  }
  out.o("q.our", ourY >= 0 ? ourO : 0);
  if (ourY >= 0) out.n("q.our", "y", ourY + 1, 1, GLIDE);

  // ---------- the sandboxes: one per render, drawn, sealed, used once ----------
  let pen = -1, penAt = 0, penOn = 0, penOurs = false;
  for (let k = 0; k < SLOTS; k++) {
    const B = BOX[k], G = L.boxes[k];
    const j = slotJob(k, tau), t = tau - jobS(j), N = jobFrames(j), r1 = PROV + N / FPS, ours = j === 0;
    // Other people's packets and pings blur away when the scroll runs the clock; ours are always drawn.
    const seen = ours ? 1 : calm;
    if (out.fresh(B.o, j)) {
      out.t(B.id, jobId(j));
      out.c(B.g, "our", ours);
    }

    // The worker hands the job over.
    const du = phase(t, -LEAD, 0), handing = du > 0 && du < 1;
    out.o(B.pk, handing ? Math.min(1, du * 8, (1 - du) * 8) * seen : 0);
    out.c(B.pk, "our", ours);
    if (handing) {
      along(L.route.disp[k], swap(du));
      out.n(B.pk, "cx", PT[0], 1);
      out.n(B.pk, "cy", PT[1], 1);
    }

    // Its outline is drawn on from the first corner, with a bright point at the
    // pen. When its render is over it goes the same way: it is not used again.
    const pu = phase(t, 0, PROV), down = phase(t, r1 + PACK, r1 + PACK + DOWN);
    const here = t >= 0 && down < 1, line = phase(pu, 0, DRAWN);
    out.o(B.o, here ? 1 : 0, 0);
    out.n(B.o, "stroke-dashoffset", here ? (down > 0 ? -down : 1 - line) * DASH : DASH, 3);
    if (here && pu > 0 && line < 1) {
      pen = k;
      penAt = line;
      penOn = Math.min(1, pu * 12, (1 - line) * 8);
      penOurs = ours;
    }
    out.o(B.c, here ? Math.min(phase(pu, 0.1, 0.4), 1 - phase(down, 0, 0.6)) : 0, down > 0 ? LEAVE : SOFT);
    // Between jobs the slot is empty, and says why, if it stays empty for long
    // enough to be read. The note is gone before the next job sets off. Run
    // fast by the scroll, a gap is over before it could be read: only the one
    // that is there as the story begins is drawn then.
    if (k === 0) {
      const gone = jobGone(j), next = jobS(nextIn(j)) - LEAD;
      const note = t < 0 || next - gone < IDLE ? 0 : Math.min(phase(tau, gone + PAUSE, gone + PAUSE + 0.3), 1 - phase(tau, next - 0.3, next));
      out.o("b0e", note * (j < 0 ? 1 : calm), FAST);
    }
    const shut = arrive(phase(pu, SEAL - 0.16, SEAL + 0.06));
    out.m(B.l, G.lx + 2.8, G.ly - 1.5 - 1.6 * (1 - shut), 24 * (1 - shut));
    ping(out, B.pg, phase(t, PROV * SEAL, PROV + 0.5), seen);
    // Once every frame is drawn they are wound into one file, toward the rail.
    const spool = swap(phase(t, r1, r1 + PACK));
    const fr = clamp((t - PROV) * FPS, 0, N), fi = Math.floor(fr);

    if (k > 0) {
      // A small sandbox shows only its progress, a cell at a time.
      const done = Math.floor((fr / N) * L.fs.n + 1e-6), end = G.sx0 + done * G.sp - 2;
      out.o(B.p, done > 0 && spool < 1 ? 1 : 0);
      out.n(B.p, "x1", lerp(G.sx0, end, spool), 1);
      out.n(B.p, "x2", end, 1, SEEN);
      if (out.fresh(B.n, fi * 1000 + N)) out.t(B.n, `${fi} / ${N}`);
      continue;
    }

    // The large one shows the render itself. Its parts come up one after the
    // next as it is drawn: the picture, the timeline, the strip of frames.
    const seal = pu < SEAL ? 0 : 1;
    if (out.fresh(B.st, seal)) out.dip(B.st, () => out.t(B.st, SEALS[seal]), pu <= 0 || !here);
    const v0 = arrive(phase(pu, 0.18, 0.5)), v1 = arrive(phase(pu, 0.3, 0.62)), v2 = arrive(phase(pu, 0.42, 0.74));
    out.o("pv", v0, 0);
    out.m("pv", 0, (1 - v0) * 4);
    out.o("tl", v1, 0);
    out.m("tl", 0, (1 - v1) * 4);
    out.o("fs", v2, 0);
    out.m("fs", 0, (1 - v2) * 4);
    out.n("pv.curve", "stroke-dashoffset", (1 - phase(pu, 0.22, 0.74)) * DASH, 3);

    const l = LESSONS[lessonOf(j)], P = L.pv, T = L.tl, F = L.fs;
    if (out.fresh("pv.curve", j)) {
      const art = lessonArt(L, lessonOf(j), j);
      out.s("pv.axes", "d", art.axes);
      out.s("pv.curve", "d", art.curve);
      out.s("fs.th", "d", art.th);
      out.s("fs.tg", "d", art.tg);
      out.s("tl.sc", "d", art.sc);
      out.s("tl.scp", "d", art.sc);
      out.s("tl.na", "d", art.na);
      out.s("tl.nap", "d", art.na);
      out.n("pv.lab", "x", P.x + l.at[0] * P.w, 1);
      out.n("pv.lab", "y", P.y + l.at[1] * P.h, 1);
      out.t("pv.l0", l.lab[0]);
      out.t("pv.l1", l.lab[1]);
      out.t("pv.l2", l.lab[2]);
      out.t("pv.l3", l.lab[3]);
      out.t("tl.N", L.wide ? ` / ${N}` : `of ${N} frames`);
      out.t("tl.end", String(N));
    }
    // The frame in the picture: the tangent at that frame's point, and its
    // slope. It is the frame being drawn, unless the reader is pointing back
    // along the strip at one already drawn.
    const u = fr / N;
    const us = f.mix > 0 && f.peek >= 0 ? lerp(u, Math.min(f.peek, u), f.mix) : u;
    const x0 = lerp(l.dom[0], l.dom[1], us), m = l.d(x0);
    const kx = P.w / (l.v[1] - l.v[0]), ky = P.h / (l.v[3] - l.v[2]);
    const px = P.x + (x0 - l.v[0]) * kx, pyy = P.y + (l.v[3] - l.f(x0)) * ky;
    const tdx = kx, tdy = -ky * m, h = P.tan / Math.hypot(tdx, tdy);
    out.n("pv.tan", "x1", px - tdx * h, 1);
    out.n("pv.tan", "y1", pyy - tdy * h, 1);
    out.n("pv.tan", "x2", px + tdx * h, 1);
    out.n("pv.tan", "y2", pyy + tdy * h, 1);
    out.n("pv.pt", "cx", px, 1);
    out.n("pv.pt", "cy", pyy, 1);
    // Rise over run, half a unit across.
    const runX = px + 0.5 * kx;
    out.n("pv.run", "x1", px, 1);
    out.n("pv.run", "y1", pyy, 1);
    out.n("pv.run", "x2", runX, 1);
    out.n("pv.run", "y2", pyy, 1);
    out.n("pv.rise", "x1", runX, 1);
    out.n("pv.rise", "y1", pyy, 1);
    out.n("pv.rise", "x2", runX, 1);
    out.n("pv.rise", "y2", pyy - 0.5 * m * ky, 1);
    const sl = Math.round(m * 100);
    if (out.fresh("pv.m", sl)) out.t("pv.m", slopeText(sl));
    SHOWN.n = here && t >= PROV && spool < 1 ? N : 0;
    SHOWN.frame = Math.min(N, Math.floor(us * N + 1e-6));
    SHOWN.slope = sl;
    // A needle on the strip marks the frame pointed at.
    out.o("peek", SHOWN.n ? f.mix : 0);
    out.m("peek", F.x + us * F.w, 0);

    const hx = lerp(T.x0, T.x1, u);
    out.m("tl.ph", hx, 0);
    out.n("tl.clip", "width", hx - T.x0, 1);
    if (out.fresh("tl.f", fi)) out.t("tl.f", String(fi));
    // The strip: each cell is wiped on from its left edge as its frames are drawn.
    const cells = Math.min(F.n, u * F.n), done = Math.min(F.n, Math.floor(cells + 1e-6)), part = cells - done;
    out.n("fs.clip", "x", F.x + F.w * spool, 1);
    out.n("fs.clip", "width", (done * F.pitch + (done < F.n && part > 0 ? F.pad + part * F.cw : 0)) * (1 - spool), 1);
    const drawing = fr > 0 && fr < N;
    out.o("fs.cur", drawing ? 1 : 0);
    // (At a reading scroll a cell lasts a frame or two: the line that sweeps it would only flicker.)
    out.o("fs.scan", drawing ? calm : 0);
    if (drawing) {
      const cx = F.x + done * F.pitch + F.pad;
      out.n("fs.cur", "x", cx, 1, SEEN);
      out.m("fs.scan", cx + part * F.cw, 0);
    }
  }
  out.o("pen", pen >= 0 ? penOn : 0, 0);
  if (pen >= 0) {
    out.s("pen", "d", L.d.box[pen]);
    out.c("pen", "our", penOurs);
    out.n("pen", "stroke-dashoffset", NIB - penAt, 4);
  }

  // ---------- files: down the rail, into the store, three deep ----------
  const jm = Math.floor((tau - S0) / GAP);
  for (let j = jm - TILES + 1; j <= jm; j++) {
    const K = TILE[mod(j, TILES)];
    const r1 = jobS(j) + PROV + jobFrames(j) / FPS, T = r1 + PACK + TRAVEL;
    if (j === NONE || tau < r1 + PACK * 0.4) { out.o(K, 0); continue; }
    // How many files have landed on top of this one.
    let rank = 0;
    for (let i = jm - TILES + 1; i <= jm; i++) {
      if (i === j || i === NONE) continue;
      const Ti = jobT(i);
      if (Ti > T || (Ti === T && i > j)) rank += swap(phase(tau, Ti - DROP, Ti));
    }
    if (rank >= 3) { out.o(K, 0); continue; }
    out.c(K, "our", j === 0);
    // On the rail a file of someone else's is a blur at the speed the scroll runs things; falling in, and on the stack, it is there.
    const seen = j === 0 ? 1 : calm;
    if (tau < T - DROP) {
      const rt = L.route.out[mod(j, SLOTS)];
      const u = swap(phase(tau, r1 + PACK, T - DROP));
      along(rt, u);
      const grow = arrive(phase(tau, r1 + PACK * 0.4, r1 + PACK));
      // On end in the chute, level on the run to the store.
      out.m(K, PT[0], PT[1], 90 * (1 - swap(phase(u * rt.total, rt.at[1] - 16, rt.at[1] + 16))), 0.6 + 0.4 * grow);
      out.o(K, grow * seen);
    } else if (tau < T) {
      const v = phase(tau, T - DROP, T);
      out.m(K, L.store.cx, lerp(L.turnY, L.store.s0, v * v));
      out.o(K, 1);
    } else {
      out.m(K, L.store.cx, L.store.s0 + rank * L.store.sp, 0, 1, SEEN);
      out.o(K, 1 - phase(rank, 2.3, 3));
    }
  }
  const o1 = phase(tau, R1, R1 + PACK), o2 = swap(phase(tau, R1 + PACK, STORED - DROP)), o3 = phase(tau, STORED - DROP, STORED);
  out.n("tr.out", "stroke-dashoffset", (1 - (L.trOut.a * o1 + (L.trOut.b - L.trOut.a) * o2 + (1 - L.trOut.b) * o3)) * DASH, 3);
  out.n("tr.disp", "stroke-dashoffset", (1 - swap(phase(tau, S0 - LEAD, S0))) * DASH, 3);

  // ---------- back to the chat ----------
  const rs = swap(phase(tau, BACK0, BACK));
  out.o("res", Math.min(phase(tau, BACK0, BACK0 + 0.15), 1 - phase(tau, BACK - 0.1, BACK + 0.1)));
  along(L.route.res, rs);
  out.m("res", PT[0], PT[1]);
  out.n("tr.res", "stroke-dashoffset", (1 - rs) * DASH, 3);
  const got = arrive(phase(tau, BACK - 0.1, BACK + 0.4));
  out.o("rep.ava", phase(tau, BACK - 0.3, BACK));
  out.o("att", got);
  out.m("att", L.wide ? 8 * (1 - got) : 0, L.wide ? 0 : -8 * (1 - got));
  const said = phase(tau, BACK + 0.3, DONE);
  out.o("rep.sk", said > 0 ? 1 : 0);
  out.n("rep.sk", "x2", lerp(L.rep.x0, L.rep.x1, said), 1);
  out.o("rep.caret", now % 1.1 < 0.62 ? 1 : 0);

  // ---------- lifecycle email, on its own clock ----------
  // An account event reaches EventBridge, which triggers SES, which delivers.
  // None of it is tied to the export above, and it runs at the speed it
  // happens whatever the scroll is doing.
  const lap = Math.floor(f.mail / MAIL_LOOP), into = f.mail - lap * MAIL_LOOP;
  let mr = MAIL_AT.length - 1;
  while (mr > 0 && MAIL_AT[mr] > into) mr--;
  const mi = lap * MAIL_AT.length + mr, mc = into - MAIL_AT[mr];
  out.c("src", "hot", mc < 0.5);
  ring(out, "src.ring", L.src, phase(mc, 0, 0.6));
  const h1 = swap(phase(mc, 0.4, 0.9)), h2 = swap(phase(mc, 1.3, 1.8)), h3 = swap(phase(mc, 2.2, MAIL_LANDS));
  const hop = mc < 1.1 ? Math.min(phase(mc, 0.4, 0.5), 1 - phase(mc, 0.88, 0.98)) : Math.min(phase(mc, 1.3, 1.4), 1 - phase(mc, 1.78, 1.88));
  along(mc < 1.1 ? L.route.m1 : L.route.m2, mc < 1.1 ? h1 : h2);
  out.o("pk.ev", hop, 0);
  out.n("pk.ev", "cx", PT[0], 1);
  out.n("pk.ev", "cy", PT[1], 1);
  out.c("eb", "hot", mc >= 0.9 && mc < 1.5);
  ring(out, "eb.ring", L.eb, phase(mc, 0.9, 1.45));
  out.c("ses", "hot", mc >= 1.8 && mc < 2.4);
  ring(out, "ses.ring", L.ses, phase(mc, 1.8, 2.35));
  along(L.route.m3, h3);
  out.o("pk.env", mc > 2.2 && mc < MAIL_LANDS + 0.15 ? Math.min(1, h3 * 8, 1 - phase(mc, MAIL_LANDS, MAIL_LANDS + 0.15)) : 0, 0);
  out.m("pk.env", PT[0], PT[1]);
  // The inbox: the newest message on top, the one before it below, the oldest sliding out.
  const mn = mc >= MAIL_LANDS ? mi : mi - 1;
  const ms = arrive(phase(mc >= MAIL_LANDS ? mc - MAIL_LANDS : 1, 0, 0.5));
  for (let i = mn - 2; i <= mn; i++) {
    const K = MSG[mod(i, 3)], M = L.mm;
    if (out.fresh(K.g, i)) out.n(K.sk, "x2", M.x + M.len * SUBJECT[mod(i, SUBJECT.length)], 1);
    out.m(K.g, 0, M.top + (mn - i - 1 + ms) * M.pitch);
    out.o(K.g, i === mn ? ms : 1, 0);
    out.o(K.dot, i === mn ? 1 : 0);
  }
}

/** A ring that opens once around a lock as it shuts (or opens). */
function ping(out: Sink, k: string, u: number, seen: number) {
  const on = u > 0 && u < 1;
  out.o(k, on ? 0.9 * (1 - u) * seen : 0);
  if (on) out.n(k, "r", 5 + 9 * arrive(u), 1);
}

/** A pill's outline widening and fading once, as something passes through it. */
function ring(out: Sink, k: string, b: { x: number; y: number; w: number; h: number }, u: number) {
  const on = u > 0 && u < 1, g = 7 * arrive(u);
  out.o(k, on ? 0.8 * (1 - u) : 0, 0);
  if (!on) return;
  out.n(k, "x", b.x - g, 1);
  out.n(k, "y", b.y - g, 1);
  out.n(k, "width", b.w + 2 * g, 1);
  out.n(k, "height", b.h + 2 * g, 1);
  out.n(k, "rx", b.h / 2 + g, 1);
}

// =====================================================================
// What a stage says when it is pointed at
// =====================================================================

export type Stage = "chat" | "oauth" | "app" | "queue" | "box" | "store" | "mail";
/** One plain sentence each; the short form is for a readout with less room. */
export const SAY: Record<Stage, { full: string; short: string }> = {
  chat: { full: "chat: the assistant calls a tool, the video comes back", short: "chat: tool call out, video back" },
  oauth: { full: "OAuth and MCP: the user authorises, calls carry a token", short: "OAuth: authorise, then a token" },
  app: { full: "app: Export MP4 queues the same kind of job", short: "app: Export MP4 queues a job" },
  queue: { full: "queue: one Celery job per export, waiting for a worker", short: "queue: one Celery job per export" },
  box: { full: "sandbox: one render each, on Fargate, locked down", short: "sandbox: one render each, locked down" },
  store: { full: "file store: the finished MP4 is kept here", short: "file store: the finished MP4" },
  mail: { full: "lifecycle email: its own pipeline, EventBridge to SES", short: "email: EventBridge to SES" },
};

// =====================================================================
// In the browser
// =====================================================================

const qa = <T extends Element>(root: ParentNode, sel: string) => Array.from(root.querySelectorAll<T>(sel));

/** A dip in hand: the element is going down (`set` not yet called) or coming back. */
interface Dip { k: string; el: SVGElement; set: () => void; t: number; done: boolean }
/** Seconds down, seconds back, and how far down, for one mark taking another's place. */
const DIP = 0.05, RISE = 0.17, LOW = 0.15;
/** A label rolling over: the old text carried out upward, then the new one coming up into its place. `next` is what it should say after that. */
interface Roll { k: string; el: SVGElement; twin: SVGElement; t: number; next: string | null }
/** Seconds it takes, how far each travels in the drawing's units, and the share of the time the old word is on its way out. */
const ROLL = 0.3, RISE_BY = 4, OUT = 0.36;

/**
 * Writes to the DOM, and only what changed. It also gives everything a floor
 * in screen time: an opacity, or a position sent with a time constant, follows
 * its value over a few frames instead of taking it at once, so a clock that the
 * scroll is running many times too fast still draws a calm picture.
 */
class Dom implements Sink {
  private el: Record<string, SVGElement> = Object.create(null);
  private num: Record<string, Record<string, number>> = Object.create(null);
  private str: Record<string, Record<string, string>> = Object.create(null);
  private cls: Record<string, Record<string, boolean>> = Object.create(null);
  private ver: Record<string, number> = Object.create(null);
  private txt: Record<string, string> = Object.create(null);
  /** Where each follower stands: the value last shown, before rounding. */
  private at: Record<string, Record<string, number>> = Object.create(null);
  private dips: Dip[] = [];
  private rolls: Roll[] = [];
  /** Seconds since the frame before. */
  private dt = 0;
  /** Nothing is followed or dipped until the drawing has been made once. */
  private begun = false;

  constructor(svg: SVGSVGElement) {
    for (const el of qa<SVGElement>(svg, "[data-k]")) {
      const k = el.dataset.k!;
      this.el[k] = el;
      this.num[k] = Object.create(null);
      this.str[k] = Object.create(null);
      this.cls[k] = Object.create(null);
      this.at[k] = Object.create(null);
    }
  }

  /** Before a frame is drawn: dips and rolls move on by `dt` seconds. */
  step(dt: number) {
    this.dt = dt;
    for (let i = this.dips.length - 1; i >= 0; i--) {
      const s = this.dips[i];
      s.t += dt;
      if (!s.done && s.t >= DIP) {
        s.done = true;
        s.set();
      }
      if (s.t >= DIP + RISE) {
        s.el.style.opacity = "";
        this.dips.splice(i, 1);
      } else {
        const o = s.t < DIP ? 1 - (1 - LOW) * (s.t / DIP) : LOW + (1 - LOW) * arrive((s.t - DIP) / RISE);
        s.el.style.opacity = o.toFixed(2);
      }
    }
    for (let i = this.rolls.length - 1; i >= 0; i--) {
      const r = this.rolls[i];
      r.t += dt;
      if (r.t < ROLL) {
        this.pose(r, r.t / ROLL);
        continue;
      }
      this.rest(r);
      // If the label has been told to change again in the meantime, it rolls on to that.
      if (r.next !== null && r.next !== this.txt[r.k]) {
        r.twin.textContent = this.txt[r.k];
        this.t(r.k, r.next);
        r.t = 0;
        r.next = null;
        this.pose(r, 0);
      } else this.rolls.splice(i, 1);
    }
  }
  /** After it. */
  end() {
    this.begun = true;
  }
  /** The next frame is a different moment altogether: nothing is followed into it, it is simply drawn. */
  snap() {
    this.begun = false;
  }
  /**
   * A roll part-way: `u` from 0 (the old label in place) to 1 (the new one).
   * The old word has all but gone before the new one shows, so the two are
   * never read through each other.
   */
  private pose(r: Roll, u: number) {
    const out = swap(phase(u, 0, OUT)), into = arrive(phase(u, OUT - 0.08, 1));
    r.el.style.opacity = into.toFixed(2);
    r.el.style.transform = `translateY(${((1 - into) * RISE_BY).toFixed(2)}px)`;
    r.twin.style.opacity = (1 - out).toFixed(2);
    r.twin.style.transform = `translateY(${(-out * RISE_BY).toFixed(2)}px)`;
  }
  private rest(r: Roll) {
    r.el.style.opacity = r.el.style.transform = "";
    r.twin.style.opacity = "0";
    r.twin.style.transform = "";
  }

  /** One step of `a` on its way to `v`; with no time constant it is simply there, and is followed from there. */
  private follow(k: string, a: string, v: number, tc: number, near: number) {
    const s = this.at[k], cur = s[a];
    if (tc === 0 || cur === undefined || !this.begun || (tc < 0 && s.opacity !== undefined && s.opacity <= 0.02)) return (s[a] = v);
    const next = cur + (v - cur) * (1 - Math.exp(-this.dt / Math.abs(tc)));
    return (s[a] = Math.abs(v - next) < near ? v : next);
  }

  n(k: string, a: string, v: number, d = 2, tc = 0) {
    const el = this.el[k];
    if (!el) return;
    v = this.follow(k, a, v, tc, a === "opacity" ? 0.012 : 0.05);
    const m = d === 1 ? 10 : d === 3 ? 1000 : d === 4 ? 10000 : 100, r = Math.round(v * m) / m, c = this.num[k];
    if (c[a] === r) return;
    c[a] = r;
    el.setAttribute(a, String(r));
  }
  s(k: string, a: string, v: string) {
    const el = this.el[k];
    if (!el || this.str[k][a] === v) return;
    this.str[k][a] = v;
    el.setAttribute(a, v);
  }
  t(k: string, v: string) {
    const el = this.el[k];
    if (!el || this.txt[k] === v) return;
    this.txt[k] = v;
    el.textContent = v;
  }
  c(k: string, name: string, on: boolean) {
    const el = this.el[k];
    if (!el || this.cls[k][name] === on) return;
    this.cls[k][name] = on;
    el.classList.toggle(name, on);
  }
  m(k: string, x: number, y: number, rot = 0, sc = 1, tc = 0) {
    const el = this.el[k];
    if (!el) return;
    const c = this.num[k];
    x = this.follow(k, "x", x, tc, 0.05);
    y = this.follow(k, "y", y, tc, 0.05);
    x = Math.round(x * 10) / 10;
    y = Math.round(y * 10) / 10;
    rot = Math.round(rot * 10) / 10;
    sc = Math.round(sc * 100) / 100;
    if (c.tx === x && c.ty === y && c.tr === rot && c.ts === sc) return;
    c.tx = x;
    c.ty = y;
    c.tr = rot;
    c.ts = sc;
    el.setAttribute("transform", transform(x, y, rot, sc));
  }
  o(k: string, v: number, tc = SOFT) {
    this.n(k, "opacity", v <= 0.004 ? 0 : v >= 0.996 ? 1 : v, 2, tc);
  }
  fresh(k: string, v: number) {
    if (this.ver[k] === v) return false;
    this.ver[k] = v;
    return true;
  }
  dip(k: string, set: () => void, now = false) {
    const el = this.el[k];
    const i = this.dips.findIndex((s) => s.k === k);
    if (!el || now || !this.begun) {
      // Whatever was on its way for this element is overtaken.
      if (i >= 0) {
        this.dips[i].el.style.opacity = "";
        this.dips.splice(i, 1);
      }
      return set();
    }
    if (i < 0) {
      this.dips.push({ k, el, set, t: 0, done: false });
      return;
    }
    // Already dipping or coming back: change again from wherever it has got to.
    const s = this.dips[i];
    if (s.done) {
      const o = LOW + (1 - LOW) * arrive((s.t - DIP) / RISE);
      s.t = DIP * ((1 - o) / (1 - LOW));
      s.done = false;
    }
    s.set = set;
  }
  roll(k: string, k2: string, v: string, now = false) {
    const el = this.el[k], twin = this.el[k2];
    const i = this.rolls.findIndex((r) => r.k === k);
    if (!el || !twin || now || !this.begun) {
      if (i >= 0) {
        this.rest(this.rolls[i]);
        this.rolls.splice(i, 1);
      }
      return this.t(k, v);
    }
    // Mid-roll: let this one land, then roll on.
    if (i >= 0) {
      this.rolls[i].next = v;
      return;
    }
    if (this.txt[k] === v) return;
    twin.textContent = this.txt[k] ?? "";
    this.t(k, v);
    const r: Roll = { k, el, twin, t: 0, next: null };
    this.rolls.push(r);
    this.pose(r, 0);
  }
}

/** The line the plate readout shows for a moment of the story. */
function storyLine(tau: number, frame: number) {
  if (tau < CHIP + 0.3) return "asked in chat";
  if (tau < PRESS) return "tool call, waiting for consent";
  if (tau < 0) return "authorised";
  if (tau < S0) return "queued";
  if (tau < S0 + PROV * SEAL) return "sandbox starting";
  if (tau < R0) return "sandbox sealed";
  if (tau < R1) return `rendering ${frame} / ${OURS.frames} frames`;
  if (tau < STORED) return `${OURS.frames} frames rendered`;
  if (tau < BACK) return "stored";
  return "delivered";
}
/** A number that changes exactly when storyLine's answer does. */
const storyKey = (tau: number) =>
  tau < CHIP + 0.3 ? -1 : tau < PRESS ? -2 : tau < 0 ? -3 : tau < S0 ? -4 : tau < S0 + PROV * SEAL ? -5 : tau < R0 ? -6
  : tau < R1 ? Math.floor((tau - R0) * FPS) : tau < STORED ? -7 : tau < BACK ? -8 : -9;

/** Each drawing as it stands in a window before the page has been measured: enough to draw a first frame from. */
const NOMINAL: Geo[] = [{ vh: 900, t0: 765, t1: 24, y0: 52, s: 0.925 }, { vh: 844, t0: 692, t1: -637, y0: 69, s: 0.8 }];

function bind(svg: SVGSVGElement, L: Layout, i: number) {
  const sink = new Dom(svg);
  const l1 = svg.querySelector<SVGTextElement>('[data-m="l1"]'), l2 = svg.querySelector<SVGTextElement>('[data-m="l2"]');
  const frame: Frame = { ...still(), tau: T_START };
  return {
    svg, L, frame,
    S: schedule(L, NOMINAL[i]),
    live: false,
    hits: qa<SVGRectElement>(svg, ".hit"),
    /** The stages a keyboard can reach, in reading order. */
    keys: qa<SVGRectElement>(svg, ".hit[tabindex]"),
    stages: qa<SVGElement>(svg, ".st"),
    /** The typed question is revealed up to its real width, once the font is in. */
    measure() {
      if (!this.live || !l1 || !l2) return;
      frame.w1 = l1.getComputedTextLength();
      frame.w2 = l2.getComputedTextLength();
    },
    render(dt: number) {
      sink.step(dt);
      draw(L, frame, sink);
      sink.end();
    },
    /** The next frame drawn is not a continuation of the last. */
    snap() {
      sink.snap();
    },
  };
}

export default async function (root: HTMLElement) {
  const { gsap, scrubbed, whileVisible } = await import("../motion");
  const box = root.querySelector<HTMLElement>(".ex-box");
  if (!box) throw new Error("figure element missing: .ex-box");
  const views = qa<SVGSVGElement>(root, "svg.ex").map((svg, i) => bind(svg, LAYOUTS[i], i));
  const readout = root.querySelector<HTMLElement>("[data-readout]");
  let view = views[0];
  let p = 0, now = 0;
  let line = "", lineKey = NaN;

  // What is being read out, and why. A stage under the mouse comes first, then
  // one a finger tapped, then one held with Enter or Space, then the one that
  // has keyboard focus. With none of those the readout follows the job.
  let hover: Stage | null = null, tap: Stage | null = null, held: Stage | null = null, kb: Stage | null = null;
  let pick: Stage | null = null;
  /** The reader who arrives by keyboard may be anywhere in the scroll: focus runs the story on to its end. */
  const force = { v: 0 };
  /** Progress as drawn. */
  const pe = () => p + (1 - p) * force.v;

  // ---- the clock ----
  // Up to the delivery it is the scroll's: where the page is, is when the
  // story is. Past it the clock runs by itself, at the speed things happen,
  // and a few seconds on it passes the moment the page was served at. It is
  // also let go early if the reader stops once our last frame is rendered:
  // the delivery is then made at the speed it happens, instead of standing
  // half done until the page moves again. Going back up the page far enough
  // to want the story again takes the drawing back into it; what had been
  // running by itself is cut away, not wound back.
  let tau = T_START, live = false, clock = T_START, cut = 0;
  /** Where the scroll stood when the clock was let go, and how long it has now stood where it is, seconds. */
  let from = 1, stood = -1, rested = 0;
  /** Story seconds per second of screen time, eased: 1 when things happen at their own speed. */
  let pace = 0, before = T_START;
  /** The same, for the clock once it runs by itself: it takes over at the speed the scroll had it going, and settles to 1. */
  let speed = 1;
  /** The email lane's clock. It starts when the lane has come into view. */
  let mail = MAIL0;
  /** The frame pointed at in the big sandbox, and how far its picture has gone over to it. */
  let aim = -1, peek = -1, mix = 0, touchEnd = 0;
  /** The frame under a mouse, and since when it has been on the sandbox: one that is only crossing it shows nothing. */
  let under = -1, since = 0;
  const DWELL = 0.12;
  /** When the loop last ran: after a gap (the plate was off screen, or the tab was) nothing is followed across it. */
  let seen = 0;
  const CUT = 0.1;
  const cutting = (on: boolean) => {
    for (const v of views) v.svg.classList.toggle("cut", on);
  };

  // ---- the readout: the job's state, the stage being read, or the frame pointed at ----
  // A stage's sentence is tried in full; if the plate is too narrow for it,
  // the short form goes in instead. Asked once per stage per width.
  const fits: Partial<Record<Stage, string>> = {};
  function sentence(st: Stage) {
    if (!readout) return SAY[st].full;
    if (!fits[st]) {
      readout.textContent = SAY[st].full;
      fits[st] = readout.scrollWidth > readout.clientWidth + 0.5 ? SAY[st].short : SAY[st].full;
    }
    return fits[st]!;
  }
  let frameKey = -1, frameLine = "";
  function say() {
    if (!readout) return;
    let text = pick ? sentence(pick) : line;
    // Pointing along the big sandbox reads out the frame under the pointer, from the same numbers the picture is drawn with.
    if (mix > 0.5 && SHOWN.n) {
      const key = SHOWN.frame * 100000 + SHOWN.slope + 5000;
      if (key !== frameKey) {
        frameKey = key;
        frameLine = `frame ${SHOWN.frame} / ${SHOWN.n} · slope ${slopeText(SHOWN.slope)}`;
      }
      text = frameLine;
    }
    if (readout.textContent !== text) readout.textContent = text;
  }

  function render(dt = 0) {
    const f = view.frame;
    f.tau = tau;
    f.now = now;
    f.mail = mail;
    f.calm = clamp(1.35 - pace / 4, 0, 1);
    f.peek = peek;
    f.mix = mix;
    view.render(dt);
    const key = storyKey(tau);
    if (key !== lineKey) {
      lineKey = key;
      line = storyLine(tau, Math.max(0, key));
    }
    say();
  }

  // ---- the keyboard's one stop ----
  // A roving tabindex: the stage last focused (the first, to begin with) is the
  // figure's Tab stop; arrow keys, Home and End move between stages, and Tab or
  // Shift+Tab leaves the figure.
  let cur = 0;
  const rove = () => {
    for (const v of views) v.keys.forEach((hit, i) => hit.setAttribute("tabindex", v.live && i === cur ? "0" : "-1"));
  };

  // ---- the scroll story, bound to whichever drawing is showing ----
  // It begins as the plate comes into the window. Side by side it is let go
  // as the plate's middle passes 45% of the window; stacked, the plate is
  // taller than the window, so it runs for as long as the plate takes to pass.
  let tl: ReturnType<typeof scrubbed> | null = null;
  let bound = "";
  /**
   * Work out when each part of the story plays, from where the drawing stands
   * in the window. Only read here, when the page is measured.
   */
  function plan() {
    const trig = tl?.scrollTrigger;
    // (A trigger has no positions until its first refresh, which calls back here.)
    if (!trig || !(trig.end > trig.start)) return;
    const plate = root.getBoundingClientRect(), art = view.svg.getBoundingClientRect();
    if (!art.width) return;
    const top = plate.top + window.scrollY;
    view.S = schedule(view.L, { vh: window.innerHeight, t0: top - trig.start, t1: top - trig.end, y0: art.top - plate.top, s: art.width / view.L.W });
  }
  function drive() {
    for (const v of views) v.live = v.svg.getBoundingClientRect().width > 0;
    view = views.find((v) => v.live) ?? views[0];
    view.measure();
    rove();
    for (const k in fits) delete fits[k as Stage];
    const mode = view.L.wide ? "wide" : "stacked";
    if (mode === bound) return plan();
    bound = mode;
    tl?.scrollTrigger?.kill();
    tl?.kill();
    const scroll = { p: 0 };
    tl = scrubbed(root, { start: view.L.wide ? "top 85%" : "top 82%", end: view.L.wide ? "center 45%" : "bottom 64%", onRefresh: plan });
    tl.to(scroll, { p: 1, duration: 1, ease: "none" });
    tl.eventCallback("onUpdate", () => (p = scroll.p));
    p = 0;
    live = false;
    cut = 0;
    cutting(false);
    view.snap();
    plan();
  }
  drive();
  render();
  new ResizeObserver(() => {
    drive();
    render();
  }).observe(box);
  // What is above the plate can change height after the story has been planned
  // (type is split into lines to rise, then put back; another figure comes to
  // life); it is measured again then.
  {
    let queued = false;
    const again = () => {
      queued = false;
      const trig = tl?.scrollTrigger;
      if (!trig) return;
      trig.refresh();
      trig.update();
    };
    const page = new ResizeObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(again);
    });
    page.observe(document.body);
    page.observe(root);
  }
  document.fonts?.ready.then(() => {
    view.measure();
    for (const k in fits) delete fits[k as Stage];
  });

  // ---- one loop: the story where the scroll has put it, then the same clock left running ----
  whileVisible(root, (dt, t) => {
    now = t;
    const S = view.S, e = pe(), base = tauOf(S, e);
    const away = t - seen > 0.3;
    seen = t;
    if (away) {
      // Back in view, perhaps somewhere else in the scroll: the drawing is simply made as it should now stand.
      if (live && e < from - S.back) live = false;
      cut = 0;
      cutting(false);
      view.snap();
    }
    rested = Math.abs(e - stood) < 2e-5 ? rested + dt : 0;
    stood = e;
    if (live) {
      // (Let go from rest it gathers speed gently; let go by the scroll it only has to settle.)
      speed += (1 - speed) * (1 - Math.exp(-dt / (speed < 1 ? 0.12 : 0.04)));
      clock += dt * speed;
      // Let go early, the scroll can still carry the story on as far as the delivery.
      if (e < S.hand && base > clock) clock = base;
      if (cut) {
        if (e >= from - S.back) {
          cut = 0;
          cutting(false);
        } else if (t - cut > CUT) {
          live = false;
          cut = 0;
          cutting(false);
          view.snap();
        }
      } else if (e < from - S.back) {
        cut = t;
        cutting(true);
      }
    } else if (e >= S.hand) {
      live = true;
      from = S.hand;
      clock = base;
      speed = clamp(pace, 1, 14);
    } else if (base >= R1 && rested > 0.35) {
      live = true;
      from = e;
      clock = base;
      speed = 0;
    }
    tau = live ? clock : base;
    // How fast the clock is being run. (A jump is not a speed: the drawing was away, or has just been cut.)
    const moved = Math.abs(tau - before);
    before = tau;
    if (dt > 0 && moved < 1.5) pace += (moved / dt - pace) * (1 - Math.exp(-dt / 0.12));
    if (e >= S.mail) mail += dt;
    // The picture in the big sandbox goes over to the frame pointed at, and back.
    if (touchEnd && t > touchEnd) {
      touchEnd = 0;
      aim = -1;
    }
    if (under >= 0 && t - since >= DWELL) aim = under;
    const want = aim >= 0 && SHOWN.n ? 1 : 0;
    mix += (want - mix) * (1 - Math.exp(-dt / 0.09));
    if (Math.abs(want - mix) < 0.004) mix = want;
    if (aim >= 0) peek = peek < 0 || mix < 0.02 ? aim : peek + (aim - peek) * (1 - Math.exp(-dt / 0.05));
    else if (mix === 0) peek = -1;
    render(dt);
  });

  // ---- pointer, touch and keyboard: a stage says what it does ----
  const spoken = document.createElement("p");
  spoken.className = "sr-only";
  spoken.setAttribute("aria-live", "polite");
  root.append(spoken);
  let liveTimer = 0, tapTimer = 0, hoverTimer = 0;
  let lastType = "mouse";

  /** Work out what is being read, mark it, and write it. A pointer or a finger is also told through the live line. */
  function update(announce = false) {
    const next = hover ?? tap ?? held ?? kb;
    if (next !== pick) {
      pick = next;
      for (const v of views) {
        v.svg.classList.toggle("focus", !!pick);
        for (const s of v.stages) s.classList.toggle("on", s.dataset.st === pick);
      }
      say();
    }
    clearTimeout(liveTimer);
    // A keyboard reader hears the stage's own label; the live line is for a pointer or a finger.
    if (announce && pick) {
      const text = SAY[pick].full;
      liveTimer = window.setTimeout(() => (spoken.textContent = text), 250);
    }
  }
  /** A pointer has to rest on a stage for a moment to pick it, and to be off it for one to let it go: crossing a corner picks nothing. */
  function point(st: Stage | null) {
    clearTimeout(hoverTimer);
    if (st === hover) return;
    hoverTimer = window.setTimeout(() => {
      hover = st;
      update(!!st);
    }, st ? 70 : 110);
  }
  const press = () => {
    for (const v of views) for (const hit of v.keys) hit.setAttribute("aria-pressed", String(held === hit.dataset.st));
  };
  const finish = (on: boolean) => gsap.to(force, { v: on ? 1 : 0, duration: 0.8, ease: "swap", overwrite: true });
  // Leaving the figure gives the drawing back to the scroll, unless a reading is held.
  root.addEventListener("focusout", (e) => {
    if (!held && !root.contains(e.relatedTarget as Node | null)) finish(false);
  });

  for (const v of views) {
    v.svg.dataset.live = "";
    v.svg.setAttribute("aria-label", "Plot. Arrow keys move through its parts.");
    const big = v.L.boxes[0], F = v.L.fs;
    /** The frame under a pointer, if it is on the big sandbox: where it stands along the strip of frames. */
    const frameAt = (e: { clientX: number; clientY: number }) => {
      const r = v.svg.getBoundingClientRect();
      if (!r.width) return -1;
      const x = ((e.clientX - r.left) / r.width) * v.L.W, y = ((e.clientY - r.top) / r.height) * v.L.H;
      return y >= big.y && y <= big.y + big.h ? clamp((x - F.x) / F.w, 0, 1) : -1;
    };
    for (const hit of v.hits) {
      const st = hit.dataset.st as Stage;
      // The plate readout takes over from the native tooltip.
      hit.querySelector("title")?.remove();
      hit.addEventListener("pointerenter", (e) => {
        if (e.pointerType === "mouse") point(st);
      });
      hit.addEventListener("pointerleave", (e) => {
        if (e.pointerType === "mouse") point(null);
      });
      if (st === "box") {
        // Along the big sandbox a pointer also steps back through the frames it has drawn.
        // A finger does the same by dragging across it, or by a tap; a touch that
        // turns out to be the start of a scroll does nothing.
        let downX = 0, across = false;
        const over = (e: PointerEvent) => {
          if (e.pointerType === "mouse") {
            const fr = frameAt(e);
            if (fr >= 0 && under < 0) since = now;
            under = fr;
            if (fr < 0) aim = -1;
          } else if (across || Math.abs(e.clientX - downX) > 8) {
            across = true;
            touchEnd = 0;
            aim = frameAt(e);
          }
        };
        hit.addEventListener("pointerenter", over);
        hit.addEventListener("pointermove", over);
        hit.addEventListener("pointerdown", (e) => {
          downX = e.clientX;
          across = false;
        });
        hit.addEventListener("pointerleave", (e) => {
          if (e.pointerType === "mouse") under = aim = -1;
        });
        // A finger's reading stays a moment after it lifts.
        hit.addEventListener("pointerup", (e) => {
          if (e.pointerType !== "mouse" && across) touchEnd = now + 2.5;
        });
        hit.addEventListener("pointercancel", () => {
          if (across) aim = -1;
        });
        hit.addEventListener("click", (e) => {
          if (lastType === "mouse") return;
          aim = frameAt(e);
          touchEnd = now + 4;
        });
      }
      // A click or a tap should not move the keyboard's place, or leave a ring behind.
      hit.addEventListener("mousedown", (e) => e.preventDefault());
      hit.addEventListener("pointerdown", (e) => (lastType = e.pointerType));
      // A tap, not a scroll that happens to start here: click only fires for the former.
      // A second tap on the same stage lets it go; a tap on another replaces it.
      hit.addEventListener("click", () => {
        if (lastType === "mouse") return;
        clearTimeout(tapTimer);
        tap = tap === st ? null : st;
        if (tap) tapTimer = window.setTimeout(() => { tap = null; update(); }, 6000);
        // Only a tap that picks the sandbox keeps a frame of it in the picture.
        if (tap !== "box") {
          aim = -1;
          touchEnd = 0;
        }
        update(true);
      });
    }
    // The keyboard's stages: served as labelled graphics, each its own Tab stop; now buttons behind one stop.
    v.keys.forEach((hit, n) => {
      const st = hit.dataset.st as Stage;
      hit.setAttribute("role", "button");
      hit.setAttribute("aria-pressed", "false");
      const focused = () => {
        cur = n;
        rove();
        // A click can focus too; that is the pointer's business, not the keyboard's.
        if (!hit.matches(":focus-visible")) return;
        kb = st;
        finish(true);
        update();
      };
      hit.addEventListener("focus", focused);
      // A reader can Tab onto a stage before this script has loaded.
      if (document.activeElement === hit) focused();
      // Only the keyboard's own reading goes with the focus: a tap or a click
      // that moves focus has already picked something else, and keeps it.
      hit.addEventListener("blur", () => {
        if (kb !== st) return;
        kb = null;
        update();
      });
      hit.addEventListener("keydown", (e) => {
        const to = (m: number) => {
          e.preventDefault();
          cur = Math.max(0, Math.min(v.keys.length - 1, m));
          rove();
          v.keys[cur].focus();
        };
        switch (e.key) {
          case "Enter":
          case " ":
            // Hold this reading after focus moves on, or let it go.
            e.preventDefault();
            held = held === st ? null : st;
            press();
            update();
            break;
          case "Escape":
            held = null;
            press();
            update();
            break;
          case "ArrowDown":
          case "ArrowRight": to(n + 1); break;
          case "ArrowUp":
          case "ArrowLeft": to(n - 1); break;
          case "Home": to(0); break;
          case "End": to(v.keys.length - 1); break;
        }
      });
    });
  }
  rove();
}
