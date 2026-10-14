import { gsap, scrubbed, whileVisible, phase, q, qa } from "../motion";

/**
 * Drift: a wait, and what the extension does with it.
 *
 * The story is one clock, t (0..T), and the picture is a pure function of it,
 * so it runs backwards exactly. Three hands can hold that clock:
 *
 *   the scroll    as the plate comes up the window;
 *   the pointer   moved across the plate, it scrubs the wait from the left
 *                 edge to the right (a finger drawn across does the same);
 *   a press       plays the whole wait through once, at a person's pace.
 *
 * Whoever moved last has it, and the picture never jumps to them: the clock
 * closes on its new hand like a spring, critically damped.
 *
 * On top of the clock, time passes: a wave runs through the word "Thinking",
 * the feed is flicked on a post at a time while its window is open, and a
 * caret blinks in whichever box has the keyboard.
 *
 * Whatever comes and goes on the clock (the popup, the side window, the toast)
 * fades evenly with it and only travels on the house curve: scrubbed fast, a
 * fade on that curve would be all there in its first frame.
 */
const T = 10;
const TYPE = [0, 0.5]; // the question is typed
const SEND = 0.55; // and sent: it leaves the box and arrives in the conversation
const THINK = [1.0, 5.0]; // the model is thinking
const NOTICE = 1.3; // Drift sees that it is: the toolbar icon comes on
const POP = [1.55, 3.3]; // its popup asks
const PRESS = 2.7; // Yes
const OPEN = 3.0; // the side window is drawn, and takes the keyboard
const STREAM = [5.0, 7.2]; // the answer arrives, token by token
const TOAST = 7.3; // the side window is told, and the notice is left up long enough to read
const COLLAPSE = [8.4, 8.9]; // and folds away
const BACK = 8.9; // focus is back on the chat: the ring is drawn round it
const END = 9.6; // everything is at rest
const REWIND = 12; // the fastest the clock is ever run by the pointer or a press, in units a second
const WAIT_S = 18.6; // seconds on the timer when the answer is ready
const BACK_S = 0.4; // and seconds from then until the chat has focus again

const GOLD = 0.6180339887;
const frac = (v: number) => v - Math.floor(v);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const toward = (v: number, to: number, step: number) => (v < to ? Math.min(to, v + step) : Math.max(to, v - step));

interface Geo { NTOK: number; FRAC_K: number; period: number }
type Vars = NonNullable<Parameters<typeof scrubbed>[1]>;

