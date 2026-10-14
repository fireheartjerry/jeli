import { gsap, scrubbed, whileVisible, phase, q, qa } from "../motion";

/**
 * Quoted Tech Computers: scrapers into a pricing table, and a label service
 * printing through CUPS.
 *
 * Three things move here, and they keep to one rule: the picture is always a
 * state the real system could be in.
 *
 *   The scroll story is a pure function of the block clocks K (0..T), so it
 *   runs backwards exactly. On a wide plate every block reads one clock; on a
 *   phone the blocks are stacked, and each follows its own place in the window.
 *   What fades in on a clock fades evenly with it, and only travels on the
 *   house curve: scrubbed fast, a fade on that curve is all there in a frame.
 *   Only events are not simply scrubbed (a request being answered, a job
 *   going from pending to processing): the clock says what has happened, and
 *   the event is played through, as fast as the page is going or at its own
 *   pace if the page is slower, so a page stopped anywhere never rests on a
 *   word half rolled over or a packet half-way down its wire.
 *
 *   Once a block's story has played, the system keeps working. The scrapers
 *   read a price again every few seconds, and the value takes the road it took
 *   the first time (selector, table row, dot). The print service answers a
 *   request, queues it, and prints the head of the queue, waiting each time
 *   for the last label to be taken. Both are pure functions of their own
 *   clocks too, so scrolling back out of them is a rewind and not a cut.
 *
 *   The pointer inspects: a card, its row and its dot are one price, and the
 *   barcode gives up the Code 128 symbol under the pointer.
 */

// ---- the scroll story, in units of the plate's clock ----
const T = 10;
const LOAD = [0.25, 1.0, 1.75]; // each catalog page starts to load as it comes into the window
const PLOT = 2.3; // the dot plot's axes are drawn
const X0 = 2.2, XS = 0.38; // the first price is read; the other five follow at this spacing
const FLY = 0.8; // a price's flight to its row
const DROP = 0.55; // and on down to its place on the axis
const TOP_END = 6.0; // the table and the plot are complete
const TYPE = [4.7, 5.4]; // the request is typed
const ARR = [5.45, 6.25, 6.7, 7.15]; // four requests are answered 200 and queued
const R0 = 0.42; // of one request's chain of events, the share its number takes to turn over (the first is typed instead)
const FEED = [6.2, 7.6]; // the first label prints
const Q_END = 7.9; // the queue is as the still shows it, and the service takes over
const BAND = { label: 7.6, draw: 7.8, step: 0.25, fold: [8.9, 9.8], end: 9.9 };

const xAt = (i: number) => X0 + i * XS;
const landAt = (i: number) => xAt(i) + FLY;
const P0 = ARR[0] + 0.52; // CUPS picks the first job up

// ---- the print service, in seconds ----
// One label's worth of automated work is three stages, in the proportions the
// bar chart gives them (7 : 8 : 15). By hand the same label takes 100 / 30 as long.
const SKU_S = 0.98, POST_S = 1.12, PRINT_S = 2.1;
const A0 = 0.12; // into a cycle, the next request begins
const A1 = 2.4; // but the first waits: the finished figure is left as the still shows it for a moment
const startOf = (n: number) => (n === 1 ? A1 : A0);
const TAKE = 0.5; // the finished label is taken from the tear bar
const FEED_F = 1.8 / PRINT_S; // of the print, the share at printing speed; the rest slows to the tear bar
const MANUAL_S = (SKU_S + POST_S + PRINT_S) / 0.3;
const GOLD = 0.6180339887;
const frac = (v: number) => v - Math.floor(v);
// The figure's printer works the way a label printer does in tear-off mode: it holds each job until the
// last label has been taken, and a person never takes one at the same moment twice. The story's own label
// is left on the tear bar a while longer, to be looked at.
const waitOf = (n: number, job: number) => (n === 1 ? 5.6 : 2.4 + 1.6 * frac(job * GOLD + 0.37));
const cycleOf = (n: number, job: number) => waitOf(n, job) + TAKE + PRINT_S;

const STATES = ["pending", "processing", "completed"];
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const toward = (v: number, to: number, step: number) => (v < to ? Math.min(to, v + step) : Math.max(to, v - step));
// Paper at printing speed, then the stepper slowing to rest: no change of speed where the two meet.
const feedPos = (u: number) => {
  const v = 2 / (1 + FEED_F);
  if (u <= FEED_F) return v * Math.max(0, u);
  const s = Math.min(1, (u - FEED_F) / (1 - FEED_F));
  return v * FEED_F + v * (1 - FEED_F) * (s - (s * s) / 2);
};

interface Geo {
  S: number; W: number; bw: number; gap: number; mSeg: number[]; aSeg: number[];
  seq: number; job: number; inch: number; lab: { h: number; off: number };
  pat: string; bar: { x0: number; mod: number; y: number; h: number };
}
type Box = { x: number; y: number; w: number; h: number };
type Vars = NonNullable<Parameters<typeof scrubbed>[1]>;

