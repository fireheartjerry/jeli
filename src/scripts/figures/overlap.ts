import { gsap, scrubbed, phase, q, qa, whileVisible } from "../motion";

// Fig. "overlap": three measurements of a delegation tree's repeated work, from
// the NeurIPS 2026 workshop paper. (a) where the tokens beyond one agent went,
// (b) sibling file overlap above a task-conditioned null, (c) 165 refused
// patches replayed with a three-way merge.
//
// Scroll: one scrubbed clock. The plate lets its sheet out from the top as it
// comes into the window, and the figure is set out on the sheet as it comes:
// row names rise as their rows clear, each bar's frame is ruled round, zero is
// drawn down panel (b) at the pace of the sheet, each scale is ruled the
// moment it is out, the lattice of 165 comes up once all of it is. The
// measurements follow close behind, several at once: the two bars open, the
// two estimates land and their intervals span, and the 165 cells open in a
// wave along the diagonal the replay will take. When each part plays is
// worked out from where it sits in the plate and how tall the window is, so
// the drawing follows the sheet and does not run ahead of it.
//
// Every state the story can be stopped in is true. A mark whose length, place
// or count encodes a measurement keeps the geometry the server gave it along
// its scale: a bar and its split are full length from the first frame they can
// be seen, a dot sits on its value, an interval spans its two ends. What the
// script changes on such a mark runs across the scale: a bar's thickness, a
// dot's radius, the height of an end cap, the size of a cell. The grid is a
// count, so all 165 cells are on the plot from the first frame any of them is,
// each already in its colour: 149 and 16 at every scroll position. A number is
// shown once its mark is fully there.
//
// Ambient: the replay. A light crosses the finished grid along the diagonal,
// cell by cell, bright at its head and fading behind. Over a colliding cell it
// brings the fill up; over a disjoint one it inks the outline; it changes
// neither. No two passes take quite the same path or wait quite as long.
//
// Reading: a row of (a) or (b), or either group of cells, under the pointer, a
// finger or the keyboard steps the rest back and puts its numbers in the
// readout. There is no dead ground between the panels.

/** A stretch of the scroll story, as two fractions of it. */
type Win = [number, number];
type XY = [number, number];
/** A scale as it is ruled: its baseline, and each tick as [x, length]. */
interface Axis { y: number; x0: number; x1: number; ticks: XY[] }
interface Geo {
  H: number;
  /** Length of the orchestration leader. */
  lead: number;
  a: { axis: Axis | null; rows: { ly: number; y0: number; h: number }[]; oY: number; leg: number };
  b: { axis: Axis; top: number; note: number; rows: { ly: number; y: number; ciY: number; lo: number; hi: number }[]; cap: number };
  c: {
    hit: number; n: number; cell: number; x0: number; top: number; pitch: number; cols: number; rows: number;
    /** The colliding cells, in the order of the server's path. */
    order: number[]; bottom: number; stat: number; leg: number; head: number;
  };
  /** The plate readout's lines for the scroll story. Every number in them is written with the data, in the component. */
  story: { idle: string; a: string; aDone: string; bBoth: string; cDone: string };
}
/** When a height in the drawing comes clear of the plate's edge, as a fraction of the story. */
type Clear = (y: number) => number;

const NS = "http://www.w3.org/2000/svg";
/** The house curve for anything coming to rest (motion.ts registers it). */
const arrive = gsap.parseEase("arrive");
const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** A cell is a dot this share of its size before it opens. */
const SEED = 0.3;
/** Cells the replay's light covers behind its head, and how many it reaches a second. */
const TAIL = 15, PACE = 46;
/** How far what is not being read steps back, and how long that takes. */
const DIM = 0.36, FOCUS = 0.32;
/**
 * The story begins as the plate's top passes START of the window's height. The
 * plate lets its sheet out at a line near the foot of the window; a part is
 * clear of it, and can be drawn, at CLEAR of the window's height.
 */
const START = 0.85, CLEAR = 0.92;
/**
 * Where the story ends. A plate that fits the window with room to spare is
 * finished just before its middle reaches the window's, so it is whole by the
 * time it is centred. A taller one cannot be: it is finished once its foot has
 * come clear.
 */
const endOf = (plate: HTMLElement) => () => (plate.offsetHeight <= 0.82 * window.innerHeight ? "center 51%" : "bottom 86%");

