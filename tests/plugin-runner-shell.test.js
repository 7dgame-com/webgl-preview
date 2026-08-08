const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
  path.join(root, 'public/modules/plugin-runner.js'),
  'utf8'
);
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const css = fs.readFileSync(
  path.join(root, 'public/styles/plugin-runner.css'),
  'utf8'
);
const runtimeConfig = JSON.parse(
  fs.readFileSync(path.join(root, 'public/runtime-config.json'), 'utf8')
);

function loadFunction(name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start);
  assert.ok(start >= 0 && end > start, `cannot extract ${name}`);
  return new Function(`${source.slice(start, end)}; return ${name};`)();
}

function sourceBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `cannot extract ${startMarker}`);
  return source.slice(start, end);
}

function loadLifecycleContract() {
  const constants = sourceBetween('const PREVIEW_LIFECYCLE', 'const I18N');
  const canTransition = sourceBetween(
    'function canTransitionLifecycle',
    'function transitionLifecycle'
  );
  const transition = sourceBetween(
    'function transitionLifecycle',
    'function normalizeLocale'
  );
  const lifecycleState = {
    lifecycle: 'handshake',
    frameSession: '',
    runTerminal: false,
  };
  const lifecycleDocument = { documentElement: { dataset: {} } };
  const lifecycleElements = { status: { dataset: {} } };
  return new Function(
    'state',
    'document',
    'elements',
    `${constants}\n${canTransition}\n${transition}\nreturn { PREVIEW_LIFECYCLE, canTransitionLifecycle, transitionLifecycle, state };`
  )(lifecycleState, lifecycleDocument, lifecycleElements);
}

function loadBuildVersionContract() {
  const constants = sourceBetween(
    'const WEBGL_PREVIEW_BUILD_VERSION',
    'const UNITY_PREVIEW_VERSE_EXPAND'
  );
  const functions = sourceBetween(
    'function isPreviewBuildVersion',
    'function normalizePositiveSceneId'
  );
  return new Function(
    `${constants}\n${functions}\nreturn { resolvePreviewBuildVersion };`
  )();
}

function loadPlatformRequest(
  fetchImpl,
  { timeoutMs = 1000, backoffMs = 0, refreshToken = async () => '' } = {}
) {
  const retryConstants = sourceBetween(
    'const PLATFORM_GET_MAX_ATTEMPTS',
    'const PREVIEW_LIFECYCLE'
  );
  const previewError = sourceBetween(
    'class PreviewError',
    'function normalizePositiveSceneId'
  );
  const requestFunctions = sourceBetween(
    'function createRequestContext',
    'async function requestMyScenes'
  );
  const testWindow = {
    setTimeout(callback, delay) {
      return setTimeout(
        callback,
        delay === 250 ? backoffMs : delay
      );
    },
    clearTimeout,
  };
  return new Function(
    'fetch',
    'state',
    'allowedPlatformApiOrigins',
    'isAllowedSecureOrigin',
    'isAllowedPlatformRequestUrl',
    'getRequestTimeoutMs',
    'requestTokenRefresh',
    'window',
    `${retryConstants}\n${previewError}\n${requestFunctions}\nreturn requestPlatformResponse;`
  )(
    fetchImpl,
    { token: 'memory-token' },
    () => ['https://api.example.test'],
    () => true,
    () => true,
    () => timeoutMs,
    refreshToken,
    testWindow
  );
}

function jsonResponse(status, json = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    async json() {
      return json;
    },
  };
}

function loadAssetUrlNormalizer({
  allowedOrigins = ['https://data.7dgame.com'],
  localDevelopment = false,
} = {}) {
  const assetPattern = sourceBetween('const ASSET_PATH_RE', 'const VIDEO_PATH_RE');
  const previewError = sourceBetween(
    'class PreviewError',
    'function normalizePositiveSceneId'
  );
  const secureOrigin = sourceBetween(
    'function isAllowedSecureOrigin',
    'function resolveApiBase'
  );
  const normalizeAsset = sourceBetween(
    'function normalizeAllowedAssetUrl',
    'function rewriteStringUrls'
  );
  return new Function(
    'allowedAssetOrigins',
    'isExplicitLocalDevelopment',
    'isLoopbackHost',
    `${assetPattern}\n${previewError}\n${secureOrigin}\n${normalizeAsset}\nreturn normalizeAllowedAssetUrl;`
  )(
    () => allowedOrigins,
    () => localDevelopment,
    (hostname) => ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
  );
}

