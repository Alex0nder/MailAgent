#!/usr/bin/env node
/** Сгенерировать ключ для пилота и показать команды wrangler */
import { randomBytes } from "node:crypto";

const label = process.argv[2] ?? "pilot";
const key = `ma_${randomBytes(24).toString("base64url")}`;

console.log(`New API key (${label}):\n`);
console.log(key);
console.log(`
Add to Worker (append to existing API_KEYS, comma-separated):

  npx wrangler secret put API_KEYS

Paste example (replace with your full list):
  ${key}

Or keep single key:
  npx wrangler secret put API_KEY

Pilot .env:
  MAILAGENT_API_URL=https://api.webmailagent.com
  MAILAGENT_API_KEY=${key}
`);
