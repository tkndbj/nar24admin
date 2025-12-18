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
  FileText,
  Image,
  Layout,
  Zap,
  List,
  TrendingUp,
  DollarSign,
  Activity,
  Bell,
  Filter,
  MapPin,
  MessageSquare,
  Truck,
  ShoppingCart,
  HelpCircle,
  Megaphone,
  Box,
  Building2,
  Settings,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useActivityLog, createPageLogger } from "@/hooks/useActivityLog";
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
import { authenticatedFetch } from "@/lib/api";

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

// Navigation button configuration for activity logging
const NAVIGATION_BUTTONS: Record<string, string> = {
  orders: "Siparişler",
  shipment: "Teslimat Yönetimi",
  "pickup-points": "Gel-Al Noktaları",
  refundforms: "İade Talepleri",
  helpforms: "Destek Talepleri",
  "ads-applications": "Reklam Başvuruları",
  topbanner: "Büyük Banner",
  thinbanner: "İnce Banner",
  normalbanners: "Ana Bannerlar",
  productapplications: "Ürün Başvuruları",
  editproductapplications: "Ürün Güncellemeler",
  shopapplications: "Dükkan Başvuruları",
  notifications: "Bildirim Gönder",
  "user-activity": "Kullanıcı Aktiviteleri",
  marketscreenfilters: "Ana Ekran Filtreleri",
  createcampaing: "Özel Gün Kampanyaları",
  marketscreenhorizontallist: "Yatay Ürün Listesi",
  marketlayout: "Ana Ekran Layout",
  "listproduct-flowmanagement": "Ürün Akış Yönetimi",
  cloudfunctionmonitoring: "Cloud Functions Takibi",
};

