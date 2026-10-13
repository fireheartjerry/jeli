// Shared launcher for the screenshot and measurement tools.
import { chromium } from "playwright-core";
import os from "node:os";
import fs from "node:fs";

export async function launch() {
  const cache = `${os.homedir()}/Library/Caches/ms-playwright`;
  const dir = fs.existsSync(cache)
    ? fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().pop()
    : undefined;
  const exe = `${cache}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
  return chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : { channel: "chrome" });
}

/** Collect page errors and console errors into `sink`. */
export function watch(page, sink) {
  page.on("pageerror", (e) => sink.push(e.message));
  page.on("console", (m) => m.type() === "error" && sink.push(m.text()));
}

/** Scroll in small steps so scrubbed timelines pass through every position. */
export const glide = (page, to, steps = 14) =>
  page.evaluate(
    async ([to, steps]) => {
      const from = scrollY;
      for (let i = 1; i <= steps; i++) {
        scrollTo(0, from + ((to - from) * i) / steps);
        await new Promise((r) => requestAnimationFrame(r));
      }
    },
    [to, steps],
  );

/** Walk the whole page top to bottom so every lazy figure loads and settles. */
export async function settle(page, h) {
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < total; y += h / 3) {
    await page.evaluate((y) => scrollTo(0, y), y);
    await page.waitForTimeout(90);
  }
  await page.waitForTimeout(400);
}
