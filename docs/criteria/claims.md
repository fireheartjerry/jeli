# Claims ledger: yuzeli.ca

Every number and factual claim on the site, with where it comes from. If a claim is not in this
table it should not be on the site.

**Sources**

- **R**: Jerry's résumé (`resume/resume.tex`, and `Jerry_Li_Resume_Summer_2027.pdf` of 23 Sep 2026)
- **L**: Jerry's LinkedIn profile and posts (linkedin.com/in/fireheartjerry), read 11 Oct 2026
- **P**: the paper as submitted, `182_Verifying_the_Second_Agent.pdf` (28 Aug 2026); table and section numbers refer to it
- **GA**: Google Analytics exports in this repo (`src/data/topsoj-ga.json`, `src/data/ga-countries.json`)
- **DB**: TopsOJ database aggregates in this repo (`src/data/topsoj.json`)
- **WD**: the Waterloo Defence public site, waterloodefence.ca (its `content.ts` at commit 94d048a)
- **S**: already on the site before this work (commit 103010b) and carried over unchanged
- **A**: arithmetic or a published physical constant, shown in the row

## Cover and ledger

| Claim | Where | Source |
|---|---|---|
| Computer science, University of Waterloo | cover | R, L |
| Software people use in 182 countries | cover, Work lede, TopsOJ | GA: 182 countries and territories with users |
| Schulich Leader Scholarship, $100K+ | cover, Record; résumé says $100,000+ | R listed $100,000; "$100K+" is Jerry's wording (11 Oct 2026) |
| NeurIPS 2026 workshops, sole author | cover, Research, Record, résumé, social card, BibTeX | Jerry, 13 Oct 2026: "I am the only author". Acceptance from L: "my first-authored paper got accepted to every workshop I applied to in NeurIPS 2026" |
| TopsOJ, founder, 100,000+ users | cover, Work | GA: 101,950 users; R |
| Waterloo Defence, co-founder and software lead | cover, Work, résumé | Jerry, 16 Oct 2026: asked to be listed as co-founder; WD team page lists him as Software Lead |
| Detector beats fine-tuned Ultralytics YOLO and Roboflow RF-DETR | Work, résumé | Team repo `cuas-sim-tracker-integrity`: `research/held-out-looks.md` row 7 (LRDDv3 test AP50 0.873 vs YOLO26m 0.800; FRED test 0.672 vs best YOLO 0.559; YOLOv8m, YOLO11m, YOLO26m per `docs/icarus/17-why-not-yolo.md`) and `docs/icarus/team/changelog.md` 14 Oct (RF-DETR Large on LRDDv3 val, AP50 0.747 vs ICARUS 0.881; validation only, no test look) |
| Toolkit (Record) and résumé Technical Skills (three lines, a subset of the Toolkit, worded for ATS keyword matching on 20 Oct 2026: C++ and C listed apart, Git, Linux, CI/CD, HTML/CSS, computer vision, deep learning, LLMs) | Record, résumé | Inventory of his repos on the MacBook and the Legion laptop, 20 Oct 2026, counting only libraries imported or configured in code he authored: cuas-sim (PyTorch, CUDA, TensorRT, ONNX Runtime, OpenCV, Ultralytics, RF-DETR, MuJoCo, Docker, GitHub Actions, AWS EC2/S3), porchlight (Bedrock AgentCore, Strands, FastAPI, AWS CDK, Lambda, DynamoDB), olympus (FastAPI, Temporal, PostgreSQL, SQLAlchemy, Kubernetes/Helm), pneuma-lab (Terraform, AWS Batch, Hugging Face), looksmaxios and axis-fitness (Swift, SwiftUI, ARKit, Vision, Metal, Firebase), topsoj (Flask, SQLite, C++), jeli (Astro, GSAP, WebGL), wd-website (Next.js, Three.js, Supabase), Mathos résumé bullets (Celery, Fargate, SES), Quoted Tech (Node.js, Express), school work (Java). Team-only stacks (Mathos's LangGraph, Redis, Flutter; kryonic) left out |
| Mathos AI (YC W24), software engineering intern | cover, Work | R; L |

## About (the intro in his own voice)

Drafted on 13 Oct 2026 after Jerry asked for an intro that states his interests, in the manner of sigilwen.ca. He has not yet confirmed the wording.

| Claim | Source |
|---|---|
| Cover line: likes AI agents, simulation and space; builds software, runs experiments (astrophysics left out on his instruction of 13 Oct 2026: "a short stint in hs", while space is "smth I find really cool") | His work on this page (the paper, the binary-star papers, Worldline Engine) and his own words on 12 Oct 2026: space is one of his main interests |
| From Toronto; computer science at Waterloo; Schulich Leader | S (the earlier site read "Toronto → Waterloo"); R |
| Interested in Dyson swarms, asteroid mining, and science fiction like the Xeelee Sequence | Jerry, 12 Oct 2026: "I'm interested in Dyson spheres and asteroid mining"; he named the Xeelee Sequence as the feel he wanted |
| "My experiments could not find the gain" | P Table 15 (no comparison resolved a gain) |
| Started TopsOJ in high school; more than 100,000 people have used it | S, R; GA: 101,950 users |
| Works on AI video at Mathos; leads the software for Waterloo Defence's counter-drone turret | R; WD |
| Programming alongside coding agents, more than 100 billion tokens | Jerry, 13 Oct 2026: "I have over 100 billion tokens used" (his August LinkedIn post said over 20 billion) |

## Cover simulation (Fig. 1 and the closing figure)

| Claim | Source |
|---|---|
| 60,000 collectors | A: the number of panels the page draws, 150 rings of 400 (`RINGS`, `PER` in `src/scripts/cosmos.ts`) |
| Swarm at 1 AU; rings turn once a year | A: Kepler's third law, T = a^1.5 years |
| Tugs on Hohmann transfers from the main belt | A: each transfer ellipse has perihelion 1 AU and aphelion at the source radius, flown in half its period |
| Tugs in flight: 150 (70 on small screens) | A: the number of transfer orbits the page draws (`nTug` in `src/scripts/cosmos.ts`) |
| "Shown here as a still frame" | A: shown instead of "Scroll to build it" when the scene is not running (no JavaScript, no WebGL, or reduced motion) |
| Main belt 2.1 to 3.3 AU with gaps at 2.50, 2.82, 2.96 and 3.28 AU | A: the Kirkwood gaps at the 3:1, 5:2, 7:3 and 2:1 resonances with Jupiter |
| The belt's 2.4 × 10^21 kg | A: main-belt mass about 2.39 × 10^21 kg (Pitjeva and Pitjev 2018) |
| Rolled to 8.5 g/m² it just covers the sphere | A: 4π(1.496 × 10^11 m)² = 2.81 × 10^23 m²; 2.39 × 10^21 kg ÷ 2.81 × 10^23 m² = 8.5 g/m² |
| Sunlight held, in watts; 3.83 × 10^26 W outbound | A: built fraction × the nominal solar luminosity, 3.828 × 10^26 W |
| Earth, Mars, Jupiter and the Trojans | A: J2000 orbital elements, rounded; Trojans 60° ahead of and behind Jupiter |
| 16 Psyche, quarry | A: Psyche's semi-major axis is 2.92 AU and its orbit runs from about 2.5 to 3.3 AU; the rock is drawn about 3.1 AU out. That it is being mined is the fiction of the scene, and so are the pit, the floodlights, the cargo lane and the boulders beside it. Its shape is generated from the seed (`src/scripts/geo/psyche.ts`), not Psyche's measured shape; only the flattening (shortest axis roughly two thirds of the longest) follows the real body |
| Distances to scale; sizes, gaps and spin rates are not | A: stated in the caption. The Sun is drawn about 18 times too large and each panel far larger than life, so the drawn swarm shows gaps that the percentage in the telemetry does not count. Psyche turns once in 4.2 hours, which at the scene's forty seconds a year would be a blur; it is drawn turning once in 84 seconds, and the boulders tumble at rates chosen to be watched |
| The rock is lit round its edge once the swarm is up | A: seen from 3.1 AU the lit sphere reaches about nineteen degrees either side of the Sun (a radius of 1 AU at 3.1 AU), so it lights a body further round its limb than a point Sun would. The shader widens the light by that angle in proportion to the built fraction (`FS_BIG` in `src/scripts/cosmos.ts`) |
| The galaxy behind the scene | A: an effect, not a map. A band of light and dust is painted once from the seed along the same great circle the star field is gathered on; it is not the real Milky Way's shape or position. It is dim near the Sun and brightens as the camera leaves, as a stopped-down lens would show it |
| The beam's name: 3.83 × 10^26 W, outbound | A: the nominal solar luminosity again, shown once the built fraction reaches 1. The beam leaves through the pole because the three ring families leave the poles open |
| Light shafts and bloom | A: an effect, not data. The light sources are drawn alone, with every panel standing in the way, and smeared outward from the Sun (`leaving()` in `src/scripts/cosmos.ts`) |
| Seed yuzeli → 0xca722d88 | A: the same hash the Worldline figure uses (`src/scripts/worldline.ts`) |

## Work

| Claim | Source |
|---|---|
| Mathos (YC W24) turns math questions into narrated video lessons | S, R |
| MP4 export in Python and Remotion, each render in its own AWS Fargate sandbox | S, R |
| Lifecycle email pipeline on SES | S, R |
| OAuth and MCP server for ChatGPT and Claude; rebuilt step grading | S, R |
| Fig. 2 stages: a request from the app (Export MP4) or from ChatGPT or Claude through the OAuth and MCP server becomes a job in a Celery queue | R: "MP4 export for AI math videos (Remotion on AWS Fargate via Celery)"; S for the OAuth and MCP server |
| Fig. 2: each render in its own locked-down Fargate sandbox, where Remotion draws the lesson frame by frame; "1 render · sealed" | S: "every render runs in its own locked-down AWS Fargate sandbox"; R |
| Fig. 2: the file is stored and the video comes back in the same chat | R: "OAuth 2.0 and MCP server so ChatGPT and Claude users can generate and download Mathos videos in chat". The store is drawn as a generic "file store"; no vendor is claimed. That the file is kept before it is downloaded is the one inference |
| Fig. 2: "Allow", "authorised", "token" | A: consent and a token are what OAuth 2.0 is; nothing specific to Mathos is claimed |
| Fig. 2: an empty slot reads "the next render gets its own sandbox" | S: one sandbox per render. Nothing says what happens to a sandbox afterwards |
| Fig. 2: lifecycle email as a separate pipeline on EventBridge and SES, not fed by the export | R: "SES/EventBridge lifecycle emails"; drawn separately because no source ties it to export delivery |
| Fig. 2: the question, the tool name create_video, the job ids, the file name and the frame counts | A: examples, and the caption says so. tools/call is the real MCP method name |
| Waterloo Defence: student team, autonomous counter-drone turret | WD |
| Camera detects and tracks; solver aims where the drone will be; drag and drop corrected | WD project description |
| "I lead the software": vision, solver, simulator | WD lists Jerry as Software Lead; L; the team's MuJoCo simulation is shown on WD |
| Tags: computer vision, tracking, ballistics, MuJoCo | R: "camera detection and tracking of small drones, a ballistic solver for lead, drag, and drop, and a MuJoCo sim". No language is named because no source names one |
| Building toward the Department of National Defence's 2027 CUAS Urban Sandbox | L (the team's launch post, reposted by Jerry) |
| Fig. 3 numbers (range, flight time, lead, drop, speeds) | A: computed by `src/scripts/geo/intercept.ts` for an illustrative scenario; the caption says they are not the team's hardware |
| TopsOJ: started in high school; Python and Flask | S, R |
| Over 100,000 users from 182 countries | GA |
| Problem count; over 120,000 submissions | DB (`totals.publicProblems`; 124,202 submissions) |
| EloMMR ratings; team of 30; partners including 3Blue1Brown | S, R |
| TopsOJ figures (map, analytics, submissions, ratings) | GA, DB; unchanged from S |
| Quoted Tech: label automation in Node.js cut manual processing time by 70%; Playwright scrapers | S, R |

