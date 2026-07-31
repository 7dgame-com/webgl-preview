# WebGL Preview CDN and cache policy

Prefer the platform same-origin route `/webgl-preview/`, with the WebGL Preview
nginx container as origin. An independent plugin domain remains supported when
the Host/API origin allowlists and CORS environment are configured explicitly.

## Browser-visible routes

```text
https://xrugc.com/webgl-preview/                 user Preview Shell
https://xrugc.com/webgl-preview/embed.html       internal Unity Runner
https://d.dev.xrugc.com/webgl-preview/           development Shell
https://webgl-preview.plugins.xrugc.com/         independent-domain Shell
```

In `docker-compose.stack.yml`, Traefik matches the platform Host and
`PathPrefix(/webgl-preview)`, then strips the prefix only on the upstream hop.
The HTML, relative manifest entries and Service Worker scope keep browser URLs
inside `/webgl-preview/`.

## Origin cache headers

Honor the nginx `Cache-Control` response:

```text
/webgl-preview/Build/*.data.{gz,br}          immutable, one year
/webgl-preview/Build/*.wasm.{gz,br}          immutable, one year
/webgl-preview/Build/*.framework.js.{gz,br}  immutable, one year
/webgl-preview/Build/*.loader.js             revalidate
/webgl-preview/index.html                    revalidate
/webgl-preview/embed.html                    revalidate
/webgl-preview/sw.js                         revalidate
/webgl-preview/build-manifest.json           revalidate
/webgl-preview/runtime-config.json           no-store
```

Do not normalize away the Build Manifest revision query. Runner requests carry
the manifest `buildId`; the Service Worker also incorporates that id into its
cache name and key. It never reuses a same-named artifact from an older build.

The Service Worker does not block foreground Unity startup on the approximately
200 MB background warm. Range requests bypass Cache Storage, and scene-resource
cache is bounded by entries, per-entry bytes, and total bytes. Old build caches
are retained as rollback candidates until the complete new four-file set is
available, then pruned to a bounded count.

## Scene asset traffic

There is no public arbitrary URL proxy. Allowlisted signed asset requests remain
direct HTTPS requests from the controlled page. The Service Worker may handle
those requests for bounded caching, but reconstructs the upstream request with
`credentials: omit`, never forwards Authorization/Cookie, and rejects redirects
instead of following an unvalidated hop. Non-allowlisted origins are not
intercepted or rewritten.

If CDN/COS CORS does not permit a required direct asset, fix that origin policy
or regenerate the URL upstream. Do not restore `/__xrugc_proxy__` as a fallback.
