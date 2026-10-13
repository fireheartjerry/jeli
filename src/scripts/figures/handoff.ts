import { gsap, scrubbed, phase, q, qa, whileVisible } from "../motion";

type Beat = [number, number];
type XY = [number, number];
type Key = "A" | "B" | "C" | "D" | "P";
interface Geo {
  beats: { t: Beat; k: Beat; p: Beat };
  trees: { id: "B" | "C"; edges: { len: number; lv: number; a: XY; b: XY }[]; stub: { len: number; a: XY; b: XY } }[];
  side: number; dot: number;
  /** What a picked part reads out. */
  say: Record<Key, string>;
  /** The plate readout's lines for the scroll story. Every number in them is written with the data, in the component. */
  story: { trees: string; writers: string; costA: string; costs: string; power: string; est: string; ci: string };
}

const NS = "http://www.w3.org/2000/svg";
const SPEED = 0.36; // edge lengths per second, the same for patches and findings

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
/** How far a tree's writers are filled in, 0 to 1 (the component's CSS mixes the fill from it). */
const fillIn = (el: SVGElement, v: number) => {
  const s = slot(el), n = Math.round(v * 1000);
  if (s.w === n) return;
  s.w = n;
  el.style.setProperty("--w", String(n / 1000));
};
/** A stroke drawn on along its own length: u from 0 (nothing) to 1 (all of it). `back` draws it from its far end. */
const draw = (el: SVGElement, len: number, u: number, back = false) => {
  const s = slot(el), n = Math.round(len * (1 - u) * 100) * (back ? -1 : 1);
  if (s.d !== n) {
    s.d = n;
    el.style.strokeDashoffset = String(n / 100);
  }
  op(el, u > 0 ? 1 : 0); // a round cap paints a dot at zero length
};