## Research

| Claim | Source |
|---|---|
| Four papers | S (three) plus P |
| Title, "Verifying the Second Agent: Controlled Experiments on Recursive Delegation in Coding Agents" | P title page |
| Accepted at both workshops: "Who Verifies the Agents? Toward Reliable Agent Development" and "Managing Agents that Manage Agents" | L post; workshop names from the two calls for papers |
| NeurIPS 2026 in Sydney | L post |
| Two within-task crossover experiments; verifier-scored repository repairs | P abstract, §2 |
| DeepSWE: 113 tasks, public GitHub repositories, five languages; 97 gradable | P §2, Table 3 |
| One model, gpt-5.6-luna; prompts, tools, container, verifier, task and per-node turn budget held fixed; a 6,000,000-token aggregate cap that never binds; run order randomised by a hash of the trial key | P §2, "What is randomized and held fixed" |
| "Every 95% interval includes zero or favours the single agent" | P Table 15 (−11.54 [−20.93, −2.05]; −4.00 [−15.09, +8.00]; −6.03 [−16.96, +5.56]) and §5 (+1.25 [−9.76, +12.82]) |
| "The design had 80% power at a 16.1-point effect" | P §5: the minimum detectable effect at 80% power is 16.1 points |
| Tokens vs one agent: 2.73×, 5.98×, 12.50× (3, 7, 15 agents); cost 2.43×, 5.64×, 11.39×; wall clock 1.42×, 3.43×, 5.08× | P Table 16 |
| Mean billable tokens 252,704 / 621,968 / 1,427,748 / 2,603,307 | P Table 18 |
| Verified success vs one agent: −11.54 [−20.93, −2.05], −4.00 [−15.09, +8.00], −6.03 [−16.96, +5.56] points; 78, 50, 58 tasks | P Table 15 |
| Cost per verified fix $0.58 to $6.92 at 15 agents | P §3 |
| Patches handed up 194 / 516 / 1,316; refused 40.2% / 36.0% / 31.9% | P Table 20 |
| Orchestration under a fifth of a percent of tokens | P Table 18 |
| Excess tokens: 58.7% / 41.2% (7 agents), 68.2% / 31.6% (15 agents) | P Table 19 |
| Sibling file overlap +9.8 [+5.0, +15.1] and +7.4 [+3.5, +11.7] points above the task null | P §4 |
| 149 of 165 refused patches (90.3%) collide at the line level | P §4, Fig. 3c |
| Return campaign: 40 tasks, 38 repositories; $0.17, $0.97, $1.03 per attempt | P §3, §5 |
| Findings minus shared write: +1.25 [−9.76, +12.82] points, p = 0.925; detectable floor 16.1 | P §5 |
| Findings minus single agent: −7.50 [−15.85, +1.16]; shared write −8.8 | P Table 2, Fig. 2 |
| Cost of findings return minus shared write: +$0.051 [−0.005, +0.110] per attempt | P Fig. 2 (primary contrast) |
| Explicit orchestration 0.17% of tokens (Fig. 2 of the paper page) | P Fig. 3a |
| The oracle is not a runnable policy; a null with identical arms reproduces 81% of its gap | P §6 |
| Readout lines in the paper-page figures: "A, one agent: $0.17 per attempt", "80% power at ±16.1 pp", "149 / 165 collide", "static routers against the best constant", "ridge router stays on the constant" | P §3 and §5 for the costs and the power floor; P §4 for the 165 replayed patches; P §6 and Table 25 for the routers (the fitted return router chose the single agent on all 39 tasks) |
| Routers: 23 features; best +0.037 [−0.036, +0.125]; fitted router chose one agent on all 39 tasks | P §6 |
| Router policy values and intervals in Fig. 4 of the paper page | P Table 21 (depth arms) and Table 25 (return arms). Not Fig. 5: see the open item below |
| Fig. 4 depth rows: D threshold 30.5, best constant 26.8, ridge treatment 26.8, ridge outcome 24.4, difficulty only 24.4, always 7-node 23.2, boosted treatment 13.4, each with its difference from the constant and 95% interval | P Table 21. "Always 15-node" and the oracle (40.2%) are left off the plot because they fall outside the shared 0 to 40% axis |
| "The only interval that excludes zero, and it is on the losing side" (boosted treatment learner, −13.4 [−23.2, −5.0]) | P Table 21 |
| Fig. 4 return rows: values with intervals on the values themselves, read by picking a row | P Table 25 |
| Fig. 9 / paper Fig. 1 title: "Trees cost 3 to 12 times more, with no resolved gain" | P Table 16: 2.73×, 5.98× and 12.50× the tokens of one agent; Table 15 for the unresolved gain |
| Fig. 9 / paper Fig. 1 caption: "each contrast on its own paired tasks"; "the 3-agent tree resolves a loss" | P Table 15: the three contrasts use 78, 50 and 58 paired tasks, and only the 3-agent interval excludes zero |
| In the delegation figure, the share of patches refused in the animation matches 40.2 / 36.0 / 31.9%; one packet per edge per cycle is illustrative | P Table 20 for the shares; the packet count is stated here as illustration, not data |
| Limits: one model family, one benchmark, one harness; runtime control untested | P §9 |
| Binary stars: three sole-authored papers, venues, dates, Best Manuscript, supervisor | S, R |
| Landscape figure: orbit shrinks to 0.89, classical 1.23 | A: `src/scripts/binary.ts`, formulas from the RNAAS note at f = 15%, q0 = 0.4 |

