# WebGL Preview CDN

The WebGL runner should be cached at the CDN edge. Prefer publishing it through
the platform CDN domain at `/webgl-preview/`, with the `webgl-preview` nginx
container as the origin.

## Cache Rules

Configure the CDN to honor origin `Cache-Control` headers.

Recommended path rules:

```text
/webgl-preview/Build/*.data.br     cache 1 year
/webgl-preview/Build/*.wasm.br     cache 1 year
/webgl-preview/Build/*.framework.js.br cache 1 year
/webgl-preview/Build/*.data.gz     cache 1 year
/webgl-preview/Build/*.wasm.gz     cache 1 year
/webgl-preview/Build/*.framework.js.gz cache 1 year
/webgl-preview/Build/*.loader.js   revalidate
/webgl-preview/embed.html          revalidate
/webgl-preview/sw.js               revalidate
```

The nginx origin sends immutable cache headers for `.br` and `.gz` Unity build
artifacts, and revalidation headers for `embed.html`, `sw.js`, and loader
scripts.

## Production Routing

The stack exposes both plugin domains and platform same-domain paths:

```text
https://xrugc.com/webgl-preview/embed.html
https://d.dev.xrugc.com/webgl-preview/embed.html
https://webgl-preview.plugins.xrugc.com/embed.html
https://webgl-preview.d.plugins.xrugc.com/embed.html
```

The preferred production path is `https://xrugc.com/webgl-preview/embed.html`.
In `docker-compose.stack.yml`, Traefik routes:

```text
Host(`xrugc.com`) && PathPrefix(`/webgl-preview`)
Host(`d.dev.xrugc.com`) && PathPrefix(`/webgl-preview`)
```

to the WebGL preview containers and strips the `/webgl-preview` prefix before
forwarding to nginx. This keeps browser iframe, postMessage target origin, and
proxied scene assets on the platform domain.

If the platform web container is used as the only public entrypoint, keep:

```text
APP_UNITY_PREVIEW_UPSTREAM=https://webgl-preview.plugins.xrugc.com
```

In that mode the browser still uses the platform domain, but the web container
performs an extra upstream hop. The Traefik `/webgl-preview` route removes that
extra hop when the platform CDN points directly at the same Traefik entrypoint.
