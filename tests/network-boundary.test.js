const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

async function waitUntilReady(url, child) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`dev server exited early with ${child.exitCode}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The listener may not be bound yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`dev server did not become ready: ${url}`);
}

async function withDevServer(basePath, callback, extraEnv = {}) {
  const port = await getFreePort();
  const child = spawn(process.execPath, ['scripts/dev-server.js'], {
    cwd: root,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      BASE_PATH: basePath,
      ...extraEnv,
    },
    stdio: 'ignore',
  });
  const origin = `http://127.0.0.1:${port}`;

  try {
    await waitUntilReady(`${origin}/health`, child);
    await callback(origin);
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      if (child.exitCode !== null) {
        resolve();
        return;
      }
      child.once('exit', resolve);
      setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 1000).unref();
    });
  }
}

test('production nginx permanently removes arbitrary proxy behavior', () => {
  const nginx = fs.readFileSync(path.join(root, 'nginx.conf'), 'utf8');
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  const securityHeaders = fs.readFileSync(
    path.join(root, 'nginx-security-headers.conf'),
    'utf8'
  );

  assert.doesNotMatch(nginx, /proxy_pass\s+\$arg_url/);
  assert.match(nginx, /location = \/__xrugc_proxy__ \{\s*return 404;/);
  assert.match(nginx, /location = \/api\/snapshot \{\s*return 404;/);
  assert.match(nginx, /location = \/__xrugc_scene_resource__ \{\s*return 404;/);
  assert.ok(
    nginx.includes(
      'location ~* \\.[a-z0-9][a-z0-9.-]*$ {\n    try_files $uri =404;'
    )
  );
  assert.match(nginx, /location = \/runtime-config\.json/);
  assert.match(nginx, /location = \/build-manifest\.json/);
  assert.match(nginx, /location = \/artifact-compatibility\.json/);
  assert.match(nginx, /location = \/modules\/sw-build-cache\.js/);
  assert.match(
    nginx,
    /location = \/runtime-config\.json \{\s*include \/etc\/nginx\/snippets\/webgl-preview-security-headers\.conf;/
  );
  assert.match(securityHeaders, /Cross-Origin-Embedder-Policy credentialless/);
  assert.match(securityHeaders, /Cross-Origin-Opener-Policy same-origin/);
  assert.match(securityHeaders, /X-Content-Type-Options nosniff/);

  const aliasStart = nginx.indexOf(
    'location ~ ^/platform-api/v1/verses(?:/[1-9][0-9]*)?$'
  );
  const aliasEnd = nginx.indexOf(
    '# Extensionless unknown routes normally fall back to the Shell',
    aliasStart
  );
  assert.ok(aliasStart > 0 && aliasEnd > aliasStart, 'fixed alias block exists');
  const alias = nginx.slice(aliasStart, aliasEnd);
  assert.match(alias, /limit_except GET/);
  assert.match(alias, /proxy_pass \$\{HOST_API_BASE\};/);
  assert.match(alias, /proxy_pass_request_headers off;/);
  assert.match(alias, /proxy_ssl_verify on;/);
  assert.match(alias, /proxy_ssl_trusted_certificate \/etc\/ssl\/certs\/ca-certificates\.crt;/);
  assert.match(alias, /proxy_hide_header Set-Cookie;/);
  assert.match(alias, /proxy_hide_header Location;/);
  assert.match(alias, /add_header Cache-Control "no-store" always;/);
  assert.doesNotMatch(alias, /Access-Control-Allow-Origin \*/);
  assert.doesNotMatch(alias, /proxy_set_header (?:Origin|Cookie)\b/);

  const forwardedHeaders = [...alias.matchAll(/proxy_set_header\s+(\S+)\s+([^;]+);/g)]
    .filter((match) => match[2].trim() !== '""')
    .map((match) => match[1]);
  assert.deepEqual(forwardedHeaders, ['Host', 'Accept', 'Authorization']);
  assert.match(nginx, /location = \/platform-api \{\s*return 404;/);
  assert.match(nginx, /location \/platform-api\/ \{\s*return 404;/);
  assert.match(
    nginx,
    /location @platform_api_redirect_denied \{[\s\S]*?add_header Cache-Control "no-store" always;[\s\S]*?return 502;/
  );
  assert.match(dockerfile, /NGINX_ENVSUBST_FILTER="\^HOST_API_BASE\$"/);
  assert.match(
    dockerfile,
    /COPY nginx\.conf \/etc\/nginx\/templates\/default\.conf\.template/
  );
  assert.deepEqual(
    [...nginx.matchAll(/proxy_pass\s+([^;]+);/g)].map((match) => match[1]),
    ['${HOST_API_BASE}']
  );
});

test('HOST_API_BASE validator accepts exact HTTPS origins and rejects template injection', () => {
  const script = path.join(root, 'scripts/validate-host-api-base.sh');
  for (const value of [
    'https://d.dev.xrugc.com',
    'https://xrugc.com:8443',
    'https://127.0.0.1:9',
  ]) {
    const result = spawnSync('sh', [script], {
      env: { ...process.env, HOST_API_BASE: value },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, `${value}: ${result.stderr}`);
  }

  for (const value of [
    '',
    'http://d.dev.xrugc.com',
    'https://user:secret@d.dev.xrugc.com',
    'https://d.dev.xrugc.com/api',
    'https://d.dev.xrugc.com?x=1',
    'https://d..dev.xrugc.com',
    'https://d.dev.xrugc.com:0',
    'https://d.dev.xrugc.com:65536',
    'https://d.dev.xrugc.com; return 200',
    'https://d.dev.xrugc.com\nproxy_pass http://127.0.0.1',
    'https://${host}',
  ]) {
    const result = spawnSync('sh', [script], {
      env: { ...process.env, HOST_API_BASE: value },
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0, `${value} must be rejected`);
  }
});

test('manifest entries remain relative to the plugin registration root', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'public/plugin/manifest.json'), 'utf8')
  );

  assert.equal(manifest.entry.frontend, './index.html');
  assert.equal(manifest.entry.runner, './embed.html');
});

test('development server serves an isolated subpath without proxy fallthrough', async () => {
  await withDevServer('/webgl-preview/', async (origin) => {
    const page = await fetch(`${origin}/webgl-preview/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /WebGL/);

    const css = await fetch(`${origin}/webgl-preview/styles/plugin-runner.css`);
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type') || '', /^text\/css/);

    const manifestResponse = await fetch(`${origin}/webgl-preview/plugin/manifest`);
    assert.equal(manifestResponse.status, 200);
    const manifest = await manifestResponse.json();
    assert.equal(manifest.entry.frontend, './index.html');

    const configResponse = await fetch(`${origin}/webgl-preview/runtime-config.json`);
    assert.equal(configResponse.status, 200);
    const config = await configResponse.json();
    assert.equal(config.development, true);
    assert.equal(config.deploymentBasePath, '/webgl-preview/');
    assert.equal(config.allowManualSceneId, true);

    const proxy = await fetch(
      `${origin}/webgl-preview/__xrugc_proxy__?url=http://127.0.0.1:1/private`
    );
    assert.equal(proxy.status, 404);
    assert.deepEqual(await proxy.json(), {
      success: false,
      error: 'Endpoint removed',
    });

    const snapshot = await fetch(`${origin}/webgl-preview/api/snapshot`);
    assert.equal(snapshot.status, 404);

    const sceneResource = await fetch(
      `${origin}/webgl-preview/__xrugc_scene_resource__?url=https://example.com`
    );
    assert.equal(sceneResource.status, 404);

    const escapedStatic = await fetch(`${origin}/styles/plugin-runner.css`);
    assert.equal(escapedStatic.status, 404);

    const missingStatic = await fetch(`${origin}/webgl-preview/missing.js`);
    assert.equal(missingStatic.status, 404);
  });
});

test('development server still supports root deployment', async () => {
  await withDevServer('/', async (origin) => {
    assert.equal((await fetch(`${origin}/`)).status, 200);
    assert.equal((await fetch(`${origin}/plugin/manifest`)).status, 200);
    assert.equal((await fetch(`${origin}/__xrugc_proxy__?url=https://example.com`)).status, 404);
  });
});

test('development fixed API alias forwards only authorized Verse reads', async () => {
  const hits = [];
  const upstream = http.createServer((request, response) => {
    hits.push({
      method: request.method,
      url: request.url,
      headers: { ...request.headers },
    });
    if (request.url?.startsWith('/api/v1/verses/9')) {
      response.writeHead(302, {
        Location: 'http://127.0.0.1/private',
        'Set-Cookie': 'upstream=secret',
      });
      response.end();
      return;
    }
    const body = JSON.stringify([{ id: 7, name: 'Scene' }]);
    response.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Set-Cookie': 'upstream=secret',
      'Access-Control-Allow-Origin': '*',
      'X-Pagination-Current-Page': '1',
      'X-Pagination-Page-Count': '1',
      'X-Pagination-Per-Page': '20',
      'X-Pagination-Total-Count': '1',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  });
  await new Promise((resolve, reject) => {
    upstream.once('error', reject);
    upstream.listen(0, '127.0.0.1', resolve);
  });
  const address = upstream.address();
  assert.ok(address && typeof address !== 'string');
  const upstreamBase = `http://127.0.0.1:${address.port}/api`;

  try {
    for (const basePath of ['/', '/webgl-preview/']) {
      const prefix = basePath === '/' ? '' : '/webgl-preview';
      await withDevServer(
        basePath,
        async (origin) => {
          const list = await fetch(
            `${origin}${prefix}/platform-api/v1/verses?page=1`,
            {
              headers: {
                Accept: 'application/json',
                Authorization: 'Bearer memory-token',
                Cookie: 'browser=session',
                Origin: 'https://untrusted.example',
              },
              redirect: 'manual',
            }
          );
          assert.equal(list.status, 200);
          assert.equal(list.headers.get('cache-control'), 'no-store');
          assert.equal(list.headers.get('set-cookie'), null);
          assert.equal(list.headers.get('access-control-allow-origin'), null);
          assert.equal(list.headers.get('x-pagination-total-count'), '1');

          const listHit = hits.at(-1);
          assert.equal(listHit.method, 'GET');
          assert.equal(listHit.url, '/api/v1/verses?page=1');
          assert.equal(listHit.headers.authorization, 'Bearer memory-token');
          assert.equal(listHit.headers.accept, 'application/json');
          assert.equal(listHit.headers.cookie, undefined);
          assert.equal(listHit.headers.origin, undefined);

          const detail = await fetch(
            `${origin}${prefix}/platform-api/v1/verses/8`,
            { method: 'HEAD' }
          );
          assert.equal(detail.status, 200);
          assert.equal(hits.at(-1).method, 'HEAD');
          assert.equal(hits.at(-1).url, '/api/v1/verses/8');

          const redirect = await fetch(
            `${origin}${prefix}/platform-api/v1/verses/9`,
            { redirect: 'manual' }
          );
          assert.equal(redirect.status, 502);
          assert.equal(redirect.headers.get('location'), null);
          assert.equal(redirect.headers.get('set-cookie'), null);

          for (const pathname of [
            '/platform-api',
            '/platform-api/v1/users',
            '/platform-api/v1/verses/0',
            '/platform-api/v1/verses/1/extra',
            '/platform-api/http://127.0.0.1/private',
          ]) {
            const before = hits.length;
            const response = await fetch(`${origin}${prefix}${pathname}`);
            assert.equal(response.status, 404, pathname);
            assert.equal(hits.length, before, `${pathname} must not reach upstream`);
          }

          const beforePost = hits.length;
          const post = await fetch(
            `${origin}${prefix}/platform-api/v1/verses`,
            { method: 'POST' }
          );
          assert.equal(post.status, 405);
          assert.equal(hits.length, beforePost, 'POST must not reach upstream');
        },
        { PLATFORM_API_BASE: upstreamBase }
      );
    }
  } finally {
    await new Promise((resolve) => upstream.close(resolve));
  }
});
