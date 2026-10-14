import { gsap, ScrollTrigger, scrubbed, whileVisible, phase, q, qa } from "../motion";

// Fig. "delegation": the depth campaign of the NeurIPS 2026 workshop paper.
//
// Scroll: one scrubbed clock. The plate lets its sheet out from the top as it
// comes into the window, and the figure is drawn on the sheet as it comes, a
// row at a time. A row's name rises and its reading line is ruled as the row
// clears; its tree grows down at the pace of the sheet, each edge carrying the
// task that calls its child into being; when the last level stands the row's
// cost lands, and then its return. The next row's tree is already growing by
// then, so two or three parts are always at work. The cost of a fix closes
// the story. When each part plays is worked out from where it sits in the
// plate and how tall the window is, so the drawing follows the sheet and does
// not run ahead of it, on a phone or a wall.
//
// Every state the story can be stopped in is true. Structure draws: an edge
// may be half-way down its tree, the leader through it part-way along. A mark
// that measures something never does. The token bars, the wall-clock lines,
// the refused share, the estimates and their intervals keep the size and
// place the server gave them; they arrive whole, by opacity. A number is only
// ever a measured one, set once in the markup and never counted up, and it
// appears when its mark is fully there.
//
// So inside the two plots the script changes nothing along a scale. Besides
// opacity it writes a rise of a few units into the row, the height of an
// interval's end caps, the radius of a dot, and the zero line drawing down
// the plot. The one thing that travels along a scale is light: a glint over
// the cells of a bar that is already there from end to end.
//
// Ambient: every grown tree keeps working, and picks up where its growing
// left off: the tasks have just arrived, so the leaves are at work. Each node
// keeps its own time. A leaf works for as long as it takes and hands its patch
// up; a parent merges once both of its children have reported, and refuses
// the arm's measured share of what it is handed; the root delivers. A cycle
// lasts the arm's wall-clock multiple, so the larger trees take that much
// longer, and as its root delivers each arm's wall-clock line brightens,
// whole, and a ring opens round the estimate that delivery is graded into.
// No two cycles are timed alike.
//
// Reading a row: the mouse over it, the keyboard on it (Tab, then the arrows)
// or a hold (click, tap, Enter, Space) lights that arm across the columns and
// puts its numbers in the readout, and never more of them than is shown.

// Geometry and data for one layout, serialised by Delegation.astro.
interface ArmG {
  n: number; d: number; tok: number; wall: number; ref: number;
  ring: number; lv: number[][]; segs: number[][]; el: number[];
  R: number; wy: number; ry: number; cap: number;
  eff: [number, number, number] | null;
  rd: [string, string, string]; who: string; tokS: string;
  /** The arm in words, for its control; the control's box over the drawing, and over its lane, in percent. */
  say: string; box: [number, number]; lane: [number, number] | null;
}
/** "side": the whole figure is on screen together. "stack": the forest plot arrives later, further down. */
type Mode = "side" | "stack";
interface Geo {
  w: 0 | 1; kx: number;
  /** Which drawing holds the trees and cost, the cost of a fix, and the forest plot; and each drawing's height. */
  in: { cost: number; co: number; ret: number }; hs: number[];
  /** Heights the story is timed by: the forest plot's top and foot, the cost of a fix, the key, and how far a row's small print hangs below it. */
  ys: { top: number; bottom: number; co: number; key: number; sub: number };
  fix: string;
  arms: ArmG[];
}
/** A stretch of the scroll story, as two fractions of it. */
type Win = [number, number];
/** When a height in one of a layout's drawings comes clear of the plate's edge, as a fraction of the story. */
type Clear = (drawing: number, y: number) => number;

const NS = "http://www.w3.org/2000/svg";
/** Seconds one agent takes for a cycle; every tree's cycle is this times its wall-clock multiple. */
const T0 = 2.3;
/** Where a cycle spends its time: tasks go down, the leaves work, patches come up, the root delivers. */
const DOWN = [0.04, 0.4] as const;
const WORK = [0.4, 0.52] as const;
const UP = [0.52, 0.88] as const;
const DELIVER = 0.9;
/** Of the time a level has, how much a handoff spends on the edge; the rest is each node's own delay. */
const ON_EDGE = 0.75;
/** Seconds a ring takes to let go once a node has received or merged. */
const FLASH = 0.5;
/** The strength a bar holds, whole, while the glint crosses it; then every cell settles at full strength together. */
const HELD = 0.55;
/** How far the arms that are not being read step back, and how long that takes. */
const DIM = 0.28, FOCUS = 0.32;
/**
 * The story begins as the plate's top passes START of the window's height. The
 * plate lets its sheet out at a line near the foot of the window; a part is
 * clear of it, and can be drawn, at CLEAR of the window's height.
 */
const START = 0.85, CLEAR = 0.92;

/** The house curve for anything coming to rest (motion.ts registers it). */
const arrive = gsap.parseEase("arrive");
const smooth = (u: number) => u * u * (3 - 2 * u);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const disc = (x: number, y: number, r: number) =>
  `M${(x - r).toFixed(2)} ${y}a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(2 * r).toFixed(2)} 0a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(-2 * r).toFixed(2)} 0Z`;

/** An element with its last written opacity, so the loops only touch the DOM on change. */
interface Fade<T extends SVGElement = SVGElement> { el: T; o: number }
/** A node's ring: a circle that can be drawn part of the way round, clockwise from the top. c is its length; turn, how much of it is drawn. */
interface Ring extends Fade<SVGCircleElement> { c: number; turn: number }
function sweep(r: Ring, turn: number) {
  if (Math.abs(turn - r.turn) < 0.002) return;
  r.turn = turn;
  r.el.style.strokeDashoffset = (r.c * (1 - turn)).toFixed(2);
}
const fade = <T extends SVGElement>(el: T): Fade<T> => ({ el, o: -1 });
function show(f: Fade, v: number) {
  if (Math.abs(v - f.o) < 0.004) return;
  f.o = v;
  f.el.style.opacity = v.toFixed(2);
}
const op = (el: Element | null, v: number) => {
  if (el) (el as SVGElement).style.opacity = v <= 0 ? "0" : v >= 1 ? "1" : v.toFixed(3);
};
/** A short rise into place, y units down the page easing to none. It moves a mark within its row, never along its scale. */
const lift = (el: SVGElement | null, y: number) => {
  if (el) el.style.transform = y > 0.01 ? `translateY(${y.toFixed(2)}px)` : "";
};
/** Type or a mark coming up into its row as it appears. */
const rise = (el: SVGElement | null, u: number, by: number) => {
  op(el, u * 1.7);
  lift(el, by * (1 - arrive(u)));
};
/**
 * A stroke drawn on along its own length: u from 0 (nothing) to 1 (all of it).
 * Once it is all drawn it is left as the server drew it, with no dash on it at all.
 */
