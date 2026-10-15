/**
 * The camera's one take, driven by the page.
 *
 * The scene (cosmos.ts) is a canvas fixed behind everything. This reads the
 * scroll and tells the camera where it is on the voyage: through the cover,
 * leaving, cruising while the page is read, and home again for the footer.
 * It also writes the cover's telemetry and the bar's odometer, pins names to
 * bodies, swings the camera to a new heading as each section begins, and
 * fades the veils that keep type readable over the scene.
 */
import { gsap, ScrollTrigger, reducedMotion } from "./motion";
import { mountCosmos, L_SUN, BELT_MASS, type CosmosState } from "./cosmos";

const layer = document.querySelector<HTMLElement>("[data-cosmos]");
if (layer) {
  // The scene is the heaviest thing the page starts, so it starts after the
  // page's own script has taken up everything that arrives in motion. A page
  // reached from another page of the site is, for its first half second,
  // carrying its title across (scripts/transit.ts); the scene waits for that
  // too, or the title would be held up half-way.
  requestAnimationFrame(() => (document.documentElement.hasAttribute("data-arrived") ? window.setTimeout(() => init(layer), 620) : init(layer)));
}

/** 2.4e21 as "2.4 × 10²¹". */
function sci(v: number, digits = 2) {
  if (v <= 0) return "0";
  const e = Math.floor(Math.log10(v));
  const sup = String(e).replace(/[-0-9]/g, (c) => "⁻⁰¹²³⁴⁵⁶⁷⁸⁹"["-0123456789".indexOf(c)]);
  return `${(v / 10 ** e).toFixed(digits)} × 10${sup}`;
}

