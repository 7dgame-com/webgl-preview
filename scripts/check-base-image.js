#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const PINNED_IMAGE_RE = /^[^\s@]+@sha256:[a-f0-9]{64}$/;

const defaultBaseImageFromDockerfile = (dockerfilePath) => {
  const source = fs.readFileSync(dockerfilePath, 'utf8');
  const match = source.match(/^ARG WEBGL_PREVIEW_BASE_IMAGE=(\S+)$/m);
  if (!match) {
    throw new Error('Dockerfile does not declare WEBGL_PREVIEW_BASE_IMAGE');
  }
  return match[1];
};

const isPinnedImage = (reference) => PINNED_IMAGE_RE.test(reference || '');

const resolveBaseImage = ({ dockerfilePath, environment = process.env }) =>
  environment.WEBGL_PREVIEW_BASE_IMAGE ||
  defaultBaseImageFromDockerfile(dockerfilePath);

const runCli = () => {
  const root = path.resolve(__dirname, '..');
  const dockerfilePath = path.join(root, 'Dockerfile');
  const reference = resolveBaseImage({ dockerfilePath });
  const requireDigest = process.argv.includes('--require-digest');

  if (requireDigest && !isPinnedImage(reference)) {
    throw new Error(
      'WEBGL_PREVIEW_BASE_IMAGE must be an immutable name@sha256:<64 hex> reference. Keep the checked-in fallback pinned or configure a pinned repository-variable override.'
    );
  }

  const mode = isPinnedImage(reference) ? 'pinned' : 'mutable-local-default';
  console.log(`WebGL preview base image (${mode}): ${reference}`);
};

if (require.main === module) {
  try {
    runCli();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  defaultBaseImageFromDockerfile,
  isPinnedImage,
  resolveBaseImage,
};