## Projects

| Claim | Source |
|---|---|
| Cardboard Cockpit, Daedalus, Drift, Worldline Engine: descriptions, events, awards | S, R |
| Porchlight: multi-agent aid dispatcher on Strands Agents and Bedrock AgentCore; deterministic safety, money and confidence gates; persistent human decision cards | R (Summer 2027 résumé) |
| PolyTwist: deterministic engine for unfamiliar twisty puzzles; exact rational geometry; WebGL2 and CPU rendering; 16 task families | R (Summer 2027 résumé) |

## Record

| Claim | Source |
|---|---|
| Schulich Leader Scholarship, 2026 | R; L post |
| Best Manuscript, Journal of High School Science | S, R |
| Best Non-GenAI Hack, JAMHacks 10 | S, R, L post |
| Featured on the Chrome Web Store | S, R |
| USACO Platinum, perfect 1,000 on Gold; PhysicsBowl 1st in Canada and 7th in the world; Newton 4th and 9th; AIME three times | S, R |
| 9,000+ followers on LinkedIn | L: 9,163 followers on 11 Oct 2026 |
| First on Tokenboard's worldwide ranking in August 2026 | L post: "I've used over 20 billion tokens and am #1 globally on tokenboard" |
| Over 100 billion tokens used with coding agents to date | Jerry, 13 Oct 2026 |

