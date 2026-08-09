const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const embed = fs.readFileSync(
  path.resolve(__dirname, '..', 'public/embed.html'),
  'utf8'
);
const parentProtocol = fs.readFileSync(
  path.resolve(__dirname, '..', 'public/modules/embed-parent-protocol.js'),
  'utf8'
);

test('runner messages use the source, origin, and epoch-bound transition protocol', () => {
  assert.match(embed, /embed-parent-protocol\.js\?v=__WEBGL_PREVIEW_BUILD_VERSION__/);
  assert.match(embed, /createEmbedParentProtocol/);
  assert.match(embed, /parentWindow: window\.parent/);
  assert.match(embed, /parentOrigin: window\.location\.origin/);
  assert.match(embed, /webPreviewParentProtocol\.accept\(event, message\)/);
  assert.match(parentProtocol, /event\.source === parentWindow/);
  assert.match(parentProtocol, /event\.origin === parentOrigin/);
  assert.match(parentProtocol, /message\.session === binding\.session/);
  assert.doesNotMatch(
    `${embed}\n${parentProtocol}`,
    /postMessage\([^;]+,\s*["']\*["']\s*\)/s
  );
});

test('runner does not rewrite scene assets through a generic proxy', () => {
  assert.doesNotMatch(embed, /__xrugc_proxy__/);
  assert.doesNotMatch(embed, /function\s+toProxyUrl/);
  assert.doesNotMatch(embed, /protocol\s*=\s*["']https:["']/);
  assert.match(embed, /return clonePayload\(payload\)/);
});

test('Unity waits for the registered worker controller but not cache warming', () => {
  const warmStart = embed.indexOf('function warmWebPreviewCache(controller)');
  const warmEnd = embed.indexOf('var webPreviewSceneVisibleNotified', warmStart);
  const warmSource = embed.slice(warmStart, warmEnd);

  assert.ok(warmStart > 0);
  assert.ok(warmEnd > warmStart);
  assert.match(embed, /worker\.state === "activated"[\s\S]+navigator\.serviceWorker\.controller === worker/);
  assert.match(embed, /prepareWebPreviewServiceWorker\(\)\.then\(function\(controller\)/);
  assert.match(embed, /warmWebPreviewCache\(controller\);\s*return loadWebPreviewBuildManifest\(\);/);
  assert.match(embed, /applyWebPreviewBuildFiles\(byRole\)/);
  assert.match(embed, /startUnityWebPreview\(\);/);
  assert.doesNotMatch(embed, /return warmWebPreviewCache\(controller\)/);
  assert.doesNotMatch(embed, /Cache warm timed out\. Starting Unity directly/);
  assert.match(embed, /Cache warm continues in the background/);
  assert.doesNotMatch(warmSource, /cancel-webgl-preview-cache/);
  assert.match(embed, /webPreviewUnityReady = true;[\s\S]+setWebPreviewLoading\(false\)/);
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

test('runner allows the production Unity package enough time to start on a cold cache', () => {
  assert.match(embed, /timeoutMs = 600000/);
  assert.match(embed, /Math\.min\(timeoutMs, 900000\)/);
});

test('runner caps device pixel ratio and keeps zoom available', () => {
  assert.match(embed, /configuredMaxDevicePixelRatio = 2/);
  assert.match(embed, /config\.devicePixelRatio = Math\.min/);
  assert.match(embed, /user-scalable=yes/);
  assert.doesNotMatch(embed, /user-scalable=no/);
});
