# WebGL Preview Integration

## Entries and base path

The Host reads `GET ./plugin/manifest` from the plugin registration root. The
manifest intentionally uses relative entries:

```json
{
  "id": "webgl-preview",
  "entry": {
    "frontend": "./index.html",
    "runner": "./embed.html"
  },
  "ui": { "mode": "iframe" }
}
```

`index.html` is the user-facing Preview Shell. `embed.html` is the internal
Unity Runner and must not replace the shell as the menu registration URL. Both
work at an independent-domain root or below `/webgl-preview/`; every owned URL
is resolved relative to the registration root.

For the platform path, Traefik routes `PathPrefix(/webgl-preview)` to this
container and strips that prefix before nginx. The browser-visible Host URL,
manifest root, Service Worker scope and API configuration must still use the
same `/webgl-preview/` registration root.

## Trusted Host handshake

1. The shell loads same-origin `runtime-config.json` and identifies the parent
   only from `trustedHostOrigins`.
2. It generates a random `handshakeSession` and sends it in
   `PLUGIN_READY.payload.handshakeSession` using the exact parent origin.
3. The Host validates iframe source and registered `allowedOrigin`, then echoes
   the session inside `INIT.payload` with the Token and plugin config.
4. `TOKEN_UPDATE`, `DESTROY`, language, theme and other control messages remain
   bound to the same window, origin and session.
5. The Token stays in memory. URL parameters, referrer, localStorage and
   sessionStorage are never Token sources.

The Shell and internal Runner use a separate same-origin Run Session for scene,
progress, error and dispose messages.

## Recommended registration

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
  "description": "从我的场景中选择并使用 Unity WebGL 运行 XRUGC 场景",
  "url": "https://webgl-preview.plugins.xrugc.com/",
  "allowedOrigin": "https://webgl-preview.plugins.xrugc.com",
  "allowedHostOrigins": [
    "https://d.xrugc.com",
    "https://d.dev.xrugc.com"
  ],
  "group": "builtins",
  "icon": "VideoPlay",
  "enabled": true,
  "order": 3,
  "accessScope": "auth-only",
  "version": "1.0.0"
}
```

The registration does not need `extraConfig.apiBase`. The production runtime
uses the plugin-owned relative alias `./platform-api`; the browser therefore
stays on the plugin registration origin and keeps working at both `/` and a
strip-prefix `/webgl-preview/` route. The container requires one deployment
value: `HOST_API_BASE=https://d.dev.xrugc.com` on develop and
`HOST_API_BASE=https://xrugc.com` on production. It must be an exact,
credential-free HTTPS origin without a path, query or fragment.

An explicit external `apiBase` remains a compatibility fallback only when the
same-origin alias is absent, and is accepted only when its exact origin appears
in `runtime-config.json.platformApiOrigins`; it is never inferred from an
arbitrary referrer.

## “My scenes” API contract

After INIT, the Shell sends a Bearer-authenticated request to:

```text
GET {registrationRoot}/platform-api/v1/verses
  ?sort=-updated_at
  &page=1
  &per-page=20
  &expand=image
  &VerseSearch[name]=optional-search
```

The server derives the owner from the JWT and always applies
`verse.author_id = current user`. Pagination uses
`X-Pagination-Current-Page`, `X-Pagination-Page-Count`,
`X-Pagination-Per-Page` and `X-Pagination-Total-Count`.

Running a selected, URL-supplied or manually entered id uses the same protected
`GET {registrationRoot}/platform-api/v1/verses/{id}` alias. Nginx maps only
those two fixed shapes to `{HOST_API_BASE}/api/v1/verses[/{id}]`; all other
alias paths fail with 404 and non-read methods are denied before proxying. The
existing endpoint supplies the required metas/resources/code expansions, so
there is no generic snapshot or URL proxy endpoint.

The alias forwards only `Host`, `Accept` and the in-memory `Authorization`
header. It does not forward browser `Cookie` or `Origin`, rejects upstream
redirects, strips `Set-Cookie`, `Location` and CORS response headers, verifies
the upstream TLS certificate, and always responds with `Cache-Control:
no-store`. The Service Worker explicitly keeps the alias network-only.

The browser-to-API request is same-origin even when the plugin uses its
independent plugin domain, so it does not require API CORS configuration.
`CORS_ALLOWED_ORIGINS` is needed only for the legacy direct-origin fallback:

```text
CORS_ALLOWED_ORIGINS=https://webgl-preview.plugins.xrugc.com
```

That fallback CORS response must permit `Authorization` and expose the four
pagination headers.

## Asset and compatibility policy

- Scene assets keep their signed HTTPS URL semantics and must match an exact
  `assetOrigins` entry. Platform Token/Cookie headers are stripped.
- The legacy China Space Station scene uses the exact Tencent COS origin
  `https://mrpp-1257979353.cos.ap-chengdu.myqcloud.com`; keep this host explicit
  rather than allowing wildcard COS domains.
- Redirects are rejected by the Service Worker resource path instead of
  following an unvalidated target.
- Manual scene id input is hidden in production. It requires
  `allowManualSceneId=true` or explicit loopback development and still uses the
  normal scene view authorization.
- A development Token additionally requires
  `allowDevelopmentToken=true`; it is memory-only and visibly marked as local.

## Image and health

Publishing uses the checked-in immutable `WEBGL_PREVIEW_BASE_IMAGE` fallback;
the repository variable is an optional reviewed override and must also be an
immutable `name@sha256:<digest>`. Registry secrets
`TENCENT_REGISTRY_USER` and `TENCENT_REGISTRY_PASSWORD` remain required.
The candidate image is built and container-smoked before publishing. HTTP
checks are followed by a dependency-free real Chrome/Chromium smoke against
both root and strip-prefix Runner URLs; the same smoke is repeated against the
pushed immutable digest. The build also enforces
`public/artifact-compatibility.json`; add a Shell/build pair there only after
that exact Unity build has been accepted for the current shell.

The Preview workflow exposes three release gates: `Test`, `Security Contracts`,
and `Build and Smoke Candidate`. The publish job depends on all three. Configure
those checks as required for release branches. A coordinated platform release
must also require the Host repository's `Lint & Test` job and the API
repository's `test` job, because the handshake and current-user scene boundary
live in those repositories. Branch protection and any repository-variable
override are GitHub settings and cannot be inferred from source control; verify
them during release readiness review.

GitHub-hosted Linux runners normally expose Chrome in a discovered system
path. Self-hosted runners must either install Chrome/Chromium in a common
macOS/Linux path or set `CHROME_BIN`. The browser smoke accepts only a local
HTTP candidate origin and always uses a disposable profile, bounded process
timeout and locally bound strip-prefix proxy. It uses Node 20's built-in
experimental WebSocket client to poll Chrome DevTools on real wall-clock time;
no Playwright/Puppeteer dependency or virtual-time fast-forward is involved.

Health endpoints:

```text
GET /health
GET /api/health
GET /plugin/health
```

They return `success: true`, plugin id, public-directory status and, in the
development server, the configured deployment base path.
