const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  MODES,
  createEmbedParentProtocol,
  isValidSession,
} = require('../public/modules/embed-parent-protocol');

const PARENT_ORIGIN = 'https://d.xiading.hxgxonline.com';
const SESSION_A = 'unity-preview-11111111-1111-4111-8111-111111111111';
const SESSION_B = 'unity-preview-22222222-2222-4222-8222-222222222222';

function createHarness(query = '', overrides = {}) {
  const parentWindow = overrides.parentWindow || {};
  const posted = [];
  const protocol = createEmbedParentProtocol({
    embedded: overrides.embedded ?? true,
    parentWindow,
    parentOrigin: overrides.parentOrigin || PARENT_ORIGIN,
    searchParams: new URLSearchParams(query),
    postMessage(message, targetOrigin) {
      posted.push({ message, targetOrigin });
    },
  });
  const event = (message, options = {}) => ({
    data: message,
    origin: options.origin || PARENT_ORIGIN,
    source: options.source || parentWindow,
  });
  return { event, parentWindow, posted, protocol };
}

function markReady(harness) {
  assert.equal(
    harness.protocol.post({ type: 'unity-web-preview-ready' }),
    true
  );
}

test('E-transition accepts H0 only in a source/origin-bound legacy epoch', () => {
  const harness = createHarness();
  const scene = { type: 'xrugc-load-scene-json', payload: { id: 7 } };

  assert.equal(harness.protocol.mode, MODES.LEGACY);
  assert.equal(harness.protocol.accept(harness.event(scene), scene), false);
  markReady(harness);
  assert.deepEqual(harness.posted, [
    {
      message: { type: 'unity-web-preview-ready' },
      targetOrigin: PARENT_ORIGIN,
    },
  ]);
  assert.equal(harness.protocol.accept(harness.event(scene), scene), true);
  assert.equal(
    harness.protocol.accept(harness.event({ ...scene }), { ...scene }),
    false,
    'a scene payload is consumed only once per legacy iframe epoch'
  );
});

test('E-transition accepts HT/H1 only with the exact session nonce', () => {
  const harness = createHarness(`session=${encodeURIComponent(SESSION_A)}`);
  const exact = { type: 'xrugc-load-scene-json', session: SESSION_A };

  assert.equal(harness.protocol.mode, MODES.SESSION);
  assert.equal(harness.protocol.session, SESSION_A);
  markReady(harness);
  assert.equal(harness.posted[0].message.session, SESSION_A);
  assert.equal(
    harness.protocol.accept(
      harness.event({ type: 'unity-web-preview-camera-mode' }),
      { type: 'unity-web-preview-camera-mode' }
    ),
    false
  );
  assert.equal(
    harness.protocol.accept(
      harness.event({ ...exact, session: SESSION_B }),
      { ...exact, session: SESSION_B }
    ),
    false
  );
  assert.equal(harness.protocol.accept(harness.event(exact), exact), true);
});

test('attacker source and origin cannot activate either protocol', () => {
  for (const query of ['', `session=${encodeURIComponent(SESSION_A)}`]) {
    const harness = createHarness(query);
    const session = harness.protocol.mode === MODES.SESSION
      ? { session: SESSION_A }
      : {};
    const camera = { type: 'unity-web-preview-camera-mode', ...session };
    markReady(harness);

    assert.equal(
      harness.protocol.accept(
        harness.event(camera, { source: {} }),
        camera
      ),
      false
    );
    assert.equal(
      harness.protocol.accept(
        harness.event(camera, { origin: 'https://attacker.example' }),
        camera
      ),
      false
    );
    assert.equal(harness.protocol.accept(harness.event(camera), camera), true);
  }
});

test('protocol mode is immutable and rejects downgrade or switch attempts', () => {
  const legacy = createHarness();
  const session = createHarness(`session=${encodeURIComponent(SESSION_A)}`);
  markReady(legacy);
  markReady(session);

  const legacySwitch = {
    type: 'unity-web-preview-camera-mode',
    session: SESSION_A,
  };
  assert.equal(
    legacy.protocol.accept(legacy.event(legacySwitch), legacySwitch),
    false
  );
  assert.equal(legacy.protocol.mode, MODES.LEGACY);

  const sessionDowngrade = { type: 'unity-web-preview-camera-mode' };
  assert.equal(
    session.protocol.accept(session.event(sessionDowngrade), sessionDowngrade),
    false
  );
  assert.equal(session.protocol.mode, MODES.SESSION);
});

test('empty, duplicate, and malformed session parameters fail closed', () => {
  for (const query of [
    'session=',
    'session=short',
    `session=${encodeURIComponent(SESSION_A)}&session=${encodeURIComponent(SESSION_A)}`,
    'session=unity-preview-valid-length-but-has-%2F-slash',
  ]) {
    const harness = createHarness(query);
    assert.equal(harness.protocol.mode, MODES.INVALID, query);
    assert.equal(harness.protocol.phase, 'invalid', query);
    assert.equal(
      harness.protocol.post({ type: 'unity-web-preview-ready' }),
      false,
      query
    );
  }
  assert.equal(isValidSession(SESSION_A), true);
  assert.equal(isValidSession('short'), false);
});

test('old session replays cannot cross iframe epochs', () => {
  const first = createHarness(`session=${encodeURIComponent(SESSION_A)}`);
  const second = createHarness(`session=${encodeURIComponent(SESSION_B)}`);
  markReady(first);
  markReady(second);

  const stale = { type: 'xrugc-load-scene-json', session: SESSION_A };
  const current = { type: 'xrugc-load-scene-json', session: SESSION_B };
  assert.equal(second.protocol.accept(second.event(stale), stale), false);
  assert.equal(second.protocol.accept(second.event(current), current), true);
});

test('dispose is terminal and closes the epoch against later messages', () => {
  const harness = createHarness(`session=${encodeURIComponent(SESSION_A)}`);
  markReady(harness);
  const dispose = { type: 'webgl-preview-dispose', session: SESSION_A };

  assert.equal(harness.protocol.accept(harness.event(dispose), dispose), true);
  assert.equal(harness.protocol.phase, 'closing');
  assert.equal(
    harness.protocol.post({ type: 'webgl-preview-loading', visible: false }),
    false
  );
  assert.equal(
    harness.protocol.post({ type: 'webgl-preview-disposed' }),
    true
  );
  assert.equal(harness.protocol.phase, 'closed');
  assert.equal(harness.protocol.accept(harness.event(dispose), dispose), false);
  assert.equal(harness.posted.at(-1).message.session, SESSION_A);
});

test('standalone and non-origin parent bindings cannot open a message channel', () => {
  for (const harness of [
    createHarness('', { embedded: false }),
    createHarness('', { parentOrigin: `${PARENT_ORIGIN}/path` }),
    createHarness('', { parentOrigin: 'https://user:pass@example.com' }),
  ]) {
    assert.equal(harness.protocol.phase, 'invalid');
    assert.equal(
      harness.protocol.post({ type: 'unity-web-preview-ready' }),
      false
    );
  }
});
