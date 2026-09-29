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
  "%cHi. The figures on this page are drawn from real data and real physics.\nSource: github.com/fireheartjerry/jeli",
  "font: 12px/1.6 ui-monospace, monospace; color: #2743d6",
);
