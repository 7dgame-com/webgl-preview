(function installEmbedParentProtocol(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.XRUGCEmbedParentProtocol = api;
  }
})(typeof globalThis === "object" ? globalThis : this, function createProtocolApi() {
  "use strict";

  const MODES = Object.freeze({
    INVALID: "invalid",
    LEGACY: "legacy-v0",
    SESSION: "session-v1",
    STANDALONE: "standalone",
  });
  const SESSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{15,255}$/;
  const TERMINAL_TYPES = new Set([
    "webgl-preview-disposed",
    "webgl-preview-dispose-error",
  ]);
  const REPEATABLE_INBOUND_TYPES = new Set([
    "unity-web-preview-ping",
    "unity-web-preview-camera-mode",
  ]);
  const LOCALE_INBOUND_TYPES = new Set([
    "webgl-preview-locale-change",
    "LANGUAGE_CHANGE",
    "LOCALE_CHANGE",
    "SET_LANGUAGE",
    "SET_LOCALE",
    "CHANGE_LANGUAGE",
    "CHANGE_LOCALE",
    "LANG_CHANGE",
    "I18N_CHANGE",
  ]);
  const SCENE_INBOUND_TYPES = new Set([
    "load-scene-json",
    "xrugc-load-scene-json",
  ]);

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function isValidSession(value) {
    return typeof value === "string" && SESSION_PATTERN.test(value);
  }

  function resolveMode(searchParams) {
    if (!searchParams || typeof searchParams.getAll !== "function") {
      return { mode: MODES.INVALID, session: "" };
    }
    const sessions = searchParams.getAll("session");
    if (sessions.length === 0) {
      return { mode: MODES.LEGACY, session: "" };
    }
    if (sessions.length !== 1 || !isValidSession(sessions[0])) {
      return { mode: MODES.INVALID, session: "" };
    }
    return { mode: MODES.SESSION, session: sessions[0] };
  }

  function normalizeExactOrigin(value) {
    if (typeof value !== "string" || !value) return "";
    try {
      const url = new URL(value);
      if (
        (url.protocol !== "https:" && url.protocol !== "http:") ||
        url.username ||
        url.password ||
        url.origin !== value
      ) {
        return "";
      }
      return url.origin;
    } catch {
      return "";
    }
  }

  function createEmbedParentProtocol(options) {
    const embedded = options?.embedded === true;
    const parentWindow = options?.parentWindow || null;
    const parentOrigin = normalizeExactOrigin(options?.parentOrigin);
    const binding = embedded
      ? resolveMode(options?.searchParams)
      : { mode: MODES.STANDALONE, session: "" };
    const postMessageImpl =
      typeof options?.postMessage === "function"
        ? options.postMessage
        : (message, targetOrigin) => parentWindow.postMessage(message, targetOrigin);
    let phase =
      embedded && parentWindow && parentOrigin && binding.mode !== MODES.INVALID
        ? "open"
        : "invalid";
    let readySent = false;
    let sceneAccepted = false;

    function hasExpectedBinding(message) {
      const hasSession = Object.prototype.hasOwnProperty.call(message, "session");
      if (binding.mode === MODES.SESSION) {
        return hasSession && message.session === binding.session;
      }
      if (binding.mode === MODES.LEGACY) {
        return !hasSession;
      }
      return false;
    }

    function hasExpectedSource(event) {
      return Boolean(
        event &&
          event.source === parentWindow &&
          event.origin === parentOrigin
      );
    }

    function accept(event, message) {
      if (
        phase !== "open" ||
        !isRecord(message) ||
        !hasExpectedSource(event) ||
        !hasExpectedBinding(message)
      ) {
        return false;
      }

      if (message.type === "webgl-preview-dispose") {
        phase = "closing";
        return true;
      }
      if (LOCALE_INBOUND_TYPES.has(message.type)) return true;
      if (!readySent) return false;
      if (SCENE_INBOUND_TYPES.has(message.type)) {
        if (sceneAccepted) return false;
        sceneAccepted = true;
        return true;
      }
      return REPEATABLE_INBOUND_TYPES.has(message.type);
    }

    function post(message) {
      if (!isRecord(message) || phase === "invalid" || phase === "closed") {
        return false;
      }
      const terminal = TERMINAL_TYPES.has(message.type);
      if (phase === "closing" && !terminal) return false;

      const outbound = { ...message };
      if (binding.mode === MODES.SESSION) {
        outbound.session = binding.session;
      } else if (binding.mode === MODES.LEGACY) {
        delete outbound.session;
      } else {
        return false;
      }

      try {
        postMessageImpl(outbound, parentOrigin);
      } catch {
        return false;
      }

      if (outbound.type === "unity-web-preview-ready") readySent = true;
      if (terminal) phase = "closed";
      return true;
    }

    return Object.freeze({
      accept,
      post,
      get mode() {
        return binding.mode;
      },
      get parentOrigin() {
        return parentOrigin;
      },
      get phase() {
        return phase;
      },
      get session() {
        return binding.session;
      },
    });
  }

  return Object.freeze({
    MODES,
    createEmbedParentProtocol,
    isValidSession,
  });
});
