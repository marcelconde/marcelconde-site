function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Token",
    "Access-Control-Max-Age": "86400",
  };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}

function errorJson(message, status = 500, extra = {}) {
  return json({ error: message, ...extra }, status);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function cacheHeaders(seconds = 60) {
  return {
    "Cache-Control": `public, max-age=${seconds}`,
    "X-Worker-Cache-TTL": String(seconds),
  };
}

function makeCacheKey(requestUrl) {
  const url = new URL(requestUrl);
  url.searchParams.delete("refresh");
  url.searchParams.delete("v");
  url.searchParams.delete("_");
  return new Request(url.toString(), { method: "GET" });
}

function withCacheStatus(response, status) {
  const headers = new Headers(response.headers);
  headers.set("X-Worker-Cache", status);
  return new Response(response.body, { status: response.status, headers });
}

function getAssetName(asset) {
  const publicIdLastPart = String(asset.public_id || "").split("/").pop();
  return [asset.display_name, asset.filename, publicIdLastPart, asset.public_id]
    .filter(Boolean).join(" ").toLowerCase();
}

function pickCover(images) {
  return (
    images.find((img) => {
      const name = getAssetName(img);
      return (
        name === "0_capa" ||
        name.startsWith("0_capa") ||
        name.includes("/0_capa") ||
        name.includes(" 0_capa")
      );
    }) || images[0] || null
  );
}

function albumCoverKey(path = "") {
  return `album_cover:${path}`;
}

function deletedAssetsKey(path = "") {
  return `album_deleted_assets:${path}`;
}

async function getStoredCover(env, path = "") {
  if (!env.LIKES_KV || !path) return null;
  return env.LIKES_KV.get(albumCoverKey(path), "json");
}

async function saveStoredCover(env, path = "", publicId = "") {
  if (!env.LIKES_KV) throw new Error("LIKES_KV not configured");
  const cleanPublicId = sanitizePublicId(publicId);
  if (!path || !cleanPublicId) throw new Error("Missing cover data");

  const cover = {
    public_id: cleanPublicId,
    updatedAt: new Date().toISOString(),
  };

  await env.LIKES_KV.put(albumCoverKey(path), JSON.stringify(cover));
  return cover;
}

async function getDeletedAssets(env, path = "") {
  if (!env.LIKES_KV || !path) return new Set();
  const deleted = await env.LIKES_KV.get(deletedAssetsKey(path), "json");
  const ids = Array.isArray(deleted) ? deleted : Object.keys(deleted || {});
  return new Set(ids.map(sanitizePublicId).filter(Boolean));
}

async function rememberDeletedAsset(env, path = "", publicId = "") {
  if (!env.LIKES_KV || !path || !publicId) return;
  const cleanPublicId = sanitizePublicId(publicId);
  if (!cleanPublicId) return;

  const key = deletedAssetsKey(path);
  const deleted = (await env.LIKES_KV.get(key, "json")) || {};
  deleted[cleanPublicId] = new Date().toISOString();
  await env.LIKES_KV.put(key, JSON.stringify(deleted), { expirationTtl: 7 * 24 * 60 * 60 });
}

function userIndexKey() {
  return "admin_users_index";
}

function inviteIndexKey() {
  return "admin_invites_index";
}

function auditLogKey() {
  return "admin_audit_logs";
}

function privateClientsIndexKey() {
  return "private_clients_index";
}

function privateClientKey(id) {
  return `private_client:${id}`;
}

function privateGalleriesIndexKey() {
  return "private_galleries_index";
}

function privateGalleryKey(id) {
  return `private_gallery:${id}`;
}

function privateGalleryBySlugKey(slug) {
  return `private_gallery_slug:${slug}`;
}

function privateGalleryImagesKey(id) {
  return `private_gallery_images:${id}`;
}

function privateGallerySelectionKey(id) {
  return `private_gallery_selection:${id}`;
}

function privateGalleryEventsKey(id) {
  return `private_gallery_events:${id}`;
}

function privateGalleryPaymentKey(id) {
  return `private_gallery_payment:${id}`;
}

function privateGalleryLatestPaymentKey(id) {
  return `private_gallery_latest_payment:${id}`;
}

function mercadoPagoPaymentKey(providerPaymentId) {
  return `mercadopago_payment:${providerPaymentId}`;
}

function clientUserKey(email) {
  return `client_user:${normalizeEmail(email)}`;
}

function clientSessionKey(token) {
  return `client_session:${token}`;
}

function clientGalleryInviteKey(token) {
  return `client_gallery_invite:${token}`;
}

function privateQuotesIndexKey() {
  return "private_quotes_index";
}

function privateQuoteKey(id) {
  return `private_quote:${id}`;
}

function privateQuoteEventsKey(id) {
  return `private_quote_events:${id}`;
}

function clientQuoteInviteKey(token) {
  return `client_quote_invite:${token}`;
}

function clientPasswordResetKey(token) {
  return `client_password_reset:${token}`;
}

function normalizeRole(role = "") {
  return role === "admin" ? "admin" : "editor";
}

function isSuperAdmin(user, env) {
  return normalizeEmail(user?.email || "") === adminEmail(env) || user?.role === "admin";
}

function publicUser(user = {}) {
  return {
    email: normalizeEmail(user.email || ""),
    name: user.name || user.email || "Usuário",
    role: normalizeRole(user.role || "editor"),
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
  };
}

function publicClientUser(user = {}) {
  return {
    email: normalizeEmail(user.email || ""),
    name: user.name || user.email || "Cliente",
    mustChangePassword: user.mustChangePassword === true,
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
  };
}

async function readKvJson(env, key, fallback) {
  if (!env.LIKES_KV) return fallback;
  return (await env.LIKES_KV.get(key, "json")) || fallback;
}

async function writeKvJson(env, key, value, options) {
  if (!env.LIKES_KV) throw new Error("LIKES_KV not configured");
  return env.LIKES_KV.put(key, JSON.stringify(value), options);
}

async function getUserEmails(env) {
  const emails = await readKvJson(env, userIndexKey(), []);
  const main = await getAdminUser(env, adminEmail(env));
  if (main && !emails.includes(main.email)) return [...emails, main.email];
  return emails;
}

async function saveUserEmails(env, emails) {
  const unique = [...new Set(emails.map(normalizeEmail).filter(Boolean))].sort();
  await writeKvJson(env, userIndexKey(), unique);
  return unique;
}

async function getAdminUser(env, email) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || !env.LIKES_KV) return null;
  return env.LIKES_KV.get(`admin_user:${cleanEmail}`, "json");
}

async function saveAdminUser(env, user) {
  if (!env.LIKES_KV) throw new Error("LIKES_KV not configured");
  const cleanEmail = normalizeEmail(user.email || "");
  if (!cleanEmail) throw new Error("Missing user email");

  const now = new Date().toISOString();
  const existing = await getAdminUser(env, cleanEmail);
  const saved = {
    ...existing,
    ...user,
    email: cleanEmail,
    role: normalizeRole(user.role || existing?.role || (cleanEmail === adminEmail(env) ? "admin" : "editor")),
    name: user.name || existing?.name || cleanEmail,
    active: user.active !== false,
    createdAt: existing?.createdAt || user.createdAt || now,
    updatedAt: now,
  };

  await writeKvJson(env, `admin_user:${cleanEmail}`, saved);
  await saveUserEmails(env, [...await getUserEmails(env), cleanEmail]);
  return saved;
}

async function listAdminUsers(env) {
  const emails = await getUserEmails(env);
  const users = await Promise.all(emails.map((email) => getAdminUser(env, email)));
  return users.filter(Boolean).map(publicUser);
}

async function saveUserPassword(env, email, password, extra = {}) {
  const cleanEmail = normalizeEmail(email);
  const passwordHash = await hashPassword(password, "", authPepper(env));
  return saveAdminUser(env, {
    ...extra,
    email: cleanEmail,
    passwordHash,
    active: true,
  });
}

async function getCurrentAdmin(request, env) {
  const token = getAdminToken(request);
  if (!token) return null;

  if (env.ADMIN_KEY && token === env.ADMIN_KEY) {
    return {
      email: adminEmail(env),
      name: env.ADMIN_NAME || "Marcel Conde",
      role: "admin",
      legacy: true,
    };
  }

  const session = await getSession(env, token);
  if (!session) return null;
  return {
    email: normalizeEmail(session.email || ""),
    name: session.name || session.email || "Usuário",
    role: normalizeRole(session.role || "editor"),
  };
}

// Valida sessão do admin. ADMIN_KEY continua como fallback para links antigos.
async function checkAdmin(request, env) {
  return !!(await getCurrentAdmin(request, env));
}

async function requireAdmin(request, env) {
  if (await checkAdmin(request, env)) return null;
  return errorJson("Unauthorized", 401);
}

async function requireAdminUser(request, env) {
  const user = await getCurrentAdmin(request, env);
  if (!user) return { error: errorJson("Unauthorized", 401), user: null };
  return { error: null, user };
}

async function requireSuperAdmin(request, env) {
  const { error, user } = await requireAdminUser(request, env);
  if (error) return { error, user: null };
  if (!isSuperAdmin(user, env)) return { error: errorJson("Acesso negado", 403), user: null };
  return { error: null, user };
}

async function appendAuditLog(env, request, user, action, entity, details = {}) {
  try {
    const logs = await readKvJson(env, auditLogKey(), []);
    logs.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      userEmail: user?.email || null,
      userName: user?.name || null,
      userRole: user?.role || null,
      action,
      entity,
      details,
      ip: request.headers.get("CF-Connecting-IP") || "",
      userAgent: request.headers.get("User-Agent") || "",
    });
    await writeKvJson(env, auditLogKey(), logs.slice(0, 200));
  } catch (err) {
    console.error("Audit log failed:", err);
  }
}

function isAllowedAssetPath(path) {
  return (
    path === "portfolio" ||
    path.startsWith("portfolio/") ||
    path === "site" ||
    path.startsWith("site/")
  );
}

function cleanDisplayName(name = "") {
  return String(name)
    .replace(/\//g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function slugify(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `galeria-${Date.now()}`;
}

function cleanGalleryText(value = "", max = 1000) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, max);
}

function normalizeWatermark(input = {}) {
  const allowedPositions = [
    "center",
    "top-left",
    "top",
    "top-right",
    "left",
    "right",
    "bottom-left",
    "bottom",
    "bottom-right",
  ];

  return {
    enabled: input.enabled === true,
    logoUrl: String(input.logoUrl || "").trim(),
    opacity: Math.min(Math.max(Number(input.opacity ?? 0.28), 0.05), 0.85),
    size: Math.min(Math.max(Number(input.size ?? 180), 80), 520),
    position: allowedPositions.includes(input.position)
      ? input.position
      : "center",
  };
}

function clampNumber(value, min, max, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(Math.max(num, min), max);
}

function normalizePercent(value = 0) {
  return Math.round(clampNumber(value, 0, 95, 0) * 100) / 100;
}

function normalizeSelectionLimit(value, fallback = 15) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Math.max(0, Math.min(Math.round(Number(fallback) || 15), 2000));
  return Math.max(0, Math.min(Math.round(parsed), 2000));
}