/** Wire one layout. Everything positional comes from that layout's own geometry. */
function bind(svg: SVGSVGElement) {
  const G: Geo = JSON.parse(svg.dataset.g!);

  // ---- trees ----
  const trees = qa<SVGGElement>(svg, ".tree").map((g, ti) => {
    const d = G.trees[ti];
    const edges = qa<SVGPathElement>(g, ".edge");
    edges.forEach((e, i) => (e.style.strokeDasharray = `${d.edges[i].len} ${d.edges[i].len}`));
    const stub = q<SVGPathElement>(g, ".stub");
    stub.style.strokeDasharray = `${d.stub.len} ${d.stub.len}`;
    const nodes = qa<SVGCircleElement>(g, ".nd");
    return {
      g, d, edges, stub, nodes,
      vf: q<SVGGElement>(g, ".vf"), call: q<SVGGElement>(g, ".call"), halo: g.querySelector<SVGCircleElement>(".halo"),
      arm: q<SVGTextElement>(g, ".arm"), ret: q<SVGGElement>(g, ".ret"), pk: q<SVGGElement>(g, ".pk"),
    };
  });
  const foot = q<SVGTextElement>(svg, ".foot");

  // ---- cost ----
  const crows = qa<SVGGElement>(svg, ".crow").map((g) => ({
    g, bar: q<SVGRectElement>(g, ".bar"), cv: q<SVGTextElement>(g, ".cv"), al: q<SVGTextElement>(g, ".al"),
  }));
  const dcost = q<SVGGElement>(svg, ".dcost");
  const dmark = qa<SVGElement>(dcost, ".dim, .dimh");
  const dl = q<SVGTextElement>(dcost, ".dl");

  // ---- contrast. Its positions are the server's and are never written. ----
  const con = q<SVGGElement>(svg, ".con");
  const band = q<SVGRectElement>(con, ".band");
  const brk = q<SVGPathElement>(con, ".brk");
  const brl = q<SVGTextElement>(con, ".brl");
  const bres = qa<SVGTextElement>(con, ".bre");
  const iv = q<SVGGElement>(con, ".iv");
  const pt = q<SVGCircleElement>(con, ".pt");
  const nv = q<SVGTextElement>(con, ".nv");
  const nlo = q<SVGTextElement>(con, ".nlo");
  const nhi = q<SVGTextElement>(con, ".nhi");
  const np = q<SVGTextElement>(con, ".np");
  const verdict = q<SVGTextElement>(con, ".verdict");

  const st = { flowing: false, done: { t: false, k: false, d: false, p: false } };
  // What the story has to say so far, for the plate readout.
  const told = { writers: false, cost: 0, con: 0 };

  // Every readable state is true. A mark whose length, position or count
  // encodes a measurement is never grown, moved or filled in: its geometry is
  // the server's and is never written, and it appears whole, by opacity. That
  // goes for the seven nodes of each tree, the cost bars, the estimate, its
  // interval and the bracket. A number is shown once its mark is fully shown.
  // Only structure is drawn on: the edges between nodes that already stand.

  function renderTrees(p: number) {
    const nodes = phase(p, 0, 0.1);
    trees.forEach((t) => {
      // All seven nodes arrive together, so the tree never passes through a smaller one.
      for (const n of t.nodes) op(n, nodes);
      // The root hands its patch to the verifier in both arms.
      draw(t.stub, t.d.stub.len, phase(p, 0.08, 0.18));
      op(t.vf, phase(p, 0.12, 0.2));
      // Edges are stored child to parent, and are drawn from the root down.
      t.edges.forEach((e, i) => {
        const { len, lv } = t.d.edges[i];
        draw(e, len, lv === 0 ? phase(p, 0.1, 0.28) : phase(p, 0.28, 0.48), true);
      });
      op(t.arm, phase(p, 0.08, 0.2));
      op(t.ret, phase(p, 0.5, 0.6));
      // Who may change the delivered code: every node in B, the root alone in C.
      // They fill in with the scroll, and their count is printed once they are full.
      fillIn(t.g, phase(p, 0.54, 0.62));
      if (t.halo) op(t.halo, phase(p, 0.62, 0.72));
      op(t.call, phase(p, 0.66, 0.78));
    });
    op(foot, phase(p, 0.84, 1));
    st.flowing = p >= 0.5;
    st.done.t = p >= 0.78;
    told.writers = p >= 0.66;
  }

  // Each bar appears whole, at its full measured length, one arm after
  // another, and each is followed by its dollar figure.
  const ARM = 0.2, BAR = 0.14, NAME = 0.1;
  const stands = (i: number) => 0.12 + i * ARM + BAR; // when arm i's bar is fully shown
  function renderCost(p: number) {
    crows.forEach((r, i) => {
      op(r.al, phase(p, i * 0.03, 0.1 + i * 0.03));
      op(r.bar, phase(p, stands(i) - BAR, stands(i)));
      op(r.cv, phase(p, stands(i), stands(i) + NAME));
    });
    // The difference: its dimension between the two bar ends first, then its number.
    const dim = phase(p, 0.8, 0.88);
    for (const el of dmark) op(el, dim);
    op(dl, phase(p, 0.88, 1));
    st.done.k = p >= stands(2) + NAME;
    st.done.d = p >= 1;
    told.cost = p >= stands(2) ? 2 : p >= stands(0) ? 1 : 0; // the single agent's bar stands, then all three
  }

  function renderContrast(p: number) {
    // The bracket is shown whole, then labelled.
    const mark = phase(p, 0.04, 0.2);
    op(band, mark);
    op(brk, mark);
    const named = phase(p, 0.2, 0.32);
    op(brl, named);
    for (const b of bres) op(b, named);
    // The estimate appears at its measured value, then its number; the interval
    // appears whole, then its ends are labelled.
    op(pt, phase(p, 0.36, 0.44));
    op(nv, phase(p, 0.44, 0.52));
    op(iv, phase(p, 0.52, 0.66));
    const ends = phase(p, 0.66, 0.76);
    op(nlo, ends);
    op(nhi, ends);
    op(np, phase(p, 0.78, 0.88));
    op(verdict, phase(p, 0.88, 1));
    st.done.p = p >= 0.88;
    told.con = p >= 0.66 ? 3 : p >= 0.44 ? 2 : p >= 0.2 ? 1 : 0; // the bracket, the estimate, its interval
  }

  // Each part is redrawn only when its own stretch of the story has moved.
  let lt = -1, lk = -1, lp = -1;
  /** The scroll story at progress p. Returns the line for the plate readout. */
  function render(p: number): string {
    const pt_ = phase(p, G.beats.t[0], G.beats.t[1]);
    const pk = phase(p, G.beats.k[0], G.beats.k[1]);
    const pp = phase(p, G.beats.p[0], G.beats.p[1]);
    if (pt_ !== lt) renderTrees((lt = pt_));
    if (pk !== lk) renderCost((lk = pk));
    if (pp !== lp) renderContrast((lp = pp));
    // The readout holds the latest thing the story has shown: a later part
    // takes it over only once it has a number of its own on the plate.
    const S = G.story;
    if (told.con) return told.con === 3 ? S.ci : told.con === 2 ? S.est : S.power;
    if (told.cost) return told.cost === 2 ? S.costs : S.costA;
    return told.writers ? S.writers : S.trees;
  }

  // Ambient: handoffs keep travelling up every edge. Patches are squares and
  // findings are dots; the root's own patch goes on to the verifier in both
  // arms. The glyphs are made once, here, and after that only moved: every
  // edge is a straight line, so a position is plain arithmetic.
  const glyphs: { el: SVGElement; a: XY; b: XY; u: number }[] = [];
  trees.forEach((t) => {
    t.pk.replaceChildren(); // the still frame gives way to live handoffs
    const add = (patch: boolean, a: XY, b: XY, u: number) => {
      const el = document.createElementNS(NS, patch ? "rect" : "circle");
      el.setAttribute("class", patch ? "pk-patch" : "pk-find");
      if (patch) {
        el.setAttribute("x", String(-G.side / 2));
        el.setAttribute("y", String(-G.side / 2));
        el.setAttribute("width", String(G.side));
        el.setAttribute("height", String(G.side));
      } else {
        el.setAttribute("r", String(G.dot));
      }
      op(el, 0);
      t.pk.append(el);
      glyphs.push({ el, a, b, u });
    };
    const patch = t.d.id === "B";
    t.d.edges.forEach((e) => { add(patch, e.a, e.b, 0); add(patch, e.a, e.b, 0.5); });
    add(true, t.d.stub.a, t.d.stub.b, 0.25);
  });
  let flowed = false;
  function ambient(dt: number) {
    if (!st.flowing) {
      if (flowed) for (const g of glyphs) op(g.el, 0);
      flowed = false;
      return;
    }
    flowed = true;
    for (const g of glyphs) {
      g.u = (g.u + dt * SPEED) % 1;
      at(g.el, "transform", `translate(${(g.a[0] + (g.b[0] - g.a[0]) * g.u).toFixed(1)} ${(g.a[1] + (g.b[1] - g.a[1]) * g.u).toFixed(1)})`);
      // Fade in and out at the ends so a handoff never pops.
      op(g.el, Math.min(1, g.u * 8, (1 - g.u) * 8));
    }
  }

  function mark(k: Key | null) {
    svg.classList.toggle("focus", !!k);
    trees.forEach((t) => t.g.classList.toggle("on", k === t.d.id));
    crows.forEach((r, i) => r.g.classList.toggle("on", k === "ABC"[i] || (k === "D" && i > 0)));
    dcost.classList.toggle("on", k === "D");
    con.classList.toggle("on", k === "P");
  }
  /** A part can be read only once the story has drawn it. */
  const ready = (k: Key) => (k === "P" ? st.done.p : k === "D" ? st.done.d : k === "A" ? st.done.k : st.done.t && st.done.k);

  // The hit targets sit in their own layer, in reading order. A tree and its
  // cost row share a key; the row is the keyboard's part, the tree the pointer's.
  const hits = qa<SVGRectElement>(svg, ".hits .hit").map((hit) => ({ hit, k: hit.dataset.k as Key }));
  return { svg, G, render, ambient, mark, ready, hits, keys: hits.filter((h) => h.hit.hasAttribute("tabindex")) };
}

