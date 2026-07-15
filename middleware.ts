import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
  "Access-Control-Max-Age": "86400",
};

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

const AP_TYPES = ["application/activity+json", "application/ld+json"];

function isAPRequest(request: NextRequest): boolean {
  const accept = request.headers.get("accept") ?? "";
  return AP_TYPES.some((t) => accept.includes(t));
}

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const method = request.method;

  if (method === "OPTIONS" && (pathname.startsWith("/api/") || pathname.startsWith("/nodeinfo/"))) {
    return new NextResponse(null, { status: 204, headers: { ...CORS_HEADERS, ...SECURITY_HEADERS } });
  }

  const subMatch = pathname.match(/^\/users\/([^/]+)\/(outbox|inbox|followers|following)$/);
  if (subMatch) {
    const url = request.nextUrl.clone();
    url.pathname = `/api/users/${subMatch[1]}/${subMatch[2]}`;
    const rewriteResponse = NextResponse.rewrite(url);
    Object.entries(SECURITY_HEADERS).forEach(([k, v]) => rewriteResponse.headers.set(k, v));
    return rewriteResponse;
  }

  const actorMatch = pathname.match(/^\/users\/([^/]+)$/);
  if (actorMatch && method === "GET" && isAPRequest(request)) {
    const url = request.nextUrl.clone();
    url.pathname = `/api/users/${actorMatch[1]}`;
    searchParams.forEach((v, k) => url.searchParams.set(k, v));
    const rewriteResponse = NextResponse.rewrite(url);
    Object.entries(CORS_HEADERS).forEach(([k, v]) => rewriteResponse.headers.set(k, v));
    Object.entries(SECURITY_HEADERS).forEach(([k, v]) => rewriteResponse.headers.set(k, v));
    return rewriteResponse;
  }

  const atMatch = pathname.match(/^\/@([^/]+)(\/.*)?$/);
  if (atMatch && method === "GET") {
    const username = atMatch[1];
    const rest = atMatch[2] ?? "";
    const url = request.nextUrl.clone();
    if (isAPRequest(request)) {
      url.pathname = `/api/users/${username}`;
      const rewriteResponse = NextResponse.rewrite(url);
      Object.entries(CORS_HEADERS).forEach(([k, v]) => rewriteResponse.headers.set(k, v));
      Object.entries(SECURITY_HEADERS).forEach(([k, v]) => rewriteResponse.headers.set(k, v));
      return rewriteResponse;
    }
    url.pathname = `/users/${username}`;
    if (rest) url.searchParams.set("tab", rest.slice(1));
    const rewriteResponse = NextResponse.rewrite(url);
    Object.entries(SECURITY_HEADERS).forEach(([k, v]) => rewriteResponse.headers.set(k, v));
    return rewriteResponse;
  }

  if (pathname === "/inbox" || pathname.startsWith("/api/") || pathname.startsWith("/nodeinfo/")) {
    if (pathname === "/inbox") {
      const url = request.nextUrl.clone();
      url.pathname = "/api/inbox";
      const rewriteResponse = NextResponse.rewrite(url);
      Object.entries(CORS_HEADERS).forEach(([k, v]) => rewriteResponse.headers.set(k, v));
      Object.entries(SECURITY_HEADERS).forEach(([k, v]) => rewriteResponse.headers.set(k, v));
      return rewriteResponse;
    }
    if (pathname.startsWith("/nodeinfo/")) {
      const url = request.nextUrl.clone();
      url.pathname = "/api" + pathname;
      const rewriteResponse = NextResponse.rewrite(url);
      Object.entries(CORS_HEADERS).forEach(([k, v]) => rewriteResponse.headers.set(k, v));
      Object.entries(SECURITY_HEADERS).forEach(([k, v]) => rewriteResponse.headers.set(k, v));
      return rewriteResponse;
    }
    const response = NextResponse.next();
    Object.entries(CORS_HEADERS).forEach(([k, v]) => response.headers.set(k, v));
    Object.entries(SECURITY_HEADERS).forEach(([k, v]) => response.headers.set(k, v));
    return response;
  }

  const response = NextResponse.next();
  Object.entries(SECURITY_HEADERS).forEach(([k, v]) => response.headers.set(k, v));
  return response;
}

export const config = {
  matcher: ["/users/:path*", "/api/:path*", "/nodeinfo/:path*", "/@:username", "/@:username/:path*", "/inbox"],
};
