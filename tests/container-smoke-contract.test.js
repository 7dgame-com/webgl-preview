const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const smoke = fs.readFileSync(
  path.join(root, 'scripts/container-smoke.js'),
  'utf8'
);
const workflow = fs.readFileSync(
  path.join(root, '.github/workflows/webgl-preview-ci.yml'),
  'utf8'
);
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8')
);
const dockerSmoke = fs.readFileSync(
  path.join(root, 'scripts/docker-smoke.js'),
  'utf8'
);
const subpathSmoke = fs.readFileSync(
  path.join(root, 'scripts/subpath-container-smoke.js'),
  'utf8'
);
const browserSmoke = fs.readFileSync(
  path.join(root, 'scripts/browser-smoke.js'),
  'utf8'
);
const structureCheck = fs.readFileSync(
  path.join(root, 'scripts/structure-check.js'),
  'utf8'
);
const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
const buildVersionInjector = fs.readFileSync(
  path.join(root, 'scripts/inject-build-version.js'),
  'utf8'
);

test('container smoke inspects final routes and every manifest artifact', () => {
  for (const route of [
    '/api/health',
    '/plugin/manifest',
    '/runtime-config.json',
    '/build-manifest.json',
    '/artifact-compatibility.json',
    '/__xrugc_proxy__',
    '/api/snapshot',
    '/__xrugc_scene_resource__',
    '/platform-api/v1/verses',
    '/platform-api/v1/users',
  ]) {
    assert.match(smoke, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(smoke, /for \(const file of build\.files\)/);
  assert.match(smoke, /assertSecurityHeaders/);
  assert.match(smoke, /content-range/);
  assert.match(smoke, /\/embed\.html/);
  assert.match(smoke, /\/sw\.js/);
  assert.match(smoke, /\/modules\/sw-build-cache\.js/);
  assert.match(smoke, /content-encoding/);
  assert.match(smoke, /file\.size/);
});

test('local Docker smoke keeps the image CMD and cleans up its exact container', () => {
  assert.equal(packageJson.scripts['test:docker'], 'node scripts/docker-smoke.js');
  assert.equal(
    packageJson.scripts['test:browser-smoke'],
    'node --experimental-websocket scripts/browser-smoke.js'
  );
  assert.doesNotMatch(dockerSmoke, /docker[^\n]*compose[^\n]*run/);
  assert.match(dockerSmoke, /'run'/);
  assert.match(
    dockerSmoke,
    /'--env',\s*'HOST_API_BASE=https:\/\/127\.0\.0\.1:9'/
  );
  assert.match(dockerSmoke, /'rm', '--force', containerName/);
  assert.match(dockerSmoke, /scripts\/container-smoke\.js/);
  assert.match(dockerSmoke, /scripts\/subpath-container-smoke\.js/);
  assert.match(dockerSmoke, /scripts\/browser-smoke\.js/);
  assert.match(dockerSmoke, /--experimental-websocket/);
  assert.match(subpathSmoke, /DEFAULT_PREFIX = '\/webgl-preview'/);
  assert.match(subpathSmoke, /runContainerSmoke/);
  assert.match(subpathSmoke, /startStripPrefixProxy/);
  assert.match(subpathSmoke, /require\.main === module/);
});

test('browser smoke runs real Chrome for root and a reusable strip-prefix proxy', () => {
  assert.match(browserSmoke, /env\.CHROME_BIN/);
  assert.match(browserSmoke, /Google Chrome\.app/);
  assert.match(browserSmoke, /\/usr\/bin\/google-chrome/);
  assert.match(browserSmoke, /--remote-debugging-address=127\.0\.0\.1/);
  assert.match(browserSmoke, /--remote-debugging-port=0/);
  assert.doesNotMatch(browserSmoke, /--dump-dom/);
  assert.doesNotMatch(browserSmoke, /--virtual-time-budget=/);
  assert.match(browserSmoke, /--user-data-dir=/);
  assert.match(browserSmoke, /method: 'PUT'/);
  assert.match(browserSmoke, /Runtime\.evaluate/);
  assert.match(browserSmoke, /new WebSocket\(webSocketUrl\)/);
  assert.match(browserSmoke, /getComputedStyle/);
  assert.match(browserSmoke, /startStripPrefixProxy/);
  assert.match(browserSmoke, /label: 'root'/);
  assert.match(browserSmoke, /strip-prefix \/webgl-preview\//);
  assert.match(browserSmoke, /unity-canvas/);
  assert.match(browserSmoke, /unity-loading-bar/);
  assert.match(browserSmoke, /web-preview-loading-shield/);
  assert.match(browserSmoke, /warningChildren === 0/);
  assert.match(browserSmoke, /Number\(canvas\.clientWidth\) > 0/);
  assert.match(browserSmoke, /session', 'browser-smoke-session'/);
  assert.match(browserSmoke, /fs\.mkdtempSync/);
  assert.match(browserSmoke, /fs\.rmSync/);
  assert.match(browserSmoke, /SIGKILL/);
  assert.match(structureCheck, /scripts\/browser-smoke\.js/);
  assert.match(structureCheck, /tests\/browser-smoke\.test\.js/);
});

test('publishing CI smokes the exact pushed digest and always cleans up', () => {
  const candidateSmoke = workflow.indexOf(
    'Smoke candidate before any release tag is published'
  );
  const releasePush = workflow.indexOf('- name: Build and push');
  assert.ok(candidateSmoke >= 0, 'candidate smoke step exists');
  assert.ok(releasePush > candidateSmoke, 'candidate is smoked before release push');
  assert.match(workflow, /security-contract:[\s\S]*npm run test:security/);
  assert.match(
    workflow,
    /WEBGL_PREVIEW_BASE_IMAGE: \$\{\{ vars\.WEBGL_PREVIEW_BASE_IMAGE \|\| 'hkccr\.ccs\.tencentyun\.com\/plugins\/webgl-preview@sha256:[a-f0-9]{64}' \}\}/
  );
  assert.equal(
    (
      workflow.match(
        /WEBGL_PREVIEW_BASE_IMAGE=\$\{\{ env\.WEBGL_PREVIEW_BASE_IMAGE \}\}/g
      ) || []
    ).length,
    2
  );
  assert.match(
    workflow,
    /container-gate:[\s\S]*needs: \[test, security-contract, build_metadata\]/
  );
  assert.match(workflow, /container-gate:[\s\S]*load: true[\s\S]*push: false/);
  assert.match(
    workflow,
    /publish:[\s\S]*needs: \[test, security-contract, build_metadata, container-gate\]/
  );
  assert.equal((workflow.match(/REQUIRE_APPROVED_BUILD=1/g) || []).length, 2);
  assert.equal(
    (workflow.match(/name: Generate Beijing build version/g) || []).length,
    1
  );
  assert.equal(
    (
      workflow.match(
        /WEBGL_PREVIEW_BUILD_VERSION=\$\{\{ needs\.build_metadata\.outputs\.build_version \}\}/g
      ) || []
    ).length,
    2
  );
  assert.equal(
    (workflow.match(/TZ=Asia\/Shanghai date '\+%Y\.%m\.%d-%H%M'/g) || [])
      .length,
    1
  );
  assert.equal(
    (
      workflow.match(
        /--env HOST_API_BASE=https:\/\/127\.0\.0\.1:9/g
      ) || []
    ).length,
    2
  );
  assert.equal(
    (workflow.match(/node scripts\/subpath-container-smoke\.js/g) || []).length,
    2
  );
  assert.equal(
    (
      workflow.match(
        /node --experimental-websocket scripts\/browser-smoke\.js/g
      ) || []
    ).length,
    2
  );
  assert.match(workflow, /id: build/);
  assert.match(workflow, /steps\.build\.outputs\.digest/);
  assert.match(workflow, /docker pull "\$\{IMAGE_REF\}"/);
  assert.match(workflow, /node scripts\/container-smoke\.js/);
  assert.match(workflow, /trap cleanup EXIT/);
  assert.match(workflow, /provenance: mode=max/);
  assert.match(workflow, /sbom: true/);
});

test('release builds require and inject the visible build version', () => {
  assert.match(dockerfile, /ARG WEBGL_PREVIEW_BUILD_VERSION=/);
  assert.match(dockerfile, /AS shell-builder/);
  assert.match(dockerfile, /inject-build-version\.js[\s\S]*?--require/);
  assert.match(dockerfile, /inject-build-version\.js --root public --verify/);
  assert.match(
    dockerfile,
    /COPY --from=shell-builder \/work\/public \/usr\/share\/nginx\/html/
  );
  assert.match(buildVersionInjector, /YYYY\.MM\.DD-HHmm/);
  assert.match(buildVersionInjector, /expectedMarkers/);
});
