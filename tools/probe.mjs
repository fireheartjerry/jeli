// Screenshot specific scroll offsets (px) and report runtime errors. node probe.mjs url w h outdir y1 y2 ...
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { launch, watch } = await import("./lib.mjs");
const sharp = require("sharp");
const [url, w, h, out, ...ys] = process.argv.slice(2);
if (!url || !w || !h || !out) {
  console.error("usage: node tools/probe.mjs <url> <width> <height> <outdir> [scroll y ...]");
  process.exit(1);
}
const dir = (out.startsWith("/") ? out : `${process.cwd()}/${out}`).replace(/\/?$/, "/");
fs.mkdirSync(dir, { recursive: true });
const browser = await launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
await page.addInitScript((t) => localStorage.setItem("theme", t), process.env.SCHEME ?? "dark");
const errors = [];
watch(page, errors);
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(+(process.env.WAIT ?? 5200));
const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
const files = [];
for (const raw of ys) {
  const y = raw.endsWith("%") ? Math.round((total * parseFloat(raw)) / 100) : raw === "end" ? total : +raw;
  await page.evaluate(async (t) => {
    const s = scrollY, n = 18;
    for (let k = 1; k <= n; k++) { scrollTo(0, s + ((t - s) * k) / n); await new Promise((r) => requestAnimationFrame(r)); }
  }, y);
  await page.waitForTimeout(+(process.env.SETTLE ?? 900));
  const f = `${dir}${String(y).padStart(6, "0")}.png`;
  await page.screenshot({ path: f });
  files.push(f);
}
await browser.close();
const cols = Math.min(+(process.env.COLS ?? 3), files.length), tw = Math.round(1920 / cols) - 6, th = Math.round((tw * +h) / +w), pad = 6;
const rows = Math.ceil(files.length / cols);
const comps = await Promise.all(files.map(async (f, i) => ({ input: await sharp(f).resize(tw, th).png().toBuffer(), left: pad + (i % cols) * (tw + pad), top: pad + Math.floor(i / cols) * (th + pad) })));
await sharp({ create: { width: pad + cols * (tw + pad), height: pad + rows * (th + pad), channels: 3, background: "#444" } }).composite(comps).jpeg({ quality: 84 }).toFile(`${dir}sheet.jpg`);
console.log(JSON.stringify({ total, files: files.length, errors: [...new Set(errors)] }));
