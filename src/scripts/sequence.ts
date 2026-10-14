/**
 * Plays each sequence (Sequence.astro) as its stretch of page is scrolled
 * through: the scene drawn for how far through it the page is, the step for
 * that point shown, and the scene behind the page (Cosmos) told to rest while
 * a sequence covers the whole window.
 *
 * A scene is only drawn while its sequence is on screen. A sequence whose
 * scene cannot run (no WebGL2) is taken out of the page.
 */
type Scene = { draw(u: number, t: number): void } | null;
// Each scene's code is fetched only when its sequence comes near, so none of it weighs on the page's first load.
const mounts: Record<string, () => Promise<(c: HTMLCanvasElement) => Scene>> = {
  supernova: () => import("./supernova").then((m) => m.mountSupernova),
  deeptime: () => import("./deeptime").then((m) => m.mountDeepTime),
  horizon: () => import("./horizon").then((m) => m.mountHorizon),
  bigbang: () => import("./bigbang").then((m) => m.mountBigBang),
  merger: () => import("./merger").then((m) => m.mountMerger),
  cosmicweb: () => import("./cosmicweb").then((m) => m.mountCosmicWeb),
};
const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const idle = (fn: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 60));
const covering = new Set<Element>();

for (const seq of document.querySelectorAll<HTMLElement>("[data-seq]")) {
  if (calm || !document.documentElement.hasAttribute("data-motion")) break;
  const canvas = seq.querySelector<HTMLCanvasElement>("[data-seq-canvas]")!;
  const steps = [...seq.querySelectorAll<HTMLElement>("[data-step]")];
  const at = steps.map((s) => +s.dataset.at!);
  const scale = seq.querySelector<HTMLElement>("[data-seq-scale]");
  const bar = seq.querySelector<HTMLElement>("[data-seq-bar]");
  let scene: Scene = null;
  let raf = 0, shown = -1, on = false;
  const t0 = performance.now();

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const r = seq.getBoundingClientRect(), vh = window.innerHeight;
    const u = Math.max(0, Math.min(1, -r.top / Math.max(1, r.height - vh)));
    scene!.draw(u, (now - t0) / 1000);
    let i = 0;
    for (let k = 0; k < at.length; k++) if (u >= at[k]) i = k;
    if (i !== shown) {
      steps[shown]?.removeAttribute("data-on");
      steps[i].setAttribute("data-on", "");
      if (scale) scale.textContent = steps[i].dataset.scale ?? "";
      shown = i;
    }
    bar?.style.setProperty("--p", u.toFixed(4));
    // While it fills the window, nothing behind it needs drawing.
    const full = r.top <= 0 && r.bottom >= vh;
    if (full !== covering.has(seq)) {
      if (full) covering.add(seq);
      else covering.delete(seq);
      document.dispatchEvent(new CustomEvent("cosmos:rest", { detail: covering.size > 0 }));
    }
  };

  // Two screens ahead, while the page is idle: fetch the scene, set it up, and draw it once into
  // the canvas, so the work of building its shaders is done before it is on screen, not as it arrives.
  let ready: Promise<Scene> | null = null;
  const prepare = () =>
    (ready ??= new Promise<Scene>((done) =>
      idle(async () => {
        const make = await mounts[seq.dataset.seq!]?.().catch(() => null);
        const made = make?.(canvas) ?? null;
        if (!made) seq.setAttribute("data-off", "");
        else made.draw(0, 0);
        done(made);
      }),
    ));
  new IntersectionObserver(([e]) => e.isIntersecting && prepare(), { rootMargin: "200% 0px" }).observe(seq);

  new IntersectionObserver(
    async ([e]) => {
      if (e.isIntersecting && !on) {
        on = true;
        scene = await prepare();
        if (!scene || !on) return;
        raf = requestAnimationFrame(frame);
      } else if (!e.isIntersecting && on) {
        on = false;
        cancelAnimationFrame(raf);
        if (covering.delete(seq)) document.dispatchEvent(new CustomEvent("cosmos:rest", { detail: covering.size > 0 }));
      }
    },
    { rootMargin: "50% 0px" },
  ).observe(seq);
}