const pen = (el: SVGElement, len: number, u: number) => {
  el.style.strokeDasharray = u < 1 ? `${len} ${len}` : "";
  el.style.strokeDashoffset = u < 1 ? (len * (1 - u)).toFixed(2) : "";
  op(el, u > 0 ? 1 : 0);
};
/** Opacity for a span of text: it fades through its fill, and its halo with it. */
const ink = (el: SVGTSpanElement, v: number) => {
  el.style.fillOpacity = el.style.strokeOpacity = v <= 0 ? "0" : v >= 1 ? "1" : v.toFixed(3);
};

/** Half of a bar's glint: a copy of the bar, dashed so that it paints one cell of it. j is the cell. */
interface Glint extends Fade<SVGLineElement> { j: number }

interface Packet extends Fade<SVGRectElement> {
  /** The child node this edge leads to; the edge's level; its two ends. */
  n: number; k: number; px: number; py: number; cx: number; cy: number;
  /** 0 hidden, 1 a task going down, 2 a patch coming up, 3 a refused patch. */
  mode: number;
}
/** The task that rides the tip of an edge while the tree is growing. */
interface Tip extends Fade<SVGCircleElement> { k: number; px: number; py: number; cx: number; cy: number }

/** Wire one layout. An arm's parts may sit in more than one drawing, so they are found by arm index. */
function bind(el: HTMLElement) {
  const G: Geo = JSON.parse(el.dataset.g!);
  const wide = G.w === 1;
  const svgs = qa<SVGSVGElement>(el, "svg");
  /** How far a bar and its numeral rise into their row as they appear, and the wall-clock line and its numeral under them. */
  const up = wide ? 5 : 4, upW = 3;
  const S1 = wide ? 5.4 : 4.4, S2 = wide ? 5.8 : 4.8;

  const zero = q<SVGLineElement>(el, ".zero");
  const zeroLen = Number(zero.dataset.len);
  const gain = q<SVGRectElement>(el, ".gain");
  const zt = q<SVGGElement>(el, ".zt");
  const verdict = q<SVGTextElement>(el, ".verdict");
  const co = q<SVGGElement>(el, ".co");
  const coR = q<SVGLineElement>(el, ".co-r"), coM = q<SVGTextElement>(el, ".co-m");
  const coLen = Number(coR.getAttribute("x2")) - Number(coR.getAttribute("x1"));
  // The two costs and the arrow between them are spans of one line of text.
  const co0 = q<SVGTSpanElement>(el, ".co-0"), coAr = q<SVGTSpanElement>(el, ".co .ar"), co1 = q<SVGTSpanElement>(el, ".co-1");
  const lg = q<SVGGElement>(el, ".lg");

  // The rows are inspected through real controls laid over the drawings: a
  // button per arm over its row, which the keyboard reaches and a screen
  // reader names with the arm's numbers, and where the forest plot is its own
  // drawing, a plain target over the arm's lane there too.
  const panA = q<HTMLElement>(el, ".pw, .pa");
  const panB = el.querySelector<HTMLElement>(".pb");
  const over = (pan: HTMLElement, tag: "button" | "div", cls: string, [top, height]: [number, number]) => {
    const node = document.createElement(tag);
    node.className = cls;
    node.style.top = `${top}%`;
    node.style.height = `${height}%`;
    pan.append(node);
    return node;
  };

  const arms = G.arms.map((A, i) => {
    const maybe = <T extends Element = SVGElement>(s: string) => el.querySelector<T>(`.arm[data-i="${i}"] ${s}`);
    const need = <T extends Element = SVGElement>(s: string) => {
      const found = maybe<T>(s);
      if (!found) throw new Error(`figure element missing: arm ${i} ${s}`);
      return found;
    };
    const rlA = need<SVGLineElement>(".rl-a");
    const rlB = maybe<SVGLineElement>(".rl-b");
    const rlD = need<SVGLineElement>(".rl-d");
    const egs = qa<SVGPathElement>(el, `.arm[data-i="${i}"] .eg`);
    const nds = qa<SVGPathElement>(el, `.arm[data-i="${i}"] .nd`);
    const tok = need<SVGTextElement>(".tok");
    const wlab = need<SVGTextElement>(".wlab");
    const wh = maybe<SVGPathElement>(".wh");
    const est = maybe<SVGCircleElement>(".est");
    const ref = maybe<SVGCircleElement>(".ref");
    const rr = need<SVGCircleElement>(".rr");
    // The interval's ends, as drawn by the server: the story never moves them.
    const whD = wh?.getAttribute("d") ?? "";
    const ends = /M(-?[\d.]+) [\d.]+H(-?[\d.]+)/.exec(whD);
    const row = over(panA, "button", "row", A.box) as HTMLButtonElement;
    row.type = "button";
    row.setAttribute("aria-label", A.say);
    row.setAttribute("aria-pressed", "false");
    const nodes = 2 ** (A.d + 1) - 1;
    return {
      i, A, nodes,
      groups: qa<SVGGElement>(el, `.arm[data-i="${i}"]`),
      row, lane: A.lane && panB ? over(panB, "div", "lane", A.lane) : null,
      rlA, rlAx: [rlA.x1.baseVal.value, rlA.x2.baseVal.value],
      rlB, rlD,
      lb: need(".lb"), nl: maybe(".nl"), pt: maybe(".pt"), an: maybe(".an"),
      egs, nds, ndD: nds.map((n) => n.getAttribute("d")!), ndAt: nds.map(() => -1), rr, rrR: rr.r.baseVal.value,
      tr: need<SVGGElement>(".tr"), pkLayer: need<SVGGElement>(".pk"),
      // The bar and the wall-clock line are read here and never written: their ends are the measurements.
      bar: need<SVGLineElement>(".bar"), cells: Math.ceil(A.tok - 1e-6), gl: null as [Glint, Glint] | null,
      // Each numeral keeps the text and the place the server gave it; a fade and a short rise bring it in.
      tok, wl: need<SVGLineElement>(".wl"), wt: need<SVGLineElement>(".wt"), wlab,
      dtl: maybe(".dtl"), gdC: maybe<SVGLineElement>(".gd-c"),
      wh, whD, xl: ends ? ends[1] : "", xh: ends ? ends[2] : "", capNow: A.cap,
      est, estR: est ? est.r.baseVal.value : 0,
      ref, refR: ref ? ref.r.baseVal.value : 0,
      nm: need(".nm"), zl: maybe(".zl"), fxB: maybe<SVGGElement>("g.fx"),
      // The plan: a window of the story for every part of this arm, and the three moments its readout turns on.
      w: {} as Record<string, Win>, we: [] as Win[], wn: [] as Win[],
      begins: 2, costAt: 2, fullAt: 2, grownAt: 2,
      begun: false, cost: false, full: false, shown: -1,
      // The tasks that ride the growing edges.
      tips: null as Tip[] | null,
      // ambient state
      live: false, made: false, life: 0, again: false, t: 0, D: T0 * A.wall, acc: 0.5, seed: (A.n * 2654435761) >>> 0,
      /** Seconds since this arm's root last delivered. */
      since: 99,
      pk: [] as Packet[], rings: [] as Ring[],
      // When, as a share of the cycle, each node's task leaves its parent and arrives, and its patch leaves and arrives.
      tDep: new Float32Array(nodes), tArr: new Float32Array(nodes), tUp: new Float32Array(nodes), tUpArr: new Float32Array(nodes),
      no: new Uint8Array(nodes), deck: new Int16Array(Math.max(0, nodes - 1)),
      del: null as Fade<SVGCircleElement> | null, wp: null as Fade<SVGPathElement> | null, er: null as Fade<SVGCircleElement> | null,
    };
  });
  type ArmV = (typeof arms)[number];

  // ---------- the plan: when each part plays ----------
  // Every window is a stretch of the story, [from, to], as fractions of it.
  // They are worked out from where each part sits in the plate, each time the
  // page is measured: `c(drawing, y)` is when height y of a drawing has come
  // clear of the plate's edge, and R is the story's length in px of scroll.
  const W: Record<string, Win> = {};
  /** The facts the story finishes, in the order it finishes them; the readout reports the latest and nothing still being drawn. */
  type Fact = { at: number; arm: number; full: boolean };
  let facts: Fact[] = [];
  let drawn = -1, latest: Fact | null = null;
  function plan(c: Clear, R: number) {
    const d = (px: number) => px / R;
    const w = (at: number, px: number): Win => [at, at + d(px)];
    const cA = (y: number) => c(G.in.cost, y), cB = (y: number) => c(G.in.ret, y);

    // The forest plot's frame: zero is drawn down it at the pace of the sheet,
    // with the side a gain would fall on and the three names along its top.
    const z0 = cB(G.ys.top + 6);
    W.zero = [z0, Math.max(cB(G.ys.bottom + 4), z0 + d(40))];
    W.zt = w(z0, 60);
    W.gain = w(z0 + d(24), 80);

    arms.forEach((a, i) => {
      const A = a.A, x = a.w, prev = i ? arms[i - 1] : null;
      // Set out as the row clears: its name, the reading line through its root, the root itself.
      const s = cA(A.R + 10);
      x.lb = w(s, 64);
      x.rl = w(s, 96);
      x.root = w(cA(A.R + A.ring + 6), 44);
      // The tree grows down at the pace of the sheet: a level's edges are
      // drawn while the sheet clears from the level above to this one, and
      // its nodes open as the edges, and the tasks on them, arrive.
      a.we = [];
      a.wn = [x.root];
      for (let k = 1; k <= A.d; k++) {
        const from = Math.max(cA(A.lv[k - 1][0] + 10), a.wn[k - 1][0] + d(14));
        const to = Math.max(cA(A.lv[k][0] + A.lv[k][1] + 6), from + d(34));
        a.we.push([from, to]);
        a.wn.push(w(to - d(12), 40));
      }
      const grown = a.wn[A.d][1];
      a.grownAt = A.d ? a.we[A.d - 1][1] : x.root[1] + d(20);
      x.an = w(grown - d(10), 56);
      // Cost. The bar arrives whole once the tree stands, a beat after the row above's.
      const b0 = Math.max(grown - d(16), prev ? prev.w.bar[0] + d(40) : 0);
      x.bar = w(b0, 64);
      x.wall = w(b0 + d(24), 44);
      x.tok = w(x.bar[1], 36);
      x.wlab = w(x.bar[1] + d(8), 36);
      x.dtl = w(x.bar[1] + d(18), 40);
      x.pt = w(Math.max(cA(A.R + G.ys.sub + 6), x.bar[1] - d(14)), 46);
      x.rlB = w(x.bar[1], 50);
      // Return, as the bar settles: the lane, the estimate where it was measured, its interval, then its numbers.
      const r0 = Math.max(cB(A.ry + 14), x.bar[1] + d(4));
      x.rlD = w(r0, 34);
      x.nl = w(r0, 40);
      if (A.eff) {
        x.est = w(r0 + d(14), 38);
        x.wh = w(r0 + d(30), 34);
        x.caps = w(r0 + d(36), 46);
        x.nm = w(x.caps[1], 36);
        x.zl = w(x.caps[1] + d(8), 36);
      } else {
        x.ref = w(r0 + d(10), 44);
        x.nm = w(x.ref[1], 36);
      }
    });
    const big = arms[arms.length - 1];
    // The cost of a fix closes the cost column, and the verdict the forest plot.
    const k0 = Math.max(c(G.in.co, G.ys.co + 8), big.w.bar[1] + d(8));
    W.coR = w(k0, 44);
    W.coM = w(k0 + d(10), 44);
    W.co0 = w(k0 + d(40), 40);
    W.coAr = w(k0 + d(66), 30);
    W.co1 = w(k0 + d(84), 44);
    W.verdict = w(Math.max((big.w.caps ?? big.w.ref)[1] + d(8), cB(G.ys.bottom - 20)), 50);
    // The key appears with the first tree that has anything to hand back.
    W.lg = w(Math.max(cA(G.ys.key + 6), arms[1].grownAt), 50);

    // If the window is too short for all of that, what follows the first
    // measurement is drawn closer together, so the story still ends on time.
    // (A part may then be drawn a little before the sheet reaches it, and is
    // let out with it.)
    const all = [...Object.values(W), ...arms.flatMap((a) => [...Object.values(a.w), ...a.we, ...a.wn.slice(1)])];
    const first = arms[0].w.bar[0], end = Math.max(...all.map((x) => x[1]));
    const k = end > 1 && first < 1 ? (1 - first) / (end - first) : 1;
    const fit = (v: number) => (v > first ? first + (v - first) * k : v);
    if (k < 1) for (const x of all) { x[0] = fit(x[0]); x[1] = fit(x[1]); }

    facts = [];
    for (const a of arms) {
      a.begins = a.w.lb[0];
      a.costAt = a.w.bar[1];
      a.fullAt = (a.w.caps ?? a.w.ref)[1];
      a.grownAt = fit(a.grownAt);
      a.shown = -1;
      facts.push({ at: a.costAt, arm: a.i, full: false }, { at: a.fullAt, arm: a.i, full: true });
    }
    facts.push({ at: W.co1[1], arm: -1, full: false });
    facts.sort((x, y) => x.at - y.at);
    drawn = -1;
  }

  // ---------- scroll story ----------
  /**
   * The glint that crosses a bar as it arrives: two copies of the bar, each
   * dashed so that it paints a single cell. They keep the bar's own ends, so
   * a lit cell can only be a cell of the finished bar and the last one stops
   * where the bar stops. Made on first use, in the layout that is showing.
   */
  function glint(a: ArmV): [Glint, Glint] {
    const one = parseFloat(a.bar.getAttribute("stroke-dasharray") ?? "") || G.kx;
    const half = (): Glint => {
      const copy = a.bar.cloneNode(false) as SVGLineElement;
      copy.removeAttribute("style");
      copy.setAttribute("class", "gl");
      copy.setAttribute("stroke-dasharray", `${one} 4000`);
      copy.style.opacity = "0";
      return { el: copy, o: 0, j: -1 };
    };
    const pair: [Glint, Glint] = [half(), half()];
    a.bar.after(pair[0].el, pair[1].el);
    return pair;
  }
  /** Light cell j of a bar of n cells at strength w; outside the bar there is nothing to light. */
  function cell(g: Glint, j: number, w: number, n: number) {
    if (j < 0 || j >= n) return show(g, 0);
    if (g.j !== j) {
      g.j = j;
      g.el.style.strokeDashoffset = String(-j * G.kx);
    }
    show(g, w);
  }
  /** The tasks at the tips of an arm's growing edges: one small dot per edge, made on first use. */
  function tipsOf(a: ArmV): Tip[] {
    return (a.tips ??= a.A.segs.map(([k, px, py, cx, cy]) => {
      const dot = document.createElementNS(NS, "circle");
      dot.setAttribute("class", "pkt");
      dot.setAttribute("r", String(S1 / 2));
      dot.style.opacity = "0";
      a.pkLayer.append(dot);
      return { el: dot, o: 0, k, px, py, cx, cy };
    }));
  }

  function renderArm(a: ArmV, p: number) {
    const A = a.A, x = a.w;
    const u = (win: Win) => phase(p, win[0], win[1]);
    // Nothing of this arm moves before its row clears or after its last part has landed.
    const stage = p <= x.lb[0] ? 0 : p >= x.nm[1] + 0.2 ? 2 : 1 + p;
    if (stage === a.shown) return;
    a.shown = stage;

    rise(a.lb, u(x.lb), 4);
    const la = u(x.rl);
    a.rlA.x2.baseVal.value = lerp(a.rlAx[0], a.rlAx[1], la);
    op(a.rlA, la > 0 ? 1 : 0);

    // The tree: the root opens, then one level at a time. Each edge is drawn
    // from its parent with a task at its tip, and the node it leads to opens
    // as the task arrives.
    const root = u(x.root);
    a.rr.r.baseVal.value = lerp(A.lv[0][1], a.rrR, arrive(root));
    op(a.rr, root * 2);
    for (let k = 0; k <= A.d; k++) {
      const open = u(a.wn[k]), node = a.nds[k];
      op(node, open * 2.2);
      // (Its path is rebuilt only while it is opening; once open it is the server's own.)
      const step = Math.round(open * 400);
      if (step === a.ndAt[k]) continue;
      a.ndAt[k] = step;
      if (open >= 1) node.setAttribute("d", a.ndD[k]);
      else {
        const [y, r, ...xs] = A.lv[k];
        const now = r * (0.4 + 0.6 * arrive(open));
        let dd = "";
        for (const cx of xs) dd += disc(cx, y, now);
        node.setAttribute("d", dd);
      }
    }
    let growing = false;
    for (let k = 1; k <= A.d; k++) {
      const e = u(a.we[k - 1]);
      pen(a.egs[k - 1], A.el[k - 1], e);
      if (e > 0 && e < 1) growing = true;
    }
    if (growing || a.tips) {
      for (const tip of tipsOf(a)) {
        const e = u(a.we[tip.k - 1]);
        if (e <= 0 || e >= 1) { show(tip, 0); continue; }
        tip.el.cx.baseVal.value = lerp(tip.px, tip.cx, e);
        tip.el.cy.baseVal.value = lerp(tip.py, tip.cy, e);
        // It comes out from under its parent, and goes in under the child as that opens.
        show(tip, Math.min(1, e * 7, (1 - e) * 9));
      }
    }
    a.live = p >= a.grownAt;

    // Cost. A bar's length is a measurement and so is the wall-clock line's,
    // so neither is ever drawn shorter: their geometry is left alone and they
    // arrive whole. The bar rises into its row at part strength, a glint
    // crosses its cells, and all of them settle at full strength together.
    // The wall-clock line and its end tick follow as one.
    const r = u(x.bar);
    op(a.bar, HELD * phase(r, 0, 0.3) + (1 - HELD) * phase(r, 0.7, 1));
    lift(a.bar, up * (1 - arrive(phase(r, 0, 0.4))));
    const sweep = phase(r, 0.3, 0.8);
    if (sweep > 0 && sweep < 1) {
      // From one cell before the bar to one past its end: the glint sits
      // between cells j and j + 1, and lights each by how near it is.
      const pair = (a.gl ??= glint(a));
      const at = sweep * (a.cells + 1) - 1;
      const j = Math.floor(at), f = at - j;
      cell(pair[j & 1], j, 1 - f, a.cells);
      cell(pair[(j + 1) & 1], j + 1, f, a.cells);
    } else if (a.gl) {
      show(a.gl[0], 0);
      show(a.gl[1], 0);
    }
    const wo = u(x.wall);
    op(a.wl, wo * 1.7);
    op(a.wt, wo * 1.7);
    const wy = upW * (1 - arrive(wo));
    lift(a.wl, wy);
    lift(a.wt, wy);
    // Each numeral follows its mark, once that is fully there.
    rise(a.tok, u(x.tok), up);
    rise(a.wlab, u(x.wlab), upW);
    op(a.dtl, u(x.dtl));
    op(a.pt, u(x.pt));
    op(a.an, u(x.an));
    a.cost = p >= a.costAt;
    // The drop from the bar's end can only be inspected once the bar is fully there.
    if (a.gdC) a.gdC.style.display = a.cost ? "" : "none";
    // The reading line's next part crosses the cost scale, so it does not draw across it: it fades in whole.
    op(a.rlB, u(x.rlB));

    // Return. The lane's guide lies along the scale of the plot, so it too fades in whole.
    op(a.rlD, u(x.rlD));
    op(a.nl, u(x.nl));
    if (a.wh && a.est) {
      // The estimate appears where it was measured, opening to its size as it
      // fades in. Its interval fades in at full width, and the two end caps
      // open on it together. Neither ever sits anywhere but its data.
      const dot = u(x.est);
      a.est.r.baseVal.value = a.estR * (0.45 + 0.55 * arrive(dot));
      op(a.est, dot * 2);
      const cap = A.cap * arrive(u(x.caps));
      if (cap !== a.capNow) {
        a.capNow = cap;
        const top = (A.ry - cap).toFixed(2), tall = (2 * cap).toFixed(2);
        a.wh.setAttribute("d", cap >= A.cap ? a.whD : `M${a.xl} ${top}v${tall}M${a.xl} ${A.ry}H${a.xh}M${a.xh} ${top}v${tall}`);
      }
      op(a.wh, u(x.wh));
      op(a.zl, u(x.zl));
    } else if (a.ref) {
      const dot = u(x.ref);
      a.ref.r.baseVal.value = a.refR * (0.45 + 0.55 * arrive(dot));
      op(a.ref, dot * 2);
    }
    rise(a.nm, u(x.nm), 3);
    a.begun = p > a.begins;
    a.full = p >= a.fullAt;
    // The band under the interval can only be inspected once the interval is there.
    if (a.fxB) a.fxB.style.display = a.full ? "" : "none";
  }

  /** Draw the story at progress p. Returns the latest fact it has finished, or null before the first. */
  function render(p: number) {
    if (p === drawn) return latest;
    drawn = p;
    const u = (win: Win) => phase(p, win[0], win[1]);
    pen(zero, zeroLen, u(W.zero));
    op(gain, u(W.gain));
    rise(zt, u(W.zt), 3);

    for (const a of arms) renderArm(a, p);

    pen(coR, coLen, u(W.coR));
    rise(coM, u(W.coM), 3);
    ink(co0, u(W.co0));
    ink(coAr, u(W.coAr));
    ink(co1, u(W.co1));
    // The verdict closes the story, after the last interval has opened.
    op(verdict, u(W.verdict));
    op(lg, u(W.lg));

    latest = null;
    for (const f of facts) if (p >= f.at) latest = f;
    return latest;
  }

  // ---------- ambient: each tree works through its cycle ----------
  function make(a: ArmV) {
    a.made = true;
    const A = a.A;
    A.segs.forEach(([k, px, py, cx, cy], e) => {
      const rect = document.createElementNS(NS, "rect");
      rect.setAttribute("class", "pkt");
      rect.style.opacity = "0";
      a.pkLayer.append(rect);
      a.pk.push({ el: rect, o: 0, n: e + 1, k, px, py, cx, cy, mode: 0 });
      a.deck[e] = e + 1;
    });
    // One ring per node. Round a node at work it is a gauge, drawn clockwise
    // from the top as the work goes; round one that has just received or
    // merged it is whole, and lets go.
    A.lv.forEach(([y, r, ...xs], k) => {
      for (const x of xs) {
        const ring = document.createElementNS(NS, "circle");
        const rad = k === 0 ? A.ring : r + 3.2, around = 2 * Math.PI * rad;
        ring.setAttribute("class", "ov");
        ring.setAttribute("cx", String(x));
        ring.setAttribute("cy", String(y));
        ring.setAttribute("r", String(rad));
        ring.setAttribute("transform", `rotate(-90 ${x} ${y})`);
        ring.style.strokeDasharray = `${around.toFixed(2)} ${around.toFixed(2)}`;
        ring.style.opacity = "0";
        a.tr.append(ring);
        a.rings.push({ el: ring, o: 0, c: around, turn: 1 });
      }
    });
    const del = document.createElementNS(NS, "circle");
    del.setAttribute("class", "ov");
    del.setAttribute("cx", String(A.lv[0][2]));
    del.setAttribute("cy", String(A.lv[0][0]));
    del.style.opacity = "0";
    a.tr.append(del);
    a.del = fade(del);
    // The wall-clock line and its end tick once more, to brighten as one. It has their ends, as the server wrote them, and never moves.
    const x2 = a.wl.getAttribute("x2");
    const wp = document.createElementNS(NS, "path");
    wp.setAttribute("class", "wp");
    wp.setAttribute("d", `M${a.wl.getAttribute("x1")} ${A.wy}H${x2}M${x2} ${A.wy - 3}v6`);
    wp.style.opacity = "0";
    a.wt.after(wp);
    a.wp = fade(wp);
    // The ring round this arm's estimate (round the reference, for one agent). It stays centred on the measured value.
    const mark = a.est ?? a.ref;
    if (mark) {
      const er = document.createElementNS(NS, "circle");
      er.setAttribute("class", "er");
      er.setAttribute("cx", mark.getAttribute("cx")!);
      er.setAttribute("cy", mark.getAttribute("cy")!);
      er.style.opacity = "0";
      mark.before(er);
      a.er = fade(er);
    }
  }

  const rnd = (a: ArmV) => (a.seed = (Math.imul(a.seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  /**
   * Time one cycle. Every node keeps its own time: a task leaves its parent a
   * moment after the parent has its own, a leaf hands its patch up when its
   * work is done, and a parent hands up once both of its children have
   * reported. Then decide which of this cycle's patches the parents refuse:
   * the edges are shuffled and an accumulator walks them at the arm's measured
   * share, so over many cycles the refused fraction is exactly that share
   * while the edges it lands on keep changing.
   */
  function deal(a: ArmV) {
    const d = a.A.d, n = a.nodes;
    const hd = d ? (DOWN[1] - DOWN[0]) / d : 0, hu = d ? (UP[1] - UP[0]) / d : 0;
    const leaves = (n - 1) >> 1; // the first leaf's index
    a.tArr[0] = DOWN[0];
    for (let i = 1; i < n; i++) {
      a.tDep[i] = a.tArr[(i - 1) >> 1] + rnd(a) * (1 - ON_EDGE) * hd;
      a.tArr[i] = a.tDep[i] + ON_EDGE * hd;
    }
    for (let i = n - 1; i >= 1; i--) {
      const ready = i >= leaves ? Math.max(a.tArr[i] + 0.07, UP[0]) : Math.max(a.tUpArr[2 * i + 1], a.tUpArr[2 * i + 2]);
      a.tUp[i] = ready + rnd(a) * (i >= leaves ? 1 - ON_EDGE : 0.2) * hu;
      a.tUpArr[i] = a.tUp[i] + ON_EDGE * hu;
    }
    for (let j = a.deck.length - 1; j > 0; j--) {
      const k = Math.floor(rnd(a) * (j + 1)), swap = a.deck[j];
      a.deck[j] = a.deck[k];
      a.deck[k] = swap;
    }
    for (const i of a.deck) {
      a.acc += a.A.ref;
      a.no[i] = a.acc >= 1 ? 1 : 0;
      if (a.no[i]) a.acc -= 1;
    }
  }

  function shape(pk: Packet, mode: number) {
    if (pk.mode === mode) return;
    pk.mode = mode;
    if (mode === 0) return;
    const s = mode === 1 ? S1 : S2;
    pk.el.width.baseVal.value = pk.el.height.baseVal.value = s;
    pk.el.rx.baseVal.value = pk.el.ry.baseVal.value = mode === 1 ? s / 2 : 1.1;
    pk.el.setAttribute("class", mode === 3 ? "pkt no" : "pkt");
  }
  function place(pk: Packet, x: number, y: number, s: number) {
    pk.el.x.baseVal.value = x - s / 2;
    pk.el.y.baseVal.value = y - s / 2;
  }

  function hush(a: ArmV) {
    for (const pk of a.pk) { show(pk, 0); pk.mode = 0; }
    for (const o of a.rings) show(o, 0);
    if (a.del) show(a.del, 0);
    if (a.wp) show(a.wp, 0);
    if (a.er) show(a.er, 0);
    a.since = 99;
  }

  function work(a: ArmV, dt: number) {
    const A = a.A, d = A.d, L = a.life;
    const before = a.t / a.D;
    a.t += dt;
    a.since += dt;
    if (before < DELIVER && a.t / a.D >= DELIVER) a.since = 0;
    if (a.t >= a.D) { a.t %= a.D; deal(a); }
    const f = a.t / a.D, flash = FLASH / a.D, attack = 0.09 / a.D;
    const leaves = (a.nodes - 1) >> 1;
    /** A ring that comes up over a few frames from `at` and lets go over `flash`. */
    const pulse = (at: number, peak: number) => (f < at ? 0 : peak * Math.min(1, (f - at) / attack) * (1 - phase(f, at, at + flash)));

    for (const pk of a.pk) {
      const i = pk.n;
      if (f >= a.tDep[i] && f < a.tArr[i]) {
        // A task going down. It leaves from under its parent and arrives under its child.
        const t = smooth((f - a.tDep[i]) / (a.tArr[i] - a.tDep[i]));
        shape(pk, 1);
        place(pk, lerp(pk.px, pk.cx, t), lerp(pk.py, pk.cy, t), S1);
        show(pk, L);
      } else if (f >= a.tUp[i] && f < a.tUpArr[i]) {
        const raw = (f - a.tUp[i]) / (a.tUpArr[i] - a.tUp[i]);
        if (a.no[i] && raw > 0.5) {
          // Refused: it stalls short of the parent, turns red and dissolves.
          const k = (raw - 0.5) / 0.5;
          const t = smooth(0.5) + 0.12 * arrive(k);
          const s = S2 + 2.6 * arrive(k);
          shape(pk, 3);
          pk.el.width.baseVal.value = pk.el.height.baseVal.value = s;
          place(pk, lerp(pk.cx, pk.px, t), lerp(pk.cy, pk.py, t), s);
          show(pk, (1 - k * k) * L);
        } else {
          const t = smooth(raw);
          shape(pk, 2);
          place(pk, lerp(pk.cx, pk.px, t), lerp(pk.cy, pk.py, t), S2);
          show(pk, L);
        }
      } else if (pk.mode) {
        show(pk, 0);
        pk.mode = 0;
      }
    }

    // Each node's ring. A node at work (a leaf, or the one agent that has no
    // one to hand to) wears a gauge that is drawn round it as its work goes,
    // and lets go once its patch has left. A node that hands down wears a whole
    // ring for a moment as its task arrives, and again as it merges what its
    // children handed up.
    for (let i = 0; i < a.nodes; i++) {
      let o = 0, turn = 1;
      if (d === 0) {
        turn = phase(f, 0.06, 0.86);
        o = f < 0.06 ? 0 : 0.85 * (1 - phase(f, DELIVER, DELIVER + 0.07));
      } else if (i >= leaves) {
        turn = phase(f, a.tArr[i], a.tUp[i]);
        o = f < a.tArr[i] ? 0 : 0.85 * (1 - phase(f, a.tUp[i], a.tUp[i] + flash));
      } else {
        if (i > 0) o = pulse(a.tArr[i], 0.5);
        o = Math.max(o, pulse(Math.max(a.tUpArr[2 * i + 1], a.tUpArr[2 * i + 2]), 0.9));
      }
      sweep(a.rings[i], turn);
      show(a.rings[i], o * L);
    }

    // The root delivers, and the arm's wall-clock line brightens with it. A
    // cycle lasts as many one-agent cycles as that line is long, so the rows
    // keep time at their measured ratios with nothing moving along the scale.
    // The delivery is graded: a ring opens round the arm's estimate.
    const del = a.del!;
    const dv = phase(f, DELIVER, 1);
    if (dv > 0) del.el.r.baseVal.value = A.ring + 11 * arrive(dv);
    show(del, dv > 0 ? 0.8 * Math.min(1, dv * 9) * (1 - dv) * L : 0);
    show(a.wp!, phase(f, DELIVER - 0.03, DELIVER) * (1 - dv) * L);
    if (a.er) {
      // (It keeps its own time, so a short cycle beginning again does not cut it off.)
      const graded = a.full ? phase(a.since, 0.12, 1.07) : 0;
      if (graded > 0 && graded < 1) {
        a.er.el.r.baseVal.value = (a.estR || a.refR) + 1.5 + 8 * arrive(graded);
        show(a.er, 0.7 * Math.min(1, graded * 7) * (1 - graded) * L);
      } else show(a.er, 0);
    }
  }

  function ambient(dt: number) {
    for (const a of arms) {
      if (!a.live && a.life === 0) continue;
      if (!a.made) make(a);
      if (a.life === 0) {
        // It picks up where its growing left off: the tasks have just arrived, so the leaves are at work.
        deal(a);
        a.t = a.A.d ? WORK[0] * a.D : 0;
      }
      // A cycle comes up and goes down over a few frames, and one that is
      // asked to start again goes down first: nothing appears or leaves in one.
      const want = a.live && !a.again;
      a.life = clamp(a.life + (want ? dt / 0.28 : -dt / (a.again ? 0.16 : 0.28)));
      if (a.life === 0) {
        hush(a);
        if (a.again && a.live) {
          // From the top: the root has its task and is about to hand it down.
          a.again = false;
          deal(a);
          a.t = DOWN[0] * a.D;
          a.life = 0.001;
        }
        continue;
      }
      work(a, dt);
    }
  }

  // ---------- reading ----------
  // The arms that are not being read step back, on the page's clock and its
  // curve; the arm that is shows its guides. A change of mind part-way is
  // taken up from where each part has got to.
  type Part = { el: SVGElement; level: (i: number) => number; rest: number; now: number; from: number; to: number };
  const parts: Part[] = [];
  const part = (node: SVGElement | null, level: Part["level"], rest: number) => {
    if (node) parts.push({ el: node, level, rest, now: rest, from: rest, to: rest });
  };
  for (const a of arms) {
    for (const g of a.groups) part(g, (i) => (i === a.i ? 1 : DIM), 1);
    part(a.gdC, (i) => (i === a.i ? 1 : 0), 0);
    part(a.fxB, (i) => (i === a.i ? 1 : 0), 0);
  }
  part(co, (i) => (i === 0 || i === arms.length - 1 ? 1 : DIM), 1);
  const dim = { v: 1 };
  /** Light one arm across every column and step the rest back; -1 lights them all again. */
  function setFocus(i: number) {
    el.classList.toggle("focus", i >= 0);
    for (const a of arms) for (const g of a.groups) g.classList.toggle("on", a.i === i);
    for (const x of parts) {
      x.from = x.now;
      x.to = i >= 0 ? x.level(i) : x.rest;
    }
    gsap.killTweensOf(dim);
    dim.v = 0;
    gsap.to(dim, {
      v: 1, duration: FOCUS, ease: "arrive",
      onUpdate() {
        for (const x of parts) {
          x.now = x.from + (x.to - x.from) * dim.v;
          x.el.style.opacity = x.now.toFixed(3);
        }
      },
    });
    // The arm being inspected starts a fresh cycle, so the reader sees it from the top.
    if (i >= 0 && arms[i].live && arms[i].made) arms[i].again = true;
  }
  /** Mark the arm the idle readout is on. */
  function setCur(i: number) {
    for (const a of arms) for (const g of a.groups) g.classList.toggle("cur", a.i === i);
  }
  /** Show which arm the keyboard is on (its button draws its own ring; the lane needs telling) and which is held. */
  function setKeys(keys: number, held: number) {
    for (const a of arms) {
      a.lane?.classList.toggle("keys", a.i === keys);
      a.row.setAttribute("aria-pressed", a.i === held ? "true" : "false");
    }
  }

  // Until the page has been measured: a plan that draws nothing early.
  plan((i, y) => 0.1 + (0.5 * (y + i * 300)) / 900, 700);

  return { el, G, svgs, arms, plan, render, ambient, setFocus, setCur, setKeys };
}

export default function (root: HTMLElement) {
  const views = qa<HTMLElement>(root, ".dl").map(bind);
  if (views.length < 2) return;
  const [wideView, narrowView] = views;
  type View = typeof wideView;
  const readout = root.querySelector<HTMLElement>("[data-readout]");
  const idle = readout?.textContent ?? "";
  const say = (s: string) => { if (readout && readout.textContent !== s) readout.textContent = s; };

  // The plate's readout is hidden from assistive tech, so what it says about
  // an arm being inspected from the keyboard is repeated here, politely.
  const live = document.createElement("p");
  live.className = "sr-only";
  live.setAttribute("aria-live", "polite");
  root.append(live);
  let spoken = "", liveTimer = 0;

  const st = { p: 0 };
  let active = wideView;
  let mode: Mode = "side";
  let trigger: ScrollTrigger | undefined;
  // Three ways to pick an arm: the mouse is over it, the keyboard is on it, or
  // it is held (a click, a tap, Enter or Space). The first that applies wins.
  let hover = -1, keys = -1, held = -1;
  /** The arm lit right now: the picked one, once the story has begun to draw it. */
  let shown = -1;
  // One Tab stop for the figure: a roving tabindex. The row last focused (the
  // first, to begin with) is the stop; the arrow keys, Home and End move
  // between the rows, and Tab or Shift+Tab leaves the figure.
  let stop = 0;
  const rove = () => {
    for (const v of views) for (const a of v.arms) a.row.tabIndex = v === active && a.i === stop ? 0 : -1;
  };
  // After the story the readout walks the arms and the cost of a fix; -1 until then.
  let turn = -1, turnT = 0;

  /** Which readout length fits beside the plate title. */
  const fit = () => {
    const w = root.clientWidth;
    if (window.innerWidth <= 560) return w >= 330 ? 1 : 2; // the readout has its own line
    return w >= 900 ? 0 : w >= 660 ? 1 : 2;
  };
  /**
   * What the readout says about arm i, and never more than is shown: nothing
   * before its row begins, its name alone until its bar is fully there, then
   * its cost, and the change in success only once its interval is on the plot.
   */
  function lineFor(i: number) {
    const a = active.arms[i];
    if (!a.begun) return "";
    if (!a.cost) return a.A.who;
    return a.full ? a.A.rd[fit()] : `${a.A.who}   ${a.A.tokS} tokens`;
  }

  function update() {
    const fact = active.render(st.p);

    // An arm can be inspected as soon as the story has begun to draw it.
    const want = hover >= 0 ? hover : keys >= 0 ? keys : held;
    const next = want >= 0 && active.arms[want].begun ? want : -1;
    if (next !== shown) {
      shown = next;
      active.setFocus(next);
      active.setCur(next < 0 && turn >= 0 && turn < 4 ? turn : -1);
    }

    // The keyboard's arm is also announced, once it has a finished fact to give.
    const told = keys >= 0 ? keys : held;
    const text = told >= 0 && active.arms[told].cost ? lineFor(told) : "";
    if (text !== spoken) {
      spoken = text;
      clearTimeout(liveTimer);
      liveTimer = window.setTimeout(() => (live.textContent = text), 300);
    }

    if (shown >= 0) return say(lineFor(shown));
    if (turn >= 0) return say(turn < 4 ? active.G.arms[turn].rd[fit()] : active.G.fix);
    // The story itself: the latest fact it has finished, and until the first, where the data came from.
    if (!fact) return say(idle);
    say(fact.arm < 0 ? active.G.fix : lineFor(fact.arm));
  }
  /** A choice changed: tell the controls, then redraw. */
  function pick() {
    active.setKeys(keys, held);
    update();
  }

  /**
   * Work out when each part of the story plays. The plate lets its sheet out
   * from the top as it enters the window (reveal.ts), so a part is drawn once
   * it stands clear of that edge: CLEAR of the way down the window. Only
   * distances inside the plate are read, and only here, when the page is
   * measured.
   */
  function measure() {
    // (A trigger has no positions until its first refresh, which calls back here.)
    if (!trigger || !(trigger.end > trigger.start)) return;
    const plate = root.getBoundingClientRect();
    const boxes = active.svgs.map((s) => s.getBoundingClientRect());
    if (!boxes[0].height) return;
    const R = trigger.end - trigger.start;
    const lead = (CLEAR - START) * window.innerHeight; // sheet already clear as the story begins
    const G = active.G;
    active.plan((i, y) => (boxes[i].top - plate.top + (y * boxes[i].height) / G.hs[i] - lead) / R, R);
    update();
  }

  // One scrubbed clock drives whichever layout is showing. Where the plate is
  // taller than the screen (phones), the story runs for as long as the plate
  // takes to arrive: trees first, then the forest plot.
  const mm = gsap.matchMedia();
  const stage = (view: View, m: Mode, end: () => string) => () => {
    active = view;
    mode = m;
    hover = keys = held = shown = turn = -1;
    for (const v of views) { v.setFocus(-1); v.setCur(-1); v.setKeys(-1, -1); }
    rove();
    const tl = scrubbed(root, { start: `top ${START * 100}%`, end, onRefresh: measure });
    trigger = tl.scrollTrigger;
    tl.fromTo(st, { p: 0 }, { p: 1, duration: 1, ease: "none" });
    tl.eventCallback("onUpdate", update);
    st.p = 0;
    measure();
    update();
  };
  // A plate that fits the window with room to spare is finished just before
  // its middle reaches the window's, so it is whole by the time it is centred.
  // A taller one cannot be: it is finished once its foot has come clear.
  const end = () => (root.offsetHeight <= 0.82 * window.innerHeight ? "center 51%" : "bottom 80%");
  mm.add("(min-width: 920px)", stage(wideView, "side", end));
  mm.add("(min-width: 720px) and (max-width: 919.98px)", stage(narrowView, "side", end));
  mm.add("(max-width: 719.98px)", stage(narrowView, "stack", end));

  whileVisible(root, (dt) => {
    active.ambient(dt);
    const done = st.p >= 0.999;
    if (!done) {
      if (turn >= 0) { turn = -1; active.setCur(-1); }
      turnT = 0;
      return;
    }
    if (shown >= 0) return;
    turnT += dt;
    if (turnT < 3.6) return;
    turnT = 0;
    turn = (turn + 1) % 5;
    active.setCur(turn < 4 ? turn : -1);
    update();
  });

  /**
   * The keyboard has arrived on a row, which the browser has only just brought
   * on screen: at that scroll position the story may not have drawn it yet.
   * Where the whole figure fits on screen, bring it to rest there, which plays
   * the story to its end. Otherwise bring the row itself to the middle of the
   * screen, where the story has drawn its tree and its cost.
   */
  function settle(row: HTMLElement) {
    if (st.p >= 0.999) return;
    if (mode === "side" && trigger && window.scrollY < trigger.end) {
      const to = Math.ceil(trigger.end) + 1;
      const box = row.getBoundingClientRect();
      const top = box.top + window.scrollY - to;
      if (top >= 8 && top + box.height <= window.innerHeight - 8) return window.scrollTo({ top: to, behavior: "smooth" });
    }
    row.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  // How the last press arrived, so a tap's hold can let go by itself and a key's cannot.
  let lastPress = "mouse";
  let leaveTimer = 0, tapTimer = 0;
  window.addEventListener("keydown", () => (lastPress = "key"), true);

  // A page scrolling under a resting mouse slides row after row beneath it.
  // That is the scroll's doing, not the reader's, so it reads nothing: hover
  // begins only once the mouse itself has moved since the page last did.
  let mouseX = -1, mouseY = -1, restX = -2, restY = -2;
  window.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    mouseX = e.clientX;
    mouseY = e.clientY;
  }, { capture: true, passive: true });
  window.addEventListener("scroll", () => {
    restX = mouseX;
    restY = mouseY;
    if (hover < 0) return;
    hover = -1;
    pick();
  }, { passive: true });

  function hold(i: number) {
    held = held === i ? -1 : i;
    clearTimeout(tapTimer);
    // A finger has no hover to take the highlight away again, so its hold lets go after a while.
    if (held >= 0 && lastPress !== "mouse" && lastPress !== "key") {
      tapTimer = window.setTimeout(() => { held = -1; pick(); }, 6000);
    }
    pick();
  }

  for (const v of views) {
    // The drawing and its four row buttons are one group, which says how to move within it.
    v.el.setAttribute("role", "group");
    v.el.setAttribute("aria-label", "Plot. Arrow keys move between arms.");
    for (const a of v.arms) {
      const { row } = a;

      // Pointer: the row under the mouse is the arm being read; a click or a tap holds it.
      const targets: HTMLElement[] = a.lane ? [row, a.lane] : [row];
      for (const target of targets) {
        const over = (e: PointerEvent) => {
          if (e.pointerType !== "mouse" || (e.clientX === restX && e.clientY === restY)) return;
          clearTimeout(leaveTimer);
          if (hover === a.i) return;
          hover = a.i;
          pick();
        };
        target.addEventListener("pointerenter", over);
        target.addEventListener("pointermove", over);
        target.addEventListener("pointerleave", (e) => {
          if (e.pointerType !== "mouse") return;
          leaveTimer = window.setTimeout(() => { hover = -1; pick(); }, 60);
        });
        target.addEventListener("pointerdown", (e) => (lastPress = e.pointerType));
        // Enter and Space on the button arrive here as clicks too. A scroll that
        // happens to start on a row never does, so the page keeps its scroll.
        target.addEventListener("click", () => hold(a.i));
      }

      // Keyboard: Tab reaches the rows at the one last focused, focus reads a
      // row the way hover does, and the arrows step between rows. A click also
      // focuses the button, but only the keyboard's focus counts as reading.
      row.addEventListener("focus", () => {
        stop = a.i;
        rove();
        if (!row.matches(":focus-visible")) return;
        keys = a.i;
        settle(row);
        pick();
      });
      row.addEventListener("blur", () => {
        if (keys !== a.i) return;
        keys = -1;
        pick();
      });
      row.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          if (held < 0) return;
          held = -1;
          return pick();
        }
        const last = v.arms.length - 1;
        const jump = e.key === "Home" || e.key === "End";
        const to = e.key === "ArrowDown" ? a.i + 1 : e.key === "ArrowUp" ? a.i - 1 : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
        // Past either end an arrow is the page's again, to scroll with. Home and End stay with the rows.
        if (!jump && (to < 0 || to > last)) return;
        e.preventDefault();
        if (to !== a.i) v.arms[to].row.focus();
      });
    }
  }
}
