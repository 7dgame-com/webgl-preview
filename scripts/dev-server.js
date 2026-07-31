const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'public');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || '3006');

function normalizeBasePath(value) {
  const normalized = String(value || '/')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
  return normalized ? `/${normalized}/` : '/';
}

const basePath = normalizeBasePath(process.env.BASE_PATH || '/');
const basePrefix = basePath === '/' ? '' : basePath.slice(0, -1);

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.wasm', 'application/wasm'],
  ['.br', 'application/octet-stream'],
  ['.gz', 'application/octet-stream'],
]);

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function readBoolean(value, fallback = false) {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function readNumber(value, fallback, minimum, maximum) {
  const candidate = Number(value);
  if (!Number.isFinite(candidate)) return fallback;
  return Math.max(minimum, Math.min(maximum, candidate));
}

function loadRuntimeConfig() {
  const configPath = path.join(root, 'runtime-config.json');
  const defaults = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const platformApiBase = String(process.env.PLATFORM_API_BASE || '').trim();
  let platformApiOrigins = splitCsv(process.env.PLATFORM_API_ORIGINS);

  if (platformApiBase) {
    try {
      platformApiOrigins = [
        ...new Set([...platformApiOrigins, new URL(platformApiBase).origin]),
      ];
    } catch {
      throw new Error('PLATFORM_API_BASE must be an absolute URL');
    }
  }

  return {
    ...defaults,
    development: true,
    localDevelopment: true,
    deploymentBasePath: basePath,
    trustedHostOrigins:
      splitCsv(process.env.TRUSTED_HOST_ORIGINS).length > 0
        ? splitCsv(process.env.TRUSTED_HOST_ORIGINS)
        : defaults.trustedHostOrigins,
    platformApiOrigins:
      platformApiOrigins.length > 0
        ? platformApiOrigins
        : defaults.platformApiOrigins,
    assetOrigins:
      splitCsv(process.env.ASSET_ORIGINS).length > 0
        ? splitCsv(process.env.ASSET_ORIGINS)
        : defaults.assetOrigins,
    standaloneApiBase: platformApiBase,
    allowManualSceneId: readBoolean(process.env.ALLOW_MANUAL_SCENE_ID, true),
    allowDevelopmentToken: readBoolean(
      process.env.ALLOW_DEVELOPMENT_TOKEN,
      false
    ),
    requestTimeoutMs: readNumber(
      process.env.REQUEST_TIMEOUT_MS,
      defaults.requestTimeoutMs,
      1000,
      120000
    ),
    maxDevicePixelRatio: readNumber(
      process.env.MAX_DEVICE_PIXEL_RATIO,
      defaults.maxDevicePixelRatio,
      1,
      3
    ),
  };
}

function sendJson(res, status, data, cacheControl = 'no-store') {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': cacheControl,
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(body);
}

function stripBasePath(urlPath) {
  if (basePath === '/') return urlPath;
  if (urlPath === basePrefix || urlPath === `${basePrefix}/`) return '/';
  if (!urlPath.startsWith(basePath)) return null;
  return `/${urlPath.slice(basePath.length)}`;
}

function resolveFile(urlPath) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(urlPath);
  } catch {
    return { status: 400, target: null };
  }

  const requested = decodedPath === '/' ? '/index.html' : decodedPath;
  const target = path.resolve(root, `.${requested}`);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    return { status: 403, target: null };
  }
  if (fs.existsSync(target) && fs.statSync(target).isFile()) {
    return { status: 200, target };
  }

  // The user-facing shell owns unknown browser routes. Static-looking missing
  // files are not rewritten, so configuration mistakes remain observable.
  if (path.extname(requested)) return { status: 404, target: null };
  return { status: 200, target: path.join(root, 'index.html') };
}

function staticHeaders(target) {
  const headers = {
    'Content-Type': contentTypes.get(path.extname(target)) || 'application/octet-stream',
    'Cross-Origin-Embedder-Policy': 'credentialless',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };

  if (target.endsWith('.wasm.br')) {
    headers['Content-Type'] = 'application/wasm';
    headers['Content-Encoding'] = 'br';
  } else if (target.endsWith('.js.br')) {
    headers['Content-Type'] = 'application/javascript';
    headers['Content-Encoding'] = 'br';
  } else if (target.endsWith('.data.br')) {
    headers['Content-Type'] = 'application/octet-stream';
    headers['Content-Encoding'] = 'br';
  } else if (target.endsWith('.wasm.gz')) {
    headers['Content-Type'] = 'application/wasm';
    headers['Content-Encoding'] = 'gzip';
  } else if (target.endsWith('.js.gz')) {
    headers['Content-Type'] = 'application/javascript';
    headers['Content-Encoding'] = 'gzip';
  } else if (target.endsWith('.data.gz')) {
    headers['Content-Type'] = 'application/octet-stream';
    headers['Content-Encoding'] = 'gzip';
  }

  if (
    target.endsWith('.html') ||
    target.endsWith('sw.js') ||
    target.endsWith('sw-build-cache.js') ||
    target.endsWith('runtime-config.json') ||
    target.endsWith('build-manifest.json') ||
    target.endsWith('artifact-compatibility.json') ||
    target.endsWith('manifest.json') ||
    target.endsWith('.loader.js')
  ) {
    headers['Cache-Control'] = 'no-cache, must-revalidate';
  } else {
    headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  }

  return headers;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`);
  const localPath = stripBasePath(url.pathname);
  const healthPaths = new Set(['/health', '/api/health', '/plugin/health']);

  if (healthPaths.has(url.pathname) || (localPath && healthPaths.has(localPath))) {
    sendJson(res, 200, {
      success: true,
      data: {
        status: 'ok',
        plugin: 'webgl-preview',
        publicDirExists: fs.existsSync(root),
        deploymentBasePath: basePath,
      },
    });
    return;
  }

  if (localPath === null) {
    sendJson(res, 404, { success: false, error: 'Outside configured base path' });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { success: false, error: 'Method not allowed' });
    return;
  }

  if (
    localPath === '/__xrugc_proxy__' ||
    localPath === '/api/snapshot' ||
    localPath === '/__xrugc_scene_resource__'
  ) {
    sendJson(res, 404, { success: false, error: 'Endpoint removed' });
    return;
  }

  if (localPath === '/runtime-config.json') {
    try {
      sendJson(res, 200, loadRuntimeConfig());
    } catch (error) {
      sendJson(res, 500, {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  const requestedPath =
    localPath === '/plugin/manifest' ? '/plugin/manifest.json' : localPath;
  const resolved = resolveFile(requestedPath);
  if (!resolved.target) {
    sendJson(res, resolved.status, {
      success: false,
      error: resolved.status === 403 ? 'Forbidden' : 'Not found',
    });
    return;
  }

  const headers = staticHeaders(resolved.target);
  const stat = fs.statSync(resolved.target);
  headers['Content-Length'] = stat.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(resolved.target).pipe(res);
});

server.listen(port, host, () => {
  console.log(
    `webgl-preview static server listening on http://${host}:${port}${basePath}`
  );
});
