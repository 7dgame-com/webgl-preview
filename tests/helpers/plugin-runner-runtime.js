const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { performance } = require('node:perf_hooks');

const root = path.resolve(__dirname, '..', '..');
const runnerSource = fs.readFileSync(
  path.join(root, 'public/modules/plugin-runner.js'),
  'utf8'
);

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type, init = {}) {
    const event = {
      type,
      target: this,
      currentTarget: this,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...init,
    };
    return [...(this.listeners.get(type) || [])].map((listener) =>
      listener.call(this, event)
    );
  }
}

class FakeElement extends FakeEventTarget {
  constructor(ownerDocument, name) {
    super();
    this.ownerDocument = ownerDocument;
    this.name = name;
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.disabled = false;
    this.open = false;
    this.value = '';
    this.textContent = '';
    this.className = '';
    this.id = '';
    this.src = '';
  }

  setAttribute(name, value) {
    const text = String(value);
    this.attributes.set(name, text);
    if (name === 'id') this.id = text;
    if (name.startsWith('data-')) {
      const key = name
        .slice(5)
        .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = text;
    }
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  append(...children) {
    for (const child of children) {
      child.parentNode = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }

  replaceWith(replacement) {
    const parent = this.parentNode;
    if (!parent) return;
    const index = parent.children.indexOf(this);
    if (index < 0) return;
    this.parentNode = null;
    replacement.parentNode = parent;
    parent.children.splice(index, 1, replacement);
  }

  descendants() {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }

  querySelectorAll(selector) {
    if (selector === '[data-scene-option]') {
      return this.descendants().filter((node) =>
        Object.prototype.hasOwnProperty.call(node.dataset, 'sceneOption')
      );
    }
    return [];
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  contains(target) {
    return target === this || this.descendants().includes(target);
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  click() {
    if (!this.disabled) this.dispatch('click');
  }
}

class FakeDocument extends FakeEventTarget {
  constructor(baseUrl, hostOrigin) {
    super();
    this.baseURI = baseUrl;
    this.referrer = `${hostOrigin}/workspace`;
    this.hidden = false;
    this.fullscreenElement = null;
    this.activeElement = null;
    this.documentElement = new FakeElement(this, 'documentElement');
    this.viewer = new FakeElement(this, 'viewer');
    this.elements = new Map();

    const names = [
      'status',
      'version',
      'scene-controls',
      'scene-picker',
      'scene-search',
      'scene-toggle',
      'scene-popover',
      'scene-list-state',
      'scene-options',
      'scene-retry',
      'scene-pagination',
      'scene-previous',
      'scene-next',
      'scene-page',
      'manual-mode',
      'scene-field',
      'scene-id',
      'run',
      'stop',
      'reload',
      'help-control',
      'fullscreen',
      'token-input',
      'save-token',
      'token-state',
      'api-base',
      'scene-name',
      'resource-count',
      'meta-count',
      'lua-length',
      'log',
      'frame',
      'idle-hint',
      'loading-progress',
      'loading-progress-bar',
      'loading-progress-text',
      'loading-shield',
      'loading-title',
      'loading-detail',
      'development-token',
      'run-error',
      'run-error-title',
      'run-error-code',
      'run-retry',
      'run-return',
    ];
    for (const name of names) {
      this.elements.set(name, new FakeElement(this, name));
    }

    for (const name of [
      'scene-popover',
      'scene-retry',
      'scene-pagination',
      'manual-mode',
      'stop',
      'reload',
      'help-control',
      'fullscreen',
      'loading-progress',
      'loading-shield',
      'development-token',
      'run-error',
    ]) {
      this.elements.get(name).hidden = true;
    }
    this.elements.get('scene-search').disabled = true;
    this.elements.get('scene-toggle').disabled = true;
    this.elements.get('run').disabled = true;
  }

  querySelector(selector) {
    if (selector === '.viewer') return this.viewer;
    const match = /^\[data-([a-z0-9-]+)\]$/.exec(selector);
    return match ? this.elements.get(match[1]) || null : null;
  }

  querySelectorAll() {
    return [];
  }

  createElement(name) {
    return new FakeElement(this, name);
  }

  async exitFullscreen() {
    this.fullscreenElement = null;
  }
}

class FakeScheduler {
  constructor() {
    this.nextId = 1;
    this.tasks = new Map();
  }

  setTimeout(callback, delay = 0, ...args) {
    const id = this.nextId++;
    this.tasks.set(id, { callback, delay: Number(delay) || 0, args, interval: false });
    return id;
  }

  clearTimeout(id) {
    this.tasks.delete(id);
  }

  setInterval(callback, delay = 0, ...args) {
    const id = this.nextId++;
    this.tasks.set(id, { callback, delay: Number(delay) || 0, args, interval: true });
    return id;
  }

  clearInterval(id) {
    this.tasks.delete(id);
  }

  async runDelay(delay) {
    const selected = [...this.tasks.entries()].filter(
      ([, task]) => !task.interval && task.delay === delay
    );
    for (const [id, task] of selected) {
      this.tasks.delete(id);
      task.callback(...task.args);
      await flushMicrotasks();
    }
    return selected.length;
  }

  async runInterval(delay) {
    const selected = [...this.tasks.values()].filter(
      (task) => task.interval && task.delay === delay
    );
    for (const task of selected) {
      task.callback(...task.args);
      await flushMicrotasks();
    }
    return selected.length;
  }
}

function jsonResponse(status, data, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    async json() {
      return data;
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(turns = 24) {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
  }
}

async function waitFor(predicate, message = 'condition', turns = 80) {
  for (let index = 0; index < turns; index += 1) {
    if (predicate()) return;
    await flushMicrotasks(2);
  }
  throw new Error(`Timed out waiting for ${message}`);
}

function normalizeHeaders(headers) {
  return Object.fromEntries(new Headers(headers || {}).entries());
}

async function createPluginRunnerHarness({
  runtimeConfig = {},
  onFetch,
  previewUrl = 'https://preview.example.test/webgl-preview/index.html',
  hostOrigin = 'https://platform.example.test',
} = {}) {
  const scheduler = new FakeScheduler();
  const document = new FakeDocument(previewUrl, hostOrigin);
  const locationUrl = new URL(previewUrl);
  const parentMessages = [];
  const frameMessages = [];
  const fetchCalls = [];
  const parentWindow = {
    postMessage(message, targetOrigin) {
      parentMessages.push({ message, targetOrigin });
    },
  };
  const window = new FakeEventTarget();
  window.parent = parentWindow;
  window.location = {
    href: locationUrl.href,
    origin: locationUrl.origin,
    hostname: locationUrl.hostname,
    search: locationUrl.search,
    ancestorOrigins: [hostOrigin],
  };
  window.history = {
    pushState() {},
    replaceState() {},
  };
  window.setTimeout = scheduler.setTimeout.bind(scheduler);
  window.clearTimeout = scheduler.clearTimeout.bind(scheduler);
  window.setInterval = scheduler.setInterval.bind(scheduler);
  window.clearInterval = scheduler.clearInterval.bind(scheduler);

  const frame = document.elements.get('frame');
  frame.contentWindow = {
    postMessage(message, targetOrigin) {
      frameMessages.push({ message, targetOrigin });
    },
  };

  const config = {
    schemaVersion: 1,
    development: false,
    localDevelopment: false,
    trustedHostOrigins: [hostOrigin],
    platformApiOrigins: [hostOrigin],
    assetOrigins: ['https://data.7dgame.com'],
    standaloneApiBase: '',
    allowManualSceneId: false,
    allowDevelopmentToken: false,
    handshakeTimeoutMs: 10000,
    requestTimeoutMs: 15000,
    unityLoaderTimeoutMs: 600000,
    disposeTimeoutMs: 5000,
    maxDevicePixelRatio: 2,
    ...runtimeConfig,
  };

  async function fetchImpl(input, options = {}) {
    const url = String(input);
    const call = {
      url,
      method: options.method || 'GET',
      headers: normalizeHeaders(options.headers),
      signal: options.signal,
      options,
    };
    fetchCalls.push(call);
    if (new URL(url).pathname.endsWith('/runtime-config.json')) {
      return jsonResponse(200, config);
    }
    if (!onFetch) throw new Error(`Unexpected fetch: ${url}`);
    return onFetch(call);
  }

  const navigator = { language: 'en-US' };
  const sandbox = {
    AbortController,
    DOMException,
    Date,
    Headers,
    Intl,
    Math,
    Set,
    URL,
    URLSearchParams,
    Uint32Array,
    console,
    crypto: webcrypto,
    document,
    fetch: fetchImpl,
    navigator,
    performance,
    structuredClone,
    window,
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(
    `${runnerSource}\n;globalThis.__PLUGIN_RUNNER_TEST__ = {\n` +
      'state, elements, loadMyScenes, runScene, stopScene, handleHostMessage\n' +
      '};',
    context,
    { filename: 'public/modules/plugin-runner.js' }
  );

  await waitFor(
    () => parentMessages.some(({ message }) => message.type === 'PLUGIN_READY'),
    'PLUGIN_READY'
  );
  const api = context.__PLUGIN_RUNNER_TEST__;

  function readyMessage() {
    return parentMessages.find(({ message }) => message.type === 'PLUGIN_READY')?.message;
  }

  function dispatchHostMessage(type, payload = {}, overrides = {}) {
    window.dispatch('message', {
      origin: overrides.origin || hostOrigin,
      source: overrides.source || parentWindow,
      data: {
        type,
        payload: {
          handshakeSession: readyMessage().payload.handshakeSession,
          ...payload,
        },
      },
    });
  }

  return {
    api,
    config,
    context,
    document,
    fetchCalls,
    frameMessages,
    hostOrigin,
    jsonResponse,
    parentMessages,
    parentWindow,
    readyMessage,
    scheduler,
    window,
    dispatchHostMessage,
    flush: flushMicrotasks,
    waitFor,
  };
}

module.exports = {
  createPluginRunnerHarness,
  deferred,
  flushMicrotasks,
  jsonResponse,
  waitFor,
};
