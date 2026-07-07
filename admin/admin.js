const CONFIG = {
  workerUrl: "https://api.marcelconde.com.br",
  tokenKey: "mc_admin_token",
  adminEmail: "marcel.conde@hotmail.com",
};

const state = {
  albums: [],
  selectedPath: "",
  selectedSlug: "",
  images: [],
  likesByIndex: {},
  likesByAsset: {},
  coverPublicId: "",
  deletedPublicIds: new Set(),
  currentUser: null,
  loading: false,
};

const $ = (selector) => document.querySelector(selector);

const loginScreen = $("#loginScreen");
const adminShell = $("#adminShell");
const loginForm = $("#loginForm");
const loginBtn = $("#loginBtn");
const loginMsg = $("#loginMsg");
const loginEmail = $("#loginEmail");
const loginPassword = $("#loginPassword");
const togglePassword = $("#togglePassword");
const forgotLink = $("#forgotLink");
const forgotForm = $("#forgotForm");
const forgotEmail = $("#forgotEmail");
const forgotBtn = $("#forgotBtn");
const forgotMsg = $("#forgotMsg");
const backToLogin = $("#backToLogin");
const resetForm = $("#resetForm");
const resetPassword = $("#resetPassword");
const resetPasswordConfirm = $("#resetPasswordConfirm");
const resetBtn = $("#resetBtn");
const resetMsg = $("#resetMsg");
const inviteAcceptForm = $("#inviteAcceptForm");
const inviteAcceptCopy = $("#inviteAcceptCopy");
const inviteName = $("#inviteName");
const invitePassword = $("#invitePassword");
const invitePasswordConfirm = $("#invitePasswordConfirm");
const inviteAcceptBtn = $("#inviteAcceptBtn");
const inviteAcceptMsg = $("#inviteAcceptMsg");
const logoutBtn = $("#logoutBtn");
const albumList = $("#albumList");
const albumTitle = $("#albumTitle");
const albumMeta = $("#albumMeta");
const albumPathLabel = $("#albumPathLabel");
const photoGrid = $("#photoGrid");
const emptyState = $("#emptyState");
const fileInput = $("#fileInput");
const dropzone = $("#dropzone");
const uploadBtn = $("#uploadBtn");
const uploadQueue = $("#uploadQueue");
const firstAsCover = $("#firstAsCover");
const singleDisplayName = $("#singleDisplayName");
const newAlbumName = $("#newAlbumName");
const newAlbumParent = $("#newAlbumParent");
const newAlbumTarget = $("#newAlbumTarget");
const createAlbumBtn = $("#createAlbumBtn");
const viewAlbumBtn = $("#viewAlbumBtn");
const clearCacheBtn = $("#clearCacheBtn");
const deleteAlbumBtn = $("#deleteAlbumBtn");
const toastEl = $("#toast");
const likedGrid = $("#likedGrid");
const currentUserLabel = $("#currentUserLabel");
const inviteEmail = $("#inviteEmail");
const inviteRole = $("#inviteRole");
const inviteBtn = $("#inviteBtn");
const inviteMsg = $("#inviteMsg");
const usersList = $("#usersList");
const invitesList = $("#invitesList");
const auditList = $("#auditList");

function getToken() {
  return sessionStorage.getItem(CONFIG.tokenKey) || "";
}

function setToken(token) {
  sessionStorage.setItem(CONFIG.tokenKey, token);
}

function clearToken() {
  sessionStorage.removeItem(CONFIG.tokenKey);
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toastEl.classList.remove("show"), 3200);
}

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

