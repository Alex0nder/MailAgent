/** Tab switcher for landing code panels */
(function () {
  const PANEL_SAMPLES = {
    hero: {
      MCP: `<span class="t-cm">// mailagent_wait_and_extract — one shot</span>
<span class="t-kw">await</span> <span class="t-fn">mailagent_wait_and_extract</span>({
  <span class="t-key">service</span>: <span class="t-str">"github"</span>,
  <span class="t-key">timeoutSeconds</span>: <span class="t-str">90</span>,
  <span class="t-key">deleteAfter</span>: <span class="t-str">true</span>,
});

<span class="t-cm">// → { address, verification: { otp, links } }</span>`,
      Playwright: `<span class="t-kw">import</span> { createMailAgentQa } <span class="t-kw">from</span> <span class="t-str">"@mailagent/qa"</span>;

<span class="t-kw">const</span> mail = <span class="t-fn">createMailAgentQa</span>();
<span class="t-kw">const</span> { address, id } = <span class="t-kw">await</span> mail.<span class="t-fn">createInbox</span>({
  <span class="t-key">label</span>: <span class="t-str">"pw-0-signup"</span>,
});
<span class="t-cm">// page.fill email → mail.waitForVerification(id)</span>`,
      API: `<span class="t-fn">POST</span> /v1/inboxes
{ <span class="t-key">"service"</span>: <span class="t-str">"github"</span>, <span class="t-key">"ttlMinutes"</span>: <span class="t-str">15</span> }

<span class="t-fn">GET</span> /v1/inboxes/:id/extract
<span class="t-cm">// → { otp, links }</span>`,
      CLI: `<span class="t-fn">node</span> mcp/dist/cli.js open \\
  --service github --json

<span class="t-cm"># stdout: inbox + verification</span>`,
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

<span class="t-cm">// → address, verification.otp, primaryLink</span>`,
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
})();