test('scene ids normalize to safe positive integers only', () => {
  const normalizePositiveSceneId = loadFunction(
    'normalizePositiveSceneId',
    'normalizeApiBase'
  );
  assert.equal(normalizePositiveSceneId('42'), 42);
  assert.equal(normalizePositiveSceneId(7), 7);
  for (const invalid of ['', '0', '-1', '1.5', '1e3', ' 1 2 ', Number.MAX_VALUE]) {
    assert.equal(normalizePositiveSceneId(invalid), null);
  }
});

test('visible version uses the shared precise Beijing build-time format', () => {
  const { resolvePreviewBuildVersion } = loadBuildVersionContract();
  assert.equal(
    resolvePreviewBuildVersion('2026.08.01-0637'),
    '2026.08.01-0637'
  );
  assert.equal(
    resolvePreviewBuildVersion('__WEBGL_PREVIEW_BUILD_VERSION__'),
    'dev'
  );
  assert.equal(resolvePreviewBuildVersion('2026.02.31-1200'), 'dev');
  assert.equal(
    (html.match(/__WEBGL_PREVIEW_BUILD_VERSION__/g) || []).length,
    2
  );
  assert.match(
    source,
    /elements\.version\.textContent = `v\$\{resolvePreviewBuildVersion\(\)\}`/
  );
  assert.match(source, /frameUrl\.searchParams\.set\("v", WEBGL_PREVIEW_VERSION\)/);
});

test('My Scenes is the default accessible production interaction', () => {
  assert.match(html, /data-scene-search/);
  assert.match(html, /role="combobox"/);
  assert.match(html, /role="listbox"/);
  assert.match(html, /data-scene-list-state/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /data-manual-mode hidden/);
  assert.match(html, /type="number"[\s\S]*?min="1"[\s\S]*?step="1"/);
  assert.match(html, /data-run-error[\s\S]*?role="alert"|role="alert"[\s\S]*?data-run-error/);
});

test('scene list uses the authenticated fixed Platform API contract', () => {
  assert.match(source, /resolvePlatformUrl\("v1\/verses"\)/);
  assert.match(source, /url\.searchParams\.set\("sort", "-updated_at"\)/);
  assert.match(source, /url\.searchParams\.set\("per-page", String\(SCENE_PAGE_SIZE\)\)/);
  assert.match(source, /url\.searchParams\.set\("expand", "image"\)/);
  assert.match(source, /url\.searchParams\.set\("VerseSearch\[name\]", search\)/);
  assert.match(source, /Authorization: `Bearer \$\{requestToken\}`/);
  assert.match(source, /credentials: "omit"/);
  assert.match(source, /X-Pagination-Current-Page/);
  assert.match(source, /X-Pagination-Page-Count/);
  assert.match(source, /X-Pagination-Per-Page/);
  assert.match(source, /X-Pagination-Total-Count/);
});

test('search, pagination, and identity changes isolate late responses', () => {
  assert.match(source, /const SCENE_SEARCH_DEBOUNCE_MS = 300/);
  assert.match(source, /state\.sceneSearchTimer = window\.setTimeout/);
  assert.match(source, /state\.sceneListController\?\.abort\(\)/);
  assert.match(source, /generation !== state\.sceneListGeneration/);
  assert.match(source, /controller\.signal\.aborted/);
  assert.match(source, /state\.scenePage = 1/);
  assert.match(source, /resetForIdentityChange/);
});

