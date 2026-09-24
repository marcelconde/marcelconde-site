const CONFIG = {
  workerUrl: "https://api.marcelconde.com.br",
  batchSize: 60,
  tokenKey: "mc_client_token",
};

const params = new URLSearchParams(location.search);
const slug = params.get("slug") || "";
const inviteToken = params.get("convite") || "";
const previewKey = `mc_gallery_preview:${slug}`;
let previewToken = new URLSearchParams(location.hash.slice(1)).get("preview") || "";
try {
  if (previewToken) {
    sessionStorage.setItem(previewKey, previewToken);
    history.replaceState(null, "", location.pathname + location.search);
  } else previewToken = sessionStorage.getItem(previewKey) || "";
} catch {}


const state = {
  gallery: null,
  images: [],
  selected: new Set(),
  nextCursor: 0,
  loading: false,
  currentImage: null,
  payment: null,
  pendingPayment: null,
  paymentPoll: null,
  pending: new Map(),
  syncPromise: null,
  draftLoaded: false,
  selectionVersion: 0,
  refreshing: false,
  bulkSelecting: false,
  view: "grid",

};

const galleryHero = document.getElementById("galleryHero");
const galleryHeroBg = document.getElementById("galleryHeroBg");
const galleryTitle = document.getElementById("galleryTitle");
const gallerySubtitle = document.getElementById("gallerySubtitle");
const galleryMessage = document.getElementById("galleryMessage");
const galleryLimit = document.getElementById("galleryLimit");
const selectionCounter = document.getElementById("selectionCounter");
const pricingSummary = document.getElementById("pricingSummary");
const workflowStatus = document.getElementById("workflowStatus");
const photoGrid = document.getElementById("photoGrid");
const loadSentinel = document.getElementById("loadSentinel");
const completeBtn = document.getElementById("completeBtn");
const pendingPaymentBtn = document.getElementById("pendingPaymentBtn");
const selectAllBtn = document.getElementById("selectAllBtn");
const downloadAllBtn = document.getElementById("downloadAllBtn");
const lightbox = document.getElementById("lightbox");
const lightboxStage = document.getElementById("lightboxStage");
const lightboxClose = document.getElementById("lightboxClose");
const lightboxHeart = document.getElementById("lightboxHeart");
const lightboxPrev = document.getElementById("lightboxPrev");
const lightboxNext = document.getElementById("lightboxNext");
const lightboxCount = document.getElementById("lightboxCount");
const paymentModal = document.getElementById("paymentModal");
const paymentCard = paymentModal.querySelector(".payment-card");
const paymentClose = document.getElementById("paymentClose");
const paymentDescription = document.getElementById("paymentDescription");
const paymentSuccess = document.getElementById("paymentSuccess");
const paymentQr = document.getElementById("paymentQr");
const paymentCopy = paymentModal.querySelector(".payment-copy");
const paymentCode = document.getElementById("paymentCode");
const copyPaymentCode = document.getElementById("copyPaymentCode");
const paymentStatus = document.getElementById("paymentStatus");
const paymentSandboxNotice = document.getElementById("paymentSandboxNotice");
const paymentOpenLink = document.getElementById("paymentOpenLink");
const documentDialog = document.getElementById("documentDialog");
const documentForm = document.getElementById("documentForm");
const paymentDocument = document.getElementById("paymentDocument");
const documentError = document.getElementById("documentError");
const documentCancel = document.getElementById("documentCancel");
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

function formatCurrency(cents = 0) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(cents || 0) / 100);
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toastEl.classList.remove("show"), 3200);
}

function galleryViewKey() {
  return `mc_gallery_view:${state.gallery?.id || slug}`;
}

