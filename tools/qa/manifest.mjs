// Every animation on the site, as a list of takes. A take opens a fresh page
// on the virtual clock, does one thing to it, and records every frame.
//
// The ledger (run.mjs) checks this list against the page itself: every figure
// and every block that arrives in motion must appear in at least one take, so
// a new animation cannot be added without the tools noticing it is not covered.
import { geometry } from "./lib.mjs";

const HOME = "/";
const PAPER = "/research/verifying-the-second-agent";

/** The middle of an element, in the window. */
const centre = (page, sel, nth = 0) =>
  page.evaluate(
    ([sel, nth]) => {
      const el = document.querySelectorAll(sel)[nth];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, left: r.x, top: r.y };
    },
    [sel, nth],
  );

const takes = [];
const take = (t) => takes.push({ view: "desk", scheme: "dark", url: HOME, ...t });

// ---------------------------------------------------------------- the cover
take({
  id: "home.load",
  covers: ["cover:intro"],
  about: "The opening, from the first frame: the scene comes up, the name rises, the ledger arrives.",
  track: { name: "[data-hero] h1", ledger: "[data-hero] .ledger", legend: "[data-hero] .legend" },
  run: async ({ m }) => m.hold(6.5, "load"),
});
take({
  id: "home.cover.build",
  covers: ["cover:scroll", "voyage:depart"],
  about: "Scrolling through the held cover (the build and pull-back), and on through the departure.",
  track: { name: "[data-hero] h1", about: "#about h2" },
  run: async ({ m, g }) => {
    await m.run(5.5);
    await m.scroll(g.coverEnd, 300, "build");
    await m.scroll(g.coverEnd + g.vh * 1.25, 300, "depart");
    await m.hold(1, "rest");
  },
});
take({
  id: "home.cover.wheel",
  covers: ["cover:scroll", "scroll:wheel"],
  about: "The same stretch turned by a mouse wheel in notches: what the glide does to a stepped input.",
  track: { name: "[data-hero] h1" },
  run: async ({ m, page }) => {
    await m.run(5.5);
    await m.point(720, 450);
    await m.wheel(10, 120, 5, 1.6);
  },
});
take({
  id: "home.cover.pointer",
  covers: ["cover:lean", "cover:drag"],
  about: "The pointer leaning the camera, then a drag that swings it, a release, and the return to its mark.",
  run: async ({ m }) => {
    await m.run(5.5);
    await m.point(300, 300);
    await m.glide(1300, 620, 1.0, "lean");
    await m.hold(0.6, "lean:settle");
    await m.glide(1000, 300, 0.3, "to-drag");
    await m.down();
    await m.glide(640, 340, 0.6, "drag");
    await m.up();
    await m.hold(4, "release");
  },
});
take({
  id: "home.cover.hover",
  covers: ["hover:nav", "hover:ledger"],
  about: "The header links and the five facts along the foot of the cover, under the pointer.",
  run: async ({ m, page }) => {
    await m.run(5.5);
    for (const sel of ["[data-bar] nav a.q", "[data-hero] .ledger a"]) {
      const n = await page.locator(sel).count();
      for (let i = 0; i < n; i++) {
        const c = await centre(page, sel, i);
        if (!c || c.w === 0) continue;
        await m.glide(c.x, c.y, 0.18, `to:${sel.split(" ").pop()}#${i}`);
        await m.hold(0.4, `on:${sel.split(" ").pop()}#${i}`);
      }
      await m.glide(720, 300, 0.2, "off");
      await m.hold(0.4, "off");
    }
  },
});

// ------------------------------------------------------------- the whole page
take({
  id: "home.voyage",
  covers: ["voyage:depart", "voyage:cruise", "voyage:arrive", "rail", "crumb", "reveal:*"],
  about: "The whole page at a steady reading scroll: the camera's full take, and every arrival in passing.",
  track: { mark: "[data-mark]", crumb: "[data-crumb]" },
  run: async ({ m, g }) => {
    await m.run(5.5);
    await m.scroll(g.max, 1500, "voyage");
    await m.hold(1.5, "home");
  },
});
take({
  id: "home.about",
  covers: ["reveal:title", "reveal:read"],
  about: "The About section: its title by the letter, and the paragraphs read into as they cross the window.",
  track: { h2: "#about h2" },
  run: async ({ m, g }) => {
    const s = g.sections.find((s) => s.id === "about");
    await m.place(s.y - g.vh * 1.02);
    await m.scroll(s.y + s.h - g.vh * 0.3, 340, "about");
    await m.hold(0.8, "rest");
  },
});
for (const id of ["work", "research", "projects", "record"]) {
  take({
    id: `home.section.${id}`,
    covers: ["reveal:title", "crumb"],
    about: `The ${id} heading arriving, and the header's breadcrumb rolling over to it.`,
    track: { h2: `#${id} h2`, lede: `#${id} .sec-h p`, crumb: "[data-crumb]" },
    run: async ({ m, g }) => {
      const s = g.sections.find((s) => s.id === id);
      await m.place(s.y - g.vh * 1.02);
      await m.scroll(s.y - g.vh * 0.2, 420, id);
      await m.hold(1.4, "rest");
    },
  });
}
take({
  id: "home.record.rows",
  covers: ["reveal:rows"],
  about: "The record's rows arriving one after the next, each with its rule.",
  run: async ({ m, g }) => {
    const s = g.sections.find((s) => s.id === "record");
    await m.place(s.y - g.vh * 0.9);
    await m.scroll(s.y + g.vh * 0.1, 420, "rows");
    await m.hold(1.8, "rest");
  },
});

