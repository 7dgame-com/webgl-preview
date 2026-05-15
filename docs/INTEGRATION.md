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
    "frontend": "/index.html",
    "runner": "/embed.html"
  },
  "ui": {
    "mode": "iframe"
  }
}
```

`/index.html` is the standalone plugin shell. It accepts a scene id, reads the
scene from the platform API using the host-provided plugin token, and forwards
the normalized scene payload to the packaged Unity runner.

`/embed.html` remains the low-level Unity runner used by the main web frontend's
inline "Run Scene" button.

## Recommended Registration

```json
{
  "id": "webgl-preview",
  "name": "WebGL 场景运行器",
  "nameI18n": {
    "zh-CN": "WebGL 场景运行器",
    "zh-TW": "WebGL 場景運行器",
    "en-US": "WebGL Scene Runner",
    "ja-JP": "WebGL シーンランナー",
    "th-TH": "ตัวรันฉาก WebGL"
  },
  "description": "输入场景号并用 Unity WebGL 运行对应 XRUGC 场景",
  "url": "https://webgl-preview.plugins.xrugc.com/",
  "allowedOrigin": "https://webgl-preview.plugins.xrugc.com",
  "group": "builtins",
  "icon": "VideoPlay",
  "enabled": true,
  "order": 3,
  "accessScope": "auth-only",
  "version": "1.0.0",
  "extraConfig": {
    "apiBase": "https://d.dev.xrugc.com/api"
  }
}
```

Use the corresponding production API base for production registration:

```json
{
  "extraConfig": {
    "apiBase": "https://xrugc.com/api"
  }
}
```

The plugin also infers the API base from the host referrer (`/api`) when
`extraConfig.apiBase` is not set.

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

The container serves HTTP on port `80`, matching the `blockly` and `editor`
frontend plugin images. Portainer/Traefik should route to container port `80`.

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
