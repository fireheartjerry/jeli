# Criteria: yuzeli.ca, next level

**Artifact:** the site built from this repo (`npm run dev`, http://localhost:4321): `/`, the NeurIPS paper page, `/resume.pdf`
**Target:** 92/100    **Budget:** 5 rounds, stop early at 92
**Created:** 2026-10-11    **Baseline score:** 35/100
**Status:** approved by Jerry on 2026-10-11, with one instruction: push aura "as far as the laws of physics allow". Aura weight was raised to match (C1 20 to 22, C9 rewritten as sustained aura, 4 to 8). Tightened on 2026-10-12 after the second review showed the checks could pass while missing real defects: G7 now covers the paper page and limits single long frames; C5 requires every mid-scroll state of a data figure to be true; C7 asks for current-section feedback on a phone; C8 counts captions in the word budget; C11 requires the venue to be stated accurately. No weights changed.

## Context

Jerry Li's personal site. Two readers matter equally: engineers and recruiters hiring
for Summer 2027 internships, and AI researchers. Success means that either reader,
landing cold, concludes within seconds that this is someone exceptional, and can then
find the proof: shipped work at scale, a first-author NeurIPS 2026 workshop paper, a
$100K+ Schulich Leader Scholarship, and the Software Lead role at Waterloo Defence.
Jerry's brief: take design and content to the next level in every way, evolve the
look as far as it needs to go, and it has to "look aura".

## Gates (binary, non-negotiable)

- **G1. Builds clean.** *check:* `npm run build` exits 0 and `npx astro check` reports 0 errors.
- **G2. No runtime errors.** *check:* `node tools/shoot.mjs 1440 900 0 1 3` and the same at `390 844`, on `/` and the paper page, print no `ERRORS:` block.
- **G3. No horizontal overflow.** *check:* at 390, 768 and 1440 wide, `document.documentElement.scrollWidth === innerWidth` on every page.
- **G4. Required content is present.** *check:* the built HTML of `/` contains the NeurIPS paper title "Verifying the Second Agent" with "NeurIPS 2026", "Schulich Leader" with "$100K+" (or "$100,000+"), and "Waterloo Defence" with "Software Lead".
- **G5. Nothing invented.** *check:* every number and claim on the site appears in `docs/criteria/claims.md` with its source (paper PDF, résumé, LinkedIn, Google Analytics export, the Waterloo Defence site). Spot-check ten rows against the page.
- **G6. Reads without JS or motion.** *check:* with JavaScript disabled, and separately with `prefers-reduced-motion: reduce`, every section's text and every figure's final state is visible.
- **G7. No jank, no slow load** (Jerry's dealbreaker). *check:* `node tools/perf.mjs` reports, for `/` and for the paper page at 1440×900 in headless Chromium: JS + CSS + fonts requested before first scroll ≤ 400 KB (gzip estimated by the tool); over three scripted top-to-bottom scrolls, median frame ≤ 18 ms and p95 ≤ 40 ms in every run, and no frame over 100 ms in most runs; cumulative layout shift ≤ 0.05.
- **G8. No AI-template tells** (Jerry's dealbreaker). *check:* none of these appear anywhere: gradient-filled text, purple or blue gradient backgrounds, glass cards (blurred translucent panels used as content cards), emoji in the interface, icon-plus-blurb feature grids, a centred hero with two pill buttons, stock icon sets, Inter/Roboto/system-default as the display face, placeholder or lorem text.
- **G9. Aura floor** (Jerry's dealbreaker). *check:* criterion C1 scores at least 18/22.

## Criteria (100 points)

### C1. Aura: the first five seconds — 22 pts
**What it means:** Landing cold on desktop or phone, in light or dark, the first viewport reads as the site of someone exceptional: one dominant focal point, a signature live visual nobody else has, and proof of calibre without scrolling.
**How to check it:** Take first-viewport screenshots at 1440×900 and 390×844 in both themes (the cover is night in both, by design). (a) Blur each to 8 px: is there one clear focal point? (b) List which of these are legible above the fold on desktop: Schulich Leader $100K+, NeurIPS 2026 first author, Waterloo Defence, TopsOJ's 100,000 users, Mathos AI (YC W24). (c) Look for five seconds, look away, and write what you remember.
**Scoring anchors:**
- `0`: could be any student portfolio: a name, a paragraph, nothing to remember
- `11`: handsome but quiet: one good visual, credentials need scrolling, nothing a visitor would describe to a friend
- `22`: arresting: a dominant name or statement, a signature live visual, at least three top credentials above the fold on desktop and two on phone, and the five-second memory test yields a specific image plus a specific fact

### C2. Craft and an ownable visual language — 10 pts
**What it means:** Type scale, spacing rhythm, grid alignment and line weights are consistent enough that any cropped 600 px square is recognisably this site.
**How to check it:** Screenshot each section at 1440. Measure left edges of section titles, entry titles and figures (they should land on at most three shared verticals, within 1 px). Count distinct font sizes in body UI outside figures (target ≤ 9). Check vertical spacing between sections is one consistent value. Crop three random 600 px squares and ask whether each is identifiable.
**Scoring anchors:**
- `0`: ad hoc sizes and gaps, misaligned columns, sections look like different sites
- `5`: tidy and aligned but generic; crops are not identifiable
- `10`: one system throughout, edges align, and crops are unmistakable

### C3. New content: complete, specific, sourced — 12 pts
**What it means:** The things Jerry asked for are on the page and say something real.
**How to check it:** One point each, plus two for writing quality (plain, specific, no filler), for: (1) NeurIPS paper title and his authorship (sole author; Jerry confirmed on 2026-10-13 that he is the only author, so the earlier "first author" wording was replaced); (2) both workshops named; (3) its finding in one sentence with at least two real numbers; (4) Schulich Leader with $100K+; (5) Waterloo Defence role, Software Lead; (6) what the team builds; (7) the team's stated goal, the 2027 DND CUAS Urban Sandbox; (8) Mathos AI, TopsOJ and Quoted kept accurate; (9) at least two more projects from the résumé (Porchlight, PolyTwist); (10) at least one proof of reach from LinkedIn.
**Scoring anchors:**
- `0`: none of the new items appear
- `6`: about half appear, or they appear as bare mentions without specifics
- `12`: all ten, each with a concrete fact, in clean prose

### C4. Works for both readers — 8 pts
**What it means:** A recruiter and a researcher can each get their answer from a skim.
**How to check it:** Skim `/` for 30 seconds per role using only headings, ledes, figure titles and the first sentence of each entry. Recruiter: what has he shipped, at what scale, with what stack? Researcher: what did he find, how was it tested, how certain is it? About 1.3 points per question answerable from the skim.
**Scoring anchors:**
- `0`: neither reader can answer anything without reading body copy
- `4`: one reader is served
- `8`: all six answerable from the skim

### C5. Signature figures for the new work — 12 pts
**What it means:** The NeurIPS paper and Waterloo Defence each get a figure at the level of the existing plates: real data or the real mechanism, layered, scroll-driven, alive, and legible on a phone.
**How to check it:** For each figure score six things, one point each: depicts real data or mechanism (not decoration); background, structure, foreground and annotation layers; a scrubbed scroll story with distinct beats that reverses; ambient motion after the story plays; a pointer or touch interaction; legible at 390 px with no label under 10 px effective. A figure that shows measured data loses the first point if any state of its story can be read as a value that was not measured (a number counting up to its result, an estimate travelling from zero, an interval drawn narrower than it is): stop the scroll anywhere and every number on screen must be true.
**Scoring anchors:**
- `0`: no figure, or a static illustration
- `6`: both exist but are single-beat or unreadable on a phone
- `12`: both pass all six

### C6. Dark mode — 7 pts
**What it means:** A designed night theme across every page and figure, not an inversion.
**How to check it:** Force dark and screenshot every section and figure at 1440 and 390. Flag any light-theme leftover (white box, invisible stroke, wrong-coloured logo). Compute contrast for body and meta text tokens (≥ 4.5:1). Toggle, reload, confirm it persists and that there is no flash of the wrong theme. Confirm the site opens at night by default (Jerry's instruction on 2026-10-12: "default dark mode cuz we're in space"), and that day is a designed theme too.
**Scoring anchors:**
- `0`: no dark theme
- `3.5`: exists, but figures have leftovers or contrast fails
- `7`: every surface is deliberate, contrast passes, the toggle persists with no flash

### C7. Wayfinding and command palette — 5 pts
**What it means:** A reader always knows where they are and can jump anywhere; the keyboard can do everything.
**How to check it:** Confirm a visible section index with current-section state on desktop, and that a phone reader can also see which section they are in. Then, keyboard only: open the palette with Cmd/Ctrl+K, type to filter, Enter to act, Escape to close with focus restored. Verify actions exist for every section, copy email, résumé, theme, and copy BibTeX for the paper.
**Scoring anchors:**
- `0`: no in-page navigation
- `2.5`: an index exists but the palette is missing or needs a mouse
- `5`: both work, with focus trapped and returned, and the palette is announced to screen readers

### C8. NeurIPS paper page — 6 pts
**What it means:** A short page a researcher can read in under four minutes and leave knowing the question, the design, the findings and their limits.
**How to check it:** Word count of the body ≤ 700, where the body is the prose plus the figure captions (not the title block, plot labels or the BibTeX entry). Present: the question, the two campaigns, three findings with numbers and intervals, limitations, a citation block. At least two figures. Linked from `/` and links back.
**Scoring anchors:**
- `0`: no page
- `3`: a page exists but is an abstract dump or runs long
- `6`: all parts present within the word budget, and the uncertainty is stated honestly

### C9. Aura sustained: set pieces and motion — 8 pts
**What it means:** The site does not spend its presence on the hero and then go quiet. Every main section has a moment a visitor would stop for, and all motion is choreographed and calm.
**How to check it:** Scroll the whole page at 1440 and screenshot the single strongest moment in each of: hero, work, research, projects, record, footer. For each, ask whether a visitor would screenshot it or describe it to someone. One point per section with a clear set piece (6). Then two points for motion: one orchestrated load sequence, no bounce or elastic easing, nothing moving on its own outside the hero or a figure plate, and `prefers-reduced-motion` disables all of it.
**Scoring anchors:**
- `0`: the hero is the only moment, or motion is busy and distracting
- `4`: about half the sections land, motion is fine but uncoordinated
- `8`: all six sections have a set piece and the motion is deliberate throughout

### C10. Phone — 5 pts
**What it means:** The site is as considered at 390 px as at 1440.
**How to check it:** At 390×844 screenshot every 600 px to the bottom. Flag identical consecutive frames, tap targets under 40 px, text under 12 px outside figures, and anything clipped.
**Scoring anchors:**
- `0`: overflow or clipped content
- `2.5`: works, with dead stretches or small targets
- `5`: no flags

### C11. Résumé and metadata — 5 pts
**What it means:** What people download or see in a link preview matches the site.
**How to check it:** `/resume.pdf` is one page and includes the NeurIPS paper, Waterloo Defence and the Schulich amount (3 pts). The page description, JSON-LD and the social card image (`og.jpg`) mention the new headline facts without changing their meaning (the paper is at NeurIPS 2026 workshops, and every mention says so), and a sitemap exists (2 pts).
**Scoring anchors:**
- `0`: résumé and metadata unchanged
- `2.5`: one of the two halves done
- `5`: both done, résumé still one page

## Out of scope

- Rewriting the internals of the 13 existing figures beyond theme tokens and renumbering.
- A blog, CMS, analytics or any backend.
- Deploying. Nothing is pushed or published without Jerry saying so.

## Constraints

- Astro + GSAP, no framework runtime. Figures are server-rendered in their final state.
- Every number is real and sourced. Internal Waterloo Defence simulation metrics stay out; use only what the team site and Jerry's LinkedIn already say.
- Copy: plain and specific, sentence case, no em dashes, no hype words.
- The look may evolve as far as needed, with no AI-template tells (G8). Jerry's rule, given on 2026-10-12: static elements stay simple; anything animated should be extremely complex and over-engineered. The cover is a cinematic space scene (he named Dyson spheres, asteroid mining and the Xeelee Sequence), and it has to be beautiful.
- No commits or pushes unless Jerry asks. Work happens on the `next-level` branch.

## Scorer configuration

Held fixed for every round.

- **Scorer:** `codex exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check -c model_reasoning_effort="high" -C <score-target> "Read and follow the instructions in <score-target>/scorer-prompt.md"`. A separate CLI and model with no shared context.
- **What it sees:** this document without the score log, baseline and this section; a static build of the site served at http://localhost:4400; a snapshot of the source; and an evidence pack produced by `tools/evidence.mjs` and `tools/perf.mjs` (screenshots in both themes at 1440 and 390, measurements as JSON, gate command output). It has no browser, so every visual check uses the screenshots.
- **What it never sees:** review findings, triage, changelogs, or earlier scores.

## Score log

| Round | Score | Δ | Gates | Note |
|-------|-------|---|-------|------|
| 0     | 35    | — | G2 G3 G4 G5 G9 fail (G2 and G3 only because the paper page does not exist yet) | baseline, untouched site at commit 103010b |
| 1     | 92    | +57 | all pass (C1 20/22) | the full rebuild, after answering the blind review |
| 2     | 95.5  | +3.5 | all pass (C1 22/22) | after the second review; scored against the tightened checks |
| 3     | 96    | +0.5 | all pass (C1 20/22) | after closing the round 2 scorer's notes. Loop stopped: target met in three consecutive rounds |