function albumSlug(path) {
  return String(path || "").replace(/^portfolio\//, "");
}

function albumName(path) {
  const parts = String(path || "").split("/").filter(Boolean);
  return parts[parts.length - 1] || "Álbum";
}

function fileBaseName(fileName) {
  return String(fileName || "foto")
    .replace(/\.[^.]+$/, "")
    .replace(/\//g, "-")
    .trim() || "foto";
}

function safeAlbumName(value) {
  return String(value || "")
    .replace(/\//g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function albumDepth(path) {
  const parts = String(path || "").split("/").filter(Boolean);
  return Math.max(parts.length - 2, 0);
}

function newAlbumParentPath() {
  if (newAlbumParent?.value === "selected" && state.selectedPath) return state.selectedPath;
  return "portfolio";
}

function updateNewAlbumTarget() {
  if (!newAlbumParent || !newAlbumTarget) return;
  const selectedOption = [...newAlbumParent.options].find((option) => option.value === "selected");
  if (selectedOption) selectedOption.disabled = !state.selectedPath;
  if (!state.selectedPath && newAlbumParent.value === "selected") newAlbumParent.value = "portfolio";
  newAlbumTarget.textContent = `Destino: ${newAlbumParentPath()}`;
}

function effectiveCoverPublicId() {
  const ids = new Set(state.images.map((image) => image.public_id).filter(Boolean));
  if (state.coverPublicId && ids.has(state.coverPublicId)) return state.coverPublicId;
  return state.images[0]?.public_id || "";
}

async function mapLimit(items, limit, mapper) {
  const output = new Array(items.length);
  let index = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (index < items.length) {
      const current = index++;
      output[current] = await mapper(items[current], current);
    }
  });
  await Promise.all(workers);
  return output;
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

  const res = await fetch(CONFIG.workerUrl + path, { ...options, headers });
  if (res.status === 401) {
    clearToken();
    showLogin("Sessão inválida. Entre novamente.");
  }
  return res;
}

async function postJson(path, payload) {
  const url = `${CONFIG.workerUrl}${path}`;
  const body = JSON.stringify(payload || {});

  try {
    const res = await fetch(url, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  } catch (fetchErr) {
    return new Promise((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url, true);
        xhr.timeout = 15000;
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.onload = () => {
          let data = {};
          try { data = JSON.parse(xhr.responseText || "{}"); } catch {}
          resolve({
            res: {
              ok: xhr.status >= 200 && xhr.status < 300,
              status: xhr.status,
            },
            data,
          });
        };
        xhr.onerror = () => reject(new Error(`fetch falhou e XHR também falhou: ${fetchErr.message}`));
        xhr.ontimeout = () => reject(new Error("tempo limite ao conectar com a API"));
        xhr.send(body);
      } catch (xhrErr) {
        reject(new Error(`${fetchErr.message}; fallback XHR: ${xhrErr.message}`));
      }
    });
  }
}

async function getJson(path, options = {}) {
  const res = await workerFetch(path, options);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

function showLogin(message = "") {
  state.currentUser = null;
  currentUserLabel.textContent = "";
  adminShell.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  loginForm.classList.remove("hidden");
  forgotForm.classList.add("hidden");
  resetForm.classList.add("hidden");
  inviteAcceptForm.classList.add("hidden");
  loginMsg.textContent = message;
  loginEmail.value = localStorage.getItem("mc_admin_email") || "";
  loginPassword.value = "";
  (loginEmail.value ? loginPassword : loginEmail).focus();
}

function isAdminUser() {
  const userEmail = String(state.currentUser?.email || "").toLowerCase();
  return state.currentUser?.role === "admin" || userEmail === CONFIG.adminEmail.toLowerCase();
}

function applyRoleVisibility() {
  const canManageAccess = isAdminUser();
  document.querySelectorAll('[data-admin-only="true"]').forEach((element) => {
    element.classList.toggle("hidden", !canManageAccess);
  });

  const activeRestrictedTab = document.querySelector('.tab.active[data-admin-only="true"]');
  if (activeRestrictedTab && !canManageAccess) {
    document.querySelector('.tab[data-view="albumsView"]')?.click();
  }
}

function showAdmin() {
  loginScreen.classList.add("hidden");
  adminShell.classList.remove("hidden");
  currentUserLabel.textContent = state.currentUser?.email || "";
  applyRoleVisibility();
}

async function validateSession() {
  const res = await workerFetch("/auth/me");
  if (!res.ok) {
    clearToken();
    return false;
  }
  const data = await res.json().catch(() => ({}));
  state.currentUser = data.user || null;
  return true;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = loginEmail.value.trim();
  const password = loginPassword.value;
  if (!email || !password) return;

  loginBtn.disabled = true;
  loginBtn.textContent = "Entrando...";
  loginMsg.textContent = "";

  try {
    const { res, data } = await postJson("/auth/login", { email, password });
    if (!res.ok) {
      loginMsg.textContent = data.error || "E-mail ou senha inválidos.";
      loginPassword.value = "";
      loginPassword.focus();
      return;
    }
    localStorage.setItem("mc_admin_email", email);
    state.currentUser = data.user || null;
    setToken(data.token);
    showAdmin();
    await loadAlbums(true);
  } catch (err) {
    clearToken();
    loginMsg.textContent = "Não consegui conectar ao Worker.";
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Entrar";
  }
});

togglePassword.addEventListener("click", () => {
  const showing = loginPassword.type === "text";
  loginPassword.type = showing ? "password" : "text";
  togglePassword.textContent = showing ? "Mostrar" : "Ocultar";
});

forgotLink.addEventListener("click", () => {
  loginForm.classList.add("hidden");
  resetForm.classList.add("hidden");
  inviteAcceptForm.classList.add("hidden");
  forgotForm.classList.remove("hidden");
  forgotEmail.value = loginEmail.value || localStorage.getItem("mc_admin_email") || "";
  forgotMsg.textContent = "";
  (forgotEmail.value ? forgotBtn : forgotEmail).focus();
});

backToLogin.addEventListener("click", () => showLogin());

forgotForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = forgotEmail.value.trim();
  if (!email) return;

  forgotBtn.disabled = true;
  forgotBtn.textContent = "Enviando...";
  forgotMsg.textContent = "";
  forgotMsg.classList.remove("success");

  try {
    const { res, data } = await postJson("/auth/forgot", { email });
    if (!res.ok) {
      forgotMsg.textContent = data.detail || data.error || "Erro ao enviar. Verifique o Resend no Worker.";
      forgotMsg.classList.remove("success");
      return;
    }
    forgotMsg.textContent = data.emailQueued
      ? "Link de redefinição enviado para o seu e-mail."
      : "Se esse e-mail existir no admin, você receberá o link em breve.";
    forgotMsg.classList.add("success");
  } catch (err) {
    forgotMsg.textContent = "Erro ao enviar. Tente novamente.";
    forgotMsg.classList.remove("success");
  } finally {
    forgotBtn.disabled = false;
    forgotBtn.textContent = "Enviar link";
  }
});

resetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const params = new URLSearchParams(window.location.search);
  const token = params.get("reset") || "";
  const password = resetPassword.value;
  const passwordConfirm = resetPasswordConfirm.value;

  resetMsg.classList.remove("success");
  if (password !== passwordConfirm) {
    resetMsg.textContent = "As senhas não coincidem.";
    return;
  }
  if (password.length < 6) {
    resetMsg.textContent = "A senha precisa ter pelo menos 6 caracteres.";
    return;
  }

  resetBtn.disabled = true;
  resetBtn.textContent = "Salvando...";
  resetMsg.textContent = "";

  try {
    const { res, data } = await postJson("/auth/reset", { token, password });
    if (!res.ok) {
      resetMsg.textContent = data.error || "Token inválido ou expirado.";
      return;
    }
    resetMsg.classList.add("success");
    resetMsg.textContent = "Senha redefinida. Você já pode entrar.";
    window.history.replaceState({}, "", "/admin/");
    setTimeout(() => showLogin(), 1400);
  } catch (err) {
    resetMsg.textContent = `Erro de conexão com a API. Recarregue a página e tente novamente. (${err?.message || "falha no fetch"})`;
  } finally {
    resetBtn.disabled = false;
    resetBtn.textContent = "Salvar nova senha";
  }
});

logoutBtn.addEventListener("click", async () => {
  await workerFetch("/auth/logout", { method: "POST" }).catch(() => {});
  clearToken();
  showLogin();
});

document.querySelectorAll(".tab[data-view]").forEach((tab) => {
  tab.addEventListener("click", async () => {
    if (tab.dataset.adminOnly === "true" && !isAdminUser()) return;

    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".view").forEach((view) => view.classList.add("hidden"));
    tab.classList.add("active");
    document.getElementById(tab.dataset.view).classList.remove("hidden");
    if (tab.dataset.view === "likesView") await loadLikesOverview();
    if (tab.dataset.view === "usersView") await loadUsersView();
    if (tab.dataset.view === "auditView") await loadAuditLogs();
  });
});

async function fetchAlbumsAt(path) {
  const qs = path ? `?path=${encodeURIComponent(path)}&refresh=1` : "?refresh=1";
  const res = await fetch(`${CONFIG.workerUrl}/albums${qs}`);
  if (!res.ok) return [];
  return res.json();
}

async function fetchAlbumTree(path = "portfolio", depth = -1, parent = "") {
  const folders = await fetchAlbumsAt(path);
  const rows = await Promise.all(folders.map(async (album) => {
    const current = { ...album, depth: depth + 1, parent };
    const children = current.depth >= 5
      ? []
      : await fetchAlbumTree(album.path, current.depth, album.slug);
    return [current, ...children];
  }));
  return rows.flat();
}

async function loadAlbums(forceRefresh = false) {
  albumList.innerHTML = `<div class="album-item"><strong>Carregando...</strong></div>`;

  state.albums = (await fetchAlbumTree("portfolio"))
    .sort((a, b) => a.path.localeCompare(b.path, "pt-BR"));
  renderAlbumList();
  updateNewAlbumTarget();

  if (!state.selectedPath && state.albums.length) {
    await selectAlbum(state.albums[0].path);
  } else if (state.selectedPath && forceRefresh) {
    await selectAlbum(state.selectedPath);
  }
}

function renderAlbumList() {
  if (!state.albums.length) {
    albumList.innerHTML = `<div class="album-item"><strong>Nenhum álbum</strong><small>Crie um nome e envie fotos.</small></div>`;
    return;
  }

  albumList.innerHTML = state.albums.map((album) => `
    <button class="album-item ${album.path === state.selectedPath ? "active" : ""}" data-path="${escapeHtml(album.path)}" type="button">
      <span class="album-copy" style="padding-left:${Math.min(album.depth || 0, 5) * 16}px">
        <strong>${escapeHtml(albumName(album.path))}</strong>
        <small>${escapeHtml(album.path)}</small>
      </span>
      <span class="album-kind">${album.depth ? "Sub" : "Top"}</span>
    </button>
  `).join("");

  albumList.querySelectorAll(".album-item[data-path]").forEach((btn) => {
    btn.addEventListener("click", () => selectAlbum(btn.dataset.path));
  });
}