function setGalleryView(view, persist = true) {
  const validView = ["grid", "large", "list"].includes(view) ? view : "grid";
  state.view = validView;
  photoGrid.dataset.view = validView;
  document.querySelectorAll("[data-gallery-view]").forEach((button) => {
    const active = button.dataset.galleryView === validView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (persist) {
    try { localStorage.setItem(galleryViewKey(), validView); } catch { /* Visual preference is optional. */ }
  }
}

function restoreGalleryView() {
  try { setGalleryView(localStorage.getItem(galleryViewKey()) || "grid", false); }
  catch { setGalleryView("grid", false); }
}

function isSelectionCompleted() {
  return Boolean(state.gallery?.selectionCompletedAt) && state.gallery?.status === "final" && !state.gallery?.allowDownload;
}

function hasCompletedSelection() {
  return Boolean(state.gallery?.selectionCompletedAt) && !state.gallery?.allowDownload;
}

function hasPendingExtraSelection() {
  const pricing = state.gallery?.pricing || {};
  return Boolean(pricing.requiresPayment) || Number(pricing.extraCount || 0) > 0;
}

function showCompletionStatus() {
  return hasCompletedSelection() && state.gallery?.status === "editing" && !hasPendingExtraSelection();
}

function getToken() {
  return previewToken || localStorage.getItem(CONFIG.tokenKey) || "";
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
    if (previewToken) throw new Error("Prévia expirada. Abra novamente pelo admin.");
    localStorage.removeItem(CONFIG.tokenKey);
    loginRedirect();
    throw new Error("Faça login para acessar esta galeria.");
  }
  if (!res.ok) throw Object.assign(new Error(data.error || `Erro ${res.status}`), { status: res.status, details: data });
  return data;
}

function watermarkStyle() {
  const wm = state.gallery?.watermark || {};
  if (state.gallery?.allowDownload || state.gallery?.status === "final") return "";
  if (!wm.enabled || !wm.logoUrl) return "";
  return `
    <span class="watermark ${escapeHtml(wm.position || "center")}"
      style="background-image:url('${escapeHtml(wm.logoUrl)}');opacity:${Number(wm.opacity || 0.28)};background-size:${Number(wm.size || 180)}px auto"></span>
  `;
}

function renderHeroCarousel() {
  if (!galleryHeroBg) return;
  clearInterval(renderHeroCarousel.timer);
  const sources = state.images
    .map((image) => image.url)
    .filter(Boolean)
    .slice(0, 12);

  if (!sources.length) {
    galleryHeroBg.innerHTML = "";
    galleryHeroBg.style.backgroundImage = state.gallery?.coverUrl
      ? `url('${cloudUrl(state.gallery.coverUrl, "w_1800,q_auto,f_auto")}')`
      : "";
    return;
  }

  galleryHeroBg.style.backgroundImage = "";
  galleryHeroBg.innerHTML = sources.map((src, index) => `
    <span class="gallery-hero-slide${index === 0 ? " active" : ""}" style="background-image:url('${escapeHtml(cloudUrl(src, "w_1800,q_auto,f_auto"))}')"></span>
  `).join("");

  if (sources.length <= 1) return;

  let current = 0;
  renderHeroCarousel.timer = setInterval(() => {
    const slides = galleryHeroBg.querySelectorAll(".gallery-hero-slide");
    if (slides.length <= 1) return;
    slides[current]?.classList.remove("active");
    current = (current + 1) % slides.length;
    slides[current]?.classList.add("active");
  }, 4200);
}

function updateCounters() {
  const total = state.selected.size;
  const limit = Number(state.gallery?.selectionLimit || 0);
  const pricing = state.gallery?.pricing || {};
  renderWorkflowStatus();
  if (showCompletionStatus()) return;
  if (state.gallery?.allowDownload) {
    selectionCounter.textContent = "Downloads liberados";
    galleryLimit.textContent = "Entrega final disponível para download.";
    pricingSummary.hidden = true;
    return;
  }
  selectionCounter.textContent = limit ? `${total}/${limit} inclusas` : `${total} selecionadas`;
  if (isSelectionCompleted()) {
    selectionCounter.textContent = `${total} selecionadas`;
    galleryLimit.textContent = "Seleção concluída.";
    renderPricingSummary();
    return;
  }
  if (hasCompletedSelection() && !pricing.requiresPayment && !Number(pricing.extraCount || 0)) {
    galleryLimit.textContent = showCompletionStatus()
      ? "Seleção concluída. Fotos em edição."
      : "Seleção concluída. Você pode adicionar mais fotos enquanto a galeria estiver aberta.";
    renderPricingSummary();
    return;
  }
  if (pricing.needsMoreIncludedPhotos) {
    galleryLimit.textContent = `Selecione pelo menos ${limit} fotos para concluir.`;
  } else if (pricing.extraCount > 0) {
    galleryLimit.textContent = limit === 0 ? `${total} foto(s) para comprar.` : `${pricing.extraCount} foto${pricing.extraCount > 1 ? "s" : ""} extra${pricing.extraCount > 1 ? "s" : ""} adicionada${pricing.extraCount > 1 ? "s" : ""}.`;
  } else {
    galleryLimit.textContent = limit ? `Pacote com ${limit} fotos inclusas.` : "Escolha as fotos que deseja comprar. Nenhuma foto inclusa previamente.";
  }
  renderPricingSummary();
}

function renderWorkflowStatus() {
  if (!workflowStatus) return;

  if (!showCompletionStatus()) {
    document.body.classList.remove("selection-processing");
    if (galleryHero) galleryHero.hidden = false;
    photoGrid.hidden = false;
    loadSentinel.hidden = false;
    workflowStatus.hidden = true;
    workflowStatus.innerHTML = "";
    return;
  }

  const hasPayment = Boolean(state.gallery?.selectionPaymentId);
  document.body.classList.add("selection-processing");
  if (galleryHero) galleryHero.hidden = true;
  photoGrid.hidden = true;
  loadSentinel.hidden = true;
  completeBtn.classList.add("hidden");
  selectAllBtn.classList.add("hidden");
  downloadAllBtn.classList.add("hidden");
  pricingSummary.hidden = true;
  selectionCounter.textContent = "Fotos em edição";
  workflowStatus.hidden = false;
  workflowStatus.innerHTML = `
    <span class="eyebrow">${hasPayment ? "Pagamento confirmado" : "Seleção recebida"}</span>
    <h2>${hasPayment ? "Pagamento e seleção concluídos" : "Seleção concluída"}</h2>
    <p>As fotos selecionadas já estão em processo de edição. Aguarde o retorno por e-mail ou WhatsApp com o link para baixar as imagens assim que a entrega final estiver liberada.</p>
  `;
}

function renderPricingSummary() {
  const pricing = state.gallery?.pricing;
  if (!pricing || state.gallery?.allowDownload) {
    pricingSummary.hidden = true;
    return;
  }
  if (pricing.additionalSelection && !Number(pricing.extraCount || 0) && !Number(pricing.totalCents || 0)) {
    pricingSummary.hidden = true;
    return;
  }

  const showMoney = Number(pricing.unitPriceCents || 0) > 0 || Number(pricing.extraCount || 0) > 0;
  pricingSummary.hidden = !showMoney;
  if (!showMoney) return;

  const additionalLine = pricing.additionalSelection && Number(pricing.lockedExtraCount || 0) > 0
    ? `<div class="pricing-line"><span>Extras já confirmadas</span><strong>${Number(pricing.lockedExtraCount || 0)}</strong></div>`
    : "";
  const discountLine = pricing.discountCents > 0
    ? `<div class="pricing-line"><span>${escapeHtml(pricing.discountLabel || "Desconto")}</span><strong>-${formatCurrency(pricing.discountCents)}</strong></div>`
    : "";
  const extraLabel = pricing.additionalSelection ? "Novas fotos extras" : pricing.includedPhotos ? "Fotos extras" : "Fotos para comprar";
  const totalLabel = pricing.additionalSelection ? "Total adicional" : "Total a pagar";

  pricingSummary.innerHTML = `
    <div class="pricing-line"><span>Fotos inclusas</span><strong>${Number(pricing.includedPhotos || 0)}</strong></div>
    <div class="pricing-line"><span>Selecionadas</span><strong>${Number(pricing.selectedTotal || 0)}</strong></div>
    ${additionalLine}
    <div class="pricing-line"><span>${extraLabel}</span><strong>${Number(pricing.extraCount || 0)} × ${formatCurrency(pricing.unitPriceCents || 0)}</strong></div>
    <div class="pricing-line"><span>Subtotal</span><strong>${formatCurrency(pricing.subtotalCents || 0)}</strong></div>
    ${discountLine}
    <div class="pricing-line total"><span>${totalLabel}</span><strong>${formatCurrency(pricing.totalCents || 0)}</strong></div>
  `;
}

function renderHeader() {
  const gallery = state.gallery;
  document.title = `${gallery.title} | Marcel Conde Fotografia`;
  galleryTitle.textContent = gallery.title || "Galeria privada";
  gallerySubtitle.textContent = gallery.subtitle || "";
  galleryMessage.textContent = gallery.message || "";
  restoreGalleryView();
  renderHeroCarousel();
  completeBtn.classList.toggle("hidden", Boolean(gallery.allowDownload || previewToken));
  pendingPaymentBtn.classList.toggle("hidden", Boolean(gallery.allowDownload || previewToken || !state.pendingPayment));
  selectAllBtn.classList.toggle("hidden", Boolean(gallery.allowDownload || previewToken));
  completeBtn.textContent = gallery.pricing?.requiresPayment ? "Comprar fotos selecionadas" : "Confirmar seleção";
  document.getElementById("adminPreviewNotice").hidden = !previewToken;
  downloadAllBtn.classList.toggle("hidden", !gallery.allowDownload);
  updateCounters();
}

async function loadPendingPayment() {
  if (previewToken || !state.gallery || state.gallery.allowDownload) return;
  try {
    const data = await api(`/client-gallery/payment/current?slug=${encodeURIComponent(slug)}`);
    state.pendingPayment = data.payment?.status === "approved" ? null : (data.payment || null);
    renderHeader();
  } catch {
    // A payment lookup must not prevent the client from viewing the gallery.
  }
}

function renderImages(images) {
  const wm = watermarkStyle();
  const html = images.map((image) => {
    const selected = state.selected.has(image.public_id);
    const selectionCompleted = isSelectionCompleted() || Boolean(previewToken) || state.bulkSelecting;
    const action = state.gallery?.allowDownload
      ? `<button class="download-btn" type="button" aria-label="Baixar foto">Baixar</button>`
      : `<button class="heart-btn ${selected ? "selected" : ""}" type="button" aria-label="${selectionCompleted ? "Seleção concluída" : "Selecionar foto"}" ${selectionCompleted ? "disabled" : ""}>${selected ? "♥" : "♡"}</button>`;
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
  const selectionVersion = state.selectionVersion;
  loadSentinel.textContent = "Carregando fotos...";

  try {
    const data = await api(`/client-gallery?slug=${encodeURIComponent(slug)}&cursor=${state.nextCursor || 0}&limit=${CONFIG.batchSize}`);
    const staleSelection = selectionVersion !== state.selectionVersion || Boolean(state.syncPromise);
    const currentPricing = state.gallery?.pricing;
    state.gallery = data.gallery;
    if (staleSelection && currentPricing) state.gallery.pricing = currentPricing;
    restorePendingSelection();
    if (!staleSelection) acceptSelection(data.gallery.selectedPublicIds || []);
    state.images.push(...(data.images || []));
    state.nextCursor = data.paging.nextCursor;

    if (state.images.length === data.images.length) {
      renderHeader();
      loadPendingPayment();
    }
    if (showCompletionStatus()) {
      state.images = [];
      state.nextCursor = null;
      photoGrid.innerHTML = "";
      renderHeader();
      loadSentinel.textContent = "";
      return;
    }
    renderImages(data.images || []);
    updatePhotoButtons();
    if (state.pending.size) flushSelection();
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
      lightboxHeart.disabled = false;
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
    button.disabled = isSelectionCompleted() || Boolean(previewToken) || state.bulkSelecting;
    button.setAttribute("aria-label", isSelectionCompleted() ? "Seleção concluída" : "Selecionar foto");
  });

  if (state.currentImage) {
    const selected = state.selected.has(state.currentImage.public_id);
    lightboxHeart.classList.toggle("selected", selected);
    lightboxHeart.textContent = selected ? "♥" : "♡";
    lightboxHeart.disabled = isSelectionCompleted() || Boolean(previewToken) || state.bulkSelecting;
  }
  updateCounters();
}

function selectionDraftKey() {
  return `mc_selection_pending:${state.gallery?.selectionOwnerId}:${state.gallery?.id}`;
}

function persistPendingSelection() {
  if (previewToken || !state.gallery) return;
  try {
    if (state.pending.size) localStorage.setItem(selectionDraftKey(), JSON.stringify([...state.pending]));
    else localStorage.removeItem(selectionDraftKey());
  } catch {
    showToast("Armazenamento local indisponível. Aguarde a seleção ser salva antes de sair.");
  }
}

function restorePendingSelection() {
  if (state.draftLoaded || previewToken || !state.gallery) return;
  if (state.gallery.allowDownload) { state.draftLoaded = true; return; }
  state.draftLoaded = true;
  try {
    const entries = JSON.parse(localStorage.getItem(selectionDraftKey()) || "[]");
    state.pending = new Map(entries.filter(([id, value]) => typeof id === "string" && typeof value?.selected === "boolean"));
  } catch { state.pending = new Map(); }
}

function acceptSelection(ids) {
  state.selected = new Set(ids);
  if (!state.gallery?.allowDownload) state.pending.forEach((value, id) => value.selected ? state.selected.add(id) : state.selected.delete(id));
}

function selectionSyncLabel(message) {
  document.getElementById("selectionSyncStatus").textContent = message;
}

function flushSelection() {
  if (state.syncPromise) return state.syncPromise;
  if (previewToken || !state.pending.size) return Promise.resolve(true);
  if (state.gallery?.status === "final") {
    selectionSyncLabel("Seleção encerrada. Alterações pendentes não foram aplicadas.");
    return Promise.resolve(false);
  }
  state.syncPromise = (async () => {
    try {
      while (state.pending.size) {
        const batch = [...state.pending].slice(0, 100);
        selectionSyncLabel("Salvando seleção…");
        const data = await api("/client-gallery/favorites", {
          method: "POST",
          body: JSON.stringify({ slug, changes: batch.map(([publicId, value]) => ({ publicId, selected: value.selected })) }),
        });
        batch.forEach(([id, value]) => {
          if (state.pending.get(id) === value) state.pending.delete(id);
        });
        persistPendingSelection();
        acceptSelection(data.selectedPublicIds || []);
        if (data.pricing) state.gallery.pricing = data.pricing;
        state.selectionVersion++;
        updatePhotoButtons();
      }
      selectionSyncLabel("Seleção salva automaticamente. Confirme quando terminar.");
      return true;
    } catch (err) {
      if (err.status === 400 && Array.isArray(err.details?.invalidPublicIds)) {
        err.details.invalidPublicIds.forEach(id => { state.pending.delete(id); state.selected.delete(id); });
        persistPendingSelection();
        updatePhotoButtons();
        showToast("Fotos removidas da galeria saíram da seleção pendente.");
      }
      if (err.status === 409 && /pagamento em andamento|cobrança/i.test(err.message || "")) {
        // A charge locks its exact selection. Do not leave a local edit that would
        // later make the amount and the selected photos disagree.
        state.pending.clear();
        persistPendingSelection();
        try {
          const current = await api(`/client-gallery?slug=${encodeURIComponent(slug)}&cursor=0&limit=1&summary=1`);
          if (current.gallery) {
            state.gallery = { ...state.gallery, ...current.gallery };
            acceptSelection(current.gallery.selectedPublicIds || []);
          }
        } catch { /* Keep the visible server state if a refresh is unavailable. */ }
        state.pendingPayment ||= { status: "pending" };
        renderHeader();
        updatePhotoButtons();
        selectionSyncLabel("A seleção está bloqueada por uma cobrança pendente. Abra “Ver cobrança pendente” para continuar.");
        showToast("Há uma cobrança pendente para estas fotos.");
        return false;
      }
      selectionSyncLabel("Seleção guardada neste aparelho. Falta sincronizar; tentaremos novamente.");
      return false;
    } finally { state.syncPromise = null; }
  })();
  return state.syncPromise;
}

function toggleFavorite(publicId, shouldSelect) {
  if (previewToken || state.bulkSelecting || state.gallery?.allowDownload || isSelectionCompleted()) return;
  state.pending.set(publicId, { selected: shouldSelect });
  state.selectionVersion++;
  if (shouldSelect) state.selected.add(publicId); else state.selected.delete(publicId);
  persistPendingSelection();
  updatePhotoButtons(publicId);
  selectionSyncLabel("Salvando seleção…");
  clearTimeout(toggleFavorite.timer);
  toggleFavorite.timer = setTimeout(flushSelection, 180);
}

async function refreshGallerySettings() {
  if (!state.gallery || state.loading || state.refreshing || state.syncPromise || state.bulkSelecting || document.hidden) return;
  if (state.pending.size) await flushSelection();
  const version = state.selectionVersion;
  state.refreshing = true;
  try {
    const data = await api(`/client-gallery?slug=${encodeURIComponent(slug)}&limit=1&summary=1`);
    if (version !== state.selectionVersion) return;
    const phaseChanged = Boolean(state.gallery.allowDownload) !== Boolean(data.gallery.allowDownload);
    const appearanceChanged = JSON.stringify(state.gallery.watermark) !== JSON.stringify(data.gallery.watermark);
    state.gallery = data.gallery;
    acceptSelection(data.gallery.selectedPublicIds || []);
    if (phaseChanged || (!state.images.length && data.gallery.totalImages > 0 && !showCompletionStatus())) {
      state.images = [];
      state.nextCursor = 0;
      photoGrid.innerHTML = "";
      await loadBatch();
    } else if (appearanceChanged) {
      photoGrid.innerHTML = "";
      renderImages(state.images);
    }
    renderHeader();
    updatePhotoButtons();
  } catch { /* Preserve the current gallery during temporary network failures. */ }
  finally { state.refreshing = false; }
}

window.addEventListener("online", () => flushSelection().then(refreshGallerySettings));
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) flushSelection().then(refreshGallerySettings);
});
setInterval(refreshGallerySettings, 15000);

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
    if (previewToken) return;
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
  renderLightboxNavigation();
  updatePhotoButtons();
}

