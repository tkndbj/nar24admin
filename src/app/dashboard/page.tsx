"use client";

import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  LogOut,
  User,
  Shield,
  BarChart3,
  Users,
  Store,
  Search,
  Package,
  Edit2,
  Clock,
  FileText,
  Image,
  Layout,
  Database,
  Zap,
  List,
  TrendingUp,
  DollarSign,
  Activity,
  Globe,
  Bell,
  Filter,
  MapPin,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useRouter } from "next/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Area,
  AreaChart,
} from "recharts";

interface UserData {
  id: string;
  displayName: string;
  email: string;
  createdAt: Timestamp;
}

interface ShopData {
  id: string;
  name: string;
  createdAt: Timestamp;
}

interface ProductData {
  id: string;
  productName: string;
  shopId: string;
  createdAt: Timestamp;
}

interface MetricData {
  time: string;
  reads: number;
  writes: number;
  functions: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  label?: string;
}

// Calculate costs based on Google Cloud pricing
const calculateCosts = (data: MetricData[]) => {
  const totalReads = data.reduce((sum, item) => sum + item.reads, 0);
  const totalWrites = data.reduce((sum, item) => sum + item.writes, 0);
  const totalFunctions = data.reduce((sum, item) => sum + item.functions, 0);

  // Google Cloud Firestore pricing (approximate)
  // Reads: $0.06 per 100K operations
  // Writes: $0.18 per 100K operations
  // Functions: $0.40 per million invocations
  const readCost = (totalReads / 100000) * 0.06;
  const writeCost = (totalWrites / 100000) * 0.18;
  const functionCost = (totalFunctions / 1000000) * 0.4;

  return {
    reads: readCost,
    writes: writeCost,
    functions: functionCost,
    total: readCost + writeCost + functionCost,
  };
};

// Generate realistic sample data for the last 60 minutes
const generateMetricData = (): MetricData[] => {
  const data: MetricData[] = [];
  const now = new Date();

  for (let i = 59; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60000);
    const timeStr = time.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    // Generate realistic fluctuating data
    const baseReads = 20 + Math.sin(i / 10) * 10;
    const baseWrites = 5 + Math.sin(i / 15) * 3;
    const baseFunctions = 3 + Math.sin(i / 8) * 2;

    data.push({
      time: timeStr,
      reads: Math.max(0, Math.round(baseReads + (Math.random() - 0.5) * 10)),
      writes: Math.max(0, Math.round(baseWrites + (Math.random() - 0.5) * 4)),
      functions: Math.max(
        0,
        Math.round(baseFunctions + (Math.random() - 0.5) * 3)
      ),
    });
  }

  return data;
};

// Generate realistic sample data for the last 24 hours
const generateDailyMetricData = (): MetricData[] => {
  const data: MetricData[] = [];
  const now = new Date();

  for (let i = 23; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60 * 60000); // 1 hour intervals
    const timeStr = time.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    // Generate higher volume data for daily view
    const baseReads = 200 + Math.sin(i / 6) * 100 + Math.cos(i / 4) * 50;
    const baseWrites = 50 + Math.sin(i / 8) * 25 + Math.cos(i / 6) * 15;
    const baseFunctions = 30 + Math.sin(i / 5) * 15 + Math.cos(i / 7) * 10;

    data.push({
      time: timeStr,
      reads: Math.max(0, Math.round(baseReads + (Math.random() - 0.5) * 100)),
      writes: Math.max(0, Math.round(baseWrites + (Math.random() - 0.5) * 30)),
      functions: Math.max(
        0,
        Math.round(baseFunctions + (Math.random() - 0.5) * 20)
      ),
    });
  }

  return data;
};

