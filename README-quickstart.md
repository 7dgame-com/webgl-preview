# WebGL Preview Quickstart

## Local prerequisites

- Node.js 20 or newer.
- Google Chrome or Chromium for the final browser smoke. Set `CHROME_BIN` when
  the executable is not in a common macOS/Linux installation path.
- Git LFS when the real Unity build must be tested locally.
- Roughly 200 MB for the current compressed Unity build, plus Docker layer and
  browser-cache space.

After cloning:

```bash
git lfs install
git lfs pull
npm ci
npm test
```

`npm test` may validate committed LFS metadata when the large objects are not
present, but `npm run verify:build` is deliberately strict and fails on an LFS
pointer. The Docker `final-verifier` is also strict and checks the real files in
the final image.

## Root-path development

```bash
npm run dev
```

Endpoints:

- User shell: `http://127.0.0.1:3006/index.html`
- Internal Runner: `http://127.0.0.1:3006/embed.html`
- Health: `http://127.0.0.1:3006/api/health`
- Manifest: `http://127.0.0.1:3006/plugin/manifest`

The production interaction waits for a trusted Host INIT and then lists the
current user's scenes. For explicit loopback-only standalone development, copy
`.env.example`, configure `PLATFORM_API_BASE`, and enable only the compatibility
features you need. A development Token requires both
`ALLOW_DEVELOPMENT_TOKEN=true` and explicit local development mode; it stays in
page memory and is never read from the URL or browser storage.

## Subpath development

Use the same browser-visible prefix as the platform route:

```bash
BASE_PATH=/webgl-preview/ npm run dev
```

Open `http://127.0.0.1:3006/webgl-preview/`. Static files, manifest entries,
runtime config, Service Worker scope, build manifest and Runner remain under
that prefix. Requests outside it return 404.

## Docker

The Unity build is inherited from an existing WebGL Preview image. Prefer an
immutable reference even for local verification:

```bash
export WEBGL_PREVIEW_BASE_IMAGE='hkccr.ccs.tencentyun.com/plugins/webgl-preview@sha256:1e03190d0b44ca204869461862859198a801edb3b4c1bf00e8ee5e8da1d9bfe5'
export REQUIRE_APPROVED_BUILD=1
export HOST_API_BASE='https://d.dev.xrugc.com'
docker compose build
docker compose up -d
```

`HOST_API_BASE` is required at container startup and must be an exact HTTPS
origin. The container appends only its fixed `/api/v1/verses` list/detail
paths; do not include `/api` in the environment value.

The image build regenerates `build-manifest.json` from the inherited real files
and fails on missing files, LFS pointers, invalid gzip/Brotli content, size or
SHA-256 mismatch.
`public/artifact-compatibility.json` is the release allowlist for the exact
Preview Shell version plus Unity `buildId`; publishing rejects combinations
that are not explicitly approved. `npm run test:docker` runs the complete
container HTTP and real headless-browser smoke without replacing nginx's
startup command. With an already-running local candidate, run the browser gate
directly with:

```bash
CHROME_BIN=/path/to/chrome npm run test:browser-smoke -- http://127.0.0.1:3006
```

The browser process uses a disposable profile and real wall-clock CDP polling;
it never fast-forwards the approximately 199 MB Unity download or WebAssembly
startup. `BROWSER_SMOKE_TIMEOUT_MS` may be raised for slower CI hosts, and
`BROWSER_SMOKE_POLL_MS` controls the polling interval. The npm script enables
Node 20's built-in experimental WebSocket support, so no browser-test package
is installed.

## Publish

CI already falls back to the immutable reference shown above. Optionally set
the GitHub repository variable `WEBGL_PREVIEW_BASE_IMAGE` to replace that
checked-in default with another reviewed immutable reference. The current value
resolves the image built from source revision
`6906e1525dec4b6cb0caf5c3b1d12145c22203ca` and approved Unity build
`sha256:7bee87bbf1c044802841b46489638cb5069eac5b51fb0637714a3b826b092f33`.
Registry credentials remain in
`TENCENT_REGISTRY_USER` and `TENCENT_REGISTRY_PASSWORD` secrets. The workflow
then publishes:

```text
hkccr.ccs.tencentyun.com/plugins/webgl-preview:<tag>
```

Branch aliases include `develop`, `main`, `publish`, and an optional
`workflow_dispatch` tag.
