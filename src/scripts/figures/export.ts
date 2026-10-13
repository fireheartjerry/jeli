// Fig: one MP4 export at Mathos, start to finish.
//
// The whole figure is a pure function of one clock. `draw(layout, frame, sink)`
// decides every moving attribute for a moment of story time and hands it to a
// sink. On the server the sink collects attributes, so the page ships the
// finished state; in the browser the sink writes to the DOM and skips anything
// that has not changed. Nothing is drawn twice in two places.
//
// Story time is in seconds. Our job is queued at 0. Other jobs (all examples)
// run on a fixed schedule around it, one sandbox each, so the scroll story is
// just a window onto a system that is already working, and the ambient loop is
// the same clock left running.
//
// The page imports this module to render the finished state, so nothing here
// may need a browser to load: the motion helpers (and GSAP with them) are
// fetched inside the default export, which only ever runs in one.

// =====================================================================
// The schedule
// =====================================================================

const T_START = -6;
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

/** Our job: 240 frames, rendered from 2.2 to 10.2, stored at 12. */
export const OURS = { id: "7c2e", frames: 240, file: "derivative.mp4" };
const R0 = S0 + PROV;
const R1 = R0 + OURS.frames / FPS;
const STORED = R1 + PACK + TRAVEL;
const BACK = 12.6; // the file is in the chat
/** Lifecycle email keeps its own time. Nothing in the export feeds it. */
const MAIL_EVERY = 11.5; // seconds between one account event and the next
const MAIL_FIRST = 5.6;
const MAIL_LANDS = 2.8; // from the event to the message in the inbox

const mod = (a: number, n: number) => ((a % n) + n) % n;
/** Linear map with clamping: where p sits between a and b, from 0 to 1. */
const phase = (p: number, a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)));
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const e3 = (u: number) => 1 - (1 - u) ** 3;
const io = (u: number) => u * u * (3 - 2 * u);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r1 = (v: number) => Math.round(v * 10) / 10;

const FRAMES = [165, 180, 240, 195, 210, 150, 225];
const WAITS = [3.2, 2.0, 2.6, 1.5, 2.8];
const IDS = ["a1f4", "9b03", "c81d", "e7a2", "3d5f", "b260", "58c9", "f0a7", "2e91", "d43b", "6a0c", "91e8", "4f7d"];

