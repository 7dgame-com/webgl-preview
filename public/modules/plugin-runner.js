const PLUGIN_ID = "webgl-preview";
const WEBGL_PREVIEW_VERSION = "2026.05.19.5";
const UNITY_PREVIEW_VERSE_EXPAND =
  "id,name,description,data,metas,metas.code,metas.metaCode,resources,code,uuid,verseCode";
const SNAPSHOT_EXPAND =
  "id,name,description,data,metas,resources,code,uuid,image,managers,verse_id";
const DEFAULT_SNAPSHOT_URL = "https://a2.bujiaban.com/v1/server/snapshot";
const LEGACY_COS_HOST =
  "7dgame-public-1251022382.cos.ap-nanjing.myqcloud.com";
const CDN_HOST = "data.7dgame.com";
const ASSET_PATH_RE =
  /\.(?:png|jpe?g|gif|webp|bmp|svg|mp3|wav|ogg|m4a|mp4|webm|glb|gltf|fbx|obj|vox)(?:[?#]|$)/i;
const VIDEO_PATH_RE = /\.(?:mp4|webm)(?:[?#]|$)/i;
const LOCAL_TOKEN_STORAGE_KEY = "xrugc.webglPreview.token";

const state = {
  token: "",
  config: {},
  payload: null,
  frameReady: false,
  pendingRun: false,
  stopped: false,
  running: false,
  busy: false,
  sceneLoading: false,
  cacheActive: false,
  frameSession: "",
  runSerial: 0,
};

const elements = {
  status: document.querySelector("[data-status]"),
  version: document.querySelector("[data-version]"),
  sceneField: document.querySelector("[data-scene-field]"),
  sceneId: document.querySelector("[data-scene-id]"),
  run: document.querySelector("[data-run]"),
  stop: document.querySelector("[data-stop]"),
  reload: document.querySelector("[data-reload]"),
  tokenInput: document.querySelector("[data-token-input]"),
  saveToken: document.querySelector("[data-save-token]"),
  tokenState: document.querySelector("[data-token-state]"),
  apiBase: document.querySelector("[data-api-base]"),
  sceneName: document.querySelector("[data-scene-name]"),
  resourceCount: document.querySelector("[data-resource-count]"),
  metaCount: document.querySelector("[data-meta-count]"),
  luaLength: document.querySelector("[data-lua-length]"),
  log: document.querySelector("[data-log]"),
  frame: document.querySelector("[data-frame]"),
  idleHint: document.querySelector("[data-idle-hint]"),
  loadingShield: document.querySelector("[data-loading-shield]"),
  loadingTitle: document.querySelector("[data-loading-title]"),
  loadingDetail: document.querySelector("[data-loading-detail]"),
};

function genId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function log(message, detail) {
  const timestamp = new Date().toLocaleTimeString();
  const suffix = detail ? `\n${JSON.stringify(detail, null, 2)}` : "";
  elements.log.textContent = `[${timestamp}] ${message}${suffix}\n\n${elements.log.textContent}`;
}

function setStatus(text, tone) {
  elements.status.textContent = text;
  elements.status.dataset.tone = tone || "";
}

function renderControls() {
  const isActive = state.busy || state.running;
  const isLoading = !elements.loadingShield.hidden;
  if (elements.idleHint) {
    elements.idleHint.hidden = state.running || state.sceneLoading;
  }
  elements.sceneField.hidden = isActive;
  elements.run.hidden = isActive;
  elements.stop.hidden = !isActive;
  elements.reload.hidden = !isActive;
  elements.run.disabled = state.busy || isLoading;
  elements.stop.disabled = (state.busy && state.stopped) || isLoading;
  elements.reload.disabled = state.busy || isLoading;
}

function setLoadingShield(visible, detail, title) {
  elements.loadingShield.hidden = !visible;
  if (title) elements.loadingTitle.textContent = title;
  if (detail) elements.loadingDetail.textContent = detail;
  renderControls();
}

function hideLoadingShieldIfReady() {
  if (!state.cacheActive && state.frameReady && !state.busy && !state.sceneLoading) {
    setLoadingShield(false);
  }
}

function setControlsBusy(isBusy) {
  state.busy = isBusy;
  renderControls();
}

function formatPercent(completed, total) {
  if (!total) return "0%";
  return `${Math.max(0, Math.min(100, Math.round((completed / total) * 100)))}%`;
}

function readQuery() {
  return new URLSearchParams(window.location.search);
}

function normalizeApiBase(value) {
  const input = (value || "").trim();
  if (!input) return "";

  try {
    const url = new URL(input, window.location.href);
    return url.toString().replace(/\/+$/, "");
  } catch {
    return input.replace(/\/+$/, "");
  }
}

function resolveParentApiBase() {
  try {
    if (document.referrer) {
      return new URL("/api", document.referrer).toString().replace(/\/+$/, "");
    }
  } catch {
    // Ignore invalid referrers.
  }

  return "";
}

function resolveApiBase() {
  const query = readQuery();
  return normalizeApiBase(
    state.config.snapshotUrl ||
      state.config.snapshotApi ||
      query.get("snapshot") ||
      query.get("snapshotApi") ||
      (query.get("source") === "legacy" || query.get("legacy") === "1"
        ? ""
        : DEFAULT_SNAPSHOT_URL) ||
      state.config.apiBase ||
      state.config.api ||
      query.get("api") ||
      resolveParentApiBase() ||
      "https://d.dev.xrugc.com/api"
  );
}

function resolveLegacyApiBase() {
  const query = readQuery();
  return normalizeApiBase(
    state.config.apiBase ||
      state.config.api ||
      query.get("api") ||
      resolveParentApiBase() ||
      "https://d.dev.xrugc.com/api"
  );
}

function shouldUseDirectCdnAssets() {
  const query = readQuery();
  const value =
    state.config.directCdn ||
    state.config.directCdnAssets ||
    state.config.assetMode ||
    query.get("directCdn") ||
    query.get("directCdnAssets") ||
    query.get("assetMode");
  return /^(1|true|direct|cdn)$/i.test(String(value || ""));
}

function shouldUseLegacyVerseApi() {
  const query = readQuery();
  return query.get("source") === "legacy" || query.get("legacy") === "1";
}

function resolveSnapshotUrl(sceneId) {
  const url = new URL(resolveApiBase(), window.location.href);
  url.searchParams.set("expand", SNAPSHOT_EXPAND);
  url.searchParams.set("verse_id", String(sceneId));
  return url.toString();
}

function readStoredToken() {
  try {
    return localStorage.getItem(LOCAL_TOKEN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function writeStoredToken(token) {
  try {
    if (token) {
      localStorage.setItem(LOCAL_TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(LOCAL_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Local storage can be disabled in restricted browser contexts.
  }
}

function setToken(token, options = {}) {
  const value = (token || "").trim();
  state.token = value;
  if (elements.tokenInput) {
    elements.tokenInput.value = value;
  }
  if (elements.tokenState) {
    elements.tokenState.textContent = value ? "已配置" : "未配置";
  }
  if (options.persist) {
    writeStoredToken(value);
  }
}

function initLocalToken() {
  const query = readQuery();
  const queryToken = query.get("token") || query.get("access_token") || "";
  setToken(queryToken || readStoredToken());
}

function resolveAssetBaseOrigin() {
  try {
    const apiBase = new URL(resolveApiBase());
    return `${apiBase.protocol}//${apiBase.host}`;
  } catch {
    return "https://d.dev.xrugc.com";
  }
}

function resolveProxyOrigin() {
  return window.location.origin;
}

function postPluginReady() {
  if (window.parent && window.parent !== window && !window.__PLUGIN_READY_SENT__) {
    window.__PLUGIN_READY_SENT__ = true;
    window.parent.postMessage(
      {
        type: "PLUGIN_READY",
        id: genId(`${PLUGIN_ID}-ready`),
      },
      "*"
    );
  }
}

function handleHostMessage(event) {
  if (window.parent && event.source !== window.parent) return;
  const message = event.data || {};
  if (!message || typeof message.type !== "string") return;

  if (message.type === "INIT") {
    const payload = message.payload || {};
    setToken(typeof payload.token === "string" ? payload.token : "");
    state.config =
      payload.config && typeof payload.config === "object" ? payload.config : {};
    elements.apiBase.textContent = resolveApiBase();
    if (!state.running) {
      setStatus("请输入场景号", "ready");
    }
    log("收到宿主 INIT，可使用登录态读取场景。");
  }

  if (message.type === "TOKEN_UPDATE") {
    const payload = message.payload || {};
    setToken(typeof payload.token === "string" ? payload.token : "");
    log("登录 token 已更新。");
  }
}

function cloneForUnityPreview(value) {
  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return null;
    }
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeUnityPreviewData(value) {
  if (typeof value !== "string") return cloneForUnityPreview(value);
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function readFirstString() {
  for (const value of arguments) {
    if (typeof value === "string") return value;
  }
  return "";
}

function readCodeObjectValue(value, language) {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return "";
  return readFirstString(value[language], value.script, value.code);
}

function readUnityPreviewMetaLuaCode(meta) {
  const record = isRecord(meta) ? meta : {};
  return readFirstString(
    readCodeObjectValue(record.code, "lua"),
    readCodeObjectValue(record.metaCode, "lua"),
    record.lua,
    record.script
  );
}

function readUnityPreviewMetaJavaScriptCode(meta) {
  const record = isRecord(meta) ? meta : {};
  return readFirstString(
    readCodeObjectValue(record.code, "js"),
    readCodeObjectValue(record.metaCode, "js"),
    record.js,
    record.script
  );
}

function normalizeLuaTable(code, name) {
  const script = typeof code === "string" ? code : "";
  const globalTablePattern = new RegExp(
    `^\\s*(?:_G\\.)?${name}\\s*=\\s*(?:_G\\.)?${name}\\s+or\\s*\\{\\}`
  );
  const localGlobalAliasPattern = new RegExp(
    `^\\s*local\\s+${name}\\s*=\\s*_G\\.${name}\\b`
  );

  if (globalTablePattern.test(script) || localGlobalAliasPattern.test(script)) {
    return script;
  }

  const localOnlyGuardPattern = new RegExp(
    `^\\s*local\\s+${name}\\s*=\\s*(?:(?:_G\\.)?${name}\\s+or\\s*)?\\{\\}\\s*\\n?`
  );
  const localIndexGuardPattern = /^\s*local\s+index\s*=\s*(["'])\s*\1\s*\n?/;
  const stripped = script
    .replace(localOnlyGuardPattern, "")
    .replace(localIndexGuardPattern, "");

  return `_G.${name} = _G.${name} or {}\nlocal ${name} = _G.${name}\n${stripped}`;
}

function readUnityPreviewVerseCode(runtimeData, language) {
  const record = isRecord(runtimeData) ? runtimeData : {};
  const verseCode = isRecord(record.verseCode) ? record.verseCode : {};
  const code = isRecord(record.code) ? record.code : {};
  const key = language === "javascript" ? "js" : "lua";
  const candidates = [
    verseCode[key],
    code[key],
    record[key],
    language === "javascript" ? record.javascript : undefined,
    typeof record.code === "string" ? record.code : undefined,
  ];
  const found = candidates.find((item) => typeof item === "string");
  return typeof found === "string" ? found : "";
}

function normalizeUnityPreviewRemoteAssetUrl(value) {
  try {
    const url = new URL(value.replace(/\\\//g, "/"));
    if (url.protocol === "http:") {
      url.protocol = "https:";
    }
    if (url.hostname === LEGACY_COS_HOST) {
      url.protocol = "https:";
      url.hostname = CDN_HOST;
    }
    return url.toString();
  } catch {
    return value;
  }
}

function normalizeUnityPreviewVideoUrl(value) {
  try {
    const url = new URL(value.replace(/\\\//g, "/"));
    if (url.protocol === "http:") {
      url.protocol = "https:";
    }
    return url.toString();
  } catch {
    return value;
  }
}

function toUnityPreviewProxyRequestUrl(value, proxyOrigin) {
  return `${proxyOrigin}/__xrugc_proxy__?url=${normalizeUnityPreviewRemoteAssetUrl(
    value
  )}`;
}

function toUnityPreviewAssetUrl(value, proxyOrigin) {
  const normalizedRemoteUrl = normalizeUnityPreviewRemoteAssetUrl(value);
  if (!shouldUseDirectCdnAssets()) {
    return toUnityPreviewProxyRequestUrl(normalizedRemoteUrl, proxyOrigin);
  }

  try {
    const url = new URL(normalizedRemoteUrl);
    if (url.hostname === CDN_HOST) {
      return url.toString();
    }
  } catch {
    // Fall through to the proxy below.
  }

  return toUnityPreviewProxyRequestUrl(normalizedRemoteUrl, proxyOrigin);
}

function toUnityPreviewProxyUrl(value, proxyOrigin, assetBaseOrigin) {
  const normalizedValue = value.replace(/\\\//g, "/");
  if (!/^https?:\/\//i.test(normalizedValue)) {
    if (normalizedValue.startsWith("//")) {
      const absoluteUrl = `${window.location.protocol}${normalizedValue}`;
      return toUnityPreviewAssetUrl(absoluteUrl, proxyOrigin);
    }

    if (normalizedValue.startsWith("/__xrugc_proxy__")) {
      return `${proxyOrigin}${normalizedValue}`;
    }

    if (
      !normalizedValue.startsWith("/") ||
      !ASSET_PATH_RE.test(normalizedValue)
    ) {
      return value;
    }

    const absoluteUrl = new URL(normalizedValue, assetBaseOrigin).toString();
    return toUnityPreviewAssetUrl(absoluteUrl, proxyOrigin);
  }

  try {
    const url = new URL(normalizedValue);
    if (url.pathname === "/__xrugc_proxy__") {
      return `${proxyOrigin}${url.pathname}${url.search}`;
    }
    if (url.origin === proxyOrigin) return normalizedValue;
  } catch {
    return value;
  }

  return toUnityPreviewAssetUrl(normalizedValue, proxyOrigin);
}

function rewriteStringUrls(value, proxyOrigin, assetBaseOrigin) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("{") || trimmed.startsWith("[")) &&
    trimmed.length >= 2
  ) {
    try {
      const parsed = JSON.parse(value);
      rewriteUnityPreviewUrls(parsed, proxyOrigin, assetBaseOrigin);
      return JSON.stringify(parsed);
    } catch {
      // Continue with plain string replacement.
    }
  }

  const proxied = toUnityPreviewProxyUrl(value, proxyOrigin, assetBaseOrigin);
  if (proxied !== value) return proxied;

  return value.replace(/https?:\\?\/\\?\/[^\s"'<>]+/gi, (url) =>
    toUnityPreviewProxyUrl(url, proxyOrigin, assetBaseOrigin)
  );
}

function rewriteUnityPreviewUrls(value, proxyOrigin, assetBaseOrigin) {
  if (!value || typeof value !== "object") return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (typeof item === "string") {
        value[index] = rewriteStringUrls(item, proxyOrigin, assetBaseOrigin);
      } else {
        rewriteUnityPreviewUrls(item, proxyOrigin, assetBaseOrigin);
      }
    });
    return;
  }

  Object.entries(value).forEach(([key, item]) => {
    if (typeof item === "string") {
      value[key] = rewriteStringUrls(item, proxyOrigin, assetBaseOrigin);
    } else {
      rewriteUnityPreviewUrls(item, proxyOrigin, assetBaseOrigin);
    }
  });
}

function normalizeUnityPreviewMetas(metas) {
  if (!Array.isArray(metas)) return [];
  return metas.map((meta) => {
    const cloned = cloneForUnityPreview(meta);
    const record = isRecord(cloned) ? cloned : {};
    const code = readUnityPreviewMetaLuaCode(record);
    const normalizedCode = normalizeLuaTable(code, "meta");
    return {
      ...record,
      code: normalizedCode,
      script: normalizedCode,
      prefab: record.prefab ?? record.prefabs ?? 0,
    };
  });
}

function unwrapApiData(json) {
  if (json && typeof json === "object" && "success" in json && "data" in json) {
    return json.data;
  }
  return json;
}

async function requestJsonThroughProxy(url) {
  const proxyUrl = new URL("/__xrugc_proxy__", window.location.origin);
  proxyUrl.searchParams.set("url", url.toString());

  const headers = {
    Accept: "application/json",
  };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(proxyUrl.toString(), {
    method: "GET",
    credentials: "same-origin",
    headers,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (response.status === 401 && !state.token) {
      throw new Error(
        "API 401: 本地独立运行缺少登录态，请在“本地访问令牌”里粘贴平台 token 后重试。"
      );
    }
    throw new Error(`API ${response.status}: ${text || response.statusText}`);
  }

  return unwrapApiData(await response.json());
}

async function requestSnapshot(sceneId) {
  const url = new URL("/api/snapshot", window.location.origin);
  url.searchParams.set("expand", SNAPSHOT_EXPAND);
  url.searchParams.set("verse_id", String(sceneId));

  const response = await fetch(url.toString(), {
    method: "GET",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`API ${response.status}: ${text || response.statusText}`);
  }

  return unwrapApiData(await response.json());
}

async function requestLegacyVerse(sceneId, cl) {
  const url = new URL(`${resolveLegacyApiBase()}/v1/verses/${sceneId}`);
  url.searchParams.set("expand", UNITY_PREVIEW_VERSE_EXPAND);
  url.searchParams.set("cl", cl);
  return requestJsonThroughProxy(url);
}

function buildPayload(sceneId, runtimeData, scriptRuntimeData) {
  const luaCode = readUnityPreviewVerseCode(runtimeData, "lua");
  const jsCode = readUnityPreviewVerseCode(scriptRuntimeData, "javascript");
  const metasJavaScript = ((scriptRuntimeData?.metas ?? []) || [])
    .map((item) => readUnityPreviewMetaJavaScriptCode(item))
    .join("\n");

  const payload = {
    protocolVersion: 1,
    source: "webgl-preview-plugin",
    sceneType: "verse",
    scene: {
      id: runtimeData?.verse_id ?? runtimeData?.id ?? sceneId,
      snapshotId: runtimeData?.verse_id ? runtimeData?.id : null,
      uuid: runtimeData?.uuid ?? null,
      name: runtimeData?.name ?? "",
      description: runtimeData?.description ?? "",
      data: normalizeUnityPreviewData(runtimeData?.data ?? null),
    },
    resources: cloneForUnityPreview(runtimeData?.resources ?? []),
    metas: normalizeUnityPreviewMetas(runtimeData?.metas ?? []),
    script: {
      blockly: null,
      lua: normalizeLuaTable(luaCode, "verse"),
      javascript: jsCode,
      metasJavaScript,
    },
  };

  rewriteUnityPreviewUrls(
    payload,
    resolveProxyOrigin(),
    resolveAssetBaseOrigin()
  );

  return payload;
}

function updateSummary(payload) {
  elements.sceneName.textContent =
    payload.scene.name || payload.scene.uuid || String(payload.scene.id);
  elements.resourceCount.textContent = String(payload.resources.length);
  elements.metaCount.textContent = String(payload.metas.length);
  elements.luaLength.textContent = String(payload.script.lua.length);
}

function sendPayloadToUnity(payload) {
  if (state.stopped) {
    state.pendingRun = true;
    return;
  }

  if (!state.frameReady || !elements.frame.contentWindow) {
    state.pendingRun = true;
    return;
  }

  elements.frame.contentWindow.postMessage(
    {
      type: "load-scene-json",
      payload,
    },
    "*"
  );
  state.pendingRun = false;
  log("场景 payload 已发送到 Unity。", {
    sceneId: payload.scene.id,
    resources: payload.resources.length,
    metas: payload.metas.length,
  });
}

function isUnityFrameStopped() {
  return !elements.frame.src || elements.frame.src === "about:blank";
}

function startRunAttempt() {
  state.runSerial += 1;
  return state.runSerial;
}

function isCurrentRunAttempt(runSerial) {
  return runSerial === state.runSerial && !state.stopped;
}

function unloadUnityFrame() {
  state.frameReady = false;
  state.pendingRun = false;
  state.cacheActive = false;
  state.frameSession = "";
  state.payload = null;
  elements.frame.src = "about:blank";
}

async function runScene() {
  const sceneId = Number(elements.sceneId.value);
  if (!Number.isFinite(sceneId) || sceneId <= 0) {
    setStatus("请输入有效场景号", "error");
    elements.sceneId.focus();
    return;
  }

  const runSerial = startRunAttempt();
  state.payload = null;
  if (isUnityFrameStopped() || !state.frameReady) {
    loadUnityFrame();
  } else {
    state.stopped = false;
  }
  state.running = true;
  state.sceneLoading = true;
  setControlsBusy(true);
  setStatus("读取场景中", "busy");
  setLoadingShield(true, `正在读取场景 ${sceneId}，请稍候。`, "正在加载场景");
  log(`开始读取场景 ${sceneId}。`);

  try {
    const [runtimeData, scriptRuntimeData] = shouldUseLegacyVerseApi()
      ? await Promise.all([
          requestLegacyVerse(sceneId, "lua"),
          requestLegacyVerse(sceneId, "js"),
        ])
      : [await requestSnapshot(sceneId), {}];
    if (!isCurrentRunAttempt(runSerial)) {
      return;
    }
    setLoadingShield(true, "正在整理场景资源、脚本和实体数据。", "正在准备场景");
    const payload = buildPayload(sceneId, runtimeData, scriptRuntimeData);
    if (!isCurrentRunAttempt(runSerial)) {
      return;
    }
    state.payload = payload;
    updateSummary(payload);
    setStatus("发送到 Unity", "busy");
    setLoadingShield(true, "场景数据已读取完成，正在发送到 Unity。", "正在启动场景");
    sendPayloadToUnity(payload);
  } catch (error) {
    state.running = false;
    state.sceneLoading = false;
    setStatus("运行失败", "error");
    setLoadingShield(false);
    log(error instanceof Error ? error.message : String(error));
  } finally {
    setControlsBusy(false);
    hideLoadingShieldIfReady();
  }
}

function readInitialSceneId() {
  const query = readQuery();
  const value = query.get("sceneId") || query.get("id") || "";
  if (value) elements.sceneId.value = value;
}

function loadUnityFrame({ clearPayload = false, autoRun = false } = {}) {
  const frameSession = genId("unity");
  state.frameSession = frameSession;
  state.stopped = false;
  state.frameReady = false;
  if (clearPayload) {
    state.payload = null;
  }
  if (autoRun) {
    state.pendingRun = true;
  }
  setLoadingShield(
    true,
    "0% 正在加载 Unity WebGL 运行环境，请稍候。",
    "正在加载 WebGL 插件"
  );
  const frameUrl = new URL("./embed.html", window.location.href);
  frameUrl.searchParams.set("embed", "1");
  frameUrl.searchParams.set("plugin", "1");
  frameUrl.searchParams.set("v", WEBGL_PREVIEW_VERSION);
  frameUrl.searchParams.set("session", frameSession);
  if (shouldUseDirectCdnAssets()) {
    frameUrl.searchParams.set("assetMode", "direct");
  }
  elements.frame.src = frameUrl.toString();
}

function stopScene() {
  startRunAttempt();
  state.stopped = true;
  state.running = false;
  state.sceneLoading = false;
  unloadUnityFrame();
  setStatus("请输入场景号", "ready");
  setLoadingShield(false);
  renderControls();
  log("已停止，Unity 运行实例已卸载。");
}

function rerunScene() {
  if (!elements.sceneId.value) {
    elements.sceneId.focus();
    setStatus("请输入场景号", "error");
    return;
  }
  stopScene();
  runScene();
}

function setupFrame() {
  setLoadingShield(
    true,
    "0% 正在加载 Unity WebGL 运行环境，请勿切换场景或重复点击。",
    "正在加载 WebGL 插件"
  );

  elements.frame.addEventListener("load", () => {
    if (state.stopped || elements.frame.src === "about:blank") {
      return;
    }
    log("Unity iframe 已加载。");
  });

  window.addEventListener("message", (event) => {
    const message = event.data || {};
    if (message.session && message.session !== state.frameSession) {
      return;
    }
    if (message.type === "unity-web-preview-ready") {
      if (state.stopped) {
        return;
      }
      state.frameReady = true;
      log("Unity runner 已就绪。");
      if (!state.running) {
        setStatus("请输入场景号", "ready");
      }
      if (state.payload) {
        sendPayloadToUnity(state.payload);
      }
      hideLoadingShieldIfReady();
    }
    if (message.type === "unity-web-preview-scene-forwarded") {
      state.sceneLoading = false;
      setStatus("运行中", "running");
      hideLoadingShieldIfReady();
      log("Unity runner 已接收场景。", { length: message.length });
    }
    if (message.type === "webgl-preview-loading") {
      if (message.visible) {
        setLoadingShield(
          true,
          message.detail || "正在加载 Unity WebGL 运行环境，请稍候。",
          message.title || "正在加载 WebGL 插件"
        );
      } else {
        hideLoadingShieldIfReady();
      }
    }
    if (message.type === "webgl-preview-cache-status") {
      if (
        message.status === "started" ||
        message.status === "fetching" ||
        message.status === "progress"
      ) {
        state.cacheActive = true;
        const completed = Number(message.completed || 0);
        const total = Number(message.total || 0);
        const path = message.path ? `：${message.path}` : "";
        const percent = formatPercent(completed, total);
        const action = message.reused ? "已复用本地缓存" : "正在准备插件资源";
        setLoadingShield(
          true,
          `${percent} ${action} ${completed}/${total}${path}。首次加载 Unity 大包会较慢，请勿退出或重复操作。`,
          "正在缓存 WebGL 插件"
        );
      }

      if (message.status === "complete" || message.status === "cancelled") {
        state.cacheActive = false;
        hideLoadingShieldIfReady();
      }

      if (message.status === "error") {
        state.cacheActive = false;
        setLoadingShield(false);
        log("插件缓存失败，将继续尝试直接加载。", { message: message.message });
      }
    }
  });
  loadUnityFrame();
}

function setupControls() {
  elements.run.addEventListener("click", runScene);
  elements.stop.addEventListener("click", stopScene);
  elements.reload.addEventListener("click", rerunScene);
  elements.saveToken.addEventListener("click", () => {
    setToken(elements.tokenInput.value, { persist: true });
    log(state.token ? "本地访问令牌已保存。" : "本地访问令牌已清空。");
  });
  elements.tokenInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      setToken(elements.tokenInput.value, { persist: true });
      log(state.token ? "本地访问令牌已保存。" : "本地访问令牌已清空。");
    }
  });
  elements.sceneId.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      runScene();
    }
  });
}

function init() {
  initLocalToken();
  readInitialSceneId();
  if (elements.version) {
    elements.version.textContent = `v${WEBGL_PREVIEW_VERSION}`;
  }
  elements.apiBase.textContent = resolveApiBase();
  setupControls();
  setupFrame();
  window.addEventListener("message", handleHostMessage);
  postPluginReady();
  setStatus("正在加载插件", "busy");
  renderControls();
  log("WebGL 场景运行器已打开。");

  if (elements.sceneId.value) {
    runScene();
  }
}

init();
