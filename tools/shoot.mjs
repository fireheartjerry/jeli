// Screenshot the running site at scroll positions: node tools/shoot.mjs [w] [h] frac1 frac2 ...
import { chromium } from "playwright-core";
import os from "node:os";
import fs from "node:fs";

const [w = "1440", h = "900", ...fracs] = process.argv.slice(2);
const cache = `${os.homedir()}/Library/Caches/ms-playwright`;
const dir = fs.readdirSync(cache).find((d) => d.startsWith("chromium-"));
const exe = `${cache}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined, channel: fs.existsSync(exe) ? undefined : "chrome" });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(process.env.URL ?? "http://localhost:4321", { waitUntil: "networkidle" });
await page.waitForTimeout(600);
const out = process.env.OUT ?? "/tmp/shots";
fs.mkdirSync(out, { recursive: true });
for (const f of fracs.length ? fracs : ["0"]) {
  // Scroll in steps so scrubbed timelines see intermediate positions.
  const target = f.endsWith("px") ? +f.slice(0, -2) : +f * +h;
  await page.evaluate(async (t) => {
    const s = window.scrollY, n = 12;
    for (let i = 1; i <= n; i++) { window.scrollTo(0, s + ((t - s) * i) / n); await new Promise((r) => requestAnimationFrame(r)); }
  }, target);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${w}-${f}.png` });
  console.log(`${out}/${w}-${f}.png`);
}
if (errors.length) console.log("ERRORS:\n" + [...new Set(errors)].join("\n"));
await browser.close();
