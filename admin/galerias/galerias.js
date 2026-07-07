const CONFIG = {
  workerUrl: "https://api.marcelconde.com.br",
  tokenKey: "mc_admin_token",
  cloudinaryUploadLimit: 10 * 1024 * 1024,
  cloudinaryUploadTarget: 8.8 * 1024 * 1024,
};

const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(location.search);
const detailGalleryId = params.get("id") || "";
const galleryListUrl = "/admin/galerias/";

const state = {
  clients: [],
  galleries: [],
  selectedGallery: null,
  images: [],
  selection: [],
  events: [],
  selectedForDeletion: new Set(),
  loadingGallery: false,
};

const currentUserLabel = $("#currentUserLabel");
const statGalleries = $("#statGalleries");
const statPhotos = $("#statPhotos");
const statSelected = $("#statSelected");
const galleryList = $("#galleryList");
const refreshBtn = $("#refreshBtn");
const quickTitle = $("#quickTitle");
const quickCreateBtn = $("#quickCreateBtn");
const galleryTitle = $("#galleryTitle");
const galleryMeta = $("#galleryMeta");
const gallerySlugLabel = $("#gallerySlugLabel");
const galleryForm = $("#galleryForm");
const galleryClient = $("#galleryClient");
const galleryStatus = $("#galleryStatus");
const galleryName = $("#galleryName");
const gallerySlug = $("#gallerySlug");
const gallerySubtitle = $("#gallerySubtitle");
const selectionLimitField = $("#selectionLimitField");
const selectionLimit = $("#selectionLimit");
const extraPhotoPriceField = $("#extraPhotoPriceField");
const extraPhotoPrice = $("#extraPhotoPrice");
const allPhotosDiscountField = $("#allPhotosDiscountField");
const allPhotosDiscount = $("#allPhotosDiscount");
const quantityDiscountField = $("#quantityDiscountField");
const quantityDiscountEnabled = $("#quantityDiscountEnabled");
const quantityDiscountMinPhotos = $("#quantityDiscountMinPhotos");
const quantityDiscountPercent = $("#quantityDiscountPercent");
const galleryMessage = $("#galleryMessage");
const watermarkLogo = $("#watermarkLogo");
const watermarkFile = $("#watermarkFile");
const watermarkUploadBtn = $("#watermarkUploadBtn");
const watermarkPreview = $("#watermarkPreview");
const watermarkPreviewText = $("#watermarkPreviewText");
const watermarkStatus = $("#watermarkStatus");
const watermarkPosition = $("#watermarkPosition");
const watermarkPositionGrid = $("#watermarkPositionGrid");
const watermarkOpacity = $("#watermarkOpacity");
const watermarkOpacityValue = $("#watermarkOpacityValue");
const watermarkSize = $("#watermarkSize");
const watermarkSizeValue = $("#watermarkSizeValue");
const watermarkEnabled = $("#watermarkEnabled");
const saveGalleryBtn = $("#saveGalleryBtn");
const publishGalleryBtn = $("#publishGalleryBtn");
const openGalleryBtn = $("#openGalleryBtn");
const exportCsvBtn = $("#exportCsvBtn");
const pruneUnselectedBtn = $("#pruneUnselectedBtn");
const deleteGalleryBtn = $("#deleteGalleryBtn");
const selectionLogPanel = $("#selectionLogPanel");
const selectionLogSummary = $("#selectionLogSummary");
const selectionLogList = $("#selectionLogList");
const shareLink = $("#shareLink");
const photoBulkActions = $("#photoBulkActions");
const bulkCount = $("#bulkCount");
const selectAllPhotosBtn = $("#selectAllPhotosBtn");
const clearSelectedPhotosBtn = $("#clearSelectedPhotosBtn");
const deleteSelectedPhotosBtn = $("#deleteSelectedPhotosBtn");
const dropzone = $("#dropzone");
const fileInput = $("#fileInput");
const firstAsCover = $("#firstAsCover");
const uploadBtn = $("#uploadBtn");
const uploadQueue = $("#uploadQueue");
const photoGrid = $("#photoGrid");
const eventList = $("#eventList");
const toastEl = $("#toast");
const detailNavButtons = document.querySelectorAll("[data-detail-section]");
const detailSections = document.querySelectorAll(".detail-section");

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

function fileBaseName(fileName) {
  return String(fileName || "foto")
    .replace(/\.[^.]+$/, "")
    .replace(/\//g, "-")
    .trim() || "foto";
}

function jpgFileName(fileName) {
  return `${fileBaseName(fileName)}.jpg`;
}

function formatFileSize(bytes = 0) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function cloudUrl(src, transform) {
  if (!src || !src.includes("/upload/")) return src;
  return src.replace(/\/upload\/(?:[a-z]+_[^,/]+(?:,[a-z]+_[^,/]+)*\/)?/, `/upload/${transform}/`);
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler esta imagem para otimizar o upload."));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Não foi possível gerar uma versão otimizada da imagem."));
        return;
      }
      resolve(blob);
    }, "image/jpeg", quality);
  });
}

async function compressImageFile(file, maxEdge, quality) {
  const img = await loadImageFile(file);
  const longestSide = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const scale = Math.min(1, maxEdge / longestSide);
  const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);
  return canvasToBlob(canvas, quality);
}

