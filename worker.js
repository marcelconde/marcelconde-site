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

function clientUserKey(email) {
  return `client_user:${normalizeEmail(email)}`;
}

function clientSessionKey(token) {
  return `client_session:${token}`;
}

function clientGalleryInviteKey(token) {
  return `client_gallery_invite:${token}`;
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

function publicPrivateGallery(gallery = {}, images = [], selection = []) {
  const selected = new Set(selection);
  return {
    id: gallery.id,
    slug: gallery.slug,
    title: gallery.title,
    subtitle: gallery.subtitle || "",
    message: gallery.message || "",
    coverUrl: gallery.coverUrl || images[0]?.url || null,
    selectionLimit: Number(gallery.selectionLimit || 0),
    status: gallery.status || "selection",
    allowDownload: gallery.allowDownload === true || gallery.status === "final",
    watermark: normalizeWatermark(gallery.watermark || {}),
    totalImages: images.length,
    totalSelected: selection.length,
    selectedPublicIds: [...selected],
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
  const galleries = await Promise.all(ids.map((id) => readKvJson(env, privateGalleryKey(id), null)));
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

  const gallery = {
    ...existing,
    id,
    clientId: String(input.clientId || existing.clientId || ""),
    slug,
    title,
    subtitle: cleanGalleryText(input.subtitle || existing.subtitle || "", 180),
    message: cleanGalleryText(input.message || existing.message || "", 1200),
    selectionLimit: Math.max(0, Math.min(Number(input.selectionLimit ?? existing.selectionLimit ?? 15), 2000)),
    status: ["selection", "editing", "final"].includes(input.status || existing.status)
      ? (input.status || existing.status)
      : "selection",
    allowDownload: input.allowDownload === true || existing.allowDownload === true,
    coverUrl: String(input.coverUrl || existing.coverUrl || ""),
    coverPublicId: sanitizePublicId(input.coverPublicId || existing.coverPublicId || ""),
    watermark: normalizeWatermark(input.watermark || existing.watermark || {}),
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };

  await writeKvJson(env, privateGalleryKey(id), gallery);
  await writeKvJson(env, privateGalleryBySlugKey(slug), id);
  if (previousSlug && previousSlug !== slug) await env.LIKES_KV.delete(privateGalleryBySlugKey(previousSlug));

  const index = await readKvJson(env, privateGalleriesIndexKey(), []);
  await writeKvJson(env, privateGalleriesIndexKey(), [...new Set([id, ...index])]);
  return gallery;
}

async function getPrivateGalleryBySlug(env, slug = "") {
  const id = await readKvJson(env, privateGalleryBySlugKey(slugify(slug)), "");
  if (!id) return null;
  return readKvJson(env, privateGalleryKey(id), null);
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
    ...params,
    api_key: apiKey,
    signature,
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
      env.LIKES_KV.delete(`likes:${slug}`),
      env.LIKES_KV.delete(`asset_likes:${slug}`),
    ]);
  }

  await clearWorkerCache(caches.default, request, path);
  return stats;
}

