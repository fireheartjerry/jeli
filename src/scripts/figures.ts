import { reducedMotion } from "./motion";

// Each figure's animation is its own chunk, fetched only as the figure
// approaches the viewport. A figure with no module stays static.
const modules = import.meta.glob<{ default: (root: HTMLElement) => void }>(
  "./figures/*.ts",
);

function boot() {
  if (reducedMotion()) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        io.unobserve(entry.target);
        const root = entry.target as HTMLElement;
        const load = modules[`./figures/${root.dataset.fig}.ts`];
        load?.().then((m) => {
          m.default(root);
          root.dataset.live = "";
          // The status light runs while the figure holds the middle of the screen.
          new IntersectionObserver(([e]) => root.toggleAttribute("data-running", e.isIntersecting), {
            rootMargin: "-25% 0px -25% 0px",
          }).observe(root);
        });
      }
    },
    { rootMargin: "120% 0px" },
  );
  document.querySelectorAll<HTMLElement>("[data-fig]").forEach((el) => io.observe(el));
}

boot();