async function preparePhotoForCloudinary(file, onStatus = () => {}) {
  if (file.size <= CONFIG.cloudinaryUploadTarget) return file;
  if (!file.type.startsWith("image/")) {
    throw new Error(`${file.name} tem ${formatFileSize(file.size)} e passa do limite de 10 MB do Cloudinary.`);
  }

  onStatus(`Arquivo com ${formatFileSize(file.size)}. Otimizando para caber no limite de 10 MB...`);

  const attempts = [
    { maxEdge: 6400, quality: 0.92 },
    { maxEdge: 6000, quality: 0.9 },
    { maxEdge: 5600, quality: 0.9 },
    { maxEdge: 5200, quality: 0.88 },
    { maxEdge: 4800, quality: 0.88 },
    { maxEdge: 4400, quality: 0.86 },
    { maxEdge: 4000, quality: 0.84 },
    { maxEdge: 3600, quality: 0.82 },
    { maxEdge: 3200, quality: 0.8 },
    { maxEdge: 2800, quality: 0.8 },
    { maxEdge: 2400, quality: 0.8 },
  ];

  let bestBlob = null;
  for (const attempt of attempts) {
    const blob = await compressImageFile(file, attempt.maxEdge, attempt.quality);
    if (blob.size <= CONFIG.cloudinaryUploadTarget) {
      if (!bestBlob || blob.size > bestBlob.size) bestBlob = blob;
      if (blob.size >= 8 * 1024 * 1024) {
        onStatus(`Otimizada para ${formatFileSize(blob.size)} com ${Math.round(attempt.quality * 100)}% de qualidade.`);
        return new File([blob], jpgFileName(file.name), {
          type: "image/jpeg",
          lastModified: file.lastModified,
        });
      }
    }
  }

  if (bestBlob) {
    onStatus(`Otimizada para ${formatFileSize(bestBlob.size)} com qualidade mínima de 80%.`);
    return new File([bestBlob], jpgFileName(file.name), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  }

  for (const attempt of attempts) {
    const blob = await compressImageFile(file, attempt.maxEdge, attempt.quality);
    if (blob.size <= CONFIG.cloudinaryUploadLimit) {
      onStatus(`Otimizada para ${formatFileSize(blob.size)} com ${Math.round(attempt.quality * 100)}% de qualidade.`);
      return new File([blob], jpgFileName(file.name), {
        type: "image/jpeg",
        lastModified: file.lastModified,
      });
    }
  }

  throw new Error(`${file.name} continua acima de 10 MB mesmo mantendo 80% de qualidade. Exporte em JPG menor ou use um limite maior no Cloudinary.`);
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function centsToCurrencyInput(cents = 0) {
  const value = Number(cents || 0) / 100;
  return value ? value.toFixed(2).replace(".", ",") : "";
}

function currencyInputToCents(value = "") {
  const normalized = String(value || "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Math.max(0, Math.round((Number.isFinite(parsed) ? parsed : 0) * 100));
}

function normalizeDiscount(value = 0) {
  const parsed = Number(value || 0);
  return Math.max(0, Math.min(Number.isFinite(parsed) ? parsed : 0, 95));
}

function updateWatermarkValues() {
  watermarkOpacityValue.textContent = formatPercent(watermarkOpacity.value || 0.28);
  watermarkSizeValue.textContent = `${Number(watermarkSize.value || 180)}px`;
}

function updateWatermarkPosition(value = "center") {
  watermarkPosition.value = value;
  watermarkPositionGrid.querySelectorAll("[data-watermark-position]").forEach((button) => {
    button.classList.toggle("active", button.dataset.watermarkPosition === value);
  });
}

function renderWatermarkPreview() {
  const logoUrl = watermarkLogo.value.trim();
  watermarkUploadBtn.classList.toggle("has-image", Boolean(logoUrl));
  watermarkPreview.style.backgroundImage = logoUrl ? `url("${logoUrl}")` : "";
  watermarkPreview.style.opacity = Number(watermarkOpacity.value || 0.28);
  watermarkPreview.style.backgroundSize = `${Math.min(Number(watermarkSize.value || 180), 220)}px auto`;
  watermarkPreview.className = `watermark-preview-img ${watermarkPosition.value || "center"}`;
  watermarkPreviewText.textContent = logoUrl ? "Trocar marca d'água" : "Subir marca d'água";
  if (!watermarkStatus.dataset.uploading) {
    watermarkStatus.textContent = logoUrl
      ? "Imagem salva na galeria. Ajuste posição, opacidade e tamanho ao lado."
      : "PNG ou JPG, de preferência com fundo transparente.";
  }
}

function formatDate(value) {
  if (!value) return "sem data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "sem data";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function imageLabel(publicId = "") {
  const image = state.images.find((item) => item.public_id === publicId);
  return image?.filename || image?.display_name || String(publicId || "").split("/").pop() || "foto";
}

function isSelectionChangeEvent(event = {}) {
  return [
    "favoritar_foto",
    "remover_favorito",
    "selecionar_todas",
    "concluir_selecao",
    "pix_criado",
    "pix_aprovado",
  ].includes(event.action);
}

function selectionEventTitle(event = {}) {
  const details = event.details || {};
  if (event.action === "favoritar_foto") return details.wasSelectionCompleted ? "Foto adicionada após confirmação" : "Foto marcada";
  if (event.action === "remover_favorito") return details.wasSelectionCompleted ? "Foto removida após confirmação" : "Foto removida";
  if (event.action === "selecionar_todas") return "Cliente selecionou todas";
  if (event.action === "concluir_selecao") return "Seleção concluída";
  if (event.action === "pix_criado") return "Pix gerado para fotos extras";
  if (event.action === "pix_aprovado") return "Pix aprovado";
  return event.action || "Evento";
}

function selectionEventPhotoIds(event = {}) {
  const details = event.details || {};
  return [
    ...(details.addedPublicIds || []),
    ...(details.removedPublicIds || []),
    ...(details.addedSinceLastConfirmation || []),
    ...(details.removedSinceLastConfirmation || []),
    details.publicId,
  ].filter(Boolean);
}

function selectionEventDetail(event = {}) {
  const details = event.details || {};
  const added = [...new Set([...(details.addedPublicIds || []), ...(details.addedSinceLastConfirmation || [])])];
  const removed = [...new Set([...(details.removedPublicIds || []), ...(details.removedSinceLastConfirmation || [])])];

  if (event.action === "concluir_selecao") {
    return `${Number(details.totalSelected || 0)} foto(s) confirmada(s).`;
  }
  if (event.action === "selecionar_todas") {
    return `${Number(details.totalSelected || 0)} foto(s) selecionada(s).`;
  }
  if (event.action === "pix_criado" || event.action === "pix_aprovado") {
    const amount = Number(details.amountCents || details.pricing?.totalCents || 0) / 100;
    return amount ? `Valor: R$ ${amount.toFixed(2).replace(".", ",")}.` : "Pagamento relacionado à seleção.";
  }
  if (added.length || removed.length) {
    const parts = [];
    if (added.length) parts.push(`Adicionou: ${added.map(imageLabel).join(", ")}`);
    if (removed.length) parts.push(`Removeu: ${removed.map(imageLabel).join(", ")}`);
    return parts.join(" · ");
  }
  if (details.publicId) return imageLabel(details.publicId);
  return "Alteração registrada.";
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toastEl.classList.remove("show"), 3200);
}

function activateDetailSection(sectionId) {
  if (!detailSections.length) return;
  detailSections.forEach((section) => {
    section.hidden = section.id !== sectionId;
  });
  detailNavButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.detailSection === sectionId);
  });
}

