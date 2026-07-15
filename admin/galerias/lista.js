const CONFIG = {
  workerUrl: "https://api.marcelconde.com.br",
  tokenKey: "mc_admin_token",
};

const $ = (selector) => document.querySelector(selector);

const state = {
  clients: [],
  galleries: [],
  quickClientId: new URLSearchParams(location.search).get("client") || "",
};

const currentUserLabel = $("#currentUserLabel");
const statGalleries = $("#statGalleries");
const statPhotos = $("#statPhotos");
const statSelected = $("#statSelected");
const galleryList = $("#galleryList");
const refreshBtn = $("#refreshBtn");
const quickTitle = $("#quickTitle");
const quickCreateBtn = $("#quickCreateBtn");
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

function slugify(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
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
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(CONFIG.workerUrl + path, { ...options, headers, cache: "no-store" });
  if (res.status === 401) window.location.href = "/admin/";
  return res;
}

async function getJson(path, options = {}) {
  const res = await workerFetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${path} -> ${res.status}`);
  return data;
}

function statusLabel(status = "selection") {
  const labels = {
    selection: "Seleção",
    editing: "Em edição",
    final: "Entrega final",
  };
  return labels[status] || status;
}

function galleryDetailUrl(gallery) {
  return `/admin/galerias/detalhe/?id=${encodeURIComponent(gallery.id)}`;
}

function galleryClientName(gallery) {
  const client = state.clients.find((item) => item.id === gallery.clientId);
  return client?.name || client?.email || "Sem cliente vinculado";
}

function countValue(gallery, keys) {
  for (const key of keys) {
    const value = Number(gallery[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

function renderStats() {
  statGalleries.textContent = state.galleries.length;
  statPhotos.textContent = state.galleries.reduce((sum, gallery) => (
    sum + countValue(gallery, ["photoCount", "photosCount", "imageCount", "imagesCount"])
  ), 0);
  statSelected.textContent = state.galleries.reduce((sum, gallery) => (
    sum + countValue(gallery, ["selectedCount", "selectionCount", "selectedPhotosCount"])
  ), 0);
}

function renderGalleries() {
  renderStats();
  if (!state.galleries.length) {
    galleryList.innerHTML = `
      <div class="library-empty">
        <strong>Nenhuma galeria criada.</strong>
        <span>Crie a primeira galeria acima para começar.</span>
      </div>
    `;
    return;
  }

  galleryList.innerHTML = state.galleries.map((gallery) => {
    const photoCount = countValue(gallery, ["photoCount", "photosCount", "imageCount", "imagesCount"]);
    const selectedCount = countValue(gallery, ["selectedCount", "selectionCount", "selectedPhotosCount"]);
    return `
      <a class="gallery-library-card" href="${galleryDetailUrl(gallery)}">
        <span class="gallery-status">${escapeHtml(statusLabel(gallery.status))}</span>
        <strong>${escapeHtml(gallery.title || "Galeria")}</strong>
        <small>${escapeHtml(galleryClientName(gallery))}</small>
        <em>/clientes/galeria/?slug=${escapeHtml(gallery.slug || "")}</em>
        <div class="gallery-card-metrics">
          <span>${photoCount || "—"} fotos</span>
          <span>${selectedCount || "—"} selecionadas</span>
        </div>
      </a>
    `;
  }).join("");
}

async function createGallery() {
  const title = quickTitle.value.trim();
  if (!title) return showToast("Digite um título para a galeria.");

  quickCreateBtn.disabled = true;
  quickCreateBtn.textContent = "Criando...";

  try {
    const data = await getJson("/private/galleries", {
      method: "POST",
      body: JSON.stringify({
        clientId: state.quickClientId || undefined,
        title,
        slug: slugify(title),
        status: "selection",
        message: `Olá,\n\nFoi um prazer registrar este momento especial.\n\nSelecione suas fotos favoritas usando o coração exibido sobre cada imagem.`,
        selectionLimit: 15,
        extraPhotoPriceCents: 0,
        allPhotosDiscountPercent: 0,
        quantityDiscountEnabled: false,
        quantityDiscountMinPhotos: 0,
        quantityDiscountPercent: 0,
        watermark: { enabled: true, opacity: 0.28, size: 180, position: "center" },
      }),
    });
    const gallery = data.gallery;
    if (gallery?.id) {
      window.location.href = galleryDetailUrl(gallery);
      return;
    }
    showToast("Galeria criada.");
    quickTitle.value = "";
    await loadData();
  } catch (err) {
    showToast(err.message || "Erro ao criar galeria.");
  } finally {
    quickCreateBtn.disabled = false;
    quickCreateBtn.textContent = "Criar galeria";
  }
}

async function loadData() {
  galleryList.innerHTML = `<div class="library-empty"><strong>Carregando galerias...</strong></div>`;
  const me = await getJson("/auth/me");
  currentUserLabel.textContent = me.user?.email || "";
  const data = await getJson("/private/galleries");
  state.clients = data.clients || [];
  state.galleries = data.galleries || [];
  renderGalleries();
}

refreshBtn.addEventListener("click", () => loadData().catch((err) => showToast(err.message || "Erro ao carregar galerias.")));
quickCreateBtn.addEventListener("click", createGallery);
quickTitle.addEventListener("keydown", (event) => {
  if (event.key === "Enter") createGallery();
});

const suggestedTitle = new URLSearchParams(location.search).get("title") || "";
if (suggestedTitle) quickTitle.value = suggestedTitle;

loadData().catch((err) => {
  showToast(err.message || "Erro ao carregar galerias.");
});
