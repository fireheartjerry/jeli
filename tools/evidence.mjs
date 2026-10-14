// Capture everything a reviewer needs to judge the site without running it:
// screenshots in both themes and at both sizes, plus measurements as JSON.
//   node tools/evidence.mjs [baseUrl] [outDir] [extraPath ...]
import fs from "node:fs";
import { launch, watch, glide, settle } from "./lib.mjs";

const [base = "http://localhost:4321", out = "/tmp/evidence", ...extra] = process.argv.slice(2);
const pages = ["/", ...extra];
fs.mkdirSync(out, { recursive: true });
const browser = await launch();
const report = { base, pages, errors: {}, overflow: {}, text: {} };
const slug = (p) => (p === "/" ? "home" : p.replace(/\W+/g, "-").replace(/^-|-$/g, ""));
const SIZES = { desktop: [1440, 900], phone: [390, 844] };
const TOUCH = { hasTouch: true, isMobile: true };

async function open(path, [w, h], opts = {}) {
  // `colorScheme` here means the site's own theme: the site opens at night
  // unless a choice is stored, so a stored choice is how a reader gets day.
  const { colorScheme, ...rest } = opts;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, ...rest });
  if (colorScheme) await ctx.addInitScript((t) => localStorage.setItem("theme", t), colorScheme);
  const page = await ctx.newPage();
  const errs = (report.errors[`${path} ${w} ${opts.colorScheme ?? ""}`.trim()] = []);
  watch(page, errs);
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800); // let the load choreography finish
  return { ctx, page };
}

// 1. First viewport, both themes, both sizes.
for (const scheme of ["light", "dark"])
  for (const [name, size] of Object.entries(SIZES)) {
    const { ctx, page } = await open("/", size, { colorScheme: scheme, ...(name === "phone" ? TOUCH : {}) });
    await page.screenshot({ path: `${out}/first-${name}-${scheme}.png` });
    await ctx.close();
  }

// 2. Sections, both themes, desktop, as a reader scrolling would see them.
for (const scheme of ["light", "dark"]) {
  for (const path of pages) {
    const { ctx, page } = await open(path, SIZES.desktop, { colorScheme: scheme });
    await settle(page, 900);
    const tops = await page.evaluate(() =>
      [...document.querySelectorAll("[data-section], footer")].map((el, i) => ({
        name: el.dataset.section ?? "footer",
        top: el.getBoundingClientRect().top + scrollY,
        i,
      })),
    );
    for (const s of tops) {
      await glide(page, Math.max(0, s.top - 70));
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${out}/section-${slug(path)}-${String(s.i).padStart(2, "0")}-${s.name.toLowerCase().replace(/\W+/g, "-")}-${scheme}.png` });
    }
    await ctx.close();
  }
}
// Figures in their finished state. Scroll-scrubbed timelines only reach their
// end at one scroll position, so the plates are photographed with reduced
// motion, where the page shows each figure as the server rendered it: complete.
for (const [size, name, extra] of [[SIZES.desktop, "desktop", {}], [SIZES.phone, "phone", TOUCH]]) {
  for (const scheme of ["light", "dark"]) {
    for (const path of pages) {
      const { ctx, page } = await open(path, size, { colorScheme: scheme, reducedMotion: "reduce", ...extra });
      const figs = await page.evaluate(() => [...document.querySelectorAll("[data-fig]")].map((e) => e.dataset.fig));
      for (const f of figs) {
        const el = page.locator(`[data-fig="${f}"]`).first();
        await el.scrollIntoViewIfNeeded();
        await page.waitForTimeout(250);
        await el.screenshot({ path: `${out}/fig-${slug(path)}-${f}-${name}-${scheme}.png` }).catch(() => {});
      }
      await ctx.close();
    }
  }
}
for (const path of pages) {
  const { ctx, page } = await open(path, SIZES.phone, { colorScheme: "dark", ...TOUCH });
  await settle(page, 844);
  // 3. Phone strip: one frame every 600 px.
  // Stop at the last position the page can scroll to, so the final frames are not the same screen twice.
  const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  await page.evaluate(() => scrollTo(0, 0));
  for (let y = 0, i = 0; y < total + 600; y += 600, i++) {
    y = Math.min(y, total);
    await glide(page, y, 8);
    await page.waitForTimeout(260);
    await page.screenshot({ path: `${out}/strip-${slug(path)}-${String(i).padStart(2, "0")}.png` });
  }
  // Small tap targets and small text, measured on the phone.
  report[`phone ${path}`] = await page.evaluate(() => {
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    };
    const label = (el) => (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 48);
    // Links and buttons, and anything else the page marks as something to press or drag with its cursor
    // (controls drawn inside figures are often plain SVG groups with a handler).
    const hand = (el) => /^(pointer|grab|move|ew-resize|ns-resize|col-resize|row-resize)$/.test(getComputedStyle(el).cursor);
    const marked = [...document.querySelectorAll("main *")].filter((el) => hand(el) && !hand(el.parentElement) && !el.closest("a, button, [role=button], summary"));
    const taps = [...new Set([...document.querySelectorAll("a, button, [role=button], summary"), ...marked])]
      .filter(vis)
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.height < 40 && r.width < 40 || r.height < 28)
      .map(({ el, r }) => `${label(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    const small = new Set();
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const el = n.parentElement;
      if (!n.textContent.trim() || !el || el.closest("svg, .fig, [data-fig], script, style, .sr-only") || !vis(el)) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px < 12) small.add(`${px}px "${n.textContent.trim().slice(0, 32)}"`);
    }
    return { smallTapTargets: taps, textUnder12px: [...small] };
  });
  await ctx.close();
}

