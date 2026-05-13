# WebGL Preview

Unity WebGL preview plugin for XRUGC. The service is a small
`Node.js + Express + TypeScript` app that serves the packaged Unity WebGL
runtime and exposes host-facing plugin discovery endpoints.

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

- Page: `http://127.0.0.1:3006/embed.html`
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
  "url": "http://127.0.0.1:3006/embed.html",
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
`Content-Type` headers. The Express service handles `.data.gz`,
`.framework.js.gz`, and `.wasm.gz` responses before serving static files.
