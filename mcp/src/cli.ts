#!/usr/bin/env node
/**
 * CLI для агента: inbox + wait + extract (JSON на stdout)
 * MAILAGENT_API_URL, MAILAGENT_API_KEY — как у MCP
 */
import { MailAgentClient } from "./client.js";
import { SERVICE_NAMES } from "./service-presets.js";

function usage() {
  console.error(`Usage:
  mailagent inbox create [--service dribbble] [--ttl 30] [--json]
  mailagent wait <inboxId> [--timeout 90] [--json]
  mailagent open [--service dribbble] [--timeout 90] [--no-delete] [--json]

Services: ${SERVICE_NAMES.join(", ")}
`);
  process.exit(2);
}

function flag(args: string[], name: string): boolean {
  return args.includes(name);
}

function opt(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) usage();

  const jsonOut = flag(args, "--json");
  const client = new MailAgentClient();
  const cmd = args[0];

  if (cmd === "inbox" && args[1] === "create") {
    const inbox = await client.createInbox({
      service: opt(args, "--service"),
      ttlMinutes: opt(args, "--ttl")
        ? Number(opt(args, "--ttl"))
        : undefined,
    });
    const out = { ...inbox, hint: "Submit address on signup form, then: mailagent wait <id>" };
    console.log(jsonOut ? JSON.stringify(out) : out.address);
    return;
  }

  if (cmd === "wait") {
    const inboxId = args[1];
    if (!inboxId || inboxId.startsWith("--")) usage();
    const timeout = Number(opt(args, "--timeout") ?? "90");
    const result = await client.waitAndExtract({
      inboxId,
      timeoutSeconds: timeout,
      deleteAfter: false,
    });
    console.log(jsonOut ? JSON.stringify(result, null, 2) : formatWait(result as WaitResult));
    if ("error" in result && result.error === "timeout") process.exit(1);
    return;
  }

  if (cmd === "open") {
    const result = await client.waitAndExtract({
      service: opt(args, "--service"),
      timeoutSeconds: Number(opt(args, "--timeout") ?? "90"),
      deleteAfter: !flag(args, "--no-delete"),
    });
    console.log(jsonOut ? JSON.stringify(result, null, 2) : formatOpen(result as WaitResult));
    if ("error" in result && result.error === "timeout") process.exit(1);
    return;
  }

  usage();
}

type WaitResult = Record<string, unknown> & {
  verification?: { otp?: string; links?: string[]; primaryLink?: string };
};

function formatWait(result: WaitResult): string {
  if ("error" in result) return String(result.hint ?? result.error);
  const v = result.verification;
  const lines = [
    `otp: ${v?.otp ?? "(none)"}`,
    ...(v?.links?.length ? v.links.map((l) => `link: ${l}`) : []),
  ];
  return lines.join("\n");
}

function formatOpen(result: WaitResult): string {
  if ("error" in result) return String(result.hint ?? result.error);
  const lines = [`address: ${result.address}`];
  const v = result.verification;
  if (v?.otp) lines.push(`otp: ${v.otp}`);
  const pl = v?.primaryLink;
  if (pl) lines.push(`primaryLink: ${pl}`);
  for (const l of v?.links ?? []) lines.push(`link: ${l}`);
  return lines.join("\n");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
