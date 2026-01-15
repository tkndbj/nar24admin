// src/lib/auth.ts
// Server-side authentication utilities for API route protection

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore, getAdminAppCheck } from "./firebase-admin";
import { DecodedIdToken } from "firebase-admin/auth";

export interface AuthenticatedUser {
  uid: string;
  email: string | undefined;
  isAdmin: boolean;
  isSemiAdmin: boolean;
}

export interface AuthResult {
  success: true;
  user: AuthenticatedUser;
}

export interface AuthError {
  success: false;
  error: string;
  status: number;
}

export type AuthResponse = AuthResult | AuthError;

/**
 * Verifies the Firebase ID token from the Authorization header
 * and checks if the user has admin or semi-admin privileges.
 *
 * Usage in API routes:
 * ```typescript
 * export async function GET(request: NextRequest) {
 *   const authResult = await verifyAdminAuth(request);
 *   if (!authResult.success) {
 *     return NextResponse.json({ error: authResult.error }, { status: authResult.status });
 *   }
 *   // User is authenticated and authorized
 *   const { user } = authResult;
 *   // ... rest of your handler
 * }
 * ```
 */
export async function verifyAdminAuth(request: NextRequest): Promise<AuthResponse> {
  try {
    // Extract the Bearer token from Authorization header
    const authHeader = request.headers.get("Authorization");

    if (!authHeader) {
      return {
        success: false,
        error: "Missing Authorization header",
        status: 401,
      };
    }

    if (!authHeader.startsWith("Bearer ")) {
      return {
        success: false,
        error: "Invalid Authorization header format. Expected: Bearer <token>",
        status: 401,
      };
    }

    const idToken = authHeader.substring(7); // Remove "Bearer " prefix

    if (!idToken || idToken.trim() === "") {
      return {
        success: false,
        error: "Empty token provided",
        status: 401,
      };
    }

    // Verify the ID token using Firebase Admin SDK
    let decodedToken: DecodedIdToken;
    try {
      const auth = getAdminAuth();
      decodedToken = await auth.verifyIdToken(idToken);
    } catch (tokenError) {
      console.error("Token verification failed:", tokenError);

      // Provide specific error messages for common token issues
      const errorMessage = tokenError instanceof Error ? tokenError.message : "Unknown error";

      if (errorMessage.includes("expired")) {
        return {
          success: false,
          error: "Token has expired. Please sign in again.",
          status: 401,
        };
      }

      if (errorMessage.includes("invalid") || errorMessage.includes("malformed")) {
        return {
          success: false,
          error: "Invalid token. Please sign in again.",
          status: 401,
        };
      }

      return {
        success: false,
        error: "Token verification failed",
        status: 401,
      };
    }

    // Get user data from Firestore to check admin status
    const db = getAdminFirestore();
    const userDoc = await db.collection("users").doc(decodedToken.uid).get();

    if (!userDoc.exists) {
      return {
        success: false,
        error: "User profile not found",
        status: 403,
      };
    }

    const userData = userDoc.data();

    if (!userData) {
      return {
        success: false,
        error: "User data is empty",
        status: 403,
      };
    }

    const isAdmin = userData.isAdmin === true;
    const isSemiAdmin = userData.isSemiAdmin === true;

    // Only allow admin or semi-admin users
    if (!isAdmin && !isSemiAdmin) {
      return {
        success: false,
        error: "Access denied. Admin privileges required.",
        status: 403,
      };
    }

    return {
      success: true,
      user: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        isAdmin,
        isSemiAdmin,
      },
    };
  } catch (error) {
    console.error("Auth verification error:", error);
    return {
      success: false,
      error: "Internal authentication error",
      status: 500,
    };
  }
}

/**
 * Verifies that the user is a full admin (not just semi-admin)
 * Use this for sensitive operations that require full admin access.
 */
