import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CustomEase } from "gsap/CustomEase";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, CustomEase, SplitText);

export { gsap, ScrollTrigger, SplitText };

export const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The site moves on two curves, the same two the stylesheet names --ease-out
 * and --ease-io, and nothing overshoots.
 *
 *   "arrive"  something coming to rest: quick off the mark, a long settle.
 *             Type rising into place, a plate coming up, a row sliding in.
 *   "swap"    one state for another, at rest at both ends: a label rolling
 *             over, the camera of a figure moving between two views.
 *
 * Anything tied to the scroll is linear (the hand is the easing), and data is
 * always drawn linear: a line that eases looks like a different line.
 */
CustomEase.create("arrive", "0.22, 1, 0.36, 1");
CustomEase.create("swap", "0.65, 0, 0.35, 1");

/** How long things take, seconds: a press, a change of state, a block of type arriving, and the gap between neighbours. */
export const T = { press: 0.18, state: 0.32, arrive: 0.9, step: 0.03 } as const;

/**
 * How far a scrubbed figure trails the scroll, seconds. When the page itself
 * glides (scroll.ts turns that on for wheels), most of the smoothing has
 * already happened, and a figure need only trail it a little.
 */
export const scrub = { lag: 0.6 };
export const trail = (seconds: number) => +(seconds * (scrub.lag / 0.6)).toFixed(3);

type Drawable = SVGGeometryElement;

/**
 * Hide a stroke by pushing its dash offset to its full length. Figures ship
 * fully drawn in the HTML, so a reader without JS (or with reduced motion)
 * sees the finished figure; the animated version undraws first.
 */
export function undraw(els: Drawable | Drawable[]) {
  for (const el of Array.isArray(els) ? els : [els]) {
    const len = el.getTotalLength();
    el.style.strokeDasharray = `${len} ${len}`;
    el.style.strokeDashoffset = `${len}`;
    // Round caps paint a dot at offset = length; keep it invisible until drawn.
    el.style.opacity = "0";
  }
}

/** Tween vars that draw an undrawn stroke on. */
export const draw = (extra: gsap.TweenVars = {}): gsap.TweenVars => ({
  strokeDashoffset: 0,
  opacity: 1,
  ease: "none",
  ...extra,
});

/**
 * A scroll-scrubbed timeline bound to a figure. Scrubbing (rather than
 * playing once) means the figure runs backwards when you scroll back up.
 */
export function scrubbed(
  trigger: Element,
  vars: ScrollTrigger.Vars = {},
): gsap.core.Timeline {
  return gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: {
      trigger,
      start: "top 82%",
      end: "bottom 38%",
      scrub: scrub.lag,
      ...vars,
    },
  });
}

export const qa = <T extends Element = SVGElement>(root: ParentNode, sel: string) =>
  Array.from(root.querySelectorAll<T>(sel));
export const q = <T extends Element = SVGElement>(root: ParentNode, sel: string) => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`figure element missing: ${sel}`);
  return el;
};

/**
 * Run `fn(dt)` on GSAP's ticker only while `root` is on screen and the tab is
 * visible. Returns a stop function. Use for every ambient loop.
 */
export function whileVisible(root: Element, fn: (dt: number, t: number) => void) {
  let visible = false;
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { rootMargin: "80px" });
  io.observe(root);
  let last = performance.now();
  const tick = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (visible && !document.hidden) fn(dt, now / 1000);
  };
  gsap.ticker.add(tick);
  return () => {
    gsap.ticker.remove(tick);
    io.disconnect();
  };
}

/**
 * Packets travelling along a path: `n` small circles created inside `layer`,
 * spaced evenly, moving at `speed` path-lengths per second. `active()` gates
 * whether they show (e.g. only once the timeline has reached that stage).
 */
export function packets(
  root: Element,
  layer: SVGGElement,
  path: SVGPathElement,
  opts: { n?: number; speed?: number; r?: number; cls?: string; active?: () => boolean } = {},
) {
  const { n = 3, speed = 0.45, r = 2.2, cls = "dot-accent", active = () => true } = opts;
  // The path is sampled once, and again only if its shape changes. Asking the
  // browser for a point on every frame makes it work the path out each time.
  const N = 48;
  const xs = new Float32Array(N + 1), ys = new Float32Array(N + 1);
  let shape: string | null = null;
  const sample = () => {
    const d = path.getAttribute("d") ?? "";
    if (d === shape) return;
    shape = d;
    const len = path.getTotalLength();
    for (let i = 0; i <= N; i++) {
      const p = path.getPointAtLength((i / N) * len);
      xs[i] = p.x;
      ys[i] = p.y;
    }
  };
  const dots = Array.from({ length: n }, (_, i) => {
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("r", String(r));
    c.setAttribute("class", cls);
    c.style.opacity = "0";
    layer.append(c);
    return { c, u: i / n, shown: "0" };
  });
  return whileVisible(root, (dt) => {
    const on = active();
    sample();
    for (const d of dots) {
      d.u = (d.u + dt * speed) % 1;
      // Fade in and out at the ends so packets never pop.
      const edge = Math.min(1, d.u * 8, (1 - d.u) * 8);
      const opacity = on ? edge.toFixed(2) : "0";
      if (opacity !== d.shown) d.c.style.opacity = d.shown = opacity;
      if (!on) continue;
      const f = d.u * N, i = Math.min(N - 1, Math.floor(f)), t = f - i;
      d.c.setAttribute("cx", (xs[i] + (xs[i + 1] - xs[i]) * t).toFixed(1));
      d.c.setAttribute("cy", (ys[i] + (ys[i + 1] - ys[i]) * t).toFixed(1));
    }
  });
}

/** Mark the plate "live" (its status light pulses) while a timeline plays. */
export function setLive(root: Element, on: boolean) {
  root.toggleAttribute("data-running", on);
}

/** Linear map with clamping, handy for scrubbed sub-phases: phase(p, 0.2, 0.5). */
export const phase = (p: number, a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)));
