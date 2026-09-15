# WebGL Preview

Unity WebGL preview plugin for XRUGC. The plugin follows the static frontend
shape used by `blockly` and `editor`: packaged browser assets are served by
nginx in production, with a tiny Node dev server for local checks.

## Docs

- [README-quickstart.md](./README-quickstart.md) - shortest local and Docker path.
- [docs/STRUCTURE.md](./docs/STRUCTURE.md) - repository layout and module boundaries.
- [docs/INTEGRATION.md](./docs/INTEGRATION.md) - host registration and Portainer notes.

## Quick Start

```bash
npm install
npm run build
npm start
```

Default endpoints:

- User-facing shell: `http://127.0.0.1:3006/index.html`
- Internal Unity runner: `http://127.0.0.1:3006/embed.html`
- Health: `http://127.0.0.1:3006/api/health`
- Plugin manifest: `http://127.0.0.1:3006/plugin/manifest`

## Docker

```bash
docker compose up -d --build
```

## Host Registration Example

```json
{
  "id": "webgl-preview",
  "name": "WebGL Preview",
  "url": "http://127.0.0.1:3006/index.html",
  "allowedOrigin": "http://127.0.0.1:3006",
  "group": "tools",
  "enabled": true,
  "version": "1.0.0"
}
```

## Production Image

```text
hkccr.ccs.tencentyun.com/plugins/webgl-preview:develop
```

Unity WebGL `.gz` assets require correct `Content-Encoding` and
`Content-Type` headers. The production nginx config handles `.data.gz`,
`.framework.js.gz`, and `.wasm.gz` before serving static files.

The shell obtains its production Token only from the session-bound Host
handshake and lists the authenticated user's scenes through the same-origin,
network-only `GET ./platform-api/v1/verses` alias. The container forwards only
the fixed Verse list/detail routes to the validated `HOST_API_BASE`, while
signed scene assets stay on an explicit HTTPS allowlist. The removed
`/api/snapshot` endpoint always returns 404. Nginx also returns 404 for
`/__xrugc_proxy__`; a controlling Service Worker recognizes that legacy Unity
URL only as an alternate entry into the same HTTPS host/file allowlist used by
`/__xrugc_scene_resource__`, with credentials omitted and redirects rejected.

`public/build-manifest.json` binds loader/data/framework/wasm into one build
identity. Publishing CI uses the checked-in immutable base digest by default;
an optional `WEBGL_PREVIEW_BASE_IMAGE` repository variable may replace it only
with another immutable `name@sha256:<digest>` reference. CI verifies the real
files inherited into the final image. It also requires that the Preview Shell
version and generated Unity `buildId` appear together in
`public/artifact-compatibility.json`; updating either side requires an explicit
compatibility approval in that file.

The user-facing version is separate from that compatibility identity. Release
CI injects the Beijing build time in the same `vYYYY.MM.DD-HHmm` format used by
the other platform plugins, and uses that value for the Shell asset cache keys.
Local source keeps a placeholder and displays `vdev` rather than claiming a
release time.

The currently approved base is
`hkccr.ccs.tencentyun.com/plugins/webgl-preview@sha256:1e03190d0b44ca204869461862859198a801edb3b4c1bf00e8ee5e8da1d9bfe5`.
It is the `main` image for source revision `6906e15`; the older `publish`
image is intentionally rejected because its Unity build identity differs.

Run `npm run test:docker` for the same final-image gate locally. It builds the
Compose image, starts its normal nginx `CMD`, checks headers, Range, manifests
and all four Unity files, then launches a real headless Chrome/Chromium against
both the root Runner and the strip-prefix Runner. The browser gate requires the
Unity canvas to have positive dimensions and remain visible, both loading
overlays to be hidden, and the Unity warning area to be empty before the
temporary container is removed. Set `CHROME_BIN` when Chrome is not installed
in a common macOS/Linux path.
