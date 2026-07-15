const CONFIG = {
  workerUrl: "https://api.marcelconde.com.br",
  tokenKey: "mc_client_token",
};

const clientLabel = document.getElementById("clientLabel");
const quoteSection = document.getElementById("quoteSection");
const quoteList = document.getElementById("quoteList");
const galleryList = document.getElementById("galleryList");
const logoutBtn = document.getElementById("logoutBtn");

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cloudUrl(src, transform) {
  if (!src || !src.includes("/upload/")) return src;
  return src.replace(/\/upload\/(?:[a-z]+_[^,/]+(?:,[a-z]+_[^,/]+)*\/)?/, `/upload/${transform}/`);
}

function getToken() {
  return localStorage.getItem(CONFIG.tokenKey) || "";
}

function requireToken() {
  const token = getToken();
  if (!token) {
    location.href = "/clientes/login/";
    return "";
  }
  return token;
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = requireToken();
  if (!token) throw new Error("Unauthorized");
  headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(CONFIG.workerUrl + path, { ...options, headers, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    localStorage.removeItem(CONFIG.tokenKey);
    location.href = "/clientes/login/";
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

function statusText(status) {
  if (status === "final") return "Entrega final";
  if (status === "editing") return "Em edição";
  return "Seleção";
}

function quoteStatusText(status) {
  if (status === "accepted") return "Contrato aceito";
  if (status === "viewed") return "Aguardando seu aceite";
  if (status === "expired") return "Proposta expirada";
  return "Novo orçamento";
}

function formatMoney(cents = 0) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents || 0) / 100);
}

function formatDate(value) {
  if (!value) return "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function renderQuotes(quotes = []) {
  quoteSection.hidden = !quotes.length;
  if (!quotes.length) {
    quoteList.innerHTML = "";
    return;
  }

  quoteList.innerHTML = quotes.map((quote) => `
    <a class="client-quote-card ${escapeHtml(quote.status || "published")}" href="/clientes/orcamento/?id=${encodeURIComponent(quote.id)}">
      <span>
        <small>${escapeHtml(quote.number || "Orçamento")} · ${escapeHtml(quoteStatusText(quote.status))}</small>
        <strong>${escapeHtml(quote.title || "Serviço fotográfico")}</strong>
      </span>
      <span class="client-quote-value">
        <strong>${escapeHtml(formatMoney(quote.totalCents))}</strong>
        <small>${quote.status === "accepted" ? `Aceito em ${escapeHtml(formatDate(quote.acceptedAt))}` : `Válido até ${escapeHtml(formatDate(quote.validUntil))}`}</small>
      </span>
    </a>
  `).join("");
}

function renderGalleries(galleries = []) {
  if (!galleries.length) {
    galleryList.innerHTML = `<div class="panel"><strong>Nenhuma galeria disponível.</strong><p>Quando Marcel publicar uma galeria para você, ela aparecerá aqui.</p></div>`;
    return;
  }

  galleryList.innerHTML = galleries.map((gallery) => `
    <a class="gallery-card" href="/clientes/galeria/?slug=${encodeURIComponent(gallery.slug)}">
      <span class="gallery-card-bg" style="background-image:url('${escapeHtml(cloudUrl(gallery.coverUrl || "", "w_900,q_auto,f_auto"))}')"></span>
      <span class="gallery-card-body">
        <small>${escapeHtml(statusText(gallery.status))} · ${Number(gallery.totalImages || 0)} fotos</small>
        <h2>${escapeHtml(gallery.title || "Galeria")}</h2>
        <small>${Number(gallery.totalSelected || 0)} selecionadas</small>
        <span class="btn btn-primary">Abrir galeria</span>
      </span>
    </a>
  `).join("");
}

async function loadDashboard() {
  try {
    const me = await api("/client-auth/me");
    clientLabel.textContent = me.user?.email || "";
    const [quoteResult, galleryData] = await Promise.all([
      api("/client-quotes").then((data) => ({ ok: true, data })).catch(() => ({ ok: false, data: { quotes: [] } })),
      api("/client-galleries"),
    ]);
    renderQuotes(quoteResult.data.quotes || []);
    renderGalleries(galleryData.galleries || []);
  } catch (err) {
    if (err.message !== "Unauthorized") {
      quoteSection.hidden = true;
      galleryList.innerHTML = `<div class="panel"><strong>Erro ao carregar galerias.</strong><p>${escapeHtml(err.message)}</p></div>`;
    }
  }
}

logoutBtn.addEventListener("click", async () => {
  try {
    await api("/client-auth/logout", { method: "POST" });
  } catch {
    // Sessão local será removida de qualquer forma.
  }
  localStorage.removeItem(CONFIG.tokenKey);
  location.href = "/clientes/login/";
});

loadDashboard();
