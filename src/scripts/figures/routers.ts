import { gsap, scrubbed, phase, q, qa, whileVisible } from "../motion";

// Fig. "routers": static pre-task routers from the NeurIPS 2026 workshop paper,
// tested on unseen repositories, each drawn against the best constant choice.
//
// Scroll: one scrubbed clock. The plate lets its sheet out from the top as it
// comes into the window, and each chart is set out on the sheet as it comes:
// row names rise and each row's track is ruled as the row clears, the constant
// is drawn down the chart at the pace of the sheet, the scale is ruled the
// moment it is out. Then the measurements land, several at once: the policies
// come up nearest the constant first, the depth arms' intervals open one after
// another, the one that excludes zero gives up its stem for the dotted gap, the
// tie is bracketed, and the router's 39 picks open along their strip. When
// each part plays is worked out from where it sits in the plate and how tall
// the window is, so the drawing follows the sheet and does not run ahead of
// it.
//
// Every state the story can be stopped in is true. A mark whose length, place
// or count encodes a measurement keeps the geometry the server gave it along
// its scale: a stem is its full length from the first frame it can be seen
// (its length is the difference from the constant), a marker sits on its
// value, an interval spans its two ends. What the script changes on such a
// mark runs across the scale: a marker's radius, the height of an end cap, the
// size of a cell. The strip is a count, so all 39 picks are on the plot from
// the first frame any of them is. A number is shown once its mark is fully
// there, and nothing is counted on screen.
//
// Ambient: the router keeps being asked, task by task, and keeps giving the
// same answer. A cursor steps along the 39 held-out tasks, one at a time, and
// each lights as it is asked about. When it has answered all 39 a ring opens
// round each of the three markers it ties: that is why they sit on the
// constant. No two passes wait quite as long.
//
// Reading: a row or a footer under the pointer, a finger or the keyboard steps
// the rest back, drops a line from the row's marker to the scale, and puts its
// numbers in the readout. There is no dead ground between the two charts.

/** A stretch of the scroll story, as two fractions of it. */
type Win = [number, number];
type XY = [number, number];
/** A scale as it is ruled: its baseline, and each tick as [x, length]. */
interface Axis { y: number; x0: number; x1: number; ticks: XY[] }
interface RowG {
  /** How far it is from the constant, as a share of the farthest policy: 0 for one that sits on the constant. Sets the order of arrival only. */
  t: number;
  ref: boolean; tie: boolean; oracle: boolean;
  /** Depth rows carry the interval of their difference from the constant; excl marks the one that excludes zero. */
  diff: boolean; excl: boolean;
  /** The plate readout for this row, with its interval. */
  say: string;
  /** Its label line, its marks, its marker, and the two ends of its interval. */
  ly: number; y: number; x: number; lo: number; hi: number;
}
interface ChartG {
  rows: RowG[]; note: number | null;
  top: number; f1: number; f2: number; refX: number; axis: Axis;
  tie: { d: string } | null;
  cells: { pitch: number; x0: number; y: number; size: number };
}
interface Geo {
  w: 0 | 1; H: number; cap: number; r: number;
  charts: ChartG[];
  picks: number; picksSay: string;
  /** The plate readout's lines for the scroll story. Every number in them is written with the data, in the component. */
  story: { start: string; refs: string; ref: [string, string]; lead: string; first: string; excl: string; stay: string };
}
/** When a height in the drawing comes clear of the plate's edge, as a fraction of the story. */
type Clear = (y: number) => number;

const NS = "http://www.w3.org/2000/svg";
/** The house curves: for anything coming to rest, and for one state changing to another (motion.ts registers them). */
const arrive = gsap.parseEase("arrive"), swap = gsap.parseEase("swap");
const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** A pick is a dot this share of its cell before it opens. */
const SEED = 0.3;
/** Seconds the router takes over one task, and the share of that the cursor spends moving to it. */
const ASK = 0.125, MOVE = 0.55;
/** How long a task stays lit after it is asked about, and how long the ring round a tied marker lasts. */
const LIT = 0.42, TIED = 0.9;
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
/** A marker opening to its radius where it stands. */
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

type Pick = { c: number; i: number } | "picks" | null;
type Hit = { hit: SVGRectElement; k: NonNullable<Pick> };

/** What a picked part reads out. The lines are written with the data, in the component. */
const describe = (G: Geo, k: NonNullable<Pick>) => (k === "picks" ? G.picksSay : G.charts[k.c].rows[k.i].say);

