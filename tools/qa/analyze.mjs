// Every frame of a recorded sequence, measured: how much changed since the
// frame before, where, and whether the things being tracked moved smoothly.
//
// A frame is flagged when
//   blank   it is all one tone (a canvas that failed to draw, a cover that never opened)
//   held    it is identical to the frame before while its neighbours are moving (a dropped update)
//   jump    it changed several times more than the frames either side (something popped)
//   kink    a tracked element, or a number the page reports, changed speed abruptly
//   back    a tracked element reversed direction for a frame (jitter)
//   shift   the page changed height (something reflowed: content below it moved)
// Flags are places to look, not verdicts: a cut is a jump on purpose.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { steady } from "./lib.mjs";
const sharp = createRequire(import.meta.url)("sharp");

const W = 240; // analysis width; height follows the frame

const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
};

/**
 * Abrupt changes of speed in a series: |second difference| far above what is
 * usual for it. Setting off from rest is not one: everything here arrives on
 * a curve that starts at full speed, on purpose. Stopping dead, or changing
 * speed part-way, is.
 */
function kinks(v, floor) {
  const acc = v.map((_, i) => (i > 0 && i < v.length - 1 ? v[i + 1] - 2 * v[i] + v[i - 1] : 0));
  const mag = acc.map(Math.abs);
  const usual = median(mag.filter((m) => m > 1e-9));
  const out = [];
  for (let i = 1; i < v.length - 1; i++) {
    const near = Math.max(mag[i - 1] ?? 0, mag[i + 1] ?? 0);
    const before = Math.abs(v[i] - v[i - 1]);
    if (before < floor * 0.5) continue; // from rest
    if (mag[i] > floor && mag[i] > 6 * usual && mag[i] > 3 * near) out.push({ i, by: +mag[i].toFixed(3) });
  }
  return out;
}
/** Frames where a series steps back against the way it is going. */
function reversals(v, floor) {
  const out = [];
  for (let i = 2; i < v.length - 1; i++) {
    const a = v[i - 1] - v[i - 2], b = v[i] - v[i - 1], c = v[i + 1] - v[i];
    if (Math.abs(b) > floor && a * b < 0 && b * c < 0 && Math.abs(a) > floor && Math.abs(c) > floor) out.push({ i, by: +Math.abs(b).toFixed(3) });
  }
  return out;
}

