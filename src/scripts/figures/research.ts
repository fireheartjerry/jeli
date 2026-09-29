import { scrubbed, q, qa, whileVisible } from "../motion";
import { lBallistic, aClosure, respL, respA, BIN } from "../geo/research";

type Pt = [number, number];
interface Line { q: number; x0: number; y0: number; x1: number; y1: number; ec: number }
interface Geo {
  L: number; R: number; T: number; B: number; SX: number; SW: number;
  a: { curves: Pt[][]; q0: number[]; fmax: number };
  b: {
    curve: Pt[]; x0: number; yOne: number; q0: number; tmax: number; err: string;
    z: { t0: number; t1: number; lo: number; hi: number }; zCurve: Pt[]; brk: number;
  };
  c: {
    lines: Line[]; lo: number; hi: number; y0: number; arrowAng: number;
    bn: { cx: number; cy: number; th: number; qi: number; eta: number; k: number };
  };
}

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

type Drive = { eta: number; qi: number } | null;
const op = (el: Element, v: number) => ((el as SVGElement).style.opacity = String(v));

/** Wire one layout of the plot. Everything positional comes from its own geometry. */
function bind(root: SVGSVGElement) {
  const svg = root;
  const G: Geo = JSON.parse(svg.dataset.g!);

  // (a)
  const ref = q<SVGPathElement>(root, ".ref");
  const lcs = qa<SVGPathElement>(root, ".lc");
  const arows = qa<SVGGElement>(root, ".arow");
  const alsum = q<SVGGElement>(root, ".alsum");
  const acall = q<SVGGElement>(root, ".acall");
  const ha = q<SVGCircleElement>(root, ".ha");
  const refPts: Pt[] = [G.a.curves[0][0], G.a.curves[0][G.a.curves[0].length - 1]];

  // (b)
  const noc = q<SVGPathElement>(root, ".noc");
  const clo = q<SVGPathElement>(root, ".clo");
  const hn = q<SVGCircleElement>(root, ".hn");
  const hc = q<SVGCircleElement>(root, ".hc");
  const nocl = q<SVGTextElement>(root, ".nocl");
  const anl = q<SVGTextElement>(root, ".anl");
  const clol = q<SVGGElement>(root, ".clol");
  const zlink = q<SVGGElement>(root, ".zlink");
  const zlabs = qa<SVGTextElement>(root, ".zoom > .ann");
  const zclo = q<SVGPathElement>(root, ".zclo");
  const zhc = q<SVGCircleElement>(root, ".zhc");
  const zring = q<SVGCircleElement>(root, ".zring");
  const zv = q<SVGTextElement>(root, ".zv");
  const zbrk = q<SVGPathElement>(root, ".zbrk");
  const zbrkx = q<SVGPathElement>(root, ".zbrkx");
  const zbl = q<SVGGElement>(root, ".zbl");
  const zLen = G.b.brk;
  zbrk.style.strokeDasharray = `${zLen} ${zLen}`;
  const xOf = (t: number) => lerp(G.b.x0, G.R, t / G.b.tmax);
  const Z = G.b.z;

  // (c)
  const cls = qa<SVGLineElement>(root, ".cl");
  const ecs = qa<SVGCircleElement>(root, ".ec");
  const ects = qa<SVGTextElement>(root, ".ect");
  const drops = qa<SVGLineElement>(root, ".drop");
  const below = q<SVGRectElement>(root, ".below");
  const cAnn = qa<SVGTextElement>(root, ".pc > .ann");
  const ccall = q<SVGGElement>(root, ".ccall");
  const cur = q<SVGGElement>(root, ".cur");
  const curl = q<SVGLineElement>(root, ".curl");
  const cds = qa<SVGCircleElement>(root, ".cd");
  const hit = q<SVGRectElement>(root, ".hit");
  const lines = G.c.lines;
  const cxOf = (eta: number) => lerp(G.L, G.R, eta);
  const cyOf = (v: number) => G.c.y0 + G.B - ((v - G.c.lo) / (G.c.hi - G.c.lo)) * (G.B - G.T);
  const vOf = (y: number) => G.c.lo + ((G.c.y0 + G.B - y) / (G.B - G.T)) * (G.c.hi - G.c.lo);

  // Binary diagram.
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
  const sl1 = q<SVGTextElement>(root, ".sl1");
  const sl2 = q<SVGTextElement>(root, ".sl2");
  const bverd = q<SVGTextElement>(root, ".bverd");
  const bdl = q<SVGTextElement>(root, ".bdl");
  const bda = q<SVGTextElement>(root, ".bda");
  const BN = G.c.bn;
  const etaTs = beta.querySelector("tspan")!;
  // The diagram's state, mutated in place (the ambient loop runs every frame).
  const bs = { q: -1, eta: -1, e: 0, r1: 0, r2: 0, s1: 0, s2: 0, th: BN.th, ph: 0 };

  function setBinary(qv: number, eta: number) {
    if (qv === bs.q && Math.abs(eta - bs.eta) < 1e-4) return;
    bs.q = qv;
    bs.eta = eta;
    const m1 = qv / (1 + qv), m2 = 1 / (1 + qv);
    const da = respA(eta, qv), dl = respL(eta, qv);
    bs.e = BIN.EMAX * Math.tanh(da / 2);
    bs.r1 = BN.k * BIN.A0 * m2;
    bs.r2 = BN.k * BIN.A0 * m1;
    bs.s1 = BN.k * (2.6 + 6 * Math.cbrt(m1));
    bs.s2 = BN.k * (2.6 + 6 * Math.cbrt(m2));
    o1.setAttribute("r", f2(bs.r1));
    o2.setAttribute("r", f2(bs.r2));
    a1.setAttribute("r", f2(bs.r1 * (1 + bs.e)));
    a2.setAttribute("r", f2(bs.r2 * (1 + bs.e)));
    const flat = Math.abs(bs.e) < 0.004;
    op(a1, flat ? 0 : 1);
    op(a2, flat ? 0 : 1);
    op(barr, flat ? 0 : 1);
    st1.setAttribute("r", f2(bs.s1));
    st2.setAttribute("r", f2(bs.s2));
    // Radial arrow on the donor's ring, pointing the way the separation moves.
    const ca = Math.cos(G.c.arrowAng), sa = Math.sin(G.c.arrowAng);
    const sg = Math.sign(bs.e) || 1;
    const r0 = bs.r1 + 4 * sg, r1 = bs.r1 * (1 + bs.e) + 1.5 * sg;
    const x0 = BN.cx + r0 * ca, y0 = BN.cy + r0 * sa, x1 = BN.cx + r1 * ca, y1 = BN.cy + r1 * sa;
    const d = Math.sign(r1 - r0) || 1;
    const hx = ca * d, hy = sa * d;
    barr.setAttribute(
      "d",
      `M${f2(x0)} ${f2(y0)}L${f2(x1)} ${f2(y1)}M${f2(x1 - 4 * hx - 3 * hy)} ${f2(y1 - 4 * hy + 3 * hx)}L${f2(x1)} ${f2(y1)}L${f2(x1 - 4 * hx + 3 * hy)} ${f2(y1 - 4 * hy - 3 * hx)}`,
    );
    etaTs.textContent = ` = ${f2(eta)}`;
    bverd.textContent = `orbit ${verdictA(da)}`;
    bdl.textContent = sgn(dl);
    bda.textContent = sgn(da);
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
    sl1.setAttribute("x", f2(x1 + c * (bs.s1 + 13)));
    sl1.setAttribute("y", f2(y1 + s * (bs.s1 + 11)));
    sl2.setAttribute("x", f2(x2 - c * (bs.s2 + 13)));
    sl2.setAttribute("y", f2(y2 - s * (bs.s2 + 11)));
    // The stream leaves M1 and arrives at M2.
    const ux = -c, uy = -s;
    strm.setAttribute(
      "d",
      `M${f2(x1 + ux * (bs.s1 + 3))} ${f2(y1 + uy * (bs.s1 + 3))}L${f2(x2 - ux * (bs.s2 + 3))} ${f2(y2 - uy * (bs.s2 + 3))}`,
    );
  }

  function renderA(p: number): string {
    const r = seg(p, 0, 0.16);
    ref.setAttribute("d", partial(refPts, r)[0]);
    op(ref, r > 0 ? 1 : 0);
    op(acall, seg(p, 0.12, 0.2));
    let text = "L/L₀ = 1 − f";
    let head: Pt | null = null;
    G.a.curves.forEach((pts, i) => {
      const s = 0.2 + i * 0.24;
      const u = seg(p, s, s + 0.22);
      const [d, end] = partial(pts, u);
      lcs[i].setAttribute("d", d);
      op(lcs[i], u > 0 ? 1 : 0);
      op(arows[i], seg(p, s + 0.18, s + 0.24));
      if (u > 0) {
        head = end;
        text = `q₀ = ${G.a.q0[i]}  L/L₀ = ${lBallistic(u * G.a.fmax, G.a.q0[i]).toFixed(3)}`;
      }
    });
    op(alsum, seg(p, 0.9, 0.98));
    if (head) {
      ha.setAttribute("cx", (head as Pt)[0].toFixed(2));
      ha.setAttribute("cy", (head as Pt)[1].toFixed(2));
    }
    op(ha, head ? 1 : 0);
    if (p >= 0.96) text = `every q₀  L/L₀ = ${(1 - G.a.fmax).toFixed(3)}`;
    return text;
  }

  function renderB(p: number): string {
    const t = G.b.tmax * seg(p, 0.02, 0.8);
    const u = t / G.b.tmax;
    const x = xOf(t);
    noc.setAttribute("d", `M${G.b.x0} ${G.b.yOne}H${x.toFixed(2)}`);
    const [d, end] = partial(G.b.curve, u);
    clo.setAttribute("d", d);
    const on = p > 0 ? 1 : 0;
    op(noc, on); op(clo, on); op(hn, on); op(hc, on);
    op(nocl, seg(u, 0.04, 0.12));
    op(anl, seg(u, 0.06, 0.14));
    op(clol, seg(u, 0.5, 0.64));
    hn.setAttribute("cx", x.toFixed(2));
    hc.setAttribute("cx", end[0].toFixed(2));
    hc.setAttribute("cy", end[1].toFixed(2));
    // The zoom opens as the run reaches its last orbits and draws alongside.
    const zo = seg(t, Z.t0 - 6, Z.t0 - 1);
    op(zlink, zo);
    zlabs.forEach((el) => op(el, zo));
    const zu = seg(t, Z.t0, Z.t1);
    const [zd, zend] = partial(G.b.zCurve, zu);
    zclo.setAttribute("d", zd);
    op(zclo, zu > 0 ? 1 : 0);
    zhc.setAttribute("cx", zend[0].toFixed(2));
    zhc.setAttribute("cy", zend[1].toFixed(2));
    op(zhc, zu > 0 ? 1 : 0);
    const landed = seg(p, 0.8, 0.84);
    op(zring, landed);
    op(zv, landed);
    const k = seg(p, 0.84, 0.95);
    zbrk.style.strokeDashoffset = String(zLen * (1 - k));
    op(zbrk, k > 0 ? 1 : 0);
    op(zbrkx, k > 0.9 ? 1 : 0);
    op(zbl, seg(p, 0.92, 1));
    if (k > 0) return `error ${G.b.err}% at t = ${G.b.tmax}`;
    return `t = ${Math.round(t)}  a/a₀ = ${aClosure(t, G.b.q0, G.b.tmax).toFixed(3)}`;
  }

  function placeCursor(eta: number, qi: number) {
    const x = cxOf(eta).toFixed(2);
    curl.setAttribute("x1", x);
    curl.setAttribute("x2", x);
    cds.forEach((c, i) => {
      c.setAttribute("cx", x);
      c.setAttribute("cy", cyOf(respL(eta, lines[i].q)).toFixed(2));
      const sel = i === qi;
      c.classList.toggle("sel", sel);
      c.setAttribute("r", sel ? "3.5" : "2.5");
      cls[i].classList.toggle("sel", sel);
    });
    chips.forEach((c, i) => c.classList.toggle("on", i === qi));
    setBinary(lines[qi].q, eta);
    const qv = lines[qi].q;
    return `η = ${eta.toFixed(2)}  q = ${qv}: ${verdictL(respL(eta, qv))}, a ${verdictA(respA(eta, qv))}`;
  }

  function renderC(p: number, drive: { eta: number; qi: number } | null): string {
    const eta = drive ? 1 : seg(p, 0.04, 0.88);
    const intro = drive ? 1 : seg(p, 0, 0.08);
    op(below, intro);
    cAnn.forEach((el) => op(el, intro));
    lines.forEach((l, i) => {
      cls[i].setAttribute("x2", lerp(l.x0, l.x1, eta).toFixed(2));
      cls[i].setAttribute("y2", lerp(l.y0, l.y1, eta).toFixed(2));
      op(cls[i], eta > 0 ? 1 : 0);
      const shown = seg(eta, l.ec - 0.004, l.ec + 0.012);
      op(ecs[i], shown);
      op(ects[i], shown);
      op(drops[i], shown);
    });
    op(ccall, seg(eta, lines[2].ec + 0.02, lines[2].ec + 0.1));
    if (drive) {
      op(cur, 1);
      return placeCursor(drive.eta, drive.qi);
    }
    op(cur, p > 0 ? 1 - seg(p, 0.9, 1) : 0);
    return placeCursor(eta, BN.qi);
  }

  function render(st: { a: number; b: number; c: number }, user: Drive): string {
    const ta = renderA(st.a);
    const tb = renderB(st.b);
    const tc = renderC(st.c, user);
    return user || st.c > 0 ? tc : st.b > 0 ? tb : ta;
  }

  // Ambient: the pair orbits its centre of mass, and a ring ripples the way
  // the separation is moving.
  function ambient(dt: number) {
    bs.th += dt * 0.5;
    placeStars();
    bs.ph = (bs.ph + dt / 1.9) % 1;
    if (Math.abs(bs.e) < 0.004) {
      rip.style.opacity = "0";
      return;
    }
    const k = 1 - (1 - bs.ph) ** 3;
    rip.setAttribute("r", f2(bs.r1 * (1 + bs.e * k)));
    rip.style.opacity = ((1 - bs.ph) * 0.8).toFixed(3);
  }

  /** Pointer position to (η, nearest series), or null. */
  function pick(e: PointerEvent): { eta: number; qi: number } | null {
    const m = svg.getScreenCTM();
    if (!m) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const eta = clamp01((pt.x - G.L) / (G.R - G.L));
    const v = vOf(pt.y);
    let qi = 0, best = Infinity;
    lines.forEach((l, i) => {
      const dv = Math.abs(respL(eta, l.q) - v);
      if (dv < best) { best = dv; qi = i; }
    });
    return { eta, qi };
  }

  return { svg, hit, chips, bin, lines, render, ambient, pick };
}

