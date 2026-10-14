import { gsap, scrubbed, phase, whileVisible, q, qa, T } from "../motion";

interface Geo {
  total: number; goldEnd: number; lengths: number[]; n: number;
  cells: [number, number][]; XL: number; XR: number; start: number; cell: number; thirds: number[];
}

const NS = "http://www.w3.org/2000/svg";
const fmt = new Intl.NumberFormat("en-US");
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const FRONT = 180; // cells in the flipping band at the sweep front
const RANKS = 20;

// The story, in scroll progress. It is told top to bottom, as the plate comes
// up the window: the staircase, the Gold contest's thousand points, the last
// step, then the two rulers (each drawn once it is in view, its needles sent
// out once Platinum is reached), and the three AIME years. Nothing after 0.93:
// with the plate in the middle of the window the figure is finished.
const STAIRS: [number, number] = [0, 0.16]; // Bronze to the end of the Gold tread
const SWEEP: [number, number] = [0.12, 0.44];
const CLIMB: [number, number] = [0.43, 0.5]; // the riser and tread of Platinum, in ink
const PLAT: [number, number] = [0.48, 0.55]; // and over again in the accent
const RULE: [number, number][] = [[0.2, 0.38], [0.38, 0.54]];
// In the order the marks are written: PhysicsBowl Canada, world; Newton Canada, world.
// The world needle leaves first and stops short; the Canada needle passes it.
const NEEDLE: [number, number][] = [[0.56, 0.7], [0.52, 0.66], [0.64, 0.78], [0.6, 0.74]];
/** How far through its window a needle is when it comes to rest on its rank; its callout is written after. */
const LANDED = 0.72;
const AIME: [number, number] = [0.79, 0.93];
/** The story starts when the foot of the staircase has come this far up the window. */
const LINE = 92;

