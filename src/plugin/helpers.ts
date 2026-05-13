import fs from 'node:fs';
import manifest from './manifest.json';

export function getPluginManifest(): unknown {
  return manifest;
}

export function getRuntimeStatus(publicDir: string): Record<string, unknown> {
  return {
    status: 'ok',
    plugin: 'webgl-preview',
    publicDirExists: fs.existsSync(publicDir),
  };
}