function currentImageIndex() {
  return state.images.findIndex((image) => image.public_id === state.currentImage?.public_id);
}

async function moveLightbox(step) {
  const index = currentImageIndex();
  if (index < 0) return;
  let nextIndex = index + step;
  if (nextIndex < 0) nextIndex = state.images.length - 1;
  if (nextIndex >= state.images.length && state.nextCursor !== null) {
    await loadBatch();
  }
  nextIndex = index + step;
  if (nextIndex < 0) nextIndex = state.images.length - 1;
  if (nextIndex >= state.images.length) nextIndex = 0;
  openLightbox(state.images[nextIndex]);
}

function renderLightboxNavigation() {
  const index = currentImageIndex();
  const total = state.gallery?.totalImages || state.images.length;
  const hasPhotos = state.images.length > 1;
  lightboxPrev.disabled = !hasPhotos;
  lightboxNext.disabled = !hasPhotos && state.nextCursor === null;
  lightboxCount.textContent = index >= 0 ? `${index + 1} de ${total}` : "";
}

function closeLightbox() {
  state.currentImage = null;
  lightbox.classList.add("hidden");
  lightboxStage.innerHTML = "";
  lightboxCount.textContent = "";
}

lightboxClose.addEventListener("click", closeLightbox);
lightboxPrev.addEventListener("click", () => moveLightbox(-1));
lightboxNext.addEventListener("click", () => moveLightbox(1));
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

