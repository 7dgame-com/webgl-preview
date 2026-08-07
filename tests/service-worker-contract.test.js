const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');

test('service worker isolates Unity cache keys by manifest build revision', () => {
  assert.match(source, /BUILD_MANIFEST_PATH = "build-manifest\.json"/);
  assert.match(source, /buildCacheName\(manifest\)/);
  assert.match(source, /url\.searchParams\.set\(BUILD_REVISION_QUERY, buildId\)/);
  assert.match(
    source,
    /buildCacheKeyForRevision\(requestOrUrl, manifest\.buildId\)/
  );
  assert.doesNotMatch(source, /ignoreSearch/);
  assert.doesNotMatch(source, /findCompleteCachedResponse/);
  assert.doesNotMatch(source, /previousCompleteResponse/);
});

test('cache warming is background-only and never reports an early completion', () => {
  const warmStart = source.indexOf('const warmPreviewCache');
  const warmEnd = source.indexOf('const normalizeSceneResourceTargetUrl');
  const warmSource = source.slice(warmStart, warmEnd);
  const backgroundStart = warmSource.indexOf('status: "background-started"');
  const backgroundLoop = warmSource.indexOf(
    'for (let index = 0; index < manifest.files.length; index += 1)'
  );
  const pruneGate = warmSource.indexOf('await pruneOldBuildCaches(manifest)');
  const completion = warmSource.indexOf('status: "complete"');
  assert.ok(backgroundStart > 0);
  assert.ok(backgroundLoop > backgroundStart);
  assert.ok(completion > pruneGate);
  assert.equal(warmSource.match(/status: "complete"/g)?.length, 1);
  assert.match(warmSource, /background: true/);
  assert.match(warmSource, /status: "incomplete"/);
  assert.match(warmSource, /status: controller\.signal\.aborted[\s\S]+\? "cancelled"[\s\S]+: "error"/);
  assert.doesNotMatch(warmSource, /addAll\s*\(/);
});

test('old build caches are pruned only after the current build is complete', () => {
  const failedGate = source.indexOf('if (failedFiles.length > 0)');
  const pruneGate = source.indexOf('await pruneOldBuildCaches(manifest)');
  const backgroundComplete = source.indexOf('status: "complete"');

  assert.ok(failedGate > 0);
  assert.ok(pruneGate > failedGate);
  assert.ok(backgroundComplete > pruneGate);
  assert.match(
    source,
    /if \(failedFiles\.length > 0\) \{[\s\S]*?status: "incomplete"[\s\S]*?return;[\s\S]*?\}/
  );
  assert.match(
    source,
    /oldBuildCaches\.slice\(-RETAINED_OLD_BUILD_CACHES\)/
  );
  assert.match(source, /const RETAINED_OLD_BUILD_CACHES = 2/);
});

test('activation preserves rollback and scene caches', () => {
  const activateStart = source.indexOf('self.addEventListener("activate"');
  const messageStart = source.indexOf('self.addEventListener("message"');
  const activateBlock = source.slice(activateStart, messageStart);

  assert.ok(activateStart > 0);
  assert.ok(messageStart > activateStart);
  assert.match(activateBlock, /self\.clients\.claim\(\)/);
  assert.doesNotMatch(activateBlock, /pruneOldBuildCaches/);
  assert.doesNotMatch(activateBlock, /caches\.delete/);
  assert.doesNotMatch(source, /caches\.delete\(SCENE_CACHE_NAME\)/);
});

test('a stale in-memory manifest cannot cache a new revision into an old cache', () => {
  assert.match(source, /requestedRevision !== manifest\.buildId/);
  assert.match(source, /getBuildManifest\(\{ force: true \}\)/);
  assert.match(
    source,
    /const retained = await retainedBuildResponse\(request, requestedRevision\);\s*return retained \|\| unavailableBuildRevisionResponse\(requestedRevision\);/
  );
  assert.match(source, /WGP-CACHE-REVISION/);
  assert.doesNotMatch(
    source,
    /if \(requestedRevision && requestedRevision !== manifest\.buildId\) \{\s*return fetch\(request\);/
  );
});

test('Range and oversized scene resources bypass in-memory cache slicing', () => {
  assert.match(source, /request\.headers\.has\("range"\)/);
  assert.match(source, /SCENE_CACHE_MAX_ENTRY_BYTES/);
  assert.match(source, /SCENE_CACHE_MAX_BYTES/);
  assert.match(source, /SCENE_CACHE_MAX_ENTRIES/);
  assert.match(
    source,
    /isSceneResponseCacheCandidate\(upstream\)[\s\S]+upstream\.clone\(\)/
  );
  assert.doesNotMatch(source, /\.arrayBuffer\s*\(/);
  assert.doesNotMatch(source, /buffer\.slice/);
});

test('only allowlisted cross-origin scene resources are intercepted', () => {
  assert.match(
    source,
    /if \(url\.origin !== self\.location\.origin\) \{\s*const targetUrl = normalizeSceneResourceTargetUrl\(event\.request\.url\);\s*if \(targetUrl && isAllowedSceneResourceRequestContext\(event\.request\)\) \{\s*event\.respondWith\(handleSceneResourceRequest\(event, targetUrl\)\);\s*\}\s*return;/
  );
  assert.match(source, /ALLOWED_SCENE_RESOURCE_HOSTS\.has\(url\.hostname\)/);
  assert.match(source, /"mrpp-1257979353\.cos\.ap-chengdu\.myqcloud\.com"/);
  assert.match(source, /request\.mode === "no-cors"/);
  assert.match(source, /credentials: "omit"/);
  assert.match(source, /redirect: "error"/);
  assert.match(
    source,
    /\["range", "if-none-match", "if-modified-since"\]/
  );
  assert.doesNotMatch(source, /headers\.get\(["']authorization["']\)/i);
  assert.doesNotMatch(source, /headers\.get\(["']cookie["']\)/i);
});

test('scene aliases reject navigation and active-content destinations', () => {
  assert.match(
    source,
    /const ALLOWED_SCENE_RESOURCE_DESTINATIONS = new Set\(\[\s*"",\s*"image",\s*"audio",\s*"video",\s*\]\)/
  );
  assert.match(source, /request\.mode !== "navigate"/);
  assert.match(
    source,
    /const handleSceneResourceEndpointRequest = \(event, endpointUrl\) => \{\s*if \(!isAllowedSceneResourceRequestContext\(event\.request\)\)/
  );
  assert.match(source, /status: 403/);
  assert.match(source, /"x-content-type-options": "nosniff"/);
});

test('legacy Unity proxy URLs reuse the bounded scene-resource handler', () => {
  assert.match(
    source,
    /const LEGACY_SCENE_RESOURCE_ENDPOINT = "__xrugc_proxy__"/
  );
  assert.match(
    source,
    /const legacySceneEndpointUrl = \(\) => scopeUrl\(LEGACY_SCENE_RESOURCE_ENDPOINT\)/
  );

  const fetchStart = source.indexOf('self.addEventListener("fetch"');
  const legacyGate = source.indexOf(
    'if (url.pathname === legacySceneEndpointUrl().pathname)',
    fetchStart
  );
  const buildFallback = source.indexOf('event.respondWith(\n    getBuildManifest()', legacyGate);
  const legacyBlock = source.slice(legacyGate, buildFallback);

  assert.ok(fetchStart > 0);
  assert.ok(legacyGate > fetchStart);
  assert.ok(buildFallback > legacyGate);
  assert.match(legacyBlock, /handleSceneResourceEndpointRequest\(event, legacySceneEndpointUrl\(\)\)/);
  assert.doesNotMatch(legacyBlock, /fetch\(requestUrl\.searchParams\.get\("url"\)\)/);

  const currentGate = source.indexOf(
    'if (url.pathname === sceneEndpointUrl().pathname)',
    fetchStart
  );
  const currentBlock = source.slice(currentGate, legacyGate);
  assert.match(currentBlock, /handleSceneResourceEndpointRequest\(event, sceneEndpointUrl\(\)\)/);
});

test('the fixed Platform API alias is explicitly network-only', () => {
  const fetchStart = source.indexOf('self.addEventListener("fetch"');
  const platformGate = source.indexOf(
    'const platformApiAlias = scopeUrl(`${PLATFORM_API_ALIAS_SEGMENT}/`)',
    fetchStart
  );
  const sceneGate = source.indexOf(
    'if (url.pathname === sceneEndpointUrl().pathname)',
    platformGate
  );
  const platformBlock = source.slice(platformGate, sceneGate);

  assert.ok(fetchStart > 0);
  assert.ok(platformGate > fetchStart);
  assert.ok(sceneGate > platformGate);
  assert.match(platformBlock, /event\.respondWith\(fetch\(event\.request\)\)/);
  assert.match(platformBlock, /return;/);
  assert.doesNotMatch(platformBlock, /caches\.(?:open|match)/);
  assert.doesNotMatch(platformBlock, /getBuildManifest/);
});

test('no-cors opaque responses are direct-only and never cached', () => {
  const noCorsGate = source.indexOf(
    'request.headers.has("range") || request.mode === "no-cors"'
  );
  const sceneCacheOpen = source.indexOf(
    'cache = await caches.open(SCENE_CACHE_NAME)',
    noCorsGate
  );
  assert.ok(noCorsGate > 0);
  assert.ok(sceneCacheOpen > noCorsGate);
  assert.match(source, /if \(response\.type === "opaque"\) return response/);
});

test('Docker delivery cannot skip manifest and final artifact verification', () => {
  assert.match(
    dockerfile,
    /ARTIFACT_TOOL_IMAGE=node:[^\s]+@sha256:[a-f0-9]{64}/
  );
  assert.match(dockerfile, /AS manifest-builder/);
  assert.match(dockerfile, /AS final-verifier/);
  assert.match(dockerfile, /build-manifest\.js verify/);
  assert.match(dockerfile, /COPY --from=final-verifier \/verified/);
  assert.match(dockerfile, /REQUIRE_PINNED_BASE_IMAGE/);
  assert.match(dockerfile, /REQUIRE_APPROVED_BUILD/);
  assert.match(dockerfile, /check-artifact-compatibility\.js/);
});
