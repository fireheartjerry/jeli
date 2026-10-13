import { gsap, scrubbed, phase, q, qa, whileVisible } from "../motion";

type Beat = [number, number];
interface Geo {
  beats: { a: Beat; b: Beat; c: Beat };
  /** Length of the orchestration leader, the one stroke that is drawn on. */
  lead: number;
  c: { hit: number; cell: number; x0: number; top: number; pitch: number; cols: number; rows: number };
  /** The plate readout's lines for the scroll story. Every number in them is written with the data, in the component. */
  story: { idle: string; a: string; aDone: string; bOne: string; bBoth: string; cDone: string };
}

const GLINT = 9; // cells lit at once by the replay's highlight

// A scrubbed story repeats most of every frame, so each write goes through a
// cache and touches the DOM only when its value changes.
const cache = new WeakMap<Element, Record<string, string | number>>();
const slot = (el: Element) => {
  let s = cache.get(el);
  if (!s) cache.set(el, (s = {}));
  return s;
};
/** Opacity, to three places. */
const op = (el: Element, v: number) => {
  const s = slot(el), n = Math.round(v * 1000);
  if (s.o === n) return;
  s.o = n;
  (el as SVGElement).style.opacity = String(n / 1000);
};
/** A stroke drawn on along its own length: u from 0 (nothing) to 1 (all of it). */
const draw = (el: SVGElement, len: number, u: number) => {
  const s = slot(el), n = Math.round(len * (1 - u) * 100);
  if (s.d !== n) {
    s.d = n;
    el.style.strokeDashoffset = String(n / 100);
  }
  op(el, u > 0 ? 1 : 0); // a round cap paints a dot at zero length
};

type Pick = { p: "a" | "b"; i: number } | { p: "c"; i: 0 | 1 } | null;
type Hit = { hit: SVGRectElement; k: NonNullable<Pick> };

