// app/api/algolia-monitoring/reachability/route.ts
import { NextRequest, NextResponse } from "next/server";
import { monitorFetch, jsonError } from "../_utils";
import type { ReachabilityResponse } from "../../../lib/types/algoliaMonitoring";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clusters = searchParams.get("clusters");
    if (!clusters) {
      return jsonError("Missing 'clusters' query param", 400);
    }
    const data = await monitorFetch<ReachabilityResponse>(
      `/1/reachability/${encodeURIComponent(clusters)}/probes`,
      false
    );
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonError(msg, 500);
  }
}