test('lifecycle is explicit, mutually exclusive, and terminal-safe', () => {
  const {
    PREVIEW_LIFECYCLE,
    canTransitionLifecycle,
    transitionLifecycle,
    state: lifecycleState,
  } = loadLifecycleContract();
  assert.deepEqual(Object.values(PREVIEW_LIFECYCLE).sort(), [
    'handshake',
    'loading-scene',
    'ready',
    'running',
    'scene-list',
    'starting-runner',
    'stopped',
    'stopping',
    'terminal-error',
  ]);
  assert.equal(
    canTransitionLifecycle(PREVIEW_LIFECYCLE.HANDSHAKE, PREVIEW_LIFECYCLE.SCENE_LIST),
    true
  );
  assert.equal(
    canTransitionLifecycle(PREVIEW_LIFECYCLE.LOADING_SCENE, PREVIEW_LIFECYCLE.STARTING_RUNNER),
    true
  );
  assert.equal(
    canTransitionLifecycle(PREVIEW_LIFECYCLE.STARTING_RUNNER, PREVIEW_LIFECYCLE.RUNNING),
    true
  );
  assert.equal(
    canTransitionLifecycle(PREVIEW_LIFECYCLE.TERMINAL_ERROR, PREVIEW_LIFECYCLE.RUNNING),
    false
  );
  assert.equal(
    canTransitionLifecycle(
      PREVIEW_LIFECYCLE.TERMINAL_ERROR,
      PREVIEW_LIFECYCLE.LOADING_SCENE,
      true
    ),
    true
  );
  lifecycleState.lifecycle = PREVIEW_LIFECYCLE.STARTING_RUNNER;
  lifecycleState.frameSession = 'current-session';
  assert.equal(transitionLifecycle(PREVIEW_LIFECYCLE.TERMINAL_ERROR), true);
  assert.equal(lifecycleState.runTerminal, true);
  assert.equal(
    transitionLifecycle(PREVIEW_LIFECYCLE.RUNNING, {
      runSession: 'old-session',
    }),
    false
  );
  assert.equal(
    transitionLifecycle(PREVIEW_LIFECYCLE.RUNNING, {
      runSession: 'current-session',
    }),
    false
  );
  assert.equal(lifecycleState.lifecycle, PREVIEW_LIFECYCLE.TERMINAL_ERROR);
  assert.match(source, /runSession && runSession !== state\.frameSession/);
  assert.match(source, /data-preview-lifecycle|dataset\.previewLifecycle/);
});

test('Platform GET retries one transient HTTP or network failure', async () => {
  for (const firstFailure of [502, 503, 504, 'network']) {
    let calls = 0;
    const request = loadPlatformRequest(async () => {
      calls += 1;
      if (calls === 1) {
        if (firstFailure === 'network') throw new TypeError('network down');
        return jsonResponse(firstFailure);
      }
      return jsonResponse(200, { success: true });
    });
    const result = await request(new URL('https://api.example.test/v1/verses'), {
      code: 'WGP-SCENE-LIST',
    });
    assert.equal(calls, 2, `retry count for ${firstFailure}`);
    assert.deepEqual(result.json, { success: true });
  }
});

test('Platform GET without a refreshed token does not retry auth, not-found, or non-gateway failures', async () => {
  for (const status of [401, 403, 404, 500]) {
    let calls = 0;
    const request = loadPlatformRequest(async () => {
      calls += 1;
      return jsonResponse(status);
    });
    await assert.rejects(
      request(new URL('https://api.example.test/v1/verses'), {
        code: 'WGP-SCENE-LIST',
      }),
      (error) => error.status === status
    );
    assert.equal(calls, 1, `request count for ${status}`);
  }
});

test('Platform GET caps retries and propagates timeout and Abort', async () => {
  let gatewayCalls = 0;
  const gatewayRequest = loadPlatformRequest(async () => {
    gatewayCalls += 1;
    return jsonResponse(503);
  });
  await assert.rejects(
    gatewayRequest(new URL('https://api.example.test/v1/verses'), {
      code: 'WGP-SCENE-LIST',
    }),
    (error) => error.status === 503
  );
  assert.equal(gatewayCalls, 2);

  let timeoutCalls = 0;
  const timeoutRequest = loadPlatformRequest(
    (_url, options) => {
      timeoutCalls += 1;
      return new Promise((resolve, reject) => {
        options.signal.addEventListener(
          'abort',
          () => reject(options.signal.reason || new DOMException('aborted', 'AbortError')),
          { once: true }
        );
      });
    },
    { timeoutMs: 5 }
  );
  await assert.rejects(
    timeoutRequest(new URL('https://api.example.test/v1/verses'), {
      code: 'WGP-SCENE-LIST',
    }),
    (error) => error.code === 'WGP-SCENE-LIST-TIMEOUT'
  );
  assert.equal(timeoutCalls, 2);

  let abortCalls = 0;
  const abortController = new AbortController();
  const abortRequest = loadPlatformRequest(
    async () => {
      abortCalls += 1;
      return jsonResponse(503);
    },
    { backoffMs: 30 }
  );
  const pending = abortRequest(new URL('https://api.example.test/v1/verses'), {
    code: 'WGP-SCENE-LIST',
    signal: abortController.signal,
  });
  const superseded = new DOMException('superseded', 'AbortError');
  setTimeout(() => abortController.abort(superseded), 5);
  await assert.rejects(pending, (error) => error === superseded);
  assert.equal(abortCalls, 1);
});

