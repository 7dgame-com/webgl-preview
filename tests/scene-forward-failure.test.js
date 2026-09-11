const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { createEmbedParentProtocol } = require('../public/modules/embed-parent-protocol');

const source = fs.readFileSync(path.resolve(__dirname, '../public/embed.html'), 'utf8');
const forward = source.slice(source.indexOf('function forwardSceneJson(json, options)'), source.indexOf('function sendSceneJson(payload)'));
const session = 'unity-preview-11111111-1111-4111-8111-111111111111';
const origin = 'https://platform.example';

function setup() {
  const posted = [];
  const protocol = createEmbedParentProtocol({ embedded: true, parentWindow: {}, parentOrigin: origin, searchParams: new URLSearchParams({ session }), postMessage: (message, targetOrigin) => posted.push({ message, targetOrigin }) });
  const context = vm.createContext({ unityInstance: { SendMessage() { throw new Error('Unity not available'); } }, webPreviewEmbedded: true, postWebPreviewParent: (message) => protocol.post(message), console: { error() {}, log() {} } });
  vm.runInContext(forward, context);
  return { posted, protocol, run: () => vm.runInContext('forwardSceneJson("{}")', context) };
}

test('Unity scene forwarding failure reports the active session and exact parent origin', () => {
  const h = setup();
  assert.equal(h.run(), false);
  assert.equal(h.posted.length, 1);
  assert.equal(h.posted[0].message.type, 'unity-web-preview-error');
  assert.equal(h.posted[0].message.code, 'SCENE_FORWARD_FAILED');
  assert.equal(h.posted[0].message.session, session);
  assert.equal(h.posted[0].targetOrigin, origin);
});

test('a late Unity forwarding failure cannot notify a disposed session', () => {
  const h = setup();
  h.protocol.post({ type: 'webgl-preview-disposed' });
  h.posted.length = 0;
  assert.equal(h.run(), false);
  assert.equal(h.posted.length, 0);
});
