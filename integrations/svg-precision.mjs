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
          const out = html.replace(GEOMETRY, (_, k, v) => ` ${k}="${round(v)}"`);
          before += html.length;
          after += out.length;
          await fs.writeFile(p, out);
        }
        logger.info(`rounded SVG geometry: ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB`);
      },
    },
  };
}
