import { gsap, scrubbed, undraw, whileVisible, qa, q } from "../motion";

interface G {
  L: number; R: number; T: number; B: number; max: number; BAR: number; TK: number;
  m: [string, number, number][];
  acc: number;
}
const NS = "http://www.w3.org/2000/svg";

export default function (root: HTMLElement) {
  const svg = q<SVGSVGElement>(root, "svg.sb");
  const G: G = JSON.parse(svg.dataset.g!);
  const line = q<SVGPathElement>(svg, ".line");
  const bars = qa<SVGRectElement>(svg, ".bar");
  const ticks = qa<SVGLineElement>(svg, ".tick");
  const head = q<SVGGElement>(svg, ".head");
  const count = q<SVGTextElement>(svg, ".count");
  const peakAnn = q<SVGGElement>(svg, ".peak-ann");
  const m100 = q<SVGGElement>(svg, ".m100");
  const strip = q<SVGGElement>(svg, ".strip");
  const readout = root.querySelector<HTMLElement>("[data-readout]");
  const n = G.m.length;
  const total = G.m[n - 1][2];
  const xOf = (i: number) => G.L + (i / (n - 1)) * (G.R - G.L);
  const yOf = (v: number) => G.B - (v / G.max) * (G.B - G.T);
  const full = line.getTotalLength();
  const fmt = new Intl.NumberFormat("en-US");
  let small = false; // phone-width plate: larger labels, fewer chips
  new ResizeObserver(() => { small = svg.getBoundingClientRect().width < 450; }).observe(svg);

  // ---- scroll story: the line draws, bars and contest ticks keep pace -----
  undraw(line);
  for (const t of ticks) t.dataset.y2 = t.getAttribute("y2")!;
  gsap.set(bars, { attr: { y: G.B, height: 0 } });
  gsap.set(ticks, { attr: { y2: G.TK } });
  gsap.set([head, peakAnn, m100], { opacity: 0 });
  gsap.set(strip, { opacity: 0 });

  const D0 = 0.06, DL = 0.84; // the line draws over [D0, D0 + DL]
  const when = (x: number) => D0 + ((x - G.L) / (G.R - G.L)) * DL;
  const state = { d: 0 };
  const tl = scrubbed(root, { start: "top 85%", end: "center 45%" });
  tl.to(strip, { opacity: 1, duration: 0.06, ease: "power3.out" }, 0)
    .set(head, { opacity: 1 }, D0)
    .to(line, { strokeDashoffset: 0, opacity: 1, duration: DL }, D0)
    .to(state, {
      d: full,
      duration: DL,
      onUpdate() {
        const p = line.getPointAtLength(state.d);
        head.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
        // The count reads off the line's height, so it is true at every frame.
        const v = Math.round(((G.B - p.y) / (G.B - G.T)) * G.max);
        const s = fmt.format(state.d >= full - 0.5 ? total : Math.max(0, Math.min(v, total)));
        count.textContent = s;
        if (readout) readout.textContent = `${s} submissions`;
      },
    }, D0);
  bars.forEach((b) => {
    const h = Number(b.dataset.h);
    tl.to(b, { attr: { y: G.B - h, height: h }, duration: 0.05, ease: "power2.out" }, when(xOf(Number(b.dataset.i))) - 0.02);
  });
  ticks.forEach((t) => {
    const x = Number(t.getAttribute("x1"));
    const y2 = Number(t.dataset.y2);
    tl.to(t, { attr: { y2 }, duration: 0.03, ease: "power2.out" }, when(x) - 0.01);
  });
  const peakX = Number(q<SVGLineElement>(peakAnn, "line").getAttribute("x1"));
  const x100 = Number(q<SVGCircleElement>(m100, "circle").getAttribute("cx"));
  tl.to(peakAnn, { opacity: 1, duration: 0.04 }, when(peakX))
    .to(m100, { opacity: 1, duration: 0.04 }, when(x100));

  // ---- ambient: a judge taking answers and returning verdicts ------------
  const box = q<SVGRectElement>(strip, ".box");
  const track = q<SVGLineElement>(strip, ".sb-track"); // the first track is the input side
  const prog = q<SVGLineElement>(strip, ".sb-prog");
  const toksLayer = q<SVGGElement>(strip, ".toks");
  const chipsLayer = q<SVGGElement>(strip, ".chips");
  const SY = Number(track.getAttribute("y1"));
  const X_IN = Number(track.getAttribute("x1"));
  const X_GATE = Number(track.getAttribute("x2"));
  const BX0 = Number(box.getAttribute("x")), BX1 = BX0 + Number(box.getAttribute("width"));
  const CHIP0 = 396;
  const chipDx = () => (small ? 60 : 36);
  const px0 = Number(prog.getAttribute("x1")), px1 = Number(prog.getAttribute("x2"));

  // Replace the static snapshot with live pools.
  toksLayer.replaceChildren();
  chipsLayer.replaceChildren();
  const bar = document.createElementNS(NS, "line");
  bar.setAttribute("class", "sb-bar");
  bar.setAttribute("y1", String(SY + 8));
  bar.setAttribute("y2", String(SY + 8));
  bar.setAttribute("x1", String(px0));
  bar.setAttribute("x2", String(px0));
  strip.insertBefore(bar, prog.nextSibling);

  const order: number[] = []; // live tokens, front of the queue first
  const toks = Array.from({ length: 8 }, () => {
    const r = document.createElementNS(NS, "rect");
    r.setAttribute("class", "tok");
    r.setAttribute("width", "10");
    r.setAttribute("height", "10");
    r.setAttribute("rx", "2");
    r.setAttribute("x", "-5");
    r.setAttribute("y", "-5");
    r.style.opacity = "0";
    toksLayer.append(r);
    return { r, x: 0, live: false };
  });
  const chips = Array.from({ length: 5 }, () => {
    const g = document.createElementNS(NS, "g");
    const r = document.createElementNS(NS, "rect");
    r.setAttribute("class", "chip-r");
    r.setAttribute("y", "-9");
    r.setAttribute("width", "30");
    r.setAttribute("height", "18");
    r.setAttribute("rx", "3");
    const t = document.createElementNS(NS, "text");
    t.setAttribute("class", "chip-t");
    t.setAttribute("x", "15");
    t.setAttribute("y", "4.3");
    t.setAttribute("text-anchor", "middle");
    g.append(r, t);
    g.style.opacity = "0";
    chipsLayer.append(g);
    return { g, t, x: CHIP0, slot: -1, o: 0 };
  });

  // Start from the snapshot the server drew: answers already on the track,
  // three verdicts already out.
  const TOK0 = [112, 180, 238, 286];
  TOK0.slice().reverse().forEach((x0, j) => {
    const tk = toks[j];
    tk.live = true;
    tk.x = x0;
    order.push(j);
  });

  // Verdicts follow a low-discrepancy sequence, so any run of answers is
  // accepted at very nearly the site's real rate.
  let seq = 0;
  const verdict = () => ((seq++ * 0.6180339887 + 0.31) % 1) < G.acc;
  const SPEED = 84;   // units per second along the track
  const JUDGE = 0.42; // seconds in the box
  let spawnIn = 0.2, busy = -1, flash = 0;
  const setChip = (c: (typeof chips)[number], ok: boolean) => {
    c.g.setAttribute("class", `chip ${ok ? "ac" : "wa"}`);
    c.t.textContent = ok ? "AC" : "WA";
  };
  [true, false, true].forEach((ok, j) => {
    const c = chips[j];
    c.slot = 2 - j;
    c.x = CHIP0 + c.slot * chipDx();
    c.o = 1;
    setChip(c, ok);
    c.g.setAttribute("transform", `translate(${c.x} ${SY})`);
  });

  whileVisible(root, (dt) => {
    if (tl.progress() < 0.04) return;
    spawnIn -= dt;
    if (spawnIn <= 0) {
      const tk = toks.find((t) => !t.live);
      if (tk && order.length < 6) {
        tk.live = true;
        tk.x = X_IN;
        order.push(toks.indexOf(tk));
      }
      spawnIn = 0.45 + Math.random() * 0.75;
    }
    // Tokens slide right and queue at the gate.
    order.forEach((ti, qi) => {
      const tk = toks[ti];
      const limit = X_GATE - (small ? 8 : 5) - qi * (small ? 20 : 14);
      tk.x = Math.min(limit, tk.x + SPEED * dt);
      tk.r.setAttribute("transform", `translate(${tk.x.toFixed(1)} ${SY})`);
      tk.r.style.opacity = Math.min(1, (tk.x - X_IN) / 18).toFixed(2);
    });
    // The box takes the front token when free.
    if (busy < 0 && order.length && toks[order[0]].x >= X_GATE - (small ? 8.5 : 5.5)) {
      const tk = toks[order.shift()!];
      tk.live = false;
      tk.r.style.opacity = "0";
      busy = 0;
    }
    if (busy >= 0) {
      busy += dt;
      const u = Math.min(1, busy / JUDGE);
      bar.setAttribute("x2", (px0 + (px1 - px0) * u).toFixed(1));
      if (u >= 1) {
        busy = -1;
        bar.setAttribute("x2", String(px0));
        const ok = verdict();
        for (const c of chips) if (c.slot >= 0) c.slot++;
        const c = chips.find((k) => k.slot < 0 || k.slot > 3) ?? chips[0];
        c.slot = 0;
        c.x = BX1 - 10;
        c.o = 0;
        setChip(c, ok);
        box.style.stroke = ok ? "var(--s-green)" : "var(--s-red)";
        flash = 0.35;
      }
    }
    if (flash > 0) {
      flash -= dt;
      if (flash <= 0) box.style.stroke = "";
    }
    // Chips ease into their slots; the oldest fades away.
    const keep = small ? 1 : 3; // phones: one verdict at a time, the last one drifting out
    for (const c of chips) {
      if (c.slot < 0) continue;
      // A chip pushed past the last slot drifts on toward the lane end and fades there.
      // On phones the lane holds one verdict; the previous one fades out a step behind it.
      const target = small && c.slot >= keep ? CHIP0 + 18 : CHIP0 + Math.min(c.slot, keep) * chipDx();
      c.x += (target - c.x) * Math.min(1, dt * 9);
      const want = c.slot < keep ? 1 : 0;
      c.o += (want - c.o) * Math.min(1, dt * (want ? 8 : small ? 7 : 3.5));
      c.g.setAttribute("transform", `translate(${c.x.toFixed(1)} ${SY})`);
      c.g.style.opacity = c.o.toFixed(2);
      if (c.slot >= keep && c.o < 0.02) { c.slot = -1; c.g.style.opacity = "0"; }
    }
  });

  // ---- pointer: a crosshair reading any month -----------------------------
  const hit = q<SVGRectElement>(svg, ".hit");
  const xh = q<SVGGElement>(svg, ".xh");
  const xl = q<SVGLineElement>(xh, ".xh-l");
  const xd = q<SVGCircleElement>(xh, ".xh-d");
  const xp = q<SVGGElement>(xh, ".xh-p");
  const xbox = q<SVGRectElement>(xp, ".xh-box");
  const tm = q<SVGTextElement>(xp, ".xh-m");
  svg.dataset.live = "";
  const resting = () => (readout ? readout.textContent : "");
  let saved = "";

  let cur = -1;
  // The whole series stays drawn; the crosshair only adds a hairline, a dot
  // on the line and a "Mon YYYY: n" readout for that month.
  function show(i: number) {
    if (i === cur) return;
    if (cur >= 0) bars.find((b) => Number(b.dataset.i) === cur)?.classList.remove("on");
    if (cur < 0 && i >= 0) saved = resting() ?? "";
    cur = i;
    if (i < 0) {
      xh.setAttribute("opacity", "0");
      if (readout && saved) readout.textContent = saved;
      return;
    }
    bars.find((b) => Number(b.dataset.i) === i)?.classList.add("on");
    const [lab, mn, mc] = G.m[i];
    const x = xOf(i), y = yOf(mc);
    xl.setAttribute("x1", x.toFixed(1));
    xl.setAttribute("x2", x.toFixed(1));
    xd.setAttribute("cx", x.toFixed(1));
    xd.setAttribute("cy", y.toFixed(1));
    const text = `${lab}: ${fmt.format(mn)}`;
    tm.textContent = text;
    if (readout) readout.textContent = `${text} submissions`;
    const fs = parseFloat(getComputedStyle(tm).fontSize) || 13;
    const pad = fs * 0.6;
    const w = tm.getComputedTextLength() + pad * 2;
    const h = fs * 1.7;
    tm.setAttribute("x", pad.toFixed(1));
    tm.setAttribute("y", (h / 2 + fs * 0.35).toFixed(1));
    xbox.setAttribute("width", w.toFixed(1));
    xbox.setAttribute("height", h.toFixed(1));
    // The tag sits at the top of the hairline, flipped to stay inside the plot.
    const px = Math.max(G.L, Math.min(G.R + 40 - w, x - w / 2));
    xp.setAttribute("transform", `translate(${px.toFixed(1)} ${(G.T - 12 - h).toFixed(1)})`);
    xh.setAttribute("opacity", "1");
  }

  let pending: PointerEvent | null = null;
  let releaseTimer = 0;
  function fromPointer() {
    const e = pending;
    pending = null;
    if (!e) return;
    const m = svg.getScreenCTM();
    if (!m) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const i = Math.round(((pt.x - G.L) / (G.R - G.L)) * (n - 1));
    // Only months the line has already drawn can be read.
    const drawn = tl.progress() >= when(xOf(Math.max(0, Math.min(n - 1, i)))) + 0.01;
    show(drawn ? Math.max(0, Math.min(n - 1, i)) : -1);
  }
  const onPointer = (e: PointerEvent) => {
    clearTimeout(releaseTimer);
    if (!pending) requestAnimationFrame(fromPointer);
    pending = e;
  };
  hit.addEventListener("pointermove", onPointer);
  hit.addEventListener("pointerdown", onPointer);
  hit.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") show(-1);
    else releaseTimer = window.setTimeout(() => show(-1), 2500);
  });
}
