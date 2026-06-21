/** Tab switcher for landing code panels */
(function () {
  const COPY_BTN_HTML = `<svg class="code-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><svg class="code-copy-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L19 7"/></svg>`;

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }

  function initCodeCopyButtons() {
    document.querySelectorAll(".code-panel .code-body").forEach((body) => {
      const code = body.querySelector("pre code");
      if (!code || body.querySelector(".code-copy-btn")) return;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "code-copy-btn";
      btn.setAttribute("aria-label", "Copy code");
      btn.innerHTML = COPY_BTN_HTML;

      let resetTimer;
      btn.addEventListener("click", async () => {
        const text = code.textContent ?? "";
        if (!text.trim()) return;

        try {
          await copyText(text);
          btn.classList.add("is-copied");
          btn.setAttribute("aria-label", "Copied");
          clearTimeout(resetTimer);
          resetTimer = setTimeout(() => {
            btn.classList.remove("is-copied");
            btn.setAttribute("aria-label", "Copy code");
          }, 2000);
        } catch {
          btn.setAttribute("aria-label", "Copy failed");
        }
      });

      body.appendChild(btn);
    });
  }

  const PANEL_SAMPLES = {
    hero: {
      MCP: `<span class="t-cm">// Cursor / Codex MCP</span>
<span class="t-kw">await</span> <span class="t-fn">mailagent_verify_signup</span>({
  <span class="t-key">service</span>: <span class="t-str">"github"</span>,
  <span class="t-key">runId</span>: <span class="t-str">"ci-4821"</span>,
  <span class="t-key">deleteAfterSuccess</span>: <span class="t-str">true</span>,
});

<span class="t-cm">// → agent.primaryAction
// → verification.primaryButton
// → confidence: "high"</span>`,
      Playwright: `<span class="t-kw">import</span> { createMailAgentQa, MailAgentQa } <span class="t-kw">from</span> <span class="t-str">"@mailagent/qa"</span>;

<span class="t-kw">const</span> mail = <span class="t-fn">createMailAgentQa</span>();
<span class="t-kw">const</span> inbox = <span class="t-kw">await</span> mail.<span class="t-fn">createInbox</span>({
  <span class="t-key">label</span>: MailAgentQa.<span class="t-fn">runLabel</span>(<span class="t-str">"signup"</span>),
  <span class="t-key">service</span>: <span class="t-str">"auth0"</span>,
});

<span class="t-cm">// fill signup form with inbox.address</span>
<span class="t-kw">const</span> v = <span class="t-kw">await</span> mail.<span class="t-fn">waitForVerification</span>(inbox.id);`,
      API: `<span class="t-fn">curl</span> -X POST https://api.webmailagent.com/v1/inboxes/open \\
  -H <span class="t-str">"Authorization: Bearer $MAILAGENT_API_KEY"</span> \\
  -H <span class="t-str">"Content-Type: application/json"</span> \\
  -d <span class="t-str">'{
    "service": "github",
    "timeoutSeconds": 90,
    "deleteAfterSuccess": true
  }'</span>

<span class="t-cm"># → verification.otp | primaryLink | primaryButton</span>`,
      CLI: `<span class="t-fn">MAILAGENT_API_URL</span>=https://api.webmailagent.com \\
<span class="t-fn">MAILAGENT_API_KEY</span>=ma_... \\
  node mcp/dist/cli.js open --service github --json

<span class="t-cm"># or: npm run wizard:qa-pilot</span>`,
    },
    qa: {
      Playwright: `<span class="t-kw">import</span> { createMailAgentQa, MailAgentQa } <span class="t-kw">from</span> <span class="t-str">"@mailagent/qa"</span>;

<span class="t-kw">const</span> mail = <span class="t-fn">createMailAgentQa</span>();
<span class="t-kw">const</span> { address, id } = <span class="t-kw">await</span> mail.<span class="t-fn">createInbox</span>({
  <span class="t-key">label</span>: MailAgentQa.<span class="t-fn">runLabel</span>(<span class="t-str">"signup"</span>),
  <span class="t-key">service</span>: <span class="t-str">"auth0"</span>,
});

<span class="t-kw">const</span> { otp } = <span class="t-kw">await</span> mail.<span class="t-fn">waitForVerification</span>(id, {
  <span class="t-key">subjectContains</span>: <span class="t-str">"verify"</span>,
});`,
      "open (one-shot)": `<span class="t-fn">curl</span> -X POST https://api.webmailagent.com/v1/inboxes/open \\
  -H <span class="t-str">"Authorization: Bearer $API_KEY"</span> \\
  -d <span class="t-str">'{
    "label": "ci-123",
    "service": "auth0",
    "subjectContains": "verify",
    "timeoutSeconds": 120
  }'</span>

<span class="t-cm">// → address
// → verification.otp
// → verification.primaryLink
// → verification.primaryButton</span>`,
    },
  };

  /** Lock height to the tallest tab — no layout jump when switching */
  function lockCodeBodyHeight(panel, samples, pre) {
    const body = panel.querySelector(".code-body");
    if (!body || !pre) return;

    const active = panel.querySelector(".code-tab.active");
    const activeLabel = active?.textContent.trim();
    let max = 0;

    for (const html of Object.values(samples)) {
      pre.innerHTML = html;
      max = Math.max(max, body.offsetHeight);
    }

    if (activeLabel && samples[activeLabel]) {
      pre.innerHTML = samples[activeLabel];
    }
    body.style.minHeight = `${max}px`;
  }

  document.querySelectorAll(".code-panel[data-panel]").forEach((panel) => {
    const key = panel.dataset.panel;
    const samples = PANEL_SAMPLES[key];
    if (!samples) return;

    const tabs = panel.querySelectorAll(".code-tab");
    const pre = panel.querySelector("pre code");
    if (!tabs.length || !pre) return;

    lockCodeBodyHeight(panel, samples, pre);

    tabs.forEach((tab) => {
      tab.style.cursor = "pointer";
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const label = tab.textContent.trim();
        if (samples[label]) pre.innerHTML = samples[label];
      });
    });
  });

  initCodeCopyButtons();
})();
