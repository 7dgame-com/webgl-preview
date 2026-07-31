#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  parseLocalHttpUpstream,
  startStripPrefixProxy,
} = require('./subpath-container-smoke');

const DEFAULT_UPSTREAM = 'http://127.0.0.1:3006';
const DEFAULT_WALL_TIMEOUT_MS = 300000;
const DEFAULT_POLL_INTERVAL_MS = 500;
const CHROME_START_TIMEOUT_MS = 30000;
const CDP_COMMAND_TIMEOUT_MS = 10000;
const STDERR_TAIL_BYTES = 64 * 1024;

const COMMON_CHROME_PATHS = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  ],
  linux: [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ],
};

const UNITY_STATE_EXPRESSION = `(() => {
  const canvas = document.getElementById("unity-canvas");
  const loadingBar = document.getElementById("unity-loading-bar");
  const loadingShield = document.getElementById("web-preview-loading-shield");
  const warning = document.getElementById("unity-warning");
  const canvasStyle = canvas ? getComputedStyle(canvas) : null;
  const canvasRect = canvas ? canvas.getBoundingClientRect() : null;
  return {
    readyState: document.readyState,
    canvas: canvas ? {
      width: Number(canvas.width),
      height: Number(canvas.height),
      clientWidth: canvasRect.width,
      clientHeight: canvasRect.height,
      display: canvasStyle.display,
      visibility: canvasStyle.visibility
    } : null,
    loadingDisplay: loadingBar ? getComputedStyle(loadingBar).display : "missing",
    shieldDisplay: loadingShield ? getComputedStyle(loadingShield).display : "missing",
    warningChildren: warning ? warning.children.length : -1,
    warningText: warning ? warning.textContent.trim() : "missing"
  };
})()`;

function executableOnDisk(candidate) {
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function pathCandidates(command, env) {
  if (!command || command.includes('/') || command.includes('\\')) return [];
  return String(env.PATH || '')
    .split(path.delimiter)
    .filter(Boolean)
    .map((directory) => path.join(directory, command));
}

function resolveChromeExecutable(options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const isExecutable = options.isExecutable || executableOnDisk;
  const explicit = String(env.CHROME_BIN || '').trim();

  if (explicit) {
    const explicitCandidates =
      explicit.includes('/') || explicit.includes('\\')
        ? [path.resolve(explicit)]
        : pathCandidates(explicit, env);
    const resolved = explicitCandidates.find(isExecutable);
    if (!resolved) {
      throw new Error(`CHROME_BIN is not executable: ${explicit}`);
    }
    return resolved;
  }

  const candidates = [
    ...(COMMON_CHROME_PATHS[platform] || []),
    ...['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser']
      .flatMap((command) => pathCandidates(command, env)),
  ];
  const resolved = [...new Set(candidates)].find(isExecutable);
  if (!resolved) {
    throw new Error(
      'Chrome/Chromium was not found. Set CHROME_BIN to an executable browser path.'
    );
  }
  return resolved;
}

function readBoundedInteger(env, name, fallback, minimum, maximum) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function chromeArguments({ profileDir }) {
  return [
    '--headless',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--no-proxy-server',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-breakpad',
    '--disable-component-update',
    '--disable-crash-reporter',
    '--disable-default-apps',
    '--disable-dev-shm-usage',
    '--disable-extensions',
    '--disable-renderer-backgrounding',
    '--disable-sync',
    '--enable-webgl',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--use-angle=swiftshader',
    '--autoplay-policy=no-user-gesture-required',
    '--mute-audio',
    '--password-store=basic',
    '--use-mock-keychain',
    '--window-size=1280,720',
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ];
}

function isUnityReady(state) {
  const canvas = state && state.canvas;
  return Boolean(
    state &&
      state.readyState === 'complete' &&
      canvas &&
      Number(canvas.width) > 0 &&
      Number(canvas.height) > 0 &&
      Number(canvas.clientWidth) > 0 &&
      Number(canvas.clientHeight) > 0 &&
      canvas.display !== 'none' &&
      !['hidden', 'collapse'].includes(canvas.visibility) &&
      state.loadingDisplay === 'none' &&
      state.shieldDisplay === 'none' &&
      state.warningChildren === 0 &&
      state.warningText === ''
  );
}

function appendTail(current, chunk, maximum = STDERR_TAIL_BYTES) {
  const next = current + chunk.toString('utf8');
  return next.length > maximum ? next.slice(-maximum) : next;
}

function signalProcessGroup(child, signal) {
  if (!child || !child.pid) return;
  if (process.platform !== 'win32') {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall back to the direct child if the process group already exited.
    }
  }
  if (child.exitCode !== null) return;
  try {
    child.kill(signal);
  } catch {
    // The browser already exited.
  }
}

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function terminateChrome(child) {
  if (!child) return;
  signalProcessGroup(child, 'SIGTERM');
  if (child.exitCode === null) {
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      delay(2000),
    ]);
  }
  // The isolated group may still contain renderer/updater descendants after
  // the Chrome group leader exits, especially on macOS.
  signalProcessGroup(child, 'SIGKILL');
  child.stdout?.destroy();
  child.stderr?.destroy();
}

