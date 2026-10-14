/**
 * Things with mass.
 *
 * A value that follows the hand (the mark on the index, the weight of a letter)
 * is not tweened: there is no start and no end to tween between, only where it
 * is and where it is wanted. It is a spring, critically damped: it closes on
 * its target as fast as anything can without ever passing it.
 */
import { gsap } from "./motion";

export type Spring = { x: number; v: number };

/**
 * Move `s` toward `to` for `dt` seconds. `omega` is the spring's natural
 * frequency, rad/s: it is within a percent of its target after about 6.6 / omega
 * seconds. The step is the exact solution, so it is the same motion at any
 * frame rate and cannot blow up on a long frame.
 */
export function step(s: Spring, to: number, omega: number, dt: number) {
  const d = s.x - to;
  const k = (s.v + omega * d) * dt;
  const e = Math.exp(-omega * dt);
  s.x = to + (d + k) * e;
  s.v = (s.v - omega * k) * e;
}

/** True once `s` is at `to` for every purpose: within `slack` of it and all but still. */
export const settled = (s: Spring, to: number, slack: number) => Math.abs(s.x - to) < slack && Math.abs(s.v) < slack * 8;

/**
 * A loop that runs only while something is moving. `frame(dt)` is called on
 * GSAP's ticker (after the page's scroll has been read) and returns whether
 * there is more to do; when it says no, the loop comes off the ticker. The
 * function returned wakes it again.
 */
export function mover(frame: (dt: number) => boolean) {
  let on = false;
  const tick = (_t: number, ms: number) => {
    // A long frame (a tab coming back) is taken as a short one: nothing lurches.
    if (frame(Math.min(ms, 50) / 1000)) return;
    gsap.ticker.remove(tick);
    on = false;
  };
  return () => {
    if (on) return;
    on = true;
    gsap.ticker.add(tick);
  };
}
