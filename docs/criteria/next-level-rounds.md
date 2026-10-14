# Round log: yuzeli.ca, next level

## Round 0: baseline, 35/100
**Scorer:** codex exec (independent, fresh context), on the untouched site at commit 103010b.

| # | Criterion | Score | Note |
|---|---|---|---|
| C1 | Aura: first five seconds | 11/22 | "Handsome but quiet." Zero of the five headline credentials legible above the fold. |
| C2 | Craft and visual language | 8/10 | Grid and plates coherent; 10 font sizes outside figures (target 9). |
| C3 | New content | 3/12 | Only the existing Mathos, TopsOJ and Quoted copy counts. |
| C4 | Works for both readers | 3/8 | Scale and stack sit past the first sentence; no design or uncertainty for researchers. |
| C5 | Figures for the new work | 0/12 | None exist. |
| C6 | Dark mode | 0/7 | None. Meta text contrast measured at 4.09:1 in light. |
| C7 | Wayfinding and palette | 0/5 | None. |
| C8 | NeurIPS paper page | 0/6 | None. |
| C9 | Aura sustained | 6/8 | Five of six sections have a set piece; the footer does not, and its orbit spins outside a plate. |
| C10 | Phone | 3/5 | 19 tap targets under 40 px. |
| C11 | Résumé and metadata | 1/5 | Résumé lacks NeurIPS and Waterloo Defence; metadata and social card are stale; no sitemap. |

Gates: G1 G6 G7 G8 pass. G4 (required content), G5 (no claims ledger), G9 (aura floor) fail. G2 and G3 fail only because the paper page they require does not exist.

## Round 1: first full build, then a blind hostile review. Score 35 → 92 (+57)
**Reviewer:** codex exec (independent, blind to the rubric), on a static build of the first full rebuild.
**Accepted:** 9 · **Rejected:** 0 · **Deferred:** 0. Every finding checked out against the artifact; F8 was taste and accepted anyway because it matched Jerry's own rule about animated visuals.

Between the baseline and this round Jerry changed the brief three times, and the rubric was amended to match (see the criteria document): the cover is a space scene rather than his binary-star research; the site opens at night by default; static elements stay simple and anything animated is over-engineered; and it has to look "godlike and angelic".

### Changes (the build)
- Cover rebuilt as a live WebGL simulation: the Solar System with a Dyson swarm going up at 1 AU, generated from one seed, every orbit solved on the GPU → C1, C9
- Waterloo Defence entry with a fire-control figure; NeurIPS paper entry with a delegation figure; Porchlight and PolyTwist; a Record section → C3, C4, C5
- Paper page with three more figures and a citation block → C8
- Night theme by default with a day theme, all figures tokenised → C6
- Section index and a Cmd+K palette → C7
- Résumé rebuilt to one page with the new entries; new social card, sitemap, structured data, claims ledger → C11, G5
- The binary-star landscape (a floating-horizon render of the Roche potential with an integrated gas stream) moved from the cover to Research → C9

### Changes (answering the review)
- F1, the footer image contained the header, rail and half the name: the stills now come from a poster mode that draws only the scene; found while fixing it that the depth buffer was never cleared between frames, which had been hiding panels → C1, C9, G8
- F2, the cover read as a wire diagram: collectors are now 60,000 oriented hexagonal mirror panels with lit and dark sides; the shot opens under a dome of them with the Sun in clear view and pulls back until the sphere closes; the plan lines show only for rings going up. Then the scene got real light: the Sun and the gold the lit foil throws back are drawn alone into a small buffer with every collector standing in the way, smeared outward from the Sun into shafts and blurred into bloom, held over from frame to frame so it does not flicker, with an exposure that stops down close to the Sun. The closed sphere now reads as a caged star, not a dark ball → C1, C9
- F3, the citation looked complete and was not: the page now says the camera-ready is not public, that the author list is abbreviated, and how to get the manuscript → G5, C8
- F4, on a phone the build finished after the scene had scrolled away: the cover now holds on phones too, and the cue sits beside the scene → C10, C1
- F5, figure inspection needed a pointer: keyboard focus, labels and a live region added to the four new figures, each one Tab stop with arrow keys inside → C7
- F6, no visible section links on a phone: a plain row of anchors under the ledger → C7, C10
- F7, two research headings overclaimed: rewritten to say what was resolved → C8, G5
- F8, the Mathos plate was only a logo: replaced by a figure that follows one export through the system → C9, C4
- F9, the email link's tap target was smaller than it looked: fixed on the link itself → C10

