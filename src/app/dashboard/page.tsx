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
  ChevronDown,
  Clock,
  AlertCircle,
  ArrowUpRight,
  Layers,
  Percent,
  CreditCard,
  Archive,
  UtensilsCrossed,
  ShoppingBag,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useActivityLog, createPageLogger } from "@/hooks/useActivityLog";
import {
  collection,
  getCountFromServer,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useRouter } from "next/navigation";
import { authenticatedFetch } from "@/lib/api";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

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

  const readCost = (totalReads / 100000) * 0.03;
  const writeCost = (totalWrites / 100000) * 0.09;
  const functionCost = (totalFunctions / 1000000) * 0.4;

  return {
    reads: readCost,
    writes: writeCost,
    functions: functionCost,
    total: readCost + writeCost + functionCost,
  };
};

// Generate sample data for the last 24 hours
const generateDailyMetricData = (): MetricData[] => {
  const data: MetricData[] = [];
  const now = new Date();

  for (let i = 23; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60 * 60000);
    const timeStr = time.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const baseReads = 200 + Math.sin(i / 6) * 100 + Math.cos(i / 4) * 50;
    const baseWrites = 50 + Math.sin(i / 8) * 25 + Math.cos(i / 6) * 15;
    const baseFunctions = 30 + Math.sin(i / 5) * 15 + Math.cos(i / 7) * 10;

    data.push({
      time: timeStr,
      reads: Math.max(0, Math.round(baseReads + (Math.random() - 0.5) * 100)),
      writes: Math.max(0, Math.round(baseWrites + (Math.random() - 0.5) * 30)),
      functions: Math.max(
        0,
        Math.round(baseFunctions + (Math.random() - 0.5) * 20),
      ),
    });
  }

  return data;
};

// Navigation categories
const NAV_CATEGORIES = [
  {
    title: "Siparis Yonetimi",
    icon: ShoppingCart,
    color: "blue",
    items: [
      { path: "orders", label: "Siparisler", icon: Package },
      { path: "shipment", label: "Teslimat Yonetimi", icon: Truck },
      { path: "pickup-points", label: "Gel-Al Noktalari", icon: MapPin },
      { path: "paymentissues", label: "Ödeme Sorunları", icon: CreditCard },
    ],
  },
  {
    title: "Muhasebe",
    icon: DollarSign,
    color: "green",
    items: [
      { path: "weekly-accounting", label: "Haftalık Satış Raporları", icon: BarChart3 },
    ],
  },
  {
    title: "Yardim & Iade",
    icon: HelpCircle,
    color: "red",
    items: [
      { path: "refundforms", label: "Iade Talepleri", icon: FileText },
      { path: "helpforms", label: "Destek Talepleri", icon: MessageSquare },
    ],
  },
  {
    title: "Fiyatlandirma",
    icon: CreditCard,
    color: "teal",
    items: [
      { path: "deliveryprice", label: "Kargo Fiyatlandirma", icon: Truck },
      { path: "prices", label: "Reklam/Boost Fiyatlari", icon: DollarSign },
      { path: "commissions", label: "Komisyonlar", icon: Percent },
    ],
  },
  {
    title: "Reklamlar",
    icon: Megaphone,
    color: "purple",
    items: [
      { path: "ads-applications", label: "Reklam Basvurulari", icon: Image },
      { path: "topbanner", label: "Buyuk Banner", icon: Image },
      { path: "thinbanner", label: "Ince Banner", icon: Layout },
      { path: "normalbanners", label: "Ana Bannerlar", icon: BarChart3 },
    ],
  },
  {
    title: "Urun Yonetimi",
    icon: Box,
    color: "orange",
    items: [
      { path: "productapplications", label: "Urun Basvurulari", icon: Package },
      {
        path: "editproductapplications",
        label: "Urun Guncellemeler",
        icon: Edit2,
      },
      { path: "archived", label: "Arsiv", icon: Archive },
    ],
  },
  {
    title: "Dukkan Yonetimi",
    icon: Building2,
    color: "green",
    items: [
      { path: "shopapplications", label: "Dukkan Basvurulari", icon: Store },
      { path: "restaurantapplications", label: "Restoran Basvurulari", icon: UtensilsCrossed },
      { path: "marketapplications", label: "Market Basvurulari", icon: ShoppingBag },
    ],
  },
  {
    title: "Analiz Merkezi",
    icon: Activity,
    color: "indigo",
    items: [
      { path: "analytics-center", label: "Genel Analizler", icon: BarChart3 },
      { path: "analytics-center/details", label: "Aylık Analiz Özeti", icon: FileText },
    ],
  },
  {
    title: "Nar24 Yonetimi",
    icon: Settings,
    color: "indigo",
    adminOnly: true,
    items: [
      { path: "notifications", label: "Bildirim Gonder", icon: Bell },
      {
        path: "user-activity",
        label: "Kullanici Aktiviteleri",
        icon: Activity,
      },
      {
        path: "marketscreenfilters",
        label: "Ana Ekran Filtreleri",
        icon: Filter,
      },
      {
        path: "homescreen-shoplist",
        label: "Ana Ekran Dukkanlari",
        icon: Store,
      },
      { path: "createcampaing", label: "Ozel Gun Kampanyalari", icon: Zap },
      {
        path: "marketscreenhorizontallist",
        label: "Yatay Urun Listesi",
        icon: List,
      },
      { path: "marketlayout", label: "Ana Ekran Layout", icon: Layout },
      {
        path: "listproduct-flowmanagement",
        label: "Urun Akis Yonetimi",
        icon: Activity,
      },
      {
        path: "cloudfunctionmonitoring",
        label: "Cloud Functions Takibi",
        icon: Zap,
      },
      {
        path: "search-functionality",
        label: "Arama Motoru Yönetimi",
        icon: Search,
      },
    ],
  },
];

