import { gsap, scrubbed, whileVisible, phase, q, qa, T } from "../motion";
import {
  VIEW, LOG, FLIGHT, BEATS, FOUND, PACE, EIGHT_FROM, ALT_LIMITS, ADI, SPD, ALT, HDG,
  flight, advance, autopilot, scene, throttleCard, thrY, trend, horizon, pointer,
  spdTape, altTape, hdgTape, hdgBase, hdgText, hdgName, speedOf, frame, readout, turbulence, fadeTape, fadeHdg, fadeRung, type Sim,
} from "../geo/cockpit";

type P = [number, number];
const NS = "http://www.w3.org/2000/svg";
const r1 = (v: number) => (Math.round(v * 10) / 10).toString();
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const wrap180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
const setD = (el: Element, d: string) => el.setAttribute("d", d);

/** The story starts when this height of the drawing (the upper part of the card) has come this far up the window. */
const FIRST = 100, LINE = 92;
/** The bridge sends a frame this often, seconds; a packet takes three of them to cross a wire. */
const TICK = 0.1, CROSS = 3;
/** Flown on, the track keeps this much behind the aircraft (map units), and thins out over as much again. */
const TRACK = 150, TAIL = 44;
/** How far the pointer, resting anywhere on the figure, tilts the card toward itself: degrees at the figure's edge. */
const LEAN = { roll: 13, pitch: 6 };