/** When job j is handed to a sandbox. */
const jobS = (j: number) => S0 + j * GAP;
const jobFrames = (j: number) => (j === 0 ? OURS.frames : FRAMES[mod(j, FRAMES.length)]);
/** When job j joins the queue. */
const jobA = (j: number) => jobS(j) - (j === 0 ? S0 : WAITS[mod(j, WAITS.length)]);
const jobId = (j: number) => (j === 0 ? OURS.id : IDS[mod(j, IDS.length)]);
/** When job j's file is in the store. */
const jobT = (j: number) => jobS(j) + PROV + jobFrames(j) / FPS + PACK + TRAVEL;
/** The job a slot holds at a moment (or is about to be handed). */
const slotJob = (s: number, tau: number) => s + SLOTS * Math.floor((tau + LEAD - S0 - s * GAP) / CYCLE);
/** The newest job in the queue. */
function newest(tau: number) {
  let j = Math.floor((tau - S0 + GAP) / GAP) + 1;
  while (jobA(j) > tau) j--;
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
    // Wires in three sets, so each arrives with its own part of the plate.
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
  };

  // ---------- when the story reaches each part ----------
  /** Stacked, the plate is taller than the screen: the story follows the reader down it. */
  const at = (y: number) => clamp(0.137 + 0.729 * (y / H), 0, 1);
  const win = (y: number, row: number): [number, number] =>
    wide ? [0.012 * row, 0.07 + 0.012 * row] : [Math.max(0, at(y) - 0.15), Math.max(0.05, at(y) - 0.09)];
  const b = (f: string, c: string, y: number, row: number) => ({ f, c, a: win(y, row)[0], b: win(y, row)[1] });
  const builds = [
    b("chat.f", "chat.c", chat.y, 0), b("", "w1", chat.y, 1), b("", "w2", queue.y + queue.h, 4), b("", "w3", wide ? bk.y : hero.y + hero.h, 6),
    b("app.f", "app.c", app.y, 1), b("strip.f", "strip.c", strip.y, 2),
    b("queue.f", "queue.c", queue.y, 3), b("", "box.c", hero.y, 4),
    b("", "store.c", wide ? bk.y : hero.y + hero.h, 6), b("", "tiles", wide ? bk.y : hero.y + hero.h, 6),
    b("reply.f", "reply.c", reply.y, 6), b("", "lane.c", lane.y, 7), b("mail.f", "mail.c", wide ? mail.y : lane.y + 30, 8),
  ];
  /** Scroll progress to story time, as corner points of a broken line. */
  const beats: [number, number][] = wide
    ? [[0, T_START], [0.05, -5.7], [0.3, -0.6], [0.33, 0], [0.385, R0], [0.7, R1], [0.8, STORED], [0.9, 13.6], [1, T_END]]
    : [[0, T_START], [at(chat.y + 30), -5.6], [at(chip.y + 10), -3.9], [at(strip.y + strip.h), -1.2], [at(queue.y + 14), 0],
       [at(hero.y - 30), R0], [at(c2.y + ch), R1], [at(store.s0 + 16), STORED], [at(reply.y + 60), 13.6], [Math.min(1, at(H) + 0.05), T_END]];

  /** A stage can be pointed at once the plate has drawn it. */
  const since = (k: string) => builds.find((v) => v.c === k)!.b;
  const ready: Record<Stage, number> = {
    chat: since("chat.c"), oauth: since("strip.c"), app: since("app.c"), queue: since("queue.c"),
    box: since("box.c"), store: since("store.c"), mail: since("mail.c"),
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
    seg, route, trOut, d, builds, beats, hits, ready,
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

/** Scroll progress to story time. */
export function tauOf(L: Layout, p: number) {
  const B = L.beats;
  let i = 1;
  while (i < B.length - 1 && B[i][0] < p) i++;
  const a = B[i - 1], b = B[i];
  return b[0] > a[0] ? lerp(a[1], b[1], clamp((p - a[0]) / (b[0] - a[0]), 0, 1)) : b[1];
}

// =====================================================================
// The drawing, for any moment
// =====================================================================

/** Where draw() sends what it decides. Keys name elements (their data-k). */
export interface Sink {
  /** A numeric attribute, rounded to d places. */
  n(k: string, a: string, v: number, d?: number): void;
  /** Any other attribute. */
  s(k: string, a: string, v: string): void;
  /** Text content. */
  t(k: string, v: string): void;
  /** A class, on or off. */
  c(k: string, name: string, on: boolean): void;
  /** Position, and optionally turn and scale. */
  m(k: string, x: number, y: number, rot?: number, sc?: number): void;
  /** Opacity. */
  o(k: string, v: number): void;
  /** Whether a key has moved on to a new version since it was last asked. Always true on the server. */
  fresh(k: string, v: number): boolean;
}

export interface Frame {
  /** Story time, seconds. */
  tau: number;
  /** Scroll progress, 0 to 1: only the plate assembling itself reads this. */
  p: number;
  /** Seconds since the story ended, for what arrives late. */
  late: number;
  /** Wall clock, for things that turn or blink. */
  now: number;
  /** Measured widths of the two lines of the question, when known. */
  w1: number;
  w2: number;
}

export const transform = (x: number, y: number, rot = 0, sc = 1) =>
  `translate(${r2(x)} ${r2(y)})` + (rot ? ` rotate(${r2(rot)})` : "") + (sc !== 1 ? ` scale(${r2(sc)})` : "");

/** Dash length of anything drawn on with pathLength="1"; a hair over, so a finished stroke has no gap. */
const DASH = 1.002;
const STATE = ["queued", "rendering", "done"];
const SEAL = ["1 render · starting", "1 render · sealed"];
/** Queue glyphs, drawn about their own centre: a ring, three quarters of one (it turns), a tick. */
const GLYPH = ["M3.4 0A3.4 3.4 0 1 1-3.4 0A3.4 3.4 0 1 1 3.4 0", "M0-3.6A3.6 3.6 0 1 1-3.6 0", "M-3.4 .2l2.3 2.4 4.4-4.9"];
const MINUS = "−";

// Keys are built once; nothing is concatenated per frame.
const ROW = Array.from({ length: 12 }, (_, i) => ({ g: `q${i}`, gl: `q${i}g`, id: `q${i}i`, src: `q${i}f`, s: `q${i}s` }));
const BOX = Array.from({ length: SLOTS }, (_, i) => ({ g: `b${i}`, o: `b${i}o`, c: `b${i}c`, l: `b${i}l`, id: `b${i}i`, st: `b${i}s`, p: `b${i}p`, n: `b${i}n`, pk: `d${i}`, pg: `b${i}g` }));
const TILES = 8;
const TILE = Array.from({ length: TILES }, (_, i) => `t${i}`);
const MSG = Array.from({ length: 3 }, (_, i) => ({ g: `mr${i}`, dot: `mr${i}d`, sk: `mr${i}s` }));
/** How much of its line each message's subject takes: they are not all alike. */
const SUBJECT = [0.62, 0.86, 0.5, 0.74, 0.94];

export function draw(L: Layout, f: Frame, out: Sink) {
  const tau = f.tau, p = f.p, now = f.now;

  // ---------- the plate assembles as it arrives ----------
  for (let i = 0; i < L.builds.length; i++) {
    const b = L.builds[i], e = e3(phase(p, b.a, b.b));
    if (b.f) {
      out.n(b.f, "stroke-dashoffset", (1 - e) * DASH, 3);
      out.n(b.f, "fill-opacity", e, 2);
    }
    out.o(b.c, phase(e, 0.3, 1));
  }

  // ---------- the question types itself into the chat ----------
  const ty = phase(tau, -5.6, -4.3);
  const w1 = f.w1 || L.bub.w1, w2 = f.w2 || L.bub.w2, k1 = w1 / (w1 + w2);
  const u1 = phase(ty, 0, k1), u2 = phase(ty, k1, 1);
  out.o("bub", phase(tau, -5.85, -5.6));
  out.n("bub.l1", "width", ty >= 1 ? L.bub.w : 3 + w1 * u1, 1);
  out.n("bub.l2", "width", ty >= 1 ? L.bub.w : u2 > 0 ? 3 + w2 * u2 : 0, 1);
  const typing = ty > 0 && ty < 1;
  out.o("bub.caret", typing ? 1 : 0);
  if (typing) out.m("bub.caret", L.bub.tx + (u2 > 0 ? w2 * u2 : w1 * u1) + 2, u2 > 0 ? L.bub.y2 : L.bub.y1);

  // ---------- the assistant answers with a tool call ----------
  out.o("ask", phase(tau, -4.25, -4.1));
  out.n("ask.sk", "x2", lerp(L.ask.x0, L.ask.x1, e3(phase(tau, -4.2, -3.85))), 1);
  const chp = e3(phase(tau, -4.0, -3.7));
  out.o("chip", chp);
  out.m("chip", 0, (1 - chp) * 4);
  const back = tau >= BACK;
  out.o("chip.spin", back ? 0 : 1);
  if (!back) out.m("chip.spin", L.chip.gx, L.chip.gy, (now * 300) % 360);
  out.o("chip.tick", back ? 1 : 0);
  out.o("chip.key", phase(tau, -1.8, -1.65));

  // The call stops at the gate until the user has authorised, then goes through.
  const g1 = io(phase(tau, -3.6, -3.1)), g2 = io(phase(tau, -1.25, -0.05));
  const cy = lerp(lerp(L.call.y0, L.call.stop, g1), L.call.y1, g2);
  const calling = tau > -3.6 && tau < 0.1;
  out.o("pk.call", calling ? Math.min(phase(tau, -3.6, -3.5), 1 - phase(tau, -0.05, 0.1)) : 0);
  if (calling) out.n("pk.call", "cy", cy, 1);
  out.n("tr.call", "stroke-dashoffset", (1 - (cy - L.call.y0) / (L.call.y1 - L.call.y0)) * DASH, 3);

  const open = e3(phase(tau, -1.7, -1.3));
  out.m("gate.sh", L.gate.px, L.gate.py - 1.6 * open, 24 * open);
  ping(out, "gate.ping", phase(tau, -1.5, -0.95));
  out.c("consent", "wait", tau >= -3.1 && tau < -2.6);
  out.c("allow", "press", tau >= -2.6 && tau < -2.35);
  out.c("allow", "done", tau >= -2.6);
  out.o("consent.ok", phase(tau, -2.5, -2.3));
  const ci = e3(phase(tau, -3.1, -2.65));
  out.o("cur.allow", Math.min(phase(tau, -3.2, -3.05), 1 - phase(tau, -2.3, -2.0)));
  out.m("cur.allow", lerp(L.cur.ax0, L.cur.ax1, ci), lerp(L.cur.ay0, L.cur.ay1, ci));
  // The token goes back up to the chat, which sends it with every call from then on.
  const tk = io(phase(tau, -2.4, -1.75));
  out.o("tok", Math.min(phase(tau, -2.4, -2.3), 1 - phase(tau, -1.82, -1.7)));
  out.m("tok", L.tokX, lerp(L.tok.y0, L.tok.y1, tk));
  out.n("tr.tok", "stroke-dashoffset", (1 - tk) * DASH, 3);

  // ---------- meanwhile, other people press Export MP4 in the app ----------
  const n = newest(tau), n1 = n + 1;
  let au = 0, ain = 0, press = false;
  if (n1 !== 0) {
    const a = jobA(n1);
    au = phase(tau, a - 0.9, a);
    ain = e3(phase(tau, a - 1.5, a - 1.02)) * (1 - e3(phase(tau, a - 0.8, a - 0.3)));
    press = tau >= a - 1.02 && tau < a - 0.8;
  }
  out.m("cur.app", lerp(L.cur.px0, L.cur.px1, ain), lerp(L.cur.py0, L.cur.py1, ain));
  out.c("app.btn", "press", press);
  const sent = au > 0 && au < 1;
  out.o("pk.app", sent ? Math.min(1, au * 10, (1 - au) * 10) : 0);
  if (sent) {
    along(L.route.app, io(au));
    out.n("pk.app", "cx", PT[0], 1);
    out.n("pk.app", "cy", PT[1], 1);
  }

  // ---------- the queue: one row per job, oldest first ----------
  const Q = L.queue, R = Q.rows;
  const arr = jobA(n);
  const shift = e3(phase(tau, arr, arr + 0.4)); // the list moves up a row for the newest job
  let ourY = -1, ourO = 0;
  for (let j = n - R; j <= n; j++) {
    const K = ROW[mod(j, R + 1)];
    const y = Q.y0 + (j - (n - R) - shift) * Q.pitch;
    const o = j === n - R ? 1 - shift : j === n ? shift : 1;
    out.m(K.g, 0, y);
    out.o(K.g, o);
    if (out.fresh(K.g, j)) {
      out.t(K.id, jobId(j));
      out.c(K.g, "our", j === 0);
      if (Q.src) out.t(K.src, j === 0 ? "from chat" : "from app");
    }
    const state = tau < jobS(j) ? 0 : tau < jobT(j) ? 1 : 2;
    if (out.fresh(K.s, state)) {
      out.t(K.s, STATE[state]);
      out.s(K.gl, "d", GLYPH[state]);
      out.c(K.g, "st-q", state === 0);
      out.c(K.g, "st-r", state === 1);
      out.c(K.g, "st-d", state === 2);
    }
    out.m(K.gl, Q.gx, Q.pitch / 2, state === 1 ? (now * 300 + j * 67) % 360 : 0);
    if (j === 0) { ourY = y; ourO = o; }
  }
  out.o("q.our", ourY >= 0 ? ourO : 0);
  if (ourY >= 0) out.n("q.our", "y", ourY + 1, 1);

  // ---------- the sandboxes: one per render, drawn, sealed, used once ----------
  for (let k = 0; k < SLOTS; k++) {
    const B = BOX[k], G = L.boxes[k];
    const j = slotJob(k, tau), t = tau - jobS(j), N = jobFrames(j), r1 = PROV + N / FPS;

    // The worker hands the job over.
    const du = phase(t, -LEAD, 0), handing = du > 0 && du < 1;
    out.o(B.pk, handing ? Math.min(1, du * 8, (1 - du) * 8) : 0);
    out.c(B.pk, "our", j === 0);
    if (handing) {
      along(L.route.disp[k], io(du));
      out.n(B.pk, "cx", PT[0], 1);
      out.n(B.pk, "cy", PT[1], 1);
    }

    const prov = e3(phase(t, 0, PROV)), down = phase(t, r1 + PACK, r1 + PACK + DOWN);
    const here = t >= 0 && down < 1;
    out.o(B.o, here ? 1 : 0);
    // Drawn on from its first corner. When its render is over it goes the same way: it is not used again.
    out.n(B.o, "stroke-dashoffset", here ? (down > 0 ? -down : 1 - prov) * DASH : DASH, 3);
    out.o(B.c, here ? Math.min(phase(prov, 0.4, 1), 1 - phase(down, 0, 0.7)) : 0);
    // Between jobs the slot is empty, and says why.
    if (k === 0) out.o("b0e", t < 0 ? 1 : t < 0.2 ? 1 - t / 0.2 : phase(down, 0.72, 1));
    const shut = e3(phase(t, 0.42, PROV));
    out.m(B.l, G.lx + 2.8, G.ly - 1.5 - 1.6 * (1 - shut), 24 * (1 - shut));
    ping(out, B.pg, phase(t, PROV - 0.06, PROV + 0.5));
    // Once every frame is drawn they are wound into one file, toward the rail.
    const spool = io(phase(t, r1, r1 + PACK));
    if (out.fresh(B.o, j)) {
      out.t(B.id, jobId(j));
      out.c(B.g, "our", j === 0);
    }
    const fr = clamp((t - PROV) * FPS, 0, N), fi = Math.floor(fr);

    if (k > 0) {
      // A small sandbox shows only its progress.
      const done = Math.floor((fr / N) * L.fs.n + 1e-6), end = G.sx0 + done * G.sp - 2;
      out.o(B.p, done > 0 && spool < 1 ? 1 : 0);
      out.n(B.p, "x1", lerp(G.sx0, end, spool), 1);
      out.n(B.p, "x2", end, 1);
      if (out.fresh(B.n, fi * 1000 + N)) out.t(B.n, `${fi} / ${N}`);
      continue;
    }

    // The large one shows the render itself.
    const seal = t < 0.5 ? 0 : 1;
    if (out.fresh(B.st, seal)) out.t(B.st, SEAL[seal]);
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
    // The frame being drawn: the tangent at this frame's point, and its slope.
    const u = fr / N;
    const x0 = lerp(l.dom[0], l.dom[1], u), m = l.d(x0);
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
    if (out.fresh("pv.m", sl)) out.t("pv.m", (sl < 0 ? MINUS : "") + (Math.abs(sl) / 100).toFixed(2));

    const hx = lerp(T.x0, T.x1, u);
    out.m("tl.ph", hx, 0);
    out.n("tl.clip", "width", hx - T.x0, 1);
    if (out.fresh("tl.f", fi)) out.t("tl.f", String(fi));
    const done = Math.min(F.n, Math.floor(u * F.n + 1e-6));
    out.n("fs.clip", "x", F.x + F.w * spool, 1);
    out.n("fs.clip", "width", done * F.pitch * (1 - spool), 1);
    const drawing = fr > 0 && fr < N;
    out.o("fs.cur", drawing ? 1 : 0);
    out.o("fs.scan", drawing ? 1 : 0);
    if (drawing) {
      const cx = F.x + done * F.pitch + F.pad;
      out.n("fs.cur", "x", cx, 1);
      // Within the cell, a line sweeps across as its frames are drawn.
      out.m("fs.scan", cx + (u * F.n - done) * F.cw, 0);
    }
  }

  // ---------- files: down the rail, into the store, three deep ----------
  const jm = Math.floor((tau - S0) / GAP);
  for (let j = jm - TILES + 1; j <= jm; j++) {
    const K = TILE[mod(j, TILES)];
    const r1 = jobS(j) + PROV + jobFrames(j) / FPS, T = r1 + PACK + TRAVEL;
    if (tau < r1 + PACK * 0.4) { out.o(K, 0); continue; }
    // How many files have landed on top of this one.
    let rank = 0;
    for (let i = jm - TILES + 1; i <= jm; i++) {
      if (i === j) continue;
      const Ti = jobT(i);
      if (Ti > T || (Ti === T && i > j)) rank += io(phase(tau, Ti - DROP, Ti));
    }
    if (rank >= 3) { out.o(K, 0); continue; }
    out.c(K, "our", j === 0);
    if (tau < T - DROP) {
      const rt = L.route.out[mod(j, SLOTS)];
      const u = io(phase(tau, r1 + PACK, T - DROP));
      along(rt, u);
      const grow = e3(phase(tau, r1 + PACK * 0.4, r1 + PACK));
      // On end in the chute, level on the run to the store.
      out.m(K, PT[0], PT[1], 90 * (1 - io(phase(u * rt.total, rt.at[1] - 16, rt.at[1] + 16))), 0.6 + 0.4 * grow);
      out.o(K, grow);
    } else if (tau < T) {
      const v = phase(tau, T - DROP, T);
      out.m(K, L.store.cx, lerp(L.turnY, L.store.s0, v * v));
      out.o(K, 1);
    } else {
      out.m(K, L.store.cx, L.store.s0 + rank * L.store.sp);
      out.o(K, 1 - phase(rank, 2.3, 3));
    }
  }
  const o1 = phase(tau, R1, R1 + PACK), o2 = io(phase(tau, R1 + PACK, STORED - DROP)), o3 = phase(tau, STORED - DROP, STORED);
  out.n("tr.out", "stroke-dashoffset", (1 - (L.trOut.a * o1 + (L.trOut.b - L.trOut.a) * o2 + (1 - L.trOut.b) * o3)) * DASH, 3);
  out.n("tr.disp", "stroke-dashoffset", (1 - io(phase(tau, S0 - LEAD, S0))) * DASH, 3);

  // ---------- back to the chat ----------
  const rs = io(phase(tau, 12.15, 12.6));
  out.o("res", Math.min(phase(tau, 12.15, 12.25), 1 - phase(tau, 12.5, 12.65)));
  along(L.route.res, rs);
  out.m("res", PT[0], PT[1]);
  out.n("tr.res", "stroke-dashoffset", (1 - rs) * DASH, 3);
  const got = e3(phase(tau, 12.55, 12.95));
  out.o("rep.ava", phase(tau, 12.5, 12.7));
  out.o("att", got);
  out.m("att", L.wide ? 8 * (1 - got) : 0, L.wide ? 0 : -8 * (1 - got));
  const said = phase(tau, 12.95, 13.6);
  out.o("rep.sk", said > 0 ? 1 : 0);
  out.n("rep.sk", "x2", lerp(L.rep.x0, L.rep.x1, said), 1);
  out.o("rep.caret", now % 1.1 < 0.62 ? 1 : 0);

  // ---------- lifecycle email, on its own clock ----------
  // An account event reaches EventBridge, which triggers SES, which delivers.
  // None of it is tied to the export above: the times never line up on purpose.
  const mi = Math.floor((tau - MAIL_FIRST) / MAIL_EVERY), mc = tau - MAIL_FIRST - mi * MAIL_EVERY;
  out.c("src", "hot", mc < 0.5);
  ring(out, "src.ring", L.src, phase(mc, 0, 0.6));
  const h1 = io(phase(mc, 0.4, 0.9)), h2 = io(phase(mc, 1.3, 1.8)), h3 = io(phase(mc, 2.2, MAIL_LANDS));
  const hopping = (mc > 0.4 && mc < 0.95) || (mc > 1.3 && mc < 1.85);
  along(mc < 1.1 ? L.route.m1 : L.route.m2, mc < 1.1 ? h1 : h2);
  out.o("pk.ev", hopping ? 1 : 0);
  out.n("pk.ev", "cx", PT[0], 1);
  out.n("pk.ev", "cy", PT[1], 1);
  out.c("eb", "hot", mc >= 0.9 && mc < 1.5);
  ring(out, "eb.ring", L.eb, phase(mc, 0.9, 1.45));
  out.c("ses", "hot", mc >= 1.8 && mc < 2.4);
  ring(out, "ses.ring", L.ses, phase(mc, 1.8, 2.35));
  along(L.route.m3, h3);
  out.o("pk.env", mc > 2.2 && mc < MAIL_LANDS + 0.15 ? Math.min(1, h3 * 8, 1 - phase(mc, MAIL_LANDS, MAIL_LANDS + 0.15)) : 0);
  out.m("pk.env", PT[0], PT[1]);
  // The inbox: the newest message on top, the one before it below, the oldest sliding out.
  const mn = mc >= MAIL_LANDS ? mi : mi - 1;
  const ms = e3(phase(mc >= MAIL_LANDS ? mc - MAIL_LANDS : 1, 0, 0.5));
  for (let i = mn - 2; i <= mn; i++) {
    const K = MSG[mod(i, 3)], M = L.mm;
    out.m(K.g, 0, M.top + (mn - i - 1 + ms) * M.pitch);
    out.o(K.g, i === mn ? ms : 1);
    out.o(K.dot, i === mn ? 1 : 0);
    if (out.fresh(K.g, i)) out.n(K.sk, "x2", M.x + M.len * SUBJECT[mod(i, SUBJECT.length)], 1);
  }
}

/** A ring that opens once around a lock as it shuts (or opens). */
function ping(out: Sink, k: string, u: number) {
  const on = u > 0 && u < 1;
  out.o(k, on ? 0.9 * (1 - u) : 0);
  if (on) out.n(k, "r", 5 + 9 * e3(u), 1);
}

/** A pill's outline widening and fading once, as something passes through it. */
function ring(out: Sink, k: string, b: { x: number; y: number; w: number; h: number }, u: number) {
  const on = u > 0 && u < 1, g = 7 * e3(u);
  out.o(k, on ? 0.8 * (1 - u) : 0);
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

/** Writes to the DOM, and only what changed. */
class Dom implements Sink {
  private el: Record<string, Element> = Object.create(null);
  private num: Record<string, Record<string, number>> = Object.create(null);
  private str: Record<string, Record<string, string>> = Object.create(null);
  private cls: Record<string, Record<string, boolean>> = Object.create(null);
  private ver: Record<string, number> = Object.create(null);
  private txt: Record<string, string> = Object.create(null);

  constructor(svg: SVGSVGElement) {
    for (const el of qa<SVGElement>(svg, "[data-k]")) {
      const k = el.dataset.k!;
      this.el[k] = el;
      this.num[k] = Object.create(null);
      this.str[k] = Object.create(null);
      this.cls[k] = Object.create(null);
    }
  }
  n(k: string, a: string, v: number, d = 2) {
    const el = this.el[k];
    if (!el) return;
    const m = d === 1 ? 10 : d === 3 ? 1000 : 100, r = Math.round(v * m) / m, c = this.num[k];
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
  m(k: string, x: number, y: number, rot = 0, sc = 1) {
    const el = this.el[k];
    if (!el) return;
    const c = this.num[k];
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
  o(k: string, v: number) {
    this.n(k, "opacity", v <= 0.004 ? 0 : v >= 0.996 ? 1 : v, 2);
  }
  fresh(k: string, v: number) {
    if (this.ver[k] === v) return false;
    this.ver[k] = v;
    return true;
  }
}

/** The line the plate readout shows for a moment of the story. */
function storyLine(tau: number, frame: number) {
  if (tau < -4.0) return "asked in chat";
  if (tau < -2.6) return "tool call, waiting for consent";
  if (tau < 0) return "authorised";
  if (tau < S0) return "queued";
  if (tau < R0) return "sandbox sealed";
  if (tau < R1) return `rendering ${frame} / ${OURS.frames} frames`;
  if (tau < STORED) return `${OURS.frames} frames rendered`;
  if (tau < BACK) return "stored";
  return "delivered";
}
/** A number that changes exactly when storyLine's answer does. */
const storyKey = (tau: number) =>
  tau < -4.0 ? -1 : tau < -2.6 ? -2 : tau < 0 ? -3 : tau < S0 ? -4 : tau < R0 ? -5 : tau < R1 ? Math.floor((tau - R0) * FPS) : tau < STORED ? -6 : tau < BACK ? -7 : -8;

function bind(svg: SVGSVGElement, L: Layout) {
  const sink = new Dom(svg);
  const l1 = svg.querySelector<SVGTextElement>('[data-m="l1"]'), l2 = svg.querySelector<SVGTextElement>('[data-m="l2"]');
  const frame: Frame = { tau: T_START, p: 0, late: 0, now: 0, w1: 0, w2: 0 };
  return {
    svg, L, frame,
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
    render() {
      draw(L, frame, sink);
    },
  };
}

export default async function (root: HTMLElement) {
  const { gsap, scrubbed, whileVisible } = await import("../motion");
  const box = root.querySelector<HTMLElement>(".ex-box");
  if (!box) throw new Error("figure element missing: .ex-box");
  const views = qa<SVGSVGElement>(root, "svg.ex").map((svg, i) => bind(svg, LAYOUTS[i]));
  const readout = root.querySelector<HTMLElement>("[data-readout]");
  let view = views[0];
  let p = 0, amb = 0, now = 0;
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

  // ---- the readout: the job's state, or the stage being read ----
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
  function say() {
    if (!readout) return;
    const text = pick ? sentence(pick) : line;
    if (readout.textContent !== text) readout.textContent = text;
  }

  function render() {
    const f = view.frame, e = pe();
    f.p = e;
    f.tau = tauOf(view.L, e) + amb;
    f.late = amb;
    f.now = now;
    view.render();
    const key = storyKey(f.tau);
    if (key !== lineKey) {
      lineKey = key;
      line = storyLine(f.tau, Math.max(0, key));
      say();
    }
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
  // Side by side, it ends as the plate settles in the middle of the screen.
  // Stacked, the plate is taller than the screen, so it runs for as long as
  // the plate takes to pass.
  let tl: ReturnType<typeof scrubbed> | null = null;
  let bound = "";
  function drive() {
    for (const v of views) v.live = v.svg.getBoundingClientRect().width > 0;
    view = views.find((v) => v.live) ?? views[0];
    view.measure();
    rove();
    for (const k in fits) delete fits[k as Stage];
    const mode = view.L.wide ? "wide" : "stacked";
    if (mode === bound) return;
    bound = mode;
    tl?.scrollTrigger?.kill();
    tl?.kill();
    const clock = { p: 0 };
    tl = scrubbed(root, view.L.wide ? { start: "top 85%", end: "center 50%" } : { start: "top 72%", end: "bottom 64%" });
    tl.to(clock, { p: 1, duration: 1, ease: "none" });
    tl.eventCallback("onUpdate", () => (p = clock.p));
    p = 0;
    amb = 0;
  }
  drive();
  render();
  new ResizeObserver(() => {
    drive();
    render();
  }).observe(box);
  document.fonts?.ready.then(() => {
    view.measure();
    for (const k in fits) delete fits[k as Stage];
  });

  // ---- one loop: the story where the scroll has put it, then the same clock left running ----
  whileVisible(root, (dt, t) => {
    now = t;
    if (pe() >= 0.999) amb += dt;
    else amb = 0;
    render();
  });

  // ---- pointer, touch and keyboard: a stage says what it does ----
  const live = document.createElement("p");
  live.className = "sr-only";
  live.setAttribute("aria-live", "polite");
  root.append(live);
  let liveTimer = 0, tapTimer = 0;
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
      liveTimer = window.setTimeout(() => (live.textContent = text), 250);
    }
  }
  const press = () => {
    for (const v of views) for (const hit of v.keys) hit.setAttribute("aria-pressed", String(held === hit.dataset.st));
  };
  const finish = (on: boolean) => gsap.to(force, { v: on ? 1 : 0, duration: 0.6, ease: "power2.out", overwrite: true });
  // Leaving the figure gives the drawing back to the scroll, unless a reading is held.
  root.addEventListener("focusout", (e) => {
    if (!held && !root.contains(e.relatedTarget as Node | null)) finish(false);
  });

  for (const v of views) {
    v.svg.dataset.live = "";
    v.svg.setAttribute("aria-label", "Plot. Arrow keys move through its parts.");
    for (const hit of v.hits) {
      const st = hit.dataset.st as Stage;
      // The plate readout takes over from the native tooltip.
      hit.querySelector("title")?.remove();
      // A pointer or a finger can only pick a stage the plate has drawn.
      const drawn = () => pe() >= v.L.ready[st];
      hit.addEventListener("pointerenter", (e) => {
        if (e.pointerType !== "mouse" || !drawn()) return;
        hover = st;
        update(true);
      });
      hit.addEventListener("pointerleave", (e) => {
        if (e.pointerType !== "mouse") return;
        hover = null;
        update();
      });
      // A click or a tap should not move the keyboard's place, or leave a ring behind.
      hit.addEventListener("mousedown", (e) => e.preventDefault());
      hit.addEventListener("pointerdown", (e) => (lastType = e.pointerType));
      // A tap, not a scroll that happens to start here: click only fires for the former.
      // A second tap on the same stage lets it go; a tap on another replaces it.
      hit.addEventListener("click", () => {
        if (lastType === "mouse" || !drawn()) return;
        clearTimeout(tapTimer);
        tap = tap === st ? null : st;
        if (tap) tapTimer = window.setTimeout(() => { tap = null; update(); }, 6000);
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
