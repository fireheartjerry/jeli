// The frame-by-frame engine: open a page on the virtual clock (clock.js), run
// one sequence of an animation a frame at a time, and photograph every frame.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "../..");
export const OUT = path.resolve(ROOT, process.env.QA_OUT ?? ".qa");
/** Where the site under test is served. run.mjs points this at its own server when QA_DIST is set. */
export const site = { base: process.env.QA_URL ?? "http://localhost:4410" };
export const FPS = 60;
export const STEP = 1000 / FPS;

export const VIEWS = {
  desk: { w: 1440, h: 900, touch: false },
  phone: { w: 390, h: 844, touch: true },
};

/**
 * The browser this copy of Playwright was built for, as full Chrome (which
 * draws WebGL on the GPU; the headless shell falls back to a software
 * renderer). Not whichever Chromium is newest on the machine: frames are only
 * comparable from one run to the next if the browser is the same.
 */
export const launch = () => chromium.launch({ channel: "chromium" });

/** Open `path` with the clock held at zero. Nothing on the page has moved yet when this returns. */
export async function open(browser, { url, view = "desk", scheme = "dark", reduced = false }) {
  const v = VIEWS[view];
  const ctx = await browser.newContext({
    viewport: { width: v.w, height: v.h },
    deviceScaleFactor: 1,
    hasTouch: v.touch,
    isMobile: v.touch,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  const page = await ctx.newPage();
  // The document's own timeline (CSS animations, transitions, Web Animations)
  // is frozen before the page exists; clock.js moves it on a frame at a time.
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0 });
  await page.addInitScript({ path: path.join(HERE, "clock.js") });
  await page.addInitScript((t) => localStorage.setItem("theme", t), scheme);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/Outdated Optimize Dep|\[vite\]/.test(m.text()) && errors.push(m.text()));
  await page.goto(site.base + url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready.then(() => true));
  return { ctx, page, errors, view: v };
}

