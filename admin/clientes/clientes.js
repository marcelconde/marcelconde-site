const CONFIG = {
  workerUrl: "https://api.marcelconde.com.br",
  tokenKey: "mc_admin_token",
};

const $ = (selector) => document.querySelector(selector);

const state = {
  clients: [],
  galleries: [],
  selectedClient: null,
};

const currentUserLabel = $("#currentUserLabel");
const statClients = $("#statClients");
const statGalleries = $("#statGalleries");
const clientList = $("#clientList");
const clientForm = $("#clientForm");
const formTitle = $("#formTitle");
const clientName = $("#clientName");
const clientEmail = $("#clientEmail");
const clientPhone = $("#clientPhone");
const clientNotes = $("#clientNotes");
const newClientBtn = $("#newClientBtn");
const refreshBtn = $("#refreshBtn");
const saveClientBtn = $("#saveClientBtn");
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
  if (options.body && !headers.has("Content-Type")) {
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

function clearForm() {
  state.selectedClient = null;
  formTitle.textContent = "Novo cliente";
  clientName.value = "";
  clientEmail.value = "";
  clientPhone.value = "";
  clientNotes.value = "";
  clientName.focus();
  renderClients();
}

function selectClient(id) {
  state.selectedClient = state.clients.find((client) => client.id === id) || null;
  if (!state.selectedClient) return;
  formTitle.textContent = "Editar cliente";
  clientName.value = state.selectedClient.name || "";
  clientEmail.value = state.selectedClient.email || "";
  clientPhone.value = state.selectedClient.phone || "";
  clientNotes.value = state.selectedClient.notes || "";
  renderClients();
}

function renderClients() {
  statClients.textContent = state.clients.length;
  statGalleries.textContent = state.galleries.length;

  if (!state.clients.length) {
    clientList.innerHTML = `<div class="empty-state"><span>Nenhum cliente cadastrado.</span></div>`;
    return;
  }

  clientList.innerHTML = state.clients.map((client) => {
    const galleries = state.galleries.filter((gallery) => gallery.clientId === client.id).length;
    const active = state.selectedClient?.id === client.id ? " active" : "";
    return `
      <button class="private-list-item${active}" type="button" data-client-id="${escapeHtml(client.id)}">
        <strong>${escapeHtml(client.name || "Cliente")}</strong>
        <small>${escapeHtml(client.email || "sem e-mail")} · ${galleries} galeria(s)</small>
        <small>${escapeHtml(client.phone || "")}</small>
      </button>
    `;
  }).join("");

  clientList.querySelectorAll("[data-client-id]").forEach((button) => {
    button.addEventListener("click", () => selectClient(button.dataset.clientId));
  });
}

async function loadData() {
  const me = await getJson("/auth/me");
  currentUserLabel.textContent = me.user?.email || "";
  const data = await getJson("/private/galleries");
  state.clients = data.clients || [];
  state.galleries = data.galleries || [];
  renderClients();
}

clientForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveClientBtn.disabled = true;
  saveClientBtn.textContent = "Salvando...";
  try {
    const payload = {
      id: state.selectedClient?.id || undefined,
      name: clientName.value.trim(),
      email: clientEmail.value.trim(),
      phone: clientPhone.value.trim(),
      notes: clientNotes.value.trim(),
    };
    const data = await getJson("/private/clients", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const existingIndex = state.clients.findIndex((client) => client.id === data.client.id);
    if (existingIndex >= 0) state.clients[existingIndex] = data.client;
    else state.clients.unshift(data.client);
    state.selectedClient = data.client;
    showToast("Cliente salvo.");
    renderClients();
  } catch (err) {
    showToast(err.message || "Erro ao salvar cliente.");
  } finally {
    saveClientBtn.disabled = false;
    saveClientBtn.textContent = "Salvar cliente";
  }
});

newClientBtn.addEventListener("click", clearForm);
refreshBtn.addEventListener("click", loadData);

loadData().catch((err) => {
  showToast(err.message || "Erro ao carregar clientes.");
});
