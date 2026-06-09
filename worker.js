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
    allowDownload: gallery.allowDownload === true,
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

    if (url.pathname === "/client-gallery" && request.method === "GET") {
      const slug = slugify(url.searchParams.get("slug") || "");
      const cursor = Math.max(0, Number(url.searchParams.get("cursor") || 0));
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 60), 1), 120);
      const gallery = await getPrivateGalleryBySlug(env, slug);

      if (!gallery) return errorJson("Galeria não encontrada.", 404);

      const images = await readKvJson(env, privateGalleryImagesKey(gallery.id), []);
      const selection = await readKvJson(env, privateGallerySelectionKey(gallery.id), []);
      const page = images.slice(cursor, cursor + limit).map(thumbnailImage);

      if (cursor === 0) {
        ctx.waitUntil(appendPrivateGalleryEvent(env, request, gallery.id, "abrir_galeria", { slug }));
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
      if (!publicId) return errorJson("Foto inválida.", 400);

      const images = await readKvJson(env, privateGalleryImagesKey(gallery.id), []);
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
      await appendPrivateGalleryEvent(env, request, gallery.id, selected ? "favoritar_foto" : "remover_favorito", { publicId });

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

      const selection = await readKvJson(env, privateGallerySelectionKey(gallery.id), []);
      await appendPrivateGalleryEvent(env, request, gallery.id, "concluir_selecao", {
        totalSelected: selection.length,
        selectedPublicIds: selection,
      });

      return json({ ok: true, totalSelected: selection.length }, 200, { "Cache-Control": "no-store" });
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
