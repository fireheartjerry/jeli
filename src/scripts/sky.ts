/**
 * Canvas renderer for the Roche landscape (see roche3d.ts for the physics).
 * One clock drives everything: the scene turns once per orbit and the stream
 * is advanced by the same orbital time, so the gas takes the fraction of an
 * orbit to fall that it really would.
 */
import { omega } from "./binary";
import {
  R, EL, field, height, shape, project, scan, visible, makeFrame, makeStream, seeder, stepStream, rng,
  type Field, type Frame, type Stream, type View,
} from "./roche3d";

export interface SkyOptions {
  /** Where the centre of mass sits and how many pixels one separation spans, for a canvas of w × h CSS px. */
  place: (w: number, h: number) => { cx: number; cy: number; s: number };
  /** Seconds per orbit at the initial separation. */
  period?: number;
  /** Starting orientation, radians. */
  theta?: number;
  /** Draw one finished frame and stop (reduced motion). */
  still?: boolean;
  /** Called after each frame with the current field and orientation. */
  onFrame?: (F: Field, theta: number) => void;
}

export interface Sky {
  /** Fraction of the donor's mass transferred so far, 0 to F_MAX. */
  setF(f: number): void;
  /** Start or stop the clock (the caller knows when the cover is on screen). */
  run(on: boolean): void;
  /** Ask `place` again, after the layout around the canvas has changed. */
  refit(): void;
  destroy(): void;
}

const TAU = Math.PI * 2;