/** A recorder for one sequence: every frame is a JPEG plus one line of measurements. */
export function recorder(id) {
  const dir = path.join(OUT, "seq", id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const rows = [];
  return {
    dir,
    rows,
    async shoot(page, { label } = {}) {
      const n = rows.length;
      const file = `${String(n).padStart(4, "0")}.jpg`;
      const info = await page.evaluate(() => window.__qa.sample());
      await page.screenshot({ path: path.join(dir, file), type: "jpeg", quality: 86, animations: "allow", caret: "initial" });
      rows.push({ n, file, label, ...info });
    },
    save(meta) {
      fs.writeFileSync(path.join(dir, "frames.json"), JSON.stringify({ id, fps: FPS, ...meta, frames: rows }));
    },
  };
}

const settle = (page, n = 2) => page.evaluate((n) => window.__qa.settle(n), n);
const step = (page, ms = STEP) => page.evaluate((ms) => window.__qa.step(ms), ms);

/**
 * The moves a sequence is made of. Each advances the virtual clock one frame
 * at a time and hands every frame to `rec`.
 */
export function moves(page, rec) {
  let mouse = { x: 0, y: 0 };
  const frame = async (label) => {
    await settle(page, 2); // scroll events, observers and layout catch up, clock held
    await step(page);
    await settle(page, 1); // the stepped state reaches the screen
    await rec.shoot(page, { label });
  };
  const api = {
    frame,
    /** Let the page run for `seconds` without recording (to settle before a take). */
    async run(seconds) {
      for (let i = 0; i < Math.round(seconds * FPS); i++) {
        await settle(page, 1);
        await step(page);
      }
      await settle(page, 2);
    },
    /** Record `seconds` with nothing done to the page. */
    async hold(seconds, label = "hold") {
      for (let i = 0; i < Math.round(seconds * FPS); i++) await frame(label);
    },
    /** Scroll from where the page is to `to` at `speed` px/s, the way a scrollbar drag would: the document moves each frame. */
    async scroll(to, speed = 600, label = "scroll") {
      const from = await page.evaluate(() => window.scrollY);
      const n = Math.max(1, Math.round((Math.abs(to - from) / speed) * FPS));
      for (let i = 1; i <= n; i++) {
        await page.evaluate((y) => window.scrollTo(0, y), from + ((to - from) * i) / n);
        await frame(label);
      }
    },
    /** Turn a mouse wheel: `notches` of `delta` px, one every `gap` frames, then `tail` seconds for the glide to finish. */
    async wheel(notches, delta = 100, gap = 6, tail = 1.6, label = "wheel") {
      for (let i = 0; i < notches; i++) {
        await page.mouse.wheel(0, delta);
        for (let k = 0; k < gap; k++) await frame(label);
      }
      await api.hold(tail, `${label}:tail`);
    },
    /** Jump the page somewhere with no frames recorded, and let it come to rest there. */
    async place(y, seconds = 1.6) {
      await page.evaluate((y) => window.scrollTo(0, y), y);
      await api.run(seconds);
    },
    /** Move the pointer to (x, y) over `seconds`, recording. */
    async glide(x, y, seconds = 0.4, label = "pointer") {
      const n = Math.max(1, Math.round(seconds * FPS));
      const from = { ...mouse };
      for (let i = 1; i <= n; i++) {
        mouse = { x: from.x + ((x - from.x) * i) / n, y: from.y + ((y - from.y) * i) / n };
        await page.mouse.move(mouse.x, mouse.y);
        await frame(label);
      }
    },
    /** Put the pointer somewhere without recording. */
    async point(x, y) {
      mouse = { x, y };
      await page.mouse.move(x, y);
      await settle(page, 1);
    },
    async down() {
      await page.mouse.down();
    },
    async up() {
      await page.mouse.up();
    },
    async click(label = "click") {
      await page.mouse.down();
      await page.mouse.up();
      await frame(label);
    },
    async key(k, label = "key") {
      await page.keyboard.press(k);
      await frame(label);
    },
    get mouse() {
      return mouse;
    },
  };
  return api;
}

/**
 * One frame cut down to the element a take is about. The box keeps the
 * element's own size and the element stays put in it, wherever it was in the
 * window (what was off screen is left dark), so a run of these is the element
 * alone with the page's scrolling taken out. `box` is [x, y, w, h] in the window.
 */
export async function steady(sharp, file, box, pad = 12) {
  const img = sharp(file);
  const m = await img.metadata();
  const W = Math.max(8, Math.round(box[2] + 2 * pad)), H = Math.max(8, Math.round(box[3] + 2 * pad));
  const x0 = Math.round(box[0] - pad), y0 = Math.round(box[1] - pad);
  const left = Math.max(0, x0), top = Math.max(0, y0);
  const right = Math.min(m.width, x0 + W), bottom = Math.min(m.height, y0 + H);
  const blank = sharp({ create: { width: W, height: H, channels: 3, background: "#000" } });
  if (right - left < 2 || bottom - top < 2) return blank;
  const part = await img.extract({ left, top, width: right - left, height: bottom - top }).toBuffer();
  return sharp(await blank.composite([{ input: part, left: left - x0, top: top - y0 }]).png().toBuffer());
}

/** Page geometry a sequence is planned from, read with the clock held. */
export const geometry = (page) =>
  page.evaluate(() => {
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y + scrollY, w: r.width, h: r.height };
    };
    const one = (sel) => box(document.querySelector(sel));
    return {
      vh: innerHeight,
      vw: innerWidth,
      max: document.documentElement.scrollHeight - innerHeight,
      hero: one("[data-hero]"),
      // The cover is held for a stretch: where it lets go, as a page offset.
      coverEnd: (() => {
        const box = document.querySelector("[data-hold]"), hero = document.querySelector("[data-hero]");
        return box && hero ? box.getBoundingClientRect().top + scrollY + box.offsetHeight - hero.offsetHeight : 0;
      })(),
      foot: one("[data-foot]"),
      sections: [...document.querySelectorAll("[data-section]")].map((el) => ({ id: el.id, ...box(el) })),
      entries: [...document.querySelectorAll(".entry")].map((el, i) => ({ i, title: el.querySelector("h3")?.textContent.trim(), ...box(el) })),
      figs: [...document.querySelectorAll("[data-fig]")].map((el) => ({ name: el.dataset.fig, ...box(el) })),
    };
  });

/** Walk the page once so every lazy figure has loaded, then come back to the top and let it settle. */
export async function warm(page, m) {
  const g = await geometry(page);
  for (let y = 0; y <= g.max; y += g.vh * 0.5) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await m.run(0.12);
    await page.waitForLoadState("networkidle");
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await m.run(1.5);
  return geometry(page);
}