// One take per entry (its type arriving) and per figure (its plate drawn, its
// own scroll story, then two seconds at rest for whatever keeps moving).
export const perEntry = (url, prefix) => async (g) =>
  g.entries.map((e) => ({
    id: `${prefix}.entry.${e.i}`,
    url,
    view: "desk",
    scheme: "dark",
    covers: ["reveal:entry", "entry:rule"],
    about: `Entry ${e.i} (${e.title}): its rule drawing across, and its type arriving line by line.`,
    run: async ({ m, g }) => {
      const en = g.entries[e.i];
      await m.place(en.y - g.vh * 1.02);
      await m.scroll(en.y - g.vh * 0.25, 420, "entry");
      await m.hold(1.5, "rest");
    },
  }));
export const perFigure = (url, prefix, view = "desk") => async (g) =>
  g.figs.flatMap((f) => [
    {
      id: `${prefix}.fig.${f.name}`,
      url,
      view,
      scheme: "dark",
      covers: [`fig:${f.name}`, "reveal:plate"],
      about: `Figure "${f.name}": the plate drawn round, the figure's scroll story start to finish, then at rest.`,
      focus: `[data-fig="${f.name}"]`,
      run: async ({ m, g }) => {
        const fig = g.figs.find((x) => x.name === f.name);
        await m.place(Math.max(0, fig.y - g.vh * 1.04));
        await m.scroll(Math.min(g.max, fig.y + fig.h - g.vh * 0.3), 380, "story");
        await m.hold(2, "rest");
      },
    },
    ...(view === "desk"
      ? [
          {
            id: `${prefix}.fig.${f.name}.pointer`,
            url,
            view,
            scheme: "dark",
            covers: [`fig:${f.name}:pointer`],
            about: `Figure "${f.name}" under the pointer: a sweep across the plot and off again.`,
            focus: `[data-fig="${f.name}"]`,
            run: async ({ m, g, page }) => {
              const fig = g.figs.find((x) => x.name === f.name);
              // Finished and at rest in the middle of the window.
              await m.place(Math.max(0, Math.min(g.max, fig.y + fig.h / 2 - g.vh / 2)), 3);
              const c = await centre(page, `[data-fig="${f.name}"] .plot`);
              if (!c) return;
              await m.point(c.left - 30, c.top + c.h * 0.3);
              await m.glide(c.left + c.w * 0.25, c.top + c.h * 0.35, 0.35, "in");
              await m.glide(c.left + c.w * 0.8, c.top + c.h * 0.65, 1.1, "across");
              await m.hold(0.4, "on");
              await m.glide(c.left + c.w + 60, c.top + c.h * 0.5, 0.3, "out");
              await m.hold(0.6, "after");
            },
          },
        ]
      : []),
  ]);

// ----------------------------------------------------------------- the footer
take({
  id: "home.footer",
  covers: ["voyage:arrive", "footer:address", "footer:pulse", "hover:nav"],
  about: "Coming home: the camera's return, the address arriving, the weight wave under the pointer, and a copy that sends a pulse up the beam.",
  track: { mail: "[data-foot] .mail" },
  run: async ({ m, g, page }) => {
    await m.place(g.max - g.vh * 1.7);
    await m.scroll(g.max, 380, "arrive");
    await m.hold(1.2, "home");
    const c = await centre(page, "[data-foot] .mail");
    if (c) {
      await m.point(c.left - 40, c.y - 60);
      await m.glide(c.left + 20, c.y, 0.3, "to-mail");
      await m.glide(c.left + c.w - 20, c.y, 1.2, "wave");
      await m.glide(c.left + c.w * 0.5, c.y, 0.5, "wave:back");
      await m.click("copy");
      await m.hold(2.4, "pulse");
      await m.glide(c.left + c.w * 0.5, c.y - 200, 0.3, "leave");
      await m.hold(0.8, "after");
    }
  },
});

