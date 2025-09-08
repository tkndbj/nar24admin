import { NextResponse } from "next/server";
import { monitorFetch, jsonError } from "../_utils";
import type { StatusResponse } from "../../../lib/types/algoliaMonitoring";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // public endpoint, auth gerekmez
    const data = await monitorFetch<StatusResponse>("/1/status", false);
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonError(msg, 500);
  }
}
