const CONFIG = {
  workerUrl: "https://api.marcelconde.com.br",
  tokenKey: "mc_admin_token",
};

const $ = (selector) => document.querySelector(selector);

const currentUserLabel = $("#currentUserLabel");
const statReceived = $("#statReceived");
const statPublished = $("#statPublished");
const statRequests = $("#statRequests");
const reviewsList = $("#reviewsList");
const reviewRequestsList = $("#reviewRequestsList");
const googleSummary = $("#googleSummary");
const googleReviewsList = $("#googleReviewsList");
const siteReviewsPanel = $("#siteReviewsPanel");
const refreshBtn = $("#refreshBtn");
const toastEl = $("#toast");

const REVIEW_STATUS = { pending: "Aguardando você", published: "Publicada no site", hidden: "Oculta" };

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

function formatDate(value) {
  if (!value) return "sem data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "sem data";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
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
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(CONFIG.workerUrl + path, { ...options, headers });
  if (res.status === 401) location.href = "/admin/";
  return res;
}

async function getJson(path, options = {}) {
  const res = await workerFetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

function messageRow(title, detail = "") {
  return `<div class="admin-row"><div><strong>${escapeHtml(title)}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</div></div>`;
}

function galleryLink(galleryId, title) {
  return `<a href="/admin/galerias/detalhe/?id=${encodeURIComponent(galleryId)}">${escapeHtml(title || "Galeria")}</a>`;
}

function reviewStars(rating = 0) {
  const value = Math.max(0, Math.min(5, Number(rating) || 0));
  return "★".repeat(value) + "☆".repeat(5 - value);
}

// Reviews written on Google, as the site shows them (GET /reviews).
function renderGoogle(google = {}) {
  const fromGoogle = google.source === "google";
  const total = Number(google.total || 0);
  statReceived.textContent = total;
  statPublished.textContent = fromGoogle ? google.reviews.length : 0;
  if (google.rating === undefined) {
    googleSummary.textContent = "As avaliações do Google aparecem aqui e no site depois que a chave da API do Google Places for configurada no Worker.";
  } else {
    const score = Number(google.rating || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    googleSummary.innerHTML = `Nota ${escapeHtml(score)} · ${total} ${total === 1 ? "avaliação" : "avaliações"}${google.googleUrl ? ` · <a href="${escapeHtml(google.googleUrl)}" target="_blank" rel="noopener noreferrer">Abrir no Google</a>` : ""}. O site mostra as mais relevantes (até 5).`;
  }
  googleReviewsList.innerHTML = fromGoogle ? google.reviews.map((review) => `
    <div class="admin-row review-row">
      <div>
        <strong>${reviewStars(review.rating)} ${escapeHtml(review.name || "Cliente")}</strong>
        <small>${escapeHtml(review.when || "")}</small>
      </div>
      <div><p>${escapeHtml(review.text || "")}</p></div>
    </div>`).join("") : messageRow("Nenhuma avaliação no Google ainda.", "Peça pela página de cada galeria entregue ou pela lista de pedidos abaixo.");
}

function render({ reviews = [], requests = [], delivered = [] } = {}) {
  siteReviewsPanel.classList.toggle("hidden", !reviews.length);

  reviewsList.innerHTML = reviews.length ? reviews.map((review) => {
    const id = escapeHtml(review.galleryId);
    const actions = [
      review.publish && review.status !== "published"
        ? `<button class="btn btn-primary btn-small" data-review="${id}" data-status="published" type="button">Publicar no site</button>` : "",
      review.status === "hidden"
        ? `<button class="btn btn-ghost btn-small" data-review="${id}" data-status="pending" type="button">Voltar para análise</button>`
        : `<button class="btn btn-ghost btn-small" data-review="${id}" data-status="hidden" type="button">${review.status === "published" ? "Tirar do site" : "Ocultar"}</button>`,
    ].join("");
    return `
      <div class="admin-row review-row">
        <div>
          <strong>${reviewStars(review.rating)} ${escapeHtml(review.name || "Cliente")}</strong>
          <small>${galleryLink(review.galleryId, review.galleryTitle)} · ${escapeHtml(formatDate(review.updatedAt || review.createdAt))}${review.isTest ? " · cliente de teste" : ""}</small>
          <small>${escapeHtml(REVIEW_STATUS[review.status] || review.status || "")}${review.publish ? "" : " · o cliente não autorizou publicar"}</small>
        </div>
        <div>
          <p>${escapeHtml(review.text || "")}</p>
          ${review.photo?.url ? `<img src="${escapeHtml(review.photo.url.replace("/upload/", "/upload/f_auto,q_auto,w_160,h_160,c_fill/"))}" alt="Foto escolhida pelo cliente">` : ""}
          <div class="review-actions">${actions}</div>
        </div>
      </div>`;
  }).join("") : messageRow("Nenhuma avaliação ainda.", "Elas chegam quando o cliente responde ao e-mail do dia seguinte à entrega.");

  const reviewed = new Set(reviews.map((review) => review.galleryId));
  const rows = [
    ...requests.filter((request) => !reviewed.has(request.galleryId)).map((request) => {
      const status = request.sentAt
        ? `Pedido enviado em ${formatDate(request.sentAt)}`
        : request.attempts ? `Envio falhou: ${request.lastError || "erro"}` : `Pedido agendado para ${formatDate(request.sendAt)}`;
      return { id: request.galleryId, title: request.galleryTitle, name: request.name, status, label: request.sentAt ? "Reenviar pedido" : "Enviar agora" };
    }),
    ...delivered.map((item) => ({ id: item.galleryId, title: item.galleryTitle, name: item.name, status: "Entregue, sem pedido de avaliação", label: "Pedir avaliação" })),
  ];
  statRequests.textContent = rows.length;
  reviewRequestsList.innerHTML = rows.length ? rows.map((row) => `
    <div class="admin-row">
      <div>
        <strong>${galleryLink(row.id, row.title)}</strong>
        <small>${escapeHtml(row.name || "")} · ${escapeHtml(row.status)}</small>
      </div>
      <button class="btn btn-ghost btn-small" data-request="${escapeHtml(row.id)}" type="button">${escapeHtml(row.label)}</button>
    </div>`).join("") : messageRow("Nenhum pedido pendente.");
}

async function loadData() {
  refreshBtn.disabled = true;
  reviewsList.innerHTML = messageRow("Carregando avaliações...");
  reviewRequestsList.innerHTML = "";
  try {
    const [me, data, google] = await Promise.all([
      getJson("/auth/me"),
      getJson("/private/reviews"),
      fetch(`${CONFIG.workerUrl}/reviews`).then((res) => res.json()).catch(() => ({})),
    ]);
    currentUserLabel.textContent = me.user?.email || "";
    render(data);
    renderGoogle(google);
  } catch (err) {
    reviewsList.innerHTML = messageRow("Erro ao carregar avaliações.", err.message || "");
  } finally {
    refreshBtn.disabled = false;
  }
}

reviewsList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-review]");
  if (!button) return;
  button.disabled = true;
  try {
    await getJson("/private/review/status", {
      method: "POST",
      body: JSON.stringify({ galleryId: button.dataset.review, status: button.dataset.status }),
    });
    showToast(button.dataset.status === "published" ? "Avaliação publicada no site." : "Avaliação atualizada.");
    await loadData();
  } catch (err) {
    showToast(err.message);
    button.disabled = false;
  }
});

reviewRequestsList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-request]");
  if (!button) return;
  if (!confirm("Enviar agora o e-mail pedindo a avaliação deste cliente?")) return;
  button.disabled = true;
  button.textContent = "Enviando...";
  try {
    await getJson("/private/review/request", {
      method: "POST",
      body: JSON.stringify({ galleryId: button.dataset.request }),
    });
    showToast("Pedido de avaliação enviado ao cliente.");
    await loadData();
  } catch (err) {
    showToast(err.message);
    button.disabled = false;
  }
});

refreshBtn.addEventListener("click", loadData);
loadData();
