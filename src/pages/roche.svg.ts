// Fig. "landscape" as a static image, for readers without JavaScript or with
// reduced motion: the finished state of the live canvas, from the same code
// (src/scripts/roche3d.ts), run once at build. The canvas draws its labels at
// one size whatever its width, so the image carries the figure at three widths
// and shows the one nearest the box it is given.
import type { APIRoute } from "astro";
import { F_MAX, aBallistic, aConservative } from "../scripts/binary";
import { R, EL, field, height, shape, project, scan, visible, makeFrame, makeStream, seedStream, rowRuns, rng, layout, grid } from "../scripts/roche3d";

const INK = "#f0eee6", ACCENT = "#7c94ff", PAPER = "#0a0b0e";
// An image cannot load the page's fonts, so it names ones a reader will have.
const SANS = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const SERIF = "'Latin Modern Roman', 'Times New Roman', Times, serif";
const n1 = (v: number) => (Math.round(v * 10) / 10).toString();

/**
 * A row of ground with the points it does not need left out: one is dropped
 * when it lies within `tol` px of the straight line between the last point
 * kept and the next one. The far rows are nearly straight for long stretches,
 * so this takes most of the image's weight and none of its shape.
 */
function thin(pts: [number, number][], tol = 0.12) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, ay] = out[out.length - 1], [bx, by] = pts[i + 1], [px, py] = pts[i];
    const dx = bx - ax, dy = by - ay;
    if (Math.abs(dx * (py - ay) - dy * (px - ax)) / (Math.hypot(dx, dy) || 1) > tol) out.push(pts[i]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** The finished figure for a box of W × H, as the inside of an svg, sampled as finely as the canvas samples it. */
function still(W: number, H: number) {
  const F = field(F_MAX);
  const theta = 2.5;
  const lay = layout(W, H);
  const g = grid(lay.s);
  const view = { cx: lay.cx, cy: lay.cy, s: lay.s, rows: g.rows, cols: g.cols };
  const fr = makeFrame(view);
  scan(fr, F, theta);
  const small = lay.compact;

  const line = (pts: [number, number][]) => "M" + pts.map(([x, y]) => `${n1(x)} ${n1(y)}`).join(" ");
  const ground: string[] = [], star: string[] = [];
  const half = (view.s * F.a * R * Math.sin(EL)) / (view.rows - 1);
  for (let j = 0; j < view.rows; j++) {
    const depth = j / (view.rows - 1);
    for (const run of rowRuns(fr, F, j)) {
      if (run.star) {
        const o = 0.92 - depth * 0.25;
        // (The star's surface is level: each of its rows is one straight stroke, and a second midway to the next.)
        const ends = thin(run.pts);
        star.push(`<path d="${line(ends)}" stroke-opacity="${o.toFixed(2)}"/><path d="${line(ends.map(([x, y]) => [x, y - half]))}" stroke-opacity="${(o * 0.7).toFixed(2)}"/>`);
      } else ground.push(`<path d="${line(thin(run.pts))}" stroke-opacity="${(0.46 - depth * 0.3).toFixed(2)}"/>`);
    }
  }

  const rand = rng(20260211);
  const st = makeStream(lay.s > 150 ? 560 : 300, rand, 0);
  seedStream(st, F, rand);
  const a = new Float32Array(4), b = new Float32Array(4);
  let gas = "";
  for (let i = 0; i < st.n; i++) {
    const x = st.x[i], y = st.y[i];
    project(view, F, theta, x, y, height(F, x, y), a);
    if (!visible(fr, a)) continue;
    const tail = Math.min(0.05, 0.016 / (Math.hypot(st.vx[i], st.vy[i]) + 1e-3));
    const bx = x - st.vx[i] * tail, by = y - st.vy[i] * tail;
    project(view, F, theta, bx, by, height(F, bx, by), b);
    gas += `M${n1(b[0])} ${n1(b[1])} ${n1(a[0])} ${n1(a[1])}`;
  }

  const pass = shape(F, F.crit);
  let rim = "", open = false;
  for (let i = 0; i <= F.lobe.length; i++) {
    const [x, y] = F.lobe[i % F.lobe.length];
    project(view, F, theta, x, y, pass, a);
    if (visible(fr, a, 2.5)) {
      rim += `${open ? " " : "M"}${n1(a[0])} ${n1(a[1])}`;
      open = true;
    } else open = false;
  }

  // The three labels, each on a patch of sky at the head of its leader.
  const mark = (x: number, y: number, hh: number, text: string, lift: number, sub?: string) => {
    project(view, F, theta, x, y, hh, a);
    const seen = visible(fr, a, 3) ? 1 : 0.4;
    const tx = a[0], ty = a[1] - lift;
    const size = sub ? (small ? 15 : 17) : small ? 11 : 12;
    const wd = sub ? size * 0.62 + 8 : text.length * size * 0.54;
    const word = sub
      ? `<text x="${n1(tx - 3)}" y="${n1(ty)}" text-anchor="middle" font-family="${SERIF}" font-style="italic" font-size="${size}" fill="${INK}" fill-opacity="${(0.86 * seen).toFixed(2)}">${text}<tspan font-style="normal" font-size="${small ? 10 : 11}" dy="4">${sub}</tspan></text>`
      : `<text x="${n1(tx)}" y="${n1(ty)}" text-anchor="middle" font-family="${SANS}" font-size="${size}" fill="${INK}" fill-opacity="${(0.86 * seen).toFixed(2)}">${text}</text>`;
    return `<path d="M${n1(a[0])} ${n1(a[1] - 4)}V${n1(ty + 6)}" stroke="${INK}" stroke-opacity="${(0.38 * seen).toFixed(2)}"/><rect x="${n1(tx - wd / 2 - 5)}" y="${n1(ty - 12)}" width="${n1(wd + 10)}" height="17" fill="${PAPER}" fill-opacity="0.82"/>${word}`;
  };
  const labels =
    mark(F.l1, 0, pass, "L", small ? 30 : 42, "1") + mark(F.x1, 0, pass, "donor", small ? 34 : 50) + mark(F.x2, 0, pass + 0.02, "accretor", small ? 44 : 64);

  // The scale bar: the two answers, to the scale of the ground, against the starting separation.
  const { x, y, gap } = lay.bar, s = view.s;
  const row = (i: number, v: number, name: string, colour: string, width: number) => {
    const yy = y + i * gap, len = s * v;
    return `<path d="M${x} ${yy - 4}V${yy + 4}M${x} ${yy}H${n1(x + len)}M${n1(x + len)} ${yy - 4}V${yy + 4}" stroke="${colour}" stroke-opacity="${i ? 0.6 : 0.95}" stroke-width="${width}" stroke-linecap="butt"/><text x="${n1(x + len + 9)}" y="${yy + 4}" font-family="${SANS}" font-size="11" fill="${INK}" fill-opacity="0.58">${name}<tspan dx="5" font-family="${SERIF}" font-size="12.5" fill="${colour}" fill-opacity="${i ? 0.86 : 1}">${v.toFixed(3)}</tspan></text>`;
  };
  const bar =
    row(0, aBallistic(F.f), "ballistic", ACCENT, 1.5) +
    row(1, aConservative(F.f), "classical", INK, 1) +
    `<path d="M${n1(x + s)} ${y - 9}V${y + gap + 9}" stroke="${INK}" stroke-opacity="0.42" stroke-dasharray="1 3"/>` +
    `<text x="${x}" y="${y - 15}" font-family="${SANS}" font-size="11" fill="${INK}" fill-opacity="0.58">separation</text>` +
    `<text x="${n1(x + s - 5)}" y="${y - 15}" font-family="${SERIF}" font-style="italic" font-size="14" fill="${INK}" fill-opacity="0.74">a<tspan font-style="normal" font-size="10" dy="3">0</tspan></text>`;

  return `<g stroke="${INK}">${ground.join("")}</g>
<g stroke="${INK}" stroke-width="1.15">${star.join("")}</g>
<path d="${rim}" stroke="${INK}" stroke-opacity="0.5" stroke-dasharray="2 4"/>
<path d="${gas}" stroke="${ACCENT}" stroke-opacity="0.9" stroke-width="1.1"/>
${labels}
${bar}`;
}

export const GET: APIRoute = () => {
  // The sizes the canvas has in a 1440 window, on a tablet held upright, and on a phone.
  const wide = [1132, 604], mid = [700, 373], narrow = [310, 279];
  const part = (cls: string, [W, H]: number[]) =>
    `<svg class="${cls}" viewBox="0 0 ${W} ${H}" width="100%" height="100%" fill="none" stroke-linecap="round" stroke-linejoin="round">\n${still(W, H)}\n</svg>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
<style>.m,.n{display:none}@media (max-width:919.98px){.w{display:none}.m{display:inline}}@media (max-width:519.98px){.m{display:none}.n{display:inline}}</style>
${part("w", wide)}
${part("m", mid)}
${part("n", narrow)}
</svg>`;
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml" } });
};
