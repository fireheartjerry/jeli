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
- The scene (`src/components/Cosmos.astro`, `src/scripts/voyage.ts`, `src/scripts/cosmos.ts`) is one
  WebGL canvas fixed behind the whole page: the Solar System with a Dyson swarm going up at 1 AU.
  Everything is generated from one seed, and every body moves on a Kepler orbit solved in the
  vertex shader, so 60,000 collectors cost the CPU nothing per frame. The camera makes one take
  of the page. On the cover (`src/components/Hero.astro`) scrolling builds the sphere and pulls
  the camera back and round the Sun, and the beam is lit before the cover lets go. The cover is
  held still while that happens: it is sticky inside a taller box (`[data-hold]`), never pinned, so
  nothing on it is moved in the document. The bar is clear glass while the cover is held and shows
  the camera's distance from the Sun; each section's title turns the camera a little as it reaches
  the bar, and sinks behind its line as the breadcrumb takes its name. Below it the
  camera keeps going, past Saturn, Uranus and Neptune and through the Kuiper belt to 140 AU, rising
  over the ecliptic so the orbits open into rings, until the sphere is one gold star; its distance
  is carried in its logarithm, so the sphere shrinks by the same factor for every screen scrolled.
- Between the sections are passages (`src/components/Passage.astro`): open sky with one title card each.
  `scripts/voyage.ts` puts the camera at each passage's distance as it is centred (5.2, 9.5, 30 and 140 AU),
  lights the orbit the card names in gold, and flies the camera past the planet itself (`FS_PLANET`:
  Jupiter, Saturn with its rings, Neptune, ray-traced in the camera's frame and lit as a crescent). A
  flight log under each card, off until asked for, says what is out there.
  At the far end, over the record and a fifth card, a cosmic string opens across the sky: no light of
  its own, only the sky either side of a line turned by half its deficit angle (in `FS_FAR`, and the
  stars drawn twice, once for each side, in `VS_SKY`), so what lies behind it is seen twice, with the
  faint Kaiser–Stebbins step in brightness across it. A Voyager-class probe (`FS_PROBE`) is flown past
  at the heliopause.
- The footer is the same move run backwards, home to the closed sphere. The pointer leans the
  camera, and a drag on the cover or the footer swings it before it returns to its mark. 16 Psyche
  and the boulders near it are real meshes (`src/scripts/geo/psyche.ts`), built from the seed in
  idle slices and hung at fixed places in the world. The galaxy behind is painted once into a
  texture and grained with stars in the shader; the point stars are drawn out along the way the
  camera turned while the shutter was open. The shafts and bloom come from a second small pass:
  the light sources drawn alone, with every collector standing in the way, smeared outward from
  the Sun. Far out the scene is drawn in less detail (no light pass, a share of the collectors,
  then a point of light) and at half the frame rate when nothing is moving. A machine that cannot
  hold the frame rate gives up sharpness first, then the light pass. Without JavaScript, without
  WebGL or under reduced motion there is no fixed scene: the cover and the footer show the stills
  that `tools/cover.mjs` renders.
- The page's own motion is one vocabulary (`src/scripts/motion.ts`): two curves, "arrive" and
  "swap", three lengths, and nothing overshoots. `src/scripts/reveal.ts` is how things arrive:
  type rises from behind its own line, a plate surfaces out of the sky as it is scrolled to (it rises and
  comes into focus, never outlined), and the About paragraphs are
  read into as they cross the window. A block opts in with
  `data-reveal`, and is only ever held back when there is a script to bring it in.
  `src/scripts/scroll.ts` eases a wheel's scroll (Lenis; touch is left alone) and sends the page to
  a section: a glide if it is near, a cut if it is far (two blades close and open over the jump).
- Going from one page to another is a cross-document view transition (`src/styles/transitions.css`,
  `src/scripts/transit.ts`): the bar holds, the page leaves and the next arrives, the paper's title
  is carried between its heading and its page, and by night the sky is carried under the page as a
  still (Chrome photographs a live WebGL canvas as a white sheet). A change of theme is a
  terminator crossing the window (`src/scripts/theme.ts`).
- Every other figure is a plate (`src/components/Figure.astro`) around one SVG or canvas. Under a
  mouse a plate catches the light where the pointer is, its edge brightens nearest it, and its
  corner marks close in; a readout that changes comes up in the accent. The SVG
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

`resume/resume.tex` mirrors the Overleaf project "Jerry Li - Resume Master - 2027 Applications" and builds `public/resume.pdf`
(`tectonic -X compile resume.tex`). It compiles with pdfLaTeX too.

## Frame by frame

`tools/qa/` records any animation on the site a frame at a time, the same way every run, and
measures every frame. The page's clocks are replaced by one the tool owns (`clock.js`), the
document's own timeline is frozen and stepped by hand, and each of the page's 60 frames a second
is photographed with what the page reported at that frame.

```bash
npx astro build --outDir .qa/dist
QA_DIST=.qa/dist node tools/qa/run.mjs              # every take in tools/qa/manifest.mjs
QA_DIST=.qa/dist node tools/qa/run.mjs home.fig     # only takes whose id starts with this
```

Each take leaves `.qa/seq/<id>/` with its frames, contact sheets (`sheet-N.jpg`, with a strip
showing how much each frame changed) and `analysis.json`. A frame is flagged when it is blank,
held between moving frames, changed far more than its neighbours, or when something tracked
changed speed abruptly, stepped backwards, or the page changed height. `.qa/ledger.md` lists every
take with its flags, and anything on the pages that no take covers. Frame pacing is a different
question, answered in real time by `tools/perf.mjs`.

Two things are not stepped. A page giving way to another cannot be (with the clock held, Chrome
draws the page being left as a white sheet), so `tools/qa/live.mjs` records every crossing in real
time from the compositor and flags any frame brighter than both ends. `tools/qa/checks.mjs` checks
three things over whole pages: everything that arrives ends up plainly there (resolved), nothing
moves under reduced motion (calm), and the pages read without JavaScript (plain).

```bash
QA_DIST=.qa/dist node tools/qa/live.mjs
QA_DIST=.qa/dist node tools/qa/checks.mjs
```

Every frame is kept as a JPEG, so `.qa/` grows by about a gigabyte per full run; delete old runs.

## Tools

All need the dev server running.

- `node tools/shoot.mjs 1440 900 0 0.5 1` screenshots scroll positions (`SCHEME=dark` for night).
- `node tools/tour.mjs 1440 900` screenshots every figure mid-animation and settled.
- `node tools/evidence.mjs <url> <dir> [paths]` captures both themes at both sizes, plus measurements.
- `node tools/perf.mjs <url> [w] [h] [runs]` reports load weight (gzip estimated), frame pacing over three scroll runs with every frame over 50 ms listed, and layout shift. Run it with nothing else heavy on the machine.
- `node tools/cover.mjs && sh tools/cover.sh` renders the cover stills to `public/cover*.webp`.
- `node tools/og.mjs` renders `/og` into `public/og.jpg`.