export default function (root: HTMLElement) {
  const svg = q<SVGSVGElement>(root, "svg.dr");
  const G: Geo = JSON.parse(svg.dataset.g!);
  const readout = root.querySelector<HTMLElement>("[data-readout]");
  const arrive = gsap.parseEase("arrive");
  const swap = gsap.parseEase("swap");
  const small = window.matchMedia("(max-width: 560px)");

  // Every write goes through a memo: a part at rest is not written to again.
  const memo = new WeakMap<Element, Record<string, string>>();
  const put = (el: Element, key: string, v: string) => {
    let m = memo.get(el);
    if (!m) memo.set(el, (m = {}));
    if (m[key] === v) return;
    m[key] = v;
    if (key === "opacity") (el as SVGElement).style.opacity = v;
    else if (key === "fill-opacity") (el as SVGElement).style.fillOpacity = v;
    else el.setAttribute(key, v);
  };
  const op = (el: Element, v: number) => put(el, "opacity", v <= 0.004 ? "0" : v >= 0.996 ? "1" : v.toFixed(3));
  const tr = (el: Element, x: number, y: number) => put(el, "transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
  const num = (el: Element, key: string) => Number(el.getAttribute(key));

  const browser = q<SVGGElement>(root, ".browser");
  const chatCol = q<SVGGElement>(root, ".chat-col");
  const tbRight = q<SVGGElement>(root, ".tb-right");
  const rings = qa<SVGRectElement>(root, ".ring");
  const typed = q<SVGTextElement>(root, ".typed");
  const typeClip = q<SVGRectElement>(root, ".type-clip");
  const tcaret = q<SVGRectElement>(root, ".tcaret");
  const ph = q<SVGTextElement>(root, ".ph");
  const bubble = q<SVGGElement>(root, ".bubble");
  const mark = q<SVGCircleElement>(root, ".mark");
  const thinking = q<SVGTextElement>(root, ".thinking");
  const glyphs = qa<SVGTSpanElement>(thinking, ".tg");
  const toks = qa<SVGTSpanElement>(root, ".tk");
  const fraction = q<SVGGElement>(root, ".frac");
  const caret = q<SVGRectElement>(root, ".caret");
  const sendBtn = q<SVGCircleElement>(root, ".send");
  const sendA = q<SVGPathElement>(root, ".send-a");
  const sendS = q<SVGRectElement>(root, ".send-s");
  const dicon = q<SVGGElement>(root, ".dicon");
  const badge = q<SVGCircleElement>(root, ".badge");
  const popup = q<SVGGElement>(root, ".popup");
  const yes = q<SVGGElement>(root, ".yes");
  const yesR = q<SVGRectElement>(yes, "rect");
  const cursor = q<SVGPathElement>(root, ".cursor");
  const side = q<SVGGElement>(root, ".side");
  const sw = q<SVGRectElement>(root, ".sw");
  const swFill = q<SVGRectElement>(root, ".sw-fill");
  const swBar = q<SVGGElement>(root, ".sw-bar");
  const feedClip = q<SVGRectElement>(root, ".feed-clip");
  const feedG = q<SVGGElement>(root, ".feed");
  const toast = q<SVGGElement>(root, ".toast");
  const mark2 = q<SVGLineElement>(root, ".scrub");

  const swH = num(sw, "height");
  const clipH = num(feedClip, "height");
  const bar = num(feedClip, "y") - num(sw, "y");
  const pitch = G.period / 4;
  const [cx1, cy1] = cursor.dataset.to!.split(" ").map(Number);
  const [rx, ry] = cursor.dataset.rest!.split(" ").map(Number);
  const yx = num(yesR, "x") + num(yesR, "width") / 2;
  const yy = num(yesR, "y") + num(yesR, "height") / 2;
  const typedX = num(typed, "x");
  const W0 = Number(mark2.dataset.x0), WD = Number(mark2.dataset.w), WM = Number(mark2.dataset.wm);

  // ---- measured once the fonts are in (in each text's own coordinates) ----
  const byK = new Map<number, SVGTSpanElement>();
  toks.forEach((el) => byK.set(Number(el.dataset.k), el));
  const ends: { x: number; y: number }[] = []; // the stream's caret, after each token
  let typedW = 0;
  let charEnds: number[] = []; // the typing caret, after each character
  let cx0 = cx1 + 46, cy0 = cy1 + 120; // where the pointer in the picture sets off from: the send button
  const measure = () => {
    for (const line of qa<SVGTextElement>(root, "text.ans")) {
      const y = Number(line.getAttribute("y"));
      let idx = 0;
      for (const el of qa<SVGTSpanElement>(line, ".tk")) {
        idx += el.textContent!.length;
        try {
          ends[Number(el.dataset.k)] = { x: line.getEndPositionOfChar(idx - 1).x, y };
        } catch {
          /* not laid out */
        }
      }
    }
    const fx = fraction.querySelector("line")!;
    ends[G.FRAC_K] = { x: Number(fx.getAttribute("x2")) + 3, y: 182 };
    typedW = typed.getComputedTextLength() + 2;
    try {
      charEnds = Array.from({ length: typed.getNumberOfChars() }, (_, i) => typed.getEndPositionOfChar(i).x - typedX);
    } catch {
      charEnds = [];
    }
    // The chat column and the toolbar's right end sit differently on a phone, so the send button is found from the page.
    const mc = chatCol.getCTM(), mr = tbRight.getCTM();
    if (mc && mr) {
      cx0 = num(sendBtn, "cx") + (mc.e - mr.e) / mr.a + 3;
      cy0 = num(sendBtn, "cy") + 4;
    }
  };

  // ---- state ----
  let t = 0; // the clock the picture is drawn from
  let scrollT = 0; // where the scroll has the story
  let scrollAt = -1e9; // when it last moved it
  let locked = true; // t is the scroll's clock itself, not closing on it
  let vel = 0;
  const hand = { on: false, t: 0, x: 0, env: 0 }; // the pointer, scrubbing
  let play = -1; // a press playing the wait through: its own clock, or -1
  let amb = 0; // seconds, for whatever keeps time by itself
  let feedAmb = 0; // seconds the side window has been open

  // The feed is flicked on like a feed is: a quick push, a long glide to rest on the next post, a pause to
  // read it. Never two pauses the same, and now and then two posts go by at once. (The push is the house
  // curve for coming to rest, entered a little late: it gets up to speed over a few frames, not in one.)
  const FLICK = 0.95;
  const flick = (u: number) => arrive(Math.pow(u, 1.6));
  const flickAt = (k: number) => 0.6 + k * 1.6 + 0.55 * frac(k * GOLD);
  const flickBy = (k: number) => (frac(k * 0.381966 + 0.2) > 0.8 ? 2 : 1);
  const gone = [0]; // posts gone by before flick k
  function feedAt(fc: number) {
    if (fc <= 0) return 0;
    let k = Math.max(0, Math.floor((fc - 0.6) / 1.6) + 1);
    while (k > 0 && flickAt(k - 1) > fc) k--;
    if (k === 0) return 0;
    while (gone.length < k) gone.push(gone[gone.length - 1] + flickBy(gone.length - 1));
    return (gone[k - 1] + flickBy(k - 1) * flick(Math.min(1, (fc - flickAt(k - 1)) / FLICK))) * pitch;
  }
  // A caret: on, a short fade, off, a short fade.
  const blink = (s: number) => {
    const u = s % 1.06;
    return u < 0.53 ? clamp01((0.53 - u) / 0.09) : clamp01((u - 0.97) / 0.09);
  };

  function render() {
    // 1. The question is typed, a character at a time, and sent.
    const tu = phase(t, TYPE[0], TYPE[1]);
    const nc = Math.round(tu * charEnds.length);
    const tw = charEnds.length ? (nc ? charEnds[nc - 1] + 1 : 0) : typedW * tu;
    const sent = phase(t, SEND, SEND + 0.25);
    put(typeClip, "width", (tu >= 1 ? typedW + 4 : tw + 2).toFixed(1));
    op(typed, t > 0 ? 1 - sent : 0);
    tr(typed, 0, -7 * sent);
    op(ph, t <= 0.04 ? 1 - phase(t, 0, 0.04) : phase(t, SEND + 0.2, SEND + 0.55));
    const bq = phase(t, SEND + 0.02, SEND + 0.6);
    op(bubble, bq);
    tr(bubble, 0, (1 - arrive(bq)) * 10);
    // While an answer is being generated the send button is a stop button. (A change of state is played by
    // the stylesheet, not scrubbed: a page stopped anywhere never rests half-way between the two.)
    const gen = t >= SEND && t < STREAM[1];
    op(sendA, gen ? 0 : 1);
    op(sendS, gen ? 1 : 0);

    // The keyboard is in the chat box until the side window takes it, and comes back with the ring.
    const typing = t > 0 && t < SEND;
    const here = Math.min(1 - phase(t, OPEN + 0.3, OPEN + 0.5) + phase(t, BACK + 0.4, BACK + 0.65), 1 - (sent - phase(t, SEND + 0.3, SEND + 0.5)));
    tr(tcaret, t < SEND + 0.27 ? tw + 1 : -1.5, 0); // (in an empty box it stands just clear of the placeholder)
    op(tcaret, clamp01(here) * (typing ? 1 : blink(amb)));

    // 2. Thinking: a wave of weight runs through the word.
    const th = Math.min(phase(t, THINK[0], THINK[0] + 0.45), 1 - phase(t, THINK[1] - 0.3, THINK[1]));
    op(thinking, th);
    op(mark, phase(t, THINK[0], THINK[0] + 0.45));
    if (th > 0) {
      const s = amb / 1.45 + t * 0.25;
      for (let i = 0; i < glyphs.length; i++) {
        const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * frac(s - i * 0.085));
        put(glyphs[i], "fill-opacity", (0.3 + 0.7 * w * w).toFixed(3));
      }
    }

    // 3. Drift notices, and offers the feed; the pointer comes up from the send button and presses Yes.
    const active = t >= NOTICE && t < BACK;
    put(dicon, "class", active ? "dicon on" : "dicon");
    const bd = phase(t, NOTICE, NOTICE + 0.3) * (1 - phase(t, BACK, BACK + 0.25));
    op(badge, bd);
    put(badge, "r", (2.6 * arrive(bd)).toFixed(2));
    const pq = phase(t, POP[0], POP[0] + 0.6), pout = phase(t, POP[1] - 0.4, POP[1]);
    op(popup, Math.min(pq, 1 - pout));
    tr(popup, 0, (1 - arrive(pq)) * -6 - pout * 3);
    const cu = swap(phase(t, POP[0] + 0.4, PRESS - 0.08));
    const off = swap(phase(t, PRESS + 0.22, PRESS + 0.9));
    // Having said yes, the pointer goes where the reading is.
    const ex = small.matches ? cx1 + 30 : rx, ey = small.matches ? cy1 + 40 : ry;
    tr(cursor, lerp(lerp(cx0, cx1, cu), ex, off), lerp(lerp(cy0, cy1, cu), ey, off));
    op(cursor, Math.min(phase(t, POP[0] + 0.3, POP[0] + 0.55), 1 - phase(t, PRESS + 0.75, PRESS + 1.2)));
    const press = phase(t, PRESS, PRESS + 0.07) - phase(t, PRESS + 0.1, PRESS + 0.2);
    put(yes, "transform", `translate(${yx} ${yy}) scale(${(1 - 0.06 * press).toFixed(3)}) translate(${-yx} ${-yy})`);

    // 4. The side window is drawn round its edge, filled, and given its feed; then it has the keyboard.
    const du = phase(t, OPEN, OPEN + 0.6);
    const cl = swap(phase(t, COLLAPSE[0], COLLAPSE[1]));
    const h = lerp(swH, bar, cl);
    op(side, 1 - phase(t, COLLAPSE[1] - 0.1, COLLAPSE[1] + 0.2));
    put(sw, "stroke-dashoffset", (1 - du).toFixed(3));
    op(sw, du > 0 ? 1 : 0);
    put(sw, "height", h.toFixed(2));
    put(swFill, "height", h.toFixed(2));
    op(swFill, phase(t, OPEN + 0.1, OPEN + 0.6));
    op(swBar, phase(t, OPEN + 0.35, OPEN + 0.7));
    put(feedClip, "height", Math.max(0, lerp(clipH, -1, cl)).toFixed(2));
    const away = t >= OPEN + 0.4 && t < BACK;
    put(side, "class", away ? "side focus" : "side");
    put(browser, "class", away ? "blk browser blur" : "blk browser");
    const fq = phase(t, OPEN + 0.5, OPEN + 1.0);
    op(feedG, fq);
    // (The scroll only nudges the feed on: read at any pace, it is flicked at a person's.)
    const moved = feedAt(feedAmb + 0.35 * Math.max(0, t - OPEN - 0.6));
    tr(feedG, 0, (1 - arrive(fq)) * 10 - (moved % G.period));

    // 5. The answer streams in, token by token, a caret at its head.
    const per = (STREAM[1] - STREAM[0]) / G.NTOK;
    let last = -1;
    for (let k = 0; k < G.NTOK; k++) {
      const u = phase(t, STREAM[0] + k * per, STREAM[0] + k * per + per * 2.5);
      if (u > 0) last = k;
      const el = k === G.FRAC_K ? fraction : byK.get(k);
      if (!el) continue;
      if (k === G.FRAC_K) op(el, u);
      else put(el, "fill-opacity", u.toFixed(3));
    }
    const p = ends[Math.max(0, last)];
    if (p) put(caret, "transform", `translate(${(p.x + 2).toFixed(2)} ${p.y})`);
    op(caret, last >= 0 ? 1 - phase(t, STREAM[1], STREAM[1] + 0.16) : 0);

    // 6. The toast, the window folding away, and the ring drawn round the chat: focus is back.
    // (The notice sits on the window's lower edge, and goes up with it as the window folds.)
    const tq = phase(t, TOAST, TOAST + 0.5);
    op(toast, tq);
    tr(toast, 0, (1 - arrive(tq)) * 12 - (swH - h));
    const ru = phase(t, BACK, BACK + 0.6);
    for (const r of rings) {
      put(r, "stroke-dashoffset", (1 - ru).toFixed(3));
      op(r, ru > 0 ? 1 : 0);
    }

    // The mark of the pointer's hold on the story.
    op(mark2, hand.env);
    put(mark2, "x1", hand.x.toFixed(2));
    put(mark2, "x2", hand.x.toFixed(2));

    // The readout times the wait, and then the way back.
    let s = "waiting 0.0 s";
    if (t >= BACK) s = `back in ${BACK_S.toFixed(1)} s`;
    else if (t >= STREAM[1]) s = `back in ${(BACK_S * phase(t, STREAM[1], BACK)).toFixed(1)} s`;
    else if (t >= THINK[0]) s = `waiting ${(WAIT_S * phase(t, THINK[0], STREAM[1])).toFixed(1)} s`;
    if (readout && readout.textContent !== s) readout.textContent = s;
  }

  // ---- the scroll's hold on the clock ----
  // The plate's panel is all there once its top has come up to about 72% of the window, and the first
  // thing to happen in view (the question arriving in the conversation) is timed for then. The story
  // ends as the plate's middle reaches the middle of the window, so a plate at rest there is finished.
  const span: Vars = { start: "top 78%", end: "center 50%" };
  {
    const tl = scrubbed(root, span);
    const clock = { t: 0 };
    tl.to(clock, { t: T, duration: T, ease: "none" });
    tl.eventCallback("onUpdate", () => {
      if (Math.abs(clock.t - scrollT) > 1e-4) {
        // The page moved: the scroll takes the clock back from whoever had it.
        scrollAt = performance.now();
        hand.on = false;
        play = -1;
      }
      scrollT = clock.t;
      if (locked) {
        t = scrollT;
        render();
      }
    });
  }

  measure();
  document.fonts?.ready.then(() => {
    measure();
    render();
  });
  new ResizeObserver(() => {
    measure();
    render();
  }).observe(svg);
  render();

  // ---- time ----
  whileVisible(root, (dt) => {
    amb += dt;
    if (t >= OPEN && t < COLLAPSE[1]) feedAmb += dt;

    // Who has the clock: the pointer if it is scrubbing, a press if one is playing, else the scroll.
    let to = scrollT, by = 0;
    if (play > -1) {
      play += dt * 1.25;
      if (play >= END + 0.3) play = -1;
      else (to = Math.max(0, play)), (by = 14);
    }
    if (hand.on) (to = hand.t), (by = 16);
    else if (!by && !locked && performance.now() - scrollAt < 250) by = 14; // the scroll, taking it back while it moves
    if (by) {
      // A critically damped spring: it closes on the hand as fast as it can without passing it. It has a top
      // speed, so a long way back is run through as a rewind, every beat of it seen, and not cut to.
      locked = false;
      const d = t - to, k = (vel + by * d) * dt, e = Math.exp(-by * dt);
      const next = to + (d + k) * e, far = REWIND * dt;
      vel = (vel - by * k) * e;
      if (Math.abs(next - t) > far) {
        t += Math.sign(next - t) * far;
        vel = Math.sign(next - t) * REWIND;
      } else t = next;
      if (!hand.on && play === -1 && Math.abs(t - to) < 0.004 && Math.abs(vel) < 0.05) (t = to), (vel = 0), (locked = true);
    } else if (!locked) {
      // Let go at rest: the story plays itself out to where the scroll has it, forwards at a person's pace.
      vel = 0;
      t = toward(t, to, dt * (to > t ? 2.6 : 7));
      locked = t === to;
    }
    hand.env = toward(hand.env, hand.on ? 1 : 0, dt / 0.16);
    render();
  });

  // ---- pointer ----
  // Across the plate is across the wait: the left edge is the question, the right edge is being back.
  const hold = (e: PointerEvent) => {
    const m = browser.getScreenCTM();
    if (!m) return;
    const x = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()).x;
    const wide = small.matches ? WM : WD;
    const u = clamp01((x - W0) / wide);
    hand.x = W0 + u * wide;
    hand.t = u * (END + 0.25);
    hand.on = true;
    play = -1;
  };
  let anchor: { x: number; y: number } | null = null; // where the pointer was when it came in, or when the page last moved under it
  let finger: { id: number; x: number; y: number; drag: boolean } | null = null;
  // Any scroll of the page takes the clock back for the scroll, whether or not the story is still in its range.
  window.addEventListener(
    "scroll",
    () => {
      scrollAt = performance.now();
      if (hand.on && !finger) hand.on = false;
      anchor = null;
    },
    { passive: true },
  );
  svg.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse") {
      // A page scrolling under a still pointer is not the pointer moving.
      if (performance.now() - scrollAt < 160 || !anchor) {
        anchor = { x: e.clientX, y: e.clientY };
        return;
      }
      if (hand.on || Math.hypot(e.clientX - anchor.x, e.clientY - anchor.y) >= 4) hold(e);
    } else if (finger && e.pointerId === finger.id) {
      const dx = e.clientX - finger.x, dy = e.clientY - finger.y;
      if (!finger.drag && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) finger.drag = true;
      if (finger.drag) hold(e);
    }
  });
  svg.addEventListener("pointerleave", (e) => {
    if (e.pointerType !== "mouse") return;
    hand.on = false;
    anchor = null;
  });
  svg.addEventListener("pointerdown", (e) => {
    dragged = false;
    if (e.pointerType !== "mouse") finger = { id: e.pointerId, x: e.clientX, y: e.clientY, drag: false };
  });
  let dragged = false; // the click that ends a drag is not a press
  const lift = (e: PointerEvent) => {
    if (!finger || e.pointerId !== finger.id) return;
    dragged = finger.drag;
    hand.on = false;
    finger = null;
  };
  svg.addEventListener("pointerup", lift);
  svg.addEventListener("pointercancel", lift); // the browser took the gesture to scroll the page
  // A press (or a tap) plays the wait through from the start.
  svg.addEventListener("click", (e) => {
    if (dragged) return void (dragged = false);
    hand.on = false;
    anchor = { x: e.clientX, y: e.clientY };
    play = -0.55;
    locked = false;
  });
}
