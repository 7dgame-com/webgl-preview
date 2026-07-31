const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const required = [
  '.dockerignore',
  '.env.example',
  '.github/workflows/webgl-preview-ci.yml',
  'nginx.conf',
  'nginx-security-headers.conf',
  'README-quickstart.md',
  'docs/STRUCTURE.md',
  'docs/INTEGRATION.md',
  'public/plugin/manifest.json',
  'public/runtime-config.json',
  'public/build-manifest.json',
  'public/artifact-compatibility.json',
  'public/modules/sw-build-cache.js',
  'scripts/dev-server.js',
  'scripts/container-smoke.js',
  'scripts/browser-smoke.js',
  'scripts/build-manifest.js',
  'scripts/check-base-image.js',
  'scripts/check-artifact-compatibility.js',
  'scripts/subpath-container-smoke.js',
  'tests/build-manifest.test.js',
  'tests/browser-smoke.test.js',
  'tests/service-worker-contract.test.js',
];

const missing = required.filter((item) => !fs.existsSync(path.join(root, item)));

if (missing.length > 0) {
  console.error('Missing repository structure files:');
  missing.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

const dockerignore = fs.readFileSync(path.join(root, '.dockerignore'), 'utf8');
for (const pattern of [
  'node_modules',
  'dist',
  '.git',
  '.github',
  '.DS_Store',
  'public/Build',
]) {
  if (!dockerignore.split(/\r?\n/).includes(pattern)) {
    console.error(`.dockerignore is missing required pattern: ${pattern}`);
    process.exit(1);
  }
}

const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
for (const snippet of [
  'ARG WEBGL_PREVIEW_BASE_IMAGE=',
  'REQUIRE_PINNED_BASE_IMAGE',
  'REQUIRE_APPROVED_BUILD',
  'AS manifest-builder',
  'AS final-verifier',
  'build-manifest.js verify',
  'check-artifact-compatibility.js',
  'COPY --from=final-verifier /verified',
]) {
  if (!dockerfile.includes(snippet)) {
    console.error(`Dockerfile is missing delivery gate: ${snippet}`);
    process.exit(1);
  }
}

console.log('webgl-preview structure-check passed');