function clearGalleryMediaState() {
  state.images = [];
  state.selection = [];
  state.events = [];
  state.selectedForDeletion.clear();
}

function syncDeletionSelection() {
  const validIds = new Set(state.images.map((image) => image.public_id).filter(Boolean));
  state.selectedForDeletion.forEach((publicId) => {
    if (!validIds.has(publicId)) state.selectedForDeletion.delete(publicId);
  });
}

function renderPhotoBulkActions() {
  if (!photoBulkActions) return;

  const total = state.images.length;
  const count = state.selectedForDeletion.size;
  photoBulkActions.hidden = !state.selectedGallery || !total;
  if (photoBulkActions.hidden) return;

  bulkCount.textContent = count
    ? `${count} foto${count > 1 ? "s" : ""} selecionada${count > 1 ? "s" : ""} para excluir.`
    : "Selecione fotos para excluir em lote.";

  selectAllPhotosBtn.textContent = count === total ? "Desmarcar todas" : "Selecionar todas";
  selectAllPhotosBtn.disabled = !total;
  clearSelectedPhotosBtn.disabled = !count;
  deleteSelectedPhotosBtn.disabled = !count;
}

function syncDeletionSelectionToDom() {
  photoGrid.querySelectorAll("[data-select-image]").forEach((input) => {
    const checked = state.selectedForDeletion.has(input.dataset.selectImage);
    input.checked = checked;
    input.closest(".gallery-photo-card")?.classList.toggle("marked", checked);
  });
  renderPhotoBulkActions();
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

function galleryUrl(gallery = state.selectedGallery) {
  if (!gallery?.slug) return "#";
  return `${location.origin}/clientes/galeria/?slug=${encodeURIComponent(gallery.slug)}`;
}

function renderClientOptions() {
  galleryClient.innerHTML = [
    `<option value="">Sem cliente vinculado</option>`,
    ...state.clients.map((client) => `
      <option value="${escapeHtml(client.id)}">${escapeHtml(client.name || client.email || "Cliente")}</option>
    `),
  ].join("");
}

function renderStats() {
  statGalleries.textContent = state.galleries.length;
  statPhotos.textContent = state.images.length;
  statSelected.textContent = state.selection.length;
}

function updateGalleryStatusUi() {
  const isSelection = galleryStatus.value === "selection";
  [
    selectionLimitField,
    extraPhotoPriceField,
    allPhotosDiscountField,
    quantityDiscountField,
  ].forEach((field) => {
    if (field) field.hidden = !isSelection;
  });
  publishGalleryBtn.textContent = galleryStatus.value === "final"
    ? "Enviar entrega final"
    : "Publicar e enviar";
}

function renderGalleries() {
  renderStats();
  if (!galleryList) return;
  if (!state.galleries.length) {
    galleryList.innerHTML = `<div class="empty-state"><span>Nenhuma galeria privada criada.</span></div>`;
    return;
  }

  galleryList.innerHTML = state.galleries.map((gallery) => {
    const client = state.clients.find((item) => item.id === gallery.clientId);
    const active = state.selectedGallery?.id === gallery.id ? " active" : "";
    return `
      <button class="private-list-item${active}" type="button" data-gallery-id="${escapeHtml(gallery.id)}">
        <strong>${escapeHtml(gallery.title || "Galeria")}</strong>
        <small>${escapeHtml(client?.name || "sem cliente")} · ${escapeHtml(gallery.status || "selection")}</small>
        <small>/clientes/galeria/?slug=${escapeHtml(gallery.slug || "")}</small>
      </button>
    `;
  }).join("");

  galleryList.querySelectorAll("[data-gallery-id]").forEach((button) => {
    button.addEventListener("click", () => {
      location.href = `/admin/galerias/detalhe/?id=${encodeURIComponent(button.dataset.galleryId)}`;
    });
  });
}

function renderSelectedGallery() {
  const gallery = state.selectedGallery;
  renderStats();
  uploadBtn.disabled = !gallery || !fileInput.files.length;

  if (!gallery) {
    galleryTitle.textContent = "Selecione uma galeria";
    galleryMeta.textContent = "Crie ou escolha uma galeria privada para enviar fotos e acompanhar a seleção.";
    [
      selectionLimitField,
      extraPhotoPriceField,
      allPhotosDiscountField,
      quantityDiscountField,
    ].forEach((field) => {
      if (field) field.hidden = false;
    });
    openGalleryBtn.classList.add("disabled");
    publishGalleryBtn.classList.add("disabled");
    publishGalleryBtn.disabled = true;
    exportCsvBtn.classList.add("disabled");
    pruneUnselectedBtn.classList.add("disabled");
    pruneUnselectedBtn.disabled = true;
    deleteGalleryBtn.classList.add("disabled");
    deleteGalleryBtn.disabled = true;
    selectionLogPanel.hidden = true;
    selectionLogSummary.textContent = "";
    selectionLogList.innerHTML = "";
    shareLink.textContent = "Crie ou selecione uma galeria para gerar o link do cliente.";
    photoGrid.innerHTML = "";
    eventList.innerHTML = "";
    renderPhotoBulkActions();
    return;
  }

  const client = state.clients.find((item) => item.id === gallery.clientId);
  galleryTitle.textContent = gallery.title || "Galeria privada";
  galleryMeta.textContent = `${client?.name || "Sem cliente"} · ${state.images.length} fotos · ${state.selection.length}/${gallery.selectionLimit || 0} selecionadas`;
  gallerySlugLabel.textContent = `clientes/${gallery.slug}`;

  galleryClient.value = gallery.clientId || "";
  galleryStatus.value = gallery.status || "selection";
  galleryName.value = gallery.title || "";
  gallerySlug.value = gallery.slug || "";
  gallerySubtitle.value = gallery.subtitle || "";
  selectionLimit.value = gallery.selectionLimit || 15;
  extraPhotoPrice.value = centsToCurrencyInput(gallery.extraPhotoPriceCents || 0);
  allPhotosDiscount.value = gallery.allPhotosDiscountPercent || 0;
  quantityDiscountEnabled.checked = gallery.quantityDiscountEnabled === true;
  quantityDiscountMinPhotos.value = gallery.quantityDiscountMinPhotos || 0;
  quantityDiscountPercent.value = gallery.quantityDiscountPercent || 0;
  galleryMessage.value = gallery.message || "";
  updateGalleryStatusUi();
  watermarkLogo.value = gallery.watermark?.logoUrl || "";
  watermarkOpacity.value = gallery.watermark?.opacity ?? 0.28;
  watermarkSize.value = gallery.watermark?.size ?? 180;
  watermarkEnabled.checked = gallery.watermark?.enabled !== false;
  updateWatermarkPosition(gallery.watermark?.position || "center");
  updateWatermarkValues();
  renderWatermarkPreview();

  const url = galleryUrl(gallery);
  openGalleryBtn.href = url;
  openGalleryBtn.classList.remove("disabled");
  publishGalleryBtn.classList.remove("disabled");
  publishGalleryBtn.disabled = false;
  exportCsvBtn.href = "#";
  exportCsvBtn.classList.toggle("disabled", !state.selection.length);
  const removableCount = state.images.filter((image) => !state.selection.includes(image.public_id) && image.phase !== "final").length;
  pruneUnselectedBtn.classList.toggle("disabled", !state.selection.length || !removableCount);
  pruneUnselectedBtn.disabled = !state.selection.length || !removableCount;
  pruneUnselectedBtn.textContent = removableCount ? `Remover ${removableCount} não selecionadas` : "Remover não selecionadas";
  deleteGalleryBtn.classList.remove("disabled");
  deleteGalleryBtn.disabled = false;
  shareLink.textContent = url;

  renderGalleries();
  renderSelectionLog();
  renderPhotos();
  renderEvents();
}

function renderPhotos() {
  if (state.loadingGallery) {
    state.selectedForDeletion.clear();
    photoGrid.innerHTML = `<div class="empty-state"><span>Carregando fotos desta galeria...</span></div>`;
    renderPhotoBulkActions();
    return;
  }

  if (!state.images.length) {
    state.selectedForDeletion.clear();
    photoGrid.innerHTML = `<div class="empty-state"><span>Nenhuma foto enviada para esta galeria.</span></div>`;
    renderPhotoBulkActions();
    return;
  }

  syncDeletionSelection();
  const selected = new Set(state.selection);
  const deleting = state.selectedForDeletion;
  photoGrid.innerHTML = state.images.map((image) => `
    <article class="gallery-photo-card${deleting.has(image.public_id) ? " marked" : ""}" data-public-id="${escapeHtml(image.public_id || "")}">
      <label class="photo-select" title="Selecionar foto">
        <input type="checkbox" data-select-image="${escapeHtml(image.public_id)}" aria-label="Selecionar foto" ${deleting.has(image.public_id) ? "checked" : ""}>
        <span>Selecionar</span>
      </label>
      <img src="${escapeHtml(cloudUrl(image.url, "w_400,q_auto,f_auto"))}" alt="${escapeHtml(image.display_name || image.filename || "")}" loading="lazy" decoding="async">
      <div class="gallery-photo-body">
        <strong>${selected.has(image.public_id) ? "♥ " : ""}${escapeHtml(image.filename || image.display_name || "foto")}</strong>
        <small>${escapeHtml(image.public_id || "")}</small>
        <button class="btn btn-danger btn-small" type="button" data-delete-image="${escapeHtml(image.public_id)}">Excluir</button>
      </div>
    </article>
  `).join("");

  renderPhotoBulkActions();
}

function renderEvents() {
  if (!state.events.length) {
    eventList.innerHTML = `<div class="empty-state"><span>Nenhuma atividade registrada.</span></div>`;
    return;
  }
  eventList.innerHTML = `
    <div class="event-list-inner">
      ${state.events.slice(0, 40).map((event) => `
        <div class="event-row">
          <strong>${escapeHtml(event.action || "evento")}</strong>
          <small>${escapeHtml(formatDate(event.createdAt))} · ${escapeHtml(event.actorEmail || "cliente")}</small>
        </div>
      `).join("")}
    </div>
  `;
}

function renderSelectionLog() {
  const entries = state.events.filter(isSelectionChangeEvent);
  selectionLogPanel.hidden = !state.selectedGallery;

  if (!state.selectedGallery) {
    selectionLogSummary.textContent = "";
    selectionLogList.innerHTML = "";
    return;
  }

  const changedAfterConfirmation = entries.some((event) => {
    const details = event.details || {};
    return Boolean(details.wasSelectionCompleted) ||
      (details.addedSinceLastConfirmation || []).length > 0 ||
      (details.removedSinceLastConfirmation || []).length > 0;
  });
  selectionLogSummary.textContent = entries.length
    ? `${entries.length} registro(s)${changedAfterConfirmation ? " · houve alteração após confirmação" : ""}`
    : "Sem alterações registradas";

  if (!entries.length) {
    selectionLogList.innerHTML = `
      <div class="selection-log-empty">
        Nenhuma alteração de seleção registrada para esta galeria.
      </div>
    `;
    return;
  }

  selectionLogList.innerHTML = entries.slice(0, 16).map((event) => {
    const details = event.details || {};
    const isRevision = Boolean(details.wasSelectionCompleted) ||
      (details.addedSinceLastConfirmation || []).length > 0 ||
      (details.removedSinceLastConfirmation || []).length > 0;
    const photoIds = [...new Set(selectionEventPhotoIds(event))].slice(0, 8);
    return `
      <article class="selection-log-row${isRevision ? " is-revision" : ""}">
        <div>
          <strong>${escapeHtml(selectionEventTitle(event))}</strong>
          <span>${escapeHtml(selectionEventDetail(event))}</span>
          ${photoIds.length ? `
            <div class="selection-log-files">
              ${photoIds.map((publicId) => `<em>${escapeHtml(imageLabel(publicId))}</em>`).join("")}
            </div>
          ` : ""}
        </div>
        <small>${escapeHtml(formatDate(event.createdAt))}<br>${escapeHtml(event.actorEmail || event.actorName || "cliente")}</small>
      </article>
    `;
  }).join("");
}

async function selectGallery(id) {
  if (state.selectedGallery?.id !== id) {
    state.selectedGallery = state.galleries.find((gallery) => gallery.id === id) || null;
    clearGalleryMediaState();
    state.loadingGallery = true;
    eventList.innerHTML = "";
    renderSelectedGallery();
  }

  try {
    const data = await getJson(`/private/gallery?id=${encodeURIComponent(id)}`);
    state.selectedGallery = data.gallery;
    state.images = data.images || [];
    state.selection = data.selection || [];
    state.events = data.events || [];
    state.selectedForDeletion.clear();
  } finally {
    state.loadingGallery = false;
    renderSelectedGallery();
  }
}

async function loadData() {
  const me = await getJson("/auth/me");
  currentUserLabel.textContent = me.user?.email || "";
  const data = await getJson("/private/galleries");
  state.clients = data.clients || [];
  state.galleries = data.galleries || [];
  renderClientOptions();
  renderGalleries();

  if (detailGalleryId) {
    const exists = state.galleries.some((gallery) => gallery.id === detailGalleryId);
    if (!exists) {
      state.selectedGallery = null;
      clearGalleryMediaState();
      renderSelectedGallery();
      galleryTitle.textContent = "Galeria não encontrada";
      galleryMeta.textContent = "Volte para a lista de galerias e selecione uma galeria válida.";
      showToast("Galeria não encontrada.");
      return;
    }
    await selectGallery(detailGalleryId);
  } else if (state.selectedGallery) {
    await selectGallery(state.selectedGallery.id);
  } else {
    location.href = galleryListUrl;
  }
}

async function saveGallery(payload) {
  const data = await getJson("/private/galleries", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const existingIndex = state.galleries.findIndex((gallery) => gallery.id === data.gallery.id);
  if (existingIndex >= 0) state.galleries[existingIndex] = data.gallery;
  else state.galleries.unshift(data.gallery);

  if (existingIndex < 0) {
    state.selectedGallery = null;
    clearGalleryMediaState();
  }

  await selectGallery(data.gallery.id);
  return data.gallery;
}

function currentGalleryPayload() {
  return {
    id: state.selectedGallery?.id,
    clientId: galleryClient.value,
    status: galleryStatus.value,
    title: galleryName.value.trim(),
    slug: gallerySlug.value.trim(),
    subtitle: gallerySubtitle.value.trim(),
    message: galleryMessage.value.trim(),
    selectionLimit: Number(selectionLimit.value || 0),
    extraPhotoPriceCents: currencyInputToCents(extraPhotoPrice.value),
    allPhotosDiscountPercent: normalizeDiscount(allPhotosDiscount.value),
    quantityDiscountEnabled: quantityDiscountEnabled.checked,
    quantityDiscountMinPhotos: Number(quantityDiscountMinPhotos.value || 0),
    quantityDiscountPercent: normalizeDiscount(quantityDiscountPercent.value),
    watermark: {
      enabled: watermarkEnabled.checked,
      logoUrl: watermarkLogo.value.trim(),
      position: watermarkPosition.value,
      opacity: Number(watermarkOpacity.value || 0.28),
      size: Number(watermarkSize.value || 180),
    },
  };
}

quickCreateBtn?.addEventListener("click", async () => {
  const title = quickTitle.value.trim();
  if (!title) return showToast("Digite um título para a galeria.");
  quickCreateBtn.disabled = true;
  try {
    await saveGallery({
      title,
      slug: slugify(title),
      message: `Olá,\n\nFoi um prazer registrar este momento especial.\n\nSelecione suas fotos favoritas usando o coração exibido sobre cada imagem.`,
      selectionLimit: 15,
      extraPhotoPriceCents: 0,
      allPhotosDiscountPercent: 0,
      quantityDiscountEnabled: false,
      quantityDiscountMinPhotos: 0,
      quantityDiscountPercent: 0,
      watermark: { enabled: true, opacity: 0.28, size: 180, position: "center" },
    });
    quickTitle.value = "";
    showToast("Galeria criada.");
  } catch (err) {
    showToast(err.message || "Erro ao criar galeria.");
  } finally {
    quickCreateBtn.disabled = false;
  }
});

watermarkUploadBtn.addEventListener("click", () => watermarkFile.click());

watermarkFile.addEventListener("change", async () => {
  const file = watermarkFile.files?.[0];
  if (!file) return;

  watermarkUploadBtn.disabled = true;
  watermarkStatus.dataset.uploading = "1";
  watermarkStatus.textContent = "Enviando marca d'água...";

  try {
    const signature = await getJson("/private/watermark/upload-signature", {
      method: "POST",
      body: JSON.stringify({ displayName: fileBaseName(file.name) }),
    });
    const uploaded = await uploadToCloudinary(signature, file, (percent) => {
      watermarkStatus.textContent = `Enviando marca d'água... ${Math.round(percent)}%`;
    });

    watermarkLogo.value = uploaded.secure_url || uploaded.url || "";
    watermarkEnabled.checked = true;
    showToast("Marca d'água enviada. Salve a galeria para aplicar.");
  } catch (err) {
    showToast(err.message || "Erro ao enviar marca d'água.");
  } finally {
    watermarkUploadBtn.disabled = false;
    watermarkFile.value = "";
    delete watermarkStatus.dataset.uploading;
    updateWatermarkValues();
    renderWatermarkPreview();
  }
});

watermarkPositionGrid.querySelectorAll("[data-watermark-position]").forEach((button) => {
  button.addEventListener("click", () => {
    updateWatermarkPosition(button.dataset.watermarkPosition);
    renderWatermarkPreview();
  });
});

watermarkOpacity.addEventListener("input", () => {
  updateWatermarkValues();
  renderWatermarkPreview();
});

watermarkSize.addEventListener("input", () => {
  updateWatermarkValues();
  renderWatermarkPreview();
});

galleryName.addEventListener("input", () => {
  if (!state.selectedGallery?.id || !gallerySlug.value.trim()) gallerySlug.value = slugify(galleryName.value);
});

galleryStatus.addEventListener("change", () => {
  updateGalleryStatusUi();
  renderQueue();
});

extraPhotoPrice.addEventListener("blur", () => {
  extraPhotoPrice.value = centsToCurrencyInput(currencyInputToCents(extraPhotoPrice.value));
});

galleryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveGalleryBtn.disabled = true;
  saveGalleryBtn.textContent = "Salvando...";
  try {
    await saveGallery(currentGalleryPayload());
    showToast("Galeria salva.");
  } catch (err) {
    showToast(err.message || "Erro ao salvar galeria.");
  } finally {
    saveGalleryBtn.disabled = false;
    saveGalleryBtn.textContent = "Salvar galeria";
  }
});

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragover");
  });
});

