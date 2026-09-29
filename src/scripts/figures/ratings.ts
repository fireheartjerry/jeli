import { gsap, scrubbed, undraw, whileVisible, qa, q } from "../motion";

interface G {
  lines: [number, number, number, string][][]; // x, y, rating, "Mon YYYY" per contest
  b: number; t: number; l: number; r: number; min: number; max: number;
}
const NS = "http://www.w3.org/2000/svg";

export default function (root: HTMLElement) {
  const svg = q<SVGSVGElement>(root, "svg.rt");
  const G: G = JSON.parse(svg.dataset.g!);
  const trajs = [...qa<SVGGElement>(svg, ".lines .traj"), q<SVGGElement>(svg, ".traj.lead")];
  const steps = trajs.map((g) => q<SVGPathElement>(g, ".step"));
  const dots = trajs.map((g) => q<SVGPathElement>(g, ".dots"));
  const lead = steps[steps.length - 1];
  const head = q<SVGGElement>(svg, ".head");
  const pulse = q<SVGCircleElement>(head, ".pulse");
  const rules = qa<SVGLineElement>(svg, ".tiers .rule");
  const labels = qa<SVGTextElement>(svg, ".tiers text");
  const bins = qa<SVGRectElement>(svg, ".hist .bin");
  const cnts = qa<SVGTextElement>(svg, ".hist .cnt");
  const hks = qa<SVGElement>(svg, ".hk, .med");

  // A small rider marks the protagonist's drawing edge; the labelled marker
  // appears only once the line has reached its last contest.
  const rider = document.createElementNS(NS, "circle");
  rider.setAttribute("r", "2.6");
  rider.setAttribute("class", "dot-accent");
  rider.style.opacity = "0";
  svg.insertBefore(rider, head);

  // ---- scroll story ------------------------------------------------------
  undraw(steps);
  gsap.set([...dots, head, ...labels, ...cnts, ...hks, ...rules], { opacity: 0 });
  gsap.set(bins, { attr: { width: 0 } });

  const full = lead.getTotalLength();
  const st = { d: 0 };
  const tl = scrubbed(root, { start: "top 85%", end: "center 45%" });
  tl.to(rules, { opacity: 1, duration: 0.06, stagger: 0.01 }, 0)
    .to(labels, { opacity: 1, duration: 0.06, stagger: 0.006 }, 0.02)
    .to(bins, { attr: { width: (_: number, el: SVGRectElement) => Number(el.dataset.w) }, duration: 0.08, stagger: 0.012, ease: "power2.out" }, 0.04)
    .to(cnts, { opacity: 1, duration: 0.04, stagger: 0.012 }, 0.08)
    .to(hks, { opacity: 1, duration: 0.05 }, 0.24);
  const others = steps.slice(0, -1);
  others.forEach((p, k) => {
    const at = 0.1 + k * 0.05;
    tl.set(p, { opacity: 1 }, at)
      .to(p, { strokeDashoffset: 0, duration: 0.24 }, at)
      .to(dots[k], { opacity: 1, duration: 0.05 }, at + 0.2);
  });
  tl.set([lead, rider], { opacity: 1 }, 0.56)
    .to(lead, { strokeDashoffset: 0, duration: 0.34 }, 0.56)
    .to(st, {
      d: full,
      duration: 0.34,
      onUpdate() {
        const p = lead.getPointAtLength(st.d);
        rider.setAttribute("cx", p.x.toFixed(1));
        rider.setAttribute("cy", p.y.toFixed(1));
      },
    }, 0.56)
    .to(dots[dots.length - 1], { opacity: 1, duration: 0.05 }, 0.86)
    .set(rider, { opacity: 0 }, 0.9)
    .to(head, { opacity: 1, duration: 0.05, ease: "power3.out" }, 0.9);

  // ---- ambient: the protagonist's marker breathes --------------------------
  let ph = 0;
  whileVisible(root, (dt) => {
    if (tl.progress() < 0.97) { pulse.setAttribute("opacity", "0"); return; }
    ph = (ph + dt / 2.6) % 1;
    const u = Math.min(1, ph / 0.7);
    pulse.setAttribute("r", (4.5 + 7 * u).toFixed(2));
    pulse.setAttribute("opacity", (0.55 * (1 - u)).toFixed(2));
  });

  // ---- pointer: the nearest contest result, on its line --------------------
  const hit = q<SVGRectElement>(svg, ".hit");
  const tag = q<SVGGElement>(svg, ".tag");
  const tagR = q<SVGRectElement>(tag, ".tag-r");
  const tagD = q<SVGCircleElement>(tag, ".tag-d");
  const tagV = q<SVGTextElement>(tag, ".tag-v");
  svg.dataset.live = "";

  let cur = "";
  function focus(k: number, i: number) {
    const key = `${k}:${i}`;
    if (key === cur) return;
    trajs.forEach((g, j) => g.classList.toggle("on", j === k));
    cur = key;
    svg.classList.toggle("focus", k >= 0);
    if (k < 0) { tag.setAttribute("opacity", "0"); return; }
    const [px, py, r, when] = G.lines[k][i];
    tagD.style.stroke = k === trajs.length - 1 ? "var(--accent)" : "";
    tagV.textContent = `${when}: ${r}`;
    const fs = parseFloat(getComputedStyle(tagV).fontSize) || 13;
    const pad = fs * 0.6;
    const w = tagV.getComputedTextLength() + pad * 2;
    const h = fs * 1.7;
    const flip = px + 10 + w > G.r;
    const x0 = flip ? -10 - w : 10;
    const y0 = py - h - 6 < G.t ? 6 : -h - 6;
    tagR.setAttribute("x", x0.toFixed(1));
    tagR.setAttribute("y", y0.toFixed(1));
    tagR.setAttribute("width", w.toFixed(1));
    tagR.setAttribute("height", h.toFixed(1));
    tagV.setAttribute("x", (x0 + pad).toFixed(1));
    tagV.setAttribute("y", (y0 + h / 2 + fs * 0.35).toFixed(1));
    tag.setAttribute("transform", `translate(${px.toFixed(1)} ${py.toFixed(1)})`);
    tag.setAttribute("opacity", "1");
  }

  let pending: PointerEvent | null = null;
  let timer = 0;
  function read() {
    const e = pending;
    pending = null;
    if (!e) return;
    const m = svg.getScreenCTM();
    if (!m) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    if (tl.progress() < 0.9) { focus(-1, 0); return; }
    let bk = -1, bi = 0, bd = (svg.getBoundingClientRect().width < 450 ? 40 : 26) ** 2;
    G.lines.forEach((l, k) => l.forEach(([x, y], i) => {
      const d = (x - pt.x) ** 2 + (y - pt.y) ** 2;
      if (d < bd) { bd = d; bk = k; bi = i; }
    }));
    focus(bk, bi);
  }
  const onPointer = (e: PointerEvent) => {
    clearTimeout(timer);
    if (!pending) requestAnimationFrame(read);
    pending = e;
  };
  hit.addEventListener("pointermove", onPointer);
  hit.addEventListener("pointerdown", onPointer);
  hit.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") focus(-1, 0);
    else timer = window.setTimeout(() => focus(-1, 0), 2500);
  });
}
