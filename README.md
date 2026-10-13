# yuzeli.ca

Jerry Li's personal site. Astro, GSAP, a little WebGL, no framework runtime.

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
```

## How it's put together

- `src/pages/index.astro` is the home page; copy lives there. `src/pages/research/` holds the short
  version of the NeurIPS paper. `src/data/paper.ts` is the one place the paper's title, venue and
  BibTeX are written down.
- The cover (`src/components/Hero.astro`, `src/scripts/hero.ts`, `src/scripts/cosmos.ts`) is a live
  WebGL scene: the Solar System with a Dyson swarm going up at 1 AU. Everything is generated from
  one seed, and every body moves on a Kepler orbit solved in the vertex shader, so 60,000
  collectors cost the CPU nothing per frame. Scrolling builds the sphere. The shafts and bloom come
  from a second small pass: the light sources drawn alone, with every collector standing in the
  way, smeared outward from the Sun. A machine that cannot hold the frame rate gives up sharpness
  first, then that pass. `tools/cover.mjs` renders the stills used without JavaScript or WebGL, and
  in the footer.
- Every other figure is a plate (`src/components/Figure.astro`) around one SVG or canvas. The SVG
  is rendered at build time in its finished state, so the page reads without JavaScript and under
  `prefers-reduced-motion`. `src/scripts/figures.ts` lazy-loads `src/scripts/figures/<name>.ts` for
  each `[data-fig]` as it nears the viewport. `tools/FIGURES.md` is the contract a new figure follows.
- The binary-star landscape in Research (`src/scripts/roche3d.ts`, `src/scripts/sky.ts`) draws the
  Roche potential with a floating-horizon hidden-line pass and integrates the gas stream from the
  restricted three-body equations. `src/pages/roche.svg.ts` renders the same code to a still.
- Themes: night by default, day on request (`src/scripts/theme.ts`; tokens in
  `src/styles/global.css`). Figures take every colour from tokens, and canvas figures re-read them
  on the `themechange` event.
- `src/components/Palette.astro` is the Cmd+K palette. `src/components/Header.astro` holds the
  section index down the left edge.
- `src/data/topsoj.json` holds aggregate, anonymised TopsOJ statistics.
- `docs/criteria/claims.md` lists every number on the site and where it comes from.

## Résumé

`resume/resume.tex` mirrors the Overleaf project and builds `public/resume.pdf`
(`tectonic -X compile resume.tex`). It compiles with pdfLaTeX too.

## Tools

All need the dev server running.

- `node tools/shoot.mjs 1440 900 0 0.5 1` screenshots scroll positions (`SCHEME=dark` for night).
- `node tools/tour.mjs 1440 900` screenshots every figure mid-animation and settled.
- `node tools/evidence.mjs <url> <dir> [paths]` captures both themes at both sizes, plus measurements.
- `node tools/perf.mjs <url> [w] [h] [runs]` reports load weight (gzip estimated), frame pacing over three scroll runs with every frame over 50 ms listed, and layout shift. Run it with nothing else heavy on the machine.
- `node tools/cover.mjs && sh tools/cover.sh` renders the cover stills to `public/cover*.webp`.
- `node tools/og.mjs` renders `/og` into `public/og.jpg`.
