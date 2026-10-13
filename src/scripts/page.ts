import { gsap, ScrollTrigger, reducedMotion } from "./motion";

// The hairline above each entry draws across as the entry arrives.
if (!reducedMotion()) {
  document.querySelectorAll<HTMLElement>(".entry").forEach((el) => {
    gsap.fromTo(
      el,
      { "--rule": 0 },
      {
        "--rule": 1,
        ease: "none",
        scrollTrigger: { trigger: el, start: "top 92%", end: "top 55%", scrub: 0.4 },
      },
    );
  });
  // Figures and fonts change heights after load; re-measure once settled.
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
}

console.log(
  "%cHi. The cover is a live simulation: 60,000 collectors on Kepler orbits, solved on your GPU, all from one seed.\nThe figures below it are drawn from real data. Source: github.com/fireheartjerry/jeli",
  "font: 12px/1.6 ui-monospace, monospace; color: #2743d6",
);
