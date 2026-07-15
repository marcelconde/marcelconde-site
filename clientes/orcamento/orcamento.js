const CONFIG = {
  workerUrl: "https://api.marcelconde.com.br",
  tokenKey: "mc_client_token",
};

const quoteId = new URLSearchParams(location.search).get("id") || "";
const state = { quote: null, client: null, contractor: null };

const $ = (selector) => document.querySelector(selector);
const quoteLoading = $("#quoteLoading");
const quoteDocument = $("#quoteDocument");
const downloadQuoteBtn = $("#downloadQuoteBtn");
const quoteNumber = $("#quoteNumber");
const quoteTitle = $("#quoteTitle");
const quoteDescription = $("#quoteDescription");
const quoteStatus = $("#quoteStatus");
const clientName = $("#clientName");
const clientDetails = $("#clientDetails");
const contractorName = $("#contractorName");
const contractorDetails = $("#contractorDetails");
const quoteMetaGrid = $("#quoteMetaGrid");
const quoteItems = $("#quoteItems");
const quoteSubtotal = $("#quoteSubtotal");
const quoteDiscountRow = $("#quoteDiscountRow");
const quoteDiscount = $("#quoteDiscount");
const quoteTotal = $("#quoteTotal");
const quotePayments = $("#quotePayments");
const quotePaymentTerms = $("#quotePaymentTerms");
const quoteClauses = $("#quoteClauses");
const quoteClientNote = $("#quoteClientNote");
const quoteAcceptPanel = $("#quoteAcceptPanel");
const quoteAcceptForm = $("#quoteAcceptForm");
const quoteAcceptedPanel = $("#quoteAcceptedPanel");
const signerName = $("#signerName");
const signerDocument = $("#signerDocument");
const confirmContract = $("#confirmContract");
const confirmSignature = $("#confirmSignature");
const acceptQuoteBtn = $("#acceptQuoteBtn");
const acceptStatus = $("#acceptStatus");
const acceptedSummary = $("#acceptedSummary");
const acceptedEvidence = $("#acceptedEvidence");

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getToken() {
  return localStorage.getItem(CONFIG.tokenKey) || "";
}

function requireToken() {
  const token = getToken();
  if (!token) {
    const next = `/clientes/orcamento/?id=${encodeURIComponent(quoteId)}`;
    location.href = `/clientes/login/?next=${encodeURIComponent(next)}`;
    return "";
  }
  return token;
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = requireToken();
  if (!token) throw new Error("Unauthorized");
  headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(CONFIG.workerUrl + path, { ...options, headers, cache: "no-store" });
  const contentType = res.headers.get("Content-Type") || "";
  const data = contentType.includes("application/json") ? await res.json().catch(() => ({})) : null;
  if (res.status === 401) {
    localStorage.removeItem(CONFIG.tokenKey);
    const next = `/clientes/orcamento/?id=${encodeURIComponent(quoteId)}`;
    location.href = `/clientes/login/?next=${encodeURIComponent(next)}`;
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
  return data ?? res;
}

function formatMoney(cents = 0) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents || 0) / 100);
}

