const CONFIG = {
  workerUrl: "https://api.marcelconde.com.br",
  tokenKey: "mc_admin_token",
};

const DEFAULT_CLAUSES = [
  ["objeto", "Objeto e escopo", "O presente instrumento formaliza a prestação dos serviços fotográficos descritos neste orçamento. Qualquer atividade, cobertura, arquivo ou entrega não prevista deverá ser acordada por escrito entre as partes."],
  ["reserva", "Reserva, pagamento e inadimplência", "A data somente será reservada após o aceite deste contrato e o pagamento da entrada, quando prevista. Os demais vencimentos obedecerão às condições indicadas neste orçamento. O atraso poderá suspender a execução ou a entrega até a regularização."],
  ["execucao", "Execução e entrega", "O serviço será executado conforme o escopo, a data e o local informados. O prazo de entrega começa após a realização do trabalho e, quando aplicável, após a seleção das imagens pelo cliente."],
  ["reagendamento", "Reagendamento e cancelamento", "Pedidos de reagendamento ou cancelamento devem ser comunicados por escrito. Custos já incorridos e valores de reserva poderão ser retidos. Caso fortuito, força maior ou impossibilidade técnica serão tratados de boa-fé, priorizando nova data compatível."],
  ["edicao", "Seleção, edição e arquivos", "A curadoria e a edição seguem a linguagem autoral do fotógrafo. Arquivos brutos não integram a entrega, salvo previsão expressa. Solicitações fora do escopo poderão gerar novo orçamento."],
  ["direitos", "Direitos autorais e uso de imagem", "Os direitos autorais permanecem com o fotógrafo. O cliente recebe licença de uso pessoal dos arquivos entregues. Qualquer autorização para divulgação em portfólio, redes sociais ou publicidade deverá respeitar a opção acordada entre as partes e a legislação aplicável."],
  ["armazenamento", "Guarda e disponibilidade", "Após a entrega final, o cliente é responsável por manter cópias de segurança. A guarda dos arquivos pelo fotógrafo ocorrerá pelo período informado neste orçamento ou, na ausência de prazo específico, por até 90 dias após a entrega."],
  ["dados", "Dados pessoais", "Os dados pessoais serão utilizados para atendimento, execução do contrato, cobrança, entrega e cumprimento de obrigações legais, com acesso restrito às finalidades necessárias ao serviço."],
  ["gerais", "Disposições gerais", "O aceite eletrônico registra a concordância com este orçamento e suas cláusulas. Alterações posteriores somente terão validade quando formalizadas por escrito. Fica eleito o foro da comarca de Recife, Pernambuco, ressalvadas as regras legais de competência aplicáveis."],
].map(([id, title, text]) => ({ id, title, text }));

const PAYMENT_TYPES = {
  pix: "PIX",
  bank_transfer: "Transferência bancária",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  cash: "Dinheiro",
  boleto: "Boleto",
  other: "Outro",
};

const state = {
  id: new URLSearchParams(location.search).get("id") || "",
  quote: null,
  clients: [],
  events: [],
  saving: false,
};

const $ = (selector) => document.querySelector(selector);
const quoteForm = $("#quoteForm");
const currentUserLabel = $("#currentUserLabel");
const quoteStatusStat = $("#quoteStatusStat");
const quoteVersionStat = $("#quoteVersionStat");
const quoteTotalStat = $("#quoteTotalStat");
const quoteNumberLabel = $("#quoteNumberLabel");
const quoteTitleLabel = $("#quoteTitleLabel");
const quoteMeta = $("#quoteMeta");
const quoteStatusBadge = $("#quoteStatusBadge");
const quoteClient = $("#quoteClient");
const quoteValidUntil = $("#quoteValidUntil");
const quoteServiceDate = $("#quoteServiceDate");
const quoteServiceDateUndefined = $("#quoteServiceDateUndefined");
const quoteTitle = $("#quoteTitle");
const quoteDescription = $("#quoteDescription");
const quoteLocation = $("#quoteLocation");
const quoteDelivery = $("#quoteDelivery");
const quoteInternalNotes = $("#quoteInternalNotes");
const quoteItems = $("#quoteItems");
const quoteDiscountType = $("#quoteDiscountType");
const quoteDiscountValue = $("#quoteDiscountValue");
const quoteSubtotal = $("#quoteSubtotal");
const quoteDiscountTotal = $("#quoteDiscountTotal");
const quoteGrandTotal = $("#quoteGrandTotal");
const quotePayments = $("#quotePayments");
const quotePaymentTerms = $("#quotePaymentTerms");
const quoteClauses = $("#quoteClauses");
const quoteClientNotes = $("#quoteClientNotes");
const quoteEvents = $("#quoteEvents");
const quoteAcceptanceSummary = $("#quoteAcceptanceSummary");
const saveQuoteBtn = $("#saveQuoteBtn");
const publishQuoteBtn = $("#publishQuoteBtn");
const openQuoteBtn = $("#openQuoteBtn");
const createGalleryBtn = $("#createGalleryBtn");
const downloadPdfBtn = $("#downloadPdfBtn");
const deleteQuoteBtn = $("#deleteQuoteBtn");
const addItemBtn = $("#addItemBtn");
const addPaymentBtn = $("#addPaymentBtn");
const addClauseBtn = $("#addClauseBtn");
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

