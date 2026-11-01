import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const trustedHosts = (process.env.TRUSTED_HOSTS ?? "localhost,127.0.0.1")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

function normalizeHost(value: string | null): string {
  if (!value) return "";
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return value.trim().toLowerCase().replace(/:\d+$/, "");
  }
}

function isStateChanging(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

export function proxy(request: NextRequest) {
  const requestHost = request.headers.get("host")?.toLowerCase() ?? "";
  const nonce = Buffer.from(randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const contentSecurityPolicy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "connect-src 'self'"
  ].join("; ");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  if (isStateChanging(request.method)) {
    const origin = request.headers.get("origin");
    const referer = request.headers.get("referer");
    const sourceHost = normalizeHost(origin ?? referer);
    const allowed = [requestHost, ...trustedHosts, normalizeHost(process.env.APP_URL ?? null)].filter(Boolean);
    if (!sourceHost || !allowed.includes(sourceHost)) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};