/** Wire one layout. Everything positional comes from that layout's own geometry. */
function bind(svg: SVGSVGElement) {
  const G: Geo = JSON.parse(svg.dataset.g!);
  const S = G.story;
  const make = <K extends keyof SVGElementTagNameMap>(tag: K, cls: string) => {
    const el = document.createElementNS(NS, tag);
    el.setAttribute("class", cls);
    el.style.opacity = "0";
    return el;
  };

  const sep = svg.querySelector<SVGPathElement>(".sep");

  const charts = qa<SVGGElement>(svg, ".chart").map((g, ci) => {
    const d = G.charts[ci];
    const ref = q<SVGLineElement>(g, ":scope > .ref");
    const refLen = d.axis.y - d.top;
    const trackLen = d.axis.x1 - d.axis.x0;
    const tracks = qa<SVGLineElement>(g, ".trk");
    let whiskers = 0;
    const rows = qa<SVGGElement>(g, ".row").map((el, i) => {
      const dot = q<SVGCircleElement>(el, ".dot"), caps = el.querySelector<SVGPathElement>(".dcaps");
      return {
        el, d: d.rows[i], i, track: tracks[i],
        rl: q<SVGTextElement>(el, ".rl"), stem: q<SVGLineElement>(el, ".stem"), dot, r: Number(dot.getAttribute("r")),
        rv: el.querySelector<SVGTextElement>(".rv"), dv: el.querySelector<SVGTextElement>(".dv"),
        // A stem's length, a marker's place and an interval's ends are the server's and are never written.
        wh: el.querySelector<SVGLineElement>(".dwh"), caps, capsD: caps?.getAttribute("d") ?? "",
        gap: el.querySelector<SVGLineElement>(".gap"),
        // Intervals are shown one after another, top to bottom.
        wi: d.rows[i].diff ? whiskers++ : -1,
        drop: null as SVGLineElement | null,
      };
    });
    const tieb = g.querySelector<SVGGElement>(".tieb");
    const brk = tieb?.querySelector<SVGPathElement>(".brk") ?? null;
    const note = g.querySelector<SVGGElement>(".foot.note");
    const picks = g.querySelector<SVGGElement>(".foot.picks");
    // A ring for each marker the fitted router ties: made once, opened when it has answered every task.
    const rings = rows.filter((r) => r.d.tie).map((r) => {
      const el = make("circle", "tied");
      el.setAttribute("cx", String(r.d.x));
      el.setAttribute("cy", String(r.d.y));
      r.el.append(el);
      return { el, r: r.r };
    });
    return {
      g, d, ci, ref, refLen, trackLen, rows, tieb, brk, brkD: brk?.getAttribute("d") ?? "", whiskers, rings,
      scale: scaleOf(q<SVGGElement>(g, ".scale"), d.axis),
      colh: g.querySelector<SVGTextElement>(".colh"),
      tieText: tieb ? qa<SVGTextElement>(tieb, "text") : [],
      otag: g.querySelector<SVGGElement>(".otag"),
      otagText: g.querySelector<SVGTextElement>(".otag text"),
      note: note && { g: note, body: q<SVGGElement>(note, ".nb") },
      picks: picks && {
        g: picks, fl: q<SVGTextElement>(picks, ".fl"), fv: q<SVGTextElement>(picks, ".fv"),
        slots: q<SVGPathElement>(picks, ".cells-bg"), on: q<SVGPathElement>(picks, ".cells-on"), scan: q<SVGRectElement>(picks, ".scan"),
      },
      // The plan for this chart: a window for every part.
      W: {} as Record<string, Win>, Wrl: [] as Win[], Wtrk: [] as Win[], Wland: [] as Win[], Wval: [] as Win[], Wwh: [] as Win[], Wcap: [] as Win[], Wdv: [] as Win[], Wtie: [] as Win[],
    };
  });
  const depth = charts[0], ret = charts[1], pk = ret.picks!;

  // The strip of 39 picks: where each one's centre is, and its path at each step of opening.
  const K = ret.d.cells, HALF = K.size / 2, onD = pk.on.getAttribute("d")!;
  const STEPS = 30;
  const stripAt: string[] = [];
  function strip(w: number) {
    const k = Math.round(w * STEPS);
    if (k >= STEPS) return str(pk.on, "d", onD);
    if (stripAt[k] === undefined) {
      let d = "";
      for (let j = 0; j < G.picks; j++) {
        // Every pick is on the strip from the first frame; they open from the left, a little apart.
        const at = (j / (G.picks - 1)) * 0.55;
        const h = HALF * (SEED + (1 - SEED) * arrive(phase(k / STEPS, at, at + 0.45)));
        const x = K.x0 + j * K.pitch + HALF, y = K.y + HALF;
        d += `M${(x - h).toFixed(2)} ${(y - h).toFixed(2)}h${(2 * h).toFixed(2)}v${(2 * h).toFixed(2)}h${(-2 * h).toFixed(2)}z`;
      }
      stripAt[k] = d;
    }
    str(pk.on, "d", stripAt[k]);
  }
  // The light under the cursor: a few squares, made once and after that only placed.
  const lit = Array.from({ length: 4 }, () => {
    const el = make("rect", "lit");
    el.setAttribute("width", String(K.size));
    el.setAttribute("height", String(K.size));
    el.setAttribute("y", String(K.y));
    pk.scan.before(el);
    return el;
  });

  // What the story has finished drawing: each chart's rows, and the picks strip.
  const st = { rows: [false, false], picks: false };

  // ---------- the plan: when each part plays ----------
  // Every window is a stretch of the story, [from, to], as fractions of it.
  // They are worked out from where each part sits in the plate, each time the
  // page is measured: `c(y)` is when height y of the drawing has come clear of
  // the plate's edge, and R is the story's length in px of scroll.
  let Wsep: Win = [0, 1];
  /** The plate readout's lines, each with the moment the story has earned it. */
  let lines: [number, string][] = [[-1, S.start]];
  let drawn = -1, said = S.start;
  function plan(c: Clear, R: number) {
    const d = (px: number) => px / R;
    const w = (at: number, px: number): Win => [at, at + d(px)];
    Wsep = [c(0), c(G.H)];
    let before = 0; // when the chart above this one began to be measured (stacked)
    for (const ch of charts) {
      const D = ch.d, W = ch.W, last = D.rows[D.rows.length - 1];
      // Set out, as the sheet comes out: each row's name and its track, the
      // constant drawn down the chart at the pace of the sheet, then the scale.
      ch.Wrl = D.rows.map((r) => w(c(r.ly + 8), 64));
      ch.Wtrk = D.rows.map((r) => w(c(r.y + 4), 72));
      const r0 = c(D.top + 6), r1 = Math.max(c(D.axis.y + 4), r0 + d(40));
      W.ref = [r0, r1];
      W.axis = w(c(D.axis.y + 20), 96);
      // The constant is marked and named once the line has passed its row.
      const mine = D.rows.find((r) => r.ref)!;
      W.refDot = w(c(mine.y + 12), 40);
      W.refVal = w(W.refDot[1], 36);

      // Then the measurements, once every row is clear. Each policy comes up
      // whole, its stem at full length with its marker at the end, then its
      // value: the nearest to the constant first, so a policy that ties it is
      // marked on the line before any stem shows.
      const a0 = Math.max(c(last.y + 12), W.refVal[1] - d(20), before);
      W.a0 = [a0, a0];
      before = a0 + d(G.w ? 0 : 120);
      ch.Wland = D.rows.map((r) => w(a0 + d(8) + d(80) * r.t, 36));
      ch.Wval = ch.Wland.map((x) => w(x[1], 30));
      if (ch.ci === 0) {
        // Depth: the interval of each difference, whole, one after another
        // from the top (each after its own marker has landed), then its numbers.
        W.colh = w(a0 + d(70), 40);
        ch.Wwh = D.rows.map((_, i) => w(a0 + d(78) + Math.max(0, ch.rows[i].wi) * d(10), 36));
        ch.Wcap = ch.Wwh.map((x) => w(x[0] + d(8), 40));
        ch.Wdv = ch.Wcap.map((x) => w(x[1], 30));
        // Where an interval stops short of the constant, the stem gives way to
        // a dotted gap: what is left between the whisker and the line.
        const shut = Math.max(...ch.Wcap.map((x) => x[1]));
        W.gap = w(shut, 28);
        W.note = w(Math.max(c(D.f2 + 10), W.gap[1]), 44);
      } else {
        // Return: the oracle is named, the three tied policies are bracketed,
        // then the router's 39 picks open along their strip, and are tallied.
        const oracle = D.rows.findIndex((r) => r.oracle);
        W.otag = w(ch.Wland[oracle][1], 40);
        W.tie = w(a0 + d(100), 40);
        ch.Wtie = ch.tieText.map((_, n) => w(W.tie[1] + n * d(12), 36));
        W.fl = w(Math.max(c(D.f1 + 10), a0 + d(200)), 40);
        W.slots = w(Math.max(c(D.f2 + 10), a0 + d(214)), 30);
        W.strip = w(W.slots[0] + d(24), 56);
        W.tally = w(W.strip[1], 30);
      }
    }
    // If the window is too short for all of that, what follows the first
    // measurement is drawn closer together, so the story still ends on time.
    // (A part may then be drawn a little before the sheet reaches it, and is
    // let out with it.)
    const all = charts.flatMap((ch) => [...Object.values(ch.W), ...ch.Wrl, ...ch.Wtrk, ...ch.Wland, ...ch.Wval, ...ch.Wwh, ...ch.Wcap, ...ch.Wdv, ...ch.Wtie]);
    const first = depth.W.a0[0], end = Math.max(...all.map((x) => x[1]));
    if (end > 1 && first < 1) {
      const k = (1 - first) / (end - first);
      for (const x of all) for (let i = 0; i < 2; i++) if (x[i] > first) x[i] = first + (x[i] - first) * k;
    }
    // The readout holds the latest thing the story has shown, and moves on only
    // once the next number is on the plate: the constant, the best policy's
    // value, its interval, the interval that excludes zero and its gap, the 39
    // picks. Stacked, the second chart follows the first: its constant, then its tie.
    const top = depth.rows[0], gapped = depth.W.gap[1];
    lines = [[-1, S.start], [depth.Wland[top.i][1], S.lead], [depth.Wdv[top.i][1], S.first], [gapped, S.excl], [ret.W.strip[1], G.picksSay]];
    if (G.w) lines.push([Math.max(depth.W.refVal[1], ret.W.refVal[1]), S.refs]);
    else lines.push([depth.W.refVal[1], S.ref[0]], [Math.max(ret.W.refVal[1], gapped + 1e-4), S.ref[1]], [Math.max(...ret.Wval.map((x) => x[1])), S.stay]);
    spaced(lines, d(84));
    drawn = -1;
  }
  // Until the page has been measured: a plan that draws nothing early.
  plan((y) => 0.1 + (0.5 * y) / G.H, 600);

  /** The scroll story at progress p. Returns the line for the plate readout. */
  function render(p: number): string {
    if (p === drawn) return said;
    drawn = p;
    const u = (x: Win) => phase(p, x[0], x[1]);
    if (sep) draw(sep, G.H, u(Wsep));
    for (const ch of charts) {
      const W = ch.W;
      draw(ch.ref, ch.refLen, u(W.ref));
      rule(ch.scale, u(W.axis));
      const clear = W.gap ? u(W.gap) : 0;
      for (const r of ch.rows) {
        rise(r.rl, u(ch.Wrl[r.i]));
        draw(r.track, ch.trackLen, u(ch.Wtrk[r.i]));
        if (r.d.ref) {
          openDot(r.dot, r.r, u(W.refDot));
          if (r.rv) rise(r.rv, u(W.refVal), 3);
          op(r.stem, 0);
        } else {
          const shown = u(ch.Wland[r.i]);
          openDot(r.dot, r.r, shown);
          // The stem of the one interval that excludes zero later gives way to a dotted gap.
          op(r.stem, r.d.t ? shown * 2.2 * (1 - (r.gap ? clear : 0)) : 0);
          if (r.rv) rise(r.rv, u(ch.Wval[r.i]), 3);
        }
        if (r.wh && r.caps) {
          op(r.wh, u(ch.Wwh[r.i]));
          const spread = u(ch.Wcap[r.i]);
          if (moved(r.caps, "u", spread)) {
            const cap = G.cap * arrive(spread), y0 = (r.d.y - cap).toFixed(2), span = (2 * cap).toFixed(2);
            str(r.caps, "d", spread >= 1 ? r.capsD : `M${r.d.lo} ${y0}v${span}M${r.d.hi} ${y0}v${span}`);
          }
          op(r.caps, spread * 3);
          if (r.dv) rise(r.dv, u(ch.Wdv[r.i]), 3);
        } else if (r.dv) {
          rise(r.dv, u(ch.Wwh[r.i] ?? W.colh), 3); // the reference row's own note
        }
        if (r.gap) op(r.gap, clear);
      }
      if (ch.colh) rise(ch.colh, u(W.colh), 3);
      if (ch.otagText) rise(ch.otagText, u(W.otag), 3);
      if (ch.brk) {
        // The bracket spans the three tied policies, so it is set whole, its two hooks opening; then it is labelled.
        const set = u(W.tie);
        op(ch.brk, set * 2.2);
        if (moved(ch.brk, "u", set)) str(ch.brk, "d", set >= 1 ? ch.brkD : ch.brkD.replace(/h(-?)4/g, (_, sign) => `h${sign}${(4 * arrive(set)).toFixed(2)}`));
        ch.tieText.forEach((t, n) => rise(t, u(ch.Wtie[n]), 3));
      }
      if (ch.note) rise(ch.note.body, u(W.note));
      if (ch.picks) {
        rise(ch.picks.fl, u(W.fl), 3);
        // The 39 picks: their slots, then every one of them at once, a dot opening to its cell; then their tally.
        op(ch.picks.slots, u(W.slots));
        const open = u(W.strip);
        op(ch.picks.on, open * 5);
        if (moved(ch.picks.on, "w", Math.round(open * STEPS) / STEPS)) strip(open);
        rise(ch.picks.fv, u(W.tally), 3);
      }
    }
    st.rows[0] = p >= Math.max(...depth.Wdv.map((x) => x[1]));
    st.rows[1] = p >= Math.max(...ret.Wval.map((x) => x[1]), ret.Wtie.length ? ret.Wtie[ret.Wtie.length - 1][1] : 0);
    st.picks = p >= ret.W.tally[1];
    said = lines[0][1];
    for (const [at, text] of lines) if (p >= at) said = text;
    return said;
  }

  // ---------- ambient: the router is asked, task by task ----------
  let seed = 0x7a3c19;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const PASS = G.picks * ASK; // seconds to ask about every task
  let clock = -0.6, rest = 1.7, life = 0;
  const xOf = (j: number) => K.x0 + j * K.pitch;
  function ambient(dt: number, on: boolean) {
    if (!on && life === 0) return;
    // The cursor comes up and goes down over a few frames; it never appears or leaves in one.
    life = clamp(life + (on ? dt : -dt) / 0.25);
    clock += dt;
    if (clock > PASS + TIED + rest) {
      clock = -0.3;
      rest = 1.4 + rnd() * 1.2;
    }
    // Which task is being asked about, and how far the cursor has got towards it.
    const at = clock / ASK, k = Math.min(G.picks - 1, Math.floor(at));
    const asking = clock >= 0 && clock < PASS + 0.12;
    if (asking) {
      const part = at - Math.floor(at);
      const x = k === 0 || at >= G.picks ? k : k - 1 + swap(Math.min(1, part / MOVE));
      num(pk.scan, "x", xOf(x) - 2);
      // It fades in on the first task and out after the last.
      op(pk.scan, Math.min(1, (clock + 0.02) / 0.12, (PASS + 0.12 - clock) / 0.12) * life);
    } else op(pk.scan, 0);
    // Each task is lit as it is asked about, and lets go over a few more.
    for (let n = 0; n < lit.length; n++) {
      const el = lit[n], j = k - n, since = clock - j * ASK - ASK * MOVE;
      if (clock < 0 || j < 0 || since < 0 || since > LIT) {
        op(el, 0);
        continue;
      }
      num(el, "x", xOf(j));
      op(el, Math.min(1, since / 0.05) * (1 - since / LIT) * life);
    }
    // All 39 to one agent: so the fitted router is the constant, and so is "always single agent".
    const tied = (clock - PASS) / TIED;
    for (const ring of ret.rings) {
      if (tied <= 0 || tied >= 1) op(ring.el, 0);
      else {
        num(ring.el, "r", ring.r + 1.5 + 6.5 * arrive(tied));
        op(ring.el, 0.85 * Math.min(1, tied * 7) * (1 - tied) * life);
      }
    }
  }

  // ---------- reading ----------
  // What is not being read steps back, on the page's clock and its curve, and
  // a change of mind part-way is taken up from where each part has got to. The
  // row being read drops a line from its marker to the scale.
  type Part = { el: SVGElement; level: (k: NonNullable<Pick>) => number; rest: number; now: number; from: number; to: number };
  const parts: Part[] = [];
  const part = (el: SVGElement, level: Part["level"], rest = 1) => parts.push({ el, level, rest, now: rest, from: rest, to: rest });
  charts.forEach((ch, ci) => {
    const here = (k: NonNullable<Pick>) => (k !== "picks" && k.c === ci ? ch.rows[k.i] : null);
    for (const r of ch.rows) {
      part(r.el, (k) => (here(k) === r ? 1 : DIM));
      // The drop from this row's marker to the scale, clear of the marker itself.
      const drop = make("line", r.d.ref ? "drop acc" : "drop");
      drop.setAttribute("x1", String(r.d.x));
      drop.setAttribute("x2", String(r.d.x));
      drop.setAttribute("y1", String(r.d.y + r.r + 3));
      drop.setAttribute("y2", String(ch.d.axis.y));
      ch.g.querySelector(".scale")!.after(drop);
      part(drop, (k) => (here(k) === r ? 1 : 0), 0);
    }
    if (ch.tieb) part(ch.tieb, (k) => (k === "picks" || here(k)?.d.tie ? 1 : DIM));
    if (ch.otag) part(ch.otag, (k) => (here(k)?.d.oracle ? 1 : DIM));
    if (ch.note) part(ch.note.g, (k) => (here(k) && here(k)!.i === ch.d.note ? 1 : DIM));
    if (ch.picks) part(ch.picks.g, (k) => (k === "picks" ? 1 : DIM));
  });
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
  /** A part can be read only once the story has drawn it. */
  const ready = (k: NonNullable<Pick>) => (k === "picks" ? st.picks : st.rows[k.c]);

  // The hit targets sit in their own layer, in reading order. The depth note
  // carries its row's key, so it reads out as that row.
  const hits: Hit[] = qa<SVGRectElement>(svg, ".hits .hit").map((hit) => ({
    hit, k: hit.dataset.k === "picks" ? "picks" : { c: Number(hit.dataset.c), i: Number(hit.dataset.i) },
  }));
  return { svg, G, plan, render, ambient, mark, ready, st, hits, keys: hits.filter((h) => h.hit.hasAttribute("tabindex")) };
}

