const CONFIG = {
  workerUrl: "https://api.marcelconde.com.br",
  tokenKey: "mc_client_token",
};

const params = new URLSearchParams(location.search);
const inviteToken = params.get("convite") || "";
const requestedNextUrl = params.get("next") || "";
const nextUrl = requestedNextUrl.startsWith("/clientes/") ? requestedNextUrl : "/clientes/dashboard/";

const modeLabel = document.getElementById("modeLabel");
const pageTitle = document.getElementById("pageTitle");
const pageCopy = document.getElementById("pageCopy");
const authForm = document.getElementById("authForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const passwordConfirm = document.getElementById("passwordConfirm");
const setupOnly = document.querySelector(".setup-only");
const submitBtn = document.getElementById("submitBtn");
const statusText = document.getElementById("statusText");
const dashboardLink = document.getElementById("dashboardLink");

function configureLoginMode() {
  modeLabel.textContent = "Área do cliente";
  pageTitle.textContent = "Acesse sua área";
  pageCopy.textContent = "Entre com o e-mail e senha cadastrados para consultar orçamentos, contratos e galerias privadas.";
  passwordInput.autocomplete = "current-password";
  passwordInput.placeholder = "Digite sua senha";
  passwordConfirm.value = "";
  passwordConfirm.required = false;
  setupOnly.hidden = true;
  submitBtn.textContent = "Entrar";
  dashboardLink.hidden = false;
}

function setStatus(message, type = "") {
  statusText.textContent = message;
  statusText.className = `status ${type}`;
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(CONFIG.workerUrl + path, { ...options, headers, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

function saveSession(data) {
  if (data.token) localStorage.setItem(CONFIG.tokenKey, data.token);
}

function redirectAfterLogin(data = {}) {
  if (data.quote?.url) {
    location.href = data.quote.url;
    return;
  }
  if (data.gallery?.url) {
    location.href = data.gallery.url;
    return;
  }
  location.href = nextUrl;
}

async function loadInvite() {
  if (!inviteToken) {
    configureLoginMode();
    return;
  }

  modeLabel.textContent = "Primeiro acesso";
  pageTitle.textContent = "Crie sua senha";
  pageCopy.textContent = "Defina uma senha para acessar seu conteúdo privado e voltar depois pela Área do Cliente.";
  passwordInput.autocomplete = "new-password";
  passwordInput.placeholder = "Crie uma senha";
  setupOnly.hidden = false;
  passwordConfirm.required = true;
  submitBtn.textContent = "Criar senha e acessar";
  dashboardLink.hidden = true;

  try {
    const invite = await api(`/client-auth/invite?token=${encodeURIComponent(inviteToken)}`);
    emailInput.value = invite.email || "";
    emailInput.readOnly = true;
    pageTitle.textContent = invite.quoteTitle || invite.galleryTitle || "Crie sua senha";
    pageCopy.textContent = invite.kind === "quote"
      ? `Olá ${invite.clientName || ""}. Crie sua senha para acessar seu orçamento e contrato.`
      : `Olá ${invite.clientName || ""}. Crie sua senha para acessar esta galeria privada.`;
  } catch (err) {
    setStatus(err.message || "Convite inválido.", "error");
    submitBtn.disabled = true;
  }
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("");
  submitBtn.disabled = true;

  try {
    if (inviteToken) {
      if (passwordInput.value.length < 6) throw new Error("Use uma senha com pelo menos 6 caracteres.");
      if (passwordInput.value !== passwordConfirm.value) throw new Error("As senhas não conferem.");
      const data = await api("/client-auth/setup", {
        method: "POST",
        body: JSON.stringify({
          token: inviteToken,
          password: passwordInput.value,
        }),
      });
      saveSession(data);
      setStatus("Senha criada. Abrindo sua área...", "ok");
      redirectAfterLogin(data);
      return;
    }

    const data = await api("/client-auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: emailInput.value,
        password: passwordInput.value,
      }),
    });
    saveSession(data);
    setStatus("Login realizado.", "ok");
    redirectAfterLogin(data);
  } catch (err) {
    setStatus(err.message || "Erro ao acessar.", "error");
  } finally {
    submitBtn.disabled = false;
  }
});

loadInvite();
