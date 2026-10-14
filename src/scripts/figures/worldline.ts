import { scrubbed, q, qa, whileVisible, phase } from "../motion";
import {
  FRAMES, MAX_BODIES, VIEW_W, VIEW_H, CX, CY, TRAIL, ACCENT_TRAIL, TRAIL_ALPHA, ACCENT_ALPHA,
  A_INNER, A_OUTER,
  createUniverse, generate, generator, fingerprint, hex, sci, sparkPath, sparkY, runningMax, camDeg, type Universe,
} from "../worldline";

const F = FRAMES - 1;
const RINGS = [60, 120, 180, 240, 300];
const SPARK_W = 150, SPARK_H = 36;
// Camera breathing: a slow yaw about the disk's axis and a small change of
// elevation, both around the seeded camera. Radians; period in seconds.
const YAW = 0.11, TILT = 0.035, PERIOD = 26;
const RING_LABEL_ANGLE = 0.32;

// The story, in scroll progress. First the universe is generated: the bodies
// are placed one at a time in the order the generator draws them. Then its
// 900 frames are played. Nothing after RUN: with the plate in the middle of
// the window the last frame is on screen.
const GEN: [number, number] = [0, 0.19];
const RUN: [number, number] = [0.19, 0.93];
/** How many bodies' worth of placing a body's mark takes to close on it. */
const MARK = 12;
/** The story starts when this much of the viewport has come this far up the window (a share of each). */
const SHOWN = 0.4, LINE = 92;
/** How near the pointer must be to a body to read it, CSS px. */
const REACH = 26;

// Simulating 900 frames takes a while the first time. It is done in slices
// while the figure is still off screen, and the figure wakes once it is ready;
// until then the page keeps the frame the server drew.
export default function (root: HTMLElement) {
  const u = createUniverse();
  const next = generator(q<HTMLInputElement>(root, "#wl-seed").value, u);
  const idle = (fn: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 300 }) : setTimeout(fn, 32));
  const pump = () => (next(5) ? start(root, u) : idle(pump));
  idle(pump);
}