## Open items for Jerry

- **Figure 5 disagrees with Table 21 in the submitted PDF.** For the depth-campaign arms, Fig. 5 shows the ridge treatment learner, ridge outcome learner, difficulty-only rule and boosted learner at 19.5%, 19.5%, 19.5% and 15.9%. Table 21 gives 26.8%, 24.4%, 24.4% and 13.4%, and the body text quotes Table 21's differences (+0.037 and −0.134). The site follows Table 21. Worth fixing before the camera-ready.

- **Waterloo Defence stack.** The entry lists computer vision, tracking, ballistics and MuJoCo, and names no programming language. Jerry confirmed on 13 Oct 2026 that this is fine.
- **Mathos figure.** Jerry said on 13 Oct 2026 that Fig. 2 is fine. It was not checked against the Mathos code: the stages come from the résumé, and their order, and that a rendered file is stored before it is downloaded, are a reading of it.
- **Résumé.** Since 13 Oct 2026 the site serves the Overleaf master ("Jerry Li - Resume Master - 2027 Applications") with three edits made in both places: the scholarship reads $100,000+, the NeurIPS entry's subtitle reads "Independent Research, Sole Author", and the degree is expected in 2029 (Jerry: "write 2029 everywhere or dont mention it"). It is one page. It says more than the site does about Waterloo Defence (a perception system and its detector's benchmark numbers); the site's own entry still follows the team's public wording. The per-application résumé projects on Overleaf were not opened or changed. Since 20 Oct 2026 the site's copy leaves out the graduation year (Jerry: "remove grad year from it straight up"); the Overleaf master still reads Expected 2029.
- **Paper link.** No public copy was found; the paper page links nowhere external. Add the OpenReview or arXiv link when there is one.