// 4. Overflow, text, structure measurements.
for (const path of pages) {
  // 320 and 360 are narrower than the gate asks for; small phones are where one long line breaks a page.
  for (const w of [320, 360, 390, 768, 1440]) {
    const { ctx, page } = await open(path, [w, 900]);
    await settle(page, 900);
    report.overflow[`${path} @${w}`] = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth,
      ok: document.documentElement.scrollWidth <= innerWidth,
    }));
    if (w === 1440) {
      report.text[path] = await page.evaluate(() => {
        const main = document.querySelector("main") ?? document.body;
        const body = main.innerText;
        // Prose only: figures, captions, code and the citation block are not body copy.
        const clone = main.cloneNode(true);
        clone.querySelectorAll("figure, svg, pre, script, style, .sr-only, button, nav").forEach((el) => el.remove());
        const count = (t) => t.trim().split(/\s+/).filter(Boolean).length;
        // The title block (title, subtitle, byline) is not body copy either.
        const head = main.querySelector(":scope > header");
        const title = head ? count(head.textContent) : 0;
        clone.querySelector(":scope > header")?.remove();
        const prose = count(clone.textContent);
        // A reader reads the captions too, so the body's length is prose plus captions.
        const captions = [...main.querySelectorAll("figcaption")].map((c) => count(c.textContent));
        return { words: count(body), proseWords: prose, titleWords: title, captionWords: captions, body };
      });
      report[`structure ${path}`] = await page.evaluate(() => {
        const left = (sel) => [...new Set([...document.querySelectorAll(sel)].map((e) => Math.round(e.getBoundingClientRect().left)))].sort((a, b) => a - b);
        const sizes = {};
        const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          const el = n.parentElement;
          if (!n.textContent.trim() || !el || el.closest("svg, .fig, [data-fig], script, style, .sr-only")) continue;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          const px = Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10;
          sizes[px] = (sizes[px] ?? 0) + 1;
        }
        const secs = [...document.querySelectorAll("[data-section]")];
        return {
          leftEdges: { h2: left("h2"), h3: left("h3"), figures: left("[data-fig]") },
          fontSizesOutsideFigures: sizes,
          distinctFontSizes: Object.keys(sizes).length,
          sectionPaddingTop: secs.map((s) => `${s.dataset.section}: ${getComputedStyle(s).paddingTop}`),
          figures: [...document.querySelectorAll("[data-fig]")].map((e) => e.dataset.fig),
          headings: [...document.querySelectorAll("h1, h2, h3")].map((h) => `${h.tagName} ${h.textContent.trim().replace(/\s+/g, " ")}`),
        };
      });
    }
    await ctx.close();
  }
}
fs.writeFileSync(`${out}/home.txt`, report.text["/"].body);
for (const p of extra) fs.writeFileSync(`${out}/${slug(p)}.txt`, report.text[p].body);
for (const p of pages) {
  const t = report.text[p];
  const captions = t.captionWords.reduce((a, b) => a + b, 0);
  report.text[p] = { allVisibleWords: t.words, titleBlockWords: t.titleWords, proseWords: t.proseWords, captionWords: captions, bodyWords: t.proseWords + captions, note: "bodyWords is prose plus figure captions. proseWords leaves out the title block, figures, code, buttons and navigation; allVisibleWords counts every word in <main>, including plot labels" };
}

