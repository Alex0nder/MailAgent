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
    const pathNorm = path.replace(/\.html$/, "");
    const hNorm = h.replace(/\.html$/, "");
    if (hNorm === "/docs" && (pathNorm === "/docs" || path.endsWith("/docs/index.html"))) return true;
    return path === h || path.endsWith(h) || pathNorm === hNorm;
  }

  function navLink(href, label) {
    const cur = isActive(href);
    return `<a href="${href}"${cur ? ' aria-current="page"' : ""}>${label}</a>`;
  }

  function renderNavLinks() {
    if (mode === "marketing") {
      return `<a href="/#features">Features</a>
        <a href="/#qa">QA</a>
        <a href="/#mcp">MCP</a>
        ${navLink("/docs/", "Docs")}`;
    }
    if (mode === "app") {
      return `${navLink("/docs/", "Docs")}
        ${navLink("/docs/integrate.html", "Self-host")}
        ${navLink("/docs/agents.html", "Agents")}
        ${navLink("/dashboard.html", "Dashboard")}
        ${navLink("/debug.html", "Debug")}
        ${navLink("/agent-runs.html", "Agent runs")}`;
    }
    return `${navLink("/docs/", "Docs")}
      ${navLink("/docs/integrate.html", "Self-host")}
      ${navLink("/docs/agents.html", "Agents")}`;
  }

  function renderNav() {
    const cta =
      mode === "app"
        ? `<a class="btn btn-outline" href="/docs/">Docs</a>`
        : `<a class="btn btn-primary" href="/docs/integrate.html">Get started</a>`;

    const links = renderNavLinks();

    return `<header class="nav">
      <div class="nav-inner site-container">
        <div class="nav-start">
          <a href="/" class="logo">
            <span class="logo-mark">${LOGO_SVG}</span>
            MailAgent
          </a>
        </div>
        <div class="nav-menu" id="nav-menu">
          <nav class="nav-links" aria-label="Primary">${links}</nav>
          <div class="nav-actions">
            <a class="btn btn-ghost nav-github" href="${GITHUB}" rel="noopener noreferrer">GitHub</a>
            ${cta}
          </div>
        </div>
        <button type="button" class="nav-toggle" aria-expanded="false" aria-controls="nav-menu" id="nav-toggle">
          <span class="sr-only">Menu</span>
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
        </button>
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
      <div class="site-container">
        <p class="footer-bottom">
          <a href="/">MailAgent</a>
          · <a href="/docs/">Docs</a>
          · <a href="${GITHUB}" rel="noopener noreferrer">GitHub</a>
        </p>
      </div>
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
