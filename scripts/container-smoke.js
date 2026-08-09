#!/usr/bin/env node

const assert = require('node:assert/strict');

const defaultBaseUrl = String(process.argv[2] || 'http://127.0.0.1:3006').replace(
  /\/+$/,
  ''
);

const request = (baseUrl, pathname, init) => fetch(`${baseUrl}${pathname}`, init);

const removedProxyEndpoints = [
  '/__xrugc_proxy__',
  '/api/snapshot',
  '/__xrugc_scene_resource__',
];

const hostileProxyTargets = [
  ['loopback', 'http://127.0.0.1/private'],
  ['hostname-resolution', 'http://localhost/private'],
  ['dns-rebinding-shape', 'http://127.0.0.1.nip.io/private'],
  ['redirect-to-private', 'http://127.0.0.1/redirect?to=http://10.0.0.1/private'],
  ['decimal-ip', 'http://2130706433/private'],
  ['hex-ip', 'http://0x7f000001/private'],
  ['octal-ip', 'http://0177.0.0.1/private'],
  ['encoded-ip', 'http://%31%32%37.0.0.1/private'],
  ['userinfo-confusion', 'http://public.example@127.0.0.1/private'],
  ['rfc1918', 'http://10.0.0.1/private'],
  ['link-local-metadata', 'http://169.254.169.254/latest/meta-data'],
  ['ipv6-loopback', 'http://[::1]/private'],
];