// A scrubbed story repeats most of every frame, so each write goes through a
// cache and touches the DOM only when its value changes.
const cache = new WeakMap<Element, Record<string, string | number>>();
const slot = (el: Element) => {
  let s = cache.get(el);
  if (!s) cache.set(el, (s = {}));
  return s;
};
/** Opacity, to three places. */
const op = (el: Element, v: number) => {
  const s = slot(el), n = Math.round(clamp(v) * 1000);
  if (s.o === n) return;
  s.o = n;
  (el as SVGElement).style.opacity = String(n / 1000);
};
/** A numeric attribute, to two places. */
const num = (el: Element, name: string, v: number) => {
  const s = slot(el), n = Math.round(v * 100);
  if (s[name] === n) return;
  s[name] = n;
  el.setAttribute(name, String(n / 100));
};
/** Any other attribute. */
const str = (el: Element, name: string, value: string) => {
  const s = slot(el);
  if (s[name] === value) return;
  s[name] = value;
  el.setAttribute(name, value);
};
/** True when a value has changed since it was last asked about, so a path is rebuilt only then. */
const moved = (el: Element, key: string, v: number) => {
  const s = slot(el), n = Math.round(v * 1000);
  if (s[key] === n) return false;
  s[key] = n;
  return true;
};
/** A shift down the page, in user units. It moves a part within its row and never along a scale. */
const shift = (el: Element, y: number) => {
  const s = slot(el), n = Math.round(y * 100);
  if (s.y === n) return;
  s.y = n;
  (el as SVGElement).style.transform = n ? `translateY(${n / 100}px)` : "";
};
/** A stroke drawn on along its own length: u from 0 (nothing) to 1 (all of it). */
const draw = (el: SVGElement, len: number, u: number) => {
  const s = slot(el), n = Math.round(len * (1 - u) * 100);
  if (s.d !== n) {
    s.d = n;
    // Once it is all drawn the stroke is left as the server drew it, with no dash on it at all.
    el.style.strokeDasharray = n ? `${len} ${len}` : "";
    el.style.strokeDashoffset = n ? String(n / 100) : "";
  }
  op(el, u > 0 ? 1 : 0); // a round cap paints a dot at zero length
};
/** Type coming up into place as it appears, the way the page's own type does. */
const rise = (el: Element, u: number, dy = 4) => {
  op(el, u * 1.7);
  shift(el, dy * (1 - arrive(u)));
};
/** A dot opening to its radius where it stands. */
const openDot = (el: Element, r: number, u: number) => {
  num(el, "r", r * (0.4 + 0.6 * arrive(u)));
  op(el, u * 2.2);
};

/** A scale that can be ruled: the baseline, the ticks along it, and the labels under them. */
interface Scale { g: Axis; base: SVGPathElement; ticks: SVGPathElement; pre: string[]; full: string; labels: { el: SVGTextElement; at: number }[] }
/** How far past a tick the pen has to travel for the tick to reach its length, in user units. */
const GROW = 14;
function scaleOf(group: SVGGElement, g: Axis): Scale {
  const base = q<SVGPathElement>(group, ".ax-b");
  const len = g.x1 - g.x0;
  // pre[k] is the first k ticks. The finished scale is the server's own stroke, to the last digit.
  const pre = [""];
  g.ticks.forEach(([x, l], i) => pre.push(`${pre[i]}M${x} ${g.y}v${l}`));
  const ticks = q<SVGPathElement>(group, ".ax-t");
  return {
    g, base, pre, ticks, full: ticks.getAttribute("d")!,
    labels: qa<SVGTextElement>(group, "text").map((el) => ({ el, at: clamp((Number(el.dataset.x) - g.x0) / len) })),
  };
}
/**
 * Rule a scale: the baseline from its low end, each tick growing down as the
 * pen passes it, each label coming up under its tick.
 */
function rule(s: Scale, u: number) {
  const { g } = s, len = g.x1 - g.x0;
  const pen = g.x0 + (len + GROW) * phase(u, 0, 0.8);
  draw(s.base, len, Math.min(1, (pen - g.x0) / len));
  let k = 0;
  while (k < g.ticks.length && g.ticks[k][0] < pen) k++;
  let d = k === g.ticks.length ? s.full : s.pre[k];
  if (k > 0) {
    const [x, l] = g.ticks[k - 1];
    const grown = (pen - x) / GROW;
    if (grown < 1) d = `${s.pre[k - 1]}M${x} ${g.y}v${(l * grown).toFixed(2)}`;
  }
  str(s.ticks, "d", d);
  for (const lb of s.labels) rise(lb.el, phase(u, 0.14 + 0.56 * lb.at, 0.44 + 0.56 * lb.at), 3);
}

type Pick = { p: "a" | "b"; i: number } | { p: "c"; i: 0 | 1 } | null;
type Hit = { hit: SVGRectElement; k: NonNullable<Pick> };

/**
 * Give each line of the plate readout its moment: a line is put off until the
 * one before it has been up for `hold` of the story, where there is room for
 * that before the end. (A line shown late is still true; one shown early is not.)
 */
function spaced(lines: [number, string][], hold: number) {
  lines.sort((a, b) => a[0] - b[0]);
  for (let h = hold; h > 0.004; h /= 2) {
    const at = lines.map((l) => l[0]);
    for (let i = 1; i < at.length; i++) if (at[i - 1] >= 0) at[i] = Math.max(at[i], at[i - 1] + h);
    if (at[at.length - 1] > 0.985) continue;
    at.forEach((t, i) => (lines[i][0] = t));
    break;
  }
  return lines;
}

