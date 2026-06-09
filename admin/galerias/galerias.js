const CONFIG = {
  workerUrl: "https://api.marcelconde.com.br",
  tokenKey: "mc_admin_token",
};

const $ = (selector) => document.querySelector(selector);

const state = {
  clients: [],
  galleries: [],
  selectedGallery: null,
  images: [],
  selection: [],
  events: [],
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
const selectionLimit = $("#selectionLimit");
const galleryMessage = $("#galleryMessage");
const watermarkLogo = $("#watermarkLogo");
const watermarkPosition = $("#watermarkPosition");
const watermarkOpacity = $("#watermarkOpacity");
const watermarkSize = $("#watermarkSize");
const watermarkEnabled = $("#watermarkEnabled");
const saveGalleryBtn = $("#saveGalleryBtn");
const openGalleryBtn = $("#openGalleryBtn");
const exportCsvBtn = $("#exportCsvBtn");
const shareLink = $("#shareLink");
const dropzone = $("#dropzone");
const fileInput = $("#fileInput");
const firstAsCover = $("#firstAsCover");
const uploadBtn = $("#uploadBtn");
const uploadQueue = $("#uploadQueue");
const photoGrid = $("#photoGrid");
const eventList = $("#eventList");
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

function fileBaseName(fileName) {
  return String(fileName || "foto")
    .replace(/\.[^.]+$/, "")
    .replace(/\//g, "-")
    .trim() || "foto";
}

function cloudUrl(src, transform) {
  if (!src || !src.includes("/upload/")) return src;
  return src.replace(/\/upload\/(?:[a-z]+_[^,/]+(?:,[a-z]+_[^,/]+)*\/)?/, `/upload/${transform}/`);
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

function renderGalleries() {
  renderStats();
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
    button.addEventListener("click", () => selectGallery(button.dataset.galleryId));
  });
}

function renderSelectedGallery() {
  const gallery = state.selectedGallery;
  renderStats();
  uploadBtn.disabled = !gallery || !fileInput.files.length;

  if (!gallery) {
    galleryTitle.textContent = "Selecione uma galeria";
    galleryMeta.textContent = "Crie ou escolha uma galeria privada para enviar fotos e acompanhar a seleção.";
    openGalleryBtn.classList.add("disabled");
    exportCsvBtn.classList.add("disabled");
    shareLink.textContent = "Crie ou selecione uma galeria para gerar o link do cliente.";
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
  galleryMessage.value = gallery.message || "";
  watermarkLogo.value = gallery.watermark?.logoUrl || "";
  watermarkPosition.value = gallery.watermark?.position || "center";
  watermarkOpacity.value = gallery.watermark?.opacity ?? 0.28;
  watermarkSize.value = gallery.watermark?.size ?? 180;
  watermarkEnabled.checked = gallery.watermark?.enabled !== false;

  const url = galleryUrl(gallery);
  openGalleryBtn.href = url;
  openGalleryBtn.classList.remove("disabled");
  exportCsvBtn.href = "#";
  exportCsvBtn.classList.toggle("disabled", !state.selection.length);
  shareLink.textContent = url;

  renderGalleries();
  renderPhotos();
  renderEvents();
}

function renderPhotos() {
  if (!state.images.length) {
    photoGrid.innerHTML = `<div class="empty-state"><span>Nenhuma foto enviada para esta galeria.</span></div>`;
    return;
  }

  const selected = new Set(state.selection);
  photoGrid.innerHTML = state.images.map((image) => `
    <article class="gallery-photo-card">
      <img src="${escapeHtml(cloudUrl(image.url, "w_400,q_auto,f_auto"))}" alt="${escapeHtml(image.display_name || image.filename || "")}" loading="lazy">
      <div class="gallery-photo-body">
        <strong>${selected.has(image.public_id) ? "♥ " : ""}${escapeHtml(image.filename || image.display_name || "foto")}</strong>
        <small>${escapeHtml(image.public_id || "")}</small>
        <button class="btn btn-danger btn-small" type="button" data-delete-image="${escapeHtml(image.public_id)}">Excluir</button>
      </div>
    </article>
  `).join("");

  photoGrid.querySelectorAll("[data-delete-image]").forEach((button) => {
    button.addEventListener("click", () => deleteImage(button.dataset.deleteImage));
  });
}

function renderEvents() {
  if (!state.events.length) {
    eventList.innerHTML = "";
    return;
  }
  eventList.innerHTML = `
    <div class="content-head">
      <div>
        <span class="eyebrow">Histórico</span>
        <h1 style="font-size: 2.5rem;">Atividades</h1>
      </div>
    </div>
    ${state.events.slice(0, 20).map((event) => `
      <div class="event-row">
        <strong>${escapeHtml(event.action || "evento")}</strong>
        <small>${escapeHtml(formatDate(event.createdAt))} · ${escapeHtml(event.actorEmail || "cliente")}</small>
      </div>
    `).join("")}
  `;
}

async function selectGallery(id) {
  const data = await getJson(`/private/gallery?id=${encodeURIComponent(id)}`);
  state.selectedGallery = data.gallery;
  state.images = data.images || [];
  state.selection = data.selection || [];
  state.events = data.events || [];
  renderSelectedGallery();
}

async function loadData() {
  const me = await getJson("/auth/me");
  currentUserLabel.textContent = me.user?.email || "";
  const data = await getJson("/private/galleries");
  state.clients = data.clients || [];
  state.galleries = data.galleries || [];
  renderClientOptions();
  renderGalleries();

  if (!state.selectedGallery && state.galleries[0]) {
    await selectGallery(state.galleries[0].id);
  } else if (state.selectedGallery) {
    await selectGallery(state.selectedGallery.id);
  } else {
    renderSelectedGallery();
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
  state.selectedGallery = data.gallery;
  await selectGallery(data.gallery.id);
  return data.gallery;
}

quickCreateBtn.addEventListener("click", async () => {
  const title = quickTitle.value.trim();
  if (!title) return showToast("Digite um título para a galeria.");
  quickCreateBtn.disabled = true;
  try {
    await saveGallery({
      title,
      slug: slugify(title),
      message: `Olá,\n\nFoi um prazer registrar este momento especial.\n\nSelecione suas fotos favoritas usando o coração exibido sobre cada imagem.`,
      selectionLimit: 15,
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

galleryName.addEventListener("input", () => {
  if (!state.selectedGallery?.id || !gallerySlug.value.trim()) gallerySlug.value = slugify(galleryName.value);
});

galleryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveGalleryBtn.disabled = true;
  saveGalleryBtn.textContent = "Salvando...";
  try {
    await saveGallery({
      id: state.selectedGallery?.id,
      clientId: galleryClient.value,
      status: galleryStatus.value,
      title: galleryName.value.trim(),
      slug: gallerySlug.value.trim(),
      subtitle: gallerySubtitle.value.trim(),
      message: galleryMessage.value.trim(),
      selectionLimit: Number(selectionLimit.value || 0),
      watermark: {
        enabled: watermarkEnabled.checked,
        logoUrl: watermarkLogo.value.trim(),
        position: watermarkPosition.value,
        opacity: Number(watermarkOpacity.value || 0.28),
        size: Number(watermarkSize.value || 180),
      },
    });
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
  uploadQueue.innerHTML = [...fileInput.files].map((file) => `
    <div class="queue-row" data-file="${escapeHtml(file.name)}">
      <span>${escapeHtml(file.name)}</span>
      <div class="queue-bar"><span></span></div>
    </div>
  `).join("");
}

function setQueueProgress(fileName, percent) {
  const row = [...uploadQueue.querySelectorAll(".queue-row")]
    .find((item) => item.dataset.file === fileName);
  if (row) row.querySelector(".queue-bar span").style.width = `${percent}%`;
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
    for (const [index, file] of files.entries()) {
      setQueueProgress(file.name, 12);
      const signature = await getJson("/private/gallery/upload-signature", {
        method: "POST",
        body: JSON.stringify({
          galleryId: state.selectedGallery.id,
          displayName: fileBaseName(file.name),
          phase: "selection",
        }),
      });
      setQueueProgress(file.name, 35);
      const uploaded = await uploadToCloudinary(signature, file, (percent) => setQueueProgress(file.name, percent));
      await getJson("/private/gallery/register-image", {
        method: "POST",
        body: JSON.stringify({
          galleryId: state.selectedGallery.id,
          public_id: uploaded.public_id,
          url: uploaded.secure_url,
          display_name: uploaded.display_name || fileBaseName(file.name),
          original_filename: uploaded.original_filename || file.name,
          width: uploaded.width,
          height: uploaded.height,
          format: uploaded.format,
          phase: "selection",
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

refreshBtn.addEventListener("click", loadData);

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

loadData().catch((err) => {
  showToast(err.message || "Erro ao carregar galerias.");
});
