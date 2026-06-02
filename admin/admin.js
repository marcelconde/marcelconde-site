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
const viewAlbumBtn = $("#viewAlbumBtn");
const clearCacheBtn = $("#clearCacheBtn");
const toastEl = $("#toast");
const likedGrid = $("#likedGrid");

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
  adminShell.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  loginForm.classList.remove("hidden");
  forgotForm.classList.add("hidden");
  resetForm.classList.add("hidden");
  loginMsg.textContent = message;
  loginEmail.value = CONFIG.adminEmail;
  loginPassword.value = "";
  loginPassword.focus();
}

function showAdmin() {
  loginScreen.classList.add("hidden");
  adminShell.classList.remove("hidden");
}

async function validateSession() {
  const res = await workerFetch("/auth/me");
  if (!res.ok) {
    clearToken();
    return false;
  }
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
  forgotForm.classList.remove("hidden");
  forgotEmail.value = CONFIG.adminEmail;
  forgotMsg.textContent = "";
  forgotBtn.focus();
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
    if (!data.emailQueued) {
      forgotMsg.textContent = "Esse e-mail não é o e-mail admin configurado no Worker.";
      forgotMsg.classList.remove("success");
      return;
    }
    forgotMsg.textContent = "Link de redefinição enviado para o seu e-mail.";
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

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", async () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".view").forEach((view) => view.classList.add("hidden"));
    tab.classList.add("active");
    document.getElementById(tab.dataset.view).classList.remove("hidden");
    if (tab.dataset.view === "likesView") await loadLikesOverview();
  });
});

async function fetchAlbumsAt(path) {
  const qs = path ? `?path=${encodeURIComponent(path)}&refresh=1` : "?refresh=1";
  const res = await fetch(`${CONFIG.workerUrl}/albums${qs}`);
  if (!res.ok) return [];
  return res.json();
}

async function loadAlbums(forceRefresh = false) {
  albumList.innerHTML = `<div class="album-item"><strong>Carregando...</strong></div>`;

  const top = await fetchAlbumsAt("portfolio");
  const expanded = [];

  await Promise.all(top.map(async (album) => {
    expanded.push({ ...album, depth: 0 });
    const children = await fetchAlbumsAt(album.path);
    children.forEach((child) => expanded.push({ ...child, depth: 1, parent: album.slug }));
  }));

  state.albums = expanded.sort((a, b) => a.path.localeCompare(b.path, "pt-BR"));
  renderAlbumList();

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
      <span class="album-copy" style="padding-left:${album.depth ? 16 : 0}px">
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
  viewAlbumBtn.classList.remove("disabled");
  viewAlbumBtn.href = `/categoria.html?slug=${encodeURIComponent(state.selectedSlug)}`;

  try {
    const [album, likes] = await Promise.all([
      fetch(`${CONFIG.workerUrl}/album?path=${encodeURIComponent(path)}&refresh=1`).then((r) => r.ok ? r.json() : { images: [] }),
      getJson(`/likes?album=${encodeURIComponent(state.selectedSlug)}`),
    ]);

    state.images = (album.images || []).filter(Boolean);
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
  albumMeta.textContent = `${state.images.length} foto${state.images.length === 1 ? "" : "s"} · ${totalLikes} curtida${totalLikes === 1 ? "" : "s"}`;

  emptyState.classList.toggle("hidden", state.images.length > 0);

  photoGrid.innerHTML = state.images.map((image, index) => {
    const likes = totalLikesForImage(image, index);
    const displayName = image.display_name || image.filename || `foto-${index + 1}`;
    const isCover = state.coverPublicId
      ? image.public_id === state.coverPublicId
      : displayName.toLowerCase().startsWith("0_capa");
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

$("#createAlbumBtn").addEventListener("click", async () => {
  const name = safeAlbumName(newAlbumName.value);
  if (!name) return;

  const path = `portfolio/${name}`;
  if (!state.albums.some((album) => album.path === path)) {
    state.albums.push({ slug: name, path, depth: 0 });
    renderAlbumList();
  }

  newAlbumName.value = "";
  await selectAlbum(path);
  showToast("Álbum preparado. Envie fotos para criar no Cloudinary.");
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

      const form = new FormData();
      form.append("file", file);
      form.append("api_key", signature.apiKey);
      form.append("signature", signature.signature);
      Object.entries(signature.params).forEach(([key, value]) => form.append(key, value));

      setQueueProgress(file.name, 35);
      const uploadRes = await fetch(signature.uploadUrl, { method: "POST", body: form });
      if (!uploadRes.ok) throw new Error(`Upload falhou: ${file.name}`);
      const uploaded = await uploadRes.json().catch(() => ({}));

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
    if (!res.ok) throw new Error("Falha ao excluir.");
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
  await Promise.allSettled(state.albums.map(async (album) => {
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
  }));

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

(async function init() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("reset")) {
    loginEmail.value = CONFIG.adminEmail;
    forgotEmail.value = CONFIG.adminEmail;
    adminShell.classList.add("hidden");
    loginScreen.classList.remove("hidden");
    loginForm.classList.add("hidden");
    forgotForm.classList.add("hidden");
    resetForm.classList.remove("hidden");
    resetPassword.focus();
    return;
  }

  const token = getToken();
  if (!token) {
    loginEmail.value = CONFIG.adminEmail;
    forgotEmail.value = CONFIG.adminEmail;
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
