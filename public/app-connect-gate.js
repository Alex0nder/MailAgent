/**
 * Centered API-key gate for app pages (Workspace, Logs, Debug, Runs).
 */
(function () {
  if (document.body.dataset.site !== "app") return;

  const DEFAULT_BASE = "https://api.webmailagent.com";

  function sidebarKeyEl() {
    return document.getElementById("app-session-key");
  }

  function sidebarBaseEl() {
    return document.getElementById("app-session-base");
  }

  function syncToSidebar(keyInput, baseInput) {
    const sidebarKey = sidebarKeyEl();
    const sidebarBase = sidebarBaseEl();
    if (sidebarKey && keyInput) sidebarKey.value = keyInput.value;
    if (sidebarBase && baseInput) {
      sidebarBase.value = baseInput.value.trim() || DEFAULT_BASE;
    }
  }

  function wireGateForm(root) {
    const keyInput = root.querySelector("[data-gate-key]");
    const baseInput = root.querySelector("[data-gate-base]");
    const connectBtn = root.querySelector("[data-gate-connect]");

    const sidebarKey = sidebarKeyEl();
    const sidebarBase = sidebarBaseEl();
    if (sidebarKey?.value && keyInput) keyInput.value = sidebarKey.value;
    if (sidebarBase?.value && baseInput) baseInput.value = sidebarBase.value;

    keyInput?.addEventListener("input", () => syncToSidebar(keyInput, baseInput));
    baseInput?.addEventListener("input", () => syncToSidebar(keyInput, baseInput));

    function submit() {
      syncToSidebar(keyInput, baseInput);
      window.MailAgentApp?.connect();
    }

    connectBtn?.addEventListener("click", submit);
    keyInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      }
    });
  }

  function renderConnectGate(mount, options) {
    if (!mount) return;
    const title = options?.title ?? "Connect your API key";
    const desc =
      options?.desc ??
      "Paste your MailAgent key to load this page. Stored locally — no signup.";
    const eyebrow = options?.eyebrow ?? "Console";

    document.body.classList.add("dash-gate-active");
    mount.innerHTML = `<div class="dash-gate">
        <div class="dash-gate__card">
          <p class="dash-onboard__eyebrow">${eyebrow}</p>
          <h1 class="dash-gate__title">${title}</h1>
          <p class="dash-gate__desc">${desc}</p>
          <label for="gate-key-input">API key</label>
          <input id="gate-key-input" data-gate-key type="password" autocomplete="off" placeholder="ma_…" spellcheck="false" autofocus />
          <details class="dash-onboard__advanced">
            <summary>Self-hosted API base</summary>
            <input data-gate-base type="url" value="${DEFAULT_BASE}" aria-label="API base URL" />
          </details>
          <button type="button" class="dash-btn dash-btn--primary" data-gate-connect>Connect</button>
          <p class="dash-onboard__hint">Stored in localStorage. Clear from the sidebar after connecting.</p>
          <div class="dash-onboard__links">
            <a href="/dashboard.html">Overview</a>
            <a href="mailto:hello@webmailagent.com?subject=MailAgent%20API%20key">Request key</a>
            <a href="/docs/integrate.html">Self-host</a>
          </div>
        </div>
      </div>`;

    wireGateForm(mount);
    document.dispatchEvent(new CustomEvent("mailagent:gate-ready"));
    window.MailAgentApp?.syncStatus?.();
  }

  function clearConnectGate(mount) {
    document.body.classList.remove("dash-gate-active");
    if (mount) mount.innerHTML = "";
    document.dispatchEvent(new CustomEvent("mailagent:gate-dismiss"));
    window.MailAgentApp?.syncStatus?.();
  }

  window.MailAgentConnectGate = {
    renderConnectGate,
    clearConnectGate,
  };
})();
