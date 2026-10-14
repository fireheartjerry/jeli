/**
 * Canvas renderer for the Roche landscape (see roche3d.ts for the physics).
 *
 * Two things drive it. A clock: the scene turns once per orbit and the stream
 * is advanced by the same orbital time, so the gas takes the fraction of an
 * orbit to fall that it really would. And a scene: how much of the ground is
 * plotted, how full the donor is, how far the stream has reached, how much
 * mass has moved. The figure's script moves the scene with the scroll; the
 * clock keeps running whatever the scene says, so one never has to hand over
 * to the other.
 */
import { omega, aBallistic, aConservative } from "./binary";
import {
  R, EL, field, phi, inDonor, fillLevel, height, shape, project, scan, visible, makeFrame, makeStream, seeder, stepStream, rng,
  layout, grid, levels, rimLevels, contour, ground, drift, BY_STAR, INNER, OUTER,
  type Frame, type Stream, type View,
} from "./roche3d";

export interface Scene {
  /** Fraction of the donor's mass moved to the accretor, 0 to F_MAX. */
  f: number;
  /** How much of the ground is plotted, 0 to 1 by area, lowest levels first. */
  plot: number;
  /** How full the donor's basin is, 0 to 1; at 1 it is filled to the pass. */
  fill: number;
  /** How far along its path the stream has reached, 0 to 1. */
  spill: number;
  /** The scale bar, and the three labels, each 0 to 1. */
  bar: number;
  l1: number;
  donor: number;
  accretor: number;
  /** The pointer's probe: how present it is, and where the pointer is in the canvas (CSS px). */
  probe: number;
  px: number;
  py: number;
}

/** What the probe reads off the ground under the pointer. */
export interface Reading {
  /** Φ there, in GM/a, and its height above the pass. */
  phi: number;
  rel: number;
}

export interface Sky {
  /** Advance the clock by dt seconds and draw. */
  frame(dt: number): void;
  /** The probe's reading, or null while the pointer is off the ground. */
  reading(): Reading | null;
  destroy(): void;
}

const TAU = Math.PI * 2;
const AREA = 0.72; // how far the plotting keeps to an even rate by area, rather than by height
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));

