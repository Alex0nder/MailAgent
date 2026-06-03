/**
 * Shared nav, docs sidebar, and footer — Resend-like layout for static pages.
 */
(function () {
  const GITHUB = "https://github.com/Alex0nder/MailAgent";
  const LOGO_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M4 6h16v12H4z"/><path d="M4 6l8 7 8-7"/></svg>`;

  const DOC_SECTIONS = [
    {
      title: "Start",
      items: [
        { id: "api", href: "/docs/", label: "API reference" },
        { id: "integrate", href: "/docs/integrate.html", label: "Self-host" },
      ],
    },
    {
      title: "Guides",
      items: [
        { id: "agents", href: "/docs/agents.html", label: "AI agents" },
        { id: "qa", href: "/docs/qa.html", label: "QA / Playwright" },
        { id: "scoped-keys", href: "/docs/scoped-keys.html", label: "Scoped keys" },
        { id: "raw-mime", href: "/docs/raw-mime.html", label: "Raw MIME" },
        { id: "custom-domain", href: "/docs/custom-domain.html", label: "Custom domain" },
      ],
    },
    {
      title: "Console",
      items: [
        { id: "dashboard", href: "/dashboard.html", label: "Dashboard" },
        { id: "debug", href: "/debug.html", label: "Debug inboxes" },
        { id: "agent-runs", href: "/agent-runs.html", label: "Agent runs" },
      ],
    },
  ];

  const body = document.body;
  const mode = body.dataset.site || "marketing";
  const docId = body.dataset.doc || "";
  const path = location.pathname.replace(/\/$/, "") || "/";

  function isActive(href) {
    const h = href.replace(/\/$/, "") || "/";
    if (h === "/docs" && (path === "/docs" || path.endsWith("/docs/index.html"))) return true;
    return path === h || path.endsWith(h);
  }

  function renderNav() {
    const marketingLinks =
      mode === "marketing"
        ? `<a href="/#features">Features</a>
           <a href="/#qa">QA</a>
           <a href="/#mcp">MCP</a>
           <a href="/docs/">Docs</a>`
        : `<a href="/docs/">Docs</a>
           <a href="/docs/integrate.html">Self-host</a>
           <a href="/docs/agents.html">Agents</a>`;

    const appExtra =
      mode === "app"
        ? `<a href="/dashboard.html"${isActive("/dashboard.html") ? ' aria-current="page"' : ""}>Dashboard</a>
           <a href="/debug.html"${isActive("/debug.html") ? ' aria-current="page"' : ""}>Debug</a>
           <a href="/agent-runs.html"${isActive("/agent-runs.html") ? ' aria-current="page"' : ""}>Agent runs</a>`
        : "";

    const cta =
      mode === "marketing"
        ? `<a class="btn btn-primary" href="#get-started">Get started</a>`
        : mode === "app"
          ? `<a class="btn btn-outline" href="/docs/">Docs</a>`
          : `<a class="btn btn-primary" href="${GITHUB}" rel="noopener noreferrer">GitHub</a>`;

    return `<header class="nav">
      <div class="nav-inner">
        <a href="/" class="logo">
          <span class="logo-mark">${LOGO_SVG}</span>
          MailAgent
        </a>
        <button type="button" class="nav-toggle" aria-expanded="false" aria-controls="nav-menu" id="nav-toggle">
          <span class="sr-only">Menu</span>
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
        </button>
        <div class="nav-menu" id="nav-menu">
          <nav class="nav-links" aria-label="Primary">${marketingLinks}${appExtra}</nav>
          <div class="nav-actions">
            <a class="btn btn-ghost nav-github" href="${GITHUB}" rel="noopener noreferrer">GitHub</a>
            ${cta}
          </div>
        </div>
      </div>
    </header>`;
  }

  function renderDocSidebar() {
    return DOC_SECTIONS.map((section) => {
      const links = section.items
        .map((item) => {
          const cur = docId === item.id || isActive(item.href);
          return `<li><a href="${item.href}"${cur ? ' class="is-active" aria-current="page"' : ""}>${item.label}</a></li>`;
        })
        .join("");
      return `<div class="doc-sidebar-group"><p class="doc-sidebar-title">${section.title}</p><ul>${links}</ul></div>`;
    }).join("");
  }

  function renderFooter() {
    if (mode === "marketing") return "";
    return `<footer class="footer footer-minimal">
      <p class="footer-bottom">
        <a href="/">MailAgent</a>
        · <a href="/docs/">Docs</a>
        · <a href="${GITHUB}" rel="noopener noreferrer">GitHub</a>
      </p>
    </footer>`;
  }

  const navMount = document.getElementById("site-nav");
  if (navMount) {
    navMount.outerHTML = renderNav();
    const toggle = document.getElementById("nav-toggle");
    const menu = document.getElementById("nav-menu");
    if (toggle && menu) {
      toggle.addEventListener("click", () => {
        const open = menu.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
  }

  const sideMount = document.getElementById("site-doc-nav");
  if (sideMount && mode === "docs") {
    sideMount.innerHTML = renderDocSidebar();
  }

  const footMount = document.getElementById("site-footer");
  if (footMount) footMount.outerHTML = renderFooter();
})();
