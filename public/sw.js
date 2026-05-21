const WEBGL_PREVIEW_CACHE_VERSION = "2026.05.21.13";
const WEBGL_PREVIEW_CACHE_PREFIX = "xrugc-webgl-preview-";
const WEBGL_PREVIEW_CACHE_NAME =
  WEBGL_PREVIEW_CACHE_PREFIX + WEBGL_PREVIEW_CACHE_VERSION;
const WEBGL_PREVIEW_SCENE_RESOURCE_CACHE_NAME =
  WEBGL_PREVIEW_CACHE_PREFIX + "scene-resources-v1";
const WARM_CACHE_FILE_TIMEOUT_MS = 15000;
const SCENE_RESOURCE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SCENE_RESOURCE_MAX_ENTRIES = 600;
const SCENE_RESOURCE_CACHE_PATH = "/__xrugc_scene_resource__";
const SCENE_PROXY_PATH = "/__xrugc_proxy__";
const LEGACY_COS_HOST =
  "7dgame-public-1251022382.cos.ap-nanjing.myqcloud.com";
const CDN_HOST = "data.7dgame.com";
const SCENE_RESOURCE_PATH_RE =
  /\.(?:png|jpe?g|gif|webp|bmp|svg|mp3|wav|ogg|m4a|mp4|webm|glb|gltf|fbx|obj|vox)(?:[?#]|$)/i;
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

const normalizeSceneResourceTargetUrl = (value) => {
  if (typeof value !== "string" || !value) return "";

  try {
    const url = new URL(value.replace(/\\\//g, "/"), self.location.origin);
    if (url.origin === self.location.origin && url.pathname === SCENE_PROXY_PATH) {
      return normalizeSceneResourceTargetUrl(url.searchParams.get("url") || "");
    }

    if (url.protocol === "http:") {
      url.protocol = "https:";
    }
    if (url.hostname === LEGACY_COS_HOST) {
      url.protocol = "https:";
      url.hostname = CDN_HOST;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    if (url.hostname !== CDN_HOST && url.hostname !== LEGACY_COS_HOST) return "";
    if (!SCENE_RESOURCE_PATH_RE.test(url.pathname)) return "";

    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
};

const sceneResourceCacheKey = (targetUrl) =>
  new Request(
    `${self.location.origin}${SCENE_RESOURCE_CACHE_PATH}?url=${encodeURIComponent(
      targetUrl
    )}`,
    { credentials: "same-origin" }
  );

const getSceneResourceTargetFromProxyRequest = (request) => {
  try {
    const url = new URL(request.url);
    if (url.origin !== self.location.origin || url.pathname !== SCENE_PROXY_PATH) {
      return "";
    }
    return normalizeSceneResourceTargetUrl(url.searchParams.get("url") || "");
  } catch {
    return "";
  }
};

const getCachedAt = (response) =>
  Number(response && response.headers.get("x-xrugc-cached-at")) || 0;

const isFreshSceneResource = (response) =>
  !!response && Date.now() - getCachedAt(response) <= SCENE_RESOURCE_CACHE_TTL_MS;

const responseWithCachedAt = (response) => {
  const responseForCache = response.clone();
  const headers = new Headers(responseForCache.headers);
  headers.set("x-xrugc-cached-at", String(Date.now()));
  return new Response(responseForCache.body, {
    status: responseForCache.status,
    statusText: responseForCache.statusText,
    headers,
  });
};

const matchSceneResourceCache = async (cache, targetUrl) => {
  const response = await cache.match(sceneResourceCacheKey(targetUrl));
  if (!isFreshSceneResource(response)) {
    if (response) {
      await cache.delete(sceneResourceCacheKey(targetUrl));
    }
    return null;
  }
  return response;
};

const pruneSceneResourceCache = async (cache) => {
  const keys = await cache.keys();
  if (keys.length <= SCENE_RESOURCE_MAX_ENTRIES) return;

  const entries = await Promise.all(
    keys.map(async (key) => {
      const response = await cache.match(key);
      return {
        key,
        cachedAt: getCachedAt(response),
      };
    })
  );

  await Promise.all(
    entries
      .sort((left, right) => left.cachedAt - right.cachedAt)
      .slice(0, Math.max(0, entries.length - SCENE_RESOURCE_MAX_ENTRIES))
      .map((entry) => cache.delete(entry.key))
  );
};

const cacheSceneResourceResponse = async (targetUrl, response) => {
  if (!response || !response.ok || response.type === "opaque") return;
  if (response.status !== 200) return;

  const cache = await caches.open(WEBGL_PREVIEW_SCENE_RESOURCE_CACHE_NAME);
  await cache.put(sceneResourceCacheKey(targetUrl), responseWithCachedAt(response));
  await pruneSceneResourceCache(cache);
};

const buildRangeResponse = async (cachedResponse, rangeHeader) => {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader || "");
  if (!match) return cachedResponse;

  const buffer = await cachedResponse.clone().arrayBuffer();
  const size = buffer.byteLength;
  let start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : size - 1;

  if (!match[1] && match[2]) {
    const suffixLength = Number(match[2]);
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  }

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return new Response(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${size}`,
      },
    });
  }

  end = Math.min(end, size - 1);
  const headers = new Headers(cachedResponse.headers);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Length", String(end - start + 1));
  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  return new Response(buffer.slice(start, end + 1), {
    status: 206,
    statusText: "Partial Content",
    headers,
  });
};

const fetchAndCacheSceneResource = async (request, targetUrl) => {
  const response = await fetch(request);
  if (!request.headers.has("range")) {
    await cacheSceneResourceResponse(targetUrl, response.clone()).catch(() => {});
  }
  return response;
};

const handleSceneResourceRequest = async (request, targetUrl) => {
  const cache = await caches.open(WEBGL_PREVIEW_SCENE_RESOURCE_CACHE_NAME);
  const cached = await matchSceneResourceCache(cache, targetUrl);
  if (cached) {
    const rangeHeader = request.headers.get("range");
    return rangeHeader ? buildRangeResponse(cached, rangeHeader) : cached;
  }
  return fetchAndCacheSceneResource(request, targetUrl);
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

const postSceneResourceCacheStatus = async (clientId, payload) => {
  if (!clientId) return;
  const client = await self.clients.get(clientId).catch(() => null);
  if (!client) return;
  client.postMessage({
    type: "webgl-preview-scene-cache-status",
    version: WEBGL_PREVIEW_CACHE_VERSION,
    ...payload,
  });
};

const warmSceneResourceCache = async (clientId, resources) => {
  const targets = [
    ...new Set(
      (Array.isArray(resources) ? resources : [])
        .map((item) => normalizeSceneResourceTargetUrl(item))
        .filter(Boolean)
    ),
  ];
  const total = targets.length;
  if (!total) return;

  const cache = await caches.open(WEBGL_PREVIEW_SCENE_RESOURCE_CACHE_NAME);
  await postSceneResourceCacheStatus(clientId, {
    status: "started",
    completed: 0,
    total,
  });

  let completed = 0;
  for (const targetUrl of targets) {
    const cached = await matchSceneResourceCache(cache, targetUrl);
    if (!cached) {
      const requestUrl = new URL(SCENE_PROXY_PATH, self.location.origin);
      requestUrl.searchParams.set("url", targetUrl);
      requestUrl.searchParams.set("sceneCache", "1");
      try {
        await fetchAndCacheSceneResource(
          new Request(requestUrl.toString(), {
            cache: "reload",
            credentials: "same-origin",
          }),
          targetUrl
        );
      } catch {
        // Unity can still request the resource normally; warm failures are non-blocking.
      }
    }

    completed += 1;
    await postSceneResourceCacheStatus(clientId, {
      status: "progress",
      completed,
      total,
    });
  }

  await postSceneResourceCacheStatus(clientId, {
    status: "complete",
    completed: total,
    total,
  });
};

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "warm-webgl-preview-cache") {
    event.waitUntil(warmPreviewCache(event.source && event.source.id));
  }

  if (event.data && event.data.type === "warm-webgl-scene-resource-cache") {
    event.waitUntil(
      warmSceneResourceCache(
        event.source && event.source.id,
        event.data.resources || []
      )
    );
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
  if (event.request.method === "GET" && url.pathname === SCENE_PROXY_PATH) {
    const targetUrl = getSceneResourceTargetFromProxyRequest(event.request);
    if (targetUrl) {
      event.respondWith(handleSceneResourceRequest(event.request, targetUrl));
    }
    return;
  }
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
