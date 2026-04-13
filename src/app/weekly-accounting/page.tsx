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
  UtensilsCrossed,
  ShoppingBag,
  CalendarDays,
  CalendarRange,
  CalendarClock,
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo, memo } from "react";
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
  documentId,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "../lib/firebase";
import { getApp } from "firebase/app";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

type PeriodType = "daily" | "weekly" | "monthly";
type MainTab = "product" | "food";

interface ProductReport {
  periodId?: string;
  weekId?: string; // legacy field for old weekly data
  periodStart?: Timestamp;
  periodEnd?: Timestamp;
  periodStartStr?: string;
  periodEndStr?: string;
  weekStartStr?: string; // legacy
  weekEndStr?: string; // legacy
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

interface FoodReport {
  restaurantId: string;
  restaurantName: string;
  periodKey: string;
  totalOrders: number;
  completedOrders: number;
  activeOrders: number;
  cancelledOrders: number;
  grossRevenue: number;
  deliveredRevenue: number;
  subtotalRevenue: number;
  deliveryFeeRevenue: number;
  totalItemsSold: number;
  averageOrderValue: number;
  restaurantCount?: number;
  paymentBreakdown: Record<string, { count: number; amount: number }>;
  paymentReceivedBreakdown: Record<string, { count: number; amount: number }>;
  deliveryTypeBreakdown: Record<string, { count: number; amount: number }>;
  statusBreakdown: Record<string, { count: number; amount: number }>;
  topItems?: { name: string; quantity: number; revenue: number }[];
  calculatedAt?: Timestamp;
  periodStart?: Timestamp;
  periodEnd?: Timestamp;
}

interface PeriodEntry {
  id: string;
  label: string;
  sublabel: string;
  startDate: Date;
  endDate: Date;
  isFuture: boolean;
  isIncomplete: boolean;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const MONTHS_TR = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

const PRODUCT_COLLECTIONS: Record<PeriodType, string> = {
  daily: "daily_sales_accounting",
  weekly: "weekly_sales_accounting",
  monthly: "monthly_sales_accounting",
};

const FOOD_COLLECTIONS: Record<PeriodType, string> = {
  daily: "food-accounting-daily",
  weekly: "food-accounting-weekly",
  monthly: "food-accounting-monthly",
};

const PRODUCT_FUNCTIONS: Record<PeriodType, string> = {
  daily: "triggerDailyAccounting",
  weekly: "triggerWeeklyAccounting",
  monthly: "triggerMonthlyAccounting",
};

const FOOD_FUNCTIONS: Record<PeriodType, string> = {
  daily: "calculateDailyFoodAccounting",
  weekly: "calculateWeeklyFoodAccounting",
  monthly: "calculateMonthlyFoodAccounting",
};

const PERIOD_LABELS: Record<PeriodType, string> = {
  daily: "Günlük",
  weekly: "Haftalık",
  monthly: "Aylık",
};

const PERIOD_ICONS: Record<PeriodType, typeof CalendarDays> = {
  daily: CalendarDays,
  weekly: CalendarRange,
  monthly: CalendarClock,
};

const SHOPS_PER_PAGE = 20;
const RESTAURANTS_PER_PAGE = 20;

// ═══════════════════════════════════════════════════════════════
// DATE HELPERS
// ═══════════════════════════════════════════════════════════════

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

function getDayId(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getMonthId(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function isoWeekNumber(date: Date): { year: number; week: number } {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow + 3);
  const y1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const y1d = (y1.getUTCDay() + 6) % 7;
  y1.setUTCDate(y1.getUTCDate() - y1d + 3);
  const week = 1 + Math.round((d.getTime() - y1.getTime()) / (7 * 86400000));
  return { year: d.getUTCFullYear(), week };
}

function foodWeekKey(date: Date): string {
  const { year, week } = isoWeekNumber(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

// ── Period entry generators ──────────────────────────────────

function getDaysOfMonth(year: number, month: number): PeriodEntry[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const entries: PeriodEntry[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const endDate = new Date(year, month, d + 1);
    entries.push({
      id: getDayId(date),
      label: date.toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "short",
        weekday: "short",
      }),
      sublabel: getDayId(date),
      startDate: date,
      endDate,
      isFuture: date > now,
      isIncomplete: date.toDateString() === now.toDateString(),
    });
  }
  return entries;
}

function getWeeksOfMonth(year: number, month: number): PeriodEntry[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const weeks: PeriodEntry[] = [];
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const { monday: firstMonday } = getWeekBoundsLocal(firstOfMonth);
  const current = new Date(firstMonday);

  while (current <= lastOfMonth) {
    const monday = new Date(current);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const sundayEnd = new Date(sunday);
    sundayEnd.setHours(23, 59, 59, 999);

    weeks.push({
      id: getWeekId(monday),
      label: `${formatDate(monday)} – ${formatDate(sunday)}`,
      sublabel: getWeekId(monday),
      startDate: monday,
      endDate: new Date(monday.getTime() + 7 * 86400000),
      isFuture: monday > now,
      isIncomplete: now <= sundayEnd && now >= monday,
    });
    current.setDate(current.getDate() + 7);
  }
  return weeks;
}

function getMonthsOfYear(year: number): PeriodEntry[] {
  const now = new Date();
  const entries: PeriodEntry[] = [];

  for (let m = 0; m < 12; m++) {
    const start = new Date(year, m, 1);
    const end = new Date(year, m + 1, 1);
    entries.push({
      id: getMonthId(year, m),
      label: MONTHS_TR[m],
      sublabel: getMonthId(year, m),
      startDate: start,
      endDate: end,
      isFuture: start > now,
      isIncomplete: now >= start && now < end,
    });
  }
  return entries;
}

// ── Food period key mappers ──────────────────────────────────

function foodPeriodKeyForEntry(period: PeriodType, entry: PeriodEntry): string {
  if (period === "daily") return entry.id; // YYYY-MM-DD
  if (period === "monthly") return entry.id; // YYYY-MM
  // weekly: need ISO week format YYYY-WNN
  return foodWeekKey(entry.startDate);
}

// ═══════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════

function formatDate(date: Date) {
  return date.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

const STATUS_CONFIG = {
  completed: {
    label: "Tamamlandı",
    color: "text-emerald-700 bg-emerald-50 border-emerald-200",
    icon: CheckCircle2,
  },
  processing: {
    label: "İşleniyor",
    color: "text-blue-700 bg-blue-50 border-blue-200",
    icon: Loader2,
  },
  failed: {
    label: "Başarısız",
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
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════

const StatusBadge = memo(function StatusBadge({ status }: { status: string }) {
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
});

const PaidBadge = memo(function PaidBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border text-violet-700 bg-violet-50 border-violet-200">
      <Banknote className="w-3 h-3" />
      Ödendi
    </span>
  );
});

function Toast({
  toast,
  onDismiss,
}: {
  toast: { message: string; type: "success" | "error" } | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(onDismiss, 5000);
      return () => clearTimeout(timer);
    }
  }, [toast, onDismiss]);

  if (!toast) return null;
  return (
    <div
      className={`fixed top-16 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium max-w-md ${
        toast.type === "success"
          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
          : "bg-red-50 text-red-800 border border-red-200"
      }`}
    >
      {toast.message}
    </div>
  );
}

function PeriodSubTabs({
  activePeriod,
  onChange,
}: {
  activePeriod: PeriodType;
  onChange: (p: PeriodType) => void;
}) {
  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
      {(["daily", "weekly", "monthly"] as PeriodType[]).map((p) => {
        const Icon = PERIOD_ICONS[p];
        const active = activePeriod === p;
        return (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              active
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {PERIOD_LABELS[p]}
          </button>
        );
      })}
    </div>
  );
}

function MonthYearNav({
  year,
  month,
  mode,
  onPrev,
  onNext,
}: {
  year: number;
  month: number;
  mode: "month" | "year";
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
      <button
        onClick={onPrev}
        className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
      >
        <ChevronLeft className="w-4 h-4 text-gray-600" />
      </button>
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-900">
          {mode === "month" ? `${MONTHS_TR[month]} ${year}` : `${year}`}
        </h2>
      </div>
      <button
        onClick={onNext}
        className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
      >
        <ChevronRight className="w-4 h-4 text-gray-600" />
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PRODUCT SALES TAB
// ═══════════════════════════════════════════════════════════════

function ProductSalesTab({
  functions,
}: {
  functions: ReturnType<typeof getFunctions> | null;
}) {
  const { user } = useAuth();

  const [period, setPeriod] = useState<PeriodType>("weekly");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());

  const [reports, setReports] = useState<Map<string, ProductReport>>(new Map());
  const [loadingReports, setLoadingReports] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [shopSales, setShopSales] = useState<ShopSale[]>([]);
  const [loadingShops, setLoadingShops] = useState(false);
  const [shopSearchTerm, setShopSearchTerm] = useState("");
  const [lastShopDoc, setLastShopDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMoreShops, setHasMoreShops] = useState(false);
  const [shopSortField, setShopSortField] = useState<
    "totalRevenue" | "orderCount" | "totalQuantity"
  >("totalRevenue");

  const [triggerLoading, setTriggerLoading] = useState(false);
  const [forceRecalculate, setForceRecalculate] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // ── Generate period entries ────────────────────────────────
  const entries = useMemo(() => {
    if (period === "daily") return getDaysOfMonth(year, month);
    if (period === "weekly") return getWeeksOfMonth(year, month);
    return getMonthsOfYear(year);
  }, [period, year, month]);

  const collectionName = PRODUCT_COLLECTIONS[period];

  // ── Fetch reports for visible entries ──────────────────────
  const fetchReports = useCallback(async () => {
    if (!user || entries.length === 0) return;
    setLoadingReports(true);
    try {
      const ids = entries.map((e) => e.id);
      const reportsMap = new Map<string, ProductReport>();

      // documentId() 'in' supports max 30 per query
      for (let i = 0; i < ids.length; i += 30) {
        const chunk = ids.slice(i, i + 30);
        const q = query(
          collection(db, collectionName),
          where(documentId(), "in", chunk),
        );
        const snap = await getDocs(q);
        snap.forEach((d) => reportsMap.set(d.id, d.data() as ProductReport));
      }
      setReports(reportsMap);
    } catch (err) {
      console.error("Error fetching product reports:", err);
    } finally {
      setLoadingReports(false);
    }
  }, [user, entries, collectionName]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Reset selection when period/nav changes
  useEffect(() => {
    setSelectedId(null);
    setExpandedId(null);
    setShopSales([]);
    setShopSearchTerm("");
  }, [period, year, month]);

  // ── Shop sales fetch ───────────────────────────────────────
  const fetchShopSales = useCallback(
    async (entryId: string, reset = true) => {
      setLoadingShops(true);
      try {
        const baseRef = collection(db, collectionName, entryId, "shop_sales");
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
        setShopSales(reset ? sales : (prev) => [...prev, ...sales]);
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
    [collectionName, shopSortField, lastShopDoc],
  );

  const handleExpand = useCallback(
    (entryId: string) => {
      if (expandedId === entryId) {
        setExpandedId(null);
        setShopSales([]);
        setShopSearchTerm("");
        return;
      }
      setExpandedId(entryId);
      setShopSales([]);
      setLastShopDoc(null);
      setShopSearchTerm("");
      fetchShopSales(entryId, true);
    },
    [expandedId, fetchShopSales],
  );

  // Re-fetch shop sales when sort changes
  useEffect(() => {
    if (expandedId) {
      setLastShopDoc(null);
      fetchShopSales(expandedId, true);
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

  // ── Selected report helpers ────────────────────────────────
  const selectedReport = selectedId ? reports.get(selectedId) : null;
  const selectedIsPaid = !!selectedReport?.paidAt;
  const selectedIsCompleted = selectedReport?.status === "completed";

  // ── Calculate ──────────────────────────────────────────────
  const handleCalculate = useCallback(async () => {
    if (!functions || !selectedId) return;
    setTriggerLoading(true);
    try {
      const fnName = PRODUCT_FUNCTIONS[period];
      const fn = httpsCallable(functions, fnName);

      const payload: Record<string, unknown> = { force: forceRecalculate };
      if (period === "daily") {
        payload.mode = "single";
        payload.date = selectedId;
      } else if (period === "weekly") {
        payload.mode = "single";
        payload.weekId = selectedId;
      } else {
        payload.mode = "single";
        payload.month = selectedId;
      }

      const res = await fn(payload);
      const data = res.data as {
        success: boolean;
        results: { status: string }[];
      };

      if (data.success) {
        const result = data.results[0];
        if (result.status === "skipped") {
          setToast({
            message: `${selectedId} zaten tamamlanmış. "Zorla Yeniden Hesapla" seçeneğini işaretleyip tekrar deneyin.`,
            type: "error",
          });
        } else {
          setToast({
            message: `${selectedId} raporu başarıyla oluşturuldu!`,
            type: "success",
          });
        }
        fetchReports();
        if (expandedId === selectedId) {
          setLastShopDoc(null);
          fetchShopSales(selectedId, true);
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
    selectedId,
    period,
    forceRecalculate,
    fetchReports,
    expandedId,
    fetchShopSales,
  ]);

  // ── Payment toggle ─────────────────────────────────────────
  const handleTogglePayment = useCallback(async () => {
    if (!selectedId || !user) return;
    setPaymentLoading(true);
    try {
      const reportRef = doc(db, collectionName, selectedId);
      if (selectedIsPaid) {
        await updateDoc(reportRef, {
          paidAt: deleteField(),
          paidBy: deleteField(),
        });
        setToast({
          message: `${selectedId} ödeme durumu kaldırıldı.`,
          type: "success",
        });
      } else {
        await updateDoc(reportRef, {
          paidAt: serverTimestamp(),
          paidBy: user.uid,
        });
        setToast({
          message: `${selectedId} ödendi olarak işaretlendi!`,
          type: "success",
        });
      }
      setReports((prev) => {
        const updated = new Map(prev);
        const existing = updated.get(selectedId);
        if (existing) {
          updated.set(selectedId, {
            ...existing,
            paidAt: selectedIsPaid ? null : Timestamp.now(),
            paidBy: selectedIsPaid ? null : user.uid,
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
  }, [selectedId, selectedIsPaid, user, collectionName]);

  // ── Export Excel ───────────────────────────────────────────
  const handleExportExcel = useCallback(
    async (entryId: string) => {
      setExportingId(entryId);
      try {
        const report = reports.get(entryId);
        const allSales: ShopSale[] = [];
        const baseRef = collection(db, collectionName, entryId, "shop_sales");
        const q = query(baseRef, orderBy("totalRevenue", "desc"));
        const snap = await getDocs(q);
        snap.forEach((d) => allSales.push(d.data() as ShopSale));

        const rows = allSales.map((s, idx) => ({
          "#": idx + 1,
          "Satıcı Adı": s.sellerName,
          "Satıcı ID": s.sellerId,
          Tür: s.isShopProduct ? "Dükkan" : "Bireysel",
          "Ciro (TL)": s.totalRevenue,
          "Sipariş Sayısı": s.orderCount,
          Adet: s.totalQuantity,
          "Komisyon (TL)": s.totalCommission,
          "Net (TL)": s.netRevenue,
          "Ort. Sipariş (TL)": s.averageOrderValue,
        }));

        rows.push({
          "#": 0,
          "Satıcı Adı": "TOPLAM",
          "Satıcı ID": "",
          Tür: "",
          "Ciro (TL)": report?.totalRevenue || 0,
          "Sipariş Sayısı": report?.totalOrderCount || 0,
          Adet: report?.totalQuantity || 0,
          "Komisyon (TL)": report?.totalCommission || 0,
          "Net (TL)": report?.netRevenue || 0,
          "Ort. Sipariş (TL)": 0,
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        ws["!cols"] = [
          { wch: 5 },
          { wch: 30 },
          { wch: 28 },
          { wch: 10 },
          { wch: 15 },
          { wch: 15 },
          { wch: 10 },
          { wch: 15 },
          { wch: 15 },
          { wch: 15 },
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Satıcı Raporu");
        XLSX.writeFile(wb, `urun-rapor-${period}-${entryId}.xlsx`);
        setToast({ message: `${entryId} raporu indirildi!`, type: "success" });
      } catch (err: unknown) {
        console.error("Export error:", err);
        setToast({
          message: `Excel hatası: ${err instanceof Error ? err.message : "Bilinmeyen hata"}`,
          type: "error",
        });
      } finally {
        setExportingId(null);
      }
    },
    [reports, collectionName, period],
  );

  // ── Navigation ─────────────────────────────────────────────
  const handlePrev = () => {
    if (period === "monthly") {
      setYear((y) => y - 1);
    } else if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };
  const handleNext = () => {
    if (period === "monthly") {
      setYear((y) => y + 1);
    } else if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  // ── Selected entry label for buttons ───────────────────────
  const selectedLabel = useMemo(() => {
    if (!selectedId) return null;
    const entry = entries.find((e) => e.id === selectedId);
    return entry?.label || selectedId;
  }, [selectedId, entries]);

  return (
    <div>
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 flex-wrap gap-2">
        <PeriodSubTabs activePeriod={period} onChange={setPeriod} />

        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={forceRecalculate}
              onChange={(e) => setForceRecalculate(e.target.checked)}
              className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
            />
            Zorla Yeniden Hesapla
          </label>

          <button
            onClick={handleCalculate}
            disabled={!selectedId || triggerLoading}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selectedId
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            } disabled:opacity-50`}
          >
            {triggerLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            {selectedId ? `Hesapla (${selectedLabel})` : "Dönem Seçin"}
          </button>

          <button
            onClick={handleTogglePayment}
            disabled={!selectedId || !selectedIsCompleted || paymentLoading}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selectedId && selectedIsCompleted
                ? selectedIsPaid
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
            {selectedIsPaid ? "Ödemeyi Kaldır" : "Ödendi İşaretle"}
          </button>
        </div>
      </div>

      {/* Period list */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden m-4">
        <MonthYearNav
          year={year}
          month={month}
          mode={period === "monthly" ? "year" : "month"}
          onPrev={handlePrev}
          onNext={handleNext}
        />

        {loadingReports ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {entries.map((entry) => {
              const report = reports.get(entry.id);
              const isExpanded = expandedId === entry.id;
              const isSelected = selectedId === entry.id;
              const hasReport = !!report;
              const isCompleted = report?.status === "completed";
              const isPaid = !!report?.paidAt;
              const isExporting = exportingId === entry.id;

              return (
                <div key={entry.id}>
                  {/* Row */}
                  <div
                    className={`flex items-center px-4 py-3 transition-colors ${
                      isSelected
                        ? "bg-emerald-50/60"
                        : isExpanded
                          ? "bg-gray-50/80"
                          : "hover:bg-gray-50"
                    }`}
                  >
                    {/* Select */}
                    <button
                      onClick={() =>
                        !entry.isFuture &&
                        setSelectedId((prev) =>
                          prev === entry.id ? null : entry.id,
                        )
                      }
                      disabled={entry.isFuture}
                      className={`mr-3 flex-shrink-0 transition-colors ${
                        entry.isFuture
                          ? "text-gray-200 cursor-not-allowed"
                          : isSelected
                            ? "text-emerald-600"
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
                      onClick={() =>
                        hasReport &&
                        report.status !== "processing" &&
                        handleExpand(entry.id)
                      }
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

                    {/* Label */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">
                          {entry.label}
                        </span>
                        <span className="text-xs text-gray-400 font-mono">
                          {entry.sublabel}
                        </span>
                        {entry.isIncomplete && isCompleted && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            <AlertTriangle className="w-3 h-3" />
                            Eksik — dönem bitmedi
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Badges */}
                    <div className="flex items-center gap-1.5 flex-shrink-0 px-2">
                      {hasReport ? (
                        <>
                          <StatusBadge status={report.status} />
                          {isPaid && <PaidBadge />}
                        </>
                      ) : entry.isFuture ? (
                        <span className="text-xs text-gray-400">Gelecek</span>
                      ) : (
                        <StatusBadge status="pending" />
                      )}
                    </div>

                    {/* Stats */}
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
                            <p className="text-xs text-gray-500">Sipariş</p>
                            <p className="text-sm font-semibold text-gray-900">
                              {report.totalOrderCount?.toLocaleString()}
                            </p>
                          </div>
                          <div className="text-right w-20">
                            <p className="text-xs text-gray-500">Satıcı</p>
                            <p className="text-sm font-semibold text-gray-900">
                              {report.sellerCount?.toLocaleString()}
                            </p>
                          </div>
                          <div className="text-right w-24">
                            <p className="text-xs text-gray-500">Komisyon</p>
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

                    {/* Export */}
                    <div className="w-10 flex-shrink-0 pl-2 flex justify-end">
                      {isCompleted && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExportExcel(entry.id);
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

                  {/* Expanded shop sales */}
                  {isExpanded && isCompleted && (
                    <div className="bg-gray-50/80 border-t border-gray-100 px-4 py-4">
                      {entry.isIncomplete && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg mb-3">
                          <Info className="w-4 h-4 text-amber-600 flex-shrink-0" />
                          <p className="text-xs text-amber-800">
                            Bu dönem henüz bitmedi. Gösterilen veriler kısmi.
                            Dönem bittikten sonra{" "}
                            <strong>Zorla Yeniden Hesapla</strong> ile
                            güncelleyin.
                          </p>
                        </div>
                      )}

                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <h3 className="text-sm font-semibold text-gray-700">
                            Satıcı Detayları
                          </h3>
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                            <input
                              type="text"
                              placeholder="Satıcı ara..."
                              value={shopSearchTerm}
                              onChange={(e) =>
                                setShopSearchTerm(e.target.value)
                              }
                              className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 w-56"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Sırala:</span>
                          {(
                            [
                              "totalRevenue",
                              "orderCount",
                              "totalQuantity",
                            ] as const
                          ).map((field) => (
                            <button
                              key={field}
                              onClick={() => setShopSortField(field)}
                              className={`px-2 py-1 text-xs rounded-md transition-all ${
                                shopSortField === field
                                  ? "bg-emerald-600 text-white"
                                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-100"
                              }`}
                            >
                              {field === "totalRevenue"
                                ? "Ciro"
                                : field === "orderCount"
                                  ? "Sipariş"
                                  : "Adet"}
                            </button>
                          ))}
                        </div>
                      </div>

                      {loadingShops && shopSales.length === 0 ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                        </div>
                      ) : filteredShops.length === 0 ? (
                        <div className="text-center py-8 text-sm text-gray-400">
                          {shopSearchTerm
                            ? "Aramayla eşleşen satıcı bulunamadı"
                            : "Bu dönem için satıcı verisi yok"}
                        </div>
                      ) : (
                        <>
                          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 w-8">
                                    #
                                  </th>
                                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">
                                    Satıcı
                                  </th>
                                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 w-16">
                                    Tür
                                  </th>
                                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-28">
                                    Ciro
                                  </th>
                                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                                    Sipariş
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
                                    Ort. Sipariş
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
                                      <p className="font-medium text-gray-900 text-sm">
                                        {shop.sellerName}
                                      </p>
                                      <p className="text-xs text-gray-400 font-mono truncate max-w-[200px]">
                                        {shop.sellerId}
                                      </p>
                                    </td>
                                    <td className="px-3 py-2.5">
                                      <span
                                        className={`inline-flex items-center gap-1 text-xs font-medium ${shop.isShopProduct ? "text-blue-700" : "text-orange-700"}`}
                                      >
                                        {shop.isShopProduct ? (
                                          <Store className="w-3 h-3" />
                                        ) : (
                                          <Users className="w-3 h-3" />
                                        )}
                                        {shop.isShopProduct
                                          ? "Dükkan"
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
                                      {formatCurrency(shop.averageOrderValue)}
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
                                  fetchShopSales(expandedId!, false)
                                }
                                disabled={loadingShops}
                                className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-50"
                              >
                                {loadingShops ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                                Daha Fazla Yükle
                              </button>
                            </div>
                          )}

                          <p className="text-xs text-gray-400 mt-2 text-center">
                            {filteredShops.length} satıcı gösteriliyor
                            {shopSearchTerm ? " (filtreli)" : ""} / toplam{" "}
                            {report?.sellerCount || "?"} satıcı
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
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FOOD SALES TAB
// ═══════════════════════════════════════════════════════════════

function FoodSalesTab({
  functions,
}: {
  functions: ReturnType<typeof getFunctions> | null;
}) {
  const { user } = useAuth();

  const [period, setPeriod] = useState<PeriodType>("daily");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());

  const [platformReports, setPlatformReports] = useState<
    Map<string, FoodReport>
  >(new Map());
  const [loadingReports, setLoadingReports] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [restaurants, setRestaurants] = useState<FoodReport[]>([]);
  const [loadingRestaurants, setLoadingRestaurants] = useState(false);
  const [restaurantSearch, setRestaurantSearch] = useState("");

  const [triggerLoading, setTriggerLoading] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const collectionName = FOOD_COLLECTIONS[period];

  // ── Generate period entries ────────────────────────────────
  const entries = useMemo(() => {
    if (period === "daily") return getDaysOfMonth(year, month);
    if (period === "weekly") return getWeeksOfMonth(year, month);
    return getMonthsOfYear(year);
  }, [period, year, month]);

  // ── Fetch platform summary docs ────────────────────────────
  const fetchReports = useCallback(async () => {
    if (!user || entries.length === 0) return;
    setLoadingReports(true);
    try {
      const reportsMap = new Map<string, FoodReport>();
      // Food doc IDs are PLATFORM_{periodKey}
      const docIds = entries.map(
        (e) => `PLATFORM_${foodPeriodKeyForEntry(period, e)}`,
      );

      for (let i = 0; i < docIds.length; i += 30) {
        const chunk = docIds.slice(i, i + 30);
        const q = query(
          collection(db, collectionName),
          where(documentId(), "in", chunk),
        );
        const snap = await getDocs(q);
        snap.forEach((d) => {
          const data = d.data() as FoodReport;
          // Map by our entry ID for easy lookup
          const entryId = entries.find(
            (e) => `PLATFORM_${foodPeriodKeyForEntry(period, e)}` === d.id,
          )?.id;
          if (entryId) reportsMap.set(entryId, data);
        });
      }
      setPlatformReports(reportsMap);
    } catch (err) {
      console.error("Error fetching food reports:", err);
    } finally {
      setLoadingReports(false);
    }
  }, [user, entries, collectionName, period]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  useEffect(() => {
    setSelectedId(null);
    setExpandedId(null);
    setRestaurants([]);
    setRestaurantSearch("");
  }, [period, year, month]);

  // ── Fetch restaurant-level data for expanded period ────────
  const fetchRestaurants = useCallback(
    async (entryId: string) => {
      setLoadingRestaurants(true);
      try {
        const entry = entries.find((e) => e.id === entryId);
        if (!entry) return;
        const periodKey = foodPeriodKeyForEntry(period, entry);
        const q = query(
          collection(db, collectionName),
          where("periodKey", "==", periodKey),
          orderBy("grossRevenue", "desc"),
          limit(RESTAURANTS_PER_PAGE),
        );
        const snap = await getDocs(q);
        const results = snap.docs
          .map((d) => d.data() as FoodReport)
          .filter((r) => r.restaurantId !== "_PLATFORM");
        setRestaurants(results);
      } catch (err) {
        console.error("Error fetching restaurants:", err);
      } finally {
        setLoadingRestaurants(false);
      }
    },
    [entries, period, collectionName],
  );

  const handleExpand = useCallback(
    (entryId: string) => {
      if (expandedId === entryId) {
        setExpandedId(null);
        setRestaurants([]);
        setRestaurantSearch("");
        return;
      }
      setExpandedId(entryId);
      setRestaurants([]);
      setRestaurantSearch("");
      fetchRestaurants(entryId);
    },
    [expandedId, fetchRestaurants],
  );

  const filteredRestaurants = useMemo(() => {
    if (!restaurantSearch.trim()) return restaurants;
    const term = restaurantSearch.toLowerCase();
    return restaurants.filter(
      (r) =>
        r.restaurantName.toLowerCase().includes(term) ||
        r.restaurantId.toLowerCase().includes(term),
    );
  }, [restaurants, restaurantSearch]);

  // ── Calculate ──────────────────────────────────────────────
  const handleCalculate = useCallback(async () => {
    if (!functions || !selectedId) return;
    setTriggerLoading(true);
    try {
      const entry = entries.find((e) => e.id === selectedId);
      if (!entry) return;

      const fnName = FOOD_FUNCTIONS[period];
      const fn = httpsCallable(functions, fnName);

      const payload: Record<string, unknown> = {};
      if (period === "daily") {
        payload.date = selectedId;
      } else if (period === "weekly") {
        const { year: wy, week } = isoWeekNumber(entry.startDate);
        payload.year = wy;
        payload.week = week;
      } else {
        const [y, m] = selectedId.split("-").map(Number);
        payload.year = y;
        payload.month = m;
      }

      const res = await fn(payload);
      const data = res.data as {
        success: boolean;
        periodKey: string;
        totalOrders: number;
      };

      if (data.success) {
        setToast({
          message: `Yemek raporu oluşturuldu: ${data.totalOrders} sipariş işlendi.`,
          type: "success",
        });
        fetchReports();
        if (expandedId === selectedId) fetchRestaurants(selectedId);
      }
    } catch (err: unknown) {
      console.error("Food trigger error:", err);
      setToast({
        message: `Hata: ${err instanceof Error ? err.message : "Bilinmeyen hata"}`,
        type: "error",
      });
    } finally {
      setTriggerLoading(false);
    }
  }, [
    functions,
    selectedId,
    entries,
    period,
    fetchReports,
    expandedId,
    fetchRestaurants,
  ]);

  // ── Export Excel ───────────────────────────────────────────
  const handleExportExcel = useCallback(
    async (entryId: string) => {
      setExportingId(entryId);
      try {
        const entry = entries.find((e) => e.id === entryId);
        if (!entry) return;
        const periodKey = foodPeriodKeyForEntry(period, entry);

        const allRestaurants: FoodReport[] = [];
        const q = query(
          collection(db, collectionName),
          where("periodKey", "==", periodKey),
          orderBy("grossRevenue", "desc"),
        );
        const snap = await getDocs(q);
        snap.forEach((d) => {
          const data = d.data() as FoodReport;
          if (data.restaurantId !== "_PLATFORM") allRestaurants.push(data);
        });

        const platform = platformReports.get(entryId);

        const rows = allRestaurants.map((r, idx) => ({
          "#": idx + 1,
          "Restoran Adı": r.restaurantName,
          "Restoran ID": r.restaurantId,
          "Toplam Sipariş": r.totalOrders,
          Tamamlanan: r.completedOrders,
          İptal: r.cancelledOrders,
          "Brüt Ciro (TL)": r.grossRevenue,
          "Teslim Edilen Ciro (TL)": r.deliveredRevenue,
          "Teslimat Ücreti (TL)": r.deliveryFeeRevenue,
          "Ort. Sipariş (TL)": r.averageOrderValue,
        }));

        rows.push({
          "#": 0,
          "Restoran Adı": "TOPLAM",
          "Restoran ID": "",
          "Toplam Sipariş": platform?.totalOrders || 0,
          Tamamlanan: platform?.completedOrders || 0,
          İptal: platform?.cancelledOrders || 0,
          "Brüt Ciro (TL)": platform?.grossRevenue || 0,
          "Teslim Edilen Ciro (TL)": platform?.deliveredRevenue || 0,
          "Teslimat Ücreti (TL)": platform?.deliveryFeeRevenue || 0,
          "Ort. Sipariş (TL)": platform?.averageOrderValue || 0,
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        ws["!cols"] = [
          { wch: 5 },
          { wch: 30 },
          { wch: 28 },
          { wch: 15 },
          { wch: 12 },
          { wch: 10 },
          { wch: 18 },
          { wch: 20 },
          { wch: 18 },
          { wch: 15 },
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Restoran Raporu");
        XLSX.writeFile(wb, `yemek-rapor-${period}-${entryId}.xlsx`);
        setToast({ message: `${entryId} raporu indirildi!`, type: "success" });
      } catch (err: unknown) {
        console.error("Export error:", err);
        setToast({
          message: `Excel hatası: ${err instanceof Error ? err.message : "Bilinmeyen hata"}`,
          type: "error",
        });
      } finally {
        setExportingId(null);
      }
    },
    [entries, period, collectionName, platformReports],
  );

  // ── Navigation ─────────────────────────────────────────────
  const handlePrev = () => {
    if (period === "monthly") {
      setYear((y) => y - 1);
    } else if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };
  const handleNext = () => {
    if (period === "monthly") {
      setYear((y) => y + 1);
    } else if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const selectedLabel = useMemo(() => {
    if (!selectedId) return null;
    const entry = entries.find((e) => e.id === selectedId);
    return entry?.label || selectedId;
  }, [selectedId, entries]);

  return (
    <div>
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 flex-wrap gap-2">
        <PeriodSubTabs activePeriod={period} onChange={setPeriod} />

        <div className="flex items-center gap-2">
          <button
            onClick={handleCalculate}
            disabled={!selectedId || triggerLoading}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selectedId
                ? "bg-orange-600 hover:bg-orange-700 text-white"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            } disabled:opacity-50`}
          >
            {triggerLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            {selectedId ? `Hesapla (${selectedLabel})` : "Dönem Seçin"}
          </button>
        </div>
      </div>

      {/* Period list */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden m-4">
        <MonthYearNav
          year={year}
          month={month}
          mode={period === "monthly" ? "year" : "month"}
          onPrev={handlePrev}
          onNext={handleNext}
        />

        {loadingReports ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {entries.map((entry) => {
              const report = platformReports.get(entry.id);
              const isExpanded = expandedId === entry.id;
              const isSelected = selectedId === entry.id;
              const hasReport = !!report;
              const isExporting = exportingId === entry.id;

              return (
                <div key={entry.id}>
                  <div
                    className={`flex items-center px-4 py-3 transition-colors ${
                      isSelected
                        ? "bg-orange-50/60"
                        : isExpanded
                          ? "bg-gray-50/80"
                          : "hover:bg-gray-50"
                    }`}
                  >
                    {/* Select */}
                    <button
                      onClick={() =>
                        !entry.isFuture &&
                        setSelectedId((prev) =>
                          prev === entry.id ? null : entry.id,
                        )
                      }
                      disabled={entry.isFuture}
                      className={`mr-3 flex-shrink-0 transition-colors ${
                        entry.isFuture
                          ? "text-gray-200 cursor-not-allowed"
                          : isSelected
                            ? "text-orange-600"
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
                      onClick={() => hasReport && handleExpand(entry.id)}
                      className={`w-6 mr-2 flex-shrink-0 ${
                        hasReport
                          ? "cursor-pointer text-gray-400 hover:text-gray-600"
                          : "text-transparent cursor-default"
                      }`}
                    >
                      {hasReport ? (
                        isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )
                      ) : (
                        <span className="w-4 h-4 block" />
                      )}
                    </button>

                    {/* Label */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">
                          {entry.label}
                        </span>
                        <span className="text-xs text-gray-400 font-mono">
                          {entry.sublabel}
                        </span>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="flex items-center gap-1.5 flex-shrink-0 px-2">
                      {hasReport ? (
                        <StatusBadge status="completed" />
                      ) : entry.isFuture ? (
                        <span className="text-xs text-gray-400">Gelecek</span>
                      ) : (
                        <StatusBadge status="pending" />
                      )}
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-6 flex-shrink-0">
                      {hasReport ? (
                        <>
                          <div className="text-right w-28">
                            <p className="text-xs text-gray-500">Brüt Ciro</p>
                            <p className="text-sm font-semibold text-gray-900">
                              {formatCurrency(report.grossRevenue)}
                            </p>
                          </div>
                          <div className="text-right w-20">
                            <p className="text-xs text-gray-500">Sipariş</p>
                            <p className="text-sm font-semibold text-gray-900">
                              {report.totalOrders?.toLocaleString()}
                            </p>
                          </div>
                          <div className="text-right w-28">
                            <p className="text-xs text-gray-500">
                              Teslim Edilen
                            </p>
                            <p className="text-sm font-semibold text-emerald-600">
                              {formatCurrency(report.deliveredRevenue)}
                            </p>
                          </div>
                          <div className="text-right w-20">
                            <p className="text-xs text-gray-500">Restoran</p>
                            <p className="text-sm font-semibold text-gray-900">
                              {report.restaurantCount?.toLocaleString() || "-"}
                            </p>
                          </div>
                        </>
                      ) : (
                        <div className="w-[296px]" />
                      )}
                    </div>

                    {/* Export */}
                    <div className="w-10 flex-shrink-0 pl-2 flex justify-end">
                      {hasReport && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExportExcel(entry.id);
                          }}
                          disabled={isExporting}
                          className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-all disabled:opacity-50"
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

                  {/* Expanded restaurant details */}
                  {isExpanded && hasReport && (
                    <div className="bg-gray-50/80 border-t border-gray-100 px-4 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <h3 className="text-sm font-semibold text-gray-700">
                            Restoran Detayları
                          </h3>
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                            <input
                              type="text"
                              placeholder="Restoran ara..."
                              value={restaurantSearch}
                              onChange={(e) =>
                                setRestaurantSearch(e.target.value)
                              }
                              className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-orange-500 w-56"
                            />
                          </div>
                        </div>
                      </div>

                      {loadingRestaurants ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                        </div>
                      ) : filteredRestaurants.length === 0 ? (
                        <div className="text-center py-8 text-sm text-gray-400">
                          {restaurantSearch
                            ? "Aramayla eşleşen restoran bulunamadı"
                            : "Bu dönem için restoran verisi yok"}
                        </div>
                      ) : (
                        <>
                          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 w-8">
                                    #
                                  </th>
                                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">
                                    Restoran
                                  </th>
                                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                                    Sipariş
                                  </th>
                                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-20">
                                    Tamamlanan
                                  </th>
                                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-16">
                                    İptal
                                  </th>
                                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-28">
                                    Brüt Ciro
                                  </th>
                                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-28">
                                    Teslim Edilen
                                  </th>
                                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-24">
                                    Teslimat Ücr.
                                  </th>
                                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-24">
                                    Ort. Sipariş
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {filteredRestaurants.map((r, idx) => (
                                  <tr
                                    key={r.restaurantId}
                                    className="hover:bg-gray-50 transition-colors"
                                  >
                                    <td className="px-3 py-2.5 text-xs text-gray-400">
                                      {idx + 1}
                                    </td>
                                    <td className="px-3 py-2.5">
                                      <p className="font-medium text-gray-900 text-sm">
                                        {r.restaurantName}
                                      </p>
                                      <p className="text-xs text-gray-400 font-mono truncate max-w-[200px]">
                                        {r.restaurantId}
                                      </p>
                                    </td>
                                    <td className="px-3 py-2.5 text-right text-gray-900 font-semibold">
                                      {r.totalOrders}
                                    </td>
                                    <td className="px-3 py-2.5 text-right text-emerald-600 font-medium">
                                      {r.completedOrders}
                                    </td>
                                    <td className="px-3 py-2.5 text-right text-red-500">
                                      {r.cancelledOrders}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-semibold text-gray-900">
                                      {formatCurrency(r.grossRevenue)}
                                    </td>
                                    <td className="px-3 py-2.5 text-right text-emerald-600 font-medium">
                                      {formatCurrency(r.deliveredRevenue)}
                                    </td>
                                    <td className="px-3 py-2.5 text-right text-gray-500">
                                      {formatCurrency(r.deliveryFeeRevenue)}
                                    </td>
                                    <td className="px-3 py-2.5 text-right text-gray-500">
                                      {formatCurrency(r.averageOrderValue)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          <p className="text-xs text-gray-400 mt-2 text-center">
                            {filteredRestaurants.length} restoran gösteriliyor
                            {restaurantSearch ? " (filtreli)" : ""} / toplam{" "}
                            {report.restaurantCount || "?"} restoran
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
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════

export default function AccountingPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<MainTab>("product");

  const functions = useMemo(() => {
    try {
      return getFunctions(getApp(), "europe-west3");
    } catch {
      return null;
    }
  }, []);

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
                    Satış Muhasebesi
                  </h1>
                  <p className="text-xs text-gray-500">
                    Günlük, haftalık ve aylık satış raporları
                  </p>
                </div>
              </div>
            </div>

            {/* Main Tabs */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setActiveTab("product")}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  activeTab === "product"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <ShoppingBag className="w-4 h-4" />
                Ürün Satışları
              </button>
              <button
                onClick={() => setActiveTab("food")}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  activeTab === "food"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <UtensilsCrossed className="w-4 h-4" />
                Yemek Satışları
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-[1400px] mx-auto">
          {activeTab === "product" ? (
            <ProductSalesTab functions={functions} />
          ) : (
            <FoodSalesTab functions={functions} />
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
