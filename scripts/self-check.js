const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const required = [
  'nginx.conf',
  'public/embed.html',
  'public/plugin/manifest.json',
  'public/Build/Web Preview.loader.js',
  'public/Build/Web Preview.data.gz',
  'public/Build/Web Preview.framework.js.gz',
  'public/Build/Web Preview.wasm.gz',
];

const missing = required.filter((item) => !fs.existsSync(path.join(root, item)));

if (missing.length > 0) {
  console.error('Missing required files:');
  missing.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'public/plugin/manifest.json'), 'utf8')
);

if (manifest.id !== 'webgl-preview') {
  console.error(`Unexpected manifest id: ${manifest.id}`);
  process.exit(1);
}

if (manifest.entry?.frontend !== '/embed.html') {
  console.error(`Unexpected frontend entry: ${manifest.entry?.frontend}`);
  process.exit(1);
}

console.log('webgl-preview self-check passed');
