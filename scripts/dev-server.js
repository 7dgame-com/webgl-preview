const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'public');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || '3006');

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.wasm', 'application/wasm'],
  ['.br', 'application/octet-stream'],
  ['.gz', 'application/octet-stream'],
]);

const proxyRequestHeaders = [
  'accept',
  'accept-language',
  'range',
  'if-range',
  'user-agent',
];

const skippedProxyResponseHeaders = new Set([
  'access-control-allow-credentials',
  'access-control-allow-headers',
  'access-control-allow-methods',
  'access-control-allow-origin',
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function sendJson(res, data) {
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function sendProxyError(res, status, message) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify({
    success: false,
    error: message,
  }));
}

function buildProxyHeaders(req) {
  const headers = {};
  for (const name of proxyRequestHeaders) {
    const value = req.headers[name];
    if (value) headers[name] = value;
  }

  headers['accept-encoding'] = 'identity';
  return headers;
}

async function proxyRemoteAsset(req, res, proxyUrl) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, If-Range, Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendProxyError(res, 405, 'Method not allowed');
    return;
  }

  let targetUrl;
  try {
    targetUrl = new URL(proxyUrl);
  } catch {
    sendProxyError(res, 400, 'Invalid proxy url');
    return;
  }

  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    sendProxyError(res, 400, 'Only http and https proxy urls are supported');
    return;
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: buildProxyHeaders(req),
      redirect: 'follow',
    });
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    };

    upstream.headers.forEach((value, key) => {
      if (!skippedProxyResponseHeaders.has(key.toLowerCase())) {
        headers[key] = value;
      }
    });

    res.writeHead(upstream.status, headers);
    if (req.method === 'HEAD' || !upstream.body) {
      res.end();
      return;
    }

    const reader = upstream.body.getReader();
    const pump = () => reader.read().then(({ done, value }) => {
      if (done) {
        res.end();
        return;
      }

      res.write(Buffer.from(value), pump);
    });

    pump().catch((error) => {
      res.destroy(error);
    });
  } catch (error) {
    sendProxyError(res, 502, `Proxy request failed: ${error.message}`);
  }
}

function resolveFile(urlPath) {
  const requested = urlPath === '/' ? '/embed.html' : urlPath;
  const target = path.resolve(root, `.${decodeURIComponent(requested)}`);
  if (!target.startsWith(root)) return null;
  if (fs.existsSync(target) && fs.statSync(target).isFile()) return target;
  return path.join(root, 'embed.html');
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`);

  if (url.pathname === '/__xrugc_proxy__') {
    proxyRemoteAsset(req, res, url.searchParams.get('url') || '');
    return;
  }

  if (url.pathname === '/api/health' || url.pathname === '/plugin/health') {
    sendJson(res, {
      success: true,
      data: {
        status: 'ok',
        plugin: 'webgl-preview',
        publicDirExists: fs.existsSync(root),
      },
    });
    return;
  }

  if (url.pathname === '/plugin/manifest') {
    const manifest = fs.readFileSync(path.join(root, 'plugin', 'manifest.json'), 'utf8');
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(manifest);
    return;
  }

  const target = resolveFile(url.pathname);
  if (!target) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const headers = {
    'Content-Type': contentTypes.get(path.extname(target)) || 'application/octet-stream',
    'Cross-Origin-Embedder-Policy': 'credentialless',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Access-Control-Allow-Origin': '*',
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

  res.writeHead(200, headers);
  fs.createReadStream(target).pipe(res);
});

server.listen(port, host, () => {
  console.log(`webgl-preview static server listening on http://${host}:${port}`);
});