function formatMoney(cents = 0) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents || 0) / 100);
}

function formatDate(value, withTime = false) {
  if (!value) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function statusMeta(status = "draft") {
  const values = {
    draft: ["Rascunho", "neutral"],
    published: ["Enviado", "pending"],
    viewed: ["Visualizado", "pending"],
    accepted: ["Aceito", "success"],
    expired: ["Expirado", "danger"],
    cancelled: ["Cancelado", "danger"],
  };
  return values[status] || values.draft;
}

function showToast(message, duration = 3600) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toastEl.classList.remove("show"), duration);
}

async function workerFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("X-Admin-Token", token);
  }
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(CONFIG.workerUrl + path, { ...options, headers, cache: "no-store" });
  if (res.status === 401) location.href = "/admin/";
  return res;
}

async function getJson(path, options = {}) {
  const res = await workerFetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

function defaultQuote() {
  const validUntil = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return {
    id: "",
    number: "",
    clientId: "",
    title: "Ensaio fotográfico",
    serviceDescription: "",
    serviceDate: "",
    serviceLocation: "",
    deliveryEstimate: "Até 20 dias úteis após a seleção das imagens.",
    validUntil,
    items: [{ id: `item_${Date.now()}`, description: "Serviço fotográfico", quantity: 1, unitPriceCents: 0 }],
    discountType: "none",
    discountValue: 0,
    paymentMethods: [{ id: `payment_${Date.now()}`, type: "pix", label: "PIX", details: "Dados para pagamento enviados após a aprovação." }],
    paymentTerms: "30% na reserva da data e o saldo restante até o dia do trabalho.",
    clauses: DEFAULT_CLAUSES.map((clause) => ({ ...clause })),
    notesForClient: "",
    internalNotes: "",
    status: "draft",
    version: 0,
  };
}

function clientOptions() {
  quoteClient.innerHTML = `<option value="">Selecione um cliente</option>${state.clients.map((client) => (
    `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name || client.email || "Cliente")} · ${escapeHtml(client.email || "sem e-mail")}</option>`
  )).join("")}`;
}

function itemRow(item = {}) {
  return `
    <div class="quote-item-row" data-item-row data-id="${escapeHtml(item.id || `item_${Date.now()}`)}">
      <label>
        Descrição
        <input data-item-description type="text" value="${escapeHtml(item.description || "")}" required>
      </label>
      <label>
        Quantidade
        <input data-item-quantity type="number" min="0.01" step="0.01" value="${Number(item.quantity || 1)}" required>
      </label>
      <label>
        Valor unitário
        <input data-item-price type="number" min="0" step="0.01" value="${(Number(item.unitPriceCents || 0) / 100).toFixed(2)}" required>
      </label>
      <button class="icon-btn quote-remove" data-remove-item type="button" title="Remover item" aria-label="Remover item">×</button>
    </div>`;
}

function renderItems() {
  quoteItems.innerHTML = (state.quote.items || []).map(itemRow).join("");
  if (!quoteItems.children.length) quoteItems.insertAdjacentHTML("beforeend", itemRow());
  updateTotals();
}

