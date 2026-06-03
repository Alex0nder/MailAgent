/**
 * Shared nav, docs sidebar, and footer — Resend-like layout for static pages.
 */
(function () {
  const GITHUB = "https://github.com/Alex0nder/MailAgent";
  const PORTFOLIO = "https://alexyoung33rd.com/";
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
        { id: "attachments", href: "/docs/attachments.html", label: "Attachments" },
        { id: "custom-domain", href: "/docs/custom-domain.html", label: "Custom domain" },
      ],
    },
    {
      title: "Console",
      items: [
        { id: "dashboard", href: "/dashboard.html", label: "Dashboard" },
        { id: "debug", href: "/debug.html", label: "Debug inboxes" },
        { id: "qa-troubleshoot", href: "/docs/qa.html#troubleshooting", label: "Troubleshooting" },
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
        ? `<a class="btn btn-sm btn-outline" href="/docs/">Docs</a>`
        : `<a class="btn btn-sm btn-nav-cta" href="/docs/integrate.html">Get started</a>`;

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
            <a class="btn btn-sm btn-ghost nav-github" href="${GITHUB}" rel="noopener noreferrer">GitHub</a>
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

  /** Полный футер лендинга — один источник для всех страниц. */
  function renderFooterInner() {
    return `<div class="footer-inner">
        <div class="footer-col">
          <h4>Product</h4>
          <ul>
            <li><a href="/#features">Features</a></li>
            <li><a href="/#qa">For QA</a></li>
            <li><a href="/#mcp">MCP tools</a></li>
            <li><a href="/#how">How it works</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Developers</h4>
          <ul>
            <li><a href="${GITHUB}" rel="noopener noreferrer">GitHub</a></li>
            <li><a href="/docs/integrate.html">Self-host</a></li>
            <li><a href="/docs/">API reference</a></li>
            <li><a href="/docs/agents.html">AI agents &amp; MCP</a></li>
            <li><a href="/docs/qa.html">QA / Playwright</a></li>
            <li><a href="/docs/scoped-keys.html">Scoped keys</a></li>
            <li><a href="/docs/raw-mime.html">Raw MIME</a></li>
            <li><a href="/docs/attachments.html">Attachments</a></li>
            <li><a href="/docs/custom-domain.html">Custom domain</a></li>
            <li><a href="https://api.webmailagent.com/v1/openapi.json" rel="noopener noreferrer">OpenAPI</a></li>
            <li>
              <a
                href="mailto:hello@webmailagent.com?subject=MailAgent%20hosted%20API%20key"
                title="Email hello@webmailagent.com"
              >Hosted API key</a>
            </li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Console</h4>
          <ul>
            <li><a href="/dashboard.html">Dashboard</a></li>
            <li><a href="/debug.html">Debug inboxes</a></li>
            <li><a href="/agent-runs.html">Agent runs</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Stack</h4>
          <ul>
            <li><a href="https://resend.com" rel="noopener noreferrer">Resend</a></li>
            <li><a href="https://developers.cloudflare.com/workers/" rel="noopener noreferrer">Cloudflare Workers</a></li>
            <li><a href="/docs/agents.html#remote-mcp">MCP (setup)</a></li>
          </ul>
        </div>
      </div>`;
  }

  function renderFooterLegal() {
    return `<div class="footer-legal">
        <p class="footer-legal-copy">
          © MailAgent. Open-source email verification for agents and QA.
          <a href="${GITHUB}" rel="noopener noreferrer">Source</a>
        </p>
        <p class="footer-legal-copy">
          Made with love for agents &amp; QA —
          <a href="${PORTFOLIO}" target="_blank" rel="noopener noreferrer">Alexander Young <span class="footer-heart" aria-hidden="true">♥</span></a>
        </p>
      </div>`;
  }

  function renderFooterWordmark() {
    return `<a href="/" class="footer-wordmark-link" aria-label="MailAgent — home">
        <span class="footer-wordmark" id="footerWordmark">MAILAGENT</span>
      </a>`;
  }

  function renderFooter() {
    return `<footer class="footer">
      <div class="site-container">
        ${renderFooterInner()}
        ${renderFooterLegal()}
        ${renderFooterWordmark()}
      </div>
    </footer>`;
  }

  /** Wordmark: split letters + fit width (from Navorina footer pattern). */
  function initFooterWordmark() {
    const footer = document.querySelector(".footer");
    const logo = footer?.querySelector("#footerWordmark");
    const box = footer?.querySelector(".site-container");
    if (!logo || !box || logo.dataset.split === "1") return;

    const text = (logo.textContent || "").trim();
    if (!text) return;
    logo.dataset.split = "1";
    logo.textContent = "";
    logo.setAttribute("aria-hidden", "true");
    logo.style.setProperty("--char-count", String(text.length));
    for (let i = 0; i < text.length; i++) {
      const ch = document.createElement("span");
      ch.className = "footer-wordmark-char";
      ch.textContent = text.charAt(i);
      ch.style.setProperty("--char-i", String(i));
      logo.appendChild(ch);
    }

    const link = footer.querySelector(".footer-wordmark-link");

    function fit() {
      logo.style.fontSize = "";
      logo.style.letterSpacing = "";
      const boxWidth = box.clientWidth;
      if (boxWidth < 1) return;
      let size = parseFloat(getComputedStyle(logo).fontSize) || 48;
      const pad =
        parseFloat(getComputedStyle(logo).paddingLeft) +
        parseFloat(getComputedStyle(logo).paddingRight);
      const target = Math.min(Math.max(boxWidth - pad, 200), 520);
      let guard = 0;
      while (logo.scrollWidth <= target * 0.97 && size < 104 && guard++ < 64) {
        size *= 1.04;
        logo.style.fontSize = `${size}px`;
      }
      guard = 0;
      while (logo.scrollWidth > target && size > 18 && guard++ < 80) {
        size *= 0.96;
        logo.style.fontSize = `${size}px`;
      }
      const chars = logo.querySelectorAll(".footer-wordmark-char");
      const gap = target - logo.scrollWidth;
      if (gap > 0.5 && chars.length > 1) {
        logo.style.letterSpacing = `${gap / (chars.length - 1) / size}em`;
      }
      logo.classList.add("is-fitted");
    }

    function bindInview() {
      if (logo.classList.contains("is-inview")) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        logo.classList.add("is-inview");
        return;
      }
      const target = link || logo;
      if (typeof IntersectionObserver === "undefined") {
        logo.classList.add("is-inview");
        return;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              logo.classList.add("is-inview");
              observer.disconnect();
            }
          });
        },
        { threshold: 0.08, rootMargin: "0px" }
      );
      observer.observe(target);
    }

    fit();
    bindInview();
    if (document.fonts?.ready) document.fonts.ready.then(fit);
    let resizeTimer;
    window.addEventListener(
      "resize",
      () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(fit, 120);
      },
      { passive: true }
    );
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

  initFooterWordmark();
})();
