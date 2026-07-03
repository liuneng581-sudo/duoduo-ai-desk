/**
 * SSRF guard — validate user-supplied URLs before the server fetches them.
 *
 * Blocks non-http(s) protocols, IP literals that are private/loopback/link-local,
 * and hostnames that resolve to private IPs (DNS-rebinding defense).
 */
import dns from 'dns';

const PRIVATE_IPV4 = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT 100.64.0.0/10
];

export class UnsafeUrlError extends Error {}

function isPrivateIp(ip: string): boolean {
  if (ip === '::1' || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) return true;
  return PRIVATE_IPV4.some((re) => re.test(ip));
}

/**
 * Parse + validate a URL the server is about to fetch. Throws UnsafeUrlError on rejection.
 * Returns the parsed URL on success.
 */
export async function assertSafeFetchUrl(raw: string): Promise<URL> {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new UnsafeUrlError('URL 不能为空');
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('非法 URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('仅允许 http/https 协议');
  }

  const host = url.hostname;

  // Block private/loopback IP literals directly
  if (isPrivateIp(host)) {
    throw new UnsafeUrlError('禁止访问内网/本地地址');
  }

  // Resolve hostname and reject if it points at a private IP (DNS rebinding)
  try {
    const addrs = await dns.promises.lookup(host, { all: true });
    for (const a of addrs) {
      if (isPrivateIp(a.address)) {
        throw new UnsafeUrlError('域名解析到内网地址');
      }
    }
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw err;
    // DNS failure — allow (will surface as a fetch error downstream)
  }

  return url;
}

/**
 * Lighter check: only enforce http(s) protocol (block file:, data:, etc.).
 * Use for endpoints that legitimately may point at local services (e.g. a
 * user's own Ollama/LM Studio at 127.0.0.1). Does NOT block private IPs.
 */
export function assertHttpUrl(raw: string): URL {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new UnsafeUrlError('URL 不能为空');
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('非法 URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('仅允许 http/https 协议');
  }
  return url;
}
