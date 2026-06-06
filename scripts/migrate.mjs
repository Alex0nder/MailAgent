#!/usr/bin/env node
/** Apply migrations/*.sql to Neon (DATABASE_URL in .dev.vars / .env) */
import "./load-env.mjs";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { neon } from "@neondatabase/serverless";

const root = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(root, "..", "migrations");
const url = process.env.DATABASE_URL;

if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = neon(url);
const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

for (const file of files) {
  const ddl = readFileSync(join(migrationsDir, file), "utf8");
  console.log(`--- ${file}`);
  for (const statement of ddl.split(";").map((s) => s.trim()).filter(Boolean)) {
    await sql.query(statement);
    console.log("ok:", statement.slice(0, 60).replace(/\s+/g, " "), "…");
  }
}

console.log("migration complete");
