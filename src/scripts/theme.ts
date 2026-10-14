// Day and night. The site opens at night (it opens in space); an inline script
// in Base.astro applies a stored choice before first paint, and this module
// handles changing it afterwards.
//
// A change of theme crosses the window the way a terminator crosses a planet:
// the edge of sunlight sweeps over from the toggle's corner with twilight
// along it (styles/transitions.css has the other half of this).
import "./transit";

export type Theme = "light" | "dark";

const root = document.documentElement;

/** The theme the page is drawn in right now. */
const shown = (): Theme => (root.dataset.theme === "dark" ? "dark" : "light");
/** The theme that has been asked for, while the sweep that brings it is still to come or under way. */
let wanted: Theme | null = null;
let busy = false;

/** The reader's choice. During a sweep this is already where the sweep is going. */
export const getTheme = (): Theme => wanted ?? shown();

function store(theme: Theme) {
  try {
    localStorage.setItem("theme", theme);
  } catch {
    // Private mode: the choice lasts for this page only.
  }
}

/** Canvas figures cache their colours; this tells them to read the tokens again. */
const announce = (theme: Theme) => document.dispatchEvent(new CustomEvent("themechange", { detail: theme }));

const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const canSweep = () => typeof document.startViewTransition === "function" && !calm();

export function setTheme(theme: Theme) {
  if (theme === getTheme()) return;
  if (canSweep()) {
    // A press during a sweep is kept, not dropped: the next terminator follows the first across.
    wanted = theme;
    if (!busy) void run();
    return;
  }
  // No view transitions here. Still pages cut; the rest ease their big surfaces across.
  const ease = !calm();
  if (ease) root.toggleAttribute("data-theme-switching", true);
  root.dataset.theme = theme;
  store(theme);
  announce(theme);
  if (ease) window.setTimeout(() => root.removeAttribute("data-theme-switching"), 500);
}

export const toggleTheme = () => setTheme(getTheme() === "dark" ? "light" : "dark");

// ---------- the sweep ----------

async function run() {
  busy = true;
  await clear();
  while (wanted && wanted !== shown()) await sweep(wanted);
  wanted = null;
  busy = false;
}

let moved = -1e9;
addEventListener("scroll", () => (moved = performance.now()), { passive: true });

/**
 * The old view is a photograph and the new one is live, so nothing may move
 * between them. The palette, if its command asked for this, closes first; a
 * page that is still gliding comes to rest.
 */
async function clear() {
  const pal = document.querySelector<HTMLElement>("[data-palette]:not([hidden])");
  if (pal) {
    await new Promise<void>((done) => {
      const mo = new MutationObserver(() => pal.hidden && go());
      const timer = window.setTimeout(go, 400); // it stayed open: sweep under it
      function go() {
        mo.disconnect();
        window.clearTimeout(timer);
        // Asking for its animations starts the ones its closing has just set off.
        Promise.allSettled(pal!.getAnimations({ subtree: true }).map((a) => a.finished)).then(() => done());
      }
      mo.observe(pal, { attributes: true, attributeFilter: ["hidden"] });
    });
  }
  const t0 = performance.now();
  while (performance.now() - moved < 90 && performance.now() - t0 < 320) await new Promise((r) => requestAnimationFrame(r));
}

/**
 * While the edge is crossing, the page under it cannot be hit: every press
 * lands on the root. One that falls on the toggle is passed on to it, so a
 * second press is kept however it was made (the keyboard's already arrives).
 */
function relay(e: MouseEvent) {
  if (e.target !== root) return;
  const toggle = document.querySelector<HTMLElement>("[data-theme-toggle]");
  const r = toggle?.getBoundingClientRect();
  if (r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) toggle!.click();
}

async function sweep(theme: Theme) {
  const toggle = document.querySelector<HTMLElement>("[data-theme-toggle]")?.getBoundingClientRect();
  const w = window.innerWidth, h = window.innerHeight;
  // With no toggle on the page, the sweep still comes from where one would be.
  const from = toggle && toggle.width ? { x: toggle.left + toggle.width / 2, y: toggle.top + toggle.height / 2 } : { x: w - 28, y: 30 };
  const frames = terminator(from, w, h, theme === "light" ? "dawn" : "dusk");

  // Set before the old view is photographed: for this transition the page is one sheet (transitions.css).
  root.dataset.themeSweep = theme === "light" ? "dawn" : "dusk";
  const vt = document.startViewTransition(() => {
    // The new view must be whole the moment it is uncovered, so nothing in it
    // may still be easing over from the old colours: transitions are off while
    // the tokens change, and back on once the styles have settled.
    root.toggleAttribute("data-theme-cut", true);
    root.dataset.theme = theme;
    store(theme);
    announce(theme);
    void root.offsetWidth;
    root.removeAttribute("data-theme-cut");
  });
  vt.ready
    .then(() => {
      root.animate(frames, { duration: SWEEP * 1000, easing: SWAP, fill: "both", pseudoElement: "::view-transition-new(root)" });
    })
    // Skipped (a hidden tab, say): the theme has changed all the same.
    .catch(() => {});
  document.addEventListener("click", relay);
  await vt.finished.catch(() => {});
  document.removeEventListener("click", relay);
  delete root.dataset.themeSweep;
}

