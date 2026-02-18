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
  Search,
  Store,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Zap,
  ChevronLeft,
  Circle,
  CheckCircle,
  Info,
  Download,
  Banknote,
  BanknoteIcon,
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
  doc,
  updateDoc,
  deleteField,
  Timestamp,
  DocumentSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "../lib/firebase";
import { getApp } from "firebase/app";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

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
  paidAt?: Timestamp | null;
  paidBy?: string | null;
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

function PaidBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border text-violet-700 bg-violet-50 border-violet-200">
      <Banknote className="w-3 h-3" />
      Odendi
    </span>
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

  // Week selection (for calculate / payment action)
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);

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

  // Action states
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [forceRecalculate, setForceRecalculate] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [exportingWeekId, setExportingWeekId] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const SHOPS_PER_PAGE = 20;

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

  // Is the selected week currently marked as paid?
  const selectedWeekIsPaid = useMemo(() => {
    if (!selectedWeekId) return false;
    const report = weekReports.get(selectedWeekId);
    return !!report?.paidAt;
  }, [selectedWeekId, weekReports]);

  // Is the selected week completed? (for payment button enable)
  const selectedWeekIsCompleted = useMemo(() => {
    if (!selectedWeekId) return false;
    const report = weekReports.get(selectedWeekId);
    return report?.status === "completed";
  }, [selectedWeekId, weekReports]);

  // ── Fetch reports for visible weeks ────────────────────────
  const fetchReports = useCallback(async () => {
    if (!user || monthWeeks.length === 0) return;
    setLoadingReports(true);
    try {
      const weekIds = monthWeeks.map((w) => w.weekId);
      const reportsMap = new Map<string, WeekReport>();
      for (let i = 0; i < weekIds.length; i += 30) {
        const chunk = weekIds.slice(i, i + 30);
        const q = query(
          collection(db, "weekly_sales_accounting"),
          where("weekId", "in", chunk),
        );
        const snap = await getDocs(q);
        snap.forEach((d) => {
          reportsMap.set(d.id, d.data() as WeekReport);
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

  useEffect(() => {
    if (expandedWeekId) {
      setLastShopDoc(null);
      fetchShopSales(expandedWeekId, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopSortField]);

  const filteredShops = useMemo(() => {
    if (!shopSearchTerm.trim()) return shopSales;
    const term = shopSearchTerm.toLowerCase();
    return shopSales.filter(
      (s) =>
        s.sellerName.toLowerCase().includes(term) ||
        s.sellerId.toLowerCase().includes(term),
    );
  }, [shopSales, shopSearchTerm]);

  // ── Toggle week selection ──────────────────────────────────
  const handleToggleWeekSelect = useCallback((weekId: string) => {
    setSelectedWeekId((prev) => (prev === weekId ? null : weekId));
  }, []);

  // ── Calculate selected week ────────────────────────────────
  const handleCalculateSelected = useCallback(async () => {
    if (!functions || !selectedWeekId) return;
    setTriggerLoading(true);
    try {
      const fn = httpsCallable(functions, "triggerWeeklyAccounting");
      const res = await fn({
        mode: "single",
        weekId: selectedWeekId,
        force: forceRecalculate,
      });
      const data = res.data as { success: boolean; results: BackfillResult[] };

      if (data.success) {
        const result = data.results[0];
        if (result.status === "skipped") {
          setToast({
            message: `${selectedWeekId} zaten tamamlanmis. "Zorla Yeniden Hesapla" secenegini isaretleyip tekrar deneyin.`,
            type: "error",
          });
        } else {
          setToast({
            message: `${selectedWeekId} raporu basariyla olusturuldu!`,
            type: "success",
          });
        }
        fetchReports();
        if (expandedWeekId === selectedWeekId) {
          setLastShopDoc(null);
          fetchShopSales(selectedWeekId, true);
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
  }, [
    functions,
    selectedWeekId,
    forceRecalculate,
    fetchReports,
    expandedWeekId,
    fetchShopSales,
  ]);

  // ── Toggle payment status ──────────────────────────────────
  const handleTogglePayment = useCallback(async () => {
    if (!selectedWeekId || !user) return;
    setPaymentLoading(true);
    try {
      const reportRef = doc(db, "weekly_sales_accounting", selectedWeekId);

      if (selectedWeekIsPaid) {
        // Remove payment
        await updateDoc(reportRef, {
          paidAt: deleteField(),
          paidBy: deleteField(),
        });
        setToast({
          message: `${selectedWeekId} odeme durumu kaldirildi.`,
          type: "success",
        });
      } else {
        // Mark as paid
        await updateDoc(reportRef, {
          paidAt: serverTimestamp(),
          paidBy: user.uid,
        });
        setToast({
          message: `${selectedWeekId} odendi olarak isaretlendi!`,
          type: "success",
        });
      }

      // Update local state immediately
      setWeekReports((prev) => {
        const updated = new Map(prev);
        const existing = updated.get(selectedWeekId);
        if (existing) {
          updated.set(selectedWeekId, {
            ...existing,
            paidAt: selectedWeekIsPaid ? null : Timestamp.now(),
            paidBy: selectedWeekIsPaid ? null : user.uid,
          });
        }
        return updated;
      });
    } catch (err: unknown) {
      console.error("Payment toggle error:", err);
      setToast({
        message: `Hata: ${err instanceof Error ? err.message : "Bilinmeyen hata"}`,
        type: "error",
      });
    } finally {
      setPaymentLoading(false);
    }
  }, [selectedWeekId, selectedWeekIsPaid, user]);

  // ── Export week to Excel ───────────────────────────────────
  const handleExportExcel = useCallback(
    async (weekId: string) => {
      setExportingWeekId(weekId);
      try {
        const report = weekReports.get(weekId);

        // Fetch ALL shop_sales for this week (no pagination)
        const allSales: ShopSale[] = [];
        const baseRef = collection(
          db,
          "weekly_sales_accounting",
          weekId,
          "shop_sales",
        );
        const q = query(baseRef, orderBy("totalRevenue", "desc"));
        const snap = await getDocs(q);
        snap.forEach((d) => allSales.push(d.data() as ShopSale));

        // Build rows
        const rows = allSales.map((s, idx) => ({
          "#": idx + 1,
          "Satici Adi": s.sellerName,
          "Satici ID": s.sellerId,
          Tur: s.isShopProduct ? "Dukkan" : "Bireysel",
          "Ciro (TL)": s.totalRevenue,
          "Siparis Sayisi": s.orderCount,
          Adet: s.totalQuantity,
          "Komisyon (TL)": s.totalCommission,
          "Net (TL)": s.netRevenue,
          "Ort. Siparis (TL)": s.averageOrderValue,
        }));

        // Summary row
        rows.push({
          "#": 0,
          "Satici Adi": "TOPLAM",
          "Satici ID": "",
          Tur: "",
          "Ciro (TL)": report?.totalRevenue || 0,
          "Siparis Sayisi": report?.totalOrderCount || 0,
          Adet: report?.totalQuantity || 0,
          "Komisyon (TL)": report?.totalCommission || 0,
          "Net (TL)": report?.netRevenue || 0,
          "Ort. Siparis (TL)": 0,
        });

        // Create workbook
        const ws = XLSX.utils.json_to_sheet(rows);

        // Column widths
        ws["!cols"] = [
          { wch: 5 }, // #
          { wch: 30 }, // Satici Adi
          { wch: 28 }, // Satici ID
          { wch: 10 }, // Tur
          { wch: 15 }, // Ciro
          { wch: 15 }, // Siparis
          { wch: 10 }, // Adet
          { wch: 15 }, // Komisyon
          { wch: 15 }, // Net
          { wch: 15 }, // Ort. Siparis
        ];

        const wb = XLSX.utils.book_new();
        const weekLabel = report
          ? `${report.weekStartStr} - ${report.weekEndStr}`
          : weekId;
        XLSX.utils.book_append_sheet(wb, ws, "Satici Raporu");

        // Download
        XLSX.writeFile(wb, `haftalik-rapor-${weekId}.xlsx`);

        setToast({
          message: `${weekLabel} raporu indirildi!`,
          type: "success",
        });
      } catch (err: unknown) {
        console.error("Export error:", err);
        setToast({
          message: `Excel hatasi: ${err instanceof Error ? err.message : "Bilinmeyen hata"}`,
          type: "error",
        });
      } finally {
        setExportingWeekId(null);
      }
    },
    [weekReports],
  );

  // ── Month navigation ───────────────────────────────────────
  const goToPrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
    setExpandedWeekId(null);
    setSelectedWeekId(null);
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
    setSelectedWeekId(null);
    setShopSales([]);
  };

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Selected week label for buttons
  const selectedWeekLabel = useMemo(() => {
    if (!selectedWeekId) return null;
    const week = monthWeeks.find((w) => w.weekId === selectedWeekId);
    if (!week) return selectedWeekId;
    return `${formatDate(week.monday)} – ${formatDate(week.sunday)}`;
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
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none mr-1">
                <input
                  type="checkbox"
                  checked={forceRecalculate}
                  onChange={(e) => setForceRecalculate(e.target.checked)}
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                />
                Zorla Yeniden Hesapla
              </label>

              {/* Calculate selected week */}
              <button
                onClick={handleCalculateSelected}
                disabled={!selectedWeekId || triggerLoading}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  selectedWeekId
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                } disabled:opacity-50`}
              >
                {triggerLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5" />
                )}
                {selectedWeekId
                  ? `Secilen Haftayi Hesapla (${selectedWeekLabel})`
                  : "Secilen Haftayi Hesapla"}
              </button>

              {/* Payment toggle */}
              <button
                onClick={handleTogglePayment}
                disabled={
                  !selectedWeekId || !selectedWeekIsCompleted || paymentLoading
                }
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  selectedWeekId && selectedWeekIsCompleted
                    ? selectedWeekIsPaid
                      ? "bg-amber-500 hover:bg-amber-600 text-white"
                      : "bg-violet-600 hover:bg-violet-700 text-white"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                } disabled:opacity-50`}
              >
                {paymentLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <BanknoteIcon className="w-3.5 h-3.5" />
                )}
                {selectedWeekIsPaid
                  ? "Odemeyi Kaldir"
                  : "Odendi Olarak Isaretle"}
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
                  const isSelected = selectedWeekId === week.weekId;
                  const hasReport = !!report;
                  const isCompleted = report?.status === "completed";
                  const isFutureWeek = week.monday > new Date();
                  const incomplete =
                    isCompleted && isWeekIncomplete(week.sunday);
                  const isPaid = !!report?.paidAt;
                  const isExporting = exportingWeekId === week.weekId;

                  return (
                    <div key={week.weekId}>
                      {/* Week Row */}
                      <div
                        className={`flex items-center px-4 py-3 transition-colors ${
                          isSelected
                            ? "bg-emerald-50/60"
                            : isExpanded
                              ? "bg-gray-50/80"
                              : "hover:bg-gray-50"
                        }`}
                      >
                        {/* Select toggle */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isFutureWeek)
                              handleToggleWeekSelect(week.weekId);
                          }}
                          disabled={isFutureWeek}
                          className={`mr-3 flex-shrink-0 transition-colors ${
                            isFutureWeek
                              ? "text-gray-200 cursor-not-allowed"
                              : isSelected
                                ? "text-emerald-600"
                                : "text-gray-300 hover:text-gray-400"
                          }`}
                          title={
                            isFutureWeek
                              ? "Gelecek hafta"
                              : isSelected
                                ? "Secimi kaldir"
                                : "Haftayi sec"
                          }
                        >
                          {isSelected ? (
                            <CheckCircle className="w-5 h-5" />
                          ) : (
                            <Circle className="w-5 h-5" />
                          )}
                        </button>

                        {/* Expand toggle */}
                        <button
                          onClick={() => {
                            if (hasReport && report.status !== "processing") {
                              handleExpandWeek(week.weekId);
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

                        {/* Date range + badges */}
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
                                <AlertTriangle className="w-3 h-3" />
                                Eksik rapor. Hafta bitince tekrar hesaplanmali.
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Status + Paid badges */}
                        <div className="flex items-center gap-1.5 w-auto flex-shrink-0 px-2">
                          {hasReport ? (
                            <>
                              <StatusBadge status={report.status} />
                              {isPaid && <PaidBadge />}
                            </>
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
                            <div className="w-[292px]" />
                          )}
                        </div>

                        {/* Excel export button */}
                        <div className="w-10 flex-shrink-0 pl-2 flex justify-end">
                          {isCompleted && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExportExcel(week.weekId);
                              }}
                              disabled={isExporting}
                              className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all disabled:opacity-50"
                              title="Excel olarak indir"
                            >
                              {isExporting ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Download className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expanded Shop Sales */}
                      {isExpanded && isCompleted && (
                        <div className="bg-gray-50/80 border-t border-gray-100 px-4 py-4">
                          {incomplete && (
                            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg mb-3">
                              <Info className="w-4 h-4 text-amber-600 flex-shrink-0" />
                              <p className="text-xs text-amber-800">
                                Bu hafta henuz bitmedi. Gosterilen veriler
                                sadece simdiye kadarki siparisleri icerir. Hafta
                                bittikten sonra{" "}
                                <strong>Zorla Yeniden Hesapla</strong> ile
                                guncellemeniz onerilir.
                              </p>
                            </div>
                          )}

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
                                {shopSearchTerm ? " (filtreli)" : ""}
                                {" / toplam "}
                                {report?.sellerCount || "?"} satici
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
      </div>
    </ProtectedRoute>
  );
}