/** Wire one layout. Everything positional comes from that layout's own geometry. */
function bind(svg: SVGSVGElement) {
  const G: Geo = JSON.parse(svg.dataset.g!);
  const S = G.story;

  // The rule between the panels (side by side only): two strokes of one length, drawn down together.
  const sep = svg.querySelector<SVGPathElement>(".sep");

  // (a) two 100% bars. Each bar and its split is one mark, opened whole.
  const pa = q<SVGGElement>(svg, ".pa");
  const aScaleG = pa.querySelector<SVGGElement>(".scale");
  const aScale = aScaleG && G.a.axis ? scaleOf(aScaleG, G.a.axis) : null;
  const arows = qa<SVGGElement>(svg, ".arow").map((g, i) => {
    const frame = q<SVGRectElement>(g, ".frame");
    const around = 2 * (Number(frame.getAttribute("width")) + Number(frame.getAttribute("height")));
    const orch = q<SVGLineElement>(g, ".orch");
    const { y0, h } = G.a.rows[i];
    return {
      g, frame, around, orch, yc: y0 + h / 2, h,
      // The stroke marking the orchestration share, as the server drew it: it opens up and down from the bar's middle.
      reach: (Number(orch.getAttribute("y2")) - Number(orch.getAttribute("y1"))) / 2,
      rk: q<SVGTextElement>(g, ".rk"), bars: qa<SVGRectElement>(g, ".seg rect"),
      kv: q<SVGTextElement>(g, ".kv"), lv: q<SVGTextElement>(g, ".lv"),
    };
  });
  const ocall = q<SVGGElement>(svg, ".ocall");
  const lead = q<SVGPathElement>(ocall, ".lead");
  const ol = q<SVGTextElement>(ocall, ".ol");
  const aleg = q<SVGGElement>(svg, ".aleg");

  // (b) zero, the scale, and for each row a dot, its interval and the clearance to zero.
  const pb = q<SVGGElement>(svg, ".pb");
  const bScale = scaleOf(q<SVGGElement>(pb, ".scale"), G.b.axis);
  const zeroAx = q<SVGPathElement>(pb, ".ax-z"), bgrid = q<SVGPathElement>(pb, ".bgrid");
  const tall = G.b.axis.y - G.b.top;
  const brows = qa<SVGGElement>(svg, ".brow").map((g) => {
    const pt = q<SVGCircleElement>(g, ".pt"), caps = q<SVGPathElement>(g, ".caps");
    return {
      g, pt, r: Number(pt.getAttribute("r")), caps, capsD: caps.getAttribute("d")!,
      wh: q<SVGLineElement>(g, ".wh"), clr: q<SVGLineElement>(g, ".clr"), rk: q<SVGTextElement>(g, ".rk"),
      bv: q<SVGTextElement>(g, ".bv"), bci: q<SVGTextElement>(g, ".bci"),
    };
  });
  const bnote = svg.querySelector<SVGTextElement>(".bnote");

  // (c) the grid: the lattice of 165, the 149 colliding cells, the 16 disjoint.
  const C = G.c, HALF = C.cell / 2;
  const cellsG = q<SVGGElement>(svg, ".cells");
  const lattice = q<SVGPathElement>(cellsG, ".cells-bg");
  const onPath = q<SVGPathElement>(cellsG, ".cells-on"), offPath = q<SVGPathElement>(cellsG, ".cells-off");
  const onGroup = q<SVGGElement>(cellsG, ".grp-on"), offGroup = q<SVGGElement>(cellsG, ".grp-off");
  const onD = onPath.getAttribute("d")!, offD = offPath.getAttribute("d")!;
  const count = q<SVGTextElement>(svg, ".count");
  const cleg = q<SVGGElement>(svg, ".cleg");
  const lgHit = q<SVGGElement>(cleg, ".lg-hit"), lgOff = q<SVGGElement>(cleg, ".lg-off");
  const cstat = svg.querySelector<SVGTextElement>(".cstat");
  // Where each cell's centre is, and how far along the diagonal it lies (0 at the top left, 1 at the bottom right).
  const cx = new Float32Array(C.n), cy = new Float32Array(C.n), along = new Float32Array(C.n);
  const far = C.cols - 1 + (C.rows - 1) * 1.35;
  for (let i = 0; i < C.n; i++) {
    const col = i % C.cols, row = (i / C.cols) | 0;
    cx[i] = C.x0 + col * C.pitch + HALF;
    cy[i] = C.top + row * C.pitch + HALF;
    along[i] = (col + row * 1.35) / far;
  }
  const disjoint = Array.from({ length: C.n - C.hit }, (_, k) => C.hit + k);
  /** One cell as a square of half-side h about its centre. */
  const square = (i: number, h: number) => `M${(cx[i] - h).toFixed(1)} ${(cy[i] - h).toFixed(1)}h${(2 * h).toFixed(1)}v${(2 * h).toFixed(1)}h${(-2 * h).toFixed(1)}z`;
  // The opening wave is the same at the same scroll position, so each step of it is built once and kept.
  const STEPS = 48;
  const waveOn: string[] = [], waveOff: string[] = [];
  const half = (i: number, w: number) => HALF * (SEED + (1 - SEED) * arrive(phase(w, along[i] * 0.55, along[i] * 0.55 + 0.45)));
  function wave(w: number) {
    const k = Math.round(w * STEPS);
    if (k >= STEPS) {
      str(onPath, "d", onD);
      str(offPath, "d", offD);
      return;
    }
    if (waveOn[k] === undefined) {
      let on = "", off = "";
      for (const i of C.order) on += square(i, half(i, k / STEPS));
      for (const i of disjoint) off += square(i, half(i, k / STEPS));
      waveOn[k] = on;
      waveOff[k] = off;
    }
    str(onPath, "d", waveOn[k]);
    str(offPath, "d", waveOff[k]);
  }

  // The replay's light: one square for each cell it covers, made once and after
  // that only placed. Slot k sits k cells behind the head.
  const lights = Array.from({ length: TAIL + 1 }, () => {
    const el = document.createElementNS(NS, "rect");
    el.setAttribute("class", "rp");
    el.setAttribute("width", String(C.cell));
    el.setAttribute("height", String(C.cell));
    el.style.opacity = "0";
    cellsG.after(el);
    return { el, on: true, at: -1 };
  });

  const done = { a: false, b: false, c: false };
  const st = { stands: false };

  // ---------- the plan: when each part plays ----------
  // Every window is a stretch of the story, [from, to], as fractions of it.
  // They are worked out from where each part sits in the plate, each time the
  // page is measured: `c(y)` is when height y of the drawing has come clear of
  // the plate's edge, and R is the story's length in px of scroll.
  const W: Record<string, Win> = {};
  let Wrk: Win[] = [], Wfr: Win[] = [], Wseg: Win[] = [], Wnum: Win[] = [];
  let Wbk: Win[] = [], Wpt: Win[] = [], Wbv: Win[] = [], Wiv: Win[] = [], Wcap: Win[] = [], Wci: Win[] = [], Wclr: Win[] = [];
  /** The plate readout's lines, each with the moment the story has earned it. */
  let lines: [number, string][] = [[-1, S.idle]];
  let drawn = -1, said = S.idle;
  function plan(c: Clear, R: number) {
    const d = (px: number) => px / R;
    const w = (at: number, px: number): Win => [at, at + d(px)];
    const A = G.a, B = G.b;

    // Set out, as the sheet comes out.
    W.sep = [c(0), c(G.H)];
    Wrk = A.rows.map((r) => w(c(r.ly + 8), 64));
    Wfr = A.rows.map((r) => w(c(r.y0 + 4), 96));
    if (A.axis) W.aAxis = w(c(A.axis.y + 20), 96);
    // Zero is drawn down panel (b) at the pace of the sheet, the two gridlines a little behind it.
    const z0 = c(B.top + 6), z1 = Math.max(c(B.axis.y + 4), z0 + d(40));
    W.zero = [z0, z1];
    W.bgrid = [z0 + d(16), z1 + d(16)];
    W.bAxis = w(c(B.axis.y + 20), 96);
    Wbk = B.rows.map((r) => w(c(r.ly + 8), 64));
    // The lattice of 165 comes up once the whole of it is clear.
    W.lattice = w(c(C.bottom + 6), 50);

    // (a) Each bar opens once its row is clear, the second a beat after the first; then its two numbers.
    Wseg = [];
    A.rows.forEach((r, i) => Wseg.push(w(Math.max(c(r.y0 + r.h + 6), i ? Wseg[i - 1][0] + d(50) : 0), 60)));
    Wnum = Wseg.map((s) => w(s[1], 40));
    W.aleg = w(Math.max(c(A.leg + 10), Wseg[0][1]), 56);
    // The orchestration share is marked on both bars, then called out.
    const last = A.rows[A.rows.length - 1];
    W.orch = w(Math.max(c(last.y0 + last.h + 10), Wseg[1][1] + d(24)), 44);
    W.lead = w(Math.max(c(A.oY + 10), W.orch[1] - d(10)), 60);
    W.ol = w(W.lead[1], 44);

    // (b) begins as (a)'s second bar settles: each estimate lands on its value,
    // then its number; its interval spans, its caps open, and it is labelled;
    // then the clearance from zero to its near end.
    const b0 = Wseg[1][1] - d(30);
    Wpt = B.rows.map((r, i) => w(Math.max(c(r.ciY + 8), b0 + i * d(56)), 44));
    Wbv = Wpt.map((x) => w(x[1], 40));
    Wiv = Wpt.map((x) => w(x[0] + d(34), 40));
    Wcap = Wpt.map((x) => w(x[0] + d(44), 52));
    Wci = Wcap.map((x) => w(x[1], 40));
    Wclr = Wcap.map((x) => w(x[1] + d(20), 40));
    if (bnote) W.bnote = w(Math.max(c(B.note + 10), Wclr[1][1]), 44);

    // (c) The 165 cells open in a wave along the diagonal, then the count and the legend.
    W.wave = w(Math.max(W.lattice[0] + d(40), Wpt[1][1] - d(40)), 136);
    W.count = w(W.wave[1], 44);
    W.cstat = w(Math.max(c(C.stat + 10), W.wave[1] + d(20)), 44);
    W.cleg = w(Math.max(c(C.leg + 10), W.wave[1] + d(30)), 50);

    // If the window is too short for all of that, what follows the first
    // measurement is drawn closer together, so the story still ends on time.
    // (A part may then be drawn a little before the sheet reaches it, and is
    // let out with it.)
    const all = [...Object.values(W), ...Wrk, ...Wfr, ...Wseg, ...Wnum, ...Wbk, ...Wpt, ...Wbv, ...Wiv, ...Wcap, ...Wci, ...Wclr];
    const first = Wseg[0][0], end = Math.max(...all.map((x) => x[1]));
    if (end > 1 && first < 1) {
      const k = (1 - first) / (end - first);
      for (const x of all) for (let i = 0; i < 2; i++) if (x[i] > first) x[i] = first + (x[i] - first) * k;
    }
    // The readout holds the latest thing the story has shown, and a line with a
    // number in it only once that number's mark is fully there.
    lines = spaced([[-1, S.idle], [Wseg[0][0], S.a], [Wseg[1][1], S.aDone], [Wpt[1][1], S.bBoth], [W.wave[1], S.cDone]], d(84));
    drawn = -1;
  }
  // Until the page has been measured: a plan that draws nothing early.
  plan((y) => 0.1 + (0.5 * y) / G.H, 600);

  /** The scroll story at progress p. Returns the line for the plate readout. */
  function render(p: number): string {
    if (p === drawn) return said;
    drawn = p;
    const u = (x: Win) => phase(p, x[0], x[1]);
    if (sep) draw(sep, G.H, u(W.sep));

    // (a)
    if (aScale) rule(aScale, u(W.aAxis));
    arows.forEach((r, i) => {
      rise(r.rk, u(Wrk[i]));
      draw(r.frame, r.around, u(Wfr[i]));
      // Both shares open together, at their measured lengths.
      const open = u(Wseg[i]), thick = 0.12 + 0.88 * arrive(open);
      for (const bar of r.bars) {
        num(bar, "y", r.yc - (r.h * thick) / 2);
        num(bar, "height", r.h * thick);
        op(bar, open * 2.4);
      }
      const named = u(Wnum[i]);
      rise(r.kv, named, 3);
      rise(r.lv, named, 3);
      const mark = u(W.orch), reach = r.reach * arrive(mark);
      num(r.orch, "y1", r.yc - reach);
      num(r.orch, "y2", r.yc + reach);
      op(r.orch, mark * 2.4);
    });
    rise(aleg, u(W.aleg));
    draw(lead, G.lead, u(W.lead));
    rise(ol, u(W.ol), 3);

    // (b)
    draw(zeroAx, tall, u(W.zero));
    draw(bgrid, tall, u(W.bgrid));
    rule(bScale, u(W.bAxis));
    brows.forEach((r, i) => {
      const b = G.b.rows[i];
      rise(r.rk, u(Wbk[i]));
      openDot(r.pt, r.r, u(Wpt[i]));
      rise(r.bv, u(Wbv[i]), 3);
      op(r.wh, u(Wiv[i]));
      const spread = u(Wcap[i]);
      if (moved(r.caps, "u", spread)) {
        const cap = G.b.cap * arrive(spread), y0 = (b.y - cap).toFixed(2), span = (2 * cap).toFixed(2);
        str(r.caps, "d", spread >= 1 ? r.capsD : `M${b.lo} ${y0}v${span}M${b.hi} ${y0}v${span}`);
      }
      op(r.caps, spread * 3);
      rise(r.bci, u(Wci[i]), 3);
      op(r.clr, u(Wclr[i]));
    });
    if (bnote) rise(bnote, u(W.bnote), 3);

    // (c) The lattice, then every cell at once: a dot in its own colour, opening to its size.
    op(lattice, u(W.lattice));
    const w = u(W.wave);
    op(onPath, w * 5);
    op(offPath, w * 5);
    if (moved(cellsG, "w", Math.round(w * STEPS) / STEPS)) wave(w);
    rise(count, u(W.count), 3);
    if (cstat) rise(cstat, u(W.cstat), 3);
    rise(cleg, u(W.cleg));

    done.a = p >= Wnum[1][1];
    done.b = p >= Wci[1][1];
    done.c = st.stands = p >= W.wave[1];
    said = lines[0][1];
    for (const [at, text] of lines) if (p >= at) said = text;
    return said;
  }

  // ---------- ambient: the replay ----------
  // The order of a pass: every cell along the diagonal, with a little of its
  // own wander so the light's front is ragged, and differently each time.
  const order = new Int16Array(C.n), keyOf = new Float32Array(C.n);
  for (let i = 0; i < C.n; i++) order[i] = i;
  let seed = 0x51ed27;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const byKey = (x: number, y: number) => keyOf[x] - keyOf[y];
  let head = -1, wait = 0.5, life = 0;
  function deal() {
    for (let i = 0; i < C.n; i++) keyOf[i] = along[i] + rnd() * 0.07;
    order.sort(byKey);
    head = 0;
  }
  /** How bright the light is `back` cells behind its head: up over the first cell, then away over the rest. */
  const glow = (back: number) => (back < 0 ? 0 : back < 1 ? back : Math.max(0, 1 - (back - 1) / (TAIL - 1)));
  function ambient(dt: number, on: boolean) {
    if (!on && life === 0) return;
    // The light comes up and goes down over a few frames; it never appears or leaves in one.
    life = clamp(life + (on ? dt : -dt) / 0.25);
    if (head < 0) {
      // Between passes.
      wait -= dt;
      if (wait <= 0 && on) deal();
    } else {
      head += dt * PACE;
      if (head > C.n + TAIL) {
        head = -1;
        wait = 2.2 + rnd() * 1.4;
      }
    }
    const lead = Math.floor(head), part = head - lead;
    for (let k = 0; k < lights.length; k++) {
      const l = lights[k], j = lead - k;
      if (head < 0 || j < 0 || j >= C.n) {
        op(l.el, 0);
        continue;
      }
      const i = order[j], hit = i < C.hit;
      if (l.on !== hit) {
        l.on = hit;
        l.el.setAttribute("class", hit ? "rp" : "rp off");
      }
      // (Placed only when it takes a new cell: the head moves on one cell at a time.)
      if (l.at !== i) {
        l.at = i;
        l.el.x.baseVal.value = cx[i] - HALF;
        l.el.y.baseVal.value = cy[i] - HALF;
      }
      op(l.el, glow(k + part) * life);
    }
  }

  /** Which group of cells is under the pointer: 0 colliding, 1 disjoint, -1 neither. A column's margin reads as its nearest cell. */
  function cellGroup(e: PointerEvent): -1 | 0 | 1 {
    const m = svg.getScreenCTM();
    if (!m) return -1;
    const at = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const col = Math.max(0, Math.min(C.cols - 1, Math.floor((at.x - C.x0 + (C.pitch - C.cell) / 2) / C.pitch)));
    const row = Math.floor((at.y - C.top + (C.pitch - C.cell) / 2) / C.pitch);
    if (row < 0 || row >= C.rows) return -1;
    return row * C.cols + col < C.hit ? 0 : 1;
  }

  // ---------- reading ----------
  // What is not being read steps back, on the page's clock and its curve, and
  // a change of mind part-way is taken up from where each part has got to. An
  // estimate that is being read drops a line to the scale.
  type Part = { el: SVGElement; level: (k: NonNullable<Pick>) => number; rest: number; now: number; from: number; to: number };
  const part = (el: SVGElement, level: Part["level"], rest = 1): Part => ({ el, level, rest, now: rest, from: rest, to: rest });
  const drops = brows.map((r) => {
    const line = document.createElementNS(NS, "line");
    const x = r.pt.getAttribute("cx")!;
    line.setAttribute("class", "drop");
    line.setAttribute("x1", x);
    line.setAttribute("x2", x);
    line.setAttribute("y1", String(Number(r.pt.getAttribute("cy")) + r.r + 3));
    line.setAttribute("y2", String(G.b.axis.y));
    line.style.opacity = "0";
    bgrid.after(line);
    return line;
  });
  const parts: Part[] = [
    ...arows.map((r, i) => part(r.g, (k) => (k.p === "c" || (k.p === "a" && k.i === i) ? 1 : DIM))),
    ...brows.map((r, i) => part(r.g, (k) => (k.p === "c" || (k.p === "b" && k.i === i) ? 1 : DIM))),
    ...drops.map((line, i) => part(line, (k) => (k.p === "b" && k.i === i ? 1 : 0), 0)),
    part(ocall, (k) => (k.p === "b" ? DIM : 1)),
    part(offGroup, (k) => (k.p === "c" && k.i === 0 ? DIM : 1)),
    part(lgOff, (k) => (k.p === "c" && k.i === 0 ? DIM : 1)),
    part(onGroup, (k) => (k.p === "c" && k.i === 1 ? DIM : 1)),
    part(lgHit, (k) => (k.p === "c" && k.i === 1 ? DIM : 1)),
  ];
  const fade = { v: 1 };
  function mark(pick: Pick) {
    for (const x of parts) {
      x.from = x.now;
      x.to = pick ? x.level(pick) : x.rest;
    }
    gsap.killTweensOf(fade);
    fade.v = 0;
    gsap.to(fade, {
      v: 1, duration: FOCUS, ease: "arrive",
      onUpdate() {
        for (const x of parts) {
          x.now = x.from + (x.to - x.from) * fade.v;
          op(x.el, x.now);
        }
      },
    });
  }

  /** A panel can be read only once the story has drawn it. */
  const ready = (panel: "a" | "b" | "c") => done[panel];

  // The hit targets sit in their own layer, in reading order: the rows of (a)
  // and (b), then the two groups of cells by way of their legend. Each carries
  // the line it reads out, written with the data in the component.
  const hits: Hit[] = qa<SVGRectElement>(svg, ".hits .hit[data-p]").map((hit) => {
    const i = Number(hit.dataset.i);
    return { hit, k: hit.dataset.p === "c" ? { p: "c", i: i ? 1 : 0 } : { p: hit.dataset.p as "a" | "b", i } };
  });
  const lines_ = new Map(hits.map((h) => [`${h.k.p}${h.k.i}`, h.hit.dataset.say ?? ""]));
  return { svg, G, st, plan, render, ambient, cellGroup, mark, ready, hits, lines: lines_, keys: hits.filter((h) => h.hit.hasAttribute("tabindex")), grid: q<SVGRectElement>(svg, ".hits .grid") };
}

