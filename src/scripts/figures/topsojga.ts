import { gsap, scrubbed, whileVisible, phase, qa, q } from "../motion";

interface GA {
  L: number; R: number; T: number; B: number; vmax: number; peak: number;
  m: [string, number, number, number, number][]; // label, users, new, returning, engaged sessions
}

const fmt = new Intl.NumberFormat("en-US");

/** (a) Monthly users: the line draws left to right and the area fills in just behind it. */
function monthly(svg: SVGSVGElement, root: HTMLElement) {
  const G: GA = JSON.parse(svg.dataset.g!);
  const n = G.m.length;
  const W = svg.viewBox.baseVal.width;
  const clipLine = q<SVGRectElement>(svg, ".clip-line");
  const clipArea = q<SVGRectElement>(svg, ".clip-area");
  const head = q<SVGCircleElement>(svg, ".head");
  const pkDot = q<SVGCircleElement>(svg, ".pk-dot");
  const pulse = q<SVGCircleElement>(svg, ".pulse");
  const ann = q<SVGGElement>(svg, ".peak-ann");
  const xOf = (i: number) => G.L + (i / (n - 1)) * (G.R - G.L);
  const yOf = (v: number) => G.B - Math.sqrt(Math.max(0, v) / G.vmax) * (G.B - G.T);
  const peakU = xOf(G.peak);

  const st = { p: 1 };
  function render() {
    const p = st.p;
    const x = G.L + (G.R - G.L) * p;
    clipLine.setAttribute("width", (p >= 1 ? W : x + 2).toFixed(1));
    const pa = phase(p, 0.05, 1);
    clipArea.setAttribute("width", (pa >= 1 ? W : G.L + (G.R - G.L) * pa).toFixed(1));
    // The head rides the users line at the drawing edge.
    const fi = p * (n - 1);
    const i = Math.min(n - 2, Math.floor(fi));
    const t = fi - i;
    // Straight segments in screen space, so interpolate the drawn y, not the value.
    const y = yOf(G.m[i][1]) + (yOf(G.m[i + 1][1]) - yOf(G.m[i][1])) * t;
    head.setAttribute("cx", x.toFixed(1));
    head.setAttribute("cy", y.toFixed(1));
    head.style.opacity = p > 0.002 ? "1" : "0";
    const on = x >= peakU - 0.5;
    ann.style.opacity = on ? "" : "0";
    pkDot.style.opacity = on ? "1" : "0";
  }
  st.p = 0;
  render();
  scrubbed(svg, { start: "top 85%", endTrigger: root, end: "center 45%" }).to(st, { p: 1, duration: 1, onUpdate: render });

  // Ambient: a slow ring on the Summer Contest peak once the line has reached it.
  let ph = 0;
  whileVisible(svg, (dt) => {
    if (st.p < 0.99) { pulse.setAttribute("opacity", "0"); return; }
    ph = (ph + dt / 3) % 1;
    const u = Math.min(1, ph / 0.75);
    pulse.setAttribute("r", (4 + 10 * u).toFixed(2));
    pulse.setAttribute("opacity", (0.6 * (1 - u)).toFixed(2));
  });

  // Pointer: a crosshair reading any month.
  const hit = q<SVGRectElement>(svg, ".hit");
  const xh = q<SVGGElement>(svg, ".xh");
  const xl = q<SVGLineElement>(xh, ".xh-l");
  const xd = q<SVGCircleElement>(xh, ".xh-d");
  const xp = q<SVGGElement>(xh, ".xh-p");
  const box = q<SVGRectElement>(xp, ".xh-box");
  const tm = q<SVGTextElement>(xp, ".xh-m");
  const tv = qa<SVGTextElement>(xp, ".xh-v");
  svg.dataset.live = "";
  let cur = -1;
  function show(i: number) {
    if (i === cur) return;
    cur = i;
    svg.classList.toggle("reading", i >= 0);
    if (i < 0) { xh.setAttribute("opacity", "0"); return; }
    const [lab, users, nw, ret, eng] = G.m[i];
    const x = xOf(i);
    xl.setAttribute("x1", x.toFixed(1));
    xl.setAttribute("x2", x.toFixed(1));
    xd.setAttribute("cx", x.toFixed(1));
    xd.setAttribute("cy", yOf(users).toFixed(1));
    tm.textContent = lab;
    const vals = [`${fmt.format(users)} users`, `${fmt.format(nw)} new`, `${fmt.format(ret)} returning`, `${fmt.format(eng)} engaged sessions`];
    vals.forEach((s, k) => (tv[k].textContent = s));
    const fs = parseFloat(getComputedStyle(tm).fontSize) || 11.5;
    const lh = fs * 1.35, pad = fs * 0.8;
    [tm, ...tv].forEach((el, k) => {
      el.setAttribute("x", pad.toFixed(1));
      el.setAttribute("y", (pad + fs * 0.85 + k * lh).toFixed(1));
    });
    const w = Math.max(...[tm, ...tv].map((el) => el.getComputedTextLength())) + pad * 2;
    const h = lh * 4 + fs + pad * 1.6;
    box.setAttribute("width", w.toFixed(1));
    box.setAttribute("height", h.toFixed(1));
    const px = x + 12 + w <= G.R ? x + 12 : x - 12 - w;
    xp.setAttribute("transform", `translate(${px.toFixed(1)} ${(G.T - 6).toFixed(1)})`);
    xh.setAttribute("opacity", "1");
  }
  let pending: PointerEvent | null = null;
  let timer = 0;
  const read = () => {
    const e = pending;
    pending = null;
    if (!e) return;
    const m = svg.getScreenCTM();
    if (!m) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const i = Math.max(0, Math.min(n - 1, Math.round(((pt.x - G.L) / (G.R - G.L)) * (n - 1))));
    show(xOf(i) <= G.L + (G.R - G.L) * st.p + 0.5 ? i : -1);
  };
  const onPointer = (e: PointerEvent) => {
    clearTimeout(timer);
    if (!pending) requestAnimationFrame(read);
    pending = e;
  };
  hit.addEventListener("pointermove", onPointer);
  hit.addEventListener("pointerdown", onPointer);
  hit.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") show(-1);
    else timer = window.setTimeout(() => show(-1), 2500);
  });
}