function launchChrome({ chrome, profileDir, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(chrome, chromeArguments({ profileDir }), {
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        GOOGLE_UPDATE_CHECK_INTERVAL: '0',
        KS_DISABLE_GOOGLE_SOFTWARE_UPDATE: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderrTail = '';
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      terminateChrome(child).finally(() => reject(error));
    };
    const timeout = setTimeout(() => {
      fail(new Error(`Chrome DevTools endpoint exceeded ${timeoutMs} ms`));
    }, timeoutMs);

    child.stdout.on('data', () => {});
    child.stderr.on('data', (chunk) => {
      stderrTail = appendTail(stderrTail, chunk);
      const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(stderrTail);
      if (!match || settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        browserWebSocketUrl: match[1],
        child,
        stderrTail: () => stderrTail,
      });
    });
    child.once('error', fail);
    child.once('exit', (code, signal) => {
      if (settled) return;
      fail(
        new Error(
          `Chrome exited before DevTools was ready (${code ?? signal ?? 'unknown'})` +
            (stderrTail.trim() ? `\n${stderrTail.trim().slice(-4000)}` : '')
        )
      );
    });
  });
}

function localDevToolsHttpOrigin(browserWebSocketUrl) {
  const endpoint = new URL(browserWebSocketUrl);
  const hostname = endpoint.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    endpoint.protocol !== 'ws:' ||
    !['127.0.0.1', 'localhost', '::1'].includes(hostname)
  ) {
    throw new Error('Chrome DevTools endpoint must remain on loopback');
  }
  endpoint.protocol = 'http:';
  endpoint.pathname = '/';
  endpoint.search = '';
  endpoint.hash = '';
  return endpoint;
}

async function createPageTarget(browserWebSocketUrl, pageUrl, timeoutMs) {
  const origin = localDevToolsHttpOrigin(browserWebSocketUrl);
  const endpoint = new URL(`/json/new?${encodeURIComponent(pageUrl)}`, origin);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: 'PUT',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Chrome target creation failed (${response.status})`);
    }
    const target = await response.json();
    if (!target || !/^ws:\/\//.test(target.webSocketDebuggerUrl || '')) {
      throw new Error('Chrome target did not return a WebSocket debugger URL');
    }
    localDevToolsHttpOrigin(target.webSocketDebuggerUrl);
    return target;
  } finally {
    clearTimeout(timeout);
  }
}

async function messageText(data) {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString(
      'utf8'
    );
  }
  if (data && typeof data.text === 'function') return data.text();
  return String(data);
}

async function connectCdp(webSocketUrl, timeoutMs) {
  if (typeof WebSocket !== 'function') {
    throw new Error(
      'Node WebSocket is unavailable; run with node --experimental-websocket'
    );
  }
  localDevToolsHttpOrigin(webSocketUrl);
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`CDP WebSocket connection exceeded ${timeoutMs} ms`));
    }, timeoutMs);
    const cleanup = () => clearTimeout(timeout);
    socket.addEventListener(
      'open',
      () => {
        cleanup();
        resolve();
      },
      { once: true }
    );
    socket.addEventListener(
      'error',
      () => {
        cleanup();
        reject(new Error('CDP WebSocket connection failed'));
      },
      { once: true }
    );
  });

  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', async (event) => {
    let message;
    try {
      message = JSON.parse(await messageText(event.data));
    } catch {
      return;
    }
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(request.timeout);
    if (message.error) {
      request.reject(new Error(`CDP ${request.method}: ${message.error.message}`));
    } else {
      request.resolve(message.result || {});
    }
  });
  const rejectPending = () => {
    for (const request of pending.values()) {
      clearTimeout(request.timeout);
      request.reject(new Error(`CDP connection closed during ${request.method}`));
    }
    pending.clear();
  };
  socket.addEventListener('close', rejectPending, { once: true });

  return {
    close() {
      rejectPending();
      try {
        socket.close();
      } catch {
        // Chrome may already have closed the target.
      }
    },
    request(method, params = {}) {
      if (socket.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error(`CDP connection is not open for ${method}`));
      }
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`CDP ${method} exceeded ${CDP_COMMAND_TIMEOUT_MS} ms`));
        }, CDP_COMMAND_TIMEOUT_MS);
        pending.set(id, { method, reject, resolve, timeout });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

async function evaluateUnityState(cdp) {
  const result = await cdp.request('Runtime.evaluate', {
    expression: UNITY_STATE_EXPRESSION,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error('Runtime.evaluate reported an exception');
  }
  return result.result && result.result.value;
}

async function waitForUnityReady({ cdp, chromeProcess, deadline, pollIntervalMs }) {
  let lastState = null;
  let lastEvaluationError = null;
  while (Date.now() < deadline) {
    if (chromeProcess.child.exitCode !== null) {
      throw new Error(
        `Chrome exited before Unity became ready (${chromeProcess.child.exitCode})` +
          (chromeProcess.stderrTail().trim()
            ? `\n${chromeProcess.stderrTail().trim().slice(-4000)}`
            : '')
      );
    }
    try {
      lastState = await evaluateUnityState(cdp);
      lastEvaluationError = null;
      if (isUnityReady(lastState)) return lastState;
      if (/WGP-(?:BUILD|UNITY)-/.test(lastState?.warningText || '')) {
        throw new Error(`Unity startup failed: ${lastState.warningText}`);
      }
    } catch (error) {
      if (/Unity startup failed:/.test(error.message || '')) throw error;
      lastEvaluationError = error;
    }
    await delay(Math.min(pollIntervalMs, Math.max(1, deadline - Date.now())));
  }
  throw new Error(
    'Unity browser smoke timed out before the real ready state. ' +
      `Last state: ${JSON.stringify(lastState)}` +
      (lastEvaluationError
        ? `; last CDP error: ${lastEvaluationError.message}`
        : '')
  );
}

async function waitForHealth(upstream, timeoutMs = 30000) {
  const healthUrl = new URL('api/health', upstream).toString();
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    try {
      const response = await fetch(healthUrl, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (response.ok) return;
      lastError = new Error(`health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
    await delay(250);
  }
  throw lastError || new Error(`candidate health timed out: ${healthUrl}`);
}

