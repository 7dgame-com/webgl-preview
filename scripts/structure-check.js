const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const required = [
  '.dockerignore',
  '.env.example',
  '.github/workflows/webgl-preview-ci.yml',
  'nginx.conf',
  'README-quickstart.md',
  'docs/STRUCTURE.md',
  'docs/INTEGRATION.md',
  'public/plugin/manifest.json',
  'scripts/dev-server.js',
];

const missing = required.filter((item) => !fs.existsSync(path.join(root, item)));

if (missing.length > 0) {
  console.error('Missing repository structure files:');
  missing.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

const dockerignore = fs.readFileSync(path.join(root, '.dockerignore'), 'utf8');
for (const pattern of ['node_modules', 'dist', '.git', '.github', '.DS_Store']) {
  if (!dockerignore.split(/\r?\n/).includes(pattern)) {
    console.error(`.dockerignore is missing required pattern: ${pattern}`);
    process.exit(1);
  }
}

console.log('webgl-preview structure-check passed');
