import { gsap, ScrollTrigger, reducedMotion } from "./motion";
import { aBallistic, aConservative, masses, omega, roche, toPath, F_MAX as DM_MAX } from "./binary";

const fig = document.querySelector<HTMLElement>("[data-hero]");
if (fig && !reducedMotion()) init(fig);

function init(fig: HTMLElement) {
  const G = JSON.parse(fig.dataset.g!);
  const $ = <T extends Element>(s: string) => fig.querySelector<T>(s)!;
  const donor = $<SVGPathElement>(".donor");
  const lobe = $<SVGPathElement>(".lobe");
  const accretor = $<SVGCircleElement>(".accretor");
  const rings = fig.querySelectorAll<SVGCircleElement>(".ring");
  const ghost = $<SVGCircleElement>(".ring-ghost");
  const ghostLab = $<SVGTextElement>(".ghost-lab");
  const streamG = $<SVGGElement>(".stream");
  const cCons = $<SVGPathElement>(".c-cons");
  const cBall = $<SVGPathElement>(".c-ball");
  const hCons = $<SVGCircleElement>(".h-cons");
  const hBall = $<SVGCircleElement>(".h-ball");
  const cursor = $<SVGLineElement>(".cursor");
  const readout = $<HTMLElement>(".readout");
  const labCons = $<SVGTextElement>(".lab-cons");
  const labBall = $<SVGTextElement>(".lab-ball");

  const X = (dm: number) => G.px0 + (dm / DM_MAX) * (G.px1 - G.px0);
  const Y = (a: number) => G.py0 - ((a - G.amin) / (G.amax - G.amin)) * (G.py0 - G.py1);

  // Curves are rebuilt up to the current Δm each frame: 60 points is cheap,
  // and it keeps the line exactly under the moving head dots.
  const partial = (f: (dm: number) => number, dm: number) => {
    const n = Math.max(1, Math.round((dm / DM_MAX) * 60));
    let d = "";
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * dm;
      d += `${i ? "L" : "M"}${X(x).toFixed(1)} ${Y(f(x)).toFixed(1)}`;
    }
    return d;
  };

  // Stream parcels: each has a phase u in [0,1) along a curved path from the
  // donor's L1 point to the accretor, defined in the co-rotating frame.
  const N = 26;
  const parcels = Array.from({ length: N }, (_, i) => {
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("r", "1.7");
    c.setAttribute("opacity", "0");
    streamG.append(c);
    return { el: c, u: i / N };
  });

  let dm = 0;
  let theta = -0.35;
  let lobeDm = -1;
  let donorPts: [number, number][] = [];
  let accPts: [number, number][] = [];
  let l1 = 0;
  const fmt = (v: number, d = 3) => v.toFixed(d);

  function frame(dt: number) {
    const { md, ma } = masses(dm);
    const ab = aBallistic(dm);
    const a = ab * G.S;
    const ac = aConservative(dm) * G.S;

    // Kepler: the tighter orbit turns faster. 0.5 rad/s at a0.
    theta += omega(ab) * 0.5 * dt;
    const cos = Math.cos(theta), sin = Math.sin(theta);
    const rot = (x: number, y: number) => [G.cx + x * cos - y * sin, G.cy + x * sin + y * cos];

    const [ax, ay] = rot(a * md, 0);
    // The lobes only change with Δm, so recompute them only when it moves.
    if (dm !== lobeDm) {
      lobeDm = dm;
      const R = roche(md, ma);
      donorPts = R.donor();
      accPts = R.accretor();
      l1 = R.l1;
    }
    const map = (x: number, y: number) => rot(x * a, y * a) as [number, number];
    donor.setAttribute("d", toPath(donorPts, map));
    lobe.setAttribute("d", toPath(accPts, map));
    accretor.setAttribute("cx", ax.toFixed(2));
    accretor.setAttribute("cy", ay.toFixed(2));
    rings[0].setAttribute("r", (a * ma).toFixed(2));
    rings[1].setAttribute("r", (a * md).toFixed(2));
    ghost.setAttribute("r", (ac * ma).toFixed(2));
    // The classical ring only earns its place once the two predictions part.
    const apart = Math.min(1, (ac / a - 1) * 12);
    ghost.style.opacity = String(apart);
    ghostLab.setAttribute("y", (G.cy - ac * ma - 8).toFixed(1));
    // The label sits at 12 o'clock; step it aside while the donor swings past.
    const donorUp = -Math.sin(theta + Math.PI); // 1 when the donor is at the top
    ghostLab.style.opacity = String(apart * Math.min(1, Math.max(0, (0.72 - donorUp) * 4)));

    const start = l1 * a;
    const end = a * md - 7;
    const bend = -0.3 * a; // Coriolis swings the stream ahead of the accretor
    const flow = 0.55 + dm * 3;
    for (const p of parcels) {
      p.u = (p.u + dt * flow * 0.5) % 1;
      const u = p.u, v = 1 - u;
      const x = v * v * start + 2 * v * u * ((start + end) / 2) + u * u * end;
      const y = 2 * v * u * bend;
      const [px, py] = rot(x, y);
      p.el.setAttribute("cx", px.toFixed(2));
      p.el.setAttribute("cy", py.toFixed(2));
      p.el.setAttribute("opacity", (Math.sin(Math.PI * u) * 0.9).toFixed(2));
    }
  }

  function plot() {
    cCons.setAttribute("d", partial(aConservative, dm));
    cBall.setAttribute("d", partial(aBallistic, dm));
    const x = X(dm).toFixed(1);
    cursor.setAttribute("x1", x);
    cursor.setAttribute("x2", x);
    hCons.setAttribute("cx", x);
    hCons.setAttribute("cy", Y(aConservative(dm)).toFixed(1));
    hBall.setAttribute("cx", x);
    hBall.setAttribute("cy", Y(aBallistic(dm)).toFixed(1));
    const end = Math.max(0, (dm / DM_MAX - 0.85) / 0.15);
    labCons.style.opacity = labBall.style.opacity = String(end);
    readout.textContent = `f = ${fmt(dm * 100, 1)}%   ballistic a = ${fmt(aBallistic(dm))} a₀   classical a = ${fmt(aConservative(dm))} a₀`;
  }

  // Scroll is time. On wide screens the hero pins while the donor hands over
  // its mass; on phones it scrubs as the figure itself passes through view.
  const pin = fig.closest(".hero")!.querySelector(".pin")!;
  const wide = window.matchMedia("(min-width: 881px)").matches;
  ScrollTrigger.create({
    trigger: wide ? pin : fig,
    start: wide ? "top 60px" : "top 70%", // 60px: under the sticky header
    end: wide ? "+=120%" : "bottom 30%",
    pin: wide,
    scrub: true,
    onUpdate(self) {
      dm = self.progress * DM_MAX;
      fig.toggleAttribute("data-idle", self.progress < 0.01);
      plot();
      frame(0); // keep the geometry true to Δm even if rAF is throttled
    },
  });
  fig.toggleAttribute("data-idle", dm < 0.0015);
  plot();

  // The orbit itself runs on real time, and only while the figure is visible.
  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(fig);
  let last = performance.now();
  gsap.ticker.add(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (visible && !document.hidden) frame(dt);
  });
}
