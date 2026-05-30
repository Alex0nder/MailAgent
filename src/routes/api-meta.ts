/** Discovery endpoint для агентов и документации */

import { Hono } from "hono";
import { SERVICE_EXPECT_FROM } from "../lib/service-presets";

export const apiMetaRoutes = new Hono();

apiMetaRoutes.get("/", (c) => {
  return c.json({
    name: "MailAgent",
    version: "0.1.0",
    description: "Temporary inboxes for AI agent email verification",
    auth: "Authorization: Bearer <API_KEY>",
    openapi: "/v1/openapi.json",
    endpoints: {
      open: { method: "POST", path: "/v1/inboxes/open", note: "create + wait + extract (+ delete)" },
      createInbox: { method: "POST", path: "/v1/inboxes" },
      getInbox: { method: "GET", path: "/v1/inboxes/:id" },
      messages: { method: "GET", path: "/v1/inboxes/:id/messages" },
      extract: { method: "GET", path: "/v1/inboxes/:id/extract" },
      events: { method: "GET", path: "/v1/inboxes/:id/events", note: "SSE" },
      wait: { method: "GET", path: "/v1/inboxes/:id/wait" },
      deleteInbox: { method: "DELETE", path: "/v1/inboxes/:id" },
      health: { method: "GET", path: "/health" },
    },
    services: Object.keys(SERVICE_EXPECT_FROM),
    mcpTools: [
      "mailagent_wait_and_extract",
      "mailagent_create_inbox",
      "mailagent_wait_for_message",
      "mailagent_extract_verification",
      "mailagent_delete_inbox",
    ],
  });
});
