# Figure contract for yuzeli.ca (read fully before writing code)

Repo: ~/Code/jeli (branch `redesign`), Astro 7 + GSAP 3.15 + TypeScript. A dev server is ALREADY running
at http://localhost:4321 with HMR. Do not start, stop or restart it. Do not commit. Do not run `npm i` except
where your brief explicitly allows a package.

## Read these first
- src/styles/global.css: tokens (--paper, --panel, --ink, --ink-2, --ink-3, --ink-4, --hair, --accent #2743d6, --accent-soft, --sans, --math, --cm)
- src/components/Figure.astro: the plate chrome + shared SVG stroke classes (.ink .faint .hair .dash .accent .dot .dot-accent .fill-accent-soft .paper, text / text.m / text.cm / text.strong / text.acc)
- src/scripts/motion.ts: helpers `gsap`, `ScrollTrigger`, `undraw`, `draw`, `scrubbed(trigger, vars)`, `q`, `qa`, `reducedMotion`
- src/scripts/figures.ts: lazy loader. An element with `data-fig="<name>"` loads `src/scripts/figures/<name>.ts` (default export `(root: HTMLElement) => void`) when it nears the viewport; never under prefers-reduced-motion.
- Reference implementations: src/components/figures/Submissions.astro + src/scripts/figures/submissions.ts, and src/components/Hero.astro + src/scripts/hero.ts (+ src/scripts/binary.ts).

## Contract
1. Component: `src/components/figures/<Pascal>.astro`, wrapping `<Figure name="<name>" n={N} title="..." label="accessible description" readout="initial readout">`. Slot content is ONE `<svg viewBox="0 0 640 H" role="img" aria-label="...">` (or a `<canvas>` where your brief says so) plus optionally `<Fragment slot="caption">...</Fragment>`.
2. Geometry is computed at build time in the frontmatter where possible. The server-rendered SVG must be the FINAL, fully drawn state, so readers without JS or with reduced motion see the finished figure.
3. Script: `src/scripts/figures/<name>.ts`. On init it undraws / resets to the start state, then builds a timeline with `scrubbed(root)` (scroll-scrubbed, reverses on scroll-up). Write live values into `root.querySelector("[data-readout]")`.
4. Ambient loops (things that move on their own) are allowed only via `gsap.ticker`, and must pause while the figure is offscreen (IntersectionObserver) or `document.hidden`.
5. Performance: animate only transform, opacity, stroke-dashoffset, or SVG attributes on a few elements. Keep each figure under ~400 DOM nodes (use canvas if you need more). No layout reads inside per-frame loops except cached values.
6. Visual language (this is the whole brand, obey it):
   - Thin lines: ink at 1–1.25px, secondary in --ink-4, hairlines in --hair. ONE accent colour (--accent) reserved for the result / the key moving part. Accent-soft only for tiny areas.
   - Labels: sans 11px --ink-3; math in `<text class="m">` (Computer Modern italic); numbers in `text.cm`.
   - NO gradients, drop shadows, glows, emojis, icon libraries, logos, or nested "cards". No blur-in fades. No bouncy easing on data. Motion should feel like an instrument drawing, precise and calm, not like a SaaS landing page.
   - Everything must depict the REAL mechanism or REAL data of the thing (your brief gives the facts). Never invent metrics.
7. Copy (captions, labels): plain and specific, sentence case, NO em dashes, no hype words ("seamless", "powerful", "cutting-edge"), no rhetorical contrasts.
8. Responsive: the plate is ~640px wide on desktop and shrinks to ~340px on phones. Text inside the SVG must stay legible at 340px (min ~10px effective), so don't cram labels.
9. Only create/modify YOUR files: the component(s), the script(s), and a lab page per figure. Don't touch shared files (Figure.astro, motion.ts, figures.ts, global.css, index.astro, Hero, other figures). If you need a shared change, describe it in your report.

## Lab page and verification (required)
Create `src/pages/lab/<name>.astro`:
```astro
---
import Base from "../../layouts/Base.astro";
import X from "../../components/figures/X.astro";
---
<Base title="lab: <name>">
  <div style="height:70vh"></div>
  <div class="wrap" style="max-width:720px"><X /></div>
  <div style="height:120vh"></div>
  <script>import "../../scripts/figures";</script>
</Base>
```
Verify with headless Chromium (not the app's browser pane):
`URL=http://localhost:4321/lab/<name> OUT=/tmp/shots-<name> node tools/shoot.mjs 1440 900 0 0.5 0.9 1.3`
and `... node tools/shoot.mjs 390 844 0 0.5 0.9 1.3` for mobile. Look at every PNG with the Read tool. It prints console ERRORS at the end; there must be none. Iterate until the figure looks genuinely excellent at start, middle and end of the scroll, and at 390px.
Also run `npx astro check` (must be 0 errors) before reporting.

## Report back
Files created; for each figure: what it depicts, how the scroll timeline and any ambient motion work, final screenshot paths (desktop end state + mobile), and any shared-file change you need.

---

# v2 upgrades (read this too; it overrides anything above where they conflict)

The bar is now much higher: every figure must look like a flagship product illustration (think Stripe,
Linear and Vercel launch pages, and sarsa.app's hero), while staying honest to the real mechanism.

## New shared tools (already implemented; use them, don't reimplement)
- `Figure.astro` props: `size="stage"` for a full-width plate (plot area ~1130px wide on desktop; author such
  plots at viewBox width 1200), and `screen` to put the plot on an inset dot-grid surface with corner
  registration marks. The header now has a status light that pulses while the figure holds the middle of the
  screen (automatic).
- Palette classes: strokes `.s-blue .s-red .s-green .s-violet .s-amber`, fills `.f-*`, soft tints `.t-*`, and
  `.inset` (panel-2 fill + hairline stroke) for inner surfaces like windows, cards and screens. The accent
  (`--accent`, same as blue) stays the hero colour; use the others to separate series and states, sparingly.
- `motion.ts`: `whileVisible(root, fn(dt, t))` for any ambient loop (auto-pauses offscreen / hidden tab);
  `packets(root, layer, path, {n, speed, r, cls, active})` for dots flowing along a path; `phase(p, a, b)` for
  scrubbed sub-phases; plus the existing `scrubbed`, `undraw`, `draw`, `q`, `qa`.

## Quality bar for every figure
1. Layered composition: a quiet background layer (grid/axes/frames), a structural layer, foreground moving
   parts, and an annotation layer (small labels with hairline leader lines, dimension marks, callouts).
   Dense with precise, real detail; nothing generic or placeholder-looking (no empty grey bars standing in for text
   unless they read clearly as a UI skeleton on purpose).
2. Motion in three registers:
   - Scroll story: a scrubbed timeline with several concurrent tracks (not one thing at a time), clear beats,
     and a satisfying end state. Reverses cleanly.
   - Ambient life: once a beat has played, something keeps gently working (packets, cursors, blinking caret,
     live counters, rotating bodies), always through `whileVisible`.
   - Pointer: where natural, hover/drag to inspect (crosshair with values, highlight a series, scrub a timeline).
     Must also work on touch, and never block page scroll.
3. Easing: data draws linear; UI elements power3/expo out; no bounce/elastic. Durations feel deliberate.
4. Colour: mostly ink; accent for the protagonist; at most two palette colours for series/state.
5. Budget: up to ~700 SVG nodes, or use canvas. No per-frame allocations. 60fps on a laptop.
6. The server-rendered SVG is still the finished state (no-JS / reduced motion).
7. Mobile (390px): must remain legible and uncluttered; hide secondary annotations under 560px if needed.