export function mountSky(canvas: HTMLCanvasElement, opts: SkyOptions): Sky {
  const ctx = canvas.getContext("2d")!;
  const css = getComputedStyle(canvas);
  const ink = css.getPropertyValue("--ink-rgb").trim().replace(/ /g, ",") || "240,238,230";
  const accent = css.getPropertyValue("--accent-rgb").trim().replace(/ /g, ",") || "124,148,255";
  const paper = css.getPropertyValue("--paper-rgb").trim().replace(/ /g, ",") || "10,11,14";
  const sans = css.getPropertyValue("--sans") || "sans-serif";
  const math = css.getPropertyValue("--math") || "serif";
  const period = opts.period ?? 36;
  const rand = rng(20260211);

  let F = field(0);
  let wantF = 0;
  let theta = opts.theta ?? 2.5;
  let view: View = { cx: 0, cy: 0, s: 1, rows: 2, cols: 2 };
  let fr: Frame = makeFrame(view);
  let stream: Stream = makeStream(8, rand);
  let seed: ((budget: number) => boolean) | null = null; // set while the stream is still being filled
  let w = 0, h = 0, dpr = 1;
  let reveal = opts.still ? 1 : 0; // rows plotted so far, 0 to 1
  let running = false;
  let raf = 0;
  let last = 0;
  const pt = new Float32Array(4), pt2 = new Float32Array(4);

  function resize() {
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    w = box.width;
    h = box.height;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const p = opts.place(w, h);
    // About one line every 4.6 px of depth and one sample every 2.6 px across.
    const rows = Math.max(40, Math.min(96, Math.round((2 * R * p.s * Math.sin(EL)) / 4.6)));
    const cols = Math.max(96, Math.min(260, Math.round((2 * R * p.s) / 2.6)));
    const grid = rows !== view.rows || cols !== view.cols;
    view = { ...p, rows, cols };
    if (grid) fr = makeFrame(view);
    else fr.view = view;
    const n = p.s > 150 ? 560 : 300;
    if (n !== stream.n) {
      // The gas should already be falling on the first frame. Filling the stream
      // takes a while the first time, so it is done in slices before the plate is seen.
      stream = makeStream(n, rand, 0);
      seed = seeder(stream, F, rand);
      if (opts.still) fill(Infinity);
      else idle(pump);
    }
    if (!running) draw();
  }

  const idle = (fn: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 400 }) : setTimeout(fn, 32));
  const fill = (budget: number) => {
    if (seed?.(budget)) seed = null;
  };
  function pump() {
    fill(5);
    if (seed) idle(pump);
  }

  function rowsPass() {
    const { rows, cols, cx, s } = view;
    const upto = Math.min(rows, Math.ceil(reveal * rows));
    const x0 = cx - s * F.a * R, dx = (2 * s * F.a * R) / (cols - 1);
    const half = (s * F.a * R * Math.sin(EL)) / (rows - 1); // half the gap between rows on screen
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (let pass = 0; pass < 2; pass++) {
      // Ground first, then the donor's surface on top in full ink.
      for (let j = 0; j < upto; j++) {
        const row = j * cols, prev = row - cols;
        const depth = j / (rows - 1); // 0 nearest
        // The row being plotted right now is brighter, like a pen still on the paper.
        const pen = reveal < 1 && j === upto - 1 ? 0.5 : 0;
        ctx.beginPath();
        let open = false;
        for (let i = 0; i < cols; i++) {
          const k = row + i;
          const want = pass ? fr.kind[k] === 2 : fr.kind[k] === 1;
          const on = want && fr.vis[k] === 1;
          if (on) {
            if (!open) {
              // Start exactly where this row rises above the horizon in front of it.
              const kp = k - 1;
              if (i && fr.kind[kp] && !fr.vis[kp] && j) {
                const a0 = fr.sy[kp] - fr.hz[prev + i - 1], a1 = fr.sy[k] - fr.hz[prev + i];
                const t = a0 === a1 ? 0 : a0 / (a0 - a1);
                ctx.moveTo(x0 + (i - 1 + t) * dx, fr.sy[kp] + (fr.sy[k] - fr.sy[kp]) * t);
                ctx.lineTo(x0 + i * dx, fr.sy[k]);
              } else if (i && pass && fr.kind[kp] === 1 && fr.vis[kp]) {
                ctx.moveTo(x0 + (i - 1) * dx, fr.sy[kp]);
                ctx.lineTo(x0 + i * dx, fr.sy[k]);
              } else ctx.moveTo(x0 + i * dx, fr.sy[k]);
              open = true;
            } else ctx.lineTo(x0 + i * dx, fr.sy[k]);
          } else if (open) {
            const kp = k - 1;
            if (fr.kind[k] && !fr.vis[k] && j && (pass ? fr.kind[k] === 2 : fr.kind[k] === 1)) {
              const a0 = fr.sy[kp] - fr.hz[prev + i - 1], a1 = fr.sy[k] - fr.hz[prev + i];
              const t = a0 === a1 ? 1 : a0 / (a0 - a1);
              ctx.lineTo(x0 + (i - 1 + t) * dx, fr.sy[kp] + (fr.sy[k] - fr.sy[kp]) * t);
            }
            open = false;
          }
        }
        if (pass) {
          ctx.strokeStyle = `rgba(${ink},${(0.92 - depth * 0.25 + pen).toFixed(3)})`;
          ctx.lineWidth = 1.15;
          // The star's surface is level, so a second line midway between rows is exact.
          ctx.stroke();
          ctx.translate(0, -half);
          ctx.globalAlpha = 0.7;
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.translate(0, half);
          continue;
        } else {
          ctx.strokeStyle = `rgba(${ink},${Math.min(1, 0.46 - depth * 0.3 + pen).toFixed(3)})`;
          ctx.lineWidth = 1;
        }
        ctx.stroke();
      }
    }
  }

  function rim() {
    // The accretor's Roche lobe: the level of the pass, traced around its well.
    const hz = shape(F, F.crit);
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
    ctx.strokeStyle = `rgba(${ink},${(0.5 * reveal).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function particles() {
    // Each parcel is a short streak along its own motion, capped so fast gas
    // near the accretor does not smear.
    ctx.beginPath();
    for (let i = 0; i < stream.n; i++) {
      if (stream.age[i] < 0.02) continue;
      const x = stream.x[i], y = stream.y[i];
      project(view, F, theta, x, y, height(F, x, y), pt);
      if (!visible(fr, pt)) continue;
      const vx = stream.vx[i], vy = stream.vy[i];
      const tail = Math.min(0.05, 0.016 / (Math.hypot(vx, vy) + 1e-3));
      const bx = x - vx * tail, by = y - vy * tail;
      project(view, F, theta, bx, by, height(F, bx, by), pt2);
      ctx.moveTo(pt2[0], pt2[1]);
      ctx.lineTo(pt[0], pt[1]);
    }
    ctx.strokeStyle = `rgba(${accent},${(0.9 * Math.min(1, (reveal - 0.35) / 0.4)).toFixed(3)})`;
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }

  function labels() {
    const fade = Math.max(0, Math.min(1, (reveal - 0.7) / 0.3));
    if (!fade) return;
    const small = view.s < 150;
    const mark = (x: number, y: number, hh: number, text: string, italic: boolean, lift: number, sub?: string) => {
      project(view, F, theta, x, y, hh, pt);
      const seen = visible(fr, pt, 3) ? 1 : 0.4;
      const tx = pt[0], ty = pt[1] - lift;
      ctx.strokeStyle = `rgba(${ink},${(0.38 * fade * seen).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pt[0], pt[1] - 4);
      ctx.lineTo(tx, ty + 6);
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.font = italic ? `italic ${small ? 15 : 17}px ${math}` : `${small ? 11 : 12}px ${sans}`;
      // A patch of sky behind the word, so the ground lines never strike through it.
      const wd = ctx.measureText(text).width + (sub ? 8 : 0);
      ctx.fillStyle = `rgba(${paper},${(0.82 * fade).toFixed(3)})`;
      ctx.fillRect(tx - wd / 2 - 5, ty - 12, wd + 10, 17);
      ctx.fillStyle = `rgba(${ink},${(0.86 * fade * seen).toFixed(3)})`;
      ctx.fillText(text, tx - (sub ? 3 : 0), ty);
      if (sub) {
        const tw = ctx.measureText(text).width;
        ctx.font = `${small ? 10 : 11}px ${math}`;
        ctx.textAlign = "left";
        ctx.fillText(sub, tx - 3 + tw / 2 + 1, ty + 4);
      }
    };
    const pass = shape(F, F.crit);
    mark(F.l1, 0, pass, "L", true, small ? 30 : 42, "1");
    mark(F.x1, 0, pass, "donor", false, small ? 34 : 50);
    mark(F.x2, 0, shape(F, F.crit) + 0.02, "accretor", false, small ? 44 : 64);
  }

  function draw() {
    if (!w) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (reveal <= 0) return; // nothing is plotted yet, so there is nothing to work out
    scan(fr, F, theta);
    rowsPass();
    if (reveal > 0.5) rim();
    if (reveal > 0.35 && !seed) particles();
    labels();
    opts.onFrame?.(F, theta);
  }

  function tick(now: number) {
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    if (Math.abs(wantF - F.f) > 1e-5) F = field(wantF);
    // Kepler: the tighter orbit turns faster, and the stream keeps the same clock.
    const d = ((dt * TAU) / period) * omega(F.a);
    theta += d;
    if (reveal < 1) reveal = Math.min(1, reveal + dt / 1.5);
    if (seed) fill(3);
    else stepStream(stream, F, d, rand);
    draw();
    if (running) raf = requestAnimationFrame(tick);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  return {
    setF(f) {
      wantF = f;
      if (!running) {
        F = field(f);
        draw();
      }
    },
    run(on) {
      if (opts.still || on === running) return;
      running = on;
      last = 0;
      cancelAnimationFrame(raf);
      if (on) raf = requestAnimationFrame(tick);
      else if (reveal < 1) {
        // Left mid-plot: finish the drawing rather than leave half of it on the page.
        reveal = 1;
        draw();
      }
    },
    refit: resize,
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    },
  };
}
