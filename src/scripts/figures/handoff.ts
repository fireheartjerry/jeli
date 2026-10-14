import { gsap, scrubbed, phase, q, qa, whileVisible } from "../motion";

// Fig. "handoff": the return campaign of the NeurIPS 2026 workshop paper. One
// seven-node tree, run twice: in B every worker hands back a patch, in C
// workers hand back findings and the root alone writes.
//
// Scroll: one scrubbed clock. The plate lets its sheet out from the top as it
// comes into the window, and the figure is drawn on the sheet as it comes.
// Row names rise as their rows clear and each cost bar opens on its row; the
// verifiers stand; each tree's seven nodes stand as soon as its lowest row
// has, its edges are drawn from the root down, and its writers fill; each
// scale is ruled the moment it is out; and last, at the foot, the bracket is
// set and the estimate and its interval land. Several parts are always at
// work. When each plays is worked out from where it sits in the plate and how
// tall the window is, so the drawing follows the sheet and does not run ahead
// of it.
//
// Every state the story can be stopped in is true. A mark whose length, place
// or count encodes a measurement keeps the geometry the server gave it along
// its scale: a bar is its full length from the first frame it can be seen, a
// dot sits on its value, an interval spans its two ends, and all seven nodes
// of a tree arrive together. What the script changes on such a mark runs
// across the scale: a bar's thickness, a dot's radius, the height of an end
// cap. Structure is drawn on: the edges between nodes that already stand, the
// scales, the leaders. A number is shown once its mark is fully there.
//
// Ambient: the two trees run the same attempt at the same moments, because
// they are the same tree. Leaves hand up, each mid hands up once both of its
// leaves have, the root hands its patch to the verifier. What travels differs
// (squares in B, dots in C) and so does who writes: in B a ring opens round
// every node as it sends its patch, seven a cycle; in C one ring, the root's.
// A ring opens round the verifier as a patch reaches it, and then round the
// estimate those attempts are graded into. Each attempt is timed afresh.
//
// Reading: a tree, a cost row, the difference or the contrast under the
// pointer, a finger or the keyboard steps the rest back and puts its numbers
// in the readout. The column has no dead ground: a pointer crossing it is
// always reading something.

/** A stretch of the scroll story, as two fractions of it. */
type Win = [number, number];
type XY = [number, number];
type Key = "A" | "B" | "C" | "D" | "P";
/** A scale as it is ruled: its baseline, and each tick as [x, length]. */
interface Axis { y: number; x0: number; x1: number; ticks: XY[] }
interface TreeG {
  id: "B" | "C";
  /** Root, two mids, four leaves: [x, y, r]. */
  nodes: [number, number, number][];
  /** Child to parent: two into the root, then four into the mids. c and p index the nodes. */
  edges: { len: number; lv: number; a: XY; b: XY; c: number; p: number }[];
  stub: { len: number; a: XY; b: XY };
  /** The verifier's box, and the radius of the ring round a sole writer. */
  vf: [number, number, number, number];
  halo: number;
}
interface Geo {
  /** The drawing's height. */
  H: number;
  /** Heights in the drawing that the story is timed by. */
  ys: { vf: number; leaf: number; arm: number; ret: number; foot: number; rows: number[]; dim: number; kAxis: number; brk: number; wh: number; pAxis: number };
  trees: TreeG[];
  side: number; dot: number;
  cost: Axis; con: Axis;
  dim: { xb: number; yb: number; xc: number; yc: number; y: number };
  brk: { x1: number; x2: number; y: number; drop: number };
  iv: { lo: number; hi: number; y: number; cap: number };
  /** What a picked part reads out. */
  say: Record<Key, string>;
  /** The plate readout's lines for the scroll story. Every number in them is written with the data, in the component. */
  story: { trees: string; writers: string; costs: string; power: string; ci: string };
}
/** When a height in the drawing comes clear of the plate's edge, as a fraction of the story. */
type Clear = (y: number) => number;

