import { gsap, scrubbed, whileVisible, phase, q, qa } from "../motion";

// Everything on the scroll story is a pure function of the timeline time t
// (0..T), so scrubbing backwards replays it exactly in reverse.
const T = 10;
const X0 = 0.8; // first extraction
const XS = 0.45; // spacing between extractions
const FEED = [5.5, 7.0];
const Q_AMBIENT = 7.2; // after this the CUPS queue keeps running by itself
const CYCLE = 2.6; // seconds per ambient print job

const e3 = (u: number) => 1 - (1 - u) ** 3;
const io2 = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const io3 = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

interface Geo { S: number; mSeg: number[]; aSeg: number[]; W: number; gap: number }

export default function (root: HTMLElement) {
  const svg = q<SVGSVGElement>(root, "svg");
  const G: Geo = JSON.parse(svg.dataset.g!);
  const readout = root.querySelector<HTMLElement>("[data-readout]");
  const op = (el: Element, v: number) => ((el as SVGElement).style.opacity = v.toFixed(3));

  // ---- scrape ----
  const cards = qa<SVGGElement>(root, ".card");
  const sel = q<SVGGElement>(root, ".sel");
  const selBox = q<SVGRectElement>(sel, ".sel-r");
  const selTag = q<SVGGElement>(sel, ".sel-tg");
  // Each price's own box, inset 3 units around its text (measured once fonts
  // are in). The selector is positioned and sized only by transforms.
  const prices = cards.map((c) => q<SVGTextElement>(c, ".price"));
  let boxes: { x: number; y: number; w: number; h: number }[] = [];
  const measureBoxes = () => {
    boxes = prices.map((p) => {
      const b = p.getBBox();
      return { x: b.x - 3, y: b.y - 3, w: b.width + 6, h: b.height + 6 };
    });
  };
  measureBoxes();
  document.fonts?.ready.then(() => {
    measureBoxes();
    measure();
    render();
  });

  // ---- table + plot ----
  const rows = qa<SVGGElement>(root, ".row");
  const rowsN = q<SVGTSpanElement>(root, ".rows-n");
  const flies = qa<SVGRectElement>(root, ".fly");
  const tracks = qa<SVGLineElement>(root, ".ptrack");
  const ticks = [...qa(root, ".ptick"), ...qa(root, ".tk"), ...qa(root, ".pl"), ...qa(root, ".lg, .lg-d"), ...qa(root, ".plot > .accent")];
  const ranges = qa<SVGLineElement>(root, ".range");
  const dots = qa<SVGCircleElement>(root, ".pdot[data-i]");
  const qtm = qa<SVGGElement>(root, ".qtm");
  const len = (l: SVGLineElement) => Math.abs(Number(l.getAttribute("x2")) - Number(l.getAttribute("x1")));
  for (const l of [...tracks, ...ranges]) l.style.strokeDasharray = `${len(l) + 1} ${len(l) + 1}`;

  // ---- request + queue ----
  const rqClip = q<SVGRectElement>(root, ".rq-clip");
  const rqW = Number(rqClip.getAttribute("width"));
  const rqSku = q<SVGTSpanElement>(root, ".rq-sku");
  const status = q<SVGGElement>(root, ".status");
  const pkLayer = q<SVGGElement>(root, ".pk-layer");
  const flow = q<SVGPathElement>(root, ".flow");
  const jobs = qa<SVGGElement>(root, ".job").map((g) => ({
    g,
    pend: q(g, ".st-pend"),
    proc: q(g, ".st-proc"),
    arc: q(g, ".arc"),
    done: q(g, ".st-done"),
    id: q<SVGTextElement>(g, ".jid"),
    file: q<SVGTextElement>(g, ".jf"),
    st: q<SVGTextElement>(g, ".js"),
    y0: g.transform.baseVal.consolidate()!.matrix.f,
    j: -1,
    state: "",
  }));
  const rowTop = jobs[0].y0;
  const ROW = jobs[1].y0 - jobs[0].y0;

  // ---- printer ----
  const led = q<SVGCircleElement>(root, ".led");
  const paper = q<SVGGElement>(root, ".paper-g");
  const feed = Number(paper.dataset.feed);

  // ---- manual vs automated ----
  const mSegs = qa<SVGLineElement>(root, ".seg-m");
  const mTexts = qa<SVGTextElement>(root, ".r1 > .seg-t");
  const aGroups = qa<SVGGElement>(root, ".aseg").map((g) => ({
    line: q<SVGLineElement>(g, ".seg-a"),
    mName: q<SVGTextElement>(g, ".m-name"),
    aName: q<SVGTextElement>(g, ".a-name"),
  }));
  const saved = q<SVGGElement>(root, ".saved");
  const savedLine = q<SVGLineElement>(saved, ".sv");
  const sv1 = Number(savedLine.getAttribute("x1")), sv2 = Number(savedLine.getAttribute("x2"));
  const cut = q<SVGTextElement>(root, ".cut");
  const bandLabels = qa<SVGTextElement>(root, ".band .bl, .band .bl-r:not(.cut)");

  // Segment layout for widths ws (fractions of W), with a gap after each.
  const layout = (ws: number[]) => {
    let x = 0;
    return ws.map((w) => {
      const l = w * G.W;
      const g = Math.min(G.gap, l);
      const s = { x0: x, x1: x + l - g, cx: x + (l - g) / 2 };
      x += l;
      return s;
    });
  };

  // Map points from each block's coordinates into the root, so the pills can
  // fly between blocks in either layout (blocks are re-stacked on phones).
  const blockOf = (el: Element) => el.closest(".blk") as SVGGElement;
  let paths: { ax: number; ay: number; bx: number; by: number; s: number }[] = [];
  const measure = () => {
    const inv = svg.getScreenCTM()?.inverse();
    if (!inv) return;
    const mA = inv.multiply(blockOf(cards[0]).getScreenCTM()!);
    const mB = inv.multiply(blockOf(rows[0]).getScreenCTM()!);
    const pt = (m: DOMMatrix, x: number, y: number) => new DOMPoint(x, y).matrixTransform(m);
    paths = cards.map((_, i) => {
      const bg = rows[i].querySelector(".row-bg")!;
      const a = pt(mA, boxes[i].x + boxes[i].w / 2, boxes[i].y + boxes[i].h / 2);
      const b = pt(mB, Number(bg.getAttribute("x")) + Number(bg.getAttribute("width")) - 40, Number(bg.getAttribute("y")) + 8.5);
      return { ax: a.x, ay: a.y, bx: b.x, by: b.y, s: mA.a };
    });
  };
  measure();
  new ResizeObserver(() => {
    measure();
    render();
  }).observe(svg);

  // ---- queue model ----
  // c is the queue clock: job j is processing while floor(c) = j, completed
  // after. v is how many jobs have been submitted.
  let amb = 0;
  let lastSku = "";
  function renderQueue(c: number, v: number, t: number) {
    const s = c - 1;
    const sEff = s < 1 ? 0 : Math.floor(s) - 1 + e3(Math.min(1, (s % 1) / 0.18));
    const base = Math.floor(sEff);
    const fr = sEff - base;
    for (let k = 0; k < jobs.length; k++) {
      const r = jobs[k];
      const j = base + k;
      const y = rowTop + (k - fr) * ROW;
      // Timeline arrivals slide in; each row is visible once its job exists.
      const arrive = j < 3 ? phase(t, [5.1, 5.9, 6.4][j], [5.1, 5.9, 6.4][j] + 0.25) : j < v ? 1 : 0;
      const x = (1 - e3(arrive)) * 8;
      r.g.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
      let o = arrive;
      if (k === 0) o *= 1 - fr * 1.4;
      op(r.g, Math.max(0, o));
      if (j !== r.j) {
        r.j = j;
        r.id.textContent = String(412 + j);
        r.file.textContent = `QT-2025-${String(718 + j).padStart(4, "0")}.pdf`;
      }
      const state = c >= j + 1 ? "completed" : c >= j ? "processing" : "pending";
      if (state !== r.state) {
        r.state = state;
        r.st.textContent = state;
        r.st.classList.toggle("acc", state === "processing");
        r.pend.classList.toggle("off", state !== "pending");
        r.proc.classList.toggle("off", state !== "processing");
        r.done.classList.toggle("off", state !== "completed");
      }
    }
    const sku = `QT-2025-${String(718 + Math.max(0, v - 1)).padStart(4, "0")}`;
    const want = t < Q_AMBIENT ? "QT-2025-0718" : sku;
    if (want !== lastSku) rqSku.textContent = lastSku = want;
  }

  let spin = 0;
  function renderSpin() {
    for (const r of jobs) if (r.state === "processing") r.arc.setAttribute("transform", `rotate(${spin.toFixed(1)} 18 10.5)`);
  }

  let hover = -1;
  // Each block has its own clock. On desktop they all follow one timeline;
  // on phones the blocks are stacked, so each follows its own position.
  const K = { scrape: 0, table: 0, queue: 0, print: 0, band: 0 };

  function render() {
    let t = K.scrape;
    // 1. windows and cards
    // window frames are there from the start; the cards load in
    cards.forEach((c, i) => {
      const wi = Math.floor(i / 2);
      const u = e3(phase(t, 0.02 + wi * 0.12 + (i % 2) * 0.06, 0.4 + wi * 0.12 + (i % 2) * 0.06));
      op(c, u);
      c.setAttribute("transform", `translate(0 ${((1 - u) * 6).toFixed(2)})`);
    });

    // selector hops price to price
    const k = Math.min(5, Math.max(0, Math.floor((t - X0 + 0.2) / XS)));
    const hop = e3(phase(t, X0 + k * XS - 0.2, X0 + k * XS));
    const A = boxes[Math.max(0, k - 1)], B = boxes[k];
    const m = k === 0 ? 1 : hop;
    const bx = lerp(A.x, B.x, m), by = lerp(A.y, B.y, m), bw = lerp(A.w, B.w, m), bh = lerp(A.h, B.h, m);
    selBox.setAttribute("transform", `translate(${bx.toFixed(2)} ${by.toFixed(2)}) scale(${bw.toFixed(2)} ${bh.toFixed(2)})`);
    selTag.setAttribute("transform", `translate(${bx.toFixed(2)} ${by.toFixed(2)})`);
    op(sel, Math.min(phase(t, X0 - 0.25, X0 - 0.05), 1 - phase(t, X0 + 5 * XS + 0.45, X0 + 5 * XS + 0.65)));

    // pills fly from each price into its table row; rows land
    let n = 0;
    for (let i = 0; i < 6; i++) {
      const ti = X0 + i * XS;
      const u = phase(t, ti + 0.02, ti + 0.42);
      const p = paths[i];
      const f = flies[i];
      if (p && u > 0 && u < 1) {
        const e = io2(u);
        const x = lerp(p.ax, p.bx, e);
        const y = lerp(p.ay, p.by, e) - Math.sin(Math.PI * e) * 26 * p.s;
        f.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${p.s.toFixed(3)})`);
        op(f, Math.min(1, u * 8, (1 - u) * 5));
      } else op(f, 0);
      const r = phase(t, ti + 0.34, ti + 0.5);
      op(rows[i], r);
      rows[i].setAttribute("transform", `translate(${((1 - e3(r)) * -5).toFixed(2)} 0)`);
      if (r > 0.5) n++;
    }
    rowsN.textContent = `${n} ${n === 1 ? "row" : "rows"}`;

    t = K.table;
    // dot plot forms
    const P = 3.7;
    tracks.forEach((l) => {
      const u = phase(t, P, P + 0.35);
      l.style.strokeDashoffset = String((1 - u) * (len(l) + 1));
    });
    ticks.forEach((el) => op(el, phase(t, P + 0.15, P + 0.45)));
    dots.forEach((d) => {
      const i = Number(d.dataset.i);
      const u = e3(phase(t, P + 0.3 + i * 0.07, P + 0.5 + i * 0.07));
      d.setAttribute("r", (2.9 * u).toFixed(2));
      d.classList.toggle("hl", i === hover);
    });
    ranges.forEach((l) => {
      const u = phase(t, P + 0.8, P + 1.0);
      l.style.strokeDashoffset = String((1 - u) * (len(l) + 1));
      op(l, u > 0 ? 1 : 0);
    });
    qtm.forEach((g) => {
      const u = e3(phase(t, P + 0.95, P + 1.15));
      op(g, u);
      g.setAttribute("transform", `translate(0 ${((1 - u) * -4).toFixed(2)})`);
    });

    t = K.queue;
    // request types in, then 200
    rqClip.setAttribute("width", (rqW * phase(t, 4.2, 4.8)).toFixed(1));
    op(status, phase(t, 4.85, 5.0));

    // queue
    let c = t < 5.4 ? -1 : t < 7.1 ? 0 : 1;
    let v = (t >= 5.1 ? 1 : 0) + (t >= 5.9 ? 1 : 0) + (t >= 6.4 ? 1 : 0) + (t >= 7.1 ? 1 : 0);
    if (t >= Q_AMBIENT) {
      c += amb;
      v = Math.floor(c) + 3;
    }
    renderQueue(c, v, t);
    led.classList.toggle("on", c >= 0);

    t = K.print;
    // paper feeds out: steady while printing, then advances to the tear bar
    const fu = phase(t, FEED[0], FEED[1]);
    const g = fu < 0.8 ? (fu / 0.8) * 0.86 : 0.86 + 0.14 * e3((fu - 0.8) / 0.2);
    paper.setAttribute("transform", `translate(0 ${(-feed * (1 - g)).toFixed(2)})`);

    t = K.band;
    // manual row draws step by step
    const B0 = 7.3;
    const man = layout(G.mSeg);
    mSegs.forEach((l, i) => {
      const u = phase(t, B0 + i * 0.28, B0 + (i + 1) * 0.28);
      l.setAttribute("x2", lerp(man[i].x0, man[i].x1, u).toFixed(2));
      op(l, u > 0 ? 1 : 0);
      op(mTexts[i], phase(t, B0 + i * 0.28 + 0.12, B0 + (i + 1) * 0.28));
    });
    bandLabels.forEach((el, i) => op(el, phase(t, B0 - 0.2 + (i > 1 ? 1.1 : 0), B0 + (i > 1 ? 1.3 : 0.1))));

    // automated row starts as the same steps, then collapses
    const A0 = 8.5;
    const appear = phase(t, A0, A0 + 0.3);
    const col = io3(phase(t, A0 + 0.35, A0 + 1.15));
    const ws = G.mSeg.map((w, i) => lerp(w, G.aSeg[i], col));
    const aut = layout(ws);
    aGroups.forEach((a, i) => {
      a.line.setAttribute("x1", aut[i].x0.toFixed(2));
      a.line.setAttribute("x2", Math.max(aut[i].x0, lerp(aut[i].x0, aut[i].x1, e3(appear))).toFixed(2));
      op(a.line, appear > 0 && aut[i].x1 - aut[i].x0 > 0.2 ? 1 : 0);
      a.mName.setAttribute("x", aut[i].cx.toFixed(2));
      a.aName.setAttribute("x", aut[i].cx.toFixed(2));
      op(a.mName, appear * (1 - phase(col, 0, 0.3)));
      op(a.aName, phase(col, 0.75, 1));
    });
    savedLine.setAttribute("x2", lerp(sv1, sv2, phase(t, A0 + 1.15, A0 + 1.45)).toFixed(2));
    op(savedLine, t > A0 + 1.15 ? 1 : 0);
    op(saved, phase(t, A0 + 1.1, A0 + 1.3));
    op(cut, phase(t, A0 + 1.3, A0 + 1.5));

    // readout: whichever block has got furthest
    t = Math.max(K.scrape, K.table, K.queue, K.print, K.band);
    n = rows.filter((r) => Number(r.style.opacity) > 0.5).length;
    let s: string;
    if (t < 3.7) s = `scraped ${n} / 6`;
    else if (t < 4.85) s = "priced";
    else if (t < 5.4) s = "POST 200";
    else if (t < 7.1) s = "printing";
    else if (t < A0 + 1.3) s = "timing";
    else s = "−70% time";
    if (readout && readout.textContent !== s) readout.textContent = s;
  }

  // Beat ranges of the global clock that belong to each block.
  const RANGES: Record<keyof typeof K, [number, number]> = {
    scrape: [0, X0 + 5 * XS + 0.7],
    table: [3.6, 4.9],
    queue: [4.2, Q_AMBIENT + 0.05],
    print: [FEED[0] - 0.1, FEED[1] + 0.1],
    band: [7.25, T],
  };
  const blockOfKey: Record<keyof typeof K, string> = { scrape: "b-scrape", table: "b-table", queue: "b-queue", print: "b-print", band: "band" };
  const afterUpdate = () => {
    if (K.queue < Q_AMBIENT) amb = 0;
    render();
  };
  const mm = gsap.matchMedia();
  mm.add("(min-width: 561px)", () => {
    const tl = scrubbed(root, { start: "top 85%", end: "center 45%" });
    const clock = { t: 0 };
    tl.to(clock, { t: T, duration: T, ease: "none" });
    tl.eventCallback("onUpdate", () => {
      for (const k in K) K[k as keyof typeof K] = clock.t;
      afterUpdate();
    });
  });
  mm.add("(max-width: 560px)", () => {
    for (const key of Object.keys(K) as (keyof typeof K)[]) {
      const el = root.querySelector(`.${blockOfKey[key]}`)!;
      const [a, b] = RANGES[key];
      const clock = { t: a };
      const tl = scrubbed(el, { start: "top 80%", end: "bottom 55%" });
      tl.fromTo(clock, { t: a }, { t: b, duration: 1, ease: "none" });
      tl.eventCallback("onUpdate", () => {
        K[key] = clock.t;
        afterUpdate();
      });
    }
  });
  render();

  // Ambient: new jobs trickle through CUPS, the spinner turns, packets carry
  // each request down to the queue.
  let pk: SVGCircleElement | null = null;
  let lastPk = 1;
  const flowLen = flow.getTotalLength();
  whileVisible(root, (dt) => {
    spin = (spin + dt * 300) % 360;
    if (K.queue >= Q_AMBIENT) {
      const before = Math.floor(amb);
      amb += dt / CYCLE;
      const c = 1 + amb;
      renderQueue(c, Math.floor(c) + 3, K.queue);
      if (Math.floor(amb) !== before) lastPk = 0;
      led.style.opacity = (0.65 + 0.35 * Math.cos(amb * Math.PI * 2 * 2)).toFixed(3);
    } else led.style.opacity = "";
    renderSpin();
    // one packet per submitted job, travelling down the connector
    if (lastPk < 1) {
      lastPk = Math.min(1, lastPk + dt / 0.5);
      if (!pk) {
        pk = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        pk.setAttribute("r", "2.2");
        pk.setAttribute("class", "dot-accent");
        pkLayer.append(pk);
      }
      const p = flow.getPointAtLength(lastPk * flowLen);
      pk.setAttribute("cx", p.x.toFixed(1));
      pk.setAttribute("cy", p.y.toFixed(1));
      pk.style.opacity = K.queue >= Q_AMBIENT ? String(Math.min(1, lastPk * 6, (1 - lastPk) * 6)) : "0";
    }
  });

  // Pointer: a table row lights up its source card and its dot.
  const setHover = (i: number) => {
    hover = i;
    rows.forEach((r, k) => r.classList.toggle("hl", k === i));
    cards.forEach((c, k) => c.classList.toggle("hl", k === i));
    dots.forEach((d) => d.classList.toggle("hl", Number(d.dataset.i) === i));
  };
  rows.forEach((r, i) => {
    r.addEventListener("pointerenter", () => {
      if (Number(r.style.opacity || 1) > 0.5) setHover(i);
    });
    r.addEventListener("pointerleave", () => setHover(-1));
    r.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse") setHover(hover === i ? -1 : i);
    });
  });
}