dropzone.addEventListener("drop", (event) => {
  fileInput.files = event.dataTransfer.files;
  renderQueue();
});

fileInput.addEventListener("change", renderQueue);

function renderQueue() {
  uploadBtn.disabled = !state.selectedGallery || !fileInput.files.length;
  const phaseLabel = galleryStatus.value === "final" ? "Entrega final" : "Seleção";
  uploadQueue.innerHTML = [...fileInput.files].map((file) => `
    <div class="queue-row" data-file="${escapeHtml(file.name)}">
      <div>
        <span>${escapeHtml(file.name)}</span>
        <small>${escapeHtml(phaseLabel)} · ${escapeHtml(formatFileSize(file.size))}${file.size > CONFIG.cloudinaryUploadTarget ? " · otimização até ~9 MB" : ""}</small>
      </div>
      <div class="queue-bar"><span></span></div>
    </div>
  `).join("");
}

function setQueueProgress(fileName, percent) {
  const row = [...uploadQueue.querySelectorAll(".queue-row")]
    .find((item) => item.dataset.file === fileName);
  if (row) row.querySelector(".queue-bar span").style.width = `${percent}%`;
}

function setQueueNote(fileName, message) {
  const row = [...uploadQueue.querySelectorAll(".queue-row")]
    .find((item) => item.dataset.file === fileName);
  const note = row?.querySelector("small");
  if (note) note.textContent = message;
}

