#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const BUILD_VERSION_MARKER = '__WEBGL_PREVIEW_BUILD_VERSION__';
const BUILD_VERSION_RE =
  /^\d{4}\.(?:0[1-9]|1[0-2])\.(?:0[1-9]|[12]\d|3[01])-(?:[01]\d|2[0-3])[0-5]\d$/;
const TARGETS = [
  { relativePath: 'index.html', expectedMarkers: 2 },
  { relativePath: 'embed.html', expectedMarkers: 2 },
  { relativePath: 'modules/plugin-runner.js', expectedMarkers: 1 },
];

function markerCount(source) {
  return source.split(BUILD_VERSION_MARKER).length - 1;
}

function isValidBuildVersion(value) {
  const normalized = String(value || '').trim();
  if (!BUILD_VERSION_RE.test(normalized)) return false;
  const [year, month, day] = normalized
    .slice(0, 10)
    .split('.')
    .map(Number);
  const calendarDate = new Date(0);
  calendarDate.setUTCHours(0, 0, 0, 0);
  calendarDate.setUTCFullYear(year, month - 1, day);
  return (
    calendarDate.getUTCFullYear() === year &&
    calendarDate.getUTCMonth() === month - 1 &&
    calendarDate.getUTCDate() === day
  );
}

function injectBuildVersion({ rootDir, version, required = false }) {
  const normalizedVersion = String(version || '').trim();
  if (!normalizedVersion) {
    if (required) {
      throw new Error('WEBGL_PREVIEW_BUILD_VERSION is required for release builds');
    }
    return { injected: false, version: '' };
  }
  if (!isValidBuildVersion(normalizedVersion)) {
    throw new Error(
      'WEBGL_PREVIEW_BUILD_VERSION must use Beijing time format YYYY.MM.DD-HHmm'
    );
  }

  const replacements = TARGETS.map(({ relativePath, expectedMarkers }) => {
    const filePath = path.join(rootDir, relativePath);
    const source = fs.readFileSync(filePath, 'utf8');
    const actualMarkers = markerCount(source);
    if (actualMarkers !== expectedMarkers) {
      throw new Error(
        `${relativePath} must contain ${expectedMarkers} build-version marker(s); found ${actualMarkers}`
      );
    }
    return {
      filePath,
      source: source.replaceAll(BUILD_VERSION_MARKER, normalizedVersion),
    };
  });

  for (const replacement of replacements) {
    fs.writeFileSync(replacement.filePath, replacement.source);
  }
  return { injected: true, version: normalizedVersion };
}

function verifyInjectedBuildVersion({ rootDir }) {
  const sources = new Map();
  for (const { relativePath } of TARGETS) {
    const source = fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
    if (markerCount(source) !== 0) {
      throw new Error(`${relativePath} contains an uninjected build-version marker`);
    }
    sources.set(relativePath, source);
  }

  const runner = sources.get('modules/plugin-runner.js');
  const buildVersion = runner.match(
    /^const WEBGL_PREVIEW_BUILD_VERSION = ["']([^"']+)["'];$/m
  )?.[1];
  if (!isValidBuildVersion(buildVersion)) {
    throw new Error('Injected WebGL Preview build version is missing or invalid');
  }
  const index = sources.get('index.html');
  if (index.split(`?v=${buildVersion}`).length - 1 !== 2) {
    throw new Error('Shell cache keys do not match the injected build version');
  }
  const embed = sources.get('embed.html');
  if (embed.split(`?v=${buildVersion}`).length - 1 !== 2) {
    throw new Error('Embed module cache keys do not match the injected build version');
  }
  return { version: buildVersion };
}

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] !== undefined
    ? process.argv[index + 1]
    : '';
}

function runCli() {
  const rootDir = path.resolve(
    optionValue('--root') || path.join(__dirname, '..', 'public')
  );
  if (process.argv.includes('--verify')) {
    const result = verifyInjectedBuildVersion({ rootDir });
    console.log(`Verified WebGL Preview build version ${result.version}`);
    return;
  }
  const version =
    optionValue('--version') || process.env.WEBGL_PREVIEW_BUILD_VERSION || '';
  const result = injectBuildVersion({
    rootDir,
    version,
    required: process.argv.includes('--require'),
  });
  if (result.injected) {
    console.log(`Injected WebGL Preview build version ${result.version}`);
  } else {
    console.log('Build-version marker retained for local development');
  }
}

if (require.main === module) {
  try {
    runCli();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  BUILD_VERSION_MARKER,
  BUILD_VERSION_RE,
  injectBuildVersion,
  isValidBuildVersion,
  verifyInjectedBuildVersion,
};
