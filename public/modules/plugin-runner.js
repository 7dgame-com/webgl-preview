const PLUGIN_ID = "webgl-preview";
const WEBGL_PREVIEW_VERSION = "2026.05.20.6";
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

const I18N = {
  zh: {
    topbarLabel: "WebGL 控制栏",
    viewerLabel: "Unity WebGL 预览",
    fullscreenPreview: "全屏预览",
    sceneIdLabel: "场景号",
    sceneIdPlaceholder: "请输入场景号：例如1416",
    run: "运行",
    stop: "停止",
    rerun: "重跑",
    configured: "已配置",
    notConfigured: "未配置",
    enterSceneId: "请输入场景号",
    enterValidSceneId: "请输入有效场景号",
    loadingPlugin: "正在加载 WebGL 插件",
    loadingPluginDetail: "0% 正在加载 Unity WebGL 运行环境，请稍候。",
    loadingPluginGuard:
      "0% 正在加载 Unity WebGL 运行环境，请勿切换场景或重复点击。",
    loadingPluginFallback: "正在加载 Unity WebGL 运行环境，请稍候。",
    readingScene: "读取场景中",
    readingSceneDetail: "正在读取场景 {sceneId}，请稍候。",
    loadingScene: "正在加载场景",
    preparingScene: "正在准备场景",
    preparingSceneDetail: "正在整理场景资源、脚本和实体数据。",
    sendingUnity: "发送到 Unity",
    startingScene: "正在启动场景",
    startingSceneDetail: "场景数据已读取完成，正在发送到 Unity。",
    sceneResourceLoading: "场景资源加载中",
    runFailed: "运行失败",
    running: "运行中",
    cachePlugin: "正在缓存 WebGL 插件",
    cacheReuse: "已复用本地缓存",
    cachePrepare: "正在准备插件资源",
    cacheDetail:
      "{percent} {action} {completed}/{total}{path}。首次加载 Unity 大包会较慢，请勿退出或重复操作。",
    localTokenMissing:
      "API 401: 本地独立运行缺少登录态，请在“本地访问令牌”里粘贴平台 token 后重试。",
    hostInit: "收到宿主 INIT，可使用登录态读取场景。",
    tokenUpdated: "登录 token 已更新。",
    payloadSent: "场景 payload 已发送到 Unity。",
    sceneReadStart: "开始读取场景 {sceneId}。",
    stopped: "已停止，场景已卸载并保留本地缓存。",
    iframeLoaded: "Unity iframe 已加载。",
    runnerReady: "Unity runner 已就绪。",
    runnerAccepted: "Unity runner 已接收场景。",
    cacheFailed: "插件缓存失败，将继续尝试直接加载。",
    tokenSaved: "本地访问令牌已保存。",
    tokenCleared: "本地访问令牌已清空。",
    opened: "WebGL 场景运行器已打开。",
  },
  en: {
    topbarLabel: "WebGL controls",
    viewerLabel: "Unity WebGL preview",
    fullscreenPreview: "Fullscreen preview",
    sceneIdLabel: "Scene ID",
    sceneIdPlaceholder: "Enter scene ID: e.g. 1416",
    run: "Run",
    stop: "Stop",
    rerun: "Rerun",
    configured: "Configured",
    notConfigured: "Not configured",
    enterSceneId: "Enter a scene ID",
    enterValidSceneId: "Enter a valid scene ID",
    loadingPlugin: "Loading WebGL Plugin",
    loadingPluginDetail: "0% Loading the Unity WebGL runtime. Please wait.",
    loadingPluginGuard:
      "0% Loading the Unity WebGL runtime. Do not switch scenes or click repeatedly.",
    loadingPluginFallback: "Loading the Unity WebGL runtime. Please wait.",
    readingScene: "Reading scene",
    readingSceneDetail: "Reading scene {sceneId}. Please wait.",
    loadingScene: "Loading scene",
    preparingScene: "Preparing scene",
    preparingSceneDetail: "Preparing scene resources, scripts, and entities.",
    sendingUnity: "Sending to Unity",
    startingScene: "Starting scene",
    startingSceneDetail: "Scene data is ready and is being sent to Unity.",
    sceneResourceLoading: "Loading scene resources",
    runFailed: "Run failed",
    running: "Running",
    cachePlugin: "Caching WebGL Plugin",
    cacheReuse: "Using local cache",
    cachePrepare: "Preparing plugin assets",
    cacheDetail:
      "{percent} {action} {completed}/{total}{path}. The first Unity package load can be slow. Do not leave or repeat actions.",
    localTokenMissing:
      "API 401: Local standalone mode is missing login credentials. Paste a platform token into the local access token field and try again.",
    hostInit: "Host INIT received. Login state is available for scene loading.",
    tokenUpdated: "Login token updated.",
    payloadSent: "Scene payload sent to Unity.",
    sceneReadStart: "Started reading scene {sceneId}.",
    stopped: "Stopped. The scene was unloaded and local cache was kept.",
    iframeLoaded: "Unity iframe loaded.",
    runnerReady: "Unity runner is ready.",
    runnerAccepted: "Unity runner accepted the scene.",
    cacheFailed: "Plugin cache failed. Continuing with direct loading.",
    tokenSaved: "Local access token saved.",
    tokenCleared: "Local access token cleared.",
    opened: "WebGL scene runner opened.",
  },
};

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
  sceneResourceLoading: false,
  sceneResourceProgressTimer: 0,
  sceneResourceProgressStartedAt: 0,
  cacheActive: false,
  frameSession: "",
  runSerial: 0,
  locale: "zh",
};

