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

const lfsManagedBuildFiles = [
  'public/Build/Web Preview.data.gz',
  'public/Build/Web Preview.framework.js.gz',
  'public/Build/Web Preview.wasm.gz',
];

for (const file of lfsManagedBuildFiles) {
  const absolutePath = path.join(root, file);
  const stat = fs.statSync(absolutePath);
  const head = fs.readFileSync(absolutePath, 'utf8').slice(0, 128);

  if (head.includes('https://git-lfs.github.com/spec/v1')) {
    console.error(`Build asset is still a Git LFS pointer: ${file}`);
    process.exit(1);
  }

  if (stat.size < 1024) {
    console.error(`Build asset is unexpectedly small: ${file} (${stat.size} bytes)`);
    process.exit(1);
  }
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

const nginxConfig = fs.readFileSync(path.join(root, 'nginx.conf'), 'utf8');
for (const expectedSnippet of [
  'location = /__xrugc_proxy__',
  'proxy_pass $arg_url',
  'location ~* \\.wasm\\.gz$',
  'Content-Encoding gzip',
]) {
  if (!nginxConfig.includes(expectedSnippet)) {
    console.error(`Missing nginx config snippet: ${expectedSnippet}`);
    process.exit(1);
  }
}

console.log('webgl-preview self-check passed');
