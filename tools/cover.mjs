// Render the cover scene to still images: the opening state, for readers
// without JavaScript or WebGL, and the finished sphere, for the footer.
//   node tools/cover.mjs            (needs the dev server on :4321)
// The page's poster mode (?poster=<0..1>) freezes the simulation at that point
// of the build and hides everything drawn over it, so the stills are only the
// scene and are the same every time.
import { launch } from "./lib.mjs";

const base = process.env.URL ?? "http://localhost:4321/";
const browser = await launch();
for (const [at, file] of [["0", "cover"], ["1", "cover-end"]]) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  await page.goto(`${base}?poster=${at}`, { waitUntil: "networkidle" });
  await page.waitForSelector("html[data-poster-ready]");
  await page.waitForTimeout(300);
  await page.locator("[data-hero]").screenshot({ path: `public/${file}.png` });
  await page.close();
}
await browser.close();
console.log("wrote public/cover.png and public/cover-end.png; run tools/cover.sh to convert them");