const elements = {
  status: document.querySelector("[data-status]"),
  version: document.querySelector("[data-version]"),
  sceneField: document.querySelector("[data-scene-field]"),
  sceneId: document.querySelector("[data-scene-id]"),
  run: document.querySelector("[data-run]"),
  stop: document.querySelector("[data-stop]"),
  reload: document.querySelector("[data-reload]"),
  fullscreen: document.querySelector("[data-fullscreen]"),
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
  loadingProgress: document.querySelector("[data-loading-progress]"),
  loadingProgressBar: document.querySelector("[data-loading-progress-bar]"),
  loadingProgressText: document.querySelector("[data-loading-progress-text]"),
  loadingShield: document.querySelector("[data-loading-shield]"),
  loadingTitle: document.querySelector("[data-loading-title]"),
  loadingDetail: document.querySelector("[data-loading-detail]"),
};

function normalizeLocale(value) {
  const lang = (value || navigator.language || "zh-CN")
    .toLowerCase()
    .replace("_", "-");
  return lang.startsWith("zh") ? "zh" : "en";
}

function resolveLocale() {
  return normalizeLocale(readQuery().get("lang"));
}

function t(key, params = {}) {
  const template = I18N[state.locale][key] || I18N.zh[key] || key;
  return template.replace(/\{(\w+)\}/g, (_, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : ""
  );
}

function applyI18n() {
  document.documentElement.lang = state.locale === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
    node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
  });
  document.querySelectorAll("[data-i18n-title]").forEach((node) => {
    node.setAttribute("title", t(node.dataset.i18nTitle));
  });
  if (elements.tokenState) {
    elements.tokenState.textContent = state.token ? t("configured") : t("notConfigured");
  }
}

function refreshStatusForLocale() {
  if (state.sceneLoading) {
    setStatus(t("readingScene"), "busy");
    return;
  }
  if (state.running) {
    setStatus(t("running"), "running");
    return;
  }
  if (state.busy || state.cacheActive || !state.frameReady) {
    setStatus(t("loadingPlugin"), "busy");
    return;
  }
  setStatus(t("enterSceneId"), "ready");
}

function extractLocaleCandidate(value) {
  if (!value || typeof value !== "object") return "";
  const direct =
    value.lang ||
    value.language ||
    value.locale ||
    value.currentLang ||
    value.currentLanguage;
  if (typeof direct === "string") return direct;
  if (value.config && typeof value.config === "object") {
    return extractLocaleCandidate(value.config);
  }
  if (value.payload && typeof value.payload === "object") {
    return extractLocaleCandidate(value.payload);
  }
  return "";
}

function updateLocale(nextLang) {
  const nextLocale = normalizeLocale(nextLang || readQuery().get("lang"));
  if (nextLocale === state.locale) return false;
  state.locale = nextLocale;
  applyI18n();
  refreshStatusForLocale();
  if (!elements.loadingShield.hidden) {
    setLoadingShield(true, t("loadingPluginFallback"), t("loadingPlugin"));
  }
  return true;
}

function genId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function log(message, detail) {
  const timestamp = new Date().toLocaleTimeString();
  const suffix = detail ? `\n${JSON.stringify(detail, null, 2)}` : "";
  elements.log.textContent = `[${timestamp}] ${message}${suffix}\n\n${elements.log.textContent}`;
}

