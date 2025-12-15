import { NextRequest, NextResponse } from "next/server";
import { monitorFetch, jsonError, verifyAdminAuth } from "../_utils";
import type { StatusResponse } from "../../../lib/types/algoliaMonitoring";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Verify admin authentication
  const authResult = await verifyAdminAuth(request);
  if (!authResult.success) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  try {
    const data = await monitorFetch<StatusResponse>("/1/status", false);
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonError(msg, 500);
  }
}
