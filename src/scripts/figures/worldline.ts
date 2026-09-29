import { scrubbed, q, qa, whileVisible } from "../motion";
import {
  FRAMES, MAX_BODIES, VIEW_W, CX, CY, TRAIL, ACCENT_TRAIL, TRAIL_ALPHA, ACCENT_ALPHA,
  A_INNER, A_OUTER,
  createUniverse, generate, fingerprint, hex, sci, sparkPath, familyCounts, camDeg,
} from "../worldline";

const F = FRAMES - 1;
const RINGS = [60, 120, 180, 240, 300];
const SPARK_W = 150, SPARK_H = 36;
// Camera breathing: a slow yaw about the disk's axis and a small change of
// elevation, both around the seeded camera. Radians; period in seconds.
const YAW = 0.11, TILT = 0.035, PERIOD = 26;
const RING_LABEL_ANGLE = 0.32;

export default function (root: HTMLElement) {
  const stage = q<HTMLDivElement>(root, ".wl-stage");
  const snap = q<SVGSVGElement>(root, ".wl-snap");
  const canvas = q<HTMLCanvasElement>(root, ".wl-canvas");
  const input = q<HTMLInputElement>(root, "#wl-seed");
  const track = q<HTMLDivElement>(root, ".wl-track");
  const head = q<HTMLSpanElement>(root, ".wl-head");
  const fill = q<HTMLSpanElement>(root, ".wl-fill");
  const ghost = q<HTMLSpanElement>(root, ".wl-ghost");
  const ghostN = q<HTMLSpanElement>(ghost, ".num");
  const keys = qa<HTMLSpanElement>(root, ".wl-key");
  const camEl = q<HTMLSpanElement>(root, "[data-cam]");
  const frameEl = q<HTMLSpanElement>(root, "[data-frame]");
  const deEl = q<HTMLSpanElement>(root, "[data-de]");
  const deMaxEl = q<HTMLSpanElement>(root, "[data-demax]");
  const hashEl = q<HTMLSpanElement>(root, "[data-hash]");
  const nEl = q<HTMLSpanElement>(root, "[data-n]");
  const massEl = q<HTMLSpanElement>(root, "[data-mass]");
  const cEls = [0, 1, 2].map((i) => q<HTMLSpanElement>(root, `[data-c${i}]`));
  const sline = q<SVGPathElement>(root, ".wl-sline");
  const scur = q<SVGLineElement>(root, ".wl-scur");
  const smax = q<SVGCircleElement>(root, ".wl-smax");
  const readout = root.querySelector<HTMLElement>("[data-readout]");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const css = getComputedStyle(root);
  const col = (v: string, d: string) => css.getPropertyValue(v).trim() || d;
  const INK = col("--ink", "#141413");
  const ACC = col("--accent", "#2743d6");
  const GREEN = col("--s-green", "#2e8a5c");
  const VIOLET = col("--s-violet", "#7657c9");
  const SANS = col("--sans", "sans-serif");
  const FAM_COL = [INK, GREEN, VIOLET];

  const u = createUniverse();
  const xyz = u.xyz;
  let seed = input.value;
  generate(seed, u);

  let frame = F; // the frame on screen
  let k = 1; // CSS pixels per view unit
  let dpr = 1;
  let labelFont = "";
  // Camera in use (seeded camera plus breathing), as projection coefficients.
  let pc = 1, ps = 0, pt = 0.5, pl = 0.8;
  let yaw = 0, dtilt = 0;
  let dirty = true;

  function setCamera() {
    const phi = u.cam.phi + yaw;
    pc = Math.cos(phi);
    ps = Math.sin(phi);
    pt = Math.min(0.98, u.cam.tilt + dtilt);
    pl = Math.sqrt(1 - pt * pt);
  }

  // One path per trail piece per family: a few dozen strokes a frame.
  function trace(i: number, from: number, to: number) {
    const c = ctx!;
    for (let f = from; f <= to; f++) {
      const b = (f * MAX_BODIES + i) * 3;
      const x = xyz[b], y = xyz[b + 1], z = xyz[b + 2];
      const sx = CX + x * pc - y * ps, sy = CY + (x * ps + y * pc) * pt - z * pl;
      if (f === from) c.moveTo(sx, sy);
      else c.lineTo(sx, sy);
    }
  }

  function pieces(len: number, alphas: number[], fam: number) {
    const c = ctx!;
    const n = alphas.length;
    for (let p = 0; p < n; p++) {
      const from = Math.max(0, frame - len + Math.round((p * len) / n));
      const to = Math.min(frame, frame - len + Math.round(((p + 1) * len) / n));
      if (to <= from) continue;
      c.globalAlpha = alphas[p];
      c.beginPath();
      if (fam < 0) trace(u.accent, from, to);
      else for (let i = 1; i < u.n; i++) if (i !== u.accent && u.family[i] === fam) trace(i, from, to);
      c.stroke();
    }
  }

  function dot(i: number, r: number) {
    const b = (frame * MAX_BODIES + i) * 3;
    const x = xyz[b], y = xyz[b + 1], z = xyz[b + 2];
    const sx = CX + x * pc - y * ps, sy = CY + (x * ps + y * pc) * pt - z * pl;
    ctx!.moveTo(sx + r, sy);
    ctx!.arc(sx, sy, r, 0, Math.PI * 2);
    return sx;
  }

  function ring(r: number) {
    ctx!.moveTo(CX + r, CY);
    ctx!.ellipse(CX, CY, r, r * pt, 0, 0, Math.PI * 2);
  }

  function draw() {
    const c = ctx!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
    c.lineCap = "round";
    c.lineJoin = "round";
    const px = 1 / k;

    // Polar grid in the disk plane.
    c.strokeStyle = INK;
    c.lineWidth = px;
    c.globalAlpha = 0.07;
    c.beginPath();
    for (const r of RINGS) if (r !== A_INNER && r !== A_OUTER) ring(r);
    for (let j = 0; j < 12; j++) {
      const a = (j * Math.PI) / 6;
      const ca = Math.cos(a), sa = Math.sin(a);
      const dx = ca * pc - sa * ps, dy = (ca * ps + sa * pc) * pt;
      c.moveTo(CX + 18 * dx, CY + 18 * dy);
      c.lineTo(CX + 300 * dx, CY + 300 * dy);
    }
    c.stroke();
    // Family boundaries.
    c.setLineDash([3 * px, 4 * px]);
    c.lineCap = "butt";
    c.globalAlpha = 0.45;
    c.strokeStyle = GREEN;
    c.beginPath();
    ring(A_INNER);
    c.stroke();
    c.globalAlpha = 0.4;
    c.strokeStyle = VIOLET;
    c.beginPath();
    ring(A_OUTER);
    c.stroke();
    c.setLineDash([]);
    c.lineCap = "round";
    c.globalAlpha = 0.56;
    c.fillStyle = INK;
    c.font = labelFont;
    const sa = Math.sin(RING_LABEL_ANGLE), ca = Math.cos(RING_LABEL_ANGLE);
    c.fillText(`a = ${A_INNER}`, CX + A_INNER * ca + 3 * px, CY + A_INNER * pt * sa + 13 * px);
    c.fillText(`a = ${A_OUTER}`, CX + A_OUTER * ca + 3 * px, CY + A_OUTER * pt * sa + 13 * px);

    // Trails, by family, oldest pieces faintest.
    c.lineWidth = px;
    for (let fam = 0; fam < 3; fam++) {
      c.strokeStyle = FAM_COL[fam];
      pieces(TRAIL, TRAIL_ALPHA, fam);
    }
    c.strokeStyle = ACC;
    c.lineWidth = 1.5 * px;
    pieces(ACCENT_TRAIL, ACCENT_ALPHA, -1);

    // Bodies, sized by mass (never below about 0.7 CSS px of radius on a phone).
    const dk = Math.max(1, 0.66 / k);
    c.globalAlpha = 1;
    for (let fam = 0; fam < 3; fam++) {
      c.fillStyle = FAM_COL[fam];
      c.beginPath();
      for (let i = 1; i < u.n; i++) if (i !== u.accent && u.family[i] === fam) dot(i, u.size[i] * dk);
      c.fill();
    }
    c.fillStyle = INK;
    c.beginPath();
    dot(0, u.size[0] * dk);
    c.fill();
    c.globalAlpha = 0.14;
    c.strokeStyle = INK;
    c.lineWidth = px;
    c.beginPath();
    dot(0, 9 * dk);
    c.stroke();
    c.globalAlpha = 0.35;
    c.strokeStyle = ACC;
    c.beginPath();
    dot(u.accent, (u.size[u.accent] + 3.5) * dk);
    c.stroke();
    c.globalAlpha = 1;
    c.fillStyle = ACC;
    c.beginPath();
    dot(u.accent, u.size[u.accent] * dk);
    c.fill();

    // Callout on the planet, flipped to stay inside the viewport.
    const b = (frame * MAX_BODIES + u.accent) * 3;
    const x = xyz[b], y = xyz[b + 1], z = xyz[b + 2];
    const sx = CX + x * pc - y * ps, sy = CY + (x * ps + y * pc) * pt - z * pl;
    const dir = sx > VIEW_W - 90 / k ? -1 : 1;
    const r0 = (u.size[u.accent] + 5) * dk;
    c.globalAlpha = 0.5;
    c.strokeStyle = INK;
    c.lineWidth = px;
    c.beginPath();
    c.moveTo(sx + dir * r0 * 0.7, sy - r0 * 0.7);
    c.lineTo(sx + dir * 16 * px, sy - 16 * px);
    c.lineTo(sx + dir * 30 * px, sy - 16 * px);
    c.stroke();
    c.globalAlpha = 1;
    c.fillStyle = ACC;
    c.font = labelFont;
    c.textAlign = dir > 0 ? "left" : "right";
    c.fillText("planet", sx + dir * 33 * px, sy - 12.5 * px);
    c.textAlign = "left";
  }

  // Everything around the viewport that follows the frame.
  let shownKeys = -1;
  let deText = "";
  function syncFrame() {
    const p = frame / F;
    const pc100 = `${(p * 100).toFixed(3)}%`;
    head.style.left = pc100;
    fill.style.transform = `scaleX(${p.toFixed(4)})`;
    frameEl.textContent = String(frame + 1);
    const de = sci(u.dE[frame]);
    if (de !== deText) deEl.innerHTML = deText = de;
    const sx = (p * SPARK_W).toFixed(1);
    scur.setAttribute("x1", sx);
    scur.setAttribute("x2", sx);
    head.setAttribute("aria-valuenow", String(frame + 1));
    const on = Math.floor((frame + 1) / 100);
    if (on !== shownKeys) {
      shownKeys = on;
      keys.forEach((el, j) => el.classList.toggle("on", j <= on));
    }
  }

  let camText = "";
  function syncCamera() {
    const d = camDeg(u.cam.phi + yaw, pt);
    const s = `az ${d.az.toFixed(1)}° el ${d.el.toFixed(1)}°`;
    if (s !== camText) camEl.textContent = camText = s;
  }

  function syncUniverse() {
    hashEl.textContent = hex(fingerprint(seed));
    nEl.textContent = String(u.n);
    massEl.textContent = u.totalMass.toFixed(4);
    const counts = familyCounts(u);
    cEls.forEach((el, i) => (el.textContent = String(counts[i])));
    sline.setAttribute("d", sparkPath(u, SPARK_W, SPARK_H));
    deMaxEl.innerHTML = sci(u.dEmax);
    const mx = ((u.dEmaxFrame / F) * SPARK_W).toFixed(1);
    smax.setAttribute("cx", mx);
  }

  function resize() {
    const w = stage.clientWidth;
    if (!w) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    k = w / VIEW_W;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round((w * 400 * dpr) / VIEW_W);
    labelFont = `${10.5 / k}px ${SANS}`;
    dirty = true;
    draw();
  }

  // Frame control. Scroll owns the timeline; a drag (or the keyboard) takes it
  // while held, then eases back to wherever the scroll has got to.
  type Mode = "scroll" | "hold" | "return";
  let mode: Mode = "scroll";
  let scrollF = 0;
  let heldF = 0;
  let shownF = 0;
  let lastMove = -1e9;

  const state = { f: 0 };
  scrubbed(root, { end: "center 40%" }).to(state, {
    f: F,
    duration: 1,
    onUpdate() {
      scrollF = state.f;
      lastMove = performance.now();
    },
  });
  scrollF = state.f;
  shownF = scrollF;
  frame = Math.round(shownF);
  setCamera();

  // Swap the static snapshot for the live canvas.
  snap.style.display = "none";
  canvas.style.display = "block";
  new ResizeObserver(resize).observe(stage);
  document.fonts?.ready.then(() => (dirty = true));
  syncFrame();
  syncCamera();

  let theta = 0, speed = 0;
  whileVisible(root, (dt) => {
    const now = performance.now();
    // Frame.
    if (mode === "hold") shownF = heldF;
    else if (mode === "return") {
      shownF += (scrollF - shownF) * (1 - Math.exp(-dt * 7));
      if (Math.abs(scrollF - shownF) < 0.5) mode = "scroll";
      lastMove = now;
    } else shownF = scrollF;
    const f = Math.max(0, Math.min(F, Math.round(shownF)));
    if (f !== frame) {
      frame = f;
      dirty = true;
      syncFrame();
    }
    // Camera breathes only while the timeline is at rest.
    const idle = mode !== "hold" && now - lastMove > 450;
    speed += ((idle ? 1 : 0) - speed) * (1 - Math.exp(-dt * 1.6));
    if (speed > 1e-4) {
      theta += dt * speed * ((Math.PI * 2) / PERIOD);
      yaw = YAW * Math.sin(theta);
      dtilt = TILT * Math.sin(0.61 * theta);
      setCamera();
      syncCamera();
      dirty = true;
    }
    if (dirty) {
      dirty = false;
      draw();
    }
  });

  // Scrubber: pointer and keyboard.
  track.dataset.live = "";
  head.setAttribute("role", "slider");
  head.setAttribute("tabindex", "0");
  head.setAttribute("aria-label", "Timeline frame. Arrow keys step one frame, Page Up and Page Down jump 100.");
  head.setAttribute("aria-valuemin", "1");
  head.setAttribute("aria-valuemax", String(FRAMES));
  let rect: DOMRect | null = null;
  const frameAt = (clientX: number) => {
    const r = rect ?? track.getBoundingClientRect();
    return Math.max(0, Math.min(F, Math.round(((clientX - r.left) / r.width) * F)));
  };
  let dragging = -1;
  track.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    rect = track.getBoundingClientRect();
    dragging = e.pointerId;
    track.setPointerCapture(e.pointerId);
    mode = "hold";
    heldF = frameAt(e.clientX);
    ghost.hidden = true;
    if (e.pointerType === "mouse") e.preventDefault();
  });
  track.addEventListener("pointermove", (e) => {
    if (dragging === e.pointerId) {
      heldF = frameAt(e.clientX);
      return;
    }
    if (e.pointerType !== "mouse") return;
    const r = track.getBoundingClientRect();
    const f = frameAt(e.clientX);
    ghost.hidden = false;
    ghost.style.left = `${((f / F) * r.width).toFixed(1)}px`;
    ghostN.textContent = String(f + 1);
  });
  const letGo = (e: PointerEvent) => {
    if (dragging !== e.pointerId) return;
    dragging = -1;
    rect = null;
    if (document.activeElement !== head) mode = "return";
  };
  track.addEventListener("pointerup", letGo);
  track.addEventListener("pointercancel", letGo);
  track.addEventListener("pointerleave", () => (ghost.hidden = true));

  head.addEventListener("keydown", (e) => {
    const base = mode === "hold" ? heldF : frame;
    let f = base;
    switch (e.key) {
      case "ArrowRight": case "ArrowUp": f += e.shiftKey ? 10 : 1; break;
      case "ArrowLeft": case "ArrowDown": f -= e.shiftKey ? 10 : 1; break;
      case "PageUp": f += 100; break;
      case "PageDown": f -= 100; break;
      case "Home": f = 0; break;
      case "End": f = F; break;
      default: return;
    }
    e.preventDefault();
    mode = "hold";
    heldF = Math.max(0, Math.min(F, f));
  });
  head.addEventListener("blur", () => {
    if (mode === "hold" && dragging < 0) mode = "return";
  });

  // Seed input.
  const label = (s: string) => (s.length > 12 ? s.slice(0, 11) + "…" : s);
  const show = (s: string) => {
    if (readout) readout.textContent = `seed ${label(s)} → ${hex(fingerprint(s))}`;
  };
  let timer = 0;
  input.disabled = false;
  input.addEventListener("input", () => {
    const s = input.value;
    show(s);
    hashEl.textContent = hex(fingerprint(s));
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (s === seed) return;
      seed = s;
      generate(seed, u);
      setCamera();
      syncUniverse();
      syncFrame();
      syncCamera();
      dirty = true;
    }, 160);
  });
}