/** @param {unknown} value */
function normalizeMoneyCents(value) {
  if (typeof value === "string") {
    const normalized = value
      .replace(/[^\d,.-]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const parsed = Number(normalized);
    return Math.max(0, Math.min(Math.round((Number.isFinite(parsed) ? parsed : 0) * 100), 5000000));
  }
  return Math.max(0, Math.min(Math.round(Number(value || 0)), 5000000));
}

function normalizeGalleryCommerce(input = {}, existing = {}) {
  const quantityEnabled = input.quantityDiscountEnabled === undefined
    ? existing.quantityDiscountEnabled === true
    : input.quantityDiscountEnabled === true || input.quantityDiscountEnabled === "true";

  return {
    extraPhotoPriceCents: normalizeMoneyCents(input.extraPhotoPriceCents ?? existing.extraPhotoPriceCents ?? 0),
    allPhotosDiscountPercent: normalizePercent(input.allPhotosDiscountPercent ?? existing.allPhotosDiscountPercent ?? 0),
    quantityDiscountEnabled: quantityEnabled,
    quantityDiscountMinPhotos: Math.max(0, Math.min(Math.round(Number(input.quantityDiscountMinPhotos ?? existing.quantityDiscountMinPhotos ?? 0)), 2000)),
    quantityDiscountPercent: normalizePercent(input.quantityDiscountPercent ?? existing.quantityDiscountPercent ?? 0),
  };
}

function uniquePublicIds(selection = []) {
  return [...new Set((selection || []).filter(Boolean))];
}

function calculateSelectionPricingRaw(gallery = {}, images = [], selection = []) {
  const selectedPublicIds = uniquePublicIds(selection);
  const selectedTotal = selectedPublicIds.length;
  const totalImages = images.length;
  const includedPhotos = Math.max(0, Math.round(Number(gallery.selectionLimit || 0)));
  const extraCount = Math.max(0, selectedTotal - includedPhotos);
  const unitPriceCents = normalizeMoneyCents(gallery.extraPhotoPriceCents || 0);
  const subtotalCents = extraCount * unitPriceCents;
  const selectedAll = totalImages > 0 && selectedTotal >= totalImages;

  let discountType = "none";
  let discountLabel = "";
  let discountPercent = 0;

  if (subtotalCents > 0) {
    if (selectedAll && normalizePercent(gallery.allPhotosDiscountPercent || 0) > 0) {
      discountType = "all_photos";
      discountLabel = "Desconto por todas as fotos";
      discountPercent = normalizePercent(gallery.allPhotosDiscountPercent || 0);
    } else if (
      gallery.quantityDiscountEnabled === true &&
      Number(gallery.quantityDiscountMinPhotos || 0) > 0 &&
      selectedTotal >= Number(gallery.quantityDiscountMinPhotos || 0) &&
      normalizePercent(gallery.quantityDiscountPercent || 0) > 0
    ) {
      discountType = "quantity";
      discountLabel = `Desconto a partir de ${Number(gallery.quantityDiscountMinPhotos || 0)} fotos`;
      discountPercent = normalizePercent(gallery.quantityDiscountPercent || 0);
    }
  }

  const discountCents = Math.round(subtotalCents * (discountPercent / 100));
  const totalCents = Math.max(0, subtotalCents - discountCents);

  return {
    includedPhotos,
    selectedTotal,
    totalImages,
    extraCount,
    unitPriceCents,
    subtotalCents,
    discountType,
    discountLabel,
    discountPercent,
    discountCents,
    totalCents,
    selectedAll,
    requiresPayment: totalCents > 0,
    canCompleteWithoutPayment: selectedTotal >= includedPhotos && totalCents === 0,
    needsMoreIncludedPhotos: includedPhotos > 0 && selectedTotal < includedPhotos,
  };
}

function completedSelectionBaseline(gallery = {}, selection = []) {
  if (!gallery.selectionCompletedAt) return [];
  const locked = uniquePublicIds(gallery.selectionLockedPublicIds || []);
  return locked.length ? locked : uniquePublicIds(selection);
}

function selectionDiff(previous = [], current = []) {
  const previousIds = uniquePublicIds(previous);
  const currentIds = uniquePublicIds(current);
  const previousSet = new Set(previousIds);
  const currentSet = new Set(currentIds);

  return {
    addedPublicIds: currentIds.filter((publicId) => !previousSet.has(publicId)),
    removedPublicIds: previousIds.filter((publicId) => !currentSet.has(publicId)),
  };
}

function selectionChanged(previous = [], current = []) {
  const diff = selectionDiff(previous, current);
  return diff.addedPublicIds.length > 0 || diff.removedPublicIds.length > 0;
}

function calculateSelectionPricing(gallery = {}, images = [], selection = [], baselineSelection = null) {
  const current = calculateSelectionPricingRaw(gallery, images, selection);
  const baseline = Array.isArray(baselineSelection)
    ? uniquePublicIds(baselineSelection)
    : completedSelectionBaseline(gallery, selection);

  if (!baseline.length) return current;

  const locked = calculateSelectionPricingRaw(gallery, images, baseline);
  const extraCount = Math.max(0, current.extraCount - locked.extraCount);
  const subtotalCents = Math.max(0, current.subtotalCents - locked.subtotalCents);
  const discountCents = Math.max(0, current.discountCents - locked.discountCents);
  const totalCents = Math.max(0, current.totalCents - locked.totalCents);

  return {
    ...current,
    extraCount,
    subtotalCents,
    discountCents,
    totalCents,
    lockedSelectedTotal: locked.selectedTotal,
    lockedExtraCount: locked.extraCount,
    lockedTotalCents: locked.totalCents,
    totalExtraCount: current.extraCount,
    totalSubtotalCents: current.subtotalCents,
    totalDiscountCents: current.discountCents,
    totalSelectionCents: current.totalCents,
    additionalSelection: true,
    requiresPayment: totalCents > 0,
    canCompleteWithoutPayment: current.selectedTotal >= current.includedPhotos && totalCents === 0,
    needsMoreIncludedPhotos: current.needsMoreIncludedPhotos,
  };
}

function publicPrivateGallery(gallery = {}, images = [], selection = []) {
  const selected = new Set(selection);
  const pricing = calculateSelectionPricing(gallery, images, selection);
  return {
    id: gallery.id,
    slug: gallery.slug,
    title: gallery.title,
    subtitle: gallery.subtitle || "",
    message: gallery.message || "",
    coverUrl: gallery.coverUrl || images[0]?.url || null,
    selectionLimit: Number(gallery.selectionLimit || 0),
    extraPhotoPriceCents: normalizeMoneyCents(gallery.extraPhotoPriceCents || 0),
    allPhotosDiscountPercent: normalizePercent(gallery.allPhotosDiscountPercent || 0),
    quantityDiscountEnabled: gallery.quantityDiscountEnabled === true,
    quantityDiscountMinPhotos: Math.max(0, Number(gallery.quantityDiscountMinPhotos || 0)),
    quantityDiscountPercent: normalizePercent(gallery.quantityDiscountPercent || 0),
    status: gallery.status || "selection",
    allowDownload: gallery.allowDownload === true || gallery.status === "final",
    watermark: normalizeWatermark(gallery.watermark || {}),
    totalImages: images.length,
    totalSelected: selection.length,
    selectedPublicIds: [...selected],
    selectionCompletedAt: gallery.selectionCompletedAt || null,
    selectionPaymentId: gallery.selectionPaymentId || null,
    pricing,
  };
}

function thumbnailImage(image = {}) {
  return {
    id: image.id || image.public_id,
    public_id: image.public_id,
    url: image.url,
    display_name: image.display_name || image.filename || "",
    filename: image.filename || image.display_name || "",
    width: image.width || null,
    height: image.height || null,
    format: image.format || "",
    phase: image.phase || "selection",
    createdAt: image.createdAt || null,
  };
}

function csvEscape(value = "") {
  const text = String(value ?? "");
  if (/[",\n;]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

async function appendPrivateGalleryEvent(env, request, galleryId, action, details = {}, actor = {}) {
  try {
    if (!env.LIKES_KV || !galleryId) return;
    const events = await readKvJson(env, privateGalleryEventsKey(galleryId), []);
    events.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      action,
      details,
      actorEmail: actor.email || null,
      actorName: actor.name || null,
      createdAt: new Date().toISOString(),
      ip: request.headers.get("CF-Connecting-IP") || "",
      userAgent: request.headers.get("User-Agent") || "",
    });
    await writeKvJson(env, privateGalleryEventsKey(galleryId), events.slice(0, 500));
  } catch (err) {
    console.error("Private gallery event failed:", err);
  }
}

async function listPrivateClients(env) {
  const ids = await readKvJson(env, privateClientsIndexKey(), []);
  const clients = await Promise.all(ids.map((id) => readKvJson(env, privateClientKey(id), null)));
  return clients.filter(Boolean).sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

function defaultQuoteClauses() {
  return [
    {
      id: "objeto",
      title: "Objeto e escopo",
      text: "O presente instrumento formaliza a prestação dos serviços fotográficos descritos neste orçamento. Qualquer atividade, cobertura, arquivo ou entrega não prevista deverá ser acordada por escrito entre as partes.",
    },
    {
      id: "reserva",
      title: "Reserva, pagamento e inadimplência",
      text: "A data somente será reservada após o aceite deste contrato e o pagamento da entrada, quando prevista. Os demais vencimentos obedecerão às condições indicadas neste orçamento. O atraso poderá suspender a execução ou a entrega até a regularização.",
    },
    {
      id: "execucao",
      title: "Execução e entrega",
      text: "O serviço será executado conforme o escopo, a data e o local informados. O prazo de entrega começa após a realização do trabalho e, quando aplicável, após a seleção das imagens pelo cliente.",
    },
    {
      id: "reagendamento",
      title: "Reagendamento e cancelamento",
      text: "Pedidos de reagendamento ou cancelamento devem ser comunicados por escrito. Custos já incorridos e valores de reserva poderão ser retidos. Caso fortuito, força maior ou impossibilidade técnica serão tratados de boa-fé, priorizando nova data compatível.",
    },
    {
      id: "edicao",
      title: "Seleção, edição e arquivos",
      text: "A curadoria e a edição seguem a linguagem autoral do fotógrafo. Arquivos brutos não integram a entrega, salvo previsão expressa. Solicitações fora do escopo poderão gerar novo orçamento.",
    },
    {
      id: "direitos",
      title: "Direitos autorais e uso de imagem",
      text: "Os direitos autorais permanecem com o fotógrafo. O cliente recebe licença de uso pessoal dos arquivos entregues. Qualquer autorização para divulgação em portfólio, redes sociais ou publicidade deverá respeitar a opção acordada entre as partes e a legislação aplicável.",
    },
    {
      id: "armazenamento",
      title: "Guarda e disponibilidade",
      text: "Após a entrega final, o cliente é responsável por manter cópias de segurança. A guarda dos arquivos pelo fotógrafo ocorrerá pelo período informado neste orçamento ou, na ausência de prazo específico, por até 90 dias após a entrega.",
    },
    {
      id: "dados",
      title: "Dados pessoais",
      text: "Os dados pessoais serão utilizados para atendimento, execução do contrato, cobrança, entrega e cumprimento de obrigações legais, com acesso restrito às finalidades necessárias ao serviço.",
    },
    {
      id: "gerais",
      title: "Disposições gerais",
      text: "O aceite eletrônico registra a concordância com este orçamento e suas cláusulas. Alterações posteriores somente terão validade quando formalizadas por escrito. Fica eleito o foro da comarca de Recife, Pernambuco, ressalvadas as regras legais de competência aplicáveis.",
    },
  ];
}

function defaultQuotePaymentMethods() {
  return [
    {
      id: "pix",
      type: "pix",
      label: "PIX",
      details: "Dados para pagamento enviados após a aprovação.",
    },
  ];
}

function normalizeQuoteItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .slice(0, 40)
    .map((item, index) => ({
      id: String(item.id || `item_${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80),
      description: cleanGalleryText(item.description || "Serviço fotográfico", 320),
      quantity: Math.max(0.01, Math.min(Number(item.quantity || 1), 10000)),
      unitPriceCents: normalizeMoneyCents(item.unitPriceCents || 0),
    }))
    .filter((item) => item.description);
}

function normalizeQuotePaymentMethods(methods = []) {
  const allowed = ["pix", "bank_transfer", "credit_card", "debit_card", "cash", "boleto", "other"];
  return (Array.isArray(methods) ? methods : [])
    .slice(0, 12)
    .map((method, index) => ({
      id: String(method.id || `payment_${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80),
      type: allowed.includes(method.type) ? method.type : "other",
      label: cleanDisplayName(method.label || "Forma de pagamento"),
      details: cleanGalleryText(method.details || "", 600),
    }))
    .filter((method) => method.label);
}

function normalizeQuoteClauses(clauses = []) {
  const source = Array.isArray(clauses) && clauses.length ? clauses : defaultQuoteClauses();
  return source
    .slice(0, 30)
    .map((clause, index) => ({
      id: String(clause.id || `clause_${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80),
      title: cleanDisplayName(clause.title || `Cláusula ${index + 1}`),
      text: cleanGalleryText(clause.text || "", 5000),
    }))
    .filter((clause) => clause.title && clause.text);
}

function calculateQuoteTotals(quote = {}) {
  const items = normalizeQuoteItems(quote.items || []);
  const subtotalCents = items.reduce((total, item) => (
    total + Math.round(item.quantity * item.unitPriceCents)
  ), 0);
  const discountType = ["none", "percent", "fixed"].includes(quote.discountType)
    ? quote.discountType
    : "none";
  const discountValue = discountType === "percent"
    ? normalizePercent(quote.discountValue || 0)
    : discountType === "fixed" ? normalizeMoneyCents(quote.discountValue || 0) : 0;
  const discountCents = discountType === "percent"
    ? Math.round(subtotalCents * (discountValue / 100))
    : Math.min(subtotalCents, discountValue);
  return {
    items,
    subtotalCents,
    discountType,
    discountValue,
    discountCents,
    totalCents: Math.max(0, subtotalCents - discountCents),
  };
}

function effectiveQuoteStatus(quote = {}) {
  if (["accepted", "cancelled", "draft"].includes(quote.status)) return quote.status;
  if (quote.validUntil) {
    const expiresAt = new Date(`${quote.validUntil}T23:59:59-03:00`).getTime();
    if (Number.isFinite(expiresAt) && expiresAt < Date.now()) return "expired";
  }
  return ["published", "viewed"].includes(quote.status) ? quote.status : "draft";
}

function quoteContractor(env) {
  return {
    name: env.BRAND_LEGAL_NAME || env.BRAND_NAME || "Marcel Conde | Photography",
    document: env.BRAND_CNPJ || "67.096.533/0001-90",
    email: env.CONTACT_EMAIL || "contato@marcelconde.com.br",
    phone: env.BRAND_PHONE || "(81) 98409-4212",
    city: env.BRAND_CITY || "Recife, PE",
  };
}

function quoteClientSnapshot(client = {}) {
  return {
    id: client.id || "",
    name: client.name || "Cliente",
    email: normalizeEmail(client.email || ""),
    phone: client.phone || "",
    document: client.document || "",
    companyName: client.companyName || "",
    address: client.address || {},
  };
}

function quotePublishedSnapshot(env, quote = {}, client = {}) {
  const totals = calculateQuoteTotals(quote);
  return {
    quoteId: quote.id,
    number: quote.number,
    version: Number(quote.version || 1),
    title: quote.title,
    serviceDescription: quote.serviceDescription || "",
    serviceDate: quote.serviceDate || "",
    serviceLocation: quote.serviceLocation || "",
    deliveryEstimate: quote.deliveryEstimate || "",
    validUntil: quote.validUntil || "",
    items: totals.items,
    subtotalCents: totals.subtotalCents,
    discountType: totals.discountType,
    discountValue: totals.discountValue,
    discountCents: totals.discountCents,
    totalCents: totals.totalCents,
    paymentMethods: normalizeQuotePaymentMethods(quote.paymentMethods || []),
    paymentTerms: cleanGalleryText(quote.paymentTerms || "", 1600),
    clauses: normalizeQuoteClauses(quote.clauses || []),
    notesForClient: cleanGalleryText(quote.notesForClient || "", 1600),
    client: quoteClientSnapshot(client),
    contractor: quoteContractor(env),
  };
}

function publicQuote(quote = {}) {
  const totals = calculateQuoteTotals(quote);
  return {
    id: quote.id,
    number: quote.number,
    clientId: quote.clientId,
    title: quote.title,
    serviceDescription: quote.serviceDescription || "",
    serviceDate: quote.serviceDate || "",
    serviceLocation: quote.serviceLocation || "",
    deliveryEstimate: quote.deliveryEstimate || "",
    validUntil: quote.validUntil || "",
    items: totals.items,
    subtotalCents: totals.subtotalCents,
    discountType: totals.discountType,
    discountValue: totals.discountValue,
    discountCents: totals.discountCents,
    totalCents: totals.totalCents,
    paymentMethods: normalizeQuotePaymentMethods(quote.paymentMethods || []),
    paymentTerms: quote.paymentTerms || "",
    clauses: normalizeQuoteClauses(quote.clauses || []),
    notesForClient: quote.notesForClient || "",
    status: effectiveQuoteStatus(quote),
    version: Number(quote.version || 0),
    publishedAt: quote.publishedAt || null,
    viewedAt: quote.viewedAt || null,
    acceptedAt: quote.acceptedAt || null,
    acceptance: quote.acceptance ? {
      name: quote.acceptance.name,
      email: quote.acceptance.email,
      document: quote.acceptance.document || "",
      acceptedAt: quote.acceptance.acceptedAt,
      code: quote.acceptance.code,
      hash: quote.acceptance.hash,
    } : null,
    createdAt: quote.createdAt || null,
    updatedAt: quote.updatedAt || null,
  };
}

async function appendPrivateQuoteEvent(env, request, quoteId, action, details = {}, actor = {}) {
  try {
    if (!env.LIKES_KV || !quoteId) return;
    const events = await readKvJson(env, privateQuoteEventsKey(quoteId), []);
    events.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      action,
      details,
      actorEmail: actor.email || null,
      actorName: actor.name || null,
      createdAt: new Date().toISOString(),
      ip: request.headers.get("CF-Connecting-IP") || "",
      userAgent: request.headers.get("User-Agent") || "",
    });
    await writeKvJson(env, privateQuoteEventsKey(quoteId), events.slice(0, 300));
  } catch (err) {
    console.error("Private quote event failed:", err);
  }
}

async function listPrivateQuotes(env) {
  const ids = await readKvJson(env, privateQuotesIndexKey(), []);
  const quotes = await Promise.all(ids.map((id) => readKvJson(env, privateQuoteKey(id), null)));
  return quotes.filter(Boolean).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

async function savePrivateQuote(env, input = {}) {
  if (!env.LIKES_KV) throw new Error("LIKES_KV not configured");
  const now = new Date().toISOString();
  const id = String(input.id || `orc_${randomToken(9)}`).replace(/[^a-zA-Z0-9_-]/g, "");
  const existing = await readKvJson(env, privateQuoteKey(id), {});
  if (existing.status === "accepted") {
    throw Object.assign(
      new Error("Um contrato aceito não pode ser alterado. Duplique-o para criar uma nova versão."),
      { status: 409 }
    );
  }

  const totals = calculateQuoteTotals({
    items: input.items ?? existing.items ?? [],
    discountType: input.discountType ?? existing.discountType ?? "none",
    discountValue: input.discountValue ?? existing.discountValue ?? 0,
  });
  const defaultValidity = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const quote = {
    ...existing,
    id,
    number: existing.number || `ORC-${new Date().getFullYear()}-${randomToken(4).slice(0, 6).toUpperCase()}`,
    clientId: String(input.clientId ?? existing.clientId ?? ""),
    title: cleanDisplayName(input.title ?? existing.title ?? "Ensaio fotográfico"),
    serviceDescription: cleanGalleryText(input.serviceDescription ?? existing.serviceDescription ?? "", 5000),
    serviceDate: String(input.serviceDate ?? existing.serviceDate ?? "").slice(0, 10),
    serviceLocation: cleanDisplayName(input.serviceLocation ?? existing.serviceLocation ?? ""),
    deliveryEstimate: cleanGalleryText(input.deliveryEstimate ?? existing.deliveryEstimate ?? "", 500),
    validUntil: String(input.validUntil ?? existing.validUntil ?? defaultValidity).slice(0, 10),
    items: totals.items,
    discountType: totals.discountType,
    discountValue: totals.discountValue,
    paymentMethods: normalizeQuotePaymentMethods(input.paymentMethods ?? existing.paymentMethods ?? defaultQuotePaymentMethods()),
    paymentTerms: cleanGalleryText(input.paymentTerms ?? existing.paymentTerms ?? "", 1600),
    clauses: normalizeQuoteClauses(input.clauses ?? existing.clauses ?? defaultQuoteClauses()),
    notesForClient: cleanGalleryText(input.notesForClient ?? existing.notesForClient ?? "", 1600),
    internalNotes: cleanGalleryText(input.internalNotes ?? existing.internalNotes ?? "", 1600),
    status: ["published", "viewed"].includes(existing.status) ? "draft" : (existing.status || "draft"),
    publishedSnapshot: ["published", "viewed"].includes(existing.status) ? null : (existing.publishedSnapshot || null),
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };

  await writeKvJson(env, privateQuoteKey(id), quote);
  const index = await readKvJson(env, privateQuotesIndexKey(), []);
  await writeKvJson(env, privateQuotesIndexKey(), [...new Set([id, ...index])]);
  return quote;
}

async function deletePrivateQuote(env, quoteId) {
  if (!env.LIKES_KV) throw new Error("LIKES_KV not configured");
  const id = String(quoteId || "").trim();
  const quote = await readKvJson(env, privateQuoteKey(id), null);
  if (!quote) return null;
  if (quote.status === "accepted") {
    throw Object.assign(
      new Error("Contratos aceitos devem ser preservados e não podem ser apagados."),
      { status: 409 }
    );
  }
  const index = await readKvJson(env, privateQuotesIndexKey(), []);
  await Promise.all([
    env.LIKES_KV.delete(privateQuoteKey(id)),
    env.LIKES_KV.delete(privateQuoteEventsKey(id)),
    writeKvJson(env, privateQuotesIndexKey(), index.filter((item) => item !== id)),
  ]);
  return quote;
}

function shouldRepairGalleryToEditing(gallery = {}, latestPayment = null, events = []) {
  if (gallery?.status !== "selection") return false;
  const reopenedAt = Date.parse(gallery.selectionReopenedAt || "") || 0;
  const completionTimes = [
    gallery.selectionCompletedAt,
    latestPayment?.status === "approved" ? latestPayment.selectionCompletedAt : null,
    ...events
      .filter((event) => event?.action === "concluir_selecao" || event?.action === "pix_aprovado")
      .map((event) => event.createdAt),
  ]
    .map((value) => Date.parse(value || "") || 0)
    .filter(Boolean);
  const latestCompletionAt = completionTimes.length ? Math.max(...completionTimes) : 0;
  return latestCompletionAt > reopenedAt;
}

async function getPrivateGalleryLatestPayment(env, galleryId = "") {
  if (!env.LIKES_KV || !galleryId) return null;
  const latestPaymentId = await env.LIKES_KV.get(privateGalleryLatestPaymentKey(galleryId));
  if (!latestPaymentId) return null;
  return readKvJson(env, privateGalleryPaymentKey(latestPaymentId), null);
}

async function repairPrivateGalleryProgress(env, gallery = {}, latestPayment = null, events = []) {
  if (!gallery?.id || !shouldRepairGalleryToEditing(gallery, latestPayment, events)) return gallery;
  const completionEvent = events.find((event) => (
    event?.action === "concluir_selecao" ||
    event?.action === "pix_aprovado"
  ));
  const repaired = {
    ...gallery,
    status: "editing",
    selectionCompletedAt: gallery.selectionCompletedAt || latestPayment?.selectionCompletedAt || completionEvent?.createdAt || new Date().toISOString(),
    selectionPaymentId: gallery.selectionPaymentId || latestPayment?.id || null,
    updatedAt: new Date().toISOString(),
  };
  await writeKvJson(env, privateGalleryKey(gallery.id), repaired);
  return repaired;
}

async function savePrivateClient(env, input = {}) {
  if (!env.LIKES_KV) throw new Error("LIKES_KV not configured");
  const now = new Date().toISOString();
  const id = String(input.id || `cli_${randomToken(9)}`).replace(/[^a-zA-Z0-9_-]/g, "");
  const existing = await readKvJson(env, privateClientKey(id), {});
  const client = {
    ...existing,
    id,
    name: cleanDisplayName(input.name || existing.name || "Cliente"),
    email: normalizeEmail(input.email || existing.email || ""),
    phone: cleanDisplayName(input.phone || existing.phone || ""),
    document: cleanDisplayName(input.document || existing.document || ""),
    companyName: cleanDisplayName(input.companyName || existing.companyName || ""),
    address: {
      postalCode: cleanDisplayName(input.address?.postalCode || existing.address?.postalCode || ""),
      street: cleanDisplayName(input.address?.street || existing.address?.street || ""),
      number: cleanDisplayName(input.address?.number || existing.address?.number || ""),
      complement: cleanDisplayName(input.address?.complement || existing.address?.complement || ""),
      neighborhood: cleanDisplayName(input.address?.neighborhood || existing.address?.neighborhood || ""),
      city: cleanDisplayName(input.address?.city || existing.address?.city || ""),
      state: cleanDisplayName(input.address?.state || existing.address?.state || "").slice(0, 2).toUpperCase(),
    },
    notes: cleanGalleryText(input.notes || existing.notes || "", 600),
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };
  await writeKvJson(env, privateClientKey(id), client);
  const index = await readKvJson(env, privateClientsIndexKey(), []);
  await writeKvJson(env, privateClientsIndexKey(), [...new Set([id, ...index])]);
  return client;
}

async function listPrivateGalleries(env) {
  const ids = await readKvJson(env, privateGalleriesIndexKey(), []);
  const galleries = await Promise.all(ids.map(async (id) => {
    const gallery = await readKvJson(env, privateGalleryKey(id), null);
    if (!gallery) return null;
    return repairPrivateGalleryProgress(env, gallery, await getPrivateGalleryLatestPayment(env, gallery.id));
  }));
  return galleries.filter(Boolean).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

async function savePrivateGallery(env, input = {}) {
  if (!env.LIKES_KV) throw new Error("LIKES_KV not configured");
  const now = new Date().toISOString();
  const id = String(input.id || `gal_${randomToken(9)}`).replace(/[^a-zA-Z0-9_-]/g, "");
  const existing = await readKvJson(env, privateGalleryKey(id), {});
  const title = cleanDisplayName(input.title || existing.title || "Galeria privada");
  const requestedSlug = slugify(input.slug || existing.slug || title);
  const previousSlug = existing.slug || "";
  let slug = requestedSlug;
  const slugOwner = await readKvJson(env, privateGalleryBySlugKey(slug), null);
  if (slugOwner && slugOwner !== id) slug = `${slug}-${randomToken(3).toLowerCase()}`;
  const commerce = normalizeGalleryCommerce(input, existing);
  const requestedStatus = ["selection", "editing", "final"].includes(input.status || existing.status)
    ? (input.status || existing.status)
    : "selection";
  const reopeningSelection = requestedStatus === "selection" && Boolean(
    existing.status && (
      existing.status !== "selection" ||
      existing.selectionCompletedAt ||
      existing.selectionLockedAt ||
      existing.allowDownload === true
    )
  );

  const gallery = {
    ...existing,
    id,
    clientId: String(input.clientId || existing.clientId || ""),
    slug,
    title,
    subtitle: cleanGalleryText(input.subtitle || existing.subtitle || "", 180),
    message: cleanGalleryText(input.message || existing.message || "", 1200),
    selectionLimit: normalizeSelectionLimit(input.selectionLimit ?? existing.selectionLimit, existing.selectionLimit ?? 15),
    ...commerce,
    status: requestedStatus,
    allowDownload: requestedStatus === "final",
    coverUrl: String(input.coverUrl || existing.coverUrl || ""),
    coverPublicId: sanitizePublicId(input.coverPublicId || existing.coverPublicId || ""),
    watermark: normalizeWatermark(input.watermark || existing.watermark || {}),
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };

  if (reopeningSelection) {
    Object.assign(gallery, {
      selectionCompletedAt: null,
      selectionLockedPublicIds: [],
      selectionLockedPricing: null,
      selectionLockedAt: null,
      selectionPaymentId: null,
      selectionRevision: 0,
      selectionReopenedAt: now,
    });
  }

  await writeKvJson(env, privateGalleryKey(id), gallery);
  await writeKvJson(env, privateGalleryBySlugKey(slug), id);
  if (previousSlug && previousSlug !== slug) await env.LIKES_KV.delete(privateGalleryBySlugKey(previousSlug));
  if (reopeningSelection) {
    await Promise.all([
      writeKvJson(env, privateGallerySelectionKey(id), []),
      env.LIKES_KV.delete(privateGalleryLatestPaymentKey(id)),
    ]);
  }

  const index = await readKvJson(env, privateGalleriesIndexKey(), []);
  await writeKvJson(env, privateGalleriesIndexKey(), [...new Set([id, ...index])]);
  return gallery;
}

async function deletePrivateClient(env, clientId) {
  if (!env.LIKES_KV) throw new Error("LIKES_KV not configured");
  const id = String(clientId || "").trim();
  if (!id) throw new Error("Cliente inválido.");

  const client = await readKvJson(env, privateClientKey(id), null);
  if (!client) return null;

  const galleries = await listPrivateGalleries(env);
  const linkedGalleries = galleries.filter((gallery) => gallery.clientId === id);
  const quotes = await listPrivateQuotes(env);
  const linkedQuotes = quotes.filter((quote) => quote.clientId === id);
  if (linkedGalleries.length || linkedQuotes.length) {
    throw Object.assign(
      new Error("Este cliente possui galerias ou orçamentos vinculados. Remova ou transfira esses registros antes."),
      {
        status: 409,
        linkedGalleries: linkedGalleries.length,
        linkedQuotes: linkedQuotes.length,
      }
    );
  }

  const index = await readKvJson(env, privateClientsIndexKey(), []);
  const clientEmail = normalizeEmail(client.email || "");
  const otherClients = (await listPrivateClients(env)).filter((item) => item.id !== id);
  const emailStillUsed = clientEmail && otherClients.some((item) => normalizeEmail(item.email || "") === clientEmail);
  const deleteOps = [
    env.LIKES_KV.delete(privateClientKey(id)),
    writeKvJson(env, privateClientsIndexKey(), index.filter((item) => item !== id)),
  ];
  if (clientEmail && !emailStillUsed) deleteOps.push(env.LIKES_KV.delete(clientUserKey(clientEmail)));
  await Promise.allSettled(deleteOps);

  return client;
}

async function deletePrivateGallery(env, galleryId) {
  if (!env.LIKES_KV) throw new Error("LIKES_KV not configured");
  const id = String(galleryId || "").trim();
  if (!id) throw new Error("Galeria inválida.");

  const gallery = await readKvJson(env, privateGalleryKey(id), null);
  if (!gallery) return null;

  const images = await readKvJson(env, privateGalleryImagesKey(id), []);
  const deletedIds = new Set();
  const failed = [];

  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;

  if (images.length && (!cloudName || !apiKey || !apiSecret)) {
    throw Object.assign(new Error("Missing Cloudinary env vars"), { status: 500 });
  }

  for (const image of images) {
    const publicId = sanitizePublicId(image.public_id || "");
    if (!publicId) continue;
    try {
      await destroyCloudinaryImage(cloudName, apiKey, apiSecret, publicId);
      deletedIds.add(publicId);
    } catch (err) {
      failed.push({
        public_id: publicId,
        error: String(err?.message || err || "unknown"),
      });
    }
  }

  const index = await readKvJson(env, privateGalleriesIndexKey(), []);
  const deleteOps = [
    env.LIKES_KV.delete(privateGalleryKey(id)),
    env.LIKES_KV.delete(privateGalleryImagesKey(id)),
    env.LIKES_KV.delete(privateGallerySelectionKey(id)),
    env.LIKES_KV.delete(privateGalleryEventsKey(id)),
    env.LIKES_KV.delete(privateGalleryLatestPaymentKey(id)),
    env.LIKES_KV.delete(privateGalleryBySlugKey(gallery.slug || "")),
    writeKvJson(env, privateGalleriesIndexKey(), index.filter((item) => item !== id)),
  ];

  await Promise.allSettled(deleteOps);

  if (cloudName && apiKey && apiSecret && gallery.slug) {
    const auth = btoa(`${apiKey}:${apiSecret}`);
    await Promise.allSettled([
      deleteCloudinaryFolder(cloudName, auth, `clientes/${gallery.slug}/selecao`),
      deleteCloudinaryFolder(cloudName, auth, `clientes/${gallery.slug}/finais`),
      deleteCloudinaryFolder(cloudName, auth, `clientes/${gallery.slug}`),
    ]);
  }

  return {
    gallery,
    deleted: deletedIds.size,
    failed,
  };
}

async function getPrivateGalleryBySlug(env, slug = "") {
  const id = await readKvJson(env, privateGalleryBySlugKey(slugify(slug)), "");
  if (!id) return null;
  const gallery = await readKvJson(env, privateGalleryKey(id), null);
  if (!gallery) return null;
  return repairPrivateGalleryProgress(env, gallery, await getPrivateGalleryLatestPayment(env, gallery.id));
}

function getAlbumSlugFromPath(path = "") {
  return String(path).replace(/^portfolio\//, "");
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function sha1Hex(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-1", data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function signCloudinaryParams(params, apiSecret) {
  const serialized = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return sha1Hex(`${serialized}${apiSecret}`);
}

async function listCloudinaryFolders(cloudName, auth, path) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const res = await fetchWithTimeout(
    `https://api.cloudinary.com/v1_1/${cloudName}/folders/${encodedPath}`,
    { headers: { Authorization: `Basic ${auth}` } },
    12000
  );

  if (res.status === 404) return [];
  const text = await res.text();
  if (!res.ok) throw new Error(`Cloudinary folders ${res.status}: ${text}`);

  const data = JSON.parse(text);
  return data.folders || [];
}

async function searchCloudinaryImages(cloudName, auth, path) {
  const resources = [];
  let nextCursor = "";

  do {
    const body = {
      expression: `asset_folder="${path}" AND resource_type:image`,
      sort_by: [{ public_id: "asc" }],
      max_results: 500,
    };
    if (nextCursor) body.next_cursor = nextCursor;

    const res = await fetchWithTimeout(
      `https://api.cloudinary.com/v1_1/${cloudName}/resources/search`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      15000
    );

    const text = await res.text();
    if (!res.ok) throw new Error(`Cloudinary search ${res.status}: ${text}`);

    const data = JSON.parse(text);
    resources.push(...(data.resources || []));
    nextCursor = data.next_cursor || "";
  } while (nextCursor);

  return resources;
}

async function destroyCloudinaryImage(cloudName, apiKey, apiSecret, publicId) {
  const timestamp = Math.round(Date.now() / 1000);
  const params = {
    public_id: sanitizePublicId(publicId),
    invalidate: "true",
    timestamp,
  };
  const signature = await signCloudinaryParams(params, apiSecret);
  const body = new URLSearchParams({
    public_id: params.public_id,
    invalidate: params.invalidate,
    timestamp: String(params.timestamp),
    api_key: String(apiKey),
    signature: String(signature),
  });

  const res = await fetchWithTimeout(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
    15000
  );

  const text = await res.text();
  if (!res.ok) throw new Error(`Cloudinary destroy ${res.status}: ${text}`);
  return text;
}

async function generateCloudinaryArchive(cloudName, apiKey, apiSecret, publicIds = [], archiveName = "galeria-fotos") {
  const timestamp = Math.round(Date.now() / 1000);
  const cleanPublicIds = publicIds.map((publicId) => sanitizePublicId(publicId)).filter(Boolean);
  const params = {
    flatten_folders: "true",
    mode: "download",
    public_ids: cleanPublicIds.join(","),
    target_format: "zip",
    target_public_id: archiveName,
    use_original_filename: "true",
    timestamp,
  };
  const signature = await signCloudinaryParams(params, apiSecret);
  const body = new URLSearchParams({
    flatten_folders: params.flatten_folders,
    mode: params.mode,
    target_format: params.target_format,
    target_public_id: params.target_public_id,
    use_original_filename: params.use_original_filename,
    timestamp: String(params.timestamp),
    api_key: apiKey,
    signature,
  });
  cleanPublicIds.forEach((publicId) => body.append("public_ids[]", publicId));

  return fetchWithTimeout(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/generate_archive`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
    60000
  );
}

async function deleteCloudinaryFolder(cloudName, auth, path) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const res = await fetchWithTimeout(
    `https://api.cloudinary.com/v1_1/${cloudName}/folders/${encodedPath}`,
    {
      method: "DELETE",
      headers: { Authorization: `Basic ${auth}` },
    },
    12000
  );

  const text = await res.text();
  if (res.status === 404) return { deleted: false, missing: true };
  if (!res.ok) throw new Error(`Cloudinary delete folder ${res.status}: ${text}`);

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function createCloudinaryFolder(cloudName, auth, path) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const res = await fetchWithTimeout(
    `https://api.cloudinary.com/v1_1/${cloudName}/folders/${encodedPath}`,
    {
      method: "POST",
      headers: { Authorization: `Basic ${auth}` },
    },
    12000
  );

  const text = await res.text();
  if (res.status === 409) return { existed: true };
  if (!res.ok) throw new Error(`Cloudinary create folder ${res.status}: ${text}`);

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function deleteAlbumRecursive(env, request, path, stats = { folders: 0, images: 0 }) {
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey    = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) throw new Error("Missing Cloudinary env vars");

  const auth = btoa(`${apiKey}:${apiSecret}`);
  const children = await listCloudinaryFolders(cloudName, auth, path);

  for (const child of children) {
    await deleteAlbumRecursive(env, request, child.path, stats);
  }

  const images = await searchCloudinaryImages(cloudName, auth, path);
  for (const image of images) {
    await destroyCloudinaryImage(cloudName, apiKey, apiSecret, image.public_id);
    stats.images += 1;
  }

  await deleteCloudinaryFolder(cloudName, auth, path);
  stats.folders += 1;

  if (env.LIKES_KV) {
    const slug = getAlbumSlugFromPath(path);
    await Promise.allSettled([
      env.LIKES_KV.delete(albumCoverKey(path)),
      env.LIKES_KV.delete(deletedAssetsKey(path)),
      env.LIKES_KV.delete(`likes:${slug}`),
      env.LIKES_KV.delete(`asset_likes:${slug}`),
    ]);
  }

  await clearWorkerCache(caches.default, request, path);
  return stats;
}

async function clearWorkerCache(cache, request, path = "") {
  const requestUrl = new URL(request.url);
  const origins = new Set([
    requestUrl.origin,
    "https://api.marcelconde.com.br",
    "https://cloudinary.marcel-conde.workers.dev",
  ]);
  const urls = new Set([
  ]);

  for (const origin of origins) {
    urls.add(`${origin}/albums`);

    if (path) {
      urls.add(`${origin}/album?path=${encodeURIComponent(path)}`);

      const parts = path.split("/").filter(Boolean);
      for (let i = 1; i <= parts.length; i++) {
        urls.add(`${origin}/albums?path=${encodeURIComponent(parts.slice(0, i).join("/"))}`);
      }
    }
  }

  await Promise.allSettled([...urls].map((item) => cache.delete(makeCacheKey(item))));
}

function sanitizePublicId(publicId = "") {
  return String(publicId).trim().replace(/\.(jpg|jpeg|png|webp|gif|heic|avif)$/i, "");
}

function sanitizeDownloadName(value = "galeria") {
  return String(value || "galeria")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "galeria";
}

function getBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return "";
}

function getAdminToken(request) {
  return request.headers.get("X-Admin-Token") || getBearerToken(request);
}

function normalizeEmail(email = "") {
  return String(email).trim().toLowerCase();
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function randomToken(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return bytesToBase64(data)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function generateTemporaryPassword(length = 12) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(Math.max(8, length)));
  const value = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `MC-${value}`;
}

async function hashPassword(password, saltBase64 = "", pepper = "") {
  const saltBytes = saltBase64 ? base64ToBytes(saltBase64) : crypto.getRandomValues(new Uint8Array(16));
  const salt = bytesToBase64(saltBytes);
  const data = new TextEncoder().encode(`${salt}:${password}:${pepper}`);
  const digest = await crypto.subtle.digest("SHA-256", data);

  return {
    algorithm: "SHA-256",
    salt,
    hash: bytesToBase64(new Uint8Array(digest)),
  };
}

async function verifyPassword(password, stored, env) {
  if (!stored?.hash || !stored?.salt) return false;
  const candidate = await hashPassword(password, stored.salt, authPepper(env));
  return candidate.hash === stored.hash;
}

function authPepper(env) {
  return env.AUTH_PEPPER || env.ADMIN_KEY || env.ADMIN_PASSWORD || "";
}

function adminEmail(env) {
  return normalizeEmail(env.ADMIN_EMAIL || "marcel.conde@hotmail.com");
}

async function getStoredAdmin(env) {
  return getAdminUser(env, adminEmail(env));
}

async function saveAdminPassword(env, password) {
  return saveUserPassword(env, adminEmail(env), password, {
    name: env.ADMIN_NAME || "Marcel Conde",
    role: "admin",
  });
}

async function validateAdminLogin(env, email, password) {
  const cleanEmail = normalizeEmail(email);
  const stored = await getAdminUser(env, cleanEmail);
  if (stored && stored.active === false) return null;
  if (stored?.passwordHash && await verifyPassword(password, stored.passwordHash, env)) {
    return publicUser(stored);
  }

  const initialPassword = env.ADMIN_PASSWORD || env.ADMIN_KEY || "";
  if (!stored && cleanEmail === adminEmail(env) && initialPassword && password === initialPassword) {
    const user = await saveUserPassword(env, cleanEmail, password, {
      name: env.ADMIN_NAME || "Marcel Conde",
      role: "admin",
    });
    return publicUser(user);
  }

  return null;
}

async function createSession(env, user) {
  if (!env.LIKES_KV) throw new Error("LIKES_KV not configured");
  const token = randomToken(36);
  const now = Date.now();
  const session = {
    email: user.email,
    name: user.name,
    role: normalizeRole(user.role || "editor"),
    createdAt: new Date(now).toISOString(),
    expiresAt: now + 1000 * 60 * 60 * 12,
  };
  await env.LIKES_KV.put(`admin_session:${token}`, JSON.stringify(session), {
    expirationTtl: 60 * 60 * 12,
  });
  return { token, user: publicUser(user) };
}

async function getSession(env, token) {
  if (!token || !env.LIKES_KV) return null;
  const session = await env.LIKES_KV.get(`admin_session:${token}`, "json");
  if (!session || Number(session.expiresAt || 0) < Date.now()) return null;
  return session;
}

async function getClientUser(env, email) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || !env.LIKES_KV) return null;
  return env.LIKES_KV.get(clientUserKey(cleanEmail), "json");
}

function clientAccessSummary(user = {}) {
  return {
    hasPassword: Boolean(user.passwordHash || user.hasPassword),
    mustChangePassword: user.mustChangePassword === true,
    passwordUpdatedAt: user.passwordUpdatedAt || user.updatedAt || null,
  };
}

function hasPermanentClientAccess(user = {}) {
  return user?.active !== false &&
    Boolean(user?.passwordHash) &&
    user?.mustChangePassword !== true;
}

async function getClientAccessSummary(env, email) {
  const user = await getClientUser(env, email);
  return clientAccessSummary(user || {});
}

async function saveClientPassword(env, email, password, profile = {}) {
  if (!env.LIKES_KV) throw new Error("LIKES_KV not configured");
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || password.length < 6) throw new Error("Dados de cliente inválidos");

  const existing = await getClientUser(env, cleanEmail);
  const now = new Date().toISOString();
  const user = {
    ...existing,
    email: cleanEmail,
    name: cleanDisplayName(profile.name || existing?.name || cleanEmail),
    passwordHash: await hashPassword(password, "", authPepper(env)),
    mustChangePassword: profile.mustChangePassword === true,
    passwordUpdatedAt: now,
    active: true,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await writeKvJson(env, clientUserKey(cleanEmail), user);
  return publicClientUser(user);
}

async function issueClientTemporaryPassword(env, client = {}) {
  if (!client.email) throw new Error("Cliente sem e-mail cadastrado.");
  const temporaryPassword = generateTemporaryPassword();
  const user = await saveClientPassword(env, client.email, temporaryPassword, {
    name: client.name || client.email,
    mustChangePassword: true,
  });
  return {
    temporaryPassword,
    user,
    access: {
      hasPassword: true,
      mustChangePassword: true,
      passwordUpdatedAt: user.updatedAt || new Date().toISOString(),
    },
  };
}

async function validateClientLogin(env, email, password) {
  const cleanEmail = normalizeEmail(email);
  const stored = await getClientUser(env, cleanEmail);
  if (stored && stored.active === false) return null;
  if (stored?.passwordHash && await verifyPassword(password, stored.passwordHash, env)) {
    return publicClientUser(stored);
  }
  return null;
}

async function createClientSession(env, user) {
  if (!env.LIKES_KV) throw new Error("LIKES_KV not configured");
  const token = randomToken(36);
  const now = Date.now();
  const session = {
    email: normalizeEmail(user.email || ""),
    name: user.name || user.email || "Cliente",
    mustChangePassword: user.mustChangePassword === true,
    createdAt: new Date(now).toISOString(),
    expiresAt: now + 1000 * 60 * 60 * 24 * 30,
  };
  await writeKvJson(env, clientSessionKey(token), session, {
    expirationTtl: 60 * 60 * 24 * 30,
  });
  return { token, user: publicClientUser(session) };
}

async function getClientSession(env, token) {
  if (!token || !env.LIKES_KV) return null;
  const session = await env.LIKES_KV.get(clientSessionKey(token), "json");
  if (!session || Number(session.expiresAt || 0) < Date.now()) return null;
  return session;
}

async function getCurrentClient(request, env) {
  return getClientSession(env, getBearerToken(request));
}

async function requireClientGalleryAccess(request, env, gallery) {
  const session = await getCurrentClient(request, env);
  if (!session) return { error: errorJson("Faça login para acessar esta galeria.", 401) };
  if (session.mustChangePassword === true) {
    return { error: errorJson("Crie sua senha definitiva antes de acessar esta galeria.", 403, { passwordChangeRequired: true }) };
  }

  const linkedClient = gallery?.clientId
    ? await readKvJson(env, privateClientKey(gallery.clientId), null)
    : null;
  const allowedEmail = normalizeEmail(linkedClient?.email || gallery?.clientEmail || "");

  if (!allowedEmail || normalizeEmail(session.email) !== allowedEmail) {
    return { error: errorJson("Esta galeria pertence a outro cliente.", 403) };
  }

  return { client: publicClientUser(session), linkedClient };
}

function clientGalleryInviteUrl(env, token) {
  const origin = String(env.SITE_URL || "https://marcelconde.com.br").replace(/\/+$/, "");
  return `${origin}/clientes/login/?convite=${encodeURIComponent(token)}`;
}

function clientGalleryUrl(env, slug) {
  const origin = String(env.SITE_URL || "https://marcelconde.com.br").replace(/\/+$/, "");
  return `${origin}/clientes/galeria/?slug=${encodeURIComponent(slug)}`;
}

function clientLoginUrl(env) {
  const origin = String(env.SITE_URL || "https://marcelconde.com.br").replace(/\/+$/, "");
  return `${origin}/clientes/login/`;
}

function clientGalleryLoginUrl(env, slug) {
  const origin = String(env.SITE_URL || "https://marcelconde.com.br").replace(/\/+$/, "");
  const next = `/clientes/galeria/?slug=${encodeURIComponent(slug || "")}`;
  return `${origin}/clientes/login/?next=${encodeURIComponent(next)}`;
}

function clientQuoteUrl(env, quoteId) {
  const origin = siteOrigin(env);
  return `${origin}/clientes/orcamento/?id=${encodeURIComponent(quoteId || "")}`;
}

function clientQuoteLoginUrl(env, quoteId) {
  const next = `/clientes/orcamento/?id=${encodeURIComponent(quoteId || "")}`;
  return `${clientLoginUrl(env)}?next=${encodeURIComponent(next)}`;
}

function clientQuoteInviteUrl(env, token) {
  return `${clientLoginUrl(env)}?convite=${encodeURIComponent(token)}`;
}

async function createClientContentInvite(env, kind, clientId, contentId) {
  const token = randomToken(36);
  const now = Date.now();
  const invite = {
    clientId,
    ...(kind === "quote" ? { quoteId: contentId } : { galleryId: contentId }),
    createdAt: new Date(now).toISOString(),
    expiresAt: now + 1000 * 60 * 60 * 24 * 7,
  };

  if (kind === "quote") {
    await writeKvJson(env, clientQuoteInviteKey(token), invite, { expirationTtl: 60 * 60 * 24 * 7 });
    return { token, url: clientQuoteInviteUrl(env, token) };
  }

  await writeKvJson(env, clientGalleryInviteKey(token), invite, { expirationTtl: 60 * 60 * 24 * 7 });
  return { token, url: clientGalleryInviteUrl(env, token) };
}

function clientPasswordResetUrl(env, token) {
  return `${clientLoginUrl(env)}?redefinir=${encodeURIComponent(token)}`;
}

async function requireClientQuoteAccess(request, env, quote) {
  const session = await getCurrentClient(request, env);
  if (!session) return { error: errorJson("Faça login para acessar este orçamento.", 401) };
  if (session.mustChangePassword === true) {
    return { error: errorJson("Crie sua senha definitiva antes de acessar este orçamento.", 403, { passwordChangeRequired: true }) };
  }
  const linkedClient = quote?.clientId
    ? await readKvJson(env, privateClientKey(quote.clientId), null)
    : null;
  const allowedEmail = normalizeEmail(linkedClient?.email || quote?.publishedSnapshot?.client?.email || "");
  if (!allowedEmail || normalizeEmail(session.email) !== allowedEmail) {
    return { error: errorJson("Este orçamento pertence a outro cliente.", 403) };
  }
  return { client: publicClientUser(session), linkedClient };
}

function emailHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function siteOrigin(env) {
  return String(env.SITE_URL || "https://marcelconde.com.br").replace(/\/+$/, "");
}

function brandName(env) {
  return env.BRAND_NAME || "Marcel Conde | Photography";
}

function resendFrom(env) {
  const configured = String(env.RESEND_FROM || env.CONTACT_EMAIL || "contato@marcelconde.com.br").trim();
  const match = configured.match(/<([^>]+)>/);
  const email = match?.[1] || configured;
  return `${brandName(env)} <${email}>`;
}

function emailButton(label, href, variant = "primary") {
  const styles = variant === "secondary"
    ? "background:#151515;color:#f7f3ed;border:1px solid #2a2a2a;"
    : "background:#c6a376;color:#0b0a08;border:1px solid #c6a376;";
  return `<a href="${emailHtml(href)}" style="${styles}display:inline-block;padding:15px 22px;text-decoration:none;border-radius:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;">${emailHtml(label)}</a>`;
}

function emailSocialIcon(label, href, iconUrl) {
  return `<a href="${emailHtml(href)}" title="${emailHtml(label)}" style="display:inline-block;width:44px;height:44px;border-radius:44px;background:#0b0a08;border:1px solid rgba(198,163,118,.55);text-align:center;text-decoration:none;">
    <img src="${emailHtml(iconUrl)}" width="22" height="22" alt="${emailHtml(label)}" style="display:block;width:22px;height:22px;margin:11px auto;border:0;outline:none;text-decoration:none;">
  </a>`;
}

function emailLayout(env, {
  preheader = "",
  eyebrow = "",
  title = "",
  intro = "",
  body = "",
  ctaLabel = "",
  ctaUrl = "",
  secondaryCtaLabel = "",
  secondaryCtaUrl = "",
  footerNote = "",
  reason = "Você recebeu este e-mail porque existe uma galeria vinculada ao seu cadastro na área do cliente.",
} = {}) {
  const origin = siteOrigin(env);
  const logoUrl = env.EMAIL_LOGO_URL || `${origin}/images/logo.png`;
  const instagramUrl = env.INSTAGRAM_URL || "https://www.instagram.com/mconde.foto/";
  const pinterestUrl = env.PINTEREST_URL || "https://br.pinterest.com/marcelconde/";
  const whatsappUrl = env.WHATSAPP_URL || "https://wa.me/5581984094212?text=Ol%C3%A1%21%20Vim%20pela%20%C3%A1rea%20do%20cliente.";
  const instagramIconUrl = env.EMAIL_INSTAGRAM_ICON_URL || "https://img.icons8.com/ios-glyphs/90/c6a376/instagram-new.png";
  const pinterestIconUrl = env.EMAIL_PINTEREST_ICON_URL || "https://img.icons8.com/ios-glyphs/90/c6a376/pinterest.png";
  const whatsappIconUrl = env.EMAIL_WHATSAPP_ICON_URL || "https://img.icons8.com/ios-glyphs/90/c6a376/whatsapp.png";
  const contactEmail = env.CONTACT_EMAIL || "contato@marcelconde.com.br";
  const cnpj = env.BRAND_CNPJ || "67.096.533/0001-90";
  const safeBrand = emailHtml(brandName(env));

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>${title ? emailHtml(title) : safeBrand}</title>
  </head>
  <body style="margin:0;padding:0;background:#0b0a08;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${emailHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0b0a08;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:34px 14px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:660px;background:#f7f3ed;border:1px solid rgba(198,163,118,.38);">
            <tr>
              <td style="padding:28px 30px 22px;background:#0b0a08;border-bottom:1px solid rgba(198,163,118,.38);">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <img src="${emailHtml(logoUrl)}" width="64" alt="${safeBrand}" style="display:block;width:64px;height:auto;border:0;outline:none;text-decoration:none;">
                    </td>
                    <td align="right" style="vertical-align:middle;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.4;color:#c6a376;letter-spacing:.18em;text-transform:uppercase;">
                      ${safeBrand}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:38px 30px 12px;">
                ${eyebrow ? `<p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#a98758;">${emailHtml(eyebrow)}</p>` : ""}
                <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:38px;line-height:1.02;font-weight:400;color:#151515;letter-spacing:0;">${emailHtml(title)}</h1>
                ${intro ? `<p style="margin:18px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#4b4741;">${intro}</p>` : ""}
              </td>
            </tr>
            <tr>
              <td style="padding:10px 30px 34px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.75;color:#2a2926;">
                ${body}
                ${ctaLabel && ctaUrl ? `<div style="margin:28px 0 0;">${emailButton(ctaLabel, ctaUrl)}</div>` : ""}
                ${secondaryCtaLabel && secondaryCtaUrl ? `<div style="margin:14px 0 0;">${emailButton(secondaryCtaLabel, secondaryCtaUrl, "secondary")}</div>` : ""}
                ${footerNote ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#6f6960;">${footerNote}</p>` : ""}
              </td>
            </tr>
            <tr>
              <td style="padding:24px 30px;background:#151515;border-top:1px solid rgba(198,163,118,.38);">
                <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#c6a376;">Acompanhe o trabalho</p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="padding:0 12px 8px 0;">${emailSocialIcon("Instagram", instagramUrl, instagramIconUrl)}</td>
                    <td style="padding:0 12px 8px 0;">${emailSocialIcon("Pinterest", pinterestUrl, pinterestIconUrl)}</td>
                    <td style="padding:0 0 8px 0;">${emailSocialIcon("WhatsApp", whatsappUrl, whatsappIconUrl)}</td>
                  </tr>
                </table>
                <p style="margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.7;color:#b9b1a6;">
                  ${safeBrand}<br>
                  CNPJ ${emailHtml(cnpj)} · Recife, PE · <a href="mailto:${emailHtml(contactEmail)}" style="color:#c6a376;text-decoration:none;">${emailHtml(contactEmail)}</a>
                </p>
                <p style="margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#7f776d;">
                  ${emailHtml(reason)}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendClientGalleryInviteEmail(env, email, token, gallery = {}, client = {}) {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY não configurada no Worker.");
  }

  const inviteUrl = clientGalleryInviteUrl(env, token);
  const galleryTitle = gallery.title || "sua galeria";
  const clientName = emailHtml(client.name || email);
  const html = emailLayout(env, {
    preheader: `Crie sua senha para acessar ${galleryTitle}.`,
    eyebrow: "Galeria privada",
    title: "Sua galeria está pronta",
    intro: `Olá ${clientName}, sua galeria <strong>${emailHtml(galleryTitle)}</strong> está disponível na área do cliente.`,
    body: `<p style="margin:0;">Para o primeiro acesso, crie sua senha pelo botão abaixo. Depois disso, você poderá voltar quando quiser usando seu e-mail e senha.</p>`,
    ctaLabel: "Criar senha e acessar",
    ctaUrl: inviteUrl,
    secondaryCtaLabel: "Abrir área do cliente",
    secondaryCtaUrl: clientLoginUrl(env),
    footerNote: "Este link de primeiro acesso expira em 7 dias.",
  });
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: resendFrom(env),
      to: [email],
      subject: `Sua galeria está disponível — ${galleryTitle}`,
      html,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function sendClientGalleryTemporaryPasswordEmail(env, email, gallery = {}, client = {}, temporaryPassword = "") {
  const galleryLoginUrl = clientGalleryLoginUrl(env, gallery.slug || "");
  const galleryTitle = gallery.title || "sua galeria";
  const html = emailLayout(env, {
    preheader: `Acesse ${galleryTitle} com sua senha temporária.`,
    eyebrow: "Galeria privada",
    title: "Sua galeria está disponível",
    intro: `Olá ${emailHtml(client.name || email)}, sua galeria <strong>${emailHtml(galleryTitle)}</strong> está disponível na área do cliente.`,
    body: `<p style="margin:0;">Use os dados abaixo para entrar. Por segurança, você deverá criar uma senha definitiva antes de acessar as fotos.</p>${temporaryPasswordEmailBlock(email, temporaryPassword)}`,
    ctaLabel: "Entrar e acessar galeria",
    ctaUrl: galleryLoginUrl,
    secondaryCtaLabel: "Área do cliente",
    secondaryCtaUrl: clientLoginUrl(env),
    footerNote: "A senha temporária deixa de funcionar depois que você cadastrar a senha definitiva.",
  });
  return sendResendMessage(env, {
    to: [email],
    subject: `Sua galeria está disponível — ${galleryTitle}`,
    html,
  });
}

async function sendClientGalleryLoginEmail(env, email, gallery = {}, client = {}) {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY não configurada no Worker.");
  }

  const galleryLoginUrl = clientGalleryLoginUrl(env, gallery.slug || "");
  const areaLoginUrl = clientLoginUrl(env);
  const galleryTitle = gallery.title || "sua galeria";
  const clientName = emailHtml(client.name || email);
  const html = emailLayout(env, {
    preheader: `Acesse ${galleryTitle} com seu e-mail e senha.`,
    eyebrow: "Área do cliente",
    title: "Sua galeria está disponível",
    intro: `Olá ${clientName}, sua galeria <strong>${emailHtml(galleryTitle)}</strong> está disponível na área do cliente.`,
    body: `<p style="margin:0;">Como você já possui senha cadastrada, entre pelo botão abaixo usando seu e-mail e senha.</p>`,
    ctaLabel: "Entrar e acessar galeria",
    ctaUrl: galleryLoginUrl,
    secondaryCtaLabel: "Área do cliente",
    secondaryCtaUrl: areaLoginUrl,
  });
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: resendFrom(env),
      to: [email],
      subject: `Sua galeria está disponível — ${gallery.title || "galeria"}`,
      html,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function sendClientFinalDeliveryEmail(env, email, gallery = {}, client = {}, accessUrl = "", firstAccess = false) {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY não configurada no Worker.");
  }

  const galleryUrl = accessUrl || clientGalleryLoginUrl(env, gallery.slug || "");
  const loginUrl = clientLoginUrl(env);
  const galleryTitle = gallery.title || "sua galeria";
  const clientName = emailHtml(client.name || email);
  const html = emailLayout(env, {
    preheader: `As fotos de ${galleryTitle} estão prontas para download.`,
    eyebrow: "Entrega final",
    title: "Suas fotos estão prontas",
    intro: `Olá ${clientName}, as fotos da galeria <strong>${emailHtml(galleryTitle)}</strong> estão prontas para download.`,
    body: firstAccess
      ? `<p style="margin:0;">Como este é seu primeiro acesso, crie sua senha pelo botão abaixo. Depois disso, as fotos serão abertas automaticamente.</p>`
      : `<p style="margin:0;">Acesse a galeria pelo botão abaixo e entre com seu e-mail e senha.</p>`,
    ctaLabel: firstAccess ? "Criar senha e baixar fotos" : "Acessar e baixar fotos",
    ctaUrl: galleryUrl,
    secondaryCtaLabel: "Área do cliente",
    secondaryCtaUrl: loginUrl,
    footerNote: firstAccess ? "Este link de primeiro acesso expira em 7 dias e pode ser usado uma única vez." : "",
  });
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: resendFrom(env),
      to: [email],
      subject: `Suas fotos estão prontas — ${gallery.title || "galeria"}`,
      html,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function formatQuoteDate(value, includeTime = false) {
  if (!value) return "Não informado";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
    ? new Date(`${value}T12:00:00-03:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Recife",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

async function sendResendMessage(env, payload = {}) {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY não configurada no Worker.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: resendFrom(env), ...payload }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function temporaryPasswordEmailBlock(email, temporaryPassword) {
  if (!temporaryPassword) return "";
  return `<div style="margin:18px 0;padding:16px;border:1px solid #d2b488;background:#f7f0e5;">
    <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;color:#6e5940;">Dados do primeiro acesso</p>
    <p style="margin:0 0 5px;">E-mail: <strong>${emailHtml(email)}</strong></p>
    <p style="margin:0;">Senha temporária: <strong style="font-size:18px;letter-spacing:.05em;">${emailHtml(temporaryPassword)}</strong></p>
  </div>`;
}

async function sendClientTemporaryPasswordEmail(env, email, client = {}, temporaryPassword = "") {
  const loginUrl = clientLoginUrl(env);
  const html = emailLayout(env, {
    preheader: "Sua senha temporária da Área do Cliente foi criada.",
    eyebrow: "Área do cliente",
    title: "Seu acesso temporário",
    intro: `Olá ${emailHtml(client.name || email)}, seu acesso à Área do Cliente está pronto.`,
    body: `<p style="margin:0;">Use os dados abaixo para entrar. Por segurança, você deverá criar uma senha definitiva no primeiro acesso.</p>${temporaryPasswordEmailBlock(email, temporaryPassword)}`,
    ctaLabel: "Entrar na Área do Cliente",
    ctaUrl: loginUrl,
    footerNote: "A senha temporária deixa de funcionar assim que você cadastrar a senha definitiva.",
    reason: "Você recebeu este e-mail porque foi criado ou renovado um acesso para o seu cadastro.",
  });
  return sendResendMessage(env, {
    to: [email],
    subject: `Seu acesso temporário — ${brandName(env)}`,
    html,
  });
}

async function sendClientPasswordResetEmail(env, email, client = {}, token = "") {
  const resetUrl = clientPasswordResetUrl(env, token);
  const html = emailLayout(env, {
    preheader: "Use este link para criar uma nova senha da Área do Cliente.",
    eyebrow: "Segurança",
    title: "Redefinir sua senha",
    intro: `Olá ${emailHtml(client.name || email)}, recebemos uma solicitação para redefinir sua senha.`,
    body: `<p style="margin:0;">Clique no botão abaixo para criar uma nova senha. Se você não solicitou a alteração, ignore este e-mail.</p>`,
    ctaLabel: "Criar nova senha",
    ctaUrl: resetUrl,
    footerNote: "Este link expira em 1 hora e pode ser utilizado uma única vez.",
    reason: "Você recebeu este e-mail porque foi solicitada uma redefinição de senha para a Área do Cliente.",
  });
  return sendResendMessage(env, {
    to: [email],
    subject: `Redefinir senha — ${brandName(env)}`,
    html,
  });
}

async function createClientPasswordReset(env, client = {}, requestedBy = "client") {
  if (!client.email || !env.LIKES_KV) throw new Error("Acesso do cliente indisponível.");
  const token = randomToken(36);
  const reset = {
    token,
    email: normalizeEmail(client.email),
    clientId: client.id || "",
    requestedBy,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + 1000 * 60 * 60,
  };
  await writeKvJson(env, clientPasswordResetKey(token), reset, { expirationTtl: 60 * 60 });
  return { token, reset };
}

async function sendQuotePublishedEmail(env, email, quote = {}, client = {}, accessUrl = "", firstAccess = false) {
  const clientName = emailHtml(client.name || email);
  const total = formatCurrencyFromCents(calculateQuoteTotals(quote).totalCents);
  const html = emailLayout(env, {
    preheader: `Seu orçamento ${quote.number || ""} está disponível para análise.`,
    eyebrow: "Orçamento e contrato",
    title: "Seu orçamento está pronto",
    intro: `Olá ${clientName}, preparei o orçamento para <strong>${emailHtml(quote.title || "o serviço solicitado")}</strong>.`,
    body: `<p style="margin:0 0 12px;">Valor total: <strong>${emailHtml(total)}</strong></p>
      <p style="margin:0;">Confira o escopo, as formas de pagamento e todas as cláusulas. Se estiver de acordo, o aceite é feito na própria página.</p>
      ${firstAccess ? `<p style="margin:14px 0 0;">Como este é seu primeiro acesso, o botão abaixo abrirá a criação da sua senha antes de mostrar o orçamento.</p>` : ""}`,
    ctaLabel: firstAccess ? "Criar senha e ver orçamento" : "Ver orçamento",
    ctaUrl: accessUrl,
    secondaryCtaLabel: "Área do cliente",
    secondaryCtaUrl: clientLoginUrl(env),
    footerNote: firstAccess
      ? "Este link de primeiro acesso expira em 7 dias e pode ser usado uma única vez."
      : `Proposta válida até ${formatQuoteDate(quote.validUntil)}.`,
    reason: "Você recebeu este e-mail porque existe um orçamento vinculado ao seu cadastro na área do cliente.",
  });
  return sendResendMessage(env, {
    to: [email],
    subject: `Orçamento ${quote.number || ""} — ${quote.title || "Marcel Conde Fotografia"}`,
    html,
  });
}

function pdfCleanText(value = "") {
  return String(value || "")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/•/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "?");
}

function pdfEscapeText(value = "") {
  return pdfCleanText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapPdfText(value = "", maxChars = 92) {
  const paragraphs = pdfCleanText(value).split(/\n/);
  const lines = [];
  paragraphs.forEach((paragraph) => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      return;
    }
    let line = "";
    words.forEach((word) => {
      if (!line) {
        line = word;
      } else if (`${line} ${word}`.length <= maxChars) {
        line += ` ${word}`;
      } else {
        lines.push(line);
        line = word;
      }
    });
    if (line) lines.push(line);
  });
  return lines;
}

function pdfBytesFromString(value = "") {
  return Uint8Array.from(value, (char) => char.charCodeAt(0) & 0xff);
}

function buildQuotePdf(env, quote = {}, client = {}, acceptance = null) {
  const snapshot = acceptance?.snapshot || quote.publishedSnapshot || quotePublishedSnapshot(env, quote, client);
  const pages = [[]];
  let pageIndex = 0;
  let y = 780;

  const newPage = () => {
    pages.push([]);
    pageIndex += 1;
    y = 780;
  };
  const draw = (text, options = {}) => {
    const font = options.font || "F1";
    const size = Number(options.size || 10);
    const leading = Number(options.leading || Math.max(13, size * 1.35));
    const x = Number(options.x || 46);
    const maxChars = Number(options.maxChars || Math.max(38, Math.floor(96 * (10 / size))));
    const color = options.color || "0.12 0.11 0.09";
    const lines = wrapPdfText(text, maxChars);

    lines.forEach((line) => {
      if (y - leading < 58) newPage();
      if (line) {
        pages[pageIndex].push(`BT /${font} ${size} Tf ${color} rg ${x} ${y.toFixed(2)} Td (${pdfEscapeText(line)}) Tj ET`);
      }
      y -= leading;
    });
    y -= Number(options.gap || 0);
  };
  const rule = () => {
    if (y < 70) newPage();
    pages[pageIndex].push(`0.70 0.58 0.40 RG 0.7 w 46 ${y.toFixed(2)} m 549 ${y.toFixed(2)} l S`);
    y -= 15;
  };

  draw(snapshot.contractor?.name || brandName(env), { font: "F3", size: 17, leading: 21, color: "0.33 0.25 0.16", gap: 3 });
  draw(`ORÇAMENTO E CONTRATO DE PRESTAÇÃO DE SERVIÇOS | ${snapshot.number || quote.number || ""}`, { font: "F2", size: 8.5, leading: 12, color: "0.45 0.40 0.34", gap: 8 });
  rule();
  draw(snapshot.title || "Serviços fotográficos", { font: "F3", size: 25, leading: 29, maxChars: 46, gap: 4 });
  draw(`Versão ${snapshot.version || quote.version || 1} | Validade: ${formatQuoteDate(snapshot.validUntil)}`, { size: 9, color: "0.42 0.39 0.34", gap: 15 });

  draw("PARTES", { font: "F2", size: 10, leading: 14, color: "0.55 0.40 0.23", gap: 4 });
  draw(`CONTRATANTE: ${snapshot.client?.name || client.name || "Cliente"}${snapshot.client?.document ? ` | CPF/CNPJ: ${snapshot.client.document}` : ""}`, { font: "F2", size: 9.5, leading: 14 });
  draw(`${snapshot.client?.email || client.email || ""}${snapshot.client?.phone ? ` | ${snapshot.client.phone}` : ""}`, { size: 9, leading: 13, color: "0.38 0.35 0.31", gap: 4 });
  draw(`CONTRATADO: ${snapshot.contractor?.name || brandName(env)} | CNPJ: ${snapshot.contractor?.document || ""}`, { font: "F2", size: 9.5, leading: 14 });
  draw(`${snapshot.contractor?.email || ""}${snapshot.contractor?.phone ? ` | ${snapshot.contractor.phone}` : ""} | ${snapshot.contractor?.city || ""}`, { size: 9, leading: 13, color: "0.38 0.35 0.31", gap: 14 });

  draw("ESCOPO", { font: "F2", size: 10, leading: 14, color: "0.55 0.40 0.23", gap: 4 });
  draw(snapshot.serviceDescription || "Serviço conforme os itens discriminados abaixo.", { size: 10, leading: 14, gap: 7 });
  draw(`Data prevista: ${snapshot.serviceDate ? formatQuoteDate(snapshot.serviceDate) : "A definir"}`, { font: "F2", size: 9.5, leading: 13 });
  if (snapshot.serviceLocation) draw(`Local: ${snapshot.serviceLocation}`, { size: 9.5, leading: 13 });
  if (snapshot.deliveryEstimate) draw(`Previsão de entrega: ${snapshot.deliveryEstimate}`, { size: 9.5, leading: 13 });
  y -= 9;

  draw("INVESTIMENTO", { font: "F2", size: 10, leading: 14, color: "0.55 0.40 0.23", gap: 5 });
  (snapshot.items || []).forEach((item) => {
    const amount = Math.round(Number(item.quantity || 0) * Number(item.unitPriceCents || 0));
    draw(`${item.description} | ${item.quantity} x ${formatCurrencyFromCents(item.unitPriceCents)} = ${formatCurrencyFromCents(amount)}`, { size: 9.5, leading: 14 });
  });
  y -= 3;
  draw(`Subtotal: ${formatCurrencyFromCents(snapshot.subtotalCents)}`, { size: 9.5, leading: 14 });
  if (snapshot.discountCents > 0) draw(`Desconto: -${formatCurrencyFromCents(snapshot.discountCents)}`, { size: 9.5, leading: 14 });
  draw(`TOTAL: ${formatCurrencyFromCents(snapshot.totalCents)}`, { font: "F2", size: 13, leading: 17, color: "0.33 0.25 0.16", gap: 13 });

  draw("PAGAMENTO", { font: "F2", size: 10, leading: 14, color: "0.55 0.40 0.23", gap: 5 });
  (snapshot.paymentMethods || []).forEach((method) => {
    draw(`${method.label}${method.details ? `: ${method.details}` : ""}`, { size: 9.5, leading: 14 });
  });
  if (snapshot.paymentTerms) draw(snapshot.paymentTerms, { size: 9.5, leading: 14 });
  y -= 10;

  draw("CLÁUSULAS CONTRATUAIS", { font: "F2", size: 10, leading: 14, color: "0.55 0.40 0.23", gap: 7 });
  (snapshot.clauses || []).forEach((clause, index) => {
    draw(`${index + 1}. ${clause.title}`, { font: "F2", size: 9.8, leading: 14, gap: 2 });
    draw(clause.text, { size: 9.2, leading: 13.2, gap: 8 });
  });

  if (snapshot.notesForClient) {
    draw("OBSERVAÇÕES", { font: "F2", size: 10, leading: 14, color: "0.55 0.40 0.23", gap: 5 });
    draw(snapshot.notesForClient, { size: 9.5, leading: 14, gap: 12 });
  }

  if (acceptance) {
    rule();
    draw("ACEITE ELETRÔNICO", { font: "F2", size: 10, leading: 14, color: "0.55 0.40 0.23", gap: 5 });
    draw(`Aceito por ${acceptance.name} (${acceptance.email}) em ${formatQuoteDate(acceptance.acceptedAt, true)}.`, { font: "F2", size: 9.5, leading: 14 });
    if (acceptance.document) draw(`CPF/CNPJ informado: ${acceptance.document}`, { size: 9.2, leading: 13 });
    draw(`Código de aceite: ${acceptance.code}`, { size: 9.2, leading: 13 });
    draw(`Hash de integridade: ${acceptance.hash}`, { size: 7.5, leading: 11, maxChars: 120 });
    draw(`IP registrado: ${acceptance.ip || "não disponível"}`, { size: 8, leading: 12, color: "0.38 0.35 0.31" });
  } else {
    rule();
    draw("DOCUMENTO AINDA NÃO ACEITO", { font: "F2", size: 9.5, leading: 14, color: "0.55 0.40 0.23" });
  }

  pages.forEach((commands, index) => {
    commands.unshift(`BT /F2 7.5 Tf 0.45 0.40 0.34 rg 46 815 Td (${pdfEscapeText(snapshot.number || quote.number || "ORÇAMENTO")}) Tj ET`);
    commands.push(`BT /F1 7.5 Tf 0.45 0.40 0.34 rg 46 28 Td (${pdfEscapeText(`${brandName(env)} | Página ${index + 1} de ${pages.length}`)}) Tj ET`);
  });

  const objects = [];
  const fontRegularId = 3;
  const fontBoldId = 4;
  const fontSerifId = 5;
  const pageIds = pages.map((_, index) => 6 + index * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[fontRegularId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[fontBoldId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  objects[fontSerifId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>";

  pages.forEach((commands, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const stream = commands.join("\n");
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R /F3 ${fontSerifId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  let pdf = "%PDF-1.4\n%âãÏÓ\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdfBytesFromString(pdf);
}

async function sendQuoteAcceptedEmails(env, quote = {}, client = {}, acceptance = {}, pdfBytes = new Uint8Array()) {
  const filename = `${sanitizeDownloadName(quote.number || "contrato")}-aceito.pdf`;
  const attachment = { filename, content: bytesToBase64(pdfBytes) };
  const total = formatCurrencyFromCents(acceptance.snapshot?.totalCents || calculateQuoteTotals(quote).totalCents);
  const quoteUrl = clientQuoteUrl(env, quote.id);
  const clientHtml = emailLayout(env, {
    preheader: `Seu aceite do orçamento ${quote.number || ""} foi registrado.`,
    eyebrow: "Contrato aceito",
    title: "Aceite confirmado",
    intro: `Olá ${emailHtml(client.name || client.email)}, o aceite do orçamento <strong>${emailHtml(quote.number || "")}</strong> foi registrado com sucesso.`,
    body: `<p style="margin:0 0 12px;">Serviço: <strong>${emailHtml(quote.title || "")}</strong><br>Valor: <strong>${emailHtml(total)}</strong></p><p style="margin:0;">A cópia do contrato aceito está anexada a este e-mail.</p>`,
    ctaLabel: "Consultar na área do cliente",
    ctaUrl: quoteUrl,
    footerNote: `Código de aceite: ${emailHtml(acceptance.code || "")}`,
    reason: "Você recebeu este e-mail porque aceitou eletronicamente um orçamento na área do cliente.",
  });
  const adminHtml = emailLayout(env, {
    preheader: `${client.name || client.email} aceitou o orçamento ${quote.number || ""}.`,
    eyebrow: "Novo aceite",
    title: "Orçamento aprovado",
    intro: `<strong>${emailHtml(client.name || client.email)}</strong> aceitou o orçamento <strong>${emailHtml(quote.number || "")}</strong>.`,
    body: `<p style="margin:0 0 12px;">Serviço: ${emailHtml(quote.title || "")}<br>Valor: <strong>${emailHtml(total)}</strong><br>Data do aceite: ${emailHtml(formatQuoteDate(acceptance.acceptedAt, true))}</p><p style="margin:0;">A cópia aceita está anexada.</p>`,
    ctaLabel: "Abrir orçamento no admin",
    ctaUrl: `${siteOrigin(env)}/admin/orcamentos/detalhe/?id=${encodeURIComponent(quote.id || "")}`,
    footerNote: `Código de aceite: ${emailHtml(acceptance.code || "")}`,
    reason: "Notificação administrativa da plataforma Marcel Conde.",
  });

  const [clientResult, adminResult] = await Promise.allSettled([
    sendResendMessage(env, {
      to: [client.email],
      subject: `Contrato aceito — ${quote.number || quote.title || "Orçamento"}`,
      html: clientHtml,
      attachments: [attachment],
    }),
    sendResendMessage(env, {
      to: [adminEmail(env)],
      subject: `Orçamento aprovado por ${client.name || client.email} — ${quote.number || ""}`,
      html: adminHtml,
      attachments: [attachment],
    }),
  ]);

  return {
    client: clientResult.status === "fulfilled" ? clientResult.value : null,
    admin: adminResult.status === "fulfilled" ? adminResult.value : null,
    errors: [clientResult, adminResult]
      .filter((result) => result.status === "rejected")
      .map((result) => String(result.reason?.message || result.reason || "Erro de e-mail")),
  };
}

function formatCurrencyFromCents(cents = 0) {
  return `R$ ${(Number(cents || 0) / 100).toFixed(2).replace(".", ",")}`;
}

function selectedImagesFromPublicIds(images = [], publicIds = []) {
  const wanted = new Set(publicIds);
  return images.filter((image) => wanted.has(image.public_id));
}

async function sendSelectionCompletedEmail(env, gallery = {}, client = {}, selectedImages = [], pricing = {}, payment = null) {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY não configurada no Worker.");
  }

  const to = adminEmail(env) || "contato@marcelconde.com.br";
  const galleryTitle = emailHtml(gallery.title || "galeria");
  const clientName = emailHtml(client.name || client.email || "Cliente");
  const clientEmail = emailHtml(client.email || "");
  const fileList = selectedImages
    .map((image) => image.filename || image.display_name || String(image.public_id || "").split("/").pop())
    .filter(Boolean)
    .map((name) => `<li style="margin:0 0 6px;">${emailHtml(name)}</li>`)
    .join("");
  const paymentHtml = payment
    ? `<p style="margin:16px 0 0;"><strong>Pagamento:</strong> ${formatCurrencyFromCents(payment.amountCents)} (${emailHtml(payment.providerPaymentId || payment.id || "")})</p>`
    : `<p style="margin:16px 0 0;"><strong>Pagamento:</strong> não houve fotos extras.</p>`;
  const html = emailLayout(env, {
    preheader: `Seleção concluída por ${client.name || client.email || "cliente"}.`,
    eyebrow: "Seleção de fotos",
    title: "Seleção concluída",
    intro: `A galeria <strong>${galleryTitle}</strong> recebeu uma seleção de fotos.`,
    body: `<p style="margin:0;"><strong>Cliente:</strong> ${clientName} (${clientEmail})</p>
           <p style="margin:14px 0 0;"><strong>Total selecionado:</strong> ${Number(pricing.selectedTotal || selectedImages.length)} foto(s)</p>
           <p style="margin:8px 0 0;"><strong>Fotos inclusas:</strong> ${Number(pricing.includedPhotos || 0)} · <strong>Extras:</strong> ${Number(pricing.extraCount || 0)}</p>
           <p style="margin:8px 0 0;"><strong>Desconto:</strong> ${Number(pricing.discountPercent || 0)}% (${emailHtml(pricing.discountLabel || "sem desconto")})</p>
           <p style="margin:8px 0 0;"><strong>Total bruto extras:</strong> ${formatCurrencyFromCents(pricing.subtotalCents || 0)} · <strong>Total final:</strong> ${formatCurrencyFromCents(pricing.totalCents || 0)}</p>
           ${paymentHtml}
           <p style="margin:20px 0 8px;"><strong>Arquivos selecionados:</strong></p>
           <ol style="margin:0;padding-left:22px;">${fileList || "<li>Nenhum arquivo encontrado.</li>"}</ol>`,
    ctaLabel: "Abrir área administrativa",
    ctaUrl: `${siteOrigin(env)}/admin/`,
    reason: "Você recebeu este e-mail porque este endereço recebe notificações administrativas da plataforma.",
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: resendFrom(env),
      to: [to],
      subject: `Seleção concluída — ${gallery.title || "galeria"}`,
      html,
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${text}`);

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function sendPaymentApprovedEmail(env, gallery = {}, client = {}, payment = {}, pricing = {}) {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY não configurada no Worker.");
  }

  const to = adminEmail(env) || "contato@marcelconde.com.br";
  const galleryTitle = emailHtml(gallery.title || gallery.slug || "galeria");
  const clientName = emailHtml(client.name || client.email || "Cliente");
  const clientEmail = emailHtml(client.email || payment.clientEmail || "");
  const galleryUrl = clientGalleryUrl(env, gallery.slug || payment.gallerySlug || "");
  const amountCents = payment.amountCents ?? pricing.totalCents ?? 0;
  const providerPaymentId = emailHtml(payment.providerPaymentId || "");
  const internalPaymentId = emailHtml(payment.id || "");
  const description = emailHtml(payment.description || `Fotos extras — ${gallery.title || gallery.slug || "galeria"}`);
  const html = emailLayout(env, {
    preheader: `Pagamento Pix aprovado para ${gallery.title || gallery.slug || "galeria"}.`,
    eyebrow: "Pagamento aprovado",
    title: "Pix aprovado",
    intro: `Pagamento Pix aprovado para fotos extras da galeria <strong>${galleryTitle}</strong>.`,
    body: `<p style="margin:0;"><strong>Cliente:</strong> ${clientName} (${clientEmail})</p>
           <p style="margin:14px 0 0;"><strong>Valor aprovado:</strong> ${formatCurrencyFromCents(amountCents)}</p>
           <p style="margin:8px 0 0;"><strong>Fotos selecionadas:</strong> ${Number(pricing.selectedTotal || 0)} · <strong>Fotos extras:</strong> ${Number(pricing.extraCount || 0)}</p>
           <p style="margin:8px 0 0;"><strong>Descrição:</strong> ${description}</p>
           <p style="margin:8px 0 0;"><strong>ID Mercado Pago:</strong> ${providerPaymentId || "não informado"}<br>
              <strong>ID interno:</strong> ${internalPaymentId || "não informado"}</p>`,
    ctaLabel: "Abrir galeria do cliente",
    ctaUrl: galleryUrl,
    secondaryCtaLabel: "Abrir admin",
    secondaryCtaUrl: `${siteOrigin(env)}/admin/`,
    reason: "Você recebeu este e-mail porque este endereço recebe notificações administrativas da plataforma.",
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: resendFrom(env),
      to: [to],
      subject: `Pix aprovado — ${gallery.title || gallery.slug || "galeria"}`,
      html,
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${text}`);

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function ensureCompletedSelectionBaseline(env, gallery = {}, images = [], currentSelection = []) {
  if (!gallery.selectionCompletedAt) return [];

  const existing = uniquePublicIds(gallery.selectionLockedPublicIds || []);
  if (existing.length) return existing;

  const lockedPublicIds = uniquePublicIds(currentSelection);
  gallery.selectionLockedPublicIds = lockedPublicIds;
  gallery.selectionLockedPricing = calculateSelectionPricingRaw(gallery, images, lockedPublicIds);
  gallery.selectionLockedAt = gallery.selectionCompletedAt;
  gallery.updatedAt = new Date().toISOString();
  await writeKvJson(env, privateGalleryKey(gallery.id), gallery);
  return lockedPublicIds;
}

async function completePrivateGallerySelection(env, request, gallery, client, images, selectedPublicIds, payment = null) {
  const now = new Date().toISOString();
  const cleanSelection = uniquePublicIds(selectedPublicIds);
  const pricing = calculateSelectionPricingRaw(gallery, images, cleanSelection);
  const previousLockedPublicIds = completedSelectionBaseline(gallery, []);
  const diff = selectionDiff(previousLockedPublicIds, cleanSelection);
  const selectionRevision = Math.max(0, Number(gallery.selectionRevision || 0)) + 1;
  const previousStatus = gallery.status || "selection";
  const nextStatus = previousStatus === "final" ? "final" : "editing";

  await writeKvJson(env, privateGallerySelectionKey(gallery.id), cleanSelection);

  const nextGallery = {
    ...gallery,
    status: nextStatus,
    selectionCompletedAt: gallery.selectionCompletedAt || now,
    selectionLockedPublicIds: cleanSelection,
    selectionLockedPricing: pricing,
    selectionLockedAt: now,
    selectionRevision,
    selectionPaymentId: payment?.id || gallery.selectionPaymentId || null,
    updatedAt: now,
  };
  await writeKvJson(env, privateGalleryKey(gallery.id), nextGallery);

  let emailQueued = false;
  let emailError = "";
  try {
    await sendSelectionCompletedEmail(
      env,
      nextGallery,
      client,
      selectedImagesFromPublicIds(images, cleanSelection),
      pricing,
      payment
    );
    emailQueued = true;
  } catch (err) {
    emailError = String(err?.message || err || "unknown");
    console.error("Selection completed email error:", err);
  }

  await appendPrivateGalleryEvent(env, request, gallery.id, "concluir_selecao", {
    selectionRevision,
    previousStatus,
    nextStatus,
    previousLockedPublicIds,
    totalSelected: cleanSelection.length,
    selectedPublicIds: cleanSelection,
    addedPublicIds: diff.addedPublicIds,
    removedPublicIds: diff.removedPublicIds,
    pricing,
    paymentId: payment?.id || null,
    providerPaymentId: payment?.providerPaymentId || null,
    emailQueued,
    emailError,
  }, client);

  return {
    gallery: nextGallery,
    pricing,
    emailQueued,
    emailError,
  };
}

function publicPayment(payment = {}) {
  return {
    id: payment.id,
    status: payment.status,
    amountCents: payment.amountCents || 0,
    providerPaymentId: payment.providerPaymentId || "",
    qrCode: payment.qrCode || "",
    qrCodeBase64: payment.qrCodeBase64 || "",
    ticketUrl: payment.ticketUrl || "",
    approvedAt: payment.approvedAt || null,
    expiresAt: payment.expiresAt || null,
    selectionCompletedAt: payment.selectionCompletedAt || null,
  };
}

async function createMercadoPagoPixPayment(env, request, payment, gallery, client) {
  if (!env.MERCADO_PAGO_ACCESS_TOKEN) {
    throw new Error("MERCADO_PAGO_ACCESS_TOKEN não configurado no Worker.");
  }

  const apiUrl = "https://api.mercadopago.com/v1/payments";
  const amount = Number((payment.amountCents / 100).toFixed(2));
  const notificationUrl = `${new URL(request.url).origin}/payments/mercadopago/webhook`;
  const body = {
    transaction_amount: amount,
    description: `Fotos extras — ${gallery.title || gallery.slug || "galeria"}`,
    payment_method_id: "pix",
    external_reference: payment.id,
    notification_url: notificationUrl,
    payer: {
      email: normalizeEmail(client.email || ""),
      first_name: cleanDisplayName(client.name || "Cliente"),
    },
    date_of_expiration: payment.expiresAt,
  };

  const res = await fetchWithTimeout(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.MERCADO_PAGO_ACCESS_TOKEN}`,
      "X-Idempotency-Key": payment.id,
    },
    body: JSON.stringify(body),
  }, 15000);

  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    throw new Error(`Mercado Pago ${res.status}: ${text}`);
  }

  const tx = data.point_of_interaction?.transaction_data || {};
  return {
    providerPaymentId: String(data.id || ""),
    providerStatus: data.status || "",
    qrCode: tx.qr_code || "",
    qrCodeBase64: tx.qr_code_base64 || "",
    ticketUrl: tx.ticket_url || "",
    rawStatus: data.status_detail || "",
  };
}

async function getMercadoPagoPayment(env, providerPaymentId) {
  if (!env.MERCADO_PAGO_ACCESS_TOKEN) throw new Error("MERCADO_PAGO_ACCESS_TOKEN não configurado no Worker.");
  const res = await fetchWithTimeout(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(providerPaymentId)}`, {
    headers: {
      Authorization: `Bearer ${env.MERCADO_PAGO_ACCESS_TOKEN}`,
    },
  }, 12000);
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Mercado Pago ${res.status}: ${text}`);
  return data;
}

function timingSafeEqualString(a = "", b = "") {
  const left = new TextEncoder().encode(String(a));
  const right = new TextEncoder().encode(String(b));
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i++) result |= left[i] ^ right[i];
  return result === 0;
}

async function verifyMercadoPagoWebhookSignature(request, env, providerPaymentId = "") {
  if (!env.MERCADO_PAGO_WEBHOOK_SECRET) return true;

  const signatureHeader = request.headers.get("x-signature") || "";
  const requestId = request.headers.get("x-request-id") || "";
  const parts = Object.fromEntries(signatureHeader.split(",").map((part) => {
    const [key, value] = part.split("=").map((item) => String(item || "").trim());
    return [key, value];
  }));
  const ts = parts.ts || "";
  const signature = parts.v1 || "";
  if (!providerPaymentId || !requestId || !ts || !signature) return false;

  const manifest = `id:${String(providerPaymentId).toLowerCase()};request-id:${requestId};ts:${ts};`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.MERCADO_PAGO_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const expected = [...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return timingSafeEqualString(expected, signature);
}

async function approveMercadoPagoPayment(env, request, providerPaymentId) {
  if (!providerPaymentId || !env.LIKES_KV) return { ok: false, reason: "missing_payment_id" };

  const paymentId = await env.LIKES_KV.get(mercadoPagoPaymentKey(providerPaymentId));
  if (!paymentId) return { ok: false, reason: "payment_not_found" };

  const payment = await readKvJson(env, privateGalleryPaymentKey(paymentId), null);
  if (!payment) return { ok: false, reason: "payment_record_not_found" };

  const mpPayment = await getMercadoPagoPayment(env, providerPaymentId);
  const now = new Date().toISOString();
  const nextPayment = {
    ...payment,
    providerStatus: mpPayment.status || payment.providerStatus || "",
    providerStatusDetail: mpPayment.status_detail || payment.providerStatusDetail || "",
    updatedAt: now,
  };

  if (mpPayment.status !== "approved") {
    nextPayment.status = mpPayment.status === "rejected" || mpPayment.status === "cancelled" ? "rejected" : "pending";
    await writeKvJson(env, privateGalleryPaymentKey(payment.id), nextPayment);
    return { ok: true, approved: false, payment: nextPayment };
  }

  if (payment.status === "approved" && payment.selectionCompletedAt) {
    return { ok: true, approved: true, payment };
  }

  const gallery = await readKvJson(env, privateGalleryKey(payment.galleryId), null);
  if (!gallery) return { ok: false, reason: "gallery_not_found", payment: nextPayment };
  const client = gallery.clientId ? await readKvJson(env, privateClientKey(gallery.clientId), null) : null;
  const paymentClient = client || { email: payment.clientEmail || "", name: payment.clientName || "Cliente" };
  const images = visibleGalleryImages(gallery, await readKvJson(env, privateGalleryImagesKey(gallery.id), []));
  const completed = await completePrivateGallerySelection(
    env,
    request,
    gallery,
    paymentClient,
    images,
    payment.selectedPublicIds || [],
    { ...payment, ...nextPayment, status: "approved", approvedAt: now }
  );

  nextPayment.status = "approved";
  nextPayment.approvedAt = now;
  nextPayment.selectionCompletedAt = completed.gallery.selectionCompletedAt;
  nextPayment.amountCents = payment.amountCents || completed.pricing.totalCents || 0;

  let approvedNotificationQueued = false;
  let approvedNotificationError = "";
  let approvedNotificationResendId = null;
  if (!payment.approvedNotificationSentAt) {
    try {
      const resend = await sendPaymentApprovedEmail(
        env,
        completed.gallery,
        paymentClient,
        nextPayment,
        completed.pricing
      );
      approvedNotificationQueued = true;
      approvedNotificationResendId = resend?.id || null;
      nextPayment.approvedNotificationSentAt = new Date().toISOString();
      nextPayment.approvedNotificationResendId = approvedNotificationResendId;
      delete nextPayment.approvedNotificationError;
    } catch (err) {
      approvedNotificationError = String(err?.message || err || "unknown");
      nextPayment.approvedNotificationError = approvedNotificationError;
      console.error("Payment approved email error:", err);
    }
  }

  await writeKvJson(env, privateGalleryPaymentKey(payment.id), nextPayment);
  await appendPrivateGalleryEvent(env, request, gallery.id, "pix_aprovado", {
    paymentId: payment.id,
    providerPaymentId,
    amountCents: nextPayment.amountCents,
    pricing: completed.pricing,
    approvedNotificationQueued,
    approvedNotificationError,
    approvedNotificationResendId,
  }, paymentClient);

  return { ok: true, approved: true, payment: nextPayment };
}

function visibleGalleryImages(gallery = {}, images = []) {
  if (gallery.status === "final") {
    const finalImages = images.filter((image) => image.phase === "final");
    return finalImages.length ? finalImages : images;
  }
  return images.filter((image) => image.phase !== "final");
}

function cloudinaryAttachmentUrl(src = "") {
  if (!src || !src.includes("/upload/")) return src;
  return src.replace(/\/upload\/(?:[a-z]+_[^,/]+(?:,[a-z]+_[^,/]+)*\/)?/, "/upload/fl_attachment/");
}

async function sendResetEmail(env, request, email, token) {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY não configurada no Worker.");
  }

  const origin = String(env.SITE_URL || "https://marcelconde.com.br").replace(/\/+$/, "");
  const resetUrl = `${origin}/admin/?reset=${encodeURIComponent(token)}`;
  const html = emailLayout(env, {
    preheader: "Use este link para criar uma nova senha do painel administrativo.",
    eyebrow: "Segurança",
    title: "Redefinir senha",
    intro: "Recebemos uma solicitação para redefinir a senha do painel administrativo.",
    body: `<p style="margin:0;">Se foi você, clique no botão abaixo para criar uma nova senha.</p>`,
    ctaLabel: "Criar nova senha",
    ctaUrl: resetUrl,
    footerNote: "Este link expira em 1 hora. Se você não solicitou esta alteração, ignore este e-mail.",
    reason: "Você recebeu este e-mail porque foi solicitada uma redefinição de senha para o painel administrativo.",
  });
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: resendFrom(env),
      to: [email],
      subject: `Redefinir senha do admin — ${brandName(env)}`,
      html,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function sendInviteEmail(env, email, token, inviterName = "Marcel Conde") {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY não configurada no Worker.");
  }

  const inviteUrl = adminInviteUrl(env, token);
  const safeInviterName = emailHtml(inviterName);
  const html = emailLayout(env, {
    preheader: `${inviterName} convidou você para acessar o painel administrativo.`,
    eyebrow: "Convite administrativo",
    title: "Acesso ao painel",
    intro: `<strong>${safeInviterName}</strong> convidou você para acessar o painel administrativo ${emailHtml(brandName(env))}.`,
    body: `<p style="margin:0;">Clique no botão abaixo para criar sua senha e aceitar o convite.</p>`,
    ctaLabel: "Aceitar convite",
    ctaUrl: inviteUrl,
    footerNote: "Este link expira em 48 horas.",
    reason: "Você recebeu este e-mail porque foi convidado para acessar o painel administrativo.",
  });
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: resendFrom(env),
      to: [email],
      subject: `Convite para o admin — ${brandName(env)}`,
      html,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function adminInviteUrl(env, token) {
  const origin = String(env.SITE_URL || "https://marcelconde.com.br").replace(/\/+$/, "");
  return `${origin}/admin/?invite=${encodeURIComponent(token)}`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === "/payments/mercadopago/webhook" && ["GET", "POST"].includes(request.method)) {
      let body = {};
      if (request.method === "POST") body = await readJson(request);

      const providerPaymentId = String(
        url.searchParams.get("data.id") ||
        url.searchParams.get("id") ||
        body?.data?.id ||
        body?.id ||
        ""
      ).trim();

      if (!providerPaymentId) return errorJson("Missing Mercado Pago payment id", 400);

      const validSignature = await verifyMercadoPagoWebhookSignature(request, env, providerPaymentId);
      if (!validSignature) return errorJson("Invalid Mercado Pago webhook signature", 401);

      try {
        const result = await approveMercadoPagoPayment(env, request, providerPaymentId);
        return json({ ok: true, ...result }, 200, { "Cache-Control": "no-store" });
      } catch (err) {
        console.error("Mercado Pago webhook error:", err);
        return errorJson("Erro ao processar webhook do Mercado Pago.", 500, {
          detail: String(err?.message || err || "unknown"),
        });
      }
    }

    // ── ÁREA PRIVADA: ACESSO DO CLIENTE ──────────────────────────

    if (url.pathname === "/client-auth/invite" && request.method === "GET") {
      const token = String(url.searchParams.get("token") || "").trim();
      if (!token || !env.LIKES_KV) return errorJson("Convite inválido.", 400);

      const galleryInvite = await readKvJson(env, clientGalleryInviteKey(token), null);
      const quoteInvite = galleryInvite ? null : await readKvJson(env, clientQuoteInviteKey(token), null);
      const invite = galleryInvite || quoteInvite;
      if (!invite || invite.usedAt || Number(invite.expiresAt || 0) < Date.now()) {
        return errorJson("Convite inválido ou expirado.", 400);
      }

      const client = await readKvJson(env, privateClientKey(invite.clientId), null);
      if (!client) return errorJson("Acesso indisponível.", 404);

      const existingUser = await getClientUser(env, client.email);
      if (hasPermanentClientAccess(existingUser)) {
        return errorJson("Este cliente já possui uma senha. Entre com seu e-mail e senha.", 409, {
          loginUrl: clientLoginUrl(env),
        });
      }
      if (quoteInvite) {
        const quote = await readKvJson(env, privateQuoteKey(invite.quoteId), null);
        if (!quote) return errorJson("Orçamento indisponível.", 404);
        return json({
          kind: "quote",
          email: client.email,
          clientName: client.name || client.email,
          quoteTitle: quote.title || "Orçamento",
          quoteId: quote.id,
          hasPassword: Boolean(existingUser?.passwordHash),
        }, 200, { "Cache-Control": "no-store" });
      }

      const gallery = await readKvJson(env, privateGalleryKey(invite.galleryId), null);
      if (!gallery) return errorJson("Galeria indisponível.", 404);
      return json({
        kind: "gallery",
        email: client.email,
        clientName: client.name || client.email,
        galleryTitle: gallery.title || "Galeria privada",
        gallerySlug: gallery.slug,
        hasPassword: Boolean(existingUser?.passwordHash),
      }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/client-auth/setup" && request.method === "POST") {
      const body = await readJson(request);
      const token = String(body.token || "").trim();
      const password = String(body.password || "");

      if (!token || password.length < 6) return errorJson("Token ou senha inválidos.", 400);
      if (!env.LIKES_KV) return errorJson("LIKES_KV not configured", 500);

      const galleryInvite = await readKvJson(env, clientGalleryInviteKey(token), null);
      const quoteInvite = galleryInvite ? null : await readKvJson(env, clientQuoteInviteKey(token), null);
      const invite = galleryInvite || quoteInvite;
      if (!invite || invite.usedAt || Number(invite.expiresAt || 0) < Date.now()) {
        return errorJson("Convite inválido ou expirado.", 400);
      }

      const client = await readKvJson(env, privateClientKey(invite.clientId), null);
      if (!client?.email) return errorJson("Acesso indisponível.", 404);

      const existingUser = await getClientUser(env, client.email);
      if (hasPermanentClientAccess(existingUser)) {
        return errorJson("Este cliente já possui uma senha. Entre com seu e-mail e senha.", 409, {
          loginUrl: clientLoginUrl(env),
        });
      }

      const user = await saveClientPassword(env, client.email, password, {
        name: client.name || client.email,
      });
      invite.usedAt = new Date().toISOString();
      const session = await createClientSession(env, user);

      if (quoteInvite) {
        const quote = await readKvJson(env, privateQuoteKey(invite.quoteId), null);
        if (!quote) return errorJson("Orçamento indisponível.", 404);
        await writeKvJson(env, clientQuoteInviteKey(token), invite, { expirationTtl: 60 * 60 * 24 * 7 });
        await appendPrivateQuoteEvent(env, request, quote.id, "cliente_criou_senha", {}, user);
        return json({
          ok: true,
          ...session,
          quote: {
            id: quote.id,
            url: clientQuoteUrl(env, quote.id),
          },
        }, 200, { "Cache-Control": "no-store" });
      }

      const gallery = await readKvJson(env, privateGalleryKey(invite.galleryId), null);
      if (!gallery) return errorJson("Galeria indisponível.", 404);
      await writeKvJson(env, clientGalleryInviteKey(token), invite, { expirationTtl: 60 * 60 * 24 * 7 });
      await appendPrivateGalleryEvent(env, request, gallery.id, "cliente_criou_senha", {}, user);

      return json({
        ok: true,
        ...session,
        gallery: {
          slug: gallery.slug,
          url: clientGalleryUrl(env, gallery.slug),
        },
      }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/client-auth/forgot" && request.method === "POST") {
      const body = await readJson(request);
      const email = normalizeEmail(body.email || "");
      if (!email) return errorJson("Informe seu e-mail.", 400);

      try {
        const [storedUser, clients] = await Promise.all([
          getClientUser(env, email),
          listPrivateClients(env),
        ]);
        const client = clients.find((item) => normalizeEmail(item.email || "") === email);
        if (storedUser?.passwordHash && client) {
          const { token } = await createClientPasswordReset(env, client, "client");
          await sendClientPasswordResetEmail(env, email, client, token);
        }
      } catch (err) {
        console.error("Client forgot password error:", err);
      }

      return json({ ok: true }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/client-auth/reset" && request.method === "GET") {
      const token = String(url.searchParams.get("token") || "").trim();
      const reset = token ? await readKvJson(env, clientPasswordResetKey(token), null) : null;
      if (!reset || Number(reset.expiresAt || 0) < Date.now()) {
        return errorJson("Link de redefinição inválido ou expirado.", 400);
      }
      return json({ email: reset.email }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/client-auth/reset" && request.method === "POST") {
      const body = await readJson(request);
      const token = String(body.token || "").trim();
      const password = String(body.password || "");
      if (!token || password.length < 6) return errorJson("Token ou senha inválidos.", 400);
      const reset = await readKvJson(env, clientPasswordResetKey(token), null);
      if (!reset || Number(reset.expiresAt || 0) < Date.now()) {
        return errorJson("Link de redefinição inválido ou expirado.", 400);
      }
      const clients = await listPrivateClients(env);
      const client = clients.find((item) => normalizeEmail(item.email || "") === normalizeEmail(reset.email || ""));
      if (!client) return errorJson("Cadastro do cliente não encontrado.", 404);
      await saveClientPassword(env, client.email, password, {
        name: client.name || client.email,
        mustChangePassword: false,
      });
      await env.LIKES_KV.delete(clientPasswordResetKey(token));
      return json({ ok: true }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/client-auth/login" && request.method === "POST") {
      const body = await readJson(request);
      const email = normalizeEmail(body.email || "");
      const password = String(body.password || "");
      if (!email || !password) return errorJson("E-mail e senha são obrigatórios.", 400);

      const user = await validateClientLogin(env, email, password);
      if (!user) return errorJson("E-mail ou senha inválidos.", 401);

      const session = await createClientSession(env, user);
      return json(session, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/client-auth/change-password" && request.method === "POST") {
      const sessionToken = getBearerToken(request);
      const session = await getClientSession(env, sessionToken);
      if (!session) return errorJson("Faça login novamente para alterar sua senha.", 401);
      const body = await readJson(request);
      const password = String(body.password || "");
      if (password.length < 6) return errorJson("Use uma senha com pelo menos 6 caracteres.", 400);

      const clients = await listPrivateClients(env);
      const client = clients.find((item) => normalizeEmail(item.email || "") === normalizeEmail(session.email || ""));
      if (!client) return errorJson("Cadastro do cliente não encontrado.", 404);
      const user = await saveClientPassword(env, client.email, password, {
        name: client.name || client.email,
        mustChangePassword: false,
      });
      if (sessionToken) await env.LIKES_KV.delete(clientSessionKey(sessionToken));
      const nextSession = await createClientSession(env, user);
      return json({ ok: true, ...nextSession }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/client-auth/me" && request.method === "GET") {
      const session = await getCurrentClient(request, env);
      if (!session) return errorJson("Unauthorized", 401);
      return json({ user: publicClientUser(session) }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/client-auth/logout" && request.method === "POST") {
      const token = getBearerToken(request);
      if (token && env.LIKES_KV) await env.LIKES_KV.delete(clientSessionKey(token));
      return json({ ok: true }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/client-quotes" && request.method === "GET") {
      const session = await getCurrentClient(request, env);
      if (!session) return errorJson("Faça login para acessar seus orçamentos.", 401);
      if (session.mustChangePassword === true) {
        return errorJson("Crie sua senha definitiva antes de acessar seus orçamentos.", 403, { passwordChangeRequired: true });
      }
      const quotes = await listPrivateQuotes(env);
      const items = [];
      for (const quote of quotes) {
        const client = quote.clientId ? await readKvJson(env, privateClientKey(quote.clientId), null) : null;
        if (normalizeEmail(client?.email || "") !== normalizeEmail(session.email)) continue;
        const item = publicQuote(quote);
        if (["draft", "cancelled"].includes(item.status)) continue;
        items.push({
          id: item.id,
          number: item.number,
          title: item.title,
          status: item.status,
          totalCents: item.totalCents,
          validUntil: item.validUntil,
          acceptedAt: item.acceptedAt,
          updatedAt: item.updatedAt,
          url: clientQuoteUrl(env, item.id),
        });
      }
      return json({ quotes: items }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/client-quote" && request.method === "GET") {
      const id = String(url.searchParams.get("id") || "").trim();
      const quote = await readKvJson(env, privateQuoteKey(id), null);
      if (!quote) return errorJson("Orçamento não encontrado.", 404);
      const access = await requireClientQuoteAccess(request, env, quote);
      if (access.error) return access.error;
      const status = effectiveQuoteStatus(quote);
      if (["draft", "cancelled"].includes(status)) return errorJson("Este orçamento ainda não está disponível.", 404);

      if (quote.status === "published" && !quote.viewedAt) {
        quote.status = "viewed";
        quote.viewedAt = new Date().toISOString();
        quote.updatedAt = quote.viewedAt;
        await writeKvJson(env, privateQuoteKey(quote.id), quote);
        ctx.waitUntil(appendPrivateQuoteEvent(env, request, quote.id, "cliente_abriu_orcamento", {}, access.client));
      }

      return json({
        quote: publicQuote(quote),
        client: quoteClientSnapshot(access.linkedClient || {}),
        contractor: quote.contractor || quote.publishedSnapshot?.contractor || quoteContractor(env),
      }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/client-quote/pdf" && request.method === "GET") {
      const id = String(url.searchParams.get("id") || "").trim();
      const quote = await readKvJson(env, privateQuoteKey(id), null);
      if (!quote) return errorJson("Orçamento não encontrado.", 404);
      const access = await requireClientQuoteAccess(request, env, quote);
      if (access.error) return access.error;
      if (["draft", "cancelled"].includes(effectiveQuoteStatus(quote))) return errorJson("Orçamento indisponível.", 404);
      const bytes = buildQuotePdf(env, quote, access.linkedClient || {}, quote.acceptance || null);
      return new Response(bytes, {
        status: 200,
        headers: {
          ...corsHeaders(),
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${sanitizeDownloadName(quote.number || "orcamento")}.pdf"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    if (url.pathname === "/client-quote/accept" && request.method === "POST") {
      const body = await readJson(request);
      const id = String(body.id || body.quoteId || "").trim();
      const quote = await readKvJson(env, privateQuoteKey(id), null);
      if (!quote) return errorJson("Orçamento não encontrado.", 404);
      const access = await requireClientQuoteAccess(request, env, quote);
      if (access.error) return access.error;
      const status = effectiveQuoteStatus(quote);
      if (status === "accepted") return json({ ok: true, alreadyAccepted: true, quote: publicQuote(quote) }, 200, { "Cache-Control": "no-store" });
      if (status === "expired") return errorJson("Este orçamento expirou. Solicite uma nova validade antes de aceitar.", 409);
      if (!["published", "viewed"].includes(status)) return errorJson("Este orçamento não está disponível para aceite.", 409);

      const signerName = cleanDisplayName(body.name || "");
      const signerDocument = cleanDisplayName(body.document || access.linkedClient?.document || "");
      if (signerName.length < 3) return errorJson("Informe o nome completo de quem está aceitando.", 400);
      if (signerDocument.length < 5) return errorJson("Informe o CPF ou CNPJ de quem está aceitando.", 400);
      if (body.confirmContract !== true || body.confirmElectronicSignature !== true) {
        return errorJson("Confirme a leitura do contrato e o aceite eletrônico.", 400);
      }

      const acceptedAt = new Date().toISOString();
      const snapshot = quote.publishedSnapshot || quotePublishedSnapshot(env, quote, access.linkedClient || {});
      const evidence = {
        quoteId: quote.id,
        number: quote.number,
        version: snapshot.version || quote.version || 1,
        snapshot,
        name: signerName,
        email: normalizeEmail(access.client.email || ""),
        document: signerDocument,
        acceptedAt,
        ip: request.headers.get("CF-Connecting-IP") || "",
        userAgent: request.headers.get("User-Agent") || "",
      };
      const hash = await sha256Hex(JSON.stringify(evidence));
      const acceptance = {
        ...evidence,
        code: `ACE-${randomToken(6).slice(0, 9).toUpperCase()}`,
        hash,
      };

      quote.status = "accepted";
      quote.acceptedAt = acceptedAt;
      quote.acceptance = acceptance;
      quote.updatedAt = acceptedAt;
      await writeKvJson(env, privateQuoteKey(quote.id), quote);
      await appendPrivateQuoteEvent(env, request, quote.id, "cliente_aceitou_orcamento", {
        version: acceptance.version,
        code: acceptance.code,
        hash: acceptance.hash,
      }, access.client);

      const pdfBytes = buildQuotePdf(env, quote, access.linkedClient || {}, acceptance);
      let emailResult = { client: null, admin: null, errors: [] };
      try {
        emailResult = await sendQuoteAcceptedEmails(env, quote, access.linkedClient || {}, acceptance, pdfBytes);
      } catch (err) {
        emailResult.errors = [String(err?.message || err || "Erro ao enviar e-mails")];
      }
      quote.acceptanceEmails = {
        sentAt: new Date().toISOString(),
        clientQueued: Boolean(emailResult.client),
        adminQueued: Boolean(emailResult.admin),
        errors: emailResult.errors,
      };
      await writeKvJson(env, privateQuoteKey(quote.id), quote);

      return json({
        ok: true,
        quote: publicQuote(quote),
        emailQueued: Boolean(emailResult.client && emailResult.admin),
        emailErrors: emailResult.errors,
      }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/client-galleries" && request.method === "GET") {
      const session = await getCurrentClient(request, env);
      if (!session) return errorJson("Faça login para acessar suas galerias.", 401);
      if (session.mustChangePassword === true) {
        return errorJson("Crie sua senha definitiva antes de acessar suas galerias.", 403, { passwordChangeRequired: true });
      }

      const galleries = await listPrivateGalleries(env);
      const items = [];
      for (const gallery of galleries) {
        const client = gallery.clientId ? await readKvJson(env, privateClientKey(gallery.clientId), null) : null;
        if (normalizeEmail(client?.email || "") !== normalizeEmail(session.email)) continue;
        const images = await readKvJson(env, privateGalleryImagesKey(gallery.id), []);
        const selection = await readKvJson(env, privateGallerySelectionKey(gallery.id), []);
        items.push({
          id: gallery.id,
          slug: gallery.slug,
          title: gallery.title,
          subtitle: gallery.subtitle || "",
          status: gallery.status || "selection",
          coverUrl: gallery.coverUrl || images[0]?.url || null,
          totalImages: visibleGalleryImages(gallery, images).length,
          totalSelected: selection.length,
          url: clientGalleryUrl(env, gallery.slug),
          updatedAt: gallery.updatedAt || null,
        });
      }

      return json({ galleries: items }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/client-gallery" && request.method === "GET") {
      const slug = slugify(url.searchParams.get("slug") || "");
      const cursor = Math.max(0, Number(url.searchParams.get("cursor") || 0));
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 60), 1), 120);
      const gallery = await getPrivateGalleryBySlug(env, slug);

      if (!gallery) return errorJson("Galeria não encontrada.", 404);
      const access = await requireClientGalleryAccess(request, env, gallery);
      if (access.error) return access.error;

      const images = visibleGalleryImages(gallery, await readKvJson(env, privateGalleryImagesKey(gallery.id), []));
      const selection = await readKvJson(env, privateGallerySelectionKey(gallery.id), []);
      const canDownload = gallery.status === "final" || gallery.allowDownload === true;
      const page = images.slice(cursor, cursor + limit).map((image) => {
        const item = thumbnailImage(image);
        if (canDownload) item.downloadUrl = cloudinaryAttachmentUrl(image.url);
        return item;
      });

      if (cursor === 0) {
        ctx.waitUntil(appendPrivateGalleryEvent(env, request, gallery.id, "cliente_abriu_galeria", { slug }, access.client));
      }

      return json({
        gallery: publicPrivateGallery(gallery, images, selection),
        images: page,
        paging: {
          cursor,
          limit,
          total: images.length,
          nextCursor: cursor + page.length < images.length ? cursor + page.length : null,
        },
      }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/client-gallery/favorite" && request.method === "POST") {
      const body = await readJson(request);
      const slug = slugify(body.slug || "");
      const publicId = sanitizePublicId(body.publicId || body.public_id || "");
      const selected = body.selected !== false;
      const gallery = await getPrivateGalleryBySlug(env, slug);

      if (!gallery) return errorJson("Galeria não encontrada.", 404);
      const access = await requireClientGalleryAccess(request, env, gallery);
      if (access.error) return access.error;
      if (gallery.status === "final") return errorJson("A seleção desta galeria já foi encerrada.", 409);
      if (!publicId) return errorJson("Foto inválida.", 400);

      const images = visibleGalleryImages(gallery, await readKvJson(env, privateGalleryImagesKey(gallery.id), []));
      if (!images.some((image) => image.public_id === publicId)) {
        return errorJson("Foto não pertence a esta galeria.", 400);
      }

      const limit = Number(gallery.selectionLimit || 0);
      const current = await readKvJson(env, privateGallerySelectionKey(gallery.id), []);
      const lockedSelection = await ensureCompletedSelectionBaseline(env, gallery, images, current);
      const beforeSelection = uniquePublicIds(current);

      let next = current.filter((item) => item !== publicId);

      if (selected) {
        next.push(publicId);
      }

      next = uniquePublicIds(next);
      const diff = selectionDiff(beforeSelection, next);
      const lockedDiff = selectionDiff(lockedSelection, next);
      await writeKvJson(env, privateGallerySelectionKey(gallery.id), next);
      await appendPrivateGalleryEvent(env, request, gallery.id, selected ? "favoritar_foto" : "remover_favorito", {
        publicId,
        wasSelectionCompleted: Boolean(gallery.selectionCompletedAt),
        wasConfirmedBefore: lockedSelection.includes(publicId),
        beforeSelectedPublicIds: beforeSelection,
        afterSelectedPublicIds: next,
        addedPublicIds: diff.addedPublicIds,
        removedPublicIds: diff.removedPublicIds,
        addedSinceLastConfirmation: lockedDiff.addedPublicIds,
        removedSinceLastConfirmation: lockedDiff.removedPublicIds,
      }, access.client);

      return json({
        ok: true,
        selectedPublicIds: next,
        totalSelected: next.length,
        limit,
        pricing: calculateSelectionPricing(gallery, images, next, lockedSelection),
      }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/client-gallery/select-all" && request.method === "POST") {
      const body = await readJson(request);
      const slug = slugify(body.slug || "");
      const gallery = await getPrivateGalleryBySlug(env, slug);

      if (!gallery) return errorJson("Galeria não encontrada.", 404);
      const access = await requireClientGalleryAccess(request, env, gallery);
      if (access.error) return access.error;
      if (gallery.status === "final") return errorJson("A seleção desta galeria já foi encerrada.", 409);

      const images = visibleGalleryImages(gallery, await readKvJson(env, privateGalleryImagesKey(gallery.id), []));
      const current = await readKvJson(env, privateGallerySelectionKey(gallery.id), []);
      const lockedSelection = await ensureCompletedSelectionBaseline(env, gallery, images, current);
      const next = images.map((image) => image.public_id).filter(Boolean);
      await writeKvJson(env, privateGallerySelectionKey(gallery.id), next);
      await appendPrivateGalleryEvent(env, request, gallery.id, "selecionar_todas", {
        totalSelected: next.length,
      }, access.client);

      return json({
        ok: true,
        selectedPublicIds: next,
        totalSelected: next.length,
        limit: Number(gallery.selectionLimit || 0),
        pricing: calculateSelectionPricing(gallery, images, next, lockedSelection),
      }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/client-gallery/complete" && request.method === "POST") {
      const body = await readJson(request);
      const slug = slugify(body.slug || "");
      const gallery = await getPrivateGalleryBySlug(env, slug);
      if (!gallery) return errorJson("Galeria não encontrada.", 404);
      const access = await requireClientGalleryAccess(request, env, gallery);
      if (access.error) return access.error;
      if (gallery.status === "final") return errorJson("A seleção desta galeria já foi encerrada.", 409);

      const images = visibleGalleryImages(gallery, await readKvJson(env, privateGalleryImagesKey(gallery.id), []));
      const selection = await readKvJson(env, privateGallerySelectionKey(gallery.id), []);
      const lockedSelection = await ensureCompletedSelectionBaseline(env, gallery, images, selection);
      const hasSelectionChanges = lockedSelection.length > 0 && selectionChanged(lockedSelection, selection);
      if (gallery.selectionCompletedAt && !hasSelectionChanges) {
        return json({ ok: true, alreadyCompleted: true, totalSelected: selection.length }, 200, { "Cache-Control": "no-store" });
      }

      const pricing = calculateSelectionPricing(gallery, images, selection, lockedSelection);

      if (pricing.needsMoreIncludedPhotos) {
        return errorJson(`Selecione pelo menos ${pricing.includedPhotos} fotos para concluir.`, 409, { pricing });
      }

      if (pricing.requiresPayment) {
        return errorJson("Pagamento necessário para concluir fotos extras.", 402, { pricing, paymentRequired: true });
      }

      const completed = await completePrivateGallerySelection(env, request, gallery, access.linkedClient || access.client, images, selection, null);

      return json({
        ok: true,
        totalSelected: selection.length,
        gallery: publicPrivateGallery(completed.gallery, images, selection),
        pricing: completed.pricing,
        emailQueued: completed.emailQueued,
        emailError: completed.emailError,
      }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/client-gallery/payment/create" && request.method === "POST") {
      const body = await readJson(request);
      const slug = slugify(body.slug || "");
      const gallery = await getPrivateGalleryBySlug(env, slug);
      if (!gallery) return errorJson("Galeria não encontrada.", 404);
      const access = await requireClientGalleryAccess(request, env, gallery);
      if (access.error) return access.error;
      if (gallery.status === "final") return errorJson("A seleção desta galeria já foi encerrada.", 409);
      if (!env.LIKES_KV) return errorJson("LIKES_KV not configured", 500);

      const images = visibleGalleryImages(gallery, await readKvJson(env, privateGalleryImagesKey(gallery.id), []));
      const selection = await readKvJson(env, privateGallerySelectionKey(gallery.id), []);
      const lockedSelection = await ensureCompletedSelectionBaseline(env, gallery, images, selection);
      const hasSelectionChanges = lockedSelection.length > 0 && selectionChanged(lockedSelection, selection);
      const pricing = calculateSelectionPricing(gallery, images, selection, lockedSelection);

      if (pricing.needsMoreIncludedPhotos) {
        return errorJson(`Selecione pelo menos ${pricing.includedPhotos} fotos para concluir.`, 409, { pricing });
      }
      if (gallery.selectionCompletedAt && !hasSelectionChanges) {
        return json({ ok: true, alreadyCompleted: true, paymentRequired: false, pricing }, 200, { "Cache-Control": "no-store" });
      }
      if (!pricing.requiresPayment) {
        return json({ ok: true, paymentRequired: false, pricing }, 200, { "Cache-Control": "no-store" });
      }

      const now = Date.now();
      const payment = {
        id: `pay_${randomToken(12)}`,
        provider: "mercadopago",
        status: "pending",
        galleryId: gallery.id,
        gallerySlug: gallery.slug,
        clientEmail: normalizeEmail(access.linkedClient?.email || access.client?.email || ""),
        clientName: access.linkedClient?.name || access.client?.name || "Cliente",
        selectedPublicIds: [...new Set(selection)],
        pricing,
        amountCents: pricing.totalCents,
        createdAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 1000 * 60 * 30).toISOString(),
      };

      try {
        const mp = await createMercadoPagoPixPayment(env, request, payment, gallery, access.linkedClient || access.client);
        const savedPayment = {
          ...payment,
          providerPaymentId: mp.providerPaymentId,
          providerStatus: mp.providerStatus,
          providerStatusDetail: mp.rawStatus,
          qrCode: mp.qrCode,
          qrCodeBase64: mp.qrCodeBase64,
          ticketUrl: mp.ticketUrl,
        };
        await writeKvJson(env, privateGalleryPaymentKey(savedPayment.id), savedPayment, { expirationTtl: 60 * 60 * 24 * 7 });
        if (savedPayment.providerPaymentId) {
          await env.LIKES_KV.put(mercadoPagoPaymentKey(savedPayment.providerPaymentId), savedPayment.id, { expirationTtl: 60 * 60 * 24 * 7 });
        }
        await env.LIKES_KV.put(privateGalleryLatestPaymentKey(gallery.id), savedPayment.id, { expirationTtl: 60 * 60 * 24 * 7 });
        await appendPrivateGalleryEvent(env, request, gallery.id, "pix_criado", {
          paymentId: savedPayment.id,
          providerPaymentId: savedPayment.providerPaymentId,
          pricing,
        }, access.client);

        return json({
          ok: true,
          paymentRequired: true,
          pricing,
          payment: publicPayment(savedPayment),
        }, 200, { "Cache-Control": "no-store" });
      } catch (err) {
        console.error("Mercado Pago create payment error:", err);
        return errorJson("Não foi possível gerar o Pix agora.", 502, {
          detail: String(err?.message || err || "unknown"),
        });
      }
    }

    if (url.pathname === "/client-gallery/payment/status" && request.method === "GET") {
      const paymentId = String(url.searchParams.get("id") || "").trim();
      if (!paymentId) return errorJson("Pagamento inválido.", 400);
      const payment = await readKvJson(env, privateGalleryPaymentKey(paymentId), null);
      if (!payment) return errorJson("Pagamento não encontrado.", 404);

      const gallery = await readKvJson(env, privateGalleryKey(payment.galleryId), null);
      if (!gallery) return errorJson("Galeria não encontrada.", 404);
      const access = await requireClientGalleryAccess(request, env, gallery);
      if (access.error) return access.error;

      let currentPayment = payment;
      if (payment.providerPaymentId && payment.status === "pending") {
        try {
          const result = await approveMercadoPagoPayment(env, request, payment.providerPaymentId);
          if (result.payment) currentPayment = result.payment;
        } catch (err) {
          console.error("Mercado Pago payment status check failed:", err);
        }
      }

      return json({
        ok: true,
        payment: publicPayment(currentPayment),
        completed: currentPayment.status === "approved" && Boolean(currentPayment.selectionCompletedAt),
      }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/client-gallery/download" && request.method === "GET") {
      const slug = slugify(url.searchParams.get("slug") || "");
      const publicId = sanitizePublicId(url.searchParams.get("publicId") || "");
      const gallery = await getPrivateGalleryBySlug(env, slug);
      if (!gallery) return errorJson("Galeria não encontrada.", 404);
      const access = await requireClientGalleryAccess(request, env, gallery);
      if (access.error) return access.error;
      if (gallery.status !== "final" && gallery.allowDownload !== true) {
        return errorJson("Download ainda não liberado.", 403);
      }

      const images = visibleGalleryImages(gallery, await readKvJson(env, privateGalleryImagesKey(gallery.id), []));
      const image = images.find((item) => item.public_id === publicId);
      if (!image) return errorJson("Foto não encontrada.", 404);
      ctx.waitUntil(appendPrivateGalleryEvent(env, request, gallery.id, "cliente_baixou_foto", { publicId }, access.client));

      return Response.redirect(cloudinaryAttachmentUrl(image.url), 302);
    }

    if (url.pathname === "/client-gallery/download-all" && request.method === "GET") {
      const slug = slugify(url.searchParams.get("slug") || "");
      const gallery = await getPrivateGalleryBySlug(env, slug);
      if (!gallery) return errorJson("Galeria não encontrada.", 404);
      const access = await requireClientGalleryAccess(request, env, gallery);
      if (access.error) return access.error;
      if (gallery.status !== "final" && gallery.allowDownload !== true) {
        return errorJson("Download ainda não liberado.", 403);
      }

      const cloudName = env.CLOUDINARY_CLOUD_NAME;
      const apiKey    = env.CLOUDINARY_API_KEY;
      const apiSecret = env.CLOUDINARY_API_SECRET;
      if (!cloudName || !apiKey || !apiSecret) return errorJson("Missing Cloudinary env vars", 500);

      const images = visibleGalleryImages(gallery, await readKvJson(env, privateGalleryImagesKey(gallery.id), []));
      const publicIds = images.map((image) => image.public_id).filter(Boolean);
      if (!publicIds.length) return errorJson("Nenhuma foto liberada para download.", 404);

      const archiveName = sanitizeDownloadName(`${gallery.slug || gallery.title || "galeria"}-fotos`);
      const archiveRes = await generateCloudinaryArchive(cloudName, apiKey, apiSecret, publicIds, archiveName);
      if (!archiveRes.ok) {
        const text = await archiveRes.text();
        return errorJson("Não foi possível gerar o ZIP das fotos.", 502, {
          detail: text,
        });
      }

      ctx.waitUntil(appendPrivateGalleryEvent(env, request, gallery.id, "cliente_baixou_todas", {
        totalImages: publicIds.length,
      }, access.client));

      return new Response(archiveRes.body, {
        status: 200,
        headers: {
          ...corsHeaders(),
          "Content-Type": archiveRes.headers.get("Content-Type") || "application/zip",
          "Content-Disposition": `attachment; filename="${archiveName}.zip"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (url.pathname === "/client-gallery/download-list" && request.method === "GET") {
      const slug = slugify(url.searchParams.get("slug") || "");
      const gallery = await getPrivateGalleryBySlug(env, slug);
      if (!gallery) return errorJson("Galeria não encontrada.", 404);
      const access = await requireClientGalleryAccess(request, env, gallery);
      if (access.error) return access.error;
      if (gallery.status !== "final" && gallery.allowDownload !== true) {
        return errorJson("Download ainda não liberado.", 403);
      }

      const images = visibleGalleryImages(gallery, await readKvJson(env, privateGalleryImagesKey(gallery.id), []));
      await appendPrivateGalleryEvent(env, request, gallery.id, "cliente_baixou_todas", {
        totalImages: images.length,
      }, access.client);

      return json({
        images: images.map((image) => ({
          public_id: image.public_id,
          filename: image.filename || image.display_name || image.public_id,
          downloadUrl: cloudinaryAttachmentUrl(image.url),
        })),
      }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/client-gallery/download-event" && request.method === "POST") {
      const body = await readJson(request);
      const slug = slugify(body.slug || "");
      const publicId = sanitizePublicId(body.publicId || body.public_id || "");
      const gallery = await getPrivateGalleryBySlug(env, slug);
      if (!gallery) return errorJson("Galeria não encontrada.", 404);
      const access = await requireClientGalleryAccess(request, env, gallery);
      if (access.error) return access.error;
      if (gallery.status !== "final" && gallery.allowDownload !== true) {
        return errorJson("Download ainda não liberado.", 403);
      }
      await appendPrivateGalleryEvent(env, request, gallery.id, "cliente_baixou_foto", { publicId }, access.client);
      return json({ ok: true }, 200, { "Cache-Control": "no-store" });
    }

    // ── AUTH ────────────────────────────────────────────────────

    if (url.pathname === "/auth/login" && request.method === "POST") {
      const body = await readJson(request);
      const email = normalizeEmail(body.email || "");
      const password = String(body.password || "");

      if (!email || !password) return errorJson("E-mail e senha são obrigatórios.", 400);
      if (!env.LIKES_KV) return errorJson("LIKES_KV not configured", 500);

      const user = await validateAdminLogin(env, email, password);
      if (!user) return errorJson("Credenciais inválidas.", 401);

      const session = await createSession(env, user);
      await appendAuditLog(env, request, user, "login", "auth", { email: user.email });
      return json(session);
    }

    if (url.pathname === "/auth/me" && request.method === "GET") {
      const token = getAdminToken(request);
      if (env.ADMIN_KEY && token === env.ADMIN_KEY) {
        return json({ user: { email: adminEmail(env), name: env.ADMIN_NAME || "Marcel Conde", role: "admin" } });
      }

      const session = await getSession(env, token);
      if (!session) return errorJson("Unauthorized", 401);

      return json({ user: publicUser(session) });
    }

    if (url.pathname === "/auth/logout" && request.method === "POST") {
      const token = getAdminToken(request);
      const user = await getCurrentAdmin(request, env);
      if (user) await appendAuditLog(env, request, user, "logout", "auth", { email: user.email });
      if (token && env.LIKES_KV) await env.LIKES_KV.delete(`admin_session:${token}`);
      return json({ ok: true });
    }

    if (url.pathname === "/auth/forgot" && request.method === "POST") {
      const body = await readJson(request);
      const email = normalizeEmail(body.email || "");
      const user = await getAdminUser(env, email);

      // Resposta neutra para não revelar se o e-mail existe.
      if (email && (user || email === adminEmail(env)) && env.LIKES_KV) {
        const token = randomToken(36);
        await env.LIKES_KV.put(
          `admin_reset:${token}`,
          JSON.stringify({
            email,
            createdAt: new Date().toISOString(),
            expiresAt: Date.now() + 1000 * 60 * 60,
          }),
          { expirationTtl: 60 * 60 }
        );

        try {
          const resend = await sendResetEmail(env, request, email, token);
          await appendAuditLog(env, request, user || { email, name: email, role: "admin" }, "solicitar_reset", "auth", { email });
          return json({ ok: true, emailQueued: true, resendId: resend?.id || null });
        } catch (err) {
          console.error("Reset email error:", err);
          return errorJson("Falha ao enviar e-mail pelo Resend.", 502, {
            detail: String(err?.message || err || "unknown"),
          });
        }
      }

      return json({ ok: true, emailQueued: false });
    }

    if (url.pathname === "/auth/reset" && request.method === "POST") {
      try {
        const body = await readJson(request);
        const token = String(body.token || "").trim();
        const password = String(body.password || "");

        if (!token || password.length < 6) return errorJson("Token ou senha inválidos.", 400);
        if (!env.LIKES_KV) return errorJson("LIKES_KV not configured", 500);

        const reset = await env.LIKES_KV.get(`admin_reset:${token}`, "json");
        if (!reset || !reset.email || Number(reset.expiresAt || 0) < Date.now()) {
          return errorJson("Token inválido ou expirado.", 400);
        }

        const existing = await getAdminUser(env, reset.email);
        const user = await saveUserPassword(env, reset.email, password, {
          name: existing?.name || (reset.email === adminEmail(env) ? env.ADMIN_NAME || "Marcel Conde" : reset.email),
          role: existing?.role || (reset.email === adminEmail(env) ? "admin" : "editor"),
        });
        await env.LIKES_KV.delete(`admin_reset:${token}`);
        await appendAuditLog(env, request, user, "redefinir_senha", "auth", { email: user.email });
        return json({ ok: true });
      } catch (err) {
        console.error("Reset password error:", err);
        return errorJson("Falha ao redefinir senha.", 500, {
          detail: String(err?.message || err || "unknown"),
        });
      }
    }

    if (url.pathname === "/auth/invite" && request.method === "GET") {
      const token = String(url.searchParams.get("token") || "").trim();
      if (!token || !env.LIKES_KV) return errorJson("Convite inválido.", 400);

      const invite = await env.LIKES_KV.get(`admin_invite:${token}`, "json");
      if (!invite || invite.usedAt || Number(invite.expiresAt || 0) < Date.now()) {
        return errorJson("Convite inválido ou expirado.", 400);
      }

      return json({
        email: invite.email,
        role: normalizeRole(invite.role),
      });
    }

    if (url.pathname === "/auth/invite/accept" && request.method === "POST") {
      const body = await readJson(request);
      const token = String(body.token || "").trim();
      const password = String(body.password || "");
      const name = cleanDisplayName(body.name || "");

      if (!token || password.length < 6) return errorJson("Token ou senha inválidos.", 400);
      if (!env.LIKES_KV) return errorJson("LIKES_KV not configured", 500);

      const invite = await env.LIKES_KV.get(`admin_invite:${token}`, "json");
      if (!invite || invite.usedAt || Number(invite.expiresAt || 0) < Date.now()) {
        return errorJson("Convite inválido ou expirado.", 400);
      }

      const existing = await getAdminUser(env, invite.email);
      if (existing?.passwordHash) return errorJson("Este e-mail já possui acesso.", 409);

      const user = await saveUserPassword(env, invite.email, password, {
        name: name || invite.email,
        role: normalizeRole(invite.role),
      });

      invite.usedAt = new Date().toISOString();
      await writeKvJson(env, `admin_invite:${token}`, invite);
      await appendAuditLog(env, request, user, "aceitar_convite", "users", { email: user.email });

      return json({ ok: true, user: publicUser(user) }, 201);
    }

    // ── ADMIN ───────────────────────────────────────────────────

    if (url.pathname === "/admin/me" && request.method === "GET") {
      const { error, user } = await requireAdminUser(request, env);
      if (error) return error;

      return json({
        ok: true,
        service: "marcel-admin",
        user: publicUser(user),
        time: new Date().toISOString(),
      });
    }

    if (url.pathname === "/private/clients" && request.method === "GET") {
      const { error } = await requireAdminUser(request, env);
      if (error) return error;
      const clients = await listPrivateClients(env);
      const enrichedClients = await Promise.all(clients.map(async (client) => ({
        ...client,
        access: await getClientAccessSummary(env, client.email),
      })));
      return json({ clients: enrichedClients }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/private/clients" && request.method === "POST") {
      const { error, user } = await requireAdminUser(request, env);
      if (error) return error;
      const body = await readJson(request);
      const client = await savePrivateClient(env, body);
      const access = await getClientAccessSummary(env, client.email);
      await appendAuditLog(env, request, user, body.id ? "editar_cliente_privado" : "criar_cliente_privado", "private_clients", { clientId: client.id, email: client.email });
      return json({ client, access, temporaryPassword: "" }, body.id ? 200 : 201, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/private/client/access" && request.method === "POST") {
      const { error, user } = await requireAdminUser(request, env);
      if (error) return error;
      const body = await readJson(request);
      const clientId = String(body.clientId || body.id || "").trim();
      const action = String(body.action || "").trim();
      const client = await readKvJson(env, privateClientKey(clientId), null);
      if (!client) return errorJson("Cliente não encontrado.", 404);
      if (!client.email) return errorJson("Cadastre o e-mail do cliente antes de gerar o acesso.", 400);

      if (action === "temporary_password") {
        const issued = await issueClientTemporaryPassword(env, client);
        let emailResult = null;
        let emailError = "";
        try {
          emailResult = await sendClientTemporaryPasswordEmail(env, client.email, client, issued.temporaryPassword);
        } catch (err) {
          emailError = String(err?.message || err || "Erro ao enviar e-mail");
          console.error("Client temporary password email error:", err);
        }
        await appendAuditLog(env, request, user, "gerar_senha_temporaria_cliente", "private_clients", {
          clientId: client.id,
          email: client.email,
          emailQueued: Boolean(emailResult),
          emailError,
        });
        return json({
          ok: true,
          access: issued.access,
          temporaryPassword: issued.temporaryPassword,
          emailQueued: Boolean(emailResult),
          emailError,
        }, 200, { "Cache-Control": "no-store" });
      }

      if (action === "password_reset") {
        const storedUser = await getClientUser(env, client.email);
        if (!storedUser?.passwordHash) return errorJson("Este cliente ainda não possui uma senha. Gere um acesso temporário primeiro.", 409);
        const { token } = await createClientPasswordReset(env, client, user.email || "admin");
        let emailResult = null;
        let emailError = "";
        try {
          emailResult = await sendClientPasswordResetEmail(env, client.email, client, token);
        } catch (err) {
          emailError = String(err?.message || err || "Erro ao enviar e-mail");
          console.error("Admin client reset email error:", err);
        }
        await appendAuditLog(env, request, user, "enviar_reset_senha_cliente", "private_clients", {
          clientId: client.id,
          email: client.email,
          emailQueued: Boolean(emailResult),
          emailError,
        });
        return json({
          ok: true,
          emailQueued: Boolean(emailResult),
          emailError,
        }, 200, { "Cache-Control": "no-store" });
      }

      return errorJson("Ação de acesso inválida.", 400);
    }

    if (url.pathname === "/private/client/delete" && request.method === "POST") {
      const { error, user } = await requireAdminUser(request, env);
      if (error) return error;

      const body = await readJson(request);
      try {
        const client = await deletePrivateClient(env, body.id || body.clientId);
        if (!client) return errorJson("Cliente não encontrado.", 404);

        await appendAuditLog(env, request, user, "excluir_cliente_privado", "private_clients", {
          clientId: client.id,
          email: client.email,
        });

        return json({ ok: true, clientId: client.id }, 200, { "Cache-Control": "no-store" });
      } catch (err) {
        return errorJson(err.message || "Erro ao apagar cliente.", err.status || 500, {
          linkedGalleries: err.linkedGalleries || undefined,
          linkedQuotes: err.linkedQuotes || undefined,
        });
      }
    }

    if (url.pathname === "/private/quotes" && request.method === "GET") {
      const { error } = await requireAdminUser(request, env);
      if (error) return error;
      const [quotes, clients] = await Promise.all([listPrivateQuotes(env), listPrivateClients(env)]);
      return json({
        quotes: quotes.map((quote) => ({ ...publicQuote(quote), internalNotes: quote.internalNotes || "" })),
        clients,
      }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/private/quotes" && request.method === "POST") {
      const { error, user } = await requireAdminUser(request, env);
      if (error) return error;
      const body = await readJson(request);
      try {
        const quote = await savePrivateQuote(env, body);
        await appendAuditLog(env, request, user, body.id ? "editar_orcamento" : "criar_orcamento", "private_quotes", {
          quoteId: quote.id,
          number: quote.number,
          clientId: quote.clientId,
        });
        await appendPrivateQuoteEvent(env, request, quote.id, body.id ? "admin_editou_orcamento" : "admin_criou_orcamento", {}, user);
        return json({ quote: { ...publicQuote(quote), internalNotes: quote.internalNotes || "" } }, body.id ? 200 : 201, { "Cache-Control": "no-store" });
      } catch (err) {
        return errorJson(err.message || "Erro ao salvar orçamento.", err.status || 500);
      }
    }

    if (url.pathname === "/private/quote" && request.method === "GET") {
      const { error } = await requireAdminUser(request, env);
      if (error) return error;
      const id = String(url.searchParams.get("id") || "").trim();
      const quote = await readKvJson(env, privateQuoteKey(id), null);
      if (!quote) return errorJson("Orçamento não encontrado.", 404);
      const [client, events] = await Promise.all([
        quote.clientId ? readKvJson(env, privateClientKey(quote.clientId), null) : null,
        readKvJson(env, privateQuoteEventsKey(id), []),
      ]);
      return json({
        quote: { ...publicQuote(quote), internalNotes: quote.internalNotes || "", acceptanceEmails: quote.acceptanceEmails || null },
        client,
        events: events.slice(0, 160),
      }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/private/quote/delete" && request.method === "POST") {
      const { error, user } = await requireAdminUser(request, env);
      if (error) return error;
      const body = await readJson(request);
      try {
        const quote = await deletePrivateQuote(env, body.id || body.quoteId);
        if (!quote) return errorJson("Orçamento não encontrado.", 404);
        await appendAuditLog(env, request, user, "excluir_orcamento", "private_quotes", { quoteId: quote.id, number: quote.number });
        return json({ ok: true, quoteId: quote.id }, 200, { "Cache-Control": "no-store" });
      } catch (err) {
        return errorJson(err.message || "Erro ao apagar orçamento.", err.status || 500);
      }
    }

    if (url.pathname === "/private/quote/publish" && request.method === "POST") {
      const { error, user } = await requireAdminUser(request, env);
      if (error) return error;
      const body = await readJson(request);
      const id = String(body.id || body.quoteId || "").trim();
      const quote = await readKvJson(env, privateQuoteKey(id), null);
      if (!quote) return errorJson("Orçamento não encontrado.", 404);
      if (quote.status === "accepted") return errorJson("Este orçamento já foi aceito e não pode ser republicado.", 409);
      const client = quote.clientId ? await readKvJson(env, privateClientKey(quote.clientId), null) : null;
      if (!client?.email) return errorJson("Vincule um cliente com e-mail antes de publicar.", 400);
      if (!normalizeQuoteItems(quote.items || []).length) return errorJson("Adicione ao menos um item ao orçamento.", 400);
      if (!normalizeQuoteClauses(quote.clauses || []).length) return errorJson("Adicione as cláusulas do contrato.", 400);

      const now = new Date().toISOString();
      quote.version = Number(quote.version || 0) + 1;
      quote.status = "published";
      quote.publishedAt = now;
      quote.viewedAt = null;
      quote.acceptedAt = null;
      quote.acceptance = null;
      quote.publishedSnapshot = quotePublishedSnapshot(env, quote, client);
      quote.publishedHash = await sha256Hex(JSON.stringify(quote.publishedSnapshot));
      quote.updatedAt = now;
      await writeKvJson(env, privateQuoteKey(quote.id), quote);

      const existingClientUser = await getClientUser(env, client.email);
      const hasClientPassword = hasPermanentClientAccess(existingClientUser);
      const firstAccess = !hasClientPassword;
      let accessUrl = clientQuoteLoginUrl(env, quote.id);
      let inviteUrl = "";
      let emailResult = null;
      let emailError = "";
      try {
        if (firstAccess) {
          const invite = await createClientContentInvite(env, "quote", client.id, quote.id);
          accessUrl = invite.url;
          inviteUrl = invite.url;
        }
        emailResult = await sendQuotePublishedEmail(
          env,
          client.email,
          quote,
          client,
          accessUrl,
          firstAccess,
        );
      } catch (err) {
        emailError = String(err?.message || err || "Erro ao enviar e-mail");
        console.error("Quote publish email error:", err);
      }

      quote.lastEmailAt = new Date().toISOString();
      quote.lastEmailQueued = Boolean(emailResult);
      quote.lastEmailError = emailError;
      await writeKvJson(env, privateQuoteKey(quote.id), quote);
      await appendAuditLog(env, request, user, "publicar_orcamento", "private_quotes", {
        quoteId: quote.id,
        number: quote.number,
        version: quote.version,
        email: client.email,
        firstAccess,
        emailQueued: Boolean(emailResult),
        emailError,
      });
      await appendPrivateQuoteEvent(env, request, quote.id, "admin_publicou_orcamento", {
        version: quote.version,
        publishedHash: quote.publishedHash,
        email: client.email,
        firstAccess,
        emailQueued: Boolean(emailResult),
        emailError,
      }, user);

      return json({
        ok: true,
        quote: { ...publicQuote(quote), internalNotes: quote.internalNotes || "" },
        clientUrl: clientQuoteUrl(env, quote.id),
        inviteUrl,
        firstAccess,
        temporaryAccess: false,
        emailQueued: Boolean(emailResult),
        emailError,
        resendId: emailResult?.id || null,
      }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/private/quote/pdf" && request.method === "GET") {
      const { error } = await requireAdminUser(request, env);
      if (error) return error;
      const id = String(url.searchParams.get("id") || "").trim();
      const quote = await readKvJson(env, privateQuoteKey(id), null);
      if (!quote) return errorJson("Orçamento não encontrado.", 404);
      const client = quote.clientId ? await readKvJson(env, privateClientKey(quote.clientId), null) : null;
      const bytes = buildQuotePdf(env, quote, client || {}, quote.acceptance || null);
      return new Response(bytes, {
        status: 200,
        headers: {
          ...corsHeaders(),
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${sanitizeDownloadName(quote.number || "orcamento")}.pdf"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    if (url.pathname === "/private/galleries" && request.method === "GET") {
      const { error } = await requireAdminUser(request, env);
      if (error) return error;
      const galleries = await listPrivateGalleries(env);
      const clients = await listPrivateClients(env);
      return json({ galleries, clients }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/private/galleries" && request.method === "POST") {
      const { error, user } = await requireAdminUser(request, env);
      if (error) return error;
      const body = await readJson(request);
      const gallery = await savePrivateGallery(env, body);
      await appendAuditLog(env, request, user, body.id ? "editar_galeria_privada" : "criar_galeria_privada", "private_galleries", { galleryId: gallery.id, slug: gallery.slug });
      return json({ gallery }, body.id ? 200 : 201, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/private/gallery" && request.method === "GET") {
      const { error } = await requireAdminUser(request, env);
      if (error) return error;
      const id = String(url.searchParams.get("id") || "").trim();
      if (!id) return errorJson("Missing id", 400);

      let gallery = await readKvJson(env, privateGalleryKey(id), null);
      if (!gallery) return errorJson("Galeria não encontrada.", 404);
      const images = await readKvJson(env, privateGalleryImagesKey(id), []);
      const selection = await readKvJson(env, privateGallerySelectionKey(id), []);
      const events = await readKvJson(env, privateGalleryEventsKey(id), []);
      gallery = await repairPrivateGalleryProgress(env, gallery, await getPrivateGalleryLatestPayment(env, gallery.id), events);
      return json({ gallery, images, selection, events: events.slice(0, 120) }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/private/gallery/delete" && request.method === "POST") {
      const { error, user } = await requireAdminUser(request, env);
      if (error) return error;

      const body = await readJson(request);
      try {
        const result = await deletePrivateGallery(env, body.id || body.galleryId);
        if (!result) return errorJson("Galeria não encontrada.", 404);

        await appendAuditLog(env, request, user, "excluir_galeria_privada", "private_galleries", {
          galleryId: result.gallery.id,
          slug: result.gallery.slug,
          deletedImages: result.deleted,
          failedImages: result.failed.length,
        });

        return json({
          ok: true,
          galleryId: result.gallery.id,
          deletedImages: result.deleted,
          failedImages: result.failed,
        }, 200, { "Cache-Control": "no-store" });
      } catch (err) {
        return errorJson(err.message || "Erro ao apagar galeria.", err.status || 500);
      }
    }

    if (url.pathname === "/private/gallery/publish" && request.method === "POST") {
      const { error, user } = await requireAdminUser(request, env);
      if (error) return error;

      const body = await readJson(request);
      const galleryId = String(body.galleryId || "").trim();
      if (!galleryId) return errorJson("Galeria inválida.", 400);
      if (!env.LIKES_KV) return errorJson("LIKES_KV not configured", 500);

      let gallery = await readKvJson(env, privateGalleryKey(galleryId), null);
      if (!gallery) return errorJson("Galeria não encontrada.", 404);

      if (["selection", "editing", "final"].includes(body.status) && body.status !== gallery.status) {
        gallery = await savePrivateGallery(env, {
          id: gallery.id,
          status: body.status,
        });
      }

      const client = gallery.clientId ? await readKvJson(env, privateClientKey(gallery.clientId), null) : null;
      if (!client?.email) {
        return errorJson("Vincule um cliente com e-mail antes de publicar a galeria.", 400);
      }

      const existingClientUser = await getClientUser(env, client.email);
      const hasClientPassword = hasPermanentClientAccess(existingClientUser);
      const firstAccess = !hasClientPassword;
      const finalDelivery = gallery.status === "final" || gallery.allowDownload === true;
      const emailType = finalDelivery ? "final_delivery" : firstAccess ? "first_access" : "login_access";
      let inviteUrl = "";
      let accessUrl = clientGalleryLoginUrl(env, gallery.slug || "");
      let resend = null;
      let emailError = "";

      try {
        let inviteToken = "";
        if (firstAccess) {
          const invite = await createClientContentInvite(env, "gallery", client.id, gallery.id);
          inviteToken = invite.token;
          inviteUrl = invite.url;
          accessUrl = invite.url;
        }
        if (emailType === "final_delivery") {
          resend = await sendClientFinalDeliveryEmail(env, client.email, gallery, client, accessUrl, firstAccess);
        } else if (emailType === "login_access") {
          resend = await sendClientGalleryLoginEmail(env, client.email, gallery, client);
        } else {
          resend = await sendClientGalleryInviteEmail(env, client.email, inviteToken, gallery, client);
        }
      } catch (err) {
        emailError = String(err?.message || err || "unknown");
        console.error("Client gallery email error:", err);
      }

      gallery.publishedAt = gallery.publishedAt || new Date().toISOString();
      if (emailType === "final_delivery") {
        gallery.lastDeliveryEmailAt = new Date().toISOString();
      } else if (emailType === "login_access") {
        gallery.lastAccessEmailAt = new Date().toISOString();
      } else {
        gallery.lastTemporaryAccessAt = new Date().toISOString();
      }
      gallery.updatedAt = new Date().toISOString();
      await writeKvJson(env, privateGalleryKey(gallery.id), gallery);

      await appendAuditLog(env, request, user, "publicar_galeria_cliente", "private_galleries", {
        galleryId: gallery.id,
        slug: gallery.slug,
        email: client.email,
        emailType,
        hasClientPassword,
        firstAccess,
        emailQueued: Boolean(resend),
        emailError,
      });
      await appendPrivateGalleryEvent(env, request, gallery.id, "admin_publicou_galeria", {
        email: client.email,
        emailType,
        hasClientPassword,
        firstAccess,
        emailQueued: Boolean(resend),
        emailError,
      }, user);

      return json({
        ok: true,
        gallery,
        emailType,
        hasClientPassword,
        firstAccess,
        temporaryAccess: false,
        inviteUrl,
        galleryUrl: clientGalleryUrl(env, gallery.slug),
        emailQueued: Boolean(resend),
        emailError,
        resendId: resend?.id || null,
      }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/private/gallery/upload-signature" && request.method === "POST") {
      const { error, user } = await requireAdminUser(request, env);
      if (error) return error;

      const cloudName = env.CLOUDINARY_CLOUD_NAME;
      const apiKey    = env.CLOUDINARY_API_KEY;
      const apiSecret = env.CLOUDINARY_API_SECRET;
      if (!cloudName || !apiKey || !apiSecret) return errorJson("Missing Cloudinary env vars", 500);

      const body = await readJson(request);
      const galleryId = String(body.galleryId || "").trim();
      const displayName = cleanDisplayName(body.displayName || "");
      const phase = body.phase === "final" ? "final" : "selection";
      const gallery = await readKvJson(env, privateGalleryKey(galleryId), null);
      if (!gallery) return errorJson("Galeria não encontrada.", 404);

      const timestamp = Math.round(Date.now() / 1000);
      const params = {
        asset_folder: `clientes/${gallery.slug || gallery.id}/${phase === "final" ? "finais" : "selecao"}`,
        display_name: displayName || "foto",
        timestamp,
        unique_filename: "true",
        overwrite: "false",
      };
      const signature = await signCloudinaryParams(params, apiSecret);
      await appendAuditLog(env, request, user, "preparar_upload_galeria_privada", "private_galleries", { galleryId, phase, displayName });

      return json({
        cloudName,
        apiKey,
        uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        params,
        signature,
      }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/private/watermark/upload-signature" && request.method === "POST") {
      const { error, user } = await requireAdminUser(request, env);
      if (error) return error;

      const cloudName = env.CLOUDINARY_CLOUD_NAME;
      const apiKey    = env.CLOUDINARY_API_KEY;
      const apiSecret = env.CLOUDINARY_API_SECRET;
      if (!cloudName || !apiKey || !apiSecret) return errorJson("Missing Cloudinary env vars", 500);

      const body = await readJson(request);
      const displayName = cleanDisplayName(body.displayName || body.display_name || "marca-dagua");
      const timestamp = Math.round(Date.now() / 1000);
      const params = {
        asset_folder: "site/watermarks",
        display_name: displayName || "marca-dagua",
        timestamp,
        unique_filename: "true",
        overwrite: "false",
      };
      const signature = await signCloudinaryParams(params, apiSecret);
      await appendAuditLog(env, request, user, "preparar_upload_marca_dagua", "private_galleries", { displayName });

      return json({
        cloudName,
        apiKey,
        uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        params,
        signature,
      }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/private/gallery/register-image" && request.method === "POST") {
      const { error, user } = await requireAdminUser(request, env);
      if (error) return error;

      const body = await readJson(request);
      const galleryId = String(body.galleryId || "").trim();
      const gallery = await readKvJson(env, privateGalleryKey(galleryId), null);
      if (!gallery) return errorJson("Galeria não encontrada.", 404);

      const publicId = sanitizePublicId(body.public_id || body.publicId || "");
      const urlValue = String(body.url || body.secure_url || "").trim();
      if (!publicId || !urlValue) return errorJson("Foto inválida.", 400);

      const images = await readKvJson(env, privateGalleryImagesKey(galleryId), []);
      const image = {
        id: publicId,
        public_id: publicId,
        url: urlValue,
        display_name: cleanDisplayName(body.display_name || body.displayName || body.original_filename || "foto"),
        filename: cleanDisplayName(body.original_filename || body.filename || body.display_name || ""),
        width: body.width || null,
        height: body.height || null,
        format: body.format || "",
        phase: body.phase === "final" ? "final" : "selection",
        createdAt: new Date().toISOString(),
      };

      const next = [image, ...images.filter((item) => item.public_id !== publicId)];
      await writeKvJson(env, privateGalleryImagesKey(galleryId), next);

      if (body.useAsCover === true || !gallery.coverUrl) {
        gallery.coverUrl = image.url;
        gallery.coverPublicId = image.public_id;
        gallery.updatedAt = new Date().toISOString();
        await writeKvJson(env, privateGalleryKey(galleryId), gallery);
      }

      await appendAuditLog(env, request, user, "registrar_foto_galeria_privada", "private_galleries", { galleryId, publicId });
      await appendPrivateGalleryEvent(env, request, galleryId, "admin_enviou_foto", { publicId }, user);

      return json({ image, gallery }, 201, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/private/gallery/delete-image" && request.method === "POST") {
      const { error, user } = await requireAdminUser(request, env);
      if (error) return error;

      const cloudName = env.CLOUDINARY_CLOUD_NAME;
      const apiKey    = env.CLOUDINARY_API_KEY;
      const apiSecret = env.CLOUDINARY_API_SECRET;
      if (!cloudName || !apiKey || !apiSecret) return errorJson("Missing Cloudinary env vars", 500);

      const body = await readJson(request);
      const galleryId = String(body.galleryId || "").trim();
      const publicId = sanitizePublicId(body.publicId || body.public_id || "");
      if (!galleryId || !publicId) return errorJson("Dados inválidos.", 400);

      const gallery = await readKvJson(env, privateGalleryKey(galleryId), null);
      if (!gallery) return errorJson("Galeria não encontrada.", 404);

      await destroyCloudinaryImage(cloudName, apiKey, apiSecret, publicId);
      const images = await readKvJson(env, privateGalleryImagesKey(galleryId), []);
      await writeKvJson(env, privateGalleryImagesKey(galleryId), images.filter((image) => image.public_id !== publicId));
      const selection = await readKvJson(env, privateGallerySelectionKey(galleryId), []);
      await writeKvJson(env, privateGallerySelectionKey(galleryId), selection.filter((item) => item !== publicId));

      if (gallery.coverPublicId === publicId) {
        const remaining = images.filter((image) => image.public_id !== publicId);
        gallery.coverPublicId = remaining[0]?.public_id || "";
        gallery.coverUrl = remaining[0]?.url || "";
        gallery.updatedAt = new Date().toISOString();
        await writeKvJson(env, privateGalleryKey(galleryId), gallery);
      }

      await appendAuditLog(env, request, user, "excluir_foto_galeria_privada", "private_galleries", { galleryId, publicId });
      return json({ ok: true }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/private/gallery/delete-images" && request.method === "POST") {
      const { error, user } = await requireAdminUser(request, env);
      if (error) return error;

      const cloudName = env.CLOUDINARY_CLOUD_NAME;
      const apiKey    = env.CLOUDINARY_API_KEY;
      const apiSecret = env.CLOUDINARY_API_SECRET;
      if (!cloudName || !apiKey || !apiSecret) return errorJson("Missing Cloudinary env vars", 500);

      const body = await readJson(request);
      const galleryId = String(body.galleryId || "").trim();
      const publicIds = [...new Set((Array.isArray(body.publicIds) ? body.publicIds : [])
        .map((publicId) => sanitizePublicId(publicId))
        .filter(Boolean))];

      if (!galleryId || !publicIds.length) return errorJson("Dados inválidos.", 400);

      const gallery = await readKvJson(env, privateGalleryKey(galleryId), null);
      if (!gallery) return errorJson("Galeria não encontrada.", 404);

      const requested = new Set(publicIds);
      const images = await readKvJson(env, privateGalleryImagesKey(galleryId), []);
      const toDelete = images.filter((image) => requested.has(image.public_id));
      if (!toDelete.length) return errorJson("Nenhuma foto encontrada para excluir.", 404);

      const deletedIds = new Set();
      const failed = [];

      for (const image of toDelete) {
        try {
          await destroyCloudinaryImage(cloudName, apiKey, apiSecret, image.public_id);
          deletedIds.add(image.public_id);
        } catch (err) {
          failed.push({
            public_id: image.public_id,
            error: String(err?.message || err || "unknown"),
          });
        }
      }

      if (deletedIds.size) {
        const kept = images.filter((image) => !deletedIds.has(image.public_id));
        await writeKvJson(env, privateGalleryImagesKey(galleryId), kept);

        const selection = await readKvJson(env, privateGallerySelectionKey(galleryId), []);
        await writeKvJson(env, privateGallerySelectionKey(galleryId), selection.filter((item) => !deletedIds.has(item)));

        if (gallery.coverPublicId && deletedIds.has(gallery.coverPublicId)) {
          gallery.coverPublicId = kept[0]?.public_id || "";
          gallery.coverUrl = kept[0]?.url || "";
          gallery.updatedAt = new Date().toISOString();
          await writeKvJson(env, privateGalleryKey(galleryId), gallery);
        }
      }

      await appendAuditLog(env, request, user, "excluir_fotos_galeria_privada", "private_galleries", {
        galleryId,
        deleted: deletedIds.size,
        failed: failed.length,
      });
      await appendPrivateGalleryEvent(env, request, galleryId, "admin_excluiu_fotos", {
        deleted: deletedIds.size,
        failed: failed.length,
      }, user);

      return json({
        ok: true,
        deleted: deletedIds.size,
        failed,
      }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/private/gallery/prune-unselected" && request.method === "POST") {
      const { error, user } = await requireAdminUser(request, env);
      if (error) return error;

      const cloudName = env.CLOUDINARY_CLOUD_NAME;
      const apiKey    = env.CLOUDINARY_API_KEY;
      const apiSecret = env.CLOUDINARY_API_SECRET;
      if (!cloudName || !apiKey || !apiSecret) return errorJson("Missing Cloudinary env vars", 500);

      const body = await readJson(request);
      const galleryId = String(body.galleryId || "").trim();
      if (!galleryId) return errorJson("Galeria inválida.", 400);

      const gallery = await readKvJson(env, privateGalleryKey(galleryId), null);
      if (!gallery) return errorJson("Galeria não encontrada.", 404);

      const images = await readKvJson(env, privateGalleryImagesKey(galleryId), []);
      const selection = await readKvJson(env, privateGallerySelectionKey(galleryId), []);
      const selected = new Set(selection);

      if (!selected.size) {
        return errorJson("Nenhuma foto selecionada pelo cliente.", 400);
      }

      const kept = images.filter((image) => selected.has(image.public_id) || image.phase === "final");
      const removed = images.filter((image) => !selected.has(image.public_id) && image.phase !== "final");

      if (!removed.length) {
        return json({ ok: true, removed: 0, kept: kept.length }, 200, { "Cache-Control": "no-store" });
      }

      for (const image of removed) {
        await destroyCloudinaryImage(cloudName, apiKey, apiSecret, image.public_id);
      }

      await writeKvJson(env, privateGalleryImagesKey(galleryId), kept);
      const nextSelection = selection.filter((publicId) => kept.some((image) => image.public_id === publicId));
      await writeKvJson(env, privateGallerySelectionKey(galleryId), nextSelection);

      if (gallery.coverPublicId && !kept.some((image) => image.public_id === gallery.coverPublicId)) {
        gallery.coverPublicId = kept[0]?.public_id || "";
        gallery.coverUrl = kept[0]?.url || "";
      }
      gallery.updatedAt = new Date().toISOString();
      await writeKvJson(env, privateGalleryKey(galleryId), gallery);

      await appendAuditLog(env, request, user, "remover_nao_selecionadas_galeria_privada", "private_galleries", {
        galleryId,
        removed: removed.length,
        kept: kept.length,
      });
      await appendPrivateGalleryEvent(env, request, galleryId, "admin_removeu_nao_selecionadas", {
        removed: removed.length,
        kept: kept.length,
      }, user);

      return json({
        ok: true,
        removed: removed.length,
        kept: kept.length,
      }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/private/gallery/export-selected" && request.method === "GET") {
      const { error } = await requireAdminUser(request, env);
      if (error) return error;

      const id = String(url.searchParams.get("id") || "").trim();
      const gallery = await readKvJson(env, privateGalleryKey(id), null);
      if (!gallery) return errorJson("Galeria não encontrada.", 404);

      const images = await readKvJson(env, privateGalleryImagesKey(id), []);
      const selected = new Set(await readKvJson(env, privateGallerySelectionKey(id), []));
      const rows = images
        .filter((image) => selected.has(image.public_id))
        .map((image) => [
          image.filename || image.display_name || image.public_id,
          image.display_name || "",
          image.public_id,
        ]);
      const csv = [
        ["arquivo", "nome_exibido", "public_id"],
        ...rows,
      ].map((row) => row.map(csvEscape).join(";")).join("\n");

      return new Response(csv, {
        status: 200,
        headers: {
          ...corsHeaders(),
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${gallery.slug || id}-selecionadas.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (url.pathname === "/auth/users" && request.method === "GET") {
      const { error } = await requireSuperAdmin(request, env);
      if (error) return error;

      return json({ users: await listAdminUsers(env) });
    }

    if (url.pathname === "/auth/delete-user" && request.method === "POST") {
      const { error, user } = await requireSuperAdmin(request, env);
      if (error) return error;

      const body = await readJson(request);
      const email = normalizeEmail(body.email || "");
      if (!email) return errorJson("Missing email", 400);
      if (email === normalizeEmail(user.email)) return errorJson("Não é possível excluir sua própria conta.", 400);
      if (email === adminEmail(env)) return errorJson("Não é possível excluir o admin principal.", 400);

      if (env.LIKES_KV) {
        await env.LIKES_KV.delete(`admin_user:${email}`);
        await saveUserEmails(env, (await getUserEmails(env)).filter((item) => item !== email));
      }

      await appendAuditLog(env, request, user, "excluir_usuario", "users", { email });
      return json({ ok: true });
    }

    if (url.pathname === "/auth/invite" && request.method === "POST") {
      try {
        const { error, user } = await requireSuperAdmin(request, env);
        if (error) return error;

        const body = await readJson(request);
        const email = normalizeEmail(body.email || "");
        const role = normalizeRole(body.role || "editor");
        if (!email) return errorJson("E-mail obrigatório.", 400);
        if (!env.LIKES_KV) return errorJson("LIKES_KV not configured", 500);

        const existing = await getAdminUser(env, email);
        if (existing?.passwordHash) return errorJson("Este e-mail já possui acesso.", 409);

        const token = randomToken(36);
        const invite = {
          token,
          email,
          role,
          invitedBy: user.email,
          createdAt: new Date().toISOString(),
          expiresAt: Date.now() + 1000 * 60 * 60 * 48,
        };

        await writeKvJson(env, `admin_invite:${token}`, invite, { expirationTtl: 60 * 60 * 48 });
        const inviteIndex = await readKvJson(env, inviteIndexKey(), []);
        inviteIndex.unshift(token);
        await writeKvJson(env, inviteIndexKey(), [...new Set(inviteIndex)].slice(0, 100));

        let resend = null;
        let emailQueued = false;
        let emailError = "";

        try {
          resend = await sendInviteEmail(env, email, token, user.name || "Marcel Conde");
          emailQueued = true;
        } catch (err) {
          emailError = String(err?.message || err || "unknown");
          console.error("Invite email error:", err);
        }

        const inviteUrl = adminInviteUrl(env, token);
        await appendAuditLog(env, request, user, "enviar_convite", "invites", {
          email,
          role,
          emailQueued,
          emailError,
        });

        return json({
          ok: true,
          invite: { email, role, expiresAt: invite.expiresAt },
          inviteUrl,
          emailQueued,
          emailError,
          resendId: resend?.id || null,
        }, emailQueued ? 201 : 202);
      } catch (err) {
        console.error("Invite route error:", err);
        return errorJson("Falha ao criar convite.", 500, {
          detail: String(err?.message || err || "unknown"),
        });
      }
    }

    if (url.pathname === "/auth/invites" && request.method === "GET") {
      const { error } = await requireSuperAdmin(request, env);
      if (error) return error;

      const tokens = await readKvJson(env, inviteIndexKey(), []);
      const invites = await Promise.all(tokens.map((token) => env.LIKES_KV?.get(`admin_invite:${token}`, "json")));
      const now = Date.now();
      return json({
        invites: invites
          .filter(Boolean)
          .map((invite) => ({
            token: invite.token,
            email: invite.email,
            role: normalizeRole(invite.role),
            createdAt: invite.createdAt,
            expiresAt: invite.expiresAt,
            usedAt: invite.usedAt || null,
            expired: !invite.usedAt && Number(invite.expiresAt || 0) < now,
          })),
      });
    }

    if (url.pathname === "/auth/audit-logs" && request.method === "GET") {
      const { error } = await requireSuperAdmin(request, env);
      if (error) return error;

      const limit = Math.min(Number(url.searchParams.get("limit") || 100), 200);
      const logs = await readKvJson(env, auditLogKey(), []);
      return json({ logs: logs.slice(0, limit) });
    }

    if (url.pathname === "/auth/audit-logs" && request.method === "POST") {
      const { error, user } = await requireAdminUser(request, env);
      if (error) return error;

      const body = await readJson(request);
      await appendAuditLog(env, request, user, body.action || "acao", body.entity || "admin", body.details || {});
      return json({ ok: true }, 201);
    }

    if (url.pathname === "/admin/upload-signature" && request.method === "POST") {
      const { error, user } = await requireAdminUser(request, env);
      if (error) return error;

      const cloudName = env.CLOUDINARY_CLOUD_NAME;
      const apiKey    = env.CLOUDINARY_API_KEY;
      const apiSecret = env.CLOUDINARY_API_SECRET;
      if (!cloudName || !apiKey || !apiSecret) return errorJson("Missing Cloudinary env vars", 500);

      const body = await readJson(request);
      const folderPath = String(body.folderPath || "").trim();
      const displayName = cleanDisplayName(body.displayName || "");

      if (!folderPath || !isAllowedAssetPath(folderPath)) {
        return errorJson("Invalid folder path", 400);
      }

      const timestamp = Math.round(Date.now() / 1000);
      const params = {
        asset_folder: folderPath,
        display_name: displayName || "foto",
        timestamp,
        unique_filename: "true",
        overwrite: "false",
      };

      const signature = await signCloudinaryParams(params, apiSecret);
      await appendAuditLog(env, request, user, "preparar_upload", "album", { folderPath, displayName });

      return json({
        cloudName,
        apiKey,
        uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        params,
        signature,
      });
    }

    if (url.pathname === "/admin/delete-image" && request.method === "POST") {
      const { error, user } = await requireAdminUser(request, env);
      if (error) return error;

      const cloudName = env.CLOUDINARY_CLOUD_NAME;
      const apiKey    = env.CLOUDINARY_API_KEY;
      const apiSecret = env.CLOUDINARY_API_SECRET;
      if (!cloudName || !apiKey || !apiSecret) return errorJson("Missing Cloudinary env vars", 500);

      const body = await readJson(request);
      const publicId = sanitizePublicId(body.public_id || body.publicId || "");
      const albumPath = String(body.albumPath || "").trim();

      if (!publicId) return errorJson("Missing public_id", 400);
      if (albumPath && !isAllowedAssetPath(albumPath)) return errorJson("Invalid album path", 400);

      const timestamp = Math.round(Date.now() / 1000);
      const params = {
        public_id: publicId,
        invalidate: "true",
        timestamp,
      };
      const signature = await signCloudinaryParams(params, apiSecret);

      const destroyBody = new URLSearchParams({
        public_id: params.public_id,
        invalidate: params.invalidate,
        timestamp: String(params.timestamp),
        api_key: String(apiKey),
        signature: String(signature),
      });

      const res = await fetchWithTimeout(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: destroyBody,
        },
        15000
      );

      const text = await res.text();
      if (!res.ok) {
        return new Response(text, {
          status: res.status,
          headers: {
            ...corsHeaders(),
            "Content-Type": res.headers.get("Content-Type") || "application/json",
          },
        });
      }

      if (albumPath) {
        const albumSlug = getAlbumSlugFromPath(albumPath);
        if (env.LIKES_KV && albumSlug) {
          const assetLikesKey = `asset_likes:${albumSlug}`;
          const assetLikes = (await env.LIKES_KV.get(assetLikesKey, "json")) || {};
          delete assetLikes[publicId];
          await env.LIKES_KV.put(assetLikesKey, JSON.stringify(assetLikes));
          await rememberDeletedAsset(env, albumPath, publicId);

          const storedCover = await getStoredCover(env, albumPath);
          if (storedCover?.public_id === publicId) {
            await env.LIKES_KV.delete(albumCoverKey(albumPath));
          }
        }
        await clearWorkerCache(caches.default, request, albumPath);
      }

      await appendAuditLog(env, request, user, "excluir_foto", "image", { public_id: publicId, albumPath });

      return new Response(text, {
        status: res.status,
        headers: {
          ...corsHeaders(),
          "Content-Type": res.headers.get("Content-Type") || "application/json",
        },
      });
    }

    if (url.pathname === "/admin/update-image" && request.method === "POST") {
      const { error, user } = await requireAdminUser(request, env);
      if (error) return error;

      const cloudName = env.CLOUDINARY_CLOUD_NAME;
      const apiKey    = env.CLOUDINARY_API_KEY;
      const apiSecret = env.CLOUDINARY_API_SECRET;
      if (!cloudName || !apiKey || !apiSecret) return errorJson("Missing Cloudinary env vars", 500);

      const body = await readJson(request);
      const publicId = sanitizePublicId(body.public_id || body.publicId || "");
      const displayName = cleanDisplayName(body.displayName || "");
      const albumPath = String(body.albumPath || "").trim();

      if (!publicId) return errorJson("Missing public_id", 400);
      if (!displayName) return errorJson("Missing displayName", 400);
      if (albumPath && !isAllowedAssetPath(albumPath)) return errorJson("Invalid album path", 400);

      const timestamp = Math.round(Date.now() / 1000);
      const params = {
        public_id: publicId,
        type: "upload",
        display_name: displayName,
        timestamp,
      };
      const signature = await signCloudinaryParams(params, apiSecret);

      const explicitBody = new URLSearchParams({
        public_id: params.public_id,
        type: params.type,
        display_name: params.display_name,
        timestamp: String(params.timestamp),
        api_key: String(apiKey),
        signature: String(signature),
      });

      const res = await fetchWithTimeout(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/explicit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: explicitBody,
        },
        15000
      );

      const text = await res.text();
      if (albumPath) await clearWorkerCache(caches.default, request, albumPath);
      await appendAuditLog(env, request, user, "renomear_foto", "image", { public_id: publicId, displayName, albumPath });

      return new Response(text, {
        status: res.status,
        headers: {
          ...corsHeaders(),
          "Content-Type": res.headers.get("Content-Type") || "application/json",
        },
      });
    }

    if (url.pathname === "/admin/set-cover" && request.method === "POST") {
      const { error, user } = await requireAdminUser(request, env);
      if (error) return error;

      const body = await readJson(request);
      const albumPath = String(body.albumPath || body.path || "").trim();
      const publicId = sanitizePublicId(body.public_id || body.publicId || "");

      if (!albumPath || !isAllowedAssetPath(albumPath)) return errorJson("Invalid album path", 400);
      if (!publicId) return errorJson("Missing public_id", 400);

      const cover = await saveStoredCover(env, albumPath, publicId);
      await clearWorkerCache(caches.default, request, albumPath);
      await appendAuditLog(env, request, user, "definir_capa", "album", { albumPath, public_id: publicId });

      return json({
        ok: true,
        path: albumPath,
        cover_public_id: cover.public_id,
      });
    }

    if (url.pathname === "/admin/create-folder" && request.method === "POST") {
      const { error, user } = await requireAdminUser(request, env);
      if (error) return error;

      const cloudName = env.CLOUDINARY_CLOUD_NAME;
      const apiKey    = env.CLOUDINARY_API_KEY;
      const apiSecret = env.CLOUDINARY_API_SECRET;
      if (!cloudName || !apiKey || !apiSecret) return errorJson("Missing Cloudinary env vars", 500);

      const body = await readJson(request);
      const path = String(body.path || "").replace(/\/+/g, "/").trim();
      const parts = path.split("/").filter(Boolean);

      if (
        !path ||
        path === "portfolio" ||
        !path.startsWith("portfolio/") ||
        !isAllowedAssetPath(path) ||
        parts.length < 2 ||
        parts.some((part) => part === "." || part === "..")
      ) {
        return errorJson("Invalid folder path", 400);
      }

      const auth = btoa(`${apiKey}:${apiSecret}`);
      const created = await createCloudinaryFolder(cloudName, auth, path);
      const parentPath = parts.slice(0, -1).join("/") || "portfolio";

      await clearWorkerCache(caches.default, request, path);
      await clearWorkerCache(caches.default, request, parentPath);
      await appendAuditLog(env, request, user, "criar_album", "album", {
        path,
        existed: !!created.existed,
      });

      return json({ ok: true, path, existed: !!created.existed }, created.existed ? 200 : 201);
    }

    if (url.pathname === "/admin/clear-cache" && request.method === "POST") {
      const { error, user } = await requireAdminUser(request, env);
      if (error) return error;

      const body = await readJson(request);
      const path = String(body.path || "").trim();
      if (path && !isAllowedAssetPath(path)) return errorJson("Invalid path", 400);

      await clearWorkerCache(caches.default, request, path);
      await appendAuditLog(env, request, user, "limpar_cache", "album", { path });
      return json({ ok: true, path });
    }

    if (url.pathname === "/admin/delete-album" && request.method === "POST") {
      const { error, user } = await requireAdminUser(request, env);
      if (error) return error;

      const body = await readJson(request);
      const path = String(body.path || "").trim();
      if (!path || path === "portfolio" || !path.startsWith("portfolio/")) {
        return errorJson("Álbum inválido para exclusão.", 400);
      }

      const stats = await deleteAlbumRecursive(env, request, path);
      const parentPath = path.split("/").slice(0, -1).join("/") || "portfolio";
      await clearWorkerCache(caches.default, request, parentPath);
      await appendAuditLog(env, request, user, "excluir_album", "album", { path, ...stats });

      return json({ ok: true, path, ...stats });
    }

    // ── CURTIDAS ─────────────────────────────────────────────────

    if (url.pathname === "/likes" && request.method === "GET") {
      const album   = url.searchParams.get("album") || "";
      const isAdmin = await checkAdmin(request, env);

      // Token inválido ou ausente → retorna apenas {_authorized: false}
      // O front-end não recebe nenhuma contagem
      if (!isAdmin) {
        return json({ _authorized: false });
      }

      const data = (await env.LIKES_KV?.get(`likes:${album}`, "json")) || {};
      const byAsset = (await env.LIKES_KV?.get(`asset_likes:${album}`, "json")) || {};
      return json({ _authorized: true, _byAsset: byAsset, ...data });
    }

    if (url.pathname === "/like" && request.method === "POST") {
      const { album = "", albumName = "álbum", index = 0, publicId = "" } = await request.json();
      const isAdmin = await checkAdmin(request, env);

      const key  = `likes:${album}`;
      const data = (await env.LIKES_KV?.get(key, "json")) || {};
      data[String(index)] = (data[String(index)] || 0) + 1;
      await env.LIKES_KV?.put(key, JSON.stringify(data));

      let assetLikes = null;
      const cleanPublicId = sanitizePublicId(publicId);
      if (cleanPublicId && env.LIKES_KV) {
        const assetKey = `asset_likes:${album}`;
        assetLikes = (await env.LIKES_KV.get(assetKey, "json")) || {};
        assetLikes[cleanPublicId] = (assetLikes[cleanPublicId] || 0) + 1;
        await env.LIKES_KV.put(assetKey, JSON.stringify(assetLikes));
      }

      if (env.RESEND_API_KEY) {
        try {
          const albumTitle = emailHtml(albumName);
          const albumUrl = `https://marcelconde.com.br/categoria.html?slug=${encodeURIComponent(album)}`;
          const likeHtml = emailLayout(env, {
            preheader: `Uma foto do álbum ${albumName} recebeu uma nova curtida.`,
            eyebrow: "Nova curtida",
            title: "Uma foto recebeu curtida",
            intro: `Uma foto do álbum <strong>${albumTitle}</strong> foi curtida.`,
            body: `<p style="margin:0;"><strong>Total nessa foto:</strong> ${Number(data[String(index)] || 0)}</p>`,
            ctaLabel: "Ver álbum",
            ctaUrl: albumUrl,
            reason: "Você recebeu este e-mail porque este endereço recebe notificações administrativas da plataforma.",
          });
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${env.RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: resendFrom(env),
              to: ["contato@marcelconde.com.br"],
              subject: `❤️ Nova curtida — álbum "${albumName}"`,
              html: likeHtml,
            }),
          });
        } catch (e) {
          console.error("Resend error:", e);
        }
      }

      // isAdmin informa ao front-end se pode exibir a contagem
      return json({ likes: cleanPublicId && assetLikes ? assetLikes[cleanPublicId] : data[String(index)], isAdmin });
    }

    // ─────────────────────────────────────────────────────────────

    if (request.method !== "GET") {
      return errorJson("Method not allowed", 405);
    }

    if (url.pathname === "/health") {
      return json({ ok: true, service: "cloudinary-worker", time: new Date().toISOString() });
    }

    const cloudName = env.CLOUDINARY_CLOUD_NAME;
    const apiKey    = env.CLOUDINARY_API_KEY;
    const apiSecret = env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      return errorJson("Missing env vars", 500, {
        expected: ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"],
      });
    }

    const cache        = caches.default;
    const forceRefresh = url.searchParams.get("refresh") === "1";
    const cacheKey     = makeCacheKey(request.url);

    if (!forceRefresh) {
      const cached = await cache.match(cacheKey);
      if (cached) return withCacheStatus(cached, "HIT");
    }

    const auth = btoa(`${apiKey}:${apiSecret}`);

    try {
      let response;

      if (url.pathname === "/albums") {
        const basePath = url.searchParams.get("path") || "portfolio";
        if (!basePath.startsWith("portfolio")) return errorJson("Invalid path", 400);

        const res = await fetchWithTimeout(
          `https://api.cloudinary.com/v1_1/${cloudName}/folders/${basePath}`,
          { headers: { Authorization: `Basic ${auth}` } },
          12000
        );
        const text = await res.text();
        if (!res.ok) {
          return new Response(text, {
            status: res.status,
            headers: { ...corsHeaders(), "Content-Type": res.headers.get("Content-Type") || "text/plain", "X-Worker-Cache": "BYPASS_ERROR" },
          });
        }
        const data   = JSON.parse(text);
        const albums = (data.folders || []).map((f) => ({ slug: f.name, path: f.path }));
        response = json(albums, 200, { ...cacheHeaders(60), "X-Worker-Cache": forceRefresh ? "REFRESH" : "MISS" });
      }

      else if (url.pathname === "/album") {
        const path = url.searchParams.get("path");
        if (!path) return errorJson("Missing ?path=", 400);
        if (!path.startsWith("portfolio/") && !path.startsWith("site/")) return errorJson("Invalid path.", 400);

        const res = await fetchWithTimeout(
          `https://api.cloudinary.com/v1_1/${cloudName}/resources/search`,
          {
            method: "POST",
            headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              expression: `asset_folder="${path}" AND resource_type:image`,
              sort_by: [{ public_id: "asc" }],
              max_results: 500,
              with_field: ["context", "metadata"],
            }),
          },
          15000
        );
        const text = await res.text();
        if (!res.ok) {
          return new Response(text, {
            status: res.status,
            headers: { ...corsHeaders(), "Content-Type": res.headers.get("Content-Type") || "text/plain", "X-Worker-Cache": "BYPASS_ERROR" },
          });
        }
        const data = JSON.parse(text);
        let images = (data.resources || []).map((r) => ({
          url: r.secure_url, public_id: r.public_id,
          display_name: r.display_name || "", filename: r.filename || "",
          width: r.width, height: r.height, format: r.format,
        }));
        const deletedAssets = await getDeletedAssets(env, path);
        if (deletedAssets.size) {
          images = images.filter((image) => !deletedAssets.has(sanitizePublicId(image.public_id)));
        }
        images.sort((a, b) => {
          const na = getAssetName(a), nb = getAssetName(b);
          return na < nb ? -1 : na > nb ? 1 : 0;
        });
        const storedCover = await getStoredCover(env, path);
        let cover = null;
        let coverSource = "display_name";

        if (storedCover?.public_id) {
          cover = images.find((image) => image.public_id === storedCover.public_id) || null;
          if (cover) coverSource = "kv";
        }

        if (!cover) {
          cover = pickCover(images);
        }

        if (cover?.public_id) {
          images = [
            cover,
            ...images.filter((image) => image.public_id !== cover.public_id),
          ];
        }

        response = json(
          {
            title: path.split("/").pop(), path,
            thumbnail: cover?.url ?? null, images,
            cover_public_id: cover?.public_id ?? null,
            cover_source: coverSource,
            cover_debug: cover ? { public_id: cover.public_id, display_name: cover.display_name, filename: cover.filename } : null,
          },
          200,
          { ...cacheHeaders(60), "X-Worker-Cache": forceRefresh ? "REFRESH" : "MISS" }
        );
      }

      else {
        return new Response("Not found", { status: 404, headers: corsHeaders() });
      }

      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (err) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set("X-Worker-Cache", "STALE_ON_ERROR");
        headers.set("X-Worker-Error", String(err?.message || err || "unknown"));
        return new Response(cached.body, { status: cached.status, headers });
      }
      return errorJson("Cloudinary worker timeout or fetch error", 504, {
        detail: String(err?.message || err || "unknown"),
      });
    }
  },
};
