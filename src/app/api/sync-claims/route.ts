import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin";

export async function POST(request: NextRequest) {
  try {
    const { uid } = await request.json();

    if (!uid) {
      return NextResponse.json({ error: "uid required" }, { status: 400 });
    }

    const db = getAdminFirestore();
    const auth = getAdminAuth();

    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userData = userDoc.data()!;
    const memberOfShops = userData.memberOfShops ?? {};
    const memberOfRestaurants = userData.memberOfRestaurants ?? {};

    await auth.setCustomUserClaims(uid, {
      shops: memberOfShops,
      restaurants: memberOfRestaurants,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Sync claims error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