function uploadToCloudinary(signature, file, onProgress) {
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", signature.apiKey);
  form.append("signature", signature.signature);
  Object.entries(signature.params).forEach(([key, value]) => form.append(key, value));

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", signature.uploadUrl, true);
    xhr.timeout = 180000;
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.min(92, 35 + Math.round((event.loaded / event.total) * 57)));
    };
    xhr.onload = () => {
      const data = JSON.parse(xhr.responseText || "{}");
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(data?.error?.message || `Cloudinary ${xhr.status}`));
        return;
      }
      resolve(data);
    };
    xhr.onerror = () => reject(new Error("Falha de conexão ao enviar para o Cloudinary."));
    xhr.ontimeout = () => reject(new Error("Upload demorou demais e foi interrompido."));
    xhr.send(form);
  });
}

uploadBtn.addEventListener("click", async () => {
  const files = [...fileInput.files];
  if (!state.selectedGallery || !files.length) return;

  uploadBtn.disabled = true;
  uploadBtn.textContent = "Enviando...";

  try {
    const phase = galleryStatus.value === "final" ? "final" : "selection";
    for (const [index, file] of files.entries()) {
      setQueueProgress(file.name, 12);
      const uploadFile = await preparePhotoForCloudinary(file, (message) => setQueueNote(file.name, message));
      setQueueProgress(file.name, 20);
      const signature = await getJson("/private/gallery/upload-signature", {
        method: "POST",
        body: JSON.stringify({
          galleryId: state.selectedGallery.id,
          displayName: fileBaseName(file.name),
          phase,
        }),
      });
      setQueueProgress(file.name, 35);
      const uploaded = await uploadToCloudinary(signature, uploadFile, (percent) => setQueueProgress(file.name, percent));
      await getJson("/private/gallery/register-image", {
        method: "POST",
        body: JSON.stringify({
          galleryId: state.selectedGallery.id,
          public_id: uploaded.public_id,
          url: uploaded.secure_url,
          display_name: uploaded.display_name || fileBaseName(file.name),
          original_filename: file.name,
          width: uploaded.width,
          height: uploaded.height,
          format: uploaded.format,
          phase,
          useAsCover: firstAsCover.checked && index === 0,
        }),
      });
      setQueueProgress(file.name, 100);
    }

    fileInput.value = "";
    uploadQueue.innerHTML = "";
    await selectGallery(state.selectedGallery.id);
    showToast("Upload concluído.");
  } catch (err) {
    showToast(err.message || "Erro no upload.");
  } finally {
    uploadBtn.disabled = !fileInput.files.length;
    uploadBtn.textContent = "Enviar fotos";
  }
});

