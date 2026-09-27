import net from "node:net";
import dns from "node:dns/promises";

/**
 * SSRF guard for the metadata scraper. The app fetches arbitrary user URLs,
 * so we must ensure a URL never points at internal infrastructure: localhost,
 * RFC1918 ranges, link-local (cloud metadata 169.254.169.254), ULA, etc.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata",
  "metadata.google.internal",
  "instance-data",
]);

/** True if the hostname/IP must never be fetched. */
export function isPrivateAddress(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;

  // Literal IPs (including IPv6 in brackets already stripped by URL parser).
  if (net.isIP(host)) return isPrivateIp(host);

  // Cloud metadata hostnames used by some providers.
  if (/^metadata\.|^169\.254\.169\.254$/.test(host)) return true;
  return false;
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fe80") || lower.startsWith("fc") || lower.startsWith("fd"))
      return true; // link-local + unique local
    if (lower.startsWith("::ffff:")) {
      const v4 = lower.split(":").pop() ?? "";
      return net.isIPv4(v4) ? isPrivateIp(v4) : true;
    }
    return false;
  }
  return true; // not parseable → treat as unsafe
}

/**
 * Resolve every hostname a URL may use and verify none of the addresses are
 * private. Returns a reason string when blocked, null when safe.
 */
export async function assertSafeUrl(raw: string): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "invalid URL";
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return "unsupported protocol";
  if (isPrivateAddress(url.hostname)) return "blocked host";

  // Only ports 80/443 (or none) — anything else is a red flag.
  if (url.port && url.port !== "80" && url.port !== "443") return "blocked port";

  let addresses: Array<{ address: string }> = [];
  try {
    addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    return "hostname does not resolve";
  }
  if (addresses.length === 0) return "hostname does not resolve";
  for (const { address } of addresses) {
    if (isPrivateIp(address)) return "resolved to a private address";
  }
  return null;
}
