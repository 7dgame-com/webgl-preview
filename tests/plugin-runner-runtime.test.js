const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const {
  createPluginRunnerHarness,
  deferred,
  jsonResponse,
} = require('./helpers/plugin-runner-runtime');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const embed = fs.readFileSync(path.join(root, 'public/embed.html'), 'utf8');
const css = fs.readFileSync(
  path.join(root, 'public/styles/plugin-runner.css'),
  'utf8'
);

function listResponse(items, { page = 1, pages = 1, total = items.length } = {}) {
  return jsonResponse(200, items, {
    'X-Pagination-Current-Page': String(page),
    'X-Pagination-Page-Count': String(pages),
    'X-Pagination-Per-Page': '20',
    'X-Pagination-Total-Count': String(total),
  });
}

function platformCalls(harness) {
  return harness.fetchCalls.filter(
    ({ url }) => !new URL(url).pathname.endsWith('/runtime-config.json')
  );
}

function listCalls(harness) {
  return platformCalls(harness).filter(
    ({ url }) => new URL(url).pathname === '/api/v1/verses'
  );
}

function sceneCalls(harness, sceneId) {
  return platformCalls(harness).filter(
    ({ url }) => new URL(url).pathname === `/api/v1/verses/${sceneId}`
  );
}

function jwtToken({ uid, sub = String(uid), sessionId }) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    uid,
    sub,
    session_id: sessionId,
  })}.test-signature`;
}

function installJwtAtob(harness) {
  harness.window.atob = (value) => Buffer.from(value, 'base64').toString('binary');
}

async function initialize(harness, token = 'token-a') {
  harness.dispatchHostMessage('INIT', { token });
  await harness.waitFor(
    () => harness.api.state.sceneListStatus !== 'loading',
    'initial scene list'
  );
}

test('same-origin fixed API alias wins when INIT omits apiBase', async () => {
  const hostOrigin = 'https://d.dev.xrugc.com';
  const harness = await createPluginRunnerHarness({
    hostOrigin,
    runtimeConfig: {
      platformApiOrigins: ['https://xrugc.com', hostOrigin],
      platformApiAlias: './platform-api',
    },
    onFetch(call) {
      if (
        new URL(call.url).pathname ===
        '/webgl-preview/platform-api/v1/verses'
      ) {
        return listResponse([{ id: 1, name: 'Development scene' }]);
      }
      throw new Error(`Unexpected fetch: ${call.url}`);
    },
  });

  await initialize(harness);

  assert.equal(Object.hasOwn(harness.api.state.config, 'apiBase'), false);
  assert.equal(harness.api.state.sceneListStatus, 'ready');
  const requests = platformCalls(harness);
  assert.equal(requests.length, 1);
  const request = requests[0];
  assert.equal(new URL(request.url).origin, 'https://preview.example.test');
  assert.equal(
    new URL(request.url).pathname,
    '/webgl-preview/platform-api/v1/verses'
  );
  assert.equal(request.options.cache, 'no-store');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.headers.authorization, 'Bearer token-a');
  assert.equal(Object.hasOwn(request.headers, 'cache-control'), false);
  assert.equal(Object.hasOwn(request.headers, 'pragma'), false);
});

test('scene thumbnails use anonymous CORS and fall back without breaking an option', async () => {
  const thumbnailUrl = 'https://data.7dgame.com/scenes/thumbnail.png';
  const harness = await createPluginRunnerHarness({
    onFetch(call) {
      if (new URL(call.url).pathname === '/api/v1/verses') {
        return listResponse([
          { id: 1, name: 'With thumbnail', image: { url: thumbnailUrl } },
          { id: 2, name: 'Without thumbnail' },
        ]);
      }
      throw new Error(`Unexpected fetch: ${call.url}`);
    },
  });

  await initialize(harness);

  const [withThumbnail, withoutThumbnail] =
    harness.api.elements.sceneOptions.children;
  const image = withThumbnail.children[0];
  assert.equal(image.name, 'img');
  assert.equal(image.crossOrigin, 'anonymous');
  assert.equal(image.referrerPolicy, 'no-referrer');
  assert.equal(image.src, thumbnailUrl);

  const emptyPlaceholder = withoutThumbnail.children[0];
  assert.equal(emptyPlaceholder.name, 'span');
  assert.equal(emptyPlaceholder.className, 'scene-thumbnail-placeholder');
  assert.equal(emptyPlaceholder.getAttribute('aria-hidden'), 'true');
  assert.equal(emptyPlaceholder.textContent, '◇');

  image.dispatch('error');
  const failedPlaceholder = withThumbnail.children[0];
  assert.equal(image.parentNode, null);
  assert.equal(failedPlaceholder.name, 'span');
  assert.equal(failedPlaceholder.className, 'scene-thumbnail-placeholder');
  assert.equal(failedPlaceholder.getAttribute('aria-hidden'), 'true');
  assert.equal(failedPlaceholder.textContent, '◇');
  assert.deepEqual(
    withThumbnail.children.map((child) => child.className),
    ['scene-thumbnail-placeholder', 'scene-option-copy', 'scene-option-check']
  );
});

test('trusted handshake drives search, pagination, selection, and pre-run authorization', async () => {
  const lua = deferred();
  const javascript = deferred();
  let harness;
  harness = await createPluginRunnerHarness({
    runtimeConfig: { maxDevicePixelRatio: 1.25 },
    onFetch(call) {
      const url = new URL(call.url);
      if (url.pathname === '/api/v1/verses') {
        const search = url.searchParams.get('VerseSearch[name]');
        if (search === 'Gamma') {
          return listResponse([{ id: 3, name: 'Gamma' }]);
        }
        if (url.searchParams.get('page') === '2') {
          return listResponse([{ id: 2, name: 'Beta' }], {
            page: 2,
            pages: 2,
            total: 3,
          });
        }
        return listResponse(
          [
            { id: 1, name: 'Alpha' },
            { id: 4, name: 'Delta' },
          ],
          { page: 1, pages: 2, total: 3 }
        );
      }
      if (url.pathname === '/api/v1/verses/3') {
        return url.searchParams.get('cl') === 'lua'
          ? lua.promise
          : javascript.promise;
      }
      throw new Error(`Unexpected fetch: ${call.url}`);
    },
  });

  const ready = harness.readyMessage();
  assert.equal(ready.type, 'PLUGIN_READY');
  assert.equal(platformCalls(harness).length, 0, 'no API request before INIT');

  assert.equal(await harness.scheduler.runInterval(500), 1);
  assert.equal(
    harness.parentMessages.filter(({ message }) => message.type === 'PLUGIN_READY').length,
    2,
    'READY is retried until the host is listening'
  );

  harness.window.dispatch('message', {
    origin: harness.hostOrigin,
    source: harness.parentWindow,
    data: {
      type: 'INIT',
      payload: { handshakeSession: 'wrong-session', token: 'stolen-token' },
    },
  });
  await harness.flush();
  assert.equal(platformCalls(harness).length, 0, 'wrong session is ignored');
  assert.equal(harness.api.state.handshakeComplete, false);

  await initialize(harness);
  assert.equal(harness.api.state.handshakeComplete, true);
  assert.equal(harness.api.state.handshakeReadyTimer, 0);
  assert.equal(harness.api.state.lifecycle, 'ready');
  assert.equal(harness.api.state.scenes[0].name, 'Alpha');
  assert.equal(listCalls(harness)[0].headers.authorization, 'Bearer token-a');
  assert.equal(harness.api.elements.scenePagination.hidden, false);

  harness.api.elements.sceneSearch.focus();
  harness.api.elements.sceneSearch.dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(
    harness.document.activeElement.dataset.sceneOption,
    '1',
    'keyboard opens and focuses the first option'
  );
  harness.api.elements.sceneOptions.dispatch('keydown', { key: 'Escape' });
  assert.equal(harness.api.elements.scenePopover.hidden, true);
  assert.equal(harness.document.activeElement, harness.api.elements.sceneSearch);

  harness.api.elements.sceneNext.click();
  await harness.waitFor(
    () => harness.api.state.scenePage === 2 && harness.api.state.scenes[0]?.id === 2,
    'second page'
  );
  assert.equal(new URL(listCalls(harness).at(-1).url).searchParams.get('page'), '2');
  harness.api.elements.sceneOptions.children[0].click();
  assert.equal(harness.api.state.selectedSceneId, 2);
  assert.equal(harness.api.elements.run.disabled, false);
  assert.equal(harness.api.elements.frame.src, '', 'selection does not start Unity');

  harness.api.elements.sceneSearch.value = 'Gamma';
  harness.api.elements.sceneSearch.dispatch('input');
  await harness.flush();
  assert.equal(harness.api.state.selectedSceneId, null);
  assert.equal(listCalls(harness).length, 2, 'search is debounced');
  assert.equal(await harness.scheduler.runDelay(300), 1);
  await harness.waitFor(
    () => harness.api.state.scenes[0]?.id === 3,
    'search results'
  );
  const searchUrl = new URL(listCalls(harness).at(-1).url);
  assert.equal(searchUrl.searchParams.get('page'), '1');
  assert.equal(searchUrl.searchParams.get('VerseSearch[name]'), 'Gamma');

  harness.api.elements.sceneOptions.children[0].click();
  harness.api.elements.run.click();
  await harness.waitFor(() => sceneCalls(harness, 3).length === 2, 'scene authorization');
  assert.equal(
    harness.api.elements.frame.src,
    '',
    'Runner remains stopped until both authorized detail requests complete'
  );
  for (const call of sceneCalls(harness, 3)) {
    assert.equal(call.headers.authorization, 'Bearer token-a');
  }

  const scene = {
    success: true,
    data: { id: 3, name: 'Gamma', data: {}, resources: [], metas: [], code: '' },
  };
  lua.resolve(jsonResponse(200, scene));
  javascript.resolve(jsonResponse(200, scene));
  await harness.waitFor(
    () => harness.api.elements.frame.src.includes('/embed.html'),
    'Runner iframe'
  );
  const frameUrl = new URL(harness.api.elements.frame.src);
  assert.equal(frameUrl.searchParams.get('maxDpr'), '1.25');
  assert.equal(frameUrl.searchParams.get('loaderTimeoutMs'), '600000');
  assert.ok(frameUrl.searchParams.get('session'));
});

test('trusted legacy host can initialize without a handshake session', async () => {
  const harness = await createPluginRunnerHarness({
    onFetch(call) {
      const url = new URL(call.url);
      if (url.pathname === '/api/v1/verses') {
        return listResponse([{ id: 41, name: 'Legacy Host Scene' }]);
      }
      throw new Error(`Unexpected fetch: ${call.url}`);
    },
  });

  harness.window.dispatch('message', {
    origin: harness.hostOrigin,
    source: harness.parentWindow,
    data: {
      type: 'INIT',
      id: 'legacy-init',
      payload: { token: 'legacy-token' },
    },
  });

  await harness.waitFor(
    () => harness.api.state.scenes[0]?.id === 41,
    'legacy host scene list'
  );
  assert.equal(harness.api.state.handshakeComplete, true);
  assert.equal(harness.api.state.legacyHostHandshake, true);
  assert.equal(listCalls(harness)[0].headers.authorization, 'Bearer legacy-token');

  harness.window.dispatch('message', {
    origin: harness.hostOrigin,
    source: harness.parentWindow,
    data: {
      type: 'TOKEN_UPDATE',
      id: 'legacy-token-update',
      payload: { token: 'legacy-token-2' },
    },
  });
  await harness.waitFor(
    () => harness.api.state.token === 'legacy-token-2',
    'legacy token update'
  );

  harness.window.dispatch('message', {
    origin: 'https://attacker.example',
    source: harness.parentWindow,
    data: {
      type: 'TOKEN_UPDATE',
      id: 'untrusted-legacy-token-update',
      payload: { token: 'stolen-token' },
    },
  });
  await harness.flush();
  assert.equal(harness.api.state.token, 'legacy-token-2');
});

test('parallel scene detail 401s share one trusted host token refresh and retry once', async () => {
  const expiredToken = jwtToken({ uid: 7, sessionId: 'session-before-refresh' });
  const refreshedToken = jwtToken({ uid: 7, sessionId: 'session-after-refresh' });
  const detailAttempts = new Map();
  const harness = await createPluginRunnerHarness({
    onFetch(call) {
      const url = new URL(call.url);
      if (url.pathname === '/api/v1/verses') {
        return listResponse([{ id: 45, name: 'Refreshable scene' }]);
      }
      if (url.pathname === '/api/v1/verses/45') {
        const language = url.searchParams.get('cl');
        const attempt = (detailAttempts.get(language) || 0) + 1;
        detailAttempts.set(language, attempt);
        if (attempt === 1) {
          assert.equal(call.headers.authorization, `Bearer ${expiredToken}`);
          return jsonResponse(401, { message: 'expired' });
        }
        assert.equal(call.headers.authorization, `Bearer ${refreshedToken}`);
        return jsonResponse(200, {
          success: true,
          data: {
            id: 45,
            name: 'Refreshable scene',
            data: {},
            resources: [],
            metas: [],
            code: '',
          },
        });
      }
      throw new Error(`Unexpected fetch: ${call.url}`);
    },
  });
  installJwtAtob(harness);
  await initialize(harness, expiredToken);
  harness.api.elements.sceneOptions.children[0].click();
  const identityGeneration = harness.api.state.identityGeneration;
  harness.api.elements.run.click();

  await harness.waitFor(
    () =>
      harness.parentMessages.filter(
        ({ message }) => message.type === 'TOKEN_REFRESH_REQUEST'
      ).length === 1,
    'shared token refresh request'
  );
  const refreshRequest = harness.parentMessages.find(
    ({ message }) => message.type === 'TOKEN_REFRESH_REQUEST'
  );
  assert.equal(refreshRequest.targetOrigin, harness.hostOrigin);
  assert.equal(
    refreshRequest.message.payload.handshakeSession,
    harness.readyMessage().payload.handshakeSession
  );
  assert.match(refreshRequest.message.id, /^webgl-preview-token-refresh-/);
  assert.equal(sceneCalls(harness, 45).length, 2, 'both detail GETs wait together');

  harness.window.dispatch('message', {
    origin: harness.hostOrigin,
    source: harness.parentWindow,
    data: {
      type: 'TOKEN_UPDATE',
      payload: { handshakeSession: 'wrong-session', token: 'stolen-token' },
    },
  });
  await harness.flush();
  assert.equal(harness.api.state.token, expiredToken);
  assert.equal(sceneCalls(harness, 45).length, 2, 'wrong-session update is ignored');

  harness.dispatchHostMessage('TOKEN_UPDATE', { token: expiredToken });
  await harness.flush();
  assert.equal(
    harness.api.state.tokenRefreshWaiter?.handshakeSession,
    harness.readyMessage().payload.handshakeSession,
    'duplicate current token does not settle the pending refresh'
  );
  assert.equal(harness.api.state.identityGeneration, identityGeneration);
  assert.equal(sceneCalls(harness, 45).length, 2);

  harness.dispatchHostMessage('TOKEN_UPDATE', { token: refreshedToken });
  await harness.waitFor(
    () => harness.api.elements.frame.src.includes('/embed.html'),
    'scene run after token refresh'
  );
  assert.equal(harness.api.state.token, refreshedToken);
  assert.equal(harness.api.state.identityGeneration, identityGeneration);
  assert.equal(harness.api.state.selectedSceneId, 45, 'refresh preserves selection');
  assert.equal(listCalls(harness).length, 1, 'refresh does not reload identity data');
  assert.equal(sceneCalls(harness, 45).length, 4, 'each original GET retries once');
  assert.deepEqual([...detailAttempts.values()].sort(), [2, 2]);
  assert.equal(harness.api.state.tokenRefreshWaiter, null);
});

test('principal change racing a token refresh resets identity instead of retrying the old scene', async () => {
  const userAToken = jwtToken({ uid: 7, sessionId: 'user-a-session' });
  const userBToken = jwtToken({ uid: 8, sessionId: 'user-b-session' });
  let listAttempt = 0;
  const harness = await createPluginRunnerHarness({
    onFetch(call) {
      const url = new URL(call.url);
      if (url.pathname === '/api/v1/verses') {
        listAttempt += 1;
        if (listAttempt === 1) {
          assert.equal(call.headers.authorization, `Bearer ${userAToken}`);
          return listResponse([{ id: 45, name: 'User A scene' }]);
        }
        assert.equal(call.headers.authorization, `Bearer ${userBToken}`);
        return listResponse([{ id: 88, name: 'User B scene' }]);
      }
      if (url.pathname === '/api/v1/verses/45') {
        assert.equal(call.headers.authorization, `Bearer ${userAToken}`);
        return jsonResponse(401, { message: 'expired' });
      }
      throw new Error(`Unexpected fetch: ${call.url}`);
    },
  });
  installJwtAtob(harness);
  await initialize(harness, userAToken);
  harness.api.elements.sceneOptions.children[0].click();
  const identityGeneration = harness.api.state.identityGeneration;
  harness.api.elements.run.click();
  await harness.waitFor(
    () => Boolean(harness.api.state.tokenRefreshWaiter),
    'pending token refresh'
  );

  harness.dispatchHostMessage('TOKEN_UPDATE', { token: userBToken });
  await harness.waitFor(
    () => harness.api.state.scenes[0]?.id === 88,
    'new principal scene list'
  );

  assert.equal(harness.api.state.identityGeneration, identityGeneration + 1);
  assert.equal(harness.api.state.token, userBToken);
  assert.equal(harness.api.state.selectedSceneId, null);
  assert.equal(harness.api.state.tokenRefreshWaiter, null);
  assert.equal(sceneCalls(harness, 45).length, 2, 'old scene requests never retry');
  assert.equal(listCalls(harness).length, 2, 'new principal reloads identity data');
  assert.equal(harness.api.elements.frame.src, 'about:blank');
});

test('empty token racing a token refresh resets identity and settles as signed out', async () => {
  const userToken = jwtToken({ uid: 7, sessionId: 'active-session' });
  const harness = await createPluginRunnerHarness({
    onFetch(call) {
      const url = new URL(call.url);
      if (url.pathname === '/api/v1/verses') {
        assert.equal(call.headers.authorization, `Bearer ${userToken}`);
        return listResponse([{ id: 45, name: 'Signed-in scene' }]);
      }
      if (url.pathname === '/api/v1/verses/45') {
        return jsonResponse(401, { message: 'expired' });
      }
      throw new Error(`Unexpected fetch: ${call.url}`);
    },
  });
  installJwtAtob(harness);
  await initialize(harness, userToken);
  harness.api.elements.sceneOptions.children[0].click();
  const identityGeneration = harness.api.state.identityGeneration;
  harness.api.elements.run.click();
  await harness.waitFor(
    () => Boolean(harness.api.state.tokenRefreshWaiter),
    'pending token refresh'
  );

  harness.dispatchHostMessage('TOKEN_UPDATE', { token: '' });
  await harness.waitFor(
    () => harness.api.state.sceneListStatus === '401',
    'signed-out scene list state'
  );

  assert.equal(harness.api.state.identityGeneration, identityGeneration + 1);
  assert.equal(harness.api.state.token, '');
  assert.equal(harness.api.state.selectedSceneId, null);
  assert.equal(harness.api.state.tokenRefreshWaiter, null);
  assert.equal(sceneCalls(harness, 45).length, 2, 'signed-out requests never retry');
  assert.equal(listCalls(harness).length, 1, 'no authenticated list reload is attempted');
  assert.equal(harness.api.elements.frame.src, 'about:blank');
});

test('401 and empty-list UI states are deterministic and production hides manual entry', async () => {
  let unauthorizedCalls = 0;
  const unauthorized = await createPluginRunnerHarness({
    onFetch(call) {
      if (new URL(call.url).pathname === '/api/v1/verses') {
        unauthorizedCalls += 1;
        return jsonResponse(401, { message: 'expired' });
      }
      throw new Error(`Unexpected fetch: ${call.url}`);
    },
  });
  unauthorized.dispatchHostMessage('INIT', { token: 'expired-token' });
  await unauthorized.waitFor(
    () =>
      unauthorized.parentMessages.some(
        ({ message }) => message.type === 'TOKEN_REFRESH_REQUEST'
      ),
    'token refresh request'
  );
  assert.equal(unauthorized.api.state.sceneListStatus, 'loading');
  assert.equal(await unauthorized.scheduler.runDelay(15000), 1);
  await unauthorized.waitFor(
    () => unauthorized.api.state.sceneListStatus === '401',
    'expired token state after refresh timeout'
  );
  await unauthorized.scheduler.runDelay(0);
  assert.equal(unauthorizedCalls, 1, '401 is not retried without a refreshed token');
  assert.equal(unauthorized.api.state.token, 'expired-token');
  assert.equal(unauthorized.api.state.sceneListStatus, '401');
  assert.equal(unauthorized.api.state.lifecycle, 'terminal-error');
  assert.equal(unauthorized.api.elements.sceneListState.getAttribute('role'), 'alert');
  assert.equal(
    unauthorized.api.elements.sceneListState.getAttribute('aria-live'),
    'assertive'
  );
  assert.equal(unauthorized.document.activeElement, unauthorized.api.elements.sceneListState);
  assert.equal(unauthorized.api.elements.sceneRetry.hidden, true);
  assert.equal(unauthorized.api.elements.manualMode.hidden, true);
  assert.equal(unauthorized.api.elements.run.disabled, true);

  const empty = await createPluginRunnerHarness({
    onFetch(call) {
      if (new URL(call.url).pathname === '/api/v1/verses') {
        return listResponse([]);
      }
      throw new Error(`Unexpected fetch: ${call.url}`);
    },
  });
  await initialize(empty);
  assert.equal(empty.api.state.sceneListStatus, 'empty');
  assert.equal(empty.api.elements.sceneOptions.children.length, 0);
  assert.match(empty.api.elements.sceneListState.textContent, /do not have any scenes/i);
  assert.equal(empty.api.elements.manualMode.hidden, true);
  assert.equal(empty.api.elements.run.disabled, true);

  empty.api.elements.sceneSearch.value = 'missing';
  empty.api.elements.sceneSearch.dispatch('input');
  await empty.scheduler.runDelay(300);
  await empty.waitFor(
    () => empty.api.state.sceneListStatus === 'search-empty',
    'empty search results'
  );
  assert.match(empty.api.elements.sceneListState.textContent, /No matching scenes/i);
});

test('retry recovers a terminal list error and restores polite status semantics', async () => {
  let requests = 0;
  const harness = await createPluginRunnerHarness({
    onFetch(call) {
      if (new URL(call.url).pathname !== '/api/v1/verses') {
        throw new Error(`Unexpected fetch: ${call.url}`);
      }
      requests += 1;
      return requests === 1
        ? jsonResponse(500, { message: 'temporary failure' })
        : listResponse([{ id: 9, name: 'Recovered' }]);
    },
  });
  await initialize(harness);
  await harness.scheduler.runDelay(0);
  assert.equal(requests, 1, 'non-gateway 500 is not automatically retried');
  assert.equal(harness.api.state.sceneListStatus, 'error');
  assert.equal(harness.api.elements.sceneRetry.hidden, false);
  assert.equal(harness.document.activeElement, harness.api.elements.sceneRetry);
  assert.equal(harness.api.elements.sceneListState.getAttribute('role'), 'alert');

  harness.api.elements.sceneRetry.click();
  await harness.waitFor(
    () => harness.api.state.sceneListStatus === 'ready',
    'retry recovery'
  );
  assert.equal(requests, 2);
  assert.equal(harness.api.state.scenes[0].name, 'Recovered');
  assert.equal(harness.api.state.lifecycle, 'ready');
  assert.equal(harness.api.elements.sceneListState.getAttribute('role'), 'status');
  assert.equal(harness.api.elements.sceneListState.getAttribute('aria-live'), 'polite');
});

test('identity switch aborts stale search and clears selection and old token state', async () => {
  let requestNumber = 0;
  let staleRequest;
  const harness = await createPluginRunnerHarness({
    onFetch(call) {
      if (new URL(call.url).pathname !== '/api/v1/verses') {
        throw new Error(`Unexpected fetch: ${call.url}`);
      }
      requestNumber += 1;
      if (requestNumber === 1) return listResponse([{ id: 11, name: 'User A' }]);
      if (requestNumber === 2) {
        const pending = deferred();
        staleRequest = { call, pending };
        call.signal.addEventListener(
          'abort',
          () => pending.reject(call.signal.reason || new DOMException('aborted', 'AbortError')),
          { once: true }
        );
        return pending.promise;
      }
      assert.equal(call.headers.authorization, 'Bearer token-b');
      return listResponse([{ id: 22, name: 'User B' }]);
    },
  });
  await initialize(harness, 'token-a');
  harness.api.elements.sceneOptions.children[0].click();
  assert.equal(harness.api.state.selectedSceneId, 11);

  harness.api.elements.sceneSearch.value = 'stale';
  harness.api.elements.sceneSearch.dispatch('input');
  await harness.scheduler.runDelay(300);
  await harness.waitFor(() => Boolean(staleRequest), 'stale search request');
  assert.equal(staleRequest.call.headers.authorization, 'Bearer token-a');

  harness.dispatchHostMessage('TOKEN_UPDATE', { token: 'token-b' });
  await harness.waitFor(() => staleRequest.call.signal.aborted, 'stale request abort');
  await harness.waitFor(
    () => harness.api.state.scenes[0]?.id === 22,
    'new identity list'
  );
  assert.equal(harness.api.state.token, 'token-b');
  assert.equal(harness.api.state.selectedSceneId, null);
  assert.equal(harness.api.elements.sceneSearch.value, '');
  assert.equal(harness.api.state.sceneSearch, '');
  staleRequest.pending.resolve(listResponse([{ id: 99, name: 'Stale A' }]));
  await harness.flush();
  assert.equal(harness.api.state.scenes[0].id, 22, 'late stale data cannot reappear');

  harness.api.elements.sceneOptions.children[0].click();
  assert.equal(harness.api.state.selectedSceneId, 22);
  harness.dispatchHostMessage('DESTROY');
  await harness.waitFor(
    () =>
      harness.api.state.handshakeComplete === false &&
      harness.api.state.lifecycle === 'handshake',
    'destroy cleanup'
  );
  assert.equal(harness.api.state.token, '');
  assert.equal(harness.api.state.selectedSceneId, null);
  assert.equal(harness.api.state.scenes.length, 0);
  assert.equal(harness.api.elements.frame.src, 'about:blank');
});

test('manual compatibility mode uses the authorized detail path and aborts its sibling on denial', async () => {
  let javascriptRequest;
  const harness = await createPluginRunnerHarness({
    runtimeConfig: { allowManualSceneId: true },
    onFetch(call) {
      const url = new URL(call.url);
      if (url.pathname === '/api/v1/verses') return listResponse([]);
      if (url.pathname === '/api/v1/verses/77') {
        if (url.searchParams.get('cl') === 'lua') {
          return jsonResponse(403, { message: 'not yours' });
        }
        const pending = deferred();
        javascriptRequest = { call, pending };
        call.signal.addEventListener(
          'abort',
          () => pending.reject(call.signal.reason || new DOMException('aborted', 'AbortError')),
          { once: true }
        );
        return pending.promise;
      }
      throw new Error(`Unexpected fetch: ${call.url}`);
    },
  });
  await initialize(harness, 'compat-token');
  assert.equal(harness.api.elements.manualMode.hidden, false);

  harness.api.elements.sceneId.value = '0';
  harness.api.elements.sceneId.dispatch('input');
  assert.equal(harness.api.elements.run.disabled, true);
  assert.equal(sceneCalls(harness, 77).length, 0);

  harness.api.elements.sceneId.value = '77';
  harness.api.elements.sceneId.dispatch('input');
  assert.equal(harness.api.elements.run.disabled, false);
  harness.api.elements.run.click();
  await harness.waitFor(() => Boolean(javascriptRequest), 'parallel detail request');
  await harness.waitFor(
    () => harness.api.state.lifecycle === 'terminal-error',
    'authorization denial'
  );
  assert.equal(javascriptRequest.call.signal.aborted, true, 'failed sibling is cancelled');
  assert.equal(harness.api.elements.frame.src, '', 'denied scene never starts Runner');
  assert.equal(harness.api.elements.runErrorCode.textContent, 'WGP-SCENE-DATA-403');
  assert.equal(sceneCalls(harness, 77).length, 2);
  for (const call of sceneCalls(harness, 77)) {
    assert.equal(call.headers.authorization, 'Bearer compat-token');
  }
});

test('URL scene candidate is authorized and cannot preload or start a denied scene', async () => {
  const harness = await createPluginRunnerHarness({
    previewUrl:
      'https://preview.example.test/webgl-preview/index.html?sceneId=88',
    onFetch(call) {
      const url = new URL(call.url);
      if (url.pathname === '/api/v1/verses') return listResponse([]);
      if (url.pathname === '/api/v1/verses/88') {
        return jsonResponse(403, { message: 'not yours' });
      }
      throw new Error(`Unexpected fetch: ${call.url}`);
    },
  });
  await initialize(harness, 'url-token');
  await harness.waitFor(() => sceneCalls(harness, 88).length === 1, 'URL candidate check');
  assert.equal(sceneCalls(harness, 88)[0].headers.authorization, 'Bearer url-token');
  assert.equal(harness.api.state.selectedSceneId, null);
  assert.equal(harness.api.elements.frame.src, '');
  assert.equal(harness.api.elements.manualMode.hidden, true);
});

test('viewport, zoom fallback, and reduced-motion contracts preserve operability hooks', () => {
  const viewport = html.match(/<meta\s+name="viewport"\s+content="([^"]+)"/s)?.[1] || '';
  assert.match(viewport, /width=device-width/);
  assert.match(viewport, /viewport-fit=cover/);
  assert.doesNotMatch(`${html}\n${embed}`, /user-scalable=no|maximum-scale=1/);
  assert.match(css, /\.app-shell\s*\{[\s\S]*?height:\s*100dvh/);
  assert.match(css, /\.scene-options\s*\{[\s\S]*?max-height:\s*min\(360px, 52dvh\)/);

  const mobileBreakpoint = Number(
    css.match(/@media \(max-width:\s*(\d+)px\)/)?.[1] || 0
  );
  const effectiveCssWidthAt200Percent = 1400 / 2;
  assert.ok(mobileBreakpoint >= effectiveCssWidthAt200Percent);
  assert.match(
    css,
    /@media \(max-width:\s*700px\)[\s\S]*?\.scene-picker\s*\{[\s\S]*?width:\s*100%/
  );
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /animation-duration:\s*0\.01ms\s*!important/);
  assert.match(css, /transition-duration:\s*0\.01ms\s*!important/);
});
