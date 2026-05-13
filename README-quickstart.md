# WebGL Preview Quickstart

## Local Development

```bash
npm install
npm run dev
```

Default endpoints:

- Page: http://127.0.0.1:3006/embed.html
- Health: http://127.0.0.1:3006/api/health
- Plugin manifest: http://127.0.0.1:3006/plugin/manifest

## Production-Like Local Run

```bash
npm run build
npm start
```

## Docker

```bash
docker compose up -d --build
```

The local compose file binds the service to `127.0.0.1:3006`.

## Publish

The GitHub Actions workflow builds and pushes:

```text
hkccr.ccs.tencentyun.com/plugins/webgl-preview:<tag>
```

Branch tags include the branch name, plus fixed aliases for `develop`,
`main`, `publish`, and manually supplied tags from `workflow_dispatch`.