export default function (root: HTMLElement) {
  const svgs = qa<SVGSVGElement>(root, "svg.ho"); // side by side, then stacked
  type View = ReturnType<typeof bind>;
  const readout = root.querySelector<HTMLElement>("[data-readout]");
  let line = readout?.textContent ?? ""; // what the readout holds, so it is never read back
  const say = (s: string) => {
    if (!readout || s === line) return;
    readout.textContent = line = s;
  };

  let p = 0;
  let story = "";
  let pick: Key | null = null;

  // Keyboard. A part is read only once its mark is drawn, and a reader who
  // arrives by Tab can be anywhere in the scroll story, so keyboard focus
  // finishes the drawing first (force runs the story on to its end).
  const force = { v: 0 };
  let kb: { v: View; k: Key; said: boolean; hit: SVGRectElement } | null = null;
  let held: Key | null = null; // Enter or Space holds a reading after focus moves on
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
  function set(next: Key | null) {
    clearTimeout(timer);
    if (pick === next) return;
    pick = next;
    live.mark(pick);
    say(pick ? live.G.say[pick] : story);
  }
  /** What shows when the pointer leaves: a held reading, else the focused part, else the story. */
  const rest = (): Key | null => held ?? (kb && kb.v.ready(kb.k) ? kb.k : null);

  function render() {
    story = live.render(p + (1 - p) * force.v);
    // The focused part reads out as soon as its mark exists.
    if (kb && !kb.said && kb.v.ready(kb.k)) {
      kb.said = true;
      set(kb.k);
      announce(live.G.say[kb.k]);
    }
    say(pick ? live.G.say[pick] : story);
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
    for (const v of views) v?.keys.forEach((h) => h.hit.setAttribute("aria-pressed", String(held === h.k)));
  };

  // Pointer, touch or keyboard: a tree, a cost row or the contrast writes its exact numbers to the readout.
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
        if (pick === k) return set(rest());
        set(k);
        // A finger lifts at once, so its reading stays up for a moment.
        timer = window.setTimeout(() => set(rest()), 2600);
      });
    });
    // The keyboard's parts: served as labelled graphics, now buttons.
    v.keys.forEach(({ hit, k }, n) => {
      hit.setAttribute("role", "button");
      hit.setAttribute("aria-pressed", String(held === k));
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
        if (pick === mine.k) set(rest());
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
            held = held === k ? null : k;
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
  }).observe(q<HTMLElement>(root, ".ho-box"));

  // Handoffs travel only in the layout on screen, and only while the plate is.
  whileVisible(root, (dt) => live.ambient(dt));

  // Leaving the figure lets the scroll story take the drawing back, unless a reading is held.
  root.addEventListener("focusout", (e) => {
    if (!held && !root.contains(e.relatedTarget as Node | null)) finish(false);
  });
}
