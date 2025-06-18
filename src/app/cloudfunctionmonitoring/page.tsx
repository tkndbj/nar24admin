"use client";

import { useState, useEffect } from "react";
import {
  Zap,
  TrendingUp,
  AlertTriangle,
  Clock,
  Activity,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Minus,
  ArrowLeft,
} from "lucide-react";

interface FunctionMetrics {
  name: string;
  executions: number;
  errors: number;
  avgDuration: number;
  dataPoints: Array<{
    timestamp: number;
    executions: number;
    errors: number;
    duration: number;
  }>;
}

interface FunctionData {
  "10min": FunctionMetrics[];
  "30min": FunctionMetrics[];
  "1hr": FunctionMetrics[];
  "4hr": FunctionMetrics[];
  "8hr": FunctionMetrics[];
}

export default function FunctionsMonitoring() {
  const [functionsData, setFunctionsData] = useState<FunctionData>({
    "10min": [],
    "30min": [],
    "1hr": [],
    "4hr": [],
    "8hr": [],
  });
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState("1hr");
  const [sortBy, setSortBy] = useState<
    "name" | "executions" | "errors" | "duration"
  >("executions");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const timePeriods = [
    { key: "10min", label: "10 dakika", color: "bg-blue-500" },
    { key: "30min", label: "30 dakika", color: "bg-green-500" },
    { key: "1hr", label: "1 saat", color: "bg-purple-500" },
    { key: "4hr", label: "4 saat", color: "bg-orange-500" },
    { key: "8hr", label: "8 saat", color: "bg-red-500" },
  ];

  useEffect(() => {
    fetchFunctionsData();
    const interval = setInterval(fetchFunctionsData, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const fetchFunctionsData = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/metrics");
      if (response.ok) {
        const data = await response.json();
        setFunctionsData(data.functions || {});
      } else {
        console.error("Failed to fetch functions data");
      }
    } catch (error) {
      console.error("Error fetching functions data:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateCost = (functions: FunctionMetrics[]) => {
    // Firebase Cloud Functions pricing (as of 2025)
    // $0.0000004 per invocation + $0.0000025 per GB-second
    // Assuming average 128MB memory allocation and your avgDuration

    const INVOCATION_COST = 0.0000004; // $0.0000004 per invocation
    const GB_SECOND_COST = 0.0000025; // $0.0000025 per GB-second
    const MEMORY_GB = 0.125; // 128MB = 0.125GB (default)

    let totalCost = 0;

    functions.forEach((func) => {
      // Invocation cost
      const invocationCost = func.executions * INVOCATION_COST;

      // Compute cost (GB-seconds)
      const durationSeconds = func.avgDuration / 1000;
      const gbSeconds = func.executions * MEMORY_GB * durationSeconds;
      const computeCost = gbSeconds * GB_SECOND_COST;

      totalCost += invocationCost + computeCost;
    });

    return totalCost;
  };

  const getSortedFunctions = () => {
    const functions = functionsData[selectedPeriod as keyof FunctionData] || [];

    return [...functions].sort((a, b) => {
      let aValue, bValue;

      switch (sortBy) {
        case "name":
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case "executions":
          aValue = a.executions;
          bValue = b.executions;
          break;
        case "errors":
          aValue = a.errors;
          bValue = b.errors;
          break;
        case "duration":
          aValue = a.avgDuration;
          bValue = b.avgDuration;
          break;
        default:
          return 0;
      }

      if (sortOrder === "asc") {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      }
    });
  };

  const getErrorRate = (func: FunctionMetrics) => {
    if (func.executions === 0) return 0;
    return (func.errors / func.executions) * 100;
  };

  const getStatusIcon = (errorRate: number) => {
    if (errorRate === 0)
      return <TrendingUp className="w-4 h-4 text-green-400" />;
    if (errorRate < 5) return <Minus className="w-4 h-4 text-yellow-400" />;
    return <AlertTriangle className="w-4 h-4 text-red-400" />;
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("desc");
    }
  };

  const getSortIcon = (column: typeof sortBy) => {
    if (sortBy !== column) return <Minus className="w-3 h-3 opacity-30" />;
    return sortOrder === "asc" ? (
      <ArrowUp className="w-3 h-3 text-blue-400" />
    ) : (
      <ArrowDown className="w-3 h-3 text-blue-400" />
    );
  };

  const sortedFunctions = getSortedFunctions();
  const totalExecutions = sortedFunctions.reduce(
    (sum, func) => sum + func.executions,
    0
  );
  const totalErrors = sortedFunctions.reduce(
    (sum, func) => sum + func.errors,
    0
  );
  const avgErrorRate =
    totalExecutions > 0 ? (totalErrors / totalExecutions) * 100 : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {/* Add back button */}
            <button
              onClick={() => window.history.back()}
              className="flex items-center justify-center w-10 h-10 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-lg">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">
                Cloud Functions Monitoring
              </h1>
              <p className="text-gray-400 text-sm">
                Fonksiyon performansı ve çağrı istatistikleri
              </p>
            </div>
          </div>

          <button
            onClick={fetchFunctionsData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-lg text-blue-400 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Yenile
          </button>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 bg-blue-500/20 rounded-lg">
                <Zap className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Toplam Fonksiyon
                </h3>
                <p className="text-xl font-bold text-blue-400">
                  {sortedFunctions.length}
                </p>
              </div>
            </div>
          </div>

          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 bg-green-500/20 rounded-lg">
                <Activity className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Toplam Çağrı
                </h3>
                <p className="text-xl font-bold text-green-400">
                  {totalExecutions.toLocaleString("tr-TR")}
                </p>
              </div>
            </div>
          </div>

          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 bg-red-500/20 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Toplam Hata
                </h3>
                <p className="text-xl font-bold text-red-400">
                  {totalErrors.toLocaleString("tr-TR")}
                </p>
              </div>
            </div>
          </div>

          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 bg-yellow-500/20 rounded-lg">
                <Clock className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Hata Oranı</h3>
                <p className="text-xl font-bold text-yellow-400">
                  {avgErrorRate.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Time Period Selector with Cost */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex flex-wrap gap-2">
            {timePeriods.map((period) => (
              <button
                key={period.key}
                onClick={() => setSelectedPeriod(period.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedPeriod === period.key
                    ? `${period.color} text-white shadow-lg`
                    : "bg-white/10 text-gray-300 hover:bg-white/20"
                }`}
              >
                {period.label}
              </button>
            ))}
          </div>

          <div className="px-4 py-2 bg-green-500/20 border border-green-500/30 rounded-lg">
            <span className="text-green-400 font-semibold">
              Maliyet: ${calculateCost(sortedFunctions).toFixed(6)}
            </span>
          </div>
        </div>

        {/* Functions Table */}
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-white/20">
            <h3 className="text-lg font-semibold text-white">
              Fonksiyon Detayları -{" "}
              {timePeriods.find((p) => p.key === selectedPeriod)?.label}
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/20">
                  <th
                    className="text-left p-4 text-gray-300 cursor-pointer hover:text-white transition-colors"
                    onClick={() => handleSort("name")}
                  >
                    <div className="flex items-center gap-1">
                      Fonksiyon Adı
                      {getSortIcon("name")}
                    </div>
                  </th>
                  <th
                    className="text-right p-4 text-gray-300 cursor-pointer hover:text-white transition-colors"
                    onClick={() => handleSort("executions")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Çağrı Sayısı
                      {getSortIcon("executions")}
                    </div>
                  </th>
                  <th
                    className="text-right p-4 text-gray-300 cursor-pointer hover:text-white transition-colors"
                    onClick={() => handleSort("errors")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Hata Sayısı
                      {getSortIcon("errors")}
                    </div>
                  </th>
                  <th className="text-right p-4 text-gray-300">Hata Oranı</th>
                  <th
                    className="text-right p-4 text-gray-300 cursor-pointer hover:text-white transition-colors"
                    onClick={() => handleSort("duration")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Ort. Süre
                      {getSortIcon("duration")}
                    </div>
                  </th>
                  <th className="text-center p-4 text-gray-300">Durum</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center p-8 text-gray-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                      Yükleniyor...
                    </td>
                  </tr>
                ) : sortedFunctions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center p-8 text-gray-400">
                      Bu zaman diliminde veri bulunamadı
                    </td>
                  </tr>
                ) : (
                  sortedFunctions.map((func) => {
                    const errorRate = getErrorRate(func);
                    return (
                      <tr
                        key={func.name}
                        className="border-b border-white/10 hover:bg-white/5 transition-colors"
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                            <span className="text-white font-medium">
                              {func.name}
                            </span>
                          </div>
                        </td>
                        <td className="p-4 text-right text-white font-mono">
                          {func.executions.toLocaleString("tr-TR")}
                        </td>
                        <td className="p-4 text-right">
                          <span
                            className={`font-mono ${
                              func.errors > 0 ? "text-red-400" : "text-gray-400"
                            }`}
                          >
                            {func.errors.toLocaleString("tr-TR")}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <span
                            className={`font-mono text-sm ${
                              errorRate === 0
                                ? "text-green-400"
                                : errorRate < 5
                                ? "text-yellow-400"
                                : "text-red-400"
                            }`}
                          >
                            {errorRate.toFixed(1)}%
                          </span>
                        </td>
                        <td className="p-4 text-right text-gray-300 font-mono text-sm">
                          {formatDuration(func.avgDuration)}
                        </td>
                        <td className="p-4 text-center">
                          {getStatusIcon(errorRate)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