async function deleteImage(publicId) {
  if (!state.selectedGallery || !publicId) return;
  if (!confirm("Excluir esta foto da galeria privada e do Cloudinary?")) return;
  try {
    await getJson("/private/gallery/delete-image", {
      method: "POST",
      body: JSON.stringify({ galleryId: state.selectedGallery.id, publicId }),
    });
    await selectGallery(state.selectedGallery.id);
    showToast("Foto excluída.");
  } catch (err) {
    showToast(err.message || "Erro ao excluir foto.");
  }
}

async function deleteSelectedImages() {
  if (!state.selectedGallery || !state.selectedForDeletion.size) return;
  const publicIds = Array.from(state.selectedForDeletion);
  const confirmed = confirm(
    `Excluir ${publicIds.length} foto${publicIds.length > 1 ? "s" : ""} selecionada${publicIds.length > 1 ? "s" : ""} da galeria privada e do Cloudinary?\n\n` +
    "Esta ação não pode ser desfeita."
  );
  if (!confirmed) return;

  deleteSelectedPhotosBtn.disabled = true;
  deleteSelectedPhotosBtn.textContent = "Excluindo...";

  try {
    const data = await getJson("/private/gallery/delete-images", {
      method: "POST",
      body: JSON.stringify({ galleryId: state.selectedGallery.id, publicIds }),
    });
    state.selectedForDeletion.clear();
    await selectGallery(state.selectedGallery.id);
    const deleted = data.deleted ?? publicIds.length;
    const failed = Array.isArray(data.failed) ? data.failed.length : 0;
    showToast(failed
      ? `${deleted} excluída${deleted === 1 ? "" : "s"}; ${failed} ${failed === 1 ? "falhou" : "falharam"}.`
      : `${deleted} foto${deleted === 1 ? "" : "s"} excluída${deleted === 1 ? "" : "s"}.`);
  } catch (err) {
    showToast(err.message || "Erro ao excluir fotos selecionadas.");
  } finally {
    deleteSelectedPhotosBtn.textContent = "Excluir selecionadas";
    renderPhotoBulkActions();
  }
}

