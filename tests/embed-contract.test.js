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
  const dispatcherStart = embed.indexOf('function handleWebPreviewParentMessage(event)');
  const dispatcherEnd = embed.indexOf(
    'window.addEventListener("message", handleWebPreviewParentMessage)',
    dispatcherStart
  );
  const dispatcher = embed.slice(dispatcherStart, dispatcherEnd);
  const bridgeStart = embed.indexOf('webPreviewBridgeDispatch = function(data)');
  const readyPost = embed.indexOf(
    'type: "unity-web-preview-ready"',
    bridgeStart
  );
  const forwardStart = embed.indexOf('function forwardSceneJson(json, options)');
  const forwardEnd = embed.indexOf('function sendSceneJson(payload)', forwardStart);
  const forwardScene = embed.slice(forwardStart, forwardEnd);

  assert.match(embed, /embed-parent-protocol\.js\?v=__WEBGL_PREVIEW_BUILD_VERSION__/);
  assert.match(embed, /createEmbedParentProtocol/);
  assert.match(embed, /parentWindow: window\.parent/);
  assert.match(embed, /parentOrigin: window\.location\.origin/);
  assert.match(embed, /webPreviewParentProtocol\.accept\(event, message\)/);
  assert.match(parentProtocol, /event\.source === parentWindow/);
  assert.match(parentProtocol, /event\.origin === parentOrigin/);
  assert.match(parentProtocol, /message\.session === binding\.session/);
  assert.equal(
    (embed.match(/window\.addEventListener\(["']message["']/g) || []).length,
    1,
    'every parent MessageEvent must pass through one stateful dispatcher'
  );
  assert.equal(
    (dispatcher.match(/webPreviewParentProtocol\.accept\(event, message\)/g) || []).length,
    1,
    'the dispatcher must consume each trusted message exactly once'
  );
  assert.ok(dispatcherStart >= 0 && dispatcherEnd > dispatcherStart);
  assert.match(dispatcher, /message\.type === "webgl-preview-dispose"/);
  assert.match(dispatcher, /webPreviewBridgeDispatch\(message\)/);
  assert.ok(bridgeStart >= 0 && readyPost > bridgeStart);
  assert.ok(forwardStart >= 0 && forwardEnd > forwardStart);
  const sendMessage = forwardScene.indexOf('unityInstance.SendMessage');
  const sceneForwarded = forwardScene.indexOf(
    'type: "unity-web-preview-scene-forwarded"'
  );
  assert.ok(sendMessage >= 0);
  assert.ok(sceneForwarded >= 0);
  assert.ok(
    sendMessage < sceneForwarded,
    'Unity must receive the payload before the parent sees the forwarded ack'
  );
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

test('Unity waits for verified large-data caching but not bounded cache warming', () => {
  const warmStart = embed.indexOf('function warmWebPreviewCache(controller)');
  const warmEnd = embed.indexOf('var webPreviewSceneVisibleNotified', warmStart);
  const warmSource = embed.slice(warmStart, warmEnd);

  assert.ok(warmStart > 0);
  assert.ok(warmEnd > warmStart);
  assert.match(embed, /worker\.state === "activated"[\s\S]+navigator\.serviceWorker\.controller === worker/);
  assert.match(embed, /prepareWebPreviewServiceWorker\(\)\.then\(function\(controller\)/);
  assert.match(embed, /return loadWebPreviewBuildManifest\(\);/);
  assert.match(embed, /return prepareLargeUnityDataCache\(byRole\)\.then\(function\(cacheReady\)/);
  assert.match(embed, /webPreviewLargeDataCacheReady = cacheReady;\s*warmWebPreviewCache/);
  assert.match(embed, /applyWebPreviewBuildFiles\(byRole\)/);
  assert.match(embed, /startUnityWebPreview\(\);/);
  assert.doesNotMatch(embed, /return warmWebPreviewCache\(controller\)/);
  assert.doesNotMatch(embed, /Cache warm timed out\. Starting Unity directly/);
  assert.match(embed, /Cache warm continues in the background/);
  assert.match(
    warmSource,
    /message\.status === "complete"[\s\S]*?message\.status === "cancelled"[\s\S]*?message\.status === "incomplete"/
  );
  assert.doesNotMatch(warmSource, /cancel-webgl-preview-cache/);
  assert.match(embed, /cacheVerifiedResponse\(/);
  assert.match(embed, /__xrugc_build_cache_ready__/);
  assert.match(embed, /__xrugc_cache_ready/);
  assert.match(embed, /webPreviewUnityReady = true;[\s\S]+setWebPreviewLoading\(false\)/);
});

test('runner loads every Unity artifact from one validated build manifest', () => {
  assert.match(embed, /schemaVersion !== 1/);
  assert.match(embed, /webPreviewBuildCacheVersion = manifest\.buildId/);
  assert.match(embed, /loaderUrl = withBuildCacheVersion\(byRole\.loader\)/);
  assert.match(embed, /config\.dataUrl = withBuildCacheVersion\(byRole\.data\)/);
  assert.match(embed, /cachedDataUrl\.searchParams\.set\("__xrugc_cache_ready", "1"\)/);
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
