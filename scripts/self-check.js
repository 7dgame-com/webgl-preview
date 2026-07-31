const fs = require('node:fs');
const path = require('node:path');
const {
  readLfsPointer,
  verifyBuildManifest,
} = require('./build-manifest');
const {
  isPinnedImage,
  resolveBaseImage,
} = require('./check-base-image');
const {
  verifyArtifactCompatibility,
} = require('./check-artifact-compatibility');

const root = path.resolve(__dirname, '..');
const required = [
  'Dockerfile',
  'nginx.conf',
  'nginx-security-headers.conf',
  'public/index.html',
  'public/embed.html',
  'public/modules/plugin-runner.js',
  'public/modules/sw-build-cache.js',
  'public/styles/plugin-runner.css',
  'public/sw.js',
  'public/runtime-config.json',
  'public/build-manifest.json',
  'public/artifact-compatibility.json',
  'public/plugin/manifest.json',
  'scripts/build-manifest.js',
  'scripts/check-base-image.js',
  'scripts/check-artifact-compatibility.js',
];

const fail = (message) => {
  throw new Error(message);
};

const checkRequiredFiles = () => {
  const missing = required.filter((item) => !fs.existsSync(path.join(root, item)));
  if (missing.length > 0) {
    fail(`Missing required files:\n${missing.map((item) => `- ${item}`).join('\n')}`);
  }
};

const checkPluginManifest = () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'public/plugin/manifest.json'), 'utf8')
  );
  if (manifest.id !== 'webgl-preview') {
    fail(`Unexpected manifest id: ${manifest.id}`);
  }
  if (manifest.entry?.frontend !== './index.html') {
    fail(`Frontend entry must be base-relative: ${manifest.entry?.frontend}`);
  }
  if (manifest.entry?.runner !== './embed.html') {
    fail(`Runner entry must be base-relative: ${manifest.entry?.runner}`);
  }
};

const checkRuntimeConfig = () => {
  const config = JSON.parse(
    fs.readFileSync(path.join(root, 'public/runtime-config.json'), 'utf8')
  );
  if (config.schemaVersion !== 1) fail('Unsupported runtime config schema');
  for (const field of [
    'trustedHostOrigins',
    'platformApiOrigins',
    'assetOrigins',
  ]) {
    if (!Array.isArray(config[field])) fail(`Runtime config ${field} must be an array`);
    for (const value of config[field]) {
      let origin;
      try {
        const url = new URL(value);
        origin = url.origin;
        if (url.protocol !== 'https:' || origin !== value) throw new Error();
      } catch {
        fail(`Production runtime config ${field} must contain exact HTTPS origins`);
      }
    }
  }
  if (config.allowManualSceneId !== false) {
    fail('Production runtime config must hide manual scene IDs by default');
  }
};

const checkNetworkConfig = () => {
  const nginxConfig = fs.readFileSync(path.join(root, 'nginx.conf'), 'utf8');
  for (const expectedSnippet of [
    'location = /health',
    'location = /__xrugc_proxy__',
    'return 404',
    'location = /runtime-config.json',
    'location = /build-manifest.json',
    'location = /artifact-compatibility.json',
    'location = /modules/sw-build-cache.js',
    'location = /sw.js',
  ]) {
    if (!nginxConfig.includes(expectedSnippet)) {
      fail(`Missing nginx config snippet: ${expectedSnippet}`);
    }
  }
  for (const forbiddenSnippet of [
    'proxy_pass $arg_url',
    'proxy_set_header Authorization',
  ]) {
    if (nginxConfig.includes(forbiddenSnippet)) {
      fail(`Forbidden arbitrary proxy configuration: ${forbiddenSnippet}`);
    }
  }
};

const checkServiceWorker = () => {
  const source = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
  const cacheCore = fs.readFileSync(
    path.join(root, 'public/modules/sw-build-cache.js'),
    'utf8'
  );
  for (const expectedSnippet of [
    'build-manifest.json',
    'BUILD_CACHE_MAX_BYTES',
    'SCENE_CACHE_MAX_BYTES',
    'background-started',
    'request.headers.has("range")',
  ]) {
    if (!source.includes(expectedSnippet)) {
      fail(`Service worker is missing contract: ${expectedSnippet}`);
    }
  }
  if (!source.includes('importScripts("modules/sw-build-cache.js")')) {
    fail('Service worker must load the tested build-cache core');
  }
  if (!cacheCore.includes('BuildArtifactCoordinator')) {
    fail('Service worker build-cache core is missing its coordinator');
  }
  for (const forbiddenSnippet of [
    'ignoreSearch',
    'findCompleteCachedResponse',
    'buildRangeResponse',
  ]) {
    if (source.includes(forbiddenSnippet)) {
      fail(`Service worker contains unsafe legacy cache behavior: ${forbiddenSnippet}`);
    }
  }
};

const checkBuildArtifacts = async () => {
  const buildDir = path.join(root, 'public/Build');
  const pointers = fs
    .readdirSync(buildDir)
    .map((name) => path.join(buildDir, name))
    .filter((filePath) => fs.statSync(filePath).isFile())
    .filter((filePath) => readLfsPointer(filePath));

  await verifyBuildManifest({
    rootDir: path.join(root, 'public'),
    manifestPath: path.join(root, 'public/build-manifest.json'),
    allowLfsMetadata: pointers.length > 0,
  });
  verifyArtifactCompatibility({ rootDir: path.join(root, 'public') });

  if (pointers.length > 0) {
    const dockerignore = fs.readFileSync(path.join(root, '.dockerignore'), 'utf8');
    if (!dockerignore.split(/\r?\n/).includes('public/Build')) {
      fail('public/Build must be excluded so LFS pointers cannot overwrite image assets');
    }
    console.warn(
      `Source checkout contains ${pointers.length} Git LFS pointer(s); strict validation is enforced in the Docker final-verifier stage.`
    );
  }
};

const checkBaseImagePolicy = () => {
  const reference = resolveBaseImage({
    dockerfilePath: path.join(root, 'Dockerfile'),
  });
  if (!isPinnedImage(reference)) {
    console.warn(
      'Local base image is mutable; publishing CI requires WEBGL_PREVIEW_BASE_IMAGE=name@sha256:<digest>.'
    );
  }
};

const main = async () => {
  checkRequiredFiles();
  checkPluginManifest();
  checkRuntimeConfig();
  checkNetworkConfig();
  checkServiceWorker();
  await checkBuildArtifacts();
  checkBaseImagePolicy();
  console.log('webgl-preview self-check passed');
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