async function smokeUrl({ chrome, label, baseUrl, wallTimeoutMs, pollIntervalMs }) {
  const profileDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'webgl-preview-chrome-')
  );
  const url = new URL('embed.html', baseUrl);
  url.searchParams.set('lang', 'en');
  url.searchParams.set('loaderTimeoutMs', '300000');
  url.searchParams.set('session', 'browser-smoke-session');
  const deadline = Date.now() + wallTimeoutMs;
  let chromeProcess = null;
  let cdp = null;
  try {
    chromeProcess = await launchChrome({
      chrome,
      profileDir,
      timeoutMs: Math.min(CHROME_START_TIMEOUT_MS, wallTimeoutMs),
    });
    const target = await createPageTarget(
      chromeProcess.browserWebSocketUrl,
      url.toString(),
      Math.min(CDP_COMMAND_TIMEOUT_MS, Math.max(1, deadline - Date.now()))
    );
    cdp = await connectCdp(
      target.webSocketDebuggerUrl,
      Math.min(CDP_COMMAND_TIMEOUT_MS, Math.max(1, deadline - Date.now()))
    );
    await cdp.request('Runtime.enable');
    const state = await waitForUnityReady({
      cdp,
      chromeProcess,
      deadline,
      pollIntervalMs,
    });
    console.log(
      `webgl-preview browser smoke passed (${label}: ${url}; ` +
        `canvas ${state.canvas.clientWidth}x${state.canvas.clientHeight})`
    );
  } finally {
    cdp?.close();
    await terminateChrome(chromeProcess?.child);
    fs.rmSync(profileDir, {
      force: true,
      maxRetries: 5,
      recursive: true,
      retryDelay: 100,
    });
  }
}

async function main(upstreamValue = process.argv[2] || DEFAULT_UPSTREAM) {
  if (typeof WebSocket !== 'function') {
    throw new Error(
      'Node WebSocket is unavailable; run with node --experimental-websocket'
    );
  }
  const upstream = parseLocalHttpUpstream(upstreamValue);
  const chrome = resolveChromeExecutable();
  const wallTimeoutMs = readBoundedInteger(
    process.env,
    'BROWSER_SMOKE_TIMEOUT_MS',
    DEFAULT_WALL_TIMEOUT_MS,
    5000,
    900000
  );
  const pollIntervalMs = readBoundedInteger(
    process.env,
    'BROWSER_SMOKE_POLL_MS',
    DEFAULT_POLL_INTERVAL_MS,
    100,
    5000
  );

  console.log(`Using Chrome/Chromium: ${chrome}`);
  await waitForHealth(upstream);
  await smokeUrl({
    chrome,
    label: 'root',
    baseUrl: upstream.toString(),
    wallTimeoutMs,
    pollIntervalMs,
  });

  const proxy = await startStripPrefixProxy(upstream.toString());
  try {
    await smokeUrl({
      chrome,
      label: 'strip-prefix /webgl-preview/',
      baseUrl: proxy.baseUrl,
      wallTimeoutMs,
      pollIntervalMs,
    });
  } finally {
    await proxy.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  chromeArguments,
  isUnityReady,
  main,
  readBoundedInteger,
  resolveChromeExecutable,
};
