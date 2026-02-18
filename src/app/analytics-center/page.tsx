"use client";

import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Zap,
  ChevronLeft,
  Circle,
  CheckCircle,
  Info,
  BarChart3,
  TrendingUp,
  TrendingDown,
  MousePointerClick,
  ShoppingCart,
  Store,
  Eye,
  Heart,
  SearchIcon,
  ArrowUpDown,
  Filter,
  Tag,
  Users,
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "../lib/firebase";
import { getApp } from "firebase/app";
import { useRouter } from "next/navigation";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface AnalyticsReport {
  weekId: string;
  weekStart: Timestamp;
  weekEnd: Timestamp;
  weekStartStr: string;
  weekEndStr: string;
  status: "processing" | "completed" | "failed";
  triggeredBy: string;
  completedAt: Timestamp | null;
  createdAt: Timestamp;
  error: string | null;

  // Totals
  totalClicks: number;
  totalViews: number;
  totalCartAdds: number;
  totalFavorites: number;
  totalSearches: number;
  totalPurchaseEvents: number;
  totalEvents: number;
  uniqueProducts: number;
  uniqueUsers: number;

  // Rankings
  topClickedCategories: CategoryEngagement[];
  topClickedSellers: SellerEngagement[];
  topSellersByRevenue: SellerRevenue[];
  topCategoriesBySales: CategorySales[];

  // Insights
  highClickLowSale: CategoryComparison[];
  lowClickHighSale: CategoryComparison[];

  // Search
  topSearchTerms: SearchTerm[];

  // Conversion funnel
  conversionFunnels: ConversionFunnel[];

  // Brand analytics
  topClickedBrands: BrandEngagement[];
  topSellingBrands: BrandSales[];
  brandHighClickLowSale: BrandComparison[];

  // Gender breakdown
  genderBreakdown: GenderBreakdown[];
}

interface CategoryEngagement {
  category: string;
  subcategory: string | null;
  subsubcategory: string | null;
  clicks: number;
  views: number;
  cartAdds: number;
  favorites: number;
  purchases: number;
}

interface SellerEngagement {
  shopId: string;
  sellerName: string | null;
  clicks: number;
  views: number;
  uniqueProducts: number;
}

interface SellerRevenue {
  sellerId: string;
  sellerName: string;
  shopId: string | null;
  isShopProduct: boolean;
  totalRevenue: number;
  orderCount: number;
  totalQuantity: number;
}

interface CategorySales {
  category: string;
  revenue: number;
  quantity: number;
  orderCount: number;
}

interface CategoryComparison {
  category: string;
  clicks: number;
  salesQuantity: number;
  clickToSaleRatio: number;
}

interface SearchTerm {
  term: string;
  count: number;
}

interface ConversionFunnel {
  category: string;
  clicks: number;
  cartAdds: number;
  purchases: number;
  clickToCartRate: number;
  cartToPurchaseRate: number;
  overallConversion: number;
}

interface BrandEngagement {
  brand: string;
  clicks: number;
  views: number;
  cartAdds: number;
  favorites: number;
  purchases: number;
}

interface BrandSales {
  brand: string;
  purchases: number;
  clicks: number;
  conversionRate: number;
}

interface BrandComparison {
  brand: string;
  clicks: number;
  purchases: number;
  clickToPurchaseRatio: number;
}

