/**
 * Resend-style session — API key in sidebar footer, no signup.
 */
(function () {
  const KEY_STORAGE = "mailagent_dashboard_key";
  const BASE_STORAGE = "mailagent_api_base";
  const BASE_LEGACY = "mailagent_workspace_api_base";
  const DEFAULT_BASE = "https://api.webmailagent.com";

  if (document.body.dataset.site !== "app") return;

  const mount = document.getElementById("app-session-slot");
  if (!mount) return;

  mount.innerHTML = `<div class="dash-session" id="dash-session">
      <div class="dash-session__idle" id="dash-session-idle-ui" hidden>
        <div class="dash-session__idle-row">
          <span class="dash-session__dot" aria-hidden="true"></span>
          <span class="dash-session__label">Not connected</span>
        </div>
        <p class="dash-session__idle-hint" id="dash-session-idle-hint">Enter your API key below.</p>
      </div>
      <div class="dash-session__connect" id="dash-session-connect-ui">
        <span class="dash-session__label">API key</span>
        <input id="app-session-key" class="dash-session__input" type="password" autocomplete="off" placeholder="ma_…" spellcheck="false" aria-label="API key" />
        <button type="button" class="dash-btn dash-btn--primary" id="app-session-connect">Connect</button>
        <details class="dash-session__base-inline">
          <summary>Custom API base</summary>
          <input id="app-session-base" class="dash-session__input" type="url" value="${DEFAULT_BASE}" aria-label="API base URL" />
        </details>
      </div>
      <div id="dash-session-connected-ui" hidden>
        <span class="dash-session__label">Connected</span>
        <div class="dash-session__connected">
          <span class="dash-session__badge" id="app-session-status"></span>
          <button type="button" class="dash-session__gear" id="app-session-edit" title="Change API key" aria-label="Change API key">⋯</button>
          <button type="button" class="dash-session__clear" id="app-session-clear" title="Clear key" aria-label="Clear API key">×</button>
        </div>
      </div>
    </div>`;

  const keyEl = document.getElementById("app-session-key");
  const baseEl = document.getElementById("app-session-base");
  const statusEl = document.getElementById("app-session-status");
  const connectBtn = document.getElementById("app-session-connect");
  const clearBtn = document.getElementById("app-session-clear");
  const editBtn = document.getElementById("app-session-edit");
  const connectUi = document.getElementById("dash-session-connect-ui");
  const connectedUi = document.getElementById("dash-session-connected-ui");
  const idleUi = document.getElementById("dash-session-idle-ui");

  function usesMainOnboard() {
    return (
      document.body.classList.contains("dash-onboard-active") ||
      document.body.classList.contains("dash-gate-active")
    );
  }

  function syncSidebarMode() {
    document.body.classList.toggle("dash-onboard-active", usesMainOnboard() && !getKey());
  }

  function getKey() {
    return (keyEl?.value || localStorage.getItem(KEY_STORAGE) || "").trim();
  }

  function getBase() {
    const raw =
      baseEl?.value.trim() ||
      localStorage.getItem(BASE_STORAGE) ||
      localStorage.getItem(BASE_LEGACY) ||
      DEFAULT_BASE;
    return raw.replace(/\/$/, "");
  }

  function keyHint(key) {
    if (key.length <= 8) return "ma_••••";
    return `ma_···${key.slice(-4)}`;
  }

  function syncStatus() {
    const key = getKey();
    const connected = Boolean(key);
    const onboardMain = usesMainOnboard();
    connectUi.hidden = connected || onboardMain;
    idleUi.hidden = connected || !onboardMain;
    connectedUi.hidden = !connected;
    syncSidebarMode();
    if (connected) {
      statusEl.textContent = keyHint(key);
      statusEl.title = `${getBase()} · ${keyHint(key)}`;
    }
  }

  function loadFromStorage() {
    const key = localStorage.getItem(KEY_STORAGE);
    const base =
      localStorage.getItem(BASE_STORAGE) ||
      localStorage.getItem(BASE_LEGACY) ||
      DEFAULT_BASE;
    if (key) keyEl.value = key;
    if (baseEl) baseEl.value = base;
    syncStatus();
  }

  function saveSession() {
    const key = keyEl.value.trim();
    const base = baseEl.value.trim() || DEFAULT_BASE;
    if (!key) return false;
    localStorage.setItem(KEY_STORAGE, key);
    localStorage.setItem(BASE_STORAGE, base);
    localStorage.setItem(BASE_LEGACY, base);
    syncStatus();
    return true;
  }

  function clearSession() {
    localStorage.removeItem(KEY_STORAGE);
    keyEl.value = "";
    syncStatus();
    document.dispatchEvent(new CustomEvent("mailagent:disconnect"));
  }

  async function api(path, opts) {
    const r = await fetch(`${getBase()}${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${getKey()}`,
        "Content-Type": "application/json",
        ...(opts?.headers || {}),
      },
    });
    const json = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, json };
  }

  function connect() {
    if (!keyEl.value.trim()) {
      keyEl.focus();
      return false;
    }
    if (!saveSession()) return false;
    document.dispatchEvent(new CustomEvent("mailagent:connect", { detail: { auto: false } }));
    return true;
  }

  function setKey(key) {
    if (!keyEl) return false;
    keyEl.value = String(key || "").trim();
    return connect();
  }

  keyEl?.addEventListener("input", () => {
    document.dispatchEvent(new CustomEvent("mailagent:keychange"));
  });

  connectBtn?.addEventListener("click", connect);
  clearBtn?.addEventListener("click", clearSession);
  editBtn?.addEventListener("click", () => {
    connectUi.hidden = false;
    connectedUi.hidden = true;
    keyEl.focus();
    keyEl.select();
  });
  keyEl?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      connect();
    }
  });

  window.MailAgentApp = {
    api,
    getKey,
    getBase,
    saveSession,
    clearSession,
    connect,
    setKey,
    syncStatus,
    KEY_STORAGE,
    BASE_STORAGE,
  };

  loadFromStorage();
  syncSidebarMode();

  document.addEventListener("mailagent:onboard-ready", syncStatus);
  document.addEventListener("mailagent:onboard-dismiss", syncStatus);
  document.addEventListener("mailagent:gate-ready", syncStatus);
  document.addEventListener("mailagent:gate-dismiss", syncStatus);

  document.dispatchEvent(new CustomEvent("mailagent:session-ready", {
    detail: { hasKey: Boolean(getKey()) },
  }));
})();