// Stat card component for compact display
const StatCard = ({
  label,
  value,
  icon: Icon,
  color,
  subtext,
  onClick,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  subtext?: string;
  onClick?: () => void;
}) => {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    green: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    purple: "bg-purple-500/10 text-purple-600 border-purple-500/20",
    orange: "bg-orange-500/10 text-orange-600 border-orange-500/20",
    red: "bg-red-500/10 text-red-600 border-red-500/20",
    yellow: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    indigo: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  };

  return (
    <div
      onClick={onClick}
      className={`bg-white border border-gray-100 rounded-lg p-3 hover:shadow-md transition-all ${
        onClick ? "cursor-pointer hover:border-gray-200" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-md ${colorMap[color]}`}>
            <Icon className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-medium text-gray-500">{label}</span>
        </div>
        {onClick && <ArrowUpRight className="w-3 h-3 text-gray-400" />}
      </div>
      <div className="mt-2">
        <span className="text-xl font-bold text-gray-900">{value}</span>
        {subtext && (
          <span className="text-xs text-gray-400 ml-1">{subtext}</span>
        )}
      </div>
    </div>
  );
};

// Pending action card
const PendingCard = ({
  title,
  count,
  icon: Icon,
  color,
  path,
  onClick,
}: {
  title: string;
  count: number;
  icon: React.ElementType;
  color: string;
  path: string;
  onClick: (path: string, title: string) => void;
}) => {
  const bgColors: Record<string, string> = {
    yellow: "bg-amber-50 border-amber-200 hover:bg-amber-100",
    red: "bg-red-50 border-red-200 hover:bg-red-100",
    blue: "bg-blue-50 border-blue-200 hover:bg-blue-100",
    green: "bg-emerald-50 border-emerald-200 hover:bg-emerald-100",
    purple: "bg-purple-50 border-purple-200 hover:bg-purple-100",
    orange: "bg-orange-50 border-orange-200 hover:bg-orange-100",
    teal: "bg-teal-50 border-teal-200 hover:bg-teal-100",
  };
  const textColors: Record<string, string> = {
    yellow: "text-amber-700",
    red: "text-red-700",
    blue: "text-blue-700",
    green: "text-emerald-700",
    purple: "text-purple-700",
    orange: "text-orange-700",
    teal: "text-teal-700",
  };
  const iconBg: Record<string, string> = {
    yellow: "bg-amber-100",
    red: "bg-red-100",
    blue: "bg-blue-100",
    green: "bg-emerald-100",
    purple: "bg-purple-100",
    orange: "bg-orange-100",
    teal: "bg-teal-100",
  };

  if (count === 0) return null;

  return (
    <button
      onClick={() => onClick(path, title)}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-all ${bgColors[color]}`}
    >
      <div className={`p-1.5 rounded-md ${iconBg[color]}`}>
        <Icon className={`w-4 h-4 ${textColors[color]}`} />
      </div>
      <div className="text-left">
        <p className={`text-sm font-semibold ${textColors[color]}`}>{count}</p>
        <p className="text-xs text-gray-600">{title}</p>
      </div>
    </button>
  );
};

// Quick action button
const QuickAction = ({
  title,
  icon: Icon,
  color,
  onClick,
}: {
  title: string;
  icon: React.ElementType;
  color: string;
  onClick: () => void;
}) => {
  const colors: Record<string, string> = {
    blue: "bg-blue-600 hover:bg-blue-700",
    green: "bg-emerald-600 hover:bg-emerald-700",
    purple: "bg-purple-600 hover:bg-purple-700",
    orange: "bg-orange-600 hover:bg-orange-700",
    red: "bg-red-600 hover:bg-red-700",
  };

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-white text-xs font-medium transition-all ${colors[color]}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {title}
    </button>
  );
};

export default function Dashboard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalShops, setTotalShops] = useState(0);
  const [totalProducts, setTotalProducts] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [dailyMetricsData, setDailyMetricsData] = useState<MetricData[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<string[]>(
    NAV_CATEGORIES.map((cat) => cat.title),
  );

  // Pending counts
  const [pendingShopApps, setPendingShopApps] = useState(0);
  const [pendingRestaurantApps, setPendingRestaurantApps] = useState(0);
  const [pendingMarketApps, setPendingMarketApps] = useState(0);
  const [pendingProductApps, setPendingProductApps] = useState(0);
  const [pendingRefunds, setPendingRefunds] = useState(0);
  const [pendingHelp, setPendingHelp] = useState(0);
  const [todayOrders, setTodayOrders] = useState(0);

  // Initialize activity logging
  const { logActivity } = useActivityLog();
  const logger = createPageLogger(logActivity, "Dashboard");

  // Fetch metrics data
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const data = await authenticatedFetch<{
          hourly?: MetricData[];
          daily?: MetricData[];
        }>("/api/metrics");
        setDailyMetricsData(data.daily || generateDailyMetricData());
      } catch {
        setDailyMetricsData(generateDailyMetricData());
      }
    };

    if (user) {
      fetchMetrics();
      const interval = setInterval(fetchMetrics, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [user]);

  // Fetch all counts efficiently with getCountFromServer
  useEffect(() => {
    if (!user) return;

    const fetchCounts = async () => {
      try {
        // Main collection counts
        const [usersCount, shopsCount, productsCount, ordersCount] =
          await Promise.all([
            getCountFromServer(query(collection(db, "users"))),
            getCountFromServer(query(collection(db, "shops"))),
            getCountFromServer(query(collection(db, "products"))),
            getCountFromServer(query(collection(db, "orders"))),
          ]);

        setTotalUsers(usersCount.data().count);
        setTotalShops(shopsCount.data().count);
        setTotalProducts(productsCount.data().count);
        setTotalOrders(ordersCount.data().count);

        // Pending counts - use where clause for status
        const [shopAppsCount, restaurantAppsCount, marketAppsCount, refundsCount, helpCount] = await Promise.all([
          getCountFromServer(
            query(
              collection(db, "shopApplications"),
              where("status", "==", "pending"),
            ),
          ),
          getCountFromServer(
            query(
              collection(db, "restaurantApplications"),
              where("status", "==", "pending"),
            ),
          ),
          getCountFromServer(
            query(
              collection(db, "marketApplications"),
              where("status", "==", "pending"),
            ),
          ),
          getCountFromServer(
            query(
              collection(db, "refund-forms"),
              where("status", "==", "pending"),
            ),
          ),
          getCountFromServer(
            query(
              collection(db, "help-forms"),
              where("status", "==", "pending"),
            ),
          ),
        ]);

        setPendingShopApps(shopAppsCount.data().count);
        setPendingRestaurantApps(restaurantAppsCount.data().count);
        setPendingMarketApps(marketAppsCount.data().count);
        setPendingRefunds(refundsCount.data().count);
        setPendingHelp(helpCount.data().count);

        // Today's orders count
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayOrdersCount = await getCountFromServer(
          query(
            collection(db, "orders"),
            where("timestamp", ">=", Timestamp.fromDate(today)),
          ),
        );
        setTodayOrders(todayOrdersCount.data().count);

        // Product applications - count docs in collection
        const productAppsCount = await getCountFromServer(
          query(collection(db, "productApplications")),
        );
        setPendingProductApps(productAppsCount.data().count);
      } catch (error) {
        console.error("Error fetching counts:", error);
      }
    };

    fetchCounts();
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
    (path: string, label: string) => {
      logger.navigate(label, { path });
      router.push(`/${path}`);
    },
    [router, logger],
  );

  const handleSearch = useCallback(
    (query: string) => {
      if (query.trim()) {
        logger.search(query.trim());
        router.push(`/searchresults?q=${encodeURIComponent(query.trim())}`);
      }
    },
    [router, logger],
  );

  const toggleCategory = (title: string) => {
    setExpandedCategories((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title],
    );
  };

  const dayCosts = calculateCosts(dailyMetricsData);
  const totalPendingActions =
    pendingShopApps + pendingRestaurantApps + pendingMarketApps + pendingProductApps + pendingRefunds + pendingHelp;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Compact Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-[1600px] mx-auto px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <Shield className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-gray-900">
                  Nar24 Admin
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Kullanici, dukkan, urun ara..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSearch(searchTerm);
                  }}
                  className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                />
              </div>

              {/* User */}
              <div className="flex items-center gap-2 px-2 py-1 bg-gray-50 rounded-lg">
                <User className="w-4 h-4 text-gray-500" />
                <span className="text-xs font-medium text-gray-700 max-w-[120px] truncate">
                  {user?.displayName || user?.email}
                </span>
              </div>

              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all text-xs font-medium"
              >
                <LogOut className="w-3.5 h-3.5" />
                Cikis
              </button>
            </div>
          </div>
        </header>

        {/* Main Layout */}
        <div className="flex">
          {/* Sidebar - More Compact */}
          <aside className="w-56 bg-white border-r border-gray-200 h-[calc(100vh-52px)] overflow-y-auto sticky top-[52px] py-3 px-2">
            <div className="space-y-1">
              {NAV_CATEGORIES.map((cat) => {
                if (cat.adminOnly && !user?.isAdmin) return null;
                const isExpanded = expandedCategories.includes(cat.title);
                const Icon = cat.icon;

                return (
                  <div key={cat.title} className="rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleCategory(cat.title)}
                      className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-gray-50 transition-all rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-gray-500" />
                        <span className="text-xs font-medium text-gray-700">
                          {cat.title}
                        </span>
                      </div>
                      <ChevronDown
                        className={`w-3 h-3 text-gray-400 transition-transform ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    {isExpanded && (
                      <div className="ml-2 mt-0.5 space-y-0.5 border-l border-gray-100 pl-2">
                        {cat.items.map((item) => {
                          const ItemIcon = item.icon;
                          return (
                            <button
                              key={item.path}
                              onClick={() =>
                                handleNavigation(item.path, item.label)
                              }
                              className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded-md text-left transition-all group"
                            >
                              <ItemIcon className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600" />
                              <span className="text-xs text-gray-600 group-hover:text-gray-900">
                                {item.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 p-4 max-w-[1400px]">
            {/* Top Row - Overview Stats */}
            <div className="grid grid-cols-6 gap-3 mb-4">
              <StatCard
                label="Toplam Kullanici"
                value={totalUsers.toLocaleString()}
                icon={Users}
                color="blue"
              />
              <StatCard
                label="Aktif Dukkan"
                value={totalShops.toLocaleString()}
                icon={Store}
                color="green"
              />
              <StatCard
                label="Toplam Urun"
                value={totalProducts.toLocaleString()}
                icon={Package}
                color="purple"
              />
              <StatCard
                label="Toplam Siparis"
                value={totalOrders.toLocaleString()}
                icon={ShoppingCart}
                color="orange"
              />
              <StatCard
                label="Bugunun Siparisleri"
                value={todayOrders}
                icon={Clock}
                color="indigo"
                onClick={() => handleNavigation("orders", "Siparisler")}
              />
              <StatCard
                label="Gunluk Maliyet"
                value={`$${dayCosts.total.toFixed(2)}`}
                icon={DollarSign}
                color="yellow"
                subtext="tahmini"
              />
            </div>

            {/* Pending Actions Alert */}
            {totalPendingActions > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span className="text-sm font-medium text-amber-800">
                      {totalPendingActions} bekleyen islem var
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <PendingCard
                      title="Dukkan Basvurusu"
                      count={pendingShopApps}
                      icon={Store}
                      color="green"
                      path="shopapplications"
                      onClick={handleNavigation}
                    />
                    <PendingCard
                      title="Restoran Basvurusu"
                      count={pendingRestaurantApps}
                      icon={UtensilsCrossed}
                      color="orange"
                      path="restaurantapplications"
                      onClick={handleNavigation}
                    />
                    <PendingCard
                      title="Market Basvurusu"
                      count={pendingMarketApps}
                      icon={ShoppingBag}
                      color="teal"
                      path="marketapplications"
                      onClick={handleNavigation}
                    />
                    <PendingCard
                      title="Urun Basvurusu"
                      count={pendingProductApps}
                      icon={Package}
                      color="purple"
                      path="productapplications"
                      onClick={handleNavigation}
                    />
                    <PendingCard
                      title="Iade Talebi"
                      count={pendingRefunds}
                      icon={FileText}
                      color="red"
                      path="refundforms"
                      onClick={handleNavigation}
                    />
                    <PendingCard
                      title="Destek Talebi"
                      count={pendingHelp}
                      icon={MessageSquare}
                      color="blue"
                      path="helpforms"
                      onClick={handleNavigation}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Two Column Layout */}
            <div className="grid grid-cols-3 gap-4">
              {/* Metrics Chart - Takes 2 columns */}
              <div className="col-span-2 bg-white border border-gray-100 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-gray-500" />
                    <h3 className="text-sm font-semibold text-gray-900">
                      Sistem Metrikleri (24 Saat)
                    </h3>
                  </div>
                  <span className="text-xs text-gray-400">
                    Son guncelleme:{" "}
                    {new Date().toLocaleTimeString("tr-TR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyMetricsData}>
                      <defs>
                        <linearGradient
                          id="colorReads"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#3b82f6"
                            stopOpacity={0.1}
                          />
                          <stop
                            offset="95%"
                            stopColor="#3b82f6"
                            stopOpacity={0}
                          />
                        </linearGradient>
                        <linearGradient
                          id="colorWrites"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#22c55e"
                            stopOpacity={0.1}
                          />
                          <stop
                            offset="95%"
                            stopColor="#22c55e"
                            stopOpacity={0}
                          />
                        </linearGradient>
                        <linearGradient
                          id="colorFuncs"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#a855f7"
                            stopOpacity={0.1}
                          />
                          <stop
                            offset="95%"
                            stopColor="#a855f7"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#f0f0f0"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="time"
                        stroke="#9ca3af"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="#9ca3af"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        width={30}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "white",
                          border: "1px solid #e5e7eb",
                          borderRadius: "6px",
                          fontSize: "12px",
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="reads"
                        stroke="#3b82f6"
                        fill="url(#colorReads)"
                        strokeWidth={1.5}
                        name="Okuma"
                      />
                      <Area
                        type="monotone"
                        dataKey="writes"
                        stroke="#22c55e"
                        fill="url(#colorWrites)"
                        strokeWidth={1.5}
                        name="Yazma"
                      />
                      <Area
                        type="monotone"
                        dataKey="functions"
                        stroke="#a855f7"
                        fill="url(#colorFuncs)"
                        strokeWidth={1.5}
                        name="Fonksiyon"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                {/* Metric Summary */}
                <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-gray-100">
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Toplam Okuma</p>
                    <p className="text-sm font-semibold text-blue-600">
                      {dailyMetricsData
                        .reduce((sum, m) => sum + m.reads, 0)
                        .toLocaleString()}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Toplam Yazma</p>
                    <p className="text-sm font-semibold text-green-600">
                      {dailyMetricsData
                        .reduce((sum, m) => sum + m.writes, 0)
                        .toLocaleString()}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Fonksiyon Cagri</p>
                    <p className="text-sm font-semibold text-purple-600">
                      {dailyMetricsData
                        .reduce((sum, m) => sum + m.functions, 0)
                        .toLocaleString()}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Tahmini Maliyet</p>
                    <p className="text-sm font-semibold text-amber-600">
                      ${dayCosts.total.toFixed(3)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Right Column - Quick Actions & Status */}
              <div className="space-y-4">
                {/* Quick Actions */}
                <div className="bg-white border border-gray-100 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="w-4 h-4 text-gray-500" />
                    <h3 className="text-sm font-semibold text-gray-900">
                      Hizli Islemler
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <QuickAction
                      title="Siparisler"
                      icon={ShoppingCart}
                      color="blue"
                      onClick={() => handleNavigation("orders", "Siparisler")}
                    />
                    <QuickAction
                      title="Teslimat"
                      icon={Truck}
                      color="green"
                      onClick={() => handleNavigation("shipment", "Teslimat")}
                    />
                    <QuickAction
                      title="Bildirim"
                      icon={Bell}
                      color="purple"
                      onClick={() =>
                        handleNavigation("notifications", "Bildirimler")
                      }
                    />
                    <QuickAction
                      title="Aktivite"
                      icon={Activity}
                      color="orange"
                      onClick={() =>
                        handleNavigation("user-activity", "Aktiviteler")
                      }
                    />
                  </div>
                </div>

                {/* System Status */}
                <div className="bg-white border border-gray-100 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Layers className="w-4 h-4 text-gray-500" />
                    <h3 className="text-sm font-semibold text-gray-900">
                      Sistem Durumu
                    </h3>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between py-1.5 border-b border-gray-50">
                      <span className="text-xs text-gray-600">Firestore</span>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-xs font-medium text-green-600">
                          Aktif
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-gray-50">
                      <span className="text-xs text-gray-600">Functions</span>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-xs font-medium text-green-600">
                          Aktif
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-gray-50">
                      <span className="text-xs text-gray-600">Storage</span>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-xs font-medium text-green-600">
                          Aktif
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-xs text-gray-600">Auth</span>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-xs font-medium text-green-600">
                          Aktif
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cost Breakdown */}
                <div className="bg-white border border-gray-100 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <DollarSign className="w-4 h-4 text-gray-500" />
                    <h3 className="text-sm font-semibold text-gray-900">
                      Maliyet Dagilimi
                    </h3>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-600">Okuma</span>
                      <span className="text-xs font-medium text-gray-900">
                        ${dayCosts.reads.toFixed(4)}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{
                          width: `${
                            dayCosts.total > 0
                              ? (dayCosts.reads / dayCosts.total) * 100
                              : 0
                          }%`,
                        }}
                      ></div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-600">Yazma</span>
                      <span className="text-xs font-medium text-gray-900">
                        ${dayCosts.writes.toFixed(4)}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full"
                        style={{
                          width: `${
                            dayCosts.total > 0
                              ? (dayCosts.writes / dayCosts.total) * 100
                              : 0
                          }%`,
                        }}
                      ></div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-600">Fonksiyon</span>
                      <span className="text-xs font-medium text-gray-900">
                        ${dayCosts.functions.toFixed(4)}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 rounded-full"
                        style={{
                          width: `${
                            dayCosts.total > 0
                              ? (dayCosts.functions / dayCosts.total) * 100
                              : 0
                          }%`,
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
