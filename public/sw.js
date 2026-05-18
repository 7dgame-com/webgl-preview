const WEBGL_PREVIEW_CACHE_VERSION = "2026.05.18.4";
const WEBGL_PREVIEW_CACHE_NAME =
  "xrugc-webgl-preview-" + WEBGL_PREVIEW_CACHE_VERSION;

const CACHEABLE_PATHS = [
  "Build/public.loader.js",
  "Build/public.framework.js.gz",
  "Build/public.data.gz",
  "Build/public.wasm.gz",
  "TemplateData/style.css",
  "TemplateData/favicon.ico",
];

const WARM_CACHEABLE_PATHS = [
  "Build/public.loader.js",
  "Build/public.framework.js.gz",
  "TemplateData/style.css",
  "TemplateData/favicon.ico",
];

const CACHEABLE_REQUEST_RE =
  /\/(?:Build\/(?:(?:[a-f0-9]{32}|public)\.(?:loader\.js|framework\.js\.(?:br|gz)|data\.(?:br|gz)|wasm\.(?:br|gz)))|TemplateData\/(?:style\.css|favicon\.ico))(?:[?#]|$)/i;

const withVersion = (path) => {
  const url = new URL(path, self.location.href);
  url.searchParams.set("v", WEBGL_PREVIEW_CACHE_VERSION);
  return url.toString();
};

let warmAbortController = null;

const postCacheStatus = async (clientId, payload) => {
  if (!clientId) return;
  const client = await self.clients.get(clientId).catch(() => null);
  if (!client) return;
  client.postMessage({
    type: "webgl-preview-cache-status",
    version: WEBGL_PREVIEW_CACHE_VERSION,
    ...payload,
  });
};

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(WEBGL_PREVIEW_CACHE_NAME));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("xrugc-webgl-preview-") &&
                key !== WEBGL_PREVIEW_CACHE_NAME
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

const fetchAndCache = async (request) => {
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    caches
      .open(WEBGL_PREVIEW_CACHE_NAME)
      .then((cache) => cache.put(request, response.clone()))
      .catch((error) => {
        console.warn("[WebPreview] Cache write skipped.", error);
      });
  }
  return response;
};

const fetchAndWarmCache = async (cache, request, signal) => {
  const response = await fetch(request, { signal });
  if (response.ok || response.type === "opaque") {
    await cache.put(request, response.clone());
  }
};

const warmPreviewCache = async (clientId) => {
  if (warmAbortController) {
    warmAbortController.abort();
  }

  const abortController = new AbortController();
  warmAbortController = abortController;
  const cache = await caches.open(WEBGL_PREVIEW_CACHE_NAME);
  const total = WARM_CACHEABLE_PATHS.length;

  await postCacheStatus(clientId, {
    status: "started",
    completed: 0,
    total,
    path: "",
  });

  try {
    for (let index = 0; index < WARM_CACHEABLE_PATHS.length; index += 1) {
      const path = WARM_CACHEABLE_PATHS[index];
      const request = new Request(withVersion(path), {
        cache: "reload",
        credentials: "same-origin",
      });
      const cached = await cache.match(request);
      if (!cached) {
        await postCacheStatus(clientId, {
          status: "fetching",
          completed: index,
          total,
          path,
        });
        await fetchAndWarmCache(cache, request, abortController.signal);
      }
      await postCacheStatus(clientId, {
        status: "progress",
        completed: index + 1,
        total,
        path,
      });
    }

    await postCacheStatus(clientId, {
      status: "complete",
      completed: total,
      total,
      path: "",
    });
  } catch (error) {
    if (abortController.signal.aborted) {
      await postCacheStatus(clientId, {
        status: "cancelled",
        completed: 0,
        total,
        path: "",
      });
      return;
    }

    await postCacheStatus(clientId, {
      status: "error",
      completed: 0,
      total,
      path: "",
      message: error && error.message ? error.message : String(error),
    });
  } finally {
    if (warmAbortController === abortController) {
      warmAbortController = null;
    }
  }
};

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "warm-webgl-preview-cache") {
    event.waitUntil(warmPreviewCache(event.source && event.source.id));
  }

  if (event.data && event.data.type === "cancel-webgl-preview-cache") {
    if (warmAbortController) {
      warmAbortController.abort();
    }
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (!CACHEABLE_REQUEST_RE.test(url.pathname)) return;

  event.respondWith(
    caches
      .open(WEBGL_PREVIEW_CACHE_NAME)
      .then((cache) => cache.match(event.request))
      .then((cached) => cached || fetchAndCache(event.request))
  );
});
