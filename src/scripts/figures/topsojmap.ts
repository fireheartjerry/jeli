import { gsap, scrubbed, whileVisible, phase, q, qa } from "../motion";
import { rowScale, arc } from "../geo/equalearth";
import {
  VIEW_W, VIEW_H, CX, S, ROW, X0, PAD_T, DOT_R, TORONTO,
  px, cellX, cellY, rowLat, lonAt, graticule, walkRing, meridians, geodesic, litAlpha,
} from "../geo/topsojgrid";

const NS = "http://www.w3.org/2000/svg";
const KM = 6371;     // mean radius of the Earth
const BAND = 0.17;   // radians of great circle over which a newly reached dot settles to its shade
const SOFT = 10;     // degrees of longitude over which the survey brings a dot up to size
const SHADES = 16, GLOWS = 6, GROWS = 5;

// The scroll story, as fractions of it. Everything is in place by DONE: the
// figure must be finished, and its ambient life begun, when the plate rests in
// the middle of the window, which is a little before the story's own end.
const SURVEY = [0.05, 0.42] as const; // two meridians leave Toronto's and sweep the globe; the land is plotted between them
const KEY = [0.84, 0.895] as const;   // the scale of the shading is laid out
const DONE = 0.9;
// The plate is let out from the top as it rises past a line a little above the
// foot of the window (reveal.ts). A beat that belongs to one place on the map
// waits until that place is out.
const FOLD = 0.94;

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function (root: HTMLElement) {
  const stage = q<HTMLDivElement>(root, ".tm");
  const svg = q<SVGSVGElement>(stage, "svg");
  const canvas = q<HTMLCanvasElement>(stage, "canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const readout = root.querySelector<HTMLElement>("[data-readout]");
  const REST = readout?.textContent ?? "";
  const arrive = gsap.parseEase("arrive"), swap = gsap.parseEase("swap");
  const fmt = new Intl.NumberFormat("en-US");
  // A canvas keeps the colours it was painted with, so they are read from the
  // tokens here and again whenever the theme flips (see the listener below).
  const tokens = getComputedStyle(root);
  let INK = "", ACC = "";
  function readColours() {
    INK = tokens.getPropertyValue("--ink").trim();
    ACC = tokens.getPropertyValue("--accent").trim();
  }
  readColours();

  const seen = new WeakMap<object, Map<string, string>>();
  const fresh = (el: object, key: string, v: string) => {
    let m = seen.get(el);
    if (!m) seen.set(el, (m = new Map()));
    if (m.get(key) === v) return false;
    m.set(key, v);
    return true;
  };
  const attr = (el: Element, k: string, v: string) => { if (fresh(el, k, v)) el.setAttribute(k, v); };
  const css = (el: SVGElement | HTMLElement, k: string, v: string) => { if (fresh(el, `s:${k}`, v)) el.style.setProperty(k, v); };
  const op = (el: SVGElement | HTMLElement, v: number) => css(el, "opacity", v <= 0.004 ? "0" : v >= 0.996 ? "1" : v.toFixed(3));
  const text = (el: Element, v: string) => { if (fresh(el, "text", v)) el.textContent = v; };
  const mk = <E extends SVGElement>(tag: string, cls: string, parent: Element) => {
    const el = document.createElementNS(NS, tag) as E;
    el.setAttribute("class", cls);
    parent.append(el);
    return el;
  };
  /** A stroke drawn from its first end: u in 0..1. (A part hidden at this width has no length to measure, and is never seen.) */
  const ruled = (el: SVGGeometryElement) => {
    let len = 0;
    try {
      len = el.getTotalLength();
    } catch {
      len = 0;
    }
    el.style.strokeDasharray = `${len} ${len}`;
    return (u: number) => {
      css(el, "stroke-dashoffset", (len * (1 - u)).toFixed(2));
      op(el, u > 0 ? 1 : 0);
    };
  };

  // ---- data ---------------------------------------------------------------
  const data = JSON.parse(stage.dataset.map!) as { d: string; n: string[]; s: number[]; w: number[]; max: number };
  const bytes = Uint8Array.from(atob(data.d), (ch) => ch.charCodeAt(0));
  const N = bytes.length / 3;
  const X = new Float32Array(N), Y = new Float32Array(N), LON = new Float32Array(N), LAT = new Float32Array(N);
  const D = new Float32Array(N);  // great-circle distance from Toronto, radians
  const DL = new Float32Array(N); // degrees of longitude from Toronto's meridian, the short way round
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
    LON[i] = lonAt(X[i], scale); LAT[i] = lat;
    D[i] = arc(TORONTO.lon, TORONTO.lat, LON[i], lat);
    const dl = Math.abs(LON[i] - TORONTO.lon);
    DL[i] = dl > 180 ? 360 - dl : dl;
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
  const MER = meridians();
  const MN = MER.ys.length - 1;

  // ---- canvas -------------------------------------------------------------
  let k = 1, dpr = 1, r = DOT_R, greyA = 0.13;
  const st = { p: 0 };
  // Two beats are placed when the plate is measured (see measure): Toronto is marked once it is out
  // from under the fold (HOME); then the distance from it grows at a steady rate, and countries
  // with users light as it reaches them (WAVE).
  const HOME = [0.02, 0.12], WAVE = [0.24, 0.87];
  const cls = new Uint8Array(N), glw = new Uint8Array(N); // what to draw each dot as, reused every frame
  // Countries under the pointer, each coming up or going down: [country, level 0..1, wanted].
  const lifts: { k: number; a: number; want: number }[] = [];

  /** A meridian, from the top of the frame to the bottom or back. */
  function meridian(c: CanvasRenderingContext2D, lon: number, down: boolean, start: boolean) {
    for (let j = 0; j <= MN; j++) {
      const i = down ? j : MN - j;
      const x = CX + lon * MER.kx[i], y = MER.ys[i];
      if (start && j === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
  }
  /** The part of the globe within `sweep` degrees of longitude of Toronto's meridian (it runs off the left edge and back in at the right). */
  function surveyed(c: CanvasRenderingContext2D, sweep: number) {
    const west = TORONTO.lon - sweep, east = TORONTO.lon + sweep;
    c.beginPath();
    meridian(c, Math.max(-180, west), true, true);
    meridian(c, east, false, false);
    c.closePath();
    if (west < -180) {
      meridian(c, west + 360, true, true);
      meridian(c, 180, false, false);
      c.closePath();
    }
  }
  const dotsOf = (c: CanvasRenderingContext2D, of: Uint8Array, b: number, rad: number) => {
    c.beginPath();
    for (let i = 0; i < N; i++) {
      if (of[i] !== b) continue;
      c.moveTo(X[i] + rad, Y[i]);
      c.arc(X[i], Y[i], rad, 0, 6.2832);
    }
    c.fill();
  };
  const ringMove = (x: number, y: number) => ctx.moveTo(x, y);
  const ringLine = (x: number, y: number) => ctx.lineTo(x, y);

  function draw() {
    const c = ctx!;
    const p = st.p;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);

    const sweep = phase(p, SURVEY[0], SURVEY[1]) * (180 + SOFT);
    const front = phase(p, WAVE[0], WAVE[1]) * FRONT_END;

    // The graticule, as far as the survey has gone.
    if (sweep > 0) {
      c.save();
      if (sweep < 180) {
        surveyed(c, sweep);
        c.clip();
      }
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
    }

    // What each dot is this frame: not yet surveyed, coming up, land, or a country the distance has reached
    // (its shade, with a brightness that dies away behind the front).
    for (let i = 0; i < N; i++) {
      glw[i] = 0;
      const su = (sweep - DL[i]) / SOFT;
      if (su <= 0) cls[i] = 0;
      else if (su < 1) cls[i] = 1 + Math.min(GROWS - 1, Math.floor(su * GROWS));
      else if (SH[i] < 0 || D[i] > front) cls[i] = 1 + GROWS;
      else {
        cls[i] = 2 + GROWS + SH[i];
        const g = (front - D[i]) / BAND;
        if (g < 1) glw[i] = 1 + Math.min(GLOWS - 1, Math.floor((1 - g) * GLOWS));
      }
    }
    c.fillStyle = INK;
    c.globalAlpha = greyA;
    dotsOf(c, cls, 1 + GROWS, r);
    for (let g = 0; g < GROWS; g++) dotsOf(c, cls, 1 + g, r * arrive((g + 0.5) / GROWS));
    c.fillStyle = ACC;
    for (let b = 0; b < SHADES; b++) {
      c.globalAlpha = shadeA[b];
      dotsOf(c, cls, 2 + GROWS + b, r);
    }
    for (let g = 1; g <= GLOWS; g++) {
      const u = (g - 0.5) / GLOWS;
      c.globalAlpha = u * u;
      dotsOf(c, glw, g, r * (1 + 0.28 * u));
    }

    // Countries under the pointer, drawn over at full strength.
    for (const h of lifts) {
      if (h.a <= 0.004) continue;
      const warm = lit[h.k] && reach[h.k] <= front;
      c.fillStyle = warm ? ACC : INK;
      c.globalAlpha = h.a * (lit[h.k] ? 1 : 0.42);
      const rad = r * (1 + 0.15 * h.a);
      c.beginPath();
      for (const i of members[h.k]) {
        if (cls[i] <= GROWS) continue;
        c.moveTo(X[i] + rad, Y[i]);
        c.arc(X[i], Y[i], rad, 0, 6.2832);
      }
      c.fill();
    }

    // The front: every point at the current great-circle distance from Toronto.
    if (front > 0.005 && front < FRONT_END) {
      c.strokeStyle = ACC;
      c.globalAlpha = 0.55 * Math.min(1, front / 0.1, (FRONT_END - front) / 0.25);
      c.lineWidth = 1 / k;
      c.beginPath();
      walkRing(TORONTO.lon, TORONTO.lat, front, 240, ringMove, ringLine);
      c.stroke();
    }

    // The survey's two meridians. They are true meridians of the projection: straight where
    // they cross the middle of the map, bowed toward its edges.
    if (sweep > 0 && sweep < 180) {
      c.strokeStyle = INK;
      c.globalAlpha = 0.3 * Math.min(1, sweep / 5, (180 - sweep) / 8);
      c.lineWidth = 1 / k;
      const west = TORONTO.lon - sweep;
      c.beginPath();
      meridian(c, west < -180 ? west + 360 : west, true, true);
      meridian(c, TORONTO.lon + sweep, true, true);
      c.stroke();
    }
    c.globalAlpha = 1;
  }

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
  // The page announces a theme flip; repaint in the new colours.
  document.addEventListener("themechange", () => {
    readColours();
    draw();
  });

  // ---- annotations --------------------------------------------------------
  const count = q<SVGTextElement>(svg, ".tm-count");
  const toronto = q<SVGGElement>(svg, ".tm-to");
  const tHalo = q<SVGCircleElement>(toronto, ".tm-halo"), tRing = q<SVGCircleElement>(toronto, ".tm-ring"), tDot = q<SVGCircleElement>(toronto, ".dot-accent");
  const torLabel = q<SVGGElement>(svg, ".tm-tol");
  const torLead = ruled(q<SVGPathElement>(torLabel, ".tm-lead"));
  const torText = q<SVGTextElement>(torLabel, "text");
  const legend = q<SVGGElement>(svg, ".tm-legend");
  const legendTitle = q<SVGTextElement>(legend, ".tm-sub");
  const legendRule = ruled(q<SVGLineElement>(legend, ".tm-rule"));
  const swatches = qa<SVGCircleElement>(legend, ".tm-sw").map((el, j) => ({ el, tick: qa<SVGTextElement>(legend, ".tm-tick")[j], r: Number(el.getAttribute("r")) }));
  const keySubs = qa<SVGTextElement>(svg, ".tm-key > .tm-sub");
  const callouts = qa<SVGGElement>(svg, ".tm-co").map((g) => {
    const pin = q<SVGCircleElement>(g, ".tm-pin");
    return {
      lead: ruled(q<SVGPathElement>(g, ".tm-lead")), pin, r: Number(pin.getAttribute("r")), texts: qa<SVGTextElement>(g, "text"),
      k: Number(g.dataset.k), d: Number(g.dataset.d),
    };
  });
  const named = new Set(callouts.map((c) => c.k));

  // ---- the scroll story -----------------------------------------------------
  function measure() {
    const vh = window.innerHeight, box = root.getBoundingClientRect(), plot = stage.getBoundingClientRect();
    // How far into the story the page is when Toronto's row comes out from under the fold.
    const out = (plot.top - box.top + ((TY + 16) / VIEW_H) * plot.height - (FOLD - 0.85) * vh) / (0.4 * vh + box.height / 2);
    HOME[0] = Math.max(0.02, Math.min(0.3, out));
    HOME[1] = HOME[0] + 0.1;
    WAVE[0] = HOME[0] + 0.13;
  }
  let front = 0;
  function render() {
    const p = st.p;
    front = phase(p, WAVE[0], WAVE[1]) * FRONT_END;

    // Toronto is marked first: a ring closes on it, the point lands, its name is led out over the Atlantic.
    const ring = phase(p, HOME[0], HOME[0] + 0.06);
    attr(tRing, "transform", `scale(${(1 + 1.8 * (1 - arrive(ring))).toFixed(3)})`);
    op(tRing, ring);
    op(tHalo, ring);
    attr(tDot, "transform", `scale(${arrive(phase(p, HOME[0] + 0.025, HOME[0] + 0.075)).toFixed(3)})`);
    torLead(arrive(phase(p, HOME[0] + 0.05, HOME[1])));
    op(torText, phase(p, HOME[0] + 0.07, HOME[1] + 0.02));

    // The count is of the countries and territories whose nearest point the distance has reached.
    let n = 0;
    while (n < reachSorted.length && reachSorted[n] <= front) n++;
    // (It is shown once there is a country in it: the front reaches Canada at once.)
    text(count, String(Math.max(1, n)));
    const keyIn = n > 0 ? phase(p, WAVE[0], WAVE[0] + 0.035) : 0;
    op(count, keyIn);
    keySubs.forEach((el) => op(el, phase(keyIn, 0.3, 1)));

    // The six largest audiences are named as the distance reaches their pins.
    for (const c of callouts) {
      const at = WAVE[0] + (c.d / FRONT_END) * (WAVE[1] - WAVE[0]);
      const u = phase(p, at, at + 0.075);
      attr(c.pin, "r", (c.r * arrive(phase(u, 0, 0.35))).toFixed(2));
      op(c.pin, u > 0 ? 1 : 0);
      c.lead(arrive(phase(u, 0.1, 0.72)));
      c.texts.forEach((el, j) => {
        const v = phase(u, 0.45 + j * 0.13, 0.86 + j * 0.13);
        op(el, v);
        attr(el, "transform", `translate(0 ${(4 * (1 - arrive(v))).toFixed(2)})`);
      });
    }

    // Last, the scale of the shading: its rule, then each step along it.
    op(legendTitle, phase(p, KEY[0], KEY[0] + 0.03));
    legendRule(phase(p, KEY[0] + 0.005, KEY[1] - 0.01));
    swatches.forEach((s, j) => {
      const u = phase(p, KEY[0] + 0.008 + j * 0.006, KEY[0] + 0.03 + j * 0.006);
      attr(s.el, "r", (s.r * arrive(u)).toFixed(2));
      op(s.tick, phase(u, 0.4, 1));
    });

    // The header reads how far the front has gone and, where there is room for it, how many it has reached
    // (on a wide plate the count below is still under the fold when the front sets off). It hands back to the
    // total at either end.
    if (readout) {
      const into = phase(p, WAVE[0] - 0.012, WAVE[0] + 0.012), out = phase(p, WAVE[1] - 0.012, WAVE[1] + 0.02);
      const measuring = into >= 0.5 && out < 0.5;
      const within = `within ${fmt.format(Math.round((Math.min(front, DMAX) * KM) / 100) * 100)} km of Toronto`;
      text(readout, !measuring ? REST : k < 0.5 || n === 0 ? within : `${n} ${n === 1 ? "country" : "countries and territories"} ${within}`);
      op(readout, Math.min(Math.abs(2 * into - 1), Math.abs(2 * out - 1)));
    }
    draw();
  }
  measure();
  scrubbed(root, { start: "top 85%", end: "center 45%", onRefresh: () => { measure(); render(); } }).to(st, { p: 1, duration: 1, onUpdate: render });
  render();

  // ---- ambient: visits arriving in Toronto --------------------------------
  // One at a time or two, from a country drawn with a lean toward the larger
  // audiences, along the great circle to Toronto: the route a flight would
  // take, which on this projection bows toward the pole and, from the far side
  // of the world, runs along the top of the map. Its country is named as it leaves.
  const layer = q<SVGGElement>(svg, ".tm-arcs");
  const rand = mulberry(321); // a seed whose first four visits come from four continents
  const M = 72; // samples along a route
  const pool = Array.from({ length: 3 }, () => {
    const path = mk<SVGPathElement>("path", "tm-arc", layer);
    const head = mk<SVGCircleElement>("circle", "dot-accent", layer);
    const src = mk<SVGCircleElement>("circle", "tm-pulse", layer);
    const land = mk<SVGCircleElement>("circle", "tm-pulse", layer);
    const note = mk<SVGGElement>("g", "tm-note", layer);
    const noteN = mk<SVGTextElement>("text", "tm-noten", note), noteV = mk<SVGTextElement>("text", "tm-notev", note);
    for (const el of [path, head, src, land, note]) op(el, 0);
    attr(land, "cx", TX.toFixed(1));
    attr(land, "cy", TY.toFixed(1));
    attr(noteV, "y", "15");
    return { path, head, src, land, note, noteN, noteV, pts: new Float32Array((M + 1) * 2), cut: new Uint8Array(M + 1), t: -1, dur: 1, k: -1, named: false, f: 1 };
  });
  // Sources: lit countries, weighted by the square root of their users, so the long tail is heard from too.
  const weights = litIdx.map((kk) => Math.sqrt(data.s[kk]));
  const wsum = weights.reduce((a, b) => a + b, 0);
  const pick = () => {
    let u = rand() * wsum;
    for (let j = 0; j < litIdx.length; j++) if ((u -= weights[j]) <= 0) return litIdx[j];
    return litIdx[0];
  };
  const TRAIL = 0.3, TAIL = 0.5, PULSE = 1.1;
  let wait = 0.9, quiet = 1;

  /** The point a fraction f of the way along a route, as "x y". A step that jumps edges is not cut across: the point stays on the near side. */
  function pointAt(a: (typeof pool)[number], f: number) {
    const g = Math.min(M, Math.max(0, f * M));
    let i = Math.min(M - 1, Math.floor(g)), t = g - i;
    if (a.cut[i]) {
      if (t >= 0.5) i++;
      t = 0;
    }
    const j = Math.min(M, i + 1);
    return `${(a.pts[i * 2] + (a.pts[j * 2] - a.pts[i * 2]) * t).toFixed(1)} ${(a.pts[i * 2 + 1] + (a.pts[j * 2 + 1] - a.pts[i * 2 + 1]) * t).toFixed(1)}`;
  }
  /** The stretch of a route between fractions f0 and f1, as a path; the pen lifts where the route leaves one edge for the other. */
  function stretch(a: (typeof pool)[number], f0: number, f1: number) {
    let d = `M${pointAt(a, f0)}`;
    const last = Math.min(M - 1, Math.ceil(f1 * M) - 1);
    for (let i = Math.floor(f0 * M) + 1; i <= last; i++) d += `${a.cut[i - 1] ? "M" : "L"}${a.pts[i * 2].toFixed(1)} ${a.pts[i * 2 + 1].toFixed(1)}`;
    return `${d}${a.cut[Math.min(M - 1, Math.floor(f1 * M))] ? "M" : "L"}${pointAt(a, f1)}`;
  }

  whileVisible(root, (dt) => {
    const on = st.p >= DONE;
    const small = k < 0.5;
    wait -= dt;
    if (on && wait <= 0) {
      const a = pool.find((s) => s.t < 0);
      if (a) {
        const kk = pick();
        const m = members[kk];
        const i = m[(rand() * m.length) | 0];
        const w = geodesic(LON[i], LAT[i], TORONTO.lon, TORONTO.lat, M, a.pts, a.cut);
        a.dur = 1.1 + w * 1.05; // a steady pace: far places take longer
        a.t = 0;
        a.f = 1;
        a.k = kk;
        attr(a.src, "cx", X[i].toFixed(1));
        attr(a.src, "cy", Y[i].toFixed(1));
        // Name the country beside where it leaves from, unless it already carries a label.
        a.named = !small && !named.has(kk);
        if (a.named) {
          text(a.noteN, data.n[kk]);
          text(a.noteV, fmt.format(data.s[kk]));
          const right = X[i] < VIEW_W - 150;
          for (const el of [a.noteN, a.noteV]) attr(el, "text-anchor", right ? "start" : "end");
          attr(a.note, "transform", `translate(${(X[i] + (right ? 9 : -9)).toFixed(1)} ${(Y[i] < 40 ? Y[i] + 16 : Y[i] - 9).toFixed(1)})`);
        }
      }
      wait = 1.1 + rand() * 2.1;
    }
    // While the pointer is reading the map, these names step back so that there is one name on it at a time.
    // (They are slow to come back, so that crossing a strait does not bring one up for a moment.)
    quiet += ((hover < 0 ? 1 : 0) - quiet) * Math.min(1, dt * (hover < 0 ? 2.5 : 12));
    for (const a of pool) {
      if (a.t < 0) continue;
      a.t += dt;
      // If the story is taken back, a visit on its way lets go over a few frames.
      a.f = on ? 1 : Math.max(0, a.f - dt / 0.16);
      const u = swap(Math.min(1, a.t / a.dur));
      const tail = a.t > a.dur ? Math.min(1, 1 - TRAIL + ((a.t - a.dur) / TAIL) * TRAIL) : Math.max(0, u - TRAIL);
      const live = a.t <= a.dur + TAIL && u - tail > 0.002;
      if (live) attr(a.path, "d", stretch(a, tail, u));
      op(a.path, live ? 0.85 * a.f : 0);
      if (a.t <= a.dur) {
        attr(a.head, "transform", `translate(${pointAt(a, u)})`);
        attr(a.head, "r", small ? "4.6" : "2.3");
        op(a.head, a.f * Math.min(1, a.t / 0.2));
      } else op(a.head, 0);
      // A small ring where the visit leaves, another where it lands.
      const s = Math.min(1, a.t / 0.9);
      attr(a.src, "r", ((small ? 2 : 1) * (2 + 5 * arrive(s))).toFixed(2));
      op(a.src, a.f * 0.7 * (1 - s));
      const pl = (a.t - a.dur) / PULSE;
      attr(a.land, "r", ((small ? 2 : 1) * (6 + 12 * arrive(Math.max(0, Math.min(1, pl))))).toFixed(2));
      op(a.land, pl >= 0 && pl <= 1 ? a.f * 0.75 * (1 - pl) : 0);
      op(a.note, a.named ? quiet * a.f * Math.min(1, a.t / 0.3, Math.max(0, (a.dur * 0.8 - a.t) / 0.45)) : 0);
      if (a.f === 0 || a.t > a.dur + Math.max(TAIL, PULSE)) {
        a.t = -1;
        for (const el of [a.path, a.head, a.src, a.land, a.note]) op(el, 0);
      }
    }

    // The country under the pointer comes up, and the one it left goes down, over a few frames.
    let moved = false;
    for (let j = lifts.length - 1; j >= 0; j--) {
      const h = lifts[j];
      const to = h.a + (h.want - h.a) * Math.min(1, dt * (h.want ? 18 : 10));
      if (Math.abs(to - h.a) > 0.002) moved = true;
      h.a = Math.abs(h.want - to) < 0.01 ? h.want : to;
      if (!h.want && h.a === 0) lifts.splice(j, 1);
    }
    if (moved) draw();
    // A country stays named for a moment after the pointer slips off it, so crossing a strait does not blink.
    if (grace > 0 && (grace -= dt) <= 0) setHover(-1);
    // (And not at all once the survey has been taken back past it.)
    if (hover >= 0 && under >= 0 && st.p < SURVEY[1] && phase(st.p, SURVEY[0], SURVEY[1]) * (180 + SOFT) - DL[under] < SOFT) setHover(-1);
    tipA += ((hover >= 0 ? 1 : 0) - tipA) * Math.min(1, dt * (hover >= 0 ? 30 : 10));
    if (tipA < 0.01 && hover < 0) tipA = 0;
    attr(tip, "opacity", tipA.toFixed(3));
    if (hover >= 0) {
      tipW += (tipTo - tipW) * Math.min(1, dt * 20);
      attr(tipBox, "width", tipW.toFixed(1));
    }
  });

  // ---- pointer: name the country under the cursor or finger ---------------
  const tip = q<SVGGElement>(svg, ".tm-tip");
  const tipBox = q<SVGRectElement>(tip, ".tm-tipbox");
  const tipN = q<SVGTextElement>(tip, ".tm-tipn");
  const tipV = q<SVGTextElement>(tip, ".tm-tipv");
  let hover = -1, under = -1, grace = 0, tipA = 0, tipW = 0, tipTo = 0, tipH = 22, pad = 8;
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
    for (const h of lifts) h.want = h.k === kk ? 1 : 0;
    if (kk >= 0 && !lifts.some((h) => h.k === kk)) lifts.push({ k: kk, a: 0, want: 1 });
    const first = hover < 0 && tipA < 0.02;
    hover = kk;
    if (kk < 0) return;
    const small = k < 0.5;
    pad = small ? 22 : 8;
    text(tipN, data.n[kk]);
    const showV = lit[kk] && reach[kk] <= front;
    text(tipV, showV ? `${fmt.format(data.s[kk])} ${data.s[kk] === 1 ? "user" : "users"}` : "");
    // Sized from its own type, once per country named (never per frame).
    const wn = tipN.getComputedTextLength();
    const gap = small ? 20 : 8;
    attr(tipV, "x", String(pad + wn + gap));
    attr(tipN, "x", String(pad));
    tipTo = pad * 2 + wn + (showV ? gap + tipV.getComputedTextLength() : 0);
    if (first) tipW = tipTo;
    tipH = small ? 64 : 22;
    attr(tipBox, "height", String(tipH));
    attr(tipBox, "y", String(-tipH * 0.68));
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
    // Only land the survey has already plotted can be read.
    const kk = i >= 0 && phase(st.p, SURVEY[0], SURVEY[1]) * (180 + SOFT) - DL[i] >= SOFT ? C[i] : -1;
    if (kk >= 0) {
      grace = 0;
      under = i;
      setHover(kk);
    } else if (hover >= 0 && grace <= 0) grace = 0.16;
    if (kk >= 0) {
      const off = k < 0.5 ? 70 : 22;
      const tx = Math.max(4, Math.min(VIEW_W - tipTo - 4, x - tipTo / 2));
      const ty = y - off < tipH ? y + off + tipH * 0.4 : y - off;
      attr(tip, "transform", `translate(${tx.toFixed(1)} ${ty.toFixed(1)})`);
    }
  }
  const onPointer = (e: PointerEvent) => {
    clearTimeout(releaseTimer);
    if (!pending) requestAnimationFrame(fromPointer);
    pending = e;
  };
  const release = () => { pending = null; grace = 0; setHover(-1); };
  stage.addEventListener("pointermove", onPointer);
  stage.addEventListener("pointerdown", onPointer);
  stage.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") release();
    else releaseTimer = window.setTimeout(release, 2500);
  });
  stage.addEventListener("pointerup", (e) => {
    if (e.pointerType !== "mouse") releaseTimer = window.setTimeout(release, 2500);
  });
  stage.addEventListener("pointercancel", () => { releaseTimer = window.setTimeout(release, 2500); });
}
