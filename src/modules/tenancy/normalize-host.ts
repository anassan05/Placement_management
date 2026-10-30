/**
 * Normalizes a request hostname before looking it up in CollegeDomain.
 * This is not authentication and must not be used as the sole tenant
 * authorization check after login.
 */
export function normalizeHost(input: string): string {
  const candidate = input.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  if (!candidate || candidate.length > 253 || candidate.includes("@") || /\s/.test(candidate)) return "";
  if (candidate.startsWith("[") && candidate.endsWith("]")) return candidate.slice(1, -1);
  return candidate;
}

export function isTrustedHost(hostHeader: string, trustedHosts: readonly string[]): boolean {
  const host = normalizeHost(hostHeader);
  return trustedHosts.some((candidate) => normalizeHost(candidate) === host);
}