test('asset URL policy preserves signed query bytes and rejects unsafe origins', () => {
  const normalize = loadAssetUrlNormalizer();
  const exactUrls = [
    'https://data.7dgame.com/model.glb?part=one&part=two&part=three',
    'https://data.7dgame.com/%E5%9C%BA%E6%99%AF.glb?name=场景&encoded=%E5%9C%BA%E6%99%AF',
    'https://data.7dgame.com/model.glb?token=a%26b%3Dc%25d&raw=a%3Db',
    'https://data.7dgame.com/model.glb?next=https%3A%2F%2Fdata.7dgame.com%2Fnested.glb%3Fa%3D1%26b%3D2',
    'https://data.7dgame.com/model.glb?q-key-time=9%3A8&q-signature=ABC%2fdef%3D&x=1&x=2',
  ];
  for (const url of exactUrls) {
    assert.equal(normalize(url, 'https://data.7dgame.com'), url);
  }

  assert.equal(
    normalize('./models/scene.glb?part=one&part=two', 'https://data.7dgame.com/base/'),
    'https://data.7dgame.com/base/models/scene.glb?part=one&part=two'
  );
  for (const rejected of [
    'http://data.7dgame.com/model.glb?signature=unchanged',
    'https://evil.example/model.glb',
    'https://user:password@data.7dgame.com/model.glb',
  ]) {
    assert.throws(
      () => normalize(rejected, 'https://data.7dgame.com'),
      (error) => error.code === 'WGP-ASSET-DENIED'
    );
  }

  const chengduCosOrigin =
    'https://mrpp-1257979353.cos.ap-chengdu.myqcloud.com';
  const normalizeWithChengduCos = loadAssetUrlNormalizer({
    allowedOrigins: ['https://data.7dgame.com', chengduCosOrigin],
  });
  assert.equal(
    normalizeWithChengduCos(`${chengduCosOrigin}/model.glb`, chengduCosOrigin),
    `${chengduCosOrigin}/model.glb`
  );
  assert.throws(
    () =>
      normalizeWithChengduCos(
        'https://mrpp-1257979353.cos.ap-chengdu.myqcloud.com.evil.example/model.glb',
        chengduCosOrigin
      ),
    (error) => error.code === 'WGP-ASSET-DENIED'
  );
});

