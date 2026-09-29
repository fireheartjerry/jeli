import { gsap, scrubbed, whileVisible, phase, q, qa } from "../motion";

interface Geo {
  total: number; goldEnd: number; lengths: number[]; n: number;
  cells: [number, number][]; XL: number; XR: number; start: number; cell: number;
}

const e3 = (u: number) => 1 - (1 - u) ** 3;
const fmt = new Intl.NumberFormat("en-US");
const FRONT = 180; // cells in the flipping band at the sweep front

export default function (root: HTMLElement) {
  const svg = q<SVGSVGElement>(root, "svg");
  const G: Geo = JSON.parse(svg.dataset.g!);
  const readout = root.querySelector<HTMLElement>("[data-readout]");
  const op = (el: Element, v: number) => ((el as SVGElement).style.opacity = v.toFixed(3));

  // 1. staircase, badges, grid
  const stair = q<SVGPathElement>(root, ".stair");
  const plat = q<SVGPathElement>(root, ".plat");
  const divs = qa<SVGGElement>(root, ".div");
  const count = q<SVGTextElement>(root, ".count");
  const on = q<SVGPathElement>(root, ".cells-on");
  const front = q<SVGPathElement>(root, ".cells-front");
  const glint = q<SVGRectElement>(root, ".cells-glint");
  const glintClip = q<SVGRectElement>(root, ".glint-clip");
  const vds = qa<SVGGElement>(root, ".vd");
  const vdText = q<SVGTextElement>(root, ".vd-t");
  const cellsD = on.getAttribute("d")!;
  const offsets: number[] = [];
  for (let i = cellsD.indexOf("M"); i !== -1; i = cellsD.indexOf("M", i + 1)) offsets.push(i);
  offsets.push(cellsD.length);
  const platLen = plat.getTotalLength();
  stair.style.strokeDasharray = `${G.total} ${G.total}`;
  plat.style.strokeDasharray = `${platLen} ${platLen}`;
  const C = G.cell;

  // 2. strips
  const strips = qa<SVGGElement>(root, ".strip");
  const tracks = qa<SVGLineElement>(root, ".track");
  const trackLen = G.XR - G.XL;
  tracks.forEach((t) => (t.style.strokeDasharray = `${trackLen} ${trackLen}`));
  const ticks = qa<SVGPathElement>(root, ".ticks");
  const marks = qa<SVGGElement>(root, ".mk").map((el) => {
    const lead = q<SVGPathElement>(el, ".lead");
    const len = lead.getTotalLength();
    lead.style.strokeDasharray = `${len} ${len}`;
    return { needle: q<SVGGElement>(el, ".needle"), call: q<SVGGElement>(el, ".call"), lead, len, label: q(el, ".cl"), x: Number(el.dataset.x), y: Number(el.dataset.y) };
  });
  const axisText = [...qa(root, ".tk"), ...qa(root, ".axl")];
  const names = qa(root, ".nm");

  // 3. AIME
  const aline = q<SVGLineElement>(root, ".aline");
  const alen = Number(aline.getAttribute("x2")) - Number(aline.getAttribute("x1"));
  aline.style.strokeDasharray = `${alen} ${alen}`;
  const years = qa<SVGGElement>(root, ".ay");

  let shown = -1, frontKey = "";
  let p = 0;
  let glintX = -1;

  function renderStairs(): string {
    // Draw up to the end of Gold, sweep the grid, then climb to Platinum.
    const up = G.goldEnd * phase(p, 0, 0.18) + (G.total - G.goldEnd) * phase(p, 0.5, 0.58);
    stair.style.strokeDashoffset = String(G.total - up);
    op(stair, up > 0 ? 1 : 0);
    divs.forEach((d, i) => {
      const u = e3(phase(up, G.lengths[i], G.lengths[i] + 30));
      op(d, u);
      d.setAttribute("transform", `translate(0 ${((1 - u) * 4).toFixed(2)})`);
    });
    const k = phase(p, 0.58, 0.64);
    plat.style.strokeDashoffset = String(platLen * (1 - k));
    op(plat, k > 0 ? 1 : 0);
    divs[3].classList.toggle("top", k >= 1);

    // The sweep: settled cells in one substring, and a band of cells at the
    // front still flipping (drawn as shrinking-to-full squares).
    const sweep = phase(p, 0.2, 0.5) * (G.n + FRONT);
    const n = Math.max(0, Math.min(G.n, Math.floor(sweep - FRONT)));
    if (n !== shown) {
      shown = n;
      on.setAttribute("d", n ? cellsD.slice(0, offsets[n]) : "M0 0");
    }
    const hi = Math.min(G.n, Math.floor(sweep));
    const key = `${n}:${hi}:${Math.round(sweep * 4)}`;
    if (key !== frontKey) {
      frontKey = key;
      let d = "";
      for (let i = n; i < hi; i++) {
        const u = Math.min(1, (sweep - i) / FRONT);
        // Each cell turns over edge-on first, then opens to a full square.
        const [x, y] = G.cells[i];
        const hh = Math.max(0.35, C * Math.sin((Math.PI / 2) * u));
        d += `M${x} ${(y + (C - hh) / 2).toFixed(2)}h${C}v${hh.toFixed(2)}h-${C}z`;
      }
      front.setAttribute("d", d || "M0 0");
      op(front, 0.72);
    }
    const lit = Math.min(G.n, Math.max(0, Math.floor(sweep - FRONT / 2)));
    count.textContent = `${fmt.format(lit)} / ${fmt.format(G.n)}`;
    op(count, phase(p, 0.17, 0.21));
    vds.forEach((v, i) => {
      const u = e3(phase(p, 0.3 + i * 0.1, 0.34 + i * 0.1));
      op(v, u);
      const [cx, cy] = [Number(v.querySelector("circle")!.getAttribute("cx")), Number(v.querySelector("circle")!.getAttribute("cy"))];
      v.setAttribute("transform", `translate(${cx} ${cy}) scale(${(0.6 + 0.4 * u).toFixed(3)}) translate(${-cx} ${-cy})`);
    });
    op(vdText, phase(p, 0.5, 0.54));

    if (k > 0) return "USACO Platinum";
    if (p >= 0.2) return `Gold  ${fmt.format(lit)} / ${fmt.format(G.n)}`;
    if (up >= G.lengths[2]) return "USACO Gold";
    if (up >= G.lengths[1]) return "USACO Silver";
    return up > 0 ? "USACO Bronze" : "";
  }

  function renderStrips(): string {
    const windows = [[0.56, 0.72], [0.6, 0.76], [0.66, 0.82], [0.7, 0.86]];
    tracks.forEach((t, i) => {
      const d = phase(p, 0.52 + i * 0.08, 0.62 + i * 0.08);
      t.style.strokeDashoffset = String(trackLen * (1 - d));
      op(t, d > 0 ? 1 : 0);
      op(ticks[i], phase(p, 0.56 + i * 0.08, 0.64 + i * 0.08));
      op(names[i * 2], phase(p, 0.52 + i * 0.08, 0.56 + i * 0.08));
    });
    axisText.forEach((el) => op(el, phase(p, 0.64, 0.7)));
    let label = "";
    marks.forEach((m, i) => {
      const [a, b] = windows[i];
      const u = phase(p, a, b);
      const x = G.start + (m.x - G.start) * e3(phase(u, 0, 0.7));
      m.needle.setAttribute("transform", `translate(${x.toFixed(2)} ${m.y})`);
      op(m.needle, phase(u, 0, 0.08));
      const c = phase(u, 0.7, 1);
      m.lead.style.strokeDashoffset = String(m.len * (1 - c));
      op(m.lead, c > 0 ? 1 : 0);
      op(m.label, phase(c, 0.5, 1));
      if (u > 0) label = i < 2 ? "PhysicsBowl: CA 1, world 7" : "Newton: CA 4, world 9";
    });
    return label;
  }

  function renderAime(): string {
    const lu = phase(p, 0.84, 1);
    aline.style.strokeDashoffset = String(alen * (1 - lu));
    op(aline, lu > 0 ? 1 : 0);
    const done: number[] = [];
    years.forEach((y, i) => {
      const u = lu > 0 ? e3(phase(lu, i * 0.45, i * 0.45 + 0.1)) : 0;
      op(y, u);
      if (u >= 1) done.push(2024 + i);
    });
    return lu > 0 ? `AIME ${done.join(", ")}` : "";
  }

  function render() {
    const a = renderStairs();
    const b = renderStrips();
    const c = renderAime();
    const s = c || b || a;
    if (readout && readout.textContent !== s) readout.textContent = s;
  }

  // On phones the plate is short against a tall viewport, so the story has to
  // finish while the whole figure is still on screen.
  const mm = gsap.matchMedia();
  const bind = (vars: Parameters<typeof scrubbed>[1]) => () => {
    const tl = scrubbed(root, vars);
    const clock = { p: 0 };
    tl.to(clock, { p: 1, duration: 1, ease: "none" });
    tl.eventCallback("onUpdate", () => {
      p = clock.p;
      render();
    });
  };
  mm.add("(min-width: 561px)", bind({ start: "top 70%", end: "bottom 62%" }));
  mm.add("(max-width: 560px)", bind({ start: "top 80%", end: "bottom 82%" }));
  render();

  // Ambient: once the grid is complete, a faint re-judge glint crosses it
  // every few seconds.
  const gx0 = Number(glintClip.getAttribute("x"));
  let tt = 0;
  whileVisible(root, (dt) => {
    if (p < 0.5) {
      if (glintX !== -1) { glint.style.opacity = "0"; glintX = -1; }
      return;
    }
    tt = (tt + dt) % 4.5;
    const u = Math.min(1, tt / 1.6);
    glintX = gx0 + u * 420;
    glintClip.setAttribute("x", glintX.toFixed(1));
    glint.style.opacity = u < 1 ? (0.4 * Math.sin(Math.PI * u)).toFixed(3) : "0";
  });

  // Pointer: a strip shows its full label; tap toggles on touch.
  strips.forEach((s) => {
    const set = (v: boolean) => {
      strips.forEach((o) => o.classList.toggle("on", v && o === s));
      render();
    };
    s.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && set(true));
    s.addEventListener("pointerleave", (e) => e.pointerType === "mouse" && set(false));
    s.addEventListener("pointerdown", (e) => e.pointerType !== "mouse" && set(!s.classList.contains("on")));
  });
}