// ---------- the terminator ----------

/** Seconds for the edge to cross the window, and the curve the planet turns on (--ease-io, "swap"). */
const SWEEP = 0.9;
const SWAP = "cubic-bezier(0.65, 0, 0.35, 1)";
/** Civil twilight: the sky is still lit while the Sun is up to 6° under the horizon. */
const TWILIGHT = (6 * Math.PI) / 180;
/** The Sun's height over the chart's centre when the edge first shows, and when it reaches the far corner. Their difference is how much of the planet the window spans. */
const RISE = (1 * Math.PI) / 180;
const NOON = (80 * Math.PI) / 180;
const STEPS = 48;

/**
 * The window as a chart of a turning planet.
 *
 * The chart is stereographic, centred on a point C on the ground just beyond
 * the toggle's corner, with the Sun rising in that direction. That projection
 * sends every circle on a sphere to a circle on the page, so the terminator (a
 * great circle) is drawn exactly: with the Sun θ above C's horizon it is the
 * circle of radius K / sin θ whose centre lies K / tan θ sunward of C, and it
 * crosses the axis K·tan(θ/2) on the far side. Daylight is the inside. The
 * edge enters almost straight and curls as it goes, as it does on a globe.
 *
 * Twilight is the band where the Sun is under the horizon by less than 6°. Its
 * far edge is a circle too, though not a concentric one; it is drawn as if it
 * were, at the width it has on the axis, K·(tan((θ + 6°)/2) − tan(θ/2)).
 * At dawn that band runs ahead of the edge of day. At dusk the planet has
 * turned half round, the same circle is the edge of night, and twilight trails
 * the sunset.
 *
 * Returned as keyframes of the four lengths the mask is drawn from: the
 * circle's centre, the radius inside which the new sky is whole, and the width
 * of twilight outside it. They are evenly spaced in θ, so the easing applied
 * to them is the planet's turning.
 */
function terminator(from: { x: number; y: number }, w: number, h: number, kind: "dawn" | "dusk"): Keyframe[] {
  const corners = [[0, 0], [w, 0], [0, h], [w, h]];
  // The axis runs from the corner farthest from the toggle, through the toggle, toward the Sun.
  let far = corners[0], reach = 0;
  for (const c of corners) {
    const d = Math.hypot(c[0] - from.x, c[1] - from.y);
    if (d > reach) (reach = d), (far = c);
  }
  const ux = (from.x - far[0]) / reach, uy = (from.y - far[1]) / reach;
  const along = corners.map((c) => (c[0] - from.x) * ux + (c[1] - from.y) * uy);
  const lead = Math.max(...along), span = lead - Math.min(...along);
  // C stands off the window: far enough that the whole edge, twilight included,
  // has passed over C before any of it is seen. At C itself the terminator is a
  // straight line, a circle of no finite radius, and that is never drawn.
  const ahead = kind === "dawn" ? TWILIGHT : 0;
  const K = span / (Math.tan(NOON / 2) - Math.tan((RISE + ahead) / 2));
  const off = lead + K * Math.tan((RISE + ahead) / 2);
  const cx = from.x + ux * off, cy = from.y + uy * off;

  const at = (th: number) => {
    const reachIn = K / Math.sin(th), back = K / Math.tan(th);
    const band = kind === "dawn" ? K * (Math.tan((th + TWILIGHT) / 2) - Math.tan(th / 2)) : K * (Math.tan(th / 2) - Math.tan((th - TWILIGHT) / 2));
    return { x: cx + ux * back, y: cy + uy * back, r: kind === "dawn" ? reachIn : reachIn - band, band };
  };
  // How far the circle's centre is from the nearest and the farthest point of the window.
  const near = (x: number, y: number) => Math.hypot(x - Math.min(w, Math.max(0, x)), y - Math.min(h, Math.max(0, y)));
  const farthest = (x: number, y: number) => Math.max(...corners.map((c) => Math.hypot(c[0] - x, c[1] - y)));
  const solve = (test: (th: number) => boolean) => {
    // `test` is false early and true late; find where it turns.
    let lo = RISE, hi = 2.6;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (test(mid)) hi = mid;
      else lo = mid;
    }
    return hi;
  };
  // From the last moment the window is all old sky to the first it is all new.
  const t0 = solve((th) => {
    const c = at(th);
    return c.r + c.band > near(c.x, c.y);
  });
  const t1 = solve((th) => {
    const c = at(th);
    return c.r > farthest(c.x, c.y);
  });

  const px = (v: number) => `${v.toFixed(2)}px`;
  return Array.from({ length: STEPS + 1 }, (_, i) => {
    const c = at(t0 + ((t1 - t0) * i) / STEPS);
    return { "--term-x": px(c.x), "--term-y": px(c.y), "--term-r": px(c.r), "--term-w": px(c.band) };
  });
}