export default function (root: HTMLElement) {
  const svg = q<SVGSVGElement>(root, "svg.qt");
  const G: Geo = JSON.parse(svg.dataset.g!);
  const readout = root.querySelector<HTMLElement>("[data-readout]");
  const arrive = gsap.parseEase("arrive");
  const swap = gsap.parseEase("swap");

  // Every write goes through a memo: a value that has not changed is not written again,
  // so a part that is at rest costs nothing however often it is asked to draw.
  const memo = new WeakMap<Element, Record<string, string>>();
  const put = (el: Element, key: string, v: string) => {
    let m = memo.get(el);
    if (!m) memo.set(el, (m = {}));
    if (m[key] === v) return;
    m[key] = v;
    if (key === "opacity") (el as SVGElement).style.opacity = v;
    else if (key === "text") el.textContent = v;
    else el.setAttribute(key, v);
  };
  const op = (el: Element, v: number) => put(el, "opacity", v <= 0.004 ? "0" : v >= 0.996 ? "1" : v.toFixed(3));
  const tr = (el: Element, x: number, y: number) => put(el, "transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
  const num = (el: Element, key: string) => Number(el.getAttribute(key));

  const skuOf = (n: number) => `QT-2025-${String((G.seq + n) % 10000).padStart(4, "0")}`;

  // ---- Code 128, subset B: the same encoding the component drew, for whichever label is next ----
  const pattern = (v: number) => (v === 106 ? G.pat.slice(636) : G.pat.slice(v * 6, v * 6 + 6));
  const symbolPath = (v: number, m0: number) => {
    const p = pattern(v);
    let d = "", m = m0;
    for (let i = 0; i < p.length; i++) {
      const w = +p[i];
      if (i % 2 === 0) d += `M${+(G.bar.x0 + m * G.bar.mod).toFixed(2)} ${G.bar.y}h${+(w * G.bar.mod).toFixed(2)}v${G.bar.h}h${+(-w * G.bar.mod).toFixed(2)}z`;
      m += w;
    }
    return d;
  };
  function encode(text: string) {
    const vals = [104];
    let sum = 104;
    for (let i = 0; i < text.length; i++) {
      const v = text.charCodeAt(i) - 32;
      vals.push(v);
      sum += v * (i + 1);
    }
    vals.push(sum % 103, 106);
    const starts: number[] = [], parts: string[] = [];
    let m = 0;
    for (const v of vals) {
      starts.push(m);
      parts.push(symbolPath(v, m));
      m += v === 106 ? 13 : 11;
    }
    return { text, vals, starts, parts, d: parts.join("") };
  }

  // ---- scrape ----
  const cards = qa<SVGGElement>(root, ".card");
  const prices = cards.map((c) => q<SVGTextElement>(c, ".price"));
  const loads = qa<SVGLineElement>(root, ".load");
  const sels = qa<SVGGElement>(root, ".sel").map((g) => ({ g, box: q<SVGRectElement>(g, ".sel-r"), tag: q<SVGGElement>(g, ".sel-tg") }));
  const flies = qa<SVGGElement>(root, ".fly").map((g) => ({ g, r: q<SVGRectElement>(g, ".fly-r"), t: q<SVGTextElement>(g, ".fly-t") }));
  const trace = q<SVGPathElement>(root, ".trace");

  // ---- table + plot ----
  const rows = qa<SVGGElement>(root, ".row").map((g) => ({ g, sku: q(g, ".sku"), nm: q(g, ".nm"), pr: q<SVGTextElement>(g, ".pr"), fl: q(g, ".row-fl") }));
  const rowsN = q(root, ".rows-n");
  const prows = qa<SVGGElement>(root, ".prow");
  const tracks = qa<SVGLineElement>(root, ".ptrack");
  const frame = [
    ...qa(root, ".pl").map((el) => ({ el, d: 0 })),
    ...qa(root, ".ptick, .tk").map((el) => ({ el, d: 0.1 + 0.07 * Number((el as SVGElement).dataset.k) })),
    ...qa(root, ".lg, .lg-d, .plot > .accent").map((el) => ({ el, d: 0.25 })),
  ];
  const ranges = qa<SVGLineElement>(root, ".range");
  const dots = qa<SVGCircleElement>(root, ".pdot[data-i]").map((c) => ({ c, i: Number(c.dataset.i), x: num(c, "cx"), y: num(c, "cy"), p: prows.indexOf(c.closest(".prow") as SVGGElement) }));
  const dotOf = dots.slice().sort((a, b) => a.i - b.i);
  const qtm = qa<SVGGElement>(root, ".qtm");
  const pings = qa<SVGCircleElement>(root, ".ping");
  const drop = q<SVGCircleElement>(root, ".drop");
  const halo = q<SVGCircleElement>(root, ".halo");
  const len = (l: SVGLineElement) => Math.abs(num(l, "x2") - num(l, "x1"));
  for (const l of [...tracks, ...ranges]) l.style.strokeDasharray = `${len(l) + 1} ${len(l) + 1}`;
  const trackLen = tracks.map((l) => len(l) + 1), rangeLen = ranges.map((l) => len(l) + 1);
  // A product's range is drawn once the last of its three prices is on the axis.
  const rangeAt = prows.map((_, p) => Math.max(...dots.filter((d) => d.p === p).map((d) => landAt(d.i))) + 0.05 + DROP);

  // ---- request + queue ----
  const req = q<SVGTextElement>(root, "text.req:not(.roll)");
  const rqClip = q<SVGRectElement>(root, ".rq-clip");
  const rqW = num(rqClip, "width");
  const rqCaret = q<SVGRectElement>(root, ".rq-caret");
  const digits = qa<SVGTSpanElement>(req, ".dg");
  const rolls = [0, 1, 2, 3].map((d) => ({ a: q<SVGTextElement>(root, `.roll[data-d="${d}"][data-r="a"]`), b: q<SVGTextElement>(root, `.roll[data-d="${d}"][data-r="b"]`) }));
  const rollY = num(rolls[0].a, "y");
  const status = q<SVGGElement>(root, ".status");
  const okPing = q<SVGCircleElement>(root, ".ok-ping");
  const pk = q<SVGCircleElement>(root, ".pk");
  const pkY0 = Number(pk.dataset.y0), pkY1 = Number(pk.dataset.y1);
  const jobs = qa<SVGGElement>(root, ".job").map((g) => ({
    g,
    pend: q(g, ".st-pend"),
    proc: q(g, ".st-proc"),
    arc: q(g, ".arc"),
    done: q(g, ".st-done"),
    id: q<SVGTextElement>(g, ".jid"),
    file: q<SVGTextElement>(g, ".jf"),
    st: q<SVGTextElement>(g, ".js:not(.js2)"),
    st2: q<SVGTextElement>(g, ".js2"),
    y0: g.transform.baseVal.consolidate()!.matrix.f,
  }));
  const rowTop = jobs[0].y0;
  const ROW = jobs[1].y0 - jobs[0].y0;
  const stY = num(jobs[0].st, "y");

  // ---- printer ----
  const ledOn = q<SVGCircleElement>(root, ".led-on");
  const paper = q<SVGGElement>(root, ".paper-g");
  const feed = Number(paper.dataset.feed);
  const lab = q<SVGGElement>(root, ".lab");
  const lsku = q<SVGTextElement>(lab, ".lsku");
  const bars = q<SVGPathElement>(lab, ".bars");
  const hri = qa<SVGTSpanElement>(lab, ".hri tspan");
  const scanLine = q<SVGLineElement>(lab, ".scan");
  const scanBand = q<SVGRectElement>(lab, ".scan-band");
  const scanBars = q<SVGPathElement>(lab, ".scan-bars");
  const dims = q<SVGGElement>(root, ".dims");
  const dimL = q<SVGPathElement>(dims, ".dim-l");
  const dimT = q<SVGTextElement>(dims, ".dim");

  // ---- manual vs automated ----
  const mSegs = qa<SVGLineElement>(root, ".seg-m");
  const mTexts = qa<SVGTextElement>(root, ".r1 > .seg-t");
  const aGroups = qa<SVGGElement>(root, ".aseg").map((g) => ({
    line: q<SVGLineElement>(g, ".seg-a"),
    mName: q<SVGTextElement>(g, ".m-name"),
    aName: q<SVGTextElement>(g, ".a-name"),
  }));
  const saved = q<SVGGElement>(root, ".saved");
  const pct = q<SVGTextElement>(saved, ".pct");
  const savedLine = q<SVGLineElement>(saved, ".sv");
  const sv2 = num(savedLine, "x2");
  const cut = q<SVGTextElement>(root, ".cut");
  const bandLabels = qa<SVGTextElement>(root, ".band .bl, .band .bl-r:not(.cut)");
  const curM = q<SVGRectElement>(root, ".cur-m");
  const curA = q<SVGRectElement>(root, ".cur-a");
  const done = qa<SVGLineElement>(root, ".seg-e"); // by hand: the part of each step already worked through
  const made = qa<SVGLineElement>(root, ".seg-v"); // automated: the part of each stage the service has done

  // Segment layout for widths ws (fractions of W), with a gap after each.
  const lay = [0, 1, 2, 3].map(() => ({ x0: 0, x1: 0, cx: 0 }));
  const layout = (ws: number[]) => {
    let x = 0;
    for (let i = 0; i < ws.length; i++) {
      const l = ws[i] * G.W;
      const g = Math.min(G.gap, l);
      lay[i].x0 = x;
      lay[i].x1 = x + l - g;
      lay[i].cx = x + (l - g) / 2;
      x += l;
    }
    return lay;
  };
  const man = layout(G.mSeg).map((s) => ({ ...s }));
  const ws = [0, 0, 0, 0];

  // ---- measured once the fonts are in, and again when the plate changes size ----
  let boxes: Box[] = []; // each price's own box on its card, scrape block coordinates
  let cells: { x: number; y: number }[] = []; // the middle of each row's price, table block coordinates
  let chars: number[] = []; // where each character of the request ends
  let digX: number[] = []; // where each of the SKU's four digits starts
  // The road each price takes from its card to its row, in the plate's own
  // coordinates: the blocks are re-stacked on phones, so it is read off the page.
  let paths: { ax: number; ay: number; bx: number; by: number; s: number; wire: string }[] = [];
  const blockOf = (el: Element) => el.closest(".blk") as SVGGElement;
  const road = (i: number, e: number, out: { x: number; y: number }) => {
    const p = paths[i];
    out.x = lerp(p.ax, p.bx, e);
    out.y = lerp(p.ay, p.by, e) - Math.sin(Math.PI * e) * 26 * p.s;
    return out;
  };
  const at = { x: 0, y: 0 };
  // A run of straight lines through the points given (x, y, x, y, ...), its corners rounded to radius r.
  const ortho = (p: number[], r: number) => {
    let d = `M${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    for (let k = 2; k < p.length; k += 2) {
      const x = p[k], y = p[k + 1], last = k + 2 >= p.length;
      const inX = x - p[k - 2], inY = y - p[k - 1], inL = Math.hypot(inX, inY) || 1;
      if (last) {
        d += `L${x.toFixed(1)} ${y.toFixed(1)}`;
        break;
      }
      const outX = p[k + 2] - x, outY = p[k + 3] - y, outL = Math.hypot(outX, outY) || 1;
      const c = Math.min(r, inL / 2, outL / 2);
      d += `L${(x - (inX / inL) * c).toFixed(1)} ${(y - (inY / inL) * c).toFixed(1)}Q${x.toFixed(1)} ${y.toFixed(1)} ${(x + (outX / outL) * c).toFixed(1)} ${(y + (outY / outL) * c).toFixed(1)}`;
    }
    return d;
  };
  function measure() {
    boxes = prices.map((p, i) => {
      const b = p.getBBox();
      // The price in flight is this same text in the same box, so it lifts off and sets down in register.
      put(flies[i].t, "y", (num(p, "y") - (b.y + b.height / 2)).toFixed(2));
      return { x: b.x - 3, y: b.y - 3, w: b.width + 6, h: b.height + 6 };
    });
    cells = rows.map((r) => {
      const b = r.pr.getBBox();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    flies.forEach((f, i) => {
      put(f.r, "x", (-boxes[i].w / 2).toFixed(2));
      put(f.r, "width", boxes[i].w.toFixed(2));
      put(f.r, "y", (-boxes[i].h / 2).toFixed(2));
      put(f.r, "height", boxes[i].h.toFixed(2));
    });
    try {
      const n = req.getNumberOfChars();
      chars = Array.from({ length: n }, (_, i) => req.getEndPositionOfChar(i).x);
      // The digits are the four characters before the closing quote and brace.
      digX = [0, 1, 2, 3].map((d) => req.getStartPositionOfChar(n - 6 + d).x);
    } catch {
      chars = [];
    }
    const inv = svg.getScreenCTM()?.inverse();
    const cA = blockOf(cards[0]).getScreenCTM(), cB = blockOf(rows[0].g).getScreenCTM();
    if (!inv || !cA || !cB) return;
    const mA = inv.multiply(cA), mB = inv.multiply(cB);
    const pt = (m: DOMMatrix, x: number, y: number) => new DOMPoint(x, y).matrixTransform(m);
    paths = cards.map((_, i) => {
      const a = pt(mA, boxes[i].x + boxes[i].w / 2, boxes[i].y + boxes[i].h / 2);
      const b = pt(mB, cells[i].x, cells[i].y);
      // The wire drawn under the pointer, from a card's price to its row. It is routed like a wire on a
      // schematic so that it crosses nothing: down into the gap under the cards, along it and out of the
      // page, then along the gutter between the blocks (beside them on a wide plate, down the margin on a
      // phone) to the row.
      const card = q<SVGRectElement>(cards[i], ".card-r"), bg = q<SVGRectElement>(rows[i].g, ".row-bg");
      const p0 = pt(mA, boxes[i].x + boxes[i].w / 2, boxes[i].y + boxes[i].h);
      const gap = pt(mA, 0, num(card, "y") + num(card, "height") + 3.2).y;
      const end = pt(mB, num(bg, "x") + 1, num(bg, "y") + num(bg, "height") / 2);
      const beside = end.x > p0.x;
      const gutter = beside ? (pt(mA, G.bw, 0).x + end.x) / 2 : pt(mA, -9, 0).x;
      return { ax: a.x, ay: a.y, bx: b.x, by: b.y, s: mA.a, wire: ortho([p0.x, p0.y, p0.x, gap, gutter, gap, gutter, end.y, end.x, end.y], 3.5 * mA.a) };
    });
    hover.drawn = -2; // the lines under the pointer are cut again from the new roads
  }

  // ---- state ----
  // Each block has its own clock. On a wide plate they all follow one
  // timeline; on phones the blocks are stacked, so each follows its own place.
  const K = { scrape: 0, table: 0, label: 0, band: 0 };
  // The scrapers reading prices again, once table and plot are complete.
  const poll = { env: 0, clock: 0 };
  const order = (() => {
    // Which price is read next: spread evenly, never the same one twice running, and long before it repeats.
    const out: number[] = [];
    for (let e = 0; out.length < 89; e++) {
      const i = Math.floor(6 * frac(e * GOLD + 0.31));
      if (i !== out[out.length - 1]) out.push(i);
    }
    return out;
  })();
  // The print service. In the story it is read off the label clock; live, off its own cycle:
  // the n-th job after the story's is in service, tau seconds in. J0 counts the labels the
  // service has finished, so that when the story is told again it is told about the next one.
  const live = { mode: "story" as "story" | "live" | "rewind", n: 1, tau: 0 };
  let J0 = 0;
  let hold = 0; // the label story's own clock; it trails the scroll only while it catches up after a rewind
  let chasing = false;
  const S = { typed: 0, caret: 0, sku: 0, req: 0, ok: 0, ping: 0, pk: -1, base: 0, led: 0, seq: 0, g: 0, take: 0, dims: 0, dimO: 1 };
  // What is on show of the things that change by steps: each job's state (0 pending, 1 processing,
  // 2 completed) and the number in the request. They close on what the clocks say at their own pace.
  const shown = { state: new Map<number, number>(), sku: -1, req: -1, step: 0, moving: false };
  // The bars keep time once they are drawn: by hand, and automated.
  const race = { env: 0, clock: 0 };
  let spin = 0;
  const hover = { i: -1, shown: -1, draw: 0, drawn: -2 };
  const scan = { on: false, pinned: false, x: 0, sx: 0, v: 0, env: 0, sym: -1, text: "" };
  let label = encode(skuOf(0));
  let labelSeq = 0;

  // ================================================================ top: scrape, table, plot
  const flyE = [0, 0, 0, 0, 0, 0], flyO = [0, 0, 0, 0, 0, 0], flash = [0, 0, 0, 0, 0, 0];
  const selOn = [0, 0, 0], selA = [0, 0, 0], selB = [0, 0, 0], selM = [0, 0, 0], selPad = [0, 0, 0];

  function drawTop() {
    if (!boxes.length || !paths.length) return;
    const t = K.scrape;

    // The catalog pages load: a bar runs under the address, and the cards come up.
    for (let w = 0; w < 3; w++) {
      const u = phase(t, LOAD[w], LOAD[w] + 0.45);
      put(loads[w], "stroke-dashoffset", (1 - u).toFixed(3));
      op(loads[w], Math.min(u * 8, 1 - phase(t, LOAD[w] + 0.45, LOAD[w] + 0.72)));
      for (let j = 0; j < 2; j++) {
        const i = w * 2 + j;
        const u = phase(t, LOAD[w] + 0.3 + j * 0.12, LOAD[w] + 0.82 + j * 0.12);
        op(cards[i], u);
        tr(cards[i], 0, (1 - arrive(u)) * 6);
        put(cards[i], "class", hover.i === i ? "card hl" : "card");
      }
    }

    // A selector per page: it closes on the first price, crosses to the second, and lets go.
    for (let w = 0; w < 3; w++) {
      const a = xAt(w * 2), b = xAt(w * 2 + 1);
      selOn[w] = Math.min(phase(t, a - 0.34, a - 0.1), 1 - phase(t, b + 0.16, b + 0.4));
      selA[w] = w * 2;
      selB[w] = w * 2 + 1;
      selM[w] = swap(phase(t, a + 0.1, b - 0.06));
      selPad[w] = (1 - arrive(phase(t, a - 0.34, a - 0.04))) * 5;
    }

    // Each price lifts off its card, and its row resolves as it comes in.
    let n = 0;
    for (let i = 0; i < 6; i++) {
      const x = xAt(i), land = x + FLY;
      flyE[i] = swap(phase(t, x, land));
      flyO[i] = Math.min(phase(t, x - 0.03, x + 0.07), 1 - phase(t, land, land + 0.22));
      flash[i] = phase(t, land - 0.06, land) * (1 - phase(t, land, land + 0.55));
      const r = rows[i];
      const u = phase(t, land - 0.34, land + 0.08), dx = (1 - arrive(u)) * -6;
      op(r.sku, u);
      tr(r.sku, dx, 0);
      op(r.nm, u);
      tr(r.nm, dx, 0);
      op(r.pr, phase(t, land - 0.02, land + 0.2));
      put(r.g, "class", hover.i === i ? "row hl" : "row");
      if (t >= land) n++;
    }
    put(rowsN, "text", `${n} ${n === 1 ? "row" : "rows"}`);

    // The dot plot: axes first, then each price comes down from its row to its place.
    const tp = K.table;
    const td = Math.min(K.table, K.scrape); // on phones a dot never leaves before its row has landed
    for (let p = 0; p < tracks.length; p++) put(tracks[p], "stroke-dashoffset", ((1 - phase(tp, PLOT, PLOT + 0.5)) * trackLen[p]).toFixed(2));
    for (const f of frame) op(f.el, phase(tp, PLOT + 0.12 + f.d, PLOT + 0.5 + f.d));
    let fresh = -1; // the price a scraper is reading again
    for (const d of dots) {
      const from = landAt(d.i) + 0.05;
      const u = phase(td, from, from + DROP);
      const e = swap(u), c = cells[d.i];
      tr(d.c, (c.x - d.x) * (1 - e), (c.y - d.y) * (1 - e));
      op(d.c, phase(td, from, from + 0.2));
      put(d.c, "class", `pdot${u > 0 && u < 1 ? " fresh" : ""}${hover.i === d.i ? " hl" : ""}`);
    }
    for (let p = 0; p < ranges.length; p++) {
      const u = phase(td, rangeAt[p], rangeAt[p] + 0.3);
      put(ranges[p], "stroke-dashoffset", ((1 - u) * rangeLen[p]).toFixed(2));
      op(ranges[p], u > 0 ? 1 : 0);
      const m = phase(td, rangeAt[p] + 0.15, rangeAt[p] + 0.5);
      op(qtm[p], m);
      tr(qtm[p], 0, (1 - arrive(m)) * -4);
    }

    // After the story, a scraper reads one price again: the same road, at its own pace.
    let dropO = 0, pingW = 0;
    if (poll.env > 0) {
      const P = 3.8;
      const ev = Math.floor(poll.clock / P);
      const s = poll.clock - ev * P - (0.5 + frac((ev + 1) * 0.7548776662));
      const i = order[ev % order.length], w = i >> 1;
      if (s > 0 && s < 2.7) {
        fresh = i;
        selOn[w] = poll.env * Math.min(phase(s, 0, 0.25), 1 - phase(s, 0.8, 1.05));
        selA[w] = selB[w] = i;
        selM[w] = 0;
        selPad[w] = (1 - arrive(phase(s, 0, 0.32))) * 5;
        flyE[i] = swap(phase(s, 0.45, 1.4));
        flyO[i] = poll.env * Math.min(phase(s, 0.42, 0.5), 1 - phase(s, 1.4, 1.65));
        flash[i] = poll.env * phase(s, 1.34, 1.42) * (1 - phase(s, 1.42, 2.15));
        const d = dotOf[i], c = cells[i];
        const e = swap(phase(s, 1.45, 1.95));
        put(drop, "cx", lerp(c.x, d.x, e).toFixed(2));
        put(drop, "cy", lerp(c.y, d.y, e).toFixed(2));
        dropO = poll.env * Math.min(phase(s, 1.45, 1.53), 1 - phase(s, 1.9, 1.98));
        pingW = phase(s, 1.92, 2.7);
        const ring = pings[d.p];
        put(ring, "cx", d.x.toFixed(2));
        put(ring, "r", (2.9 + 7 * arrive(pingW)).toFixed(2));
        op(ring, pingW > 0 && pingW < 1 ? poll.env * 0.8 * (1 - pingW) : 0);
        op(pings[1 - d.p], 0);
      }
    }
    op(drop, dropO);
    if (fresh < 0) for (const p of pings) op(p, 0);

    for (let w = 0; w < 3; w++) {
      const s = sels[w];
      op(s.g, selOn[w]);
      if (selOn[w] <= 0) continue;
      const a = boxes[selA[w]], b = boxes[selB[w]], m = selM[w], pad = selPad[w];
      const x = lerp(a.x, b.x, m) - pad, y = lerp(a.y, b.y, m) - pad;
      put(s.box, "transform", `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${(lerp(a.w, b.w, m) + 2 * pad).toFixed(2)} ${(lerp(a.h, b.h, m) + 2 * pad).toFixed(2)})`);
      tr(s.tag, x, y);
    }
    for (let i = 0; i < 6; i++) {
      const f = flies[i];
      op(f.g, flyO[i]);
      op(rows[i].fl, flash[i]);
      if (flyO[i] <= 0) continue;
      road(i, flyE[i], at);
      put(f.g, "transform", `translate(${at.x.toFixed(2)} ${at.y.toFixed(2)}) scale(${paths[i].s.toFixed(3)})`);
    }

    // Under the pointer: a wire is drawn from this price's card to its row, and its dot is ringed.
    if (hover.shown >= 0 && hover.drawn !== hover.shown) {
      hover.drawn = hover.shown;
      put(trace, "d", paths[hover.shown].wire);
      put(halo, "cx", dotOf[hover.shown].x.toFixed(2));
      put(halo, "cy", dotOf[hover.shown].y.toFixed(2));
    }
    const h0 = arrive(hover.draw);
    put(trace, "stroke-dashoffset", (1 - h0).toFixed(3));
    op(trace, hover.draw > 0 ? 1 : 0);
    put(halo, "r", (2.9 + 3.6 * h0).toFixed(2));
    op(halo, phase(hover.draw, 0.35, 1));
  }

  // ================================================================ the label service
  // Where job `a` (counted from the first the figure ever printed) is in its life: 0 pending, 1 processing, 2 completed.
  function jobState(a: number, t: number) {
    if (live.mode === "story") {
      const k = a - J0;
      if (k < 0) return 2;
      if (jobIn(a) < 1) return 0; // (not before it is in the queue, however fast the page is going)
      if (k === 0) return (t >= P0 ? 1 : 0) + (t >= FEED[1] ? 1 : 0);
      if (k === 1) return t >= FEED[1] + 0.05 ? 1 : 0;
      return 0;
    }
    const c = J0 + live.n, L = cycleOf(live.n, c);
    if (a < c) return 2;
    if (a === c) return live.tau >= L - 0.36 ? 2 : 1;
    if (a === c + 1) return live.tau >= L - 0.26 ? 1 : 0;
    return 0;
  }
  // The same, as the scroll alone would have it: where a page going fast pulls a job's change of state along to.
  function jobPull(a: number, t: number) {
    if (live.mode !== "story" || jobIn(a) < 1) return 0;
    const k = a - J0;
    if (k === 0) return phase(t, P0, P0 + 0.15) + phase(t, FEED[1], FEED[1] + 0.22);
    if (k === 1) return phase(t, FEED[1] + 0.05, FEED[1] + 0.25);
    return 0;
  }
  // How far job `a` has come into the queue (0 not yet, 1 in its row).
  function jobIn(a: number) {
    if (live.mode !== "story") return a <= J0 + live.n + 3 ? 1 : 0;
    const k = a - J0, cur = Math.min(3, Math.floor(shown.req));
    return k < cur ? 1 : k > cur ? 0 : phase(shown.req - cur, 0.7, 1); // (it comes in as the packet reaches the queue)
  }

  function readService() {
    const t = hold;
    if (live.mode === "story") {
      S.typed = phase(t, TYPE[0], TYPE[1]);
      S.caret = Math.min(phase(t, TYPE[0] - 0.06, TYPE[0]), 1 - phase(t, TYPE[1] + 0.05, TYPE[1] + 0.22));
      // The four requests are events: the clock says how many have been made, and each plays its chain through
      // in turn (the number turns over, 200, the job goes down the wire and into the queue). A page going fast
      // pulls the chain along with it, so nothing falls behind the label that is printing; a page going slowly,
      // or stopped, leaves it to finish at its own pace; a page going back plays it backwards.
      S.req = 0;
      let pull = 0;
      for (let k = 0; k < 4; k++) {
        const from = k ? ARR[k] - 0.22 : ARR[0];
        if (t < from) break;
        S.req = k + 1;
        pull = k + (k ? phase(t, from, from + 0.44) : R0 + (1 - R0) * phase(t, from, from + 0.42));
      }
      if (shown.req < 0) shown.req = S.req;
      else if (shown.req < S.req) shown.req = Math.min(S.req, Math.max(pull, shown.req + shown.step * 1.7));
      else if (shown.req > S.req) {
        shown.req = Math.max(S.req, shown.req - shown.step * Math.max(3, 6 * (shown.req - S.req)));
        if (S.req === 0 && shown.req <= R0) shown.req = 0; // (the first request was typed: there is no number to turn back)
      }
      shown.moving = shown.moving || shown.req !== S.req;
      const cur = Math.min(3, Math.floor(shown.req)), u = shown.req - cur;
      S.sku = J0 + (cur ? cur - 1 + phase(u, 0, R0) : 0);
      const w = phase(u, R0, 0.9), p = phase(u, R0 + 0.03, 0.74);
      S.ping = w > 0 && w < 1 ? w : 0;
      S.pk = p > 0 && p < 1 ? p : -1;
      S.ok = cur ? 1 : phase(u, R0, R0 + 0.35);
      S.base = J0;
      S.led = Math.min(phase(t, P0 + 0.12, P0 + 0.26), 1 - phase(t, FEED[1], FEED[1] + 0.2));
      S.seq = J0;
      S.g = feedPos(phase(t, FEED[0], FEED[1]));
      S.take = 0;
      S.dims = phase(t, FEED[1] - 0.15, FEED[1] + 0.2);
      S.dimO = 1;
      return;
    }
    const c = J0 + live.n, tau = live.tau;
    const W = waitOf(live.n, c), L = W + TAKE + PRINT_S;
    shown.req = 4;
    S.typed = 1;
    S.caret = 0;
    // A request for the label after the three already waiting.
    const A = startOf(live.n);
    S.sku = tau >= A + 0.05 ? c + 3 : c + 2;
    S.ok = 1;
    const post = A + SKU_S;
    const w = phase(tau, post, post + 0.55);
    S.ping = w > 0 && w < 1 ? w : 0;
    const p = phase(tau, post + 0.08, post + 0.52);
    S.pk = p > 0 && p < 1 ? p : -1;
    // The list moves up one: the finished job leaves at the top as the new one comes in at the foot.
    S.base = c - 1 + swap(phase(tau, post + 0.46, post + POST_S - 0.06));
    S.led = Math.min(phase(tau, W + 0.25, W + 0.45), 1 - phase(tau, L - 0.3, L - 0.08));
    if (tau < W + TAKE) {
      S.seq = c - 1;
      S.g = 1;
      S.take = phase(tau, W, W + TAKE);
    } else {
      S.seq = c;
      S.g = feedPos((tau - W - TAKE) / PRINT_S);
      S.take = 0;
    }
    S.dims = 1;
    S.dimO = tau < W + TAKE ? 1 - phase(S.take, 0, 0.6) : phase(S.g, 0.86, 1);
  }

  function drawLabel() {
    shown.moving = false;
    readService();
    const t = hold;

    // The request: typed a character at a time, and after that only its number changes.
    const nc = Math.round(S.typed * chars.length);
    const tw = nc && chars.length ? chars[nc - 1] : num(req, "x");
    put(rqClip, "width", (S.typed >= 1 || !chars.length ? rqW : tw + 1.5).toFixed(1));
    op(rqCaret, S.caret);
    put(rqCaret, "x", (tw + 1).toFixed(2));
    if (shown.sku < 0 || live.mode === "story") shown.sku = S.sku;
    else if (shown.sku !== S.sku) {
      // (One number takes half a second; a long way, after a fast scroll, is counted through quickly.)
      shown.sku = toward(shown.sku, S.sku, shown.step * Math.max(2, Math.abs(S.sku - shown.sku) * 5));
      shown.moving = true;
    }
    const skuLo = Math.floor(shown.sku), skuP = shown.sku - skuLo;
    const a = String((G.seq + skuLo) % 10000).padStart(4, "0"), b = String((G.seq + skuLo + 1) % 10000).padStart(4, "0");
    for (let d = 0; d < 4; d++) {
      const r = rolls[d];
      // Like an odometer: only the digits that change turn, the ones first.
      const e = skuP > 0 && a[d] !== b[d] && digX.length ? swap(phase(skuP, (3 - d) * 0.14, (3 - d) * 0.14 + 0.58)) : 0;
      put(digits[d], "text", e >= 1 ? b[d] : a[d]);
      put(digits[d], "fill-opacity", e > 0 && e < 1 ? "0" : "1");
      if (e > 0 && e < 1) {
        put(r.a, "text", a[d]);
        put(r.b, "text", b[d]);
        put(r.a, "x", digX[d].toFixed(2));
        put(r.b, "x", digX[d].toFixed(2));
        put(r.a, "y", (rollY - 13 * e).toFixed(2));
        put(r.b, "y", (rollY + 13 * (1 - e)).toFixed(2));
        op(r.a, 1);
        op(r.b, 1);
      } else {
        op(r.a, 0);
        op(r.b, 0);
      }
    }

    // Answered: 200, and a ring off the light each time; the job goes down the wire to the queue.
    op(status, S.ok);
    put(okPing, "r", (2.6 + 6.5 * arrive(S.ping)).toFixed(2));
    op(okPing, S.ping > 0 ? 0.8 * (1 - S.ping) : 0);
    if (S.pk >= 0) put(pk, "cy", lerp(pkY0, pkY1, S.pk).toFixed(2));
    op(pk, S.pk < 0 ? 0 : Math.min(1, S.pk * 6, (1 - S.pk) * 6));

    // The queue: five rows cover the four on show and the one arriving.
    const base = Math.floor(S.base), fr = S.base - base;
    for (let k = 0; k < jobs.length; k++) {
      const r = jobs[k], job = base + k;
      const arr = jobIn(job), want = jobState(job, t);
      let s = shown.state.get(job) ?? want;
      if (s < want) s = Math.min(want, Math.max(jobPull(job, t), s + shown.step / 0.32));
      else if (s > want) s = Math.max(want, s - shown.step / 0.32);
      if (s !== want) shown.moving = true;
      shown.state.set(job, s);
      put(r.g, "transform", `translate(${((1 - arrive(arr)) * 8).toFixed(2)} ${(rowTop + (k - fr) * ROW).toFixed(2)})`);
      op(r.g, k === 0 ? arr * (1 - clamp01(fr * 1.5)) : arr);
      put(r.id, "text", String(G.job + job));
      put(r.file, "text", `${skuOf(job)}.pdf`);
      // The mark: a ring while pending, a turning arc while processing, a tick drawn when done.
      const proc = clamp01(s) - clamp01(s - 1), dn = clamp01(s - 1);
      op(r.pend, 1 - clamp01(s));
      op(r.proc, proc);
      if (proc > 0) put(r.arc, "transform", `rotate(${spin.toFixed(1)} 18 10.5)`);
      op(r.done, dn > 0 ? 1 : 0);
      put(r.done, "stroke-dashoffset", (1 - dn).toFixed(3));
      // The word rolls over to the next state.
      const lo = Math.min(2, Math.floor(s)), e = lo === 2 ? 0 : swap(s - lo);
      put(r.st, "text", STATES[lo]);
      put(r.st, "class", lo === 1 ? "js acc" : "js");
      put(r.st, "y", (stY - 5 * e).toFixed(2));
      op(r.st, 1 - e);
      if (e > 0) {
        put(r.st2, "text", STATES[lo + 1]);
        put(r.st2, "class", lo === 0 ? "js js2 acc" : "js js2");
        put(r.st2, "y", (stY + 5 * (1 - e)).toFixed(2));
      }
      op(r.st2, e);
    }
    if (shown.state.size > 16) for (const job of shown.state.keys()) if (job < base - 2) shown.state.delete(job);

    // The printer: the light, the paper, and what is printed on it.
    op(ledOn, S.led);
    if (S.seq !== labelSeq) {
      labelSeq = S.seq;
      label = encode(skuOf(S.seq));
      put(lsku, "text", label.text);
      put(bars, "d", label.d);
      hri.forEach((el, i) => put(el, "text", label.text[i]));
      scan.sym = -1;
    }
    put(paper, "transform", `translate(0 ${(-feed * (1 - S.g) + 16 * S.take * S.take).toFixed(2)})`);
    op(paper, 1 - phase(S.take, 0.1, 1));
    const dl = phase(S.dims, 0, 0.75);
    op(dims, S.dims > 0 ? S.dimO : 0);
    put(dimL, "stroke-dashoffset", (1 - dl).toFixed(3));
    op(dimT, phase(S.dims, 0.55, 1));

    // Under the pointer the barcode reads out: the symbol there, its bars, and the character they stand for.
    op(scanLine, scan.env);
    op(scanBand, scan.env);
    op(scanBars, scan.env);
    if (scan.env > 0) {
      const m = (scan.sx - G.bar.x0) / G.bar.mod;
      const sym = Math.max(0, Math.min(label.vals.length - 1, Math.floor(m / 11)));
      put(scanLine, "x1", scan.sx.toFixed(2));
      put(scanLine, "x2", scan.sx.toFixed(2));
      if (sym !== scan.sym) {
        scan.sym = sym;
        const v = label.vals[sym], last = label.vals.length - 1;
        put(scanBand, "x", (G.bar.x0 + label.starts[sym] * G.bar.mod - 1).toFixed(2));
        put(scanBand, "width", ((v === 106 ? 13 : 11) * G.bar.mod + 2).toFixed(2));
        put(scanBars, "d", label.parts[sym]);
        hri.forEach((el, i) => put(el, "class", i === sym - 1 && sym < last - 1 ? "on" : ""));
        const what = sym === 0 ? "Start B" : sym === last ? "Stop" : sym === last - 1 ? "check" : label.text[sym - 1];
        scan.text = `Code 128 · ${what} = ${v}`;
      }
    } else if (scan.sym !== -1) {
      scan.sym = -1;
      hri.forEach((el) => put(el, "class", ""));
    }
  }

  // ================================================================ manual vs automated
  let savedPct = 70;
  function drawBand() {
    const t = K.band;
    const named = phase(t, BAND.label, BAND.label + 0.35);
    for (const el of bandLabels) op(el, named);

    // Both rows are drawn together, step for step: it is the same task.
    const c = swap(phase(t, BAND.fold[0], BAND.fold[1]));
    for (let i = 0; i < 4; i++) ws[i] = lerp(G.mSeg[i], G.aSeg[i], c);
    const aut = layout(ws);
    let sum = 0;
    for (let i = 0; i < 4; i++) {
      const u = phase(t, BAND.draw + i * BAND.step, BAND.draw + (i + 1) * BAND.step);
      const name = phase(u, 0.4, 1);
      put(mSegs[i], "x2", lerp(man[i].x0, man[i].x1, u).toFixed(2));
      op(mSegs[i], u > 0 ? 1 : 0);
      op(mTexts[i], name);
      const a = aGroups[i];
      put(a.line, "x1", aut[i].x0.toFixed(2));
      put(a.line, "x2", lerp(aut[i].x0, aut[i].x1, u).toFixed(2));
      op(a.line, u > 0 && aut[i].x1 - aut[i].x0 > 0.2 ? 1 : 0);
      // Then the automated row folds: each step shrinks to what it costs now, and one goes altogether.
      put(a.mName, "x", aut[i].cx.toFixed(2));
      put(a.aName, "x", aut[i].cx.toFixed(2));
      op(a.mName, name * (1 - phase(c, 0.04, 0.34)));
      op(a.aName, phase(c, 0.72, 1));
      sum += ws[i];
    }
    // The numbers are read off the bar: what is left of the manual time, and what was cut.
    const end = aut[3].x1, left = Math.round(sum * 100);
    savedPct = 100 - left;
    // (It comes up with the first few percent, so it is never seen reading zero.)
    put(cut, "text", `−${savedPct}%`);
    op(cut, phase(c, 0.05, 0.2));
    const room = phase(c, 0.5, 0.8);
    op(saved, room);
    put(pct, "x", (end + 8).toFixed(2));
    put(pct, "text", `${left}%`);
    put(savedLine, "x1", Math.min(sv2, end + 42).toFixed(2));

    // Once drawn, the bars keep time. By hand the task is always under way; automated, the
    // cursor is wherever the service is: taking the SKU, posting it, printing.
    const um = frac(race.clock / MANUAL_S), xm = um * G.W;
    const outM = race.env * Math.min(1, (1 - um) * 30);
    put(curM, "transform", `translate(${xm.toFixed(2)} 0)`);
    op(curM, Math.min(outM, um * 30));
    for (let i = 0; i < 4; i++) {
      put(done[i], "x1", man[i].x0.toFixed(2));
      put(done[i], "x2", Math.max(man[i].x0, Math.min(man[i].x1, xm)).toFixed(2));
      op(done[i], xm > man[i].x0 + 0.3 ? outM : 0);
    }
    let ua = -1, dim = 1, lit = 0;
    if (live.mode === "live" && race.env > 0) {
      const job = J0 + live.n, tau = live.tau, W = waitOf(live.n, job), L = W + TAKE + PRINT_S, A = startOf(live.n);
      if (tau >= A) {
        if (tau < A + SKU_S) ua = ((tau - A) / SKU_S) * 7;
        else if (tau < A + SKU_S + POST_S) ua = 7 + ((tau - A - SKU_S) / POST_S) * 8;
        else if (tau < W + TAKE) ua = 15;
        else ua = 15 + ((tau - W - TAKE) / PRINT_S) * 15;
        // Waiting on the printer, it rests where the next stage begins.
        dim = 1 - 0.55 * Math.min(phase(tau, A + SKU_S + POST_S, A + SKU_S + POST_S + 0.2), 1 - phase(tau, W + TAKE - 0.2, W + TAKE));
        dim *= Math.min(phase(tau, A, A + 0.18), 1 - phase(tau, L - 0.28, L - 0.06));
        lit = race.env * (1 - phase(tau, L - 0.28, L - 0.06));
      }
    }
    const xa = (Math.max(0, ua) / 100) * G.W;
    if (ua >= 0) put(curA, "transform", `translate(${xa.toFixed(2)} 0)`);
    op(curA, ua < 0 ? 0 : race.env * dim);
    for (let i = 0; i < 4; i++) {
      put(made[i], "x1", aut[i].x0.toFixed(2));
      put(made[i], "x2", Math.max(aut[i].x0, Math.min(aut[i].x1, xa)).toFixed(2));
      op(made[i], xa > aut[i].x0 + 0.3 ? lit : 0);
    }
  }

  // ================================================================ readout
  function drawReadout() {
    if (!readout) return;
    let s: string;
    if (scan.env > 0.5 && scan.text) s = scan.text;
    else if (K.band >= BAND.fold[1] - 0.01) s = "−70% time";
    else if (K.band >= BAND.fold[0] && savedPct >= 1) s = `−${savedPct}% time`;
    else if (K.band >= BAND.label) s = "timing";
    else if (hold >= FEED[0]) {
      // How much of the label has come past the slot, off the paper's own position.
      const out = Math.max(0, Math.min(G.lab.h, G.lab.h + G.lab.off - feed * (1 - S.g)));
      s = `printing ${(out / G.inch).toFixed(1)} / ${G.lab.h / G.inch} in`;
    }
    else if (hold >= ARR[0]) s = "POST 200";
    else {
      let n = 0;
      for (let i = 0; i < 6; i++) if (K.scrape >= landAt(i)) n++;
      s = `scraped ${n} / 6`;
    }
    if (readout.textContent !== s) readout.textContent = s;
  }

  function render() {
    drawTop();
    drawLabel();
    drawBand();
    drawReadout();
  }

  // ================================================================ clocks
  const sync = () => {
    if (live.mode === "story" && !chasing) hold = K.label;
    render();
  };
  const mm = gsap.matchMedia();
  mm.add("(min-width: 561px)", () => {
    // The plate is drawn in while its top goes from 97% to 64% of the window, and the pages load over the
    // same stretch; the first price is read once the panel is there. It ends as the plate's middle reaches
    // the middle of the window, so a plate at rest there is finished.
    const tl = scrubbed(root, { start: "top 85%", end: "center 50%" });
    const clock = { t: 0 };
    tl.to(clock, { t: T, duration: T, ease: "none" });
    tl.eventCallback("onUpdate", () => {
      K.scrape = K.table = K.label = K.band = clock.t;
      sync();
    });
  });
  mm.add("(max-width: 560px)", () => {
    // Stacked, each block plays the part of the story that is its own as it crosses the window. The request,
    // the queue and the printer are one chain of cause, so they share a clock from the first to the last.
    const bind = (key: keyof typeof K, range: [number, number], vars: Vars) => {
      const clock = { t: range[0] };
      const tl = scrubbed(vars.trigger as Element, vars);
      tl.fromTo(clock, { t: range[0] }, { t: range[1], duration: 1, ease: "none" });
      tl.eventCallback("onUpdate", () => {
        K[key] = clock.t;
        sync();
      });
    };
    const blk = (name: string) => q<SVGGElement>(root, `.${name}`);
    bind("scrape", [0, TOP_END + 0.05], { trigger: blk("b-scrape"), start: "top 84%", end: "bottom 48%" });
    bind("table", [2.1, TOP_END + 0.05], { trigger: blk("b-table"), start: "top 88%", end: "bottom 46%" });
    bind("label", [4.6, Q_END + 0.05], { trigger: blk("b-queue"), start: "top 86%", endTrigger: blk("b-print"), end: "bottom 58%" });
    // (The bars wait for the label: they fold only once it is out, as they do on a wide plate.)
    bind("band", [BAND.label - 0.05, T], { trigger: blk("band"), start: "top 82%", end: "bottom 60%" });
  });

  // (A plate that is not being drawn, in a hidden tab or a print, cannot be measured: the last measure stands.)
  const remeasure = () => {
    try {
      measure();
    } catch {
      /* not laid out */
    }
    render();
  };
  remeasure();
  document.fonts?.ready.then(remeasure);
  new ResizeObserver(remeasure).observe(svg);

  // ================================================================ the work that goes on
  whileVisible(root, (dt) => {
    spin = (spin + dt * 300) % 360;

    // The scrapers go on reading once the table and the plot are whole.
    const polling = K.scrape >= TOP_END && K.table >= TOP_END;
    poll.env = toward(poll.env, polling ? 1 : 0, dt / 0.25);
    if (polling) poll.clock += dt;
    else if (poll.env === 0) poll.clock = 0;

    // The print service.
    if (live.mode === "story") {
      if (chasing) {
        // (Quick while it is far behind the page, easing as it closes: it comes to rest with it, not into it.)
        hold = toward(hold, K.label, dt * Math.max(2, 9 * Math.abs(K.label - hold)));
        chasing = hold !== K.label;
      }
      if (!chasing && hold >= Q_END) {
        live.mode = "live";
        live.n = 1;
        live.tau = 0;
      }
    } else if (live.mode === "live") {
      if (K.label < Q_END) live.mode = "rewind";
      else {
        live.tau += dt;
        for (let L = cycleOf(live.n, J0 + live.n); live.tau >= L; L = cycleOf(live.n, J0 + live.n)) {
          live.tau -= L;
          live.n++;
        }
      }
    } else if (K.label >= Q_END) live.mode = "live";
    else {
      // Scrolled back: the cycle under way is wound back to its start, which is exactly where the
      // story leaves off, only some labels later. The story is then told about that label.
      live.tau -= dt * Math.max(12, live.tau * 14);
      if (live.tau <= 0) {
        J0 += live.n - 1;
        live.mode = "story";
        live.n = 1;
        live.tau = 0;
        hold = Q_END;
        chasing = true;
      }
    }

    // The bars keep time while they are whole and the service is running: both set off with its first request.
    const racing = K.band >= BAND.end && live.mode === "live" && (live.n > 1 || live.tau >= A1);
    race.env = toward(race.env, racing ? 1 : 0, dt / 0.3);
    if (racing) race.clock += dt;
    else if (race.env === 0) race.clock = 0;

    // The pointer's marks ease in and out; the scan line follows the hand without a step.
    const hv = hover.i >= 0 ? 1 : 0;
    if (hover.i >= 0 && hover.shown !== hover.i) {
      if (hover.draw > 0 && hover.shown >= 0) hover.draw = toward(hover.draw, 0, dt / 0.1);
      if (hover.draw === 0 || hover.shown < 0) hover.shown = hover.i;
    } else hover.draw = toward(hover.draw, hv, dt / (hv ? 0.45 : 0.18));
    scan.env = toward(scan.env, scan.on && S.take === 0 && S.g >= 0.5 ? 1 : 0, dt / 0.14);
    {
      // A critically damped spring: it closes on the pointer as fast as it can without passing it.
      const w = 42, d = scan.sx - scan.x, k = (scan.v + w * d) * dt, e = Math.exp(-w * dt);
      scan.sx = scan.x + (d + k) * e;
      scan.v = (scan.v - w * k) * e;
    }
    // Nothing above is under way before the first job is picked up (from then on an arc is always turning).
    if (hold >= P0 || live.mode !== "story" || shown.moving || poll.env > 0 || race.env > 0 || hover.i >= 0 || hover.draw > 0 || scan.on || scan.env > 0) {
      shown.step = dt;
      render();
      shown.step = 0;
    }
  });

  // ================================================================ pointer
  // A page scrolling under a still pointer is not the pointer asking: a mouse counts only once the page is at rest.
  let scrolledAt = -1e9;
  window.addEventListener("scroll", () => (scrolledAt = performance.now()), { passive: true });
  const asking = (e: Event) => (e as PointerEvent).pointerType === "mouse" && performance.now() - scrolledAt > 140;

  // A price is one thing in three places: its card, its row, its dot. Any of them lights the other two,
  // and a wire is drawn from the card to the row.
  const setHover = (i: number) => {
    if (hover.i === i) return;
    hover.i = i;
    render();
  };
  const linked: [SVGElement, number][] = [
    ...cards.map((c, i) => [c, i] as [SVGElement, number]),
    ...rows.map((r, i) => [r.g, i] as [SVGElement, number]),
    ...dots.map((d) => [d.c, d.i] as [SVGElement, number]),
  ];
  for (const [el, i] of linked) {
    // (Only a price that has arrived can be asked about.)
    const there = () => Number(rows[i].pr.style.opacity || 1) > 0.5;
    const over = (e: Event) => {
      if (asking(e) && there()) setHover(i);
    };
    el.addEventListener("pointerenter", over);
    el.addEventListener("pointermove", over);
    el.addEventListener("pointerleave", (e) => {
      if ((e as PointerEvent).pointerType === "mouse") setHover(-1);
    });
    // By touch a tap holds it, and a second tap lets go. (A click is a tap: a finger scrolling the page is not one.)
    el.addEventListener("click", (e) => {
      if ((e as PointerEvent).pointerType !== "mouse" && there()) setHover(hover.i === i ? -1 : i);
    });
  }

  // The label reads like a scanner's: move across it and each Code 128 symbol gives its value.
  const scanAt = (e: PointerEvent) => {
    const m = lab.getScreenCTM();
    if (!m) return;
    const x = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()).x;
    scan.x = Math.max(G.bar.x0, Math.min(G.bar.x0 + (label.starts[label.starts.length - 1] + 13) * G.bar.mod, x));
    if (!scan.on && scan.env === 0) {
      scan.sx = scan.x;
      scan.v = 0;
    }
    scan.on = true;
  };
  let finger: { id: number; x: number; y: number; drag: boolean } | null = null;
  const across = (e: PointerEvent) => {
    if (e.pointerType === "mouse") {
      if (asking(e)) scanAt(e);
    } else if (finger && e.pointerId === finger.id) {
      // A finger drawn across the label moves the line; one moving up or down is scrolling the page.
      const dx = e.clientX - finger.x, dy = e.clientY - finger.y;
      if (!finger.drag && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) finger.drag = scan.pinned = true;
      if (finger.drag) scanAt(e);
    }
  };
  lab.addEventListener("pointerenter", across);
  lab.addEventListener("pointermove", across);
  lab.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") scan.on = false;
  });
  lab.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse") finger = { id: e.pointerId, x: e.clientX, y: e.clientY, drag: false };
  });
  const lift = (e: PointerEvent) => {
    if (finger && e.pointerId === finger.id) finger = null;
  };
  lab.addEventListener("pointerup", lift);
  lab.addEventListener("pointercancel", lift);
  // A tap sets the line down where it lands, and a tap anywhere else on the plate lifts it.
  svg.addEventListener("click", (e) => {
    if ((e as PointerEvent).pointerType === "mouse") return;
    if (lab.contains(e.target as Node)) {
      scan.pinned = true;
      scanAt(e as PointerEvent);
    } else scan.pinned = scan.on = false;
  });
}
