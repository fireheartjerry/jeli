// Record, measure and lay out every take in the manifest.
//
//   npx astro build --outDir .qa/dist        a fixed copy of the site
//   node tools/qa/serve.mjs                  serve it (port 4410)
//   node tools/qa/run.mjs                    every take
//   node tools/qa/run.mjs home.fig home.load only takes whose id starts with one of these
//   QA_JOBS=4 node tools/qa/run.mjs          how many pages record at once
//
// Or, with no server to look after (and room for several people at once):
//   npx astro build --outDir .qa/dist-me
//   QA_DIST=.qa/dist-me QA_OUT=.qa/me node tools/qa/run.mjs home.fig.ratings
//
// Each take leaves .qa/seq/<id>/ with every frame, frames.json (what the page
// reported at each frame), analysis.json (what changed between frames, and
// every flag) and contact sheets. .qa/ledger.json and .qa/ledger.md list all
// takes with their flags, and what on the page no take covers.
import fs from "node:fs";
import path from "node:path";
import { launch, open, recorder, moves, geometry, OUT, site } from "./lib.mjs";
import { serve } from "./serve.mjs";
import { takes, perEntry, perFigure, HOME, PAPER } from "./manifest.mjs";
import { analyze } from "./analyze.mjs";
import { sheets } from "./sheet.mjs";

const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const jobs = +(process.env.QA_JOBS ?? 3);
const own = process.env.QA_DIST ? await serve(process.env.QA_DIST) : null;
if (own) site.base = `http://localhost:${own.port}`;
fs.mkdirSync(OUT, { recursive: true });
const browser = await launch();

// Takes that depend on what is on the page: one per entry and per figure.
async function discover() {
  const out = [];
  for (const [url, prefix, view] of [[HOME, "home", "desk"], [PAPER, "paper", "desk"], [HOME, "phone", "phone"]]) {
    const { ctx, page } = await open(browser, { url, view });
    const m = moves(page, { rows: [], shoot: async () => {} });
    await m.run(1);
    const g = await geometry(page);
    if (view === "desk") out.push(...(await perEntry(url, prefix)(g)));
    out.push(...(await perFigure(url, prefix, view)(g)));
    out.push({ g, url, view, inventory: true });
    await ctx.close();
  }
  return out;
}

const found = await discover();
const inventory = found.filter((t) => t.inventory);
const all = [...takes, ...found.filter((t) => !t.inventory)];
const chosen = only.length ? all.filter((t) => only.some((p) => t.id.startsWith(p))) : all;
console.log(`${chosen.length} of ${all.length} takes, ${jobs} at a time`);

async function record(t) {
  const started = Date.now();
  const { ctx, page, errors } = await open(browser, { url: t.url, view: t.view, scheme: t.scheme });
  const rec = recorder(t.id);
  let failed = null;
  try {
    // A take about one element records that element's box with every frame;
    // the measurements and the sheets are then made of the element alone.
    const track = { ...t.track, ...(t.focus ? { focus: t.focus } : {}) };
    if (Object.keys(track).length) await page.evaluate((map) => window.__qa.track(map), track);
    const m = moves(page, rec);
    // Let the page take its first frames so there is geometry to plan from, without anything having played.
    const g = await geometry(page);
    await t.run({ page, m, g, rec });
  } catch (e) {
    failed = String(e?.message ?? e).split("\n")[0];
  }
  rec.save({ url: t.url, view: t.view, scheme: t.scheme, about: t.about, covers: t.covers });
  await ctx.close();
  if (!rec.rows.length) return { id: t.id, about: t.about, covers: t.covers ?? [], frames: 0, failed: failed ?? "no frames", errors };
  const a = await analyze(rec.dir);
  const files = await sheets(rec.dir, {});
  return { id: t.id, url: t.url, view: t.view, scheme: t.scheme, about: t.about, covers: t.covers ?? [], frames: a.frames, seconds: a.seconds, moving: a.moving, change: a.change, counts: a.counts, flags: a.flags.slice(0, 40), traces: a.traces, sheets: files.map((f) => path.relative(OUT, f)), errors: [...new Set(errors)], failed, took: +((Date.now() - started) / 1000).toFixed(1) };
}

const results = [];
const queue = [...chosen];
await Promise.all(
  Array.from({ length: jobs }, async () => {
    for (let t; (t = queue.shift()); ) {
      const r = await record(t);
      results.push(r);
      console.log(`${r.failed ? "FAIL" : "ok  "} ${r.id.padEnd(34)} ${String(r.frames).padStart(4)} frames  ${JSON.stringify(r.counts ?? {})}${r.errors?.length ? "  errors: " + r.errors.length : ""}${r.failed ? "  " + r.failed : ""}`);
    }
  }),
);
await browser.close();

