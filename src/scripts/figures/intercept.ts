// Fig. "intercept": the scroll story, the ambient replay, and the reader's hand.
//
// Everything on the plate is a function of two things: where the drone is at
// the moment of firing (which fixes the whole solution), and how far through
// the story we are. The solution is recomputed only when the drone moves; the
// per-frame work is a handful of transforms.
import { gsap, scrubbed, whileVisible, packets, phase, q, qa } from "../motion";
import {
  TARGET, D0, BOUNDS, REST, SLOW, IT, MAX_ITER, LAYOUTS,
  createSolution, solve, detections, fitTrack, geom, roundAt, vacuumAt, toX, toY, camY, droneAt, muzzleTime, fx, readoutFlight,
  type Geom, type Layout, type Solution,
} from "../geo/intercept";

const RAD = Math.PI / 180;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const inOut = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const out3 = (u: number) => 1 - (1 - u) ** 3;
const op = (el: Element | undefined, v: number) => {
  if (el) (el as SVGElement).style.opacity = v <= 0.001 ? "0" : v >= 0.999 ? "1" : v.toFixed(3);
};

// The story's beats, as fractions of the scrub. Several overlap on purpose.
const ENTER = [0, 0.22], FIT = [0.18, 0.3], LOS = [0.26, 0.36], SOLVE = [0.34, 0.6];
const FINAL = [0.56, 0.66], SLEW = [0.6, 0.76], FLY = [0.77, 0.95], BACK = [0.955, 1];
/** The drone is already in the air before the camera's first detection of it (s). */
const LEAD_IN = 0.6;
const SPAN = (TARGET.frames - 1) / TARGET.fps;
// The replay: hold the solved diagram, fly the shot slowed down, hold the meeting, return.
const HOLD = 1.7, FADE = 0.35, MET = 0.9, RETURN = 0.7;
/** How long the puff at the muzzle lasts on the shot clock (s). */
const PUFF = 0.05;

/** Like op, for a label whose own opacity attribute says whether it has room: fully shown hands back to it. */
const fade = (el: Element | undefined, v: number) => {
  if (el) (el as SVGElement).style.opacity = v <= 0.001 ? "0" : v >= 0.999 ? "" : v.toFixed(3);
};

const fmtMiss = (m: number) => (m >= 1 ? `${fx(m, 2)} m` : m >= 0.01 ? `${fx(m * 100, 1)} cm` : `${fx(m * 1000, m >= 0.001 ? 1 : 2)} mm`);

const pa = new Float64Array(4), pb = new Float64Array(4);

