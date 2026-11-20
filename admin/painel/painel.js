// Painel "Visão do negócio": todos os números vêm de GET /private/dashboard.
const CONFIG = {
  workerUrl: "https://api.marcelconde.com.br",
  tokenKey: "mc_admin_token",
};

const $ = (selector) => document.querySelector(selector);
const main = document.querySelector("main.dash");
const refreshBtn = $("#refreshBtn");
const toastEl = $("#toast");
const tooltip = $("#chartTooltip");

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const moneyShort = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_FULL = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function getToken() {
  try { return sessionStorage.getItem(CONFIG.tokenKey) || ""; } catch { return ""; }
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toastEl.classList.remove("show"), 3600);
}

async function getJson(path) {
  const token = getToken();
  if (!token) {
    location.href = "/admin/";
    throw new Error("Faça login.");
  }
  const res = await fetch(CONFIG.workerUrl + path, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    location.href = "/admin/";
    throw new Error("Faça login novamente.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

const brl = (cents) => money.format(Number(cents || 0) / 100);
const brlShort = (cents) => moneyShort.format(Number(cents || 0) / 100);
const monthName = (key, full = false) => {
  const [year, month] = String(key).split("-").map(Number);
  if (!full) return MONTHS[month - 1];
  const name = MONTHS_FULL[month - 1];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${year}`;
};

function axisMoney(cents) {
  const value = Number(cents || 0) / 100;
  return value >= 1000 ? `R$ ${compact.format(value)}` : moneyShort.format(value);
}

// Recife é UTC-3 o ano todo.
function recifeNow() {
  return new Date(Date.now() - 3 * 3600000);
}

function renderHeader(user, dashboard) {
  const hour = recifeNow().getUTCHours();
  const hello = hour < 5 ? "Boa noite" : hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const name = String(user?.name || "").trim().split(/\s+/)[0];
  $("#dashGreeting").textContent = name && !name.includes("@") ? `${hello}, ${name}` : hello;
  const today = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Recife" }).format(new Date());
  const updated = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Recife" }).format(new Date(dashboard.generatedAt));
  $("#dashSubtitle").textContent = `${today.charAt(0).toUpperCase()}${today.slice(1)} · atualizado às ${updated}`;
}

function renderKpis(dashboard) {
  const { money: m, funnel } = dashboard;
  $("#kpiReceived").textContent = brl(m.receivedMonthCents);
  $("#kpiReceivedNote").textContent = `${brl(m.receivedYearCents)} em ${dashboard.year}${m.extrasYearCents ? ` · ${brl(m.extrasYearCents)} de fotos extras` : ""}`;
  $("#kpiContracted").textContent = brl(m.contractedMonthCents);
  $("#kpiContractedNote").textContent = `${brl(m.contractedYearCents)} em ${dashboard.year}${m.averageTicketCents ? ` · ticket médio ${brlShort(m.averageTicketCents)}` : ""}`;
  $("#kpiToReceive").textContent = brl(m.toReceiveCents);
  const balances = dashboard.balances.length;
  $("#kpiToReceiveNote").textContent = balances
    ? `${balances === 1 ? "1 contrato" : `${balances} contratos`} com entrada paga`
    : "Nenhum saldo de entrada pendente";
  $("#kpiConversion").textContent = funnel.sent ? `${funnel.conversionPercent}%` : "—";
  $("#kpiConversionNote").textContent = funnel.sent
    ? `${funnel.accepted} de ${funnel.sent} em 12 meses · ${brl(m.openPipelineCents)} aguardando resposta`
    : "Nenhum orçamento enviado em 12 meses";
}

const TONES = {
  danger: { label: "Urgente", icon: "!" },
  warning: { label: "Atenção", icon: "•" },
  info: { label: "A fazer", icon: "→" },
};

function renderActions(dashboard) {
  const list = $("#actionsList");
  const total = dashboard.actionsTotal;
  $("#actionsCount").textContent = total ? String(total) : "";
  if (!dashboard.actions.length) {
    list.innerHTML = `<li class="dash-empty"><strong>Tudo em dia.</strong><span>Nenhum orçamento esperando resposta nem galeria atrasada.</span></li>`;
    return;
  }
  list.innerHTML = dashboard.actions.map((action) => {
    const tone = TONES[action.tone] || TONES.info;
    return `
      <li>
        <a class="dash-action dash-action--${escapeHtml(action.tone)}" href="${escapeHtml(action.href)}">
          <span class="dash-action-icon" aria-hidden="true">${tone.icon}</span>
          <span class="dash-action-body">
            <span class="dash-action-tone">${tone.label}</span>
            <strong>${escapeHtml(action.title)}</strong>
            ${action.detail ? `<small>${escapeHtml(action.detail)}</small>` : ""}
          </span>
          <span class="dash-action-go" aria-hidden="true">›</span>
        </a>
      </li>`;
  }).join("") + (total > dashboard.actions.length
    ? `<li class="dash-more">e mais ${total - dashboard.actions.length} de menor prioridade</li>` : "");
}

function renderAgenda(dashboard) {
  const list = $("#agendaList");
  if (!dashboard.agenda.length) {
    list.innerHTML = `<li class="dash-empty"><span>Nenhuma sessão marcada. A data do serviço vem dos orçamentos aceitos.</span></li>`;
    return;
  }
  list.innerHTML = dashboard.agenda.map((item) => {
    const [, month, day] = item.date.split("-").map(Number);
    const when = item.daysUntil === 0 ? "Hoje" : item.daysUntil === 1 ? "Amanhã" : `Em ${item.daysUntil} dias`;
    return `
      <li>
        <a class="dash-event" href="${escapeHtml(item.href)}">
          <span class="dash-date" aria-hidden="true"><b>${day}</b><small>${MONTHS[month - 1]}</small></span>
          <span class="dash-event-body">
            <strong>${escapeHtml(item.title)}</strong>
            <small>${escapeHtml([item.client, item.location].filter(Boolean).join(" · "))}</small>
          </span>
          <span class="dash-event-meta">
            <span class="${item.daysUntil <= 2 ? "dash-soon" : ""}">${when}</span>
            ${item.balanceCents ? `<small>saldo ${brlShort(item.balanceCents)}</small>` : ""}
          </span>
        </a>
      </li>`;
  }).join("");
}

const STAGES = {
  editing: ["Em edição", "pending"],
  late: ["Atrasada", "danger"],
  selection: ["Cliente escolhendo", "neutral"],
  preparing: ["Preparando", "neutral"],
};

function thumb(url) {
  return url && url.includes("/image/upload/")
    ? url.replace("/image/upload/", "/image/upload/c_fill,g_auto,w_120,h_120,q_auto,f_auto/")
    : url;
}

function renderPipeline(dashboard) {
  const g = dashboard.galleries;
  const alertDays = dashboard.settings.deliveryAlertDays;
  const avg = g.averageDeliveryDays === null ? "" : ` · entrega média em ${String(g.averageDeliveryDays).replace(".", ",")} dias`;
  $("#pipelineSummary").innerHTML = `
    <span><b>${g.editing}</b> em edição</span>
    <span><b>${g.selection}</b> com o cliente</span>
    ${g.preparing ? `<span><b>${g.preparing}</b> preparando</span>` : ""}
    <span class="dash-muted">${g.deliveredYear} ${g.deliveredYear === 1 ? "entregue" : "entregues"} em 12 meses${avg}</span>`;
  const list = $("#pipelineList");
  if (!g.items.length) {
    list.innerHTML = `<li class="dash-empty"><span>Nenhuma galeria em andamento.</span></li>`;
    return;
  }
  list.innerHTML = g.items.slice(0, 8).map((item) => {
    const [label, tone] = STAGES[item.late ? "late" : item.stage];
    const progress = item.stage === "editing" ? Math.min(100, Math.round((item.days / alertDays) * 100)) : 0;
    const detail = item.stage === "editing"
      ? (item.late ? `${item.days} dias em edição · prazo de ${alertDays}` : `${item.days} de ${alertDays} dias`)
      : item.stage === "selection"
        ? `publicada há ${item.days} ${item.days === 1 ? "dia" : "dias"}${item.opened ? "" : " · ainda não abriu"}`
        : `criada há ${item.days} ${item.days === 1 ? "dia" : "dias"}`;
    const cover = thumb(item.coverUrl);
    return `
      <li>
        <a class="dash-gallery" href="${escapeHtml(item.href)}">
          <span class="dash-gallery-cover">${cover ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async">` : ""}</span>
          <span class="dash-gallery-body">
            <span class="dash-gallery-top">
              <strong>${escapeHtml(item.client)}</strong>
              <span class="status-badge ${tone}">${label}</span>
            </span>
            <small>${escapeHtml(item.title)}${item.deliveryEstimate ? ` · combinado: ${escapeHtml(item.deliveryEstimate)}` : ""}</small>
            ${item.stage === "editing" ? `<span class="dash-progress${item.late ? " is-late" : ""}" role="img" aria-label="${progress}% do prazo"><i style="width:${progress}%"></i></span>` : ""}
            <small class="dash-muted">${escapeHtml(detail)}</small>
          </span>
        </a>
      </li>`;
  }).join("");
}

function niceMax(value) {
  if (value <= 0) return 100000;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 2, 2.5, 5, 10];
  return steps.map((step) => step * magnitude).find((candidate) => candidate >= value) || value;
}

function renderChart(dashboard) {
  const chart = $("#revenueChart");
  const months = dashboard.monthly;
  const totalContracted = months.reduce((sum, item) => sum + item.contractedCents, 0);
  const totalReceived = months.reduce((sum, item) => sum + item.receivedCents, 0);
  $("#chartSummary").textContent = `${brl(totalContracted)} fechados e ${brl(totalReceived)} recebidos pelo site em 12 meses`;
  $("#revenueTable").innerHTML = `
    <thead><tr><th scope="col">Mês</th><th scope="col">Fechado</th><th scope="col">Recebido pelo site</th></tr></thead>
    <tbody>${months.map((item) => `<tr><th scope="row">${monthName(item.month, true)}</th><td>${brl(item.contractedCents)}</td><td>${brl(item.receivedCents)}</td></tr>`).join("")}</tbody>`;

  if (!totalContracted && !totalReceived) {
    chart.innerHTML = `<div class="dash-empty dash-chart-empty"><span>Ainda não há orçamentos aceitos nem pagamentos nos últimos 12 meses.</span></div>`;
    return;
  }
  const max = niceMax(Math.max(...months.map((item) => Math.max(item.contractedCents, item.receivedCents))));
  const ticks = [max, max / 2, 0];
  chart.innerHTML = `
    <div class="dash-chart-axis" aria-hidden="true">${ticks.map((tick) => `<span>${axisMoney(tick)}</span>`).join("")}</div>
    <div class="dash-chart-plot">
      <div class="dash-chart-grid" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="dash-chart-bars">
        ${months.map((item, index) => `
          <div class="dash-chart-col${index === months.length - 1 ? " is-current" : ""}" data-index="${index}" tabindex="0"
            aria-label="${monthName(item.month, true)}: fechado ${brl(item.contractedCents)}, recebido ${brl(item.receivedCents)}">
            <div class="dash-chart-pair">
              <i class="dash-bar dash-bar--contracted" style="height:${(item.contractedCents / max) * 100}%"></i>
              <i class="dash-bar dash-bar--received" style="height:${(item.receivedCents / max) * 100}%"></i>
            </div>
            <span class="dash-chart-label">${monthName(item.month)}</span>
          </div>`).join("")}
      </div>
    </div>`;

  const show = (col) => {
    const item = months[Number(col.dataset.index)];
    tooltip.innerHTML = `
      <strong>${monthName(item.month, true)}</strong>
      <span><i class="dash-swatch dash-swatch--contracted"></i>Fechado <b>${brl(item.contractedCents)}</b></span>
      <span><i class="dash-swatch dash-swatch--received"></i>Recebido <b>${brl(item.receivedCents)}</b></span>`;
    tooltip.hidden = false;
    const rect = col.getBoundingClientRect();
    const tip = tooltip.getBoundingClientRect();
    const left = Math.min(window.innerWidth - tip.width - 8, Math.max(8, rect.left + rect.width / 2 - tip.width / 2));
    const top = Math.max(8, rect.top - tip.height - 8);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    chart.querySelectorAll(".dash-chart-col").forEach((el) => el.classList.toggle("is-hover", el === col));
  };
  const hide = () => {
    tooltip.hidden = true;
    chart.querySelectorAll(".dash-chart-col.is-hover").forEach((el) => el.classList.remove("is-hover"));
  };
  chart.querySelectorAll(".dash-chart-col").forEach((col) => {
    col.addEventListener("mouseenter", () => show(col));
    col.addEventListener("focus", () => show(col));
    col.addEventListener("click", () => show(col));
    col.addEventListener("mouseleave", hide);
    col.addEventListener("blur", hide);
  });
}

function renderFunnel(dashboard) {
  const f = dashboard.funnel;
  const steps = [
    ["Enviados", f.sent],
    ["Abertos pelo cliente", f.viewed],
    ["Aceitos", f.accepted],
    ["Pagos pelo site", f.paid],
  ];
  const max = Math.max(1, f.sent);
  $("#funnel").innerHTML = steps.map(([label, value], index) => {
    const previous = index ? steps[index - 1][1] : 0;
    const rate = index && previous ? `${Math.round((value / previous) * 100)}%` : "";
    return `
      <div class="dash-funnel-row">
        <span class="dash-funnel-label">${label}</span>
        <span class="dash-funnel-track"><i style="width:${(value / max) * 100}%"></i></span>
        <span class="dash-funnel-value"><b>${value}</b>${rate ? `<small>${rate}</small>` : ""}</span>
      </div>`;
  }).join("");
  const days = f.averageDaysToAccept;
  $("#funnelFoot").textContent = !f.sent ? ""
    : days === null ? "Nenhum aceite ainda neste período."
      : days < 1 ? "Do envio ao aceite, o cliente leva em média menos de 1 dia."
        : `Do envio ao aceite, o cliente leva em média ${String(days).replace(".", ",")} ${days === 1 ? "dia" : "dias"}.`;
}

function renderLikes(dashboard) {
  const likes = dashboard.likes;
  $("#likesSummary").textContent = likes.total
    ? `${likes.total} ${likes.total === 1 ? "curtida" : "curtidas"} em ${likes.photos} ${likes.photos === 1 ? "foto" : "fotos"}. Boas candidatas para anúncios e para a capa.`
    : "";
  const grid = $("#likesGrid");
  if (!likes.top.length) {
    grid.innerHTML = `<div class="dash-empty"><span>Nenhuma curtida ainda.</span></div>`;
    return;
  }
  grid.innerHTML = likes.top.slice(0, 6).map((item) => `
    <figure class="dash-like">
      ${item.thumbUrl ? `<img src="${escapeHtml(item.thumbUrl)}" alt="Foto do álbum ${escapeHtml(item.albumName)}" loading="lazy" decoding="async">` : ""}
      <figcaption><span>${escapeHtml(item.albumName)}</span><b>♥ ${item.likes}</b></figcaption>
    </figure>`).join("");
}

async function load() {
  load.lastAt = Date.now();
  refreshBtn.disabled = true;
  main.setAttribute("aria-busy", "true");
  try {
    const [me, data] = await Promise.all([getJson("/auth/me"), getJson("/private/dashboard")]);
    const label = document.getElementById("currentUserLabel");
    if (label) label.textContent = me.user?.email || "";
    const dashboard = data.dashboard;
    renderHeader(me.user, dashboard);
    renderKpis(dashboard);
    renderActions(dashboard);
    renderAgenda(dashboard);
    renderPipeline(dashboard);
    renderChart(dashboard);
    renderFunnel(dashboard);
    renderLikes(dashboard);
    main.classList.add("is-ready");
  } catch (err) {
    const message = err instanceof TypeError
      ? "Sem conexão com a internet. Os números aparecem quando ela voltar."
      : err.message || "Não consegui carregar o painel.";
    $("#dashSubtitle").textContent = message;
    showToast(message);
  } finally {
    refreshBtn.disabled = false;
    main.setAttribute("aria-busy", "false");
  }
}

refreshBtn.addEventListener("click", load);
window.addEventListener("online", load);
window.addEventListener("scroll", () => { tooltip.hidden = true; }, { passive: true });
document.addEventListener("visibilitychange", () => {
  // Voltando ao painel depois de um tempo (ex.: app no celular), os números se atualizam.
  if (document.visibilityState === "visible" && Date.now() - (load.lastAt || 0) > 5 * 60000) load();
});
load();
