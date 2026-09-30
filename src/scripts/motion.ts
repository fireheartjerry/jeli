import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };

export const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
      scrub: 0.6,
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
  const len = path.getTotalLength();
  const dots = Array.from({ length: n }, (_, i) => {
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("r", String(r));
    c.setAttribute("class", cls);
    c.style.opacity = "0";
    layer.append(c);
    return { c, u: i / n };
  });
  return whileVisible(root, (dt) => {
    const on = active();
    for (const d of dots) {
      d.u = (d.u + dt * speed) % 1;
      const p = path.getPointAtLength(d.u * len);
      d.c.setAttribute("cx", p.x.toFixed(1));
      d.c.setAttribute("cy", p.y.toFixed(1));
      // Fade in and out at the ends so packets never pop.
      const edge = Math.min(1, d.u * 8, (1 - d.u) * 8);
      d.c.style.opacity = on ? edge.toFixed(2) : "0";
    }
  });
}

/** Mark the plate "live" (its status light pulses) while a timeline plays. */
export function setLive(root: Element, on: boolean) {
  root.toggleAttribute("data-running", on);
}

/** Linear map with clamping, handy for scrubbed sub-phases: phase(p, 0.2, 0.5). */
export const phase = (p: number, a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)));
