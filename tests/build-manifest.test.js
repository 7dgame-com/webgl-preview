const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const zlib = require('node:zlib');
const {
  createBuildManifest,
  verifyBuildManifest,
} = require('../scripts/build-manifest');
const {
  isPinnedImage,
  resolveBaseImage,
} = require('../scripts/check-base-image');
const {
  verifyArtifactCompatibility,
} = require('../scripts/check-artifact-compatibility');

const makeBuildFixture = () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'webgl-build-'));
  const rootDir = path.join(fixture, 'public');
  const buildDir = path.join(rootDir, 'Build');
  fs.mkdirSync(buildDir, { recursive: true });
  fs.writeFileSync(path.join(buildDir, 'public.loader.js'), 'x'.repeat(2048));
  for (const name of [
    'public.data.gz',
    'public.framework.js.gz',
    'public.wasm.gz',
  ]) {
    fs.writeFileSync(
      path.join(buildDir, name),
      zlib.gzipSync(crypto.randomBytes(4096))
    );
  }
  return { fixture, rootDir, buildDir };
};

test('manifest describes and verifies the exact compressed Unity artifacts', async (t) => {
  const { fixture, rootDir } = makeBuildFixture();
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));

  const manifest = await createBuildManifest({ rootDir });
  const manifestPath = path.join(rootDir, 'build-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));

  assert.match(manifest.buildId, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(
    manifest.files.map((file) => file.role),
    ['loader', 'data', 'framework', 'wasm']
  );
  assert.deepEqual(
    manifest.files.map((file) => file.contentEncoding),
    ['identity', 'gzip', 'gzip', 'gzip']
  );
  for (const file of manifest.files) {
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.match(file.responseSha256, /^[a-f0-9]{64}$/);
  }
  assert.equal(
    manifest.files.find((file) => file.role === 'loader').responseSha256,
    manifest.files.find((file) => file.role === 'loader').sha256
  );
  assert.notEqual(
    manifest.files.find((file) => file.role === 'data').responseSha256,
    manifest.files.find((file) => file.role === 'data').sha256
  );
  assert.equal(
    manifest.totalSize,
    manifest.files.reduce((total, file) => total + file.size, 0)
  );
  await verifyBuildManifest({ rootDir, manifestPath });
});

test('verification rejects a changed final artifact', async (t) => {
  const { fixture, rootDir, buildDir } = makeBuildFixture();
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const manifestPath = path.join(rootDir, 'build-manifest.json');
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(await createBuildManifest({ rootDir }))
  );

  fs.appendFileSync(path.join(buildDir, 'public.loader.js'), 'tampered');
  await assert.rejects(
    verifyBuildManifest({ rootDir, manifestPath }),
    /Manifest mismatch|buildId mismatch/
  );
});

