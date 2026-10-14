// Fig. "intercept": the scroll story, the replay, and the reader's hand.
//
// Everything on the plate is a function of two things: where the drone is at
// the moment of firing (which fixes the whole solution), and one state for the
// moving bodies, the shot clock. The solution is recomputed only when the drone
// moves. The scroll story, the replay and the pointer are three sources for
// the shot clock, and the picture is always drawn from the one in charge, with
// a short blend whenever charge changes hands, so nothing ever jumps.
import { gsap, scrubbed, whileVisible, packets, phase, trail, q, qa } from "../motion";
import {
  TARGET, CAMERA, D0, BOUNDS, REST, SLOW, MAX_ITER, LAYOUTS, GAUGE, AHEAD, SEED,
  createSolution, solve, detections, fitFrames, fitTrack, geom, trackMarks, roundAt, vacuumAt, timeAt, gauges, gaugeAt,
  createNoise, fillNoise, fillAhead, fovPaths, toX, toY, camY, droneAt, muzzleTime, fx, readoutFlight,
  type Geom, type Layout, type Solution, type Noise,
} from "../geo/intercept";

const RAD = Math.PI / 180;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const mix = (a: number, b: number, u: number) => a + (b - a) * u;
// The site's two curves: things coming to rest, and one state for another.
const arrive = gsap.parseEase("arrive"), swap = gsap.parseEase("swap");
const op = (el: Element | undefined, v: number) => {
  if (el) (el as SVGElement).style.opacity = v <= 0.001 ? "0" : v >= 0.999 ? "1" : v.toFixed(3);
};
/** Like op, for a label whose own opacity attribute says whether it has room: fully shown hands back to it. */
const fade = (el: Element | undefined, v: number) => {
  if (el) (el as SVGElement).style.opacity = v <= 0.001 ? "0" : v >= 0.999 ? "" : v.toFixed(3);
};

// The story's beats, as fractions of the scrub. They overlap on purpose, and
// each plays while the part of the plate it happens on is in the window: the
// sky and the two panels come up first, the instruments last.
const WAKE = [0, 0.12]; // the camera comes alive
const ENTER = [0.1, 0.31]; // the drone flies in; one detection a frame; the fit follows them
const KNOWN = [0.28, 0.36]; // what the track says: a speed, a height
const LOS = [0.31, 0.4]; // the line of sight, and the range along it
const PRED = [0.35, 0.4]; // where the drone is going
const SOLVE = [0.39, 0.64]; // the passes
const FINAL = 0.625; // the answer is drawn from here
const SLEW = [0.65, 0.77]; // the bore comes up to it
const FLY = [0.775, 0.992]; // the shot. The story ends as the two meet; the replay takes it from there.
/** The drone is already in the air before the camera's first detection of it (s). */
const LEAD_IN = 0.6;
const SPAN = (TARGET.frames - 1) / TARGET.fps;
// The replay, in seconds: the meeting holds, the drone is put back where the
// camera saw it, the solved diagram rests (then the solver's passes are walked
// again while the last shot fades), and the shot is flown again, slowed down.
const MET = 0.7, RETURN = 0.6, HOLD = 0.8, FADE = 0.3, WALK = 0.5, RING = 0.55;
/** How long the puff at the muzzle lasts on the shot clock (s). */
const PUFF = 0.05;
/** How long one source of the shot clock takes to hand over to another (s). */
const HANDOVER = 0.28;
/** How long a pointer that has stopped moving keeps the shot clock before the replay takes it back (s). */
const LINGER = 3;

/** The moving bodies, wherever they are being driven from. */
interface Shot {
  /** The shot clock (s): negative while the drone flies in, 0 at firing. */
  t: number;
  /** 0: the drone is drawn where it is on the clock. 1: where the camera saw it. Between: one fades for the other. */
  home: number;
  /** The flown shot's own opacity (it fades before the next is fired). */
  alpha: number;
  /** The ring at the meeting, 0..1; 1 and over is no ring. */
  pulse: number;
}
const shot = (): Shot => ({ t: 0, home: 0, alpha: 1, pulse: 1 });

const pa = new Float64Array(4), pb = new Float64Array(4), fit = new Float64Array(4), gv = new Float64Array(GAUGE.n);

