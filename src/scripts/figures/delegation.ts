import { gsap, ScrollTrigger, scrubbed, whileVisible, phase, q, qa } from "../motion";

// Fig. "delegation": the depth campaign of the NeurIPS 2026 workshop paper.
//
// Scroll: one scrubbed clock draws the four arms in turn, each as tree, then
// cost, then return. The cost of a fix closes the story.
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
// Ambient: every grown tree keeps working. Tasks go down its edges, the leaves
// work, patches come back up, and the parents refuse the arm's measured share
// of them. A cycle lasts the arm's wall-clock multiple, so the larger trees
// take that much longer, and each wall-clock line brightens, whole, as its
// root delivers.
//
// Reading a row: the mouse over it, the keyboard on it (Tab, then the arrows)
// or a hold (click, tap, Enter, Space) lights that arm across the columns and
// puts its numbers in the readout, and never more of them than is shown.

// Geometry and data for one layout, serialised by Delegation.astro.
interface ArmG {
  n: number; d: number; tok: number; wall: number; ref: number;
  ring: number; lv: number[][]; segs: number[][]; el: number[];
  wy: number; ry: number; cap: number;
  eff: [number, number, number] | null;
  rd: [string, string, string]; who: string; tokS: string;
  /** The arm in words, for its control; the control's box over the drawing, and over its lane, in percent. */
  say: string; box: [number, number]; lane: [number, number] | null;
}
/** When each part of the story plays, as fractions of the scrubbed timeline. */
interface Beats { zero: [number, number]; co: [number, number]; tw: [number, number][]; rw: [number, number][] }
/** "side": the whole figure is on screen together. "stack": the forest plot arrives later, further down. */
type Mode = "side" | "stack";
interface Geo {
  w: 0 | 1; kx: number;
  beats: { side: Beats; stack?: Beats };
  fix: string;
  arms: ArmG[];
}

const NS = "http://www.w3.org/2000/svg";
/** Seconds one agent takes for a cycle; every tree's cycle is this times its wall-clock multiple. */
const T0 = 2.3;
/** Where a cycle spends its time: tasks go down, the leaves work, patches come up, the root delivers. */
const DOWN = [0.04, 0.4] as const;
const WORK = [0.4, 0.52] as const;
const UP = [0.52, 0.88] as const;
const DELIVER = 0.9;

/** Within an arm's tree-and-cost window: its tree has finished growing by here. */
const GROWN = 0.66;
/**
 * Within the same window: when its token bar and wall-clock line arrive. Both
 * are at their measured length from the first frame; at BAR[1] they are fully
 * there, and their numerals may follow.
 */
const BAR = [0.6, 0.84] as const;
/** The strength a bar holds, whole, while the glint crosses it; then every cell settles at full strength together. */
const HELD = 0.55;
/** Within an arm's return window: from here on its estimate, interval and their numbers are all on the plot. */
const SHOWN = 0.85;

