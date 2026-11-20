// Navegação única do admin. Cada página tem <aside id="appSidebar" data-active="...">
// e carrega este script logo depois dele, antes dos scripts da página: assim
// #currentUserLabel e #logoutBtn já existem quando a página procura por eles.
(function () {
  const sidebar = document.getElementById("appSidebar");
  if (!sidebar) return;

  const WORKER_URL = "https://api.marcelconde.com.br";
  const TOKEN_KEY = "mc_admin_token";
  const active = sidebar.dataset.active || "";
  // Só /admin/ tem data-active="portfolio": lá Portfólio, Curtidas, Usuários e Auditoria são seções da própria página.
  const onPortfolioPage = active === "portfolio";

  const icon = (path) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;
  const ICONS = {
    clientes: icon('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.8a3.3 3.3 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.4 3.5 5.2"/>'),
    orcamentos: icon('<path d="M6 2.8h8.5L19 7.3V21H6z"/><path d="M14 3v5h5M9 12.5h6M9 16.5h6"/>'),
    galerias: icon('<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="9.5" r="1.8"/><path d="m3.5 18 5.2-5 3.8 3.5 3-2.6 5 4.4"/>'),
    portfolio: icon('<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>'),
    curtidas: icon('<path d="M12 20s-7.5-4.4-7.5-10.1A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.5C19.5 15.6 12 20 12 20z"/>'),
    avaliacoes: icon('<path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.2 6.1-.8z"/>'),
    configuracoes: icon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    usuarios: icon('<path d="M12 3 4.5 6v5.5c0 4.6 3.1 8 7.5 9.5 4.4-1.5 7.5-4.9 7.5-9.5V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>'),
    auditoria: icon('<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".9"/><circle cx="4" cy="12" r=".9"/><circle cx="4" cy="18" r=".9"/>'),
    site: icon('<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
    sair: icon('<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>'),
    menu: icon('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    fechar: icon('<path d="M6 6l12 12M18 6 6 18"/>'),
    recolher: icon('<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16M15.5 9.5 13 12l2.5 2.5"/>'),
  };

  // view: seção dentro de /admin/ (trocada pelo admin.js); hash: endereço dela vindo de outra página.
  const GROUPS = [
    { label: "Trabalhos", items: [
      { key: "clientes", label: "Clientes", href: "/admin/clientes/" },
      { key: "orcamentos", label: "Orçamentos", href: "/admin/orcamentos/" },
      { key: "galerias", label: "Galerias", href: "/admin/galerias/" },
    ] },
    { label: "Site", items: [
      { key: "portfolio", label: "Portfólio", view: "albumsView", hash: "" },
      { key: "curtidas", label: "Curtidas", view: "likesView", hash: "curtidas" },
      { key: "avaliacoes", label: "Avaliações", href: "/admin/avaliacoes/" },
    ] },
    { label: "Sistema", items: [
      { key: "configuracoes", label: "Configurações", href: "/admin/configuracoes/" },
      { key: "usuarios", label: "Usuários", view: "usersView", hash: "usuarios", adminOnly: true },
      { key: "auditoria", label: "Auditoria", view: "auditView", hash: "auditoria", adminOnly: true },
    ] },
  ];

  function itemHtml(item) {
    const isActive = item.key === active;
    const attrs = [
      `class="app-nav-item tab${isActive ? " active" : ""}${item.adminOnly ? " hidden" : ""}"`,
      isActive ? 'aria-current="page"' : "",
      `title="${item.label}"`,
      item.adminOnly ? 'data-admin-only="true"' : "",
    ];
    const content = `${ICONS[item.key] || ""}<span>${item.label}</span>`;
    if (item.view && onPortfolioPage) {
      return `<button type="button" data-view="${item.view}" data-hash="${item.hash}" ${attrs.join(" ")}>${content}</button>`;
    }
    const href = item.href || `/admin/${item.hash ? `#${item.hash}` : ""}`;
    return `<a href="${href}" ${attrs.join(" ")}>${content}</a>`;
  }

  sidebar.classList.add("app-sidebar");
  sidebar.innerHTML = `
    <div class="app-mobilebar">
      <button class="app-menu-btn" type="button" aria-controls="appNavPanel" aria-expanded="false" aria-label="Abrir menu">${ICONS.menu}</button>
      <a class="app-brand app-brand--compact" href="/admin/"><span class="app-brand-mark">MC</span><strong>Admin</strong></a>
    </div>
    <div class="app-nav-backdrop" data-close-nav></div>
    <div class="app-nav-panel" id="appNavPanel">
      <div class="app-nav-head">
        <a class="app-brand" href="/admin/" aria-label="Admin Marcel Conde — início">
          <span class="app-brand-mark">MC</span>
          <span><strong>Marcel Conde</strong><small>Painel do estúdio</small></span>
        </a>
        <button class="app-menu-close" type="button" data-close-nav aria-label="Fechar menu">${ICONS.fechar}</button>
      </div>
      <nav class="app-nav tabs" aria-label="Seções do admin">
        ${GROUPS.map((group) => `
          <div class="app-nav-group">
            <span class="app-nav-label">${group.label}</span>
            ${group.items.map(itemHtml).join("")}
          </div>`).join("")}
      </nav>
      <div class="app-nav-foot">
        <button class="app-nav-item app-nav-item--muted app-collapse-btn" type="button" aria-pressed="false" title="Recolher menu (Ctrl+B)">${ICONS.recolher}<span>Recolher menu</span></button>
        <a class="app-nav-item app-nav-item--muted" href="/" target="_blank" rel="noopener" title="Ver site">${ICONS.site}<span>Ver site</span></a>
        <div class="app-user top-actions">
          <span class="user-pill" id="currentUserLabel"></span>
        </div>
        <button class="app-nav-item app-nav-item--muted" id="logoutBtn" type="button" title="Sair">${ICONS.sair}<span>Sair</span></button>
      </div>
    </div>`;

  // Menu recolhido (só ícones) no computador: preferência deste navegador.
  const COLLAPSE_KEY = "mc_admin_nav_collapsed";
  const collapseBtn = sidebar.querySelector(".app-collapse-btn");
  function setCollapsed(collapsed, save) {
    document.documentElement.classList.toggle("app-nav-collapsed", collapsed);
    collapseBtn.setAttribute("aria-pressed", String(collapsed));
    const label = collapsed ? "Expandir menu" : "Recolher menu";
    collapseBtn.querySelector("span").textContent = label;
    collapseBtn.title = `${label} (Ctrl+B)`;
    if (save) {
      try { localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0"); } catch {}
    }
  }
  let savedCollapsed = false;
  try { savedCollapsed = localStorage.getItem(COLLAPSE_KEY) === "1"; } catch {}
  setCollapsed(savedCollapsed, false);
  collapseBtn.addEventListener("click", () => {
    setCollapsed(!document.documentElement.classList.contains("app-nav-collapsed"), true);
  });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "b") {
      if (window.matchMedia("(max-width: 960px)").matches) return;
      event.preventDefault();
      setCollapsed(!document.documentElement.classList.contains("app-nav-collapsed"), true);
    }
  });

  const menuBtn = sidebar.querySelector(".app-menu-btn");
  function setNav(open) {
    document.body.classList.toggle("app-nav-open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    if (open) sidebar.querySelector(".app-nav-item")?.focus();
  }
  menuBtn.addEventListener("click", () => setNav(true));
  sidebar.querySelectorAll("[data-close-nav]").forEach((el) => el.addEventListener("click", () => setNav(false)));
  sidebar.querySelectorAll(".app-nav-item").forEach((el) => el.addEventListener("click", () => setNav(false)));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("app-nav-open")) {
      setNav(false);
      menuBtn.focus();
    }
  });

  // O menu de seções das telas de detalhe gruda logo abaixo do cabeçalho fixo, cuja altura varia.
  document.addEventListener("DOMContentLoaded", () => {
    const topbar = document.querySelector(".detail-topbar");
    if (!topbar || !("ResizeObserver" in window)) return;
    new ResizeObserver(() => {
      document.documentElement.style.setProperty("--detail-top", `${Math.ceil(topbar.offsetHeight) + 16}px`);
    }).observe(topbar);
  });

  // Menus "Mais": fecham ao escolher uma ação, ao clicar fora ou com Esc.
  document.addEventListener("click", (event) => {
    document.querySelectorAll("details.action-menu[open]").forEach((menu) => {
      if (!menu.contains(event.target) || event.target.closest(".action-menu-list .btn")) menu.open = false;
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.querySelectorAll("details.action-menu[open]").forEach((menu) => {
      menu.open = false;
      menu.querySelector("summary")?.focus();
    });
  });

  if (onPortfolioPage) {
    // admin.js troca a seção; aqui só mantemos o endereço, para recarregar na mesma seção.
    sidebar.querySelectorAll("button[data-view]").forEach((button) => {
      button.addEventListener("click", () => {
        const hash = button.dataset.hash ? `#${button.dataset.hash}` : "";
        history.replaceState(null, "", `${location.pathname}${location.search}${hash}`);
      });
    });
    return; // admin.js cuida de login, sair e permissões nesta página.
  }

  const token = () => {
    try { return sessionStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
  };

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    const current = token();
    if (current) {
      await fetch(`${WORKER_URL}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${current}` },
      }).catch(() => {});
    }
    try { sessionStorage.removeItem(TOKEN_KEY); } catch {}
    location.href = "/admin/";
  });

  if (token()) {
    fetch(`${WORKER_URL}/auth/me`, { headers: { Authorization: `Bearer ${token()}` }, cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user?.role !== "admin") return;
        sidebar.querySelectorAll('[data-admin-only="true"]').forEach((el) => el.classList.remove("hidden"));
      })
      .catch(() => {});
  }
})();