/** Wire one layout of the plot. */
function bind(svg: SVGSVGElement, L: Layout) {
  const els: Record<string, SVGElement | undefined> = {};
  for (const el of qa<SVGElement>(svg, "[data-k]")) els[el.dataset.k!] = el;
  const txt: Record<string, SVGElement | undefined> = {};
  for (const el of qa<SVGElement>(svg, "[data-t]")) txt[el.dataset.t!] = el;
  const cells = qa<SVGGElement>(svg, ".ic-cell").map((g) => ({ k: g.dataset.cell!, v: q(g, ".ic-v"), s: q(g, ".ic-s") }));
  const marks = Array.from({ length: GAUGE.n }, (_, i) => els[`g${i}`]);
  const aimRings = qa<SVGCircleElement>(svg, ".ic-ga");
  const axis = qa<SVGTextElement>(svg, ".ic-axl").map((el) => ({ el, x: +el.getAttribute("x")!, o: 1 }));
  const replayLab = q(svg, ".ic-replay");
  const walker = q<SVGCircleElement>(svg, ".ic-swalk");
  const fovEdge = q<SVGPathElement>(svg, ".ic-fov"), fovFill = q<SVGPathElement>(svg, ".ic-fovfill"), fovLab = svg.querySelector<SVGTextElement>(".ic-fovl");
  const scan = q<SVGLineElement>(svg, ".ic-scan");
  const blades = qa<SVGLineElement>(svg, ".ic-g-blade");
  const led = q(svg, ".ic-camled");
  const pk = svg.querySelector<SVGGElement>(".ic-pk");
  const hit = q<SVGPathElement>(svg, ".ic-hit");
  const cur = q<SVGPathElement>(svg, ".ic-cur");
  const probe = q<SVGGElement>(svg, ".ic-probe"), pLine = q<SVGLineElement>(svg, ".ic-pl");
  const pFoot = q<SVGTextElement>(svg, ".ic-pm"), pTag = q<SVGTextElement>(svg, ".ic-pt");
  const C = L.cam, P = L.plot;
  const tMuzzle = muzzleTime(L);
  const dotR = L.wide ? 2.6 : 3.2;
  let G!: Geom;
  let droneAlpha = 1, marksIn = 1, awake = 1, settled = 1;
  let lastSeen = -1, lastPass = -2, lastLo = -1, lastHi = -1, lastWalk = NaN, lastOpen = NaN, lastAim = NaN, lastSettled = NaN, vEst = 0;
  const last = [NaN, NaN, NaN, NaN, NaN, NaN];
  const lastG = new Float64Array(GAUGE.n).fill(-1);

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
    lastSeen = lastLo = lastHi = -1;
    lastPass = -2;
    lastWalk = lastAim = NaN;
    last[0] = NaN;
    lastG.fill(-1);
  }

  /** A fresh set of camera frames for the next flight of the same engagement: only the marks for the frames after firing change. */
  function reframe(s: Solution, det: Float64Array, noise: Noise) {
    trackMarks(L, s, det, noise, G.n.mid, G.det, G.cdet);
    lastLo = lastHi = -1;
    last[0] = NaN;
  }

  const line = (k: string, u: number) => {
    const el = els[k], a = G.a[k];
    if (!el || !a) return;
    el.setAttribute("x2", (+a.x1 + (+a.x2 - +a.x1) * u).toFixed(1));
    el.setAttribute("y2", (+a.y1 + (+a.y2 - +a.y1) * u).toFixed(1));
    op(el, u > 0 ? 1 : 0);
  };
  /** Draw a path whose length is normalised to 1 as far as u. */
  const dash = (k: string, u: number) => {
    const el = els[k];
    if (el) el.style.strokeDasharray = `${u.toFixed(4)} 2`;
  };
  const text = (k: string, v: string) => {
    const el = txt[k];
    if (el && el.textContent !== v) el.textContent = v;
  };
  // The labels that ride the two rays answer to two things: how far the story
  // has brought each in, and the probe, which asks them all to stand back.
  const riders = { ll: 1, losl: 1, tkl: 1, aiml: 1 };
  let standBack = 1;
  const ride = (k: keyof typeof riders) => {
    const v = riders[k] * standBack;
    // Two of them have an opacity of their own that says whether they have room at all.
    if (k === "tkl" || k === "aiml") fade(els[k], v >= 0.999 ? 1 : v * +(G.a[k]?.opacity ?? 1));
    else op(els[k], v);
  };
  /** How shown something in the camera's window is at height y: it comes in over a few pixels at either edge. */
  const inWindow = (y: number, top: number, bottom: number) => clamp(Math.min(y - C.y0 - top, C.y1 - bottom - y) / 9, 0, 1);

  /** The barrel, and the bore crosshair in the camera view. */
  function aimAt(deg: number) {
    if (deg === lastAim && settled === lastSettled) return;
    lastAim = deg;
    lastSettled = settled;
    els.rifle?.setAttribute("transform", `rotate(${(-deg).toFixed(2)})`);
    const y = camY(L, deg, G.n.mid);
    // (The crosshair comes into the camera's window from below; the window's own edge is its entrance.)
    els.ccross?.setAttribute("transform", `translate(0 ${y.toFixed(1)})`);
    if (els.cll) {
      els.cll.setAttribute("y", (y - L.f * 0.45).toFixed(1));
      op(els.cll, settled * inWindow(y, L.f * 1.3, 0));
    }
  }

  /** The line through the frames taken so far: a least-squares fit, as good as the frames allow. */
  function fitLine(det: Float64Array, seen: number) {
    const trk = els.trk, a = G.a.trk;
    if (!trk) return;
    if (seen >= TARGET.frames) {
      for (const n in a) trk.setAttribute(n, String(a[n]));
      vEst = TARGET.speed;
    } else if (seen >= 2) {
      fitFrames(det, TARGET.frames - seen, seen, fit);
      const back = (seen - 1) / TARGET.fps;
      trk.setAttribute("x1", toX(L, fit[0] - fit[2] * back).toFixed(1));
      trk.setAttribute("y1", toY(L, fit[1] - fit[3] * back).toFixed(1));
      trk.setAttribute("x2", toX(L, fit[0]).toFixed(1));
      trk.setAttribute("y2", toY(L, fit[1]).toFixed(1));
      vEst = Math.hypot(fit[2], fit[3]);
    }
    op(trk, clamp((seen - 2) / 7, 0, 1));
  }

  /** The instruments print what the pass in hand believes; -1 is the solved shot. */
  function printPass(n: number) {
    if (n === lastPass) return;
    lastPass = n;
    const src = n < 0 || n >= G.pass.length - 1 ? G.t : G.pass[n];
    for (const k of ["tof", "lead", "elev", "drop", "speed"]) text(k, src[k]);
    if (n >= 0) text("cl", G.miss[n]);
  }

  /**
   * Everything that only changes with the story: what has been drawn so far.
   * Writes the shot clock the story asks for, the barrel's elevation, and the readout.
   */
  function story(p: number, s: Solution, det: Float64Array, out: Shot & { elev: number; text: string }) {
    const g = G;
    // ---- the camera comes alive: its field of view opens about its axis, its
    // scan starts, its light comes on, and frames begin to go up the lead.
    awake = phase(p, WAKE[0], WAKE[1]);
    if (pk) op(pk, awake);
    if (awake !== lastOpen) {
      lastOpen = awake;
      const view = fovPaths(L, CAMERA.half * awake);
      fovEdge.setAttribute("d", view.edge);
      fovFill.setAttribute("d", view.fill);
    }
    if (fovLab) fade(fovLab, phase(p, WAKE[1] - 0.02, WAKE[1] + 0.04));

    // ---- the drone flies in; detections accumulate behind it, and the fit with them.
    const enter = phase(p, ENTER[0], ENTER[1]);
    const tPre = -(SPAN + LEAD_IN) * (1 - enter);
    droneAlpha = phase(p, ENTER[0], ENTER[0] + 0.045);
    const seen = clamp(TARGET.frames + Math.floor(tPre * TARGET.fps + 1e-6), 0, TARGET.frames);
    if (seen !== lastSeen) {
      lastSeen = seen;
      fitLine(det, seen);
    }
    // ---- what the track says.
    op(els.varr, phase(p, KNOWN[0], KNOWN[0] + 0.05));
    op(els.vl, phase(p, KNOWN[0], KNOWN[0] + 0.05));
    fade(els.tl, phase(p, KNOWN[0] + 0.015, KNOWN[0] + 0.065));
    op(els.hext, phase(p, KNOWN[0] + 0.03, KNOWN[1]));
    op(els.hdim, phase(p, KNOWN[0] + 0.03, KNOWN[1]));
    op(els.hl, phase(p, KNOWN[0] + 0.04, KNOWN[1]));
    line("los", phase(p, LOS[0], LOS[1]));
    riders.losl = phase(p, LOS[1] - 0.04, LOS[1] + 0.02);
    // The prediction runs out ahead of the drone as far as the solver will look, then settles on the answer.
    const prd = els.prd;
    if (prd) {
      const pred = phase(p, PRED[0], PRED[1]), a = g.a.prd;
      const far = mix(mix(+a.x1, g.n.prdX, pred), +a.x2, swap(phase(p, FINAL + 0.02, FINAL + 0.1)));
      prd.setAttribute("x2", far.toFixed(1));
      op(prd, pred > 0 ? 1 : 0);
    }

    // ---- the solver: each pass predicts a point, flies a round at it, and measures how far the drone would be from it by then.
    const w = (SOLVE[1] - SOLVE[0]) / s.n;
    const gone = 1 - phase(p, FINAL + 0.01, FINAL + 0.085);
    const cur = clamp(Math.floor((p - SOLVE[0]) / w), 0, s.n - 1);
    let landed = -1, front = 0, ringX = +g.a.sd0.cx, ringY = +g.a.sd0.cy;
    for (let k = 0; k < MAX_ITER; k++) {
      const a = SOLVE[0] + k * w, live = k < s.n;
      const drawn = live ? phase(p, a + 0.1 * w, a + 0.6 * w) : 0;
      const land = live ? phase(p, a + 0.55 * w, a + 0.95 * w) : 0;
      // The newest candidate is solid; older ones step back. The last one becomes the answer.
      const age = live && k < s.n - 1 ? phase(p, a + w, a + 1.7 * w) : 0;
      dash(`cand${k}`, drawn);
      op(els[`cand${k}`], drawn > 0 ? (1 - 0.7 * age) * gone : 0);
      dash(`cpt${k}`, land);
      op(els[`cpt${k}`], land > 0 ? (1 - 0.6 * age) * gone : 0);
      // On the plot the line reaches the pass's point, and the point comes up under its tip.
      const sd = els[`sd${k}`];
      if (sd) sd.setAttribute("r", (dotR * arrive(phase(land, k ? 0.5 : 0, 1))).toFixed(2));
      fade(els[`sn${k}`], live ? land : 0);
      if (land > 0) {
        if (land >= 0.5) landed = k;
        const x = +g.a[`sd${k}`].cx, y = +g.a[`sd${k}`].cy;
        if (k) {
          front = mix(g.n.sfrac[k - 1], g.n.sfrac[k], land);
          ringX = mix(+g.a[`sd${k - 1}`].cx, x, land);
          ringY = mix(+g.a[`sd${k - 1}`].cy, y, land);
        } else {
          ringX = x;
          ringY = y;
        }
      }
    }
    dash("sline", front);
    const ring0 = phase(p, SOLVE[0] + 0.55 * w, SOLVE[0] + 0.95 * w);
    if (els.slast) {
      els.slast.setAttribute("cx", ringX.toFixed(1));
      els.slast.setAttribute("cy", ringY.toFixed(1));
      op(els.slast, ring0);
    }
    // The aim point slides along the track to where each pass puts it, the
    // elevation it calls for steps on the camera's tape, and the correction is written over it.
    const slide = cur ? swap(phase(p, SOLVE[0] + cur * w, SOLVE[0] + (cur + 0.24) * w)) : 1;
    const from = Math.max(0, cur - 1);
    els.am?.setAttribute("transform", `translate(${mix(g.n.aimX[from], g.n.aimX[cur], slide).toFixed(1)} ${mix(g.n.aimY[from], g.n.aimY[cur], slide).toFixed(1)})`);
    op(els.am, phase(p, SOLVE[0] - 0.02, SOLVE[0] + 0.015) * (1 - phase(p, FINAL + 0.05, FINAL + 0.11)));
    const cmd = cur ? swap(phase(p, SOLVE[0] + (cur + 0.1) * w, SOLVE[0] + (cur + 0.6) * w)) : 1;
    els.caim?.setAttribute("transform", `translate(0 ${mix(g.n.cmdY[from], g.n.cmdY[cur], cmd).toFixed(1)})`);
    op(els.caim, phase(p, SOLVE[0] + 0.1 * w, SOLVE[0] + 0.6 * w));
    const cl = els.cl;
    if (cl) {
      const at = Math.max(0, landed), was = Math.max(0, at - 1);
      const u = at ? swap(phase(p, SOLVE[0] + (at + 0.75) * w, SOLVE[0] + (at + 0.95) * w)) : 1;
      cl.setAttribute("x", mix(g.n.corrX[was], g.n.corrX[at], u).toFixed(1));
      cl.setAttribute("y", mix(g.n.corrY[was], g.n.corrY[at], u).toFixed(1));
      op(cl, phase(p, SOLVE[0] + 0.6 * w, SOLVE[0] + w) * (1 - phase(p, FINAL + 0.035, FINAL + 0.085)));
    }

    // ---- the answer: the trajectory, its time marks, where it meets the drone, and how the bore must sit.
    const arc = phase(p, FINAL, FINAL + 0.085);
    dash("arcP", arc);
    op(els.arcP, arc > 0 ? 1 : 0);
    els.sweep?.setAttribute("width", arc >= 1 ? String(g.a.sweep.width) : mix(L.ox, g.n.iX + L.ring, arc).toFixed(1));
    riders.tkl = phase(p, FINAL + 0.05, FINAL + 0.1);
    const ring = phase(p, FINAL + 0.05, FINAL + 0.13);
    if (els.ring) {
      els.ring.setAttribute("transform", `translate(${g.n.iX.toFixed(1)} ${g.n.iY.toFixed(1)}) scale(${(1.7 - 0.7 * arrive(ring)).toFixed(3)})`);
      op(els.ring, ring);
    }
    op(els.cring, ring);
    line("aim", phase(p, FINAL + 0.02, FINAL + 0.13));
    op(els.dlead, phase(p, FINAL + 0.1, FINAL + 0.15));
    op(els.il, phase(p, FINAL + 0.1, FINAL + 0.15));
    op(els.dl, phase(p, FINAL + 0.115, FINAL + 0.165));
    dash("la", phase(p, FINAL + 0.1, FINAL + 0.15));
    riders.ll = riders.aiml = phase(p, FINAL + 0.12, FINAL + 0.17);
    ride("ll");
    ride("losl");
    ride("tkl");
    ride("aiml");
    const ghost = phase(p, FINAL + 0.1, FINAL + 0.2);
    els.gclip?.setAttribute("width", ghost >= 1 ? String(g.a.gclip.width) : mix(L.ox, g.n.gX + 6, ghost).toFixed(1));

    // ---- the instruments: the range as soon as there is a sight line, the
    // rest as the passes come in (faint, and changing), settled once the solver stops.
    printPass(p < FINAL + 0.02 ? landed : -1);
    const first = phase(p, SOLVE[0] + 0.6 * w, SOLVE[0] + 1.1 * w);
    cells.forEach((c, i) => {
      const lock = phase(p, FINAL + 0.02 + 0.012 * i, FINAL + 0.075 + 0.012 * i);
      op(c.v, i ? first * (0.42 + 0.58 * lock) : phase(p, LOS[1] - 0.03, LOS[1] + 0.03));
      // The second line compares against the solved shot, so it waits for one.
      op(c.s, phase(p, FINAL + 0.05 + 0.012 * i, FINAL + 0.11 + 0.012 * i));
    });
    marksIn = phase(p, FINAL + 0.06, FINAL + 0.13);
    for (const el of aimRings) op(el, marksIn);

    // ---- the mount slews to the solved elevation; the camera view shows the bore arrive.
    const slew = phase(p, SLEW[0], SLEW[1]);
    const elev = REST + (g.n.th - REST) * swap(slew);
    settled = phase(slew, 0.62, 0.95);
    const locked = phase(p, SLEW[1] - 0.03, SLEW[1] + 0.02);
    op(els.cbr, locked);
    op(els.cbt, locked);
    op(els.cbv, locked);
    op(els.cdb, phase(p, SLEW[1] - 0.015, SLEW[1] + 0.035));
    op(els.cdt, phase(p, SLEW[1] - 0.015, SLEW[1] + 0.035));

    // ---- the shot.
    const fly = phase(p, FLY[0], FLY[1]);
    out.t = enter < 1 ? tPre : s.tof * fly;
    out.home = 0;
    out.alpha = 1;
    out.pulse = 1;
    out.elev = elev;

    if (p < 0.004) out.text = "standby";
    else if (enter < 1) out.text = seen ? `tracking  frame ${seen}${seen > 3 ? `  ${fx(vEst, 1)} m/s` : ""}` : "searching";
    else if (landed < 0) out.text = `track  ${fx(Math.hypot(s.vx, s.vy), 1)} m/s  range ${fx(s.range, 1)} m`;
    else if (p < SLEW[0] + 0.02) out.text = `pass ${landed + 1}  correction ${g.miss[landed]}`;
    else if (fly <= 0) out.text = slew < 1 ? `slewing  elevation ${fx(elev, 1)}°` : `holding  elevation ${fx(elev, 2)}°`;
    else out.text = "";
    return out;
  }

  /**
   * Before each replay the solver's passes are walked again: a point comes
   * down the convergence line, pass by pass, and the shot goes as it reaches
   * the last. (h is how far into the replay's rest we are, in seconds; negative is not at all.)
   */
  function walk(h: number) {
    const n = G.n.sfrac.length;
    if (h === lastWalk) return;
    lastWalk = h;
    const lead = HOLD - WALK;
    if (h < lead || h >= HOLD || n < 2) return op(walker, 0);
    const u = ((h - lead) / WALK) * (n - 1), k = Math.min(n - 2, Math.floor(u)), f = swap(u - k);
    const a = G.a[`sd${k}`], b = G.a[`sd${k + 1}`];
    walker.setAttribute("cx", mix(+a.cx, +b.cx, f).toFixed(1));
    walker.setAttribute("cy", mix(+a.cy, +b.cy, f).toFixed(1));
    op(walker, Math.min(1, u * 3, (n - 1 - u) * 4));
  }

  /** Drop below the bore line at time t on the shot clock. */
  const dropAt = (s: Solution, t: number) => {
    roundAt(s, t, pa);
    return pa[0] * Math.tan(s.theta) - pa[1];
  };

  /**
   * The moving bodies, cheap enough for every frame: the drone, the round and
   * its no-drag twin, the same three in the camera view, the frames the camera
   * has taken by now, and all of them again on the instruments' scales.
   */
  function flight(s: Solution, b: Shot) {
    const { t, home, alpha, pulse } = b;
    // Nothing to do while the picture holds still.
    if (t === last[0] && home === last[1] && pulse === last[2] && alpha === last[3] && droneAlpha === last[4] && marksIn === last[5]) return;
    last[0] = t; last[1] = home; last[2] = pulse; last[3] = alpha; last[4] = droneAlpha; last[5] = marksIn;
    const g = G, back = home >= 0.5;
    // One drone fades out where the round met it as the other fades in where the camera saw it.
    const cross = back ? home * 2 - 1 : 1 - home * 2;
    const td = back ? 0 : Math.min(t, s.tof);
    const wx = s.dx + s.vx * td, wy = s.dy + s.vy * td;
    const dr = els.dr;
    if (dr) {
      dr.setAttribute("transform", droneAt(L, toX(L, wx), toY(L, wy)));
      op(dr, droneAlpha * cross);
    }
    // Where it was seen stays marked while it flies on.
    const away = clamp(t / (0.12 * s.tof), 0, 1);
    op(els.dD, t > 0 ? away * (1 - Math.max(0, home * 2 - 1)) : 0);
    const cy = camY(L, Math.atan2(wy, wx) / RAD, g.n.mid);
    els.cbox?.setAttribute("transform", `translate(${C.cx} ${cy.toFixed(1)})`);
    op(els.cbox, droneAlpha * cross);
    if (els.cdl) {
      els.cdl.setAttribute("y", (cy + L.f * 1.1).toFixed(1));
      // The label steps aside while the drone is away from where it was seen.
      op(els.cdl, droneAlpha * inWindow(cy, 4, L.f * 1.3) * (back ? cross : 1 - clamp(t / (0.3 * s.tof), 0, 1)));
    }

    // The frames the camera has taken by now: the track's own up to the moment
    // of firing, then one more each thirtieth of a second, the oldest dropping away.
    const f = Math.floor(td * TARGET.fps + 1e-6);
    const hi = Math.min(TARGET.frames - 1 + AHEAD, TARGET.frames - 1 + f), lo = Math.max(0, f);
    if (lo !== lastLo || hi !== lastHi) {
      lastLo = lo;
      lastHi = hi;
      els.det?.setAttribute("d", hi >= lo ? g.det.slice(lo, hi + 1).join("") : "");
      els.ctrail?.setAttribute("d", hi >= lo ? g.cdet.slice(lo, hi + 1).join("") : "");
    }
    const trail = home > 0 && home < 1 ? cross : 1;
    op(els.det, trail);
    op(els.ctrail, trail);

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
    const clear = flying ? clamp((t - tMuzzle) / 0.014, 0, 1) : 0, shown = flying ? alpha : 0;
    op(els.rnd, clear * alpha);
    op(els.crnd, shown * clamp(t / (0.1 * s.tof), 0, 1));
    op(els.arcF, shown);
    op(els.tail, clear * alpha * clamp((s.tof - t) / 0.012, 0, 1));
    // The no-drag round runs ahead; if it leaves the sky it fades at the edge.
    op(els.gdot, flying ? alpha * (g.n.ghostIn ? 1 : clamp((g.n.ghostT - t) / 0.02, 0, 1)) : 0);
    op(els.gl, flying && g.n.ghostLabel ? phase(t / s.tof, 0.55, 0.8) * alpha : 0);

    // The air leaving the muzzle, for the first instant of the flight.
    const pf = els.puff;
    if (pf) {
      const u = flying && t >= tMuzzle && t < tMuzzle + PUFF ? (t - tMuzzle) / PUFF : -1;
      if (u >= 0) pf.setAttribute("r", (2 + 8 * arrive(u)).toFixed(1));
      op(pf, u >= 0 ? Math.min(1, u * 5) * (1 - u) * 0.85 * alpha : 0);
    }
    const pu = els.pulse;
    if (pu) {
      const live = pulse > 0 && pulse < 1;
      // A ripple: it spreads at an even pace and thins as it goes.
      if (live) pu.setAttribute("r", (L.ring * (1 + 1.6 * (1 - (1 - pulse) ** 1.6))).toFixed(1));
      op(pu, live ? Math.min(1, pulse * 5) * (1 - pulse) ** 1.4 * 0.9 : 0);
    }

    // The instruments' scales carry the same three bodies.
    gauges(s, t, Math.max(0, td), gv);
    for (let i = 0; i < GAUGE.n; i++) {
      const el = marks[i];
      if (!el) continue;
      if (Math.abs(gv[i] - lastG[i]) > 2e-4) {
        lastG[i] = gv[i];
        el.setAttribute("transform", gaugeAt(L, gv[i]));
      }
      op(el, marksIn * (i === GAUGE.rangeDrone || i === GAUGE.leadDrone || i === GAUGE.elevDrone ? cross : alpha));
    }
  }

  /** Ambient parts that run on their own clock. */
  function idle(now: number) {
    const u = (now / 2.8) % 1, y = (C.y0 + u * (C.y1 - C.y0)).toFixed(1);
    scan.setAttribute("y1", y);
    scan.setAttribute("y2", y);
    op(scan, awake * Math.min(1, u * 6, (1 - u) * 6));
    // Rotors: the blade seen edge-on sweeps in and out.
    for (let i = 0; i < blades.length; i++) {
      const c = i ? 10 : -10, h = 6.5 * (0.4 + 0.6 * Math.abs(Math.sin(now * 23 + i * 1.9)));
      blades[i].setAttribute("x1", (c - h).toFixed(1));
      blades[i].setAttribute("x2", (c + h).toFixed(1));
    }
    // The camera's light breathes rather than blinks.
    led.style.opacity = (0.25 + 0.75 * awake * (0.5 - 0.5 * Math.cos((now / 1.4) * 2 * Math.PI)) ** 2).toFixed(2);
  }

  /** Pointer position in metres from the mount, and in the plot's own units. */
  function world(e: { clientX: number; clientY: number }, out: Float64Array) {
    const m = svg.getScreenCTM();
    if (!m) return false;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    out[0] = (p.x - L.ox) / L.s;
    out[1] = (L.oy - p.y) / L.s;
    return true;
  }

  /** The placing mark: where a click would put the drone. */
  function cursor(x: number, y: number, on: boolean) {
    cur.setAttribute("opacity", on ? "1" : "0");
    if (on) cur.setAttribute("transform", `translate(${toX(L, x).toFixed(1)} ${toY(L, y).toFixed(1)})`);
  }

  /**
   * The probe: a rule at the round's distance downrange, that distance on the
   * axis (the axis's own labels step aside for it), and the round's clock and
   * speed beside the pointer (at height py, in metres). While it is up, the
   * labels that ride the two rays stand back so that its own can be read.
   */
  let probeShown = 0;
  function probeAt(s: Solution, t: number, py: number, o: number, touch: boolean) {
    const back = o <= 0.001 ? 1 : 1 - 0.72 * o;
    if (back !== standBack) {
      standBack = back;
      ride("ll");
      ride("losl");
      ride("tkl");
      ride("aiml");
    }
    if (o <= 0.001) {
      if (probeShown !== 0) {
        probe.setAttribute("opacity", "0");
        for (const a of axis) if (a.o !== 1) fade(a.el, (a.o = 1));
      }
      probeShown = 0;
      return;
    }
    probeShown = o;
    probe.setAttribute("opacity", o >= 0.999 ? "1" : o.toFixed(3));
    roundAt(s, clamp(t, 0, s.tof), pa);
    const X = toX(L, pa[0]), x = X.toFixed(1);
    pLine.setAttribute("x1", x);
    pLine.setAttribute("x2", x);
    const foot = `${fx(pa[0], 1)} m`;
    if (pFoot.textContent !== foot) pFoot.textContent = foot;
    pFoot.setAttribute("x", x);
    for (const a of axis) {
      const v = 1 - o * (1 - clamp((Math.abs(a.x - X) - L.f * 2.6) / (L.f * 1.2), 0, 1));
      if (Math.abs(v - a.o) > 0.004) fade(a.el, (a.o = v));
    }
    // (An en space: a run of ordinary ones would be drawn as one.)
    const tag = `${fx(clamp(t, 0, s.tof), 3)} s\u2002 ${fx(pa[2], 0)} m/s`;
    if (pTag.textContent !== tag) pTag.textContent = tag;
    const left = X > L.right - L.f * 10;
    let Y = clamp(toY(L, py) - (touch ? 30 : 10), L.top + L.f * 1.2, L.oy - L.f * 0.8);
    // Beside the panels the tag keeps below them.
    if (L.wide && X < P.x + P.w + 14) Y = Math.max(Y, P.y + P.h + L.f + 10);
    pTag.setAttribute("x", (X + (left ? -9 : 9)).toFixed(1));
    pTag.setAttribute("y", Y.toFixed(1));
    pTag.setAttribute("text-anchor", left ? "end" : "start");
  }

  return { svg, L, hit, pk, replayLab, apply, reframe, story, flight, walk, aimAt, dropAt, idle, world, cursor, probeAt };
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
  const noise = fillNoise(createNoise(), SEED);
  let seed = SEED;
  const det = new Float64Array(TARGET.frames * 2), est = new Float64Array(4);
  const drone = { x: D0.x as number, y: D0.y as number }, want = { x: D0.x as number, y: D0.y as number };
  // One layout is showing; the other keeps its server-rendered frame until it is.
  const narrow = window.matchMedia("(max-width: 899.98px)");
  const pick = () => views.find((v) => v.L.wide !== narrow.matches) ?? views[0];
  let view = pick();

  function resolve() {
    detections(drone.x, drone.y, -TARGET.speed, 0, det, noise);
    fitTrack(det, est);
    solve(est[0], est[1], est[2], est[3], sol);
    view.apply(geom(view.L, sol, det, noise));
  }

  // ---- state.
  // p is the scroll story. `hold` pulls the plate to its solved state when the
  // reader takes the drone before the story has finished (its own object, so
  // its tweens never touch the scrubbed one).
  const st = { p: 0 }, user = { hold: 0 };
  const beat = { ...shot(), elev: REST, text: "" };
  const pe = () => Math.max(st.p, user.hold);
  // The shot clock: what is asked for, what is on the plate, and what was on the plate when charge last changed hands.
  type Source = "story" | "replay" | "probe" | "still";
  const target = shot(), shown = shot(), from = shot();
  let source: Source = "story", handed = 1;
  let clock = 0; // the replay's own clock (s)
  let elev = REST; // barrel elevation on the plate (deg): after the story it follows the solution like a servo
  let dragging = false, touched = false;
  // A pointer over the sky. It only counts once it has moved there: a page
  // scrolled under a pointer at rest is not a reader reaching for the plot.
  const hover = { on: false, x: 0, y: 0, touch: false, cx: NaN, cy: NaN, at: 0 };
  let probeAlpha = 0, replaying = false;
  function setReplay(on: boolean) {
    if (on === replaying) return;
    replaying = on;
    for (const v of views) v.replayLab.style.opacity = on ? "1" : "0";
  }

  /** The story at the current progress: everything but the moving bodies, which the frame loop draws. */
  function render() {
    view.story(pe(), sol, det, beat);
  }
  /** Draw the moving bodies as they stand. */
  function paint() {
    view.aimAt(elev);
    view.flight(sol, shown);
  }

  resolve();
  render();
  Object.assign(shown, beat);
  elev = beat.elev;
  paint();
  say(beat.text);
  narrow.addEventListener("change", () => {
    view = pick();
    resolve();
    render();
    paint();
  });

  // ---- scroll: the story, scrubbed. It starts once the top of the plate has
  // been plotted, and ends just before the plate's middle reaches the
  // window's, so that a plate brought to rest in the middle of the window has
  // always finished (the replay and the pointer only start once it has). Where
  // the plate is too tall for that it ends with the plate's top a little under
  // the site's bar: the sky clear of the bar, and as much of the plate as will
  // fit in the window when the round arrives. It trails the scroll as closely
  // as the plate's own plotting does.
  const tl = scrubbed(root, {
    start: "top 80%",
    end: () => {
      const vh = window.innerHeight, bar = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 72;
      return `top ${Math.round(Math.max(bar + vh * 0.05, vh * 0.51 - root.offsetHeight / 2))}px`;
    },
    scrub: trail(0.3),
  });
  tl.to(st, { p: 1, duration: 1 });
  let pAtRelease = -1;
  tl.eventCallback("onUpdate", () => {
    // Scrolling on after a drag hands the plate back to the story.
    if (user.hold > 0 && !dragging && pAtRelease >= 0 && Math.abs(st.p - pAtRelease) > 0.04 && st.p < 0.999) {
      pAtRelease = -1;
      gsap.to(user, { hold: 0, duration: 0.6, ease: "swap", overwrite: true, onUpdate: render });
    }
    render();
  });

  // ---- every frame: who has the shot clock, and the picture from it.
  whileVisible(root, (dt, time) => {
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
    const done = pe() >= 0.999;
    if (hover.on && !hover.touch && time - hover.at > LINGER) hover.on = false;
    const next: Source = !done ? "story" : dragging || moving ? "still" : hover.on ? (hover.x < sol.ix - 0.2 ? "probe" : "still") : "replay";
    if (next !== source) {
      // The replay takes up wherever the picture is: mid-flight after a probe, at the meeting after the story, at rest otherwise.
      if (next === "replay") clock = source === "probe" ? MET + RETURN + HOLD + clamp(shown.t, 0, sol.tof) / SLOW : source === "story" ? 0 : MET + RETURN;
      Object.assign(from, shown);
      handed = 0;
      source = next;
    }

    let walking = -1;
    if (source === "story") {
      Object.assign(target, beat);
      elev = beat.elev;
    } else {
      // The barrel follows the solution with a short lag.
      const th = sol.theta / RAD, d = th - elev;
      if (d !== 0) elev = Math.abs(d) < 0.004 ? th : elev + d * (1 - Math.exp(-dt / 0.09));
      target.pulse = 1;
      if (source === "replay") {
        const fly = sol.tof / SLOW, total = MET + RETURN + HOLD + fly;
        const before = clock;
        clock += dt;
        if (clock >= total) clock -= total;
        const c = clock;
        target.t = sol.tof;
        target.alpha = 1;
        if (c < MET) {
          target.home = 0;
          target.pulse = c / RING;
        } else if (c < MET + RETURN) {
          target.home = (c - MET) / RETURN;
          // Half-way, with neither drone showing, the frames taken during the flight are let go; the next flight gets a new set.
          if (before < MET + RETURN / 2 && c >= MET + RETURN / 2) {
            seed = (seed + 0x9e3779b9) | 0;
            fillAhead(noise, seed);
            view.reframe(sol, det, noise);
          }
        } else if (c < MET + RETURN + HOLD) {
          const h = c - MET - RETURN;
          target.home = 1;
          // The last shot fades before the next is fired.
          target.alpha = clamp((HOLD - h) / FADE, 0, 1);
          walking = h;
        } else {
          // The next shot comes up as it leaves the barrel.
          target.t = (c - MET - RETURN - HOLD) * SLOW;
          target.home = 0;
          target.alpha = clamp(target.t / (0.1 * sol.tof), 0, 1);
        }
      } else if (source === "probe") {
        target.t = timeAt(sol, hover.x);
        target.home = 0;
        target.alpha = 1;
      } else {
        target.t = sol.tof;
        target.home = 1;
        target.alpha = 1;
      }
    }
    setReplay(source === "replay" && clock >= MET + RETURN + HOLD);

    // What is on the plate: the target, or on the way to it from where the last source left things.
    if (handed < 1) {
      handed = Math.min(1, handed + dt / HANDOVER);
      const u = swap(handed);
      shown.t = mix(from.t, target.t, u);
      shown.home = mix(from.home, target.home, u);
      shown.alpha = mix(from.alpha, target.alpha, u);
    } else {
      shown.t = target.t;
      shown.home = target.home;
      shown.alpha = target.alpha;
    }
    shown.pulse = target.pulse;
    paint();
    view.walk(walking);

    probeAlpha = source === "probe" ? Math.min(1, probeAlpha + dt / 0.14) : Math.max(0, probeAlpha - dt / 0.14);
    view.probeAt(sol, shown.t, hover.y, probeAlpha, hover.touch);

    say(source === "story" ? beat.text || readoutFlight(sol, shown.t, view.dropAt(sol, shown.t)) : readoutFlight(sol, clamp(shown.t, 0, sol.tof), view.dropAt(sol, shown.t)));
    view.svg.toggleAttribute("data-hint", done && !touched);
    view.idle(time);
  });

  // Frames travel up the lead from the camera to its view; the story fades them in.
  for (const v of views) {
    const feed = v.svg.querySelector<SVGPathElement>(".ic-feed");
    if (feed && v.pk) packets(root, v.pk, feed, { n: 2, speed: 0.55, r: 1.6, active: () => v === view });
  }

  // ---- the reader's hand: drag the drone, or move it with the arrow keys;
  // and anywhere short of the meeting, the pointer is the shot clock.
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
    if (user.hold < 1 && st.p < 0.999) gsap.to(user, { hold: 1, duration: 0.7, ease: "arrive", overwrite: true, onUpdate: render });
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
  /** Is this point where the drone may be put (with a little slack at the edges)? */
  const inField = (x: number, y: number, slack = 0) => x >= BOUNDS.x0 - slack && x <= BOUNDS.x1 + slack && y >= BOUNDS.y0 - slack && y <= BOUNDS.y1 + slack;

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

    // A mouse press on the field takes the drone at once. A finger only takes
    // hold once it has moved sideways (vertical swipes stay with the page):
    // begun on the field it moves the drone, keeping its offset so the drone
    // does not jump under the thumb; begun short of the field it scrubs the shot.
    let grab: { id: number; x: number; y: number; ox: number; oy: number; on: boolean; drone: boolean } | null = null;
    hit.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (!v.world(e, w)) return;
      const near = Math.hypot(w[0] - drone.x, w[1] - drone.y) < 3.2;
      const field = near || inField(w[0], w[1], 1.5);
      grab = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: 0, oy: 0, on: false, drone: field };
      if (e.pointerType === "mouse") {
        if (!field) {
          grab = null;
          return;
        }
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
    // A mouse over the sky is the shot clock, shows where a click would put the drone, and takes hold near the drone itself.
    const over = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || grab || !v.world(e, w)) return;
      const near = Math.hypot(w[0] - drone.x, w[1] - drone.y) < 3.2;
      svg.classList.toggle("near", near);
      const moved = hover.cx === hover.cx && (e.clientX !== hover.cx || e.clientY !== hover.cy);
      hover.cx = e.clientX;
      hover.cy = e.clientY;
      if (moved) {
        hover.on = true;
        hover.at = performance.now() / 1000;
      }
      hover.touch = false;
      hover.x = w[0];
      hover.y = w[1];
      v.cursor(w[0], w[1], !near && inField(w[0], w[1]) && pe() >= 0.999);
    };
    hit.addEventListener("pointerenter", over);
    hit.addEventListener("pointerleave", (e) => {
      svg.classList.remove("near");
      v.cursor(0, 0, false);
      if (e.pointerType === "mouse") {
        hover.on = false;
        hover.cx = hover.cy = NaN;
      }
    });
    hit.addEventListener("pointermove", (e) => {
      if (!grab) over(e);
      if (!grab || e.pointerId !== grab.id) return;
      if (!grab.on) {
        const mx = Math.abs(e.clientX - grab.x), my = Math.abs(e.clientY - grab.y);
        // Up-and-down belongs to the page; only a sideways start takes hold.
        if (Math.hypot(mx, my) < 6 || mx < my) return;
        grab.on = true;
        hit.setPointerCapture(e.pointerId);
        if (grab.drone) {
          dragging = true;
          svg.classList.add("dragging");
        }
      }
      if (!v.world(e, w)) return;
      if (grab.drone) place(w[0] + grab.ox, w[1] + grab.oy);
      else {
        hover.on = true;
        hover.touch = true;
        hover.x = w[0];
        hover.y = w[1];
      }
    });
    const release = (e: PointerEvent) => {
      if (!grab || e.pointerId !== grab.id) return;
      // A tap on the field sends the drone to that spot.
      if (!grab.on && grab.drone && e.type === "pointerup" && v.world(e, w)) place(w[0], w[1], true);
      else if (grab.on && grab.drone) {
        clearTimeout(liveTimer);
        liveTimer = window.setTimeout(() => (live.textContent = describe()), 500);
      }
      if (!grab.drone) hover.on = false;
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
