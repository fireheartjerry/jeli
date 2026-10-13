import { gsap, scrubbed, phase, q, qa, whileVisible } from "../motion";

type Beat = [number, number];
type Beats = { a: Beat; b: Beat; c: Beat };
interface RowG {
  /** How far it is from the constant, as a share of the farthest policy: 0 for one that sits on the constant. Sets the order of arrival only. */
  t: number;
  ref: boolean; tie: boolean; oracle: boolean;
  /** Depth rows carry the interval of their difference from the constant; excl marks the one that excludes zero. */
  diff: boolean; excl: boolean;
  /** The plate readout for this row, with its interval. */
  say: string;
}
interface Geo {
  beats: Beats | null; stack: Beats[] | null;
  charts: { rows: RowG[]; note: number | null; cells: { pitch: number; x0: number } }[];
  picks: number; picksSay: string;
  /** The plate readout's lines for the scroll story. Every number in them is written with the data, in the component. */
  story: { start: string; refs: string; ref: [string, string]; lead: string; first: string; excl: string; stay: string };
}

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
/** An attribute. */
const at = (el: Element, name: string, value: string) => {
  const s = slot(el);
  if (s[name] === value) return;
  s[name] = value;
  el.setAttribute(name, value);
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

type Pick = { c: number; i: number } | "picks" | null;
type Hit = { hit: SVGRectElement; k: NonNullable<Pick> };

/** What a picked part reads out. The lines are written with the data, in the component. */
const describe = (G: Geo, k: NonNullable<Pick>) => (k === "picks" ? G.picksSay : G.charts[k.c].rows[k.i].say);

/** Wire one layout. Everything positional comes from that layout's own geometry. */
function bind(svg: SVGSVGElement) {
  const G: Geo = JSON.parse(svg.dataset.g!);

  const charts = qa<SVGGElement>(svg, ".chart").map((g, ci) => {
    const d = G.charts[ci];
    const ref = q<SVGLineElement>(g, ":scope > .ref");
    const refLen = Number(ref.getAttribute("y2")) - Number(ref.getAttribute("y1"));
    ref.style.strokeDasharray = `${refLen} ${refLen}`;
    let whiskers = 0;
    const rows = qa<SVGGElement>(g, ".row").map((el, i) => ({
      el, d: d.rows[i],
      rl: q<SVGTextElement>(el, ".rl"), stem: q<SVGLineElement>(el, ".stem"), dot: q<SVGCircleElement>(el, ".dot"),
      rv: el.querySelector<SVGTextElement>(".rv"), dv: el.querySelector<SVGTextElement>(".dv"),
      // A stem's length, a marker's place and an interval's ends are the server's and are never written.
      iv: el.querySelector<SVGGElement>(".iv"), gap: el.querySelector<SVGLineElement>(".gap"),
      // Intervals are shown one after another, top to bottom.
      wi: d.rows[i].diff ? whiskers++ : -1,
      shown: 0, // how far its stem and marker have come up
    }));
    const tieb = g.querySelector<SVGGElement>(".tieb");
    const brk = tieb?.querySelector<SVGPathElement>(".brk") ?? null;
    const note = g.querySelector<SVGGElement>(".foot.note");
    const picks = g.querySelector<SVGGElement>(".foot.picks");
    return {
      g, d, ref, refLen, rows, tieb, brk, whiskers,
      la: -1, lb: -1, lc: -1, // the beats as last drawn
      clear: 0, // how far the dotted gap has taken over from the stem
      colh: g.querySelector<SVGTextElement>(".colh"),
      tieText: tieb ? qa<SVGTextElement>(tieb, "text") : [],
      otag: g.querySelector<SVGGElement>(".otag"),
      otagText: g.querySelector<SVGTextElement>(".otag text"),
      note: note && { g: note, body: q<SVGGElement>(note, ".nb") },
      picks: picks && { g: picks, fl: q<SVGTextElement>(picks, ".fl"), fv: q<SVGTextElement>(picks, ".fv"), strip: q<SVGGElement>(picks, ".strip"), scan: q<SVGRectElement>(picks, ".scan") },
    };
  });
  type Chart = (typeof charts)[number];
  type Row = Chart["rows"][number];

  // Every readable state is true. A mark whose length, position or count
  // encodes a measurement is never grown, moved or filled in: its geometry is
  // the server's and is never written, and it appears whole, by opacity. That
  // goes for every stem (its length is the difference from the constant), every
  // marker and interval, the tie bracket and the strip of 39 picks. A number is
  // shown once its mark is fully shown, and nothing is counted on screen. Only
  // structure is drawn on: the constant, a vertical reference.

  // a. The constant is drawn first, then marked and named.
  const REF_DONE = 0.85;
  function beatA(c: Chart, pa: number) {
    draw(c.ref, c.refLen, phase(pa, 0, 0.55));
    c.rows.forEach((r, i) => {
      op(r.rl, phase(pa, 0.08 + i * 0.06, 0.26 + i * 0.06));
      if (!r.d.ref) return;
      op(r.dot, phase(pa, 0.55, 0.7));
      if (r.rv) op(r.rv, phase(pa, 0.7, REF_DONE));
    });
  }

  // b. Each policy comes up whole, its stem at full length with its marker at
  // the end, then its value. The nearest to the constant come first, so a
  // policy that ties it is marked on the line before any stem shows.
  const FIRST = 0.05, SPREAD = 0.7, LAND = 0.1;
  const lands = (r: Row) => (r.d.t ? FIRST + SPREAD * r.d.t : 0);
  // The stem of the one interval that excludes zero later gives way to a dotted gap.
  const stem = (c: Chart, r: Row) => op(r.stem, r.d.t ? r.shown * (1 - (r.gap ? c.clear : 0)) : 0);
  function beatB(c: Chart, pb: number) {
    for (const r of c.rows) {
      if (r.d.ref) { stem(c, r); continue; }
      const here = lands(r);
      r.shown = phase(pb, here, here + LAND);
      stem(c, r);
      op(r.dot, r.shown);
      if (r.rv) op(r.rv, phase(pb, here + LAND, here + 2 * LAND));
    }
  }

  // c. What each chart turns on. Depth: the interval of each difference, whole,
  // then its numbers. Return: the tie, then the router's picks, all at once.
  const W_START = 0.04, W_STEP = 0.06, W_FADE = 0.1;
  const TIED = 0.2, GAPPED = 0.66, FILLED = 0.86, TALLIED = 0.96;
  function beatC(c: Chart, pc: number) {
    if (c.colh) op(c.colh, phase(pc, 0, 0.1));
    for (const r of c.rows) {
      if (r.iv) {
        const from = W_START + r.wi * W_STEP;
        op(r.iv, phase(pc, from, from + W_FADE));
        if (r.dv) op(r.dv, phase(pc, from + W_FADE, from + 2 * W_FADE));
      } else if (r.dv) {
        op(r.dv, phase(pc, W_START, W_START + W_FADE)); // the reference row's own note
      }
      // Where an interval stops short of the constant, the stem gives way to a
      // dotted gap: what is left between the whisker and the line.
      if (r.gap) {
        c.clear = phase(pc, 0.56, GAPPED);
        op(r.gap, c.clear);
        stem(c, r);
      }
    }
    if (c.otagText) op(c.otagText, phase(pc, 0, 0.2));
    if (c.brk) {
      // The bracket spans the three tied policies, so it is shown whole, then labelled.
      op(c.brk, phase(pc, 0.05, TIED));
      c.tieText.forEach((t, i) => op(t, phase(pc, TIED + i * 0.05, TIED + 0.12 + i * 0.05)));
    }
    if (c.note) op(c.note.body, phase(pc, GAPPED, 0.84));
    if (c.picks) {
      const k = c.picks;
      op(k.fl, phase(pc, 0.56, 0.68));
      // The 39 picks arrive together, every one of them the single agent; then their tally.
      op(k.strip, phase(pc, 0.72, FILLED));
      op(k.fv, phase(pc, FILLED, TALLIED));
    }
  }

  // What the story has finished drawing: each chart's rows, and the picks strip.
  const st = { rows: [false, false], picks: false };
  const depth = charts[0], pk = charts[1].picks!;
  // When the best policy's stem and marker, and then its interval, are fully shown.
  const LEAD_AT = lands(depth.rows[0]) + LAND, OPEN_AT = W_START + 2 * W_FADE;
  const ROWS_AT = W_START + (depth.whiskers - 1) * W_STEP + 2 * W_FADE;

  /** The scroll story at progress p. Returns the line for the plate readout. */
  function render(p: number): string {
    const ph = (b: Beats) => [phase(p, b.a[0], b.a[1]), phase(p, b.b[0], b.b[1]), phase(p, b.c[0], b.c[1])] as const;
    // Side by side, both charts keep one time. Stacked, each plays as it scrolls in.
    const first = ph(G.beats ?? G.stack![0]), second = G.beats ? first : ph(G.stack![1]);
    charts.forEach((c, ci) => {
      const [pa, pb, pc] = ci ? second : first;
      // Each beat is redrawn only when it has moved.
      if (pa !== c.la) beatA(c, (c.la = pa));
      if (pb !== c.lb) beatB(c, (c.lb = pb));
      if (pc !== c.lc) beatC(c, (c.lc = pc));
    });
    const [a0, b0, c0] = first, [a1, b1, c1] = second;
    st.rows[0] = c0 >= ROWS_AT;
    st.rows[1] = b1 >= 1;
    st.picks = c1 >= TALLIED;

    // The readout holds the latest thing the story has shown, and moves on
    // only once the next number is on the plate: the 39 picks, the interval
    // that excludes zero and its gap, the best policy's interval, its value,
    // the constant.
    const S = G.story;
    if (c1 >= FILLED) return G.picksSay;
    if (!G.beats) {
      // Stacked, the second chart follows the first: its tie, then its constant.
      if (b1 >= 1) return S.stay;
      if (a1 >= REF_DONE) return S.ref[1];
    }
    if (c0 >= GAPPED) return S.excl;
    if (c0 >= OPEN_AT) return S.first;
    if (b0 >= LEAD_AT) return S.lead;
    if (a0 >= REF_DONE) return G.beats ? S.refs : S.ref[0];
    return S.start;
  }

  // Ambient: the router keeps being asked, task by task, and keeps giving the
  // same answer. A cursor walks the 39 held-out tasks.
  const C = G.charts[1].cells;
  const PASS = (G.picks - 1) / 9; // seconds to walk the row at nine tasks a second
  let clock = 0, scanning = false;
  function ambient(dt: number, active: boolean) {
    if (!active) {
      if (scanning) at(pk.scan, "opacity", "0");
      scanning = false;
      clock = 0;
      return;
    }
    scanning = true;
    clock = (clock + dt) % (PASS + 1.6);
    const u = clock / PASS;
    if (u > 1) {
      at(pk.scan, "opacity", "0"); // it rests before the next pass
      return;
    }
    at(pk.scan, "x", (C.x0 - 2 + u * (G.picks - 1) * C.pitch).toFixed(2));
    at(pk.scan, "opacity", Math.min(1, u * 14, (1 - u) * 14).toFixed(2));
  }

  function mark(pick: Pick) {
    svg.classList.toggle("focus", !!pick);
    charts.forEach((c, ci) => {
      let tie = false, oracle = false, noted = false;
      c.rows.forEach((r, i) => {
        const on = !!pick && typeof pick === "object" && pick.c === ci && pick.i === i;
        r.el.classList.toggle("on", on);
        if (on && r.d.tie) tie = true;
        if (on && r.d.oracle) oracle = true;
        if (on && c.d.note === i) noted = true;
      });
      c.tieb?.classList.toggle("on", tie || pick === "picks");
      c.otag?.classList.toggle("on", oracle);
      c.note?.g.classList.toggle("on", noted);
      c.picks?.g.classList.toggle("on", pick === "picks");
    });
  }
  /** A part can be read only once the story has drawn it. */
  const ready = (k: NonNullable<Pick>) => (k === "picks" ? st.picks : st.rows[k.c]);

  // The hit targets sit in their own layer, in reading order. The depth note
  // carries its row's key, so it reads out as that row.
  const hits: Hit[] = qa<SVGRectElement>(svg, ".hits .hit").map((hit) => ({
    hit, k: hit.dataset.k === "picks" ? "picks" : { c: Number(hit.dataset.c), i: Number(hit.dataset.i) },
  }));
  return { svg, G, render, ambient, mark, ready, st, hits, keys: hits.filter((h) => h.hit.hasAttribute("tabindex")) };
}

export default function (root: HTMLElement) {
  const svgs = qa<SVGSVGElement>(root, "svg.ro"); // side by side, then stacked
  type View = ReturnType<typeof bind>;
  const readout = root.querySelector<HTMLElement>("[data-readout]");
  let line = readout?.textContent ?? ""; // what the readout holds, so it is never read back
  const say = (s: string) => {
    if (!readout || s === line) return;
    readout.textContent = line = s;
  };

  let p = 0;
  let story = "";
  let pick: Pick = null;
  const same = (a: Pick, b: Pick) => (a && b && typeof a === "object" && typeof b === "object" ? a.c === b.c && a.i === b.i : a === b);

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

  let timer = 0;
  function set(next: Pick) {
    clearTimeout(timer);
    if (same(pick, next)) return;
    pick = next;
    live.mark(pick);
    say(pick ? describe(live.G, pick) : story);
  }
  /** What shows when the pointer leaves: a held reading, else the focused part, else the story. */
  const rest = (): Pick => held ?? (kb && kb.v.ready(kb.k) ? kb.k : null);

  function render() {
    story = live.render(p + (1 - p) * force.v);
    // The focused part reads out as soon as its mark exists.
    if (kb && !kb.said && kb.v.ready(kb.k)) {
      kb.said = true;
      set(kb.k);
      announce(describe(live.G, kb.k));
    }
    say(pick ? describe(live.G, pick) : story);
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

  // Pointer, touch or keyboard: a row or a footer writes its exact numbers to the readout.
  function wire(v: View) {
    v.svg.dataset.live = "";
    v.svg.setAttribute("aria-label", "Plot. Arrow keys move through its parts.");
    // Every hit target answers to the pointer, and the plate readout takes over from its tooltip.
    v.hits.forEach(({ hit, k }) => {
      hit.querySelector("title")?.remove();
      hit.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && v.ready(k) && set(k));
      hit.addEventListener("pointerleave", (e) => e.pointerType === "mouse" && set(rest()));
      hit.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" || !v.ready(k)) return;
        if (same(pick, k)) return set(rest());
        set(k);
        // A finger lifts at once, so its reading stays up for a moment.
        timer = window.setTimeout(() => set(rest()), 2600);
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
            if (!v.ready(k)) return;
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
  }).observe(q<HTMLElement>(root, ".ro-box"));

  // The cursor walks only in the layout on screen, and only while the plate is.
  whileVisible(root, (dt) => live.ambient(dt, live.st.picks && pick !== "picks"));

  // Leaving the figure lets the scroll story take the drawing back, unless a reading is held.
  root.addEventListener("focusout", (e) => {
    if (!held && !root.contains(e.relatedTarget as Node | null)) finish(false);
  });
}
