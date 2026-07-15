const CONFIG = {
  workerUrl: "https://api.marcelconde.com.br",
  tokenKey: "mc_client_token",
};

const params = new URLSearchParams(location.search);
const inviteToken = params.get("convite") || "";
const resetToken = params.get("redefinir") || "";
const requestedNextUrl = params.get("next") || "";
const nextUrl = requestedNextUrl.startsWith("/clientes/") ? requestedNextUrl : "/clientes/dashboard/";

const modeLabel = document.getElementById("modeLabel");
const pageTitle = document.getElementById("pageTitle");
const pageCopy = document.getElementById("pageCopy");
const authForm = document.getElementById("authForm");
const emailField = document.getElementById("emailField");
const passwordField = document.getElementById("passwordField");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const passwordConfirm = document.getElementById("passwordConfirm");
const setupOnly = document.querySelector(".setup-only");
const submitBtn = document.getElementById("submitBtn");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
const backToLoginBtn = document.getElementById("backToLoginBtn");
const statusText = document.getElementById("statusText");
const dashboardLink = document.getElementById("dashboardLink");

let currentMode = "login";

function setStatus(message, type = "") {
  statusText.textContent = message;
  statusText.className = `status ${type}`;
}

function resetFields() {
  passwordInput.value = "";
  passwordConfirm.value = "";
  emailInput.readOnly = false;
  emailField.hidden = false;
  passwordField.hidden = false;
  setupOnly.hidden = true;
  passwordConfirm.required = false;
  forgotPasswordBtn.hidden = true;
  backToLoginBtn.hidden = true;
  dashboardLink.hidden = true;
  setStatus("");
}

function configureLoginMode({ preserveEmail = true } = {}) {
  currentMode = "login";
  const email = preserveEmail ? emailInput.value : "";
  resetFields();
  emailInput.value = email;
  modeLabel.textContent = "Área do cliente";
  pageTitle.textContent = "Acesse sua área";
  pageCopy.textContent = "Entre com o e-mail e senha cadastrados para consultar orçamentos, contratos e galerias privadas.";
  passwordInput.autocomplete = "current-password";
  passwordInput.placeholder = "Digite sua senha";
  passwordInput.required = true;
  submitBtn.textContent = "Entrar";
  forgotPasswordBtn.hidden = false;
  dashboardLink.hidden = false;
}

function configureNewPasswordMode(mode, { email = "", title = "Crie sua senha", copy = "Defina uma senha segura para continuar." } = {}) {
  currentMode = mode;
  resetFields();
  emailInput.value = email;
  emailInput.readOnly = true;
  modeLabel.textContent = mode === "force-change" ? "Primeiro acesso" : "Segurança";
  pageTitle.textContent = title;
  pageCopy.textContent = copy;
  passwordInput.autocomplete = "new-password";
  passwordInput.placeholder = "Crie uma nova senha";
  passwordInput.required = true;
  setupOnly.hidden = false;
  passwordConfirm.required = true;
  submitBtn.textContent = mode === "force-change" ? "Salvar senha e continuar" : "Salvar nova senha";
  backToLoginBtn.hidden = mode !== "force-change";
  passwordInput.focus();
}

function configureForgotMode() {
  currentMode = "forgot";
  const email = emailInput.value;
  resetFields();
  emailInput.value = email;
  passwordField.hidden = true;
  passwordInput.required = false;
  modeLabel.textContent = "Recuperar acesso";
  pageTitle.textContent = "Redefinir senha";
  pageCopy.textContent = "Informe seu e-mail para receber um link seguro de redefinição de senha.";
  submitBtn.textContent = "Enviar link";
  backToLoginBtn.hidden = false;
  emailInput.focus();
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = localStorage.getItem(CONFIG.tokenKey) || "";
  if (token) headers.set("Authorization", `Bearer ${token}`);
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
  currentMode = "invite";
  resetFields();
  modeLabel.textContent = "Primeiro acesso";
  pageTitle.textContent = "Crie sua senha";
  pageCopy.textContent = "Defina uma senha para acessar seu conteúdo privado e voltar depois pela Área do Cliente.";
  passwordInput.autocomplete = "new-password";
  passwordInput.placeholder = "Crie uma senha";
  setupOnly.hidden = false;
  passwordConfirm.required = true;
  submitBtn.textContent = "Criar senha e acessar";

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

async function loadReset() {
  try {
    const data = await api(`/client-auth/reset?token=${encodeURIComponent(resetToken)}`);
    configureNewPasswordMode("reset", {
      email: data.email || "",
      title: "Crie uma nova senha",
      copy: "O link foi validado. Defina sua nova senha para recuperar o acesso à Área do Cliente.",
    });
  } catch (err) {
    configureLoginMode({ preserveEmail: false });
    setStatus(err.message || "Link de redefinição inválido.", "error");
  }
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("");
  submitBtn.disabled = true;

  try {
    if (currentMode === "forgot") {
      await api("/client-auth/forgot", {
        method: "POST",
        body: JSON.stringify({ email: emailInput.value }),
      });
      setStatus("Se o e-mail estiver cadastrado, o link de redefinição será enviado em instantes.", "ok");
      return;
    }

    if (["invite", "reset", "force-change"].includes(currentMode)) {
      if (passwordInput.value.length < 6) throw new Error("Use uma senha com pelo menos 6 caracteres.");
      if (passwordInput.value !== passwordConfirm.value) throw new Error("As senhas não conferem.");

      if (currentMode === "invite") {
        const data = await api("/client-auth/setup", {
          method: "POST",
          body: JSON.stringify({ token: inviteToken, password: passwordInput.value }),
        });
        saveSession(data);
        setStatus("Senha criada. Abrindo sua área...", "ok");
        redirectAfterLogin(data);
        return;
      }

      if (currentMode === "reset") {
        await api("/client-auth/reset", {
          method: "POST",
          body: JSON.stringify({ token: resetToken, password: passwordInput.value }),
        });
        configureLoginMode();
        setStatus("Senha alterada. Entre com a nova senha.", "ok");
        return;
      }

      const data = await api("/client-auth/change-password", {
        method: "POST",
        body: JSON.stringify({ password: passwordInput.value }),
      });
      saveSession(data);
      setStatus("Senha definitiva criada. Abrindo sua área...", "ok");
      redirectAfterLogin(data);
      return;
    }

    const data = await api("/client-auth/login", {
      method: "POST",
      body: JSON.stringify({ email: emailInput.value, password: passwordInput.value }),
    });
    saveSession(data);
    if (data.user?.mustChangePassword) {
      configureNewPasswordMode("force-change", {
        email: data.user.email,
        title: "Crie sua senha definitiva",
        copy: "A senha recebida por e-mail é temporária. Crie uma senha definitiva antes de acessar seu orçamento ou galeria.",
      });
      return;
    }
    setStatus("Login realizado.", "ok");
    redirectAfterLogin(data);
  } catch (err) {
    setStatus(err.message || "Erro ao acessar.", "error");
  } finally {
    submitBtn.disabled = false;
  }
});

forgotPasswordBtn.addEventListener("click", configureForgotMode);
backToLoginBtn.addEventListener("click", () => {
  history.replaceState({}, "", "/clientes/login/");
  configureLoginMode();
});

if (resetToken) loadReset();
else if (inviteToken) loadInvite();
else configureLoginMode();
