// Contact sheets for a recorded sequence: frames laid out in reading order,
// each stamped with its number and time, with a strip along the bottom of
// every sheet showing how much each frame changed (so a pop or a stall is
// visible at a glance, and so is where on the sheet it happened).
//   node tools/qa/sheet.mjs <sequence dir> [every] [cols] [thumb width]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { steady } from "./lib.mjs";
const sharp = createRequire(import.meta.url)("sharp");

export async function sheets(dir, { every, cols = 6, rows = 5, tw = 316, name = "sheet" } = {}) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "frames.json"), "utf8"));
  const analysis = fs.existsSync(path.join(dir, "analysis.json")) ? JSON.parse(fs.readFileSync(path.join(dir, "analysis.json"), "utf8")) : null;
  const all = meta.frames;
  // By default, as many frames as fill at most three sheets.
  every ??= Math.max(1, Math.ceil(all.length / (cols * rows * 3)));
  const picked = all.filter((_, i) => i % every === 0 || i === all.length - 1);
  // A take about one element shows that element alone, held still, and so at a larger size.
  const size = all.find((f) => f.els?.focus)?.els.focus ?? null;
  const frameOf = async (f) => (size ? await steady(sharp, path.join(dir, f.file), [...(f.els.focus ?? [0, -1e5]).slice(0, 2), size[2], size[3]]) : sharp(path.join(dir, f.file)));
  const first = size ? { width: size[2] + 24, height: size[3] + 24 } : await sharp(path.join(dir, all[0].file)).metadata();
  if (size && first.height > first.width * 0.9) cols = Math.max(cols, 7); // tall plates: more across, so a sheet is not all height
  const th = Math.round((tw * first.height) / first.width);
  const pad = 4, bar = 16, strip = 34;
  const flagged = new Map((analysis?.flags ?? []).map((f) => [f.n, f.kind]));
  const files = [];
  for (let s = 0; s * cols * rows < picked.length; s++) {
    const part = picked.slice(s * cols * rows, (s + 1) * cols * rows);
    const W = pad + cols * (tw + pad), H = pad + Math.ceil(part.length / cols) * (th + bar + pad) + strip;
    const comps = [];
    let labels = "";
    for (let i = 0; i < part.length; i++) {
      const f = part[i];
      const x = pad + (i % cols) * (tw + pad), y = pad + Math.floor(i / cols) * (th + bar + pad);
      comps.push({ input: await (await frameOf(f)).resize(tw, th, { fit: "fill" }).jpeg({ quality: 80 }).toBuffer(), left: x, top: y + bar });
      const hot = flagged.get(f.n);
      labels += `<text x="${x + 2}" y="${y + 12}" fill="${hot ? "#ff8a66" : "#cfcfcf"}">#${f.n}  ${(f.t / 1000).toFixed(2)}s  y${Math.round(f.y)}${f.label ? "  " + f.label : ""}${hot ? "  !" + hot : ""}</text>`;
    }
    // The change strip: one bar per frame of the whole sequence; this sheet's span is lighter.
    let bars = "";
    if (analysis) {
      const peak = Math.max(0.5, ...analysis.diff), bw = (W - 2 * pad) / all.length;
      const a = part[0].n, b = part.at(-1).n;
      analysis.diff.forEach((d, i) => {
        const hgt = Math.max(1, (d / peak) * (strip - 8));
        const hot = flagged.get(i);
        bars += `<rect x="${(pad + i * bw).toFixed(1)}" y="${(H - 4 - hgt).toFixed(1)}" width="${Math.max(0.6, bw - 0.2).toFixed(1)}" height="${hgt.toFixed(1)}" fill="${hot ? "#ff8a66" : i >= a && i <= b ? "#9fb0ff" : "#555"}"/>`;
      });
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Menlo, monospace" font-size="10">${labels}${bars}</svg>`;
    const file = path.join(dir, `${name}-${s}.jpg`);
    await sharp({ create: { width: W, height: H, channels: 3, background: "#1c1c1c" } }).composite([...comps, { input: Buffer.from(svg), left: 0, top: 0 }]).jpeg({ quality: 84 }).toFile(file);
    files.push(file);
  }
  return files;
}

/** Frames n-1, n, n+1 at full size side by side, cropped to where they differ: for looking closely at a flag. */
export async function closeup(dir, n, { pad = 40 } = {}) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "frames.json"), "utf8"));
  const analysis = JSON.parse(fs.readFileSync(path.join(dir, "analysis.json"), "utf8"));
  const pick = [n - 1, n, n + 1].filter((i) => i >= 0 && i < meta.frames.length);
  const m = await sharp(path.join(dir, meta.frames[n].file)).metadata();
  const b = analysis.box[n] ?? [0, 0, 1, 1];
  let left = Math.max(0, Math.floor(b[0] * m.width) - pad), top = Math.max(0, Math.floor(b[1] * m.height) - pad);
  let width = Math.min(m.width - left, Math.ceil((b[2] - b[0]) * m.width) + 2 * pad), height = Math.min(m.height - top, Math.ceil((b[3] - b[1]) * m.height) + 2 * pad);
  // Three across must fit a sheet about 1900 wide.
  const scale = Math.min(1, 620 / width);
  const comps = [];
  for (let k = 0; k < pick.length; k++) {
    const buf = await sharp(path.join(dir, meta.frames[pick[k]].file)).extract({ left, top, width, height }).resize(Math.round(width * scale)).toBuffer();
    comps.push({ input: buf, left: 6 + k * (Math.round(width * scale) + 6), top: 6 });
  }
  const file = path.join(dir, `close-${n}.jpg`);
  await sharp({ create: { width: 6 + pick.length * (Math.round(width * scale) + 6), height: Math.round(height * scale) + 12, channels: 3, background: "#1c1c1c" } }).composite(comps).jpeg({ quality: 90 }).toFile(file);
  return file;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [dir, every, cols, tw] = process.argv.slice(2);
  console.log((await sheets(dir, { every: every ? +every : undefined, cols: cols ? +cols : undefined, tw: tw ? +tw : undefined })).join("\n"));
}
