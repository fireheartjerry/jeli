// After build, round SVG geometry in the emitted HTML to one decimal place.
// Figures compute coordinates in JS at build time and serialise them at full
// float precision; 0.1 user units is far below a device pixel at our scales.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GEOMETRY = /\s(d|points|cx|cy|r|x|y|x1|x2|y1|y2|width|height|transform)="([^"]*)"/g;
const round = (s) => s.replace(/-?\d+\.\d{2,}/g, (n) => {
  const v = Math.round(parseFloat(n) * 10) / 10;
  return Object.is(v, -0) ? "0" : String(v);
});

/**
 * A polyline written with relative steps is about a third shorter than the
 * same line written with absolute points: every coordinate becomes a short
 * difference. Only paths made of straight moves are rewritten, and only in
 * figures whose scripts never read their paths back (SAFE); anything else is
 * left exactly as it was written.
 */
const SAFE = new Set(["topsojmap", "worldline", "export", "intercept", "research", "quoted", "submissions", "drift", "landscape"]);
const r1 = (v) => Math.round(v * 10) / 10;
const num = (v) => {
  const s = String(Object.is(r1(v), -0) ? 0 : r1(v));
  return s.replace(/^(-?)0\./, "$1.");
};
function relative(d) {
  if (!/^[\sMLHVZmlhvz\d.,-]+$/.test(d) || !/^\s*M/.test(d)) return d;
  const toks = d.match(/[MLHVZmlhvz]|-?\d*\.?\d+(?:e-?\d+)?/g);
  if (!toks) return d;
  let out = "", last = "", cx = 0, cy = 0, sx = 0, sy = 0, cmd = "", first = true;
  // Numbers run together where they can be told apart: a minus starts a new one, and so does
  // a point after a number that already has one. Otherwise they are kept apart by a space.
  let tail = null; // the number last written, if nothing has been written after it
  const put = (v) => {
    if (tail !== null && !(v.startsWith("-") || (v.startsWith(".") && tail.includes(".")))) out += " ";
    out += v;
    tail = v;
  };
  const emit = (c, vals) => {
    if (c !== last || c === "m") (out += c), (tail = null);
    vals.forEach(put);
    last = c;
  };
  for (let i = 0; i < toks.length; ) {
    const t = toks[i];
    if (/[A-Za-z]/.test(t)) { cmd = t; i++; if (cmd === "Z" || cmd === "z") { out += "z"; last = "z"; tail = null; cx = sx; cy = sy; } continue; }
    const n = (k) => parseFloat(toks[i + k]);
    if (cmd === "M" || cmd === "m") {
      const x = cmd === "M" ? n(0) : cx + n(0), y = cmd === "M" ? n(1) : cy + n(1);
      if (first) { out += "M"; tail = null; put(num(x)); put(num(y)); last = "M"; first = false; }
      else emit("m", [num(x - cx), num(y - cy)]);
      cx = sx = r1(x); cy = sy = r1(y); i += 2; cmd = cmd === "M" ? "L" : "l";
    } else if (cmd === "L" || cmd === "l") {
      const x = cmd === "L" ? n(0) : cx + n(0), y = cmd === "L" ? n(1) : cy + n(1);
      emit("l", [num(x - cx), num(y - cy)]); cx = r1(x); cy = r1(y); i += 2;
    } else if (cmd === "H" || cmd === "h") {
      const x = cmd === "H" ? n(0) : cx + n(0); emit("h", [num(x - cx)]); cx = r1(x); i += 1;
    } else if (cmd === "V" || cmd === "v") {
      const y = cmd === "V" ? n(0) : cy + n(0); emit("v", [num(y - cy)]); cy = r1(y); i += 1;
    } else return d;
  }
  return out.length < d.length ? out : d;
}
function compact(html) {
  // Each figure runs from its data-fig attribute to the next one (or the end of the page).
  const marks = [...html.matchAll(/data-fig="([^"]+)"/g)];
  if (!marks.length) return html;
  let out = html.slice(0, marks[0].index);
  marks.forEach((m, i) => {
    const part = html.slice(m.index, i + 1 < marks.length ? marks[i + 1].index : html.length);
    out += SAFE.has(m[1]) ? part.replace(/\sd="([^"]*)"/g, (_, v) => ` d="${relative(v)}"`) : part;
  });
  return out;
}

export { relative };

export default function svgPrecision() {
  return {
    name: "svg-precision",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const files = (await fs.readdir(root, { recursive: true })).filter((f) => f.endsWith(".html"));
        let before = 0, after = 0;
        for (const f of files) {
          const p = path.join(root, f);
          const html = await fs.readFile(p, "utf8");
          const out = compact(html.replace(GEOMETRY, (_, k, v) => ` ${k}="${round(v)}"`));
          before += html.length;
          after += out.length;
          await fs.writeFile(p, out);
        }
        logger.info(`rounded SVG geometry: ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB`);
      },
    },
  };
}