document.addEventListener("keydown", (event) => {
  if (lightbox.classList.contains("hidden")) return;
  if (event.key === "Escape") closeLightbox();
  if (event.key === "ArrowLeft") moveLightbox(-1);
  if (event.key === "ArrowRight") moveLightbox(1);
});

document.querySelectorAll("[data-gallery-view]").forEach((button) => {
  button.addEventListener("click", () => setGalleryView(button.dataset.galleryView));
});

completeBtn.addEventListener("click", async () => {
  if (!state.gallery || previewToken) return;
  if (!(await flushSelection())) { showToast("Aguarde salvar sua seleção antes de confirmar."); return; }
  if (!state.selected.size) {
    showToast("Selecione pelo menos uma foto antes de concluir.");
    return;
  }
  const pricing = state.gallery.pricing || {};
  if (hasCompletedSelection() && !pricing.requiresPayment && !Number(pricing.extraCount || 0)) {
    showToast("Seleção já concluída. Marque novas fotos para atualizar.");
    return;
  }
  if (pricing.needsMoreIncludedPhotos) {
    showToast(`Selecione pelo menos ${pricing.includedPhotos} fotos para concluir.`);
    return;
  }
  if (pricing.requiresPayment) {
    await createPixPayment();
    return;
  }
  try {
    const data = await api("/client-gallery/complete", {
      method: "POST",
      body: JSON.stringify({ slug }),
    });
    if (data.gallery) state.gallery = data.gallery;
    if (data.pricing && state.gallery) state.gallery.pricing = data.pricing;
    renderHeader();
    updatePhotoButtons();
    showToast("Seleção concluída. Fotos em edição.");
  } catch (err) {
    if (err.status === 402 && err.details?.pricing) {
      state.gallery.pricing = err.details.pricing;
      updateCounters();
      await createPixPayment();
    } else showToast(err.message || "Não foi possível concluir a seleção.");
  }
});

