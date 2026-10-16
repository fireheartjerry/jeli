// What must be true whatever the motion does. Three passes over each page:
//
//   resolved   with motion on, scroll the whole page and wait: every block that
//              arrives in motion has arrived, exactly as it was written (no
//              leftover split lines, nothing left hidden or half-faded), no
//              horizontal overflow, no console errors.
//   calm       under prefers-reduced-motion: nothing is held back, nothing
//              moves on its own (two photographs a second apart are the same),
//              and the fixed scene is not running.
//   plain      with JavaScript off: every block is visible, and the cover has
//              its still image.
//
//   QA_DIST=.qa/dist node tools/qa/checks.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { launch, open, moves, geometry, OUT, site, VIEWS } from "./lib.mjs";
import { serve } from "./serve.mjs";
const sharp = createRequire(import.meta.url)("sharp");

const own = process.env.QA_DIST ? await serve(process.env.QA_DIST) : null;
if (own) site.base = `http://localhost:${own.port}`;
fs.mkdirSync(OUT, { recursive: true });
const browser = await launch();
const PAGES = ["/", "/research/verifying-the-second-agent", "/404"];
const out = [];
const note = (page, view, pass, ok, detail) => {
  out.push({ page, view, pass, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${pass.padEnd(9)} ${view.padEnd(5)} ${page}  ${ok ? "" : JSON.stringify(detail)}`);
};

/**
 * Anything that arrives in motion and is not plainly there: the type of every
 * block that arrives (not the insides of a figure, which are the figure's own
 * business), and each plate's panel, header, plot and caption.
 */
const unsettled = () =>
  [...document.querySelectorAll("[data-reveal]:not([data-reveal='plate']), [data-reveal]:not([data-reveal='plate']) *, [data-reveal='plate'] > *")]
    .filter((el) => {
      if (el.closest("svg, [aria-hidden='true'], .figure") && !el.parentElement?.matches("[data-reveal='plate']")) return false;
      if (el.matches(".edge, .edge *, [data-reveal='read'] *")) return false; // the read-along is tied to the scroll; it is judged on its own
      // A passage's card comes up and leaves again with the scroll, like a title in a film, and its log is closed until asked
      // for; without the scene there is no passage at all. Its takes (home.pass.*) judge it.
      if (el.closest("[data-reveal='passage']")) return false;
      // A section's title sinks behind its line as it goes under the bar (it is handed to the breadcrumb): above there it is meant to be down.
      if (el.matches("h2") && el.closest("[data-reveal='title']") && el.getBoundingClientRect().top < 140) return false;
      const cs = getComputedStyle(el);
      if (cs.display === "none") return false;
      const t = cs.transform === "none" ? null : new DOMMatrix(cs.transform);
      return cs.visibility === "hidden" || +cs.opacity < 0.999 || (t && (Math.abs(t.m41) > 0.5 || Math.abs(t.m42) > 0.5));
    })
    .slice(0, 8)
    .map((el) => `${el.tagName.toLowerCase()}.${typeof el.className === "string" ? el.className : ""}`.slice(0, 60));

for (const url of PAGES) {
  for (const view of ["desk", "phone"]) {
    // ---- resolved ----
    {
      const { ctx, page, errors } = await open(browser, { url, view });
      const m = moves(page, { rows: [], shoot: async () => {} });
      await m.run(1);
      const g = await geometry(page);
      for (let y = 0; y <= g.max; y += g.vh * 0.6) {
        await page.evaluate((y) => window.scrollTo(0, y), y);
        await m.run(0.35);
      }
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await m.run(3);
      const state = await page.evaluate((fn) => {
        const left = document.querySelectorAll(".rise, .rise-mask").length;
        const dim = [...document.querySelectorAll("[data-reveal='read'] .w, [data-reveal='read'] a")].filter((el) => +getComputedStyle(el).opacity < 0.999).length;
        return { left, dim, unsettled: new Function(`return (${fn})()`)(), wide: document.documentElement.scrollWidth - innerWidth, revealed: document.documentElement.hasAttribute("data-revealed") || !document.querySelector("[data-reveal]") };
      }, unsettled.toString());
      const ok = !state.left && !state.dim && !state.unsettled.length && state.wide <= 0 && state.revealed && !errors.length;
      note(url, view, "resolved", ok, { ...state, errors: [...new Set(errors)].slice(0, 4) });
      await ctx.close();
    }
    // ---- calm ----
    {
      const v = VIEWS[view];
      const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 1, hasTouch: v.touch, isMobile: v.touch, reducedMotion: "reduce" });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(site.base + url, { waitUntil: "networkidle" });
      await page.waitForTimeout(700);
      const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
      let moved = 0, hidden = [];
      for (const f of [0, 0.25, 0.5, 0.75, 1]) {
        await page.evaluate((y) => window.scrollTo(0, y), max * f);
        await page.waitForTimeout(350);
        const a = await sharp(await page.screenshot()).raw().toBuffer();
        await page.waitForTimeout(900);
        const b = await sharp(await page.screenshot()).raw().toBuffer();
        let d = 0;
        for (let i = 0; i < a.length; i += 7) if (Math.abs(a[i] - b[i]) > 6) d++;
        moved = Math.max(moved, d);
        hidden.push(...(await page.evaluate((fn) => new Function(`return (${fn})()`)(), unsettled.toString())));
      }
      const state = await page.evaluate(() => ({ gated: document.documentElement.hasAttribute("data-motion"), scene: document.documentElement.hasAttribute("data-voyage"), smooth: document.documentElement.classList.contains("lenis") }));
      const ok = moved === 0 && !hidden.length && !state.gated && !state.scene && !state.smooth && !errors.length;
      note(url, view, "calm", ok, { moved, hidden: [...new Set(hidden)].slice(0, 6), ...state, errors });
      await ctx.close();
    }
    // ---- plain ----
    {
      const v = VIEWS[view];
      const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 1, javaScriptEnabled: false });
      const page = await ctx.newPage();
      await page.goto(site.base + url, { waitUntil: "load" });
      // No scripts run here, so the page cannot be asked in the usual way: its markup and computed styles are read through the protocol instead.
      const cdp = await ctx.newCDPSession(page);
      const { result } = await cdp.send("Runtime.evaluate", {
        expression: `JSON.stringify({ hidden: (${unsettled.toString()})().length, still: !document.querySelector("[data-hero]") || !!document.querySelector("[data-hero] noscript"), wide: document.documentElement.scrollWidth - innerWidth })`,
        returnByValue: true,
      }).catch(() => ({ result: { value: null } }));
      const state = result?.value ? JSON.parse(result.value) : null;
      note(url, view, "plain", !!state && state.hidden === 0 && state.still && state.wide <= 0, state ?? "could not read the page");
      await ctx.close();
    }
  }
}
await browser.close();
own?.close();
fs.writeFileSync(path.join(OUT, "checks.json"), JSON.stringify(out, null, 1));
const bad = out.filter((r) => !r.ok);
console.log(`\n${out.length - bad.length} of ${out.length} checks pass`);
process.exitCode = bad.length ? 1 : 0;
