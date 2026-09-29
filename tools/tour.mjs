// Scroll through every figure on the page and screenshot each one mid-way and settled.
import { chromium } from "playwright-core";
import os from "node:os";
import fs from "node:fs";
const [w = "1440", h = "900"] = process.argv.slice(2);
const exe = `${os.homedir()}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const out = process.env.OUT ?? "/tmp/tour";
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: exe });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await p.goto(process.env.URL ?? "http://localhost:4321", { waitUntil: "networkidle" });
const smooth = (t) => p.evaluate(async (t) => {
  const s = scrollY;
  for (let k = 1; k <= 16; k++) { scrollTo(0, s + ((t - s) * k) / 16); await new Promise((r) => requestAnimationFrame(r)); }
}, t);
const names = await p.evaluate(() => [...document.querySelectorAll("[data-fig]")].map((e) => e.dataset.fig));
for (const n of names) {
  for (const [tag, frac] of [["mid", 0.55], ["end", 0.12]]) {
    const top = await p.evaluate((n) => document.querySelector(`[data-fig="${n}"]`).getBoundingClientRect().top + scrollY, n);
    await smooth(top - frac * +h);
    await p.waitForTimeout(700);
    await p.screenshot({ path: `${out}/${w}-${n}-${tag}.png` });
  }
}
console.log(names.join(" "));
if (errors.length) console.log("ERRORS:\n" + [...new Set(errors)].join("\n"));
await b.close();