/** Wire one layout. Everything positional comes from that layout's own geometry. */
function bind(svg: SVGSVGElement) {
  const G: Geo = JSON.parse(svg.dataset.g!);

  // (a) two 100% bars. Each bar and its split is one group, shown whole.
  const arows = qa<SVGGElement>(svg, ".arow").map((g) => ({
    g, seg: q<SVGGElement>(g, ".seg"),
    kv: q<SVGTextElement>(g, ".kv"), lv: q<SVGTextElement>(g, ".lv"), orch: q<SVGLineElement>(g, ".orch"),
  }));
  const ocall = q<SVGGElement>(svg, ".ocall");
  const lead = q<SVGPathElement>(ocall, ".lead");
  const ol = q<SVGTextElement>(ocall, ".ol");
  const aleg = q<SVGGElement>(svg, ".aleg");
  lead.style.strokeDasharray = `${G.lead} ${G.lead}`;

  // (b) dot, whisker and the clearance to zero
  const brows = qa<SVGGElement>(svg, ".brow").map((g) => ({
    g, pt: q<SVGCircleElement>(g, ".pt"), iv: q<SVGGElement>(g, ".iv"), clr: q<SVGLineElement>(g, ".clr"),
    bv: q<SVGTextElement>(g, ".bv"), bci: q<SVGTextElement>(g, ".bci"),
  }));
  const bnote = svg.querySelector<SVGTextElement>(".bnote");

  // (c) the grid: one group for all 165 cells, and the highlight that crosses them
  const cells = q<SVGGElement>(svg, ".cells");
  const glint = q<SVGPathElement>(svg, ".cells-glint");
  const count = q<SVGTextElement>(svg, ".count");
  const cleg = q<SVGGElement>(svg, ".cleg");
  const cstat = svg.querySelector<SVGTextElement>(".cstat");
  // The colliding cells, in the order the highlight crosses them.
  const cellsD = q<SVGPathElement>(svg, ".cells-on").getAttribute("d")!;
  const offsets: number[] = [];
  for (let i = cellsD.indexOf("M"); i !== -1; i = cellsD.indexOf("M", i + 1)) offsets.push(i);
  offsets.push(cellsD.length);
  const C = G.c.cell;

  const done = { a: false, b: false, c: false };
  // What the story has to say so far, for the plate readout.
  const told = { a: false, b: 0, c: false };

  // Every readable state is true. A mark whose length, position or count
  // encodes a measurement is never grown, moved or filled in: its geometry is
  // the server's and is never written, and it appears whole, by opacity. A
  // number is shown once its mark is fully shown. Only structure is drawn on
  // (here, the leader to the orchestration label).

  // (a) Each bar appears whole, both shares at their measured lengths, then its numbers.
  const ROW = 0.3, BAR = 0.2, NAME = 0.12;
  function renderA(p: number) {
    arows.forEach((r, i) => {
      const from = 0.1 + i * ROW;
      op(r.seg, phase(p, from, from + BAR));
      const named = phase(p, from + BAR, from + BAR + NAME);
      op(r.kv, named);
      op(r.lv, named);
      // The orchestration share is marked on both bars, then called out.
      op(r.orch, phase(p, 0.72, 0.8));
    });
    draw(lead, G.lead, phase(p, 0.8, 0.9));
    op(ol, phase(p, 0.9, 1));
    op(aleg, phase(p, 0.04, 0.14));
    told.a = p >= 0.1 + ROW + BAR; // both bars stand
  }

  // (b) Each estimate appears at its measured value, then its whole interval,
  // then the dotted clearance from zero to the interval's near end, whole.
  function renderB(p: number) {
    let landed = 0;
    brows.forEach((r, i) => {
      const u = phase(p, i * 0.14, 0.8 + i * 0.14);
      op(r.pt, phase(u, 0, 0.14));
      op(r.bv, phase(u, 0.14, 0.28));
      op(r.iv, phase(u, 0.3, 0.46));
      op(r.bci, phase(u, 0.46, 0.6));
      op(r.clr, phase(u, 0.62, 0.8));
      if (u >= 0.14) landed++;
    });
    if (bnote) op(bnote, phase(p, 0.94, 1));
    told.b = landed; // estimates standing at their measured values
  }

  // The replay: a brighter band crossing the colliding cells along a diagonal.
  // It lights cells that already stand; it adds and removes nothing.
  let glintKey = "";
  const light = (head: number) => {
    const a = Math.max(0, head - GLINT), b = Math.min(G.c.hit, head);
    const key = a < b ? `${a}:${b}` : "";
    if (key === glintKey) return;
    glintKey = key;
    glint.setAttribute("d", key ? cellsD.slice(offsets[a], offsets[b]) : "M0 0");
  };

  // (c) All 165 cells arrive together, colliding and disjoint already in their
  // colours, then the count and the legend. After that the replay's highlight
  // crosses the finished grid once with the scroll.
  const GRID = 0.2, RUN: Beat = [0.42, 0.94];
  let storyHead = 0;
  function renderC(p: number) {
    op(cells, phase(p, 0.04, GRID));
    op(count, phase(p, GRID, 0.3));
    const legend = phase(p, 0.3, 0.42);
    op(cleg, legend);
    if (cstat) op(cstat, legend);
    const run = phase(p, RUN[0], RUN[1]);
    storyHead = run > 0 && run < 1 ? Math.floor(run * (G.c.hit + GLINT)) : 0;
    light(storyHead);
    told.c = p >= GRID; // the grid stands
  }

  // Each panel is redrawn only when its own stretch of the story has moved.
  let la = -1, lb = -1, lc = -1;
  /** The scroll story at progress p. Returns the line for the plate readout. */
  function render(p: number): string {
    const pa = phase(p, G.beats.a[0], G.beats.a[1]);
    const pb = phase(p, G.beats.b[0], G.beats.b[1]);
    const pc = phase(p, G.beats.c[0], G.beats.c[1]);
    if (pa !== la) renderA((la = pa));
    if (pb !== lb) renderB((lb = pb));
    if (pc !== lc) renderC((lc = pc));
    done.a = pa >= 1;
    done.b = pb >= 1;
    done.c = pc >= 1;
    // The readout holds the latest thing the story has shown. A later panel
    // takes it over only once it has a number of its own on the plate.
    const S = G.story;
    if (told.c) return S.cDone;
    if (told.b) return told.b === 2 ? S.bBoth : S.bOne;
    return told.a ? S.aDone : pa > 0 ? S.a : S.idle;
  }

  // Ambient: once the story has played, the replay keeps running, crossing
  // the finished grid every few seconds.
  let clock = 0, running = false;
  function ambient(dt: number, active: boolean) {
    if (!active) {
      // Hand the highlight back to the scroll story, which has none at its end.
      if (running) light(storyHead);
      running = false;
      clock = 0;
      return;
    }
    running = true;
    clock = (clock + dt) % 6.4;
    light(Math.floor((clock / 3.6) * (G.c.hit + GLINT)));
  }

  /** Which group of cells is under the pointer: 0 colliding, 1 disjoint, -1 neither. */
  function cellGroup(e: PointerEvent): -1 | 0 | 1 {
    const m = svg.getScreenCTM();
    if (!m) return -1;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const c = Math.floor((pt.x - G.c.x0 + (G.c.pitch - C) / 2) / G.c.pitch);
    const r = Math.floor((pt.y - G.c.top + (G.c.pitch - C) / 2) / G.c.pitch);
    if (c < 0 || r < 0 || c >= G.c.cols || r >= G.c.rows) return -1;
    return r * G.c.cols + c < G.c.hit ? 0 : 1;
  }

  function mark(pick: Pick) {
    svg.classList.toggle("focus", !!pick && pick.p !== "c");
    svg.classList.toggle("g-hit", !!pick && pick.p === "c" && pick.i === 0);
    svg.classList.toggle("g-off", !!pick && pick.p === "c" && pick.i === 1);
    arows.forEach((r, i) => r.g.classList.toggle("on", !!pick && pick.p === "a" && pick.i === i));
    brows.forEach((r, i) => r.g.classList.toggle("on", !!pick && pick.p === "b" && pick.i === i));
    ocall.classList.toggle("on", !!pick && pick.p === "a");
  }

  /** A panel can be read only once the story has drawn it. */
  const ready = (panel: "a" | "b" | "c") => done[panel];

  // The hit targets sit in their own layer, in reading order: the rows of (a)
  // and (b), then the two groups of cells by way of their legend. Each carries
  // the line it reads out, written with the data in the component.
  const hits: Hit[] = qa<SVGRectElement>(svg, ".hits .hit[data-p]").map((hit) => {
    const i = Number(hit.dataset.i);
    return { hit, k: hit.dataset.p === "c" ? { p: "c", i: i ? 1 : 0 } : { p: hit.dataset.p as "a" | "b", i } };
  });
  const lines = new Map(hits.map((h) => [`${h.k.p}${h.k.i}`, h.hit.dataset.say ?? ""]));
  return { svg, G, render, ambient, cellGroup, mark, ready, hits, lines, keys: hits.filter((h) => h.hit.hasAttribute("tabindex")), grid: q<SVGRectElement>(svg, ".hits .grid") };
}

