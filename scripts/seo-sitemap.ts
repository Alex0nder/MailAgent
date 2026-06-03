#!/usr/bin/env npx tsx
/** Regenerate public/sitemap.xml from src/lib/seo.ts (run after adding indexable pages). */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildSitemapXml } from "../src/lib/seo";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "sitemap.xml");
const lastmod = process.argv[2] ?? new Date().toISOString().slice(0, 10);
writeFileSync(out, `${buildSitemapXml(lastmod)}\n`, "utf8");
console.log(`Wrote ${out} (${lastmod})`);