test('final verification rejects a missing decoded response digest', async (t) => {
  const { fixture, rootDir } = makeBuildFixture();
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const manifest = await createBuildManifest({ rootDir });
  manifest.files.find((file) => file.contentEncoding === 'gzip').responseSha256 = null;
  const manifestPath = path.join(rootDir, 'build-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));

  await assert.rejects(
    verifyBuildManifest({ rootDir, manifestPath }),
    /responseSha256/
  );
});

test('strict image verification rejects Git LFS pointer files', async (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'webgl-lfs-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const rootDir = path.join(fixture, 'public');
  const buildDir = path.join(rootDir, 'Build');
  fs.mkdirSync(buildDir, { recursive: true });
  fs.writeFileSync(path.join(buildDir, 'public.loader.js'), 'x'.repeat(2048));
  for (const name of [
    'public.data.gz',
    'public.framework.js.gz',
    'public.wasm.gz',
  ]) {
    fs.writeFileSync(
      path.join(buildDir, name),
      `version https://git-lfs.github.com/spec/v1\noid sha256:${'a'.repeat(64)}\nsize 4096\n`
    );
  }

  const manifestPath = path.join(rootDir, 'build-manifest.json');
  const sourceManifest = await createBuildManifest({
    rootDir,
    allowLfsMetadata: true,
  });
  assert.equal(
    sourceManifest.files.find((file) => file.role === 'loader').responseSha256,
    sourceManifest.files.find((file) => file.role === 'loader').sha256
  );
  for (const file of sourceManifest.files.filter(
    (candidate) => candidate.contentEncoding !== 'identity'
  )) {
    assert.equal(file.responseSha256, null);
  }
  fs.writeFileSync(manifestPath, JSON.stringify(sourceManifest));
  await assert.rejects(
    verifyBuildManifest({ rootDir, manifestPath }),
    /Git LFS pointer/
  );
});

test('generation rejects a truncated compressed artifact', async (t) => {
  const { fixture, rootDir, buildDir } = makeBuildFixture();
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const dataPath = path.join(buildDir, 'public.data.gz');
  const data = fs.readFileSync(dataPath);
  fs.writeFileSync(dataPath, data.subarray(0, Math.floor(data.length / 2)));

  await assert.rejects(
    createBuildManifest({ rootDir }),
    /Compressed artifact is invalid/
  );
});

test('publishing base-image policy accepts only immutable digest references', () => {
  assert.equal(
    isPinnedImage(
      `hkccr.ccs.tencentyun.com/plugins/webgl-preview@sha256:${'b'.repeat(64)}`
    ),
    true
  );
  assert.equal(
    isPinnedImage('hkccr.ccs.tencentyun.com/plugins/webgl-preview:sha-af78e00'),
    false
  );
  assert.equal(
    resolveBaseImage({
      dockerfilePath: path.resolve(__dirname, '..', 'Dockerfile'),
      environment: { WEBGL_PREVIEW_BASE_IMAGE: 'registry/image@sha256:' + 'c'.repeat(64) },
    }),
    'registry/image@sha256:' + 'c'.repeat(64)
  );
});

test('release metadata approves only an explicit Shell and Unity build pair', (t) => {
  const sourceRoot = path.resolve(__dirname, '..', 'public');
  assert.deepEqual(verifyArtifactCompatibility({ rootDir: sourceRoot }), {
    previewShellVersion: '2026.08.01.2',
    unityBuildId:
      'sha256:7bee87bbf1c044802841b46489638cb5069eac5b51fb0637714a3b826b092f33',
  });
  assert.deepEqual(
    verifyArtifactCompatibility({
      rootDir: sourceRoot,
      baseImage:
        'hkccr.ccs.tencentyun.com/plugins/webgl-preview@sha256:1e03190d0b44ca204869461862859198a801edb3b4c1bf00e8ee5e8da1d9bfe5',
    }),
    {
      previewShellVersion: '2026.08.01.2',
      unityBuildId:
        'sha256:7bee87bbf1c044802841b46489638cb5069eac5b51fb0637714a3b826b092f33',
    }
  );
  assert.throws(
    () =>
      verifyArtifactCompatibility({
        rootDir: sourceRoot,
        baseImage: `registry.example.test/webgl@sha256:${'e'.repeat(64)}`,
      }),
    /Unapproved Preview Shell\/Unity combination/
  );

  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'webgl-compat-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  fs.mkdirSync(path.join(fixture, 'modules'), { recursive: true });
  fs.copyFileSync(
    path.join(sourceRoot, 'modules', 'plugin-runner.js'),
    path.join(fixture, 'modules', 'plugin-runner.js')
  );
  fs.copyFileSync(
    path.join(sourceRoot, 'artifact-compatibility.json'),
    path.join(fixture, 'artifact-compatibility.json')
  );
  const rejectedManifest = JSON.parse(
    fs.readFileSync(path.join(sourceRoot, 'build-manifest.json'), 'utf8')
  );
  rejectedManifest.buildId = `sha256:${'f'.repeat(64)}`;
  fs.writeFileSync(
    path.join(fixture, 'build-manifest.json'),
    JSON.stringify(rejectedManifest)
  );

  assert.throws(
    () => verifyArtifactCompatibility({ rootDir: fixture }),
    /Unapproved Preview Shell\/Unity combination/
  );
});
