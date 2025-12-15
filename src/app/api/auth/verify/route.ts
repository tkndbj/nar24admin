// src/app/api/auth/verify/route.ts
// Server-side authentication verification endpoint
// This endpoint verifies the Firebase ID token and checks admin status in Firestore

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin";
import { DecodedIdToken } from "firebase-admin/auth";
import { authRateLimiter } from "@/lib/rate-limit";

export interface VerifyAuthResponse {
  success: true;
  user: {
    uid: string;
    email: string | undefined;
    isAdmin: boolean;
    isSemiAdmin: boolean;
    displayName?: string;
    photoURL?: string;
  };
}

export interface VerifyAuthError {
  success: false;
  error: string;
  code: "INVALID_TOKEN" | "USER_NOT_FOUND" | "NOT_ADMIN" | "SERVER_ERROR";
}

export type VerifyAuthResult = VerifyAuthResponse | VerifyAuthError;

export async function POST(request: NextRequest): Promise<NextResponse<VerifyAuthResult>> {
  // Apply rate limiting (5 requests per 60 seconds per IP)
  const rateLimitResult = await authRateLimiter.check(request);
  if (!rateLimitResult.success && rateLimitResult.response) {
    return rateLimitResult.response as NextResponse<VerifyAuthResult>;
  }

  try {
    // Extract the ID token from the request body
    const body = await request.json().catch(() => null);

    if (!body || typeof body.idToken !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "Missing or invalid ID token",
          code: "INVALID_TOKEN",
        },
        { status: 400 }
      );
    }

    const { idToken } = body;

    // Verify the ID token using Firebase Admin SDK
    let decodedToken: DecodedIdToken;
    let auth;
    try {
      auth = getAdminAuth();
    } catch (initError) {
      console.error("Firebase Admin initialization failed:", initError);
      return NextResponse.json(
        {
          success: false,
          error: "Server configuration error. Please contact administrator.",
          code: "SERVER_ERROR",
        },
        { status: 500 }
      );
    }

    try {
      decodedToken = await auth.verifyIdToken(idToken);
    } catch (tokenError) {
      console.error("Token verification failed:", tokenError);

      const errorMessage = tokenError instanceof Error ? tokenError.message : "Unknown error";

      if (errorMessage.includes("expired")) {
        return NextResponse.json(
          {
            success: false,
            error: "Token has expired. Please sign in again.",
            code: "INVALID_TOKEN",
          },
          { status: 401 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: "Invalid token. Please sign in again.",
          code: "INVALID_TOKEN",
        },
        { status: 401 }
      );
    }

    // Get user data from Firestore to check admin status
    const db = getAdminFirestore();
    const userDoc = await db.collection("users").doc(decodedToken.uid).get();

    if (!userDoc.exists) {
      return NextResponse.json(
        {
          success: false,
          error: "User profile not found in database",
          code: "USER_NOT_FOUND",
        },
        { status: 403 }
      );
    }

    const userData = userDoc.data();

    if (!userData) {
      return NextResponse.json(
        {
          success: false,
          error: "User data is empty",
          code: "USER_NOT_FOUND",
        },
        { status: 403 }
      );
    }

    const isAdmin = userData.isAdmin === true;
    const isSemiAdmin = userData.isSemiAdmin === true;

    // Only allow admin or semi-admin users
    if (!isAdmin && !isSemiAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: "Access denied. Admin privileges required.",
          code: "NOT_ADMIN",
        },
        { status: 403 }
      );
    }

    // Return verified user data
    return NextResponse.json({
      success: true,
      user: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        isAdmin,
        isSemiAdmin,
        displayName: userData.displayName || undefined,
        photoURL: userData.photoURL || undefined,
      },
    });
  } catch (error) {
    console.error("Auth verification error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error during authentication",
        code: "SERVER_ERROR",
      },
      { status: 500 }
    );
  }
}

// Also support GET for simple token verification (used by middleware)
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Apply rate limiting
  const rateLimitResult = await authRateLimiter.check(request);
  if (!rateLimitResult.success && rateLimitResult.response) {
    return rateLimitResult.response;
  }

  const authHeader = request.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { success: false, error: "Missing Authorization header" },
      { status: 401 }
    );
  }

  const idToken = authHeader.substring(7);

  // Create a mock request with the token in body
  const verifyRequest = new NextRequest(request.url, {
    method: "POST",
    body: JSON.stringify({ idToken }),
    headers: {
      "Content-Type": "application/json",
    },
  });

  return POST(verifyRequest);
}
