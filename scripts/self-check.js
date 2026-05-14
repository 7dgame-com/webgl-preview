const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const required = [
  'nginx.conf',
  'public/embed.html',
  'public/sw.js',
  'public/plugin/manifest.json',
];

const missing = required.filter((item) => !fs.existsSync(path.join(root, item)));

if (missing.length > 0) {
  console.error('Missing required files:');
  missing.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

const buildDir = path.join(root, 'public/Build');
const buildFiles = fs.existsSync(buildDir) ? fs.readdirSync(buildDir) : [];
const findBuildFile = (pattern, label) => {
  const fileName = buildFiles.find((file) => pattern.test(file));
  if (!fileName) {
    console.error(`Missing WebGL build file: ${label}`);
    process.exit(1);
  }
  return path.join('public/Build', fileName);
};

const loaderFile = findBuildFile(/^[a-f0-9]{32}\.loader\.js$/, 'hashed loader.js');
const compressedBuildFiles = [
  findBuildFile(/^[a-f0-9]{32}\.data\.br$/, 'hashed data.br'),
  findBuildFile(/^[a-f0-9]{32}\.framework\.js\.br$/, 'hashed framework.js.br'),
  findBuildFile(/^[a-f0-9]{32}\.wasm\.br$/, 'hashed wasm.br'),
];

if (fs.statSync(path.join(root, loaderFile)).size < 1024) {
  console.error(`Build loader is unexpectedly small: ${loaderFile}`);
  process.exit(1);
}

for (const file of compressedBuildFiles) {
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
  'location ~* \\.wasm\\.br$',
  'Content-Encoding br',
  'location = /sw.js',
]) {
  if (!nginxConfig.includes(expectedSnippet)) {
    console.error(`Missing nginx config snippet: ${expectedSnippet}`);
    process.exit(1);
  }
}

console.log('webgl-preview self-check passed');
