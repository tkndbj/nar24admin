// app/api/algolia-monitoring/_utils.ts
import { NextResponse } from "next/server";

const BASE_URL = "https://status.algolia.com";

export function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing env var: ${name}`);
  }
  return v;
}

export function monitoringHeaders(): HeadersInit {
  return {
    "x-algolia-application-id": requiredEnv("ALGOLIA_APPLICATION_ID"),
    "x-algolia-api-key": requiredEnv("ALGOLIA_MONITORING_API_KEY"),
  };
}

export async function monitorFetch<T>(
  path: string,
  withAuth: boolean = true
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: withAuth ? monitoringHeaders() : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body?.message) message = body.message;
    } catch {
      // ignore JSON parse
    }
    // Status kodunu da iletelim ki caller fallback yapabilsin
    const error = new Error(message) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  return (await res.json()) as T;
}

export function jsonError(message: string, status = 500) {
  return NextResponse.json({ message }, { status });
}
