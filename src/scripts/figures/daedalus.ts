import { gsap, scrubbed, whileVisible, q, qa } from "../motion";
import { VIEW, CAM0, TOOLS, captionOpacity, gesture, mesh, floor, gizmo, pip, dimension, bonesPath, fmt, readout, sway } from "../geo/daedalus";

const NS = "http://www.w3.org/2000/svg";
const r1 = (v: number) => (Math.round(v * 10) / 10).toString();
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export default function (root: HTMLElement) {
  const svg = q<SVGSVGElement>(root, "svg.dd");
  const $ = <T extends Element = SVGElement>(sel: string) => q<T>(root, sel);

  // Scene.
  const meshG = $<SVGGElement>(".dd-mesh");
  const pool = qa<SVGPathElement>(root, ".dd-f").map((el) => ({ el, d: "", fill: "", stroke: "" }));
  const grid = $(".dd-grid"), axX = $(".dd-ax-x"), axZ = $(".dd-ax-z");
  const gzLines = qa<SVGLineElement>(root, ".dd-gz"), gzLabels = qa<SVGTextElement>(root, ".dd-gzl");

  // UI.
  const tools = qa<SVGGElement>(root, ".dd-tool");
  const tname = $<SVGTextElement>(".dd-tname");
  const caps = qa<SVGTextElement>(root, ".dd-capt");
  const dimG = $(".dd-dim");
  const hit = $<SVGRectElement>(".dd-hit");

  // Hand, and its copy in the webcam inset.
  const halo = $(".dd-halo"), bones = $(".dd-bones");
  const dots = qa<SVGCircleElement>(root, ".dd-lm");
  const ext = $(".dd-ext"), line = $(".dd-line"), val = $<SVGTextElement>(".dd-val");
  const pbones = $(".dd-pbones");
  const pdots = qa<SVGCircleElement>(root, ".dd-plm");
  const out = root.querySelector<HTMLElement>("[data-readout]");

  // Labels grow on phones (CSS); give the gap label room to match. Read on resize only.
  let gapScale = 1;
  const measure = () => {
    gapScale = Math.max(1, parseFloat(getComputedStyle(val).fontSize) / 12);
  };
  measure();

  const state = { t: 0 };
  const orbit = { yaw: 0, tilt: 0 }; // what a drag adds to the view
  let clock = 0;
  let g = gesture(0);
  let prev = "";
  let sceneKey = "";

  function drawHand() {
    g = gesture(state.t);
    const d = bonesPath(g.lm);
    halo.setAttribute("d", d);
    bones.setAttribute("d", d);
    g.lm.forEach(([x, y], i) => {
      dots[i].setAttribute("cx", r1(x));
      dots[i].setAttribute("cy", r1(y));
    });
    const dim = dimension(g.lm, gapScale);
    ext.setAttribute("d", dim.ext);
    line.setAttribute("d", dim.line);
    val.setAttribute("x", r1(dim.label[0]));
    val.setAttribute("y", r1(dim.label[1]));
    dimG.setAttribute("opacity", `${Math.round(dim.on * (1 - g.relax) * 100) / 100}`);
    const v = fmt(g.pinch);
    if (val.textContent !== v) val.textContent = v;

    const p = pip(g.lm);
    pbones.setAttribute("d", bonesPath(p));
    p.forEach(([x, y], i) => {
      pdots[i].setAttribute("cx", r1(x));
      pdots[i].setAttribute("cy", r1(y));
    });

    // The toolbar and the corner caption follow the gesture.
    const ti = TOOLS.indexOf(g.tool);
    tools.forEach((el, i) => el.classList.toggle("on", i === ti));
    tname.setAttribute("y", `${64 + ti * 30}`);
    if (tname.textContent !== g.tool) tname.textContent = g.tool;
    caps.forEach((c, i) => c.setAttribute("opacity", `${captionOpacity(i, state.t)}`));

    const text = readout(g.pinch, g.S);
    if (out && text !== prev) out.textContent = text;
    prev = text;
  }

  function drawScene() {
    const cam = {
      yaw: CAM0.yaw + sway(clock) * (1 - g.engage) + orbit.yaw,
      tilt: clamp(CAM0.tilt + orbit.tilt, 0.02, 1.2),
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
      pool.push({ el, d: "", fill: "", stroke: "" });
    }
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i], f = faces[i];
      const d = f ? f.d : "";
      if (p.d !== d) p.el.setAttribute("d", (p.d = d));
      if (!f) continue;
      if (p.fill !== f.fill) p.el.setAttribute("fill", (p.fill = f.fill));
      if (p.stroke !== f.stroke) p.el.setAttribute("stroke", (p.stroke = f.stroke));
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
      // Axes pointing away read dimmer, the way viewport gizmos show depth.
      const o = a.z < -0.2 ? "0.45" : "1";
      gzLines[i].style.opacity = o;
      gzLabels[i].style.opacity = o;
    });
  }

  const render = () => {
    drawHand();
    drawScene();
  };
  render();
  window.addEventListener("resize", () => {
    measure();
    drawHand();
  });

  scrubbed(root, { start: "top 85%", end: "center 45%" }).to(state, { t: 1, duration: 1, onUpdate: render });

  // Ambient: the view orbits slowly while the hand is away from the surface.
  whileVisible(root, (dt) => {
    clock += dt;
    drawScene();
  });

  // Pointer: drag to orbit the viewport; it eases home on release.
  let drag: { id: number; x: number; y: number; on: boolean; y0: number; t0: number; k: number } | null = null;
  hit.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") {
      if (e.button !== 0) return;
      e.preventDefault();
    }
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false, y0: orbit.yaw, t0: orbit.tilt, k: VIEW.w / svg.getBoundingClientRect().width };
  });
  hit.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.on) {
      if (Math.hypot(dx, dy) < 6) return;
      drag.on = true;
      gsap.killTweensOf(orbit);
      hit.setPointerCapture(e.pointerId);
      hit.classList.add("dragging");
    }
    orbit.yaw = drag.y0 + dx * drag.k * 0.011;
    orbit.tilt = clamp(drag.t0 + dy * drag.k * 0.006, -0.32, 0.8);
  });
  const release = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.on) {
      // Come home the short way round.
      orbit.yaw = Math.atan2(Math.sin(orbit.yaw), Math.cos(orbit.yaw));
      gsap.to(orbit, { yaw: 0, tilt: 0, duration: 1.6, ease: "power3.out" });
    }
    hit.classList.remove("dragging");
    drag = null;
  };
  hit.addEventListener("pointerup", release);
  hit.addEventListener("pointercancel", release);
}
