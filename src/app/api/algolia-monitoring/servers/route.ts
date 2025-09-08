// app/api/algolia-monitoring/servers/route.ts
import { NextResponse } from "next/server";
import { monitorFetch, jsonError } from "../_utils";
import type { InventoryServersResponse } from "../../../lib/types/algoliaMonitoring";

// Env üzerinden manuel cluster listesi üretici
function synthesizeFromEnv(envClusters: string): InventoryServersResponse {
  const clusters = envClusters
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    inventory: clusters.map((cluster) => ({
      name: `${cluster}-virtual`,
      region: cluster.split("-")[1] ?? "unknown",
      is_slave: false,
      is_replica: false,
      cluster,
      status: "PRODUCTION",
      type: "cluster",
    })),
  };
}

export async function GET() {
  try {
    // 1) Önce manuel ENV override var mı?
    const envClusters = process.env.ALGOLIA_CLUSTERS;
    if (envClusters && envClusters.trim().length > 0) {
      const data = synthesizeFromEnv(envClusters);
      return NextResponse.json(data, {
        headers: { "x-algolia-fallback": "env" },
      });
    }

    // 2) Auth'lu dene (uygulamanıza atanmış sunucuları döner)
    try {
      const data = await monitorFetch<InventoryServersResponse>(
        "/1/inventory/servers",
        true
      );
      return NextResponse.json(data, {
        headers: { "x-algolia-fallback": "none" },
      });
    } catch (e) {
      const err = e as Error & { status?: number };
      // 401/403 ise Premium/Elevate yok veya key/appId eşleşmiyor.
      if (err.status === 401 || err.status === 403) {
        // 3) Auth'suz genel listeyi al (uyarı ile)
        const res = await fetch(
          "https://status.algolia.com/1/inventory/servers",
          {
            cache: "no-store",
          }
        );
        if (!res.ok) {
          return jsonError(
            `Inventory fallback failed: HTTP ${res.status}`,
            res.status
          );
        }
        const data = (await res.json()) as InventoryServersResponse;

        // Çok kalabalık olabilir: ilk 5 kümeyi tutalım.
        const seen = new Set<string>();
        const filtered = data.inventory.filter((i) => {
          if (seen.has(i.cluster)) return false;
          seen.add(i.cluster);
          return true;
        });
        const top5 = filtered.slice(0, 5);

        return NextResponse.json(
          { inventory: top5 },
          { headers: { "x-algolia-fallback": "public" } }
        );
      }
      // Diğer hatalar
      return jsonError(err.message ?? "Unknown error", 500);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonError(msg, 500);
  }
}