selectAllPhotosBtn.addEventListener("click", () => {
  if (!state.images.length) return;
  if (state.selectedForDeletion.size === state.images.length) {
    state.selectedForDeletion.clear();
  } else {
    state.images.forEach((image) => {
      if (image.public_id) state.selectedForDeletion.add(image.public_id);
    });
  }
  syncDeletionSelectionToDom();
});

clearSelectedPhotosBtn.addEventListener("click", () => {
  state.selectedForDeletion.clear();
  syncDeletionSelectionToDom();
});

deleteSelectedPhotosBtn.addEventListener("click", deleteSelectedImages);

photoGrid.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-image]");
  if (!deleteButton) return;
  deleteImage(deleteButton.dataset.deleteImage);
});

photoGrid.addEventListener("change", (event) => {
  const input = event.target.closest("[data-select-image]");
  if (!input) return;
  const publicId = input.dataset.selectImage;
  if (input.checked) state.selectedForDeletion.add(publicId);
  else state.selectedForDeletion.delete(publicId);
  input.closest(".gallery-photo-card")?.classList.toggle("marked", input.checked);
  renderPhotoBulkActions();
});

deleteGalleryBtn.addEventListener("click", async () => {
  if (!state.selectedGallery) return;
  const title = state.selectedGallery.title || "galeria";
  const confirmed = confirm(
    `Apagar definitivamente a galeria "${title}"?\n\n` +
    "As fotos vinculadas também serão removidas do Cloudinary. Esta ação não pode ser desfeita."
  );
  if (!confirmed) return;

  deleteGalleryBtn.disabled = true;
  deleteGalleryBtn.textContent = "Apagando...";

  try {
    const deletedId = state.selectedGallery.id;
    const data = await getJson("/private/gallery/delete", {
      method: "POST",
      body: JSON.stringify({ galleryId: deletedId }),
    });

    state.galleries = state.galleries.filter((gallery) => gallery.id !== deletedId);
    state.selectedGallery = null;
    clearGalleryMediaState();
    location.href = galleryListUrl;

    const failed = Array.isArray(data.failedImages) ? data.failedImages.length : 0;
    showToast(failed
      ? `Galeria apagada. ${failed} foto${failed === 1 ? "" : "s"} não foi removida${failed === 1 ? "" : "s"} do Cloudinary.`
      : "Galeria apagada.");
  } catch (err) {
    showToast(err.message || "Erro ao apagar galeria.");
  } finally {
    deleteGalleryBtn.textContent = "Apagar galeria";
    if (state.selectedGallery) renderSelectedGallery();
  }
});