export default function (root: HTMLElement) {
  const svg = q<SVGSVGElement>(root, "svg");
  const G: Geo = JSON.parse(svg.dataset.g!);
  const readout = root.querySelector<HTMLElement>("[data-readout]");
  const arrive = gsap.parseEase("arrive");
  const op = (el: Element, v: number) => ((el as SVGElement).style.opacity = v.toFixed(3));
  const span = G.XR - G.XL;
  const xOf = (rank: number) => G.XL + (Math.log(rank) / Math.log(RANKS)) * span;
  const rankAt = (x: number) => RANKS ** clamp01((x - G.XL) / span);

  /**
   * Something that happens rather than is drawn (a verdict landing, a badge
   * arriving): it plays in its own time when the story reaches it and plays
   * back when the story leaves, so no scroll, however fast, makes it a cut.
   */
  function latch(render: (v: number) => void, seconds: number = T.state, ease = "arrive") {
    const s = { v: 0 };
    let want = false;
    render(0);
    return (on: boolean) => {
      if (on === want) return;
      want = on;
      gsap.to(s, { v: on ? 1 : 0, duration: seconds, ease, overwrite: true, onUpdate: () => render(s.v) });
    };
  }
  /** A tick drawn from its first stroke, for paths written as one continuous line. */
  const inked = (el: SVGGeometryElement) => {
    const len = el.getTotalLength();
    el.style.strokeDasharray = `${len} ${len + 1}`;
    return (u: number) => {
      el.style.strokeDashoffset = String(len * (1 - u));
      // A round cap paints a dot before the line has started.
      el.style.opacity = u > 0.001 ? "1" : "0";
    };
  };

  // ---------------------------------------------------------- 1. USACO
  const stair = q<SVGPathElement>(root, ".stair");
  const plat = q<SVGPathElement>(root, ".plat");
  const risers = qa<SVGLineElement>(root, ".riser");
  const bg = q<SVGRectElement>(root, ".cells-bg");
  const count = q<SVGTextElement>(root, ".count");
  const on = q<SVGPathElement>(root, ".cells-on");
  const front = q<SVGPathElement>(root, ".cells-front");
  const cellsD = on.getAttribute("d")!;
  // A second settled path, for the cells a ripple has not reached yet (see "at rest", at the end).
  const beyond = on.cloneNode(false) as SVGPathElement;
  beyond.setAttribute("d", "M0 0");
  on.after(beyond);
  const offsets: number[] = [];
  for (let i = cellsD.indexOf("M"); i !== -1; i = cellsD.indexOf("M", i + 1)) offsets.push(i);
  offsets.push(cellsD.length);
  const platLen = plat.getTotalLength();
  stair.style.strokeDasharray = `${G.total} ${G.total + 1}`;
  plat.style.strokeDasharray = `${platLen} ${platLen + 1}`;
  const C = G.cell;

  const divs = qa<SVGGElement>(root, ".div").map((el) =>
    latch((v) => {
      op(el, v);
      el.setAttribute("transform", `translate(0 ${((1 - v) * 5).toFixed(2)})`);
    }, 0.5),
  );
  const top = qa<SVGGElement>(root, ".div")[3];
  const showCount = latch((v) => op(count, v));
  const verdictMarks = qa<SVGGElement>(root, ".vd .vdi");
  const verdicts = qa<SVGGElement>(root, ".vd").map((el) => {
    const c = q<SVGCircleElement>(el, "circle");
    const [cx, cy] = [Number(c.getAttribute("cx")), Number(c.getAttribute("cy"))];
    const tick = inked(q<SVGPathElement>(el, ".vd-k"));
    return latch((v) => {
      // The disc lands first; the tick is written on it.
      const a = phase(v, 0, 0.6);
      op(el, phase(v, 0, 0.3));
      el.setAttribute("transform", `translate(${cx} ${cy}) scale(${(0.5 + 0.5 * a).toFixed(3)}) translate(${-cx} ${-cy})`);
      tick(phase(v, 0.45, 1));
    }, 0.36);
  });

  // ---------------------------------------------------------- 2. rulers
  const strips = qa<SVGGElement>(root, ".strip");
  const numbers = qa<SVGTextElement>(root, "text.tk").map((el) => ({ el, r: Number(el.dataset.r), x: Number(el.getAttribute("x")), o: -1, drawn: 0 }));
  const rules = strips.map((el, s) => {
    const track = q<SVGLineElement>(el, ".track");
    track.style.strokeDasharray = `${span} ${span + 1}`;
    const ticks = qa<SVGLineElement>(el, ".tick").map((t) => ({
      el: t,
      x: Number(t.getAttribute("x1")),
      y: Number(t.getAttribute("y1")),
      h: Number(t.getAttribute("y1")) - Number(t.getAttribute("y2")),
      g: -1,
    }));
    return { el, s, track, ticks, y: ticks[0].y, done: false };
  });
  const axl = q<SVGTextElement>(root, ".axl");
  const showAxis = latch((v) => op(axl, v));

  const marks = qa<SVGGElement>(root, ".mk").map((el) => {
    const needle = q<SVGGElement>(el, ".needle");
    const lead = inked(q<SVGPathElement>(el, ".lead"));
    const label = q(el, ".cl");
    return {
      needle,
      x: Number(el.dataset.x),
      y: Number(el.dataset.y),
      world: el.classList.contains("world"),
      rank: RANKS,
      show: latch((v) => op(needle, v), T.press),
      // The callout: its leader is drawn up from the needle, then the word arrives at the end of it.
      call: latch((v) => {
        lead(phase(v, 0, 0.6));
        op(label, phase(v, 0.4, 1));
      }, 0.5),
    };
  });

  // ---------------------------------------------------------- 3. AIME
  const aline = q<SVGLineElement>(root, ".aline");
  const alen = Number(aline.getAttribute("x2")) - Number(aline.getAttribute("x1"));
  aline.style.strokeDasharray = `${alen} ${alen + 1}`;
  const years = qa<SVGGElement>(root, ".ay").map((el) => {
    const disc = q<SVGCircleElement>(el, ".ay-c");
    const [cx, cy] = [Number(disc.getAttribute("cx")), Number(disc.getAttribute("cy"))];
    const tick = inked(q<SVGPathElement>(el, ".ay-k"));
    return latch((v) => {
      op(el, phase(v, 0, 0.35));
      disc.setAttribute("transform", `translate(${cx} ${cy}) scale(${(0.4 + 0.6 * phase(v, 0, 0.6)).toFixed(3)}) translate(${-cx} ${-cy})`);
      tick(phase(v, 0.45, 1));
    }, 0.55);
  });

  // ---------------------------------------------------------- the story
  let p = 0;
  let shown = -1, frontKey = "";
  let swept = false; // every cell is in
  // At rest one problem's cells ripple now and then (see the end of this file).
  const wave = { on: false, at: 0, k: 0, wait: 2.6, n: 0 };

  function renderStairs(): string {
    // Draw up to the end of Gold, sweep the grid, then climb to Platinum.
    const up = G.goldEnd * phase(p, ...STAIRS) + (G.total - G.goldEnd) * phase(p, ...CLIMB);
    stair.style.strokeDashoffset = String(G.total - up);
    op(stair, clamp01(up / 2));
    divs.forEach((land, i) => land(up > G.lengths[i] + 1));

    const k = phase(p, ...PLAT);
    plat.style.strokeDashoffset = String(platLen * (1 - k));
    op(plat, clamp01(k * 40));
    top.classList.toggle("top", k >= 1);

    // The sweep: settled cells in one substring, and a band of cells at the
    // front still flipping (drawn as shrinking-to-full squares).
    const sweep = phase(p, ...SWEEP) * (G.n + FRONT);
    const n = Math.max(0, Math.min(G.n, Math.floor(sweep - FRONT)));
    if (n !== shown) {
      shown = n;
      on.setAttribute("d", n ? cellsD.slice(0, offsets[n]) : "M0 0");
    }
    swept = n >= G.n;
    // Scrolled back into the sweep while a ripple was passing: the grid is the story's again, at once.
    if (!swept && wave.on) {
      wave.on = false;
      beyond.setAttribute("d", "M0 0");
      verdictMarks[wave.k].style.opacity = "";
      frontKey = "";
    }
    const hi = Math.min(G.n, Math.floor(sweep));
    const key = `${n}:${hi}:${Math.round(sweep * 4)}`;
    if (key !== frontKey && !(swept && wave.on)) {
      frontKey = key;
      let d = "";
      for (let i = n; i < hi; i++) {
        const u = Math.min(1, (sweep - i) / FRONT);
        // Each cell turns over edge-on first, then opens to a full square.
        const [x, y] = G.cells[i];
        const hh = Math.max(0.35, C * Math.sin((Math.PI / 2) * u));
        d += `M${x} ${(y + (C - hh) / 2).toFixed(2)}h${C}v${hh.toFixed(2)}h-${C}z`;
      }
      front.setAttribute("d", d || "M0 0");
      op(front, 0.72);
    }
    const lit = Math.min(G.n, Math.max(0, Math.floor(sweep - FRONT / 2)));
    const text = `${fmt.format(lit)} / ${fmt.format(G.n)}`;
    if (count.textContent !== text) count.textContent = text;
    showCount(up >= G.goldEnd - 40);
    verdicts.forEach((land, i) => land(lit >= G.thirds[i]));

    if (p >= CLIMB[0]) return "Platinum";
    if (sweep > 0) return `Gold ${fmt.format(lit)}`;
    if (up > G.lengths[2]) return "Gold";
    if (up > G.lengths[1]) return "Silver";
    return up > 0 ? "Bronze" : "USACO";
  }

  function renderRules() {
    for (const R of rules) {
      const u = phase(p, ...RULE[R.s]);
      const pen = G.XL + span * u;
      R.track.style.strokeDashoffset = String(span * (1 - u));
      op(R.track, clamp01(u * 60));
      // Each tick rises as the pen passes its foot.
      for (const t of R.ticks) {
        const g = u >= 1 ? 1 : clamp01((pen - t.x) / 16);
        if (g === t.g) continue;
        t.g = g;
        t.el.setAttribute("y2", (t.y - t.h * g).toFixed(2));
        t.el.style.opacity = g > 0 ? "1" : "0";
      }
      R.done = u >= 1;
      if (R.s === 1) for (const n of numbers) n.drawn = u >= 1 ? 1 : clamp01((pen - n.x) / 22);
    }
    paintNumbers();
    showAxis(phase(p, ...RULE[1]) >= 0.96);
  }

  function renderNeedles(): string {
    let label = "";
    marks.forEach((m, i) => {
      const u = phase(p, ...NEEDLE[i]);
      const x = G.start + (m.x - G.start) * arrive(phase(u, 0, LANDED));
      m.needle.setAttribute("transform", `translate(${x.toFixed(2)} ${m.y})`);
      m.show(u > 0);
      m.call(u >= LANDED + 0.02);
      m.rank = Math.round(rankAt(x));
    });
    // The readout names the exam whose needles are out, and gives a rank only once its needle has come to rest on
    // it. The exam shown is the last one a needle has landed on (or, before any has, the first one sent out).
    const state = ([0, 1] as const).map((s) => {
      const uc = phase(p, ...NEEDLE[s * 2]), uw = phase(p, ...NEEDLE[s * 2 + 1]);
      return { out: uc > 0 || uw > 0, ca: uc >= LANDED ? marks[s * 2].rank : 0, world: uw >= LANDED ? marks[s * 2 + 1].rank : 0 };
    });
    const names = ["PhysicsBowl", "Newton"];
    const s = state[1].ca || state[1].world ? 1 : state[0].out ? 0 : -1;
    if (s >= 0) label = names[s] + (state[s].ca ? `  Canada ${state[s].ca}` : "") + (state[s].world ? `  world ${state[s].world}` : "");
    return label;
  }

  function renderAime(): string {
    const lu = phase(p, ...AIME);
    aline.style.strokeDashoffset = String(alen * (1 - lu));
    op(aline, clamp01(lu * 60));
    let done = 0;
    years.forEach((land, i) => {
      // The line reaches a year, and the year is marked.
      const there = lu > 0 && lu >= i / 2 - 0.02;
      land(there);
      if (there) done++;
    });
    return lu > 0 ? `AIME ×${done}` : "";
  }

  function render() {
    const a = renderStairs();
    renderRules();
    const b = renderNeedles();
    const c = renderAime();
    const s = c || b || a;
    if (readout && readout.textContent !== s) readout.textContent = s;
  }

  // ---------------------------------------------------------- reading a ruler
  // Under the pointer a ruler is read like one: the nearest rank's tick is
  // picked out and its number written under it. Touch reads it the same way.
  let u1 = 1; // how much labels grow on a phone
  const measure = () => {
    u1 = Math.max(1, parseFloat(getComputedStyle(numbers[0].el).fontSize) / 11);
  };
  measure();
  window.addEventListener("resize", () => {
    measure();
    box = null;
  });

  const probe = { s: -1, rank: 0, x: 0, v: 0 };
  function paintNumbers() {
    for (const n of numbers) {
      // A number already printed gives way to the one being read beside it.
      let o = n.drawn;
      if (probe.v > 0 && probe.s === 1 && n.r !== probe.rank) o *= 1 - probe.v * (1 - clamp01((Math.abs(n.x - probe.x) - 13 * u1) / 8));
      o = Math.round(o * 100) / 100;
      if (o !== n.o) op(n.el, (n.o = o));
      n.el.classList.toggle("read", probe.v > 0.5 && probe.s === 1 && n.r === probe.rank);
    }
  }
  const probes = rules.map((R) => {
    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", "probe");
    const line = document.createElementNS(NS, "line");
    line.setAttribute("y1", String(R.y + 0.5));
    line.setAttribute("y2", String(R.y - 11));
    const text = document.createElementNS(NS, "text");
    text.setAttribute("class", "cm");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "hanging");
    text.setAttribute("y", String(R.y + 10));
    g.append(line, text);
    g.style.opacity = "0";
    R.el.insertBefore(g, R.el.querySelector(".mk"));
    return { g, text };
  });
  const place = () => {
    if (probe.s < 0) return;
    const P = probes[probe.s];
    P.g.setAttribute("transform", `translate(${probe.x.toFixed(2)} 0)`);
    P.g.style.opacity = probe.v.toFixed(3);
    // On the lower ruler the printed numbers stand in for the probe's own where there is one.
    const printed = probe.s === 1 && numbers.some((n) => n.r === probe.rank);
    P.text.style.opacity = printed ? "0" : "1";
    paintNumbers();
  };
  let box: DOMRect | null = null;
  function read(s: number, clientX: number) {
    if (!rules[s].done) return;
    box ??= svg.getBoundingClientRect();
    const x = ((clientX - box.left) / box.width) * svg.viewBox.baseVal.width;
    const rank = Math.round(rankAt(x));
    if (probe.s !== s) {
      // Another ruler: the probe starts there rather than crossing the figure.
      if (probe.s >= 0) probes[probe.s].g.style.opacity = "0";
      gsap.killTweensOf(probe);
      probe.s = s;
      probe.v = 0;
      probe.x = xOf(rank);
      probe.rank = 0;
    }
    if (rank === probe.rank) return;
    probe.rank = rank;
    probes[s].text.textContent = String(rank);
    gsap.to(probe, { x: xOf(rank), v: 1, duration: T.press, ease: "arrive", overwrite: true, onUpdate: place });
  }
  function unread() {
    box = null;
    if (probe.s < 0) return;
    probe.rank = 0;
    gsap.to(probe, { v: 0, duration: T.state, ease: "arrive", overwrite: true, onUpdate: place });
  }
  strips.forEach((el, s) => {
    const label = (v: boolean) => strips.forEach((o) => o.classList.toggle("on", v && o === el));
    el.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && label(true));
    el.addEventListener("pointerleave", (e) => {
      if (e.pointerType !== "mouse") return;
      label(false);
      unread();
    });
    // A finger: a tap shows the full label and reads the rank under it, and a second tap puts both away; a slide
    // along the ruler reads it as it goes. A finger that is only scrolling the page past changes nothing.
    let finger: { id: number; x: number; slid: boolean } | null = null;
    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse") finger = { id: e.pointerId, x: e.clientX, slid: false };
    });
    el.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse") return read(s, e.clientX);
      if (!finger || finger.id !== e.pointerId) return;
      if (!finger.slid && Math.abs(e.clientX - finger.x) < 8) return;
      finger.slid = true;
      label(true);
      read(s, e.clientX);
    });
    el.addEventListener("pointerup", (e) => {
      if (!finger || finger.id !== e.pointerId) return;
      if (!finger.slid) {
        const was = el.classList.contains("on");
        label(!was);
        if (was) unread();
        else read(s, e.clientX);
      }
      finger = null;
    });
    el.addEventListener("pointercancel", () => {
      finger = null;
      box = null;
    });
  });

  // ---------------------------------------------------------- bind
  // Where in the plate, px below its top, a height of the drawing falls.
  const below = (y: number) => {
    const r = root.getBoundingClientRect(), b = svg.getBoundingClientRect();
    return b.top - r.top + (y / svg.viewBox.baseVal.height) * b.height;
  };
  const ground = Number(q<SVGLineElement>(root, ".riser").getAttribute("y2"));

  // The set-up is tied to the window, not to the story. As the plate comes up, the construction lines are ruled
  // down to wherever the window has got to: the dotted guide under each step, then the empty sheet of the Gold
  // contest, a row of cells at a time. Nothing is ruled below what can be seen, and nothing waits once it can
  // be; the ink that follows (the staircase, the points) is then drawn over lines already laid.
  const guides = risers.map((el) => ({ el, top: Number(el.getAttribute("y1")) }));
  const sheet = { y: Number(bg.getAttribute("y")), h: Number(bg.getAttribute("height")) };
  const ruled = { y: 0 }; // the height of the drawing, in its own units, that has come up to the line
  const rule = () => {
    for (const g of guides) {
      g.el.setAttribute("y2", Math.min(ground, Math.max(g.top, ruled.y)).toFixed(1));
      g.el.style.opacity = ruled.y > g.top + 0.5 ? "1" : "0";
    }
    bg.setAttribute("height", Math.min(sheet.h, Math.max(0, ruled.y - sheet.y)).toFixed(1));
  };
  rule();
  const setUp = scrubbed(root, {
    start: () => `top+=${Math.round(below(guides[guides.length - 1].top))} ${LINE}%`,
    end: () => `top+=${Math.round(below(ground))} ${LINE}%`,
  });
  setUp.fromTo(ruled, { y: guides[guides.length - 1].top }, { y: ground, duration: 1, onUpdate: rule });

  const tl = scrubbed(root, { start: () => `top+=${Math.round(below(ground + 4))} ${LINE}%`, end: "center 50%" });
  const clock = { p: 0 };
  tl.to(clock, {
    p: 1,
    duration: 1,
    onUpdate() {
      p = clock.p;
      render();
    },
  });
  // What is above the plate can change height after it has measured itself
  // (type is split into lines to rise, then put back); measure again then.
  {
    const sts = [setUp.scrollTrigger!, tl.scrollTrigger!];
    let queued = false;
    const again = () => {
      queued = false;
      for (const st of sts) {
        st.refresh();
        st.update();
      }
    };
    const ro = new ResizeObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(again);
    });
    ro.observe(document.body);
    ro.observe(root);
  }

  // ---------------------------------------------------------- at rest
  // A contest is three problems, and each third of the cells is one problem's
  // points. Now and then one of them is gone over again: a ripple runs through
  // its cells in the order they were first counted (each narrows a little as
  // the band reaches it and opens again behind it), and its verdict steps back
  // while it does and is back when it is through. Nothing is recounted. Which
  // problem, and how long until the next, follow a fixed uneven sequence.
  const BAND = 70, SPEED = 300; // cells; cells a second
  const golden = (i: number) => (i * 0.618034) % 1;
  whileVisible(root, (dt) => {
    if (!swept) {
      wave.wait = 2.6;
      return;
    }
    if (!wave.on) {
      wave.wait -= dt;
      if (wave.wait > 0) return;
      wave.on = true;
      wave.at = 0;
      wave.k = Math.floor(golden(++wave.n) * 3) % 3;
    }
    const a0 = wave.k ? G.thirds[wave.k - 1] : 0, a1 = G.thirds[wave.k];
    wave.at += dt * SPEED;
    const head = a0 + wave.at, tail = head - BAND;
    const mark = verdictMarks[wave.k];
    if (tail >= a1) {
      wave.on = false;
      wave.wait = 4 + 6 * golden(wave.n * 7 + 3);
      on.setAttribute("d", cellsD);
      beyond.setAttribute("d", "M0 0");
      front.setAttribute("d", "M0 0");
      mark.style.opacity = "";
      shown = G.n;
      frontKey = "";
      return;
    }
    const from = Math.max(a0, Math.ceil(tail)), to = Math.min(a1, Math.ceil(head));
    on.setAttribute("d", from ? cellsD.slice(0, offsets[from]) : "M0 0");
    beyond.setAttribute("d", to < G.n ? cellsD.slice(offsets[to]) : "M0 0");
    let d = "";
    for (let i = from; i < to; i++) {
      const u = (head - i) / BAND;
      const [x, y] = G.cells[i];
      // Narrowest in the middle of the band, a full square at either edge of it.
      const hh = C * (1 - 0.36 * Math.sin(Math.PI * u) ** 2);
      d += `M${x} ${(y + (C - hh) / 2).toFixed(2)}h${C}v${hh.toFixed(2)}h-${C}z`;
    }
    front.setAttribute("d", d || "M0 0");
    op(front, 0.72);
    mark.style.opacity = (1 - 0.5 * Math.sin(Math.PI * Math.min(1, wave.at / (a1 - a0 + BAND))) ** 2).toFixed(3);
  });

  render();
}