function formatStatusText(text) {
  const value = String(text || "").trim();
  return value;
}

function setStatus(text, tone) {
  elements.status.textContent = formatStatusText(text);
  elements.status.dataset.tone = tone || "";
}

function setLoadingProgress(percentText, { indeterminate = false } = {}) {
  const match = String(percentText || "").match(/(\d{1,3})%/);
  const percent = match ? Math.max(0, Math.min(100, Number(match[1]))) : 0;
  elements.loadingProgress.dataset.mode = indeterminate ? "indeterminate" : "";
  elements.loadingProgressBar.style.width = `${percent}%`;
  elements.loadingProgressText.textContent = `${percent}%`;
}

function stopSceneResourceProgress() {
  if (state.sceneResourceProgressTimer) {
    window.clearInterval(state.sceneResourceProgressTimer);
    state.sceneResourceProgressTimer = 0;
  }
  state.sceneResourceProgressStartedAt = 0;
}

function estimateSceneResourceProgress() {
  if (!state.sceneResourceProgressStartedAt) return 8;
  const elapsedSeconds = Math.max(
    0,
    (performance.now() - state.sceneResourceProgressStartedAt) / 1000
  );
  return Math.min(
    94,
    Math.max(8, Math.round(8 + 86 * (1 - Math.exp(-elapsedSeconds / 9))))
  );
}

function updateSceneResourceProgress() {
  if (!state.sceneResourceLoading) {
    stopSceneResourceProgress();
    return;
  }
  setLoadingProgress(`${estimateSceneResourceProgress()}%`);
}

function startSceneResourceProgress() {
  stopSceneResourceProgress();
  state.sceneResourceProgressStartedAt = performance.now();
  setLoadingProgress("8%");
  state.sceneResourceProgressTimer = window.setInterval(
    updateSceneResourceProgress,
    500
  );
}

function clearLoadingProgress() {
  stopSceneResourceProgress();
  elements.loadingProgress.hidden = true;
  elements.loadingProgress.dataset.mode = "";
  elements.loadingProgressBar.style.width = "0%";
  elements.loadingProgressText.textContent = "0%";
}

function shouldShowLoadingProgress() {
  return (
    state.sceneResourceLoading ||
    state.sceneLoading ||
    state.cacheActive ||
    state.busy ||
    (!elements.loadingShield.hidden &&
      !state.frameReady &&
      elements.status.dataset.tone !== "ready")
  );
}

function renderControls() {
  const isActive = state.busy || state.running;
  const isLoading = !elements.loadingShield.hidden || state.sceneResourceLoading;
  if (elements.idleHint) {
    elements.idleHint.hidden =
      state.running && !state.sceneLoading && !state.sceneResourceLoading && !isLoading;
  }
  if (elements.loadingProgress) {
    elements.loadingProgress.hidden = !shouldShowLoadingProgress();
  }
  elements.sceneField.hidden = isActive;
  elements.run.hidden = isActive;
  elements.stop.hidden = !isActive;
  elements.reload.hidden = !isActive;
  elements.run.disabled = state.busy;
  elements.stop.disabled = state.busy && state.stopped;
  elements.reload.disabled = state.busy && !state.sceneResourceLoading;
}