async function waitForHealth(baseUrl) {
  const deadline = Date.now() + 30000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await request(baseUrl, '/api/health', { cache: 'no-store' });
      if (response.ok) return response.json();
      lastError = new Error(`health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError || new Error('container health timed out');
}

async function expectStatus(baseUrl, pathname, status, init = {}) {
  const response = await request(baseUrl, pathname, {
    redirect: 'manual',
    ...init,
  });
  assert.equal(response.status, status, `${pathname} should return ${status}`);
  return response;
}

async function expectRemovedProxyMatrix(baseUrl) {
  for (const endpoint of removedProxyEndpoints) {
    for (const [label, target] of hostileProxyTargets) {
      await expectStatus(
        baseUrl,
        `${endpoint}?url=${encodeURIComponent(target)}&case=${encodeURIComponent(label)}`,
        404
      );
    }
  }
}

function assertSecurityHeaders(response, label) {
  assert.equal(
    response.headers.get('cross-origin-embedder-policy'),
    'credentialless',
    `${label} COEP`
  );
  assert.equal(
    response.headers.get('cross-origin-opener-policy'),
    'same-origin',
    `${label} COOP`
  );
  assert.equal(
    response.headers.get('cross-origin-resource-policy'),
    'cross-origin',
    `${label} CORP`
  );
  assert.equal(
    response.headers.get('x-content-type-options'),
    'nosniff',
    `${label} nosniff`
  );
  assert.equal(
    response.headers.get('referrer-policy'),
    'no-referrer',
    `${label} referrer policy`
  );
  assert.match(
    response.headers.get('permissions-policy') || '',
    /camera=\(\), microphone=\(\), geolocation=\(\)/,
    `${label} permissions policy`
  );
}

async function main(baseUrl = defaultBaseUrl) {
  const health = await waitForHealth(baseUrl);
  assert.equal(health.success, true);
  assert.equal(health.data?.plugin, 'webgl-preview');

  const shell = await expectStatus(baseUrl, '/', 200);
  assertSecurityHeaders(shell, 'shell');
  assert.match(shell.headers.get('content-type') || '', /^text\/html/);
  const shellMarkup = await shell.text();
  assert.match(shellMarkup, /data-scene-picker/);

  const embed = await expectStatus(baseUrl, '/embed.html', 200);
  assertSecurityHeaders(embed, 'runner');
  assert.match(embed.headers.get('cache-control') || '', /no-cache/i);
  assert.match(embed.headers.get('content-type') || '', /^text\/html/);

  const embedParentProtocol = await expectStatus(
    baseUrl,
    '/modules/embed-parent-protocol.js',
    200
  );
  assertSecurityHeaders(embedParentProtocol, 'embed parent protocol');
  assert.match(
    embedParentProtocol.headers.get('content-type') || '',
    /^(application|text)\/javascript/
  );

  const serviceWorker = await expectStatus(baseUrl, '/sw.js', 200);
  assertSecurityHeaders(serviceWorker, 'service worker');
  assert.match(serviceWorker.headers.get('cache-control') || '', /no-cache/i);
  assert.match(
    serviceWorker.headers.get('content-type') || '',
    /^(application|text)\/javascript/
  );

  const serviceWorkerCore = await expectStatus(
    baseUrl,
    '/modules/sw-build-cache.js',
    200
  );
  assertSecurityHeaders(serviceWorkerCore, 'service worker cache core');
  assert.match(
    serviceWorkerCore.headers.get('cache-control') || '',
    /no-cache/i
  );

  const manifestResponse = await expectStatus(baseUrl, '/plugin/manifest', 200);
  assertSecurityHeaders(manifestResponse, 'plugin manifest');
  const pluginManifest = await manifestResponse.json();
  assert.equal(pluginManifest.entry?.frontend, './index.html');
  assert.equal(pluginManifest.entry?.runner, './embed.html');

  const runtimeResponse = await expectStatus(baseUrl, '/runtime-config.json', 200);
  assertSecurityHeaders(runtimeResponse, 'runtime config');
  assert.match(runtimeResponse.headers.get('cache-control') || '', /no-store/i);
  const runtime = await runtimeResponse.json();
  assert.equal(runtime.allowManualSceneId, false);
  assert.ok(Array.isArray(runtime.trustedHostOrigins));
  assert.ok(Array.isArray(runtime.platformApiOrigins));
  assert.ok(Array.isArray(runtime.assetOrigins));
  assert.equal(runtime.platformApiAlias, './platform-api');

  const platformApi = await expectStatus(
    baseUrl,
    '/platform-api/v1/verses?page=1',
    502,
    { headers: { Authorization: 'Bearer container-smoke' } }
  );
  assert.equal(platformApi.headers.get('cache-control'), 'no-store');
  assert.equal(platformApi.headers.get('access-control-allow-origin'), null);
  assert.equal(platformApi.headers.get('set-cookie'), null);
  assert.equal(platformApi.headers.get('location'), null);

  for (const pathname of [
    '/platform-api',
    '/platform-api/',
    '/platform-api/v1/users',
    '/platform-api/v1/verses/0',
    '/platform-api/v1/verses/1/extra',
    '/platform-api/http://127.0.0.1/private',
  ]) {
    await expectStatus(baseUrl, pathname, 404);
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    await expectStatus(baseUrl, '/platform-api/v1/verses', 403, { method });
  }

  const buildResponse = await expectStatus(baseUrl, '/build-manifest.json', 200);
  assertSecurityHeaders(buildResponse, 'build manifest');
  const build = await buildResponse.json();
  assert.match(build.buildId || '', /^sha256:[a-f0-9]{64}$/);
  assert.equal(build.files?.length, 4);
  assert.equal(
    build.totalSize,
    build.files.reduce((total, file) => total + file.size, 0),
    'manifest totalSize'
  );

  const compatibilityResponse = await expectStatus(
    baseUrl,
    '/artifact-compatibility.json',
    200
  );
  assertSecurityHeaders(compatibilityResponse, 'artifact compatibility');
  assert.match(
    compatibilityResponse.headers.get('cache-control') || '',
    /no-cache/i
  );
  const compatibility = await compatibilityResponse.json();
  const runnerResponse = await expectStatus(
    baseUrl,
    '/modules/plugin-runner.js',
    200
  );
  const runnerSource = await runnerResponse.text();
  const shellVersion = runnerSource.match(
    /^const WEBGL_PREVIEW_VERSION = ["']([^"']+)["'];$/m
  )?.[1];
  const buildVersion = runnerSource.match(
    /^const WEBGL_PREVIEW_BUILD_VERSION = ["']([^"']+)["'];$/m
  )?.[1];
  assert.ok(shellVersion, 'Preview Shell version must be declared');
  assert.match(
    buildVersion || '',
    /^\d{4}\.(?:0[1-9]|1[0-2])\.(?:0[1-9]|[12]\d|3[01])-(?:[01]\d|2[0-3])[0-5]\d$/,
    'final HTTP image must expose a precise Beijing build version'
  );
  assert.equal(
    shellMarkup.split(`?v=${buildVersion}`).length - 1,
    2,
    'shell assets must use the injected build version as their cache key'
  );
  assert.ok(
    compatibility.combinations?.some(
      (combination) =>
        combination.status === 'approved' &&
        combination.previewShellVersion === shellVersion &&
        /^sha256:[a-f0-9]{64}$/.test(combination.unityBuildId || '')
    ),
    'final HTTP image must expose release metadata for this Shell version'
  );

  for (const file of build.files) {
    const response = await request(baseUrl, `/${file.url}`, { method: 'HEAD' });
    assert.equal(response.status, 200, `${file.role} must exist in final image`);
    assertSecurityHeaders(response, file.role);
    assert.equal(
      response.headers.get('content-encoding') || 'identity',
      file.contentEncoding,
      `${file.role} content encoding`
    );
    assert.match(
      response.headers.get('content-type') || '',
      new RegExp(
        `^${file.contentType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
      ),
      `${file.role} content type`
    );
    const rawLength = response.headers.get('content-length');
    assert.match(rawLength || '', /^\d+$/, `${file.role} content length`);
    assert.equal(Number(rawLength), file.size, `${file.role} compressed size`);
    assert.match(
      response.headers.get('cache-control') || '',
      file.role === 'loader' ? /no-cache/i : /immutable/i,
      `${file.role} cache policy`
    );
  }

  const rangeFile = build.files.find((file) => file.role === 'data');
  assert.ok(rangeFile, 'data artifact is required for Range smoke');
  const rangeResponse = await request(baseUrl, `/${rangeFile.url}`, {
    headers: { Range: 'bytes=0-0' },
  });
  assert.equal(rangeResponse.status, 206, 'Unity data must support byte ranges');
  assert.equal(
    rangeResponse.headers.get('content-range'),
    `bytes 0-0/${rangeFile.size}`
  );
  assert.equal(rangeResponse.headers.get('content-length'), '1');
  await rangeResponse.body?.cancel();

  // These exact 404s are the production proof that URL parsing, DNS,
  // redirect handling, and upstream fetch are never reached for retired
  // arbitrary-proxy compatibility routes. The same smoke runs through the
  // strip-prefix harness, so both root and subpath delivery are covered.
  await expectRemovedProxyMatrix(baseUrl);
  await expectStatus(baseUrl, '/missing-static.js', 404);

  console.log(
    `webgl-preview container smoke passed (${build.buildId}, ${build.totalSize} bytes)`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  });
}

module.exports = { main };
