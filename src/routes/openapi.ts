/** Минимальная OpenAPI-схема для агентов */

import { Hono } from "hono";

const spec = {
  openapi: "3.0.3",
  info: {
    title: "MailAgent API",
    version: "0.2.0",
    description: "Temporary inboxes for AI agent email verification",
  },
  servers: [{ url: "https://api.webmailagent.com" }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer" },
    },
  },
  paths: {
    "/v1": {
      get: { summary: "API discovery (endpoints, service presets, MCP tools)" },
    },
    "/v1/inboxes/open": {
      post: {
        summary: "One-shot: create, wait, extract, delete",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  service: { type: "string" },
                  expectFrom: { type: "string" },
                  timeoutSeconds: { type: "integer", maximum: 120 },
                  ttlMinutes: { type: "integer" },
                  deleteAfter: { type: "boolean", default: true },
                },
              },
            },
          },
        },
      },
    },
    "/v1/inboxes": {
      post: { summary: "Create temporary inbox" },
    },
    "/v1/inboxes/{id}/events": {
      get: { summary: "SSE stream for new messages" },
    },
    "/webhooks/resend": {
      post: { summary: "Resend inbound webhook (no auth)" },
    },
    "/health": {
      get: { summary: "Health check" },
    },
  },
} as const;

export const openapiRoutes = new Hono();

openapiRoutes.get("/openapi.json", (c) => c.json(spec));