// -------------------------------------------------------- things that are pressed
take({
  id: "home.theme",
  covers: ["theme"],
  about: "Day and night, switched mid-page and switched back.",
  run: async ({ m, g, page }) => {
    await m.place(g.coverEnd + g.vh * 2.4, 2.5);
    const c = await centre(page, "[data-theme-toggle]");
    await m.point(c.x, c.y);
    await m.click("to-day");
    await m.hold(1.4, "to-day");
    await m.click("to-night");
    await m.hold(1.4, "to-night");
  },
});
take({
  id: "home.theme.cover",
  covers: ["theme"],
  about: "The same switch made on the cover, which is night in both themes.",
  run: async ({ m, page }) => {
    await m.run(5.5);
    const c = await centre(page, "[data-theme-toggle]");
    await m.point(c.x, c.y);
    await m.click("to-day");
    await m.hold(1.4, "to-day");
    await m.click("to-night");
    await m.hold(1.4, "to-night");
  },
});
take({
  id: "home.palette",
  covers: ["palette", "nav:cut"],
  about: "The command palette opening, filtering, and sending the page to a far section: a cut, not a scroll.",
  run: async ({ m, page }) => {
    await m.run(5.5);
    await page.keyboard.press("Control+K");
    await m.hold(0.6, "open");
    for (const ch of "rec") {
      await page.keyboard.type(ch);
      await m.hold(0.12, "type");
    }
    await m.hold(0.3, "typed");
    await page.keyboard.press("Enter");
    await m.hold(1.8, "cut");
  },
});
take({
  id: "home.nav.glide",
  covers: ["nav:glide"],
  about: "A link to a near section: the page glides there.",
  run: async ({ m, g, page }) => {
    const s = g.sections.find((s) => s.id === "about");
    await m.place(s.y - 80, 2.5);
    const c = await centre(page, '#about a[href="#work"]');
    if (!c) return;
    await m.point(c.x, c.y);
    await m.click("go");
    await m.hold(1.8, "glide");
  },
});
take({
  id: "home.copy",
  covers: ["copy"],
  about: "The header's Email button pressed: the label swaps for a drawn tick and back.",
  focus: "[data-bar]",
  run: async ({ m, page }) => {
    await m.run(5.5);
    await page.context().grantPermissions(["clipboard-write", "clipboard-read"]).catch(() => {});
    const c = await centre(page, "[data-bar] a[data-copy]");
    await m.point(c.x, c.y);
    await m.click("copy");
    await m.hold(2.4, "copied");
  },
});

// ------------------------------------------------------------------ the paper
take({ id: "paper.load", url: PAPER, covers: ["paper:intro", "reveal:title"], about: "The paper page opening: the scene already under way, the title arriving.", track: { h1: "main h1" }, run: async ({ m }) => m.hold(3.5, "load") });
take({
  id: "paper.voyage",
  url: PAPER,
  covers: ["voyage:cruise", "voyage:arrive", "reveal:prose"],
  about: "The paper page top to bottom: prose arriving block by block, and the camera coming home.",
  run: async ({ m, g }) => {
    await m.run(2.5);
    await m.scroll(g.max, 1100, "voyage");
    await m.hold(1.5, "home");
  },
});
// One page giving way to another is not recorded here. With the clock held,
// Chrome draws every picture of the page being left as a white sheet, so a
// cross-document transition cannot be stepped. tools/qa/live.mjs records those
// in real time instead, and the ledger lists what it found.

// -------------------------------------------------------------- the lost page
take({ id: "lost.load", url: "/404", covers: ["lost"], about: "The 404 page: one whole departure on a hyperbolic orbit.", run: async ({ m }) => m.hold(9, "orbit") });

// ---------------------------------------------------------------------- phone
take({ id: "phone.load", view: "phone", covers: ["cover:intro"], about: "The opening on a phone.", run: async ({ m }) => m.hold(6, "load") });
take({
  id: "phone.cover.build",
  view: "phone",
  covers: ["cover:scroll", "voyage:depart"],
  about: "The held cover and the departure on a phone, where the scene is a band above the type.",
  run: async ({ m, g }) => {
    await m.run(5.5);
    await m.scroll(g.coverEnd, 300, "build");
    await m.scroll(g.coverEnd + g.vh * 1.3, 300, "depart");
    await m.hold(1, "rest");
  },
});
take({
  id: "phone.voyage",
  view: "phone",
  covers: ["voyage:cruise", "voyage:arrive", "reveal:*"],
  about: "The whole page on a phone at a steady scroll.",
  run: async ({ m, g }) => {
    await m.run(5.5);
    await m.scroll(g.max, 1500, "voyage");
    await m.hold(1.5, "home");
  },
});
take({
  id: "phone.footer",
  view: "phone",
  covers: ["voyage:arrive", "footer:address"],
  about: "Coming home on a phone.",
  run: async ({ m, g }) => {
    await m.place(g.max - g.vh * 1.7);
    await m.scroll(g.max, 380, "arrive");
    await m.hold(1.5, "home");
  },
});

// ------------------------------------------------------------------------ day
take({
  id: "day.voyage",
  scheme: "light",
  covers: ["voyage:cruise", "theme"],
  about: "The whole page by day: paper between a night cover and a night footer.",
  run: async ({ m, g }) => {
    await m.run(5.5);
    await m.scroll(g.max, 1500, "voyage");
    await m.hold(1.2, "home");
  },
});

export { takes, geometry, HOME, PAPER };
