// Render /og at 1200x630 (2x) into public/og.png. Run with the dev server up.
import { chromium } from "playwright-core";
import os from "node:os";
const exe = `${os.homedir()}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const b = await chromium.launch({ executablePath: exe });
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await p.goto(process.env.URL ?? "http://localhost:4321/og", { waitUntil: "networkidle" });
await p.evaluate(() => document.fonts.ready);
await p.locator(".og").screenshot({ path: "public/og.png" });
await b.close();
console.log("public/og.png");
