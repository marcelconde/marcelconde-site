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

function cacheHeaders(seconds = 21600) {
  return {
    "Cache-Control": `public, max-age=${seconds}`,
    "X-Worker-Cache-TTL": String(seconds),
  };
}

function makeCacheKey(requestUrl) {
  const url = new URL(requestUrl);
  url.searchParams.delete("refresh");
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

// Valida o token de admin contra a secret do Cloudflare (nunca exposta no front-end)
function checkAdmin(request, env) {
  const token = request.headers.get("X-Admin-Token") || "";
  return !!(env.ADMIN_KEY && token === env.ADMIN_KEY);
}

function requireAdmin(request, env) {
  if (checkAdmin(request, env)) return null;
  return errorJson("Unauthorized", 401);
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // ── ADMIN ───────────────────────────────────────────────────

    if (url.pathname === "/admin/me" && request.method === "GET") {
      const denied = requireAdmin(request, env);
      if (denied) return denied;

      return json({
        ok: true,
        service: "marcel-admin",
        time: new Date().toISOString(),
      });
    }

    if (url.pathname === "/admin/upload-signature" && request.method === "POST") {
      const denied = requireAdmin(request, env);
      if (denied) return denied;

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

      return json({
        cloudName,
        apiKey,
        uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        params,
        signature,
      });
    }

    if (url.pathname === "/admin/delete-image" && request.method === "POST") {
      const denied = requireAdmin(request, env);
      if (denied) return denied;

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
        }
        await clearWorkerCache(caches.default, request, albumPath);
      }

      return new Response(text, {
        status: res.status,
        headers: {
          ...corsHeaders(),
          "Content-Type": res.headers.get("Content-Type") || "application/json",
        },
      });
    }

    if (url.pathname === "/admin/update-image" && request.method === "POST") {
      const denied = requireAdmin(request, env);
      if (denied) return denied;

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

      return new Response(text, {
        status: res.status,
        headers: {
          ...corsHeaders(),
          "Content-Type": res.headers.get("Content-Type") || "application/json",
        },
      });
    }

    if (url.pathname === "/admin/clear-cache" && request.method === "POST") {
      const denied = requireAdmin(request, env);
      if (denied) return denied;

      const body = await readJson(request);
      const path = String(body.path || "").trim();
      if (path && !isAllowedAssetPath(path)) return errorJson("Invalid path", 400);

      await clearWorkerCache(caches.default, request, path);
      return json({ ok: true, path });
    }

    // ── CURTIDAS ─────────────────────────────────────────────────

    if (url.pathname === "/likes" && request.method === "GET") {
      const album   = url.searchParams.get("album") || "";
      const isAdmin = checkAdmin(request, env);

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
      const isAdmin = checkAdmin(request, env);

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
        response = json(albums, 200, { ...cacheHeaders(21600), "X-Worker-Cache": forceRefresh ? "REFRESH" : "MISS" });
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
        const images = (data.resources || []).map((r) => ({
          url: r.secure_url, public_id: r.public_id,
          display_name: r.display_name || "", filename: r.filename || "",
          width: r.width, height: r.height, format: r.format,
        }));
        images.sort((a, b) => {
          const na = getAssetName(a), nb = getAssetName(b);
          return na < nb ? -1 : na > nb ? 1 : 0;
        });
        const cover = pickCover(images);
        response = json(
          {
            title: path.split("/").pop(), path,
            thumbnail: cover?.url ?? null, images,
            cover_debug: cover ? { public_id: cover.public_id, display_name: cover.display_name, filename: cover.filename } : null,
          },
          200,
          { ...cacheHeaders(21600), "X-Worker-Cache": forceRefresh ? "REFRESH" : "MISS" }
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