selectAllBtn.addEventListener("click", async () => {
  if (!state.gallery || state.gallery.allowDownload || previewToken) return;
  if (!(await flushSelection())) { showToast("Aguarde salvar sua seleção antes de selecionar todas."); return; }
  state.bulkSelecting = true;
  updatePhotoButtons();
  selectAllBtn.disabled = true;
  selectAllBtn.textContent = "Selecionando...";
  try {
    const data = await api("/client-gallery/select-all", {
      method: "POST",
      body: JSON.stringify({ slug }),
    });
    acceptSelection(data.selectedPublicIds || []);
    state.selectionVersion++;
    if (data.pricing) state.gallery.pricing = data.pricing;
    updatePhotoButtons();
    showToast("Todas as fotos foram selecionadas.");
  } catch (err) {
    showToast(err.message || "Não foi possível selecionar todas.");
  } finally {
    state.bulkSelecting = false;
    updatePhotoButtons();
    selectAllBtn.disabled = false;
    selectAllBtn.textContent = "Selecionar todas";
  }
});

function openPaymentModal(payment, pricing) {
  state.payment = payment;
  paymentSandboxNotice.classList.toggle("hidden", payment.environment !== "sandbox");
  paymentDescription.textContent = `${pricing.additionalSelection ? "Total adicional das fotos extras" : "Total das fotos extras"}: ${formatCurrency(payment.amountCents || pricing.totalCents || 0)}. Depois do pagamento aprovado, sua seleção será confirmada automaticamente.`;
  const hosted = Boolean(payment.ticketUrl && !payment.qrCode);
  paymentOpenLink.classList.toggle("hidden", !hosted);
  if (hosted) paymentOpenLink.href = payment.ticketUrl;
  paymentQr.innerHTML = payment.qrCodeBase64
    ? `<img src="data:image/png;base64,${escapeHtml(payment.qrCodeBase64)}" alt="QR Code Pix">`
    : hosted ? `<span>Escolha a forma de pagamento disponível na página segura do Asaas.</span>` : `<span>Use o código Pix abaixo.</span>`;
  paymentCode.value = payment.qrCode || "";
  setPaymentModalState("pending");
  paymentModal.classList.remove("hidden");
  startPaymentPolling(payment.id);
}

