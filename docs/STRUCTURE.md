# WebGL Preview Structure

`webgl-preview` is a static frontend plugin around an already-exported Unity
WebGL build. This repository owns the browser shell, JavaScript Runner bridge,
cache, web-server configuration and delivery verification; it does not require
Unity C# or a Unity re-export.

## Directory layout

```text
webgl-preview/
├── public/
│   ├── index.html                   # user-facing Preview Shell
│   ├── embed.html                   # internal Unity Runner
│   ├── runtime-config.json          # same-origin trust and runtime limits
│   ├── build-manifest.json          # one identity for all Unity artifacts
│   ├── artifact-compatibility.json  # approved Shell/Unity build pairs
│   ├── sw.js                        # versioned build/resource cache
│   ├── modules/plugin-runner.js     # scene list, API and lifecycle state
│   ├── plugin/manifest.json         # base-relative Host entries
│   ├── Build/                       # Unity artifacts (Git LFS in source)
│   └── TemplateData/                # Unity template assets
├── scripts/
│   ├── dev-server.js                # root/subpath static server
│   ├── build-manifest.js            # artifact generation and verification
│   ├── check-base-image.js          # immutable-image release gate
│   ├── check-artifact-compatibility.js # Shell/Unity combination gate
│   ├── container-smoke.js           # final image HTTP/header/Range gate
│   ├── subpath-container-smoke.js   # strip-prefix HTTP gate
│   ├── browser-smoke.js             # real Chrome root/subpath Unity gate
│   ├── self-check.js                # security and artifact checks
│   └── structure-check.js           # repository checks
├── tests/                            # Node contract/regression tests
├── .github/workflows/webgl-preview-ci.yml
├── Dockerfile
├── nginx.conf
├── docker-compose.yml
└── docker-compose.stack.yml
```

## Runtime boundaries

- `/index.html` is the only user-facing shell. It establishes a session-bound
  Host handshake, obtains an in-memory Token, requests `GET /v1/verses`, and
  lets the user select a scene before starting Unity.
- `/embed.html` is an internal same-origin Runner. It accepts only messages from
  its parent window, exact origin and current Run Session, and supports a
  `unityInstance.Quit()` dispose handshake.
- `/plugin/manifest` serves the manifest whose `./index.html` and
  `./embed.html` entries resolve from the plugin registration root.
- `/runtime-config.json` is no-store. `/build-manifest.json`, HTML, loader and
  Service Worker revalidate.
- `/__xrugc_proxy__` and `/api/snapshot` are removed and return 404. Platform
  credentials are never forwarded to scene asset hosts.
- Unknown browser routes fall back to `index.html`; missing static-looking
  paths return 404.

## Build and cache identity

The Build Manifest contains exactly one loader, data, framework and wasm file,
including size, SHA-256, content encoding and content type. The Runner resolves
all four files from that one manifest. The Service Worker uses its `buildId` in
both cache name and request key, never copies same-named files from an older
revision, bypasses Range bodies, and only prunes old rollback caches after the
new set is complete.

The Docker final stage regenerates and verifies the manifest against the real
files inherited from the immutable Unity base image. Source-level Git LFS
metadata is not accepted as final-image verification. Publishing additionally
checks `public/artifact-compatibility.json`, which is an explicit allowlist of
Preview Shell version and Unity `buildId` pairs; a digest-pinned but unapproved
older Unity set is rejected before any release tag is pushed.

The approved baseline records both source revision `6906e15` and immutable
base-image digest `sha256:1e03190d…bfe5`. The mutable `publish` tag is not a
valid substitute: its current Unity build has a different identity.

The candidate and pushed-digest delivery jobs also run Chrome/Chromium through
an ephemeral loopback Chrome DevTools Protocol endpoint. Node's built-in
WebSocket polls real computed DOM state on wall-clock time; it deliberately
does not fast-forward the approximately 199 MB Unity download or WebAssembly
startup. A fresh temporary browser profile loads `embed.html` at the root and
through the same reusable `/webgl-preview/` strip-prefix proxy used by HTTP
smoke. Delivery fails unless the Unity canvas has positive layout and backing
dimensions, both the Unity loading bar and shell loading shield are hidden,
and the Unity warning container is empty. These smoke tools accept only
credential-free loopback HTTP origins.