async function selectAlbum(path) {
  state.selectedPath = path;
  state.selectedSlug = albumSlug(path);
  state.images = [];
  state.likesByIndex = {};
  state.likesByAsset = {};
  state.coverPublicId = "";

  renderAlbumList();
  albumTitle.textContent = albumName(path);
  albumPathLabel.textContent = path;
  albumMeta.textContent = "Carregando fotos...";
  photoGrid.innerHTML = "";
  emptyState.classList.add("hidden");
  uploadBtn.disabled = !fileInput.files.length;
  clearCacheBtn.disabled = false;
  deleteAlbumBtn.disabled = !path || path === "portfolio";
  viewAlbumBtn.classList.remove("disabled");
  viewAlbumBtn.href = `/categoria.html?slug=${encodeURIComponent(state.selectedSlug)}`;
  updateNewAlbumTarget();

  try {
    const [album, likes] = await Promise.all([
      fetch(`${CONFIG.workerUrl}/album?path=${encodeURIComponent(path)}&refresh=1`).then((r) => r.ok ? r.json() : { images: [] }),
      getJson(`/likes?album=${encodeURIComponent(state.selectedSlug)}`),
    ]);

    state.images = (album.images || [])
      .filter(Boolean)
      .filter((image) => !state.deletedPublicIds.has(image.public_id));
    state.coverPublicId = album.cover_public_id || album.cover_debug?.public_id || "";

    if (likes._authorized) {
      const { _authorized, _byAsset = {}, ...byIndex } = likes;
      state.likesByIndex = byIndex;
      state.likesByAsset = _byAsset || {};
    }

    renderPhotos();
    updateStats();
  } catch (err) {
    albumMeta.textContent = "Erro ao carregar este álbum.";
    showToast("Erro ao carregar álbum.");
  }
}

function totalLikesForImage(image, index) {
  const byAsset = image.public_id ? Number(state.likesByAsset[image.public_id] || 0) : 0;
  const byIndex = Number(state.likesByIndex[String(index)] || 0);
  return Math.max(byAsset, byIndex);
}

function renderPhotos() {
  const totalLikes = state.images.reduce((sum, img, index) => sum + totalLikesForImage(img, index), 0);
  const coverPublicId = effectiveCoverPublicId();
  albumMeta.textContent = `${state.images.length} foto${state.images.length === 1 ? "" : "s"} · ${totalLikes} curtida${totalLikes === 1 ? "" : "s"}`;

  emptyState.classList.toggle("hidden", state.images.length > 0);

  photoGrid.innerHTML = state.images.map((image, index) => {
    const likes = totalLikesForImage(image, index);
    const displayName = image.display_name || image.filename || `foto-${index + 1}`;
    const isCover = image.public_id && image.public_id === coverPublicId;
    const src = cloudUrl(image.url, "f_auto,q_auto,w_520,h_390,c_fill");
    const safeName = escapeHtml(displayName);
    const safePublicId = escapeHtml(image.public_id || "");
    const safeUrl = escapeHtml(image.url || "");

    return `
      <article class="photo-card" data-index="${index}">
        <div class="photo-thumb">
          ${isCover ? `<span class="badge">Capa</span>` : ""}
          ${likes ? `<span class="like-badge">♥ ${likes}</span>` : ""}
          <img src="${escapeHtml(src)}" alt="${safeName}" loading="lazy" decoding="async">
        </div>
        <div class="photo-info">
          <strong title="${safeName}">${safeName}</strong>
          <code title="${safePublicId}">${safePublicId || "sem public_id"}</code>
        </div>
        <div class="photo-actions">
          <button class="btn btn-ghost" data-action="cover" type="button">Definir capa</button>
          <button class="btn btn-ghost" data-action="rename" type="button">Renomear</button>
          <a class="btn btn-ghost" href="${safeUrl}" target="_blank" rel="noopener">Ver</a>
          <button class="btn btn-danger" data-action="delete" type="button">Excluir</button>
        </div>
      </article>
    `;
  }).join("");

  photoGrid.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".photo-card");
      const image = state.images[Number(card.dataset.index)];
      const action = btn.dataset.action;
      if (action === "cover") return setAlbumCover(image);
      if (action === "rename") return renameImage(image);
      if (action === "delete") return deleteImage(image);
    });
  });
}

function updateStats() {
  const allPhotos = state.images.length;
  const albumCount = state.albums.length;
  const likes = state.images.reduce((sum, img, index) => sum + totalLikesForImage(img, index), 0);
  $("#statAlbums").textContent = albumCount;
  $("#statPhotos").textContent = allPhotos;
  $("#statLikes").textContent = likes;
}

$("#refreshAlbumsBtn").addEventListener("click", () => loadAlbums(true));
newAlbumParent?.addEventListener("change", updateNewAlbumTarget);

