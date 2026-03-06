import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin";

export async function POST(request: NextRequest) {
  try {
    // Verify the caller is an admin
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const idToken = authHeader.split("Bearer ")[1];
    const auth = getAdminAuth();
    const decodedToken = await auth.verifyIdToken(idToken);

    if (!decodedToken.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { uid } = await request.json();
    if (!uid) {
      return NextResponse.json({ error: "uid required" }, { status: 400 });
    }

    const db = getAdminFirestore();
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userData = userDoc.data()!;

    // Get existing claims so we don't overwrite isAdmin, isSemiAdmin, etc.
    const userRecord = await auth.getUser(uid);
    const existingClaims = userRecord.customClaims || {};

    await auth.setCustomUserClaims(uid, {
      ...existingClaims,
      shops: userData.memberOfShops ?? {},
      restaurants: userData.memberOfRestaurants ?? {},
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Sync claims error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
