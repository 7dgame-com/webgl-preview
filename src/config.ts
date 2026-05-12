import path from 'node:path';

export const HOST = process.env['HOST'] || '0.0.0.0';
export const PORT = Number(process.env['PORT'] || 3006);
export const PLUGIN_ID = process.env['PLUGIN_ID'] || 'webgl-preview';
export const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