test('static production runtime config contains HTTPS-only host and API origins', () => {
  for (const key of ['trustedHostOrigins', 'platformApiOrigins']) {
    assert.ok(Array.isArray(runtimeConfig[key]) && runtimeConfig[key].length > 0);
    assert.ok(
      runtimeConfig[key].includes('https://d.xrugc.com'),
      `${key} must include the production workbench origin`
    );
    for (const origin of runtimeConfig[key]) {
      assert.match(origin, /^https:\/\//, `${key}: ${origin}`);
      assert.doesNotMatch(origin, /^http:\/\//, `${key}: ${origin}`);
    }
  }
});

test('scene selection does not start or preload Unity', () => {
  const selectStart = source.indexOf('function selectScene(scene)');
  const selectEnd = source.indexOf('function clearSceneSelection', selectStart);
  const setupStart = source.indexOf('function setupFrame()');
  const setupEnd = source.indexOf('function toggleFullscreenPreview', setupStart);
  const selectBlock = source.slice(selectStart, selectEnd);
  const setupBlock = source.slice(setupStart, setupEnd);

  assert.ok(selectStart > 0 && selectEnd > selectStart);
  assert.doesNotMatch(selectBlock, /runScene\s*\(/);
  assert.doesNotMatch(selectBlock, /loadUnityFrame\s*\(/);
  assert.doesNotMatch(setupBlock, /loadUnityFrame\s*\(/);
  assert.match(source, /await Promise\.all\([\s\S]*?requestVerse\(sceneId, "lua"[\s\S]*?loadUnityFrame\(\{ autoRun: true \}\)/);
});

test('production token is memory-only and messages are session bound', () => {
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  assert.doesNotMatch(source, /get\(["'](?:token|access_token)["']\)/);
  assert.match(source, /const TOKEN_REFRESH_TIMEOUT_MS = 15000/);
  assert.match(source, /payload: \{ handshakeSession: state\.handshakeSession \}/);
  assert.match(source, /type: "TOKEN_REFRESH_REQUEST"/);
  assert.match(source, /payload: \{ handshakeSession \}/);
  assert.match(source, /state\.tokenRefreshWaiter\?\.handshakeSession === state\.handshakeSession/);
  assert.match(source, /function readJwtPrincipal\(token\)/);
  assert.match(source, /normalizeClaim\(payload\.uid\)/);
  assert.match(source, /normalizeClaim\(payload\.sub\)/);
  assert.match(source, /hasSameJwtPrincipal\(state\.token, nextToken\)/);
  assert.match(source, /if \(nextToken === state\.token\) return/);
  assert.match(source, /payload\.handshakeSession === state\.handshakeSession/);
  assert.match(source, /messageType === "INIT"\) return !state\.handshakeComplete/);
  assert.match(source, /state\.handshakeComplete && state\.legacyHostHandshake/);
  assert.match(
    source,
    /state\.legacyHostHandshake = !Object\.prototype\.hasOwnProperty\.call\(/
  );
  assert.match(source, /event\.source === window\.parent/);
  assert.match(source, /event\.origin === state\.hostOrigin/);
  assert.match(source, /event\.source !== elements\.frame\.contentWindow/);
  assert.match(source, /event\.origin !== state\.frameOrigin/);
  assert.doesNotMatch(source, /postMessage\([^;]+,\s*["']\*["']\s*\)/s);
});

test('scene thumbnails select CORS mode before starting the request', () => {
  const picker = sourceBetween(
    'function renderScenePicker',
    'function setScenePickerOpen'
  );
  const crossOrigin = picker.indexOf('image.crossOrigin = "anonymous"');
  const sourceAssignment = picker.indexOf('image.src = scene.thumbnail');
  assert.ok(crossOrigin >= 0, 'thumbnail declares anonymous CORS');
  assert.ok(sourceAssignment > crossOrigin, 'CORS mode is set before src');
  assert.match(
    picker,
    /image\.addEventListener\([\s\S]*?"error"[\s\S]*?createSceneThumbnailPlaceholder\(\)[\s\S]*?\{ once: true \}/
  );
});

test('development token entry needs every explicit safety gate', () => {
  assert.match(source, /isLoopbackHost\(window\.location\.hostname\)/);
  assert.match(source, /config\.allowDevelopmentToken === true/);
  assert.match(source, /if \(!state\.allowDevelopmentToken\) return/);
  assert.match(html, /data-development-token hidden/);
  assert.match(html, /autocomplete="off"[\s\S]*?data-token-input/);
});

test('legacy proxy and public snapshot paths are absent from the shell', () => {
  assert.doesNotMatch(source, /__xrugc_proxy__/);
  assert.doesNotMatch(source, /\/api\/snapshot/);
  assert.doesNotMatch(source, /protocol\s*=\s*["']https:["']/);
  assert.match(source, /isAllowedSecureOrigin\(url, allowedAssetOrigins\(\)\)/);
  assert.match(source, /WGP-ASSET-DENIED/);
});

test('runtime configuration precedes READY and terminal errors are stable', () => {
  const initStart = source.indexOf('async function init()');
  const initBlock = source.slice(initStart);
  assert.ok(initBlock.indexOf('await loadRuntimeConfig()') > 0);
  assert.ok(
    initBlock.indexOf('await loadRuntimeConfig()') < initBlock.indexOf('startPluginReadyRetries()')
  );
  assert.match(source, /state\.handshakeReadyTimer = window\.setInterval\(postPluginReady, 500\)/);
  assert.match(source, /if \(state\.handshakeComplete\) return;/);
  assert.match(
    source,
    /state\.handshakeComplete = true;[\s\S]*?stopPluginReadyRetries\(\);/
  );
  assert.doesNotMatch(source, /__PLUGIN_READY_SENT__/);
  assert.match(source, /unity-web-preview-error/);
  assert.match(source, /WGP-HANDSHAKE-TIMEOUT/);
  assert.match(source, /WGP-SCENE-LIST-401/);
  assert.match(source, /WGP-SCENE-LIST-403/);
  assert.match(source, /WGP-SCENE-DATA-404/);
  assert.match(source, /state\.lifecycle === PREVIEW_LIFECYCLE\.TERMINAL_ERROR/);
  assert.match(source, /transitionLifecycle\(PREVIEW_LIFECYCLE\.TERMINAL_ERROR\)/);
});

test('background cache status never blocks the foreground runner', () => {
  assert.match(source, /message\.status === "background-started"/);
  assert.match(source, /message\.status === "background-progress"/);
  assert.match(
    source,
    /isBackgroundCache[\s\S]*?state\.cacheActive = false;[\s\S]*?return;/
  );
  assert.match(source, /message\.status === "incomplete"/);
  assert.match(source, /WGP-CACHE-INCOMPLETE/);
});

test('layout supports dynamic viewport and reduced motion', () => {
  assert.match(css, /height: 100dvh/);
  assert.match(css, /max-height: min\(360px, 52dvh\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /:focus-visible/);
});
