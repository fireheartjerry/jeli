// Injected into the page before any of its scripts (tools/qa/lib.mjs).
//
// It replaces the page's clocks with one the capture tool owns, so an
// animation can be stepped a frame at a time and photographed at each step,
// the same way on every run:
//
//   performance.now, Date, requestAnimationFrame, setTimeout / setInterval and
//   requestIdleCallback all read one virtual time, which only moves when
//   __qa.step(ms) is called. One step runs the timers that fall due and then
//   one round of frame callbacks: one frame of the page.
//
//   CSS animations, CSS transitions and Web Animations do not use those
//   clocks. The capture tool freezes the document's own timeline over the
//   DevTools protocol (Animation.setPlaybackRate 0) before the page loads, and
//   each step moves every running animation on by hand by the same amount. They
//   still finish, and still fire their events, when they reach their end.
//
//   Math.random is seeded, so anything scattered at random lands in the same
//   place every run.
//
// Nothing else about the page changes: layout, scroll events, observers and
// the network run as they always do. (This is the only arrangement that works
// on macOS: Chrome's own virtual time leaves frames and CSS on the real clock,
// and frame-by-frame compositor control is not built for it.)
(() => {
  const NativeDate = window.Date;
  const real = { raf: window.requestAnimationFrame.bind(window) };
  const EPOCH = NativeDate.UTC(2026, 9, 13, 12);
  let t = 0; // virtual ms since the page began
  let id = 1;
  let frames = new Map();
  const timers = new Map();

  window.requestAnimationFrame = (fn) => (frames.set(id, fn), id++);
  window.cancelAnimationFrame = (n) => void frames.delete(n);
  performance.now = () => t;
  // Date, with and without `new`, reading the virtual time.
  function VDate(...a) {
    return new.target ? Reflect.construct(NativeDate, a.length ? a : [EPOCH + t], new.target) : new NativeDate(EPOCH + t).toString();
  }
  VDate.prototype = NativeDate.prototype;
  VDate.now = () => EPOCH + t;
  VDate.parse = NativeDate.parse;
  VDate.UTC = NativeDate.UTC;
  window.Date = VDate;

  const later = (fn, ms, args, every) => (timers.set(id, { at: t + Math.max(0, +ms || 0), fn, args, every }), id++);
  window.setTimeout = (fn, ms, ...args) => later(fn, ms, args, 0);
  window.setInterval = (fn, ms, ...args) => later(fn, ms, args, Math.max(1, +ms || 1));
  window.clearTimeout = window.clearInterval = (n) => void timers.delete(n);
  window.requestIdleCallback = (fn) => later(() => fn({ didTimeout: false, timeRemaining: () => 6 }), 1, [], 0);
  window.cancelIdleCallback = (n) => void timers.delete(n);

  let seed = 0x9e3779b9;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let v = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    v = (v + Math.imul(v ^ (v >>> 7), 61 | v)) ^ v;
    return ((v ^ (v >>> 14)) >>> 0) / 2 ** 32;
  };

  const call = (fn, ...a) => {
    try {
      typeof fn === "function" && fn(...a);
    } catch (e) {
      console.error(e);
    }
  };

  const tracked = new Map();
  const notes = {};

  window.__qa = {
    get t() {
      return t;
    },
    /** One frame: timers due in the next `ms`, the animations moved on by `ms`, then every frame callback. */
    step(ms = 1000 / 60) {
      const until = t + ms;
      for (let guard = 0; guard < 5000; guard++) {
        let next = null, key = 0;
        for (const [k, tm] of timers) if (tm.at <= until && (!next || tm.at < next.at)) (next = tm), (key = k);
        if (!next) break;
        t = Math.max(t, next.at);
        if (next.every) next.at += next.every;
        else timers.delete(key);
        call(next.fn, ...next.args);
      }
      t = until;
      let live = 0;
      for (const a of document.getAnimations()) {
        if (a.playState !== "running") continue;
        a.currentTime = (a.currentTime ?? 0) + ms * (a.playbackRate || 1);
        live++;
      }
      const run = frames;
      frames = new Map();
      for (const fn of run.values()) call(fn, t);
      return live;
    },
    /** Resolve after `n` real frames: time for scroll events, observers and layout, with the virtual clock held. */
    settle(n = 2) {
      return new Promise((done) => {
        const tick = () => (--n <= 0 ? done(true) : real.raf(tick));
        real.raf(tick);
      });
    },
    /** Name elements whose box and opacity are recorded with every frame. */
    track(map) {
      tracked.clear();
      for (const [name, sel] of Object.entries(map)) tracked.set(name, sel);
    },
    /** The page may leave values here for the record (the scene's camera does). */
    note(name, value) {
      notes[name] = value;
    },
    sample() {
      const els = {};
      for (const [name, sel] of tracked) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        els[name] = [+r.x.toFixed(2), +r.y.toFixed(2), +r.width.toFixed(2), +r.height.toFixed(2), +(+cs.opacity).toFixed(3)];
      }
      return { t: +t.toFixed(2), y: Math.round(window.scrollY * 100) / 100, tall: document.documentElement.scrollHeight, live: document.getAnimations().length, els, notes: JSON.parse(JSON.stringify(notes)) };
    },
  };
})();
