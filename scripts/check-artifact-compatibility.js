#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const BUILD_ID_RE = /^sha256:[a-f0-9]{64}$/;
const SHELL_VERSION_RE = /^[0-9]{4}\.[0-9]{2}\.[0-9]{2}\.[0-9]+$/;
const PINNED_IMAGE_RE = /^[^\s@]+@sha256:[a-f0-9]{64}$/;

function readJson(filePath, label) {
  let value;
  try {
    value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
  return value;
}

function readShellVersion(runnerPath) {
  const source = fs.readFileSync(runnerPath, 'utf8');
  const match = source.match(
    /^const WEBGL_PREVIEW_VERSION = ["']([^"']+)["'];$/m
  );
  if (!match || !SHELL_VERSION_RE.test(match[1])) {
    throw new Error('Preview Shell version is missing or invalid');
  }
  return match[1];
}

function verifyArtifactCompatibility({ rootDir, baseImage = '' }) {
  const buildManifest = readJson(
    path.join(rootDir, 'build-manifest.json'),
    'Build Manifest'
  );
  const approvals = readJson(
    path.join(rootDir, 'artifact-compatibility.json'),
    'Artifact compatibility metadata'
  );
  const previewShellVersion = readShellVersion(
    path.join(rootDir, 'modules', 'plugin-runner.js')
  );

  if (!BUILD_ID_RE.test(buildManifest.buildId || '')) {
    throw new Error('Build Manifest buildId is missing or invalid');
  }
  if (approvals.schemaVersion !== 1 || !Array.isArray(approvals.combinations)) {
    throw new Error('Artifact compatibility metadata schema is invalid');
  }

  const approved = approvals.combinations.some(
    (combination) =>
      combination?.status === 'approved' &&
      combination.previewShellVersion === previewShellVersion &&
      combination.unityBuildId === buildManifest.buildId &&
      (!baseImage || combination.unityBaseImage === baseImage)
  );
  if (!approved) {
    throw new Error(
      `Unapproved Preview Shell/Unity combination: ${previewShellVersion} + ${buildManifest.buildId}` +
        (baseImage ? ` from ${baseImage}` : '')
    );
  }

  return { previewShellVersion, unityBuildId: buildManifest.buildId };
}

function runCli() {
  const rootFlag = process.argv.indexOf('--root');
  const baseImageFlag = process.argv.indexOf('--base-image');
  const rootDir = path.resolve(
    rootFlag >= 0 && process.argv[rootFlag + 1]
      ? process.argv[rootFlag + 1]
      : path.join(__dirname, '..', 'public')
  );
  const baseImage =
    baseImageFlag >= 0 && process.argv[baseImageFlag + 1]
      ? process.argv[baseImageFlag + 1]
      : '';
  if (baseImage && !PINNED_IMAGE_RE.test(baseImage)) {
    throw new Error('--base-image must be an immutable name@sha256 reference');
  }
  const result = verifyArtifactCompatibility({ rootDir, baseImage });
  console.log(
    `Approved Preview Shell/Unity combination: ${result.previewShellVersion} + ${result.unityBuildId}`
  );
}

if (require.main === module) {
  try {
    runCli();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { readShellVersion, verifyArtifactCompatibility };
