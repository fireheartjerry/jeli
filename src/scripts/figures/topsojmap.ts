import { gsap, scrubbed, whileVisible, phase, q, qa } from "../motion";
import { rowScale, arc } from "../geo/equalearth";
import {
  VIEW_W, VIEW_H, S, ROW, X0, PAD_T, DOT_R, TORONTO,
  px, cellX, cellY, rowLat, lonAt, graticule, ring, litAlpha,
} from "../geo/topsojgrid";

const NS = "http://www.w3.org/2000/svg";
const BAND = 0.12; // radians of great circle over which a newly reached dot glows
const SHADES = 16;

// Scroll beats (fractions of the scrubbed timeline).
const SCAN = [0, 0.2] as const;
const WAVE = [0.2, 0.86] as const;

export default function (root: HTMLElement) {
  const stage = q<HTMLDivElement>(root, ".tm");
  const svg = q<SVGSVGElement>(stage, "svg");
  const canvas = q<HTMLCanvasElement>(stage, "canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const css = getComputedStyle(root);
  const INK = css.getPropertyValue("--ink").trim() || "#141413";
  const ACC = css.getPropertyValue("--accent").trim() || "#2743d6";

  // ---- data ---------------------------------------------------------------
  const data = JSON.parse(stage.dataset.map!) as { d: string; n: string[]; s: number[]; w: number[]; max: number };
  const bytes = Uint8Array.from(atob(data.d), (ch) => ch.charCodeAt(0));
  const N = bytes.length / 3;
  const X = new Float32Array(N), Y = new Float32Array(N), D = new Float32Array(N);
  const C = new Uint8Array(N), SH = new Int8Array(N);
  const cells = new Map<number, number>();
  const nC = data.n.length;
  const lit = data.s.map((s) => s > 0);
  const reach = new Float32Array(nC).fill(Infinity);
  const members: number[][] = Array.from({ length: nC }, () => []);
  let lastRow = -1, lat = 0, scale = 1;
  for (let i = 0; i < N; i++) {
    const r = bytes[i * 3], c = bytes[i * 3 + 1], k = bytes[i * 3 + 2];
    if (r !== lastRow) { lastRow = r; lat = rowLat(r); scale = rowScale(lat); }
    X[i] = cellX(r, c); Y[i] = cellY(r); C[i] = k;
    D[i] = arc(TORONTO.lon, TORONTO.lat, lonAt(X[i], scale), lat);
    SH[i] = lit[k] ? Math.min(SHADES - 1, Math.round(((litAlpha(data.s[k], data.max) - 0.24) / 0.76) * (SHADES - 1))) : -1;
    cells.set(r * 256 + c, i);
    members[k].push(i);
    if (lit[k]) reach[k] = Math.min(reach[k], D[i]);
  }
  const litIdx = [...Array(nC).keys()].filter((k) => lit[k] && members[k].length);
  // One entry per GA country or territory (France also stands for five overseas territories).
  const reachSorted = litIdx.flatMap((k) => Array<number>(data.w[k]).fill(reach[k])).sort((a, b) => a - b);
  let DMAX = 0;
  for (let i = 0; i < N; i++) if (SH[i] >= 0) DMAX = Math.max(DMAX, D[i]);
  DMAX += 0.01;
  const FRONT_END = DMAX + BAND;
  const shadeA = Array.from({ length: SHADES }, (_, b) => 0.24 + (0.76 * b) / (SHADES - 1));
  const [TX, TY] = px(TORONTO.lon, TORONTO.lat);

  const gratPaths = graticule();

  // ---- canvas -------------------------------------------------------------
  let k = 1, dpr = 1, r = DOT_R, greyA = 0.13;
  const st = { p: 1 };
  let hover = -1;
  const order = new Uint8Array(N); // draw bucket per dot, reused every frame

  function draw() {
    const c = ctx!;
    const p = st.p;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);

    const scan = phase(p, SCAN[0], SCAN[1]);
    const scanY = scan * (VIEW_H + 24) - 12;
    const front = phase(p, WAVE[0], WAVE[1]) * FRONT_END;

    // Graticule, revealed by the scan.
    c.save();
    c.beginPath();
    c.rect(0, 0, VIEW_W, Math.max(0, scanY));
    c.clip();
    c.strokeStyle = INK;
    c.lineWidth = 1 / k;
    for (const g of gratPaths) {
      c.globalAlpha = 0.07 * g.a;
      c.beginPath();
      for (const l of g.lines) {
        c.moveTo(l[0][0], l[0][1]);
        for (let j = 1; j < l.length; j++) c.lineTo(l[j][0], l[j][1]);
      }
      c.stroke();
    }
    c.restore();

    // Classify dots: 0 hidden, 1 grey, 2 glowing, 3.. lit shade.
    for (let i = 0; i < N; i++) {
      if (Y[i] > scanY) { order[i] = 0; continue; }
      if (SH[i] < 0 || D[i] > front) order[i] = 1;
      else order[i] = front - D[i] < BAND ? 2 : 3 + SH[i];
    }
    const dotsOf = (b: number, rad: number) => {
      c.beginPath();
      for (let i = 0; i < N; i++) {
        if (order[i] !== b) continue;
        c.moveTo(X[i] + rad, Y[i]);
        c.arc(X[i], Y[i], rad, 0, 6.2832);
      }
      c.fill();
    };
    c.fillStyle = INK;
    c.globalAlpha = greyA;
    dotsOf(1, r);
    c.fillStyle = ACC;
    for (let b = 0; b < SHADES; b++) {
      c.globalAlpha = shadeA[b];
      dotsOf(3 + b, r);
    }
    c.globalAlpha = 1;
    dotsOf(2, r * 1.12);

    // Hovered country, drawn over at full strength.
    if (hover >= 0) {
      c.fillStyle = lit[hover] && st.p > 0.5 ? ACC : INK;
      c.globalAlpha = lit[hover] ? 1 : 0.42;
      c.beginPath();
      for (const i of members[hover]) {
        if (order[i] === 0) continue;
        c.moveTo(X[i] + r * 1.15, Y[i]);
        c.arc(X[i], Y[i], r * 1.15, 0, 6.2832);
      }
      c.fill();
    }

    // The wavefront: every point at the current great-circle distance from Toronto.
    if (front > 0.005 && front < FRONT_END) {
      const fade = Math.min(1, front / 0.1, (FRONT_END - front) / 0.25);
      c.strokeStyle = ACC;
      c.globalAlpha = 0.5 * fade;
      c.lineWidth = 1 / k;
      c.beginPath();
      for (const l of ring(TORONTO.lon, TORONTO.lat, front, 240)) {
        c.moveTo(l[0][0], l[0][1]);
        for (let j = 1; j < l.length; j++) c.lineTo(l[j][0], l[j][1]);
      }
      c.stroke();
    }

    // Scan line while the land comes in.
    if (scan > 0 && scan < 1) {
      c.strokeStyle = INK;
      c.globalAlpha = 0.28;
      c.lineWidth = 1 / k;
      c.beginPath();
      c.moveTo(0, scanY);
      c.lineTo(VIEW_W, scanY);
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  let dirty = false;
  const request = () => {
    if (dirty) return;
    dirty = true;
    requestAnimationFrame(() => { dirty = false; draw(); });
  };

  function resize() {
    const w = stage.clientWidth;
    if (!w) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    k = w / VIEW_W;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(((w * VIEW_H) / VIEW_W) * dpr);
    // Keep dots at least ~0.8 CSS px across on narrow plates.
    r = Math.max(DOT_R, 0.8 / k);
    greyA = k < 0.5 ? 0.17 : 0.13;
    draw();
  }

  canvas.style.display = "block";
  q(svg, ".tm-static").style.display = "none";
  new ResizeObserver(resize).observe(stage);

  // ---- annotations --------------------------------------------------------
  const count = q<SVGTextElement>(svg, ".tm-count");
  const toronto = q<SVGGElement>(svg, ".tm-to");
  const torLabel = q<SVGGElement>(svg, ".tm-tol");
  const torLead = q<SVGPathElement>(torLabel, ".tm-lead");
  const legend = q<SVGGElement>(svg, ".tm-legend");
  const keySubs = qa<SVGTextElement>(svg, ".tm-key > .tm-sub");
  const callouts = qa<SVGGElement>(svg, ".tm-co").map((g) => ({
    g,
    lead: q<SVGPathElement>(g, ".tm-lead"),
    pin: q<SVGCircleElement>(g, ".tm-pin"),
    texts: qa<SVGTextElement>(g, "text"),
    k: Number(g.dataset.k),
  }));

  let shown = -1;
  const setCount = (n: number) => {
    if (n === shown) return;
    shown = n;
    count.textContent = String(n);

  };

  for (const el of [torLead, ...callouts.map((c) => c.lead)]) {
    const len = el.getTotalLength();
    el.style.strokeDasharray = `${len} ${len}`;
    el.style.strokeDashoffset = String(len);
  }
  gsap.set([toronto, torLabel.querySelector("text"), legend, ...keySubs, count, ...callouts.flatMap((c) => [c.pin, ...c.texts])], { opacity: 0 });

  // ---- scroll story -------------------------------------------------------
  const tl = scrubbed(root, { start: "top 85%", end: "center 45%" });
  const at = (d: number) => WAVE[0] + (d / FRONT_END) * (WAVE[1] - WAVE[0]);
  tl.to(st, {
    p: 1,
    duration: 1,
    onUpdate() {
      const front = phase(st.p, WAVE[0], WAVE[1]) * FRONT_END;
      let n = 0;
      while (n < reachSorted.length && reachSorted[n] <= front) n++;
      setCount(n);
      request();
    },
  }, 0);
  tl.to(count, { opacity: 1, duration: 0.04 }, SCAN[1] - 0.03)
    .to(keySubs, { opacity: 1, duration: 0.04 }, SCAN[1] - 0.02)
    .to(toronto, { opacity: 1, duration: 0.03, ease: "power3.out" }, SCAN[1] - 0.04)
    .to(torLead, { strokeDashoffset: 0, duration: 0.03 }, SCAN[1] - 0.02)
    .to(torLabel.querySelector("text"), { opacity: 1, duration: 0.03 }, SCAN[1] - 0.02);
  callouts.forEach((co) => {
    const t = at(reach[co.k]) + 0.01;
    // Pin, leader and label arrive together.
    tl.to(co.pin, { opacity: 1, duration: 0.02 }, t)
      .to(co.lead, { strokeDashoffset: 0, duration: 0.03 }, t)
      .to(co.texts, { opacity: 1, duration: 0.03, ease: "power3.out" }, t);
  });
  tl.to(legend, { opacity: 1, duration: 0.05 }, WAVE[1] + 0.02);
  st.p = 0;
  setCount(0);
  tl.progress(0);

  // ---- ambient: submissions arriving in Toronto ---------------------------
  const layer = q<SVGGElement>(svg, ".tm-arcs");
  const mk = (tag: string, cls: string) => {
    const el = document.createElementNS(NS, tag) as SVGGeometryElement;
    el.setAttribute("class", cls);
    el.style.opacity = "0";
    layer.append(el);
    return el;
  };
  const pool = Array.from({ length: 3 }, () => ({
    path: mk("path", "tm-arc") as SVGPathElement,
    head: mk("circle", "dot-accent") as SVGCircleElement,
    src: mk("circle", "tm-pulse") as SVGCircleElement,
    pulse: mk("circle", "tm-pulse") as SVGCircleElement,
    t: -1, dur: 1, len: 0,
  }));
  for (const a of pool) {
    a.head.setAttribute("r", "2.3");
    a.pulse.setAttribute("cx", TX.toFixed(1));
    a.pulse.setAttribute("cy", TY.toFixed(1));
  }
  // Sources: lit countries other than Canada, weighted gently toward larger audiences.
  const sources = litIdx.filter((kk) => data.n[kk] !== "Canada");
  const weights = sources.map((kk) => 1 + Math.log10(data.s[kk]));
  const wsum = weights.reduce((a, b) => a + b, 0);
  const pick = () => {
    let u = Math.random() * wsum;
    for (let j = 0; j < sources.length; j++) if ((u -= weights[j]) <= 0) return sources[j];
    return sources[0];
  };
  const ease = (x: number) => 0.5 - Math.cos(Math.PI * x) / 2;
  let wait = 0.6;
  const TRAIL = 0.38, TAIL = 0.5, PULSE = 1.1;

  whileVisible(root, (dt) => {
    const on = st.p > 0.97;
    wait -= dt;
    if (on && wait <= 0) {
      const a = pool.find((s) => s.t < 0);
      if (a) {
        const kk = pick();
        const m = members[kk];
        const i = m[(Math.random() * m.length) | 0];
        const x0 = X[i], y0 = Y[i];
        const dx = TX - x0, dy = TY - y0;
        const dist = Math.hypot(dx, dy);
        // Bow the arc upward, like a great-circle route drawn on a flat map.
        // Its crest stays inside the plot: the crest of a quadratic sits at (y0 + 2cy + y1) / 4.
        const lift = Math.min(0.34 * dist, 170);
        // Bow along the chord's normal, on its upper (or, for a vertical chord, eastern) side.
        let nx = -dy / dist, ny = dx / dist;
        if (ny > 0 || (Math.abs(ny) < 0.2 && nx < 0)) { nx = -nx; ny = -ny; }
        const cx = (x0 + TX) / 2 + nx * lift;
        const cy = Math.max((y0 + TY) / 2 + ny * lift, (80 - y0 - TY) / 2);
        a.path.setAttribute("d", `M${x0.toFixed(1)} ${y0.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${TX.toFixed(1)} ${TY.toFixed(1)}`);
        a.len = a.path.getTotalLength();
        a.path.style.strokeDasharray = `0 ${a.len * 2}`;
        a.src.setAttribute("cx", x0.toFixed(1));
        a.src.setAttribute("cy", y0.toFixed(1));
        a.dur = 1.5 + dist / 700;
        a.t = 0;
      }
      wait = 1.3 + Math.random() * 2.2;
    }
    for (const a of pool) {
      if (a.t < 0) continue;
      a.t += dt;
      const u = ease(Math.min(1, a.t / a.dur));
      const tail = a.t > a.dur ? Math.min(1, u - TRAIL + ((a.t - a.dur) / TAIL) * TRAIL) : Math.max(0, u - TRAIL);
      const vis = Math.max(0, u - tail) * a.len;
      a.path.style.strokeDasharray = `${vis.toFixed(1)} ${(a.len * 2).toFixed(1)}`;
      a.path.style.strokeDashoffset = (-tail * a.len).toFixed(1);
      a.path.style.opacity = vis > 0.5 ? "0.85" : "0";
      if (a.t <= a.dur) {
        const pt = a.path.getPointAtLength(u * a.len);
        a.head.setAttribute("cx", pt.x.toFixed(1));
        a.head.setAttribute("cy", pt.y.toFixed(1));
        a.head.style.opacity = "1";
      } else a.head.style.opacity = "0";
      // A small ring where the submission leaves, another where it lands.
      const s = Math.min(1, a.t / 0.9);
      a.src.setAttribute("r", (2 + 5 * s).toFixed(2));
      a.src.style.opacity = (0.7 * (1 - s)).toFixed(2);
      const pl = (a.t - a.dur) / PULSE;
      if (pl >= 0 && pl <= 1) {
        a.pulse.setAttribute("r", (6 + 12 * pl).toFixed(2));
        a.pulse.style.opacity = (0.75 * (1 - pl)).toFixed(2);
      } else a.pulse.style.opacity = "0";
      if (a.t > a.dur + Math.max(TAIL, PULSE)) {
        a.t = -1;
        a.path.style.opacity = "0";
        a.src.style.opacity = "0";
        a.pulse.style.opacity = "0";
      }
    }
  });

  // ---- pointer: name the country under the cursor or finger ---------------
  const tip = q<SVGGElement>(svg, ".tm-tip");
  const tipBox = q<SVGRectElement>(tip, ".tm-tipbox");
  const tipN = q<SVGTextElement>(tip, ".tm-tipn");
  const tipV = q<SVGTextElement>(tip, ".tm-tipv");
  const fmt = new Intl.NumberFormat("en-US");
  let tipW = 0, tipH = 22, pad = 8;
  let releaseTimer = 0;

  function nearest(x: number, y: number) {
    const r0 = Math.round((y - PAD_T) / ROW);
    let best = -1, bd = (S * 0.95) ** 2;
    for (let rr = r0 - 1; rr <= r0 + 1; rr++) {
      const c0 = Math.round((x - X0 - (rr % 2 ? S / 2 : 0)) / S);
      for (let cc = c0 - 1; cc <= c0 + 1; cc++) {
        const i = cells.get(rr * 256 + cc);
        if (i === undefined) continue;
        const d = (X[i] - x) ** 2 + (Y[i] - y) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
    }
    return best;
  }

  function setHover(kk: number) {
    if (kk === hover) return;
    hover = kk;
    request();
    if (kk < 0) { tip.setAttribute("opacity", "0"); return; }
    const small = k < 0.5;
    pad = small ? 22 : 8;
    tipN.textContent = data.n[kk];
    const showV = lit[kk] && st.p > 0.5;
    tipV.textContent = showV ? `${fmt.format(data.s[kk])} ${data.s[kk] === 1 ? "user" : "users"}` : "";
    const wn = tipN.getComputedTextLength();
    const gap = small ? 20 : 8;
    tipV.setAttribute("x", String(pad + wn + gap));
    tipW = pad * 2 + wn + (showV ? gap + tipV.getComputedTextLength() : 0);
    tipH = small ? 64 : 22;
    tipBox.setAttribute("width", tipW.toFixed(1));
    tipBox.setAttribute("height", String(tipH));
    tipBox.setAttribute("y", String(-tipH * 0.68));
    tip.setAttribute("opacity", "1");
  }

  let pending: PointerEvent | null = null;
  function fromPointer() {
    const e = pending;
    pending = null;
    if (!e) return;
    const rect = stage.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const y = ((e.clientY - rect.top) / rect.height) * VIEW_H;
    const i = nearest(x, y);
    const kk = i >= 0 && st.p > 0.02 && Y[i] <= phase(st.p, SCAN[0], SCAN[1]) * (VIEW_H + 24) - 12 ? C[i] : -1;
    setHover(kk);
    if (kk >= 0) {
      const off = k < 0.5 ? 70 : 22;
      const tx = Math.max(4, Math.min(VIEW_W - tipW - 4, x - tipW / 2));
      const ty = y - off < tipH ? y + off + tipH * 0.4 : y - off;
      tip.setAttribute("transform", `translate(${tx.toFixed(1)} ${ty.toFixed(1)})`);
    }
  }
  const onPointer = (e: PointerEvent) => {
    clearTimeout(releaseTimer);
    if (!pending) requestAnimationFrame(fromPointer);
    pending = e;
  };
  stage.addEventListener("pointermove", onPointer);
  stage.addEventListener("pointerdown", onPointer);
  stage.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") setHover(-1);
    else releaseTimer = window.setTimeout(() => setHover(-1), 2500);
  });
  stage.addEventListener("pointerup", (e) => {
    if (e.pointerType !== "mouse") releaseTimer = window.setTimeout(() => setHover(-1), 2500);
  });
}
