const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const {
  BUILD_VERSION_MARKER,
  injectBuildVersion,
  isValidBuildVersion,
  verifyInjectedBuildVersion,
} = require('../scripts/inject-build-version');

const sourceRoot = path.resolve(__dirname, '..', 'public');

function makeShellFixture() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'webgl-version-'));
  const rootDir = path.join(fixture, 'public');
  fs.mkdirSync(path.join(rootDir, 'modules'), { recursive: true });
  fs.copyFileSync(
    path.join(sourceRoot, 'index.html'),
    path.join(rootDir, 'index.html')
  );
  fs.copyFileSync(
    path.join(sourceRoot, 'embed.html'),
    path.join(rootDir, 'embed.html')
  );
  fs.copyFileSync(
    path.join(sourceRoot, 'modules', 'plugin-runner.js'),
    path.join(rootDir, 'modules', 'plugin-runner.js')
  );
  return { fixture, rootDir };
}

test('build version injection updates UI text and both shell cache keys', (t) => {
  const { fixture, rootDir } = makeShellFixture();
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));

  assert.deepEqual(
    injectBuildVersion({
      rootDir,
      version: '2026.08.01-1842',
      required: true,
    }),
    { injected: true, version: '2026.08.01-1842' }
  );

  const index = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const runner = fs.readFileSync(
    path.join(rootDir, 'modules', 'plugin-runner.js'),
    'utf8'
  );
  const embed = fs.readFileSync(path.join(rootDir, 'embed.html'), 'utf8');
  assert.equal(index.includes(BUILD_VERSION_MARKER), false);
  assert.equal(embed.includes(BUILD_VERSION_MARKER), false);
  assert.equal(runner.includes(BUILD_VERSION_MARKER), false);
  assert.equal((index.match(/\?v=2026\.08\.01-1842/g) || []).length, 2);
  assert.equal((embed.match(/\?v=2026\.08\.01-1842/g) || []).length, 1);
  assert.match(
    runner,
    /^const WEBGL_PREVIEW_BUILD_VERSION = "2026\.08\.01-1842";$/m
  );
  assert.deepEqual(verifyInjectedBuildVersion({ rootDir }), {
    version: '2026.08.01-1842',
  });
});

test('release injection fails closed for a missing or malformed version', (t) => {
  const { fixture, rootDir } = makeShellFixture();
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));

  assert.throws(
    () => injectBuildVersion({ rootDir, version: '', required: true }),
    /required for release builds/
  );
  for (const invalid of [
    '2026.08.01.4',
    '2026.13.01-1200',
    '2026.08.32-1200',
    '2026.08.01-2400',
    '2026.08.01-1260',
    '2026.02.31-1200',
  ]) {
    assert.throws(
      () => injectBuildVersion({ rootDir, version: invalid, required: true }),
      /YYYY\.MM\.DD-HHmm/
    );
  }
  assert.equal(isValidBuildVersion('2028.02.29-2359'), true);
  assert.equal(isValidBuildVersion('2026.02.29-2359'), false);
});

test('injection verifies every expected marker before writing any file', (t) => {
  const { fixture, rootDir } = makeShellFixture();
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const runnerPath = path.join(rootDir, 'modules', 'plugin-runner.js');
  fs.writeFileSync(
    runnerPath,
    fs.readFileSync(runnerPath, 'utf8').replace(BUILD_VERSION_MARKER, 'missing')
  );

  assert.throws(
    () =>
      injectBuildVersion({
        rootDir,
        version: '2026.08.01-1842',
        required: true,
      }),
    /plugin-runner\.js must contain 1 build-version marker/
  );
  assert.equal(
    fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8').includes(
      BUILD_VERSION_MARKER
    ),
    true
  );
  assert.throws(
    () => verifyInjectedBuildVersion({ rootDir }),
    /uninjected build-version marker/
  );
});
