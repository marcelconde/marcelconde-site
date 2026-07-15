const CONFIG = {
  workerUrl: "https://api.marcelconde.com.br",
  tokenKey: "mc_admin_token",
};

const state = {
  quotes: [],
  clients: [],
  status: "all",
  search: "",
};

const $ = (selector) => document.querySelector(selector);
const currentUserLabel = $("#currentUserLabel");
const statQuotes = $("#statQuotes");
const statPending = $("#statPending");
const statAccepted = $("#statAccepted");
const quoteList = $("#quoteList");
const quoteSearch = $("#quoteSearch");
const quoteFilters = $("#quoteFilters");
const refreshBtn = $("#refreshBtn");
const toastEl = $("#toast");

function getToken() {
  return sessionStorage.getItem(CONFIG.tokenKey) || "";
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeSearch(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function formatMoney(cents = 0) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents || 0) / 100);
}

function formatDate(value) {
  if (!value) return "Sem validade";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function statusMeta(status) {
  const values = {
    draft: ["Rascunho", "neutral"],
    published: ["Enviado", "pending"],
    viewed: ["Visualizado", "pending"],
    accepted: ["Aceito", "success"],
    expired: ["Expirado", "danger"],
    cancelled: ["Cancelado", "danger"],
  };
  return values[status] || values.draft;
}

function clientFor(quote) {
  return state.clients.find((client) => client.id === quote.clientId) || null;
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toastEl.classList.remove("show"), 3200);
}

async function workerFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("X-Admin-Token", token);
  }
  const res = await fetch(CONFIG.workerUrl + path, { ...options, headers, cache: "no-store" });
  if (res.status === 401) location.href = "/admin/";
  return res;
}

async function getJson(path) {
  const res = await workerFetch(path);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

function filteredQuotes() {
  const search = normalizeSearch(state.search);
  return state.quotes.filter((quote) => {
    const client = clientFor(quote);
    const pending = ["published", "viewed", "expired"].includes(quote.status);
    const statusMatch = state.status === "all"
      || quote.status === state.status
      || (state.status === "pending" && pending);
    const haystack = normalizeSearch(`${quote.number} ${quote.title} ${client?.name || ""} ${client?.email || ""}`);
    return statusMatch && (!search || haystack.includes(search));
  });
}

function renderQuotes() {
  statQuotes.textContent = state.quotes.length;
  statPending.textContent = state.quotes.filter((quote) => ["published", "viewed"].includes(quote.status)).length;
  statAccepted.textContent = state.quotes.filter((quote) => quote.status === "accepted").length;
  const quotes = filteredQuotes();

  if (!quotes.length) {
    quoteList.innerHTML = `
      <div class="empty-state quote-empty">
        <strong>Nenhum orçamento encontrado.</strong>
        <span>Crie uma proposta ou ajuste os filtros.</span>
      </div>`;
    return;
  }

  quoteList.innerHTML = quotes.map((quote) => {
    const client = clientFor(quote);
    const [label, tone] = statusMeta(quote.status);
    return `
      <a class="quote-card" href="/admin/orcamentos/detalhe/?id=${encodeURIComponent(quote.id)}">
        <span class="quote-card-top">
          <span class="quote-number">${escapeHtml(quote.number || "Orçamento")}</span>
          <span class="status-badge ${tone}">${escapeHtml(label)}</span>
        </span>
        <span class="quote-card-main">
          <strong>${escapeHtml(quote.title || "Serviço fotográfico")}</strong>
          <small>${escapeHtml(client?.name || "Cliente não vinculado")}</small>
        </span>
        <span class="quote-card-footer">
          <strong>${escapeHtml(formatMoney(quote.totalCents))}</strong>
          <small>${quote.status === "accepted" ? `Aceito em ${escapeHtml(formatDate(quote.acceptedAt))}` : `Válido até ${escapeHtml(formatDate(quote.validUntil))}`}</small>
        </span>
      </a>`;
  }).join("");
}

async function loadData() {
  refreshBtn.disabled = true;
  try {
    const [me, data] = await Promise.all([getJson("/auth/me"), getJson("/private/quotes")]);
    currentUserLabel.textContent = me.user?.email || "";
    state.quotes = data.quotes || [];
    state.clients = data.clients || [];
    renderQuotes();
  } catch (err) {
    showToast(err.message || "Erro ao carregar orçamentos.");
  } finally {
    refreshBtn.disabled = false;
  }
}

quoteSearch.addEventListener("input", () => {
  state.search = quoteSearch.value;
  renderQuotes();
});

quoteFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-status]");
  if (!button) return;
  state.status = button.dataset.status;
  quoteFilters.querySelectorAll("[data-status]").forEach((item) => item.classList.toggle("active", item === button));
  renderQuotes();
});

refreshBtn.addEventListener("click", loadData);
loadData();
