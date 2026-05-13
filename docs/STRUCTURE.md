# WebGL Preview Structure

`webgl-preview` is a static hosted frontend plugin. It serves a packaged Unity
WebGL build through nginx and exposes static XRUGC plugin discovery endpoints.

## Directory Layout

```text
webgl-preview/
├── public/
│   ├── embed.html                   # iframe entry used by the host
│   ├── index.html                   # Unity template entry
│   ├── plugin/manifest.json         # Host-facing plugin manifest
│   ├── Build/                       # Unity WebGL runtime assets
│   └── TemplateData/                # Unity template assets
├── scripts/
│   ├── dev-server.js                # Local static server
│   ├── self-check.js                # Runtime asset checks
│   └── structure-check.js           # Repository structure checks
├── .github/workflows/
│   └── webgl-preview-ci.yml         # Tencent registry image pipeline
├── Dockerfile
├── nginx.conf                       # Production static routing and headers
├── docker-compose.yml               # Local development compose
└── docker-compose.stack.yml         # Portainer/Traefik stack compose
```

## Runtime Boundaries

- `/api/health` is returned by nginx for service-level checks.
- `/plugin/manifest` serves `public/plugin/manifest.json`.
- `/plugin/health` mirrors runtime status for plugin-oriented checks.
- `/embed.html` is the preferred iframe entry.
- Unknown browser paths fall back to `embed.html` so iframe reloads stay stable.

## Static Asset Rules

Unity emits compressed assets such as `.wasm.gz`, `.data.gz`, and `.js.gz`.
The nginx config sets `Content-Encoding: gzip` and the matching content type
before serving these files. It also applies cross-origin isolation headers for
the Unity runtime.