async function clearWorkerCache(cache, request, path = "") {
  const origin = new URL(request.url).origin;
  const urls = new Set([
    `${origin}/albums`,
  ]);

  if (path) {
    urls.add(`${origin}/album?path=${encodeURIComponent(path)}`);

    const parts = path.split("/").filter(Boolean);
    for (let i = 1; i <= parts.length; i++) {
      urls.add(`${origin}/albums?path=${encodeURIComponent(parts.slice(0, i).join("/"))}`);
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
    active: true,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await writeKvJson(env, clientUserKey(cleanEmail), user);
  return publicClientUser(user);
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

function emailHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendClientGalleryInviteEmail(env, email, token, gallery = {}, client = {}) {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY não configurada no Worker.");
  }

  const inviteUrl = clientGalleryInviteUrl(env, token);
  const galleryTitle = emailHtml(gallery.title || "sua galeria");
  const clientName = emailHtml(client.name || email);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: env.RESEND_FROM || "Marcel Conde <contato@marcelconde.com.br>",
      to: [email],
      subject: `Sua galeria está disponível — ${galleryTitle}`,
      html: `<p>Olá ${clientName},</p>
             <p>Sua galeria <strong>${galleryTitle}</strong> está disponível na área do cliente Marcel Conde.</p>
             <p>Para o primeiro acesso, crie sua senha pelo botão abaixo:</p>
             <p><a href="${inviteUrl}">Criar senha e acessar galeria</a></p>
             <p>Depois disso, você poderá voltar quando quiser pela Área do Cliente usando seu e-mail e senha.</p>
             <p>Este link de primeiro acesso expira em 7 dias.</p>`,
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

async function sendClientFinalDeliveryEmail(env, email, gallery = {}, client = {}) {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY não configurada no Worker.");
  }

  const galleryUrl = clientGalleryUrl(env, gallery.slug || "");
  const loginUrl = clientLoginUrl(env);
  const galleryTitle = emailHtml(gallery.title || "sua galeria");
  const clientName = emailHtml(client.name || email);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: env.RESEND_FROM || "Marcel Conde <contato@marcelconde.com.br>",
      to: [email],
      subject: `Suas fotos estão prontas — ${gallery.title || "galeria"}`,
      html: `<p>Olá ${clientName},</p>
             <p>As fotos da galeria <strong>${galleryTitle}</strong> estão prontas para download.</p>
             <p>Acesse pelo link abaixo e entre com seu e-mail e senha cadastrados:</p>
             <p><a href="${galleryUrl}">Acessar galeria e baixar fotos</a></p>
             <p>Você também pode voltar quando quiser pela <a href="${loginUrl}">Área do Cliente</a>.</p>`,
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
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: env.RESEND_FROM || "Marcel Conde <contato@marcelconde.com.br>",
      to: [email],
      subject: "Redefinir senha do admin — Marcel Conde",
      html: `<p>Você solicitou a redefinição da senha do painel administrativo.</p>
             <p><a href="${resetUrl}">Clique aqui para criar uma nova senha</a></p>
             <p>Este link expira em 1 hora.</p>`,
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
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: env.RESEND_FROM || "Marcel Conde <contato@marcelconde.com.br>",
      to: [email],
      subject: "Convite para o admin — Marcel Conde",
      html: `<p><strong>${inviterName}</strong> convidou você para acessar o painel administrativo Marcel Conde.</p>
             <p><a href="${inviteUrl}">Clique aqui para criar sua senha e aceitar o convite</a></p>
             <p>Este link expira em 48 horas.</p>`,
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

    // ── GALERIAS PRIVADAS: ACESSO DO CLIENTE ─────────────────────

    if (url.pathname === "/client-auth/invite" && request.method === "GET") {
      const token = String(url.searchParams.get("token") || "").trim();
      if (!token || !env.LIKES_KV) return errorJson("Convite inválido.", 400);

      const invite = await readKvJson(env, clientGalleryInviteKey(token), null);
      if (!invite || Number(invite.expiresAt || 0) < Date.now()) {
        return errorJson("Convite inválido ou expirado.", 400);
      }

      const gallery = await readKvJson(env, privateGalleryKey(invite.galleryId), null);
      const client = await readKvJson(env, privateClientKey(invite.clientId), null);
      if (!gallery || !client) return errorJson("Galeria indisponível.", 404);

      const existingUser = await getClientUser(env, client.email);
      return json({
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

      const invite = await readKvJson(env, clientGalleryInviteKey(token), null);
      if (!invite || Number(invite.expiresAt || 0) < Date.now()) {
        return errorJson("Convite inválido ou expirado.", 400);
      }

      const gallery = await readKvJson(env, privateGalleryKey(invite.galleryId), null);
      const client = await readKvJson(env, privateClientKey(invite.clientId), null);
      if (!gallery || !client?.email) return errorJson("Galeria indisponível.", 404);

      const user = await saveClientPassword(env, client.email, password, {
        name: client.name || client.email,
      });
      invite.usedAt = new Date().toISOString();
      await writeKvJson(env, clientGalleryInviteKey(token), invite, { expirationTtl: 60 * 60 * 24 * 7 });
      const session = await createClientSession(env, user);
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

    if (url.pathname === "/client-galleries" && request.method === "GET") {
      const session = await getCurrentClient(request, env);
      if (!session) return errorJson("Faça login para acessar suas galerias.", 401);

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
      let next = current.filter((item) => item !== publicId);

      if (selected) {
        if (limit > 0 && next.length >= limit) {
          return errorJson(`Limite de ${limit} fotos atingido.`, 409, {
            limit,
            selectedPublicIds: current,
          });
        }
        next.push(publicId);
      }

      await writeKvJson(env, privateGallerySelectionKey(gallery.id), next);
      await appendPrivateGalleryEvent(env, request, gallery.id, selected ? "favoritar_foto" : "remover_favorito", { publicId }, access.client);

      return json({
        ok: true,
        selectedPublicIds: next,
        totalSelected: next.length,
        limit,
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

      const selection = await readKvJson(env, privateGallerySelectionKey(gallery.id), []);
      await appendPrivateGalleryEvent(env, request, gallery.id, "concluir_selecao", {
        totalSelected: selection.length,
        selectedPublicIds: selection,
      }, access.client);

      return json({ ok: true, totalSelected: selection.length }, 200, { "Cache-Control": "no-store" });
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
      return json({ clients: await listPrivateClients(env) }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/private/clients" && request.method === "POST") {
      const { error, user } = await requireAdminUser(request, env);
      if (error) return error;
      const body = await readJson(request);
      const client = await savePrivateClient(env, body);
      await appendAuditLog(env, request, user, body.id ? "editar_cliente_privado" : "criar_cliente_privado", "private_clients", { clientId: client.id, email: client.email });
      return json({ client }, body.id ? 200 : 201, { "Cache-Control": "no-store" });
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

      const gallery = await readKvJson(env, privateGalleryKey(id), null);
      if (!gallery) return errorJson("Galeria não encontrada.", 404);
      const images = await readKvJson(env, privateGalleryImagesKey(id), []);
      const selection = await readKvJson(env, privateGallerySelectionKey(id), []);
      const events = await readKvJson(env, privateGalleryEventsKey(id), []);
      return json({ gallery, images, selection, events: events.slice(0, 120) }, 200, { "Cache-Control": "no-store" });
    }

    if (url.pathname === "/private/gallery/publish" && request.method === "POST") {
      const { error, user } = await requireAdminUser(request, env);
      if (error) return error;

      const body = await readJson(request);
      const galleryId = String(body.galleryId || "").trim();
      if (!galleryId) return errorJson("Galeria inválida.", 400);
      if (!env.LIKES_KV) return errorJson("LIKES_KV not configured", 500);

      const gallery = await readKvJson(env, privateGalleryKey(galleryId), null);
      if (!gallery) return errorJson("Galeria não encontrada.", 404);

      if (["selection", "editing", "final"].includes(body.status) && body.status !== gallery.status) {
        gallery.status = body.status;
      }

      const client = gallery.clientId ? await readKvJson(env, privateClientKey(gallery.clientId), null) : null;
      if (!client?.email) {
        return errorJson("Vincule um cliente com e-mail antes de publicar a galeria.", 400);
      }

      const emailType = gallery.status === "final" || gallery.allowDownload === true
        ? "final_delivery"
        : "first_access";
      let token = "";
      let resend = null;
      let emailError = "";

      try {
        if (emailType === "final_delivery") {
          resend = await sendClientFinalDeliveryEmail(env, client.email, gallery, client);
        } else {
          token = randomToken(36);
          const invite = {
            token,
            email: normalizeEmail(client.email),
            clientId: client.id,
            galleryId: gallery.id,
            gallerySlug: gallery.slug,
            invitedBy: user.email,
            createdAt: new Date().toISOString(),
            expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7,
          };

          await writeKvJson(env, clientGalleryInviteKey(token), invite, { expirationTtl: 60 * 60 * 24 * 7 });
          resend = await sendClientGalleryInviteEmail(env, client.email, token, gallery, client);
        }
      } catch (err) {
        emailError = String(err?.message || err || "unknown");
        console.error("Client gallery email error:", err);
      }

      gallery.publishedAt = gallery.publishedAt || new Date().toISOString();
      if (emailType === "final_delivery") {
        gallery.lastDeliveryEmailAt = new Date().toISOString();
      } else {
        gallery.lastInviteAt = new Date().toISOString();
      }
      gallery.updatedAt = new Date().toISOString();
      await writeKvJson(env, privateGalleryKey(gallery.id), gallery);

      await appendAuditLog(env, request, user, "publicar_galeria_cliente", "private_galleries", {
        galleryId: gallery.id,
        slug: gallery.slug,
        email: client.email,
        emailType,
        emailQueued: Boolean(resend),
        emailError,
      });
      await appendPrivateGalleryEvent(env, request, gallery.id, "admin_publicou_galeria", {
        email: client.email,
        emailType,
        emailQueued: Boolean(resend),
        emailError,
      }, user);

      return json({
        ok: true,
        gallery,
        emailType,
        inviteUrl: token ? clientGalleryInviteUrl(env, token) : "",
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
        ...params,
        api_key: apiKey,
        signature,
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
        ...params,
        api_key: apiKey,
        signature,
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
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${env.RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: "curtidas@marcelconde.com.br",
              to: ["contato@marcelconde.com.br"],
              subject: `❤️ Nova curtida — álbum "${albumName}"`,
              html: `<p>Uma foto do álbum <strong>${albumName}</strong> foi curtida!</p>
                     <p>Total nessa foto: <strong>${data[String(index)]}</strong></p>
                     <p><a href="https://marcelconde.com.br/categoria.html?slug=${encodeURIComponent(album)}">Ver álbum →</a></p>`,
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
