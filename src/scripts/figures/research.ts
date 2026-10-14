import { gsap, qa, q, trail, whileVisible, T } from "../motion";
import { aBallistic, lBallistic, aClosure, respL, respA, BIN } from "../geo/research";

/**
 * Three results, one panel each. The plate is taller than most windows can
 * show at once, so each panel tells its story while it is the one coming
 * into view, and the three overlap as they pass:
 *
 *   (a) the three mass ratios run down one line together while the table
 *       beside them counts three different separations and one L;
 *   (b) two runs advance side by side with the gap between them opening, and
 *       a closer look unfolds from the last orbits to watch the landing;
 *   (c) the response is swept across every velocity, the pair beside it
 *       answering as the sign turns.
 *
 * A finished panel can then be read with the pointer, a finger or the arrow
 * keys: the same cursor in each, and the numbers beside it are computed from
 * the formulas that drew the curves. Taking up a reading and letting it go
 * are both moves, never cuts.
 */

type Pt = [number, number];
type Key = "a" | "b" | "c";
interface Line { q: number; x0: number; y0: number; x1: number; y1: number; ec: number }
interface Geo {
  W: number; H: number; L: number; R: number; T: number; B: number; SX: number; SW: number;
  blocks: { top: number; bottom: number }[];
  a: { curves: Pt[][]; q0: number[]; fmax: number; y0: number; lo: number; hi: number; lead: number };
  b: {
    curve: Pt[]; x0: number; yOne: number; yFin: number; y0: number; lo: number; hi: number; q0: number; tmax: number; err: string;
    z: { t0: number; t1: number; lo: number; hi: number }; zCurve: Pt[]; brk: number;
    zx0: number; zx1: number; zy0: number; zy1: number; zbox: number[]; tag: number[];
  };
  c: {
    lines: Line[]; lo: number; hi: number; y0: number; arrowAng: number;
    bn: { cx: number; cy: number; th: number; qi: number; eta: number; k: number; lab: number };
  };
}

/**
 * One panel's reading. `v` is the place on its axis; `back` is how far the
 * reading has been let go (0 held, 1 gone); `force` finishes the panel's
 * story for a reader who asks for a reading before the scroll has drawn it.
 * (c) also has the series picked, and the mass ratio the pair is drawn at,
 * which follows the pick over a moment. `off` is what is left of a hop: when
 * a reading moves a long way at once (from the middle panel into its closer
 * look, or a long step from the keyboard) the cursor crosses the distance
 * over a moment instead of in one frame.
 */
interface Reading { v: number; off: number; back: number; force: number; held: boolean; qi: number; qv: number; tw: gsap.core.Timeline | null }
type Story = Record<Key, number>;
type Readings = Record<Key, Reading>;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const f2 = (v: number) => v.toFixed(2);
const sgn = (v: number) => `${v < 0 ? "−" : "+"}${Math.abs(v).toFixed(2)}`;

/** A polyline cut at fraction u of its samples, plus the point where it ends. */
function partial(pts: Pt[], u: number): [string, Pt] {
  const n = pts.length - 1;
  const k = clamp01(u) * n;
  const i = Math.min(Math.floor(k), n - 1);
  const t = k - i;
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let j = 1; j <= i; j++) d += `L${pts[j][0]} ${pts[j][1]}`;
  const end: Pt = [lerp(pts[i][0], pts[i + 1][0], t), lerp(pts[i][1], pts[i + 1][1], t)];
  d += `L${end[0].toFixed(2)} ${end[1].toFixed(2)}`;
  return [d, end];
}

const verdictL = (v: number) => (Math.abs(v) < 0.005 ? "L holds" : v > 0 ? "L rises" : "L falls");
const verdictA = (v: number) => (Math.abs(v) < 0.005 ? "holds" : v > 0 ? "widens" : "shrinks");

