// src/middleware.ts
// Next.js Edge Middleware for route protection
// Note: This middleware runs on the Edge runtime and provides an additional
// layer of security by checking for authentication cookies/headers before
// the request reaches the page or API route.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that don't require authentication
const publicRoutes = ["/", "/login"];

// Routes that are always accessible (static assets, etc.)
const alwaysAccessible = [
  "/_next",
  "/favicon.ico",
  "/api/health", // Health check endpoint if needed
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static assets and Next.js internals
  if (alwaysAccessible.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Allow public routes
  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  // For API routes, we rely on the API route handlers to verify the token
  // This is because Edge Runtime doesn't support firebase-admin
  // The API routes will verify the Bearer token server-side
  if (pathname.startsWith("/api/")) {
    // Check if Authorization header is present for API routes
    const authHeader = request.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid Authorization header" },
        { status: 401 }
      );
    }

    // Token format looks valid, let the API route handler verify it
    return NextResponse.next();
  }

  // For page routes (dashboard, etc.), check if there's an auth session
  // We can't verify the Firebase token in Edge middleware, but we can
  // check for the presence of Firebase auth cookies as a basic check
  // The actual verification happens client-side via AuthContext

  // Note: Firebase Auth stores session in IndexedDB, not cookies by default
  // So for SSR page protection, we rely on client-side ProtectedRoute component
  // This middleware primarily protects API routes

  return NextResponse.next();
}

// Configure which routes the middleware runs on
export const config = {
  matcher: [
    // Match all API routes
    "/api/:path*",
    // Match all page routes except static files
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
