import { ScrollTrigger } from "../motion";
import { aBallistic, aConservative, F_MAX } from "../binary";
import { mountSky } from "../sky";

// The Roche landscape. Scroll moves mass from the donor to the accretor; the
// system keeps turning on its own clock while the plate is on screen.
export default function landscape(root: HTMLElement) {
  const canvas = root.querySelector<HTMLCanvasElement>("[data-sky]")!;
  const readout = root.querySelector<HTMLElement>("[data-readout]")!;
  const sky = mountSky(canvas, {
    place: (w, h) => ({ cx: w / 2, cy: h * 0.47, s: Math.min(w / 3.75, h / 2.95) }),
  });

  const show = (f: number) => {
    sky.setF(f);
    readout.textContent = `moved ${(f * 100).toFixed(1)}%   ballistic ${aBallistic(f).toFixed(3)} a₀   classical ${aConservative(f).toFixed(3)} a₀`;
  };
  ScrollTrigger.create({
    trigger: root,
    start: "top 78%",
    end: "bottom 42%",
    scrub: 0.5,
    onUpdate: (self) => show(self.progress * F_MAX),
  });
  show(0);

  let seen = false;
  const sync = () => sky.run(seen && !document.hidden);
  new IntersectionObserver(([e]) => {
    seen = e.isIntersecting;
    sync();
  }, { rootMargin: "80px" }).observe(root);
  document.addEventListener("visibilitychange", sync);
}