function setLoadingShield(visible, detail, title) {
  elements.loadingShield.hidden = !visible;
  if (title) elements.loadingTitle.textContent = title;
  if (detail) elements.loadingDetail.textContent = detail;
  if (visible) {
    setStatus(title || t("loadingPlugin"), "busy");
    setLoadingProgress(detail || "");
  } else {
    if (!state.sceneResourceLoading) {
      clearLoadingProgress();
    }
  }
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
    elements.tokenState.textContent = value ? t("configured") : t("notConfigured");
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
  if (!message || typeof message !== "object") return;
  updateLocale(extractLocaleCandidate(message));
  if (typeof message.type !== "string") return;

  if (message.type === "INIT") {
    const payload = message.payload || {};
    setToken(typeof payload.token === "string" ? payload.token : "");
    state.config =
      payload.config && typeof payload.config === "object" ? payload.config : {};
    elements.apiBase.textContent = resolveApiBase();
    if (!state.running) {
      setStatus(t("enterSceneId"), "ready");
    }
    log(t("hostInit"));
  }

  if (
    message.type === "LANGUAGE_CHANGE" ||
    message.type === "LOCALE_CHANGE" ||
    message.type === "SET_LANGUAGE" ||
    message.type === "SET_LOCALE" ||
    message.type === "CHANGE_LANGUAGE" ||
    message.type === "CHANGE_LOCALE" ||
    message.type === "LANG_CHANGE" ||
    message.type === "I18N_CHANGE"
  ) {
    updateLocale(extractLocaleCandidate(message));
  }

  if (message.type === "TOKEN_UPDATE") {
    const payload = message.payload || {};
    setToken(typeof payload.token === "string" ? payload.token : "");
    log(t("tokenUpdated"));
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

function getUnityPreviewProxyPath(value) {
  try {
    const url = new URL(value.replace(/\\\//g, "/"));
    const filename = decodeURIComponent(url.pathname.split("/").pop() || "");
    if (filename && /\.[a-z0-9]{2,8}$/i.test(filename)) {
      return `/__xrugc_proxy__/${encodeURIComponent(filename)}`;
    }
  } catch {
    // Fall through to the extensionless proxy path.
  }
  return "/__xrugc_proxy__";
}

function toUnityPreviewProxyRequestUrl(value, proxyOrigin) {
  return `${proxyOrigin}${getUnityPreviewProxyPath(value)}?url=${normalizeUnityPreviewRemoteAssetUrl(
    value
  )}&v=${encodeURIComponent(WEBGL_PREVIEW_VERSION)}`;
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
    if (
      url.pathname === "/__xrugc_proxy__" ||
      url.pathname.startsWith("/__xrugc_proxy__/")
    ) {
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
      throw new Error(t("localTokenMissing"));
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

function postScenePayloadToUnity(payload) {
  elements.frame.contentWindow.postMessage(
    {
      type: "load-scene-json",
      payload,
    },
    "*"
  );
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

  postScenePayloadToUnity(payload);
  state.pendingRun = false;
  log(t("payloadSent"), {
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
    setStatus(t("enterValidSceneId"), "error");
    elements.sceneId.focus();
    return;
  }

  const runSerial = startRunAttempt();
  state.payload = null;
  state.sceneResourceLoading = false;
  if (isUnityFrameStopped() || !state.frameReady) {
    loadUnityFrame();
  } else {
    state.stopped = false;
  }
  state.running = true;
  state.sceneLoading = true;
  setControlsBusy(true);
  setStatus(t("readingScene"), "busy");
  setLoadingShield(
    true,
    t("readingSceneDetail", { sceneId }),
    t("loadingScene")
  );
  log(t("sceneReadStart", { sceneId }));

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
    setLoadingShield(true, t("preparingSceneDetail"), t("preparingScene"));
    const payload = buildPayload(sceneId, runtimeData, scriptRuntimeData);
    if (!isCurrentRunAttempt(runSerial)) {
      return;
    }
    state.payload = payload;
    updateSummary(payload);
    setStatus(t("sendingUnity"), "busy");
    setLoadingShield(true, t("startingSceneDetail"), t("startingScene"));
    sendPayloadToUnity(payload);
  } catch (error) {
    state.running = false;
    state.sceneLoading = false;
    state.sceneResourceLoading = false;
    setStatus(t("runFailed"), "error");
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
    t("loadingPluginDetail"),
    t("loadingPlugin")
  );
  const frameUrl = new URL("./embed.html", window.location.href);
  frameUrl.searchParams.set("embed", "1");
  frameUrl.searchParams.set("plugin", "1");
  frameUrl.searchParams.set("v", WEBGL_PREVIEW_VERSION);
  frameUrl.searchParams.set("session", frameSession);
  frameUrl.searchParams.set("lang", readQuery().get("lang") || document.documentElement.lang);
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
  state.sceneResourceLoading = false;
  unloadUnityFrame();
  setStatus(t("enterSceneId"), "ready");
  setLoadingShield(false);
  renderControls();
  log(t("stopped"));
}

function rerunScene() {
  if (!elements.sceneId.value) {
    elements.sceneId.focus();
    setStatus(t("enterSceneId"), "error");
    return;
  }
  stopScene();
  runScene();
}

function setupFrame() {
  setLoadingShield(
    true,
    t("loadingPluginGuard"),
    t("loadingPlugin")
  );

  elements.frame.addEventListener("load", () => {
    if (state.stopped || elements.frame.src === "about:blank") {
      return;
    }
    log(t("iframeLoaded"));
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
      log(t("runnerReady"));
      if (!state.running) {
        setStatus(t("enterSceneId"), "ready");
        clearLoadingProgress();
      }
      if (state.payload) {
        sendPayloadToUnity(state.payload);
      }
      hideLoadingShieldIfReady();
    }
    if (message.type === "unity-web-preview-scene-forwarded") {
      state.sceneLoading = false;
      state.sceneResourceLoading = true;
      setStatus(t("sceneResourceLoading"), "busy");
      startSceneResourceProgress();
      hideLoadingShieldIfReady();
      log(t("runnerAccepted"), { length: message.length });
    }
    if (message.type === "unity-web-preview-scene-visible") {
      if (!state.running) {
        return;
      }
      state.sceneResourceLoading = false;
      setLoadingProgress("100%");
      clearLoadingProgress();
      setStatus(t("running"), "running");
      hideLoadingShieldIfReady();
      renderControls();
    }
    if (message.type === "webgl-preview-loading") {
      if (message.visible) {
        setLoadingShield(
          true,
          message.detail || t("loadingPluginFallback"),
          message.title || t("loadingPlugin")
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
        const action = message.reused ? t("cacheReuse") : t("cachePrepare");
        setLoadingShield(
          true,
          t("cacheDetail", { percent, action, completed, total, path }),
          t("cachePlugin")
        );
      }

      if (message.status === "complete" || message.status === "cancelled") {
        state.cacheActive = false;
        hideLoadingShieldIfReady();
      }

      if (message.status === "error") {
        state.cacheActive = false;
        setLoadingShield(false);
        log(t("cacheFailed"), { message: message.message });
      }
    }
  });
  loadUnityFrame();
}

function toggleFullscreenPreview() {
  const target = document.querySelector(".viewer") || document.documentElement;
  const postHostFullscreenRequest = () => {
    if (window.parent && window.parent !== window) {
      const payload = {
        type: "webgl-preview-request-fullscreen",
        source: "webgl-preview",
        plugin: PLUGIN_ID,
      };
      window.parent.postMessage(payload, "*");
      window.parent.postMessage(
        { ...payload, type: "plugin-request-fullscreen" },
        "*"
      );
    }
  };
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
    return;
  }
  if (target.requestFullscreen) {
    const request = target.requestFullscreen({ navigationUI: "hide" });
    if (request && typeof request.catch === "function") {
      request.catch(postHostFullscreenRequest);
    }
    postHostFullscreenRequest();
    return;
  }
  postHostFullscreenRequest();
}

function setupControls() {
  elements.run.addEventListener("click", runScene);
  elements.stop.addEventListener("click", stopScene);
  elements.reload.addEventListener("click", rerunScene);
  elements.fullscreen?.addEventListener("click", toggleFullscreenPreview);
  elements.saveToken.addEventListener("click", () => {
    setToken(elements.tokenInput.value, { persist: true });
    log(state.token ? t("tokenSaved") : t("tokenCleared"));
  });
  elements.tokenInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      setToken(elements.tokenInput.value, { persist: true });
      log(state.token ? t("tokenSaved") : t("tokenCleared"));
    }
  });
  elements.sceneId.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      runScene();
    }
  });
}

