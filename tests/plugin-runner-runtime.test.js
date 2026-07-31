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

async function initialize(harness, token = 'token-a') {
  harness.dispatchHostMessage('INIT', { token });
  await harness.waitFor(
    () => harness.api.state.sceneListStatus !== 'loading',
    'initial scene list'
  );
}

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
  assert.ok(frameUrl.searchParams.get('session'));
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
  await initialize(unauthorized, 'expired-token');
  await unauthorized.scheduler.runDelay(0);
  assert.equal(unauthorizedCalls, 1, '401 is not retried');
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
