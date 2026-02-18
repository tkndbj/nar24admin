"use client";

import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Loader2,
  Play,
  RefreshCw,
  Search,
  ShoppingCart,
  Store,
  TrendingUp,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Zap,
  ChevronLeft,
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  Timestamp,
  DocumentSnapshot,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "../lib/firebase";
import { getApp } from "firebase/app";
import { useRouter } from "next/navigation";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface WeekReport {
  weekId: string;
  weekStart: Timestamp;
  weekEnd: Timestamp;
  weekStartStr: string;
  weekEndStr: string;
  status: "processing" | "completed" | "failed";
  triggeredBy: string;
  totalRevenue: number;
  totalCommission: number;
  netRevenue: number;
  totalQuantity: number;
  totalOrderCount: number;
  totalItemCount: number;
  sellerCount: number;
  shopCount: number;
  individualSellerCount: number;
  completedAt: Timestamp | null;
  createdAt: Timestamp;
  error: string | null;
}

interface ShopSale {
  sellerId: string;
  shopId: string | null;
  sellerName: string;
  isShopProduct: boolean;
  totalRevenue: number;
  totalQuantity: number;
  totalCommission: number;
  netRevenue: number;
  totalItemCount: number;
  orderCount: number;
  averageOrderValue: number;
  categories: Record<
    string,
    { revenue: number; quantity: number; count: number }
  >;
}

interface BackfillResult {
  weekId: string;
  status: string;
  reason?: string;
  error?: string;
  sellerCount?: number;
  orderCount?: number;
  totalRevenue?: number;
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

/** Generate all weeks that overlap with the given month */
function getWeeksOfMonth(year: number, month: number) {
  const weeks: { weekId: string; monday: Date; sunday: Date }[] = [];
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);