function setupLocaleSync() {
  let lastSearch = window.location.search;
  const syncFromUrl = () => {
    if (window.location.search === lastSearch) return;
    lastSearch = window.location.search;
    updateLocale(readQuery().get("lang"));
  };

  window.addEventListener("popstate", syncFromUrl);
  window.addEventListener("hashchange", syncFromUrl);
  window.addEventListener("focus", syncFromUrl);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncFromUrl();
  });

  const patchHistory = (name) => {
    const original = window.history[name];
    window.history[name] = function patchedHistoryState(...args) {
      const result = original.apply(this, args);
      syncFromUrl();
      return result;
    };
  };
  patchHistory("pushState");
  patchHistory("replaceState");
}

function init() {
  state.locale = resolveLocale();
  applyI18n();
  initLocalToken();
  readInitialSceneId();
  if (elements.version) {
    elements.version.textContent = `v${WEBGL_PREVIEW_VERSION}`;
  }
  elements.apiBase.textContent = resolveApiBase();
  setupControls();
  setupLocaleSync();
  setupFrame();
  window.addEventListener("message", handleHostMessage);
  postPluginReady();
  setStatus(t("loadingPlugin"), "busy");
  renderControls();
  log(t("opened"));

  if (elements.sceneId.value) {
    runScene();
  }
}

init();
