const CONFIG = {
  workerUrl: "https://api.marcelconde.com.br",
  batchSize: 60,
  tokenKey: "mc_client_token",
};

const params = new URLSearchParams(location.search);
const slug = params.get("slug") || "";
const inviteToken = params.get("convite") || "";

const state = {
  gallery: null,
  images: [],
  selected: new Set(),
  nextCursor: 0,
  loading: false,
  currentImage: null,
};

const galleryHeroBg = document.getElementById("galleryHeroBg");
const galleryTitle = document.getElementById("galleryTitle");
const gallerySubtitle = document.getElementById("gallerySubtitle");
const galleryMessage = document.getElementById("galleryMessage");
const galleryLimit = document.getElementById("galleryLimit");
const selectionCounter = document.getElementById("selectionCounter");
const photoGrid = document.getElementById("photoGrid");
const loadSentinel = document.getElementById("loadSentinel");
const completeBtn = document.getElementById("completeBtn");
const downloadAllBtn = document.getElementById("downloadAllBtn");
const lightbox = document.getElementById("lightbox");
const lightboxStage = document.getElementById("lightboxStage");
const lightboxClose = document.getElementById("lightboxClose");
const lightboxHeart = document.getElementById("lightboxHeart");
const toastEl = document.getElementById("toast");

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeSelector(value = "") {
  return window.CSS?.escape ? CSS.escape(String(value)) : String(value).replace(/["\\]/g, "\\$&");
}

function cloudUrl(src, transform) {
  if (!src || !src.includes("/upload/")) return src;
  return src.replace(/\/upload\/(?:[a-z]+_[^,/]+(?:,[a-z]+_[^,/]+)*\/)?/, `/upload/${transform}/`);
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toastEl.classList.remove("show"), 3200);
}

function getToken() {
  return localStorage.getItem(CONFIG.tokenKey) || "";
}

function loginRedirect() {
  location.href = `/clientes/login/?next=${encodeURIComponent(location.pathname + location.search)}`;
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (!token) {
    loginRedirect();
    throw new Error("Faça login para acessar esta galeria.");
  }
  headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(CONFIG.workerUrl + path, { ...options, headers, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    localStorage.removeItem(CONFIG.tokenKey);
    loginRedirect();
    throw new Error("Faça login para acessar esta galeria.");
  }
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

function watermarkStyle() {
  const wm = state.gallery?.watermark || {};
  if (!wm.enabled || !wm.logoUrl) return "";
  return `
    <span class="watermark ${escapeHtml(wm.position || "center")}"
      style="background-image:url('${escapeHtml(wm.logoUrl)}');opacity:${Number(wm.opacity || 0.28)};background-size:${Number(wm.size || 180)}px auto"></span>
  `;
}

function updateCounters() {
  const total = state.selected.size;
  const limit = Number(state.gallery?.selectionLimit || 0);
  if (state.gallery?.allowDownload) {
    selectionCounter.textContent = "Downloads liberados";
    galleryLimit.textContent = "Entrega final disponível para download.";
    return;
  }
  selectionCounter.textContent = limit ? `${total}/${limit} selecionadas` : `${total} selecionadas`;
  galleryLimit.textContent = limit ? `Selecione até ${limit} fotos.` : "Sem limite de seleção definido.";
}

function renderHeader() {
  const gallery = state.gallery;
  document.title = `${gallery.title} | Marcel Conde Fotografia`;
  galleryTitle.textContent = gallery.title || "Galeria privada";
  gallerySubtitle.textContent = gallery.subtitle || "";
  galleryMessage.textContent = gallery.message || "";
  if (gallery.coverUrl) {
    galleryHeroBg.style.backgroundImage = `url('${cloudUrl(gallery.coverUrl, "w_1600,q_auto,f_auto")}')`;
  }
  completeBtn.classList.toggle("hidden", Boolean(gallery.allowDownload));
  downloadAllBtn.classList.toggle("hidden", !gallery.allowDownload);
  updateCounters();
}

function renderImages(images) {
  const wm = watermarkStyle();
  const html = images.map((image) => {
    const selected = state.selected.has(image.public_id);
    const action = state.gallery?.allowDownload
      ? `<button class="download-btn" type="button" aria-label="Baixar foto">Baixar</button>`
      : `<button class="heart-btn ${selected ? "selected" : ""}" type="button" aria-label="Selecionar foto">${selected ? "♥" : "♡"}</button>`;
    return `
      <article class="photo-card" data-public-id="${escapeHtml(image.public_id)}">
        <img src="${escapeHtml(cloudUrl(image.url, "w_400,q_auto,f_auto"))}" alt="${escapeHtml(image.display_name || image.filename || "")}" loading="lazy" decoding="async">
        ${wm}
        ${action}
        <span class="photo-name">${escapeHtml(image.filename || image.display_name || "")}</span>
      </article>
    `;
  }).join("");
  photoGrid.insertAdjacentHTML("beforeend", html);
}

async function loadBatch() {
  if (state.loading || state.nextCursor === null) return;
  state.loading = true;
  loadSentinel.textContent = "Carregando fotos...";

  try {
    const data = await api(`/client-gallery?slug=${encodeURIComponent(slug)}&cursor=${state.nextCursor || 0}&limit=${CONFIG.batchSize}`);
    state.gallery = data.gallery;
    state.selected = new Set(data.gallery.selectedPublicIds || []);
    state.images.push(...(data.images || []));
    state.nextCursor = data.paging.nextCursor;

    if (state.images.length === data.images.length) renderHeader();
    renderImages(data.images || []);
    updateCounters();
    loadSentinel.textContent = state.nextCursor === null ? "Todas as fotos foram carregadas." : "Carregar mais fotos";
  } catch (err) {
    galleryTitle.textContent = "Galeria indisponível";
    galleryMessage.textContent = err.message || "Não foi possível carregar esta galeria.";
    loadSentinel.textContent = "";
  } finally {
    state.loading = false;
  }
}

function updatePhotoButtons(publicIdFilter = "") {
  if (state.gallery?.allowDownload) {
    if (state.currentImage) {
      lightboxHeart.classList.add("download-mode");
      lightboxHeart.textContent = "Baixar";
    }
    updateCounters();
    return;
  }

  const cards = publicIdFilter
    ? photoGrid.querySelectorAll(`.photo-card[data-public-id="${escapeSelector(publicIdFilter)}"]`)
    : photoGrid.querySelectorAll(".photo-card");

  cards.forEach((card) => {
    const publicId = card.dataset.publicId;
    const button = card.querySelector(".heart-btn");
    if (!button) return;
    const selected = state.selected.has(publicId);
    button.classList.toggle("selected", selected);
    button.textContent = selected ? "♥" : "♡";
  });

  if (state.currentImage) {
    const selected = state.selected.has(state.currentImage.public_id);
    lightboxHeart.classList.toggle("selected", selected);
    lightboxHeart.textContent = selected ? "♥" : "♡";
  }
  updateCounters();
}

async function toggleFavorite(publicId, shouldSelect) {
  if (state.gallery?.allowDownload) return;
  try {
    const data = await api("/client-gallery/favorite", {
      method: "POST",
      body: JSON.stringify({ slug, publicId, selected: shouldSelect }),
    });
    state.selected = new Set(data.selectedPublicIds || []);
    updatePhotoButtons(publicId);
  } catch (err) {
    showToast(err.message || "Não foi possível selecionar esta foto.");
  }
}

function triggerDownload(url, fileName = "foto.jpg") {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function safeFileName(value = "galeria") {
  return String(value || "galeria")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "galeria";
}

async function downloadImage(image) {
  if (!image?.downloadUrl) return showToast("Download ainda não liberado para esta foto.");
  triggerDownload(image.downloadUrl, image.filename || image.display_name || "foto.jpg");
  try {
    await api("/client-gallery/download-event", {
      method: "POST",
      body: JSON.stringify({ slug, publicId: image.public_id }),
    });
  } catch {
    // O download já foi iniciado; falha de log não deve bloquear o cliente.
  }
}

photoGrid.addEventListener("click", (event) => {
  const card = event.target.closest(".photo-card");
  if (!card) return;
  const publicId = card.dataset.publicId;
  const image = state.images.find((item) => item.public_id === publicId);
  if (!image) return;

  if (event.target.closest(".download-btn")) {
    downloadImage(image);
    return;
  }

  if (event.target.closest(".heart-btn")) {
    toggleFavorite(publicId, !state.selected.has(publicId));
    return;
  }

  openLightbox(image);
});

function openLightbox(image) {
  state.currentImage = image;
  lightboxStage.innerHTML = `
    <img src="${escapeHtml(cloudUrl(image.url, "w_1600,q_auto,f_auto"))}" alt="${escapeHtml(image.display_name || image.filename || "")}" decoding="async">
    ${watermarkStyle()}
  `;
  lightbox.classList.remove("hidden");
  updatePhotoButtons();
}

function closeLightbox() {
  state.currentImage = null;
  lightbox.classList.add("hidden");
  lightboxStage.innerHTML = "";
}

lightboxClose.addEventListener("click", closeLightbox);
lightbox.addEventListener("click", (event) => {
  if (event.target === lightbox) closeLightbox();
});
lightboxHeart.addEventListener("click", () => {
  if (!state.currentImage) return;
  if (state.gallery?.allowDownload) {
    downloadImage(state.currentImage);
    return;
  }
  toggleFavorite(state.currentImage.public_id, !state.selected.has(state.currentImage.public_id));
});

completeBtn.addEventListener("click", async () => {
  if (!state.gallery) return;
  if (!state.selected.size) {
    showToast("Selecione pelo menos uma foto antes de concluir.");
    return;
  }
  try {
    await api("/client-gallery/complete", {
      method: "POST",
      body: JSON.stringify({ slug }),
    });
    showToast("Seleção concluída. Obrigado!");
  } catch (err) {
    showToast(err.message || "Não foi possível concluir a seleção.");
  }
});

downloadAllBtn.addEventListener("click", async () => {
  if (!state.gallery?.allowDownload) return;
  downloadAllBtn.disabled = true;
  downloadAllBtn.textContent = "Preparando...";

  try {
    const headers = new Headers();
    headers.set("Authorization", `Bearer ${getToken()}`);
    const res = await fetch(`${CONFIG.workerUrl}/client-gallery/download-all?slug=${encodeURIComponent(slug)}`, {
      headers,
      cache: "no-store",
    });

    if (res.status === 401) {
      localStorage.removeItem(CONFIG.tokenKey);
      loginRedirect();
      throw new Error("Faça login para acessar esta galeria.");
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Erro ${res.status}`);
    }

    downloadAllBtn.textContent = "Baixando...";
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const fileName = `${safeFileName(state.gallery.slug || state.gallery.title || slug)}-fotos.zip`;
    triggerDownload(objectUrl, fileName);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    showToast("Download das fotos iniciado.");
  } catch (err) {
    showToast(err.message || "Não foi possível baixar as fotos.");
  } finally {
    downloadAllBtn.disabled = false;
    downloadAllBtn.textContent = "Baixar todas";
  }
});

loadSentinel.addEventListener("click", loadBatch);

const observer = new IntersectionObserver((entries) => {
  if (entries.some((entry) => entry.isIntersecting)) loadBatch();
}, { rootMargin: "900px 0px" });

observer.observe(loadSentinel);

if (inviteToken) {
  location.href = `/clientes/login/?convite=${encodeURIComponent(inviteToken)}`;
} else if (!slug) {
  galleryTitle.textContent = "Link inválido";
  galleryMessage.textContent = "Abra a galeria usando o link enviado pelo fotógrafo.";
  loadSentinel.textContent = "";
} else if (!getToken()) {
  loginRedirect();
} else {
  loadBatch();
}
