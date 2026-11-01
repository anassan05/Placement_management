/**
 * Resolves a client IP address from request headers.
 *
 * Only the configured trusted proxy addresses may supply forwarded headers.
 * Arbitrary X-Forwarded-For values are never trusted by default.
 */
export function getClientIp(
  headers: Headers | Record<string, string | undefined>,
  trustedProxies: readonly string[] = []
): string {
  const get = (name: string): string | undefined => {
    if (headers instanceof Headers) return headers.get(name) ?? undefined;
    return headers[name.toLowerCase()] ?? headers[name];
  };

  const forwardedFor = get("x-forwarded-for");

  // Without an explicitly trusted proxy list, ignore forwarded headers entirely.
  if (trustedProxies.length === 0) {
    const direct = get("x-real-ip");
    return direct?.trim() || "unknown";
  }

  if (forwardedFor) {
    const candidates = forwardedFor.split(",").map((value) => value.trim()).filter(Boolean);
    // The rightmost entry added by the trusted proxy is the client address.
    const client = candidates[candidates.length - 1];
    if (client) return client;
  }

  const realIp = get("x-real-ip");
  if (realIp) return realIp.trim();

  return "unknown";
}

export function isTrustedProxy(ip: string, trustedProxies: readonly string[]): boolean {
  return trustedProxies.includes(ip);
}
