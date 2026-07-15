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

  const sunIcon = `
    <span class="theme-toggle__icon theme-toggle__icon--sun" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <circle cx="12" cy="12" r="4"></circle>
        <path d="M12 2v2.5M12 19.5V22M4.93 4.93 6.7 6.7M17.3 17.3l1.77 1.77M2 12h2.5M19.5 12H22M4.93 19.07 6.7 17.3M17.3 6.7l1.77-1.77"></path>
      </svg>
    </span>`;

  const moonIcon = `
    <span class="theme-toggle__icon theme-toggle__icon--moon" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M20.2 15.3A8.2 8.2 0 0 1 8.7 3.8 8.7 8.7 0 1 0 20.2 15.3Z"></path>
      </svg>
    </span>`;

  function mountToggleStyles() {
    if (document.getElementById("mc-theme-toggle-style")) return;
    const style = document.createElement("style");
    style.id = "mc-theme-toggle-style";
    style.textContent = `
      .theme-toggle {
        position: fixed !important;
        inset: max(14px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) auto auto !important;
        z-index: 2147483000 !important;
        width: 82px !important;
        min-width: 82px !important;
        height: 40px !important;
        min-height: 40px !important;
        padding: 3px !important;
        border: 1px solid rgba(184,149,106,0.34) !important;
        border-radius: 999px !important;
        background: rgba(8,8,8,0.72) !important;
        color: rgba(240,236,227,0.76) !important;
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        align-items: center !important;
        justify-items: center !important;
        box-shadow: 0 12px 30px rgba(0,0,0,0.22) !important;
        backdrop-filter: blur(16px) !important;
        -webkit-backdrop-filter: blur(16px) !important;
        cursor: pointer !important;
        overflow: hidden !important;
        letter-spacing: 0 !important;
        text-transform: none !important;
        line-height: 1 !important;
      }

      .theme-toggle-host {
        display: flex !important;
        align-items: center !important;
        justify-content: flex-end !important;
        gap: 10px !important;
        min-width: 0 !important;
      }

      .theme-toggle.theme-toggle--inline {
        position: relative !important;
        inset: auto !important;
        z-index: 2 !important;
        flex: 0 0 82px !important;
        margin: 0 !important;
      }

      .theme-toggle-dock {
        position: relative;
        z-index: 100;
        min-height: 60px;
        padding: max(10px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) 10px 14px;
        display: flex;
        align-items: center;
        justify-content: flex-end;
      }

      .theme-toggle::before {
        content: "";
        position: absolute;
        top: 3px;
        left: 3px;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        background: #b8956a;
        box-shadow: 0 8px 18px rgba(0,0,0,0.24);
        transform: translateX(0);
        transition: transform 0.24s ease, background 0.24s ease;
      }

      .theme-toggle[data-active-theme="dark"]::before {
        transform: translateX(38px);
      }

      .theme-toggle__icon {
        position: relative;
        z-index: 1;
        display: grid;
        place-items: center;
        width: 100%;
        height: 100%;
        color: rgba(240,236,227,0.62);
        transition: color 0.24s ease, opacity 0.24s ease;
      }

      .theme-toggle svg {
        width: 17px;
        height: 17px;
        display: block;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .theme-toggle[data-active-theme="light"] .theme-toggle__icon--sun,
      .theme-toggle[data-active-theme="dark"] .theme-toggle__icon--moon {
        color: #11100e;
      }

      .theme-toggle[data-active-theme="light"] .theme-toggle__icon--moon,
      .theme-toggle[data-active-theme="dark"] .theme-toggle__icon--sun {
        opacity: 0.62;
      }

      :root[data-theme="light"] .theme-toggle {
        background: rgba(218,206,188,0.86) !important;
        border-color: rgba(55,44,33,0.18) !important;
        color: rgba(33,26,19,0.64) !important;
        box-shadow: 0 12px 30px rgba(55,44,33,0.16) !important;
      }

      :root[data-theme="light"] .theme-toggle::before {
        background: #a98255;
      }

      :root[data-theme="light"] .theme-toggle__icon {
        color: rgba(33,26,19,0.62);
      }

      @media (max-width: 720px) {
        .theme-toggle {
          inset: max(10px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) auto auto !important;
          width: 76px !important;
          min-width: 76px !important;
          height: 38px !important;
          min-height: 38px !important;
          padding: 3px !important;
        }

        .theme-toggle.theme-toggle--inline {
          inset: auto !important;
          flex-basis: 76px !important;
        }

        .theme-toggle-host {
          gap: 8px !important;
          flex-wrap: wrap;
        }

        .theme-toggle::before {
          width: 32px;
          height: 32px;
        }

        .theme-toggle[data-active-theme="dark"]::before {
          transform: translateX(35px);
        }
      }
    `;
    document.head.appendChild(style);
  }

  function hydrateToggle(button) {
    if (!button) return;
    button.classList.add("theme-toggle");
    button.type = "button";
    button.dataset.themeToggle = "true";
    if (button.dataset.themeToggleReady !== "1") {
      button.innerHTML = `${sunIcon}${moonIcon}`;
      button.dataset.themeToggleReady = "1";
    }
    if (button.dataset.themeToggleBound !== "1") {
      button.addEventListener("click", () => {
        applyTheme(root.dataset.theme === "light" ? "dark" : "light");
      });
      button.dataset.themeToggleBound = "1";
    }
  }

  function makeHost(parent, className = "") {
    const host = document.createElement("div");
    host.className = `theme-toggle-host ${className}`.trim();
    parent.appendChild(host);
    return host;
  }

  function firstAvailable(selector) {
    return Array.from(document.querySelectorAll(selector))
      .find((element) => !element.closest("[hidden], .hidden"));
  }

  function placeToggle(button) {
    const previousDock = button.closest(".theme-toggle-dock");
    let host = firstAvailable(".top-actions, .quote-client-actions");

    if (!host) {
      const splitHeader = firstAvailable(".client-topbar, .client-top");
      if (splitHeader) {
        host = splitHeader.querySelector(":scope > .theme-toggle-host") || makeHost(splitHeader);
        Array.from(splitHeader.children)
          .filter((child, index) => index > 0 && child !== host)
          .forEach((child) => host.appendChild(child));
      }
    }

    if (!host) {
      const navbar = document.getElementById("navbar");
      if (navbar && !navbar.closest("[hidden], .hidden")) {
        host = navbar.querySelector(":scope > .theme-toggle-host") || makeHost(navbar, "theme-toggle-host--nav");
        [navbar.querySelector(":scope > .nav-cta"), navbar.querySelector(":scope > .nav-toggle")]
          .filter(Boolean)
          .forEach((element) => host.appendChild(element));
      }
    }

    if (!host) {
      const simpleTopbar = firstAvailable("body > .topbar");
      if (simpleTopbar) {
        host = simpleTopbar.querySelector(":scope > .theme-toggle-host") || makeHost(simpleTopbar);
        host.style.marginLeft = "auto";
      }
    }

    if (!host) {
      host = document.querySelector("body > .theme-toggle-dock");
      if (!host) {
        host = document.createElement("div");
        host.className = "theme-toggle-dock";
        document.body.insertBefore(host, document.body.firstChild);
      }
    }

    host.classList.add("theme-toggle-host");
    button.classList.add("theme-toggle--inline");
    if (button.parentElement !== host) host.appendChild(button);
    if (previousDock && previousDock !== host && !previousDock.children.length) previousDock.remove();
  }

  function applyTheme(theme) {
    root.dataset.theme = theme;
    saveTheme(theme);
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      hydrateToggle(button);
      button.dataset.activeTheme = theme;
      button.setAttribute("aria-label", theme === "light" ? "Ativar tema escuro" : "Ativar tema claro");
      button.setAttribute("title", theme === "light" ? "Ativar tema escuro" : "Ativar tema claro");
      button.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
    });
  }

  function mountToggle() {
    mountToggleStyles();
    let button = document.querySelector("[data-theme-toggle]");
    if (!button) {
      button = document.createElement("button");
    }
    hydrateToggle(button);
    placeToggle(button);
    applyTheme(root.dataset.theme || preferredTheme());

    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(() => placeToggle(button));
    });
    observer.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ["class", "hidden"],
    });
  }

  mountToggleStyles();
  applyTheme(preferredTheme());
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountToggle);
  } else {
    mountToggle();
  }
})();
