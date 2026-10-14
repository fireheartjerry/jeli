import { gsap, scrubbed, whileVisible, phase, qa, q } from "../motion";

interface GA {
  L: number; R: number; T: number; B: number; vmax: number; peak: number;
  m: [string, number, number, number, number][]; // label, users, new, returning, engaged sessions
}
interface GB { x0: number; bw: number; e0: number; e1: number; emax: number; top: number; row: number; n: number; max: number }
interface GC {
  x0: number; x1: number; bar: number; bh: number; total: number;
  segs: [string, number][]; // name, sessions
  l0: number; l1: number; lmax: number; top: number; row: number;
  ch: [string, number, number, number][]; // name, sessions, average engagement (s), the segment it is counted in
  br: [string, number][]; bry: number; brh: number; brx0: number; brx1: number; brTotal: number;
}

const NS = "http://www.w3.org/2000/svg";
const fmt = new Intl.NumberFormat("en-US");
const dur = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`);
const pct = (n: number, d: number) => `${((n / d) * 100).toFixed(1)}%`;
const clamp = (v: number) => Math.max(0, Math.min(1, v));

// Each panel has its own story; all three keep these marks. A panel is finished
// by DONE, a little before its stretch of scroll ends.
const DONE = 0.9;
// The plate is let out from the top as it rises past a line a little above the
// foot of the window (reveal.ts). Each panel's story goes down the panel with
// it: a part is drawn once it is out from under that line.
const FOLD = 0.94;
/** Seconds of engagement that go by in one second of the replays below: a minute a second. */
const REPLAY = 60;

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
  const arrive = gsap.parseEase("arrive");
  const readout = root.querySelector<HTMLElement>("[data-readout]");
  const REST = readout?.textContent ?? "";

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
  const num = (el: Element, k: string) => Number(el.getAttribute(k));
  const mk = <E extends SVGElement>(tag: string, cls: string, parent: Element, before: Element | null = null) => {
    const el = document.createElementNS(NS, tag) as E;
    el.setAttribute("class", cls);
    parent.insertBefore(el, before);
    return el;
  };
  /** A straight line drawn from its first end. (Measured from its own numbers: one of the two charts in (a) is never laid out.) */
  const ruled = (el: SVGLineElement) => {
    const len = Math.hypot(num(el, "x2") - num(el, "x1"), num(el, "y2") - num(el, "y1"));
    el.style.strokeDasharray = `${len} ${len}`;
    return (u: number) => {
      css(el, "stroke-dashoffset", (len * (1 - u)).toFixed(2));
      op(el, u > 0 ? 1 : 0);
    };
  };

  // The header's readout is shared: what is under the pointer, else the month under the pen, else the total.
  const saying: (string | null)[] = [null, null];
  let dip = 1; // the month readings fade in from the total and back out to it (1 is fully there)
  const say = (slot: 0 | 1, v: string | null, level = dip) => {
    saying[slot] = v;
    dip = level;
    if (!readout) return;
    text(readout, saying[0] ?? saying[1] ?? REST);
    op(readout, saying[0] !== null ? 1 : dip);
  };

  /**
   * A panel's scrubbed story. It starts as the panel comes over the fold and is
   * over when the plate sits in the middle of the window, or when the panel's
   * own middle reaches 45% of it if that is sooner. A plate taller than the
   * window can never be seen whole, so there each panel keeps to its own middle.
   */
  function story(el: Element, from: number, render: (p: number) => void, place: (out: (part: Element) => number) => void) {
    const st = { p: 0 };
    const span = () => {
      const vh = window.innerHeight;
      const r = el.getBoundingClientRect(), all = root.getBoundingClientRect();
      const own = (from - 0.45) * vh + r.height / 2;
      const whole = all.top + all.height / 2 - r.top + (from - 0.47) * vh;
      return Math.max(180, all.height > vh ? own : Math.min(own, whole));
    };
    // Beats that belong to one part of the panel are placed when the page is measured:
    // `out(part)` is how far into this story the page is when that part comes out from under the fold.
    const measure = () => {
      const top = el.getBoundingClientRect().top, len = span(), vh = window.innerHeight;
      place((part) => (part.getBoundingClientRect().bottom - top - (FOLD - from) * vh) / len);
    };
    measure();
    scrubbed(el, {
      start: `top ${from * 100}%`,
      end: () => `+=${Math.round(span())}`,
      invalidateOnRefresh: true,
      onRefresh: () => { measure(); render(st.p); },
    }).to(st, { p: 1, duration: 1, onUpdate: () => render(st.p) });
    return st;
  }

  // ======================================================================
  // (a) Monthly users
  // ======================================================================
  // The chart's foot is the last of it out from under the fold, and the line starts there: the pen waits for it.
  const PEN = [0.3, 0.86];
  function monthly(svg: SVGSVGElement) {
    const G: GA = JSON.parse(svg.dataset.g!);
    const n = G.m.length;
    const W = svg.viewBox.baseVal.width;
    const xOf = (i: number) => G.L + (i / (n - 1)) * (G.R - G.L);
    const yOf = (v: number) => G.B - Math.sqrt(Math.max(0, v) / G.vmax) * (G.B - G.T);
    const X = G.m.map((_, i) => xOf(i));
    const U = G.m.map((m) => yOf(m[1])), RET = G.m.map((m) => yOf(m[3]));
    /** The users line's height above month-position f. */
    const lineY = (f: number) => {
      const i = Math.max(0, Math.min(n - 2, Math.floor(f)));
      return U[i] + (U[i + 1] - U[i]) * clamp(f - i);
    };

    const clipLine = q<SVGRectElement>(svg, ".clip-line");
    const head = q<SVGCircleElement>(svg, ".head");
    const pkDot = q<SVGCircleElement>(svg, ".pk-dot");
    const pulse = q<SVGCircleElement>(svg, ".pulse");
    const lead = ruled(q<SVGLineElement>(svg, ".peak-ann .lead"));
    const pkText = qa<SVGTextElement>(svg, ".peak-ann .pk");
    const aUsers = q<SVGPathElement>(svg, ".a-users"), aRet = q<SVGPathElement>(svg, ".a-ret");
    const AU = aUsers.getAttribute("d")!, AR = aRet.getAttribute("d")!;
    const engDots = qa<SVGCircleElement>(svg, ".d-eng");
    const baseEl = q<SVGLineElement>(svg, ".base");
    const base = ruled(baseEl);
    const gy = qa<SVGLineElement>(svg, ".gy").map((el, j) => ({ el, draw: ruled(el), label: qa<SVGTextElement>(svg, ".gyl")[j], at: 0.05 }));
    let baseAt = 0.04;
    const xt = qa<SVGLineElement>(svg, ".xt").map((el, j) => ({ tick: el, label: qa<SVGTextElement>(svg, ".xtl")[j], x: num(el, "x1") }));
    const penLine = mk<SVGLineElement>("line", "pen-l", svg, pkDot);
    attr(penLine, "y2", String(G.B));
    op(penLine, 0);
    const SPAN = 1.6, LAG = 0.3, LAG_RET = 0.6; // months the fill takes to rise under the line, and how far behind the pen it starts

    /** The filled area under a series, risen as far as the wave behind the pen has taken it. */
    function rising(H: number[], wave: number, lag: number) {
      const f = Math.min(n - 1, wave);
      const last = Math.floor(f);
      let d = "";
      for (let i = 0; i <= last; i++) {
        const y = G.B - (G.B - H[i]) * arrive(clamp((wave - i - lag) / SPAN));
        d += `${i ? "L" : "M"}${X[i].toFixed(1)} ${y.toFixed(1)}`;
      }
      const edge = f > last ? X[last] + (X[last + 1] - X[last]) * (f - last) : X[last];
      return `${d}L${edge.toFixed(1)} ${G.B}L${X[0].toFixed(1)} ${G.B}Z`;
    }

    let ambient = false;
    function render(p: number) {
      // Set-up: the axis is ruled, its dates with it, then the scale from the bottom up.
      const bx = phase(p, baseAt, baseAt + 0.12);
      base(bx);
      const bpen = G.L + (G.R - G.L) * bx;
      for (const t of xt) {
        const u = phase(bpen, t.x - (G.R - G.L) * 0.05, t.x - 1);
        op(t.tick, u);
        op(t.label, u);
      }
      gy.forEach((g) => {
        const u = phase(p, g.at, g.at + 0.12);
        g.draw(u);
        op(g.label, phase(u, 0.4, 1));
      });

      // Action: the pen crosses the months at one pace. The fill rises under the line a little behind it.
      const wave = Math.max(0, ((n - 1) * (p - PEN[0])) / (PEN[1] - PEN[0]));
      const f = Math.min(n - 1, wave);
      if (cur > wave + 0.01) show(-1); // the pen has gone back past the month being read
      const x = xOf(f), y = lineY(f);
      attr(clipLine, "width", (wave <= 0 ? 0 : f >= n - 1 ? W : x + 1).toFixed(1));
      attr(head, "cx", x.toFixed(1));
      attr(head, "cy", y.toFixed(1));
      const there = phase(p, PEN[0] - 0.025, PEN[0]);
      op(head, there);
      attr(penLine, "x1", x.toFixed(1));
      attr(penLine, "x2", x.toFixed(1));
      attr(penLine, "y1", (y + 4).toFixed(1));
      op(penLine, there * (1 - phase(p, PEN[1], PEN[1] + 0.04)) * 0.4);
      engDots.forEach((c, k) => attr(c, "r", (1.9 * arrive(clamp((wave - k) / 0.8))).toFixed(2)));
      attr(aUsers, "d", wave >= n - 1 + LAG + SPAN ? AU : rising(U, wave, LAG));
      attr(aRet, "d", wave >= n - 1 + LAG_RET + SPAN ? AR : rising(RET, wave, LAG_RET));

      // The Summer Contest peak is marked as the pen reaches it: the dot, then its leader, then its two lines.
      const at = PEN[0] + ((PEN[1] - PEN[0]) * G.peak) / (n - 1);
      const pk = phase(p, at - 0.004, Math.max(at + 0.05, DONE - 0.004));
      attr(pkDot, "r", (3.5 * arrive(phase(pk, 0, 0.3))).toFixed(2));
      op(pkDot, pk > 0 ? 1 : 0);
      lead(arrive(phase(pk, 0.1, 0.6)));
      pkText.forEach((el, k) => {
        const u = phase(pk, 0.35 + k * 0.15, 0.85 + k * 0.15);
        op(el, u);
        attr(el, "transform", `translate(${(6 * (1 - arrive(u))).toFixed(2)} 0)`);
      });
      ambient = p >= DONE;
      if (!ambient) {
        attr(pulse, "r", (3.5 + 13 * arrive(pk)).toFixed(2));
        attr(pulse, "opacity", (pk > 0 ? 0.7 * (1 - pk) : 0).toFixed(3));
      }

      // The header reads the month the pen has reached, and hands back to the total at either end.
      const into = phase(p, PEN[0] - 0.012, PEN[0] + 0.012), out = phase(p, PEN[1] + 0.02, PEN[1] + 0.05);
      const level = Math.min(Math.abs(2 * into - 1), Math.abs(2 * out - 1));
      if (into >= 0.5 && out < 0.5) {
        const m = G.m[Math.min(n - 1, Math.floor(f + 1e-6))];
        say(1, `${m[0]}: ${fmt.format(m[1])} users`, level);
      } else say(1, null, level);
    }

    // Ambient: a slow ring on the peak, at no fixed interval.
    const rand = mulberry(3);
    const beat = { t: 1.4, u: 1 };
    whileVisible(svg, (dt) => {
      if (!ambient) { beat.u = 1; beat.t = 1.4; return; }
      if (beat.u < 1) beat.u = Math.min(1, beat.u + dt / 1.7);
      else if ((beat.t -= dt) <= 0) { beat.u = 0; beat.t = 1.6 + rand() * 3; }
      attr(pulse, "r", (3.5 + 11 * arrive(beat.u)).toFixed(2));
      attr(pulse, "opacity", (0.6 * (1 - beat.u) ** 1.5).toFixed(3));
    });

    // Pointer: a crosshair reading any month. It glides from month to month and rides the line between them.
    const hit = q<SVGRectElement>(svg, ".hit");
    const xh = q<SVGGElement>(svg, ".xh");
    const xl = q<SVGLineElement>(xh, ".xh-l");
    const xd = q<SVGCircleElement>(xh, ".xh-d");
    const xp = q<SVGGElement>(xh, ".xh-p");
    const box = q<SVGRectElement>(xp, ".xh-box");
    const tm = q<SVGTextElement>(xp, ".xh-m");
    const tv = qa<SVGTextElement>(xp, ".xh-v");
    svg.dataset.live = "";
    let cur = -1, progress = 0;
    const glide = { f: 0, a: 0, w: 140, px: 0, on: false };
    function show(i: number) {
      if (i === cur) return;
      cur = i;
      svg.classList.toggle("reading", i >= 0);
      if (i < 0) return;
      const [lab, users, nw, ret, eng] = G.m[i];
      text(tm, lab);
      [`${fmt.format(users)} users`, `${fmt.format(nw)} new`, `${fmt.format(ret)} returning`, `${fmt.format(eng)} engaged sessions`].forEach((s, k) => text(tv[k], s));
      // Sized from its own type, once per month read (never per frame).
      const fs = parseFloat(getComputedStyle(tm).fontSize) || 11.5;
      const lh = fs * 1.35, pad = fs * 0.8;
      [tm, ...tv].forEach((el, k) => {
        attr(el, "x", pad.toFixed(1));
        attr(el, "y", (pad + fs * 0.85 + k * lh).toFixed(1));
      });
      glide.w = Math.max(...[tm, ...tv].map((el) => el.getComputedTextLength())) + pad * 2;
      attr(box, "width", glide.w.toFixed(1));
      attr(box, "height", (lh * 4 + fs + pad * 1.6).toFixed(1));
      if (!glide.on) {
        glide.f = i;
        glide.px = xOf(i) + 12 + glide.w <= G.R ? xOf(i) + 12 : xOf(i) - 12 - glide.w;
      }
    }
    whileVisible(svg, (dt) => {
      const want = cur >= 0 ? 1 : 0;
      glide.on = want === 1 || glide.a > 0.02;
      if (!glide.on && glide.a === 0) return;
      if (cur >= 0) glide.f += (cur - glide.f) * Math.min(1, dt * 22);
      glide.a += (want - glide.a) * Math.min(1, dt * (want ? 18 : 9));
      if (glide.a < 0.01 && !want) glide.a = 0;
      const x = xOf(glide.f);
      attr(xl, "x1", x.toFixed(1));
      attr(xl, "x2", x.toFixed(1));
      attr(xd, "cx", x.toFixed(1));
      attr(xd, "cy", lineY(glide.f).toFixed(1));
      // The readings sit to the right of the hairline, and cross to its left where there is no room.
      const to = x + 12 + glide.w <= G.R ? x + 12 : x - 12 - glide.w;
      glide.px += (to - glide.px) * Math.min(1, dt * 16);
      attr(xp, "transform", `translate(${glide.px.toFixed(1)} ${(G.T - 6).toFixed(1)})`);
      attr(xh, "opacity", glide.a.toFixed(3));
    });
    let pending: PointerEvent | null = null;
    let timer = 0;
    const read = () => {
      const e = pending;
      pending = null;
      if (!e) return;
      const m = svg.getScreenCTM();
      if (!m) return;
      const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      const i = Math.max(0, Math.min(n - 1, Math.round(((pt.x - G.L) / (G.R - G.L)) * (n - 1))));
      // Only months the pen has reached can be read.
      show(i <= ((n - 1) * (progress - PEN[0])) / (PEN[1] - PEN[0]) + 0.01 ? i : -1);
    };
    const onPointer = (e: PointerEvent) => {
      clearTimeout(timer);
      if (!pending) requestAnimationFrame(read);
      pending = e;
    };
    const release = () => { pending = null; show(-1); };
    hit.addEventListener("pointermove", onPointer);
    hit.addEventListener("pointerdown", onPointer);
    hit.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse") release();
      else timer = window.setTimeout(release, 2500);
    });
    hit.addEventListener("pointercancel", () => { timer = window.setTimeout(release, 2500); });

    return {
      render(p: number) {
        progress = p;
        render(p);
      },
      /** Each line of the scale is ruled as it comes out; the axis last, and then the pen. */
      place(out: (part: Element) => number) {
        for (const g of gy) g.at = Math.max(0.03, Math.min(0.4, out(g.el) + 0.012));
        baseAt = Math.max(0.04, Math.min(0.42, out(baseEl) + 0.006));
        PEN[0] = Math.max(0.14, Math.min(0.46, baseAt + 0.03));
        // The pen's pace is set so that the fill behind it has risen all the way just as the story is done.
        PEN[1] = PEN[0] + ((DONE - 0.006 - PEN[0]) * (n - 1)) / (n - 1 + LAG_RET + SPAN);
      },
    };
  }

  // One of the two charts is shown (the narrow one under 900px); only that one is drawn.
  const charts = qa<SVGSVGElement>(root, ".gd-asvg").map((svg) => ({ narrow: svg.classList.contains("narrow"), ...monthly(svg) }));
  const narrow = window.matchMedia("(max-width: 900px)");
  const chart = () => charts.find((c) => c.narrow === narrow.matches) ?? charts[0];
  charts.forEach((c) => c.render(0));
  const stA = story(q(root, ".gd-a"), 0.85, (p) => chart().render(p), (out) => chart().place(out));
  narrow.addEventListener("change", () => chart().render(stA.p));

  /** A pointer over a panel, in its own units, at most once a frame; `over(null)` when it leaves. */
  function pointer(svg: SVGSVGElement, over: (pt: DOMPoint | null) => void) {
    const hit = q<SVGRectElement>(svg, ".hit");
    svg.dataset.live = "";
    let pending: PointerEvent | null = null;
    let timer = 0;
    const read = () => {
      const e = pending;
      pending = null;
      if (!e) return;
      const m = svg.getScreenCTM();
      if (m) over(new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()));
    };
    const on = (e: PointerEvent) => {
      clearTimeout(timer);
      if (!pending) requestAnimationFrame(read);
      pending = e;
    };
    const off = () => { pending = null; over(null); };
    hit.addEventListener("pointermove", on);
    hit.addEventListener("pointerdown", on);
    hit.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse") off();
      else timer = window.setTimeout(off, 2500);
    });
    hit.addEventListener("pointercancel", () => { timer = window.setTimeout(off, 2500); });
  }

  /**
   * Visits replayed along a row of lollipops: a point leaves zero and runs to
   * the row's average engagement at a minute a second, on every row alike, so
   * a page that holds people for fifteen minutes takes fifteen seconds and one
   * they leave in seven takes a blink. `speed` is plot units a second.
   */
  function replays(svg: SVGSVGElement, size: number, speed: number) {
    const layer = mk<SVGGElement>("g", "replays", svg, q(svg, ".hit"));
    const dots = Array.from({ length: size }, () => {
      const wake = mk<SVGLineElement>("line", "rp-w", layer);
      const el = mk<SVGCircleElement>("circle", "rp", layer);
      el.setAttribute("r", "2.3");
      op(el, 0);
      op(wake, 0);
      return { el, wake, x: 0, x0: 0, x1: 0, live: false, done: (() => {}) as () => void };
    });
    const rings = Array.from({ length: 4 }, () => {
      const el = mk<SVGCircleElement>("circle", "ringp", layer);
      op(el, 0);
      return { el, u: 1, r: 3 };
    });
    let gate = 1;
    return {
      /** Start one visit from x0 to x1 at height y. */
      run(x0: number, x1: number, y: number, r: number, tone: string) {
        const d = dots.find((k) => !k.live);
        if (!d) return;
        d.live = true;
        d.x = d.x0 = x0;
        d.x1 = x1;
        attr(d.el, "cy", y.toFixed(1));
        attr(d.el, "class", `rp ${tone}`);
        attr(d.wake, "y1", y.toFixed(1));
        attr(d.wake, "y2", y.toFixed(1));
        attr(d.wake, "class", `rp-w ${tone}`);
        d.done = () => {
          const ring = rings.find((k) => k.u >= 1) ?? rings[0];
          ring.u = 0;
          ring.r = r;
          attr(ring.el, "cx", x1.toFixed(1));
          attr(ring.el, "cy", y.toFixed(1));
          attr(ring.el, "class", `ringp ${tone}`);
        };
      },
      tick(dt: number, on: boolean) {
        // If the story is taken back, whatever is on its way lets go over a few frames.
        gate = on ? 1 : Math.max(0, gate - dt / 0.16);
        for (const d of dots) {
          if (!d.live) continue;
          d.x += speed * dt;
          const o = gate * Math.min(1, (d.x - d.x0) / 3 + 0.25, Math.max(0, (d.x1 - d.x) / 2.5 + 0.2));
          const x = Math.min(d.x, d.x1);
          attr(d.el, "cx", x.toFixed(1));
          op(d.el, o);
          // A short wake behind it, no longer than the way it has come.
          attr(d.wake, "x1", Math.max(d.x0, x - 16).toFixed(1));
          attr(d.wake, "x2", x.toFixed(1));
          op(d.wake, o * 0.55);
          if (d.x >= d.x1 || gate === 0) {
            d.live = false;
            op(d.el, 0);
            op(d.wake, 0);
            if (gate === 1) d.done();
          }
        }
        for (const k of rings) {
          if (k.u >= 1) continue;
          k.u = Math.min(1, k.u + dt / 0.8);
          attr(k.el, "r", (k.r + 6.5 * arrive(k.u)).toFixed(2));
          op(k.el, gate * 0.65 * (1 - k.u));
        }
      },
    };
  }

  // ======================================================================
  // (b) Where time goes
  // ======================================================================
  {
    const svg = q<SVGSVGElement>(root, ".gd-bsvg");
    const G: GB = JSON.parse(svg.dataset.g!);
    const heads = qa<SVGTextElement>(svg, ".colh");
    const gv = qa<SVGLineElement>(svg, ".gv").map((el, j) => ({ draw: ruled(el), label: qa<SVGTextElement>(svg, ".gvl")[j] }));
    const note = svg.querySelector<SVGTextElement>(".con-note");
    const rows = qa<SVGGElement>(svg, ".pg").map((g, k) => {
      const stem = q<SVGLineElement>(g, ".stem"), lol = q<SVGCircleElement>(g, ".lol"), bar = q<SVGRectElement>(g, ".bar");
      const star = g.classList.contains("star");
      const ev = g.querySelector<SVGTextElement>(".ev") ?? mk<SVGTextElement>("text", "ride", g);
      const ex = num(stem, "x2"), y = num(stem, "y1");
      if (star) {
        attr(ev, "y", (y - 8).toFixed(1));
        attr(ev, "text-anchor", "end");
      }
      return {
        g, k, star, stem, lol, bar, ev, ex, y,
        name: q<SVGTextElement>(g, ".rl"), vv: q<SVGTextElement>(g, ".vv"), starText: g.querySelector<SVGTextElement>(".star-t"),
        w: Number(bar.dataset.w), r: num(lol, "r"), views: Number(g.dataset.v), sec: Number(g.dataset.s), label: g.dataset.l ?? "",
        tone: "",
      };
    });
    // The rows come down the panel at the pace the panel comes over the fold, so each is drawn in
    // view. Every dot runs out along the time scale at one speed, so a row takes as long as people
    // stay on that page: most stop within a moment; the mock generator's is still on its way while
    // the rows under it come and go.
    const V = (G.e1 - G.e0) / 0.3;     // the whole scale would take this stretch of the story
    const rowAt = rows.map((r) => 0.03 + r.k * 0.058); // when each row begins
    const gvAt = gv.map(() => 0.03);
    let noteAt = 0.85;
    /** When a row is all there: its dot has stopped (and, for the standout, its label is up). It can be read from then on. */
    const drawnAt = (k: number) => rowAt[k] + 0.085 + (rows[k].ex - G.e0) / V + (rows[k].star ? 0.05 : 0);

    // Pointer: the row under it stands out, and the header reads it.
    let picked = -1;
    function pick(k: number) {
      if (k === picked) return;
      picked = k;
      svg.classList.toggle("pick", k >= 0);
      rows.forEach((r) => r.g.classList.toggle("on", r.k === k));
      say(0, k < 0 ? null : `${rows[k].label}: ${fmt.format(rows[k].views)} views, ${dur(rows[k].sec)} average`);
    }

    function render(p: number) {
      if (picked >= 0 && p < drawnAt(picked)) pick(-1); // the story has gone back past the row being read
      // Set-up: the two column heads, then the time scale ruled down from the top.
      heads.forEach((el, j) => op(el, phase(p, 0.0 + j * 0.03, 0.06 + j * 0.03)));
      gv.forEach((g, j) => {
        // The time scale is ruled down the panel at the pace the panel comes out.
        g.draw(phase(p, gvAt[j], rowAt[rows.length - 1] + 0.06));
        op(g.label, phase(p, rowAt[rows.length - 1] + 0.04, rowAt[rows.length - 1] + 0.1));
      });
      for (const r of rows) {
        // A row's name steps in, then its bar grows at a steady rate with its count reading the bar.
        const at = rowAt[r.k];
        const nu = phase(p, at, at + 0.06);
        op(r.name, nu);
        attr(r.name, "transform", `translate(${(-6 * (1 - arrive(nu))).toFixed(2)} 0)`);
        const bu = phase(p, at + 0.02, at + 0.12);
        attr(r.bar, "width", (r.w * bu).toFixed(2));
        attr(r.vv, "x", (G.x0 + r.w * bu + 6).toFixed(1));
        text(r.vv, fmt.format(Math.round(r.views * bu)));
        op(r.vv, phase(bu, 0.02, 0.2));

        // Then the time: the dot leaves zero and the reading rides beside it until it stops.
        const from = at + 0.085;
        const gone = Math.max(0, p - from) * V;
        const x = Math.min(r.ex, G.e0 + gone);
        const here = phase(p, from - 0.025, from);
        attr(r.stem, "x2", x.toFixed(1));
        op(r.stem, here > 0 ? 1 : 0);
        attr(r.lol, "cx", x.toFixed(1));
        attr(r.lol, "r", (r.r * arrive(here)).toFixed(2));
        const stopped = G.e0 + gone >= r.ex;
        const secs = stopped ? r.sec : Math.round(((x - G.e0) / (G.e1 - G.e0)) * G.emax);
        text(r.ev, dur(secs));
        if (r.star && r.starText) {
          // The standout carries its running time under the dot, then hands over to its own line of type.
          const landed = phase(G.e0 + gone, r.ex, r.ex + V * 0.05);
          attr(r.ev, "x", (x - 9).toFixed(1));
          op(r.ev, here * (1 - phase(landed, 0, 0.5)));
          op(r.starText, phase(landed, 0.3, 1));
          attr(r.starText, "transform", `translate(${(8 * (1 - arrive(phase(landed, 0.3, 1)))).toFixed(2)} 0)`);
        } else {
          attr(r.ev, "x", (x + 8).toFixed(1));
          op(r.ev, here);
        }
      }
      if (note) op(note, phase(p, noteAt, DONE));
    }
    render(0);
    const st = story(q(root, ".gd-b"), 0.92, render, (out) => {
      // Rows follow one another down the panel, none before it is out from under the fold.
      // (Nor so late that its dot could not finish its run, and the standout's label come up, before the story is done.)
      rows.forEach((r) => (rowAt[r.k] = Math.max(0.03 + r.k * 0.03, Math.min(DONE - (r.star ? 0.145 : 0.1) - (r.ex - G.e0) / V, out(r.g) + 0.008))));
      gv.forEach((_, j) => (gvAt[j] = Math.max(0.03, rowAt[0] - 0.03) + j * 0.015));
      noteAt = Math.min(0.85, Math.max(0.6, rowAt[rows.length - 1] + 0.1));
    });

    // Ambient: page views arrive in proportion to each page's share of views, and each is replayed along its row.
    const rand = mulberry(5);
    const sum = rows.reduce((a, r) => a + r.views, 0);
    const pool = replays(svg, 6, ((G.e1 - G.e0) / G.emax) * REPLAY);
    let wait = 0.5;
    whileVisible(svg, (dt) => {
      const on = st.p >= DONE;
      if (on && (wait -= dt) <= 0) {
        let u = rand() * sum;
        const r = rows.find((k) => (u -= k.views) <= 0) ?? rows[0];
        pool.run(G.e0, r.ex, r.y, r.r, r.tone);
        wait = 0.45 + rand() * 1.5;
      }
      pool.tick(dt, on);
    });

    pointer(svg, (pt) => {
      const i = pt ? Math.floor((pt.y - G.top) / G.row) : -1;
      pick(i >= 0 && i < rows.length && st.p >= drawnAt(i) ? i : -1);
    });
  }

  // ======================================================================
  // (c) How people arrive
  // ======================================================================
  {
    const svg = q<SVGSVGElement>(root, ".gd-csvg");
    const G: GC = JSON.parse(svg.dataset.g!);
    const totalEl = root.querySelector<HTMLElement>(".gd-total");
    const heads = qa<SVGTextElement>(svg, ".colh");
    const segs = qa<SVGRectElement>(svg, ".seg").map((el, k) => ({ el, k, x: Number(el.dataset.x), w: Number(el.dataset.w), name: G.segs[k][0], n: G.segs[k][1] }));
    const direct = q<SVGTextElement>(svg, ".seg-d"), share = q<SVGTextElement>(svg, ".seg-p");
    const others = qa<SVGGElement>(svg, ".seg-o").map((g) => ({ lead: ruled(q<SVGLineElement>(g, ".lead")), label: q<SVGTextElement>(g, "text"), cx: Number(g.dataset.cx) }));
    const gv = qa<SVGLineElement>(svg, ".gv").map((el, j) => ({ draw: ruled(el), label: qa<SVGTextElement>(svg, ".gvl")[j] }));
    const chans = qa<SVGGElement>(svg, ".ch").map((g, k) => {
      const stem = q<SVGLineElement>(g, ".stem"), lol = q<SVGCircleElement>(g, ".lol");
      const cls = g.getAttribute("class") ?? "";
      return {
        g, k, stem, lol, name: q<SVGTextElement>(g, ".rl"), val: q<SVGTextElement>(g, "text.val"),
        ex: num(stem, "x2"), y: num(stem, "y1"), r: num(lol, "r"),
        label: G.ch[k][0], n: G.ch[k][1], sec: G.ch[k][2], seg: G.ch[k][3],
        tone: /tone-acc/.test(cls) ? "tone-acc" : /tone-grn/.test(cls) ? "tone-grn" : "",
      };
    });
    const brKey = q<SVGTextElement>(svg, ".br-k");
    const brs = qa<SVGRectElement>(svg, ".brseg").map((el, k) => ({ el, k, x: num(el, "x"), w: Number(el.dataset.w), name: G.br[k][0], n: G.br[k][1] }));
    const brLabels = qa<SVGTextElement>(svg, ".br-l");
    const FILL = [0.04, 0.3];           // the stacked bar fills
    const V = (G.l1 - G.l0) / 0.2;      // the whole scale would take this stretch of the story
    const rowAt = chans.map((c) => 0.33 + c.k * 0.06); // when each channel's row begins
    const BRF = [0.8, 0.87];            // the browsers bar fills
    /** When a channel's row is all there: its dot has stopped. */
    const drawnAt = (k: number) => rowAt[k] + 0.04 + (chans[k].ex - G.l0) / V;

    // Pointer: a channel is read from its segment of the bar or from its row; a browser from its piece of the last bar.
    let picked = "", pickedFrom = 0;
    function pick(seg: number, row: number, br: number, line: string | null, from: number) {
      const key = seg < 0 && row < 0 && br < 0 ? "" : `${seg}:${row}:${br}`;
      if (key === picked) return;
      picked = key;
      pickedFrom = from;
      svg.classList.toggle("pick", key !== "");
      segs.forEach((s) => s.el.classList.toggle("on", s.k === seg || br >= 0));
      chans.forEach((c) => c.g.classList.toggle("on", c.k === row || (row < 0 && seg >= 0 && c.seg === seg) || br >= 0));
      brs.forEach((b) => b.el.classList.toggle("on", b.k === br || br < 0));
      say(0, key ? line : null);
    }

    function render(p: number) {
      if (picked && p < pickedFrom) pick(-1, -1, -1, null, 0); // the story has gone back past the part being read
      // The bar fills from the left at a steady rate; the header counts the sessions that are in it.
      op(heads[0], phase(p, 0, 0.06));
      const fill = phase(p, FILL[0], FILL[1]);
      const fx = G.x0 + (G.x1 - G.x0) * fill;
      for (const s of segs) attr(s.el, "width", Math.max(0, Math.min(s.w, fx - s.x)).toFixed(2));
      if (totalEl) {
        text(totalEl, `${fmt.format(Math.round(G.total * fill))} sessions`);
        op(totalEl, phase(fill, 0, 0.06));
      }
      const dShare = G.segs[0][1] / G.total;
      const dFill = clamp(fill / dShare);
      text(direct, `Direct ${fmt.format(Math.round(G.segs[0][1] * dFill))}`);
      op(direct, phase(fill, 0, 0.06));
      op(share, phase(dFill, 0.96, 1) * phase(p, FILL[0], FILL[1] + 0.03));
      others.forEach((o, j) => {
        // Each smaller channel is named once the fill has passed it: a leader down from the bar, then its label.
        const passed = FILL[0] + ((o.cx - G.x0) / (G.x1 - G.x0)) * (FILL[1] - FILL[0]);
        const from = Math.max(passed, FILL[1] - 0.025 + j * 0.03);
        const u = phase(p, from, from + 0.08);
        o.lead(arrive(phase(u, 0, 0.6)));
        op(o.label, phase(u, 0.4, 1));
      });

      // The second scale and its rows.
      op(heads[1], phase(p, rowAt[0] - 0.08, rowAt[0] - 0.02));
      gv.forEach((g, j) => {
        g.draw(phase(p, rowAt[0] - 0.04 + j * 0.015, rowAt[chans.length - 1] + 0.06));
        op(g.label, phase(p, rowAt[chans.length - 1] + 0.04, rowAt[chans.length - 1] + 0.1));
      });
      for (const c of chans) {
        const at = rowAt[c.k];
        const nu = phase(p, at, at + 0.06);
        op(c.name, nu);
        attr(c.name, "transform", `translate(${(-6 * (1 - arrive(nu))).toFixed(2)} 0)`);
        // As in (b): one speed for every row, so each takes as long as its sessions last.
        const from = at + 0.04;
        const gone = Math.max(0, p - from) * V;
        const x = Math.min(c.ex, G.l0 + gone);
        const here = phase(p, from - 0.025, from);
        attr(c.stem, "x2", x.toFixed(1));
        op(c.stem, here > 0 ? 1 : 0);
        attr(c.lol, "cx", x.toFixed(1));
        attr(c.lol, "r", (c.r * arrive(here)).toFixed(2));
        attr(c.val, "x", (x + 8).toFixed(1));
        text(c.val, dur(G.l0 + gone >= c.ex ? c.sec : Math.round(((x - G.l0) / (G.l1 - G.l0)) * G.lmax)));
        op(c.val, here);
      }

      // Browsers: one more bar, filled the same way.
      op(brKey, phase(p, BRF[0] - 0.04, BRF[0] + 0.01));
      const bx = G.brx0 + (G.brx1 - G.brx0) * phase(p, BRF[0], BRF[1]);
      for (const b of brs) attr(b.el, "width", Math.max(0, Math.min(b.w, bx - b.x)).toFixed(2));
      brLabels.forEach((el, j) => op(el, phase(p, BRF[1] - 0.04 + j * 0.015, DONE - 0.015 + j * 0.01)));
    }
    render(0);
    const st = story(q(root, ".gd-c"), 0.92, render, (out) => {
      // The bar fills once it is out; each channel's row begins once it is; the browsers bar last.
      FILL[0] = Math.max(0.04, Math.min(0.3, out(segs[0].el) + 0.01));
      FILL[1] = FILL[0] + 0.26;
      chans.forEach((c) => (rowAt[c.k] = Math.max(FILL[1] - 0.04 + c.k * 0.035, Math.min(DONE - 0.07 - (c.ex - G.l0) / V, 0.46 + c.k * 0.05, out(c.g) + 0.008))));
      BRF[0] = Math.max(rowAt[chans.length - 1] + 0.05, Math.min(0.815, out(brs[0].el) + 0.004));
      BRF[1] = Math.min(0.878, BRF[0] + 0.07);
    });

    // Ambient: sessions land on the bar anywhere along it with equal chance, so each channel
    // receives them in proportion to its width, which is its share. Each then runs out its
    // channel's average engagement on the scale below.
    const rand = mulberry(9);
    const pool = replays(svg, 6, ((G.l1 - G.l0) / G.lmax) * REPLAY);
    const layer = mk<SVGGElement>("g", "drops", svg, q(svg, ".hit"));
    const drops = Array.from({ length: 4 }, () => {
      const el = mk<SVGLineElement>("line", "drop", layer);
      op(el, 0);
      return { el, t: -1, x: 0 };
    });
    const FALL = 0.45;
    let wait = 0.7, dropGate = 1;
    whileVisible(svg, (dt) => {
      const on = st.p >= DONE;
      if (on && (wait -= dt) <= 0) {
        const d = drops.find((k) => k.t < 0);
        if (d) {
          d.t = 0;
          d.x = G.x0 + rand() * (G.x1 - G.x0);
          attr(d.el, "x1", d.x.toFixed(1));
          attr(d.el, "x2", d.x.toFixed(1));
        }
        wait = 0.5 + rand() * 1.3;
      }
      dropGate = on ? 1 : Math.max(0, dropGate - dt / 0.16);
      for (const d of drops) {
        if (d.t < 0) continue;
        d.t += dt;
        const u = Math.min(1, d.t / FALL);
        const y = G.bar - 15 + 15 * u * u; // it falls: slow off the mark, fastest as it lands
        attr(d.el, "y1", (y - 6).toFixed(1));
        attr(d.el, "y2", Math.min(G.bar, y).toFixed(1));
        op(d.el, dropGate * Math.min(1, u * 5) * (1 - phase(u, 0.8, 1)));
        if (u >= 1) {
          d.t = -1;
          if (!on) continue;
          // The channel is the segment it fell on; within the last, mixed segment, one of its three by their sessions.
          const s = segs.find((k) => d.x < k.x + k.w + 1.5) ?? segs[segs.length - 1];
          const mine = chans.filter((c) => c.seg === s.k);
          let v = rand() * mine.reduce((a, c) => a + c.n, 0);
          const c = mine.find((k) => (v -= k.n) <= 0) ?? mine[0];
          if (c) pool.run(G.l0, c.ex, c.y, c.r, c.tone);
        }
      }
      pool.tick(dt, on);
    });

    // (A part can be read once it is all there: the bar when it is full, a row when its dot has stopped, the browsers when theirs is.)
    pointer(svg, (pt) => {
      let line: string | null = null, seg = -1, row = -1, br = -1, from = 0;
      const p = st.p;
      if (pt) {
        if (pt.y < G.top - 20) {
          if (pt.y < G.bar + G.bh + 10) {
            // On the bar itself.
            seg = pt.x < G.x0 - 4 || pt.x > G.x1 + 4 ? -1 : segs.findIndex((s) => pt.x < s.x + s.w + 1.5);
          } else {
            // Among the labels under it: the big one on the left, or the nearest of the three on the right.
            seg = pt.x < 300 ? 0 : Math.max(1, Math.min(3, 1 + Math.round((pt.y - (G.bar + G.bh + 24)) / 21)));
          }
          from = FILL[1] + 0.12;
          if (seg >= 0 && p >= from) {
            line = `${segs[seg].name}: ${fmt.format(segs[seg].n)} sessions, ${pct(segs[seg].n, G.total)}`;
            if (seg < 3) row = chans.findIndex((c) => c.seg === seg);
          } else seg = -1;
        } else if (pt.y >= G.top && pt.y < G.top + chans.length * G.row) {
          const k = Math.floor((pt.y - G.top) / G.row);
          from = drawnAt(k);
          if (p >= from) {
            row = k;
            seg = chans[k].seg;
            line = `${chans[k].label}: ${dur(chans[k].sec)} per session, ${fmt.format(chans[k].n)} sessions`;
          }
        } else if (pt.y >= G.bry - 10 && pt.x >= G.brx0 - 4) {
          from = BRF[1];
          if (p >= from) {
            br = Math.max(0, brs.findIndex((b) => pt.x < b.x + b.w + 1.2));
            line = `${brs[br].name === "Other" ? "Other browsers" : brs[br].name}: ${fmt.format(brs[br].n)} users, ${pct(brs[br].n, G.brTotal)}`;
          }
        }
      }
      pick(seg, row, br, line, from);
    });
  }
}
