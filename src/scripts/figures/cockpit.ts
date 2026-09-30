import { gsap, scrubbed, whileVisible, packets, q, qa } from "../motion";
import {
  VIEW, LOG, FLIGHT, flight, scene, throttleCard, thrY, trend, horizon, pointer,
  spdTape, altTape, hdgTape, hdgText, speedOf, frame, readout, turbulence, fadeTape, fadeHdg, fadeRung, ADI, SPD, ALT, HDG,
} from "../geo/cockpit";

type P = [number, number];
const r1 = (v: number) => (Math.round(v * 10) / 10).toString();
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const setD = (el: Element, d: string) => el.setAttribute("d", d);

export default function (root: HTMLElement) {
  const svg = q<SVGSVGElement>(root, "svg.ck");
  const $ = <T extends Element = SVGElement>(sel: string) => q<T>(root, sel);

  // Webcam.
  const recDot = $<SVGTSpanElement>(".ck-recdot");
  const card = { palm: $(".ck-palm:not(.ck-thumb)"), back: $(".ck-back"), card: $(".card .ck-card"), ink: $(".card .ck-ink"), grid: $(".ck-grid"), thumb: $(".ck-thumb") };
  const tcard = $(".ck-tcard"), tink = $(".ck-tink"), tquad = $<SVGPathElement>(".ck-tquad"), tval = $<SVGTextElement>(".ck-tval");
  const quad = $<SVGPathElement>(".ck-quad");
  const c0 = $(".ck-c0");
  const o = $(".ck-o");
  const idTag = $<SVGTextElement>(".ck-id");
  const idx = qa<SVGTextElement>(root, ".ck-idx");
  const halos = qa<SVGLineElement>(root, ".ck-halo");
  const axes = qa<SVGLineElement>(root, ".ck-axis");
  const axisLabels = qa<SVGGElement>(root, ".ck-al");
  const hit = $<SVGRectElement>(".ck-hit");

  // Bridge.
  const fireBtn = $(".ck-fire"), ring = $(".ck-fire-ring"), led = $(".ck-led"), arcs = $(".ck-arcs");
  const lineEls = qa<SVGGElement>(root, ".ck-line").map((g) => ({
    g,
    seq: q<SVGTextElement>(g, ".ck-seq"),
    v: qa<SVGTSpanElement>(g, ".v"),
    bytes: q<SVGTextElement>(g, ".ck-bytes"),
  }));
  const live = $(".ck-live"), wait = $(".ck-wait");
  const shortV = qa<SVGTSpanElement>(root, ".ck-short .v");

  // Sim.
  const hz = qa(root, ".ck-horizon"), ptr = $(".ck-pointer");
  const spdG = $(".ck-spd"), altG = $(".ck-alt"), hdgG = $(".ck-hdg");
  const spdV = $<SVGTextElement>(".ck-spdv"), altV = $<SVGTextElement>(".ck-altv"), hdgV = $<SVGTextElement>(".ck-hdgv");
  const track = $<SVGPathElement>(".ck-track"), trendEl = $(".ck-trend"), tracer = $(".ck-tracer"), planeMap = $(".ck-plane-map");
  const out = root.querySelector<HTMLElement>("[data-readout]");
  const byV = (sel: string, key = "v") => qa<SVGElement>(root, sel).map((el) => ({ el, v: +(el.dataset[key] ?? 0), o: -1 }));
  const spdL = byV(".ck-sl"), altL = byV(".ck-al2"), hdgL = byV(".ck-hl"), rungL = byV(".ck-rg", "d");
  const fade = (ls: { el: SVGElement; v: number; o: number }[], fn: (v: number) => number) => {
    for (const l of ls) {
      const op = fn(l.v);
      if (op !== l.o) {
        l.o = op;
        l.el.setAttribute("opacity", `${op}`);
      }
    }
  };

  // Labels grow on phones (CSS); push the corner ids out to match. Read on resize only.
  let gap = 1;
  const measure = () => {
    gap = 1 + Math.max(0, parseFloat(getComputedStyle(idTag).fontSize) / 11 - 1) * 0.6;
  };
  measure();
  window.addEventListener("resize", () => {
    measure();
    render();
  });

  const state = { t: 0 };
  const hand = { roll: 0, pitch: 0 }; // what a drag adds to the pose
  let clock = 0; // ambient seconds
  let firePulse = 0; // ambient fire presses once the story has played
  let fireAge = 0;
  let wasFire = false;
  let found = 0;
  let cur = { roll: 0, pitch: 0, thr: 0, fire: false };
  let prevText = "";

  track.style.strokeDasharray = `0 ${FLIGHT.len + 10}`;

  function render() {
    const f = flight(state.t);
    found = f.found;
    const tb = turbulence(clock);
    const roll = f.roll + tb.roll + hand.roll;
    const pitch = f.pitch + tb.pitch + hand.pitch;
    const thr = clamp(f.thr + tb.thr, 0, 1);
    const fire = f.fire || firePulse > 0;
    cur = { roll, pitch, thr, fire };

    // ---- the webcam: the card, and what the detector sees on it.
    const s = scene(roll, pitch, gap);
    setD(card.palm, s.palms);
    setD(card.back, s.back);
    setD(card.card, s.card);
    setD(card.ink, s.ink);
    setD(card.grid, s.grid);
    setD(card.thumb, s.thumbs);
    setD(quad, s.quad);

    // Trace the quad from corner 0, the way the detector orders it.
    let per = 0;
    for (let i = 0; i < 4; i++) {
      const a = s.corners[i], b = s.corners[(i + 1) % 4];
      per += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    quad.style.strokeDasharray = `${per * found} ${per + 1}`;
    quad.style.opacity = found > 0 ? "1" : "0";
    c0.setAttribute("x", r1(s.corners[0][0] - 3));
    c0.setAttribute("y", r1(s.corners[0][1] - 3));
    c0.style.opacity = found > 0 ? "1" : "0";
    s.cornerLabels.forEach(([x, y], i) => {
      idx[i].setAttribute("x", r1(x));
      idx[i].setAttribute("y", r1(y));
      idx[i].style.opacity = found >= (i + 1) / 4 ? "1" : "0";
    });
    const grow = clamp((found - 0.6) / 0.4, 0, 1);
    const ends: P[] = [s.axes.x, s.axes.y, s.axes.z];
    const labels: P[] = [s.axisLabels.x, s.axisLabels.y, s.axisLabels.z];
    for (let i = 0; i < 3; i++) {
      const x2 = s.o[0] + (ends[i][0] - s.o[0]) * grow, y2 = s.o[1] + (ends[i][1] - s.o[1]) * grow;
      for (const l of [halos[i], axes[i]]) {
        l.setAttribute("x1", r1(s.o[0]));
        l.setAttribute("y1", r1(s.o[1]));
        l.setAttribute("x2", r1(x2));
        l.setAttribute("y2", r1(y2));
        l.style.opacity = grow > 0 ? "1" : "0";
      }
      axisLabels[i].setAttribute("transform", `translate(${r1(labels[i][0])} ${r1(labels[i][1])})`);
      axisLabels[i].style.opacity = grow >= 1 ? "1" : "0";
    }
    o.setAttribute("cx", r1(s.o[0]));
    o.setAttribute("cy", r1(s.o[1]));
    o.style.opacity = grow > 0 ? "1" : "0";
    {
      const [a, , b2, b3] = s.corners;
      const dx = b3[0] - a[0], dy = b3[1] - a[1], l = Math.hypot(dx, dy) || 1;
      const off = 26 + 8 * gap;
      idTag.setAttribute("x", r1((b2[0] + b3[0]) / 2 + (dx / l) * off));
      idTag.setAttribute("y", r1((b2[1] + b3[1]) / 2 + (dy / l) * off));
      idTag.style.opacity = found >= 1 ? "1" : "0";
    }

    // The throttle card rides its rail; the detector finds it halfway through the search.
    const tc = throttleCard(thr, tb.roll * 2);
    setD(tcard, tc.card);
    setD(tink, tc.ink);
    setD(tquad, tc.quad);
    const tFound = clamp((found - 0.4) / 0.5, 0, 1);
    tquad.style.strokeDasharray = `${140 * tFound} 141`;
    tquad.style.opacity = tFound > 0 ? "1" : "0";
    tval.setAttribute("y", r1(thrY(thr)));
    const tv = thr.toFixed(2);
    if (tval.textContent !== tv) tval.textContent = tv;
    tval.style.opacity = tFound >= 1 ? "1" : "0";

    // ---- the bridge: the badge's button.
    fireBtn.classList.toggle("on", fire);
    led.classList.toggle("on", fire);
    arcs.classList.toggle("on", fire);
    if (fire && !wasFire) {
      gsap.fromTo(ring, { scale: 1, opacity: 0.9, transformOrigin: "50% 50%" }, { scale: 1.9, opacity: 0, duration: 0.6, ease: "power2.out" });
    }
    if (!fire) fireAge = 0;
    wasFire = fire;

    // ---- the sim.
    const hzT = horizon(roll, pitch);
    for (const h of hz) h.setAttribute("transform", hzT);
    fade(rungL, (d) => fadeRung((pitch - d) * ADI.k));
    ptr.setAttribute("transform", pointer(roll));
    const spd = speedOf(thr);
    spdG.setAttribute("transform", spdTape(spd));
    const sv = `${Math.round(spd)}`;
    if (spdV.textContent !== sv) spdV.textContent = sv;
    fade(spdL, (v) => fadeTape((spd - v) * SPD.k));
    fade(altL, (v) => fadeTape((f.alt - v) * ALT.k));
    fade(hdgL, (v) => fadeHdg((v - f.hdg) * HDG.k));
    altG.setAttribute("transform", altTape(f.alt));
    const av = `${Math.round(f.alt / 10) * 10}`;
    if (altV.textContent !== av) altV.textContent = av;
    hdgG.setAttribute("transform", hdgTape(f.hdg));
    const hv = hdgText(f.hdg);
    if (hdgV.textContent !== hv) hdgV.textContent = hv;

    track.style.strokeDasharray = `${r1(f.len)} ${Math.ceil(FLIGHT.len + 10)}`;
    track.style.opacity = f.fly > 0 ? "1" : "0";
    setD(trendEl, found >= 1 ? trend(f.pos, f.hdg, roll, thr) : "");
    const place = `translate(${r1(f.pos[0])} ${r1(f.pos[1])}) rotate(${r1(f.hdg)})`;
    planeMap.setAttribute("transform", place);
    if (fire) {
      // Rounds leave the nose in a short stream.
      let d = "";
      for (let i = 0; i < 3; i++) {
        const u = ((fireAge * 1.6 + i / 3) % 1), a = 12 + u * 34;
        d += `M0 ${r1(-a)}V${r1(-a - 4)}`;
      }
      tracer.setAttribute("transform", place);
      setD(tracer, d);
    } else setD(tracer, "");

    const text = readout(roll, pitch, thr);
    if (out && text !== prevText) out.textContent = text;
    prevText = text;
  }

  // ---- the log: frames at the rate the ambient clock ticks them out.
  type Frame = { seq: number; v: readonly string[]; fire: boolean };
  const buf: Frame[] = [];
  let seq = 0;
  function writeLog() {
    for (let i = 0; i < LOG.n; i++) {
      const L = lineEls[i], fr = buf[buf.length - LOG.n + i];
      L.g.style.opacity = fr ? "1" : "0";
      if (!fr) continue;
      L.seq.textContent = `${fr.seq}`;
      fr.v.forEach((v, j) => {
        if (L.v[j].textContent !== v) L.v[j].textContent = v;
      });
      L.v[3].classList.toggle("acc", fr.fire);
      L.bytes.textContent = `${`{"roll":${fr.v[0]},"pitch":${fr.v[1]},"throttle":${fr.v[2]},"fire":${fr.v[3]}}`.length} B`;
    }
    live.style.opacity = buf.length ? "1" : "0";
    // Phones get one short line: the newest frame's values.
    const last = buf[buf.length - 1];
    const sv = last ? [last.v[0], last.v[1], last.v[2]].map((v) => v.replace("-", "−")).concat(last.fire ? "  fire" : "") : ["", "", "", ""];
    shortV[0].parentElement?.setAttribute("opacity", last ? "1" : "0");
    sv.forEach((v, j) => {
      if (shortV[j].textContent !== v) shortV[j].textContent = v;
    });
    wait.setAttribute("opacity", buf.length ? "0" : "1");
  }
  function push() {
    buf.push({ seq: ++seq, v: frame(cur.roll, cur.pitch, cur.thr, cur.fire), fire: cur.fire });
    if (buf.length > LOG.n) buf.shift();
    writeLog();
  }
  writeLog();

  render();
  scrubbed(root, { start: "top 85%", end: "center 45%" }).to(state, { t: 1, duration: 1, onUpdate: render });

  // ---- ambient: turbulence on the card, frames at ~10 Hz, the REC light,
  // and a short burst of fire every few seconds once the story has played.
  let logClock = 0, burstClock = 0;
  whileVisible(root, (dt) => {
    clock += dt;
    fireAge += dt;
    if (state.t > 0.97) {
      burstClock += dt;
      if (burstClock > 4.6) burstClock = 0;
      firePulse = burstClock > 4.1 ? 1 : 0;
    } else {
      burstClock = firePulse = 0;
    }
    render();
    if (found >= 1) {
      logClock += dt;
      if (logClock >= 0.1) {
        logClock %= 0.1;
        push();
      }
    } else if (buf.length) {
      buf.length = 0;
      writeLog();
    }
    recDot.style.fillOpacity = clock % 1.2 < 0.7 ? "1" : "0.2";
  });

  // Packets on the wires: pose and frames once the marker is found, BLE while fire is held.
  const layer = $<SVGGElement>(".ck-pk");
  const wires = qa<SVGPathElement>(root, ".ck-wire");
  wires.forEach((w, i) => packets(root, layer, w, { n: 2, speed: 1.4, r: 1.8, active: i === 1 ? () => cur.fire : () => found >= 1 }));

  // ---- pointer: drag the camera view to tilt the card by hand; it eases back on release.
  let drag: { id: number; x: number; y: number; on: boolean; r0: number; p0: number; k: number } | null = null;
  hit.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") {
      if (e.button !== 0) return;
      e.preventDefault();
    }
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false, r0: hand.roll, p0: hand.pitch, k: VIEW.w / svg.getBoundingClientRect().width };
  });
  hit.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.on) {
      if (Math.hypot(dx, dy) < 6) return;
      drag.on = true;
      gsap.killTweensOf(hand);
      hit.setPointerCapture(e.pointerId);
      hit.classList.add("dragging");
    }
    hand.roll = clamp(drag.r0 + dx * drag.k * 0.24, -34, 34);
    hand.pitch = clamp(drag.p0 - dy * drag.k * 0.16, -18, 18);
  });
  const release = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.on) gsap.to(hand, { roll: 0, pitch: 0, duration: 1.2, ease: "power3.out" });
    hit.classList.remove("dragging");
    drag = null;
  };
  hit.addEventListener("pointerup", release);
  hit.addEventListener("pointercancel", release);
}
