// App instalável (sem lojas): registra o service worker da área e, nas páginas
// com <body data-install-prompt>, convida a instalar. Android/Chrome/Edge usam o
// pedido do próprio navegador; no iPhone/iPad mostramos o caminho pelo Compartilhar.
(function () {
  const path = location.pathname;
  const area = path.startsWith("/admin/") ? "admin" : path.startsWith("/clientes/") ? "clientes" : "";
  if (!area) return;

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/app-sw.js", { scope: `/${area}/` }).catch(() => {});
    });
  }

  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (standalone) {
    document.documentElement.classList.add("is-installed-app");
    return;
  }

  const DISMISS_KEY = `mc_install_dismissed_${area}`;
  const dismissedRecently = () => {
    try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < 30 * 86400000; } catch { return false; }
  };
  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const copy = area === "admin"
    ? { title: "Instale o painel no celular", text: "Abra a Visão geral, orçamentos e galerias direto da tela inicial, como um app." }
    : { title: "Instale o app Marcel Conde", text: "Seus orçamentos e galerias direto da tela inicial, sem baixar nada da loja." };
  let deferredPrompt = null;

  function injectStyles() {
    if (document.getElementById("mcInstallStyles")) return;
    const style = document.createElement("style");
    style.id = "mcInstallStyles";
    style.textContent = `
      .mc-install{position:fixed;z-index:80;left:50%;bottom:max(16px,env(safe-area-inset-bottom));transform:translateX(-50%);
        display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;width:min(440px,calc(100vw - 32px));
        padding:14px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:#161718;color:#ecebe7;
        box-shadow:0 12px 40px rgba(0,0,0,.45);font:14px/1.4 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;
        animation:mcInstallIn .28s ease-out}
      .mc-install img{width:44px;height:44px;border-radius:11px}
      .mc-install strong{display:block;font-size:14.5px;font-weight:650}
      .mc-install p{margin:2px 0 0;color:#a9a8a3;font-size:12.5px}
      .mc-install-actions{display:grid;gap:6px;justify-items:end}
      .mc-install button{border:0;border-radius:8px;font:inherit;font-weight:700;cursor:pointer}
      .mc-install-go{padding:9px 14px;background:#c8aa80;color:#1b1710}
      .mc-install-close{padding:2px 4px;background:none;color:#8f8e89;font-size:12px!important;font-weight:500!important}
      .mc-install button:focus-visible{outline:3px solid rgba(200,170,128,.5);outline-offset:2px}
      .mc-install-ios{grid-column:1/-1;margin:0;padding:10px 12px;border-radius:10px;background:#1d1e20;color:#c9c7c1;font-size:13px}
      .mc-install-ios svg{width:16px;height:16px;vertical-align:-3px;margin:0 2px;fill:none;stroke:#c8aa80;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
      @keyframes mcInstallIn{from{opacity:0;transform:translate(-50%,12px)}to{opacity:1;transform:translate(-50%,0)}}
      @media (prefers-reduced-motion:reduce){.mc-install{animation:none}}`;
    document.head.appendChild(style);
  }

  function close(remember) {
    document.getElementById("mcInstall")?.remove();
    if (remember) {
      try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    }
  }

  function show() {
    if (document.getElementById("mcInstall") || !document.body?.hasAttribute("data-install-prompt") || dismissedRecently()) return;
    injectStyles();
    const icon = area === "admin" ? "/images/admin-icon-192.png" : "/images/app-icon-192.png";
    const box = document.createElement("aside");
    box.id = "mcInstall";
    box.className = "mc-install";
    box.setAttribute("aria-label", copy.title);
    const shareIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M5 11v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9"/></svg>';
    box.innerHTML = `
      <img src="${icon}" alt="">
      <div><strong>${copy.title}</strong><p>${copy.text}</p></div>
      <div class="mc-install-actions">
        ${deferredPrompt ? '<button type="button" class="mc-install-go">Instalar</button>' : ""}
        <button type="button" class="mc-install-close">Agora não</button>
      </div>
      ${isIos ? `<p class="mc-install-ios">Toque em ${shareIcon}<b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.</p>` : ""}`;
    document.body.appendChild(box);
    box.querySelector(".mc-install-close").addEventListener("click", () => close(true));
    box.querySelector(".mc-install-go")?.addEventListener("click", async () => {
      const prompt = deferredPrompt;
      deferredPrompt = null;
      close(false);
      if (!prompt) return;
      prompt.prompt();
      const choice = await prompt.userChoice.catch(() => null);
      if (choice?.outcome !== "accepted") {
        try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
      }
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    close(false);
    setTimeout(show, 1500);
  });
  window.addEventListener("appinstalled", () => close(true));

  // No iPhone/iPad não existe pedido do navegador: o convite aparece com as instruções.
  if (isIos) window.addEventListener("load", () => setTimeout(show, 2500));
})();
