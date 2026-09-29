# yuzeli.ca

Jerry Li's personal site. Astro, GSAP, no framework runtime.

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
```

## How it's put together

- `src/pages/index.astro` is the whole page. Copy lives there.
- Every figure is a plate (`src/components/Figure.astro`) around one SVG or canvas. The SVG is
  rendered at build time in its finished state, so the page reads fine without JavaScript and
  under `prefers-reduced-motion`.
- `src/scripts/figures.ts` lazy-loads `src/scripts/figures/<name>.ts` for each `[data-fig]` as it
  nears the viewport. Each module scrubs a GSAP timeline against scroll, so figures run backwards
  when you scroll up. `tools/FIGURES.md` is the contract a new figure follows.
- The hero (`src/components/Hero.astro`, `src/scripts/hero.ts`, `src/scripts/binary.ts`) animates
  the result from Li 2026 (RNAAS): ballistic mass transfer shrinks the orbit, a/a0 = (1 + f q0)^-2,
  against the classical [(1 - f)(1 + f q0)]^-2, with Roche lobes solved from the potential.
- `src/data/topsoj.json` holds aggregate, anonymised TopsOJ statistics used by Figs. 3 and 4.

## Résumé

`resume/resume.tex` mirrors the Overleaf project and builds `public/resume.pdf`
(`tectonic -X compile resume.tex`). It compiles with pdfLaTeX too.

## Tools

- `node tools/shoot.mjs 1440 900 0 0.5 1` screenshots the running dev server at scroll positions.
- `node tools/tour.mjs 1440 900` screenshots every figure mid-animation and settled.
- `node tools/og.mjs` renders `/og` into `public/og.png`.