const NS = "http://www.w3.org/2000/svg";
/** The house curve for anything coming to rest (motion.ts registers it). */
const arrive = gsap.parseEase("arrive");
const smooth = (u: number) => u * u * (3 - 2 * u);
const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// One attempt, in seconds. A handoff takes TRAVEL to climb an edge; a mid sends
// its own MERGE after its second leaf arrives, the root WRITEs once both mids
// have reported, and its patch takes STUB to reach the verifier.
const TRAVEL = 0.64, STUB = 0.46, MERGE = 0.22, WRITE = 0.32, REST = 1.4;
/** How long a ring takes to open and go: round a writer, round the verifier, round the estimate. */
const RING = 0.55, CHECK = 0.6, GRADE = 1.05;
/** How far what is not being read steps back, and how long that takes. */
const DIM = 0.34, FOCUS = 0.32;
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
/** A shift down the page, in user units. It moves a part within its row and never along a scale. */
const shift = (el: Element, y: number) => {
  const s = slot(el), n = Math.round(y * 100);
  if (s.y === n) return;
  s.y = n;
  (el as SVGElement).style.transform = n ? `translateY(${n / 100}px)` : "";
};
/** How far a tree's writers are filled in, 0 to 1 (the component's CSS mixes the fill from it). */
const fillIn = (el: SVGElement, v: number) => {
  const s = slot(el), n = Math.round(v * 1000);
  if (s.w === n) return;
  s.w = n;
  el.style.setProperty("--w", String(n / 1000));
};
/** A stroke drawn on along its own length: u from 0 (nothing) to 1 (all of it). `back` draws it from its far end. */
const draw = (el: SVGElement, len: number, u: number, back = false) => {
  const s = slot(el), n = Math.round(len * (1 - u) * 100) * (back ? -1 : 1);
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
  const make = <K extends keyof SVGElementTagNameMap>(tag: K, cls: string) => {
    const el = document.createElementNS(NS, tag);
    el.setAttribute("class", cls);
    el.style.opacity = "0";
    return el;
  };

  // ---- trees ----
  const sep = svg.querySelector<SVGPathElement>(".sep");
  const sepLen = sep ? sep.getTotalLength() : 0;
  const trees = qa<SVGGElement>(svg, ".tree").map((g, ti) => {
    const d = G.trees[ti];
    const edges = qa<SVGPathElement>(g, ".edge");
    const stub = q<SVGPathElement>(g, ".stub");
    const vfTick = q<SVGPathElement>(g, ".vf-k"), vfLen = vfTick.getTotalLength();
    const lead = q<SVGPathElement>(g, ".lead"), leadLen = lead.getTotalLength();
    const nodes = qa<SVGCircleElement>(g, ".nd");
    const pk = q<SVGGElement>(g, ".pk");
    pk.replaceChildren(); // the still frame gives way to live handoffs

    // The handoffs: one per edge and one for the root's patch. They are made
    // once, here, and after that only moved; every edge is a straight line, so
    // a place on it is plain arithmetic.
    const patch = d.id === "B";
    const glyph = (square: boolean) => {
      const el = make(square ? "rect" : "circle", square ? "pk-patch" : "pk-find");
      if (square) {
        el.setAttribute("x", String(-G.side / 2));
        el.setAttribute("y", String(-G.side / 2));
        el.setAttribute("width", String(G.side));
        el.setAttribute("height", String(G.side));
      } else {
        el.setAttribute("r", String(G.dot));
      }
      pk.append(el);
      return el;
    };
    const glyphs = [...d.edges.map((e) => ({ el: glyph(patch), a: e.a, b: e.b })), { el: glyph(true), a: d.stub.a, b: d.stub.b }];

    // A ring for every node that writes: all seven in B. In C the root alone
    // writes, and its ring is the one the server already drew round it.
    const halo = g.querySelector<SVGCircleElement>(".halo");
    const rings = d.nodes.map(([x, y]) => {
      if (!patch) return null;
      const el = make("circle", "wr");
      el.setAttribute("cx", String(x));
      el.setAttribute("cy", String(y));
      g.append(el);
      return el;
    });
    const check = make("rect", "vf-p");
    g.append(check);
    return {
      g, d, edges, stub, glyphs, rings, halo, check, patch,
      opened: false, // the sole writer's ring is open, and the ambient loop has it
      nodes, radii: nodes.map((n) => Number(n.getAttribute("r"))), // the radii the server drew
      vfBox: q<SVGRectElement>(g, ".vf-r"), vfTick, vfLen, vfText: q<SVGTextElement>(g, ".vf-t"),
      lead, leadLen, ct: q<SVGTextElement>(g, ".ct"),
      arm: q<SVGTextElement>(g, ".arm"), ret: q<SVGGElement>(g, ".ret"),
    };
  });
  const foot = q<SVGTextElement>(svg, ".foot");

  // ---- cost ----
  const cost = q<SVGGElement>(svg, ".cost");
  const kScale = scaleOf(q<SVGGElement>(cost, ".scale"), G.cost);
  const crows = qa<SVGGElement>(svg, ".crow").map((g) => {
    const bar = q<SVGRectElement>(g, ".bar");
    const h = Number(bar.getAttribute("height"));
    return { g, bar, h, yc: Number(bar.getAttribute("y")) + h / 2, cv: q<SVGTextElement>(g, ".cv"), al: q<SVGTextElement>(g, ".al") };
  });
  const dcost = q<SVGGElement>(svg, ".dcost");
  const dim = q<SVGPathElement>(dcost, ".dim"), dimh = q<SVGPathElement>(dcost, ".dimh");
  const dimD = dim.getAttribute("d")!;
  const dl = q<SVGTextElement>(dcost, ".dl");

  // ---- contrast ----
  const con = q<SVGGElement>(svg, ".con");
  const pScale = scaleOf(q<SVGGElement>(con, ".scale"), G.con);
  const band = q<SVGRectElement>(con, ".band");
  const zero = q<SVGLineElement>(con, ".zero");
  const zeroLen = Number(zero.getAttribute("y2")) - Number(zero.getAttribute("y1"));
  const brk = q<SVGPathElement>(con, ".brk"), brkD = brk.getAttribute("d")!;
  const brl = q<SVGTextElement>(con, ".brl");
  const bres = qa<SVGTextElement>(con, ".bre");
  const wh = q<SVGLineElement>(con, ".wh");
  const caps = q<SVGPathElement>(con, ".caps"), capsD = caps.getAttribute("d")!;
  const pt = q<SVGCircleElement>(con, ".pt"), ptR = Number(pt.getAttribute("r"));
  const nv = q<SVGTextElement>(con, ".nv");
  const nlo = q<SVGTextElement>(con, ".nlo");
  const nhi = q<SVGTextElement>(con, ".nhi");
  const np = q<SVGTextElement>(con, ".np");
  const verdict = q<SVGTextElement>(con, ".verdict");
  // The ring that opens round the estimate as an attempt is graded. It stays centred on the measured value.
  const grade = make("circle", "pt-p");
  grade.setAttribute("cx", pt.getAttribute("cx")!);
  grade.setAttribute("cy", pt.getAttribute("cy")!);
  pt.before(grade);

  const st = { flowing: false, landed: false, done: { t: false, k: false, d: false, p: false } };

  // ---------- the plan: when each part plays ----------
  // Every window is a stretch of the story, [from, to], as fractions of it.
  // They are worked out from where each part sits in the plate, each time the
  // page is measured: `c(y)` is when height y of the drawing has come clear of
  // the plate's edge, and R is the story's length in px of scroll.
  const W: Record<string, Win> = {};
  let Wal: Win[] = [], Wbar: Win[] = [], Wcv: Win[] = [];
  /** The plate readout's lines, each with the moment the story has earned it. */
  let lines: [number, string][] = [[-1, G.story.trees]];
  let flowAt = 2, drawn = -1, said = G.story.trees;
  function plan(c: Clear, R: number) {
    const d = (px: number) => px / R;
    const w = (at: number, px: number): Win => [at, at + d(px)];
    const Y = G.ys;

    // Set out, as the sheet comes out. Row names rise as their rows clear, and
    // each verifier stands as soon as its row has. A tree's seven nodes stand
    // once its lowest row is clear, so it is never seen as a smaller tree; its
    // edges follow, from the root down, and then the root is joined to its
    // verifier. Each scale is ruled once it is out.
    W.sep = [c(0), c(G.H)];
    Wal = Y.rows.map((y) => w(c(y + 8), 70));
    const V = c(Y.vf + 12);
    W.vfBox = w(V, 44);
    W.vfTick = w(V + d(24), 44);
    W.vfText = w(V + d(8), 56);
    const N = c(Y.leaf + 6);
    W.nodes = w(N, 50);
    W.edge0 = w(N + d(16), 36);
    W.edge1 = w(N + d(32), 36);
    W.stub = w(N + d(44), 30);
    const joined = N + d(66);
    W.arm = w(Math.max(c(Y.arm + 8), N + d(16)), 64);
    W.ret = w(Math.max(c(Y.ret + 8), N + d(40)), 64);
    W.foot = w(c(Y.foot + 8), 76);
    W.kAxis = w(c(Y.kAxis + 22), 96);
    W.pAxis = w(c(Y.pAxis + 22), 96);
    W.zero = [c(Y.brk + 12), Math.max(c(Y.pAxis + 6), c(Y.brk + 12) + d(30))];

    // The measurements land as their own ground comes clear. Each cost bar,
    // as its row does, a beat after the one above; then the difference
    // between the last two.
    Wbar = [];
    Y.rows.forEach((y, i) => Wbar.push(w(Math.max(c(y + 20), i ? Wbar[i - 1][0] + d(34) : 0), 56)));
    Wcv = Wbar.map((b) => w(b[1], 36));
    const paid = Wbar[2][1];
    const g = Math.max(c(Y.dim + 18), paid + d(6));
    W.drop = w(g, 40);
    W.dimh = w(g + d(30), 30);
    W.dl = w(g + d(60), 44);
    // Who writes, once the trees are joined: the writers fill, the sole
    // writer's ring opens, and the two counts are led out and named.
    W.fill = w(joined, 36);
    W.halo = w(joined + d(12), 44);
    W.lead = w(joined + d(20), 32);
    W.ct = w(joined + d(36), 36);
    const wrote = W.ct[1];
    // The contrast, once its bracket's ground is clear, the costs are down and
    // the writers have had a moment on the readout: the bracket, the estimate,
    // its interval, the verdict.
    const m0 = Math.max(c(Y.brk + 12), paid - d(10), wrote + d(34));
    W.mark = w(m0, 46);
    W.brl = w(m0 + d(46), 36);
    W.bre = w(m0 + d(52), 36);
    const e0 = Math.max(c(Y.wh + 14), m0 + d(70));
    W.pt = w(e0, 40);
    W.nv = w(e0 + d(40), 36);
    W.wh = w(e0 + d(28), 40);
    W.caps = w(e0 + d(36), 52);
    W.ends = w(e0 + d(88), 36);
    W.np = w(e0 + d(100), 36);
    W.verdict = w(e0 + d(118), 46);
    // If the window is too short for all of that, the contrast is drawn
    // closer together, so the story still ends on time. (A part may then be
    // drawn a little before the sheet reaches it, and is let out with it.)
    const all = [...Object.values(W), ...Wal, ...Wbar, ...Wcv];
    const last = Math.max(...all.map((x) => x[1]));
    if (last > 1 && m0 < 1) {
      const k = (1 - m0) / (last - m0);
      for (const x of all) for (let i = 0; i < 2; i++) if (x[i] > m0) x[i] = m0 + (x[i] - m0) * k;
    }
    const S = G.story;
    // The readout holds the latest thing the story has shown, and a line with a
    // number in it only once that number's mark is fully there.
    lines = spaced([[-1, S.trees], [Wbar[2][1], S.costs], [W.ct[1], S.writers], [W.mark[1], S.power], [W.caps[1], S.ci]], d(84));
    flowAt = W.fill[1];
    drawn = -1;
  }
  // Until the page has been measured: a plan that draws nothing early.
  plan((y) => 0.1 + (0.5 * y) / G.H, 600);

  /** True when a value has changed since it was last asked about, so a path is rebuilt only then. */
  const moved = (el: Element, key: string, v: number) => {
    const sl = slot(el), n = Math.round(v * 1000);
    if (sl[key] === n) return false;
    sl[key] = n;
    return true;
  };

  /** The scroll story at progress p. Returns the line for the plate readout. */
  function render(p: number): string {
    if (p === drawn) return said;
    drawn = p;
    const u = (x: Win) => phase(p, x[0], x[1]);

    // The trees.
    if (sep) draw(sep, sepLen, u(W.sep));
    const born = u(W.nodes), e0 = u(W.edge0), e1 = u(W.edge1), full = u(W.fill), open = u(W.halo);
    for (const t of trees) {
      t.nodes.forEach((n, i) => openDot(n, t.radii[i], born));
      rise(t.arm, u(W.arm));
      // Edges are stored child to parent, and are drawn from the root down.
      t.edges.forEach((e, i) => draw(e, t.d.edges[i].len, t.d.edges[i].lv === 0 ? e0 : e1, true));
      // The root hands its patch to the verifier in both arms.
      draw(t.stub, t.d.stub.len, u(W.stub));
      op(t.vfBox, u(W.vfBox));
      draw(t.vfTick, t.vfLen, u(W.vfTick));
      rise(t.vfText, u(W.vfText), 3);
      rise(t.ret, u(W.ret));
      // Who may change the delivered code: every node in B, the root alone in C.
      // They fill in together, and their count is printed once they are full.
      fillIn(t.g, full);
      if (t.halo) {
        // The sole writer's ring opens out from its rim. Once open, the ambient loop has its radius.
        if (open < 1 || !t.opened) num(t.halo, "r", t.radii[0] + (t.d.halo - t.radii[0]) * arrive(open));
        t.opened = open >= 1;
        op(t.halo, open * 2);
      }
      draw(t.lead, t.leadLen, u(W.lead));
      rise(t.ct, u(W.ct), 3);
    }
    rise(foot, u(W.foot));

    // The cost. Its scale is ruled; then each bar opens to its thickness, at its
    // full measured length from the first frame, one arm after another, and each
    // is followed by its dollar figure.
    rule(kScale, u(W.kAxis));
    crows.forEach((r, i) => {
      rise(r.al, u(Wal[i]));
      const b = u(Wbar[i]), thick = 0.14 + 0.86 * arrive(b);
      num(r.bar, "y", r.yc - (r.h * thick) / 2);
      num(r.bar, "height", r.h * thick);
      op(r.bar, b * 2.4);
      rise(r.cv, u(Wcv[i]));
    });
    // The difference: a drop from the end of each of the two bars, the line between them, then its number.
    const drop = u(W.drop), D = G.dim;
    if (moved(dim, "u", drop)) {
      str(dim, "d", drop >= 1 ? dimD : `M${D.xb} ${D.yb}V${(D.yb + (D.y - D.yb) * drop).toFixed(2)}M${D.xc} ${D.yc}V${(D.yc + (D.y - D.yc) * drop).toFixed(2)}`);
      op(dim, drop > 0 ? 1 : 0);
    }
    op(dimh, u(W.dimh));
    rise(dl, u(W.dl));

    // The contrast. Its scale is ruled and zero drawn; the bracket is set whole,
    // its two ends opening downward; the estimate lands on its value, then its
    // interval, whole, with its caps opening.
    rule(pScale, u(W.pAxis));
    draw(zero, zeroLen, u(W.zero));
    const set = u(W.mark), B = G.brk;
    op(band, set);
    op(brk, set * 2);
    if (moved(brk, "u", set)) {
      const by = (B.y + B.drop * arrive(set)).toFixed(2);
      str(brk, "d", set >= 1 ? brkD : `M${B.x1} ${by}V${B.y}H${B.x2}V${by}`);
    }
    rise(brl, u(W.brl));
    for (const b of bres) rise(b, u(W.bre), 3);
    openDot(pt, ptR, u(W.pt));
    rise(nv, u(W.nv));
    op(wh, u(W.wh));
    const spread = u(W.caps), I = G.iv;
    if (moved(caps, "u", spread)) {
      const c = I.cap * arrive(spread), y0 = (I.y - c).toFixed(2), tall = (2 * c).toFixed(2);
      str(caps, "d", spread >= 1 ? capsD : `M${I.lo} ${y0}v${tall}M${I.hi} ${y0}v${tall}`);
    }
    op(caps, spread * 3);
    rise(nlo, u(W.ends), 3);
    rise(nhi, u(W.ends), 3);
    rise(np, u(W.np), 3);
    rise(verdict, u(W.verdict), 3);

    // Handoffs travel once the edges stand and the writers are filled.
    st.flowing = p >= flowAt;
    st.landed = p >= W.pt[1];
    st.done.t = p >= W.ct[1];
    st.done.k = p >= Wcv[2][1];
    st.done.d = p >= W.dl[1];
    st.done.p = p >= W.ends[1];
    said = lines[0][1];
    for (const [at, text] of lines) if (p >= at) said = text;
    return said;
  }

  // ---------- ambient: one attempt after another ----------
  // When each handoff sets off, in seconds from the start of the attempt: the
  // two into the root, the four into the mids, then the root's own patch. Both
  // trees read the same times.
  const dep = new Float32Array(7);
  let span = 0, time = 0, life = 0, seed = 0x2f6e2b1;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  function deal() {
    for (let i = 2; i < 6; i++) dep[i] = 0.08 + rnd() * 0.5;
    for (let j = 0; j < 2; j++) dep[j] = Math.max(dep[2 + 2 * j], dep[3 + 2 * j]) + TRAVEL + MERGE + rnd() * 0.22;
    dep[6] = Math.max(dep[0], dep[1]) + TRAVEL + WRITE;
    span = dep[6] + STUB + REST;
  }
  /** A ring opening from radius r0 to r0 + by: it comes up over its first frames and fades as it goes. u runs 0 to 1; outside that there is no ring. */
  const ring = (el: Element, u: number, r0: number, by: number, strength: number) => {
    if (u <= 0 || u >= 1) return op(el, 0);
    num(el, "r", r0 + by * arrive(u));
    op(el, strength * Math.min(1, u * 7) * (1 - u) * life);
  };

  function ambient(dt: number) {
    if (!st.flowing && life === 0) return;
    if (life === 0) {
      // A fresh attempt, timed afresh.
      time = 0;
      deal();
    }
    // The handoffs come up and go down over a few frames; nothing appears or leaves in one.
    life = clamp(life + (st.flowing ? dt : -dt) / 0.3);
    time += dt;
    if (time >= span) {
      time -= span;
      deal();
    }
    const landed = time - dep[6] - STUB; // seconds since the root's patch reached the verifier
    for (const t of trees) {
      for (let i = 0; i < t.glyphs.length; i++) {
        const g = t.glyphs[i], u = (time - dep[i]) / (i === 6 ? STUB : TRAVEL);
        if (u <= 0 || u >= 1) {
          op(g.el, 0);
          continue;
        }
        const e = smooth(u);
        str(g.el, "transform", `translate(${(g.a[0] + (g.b[0] - g.a[0]) * e).toFixed(2)} ${(g.a[1] + (g.b[1] - g.a[1]) * e).toFixed(2)})`);
        // Each fades in as it leaves a node and out as it reaches the next.
        op(g.el, Math.min(1, u * 6, (1 - u) * 6) * life);
      }
      // A node writes as its patch sets off: the node an edge leaves from, and the root for the stub.
      for (let n = 0; n < t.rings.length; n++) {
        const el = t.rings[n];
        if (el) ring(el, (time - (n === 0 ? dep[6] : dep[n - 1])) / RING, t.radii[n] + 1.5, 5, 0.7);
      }
      if (t.halo && t.opened) {
        // The sole writer: its own ring swells as it writes, and settles back to where the server drew it.
        const u = clamp((time - dep[6]) / (RING * 1.4)), swell = Math.sin(Math.PI * u) * life;
        num(t.halo, "r", t.d.halo + 1.6 * swell);
        const s = slot(t.halo), n = Math.round((0.4 + 0.6 * swell) * 100);
        if (s.so !== n) {
          s.so = n;
          t.halo.style.strokeOpacity = String(n / 100);
        }
      }
      // The verifier takes the patch.
      const u = landed / CHECK, box = t.d.vf;
      if (u <= 0 || u >= 1) op(t.check, 0);
      else {
        const by = 4.5 * arrive(u);
        num(t.check, "x", box[0] - by);
        num(t.check, "y", box[1] - by);
        num(t.check, "width", box[2] + 2 * by);
        num(t.check, "height", box[3] + 2 * by);
        num(t.check, "rx", 2.5 + by);
        op(t.check, 0.8 * Math.min(1, u * 7) * (1 - u) * life);
      }
    }
    // The attempt is graded: a ring opens round the estimate, once the estimate stands.
    if (st.landed) ring(grade, (landed - 0.2) / GRADE, ptR + 1.5, 9, 0.75);
    else op(grade, 0);
  }

  // ---------- reading ----------
  // What is not being read steps back, on the page's clock and its curve, and
  // a change of mind part-way is taken up from where each part has got to.
  const parts = [
    ...trees.map((t) => ({ el: t.g as SVGElement, on: (k: Key) => k === t.d.id })),
    ...crows.map((r, i) => ({ el: r.g as SVGElement, on: (k: Key) => k === "ABC"[i] || (k === "D" && i > 0) })),
    { el: dcost as SVGElement, on: (k: Key) => k === "D" },
    { el: con as SVGElement, on: (k: Key) => k === "P" },
  ].map((part) => ({ ...part, now: 1, from: 1, to: 1 }));
  const fade = { v: 1 };
  function mark(k: Key | null) {
    for (const part of parts) {
      part.from = part.now;
      part.to = !k || part.on(k) ? 1 : DIM;
    }
    gsap.killTweensOf(fade);
    fade.v = 0;
    gsap.to(fade, {
      v: 1, duration: FOCUS, ease: "arrive",
      onUpdate() {
        for (const part of parts) {
          part.now = part.from + (part.to - part.from) * fade.v;
          op(part.el, part.now);
        }
      },
    });
  }
  /** A part can be read only once the story has drawn it. */
  const ready = (k: Key) => (k === "P" ? st.done.p : k === "D" ? st.done.d : k === "A" ? st.done.k : st.done.t && st.done.k);

  // The hit targets sit in their own layer, in reading order. A tree and its
  // cost row share a key; the row is the keyboard's part, the tree the pointer's.
  const hits = qa<SVGRectElement>(svg, ".hits .hit").map((hit) => ({ hit, k: hit.dataset.k as Key }));
  return { svg, G, plan, render, ambient, mark, ready, hits, keys: hits.filter((h) => h.hit.hasAttribute("tabindex")) };
}