function formatDate(value, withTime = false) {
  if (!value) return "Não informado";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function statusText(status) {
  if (status === "accepted") return "Aceito";
  if (status === "expired") return "Expirado";
  if (status === "viewed") return "Em análise";
  return "Novo";
}

function clientInfo(client = {}) {
  return [client.companyName, client.document, client.email, client.phone].filter(Boolean).join(" · ");
}

function contractorInfo(contractor = {}) {
  return [contractor.document ? `CNPJ ${contractor.document}` : "", contractor.email, contractor.phone, contractor.city].filter(Boolean).join(" · ");
}

function renderQuote() {
  const quote = state.quote;
  const client = state.client || {};
  const contractor = state.contractor || {};
  document.title = `${quote.number || "Orçamento"} | Marcel Conde Fotografia`;
  quoteNumber.textContent = `${quote.number || "Orçamento"} · versão ${quote.version || 1}`;
  quoteTitle.textContent = quote.title || "Serviço fotográfico";
  quoteDescription.textContent = quote.serviceDescription || "";
  quoteStatus.textContent = statusText(quote.status);
  quoteStatus.className = `client-status ${quote.status || "published"}`;
  clientName.textContent = client.name || "Cliente";
  clientDetails.textContent = clientInfo(client);
  contractorName.textContent = contractor.name || "Marcel Conde | Photography";
  contractorDetails.textContent = contractorInfo(contractor);

  const meta = [
    ["Data do trabalho", quote.serviceDate ? formatDate(quote.serviceDate) : "A combinar"],
    ["Local", quote.serviceLocation || "A combinar"],
    ["Prazo de entrega", quote.deliveryEstimate || "Conforme escopo"],
    ["Validade da proposta", formatDate(quote.validUntil)],
  ];
  quoteMetaGrid.innerHTML = meta.map(([label, value]) => `<div><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`).join("");

  quoteItems.innerHTML = (quote.items || []).map((item) => `
    <div class="quote-client-item">
      <span><strong>${escapeHtml(item.description || "Serviço")}</strong><small>${Number(item.quantity || 1)} × ${escapeHtml(formatMoney(item.unitPriceCents))}</small></span>
      <strong>${escapeHtml(formatMoney(Math.round(Number(item.quantity || 1) * Number(item.unitPriceCents || 0))))}</strong>
    </div>`).join("");
  quoteSubtotal.textContent = formatMoney(quote.subtotalCents);
  quoteDiscountRow.hidden = !quote.discountCents;
  quoteDiscount.textContent = `− ${formatMoney(quote.discountCents)}`;
  quoteTotal.textContent = formatMoney(quote.totalCents);

  quotePayments.innerHTML = (quote.paymentMethods || []).map((method) => `
    <div><strong>${escapeHtml(method.label || "Pagamento")}</strong><span>${escapeHtml(method.details || "")}</span></div>`).join("");
  quotePaymentTerms.textContent = quote.paymentTerms || "";

  quoteClauses.innerHTML = (quote.clauses || []).map((clause, index) => `
    <article>
      <span>${String(index + 1).padStart(2, "0")}</span>
      <div><h3>${escapeHtml(clause.title || "Cláusula")}</h3><p>${escapeHtml(clause.text || "")}</p></div>
    </article>`).join("");
  quoteClientNote.hidden = !quote.notesForClient;
  quoteClientNote.textContent = quote.notesForClient || "";

  signerName.value = client.name || "";
  signerDocument.value = client.document || "";
  const accepted = quote.status === "accepted";
  const expired = quote.status === "expired";
  quoteAcceptPanel.hidden = accepted;
  quoteAcceptedPanel.hidden = !accepted;
  if (expired) {
    quoteAcceptPanel.hidden = false;
    quoteAcceptForm.hidden = true;
    quoteAcceptPanel.querySelector("h2").textContent = "Validade encerrada";
    quoteAcceptPanel.insertAdjacentHTML("beforeend", "<p>Solicite a atualização deste orçamento antes de confirmar a contratação.</p>");
  }
  if (accepted && quote.acceptance) {
    acceptedSummary.textContent = `${quote.acceptance.name} confirmou o aceite em ${formatDate(quote.acceptance.acceptedAt, true)}.`;
    acceptedEvidence.textContent = `Código ${quote.acceptance.code} · Hash ${quote.acceptance.hash}`;
  }

  quoteLoading.hidden = true;
  quoteDocument.hidden = false;
  downloadQuoteBtn.disabled = false;
}

async function loadQuote() {
  if (!quoteId) {
    quoteLoading.innerHTML = "<strong>Orçamento não informado.</strong>";
    return;
  }
  try {
    const data = await api(`/client-quote?id=${encodeURIComponent(quoteId)}`);
    state.quote = data.quote;
    state.client = data.client;
    state.contractor = data.contractor;
    renderQuote();
  } catch (err) {
    if (err.message !== "Unauthorized") quoteLoading.innerHTML = `<strong>Não foi possível abrir o orçamento.</strong><p>${escapeHtml(err.message)}</p>`;
  }
}

quoteAcceptForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  acceptStatus.textContent = "";
  acceptQuoteBtn.disabled = true;
  acceptQuoteBtn.textContent = "Registrando aceite...";
  try {
    const data = await api("/client-quote/accept", {
      method: "POST",
      body: JSON.stringify({
        quoteId,
        name: signerName.value.trim(),
        document: signerDocument.value.trim(),
        confirmContract: confirmContract.checked,
        confirmElectronicSignature: confirmSignature.checked,
      }),
    });
    state.quote = data.quote;
    renderQuote();
    if (!data.emailQueued && data.emailErrors?.length) {
      acceptedSummary.textContent += " O aceite foi registrado, mas uma das cópias por e-mail está pendente de reenvio.";
    }
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  } catch (err) {
    acceptStatus.textContent = err.message || "Não foi possível registrar o aceite.";
    acceptQuoteBtn.disabled = false;
    acceptQuoteBtn.textContent = "Aceitar orçamento e contrato";
  }
});

downloadQuoteBtn.addEventListener("click", async () => {
  downloadQuoteBtn.disabled = true;
  try {
    const token = requireToken();
    if (!token) return;
    const res = await fetch(`${CONFIG.workerUrl}/client-quote/pdf?id=${encodeURIComponent(quoteId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Erro ao gerar PDF.");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${state.quote?.number || "orcamento"}.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    alert(err.message || "Não foi possível baixar o PDF.");
  } finally {
    downloadQuoteBtn.disabled = false;
  }
});

loadQuote();
