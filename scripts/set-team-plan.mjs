#!/usr/bin/env node
/** Manual plan without Stripe: npm run team:plan -- TEAM_ID pro|free */
import "./load-env.mjs";
import { neon } from "@neondatabase/serverless";

const teamId = process.argv[2];
const plan = process.argv[3];

if (!teamId || !["free", "pro", "enterprise"].includes(plan)) {
  console.error("Usage: npm run team:plan -- <team_id> free|pro|enterprise");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const sql = neon(url);
await sql`UPDATE teams SET plan = ${plan} WHERE id = ${teamId}`;
console.log(`team ${teamId} → plan=${plan}`);
