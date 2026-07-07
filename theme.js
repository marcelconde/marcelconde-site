(function () {
  const storageKey = "mc_theme";
  const root = document.documentElement;

  function getSavedTheme() {
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return "";
    }
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem(storageKey, theme);
    } catch {
      // Theme still applies for the current page even when storage is unavailable.
    }
  }

  function preferredTheme() {
    const saved = getSavedTheme();
    if (saved === "light" || saved === "dark") return saved;
    return "dark";
  }

  function applyTheme(theme) {
    root.dataset.theme = theme;
    saveTheme(theme);
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.setAttribute("aria-label", theme === "light" ? "Ativar tema escuro" : "Ativar tema claro");
      button.setAttribute("title", theme === "light" ? "Tema escuro" : "Tema claro");
      button.textContent = theme === "light" ? "Escuro" : "Claro";
    });
  }

  function mountToggle() {
    if (document.querySelector("[data-theme-toggle]")) return;
    const button = document.createElement("button");
    button.className = "theme-toggle";
    button.type = "button";
    button.dataset.themeToggle = "true";
    button.addEventListener("click", () => {
      applyTheme(root.dataset.theme === "light" ? "dark" : "light");
    });
    document.body.appendChild(button);
    applyTheme(root.dataset.theme || preferredTheme());
  }

  applyTheme(preferredTheme());
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountToggle);
  } else {
    mountToggle();
  }
})();