/** Wire one layout of the plot. */
function bind(svg: SVGSVGElement, L: Layout) {
  const els: Record<string, SVGElement | undefined> = {};
  for (const el of qa<SVGElement>(svg, "[data-k]")) els[el.dataset.k!] = el;
  const txt: Record<string, SVGElement | undefined> = {};
  for (const el of qa<SVGElement>(svg, "[data-t]")) txt[el.dataset.t!] = el;
  const cells = qa<SVGGElement>(svg, ".ic-cell").map((g) => ({ v: q(g, ".ic-v"), s: q(g, ".ic-s") }));
  const replayLab = q(svg, ".ic-replay");
  const scan = q<SVGLineElement>(svg, ".ic-scan");
  const blades = qa<SVGLineElement>(svg, ".ic-g-blade");
  const led = q(svg, ".ic-camled");
  const hit = q<SVGRectElement>(svg, ".ic-hit");
  const cur = q<SVGGElement>(svg, ".ic-cur"), curText = q<SVGTextElement>(svg, ".ic-cur text");
  const C = L.cam;
  const tMuzzle = muzzleTime(L);
  let G!: Geom;
  let droneAlpha = 1;
  let lastDet = -1, lastLine = -1;
  const last = [NaN, NaN, NaN, NaN, NaN];

  /** Put the solved diagram for a new drone position on the page. */
  function apply(g: Geom) {
    G = g;
    for (const k in g.a) {
      const el = els[k];
      if (!el) continue;
      const at = g.a[k];
      for (const n in at) el.setAttribute(n, String(at[n]));
    }
    for (const k in g.t) {
      const el = txt[k];
      if (el && el.textContent !== g.t[k]) el.textContent = g.t[k];
    }
    lastDet = lastLine = -1;
    last[0] = NaN;
  }

  const line = (k: string, u: number) => {
    const el = els[k], a = G.a[k];
    if (!el || !a) return;
    el.setAttribute("x2", (+a.x1 + (+a.x2 - +a.x1) * u).toFixed(1));
    el.setAttribute("y2", (+a.y1 + (+a.y2 - +a.y1) * u).toFixed(1));
    op(el, u > 0 ? 1 : 0);
  };
  const dash = (k: string, u: number) => {
    const el = els[k];
    if (!el) return;
    el.style.strokeDasharray = `${u.toFixed(4)} 2`;
  };

  /** The barrel, and the bore crosshair in the camera view. */
  function aimAt(deg: number) {
    els.rifle?.setAttribute("transform", `rotate(${(-deg).toFixed(2)})`);
    const y = camY(L, deg, G.n.mid);
    els.ccross?.setAttribute("transform", `translate(0 ${y.toFixed(1)})`);
    const inView = y > C.y0 + 2 && y < C.y1 - 2;
    op(els.ccross, inView ? 1 : 0);
    if (els.cll) {
      els.cll.setAttribute("y", (y - L.f * 0.45).toFixed(1));
      op(els.cll, y > C.y0 + L.f * 1.3 && y < C.y1 ? 1 : 0);
    }
  }

  /**
   * Everything that only changes with the story: what has been drawn so far.
   * Returns the time on the shot clock (negative while the drone flies in),
   * how far the drone has faded back to where it was seen, and the readout.
   */
  function story(p: number, s: Solution, out: { t: number; back: number; pulse: number; elev: number; text: string }) {
    const g = G;
    // ---- the drone flies in; detections accumulate behind it.
    const enter = phase(p, ENTER[0], ENTER[1]);
    const tPre = -(SPAN + LEAD_IN) * (1 - enter);
    droneAlpha = phase(p, 0.004, 0.03);
    const seen = clamp(TARGET.frames - Math.ceil(-tPre * TARGET.fps - 1e-6), 0, TARGET.frames);
    if (seen !== lastDet) {
      lastDet = seen;
      els.det?.setAttribute("d", seen ? g.det.slice(TARGET.frames - seen).join("") : "");
      els.ctrail?.setAttribute("d", seen ? g.cdet.slice(TARGET.frames - seen).join("") : "");
    }
    // ---- the fit: a line through the detections, a speed, a line of sight.
    line("trk", phase(p, FIT[0], FIT[1]));
    const known = phase(p, FIT[1] - 0.04, FIT[1]);
    op(els.vl, known);
    op(els.varr, known);
    fade(els.tl, known);
    op(els.hdim, known);
    op(els.hext, known);
    op(els.hl, known);
    line("los", phase(p, LOS[0], LOS[1]));
    op(els.losl, phase(p, LOS[1] - 0.02, LOS[1] + 0.02));

    // ---- the solver: each pass predicts a point, aims at it, and measures how far off that was.
    const w = (SOLVE[1] - SOLVE[0]) / s.n;
    const gone = 1 - phase(p, FINAL[0] + 0.02, FINAL[1]);
    let dots = 0;
    for (let k = 0; k < MAX_ITER; k++) {
      const a = SOLVE[0] + k * w, live = k < s.n;
      const drawn = live ? phase(p, a + 0.08 * w, a + 0.6 * w) : 0;
      dash(`cand${k}`, drawn);
      // The newest candidate is solid; older ones step back.
      const age = live ? phase(p, a + w, a + 1.6 * w) : 0;
      op(els[`cand${k}`], drawn > 0 ? (1 - 0.7 * age) * gone : 0);
      op(els[`cpt${k}`], live ? phase(p, a, a + 0.1 * w) * (1 - 0.6 * age) * gone : 0);
      const dot = live && p >= a + 0.66 * w;
      if (dot) dots = k + 1;
      op(els[`sd${k}`], dot ? 1 : 0);
      op(els[`sn${k}`], dot ? 1 : 0);
    }
    if (dots !== lastLine) {
      lastLine = dots;
      let d = "";
      for (let k = 0; k < dots; k++) d += `${k ? "L" : "M"}${g.a[`sd${k}`].cx} ${g.a[`sd${k}`].cy}`;
      els.sline?.setAttribute("d", d);
    }
    op(els.slast, dots >= s.n ? 1 : 0);

    // ---- the answer: the trajectory, where it meets the drone, and how the bore must sit.
    const arc = phase(p, FINAL[0], FINAL[0] + 0.08);
    dash("arcP", arc);
    op(els.arcP, arc > 0 ? 1 : 0);
    op(els.tks, phase(p, FINAL[0] + 0.06, FINAL[0] + 0.1));
    op(els.tkl, phase(p, FINAL[0] + 0.08, FINAL[0] + 0.12));
    const ring = phase(p, FINAL[0] + 0.04, FINAL[1]);
    if (els.ring) {
      els.ring.setAttribute("transform", `translate(${g.n.iX.toFixed(1)} ${g.n.iY.toFixed(1)}) scale(${(1.7 - 0.7 * out3(ring)).toFixed(3)})`);
      op(els.ring, ring);
    }
    op(els.cring, ring);
    op(els.prd, ring);
    op(els.il, phase(p, FINAL[1] - 0.02, FINAL[1] + 0.02));
    op(els.dlead, phase(p, FINAL[1] - 0.02, FINAL[1] + 0.02));
    line("aim", phase(p, FINAL[0] + 0.02, FINAL[1]));
    fade(els.aiml, phase(p, FINAL[1], FINAL[1] + 0.04));
    const dims = phase(p, FINAL[1] - 0.02, FINAL[1] + 0.04);
    op(els.wedge, dims);
    op(els.dl, phase(p, FINAL[1] + 0.02, FINAL[1] + 0.06));
    op(els.la, dims);
    op(els.ll, dims);
    op(els.ghost, phase(p, FINAL[1] + 0.02, FINAL[1] + 0.1));

    // ---- the instruments fill in as each value becomes known.
    const when = [LOS[1], FINAL[0] + 0.06, FINAL[1], FINAL[1] + 0.02, FINAL[1] + 0.04, FINAL[1] + 0.06];
    cells.forEach((c, i) => {
      op(c.v, phase(p, when[i], when[i] + 0.03));
      // The second line compares against the solved shot, so it waits for one.
      const t2 = Math.max(when[i], FINAL[1] + 0.02 * i);
      op(c.s, phase(p, t2, t2 + 0.03));
    });

    // ---- the mount slews to the solved elevation.
    const slew = phase(p, SLEW[0], SLEW[1]);
    const elev = REST + (g.n.th - REST) * inOut(slew);
    const locked = phase(p, SLEW[1] - 0.02, SLEW[1]);
    op(els.cbr, locked);
    op(els.cbt, locked);
    op(els.cbv, locked);
    op(els.cdb, locked);
    op(els.cdt, locked);

    // ---- the shot.
    const fly = phase(p, FLY[0], FLY[1]);
    out.t = enter < 1 ? tPre : s.tof * fly;
    out.back = phase(p, BACK[0], BACK[1]);
    out.pulse = phase(p, FLY[1], FLY[1] + 0.045);
    out.elev = elev;

    if (p < 0.004) out.text = "standby";
    else if (enter < 1) out.text = seen ? `tracking  frame ${seen}` : "searching";
    else if (p < SOLVE[0] + 0.66 * w) out.text = `track  ${fx(Math.hypot(s.vx, s.vy), 1)} m/s  range ${fx(s.range, 1)} m`;
    else if (p < FINAL[0] + 0.06) out.text = `pass ${Math.max(1, dots)}  correction ${fmtMiss(s.it[(Math.max(1, dots) - 1) * IT.n + IT.miss])}`;
    else if (fly <= 0) out.text = slew < 1 ? `slewing  elevation ${fx(elev, 1)}°` : `holding  elevation ${fx(elev, 2)}°`;
    else out.text = "";
    return out;
  }

  /**
   * The moving parts, cheap enough for every frame: the drone, the round and
   * its no-drag twin, and the same three in the camera view.
   * t is the shot clock; `back` crossfades the drone from the meeting point to
   * where it was seen; `alpha` fades the flown shot before a replay.
   */
  function flight(s: Solution, t: number, back: number, pulse: number, alpha: number) {
    // Nothing to do while the picture holds still.
    if (t === last[0] && back === last[1] && pulse === last[2] && alpha === last[3] && droneAlpha === last[4]) return;
    last[0] = t; last[1] = back; last[2] = pulse; last[3] = alpha; last[4] = droneAlpha;
    const g = G, home = back >= 0.5;
    const td = home ? 0 : Math.min(t, s.tof);
    const wx = s.dx + s.vx * td, wy = s.dy + s.vy * td;
    const dr = els.dr;
    if (dr) {
      dr.setAttribute("transform", droneAt(L, toX(L, wx), toY(L, wy)));
      op(dr, droneAlpha * (home ? back * 2 - 1 : 1 - back * 2));
    }
    op(els.dD, t > 0 ? 1 - Math.max(0, back * 2 - 1) : 0);
    const cy = camY(L, Math.atan2(wy, wx) / RAD, g.n.mid);
    els.cbox?.setAttribute("transform", `translate(${C.cx} ${cy.toFixed(1)})`);
    if (els.cdl) {
      els.cdl.setAttribute("y", (cy + L.f * 1.1).toFixed(1));
      // The label steps aside while the drone is away from where it was seen.
      op(els.cdl, droneAlpha * (cy > C.y0 + 4 && cy < C.y1 - L.f * 1.3 && (t <= 0 || home) ? 1 : 0));
    }

    const flying = t > 0;
    if (flying) {
      roundAt(s, t, pa);
      const x = toX(L, pa[0]), y = toY(L, pa[1]);
      els.rnd?.setAttribute("cx", x.toFixed(1));
      els.rnd?.setAttribute("cy", y.toFixed(1));
      const tail = els.tail;
      if (tail) {
        roundAt(s, Math.max(tMuzzle, t - 0.016), pb);
        tail.setAttribute("x1", toX(L, pb[0]).toFixed(1));
        tail.setAttribute("y1", toY(L, pb[1]).toFixed(1));
        tail.setAttribute("x2", x.toFixed(1));
        tail.setAttribute("y2", y.toFixed(1));
      }
      dash("arcF", (pa[3] * L.s) / g.n.arcLen);
      els.crnd?.setAttribute("cy", camY(L, Math.atan2(pa[1], pa[0]) / RAD, g.n.mid).toFixed(1));
      vacuumAt(s, Math.min(t, g.n.ghostT), pb);
      els.gdot?.setAttribute("cx", toX(L, pb[0]).toFixed(1));
      els.gdot?.setAttribute("cy", toY(L, pb[1]).toFixed(1));
    }
    // The round is drawn once it is clear of the muzzle (the mount is drawn over the first metres of its path).
    const shot = flying ? alpha : 0, clear = flying && t >= tMuzzle;
    op(els.rnd, clear ? alpha : 0);
    op(els.crnd, shot);
    op(els.arcF, shot);
    op(els.tail, clear && t < s.tof ? alpha : 0);
    // The no-drag round runs ahead; if it leaves the sky it is simply gone.
    op(els.gdot, flying && (t <= g.n.ghostT || g.n.ghostIn) ? alpha : 0);
    op(els.gl, flying && g.n.ghostLabel ? phase(t / s.tof, 0.55, 0.8) * alpha : 0);

    // The air leaving the muzzle, for the first instant of the flight.
    const pf = els.puff;
    if (pf) {
      const u = clear && t < tMuzzle + PUFF ? (t - tMuzzle) / PUFF : -1;
      if (u >= 0) pf.setAttribute("r", (2 + 8 * out3(u)).toFixed(1));
      op(pf, u >= 0 ? (1 - u) * 0.85 * alpha : 0);
    }
    const pu = els.pulse;
    if (pu) {
      const live = pulse > 0 && pulse < 1;
      if (live) pu.setAttribute("r", (L.ring * (1 + 1.5 * out3(pulse))).toFixed(1));
      op(pu, live ? (1 - pulse) * 0.9 : 0);
    }
  }

  /** Drop below the bore line at time t on the shot clock. */
  const dropAt = (s: Solution, t: number) => {
    roundAt(s, t, pa);
    return pa[0] * Math.tan(s.theta) - pa[1];
  };

  /** Ambient parts that run on their own clock. */
  function idle(now: number, on: boolean) {
    const u = (now / 2.8) % 1;
    scan.setAttribute("y1", (C.y0 + u * (C.y1 - C.y0)).toFixed(1));
    scan.setAttribute("y2", (C.y0 + u * (C.y1 - C.y0)).toFixed(1));
    op(scan, on ? Math.min(1, u * 6, (1 - u) * 6) : 0);
    // Rotors: the blade seen edge-on sweeps in and out.
    for (let i = 0; i < blades.length; i++) {
      const c = i ? 10 : -10, h = 6.5 * (0.4 + 0.6 * Math.abs(Math.sin(now * 23 + i * 1.9)));
      blades[i].setAttribute("x1", (c - h).toFixed(1));
      blades[i].setAttribute("x2", (c + h).toFixed(1));
    }
    led.style.opacity = on && now % 1.4 < 0.9 ? "1" : "0.25";
  }

  /** Pointer position in metres from the mount. */
  function world(e: { clientX: number; clientY: number }, out: Float64Array) {
    const m = svg.getScreenCTM();
    if (!m) return false;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    out[0] = (p.x - L.ox) / L.s;
    out[1] = (L.oy - p.y) / L.s;
    return true;
  }

  /** The placing cursor: where a click would put the drone, in the mount's own coordinates. */
  function cursor(x: number, y: number, on: boolean) {
    cur.setAttribute("opacity", on ? "1" : "0");
    if (!on) return;
    const X = toX(L, x), Y = toY(L, y), flip = X > L.right - 110;
    cur.setAttribute("transform", `translate(${X.toFixed(1)} ${Y.toFixed(1)})`);
    curText.setAttribute("x", flip ? "-11" : "11");
    curText.setAttribute("text-anchor", flip ? "end" : "start");
    curText.textContent = `${fx(Math.hypot(x, y), 1)} m  ${fx(Math.atan2(y, x) / RAD, 1)}°`;
  }

  return { svg, L, hit, replayLab, apply, story, flight, aimAt, dropAt, idle, world, cursor };
}