export default function (root: HTMLElement) {
  const svgs = qa<SVGSVGElement>(root, "svg.ro"); // side by side, then stacked
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
  const same = (a: Pick, b: Pick) => (a && b && typeof a === "object" && typeof b === "object" ? a.c === b.c && a.i === b.i : a === b);

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

  let timer = 0, away = 0;
  function set(next: Pick) {
    clearTimeout(timer);
    clearTimeout(away);
    if (same(pick, next)) return;
    pick = next;
    live.mark(pick);
    say(pick ? describe(live.G, pick) : story);
  }
  /** What shows when the pointer leaves: a held reading, else the focused part, else the story. */
  const rest = (): Pick => held ?? (kb && kb.v.ready(kb.k) ? kb.k : null);
  // Leaving one part for the next passes over its edge; the reading holds for
  // that instant, so the rest of the figure does not come up and go down again.
  const leave = () => {
    clearTimeout(away);
    away = window.setTimeout(() => set(rest()), 90);
  };

  function render() {
    story = live.render(p + (1 - p) * force.v);
    // The focused part reads out as soon as its mark exists.
    if (kb && !kb.said && kb.v.ready(kb.k)) {
      kb.said = true;
      set(kb.k);
      announce(describe(live.G, kb.k));
    }
    say(pick ? describe(live.G, pick) : story);
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

  // Pointer, touch or keyboard: a row or a footer writes its exact numbers to the readout.
  function wire(v: View) {
    v.svg.dataset.live = "";
    v.svg.setAttribute("aria-label", "Plot. Arrow keys move through its parts.");
    // Every hit target answers to the pointer, and the plate readout takes over from its tooltip.
    v.hits.forEach(({ hit, k }) => {
      hit.querySelector("title")?.remove();
      const over = (e: PointerEvent) => {
        if (e.pointerType !== "mouse" || !v.ready(k)) return;
        set(k);
      };
      hit.addEventListener("pointerenter", over);
      // A part can finish drawing under a pointer that is already resting on it.
      hit.addEventListener("pointermove", over);
      hit.addEventListener("pointerleave", (e) => e.pointerType === "mouse" && leave());
      hit.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" || !v.ready(k)) return;
        if (same(pick, k)) return set(rest());
        set(k);
        // A finger lifts at once, so its reading stays up for a moment.
        timer = window.setTimeout(() => set(rest()), 2600);
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
            if (!v.ready(k)) return;
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
  }).observe(q<HTMLElement>(root, ".ro-box"));

  // The cursor steps only in the layout on screen, and only while the plate is.
  whileVisible(root, (dt) => live.ambient(dt, live.st.picks && pick !== "picks"));

  // Leaving the figure lets the scroll story take the drawing back, unless a reading is held.
  root.addEventListener("focusout", (e) => {
    if (!held && !root.contains(e.relatedTarget as Node | null)) finish(false);
  });
}
