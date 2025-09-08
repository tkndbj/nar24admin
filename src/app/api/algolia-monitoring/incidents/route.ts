// app/api/algolia-monitoring/incidents/route.ts
import { NextResponse } from "next/server";
import { monitorFetch, jsonError } from "../_utils";
import type { IncidentsResponse } from "../../../lib/types/algoliaMonitoring";

export async function GET() {
  try {
    const data = await monitorFetch<IncidentsResponse>("/1/incidents", false);
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonError(msg, 500);
  }
}
