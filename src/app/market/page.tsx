"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useMemo } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useActivityLog, createPageLogger } from "@/hooks/useActivityLog";
import {
  ArrowLeft,
  Search,
  ShoppingBag,
  ChevronRight,
  Package,
} from "lucide-react";
import {
  MARKET_CATEGORIES,
  type MarketCategory,
} from "@/constants/marketCategories";

// ── Tailwind color mapping ──────────────────────────────────────
// Static map so Tailwind can tree-shake unused classes at build time.
const COLOR_STYLES: Record<
  string,
  { bg: string; text: string; border: string; hoverBorder: string }
> = {
  rose: {
    bg: "bg-rose-50",
    text: "text-rose-600",
    border: "border-rose-100",
    hoverBorder: "hover:border-rose-300",
  },
  amber: {
    bg: "bg-amber-50",
    text: "text-amber-600",
    border: "border-amber-100",
    hoverBorder: "hover:border-amber-300",
  },
  orange: {
    bg: "bg-orange-50",
    text: "text-orange-600",
    border: "border-orange-100",
    hoverBorder: "hover:border-orange-300",
  },
  sky: {
    bg: "bg-sky-50",
    text: "text-sky-600",
    border: "border-sky-100",
    hoverBorder: "hover:border-sky-300",
  },
  green: {
    bg: "bg-green-50",
    text: "text-green-600",
    border: "border-green-100",
    hoverBorder: "hover:border-green-300",
  },
  red: {
    bg: "bg-red-50",
    text: "text-red-600",
    border: "border-red-100",
    hoverBorder: "hover:border-red-300",
  },
  stone: {
    bg: "bg-stone-50",
    text: "text-stone-600",
    border: "border-stone-100",
    hoverBorder: "hover:border-stone-300",
  },
  yellow: {
    bg: "bg-yellow-50",
    text: "text-yellow-600",
    border: "border-yellow-100",
    hoverBorder: "hover:border-yellow-300",
  },
  lime: {
    bg: "bg-lime-50",
    text: "text-lime-600",
    border: "border-lime-100",
    hoverBorder: "hover:border-lime-300",
  },
  pink: {
    bg: "bg-pink-50",
    text: "text-pink-600",
    border: "border-pink-100",
    hoverBorder: "hover:border-pink-300",
  },
  emerald: {
    bg: "bg-emerald-50",
    text: "text-emerald-600",
    border: "border-emerald-100",
    hoverBorder: "hover:border-emerald-300",
  },
  blue: {
    bg: "bg-blue-50",
    text: "text-blue-600",
    border: "border-blue-100",
    hoverBorder: "hover:border-blue-300",
  },
  indigo: {
    bg: "bg-indigo-50",
    text: "text-indigo-600",
    border: "border-indigo-100",
    hoverBorder: "hover:border-indigo-300",
  },
  violet: {
    bg: "bg-violet-50",
    text: "text-violet-600",
    border: "border-violet-100",
    hoverBorder: "hover:border-violet-300",
  },
  slate: {
    bg: "bg-slate-50",
    text: "text-slate-600",
    border: "border-slate-100",
    hoverBorder: "hover:border-slate-300",
  },
  fuchsia: {
    bg: "bg-fuchsia-50",
    text: "text-fuchsia-600",
    border: "border-fuchsia-100",
    hoverBorder: "hover:border-fuchsia-300",
  },
  cyan: {
    bg: "bg-cyan-50",
    text: "text-cyan-600",
    border: "border-cyan-100",
    hoverBorder: "hover:border-cyan-300",
  },
  purple: {
    bg: "bg-purple-50",
    text: "text-purple-600",
    border: "border-purple-100",
    hoverBorder: "hover:border-purple-300",
  },
  teal: {
    bg: "bg-teal-50",
    text: "text-teal-600",
    border: "border-teal-100",
    hoverBorder: "hover:border-teal-300",
  },
  zinc: {
    bg: "bg-zinc-50",
    text: "text-zinc-600",
    border: "border-zinc-100",
    hoverBorder: "hover:border-zinc-300",
  },
};

const FALLBACK_STYLE = COLOR_STYLES.slate;

export default function MarketPage() {
  const router = useRouter();
  const { logActivity } = useActivityLog();
  const logger = createPageLogger(logActivity, "Market");

  const [search, setSearch] = useState("");

  // ── Derived: filtered categories ────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return MARKET_CATEGORIES;
    const q = search.toLowerCase();
    return MARKET_CATEGORIES.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.labelTr.toLowerCase().includes(q) ||
        c.slug.includes(q),
    );
  }, [search]);

  // ── Handlers ────────────────────────────────────────────────────
  const handleCategoryClick = useCallback(
    (cat: MarketCategory) => {
      logger.navigate(cat.labelTr, { category: cat.slug });
      router.push(`/market-items?category=${cat.slug}`);
    },
    [router, logger],
  );

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
        {/* ── Header ───────────────────────────────────────────── */}
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push("/")}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center shadow-sm">
                <ShoppingBag className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-gray-900 leading-tight">
                  Market Yönetimi
                </h1>
                <p className="text-[11px] text-gray-500 leading-tight">
                  Kategori ve ürün yönetimi
                </p>
              </div>
            </div>

            {/* Search */}
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Kategori ara..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all"
              />
            </div>
          </div>
        </header>

        {/* ── Content ──────────────────────────────────────────── */}
        <main className="max-w-[1400px] mx-auto px-6 py-10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Kategoriler</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {MARKET_CATEGORIES.length} kategori
              </p>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Package className="w-12 h-12 mb-3" />
              <p className="text-sm font-medium">Kategori bulunamadı</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {filtered.map((cat) => {
                const Icon = cat.icon;
                const s = COLOR_STYLES[cat.color] || FALLBACK_STYLE;

                return (
                  <button
                    key={cat.slug}
                    onClick={() => handleCategoryClick(cat)}
                    className={`group flex flex-col items-center gap-3 p-5 bg-white border ${s.border} rounded-xl shadow-sm transition-all hover:shadow-md ${s.hoverBorder} cursor-pointer`}
                  >
                    <div
                      className={`p-3 rounded-xl ${s.bg} ${s.text} transition-transform group-hover:scale-110`}
                    >
                      <Icon className="w-6 h-6" />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-semibold text-gray-800 leading-tight">
                        {cat.labelTr}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {cat.label}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-all group-hover:translate-x-0.5" />
                  </button>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
