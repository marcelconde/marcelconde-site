const CONFIG = {
  workerUrl: "https://api.marcelconde.com.br",
  tokenKey: "mc_admin_token",
};

const $ = (selector) => document.querySelector(selector);

const state = {
  clients: [],
  galleries: [],
  quotes: [],
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
const clientDocument = $("#clientDocument");
const clientCompanyName = $("#clientCompanyName");
const clientPostalCode = $("#clientPostalCode");
const clientStreet = $("#clientStreet");
const clientAddressNumber = $("#clientAddressNumber");
const clientComplement = $("#clientComplement");
const clientNeighborhood = $("#clientNeighborhood");
const clientCity = $("#clientCity");
const clientState = $("#clientState");
const clientNotes = $("#clientNotes");
const newClientBtn = $("#newClientBtn");
const newQuoteBtn = $("#newQuoteBtn");
const deleteClientBtn = $("#deleteClientBtn");
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
  clientDocument.value = "";
  clientCompanyName.value = "";
  clientPostalCode.value = "";
  clientStreet.value = "";
  clientAddressNumber.value = "";
  clientComplement.value = "";
  clientNeighborhood.value = "";
  clientCity.value = "";
  clientState.value = "";
  clientNotes.value = "";
  deleteClientBtn.disabled = true;
  newQuoteBtn.classList.add("disabled");
  newQuoteBtn.href = "#";
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
  clientDocument.value = state.selectedClient.document || "";
  clientCompanyName.value = state.selectedClient.companyName || "";
  clientPostalCode.value = state.selectedClient.address?.postalCode || "";
  clientStreet.value = state.selectedClient.address?.street || "";
  clientAddressNumber.value = state.selectedClient.address?.number || "";
  clientComplement.value = state.selectedClient.address?.complement || "";
  clientNeighborhood.value = state.selectedClient.address?.neighborhood || "";
  clientCity.value = state.selectedClient.address?.city || "";
  clientState.value = state.selectedClient.address?.state || "";
  clientNotes.value = state.selectedClient.notes || "";
  deleteClientBtn.disabled = false;
  newQuoteBtn.classList.remove("disabled");
  newQuoteBtn.href = `/admin/orcamentos/detalhe/?client=${encodeURIComponent(state.selectedClient.id)}`;
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
    const quotes = state.quotes.filter((quote) => quote.clientId === client.id).length;
    const active = state.selectedClient?.id === client.id ? " active" : "";
    return `
      <button class="private-list-item${active}" type="button" data-client-id="${escapeHtml(client.id)}">
        <strong>${escapeHtml(client.name || "Cliente")}</strong>
        <small>${escapeHtml(client.email || "sem e-mail")} · ${galleries} galeria(s) · ${quotes} orçamento(s)</small>
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
  const [galleryData, quoteResult] = await Promise.all([
    getJson("/private/galleries"),
    getJson("/private/quotes").then((data) => ({ data })).catch(() => ({ data: { clients: [], quotes: [] } })),
  ]);
  const quoteData = quoteResult.data;
  state.clients = galleryData.clients || quoteData.clients || [];
  state.galleries = galleryData.galleries || [];
  state.quotes = quoteData.quotes || [];
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
      document: clientDocument.value.trim(),
      companyName: clientCompanyName.value.trim(),
      address: {
        postalCode: clientPostalCode.value.trim(),
        street: clientStreet.value.trim(),
        number: clientAddressNumber.value.trim(),
        complement: clientComplement.value.trim(),
        neighborhood: clientNeighborhood.value.trim(),
        city: clientCity.value.trim(),
        state: clientState.value.trim(),
      },
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
    deleteClientBtn.disabled = false;
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

deleteClientBtn.addEventListener("click", async () => {
  if (!state.selectedClient) return;
  const client = state.selectedClient;
  const linkedGalleries = state.galleries.filter((gallery) => gallery.clientId === client.id).length;
  const linkedQuotes = state.quotes.filter((quote) => quote.clientId === client.id).length;
  const linkedMessage = linkedGalleries || linkedQuotes
    ? `\n\nEste cliente tem ${linkedGalleries} galeria(s) e ${linkedQuotes} orçamento(s) vinculados. Remova ou transfira esses registros antes.`
    : "";
  if (linkedGalleries || linkedQuotes) {
    showToast("Cliente com registros vinculados não pode ser apagado.");
    alert(`Não é possível apagar "${client.name || client.email}" agora.${linkedMessage}`);
    return;
  }

  const confirmed = confirm(
    `Apagar definitivamente o cliente "${client.name || client.email}"?\n\n` +
    "O acesso dele à área do cliente também será removido. Esta ação não pode ser desfeita."
  );
  if (!confirmed) return;

  deleteClientBtn.disabled = true;
  deleteClientBtn.textContent = "Apagando...";

  try {
    await getJson("/private/client/delete", {
      method: "POST",
      body: JSON.stringify({ clientId: client.id }),
    });
    state.clients = state.clients.filter((item) => item.id !== client.id);
    clearForm();
    showToast("Cliente apagado.");
  } catch (err) {
    showToast(err.message || "Erro ao apagar cliente.");
  } finally {
    deleteClientBtn.textContent = "Apagar cliente";
    deleteClientBtn.disabled = !state.selectedClient;
  }
});

refreshBtn.addEventListener("click", loadData);

loadData().catch((err) => {
  showToast(err.message || "Erro ao carregar clientes.");
});