function start(root: HTMLElement, u: Universe) {
  const stage = q<HTMLDivElement>(root, ".wl-stage");
  const snap = q<SVGSVGElement>(root, ".wl-snap");
  const canvas = q<HTMLCanvasElement>(root, ".wl-canvas");
  const input = q<HTMLInputElement>(root, "#wl-seed");
  const track = q<HTMLDivElement>(root, ".wl-track");
  const head = q<HTMLSpanElement>(root, ".wl-head");
  const fill = q<HTMLSpanElement>(root, ".wl-fill");
  const ghost = q<HTMLSpanElement>(root, ".wl-ghost");
  const ghostN = q<HTMLSpanElement>(ghost, ".num");
  const keys = qa<HTMLSpanElement>(root, ".wl-key");
  const camEl = q<HTMLSpanElement>(root, "[data-cam]");
  const pickEl = q<HTMLSpanElement>(root, "[data-pick]");
  const frameEl = q<HTMLSpanElement>(root, "[data-frame]");
  const deEl = q<HTMLSpanElement>(root, "[data-de]");
  const deMaxEl = q<HTMLSpanElement>(root, "[data-demax]");
  const hashEl = q<HTMLSpanElement>(root, "[data-hash]");
  const nEl = q<HTMLSpanElement>(root, "[data-n]");
  const massEl = q<HTMLSpanElement>(root, "[data-mass]");
  const cEls = [0, 1, 2, 3].map((i) => q<HTMLSpanElement>(root, `[data-c${i}]`));
  const sline = q<SVGPathElement>(root, ".wl-sline");
  const sahead = q<SVGPathElement>(root, ".wl-sahead");
  const played = q<SVGRectElement>(root, "[data-played]");
  const scur = q<SVGLineElement>(root, ".wl-scur");
  const smax = q<SVGCircleElement>(root, ".wl-smax");
  const snow = q<SVGPathElement>(root, ".wl-snow");
  const readout = root.querySelector<HTMLElement>("[data-readout]");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // A canvas keeps the colours it was painted with, so they are read from the
  // tokens here and again whenever the theme flips (see the listener below).
  const css = getComputedStyle(root);
  const token = (name: string) => css.getPropertyValue(name).trim();
  const SANS = token("--sans") || "sans-serif";
  let INK = "", INK3 = "", ACC = "", GREEN = "", VIOLET = "", PANEL2 = "";
  let FAM_COL: string[] = [];
  function readColours() {
    INK = token("--ink");
    INK3 = token("--ink-3");
    ACC = token("--accent");
    GREEN = token("--s-green");
    VIOLET = token("--s-violet");
    PANEL2 = token("--panel-2");
    FAM_COL = [INK, GREEN, VIOLET];
  }
  readColours();

  const xyz = u.xyz;
  let seed = input.value;

  let frame = 0; // the frame on screen
  let k = 1; // CSS pixels per view unit
  let dpr = 1;
  let labelFont = "";
  // Camera in use (seeded camera plus breathing), as projection coefficients.
  let pc = 1, ps = 0, pt = 0.5, pl = 0.8;
  let yaw = 0, dtilt = 0;
  let dirty = true;

  // Generation, as a count of bodies placed so far (fractional while one is
  // arriving, and running MARK past the last so its mark can close too).
  let gen = 0;
  // What the inspector reads while they are being placed: running sums in the generator's order.
  const massTo = new Float64Array(MAX_BODIES), famTo = [0, 1, 2].map(() => new Uint8Array(MAX_BODIES));
  let peak = runningMax(u);
  function tally() {
    let m = u.mass[0];
    const c = [0, 0, 0];
    massTo[0] = m;
    for (let i = 1; i < u.n; i++) {
      m += u.mass[i];
      massTo[i] = m;
      if (i !== u.accent) c[u.family[i]]++;
      for (let f = 0; f < 3; f++) famTo[f][i] = c[f];
    }
    peak = runningMax(u);
  }
  tally();

  function setCamera() {
    const phi = u.cam.phi + yaw;
    pc = Math.cos(phi);
    ps = Math.sin(phi);
    pt = Math.min(0.98, u.cam.tilt + dtilt);
    pl = Math.sqrt(1 - pt * pt);
  }

  // Where body i is on screen at frame f (view units), into `at`.
  const at = [0, 0];
  function locate(i: number, f: number) {
    const b = (f * MAX_BODIES + i) * 3;
    const x = xyz[b], y = xyz[b + 1], z = xyz[b + 2];
    at[0] = CX + x * pc - y * ps;
    at[1] = CY + (x * ps + y * pc) * pt - z * pl;
  }

  // One path per trail piece per family: a few dozen strokes a frame.
  function trace(i: number, from: number, to: number) {
    const c = ctx!;
    for (let f = from; f <= to; f++) {
      const b = (f * MAX_BODIES + i) * 3;
      const x = xyz[b], y = xyz[b + 1], z = xyz[b + 2];
      const sx = CX + x * pc - y * ps, sy = CY + (x * ps + y * pc) * pt - z * pl;
      if (f === from) c.moveTo(sx, sy);
      else c.lineTo(sx, sy);
    }
  }

  function pieces(len: number, alphas: number[], fam: number, placed: number, fade: number) {
    const c = ctx!;
    const n = alphas.length;
    for (let p = 0; p < n; p++) {
      const from = Math.max(0, frame - len + Math.round((p * len) / n));
      const to = Math.min(frame, frame - len + Math.round(((p + 1) * len) / n));
      if (to <= from) continue;
      c.globalAlpha = alphas[p] * fade;
      c.beginPath();
      if (fam < 0) {
        if (u.accent <= placed) trace(u.accent, from, to);
      } else for (let i = 1; i <= placed; i++) if (i !== u.accent && u.family[i] === fam) trace(i, from, to);
      c.stroke();
    }
  }

  function dot(i: number, r: number) {
    locate(i, frame);
    ctx!.moveTo(at[0] + r, at[1]);
    ctx!.arc(at[0], at[1], r, 0, Math.PI * 2);
  }

  // Labels on the grid get a paper-coloured halo so passing orbits never strike through them.
  function ringLabel(s: string, x: number, y: number, px: number) {
    const c = ctx!;
    c.globalAlpha = 1;
    c.lineJoin = "round";
    c.lineWidth = 4 * px;
    c.strokeStyle = PANEL2;
    c.strokeText(s, x, y);
    c.fillStyle = INK3;
    c.fillText(s, x, y);
  }

  function ring(r: number) {
    ctx!.moveTo(CX + r, CY);
    ctx!.ellipse(CX, CY, r, r * pt, 0, 0, Math.PI * 2);
  }

  const colour = (i: number) => (i === u.accent ? ACC : FAM_COL[u.family[i]]);

  // ---- reading a body. The one under the pointer (or the last one tapped)
  // has its whole worldline drawn: where it has been, in ink, and where the
  // stored frames will take it, dashed. Two are kept, so the one let go of can
  // fade as the next comes up.
  let ptr: { x: number; y: number } | null = null; // the pointer over the viewport, in view units
  let held = -1; // a body chosen by a tap stays chosen
  // The first is the one being read; the rest are ones let go of, still fading.
  // Each has a label of its own (one of a few), set on one side of its body for as long as it is read.
  type Read = { i: number; a: number; slot: number; left: boolean; up: boolean };
  const none = (): Read => ({ i: -1, a: 0, slot: -1, left: false, up: false });
  let read: Read[] = [none()];
  const slots = [pickEl, pickEl.cloneNode(false) as HTMLSpanElement, pickEl.cloneNode(false) as HTMLSpanElement];
  for (const el of slots.slice(1)) pickEl.after(el);
  const slotText = slots.map(() => "");
  function nearest(x: number, y: number, reach: number, keep = -1) {
    let best = -1, d2 = (reach / k) ** 2;
    const placed = Math.min(u.n - 1, Math.floor(gen));
    for (let i = 1; i <= placed; i++) {
      locate(i, frame);
      // The one already being read is counted a little nearer than it is, so two bodies side by side do not flicker.
      const d = ((at[0] - x) ** 2 + (at[1] - y) ** 2) * (i === keep ? 0.45 : 1);
      if (d < d2) {
        d2 = d;
        best = i;
      }
    }
    return best;
  }
  function worldline(i: number, a: number, px: number, dk: number) {
    const c = ctx!;
    c.strokeStyle = colour(i);
    c.lineWidth = 1.25 * px;
    c.globalAlpha = 0.62 * a;
    c.beginPath();
    trace(i, 0, frame);
    c.stroke();
    if (frame < F) {
      c.globalAlpha = 0.34 * a;
      c.setLineDash([2 * px, 3.5 * px]);
      c.lineCap = "butt";
      c.beginPath();
      trace(i, frame, F);
      c.stroke();
      c.setLineDash([]);
      c.lineCap = "round";
    }
    c.globalAlpha = 0.9 * a;
    c.lineWidth = px;
    c.beginPath();
    dot(i, (u.size[i] + 4) * dk);
    c.stroke();
  }
  /** A body about to be read: a free label for it, and the side of the body the label is set on. */
  function reading(i: number): Read {
    const r = none();
    r.i = i;
    if (i <= 0) return r;
    for (let j = 0; j < slots.length; j++) if (!read.some((o) => o.slot === j)) { r.slot = j; break; }
    if (r.slot < 0) {
      // Every label is still fading on a body let go of: take the one that has faded furthest.
      const old = read.filter((o) => o.slot >= 0).sort((p, q) => p.a - q.a)[0];
      r.slot = old.slot;
      old.slot = -1;
    }
    locate(i, frame);
    const x = at[0] * k, y = at[1] * k;
    const W = i === u.accent ? 196 : 152, H = 22;
    // What a label must not be set on: the star, and the planet's own callout (which stands above it, to one side).
    locate(u.accent, frame);
    const px = at[0] * k, py = at[1] * k, dir = at[0] > VIEW_W - 90 / k ? -1 : 1;
    const callout = [Math.min(px + dir * 8, px + dir * 86), py - 30, Math.max(px + dir * 8, px + dir * 86), py - 2];
    const star = [CX * k - 12, CY * k - 12, CX * k + 12, CY * k + 12];
    const clear = (x0: number, y0: number, o: number[]) => x0 > o[2] || x0 + W < o[0] || y0 > o[3] || y0 + H < o[1];
    // Below and to the right of the body if there is room, then the other three corners in turn.
    for (const [left, up] of [[false, false], [false, true], [true, false], [true, true]]) {
      const x0 = left ? x - 10 - W : x + 10, y0 = up ? y - 12 - H : y + 10;
      r.left = left;
      r.up = up;
      if (x0 >= 4 && x0 + W <= stageW - 4 && y0 >= 4 && y0 + H <= stageH - 4 && clear(x0, y0, star) && (i === u.accent || clear(x0, y0, callout))) break;
    }
    return r;
  }
  function labels() {
    for (const r of read) {
      if (r.slot < 0) continue;
      const el = slots[r.slot];
      const i = r.i;
      const a = u.sma[i];
      const text =
        (i === u.accent ? `<span class="acc">planet</span>&ensp;` : "") +
        (isFinite(a) ? `<i>a</i> = <span class="num">${Math.round(a)}</span>` : "unbound") +
        `&ensp;<i>m</i> = <span class="num">${sci(u.mass[i])}</span>`;
      if (text !== slotText[r.slot]) el.innerHTML = slotText[r.slot] = text;
      locate(i, frame);
      const x = at[0] * k + (r.left ? -10 : 10), y = at[1] * k + (r.up ? -12 : 10);
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(${r.left ? "-100%" : "0"}, ${r.up ? "-100%" : "0"})`;
      el.style.opacity = r.a.toFixed(2);
    }
  }

  function draw() {
    const c = ctx!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
    c.lineCap = "round";
    c.lineJoin = "round";
    const px = 1 / k;

    // Polar grid in the disk plane.
    c.strokeStyle = INK;
    c.lineWidth = px;
    c.globalAlpha = 0.07;
    c.beginPath();
    for (const r of RINGS) if (r !== A_INNER && r !== A_OUTER) ring(r);
    for (let j = 0; j < 12; j++) {
      const a = (j * Math.PI) / 6;
      const ca = Math.cos(a), sa = Math.sin(a);
      const dx = ca * pc - sa * ps, dy = (ca * ps + sa * pc) * pt;
      c.moveTo(CX + 18 * dx, CY + 18 * dy);
      c.lineTo(CX + 300 * dx, CY + 300 * dy);
    }
    c.stroke();
    // Family boundaries.
    c.setLineDash([3 * px, 4 * px]);
    c.lineCap = "butt";
    c.globalAlpha = 0.45;
    c.strokeStyle = GREEN;
    c.beginPath();
    ring(A_INNER);
    c.stroke();
    c.globalAlpha = 0.4;
    c.strokeStyle = VIOLET;
    c.beginPath();
    ring(A_OUTER);
    c.stroke();
    c.setLineDash([]);
    c.lineCap = "round";

    // How far the generator has got: bodies 1..placed are in, the next is arriving.
    const last = u.n - 1;
    const placed = Math.min(last, Math.floor(gen));
    const arriving = placed < last ? gen - placed : 0;
    // (Seen only when a new seed is typed part-way along the timeline: trails wait for every body to be in.)
    const settled = phase(gen, last, last + MARK);

    // Trails, by family, oldest pieces faintest.
    if (settled > 0 && frame > 0) {
      c.lineWidth = px;
      for (let fam = 0; fam < 3; fam++) {
        c.strokeStyle = FAM_COL[fam];
        pieces(TRAIL, TRAIL_ALPHA, fam, placed, settled);
      }
      c.strokeStyle = ACC;
      c.lineWidth = 1.5 * px;
      pieces(ACCENT_TRAIL, ACCENT_ALPHA, -1, placed, settled);
    }

    // The worldlines being read lie over the trails and under the bodies.
    for (const r of read) if (r.i > 0 && r.i <= placed && r.a > 0.004) worldline(r.i, r.a, px, Math.max(1, 0.66 / k));

    // Bodies, sized by mass (never below about 0.7 CSS px of radius on a phone).
    const dk = Math.max(1, 0.66 / k);
    c.globalAlpha = 1;
    for (let fam = 0; fam < 3; fam++) {
      c.fillStyle = FAM_COL[fam];
      c.beginPath();
      for (let i = 1; i <= placed; i++) if (i !== u.accent && u.family[i] === fam) dot(i, u.size[i] * dk);
      c.fill();
    }
    c.fillStyle = INK;
    c.beginPath();
    dot(0, u.size[0] * dk);
    c.fill();
    c.globalAlpha = 0.14;
    c.strokeStyle = INK;
    c.lineWidth = px;
    c.beginPath();
    dot(0, 9 * dk);
    c.stroke();
    // The body being placed comes up to size, and each of the last few has a mark closing on it.
    if (arriving > 0) {
      const i = placed + 1;
      c.globalAlpha = arriving;
      c.fillStyle = colour(i);
      c.beginPath();
      dot(i, u.size[i] * dk * (0.5 + 0.5 * arriving));
      c.fill();
    }
    if (gen < last + MARK) {
      c.lineWidth = px;
      for (let i = Math.max(1, placed - Math.ceil(MARK)); i <= Math.min(last, placed + 1); i++) {
        const e = (gen - (i - 1)) / MARK;
        if (e <= 0 || e >= 1) continue;
        c.globalAlpha = 0.7 * (1 - e) * Math.min(1, e * 6);
        c.strokeStyle = colour(i);
        c.beginPath();
        dot(i, (u.size[i] + 2.5 + 11 * (1 - e) ** 2) * dk);
        c.stroke();
      }
    }
    // The planet, once it is placed: its halo, and below, its callout.
    const lead = clamp01(gen - (u.accent - 1));
    if (lead > 0) {
      c.globalAlpha = 0.35 * lead;
      c.strokeStyle = ACC;
      c.lineWidth = px;
      c.beginPath();
      dot(u.accent, (u.size[u.accent] + 3.5) * dk);
      c.stroke();
      if (lead >= 1) {
        c.globalAlpha = 1;
        c.fillStyle = ACC;
        c.beginPath();
        dot(u.accent, u.size[u.accent] * dk);
        c.fill();
      }
    }

    // Band labels sit above the trails, on a halo.
    c.font = labelFont;
    const sa = Math.sin(RING_LABEL_ANGLE), ca = Math.cos(RING_LABEL_ANGLE);
    ringLabel(`a = ${A_INNER}`, CX + A_INNER * ca + 3 * px, CY + A_INNER * pt * sa + 13 * px, px);
    ringLabel(`a = ${A_OUTER}`, CX + A_OUTER * ca + 3 * px, CY + A_OUTER * pt * sa + 13 * px, px);
    c.globalAlpha = 1;

    // Callout on the planet, flipped to stay inside the viewport.
    if (lead > 0) {
      locate(u.accent, frame);
      const sx = at[0], sy = at[1];
      const dir = sx > VIEW_W - 90 / k ? -1 : 1;
      const r0 = (u.size[u.accent] + 5) * dk;
      c.globalAlpha = 0.5 * lead;
      c.strokeStyle = INK;
      c.lineWidth = px;
      c.beginPath();
      c.moveTo(sx + dir * r0 * 0.7, sy - r0 * 0.7);
      c.lineTo(sx + dir * 16 * px, sy - 16 * px);
      c.lineTo(sx + dir * 30 * px, sy - 16 * px);
      c.stroke();
      c.globalAlpha = lead;
      c.fillStyle = ACC;
      c.font = labelFont;
      c.textAlign = dir > 0 ? "left" : "right";
      c.lineWidth = 4 * px;
      c.strokeStyle = PANEL2;
      c.strokeText("planet", sx + dir * 33 * px, sy - 12.5 * px);
      c.fillText("planet", sx + dir * 33 * px, sy - 12.5 * px);
      c.textAlign = "left";
      c.globalAlpha = 1;
    }
    labels();
  }

  // Everything around the viewport that follows the frame.
  let shownKeys = -1;
  let deText = "", maxText = "";
  function syncFrame() {
    const p = frame / F;
    const pc100 = `${(p * 100).toFixed(3)}%`;
    head.style.left = pc100;
    fill.style.transform = `scaleX(${p.toFixed(4)})`;
    frameEl.textContent = String(frame + 1);
    const de = sci(u.dE[frame]);
    if (de !== deText) deEl.innerHTML = deText = de;
    // "max" is the largest drift met so far, and its mark comes on once the playhead has passed where it happens.
    const mx = sci(peak[frame]);
    if (mx !== maxText) deMaxEl.innerHTML = maxText = mx;
    smax.style.opacity = frame >= u.dEmaxFrame ? "1" : "0";
    const [x, y] = sparkY(u, frame, SPARK_W, SPARK_H);
    const sx = x.toFixed(1);
    scur.setAttribute("x1", sx);
    scur.setAttribute("x2", sx);
    played.setAttribute("width", (x + 3).toFixed(1));
    snow.setAttribute("d", `M${sx} ${y.toFixed(1)}h0.01`);
    head.setAttribute("aria-valuenow", String(frame + 1));
    const on = Math.floor((frame + 1) / 100);
    if (on !== shownKeys) {
      shownKeys = on;
      keys.forEach((el, j) => el.classList.toggle("on", j <= on));
    }
  }

  let camText = "";
  function syncCamera() {
    const d = camDeg(u.cam.phi + yaw, pt);
    const s = `az ${d.az.toFixed(1)}° el ${d.el.toFixed(1)}°`;
    if (s !== camText) camEl.textContent = camText = s;
  }

  // The inspector counts the bodies in as they are placed.
  let counted = -1;
  function syncGen() {
    const last = u.n - 1;
    const n = Math.min(last, Math.floor(gen + 0.5));
    // The trace of the run that follows comes up once every body is in: the run is integrated then, all at once.
    const ran = phase(gen, last, last + MARK);
    sahead.style.opacity = sline.style.opacity = ran.toFixed(2);
    snow.style.opacity = scur.style.opacity = ran.toFixed(2);
    if (n === counted) return;
    counted = n;
    nEl.textContent = String(n + 1);
    massEl.textContent = massTo[n].toFixed(4);
    for (let f = 0; f < 3; f++) cEls[f].textContent = String(famTo[f][n]);
    cEls[3].textContent = n >= u.accent ? "1" : "0";
  }

  function syncUniverse() {
    hashEl.textContent = hex(fingerprint(seed));
    tally();
    const d = sparkPath(u, SPARK_W, SPARK_H);
    sline.setAttribute("d", d);
    sahead.setAttribute("d", d);
    smax.setAttribute("cx", ((u.dEmaxFrame / F) * SPARK_W).toFixed(1));
    deText = maxText = "";
    counted = -1;
  }

  let stageW = 0, stageH = 0; // the viewport's size on the page, read only when it changes
  function resize() {
    const w = stage.clientWidth;
    if (!w) return;
    stageW = w;
    stageH = (w * VIEW_H) / VIEW_W;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    k = w / VIEW_W;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round((w * VIEW_H * dpr) / VIEW_W);
    labelFont = `${10.5 / k}px ${SANS}`;
    dirty = true;
    draw();
  }

  // Frame control. Scroll owns the timeline; a drag (or the keyboard) takes it
  // while held, then eases back to wherever the scroll has got to.
  type Mode = "scroll" | "hold" | "return";
  let mode: Mode = "scroll";
  let scrollF = 0;
  let heldF = 0;
  let shownF = 0;
  let lastMove = -1e9;

  const state = { s: 0 };
  const tl = scrubbed(root, {
    // Once most of the viewport has come up the window, so the bodies are seen being placed.
    start: () => {
      const r = root.getBoundingClientRect(), b = stage.getBoundingClientRect();
      return `top+=${Math.round(b.top - r.top + SHOWN * b.height)} ${LINE}%`;
    },
    end: "center 50%",
  });
  tl.to(state, {
    s: 1,
    duration: 1,
    onUpdate() {
      scrollF = phase(state.s, ...RUN) * F;
      lastMove = performance.now();
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
  // How far the scroll has got through placing the bodies (of whichever universe is loaded).
  const scrollGen = () => phase(state.s, ...GEN) * (u.n - 1 + MARK);
  shownF = scrollF;
  frame = Math.round(shownF);
  gen = scrollGen();
  setCamera();

  // Swap the static snapshot for the live canvas.
  snap.style.display = "none";
  canvas.style.display = "block";
  stage.dataset.live = "";
  new ResizeObserver(resize).observe(stage);
  document.fonts?.ready.then(() => (dirty = true));
  // The page announces a theme flip; repaint in the new colours.
  document.addEventListener("themechange", () => {
    readColours();
    dirty = true;
  });
  syncFrame();
  syncGen();
  syncCamera();

  let theta = 0, speed = 0;
  let placing = false; // a universe typed in is being placed in its own time
  whileVisible(root, (dt) => {
    const now = performance.now();
    // Generation follows the scroll, but never faster than the whole universe
    // in a quarter of a second, so it is placed body by body however it is
    // asked for: a flick of the page, the playhead taken while it is under
    // way, or a new seed typed (which takes a little more than half a second).
    const all = u.n - 1 + MARK;
    const want = mode === "scroll" ? scrollGen() : all;
    if (gen !== want) {
      const most = (all / (placing ? 0.6 : 0.25)) * dt;
      gen += Math.max(-most, Math.min(most, want - gen));
      dirty = true;
      syncGen();
    }
    if (gen === want) placing = false;
    // Frame.
    if (mode === "hold") shownF = heldF;
    else if (mode === "return") {
      shownF += (scrollF - shownF) * (1 - Math.exp(-dt * 7));
      if (Math.abs(scrollF - shownF) < 0.5) mode = "scroll";
      lastMove = now;
    } else shownF = scrollF;
    const f = Math.max(0, Math.min(F, Math.round(shownF)));
    if (f !== frame) {
      frame = f;
      dirty = true;
      syncFrame();
    }
    // Reading: which body, and how far each of the two has faded in or out.
    const want1 = held > 0 ? held : ptr ? nearest(ptr.x, ptr.y, REACH, read[0].i) : -1;
    if (want1 !== read[0].i) {
      // The one let go of keeps fading from where it was; a body returned to picks up from there too.
      const back = read.findIndex((r) => r.i === want1);
      read.unshift(back > 0 ? read.splice(back, 1)[0] : reading(want1));
    }
    for (let j = 0; j < read.length; j++) {
      const r = read[j], to = j === 0 && r.i > 0 ? 1 : 0;
      if (r.a === to) continue;
      r.a = to > r.a ? Math.min(1, r.a + dt / 0.24) : Math.max(0, r.a - dt / 0.32);
      dirty = true;
    }
    if (read.length > 1) {
      // One that has faded right out gives its label back.
      for (let j = 1; j < read.length; j++) if (read[j].a <= 0 && read[j].slot >= 0) slots[read[j].slot].style.opacity = "0";
      read = read.filter((r, j) => j === 0 || r.a > 0);
    }
    // Camera breathes only while the timeline is at rest.
    const idle = mode !== "hold" && now - lastMove > 450;
    speed += ((idle ? 1 : 0) - speed) * (1 - Math.exp(-dt * 1.6));
    if (speed > 1e-4) {
      theta += dt * speed * ((Math.PI * 2) / PERIOD);
      yaw = YAW * Math.sin(theta);
      dtilt = TILT * Math.sin(0.61 * theta);
      setCamera();
      syncCamera();
      dirty = true;
    }
    if (dirty) {
      dirty = false;
      draw();
    }
  });

  // The viewport: move over it to read a body; with a finger, tap one.
  let tap: { id: number; x: number; y: number } | null = null;
  // Where the viewport is in the window: measured when the pointer comes onto it, and again only if the page has moved since.
  let box: DOMRect | null = null, boxAt = 0, boxW = 0;
  const where = (e: PointerEvent) => {
    if (!box || boxAt !== window.scrollY || boxW !== stageW) {
      box = stage.getBoundingClientRect();
      boxAt = window.scrollY;
      boxW = stageW;
    }
    return { x: (e.clientX - box.left) / k, y: (e.clientY - box.top) / k };
  };
  stage.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    ptr = where(e);
    held = -1;
  });
  stage.addEventListener("pointerleave", () => {
    ptr = null;
    box = null;
  });
  stage.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse") tap = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  stage.addEventListener("pointerup", (e) => {
    if (!tap || tap.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 8) {
      const p = where(e);
      held = nearest(p.x, p.y, REACH * 1.6);
    }
    tap = null;
  });
  stage.addEventListener("pointercancel", () => (tap = null));

  // Scrubber: pointer and keyboard.
  track.dataset.live = "";
  head.setAttribute("role", "slider");
  head.setAttribute("tabindex", "0");
  head.setAttribute("aria-label", "Timeline frame. Arrow keys step one frame, Page Up and Page Down jump 100.");
  head.setAttribute("aria-valuemin", "1");
  head.setAttribute("aria-valuemax", String(FRAMES));
  let rect: DOMRect | null = null;
  const frameAt = (clientX: number) => {
    const r = rect ?? track.getBoundingClientRect();
    return Math.max(0, Math.min(F, Math.round(((clientX - r.left) / r.width) * F)));
  };
  let dragging = -1;
  track.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    rect = track.getBoundingClientRect();
    dragging = e.pointerId;
    track.setPointerCapture(e.pointerId);
    mode = "hold";
    heldF = frameAt(e.clientX);
    ghost.hidden = true;
    if (e.pointerType === "mouse") e.preventDefault();
  });
  track.addEventListener("pointermove", (e) => {
    if (dragging === e.pointerId) {
      heldF = frameAt(e.clientX);
      return;
    }
    if (e.pointerType !== "mouse") return;
    const r = track.getBoundingClientRect();
    const f = frameAt(e.clientX);
    ghost.hidden = false;
    ghost.style.left = `${((f / F) * r.width).toFixed(1)}px`;
    ghostN.textContent = String(f + 1);
  });
  const letGo = (e: PointerEvent) => {
    if (dragging !== e.pointerId) return;
    dragging = -1;
    rect = null;
    if (document.activeElement !== head) mode = "return";
  };
  track.addEventListener("pointerup", letGo);
  track.addEventListener("pointercancel", letGo);
  track.addEventListener("pointerleave", () => (ghost.hidden = true));

  head.addEventListener("keydown", (e) => {
    const base = mode === "hold" ? heldF : frame;
    let f = base;
    switch (e.key) {
      case "ArrowRight": case "ArrowUp": f += e.shiftKey ? 10 : 1; break;
      case "ArrowLeft": case "ArrowDown": f -= e.shiftKey ? 10 : 1; break;
      case "PageUp": f += 100; break;
      case "PageDown": f -= 100; break;
      case "Home": f = 0; break;
      case "End": f = F; break;
      default: return;
    }
    e.preventDefault();
    mode = "hold";
    heldF = Math.max(0, Math.min(F, f));
  });
  head.addEventListener("blur", () => {
    if (mode === "hold" && dragging < 0) mode = "return";
  });

  // Seed input.
  const short = (s: string) => (s.length > 12 ? s.slice(0, 11) + "…" : s);
  const show = (s: string) => {
    if (readout) readout.textContent = `seed ${short(s)} → ${hex(fingerprint(s))}`;
  };
  let timer = 0;
  input.disabled = false;
  input.addEventListener("input", () => {
    const s = input.value;
    show(s);
    hashEl.textContent = hex(fingerprint(s));
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (s === seed) return;
      seed = s;
      generate(seed, u);
      // Another universe: nothing is being read, and its bodies are placed afresh.
      held = -1;
      read = [none()];
      for (const el of slots) el.style.opacity = "0";
      gen = 0;
      placing = true;
      setCamera();
      syncUniverse();
      syncFrame();
      syncGen();
      syncCamera();
      dirty = true;
    }, 160);
  });
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
