/** OpenAPI JSON for agents and codegen */
import { Hono } from "hono";
import { openApiSpec } from "../openapi/spec";

export const openapiRoutes = new Hono();

openapiRoutes.get("/openapi.json", (c) => c.json(openApiSpec));
