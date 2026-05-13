# WebGL Preview Integration

## Plugin Manifest

The host should read:

```text
GET /plugin/manifest
```

The manifest declares the iframe entry:

```json
{
  "id": "webgl-preview",
  "entry": {
    "frontend": "/embed.html"
  },
  "ui": {
    "mode": "iframe"
  }
}
```

## Recommended Registration

```json
{
  "id": "webgl-preview",
  "name": "WebGL Preview",
  "url": "https://webgl-preview.plugins.xrugc.com/embed.html",
  "allowedOrigin": "https://webgl-preview.plugins.xrugc.com",
  "group": "tools",
  "enabled": true,
  "version": "1.0.0"
}
```

## Portainer Stack Image

The production stack uses:

```text
hkccr.ccs.tencentyun.com/plugins/webgl-preview:develop
```

The image is built by the submodule repository workflow. The workflow requires
the following GitHub Actions secrets in the `webgl-preview` repository, or
organization-level secrets granted to that repository:

- `TENCENT_REGISTRY_USER`
- `TENCENT_REGISTRY_PASSWORD`

## Health Checks

Use either endpoint:

```text
GET /api/health
GET /plugin/health
```

Expected response shape:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "plugin": "webgl-preview",
    "publicDirExists": true
  }
}
```

