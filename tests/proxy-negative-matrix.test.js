const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const removedEndpoints = [
  '/__xrugc_proxy__',
  '/api/snapshot',
  '/__xrugc_scene_resource__',
];

const hostileTargets = (trapPort) => [
  ['loopback', `http://127.0.0.1:${trapPort}/loopback`],
  ['hostname-resolution', `http://localhost:${trapPort}/hostname`],
  ['dns-rebinding-shape', `http://127.0.0.1.nip.io:${trapPort}/rebind`],
  ['redirect-to-private', `http://127.0.0.1:${trapPort}/redirect`],
  ['decimal-ip', `http://2130706433:${trapPort}/decimal`],
  ['hex-ip', `http://0x7f000001:${trapPort}/hex`],
  ['octal-ip', `http://0177.0.0.1:${trapPort}/octal`],
  ['encoded-ip', `http://%31%32%37.0.0.1:${trapPort}/encoded`],
  ['userinfo-confusion', `http://public.example@127.0.0.1:${trapPort}/userinfo`],
  ['rfc1918', 'http://10.0.0.1/private'],
  ['link-local-metadata', 'http://169.254.169.254/latest/meta-data'],
  ['ipv6-loopback', 'http://[::1]/private'],
];

const listen = (server) =>
  new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });

const close = (server) =>
  new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );

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

async function waitUntilReady(origin, child) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`dev server exited early with ${child.exitCode}`);
    }
    try {
      const response = await fetch(`${origin}/health`);
      if (response.ok) return;
    } catch {
      // The listener may not be bound yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`dev server did not become ready: ${origin}`);
}

async function stopChild(child) {
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 1000);
    timeout.unref();
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
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
    await waitUntilReady(origin, child);
    await callback(origin);
  } finally {
    await stopChild(child);
  }
}

for (const basePath of ['/', '/webgl-preview/']) {
  test(`dev ${basePath}: removed proxy endpoints reject the hostile matrix without an upstream request`, async () => {
    const hits = [];
    const trap = http.createServer((request, response) => {
      hits.push(request.url);
      if (request.url === '/redirect') {
        response.writeHead(302, { location: 'http://10.0.0.1/private' });
      } else {
        response.writeHead(204);
      }
      response.end();
    });
    const trapPort = await listen(trap);
    const prefix = basePath === '/' ? '' : '/webgl-preview';

    try {
      await withDevServer(basePath, async (origin) => {
        for (const endpoint of removedEndpoints) {
          for (const [label, target] of hostileTargets(trapPort)) {
            const response = await fetch(
              `${origin}${prefix}${endpoint}?url=${encodeURIComponent(target)}`,
              { redirect: 'manual' }
            );
            assert.equal(
              response.status,
              404,
              `${basePath} ${endpoint} must reject ${label}`
            );
            assert.deepEqual(await response.json(), {
              success: false,
              error: 'Endpoint removed',
            });
          }
        }
      });
      await new Promise((resolve) => setTimeout(resolve, 25));
      assert.deepEqual(hits, [], 'no loopback/redirect trap request is allowed');
    } finally {
      await close(trap);
    }
  });
}

test('production exact-location boundary rejects the same matrix before dispatch', async () => {
  const nginx = fs.readFileSync(path.join(root, 'nginx.conf'), 'utf8');
  const exact404 = new Set(
    [...nginx.matchAll(/location\s*=\s*([^\s{]+)\s*\{([^}]*)\}/g)]
      .filter((match) => /return\s+404\s*;/.test(match[2]))
      .map((match) => match[1])
  );
  assert.doesNotMatch(nginx, /proxy_pass\s+\$arg_url/);
  assert.deepEqual(
    removedEndpoints.filter((endpoint) => exact404.has(endpoint)),
    removedEndpoints
  );

  let upstreamDispatches = 0;
  const dispatch = async (requestUrl, prefix = '') => {
    const url = new URL(requestUrl);
    const pathWithoutPrefix = prefix && url.pathname.startsWith(`${prefix}/`)
      ? url.pathname.slice(prefix.length)
      : url.pathname;
    if (exact404.has(pathWithoutPrefix)) return new Response(null, { status: 404 });
    upstreamDispatches += 1;
    return new Response(null, { status: 502 });
  };

  for (const prefix of ['', '/webgl-preview']) {
    for (const endpoint of removedEndpoints) {
      for (const [label, target] of hostileTargets(1)) {
        const response = await dispatch(
          `https://preview.test${prefix}${endpoint}?url=${encodeURIComponent(target)}`,
          prefix
        );
        assert.equal(response.status, 404, `${prefix || '/'} ${endpoint}: ${label}`);
      }
    }
  }
  assert.equal(upstreamDispatches, 0);
});
