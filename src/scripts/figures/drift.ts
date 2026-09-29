import { gsap, scrubbed, whileVisible, phase, q, qa } from "../motion";

// The whole story is a pure function of timeline time t (0..T), so it
// scrubs backwards exactly. Ambient loops only add motion on top.
const T = 10;
const TYPE = [0.0, 0.9];
const SEND = 0.95;
const THINK = [1.25, 5.0];
const POP = [1.7, 2.95];
const OPEN = 3.0;
const STREAM = [5.0, 7.4];
const TOAST = 7.5;
const COLLAPSE = [8.1, 8.5];
const WAIT_S = 18.6; // seconds shown on the timer when the answer is ready

const e3 = (u: number) => 1 - (1 - u) ** 3;
const e5 = (u: number) => 1 - (1 - u) ** 5;
const io2 = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

interface Geo { NTOK: number; FRAC_K: number; period: number }

export default function (root: HTMLElement) {
  const svg = q<SVGSVGElement>(root, "svg");
  const G: Geo = JSON.parse(svg.dataset.g!);
  const readout = root.querySelector<HTMLElement>("[data-readout]");
  const op = (el: Element, v: number) => ((el as SVGElement).style.opacity = v.toFixed(3));
  const tr = (el: Element, x: number, y: number) => el.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);

  const browser = q<SVGGElement>(root, ".browser");
  const rings = qa<SVGRectElement>(root, ".ring");
  const typed = q<SVGTextElement>(root, ".typed");
  const typeClip = q<SVGRectElement>(root, ".type-clip");
  const tcaret = q<SVGRectElement>(root, ".tcaret");
  const ph = q<SVGTextElement>(root, ".ph");
  const bubble = q<SVGGElement>(root, ".bubble");
  const mark = q<SVGPathElement>(root, ".mark");
  const thinking = q<SVGGElement>(root, ".thinking");
  const shim = q<SVGRectElement>(root, ".shim");
  const toks = qa<SVGTSpanElement>(root, ".tk");
  const frac = q<SVGGElement>(root, ".frac");
  const caret = q<SVGRectElement>(root, ".caret");
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
  const feedClip = q<SVGRectElement>(root, ".feed-clip");
  const feedG = q<SVGGElement>(root, ".feed");
  const toast = q<SVGGElement>(root, ".toast");

  const swH = Number(sw.getAttribute("height"));
  const clipH = Number(feedClip.getAttribute("height"));
  const bar = Number(feedClip.getAttribute("y")) - Number(sw.getAttribute("y"));
  const [cx1, cy1] = cursor.dataset.to!.split(" ").map(Number);
  const cx0 = cx1 + 46, cy0 = cy1 + 120;
  const yx = Number(yesR.getAttribute("x")) + Number(yesR.getAttribute("width")) / 2;
  const yy = Number(yesR.getAttribute("y")) + Number(yesR.getAttribute("height")) / 2;
  const shimX = Number(shim.getAttribute("x"));

  // Token reveal order and the caret's position after each token (measured
  // once the fonts are in, in the text's own coordinates).
  const byK = new Map<number, SVGTSpanElement>();
  toks.forEach((t) => byK.set(Number(t.dataset.k), t));
  const ends: { x: number; y: number }[] = [];
  let typedW = 0;
  let charEnds: number[] = [];
  const measure = () => {
    for (const line of qa<SVGTextElement>(root, "text.ans")) {
      const y = Number(line.getAttribute("y"));
      let idx = 0;
      for (const t of qa<SVGTSpanElement>(line, ".tk")) {
        idx += t.textContent!.length;
        try {
          const p = line.getEndPositionOfChar(idx - 1);
          ends[Number(t.dataset.k)] = { x: p.x, y };
        } catch {
          /* not laid out */
        }
      }
    }
    const fx = frac.querySelector("line")!;
    ends[G.FRAC_K] = { x: Number(fx.getAttribute("x2")) + 3, y: 182 };
    typedW = typed.getComputedTextLength() + 2;
    const x0 = Number(typed.getAttribute("x"));
    try {
      charEnds = Array.from({ length: typed.getNumberOfChars() }, (_, i) => typed.getEndPositionOfChar(i).x - x0);
    } catch {
      charEnds = [];
    }
  };
  measure();
  document.fonts?.ready.then(() => {
    measure();
    render();
  });

  let t = 0;
  let feedAmb = 0;
  let shimAmb = 0;
  let blink = 0;

  function render() {
    // 1. I type the question and send it
    const tu = phase(t, TYPE[0], TYPE[1]);
    const typing = t >= TYPE[0] && t < SEND;
    op(typed, typing ? 1 : 0);
    op(ph, t < TYPE[0] || t >= SEND ? 1 : 0);
    // one character at a time
    const nc = Math.round(tu * charEnds.length);
    const tw = charEnds.length ? (nc ? charEnds[nc - 1] + 1 : 0) : typedW * tu;
    typeClip.setAttribute("width", (tu >= 1 ? typedW + 4 : tw + 2).toFixed(1));
    op(tcaret, typing ? 1 : 0);
    tcaret.setAttribute("transform", `translate(${(tw + 1).toFixed(2)} 0)`);
    const bu = e3(phase(t, SEND, SEND + 0.3));
    op(bubble, bu);
    tr(bubble, 0, (1 - bu) * 8);
    const generating = t >= SEND && t < STREAM[1];
    op(sendA, generating ? 0 : 1);
    op(sendS, generating ? 1 : 0);

    // 2. thinking
    const th = Math.min(phase(t, THINK[0], THINK[0] + 0.15), 1 - phase(t, THINK[1] - 0.1, THINK[1]));
    op(thinking, th);
    op(mark, phase(t, THINK[0], THINK[0] + 0.15));
    shim.setAttribute("x", (shimX + shimAmb).toFixed(1));

    // 3. Drift offers the feed; I press Yes
    const active = t >= POP[0] - 0.1 && t < COLLAPSE[1];
    dicon.classList.toggle("on", active);
    op(badge, active ? 1 : 0);
    const pu = Math.min(e5(phase(t, POP[0], POP[0] + 0.25)), 1 - phase(t, POP[1] - 0.12, POP[1]));
    op(popup, pu);
    tr(popup, 0, (1 - e5(phase(t, POP[0], POP[0] + 0.25))) * -5);
    const cu = io2(phase(t, 2.05, 2.55));
    const out = e3(phase(t, 2.8, 3.2));
    tr(cursor, lerp(cx0, cx1, cu) + out * 30, lerp(cy0, cy1, cu) + out * 40);
    op(cursor, Math.min(phase(t, 1.95, 2.1), 1 - phase(t, 3.0, 3.2)));
    const press = phase(t, 2.6, 2.66) - phase(t, 2.7, 2.78);
    const sc = 1 - 0.06 * press;
    yes.setAttribute("transform", `translate(${yx} ${yy}) scale(${sc.toFixed(3)}) translate(${-yx} ${-yy})`);

    // 4. the side window opens and takes focus
    const ou = e3(phase(t, OPEN, OPEN + 0.4));
    const cl = io2(phase(t, COLLAPSE[0], COLLAPSE[1]));
    op(side, Math.min(ou, 1 - phase(t, COLLAPSE[1] - 0.08, COLLAPSE[1] + 0.08)));
    tr(side, (1 - ou) * 14, 0);
    sw.setAttribute("height", lerp(swH, bar, cl).toFixed(2));
    feedClip.setAttribute("height", Math.max(0, lerp(clipH, -1, cl)).toFixed(2));
    const away = t >= OPEN + 0.2 && t < COLLAPSE[1];
    side.classList.toggle("focus", away);
    browser.classList.toggle("blur", away);
    const off = ((Math.max(0, t - OPEN) * 40 + feedAmb) % G.period + G.period) % G.period;
    tr(feedG, 0, -off);

    // 5. the answer streams in, token by token
    const per = (STREAM[1] - STREAM[0]) / G.NTOK;
    let last = -1;
    for (let k = 0; k < G.NTOK; k++) {
      const u = phase(t, STREAM[0] + k * per, STREAM[0] + k * per + per * 2.5);
      if (u > 0) last = k;
      const el = k === G.FRAC_K ? frac : byK.get(k);
      if (!el) continue;
      if (k === G.FRAC_K) op(el, u);
      else el.style.fillOpacity = u.toFixed(3);
    }
    const streaming = t >= STREAM[0];
    const done = t >= STREAM[1];
    const p = ends[Math.max(0, last)];
    if (p) caret.setAttribute("transform", `translate(${(p.x + 2).toFixed(2)} ${p.y})`);
    op(caret, streaming && last >= 0 ? (done ? (blink % 1.06 < 0.53 ? 1 : 0) : 1) : 0);

    // 6. the toast, the collapse, and focus comes back
    const tu2 = e3(phase(t, TOAST, TOAST + 0.25));
    op(toast, tu2);
    tr(toast, 0, (1 - tu2) * 10);
    const ru = e3(phase(t, COLLAPSE[1] - 0.05, COLLAPSE[1] + 0.35));
    rings.forEach((r) => {
      op(r, ru);
      r.style.strokeWidth = lerp(4, 1.5, ru).toFixed(2);
    });

    // readout
    let s = "waiting 0.0 s";
    if (t >= COLLAPSE[1]) s = "back in 0.4 s";
    else if (t >= STREAM[1]) s = `back in ${(0.4 * phase(t, STREAM[1], COLLAPSE[1])).toFixed(1)} s`;
    else if (t >= THINK[0]) s = `waiting ${(WAIT_S * phase(t, THINK[0], STREAM[1])).toFixed(1)} s`;
    if (readout && readout.textContent !== s) readout.textContent = s;
  }

  // On phones the plate is short against a tall viewport, so the story has to
  // finish while the whole figure is still on screen.
  const mm = gsap.matchMedia();
  const bind = (vars: Parameters<typeof scrubbed>[1]) => () => {
    const tl = scrubbed(root, vars);
    const clock = { t: 0 };
    tl.to(clock, { t: T, duration: T, ease: "none" });
    tl.eventCallback("onUpdate", () => {
      t = clock.t;
      render();
    });
  };
  mm.add("(min-width: 561px)", bind({ start: "top 85%", end: "center 45%" }));
  mm.add("(max-width: 560px)", bind({ start: "top 65%", end: "bottom 85%" }));
  render();

  // Ambient: the thinking label shimmers, the feed keeps scrolling while you
  // wait, and the caret blinks once the answer is in.
  whileVisible(root, (dt) => {
    let dirty = false;
    if (t >= THINK[0] && t < THINK[1]) {
      shimAmb = (shimAmb + dt * 110) % 170;
      dirty = true;
    }
    if (t >= OPEN && t < COLLAPSE[1]) {
      feedAmb += dt * 26;
      dirty = true;
    }
    if (t >= STREAM[1]) {
      const before = blink % 1.06 < 0.53;
      blink += dt;
      if (before !== blink % 1.06 < 0.53) dirty = true;
    }
    if (dirty) render();
  });
}
