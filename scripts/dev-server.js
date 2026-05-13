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
]);

function sendJson(res, data) {
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
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

  if (target.endsWith('.wasm.gz')) {
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

