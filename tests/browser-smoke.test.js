const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  chromeArguments,
  isUnityReady,
  readBoundedInteger,
  resolveChromeExecutable,
} = require('../scripts/browser-smoke');
const {
  parseLocalHttpUpstream,
} = require('../scripts/subpath-container-smoke');

const readyState = {
  readyState: 'complete',
  canvas: {
    width: 960,
    height: 600,
    clientWidth: 960,
    clientHeight: 600,
    display: 'block',
    visibility: 'visible',
  },
  loadingDisplay: 'none',
  shieldDisplay: 'none',
  warningChildren: 0,
  warningText: '',
};

test('browser smoke accepts only the final computed Unity-ready state', () => {
  assert.equal(isUnityReady(readyState), true);
  assert.equal(
    isUnityReady({ ...readyState, loadingDisplay: 'block' }),
    false
  );
  assert.equal(
    isUnityReady({ ...readyState, shieldDisplay: 'grid' }),
    false
  );
  assert.equal(
    isUnityReady({ ...readyState, warningChildren: 1, warningText: 'error' }),
    false
  );
  assert.equal(
    isUnityReady({
      ...readyState,
      canvas: { ...readyState.canvas, clientWidth: 0 },
    }),
    false
  );
});

test('browser smoke exposes only a loopback ephemeral CDP endpoint and isolated profile', () => {
  const args = chromeArguments({
    profileDir: '/tmp/browser-profile-fixture',
  });
  assert.ok(args.includes('--headless'));
  assert.ok(args.includes('--remote-debugging-address=127.0.0.1'));
  assert.ok(args.includes('--remote-debugging-port=0'));
  assert.ok(args.includes('--user-data-dir=/tmp/browser-profile-fixture'));
  assert.ok(args.includes('--no-proxy-server'));
  assert.equal(args.at(-1), 'about:blank');
  assert.equal(args.some((arg) => arg.startsWith('--virtual-time-budget=')), false);
  assert.equal(args.includes('--dump-dom'), false);
});

test('CHROME_BIN is authoritative and PATH command discovery is supported', () => {
  assert.equal(
    resolveChromeExecutable({
      env: { CHROME_BIN: '/opt/chrome', PATH: '' },
      platform: 'linux',
      isExecutable: (candidate) => candidate === '/opt/chrome',
    }),
    '/opt/chrome'
  );
  assert.equal(
    resolveChromeExecutable({
      env: { CHROME_BIN: 'chromium', PATH: '/tools:/usr/bin' },
      platform: 'linux',
      isExecutable: (candidate) => candidate === '/tools/chromium',
    }),
    '/tools/chromium'
  );
  assert.throws(
    () =>
      resolveChromeExecutable({
        env: { CHROME_BIN: '/missing/chrome', PATH: '' },
        platform: 'linux',
        isExecutable: () => false,
      }),
    /CHROME_BIN is not executable/
  );
});

test('browser and strip-prefix smoke accept only credential-free loopback HTTP origins', () => {
  assert.equal(
    parseLocalHttpUpstream('http://127.0.0.1:3006').origin,
    'http://127.0.0.1:3006'
  );
  assert.equal(
    parseLocalHttpUpstream('http://[::1]:3006').origin,
    'http://[::1]:3006'
  );
  for (const value of [
    'https://127.0.0.1:3006',
    'http://example.com:3006',
    'http://user:pass@127.0.0.1:3006',
    'http://127.0.0.1:3006/nested',
  ]) {
    assert.throws(() => parseLocalHttpUpstream(value), /loopback HTTP origin/);
  }
});

test('browser smoke timeout controls are bounded integers', () => {
  assert.equal(readBoundedInteger({}, 'TIMEOUT', 10, 1, 20), 10);
  assert.equal(readBoundedInteger({ TIMEOUT: '12' }, 'TIMEOUT', 10, 1, 20), 12);
  assert.throws(
    () => readBoundedInteger({ TIMEOUT: '0' }, 'TIMEOUT', 10, 1, 20),
    /must be an integer/
  );
  assert.throws(
    () => readBoundedInteger({ TIMEOUT: '1.5' }, 'TIMEOUT', 10, 1, 20),
    /must be an integer/
  );
});