function paymentRow(method = {}) {
  const options = Object.entries(PAYMENT_TYPES).map(([value, label]) => (
    `<option value="${value}" ${method.type === value ? "selected" : ""}>${escapeHtml(label)}</option>`
  )).join("");
  return `
    <div class="quote-payment-row" data-payment-row data-id="${escapeHtml(method.id || `payment_${Date.now()}`)}">
      <label>
        Forma
        <select data-payment-type>${options}</select>
      </label>
      <label>
        Nome exibido
        <input data-payment-label type="text" value="${escapeHtml(method.label || PAYMENT_TYPES[method.type] || "Forma de pagamento")}" required>
      </label>
      <label>
        Detalhes
        <input data-payment-details type="text" value="${escapeHtml(method.details || "")}" placeholder="Parcelas, taxas ou instruções">
      </label>
      <button class="icon-btn quote-remove" data-remove-payment type="button" title="Remover forma" aria-label="Remover forma">×</button>
    </div>`;
}

function renderPayments() {
  quotePayments.innerHTML = (state.quote.paymentMethods || []).map(paymentRow).join("");
  if (!quotePayments.children.length) quotePayments.insertAdjacentHTML("beforeend", paymentRow({ type: "pix", label: "PIX" }));
}

function clauseRow(clause = {}, index = 0) {
  return `
    <article class="quote-clause-row" data-clause-row data-id="${escapeHtml(clause.id || `clause_${Date.now()}`)}">
      <span class="quote-clause-index">${String(index + 1).padStart(2, "0")}</span>
      <div>
        <input data-clause-title type="text" value="${escapeHtml(clause.title || "Nova cláusula")}" aria-label="Título da cláusula" required>
        <textarea data-clause-text aria-label="Texto da cláusula" required>${escapeHtml(clause.text || "")}</textarea>
      </div>
      <button class="icon-btn quote-remove" data-remove-clause type="button" title="Remover cláusula" aria-label="Remover cláusula">×</button>
    </article>`;
}

function renderClauses() {
  quoteClauses.innerHTML = (state.quote.clauses || []).map(clauseRow).join("");
}

function collectItems() {
  return [...quoteItems.querySelectorAll("[data-item-row]")].map((row, index) => ({
    id: row.dataset.id || `item_${index + 1}`,
    description: row.querySelector("[data-item-description]").value.trim(),
    quantity: Math.max(0.01, Number(row.querySelector("[data-item-quantity]").value || 1)),
    unitPriceCents: Math.max(0, Math.round(Number(row.querySelector("[data-item-price]").value || 0) * 100)),
  })).filter((item) => item.description);
}

function collectPayments() {
  return [...quotePayments.querySelectorAll("[data-payment-row]")].map((row, index) => ({
    id: row.dataset.id || `payment_${index + 1}`,
    type: row.querySelector("[data-payment-type]").value,
    label: row.querySelector("[data-payment-label]").value.trim(),
    details: row.querySelector("[data-payment-details]").value.trim(),
  })).filter((method) => method.label);
}

function collectClauses() {
  return [...quoteClauses.querySelectorAll("[data-clause-row]")].map((row, index) => ({
    id: row.dataset.id || `clause_${index + 1}`,
    title: row.querySelector("[data-clause-title]").value.trim(),
    text: row.querySelector("[data-clause-text]").value.trim(),
  })).filter((clause) => clause.title && clause.text);
}

function calculateTotals() {
  const subtotalCents = collectItems().reduce((total, item) => total + Math.round(item.quantity * item.unitPriceCents), 0);
  const type = quoteDiscountType.value;
  const raw = Math.max(0, Number(quoteDiscountValue.value || 0));
  const discountCents = type === "percent"
    ? Math.round(subtotalCents * (Math.min(raw, 95) / 100))
    : type === "fixed" ? Math.min(subtotalCents, Math.round(raw * 100)) : 0;
  return { subtotalCents, discountCents, totalCents: Math.max(0, subtotalCents - discountCents) };
}

function updateTotals() {
  const totals = calculateTotals();
  quoteSubtotal.textContent = formatMoney(totals.subtotalCents);
  quoteDiscountTotal.textContent = `− ${formatMoney(totals.discountCents)}`;
  quoteGrandTotal.textContent = formatMoney(totals.totalCents);
  quoteTotalStat.textContent = formatMoney(totals.totalCents);
}