export default function (root: HTMLElement) {
  const views = qa<SVGSVGElement>(root, "svg.ic").map((svg) => bind(svg, LAYOUTS.find((l) => l.key === svg.dataset.view)!));
  const readout = root.querySelector<HTMLElement>("[data-readout]");
  let said = "";
  const say = (s: string) => {
    if (readout && s !== said) readout.textContent = said = s;
  };

  // ---- the engagement: where the drone is at the moment of firing.
  const sol = createSolution();
  const det = new Float64Array(TARGET.frames * 2), est = new Float64Array(4);
  const drone = { x: D0.x as number, y: D0.y as number }, want = { x: D0.x as number, y: D0.y as number };
  // One layout is showing; the other keeps its server-rendered frame until it is.
  const narrow = window.matchMedia("(max-width: 899.98px)");
  const pick = () => views.find((v) => v.L.wide !== narrow.matches) ?? views[0];
  let view = pick();

  function resolve() {
    detections(drone.x, drone.y, -TARGET.speed, 0, det);
    fitTrack(det, est);
    solve(est[0], est[1], est[2], est[3], sol);
    view.apply(geom(view.L, sol, det));
  }

  // ---- state.
  // p is the scroll story. `hold` pulls the plate to its solved state when the
  // reader takes the drone before the story has finished (its own object, so
  // its tweens never touch the scrubbed one).
  const st = { p: 0 }, user = { hold: 0 };
  const beat = { t: 0, back: 0, pulse: 0, elev: REST, text: "" };
  let shown = REST; // barrel elevation on screen (deg): it lags the solution a little, like a servo
  let dragging = false, touched = false;
  let clock = 0; // replay clock (s)
  let now = 0;
  const pe = () => Math.max(st.p, user.hold);

  /** Draw the story at the current progress. */
  function render() {
    const p = pe();
    view.story(p, sol, beat);
    if (p < 0.999) {
      shown = beat.elev;
      view.aimAt(shown);
      view.flight(sol, beat.t, beat.back, beat.pulse, 1);
      say(beat.text || readoutFlight(sol, beat.t, view.dropAt(sol, beat.t)));
      setReplay(false);
      clock = 0;
      view.svg.toggleAttribute("data-hint", false);
    } else {
      view.aimAt(shown);
      still();
    }
  }
  /** The solved diagram: drone where it was seen, round at the meeting point. */
  function still() {
    view.flight(sol, sol.tof, 1, 0, 1);
    say(readoutFlight(sol, sol.tof, sol.drop));
  }
  let replaying = false;
  function setReplay(on: boolean) {
    if (on === replaying) return;
    replaying = on;
    for (const v of views) v.replayLab.style.opacity = on ? "1" : "0";
  }

  resolve();
  render();
  narrow.addEventListener("change", () => {
    view = pick();
    resolve();
    render();
  });

  // ---- scroll: the story, scrubbed.
  const tl = scrubbed(root, { start: "top 85%", end: "center 45%" });
  tl.to(st, { p: 1, duration: 1 });
  let pAtRelease = -1;
  tl.eventCallback("onUpdate", () => {
    // Scrolling on after a drag hands the plate back to the story.
    if (user.hold > 0 && !dragging && pAtRelease >= 0 && Math.abs(st.p - pAtRelease) > 0.04 && st.p < 0.999) {
      pAtRelease = -1;
      gsap.to(user, { hold: 0, duration: 0.6, ease: "power2.inOut", overwrite: true, onUpdate: render });
    }
    render();
  });

  // ---- ambient: the replay, the servo, the camera.
  whileVisible(root, (dt, time) => {
    now = time;
    // The drone eases to wherever the reader last put it.
    const ex = want.x - drone.x, ey = want.y - drone.y;
    const moving = Math.abs(ex) > 0.004 || Math.abs(ey) > 0.004;
    if (moving) {
      const k = 1 - Math.exp(-dt / 0.055);
      drone.x += Math.abs(ex) < 0.02 ? ex : ex * k;
      drone.y += Math.abs(ey) < 0.02 ? ey : ey * k;
      resolve();
      render();
    }
    const full = pe() >= 0.999;
    if (full) {
      // The barrel follows the solution with a short lag.
      const th = sol.theta / RAD, d = th - shown;
      if (d !== 0) {
        shown = Math.abs(d) < 0.004 ? th : shown + d * (1 - Math.exp(-dt / 0.09));
        view.aimAt(shown);
      }
      if (dragging || moving) {
        clock = HOLD - FADE;
        setReplay(false);
      } else {
        clock += dt;
        const fly = sol.tof / SLOW, total = HOLD + fly + MET + RETURN;
        if (clock >= total) clock -= total;
        const c = clock;
        if (c < HOLD) {
          // The last shot fades before the next is fired.
          view.flight(sol, sol.tof, 1, 0, clamp((HOLD - c) / FADE, 0, 1));
          setReplay(false);
        } else if (c < HOLD + fly) {
          const t = (c - HOLD) * SLOW;
          view.flight(sol, t, 0, 0, 1);
          say(readoutFlight(sol, t, view.dropAt(sol, t)));
          setReplay(true);
        } else if (c < HOLD + fly + MET) {
          view.flight(sol, sol.tof, 0, clamp((c - HOLD - fly) / 0.55, 0, 1), 1);
          say(readoutFlight(sol, sol.tof, sol.drop));
        } else {
          view.flight(sol, sol.tof, (c - HOLD - fly - MET) / RETURN, 0, 1);
          setReplay(false);
        }
      }
      view.svg.toggleAttribute("data-hint", !touched);
    }
    view.idle(now, pe() > 0.02);
  });

  // Frames travel up the lead from the camera to its view once the story is under way.
  for (const v of views) {
    const feed = v.svg.querySelector<SVGPathElement>(".ic-feed"), layer = v.svg.querySelector<SVGGElement>(".ic-pk");
    if (feed && layer) packets(root, layer, feed, { n: 2, speed: 0.55, r: 1.6, active: () => v === view && pe() > 0.02 });
  }

  // ---- the reader's hand: drag the drone, or move it with the arrow keys.
  const live = document.createElement("p");
  live.className = "sr-only";
  live.setAttribute("aria-live", "polite");
  root.append(live);
  let liveTimer = 0;
  const describe = () =>
    `Drone ${fx(sol.range, 0)} metres away, ${fx(sol.dy, 0)} metres up. Lead ${fx(sol.lead / RAD, 2)} degrees, flight time ${fx(sol.tof, 2)} seconds, drop ${fx(sol.drop, 2)} metres.`;
  function place(x: number, y: number, announce = false) {
    want.x = clamp(x, BOUNDS.x0, BOUNDS.x1);
    want.y = clamp(y, BOUNDS.y0, BOUNDS.y1);
    touched = true;
    if (user.hold < 1 && st.p < 0.999) gsap.to(user, { hold: 1, duration: 0.5, ease: "power3.out", overwrite: true, onUpdate: render });
    pAtRelease = st.p;
    for (const v of views) {
      v.hit.setAttribute("aria-valuenow", want.x.toFixed(0));
      v.hit.setAttribute("aria-valuetext", `${want.x.toFixed(0)} metres downrange, ${want.y.toFixed(0)} metres up`);
    }
    if (announce) {
      clearTimeout(liveTimer);
      liveTimer = window.setTimeout(() => (live.textContent = describe()), 500);
    }
  }

  // The focus ring is for the keyboard; a click focuses the drone without it.
  let keys = false;
  window.addEventListener("keydown", () => (keys = true), true);
  window.addEventListener("pointerdown", () => (keys = false), true);

  const w = new Float64Array(2);
  for (const v of views) {
    const { svg, hit } = v;
    svg.setAttribute("role", "group");
    svg.dataset.live = "";
    hit.setAttribute("tabindex", "0");
    hit.setAttribute("role", "slider");
    hit.setAttribute("aria-label", "Drone position. Arrow keys move the drone; the firing solution follows.");
    hit.setAttribute("aria-valuemin", `${BOUNDS.x0}`);
    hit.setAttribute("aria-valuemax", `${BOUNDS.x1}`);
    hit.setAttribute("aria-valuenow", `${D0.x}`);

    // A mouse grabs at once. A finger only takes the drone once it has moved
    // sideways (vertical swipes stay with the page), and keeps its offset so
    // the drone does not jump under the thumb.
    let grab: { id: number; x: number; y: number; ox: number; oy: number; on: boolean } | null = null;
    hit.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (!v.world(e, w)) return;
      const near = Math.hypot(w[0] - drone.x, w[1] - drone.y) < 3.2;
      grab = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: 0, oy: 0, on: false };
      if (e.pointerType === "mouse") {
        e.preventDefault();
        svg.classList.remove("keys");
        hit.focus({ preventScroll: true });
        grab.on = true;
        if (near) {
          grab.ox = drone.x - w[0];
          grab.oy = drone.y - w[1];
        }
        hit.setPointerCapture(e.pointerId);
        dragging = true;
        svg.classList.add("dragging", "near");
        v.cursor(0, 0, false);
        place(w[0] + grab.ox, w[1] + grab.oy);
      } else {
        grab.ox = want.x - w[0];
        grab.oy = want.y - w[1];
      }
    });
    // A mouse over the sky shows where a click would put the drone, and takes hold near the drone itself.
    const hover = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || grab || !v.world(e, w)) return;
      const x = clamp(w[0], BOUNDS.x0, BOUNDS.x1), y = clamp(w[1], BOUNDS.y0, BOUNDS.y1);
      const near = Math.hypot(w[0] - drone.x, w[1] - drone.y) < 3.2;
      svg.classList.toggle("near", near);
      v.cursor(x, y, !near);
    };
    hit.addEventListener("pointerleave", () => {
      svg.classList.remove("near");
      v.cursor(0, 0, false);
    });
    hit.addEventListener("pointermove", (e) => {
      if (!grab) hover(e);
      if (!grab || e.pointerId !== grab.id) return;
      if (!grab.on) {
        const mx = Math.abs(e.clientX - grab.x), my = Math.abs(e.clientY - grab.y);
        // Up-and-down belongs to the page; only a sideways start takes the drone.
        if (Math.hypot(mx, my) < 6 || mx < my) return;
        grab.on = true;
        hit.setPointerCapture(e.pointerId);
        dragging = true;
        svg.classList.add("dragging");
      }
      if (v.world(e, w)) place(w[0] + grab.ox, w[1] + grab.oy);
    });
    const release = (e: PointerEvent) => {
      if (!grab || e.pointerId !== grab.id) return;
      // A tap sends the drone to that spot.
      if (!grab.on && e.type === "pointerup" && v.world(e, w)) place(w[0], w[1], true);
      else if (grab.on) {
        clearTimeout(liveTimer);
        liveTimer = window.setTimeout(() => (live.textContent = describe()), 500);
      }
      grab = null;
      dragging = false;
      svg.classList.remove("dragging");
    };
    hit.addEventListener("pointerup", release);
    hit.addEventListener("pointercancel", release);
    hit.addEventListener("lostpointercapture", release);

    hit.addEventListener("focus", () => svg.classList.toggle("keys", keys));
    hit.addEventListener("blur", () => svg.classList.remove("keys"));
    hit.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 5 : 1;
      let { x, y } = want;
      switch (e.key) {
        case "ArrowLeft": x -= step; break;
        case "ArrowRight": x += step; break;
        case "ArrowUp": y += step; break;
        case "ArrowDown": y -= step; break;
        case "Home": x = D0.x; y = D0.y; break;
        default: return;
      }
      e.preventDefault();
      svg.classList.add("keys");
      place(Math.round(x), Math.round(y), true);
    });
  }
}