### Changes (found while checking the evidence before scoring)
- The breadcrumb in the header could go blank: two section changes inside one 420 ms roll left the first roll's end state on screen and cleared the second. Each change now settles the one before it; 25 rapid hops tested, none bad → C7, C2
- On phones narrower than 384 px (360 and 375 are common) one figure's unbreakable readout line widened the whole page. Single-column grid tracks may now shrink below their content, the readout can shrink, and the evidence tool checks 320 and 360 as well as 390 → G3, C10
- Touch targets inside the three paper-page figures were 14 to 25 px tall; all are now at least 32, most 40 or more. The tap test also found that only the first tap on a figure registered, which is fixed → C10, C5
- Two figures did their start-up work in one go and could hold a frame during a fast scroll: the binary-star landscape (filling its gas stream) and Worldline (simulating 900 frames). Both now do it in slices of a few milliseconds while still off screen. The header no longer reads layout on scroll frames → G7
- Phone footer: the closing image was cropped to half a sphere under the caption; it now shows the whole sphere between the caption and the address → C9, C10
- Type sizes on the paper page and the phone ledger brought onto the same scale as the home page → C2

### Rejected findings
- None. The reviewer's notes on the evidence pack were also right (figures were photographed mid-story, phones were not touch-emulated); the evidence tool now captures finished-state figures and emulates touch.

### Per-criterion
| # | Criterion | Before | After | Note |
|---|---|---|---|---|
| C1 | Aura: first five seconds | 11/22 | 20/22 | All five credentials above the fold on desktop, three on a phone. Two withheld: in the blur test the name and the Sun's glare compete as focal points. |
| C2 | Craft and visual language | 8/10 | 9/10 | Three shared verticals, nine type sizes, one section spacing. A prose-only crop is less ownable than an instrument crop. |
| C3 | New content | 3/12 | 12/12 | All ten items, each with a concrete fact. |
| C4 | Works for both readers | 3/8 | 5/8 | Recruiter served. The NeurIPS entry's first sentence carries neither method nor certainty, and the figure title does not state the finding. |
| C5 | Figures for the new work | 0/12 | 12/12 | Delegation and intercept pass all six checks. |
| C6 | Dark mode | 0/7 | 6/7 | One leftover: in the day theme the index rail stays in day colours over the night footer, so "Contact" is nearly invisible. |
| C7 | Wayfinding and palette | 0/5 | 5/5 | |
| C8 | NeurIPS paper page | 0/6 | 5/6 | Counting captions, the page is 847 words against a budget of 700. |
| C9 | Aura sustained | 6/8 | 8/8 | Six set pieces. |
| C10 | Phone | 3/5 | 5/5 | |
| C11 | Résumé and metadata | 1/5 | 5/5 | |

Gates: all nine pass. The scorer noted that G7 is specified for `/` only, and that the paper page's run contained four slow frames, one of 800 ms.

The target of 92 was met in this round. One more round was run anyway, because the review that ran alongside the scoring found defects that are wrong regardless of the score (below).

## Round 2: a criteria-aware hostile review of the 92-point version. Score 92 → 95.5 (+3.5)
**Reviewer:** codex exec (independent; given the criteria, run alongside the round 1 scoring so it did not see that score).
**Accepted:** 8 · **Rejected:** 0 outright, 2 in part · **Deferred:** 0. Each finding was checked against the artifact first; all eight were true.

### Changes
- F1, the delegation figure printed measured values multiplied by scroll progress ("1 agent 0.08× tokens") and grew intervals from zero width: every readable state of the four paper figures now shows only sourced values; numbers appear when their mark is complete, estimates appear in place, intervals are revealed whole → G5, C5
- F2, the paper page's run held frames of 67, 200, 183 and 800 ms and still passed: the gate now covers both pages, runs three scrolls and limits single long frames; the figure scripts update only the layout that is showing → G7
- F3, the social card said "first author at NeurIPS 2026": it now says workshops, as does the structured data → C11, G5
- F4, the paper page never named its model or budget: it now names gpt-5.6-luna, the fixed prompts, tools and turn budget, and the 6,000,000-token cap that never bound; the home summary carries the same qualification → C8, C4
- F5, "the design could only have detected 16.1" was wrong about what a power floor is: now "the design had 80% power at a 16.1-point effect", on the page and in the figure → C8
- F6, the page was 847 words with its captions: now 692, and the evidence tool counts captions → C8
- F7, no current-section feedback on a phone, and the index rail unreadable over the footer in the day theme: the phone's jump button now carries the section's name, and the rail takes night colours over the footer → C7, C6
- F8 (taste), the Sun's white core swallowed the detail round it: the disc now runs from white at its centre to gold at its limb, its glow is tighter and turns gold sooner, and less glare is laid over the nearest collectors → C1
- From the round 1 score, C4: the two research entries now open with the finding, the method and the certainty, and the delegation figure's title states the finding → C4
- Also: the cover now eases its own detail on machines that cannot hold the frame rate (sharpness first, then the light pass), and tells a throttled browser from a slow one → G7

### Rejected in part
- F7 asked for a contents list on the paper page. The page is under 700 words; it got its headings as palette destinations instead of a visible list.
- F8 asked for the nearest collectors to keep their frames and shading. The glare over them was cut by about 40%; the opening camera and the scale of the Sun were kept, because the opening is the image people remember.