export default function (root: HTMLElement) {
  const svgs = qa<SVGSVGElement>(root, "svg.ho"); // side by side, then stacked
  type View = ReturnType<typeof bind>;
  const readout = root.querySelector<HTMLElement>("[data-readout]");
  let line = readout?.textContent ?? ""; // what the readout holds, so it is never read back
  const say = (s: string) => {
    if (!readout || s === line) return;
    readout.textContent = line = s;
  };

  let p = 0;
  let story = "";
  let pick: Key | null = null;

  // Keyboard. A part is read only once its mark is drawn, and a reader who
  // arrives by Tab can be anywhere in the scroll story, so keyboard focus
  // finishes the drawing first (force runs the story on to its end).
  const force = { v: 0 };
  let kb: { v: View; k: Key; said: boolean; hit: SVGRectElement } | null = null;
  let held: Key | null = null; // Enter or Space holds a reading after focus moves on
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
  function set(next: Key | null) {
    clearTimeout(timer);
    clearTimeout(away);
    if (pick === next) return;
    pick = next;
    live.mark(pick);
    say(pick ? live.G.say[pick] : story);
  }
  /** What shows when the pointer leaves: a held reading, else the focused part, else the story. */
  const rest = (): Key | null => held ?? (kb && kb.v.ready(kb.k) ? kb.k : null);
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
      announce(live.G.say[kb.k]);
    }
    say(pick ? live.G.say[pick] : story);
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
    for (const v of views) v?.keys.forEach((h) => h.hit.setAttribute("aria-pressed", String(held === h.k)));
  };

  // Pointer, touch or keyboard: a tree, a cost row or the contrast writes its exact numbers to the readout.
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
        if (pick === k) return set(rest());
        set(k);
        // A finger lifts at once, so its reading stays up for a moment.
        timer = window.setTimeout(() => set(rest()), 2600);
      });
    });
    // The keyboard's parts: served as labelled graphics, now buttons.
    v.keys.forEach(({ hit, k }, n) => {
      hit.setAttribute("role", "button");
      hit.setAttribute("aria-pressed", String(held === k));
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
        if (pick === mine.k) set(rest());
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
            held = held === k ? null : k;
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
  }).observe(q<HTMLElement>(root, ".ho-box"));

  // Handoffs travel only in the layout on screen, and only while the plate is.
  whileVisible(root, (dt) => live.ambient(dt));

  // Leaving the figure lets the scroll story take the drawing back, unless a reading is held.
  root.addEventListener("focusout", (e) => {
    if (!held && !root.contains(e.relatedTarget as Node | null)) finish(false);
  });
}
