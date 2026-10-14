import { gsap, scrubbed, whileVisible, phase, qa, q } from "../motion";

interface G {
  L: number; R: number; T: number; B: number; max: number; BAR: number; TK: number;
  m: [string, number, number][]; // "Mon YYYY", submissions that month, running total
  acc: number; pk: number; c100: number;
}
const NS = "http://www.w3.org/2000/svg";

// The scroll story, as fractions of it. The plate is let out from the top as it
// rises past a line a little above the foot of the window (reveal.ts), so the
// story goes down the plate with it: the strip, then each grid line as it comes
// out, then the axis, and only then the pen, which starts at the chart's foot.
const DONE = 0.9;
const FOLD = 0.94;
const GLOW = 44;                  // plot units for which a contest lingers behind the pen
const GLOWS = [0.4, 0.27, 0.16, 0.07];

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function (root: HTMLElement) {
  const svg = q<SVGSVGElement>(root, "svg.sb");
  const G: G = JSON.parse(svg.dataset.g!);
  const readout = root.querySelector<HTMLElement>("[data-readout]");
  const arrive = gsap.parseEase("arrive");
  const rand = mulberry(11);
  const fmt = new Intl.NumberFormat("en-US");
  const n = G.m.length;
  const total = G.m[n - 1][2];
  const xOf = (i: number) => G.L + (i / (n - 1)) * (G.R - G.L);
  const yOf = (v: number) => G.B - (v / G.max) * (G.B - G.T);

  const seen = new WeakMap<object, Map<string, string>>();
  const fresh = (el: object, key: string, v: string) => {
    let m = seen.get(el);
    if (!m) seen.set(el, (m = new Map()));
    if (m.get(key) === v) return false;
    m.set(key, v);
    return true;
  };
  const attr = (el: Element, k: string, v: string) => { if (fresh(el, k, v)) el.setAttribute(k, v); };
  const css = (el: SVGElement | HTMLElement, k: string, v: string) => { if (fresh(el, `s:${k}`, v)) el.style.setProperty(k, v); };
  const op = (el: SVGElement | HTMLElement, v: number) => css(el, "opacity", v <= 0.004 ? "0" : v >= 0.996 ? "1" : v.toFixed(3));
  const text = (el: Element, v: string) => { if (fresh(el, "text", v)) el.textContent = v; };
  const mk = <E extends SVGElement>(tag: string, cls: string, parent: Element, before: Element | null = null) => {
    const el = document.createElementNS(NS, tag) as E;
    el.setAttribute("class", cls);
    parent.insertBefore(el, before);
    return el;
  };
  /** A stroke drawn from its first end: u in 0..1. (A part hidden at this width has no length to measure, and is never seen.) */
  const ruled = (el: SVGGeometryElement) => {
    let len = 0;
    try {
      len = el.getTotalLength();
    } catch {
      len = 0;
    }
    el.style.strokeDasharray = `${len} ${len}`;
    return (u: number) => {
      css(el, "stroke-dashoffset", (len * (1 - u)).toFixed(2));
      op(el, u > 0 ? 1 : 0);
    };
  };

  // ---- the parts -----------------------------------------------------------
  const line = q<SVGPathElement>(svg, ".line");
  const bars = qa<SVGRectElement>(svg, ".bar").map((el) => ({ el, i: Number(el.dataset.i), h: Number(el.dataset.h) }));
  const barAt = new Map(bars.map((b) => [b.i, b.el]));
  const head = q<SVGGElement>(svg, ".head");
  const count = q<SVGTextElement>(svg, ".count");
  const peakAnn = q<SVGGElement>(svg, ".peak-ann");
  const m100 = q<SVGGElement>(svg, ".m100");
  const strip = q<SVGGElement>(svg, ".strip");

  // The line, by month: its corners, and how much line lies before each.
  const X = G.m.map((_, i) => xOf(i)), Y = G.m.map((m) => yOf(m[2]));
  const CUM = [0];
  for (let i = 1; i < n; i++) CUM.push(CUM[i - 1] + Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1]));
  const full = line.getTotalLength();
  line.style.strokeDasharray = `${full} ${full}`;
  /** The line's height above month-position f (months are whole numbers). */
  const lineY = (f: number) => {
    const i = Math.max(0, Math.min(n - 2, Math.floor(f)));
    return Y[i] + (Y[i + 1] - Y[i]) * Math.max(0, Math.min(1, f - i));
  };

  const ticks = qa<SVGLineElement>(svg, ".tick").map((el) => {
    const x = Number(el.getAttribute("x1")), y1 = Number(el.getAttribute("y1")), y2 = Number(el.getAttribute("y2"));
    return { el, x, y1, y2, top: lineY(((x - G.L) / (G.R - G.L)) * (n - 1)) };
  });
  // A contest the pen has just passed is ruled up to the line for a moment: this is where the line was pushed.
  const glows = GLOWS.map((a) => {
    const el = mk<SVGPathElement>("path", "glow", svg, q(svg, ".ticks"));
    el.style.strokeOpacity = String(a);
    return el;
  });

  const grid = qa<SVGLineElement>(svg, ".grid line").map((el, j) => ({ draw: ruled(el), label: qa<SVGTextElement>(svg, ".grid text")[j] }));
  const axis = ruled(q<SVGLineElement>(svg, ".sb-axis"));
  const sep = ruled(q<SVGLineElement>(svg, ".sb-sep"));
  const years = qa<SVGTextElement>(svg, "text.yr").map((el) => ({ el, x: Number(el.getAttribute("x")) }));
  const ticksKey = q<SVGTextElement>(svg, ".ticks-k");

  const peakLead = ruled(q<SVGLineElement>(peakAnn, ".lead"));
  const peakText = q<SVGTextElement>(peakAnn, "text");
  const pin = q<SVGCircleElement>(m100, ".pin");
  const pinLead = ruled(q<SVGLineElement>(m100, ".lead"));
  const pinText = q<SVGTextElement>(m100, "text");
  const pinRing = mk<SVGCircleElement>("circle", "ringp", m100, pin);
  pinRing.setAttribute("cx", pin.getAttribute("cx")!);
  pinRing.setAttribute("cy", pin.getAttribute("cy")!);
  const headRing = mk<SVGCircleElement>("circle", "ringp", head, head.firstChild as Element);

  // The strip.
  const label = q<SVGTextElement>(strip, ".sb-k");
  const inTrack = q<SVGLineElement>(strip, ".sb-in");
  const outTrack = q<SVGLineElement>(strip, ".sb-out");
  const box = q<SVGRectElement>(strip, ".box");
  const boxDraw = ruled(box);
  const boxLabel = q<SVGTextElement>(strip, ".sb-box");
  const prog = q<SVGLineElement>(strip, ".sb-prog");
  const endStop = q<SVGLineElement>(strip, ".sb-end");
  const rate = q<SVGTextElement>(strip, ".sb-rate");
  const toksLayer = q<SVGGElement>(strip, ".toks");
  const chipsLayer = q<SVGGElement>(strip, ".chips");
  const SY = Number(inTrack.getAttribute("y1"));
  const X_IN = Number(inTrack.getAttribute("x1")), X_GATE = Number(inTrack.getAttribute("x2"));
  const OUT0 = Number(outTrack.getAttribute("x1")), OUT1 = Number(outTrack.getAttribute("x2"));
  const BX0 = Number(box.getAttribute("x")), BX1 = BX0 + Number(box.getAttribute("width"));
  const px0 = Number(prog.getAttribute("x1")), px1 = Number(prog.getAttribute("x2"));
  let small = false; // phone-width plate: larger tokens, one verdict at a time
  new ResizeObserver(() => { small = svg.getBoundingClientRect().width < 450; }).observe(svg);

  // ---- the scroll story ------------------------------------------------------
  const st = { p: 0 };
  const PEN = [0.3, 0.87];                 // the line is drawn, a month at a time
  const RULED = grid.map(() => 0.12);      // when each grid line is ruled
  let AXIS = 0.2;                          // when the time axis is
  const gridLines = qa<SVGLineElement>(svg, ".grid line"), axisLine = q<SVGLineElement>(svg, ".sb-axis");
  function measure() {
    const vh = window.innerHeight, box = root.getBoundingClientRect();
    const span = 0.4 * vh + box.height / 2;
    /** How far into the story the page is when this part comes out from under the fold. */
    const out = (el: Element) => (el.getBoundingClientRect().bottom - box.top - (FOLD - 0.85) * vh) / span;
    gridLines.forEach((el, j) => (RULED[j] = Math.max(0.06, Math.min(0.4, out(el) + 0.012))));
    AXIS = Math.max(0.1, Math.min(0.42, out(axisLine) + 0.008));
    PEN[0] = Math.max(0.24, Math.min(0.46, AXIS + 0.04));
  }
  let penF = 0; // the pen, in months (the hover and the strip read it)
  const pen = { x: G.L, y: G.B, w: 40 }; // where the pen is, and how wide its count is set
  let reading = -1; // the month under the pointer, or -1
  const resting = () => `${fmt.format(Math.round(st.p >= PEN[1] ? total : valueAt(penF)))} submissions`;
  const valueAt = (f: number) => {
    const i = Math.max(0, Math.min(n - 2, Math.floor(f)));
    return G.m[i][2] + (G.m[i + 1][2] - G.m[i][2]) * Math.max(0, Math.min(1, f - i));
  };

  function render() {
    const p = st.p;

    // Set-up, along the top: the strip is laid out from left to right, the way an answer travels it.
    op(label, phase(p, 0.01, 0.05));
    const tin = phase(p, 0.02, 0.1);
    attr(inTrack, "x2", (X_IN + (X_GATE - X_IN) * tin).toFixed(1));
    op(inTrack, tin > 0 ? 1 : 0);
    const bx = phase(p, 0.06, 0.13);
    boxDraw(bx);
    css(box, "fill-opacity", bx.toFixed(3));
    op(boxLabel, phase(p, 0.1, 0.14));
    op(prog, phase(p, 0.1, 0.14));
    const tout = phase(p, 0.11, 0.17);
    attr(outTrack, "x2", (OUT0 + (OUT1 - OUT0) * tout).toFixed(1));
    op(outTrack, tout > 0 ? 1 : 0);
    op(endStop, phase(p, 0.16, 0.185));
    op(rate, phase(p, 0.14, 0.2));
    op(toksLayer, phase(p, 0.03, 0.09));
    op(chipsLayer, phase(p, 0.12, 0.16));
    sep(phase(p, 0.04, 0.16));

    // Set-up, below it: each grid line is ruled as it comes out, bringing its number; then the axis and its years.
    grid.forEach((g, j) => {
      const u = phase(p, RULED[j], RULED[j] + 0.11);
      g.draw(u);
      op(g.label, phase(u, 0.55, 1));
    });
    const ax = phase(p, AXIS, AXIS + 0.1);
    axis(ax);
    const axPen = G.L + (G.R - G.L) * ax;
    for (const y of years) op(y.el, phase(axPen, y.x - 40, y.x - 6));
    op(ticksKey, phase(p, AXIS + 0.06, AXIS + 0.12));

    // Action: the pen crosses the months at one pace. A month's bar grows exactly while the pen
    // climbs through that month, because the climb is the bar: the line is the bars added up.
    const u = phase(p, PEN[0], PEN[1]);
    const f = (penF = u * (n - 1));
    if (reading > f + 0.01 && u < 1) show(-1); // the pen has gone back past the month being read
    const i = Math.min(n - 2, Math.floor(f)), t = f - i;
    const x = X[i] + (X[i + 1] - X[i]) * t, y = Y[i] + (Y[i + 1] - Y[i]) * t;
    const drawn = u >= 1 ? full : ((CUM[i] + (CUM[i + 1] - CUM[i]) * t) / CUM[n - 1]) * full;
    css(line, "stroke-dashoffset", (full - drawn).toFixed(2));
    op(line, u > 0 ? 1 : 0);
    attr(head, "transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    op(head, phase(p, PEN[0] - 0.03, PEN[0]));
    const value = fmt.format(u >= 1 ? total : Math.round(valueAt(f)));
    text(count, value);
    // The count stays on the plot while the pen is still at its left edge.
    pen.x = x;
    pen.y = y;
    pen.w = value.length * (small ? 12 : 6.6);
    attr(count, "x", Math.max(-10, G.L + pen.w - x).toFixed(1));
    if (reading < 0 && readout) text(readout, `${value} submissions`);

    for (const b of bars) {
      const g = Math.max(0, Math.min(1, f - (b.i - 1)));
      attr(b.el, "height", (b.h * g).toFixed(2));
      attr(b.el, "y", (G.B - b.h * g).toFixed(2));
    }
    const d = ["", "", "", ""];
    for (const k of ticks) {
      const past = x - k.x;
      attr(k.el, "y2", (k.y1 + (k.y2 - k.y1) * arrive(Math.max(0, Math.min(1, past / 7)))).toFixed(2));
      op(k.el, past > 0 ? 1 : 0);
      const gl = past / GLOW;
      // (It is ruled up from the axis over the first of its life, then fades.)
      if (u < 1 && gl >= 0 && gl < 1) d[Math.min(3, Math.floor(gl * 4))] += `M${k.x} ${G.B}V${(G.B - (G.B - k.top) * Math.min(1, gl / 0.14)).toFixed(1)}`;
    }
    glows.forEach((el, j) => attr(el, "d", d[j] || "M0 0"));

    // The busiest month is named as its bar tops out, the 100,000th answer as the line reaches it.
    const pk = phase(f, G.pk - 0.15, G.pk + 1.3);
    peakLead(arrive(phase(pk, 0, 0.5)));
    op(peakText, phase(pk, 0.3, 1));
    const hit = phase(f, G.c100 - 0.05, G.c100 + 2.4);
    attr(pin, "r", (2.4 * arrive(phase(hit, 0, 0.25))).toFixed(2));
    op(pin, hit > 0 ? 1 : 0);
    attr(pinRing, "r", (2.4 + 10 * arrive(hit)).toFixed(2));
    op(pinRing, hit > 0 ? 0.7 * (1 - hit) : 0);
    pinLead(arrive(phase(hit, 0.12, 0.6)));
    op(pinText, phase(hit, 0.4, 1));

    // Settle: the pen lands on the total.
    const landed = phase(p, PEN[1] - 0.005, DONE);
    attr(headRing, "r", (3.5 + 9 * arrive(landed)).toFixed(2));
    op(headRing, landed > 0 ? 0.7 * (1 - landed) : 0);
  }
  measure();
  scrubbed(root, { start: "top 85%", end: "center 45%", onRefresh: () => { measure(); render(); } }).to(st, { p: 1, duration: 1, onUpdate: render });

  // ---- ambient: a judge taking answers and returning verdicts ----------------
  // Replace the still's snapshot with live pools.
  toksLayer.replaceChildren();
  chipsLayer.replaceChildren();
  const bar = mk<SVGLineElement>("line", "sb-bar", strip, prog.nextSibling as Element | null);
  for (const [k, v] of [["x1", px0], ["x2", px0], ["y1", SY + 8], ["y2", SY + 8]] as const) bar.setAttribute(k, String(v));
  // The verdict colours the box's edge for a moment; it comes and goes rather than switching.
  const verdictEdge = mk<SVGRectElement>("rect", "box-v", strip, box.nextSibling as Element | null);
  for (const k of ["x", "y", "width", "height", "rx"]) verdictEdge.setAttribute(k, box.getAttribute(k)!);
  op(verdictEdge, 0);

  const toks = Array.from({ length: 9 }, () => {
    const r = mk<SVGRectElement>("rect", "tok", toksLayer);
    for (const [k, v] of [["width", 10], ["height", 10], ["rx", 2], ["x", -5], ["y", -5]] as const) r.setAttribute(k, String(v));
    op(r, 0);
    return { r, x: 0, live: false };
  });
  const order: number[] = []; // tokens on the track, front of the queue first
  const chips = Array.from({ length: 6 }, () => {
    const g = mk<SVGGElement>("g", "chip", chipsLayer);
    const r = mk<SVGRectElement>("rect", "chip-r", g);
    for (const [k, v] of [["y", -9], ["width", 30], ["height", 18], ["rx", 3]] as const) r.setAttribute(k, String(v));
    const t = mk<SVGTextElement>("text", "chip-t", g);
    for (const [k, v] of [["x", 15], ["y", 4.3], ["text-anchor", "middle"]] as const) t.setAttribute(k, String(v));
    op(g, 0);
    return { g, t, x: BX1, slot: -1, o: 0 };
  });
  const CHIP0 = BX1 + 12;
  const chipDx = () => (small ? 60 : 36);
  const setChip = (c: (typeof chips)[number], ok: boolean) => {
    attr(c.g, "class", `chip ${ok ? "ac" : "wa"}`);
    text(c.t, ok ? "AC" : "WA");
  };
  const place = (tk: (typeof toks)[number], o: number) => {
    attr(tk.r, "transform", `translate(${tk.x.toFixed(1)} ${SY})`);
    op(tk.r, o);
  };

  // Verdicts follow a low-discrepancy sequence, so any run of answers is
  // accepted at very nearly the site's real rate.
  let seq = 0;
  const verdict = () => ((seq++ * 0.6180339887 + 0.31) % 1) < G.acc;
  const SPEED = 84;        // units a second along the track
  const INTAKE = 0.13;     // seconds for an answer to pass into the box
  const JUDGE = 0.2;       // seconds to judge it
  const BASE = 2900;       // submissions a month the strip runs at when nothing is being read
  const PER = 2300;        // submissions a month that make one answer a second on the strip
  const judge = { tok: -1, t: 0, state: 0 as 0 | 1 | 2, flash: 1, ok: true, bar: 0 }; // 0 idle, 1 taking an answer in, 2 judging
  let spawnIn = 0.4;

  // Start from the snapshot the server drew: answers already on the track,
  // three verdicts already out. The strip is found at work, not switched on.
  [286, 238, 180, 112].forEach((x0, j) => {
    toks[j].live = true;
    toks[j].x = x0;
    order.push(j);
    place(toks[j], 1);
  });
  [true, false, true].forEach((ok, j) => {
    const c = chips[j];
    c.slot = 2 - j;
    c.x = CHIP0 + c.slot * 36;
    c.o = 1;
    setChip(c, ok);
    attr(c.g, "transform", `translate(${c.x.toFixed(1)} ${SY})`);
    op(c.g, 1);
  });

  whileVisible(root, (dt) => {
    if (st.p < 0.09) return; // the track is not laid yet
    // The strip runs at the pace of the month being read: the one under the pointer, else the one
    // under the pen, else a middling month. A quiet month trickles; the busiest fills the queue.
    const u = phase(st.p, PEN[0], PEN[1]);
    const monthly = reading >= 0 ? G.m[reading][1] : u > 0 && u < 1 ? G.m[Math.min(n - 1, Math.ceil(penF))][1] : BASE;
    const perSecond = Math.max(0.12, Math.min(4.4, monthly / PER));
    spawnIn -= dt * perSecond;
    if (spawnIn <= 0) {
      const tk = toks.find((t) => !t.live);
      if (tk && order.length < (small ? 5 : 6)) {
        tk.live = true;
        tk.x = X_IN;
        order.push(toks.indexOf(tk));
      }
      spawnIn = 0.6 + rand() * 0.8;
    }
    // Answers slide right and queue at the gate, slowing into their place rather than stopping dead.
    const gap = small ? 8 : 5, pitch = small ? 20 : 14;
    order.forEach((ti, qi) => {
      const tk = toks[ti];
      const room = X_GATE - gap - qi * pitch - tk.x;
      tk.x += Math.max(0, Math.min(SPEED * dt, room * Math.min(1, dt * 16)));
      place(tk, Math.min(1, (tk.x - X_IN) / 18));
    });
    // The box takes the front answer when it is free and drawn.
    if (judge.state === 0 && st.p >= 0.13 && order.length && X_GATE - gap - toks[order[0]].x < 0.8) {
      judge.tok = order.shift()!;
      judge.state = 1;
      judge.t = 0;
    }
    if (judge.state === 1) {
      judge.t += dt;
      const k = Math.min(1, judge.t / INTAKE);
      const tk = toks[judge.tok];
      tk.x = X_GATE - gap + (BX0 + 9 - (X_GATE - gap)) * k;
      place(tk, 1 - k);
      if (k >= 1) {
        tk.live = false;
        judge.state = 2;
        judge.t = 0;
      }
    } else if (judge.state === 2) {
      judge.t += dt;
      const k = Math.min(1, judge.t / JUDGE);
      attr(bar, "x2", (px0 + (px1 - px0) * k).toFixed(1));
      judge.bar = Math.min(1, k * 6);
      if (k >= 1) {
        judge.state = 0;
        judge.ok = verdict();
        judge.flash = 0;
        for (const c of chips) if (c.slot >= 0) c.slot++;
        const c = chips.find((k) => k.slot < 0) ?? chips.reduce((a, b) => (b.slot > a.slot ? b : a));
        c.slot = 0;
        c.x = BX1 - 14;
        c.o = 0;
        setChip(c, judge.ok);
        css(verdictEdge, "stroke", judge.ok ? "var(--s-green)" : "var(--s-red)");
      }
    }
    // The judging bar holds for a beat once it is full, then lets go before the next answer starts it again.
    if (judge.state !== 2 && judge.bar > 0) {
      judge.bar = Math.max(0, judge.bar - dt / 0.11);
      if (judge.bar === 0) attr(bar, "x2", String(px0));
    }
    op(bar, judge.bar);
    if (judge.flash < 1) {
      judge.flash = Math.min(1, judge.flash + dt / 0.55);
      op(verdictEdge, judge.flash < 0.12 ? judge.flash / 0.12 : 1 - phase(judge.flash, 0.12, 1));
    }
    // Verdicts ease into their slots; the oldest drifts toward the lane's end and fades there.
    const keep = small ? 1 : 3; // phones: one verdict at a time
    for (const c of chips) {
      if (c.slot < 0) continue;
      const target = small && c.slot >= keep ? CHIP0 + 18 : CHIP0 + Math.min(c.slot, keep) * chipDx();
      c.x += (target - c.x) * Math.min(1, dt * 9);
      const want = c.slot < keep ? 1 : 0;
      c.o += (want - c.o) * Math.min(1, dt * (want ? 8 : small ? 7 : 3.5));
      attr(c.g, "transform", `translate(${c.x.toFixed(1)} ${SY})`);
      op(c.g, c.o);
      if (c.slot >= keep && c.o < 0.02) { c.slot = -1; op(c.g, 0); }
    }
  });

  // ---- pointer: a crosshair reading any month -----------------------------------
  const hitRect = q<SVGRectElement>(svg, ".hit");
  const xh = q<SVGGElement>(svg, ".xh");
  const xl = q<SVGLineElement>(xh, ".xh-l");
  const xd = q<SVGCircleElement>(xh, ".xh-d");
  const xp = q<SVGGElement>(xh, ".xh-p");
  const xbox = q<SVGRectElement>(xp, ".xh-box");
  const tm = q<SVGTextElement>(xp, ".xh-m");
  svg.dataset.live = "";
  const glide = { f: 0, a: 0, w: 60, h: 22, on: false };

  // The whole series stays drawn; the crosshair adds a hairline, a dot on the
  // line and a "Mon YYYY: n" tag for that month.
  function show(i: number) {
    if (i === reading) return;
    if (reading >= 0) barAt.get(reading)?.classList.remove("on");
    reading = i;
    svg.classList.toggle("reading", i >= 0);
    if (i < 0) {
      if (readout) text(readout, resting());
      return;
    }
    barAt.get(i)?.classList.add("on");
    const [lab, mn] = G.m[i];
    const s = `${lab}: ${fmt.format(mn)}`;
    text(tm, s);
    if (readout) text(readout, `${s} submissions`);
    // Sized from its own type, once per month read (never per frame).
    const fs = parseFloat(getComputedStyle(tm).fontSize) || 13;
    const pad = fs * 0.6;
    glide.w = tm.getComputedTextLength() + pad * 2;
    glide.h = fs * 1.7;
    attr(tm, "x", pad.toFixed(1));
    attr(tm, "y", (glide.h / 2 + fs * 0.35).toFixed(1));
    attr(xbox, "width", glide.w.toFixed(1));
    attr(xbox, "height", glide.h.toFixed(1));
    if (!glide.on) glide.f = i; // it appears where it is asked for, and glides from there
  }
  whileVisible(root, (dt) => {
    const want = reading >= 0 ? 1 : 0;
    glide.on = want === 1 || glide.a > 0.02;
    if (!glide.on && glide.a === 0) return;
    if (reading >= 0) glide.f += (reading - glide.f) * Math.min(1, dt * 22);
    glide.a += (want - glide.a) * Math.min(1, dt * (want ? 18 : 9));
    if (glide.a < 0.01 && !want) glide.a = 0;
    const x = G.L + (glide.f / (n - 1)) * (G.R - G.L);
    attr(xl, "x1", x.toFixed(1));
    attr(xl, "x2", x.toFixed(1));
    attr(xd, "cx", x.toFixed(1));
    attr(xd, "cy", lineY(glide.f).toFixed(1));
    // The tag sits at the top of the hairline, held inside the plot.
    const px = Math.max(G.L, Math.min(G.R + 40 - glide.w, x - glide.w / 2));
    attr(xp, "transform", `translate(${px.toFixed(1)} ${(G.T - 12 - glide.h).toFixed(1)})`);
    attr(xh, "opacity", glide.a.toFixed(3));
    // Where the tag would sit on the pen's count (the pen is near the top of the plot, and the month read is near it), the count steps aside.
    const right = Math.max(pen.x - 10, G.L + pen.w);
    // (Its width is measured, not reckoned: on a narrow plot the numerals are set wider than the reckoning allows.)
    const wide = Math.max(pen.w, (count as unknown as SVGTextContentElement).getComputedTextLength?.() ?? 0);
    const clash = pen.y - 12 - (small ? 25 : 14) < G.T - 10 && px < right + 3 && px + glide.w > right - wide - 3;
    op(count, clash ? 1 - glide.a : 1);
  });

  let pending: PointerEvent | null = null;
  let releaseTimer = 0;
  function fromPointer() {
    const e = pending;
    pending = null;
    if (!e) return;
    const m = svg.getScreenCTM();
    if (!m) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const i = Math.max(0, Math.min(n - 1, Math.round(((pt.x - G.L) / (G.R - G.L)) * (n - 1))));
    // Only months the pen has already reached can be read.
    show(st.p >= PEN[1] || i <= penF ? i : -1);
  }
  const onPointer = (e: PointerEvent) => {
    clearTimeout(releaseTimer);
    if (!pending) requestAnimationFrame(fromPointer);
    pending = e;
  };
  const release = () => { pending = null; show(-1); };
  hitRect.addEventListener("pointermove", onPointer);
  hitRect.addEventListener("pointerdown", onPointer);
  hitRect.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") release();
    else releaseTimer = window.setTimeout(release, 2500);
  });
  hitRect.addEventListener("pointercancel", () => { releaseTimer = window.setTimeout(release, 2500); });

  render();
}
