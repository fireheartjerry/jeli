import { ScrollTrigger, reducedMotion } from "./motion";
import { mountCosmos, L_SUN, BELT_MASS, type CosmosState } from "./cosmos";

const hero = document.querySelector<HTMLElement>("[data-hero]");
if (hero) init(hero);

/** 2.4e21 as "2.4 × 10²¹". */
function sci(v: number, digits = 2) {
  if (v <= 0) return "0";
  const e = Math.floor(Math.log10(v));
  const sup = String(e).replace(/[-0-9]/g, (c) => "⁻⁰¹²³⁴⁵⁶⁷⁸⁹"["-0123456789".indexOf(c)]);
  return `${(v / 10 ** e).toFixed(digits)} × 10${sup}`;
}

function init(hero: HTMLElement) {
  const canvas = hero.querySelector<HTMLCanvasElement>("[data-sky]")!;
  const ledger = hero.querySelector<HTMLElement>(".ledger")!;
  const out = Object.fromEntries(
    [...hero.querySelectorAll<HTMLElement>("[data-v]")].map((el) => [el.dataset.v!, el]),
  );
  const tags = Object.fromEntries(
    [...hero.querySelectorAll<HTMLElement>("[data-tag]")].map((el) => [el.dataset.tag!, el]),
  );
  // ?poster=<0..1> freezes the scene at that point of the build, with nothing
  // drawn over it, so tools/cover.mjs can photograph it.
  const poster = new URLSearchParams(location.search).get("poster");
  if (poster !== null) document.documentElement.dataset.poster = "";
  const still = reducedMotion() || poster !== null;
  const wide = () => window.matchMedia("(min-width: 881px)").matches;
  const bar = 60;
  const fmt = new Intl.NumberFormat("en-US");

  // Text only changes when its value does, so a steady frame writes nothing.
  const shown: Record<string, string> = {};
  const put = (key: string, text: string) => {
    if (shown[key] === text || !out[key]) return;
    shown[key] = text;
    out[key].textContent = text;
  };

  function frame(s: CosmosState) {
    put("n", fmt.format(s.collectors));
    put("total", fmt.format(s.total));
    put("pct", (s.built * 100).toFixed(1));
    put("watts", `${sci(s.built * L_SUN)} W`);
    put("mass", `${sci(s.built * BELT_MASS, 1)} kg`);
    put("tugs", String(s.tugs));
    const box = { w: canvas.clientWidth, h: canvas.clientHeight };
    for (const [name, el] of Object.entries(tags)) {
      const at = s.labels[name];
      if (!at) continue;
      // Keep names out of the text columns, off the edges, and out of the Sun's glare.
      const sun = s.labels.sun;
      const glare = name !== "swarm" && name !== "beam" && Math.hypot(at.x - sun.x, at.y - sun.y) < s.sunPx * 3.2;
      const clear = at.on && !glare && at.x > 24 && at.x < box.w - 130 && at.y > bar + 8 && at.y < box.h - 20 && free(at.x, at.y);
      el.toggleAttribute("data-on", !!clear);
      if (clear) el.style.transform = `translate(${at.x.toFixed(1)}px, ${(at.y - 6).toFixed(1)}px)`;
    }
  }

  // Rectangles the text occupies, measured against the cover, refreshed on resize.
  let blocks: DOMRect[] = [];
  const free = (x: number, y: number) => {
    const top = hero.getBoundingClientRect().top;
    return !blocks.some((r) => x > r.left - 120 && x < r.right + 16 && y + top > r.top - 14 && y + top < r.bottom + 14);
  };
  const survey = () => {
    blocks = [".legend", ".id", ".ledger"].map((sel) => hero.querySelector(sel)!.getBoundingClientRect());
  };

  const cosmos = mountCosmos(canvas, {
    seed: hero.dataset.seed ?? "yuzeli",
    light: !wide() || (navigator.hardwareConcurrency ?? 8) <= 4,
    still,
    onFrame: frame,
    place(w, h) {
      survey();
      if (wide()) {
        // The Sun sits right of centre, above the ledger, clear of the name.
        const foot = ledger.getBoundingClientRect().top - hero.getBoundingClientRect().top;
        return { x: w > 1500 ? 0.66 : 0.68, y: (bar + (foot - bar) * 0.4) / h };
      }
      const band = Math.min(w * 0.8, window.innerHeight * 0.46);
      hero.style.setProperty("--sky-h", `${Math.round(band)}px`);
      return { x: 0.5, y: (bar + band * 0.54) / Math.max(1, h) };
    },
  });
  if (!cosmos) {
    // No WebGL: the still image stands in.
    const img = new Image();
    img.className = canvas.className + " still";
    img.alt = "";
    img.src = "/cover.webp";
    canvas.replaceWith(img);
    return;
  }
  canvas.toggleAttribute("data-on", true);
  window.addEventListener("resize", () => cosmos.refit(), { passive: true });
  document.fonts?.ready.then(() => cosmos.refit());

  if (still) {
    cosmos.setScroll(poster !== null ? +poster : 0.55);
    if (poster !== null) requestAnimationFrame(() => (document.documentElement.dataset.posterReady = ""));
    return;
  }

  // From here on the scene runs and answers to scroll and drag, and the cover's small print may say so.
  hero.toggleAttribute("data-live", true);

  // Scroll is the build. The cover holds while the swarm closes: a full
  // screen of scrolling on wide screens, a shorter hold on narrow ones, where
  // the scene is only the top band and has to finish while it is in view.
  ScrollTrigger.create({
    trigger: hero,
    start: "top top",
    end: wide() ? "+=110%" : "+=85%",
    pin: true,
    anticipatePin: 1,
    scrub: true,
    onUpdate(self) {
      cosmos.setScroll(self.progress);
      hero.toggleAttribute("data-idle", self.progress < 0.01);
      survey();
    },
  });
  hero.toggleAttribute("data-idle", true);

  // The system only runs while some of the cover is on screen.
  let seen = true;
  const sync = () => cosmos.run(seen && !document.hidden);
  new IntersectionObserver(([e]) => {
    seen = e.isIntersecting;
    sync();
  }).observe(hero);
  document.addEventListener("visibilitychange", sync);
  sync();
}
