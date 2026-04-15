"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
} from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useActivityLog, createPageLogger } from "@/hooks/useActivityLog";
import {
  ArrowLeft,
  Search,
  ShoppingBag,
  Plus,
  Package,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import {
  MARKET_CATEGORIES,
  MARKET_CATEGORY_MAP,
  type MarketCategory,
} from "@/constants/marketCategories";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  endBefore,
  limitToLast,
  getDocs,
  QueryDocumentSnapshot,
  DocumentData,
  getCountFromServer,
  doc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "../lib/firebase";

// ── Types ─────────────────────────────────────────────────────────
interface MarketItem {
  id: string;
  name: string;
  brand: string;
  type: string;
  price: number;
  stock: number;
  category: string; // slug
  imageUrl: string;
  isAvailable: boolean;
  createdAt: Timestamp | null;
}

const PAGE_SIZE = 20;
const COLLECTION_NAME = "market-items";

function MarketItemsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { logActivity } = useActivityLog();
  const logger = createPageLogger(logActivity, "MarketItems");

  // ── State ────────────────────────────────────────────────────────
  const [items, setItems] = useState<MarketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  // Pagination cursors
  const [firstDoc, setFirstDoc] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [lastDoc, setLastDoc] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);

  // ── Category from URL ────────────────────────────────────────────
  const categorySlug = searchParams.get("category") || "";
  const activeCategory: MarketCategory | undefined =
    MARKET_CATEGORY_MAP.get(categorySlug);

  // ── Build base query constraints ─────────────────────────────────
  const baseConstraints = useMemo(() => {
    const constraints: QueryConstraint[] = [];
    if (categorySlug) {
      constraints.push(where("category", "==", categorySlug));
    }
    constraints.push(orderBy("createdAt", "desc"));
    return constraints;
  }, [categorySlug]);

  // ── Fetch total count (runs once per category change) ────────────
  useEffect(() => {
    let cancelled = false;

    async function fetchCount() {
      try {
        const q = categorySlug
          ? query(
              collection(db, COLLECTION_NAME),
              where("category", "==", categorySlug),
            )
          : query(collection(db, COLLECTION_NAME));
        const snap = await getCountFromServer(q);
        if (!cancelled) setTotalCount(snap.data().count);
      } catch {
        // Non-critical — UI still works without total
        if (!cancelled) setTotalCount(null);
      }
    }

    fetchCount();
    return () => {
      cancelled = true;
    };
  }, [categorySlug]);

  // ── Fetch page ───────────────────────────────────────────────────
  const fetchPage = useCallback(
    async (direction: "first" | "next" | "prev") => {
      setLoading(true);
      setError(null);

      try {
        const constraints = [...baseConstraints];

        if (direction === "next" && lastDoc) {
          constraints.push(startAfter(lastDoc), limit(PAGE_SIZE));
        } else if (direction === "prev" && firstDoc) {
          constraints.push(endBefore(firstDoc), limitToLast(PAGE_SIZE));
        } else {
          constraints.push(limit(PAGE_SIZE));
        }

        const q = query(collection(db, COLLECTION_NAME), ...constraints);
        const snap = await getDocs(q);

        const docs = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as MarketItem[];

        setItems(docs);
        setFirstDoc(snap.docs[0] || null);
        setLastDoc(snap.docs[snap.docs.length - 1] || null);

        // Check if there's a next page
        if (snap.docs.length === PAGE_SIZE) {
          const peekQ = query(
            collection(db, COLLECTION_NAME),
            ...baseConstraints,
            startAfter(snap.docs[snap.docs.length - 1]),
            limit(1),
          );
          const peek = await getDocs(peekQ);
          setHasNext(!peek.empty);
        } else {
          setHasNext(false);
        }

        if (direction === "next") setPage((p) => p + 1);
        else if (direction === "prev") setPage((p) => Math.max(1, p - 1));
        else setPage(1);
      } catch (err: unknown) {
        console.error("[MarketItems] Fetch error:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Ürünler yüklenirken hata oluştu.",
        );
      } finally {
        setLoading(false);
      }
    },
    [baseConstraints, firstDoc, lastDoc],
  );

  // ── Initial load + category change ───────────────────────────────
  const prevCategory = useRef(categorySlug);
  useEffect(() => {
    if (prevCategory.current !== categorySlug) {
      // Category changed — reset cursors
      setFirstDoc(null);
      setLastDoc(null);
      prevCategory.current = categorySlug;
    }
    fetchPage("first");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categorySlug]);

  // ── Local search filter (client-side within loaded page) ─────────
  const displayedItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.brand?.toLowerCase().includes(q) ||
        item.type?.toLowerCase().includes(q),
    );
  }, [items, search]);

  // ── Handlers ─────────────────────────────────────────────────────
  const handleCategoryChange = useCallback(
    (slug: string) => {
      const params = new URLSearchParams();
      if (slug) params.set("category", slug);
      router.push(`/market-items?${params.toString()}`);
    },
    [router],
  );

  const handleAddItem = useCallback(() => {
    logger.action("Add market item clicked", { category: categorySlug });
    const params = categorySlug ? `?category=${categorySlug}` : "";
    router.push(`/market-items/create${params}`);
  }, [router, logger, categorySlug]);

  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleToggleAvailability = useCallback(
    async (item: MarketItem) => {
      const next = !item.isAvailable;
      setTogglingId(item.id);
      // Optimistic update
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, isAvailable: next } : it,
        ),
      );
      try {
        await updateDoc(doc(db, COLLECTION_NAME, item.id), {
          isAvailable: next,
          updatedAt: serverTimestamp(),
        });
        logger.action("Toggled market item availability", {
          itemId: item.id,
          isAvailable: next,
        });
      } catch (err: unknown) {
        console.error("[MarketItems] Toggle error:", err);
        // Rollback
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id ? { ...it, isAvailable: !next } : it,
          ),
        );
        setError(
          err instanceof Error
            ? err.message
            : "Durum güncellenirken hata oluştu.",
        );
      } finally {
        setTogglingId(null);
      }
    },
    [logger],
  );

  // ── Render ───────────────────────────────────────────────────────
  const CategoryIcon = activeCategory?.icon || ShoppingBag;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
        {/* ── Header ─────────────────────────────────────────── */}
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push("/market")}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center shadow-sm">
                <CategoryIcon className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-gray-900 leading-tight">
                  {activeCategory?.labelTr || "Tüm Ürünler"}
                </h1>
                <p className="text-[11px] text-gray-500 leading-tight">
                  {activeCategory?.label || "Market Items"}
                  {totalCount !== null && ` · ${totalCount} ürün`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Search within page */}
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Ürün, marka veya tür ara..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all"
                />
              </div>

              <button
                onClick={handleAddItem}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-all text-xs font-medium shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Ürün Ekle
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-[1400px] mx-auto px-6 py-6">
          {/* ── Category pills ────────────────────────────────── */}
          <div className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-hide">
            <button
              onClick={() => handleCategoryChange("")}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                !categorySlug
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              Tümü
            </button>
            {MARKET_CATEGORIES.map((cat) => (
              <button
                key={cat.slug}
                onClick={() => handleCategoryChange(cat.slug)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  categorySlug === cat.slug
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}
              >
                {cat.labelTr}
              </button>
            ))}
          </div>

          {/* ── Error state ───────────────────────────────────── */}
          {error && (
            <div className="flex items-center gap-3 p-4 mb-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>{error}</p>
              <button
                onClick={() => fetchPage("first")}
                className="ml-auto text-red-600 hover:text-red-800 font-medium"
              >
                Tekrar Dene
              </button>
            </div>
          )}

          {/* ── Table ─────────────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[3fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <span>Ürün</span>
              <span>Marka</span>
              <span>Tür</span>
              <span>Kategori</span>
              <span className="text-right">Fiyat</span>
              <span className="text-right">Stok</span>
              <span className="text-center">Durum</span>
            </div>

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-20 text-gray-400">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                <span className="text-sm">Yükleniyor...</span>
              </div>
            )}

            {/* Empty */}
            {!loading && displayedItems.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Package className="w-12 h-12 mb-3" />
                <p className="text-sm font-medium">Ürün bulunamadı</p>
                <p className="text-xs mt-1">
                  {categorySlug
                    ? "Bu kategoride henüz ürün yok."
                    : "Henüz ürün eklenmemiş."}
                </p>
              </div>
            )}

            {/* Rows */}
            {!loading &&
              displayedItems.map((item) => {
                const cat = MARKET_CATEGORY_MAP.get(item.category);
                return (
                  <div
                    key={item.id}
                    className="grid grid-cols-[3fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-4 px-5 py-3 border-b border-gray-100 last:border-b-0 text-left w-full"
                  >
                    {/* Product */}
                    <div className="flex items-center gap-3 min-w-0">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-10 h-10 rounded-lg object-cover border border-gray-100 shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                          <Package className="w-4 h-4 text-gray-400" />
                        </div>
                      )}
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {item.name}
                      </span>
                    </div>

                    {/* Brand */}
                    <div className="flex items-center">
                      <span className="text-xs font-medium text-gray-700 truncate">
                        {item.brand || "—"}
                      </span>
                    </div>

                    {/* Type */}
                    <div className="flex items-center">
                      <span className="text-xs text-gray-500 truncate">
                        {item.type || "—"}
                      </span>
                    </div>

                    {/* Category */}
                    <div className="flex items-center">
                      <span className="text-xs text-gray-500 truncate">
                        {cat?.labelTr || item.category}
                      </span>
                    </div>

                    {/* Price */}
                    <div className="flex items-center justify-end">
                      <span className="text-sm font-semibold text-gray-800">
                        {item.price.toFixed(2)} TL
                      </span>
                    </div>

                    {/* Stock */}
                    <div className="flex items-center justify-end">
                      <span
                        className={`text-sm font-medium ${
                          item.stock <= 5
                            ? "text-red-600"
                            : item.stock <= 20
                              ? "text-amber-600"
                              : "text-gray-700"
                        }`}
                      >
                        {item.stock}
                      </span>
                    </div>

                    {/* Status toggle */}
                    <div className="flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => handleToggleAvailability(item)}
                        disabled={togglingId === item.id}
                        aria-label={
                          item.isAvailable
                            ? "Ürünü pasif yap"
                            : "Ürünü aktif yap"
                        }
                        title={item.isAvailable ? "Aktif" : "Pasif"}
                        className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          item.isAvailable ? "bg-emerald-500" : "bg-gray-300"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                            item.isAvailable
                              ? "translate-x-5"
                              : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>

          {/* ── Pagination ────────────────────────────────────── */}
          {!loading && items.length > 0 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-gray-500">
                Sayfa {page}
                {totalCount !== null &&
                  ` / ${Math.ceil(totalCount / PAGE_SIZE)}`}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchPage("prev")}
                  disabled={page <= 1}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Önceki
                </button>
                <button
                  onClick={() => fetchPage("next")}
                  disabled={!hasNext}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Sonraki
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}

export default function MarketItemsPage() {
  return (
    <Suspense fallback={null}>
      <MarketItemsContent />
    </Suspense>
  );
}