### Per-criterion
| # | Criterion | Before | After | Note |
|---|---|---|---|---|
| C1 | Aura: first five seconds | 20/22 | 22/22 | The Sun is now the one focal point in the blur test, with the name anchoring it. |
| C2 | Craft and visual language | 9/10 | 9/10 | Unchanged: a prose-only crop could belong to another restrained editorial site. |
| C3 | New content | 12/12 | 12/12 | |
| C4 | Works for both readers | 5/8 | 7/8 | The research lead sentence now carries finding and certainty. Still below the fold of the skim: DeepSWE, same-task pairing and the verifier (second sentence), and most of Mathos's stack. |
| C5 | Figures for the new work | 12/12 | 11/12 | Scored against the stricter rule added this round: the delegation bars still grow from zero along a numeric axis, so a half-drawn bar reads as a smaller measured value even with its numeral held back. |
| C6 | Dark mode | 6/7 | 7/7 | |
| C7 | Wayfinding and palette | 5/5 | 4.5/5 | Scored across both pages now: on a phone the paper page's jump button does not say where you are. |
| C8 | NeurIPS paper page | 5/6 | 6/6 | 656 words with captions. |
| C9 | Aura sustained | 8/8 | 8/8 | |
| C10 | Phone | 5/5 | 4/5 | The scorer found three tap targets the evidence tool does not look for: the mass-ratio chips in the binary-star plot are about 32 × 27 px on a phone. |
| C11 | Résumé and metadata | 5/5 | 5/5 | |

Gates: all nine pass, including G7 on both pages (three of three runs with no frame over 100 ms on each).

## Round 3: closing what the round 2 scorer found. Score 95.5 → 96 (+0.5)
No new review this round: the target was met in round 1 and confirmed in round 2. The changes answer the scorer's own notes.

### Changes
- C5, a half-grown bar on a numeric axis reads as a smaller measurement: in all four paper figures every mark whose length, position or count is a measurement now appears whole (bars, wall-clock lines, the 165-cell grid, router stems, the picks strip); only structure still draws → C5, G5
- C7, the paper page gave no location cue on a phone: its jump button now reads "Research" → C7
- C10, three tap targets of about 32 × 27 px in the binary-star plot: now at least 40 × 40 on a phone. The evidence tool now also measures anything the page marks as pressable or draggable with its cursor, which found the Worldline scrubber at 22 px tall; it is 44 px under a finger now → C10
- C4, method and stack sat in second sentences: the Mathos, Waterloo Defence and paper entries now open with role, product, stack, method and certainty → C4
- The Waterloo Defence entry no longer names a programming language: no public source names one. Logged as a question for Jerry → G5

### Per-criterion
| # | Criterion | Before | After | Note |
|---|---|---|---|---|
| C1 | Aura: first five seconds | 22/22 | 20/22 | Nothing on the cover changed between these two rounds; the two scorers read the same blur test differently (one focal point, or two bright masses: the Sun and the name). Treat C1 as 20 to 22. |
| C2 | Craft and visual language | 9/10 | 9/10 | Same note three rounds running: a prose-only crop is not unmistakable. |
| C3 | New content | 12/12 | 12/12 | |
| C4 | Works for both readers | 7/8 | 8/8 | All six questions answerable from the skim. |
| C5 | Figures for the new work | 11/12 | 12/12 | Measured marks appear whole; no state fabricates a value. |
| C6 | Dark mode | 7/7 | 7/7 | |
| C7 | Wayfinding and palette | 4.5/5 | 5/5 | |
| C8 | NeurIPS paper page | 6/6 | 6/6 | |
| C9 | Aura sustained | 8/8 | 8/8 | |
| C10 | Phone | 4/5 | 4/5 | A different flag this time: on a phone the BibTeX lines run past the edge of their own scrollable block. |
| C11 | Résumé and metadata | 5/5 | 5/5 | |

Gates: all nine pass.

### After the last score (not scored)
- The BibTeX block wraps its lines on narrow screens instead of scrolling sideways, which answers the one C10 flag above. Checked by hand at 320 to 390 px; no independent scorer has seen it.

### Stopping
The loop stopped here: 92, 95.5 and 96 in three consecutive rounds against a target of 92, with every gate passing each time. What is left is C1's two points, which moved with the scorer and not with the work, and C2's one, which would mean redesigning how prose sections look. Neither is worth another round without Jerry's eye on the cover first.

## After the loop: Jerry's answers (2026-10-13)
Not scored.
- He is the paper's only author: "first author" became "sole author" on the cover, the Research entry, the Record, the paper page, the page description, the social card and the résumé, and the BibTeX author is now "Li, Jerry" with the note about an abbreviated list removed.
- The model name stays. The Waterloo Defence entry stays without a language. The Mathos figure stays as drawn.
