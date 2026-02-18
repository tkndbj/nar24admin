"use client";

import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Zap,
  BarChart3,
  TrendingUp,
  TrendingDown,
  MousePointerClick,
  ShoppingCart,
  Heart,
  SearchIcon,
  Store,
  Users,
  Download,
  Filter,
  Tag,
  XCircle,
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { doc, getDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "../../lib/firebase";
import { getApp } from "firebase/app";
import { useRouter } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface MonthlySummary {
  monthId: string;
  year: number;
  month: number;
  status: "processing" | "completed" | "failed";
  weekCount: number;
  error?: string;
  monthlyTotals: {
    totalClicks: number;
    totalViews: number;
    totalCartAdds: number;
    totalFavorites: number;
    totalSearches: number;
    totalPurchaseEvents: number;
    totalEvents: number;
    uniqueProducts: number;
    uniqueUsers: number;
  };
  weeklyTrend: WeeklyTrendItem[];
  weekOverWeek: WoWItem[];
  topCategoriesMonthly: AggCategory[];
  topBrandsMonthly: AggBrand[];
  genderMonthly: AggGender[];
  topSearchMonthly: { term: string; count: number }[];
  conversionMonthly: AggFunnel[];
  topSellersMonthly: AggSeller[];
}

interface WeeklyTrendItem {
  weekId: string;
  weekStartStr: string;
  totalClicks: number;
  totalCartAdds: number;
  totalPurchaseEvents: number;
  totalEvents: number;
  uniqueUsers: number;
}

interface WoWItem {
  weekId: string;
  prevWeekId: string;
  changes: {
    totalClicks: number;
    totalCartAdds: number;
    totalPurchaseEvents: number;
    totalEvents: number;
    uniqueUsers: number;
  };
}

interface AggCategory {
  category: string;
  clicks: number;
  cartAdds: number;
  purchases: number;
  favorites: number;
}

interface AggBrand {
  brand: string;
  clicks: number;
  cartAdds: number;
  purchases: number;
}

interface AggGender {
  gender: string;
  clicks: number;
  views: number;
  cartAdds: number;
  favorites: number;
  purchases: number;
  uniqueUsers: number;
  totalEngagement: number;
}

interface AggFunnel {
  category: string;
  clicks: number;
  cartAdds: number;
  purchases: number;
  clickToCartRate: number;
  cartToPurchaseRate: number;
  overallConversion: number;
}

interface AggSeller {
  sellerId: string;
  sellerName: string;
  shopId: string | null;
  totalRevenue: number;
  orderCount: number;
  totalQuantity: number;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
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

const GENDER_LABELS: Record<string, string> = {
  male: "Erkek",
  female: "Kadin",
  unisex: "Unisex",
  kids: "Cocuk",
  boy: "Erkek Cocuk",
  girl: "Kiz Cocuk",
};

const PIE_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#64748b",
];

const GENDER_COLORS: Record<string, string> = {
  male: "#3b82f6",
  female: "#ec4899",
  unisex: "#8b5cf6",
  kids: "#f59e0b",
  boy: "#06b6d4",
  girl: "#f43f5e",
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function formatNumber(n: number) {
  return new Intl.NumberFormat("tr-TR").format(n);
}

function weekLabel(weekId: string) {
  const parts = weekId.split("-");
  return `${parts[2]}/${parts[1]}`;
}

// ═══════════════════════════════════════════════════════════════
// SMALL COMPONENTS
// ═══════════════════════════════════════════════════════════════

function StatCard({
  icon: Icon,
  label,
  value,
  color = "text-gray-900",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
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
    </div>
  );
}

function ChangeIndicator({ value }: { value: number }) {
  if (value === 0) return <span className="text-xs text-gray-400">—</span>;
  const isPositive = value > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold ${isPositive ? "text-emerald-600" : "text-red-600"}`}
    >
      {isPositive ? (
        <TrendingUp className="w-3 h-3" />
      ) : (
        <TrendingDown className="w-3 h-3" />
      )}
      {isPositive ? "+" : ""}
      {value}%
    </span>
  );
}

function SectionTitle({
  icon: Icon,
  title,
}: {
  icon: React.ElementType;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="w-5 h-5 text-indigo-500" />
      <h2 className="text-sm font-bold text-gray-800">{title}</h2>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════

export default function AnalyticsDetailsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const dashboardRef = useRef<HTMLDivElement>(null);

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [forceRecalc, setForceRecalc] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const functions = useMemo(() => {
    try {
      return getFunctions(getApp(), "europe-west3");
    } catch {
      return null;
    }
  }, []);

  const monthId = useMemo(
    () => `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}`,
    [selectedYear, selectedMonth],
  );

  // ── Fetch summary ──────────────────────────────────────────
  const fetchSummary = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "admin_analytics_summary", monthId));
      if (snap.exists()) {
        setSummary(snap.data() as MonthlySummary);
      } else {
        setSummary(null);
      }
    } catch (err) {
      console.error("Error fetching summary:", err);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [user, monthId]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // ── Trigger generation ─────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!functions) return;
    setTriggerLoading(true);
    try {
      const fn = httpsCallable(functions, "triggerMonthlySummary");
      const res = await fn({
        year: selectedYear,
        month: selectedMonth + 1,
        force: forceRecalc,
      });
      const data = res.data as {
        success: boolean;
        result: { status: string; reason?: string };
      };
      if (data.success) {
        if (data.result.status === "skipped") {
          setToast({
            message:
              "Bu ay zaten hesaplandi. Zorla Yeniden Hesapla isaretleyin.",
            type: "error",
          });
        } else {
          setToast({
            message: "Aylik ozet basariyla olusturuldu!",
            type: "success",
          });
        }
        fetchSummary();
      }
    } catch (err: unknown) {
      setToast({
        message: `Hata: ${err instanceof Error ? err.message : "Bilinmeyen hata"}`,
        type: "error",
      });
    } finally {
      setTriggerLoading(false);
    }
  }, [functions, selectedYear, selectedMonth, forceRecalc, fetchSummary]);

  // ── PDF export ─────────────────────────────────────────────
  const handleExportPdf = useCallback(async () => {
    if (!dashboardRef.current) return;
    setExportingPdf(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");

      const element = dashboardRef.current;

      // html2canvas doesn't support oklch() colors (Tailwind v4).
      // Temporarily inject a stylesheet that forces all oklch values to fallback hex.
      const fixSheet = document.createElement("style");
      fixSheet.textContent = `
        *, *::before, *::after {
          --tw-ring-color: #6366f1 !important;
          border-color: inherit;
        }
      `;
      document.head.appendChild(fixSheet);

      // Also walk computed styles and inline any oklch background/color
      const cloned = element.cloneNode(true) as HTMLElement;
      cloned.style.position = "absolute";
      cloned.style.left = "-9999px";
      cloned.style.top = "0";
      cloned.style.width = element.offsetWidth + "px";
      document.body.appendChild(cloned);

      // Replace oklch in inline styles recursively
      const allEls = cloned.querySelectorAll("*");
      allEls.forEach((el) => {
        const htmlEl = el as HTMLElement;
        const computed = window.getComputedStyle(htmlEl);
        const bg = computed.backgroundColor;
        const color = computed.color;
        const borderColor = computed.borderColor;
        if (bg && bg.includes("oklch"))
          htmlEl.style.backgroundColor = "transparent";
        if (color && color.includes("oklch")) htmlEl.style.color = "#1f2937";
        if (borderColor && borderColor.includes("oklch"))
          htmlEl.style.borderColor = "#e5e7eb";
      });

      const canvas = await html2canvas(cloned, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#f9fafb",
      });

      // Cleanup
      document.body.removeChild(cloned);
      document.head.removeChild(fixSheet);

      const imgData = canvas.toDataURL("image/png");
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      const pdf = new jsPDF("p", "mm", "a4");
      let yOffset = 0;
      const pageHeight = 297;

      while (yOffset < imgHeight) {
        if (yOffset > 0) pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, -yOffset, imgWidth, imgHeight);
        yOffset += pageHeight;
      }

      pdf.save(`analiz-ozeti-${monthId}.pdf`);
      setToast({ message: "PDF indirildi!", type: "success" });
    } catch (err) {
      console.error("PDF export error:", err);
      setToast({ message: "PDF olusturulamadi", type: "error" });
    } finally {
      setExportingPdf(false);
    }
  }, [monthId]);

  // ── Navigation ─────────────────────────────────────────────
  const goToPrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((y) => y - 1);
    } else setSelectedMonth((m) => m - 1);
  };
  const goToNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else setSelectedMonth((m) => m + 1);
  };

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const isCompleted =
    summary?.status === "completed" && (summary?.weekCount ?? 0) > 0;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push("/analytics-center")}
                className="p-1.5 hover:bg-gray-100 rounded-lg"
              >
                <ArrowLeft className="w-4 h-4 text-gray-600" />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <BarChart3 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h1 className="text-base font-bold text-gray-900">
                    Aylik Analiz Ozeti
                  </h1>
                  <p className="text-xs text-gray-500">
                    Haftalik karsilastirmali detayli analiz
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none mr-1">
                <input
                  type="checkbox"
                  checked={forceRecalc}
                  onChange={(e) => setForceRecalc(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                />
                Zorla Yeniden Hesapla
              </label>
              <button
                onClick={handleGenerate}
                disabled={triggerLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium disabled:opacity-50"
              >
                {triggerLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5" />
                )}
                Ozeti Olustur
              </button>
              {isCompleted && (
                <button
                  onClick={handleExportPdf}
                  disabled={exportingPdf}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-medium disabled:opacity-50"
                >
                  {exportingPdf ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  PDF Indir
                </button>
              )}
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
          {/* Month selector */}
          <div className="flex items-center justify-center gap-4 mb-6">
            <button
              onClick={goToPrevMonth}
              className="p-2 hover:bg-gray-200 rounded-lg"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="flex items-center gap-2 bg-white px-6 py-2.5 rounded-xl border border-gray-200 shadow-sm">
              <Calendar className="w-5 h-5 text-indigo-500" />
              <h2 className="text-lg font-bold text-gray-900">
                {MONTHS_TR[selectedMonth]} {selectedYear}
              </h2>
            </div>
            <button
              onClick={goToNextMonth}
              className="p-2 hover:bg-gray-200 rounded-lg"
            >
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : !summary ? (
            <div className="text-center py-24">
              <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 mb-1">
                Bu ay icin ozet rapor bulunamadi.
              </p>
              <p className="text-xs text-gray-400">
                Yukaridaki &ldquo;Ozeti Olustur&rdquo; butonuna tiklayin.
              </p>
            </div>
          ) : summary.status === "failed" ? (
            <div className="text-center py-24">
              <XCircle className="w-12 h-12 text-red-300 mx-auto mb-3" />
              <p className="text-red-600 mb-1">
                Ozet olusturulurken hata meydana geldi.
              </p>
              <p className="text-xs text-red-400">{summary.error}</p>
            </div>
          ) : summary.status === "processing" ? (
            <div className="text-center py-24">
              <Loader2 className="w-12 h-12 text-blue-400 mx-auto mb-3 animate-spin" />
              <p className="text-gray-500">Ozet hazirlaniyor...</p>
            </div>
          ) : !isCompleted ? (
            <div className="text-center py-24">
              <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">
                Bu ay icin tamamlanmis haftalik rapor yok.
              </p>
              <p className="text-xs text-gray-400">
                Once &ldquo;Analiz Merkezi&rdquo; sayfasindan haftalik raporlari
                olusturun.
              </p>
            </div>
          ) : (
            <div ref={dashboardRef}>
              <Dashboard summary={summary} />
            </div>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════

function Dashboard({ summary }: { summary: MonthlySummary }) {
  const t = summary.monthlyTotals;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          icon={MousePointerClick}
          label="Tiklanma"
          value={t.totalClicks}
        />
        <StatCard
          icon={ShoppingCart}
          label="Sepete Ekleme"
          value={t.totalCartAdds}
        />
        <StatCard icon={Heart} label="Favori" value={t.totalFavorites} />
        <StatCard icon={SearchIcon} label="Arama" value={t.totalSearches} />
        <StatCard
          icon={BarChart3}
          label="Toplam Etkilesim"
          value={t.totalEvents}
          color="text-indigo-600"
        />
        <StatCard icon={Users} label="Kullanici" value={t.uniqueUsers} />
      </div>

      {/* Charts row 1: Weekly trend + Category pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <WeeklyTrendChart data={summary.weeklyTrend} />
        </div>
        <div>
          <CategoryPieChart data={summary.topCategoriesMonthly} />
        </div>
      </div>

      {/* Charts row 2: Gender pie + Brand bar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div>
          <GenderPieChart data={summary.genderMonthly} />
        </div>
        <div className="lg:col-span-2">
          <BrandBarChart data={summary.topBrandsMonthly} />
        </div>
      </div>

      {/* Conversion funnel chart */}
      <ConversionChart data={summary.conversionMonthly} />

      {/* Week-over-week comparison */}
      {summary.weekOverWeek && summary.weekOverWeek.length > 0 && (
        <WoWTable data={summary.weekOverWeek} />
      )}

      {/* Top sellers */}
      {summary.topSellersMonthly && summary.topSellersMonthly.length > 0 && (
        <SellersTable data={summary.topSellersMonthly} />
      )}

      {/* Top search terms */}
      {summary.topSearchMonthly && summary.topSearchMonthly.length > 0 && (
        <SearchTermsSection data={summary.topSearchMonthly} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CHART: Weekly Trend
// ═══════════════════════════════════════════════════════════════

function WeeklyTrendChart({ data }: { data: WeeklyTrendItem[] }) {
  const chartData = data.map((d) => ({
    name: weekLabel(d.weekId),
    Tiklanma: d.totalClicks,
    Sepet: d.totalCartAdds,
    Satis: d.totalPurchaseEvents,
    Kullanici: d.uniqueUsers,
  }));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <SectionTitle icon={BarChart3} title="Haftalik Etkilesim Trendi" />
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={chartData}
          margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Tiklanma" fill="#6366f1" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Sepet" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Satis" fill="#22c55e" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Kullanici" fill="#06b6d4" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CHART: Category Pie
// ═══════════════════════════════════════════════════════════════

function CategoryPieChart({ data }: { data: AggCategory[] }) {
  const top8 = data.slice(0, 8);
  const otherClicks = data.slice(8).reduce((s, c) => s + c.clicks, 0);
  const pieData = top8.map((c) => ({ name: c.category, value: c.clicks }));
  if (otherClicks > 0) pieData.push({ name: "Diger", value: otherClicks });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <SectionTitle icon={Filter} title="Kategori Dagilimi" />
      <ResponsiveContainer width="100%" height={400}>
        <PieChart>
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={90}
            dataKey="value"
            paddingAngle={2}
            label={({ name, percent }) =>
              `${name.length > 18 ? name.substring(0, 18) + "…" : name} ${(percent * 100).toFixed(0)}%`
            }
            labelLine={true}
          >
            {pieData.map((_, idx) => (
              <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v: number) => formatNumber(v)}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CHART: Gender Pie
// ═══════════════════════════════════════════════════════════════

function GenderPieChart({ data }: { data: AggGender[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <SectionTitle icon={Users} title="Cinsiyet Dagilimi" />
        <p className="text-xs text-gray-400 text-center py-12">Veri yok</p>
      </div>
    );
  }

  const pieData = data.map((g) => ({
    name: GENDER_LABELS[g.gender] || g.gender,
    value: g.totalEngagement,
    color: GENDER_COLORS[g.gender] || "#94a3b8",
  }));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <SectionTitle icon={Users} title="Cinsiyet Dagilimi" />
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            dataKey="value"
            paddingAngle={2}
            label={({ name, percent }) =>
              `${name} ${(percent * 100).toFixed(0)}%`
            }
            labelLine={false}
          >
            {pieData.map((entry, idx) => (
              <Cell key={idx} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v: number) => formatNumber(v)}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CHART: Brand Bar
// ═══════════════════════════════════════════════════════════════

function BrandBarChart({ data }: { data: AggBrand[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <SectionTitle icon={Tag} title="Marka Siralamasi" />
        <p className="text-xs text-gray-400 text-center py-12">Veri yok</p>
      </div>
    );
  }

  const chartData = data.slice(0, 10).map((b) => ({
    name: b.brand.length > 15 ? b.brand.substring(0, 15) + "…" : b.brand,
    Tiklanma: b.clicks,
    Sepet: b.cartAdds,
    Satis: b.purchases,
  }));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <SectionTitle icon={Tag} title="En Cok Tiklanan Markalar" />
      <ResponsiveContainer width="100%" height={420}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 5, right: 10, left: 80, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11 }}
            width={90}
          />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Tiklanma" fill="#f97316" radius={[0, 4, 4, 0]} />
          <Bar dataKey="Sepet" fill="#f59e0b" radius={[0, 4, 4, 0]} />
          <Bar dataKey="Satis" fill="#22c55e" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CHART: Conversion Funnel
// ═══════════════════════════════════════════════════════════════

function ConversionChart({ data }: { data: AggFunnel[] }) {
  if (!data || data.length === 0) return null;

  const chartData = data.slice(0, 10).map((f) => ({
    name:
      f.category.length > 20 ? f.category.substring(0, 20) + "…" : f.category,
    "Tik→Sepet %": f.clickToCartRate,
    "Sepet→Satis %": f.cartToPurchaseRate,
    "Genel %": f.overallConversion,
  }));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <SectionTitle icon={Filter} title="Kategori Donusum Oranlari" />
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={chartData}
          margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10 }}
            angle={-20}
            textAnchor="end"
            height={60}
          />
          <YAxis tick={{ fontSize: 12 }} unit="%" />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(v: number) => `${v}%`}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Tik→Sepet %" fill="#6366f1" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Sepet→Satis %" fill="#22c55e" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Genel %" fill="#f43f5e" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TABLE: Week-over-Week
// ═══════════════════════════════════════════════════════════════

function WoWTable({ data }: { data: WoWItem[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <SectionTitle icon={TrendingUp} title="Haftadan Haftaya Degisim" />
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">
                Hafta
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">
                Onceki
              </th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500">
                Tiklanma
              </th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500">
                Sepet
              </th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500">
                Satis
              </th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500">
                Etkilesim
              </th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500">
                Kullanici
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((row) => (
              <tr key={row.weekId} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-mono text-xs text-gray-700">
                  {weekLabel(row.weekId)}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-gray-400">
                  {weekLabel(row.prevWeekId)}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <ChangeIndicator value={row.changes.totalClicks} />
                </td>
                <td className="px-4 py-2.5 text-center">
                  <ChangeIndicator value={row.changes.totalCartAdds} />
                </td>
                <td className="px-4 py-2.5 text-center">
                  <ChangeIndicator value={row.changes.totalPurchaseEvents} />
                </td>
                <td className="px-4 py-2.5 text-center">
                  <ChangeIndicator value={row.changes.totalEvents} />
                </td>
                <td className="px-4 py-2.5 text-center">
                  <ChangeIndicator value={row.changes.uniqueUsers} />
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
// TABLE: Top Sellers
// ═══════════════════════════════════════════════════════════════

function SellersTable({ data }: { data: AggSeller[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <SectionTitle icon={Store} title="En Cok Satan Saticilar (Aylik)" />
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 w-8">
                #
              </th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">
                Satici
              </th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 w-28">
                Ciro
              </th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 w-20">
                Siparis
              </th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 w-20">
                Adet
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((s, idx) => (
              <tr key={s.sellerId} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 text-xs text-gray-400">{idx + 1}</td>
                <td className="px-4 py-2.5">
                  <p className="font-medium text-gray-900 text-sm">
                    {s.sellerName}
                  </p>
                  <p className="text-xs text-gray-400 font-mono truncate max-w-[200px]">
                    {s.sellerId}
                  </p>
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-emerald-600">
                  {formatCurrency(s.totalRevenue)}
                </td>
                <td className="px-4 py-2.5 text-right text-gray-700">
                  {formatNumber(s.orderCount)}
                </td>
                <td className="px-4 py-2.5 text-right text-gray-700">
                  {formatNumber(s.totalQuantity)}
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
// SECTION: Search Terms
// ═══════════════════════════════════════════════════════════════

function SearchTermsSection({
  data,
}: {
  data: { term: string; count: number }[];
}) {
  const maxCount = data[0]?.count || 1;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <SectionTitle icon={SearchIcon} title="En Cok Aranan Terimler (Aylik)" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {data.slice(0, 20).map((s, idx) => (
          <div
            key={idx}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50"
          >
            <span className="text-xs text-gray-400 font-mono w-5 text-right flex-shrink-0">
              {idx + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                &ldquo;{s.term}&rdquo;
              </p>
              <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                <div
                  className="bg-indigo-400 h-1.5 rounded-full"
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
