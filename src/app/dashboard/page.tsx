"use client";

import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  LogOut,
  User,
  Shield,
  BarChart3,
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
  CreditCard,
  Percent,
  Archive,
  UtensilsCrossed,
  ShoppingBag,
  Bike,
  ChevronRight,
  Layers,
} from "lucide-react";
import { useState, useCallback } from "react";
import { useActivityLog, createPageLogger } from "@/hooks/useActivityLog";
import { useRouter } from "next/navigation";

const NAV_CATEGORIES = [
  {
    title: "Siparis Yonetimi",
    icon: ShoppingCart,
    color: "blue",
    items: [
      { path: "orders", label: "Ürün Siparisleri", icon: Package },
      { path: "food-orders", label: "Yemek Siparisleri", icon: Package },
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
      {
        path: "weekly-accounting",
        label: "Haftalık Satış Raporları",
        icon: BarChart3,
      },
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
      { path: "restaurant-banner", label: "Restoran Banner", icon: Image },
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
    title: "Admin Yonetimi",
    icon: Shield,
    color: "rose",
    items: [
      {
        path: "admin-create-restaurant",
        label: "Restaurant Olustur",
        icon: UtensilsCrossed,
      },
      { path: "create-user", label: "Kurye Hesapları", icon: Bike },
      { path: "market", label: "Market", icon: ShoppingBag },
    ],
  },
  {
    title: "Dukkan Yonetimi",
    icon: Building2,
    color: "emerald",
    items: [
      { path: "shopapplications", label: "Dukkan Basvurulari", icon: Store },
      {
        path: "restaurantapplications",
        label: "Restoran Basvurulari",
        icon: UtensilsCrossed,
      },
      {
        path: "marketapplications",
        label: "Market Basvurulari",
        icon: ShoppingBag,
      },
    ],
  },
  {
    title: "Analiz Merkezi",
    icon: Activity,
    color: "indigo",
    items: [
      { path: "analytics-center", label: "Genel Analizler", icon: BarChart3 },
      {
        path: "analytics-center/details",
        label: "Aylık Analiz Özeti",
        icon: FileText,
      },
    ],
  },
  {
    title: "Nar24 Yönetimi",
    icon: Settings,
    color: "slate",
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
      { path: "categories", label: "Kategori Yönetimi", icon: Layers }
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
        path: "firestore-read-tracker",
        label: "Firestore Okuma Takibi",
        icon: BarChart3,
      },
      {
        path: "search-functionality",
        label: "Arama Motoru Yönetimi",
        icon: Search,
      },
      {
        path: "firebase-storage-images",
        label: "Storage Gorsel Yonetimi",
        icon: Image,
      },
    ],
  },
];

const COLOR_STYLES: Record<
  string,
  { iconBg: string; iconText: string; ring: string; accent: string }
> = {
  blue: {
    iconBg: "bg-blue-50",
    iconText: "text-blue-600",
    ring: "hover:border-blue-300",
    accent: "bg-blue-500",
  },
  green: {
    iconBg: "bg-green-50",
    iconText: "text-green-600",
    ring: "hover:border-green-300",
    accent: "bg-green-500",
  },
  red: {
    iconBg: "bg-red-50",
    iconText: "text-red-600",
    ring: "hover:border-red-300",
    accent: "bg-red-500",
  },
  teal: {
    iconBg: "bg-teal-50",
    iconText: "text-teal-600",
    ring: "hover:border-teal-300",
    accent: "bg-teal-500",
  },
  purple: {
    iconBg: "bg-purple-50",
    iconText: "text-purple-600",
    ring: "hover:border-purple-300",
    accent: "bg-purple-500",
  },
  orange: {
    iconBg: "bg-orange-50",
    iconText: "text-orange-600",
    ring: "hover:border-orange-300",
    accent: "bg-orange-500",
  },
  rose: {
    iconBg: "bg-rose-50",
    iconText: "text-rose-600",
    ring: "hover:border-rose-300",
    accent: "bg-rose-500",
  },
  emerald: {
    iconBg: "bg-emerald-50",
    iconText: "text-emerald-600",
    ring: "hover:border-emerald-300",
    accent: "bg-emerald-500",
  },
  indigo: {
    iconBg: "bg-indigo-50",
    iconText: "text-indigo-600",
    ring: "hover:border-indigo-300",
    accent: "bg-indigo-500",
  },
  slate: {
    iconBg: "bg-slate-100",
    iconText: "text-slate-600",
    ring: "hover:border-slate-300",
    accent: "bg-slate-500",
  },
};

export default function Dashboard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");

  const { logActivity } = useActivityLog();
  const logger = createPageLogger(logActivity, "Dashboard");

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
    (q: string) => {
      if (q.trim()) {
        logger.search(q.trim());
        router.push(`/searchresults?q=${encodeURIComponent(q.trim())}`);
      }
    },
    [router, logger],
  );

  const visibleCategories = NAV_CATEGORIES.filter(
    (cat) => !cat.adminOnly || user?.isAdmin,
  );

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center shadow-sm">
                <Shield className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-gray-900 leading-tight">
                  Nar24 Admin
                </h1>
                <p className="text-[11px] text-gray-500 leading-tight">
                  Yonetim Paneli
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Kullanici, dukkan, urun ara..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSearch(searchTerm);
                  }}
                  className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm transition-all"
                />
              </div>

              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg">
                <User className="w-4 h-4 text-gray-500" />
                <span className="text-xs font-medium text-gray-700 max-w-[140px] truncate">
                  {user?.displayName || user?.email}
                </span>
              </div>

              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all text-xs font-medium shadow-sm"
              >
                <LogOut className="w-3.5 h-3.5" />
                Cikis
              </button>
            </div>
          </div>
        </header>

        {/* Main */}
        <main className="max-w-[1400px] mx-auto px-6 py-10">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900">
              Hosgeldin, {user?.displayName?.split(" ")[0] || "Admin"}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Islem yapmak istediginiz bolumu secin
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {visibleCategories.map((cat) => {
              const Icon = cat.icon;
              const styles = COLOR_STYLES[cat.color] || COLOR_STYLES.slate;
              return (
                <div
                  key={cat.title}
                  className={`group bg-white border border-gray-200 rounded-xl p-4 shadow-sm transition-all hover:shadow-md ${styles.ring}`}
                >
                  <div className="flex items-center gap-3 pb-3 mb-3 border-b border-gray-100">
                    <div
                      className={`p-2 rounded-lg ${styles.iconBg} ${styles.iconText}`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      {cat.title}
                    </h3>
                  </div>
                  <div className="space-y-1">
                    {cat.items.map((item) => {
                      const ItemIcon = item.icon;
                      return (
                        <button
                          key={item.path}
                          onClick={() =>
                            handleNavigation(item.path, item.label)
                          }
                          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-gray-50 transition-all group/item"
                        >
                          <ItemIcon className="w-4 h-4 text-gray-400 group-hover/item:text-gray-700 transition-colors shrink-0" />
                          <span className="text-xs font-medium text-gray-600 group-hover/item:text-gray-900 flex-1 truncate">
                            {item.label}
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover/item:text-gray-500 transition-all group-hover/item:translate-x-0.5" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
