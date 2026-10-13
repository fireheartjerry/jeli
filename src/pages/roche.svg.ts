// The cover figure as a static image, for readers without JavaScript. It is
// the same code as the live canvas (src/scripts/roche3d.ts), run once at build.
import type { APIRoute } from "astro";
import { F_MAX } from "../scripts/binary";
import { field, height, shape, project, scan, visible, makeFrame, makeStream, seedStream, rowRuns, rng } from "../scripts/roche3d";

export const GET: APIRoute = () => {
  const W = 1200, H = 800;
  const F = field(F_MAX);
  const theta = 2.5;
  const view = { cx: 600, cy: 360, s: 322, rows: 84, cols: 220 };
  const fr = makeFrame(view);
  scan(fr, F, theta);

  const ground: string[] = [], star: string[] = [];
  for (let j = 0; j < view.rows; j++) {
    const fade = (0.46 - (j / (view.rows - 1)) * 0.3).toFixed(2);
    for (const run of rowRuns(fr, F, j)) {
      const d = run.pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
      if (run.star) star.push(d);
      else ground.push(`<path d="${d}" stroke-opacity="${fade}"/>`);
    }
  }

  const rand = rng(20260211);
  const st = makeStream(520, rand, 0);
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
    gas += `M${b[0].toFixed(1)} ${b[1].toFixed(1)}L${a[0].toFixed(1)} ${a[1].toFixed(1)}`;
  }

  let rim = "", open = false;
  for (let i = 0; i <= F.lobe.length; i++) {
    const [x, y] = F.lobe[i % F.lobe.length];
    project(view, F, theta, x, y, shape(F, F.crit), a);
    if (visible(fr, a, 2.5)) {
      rim += `${open ? "L" : "M"}${a[0].toFixed(1)} ${a[1].toFixed(1)}`;
      open = true;
    } else open = false;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" fill="none" stroke-linecap="round" stroke-linejoin="round">
<g stroke="#f0eee6" stroke-width="1.6">${ground.join("")}</g>
<path d="${star.join("")}" stroke="#f0eee6" stroke-opacity="0.9" stroke-width="1.9"/>
<path d="${rim}" stroke="#f0eee6" stroke-opacity="0.5" stroke-width="1.6" stroke-dasharray="3 7"/>
<path d="${gas}" stroke="#7c94ff" stroke-width="2"/>
</svg>`;
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml" } });
};
