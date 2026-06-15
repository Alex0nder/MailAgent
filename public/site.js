/** Tab switcher for landing code panels */
(function () {
  const PANEL_SAMPLES = {
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
})();
