"use client";

import { useState, useEffect } from "react";
import {
  Brain,
  TrendingUp,
  Package,
  Eye,
  ShoppingCart,
  RefreshCw,
  ArrowLeft,
  DollarSign,
  Activity,
  Calendar,
  Clock,
  ArrowUp,
  ArrowDown,
  Minus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface FunctionMetric {
  name: string;
  displayName: string;
  executions: number;
  errors: number;
  avgDuration: number;
  cost: number;
  color: string;
  icon: React.ReactNode;
}

interface TimeSeriesData {
  time: string;
  getRecommendations: number;
  ingestTransaction: number;
  ingestDetailView: number;
  ingestShopDetailView: number;
}

interface PipelineData {
  hourly: TimeSeriesData[];
  daily: TimeSeriesData[];
  functions: FunctionMetric[];
  totalCost: {
    hourly: number;
    daily: number;
    monthly: number;
  };
}

// Google Cloud Pricing as of July 2025
const PRICING = {
    // Cloud Functions pricing (Gen 2)
    invocations: 0.0000004, // $0.40 per million (after 2M free)
    gbSeconds: 0.0000025, // $0.0025 per GB-second (after 400K GB-s free)
    memoryGB: 0.25, // 256MB allocation
    
    // Retail API pricing - CORRECTED
    predict: {
      tier1: 0, // First 1,000 requests/month FREE
      tier2: 0.27, // $0.27 per 1,000 requests (1K - 5M)
      tier3: 0.20, // $0.20 per 1,000 requests (5M - 10M)
      tier4: 0.15, // $0.15 per 1,000 requests (10M+)
    },
    userEvent: {
      import: 0, // First 50M events/month FREE
      afterFree: 0.02, // $0.02 per 1,000 events after 50M
    }
  };

  

export default function RecommendationsPipelineUsage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState("daily");
  const [pipelineData, setPipelineData] = useState<PipelineData>({
    hourly: [],
    daily: [],
    functions: [],
    totalCost: {
      hourly: 0,
      daily: 0,
      monthly: 0,
    },
  });

  useEffect(() => {
    fetchPipelineData();
    const interval = setInterval(fetchPipelineData, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const fetchPipelineData = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/metrics");
      if (response.ok) {
        const data = await response.json();
        console.log("API Response:", data); // Debug log
        console.log("Recommendation Pipeline Data:", data.recommendationPipeline); // Debug log
        processPipelineData(data);
      }
    } catch (error) {
      console.error("Error fetching pipeline data:", error);
    } finally {
      setLoading(false);
    }
  };

  const generateMockData = () => {
    // Generate realistic mock data
    const now = new Date();
    const hourlyData: TimeSeriesData[] = [];
    const dailyData: TimeSeriesData[] = [];

    // Hourly data for last 24 hours
    for (let i = 23; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 3600000);
      hourlyData.push({
        time: time.toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        getRecommendations: Math.floor(50 + Math.random() * 100),
        ingestTransaction: Math.floor(10 + Math.random() * 30),
        ingestDetailView: Math.floor(100 + Math.random() * 200),
        ingestShopDetailView: Math.floor(150 + Math.random() * 250),
      });
    }

    // Daily data for last 30 days
    for (let i = 29; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 86400000);
      dailyData.push({
        time: time.toLocaleDateString("tr-TR", {
          day: "2-digit",
          month: "2-digit",
        }),
        getRecommendations: Math.floor(1000 + Math.random() * 2000),
        ingestTransaction: Math.floor(200 + Math.random() * 500),
        ingestDetailView: Math.floor(2000 + Math.random() * 4000),
        ingestShopDetailView: Math.floor(3000 + Math.random() * 5000),
      });
    }

    return {
      functions: {
        "10min": [],
        "30min": [],
        "1hr": [],
        "4hr": [],
        "8hr": [],
      },
      hourly: hourlyData,
      daily: dailyData,
    };
  };

  const processPipelineData = (data: any) => {
    // Check if we have recommendation pipeline data
    if (!data.recommendationPipeline) {
      console.error("No recommendationPipeline data in response");
      return;
    }
  
    const recommendationHourly = data.recommendationPipeline.hourly || [];
    const recommendationDaily = data.recommendationPipeline.daily || [];
  
    // Transform the data into time series format
    const hourlyTimeSeriesMap = new Map<string, any>();
    const dailyTimeSeriesMap = new Map<string, any>();
  
    // Process hourly data
    recommendationHourly.forEach((func: any) => {
      func.dataPoints.forEach((point: any) => {
        const time = new Date(point.timestamp * 1000).toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
        });
        
        if (!hourlyTimeSeriesMap.has(time)) {
          hourlyTimeSeriesMap.set(time, {
            time,
            getRecommendations: 0,
            ingestTransaction: 0,
            ingestDetailView: 0,
            ingestShopDetailView: 0,
          });
        }
        
        const timeData = hourlyTimeSeriesMap.get(time);
        
        // Map function names to the expected keys
        const keyMap: { [key: string]: string } = {
          getRecommendations: "getRecommendations",
          ingestTransactionEvent: "ingestTransaction",
          ingestDetailViewEvent: "ingestDetailView",
          ingestShopProductDetailViewEvent: "ingestShopDetailView",
        };
        
        const key = keyMap[func.functionName];
        if (key) {
          timeData[key] = point.value;
        }
      });
    });
  
    // Process daily data similarly
    recommendationDaily.forEach((func: any) => {
      func.dataPoints.forEach((point: any) => {
        const time = new Date(point.timestamp * 1000).toLocaleDateString("tr-TR", {
          day: "2-digit",
          month: "2-digit",
        });
        
        if (!dailyTimeSeriesMap.has(time)) {
          dailyTimeSeriesMap.set(time, {
            time,
            getRecommendations: 0,
            ingestTransaction: 0,
            ingestDetailView: 0,
            ingestShopDetailView: 0,
          });
        }
        
        const timeData = dailyTimeSeriesMap.get(time);
        
        const keyMap: { [key: string]: string } = {
          getRecommendations: "getRecommendations",
          ingestTransactionEvent: "ingestTransaction",
          ingestDetailViewEvent: "ingestDetailView",
          ingestShopProductDetailViewEvent: "ingestShopDetailView",
        };
        
        const key = keyMap[func.functionName];
        if (key) {
          timeData[key] = point.value;
        }
      });
    });
  
    // Convert maps to arrays
    const hourlyData = Array.from(hourlyTimeSeriesMap.values()).sort((a, b) => 
      a.time.localeCompare(b.time)
    );
    const dailyData = Array.from(dailyTimeSeriesMap.values()).sort((a, b) => 
      a.time.localeCompare(b.time)
    );
  
    // Calculate function metrics from the recommendation pipeline data
    const functions: FunctionMetric[] = recommendationHourly.map((func: any) => {
        const displayNames: { [key: string]: string } = {
          getRecommendations: "Öneri Getir",
          ingestTransactionEvent: "İşlem Kaydı",
          ingestDetailViewEvent: "Ürün Görüntüleme",
          ingestShopProductDetailViewEvent: "Mağaza Ürün Görüntüleme",
        };
      
        const colors: { [key: string]: string } = {
          getRecommendations: "#3B82F6",
          ingestTransactionEvent: "#10B981",
          ingestDetailViewEvent: "#F59E0B",
          ingestShopProductDetailViewEvent: "#8B5CF6",
        };
      
        const icons: { [key: string]: React.ReactNode } = {
          getRecommendations: <Brain className="w-5 h-5" />,
          ingestTransactionEvent: <ShoppingCart className="w-5 h-5" />,
          ingestDetailViewEvent: <Eye className="w-5 h-5" />,
          ingestShopProductDetailViewEvent: <Package className="w-5 h-5" />,
        };
      
        const avgDurations: { [key: string]: number } = {
          getRecommendations: 250,
          ingestTransactionEvent: 150,
          ingestDetailViewEvent: 100,
          ingestShopProductDetailViewEvent: 100,
        };
      
        // Calculate monthly projections based on hourly data
        // Assuming this is last hour's data, project to monthly
        const monthlyProjection = func.executions * 24 * 30;
      
        let cost = 0;
        
        if (func.functionName === "getRecommendations") {
          // Retail API predict cost with free tier
          if (monthlyProjection <= 1000) {
            cost = 0; // First 1,000 requests free
          } else if (monthlyProjection <= 5000000) {
            // Tier 2: $0.27 per 1,000 (after first 1,000)
            const billableRequests = monthlyProjection - 1000;
            cost = (billableRequests / 1000) * 0.27;
          } else if (monthlyProjection <= 10000000) {
            // Tier 2 + Tier 3
            const tier2Requests = 5000000 - 1000;
            const tier3Requests = monthlyProjection - 5000000;
            cost = (tier2Requests / 1000) * 0.27 + (tier3Requests / 1000) * 0.20;
          } else {
            // Tier 2 + Tier 3 + Tier 4
            const tier2Requests = 5000000 - 1000;
            const tier3Requests = 5000000;
            const tier4Requests = monthlyProjection - 10000000;
            cost = (tier2Requests / 1000) * 0.27 + 
                   (tier3Requests / 1000) * 0.20 + 
                   (tier4Requests / 1000) * 0.15;
          }
          
          // Convert monthly cost back to hourly for display
          cost = cost / (24 * 30);
          
        } else {
          // User event ingestion + Cloud Function costs
          
          // User events cost (first 50M free per month)
          let userEventCost = 0;
          if (monthlyProjection > 50000000) {
            const billableEvents = monthlyProjection - 50000000;
            userEventCost = (billableEvents / 1000) * 0.02;
            // Convert to hourly
            userEventCost = userEventCost / (24 * 30);
          }
          
          // Cloud Functions cost (first 2M invocations free per month)
          let invocationCost = 0;
          if (monthlyProjection > 2000000) {
            const billableInvocations = monthlyProjection - 2000000;
            invocationCost = (billableInvocations / 1000000) * 0.40;
            // Convert to hourly
            invocationCost = invocationCost / (24 * 30);
          }
          
          // Compute cost (first 400,000 GB-seconds free per month)
          const avgDuration = avgDurations[func.functionName] || 100;
          const monthlyGbSeconds = (monthlyProjection * avgDuration / 1000) * PRICING.memoryGB;
          let computeCost = 0;
          if (monthlyGbSeconds > 400000) {
            const billableGbSeconds = monthlyGbSeconds - 400000;
            computeCost = billableGbSeconds * PRICING.gbSeconds;
            // Convert to hourly
            computeCost = computeCost / (24 * 30);
          }
          
          cost = userEventCost + invocationCost + computeCost;
        }
      
        return {
          name: func.functionName,
          displayName: displayNames[func.functionName] || func.functionName,
          executions: func.executions,
          errors: 0,
          avgDuration: avgDurations[func.functionName] || 100,
          cost,
          color: colors[func.functionName] || "#6B7280",
          icon: icons[func.functionName] || <Activity className="w-5 h-5" />,
        };
      });
  
    // Calculate total costs
    const hourlyCost = functions.reduce((sum, func) => sum + func.cost, 0);
    const dailyCost = hourlyCost * 24;
    const monthlyCost = dailyCost * 30;
  
    setPipelineData({
      hourly: hourlyData,
      daily: dailyData,
      functions,
      totalCost: {
        hourly: hourlyCost,
        daily: dailyCost,
        monthly: monthlyCost,
      },
    });
  };

  const calculateTotal = (data: TimeSeriesData[], key: keyof TimeSeriesData) => {
    return data.reduce((sum, item) => sum + (Number(item[key]) || 0), 0);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800/95 border border-white/20 rounded-lg p-3 backdrop-blur-xl">
          <p className="text-white font-medium mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {`${entry.name}: ${entry.value.toLocaleString("tr-TR")}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const pieData = pipelineData.functions.map((func) => ({
    name: func.displayName,
    value: func.executions,
    cost: func.cost,
    color: func.color,
  }));

  const timeSeriesData = selectedPeriod === "hourly" 
    ? pipelineData.hourly 
    : pipelineData.daily;

  const totalExecutions = pipelineData.functions.reduce(
    (sum, func) => sum + func.executions,
    0
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="flex items-center justify-center w-10 h-10 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">
                Öneri Sistemi İzleme
              </h1>
              <p className="text-gray-400 text-sm">
                Google Retail AI pipeline kullanım ve maliyet analizi
              </p>
            </div>
          </div>

          <button
            onClick={fetchPipelineData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-lg text-blue-400 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Yenile
          </button>
        </div>

        {/* Cost Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <Clock className="w-5 h-5 text-blue-400" />
              <span className="text-xs text-gray-400">Saatlik</span>
            </div>
            <p className="text-2xl font-bold text-white">
              ${pipelineData.totalCost.hourly.toFixed(4)}
            </p>
            <p className="text-xs text-gray-400 mt-1">Maliyet / saat</p>
          </div>

          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <Calendar className="w-5 h-5 text-green-400" />
              <span className="text-xs text-gray-400">Günlük</span>
            </div>
            <p className="text-2xl font-bold text-white">
              ${pipelineData.totalCost.daily.toFixed(2)}
            </p>
            <p className="text-xs text-gray-400 mt-1">Maliyet / gün</p>
          </div>

          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <DollarSign className="w-5 h-5 text-yellow-400" />
              <span className="text-xs text-gray-400">Aylık</span>
            </div>
            <p className="text-2xl font-bold text-white">
              ${pipelineData.totalCost.monthly.toFixed(2)}
            </p>
            <p className="text-xs text-gray-400 mt-1">Tahmini aylık</p>
          </div>

          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <Activity className="w-5 h-5 text-purple-400" />
              <span className="text-xs text-gray-400">Toplam</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {totalExecutions.toLocaleString("tr-TR")}
            </p>
            <p className="text-xs text-gray-400 mt-1">API çağrısı</p>
          </div>
        </div>

        {/* Time Period Selector */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setSelectedPeriod("hourly")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              selectedPeriod === "hourly"
                ? "bg-blue-600 text-white shadow-lg"
                : "bg-white/10 text-gray-300 hover:bg-white/20"
            }`}
          >
            Saatlik (24 saat)
          </button>
          <button
            onClick={() => setSelectedPeriod("daily")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              selectedPeriod === "daily"
                ? "bg-blue-600 text-white shadow-lg"
                : "bg-white/10 text-gray-300 hover:bg-white/20"
            }`}
          >
            Günlük (30 gün)
          </button>
        </div>

        {/* Main Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Time Series Chart */}
          <div className="lg:col-span-2 backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              Fonksiyon Kullanımı - {selectedPeriod === "hourly" ? "24 Saat" : "30 Gün"}
            </h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeSeriesData}>
                  <XAxis
                    dataKey="time"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: "#9CA3AF" }}
                    interval={selectedPeriod === "hourly" ? 2 : 4}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: "#9CA3AF" }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="getRecommendations"
                    stackId="1"
                    stroke="#3B82F6"
                    fill="#3B82F6"
                    fillOpacity={0.6}
                    name="Öneri Getir"
                  />
                  <Area
                    type="monotone"
                    dataKey="ingestTransaction"
                    stackId="1"
                    stroke="#10B981"
                    fill="#10B981"
                    fillOpacity={0.6}
                    name="İşlem Kaydı"
                  />
                  <Area
                    type="monotone"
                    dataKey="ingestDetailView"
                    stackId="1"
                    stroke="#F59E0B"
                    fill="#F59E0B"
                    fillOpacity={0.6}
                    name="Ürün Görüntüleme"
                  />
                  <Area
                    type="monotone"
                    dataKey="ingestShopDetailView"
                    stackId="1"
                    stroke="#8B5CF6"
                    fill="#8B5CF6"
                    fillOpacity={0.6}
                    name="Mağaza Ürün"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Pie Chart */}
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              Kullanım Dağılımı
            </h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) =>
                      value.toLocaleString("tr-TR")
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-2 mt-4">
                {pieData.map((entry, index) => (
                  <div key={index} className="flex items-center gap-2 text-xs">
                    <div
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-gray-300 truncate">{entry.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Function Details Table */}
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-white/20">
            <h3 className="text-lg font-semibold text-white">
              Fonksiyon Detayları
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/20">
                  <th className="text-left p-4 text-gray-300">Fonksiyon</th>
                  <th className="text-right p-4 text-gray-300">Çağrı Sayısı</th>
                  <th className="text-right p-4 text-gray-300">Ort. Süre</th>
                  <th className="text-right p-4 text-gray-300">Maliyet (USD)</th>
                  <th className="text-right p-4 text-gray-300">Maliyet Detayı</th>
                </tr>
              </thead>
              <tbody>
                {pipelineData.functions.map((func) => (
                  <tr
                    key={func.name}
                    className="border-b border-white/10 hover:bg-white/5 transition-colors"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex items-center justify-center w-8 h-8 rounded-lg"
                          style={{ backgroundColor: `${func.color}20` }}
                        >
                          {func.icon}
                        </div>
                        <div>
                          <p className="text-white font-medium">
                            {func.displayName}
                          </p>
                          <p className="text-xs text-gray-400">{func.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-right text-white font-mono">
                      {func.executions.toLocaleString("tr-TR")}
                    </td>
                    <td className="p-4 text-right text-gray-300 font-mono text-sm">
                      {func.avgDuration}ms
                    </td>
                    <td className="p-4 text-right text-green-400 font-mono">
                      ${func.cost.toFixed(6)}
                    </td>
                    <td className="p-4 text-right">
                      <span className="text-xs text-gray-400">
                        {func.name === "getRecommendations"
                          ? "Retail API Predict"
                          : "User Events + Functions"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cost Breakdown */}
          <div className="p-4 border-t border-white/20 bg-white/5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-gray-400 mb-1">Retail API Predict Ücreti:</p>
                <p className="text-white font-mono">
                  $2.50 / 1000 tahmin isteği
                </p>
              </div>
              <div>
                <p className="text-gray-400 mb-1">User Event Ücreti:</p>
                <p className="text-white font-mono">
                  $0.02 / 1000 olay kaydı
                </p>
              </div>
              <div>
                <p className="text-gray-400 mb-1">Cloud Functions Ücreti:</p>
                <p className="text-white font-mono">
                  $0.40/M çağrı + $0.0025/GB-s
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}