// Cloudflare Turnstile ("não sou um robô") for the admin and client logins.
// The Worker asks for it after a wrong password; the widget loads only then.
(function () {
  // Public site key of the Turnstile widget. Empty disables the captcha step.
  const SITE_KEY = "0x4AAAAAAFOZWerlzFPtCXej";
  let script = null;
  let widgetId = null;
  let box = null;
  let token = "";

  function loadScript() {
    if (!script) {
      script = new Promise((resolve, reject) => {
        const element = document.createElement("script");
        element.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        element.async = true;
        element.onload = resolve;
        element.onerror = () => {
          script = null;
          reject(new Error("Não foi possível carregar a verificação de segurança."));
        };
        document.head.appendChild(element);
      });
    }
    return script;
  }

  // Shows the challenge, or asks for a fresh one: each token is valid for a single attempt.
  async function show(container) {
    if (!SITE_KEY || !container) return;
    box = container;
    container.hidden = false;
    token = "";
    await loadScript();
    if (widgetId !== null) {
      window.turnstile.reset(widgetId);
      return;
    }
    widgetId = window.turnstile.render(container, {
      sitekey: SITE_KEY,
      language: "pt-BR",
      theme: document.documentElement.dataset.theme === "light" ? "light" : "dark",
      callback: (value) => { token = value; },
      "expired-callback": () => { token = ""; },
      "error-callback": () => { token = ""; },
    });
  }

  window.loginCaptcha = {
    show,
    token: () => token,
    // True while a visible challenge has not been solved yet.
    pending: () => widgetId !== null && !box.hidden && !token,
    hide: () => { if (box) box.hidden = true; },
  };
})();