interface GenderBreakdown {
  gender: string;
  clicks: number;
  views: number;
  cartAdds: number;
  favorites: number;
  purchases: number;
  uniqueUsers: number;
  totalEngagement: number;
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

const MONTHS_TR = [
  "Ocak",
  "Subat",
  "Mart",
  "Nisan",
  "Mayis",
  "Haziran",
  "Temmuz",
  "Agustos",
  "Eylul",
  "Ekim",
  "Kasim",
  "Aralik",
];

function getWeekBoundsLocal(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { monday, sunday };
}

function getWeekId(monday: Date) {
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const d = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getWeeksOfMonth(year: number, month: number) {
  const weeks: { weekId: string; monday: Date; sunday: Date }[] = [];
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const { monday: firstMonday } = getWeekBoundsLocal(firstOfMonth);
  const current = new Date(firstMonday);
  while (current <= lastOfMonth) {
    const monday = new Date(current);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    weeks.push({
      weekId: getWeekId(monday),
      monday: new Date(monday),
      sunday: new Date(sunday),
    });
    current.setDate(current.getDate() + 7);
  }
  return weeks;
}

function isWeekIncomplete(sunday: Date) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const sundayEnd = new Date(sunday);
  sundayEnd.setHours(23, 59, 59, 999);
  return now <= sundayEnd;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(date: Date) {
  return date.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

function formatNumber(n: number) {
  return new Intl.NumberFormat("tr-TR").format(n);
}

function categoryLabel(cat: CategoryEngagement) {
  const parts = [cat.category];
  if (cat.subcategory) parts.push(cat.subcategory);
  if (cat.subsubcategory) parts.push(cat.subsubcategory);
  return parts.join(" › ");
}

const STATUS_CONFIG = {
  completed: {
    label: "Tamamlandi",
    color: "text-emerald-700 bg-emerald-50 border-emerald-200",
    icon: CheckCircle2,
  },
  processing: {
    label: "Isleniyor",
    color: "text-blue-700 bg-blue-50 border-blue-200",
    icon: Loader2,
  },
  failed: {
    label: "Basarisiz",
    color: "text-red-700 bg-red-50 border-red-200",
    icon: XCircle,
  },
  pending: {
    label: "Bekliyor",
    color: "text-gray-500 bg-gray-50 border-gray-200",
    icon: Clock,
  },
} as const;

// ═══════════════════════════════════════════════════════════════
// SMALL COMPONENTS
// ═══════════════════════════════════════════════════════════════

function StatusBadge({ status }: { status: string }) {
  const config =
    STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ||
    STATUS_CONFIG.pending;
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${config.color}`}
    >
      <Icon
        className={`w-3 h-3 ${status === "processing" ? "animate-spin" : ""}`}
      />
      {config.label}
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "text-gray-900",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-gray-400" />
        <span className="text-xs text-gray-500 font-medium">{label}</span>
      </div>
      <p className={`text-xl font-bold ${color}`}>
        {typeof value === "number" ? formatNumber(value) : value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  badge,
}: {
  icon: React.ElementType;
  title: string;
  badge?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-indigo-500" />
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      {badge && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-600 border border-indigo-100">
          {badge}
        </span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════

export default function AnalyticsCenterPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [weekReports, setWeekReports] = useState<Map<string, AnalyticsReport>>(
    new Map(),
  );
  const [loadingReports, setLoadingReports] = useState(false);
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [expandedWeekId, setExpandedWeekId] = useState<string | null>(null);
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [forceRecalculate, setForceRecalculate] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // Tab for expanded view
  const [activeTab, setActiveTab] = useState<
    | "categories"
    | "sellers"
    | "sales"
    | "insights"
    | "search"
    | "funnel"
    | "brands"
    | "gender"
  >("categories");

  const functions = useMemo(() => {
    try {
      return getFunctions(getApp(), "europe-west3");
    } catch {
      return null;
    }
  }, []);

  const monthWeeks = useMemo(
    () => getWeeksOfMonth(selectedYear, selectedMonth),
    [selectedYear, selectedMonth],
  );

  // ── Fetch reports ──────────────────────────────────────────
  const fetchReports = useCallback(async () => {
    if (!user || monthWeeks.length === 0) return;
    setLoadingReports(true);
    try {
      const weekIds = monthWeeks.map((w) => w.weekId);
      const reportsMap = new Map<string, AnalyticsReport>();
      for (let i = 0; i < weekIds.length; i += 30) {
        const chunk = weekIds.slice(i, i + 30);
        const q = query(
          collection(db, "admin_analytics"),
          where("weekId", "in", chunk),
        );
        const snap = await getDocs(q);
        snap.forEach((doc) =>
          reportsMap.set(doc.id, doc.data() as AnalyticsReport),
        );
      }
      setWeekReports(reportsMap);
    } catch (err) {
      console.error("Error fetching analytics reports:", err);
    } finally {
      setLoadingReports(false);
    }
  }, [user, monthWeeks]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // ── Calculate selected week ────────────────────────────────
  const handleCalculateSelected = useCallback(async () => {
    if (!functions || !selectedWeekId) return;
    setTriggerLoading(true);
    try {
      const fn = httpsCallable(functions, "triggerWeeklyAnalytics");
      const res = await fn({ weekId: selectedWeekId, force: forceRecalculate });
      const data = res.data as {
        success: boolean;
        result: { status: string; reason?: string };
      };
      if (data.success) {
        if (data.result.status === "skipped") {
          setToast({
            message: `${selectedWeekId} zaten tamamlanmis. "Zorla Yeniden Hesapla" isaretleyip tekrar deneyin.`,
            type: "error",
          });
        } else {
          setToast({
            message: `${selectedWeekId} analiz raporu olusturuldu!`,
            type: "success",
          });
        }
        fetchReports();
      }
    } catch (err: unknown) {
      setToast({
        message: `Hata: ${err instanceof Error ? err.message : "Bilinmeyen hata"}`,
        type: "error",
      });
    } finally {
      setTriggerLoading(false);
    }
  }, [functions, selectedWeekId, forceRecalculate, fetchReports]);

  // ── Navigation ─────────────────────────────────────────────
  const goToPrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((y) => y - 1);
    } else setSelectedMonth((m) => m - 1);
    setExpandedWeekId(null);
    setSelectedWeekId(null);
  };
  const goToNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else setSelectedMonth((m) => m + 1);
    setExpandedWeekId(null);
    setSelectedWeekId(null);
  };

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const selectedWeekLabel = useMemo(() => {
    if (!selectedWeekId) return null;
    const w = monthWeeks.find((w) => w.weekId === selectedWeekId);
    return w
      ? `${formatDate(w.monday)} – ${formatDate(w.sunday)}`
      : selectedWeekId;
  }, [selectedWeekId, monthWeeks]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push("/")}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-gray-600" />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <BarChart3 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h1 className="text-base font-bold text-gray-900">
                    Analiz Merkezi
                  </h1>
                  <p className="text-xs text-gray-500">
                    Haftalik etkilesim ve satis analizleri
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none mr-1">
                <input
                  type="checkbox"
                  checked={forceRecalculate}
                  onChange={(e) => setForceRecalculate(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                />
                Zorla Yeniden Hesapla
              </label>
              <button
                onClick={handleCalculateSelected}
                disabled={!selectedWeekId || triggerLoading}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  selectedWeekId
                    ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                } disabled:opacity-50`}
              >
                {triggerLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5" />
                )}
                {selectedWeekId
                  ? `Analiz Hesapla (${selectedWeekLabel})`
                  : "Secilen Haftayi Analiz Et"}
              </button>
            </div>
          </div>
        </header>

        {/* Toast */}
        {toast && (
          <div
            className={`fixed top-16 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium max-w-md ${
              toast.type === "success"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {toast.message}
          </div>
        )}

        <main className="max-w-[1400px] mx-auto p-4">
          {/* Month Navigator */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
              <button
                onClick={goToPrevMonth}
                className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-500" />
                <h2 className="text-sm font-semibold text-gray-900">
                  {MONTHS_TR[selectedMonth]} {selectedYear}
                </h2>
              </div>
              <button
                onClick={goToNextMonth}
                className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            </div>

            {loadingReports ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {monthWeeks.map((week) => {
                  const report = weekReports.get(week.weekId);
                  const isExpanded = expandedWeekId === week.weekId;
                  const isSelected = selectedWeekId === week.weekId;
                  const hasReport = !!report;
                  const isCompleted = report?.status === "completed";
                  const isFutureWeek = week.monday > new Date();
                  const incomplete =
                    isCompleted && isWeekIncomplete(week.sunday);

                  return (
                    <div key={week.weekId}>
                      {/* Week Row */}
                      <div
                        className={`flex items-center px-4 py-3 transition-colors ${
                          isSelected
                            ? "bg-indigo-50/60"
                            : isExpanded
                              ? "bg-gray-50/80"
                              : "hover:bg-gray-50"
                        }`}
                      >
                        {/* Select */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isFutureWeek)
                              setSelectedWeekId((p) =>
                                p === week.weekId ? null : week.weekId,
                              );
                          }}
                          disabled={isFutureWeek}
                          className={`mr-3 flex-shrink-0 transition-colors ${
                            isFutureWeek
                              ? "text-gray-200 cursor-not-allowed"
                              : isSelected
                                ? "text-indigo-600"
                                : "text-gray-300 hover:text-gray-400"
                          }`}
                        >
                          {isSelected ? (
                            <CheckCircle className="w-5 h-5" />
                          ) : (
                            <Circle className="w-5 h-5" />
                          )}
                        </button>

                        {/* Expand */}
                        <button
                          onClick={() => {
                            if (hasReport && report.status !== "processing") {
                              setExpandedWeekId(
                                isExpanded ? null : week.weekId,
                              );
                              setActiveTab("categories");
                            }
                          }}
                          className={`w-6 mr-2 flex-shrink-0 ${
                            hasReport && report.status !== "processing"
                              ? "cursor-pointer text-gray-400 hover:text-gray-600"
                              : "text-transparent cursor-default"
                          }`}
                        >
                          {hasReport && report.status !== "processing" ? (
                            isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )
                          ) : (
                            <span className="w-4 h-4 block" />
                          )}
                        </button>

                        {/* Date */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-900">
                              {formatDate(week.monday)} –{" "}
                              {formatDate(week.sunday)}
                            </span>
                            <span className="text-xs text-gray-400 font-mono">
                              {week.weekId}
                            </span>
                            {incomplete && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                <AlertTriangle className="w-3 h-3" /> Eksik veri
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Status */}
                        <div className="w-28 flex-shrink-0 px-2">
                          {hasReport ? (
                            <StatusBadge status={report.status} />
                          ) : isFutureWeek ? (
                            <span className="text-xs text-gray-400">
                              Gelecek
                            </span>
                          ) : (
                            <StatusBadge status="pending" />
                          )}
                        </div>

                        {/* Quick stats */}
                        <div className="flex items-center gap-6 flex-shrink-0">
                          {isCompleted ? (
                            <>
                              <div className="text-right w-24">
                                <p className="text-xs text-gray-500">
                                  Etkilesim
                                </p>
                                <p className="text-sm font-semibold text-gray-900">
                                  {formatNumber(report.totalEvents)}
                                </p>
                              </div>
                              <div className="text-right w-20">
                                <p className="text-xs text-gray-500">
                                  Tiklanma
                                </p>
                                <p className="text-sm font-semibold text-gray-900">
                                  {formatNumber(report.totalClicks)}
                                </p>
                              </div>
                              <div className="text-right w-20">
                                <p className="text-xs text-gray-500">
                                  Kullanici
                                </p>
                                <p className="text-sm font-semibold text-gray-900">
                                  {formatNumber(report.uniqueUsers)}
                                </p>
                              </div>
                              <div className="text-right w-20">
                                <p className="text-xs text-gray-500">Arama</p>
                                <p className="text-sm font-semibold text-indigo-600">
                                  {formatNumber(report.totalSearches)}
                                </p>
                              </div>
                            </>
                          ) : report?.status === "failed" ? (
                            <div className="text-right">
                              <p className="text-xs text-red-500 max-w-[200px] truncate">
                                {report.error}
                              </p>
                            </div>
                          ) : (
                            <div className="w-[284px]" />
                          )}
                        </div>
                      </div>

                      {/* Expanded Analytics */}
                      {isExpanded && isCompleted && (
                        <ExpandedAnalytics
                          report={report}
                          incomplete={incomplete}
                          activeTab={activeTab}
                          setActiveTab={setActiveTab}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}

// ═══════════════════════════════════════════════════════════════
// EXPANDED ANALYTICS PANEL
// ═══════════════════════════════════════════════════════════════

function ExpandedAnalytics({
  report,
  incomplete,
  activeTab,
  setActiveTab,
}: {
  report: AnalyticsReport;
  incomplete: boolean;
  activeTab: string;
  setActiveTab: (
    t:
      | "categories"
      | "sellers"
      | "sales"
      | "insights"
      | "search"
      | "funnel"
      | "brands"
      | "gender",
  ) => void;
}) {
  const tabs = [
    { key: "categories", label: "Kategori Analizi", icon: BarChart3 },
    { key: "funnel", label: "Donusum Hunisi", icon: Filter },
    { key: "brands", label: "Marka Analizi", icon: Tag },
    { key: "gender", label: "Cinsiyet Analizi", icon: Users },
    { key: "sellers", label: "Satici Etkilesimi", icon: Store },
    { key: "sales", label: "Satis Siralamasi", icon: ShoppingCart },
    { key: "insights", label: "Icerikler", icon: ArrowUpDown },
    { key: "search", label: "Arama Terimleri", icon: SearchIcon },
  ] as const;

  return (
    <div className="bg-gray-50/80 border-t border-gray-100 px-4 py-4">
      {/* Incomplete warning */}
      {incomplete && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg mb-3">
          <Info className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-xs text-amber-800">
            Bu hafta henuz bitmedi. Gosterilen veriler kismi olabilir.
          </p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-4 lg:grid-cols-8 gap-3 mb-4">
        <StatCard icon={Eye} label="Goruntulenme" value={report.totalViews} />
        <StatCard
          icon={MousePointerClick}
          label="Tiklanma"
          value={report.totalClicks}
        />
        <StatCard
          icon={ShoppingCart}
          label="Sepete Ekleme"
          value={report.totalCartAdds}
        />
        <StatCard icon={Heart} label="Favori" value={report.totalFavorites} />
        <StatCard
          icon={SearchIcon}
          label="Arama"
          value={report.totalSearches}
        />
        <StatCard
          icon={BarChart3}
          label="Toplam Etkilesim"
          value={report.totalEvents}
          color="text-indigo-600"
        />
        <StatCard
          icon={Store}
          label="Urun Cesidi"
          value={report.uniqueProducts}
        />
        <StatCard icon={Users} label="Kullanici" value={report.uniqueUsers} />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-gray-200 pb-px overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-all border-b-2 whitespace-nowrap ${
                isActive
                  ? "border-indigo-600 text-indigo-700 bg-white"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === "categories" && (
        <CategoriesTab data={report.topClickedCategories} />
      )}
      {activeTab === "funnel" && <FunnelTab data={report.conversionFunnels} />}
      {activeTab === "brands" && (
        <BrandsTab
          clicked={report.topClickedBrands}
          selling={report.topSellingBrands}
          insight={report.brandHighClickLowSale}
        />
      )}
      {activeTab === "gender" && <GenderTab data={report.genderBreakdown} />}
      {activeTab === "sellers" && (
        <SellersTab data={report.topClickedSellers} />
      )}
      {activeTab === "sales" && (
        <SalesTab
          sellers={report.topSellersByRevenue}
          categories={report.topCategoriesBySales}
        />
      )}
      {activeTab === "insights" && (
        <InsightsTab
          high={report.highClickLowSale}
          low={report.lowClickHighSale}
        />
      )}
      {activeTab === "search" && <SearchTab data={report.topSearchTerms} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: Categories (Most Clicked Categories)
// ═══════════════════════════════════════════════════════════════

function CategoriesTab({ data }: { data: CategoryEngagement[] }) {
  if (!data || data.length === 0)
    return <EmptyState text="Kategori verisi yok" />;

  const maxClicks = data[0]?.clicks || 1;

  return (
    <div>
      <SectionHeader
        icon={MousePointerClick}
        title="En Cok Tiklanan Kategoriler"
        badge={`Top ${data.length}`}
      />
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 w-8">
                #
              </th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">
                Kategori
              </th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-24">
                Tiklanma
              </th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-24">
                Goruntulenme
              </th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-24">
                Sepete Ekleme
              </th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                Favori
              </th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-500 w-36">
                Oran
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((cat, idx) => (
              <tr key={idx} className="hover:bg-gray-50 transition-colors">
                <td className="px-3 py-2.5 text-xs text-gray-400">{idx + 1}</td>
                <td className="px-3 py-2.5">
                  <span className="text-sm font-medium text-gray-900">
                    {categoryLabel(cat)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-semibold text-gray-900">
                  {formatNumber(cat.clicks)}
                </td>
                <td className="px-3 py-2.5 text-right text-gray-700">
                  {formatNumber(cat.views)}
                </td>
                <td className="px-3 py-2.5 text-right text-gray-700">
                  {formatNumber(cat.cartAdds)}
                </td>
                <td className="px-3 py-2.5 text-right text-gray-700">
                  {formatNumber(cat.favorites)}
                </td>
                <td className="px-3 py-2.5">
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-indigo-500 h-2 rounded-full transition-all"
                      style={{ width: `${(cat.clicks / maxClicks) * 100}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: Sellers (Most Clicked Sellers)
// ═══════════════════════════════════════════════════════════════

function SellersTab({ data }: { data: SellerEngagement[] }) {
  if (!data || data.length === 0)
    return <EmptyState text="Satici verisi yok" />;

  const maxClicks = data[0]?.clicks || 1;

  return (
    <div>
      <SectionHeader
        icon={Store}
        title="En Cok Tiklanan Saticilar"
        badge={`Top ${data.length}`}
      />
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 w-8">
                #
              </th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">
                Satici
              </th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-24">
                Tiklanma
              </th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-24">
                Goruntulenme
              </th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-24">
                Urun Cesidi
              </th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-500 w-36">
                Oran
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((s, idx) => (
              <tr key={idx} className="hover:bg-gray-50 transition-colors">
                <td className="px-3 py-2.5 text-xs text-gray-400">{idx + 1}</td>
                <td className="px-3 py-2.5">
                  <p className="font-medium text-gray-900 text-sm">
                    {s.sellerName || "Bilinmeyen"}
                  </p>
                  <p className="text-xs text-gray-400 font-mono truncate max-w-[200px]">
                    {s.shopId}
                  </p>
                </td>
                <td className="px-3 py-2.5 text-right font-semibold text-gray-900">
                  {formatNumber(s.clicks)}
                </td>
                <td className="px-3 py-2.5 text-right text-gray-700">
                  {formatNumber(s.views)}
                </td>
                <td className="px-3 py-2.5 text-right text-gray-700">
                  {formatNumber(s.uniqueProducts)}
                </td>
                <td className="px-3 py-2.5">
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-purple-500 h-2 rounded-full transition-all"
                      style={{ width: `${(s.clicks / maxClicks) * 100}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: Sales Rankings
// ═══════════════════════════════════════════════════════════════

function SalesTab({
  sellers,
  categories,
}: {
  sellers: SellerRevenue[];
  categories: CategorySales[];
}) {
  const hasSellers = sellers && sellers.length > 0;
  const hasCategories = categories && categories.length > 0;

  if (!hasSellers && !hasCategories)
    return (
      <EmptyState text="Satis verisi bulunamadi. Muhasebe raporu olusturulmus mu?" />
    );

  return (
    <div className="space-y-6">
      {/* Top sellers by revenue */}
      {hasSellers && (
        <div>
          <SectionHeader
            icon={TrendingUp}
            title="En Cok Satan Saticilar"
            badge={`Top ${sellers.length}`}
          />
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 w-8">
                    #
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">
                    Satici
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-28">
                    Ciro
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                    Siparis
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                    Adet
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sellers.map((s, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2.5 text-xs text-gray-400">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-gray-900 text-sm">
                        {s.sellerName}
                      </p>
                      <p className="text-xs text-gray-400 font-mono truncate max-w-[200px]">
                        {s.sellerId}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-emerald-600">
                      {formatCurrency(s.totalRevenue)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700">
                      {formatNumber(s.orderCount)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700">
                      {formatNumber(s.totalQuantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top categories by sales */}
      {hasCategories && (
        <div>
          <SectionHeader
            icon={ShoppingCart}
            title="En Cok Satan Kategoriler"
            badge={`Top ${categories.length}`}
          />
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 w-8">
                    #
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">
                    Kategori
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-28">
                    Ciro
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                    Adet
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                    Siparis
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {categories.map((c, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2.5 text-xs text-gray-400">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-gray-900">
                      {c.category}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-emerald-600">
                      {formatCurrency(c.revenue)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700">
                      {formatNumber(c.quantity)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700">
                      {formatNumber(c.orderCount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: Insights (High Click Low Sale & vice versa)
// ═══════════════════════════════════════════════════════════════

function InsightsTab({
  high,
  low,
}: {
  high: CategoryComparison[];
  low: CategoryComparison[];
}) {
  const hasHigh = high && high.length > 0;
  const hasLow = low && low.length > 0;

  if (!hasHigh && !hasLow)
    return (
      <EmptyState text="Yeterli veri yok. Hem etkilesim hem satis verisi gerekir." />
    );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* High click, low sale */}
      <div>
        <SectionHeader
          icon={TrendingDown}
          title="Cok Tiklanan, Az Satan"
          badge="Firsat"
        />
        <p className="text-xs text-gray-500 mb-2">
          Yuksek ilgi gorup satisa donusmeyen kategoriler. Fiyat, stok veya urun
          kalitesi kontrol edilmeli.
        </p>
        {hasHigh ? (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-red-50/50 border-b border-gray-200">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">
                    Kategori
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                    Tik
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                    Satis
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-24">
                    Tik/Satis
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {high.map((c, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-900 text-sm">
                      {c.category}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {formatNumber(c.clicks)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {formatNumber(c.salesQuantity)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                          c.clickToSaleRatio >= 999
                            ? "bg-red-100 text-red-700"
                            : c.clickToSaleRatio > 50
                              ? "bg-orange-100 text-orange-700"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {c.clickToSaleRatio >= 999
                          ? "∞"
                          : `${c.clickToSaleRatio}x`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-gray-400">Veri yok</p>
        )}
      </div>

      {/* Low click, high sale */}
      <div>
        <SectionHeader
          icon={TrendingUp}
          title="Az Tiklanan, Cok Satan"
          badge="Gizli Sampiyon"
        />
        <p className="text-xs text-gray-500 mb-2">
          Az goruntulenmesine ragmen iyi satan kategoriler. Daha fazla one
          cikarilmali.
        </p>
        {hasLow ? (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-emerald-50/50 border-b border-gray-200">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">
                    Kategori
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                    Tik
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                    Satis
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-24">
                    Tik/Satis
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {low.map((c, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-900 text-sm">
                      {c.category}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {formatNumber(c.clicks)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {formatNumber(c.salesQuantity)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                        {c.clickToSaleRatio}x
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-gray-400">Veri yok</p>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: Search Terms
// ═══════════════════════════════════════════════════════════════

function SearchTab({ data }: { data: SearchTerm[] }) {
  if (!data || data.length === 0) return <EmptyState text="Arama verisi yok" />;

  const maxCount = data[0]?.count || 1;

  return (
    <div>
      <SectionHeader
        icon={SearchIcon}
        title="En Cok Aranan Terimler"
        badge={`Top ${data.length}`}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {data.map((s, idx) => (
          <div
            key={idx}
            className="bg-white rounded-lg border border-gray-200 px-3 py-2.5 flex items-center gap-3"
          >
            <span className="text-xs text-gray-400 font-mono w-6 text-right flex-shrink-0">
              {idx + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                &ldquo;{s.term}&rdquo;
              </p>
              <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                <div
                  className="bg-indigo-400 h-1.5 rounded-full transition-all"
                  style={{ width: `${(s.count / maxCount) * 100}%` }}
                />
              </div>
            </div>
            <span className="text-xs font-semibold text-indigo-600 flex-shrink-0">
              {formatNumber(s.count)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: Conversion Funnel
// ═══════════════════════════════════════════════════════════════

function FunnelTab({ data }: { data: ConversionFunnel[] }) {
  if (!data || data.length === 0)
    return <EmptyState text="Donusum hunisi verisi yok" />;

  return (
    <div>
      <SectionHeader
        icon={Filter}
        title="Kategori Bazli Donusum Hunisi"
        badge={`Top ${data.length}`}
      />
      <p className="text-xs text-gray-500 mb-3">
        Her kategori icin tiklanma → sepete ekleme → satin alma donusum
        oranlari.
      </p>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 w-8">
                #
              </th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">
                Kategori
              </th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                <span className="flex items-center justify-end gap-1">
                  <MousePointerClick className="w-3 h-3" /> Tik
                </span>
              </th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-16">
                → %
              </th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                <span className="flex items-center justify-end gap-1">
                  <ShoppingCart className="w-3 h-3" /> Sepet
                </span>
              </th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-16">
                → %
              </th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                <span className="flex items-center justify-end gap-1">
                  <CheckCircle className="w-3 h-3" /> Satis
                </span>
              </th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                Genel %
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((f, idx) => (
              <tr key={idx} className="hover:bg-gray-50 transition-colors">
                <td className="px-3 py-2.5 text-xs text-gray-400">{idx + 1}</td>
                <td className="px-3 py-2.5 font-medium text-gray-900 text-sm">
                  {f.category}
                </td>
                <td className="px-3 py-2.5 text-right text-gray-700">
                  {formatNumber(f.clicks)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <RateBadge rate={f.clickToCartRate} />
                </td>
                <td className="px-3 py-2.5 text-right text-gray-700">
                  {formatNumber(f.cartAdds)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <RateBadge rate={f.cartToPurchaseRate} />
                </td>
                <td className="px-3 py-2.5 text-right font-semibold text-gray-900">
                  {formatNumber(f.purchases)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span
                    className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                      f.overallConversion >= 5
                        ? "bg-emerald-100 text-emerald-700"
                        : f.overallConversion >= 1
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                    }`}
                  >
                    %{f.overallConversion}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RateBadge({ rate }: { rate: number }) {
  const color =
    rate >= 30
      ? "text-emerald-600"
      : rate >= 10
        ? "text-amber-600"
        : "text-red-500";
  return <span className={`text-xs font-medium ${color}`}>%{rate}</span>;
}

// ═══════════════════════════════════════════════════════════════
// TAB: Brand Analytics
// ═══════════════════════════════════════════════════════════════

function BrandsTab({
  clicked,
  selling,
  insight,
}: {
  clicked: BrandEngagement[];
  selling: BrandSales[];
  insight: BrandComparison[];
}) {
  const hasClicked = clicked && clicked.length > 0;
  const hasSelling = selling && selling.length > 0;
  const hasInsight = insight && insight.length > 0;

  if (!hasClicked && !hasSelling)
    return (
      <EmptyState text="Marka verisi yok. Urunlerde brand alani tanimli mi?" />
    );

  const maxClicks = hasClicked ? clicked[0].clicks : 1;

  return (
    <div className="space-y-6">
      {/* Top clicked brands */}
      {hasClicked && (
        <div>
          <SectionHeader
            icon={MousePointerClick}
            title="En Cok Tiklanan Markalar"
            badge={`Top ${clicked.length}`}
          />
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 w-8">
                    #
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">
                    Marka
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                    Tiklanma
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                    Grntle
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                    Sepet
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                    Favori
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                    Satis
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-500 w-32">
                    Oran
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {clicked.map((b, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2.5 text-xs text-gray-400">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-gray-900 text-sm">
                      {b.brand}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-gray-900">
                      {formatNumber(b.clicks)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700">
                      {formatNumber(b.views)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700">
                      {formatNumber(b.cartAdds)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700">
                      {formatNumber(b.favorites)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-emerald-600 font-medium">
                      {formatNumber(b.purchases)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className="bg-orange-500 h-2 rounded-full transition-all"
                          style={{ width: `${(b.clicks / maxClicks) * 100}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top selling brands */}
      {hasSelling && (
        <div>
          <SectionHeader
            icon={TrendingUp}
            title="En Cok Satan Markalar"
            badge={`Top ${selling.length}`}
          />
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 w-8">
                    #
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">
                    Marka
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                    Satis
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                    Tiklanma
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-24">
                    Donusum %
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {selling.map((b, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2.5 text-xs text-gray-400">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-gray-900 text-sm">
                      {b.brand}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-emerald-600">
                      {formatNumber(b.purchases)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700">
                      {formatNumber(b.clicks)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span
                        className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                          b.conversionRate >= 10
                            ? "bg-emerald-100 text-emerald-700"
                            : b.conversionRate >= 3
                              ? "bg-amber-100 text-amber-700"
                              : "bg-red-100 text-red-700"
                        }`}
                      >
                        %{b.conversionRate}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Brand insight: high click low sale */}
      {hasInsight && (
        <div>
          <SectionHeader
            icon={TrendingDown}
            title="Cok Tiklanan, Az Satan Markalar"
            badge="Dikkat"
          />
          <p className="text-xs text-gray-500 mb-2">
            Yuksek ilgi gorup satisa donusmeyen markalar. Fiyat veya urun
            kalitesi kontrol edilmeli.
          </p>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-red-50/50 border-b border-gray-200">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">
                    Marka
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                    Tik
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                    Satis
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-24">
                    Tik/Satis
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {insight.map((b, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-900 text-sm">
                      {b.brand}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {formatNumber(b.clicks)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {formatNumber(b.purchases)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                          b.clickToPurchaseRatio >= 999
                            ? "bg-red-100 text-red-700"
                            : b.clickToPurchaseRatio > 50
                              ? "bg-orange-100 text-orange-700"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {b.clickToPurchaseRatio >= 999
                          ? "∞"
                          : `${b.clickToPurchaseRatio}x`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: Gender Breakdown
// ═══════════════════════════════════════════════════════════════

const GENDER_LABELS: Record<string, string> = {
  male: "Erkek",
  female: "Kadin",
  unisex: "Unisex",
  kids: "Cocuk",
  boy: "Erkek Cocuk",
  girl: "Kiz Cocuk",
};

const GENDER_COLORS: Record<string, string> = {
  male: "bg-blue-500",
  female: "bg-pink-500",
  unisex: "bg-purple-500",
  kids: "bg-amber-500",
  boy: "bg-sky-500",
  girl: "bg-rose-500",
};

function GenderTab({ data }: { data: GenderBreakdown[] }) {
  if (!data || data.length === 0)
    return (
      <EmptyState text="Cinsiyet verisi yok. Urunlerde gender alani tanimli mi?" />
    );

  const totalEngagement = data.reduce((s, g) => s + g.totalEngagement, 0);

  return (
    <div className="space-y-6">
      <SectionHeader icon={Users} title="Cinsiyet Bazli Etkilesim Dagilimi" />

      {/* Visual distribution bar */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex rounded-full h-6 overflow-hidden mb-3">
          {data.map((g) => {
            const pct =
              totalEngagement > 0
                ? (g.totalEngagement / totalEngagement) * 100
                : 0;
            const color = GENDER_COLORS[g.gender] || "bg-gray-400";
            return pct > 0 ? (
              <div
                key={g.gender}
                className={`${color} transition-all relative group`}
                style={{ width: `${pct}%` }}
                title={`${GENDER_LABELS[g.gender] || g.gender}: %${pct.toFixed(1)}`}
              >
                {pct > 8 && (
                  <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold">
                    %{pct.toFixed(0)}
                  </span>
                )}
              </div>
            ) : null;
          })}
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {data.map((g) => {
            const color = GENDER_COLORS[g.gender] || "bg-gray-400";
            const pct =
              totalEngagement > 0
                ? ((g.totalEngagement / totalEngagement) * 100).toFixed(1)
                : "0";
            return (
              <div key={g.gender} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded-full ${color}`} />
                <span className="text-xs text-gray-700 font-medium">
                  {GENDER_LABELS[g.gender] || g.gender} — %{pct}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detailed breakdown table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">
                Cinsiyet
              </th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                Goruntulenme
              </th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                Tiklanma
              </th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                Sepet
              </th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                Favori
              </th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                Satis
              </th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                Kullanici
              </th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-24">
                Toplam
              </th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-16">
                Pay %
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((g) => {
              const pct =
                totalEngagement > 0
                  ? ((g.totalEngagement / totalEngagement) * 100).toFixed(1)
                  : "0";
              return (
                <tr
                  key={g.gender}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-3 h-3 rounded-full ${GENDER_COLORS[g.gender] || "bg-gray-400"}`}
                      />
                      <span className="font-medium text-gray-900">
                        {GENDER_LABELS[g.gender] || g.gender}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-700">
                    {formatNumber(g.views)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-700">
                    {formatNumber(g.clicks)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-700">
                    {formatNumber(g.cartAdds)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-700">
                    {formatNumber(g.favorites)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-emerald-600">
                    {formatNumber(g.purchases)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-700">
                    {formatNumber(g.uniqueUsers)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-gray-900">
                    {formatNumber(g.totalEngagement)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="text-xs font-semibold text-indigo-600">
                      %{pct}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// EMPTY STATE
// ═══════════════════════════════════════════════════════════════

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-10">
      <BarChart3 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
      <p className="text-sm text-gray-400">{text}</p>
    </div>
  );
}