// ---- the ledger: what was recorded, what was flagged, and what nothing covers ----
const file = path.join(OUT, "ledger.json");
const before = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { takes: {} };
for (const r of results) before.takes[r.id] = { ...r, at: new Date().toISOString(), looked: before.takes[r.id]?.looked ?? null };
// A take that is no longer in the manifest is dropped; its frames stay on disk until the next clean.
for (const id of Object.keys(before.takes)) if (!all.some((t) => t.id === id)) delete before.takes[id];

const covered = new Set(Object.values(before.takes).flatMap((t) => (t.frames ? t.covers : [])));
const has = (key) => covered.has(key) || [...covered].some((c) => c.endsWith("*") && key.startsWith(c.slice(0, -1)));
const missing = [];
for (const inv of inventory) {
  for (const f of inv.g.figs) if (!has(`fig:${f.name}`)) missing.push(`${inv.url} (${inv.view}): figure "${f.name}"`);
}
// Every kind of arrival the pages use must be the subject of some take.
{
  const { ctx, page } = await (async () => {
    const b = await launch();
    const o = await open(b, { url: HOME });
    o.b = b;
    return o;
  })().catch(() => ({}));
  if (page) {
    const kinds = await page.evaluate(() => [...new Set([...document.querySelectorAll("[data-reveal]")].map((e) => e.dataset.reveal))]);
    for (const k of kinds) if (!has(`reveal:${k}`)) missing.push(`arrival kind "${k}"`);
    await ctx.browser().close();
  }
}
before.missing = missing;
before.totals = Object.values(before.takes).reduce((m, t) => ((m.takes++, (m.frames += t.frames ?? 0)), Object.entries(t.counts ?? {}).forEach(([k, v]) => (m[k] = (m[k] ?? 0) + v)), m), { takes: 0, frames: 0 });
fs.writeFileSync(file, JSON.stringify(before, null, 1));

const rows = Object.values(before.takes).sort((a, b) => a.id.localeCompare(b.id));
const md = [
  "# Frame-by-frame ledger",
  "",
  `${before.totals.takes} takes, ${before.totals.frames} frames, every frame measured. Flags: ${["blank", "held", "jump", "kink", "back", "shift"].map((k) => `${before.totals[k] ?? 0} ${k}`).join(", ")}.`,
  "",
  missing.length ? `Not covered by any take:\n${missing.map((m) => `- ${m}`).join("\n")}` : "Every figure and every kind of arrival on the pages is covered by at least one take.",
  "",
  "| take | view | frames | moving | flags | looked at | errors |",
  "|---|---|---|---|---|---|---|",
  ...rows.map((t) => `| ${t.id} | ${t.view ?? ""}${t.scheme === "light" ? " day" : ""} | ${t.frames} | ${t.moving ?? ""} | ${Object.entries(t.counts ?? {}).map(([k, v]) => `${v} ${k}`).join(", ") || (t.failed ? "FAILED: " + t.failed : "none")} | ${t.looked ?? "sheets not yet looked at"} | ${t.errors?.length || ""} |`),
  "",
  ...(() => {
    // What tools/qa/live.mjs recorded in real time: one page giving way to another.
    const f = path.join(OUT, "live.json");
    if (!fs.existsSync(f)) return ["Page-to-page transitions: not recorded (run tools/qa/live.mjs)."];
    const live = JSON.parse(fs.readFileSync(f, "utf8"));
    return [
      "## Page to page, in real time",
      "",
      "Recorded from the compositor as it happened (tools/qa/live.mjs), not stepped: frame spacing is uneven. Brightness is the mean of the window under the bar, 0 to 255.",
      "",
      "| crossing | frames | ends | over the brighter end | under the darker end | largest step | flags |",
      "|---|---|---|---|---|---|---|",
      ...Object.entries(live).map(([k, v]) => `| ${k} | ${v.frames} | ${v.ends.join(" to ")} | ${v.over} | ${v.under} | ${v.step} | ${v.flags.length ? v.flags.length + " " + v.flags[0].kind : "none"} |`),
    ];
  })(),
  "",
];
fs.writeFileSync(path.join(OUT, "ledger.md"), md.join("\n"));
own?.close();
console.log(`\n${before.totals.takes} takes, ${before.totals.frames} frames in ${path.relative(process.cwd(), OUT) || "."}. Not covered: ${missing.length ? missing.length + " items (see ledger.md)" : "nothing"}.`);