export default function (root: HTMLElement) {
  const svgs = qa<SVGSVGElement>(root, "svg.ov"); // side by side, then stacked
  type View = ReturnType<typeof bind>;
  const readout = root.querySelector<HTMLElement>("[data-readout]");
  let line = readout?.textContent ?? ""; // what the readout holds, so it is never read back
  const say = (s: string) => {
    if (!readout || s === line) return;
    readout.textContent = line = s;
  };

  let p = 0;
  let story = "";
  let pick: Pick = null;
  const same = (a: Pick, b: Pick) => (!a || !b ? a === b : a.p === b.p && a.i === b.i);

  // Keyboard. A part is read only once its mark is drawn, and a reader who
  // arrives by Tab can be anywhere in the scroll story, so keyboard focus
  // finishes the drawing first (force runs the story on to its end).
  const force = { v: 0 };
  let kb: { v: View; k: NonNullable<Pick>; said: boolean; hit: SVGRectElement } | null = null;
  let held: Pick = null; // Enter or Space holds a reading after focus moves on
  // One Tab stop per figure: a roving tabindex. The part last focused (the
  // first, to begin with) is the stop; arrow keys, Home and End move between
  // the parts, and Tab or Shift+Tab leaves the figure.
  let cur = 0;
  const announcer = document.createElement("p");
  announcer.className = "sr-only";
  announcer.setAttribute("aria-live", "polite");
  root.append(announcer);
  let liveTimer = 0;
  const announce = (text: string) => {
    clearTimeout(liveTimer);
    liveTimer = window.setTimeout(() => (announcer.textContent = text), 250);
  };

  // Only the layout on screen is wired, drawn and written to. Which one that
  // is follows the plate's width, so it is measured when the plate is resized
  // and never per frame; the other layout is caught up when it takes over.
  const views: (View | undefined)[] = [];
  let live!: View;
  function adopt(): boolean {
    const i = Math.max(0, svgs.findIndex((s) => s.getBoundingClientRect().width > 0));
    if (live && live.svg === svgs[i]) return false;
    const fresh = !views[i];
    live = views[i] ??= bind(svgs[i]);
    if (fresh) wire(live);
    return true;
  }
  const rove = () => {
    for (const v of views) v?.keys.forEach((h, i) => h.hit.setAttribute("tabindex", v === live && i === cur ? "0" : "-1"));
  };
  /** What a picked part reads out. */
  const describe = (k: NonNullable<Pick>) => live.lines.get(`${k.p}${k.i}`) ?? "";

  let timer = 0, away = 0;
  function set(next: Pick) {
    clearTimeout(timer);
    clearTimeout(away);
    if (same(pick, next)) return;
    pick = next;
    live.mark(pick);
    say(pick ? describe(pick) : story);
  }
  /** What shows when the pointer leaves: a held reading, else the focused part, else the story. */
  const rest = (): Pick => held ?? (kb && kb.v.ready(kb.k.p) ? kb.k : null);
  // Leaving one part for the next passes over its edge; the reading holds for
  // that instant, so the rest of the figure does not come up and go down again.
  const leave = () => {
    clearTimeout(away);
    away = window.setTimeout(() => set(rest()), 90);
  };

  function render() {
    story = live.render(p + (1 - p) * force.v);
    // The focused part reads out as soon as its mark exists.
    if (kb && !kb.said && kb.v.ready(kb.k.p)) {
      kb.said = true;
      set(kb.k);
      announce(describe(kb.k));
    }
    say(pick ? describe(pick) : story);
  }
  const finish = (on: boolean) => gsap.to(force, { v: on ? 1 : 0, duration: 0.6, ease: "arrive", overwrite: true, onUpdate: render });

  // The scroll story is bound to whichever layout is showing. It begins as the
  // plate comes into the window, and is over by the time the plate sits in the
  // middle of it; a plate too tall for that runs until its foot has come clear.
  let tl: ReturnType<typeof scrubbed> | null = null;
  let bound = "";
  /**
   * Work out when each part of the story plays. The plate lets its sheet out
   * from the top as it enters the window (reveal.ts), so a part is drawn once
   * it stands clear of that edge: CLEAR of the way down the window. Only
   * distances inside the plate are read, and only here, when the page is
   * measured.
   */
  function measure() {
    const trig = tl?.scrollTrigger;
    // (A trigger has no positions until its first refresh, which calls back here.)
    if (!trig || !(trig.end > trig.start)) return;
    const plate = root.getBoundingClientRect(), box = live.svg.getBoundingClientRect();
    if (!box.height) return;
    const unit = box.height / live.G.H; // window px to one unit of the drawing
    const R = trig.end - trig.start;
    const lead = (CLEAR - START) * window.innerHeight; // sheet already clear as the story begins
    live.plan((y) => (box.top - plate.top + y * unit - lead) / R, R);
    render();
  }
  function drive() {
    const stacked = live.svg === svgs[1];
    const mode = stacked ? "stacked" : "wide";
    if (mode === bound) return;
    bound = mode;
    tl?.scrollTrigger?.kill();
    tl?.kill();
    const clock = { p: 0 };
    tl = scrubbed(root, { start: `top ${START * 100}%`, end: endOf(root), onRefresh: measure });
    tl.to(clock, { p: 1, duration: 1, ease: "none" });
    tl.eventCallback("onUpdate", () => {
      p = clock.p;
      render();
    });
    measure();
  }

  const press = () => {
    for (const v of views) v?.keys.forEach((h) => h.hit.setAttribute("aria-pressed", String(!!held && same(held, h.k))));
  };
  // A finger lifts at once, so its reading stays up for a moment.
  const linger = () => { timer = window.setTimeout(() => set(rest()), 2600); };

  // Pointer, touch or keyboard: a row or a group of cells writes its exact numbers to the readout.
  function wire(v: View) {
    v.svg.dataset.live = "";
    v.svg.setAttribute("aria-label", "Plot. Arrow keys move through its parts.");
    // Every hit target answers to the pointer, and the plate readout takes over from its tooltip.
    v.hits.forEach(({ hit, k }) => {
      hit.querySelector("title")?.remove();
      const over = (e: PointerEvent) => {
        if (e.pointerType !== "mouse" || !v.ready(k.p)) return;
        set(k);
      };
      hit.addEventListener("pointerenter", over);
      // A part can finish drawing under a pointer that is already resting on it.
      hit.addEventListener("pointermove", over);
      hit.addEventListener("pointerleave", (e) => e.pointerType === "mouse" && leave());
      hit.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" || !v.ready(k.p)) return;
        if (same(pick, k)) set(rest());
        else { set(k); linger(); }
      });
    });
    // The keyboard's parts: served as labelled graphics, now buttons.
    v.keys.forEach(({ hit, k }, n) => {
      hit.setAttribute("role", "button");
      hit.setAttribute("aria-pressed", String(!!held && same(held, k)));
      // Focus does what hover does. A click also focuses, and is left to the pointer.
      const focused = () => {
        cur = n;
        rove();
        if (!hit.matches(":focus-visible")) return;
        kb = { v, k, said: false, hit };
        finish(true);
        render();
      };
      hit.addEventListener("focus", focused);
      // A reader can Tab onto a part before this script has loaded.
      if (document.activeElement === hit) focused();
      hit.addEventListener("blur", () => {
        // Only the keyboard's own reading goes with the focus. A tap or a click
        // moves focus too, and by then it has already picked something else.
        const mine = kb;
        if (!mine || mine.hit !== hit) return;
        kb = null;
        if (same(pick, mine.k)) set(rest());
      });
      hit.addEventListener("keydown", (e) => {
        const to = (m: number) => {
          e.preventDefault();
          cur = Math.max(0, Math.min(v.keys.length - 1, m));
          rove();
          v.keys[cur].hit.focus();
        };
        switch (e.key) {
          case "Enter":
          case " ":
            // Hold this reading, or let it go: what a tap does.
            e.preventDefault();
            if (!v.ready(k.p)) return;
            held = held && same(held, k) ? null : k;
            press();
            set(k);
            if (!held && !kb) finish(false);
            break;
          case "Escape":
            held = null;
            press();
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

    // The grid itself: whichever group of cells is under the pointer.
    let pending: PointerEvent | null = null;
    const read = () => {
      const e = pending;
      pending = null;
      if (!e) return;
      const g = v.ready("c") ? v.cellGroup(e) : -1;
      if (g === -1) return leave();
      set({ p: "c", i: g });
      if (e.pointerType !== "mouse") linger();
    };
    const onGrid = (e: PointerEvent) => {
      if (!pending) requestAnimationFrame(read);
      pending = e;
    };
    v.grid.addEventListener("pointermove", onGrid);
    v.grid.addEventListener("pointerdown", onGrid);
    v.grid.addEventListener("pointerleave", (e) => {
      // A finger leaves the moment it lifts; its tap is still waiting to be read.
      if (e.pointerType !== "mouse") return;
      pending = null;
      leave();
    });
  }

  adopt();
  rove();
  drive();
  render();
  new ResizeObserver(() => {
    if (!adopt()) return;
    // The other layout takes over: it is drawn at the story's present, and the scroll rebinds to it.
    kb = null;
    live.mark(pick);
    rove();
    drive();
    render();
  }).observe(q<HTMLElement>(root, ".ov-box"));

  // The replay runs once the grid stands, and gives way while its cells are being read.
  whileVisible(root, (dt) => live.ambient(dt, live.st.stands && !(pick && pick.p === "c")));

  // Leaving the figure lets the scroll story take the drawing back, unless a reading is held.
  root.addEventListener("focusout", (e) => {
    if (!held && !root.contains(e.relatedTarget as Node | null)) finish(false);
  });
}