// 5. Without JavaScript, and with reduced motion.
for (const [tag, opts] of [["nojs", { javaScriptEnabled: false }], ["reduced-motion", { reducedMotion: "reduce" }]]) {
  const { ctx, page } = await open("/", SIZES.desktop, opts);
  // Wheel down the whole page first, as a reader would, so lazy images are loaded
  // before the photograph; a full-page capture alone never brings them into view.
  // (The wheel works without JavaScript, where the page cannot be asked to scroll.)
  for (let i = 0; i < 60; i++) {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(600);
  await page.mouse.wheel(0, -60000);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${tag}-full.png`, fullPage: true });
  await ctx.close();
}

// 6. Theme behaviour: opens at night whatever the system says; a choice persists with no flash.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  const page = await ctx.newPage();
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.evaluate(() => scrollTo(0, innerHeight * 2.5));
  await page.waitForTimeout(500);
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const theme = { systemSchemeEmulated: "light", defaultTheme: await page.evaluate(() => document.documentElement.dataset.theme), defaultBackground: await bg() };
  const toggle = page.locator("[data-theme-toggle]").first();
  theme.toggleFound = (await toggle.count()) > 0;
  if (theme.toggleFound) {
    await toggle.click();
    await page.waitForTimeout(700);
    theme.afterToggle = { theme: await page.evaluate(() => document.documentElement.dataset.theme), background: await bg() };
    // Flash check: the theme attribute and background on the very first frame after a reload.
    await page.addInitScript(() => {
      requestAnimationFrame(() => (window.__first = document.documentElement.dataset.theme + " / " + getComputedStyle(document.documentElement).backgroundColor));
    });
    await page.reload({ waitUntil: "networkidle" });
    theme.firstFrameAfterReload = await page.evaluate(() => window.__first);
    theme.afterReload = { theme: await page.evaluate(() => document.documentElement.dataset.theme), background: await bg() };
    theme.persists = theme.afterReload.theme === theme.afterToggle.theme;
  }
  report.theme = theme;
  await ctx.close();
}
for (const scheme of ["light", "dark"]) {
  const { ctx, page } = await open("/", SIZES.desktop, { colorScheme: scheme });
  await page.evaluate(() => scrollTo(0, innerHeight * 2.5));
  await page.waitForTimeout(300);
  report[`contrast ${scheme}`] = await page.evaluate(() => {
    const parse = (c) => (c.match(/[\d.]+/g) ?? []).map(Number);
    const lum = (c) => {
      const [r, g, b] = c.map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const backdrop = (el) => {
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c.length && (c[3] ?? 1) > 0.9) return c;
      }
      return parse(getComputedStyle(document.body).backgroundColor);
    };
    const rows = { pageBackground: getComputedStyle(document.body).backgroundColor };
    for (const sel of ["main .body p", "main .meta", "main .tags", "main figcaption", "main .sec-h p", "h2", "h3"]) {
      const el = [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0);
      if (!el) continue;
      const bg = backdrop(el);
      const c = parse(getComputedStyle(el).color);
      const a = c[3] ?? 1;
      const fg = [0, 1, 2].map((i) => c[i] * a + bg[i] * (1 - a));
      const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      rows[sel] = +((hi + 0.05) / (lo + 0.05)).toFixed(2);
    }
    return rows;
  });
  await ctx.close();
}

// 7. Command palette, keyboard only.
{
  const { ctx, page } = await open("/", SIZES.desktop);
  const pal = { opened: false };
  await page.evaluate(() => document.querySelector("header a")?.focus());
  const before = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80));
  await page.keyboard.press("Meta+k");
  await page.waitForTimeout(350);
  const dialog = page.locator("[role=dialog]");
  pal.opened = (await dialog.count()) > 0 && (await dialog.first().isVisible());
  if (!pal.opened) {
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(350);
    pal.opened = (await dialog.count()) > 0 && (await dialog.first().isVisible());
  }
  if (pal.opened) {
    pal.ariaModal = await dialog.first().getAttribute("aria-modal");
    pal.label = (await dialog.first().getAttribute("aria-label")) ?? (await dialog.first().getAttribute("aria-labelledby"));
    pal.commands = await page.evaluate(() => [...document.querySelectorAll("[role=dialog] [role=option]")].map((o) => o.textContent.trim().replace(/\s+/g, " ")));
    pal.focusInside = await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]"));
    await page.keyboard.type("research");
    await page.waitForTimeout(200);
    pal.filtered = await page.evaluate(() => [...document.querySelectorAll("[role=dialog] [role=option]")].filter((o) => o.getBoundingClientRect().height > 0).map((o) => o.textContent.trim().replace(/\s+/g, " ")));
    const y0 = await page.evaluate(() => scrollY);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1400);
    pal.enterActed = { closed: !(await dialog.first().isVisible().catch(() => false)), scrolledBy: (await page.evaluate(() => scrollY)) - y0, url: page.url() };
    await page.keyboard.press("Meta+k");
    await page.waitForTimeout(300);
    for (let i = 0; i < 30; i++) await page.keyboard.press("Tab");
    pal.focusTrapped = await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]"));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    pal.escapeCloses = !(await dialog.first().isVisible().catch(() => false));
    pal.focusAfterClose = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80));
    pal.focusBeforeOpen = before;
  }
  report.palette = pal;
  const index = await page.evaluate(() => {
    const nav = document.querySelector("[data-index]");
    return nav ? { found: true, links: [...nav.querySelectorAll("a")].map((a) => `${a.textContent.trim() || a.getAttribute("aria-label")} -> ${a.getAttribute("href")}`) } : { found: false };
  });
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight * 0.5));
  await page.waitForTimeout(600);
  index.currentAtHalfway = await page.evaluate(() => document.querySelector("[data-index] [aria-current]")?.textContent.trim() ?? document.querySelector("[data-index] [aria-current]")?.getAttribute("aria-label") ?? null);
  report.sectionIndex = index;
  await ctx.close();
}

fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log(`evidence written to ${out}`);
const bad = Object.entries(report.errors).filter(([, v]) => v.length);
if (bad.length) console.log("ERRORS:\n" + bad.map(([k, v]) => `${k}: ${[...new Set(v)].join(" | ")}`).join("\n"));
await browser.close();