/** (b) Pages: view bars grow in order, then each engagement lollipop runs out to its time. */
function pages(svg: SVGSVGElement, root: HTMLElement) {
  const rows = qa<SVGGElement>(svg, ".pg");
  const tl = scrubbed(svg, { start: "top 85%", endTrigger: root, end: "center 45%" });
  rows.forEach((g, k) => {
    const bar = q<SVGRectElement>(g, ".bar");
    const stem = q<SVGLineElement>(g, ".stem");
    const lol = q<SVGCircleElement>(g, ".lol");
    const texts = qa<SVGTextElement>(g, "text.val, .star-t");
    const x0 = Number(stem.getAttribute("x1")), x1 = Number(stem.getAttribute("x2"));
    gsap.set(bar, { attr: { width: 0 } });
    gsap.set(stem, { attr: { x2: x0 } });
    gsap.set(lol, { attr: { cx: x0 }, opacity: 0 });
    gsap.set(texts, { opacity: 0 });
    const t = k * 0.045;
    tl.to(bar, { attr: { width: Number(bar.dataset.w) }, duration: 0.14, ease: "power2.out" }, t)
      .to(lol, { opacity: 1, duration: 0.02 }, 0.3 + t)
      .to(stem, { attr: { x2: x1 }, duration: 0.16, ease: "power2.out" }, 0.3 + t)
      .to(lol, { attr: { cx: x1 }, duration: 0.16, ease: "power2.out" }, 0.3 + t)
      .to(texts, { opacity: 1, duration: 0.05 }, 0.42 + t);
  });
  const note = svg.querySelector(".con-note");
  if (note) {
    gsap.set(note, { opacity: 0 });
    tl.to(note, { opacity: 1, duration: 0.06 }, 0.9);
  }
}

/** (c) Channels: the stacked bar fills left to right, then engagement per channel, then browsers. */
function channels(svg: SVGSVGElement, root: HTMLElement) {
  const tl = scrubbed(svg, { start: "top 85%", endTrigger: root, end: "center 45%" });
  const segs = qa<SVGRectElement>(svg, ".seg");
  const segL = qa<SVGElement>(svg, ".seg-l");
  gsap.set(segs, { attr: { width: 0 } });
  gsap.set(segL, { opacity: 0 });
  let t = 0;
  for (const s of segs) {
    const w = Number(s.dataset.w);
    const d = Math.max(0.03, 0.28 * (w / 580));
    tl.to(s, { attr: { width: w }, duration: d }, t);
    t += d;
  }
  tl.to(segL, { opacity: 1, duration: 0.05, stagger: 0.03 }, t);
  qa<SVGGElement>(svg, ".ch").forEach((g, k) => {
    const stem = q<SVGLineElement>(g, ".stem");
    const lol = q<SVGCircleElement>(g, ".lol");
    const val = q<SVGTextElement>(g, "text.val");
    const x0 = Number(stem.getAttribute("x1")), x1 = Number(stem.getAttribute("x2"));
    gsap.set(stem, { attr: { x2: x0 } });
    gsap.set(lol, { attr: { cx: x0 }, opacity: 0 });
    gsap.set(val, { opacity: 0 });
    const at = 0.4 + k * 0.05;
    tl.to(lol, { opacity: 1, duration: 0.02 }, at)
      .to(stem, { attr: { x2: x1 }, duration: 0.18, ease: "power2.out" }, at)
      .to(lol, { attr: { cx: x1 }, duration: 0.18, ease: "power2.out" }, at)
      .to(val, { opacity: 1, duration: 0.05 }, at + 0.14);
  });
  const brs = qa<SVGRectElement>(svg, ".brseg");
  const brL = qa<SVGTextElement>(svg, ".br-l");
  gsap.set(brs, { attr: { width: 0 } });
  gsap.set(brL, { opacity: 0 });
  tl.to(brs, { attr: { width: (_: number, el: SVGRectElement) => Number(el.dataset.w) }, duration: 0.08, stagger: 0.04, ease: "none" }, 0.8)
    .to(brL, { opacity: 1, duration: 0.05 }, 0.9);
}

export default function (root: HTMLElement) {
  // Each panel starts as it enters and is finished by the time the plate's centre reaches 45%.
  qa<SVGSVGElement>(root, ".gd-asvg").forEach((svg) => monthly(svg, root));
  pages(q<SVGSVGElement>(root, ".gd-bsvg"), root);
  channels(q<SVGSVGElement>(root, ".gd-csvg"), root);
}