/** Wire one layout of the plot. Everything positional comes from its own geometry. */
function bind(svg: SVGSVGElement) {
  const root = svg;
  const G: Geo = JSON.parse(svg.dataset.g!);
  // Attributes and text are written only when they change: three panels are redrawn a frame.
  const last = new Map<Element, Record<string, string>>();
  const set = (el: Element, name: string, v: string) => {
    let m = last.get(el);
    if (!m) last.set(el, (m = {}));
    if (m[name] === v) return;
    m[name] = v;
    if (name === "text") el.textContent = v;
    else if (name === "opacity") (el as SVGElement).style.opacity = v;
    else el.setAttribute(name, v);
  };
  const op = (el: Element, v: number) => set(el, "opacity", v <= 0 ? "0" : v >= 1 ? "1" : v.toFixed(3));
  const text = (el: Element, s: string) => set(el, "text", s);

  // ---- (a) ----
  const ref = q<SVGPathElement>(root, ".ref");
  const lcs = qa<SVGPathElement>(root, ".lc");
  const arows = qa<SVGGElement>(root, ".arow");
  const aVals = qa<SVGTextElement>(root, ".arow text.strong");
  const alsum = q<SVGGElement>(root, ".alsum");
  const lVals = qa<SVGTextElement>(root, ".alsum text.acc");
  const fv = q<SVGTSpanElement>(root, ".fv");
  const acall = q<SVGGElement>(root, ".acall");
  const aLead = q<SVGPathElement>(acall, ".lead");
  const aLeadDot = q<SVGCircleElement>(acall, ".lead-dot");
  const aLeadText = q<SVGGElement>(acall, ".atext");
  aLead.style.strokeDasharray = `${G.a.lead} ${G.a.lead}`;
  const ha = q<SVGCircleElement>(root, ".ha");
  const curaLine = q<SVGLineElement>(root, ".cura");
  const refPts: Pt[] = [G.a.curves[0][0], G.a.curves[0][G.a.curves[0].length - 1]];
  const axOf = (f: number) => lerp(G.L, G.R, f / G.a.fmax);
  const ayOf = (v: number) => G.a.y0 + G.B - ((v - G.a.lo) / (G.a.hi - G.a.lo)) * (G.B - G.T);

  // ---- (b) ----
  const anline = q<SVGLineElement>(root, ".anline");
  const noc = q<SVGPathElement>(root, ".noc");
  const clo = q<SVGPathElement>(root, ".clo");
  const hn = q<SVGCircleElement>(root, ".hn");
  const hc = q<SVGCircleElement>(root, ".hc");
  const gap = q<SVGLineElement>(root, ".gap");
  const nocl = q<SVGGElement>(root, ".nocl");
  const anl = q<SVGGElement>(root, ".anl");
  const clol = q<SVGGElement>(root, ".clol");
  const zbox = q<SVGRectElement>(root, ".zbox");
  const zcon = q<SVGPathElement>(root, ".zcon");
  const zoom = q<SVGGElement>(root, ".zoom");
  const zclo = q<SVGPathElement>(root, ".zclo");
  const zhc = q<SVGCircleElement>(root, ".zhc");
  const zring = q<SVGCircleElement>(root, ".zring");
  const zv = q<SVGTextElement>(root, ".zv");
  const zbrk = q<SVGPathElement>(root, ".zbrk");
  const zbrkx = q<SVGPathElement>(root, ".zbrkx");
  const zbl = q<SVGGElement>(root, ".zbl");
  const curb = q<SVGGElement>(root, ".curb");
  const curbLine = q<SVGLineElement>(root, ".curbl");
  const cdn = q<SVGCircleElement>(curb, ".cdn");
  const cdc = q<SVGCircleElement>(curb, ".cdc");
  const cbk = q<SVGRectElement>(curb, ".cbk");
  const cvt = q<SVGTextElement>(curb, ".cvt");
  const zcurLine = q<SVGLineElement>(root, ".zcurl");
  const zcurDot = q<SVGCircleElement>(root, ".zcur");
  const zLen = G.b.brk;
  zbrk.style.strokeDasharray = `${zLen} ${zLen}`;
  const boxLen = 2 * (G.b.zbox[2] + G.b.zbox[3]);
  const Z = G.b.z;
  const bxOf = (t: number) => lerp(G.b.x0, G.R, t / G.b.tmax);
  const byOf = (v: number) => G.b.y0 + G.B - ((v - G.b.lo) / (G.b.hi - G.b.lo)) * (G.B - G.T);
  const zxOf = (t: number) => lerp(G.b.zx0, G.b.zx1, (t - Z.t0) / (Z.t1 - Z.t0));
  const zyOf = (v: number) => lerp(G.b.zy0, G.b.zy1, (v - Z.lo) / (Z.hi - Z.lo));
  const aAt = (t: number) => aClosure(t, G.b.q0, G.b.tmax);

  // ---- (c) ----
  const cls = qa<SVGLineElement>(root, ".cl");
  const ecs = qa<SVGCircleElement>(root, ".ec");
  const ects = qa<SVGTextElement>(root, ".ect");
  const drops = qa<SVGLineElement>(root, ".drop");
  const below = q<SVGRectElement>(root, ".below");
  const cAnn = qa<SVGGElement>(root, ".cann");
  const curc = q<SVGGElement>(root, ".curc");
  const curcLine = q<SVGLineElement>(root, ".curcl");
  const cds = qa<SVGCircleElement>(curc, ".cd");
  const lines = G.c.lines;
  const cxOf = (eta: number) => lerp(G.L, G.R, eta);
  const cyOf = (v: number) => G.c.y0 + G.B - ((v - G.c.lo) / (G.c.hi - G.c.lo)) * (G.B - G.T);
  const vOf = (y: number) => G.c.lo + ((G.c.y0 + G.B - y) / (G.B - G.T)) * (G.c.hi - G.c.lo);

  // The pair beside (c).
  const bin = q<SVGGElement>(root, ".bin");
  const chips = qa<SVGGElement>(root, ".chip");
  const beta = q<SVGTextElement>(root, ".beta");
  const o1 = q<SVGCircleElement>(root, ".o1");
  const o2 = q<SVGCircleElement>(root, ".o2");
  const a1 = q<SVGCircleElement>(root, ".a1");
  const a2 = q<SVGCircleElement>(root, ".a2");
  const rip = q<SVGCircleElement>(root, ".rip");
  const barr = q<SVGPathElement>(root, ".barr");
  const strm = q<SVGPathElement>(root, ".strm");
  const st1 = q<SVGCircleElement>(root, ".st1");
  const st2 = q<SVGCircleElement>(root, ".st2");
  // (Each label is set twice: the words, and under them the same words as a margin of the inset's ground.)
  const sl1 = qa<SVGTextElement>(root, ".sl1");
  const sl2 = qa<SVGTextElement>(root, ".sl2");
  const bverd = q<SVGTextElement>(root, ".bverd");
  const bdl = q<SVGTextElement>(root, ".bdl");
  const bda = q<SVGTextElement>(root, ".bda");
  const pks = qa<SVGCircleElement>(root, ".pk");
  const BN = G.c.bn;
  const etaTs = beta.querySelector("tspan")!;
  // The diagram's state, mutated in place (the ambient loop runs every frame).
  const bs = { q: -1, eta: -1, e: 0, r1: 0, r2: 0, s1: 0, s2: 0, th: BN.th, sx0: 0, sy0: 0, sx1: 0, sy1: 0 };
  // The gas between them: parcels that leave the donor one at a time, and the ring each sets off when it lands.
  const parcels = pks.map(() => -1); // how far across each is, or -1 while it waits
  const flow = { wait: 0.9, n: 0, ring: -1 };

  function setBinary(qv: number, eta: number) {
    if (Math.abs(qv - bs.q) < 1e-5 && Math.abs(eta - bs.eta) < 1e-4) return;
    bs.q = qv;
    bs.eta = eta;
    const m1 = qv / (1 + qv), m2 = 1 / (1 + qv);
    const da = respA(eta, qv), dl = respL(eta, qv);
    bs.e = BIN.EMAX * Math.tanh(da / 2);
    bs.r1 = BN.k * BIN.A0 * m2;
    bs.r2 = BN.k * BIN.A0 * m1;
    bs.s1 = BN.k * (2.6 + 6 * Math.cbrt(m1));
    bs.s2 = BN.k * (2.6 + 6 * Math.cbrt(m2));
    set(o1, "r", f2(bs.r1));
    set(o2, "r", f2(bs.r2));
    set(a1, "r", f2(bs.r1 * (1 + bs.e)));
    set(a2, "r", f2(bs.r2 * (1 + bs.e)));
    // Where the separation is not moving there is no second orbit to show; it comes and goes over a short stretch, not at a point.
    const moving = seg(Math.abs(bs.e), 0.002, 0.02);
    op(a1, moving);
    op(a2, moving);
    op(barr, moving);
    set(st1, "r", f2(bs.s1));
    set(st2, "r", f2(bs.s2));
    // Radial arrow on the donor's ring, pointing the way the separation moves.
    const ca = Math.cos(G.c.arrowAng), sa = Math.sin(G.c.arrowAng);
    const sg = Math.sign(bs.e) || 1;
    const r0 = bs.r1 + 4 * sg, r1 = bs.r1 * (1 + bs.e) + 1.5 * sg;
    const x0 = BN.cx + r0 * ca, y0 = BN.cy + r0 * sa, x1 = BN.cx + r1 * ca, y1 = BN.cy + r1 * sa;
    const d = Math.sign(r1 - r0) || 1;
    const hx = ca * d, hy = sa * d;
    set(
      barr,
      "d",
      `M${f2(x0)} ${f2(y0)}L${f2(x1)} ${f2(y1)}M${f2(x1 - 4 * hx - 3 * hy)} ${f2(y1 - 4 * hy + 3 * hx)}L${f2(x1)} ${f2(y1)}L${f2(x1 - 4 * hx + 3 * hy)} ${f2(y1 - 4 * hy - 3 * hx)}`,
    );
    text(etaTs, ` = ${f2(eta)}`);
    text(bverd, `orbit ${verdictA(da)}`);
    text(bdl, sgn(dl));
    text(bda, sgn(da));
    placeStars();
  }

  function placeStars() {
    const c = Math.cos(bs.th), s = Math.sin(bs.th);
    const x1 = BN.cx + bs.r1 * c, y1 = BN.cy + bs.r1 * s;
    const x2 = BN.cx - bs.r2 * c, y2 = BN.cy - bs.r2 * s;
    st1.setAttribute("cx", f2(x1));
    st1.setAttribute("cy", f2(y1));
    st2.setAttribute("cx", f2(x2));
    st2.setAttribute("cy", f2(y2));
    const l1x = f2(x1 + c * (bs.s1 + BN.lab)), l1y = f2(y1 + s * (bs.s1 + BN.lab - 2));
    const l2x = f2(x2 - c * (bs.s2 + BN.lab)), l2y = f2(y2 - s * (bs.s2 + BN.lab - 2));
    for (const el of sl1) {
      el.setAttribute("x", l1x);
      el.setAttribute("y", l1y);
    }
    for (const el of sl2) {
      el.setAttribute("x", l2x);
      el.setAttribute("y", l2y);
    }
    // The stream leaves M1 and arrives at M2.
    bs.sx0 = x1 - c * (bs.s1 + 3);
    bs.sy0 = y1 - s * (bs.s1 + 3);
    bs.sx1 = x2 + c * (bs.s2 + 3);
    bs.sy1 = y2 + s * (bs.s2 + 3);
    strm.setAttribute("d", `M${f2(bs.sx0)} ${f2(bs.sy0)}L${f2(bs.sx1)} ${f2(bs.sy1)}`);
  }

  /** (a). `p` is the story so far; `at` is the mass fraction under the cursor, if the panel is being read. */
  function renderA(p: number, at: number | null, show: number): string {
    const drawn = seg(p, 0.14, 0.86);
    const f = at ?? drawn * G.a.fmax;
    // The law first, as the line the three runs are about to be laid on.
    const law = seg(p, 0, 0.14);
    set(ref, "d", partial(refPts, law)[0]);
    op(ref, law > 0 ? 1 : 0);
    G.a.curves.forEach((pts, i) => {
      set(lcs[i], "d", partial(pts, drawn)[0]);
      op(lcs[i], drawn > 0 ? 1 : 0);
      // Its row of the table arrives as the run sets off, and counts as it goes.
      op(arows[i], seg(p, 0.08 + i * 0.025, 0.16 + i * 0.025));
      text(aVals[i], aBallistic(f, G.a.q0[i]).toFixed(3));
    });
    op(alsum, seg(p, 0.14, 0.22));
    lVals.forEach((el, i) => text(el, lBallistic(f, G.a.q0[i]).toFixed(3)));
    text(fv, f >= G.a.fmax - 1e-9 ? `${Math.round(G.a.fmax * 100)}%` : `${(f * 100).toFixed(1)}%`);
    // The callout hangs off the line once the line has passed its foot.
    const call = seg(drawn, 0.34, 0.5);
    op(aLeadDot, seg(call, 0, 0.25));
    aLead.style.strokeDashoffset = (G.a.lead * (1 - seg(call, 0.1, 0.7))).toFixed(2);
    op(aLead, call > 0.1 ? 1 : 0);
    op(aLeadText, seg(call, 0.5, 1));
    // The head rides the line: at the end of what is drawn, or under the cursor.
    const x = axOf(f).toFixed(2);
    set(ha, "cx", x);
    set(ha, "cy", ayOf(lBallistic(f, G.a.q0[0])).toFixed(2));
    op(ha, seg(drawn, 0, 0.03));
    set(curaLine, "x1", x);
    set(curaLine, "x2", x);
    op(curaLine, at === null ? 0 : show);
    return `f = ${(f * 100).toFixed(1)}%  L/L₀ = ${lBallistic(f, G.a.q0[0]).toFixed(3)} for every q₀`;
  }

  /** (b). `at` is the orbit under the cursor, if the panel is being read. */
  function renderB(p: number, at: number | null, show: number): string {
    const t = G.b.tmax * seg(p, 0.08, 0.8);
    const u = t / G.b.tmax;
    const x = bxOf(t);
    // The value the closure has to reach is ruled first.
    const target = seg(p, 0, 0.1);
    set(anline, "x2", lerp(G.L, G.R, target).toFixed(2));
    op(anline, target > 0 ? 1 : 0);
    op(anl, seg(p, 0.04, 0.11));
    // Then both runs set off together: one never leaves 1, the other falls away from it.
    set(noc, "d", `M${G.b.x0} ${G.b.yOne}H${x.toFixed(2)}`);
    const [d, end] = partial(G.b.curve, u);
    set(clo, "d", d);
    const going = seg(p, 0.08, 0.1);
    op(noc, going);
    op(clo, going);
    op(hn, going);
    op(hc, going);
    op(nocl, seg(p, 0.08, 0.14));
    op(clol, seg(u, 0.72, 0.86));
    set(hn, "cx", x.toFixed(2));
    set(hc, "cx", end[0].toFixed(2));
    set(hc, "cy", end[1].toFixed(2));
    // A hairline between the two heads while they run: the gap as it opens. The bracket in the closer look takes over from it.
    set(gap, "x1", x.toFixed(2));
    set(gap, "x2", x.toFixed(2));
    set(gap, "y2", end[1].toFixed(2));
    op(gap, Math.min(seg(t, 1, 5), 1 - seg(p, 0.8, 0.86)));
    // The closer look unfolds from the last orbits as the run nears them: the box is ruled, then the frame it opens into.
    const zo = seg(t, Z.t0 - 8, Z.t0 - 1);
    zbox.style.strokeDasharray = `${(boxLen * seg(zo, 0, 0.55)).toFixed(2)} ${boxLen}`;
    op(zbox, zo > 0 ? 1 : 0);
    op(zcon, seg(zo, 0.25, 0.75));
    op(zoom, seg(zo, 0.4, 1));
    const zu = seg(t, Z.t0, Z.t1);
    const [zd, zend] = partial(G.b.zCurve, zu);
    set(zclo, "d", zd);
    op(zclo, seg(zu, 0, 0.04));
    set(zhc, "cx", zend[0].toFixed(2));
    set(zhc, "cy", zend[1].toFixed(2));
    op(zhc, seg(zu, 0, 0.04));
    const landed = seg(p, 0.8, 0.84);
    op(zring, landed);
    op(zv, landed);
    const k = seg(p, 0.84, 0.95);
    zbrk.style.strokeDashoffset = (zLen * (1 - k)).toFixed(2);
    op(zbrk, k > 0 ? 1 : 0);
    op(zbrkx, seg(k, 0.86, 1));
    op(zbl, seg(p, 0.92, 1));

    // The cursor: both runs at one orbit, and the same orbit in the closer look if it is one of the last six.
    const ct = at ?? G.b.tmax, ca = aAt(ct);
    const cxx = bxOf(ct), cyy = byOf(ca);
    set(curbLine, "x1", cxx.toFixed(2));
    set(curbLine, "x2", cxx.toFixed(2));
    set(cdn, "cx", cxx.toFixed(2));
    set(cdc, "cx", cxx.toFixed(2));
    set(cdc, "cy", cyy.toFixed(2));
    // Its value sits under the curve, to the left of the point, and stops short of the axis.
    const [tw, th] = G.b.tag;
    const tx = Math.max(cxx - 8, G.L + tw + 6);
    set(cvt, "x", tx.toFixed(2));
    set(cvt, "y", (cyy + 13).toFixed(2));
    set(cbk, "x", (tx - tw + 3).toFixed(2));
    set(cbk, "y", (cyy + 13 - th / 2).toFixed(2));
    text(cvt, ca.toFixed(3));
    op(curbLine, at === null ? 0 : show);
    op(curb, at === null ? 0 : show);
    // Inside the last six orbits the closer look has the finer reading; the value here steps aside for it.
    const tagged = 1 - seg(ct, Z.t0 - 2.5, Z.t0 - 1);
    op(cvt, tagged);
    op(cbk, tagged);
    const zt = Math.max(Z.t0, ct), zx = zxOf(zt);
    set(zcurLine, "x1", zx.toFixed(2));
    set(zcurLine, "x2", zx.toFixed(2));
    set(zcurDot, "cx", zx.toFixed(2));
    set(zcurDot, "cy", zyOf(aAt(zt)).toFixed(2));
    const inZoom = at === null ? 0 : show * seg(ct, Z.t0 - 1.5, Z.t0);
    op(zcurLine, inZoom);
    op(zcurDot, inZoom);

    // (A reading gives the separation to the closer look's four places.)
    const rt = at ?? t, ra = aAt(rt);
    return `t = ${at === null ? Math.round(rt) : rt.toFixed(1)}  a/a₀ = ${ra.toFixed(at === null ? 3 : 4)}  no closure +${((1 / ra - 1) * 100).toFixed(1)}%`;
  }

  /** (c). `at` is the velocity weight under the cursor; `qi` the series picked, `qv` the mass ratio the pair is drawn at. */
  function renderC(p: number, at: number | null, show: number, qi: number, qv: number): string {
    const story = seg(p, 0.04, 0.88);
    const intro = seg(p, 0, 0.08);
    op(below, intro);
    cAnn.forEach((el) => op(el, intro));
    lines.forEach((l, i) => {
      set(cls[i], "x2", lerp(l.x0, l.x1, story).toFixed(2));
      set(cls[i], "y2", lerp(l.y0, l.y1, story).toFixed(2));
      op(cls[i], seg(story, 0, 0.01));
      // Each crossing is marked as the line reaches it; its value on the axis follows.
      const shown = seg(story, l.ec - 0.004, l.ec + 0.02);
      op(ecs[i], shown);
      op(drops[i], shown);
      op(ects[i], seg(story, l.ec + 0.01, l.ec + 0.05));
    });
    // The cursor rides the sweep and leaves when it is done, or stays under the pointer.
    const eta = at ?? story;
    const x = cxOf(eta).toFixed(2);
    set(curcLine, "x1", x);
    set(curcLine, "x2", x);
    cds.forEach((c, i) => {
      set(c, "cx", x);
      set(c, "cy", cyOf(respL(eta, lines[i].q)).toFixed(2));
      const sel = i === qi;
      c.classList.toggle("sel", sel);
      set(c, "r", sel ? "3.5" : "2.5");
      cls[i].classList.toggle("sel", sel);
    });
    chips.forEach((c, i) => c.classList.toggle("on", i === qi));
    const riding = at === null ? Math.min(seg(p, 0.02, 0.06), 1 - seg(p, 0.9, 1)) : show;
    op(curcLine, riding);
    op(curc, riding);
    setBinary(qv, eta);
    const picked = lines[qi].q;
    return `η = ${eta.toFixed(2)}  q = ${picked}: ${verdictL(respL(eta, picked))}, a ${verdictA(respA(eta, picked))}`;
  }

  /** Draw all three panels; returns the plate's readout: which panel it speaks for, and the line. `latest` is the panel last read. */
  function render(st: Story, rd: Readings, latest: Key | null): [Key, string] {
    // A reading can ask for a panel's story to be finished; it is read once it is.
    const pa = st.a + (1 - st.a) * rd.a.force, pb = st.b + (1 - st.b) * rd.b.force, pc = st.c + (1 - st.c) * rd.c.force;
    const reading = (r: Reading, p: number) => r.back < 1 && p >= 0.999;
    // Let go, a reading slides back to where the story leaves the panel, and its cursor goes with it.
    const ta = renderA(pa, reading(rd.a, pa) ? lerp(rd.a.v + rd.a.off, G.a.fmax, rd.a.back) : null, 1 - rd.a.back);
    const tb = renderB(pb, reading(rd.b, pb) ? lerp(rd.b.v + rd.b.off, G.b.tmax, rd.b.back) : null, 1 - rd.b.back);
    const rc = reading(rd.c, pc);
    const tc = renderC(pc, rc ? lerp(rd.c.v + rd.c.off, 1, rd.c.back) : null, 1 - rd.c.back, rc && rd.c.back < 0.5 ? rd.c.qi : BN.qi, rc ? rd.c.qv : lines[BN.qi].q);
    // The readout stays with a panel until its story is told, so each result is stated before the next is taken up.
    // (A scrubbed story closes in on its end rather than landing on it, and each line has its last value
    // well before then: hence "told" a little short of 1.)
    const told = 0.95;
    const who: Key = latest && rd[latest].back < 1 ? latest : pa < told ? "a" : pb < told ? "b" : "c";
    return [who, who === "a" ? ta : who === "b" ? tb : tc];
  }

  /**
   * The pair turns about its centre of mass. Gas crosses from the donor a
   * parcel at a time, never on a beat, and each parcel that lands sets off a
   * ring from the orbit towards the orbit that parcel leaves behind.
   */
  function ambient(dt: number) {
    bs.th += dt * 0.5;
    placeStars();
    flow.wait -= dt;
    if (flow.wait <= 0) {
      const free = parcels.indexOf(-1);
      if (free >= 0) parcels[free] = 0;
      // Gaps between 1.3 and 2.4 s, in an order that does not repeat.
      flow.wait = 1.3 + 1.1 * ((++flow.n * 0.6180339887) % 1);
    }
    for (let i = 0; i < parcels.length; i++) {
      let u = parcels[i];
      if (u < 0) continue;
      u += dt / 1.25;
      if (u >= 1) {
        parcels[i] = -1;
        pks[i].style.opacity = "0";
        if (Math.abs(bs.e) >= 0.004) flow.ring = 0;
        continue;
      }
      parcels[i] = u;
      pks[i].setAttribute("cx", f2(lerp(bs.sx0, bs.sx1, u)));
      pks[i].setAttribute("cy", f2(lerp(bs.sy0, bs.sy1, u)));
      pks[i].style.opacity = Math.min(1, u * 7, (1 - u) * 7).toFixed(2);
    }
    if (flow.ring < 0) return;
    flow.ring += dt / 1.15;
    if (flow.ring >= 1 || Math.abs(bs.e) < 0.004) {
      flow.ring = -1;
      rip.style.opacity = "0";
      return;
    }
    const k = 1 - (1 - flow.ring) ** 3;
    rip.setAttribute("r", f2(bs.r1 * (1 + bs.e * k)));
    rip.style.opacity = (Math.min(1, flow.ring * 8) * (1 - flow.ring) * 0.8).toFixed(3);
  }

  /** A pointer on one of the hit areas: the panel it reads, the place on its axis, and for (c) the nearest series. */
  function pick(e: PointerEvent, area: string): { p: Key; v: number; qi: number } | null {
    const m = svg.getScreenCTM();
    if (!m) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const u = clamp01((pt.x - G.L) / (G.R - G.L));
    if (area === "a") return { p: "a", v: u * G.a.fmax, qi: 0 };
    if (area === "b") return { p: "b", v: u * G.b.tmax, qi: 0 };
    if (area === "z") return { p: "b", v: lerp(Z.t0, Z.t1, clamp01((pt.x - G.b.zx0) / (G.b.zx1 - G.b.zx0))), qi: 0 };
    const v = vOf(pt.y);
    let qi = 0, best = Infinity;
    lines.forEach((l, i) => {
      const dv = Math.abs(respL(u, l.q) - v);
      if (dv < best) {
        best = dv;
        qi = i;
      }
    });
    return { p: "c", v: u, qi };
  }

  const hits = Object.fromEntries(qa<SVGRectElement>(root, ".hit").map((el) => [el.dataset.p!, el])) as Record<"a" | "b" | "z" | "c", SVGRectElement>;
  return { svg, G, hits, chips, bin, lines, render, ambient, pick };
}