export async function verifyFullAdminAuth(request: NextRequest): Promise<AuthResponse> {
  const authResult = await verifyAdminAuth(request);

  if (!authResult.success) {
    return authResult;
  }

  if (!authResult.user.isAdmin) {
    return {
      success: false,
      error: "Access denied. Full admin privileges required.",
      status: 403,
    };
  }

  return authResult;
}

/**
 * Helper function to create an unauthorized response
 */
export function unauthorizedResponse(message: string = "Unauthorized"): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

/**
 * Helper function to create a forbidden response
 */
export function forbiddenResponse(message: string = "Forbidden"): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

/**
 * Verifies the App Check token from the X-Firebase-AppCheck header.
 * This provides an additional layer of security by ensuring requests
 * come from your genuine app, not from scripts or bots.
 *
 * @param request - The incoming Next.js request
 * @returns true if App Check token is valid, false otherwise
 */
export async function verifyAppCheck(request: NextRequest): Promise<boolean> {
  const appCheckToken = request.headers.get("X-Firebase-AppCheck");

  if (!appCheckToken) {
    console.warn("App Check: Missing X-Firebase-AppCheck header");
    return false;
  }

  try {
    const appCheck = getAdminAppCheck();
    await appCheck.verifyToken(appCheckToken);
    return true;
  } catch (error) {
    console.error("App Check verification failed:", error);
    return false;
  }
}

/**
 * Configuration options for App Check enforcement
 */
export interface AppCheckOptions {
  /** If true, requests without valid App Check tokens will be rejected */
  enforceAppCheck?: boolean;
}

/**
 * Verifies admin authentication with optional App Check enforcement.
 * Use this when you want to require both Firebase Auth AND App Check.
 *
 * @param request - The incoming Next.js request
 * @param options - Configuration options for App Check enforcement
 */
export async function verifyAdminAuthWithAppCheck(
  request: NextRequest,
  options: AppCheckOptions = { enforceAppCheck: true }
): Promise<AuthResponse> {
  // First verify App Check if enforcement is enabled
  if (options.enforceAppCheck) {
    const isAppCheckValid = await verifyAppCheck(request);
    if (!isAppCheckValid) {
      return {
        success: false,
        error: "App Check verification failed. Request rejected.",
        status: 401,
      };
    }
  }

  // Then proceed with regular admin auth verification
  return verifyAdminAuth(request);
}

/**
 * Wrapper function for protected API routes with App Check enforcement.
 * This ensures both App Check AND admin authentication are verified.
 *
 * Usage:
 * ```typescript
 * export const GET = withAppCheckAndAdminAuth(async (request, user) => {
 *   // user is guaranteed to be authenticated with valid App Check
 *   return NextResponse.json({ data: "protected data" });
 * });
 * ```
 */
export function withAppCheckAndAdminAuth(
  handler: (request: NextRequest, user: AuthenticatedUser) => Promise<NextResponse>,
  options: AppCheckOptions = { enforceAppCheck: true }
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const authResult = await verifyAdminAuthWithAppCheck(request, options);

    if (!authResult.success) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    return handler(request, authResult.user);
  };
}

/**
 * Wrapper function for protected API routes
 * Handles authentication and passes the authenticated user to the handler
 *
 * Usage:
 * ```typescript
 * export const GET = withAdminAuth(async (request, user) => {
 *   // user is guaranteed to be an authenticated admin
 *   return NextResponse.json({ data: "protected data" });
 * });
 * ```
 */
export function withAdminAuth(
  handler: (request: NextRequest, user: AuthenticatedUser) => Promise<NextResponse>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const authResult = await verifyAdminAuth(request);

    if (!authResult.success) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    return handler(request, authResult.user);
  };
}

/**
 * Wrapper function for routes that require full admin access
 */
export function withFullAdminAuth(
  handler: (request: NextRequest, user: AuthenticatedUser) => Promise<NextResponse>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const authResult = await verifyFullAdminAuth(request);

    if (!authResult.success) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    return handler(request, authResult.user);
  };
}