export default function Dashboard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserData[]>([]);
  const [shops, setShops] = useState<ShopData[]>([]);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeUsers, setActiveUsers] = useState(0);
  const [metricsData, setMetricsData] = useState<MetricData[]>([]);
  const [dailyMetricsData, setDailyMetricsData] = useState<MetricData[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(true);

  // Fetch metrics data from the API
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setMetricsLoading(true);
        const response = await fetch("/api/metrics");
        if (response.ok) {
          const data = await response.json();
          // Handle the new API response format
          setMetricsData(data.hourly || generateMetricData());
          setDailyMetricsData(data.daily || generateDailyMetricData());
        } else {
          console.error("Failed to fetch metrics");
          // Fallback to sample data if API fails
          setMetricsData(generateMetricData());
          setDailyMetricsData(generateDailyMetricData());
        }
      } catch (error) {
        console.error("Error fetching metrics:", error);
        // Fallback to sample data if API fails
        setMetricsData(generateMetricData());
        setDailyMetricsData(generateDailyMetricData());
      } finally {
        setMetricsLoading(false);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 300000); // Update every 5 minutes

    return () => clearInterval(interval);
  }, []);

  // Real-time listeners for efficient data fetching
  useEffect(() => {
    const unsubscribeUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      const usersData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as UserData[];
      setUsers(usersData);

      // Calculate active users (users created in last 24 hours)
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const activeCount = usersData.filter(
        (user) => user.createdAt && user.createdAt.toDate() > yesterday
      ).length;
      setActiveUsers(activeCount);
    });

    const unsubscribeShops = onSnapshot(collection(db, "shops"), (snapshot) => {
      const shopsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as ShopData[];
      setShops(shopsData);
    });

    const unsubscribeProducts = onSnapshot(
      query(
        collection(db, "shop_products"),
        orderBy("createdAt", "desc"),
        limit(100)
      ),
      (snapshot) => {
        const productsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as ProductData[];
        setProducts(productsData);
        setLoading(false);
      }
    );

    return () => {
      unsubscribeUsers();
      unsubscribeShops();
      unsubscribeProducts();
    };
  }, []);

  // Calculate metrics totals and costs
  const metricsTotal = useMemo(() => {
    if (!metricsData.length) return { reads: 0, writes: 0, functions: 0 };

    return metricsData.reduce(
      (acc, curr) => ({
        reads: acc.reads + curr.reads,
        writes: acc.writes + curr.writes,
        functions: acc.functions + curr.functions,
      }),
      { reads: 0, writes: 0, functions: 0 }
    );
  }, [metricsData]);

  const dailyMetricsTotal = useMemo(() => {
    if (!dailyMetricsData.length) return { reads: 0, writes: 0, functions: 0 };

    return dailyMetricsData.reduce(
      (acc, curr) => ({
        reads: acc.reads + curr.reads,
        writes: acc.writes + curr.writes,
        functions: acc.functions + curr.functions,
      }),
      { reads: 0, writes: 0, functions: 0 }
    );
  }, [dailyMetricsData]);

  const hourlyCosts = useMemo(() => calculateCosts(metricsData), [metricsData]);
  const dailyCosts = useMemo(
    () => calculateCosts(dailyMetricsData),
    [dailyMetricsData]
  );

  // Optimized search with useMemo
  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return [];

    const term = searchTerm.toLowerCase().trim();
    const results: Array<{
      type: string;
      data: UserData | ProductData | ShopData;
    }> = [];

    // Search users by displayName OR ID
    users.forEach((user) => {
      if (
        user.displayName?.toLowerCase().includes(term) ||
        user.id?.toLowerCase().includes(term)
      ) {
        results.push({ type: "user", data: user });
      }
    });

    // Search shops by name OR ID
    shops.forEach((shop) => {
      if (
        shop.name?.toLowerCase().includes(term) ||
        shop.id?.toLowerCase().includes(term)
      ) {
        results.push({ type: "shop", data: shop });
      }
    });

    // Search products by productName OR ID
    products.forEach((product) => {
      if (
        product.productName?.toLowerCase().includes(term) ||
        product.id?.toLowerCase().includes(term)
      ) {
        results.push({ type: "product", data: product });
      }
    });

    return results.slice(0, 10); // Limit results for performance
  }, [searchTerm, users, products, shops]);

  const handleLogout = async () => {
    await logout();
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      router.push(`/searchresults?q=${encodeURIComponent(searchTerm.trim())}`);
    }
  };

  // Navigation handlers for the new sections
  const handleNavigation = (section: string) => {
    switch (section) {
      case "productapplications":
        router.push("/productapplications");
        break;
      case "editproductapplications":
        router.push("/editproductapplications");
        break;
      case "shop-applications":
        router.push("/shopapplications");
        break;
      case "main-large-banner":
        router.push("/topbanner");
        break;
      case "main-thin-banner":
        router.push("/thinbanner");
        break;
      case "main-banners":
        router.push("/normalbanners");
        break;
      case "notifications":
        router.push("/notifications");
        break;
      case "marketfilters":
        router.push("/marketscreenfilters");
        break;
      case "createcampaing":
        router.push("/createcampaing");
        break;
      case "marketscreenhorizontallist":
        router.push("/marketscreenhorizontallist");
        break;
      case "marketlayout":
        router.push("/marketlayout");
        break;
      case "listproduct-flowmanagement":
        router.push("/listproduct-flowmanagement");
        break;
      case "pickup-points":
        router.push("/pickup-points");
        break;
      default:
        break;
    }
  };

  const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800/95 border border-white/20 rounded-lg p-3 backdrop-blur-xl">
          <p className="text-white font-medium">{`Saat: ${label}`}</p>
          {payload.map((entry, index: number) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {`${entry.name}: ${entry.value}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 overflow-hidden">
        {/* Header */}
        <header className="backdrop-blur-xl bg-white/10 border-b border-white/20 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-xl font-bold text-white">
                  Yönetici Paneli
                </h1>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-gray-300">
                  <User className="w-4 h-4" />
                  <span className="text-sm hidden sm:block">{user?.email}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-3 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-sm hidden sm:block">Çıkış</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          {/* Top Row - Stats and Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">
            {/* Left side - Quick Stats (2 rows) */}
            <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* First row of stats */}
              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 bg-blue-500/20 rounded-lg">
                    <Users className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Kullanıcılar
                    </h3>
                    <p className="text-xl font-bold text-blue-400">
                      {loading ? "..." : users.length.toLocaleString("tr-TR")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 bg-green-500/20 rounded-lg">
                    <Clock className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Aktif</h3>
                    <p className="text-xl font-bold text-green-400">
                      {loading ? "..." : activeUsers.toLocaleString("tr-TR")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 bg-purple-500/20 rounded-lg">
                    <Store className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Mağazalar
                    </h3>
                    <p className="text-xl font-bold text-purple-400">
                      {loading ? "..." : shops.length.toLocaleString("tr-TR")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Second row of stats */}
              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 bg-orange-500/20 rounded-lg">
                    <Package className="w-5 h-5 text-orange-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Ürünler
                    </h3>
                    <p className="text-xl font-bold text-orange-400">
                      {loading
                        ? "..."
                        : products.length.toLocaleString("tr-TR")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 bg-pink-500/20 rounded-lg">
                    <Activity className="w-5 h-5 text-pink-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      API Çağrıları
                    </h3>
                    <p className="text-xl font-bold text-pink-400">
                      {metricsTotal.reads +
                        metricsTotal.writes +
                        metricsTotal.functions}
                    </p>
                  </div>
                </div>
              </div>

              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 bg-yellow-500/20 rounded-lg">
                    <Globe className="w-5 h-5 text-yellow-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Günlük Maliyet
                    </h3>
                    <p className="text-xl font-bold text-yellow-400">
                      ${dailyCosts.total.toFixed(4)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right side - Monitoring Charts (2x2 grid) */}
            <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Firestore Operations Chart - 60 minutes */}
              <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-4 relative">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-blue-400" />
                    <h3 className="text-sm font-semibold text-white">
                      Firestore (60dk){" "}
                      {metricsLoading && (
                        <span className="text-xs text-gray-400">⟳</span>
                      )}
                    </h3>
                  </div>
                  <div className="flex gap-4 text-xs">
                    <span className="text-blue-400">
                      R: {metricsTotal.reads}
                    </span>
                    <span className="text-green-400">
                      W: {metricsTotal.writes}
                    </span>
                  </div>
                </div>
                <div className="h-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={metricsData}>
                      <XAxis
                        dataKey="time"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: "#9CA3AF" }}
                        interval={14}
                      />
                      <YAxis hide />
                      <Tooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="reads"
                        stackId="1"
                        stroke="#60A5FA"
                        fill="#60A5FA"
                        fillOpacity={0.3}
                        strokeWidth={1}
                      />
                      <Area
                        type="monotone"
                        dataKey="writes"
                        stackId="1"
                        stroke="#34D399"
                        fill="#34D399"
                        fillOpacity={0.3}
                        strokeWidth={1}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                {/* Cost display */}
                <div className="absolute bottom-2 right-2 flex items-center gap-1 text-xs text-gray-400">
                  <DollarSign className="w-3 h-3" />
                  <span>
                    ${(hourlyCosts.reads + hourlyCosts.writes).toFixed(4)}
                  </span>
                </div>
              </div>

              {/* Cloud Functions Chart - 60 minutes */}
              <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-4 relative">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-yellow-400" />
                    <h3 className="text-sm font-semibold text-white">
                      Functions (60dk){" "}
                      {metricsLoading && (
                        <span className="text-xs text-gray-400">⟳</span>
                      )}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-yellow-400" />
                    <span className="text-xs text-yellow-400">
                      {metricsTotal.functions}
                    </span>
                  </div>
                </div>
                <div className="h-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={metricsData}>
                      <XAxis
                        dataKey="time"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: "#9CA3AF" }}
                        interval={14}
                      />
                      <YAxis hide />
                      <Tooltip content={<CustomTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="functions"
                        stroke="#FBBF24"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 3, fill: "#FBBF24" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {/* Cost display */}
                <div className="absolute bottom-2 right-2 flex items-center gap-1 text-xs text-gray-400">
                  <DollarSign className="w-3 h-3" />
                  <span>${hourlyCosts.functions.toFixed(4)}</span>
                </div>
              </div>

              {/* Firestore Operations Chart - 24 hours */}
              <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-4 relative">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-blue-400" />
                    <h3 className="text-sm font-semibold text-white">
                      Firestore (24sa)
                    </h3>
                  </div>
                  <div className="flex gap-4 text-xs">
                    <span className="text-blue-400">
                      R: {dailyMetricsTotal.reads}
                    </span>
                    <span className="text-green-400">
                      W: {dailyMetricsTotal.writes}
                    </span>
                  </div>
                </div>
                <div className="h-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyMetricsData}>
                      <XAxis
                        dataKey="time"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: "#9CA3AF" }}
                        interval={5}
                      />
                      <YAxis hide />
                      <Tooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="reads"
                        stackId="1"
                        stroke="#60A5FA"
                        fill="#60A5FA"
                        fillOpacity={0.3}
                        strokeWidth={1}
                      />
                      <Area
                        type="monotone"
                        dataKey="writes"
                        stackId="1"
                        stroke="#34D399"
                        fill="#34D399"
                        fillOpacity={0.3}
                        strokeWidth={1}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                {/* Cost display */}
                <div className="absolute bottom-2 right-2 flex items-center gap-1 text-xs text-gray-400">
                  <DollarSign className="w-3 h-3" />
                  <span>
                    ${(dailyCosts.reads + dailyCosts.writes).toFixed(4)}
                  </span>
                </div>
              </div>

              {/* Cloud Functions Chart - 24 hours */}
              <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-4 relative">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-yellow-400" />
                    <h3 className="text-sm font-semibold text-white">
                      Functions (24sa)
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-yellow-400" />
                    <span className="text-xs text-yellow-400">
                      {dailyMetricsTotal.functions}
                    </span>
                  </div>
                </div>
                <div className="h-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailyMetricsData}>
                      <XAxis
                        dataKey="time"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: "#9CA3AF" }}
                        interval={5}
                      />
                      <YAxis hide />
                      <Tooltip content={<CustomTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="functions"
                        stroke="#FBBF24"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 3, fill: "#FBBF24" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {/* Cost display */}
                <div className="absolute bottom-2 right-2 flex items-center gap-1 text-xs text-gray-400">
                  <DollarSign className="w-3 h-3" />
                  <span>${dailyCosts.functions.toFixed(4)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Search Bar */}
          <div className="mb-4">
            <form onSubmit={handleSearch} className="flex gap-3 max-w-3xl">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Kullanıcı, ürün, mağaza ara (isim veya ID ile)"
                  className="w-full pl-10 pr-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={!searchTerm.trim()}
                className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-600 text-white font-medium rounded-xl transition-all duration-200 disabled:cursor-not-allowed text-sm"
              >
                Ara
              </button>
              <button
                type="button"
                onClick={() => router.push("/cloudfunctionmonitoring")}
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 text-white font-medium rounded-xl transition-all duration-200 text-sm"
              >
                <Zap className="w-4 h-4" />
                Cloud Function Analiz
              </button>
              <button
                type="button"
                onClick={() => router.push("/recommendations-pipeline-usage")}
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 text-white font-medium rounded-xl transition-all duration-200 text-sm"
              >
                <Zap className="w-4 h-4" />
                Recommendations Pipeline Analiz
              </button>
            </form>

            {/* Quick Search Preview */}
            {searchTerm && (
              <div className="mt-3 max-w-2xl">
                <div className="bg-slate-800/95 backdrop-blur-xl border border-white/20 rounded-xl p-3">
                  {searchResults.length > 0 ? (
                    <div>
                      <p className="text-gray-300 text-xs mb-2">
                        {searchResults.length} sonuç:
                      </p>
                      <div className="space-y-1">
                        {searchResults.slice(0, 3).map((result) => (
                          <div
                            key={`${result.type}-${result.data.id}`}
                            className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              {result.type === "user" ? (
                                <User className="w-3 h-3 text-blue-400" />
                              ) : result.type === "shop" ? (
                                <Store className="w-3 h-3 text-purple-400" />
                              ) : (
                                <Package className="w-3 h-3 text-green-400" />
                              )}
                              <div className="flex-1">
                                <p className="text-white font-medium text-xs">
                                  {result.type === "user"
                                    ? (result.data as UserData).displayName
                                    : result.type === "shop"
                                    ? (result.data as ShopData).name
                                    : (result.data as ProductData).productName}
                                </p>
                                <p className="text-gray-400 text-xs font-mono">
                                  ID: {result.data.id}
                                </p>
                              </div>
                              <span className="text-xs text-gray-400 capitalize">
                                {result.type === "user"
                                  ? "Kullanıcı"
                                  : result.type === "shop"
                                  ? "Mağaza"
                                  : "Ürün"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-400 text-xs">Sonuç bulunamadı</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Admin Panel Controls */}
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
            <h3 className="text-lg font-semibold text-white mb-3">
              Yönetici Kontrolleri
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <button
                onClick={() => handleNavigation("productapplications")}
                className="p-3 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
                  <h4 className="font-semibold text-white text-sm">
                    Ürün Başvuruları
                  </h4>
                </div>
                <p className="text-xs text-gray-300">Bekleyen başvurular</p>
              </button>

              <button
                onClick={() => handleNavigation("editproductapplications")}
                className="p-3 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Edit2 className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
                  <h4 className="font-semibold text-white text-sm">
                    Ürün Güncellemeler
                  </h4>
                </div>
                <p className="text-xs text-gray-300">Bekleyen başvurular</p>
              </button>

              <button
                onClick={() => handleNavigation("shop-applications")}
                className="p-3 bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Store className="w-4 h-4 text-green-400 group-hover:scale-110 transition-transform" />
                  <h4 className="font-semibold text-white text-sm">
                    Dükkan Başvuruları
                  </h4>
                </div>
                <p className="text-xs text-gray-300">Yeni başvurular</p>
              </button>

              <button
                onClick={() => handleNavigation("pickup-points")}
                className="p-3 bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="w-4 h-4 text-green-400 group-hover:scale-110 transition-transform" />
                  <h4 className="font-semibold text-white text-sm">
                    Teslimat Noktaları
                  </h4>
                </div>
                <p className="text-xs text-gray-300">Teslimat noktaları</p>
              </button>

              <button
                onClick={() => handleNavigation("main-large-banner")}
                className="p-3 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Image className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
                  <h4 className="font-semibold text-white text-sm">
                    Büyük Banner
                  </h4>
                </div>
                <p className="text-xs text-gray-300">Ana ekran banner</p>
              </button>

              <button
                onClick={() => handleNavigation("main-thin-banner")}
                className="p-3 bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/30 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Layout className="w-4 h-4 text-orange-400 group-hover:scale-110 transition-transform" />
                  <h4 className="font-semibold text-white text-sm">
                    İnce Banner
                  </h4>
                </div>
                <p className="text-xs text-gray-300">İnce banner yönetimi</p>
              </button>

              <button
                onClick={() => handleNavigation("main-banners")}
                className="p-3 bg-pink-600/20 hover:bg-pink-600/30 border border-pink-500/30 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 className="w-4 h-4 text-pink-400 group-hover:scale-110 transition-transform" />
                  <h4 className="font-semibold text-white text-sm">
                    Ana Bannerlar
                  </h4>
                </div>
                <p className="text-xs text-gray-300">Tüm banner yönetimi</p>
              </button>
              <button
                onClick={() => handleNavigation("notifications")}
                className="p-3 bg-pink-600/20 hover:bg-pink-600/30 border border-pink-500/30 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Bell className="w-4 h-4 text-pink-400 group-hover:scale-110 transition-transform" />
                  <h4 className="font-semibold text-white text-sm">
                    Bildirim Gönder
                  </h4>
                </div>
                <p className="text-xs text-gray-300">Bildirim gönderimi</p>
              </button>
              <button
                onClick={() => handleNavigation("marketfilters")}
                className="p-3 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Filter className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
                  <h4 className="font-semibold text-white text-sm">
                    Ana Ekran Filtereleri
                  </h4>
                </div>
                <p className="text-xs text-gray-300">Dinamik Filtre Oluştur</p>
              </button>
              <button
                onClick={() => handleNavigation("createcampaing")}
                className="p-3 bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/30 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Bell className="w-4 h-4 text-orange-400 group-hover:scale-110 transition-transform" />
                  <h4 className="font-semibold text-white text-sm">
                    Özel Gün Kampanyaları
                  </h4>
                </div>
                <p className="text-xs text-gray-300">
                  Özel Günler İçin Kampanya Oluştur
                </p>
              </button>
              <button
                onClick={() => handleNavigation("marketscreenhorizontallist")}
                className="p-3 bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/30 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <List className="w-4 h-4 text-orange-400 group-hover:scale-110 transition-transform" />
                  <h4 className="font-semibold text-white text-sm">
                    Ana Ekran Yatay Ürün Listesi
                  </h4>
                </div>
                <p className="text-xs text-gray-300">
                  Ana Ekran Yatay Ürün Listesi
                </p>
              </button>
              <button
                onClick={() => handleNavigation("marketlayout")}
                className="p-3 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Layout className="w-4 h-4 text-indigo-400 group-hover:scale-110 transition-transform" />
                  <h4 className="font-semibold text-white text-sm">
                    Ana Ekran Layout
                  </h4>
                </div>
                <p className="text-xs text-gray-300">
                  Widget sıralama ve görünürlük
                </p>
              </button>
              <button
                onClick={() => handleNavigation("listproduct-flowmanagement")}
                className="p-3 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Layout className="w-4 h-4 text-indigo-400 group-hover:scale-110 transition-transform" />
                  <h4 className="font-semibold text-white text-sm">
                    Ürün Akış Yönetimi
                  </h4>
                </div>
                <p className="text-xs text-gray-300">Ürün akış yönetimi</p>
              </button>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