export function mountSky(canvas: HTMLCanvasElement, scene: Scene, opts: { period?: number; theta?: number } = {}): Sky {
  const ctx = canvas.getContext("2d")!;
  const css = getComputedStyle(canvas);
  const ink = css.getPropertyValue("--ink-rgb").trim().replace(/ /g, ",") || "240,238,230";
  const accent = css.getPropertyValue("--accent-rgb").trim().replace(/ /g, ",") || "124,148,255";
  const paper = css.getPropertyValue("--paper-rgb").trim().replace(/ /g, ",") || "10,11,14";
  const sans = css.getPropertyValue("--sans") || "sans-serif";
  const math = css.getPropertyValue("--math") || "serif";
  const cm = css.getPropertyValue("--cm") || "serif";
  const period = opts.period ?? 36; // seconds per orbit at the initial separation
  const rand = rng(20260211);

  let F = field(scene.f);
  let theta = opts.theta ?? 2.5;
  let view: View = { cx: 0, cy: 0, s: 1, rows: 2, cols: 2 };
  let lay = layout(1, 1);
  let fr: Frame = makeFrame(view);
  let stream: Stream = makeStream(8, rand);
  let seed: ((budget: number) => boolean) | null = null; // set while the stream is still being filled
  let table = new Float32Array(2); // sorted heights of the ground, for plotting at an even rate
  let rimAt = { lo: 0, hi: 0 }; // the heights of the ground along the edge of the patch
  let w = 0, h = 0, dpr = 1;
  let level = F.crit; // the potential the donor is filled to
  const pt = new Float32Array(4), pt2 = new Float32Array(4), g2 = new Float32Array(2);
  let segs = new Float32Array(8);
  const path = new Float32Array(2 * 120);

  // The probe: the ground point under the pointer (once the pointer has gone, the last one,
  // which then turns with the scene), how present the probe is, and the level it is tracing.
  const probe = { x: 0, y: 0, on: 0, hit: false, h: 0, phi: 0, have: false };
  // Labels dim when the ground in front hides their anchor; eased, so the turn of the scene never snaps one.
  const seen = [1, 1, 1];
  // The probe's reading: where it sits beside the parcel, and the boxes it has to keep clear of (x, y, w, h each).
  const tag = { a: 0, mx: 0, my: 0, x: 14, y: -44, side: 0, have: false };
  const taken: number[] = [];

  function resize() {
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    w = box.width;
    h = box.height;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    lay = layout(w, h);
    const { rows, cols } = grid(lay.s);
    const changed = rows !== view.rows || cols !== view.cols;
    view = { cx: lay.cx, cy: lay.cy, s: lay.s, rows, cols };
    if (changed) {
      fr = makeFrame(view);
      segs = new Float32Array(rows * cols * 2);
    } else fr.view = view;
    // The heights of the bare ground, donor's well empty, in order.
    scan(fr, F, theta, -Infinity);
    table = levels(fr);
    rimAt = rimLevels(fr);
    const n = lay.s > 150 ? 560 : 300;
    if (n !== stream.n) {
      // The gas should already be falling when it is first shown. Filling the stream
      // takes a while the first time, so it is done in slices before the plate is seen.
      stream = makeStream(n, rand, 0);
      seed = seeder(stream, F, rand);
      idle(pump);
    }
  }

  const idle = (fn: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 400 }) : setTimeout(fn, 32));
  const work = (budget: number) => {
    if (seed?.(budget)) seed = null;
  };
  function pump() {
    work(5);
    if (seed) idle(pump);
  }

  /** The height below which the ground is plotted when a fraction q of it is. */
  function levelAt(q: number) {
    if (q >= 1) return Infinity;
    if (q <= 0) return -Infinity;
    const n = table.length - 1, x = q * n, i = Math.floor(x);
    const lo = table[0], hi = table[n] + 0.01;
    const byArea = table[i] + (table[Math.min(n, i + 1)] - table[i]) * (x - i);
    return byArea * AREA + (lo + (hi - lo) * q) * (1 - AREA);
  }

  function plotRows(tau: number) {
    const { rows, cols, cx, s } = view;
    const x0 = cx - s * F.a * R, dx = (2 * s * F.a * R) / (cols - 1);
    const half = (s * F.a * R * Math.sin(EL)) / (rows - 1); // half the gap between rows on screen
    const { sy, hz, kind, vis, h: hh } = fr;
    // The donor's surface comes into view over the first of its rise from the bottom of the well.
    const star = seg(scene.fill, 0, 0.12);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (let pass = 0; pass < 2; pass++) {
      // Ground first, then the donor's surface on top in full ink.
      const want = pass ? 2 : 1;
      for (let j = 0; j < rows; j++) {
        const row = j * cols, prev = row - cols;
        const depth = j / (rows - 1); // 0 nearest
        ctx.beginPath();
        let open = false, any = false;
        for (let i = 0; i < cols; i++) {
          const k = row + i, kp = k - 1;
          const on = kind[k] === want && vis[k] === 1 && hh[k] < tau;
          if (on) {
            if (open) ctx.lineTo(x0 + i * dx, sy[k]);
            else {
              any = open = true;
              if (i && kind[kp] === want && vis[kp] === 1) {
                // The sample before is in view but above the level plotted so far: start at the level.
                const t = (hh[kp] - tau) / (hh[kp] - hh[k]);
                ctx.moveTo(x0 + (i - 1 + t) * dx, sy[kp] + (sy[k] - sy[kp]) * t);
                ctx.lineTo(x0 + i * dx, sy[k]);
              } else if (i && kind[kp] && !vis[kp] && j) {
                // Start exactly where this row rises above the horizon in front of it.
                const a0 = sy[kp] - hz[prev + i - 1], a1 = sy[k] - hz[prev + i];
                let t = a0 === a1 ? 0 : a0 / (a0 - a1);
                if (kind[kp] === want && hh[kp] >= tau) t = Math.max(t, (hh[kp] - tau) / (hh[kp] - hh[k]));
                ctx.moveTo(x0 + (i - 1 + t) * dx, sy[kp] + (sy[k] - sy[kp]) * t);
                ctx.lineTo(x0 + i * dx, sy[k]);
              } else if (i && pass && kind[kp] === 1 && vis[kp]) {
                // The star's surface meets the ground it rests against.
                ctx.moveTo(x0 + (i - 1) * dx, sy[kp]);
                ctx.lineTo(x0 + i * dx, sy[k]);
              } else ctx.moveTo(x0 + i * dx, sy[k]);
            }
          } else if (open) {
            open = false;
            if (kind[k] !== want) continue;
            if (vis[k] === 1) {
              // In view, but above the level plotted so far: stop at the level.
              const t = (tau - hh[kp]) / (hh[k] - hh[kp]);
              ctx.lineTo(x0 + (i - 1 + t) * dx, sy[kp] + (sy[k] - sy[kp]) * t);
            } else if (j) {
              // Stop exactly where the row goes behind the horizon.
              const a0 = sy[kp] - hz[prev + i - 1], a1 = sy[k] - hz[prev + i];
              let t = a0 === a1 ? 1 : a0 / (a0 - a1);
              if (hh[k] >= tau) t = Math.min(t, (tau - hh[kp]) / (hh[k] - hh[kp]));
              ctx.lineTo(x0 + (i - 1 + t) * dx, sy[kp] + (sy[k] - sy[kp]) * t);
            }
          }
        }
        if (!any) continue;
        if (pass) {
          ctx.strokeStyle = `rgba(${ink},${((0.92 - depth * 0.25) * star).toFixed(3)})`;
          ctx.lineWidth = 1.15;
          // The star's surface is level, so a second line midway between rows is exact.
          ctx.stroke();
          ctx.translate(0, -half);
          ctx.globalAlpha = 0.7;
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.translate(0, half);
        } else {
          ctx.strokeStyle = `rgba(${ink},${(0.46 - depth * 0.3).toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  }

  /** Stroke a batch of segments from `segs`. */
  function strokeSegs(n: number) {
    ctx.beginPath();
    for (let i = 0; i < n; i += 4) {
      ctx.moveTo(segs[i], segs[i + 1]);
      ctx.lineTo(segs[i + 2], segs[i + 3]);
    }
    ctx.stroke();
  }

  /** The level being plotted right now: the pen, as the level line the plotting has reached. */
  function pen(tau: number) {
    ctx.lineWidth = 1.25;
    // It touches down over the first few rows rather than starting at full weight.
    const down = 0.92 * seg(scene.plot, 0, 0.04);
    let n = contour(fr, F, tau, segs, true, INNER);
    if (n) {
      ctx.strokeStyle = `rgba(${ink},${down.toFixed(3)})`;
      strokeSegs(n);
    }
    // Along the edge of the patch the level line starts as arcs that run off the edge,
    // and only then closes into a ring. It is taken up as it closes and leaves the edge.
    const closed = seg(tau, rimAt.hi - 0.005, rimAt.hi + 0.035);
    n = closed ? contour(fr, F, tau, segs, true, OUTER) : 0;
    if (n) {
      ctx.strokeStyle = `rgba(${ink},${(down * closed * closed).toFixed(3)})`;
      strokeSegs(n);
    }
  }

  function rim(tau: number) {
    // The accretor's Roche lobe: the level of the pass, traced around its well.
    // It is the line the plotting leaves behind as it passes that level.
    const hz = shape(F, F.crit);
    const a = clamp01((tau - hz) / 0.05);
    if (!a) return;
    ctx.beginPath();
    let open = false;
    const n = F.lobe.length;
    for (let i = 0; i <= n; i++) {
      const [x, y] = F.lobe[i % n];
      project(view, F, theta, x, y, hz, pt);
      if (visible(fr, pt, 2.5)) {
        open ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]);
        open = true;
      } else open = false;
    }
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = `rgba(${ink},${(0.5 * a).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** How old the oldest gas on show is, when the stream has reached a fraction s of its path: the fall first, then the turns of the disc. */
  function reach(s: number) {
    if (s >= 1) return Infinity;
    const k = 0.5;
    return s < k ? stream.fall * (s / k) : stream.fall + (stream.life - stream.fall) * ((s - k) / (1 - k));
  }

  function particles() {
    // Each parcel is a short streak along its own motion, capped so fast gas
    // near the accretor does not smear. The head of the stream thins out over
    // three steps rather than ending on a cut.
    const front = reach(scene.spill);
    const soft = Math.max(0.2, Math.min(1.2, front * 0.16));
    ctx.lineWidth = 1.1;
    for (let bin = 0; bin < 3; bin++) {
      ctx.beginPath();
      let any = false;
      for (let i = 0; i < stream.n; i++) {
        const age = stream.age[i];
        if (age < 0.02 || age > front) continue;
        const e = (front - age) / soft;
        if ((e >= 1 ? 2 : e >= 0.45 ? 1 : 0) !== bin) continue;
        const x = stream.x[i], y = stream.y[i];
        project(view, F, theta, x, y, height(F, x, y, level), pt);
        if (!visible(fr, pt)) continue;
        const vx = stream.vx[i], vy = stream.vy[i];
        const tail = Math.min(0.05, 0.016 / (Math.hypot(vx, vy) + 1e-3));
        const bx = x - vx * tail, by = y - vy * tail;
        project(view, F, theta, bx, by, height(F, bx, by, level), pt2);
        ctx.moveTo(pt2[0], pt2[1]);
        ctx.lineTo(pt[0], pt[1]);
        any = true;
      }
      if (!any) continue;
      ctx.strokeStyle = `rgba(${accent},${[0.3, 0.6, 0.9][bin]})`;
      ctx.stroke();
    }
  }

  /** Set a word at (x, y) in one of the figure's faces, at strength × a of its colour. Returns its width, for whatever follows it on the line. */
  function word(text: string, x: number, y: number, a: number, font: string, colour = ink, align: CanvasTextAlign = "center", strength = 0.86) {
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = `rgba(${colour},${(strength * a).toFixed(3)})`;
    ctx.fillText(text, x, y);
    return ctx.measureText(text).width;
  }

  function labels(dt: number) {
    const small = lay.compact;
    const pass = shape(F, F.crit);
    const star = level === -Infinity ? pass - 0.5 : shape(F, level);
    const mark = (i: number, k: number, x: number, y: number, hh: number, text: string, italic: boolean, lift: number, sub?: string) => {
      project(view, F, theta, x, y, hh, pt);
      // Ease towards dim when the anchor goes behind the ground, and back.
      const want = visible(fr, pt, 3) ? 1 : 0.4;
      seen[i] += (want - seen[i]) * Math.min(1, dt * 5);
      if (k <= 0) return;
      const tx = pt[0], ty = pt[1] - lift;
      // The leader rises from the ground to the word, then the word comes up.
      const line = seg(k, 0, 0.6), fade = seg(k, 0.35, 1) * seen[i];
      ctx.strokeStyle = `rgba(${ink},${(0.38 * seen[i]).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pt[0], pt[1] - 4);
      ctx.lineTo(tx, pt[1] - 4 - (lift - 10) * line);
      ctx.stroke();
      if (!fade) return;
      const font = italic ? `italic ${small ? 15 : 17}px ${math}` : `${small ? 11 : 12}px ${sans}`;
      ctx.font = font;
      const wd = ctx.measureText(text).width + (sub ? 8 : 0);
      ctx.fillStyle = `rgba(${paper},${(0.82 * fade).toFixed(3)})`;
      ctx.fillRect(tx - wd / 2 - 5, ty - 12, wd + 10, 17);
      taken.push(tx - wd / 2 - 5, ty - 14, wd + 10, 21);
      const tw = word(text, tx - (sub ? 3 : 0), ty, fade, font);
      if (sub) word(sub, tx - 3 + tw / 2 + 1, ty + 4, fade, `${small ? 10 : 11}px ${math}`, ink, "left");
    };
    mark(0, scene.l1, F.l1, 0, pass, "L", true, small ? 30 : 42, "1");
    mark(1, scene.donor, F.x1, 0, star, "donor", false, small ? 34 : 50);
    mark(2, scene.accretor, F.x2, 0, pass + 0.02, "accretor", false, small ? 44 : 64);
  }

  /**
   * The scale bar. One separation of the starting orbit is s px across the
   * picture, so the two bars are true to the scale of the ground under them:
   * the upper one is the separation the ballistic stream leaves, and the
   * ground is drawn at that size; the lower one is the classical answer.
   */
  function bar() {
    const k = scene.bar;
    if (k <= 0) return;
    const { x, y, gap } = lay.bar, s = view.s;
    const grow = seg(k, 0, 0.6), ref = seg(k, 0.3, 0.75), text = seg(k, 0.55, 1);
    taken.push(x - 6, y - 30, s * aConservative(F.f) + 120, gap + 44);
    const rows: [number, string, string, number][] = [
      [aBallistic(F.f), "ballistic", accent, 1.5],
      [aConservative(F.f), "classical", ink, 1],
    ];
    ctx.lineCap = "butt";
    rows.forEach(([a, name, colour, width], i) => {
      const yy = y + i * gap, len = s * a * grow;
      ctx.strokeStyle = `rgba(${colour},${i ? 0.6 : 0.95})`;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x, yy - 4);
      ctx.lineTo(x, yy + 4);
      ctx.moveTo(x, yy);
      ctx.lineTo(x + len, yy);
      ctx.moveTo(x + len, yy - 4);
      ctx.lineTo(x + len, yy + 4);
      ctx.stroke();
      if (!text) return;
      const wd = word(name, x + len + 9, yy + 4, text, `11px ${sans}`, ink, "left", 0.58);
      word(a.toFixed(3), x + len + 9 + wd + 5, yy + 4, text, `12.5px ${cm}`, colour, "left", i ? 0.86 : 1);
    });
    // The starting separation, as a dotted line both bars begin on.
    if (ref) {
      const top = y - 9, bottom = y + gap + 9;
      ctx.strokeStyle = `rgba(${ink},0.42)`;
      ctx.lineWidth = 1;
      ctx.setLineDash([1, 3]);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x + s, top);
      ctx.lineTo(x + s, top + (bottom - top) * ref);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (text) {
      const yy = y - 15;
      word("separation", x, yy, text, `11px ${sans}`, ink, "left", 0.58);
      const tw = word("a", x + s - 5, yy, text, `italic 14px ${math}`, ink, "left", 0.74);
      word("0", x + s - 5 + tw + 0.5, yy + 3, text, `10px ${cm}`, ink, "left", 0.74);
    }
    ctx.lineCap = "round";
  }

  /**
   * The probe: the ground under the pointer, the level line through it, and
   * the first quarter orbit of a parcel let go there at rest. The parcel can
   * never climb above that line, so its path stays inside it.
   */
  function probeLines(dt: number) {
    tag.a = 0;
    // (There is nothing to put a parcel down on until the ground has been plotted.)
    const want = scene.probe > 0 && scene.plot >= 1 && ground(fr, F, theta, scene.px, scene.py, g2);
    if (want) {
      probe.x = g2[0];
      probe.y = g2[1];
      const p = phi(F, probe.x, probe.y);
      const under = inDonor(F, probe.x, probe.y, p, level);
      probe.phi = under ? level : p;
      const hh = shape(F, probe.phi);
      // The level follows the pointer over a few frames, so crossing a ridge is a move and not a jump.
      probe.h = probe.have ? probe.h + (hh - probe.h) * Math.min(1, dt * 16) : hh;
      probe.have = true;
    }
    probe.hit = want;
    probe.on += ((want ? 1 : 0) - probe.on) * Math.min(1, dt * (want ? 14 : 9));
    const a = probe.on * scene.probe;
    if (a < 0.004 || !probe.have) {
      if (!want && probe.on < 0.004) probe.have = false;
      return;
    }
    // The level line. At the donor's level, and above it, it is traced on the ground itself, so
    // the donor's outline falls between samples and not on them. Below, the ground under the
    // donor is out of sight, and what is left of its outline fades over the first few px of drop.
    const top = level === -Infinity ? -Infinity : shape(F, level);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = `rgba(${ink},${(0.9 * a).toFixed(3)})`;
    strokeSegs(contour(fr, F, probe.h, segs, probe.h >= top));
    const edge = probe.h < top ? 1 - (top - probe.h) / 0.04 : 0;
    if (edge > 0) {
      ctx.strokeStyle = `rgba(${ink},${(0.9 * a * edge).toFixed(3)})`;
      strokeSegs(contour(fr, F, top, segs, true, BY_STAR));
    }
    // Where a parcel let go here drifts, fading along its way.
    const m = drift(F, probe.x, probe.y, 1.6, path);
    ctx.lineWidth = 1.3;
    const cut = [0, Math.floor(m / 6) * 2, Math.floor(m / 3) * 2, m - 2];
    for (let b = 0; b < 3; b++) {
      ctx.beginPath();
      let open = false;
      for (let i = cut[b]; i <= cut[b + 1]; i += 2) {
        project(view, F, theta, path[i], path[i + 1], height(F, path[i], path[i + 1], level), pt);
        if (visible(fr, pt, 2)) {
          open ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]);
          open = true;
        } else open = false;
      }
      ctx.strokeStyle = `rgba(${accent},${([0.95, 0.6, 0.28][b] * a).toFixed(3)})`;
      ctx.stroke();
    }
    // The parcel itself.
    project(view, F, theta, probe.x, probe.y, shape(F, probe.phi), pt);
    const mx = pt[0], my = pt[1];
    ctx.fillStyle = `rgba(${paper},${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(mx, my, 4.5, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = `rgba(${accent},${a.toFixed(3)})`;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    tag.a = a;
    tag.mx = mx;
    tag.my = my;
  }

  /**
   * The probe's reading, drawn last so nothing crosses it. It sits beside the
   * parcel on whichever side is clear of the labels and the scale bar, and
   * when it has to change sides it moves across rather than jumping.
   */
  function probeTag(dt: number) {
    const a = tag.a;
    if (a < 0.004) {
      tag.have = false;
      return;
    }
    const { mx, my } = tag;
    const rel = probe.phi - F.crit;
    const line2 = Math.abs(rel) < 0.005 ? "level with the pass" : `${Math.abs(rel).toFixed(2)} ${rel > 0 ? "above" : "below"} the pass`;
    const num = ` = ${probe.phi < 0 ? "−" : ""}${Math.abs(probe.phi).toFixed(3)}`;
    ctx.font = `11px ${sans}`;
    const w2 = ctx.measureText(line2).width;
    ctx.font = `12.5px ${cm}`;
    const wn = ctx.measureText(num).width;
    const bw = Math.max(w2, 11 + wn + 36) + 14, bh = 38;
    // Four places for it: right or left of the parcel, above or below.
    const sideX = (k: number) => (k & 1 ? -14 - bw : 14), sideY = (k: number) => (k & 2 ? 8 : -44);
    const clear = (k: number) => {
      const x = mx + sideX(k), y = my + sideY(k);
      if (x < 6 || x + bw > w - 6 || y < 6 || y + bh > h - 6) return false;
      for (let i = 0; i < taken.length; i += 4) if (x < taken[i] + taken[i + 2] && x + bw > taken[i] && y < taken[i + 1] + taken[i + 3] && y + bh > taken[i + 1]) return false;
      return true;
    };
    if (!tag.have || !clear(tag.side)) {
      let k = 0;
      while (k < 4 && !clear(k)) k++;
      if (k < 4) tag.side = k;
      else if (!tag.have) tag.side = mx + 14 + bw > w - 6 ? 1 : 0;
    }
    const ease = tag.have ? Math.min(1, dt * 13) : 1;
    tag.x += (sideX(tag.side) - tag.x) * ease;
    tag.y += (sideY(tag.side) - tag.y) * ease;
    tag.have = true;
    const bx = Math.max(6, Math.min(w - 6 - bw, mx + tag.x)), by = Math.max(6, Math.min(h - 6 - bh, my + tag.y));
    ctx.fillStyle = `rgba(${paper},${(0.9 * a).toFixed(3)})`;
    ctx.fillRect(bx, by, bw, bh);
    const tw = word("Φ", bx + 7, by + 16, a, `italic 15px ${math}`, ink, "left", 0.9);
    const nw = word(num, bx + 7 + tw, by + 16, a, `12.5px ${cm}`, ink, "left", 0.9);
    word("GM/a", bx + 7 + tw + nw + 6, by + 16, a, `italic 12px ${math}`, ink, "left", 0.58);
    word(line2, bx + 7, by + 31, a, `11px ${sans}`, ink, "left", 0.62);
  }

  function draw(dt: number) {
    if (!w) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    level = fillLevel(F, scene.fill);
    scan(fr, F, theta, level);
    const tau = levelAt(scene.plot);
    if (scene.plot > 0) {
      plotRows(tau);
      if (scene.plot < 1) pen(tau);
      rim(tau);
    }
    if (scene.spill > 0 && !seed) particles();
    taken.length = 0;
    probeLines(dt);
    labels(dt);
    bar();
    probeTag(dt);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  return {
    frame(dt) {
      if (Math.abs(scene.f - F.f) > 1e-6) F = field(scene.f);
      // Kepler: the tighter orbit turns faster, and the stream keeps the same clock.
      const d = ((dt * TAU) / period) * omega(F.a);
      theta += d;
      if (seed) work(3);
      else stepStream(stream, F, d, rand);
      draw(dt);
    },
    reading: () => (probe.hit ? { phi: probe.phi, rel: probe.phi - F.crit } : null),
    destroy() {
      ro.disconnect();
    },
  };
}