createAlbumBtn.addEventListener("click", async () => {
  const name = safeAlbumName(newAlbumName.value);
  if (!name) return;

  const parentPath = newAlbumParentPath();
  const path = `${parentPath.replace(/\/+$/, "")}/${name}`;
  createAlbumBtn.disabled = true;
  createAlbumBtn.textContent = "Criando...";

  try {
    const res = await workerFetch("/admin/create-folder", {
      method: "POST",
      body: JSON.stringify({ path }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Falha ao criar álbum.");

    if (!state.albums.some((album) => album.path === path)) {
      state.albums.push({ slug: name, path, depth: albumDepth(path), parent: albumName(parentPath) });
      state.albums.sort((a, b) => a.path.localeCompare(b.path, "pt-BR"));
    }

    renderAlbumList();
    newAlbumName.value = "";
    await selectAlbum(path);
    showToast(data.existed ? "Álbum já existia." : "Álbum criado.");
    await loadAlbums(true);
  } catch (err) {
    showToast(err.message || "Erro ao criar álbum.");
  } finally {
    createAlbumBtn.disabled = false;
    createAlbumBtn.textContent = "Criar";
  }
});

clearCacheBtn.addEventListener("click", async () => {
  if (!state.selectedPath) return;
  clearCacheBtn.disabled = true;
  try {
    await workerFetch("/admin/clear-cache", {
      method: "POST",
      body: JSON.stringify({ path: state.selectedPath }),
    });
    showToast("Cache limpo para este álbum.");
  } finally {
    clearCacheBtn.disabled = false;
  }
});

deleteAlbumBtn.addEventListener("click", deleteSelectedAlbum);

async function deleteSelectedAlbum() {
  if (!state.selectedPath || state.selectedPath === "portfolio") return;

  const name = albumName(state.selectedPath);
  const typed = prompt(
    `Isso vai apagar definitivamente o álbum "${name}", todas as fotos dentro dele e subálbuns.\n\nDigite exatamente ${name} para confirmar:`
  );
  if (typed !== name) {
    if (typed !== null) showToast("Nome diferente. Álbum não apagado.");
    return;
  }

  deleteAlbumBtn.disabled = true;
  deleteAlbumBtn.textContent = "Apagando...";

  try {
    const res = await workerFetch("/admin/delete-album", {
      method: "POST",
      body: JSON.stringify({ path: state.selectedPath }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Falha ao apagar álbum.");

    showToast(`Álbum apagado. ${data.images || 0} foto(s) removida(s).`);
    state.selectedPath = "";
    state.selectedSlug = "";
    state.images = [];
    photoGrid.innerHTML = "";
    await loadAlbums(true);
  } catch (err) {
    showToast(err.message || "Erro ao apagar álbum.");
  } finally {
    deleteAlbumBtn.disabled = !state.selectedPath;
    deleteAlbumBtn.textContent = "Apagar álbum";
  }
}

fileInput.addEventListener("change", () => {
  uploadBtn.disabled = !state.selectedPath || !fileInput.files.length;
  renderSelectedQueue();
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
  uploadBtn.disabled = !state.selectedPath || !fileInput.files.length;
  renderSelectedQueue();
});

function renderSelectedQueue() {
  const files = [...fileInput.files];
  uploadQueue.innerHTML = files.map((file) => `
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
      const percent = 35 + Math.round((event.loaded / event.total) * 57);
      onProgress(Math.min(percent, 92));
    };

    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText || "{}"); } catch {}

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(data?.error?.message || `Upload falhou no Cloudinary (${xhr.status}).`));
        return;
      }

      resolve(data);
    };

    xhr.onerror = () => reject(new Error("Falha de conexão ao enviar para o Cloudinary."));
    xhr.ontimeout = () => reject(new Error("O upload demorou demais e foi interrompido. Tente uma foto menor ou uma conexão mais estável."));
    xhr.send(form);
  });
}

uploadBtn.addEventListener("click", async () => {
  const files = [...fileInput.files];
  if (!state.selectedPath || !files.length) return;

  uploadBtn.disabled = true;
  uploadBtn.textContent = "Enviando...";

  try {
    for (const [index, file] of files.entries()) {
      const typedName = singleDisplayName.value.trim();
      const displayName = files.length === 1 && typedName ? typedName : fileBaseName(file.name);

      setQueueProgress(file.name, 12);
      const signature = await getJson("/admin/upload-signature", {
        method: "POST",
        body: JSON.stringify({
          folderPath: state.selectedPath,
          displayName,
        }),
      });

      setQueueProgress(file.name, 35);
      const uploaded = await uploadToCloudinary(signature, file, (percent) => {
        setQueueProgress(file.name, percent);
      });

      if (firstAsCover.checked && index === 0 && uploaded.public_id) {
        await setCoverByPublicId(uploaded.public_id, true);
      }

      setQueueProgress(file.name, 100);
    }

    await workerFetch("/admin/clear-cache", {
      method: "POST",
      body: JSON.stringify({ path: state.selectedPath }),
    });

    fileInput.value = "";
    singleDisplayName.value = "";
    uploadQueue.innerHTML = "";
    showToast("Upload concluído.");
    await loadAlbums(true);
  } catch (err) {
    showToast(err.message || "Erro no upload.");
  } finally {
    uploadBtn.disabled = !fileInput.files.length;
    uploadBtn.textContent = "Enviar fotos";
  }
});

async function updateImageDisplayName(image, displayName) {
  if (!image?.public_id) return;
  const res = await workerFetch("/admin/update-image", {
    method: "POST",
    body: JSON.stringify({
      public_id: image.public_id,
      albumPath: state.selectedPath,
      displayName,
    }),
  });
  if (!res.ok) throw new Error("Falha ao renomear.");
}

async function setCoverByPublicId(publicId, silent = false) {
  if (!publicId || !state.selectedPath) return;

  const res = await workerFetch("/admin/set-cover", {
    method: "POST",
    body: JSON.stringify({
      albumPath: state.selectedPath,
      public_id: publicId,
    }),
  });

  if (res.status === 404 || res.status === 405) {
    throw new Error("Worker desatualizado. Cole o worker.js novo na Cloudflare.");
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Falha ao definir capa.");
  }

  const data = await res.json().catch(() => ({}));
  state.coverPublicId = data.cover_public_id || publicId;
  state.images = [
    ...state.images.filter((image) => image.public_id === state.coverPublicId),
    ...state.images.filter((image) => image.public_id !== state.coverPublicId),
  ];
  renderPhotos();
  if (!silent) showToast("Capa atualizada.");
}

async function setAlbumCover(selectedImage) {
  if (!selectedImage?.public_id) return;

  try {
    await setCoverByPublicId(selectedImage.public_id);
    await selectAlbum(state.selectedPath);
  } catch (err) {
    showToast(err.message || "Erro ao atualizar capa.");
  }
}

function renameImage(image) {
  const current = image.display_name || image.filename || "";
  const next = prompt("Novo nome exibido no Cloudinary:", current);
  if (!next || next.trim() === current) return;
  updateImageDisplayName(image, next.trim())
    .then(() => {
      showToast("Nome atualizado.");
      return selectAlbum(state.selectedPath);
    })
    .catch((err) => showToast(err.message || "Erro ao atualizar imagem."));
}

async function deleteImage(image) {
  if (!image?.public_id) return;
  const ok = confirm(`Excluir definitivamente esta imagem?\n\n${image.display_name || image.public_id}`);
  if (!ok) return;

  try {
    const res = await workerFetch("/admin/delete-image", {
      method: "POST",
      body: JSON.stringify({
        public_id: image.public_id,
        albumPath: state.selectedPath,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Falha ao excluir.");

    state.deletedPublicIds.add(image.public_id);
    state.images = state.images.filter((item) => item.public_id !== image.public_id);
    if (state.coverPublicId === image.public_id) {
      state.coverPublicId = state.images[0]?.public_id || "";
    }
    renderPhotos();
    updateStats();

    showToast("Imagem excluída.");
    await selectAlbum(state.selectedPath);
  } catch (err) {
    showToast(err.message || "Erro ao excluir imagem.");
  }
}

async function loadLikesOverview() {
  likedGrid.innerHTML = `<div class="liked-card"><div class="liked-info"><strong>Carregando curtidas...</strong></div></div>`;
  if (!state.albums.length) await loadAlbums(false);

  const rows = [];
  await mapLimit(state.albums, 4, async (album) => {
    try {
      const slug = albumSlug(album.path);
      const [albumData, likesData] = await Promise.all([
        fetch(`${CONFIG.workerUrl}/album?path=${encodeURIComponent(album.path)}&refresh=1`).then((r) => r.ok ? r.json() : { images: [] }),
        getJson(`/likes?album=${encodeURIComponent(slug)}`),
      ]);

      if (!likesData._authorized) return;
      const byAsset = likesData._byAsset || {};
      const { _authorized, _byAsset, ...byIndex } = likesData;

      (albumData.images || []).forEach((image, index) => {
        const count = Math.max(
          Number(image.public_id ? byAsset[image.public_id] || 0 : 0),
          Number(byIndex[String(index)] || 0)
        );
        if (count > 0) rows.push({ album, image, index, count });
      });
    } catch {
      // Mantém o painel responsivo mesmo se um álbum falhar na API.
    }
  });

  rows.sort((a, b) => b.count - a.count);
  $("#statLikes").textContent = rows.reduce((sum, row) => sum + row.count, 0);

  if (!rows.length) {
    likedGrid.innerHTML = `<div class="liked-card"><div class="liked-info"><strong>Nenhuma curtida registrada ainda.</strong><code>As curtidas aparecerão aqui depois que visitantes clicarem no coração.</code></div></div>`;
    return;
  }

  likedGrid.innerHTML = rows.map((row) => {
    const title = row.image.display_name || row.image.filename || row.image.public_id;
    const href = `/categoria.html?slug=${encodeURIComponent(albumSlug(row.album.path))}`;
    const safeTitle = escapeHtml(title);
    const safePublicId = escapeHtml(row.image.public_id || "");
    return `
      <article class="liked-card">
        <div class="liked-thumb">
          <span class="like-badge">♥ ${row.count}</span>
          <img src="${escapeHtml(cloudUrl(row.image.url, "f_auto,q_auto,w_360,h_360,c_fill"))}" alt="${safeTitle}" loading="lazy" decoding="async">
        </div>
        <div class="liked-info">
          <span class="eyebrow">${escapeHtml(albumName(row.album.path))}</span>
          <strong>${safeTitle}</strong>
          <code>${safePublicId}</code>
          <div class="liked-actions">
            <a class="btn btn-ghost" href="${escapeHtml(href)}" target="_blank" rel="noopener">Abrir álbum</a>
            <button class="btn btn-ghost" data-path="${escapeHtml(row.album.path)}" type="button">Editar</button>
          </div>
        </div>
      </article>
    `;
  }).join("");

  likedGrid.querySelectorAll("button[data-path]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document.querySelector('[data-view="albumsView"]').click();
      await selectAlbum(btn.dataset.path);
    });
  });
}

$("#refreshLikesBtn").addEventListener("click", loadLikesOverview);

async function loadUsersView() {
  usersList.innerHTML = `<div class="admin-row"><div><strong>Carregando usuários...</strong></div></div>`;
  invitesList.innerHTML = `<div class="admin-row"><div><strong>Carregando convites...</strong></div></div>`;

  try {
    const [usersData, invitesData] = await Promise.all([
      getJson("/auth/users"),
      getJson("/auth/invites"),
    ]);

    renderUsers(usersData.users || []);
    renderInvites(invitesData.invites || []);
  } catch (err) {
    usersList.innerHTML = `<div class="admin-row"><div><strong>Erro ao carregar usuários.</strong><small>Verifique se o Worker atualizado está publicado.</small></div></div>`;
    invitesList.innerHTML = "";
  }
}

function renderUsers(users) {
  if (!users.length) {
    usersList.innerHTML = `<div class="admin-row"><div><strong>Nenhum usuário cadastrado.</strong></div></div>`;
    return;
  }

  const currentEmail = state.currentUser?.email || "";
  usersList.innerHTML = users.map((user) => {
    const email = escapeHtml(user.email || "");
    const isCurrent = user.email === currentEmail;
    const isMain = user.email === CONFIG.adminEmail;
    return `
      <div class="admin-row">
        <div>
          <strong>${escapeHtml(user.name || user.email)}</strong>
          <small>${email}</small>
          <small>Criado em ${escapeHtml(formatDate(user.createdAt))}</small>
        </div>
        <div>
          <span class="role-badge">${escapeHtml(user.role || "editor")}</span>
          ${(!isCurrent && !isMain) ? `<button class="btn btn-danger btn-small" data-delete-user="${email}" type="button">Remover</button>` : ""}
        </div>
      </div>
    `;
  }).join("");

  usersList.querySelectorAll("[data-delete-user]").forEach((btn) => {
    btn.addEventListener("click", () => deleteUser(btn.dataset.deleteUser));
  });
}

function renderInvites(invites) {
  if (!invites.length) {
    invitesList.innerHTML = `<div class="admin-row"><div><strong>Nenhum convite enviado.</strong></div></div>`;
    return;
  }

  invitesList.innerHTML = invites.map((invite) => {
    const status = invite.usedAt ? "Aceito" : invite.expired ? "Expirado" : "Pendente";
    const statusClass = invite.usedAt ? "used" : invite.expired ? "expired" : "";
    return `
      <div class="admin-row">
        <div>
          <strong>${escapeHtml(invite.email)}</strong>
          <small>${escapeHtml(invite.role || "editor")} · enviado em ${escapeHtml(formatDate(invite.createdAt))}</small>
          <small>Expira em ${escapeHtml(formatDate(invite.expiresAt))}</small>
        </div>
        <span class="status-badge ${statusClass}">${status}</span>
      </div>
    `;
  }).join("");
}

inviteBtn?.addEventListener("click", async () => {
  const email = inviteEmail.value.trim();
  const role = inviteRole.value;
  if (!email) {
    inviteMsg.textContent = "Digite um e-mail.";
    inviteMsg.classList.remove("success");
    return;
  }

  inviteBtn.disabled = true;
  inviteBtn.textContent = "Enviando...";
  inviteMsg.textContent = "";
  inviteMsg.classList.remove("success");

  try {
    const res = await workerFetch("/auth/invite", {
      method: "POST",
      body: JSON.stringify({ email, role }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Falha ao enviar convite.");

    inviteEmail.value = "";
    inviteMsg.textContent = data.emailQueued
      ? "Convite enviado por e-mail."
      : `Convite criado, mas o e-mail não saiu. Envie este link manualmente: ${data.inviteUrl || ""}`;
    inviteMsg.classList.toggle("success", !!data.emailQueued);
    await loadUsersView();
  } catch (err) {
    inviteMsg.textContent = err.message || "Erro ao enviar convite.";
    inviteMsg.classList.remove("success");
  } finally {
    inviteBtn.disabled = false;
    inviteBtn.textContent = "Enviar convite";
  }
});

async function deleteUser(email) {
  if (!email) return;
  const ok = confirm(`Remover o acesso de ${email}?`);
  if (!ok) return;

  try {
    const res = await workerFetch("/auth/delete-user", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Falha ao remover usuário.");
    showToast("Usuário removido.");
    await loadUsersView();
  } catch (err) {
    showToast(err.message || "Erro ao remover usuário.");
  }
}

async function loadAuditLogs() {
  auditList.innerHTML = `<div class="admin-row"><div><strong>Carregando logs...</strong></div></div>`;

  try {
    const data = await getJson("/auth/audit-logs?limit=100");
    const logs = data.logs || [];
    if (!logs.length) {
      auditList.innerHTML = `<div class="admin-row"><div><strong>Nenhum log registrado ainda.</strong></div></div>`;
      return;
    }

    auditList.innerHTML = logs.map((log) => `
      <div class="admin-row">
        <div>
          <span class="audit-action">${escapeHtml(log.action || "acao")}</span>
          <small>${escapeHtml(formatDate(log.createdAt))}</small>
        </div>
        <div>
          <strong>${escapeHtml(log.userName || log.userEmail || "Sistema")}</strong>
          <small>${escapeHtml(log.userEmail || "")}</small>
          <code>${escapeHtml(JSON.stringify(log.details || {}))}</code>
        </div>
      </div>
    `).join("");
  } catch (err) {
    auditList.innerHTML = `<div class="admin-row"><div><strong>Erro ao carregar auditoria.</strong><small>Verifique se o Worker atualizado está publicado.</small></div></div>`;
  }
}

$("#refreshUsersBtn")?.addEventListener("click", loadUsersView);
$("#refreshAuditBtn")?.addEventListener("click", loadAuditLogs);

async function showInviteAccept(token) {
  adminShell.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  loginForm.classList.add("hidden");
  forgotForm.classList.add("hidden");
  resetForm.classList.add("hidden");
  inviteAcceptForm.classList.remove("hidden");
  inviteAcceptMsg.textContent = "";

  try {
    const res = await fetch(`${CONFIG.workerUrl}/auth/invite?token=${encodeURIComponent(token)}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Convite inválido.");
    inviteAcceptCopy.textContent = `Convite para ${data.email}. Crie sua senha para acessar o painel.`;
    inviteName.focus();
  } catch (err) {
    inviteAcceptCopy.textContent = "Convite inválido ou expirado.";
    inviteAcceptMsg.textContent = err.message || "Solicite um novo convite.";
  }
}

inviteAcceptForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const params = new URLSearchParams(window.location.search);
  const token = params.get("invite") || "";
  const name = inviteName.value.trim();
  const password = invitePassword.value;
  const passwordConfirm = invitePasswordConfirm.value;

  inviteAcceptMsg.classList.remove("success");
  if (password !== passwordConfirm) {
    inviteAcceptMsg.textContent = "As senhas não coincidem.";
    return;
  }
  if (password.length < 6) {
    inviteAcceptMsg.textContent = "A senha precisa ter pelo menos 6 caracteres.";
    return;
  }

  inviteAcceptBtn.disabled = true;
  inviteAcceptBtn.textContent = "Criando...";
  inviteAcceptMsg.textContent = "";

  try {
    const { res, data } = await postJson("/auth/invite/accept", { token, name, password });
    if (!res.ok) throw new Error(data.error || "Falha ao aceitar convite.");
    inviteAcceptMsg.classList.add("success");
    inviteAcceptMsg.textContent = "Acesso criado. Faça login para continuar.";
    window.history.replaceState({}, "", "/admin/");
    setTimeout(() => showLogin(), 1400);
  } catch (err) {
    inviteAcceptMsg.textContent = err.message || "Erro ao criar acesso.";
  } finally {
    inviteAcceptBtn.disabled = false;
    inviteAcceptBtn.textContent = "Criar acesso";
  }
});

(async function init() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("invite")) {
    await showInviteAccept(params.get("invite"));
    return;
  }

  if (params.get("reset")) {
    adminShell.classList.add("hidden");
    loginScreen.classList.remove("hidden");
    loginForm.classList.add("hidden");
    forgotForm.classList.add("hidden");
    inviteAcceptForm.classList.add("hidden");
    resetForm.classList.remove("hidden");
    resetPassword.focus();
    return;
  }

  const token = getToken();
  if (!token) {
    showLogin();
    return;
  }

  try {
    const ok = await validateSession();
    if (!ok) return showLogin("Entre novamente.");
    showAdmin();
    await loadAlbums(true);
  } catch {
    showLogin("Não consegui validar a sessão.");
  }
})();
