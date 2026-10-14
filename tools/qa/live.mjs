// One page giving way to another, recorded as it happens.
//
// The frame-by-frame engine (run.mjs) holds the clock still and steps it, and
// a cross-document view transition cannot be photographed that way: with the
// clock held, Chrome draws every picture of the page being left as a white
// sheet. So these are recorded in real time instead, from the compositor's own
// screencast, and measured for the one thing that matters most here: that no
// frame on the way is brighter than both ends of it (a flash), and that
// nothing cuts.
//
//   npx astro build --outDir .qa/dist
//   QA_DIST=.qa/dist node tools/qa/live.mjs            every crossing
//   QA_DIST=.qa/dist node tools/qa/live.mjs night.     only those whose name starts so
//
// Leaves .qa/live/<name>.jpg (every fifth frame of the crossing, to look at)
// and .qa/live.json (the brightness of every frame, and the flags). Frames
// arrive when the compositor has one, so their spacing is uneven: this is a
// record of what was shown, not a measure of timing.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { launch, OUT, site, VIEWS } from "./lib.mjs";
import { serve } from "./serve.mjs";

const sharp = createRequire(import.meta.url)("sharp");
const PAPER = "/research/verifying-the-second-agent";
const LINK = '.entry h3 a[href$="verifying-the-second-agent"]';
const go = (url) => (p) => p.evaluate((u) => location.assign(u), url);

/** Every way a page is left, by night and by day. `at` is scrolled to first; `pre` runs before recording. */
const crossings = [];
for (const scheme of ["dark", "light"]) {
  const t = scheme === "dark" ? "night" : "day";
  crossings.push(
    { name: `${t}.cover-paper`, scheme, from: "/", go: go(PAPER), about: "From the cover, the sphere on screen." },
    { name: `${t}.list-paper`, scheme, from: "/", at: "#research", go: (p) => p.locator(LINK).click(), about: "The paper's link in the list of research: the title is carried." },
    { name: `${t}.figure-paper`, scheme, from: "/", at: ".fig:has(canvas)", go: go(PAPER), about: "With a figure drawn on a canvas on screen." },
    { name: `${t}.footer-paper`, scheme, from: "/", at: "footer", go: go(PAPER), about: "From the footer, the sphere home again." },
    { name: `${t}.paper-list`, scheme, from: PAPER, go: go("/#research"), about: "Back to the list by a link: the title is carried down." },
    { name: `${t}.paper-back`, scheme, from: "/", at: "#research", pre: async (p) => (await p.locator(LINK).click(), p.waitForTimeout(2500)), go: (p) => p.goBack({ waitUntil: "commit" }), about: "Back to the list with the Back button." },
    { name: `${t}.paper-cover`, scheme, from: PAPER, go: go("/"), about: "From the paper to the cover." },
    { name: `${t}.lost-home`, scheme, from: "/nowhere-at-all", go: go("/"), about: "From the 404 page home." },
  );
}
crossings.push({ name: "phone.list-paper", scheme: "dark", view: "phone", from: "/", at: "#research", go: (p) => p.locator(LINK).click(), about: "On a phone, by night." });

const only = process.argv.slice(2);
const own = process.env.QA_DIST ? await serve(process.env.QA_DIST) : null;
if (own) site.base = `http://localhost:${own.port}`;
const dir = path.join(OUT, "live");
fs.mkdirSync(dir, { recursive: true });
const browser = await launch();
const report = {};

for (const c of crossings) {
  if (only.length && !only.some((o) => c.name.startsWith(o))) continue;
  const v = VIEWS[c.view ?? "desk"];
  const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 1, hasTouch: v.touch, isMobile: v.touch });
  const page = await ctx.newPage();
  await page.addInitScript((t) => localStorage.setItem("theme", t), c.scheme);
  await page.goto(site.base + c.from, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  if (c.at) {
    await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: sel === "footer" ? "end" : "start" }), c.at);
    await page.waitForTimeout(2200);
  }
  if (c.pre) await c.pre(page);
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", (f) => {
    frames.push(Buffer.from(f.data, "base64"));
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 72, everyNthFrame: 1 });
  await page.waitForTimeout(150);
  await c.go(page);
  await page.waitForTimeout(2600);
  await cdp.send("Page.stopScreencast").catch(() => {});
  await ctx.close();

  // Brightness of each frame under the bar, and how much of it is white.
  const lum = [], white = [];
  for (const f of frames) {
    const { data } = await sharp(f).extract({ left: 0, top: 64, width: v.w, height: v.h - 64 }).resize(96).greyscale().raw().toBuffer({ resolveWithObject: true });
    lum.push(Math.round(data.reduce((a, x) => a + x, 0) / data.length));
    white.push(+(data.reduce((a, x) => a + (x >= 250 ? 1 : 0), 0) / data.length).toFixed(3));
  }
  const first = lum[0] ?? 0, last = lum.at(-1) ?? 0;
  const hi = Math.max(first, last), lo = Math.min(first, last);
  const flags = [];
  lum.forEach((l, i) => {
    // (A page of paper with its type still to come is a few levels brighter than the same page set: that is not a flash.)
    if (l - hi > 10) flags.push({ n: i, kind: "flash", what: `${l} against ${hi} at the brighter end` });
    if (white[i] > 0.2 && white[0] < 0.05 && white.at(-1) < 0.05) flags.push({ n: i, kind: "white", what: `${Math.round(white[i] * 100)}% of the window is white` });
  });
  const step = Math.max(0, ...lum.slice(1).map((l, i) => Math.abs(l - lum[i])));
  const start = Math.max(0, lum.findIndex((l, i) => i > 0 && l !== lum[i - 1]) - 2);
  const picks = Array.from({ length: 12 }, (_, i) => start + i * 5).filter((i) => i < frames.length);
  const tw = Math.min(480, v.w), th = Math.round((tw * v.h) / v.w);
  if (picks.length) {
    const tiles = await Promise.all(picks.map((i) => sharp(frames[i]).resize(tw).toBuffer()));
    await sharp({ create: { width: tw * 4, height: th * 3, channels: 3, background: "#201010" } })
      .composite(tiles.map((input, i) => ({ input, left: (i % 4) * tw, top: Math.floor(i / 4) * th })))
      .jpeg({ quality: 80 })
      .toFile(path.join(dir, `${c.name}.jpg`));
  }
  report[c.name] = { about: c.about, frames: frames.length, ends: [first, last], over: Math.max(0, ...lum.map((l) => l - hi)), under: Math.max(0, ...lum.map((l) => lo - l)), step, flags: flags.slice(0, 20), lum: lum.slice(start, start + 90) };
  console.log(`${flags.length ? "FLAG" : "ok  "} ${c.name.padEnd(20)} ${String(frames.length).padStart(3)} frames  ends ${first}/${last}  over ${report[c.name].over}  under ${report[c.name].under}  largest step ${step}${flags.length ? "  " + flags[0].kind + " at #" + flags[0].n : ""}`);
}
await browser.close();
own?.close();

const file = path.join(OUT, "live.json");
const all = { ...(fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {}), ...report };
fs.writeFileSync(file, JSON.stringify(all, null, 1));
const names = Object.keys(all);
console.log(`\n${names.length} crossings, ${names.reduce((n, k) => n + all[k].frames, 0)} frames, ${names.reduce((n, k) => n + all[k].flags.length, 0)} flagged, in ${path.relative(process.cwd(), dir)}.`);
