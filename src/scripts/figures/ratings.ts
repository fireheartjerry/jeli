import { gsap, scrubbed, undraw, whileVisible, qa, q } from "../motion";

interface G {
  lines: { p: [number, number][]; r: number; t: string }[];
  b: number; t: number; min: number; max: number;
}

export default function (root: HTMLElement) {
  const svg = q<SVGSVGElement>(root, "svg.rt");
  const G: G = JSON.parse(svg.dataset.g!);
  const others = qa<SVGPathElement>(svg, ".lines .traj");
  const lead = q<SVGPathElement>(svg, ".lead");
  const paths = [...others, lead];
  const head = q<SVGGElement>(svg, ".head");
  const val = q<SVGTextElement>(head, ".val");
  const pulse = q<SVGCircleElement>(head, ".pulse");
  const bands = qa<SVGRectElement>(svg, ".bands .band");
  const rules = qa<SVGLineElement>(svg, ".bands .rule");
  const axis = qa<SVGTextElement>(svg, ".axis text");
  const bins = qa<SVGRectElement>(svg, ".hist .bin");
  const cnts = qa<SVGTextElement>(svg, ".hist .cnt");
  const med = q<SVGLineElement>(svg, ".hist .med");
  const hks = qa<SVGTextElement>(svg, ".hk");
  const last = Number(val.dataset.last);
  const full = lead.getTotalLength();

  // ---- scroll story ------------------------------------------------------
  undraw(paths);
  gsap.set([head, ...axis, ...cnts, ...hks, ...rules], { opacity: 0 });
  gsap.set(bands, { opacity: 0 });
  gsap.set(bins, { attr: { width: 0 } });
  const mx1 = Number(med.getAttribute("x1")), mx2 = Number(med.getAttribute("x2"));
  gsap.set(med, { attr: { x2: mx1 }, opacity: 0 });

  const state = { d: 0 };
  const tl = scrubbed(root, { end: "center 40%" });
  // Tier bands settle from the bottom up while the distribution grows beside
  // them; then eight histories draw, the biggest climb last and in accent.
  tl.to(bands, { opacity: 1, duration: 0.05, stagger: 0.018, ease: "power3.out" }, 0)
    .to(rules, { opacity: 1, duration: 0.05 }, 0.08)
    .to(axis, { opacity: 1, duration: 0.05, stagger: 0.008 }, 0.04)
    .to(bins, { attr: { width: (_: number, el: SVGRectElement) => Number(el.dataset.w) }, duration: 0.07, stagger: 0.012, ease: "power2.out" }, 0.06)
    .to(cnts, { opacity: 1, duration: 0.04, stagger: 0.012 }, 0.1)
    .to(med, { attr: { x2: mx2 }, opacity: 1, duration: 0.06 }, 0.28)
    .to(hks, { opacity: 1, duration: 0.05 }, 0.3)
    // Each stroke becomes visible the instant it starts drawing: no fades.
    .to(others, { strokeDashoffset: 0, duration: 0.3, stagger: 0.055 }, 0.14)
    .to(others, { opacity: 1, duration: 0.001, stagger: 0.055 }, 0.14)
    .to(lead, { strokeDashoffset: 0, duration: 0.34 }, 0.6)
    .set([lead, head], { opacity: 1 }, 0.6)
    .to(state, {
      d: full,
      duration: 0.34,
      onUpdate() {
        const p = lead.getPointAtLength(state.d);
        head.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
        const r = G.min + ((G.b - p.y) / (G.b - G.t)) * (G.max - G.min);
        val.textContent = String(state.d >= full - 0.5 ? last : Math.round(r));
      },
    }, 0.6);

  // ---- ambient: the leader's marker breathes once everything is drawn ----
  let ph = 0;
  whileVisible(root, (dt) => {
    if (tl.progress() < 0.97) { pulse.setAttribute("opacity", "0"); return; }
    ph = (ph + dt / 2.6) % 1;
    const u = Math.min(1, ph / 0.7);
    pulse.setAttribute("r", (6.5 + 7 * u).toFixed(2));
    pulse.setAttribute("opacity", (0.55 * (1 - u)).toFixed(2));
  });

  // ---- pointer: pick out the nearest history -----------------------------
  const hit = q<SVGRectElement>(svg, ".hit");
  const tag = q<SVGGElement>(svg, ".tag");
  const tagR = q<SVGRectElement>(tag, ".tag-r");
  const tagD = q<SVGCircleElement>(tag, ".tag-d");
  const tagV = q<SVGTextElement>(tag, ".tag-v");
  const tagT = q<SVGTextElement>(tag, ".tag-t");
  svg.dataset.live = "";
  let small = false;
  new ResizeObserver(() => { small = svg.getBoundingClientRect().width < 450; }).observe(svg);

  function nearest(x: number, y: number) {
    let best = -1, bd = (small ? 34 : 22) ** 2;
    G.lines.forEach((l, k) => {
      const p = l.p;
      for (let i = 0; i < p.length - 1; i++) {
        const [ax, ay] = p[i], [bx, by] = p[i + 1];
        const dx = bx - ax, dy = by - ay;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
        const d = (ax + t * dx - x) ** 2 + (ay + t * dy - y) ** 2;
        if (d < bd) { bd = d; best = k; }
      }
    });
    return best;
  }

  let cur = -1;
  function focus(k: number) {
    if (k === cur) return;
    if (cur >= 0) paths[cur].classList.remove("on");
    cur = k;
    svg.classList.toggle("focus", k >= 0);
    // The timeline owns the head's inline opacity; only dim it once it is drawn.
    if (tl.progress() >= 0.6) head.style.opacity = k < 0 || k === paths.length - 1 ? "1" : "0.25";
    if (k < 0) { tag.setAttribute("opacity", "0"); return; }
    paths[k].classList.add("on");
    const l = G.lines[k];
    const [ex, ey] = l.p[l.p.length - 1];
    if (k === paths.length - 1) { tag.setAttribute("opacity", "0"); return; }
    tagD.style.stroke = getComputedStyle(paths[k]).stroke;
    tagV.textContent = String(l.r);
    tagT.textContent = l.t;
    const pad = small ? 14 : 9, gap = small ? 10 : 6;
    const wv = tagV.getComputedTextLength(), wt = tagT.getComputedTextLength();
    const w = pad * 2 + wv + gap + wt;
    const h = small ? 34 : 20;
    const flip = ex + 10 + w > Number(hit.getAttribute("x")) + Number(hit.getAttribute("width"));
    const x0 = flip ? -10 - w : 10;
    tagR.setAttribute("x", x0.toFixed(1));
    tagR.setAttribute("y", String(-h / 2));
    tagR.setAttribute("width", w.toFixed(1));
    tagR.setAttribute("height", String(h));
    tagR.setAttribute("rx", String(h / 2));
    tagV.setAttribute("x", (x0 + pad).toFixed(1));
    tagT.setAttribute("x", (x0 + pad + wv + gap).toFixed(1));
    const base = small ? 7 : 4;
    tagV.setAttribute("y", String(base));
    tagT.setAttribute("y", String(base - 0.5));
    tag.setAttribute("transform", `translate(${ex.toFixed(1)} ${ey.toFixed(1)})`);
    tag.setAttribute("opacity", "1");
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
    focus(tl.progress() > 0.9 ? nearest(pt.x, pt.y) : -1);
  }
  const onPointer = (e: PointerEvent) => {
    clearTimeout(releaseTimer);
    if (!pending) requestAnimationFrame(fromPointer);
    pending = e;
  };
  hit.addEventListener("pointermove", onPointer);
  hit.addEventListener("pointerdown", onPointer);
  hit.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") focus(-1);
    else releaseTimer = window.setTimeout(() => focus(-1), 2500);
  });
}