function setPaymentModalState(status, message = "") {
  const approved = status === "approved";
  const rejected = status === "rejected";

  paymentCard.classList.toggle("is-approved", approved);
  paymentCard.classList.toggle("is-rejected", rejected);
  paymentSuccess.classList.toggle("hidden", !approved);
  const hosted = Boolean(state.payment?.ticketUrl && !state.payment?.qrCode);
  paymentQr.classList.toggle("hidden", approved || rejected);
  paymentCopy.classList.toggle("hidden", approved || rejected || hosted);
  copyPaymentCode.classList.toggle("hidden", approved || rejected || hosted);
  paymentOpenLink.classList.toggle("hidden", approved || rejected || !hosted);
  paymentStatus.classList.toggle("is-approved", approved);
  paymentStatus.classList.toggle("is-rejected", rejected);

  if (approved) {
    paymentStatus.textContent = message || "Pagamento aprovado. Seleção concluída!";
  } else if (rejected) {
    paymentStatus.textContent = message || "Pagamento recusado ou cancelado. Tente gerar uma nova cobrança.";
  } else {
    paymentStatus.textContent = message || "Aguardando pagamento...";
  }
}

function closePaymentModal() {
  paymentModal.classList.add("hidden");
  if (state.paymentPoll) {
    clearInterval(state.paymentPoll);
    state.paymentPoll = null;
  }
}

