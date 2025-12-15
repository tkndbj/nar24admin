// app/api/algolia-monitoring/latency/route.ts
import { NextRequest, NextResponse } from "next/server";
import { monitorFetch, jsonError, verifyAdminAuth } from "../_utils";
import type { LatencyMetricsResponse } from "../../../lib/types/algoliaMonitoring";

export async function GET(req: NextRequest) {
  // Verify admin authentication
  const authResult = await verifyAdminAuth(req);
  if (!authResult.success) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  try {
    const { searchParams } = new URL(req.url);
    const clusters = searchParams.get("clusters");
    if (!clusters) {
      return jsonError("Missing 'clusters' query param", 400);
    }
    const data = await monitorFetch<LatencyMetricsResponse>(
      `/1/latency/${encodeURIComponent(clusters)}`,
      false
    );
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonError(msg, 500);
  }
}
