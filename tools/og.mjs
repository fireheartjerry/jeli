// Render /og at 1200x630 into public/og.jpg. Run with the dev server up.
import { launch } from "./lib.mjs";
const b = await launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await p.goto(process.env.URL ?? "http://localhost:4321/og", { waitUntil: "networkidle" });
await p.evaluate(() => document.fonts.ready);
await p.locator(".og").screenshot({ path: "public/og.jpg", type: "jpeg", quality: 90 });
await b.close();
console.log("public/og.jpg");