type View = ReturnType<typeof bind>;

/**
 * Follow a pointer over `el`. A mouse or a pen is taken as it moves. A finger
 * that comes down may be the start of a scroll, so its place is taken up only
 * once it has stayed down a moment, or has lifted again as a tap; if the
 * browser takes the touch for a scroll first, it never is.
 */
function follow(el: Element, take: (e: PointerEvent) => void, leave: (e: PointerEvent) => void) {
  let wait = 0;
  let held: PointerEvent | null = null;
  const settle = () => {
    clearTimeout(wait);
    wait = 0;
    if (held) take(held);
    held = null;
  };
  el.addEventListener("pointerdown", (e) => {
    const ev = e as PointerEvent;
    if (ev.pointerType !== "touch") return take(ev);
    held = ev;
    clearTimeout(wait);
    wait = window.setTimeout(settle, 130);
  });
  el.addEventListener("pointermove", (e) => {
    if (wait) held = e as PointerEvent;
    else take(e as PointerEvent);
  });
  el.addEventListener("pointerup", () => {
    if (wait) settle();
  });
  el.addEventListener("pointercancel", () => {
    clearTimeout(wait);
    wait = 0;
    held = null;
  });
  el.addEventListener("pointerleave", (e) => leave(e as PointerEvent));
}

