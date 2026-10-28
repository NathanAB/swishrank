// The theme switch in the top bar flips light and dark and remembers the pick. Until the reader picks, the page
// follows the system's setting, live. The head's inline script sets the theme before the first paint.
type Theme = "light" | "dark";

const root = document.documentElement;
const system = matchMedia("(prefers-color-scheme: dark)");
const button = document.querySelector<HTMLButtonElement>("[data-theme-toggle]");

function picked(): string | null {
  try {
    return localStorage.getItem("theme");
  } catch {
    return null;
  }
}

function show(theme: Theme) {
  root.dataset.theme = theme;
  button?.setAttribute("aria-pressed", String(theme === "dark"));
  button?.setAttribute("title", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
}

show(root.dataset.theme === "dark" ? "dark" : "light");

button?.addEventListener("click", () => {
  const next: Theme = root.dataset.theme === "dark" ? "light" : "dark";
  show(next);
  try {
    localStorage.setItem("theme", next);
  } catch {
    // Private windows can refuse storage; the switch still works for this page.
  }
});

// Back and Forward can restore a page from the browser's cache as it was, in the theme picked before.
addEventListener("pageshow", (e) => {
  const theme = picked();
  if (e.persisted && (theme === "light" || theme === "dark")) show(theme);
});

system.addEventListener("change", (e) => {
  if (!picked()) show(e.matches ? "dark" : "light");
});