function payloadFromForm() {
  return {
    id: state.quote.id || undefined,
    clientId: quoteClient.value,
    title: quoteTitle.value.trim(),
    serviceDescription: quoteDescription.value.trim(),
    serviceDate: quoteServiceDateUndefined.checked ? "" : quoteServiceDate.value,
    serviceLocation: quoteLocation.value.trim(),
    deliveryEstimate: quoteDelivery.value.trim(),
    validUntil: quoteValidUntil.value,
    items: collectItems(),
    discountType: quoteDiscountType.value,
    discountValue: quoteDiscountType.value === "fixed"
      ? Math.round(Number(quoteDiscountValue.value || 0) * 100)
      : Number(quoteDiscountValue.value || 0),
    paymentMethods: collectPayments(),
    paymentTerms: quotePaymentTerms.value.trim(),
    clauses: collectClauses(),
    notesForClient: quoteClientNotes.value.trim(),
    internalNotes: quoteInternalNotes.value.trim(),
  };
}

function renderEvents() {
  const labels = {
    admin_criou_orcamento: "Orçamento criado",
    admin_editou_orcamento: "Rascunho atualizado",
    admin_publicou_orcamento: "Orçamento publicado e enviado",
    cliente_criou_senha: "Cliente criou a senha de acesso",
    cliente_abriu_orcamento: "Cliente visualizou o orçamento",
    cliente_aceitou_orcamento: "Cliente aceitou o contrato",
  };
  quoteEvents.innerHTML = state.events.length ? state.events.map((event) => `
    <div class="event-row">
      <div>
        <strong>${escapeHtml(labels[event.action] || event.action || "Atualização")}</strong>
        <small>${escapeHtml(event.actorEmail || event.actorName || "Sistema")}</small>
      </div>
      <time>${escapeHtml(formatDate(event.createdAt, true))}</time>
    </div>`).join("") : `<div class="empty-state"><span>Nenhuma atividade registrada.</span></div>`;

  const acceptance = state.quote.acceptance;
  if (!acceptance) {
    quoteAcceptanceSummary.hidden = true;
    return;
  }
  quoteAcceptanceSummary.hidden = false;
  quoteAcceptanceSummary.innerHTML = `
    <span class="eyebrow">Aceite confirmado</span>
    <strong>${escapeHtml(acceptance.name || "Cliente")}</strong>
    <p>${escapeHtml(acceptance.email || "")} · ${escapeHtml(formatDate(acceptance.acceptedAt, true))}</p>
    <small>Código ${escapeHtml(acceptance.code || "")} · Hash ${escapeHtml(acceptance.hash || "")}</small>`;
}

function renderHeader() {
  const [label, tone] = statusMeta(state.quote.status);
  const client = state.clients.find((item) => item.id === state.quote.clientId);
  quoteNumberLabel.textContent = state.quote.number || "Novo orçamento";
  quoteTitleLabel.textContent = state.quote.title || "Nova proposta";
  quoteMeta.textContent = `${client?.name || "Cliente não selecionado"} · ${label}${state.quote.validUntil ? ` · validade ${formatDate(state.quote.validUntil)}` : ""}`;
  quoteStatusStat.textContent = label;
  quoteVersionStat.textContent = state.quote.version || 0;
  quoteStatusBadge.textContent = label;
  quoteStatusBadge.className = `status-badge ${tone}`;

  const hasId = Boolean(state.quote.id);
  const accepted = state.quote.status === "accepted";
  const published = ["published", "viewed", "accepted", "expired"].includes(state.quote.status);
  openQuoteBtn.classList.toggle("disabled", !published);
  openQuoteBtn.href = published ? `/clientes/orcamento/?id=${encodeURIComponent(state.quote.id)}` : "#";
  downloadPdfBtn.disabled = !hasId;
  deleteQuoteBtn.disabled = !hasId || accepted;
  createGalleryBtn.hidden = !accepted || !state.quote.clientId;
  createGalleryBtn.href = accepted
    ? `/admin/galerias/?client=${encodeURIComponent(state.quote.clientId)}&title=${encodeURIComponent(state.quote.title || "Galeria")}`
    : "/admin/galerias/";
  publishQuoteBtn.disabled = accepted;
  saveQuoteBtn.disabled = accepted;
  publishQuoteBtn.textContent = published && !accepted ? "Reenviar versão" : accepted ? "Contrato aceito" : "Publicar e enviar";
  saveQuoteBtn.textContent = accepted ? "Contrato bloqueado" : "Salvar rascunho";

  quoteForm.querySelectorAll("input, textarea, select, button").forEach((element) => {
    if (accepted && !element.closest("#section-history")) element.disabled = true;
  });
}