function askPaymentDocument() {
  return new Promise((resolve) => {
    documentError.classList.add("hidden");
    paymentDocument.value = "";
    documentDialog.showModal();
    const finish = (value) => {
      documentForm.removeEventListener("submit", submit);
      documentCancel.removeEventListener("click", cancel);
      documentDialog.removeEventListener("cancel", cancel);
      if (documentDialog.open) documentDialog.close();
      resolve(value);
    };
    const submit = (event) => {
      event.preventDefault();
      const value = paymentDocument.value.replace(/\D/g, "");
      if (![11, 14].includes(value.length)) {
        documentError.classList.remove("hidden");
        paymentDocument.focus();
        return;
      }
      finish(value);
    };
    const cancel = (event) => {
      event.preventDefault();
      finish("");
    };
    documentForm.addEventListener("submit", submit);
    documentCancel.addEventListener("click", cancel);
    documentDialog.addEventListener("cancel", cancel);
    paymentDocument.focus();
  });
}

async function createPixPayment(existingDocument = "") {
  completeBtn.disabled = true;
  completeBtn.textContent = "Preparando pagamento...";
  try {
    let data;
    const create = (document = "") => api("/client-gallery/payment/create", {
      method: "POST",
      body: JSON.stringify({ slug, document }),
    });
    if (existingDocument) data = await create(existingDocument.trim());
    else {
      try {
        data = await create();
      } catch (err) {
        if (!/CPF ou CNPJ/.test(err.message || "")) throw err;
        const document = await askPaymentDocument();
        if (!document) throw new Error("CPF ou CNPJ necessário para continuar.");
        data = await create(document.trim());
      }
    }
    if (!data.paymentRequired) {
      const completed = await api("/client-gallery/complete", {
        method: "POST",
        body: JSON.stringify({ slug }),
      });
      if (completed.gallery) state.gallery = completed.gallery;
      if (completed.pricing && state.gallery) state.gallery.pricing = completed.pricing;
      renderHeader();
      updatePhotoButtons();
      showToast("Seleção concluída. Fotos em edição.");
      return;
    }
    if (data.pricing) state.gallery.pricing = data.pricing;
    state.pendingPayment = data.payment || null;
    renderHeader();
    openPaymentModal(data.payment, data.pricing || state.gallery.pricing || {});
  } catch (err) {
    showToast(err.message || "Não foi possível gerar o pagamento.");
  } finally {
    completeBtn.disabled = false;
    completeBtn.textContent = "Concluir seleção";
  }
}