function init(layer: HTMLElement) {
  const root = document.documentElement;
  const canvas = layer.querySelector<HTMLCanvasElement>("[data-cosmos-canvas]")!;
  const names = layer.querySelector<HTMLElement>("[data-cosmos-tags]")!;
  const hero = document.querySelector<HTMLElement>("[data-hero]");
  const hold = hero?.closest<HTMLElement>("[data-hold]") ?? null;
  const foot = document.querySelector<HTMLElement>("[data-foot]");
  const name = hero?.querySelector<HTMLElement>(".id") ?? null;
  const odo = document.querySelector<HTMLElement>("[data-odo]");
  // A value may be shown in more than one place (the legend, and the line under the cue on a narrow screen).
  const out: Record<string, HTMLElement[]> = {};
  for (const el of document.querySelectorAll<HTMLElement>("[data-hero] [data-v]")) (out[el.dataset.v!] ??= []).push(el);
  const tags = Object.fromEntries([...names.querySelectorAll<HTMLElement>("[data-tag]")].map((el) => [el.dataset.tag!, el]));
  const veils = Object.fromEntries([...layer.querySelectorAll<HTMLElement>("[data-veil]")].map((el) => [el.dataset.veil!, el]));
  const chapters = [...document.querySelectorAll<HTMLElement>("[data-section] h2")];

  /** No scene: the cover is one screen with its still image, and nothing is held. */
  const flat = () => {
    root.dataset.flat = "";
    if (hero && !hero.querySelector(".sky.still")) hero.prepend(Object.assign(new Image(), { className: "sky still", alt: "", src: "/cover.webp" }));
  };

  // ?poster=<0..1> freezes the scene at that point of the build, with nothing
  // drawn over it, so tools/cover.mjs can photograph it.
  const poster = new URLSearchParams(location.search).get("poster");
  if (poster !== null) root.dataset.poster = "";
  const still = reducedMotion() || poster !== null;
  // A still frame belongs to the cover and nowhere else. A page without one keeps its plain ground.
  if (still && !hero) return;
  if (still) hero!.prepend(canvas, names);

  const wide = () => window.matchMedia("(min-width: 881px)").matches;
  const bar = 60;
  const fmt = new Intl.NumberFormat("en-US");

  // Text only changes when its value does, so a steady frame writes nothing.
  const shown: Record<string, string> = {};
  const put = (key: string, text: string) => {
    if (shown[key] === text || !out[key]) return;
    shown[key] = text;
    for (const el of out[key]) el.textContent = text;
  };
  const fade = (name: string, k: number) => {
    const v = k.toFixed(3);
    if (shown[`veil:${name}`] === v || !veils[name]) return;
    shown[`veil:${name}`] = v;
    veils[name].style.setProperty("--k", v);
  };

  // Rectangles the type takes up in the window while the camera is at the
  // sphere: the cover's, or, home again, the footer's. A name is kept off them.
  let blocks: DOMRect[] = [];
  const free = (x: number, y: number, wide_: number) => !blocks.some((r) => x + wide_ > r.left - 16 && x < r.right + 16 && y > r.top - 14 && y < r.bottom + 14);
  const survey = () => {
    const from = home ? foot : hero;
    blocks = from ? [...from.querySelectorAll(home ? ".cap, .big, .meta" : ".legend, .id")].map((el) => el.getBoundingClientRect()) : [];
  };
  // How wide each name is, measured once the text face is in.
  const widths: Record<string, number> = {};
  const size = () => Object.entries(tags).forEach(([name, el]) => (widths[name] = el.offsetWidth));

  // Where the camera is on the take, from the scroll. Measured on refresh, never on a scroll frame.
  let holdTop = 0, holdLen = 1, coverEnd = 0, max = 1, leave = 1, land = 1, home = false;
  let heads: number[] = []; // where each section's title is, down the page
  // The stretches of open sky between parts of the page (Interlude.astro), and how open the sky is now: 1 with one centred.
  const interludes = [...document.querySelectorAll<HTMLElement>("[data-interlude]")].map((el) => ({ el, kind: el.dataset.interlude!, top: 0, h: 1, fired: false }));
  let open = 0;
  // Where the page puts the camera on its way out: at the cover's end, then at
  // each passage's place as it is centred. Past the last, it holds.
  let stops: { y: number; r: number }[] = [];
  let roaming = false; // the page is under way between the cover and the footer
  let under = 0; // how far the page has come up over the sky after the cover, 0 to 1
  let box = { w: 1, h: 1 }; // the canvas, CSS px
  let away = 0; // as the scene last drew it
  let narrow = !wide();

  // The frame-by-frame tools (tools/qa) read the camera's state from here; nothing else does.
  const qa = (window as unknown as { __qa?: { note(name: string, value: unknown): void } }).__qa;

  function frame(s: CosmosState) {
    away = s.away;
    qa?.note("cosmos", { built: s.built, range: s.range, away: s.away, sphere: s.spherePx, sunX: s.labels.sun.x, sunY: s.labels.sun.y, beam: s.beam });
    put("n", fmt.format(s.collectors));
    put("total", fmt.format(s.total));
    put("pct", (s.built * 100).toFixed(1));
    put("watts", `${sci(s.built * L_SUN)} W`);
    put("mass", `${sci(s.built * BELT_MASS, 1)} kg`);
    put("tugs", String(s.tugs));
    // The bar's odometer: how far the camera is from the Sun.
    if (odo) {
      const text = `${s.range < 9.995 ? s.range.toFixed(2) : s.range < 99.95 ? s.range.toFixed(1) : Math.round(s.range)} AU`;
      if (shown.range !== text) odo.textContent = shown.range = text;
    }

    // The veils: the cover's while the camera is at the sphere, the footer's
    // when it is home again, and an even one over the whole sky in between.
    fade("cover", home ? 0 : 1 - s.away);
    fade("end", home ? 1 - s.away : 0);
    // While the page is under way its type is over the sky wherever the camera is, so the sky is held down from the first screen past the cover; only a passage lifts it.
    fade("deep", Math.max(s.away, under) * (1 - 0.82 * open));

    const sun = s.labels.sun;
    // Names are for the camera at the sphere. Home on a narrow screen there is no clear sky to put one on.
    const naming = s.away < 0.3 && !roaming && !(home && narrow);
    for (const [name, el] of Object.entries(tags)) {
      const at = s.labels[name];
      if (!at) continue;
      let clear = false;
      if (naming) {
        // Keep names out of the type, off the edges, and out of the Sun's glare.
        const glare = name !== "swarm" && name !== "beam" && Math.hypot(at.x - sun.x, at.y - sun.y) < s.sunPx * 3.2;
        // Once the beam is out, its name stands where the swarm's did.
        const taken = name === "swarm" && s.beam > 0.5;
        const w = widths[name] ?? 130;
        clear = at.on && !glare && !taken && at.x > 24 && at.x < box.w - w - 10 && at.y > bar + 8 && at.y < box.h - 20 && free(at.x, at.y, w);
      }
      el.toggleAttribute("data-on", clear);
      if (clear) el.style.transform = `translate(${at.x.toFixed(1)}px, ${(at.y - 6).toFixed(1)}px)`;
    }
  }

  // The page has one loop for everything that moves (GSAP's), and the scene
  // joins it: it draws after the scroll has been read, never a frame behind it.
  const fns = new Map<(ms: number) => void, () => void>();
  const loop = {
    add(fn: (ms: number) => void) {
      const each = () => fn(performance.now());
      fns.set(fn, each);
      gsap.ticker.add(each);
    },
    remove(fn: (ms: number) => void) {
      const each = fns.get(fn);
      if (each) gsap.ticker.remove(each);
      fns.delete(fn);
    },
  };

  const cosmos = mountCosmos(canvas, {
    seed: hero?.dataset.seed ?? "yuzeli",
    loop,
    light: !wide() || (navigator.hardwareConcurrency ?? 8) <= 4,
    still,
    surfaces: still ? undefined : ([hero, foot].filter(Boolean) as HTMLElement[]),
    from: hero ? undefined : { cover: 1, depart: 1 },
    onFrame: frame,
    onLost() {
      // The browser has taken the graphics context back. The page goes on without the scene, on its stills.
      root.removeAttribute("data-voyage");
      if (hero && !hero.querySelector(".sky.still")) hero.prepend(Object.assign(new Image(), { className: "sky still", alt: "", src: "/cover.webp" }));
    },
    place(w, h) {
      box = { w, h };
      narrow = !wide();
      survey();
      if (!hero || !name) return { x: 0.68, y: 0.42 };
      if (!narrow) {
        // The Sun sits right of centre, a little above the middle of the cover, level with the top of the name.
        const top = name.getBoundingClientRect().top - hero.getBoundingClientRect().top;
        return { x: w > 1500 ? 0.66 : 0.68, y: Math.min(0.46, (bar + (top - bar) * 0.62) / h) };
      }
      // The band's height is the stylesheet's (global.css), read back in pixels.
      const band = parseFloat(getComputedStyle(root).getPropertyValue("--sky-h")) || Math.min(w * 0.8, window.innerHeight * 0.46);
      return { x: 0.5, y: (bar + band * 0.54) / Math.max(1, h) };
    },
    placeEnd(w, h) {
      // Home again: beside the address, in the middle of the footer's height.
      if (!foot) return { x: 0.68, y: 0.44 };
      const tall = Math.min(foot.offsetHeight, window.innerHeight);
      if (wide()) return { x: w > 1500 ? 0.66 : 0.68, y: (window.innerHeight - tall * 0.58) / h - 0.055 };
      // On a narrow screen the sphere sits under the footer's caption and over the
      // address. Home, it is about a fifth of the screen's height in radius.
      const cap = foot.querySelector<HTMLElement>(".cap");
      const clear = cap ? cap.offsetTop + cap.offsetHeight + 22 : 150;
      const y = window.innerHeight - tall + clear + 0.2 * h;
      root.style.setProperty("--end-y", `${Math.round(y)}px`);
      return { x: 0.5, y: y / Math.max(1, h) - 0.025 };
    },
  });
  if (!cosmos) return flat(); // no WebGL, or only in software
  window.addEventListener("resize", () => cosmos.refit(), { passive: true });
  document.fonts?.ready.then(() => {
    size();
    cosmos.refit();
  });
  size();

  if (still) {
    canvas.toggleAttribute("data-on", true);
    cosmos.setScroll(poster !== null ? +poster : 0.55);
    if (poster !== null) requestAnimationFrame(() => (root.dataset.posterReady = ""));
    return;
  }

  // From here on the scene runs behind the whole page, and the cover's small print may say so.
  root.dataset.voyage = "";
  // The layer has only now been put on the page. It has to be laid out once,
  // dark, before the canvas is turned up, or there is nothing to fade from.
  void canvas.offsetWidth;
  canvas.toggleAttribute("data-on", true);
  cosmos.refit();
  hero?.toggleAttribute("data-live", true);
  // Anything on the page may send a pulse up the beam (copying the address does).
  document.addEventListener("cosmos:pulse", () => cosmos.pulse());
  // After a cut (scripts/scroll.ts) the camera is simply where the page now is.
  document.addEventListener("cosmos:snap", () => cosmos.snap());
  // While a sequence (Sequence.astro) fills the window, the scene behind it rests.
  document.addEventListener("cosmos:rest", (e) => cosmos.rest(!!(e as CustomEvent).detail));

  // A change of page photographs the page being left (styles/transitions.css),
  // and Chrome photographs a WebGL canvas as a white sheet. So the scene is
  // handed over as a still of itself, and put back if the page is returned to whole.
  let print: HTMLCanvasElement | null = null;
  addEventListener("pageswap", (e) => {
    if (!(e as Event & { viewTransition?: unknown }).viewTransition || !root.hasAttribute("data-voyage")) return;
    print = cosmos.still();
    if (print) {
      print.className = "cosmos-canvas";
      print.style.transition = "none";
      print.style.opacity = getComputedStyle(canvas).opacity;
      canvas.after(print);
    }
    canvas.style.visibility = "hidden";
  });
  addEventListener("pageshow", () => {
    print?.remove();
    print = null;
    canvas.style.removeProperty("visibility");
  });

  // Scroll is the build. The cover is held (it is sticky in a taller box, see
  // Hero.astro) while the swarm closes. On a narrow screen the scene is a band
  // above the type, which the cover's own ground then covers as it leaves: so
  // there the camera's leaving is played inside the hold as well, where it can
  // be seen.
  const measure = () => {
    const vh = window.innerHeight;
    max = Math.max(1, ScrollTrigger.maxScroll(window));
    if (hold && hero) {
      holdTop = hold.getBoundingClientRect().top + window.scrollY;
      holdLen = Math.max(1, hold.offsetHeight - hero.offsetHeight);
    }
    coverEnd = hold ? holdTop + holdLen : 0;
    const body = Math.max(1, max - coverEnd);
    // Leaving takes most of a screen; coming home, a little over one. On a short page each gets a third.
    leave = Math.min(0.9 * vh, body / 3);
    land = Math.min(1.25 * vh, body / 3);
    heads = chapters.map((h) => h.getBoundingClientRect().top + window.scrollY);
    // Each far thing is hung where the camera will be looking when its stretch of sky is centred in the window.
    for (const it of interludes) {
      const r = it.el.getBoundingClientRect();
      it.top = r.top + window.scrollY;
      it.h = Math.max(1, r.height);
      const y = it.top + it.h / 2 - vh / 2;
      const cruise = Math.max(0, Math.min(1, (y - coverEnd) / Math.max(1, max - coverEnd)));
      let ch = 0;
      for (const top of heads) if (y + 140 >= top) ch++;
      const tallScreen = vh > window.innerWidth * 1.1;
      if (it.kind === "hole") cosmos.stage("hole", cruise, ch, tallScreen ? 0 : 0.06, tallScreen ? 0.12 : 0.1);
      if (it.kind === "quasar") {
        cosmos.stage("quasar", cruise, ch, tallScreen ? 0.12 : 0.28, tallScreen ? 0.2 : 0.16);
        // Nearer, in our own galaxy, a nebula stands across the view: the quasar is seen past its edge.
        cosmos.stage("nebula", cruise, ch, tallScreen ? -0.25 : -0.2, tallScreen ? -0.05 : -0.02);
      }
      if (it.kind === "wormhole") cosmos.stage("wormhole", cruise, ch, tallScreen ? 0 : 0.08, tallScreen ? 0.12 : 0.1);
    }
    stops = [{ y: coverEnd, r: 0 }];
    for (const it of interludes) if (it.el.dataset.reach) stops.push({ y: it.top + it.h / 2 - vh / 2, r: +it.el.dataset.reach });
    if (stops.length < 2 || !hold) stops = [];
  };
  let landed = false;
  const track = (y: number) => {
    const body = Math.max(1, max - coverEnd);
    const past = y - coverEnd;
    const held = hold ? Math.max(0, Math.min(1, (y - holdTop) / holdLen)) : 1;
    const cruise = Math.max(0, Math.min(1, past / body));
    const arrive = foot ? Math.max(0, Math.min(1, (y - (max - land)) / land)) : 0;
    // The page sets the way out itself: the camera goes from
    // one passage's place to the next at a steady zoom, and the far end of the
    // cruise is kept for the stretch after the last, so the turn for home is
    // made where nothing near can be seen.
    let reach: number | undefined, run = cruise;
    if (stops.length) {
      const last = stops[stops.length - 1];
      reach = last.r;
      for (let i = 1; i < stops.length; i++) {
        const a = stops[i - 1], b = stops[i];
        if (y < b.y) {
          reach = a.r + (b.r - a.r) * Math.max(0, Math.min(1, (y - a.y) / Math.max(1, b.y - a.y)));
          break;
        }
      }
      run = y <= last.y ? 0.45 * Math.max(0, (y - coverEnd) / Math.max(1, last.y - coverEnd)) : 0.45 + 0.55 * Math.min(1, (y - last.y) / Math.max(1, max - last.y));
    }
    home = run > 0.5;
    roaming = past > 0.2 * window.innerHeight && arrive <= 0;
    under = Math.max(0, Math.min(1, past / (0.6 * window.innerHeight))) * (1 - arrive);
    cosmos.setVoyage({
      // (Staged, a narrow screen builds over the whole hold too: the leaving is no longer played inside it.)
      cover: narrow && reach === undefined ? Math.min(1, held / 0.55) : held,
      // Staged, the camera is "away" (far enough that the scene is drawn for distance) by about Saturn.
      depart: !hero ? 1 : reach !== undefined ? Math.min(1, reach / 0.3) : narrow ? Math.max(0, (held - 0.55) / 0.45) : Math.max(0, Math.min(1, past / leave)),
      cruise: run,
      reach,
      arrive,
      // On a narrow screen the sphere comes up with the footer, so the footer's caption never has to cross it.
      lift: narrow && home ? Math.max(0, max - y) / box.h : 0,
    });
    // Each section of the page is a new heading for the camera, taken up as its title reaches the bar.
    let chapter = 0;
    for (const top of heads) if (y + 140 >= top) chapter++;
    cosmos.turn(chapter);
    // The open stretches: the sky is unveiled as one comes to the middle of the window, and a star goes off in the middle of one.
    const vh = window.innerHeight;
    open = 0;
    for (const it of interludes) {
      const off = Math.abs(it.top + it.h / 2 - (y + vh / 2)) / vh;
      open = Math.max(open, 1 - Math.min(1, Math.max(0, (off - 0.12) / 0.5)));
      // A far thing is out there only while its own stretch of sky is near: it comes up over the screen before, and goes over the screen after.
      const near = 1 - Math.min(1, Math.max(0, (off - 0.7) / 0.9));
      // A passage lights the orbit it names while it is near the middle of the window.
      if (it.el.dataset.orbit) cosmos.mark(it.el.dataset.orbit, 1 - Math.min(1, Math.max(0, (off - 0.15) / 0.55)));
      if (it.kind === "hole" || it.kind === "quasar" || it.kind === "wormhole") cosmos.show(it.kind, near);
      if (it.kind === "quasar") cosmos.show("nebula", near);
      if (it.kind === "nova") {
        if (off < 0.18 && !it.fired) {
          it.fired = true;
          cosmos.nova(vh > window.innerWidth * 1.1 ? 0.05 : 0.18, 0.12, 2.6);
        } else if (off > 0.9) it.fired = false;
      }
    }
    // Home: one pulse up the beam, a moment after the page has come to rest there.
    if (arrive >= 1 && !landed) {
      landed = true;
      gsap.delayedCall(0.5, () => landed && cosmos.pulse());
    } else if (arrive < 0.9) landed = false;
    // While the camera is at the sphere the type under the names is moving with the page.
    if (away < 0.4) survey();
  };
  ScrollTrigger.create({
    start: 0,
    end: "max",
    onRefresh(self) {
      measure();
      track(self.scroll());
    },
    onUpdate: (self) => track(self.scroll()),
  });
  measure();
  track(window.scrollY);
  // Opened part-way down (a reload, a link to a section): the cover's opening
  // is out of sight, so the scene starts as the scroll has it.
  if (hold && window.scrollY > coverEnd) cosmos.snap(true);

  // By night the scene is behind everything, and runs whenever the tab is seen.
  // By day the page between the cover and the footer is paper, so it runs only
  // while one of those two is on screen.
  const seen = new Set<Element>();
  const sync = () => cosmos.run(!document.hidden && (root.dataset.theme !== "light" || seen.size > 0));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) e.isIntersecting ? seen.add(e.target) : seen.delete(e.target);
    sync();
  });
  for (const el of [hold ?? hero, foot, ...interludes.map((it) => it.el)]) if (el) io.observe(el);
  document.addEventListener("visibilitychange", sync);
  document.addEventListener("themechange", sync);
  sync();
}
