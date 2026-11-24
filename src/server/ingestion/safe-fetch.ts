/**
 * SSRF-safe outbound HTTP for source adapters. Used for every request an adapter makes; nothing else in the
 * ingestion code opens a connection.
 *
 *  - https only, default port only, no credentials in the URL, no IP-literal hosts.
 *  - The host must be on the adapter's explicit allow-list (exact match).
 *  - DNS is resolved by us and EVERY address checked against private, loopback, link-local, CGNAT, multicast,
 *    reserved, metadata and IPv4-mapped ranges; the connection is then pinned to the checked address (no
 *    re-resolution between check and connect, so DNS rebinding cannot swap the target).
 *  - Redirects are not followed automatically; at most 3 are followed, each re-validated from scratch.
 *  - Timeouts on connect and total time; response size capped; content type checked by the caller.
 * Errors name the host only, never the full URL (query strings can carry tokens).
 */
import { lookup as dnsLookup } from "node:dns/promises";
import https from "node:https";
import net from "node:net";

export class FetchBlockedError extends Error {
  readonly permanent = true;
}

export interface SafeResponse { status: number; contentType: string; body: string; finalUrl: string }
export interface SafeFetchOptions {
  allowedHosts: readonly string[];
  headers?: Record<string, string>;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
}
/** Injected in tests. Receives the already-validated URL and the pinned address. */
export type Transport = (url: URL, address: string, opts: Required<Pick<SafeFetchOptions, "maxBytes" | "timeoutMs">> & { headers: Record<string, string> }) => Promise<{ status: number; headers: Record<string, string | undefined>; body: string }>;
export type Resolver = (host: string) => Promise<string[]>;

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
}
const V4_BLOCK: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4], ["255.255.255.255", 32],
];

export function isBlockedAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const n = ipv4ToInt(ip);
    return V4_BLOCK.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (ipv4ToInt(base) & mask);
    });
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    const mapped = v.match(/^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/) ?? v.match(/^::(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedAddress(mapped[1]);
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(v)) return true; // hex-form mapped IPv4: refuse rather than parse
    if (v === "::" || v === "::1") return true;
    const first = parseInt(v.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
    if ((first & 0xffc0) === 0xfec0) return true; // fec0::/10 site local (deprecated)
    if ((first & 0xff00) === 0xff00) return true; // multicast
    if (v.startsWith("64:ff9b:") || v.startsWith("2001:db8:") || v.startsWith("2001:0db8:") || v.startsWith("2002:") || v.startsWith("100::")) return true; // NAT64, doc, 6to4, discard
    return false;
  }
  return true; // not an IP at all
}

export function validateUrl(raw: string, allowedHosts: readonly string[]): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchBlockedError("Invalid URL");
  }
  if (url.protocol !== "https:") throw new FetchBlockedError(`Only https is allowed (${url.hostname})`);
  if (url.username || url.password) throw new FetchBlockedError("Credentials in URLs are not allowed");
  if (url.port && url.port !== "443") throw new FetchBlockedError(`Non-standard port refused (${url.hostname})`);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (net.isIP(host.replace(/^\[|\]$/g, ""))) throw new FetchBlockedError("IP-address hosts are not allowed");
  if (!allowedHosts.map((h) => h.toLowerCase()).includes(host)) throw new FetchBlockedError(`Host not on this source's allow-list (${host})`);
  return url;
}

const defaultResolver: Resolver = async (host) => (await dnsLookup(host, { all: true, verbatim: true })).map((a) => a.address);

const defaultTransport: Transport = (url, address, opts) =>
  new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: address, // pinned: connect to the address we checked
        servername: url.hostname, // TLS SNI + certificate validation against the real host name
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: { ...opts.headers, host: url.hostname },
        timeout: opts.timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > opts.maxBytes) {
            req.destroy(new FetchBlockedError(`Response larger than ${opts.maxBytes} bytes (${url.hostname})`));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v])), body: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error(`Timed out (${url.hostname})`)));
    req.on("error", reject);
    req.end();
  });

export async function safeFetch(raw: string, opts: SafeFetchOptions, deps: { transport?: Transport; resolver?: Resolver } = {}): Promise<SafeResponse> {
  const transport = deps.transport ?? defaultTransport;
  const resolver = deps.resolver ?? defaultResolver;
  const headers = { "user-agent": "AvsarBot/1.0 (authorized source collection)", accept: "application/json, application/ld+json, text/html;q=0.8", ...opts.headers };
  const limits = { maxBytes: opts.maxBytes ?? 5_000_000, timeoutMs: opts.timeoutMs ?? 15_000 };
  let current = raw;
  for (let hop = 0; hop <= (opts.maxRedirects ?? 3); hop++) {
    const url = validateUrl(current, opts.allowedHosts);
    const addresses = await resolver(url.hostname);
    if (!addresses.length) throw new Error(`Could not resolve ${url.hostname}`);
    const bad = addresses.find(isBlockedAddress);
    if (bad) throw new FetchBlockedError(`${url.hostname} resolves to a private or reserved address`);
    const res = await transport(url, addresses[0], { ...limits, headers });
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      current = new URL(res.headers.location, url).toString();
      continue;
    }
    return { status: res.status, contentType: (res.headers["content-type"] ?? "").toLowerCase(), body: res.body, finalUrl: url.toString() };
  }
  throw new FetchBlockedError("Too many redirects");
}

/** Minimal robots.txt check for the "*" and AvsarBot groups (Disallow prefixes only). Used before reading any HTML page. */
export function robotsAllows(robots: string, path: string, agent = "avsarbot"): boolean {
  const groups: { agents: string[]; disallow: string[]; allow: string[] }[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const line of robots.split(/\r?\n/)) {
    const m = line.replace(/#.*/, "").trim().match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const [k, v] = [m[1].toLowerCase(), m[2].trim()];
    if (k === "user-agent") {
      if (!cur || !lastWasAgent) groups.push((cur = { agents: [], disallow: [], allow: [] }));
      cur.agents.push(v.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (k === "disallow" && v) cur.disallow.push(v);
    if (k === "allow" && v) cur.allow.push(v);
  }
  const g = groups.find((x) => x.agents.includes(agent)) ?? groups.find((x) => x.agents.includes("*"));
  if (!g) return true;
  const longest = (rules: string[]) => Math.max(-1, ...rules.filter((r) => path.startsWith(r.replace(/\*.*$/, ""))).map((r) => r.length));
  return longest(g.allow) >= longest(g.disallow);
}
