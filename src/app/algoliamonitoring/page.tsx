// app/algolia-monitoring/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";

import {
  Search,
  Activity,
  Clock,
  RefreshCw,
  Globe,
  Server,
  ArrowLeft,
  ChevronDown,
  AlertTriangle,
  ShieldCheck,
  Info,
} from "lucide-react";

import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import type {
  InventoryServersResponse,
  LatencyMetricsResponse,
  IndexingMetricsResponse,
  ReachabilityResponse,
  IncidentsResponse,
  StatusResponse,
  InfrastructureMetricsResponse,
  Period,
  MetricName,
  TSPoint,
} from "../lib/types/algoliaMonitoring";

type TimeRangeKey = "24h" | "7d" | "30d";
type MetricOption =
  | "latency"
  | "indexing"
  | "cpu_usage"
  | "ram_indexing_usage"
  | "ram_search_usage"
  | "ssd_usage";

interface ChartRow {
  time: string;
  [series: string]: number | string;
}

function toLocalTimeLabel(timestamp: number): string {
  const ms = timestamp < 2_000_000_000 ? timestamp * 1000 : timestamp;
  const d = new Date(ms);
  return d.toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function flattenSeries(series: Record<string, TSPoint[]>): ChartRow[] {
  const timeMap = new Map<number, Record<string, number>>();
  Object.entries(series).forEach(([cluster, points]) => {
    points.forEach((p) => {
      const key = p.t < 2_000_000_000 ? p.t * 1000 : p.t;
      if (!timeMap.has(key)) timeMap.set(key, {});
      timeMap.get(key)![cluster] = p.v;
    });
  });

  return Array.from(timeMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([t, vals]) => {
      const row: ChartRow = { time: toLocalTimeLabel(t) };
      Object.entries(vals).forEach(([cluster, v]) => {
        row[cluster] = v;
      });
      return row;
    });
}

export default function AlgoliaMonitoringPage() {
  const router = useRouter();

  const [, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const [timeRange, setTimeRange] = useState<TimeRangeKey>("24h");
  const [metricOpt, setMetricOpt] = useState<MetricOption>("latency");

  const [clusters, setClusters] = useState<string[]>([]);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [incidents, setIncidents] = useState<IncidentsResponse | null>(null);

  const [latency, setLatency] = useState<LatencyMetricsResponse | null>(null);
  const [indexing, setIndexing] = useState<IndexingMetricsResponse | null>(
    null
  );

  const [infraMetrics, setInfraMetrics] =
    useState<InfrastructureMetricsResponse | null>(null);
  const [reachability, setReachability] = useState<ReachabilityResponse | null>(
    null
  );

  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [fallbackMode, setFallbackMode] = useState<"none" | "public" | "env">(
    "none"
  );
  const [topError, setTopError] = useState<string | null>(null);

  const preferredPeriod: Period = useMemo<Period>(() => {
    switch (timeRange) {
      case "24h":
        return "day";
      case "7d":
        return "week";
      case "30d":
        return "month";
    }
  }, [timeRange]);

  const loadServersAndClusters = async (): Promise<string[]> => {
    setTopError(null);
    const res = await fetch("/api/algolia-monitoring/servers", {
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      setTopError(text);
      throw new Error(text);
    }
    const data = (await res.json()) as InventoryServersResponse;
    const fb = res.headers.get("x-algolia-fallback");
    setFallbackMode(fb === "public" ? "public" : fb === "env" ? "env" : "none");

    const unique = Array.from(
      new Set(data.inventory.map((i) => i.cluster))
    ).sort();
    setClusters(unique);
    return unique;
  };

  const loadStatus = async (): Promise<void> => {
    const res = await fetch("/api/algolia-monitoring/status", {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(await res.text());
    setStatus((await res.json()) as StatusResponse);
  };

  const loadIncidents = async (): Promise<void> => {
    const res = await fetch("/api/algolia-monitoring/incidents", {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(await res.text());
    setIncidents((await res.json()) as IncidentsResponse);
  };

  const loadLatency = async (cls: string[]): Promise<void> => {
    if (cls.length === 0) return;
    const res = await fetch(
      `/api/algolia-monitoring/latency?clusters=${encodeURIComponent(
        cls.join(",")
      )}`,
      {
        cache: "no-store",
      }
    );
    if (!res.ok) throw new Error(await res.text());
    setLatency((await res.json()) as LatencyMetricsResponse);
  };

  const loadIndexing = async (cls: string[]): Promise<void> => {
    if (cls.length === 0) return;
    const res = await fetch(
      `/api/algolia-monitoring/indexing?clusters=${encodeURIComponent(
        cls.join(",")
      )}`,
      {
        cache: "no-store",
      }
    );
    if (!res.ok) throw new Error(await res.text());
    setIndexing((await res.json()) as IndexingMetricsResponse);
  };

  const loadInfraMetrics = async (): Promise<void> => {
    const metricMap: Record<MetricOption, MetricName | null> = {
      latency: null,
      indexing: null,
      cpu_usage: "cpu_usage",
      ram_indexing_usage: "ram_indexing_usage",
      ram_search_usage: "ram_search_usage",
      ssd_usage: "ssd_usage",
    };

    const m = metricMap[metricOpt];
    if (!m) {
      setInfraMetrics(null);
      return;
    }

    const url = `/api/algolia-monitoring/metrics?metric=${encodeURIComponent(
      m
    )}&period=${preferredPeriod}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(await res.text());
    setInfraMetrics((await res.json()) as InfrastructureMetricsResponse);
  };

  const loadReachability = async (cls: string[]): Promise<void> => {
    if (cls.length === 0) return;
    const res = await fetch(
      `/api/algolia-monitoring/reachability?clusters=${encodeURIComponent(
        cls.join(",")
      )}`,
      {
        cache: "no-store",
      }
    );
    if (!res.ok) throw new Error(await res.text());
    setReachability((await res.json()) as ReachabilityResponse);
  };

  const refreshAll = async (): Promise<void> => {
    setRefreshing(true);
    try {
      const cls = clusters.length ? clusters : await loadServersAndClusters();
      await Promise.all([
        loadStatus(),
        loadIncidents(),
        loadLatency(cls),
        loadIndexing(cls),
        loadInfraMetrics(),
        loadReachability(cls),
      ]);
      setLastRefresh(new Date());
    } catch (e) {
      if (e instanceof Error) setTopError(e.message);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshAll();
    const id = setInterval(() => void refreshAll(), 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadInfraMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredPeriod, metricOpt]);

  const latencyChart = useMemo<ChartRow[]>(() => {
    if (!latency) return [];
    return flattenSeries(latency.metrics.latency);
  }, [latency]);

  const indexingChart = useMemo<ChartRow[]>(() => {
    if (!indexing) return [];
    return flattenSeries(indexing.metrics.indexing);
  }, [indexing]);

  const infraChart = useMemo<ChartRow[]>(() => {
    if (!infraMetrics) return [];
    const [metricName] = Object.keys(infraMetrics.metrics);
    const series = infraMetrics.metrics[metricName] ?? {};
    return flattenSeries(series);
  }, [infraMetrics]);

  const openIncidentsCount = useMemo<number>(() => {
    if (!incidents) return 0;
    let count = 0;
    Object.values(incidents.incidents).forEach((arr) => {
      if (arr.length > 0) {
        const latest = arr[0];
        if (latest.v.status !== "operational") count += 1;
      }
    });
    return count;
  }, [incidents]);

  const reachabilityPct = useMemo<number>(() => {
    if (!reachability) return 0;
    let total = 0;
    let ok = 0;
    Object.values(reachability).forEach((probes) => {
      Object.values(probes).forEach((pass) => {
        total += 1;
        if (pass) ok += 1;
      });
    });
    return total > 0 ? Math.round((ok / total) * 100) : 0;
  }, [reachability]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push("/dashboard")}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-gray-600" />
                </button>
                <div className="flex items-center gap-2">
                  <Search className="w-6 h-6 text-blue-600" />
                  <h1 className="text-xl font-bold text-gray-900">
                    Algolia Monitoring
                  </h1>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <select
                    value={timeRange}
                    onChange={(e) =>
                      setTimeRange(e.target.value as TimeRangeKey)
                    }
                    className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="24h">Son 24 Saat</option>
                    <option value="7d">Son 7 Gün</option>
                    <option value="30d">Son 30 Gün</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                </div>

                <div className="relative">
                  <select
                    value={metricOpt}
                    onChange={(e) =>
                      setMetricOpt(e.target.value as MetricOption)
                    }
                    className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="latency">Latency (ms)</option>
                    <option value="indexing">Indexing Time (ms)</option>
                    <option value="cpu_usage">CPU Usage (%)</option>
                    <option value="ram_indexing_usage">
                      RAM Indexing Usage (MB)
                    </option>
                    <option value="ram_search_usage">
                      RAM Search Usage (MB)
                    </option>
                    <option value="ssd_usage">SSD Usage (GB)</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                </div>

                <button
                  onClick={() => void refreshAll()}
                  disabled={refreshing}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
                  />
                  <span className="text-sm">Yenile</span>
                </button>

                <div className="flex items-center gap-2 text-gray-500 text-sm">
                  <Clock className="w-4 h-4" />
                  <span>{lastRefresh.toLocaleTimeString("tr-TR")}</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Fallback uyarıları / üst hata bandı */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
          {topError && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4" />
              <div>
                <strong>Hata:</strong> {topError}
              </div>
            </div>
          )}

          {fallbackMode !== "none" && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <Info className="mt-0.5 h-4 w-4" />
              <div>
                {fallbackMode === "env" ? (
                  <>
                    <strong>ENV Küme Modu:</strong> Kümeler{" "}
                    <code>ALGOLIA_CLUSTERS</code>’tan alındı. Premium/Elevate
                    gerekmeden çalışır; ancak doğru kümeleri girdiğinizden emin
                    olun.
                  </>
                ) : (
                  <>
                    <strong>Genel Envanter Fallback:</strong> Kimliksiz genel
                    küme listesinden ilk 5 küme kullanılıyor. Uygulamanıza
                    atanmış kümeler olmayabilir. Doğru veriler için
                    Premium/Elevate ve Monitoring key + App ID eşleşmesi
                    gerekir; ya da <code>ALGOLIA_CLUSTERS</code> tanımlayın.
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Main */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Top stats */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
            {/* Clusters */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">
                  Kümeler
                </span>
                <Server className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {clusters.length}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {clusters.join(", ") || "—"}
              </p>
            </div>

            {/* Reachability */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">
                  Erişilebilirlik
                </span>
                <ShieldCheck className="w-4 h-4 text-green-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {reachabilityPct}%
              </p>
              <div className="mt-2 bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full"
                  style={{ width: `${reachabilityPct}%` }}
                />
              </div>
            </div>

            {/* Open Incidents */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">
                  Açık Olay (Incident)
                </span>
                <AlertTriangle className="w-4 h-4 text-red-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {openIncidentsCount}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Operasyonel olmayan kümeler
              </p>
            </div>

            {/* Status */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">
                  Operasyonel
                </span>
                <Activity className="w-4 h-4 text-purple-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {status
                  ? Object.values(status.status).filter(
                      (s) => s === "operational"
                    ).length
                  : 0}
              </p>
              <p className="text-xs text-gray-500 mt-1">Toplam küme durumu</p>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* Latency */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">
                  Arama Gecikmesi (ms)
                </h3>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={latencyChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis
                      dataKey="time"
                      stroke="#6B7280"
                      tick={{ fontSize: 11 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis stroke="#6B7280" tick={{ fontSize: 11 }} />
                    <Tooltip />
                    {clusters.map((c) => (
                      <Line
                        key={c}
                        type="monotone"
                        dataKey={c}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Indexing */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">
                  İndeksleme Süresi (ms)
                </h3>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={indexingChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis
                      dataKey="time"
                      stroke="#6B7280"
                      tick={{ fontSize: 11 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis stroke="#6B7280" tick={{ fontSize: 11 }} />
                    <Tooltip />
                    {clusters.map((c) => (
                      <Area
                        key={c}
                        type="monotone"
                        dataKey={c}
                        stackId="1"
                        fillOpacity={0.6}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Infra metrics */}
          {[
            "cpu_usage",
            "ram_indexing_usage",
            "ram_search_usage",
            "ssd_usage",
          ].includes(metricOpt) && (
            <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">
                  {metricOpt === "cpu_usage" && "CPU Kullanımı (%)"}
                  {metricOpt === "ram_indexing_usage" &&
                    "RAM (Indexing) Kullanımı (MB)"}
                  {metricOpt === "ram_search_usage" &&
                    "RAM (Search) Kullanımı (MB)"}
                  {metricOpt === "ssd_usage" && "SSD Kullanımı (GB)"}
                </h3>
                <div className="text-xs text-gray-500">Dönem: {timeRange}</div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={infraChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis
                      dataKey="time"
                      stroke="#6B7280"
                      tick={{ fontSize: 11 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis stroke="#6B7280" tick={{ fontSize: 11 }} />
                    <Tooltip />
                    {Object.keys(
                      (infraMetrics?.metrics ?? {})[
                        Object.keys(infraMetrics?.metrics ?? {})[0] ?? ""
                      ] ?? {}
                    ).map((key) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Footnote */}
          <div className="text-xs text-gray-500 flex items-center gap-2">
            <Globe className="w-4 h-4" />
            <span>Veriler Algolia Monitoring API’den canlı çekilmektedir.</span>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