/**
 * The plate's readout speaks for one panel at a time. While it stays with a
 * panel its line simply follows the numbers; when it turns to another, the
 * old line goes out and the new one comes in, so the sentence is never
 * swapped under the eye in one frame.
 */
function voice(el: HTMLElement | null) {
  let who = "", line = "", want = "", next = "", turning = false;
  const write = (s: string) => {
    if (el && s !== line) el.textContent = line = s;
  };
  return (subject: string, s: string) => {
    want = subject;
    next = s;
    if (!el || !who) {
      // The first line is set as it is: the plate is not in view yet.
      who = subject;
      return write(s);
    }
    if (subject === who && !turning) return write(s);
    if (turning) return;
    turning = true;
    gsap.to(el, {
      opacity: 0,
      duration: 0.1,
      ease: "swap",
      overwrite: true,
      onComplete() {
        who = want;
        write(next);
        turning = false;
        gsap.to(el, { opacity: 1, duration: T.press, ease: "arrive", overwrite: true });
      },
    });
  };
}

/** How each hit area is read from the keyboard: the panel, its range and steps, where a reading starts, and its name. */
const AXES = {
  a: { p: "a", min: 0, max: 0.15, step: 0.001, big: 0.01, start: 0.075, label: "Fraction of the donor's mass moved, in the top panel. Left and right move it." },
  b: { p: "b", min: 0, max: 50, step: 0.5, big: 5, start: 25, label: "Orbit, in the middle panel. Left and right move it." },
  z: { p: "b", min: 44, max: 50, step: 0.1, big: 1, start: 47, label: "Orbit, in the closer look at the last six. Left and right move it." },
  c: { p: "c", min: 0, max: 1, step: 0.01, big: 0.1, start: 0.5, label: "Donor velocity weight η in the bottom panel. Left and right move η, up and down change q." },
} as const;

