#!/usr/bin/env node

const { execFileSync, spawnSync } = require('node:child_process');

const port = Number(process.env.WEBGL_PREVIEW_SMOKE_PORT || '3006');
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('WEBGL_PREVIEW_SMOKE_PORT must be an integer from 1024 to 65535');
}

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: 'inherit', ...options });
}

run('docker', ['compose', 'build', 'webgl-preview']);

const imageRef = execFileSync(
  'docker',
  ['compose', 'images', '--quiet', 'webgl-preview'],
  { encoding: 'utf8' }
)
  .trim()
  .split(/\s+/)[0];

if (!imageRef) {
  throw new Error('docker compose did not return the built webgl-preview image');
}

const containerName = `webgl-preview-smoke-${process.pid}-${Date.now()}`;

try {
  run('docker', [
    'run',
    '--detach',
    '--name',
    containerName,
    '--env',
    'HOST_API_BASE=https://127.0.0.1:9',
    '--publish',
    `127.0.0.1:${port}:80`,
    imageRef,
  ]);
  run(process.execPath, [
    'scripts/container-smoke.js',
    `http://127.0.0.1:${port}`,
  ]);
  run(process.execPath, [
    'scripts/subpath-container-smoke.js',
    `http://127.0.0.1:${port}`,
  ]);
  run(process.execPath, [
    '--experimental-websocket',
    'scripts/browser-smoke.js',
    `http://127.0.0.1:${port}`,
  ]);
} finally {
  spawnSync('docker', ['rm', '--force', containerName], { stdio: 'ignore' });
}
