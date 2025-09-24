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
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
          <p className="text-gray-800 font-medium text-sm">{`Saat: ${label}`}</p>
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
      <div className="min-h-screen bg-white">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 bg-blue-600 rounded-lg">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-xl font-bold text-gray-900">
                  Yönetici Paneli
                </h1>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-gray-600">
                  <User className="w-4 h-4" />
                  <span className="text-sm hidden sm:block">{user?.email}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors border border-red-200"
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
              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-lg">
                    <Users className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-600">
                      Kullanıcılar
                    </h3>
                    <p className="text-xl font-bold text-gray-900">
                      {loading ? "..." : users.length.toLocaleString("tr-TR")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 bg-green-100 rounded-lg">
                    <Clock className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-600">Aktif</h3>
                    <p className="text-xl font-bold text-gray-900">
                      {loading ? "..." : activeUsers.toLocaleString("tr-TR")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 bg-purple-100 rounded-lg">
                    <Store className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-600">
                      Mağazalar
                    </h3>
                    <p className="text-xl font-bold text-gray-900">
                      {loading ? "..." : shops.length.toLocaleString("tr-TR")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Second row of stats */}
              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 bg-orange-100 rounded-lg">
                    <Package className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-600">
                      Ürünler
                    </h3>
                    <p className="text-xl font-bold text-gray-900">
                      {loading
                        ? "..."
                        : products.length.toLocaleString("tr-TR")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 bg-pink-100 rounded-lg">
                    <Activity className="w-5 h-5 text-pink-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-600">
                      API Çağrıları
                    </h3>
                    <p className="text-xl font-bold text-gray-900">
                      {metricsTotal.reads +
                        metricsTotal.writes +
                        metricsTotal.functions}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 bg-yellow-100 rounded-lg">
                    <Globe className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-600">
                      Günlük Maliyet
                    </h3>
                    <p className="text-xl font-bold text-gray-900">
                      ${dailyCosts.total.toFixed(4)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right side - Monitoring Charts (2x2 grid) */}
            <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Firestore Operations Chart - 60 minutes */}
              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm relative">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-blue-600" />
                    <h3 className="text-sm font-semibold text-gray-900">
                      Firestore (60dk){" "}
                      {metricsLoading && (
                        <span className="text-xs text-gray-400">⟳</span>
                      )}
                    </h3>
                  </div>
                  <div className="flex gap-4 text-xs">
                    <span className="text-blue-600">
                      R: {metricsTotal.reads}
                    </span>
                    <span className="text-green-600">
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
                        tick={{ fontSize: 10, fill: "#6B7280" }}
                        interval={14}
                      />
                      <YAxis hide />
                      <Tooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="reads"
                        stackId="1"
                        stroke="#2563EB"
                        fill="#2563EB"
                        fillOpacity={0.1}
                        strokeWidth={1}
                      />
                      <Area
                        type="monotone"
                        dataKey="writes"
                        stackId="1"
                        stroke="#059669"
                        fill="#059669"
                        fillOpacity={0.1}
                        strokeWidth={1}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                {/* Cost display */}
                <div className="absolute bottom-2 right-2 flex items-center gap-1 text-xs text-gray-500">
                  <DollarSign className="w-3 h-3" />
                  <span>
                    ${(hourlyCosts.reads + hourlyCosts.writes).toFixed(4)}
                  </span>
                </div>
              </div>

              {/* Cloud Functions Chart - 60 minutes */}
              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm relative">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-yellow-600" />
                    <h3 className="text-sm font-semibold text-gray-900">
                      Functions (60dk){" "}
                      {metricsLoading && (
                        <span className="text-xs text-gray-400">⟳</span>
                      )}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-yellow-600" />
                    <span className="text-xs text-yellow-600">
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
                        tick={{ fontSize: 10, fill: "#6B7280" }}
                        interval={14}
                      />
                      <YAxis hide />
                      <Tooltip content={<CustomTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="functions"
                        stroke="#D97706"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 3, fill: "#D97706" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {/* Cost display */}
                <div className="absolute bottom-2 right-2 flex items-center gap-1 text-xs text-gray-500">
                  <DollarSign className="w-3 h-3" />
                  <span>${hourlyCosts.functions.toFixed(4)}</span>
                </div>
              </div>

              {/* Firestore Operations Chart - 24 hours */}
              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm relative">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-blue-600" />
                    <h3 className="text-sm font-semibold text-gray-900">
                      Firestore (24sa)
                    </h3>
                  </div>
                  <div className="flex gap-4 text-xs">
                    <span className="text-blue-600">
                      R: {dailyMetricsTotal.reads}
                    </span>
                    <span className="text-green-600">
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
                        tick={{ fontSize: 10, fill: "#6B7280" }}
                        interval={5}
                      />
                      <YAxis hide />
                      <Tooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="reads"
                        stackId="1"
                        stroke="#2563EB"
                        fill="#2563EB"
                        fillOpacity={0.1}
                        strokeWidth={1}
                      />
                      <Area
                        type="monotone"
                        dataKey="writes"
                        stackId="1"
                        stroke="#059669"
                        fill="#059669"
                        fillOpacity={0.1}
                        strokeWidth={1}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                {/* Cost display */}
                <div className="absolute bottom-2 right-2 flex items-center gap-1 text-xs text-gray-500">
                  <DollarSign className="w-3 h-3" />
                  <span>
                    ${(dailyCosts.reads + dailyCosts.writes).toFixed(4)}
                  </span>
                </div>
              </div>

              {/* Cloud Functions Chart - 24 hours */}
              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm relative">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-yellow-600" />
                    <h3 className="text-sm font-semibold text-gray-900">
                      Functions (24sa)
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-yellow-600" />
                    <span className="text-xs text-yellow-600">
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
                        tick={{ fontSize: 10, fill: "#6B7280" }}
                        interval={5}
                      />
                      <YAxis hide />
                      <Tooltip content={<CustomTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="functions"
                        stroke="#D97706"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 3, fill: "#D97706" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {/* Cost display */}
                <div className="absolute bottom-2 right-2 flex items-center gap-1 text-xs text-gray-500">
                  <DollarSign className="w-3 h-3" />
                  <span>${dailyCosts.functions.toFixed(4)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Search Bar */}
          <div className="mb-4">
            <div className="flex gap-3">
              {" "}
              {/* Removed max-w-4xl to use full width */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Kullanıcı, ürün, mağaza ara (isim veya ID ile)"
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={!searchTerm.trim()}
                onClick={handleSearch}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-all duration-200 disabled:cursor-not-allowed text-sm"
              >
                Ara
              </button>
              <button
                type="button"
                onClick={() => router.push("/cloudfunctionmonitoring")}
                className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg transition-all duration-200 text-sm"
              >
                <Zap className="w-4 h-4" />
                Cloud Function Analiz
              </button>
              <button
                type="button"
                onClick={() => router.push("/recommendations-pipeline-usage")}
                className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-all duration-200 text-sm"
              >
                <BarChart3 className="w-4 h-4" />
                Recommendations Pipeline
              </button>
              <button
                type="button"
                onClick={() => router.push("/algoliamonitoring")}
                className="flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-lg transition-all duration-200 text-sm"
              >
                <Search className="w-4 h-4" />
                Algolia Monitoring
              </button>
            </div>

            {/* Quick Search Preview */}
            {searchTerm && (
              <div className="mt-3 max-w-2xl">
                <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                  {searchResults.length > 0 ? (
                    <div>
                      <p className="text-gray-600 text-xs mb-2">
                        {searchResults.length} sonuç:
                      </p>
                      <div className="space-y-1">
                        {searchResults.slice(0, 3).map((result) => (
                          <div
                            key={`${result.type}-${result.data.id}`}
                            className="p-2 hover:bg-gray-50 rounded-lg transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              {result.type === "user" ? (
                                <User className="w-3 h-3 text-blue-600" />
                              ) : result.type === "shop" ? (
                                <Store className="w-3 h-3 text-purple-600" />
                              ) : (
                                <Package className="w-3 h-3 text-green-600" />
                              )}
                              <div className="flex-1">
                                <p className="text-gray-900 font-medium text-xs">
                                  {result.type === "user"
                                    ? (result.data as UserData).displayName
                                    : result.type === "shop"
                                    ? (result.data as ShopData).name
                                    : (result.data as ProductData).productName}
                                </p>
                                <p className="text-gray-500 text-xs font-mono">
                                  ID: {result.data.id}
                                </p>
                              </div>
                              <span className="text-xs text-gray-500 capitalize">
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
                    <p className="text-gray-500 text-xs">Sonuç bulunamadı</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Admin Panel Controls */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Yönetici Kontrolleri
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <button
                onClick={() => handleNavigation("productapplications")}
                className="p-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-blue-600 group-hover:scale-110 transition-transform" />
                  <h4 className="font-semibold text-gray-900 text-sm">
                    Ürün Başvuruları
                  </h4>
                </div>
                <p className="text-xs text-gray-600">Bekleyen başvurular</p>
              </button>

              <button
                onClick={() => handleNavigation("editproductapplications")}
                className="p-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Edit2 className="w-4 h-4 text-blue-600 group-hover:scale-110 transition-transform" />
                  <h4 className="font-semibold text-gray-900 text-sm">
                    Ürün Güncellemeler
                  </h4>
                </div>
                <p className="text-xs text-gray-600">Bekleyen başvurular</p>
              </button>

              <button
                onClick={() => handleNavigation("shop-applications")}
                className="p-3 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Store className="w-4 h-4 text-green-600 group-hover:scale-110 transition-transform" />
                  <h4 className="font-semibold text-gray-900 text-sm">
                    Dükkan Başvuruları
                  </h4>
                </div>
                <p className="text-xs text-gray-600">Yeni başvurular</p>
              </button>

              <button
                onClick={() => handleNavigation("pickup-points")}
                className="p-3 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="w-4 h-4 text-green-600 group-hover:scale-110 transition-transform" />
                  <h4 className="font-semibold text-gray-900 text-sm">
                    Teslimat Noktaları
                  </h4>
                </div>
                <p className="text-xs text-gray-600">Teslimat noktaları</p>
              </button>

              <button
                onClick={() => handleNavigation("main-large-banner")}
                className="p-3 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Image className="w-4 h-4 text-purple-600 group-hover:scale-110 transition-transform" />
                  <h4 className="font-semibold text-gray-900 text-sm">
                    Büyük Banner
                  </h4>
                </div>
                <p className="text-xs text-gray-600">Ana ekran banner</p>
              </button>

              <button
                onClick={() => handleNavigation("main-thin-banner")}
                className="p-3 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Layout className="w-4 h-4 text-orange-600 group-hover:scale-110 transition-transform" />
                  <h4 className="font-semibold text-gray-900 text-sm">
                    İnce Banner
                  </h4>
                </div>
                <p className="text-xs text-gray-600">İnce banner yönetimi</p>
              </button>

              <button
                onClick={() => handleNavigation("main-banners")}
                className="p-3 bg-pink-50 hover:bg-pink-100 border border-pink-200 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 className="w-4 h-4 text-pink-600 group-hover:scale-110 transition-transform" />
                  <h4 className="font-semibold text-gray-900 text-sm">
                    Ana Bannerlar
                  </h4>
                </div>
                <p className="text-xs text-gray-600">Tüm banner yönetimi</p>
              </button>

              <button
                onClick={() => handleNavigation("notifications")}
                className="p-3 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Bell className="w-4 h-4 text-red-600 group-hover:scale-110 transition-transform" />
                  <h4 className="font-semibold text-gray-900 text-sm">
                    Bildirim Gönder
                  </h4>
                </div>
                <p className="text-xs text-gray-600">Bildirim gönderimi</p>
              </button>

              <button
                onClick={() => handleNavigation("marketfilters")}
                className="p-3 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Filter className="w-4 h-4 text-indigo-600 group-hover:scale-110 transition-transform" />
                  <h4 className="font-semibold text-gray-900 text-sm">
                    Ana Ekran Filtereleri
                  </h4>
                </div>
                <p className="text-xs text-gray-600">Dinamik Filtre Oluştur</p>
              </button>

              <button
                onClick={() => handleNavigation("createcampaing")}
                className="p-3 bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Bell className="w-4 h-4 text-yellow-600 group-hover:scale-110 transition-transform" />
                  <h4 className="font-semibold text-gray-900 text-sm">
                    Özel Gün Kampanyaları
                  </h4>
                </div>
                <p className="text-xs text-gray-600">
                  Özel Günler İçin Kampanya Oluştur
                </p>
              </button>

              <button
                onClick={() => handleNavigation("marketscreenhorizontallist")}
                className="p-3 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <List className="w-4 h-4 text-cyan-600 group-hover:scale-110 transition-transform" />
                  <h4 className="font-semibold text-gray-900 text-sm">
                    Ana Ekran Yatay Ürün Listesi
                  </h4>
                </div>
                <p className="text-xs text-gray-600">
                  Ana Ekran Yatay Ürün Listesi
                </p>
              </button>

              <button
                onClick={() => handleNavigation("marketlayout")}
                className="p-3 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Layout className="w-4 h-4 text-teal-600 group-hover:scale-110 transition-transform" />
                  <h4 className="font-semibold text-gray-900 text-sm">
                    Ana Ekran Layout
                  </h4>
                </div>
                <p className="text-xs text-gray-600">
                  Widget sıralama ve görünürlük
                </p>
              </button>

              <button
                onClick={() => handleNavigation("listproduct-flowmanagement")}
                className="p-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition-transform" />
                  <h4 className="font-semibold text-gray-900 text-sm">
                    Ürün Akış Yönetimi
                  </h4>
                </div>
                <p className="text-xs text-gray-600">Ürün akış yönetimi</p>
              </button>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
