/**
 * How the page scrolls.
 *
 * A wheel moves a page in steps, and everything here that is tied to the
 * scroll (the camera, every figure) would step with it. So a wheel's scroll is
 * eased (Lenis, which still scrolls the real document: sticky columns, the
 * keyboard, find-in-page and the scrollbar all work as they did). Touch is
 * left alone; a finger is already smooth.
 *
 * Going to a section is one of two moves. A near one is a glide. A far one
 * would drag the reader through half the site, so it is a cut instead: two
 * blades close over the page, the page is somewhere else, and they open.
 */
import Lenis from "lenis";
import { gsap, ScrollTrigger, reducedMotion, scrub, T } from "./motion";

const calm = reducedMotion();
const fine = window.matchMedia("(pointer: fine)").matches;

export const lenis = !calm && fine ? new Lenis({ autoRaf: false, lerp: 0.115, wheelMultiplier: 1, smoothWheel: true, syncTouch: false }) : null;

/** How fast the page is moving, px a second, eased: for anything that should know the reader's pace. */
export const speed = { now: 0 };

if (lenis) {
  document.documentElement.classList.add("lenis");
  lenis.on("scroll", ScrollTrigger.update);
  // First on the tick, so everything after it this frame sees where the page now is.
  gsap.ticker.add((t) => lenis.raf(t * 1000), false, true);
  // The page's own glide is most of the smoothing a figure needs.
  scrub.lag = 0.28;
}
{
  // Read from the scroll's own events, so no frame asks the page where it is.
  let last = window.scrollY, at = last;
  window.addEventListener("scroll", () => (at = window.scrollY), { passive: true });
  gsap.ticker.add((_t, dt) => {
    const v = ((at - last) / Math.max(1, dt)) * 1000;
    last = at;
    // Quick to pick up, slow to let go: a flick is felt, and dies away rather than stopping dead.
    speed.now += (v - speed.now) * (Math.abs(v) > Math.abs(speed.now) ? 0.5 : 0.12);
    if (Math.abs(speed.now) < 0.5) speed.now = 0;
  });
}

// Anything that opens over the page (the palette) holds the scroll still while it is open.
const palette = document.querySelector<HTMLElement>("[data-palette]");
if (lenis && palette) {
  new MutationObserver(() => (palette.hidden ? lenis.start() : lenis.stop())).observe(palette, { attributes: true, attributeFilter: ["hidden"] });
}

// ---------- going somewhere ----------

const bar = () => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 72;
/** At rest at both ends: the "swap" curve, as a function. */
const swap = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Where an element's top should rest, in page coordinates. */
function restAt(el: Element) {
  const max = ScrollTrigger.maxScroll(window);
  return Math.max(0, Math.min(max, el.getBoundingClientRect().top + window.scrollY - bar()));
}

function jump(y: number) {
  if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
  else window.scrollTo({ top: y, behavior: "instant" });
  ScrollTrigger.update();
  // The camera goes with the cut rather than flying after it.
  document.dispatchEvent(new CustomEvent("cosmos:snap"));
}

// The shutter: two blades, one from the head of the window and one from its
// foot, that meet in the middle. Made once, when first needed.
let shutter: HTMLElement | null = null;
let cutting: { to: number } | null = null;
function blades() {
  if (!shutter) {
    shutter = Object.assign(document.createElement("div"), { className: "shutter" });
    shutter.setAttribute("aria-hidden", "true");
    shutter.append(document.createElement("i"), document.createElement("i"));
  }
  if (!shutter.isConnected) document.body.append(shutter);
  return [...shutter.children] as HTMLElement[];
}

/**
 * Bring `target` (an element, or a page offset) to the top of the window.
 * Resolves when the page is there.
 */
export function goTo(target: Element | number): Promise<void> {
  const y = typeof target === "number" ? target : restAt(target);
  const far = Math.abs(y - window.scrollY);
  // A cut already under way simply lands somewhere else.
  if (cutting) {
    cutting.to = y;
    return Promise.resolve();
  }
  if (far < 2) return Promise.resolve();
  if (calm) {
    window.scrollTo({ top: y, behavior: "instant" });
    return Promise.resolve();
  }
  if (far < window.innerHeight * 2.4) {
    // Near: a glide, longer for a longer way, at rest at both ends.
    const seconds = Math.min(1.25, 0.55 + far / 2600);
    return new Promise((done) => {
      if (lenis) lenis.scrollTo(y, { duration: seconds, easing: swap, force: true, onComplete: () => done() });
      else {
        // A finger may take the page back at any moment: this one is the browser's own, which gives way to it.
        window.scrollTo({ top: y, behavior: "smooth" });
        const over = () => (window.removeEventListener("scrollend", over), window.clearTimeout(timer), done());
        const timer = window.setTimeout(over, 1500);
        window.addEventListener("scrollend", over, { once: true });
      }
    });
  }
  // Far: a cut.
  const state = (cutting = { to: y });
  const [head, foot] = blades();
  return new Promise((done) => {
    gsap
      .timeline({
        onComplete() {
          cutting = null;
          shutter!.remove();
          done();
        },
      })
      .fromTo([head, foot], { scaleY: 0 }, { scaleY: 1, duration: T.press, ease: "swap" })
      .add(() => jump(state.to))
      // A moment closed, for the new place to draw itself before it is shown.
      .to([head, foot], { scaleY: 0, duration: T.state, ease: "swap" }, "+=0.06");
  });
}

// A link to a place on this page goes there by the moves above. The address
// follows, as it would for the link itself. Modified clicks are left alone.
document.addEventListener("click", (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element).closest?.<HTMLAnchorElement>("a[href]");
  if (!a || a.target || a.hasAttribute("download")) return;
  const to = new URL(a.href);
  if (to.origin !== location.origin || to.pathname !== location.pathname || to.search !== location.search || !to.hash) return;
  const id = decodeURIComponent(to.hash.slice(1));
  const el = id === "top" ? null : document.getElementById(id);
  if (!el && id !== "top") return;
  e.preventDefault();
  goTo(el ?? 0);
  // Following a link also moves where the keyboard carries on from. The
  // section borrows a tabindex to take the focus, and gives it back on leaving.
  if (el instanceof HTMLElement) {
    const lent = !el.hasAttribute("tabindex");
    if (lent) {
      el.tabIndex = -1;
      el.style.outline = "none"; // a whole section is not something to ring
      el.addEventListener(
        "blur",
        () => {
          el.removeAttribute("tabindex");
          el.style.outline = "";
        },
        { once: true },
      );
    }
    el.focus({ preventScroll: true });
  }
  if (to.hash !== location.hash) history.pushState(history.state, "", to.hash);
});

// The palette asks for a place by event, so it does not need to know how the page gets there.
document.addEventListener("page:go", (e) => {
  const { target } = (e as CustomEvent<{ target: Element | number }>).detail;
  e.preventDefault();
  goTo(target);
});

// Back and Forward put the page somewhere else at once; the camera goes with it, as it does with a cut.
window.addEventListener("popstate", () => requestAnimationFrame(() => document.dispatchEvent(new CustomEvent("cosmos:snap"))));
