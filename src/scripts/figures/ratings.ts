import { gsap, scrubbed, whileVisible, phase, qa, q } from "../motion";

interface G {
  lines: [number, number, number, string][][]; // x, y, rating, "Mon YYYY" per contest; the top-rated contestant is last
  b: number; t: number; l: number; r: number; min: number; max: number;
  hx: number; d0: number; d1: number;
}
const NS = "http://www.w3.org/2000/svg";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The scroll story, as fractions of it. Everything is in place by DONE: the
// figure must be finished, and its pointer and its replay at work, when the
// plate rests in the middle of the window, which is a little before the story's
// own end (about 0.92 of it).
const CARRY = [0.7, 0.755] as const;  // the eight current ratings cross to the distribution
const BINS = [0.745, 0.88] as const;  // the distribution grows out of the line they land on, from the median outwards
const MED = [0.85, 0.895] as const;   // the median is marked
const DONE = 0.9;
// The plate is let out from the top as it rises past a line a little above the
// foot of the window (reveal.ts), so the story goes down the plate with it:
// each tier's rule as it comes out, then the time axis, then the histories,
// which start near the plot's foot.
const FOLD = 0.94;

const STEPW = 7;  // plot units of cursor travel in which a step is drawn
const DOTW = 12;  // ... in which a contest's dot comes up
const GLOW = 24;  // ... for which a contest's line lingers behind the cursor
const FLASH = [0.36, 0.25, 0.15, 0.07]; // the lingering lines, in four strengths

