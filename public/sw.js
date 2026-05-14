const WEBGL_PREVIEW_CACHE_VERSION = "2026.05.14.3";
const WEBGL_PREVIEW_CACHE_NAME =
  "xrugc-webgl-preview-" + WEBGL_PREVIEW_CACHE_VERSION;

const CACHEABLE_PATHS = [
  "Build/d22dd468b8c4f08254bc81436c229502.loader.js",
  "Build/5502fee942c2accc1885ee92a4887d49.data.br",
  "Build/2dcf828afdd731d2ba1d87dda65aae60.framework.js.br",
  "Build/abc429029eca16512c5ae770b25b0f27.wasm.br",
  "TemplateData/style.css",
  "TemplateData/favicon.ico",
];

const CACHEABLE_REQUEST_RE =
  /\/(?:Build\/(?:[a-f0-9]{32}\.(?:loader\.js|data\.br|framework\.js\.br|wasm\.br))|TemplateData\/(?:style\.css|favicon\.ico))(?:[?#]|$)/i;

const withVersion = (path) => {
  const url = new URL(path, self.location.href);
  url.searchParams.set("v", WEBGL_PREVIEW_CACHE_VERSION);
  return url.toString();
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
    const cache = await caches.open(WEBGL_PREVIEW_CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
};

const warmPreviewCache = async () => {
  const cache = await caches.open(WEBGL_PREVIEW_CACHE_NAME);
  await Promise.allSettled(
    CACHEABLE_PATHS.map(async (path) => {
      const request = new Request(withVersion(path), {
        cache: "reload",
        credentials: "same-origin",
      });
      if (await cache.match(request)) return;
      await fetchAndCache(request);
    })
  );
};

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "warm-webgl-preview-cache") {
    event.waitUntil(warmPreviewCache());
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
