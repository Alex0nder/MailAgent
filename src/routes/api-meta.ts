/** Discovery endpoint для агентов и документации */

import { Hono } from "hono";
import { SERVICE_EXPECT_FROM } from "../lib/service-presets";
import { MCP_TOOL_NAMES } from "../mcp/manifest";

export const apiMetaRoutes = new Hono();

apiMetaRoutes.get("/", (c) => {
  return c.json({
    name: "MailAgent",
    version: "0.2.0",
    description:
      "Temporary inboxes for AI agents and QA/E2E (OTP, magic links, CI labels)",
    auth: "Authorization: Bearer <API_KEY>",
    openapi: "/v1/openapi.json",
    agent: {
      hub: "GET /v1/agent",
      verify: "POST /v1/agent/verify",
      recipes: "GET /v1/agent/recipes/:service",
      remoteMcp: "POST /mcp (JSON-RPC, Bearer)",
      docs: "https://webmailagent.com/docs/agents.html",
    },
    endpoints: {
      open: { method: "POST", path: "/v1/inboxes/open", note: "create + wait + extract (+ delete)" },
      listInboxes: { method: "GET", path: "/v1/inboxes?label=", note: "QA filter" },
      createInbox: { method: "POST", path: "/v1/inboxes" },
      getInbox: { method: "GET", path: "/v1/inboxes/:id" },
      messages: { method: "GET", path: "/v1/inboxes/:id/messages" },
      messageRaw: {
        method: "GET",
        path: "/v1/inboxes/:id/messages/:messageId/raw",
        note: "Full .eml from R2 (Accept: application/json for metadata)",
      },
      extract: { method: "GET", path: "/v1/inboxes/:id/extract" },
      events: { method: "GET", path: "/v1/inboxes/:id/events", note: "SSE" },
      wait: { method: "GET", path: "/v1/inboxes/:id/wait" },
      callbackLog: {
        method: "GET",
        path: "/v1/inboxes/:id/callbacks",
        note: "QA webhook delivery log",
      },
      deleteInbox: { method: "DELETE", path: "/v1/inboxes/:id" },
      stats: { method: "GET", path: "/v1/stats", note: "usage counters" },
      me: { method: "GET", path: "/v1/me", note: "plan + limits for key" },
      billingCheckout: {
        method: "POST",
        path: "/v1/billing/checkout",
        note: "Stripe Pro (registered keys)",
      },
      team: { method: "GET", path: "/v1/team", note: "team + API keys" },
      teamCreateKey: { method: "POST", path: "/v1/team/keys", note: "invite" },
      teamRevokeKey: { method: "DELETE", path: "/v1/team/keys/:id" },
      listDomains: { method: "GET", path: "/v1/domains" },
      addDomain: { method: "POST", path: "/v1/domains", note: "Resend DNS records" },
      verifyDomain: { method: "POST", path: "/v1/domains/:id/verify" },
      deleteDomain: { method: "DELETE", path: "/v1/domains/:id" },
      searchMessages: {
        method: "GET",
        path: "/v1/inboxes/:id/search?q=",
        note: "keyword + optional semantic (Workers AI)",
      },
      health: { method: "GET", path: "/health" },
    },
    services: Object.keys(SERVICE_EXPECT_FROM),
    mcpTools: MCP_TOOL_NAMES,
    qa: {
      label: "CI run id on create/open",
      subjectContains: "filter wait/open by subject",
      callbackUrl: "HTTPS POST on message.received",
      docs: "https://webmailagent.com/docs/integrate.html",
      qaDocs: "https://webmailagent.com/docs/qa.html",
    },
  });
});
