// The page's own motion, in the order it has to start: how one page hands over
// to the next (so a title carried here is known about), how the page scrolls,
// then everything that arrives.
import "./transit";
import { ScrollTrigger, reducedMotion } from "./motion";
import "./scroll";
import { reveals } from "./reveal";

if (!reducedMotion()) {
  reveals();
  // Figures and fonts change heights after load; re-measure once settled.
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
}

console.log(
  "%cHi. The scene behind this page is one camera take: 60,000 collectors on Kepler orbits, solved on your GPU, all from one seed.\nThe figures in front of it are drawn from real data. Source: github.com/fireheartjerry/jeli",
  "font: 12px/1.6 ui-monospace, monospace; color: #2743d6",
);
