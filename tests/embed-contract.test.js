const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const embed = fs.readFileSync(
  path.resolve(__dirname, '..', 'public/embed.html'),
  'utf8'
);

test('runner messages are source, origin, and run-session bound', () => {
  assert.match(embed, /event\.source === window\.parent/);
  assert.match(embed, /event\.origin === webPreviewParentOrigin/);
  assert.match(embed, /message\.session === webPreviewSession/);
  assert.match(embed, /window\.parent\.postMessage\(message, webPreviewParentOrigin\)/);
  assert.doesNotMatch(embed, /postMessage\([^;]+,\s*["']\*["']\s*\)/s);
});

test('runner does not rewrite scene assets through a generic proxy', () => {
  assert.doesNotMatch(embed, /__xrugc_proxy__/);
  assert.doesNotMatch(embed, /function\s+toProxyUrl/);
  assert.doesNotMatch(embed, /protocol\s*=\s*["']https:["']/);
  assert.match(embed, /return clonePayload\(payload\)/);
});

test('cache warming cannot block Unity startup', () => {
  assert.match(embed, /warmWebPreviewCache\(\);/);
  assert.match(embed, /loadWebPreviewBuildManifest\(\)\.then/);
  assert.match(embed, /applyWebPreviewBuildFiles\(byRole\)/);
  assert.match(embed, /startUnityWebPreview\(\);/);
  assert.doesNotMatch(embed, /webPreviewCacheReady\.then/);
});

test('runner loads every Unity artifact from one validated build manifest', () => {
  assert.match(embed, /schemaVersion !== 1/);
  assert.match(embed, /webPreviewBuildCacheVersion = manifest\.buildId/);
  assert.match(embed, /loaderUrl = withBuildCacheVersion\(byRole\.loader\)/);
  assert.match(embed, /config\.dataUrl = withBuildCacheVersion\(byRole\.data\)/);
  assert.match(embed, /config\.frameworkUrl = withBuildCacheVersion\(byRole\.framework\)/);
  assert.match(embed, /config\.codeUrl = withBuildCacheVersion\(byRole\.wasm\)/);
  assert.doesNotMatch(embed, /2026\.05\.21\.13/);
});

test('runner exposes a session-bound Quit lifecycle and deterministic errors', () => {
  assert.match(embed, /message\.type === ["']webgl-preview-dispose["']/);
  assert.match(embed, /typeof instance\.Quit === ["']function["']/);
  assert.match(embed, /type: ["']webgl-preview-disposed["']/);
  assert.match(embed, /WGP-UNITY-LOADER/);
  assert.match(embed, /WGP-UNITY-START/);
  assert.doesNotMatch(embed, /alert\s*\(/);
});

test('runner caps device pixel ratio and keeps zoom available', () => {
  assert.match(embed, /configuredMaxDevicePixelRatio = 2/);
  assert.match(embed, /config\.devicePixelRatio = Math\.min/);
  assert.match(embed, /user-scalable=yes/);
  assert.doesNotMatch(embed, /user-scalable=no/);
});