function populateForm() {
  clientOptions();
  quoteClient.value = state.quote.clientId || "";
  quoteValidUntil.value = state.quote.validUntil || "";
  quoteServiceDate.value = state.quote.serviceDate || "";
  quoteServiceDateUndefined.checked = !state.quote.serviceDate;
  quoteServiceDate.disabled = quoteServiceDateUndefined.checked;
  quoteTitle.value = state.quote.title || "";
  quoteDescription.value = state.quote.serviceDescription || "";
  quoteLocation.value = state.quote.serviceLocation || "";
  quoteDelivery.value = state.quote.deliveryEstimate || "";
  quoteInternalNotes.value = state.quote.internalNotes || "";
  quoteDiscountType.value = state.quote.discountType || "none";
  quoteDiscountValue.disabled = quoteDiscountType.value === "none";
  quoteDiscountValue.value = quoteDiscountType.value === "fixed"
    ? (Number(state.quote.discountValue || 0) / 100).toFixed(2)
    : Number(state.quote.discountValue || 0);
  quotePaymentTerms.value = state.quote.paymentTerms || "";
  quoteClientNotes.value = state.quote.notesForClient || "";
  renderItems();
  renderPayments();
  renderClauses();
  renderEvents();
  renderHeader();
  updateTotals();
}

async function loadData() {
  try {
    const [me, listData] = await Promise.all([getJson("/auth/me"), getJson("/private/quotes")]);
    currentUserLabel.textContent = me.user?.email || "";
    state.clients = listData.clients || [];
    if (state.id) {
      const data = await getJson(`/private/quote?id=${encodeURIComponent(state.id)}`);
      state.quote = data.quote;
      state.events = data.events || [];
    } else {
      state.quote = defaultQuote();
      const requestedClient = new URLSearchParams(location.search).get("client") || "";
      if (requestedClient && state.clients.some((client) => client.id === requestedClient)) state.quote.clientId = requestedClient;
    }
    populateForm();
  } catch (err) {
    showToast(err.message || "Erro ao carregar orçamento.", 6000);
  }
}

async function saveQuote({ silent = false } = {}) {
  if (state.saving) return state.quote;
  const payload = payloadFromForm();
  if (!payload.clientId) throw new Error("Selecione o cliente deste orçamento.");
  if (!payload.title) throw new Error("Informe o título do serviço.");
  if (!payload.serviceDescription) throw new Error("Descreva o trabalho que será realizado.");
  if (!payload.validUntil) throw new Error("Informe a validade do orçamento.");
  if (!payload.items.length) throw new Error("Adicione ao menos um item.");
  if (!payload.clauses.length) throw new Error("Adicione ao menos uma cláusula.");
  state.saving = true;
  saveQuoteBtn.disabled = true;
  saveQuoteBtn.textContent = "Salvando...";
  try {
    const data = await getJson("/private/quotes", { method: "POST", body: JSON.stringify(payload) });
    state.quote = { ...state.quote, ...data.quote };
    state.id = state.quote.id;
    history.replaceState({}, "", `/admin/orcamentos/detalhe/?id=${encodeURIComponent(state.id)}`);
    renderHeader();
    if (!silent) showToast("Rascunho salvo.");
    return state.quote;
  } finally {
    state.saving = false;
    saveQuoteBtn.disabled = state.quote?.status === "accepted";
    saveQuoteBtn.textContent = state.quote?.status === "accepted" ? "Contrato bloqueado" : "Salvar rascunho";
  }
}

quoteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await saveQuote();
  } catch (err) {
    showToast(err.message || "Erro ao salvar orçamento.");
  }
});

publishQuoteBtn.addEventListener("click", async () => {
  if (state.quote?.status === "accepted") return;
  publishQuoteBtn.disabled = true;
  publishQuoteBtn.textContent = "Publicando...";
  try {
    await saveQuote({ silent: true });
    const data = await getJson("/private/quote/publish", {
      method: "POST",
      body: JSON.stringify({ quoteId: state.quote.id }),
    });
    state.quote = { ...state.quote, ...data.quote };
    renderHeader();
    showToast(data.emailQueued
      ? "Orçamento publicado e enviado ao cliente."
      : `Publicado, mas o e-mail não saiu: ${data.emailError || "verifique o serviço de e-mail"}`, 6500);
  } catch (err) {
    showToast(err.message || "Erro ao publicar orçamento.", 6000);
  } finally {
    publishQuoteBtn.disabled = state.quote?.status === "accepted";
    if (state.quote?.status !== "accepted") publishQuoteBtn.textContent = "Reenviar versão";
  }
});