export default function (root: HTMLElement) {
  const svgs = qa<SVGSVGElement>(root, "svg.ov"); // side by side, then stacked
  type View = ReturnType<typeof bind>;
  const readout = root.querySelector<HTMLElement>("[data-readout]");
  let line = readout?.textContent ?? ""; // what the readout holds, so it is never read back
  const say = (s: string) => {
    if (!readout || s === line) return;
    readout.textContent = line = s;
  };

  let p = 0;
  let pe = 0; // the story's progress as drawn: the scroll's, or pushed on to the end by the keyboard
  let story = "";
  let pick: Pick = null;
  const same = (a: Pick, b: Pick) => (!a || !b ? a === b : a.p === b.p && a.i === b.i);

  // Keyboard. A part is read only once its mark is drawn, and a reader who
  // arrives by Tab can be anywhere in the scroll story, so keyboard focus
  // finishes the drawing first (force runs the story on to its end).
  const force = { v: 0 };
  let kb: { v: View; k: NonNullable<Pick>; said: boolean; hit: SVGRectElement } | null = null;
  let held: Pick = null; // Enter or Space holds a reading after focus moves on
  // One Tab stop per figure: a roving tabindex. The part last focused (the
  // first, to begin with) is the stop; arrow keys, Home and End move between
  // the parts, and Tab or Shift+Tab leaves the figure.
  let cur = 0;
  const announcer = document.createElement("p");
  announcer.className = "sr-only";
  announcer.setAttribute("aria-live", "polite");
  root.append(announcer);
  let liveTimer = 0;
  const announce = (text: string) => {
    clearTimeout(liveTimer);
    liveTimer = window.setTimeout(() => (announcer.textContent = text), 250);
  };

  // Only the layout on screen is wired, drawn and written to. Which one that
  // is follows the plate's width, so it is measured when the plate is resized
  // and never per frame; the other layout is caught up when it takes over.
  const views: (View | undefined)[] = [];
  let live!: View;
  function adopt(): boolean {
    const i = Math.max(0, svgs.findIndex((s) => s.getBoundingClientRect().width > 0));
    if (live && live.svg === svgs[i]) return false;
    const fresh = !views[i];
    live = views[i] ??= bind(svgs[i]);
    if (fresh) wire(live);
    return true;
  }
  const rove = () => {
    for (const v of views) v?.keys.forEach((h, i) => h.hit.setAttribute("tabindex", v === live && i === cur ? "0" : "-1"));
  };
  /** What a picked part reads out. */
  const describe = (k: NonNullable<Pick>) => live.lines.get(`${k.p}${k.i}`) ?? "";

  let timer = 0;
  function set(next: Pick) {
    clearTimeout(timer);
    if (same(pick, next)) return;
    pick = next;
    live.mark(pick);
    say(pick ? describe(pick) : story);
  }
  /** What shows when the pointer leaves: a held reading, else the focused part, else the story. */
  const rest = (): Pick => held ?? (kb && kb.v.ready(kb.k.p) ? kb.k : null);

  function render() {
    pe = p + (1 - p) * force.v;
    story = live.render(pe);
    // The focused part reads out as soon as its mark exists.
    if (kb && !kb.said && kb.v.ready(kb.k.p)) {
      kb.said = true;
      set(kb.k);
      announce(describe(kb.k));
    }
    say(pick ? describe(pick) : story);
  }
  const finish = (on: boolean) => gsap.to(force, { v: on ? 1 : 0, duration: 0.5, ease: "power2.out", overwrite: true, onUpdate: render });

  // The scroll story is bound to whichever layout is showing. Side by side,
  // it ends as the plate reaches mid-screen. Stacked, the plate can be taller
  // than the screen, so it runs until the plate's foot has come into view.
  let tl: ReturnType<typeof scrubbed> | null = null;
  let bound = "";
  function drive() {
    const stacked = live.svg === svgs[1];
    const mode = stacked ? "stacked" : "wide";
    if (mode === bound) return;
    bound = mode;
    tl?.scrollTrigger?.kill();
    tl?.kill();
    const clock = { p: 0 };
    tl = scrubbed(root, stacked ? { start: "top 80%", end: "bottom 86%" } : { start: "top 85%", end: "center 45%" });
    tl.to(clock, { p: 1, duration: 1, ease: "none" });
    tl.eventCallback("onUpdate", () => {
      p = clock.p;
      render();
    });
  }

  const press = () => {
    for (const v of views) v?.keys.forEach((h) => h.hit.setAttribute("aria-pressed", String(!!held && same(held, h.k))));
  };
  // A finger lifts at once, so its reading stays up for a moment.
  const linger = () => { timer = window.setTimeout(() => set(rest()), 2600); };

  // Pointer, touch or keyboard: a row or a group of cells writes its exact numbers to the readout.
  function wire(v: View) {
    v.svg.dataset.live = "";
    v.svg.setAttribute("aria-label", "Plot. Arrow keys move through its parts.");
    // Every hit target answers to the pointer, and the plate readout takes over from its tooltip.
    v.hits.forEach(({ hit, k }) => {
      hit.querySelector("title")?.remove();
      hit.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && v.ready(k.p) && set(k));
      hit.addEventListener("pointerleave", (e) => e.pointerType === "mouse" && set(rest()));
      hit.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" || !v.ready(k.p)) return;
        if (same(pick, k)) set(rest());
        else { set(k); linger(); }
      });
    });
    // The keyboard's parts: served as labelled graphics, now buttons.
    v.keys.forEach(({ hit, k }, n) => {
      hit.setAttribute("role", "button");
      hit.setAttribute("aria-pressed", String(!!held && same(held, k)));
      // Focus does what hover does. A click also focuses, and is left to the pointer.
      const focused = () => {
        cur = n;
        rove();
        if (!hit.matches(":focus-visible")) return;
        kb = { v, k, said: false, hit };
        finish(true);
        render();
      };
      hit.addEventListener("focus", focused);
      // A reader can Tab onto a part before this script has loaded.
      if (document.activeElement === hit) focused();
      hit.addEventListener("blur", () => {
        // Only the keyboard's own reading goes with the focus. A tap or a click
        // moves focus too, and by then it has already picked something else.
        const mine = kb;
        if (!mine || mine.hit !== hit) return;
        kb = null;
        if (same(pick, mine.k)) set(rest());
      });
      hit.addEventListener("keydown", (e) => {
        const to = (m: number) => {
          e.preventDefault();
          cur = Math.max(0, Math.min(v.keys.length - 1, m));
          rove();
          v.keys[cur].hit.focus();
        };
        switch (e.key) {
          case "Enter":
          case " ":
            // Hold this reading, or let it go: what a tap does.
            e.preventDefault();
            if (!v.ready(k.p)) return;
            held = held && same(held, k) ? null : k;
            press();
            set(k);
            if (!held && !kb) finish(false);
            break;
          case "Escape":
            held = null;
            press();
            break;
          case "ArrowDown":
          case "ArrowRight": to(n + 1); break;
          case "ArrowUp":
          case "ArrowLeft": to(n - 1); break;
          case "Home": to(0); break;
          case "End": to(v.keys.length - 1); break;
        }
      });
    });

    // The grid itself: whichever group of cells is under the pointer.
    let pending: PointerEvent | null = null;
    const read = () => {
      const e = pending;
      pending = null;
      if (!e) return;
      const g = v.ready("c") ? v.cellGroup(e) : -1;
      set(g === -1 ? rest() : { p: "c", i: g });
      if (g !== -1 && e.pointerType !== "mouse") linger();
    };
    const onGrid = (e: PointerEvent) => {
      if (!pending) requestAnimationFrame(read);
      pending = e;
    };
    v.grid.addEventListener("pointermove", onGrid);
    v.grid.addEventListener("pointerdown", onGrid);
    v.grid.addEventListener("pointerleave", (e) => {
      // A finger leaves the moment it lifts; its tap is still waiting to be read.
      if (e.pointerType !== "mouse") return;
      pending = null;
      set(rest());
    });
  }

  adopt();
  rove();
  drive();
  render();
  new ResizeObserver(() => {
    if (!adopt()) return;
    // The other layout takes over: it is drawn at the story's present, and the scroll rebinds to it.
    kb = null;
    live.mark(pick);
    rove();
    drive();
    render();
  }).observe(q<HTMLElement>(root, ".ov-box"));

  whileVisible(root, (dt) => live.ambient(dt, pe >= live.G.beats.c[1] - 0.001 && !(pick && pick.p === "c")));

  // Leaving the figure lets the scroll story take the drawing back, unless a reading is held.
  root.addEventListener("focusout", (e) => {
    if (!held && !root.contains(e.relatedTarget as Node | null)) finish(false);
  });
}