refreshBtn?.addEventListener("click", loadData);

exportCsvBtn.addEventListener("click", async (event) => {
  event.preventDefault();
  if (!state.selectedGallery || !state.selection.length) return;
  try {
    const res = await workerFetch(`/private/gallery/export-selected?id=${encodeURIComponent(state.selectedGallery.id)}`);
    if (!res.ok) throw new Error("Erro ao exportar CSV.");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${state.selectedGallery.slug || "galeria"}-selecionadas.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    showToast(err.message || "Erro ao exportar CSV.");
  }
});

publishGalleryBtn.addEventListener("click", async () => {
  if (!state.selectedGallery) return;
  let client = state.clients.find((item) => item.id === galleryClient.value);
  if (!client?.email) {
    showToast("Vincule um cliente com e-mail antes de publicar.");
    return;
  }

  publishGalleryBtn.disabled = true;
  publishGalleryBtn.textContent = "Salvando...";

  try {
    const savedGallery = await saveGallery(currentGalleryPayload());
    client = state.clients.find((item) => item.id === savedGallery.clientId) || client;
    publishGalleryBtn.disabled = true;
    publishGalleryBtn.textContent = "Enviando...";

    const data = await getJson("/private/gallery/publish", {
      method: "POST",
      body: JSON.stringify({
        galleryId: savedGallery.id,
        status: savedGallery.status || galleryStatus.value,
      }),
    });

    if (data.gallery) state.selectedGallery = data.gallery;
    await selectGallery(state.selectedGallery.id);

    if (data.emailQueued) {
      showToast(data.emailType === "final_delivery"
        ? `Entrega final enviada para ${client.email}.`
        : `Galeria publicada. E-mail enviado para ${client.email}.`);
    } else if (data.emailType === "final_delivery") {
      showToast(`Entrega final salva, mas o e-mail não foi enviado: ${data.emailError || "verifique o Resend"}`);
    } else if (data.emailType === "login_access") {
      showToast(`Galeria publicada, mas o e-mail de login não foi enviado: ${data.emailError || "verifique o Resend"}`);
    } else {
      showToast(`Convite criado, mas o e-mail não foi enviado: ${data.emailError || "verifique o Resend"}`);
    }
  } catch (err) {
    showToast(err.message || "Erro ao publicar galeria.");
  } finally {
    publishGalleryBtn.disabled = false;
    updateGalleryStatusUi();
  }
});

pruneUnselectedBtn.addEventListener("click", async () => {
  if (!state.selectedGallery) return;
  const removableCount = state.images.filter((image) => !state.selection.includes(image.public_id) && image.phase !== "final").length;
  if (!state.selection.length) {
    showToast("Nenhuma foto foi selecionada pelo cliente.");
    return;
  }
  if (!removableCount) {
    showToast("Não há fotos não selecionadas para remover.");
    return;
  }

  const confirmed = confirm(
    `Apagar ${removableCount} fotos não selecionadas desta galeria e do Cloudinary?\n\n` +
    `As ${state.selection.length} fotos selecionadas serão mantidas. Esta ação não pode ser desfeita.`
  );
  if (!confirmed) return;

  pruneUnselectedBtn.disabled = true;
  pruneUnselectedBtn.textContent = "Removendo...";

  try {
    const data = await getJson("/private/gallery/prune-unselected", {
      method: "POST",
      body: JSON.stringify({ galleryId: state.selectedGallery.id }),
    });
    await selectGallery(state.selectedGallery.id);
    showToast(`${data.removed || removableCount} fotos não selecionadas foram removidas.`);
  } catch (err) {
    showToast(err.message || "Erro ao remover fotos não selecionadas.");
  } finally {
    pruneUnselectedBtn.disabled = false;
    renderSelectedGallery();
  }
});

detailNavButtons.forEach((button) => {
  button.addEventListener("click", () => activateDetailSection(button.dataset.detailSection));
});

loadData().catch((err) => {
  showToast(err.message || "Erro ao carregar galerias.");
});