export default function Dashboard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserData[]>([]);
  const [shops, setShops] = useState<ShopData[]>([]);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [, setLoading] = useState(true);
  const [metricsData, setMetricsData] = useState<MetricData[]>([]);
  const [dailyMetricsData, setDailyMetricsData] = useState<MetricData[]>([]);
  const [, setMetricsLoading] = useState(true);

  // Initialize activity logging
  const { logActivity } = useActivityLog();
  const logger = createPageLogger(logActivity, "Dashboard");

  // Fetch metrics data from the API
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setMetricsLoading(true);
        const data = await authenticatedFetch<{
          hourly?: MetricData[];
          daily?: MetricData[];
        }>("/api/metrics");
        // Handle the API response format
        setMetricsData(data.hourly || generateMetricData());
        setDailyMetricsData(data.daily || generateDailyMetricData());
      } catch (error) {
        console.error("Error fetching metrics:", error);
        // Fallback to sample data if API fails
        setMetricsData(generateMetricData());
        setDailyMetricsData(generateDailyMetricData());
      } finally {
        setMetricsLoading(false);
      }
    };

    // Only fetch metrics if user is authenticated
    if (user) {
      fetchMetrics();
      // Refresh metrics every 5 minutes
      const interval = setInterval(fetchMetrics, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [user]);

  useEffect(() => {
    // Only set up Firestore listeners when user is authenticated
    if (!user) {
      setLoading(false);
      return;
    }

    const unsubscribeUsers = onSnapshot(
      query(collection(db, "users"), orderBy("createdAt", "desc"), limit(5)),
      (snapshot) => {
        const usersData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as UserData[];
        setUsers(usersData);
        setLoading(false);
      },
      (error) => {
        console.error("Error loading users:", error);
        setLoading(false);
      }
    );

    const unsubscribeShops = onSnapshot(
      query(collection(db, "shops"), orderBy("createdAt", "desc"), limit(5)),
      (snapshot) => {
        const shopsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as ShopData[];
        setShops(shopsData);
      },
      (error) => {
        console.error("Error loading shops:", error);
      }
    );

    const unsubscribeProducts = onSnapshot(
      query(collection(db, "products"), orderBy("createdAt", "desc"), limit(5)),
      (snapshot) => {
        const productsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as ProductData[];
        setProducts(productsData);
      },
      (error) => {
        console.error("Error loading products:", error);
      }
    );

    return () => {
      unsubscribeUsers();
      unsubscribeShops();
      unsubscribeProducts();
    };
  }, [user]);

  const handleLogout = useCallback(async () => {
    try {
      logger.action("Logged out");
      await logout();
      router.push("/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  }, [logout, router, logger]);

  const handleNavigation = useCallback(
    (path: string) => {
      const buttonName = NAVIGATION_BUTTONS[path] || path;
      logger.navigate(buttonName, { path });
      router.push(`/${path}`);
    },
    [router, logger]
  );

  const handleSearch = useCallback(
    (query: string) => {
      if (query.trim()) {
        logger.search(query.trim());
        router.push(`/searchresults?q=${encodeURIComponent(query.trim())}`);
      }
    },
    [router, logger]
  );

  const dayCosts = calculateCosts(dailyMetricsData);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50 shadow-sm">
          <div className="max-w-[1600px] mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    Nar24 Admin
                  </h1>
                  <p className="text-xs text-gray-500">Yönetim Paneli</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 rounded-lg">
                  <User className="w-5 h-5 text-gray-600" />
                  <span className="text-sm font-medium text-gray-700">
                    {user?.email}
                  </span>
                </div>

                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors shadow-sm"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-sm font-medium">Çıkış</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-[1600px] mx-auto px-6 py-6">
          {/* Stats Overview */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <TrendingUp className="w-4 h-4 text-green-500" />
              </div>
              <p className="text-sm text-gray-600 mb-1">Toplam Kullanıcı</p>
              <p className="text-2xl font-bold text-gray-900">{users.length}</p>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <Store className="w-5 h-5 text-green-600" />
                </div>
                <TrendingUp className="w-4 h-4 text-green-500" />
              </div>
              <p className="text-sm text-gray-600 mb-1">Aktif Dükkan</p>
              <p className="text-2xl font-bold text-gray-900">{shops.length}</p>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Package className="w-5 h-5 text-purple-600" />
                </div>
                <TrendingUp className="w-4 h-4 text-green-500" />
              </div>
              <p className="text-sm text-gray-600 mb-1">Toplam Ürün</p>
              <p className="text-2xl font-bold text-gray-900">
                {products.length}
              </p>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-orange-600" />
                </div>
                <Activity className="w-4 h-4 text-orange-500" />
              </div>
              <p className="text-sm text-gray-600 mb-1">Günlük Maliyet</p>
              <p className="text-2xl font-bold text-gray-900">
                ${dayCosts.total.toFixed(3)}
              </p>
            </div>
          </div>

          {/* Admin Controls - Categorized Grid */}
          <div className="grid grid-cols-6 gap-4">
            {/* 1. Sipariş Yönetimi */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-all">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4 text-blue-600" />
                </div>
                <h3 className="font-semibold text-gray-900 text-sm">
                  Sipariş Yönetimi
                </h3>
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => handleNavigation("orders")}
                  className="w-full p-2.5 bg-blue-50 hover:bg-blue-100 rounded-lg text-left transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <Package className="w-3.5 h-3.5 text-blue-600 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-medium text-gray-900">
                      Siparişler
                    </span>
                  </div>
                </button>
                <button
                  onClick={() => handleNavigation("shipment")}
                  className="w-full p-2.5 bg-blue-50 hover:bg-blue-100 rounded-lg text-left transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <Truck className="w-3.5 h-3.5 text-blue-600 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-medium text-gray-900">
                      Teslimat Yönetimi
                    </span>
                  </div>
                </button>
                <button
                  onClick={() => handleNavigation("deliveryprice")}
                  className="w-full p-2.5 bg-blue-50 hover:bg-blue-100 rounded-lg text-left transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <Truck className="w-3.5 h-3.5 text-blue-600 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-medium text-gray-900">
                      Kargo Fiyatlandırma
                    </span>
                  </div>
                </button>
                <button
                  onClick={() => handleNavigation("pickup-points")}
                  className="w-full p-2.5 bg-blue-50 hover:bg-blue-100 rounded-lg text-left transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-blue-600 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-medium text-gray-900">
                      Gel-Al Noktaları
                    </span>
                  </div>
                </button>
              </div>
            </div>

            {/* 2. Yardım & İade */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-all">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                  <HelpCircle className="w-4 h-4 text-red-600" />
                </div>
                <h3 className="font-semibold text-gray-900 text-sm">
                  Yardım & İade
                </h3>
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => handleNavigation("refundforms")}
                  className="w-full p-2.5 bg-red-50 hover:bg-red-100 rounded-lg text-left transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-red-600 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-medium text-gray-900">
                      İade Talepleri
                    </span>
                  </div>
                </button>
                <button
                  onClick={() => handleNavigation("helpforms")}
                  className="w-full p-2.5 bg-red-50 hover:bg-red-100 rounded-lg text-left transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5 text-red-600 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-medium text-gray-900">
                      Destek Talepleri
                    </span>
                  </div>
                </button>
              </div>
            </div>

            {/* 3. Reklamlar */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-all">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Megaphone className="w-4 h-4 text-purple-600" />
                </div>
                <h3 className="font-semibold text-gray-900 text-sm">
                  Reklamlar
                </h3>
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => handleNavigation("ads-applications")}
                  className="w-full p-2.5 bg-purple-50 hover:bg-purple-100 rounded-lg text-left transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <Image className="w-3.5 h-3.5 text-purple-600 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-medium text-gray-900">
                      Reklam Başvuruları
                    </span>
                  </div>
                </button>
                <button
                  onClick={() => handleNavigation("topbanner")}
                  className="w-full p-2.5 bg-purple-50 hover:bg-purple-100 rounded-lg text-left transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <Image className="w-3.5 h-3.5 text-purple-600 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-medium text-gray-900">
                      Büyük Banner
                    </span>
                  </div>
                </button>
                <button
                  onClick={() => handleNavigation("thinbanner")}
                  className="w-full p-2.5 bg-purple-50 hover:bg-purple-100 rounded-lg text-left transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <Layout className="w-3.5 h-3.5 text-purple-600 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-medium text-gray-900">
                      İnce Banner
                    </span>
                  </div>
                </button>
                <button
                  onClick={() => handleNavigation("normalbanners")}
                  className="w-full p-2.5 bg-purple-50 hover:bg-purple-100 rounded-lg text-left transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-3.5 h-3.5 text-purple-600 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-medium text-gray-900">
                      Ana Bannerlar
                    </span>
                  </div>
                </button>
              </div>
            </div>

            {/* 4. Ürün Yönetimi */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-all">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                  <Box className="w-4 h-4 text-orange-600" />
                </div>
                <h3 className="font-semibold text-gray-900 text-sm">
                  Ürün Yönetimi
                </h3>
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => handleNavigation("productapplications")}
                  className="w-full p-2.5 bg-orange-50 hover:bg-orange-100 rounded-lg text-left transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <Package className="w-3.5 h-3.5 text-orange-600 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-medium text-gray-900">
                      Ürün Başvuruları
                    </span>
                  </div>
                </button>
                <button
                  onClick={() => handleNavigation("editproductapplications")}
                  className="w-full p-2.5 bg-orange-50 hover:bg-orange-100 rounded-lg text-left transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <Edit2 className="w-3.5 h-3.5 text-orange-600 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-medium text-gray-900">
                      Ürün Güncellemeler
                    </span>
                  </div>
                </button>
              </div>
            </div>

            {/* 5. Dükkan Yönetimi */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-all">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-green-600" />
                </div>
                <h3 className="font-semibold text-gray-900 text-sm">
                  Dükkan Yönetimi
                </h3>
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => handleNavigation("shopapplications")}
                  className="w-full p-2.5 bg-green-50 hover:bg-green-100 rounded-lg text-left transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <Store className="w-3.5 h-3.5 text-green-600 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-medium text-gray-900">
                      Dükkan Başvuruları
                    </span>
                  </div>
                </button>
              </div>
            </div>

            {/* 6. Nar24 Yönetimi - Only visible to full admins */}
            {user?.isAdmin && (
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-all">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                  <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <Settings className="w-4 h-4 text-indigo-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 text-sm">
                    Nar24 Yönetimi
                  </h3>
                </div>
                <div className="space-y-2">
                  <button
                    onClick={() => handleNavigation("notifications")}
                    className="w-full p-2.5 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-left transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <Bell className="w-3.5 h-3.5 text-indigo-600 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-medium text-gray-900">
                        Bildirim Gönder
                      </span>
                    </div>
                  </button>
                  <button
                    onClick={() => handleNavigation("user-activity")}
                    className="w-full p-2.5 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-left transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <Activity className="w-3.5 h-3.5 text-indigo-600 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-medium text-gray-900">
                        Kullanıcı Aktiviteleri
                      </span>
                    </div>
                  </button>
                  <button
                    onClick={() => handleNavigation("marketscreenfilters")}
                    className="w-full p-2.5 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-left transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <Filter className="w-3.5 h-3.5 text-indigo-600 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-medium text-gray-900">
                        Ana Ekran Filtreleri
                      </span>
                    </div>
                  </button>
                  <button
                    onClick={() => handleNavigation("createcampaing")}
                    className="w-full p-2.5 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-left transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-indigo-600 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-medium text-gray-900">
                        Özel Gün Kampanyaları
                      </span>
                    </div>
                  </button>
                  <button
                    onClick={() =>
                      handleNavigation("marketscreenhorizontallist")
                    }
                    className="w-full p-2.5 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-left transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <List className="w-3.5 h-3.5 text-indigo-600 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-medium text-gray-900">
                        Yatay Ürün Listesi
                      </span>
                    </div>
                  </button>
                  <button
                    onClick={() => handleNavigation("marketlayout")}
                    className="w-full p-2.5 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-left transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <Layout className="w-3.5 h-3.5 text-indigo-600 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-medium text-gray-900">
                        Ana Ekran Layout
                      </span>
                    </div>
                  </button>
                  <button
                    onClick={() =>
                      handleNavigation("listproduct-flowmanagement")
                    }
                    className="w-full p-2.5 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-left transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <Activity className="w-3.5 h-3.5 text-indigo-600 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-medium text-gray-900">
                        Ürün Akış Yönetimi
                      </span>
                    </div>
                  </button>
                  <button
                    onClick={() => handleNavigation("cloudfunctionmonitoring")}
                    className="w-full p-2.5 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-left transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-indigo-600 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-medium text-gray-900">
                        Cloud Functions Takibi
                      </span>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Search and Quick Access */}
          <div className="mt-6 grid grid-cols-2 gap-4">
            {/* Search Section */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-4">
                <Search className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-900">Hızlı Arama</h3>
              </div>
              <input
                type="text"
                placeholder="Kullanıcı, dükkan veya ürün ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSearch(searchTerm);
                  }
                }}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>

            {/* System Metrics Preview */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-900">
                  Sistem Metrikleri
                </h3>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-xs text-gray-600 mb-1">Okuma</p>
                  <p className="text-lg font-bold text-blue-600">
                    {metricsData
                      .reduce((sum, m) => sum + m.reads, 0)
                      .toLocaleString()}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-600 mb-1">Yazma</p>
                  <p className="text-lg font-bold text-green-600">
                    {metricsData
                      .reduce((sum, m) => sum + m.writes, 0)
                      .toLocaleString()}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-600 mb-1">Fonksiyon</p>
                  <p className="text-lg font-bold text-purple-600">
                    {metricsData
                      .reduce((sum, m) => sum + m.functions, 0)
                      .toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