export default function (root: HTMLElement) {
  const svg = q<SVGSVGElement>(root, "svg.ck");
  const $ = <T extends Element = SVGElement>(sel: string) => q<T>(root, sel);
  /** An element made here, dressed like the ones the component wrote (its styles are scoped to it). */
  const make = <K extends keyof SVGElementTagNameMap>(tag: K, cls: string, into: Element, before: Element | null = null) => {
    const el = document.createElementNS(NS, tag);
    el.setAttribute("class", cls);
    for (const a of svg.getAttributeNames()) if (a.startsWith("data-astro-cid")) el.setAttribute(a, "");
    into.insertBefore(el, before);
    return el;
  };
  /**
   * Something that happens rather than is drawn (a label arriving, a line of
   * the log): it plays in its own time when the story reaches it and plays
   * back when the story leaves, so no scroll, however fast, makes it a cut.
   */
  function latch(render: (v: number) => void, seconds: number = T.state, ease = "arrive") {
    const s = { v: 0 };
    let want = false;
    render(0);
    return (on: boolean) => {
      if (on === want) return;
      want = on;
      gsap.to(s, { v: on ? 1 : 0, duration: seconds, ease, overwrite: true, onUpdate: () => render(s.v) });
    };
  }
  const fades = (el: SVGElement | SVGElement[], seconds: number = T.state) =>
    latch((v) => {
      for (const e of Array.isArray(el) ? el : [el]) e.style.opacity = v.toFixed(3);
    }, seconds);

  // ------------------------------------------------------------ the webcam
  const recDot = $<SVGTSpanElement>(".ck-recdot");
  const card = { palm: $(".ck-palm:not(.ck-thumb)"), back: $(".ck-back"), card: $(".card .ck-card"), ink: $(".card .ck-ink"), grid: $(".ck-grid"), thumb: $(".ck-thumb") };
  const tcard = $(".ck-tcard"), tink = $(".ck-tink"), tquad = $<SVGPathElement>(".ck-tquad"), tval = $<SVGTextElement>(".ck-tval");
  const det = $<SVGGElement>(".det");
  const quad = $<SVGPathElement>(".ck-quad");
  const c0 = $(".ck-c0");
  const o = $(".ck-o");
  const idTag = $<SVGTextElement>(".ck-id");
  const idx = qa<SVGTextElement>(root, ".ck-idx");
  const halos = qa<SVGLineElement>(root, ".ck-halo");
  const axes = qa<SVGLineElement>(root, ".ck-axis");
  const axisLabels = qa<SVGGElement>(root, ".ck-al");
  const hit = $<SVGRectElement>(".ck-hit");
  // The sixteen points the bits are read at. They are on the printed card, so they take its colours.
  const bitsG = make("g", "ck-bits", det, quad);
  bitsG.setAttribute("data-day", "");
  const bits = Array.from({ length: 16 }, () => ({ el: make("circle", "ck-bit", bitsG), o: -1 }));
  for (const b of bits) b.el.setAttribute("r", "1.9");

  const showC0 = fades(c0, T.press);
  const showIdx = idx.map((el) => fades(el, T.press));
  const showId = fades(idTag);
  const showO = fades(o, T.press);
  const showAxisLabel = axisLabels.map((el) => fades(el, T.press));
  const showTval = fades(tval);
  let bitsGone = 0;
  const dropBits = latch((v) => (bitsGone = v), 0.4);

  // ------------------------------------------------------------ the bridge
  const fireBtn = $(".ck-fire"), ring = $(".ck-fire-ring"), led = $(".ck-led"), arcs = $(".ck-arcs");
  const linesG = qa<SVGGElement>(root, ".ck-line");
  const lineEls = linesG.map((g) => ({
    g,
    seq: q<SVGTextElement>(g, ".ck-seq"),
    v: qa<SVGTSpanElement>(g, ".v"),
    bytes: q<SVGTextElement>(g, ".ck-bytes"),
  }));
  // The log rolls, like paper under a pen: a line comes up from the foot of its window as its
  // frame arrives, and the others move up to make room. One more line than the window shows
  // (the one coming in), all inside a window that stays put while they move.
  {
    const clip = make("clipPath", "", $("defs"));
    clip.id = "ck-roll";
    const r = make("rect", "", clip);
    for (const [k, v] of Object.entries({ x: LOG.x + 1, y: LOG.y + 31, width: LOG.w - 2, height: LOG.h - 32 })) r.setAttribute(k, String(v));
  }
  const rollWindow = make("g", "", linesG[0].parentElement!, linesG[0]);
  rollWindow.setAttribute("clip-path", "url(#ck-roll)");
  const roll = make("g", "", rollWindow);
  {
    const coming = linesG[LOG.n - 1].cloneNode(true) as SVGGElement;
    for (const t of coming.querySelectorAll("text")) t.setAttribute("y", String(LOG.top + LOG.n * LOG.step));
    linesG.push(coming);
    lineEls.push({ g: coming, seq: q<SVGTextElement>(coming, ".ck-seq"), v: qa<SVGTSpanElement>(coming, ".v"), bytes: q<SVGTextElement>(coming, ".ck-bytes") });
    for (const g of linesG) {
      // Every line is written in full ink; how bright it is shown depends on where it has got to.
      g.classList.add("new");
      roll.append(g);
    }
  }
  const liveDot = $(".ck-live"), wait = $<SVGTextElement>(".ck-wait");
  const short = $<SVGTextElement>(".ck-short");
  const shortV = qa<SVGTSpanElement>(root, ".ck-short .v");
  wait.removeAttribute("opacity");
  // The line that says it is waiting, and the stream of frames, stand in the same place: one leaves before the
  // other comes. Going forward the line is taken out by the story itself, as the pose is being solved, so it is
  // gone at the moment the first frame is sent; going back it returns once the stream has gone.
  let waiting = 0, streaming = 0, unsolved = 1;
  const paintWait = () => (wait.style.opacity = (waiting * unsolved).toFixed(3));
  const showWait = latch((v) => {
    waiting = v;
    paintWait();
  }, T.press);
  // The four wires, and the packets on them: one sent with every frame.
  const wires = qa<SVGPathElement>(root, ".ck-wire").map((path) => {
    const len = path.getTotalLength();
    const a = path.getPointAtLength(0), b = path.getPointAtLength(len);
    return { a, b, on: 0, dots: Array.from({ length: CROSS }, () => ({ el: make("circle", "dot-accent", $(".ck-pk")), o: "" })) };
  });
  for (const w of wires) for (const d of w.dots) {
    d.el.setAttribute("r", "1.8");
    d.el.style.opacity = "0";
  }
  // A press sends one ring out from the button (its radius is drawn, not scaled, so it stays where the button is).
  const pulse = { v: 0 };
  const ringR = Number(ring.getAttribute("r"));
  const drawPulse = () => {
    ring.setAttribute("r", r1(ringR * (1 + 0.9 * pulse.v)));
    ring.style.opacity = (0.9 * (1 - pulse.v)).toFixed(3);
  };
  // The badge's button can be held with the pointer.
  const press = make("circle", "ck-press", fireBtn.parentElement!);
  press.setAttribute("cx", fireBtn.getAttribute("cx")!);
  press.setAttribute("cy", fireBtn.getAttribute("cy")!);
  press.setAttribute("r", "18");

  // ------------------------------------------------------------ the sim
  const hz = qa(root, ".ck-horizon"), ptr = $(".ck-pointer");
  const spdG = $(".ck-spd"), altG = $(".ck-alt"), hdgG = $(".ck-hdg");
  const spdV = $<SVGTextElement>(".ck-spdv"), altV = $<SVGTextElement>(".ck-altv"), hdgV = $<SVGTextElement>(".ck-hdgv");
  const track = $<SVGPathElement>(".ck-track"), trendEl = $(".ck-trend"), tracer = $<SVGPathElement>(".ck-tracer"), planeMap = $(".ck-plane-map");
  const out = root.querySelector<HTMLElement>("[data-readout]");
  const byV = (sel: string, key = "v") => qa<SVGElement>(root, sel).map((el) => ({ el, v: +(el.dataset[key] ?? 0), o: -1 }));
  const spdL = byV(".ck-sl"), altL = byV(".ck-al2"), rungL = byV(".ck-rg", "d");
  const hdgL = qa<SVGTextElement>(root, ".ck-hl").map((el) => ({ el, d: +(el.dataset.d ?? 0), o: -1, text: el.textContent }));
  const fade = (ls: { el: SVGElement; v: number; o: number }[], fn: (v: number) => number) => {
    for (const l of ls) {
      const op = fn(l.v);
      if (op !== l.o) {
        l.o = op;
        l.el.setAttribute("opacity", `${op}`);
      }
    }
  };
  // Flown on, the aircraft has its own mark and its own track: what it flew
  // under the script, then what it has flown since, with the oldest of it thinning out.
  const flown = [0.16, 0.4, 1].map((op) => {
    const el = make("path", "ck-track", track.parentElement!, trendEl);
    el.style.opacity = "0";
    return { el, op };
  });
  const planeLive = make("path", "ck-plane-map", track.parentElement!);
  planeLive.setAttribute("d", planeMap.getAttribute("d")!);
  planeLive.style.opacity = "0";

  // Labels grow on phones (CSS); push the corner ids out to match. Read on resize only.
  let gap = 1;
  const measure = () => {
    gap = 1 + Math.max(0, parseFloat(getComputedStyle(idTag).fontSize) / 11 - 1) * 0.6;
  };
  measure();
  window.addEventListener("resize", measure);

  // ------------------------------------------------------------ state
  const story = { p: 0 };
  const hand = { roll: 0, pitch: 0 }; // what a drag adds to the pose
  // What the pointer, just resting on the frame, adds: the card leans toward it. A spring, so it never passes its mark.
  const lean = { roll: 0, pitch: 0, vr: 0, vp: 0, toRoll: 0, toPitch: 0 };
  let pressed = false; // the badge's button, held by the pointer
  let clock = 0; // seconds the plate has been on screen
  let lastMove = -1e9; // when the scroll last moved the story
  // Flying on (see geo/cockpit.ts): the aircraft once the script is over.
  const live = {
    on: false, // it is being flown on
    w: 0, // how much of what is shown is the flying on rather than the script
    synced: false, // it took over where the script stood, so there is nothing to cross-fade
    s: 0, // seconds of it
    rate: 0, // how fast its clock runs: it starts from the script's last frame held still, and comes up to speed
    th: EIGHT_FROM,
    roll: 0, pitch: 0, thr: 0, vr: 0, vp: 0,
    sim: { hdg: 0, alt: 0, x: 0, y: 0 } as Sim,
    gap: 0, // seconds to the next burst of fire
    firing: 0, // seconds of the current one left
    bursts: 0,
  };
  // What is on screen this frame.
  const cur = { roll: 0, pitch: 0, thr: 0, fire: false, found: false };
  let wasFire = false, fireAge = 0, fireShown = 0;
  let prevText = "";

  // The track flown on, as one polyline that is only ever added to.
  const trail = { xs: [] as number[], ys: [] as number[], len: 0, d: "", from: 0, flown: 0, dirty: false };
  const lay = (x: number, y: number) => {
    x = Math.round(x * 10) / 10;
    y = Math.round(y * 10) / 10;
    const n = trail.xs.length;
    if (n) trail.len += Math.hypot(x - trail.xs[n - 1], y - trail.ys[n - 1]);
    trail.xs.push(x);
    trail.ys.push(y);
    trail.d += `${n ? "L" : "M"}${x} ${y}`;
  };
  /** How much of the track is drawn behind the aircraft: the script's whole track at first, shortening to TRACK as it is flown away from. */
  const kept = () => Math.max(TRACK, trail.from - 0.6 * trail.flown);
  function extend(x: number, y: number) {
    const n = trail.xs.length;
    const step = Math.hypot(x - trail.xs[n - 1], y - trail.ys[n - 1]);
    if (step < 1.2) return;
    lay(x, y);
    trail.flown += step;
    trail.dirty = true;
    // Let go of what is no longer drawn, so the path stays a few hundred points however long the flight.
    const drawn = kept() + (flown.length - 1) * TAIL;
    if (trail.len < drawn + 120) return;
    let k = n, back = 0;
    while (k > 1 && back < drawn + 30) {
      back += Math.hypot(trail.xs[k] - trail.xs[k - 1], trail.ys[k] - trail.ys[k - 1]);
      k--;
    }
    const xs = trail.xs.slice(k), ys = trail.ys.slice(k);
    trail.xs = [];
    trail.ys = [];
    trail.len = 0;
    trail.d = "";
    xs.forEach((x, i) => lay(x, ys[i]));
  }

  /** The flying on takes over from the script exactly where it stands. */
  function takeOver(f: ReturnType<typeof flight>) {
    live.on = live.synced = true;
    live.w = 1;
    live.s = 0;
    live.rate = 0;
    live.th = EIGHT_FROM;
    live.roll = f.roll;
    live.pitch = f.pitch;
    live.thr = f.thr;
    live.vr = live.vp = 0;
    live.sim = { hdg: f.hdg, alt: f.alt, x: f.pos[0], y: f.pos[1] };
    live.gap = 2.4;
    live.firing = 0;
    trail.xs = [];
    trail.ys = [];
    trail.len = 0;
    trail.d = "";
    for (let i = 0; i <= f.at; i++) lay(FLIGHT.pts[i][0], FLIGHT.pts[i][1]);
    lay(f.pos[0], f.pos[1]);
    trail.from = trail.len;
    trail.flown = 0;
    trail.dirty = true;
  }

  // ------------------------------------------------------------ one frame
  let hbase = NaN;
  function render() {
    const p = story.p;
    const f = flight(phase(p, ...BEATS.fly));
    const found = phase(p, ...BEATS.stick), tFound = phase(p, ...BEATS.throttle);
    const tb = turbulence(clock);
    // How much of what is shown is the flying on.
    const k = live.synced ? 1 : live.w;
    let roll = f.roll, pitch = f.pitch, thr = f.thr, hdg = f.hdg, alt = f.alt;
    if (k > 0) {
      roll += (live.roll - roll) * k;
      pitch += (live.pitch - pitch) * k;
      thr += (live.thr - thr) * k;
      hdg += wrap180(live.sim.hdg - hdg) * k;
      alt += (live.sim.alt - alt) * k;
    }
    roll += tb.roll + hand.roll + lean.roll;
    pitch += tb.pitch + hand.pitch + lean.pitch;
    thr = clamp(thr + tb.thr, 0, 1);
    const fire = pressed || (k > 0.5 ? live.firing > 0 : f.fire);
    cur.roll = roll;
    cur.pitch = pitch;
    cur.thr = thr;
    cur.fire = fire;
    cur.found = found >= 1;

    // ---- the webcam: the card, and what the detector makes of it, in the order it makes it.
    const s = scene(roll, pitch, gap);
    setD(card.palm, s.palms);
    setD(card.back, s.back);
    setD(card.card, s.card);
    setD(card.ink, s.ink);
    setD(card.grid, s.grid);
    setD(card.thumb, s.thumbs);
    setD(quad, s.quad);

    // 1. The outline, traced from corner 0 the way the detector orders it; each corner is numbered as the line reaches it.
    const trace = phase(found, ...FOUND.trace);
    let per = 0;
    for (let i = 0; i < 4; i++) {
      const a = s.corners[i], b = s.corners[(i + 1) % 4];
      per += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    quad.style.strokeDasharray = `${r1(per * trace)} ${Math.ceil(per + 1)}`;
    quad.style.opacity = trace > 0 ? "1" : "0";
    c0.setAttribute("x", r1(s.corners[0][0] - 3));
    c0.setAttribute("y", r1(s.corners[0][1] - 3));
    showC0(trace > 0);
    s.cornerLabels.forEach(([x, y], i) => {
      idx[i].setAttribute("x", r1(x));
      idx[i].setAttribute("y", r1(y));
      showIdx[i](trace > 0 && trace >= i / 4);
    });
    // 2. Its sixteen bits, read row by row at the middle of each cell; they are the id.
    const read = phase(found, ...FOUND.bits) * 16;
    dropBits(found >= FOUND.id + 0.05);
    for (let i = 0; i < 16; i++) {
      const b = bits[i];
      const op = Math.round(clamp(read - i, 0, 1) * (1 - bitsGone) * 100) / 100;
      if (op !== b.o) b.el.style.opacity = `${(b.o = op)}`;
      if (!op) continue;
      b.el.setAttribute("cx", r1(s.cells[i][0]));
      b.el.setAttribute("cy", r1(s.cells[i][1]));
    }
    {
      const [a, , b2, b3] = s.corners;
      const dx = b3[0] - a[0], dy = b3[1] - a[1], l = Math.hypot(dx, dy) || 1;
      const off = 26 + 8 * gap;
      idTag.setAttribute("x", r1((b2[0] + b3[0]) / 2 + (dx / l) * off));
      idTag.setAttribute("y", r1((b2[1] + b3[1]) / 2 + (dy / l) * off));
      showId(found >= FOUND.id);
    }
    // 3. The pose: the three axes raised from the marker's centre, one after the other.
    const ends: P[] = [s.axes.x, s.axes.y, s.axes.z];
    const labels: P[] = [s.axisLabels.x, s.axisLabels.y, s.axisLabels.z];
    const a0 = FOUND.axes[0], each = (FOUND.axes[1] - a0) * 0.54, lag = (FOUND.axes[1] - a0 - each) / 2;
    for (let i = 0; i < 3; i++) {
      const grow = phase(found, a0 + i * lag, a0 + i * lag + each);
      const x2 = s.o[0] + (ends[i][0] - s.o[0]) * grow, y2 = s.o[1] + (ends[i][1] - s.o[1]) * grow;
      for (const l of [halos[i], axes[i]]) {
        l.setAttribute("x1", r1(s.o[0]));
        l.setAttribute("y1", r1(s.o[1]));
        l.setAttribute("x2", r1(x2));
        l.setAttribute("y2", r1(y2));
        l.style.opacity = grow > 0 ? "1" : "0";
      }
      axisLabels[i].setAttribute("transform", `translate(${r1(labels[i][0])} ${r1(labels[i][1])})`);
      showAxisLabel[i](grow >= 1);
    }
    o.setAttribute("cx", r1(s.o[0]));
    o.setAttribute("cy", r1(s.o[1]));
    showO(found >= a0);
    // The bridge stops saying it is waiting while the last of the pose is drawn.
    const left = 1 - phase(found, 0.88, 0.98);
    if (left !== unsolved) {
      unsolved = left;
      paintWait();
    }

    // The throttle card rides its rail; the detector finds it while it is still reading the stick.
    const tc = throttleCard(thr, tb.roll * 2);
    setD(tcard, tc.card);
    setD(tink, tc.ink);
    setD(tquad, tc.quad);
    const tTrace = phase(tFound, 0, 0.7);
    tquad.style.strokeDasharray = `${r1(tc.around * tTrace)} ${Math.ceil(tc.around + 1)}`;
    tquad.style.opacity = tTrace > 0 ? "1" : "0";
    tval.setAttribute("y", r1(thrY(thr)));
    const tv = thr.toFixed(2);
    if (tval.textContent !== tv) tval.textContent = tv;
    showTval(tFound >= 0.8);

    // ---- the bridge: the badge's button.
    fireBtn.classList.toggle("on", fire);
    led.classList.toggle("on", fire);
    arcs.classList.toggle("on", fire);
    if (fire && !wasFire) gsap.fromTo(pulse, { v: 0 }, { v: 1, duration: 0.7, ease: "arrive", overwrite: true, onUpdate: drawPulse });
    if (!fire && fireShown <= 0) fireAge = 0;
    wasFire = fire;

    // ---- the sim.
    const hzT = horizon(roll, pitch);
    for (const h of hz) h.setAttribute("transform", hzT);
    fade(rungL, (d) => fadeRung((pitch - d) * ADI.k));
    ptr.setAttribute("transform", pointer(roll));
    const spd = speedOf(thr);
    spdG.setAttribute("transform", spdTape(spd));
    const sv = `${Math.round(spd)}`;
    if (spdV.textContent !== sv) spdV.textContent = sv;
    fade(spdL, (v) => fadeTape((spd - v) * SPD.k));
    fade(altL, (v) => fadeTape((alt - v) * ALT.k));
    altG.setAttribute("transform", altTape(alt));
    const av = `${Math.round(alt / 10) * 10}`;
    if (altV.textContent !== av) altV.textContent = av;
    // The heading strip: slid round its base, and relabelled when the base moves on.
    const base = hdgBase(hdg);
    hdgG.setAttribute("transform", hdgTape(hdg));
    for (const l of hdgL) {
      if (base !== hbase) {
        const text = hdgName(base + l.d);
        if (text !== l.text) l.el.textContent = l.text = text;
      }
      const op = fadeHdg((base + l.d - hdg) * HDG.k);
      if (op !== l.o) l.el.setAttribute("opacity", `${(l.o = op)}`);
    }
    hbase = base;
    const hv = hdgText(hdg);
    if (hdgV.textContent !== hv) hdgV.textContent = hv;

    // The map. Under the script: its track drawn as far as the aircraft has got. Flown on: the track kept behind it.
    const scripted = live.synced ? 0 : 1 - live.w, flying = live.synced ? 1 : live.w;
    track.style.strokeDasharray = `${r1(f.len)} ${Math.ceil(FLIGHT.len + 10)}`;
    track.style.opacity = f.fly > 0 ? scripted.toFixed(3) : "0";
    planeMap.setAttribute("transform", `translate(${r1(f.pos[0])} ${r1(f.pos[1])}) rotate(${r1(f.hdg)})`);
    planeMap.style.opacity = scripted.toFixed(3);
    planeLive.style.opacity = flying.toFixed(3);
    if (flying > 0) {
      planeLive.setAttribute("transform", `translate(${r1(live.sim.x)} ${r1(live.sim.y)}) rotate(${r1(live.sim.hdg)})`);
      if (trail.dirty) {
        trail.dirty = false;
        const keep = kept();
        flown.forEach((t, j) => {
          const l = Math.min(trail.len, keep + (flown.length - 1 - j) * TAIL);
          t.el.setAttribute("d", trail.d);
          t.el.style.strokeDasharray = `${r1(l)} ${Math.ceil(trail.len + 10)}`;
          t.el.style.strokeDashoffset = r1(l - trail.len);
        });
      }
    }
    for (const t of flown) t.el.style.opacity = (t.op * flying).toFixed(3);
    const here: P = flying > 0.5 ? [live.sim.x, live.sim.y] : f.pos;
    const facing = flying > 0.5 ? live.sim.hdg : f.hdg;
    setD(trendEl, cur.found ? trend(here, facing, roll, thr) : "");
    // Rounds leave the nose in a short stream while the button is held (and the last of them clear after it is let go).
    if (fireShown > 0) {
      let d = "";
      for (let i = 0; i < 3; i++) {
        const u = (fireAge * 1.6 + i / 3) % 1, a = 12 + u * 34;
        d += `M0 ${r1(-a)}V${r1(-a - 4)}`;
      }
      tracer.setAttribute("transform", `translate(${r1(here[0])} ${r1(here[1])}) rotate(${r1(facing)})`);
      setD(tracer, d);
      tracer.style.opacity = fireShown.toFixed(2);
    } else if (tracer.getAttribute("d")) setD(tracer, "");

    const text = cur.found ? readout(roll, pitch, thr) : "waiting for markers";
    if (out && text !== prevText) out.textContent = text;
    prevText = text;
  }

  // ------------------------------------------------------------ the log
  // Frames, one a tick, for as long as there is a pose to send.
  type Frame = { seq: number; v: readonly string[]; fire: boolean };
  const buf: Frame[] = [];
  let seq = 0;
  function writeLog() {
    for (let i = 0; i < lineEls.length; i++) {
      const L = lineEls[i], fr = buf[buf.length - lineEls.length + i];
      L.g.style.visibility = fr ? "visible" : "hidden";
      if (!fr) continue;
      L.seq.textContent = `${fr.seq}`;
      fr.v.forEach((v, j) => {
        if (L.v[j].textContent !== v) L.v[j].textContent = v;
      });
      L.v[3].classList.toggle("acc", fr.fire);
      L.bytes.textContent = `${`{"roll":${fr.v[0]},"pitch":${fr.v[1]},"throttle":${fr.v[2]},"fire":${fr.v[3]}}`.length} B`;
    }
    // Phones get one short line: the newest frame's values.
    const last = buf[buf.length - 1];
    if (!last) return;
    const sv = [last.v[0], last.v[1], last.v[2]].map((v) => v.replace("-", "−")).concat(last.fire ? "  fire" : "");
    sv.forEach((v, j) => {
      if (shortV[j].textContent !== v) shortV[j].textContent = v;
    });
  }
  // The stream comes up when the pose is found and goes when it is lost, as one thing.
  const stream = [rollWindow, liveDot, short];
  const showStream = latch((v) => {
    streaming = v;
    for (const el of stream) el.style.opacity = v.toFixed(3);
    if (v === 0 && buf.length) {
      buf.length = 0;
      writeLog();
    }
  }, T.press);
  writeLog();
  /** Where the lines have rolled to, `u` of the way from one frame to the next. */
  function rollTo(u: number) {
    roll.setAttribute("transform", `translate(0 ${r1(-u * LOG.step)})`);
    for (let i = 0; i < linesG.length; i++) {
      const at = i - u; // which line of the window it is on: 0 the top one, LOG.n - 1 the foot
      // It leaves over the top and arrives from under the foot, and is brightest where it is newest.
      const edge = Math.min(clamp(1 + at / 0.8, 0, 1), clamp((LOG.n - at) / 0.8, 0, 1));
      const fresh = 0.6 + 0.4 * clamp(1 - Math.abs(at - (LOG.n - 1)), 0, 1);
      linesG[i].style.opacity = (edge * fresh).toFixed(2);
    }
  }
  rollTo(0);

  // ------------------------------------------------------------ every frame the plate is on screen
  let tick = TICK; // seconds since the last frame was sent (a first one goes the moment there is a pose)
  const spring = (x: "roll" | "pitch", v: "vr" | "vp", s: { roll: number; pitch: number; vr: number; vp: number }, to: number, w: number, dt: number) => {
    const d = s[x] - to, k = (s[v] + w * d) * dt, e = Math.exp(-w * dt);
    s[x] = to + (d + k) * e;
    s[v] = (s[v] - w * k) * e;
  };
  let drawn = -1e9; // when this loop last drew the plate
  whileVisible(root, (dt) => {
    clock += dt;
    const now = (drawn = performance.now());
    const p = story.p;
    // The script hands over when it is over, or when the page comes to rest in its last stretch;
    // it takes the aircraft back when the page is scrolled back up into the manoeuvre.
    const over = p >= 0.999 || (p >= BEATS.fly[1] - 0.07 && now - lastMove > 500);
    if (!live.on && over) {
      if (live.w > 0) live.on = true;
      else takeOver(flight(phase(p, ...BEATS.fly)));
    } else if (live.on && p < BEATS.fly[1] - 0.12) {
      live.on = false;
      live.synced = false;
    }
    if (!live.synced) live.w = clamp(live.w + (live.on ? dt : -dt) / 0.5, 0, 1);
    if (live.on && live.w >= 1) live.synced = true;

    spring("roll", "vr", lean, lean.toRoll, 6, dt);
    spring("pitch", "vp", lean, lean.toPitch, 6, dt);

    if (live.on || live.w > 0) {
      // Its clock comes up to speed over the first second, so the script's last frame is left gently, not at a step.
      live.rate += (1 - live.rate) * (1 - Math.exp(-dt / 0.55));
      const lt = dt * live.rate;
      live.s += lt;
      const ask = autopilot(live.sim, live.thr, live.th, live.s);
      live.th = ask.th;
      spring("roll", "vr", live, ask.roll, 3.2, lt);
      spring("pitch", "vp", live, ask.pitch, 1.8, lt);
      live.thr += (ask.thr - live.thr) * (1 - Math.exp(-lt / 1.2));
      // The sim is flown by what the card shows: the hands on it, the pointer's lean, and the air.
      const tb = turbulence(clock);
      advance(live.sim, live.roll + tb.roll + hand.roll + lean.roll, live.pitch + tb.pitch + hand.pitch + lean.pitch, live.thr, lt / PACE, FLIGHT.scale);
      live.sim.alt = clamp(live.sim.alt, ALT_LIMITS[0], ALT_LIMITS[1]);
      extend(live.sim.x, live.sim.y);
      // A burst of fire now and then, at uneven intervals (fractions of a multiple of the golden ratio).
      if (live.firing > 0) live.firing -= dt;
      else if ((live.gap -= lt) <= 0) {
        const r = (++live.bursts * 0.618034) % 1;
        live.firing = 0.5 + 0.5 * r;
        live.gap = 4.5 + 7 * ((live.bursts * 0.381966) % 1);
      }
    }
    fireAge += dt;
    fireShown = clamp(fireShown + (cur.fire ? dt : -dt) / 0.14, 0, 1);
    render();

    // The bridge: a frame every tick while there is a pose, and a packet on each wire for every frame.
    const sending = cur.found;
    showStream(sending);
    showWait(!cur.found && streaming < 0.02);
    if (sending) {
      // (The first frame goes the moment sending starts: the clock was left a whole tick along.)
      tick += dt;
      while (tick >= TICK) {
        tick -= TICK;
        buf.push({ seq: ++seq, v: frame(cur.roll, cur.pitch, cur.thr, cur.fire), fire: cur.fire });
        if (buf.length > lineEls.length) buf.shift();
        writeLog();
      }
      rollTo(tick / TICK);
    } else tick = TICK;
    wires.forEach((w, i) => {
      // The pose, the frames to the HUD and to the map flow while frames are being sent; the badge's wire only while its button is held.
      const want = i === 1 ? cur.fire : sending;
      w.on = clamp(w.on + (want ? dt : -dt) / 0.25, 0, 1);
      w.dots.forEach((d, j) => {
        const u = (tick / TICK + j) / CROSS;
        // Each fades in at the top of its wire and out at the foot, so none appears or lands in one frame.
        const op = (w.on * Math.min(1, u * 5, (1 - u) * 5)).toFixed(2);
        if (op !== d.o) d.el.style.opacity = d.o = op;
        if (op === "0.00") return;
        d.el.setAttribute("cx", r1(w.a.x + (w.b.x - w.a.x) * u));
        d.el.setAttribute("cy", r1(w.a.y + (w.b.y - w.a.y) * u));
      });
    });
    // The camera's light breathes rather than blinks.
    recDot.style.fillOpacity = (0.6 + 0.4 * Math.cos(clock * 3.6)).toFixed(2);
  });

  // ------------------------------------------------------------ the story
  // Where in the plate, px below its top, a height of the drawing falls.
  const below = (y: number) => {
    const r = root.getBoundingClientRect(), b = svg.getBoundingClientRect();
    return b.top - r.top + (y / VIEW.h) * b.height;
  };
  render();
  const tl = scrubbed(root, { start: () => `top+=${Math.round(below(FIRST))} ${LINE}%`, end: "center 50%" });
  tl.to(story, {
    p: 1,
    duration: 1,
    onUpdate() {
      lastMove = performance.now();
      // Off screen the loop above is asleep; the story is still drawn, so the plate is right the moment it is seen.
      if (lastMove - drawn > 120) render();
    },
  });
  // What is above the plate can change height after it has measured itself
  // (type is split into lines to rise, then put back); measure again then.
  {
    const st = tl.scrollTrigger!;
    let queued = false;
    const again = () => {
      queued = false;
      st.refresh();
      st.update();
    };
    const ro = new ResizeObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(again);
    });
    ro.observe(document.body);
    ro.observe(root);
  }

  // ------------------------------------------------------------ pointer
  // Resting on the figure, the pointer tilts the card a little toward itself; a
  // drag on the camera frame tilts it further, by hand, and it eases back on
  // release. Flown on, either one steers the aircraft. Up and down on a touch
  // screen is still the page's.
  let drag: { id: number; x: number; y: number; on: boolean; r0: number; p0: number; k: number } | null = null;
  const rest = () => {
    lean.toRoll = lean.toPitch = 0;
  };
  hit.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") {
      if (e.button !== 0) return;
      e.preventDefault();
    }
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false, r0: hand.roll, p0: hand.pitch, k: VIEW.w / svg.getBoundingClientRect().width };
  });
  // Where the figure is in the window: measured when the pointer comes onto it, and again only if the page has moved since.
  let box: DOMRect | null = null, boxAt = 0;
  svg.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || drag?.on) return;
    if (!box || boxAt !== window.scrollY) {
      box = svg.getBoundingClientRect();
      boxAt = window.scrollY;
    }
    lean.toRoll = clamp(((e.clientX - box.left) / box.width - 0.5) * 2, -1, 1) * LEAN.roll;
    lean.toPitch = -clamp(((e.clientY - box.top) / box.height - 0.5) * 2, -1, 1) * LEAN.pitch;
  });
  svg.addEventListener("pointerleave", () => {
    box = null;
    rest();
  });
  window.addEventListener("resize", () => (box = null));
  hit.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.on) {
      if (Math.hypot(dx, dy) < 6) return;
      drag.on = true;
      gsap.killTweensOf(hand);
      hit.setPointerCapture(e.pointerId);
      hit.classList.add("dragging");
      rest();
    }
    hand.roll = clamp(drag.r0 + dx * drag.k * 0.24, -34, 34);
    hand.pitch = clamp(drag.p0 - dy * drag.k * 0.16, -18, 18);
  });
  const release = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.on) gsap.to(hand, { roll: 0, pitch: 0, duration: 1.2, ease: "arrive" });
    hit.classList.remove("dragging");
    drag = null;
  };
  hit.addEventListener("pointerup", release);
  hit.addEventListener("pointercancel", release);

  // The badge's fire button: held, it fires.
  press.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pressed = true;
    press.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  const letGo = () => (pressed = false);
  press.addEventListener("pointerup", letGo);
  press.addEventListener("pointercancel", letGo);
}