downloadPdfBtn.addEventListener("click", async () => {
  if (!state.quote?.id) return;
  downloadPdfBtn.disabled = true;
  try {
    const res = await workerFetch(`/private/quote/pdf?id=${encodeURIComponent(state.quote.id)}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Erro ao gerar PDF.");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${state.quote.number || "orcamento"}.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    showToast(err.message || "Erro ao baixar PDF.");
  } finally {
    downloadPdfBtn.disabled = false;
  }
});

deleteQuoteBtn.addEventListener("click", async () => {
  if (!state.quote?.id || state.quote.status === "accepted") return;
  if (!confirm(`Apagar definitivamente o orçamento ${state.quote.number || ""}?`)) return;
  deleteQuoteBtn.disabled = true;
  try {
    await getJson("/private/quote/delete", { method: "POST", body: JSON.stringify({ quoteId: state.quote.id }) });
    location.href = "/admin/orcamentos/";
  } catch (err) {
    showToast(err.message || "Erro ao apagar orçamento.");
    deleteQuoteBtn.disabled = false;
  }
});

addItemBtn.addEventListener("click", () => {
  quoteItems.insertAdjacentHTML("beforeend", itemRow({ id: `item_${Date.now()}`, description: "", quantity: 1, unitPriceCents: 0 }));
  quoteItems.lastElementChild.querySelector("input").focus();
  updateTotals();
});

addPaymentBtn.addEventListener("click", () => {
  quotePayments.insertAdjacentHTML("beforeend", paymentRow({ id: `payment_${Date.now()}`, type: "other", label: "", details: "" }));
  quotePayments.lastElementChild.querySelector("input").focus();
});

addClauseBtn.addEventListener("click", () => {
  quoteClauses.insertAdjacentHTML("beforeend", clauseRow({ id: `clause_${Date.now()}`, title: "", text: "" }, quoteClauses.children.length));
  quoteClauses.lastElementChild.querySelector("input").focus();
});

quoteItems.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-item]");
  if (!button || quoteItems.children.length <= 1) return;
  button.closest("[data-item-row]").remove();
  updateTotals();
});
quoteItems.addEventListener("input", updateTotals);

quotePayments.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-payment]");
  if (!button || quotePayments.children.length <= 1) return;
  button.closest("[data-payment-row]").remove();
});
quotePayments.addEventListener("change", (event) => {
  const select = event.target.closest("[data-payment-type]");
  if (!select) return;
  const row = select.closest("[data-payment-row]");
  const label = row.querySelector("[data-payment-label]");
  if (!label.value.trim() || Object.values(PAYMENT_TYPES).includes(label.value.trim())) label.value = PAYMENT_TYPES[select.value];
});

quoteClauses.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-clause]");
  if (!button || quoteClauses.children.length <= 1) return;
  button.closest("[data-clause-row]").remove();
  [...quoteClauses.querySelectorAll(".quote-clause-index")].forEach((label, index) => { label.textContent = String(index + 1).padStart(2, "0"); });
});

quoteDiscountType.addEventListener("change", () => {
  quoteDiscountValue.disabled = quoteDiscountType.value === "none";
  if (quoteDiscountType.value === "none") quoteDiscountValue.value = "0";
  updateTotals();
});
quoteDiscountValue.addEventListener("input", updateTotals);

quoteServiceDateUndefined.addEventListener("change", () => {
  quoteServiceDate.disabled = quoteServiceDateUndefined.checked;
  if (quoteServiceDateUndefined.checked) quoteServiceDate.value = "";
  else quoteServiceDate.focus();
});

document.querySelectorAll("[data-detail-section]").forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.detailSection;
    document.querySelectorAll(".detail-section").forEach((section) => { section.hidden = section.id !== target; });
    document.querySelectorAll("[data-detail-section]").forEach((item) => item.classList.toggle("active", item === button));
  });
});

loadData();
