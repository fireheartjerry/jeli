// Load weight, frame pacing and layout shift for one page.
//   node tools/perf.mjs [url] [width] [height] [runs]
// Weight is what the page requests before the first scroll. Scripts, styles and
// HTML are gzipped here, so the figure is an estimate of what a CDN would send,
// not a measurement of bytes on the wire (fonts and images are counted raw).
// The scroll is run several times in fresh pages: one run can be disturbed by
// whatever else the machine is doing, and one slow frame hides inside a p95.
import zlib from "node:zlib";
import { launch, watch } from "./lib.mjs";

const [url = "http://localhost:4321/", w = "1440", h = "900", runs = "3"] = process.argv.slice(2);
const browser = await launch();
const kb = (n) => +(n / 1024).toFixed(1);

async function run() {
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2 });
  const errors = [];
  watch(page, errors);

  const weight = { script: 0, stylesheet: 0, font: 0, document: 0, image: 0, other: 0 };
  const pending = [];
  page.on("response", (res) => {
    const type = res.request().resourceType();
    pending.push(
      res.body().then(
        (body) => {
          const bytes = type === "font" || type === "image" ? body.length : zlib.gzipSync(body).length;
          weight[type in weight ? type : "other"] += bytes;
        },
        () => {},
      ),
    );
  });

  await page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await Promise.all(pending);
  const before = { ...weight };

  // A steady 1,400 px/s scroll to the bottom, timing every frame.
  const frames = await page.evaluate(async () => {
    const total = document.documentElement.scrollHeight - innerHeight;
    const deltas = [], slow = [];
    let last = performance.now();
    const start = last;
    // What is in the middle of the screen, and which figure is about to load
    // (figures load a little over a screen ahead), to name the cause of a slow frame.
    const figs = [...document.querySelectorAll("[data-fig], [data-hero]")];
    const name = (f) => f.dataset.fig ?? "cover";
    const nearest = (at) => {
      let best = "", d = Infinity;
      for (const f of figs) {
        const r = f.getBoundingClientRect();
        const k = Math.abs(at(r) - 0);
        if (k < d) { d = k; best = name(f); }
      }
      return best;
    };
    await new Promise((done) => {
      const step = (now) => {
        const dt = now - last;
        deltas.push(dt);
        if (dt > 50 && deltas.length > 1) {
          const mid = nearest((r) => r.top + r.height / 2 - innerHeight / 2);
          const loading = nearest((r) => r.top - innerHeight * 2.2);
          slow.push(`${Math.round(dt)}ms at y=${Math.round(scrollY)}, ${mid} on screen, ${loading} loading`);
        }
        last = now;
        const y = ((now - start) / 1000) * 1400;
        scrollTo(0, Math.min(total, y));
        y < total ? requestAnimationFrame(step) : done();
      };
      requestAnimationFrame(step);
    });
    return { deltas: deltas.slice(1), slow };
  });
  await page.waitForTimeout(500);
  const sorted = [...frames.deltas].sort((a, b) => a - b);
  const pick = (q) => +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))].toFixed(1);
  const cls = await page.evaluate(() => +window.__cls.toFixed(4));
  await page.close();
  return {
    before,
    frames: { count: sorted.length, medianMs: pick(0.5), p95Ms: pick(0.95), worstMs: +sorted.at(-1).toFixed(1), over50ms: sorted.filter((d) => d > 50).length, slowFrames: frames.slow },
    cls,
    errors: [...new Set(errors)],
  };
}

const all = [];
for (let i = 0; i < +runs; i++) all.push(await run());
await browser.close();

const first = all[0];
const initial = kb(first.before.script + first.before.stylesheet + first.before.font);
// Each number is the worst across the runs, except the long-frame rule, which
// asks that most runs are free of any frame over 100 ms.
const worst = (f) => Math.max(...all.map(f));
const clean = all.filter((r) => r.frames.worstMs <= 100).length;
const out = {
  url,
  viewport: `${w}x${h}`,
  beforeScrollKB: { gzipEstimated: true, js: kb(first.before.script), css: kb(first.before.stylesheet), fonts: kb(first.before.font), html: kb(first.before.document), jsCssFonts: initial },
  frames: { medianMs: worst((r) => r.frames.medianMs), p95Ms: worst((r) => r.frames.p95Ms), worstMs: worst((r) => r.frames.worstMs), runsWithNoFrameOver100ms: `${clean} of ${all.length}` },
  runs: all.map((r) => r.frames),
  cls: worst((r) => r.cls),
  errors: [...new Set(all.flatMap((r) => r.errors))],
};
out.pass = { weight: initial <= 400, median: out.frames.medianMs <= 18, p95: out.frames.p95Ms <= 40, longFrames: clean * 2 > all.length, cls: out.cls <= 0.05 };
console.log(JSON.stringify(out, null, 2));