/** A small seeded generator, so the ambient replay is the same on every load. */
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function (root: HTMLElement) {
  const svg = q<SVGSVGElement>(root, "svg.rt");
  const G: G = JSON.parse(svg.dataset.g!);
  const { l: L, r: R, t: T, b: B, hx: HX } = G;
  const readout = root.querySelector<HTMLElement>("[data-readout]");
  const REST = readout?.textContent ?? "";
  const arrive = gsap.parseEase("arrive"), swap = gsap.parseEase("swap");
  const rand = mulberry(7);

  // Writes are skipped when nothing changed: most parts are still on most frames.
  const seen = new WeakMap<object, Map<string, string>>();
  const fresh = (el: object, key: string, v: string) => {
    let m = seen.get(el);
    if (!m) seen.set(el, (m = new Map()));
    if (m.get(key) === v) return false;
    m.set(key, v);
    return true;
  };
  const attr = (el: Element, k: string, v: string) => { if (fresh(el, k, v)) el.setAttribute(k, v); };
  const css = (el: SVGElement | HTMLElement, k: string, v: string) => { if (fresh(el, `s:${k}`, v)) el.style.setProperty(k, v); };
  const op = (el: SVGElement | HTMLElement, v: number) => css(el, "opacity", v <= 0.004 ? "0" : v >= 0.996 ? "1" : v.toFixed(3));
  const text = (el: Element, v: string) => { if (fresh(el, "text", v)) el.textContent = v; };
  const say = (v: string) => { if (readout) text(readout, v); };
  const mk = <E extends SVGElement>(tag: string, cls: string, before: Element | null, parent: Element = svg) => {
    const el = document.createElementNS(NS, tag) as E;
    el.setAttribute("class", cls);
    parent.insertBefore(el, before);
    return el;
  };
  /** A stroke drawn from its first end: u in 0..1. (A part hidden at this width has no length to measure, and is never seen.) */
  const ruled = (el: SVGGeometryElement) => {
    let len = 0;
    try {
      len = el.getTotalLength();
    } catch {
      len = 0;
    }
    el.style.strokeDasharray = `${len} ${len}`;
    return (u: number) => {
      css(el, "stroke-dashoffset", (len * (1 - u)).toFixed(2));
      op(el, u > 0 ? 1 : 0);
    };
  };

  // ---- the parts -----------------------------------------------------------
  const trajs = [...qa<SVGGElement>(svg, ".lines .traj"), q<SVGGElement>(svg, ".traj.lead")];
  const K = trajs.length, LEAD = K - 1;
  const stepEl = trajs.map((g) => q<SVGPathElement>(g, ".step"));
  const dotEl = trajs.map((g) => q<SVGPathElement>(g, ".dots"));
  const STEP_D = stepEl.map((el) => el.getAttribute("d")!);
  const DOT_D = dotEl.map((el) => el.getAttribute("d")!);
  const XS = G.lines.map((l) => l.map((v) => v[0]));
  const YS = G.lines.map((l) => l.map((v) => v[1]));
  const DOT_R = trajs.map((_, k) => (k === LEAD ? 1.8 : 1.5));
  const END = XS.map((xs) => xs[xs.length - 1]);

  const ruleEls = qa<SVGLineElement>(svg, ".tiers .rule");
  const rules = ruleEls.map(ruled);
  const nums = qa<SVGTextElement>(svg, ".tiers text.num");
  const names = qa<SVGTextElement>(svg, ".tiers text.tier");
  const axisEl = q<SVGLineElement>(svg, ".ax");
  const axis = ruled(axisEl);
  const nameAt = names.map(() => 0.1); // when each tier's name comes up
  const years = qa<SVGLineElement>(svg, ".yt").map((tick, i) => ({ tick, label: qa<SVGTextElement>(svg, "text.yr")[i], x: Number(tick.getAttribute("x1")) }));

  const bins = qa<SVGRectElement>(svg, ".hist .bin").map((el, i) => {
    const cnt = qa<SVGTextElement>(svg, ".hist .cnt")[i];
    return { el, cnt, w: Number(el.dataset.w), n: Number(cnt.textContent), cx: Number(cnt.getAttribute("x")), y: Number(el.getAttribute("y")) + Number(el.getAttribute("height")) / 2 };
  });
  const histAxis = ruled(q<SVGLineElement>(svg, ".hist .faint"));
  const histTop = q<SVGTextElement>(svg, ".hk-top");
  const medTick = q<SVGLineElement>(svg, ".hist .med");
  const medKey = [q<SVGLineElement>(svg, ".hk-med"), q<SVGTextElement>(svg, ".hk-key")];
  const medY = Number(medTick.getAttribute("y1"));
  // The distribution grows from the bin the median sits in, outwards.
  const medBin = bins.reduce((best, b, i) => (Math.abs(b.y - medY) < Math.abs(bins[best].y - medY) ? i : best), 0);

  const head = q<SVGGElement>(svg, ".head");
  const ring = q<SVGCircleElement>(head, ".ring");
  const pulse = q<SVGCircleElement>(head, ".pulse");
  const headText = qa<SVGTextElement>(head, "text");

  // Made here rather than shipped: none of it is part of the finished figure.
  const lines = q<SVGGElement>(svg, ".lines");
  const flashLayer = mk<SVGGElement>("g", "flashes", lines);
  const flashes = FLASH.map((a) => {
    const el = mk<SVGPathElement>("path", "flash", null, flashLayer);
    el.style.strokeOpacity = String(a);
    return el;
  });
  const cursor = mk<SVGLineElement>("line", "cur", lines);
  op(cursor, 0);
  const tips = trajs.map((_, k) => {
    const el = mk<SVGCircleElement>("circle", k === LEAD ? "tip lead" : "tip", head);
    el.setAttribute("r", k === LEAD ? "2.6" : "1.9");
    op(el, 0);
    return el;
  });

  // ---- the playhead ----------------------------------------------------------
  // Half the contests these eight entered fall in ten weeks of autumn 2024. A
  // cursor moving at one speed would cross them in a blink, so it slows where
  // contests crowd: its pace follows a blend of the calendar and a smoothed
  // count of contests. The time axis itself stays linear; only the playhead
  // lingers.
  const stamps = [...new Set(XS.flat())].sort((a, b) => a - b);
  const STEP = 0.5, CELLS = Math.round((R - L) / STEP);
  const cum = new Float32Array(CELLS + 1);
  {
    const H = 16, CAL = 0.42;
    for (let i = 1; i <= CELLS; i++) {
      const x = L + (i - 0.5) * STEP;
      let dens = 0;
      for (const s of stamps) dens += Math.max(0, 1 - Math.abs(x - s) / H) / H;
      cum[i] = cum[i - 1] + (CAL / (R - L) + ((1 - CAL) * dens) / stamps.length) * STEP;
    }
    for (let i = 1; i <= CELLS; i++) cum[i] /= cum[CELLS];
  }
  /** Where the cursor is, in plot units, at fraction `s` of its sweep. */
  function cursorAt(s: number) {
    if (s <= 0) return L;
    if (s >= 1) return R;
    let lo = 0, hi = CELLS;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid; else hi = mid;
    }
    return L + (lo + (s - cum[lo]) / Math.max(1e-9, cum[hi] - cum[lo])) * STEP;
  }
  const monthAt = (x: number) => {
    const d = new Date(G.d0 + ((x - L) / (R - L)) * (G.d1 - G.d0));
    return `${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  };

  /** How many of a contestant's contests lie at or before x. */
  const passed = (k: number, x: number) => {
    const xs = XS[k];
    let n = 0;
    while (n < xs.length && xs[n] <= x) n++;
    return n;
  };
  /** A contestant's rating (as a height) at x. `soft` draws a step over a little travel rather than at once. */
  function heightAt(k: number, x: number, n: number, soft: boolean) {
    const xs = XS[k], ys = YS[k];
    if (!soft || n < 2) return ys[n - 1];
    const w = Math.min(STEPW, n < xs.length ? xs[n] - xs[n - 1] : STEPW);
    const v = w <= 0 ? 1 : Math.min(1, (x - xs[n - 1]) / w);
    return ys[n - 2] + (ys[n - 1] - ys[n - 2]) * v;
  }

  /** Every history as far as the date at x. */
  function drawLines(x: number) {
    for (let k = 0; k < K; k++) {
      const xs = XS[k], ys = YS[k], r = DOT_R[k];
      if (x >= END[k] + Math.max(STEPW, DOTW)) {
        attr(stepEl[k], "d", STEP_D[k]);
        attr(dotEl[k], "d", DOT_D[k]);
        op(stepEl[k], 1);
        op(dotEl[k], 1);
        continue;
      }
      const n = passed(k, x);
      op(stepEl[k], n ? 1 : 0);
      op(dotEl[k], n ? 1 : 0);
      if (!n) continue;
      let d = `M${xs[0]} ${ys[0]}`;
      for (let i = 1; i < n - 1; i++) d += `H${xs[i]}V${ys[i]}`;
      if (n > 1) d += `H${xs[n - 1]}V${heightAt(k, x, n, true).toFixed(1)}`;
      if (n < xs.length) d += `H${x.toFixed(1)}`;
      attr(stepEl[k], "d", d);
      let dd = "";
      for (let i = 0; i < n; i++) {
        const s = x - xs[i] >= DOTW ? 1 : arrive(Math.max(0, (x - xs[i]) / DOTW));
        const rr = r * s;
        if (rr < 0.05) continue;
        dd += `M${(xs[i] - rr).toFixed(1)} ${ys[i]}a${rr.toFixed(2)} ${rr.toFixed(2)} 0 1 0 ${(2 * rr).toFixed(2)} 0a${rr.toFixed(2)} ${rr.toFixed(2)} 0 1 0 ${(-2 * rr).toFixed(2)} 0`;
      }
      attr(dotEl[k], "d", dd || "M0 0");
    }
  }

  /** The contests just behind the cursor: each is ruled up the plot from the time axis as the cursor passes it, and fades as the cursor leaves. */
  function drawFlashes(x: number, on: boolean) {
    const d = ["", "", "", ""];
    if (on) {
      for (const s of stamps) {
        const u = (x - s) / GLOW;
        if (u < 0 || u >= 1) continue;
        d[Math.min(3, Math.floor(u * 4))] += `M${s} ${B}V${(B - (B - T) * Math.min(1, u / 0.14)).toFixed(1)}`;
      }
    }
    flashes.forEach((el, i) => attr(el, "d", d[i] || "M0 0"));
  }

  /**
   * One marker per contestant on the cursor: solid while it is the tip of a
   * line being drawn, hollow once that contestant's last contest is behind it
   * and the rating is only being held.
   */
  function drawTips(x: number, at: number, alpha: number, soft: boolean) {
    for (let k = 0; k < K; k++) {
      const n = passed(k, x);
      if (!n || alpha <= 0) { op(tips[k], 0); continue; }
      attr(tips[k], "cx", at.toFixed(1));
      attr(tips[k], "cy", heightAt(k, x, n, soft).toFixed(1));
      tips[k].classList.toggle("held", x > END[k]);
      op(tips[k], alpha);
    }
  }
  function drawCursor(x: number, top: number, alpha: number) {
    attr(cursor, "x1", x.toFixed(1));
    attr(cursor, "x2", x.toFixed(1));
    attr(cursor, "y1", top.toFixed(1));
    attr(cursor, "y2", String(B));
    op(cursor, alpha);
  }

  // ---- the scroll story ------------------------------------------------------
  const leadEnd = END[LEAD];
  const st = { p: 0 };
  let replaying = false; // the loop at rest has the cursor (see below); the story leaves it alone until it is given back
  let focus = -1, focusI = 0; // the history, and the result on it, that the pointer is reading
  const SWEEP = [0.3, CARRY[0]];        // a cursor carries the date across; every history is drawn up to it
  const RULED = ruleEls.map(() => 0.1); // when each tier's rule is ruled
  let AXIS = 0.3;                       // when the time axis is
  function measure() {
    const vh = window.innerHeight, box = root.getBoundingClientRect();
    const span = 0.4 * vh + box.height / 2;
    /** How far into the story the page is when a height on the page comes out from under the fold. */
    const out = (y: number) => (y - box.top - (FOLD - 0.85) * vh) / span;
    ruleEls.forEach((el, j) => (RULED[j] = Math.max(0.03, Math.min(0.42, out(el.getBoundingClientRect().bottom) + 0.012))));
    names.forEach((el, j) => (nameAt[j] = Math.max(0.03, Math.min(0.44, out(el.getBoundingClientRect().bottom) + 0.012))));
    const plot = svg.getBoundingClientRect(), unit = plot.height / svg.viewBox.baseVal.height;
    AXIS = Math.max(0.1, Math.min(0.44, out(plot.top + B * unit) + 0.008));
    // The histories begin among the lowest tiers: the cursor sets off once their first results are out.
    const first = Math.max(...YS.map((ys) => ys[0]));
    SWEEP[0] = Math.max(0.18, Math.min(0.42, out(plot.top + (first + 8) * unit) + 0.01));
  }
  function render() {
    const p = st.p;

    // Set-up: each tier's rule is ruled across as it comes out, its number and name with it; then the time axis.
    rules.forEach((draw, j) => {
      const u = phase(p, RULED[j], RULED[j] + 0.11);
      draw(u);
      op(nums[j], phase(u, 0.05, 0.5));
    });
    names.forEach((el, j) => op(el, phase(p, nameAt[j], nameAt[j] + 0.06)));
    const ax = phase(p, AXIS, AXIS + 0.1);
    axis(ax);
    const pen = L + (R - L) * ax;
    for (const y of years) {
      const u = phase(pen, y.x - 2, y.x + 14);
      op(y.tick, u);
      op(y.label, u);
    }

    // Action: the date sweeps across, and every history is drawn up to it at once.
    const s = phase(p, SWEEP[0], SWEEP[1]);
    const x = cursorAt(s);
    const far = p >= SWEEP[1] ? R + 60 : x;
    drawLines(far);

    // Resolution: the cursor stops at today; the eight current ratings cross to the distribution and land on its axis.
    // (Once the story is done the cursor belongs to the loop below.)
    if (p < DONE && !replaying) {
      const carry = swap(phase(p, CARRY[0], CARRY[1]));
      op(flashLayer, 1);
      drawFlashes(x, s > 0 && p < CARRY[1]);
      drawCursor(x, T, Math.min(phase(p, SWEEP[0] - 0.02, SWEEP[0] + 0.02), 1 - phase(p, CARRY[0], CARRY[0] + 0.03)) * 0.5);
      drawTips(x, x + (HX - R) * carry, s > 0 ? 1 - phase(p, CARRY[1] + 0.01, CARRY[1] + 0.075) : 0, true);
    }
    histAxis(phase(p, CARRY[0] + 0.02, CARRY[1]));

    let counted = 0;
    bins.forEach((b, i) => {
      const from = BINS[0] + Math.abs(i - medBin) * 0.004;
      const u = phase(p, from, from + BINS[1] - BINS[0] - 0.05);
      const n = Math.round(b.n * u);
      counted += n;
      attr(b.el, "width", (b.w * u).toFixed(2));
      op(b.el, u > 0 ? 1 : 0);
      // The count reads the bar as it grows; a bin of one or two is not counted until someone is in it.
      text(b.cnt, String(u >= 1 ? b.n : Math.max(1, n)));
      attr(b.cnt, "x", (b.cx - b.w * (1 - u)).toFixed(1));
      op(b.cnt, n >= 1 ? phase(u, 0.1, 0.5) : 0);
    });
    // (The count is shown once there is someone in it.)
    op(histTop, counted > 0 ? phase(p, BINS[0], BINS[0] + 0.04) : 0);
    text(histTop, `${Math.max(1, counted)} rated users`);
    const med = phase(p, MED[0], MED[1]);
    attr(medTick, "transform", `translate(${(-7 * (1 - arrive(med))).toFixed(2)} 0)`);
    op(medTick, phase(med, 0, 0.4));
    medKey.forEach((el) => op(el, phase(med, 0.3, 1)));

    // The top-rated contestant's marker lands as the cursor passes their last contest.
    const land = phase(x, leadEnd + 1, leadEnd + 22);
    attr(ring, "transform", `scale(${arrive(phase(land, 0, 0.55)).toFixed(3)})`);
    op(ring, land > 0 ? 1 : 0);
    headText.forEach((el, i) => {
      const u = phase(land, 0.3 + i * 0.18, 0.82 + i * 0.18);
      op(el, u);
      attr(el, "transform", `translate(${(-5 * (1 - arrive(u))).toFixed(2)} 0)`);
    });

    // The readout is the date under the cursor, then the count as the distribution fills.
    if (p >= DONE) {
      if (focus < 0) say(REST);
    } else if (p >= MED[0] + 0.3 * (MED[1] - MED[0])) say(REST.replace(/^\d+/, String(counted)));
    else if (counted > 0) say(`${counted} rated users`);
    else say(monthAt(x));
  }
  measure();
  scrubbed(root, { start: "top 85%", end: "center 45%", onRefresh: () => { measure(); render(); } }).to(st, { p: 1, duration: 1, onUpdate: render });
  render();

  // ---- at rest: the marker breathes, and now and then the cursor goes over the history again ----
  const tag = q<SVGGElement>(svg, ".tag");
  const tagR = q<SVGRectElement>(tag, ".tag-r");
  const tagD = q<SVGCircleElement>(tag, ".tag-d");
  const tagV = q<SVGTextElement>(tag, ".tag-v");
  const hit = q<SVGRectElement>(svg, ".hit");
  svg.dataset.live = "";

  let ptr: { x: number; y: number } | null = null; // the pointer, in plot units, while it is over the plot
  let small = false;
  const probe = { x: L, a: 0, sweep: -2.2, glow: 0 }; // sweep < 0 is the wait before the next replay
  const SWEEP_S = 7.5;
  const beat = { t: 1.2, u: 1 }; // the marker's ring: time to the next, and how far the current one has spread
  const tagAt = { x: 0, y: 0, a: 0, set: false };

  function setFocus(k: number, i: number) {
    if (k === focus && i === focusI) return;
    if (k !== focus) {
      trajs.forEach((g, j) => g.classList.toggle("on", j === k));
      svg.classList.toggle("focus", k >= 0);
      css(tagD, "stroke", k === LEAD ? "var(--accent)" : "");
    }
    focus = k;
    focusI = i;
    if (k < 0) { say(REST); return; }
    const [, , r, when] = G.lines[k][i];
    text(tagV, `${when}: ${r}`);
    say(`${when}: rated ${r}`);
    // Sized from its own type, once per reading (never per frame).
    const fs = parseFloat(getComputedStyle(tagV).fontSize) || 13;
    const pad = fs * 0.6;
    const w = tagV.getComputedTextLength() + pad * 2, h = fs * 1.7;
    const px = XS[k][i], py = YS[k][i];
    const x0 = px + 10 + w > R + 40 ? -10 - w : 10;
    const y0 = py - h - 6 < T ? 6 : -h - 6;
    attr(tagR, "x", x0.toFixed(1));
    attr(tagR, "y", y0.toFixed(1));
    attr(tagR, "width", w.toFixed(1));
    attr(tagR, "height", h.toFixed(1));
    attr(tagV, "x", (x0 + pad).toFixed(1));
    attr(tagV, "y", (y0 + h / 2 + fs * 0.35).toFixed(1));
  }

  /** The history nearest the pointer at its date: the one whose rating then is closest, held on to until another is clearly closer. */
  function nearest(x: number, y: number) {
    const reach = small ? 44 : 30;
    let best = -1, bd = reach, bn = 0;
    for (let k = 0; k < K; k++) {
      const n = passed(k, x);
      if (!n) continue;
      const d = Math.abs(YS[k][n - 1] - y) - (k === focus ? 5 : 0);
      if (d < bd) { bd = d; best = k; bn = n; }
    }
    setFocus(best, Math.max(0, bn - 1));
  }

  whileVisible(root, (dt) => {
    const done = st.p >= DONE;
    // The ring on the top-rated contestant: irregular, never a metronome.
    if (!done) { beat.u = 1; beat.t = 0.9; }
    else if (beat.u < 1) beat.u = Math.min(1, beat.u + dt / 1.5);
    else if ((beat.t -= dt) <= 0) { beat.u = 0; beat.t = 1.1 + rand() * 2.6; }
    attr(pulse, "r", (4.5 + 8 * arrive(beat.u)).toFixed(2));
    attr(pulse, "opacity", (0.55 * (1 - beat.u) ** 1.5).toFixed(3));

    if (!done) {
      // The story has been taken back. Whatever the loop was showing lets go over a few frames,
      // and then the cursor is the story's again.
      if (replaying) {
        probe.a -= probe.a * Math.min(1, dt * 18);
        tagAt.a = Math.min(tagAt.a, probe.a);
        if (probe.a < 0.02) {
          replaying = false;
          probe.a = probe.glow = tagAt.a = 0;
          setFocus(-1, 0);
          attr(tag, "opacity", "0");
          render();
        } else {
          drawCursor(probe.x, T, probe.a * 0.5);
          drawTips(probe.x, probe.x, probe.a, false);
          op(flashLayer, probe.glow * Math.min(1, probe.a * 1.4));
          attr(tag, "opacity", tagAt.a.toFixed(3));
        }
      }
      probe.sweep = -2.2;
      return;
    }
    replaying = true;
    let want = 0;
    if (ptr) {
      // The cursor goes to the pointer; if it was part-way through a replay it runs there rather than jumping.
      probe.x = probe.a < 0.05 || Math.abs(ptr.x - probe.x) < 0.5 ? ptr.x : probe.x + (ptr.x - probe.x) * Math.min(1, dt * 30);
      probe.sweep = Math.min(probe.sweep, -3.5);
      want = 1;
      nearest(ptr.x, ptr.y);
    } else {
      if (focus >= 0) setFocus(-1, 0);
      probe.sweep += dt;
      if (probe.sweep >= SWEEP_S) probe.sweep = -(6 + rand() * 5);
      if (probe.sweep >= 0) {
        probe.x = cursorAt(probe.sweep / SWEEP_S);
        want = Math.min(1, probe.sweep / 0.5, (SWEEP_S - probe.sweep) / 0.7) * 0.8;
      }
    }
    probe.a += (want - probe.a) * Math.min(1, dt * (want > probe.a ? 14 : 7));
    if (probe.a < 0.01 && want === 0) probe.a = 0;
    drawCursor(probe.x, T, probe.a * 0.5);
    drawTips(probe.x, probe.x, probe.a, false);
    probe.glow += ((ptr ? 0 : 1) - probe.glow) * Math.min(1, dt * 6);
    drawFlashes(probe.x, !ptr && probe.sweep >= 0);
    op(flashLayer, probe.glow * Math.min(1, probe.a * 1.4));

    // The tag glides to the result it reads rather than jumping there.
    const show = focus >= 0 ? 1 : 0;
    if (focus >= 0) {
      const tx = XS[focus][focusI], ty = YS[focus][focusI];
      if (!tagAt.set || tagAt.a < 0.02) { tagAt.x = tx; tagAt.y = ty; tagAt.set = true; }
      const kf = Math.min(1, dt * 20);
      tagAt.x += (tx - tagAt.x) * kf;
      tagAt.y += (ty - tagAt.y) * kf;
    }
    tagAt.a += (show - tagAt.a) * Math.min(1, dt * (show ? 16 : 9));
    if (tagAt.a < 0.01 && !show) tagAt.a = 0;
    attr(tag, "transform", `translate(${tagAt.x.toFixed(1)} ${tagAt.y.toFixed(1)})`);
    attr(tag, "opacity", tagAt.a.toFixed(3));
    // (Its ring stays on the result itself; only the label is on the way.)
    if (focus >= 0) {
      attr(tagD, "cx", (XS[focus][focusI] - tagAt.x).toFixed(1));
      attr(tagD, "cy", (YS[focus][focusI] - tagAt.y).toFixed(1));
    }
  });

  // ---- pointer: the cursor follows the pointer, and reads the nearest history at that date ----
  new ResizeObserver(() => { small = svg.getBoundingClientRect().width < 450; }).observe(svg);
  let pending: PointerEvent | null = null;
  let timer = 0;
  function read() {
    const e = pending;
    pending = null;
    if (!e) return;
    const m = svg.getScreenCTM();
    if (!m) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    ptr = { x: Math.max(L, Math.min(R, pt.x)), y: pt.y };
  }
  const onPointer = (e: PointerEvent) => {
    clearTimeout(timer);
    if (!pending) requestAnimationFrame(read);
    pending = e;
  };
  const release = () => { pending = null; ptr = null; };
  hit.addEventListener("pointermove", onPointer);
  hit.addEventListener("pointerdown", onPointer);
  hit.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") release();
    else timer = window.setTimeout(release, 2500);
  });
  hit.addEventListener("pointercancel", () => { timer = window.setTimeout(release, 2500); });
}
