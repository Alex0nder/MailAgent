/** MX record lookup via DNS-over-HTTPS (no external Reacher dependency) */

type DnsAnswer = {
  name?: string;
  type?: number;
  data?: string;
};

type DnsJsonResponse = {
  Status?: number;
  Answer?: DnsAnswer[];
};

const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";

export type MxLookupResult = {
  acceptsMail: boolean;
  records: string[];
};

function parseMxData(data: string): { priority: number; host: string } {
  const trimmed = data.trim();
  const space = trimmed.indexOf(" ");
  if (space === -1) return { priority: 0, host: trimmed.replace(/\.$/, "") };
  return {
    priority: Number(trimmed.slice(0, space)) || 0,
    host: trimmed.slice(space + 1).trim().replace(/\.$/, ""),
  };
}

export async function lookupMxRecords(domain: string): Promise<MxLookupResult> {
  const url = `${DOH_ENDPOINT}?name=${encodeURIComponent(domain)}&type=MX`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/dns-json" },
    });
    if (!res.ok) {
      return { acceptsMail: false, records: [] };
    }
    const body = (await res.json()) as DnsJsonResponse;
    const answers = body.Answer ?? [];
    const mx = answers
      .filter((a) => a.type === 15 && a.data)
      .map((a) => parseMxData(a.data!))
      .sort((a, b) => a.priority - b.priority)
      .map((a) => a.host);
    return {
      acceptsMail: mx.length > 0,
      records: mx,
    };
  } catch {
    return { acceptsMail: false, records: [] };
  }
}
