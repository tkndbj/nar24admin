"use client";

import { useState, useEffect } from "react";
import {
  Zap,
  TrendingUp,
  AlertTriangle,
  Activity,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  DollarSign,
  CheckCircle,
  XCircle,
  BarChart3,
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
    {
      key: "10min",
      label: "10dk",
      color: "border-blue-500 bg-blue-50 text-blue-700",
    },
    {
      key: "30min",
      label: "30dk",
      color: "border-green-500 bg-green-50 text-green-700",
    },
    {
      key: "1hr",
      label: "1sa",
      color: "border-purple-500 bg-purple-50 text-purple-700",
    },
    {
      key: "4hr",
      label: "4sa",
      color: "border-orange-500 bg-orange-50 text-orange-700",
    },
    {
      key: "8hr",
      label: "8sa",
      color: "border-red-500 bg-red-50 text-red-700",
    },
  ];

  useEffect(() => {
    fetchFunctionsData();
    const interval = setInterval(fetchFunctionsData, 60000);
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
    const INVOCATION_COST = 0.0000004;
    const GB_SECOND_COST = 0.0000025;
    const MEMORY_GB = 0.125;

    let totalCost = 0;

    functions.forEach((func) => {
      const invocationCost = func.executions * INVOCATION_COST;
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

  const getStatusBadge = (errorRate: number) => {
    if (errorRate === 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
          <CheckCircle className="w-3 h-3" />
          Sağlıklı
        </span>
      );
    }
    if (errorRate < 5) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
          <AlertTriangle className="w-3 h-3" />
          Uyarı
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
        <XCircle className="w-3 h-3" />
        Kritik
      </span>
    );
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
    if (sortBy !== column)
      return <ArrowUpDown className="w-3 h-3 text-gray-400" />;
    return sortOrder === "asc" ? (
      <ArrowUp className="w-3 h-3 text-blue-600" />
    ) : (
      <ArrowDown className="w-3 h-3 text-blue-600" />
    );
  };

  // Custom ArrowUpDown component since it's not in lucide-react
  const ArrowUpDown = ({ className }: { className: string }) => (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
      />
    </svg>
  );

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
  const totalCost = calculateCost(sortedFunctions);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => window.history.back()}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>

              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Zap className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">
                    Cloud Functions
                  </h1>
                  <p className="text-sm text-gray-500">
                    Performans ve çağrı istatistikleri
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={fetchFunctionsData}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
              Yenile
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Overview Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <BarChart3 className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Fonksiyonlar</p>
                <p className="text-lg font-semibold text-gray-900">
                  {sortedFunctions.length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Activity className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Toplam Çağrı</p>
                <p className="text-lg font-semibold text-gray-900">
                  {totalExecutions.toLocaleString("tr-TR")}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Hatalar</p>
                <p className="text-lg font-semibold text-gray-900">
                  {totalErrors.toLocaleString("tr-TR")}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <TrendingUp className="w-4 h-4 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Hata Oranı</p>
                <p className="text-lg font-semibold text-gray-900">
                  {avgErrorRate.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <DollarSign className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Maliyet</p>
                <p className="text-lg font-semibold text-gray-900">
                  ${totalCost.toFixed(6)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Time Period Selector */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900">Zaman Aralığı</h3>
            <div className="flex gap-2">
              {timePeriods.map((period) => (
                <button
                  key={period.key}
                  onClick={() => setSelectedPeriod(period.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all ${
                    selectedPeriod === period.key
                      ? period.color
                      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {period.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Functions Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              Fonksiyon Detayları
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort("name")}
                  >
                    <div className="flex items-center gap-1">
                      Fonksiyon
                      {getSortIcon("name")}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort("executions")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Çağrılar
                      {getSortIcon("executions")}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort("errors")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Hatalar
                      {getSortIcon("errors")}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hata Oranı
                  </th>
                  <th
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort("duration")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Ortalama Süre
                      {getSortIcon("duration")}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Durum
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-8 text-center text-gray-500"
                    >
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                      Yükleniyor...
                    </td>
                  </tr>
                ) : sortedFunctions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-8 text-center text-gray-500"
                    >
                      Bu zaman diliminde veri bulunamadı
                    </td>
                  </tr>
                ) : (
                  sortedFunctions.map((func, index) => {
                    const errorRate = getErrorRate(func);
                    return (
                      <tr
                        key={func.name}
                        className={`hover:bg-gray-50 ${
                          index % 2 === 0 ? "" : "bg-gray-50/50"
                        }`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></div>
                            <span className="text-sm font-medium text-gray-900 truncate">
                              {func.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-sm font-mono text-gray-900">
                            {func.executions.toLocaleString("tr-TR")}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span
                            className={`text-sm font-mono ${
                              func.errors > 0 ? "text-red-600" : "text-gray-500"
                            }`}
                          >
                            {func.errors.toLocaleString("tr-TR")}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span
                            className={`text-sm font-mono ${
                              errorRate === 0
                                ? "text-green-600"
                                : errorRate < 5
                                ? "text-yellow-600"
                                : "text-red-600"
                            }`}
                          >
                            {errorRate.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-sm font-mono text-gray-600">
                            {formatDuration(func.avgDuration)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {getStatusBadge(errorRate)}
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
