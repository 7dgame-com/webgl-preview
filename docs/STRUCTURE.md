# WebGL Preview Structure

`webgl-preview` is a small hosted frontend plugin. It serves a packaged Unity
WebGL build and exposes the standard XRUGC plugin discovery endpoints.

## Directory Layout

```text
webgl-preview/
├── src/
│   ├── app.ts                       # Express app wiring
│   ├── config.ts                    # Runtime configuration
│   ├── index.ts                     # Server entrypoint
│   ├── common/
│   │   └── response.ts              # Standard success/error responses
│   ├── middleware/
│   │   ├── requestLogger.ts         # Request logging middleware
│   │   └── unityStaticHeaders.ts    # Unity gzip and isolation headers
│   └── plugin/
│       ├── helpers.ts               # Manifest and runtime status helpers
│       ├── manifest.json            # Host-facing plugin manifest
│       └── routes.ts                # /plugin endpoints
├── public/
│   ├── embed.html                   # iframe entry used by the host
│   ├── index.html                   # Unity template entry
│   ├── Build/                       # Unity WebGL runtime assets
│   └── TemplateData/                # Unity template assets
├── scripts/
│   └── self-check.js                # Repository/runtime sanity checks
├── .github/workflows/
│   └── webgl-preview-ci.yml         # Tencent registry image pipeline
├── Dockerfile
├── docker-compose.yml               # Local development compose
└── docker-compose.stack.yml         # Portainer/Traefik stack compose
```

## Runtime Boundaries

- `/api/health` is the service-level health endpoint.
- `/plugin/manifest` is the host discovery endpoint.
- `/plugin/health` mirrors runtime status for plugin-oriented checks.
- `/embed.html` is the preferred iframe entry.
- Unknown browser paths fall back to `embed.html` so iframe reloads stay stable.

## Static Asset Rules

Unity emits compressed assets such as `.wasm.gz`, `.data.gz`, and `.js.gz`.
The Express app sets `Content-Encoding: gzip` and the matching content type
before serving these files. It also applies cross-origin isolation headers for
the Unity runtime.

