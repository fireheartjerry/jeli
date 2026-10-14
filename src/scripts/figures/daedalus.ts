import { gsap, scrubbed, whileVisible, q, qa, T } from "../motion";
import {
  VIEW, CAM0, PIP, TOOLS, USES, captionOpacity, gesture, seen, mesh, floor, gizmo, pip, dimension, tipLabels, bonesPath, fmt, readout, sway,
} from "../geo/daedalus";

const NS = "http://www.w3.org/2000/svg";
const r1 = (v: number) => (Math.round(v * 10) / 10).toString();
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const ease = (u: number) => u * u * (3 - 2 * u);
type P = [number, number];

/** The story starts when the webcam's inset, the first thing the hand is seen in, has come this far up the window. */
const LINE = 92;
/** How far the view leans toward the pointer, radians of yaw and of tilt across the whole viewport. */
const LEAN = { yaw: 0.62, tilt: 0.2 };

export default function (root: HTMLElement) {
  const svg = q<SVGSVGElement>(root, "svg.dd");
  const $ = <T extends Element = SVGElement>(sel: string) => q<T>(root, sel);

  // Scene.
  const meshG = $<SVGGElement>(".dd-mesh");
  const pool = qa<SVGPathElement>(root, ".dd-f").map((el) => ({ el, d: el.getAttribute("d") ?? "", shade: "", tint: "", edge: "" }));
  const grid = $(".dd-grid"), axX = $(".dd-ax-x"), axZ = $(".dd-ax-z");
  const gzLines = qa<SVGLineElement>(root, ".dd-gz"), gzLabels = qa<SVGTextElement>(root, ".dd-gzl");

  // UI.
  const toolsG = $<SVGGElement>(".dd-tools");
  const tools = qa<SVGGElement>(root, ".dd-tool");
  const caps = qa<SVGTextElement>(root, ".dd-capt");
  const dimG = $(".dd-dim");
  const hit = $<SVGRectElement>(".dd-hit");

  // Hand, and its copy in the webcam inset.
  const handG = $<SVGGElement>(".dd-hand");
  const halo = $(".dd-halo"), bones = $(".dd-bones");
  const HALO = parseFloat(getComputedStyle(halo).opacity) || 1; // how strong the stylesheet draws the halo behind the bones
  const dots = qa<SVGCircleElement>(root, ".dd-lm").map((el) => ({ el, o: -1 }));
  const idx = qa<SVGTextElement>(root, ".dd-idx");
  const ext = $(".dd-ext"), line = $(".dd-line"), val = $<SVGTextElement>(".dd-val");
  const pbones = $(".dd-pbones");
  const pdots = qa<SVGCircleElement>(root, ".dd-plm").map((el) => ({ el, o: -1 }));
  const out = root.querySelector<HTMLElement>("[data-readout]");

  // ---- the toolbar: one highlight that travels, rather than a class that jumps.
  // Where each tool's button is, read from the markup.
  const slot = tools.map((el) => {
    const m = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(el.getAttribute("transform") ?? "");
    return { x: m ? +m[1] : 0, y: m ? +m[2] : 0 };
  });
  const uses = USES.map((name) => TOOLS.indexOf(name)); // which button each gesture's tool is
  const sel = document.createElementNS(NS, "rect");
  sel.setAttribute("class", "dd-sel");
  for (const [k, v] of Object.entries({ x: slot[0].x - 12, width: 24, height: 24, rx: 5 })) sel.setAttribute(k, String(v));
  for (const a of toolsG.getAttributeNames()) if (a.startsWith("data-astro-cid")) sel.setAttribute(a, "");
  toolsG.insertBefore(sel, tools[0]);
  // A name beside each gesture's button; the one written in the markup is the last gesture's.
  const written = $<SVGTextElement>(".dd-tname");
  const names = USES.map((name, b) => {
    const el = b === USES.length - 1 ? written : (written.cloneNode(false) as SVGTextElement);
    if (el !== written) {
      el.textContent = name;
      el.setAttribute("y", String(slot[uses[b]].y));
      toolsG.append(el);
    }
    return el;
  });
  toolsG.dataset.live = "";
  // Which gesture the interface shows: a number that moves from one to the next in its own time.
  const ui = { at: 0 };
  let shownBeat = 0;
  const pitch = slot[1].y - slot[0].y; // from one button to the next
  function drawUi() {
    const lo = Math.floor(ui.at), hi = Math.min(USES.length - 1, lo + 1), u = ui.at - lo;
    const y = slot[uses[lo]].y + (slot[uses[hi]].y - slot[uses[lo]].y) * u;
    sel.setAttribute("y", r1(y - 12));
    // A glyph is lit by as much of the highlight as is over it, so one the highlight passes on its way is lit in passing.
    tools.forEach((el, i) => el.style.setProperty("--sel", Math.max(0, 1 - Math.abs(y - slot[i].y) / pitch).toFixed(2)));
    USES.forEach((_, b) => names[b].setAttribute("opacity", Math.max(0, 1 - Math.abs(ui.at - b)).toFixed(2)));
    caps.forEach((c, i) => c.setAttribute("opacity", `${captionOpacity(i, ui.at)}`));
  }

  // ---- a pinch that takes hold: one ring opening from the tips.
  const touch = document.createElementNS(NS, "circle");
  touch.setAttribute("class", "dd-touch");
  for (const a of handG.getAttributeNames()) if (a.startsWith("data-astro-cid")) touch.setAttribute(a, "");
  touch.style.opacity = "0";
  handG.append(touch);
  const ring = { v: 0 };
  let wasGrabbed = false;

  // Labels grow on phones (CSS); give the gap label room to match. Read on resize only.
  let gapScale = 1;
  const measure = () => {
    gapScale = Math.max(1, parseFloat(getComputedStyle(val).fontSize) / 12);
  };
  measure();

  const state = { t: 0 };
  const orbit = { yaw: 0, tilt: 0 }; // what a drag adds to the view
  // What the pointer, just resting on the viewport, adds: the view leans toward it. A spring, so it never passes its mark.
  const lean = { yaw: 0, tilt: 0, vy: 0, vt: 0, toYaw: 0, toTilt: 0 };
  let clock = 0;
  // How free the view is to move on its own (0 while the hand is at the surface), and for how long it has been.
  let free = 1, swayT = 0;
  let g = gesture(0);
  let prev = "";
  let sceneKey = "";

  // A tracked hand is never quite still: each landmark quivers a fraction of a
  // pixel on its own, and the whole hand drifts a pixel or two with the arm.
  // Two periods each, none shared, so nothing is seen to repeat.
  const lm: P[] = g.lm.map(() => [0, 0] as P);
  function track() {
    const k = 1 - 0.7 * g.engage; // steadier while it holds the clay
    const dx = k * (1.1 * Math.sin(0.9 * clock) + 0.7 * Math.sin(0.37 * clock + 1));
    const dy = k * (1.0 * Math.sin(0.7 * clock + 2) + 0.6 * Math.sin(0.43 * clock));
    for (let i = 0; i < lm.length; i++) {
      const f = i * 2.399963;
      lm[i][0] = g.lm[i][0] + dx + k * (0.34 * Math.sin(5.1 * clock + f) + 0.22 * Math.sin(8.7 * clock + 1.7 * f));
      lm[i][1] = g.lm[i][1] + dy + k * (0.34 * Math.sin(4.6 * clock + 2.1 * f) + 0.22 * Math.sin(9.3 * clock + 0.6 * f));
    }
  }

  let gAt = 0;
  function drawHand() {
    // The gesture is worked out again only when the scroll has moved it; the tracking's quiver is added every frame.
    if (state.t !== gAt) g = gesture((gAt = state.t));
    track();
    const d = bonesPath(lm);
    halo.setAttribute("d", d);
    bones.setAttribute("d", d);
    // The skeleton is joined up once most of its landmarks are in.
    const joined = ease(clamp((g.find - 0.35) / 0.65, 0, 1));
    bones.style.opacity = pbones.style.opacity = joined.toFixed(2);
    halo.style.opacity = (HALO * joined).toFixed(2);
    const p = pip(lm);
    pbones.setAttribute("d", bonesPath(p));
    for (let i = 0; i < lm.length; i++) {
      const o = seen(i, g.find);
      const a = dots[i], b = pdots[i];
      a.el.setAttribute("cx", r1(lm[i][0]));
      a.el.setAttribute("cy", r1(lm[i][1]));
      b.el.setAttribute("cx", r1(p[i][0]));
      b.el.setAttribute("cy", r1(p[i][1]));
      if (o !== a.o) a.el.style.opacity = b.el.style.opacity = `${(a.o = o)}`;
    }
    // The two tips the tools read, numbered as MediaPipe numbers them. Pinched together the two numbers
    // would be written on top of each other, so they step back as the tips close and return as they part.
    const tips = Math.min(seen(4, g.find), seen(8, g.find));
    const apart = ease(clamp((Math.hypot(lm[4][0] - lm[8][0], lm[4][1] - lm[8][1]) - 16) / 16, 0, 1));
    tipLabels(lm, gapScale).forEach(([x, y], j) => {
      idx[j].setAttribute("x", r1(x));
      idx[j].setAttribute("y", r1(y));
      idx[j].style.opacity = (tips * apart).toFixed(2);
    });
    const dim = dimension(lm, gapScale);
    ext.setAttribute("d", dim.ext);
    line.setAttribute("d", dim.line);
    val.setAttribute("x", r1(dim.label[0]));
    val.setAttribute("y", r1(dim.label[1]));
    dimG.setAttribute("opacity", `${Math.round(dim.on * (1 - g.relax) * tips * 100) / 100}`);
    // The gap is measured on the landmarks as they are tracked, quiver and all.
    const pinch = Math.hypot(lm[4][0] - lm[8][0], lm[4][1] - lm[8][1]) / Math.hypot(lm[0][0] - lm[9][0], lm[0][1] - lm[9][1]);
    const v = fmt(pinch);
    if (val.textContent !== v) val.textContent = v;

    // The toolbar and the corner caption follow the gesture, in their own time.
    if (g.beat !== shownBeat) {
      shownBeat = g.beat;
      gsap.to(ui, { at: g.beat, duration: T.state, ease: "swap", overwrite: true, onUpdate: drawUi });
    }
    if (g.grabbed !== wasGrabbed) {
      wasGrabbed = g.grabbed;
      if (g.grabbed) gsap.fromTo(ring, { v: 0 }, { v: 1, duration: 0.7, ease: "arrive", overwrite: true });
    }
    if (ring.v > 0 && ring.v < 1) {
      touch.setAttribute("cx", r1((lm[4][0] + lm[8][0]) / 2));
      touch.setAttribute("cy", r1((lm[4][1] + lm[8][1]) / 2));
      touch.setAttribute("r", r1(5 + 17 * ring.v));
      touch.style.opacity = (0.85 * (1 - ring.v)).toFixed(2);
    } else if (touch.style.opacity !== "0") touch.style.opacity = "0";

    const text = readout(tips >= 1 ? pinch : null, g.S);
    if (out && text !== prev) out.textContent = text;
    prev = text;
  }

  function drawScene() {
    const f = ease(free);
    const s = sway(swayT);
    const cam = {
      yaw: CAM0.yaw + (s.yaw + lean.yaw) * f + orbit.yaw,
      tilt: clamp(CAM0.tilt + (s.tilt + lean.tilt) * f + orbit.tilt, 0.02, 1.2),
    };
    const clay = g.clayAt ? `${r1(g.clayAt[0])},${r1(g.clayAt[1])}` : "";
    const key = `${cam.yaw.toFixed(4)} ${cam.tilt.toFixed(4)} ${g.S.toFixed(4)} ${g.sculpt.toFixed(4)} ${clay}`;
    if (key === sceneKey) return;
    sceneKey = key;

    const { faces } = mesh(cam, g.S, g.clayAt, g.sculpt);
    // Grow the pool if this view shows more faces than any before it.
    while (pool.length < faces.length) {
      const el = document.createElementNS(NS, "path");
      el.setAttribute("class", "dd-f");
      for (const a of meshG.getAttributeNames()) if (a.startsWith("data-astro-cid")) el.setAttribute(a, "");
      meshG.append(el);
      pool.push({ el, d: "", shade: "", tint: "", edge: "" });
    }
    // Faces carry their lighting, not a colour: the stylesheet mixes it from the theme.
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i], f = faces[i];
      const d = f ? f.d : "";
      if (p.d !== d) p.el.setAttribute("d", (p.d = d));
      if (!f) continue;
      if (p.shade !== f.shade) p.el.style.setProperty("--shade", (p.shade = f.shade));
      if (p.tint !== f.tint) p.el.style.setProperty("--tint", (p.tint = f.tint));
      if (p.edge !== f.edge) p.el.style.setProperty("--edge", (p.edge = f.edge));
    }

    const fl = floor(cam);
    grid.setAttribute("d", fl.grid);
    axX.setAttribute("d", fl.x);
    axZ.setAttribute("d", fl.z);
    gizmo(cam).forEach((a, i) => {
      gzLines[i].setAttribute("x2", `${a.x}`);
      gzLines[i].setAttribute("y2", `${a.y}`);
      gzLabels[i].setAttribute("x", r1(a.x * 1.5));
      gzLabels[i].setAttribute("y", r1(a.y * 1.5));
      // Axes pointing away read dimmer, the way viewport gizmos show depth (and dim by degrees as they turn away).
      const o = (0.45 + 0.55 * clamp((a.z + 0.35) / 0.3, 0, 1)).toFixed(2);
      gzLines[i].style.opacity = o;
      gzLabels[i].style.opacity = o;
    });
  }

  drawUi();
  drawHand();
  drawScene();
  window.addEventListener("resize", measure);

  // Where in the plate, px below its top, a height of the drawing falls.
  const below = (y: number) => {
    const r = root.getBoundingClientRect(), b = svg.getBoundingClientRect();
    return b.top - r.top + (y / VIEW.h) * b.height;
  };
  const tl = scrubbed(root, { start: () => `top+=${Math.round(below(PIP.y + PIP.h))} ${LINE}%`, end: "center 50%" });
  let drawn = -1e9; // when the loop below last drew the plate
  tl.to(state, {
    t: 1,
    duration: 1,
    onUpdate() {
      // Off screen that loop is asleep; the story is still drawn, so the plate is right the moment it is seen.
      if (performance.now() - drawn < 120) return;
      drawHand();
      drawScene();
    },
  });
  // What is above the plate can change height after it has measured itself
  // (type is split into lines to rise, then put back); measure again then.
  {
    const st = tl.scrollTrigger!;
    let queued = false;
    const again = () => {
      queued = false;
      st.refresh();
      st.update();
    };
    const ro = new ResizeObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(again);
    });
    ro.observe(document.body);
    ro.observe(root);
  }

  // Every frame the plate is on screen: the hand as tracked, and the view.
  // The view gives way at once when the hand comes to the surface (the clay is
  // pulled in the home view) and takes a couple of seconds to drift off again.
  whileVisible(root, (dt) => {
    drawn = performance.now();
    clock += dt;
    const want = 1 - g.engage;
    free += clamp(want - free, -dt / 0.3, dt / 2.4);
    // Held at home, the drift starts over: when the view is let go it leaves from rest, not from where it had got to.
    if (free <= 0) swayT = 0;
    else swayT += dt * ease(free);
    // The lean: a critically damped spring toward where the pointer asks.
    const w = 5.5;
    for (const [x, v, to] of [["yaw", "vy", "toYaw"], ["tilt", "vt", "toTilt"]] as const) {
      const d = lean[x] - lean[to], k = (lean[v] + w * d) * dt, e = Math.exp(-w * dt);
      lean[x] = lean[to] + (d + k) * e;
      lean[v] = (lean[v] - w * k) * e;
    }
    drawHand();
    drawScene();
  });

  // Pointer. Resting on the viewport it leans the view toward itself; a drag
  // orbits it freely, and it comes home on release. Up and down on a touch
  // screen is still the page's.
  let drag: { id: number; x: number; y: number; on: boolean; y0: number; t0: number; k: number } | null = null;
  const rest = () => {
    lean.toYaw = lean.toTilt = 0;
  };
  hit.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") {
      if (e.button !== 0) return;
      e.preventDefault();
    }
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false, y0: orbit.yaw, t0: orbit.tilt, k: VIEW.w / svg.getBoundingClientRect().width };
  });
  // Where the viewport is in the window: measured when the pointer comes onto it, and again only if the page has moved since.
  let box: DOMRect | null = null, boxAt = 0;
  hit.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) {
      if (e.pointerType !== "mouse") return;
      if (!box || boxAt !== window.scrollY) {
        box = svg.getBoundingClientRect();
        boxAt = window.scrollY;
      }
      lean.toYaw = ((e.clientX - box.left) / box.width - 0.5) * LEAN.yaw;
      lean.toTilt = ((e.clientY - box.top) / box.height - 0.5) * LEAN.tilt;
      return;
    }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.on) {
      if (Math.hypot(dx, dy) < 6) return;
      drag.on = true;
      gsap.killTweensOf(orbit);
      hit.setPointerCapture(e.pointerId);
      hit.classList.add("dragging");
      rest();
    }
    orbit.yaw = drag.y0 + dx * drag.k * 0.011;
    orbit.tilt = clamp(drag.t0 + dy * drag.k * 0.006, -0.32, 0.8);
  });
  const release = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.on) {
      // Come home the short way round.
      orbit.yaw = Math.atan2(Math.sin(orbit.yaw), Math.cos(orbit.yaw));
      gsap.to(orbit, { yaw: 0, tilt: 0, duration: 1.5, ease: "arrive" });
    }
    hit.classList.remove("dragging");
    drag = null;
  };
  hit.addEventListener("pointerup", release);
  hit.addEventListener("pointercancel", release);
  hit.addEventListener("pointerleave", () => {
    box = null;
    rest();
  });
  window.addEventListener("resize", () => (box = null));
}
