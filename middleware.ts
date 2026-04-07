import { NextResponse, type NextRequest } from "next/server";

/**
 * Rate limiter for API routes.
 *
 * Simple sliding window per IP. Limits to RATE_LIMIT_MAX requests per
 * RATE_LIMIT_WINDOW_MS window (defaults: 120 requests per 60 seconds).
 *
 * Only applies to /api/ routes. Non-API routes pass through.
 * In-memory — resets on deploy. Fine for single-instance Railway.
 */

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10);
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX || "120", 10);

type RateEntry = { count: number; resetAt: number };
const store = new Map<string, RateEntry>();

// Periodic cleanup to prevent memory leak
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 5 * 60 * 1000;

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function middleware(request: NextRequest) {
  // Only rate-limit API routes
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Skip rate limiting for webhooks (GitHub sends bursts)
  if (request.nextUrl.pathname.startsWith("/api/webhook/")) {
    return NextResponse.next();
  }

  cleanup();

  const ip = getClientIp(request);
  const now = Date.now();
  let entry = store.get(ip);

  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    store.set(ip, entry);
  }

  entry.count++;

  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Limit", String(MAX_REQUESTS));
  response.headers.set("X-RateLimit-Remaining", String(Math.max(0, MAX_REQUESTS - entry.count)));
  response.headers.set("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

  if (entry.count > MAX_REQUESTS) {
    return new NextResponse(
      JSON.stringify({ status: "error", message: "Too many requests. Please try again later." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil((entry.resetAt - now) / 1000)),
          "X-RateLimit-Limit": String(MAX_REQUESTS),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(entry.resetAt / 1000)),
        },
      },
    );
  }

  return response;
}

export const config = {
  matcher: "/api/:path*",
};
