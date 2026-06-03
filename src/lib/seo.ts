/** SEO meta для статических лендингов и docs (инжект в Worker перед отдачей HTML). */

export const SITE_ORIGIN = "https://webmailagent.com";
const OG_IMAGE = `${SITE_ORIGIN}/apple-touch-icon.svg`;

export type SeoPageConfig = {
  title: string;
  description: string;
  /** Canonical path, e.g. `/docs/qa.html` */
  pathname: string;
  index?: boolean;
  ogType?: "website" | "article";
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
};

const DEFAULT_DESCRIPTION =
  "Open-source email verification for AI agents and QA. Temporary inboxes, OTP, magic links — MCP, REST, Playwright.";

/** Ключ — pathname запроса (как в URL, без query). */
export const SEO_BY_PATH: Record<string, SeoPageConfig> = {
  "/": {
    title: "MailAgent — Email verification for agents & QA",
    description:
      "Open-source email verification for AI agents and QA. Self-host on Cloudflare or use the API — temporary inboxes, MCP, Playwright.",
    pathname: "/",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "MailAgent",
        url: SITE_ORIGIN,
        description: DEFAULT_DESCRIPTION,
      },
      {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "MailAgent",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Cloudflare Workers",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        url: SITE_ORIGIN,
        description: DEFAULT_DESCRIPTION,
        isAccessibleForFree: true,
        softwareHelp: `${SITE_ORIGIN}/docs/`,
      },
    ],
  },
  "/index.html": {
    title: "MailAgent — Email verification for agents & QA",
    description:
      "Open-source email verification for AI agents and QA. Self-host on Cloudflare or use the API — temporary inboxes, MCP, Playwright.",
    pathname: "/",
    index: false,
  },
  "/docs/": {
    title: "API docs — MailAgent",
    description:
      "MailAgent REST API reference — create inboxes, wait for email, extract OTP and magic links, SSE, scoped API keys.",
    pathname: "/docs/",
    ogType: "article",
  },
  "/docs/index.html": {
    title: "API docs — MailAgent",
    description:
      "MailAgent REST API reference — create inboxes, wait for email, extract OTP and magic links, SSE, scoped API keys.",
    pathname: "/docs/",
    index: false,
  },
  "/docs/integrate.html": {
    title: "Self-host MailAgent — integration guide",
    description:
      "Deploy MailAgent on Cloudflare Workers with Neon and Resend. MCP server, REST API, and environment setup.",
    pathname: "/docs/integrate.html",
    ogType: "article",
  },
  "/docs/agents.html": {
    title: "AI agents — MailAgent MCP & OAuth",
    description:
      "Connect Cursor and other agents to MailAgent via MCP. OAuth, scoped keys, and verification tools for autonomous sign-up flows.",
    pathname: "/docs/agents.html",
    ogType: "article",
  },
  "/docs/qa.html": {
    title: "QA & Playwright — MailAgent testing guide",
    description:
      "E2E email verification with @mailagent/qa — labels, subject filters, callbacks, and Playwright fixtures for sign-up tests.",
    pathname: "/docs/qa.html",
    ogType: "article",
  },
  "/docs/scoped-keys.html": {
    title: "Scoped API keys — MailAgent",
    description:
      "Limit API keys to specific inboxes or services. Safer CI and agent automation with least-privilege access.",
    pathname: "/docs/scoped-keys.html",
    ogType: "article",
  },
  "/docs/raw-mime.html": {
    title: "Raw MIME archive — MailAgent",
    description:
      "Fetch full .eml messages from R2 when OTP extraction is not enough. Metadata and base64 body via the MailAgent API.",
    pathname: "/docs/raw-mime.html",
    ogType: "article",
  },
  "/docs/attachments.html": {
    title: "Email attachments — MailAgent",
    description:
      "List and download inbound attachment metadata and files from verification emails in agent and QA workflows.",
    pathname: "/docs/attachments.html",
    ogType: "article",
  },
  "/docs/custom-domain.html": {
    title: "Custom inbox domain — MailAgent",
    description:
      "Use your own domain for disposable inboxes with Resend inbound and MailAgent routing.",
    pathname: "/docs/custom-domain.html",
    ogType: "article",
  },
  "/dashboard.html": {
    title: "Dashboard — MailAgent",
    description: "MailAgent team dashboard — API keys and inbox usage.",
    pathname: "/dashboard.html",
    index: false,
  },
  "/debug.html": {
    title: "Debug inboxes — MailAgent",
    description: "Internal debug view for MailAgent inboxes.",
    pathname: "/debug.html",
    index: false,
  },
  "/agent-runs.html": {
    title: "Agent runs — MailAgent",
    description: "MailAgent agent verification run history.",
    pathname: "/agent-runs.html",
    index: false,
  },
};

export function resolveSeoConfig(pathname: string): SeoPageConfig | null {
  let path = pathname || "/";
  if (path === "/docs") path = "/docs/";
  return SEO_BY_PATH[path] ?? null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildMetaBlock(config: SeoPageConfig): string {
  const index = config.index !== false;
  const canonical = `${SITE_ORIGIN}${config.pathname}`;
  const ogType = config.ogType ?? "website";
  const title = escapeHtml(config.title);
  const description = escapeHtml(config.description);

  const lines = [
    "<!-- mailagent-seo -->",
    `<link rel="canonical" href="${canonical}" />`,
    `<meta name="description" content="${description}" />`,
    `<meta name="robots" content="${index ? "index, follow, max-image-preview:large" : "noindex, nofollow"}" />`,
    `<meta property="og:site_name" content="MailAgent" />`,
    `<meta property="og:type" content="${ogType}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
  ];

  const ld = config.jsonLd;
  if (ld) {
    const payload = Array.isArray(ld) ? ld : [ld];
    for (const item of payload) {
      lines.push(
        `<script type="application/ld+json">${JSON.stringify(item)}</script>`
      );
    }
  }

  return lines.join("\n    ");
}

/** Вставляет SEO-блок сразу после открывающего `<head>`. */
export function injectSeo(html: string, config: SeoPageConfig): string {
  if (html.includes("<!-- mailagent-seo -->")) return html;
  const block = buildMetaBlock(config);
  return html.replace(/<head([^>]*)>/i, `<head$1>\n    ${block}\n`);
}

/** Пути для sitemap.xml (только indexable). */
export function sitemapPaths(): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const cfg of Object.values(SEO_BY_PATH)) {
    if (cfg.index === false) continue;
    if (seen.has(cfg.pathname)) continue;
    seen.add(cfg.pathname);
    paths.push(cfg.pathname);
  }
  paths.sort((a, b) => (a === "/" ? -1 : b === "/" ? 1 : a.localeCompare(b)));
  return paths;
}

export function buildSitemapXml(lastmod = "2026-06-03"): string {
  const urls = sitemapPaths()
    .map((path) => {
      const loc = path === "/" ? SITE_ORIGIN + "/" : `${SITE_ORIGIN}${path}`;
      const priority = path === "/" ? "1.0" : path.startsWith("/docs/") ? "0.8" : "0.5";
      return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${path === "/" ? "weekly" : "monthly"}</changefreq>
    <priority>${priority}</priority>
  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}