pendingPaymentBtn.addEventListener("click", async () => {
  pendingPaymentBtn.disabled = true;
  try {
    const data = await api(`/client-gallery/payment/current?slug=${encodeURIComponent(slug)}`);
    const payment = data.payment;
    state.pendingPayment = payment || null;
    renderHeader();
    if (!payment) {
      showToast("Não há cobrança pendente para esta seleção.");
      return;
    }
    if (payment.status === "approved") {
      showToast("Esta cobrança já foi aprovada. Atualize a galeria para concluir a seleção.");
      return;
    }
    if (payment.ticketUrl || payment.qrCode) {
      openPaymentModal(payment, data.pricing || state.gallery.pricing || {});
      return;
    }
    const document = await askPaymentDocument();
    if (!document) return;
    await createPixPayment(document);
  } catch (err) {
    showToast(err.message || "Não foi possível abrir a cobrança pendente.");
  } finally {
    pendingPaymentBtn.disabled = false;
  }
});

function startPaymentPolling(paymentId) {
  if (state.paymentPoll) clearInterval(state.paymentPoll);

  const check = async () => {
    try {
      const data = await api(`/client-gallery/payment/status?id=${encodeURIComponent(paymentId)}`);
      if (data.payment?.status === "approved" && data.completed) {
        const wasCompleted = hasCompletedSelection();
        state.payment = data.payment;
        if (state.gallery) {
          state.gallery.status = "editing";
          state.gallery.selectionCompletedAt = data.payment.selectionCompletedAt || new Date().toISOString();
          state.gallery.selectionPaymentId = data.payment.id || state.gallery.selectionPaymentId || null;
          state.gallery.pricing = {
            ...(state.gallery.pricing || {}),
            requiresPayment: false,
            extraCount: 0,
            subtotalCents: 0,
            discountCents: 0,
            totalCents: 0,
          };
        }
        clearInterval(state.paymentPoll);
        state.paymentPoll = null;
        renderHeader();
        updatePhotoButtons();
        closePaymentModal();
        showToast(wasCompleted ? "Pagamento aprovado. Fotos em edição." : "Pagamento aprovado. Seleção em edição.");
      } else if (data.payment?.status === "rejected") {
        setPaymentModalState("rejected");
        clearInterval(state.paymentPoll);
        state.paymentPoll = null;
      } else {
        setPaymentModalState("pending");
      }
    } catch (err) {
      setPaymentModalState("pending", err.message || "Aguardando confirmação do pagamento...");
    }
  };

  check();
  state.paymentPoll = setInterval(check, 5000);
}

paymentClose.addEventListener("click", closePaymentModal);
paymentModal.addEventListener("click", (event) => {
  if (event.target === paymentModal) closePaymentModal();
});
copyPaymentCode.addEventListener("click", async () => {
  if (!paymentCode.value) return;
  try {
    await navigator.clipboard.writeText(paymentCode.value);
    showToast("Código Pix copiado.");
  } catch {
    paymentCode.select();
    document.execCommand("copy");
    showToast("Código Pix copiado.");
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