export async function analyze(dir) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "frames.json"), "utf8"));
  const frames = meta.frames;
  let prev = null, h = 0;
  const diff = [], lum = [], box = [];
  // A take about one element is measured on that element alone, held still.
  const focus = frames.some((f) => f.els?.focus);
  const size = focus ? frames.find((f) => f.els?.focus).els.focus : null;
  for (const f of frames) {
    const src = focus ? await steady(sharp, path.join(dir, f.file), [...(f.els.focus ?? [0, -1e5]).slice(0, 2), size[2], size[3]]) : sharp(path.join(dir, f.file));
    const { data, info } = await src.resize(W).greyscale().raw().toBuffer({ resolveWithObject: true });
    h = info.height;
    let sum = 0, sq = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
      sq += data[i] * data[i];
    }
    const mean = sum / data.length;
    lum.push({ mean, sd: Math.sqrt(Math.max(0, sq / data.length - mean * mean)) });
    if (prev) {
      let d = 0, x0 = W, y0 = h, x1 = -1, y1 = -1;
      for (let i = 0; i < data.length; i++) {
        const e = Math.abs(data[i] - prev[i]);
        d += e;
        if (e > 10) {
          const x = i % W, y = (i / W) | 0;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
      diff.push(d / data.length);
      box.push(x1 < 0 ? null : [x0 / W, y0 / h, (x1 + 1) / W, (y1 + 1) / h].map((v) => +v.toFixed(3)));
    } else {
      diff.push(0);
      box.push(null);
    }
    prev = data;
  }

  const flags = [];
  const flag = (n, kind, what) => flags.push({ n, kind, what, label: frames[n]?.label });
  frames.forEach((f, i) => {
    // (An element that is not yet mostly in the window is not a blank frame: a plate fades up as it comes in.)
    const tall = meta.view === "phone" ? 844 : 900;
    const box = f.els?.focus;
    const inView = !focus || (box && Math.min(tall, box[1] + box[3]) - Math.max(0, box[1]) > 0.7 * Math.min(tall, box[3]));
    if (lum[i].sd < 0.6 && inView) flag(i, "blank", `one tone (${lum[i].mean.toFixed(0)}/255)`);
  });
  for (let i = 1; i < frames.length - 1; i++) {
    const around = [];
    for (let k = Math.max(1, i - 4); k <= Math.min(frames.length - 1, i + 4); k++) if (k !== i) around.push(diff[k]);
    const usual = median(around);
    // (A sky drifting a fraction of a pixel a frame is drawn every other frame on purpose; that is not a stall.)
    if (diff[i] === 0 && diff[i - 1] > 0.15 && diff[i + 1] > 0.15) flag(i, "held", `no change between moving frames (${diff[i - 1].toFixed(2)}, ${diff[i + 1].toFixed(2)})`);
    if (diff[i] > 0.6 && diff[i] > 4 * usual && diff[i] > 2.5 * Math.max(diff[i - 1], diff[i + 1])) flag(i, "jump", `changed ${diff[i].toFixed(2)} against a usual ${usual.toFixed(2)}`);
  }

  // The page's own height. It may only change once, early, when the cover is given its hold.
  for (let i = 1; i < frames.length; i++) {
    const d = (frames[i].tall ?? 0) - (frames[i - 1].tall ?? 0);
    if (d !== 0 && frames[i - 1].tall) flag(i, "shift", `the page became ${Math.abs(d)} px ${d > 0 ? "taller" : "shorter"}`);
  }

  // What the page was asked to report: tracked elements (x, y, w, h, opacity) and notes.
  const series = {};
  for (const f of frames) {
    for (const [name, v] of Object.entries(f.els ?? {})) {
      if (name === "focus") continue;
      ["x", "y", "w", "h", "o"].forEach((k, j) => ((series[`${name}.${k}`] ??= []).push(v[j])));
      // The same height measured on the page rather than in the window: for anything
      // that scrolls with the page, this is its own motion with the scroll taken out.
      (series[`${name}.page`] ??= []).push(v[1] + f.y);
    }
    for (const [name, obj] of Object.entries(f.notes ?? {})) for (const [k, v] of Object.entries(obj ?? {})) if (typeof v === "number") (series[`${name}.${k}`] ??= []).push(v);
  }
  // Of an element's two heights keep the one that moves less: what is fixed to
  // the window is judged in the window, what scrolls with the page on the page.
  const range = (v) => Math.max(...v) - Math.min(...v);
  for (const name of Object.keys(series).filter((k) => k.endsWith(".page"))) {
    const y = name.replace(/\.page$/, ".y");
    if (!series[y] || series[y].length !== frames.length || series[name].length !== frames.length) continue;
    delete series[range(series[name]) <= range(series[y]) ? y : name];
  }
  const traces = {};
  for (const [name, v] of Object.entries(series)) {
    if (v.length !== frames.length) continue;
    const span = Math.max(...v) - Math.min(...v);
    if (span < 1e-6) continue;
    const opacity = name.endsWith(".o");
    // Floors: half a pixel for a position, 2% for an opacity; for anything else
    // 0.4% of its range, and never less than a ten-thousandth of its size (rounding is not motion).
    const size = Math.max(Math.abs(Math.max(...v)), Math.abs(Math.min(...v)));
    const floor = opacity ? 0.02 : /\.(x|y|w|h|page)$/.test(name) ? 0.5 : Math.max(span * 0.004, size * 1e-4);
    const k = kinks(v, floor), r = reversals(v, floor);
    traces[name] = { from: +v[0].toFixed(3), to: +v.at(-1).toFixed(3), min: +Math.min(...v).toFixed(3), max: +Math.max(...v).toFixed(3), kinks: k.length, reversals: r.length };
    k.forEach((e) => flag(e.i, "kink", `${name} changed speed by ${e.by}`));
    r.forEach((e) => flag(e.i, "back", `${name} stepped back ${e.by}`));
  }

  const moving = diff.filter((d) => d > 0.02).length;
  const out = {
    id: meta.id,
    frames: frames.length,
    seconds: +(frames.length / meta.fps).toFixed(2),
    focus: size ? [Math.round(size[2]), Math.round(size[3])] : null,
    moving,
    still: frames.length - moving,
    change: { mean: +(diff.reduce((a, b) => a + b, 0) / Math.max(1, diff.length)).toFixed(3), peak: +Math.max(...diff).toFixed(3), peakAt: diff.indexOf(Math.max(...diff)) },
    flags,
    counts: flags.reduce((m, f) => ((m[f.kind] = (m[f.kind] ?? 0) + 1), m), {}),
    traces,
    diff: diff.map((d) => +d.toFixed(3)),
    box,
  };
  fs.writeFileSync(path.join(dir, "analysis.json"), JSON.stringify(out));
  return out;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  for (const dir of process.argv.slice(2)) {
    const a = await analyze(dir);
    console.log(a.id, `${a.frames} frames, ${a.moving} moving`, JSON.stringify(a.counts));
    for (const f of a.flags.slice(0, 20)) console.log(`  #${f.n} ${f.kind}: ${f.what}${f.label ? ` [${f.label}]` : ""}`);
  }
}