const e3 = (u: number) => 1 - (1 - u) ** 3;
const smooth = (u: number) => u * u * (3 - 2 * u);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const disc = (x: number, y: number, r: number) =>
  `M${(x - r).toFixed(2)} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

/** An element with its last written opacity, so the ambient loop only touches the DOM on change. */
interface Fade<T extends SVGElement = SVGElement> { el: T; o: number }
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
const lift = (el: SVGElement, y: number) => {
  el.style.transform = y > 0.01 ? `translateY(${y.toFixed(2)}px)` : "";
};
/** Opacity for a span of text: it fades through its fill, and its halo with it. */
const ink = (el: SVGTSpanElement, v: number) => {
  el.style.fillOpacity = el.style.strokeOpacity = v <= 0 ? "0" : v >= 1 ? "1" : v.toFixed(3);
};

/** Half of a bar's glint: a copy of the bar, dashed so that it paints one cell of it. j is the cell. */
interface Glint extends Fade<SVGLineElement> { j: number }

interface Packet extends Fade<SVGRectElement> {
  k: number; px: number; py: number; cx: number; cy: number;
  /** This cycle's patch is refused at the parent. */
  no: boolean;
  /** 0 hidden, 1 a task going down, 2 a patch coming up, 3 a refused patch. */
  mode: number;
}

/** Wire one layout. An arm's parts may sit in more than one drawing, so they are found by arm index. */
function bind(el: HTMLElement) {
  const G: Geo = JSON.parse(el.dataset.g!);
  const wide = G.w === 1;
  /** How far a bar and its numeral rise into their row as they appear, and the wall-clock line and its numeral under them. */
  const rise = wide ? 5 : 4, riseW = 3;
  const S1 = wide ? 5.4 : 4.4, S2 = wide ? 5.8 : 4.8;
  let B: Beats = G.beats.side;

  const zero = q<SVGLineElement>(el, ".zero");
  const zeroLen = Number(zero.dataset.len);
  zero.style.strokeDasharray = `${zeroLen} ${zeroLen}`;
  const gain = q<SVGRectElement>(el, ".gain");
  const zt = q<SVGGElement>(el, ".zt");
  const verdict = q<SVGTextElement>(el, ".verdict");
  const coR = q(el, ".co-r"), coM = q(el, ".co-m");
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
    egs.forEach((e, k) => (e.style.strokeDasharray = `${A.el[k]} ${A.el[k]}`));
    const tok = need<SVGTextElement>(".tok");
    const wlab = need<SVGTextElement>(".wlab");
    const wh = maybe<SVGPathElement>(".wh");
    const est = maybe<SVGCircleElement>(".est");
    // The interval's ends, as drawn by the server: the story never moves them.
    const whD = wh?.getAttribute("d") ?? "";
    const ends = /M(-?[\d.]+) [\d.]+H(-?[\d.]+)/.exec(whD);
    const row = over(panA, "button", "row", A.box) as HTMLButtonElement;
    row.type = "button";
    row.setAttribute("aria-label", A.say);
    row.setAttribute("aria-pressed", "false");
    return {
      i, A,
      groups: qa<SVGGElement>(el, `.arm[data-i="${i}"]`),
      row, lane: A.lane && panB ? over(panB, "div", "lane", A.lane) : null,
      rlA, rlAx: [rlA.x1.baseVal.value, rlA.x2.baseVal.value],
      rlB, rlD,
      lb: need(".lb"), nl: maybe(".nl"), pt: maybe(".pt"), an: maybe(".an"),
      egs, nds: qa<SVGPathElement>(el, `.arm[data-i="${i}"] .nd`), rr: need(".rr"),
      tr: need<SVGGElement>(".tr"), pkLayer: need<SVGGElement>(".pk"),
      // The bar and the wall-clock line are read here and never written: their ends are the measurements.
      bar: need<SVGLineElement>(".bar"), cells: Math.ceil(A.tok - 1e-6), gl: null as [Glint, Glint] | null,
      // Each numeral keeps the text and the place the server gave it; a fade and a short rise bring it in.
      tok, wl: need<SVGLineElement>(".wl"), wt: need<SVGLineElement>(".wt"), wlab,
      dtl: maybe(".dtl"), gdC: maybe<SVGLineElement>(".gd-c"),
      wh, whD, xl: ends ? ends[1] : "", xh: ends ? ends[2] : "", capNow: A.cap,
      est, estR: est ? est.r.baseVal.value : 0,
      ref: maybe<SVGCircleElement>(".ref"),
      nm: need(".nm"), zl: maybe(".zl"), fxB: maybe<SVGGElement>("g.fx"),
      // scroll state
      u: -1, v: -1,
      // ambient state
      live: false, made: false, t: 0, D: T0 * A.wall, acc: 0.5, seed: (A.n * 2654435761) >>> 0,
      pk: [] as Packet[], ov: [] as Fade<SVGPathElement>[],
      del: null as Fade<SVGCircleElement> | null, wp: null as Fade<SVGPathElement> | null,
    };
  });
  type ArmV = (typeof arms)[number];

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

  function renderArm(a: ArmV, p: number) {
    const A = a.A;
    const u = phase(p, B.tw[a.i][0], B.tw[a.i][1]);
    const v = phase(p, B.rw[a.i][0], B.rw[a.i][1]);

    if (u !== a.u) {
      a.u = u;
      op(a.lb, e3(phase(u, 0, 0.14)));
      const la = phase(u, 0, 0.24);
      a.rlA.x2.baseVal.value = lerp(a.rlAx[0], a.rlAx[1], la);
      op(a.rlA, la > 0 ? 1 : 0);

      // The tree: the root, then one level at a time, edges first.
      const root = phase(u, 0.03, 0.14);
      op(a.rr, root);
      op(a.nds[0], root);
      const s = A.d ? (GROWN - 0.16) / A.d : 0;
      for (let k = 1; k <= A.d; k++) {
        const at = 0.16 + (k - 1) * s;
        const e = phase(u, at, at + 0.7 * s);
        const edge = a.egs[k - 1];
        edge.style.strokeDashoffset = (A.el[k - 1] * (1 - e)).toFixed(2);
        op(edge, e > 0 ? 1 : 0);
        op(a.nds[k], phase(u, at + 0.5 * s, at + s));
      }
      a.live = u >= 0.9;

      // Cost. A bar's length is a measurement and so is the wall-clock line's,
      // so neither is ever drawn shorter: their geometry is left alone and they
      // arrive whole. The bar rises into its row at part strength, a glint
      // crosses its cells, and all of them settle at full strength together.
      // The wall-clock line and its end tick follow as one.
      const r = phase(u, BAR[0], BAR[1]);
      op(a.bar, HELD * phase(r, 0, 0.3) + (1 - HELD) * phase(r, 0.7, 1));
      lift(a.bar, rise * (1 - e3(phase(r, 0, 0.3))));
      const sweep = phase(r, 0.3, 0.8);
      if (sweep > 0 && sweep < 1) {
        // From one cell before the bar to one past its end: the glint sits
        // between cells j and j + 1, and lights each by how near it is.
        const pair = (a.gl ??= glint(a));
        const x = sweep * (a.cells + 1) - 1;
        const j = Math.floor(x), f = x - j;
        cell(pair[j & 1], j, 1 - f, a.cells);
        cell(pair[(j + 1) & 1], j + 1, f, a.cells);
      } else if (a.gl) {
        show(a.gl[0], 0);
        show(a.gl[1], 0);
      }
      const wo = phase(r, 0.35, 0.85);
      op(a.wl, wo);
      op(a.wt, wo);
      const wy = riseW * (1 - e3(phase(r, 0.35, 0.75)));
      lift(a.wl, wy);
      lift(a.wt, wy);
      // Each numeral follows its mark, once that is fully there.
      const tn = phase(u, BAR[1], BAR[1] + 0.08);
      lift(a.tok, rise * (1 - e3(tn)));
      op(a.tok, tn);
      const wn = phase(u, BAR[1] + 0.02, BAR[1] + 0.1);
      lift(a.wlab, riseW * (1 - e3(wn)));
      op(a.wlab, wn);
      op(a.dtl, phase(u, 0.88, 0.98));
      op(a.pt, phase(u, 0.82, 0.95));
      op(a.an, phase(u, 0.84, 0.98));
      // The drop from the bar's end can only be inspected once the bar is fully there.
      if (a.gdC) a.gdC.style.display = u >= BAR[1] ? "" : "none";
      // The reading line's next part crosses the cost scale, so it does not draw across it: it fades in whole.
      op(a.rlB, phase(u, 0.86, 1));
    }

    if (v !== a.v) {
      a.v = v;
      // The lane's guide lies along the scale of the plot, so it too fades in whole.
      op(a.rlD, phase(v, 0, 0.25));
      op(a.nl, phase(v, 0, 0.25));
      if (a.wh && a.est) {
        // The estimate appears where it was measured, growing a little as it
        // fades in. Its interval fades in at full width, and the two end caps
        // close on it together. Neither ever sits anywhere but its data.
        const d = phase(v, 0.15, 0.4);
        a.est.r.baseVal.value = a.estR * (0.55 + 0.45 * e3(d));
        op(a.est, d);
        const c = A.cap * e3(phase(v, 0.45, 0.7));
        if (c !== a.capNow) {
          a.capNow = c;
          const top = (A.ry - c).toFixed(2), tall = (2 * c).toFixed(2);
          a.wh.setAttribute("d", c >= A.cap ? a.whD : `M${a.xl} ${top}v${tall}M${a.xl} ${A.ry}H${a.xh}M${a.xh} ${top}v${tall}`);
        }
        op(a.wh, phase(v, 0.35, 0.6));
      } else {
        op(a.ref, e3(phase(v, 0.15, 0.6)));
      }
      op(a.nm, phase(v, A.eff ? 0.6 : 0.4, SHOWN));
      op(a.zl, phase(v, 0.65, SHOWN));
      // The band under the interval can only be inspected once the interval is there.
      if (a.fxB) a.fxB.style.display = v >= SHOWN ? "" : "none";
    }
  }

  /**
   * The facts the story finishes, in the order it finishes them: each arm's
   * cost once its bar is fully there, its change in success once the interval is on
   * the plot, and the cost of a fix once that line is up. The readout reports
   * the latest of them and nothing that is still being drawn.
   */
  type Fact = { at: number; arm: number; full: boolean };
  let facts: Fact[] = [];
  const order = () => {
    facts = [];
    G.arms.forEach((_, i) => {
      facts.push({ at: lerp(B.tw[i][0], B.tw[i][1], BAR[1]), arm: i, full: false });
      facts.push({ at: lerp(B.rw[i][0], B.rw[i][1], SHOWN), arm: i, full: true });
    });
    facts.push({ at: lerp(B.co[0], B.co[1], 0.9), arm: -1, full: false });
    facts.sort((x, y) => x.at - y.at);
  };
  order();

  /** Draw the story at progress p. Returns the latest fact it has finished, or null before the first. */
  function render(p: number) {
    const z = phase(p, B.zero[0], B.zero[1]);
    zero.style.strokeDashoffset = (zeroLen * (1 - z)).toFixed(1);
    op(zero, z > 0 ? 1 : 0);
    op(gain, phase(z, 0.5, 1));
    op(zt, phase(z, 0.2, 0.7));

    for (const a of arms) renderArm(a, p);

    const c = phase(p, B.co[0], B.co[1]);
    op(coR, phase(c, 0, 0.2));
    op(coM, phase(c, 0.05, 0.3));
    ink(co0, phase(c, 0.15, 0.45));
    ink(coAr, phase(c, 0.4, 0.65));
    ink(co1, phase(c, 0.6, 0.9));
    // The verdict closes the story, after the last interval has opened.
    op(verdict, phase(p, B.rw[3][1], Math.min(1, B.rw[3][1] + 0.08)));
    // The key appears with the first packets.
    const first = B.tw[1];
    op(lg, phase(p, lerp(first[0], first[1], 0.9), first[1] + 0.04));

    let latest: Fact | null = null;
    for (const f of facts) if (p >= f.at) latest = f;
    return latest;
  }

  /** Change which beats the story follows; everything redraws on the next render. */
  function setMode(mode: Mode) {
    B = G.beats[mode] ?? G.beats.side;
    order();
    for (const a of arms) a.u = a.v = -1;
  }

  // ---------- ambient: each tree works through its cycle ----------
  function make(a: ArmV) {
    a.made = true;
    const A = a.A;
    for (const [k, px, py, cx, cy] of A.segs) {
      const rect = document.createElementNS(NS, "rect");
      rect.setAttribute("class", "pkt");
      rect.style.opacity = "0";
      a.pkLayer.append(rect);
      a.pk.push({ el: rect, o: 0, k, px, py, cx, cy, no: false, mode: 0 });
    }
    // One ring path per level: it lights when that level receives, works or merges.
    A.lv.forEach(([y, r, ...xs], k) => {
      const path = document.createElementNS(NS, "path");
      path.setAttribute("class", "ov");
      path.setAttribute("d", xs.map((x) => disc(x, y, k === 0 ? A.ring : r + 3.2)).join(""));
      path.style.opacity = "0";
      a.tr.append(path);
      a.ov.push(fade(path));
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
  }

  /**
   * Decide which of this cycle's patches the parents refuse. The packets are
   * shuffled in place, then an accumulator walks them at the arm's measured
   * share, so over many cycles the refused fraction is exactly that share
   * while the edges it lands on keep changing.
   */
  function deal(a: ArmV) {
    const pk = a.pk;
    for (let j = pk.length - 1; j > 0; j--) {
      a.seed = (Math.imul(a.seed, 1664525) + 1013904223) >>> 0;
      const k = (a.seed >>> 8) % (j + 1);
      const swap = pk[j];
      pk[j] = pk[k];
      pk[k] = swap;
    }
    for (const one of pk) {
      a.acc += a.A.ref;
      one.no = a.acc >= 1;
      if (one.no) a.acc -= 1;
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
    for (const o of a.ov) show(o, 0);
    if (a.del) show(a.del, 0);
    if (a.wp) show(a.wp, 0);
    a.t = 0;
  }

  function work(a: ArmV, dt: number) {
    const A = a.A, d = A.d;
    if (!a.made) { make(a); deal(a); }
    a.t += dt;
    if (a.t >= a.D) { a.t %= a.D; deal(a); }
    const f = a.t / a.D;

    const hd = d ? (DOWN[1] - DOWN[0]) / d : 0, hu = d ? (UP[1] - UP[0]) / d : 0;
    for (const pk of a.pk) {
      const fa = DOWN[0] + (pk.k - 1) * hd;
      const ga = UP[0] + (d - pk.k) * hu;
      if (f >= fa && f < fa + hd) {
        const t = smooth((f - fa) / hd);
        shape(pk, 1);
        place(pk, lerp(pk.px, pk.cx, t), lerp(pk.py, pk.cy, t), S1);
        show(pk, 1);
      } else if (f >= ga && f < ga + hu) {
        const raw = (f - ga) / hu;
        if (pk.no && raw > 0.5) {
          // Refused: it stalls short of the parent, turns red and dissolves.
          const k = (raw - 0.5) / 0.5;
          const t = smooth(0.5) + 0.12 * e3(k);
          const s = S2 + 2.6 * e3(k);
          shape(pk, 3);
          pk.el.width.baseVal.value = pk.el.height.baseVal.value = s;
          place(pk, lerp(pk.cx, pk.px, t), lerp(pk.cy, pk.py, t), s);
          show(pk, 1 - k * k);
        } else {
          const t = smooth(raw);
          shape(pk, 2);
          place(pk, lerp(pk.cx, pk.px, t), lerp(pk.cy, pk.py, t), S2);
          show(pk, 1);
        }
      } else if (pk.mode) {
        show(pk, 0);
        pk.mode = 0;
      }
    }

    // Level rings: a task arriving, the leaves working, patches merging.
    for (let k = 0; k <= d; k++) {
      let o = 0;
      if (d === 0) {
        o = 0.75 * Math.sin(Math.PI * phase(f, 0.06, 0.86));
      } else {
        if (k > 0) {
          const f1 = DOWN[0] + k * hd;
          if (f >= f1) o = Math.max(o, 0.5 * (1 - phase(f, f1, f1 + 0.05)));
        }
        if (k === d) o = Math.max(o, 0.8 * Math.sin(Math.PI * phase(f, WORK[0], WORK[1])));
        if (k < d) {
          const f2 = UP[0] + (d - k) * hu;
          if (f >= f2) o = Math.max(o, 0.9 * (1 - phase(f, f2, f2 + 0.06)));
        }
      }
      show(a.ov[k], o);
    }

    // The root delivers, and the arm's wall-clock line brightens with it. A
    // cycle lasts as many one-agent cycles as that line is long, so the rows
    // keep time at their measured ratios with nothing moving along the scale.
    const del = a.del!;
    const dv = phase(f, DELIVER, 1);
    if (dv > 0) del.el.r.baseVal.value = A.ring + 11 * e3(dv);
    show(del, dv > 0 ? 0.8 * (1 - dv) : 0);
    show(a.wp!, phase(f, DELIVER - 0.03, DELIVER) * (1 - dv));
  }

  function ambient(dt: number) {
    for (const a of arms) {
      if (a.live) work(a, dt);
      else if (a.made && a.t > 0) hush(a);
    }
  }

  /** Light one arm across every column and dim the rest; -1 lights them all again. */
  function setFocus(i: number) {
    el.classList.toggle("focus", i >= 0);
    el.classList.toggle("focus-co", i === 0 || i === 3);
    for (const a of arms) for (const g of a.groups) g.classList.toggle("on", a.i === i);
    // The arm being inspected starts a fresh cycle, so the reader sees it from the top.
    if (i >= 0 && arms[i].live && arms[i].made) arms[i].t = arms[i].D;
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

  return { el, G, arms, render, setMode, ambient, setFocus, setCur, setKeys };
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
    if (a.u <= 0) return "";
    if (a.u < BAR[1]) return a.A.who;
    return a.v >= SHOWN ? a.A.rd[fit()] : `${a.A.who}   ${a.A.tokS} tokens`;
  }

  function update() {
    const fact = active.render(st.p);

    // An arm can be inspected as soon as the story has begun to draw it.
    const want = hover >= 0 ? hover : keys >= 0 ? keys : held;
    const next = want >= 0 && active.arms[want].u > 0 ? want : -1;
    if (next !== shown) {
      shown = next;
      active.setFocus(next);
      active.setCur(next < 0 && turn >= 0 && turn < 4 ? turn : -1);
    }

    // The keyboard's arm is also announced, once it has a finished fact to give.
    const told = keys >= 0 ? keys : held;
    const text = told >= 0 && active.arms[told].u >= BAR[1] ? lineFor(told) : "";
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

  // One scrubbed clock drives whichever layout is showing. Where the plate is
  // taller than the screen (phones), the story runs for as long as the plate
  // takes to arrive: trees first, then the forest plot.
  const mm = gsap.matchMedia();
  const stage = (view: View, m: Mode, vars: Parameters<typeof scrubbed>[1]) => () => {
    active = view;
    mode = m;
    hover = keys = held = shown = turn = -1;
    for (const v of views) { v.setFocus(-1); v.setCur(-1); v.setKeys(-1, -1); }
    rove();
    view.setMode(m);
    const tl = scrubbed(root, vars);
    trigger = tl.scrollTrigger;
    tl.fromTo(st, { p: 0 }, { p: 1, duration: 1, ease: "none" });
    tl.eventCallback("onUpdate", update);
    st.p = 0;
    update();
  };
  mm.add("(min-width: 920px)", stage(wideView, "side", { start: "top 85%", end: "center 45%" }));
  mm.add("(min-width: 720px) and (max-width: 919.98px)", stage(narrowView, "side", { start: "top 85%", end: "center 45%" }));
  mm.add("(max-width: 719.98px)", stage(narrowView, "stack", { start: "top 78%", end: "bottom 80%" }));

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
