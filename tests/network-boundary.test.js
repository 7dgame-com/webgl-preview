const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
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

async function withDevServer(basePath, callback) {
  const port = await getFreePort();
  const child = spawn(process.execPath, ['scripts/dev-server.js'], {
    cwd: root,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      BASE_PATH: basePath,
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
  const securityHeaders = fs.readFileSync(
    path.join(root, 'nginx-security-headers.conf'),
    'utf8'
  );

  assert.doesNotMatch(nginx, /proxy_pass\s+\$arg_url/);
  assert.doesNotMatch(nginx, /proxy_set_header\s+Authorization/);
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
