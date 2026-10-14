import { gsap, trail, whileVisible, T } from "../motion";
import { aBallistic, aConservative, F_MAX } from "../binary";
import { mountSky, type Scene } from "../sky";

/**
 * The Roche landscape.
 *
 * The scroll tells the caption's story in the order the caption does. The
 * ground is plotted from its lowest levels up, so the line being drawn is
 * always a level line of the potential: the two wells grow until they meet
 * at the pass, and the last ground to be drawn is the high ground round L4
 * and L5. The donor then fills its basin to the level of the pass, the gas
 * spills over it and falls to the other star, and only once it has arrived
 * does mass begin to move: the ground, drawn to the scale of the orbit,
 * shrinks with the upper bar while the classical answer grows away from it.
 *
 * The scene turns on its own clock the whole time, and the pointer puts a
 * parcel of gas down on the ground to see where it would go.
 */
export default function landscape(root: HTMLElement) {
  const box = root.querySelector<HTMLElement>(".ls")!;
  const canvas = root.querySelector<HTMLCanvasElement>("[data-sky]")!;
  const readout = root.querySelector<HTMLElement>("[data-readout]")!;
  const scene: Scene = { f: 0, plot: 0, fill: 0, spill: 0, bar: 0, l1: 0, donor: 0, accretor: 0, probe: 0, px: 0, py: 0 };
  const sky = mountSky(canvas, scene, { theta: 2.5 });

  // The story runs from the moment the plate is there until it is at rest in
  // the middle of the window: its own middle on the window's, or the canvas's
  // (on a phone the canvas is the top of a tall plate), whichever comes first.
  const span = () => {
    const vh = window.innerHeight;
    const plate = root.getBoundingClientRect(), b = box.getBoundingClientRect();
    return Math.max(240, Math.min(0.39 * vh + plate.height / 2 - (b.top - plate.top), 0.44 * vh + b.height / 2));
  };
  gsap
    .timeline({ defaults: { ease: "none" }, scrollTrigger: { trigger: box, start: "top 90%", end: () => `+=${span()}`, scrub: trail(0.5) } })
    // The ground, and the scale it is drawn to.
    .to(scene, { plot: 1, duration: 0.46 }, 0)
    .to(scene, { bar: 1, duration: 0.14 }, 0.02)
    .to(scene, { accretor: 1, duration: 0.1 }, 0.34)
    // The donor fills to the pass.
    .to(scene, { fill: 1, duration: 0.13 }, 0.47)
    .to(scene, { donor: 1, duration: 0.09 }, 0.52)
    .to(scene, { l1: 1, duration: 0.07 }, 0.57)
    // It spills: half of this is the fall, half the first turns of the disc.
    .to(scene, { spill: 1, duration: 0.21 }, 0.59)
    // Mass arrives, and the orbit answers.
    .to(scene, { f: F_MAX, duration: 0.3 }, 0.7);

  // The readout follows the story, or the probe while it is on the ground. When it
  // turns from one to the other the old line goes out and the new one comes in.
  let who = "", line = "", turning = false;
  const write = (s: string) => {
    if (s !== line) readout.textContent = line = s;
  };
  const num = (v: number, d: number) => `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}`;
  const now = (): [string, string] => {
    const r = scene.probe > 0.5 ? sky.reading() : null;
    if (r) return ["probe", `Φ ${num(r.phi, 3)} GM/a   ${Math.abs(r.rel) < 0.005 ? "level with the pass" : `${Math.abs(r.rel).toFixed(2)} ${r.rel > 0 ? "above" : "below"} the pass`}`];
    return ["story", `moved ${(scene.f * 100).toFixed(1)}%   ballistic ${aBallistic(scene.f).toFixed(3)} a₀   classical ${aConservative(scene.f).toFixed(3)} a₀`];
  };
  whileVisible(root, (dt) => {
    sky.frame(dt);
    const [subject, s] = now();
    if (!who) who = subject;
    if (subject === who && !turning) return write(s);
    if (turning) return;
    turning = true;
    gsap.to(readout, {
      opacity: 0,
      duration: 0.1,
      ease: "swap",
      overwrite: true,
      onComplete() {
        [who, line] = now();
        readout.textContent = line;
        turning = false;
        gsap.to(readout, { opacity: 1, duration: T.press, ease: "arrive", overwrite: true });
      },
    });
  });

  // The pointer puts a parcel down. A finger does the same and leaves it there a moment.
  let leaving: gsap.core.Tween | null = null;
  let shown = false;
  let lastY = 0;
  const carried = () => {
    // The page moving under a still pointer moves the pointer over the canvas.
    scene.py += window.scrollY - lastY;
    lastY = window.scrollY;
  };
  const show = (e: PointerEvent) => {
    leaving?.kill();
    leaving = null;
    scene.px = e.offsetX;
    scene.py = e.offsetY;
    lastY = window.scrollY;
    if (!shown) gsap.to(scene, { probe: 1, duration: T.state, ease: "arrive", overwrite: "auto" });
    shown = true;
  };
  const hide = (after = 0) => {
    leaving?.kill();
    shown = false;
    leaving = gsap.to(scene, { probe: 0, duration: T.state, ease: "arrive", delay: after, overwrite: "auto" });
    window.removeEventListener("scroll", carried);
  };
  canvas.addEventListener("pointerenter", (e) => {
    if (e.pointerType === "mouse") window.addEventListener("scroll", carried, { passive: true });
  });
  follow(canvas, show, (e) => {
    if (shown) hide(e.pointerType === "mouse" ? 0 : 2.2);
  });
}

/**
 * Follow a pointer over `el`. A mouse or a pen is taken as it moves. A finger
 * that comes down may be the start of a scroll, so its place is taken up only
 * once it has stayed down a moment, or has lifted again as a tap; if the
 * browser takes the touch for a scroll first, it never is.
 */
function follow(el: Element, take: (e: PointerEvent) => void, leave: (e: PointerEvent) => void) {
  let wait = 0;
  let held: PointerEvent | null = null;
  const settle = () => {
    clearTimeout(wait);
    wait = 0;
    if (held) take(held);
    held = null;
  };
  el.addEventListener("pointerdown", (e) => {
    const ev = e as PointerEvent;
    if (ev.pointerType !== "touch") return take(ev);
    held = ev;
    clearTimeout(wait);
    wait = window.setTimeout(settle, 130);
  });
  el.addEventListener("pointermove", (e) => {
    if (wait) held = e as PointerEvent;
    else take(e as PointerEvent);
  });
  el.addEventListener("pointerup", () => {
    if (wait) settle();
  });
  el.addEventListener("pointercancel", () => {
    clearTimeout(wait);
    wait = 0;
    held = null;
  });
  el.addEventListener("pointerleave", (e) => leave(e as PointerEvent));
}