## Passages (flight log)

- Jupiter's Trojans at 60° ahead of and behind Jupiter; "may hold about as many large bodies as the main belt" (Jewitt, Trujillo & Luu 2000 estimate a population comparable to the main belt's). Hohmann transfer from 2.7 AU to 1 AU: a = 1.85 AU, half of 1.85^1.5 yr ≈ 1.26 yr, "about fifteen months".
- Saturn's orbital period 29.46 yr. Scene: 60,000 collectors on Kepler orbits solved in the vertex shader (cosmos.ts).
- Neptune at 30.07 AU; light time 30 × 499 s ≈ 4.2 h. Kuiper belt to about 50 AU; more than 100,000 objects over 100 km is the usual estimate.
- Voyager 1 crossed the heliopause on 25 August 2012 at about 121.6 AU. Pale Blue Dot: 14 February 1990, about 40 AU (6 billion km); the Earth filled less than a pixel (0.12 px). Voyager's high-gain antenna is 3.66 m across; its magnetometer boom is 13 m. Light time to 140 AU: 140 × 499 s ≈ 19.4 h.
- The odometer reads the camera's real distance; each passage's place is where scripts/voyage.ts puts the camera when it is centred (wide screens).
- Cosmic string (Log 05): deficit angle δ = 8πGμ; space round a straight string is a cone missing δ, so sources behind it within δ are seen twice (Vilenkin 1984). Planck limits Gμ ≲ 10⁻⁷, so δ ≲ 2.5 × 10⁻⁶ rad, about 0.5 arcsec ("under about a second of arc"). Linear density μ = Gμ · c²/G ≈ 1.35 × 10²⁰ kg/m at that limit, so about 44 km weighs one Earth mass (6 × 10²⁴ kg): "tens of kilometres". GUT-scale strings are about 10⁻³⁰ m wide ("far thinner than a proton"). The page draws δ = 0.05 rad (about 3°), some 20,000 times the limit ("thousands of times wider"). The brightness step across it is the Kaiser–Stebbins effect of a moving string, also exaggerated.
- Light sails (Log 01): Breakthrough Starshot (2016) proposed a ~100 GW ground laser array accelerating gram-scale sails, a few metres across, to about 0.2 c in minutes (Parkin 2018). Under constant thrust distance grows as t², which is how the sails move up the beam. The Sun's output, about 3.8 × 10²⁶ W, is some 4 × 10¹⁵ times that laser's power ("far heavier ones": illustrative, not a computed payload).
