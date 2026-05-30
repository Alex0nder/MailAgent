/** OpenAPI JSON для агентов и codegen */
import { Hono } from "hono";
import { openApiSpec } from "../openapi/spec";

export const openapiRoutes = new Hono();

openapiRoutes.get("/openapi.json", (c) => c.json(openApiSpec));
