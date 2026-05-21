const WEBGL_PREVIEW_CACHE_VERSION = "2026.05.21.03";
const WEBGL_PREVIEW_CACHE_PREFIX = "xrugc-webgl-preview-";
const WEBGL_PREVIEW_CACHE_NAME =
  WEBGL_PREVIEW_CACHE_PREFIX + WEBGL_PREVIEW_CACHE_VERSION;
const WARM_CACHE_FILE_TIMEOUT_MS = 15000;
const CORE_BUILD_PATHS = [
  "Build/public.loader.js",
  "Build/public.framework.js.gz",
  "Build/public.data.gz",
  "Build/public.wasm.gz",
];

const CACHEABLE_PATHS = [
  ...CORE_BUILD_PATHS,
  "TemplateData/style.css",
  "TemplateData/favicon.ico",
];

const WARM_CACHEABLE_PATHS = [
  ...CORE_BUILD_PATHS,
  "TemplateData/style.css",
  "TemplateData/favicon.ico",
];

const CACHEABLE_REQUEST_RE =
  /\/(?:Build\/(?:(?:[a-f0-9]{32}|public)\.(?:loader\.js|framework\.js\.(?:br|gz)|data\.(?:br|gz)|wasm\.(?:br|gz)))|TemplateData\/(?:style\.css|favicon\.ico))(?:[?#]|$)/i;

const CORE_BUILD_REQUEST_RE =
  /\/Build\/(?:(?:[a-f0-9]{32}|public)\.(?:loader\.js|framework\.js\.(?:br|gz)|data\.(?:br|gz)|wasm\.(?:br|gz)))(?:[?#]|$)/i;

const withVersion = (path) => {
  const url = new URL(path, self.location.href);
  url.searchParams.set("v", WEBGL_PREVIEW_CACHE_VERSION);
  return url.toString();
};

const stableRequestFor = (requestOrUrl) => {
  const url = new URL(
    typeof requestOrUrl === "string" ? requestOrUrl : requestOrUrl.url
  );
  return new Request(url.origin + url.pathname, {
    credentials: "same-origin",
  });
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
  event.waitUntil(self.clients.claim());
});

const cacheMatchPath = (cache, requestOrUrl) =>
  cache.match(stableRequestFor(requestOrUrl), { ignoreSearch: true });

const listPreviewCacheNames = async () =>
  (await caches.keys())
    .filter((key) => key.startsWith(WEBGL_PREVIEW_CACHE_PREFIX))
    .sort()
    .reverse();

const findCompleteCachedResponse = async (request, options = {}) => {
  const names = await listPreviewCacheNames();
  for (const name of names) {
    if (options.excludeCurrent && name === WEBGL_PREVIEW_CACHE_NAME) {
      continue;
    }
    const cache = await caches.open(name);
    const response = await cacheMatchPath(cache, request);
    if (response) {
      return response;
    }
  }
  return null;
};

const cacheResponse = async (request, response) => {
  if (!response || (!response.ok && response.type !== "opaque")) {
    return;
  }
  const cache = await caches.open(WEBGL_PREVIEW_CACHE_NAME);
  await cache.put(stableRequestFor(request), response.clone());
};

const fetchAndCache = async (request, options = {}) => {
  const response = await fetch(request, options);
  await cacheResponse(request, response).catch((error) => {
    console.warn("[WebPreview] Cache write skipped.", error);
  });
  return response;
};

const fetchAndWarmCache = async (cache, request, signal) => {
  const timeoutController = new AbortController();
  const timeout = setTimeout(
    () => timeoutController.abort(),
    WARM_CACHE_FILE_TIMEOUT_MS
  );
  const abortSignal = AbortSignal.any
    ? AbortSignal.any([signal, timeoutController.signal])
    : signal;

  try {
    const response = await fetch(request, { signal: abortSignal });
    if (response.ok || response.type === "opaque") {
      await cache.put(stableRequestFor(request), response.clone());
    }
  } finally {
    clearTimeout(timeout);
  }
};

const copyCachedResponse = async (cache, request, response) => {
  if (!response) return false;
  await cache.put(stableRequestFor(request), response.clone());
  return true;
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
      const cached = await cacheMatchPath(cache, request);
      if (!cached) {
        const previousCached = await findCompleteCachedResponse(request, {
          excludeCurrent: true,
        });
        if (previousCached) {
          await copyCachedResponse(cache, request, previousCached);
          await postCacheStatus(clientId, {
            status: "progress",
            completed: index + 1,
            total,
            path,
            reused: true,
          });
          continue;
        }
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
    (async () => {
      const currentCache = await caches.open(WEBGL_PREVIEW_CACHE_NAME);
      const currentCached = await cacheMatchPath(currentCache, event.request);
      const isCoreBuildRequest = CORE_BUILD_REQUEST_RE.test(url.pathname);

      if (currentCached) {
        return currentCached;
      }

      if (isCoreBuildRequest) {
        const previousCompleteResponse = await findCompleteCachedResponse(
          event.request,
          {
            excludeCurrent: true,
          }
        );
        if (previousCompleteResponse) {
          event.waitUntil(cacheResponse(event.request, previousCompleteResponse.clone()));
          return previousCompleteResponse;
        }
      }

      return fetchAndCache(event.request);
    })()
  );
});