  // Start from the Monday of the week containing the 1st
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
// COMPONENTS
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

function StatMini({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-emerald-50 text-emerald-600",
    purple: "bg-purple-50 text-purple-600",
    orange: "bg-orange-50 text-orange-600",
    red: "bg-red-50 text-red-600",
  };
  return (
    <div className="bg-white border border-gray-100 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        <div className={`p-1 rounded ${colors[color]}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className="text-lg font-bold text-gray-900">{value}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════

export default function AccountingPage() {
  const { user } = useAuth();
  const router = useRouter();

  // Month navigation
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());

  // Reports data
  const [weekReports, setWeekReports] = useState<Map<string, WeekReport>>(
    new Map(),
  );
  const [loadingReports, setLoadingReports] = useState(false);

  // Expanded week for shop sales
  const [expandedWeekId, setExpandedWeekId] = useState<string | null>(null);
  const [shopSales, setShopSales] = useState<ShopSale[]>([]);
  const [loadingShops, setLoadingShops] = useState(false);
  const [shopSearchTerm, setShopSearchTerm] = useState("");
  const [, setShopPage] = useState(0);
  const [lastShopDoc, setLastShopDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMoreShops, setHasMoreShops] = useState(false);
  const [shopSortField, setShopSortField] = useState<
    "totalRevenue" | "orderCount" | "totalQuantity"
  >("totalRevenue");

  // Manual trigger states
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillResults, setBackfillResults] = useState<
    BackfillResult[] | null
  >(null);
  const [showBackfillModal, setShowBackfillModal] = useState(false);
  const [backfillStartDate, setBackfillStartDate] = useState("");
  const [backfillEndDate, setBackfillEndDate] = useState("");
  const [forceRecalculate, setForceRecalculate] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const SHOPS_PER_PAGE = 20;

  // Firebase Functions instance
  const functions = useMemo(() => {
    try {
      return getFunctions(getApp(), "europe-west3");
    } catch {
      return null;
    }
  }, []);

  // Weeks for the selected month
  const monthWeeks = useMemo(
    () => getWeeksOfMonth(selectedYear, selectedMonth),
    [selectedYear, selectedMonth],
  );

  // ── Fetch reports for visible weeks ────────────────────────
  const fetchReports = useCallback(async () => {
    if (!user || monthWeeks.length === 0) return;
    setLoadingReports(true);

    try {
      const weekIds = monthWeeks.map((w) => w.weekId);
      const reportsMap = new Map<string, WeekReport>();

      // Firestore `in` query limited to 30 items — chunk if needed
      for (let i = 0; i < weekIds.length; i += 30) {
        const chunk = weekIds.slice(i, i + 30);
        const q = query(
          collection(db, "weekly_sales_accounting"),
          where("weekId", "in", chunk),
        );
        const snap = await getDocs(q);
        snap.forEach((doc) => {
          reportsMap.set(doc.id, doc.data() as WeekReport);
        });
      }

      setWeekReports(reportsMap);
    } catch (err) {
      console.error("Error fetching week reports:", err);
    } finally {
      setLoadingReports(false);
    }
  }, [user, monthWeeks]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // ── Fetch shop sales for expanded week ─────────────────────
  const fetchShopSales = useCallback(
    async (weekId: string, reset = true) => {
      setLoadingShops(true);
      try {
        const baseRef = collection(
          db,
          "weekly_sales_accounting",
          weekId,
          "shop_sales",
        );
        let q = query(
          baseRef,
          orderBy(shopSortField, "desc"),
          limit(SHOPS_PER_PAGE),
        );

        if (!reset && lastShopDoc) {
          q = query(
            baseRef,
            orderBy(shopSortField, "desc"),
            startAfter(lastShopDoc),
            limit(SHOPS_PER_PAGE),
          );
        }

        const snap = await getDocs(q);
        const sales = snap.docs.map((d) => d.data() as ShopSale);

        if (reset) {
          setShopSales(sales);
          setShopPage(0);
        } else {
          setShopSales((prev) => [...prev, ...sales]);
          setShopPage((prev) => prev + 1);
        }

        setLastShopDoc(
          snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null,
        );
        setHasMoreShops(snap.docs.length === SHOPS_PER_PAGE);
      } catch (err) {
        console.error("Error fetching shop sales:", err);
      } finally {
        setLoadingShops(false);
      }
    },
    [shopSortField, lastShopDoc],
  );

  // When expanding a week
  const handleExpandWeek = useCallback(
    (weekId: string) => {
      if (expandedWeekId === weekId) {
        setExpandedWeekId(null);
        setShopSales([]);
        setShopSearchTerm("");
        return;
      }
      setExpandedWeekId(weekId);
      setShopSales([]);
      setLastShopDoc(null);
      setShopSearchTerm("");
      fetchShopSales(weekId, true);
    },
    [expandedWeekId, fetchShopSales],
  );

  // When sort changes, refetch
  useEffect(() => {
    if (expandedWeekId) {
      setLastShopDoc(null);
      fetchShopSales(expandedWeekId, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopSortField]);

  // Filter shops client-side by search
  const filteredShops = useMemo(() => {
    if (!shopSearchTerm.trim()) return shopSales;
    const term = shopSearchTerm.toLowerCase();
    return shopSales.filter(
      (s) =>
        s.sellerName.toLowerCase().includes(term) ||
        s.sellerId.toLowerCase().includes(term),
    );
  }, [shopSales, shopSearchTerm]);

  // ── Manual trigger: current week ───────────────────────────
  const handleTriggerCurrentWeek = useCallback(async () => {
    if (!functions) return;
    setTriggerLoading(true);
    try {
      const fn = httpsCallable(functions, "triggerWeeklyAccounting");
      const res = await fn({ mode: "current", force: forceRecalculate });
      const data = res.data as { success: boolean; results: BackfillResult[] };

      if (data.success) {
        setToast({
          message: "Bu haftanin raporu olusturuldu!",
          type: "success",
        });
        fetchReports();
      }
    } catch (err: unknown) {
      console.error("Trigger error:", err);
      setToast({
        message: `Hata: ${err instanceof Error ? err.message : "Bilinmeyen hata"}`,
        type: "error",
      });
    } finally {
      setTriggerLoading(false);
    }
  }, [functions, forceRecalculate, fetchReports]);

  // ── Manual trigger: single specific week ───────────────────
  const handleTriggerSpecificWeek = useCallback(
    async (weekId: string) => {
      if (!functions) return;
      setTriggerLoading(true);
      try {
        const fn = httpsCallable(functions, "triggerWeeklyAccounting");
        const res = await fn({
          mode: "single",
          weekId,
          force: forceRecalculate,
        });
        const data = res.data as {
          success: boolean;
          results: BackfillResult[];
        };

        if (data.success) {
          const result = data.results[0];
          if (result.status === "skipped") {
            setToast({
              message: `${weekId} zaten tamamlanmis. Zorla yeniden hesaplamak icin 'Force' secenegini kullanin.`,
              type: "error",
            });
          } else {
            setToast({
              message: `${weekId} raporu olusturuldu!`,
              type: "success",
            });
          }
          fetchReports();
          if (expandedWeekId === weekId) {
            setLastShopDoc(null);
            fetchShopSales(weekId, true);
          }
        }
      } catch (err: unknown) {
        console.error("Trigger error:", err);
        setToast({
          message: `Hata: ${err instanceof Error ? err.message : "Bilinmeyen hata"}`,
          type: "error",
        });
      } finally {
        setTriggerLoading(false);
      }
    },
    [functions, forceRecalculate, fetchReports, expandedWeekId, fetchShopSales],
  );

  // ── Backfill ───────────────────────────────────────────────
  const handleBackfill = useCallback(async () => {
    if (!functions || !backfillStartDate || !backfillEndDate) return;
    setBackfillLoading(true);
    setBackfillResults(null);
    try {
      const fn = httpsCallable(functions, "triggerWeeklyAccounting");
      const res = await fn({
        mode: "backfill",
        startDate: new Date(backfillStartDate).toISOString(),
        endDate: new Date(backfillEndDate).toISOString(),
        force: forceRecalculate,
      });
      const data = res.data as {
        success: boolean;
        results: BackfillResult[];
        summary: { completed: number; skipped: number; failed: number };
        hasMore: boolean;
      };

      setBackfillResults(data.results);
      setToast({
        message:
          `Backfill tamamlandi: ${data.summary.completed} basarili, ${data.summary.skipped} atlandi, ${data.summary.failed} basarisiz` +
          (data.hasMore ? " (daha fazla var, tekrar calistirin)" : ""),
        type: data.summary.failed > 0 ? "error" : "success",
      });
      fetchReports();
    } catch (err: unknown) {
      console.error("Backfill error:", err);
      setToast({
        message: `Backfill hatasi: ${err instanceof Error ? err.message : "Bilinmeyen hata"}`,
        type: "error",
      });
    } finally {
      setBackfillLoading(false);
    }
  }, [
    functions,
    backfillStartDate,
    backfillEndDate,
    forceRecalculate,
    fetchReports,
  ]);

  // ── Month navigation ───────────────────────────────────────
  const goToPrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
    setExpandedWeekId(null);
    setShopSales([]);
  };

  const goToNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
    setExpandedWeekId(null);
    setShopSales([]);
  };

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Summary stats for the month
  const monthStats = useMemo(() => {
    let revenue = 0;
    let orders = 0;
    let sellers = 0;
    let completedWeeks = 0;
    weekReports.forEach((r) => {
      if (r.status === "completed") {
        revenue += r.totalRevenue || 0;
        orders += r.totalOrderCount || 0;
        sellers = Math.max(sellers, r.sellerCount || 0);
        completedWeeks++;
      }
    });
    return { revenue, orders, sellers, completedWeeks };
  }, [weekReports]);

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
                <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h1 className="text-base font-bold text-gray-900">
                    Haftalik Satis Muhasebesi
                  </h1>
                  <p className="text-xs text-gray-500">
                    Dukkan bazli haftalik satis raporlari
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Force checkbox */}
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={forceRecalculate}
                  onChange={(e) => setForceRecalculate(e.target.checked)}
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                />
                Zorla Yeniden Hesapla
              </label>

              {/* Current week button */}
              <button
                onClick={handleTriggerCurrentWeek}
                disabled={triggerLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-all"
              >
                {triggerLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                Bu Haftayi Hesapla
              </button>

              {/* Backfill button */}
              <button
                onClick={() => setShowBackfillModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-medium transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Gecmis Verileri Olustur
              </button>
            </div>
          </div>
        </header>

        {/* Toast */}
        {toast && (
          <div
            className={`fixed top-16 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium max-w-md animate-in slide-in-from-right ${
              toast.type === "success"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {toast.message}
          </div>
        )}

        <main className="max-w-[1400px] mx-auto p-4">
          {/* Month Summary Stats */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <StatMini
              label="Aylik Ciro"
              value={formatCurrency(monthStats.revenue)}
              icon={TrendingUp}
              color="green"
            />
            <StatMini
              label="Toplam Siparis"
              value={monthStats.orders.toLocaleString()}
              icon={ShoppingCart}
              color="blue"
            />
            <StatMini
              label="Aktif Satici"
              value={monthStats.sellers.toLocaleString()}
              icon={Store}
              color="purple"
            />
            <StatMini
              label="Tamamlanan Hafta"
              value={`${monthStats.completedWeeks} / ${monthWeeks.length}`}
              icon={CheckCircle2}
              color="orange"
            />
          </div>

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

            {/* Week Rows */}
            {loadingReports ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {monthWeeks.map((week) => {
                  const report = weekReports.get(week.weekId);
                  const isExpanded = expandedWeekId === week.weekId;
                  const hasReport = !!report;
                  const isCompleted = report?.status === "completed";
                  const isFutureWeek = week.monday > new Date();

                  return (
                    <div key={week.weekId}>
                      {/* Week Row */}
                      <div
                        className={`flex items-center px-4 py-3 transition-colors ${
                          isCompleted
                            ? "hover:bg-emerald-50/50 cursor-pointer"
                            : hasReport
                              ? "hover:bg-gray-50 cursor-pointer"
                              : "hover:bg-gray-50"
                        } ${isExpanded ? "bg-emerald-50/30" : ""}`}
                        onClick={() => {
                          if (hasReport && report.status !== "processing") {
                            handleExpandWeek(week.weekId);
                          }
                        }}
                      >
                        {/* Expand indicator */}
                        <div className="w-6 mr-2 flex-shrink-0">
                          {hasReport && report.status !== "processing" ? (
                            isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-gray-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-400" />
                            )
                          ) : null}
                        </div>

                        {/* Date range */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">
                              {formatDate(week.monday)} –{" "}
                              {formatDate(week.sunday)}
                            </span>
                            <span className="text-xs text-gray-400 font-mono">
                              {week.weekId}
                            </span>
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

                        {/* Stats (only if completed) */}
                        <div className="flex items-center gap-6 flex-shrink-0">
                          {isCompleted ? (
                            <>
                              <div className="text-right w-28">
                                <p className="text-xs text-gray-500">Ciro</p>
                                <p className="text-sm font-semibold text-gray-900">
                                  {formatCurrency(report.totalRevenue)}
                                </p>
                              </div>
                              <div className="text-right w-20">
                                <p className="text-xs text-gray-500">Siparis</p>
                                <p className="text-sm font-semibold text-gray-900">
                                  {report.totalOrderCount?.toLocaleString()}
                                </p>
                              </div>
                              <div className="text-right w-20">
                                <p className="text-xs text-gray-500">Satici</p>
                                <p className="text-sm font-semibold text-gray-900">
                                  {report.sellerCount?.toLocaleString()}
                                </p>
                              </div>
                              <div className="text-right w-24">
                                <p className="text-xs text-gray-500">
                                  Komisyon
                                </p>
                                <p className="text-sm font-semibold text-emerald-600">
                                  {formatCurrency(report.totalCommission)}
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
                            <div className="w-[292px]" /> /* spacer */
                          )}
                        </div>

                        {/* Action button */}
                        <div className="w-24 flex-shrink-0 pl-3 flex justify-end">
                          {!isFutureWeek && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTriggerSpecificWeek(week.weekId);
                              }}
                              disabled={triggerLoading}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all ${
                                isCompleted && !forceRecalculate
                                  ? "text-gray-400 cursor-not-allowed"
                                  : "text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800"
                              }`}
                              title={
                                isCompleted && !forceRecalculate
                                  ? "Zaten tamamlandi. Zorla yeniden hesaplamak icin 'Force' secenegini aktiflestiriniz."
                                  : "Bu haftayi hesapla"
                              }
                            >
                              {triggerLoading ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Zap className="w-3 h-3" />
                              )}
                              Hesapla
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expanded Shop Sales */}
                      {isExpanded && isCompleted && (
                        <div className="bg-gray-50/80 border-t border-gray-100 px-4 py-4">
                          {/* Controls */}
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <h3 className="text-sm font-semibold text-gray-700">
                                Satici Detaylari
                              </h3>
                              <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                <input
                                  type="text"
                                  placeholder="Satici ara..."
                                  value={shopSearchTerm}
                                  onChange={(e) =>
                                    setShopSearchTerm(e.target.value)
                                  }
                                  className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 w-56"
                                />
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500">
                                Sirala:
                              </span>
                              {(
                                [
                                  ["totalRevenue", "Ciro"],
                                  ["orderCount", "Siparis"],
                                  ["totalQuantity", "Adet"],
                                ] as const
                              ).map(([field, label]) => (
                                <button
                                  key={field}
                                  onClick={() => setShopSortField(field)}
                                  className={`px-2 py-1 text-xs rounded-md transition-all ${
                                    shopSortField === field
                                      ? "bg-emerald-600 text-white"
                                      : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-100"
                                  }`}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Shop Sales Table */}
                          {loadingShops && shopSales.length === 0 ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                            </div>
                          ) : filteredShops.length === 0 ? (
                            <div className="text-center py-8 text-sm text-gray-400">
                              {shopSearchTerm
                                ? "Aramayla eslesen satici bulunamadi"
                                : "Bu hafta icin satici verisi yok"}
                            </div>
                          ) : (
                            <>
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
                                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 w-16">
                                        Tur
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
                                      <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-28">
                                        Komisyon
                                      </th>
                                      <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-28">
                                        Net
                                      </th>
                                      <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-24">
                                        Ort. Siparis
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {filteredShops.map((shop, idx) => (
                                      <tr
                                        key={shop.sellerId}
                                        className="hover:bg-gray-50 transition-colors"
                                      >
                                        <td className="px-3 py-2.5 text-xs text-gray-400">
                                          {idx + 1}
                                        </td>
                                        <td className="px-3 py-2.5">
                                          <div>
                                            <p className="font-medium text-gray-900 text-sm">
                                              {shop.sellerName}
                                            </p>
                                            <p className="text-xs text-gray-400 font-mono truncate max-w-[200px]">
                                              {shop.sellerId}
                                            </p>
                                          </div>
                                        </td>
                                        <td className="px-3 py-2.5">
                                          <span
                                            className={`inline-flex items-center gap-1 text-xs font-medium ${
                                              shop.isShopProduct
                                                ? "text-blue-700"
                                                : "text-orange-700"
                                            }`}
                                          >
                                            {shop.isShopProduct ? (
                                              <Store className="w-3 h-3" />
                                            ) : (
                                              <Users className="w-3 h-3" />
                                            )}
                                            {shop.isShopProduct
                                              ? "Dukkan"
                                              : "Bireysel"}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2.5 text-right font-semibold text-gray-900">
                                          {formatCurrency(shop.totalRevenue)}
                                        </td>
                                        <td className="px-3 py-2.5 text-right text-gray-700">
                                          {shop.orderCount}
                                        </td>
                                        <td className="px-3 py-2.5 text-right text-gray-700">
                                          {shop.totalQuantity}
                                        </td>
                                        <td className="px-3 py-2.5 text-right text-emerald-600 font-medium">
                                          {formatCurrency(shop.totalCommission)}
                                        </td>
                                        <td className="px-3 py-2.5 text-right text-gray-900 font-medium">
                                          {formatCurrency(shop.netRevenue)}
                                        </td>
                                        <td className="px-3 py-2.5 text-right text-gray-500">
                                          {formatCurrency(
                                            shop.averageOrderValue,
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>

                              {/* Load More */}
                              {hasMoreShops && !shopSearchTerm && (
                                <div className="flex justify-center mt-3">
                                  <button
                                    onClick={() =>
                                      fetchShopSales(expandedWeekId!, false)
                                    }
                                    disabled={loadingShops}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-50"
                                  >
                                    {loadingShops ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <ChevronDown className="w-3.5 h-3.5" />
                                    )}
                                    Daha Fazla Yukle ({SHOPS_PER_PAGE} satici
                                    daha)
                                  </button>
                                </div>
                              )}

                              <p className="text-xs text-gray-400 mt-2 text-center">
                                {filteredShops.length} satici gosteriliyor
                                {shopSearchTerm ? ` (filtreli)` : ""}
                                {" / "}
                                toplam {report?.sellerCount || "?"} satici
                              </p>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>

        {/* Backfill Modal */}
        {showBackfillModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    Gecmis Verileri Toplu Olustur (Backfill)
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Belirlenen tarih araligindaki tum haftalarin raporlarini
                    olusturur. Tamamlanmis haftalar atlanir.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowBackfillModal(false);
                    setBackfillResults(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 p-1"
                >
                  ✕
                </button>
              </div>

              <div className="px-5 py-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Baslangic Tarihi
                    </label>
                    <input
                      type="date"
                      value={backfillStartDate}
                      onChange={(e) => setBackfillStartDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Bitis Tarihi
                    </label>
                    <input
                      type="date"
                      value={backfillEndDate}
                      onChange={(e) => setBackfillEndDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={forceRecalculate}
                    onChange={(e) => setForceRecalculate(e.target.checked)}
                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-3.5 h-3.5"
                  />
                  Tamamlanmis haftalari da yeniden hesapla (Force)
                </label>

                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <p className="text-xs text-amber-800">
                    Bu islem uzun surebilir. Maksimum 52 hafta tek seferde
                    islenir. Daha fazlasi icin birden fazla kez calistirin.
                  </p>
                </div>

                {/* Backfill Results */}
                {backfillResults && (
                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left px-2 py-1.5 font-medium text-gray-500">
                            Hafta
                          </th>
                          <th className="text-left px-2 py-1.5 font-medium text-gray-500">
                            Durum
                          </th>
                          <th className="text-right px-2 py-1.5 font-medium text-gray-500">
                            Ciro
                          </th>
                          <th className="text-right px-2 py-1.5 font-medium text-gray-500">
                            Siparis
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {backfillResults.map((r) => (
                          <tr key={r.weekId}>
                            <td className="px-2 py-1.5 font-mono">
                              {r.weekId}
                            </td>
                            <td className="px-2 py-1.5">
                              <StatusBadge
                                status={
                                  r.status === "skipped" ? "pending" : r.status
                                }
                              />
                              {r.reason && (
                                <span className="text-gray-400 ml-1">
                                  ({r.reason})
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              {r.totalRevenue
                                ? formatCurrency(r.totalRevenue)
                                : "—"}
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              {r.orderCount?.toLocaleString() || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowBackfillModal(false);
                    setBackfillResults(null);
                  }}
                  className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Kapat
                </button>
                <button
                  onClick={handleBackfill}
                  disabled={
                    backfillLoading || !backfillStartDate || !backfillEndDate
                  }
                  className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-all"
                >
                  {backfillLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Isleniyor...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5" />
                      Backfill Baslat
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
