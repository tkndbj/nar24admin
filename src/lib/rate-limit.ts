// src/lib/rate-limit.ts
// In-memory rate limiting for API routes
// Note: On serverless (Vercel), each instance has separate memory.
// This is still effective for admin panels with low traffic as it stops
// rapid-fire attacks within the same instance's lifetime.

import { NextRequest, NextResponse } from "next/server";

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Time window in seconds */
  windowSizeSeconds: number;
  /** Identifier for this limiter (for logging) */
  name?: string;
}

// In-memory store for rate limiting
// Key: IP address or identifier, Value: request count and reset time
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup interval to prevent memory leaks (runs every 5 minutes)
let cleanupInterval: NodeJS.Timeout | null = null;

function startCleanup() {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now > entry.resetTime) {
        rateLimitStore.delete(key);
      }
    }
  }, 5 * 60 * 1000); // Clean up every 5 minutes
}

// Start cleanup on module load
if (typeof window === "undefined") {
  startCleanup();
}

/**
 * Get client IP from request headers
 */
function getClientIp(request: NextRequest): string {
  // Vercel/Cloudflare headers
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs, take the first one
    return forwardedFor.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Fallback
  return "unknown";
}

/**
 * Check if a request should be rate limited
 * @returns Object with success status and remaining requests
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): { success: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const windowMs = config.windowSizeSeconds * 1000;
  const key = `${config.name || "default"}:${identifier}`;

  const entry = rateLimitStore.get(key);

  // If no entry or window expired, create new entry
  if (!entry || now > entry.resetTime) {
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });
    return {
      success: true,
      remaining: config.maxRequests - 1,
      resetIn: config.windowSizeSeconds,
    };
  }

  // Check if limit exceeded
  if (entry.count >= config.maxRequests) {
    const resetIn = Math.ceil((entry.resetTime - now) / 1000);
    return {
      success: false,
      remaining: 0,
      resetIn,
    };
  }

  // Increment counter
  entry.count++;
  const resetIn = Math.ceil((entry.resetTime - now) / 1000);

  return {
    success: true,
    remaining: config.maxRequests - entry.count,
    resetIn,
  };
}

/**
 * Rate limit middleware for API routes
 */
export function rateLimit(config: RateLimitConfig) {
  return async function rateLimitMiddleware(
    request: NextRequest
  ): Promise<{ success: boolean; response?: NextResponse }> {
    const ip = getClientIp(request);
    const result = checkRateLimit(ip, config);

    if (!result.success) {
      console.warn(
        `[Rate Limit] ${config.name || "API"}: IP ${ip} exceeded limit (${config.maxRequests}/${config.windowSizeSeconds}s)`
      );

      const response = NextResponse.json(
        {
          error: "Too many requests. Please try again later.",
          retryAfter: result.resetIn,
        },
        {
          status: 429,
          headers: {
            "Retry-After": result.resetIn.toString(),
            "X-RateLimit-Limit": config.maxRequests.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": result.resetIn.toString(),
          },
        }
      );

      return { success: false, response };
    }

    return { success: true };
  };
}

/**
 * Create a rate limiter with preset configuration
 */
export function createRateLimiter(config: RateLimitConfig) {
  return {
    check: (request: NextRequest) => rateLimit(config)(request),
    checkByIdentifier: (identifier: string) => checkRateLimit(identifier, config),
  };
}

// ============================================
// Pre-configured rate limiters for common use cases
// ============================================

/**
 * Strict rate limiter for authentication endpoints
 * 5 requests per 60 seconds per IP
 */
export const authRateLimiter = createRateLimiter({
  name: "auth",
  maxRequests: 5,
  windowSizeSeconds: 60,
});

/**
 * Standard rate limiter for API endpoints
 * 30 requests per 60 seconds per IP
 */
export const apiRateLimiter = createRateLimiter({
  name: "api",
  maxRequests: 30,
  windowSizeSeconds: 60,
});

/**
 * Lenient rate limiter for read-heavy endpoints
 * 100 requests per 60 seconds per IP
 */
export const readRateLimiter = createRateLimiter({
  name: "read",
  maxRequests: 100,
  windowSizeSeconds: 60,
});

/**
 * Very strict rate limiter for sensitive operations
 * 3 requests per 5 minutes per IP
 */
export const strictRateLimiter = createRateLimiter({
  name: "strict",
  maxRequests: 3,
  windowSizeSeconds: 300,
});
