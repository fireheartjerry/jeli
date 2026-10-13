// Day and night. The site opens at night (it opens in space); an inline script
// in Base.astro applies a stored choice before first paint, and this module
// handles changing it afterwards.
export type Theme = "light" | "dark";

const root = document.documentElement;

export const getTheme = (): Theme => (root.dataset.theme === "dark" ? "dark" : "light");

export function setTheme(theme: Theme) {
  if (theme === getTheme()) return;
  // Ease the big surfaces across; everything else follows its tokens at once.
  root.toggleAttribute("data-theme-switching", true);
  root.dataset.theme = theme;
  try {
    localStorage.setItem("theme", theme);
  } catch {
    // Private mode: the choice lasts for this page only.
  }
  // Canvas figures cache their colours; this tells them to read the tokens again.
  document.dispatchEvent(new CustomEvent("themechange", { detail: theme }));
  window.setTimeout(() => root.removeAttribute("data-theme-switching"), 500);
}

export const toggleTheme = () => setTheme(getTheme() === "dark" ? "light" : "dark");
