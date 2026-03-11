// src/app/api/users/create/route.ts
// API route for creating new user accounts via Firebase Admin SDK

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin";
import { verifyFullAdminAuth } from "@/lib/auth";
import { strictRateLimiter } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  // Rate limit: 3 requests per 5 minutes (sensitive operation)
  const rateLimitResult = await strictRateLimiter.check(request);
  if (!rateLimitResult.success) {
    return rateLimitResult.response!;
  }

  // Only full admins can create users
  const authResult = await verifyFullAdminAuth(request);
  if (!authResult.success) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  try {
    const body = await request.json();
    const { email, password, displayName } = body;

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format." },
        { status: 400 }
      );
    }

    // Validate password length (Firebase minimum is 6)
    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    const adminAuth = getAdminAuth();
    const db = getAdminFirestore();

    // Create the user in Firebase Auth
    const userRecord = await adminAuth.createUser({
      email: email.trim().toLowerCase(),
      password,
      displayName: displayName?.trim() || undefined,
    });

    // Create a Firestore document for the user
    await db.collection("users").doc(userRecord.uid).set({
      email: userRecord.email,
      displayName: userRecord.displayName || "",
      isAdmin: false,
      isSemiAdmin: false,
      createdAt: new Date().toISOString(),
      createdBy: authResult.user.uid,
    });

    console.log(
      `[User Created] UID: ${userRecord.uid}, Email: ${userRecord.email}, CreatedBy: ${authResult.user.uid}`
    );

    return NextResponse.json({
      success: true,
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName || "",
      },
    });
  } catch (error: unknown) {
    console.error("Error creating user:", error);

    // Handle specific Firebase Auth errors
    if (error && typeof error === "object" && "code" in error) {
      const firebaseError = error as { code: string; message: string };

      switch (firebaseError.code) {
        case "auth/email-already-exists":
          return NextResponse.json(
            { error: "A user with this email already exists." },
            { status: 409 }
          );
        case "auth/invalid-email":
          return NextResponse.json(
            { error: "The email address is invalid." },
            { status: 400 }
          );
        case "auth/invalid-password":
          return NextResponse.json(
            { error: "The password must be at least 6 characters." },
            { status: 400 }
          );
        default:
          return NextResponse.json(
            { error: firebaseError.message || "Failed to create user." },
            { status: 500 }
          );
      }
    }

    return NextResponse.json(
      { error: "An unexpected error occurred while creating the user." },
      { status: 500 }
    );
  }
}
