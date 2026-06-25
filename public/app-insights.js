/**
 * Right insights rail — live console summary on all app pages.
 */
(function () {
  if (document.body.dataset.site !== "app") return;

  const mount = document.getElementById("dash-insights");
  if (!mount) return;

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pct(used, max) {
    return max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  }

  function skeletonRows() {
    return `<div class="dash-preview__row"><span></span><span></span></div>
      <div class="dash-preview__row"><span></span><span></span></div>
      <div class="dash-preview__row"><span></span><span></span></div>`;
  }

  function inboxRows(inboxes) {
    if (!inboxes?.length) {
      return `<p class="dash-rail__empty">No inboxes yet</p>`;
    }
    return inboxes
      .slice(0, 4)
      .map(
        (i) => `<a class="dash-rail__inbox" href="/console-inbox.html?inbox=${encodeURIComponent(i.id)}">
          <span class="dash-rail__inbox-label">${esc(i.label || i.address?.split("@")[0] || "inbox")}</span>
          <span class="dash-rail__inbox-addr">${esc(i.address || "")}</span>
        </a>`
      )
      .join("");
  }

  function renderSkeleton() {
    mount.innerHTML = `<div class="dash-preview dash-preview--rail">
      <div class="dash-preview__toolbar">
        <span class="dash-preview__title">Overview</span>
        <span class="dash-preview__toolbar-skeleton" aria-hidden="true"></span>
      </div>
      <div class="dash-preview__metrics">
        <div class="dash-preview__metric"><span>Active inboxes</span><span class="dash-preview__metric-skeleton" aria-hidden="true"></span></div>
        <div class="dash-preview__metric"><span>Messages (24h)</span><span class="dash-preview__metric-skeleton" aria-hidden="true"></span></div>
        <div class="dash-preview__metric"><span>Custom domains</span><span class="dash-preview__metric-skeleton" aria-hidden="true"></span></div>
      </div>
      <div class="dash-preview__panel">
        <div class="dash-preview__panel-head">Recent inboxes</div>
        ${skeletonRows()}
      </div>
      <p class="dash-rail__hint">Connect your API key to load live usage.</p>
    </div>`;
  }

  function renderSummary(d) {
    const u = d.usage || {};
    const l = d.limits || {};
    const plan = esc(d.plan || "—");
    mount.innerHTML = `<div class="dash-preview dash-preview--rail">
      <div class="dash-preview__toolbar">
        <span class="dash-preview__title">Overview</span>
        <span class="dash-preview__pill">${plan}</span>
      </div>
      <div class="dash-preview__metrics">
        <div class="dash-preview__metric">
          <span>Active inboxes</span>
          <strong>${u.activeInboxes ?? 0} <em>/ ${l.maxActiveInboxes ?? "—"}</em></strong>
          <i style="width:${pct(u.activeInboxes, l.maxActiveInboxes)}%"></i>
        </div>
        <div class="dash-preview__metric">
          <span>Messages (24h)</span>
          <strong>${u.messagesLast24h ?? 0}</strong>
          <i style="width:${Math.min(100, (u.messagesLast24h || 0) / 10)}%"></i>
        </div>
        <div class="dash-preview__metric">
          <span>Custom domains</span>
          <strong>${u.customDomains ?? 0} <em>/ ${l.maxCustomDomains ?? "—"}</em></strong>
          <i style="width:${pct(u.customDomains, l.maxCustomDomains)}%"></i>
        </div>
      </div>
      <div class="dash-preview__panel">
        <div class="dash-preview__panel-head">
          <span>Recent inboxes</span>
          <a href="/dashboard.html">All →</a>
        </div>
        <div class="dash-rail__inbox-list">${inboxRows(d.recentInboxes)}</div>
      </div>
      ${
        d.rateLimit
          ? `<p class="dash-rail__meta">${d.rateLimit.remaining} req left · resets ${d.rateLimit.resetsInSeconds}s</p>`
          : ""
      }
    </div>`;
  }

  async function refresh() {
    const App = window.MailAgentApp;
    if (!App?.getKey?.()) {
      renderSkeleton();
      return;
    }
    mount.classList.add("is-loading");
    const res = await App.api("/v1/console/summary");
    mount.classList.remove("is-loading");
    if (!res.ok) {
      renderSkeleton();
      const hint = mount.querySelector(".dash-rail__hint");
      if (hint) hint.textContent = esc(res.json.error || "Could not load summary");
      return;
    }
    renderSummary(res.json);
  }

  window.MailAgentInsights = { refresh };

  document.addEventListener("mailagent:session-ready", refresh);
  document.addEventListener("mailagent:connect", refresh);
  document.addEventListener("mailagent:disconnect", renderSkeleton);

  if (window.MailAgentApp?.getKey?.()) refresh();
})();