export default function (root: HTMLElement) {
  const views = qa<SVGSVGElement>(root, "svg.rs").map(bind);
  const lines = views[0].lines;
  const BNqi = 1, BNeta = 1;
  const readout = root.querySelector<HTMLElement>("[data-readout]");
  const say = (s: string) => { if (readout && readout.textContent !== s) readout.textContent = s; };
  const st = { a: 0, b: 0, c: 0 };
  // Pointer, keyboard or chip control of panel (c); null means the scroll drives it.
  let user: Drive = null;
  const render = () => {
    let text = "";
    for (const v of views) text = v.render(st, user);
    say(text);
  };

  // Scroll: the three panels draw in turn.
  const tl = scrubbed(root, { start: "top 65%", end: "bottom 72%" });
  tl.to(st, { a: 1, duration: 1 })
    .to(st, { b: 1, duration: 1 }, ">0.08")
    .to(st, { c: 1, duration: 1 }, ">0.08");
  tl.eventCallback("onUpdate", render);
  render();

  for (const v of views) {
    whileVisible(v.svg, (dt) => {
      v.ambient(dt);
    });
  }

  // Panel (c) reads out under a pointer, a finger or the arrow keys.
  const live = document.createElement("p");
  live.className = "sr-only";
  live.setAttribute("aria-live", "polite");
  root.append(live);
  let liveTimer = 0;

  function drive(eta: number, qi: number, announce = false) {
    user = { eta: clamp01(eta), qi: Math.max(0, Math.min(lines.length - 1, qi)) };
    render();
    const qv = lines[user.qi].q;
    const text = `η = ${user.eta.toFixed(2)}, q = ${qv}: angular momentum ${verdictL(respL(user.eta, qv)).slice(2)}, separation ${verdictA(respA(user.eta, qv))}`;
    for (const v of views) {
      v.hit.setAttribute("aria-valuenow", user.eta.toFixed(2));
      v.hit.setAttribute("aria-valuetext", text);
    }
    if (announce) {
      clearTimeout(liveTimer);
      liveTimer = window.setTimeout(() => (live.textContent = text), 250);
    }
  }
  let releaseTimer = 0;
  function release() {
    clearTimeout(releaseTimer);
    if (!user) return;
    user = null;
    render();
  }

  for (const v of views) {
    const { svg, hit, chips, bin } = v;
    svg.setAttribute("role", "group");
    svg.dataset.live = "";
    hit.setAttribute("tabindex", "0");
    hit.setAttribute("role", "slider");
    hit.setAttribute("aria-label", "Donor velocity weight η in the bottom panel. Left and right move η, up and down change q.");
    hit.setAttribute("aria-valuemin", "0");
    hit.setAttribute("aria-valuemax", "1");

    let pending: PointerEvent | null = null;
    const fromPointer = () => {
      const e = pending;
      pending = null;
      if (!e) return;
      const p = v.pick(e);
      if (p) drive(p.eta, p.qi);
    };
    const onPointer = (e: PointerEvent) => {
      clearTimeout(releaseTimer);
      if (!pending) requestAnimationFrame(fromPointer);
      pending = e;
    };
    const leave = (e: PointerEvent) => {
      if (document.activeElement === hit) return;
      // A finger lifts off at once; leave its reading up for a moment.
      releaseTimer = window.setTimeout(release, e.pointerType === "mouse" ? 900 : 2500);
    };
    hit.addEventListener("pointerdown", onPointer);
    hit.addEventListener("pointermove", onPointer);
    hit.addEventListener("pointerleave", leave);

    // The q chips in the diagram pick a series; η stays where it was.
    chips.forEach((chip, i) => {
      chip.addEventListener("click", () => {
        clearTimeout(releaseTimer);
        const eta = user?.eta ?? (st.c > 0 ? seg(st.c, 0.04, 0.88) : BNeta);
        drive(eta, i, true);
      });
    });
    bin.addEventListener("pointerenter", () => clearTimeout(releaseTimer));
    bin.addEventListener("pointerleave", leave);

    hit.addEventListener("focus", () => drive(user?.eta ?? 0.5, user?.qi ?? BNqi, true));
    hit.addEventListener("blur", release);
    hit.addEventListener("keydown", (e) => {
      const cur = user ?? { eta: 0.5, qi: BNqi };
      const step = e.shiftKey ? 0.1 : 0.01;
      let { eta, qi } = cur;
      switch (e.key) {
        case "ArrowRight": eta += step; break;
        case "ArrowLeft": eta -= step; break;
        case "ArrowUp": qi += 1; break;
        case "ArrowDown": qi -= 1; break;
        case "Home": eta = 0; break;
        case "End": eta = 1; break;
        default: return;
      }
      e.preventDefault();
      drive(Math.round(eta * 100) / 100, qi, true);
    });
  }
}
