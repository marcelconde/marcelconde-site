const CONFIG = {
  workerUrl: "https://api.marcelconde.com.br",
  tokenKey: "mc_admin_token",
};

const $ = (selector) => document.querySelector(selector);

const currentUserLabel = $("#currentUserLabel");
const settingsForm = $("#settingsForm");
const reminderEnabled = $("#quoteReminderEnabled");
const reminderDays = $("#quoteReminderDays");
const reminderSummary = $("#quoteReminderSummary");
const saveSettingsBtn = $("#saveSettingsBtn");
const deliveryForm = $("#deliveryForm");
const deliveryDays = $("#deliveryAlertDays");
const saveDeliveryBtn = $("#saveDeliveryBtn");
const toastEl = $("#toast");

function getToken() {
  return sessionStorage.getItem(CONFIG.tokenKey) || "";
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toastEl.classList.remove("show"), 3600);
}

async function getJson(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("X-Admin-Token", token);
  }
  if (options.body) headers.set("Content-Type", "application/json");
  const res = await fetch(CONFIG.workerUrl + path, { ...options, headers });
  if (res.status === 401) {
    location.href = "/admin/";
    throw new Error("Faça login novamente.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

function renderSummary() {
  const days = Number(reminderDays.value);
  reminderDays.disabled = !reminderEnabled.checked;
  if (!reminderEnabled.checked) {
    reminderSummary.textContent = "Desligado: nenhum lembrete automático será enviado.";
  } else if (Number.isInteger(days) && days >= 1) {
    reminderSummary.textContent = `O cliente recebe o lembrete ${days === 1 ? "1 dia" : `${days} dias`} depois do envio do orçamento, se ainda não tiver aceitado.`;
  } else {
    reminderSummary.textContent = "Informe um número inteiro de dias.";
  }
}

function fillForm(settings = {}) {
  reminderEnabled.checked = settings.quoteReminderEnabled !== false;
  reminderDays.value = settings.quoteReminderDays || 3;
  deliveryDays.value = settings.deliveryAlertDays || 15;
  renderSummary();
}

async function loadSettings() {
  try {
    const [me, data] = await Promise.all([getJson("/auth/me"), getJson("/private/settings")]);
    currentUserLabel.textContent = me.user?.email || "";
    if (data.limits?.quoteReminderMaxDays) reminderDays.max = data.limits.quoteReminderMaxDays;
    if (data.limits?.deliveryAlertMaxDays) deliveryDays.max = data.limits.deliveryAlertMaxDays;
    fillForm(data.settings);
    saveSettingsBtn.disabled = false;
    saveDeliveryBtn.disabled = false;
  } catch (err) {
    reminderSummary.textContent = err.message || "Erro ao carregar as configurações.";
  }
}

reminderEnabled.addEventListener("change", renderSummary);
reminderDays.addEventListener("input", renderSummary);

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveSettingsBtn.disabled = true;
  saveSettingsBtn.textContent = "Salvando...";
  try {
    const data = await getJson("/private/settings", {
      method: "POST",
      body: JSON.stringify({
        quoteReminderEnabled: reminderEnabled.checked,
        quoteReminderDays: Number(reminderDays.value),
      }),
    });
    fillForm(data.settings);
    showToast("Configurações salvas.");
  } catch (err) {
    showToast(err.message || "Erro ao salvar.");
  } finally {
    saveSettingsBtn.disabled = false;
    saveSettingsBtn.textContent = "Salvar";
  }
});

deliveryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveDeliveryBtn.disabled = true;
  saveDeliveryBtn.textContent = "Salvando...";
  try {
    const data = await getJson("/private/settings", {
      method: "POST",
      body: JSON.stringify({ deliveryAlertDays: Number(deliveryDays.value) }),
    });
    fillForm(data.settings);
    showToast("Prazo salvo.");
  } catch (err) {
    showToast(err.message || "Erro ao salvar.");
  } finally {
    saveDeliveryBtn.disabled = false;
    saveDeliveryBtn.textContent = "Salvar";
  }
});

loadSettings();