export default function (root: HTMLElement) {
  const views = qa<SVGSVGElement>(root, "svg.rs").map(bind);
  const { lines, G: G0 } = views[0];
  const QI = G0.c.bn.qi;
  const say = voice(root.querySelector<HTMLElement>("[data-readout]"));

  // Only the layout on show is drawn. The other keeps the finished state the server gave it.
  let live: View = views[0];
  let dirty = true;
  const touch = () => (dirty = true);
  const pickLive = () => {
    const now = views.find((v) => v.svg.getClientRects().length > 0) ?? views[0];
    if (now !== live) {
      live = now;
      dirty = true;
    }
    return live;
  };
  pickLive();

  const st: Story = { a: 0, b: 0, c: 0 };
  const blank = (v: number): Reading => ({ v, off: 0, back: 1, force: 0, held: false, qi: QI, qv: lines[QI].q, tw: null });
  // The far end of each panel's axis, which is also where its story leaves it: all the mass moved, the last orbit, η = 1.
  const SPAN: Record<Key, number> = { a: G0.a.fmax, b: G0.b.tmax, c: 1 };
  const rd: Readings = { a: blank(G0.a.fmax), b: blank(G0.b.tmax), c: blank(1) };
  let latest: Key | null = null;

  // Each panel's story runs while its own block comes up the window: from the
  // block's top crossing a line near the foot of the window to its middle
  // reaching the window's. A plate short enough to be seen whole is finished
  // by the time it is at rest in the middle of the window.
  const place = (k: number) => {
    const v = pickLive();
    const fig = root.getBoundingClientRect(), box = v.svg.getBoundingClientRect();
    const sc = box.width / v.G.W, off = box.top - fig.top;
    const b = v.G.blocks[k];
    return { top: off + b.top * sc, mid: off + ((b.top + b.bottom) / 2) * sc, H: fig.height };
  };
  const spot = (y: number, frac: number) => `top+=${Math.round(y)}px ${(frac * 100).toFixed(1)}%`;
  (["a", "b", "c"] as const).forEach((key, k) => {
    gsap.to(st, {
      [key]: 1,
      ease: "none",
      onUpdate: touch,
      scrollTrigger: {
        trigger: root,
        // (The last panel's lines set off from the top of its plot, so it can start as that comes into view.)
        start: () => spot(place(k).top, k === 2 ? 0.92 : 0.86),
        end: () => {
          const g = place(k), vh = window.innerHeight;
          const whole = g.H <= vh * 0.92 && g.H / 2 - 0.51 * vh < g.mid - 0.52 * vh;
          return whole ? spot(g.H / 2, 0.51) : spot(g.mid, 0.52);
        },
        scrub: trail(0.5),
      },
    });
  });
  gsap.ticker.add(() => {
    if (!dirty) return;
    dirty = false;
    say(...live.render(st, rd, latest));
  });

  for (const v of views) whileVisible(v.svg, (dt) => v.ambient(dt));

  // Readings are spoken, a moment after the last change.
  const spoken = document.createElement("p");
  spoken.className = "sr-only";
  spoken.setAttribute("aria-live", "polite");
  root.append(spoken);
  let speakTimer = 0;
  const describe = (p: Key, v: number, qi: number) => {
    if (p === "a") return `${(v * 100).toFixed(1)}% of the donor moved: angular momentum ${lBallistic(v, G0.a.q0[0]).toFixed(3)} of its starting value for every mass ratio`;
    if (p === "b") {
      const a = aClosure(v, G0.b.q0, G0.b.tmax);
      return `orbit ${v.toFixed(1)}: separation ${a.toFixed(3)} with the closure, 1 without, ${((1 / a - 1) * 100).toFixed(1)}% apart`;
    }
    const qv = lines[qi].q;
    return `η = ${v.toFixed(2)}, q = ${qv}: angular momentum ${verdictL(respL(v, qv)).slice(2)}, separation ${verdictA(respA(v, qv))}`;
  };

  /**
   * Take up a reading on a panel, or move the one that is held. The cursor
   * arrives over a few frames from where the story leaves the panel; if the
   * story has not got that far, it is run to its end first.
   */
  function read(p: Key, v: number, qi = QI, announce = false) {
    const r = rd[p];
    const fresh = !r.held;
    // Where the cursor is now, if it is up. A reading that lands more than a twelfth of the axis
    // away from it is a hop, and the cursor crosses the distance over a moment.
    const up = r.back < 1;
    const shown = up ? lerp(r.v + r.off, SPAN[p], r.back) : SPAN[p];
    const hop = up && Math.abs(v - shown) > SPAN[p] / 12;
    if (fresh) {
      r.held = true;
      r.tw?.kill();
      const finish = (1 - st[p]) * (1 - r.force) > 0.001 ? 0.45 : 0;
      // (What is left of the panel's story is drawn at a steady rate, as the scroll would have drawn it.)
      r.tw = gsap.timeline({ onUpdate: touch }).to(r, { force: 1, duration: finish, ease: "none" });
      if (!hop) r.tw.to(r, { back: 0, duration: T.press, ease: "arrive" });
    }
    if (hop) {
      gsap.killTweensOf(r, "back");
      r.back = 0;
      r.off = shown - v;
      gsap.to(r, { off: 0, duration: T.state, ease: "arrive", overwrite: "auto", onUpdate: touch });
    } else if (!up) r.off = 0;
    r.v = v;
    latest = p;
    if (p === "c" && (fresh || qi !== r.qi)) {
      r.qi = qi;
      // The pair is redrawn at the mass ratio picked over a moment, not in one frame.
      if (r.qv !== lines[qi].q) gsap.to(r, { qv: lines[qi].q, duration: T.state, ease: "swap", overwrite: "auto", onUpdate: touch });
    }
    touch();
    const words = describe(p, v, qi);
    for (const view of views) {
      view.hits[p].setAttribute("aria-valuenow", v.toFixed(3));
      view.hits[p].setAttribute("aria-valuetext", words);
      if (p === "b") {
        view.hits.z.setAttribute("aria-valuenow", v.toFixed(3));
        view.hits.z.setAttribute("aria-valuetext", words);
      }
    }
    if (announce) {
      clearTimeout(speakTimer);
      speakTimer = window.setTimeout(() => (spoken.textContent = words), 250);
    }
  }
  /** Let a panel's reading go, `after` seconds from now: it slides back to the story's state and the cursor leaves with it. */
  function drop(p: Key, after = 0) {
    const r = rd[p];
    if (!r.held) return;
    r.held = false;
    r.tw?.kill();
    r.tw = gsap
      .timeline({ onUpdate: touch, delay: after })
      .to(r, { back: 1, duration: 0.45, ease: "swap" })
      .to(r, { qv: lines[QI].q, duration: 0.45, ease: "swap" }, 0)
      .set(r, { qi: QI })
      .to(r, { force: 0, duration: 0.4, ease: "none" });
  }

  for (const v of views) {
    const { svg, hits, chips, bin } = v;
    svg.setAttribute("role", "group");
    svg.dataset.live = "";
    (Object.keys(hits) as (keyof typeof hits)[]).forEach((name) => {
      const hit = hits[name], axis = AXES[name], p = axis.p as Key;
      hit.setAttribute("tabindex", "0");
      hit.setAttribute("role", "slider");
      hit.setAttribute("aria-label", axis.label);
      hit.setAttribute("aria-valuemin", String(axis.min));
      hit.setAttribute("aria-valuemax", String(axis.max));

      // Pointer moves are taken once a frame.
      let pending: PointerEvent | null = null;
      const fromPointer = () => {
        const e = pending;
        pending = null;
        if (!e) return;
        const got = v.pick(e, name);
        if (got) read(got.p, got.v, got.qi);
      };
      const onPointer = (e: PointerEvent) => {
        if (!pending) requestAnimationFrame(fromPointer);
        pending = e;
      };
      // A mouse that leaves lets go almost at once; a finger lifts off at once, so its reading stays up a while.
      follow(hit, onPointer, (e) => {
        pending = null;
        if (document.activeElement === hit) return;
        // Leaving (c) towards the pair beside it: the reading waits for the pointer to get there.
        const m = svg.getScreenCTM();
        const towardsPair = p === "c" && !!m && (e.clientX - m.e) / m.a > v.G.R;
        drop(p, e.pointerType !== "mouse" ? 2.5 : towardsPair ? 0.9 : 0.1);
      });

      // From the keyboard: a reading starts in the middle of the axis, or where the pointer left it.
      const here = () => {
        const r = rd[p];
        return r.back < 1 && r.v >= axis.min && r.v <= axis.max ? r.v : axis.start;
      };
      hit.addEventListener("focus", () => read(p, here(), rd[p].qi, true));
      hit.addEventListener("blur", () => drop(p));
      hit.addEventListener("keydown", (e) => {
        const step = e.shiftKey ? axis.big : axis.step;
        let val = here(), qi = rd[p].qi;
        switch (e.key) {
          case "ArrowRight": val += step; break;
          case "ArrowLeft": val -= step; break;
          case "ArrowUp": if (p !== "c") return; qi += 1; break;
          case "ArrowDown": if (p !== "c") return; qi -= 1; break;
          case "Home": val = axis.min; break;
          case "End": val = axis.max; break;
          default: return;
        }
        e.preventDefault();
        val = Math.min(axis.max, Math.max(axis.min, Math.round(val / axis.step) * axis.step));
        read(p, val, Math.max(0, Math.min(lines.length - 1, qi)), true);
      });
    });

    // The q chips in the diagram pick a series; η stays where it was.
    chips.forEach((chip, i) => {
      chip.addEventListener("click", () => read("c", rd.c.back < 1 ? rd.c.v : 1, i, true));
    });
    bin.addEventListener("pointerenter", () => {
      // Coming over from the plot keeps the reading that was being let go.
      if (rd.c.back < 1) read("c", rd.c.v, rd.c.qi);
    });
    bin.addEventListener("pointerleave", (e) => {
      if (document.activeElement !== hits.c) drop("c", e.pointerType === "mouse" ? 0.9 : 2.5);
    });
  }
}
