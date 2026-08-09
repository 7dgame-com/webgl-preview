const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const script = path.join(root, 'scripts/render-runtime-config.sh');
const sourceConfig = path.join(root, 'public/runtime-config.json');

function render(t, env = {}) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'webgl-runtime-config-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const template = path.join(fixture, 'template.json');
  const output = path.join(fixture, 'runtime-config.json');
  fs.copyFileSync(sourceConfig, template);
  const result = spawnSync('sh', [script, template, output], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, ...env },
  });
  return { output, result };
}

test('deployment inventory renders an exact declarative host allowlist', (t) => {
  const hosts = [
    'https://d.xiading.hxgxonline.com',
    'https://voxel.example',
    'https://brand.example',
  ];
  const { output, result } = render(t, {
    REQUIRE_TRUSTED_HOST_ORIGINS: '1',
    TRUSTED_HOST_ORIGINS_JSON: JSON.stringify(hosts),
  });

  assert.equal(result.status, 0, result.stderr);
  const source = JSON.parse(fs.readFileSync(sourceConfig, 'utf8'));
  const rendered = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.deepEqual(rendered.trustedHostOrigins, hosts);
  delete source.trustedHostOrigins;
  delete rendered.trustedHostOrigins;
  assert.deepEqual(rendered, source, 'only the host trust inventory may change');
});

test('required production inventory fails closed when it is absent', (t) => {
  const { output, result } = render(t, {
    REQUIRE_TRUSTED_HOST_ORIGINS: '1',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /TRUSTED_HOST_ORIGINS_JSON is required/);
  assert.equal(fs.existsSync(output), false);
});

test('optional local rendering preserves the reviewed default inventory', (t) => {
  const { output, result } = render(t);
  assert.equal(result.status, 0, result.stderr);
  const source = JSON.parse(fs.readFileSync(sourceConfig, 'utf8'));
  assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), source);
  assert.deepEqual(source.platformApiOrigins, [
    'https://xrugc.com',
    'https://d.xrugc.com',
    'https://d.dev.xrugc.com',
  ]);
  assert.ok(
    source.trustedHostOrigins.includes('https://d.xrugc.com'),
    'the current production host must not be dropped by promotion'
  );
});

test('runtime inventory rejects wildcard, non-canonical, duplicate, and URL-shaped entries', (t) => {
  for (const trustedHosts of [
    '[]',
    '["https://*.example.com"]',
    '["http://brand.example"]',
    '["https://Brand.example"]',
    '["https://brand.example/path"]',
    '["https://user@brand.example"]',
    '["https://brand.example:443"]',
    '["https://brand.example","https://brand.example"]',
    '["https://brand.example",]',
  ]) {
    const { result } = render(t, {
      REQUIRE_TRUSTED_HOST_ORIGINS: '1',
      TRUSTED_HOST_ORIGINS_JSON: trustedHosts,
    });
    assert.notEqual(result.status, 0, trustedHosts);
  }
});
