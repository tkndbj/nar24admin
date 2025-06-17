"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, useMemo, Suspense } from "react";
import { collection, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  Search,
  User,
  Package,
  Store,
  ArrowLeft,
  Mail,
  Calendar,
  MapPin,
  Phone,
  Tag,
  DollarSign,
  Grid,
  List,
  Loader2,
  ArrowRight,
} from "lucide-react";

interface UserResult {
  id: string;
  type: "user";
  displayName: string;
  email: string;
  createdAt: Timestamp;
  photoURL?: string;
  phone?: string;
  location?: string;
}

interface ProductResult {
  id: string;
  type: "product" | "shop_product";
  productName: string;
  price?: number;
  category?: string;
  shopId?: string;
  shopName?: string;
  imageUrl?: string;
  createdAt: Timestamp;
  description?: string;
}

interface ShopResult {
  id: string;
  type: "shop";
  name: string;
  description?: string;
  address?: string;
  phone?: string;
  email?: string;
  imageUrl?: string;
  createdAt: Timestamp;
  category?: string;
}

type SearchResult = UserResult | ProductResult | ShopResult;

// Loading component for Suspense fallback
function SearchResultsLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex items-center gap-3 text-white">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Sayfa yükleniyor...</span>
        </div>
      </div>
    </div>
  );
}

// Main search results component
function SearchResultsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";

  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filterType, setFilterType] = useState<
    "all" | "user" | "product" | "shop"
  >("all");
  const [searchTerm, setSearchTerm] = useState(query);

  // Perform search when component mounts or query changes
  useEffect(() => {
    if (query) {
      performSearch(query);
    } else {
      setLoading(false);
    }
  }, [query]);

  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    const searchResults: SearchResult[] = [];
    const searchLower = searchQuery.toLowerCase();

    try {
      // Search Users
      const usersSnapshot = await getDocs(collection(db, "users"));
      usersSnapshot.forEach((doc) => {
        const data = doc.data();
        if (
          data.displayName?.toLowerCase().includes(searchLower) ||
          data.email?.toLowerCase().includes(searchLower)
        ) {
          searchResults.push({
            id: doc.id,
            type: "user",
            ...data,
          } as UserResult);
        }
      });

      // Search Products collection
      const productsSnapshot = await getDocs(collection(db, "products"));
      productsSnapshot.forEach((doc) => {
        const data = doc.data();
        if (
          data.productName?.toLowerCase().includes(searchLower) ||
          data.description?.toLowerCase().includes(searchLower) ||
          data.category?.toLowerCase().includes(searchLower)
        ) {
          searchResults.push({
            id: doc.id,
            type: "product",
            ...data,
          } as ProductResult);
        }
      });

      // Search Shop Products collection
      const shopProductsSnapshot = await getDocs(
        collection(db, "shop_products")
      );
      shopProductsSnapshot.forEach((doc) => {
        const data = doc.data();
        if (
          data.productName?.toLowerCase().includes(searchLower) ||
          data.description?.toLowerCase().includes(searchLower) ||
          data.category?.toLowerCase().includes(searchLower)
        ) {
          searchResults.push({
            id: doc.id,
            type: "shop_product",
            ...data,
          } as ProductResult);
        }
      });

      // Search Shops collection
      const shopsSnapshot = await getDocs(collection(db, "shops"));
      shopsSnapshot.forEach((doc) => {
        const data = doc.data();
        if (
          data.name?.toLowerCase().includes(searchLower) ||
          data.description?.toLowerCase().includes(searchLower) ||
          data.address?.toLowerCase().includes(searchLower) ||
          data.category?.toLowerCase().includes(searchLower)
        ) {
          searchResults.push({
            id: doc.id,
            type: "shop",
            ...data,
          } as ShopResult);
        }
      });

      setResults(searchResults);
    } catch (error) {
      console.error("Arama hatası:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filter results based on selected type
  const filteredResults = useMemo(() => {
    if (filterType === "all") return results;

    if (filterType === "product") {
      return results.filter(
        (result) => result.type === "product" || result.type === "shop_product"
      );
    }

    return results.filter((result) => result.type === filterType);
  }, [results, filterType]);

  const handleNewSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      router.push(`/searchresults?q=${encodeURIComponent(searchTerm.trim())}`);
    }
  };

  const formatDate = (timestamp: Timestamp) => {
    if (!timestamp) return "Tarih yok";
    try {
      return timestamp.toDate().toLocaleDateString("tr-TR");
    } catch {
      return "Tarih yok";
    }
  };

  const getResultIcon = (type: string) => {
    switch (type) {
      case "user":
        return <User className="w-5 h-5 text-blue-400" />;
      case "product":
      case "shop_product":
        return <Package className="w-5 h-5 text-green-400" />;
      case "shop":
        return <Store className="w-5 h-5 text-purple-400" />;
      default:
        return <Search className="w-5 h-5 text-gray-400" />;
    }
  };

  const getResultTypeText = (type: string) => {
    switch (type) {
      case "user":
        return "Kullanıcı";
      case "product":
        return "Ürün";
      case "shop_product":
        return "Mağaza Ürünü";
      case "shop":
        return "Mağaza";
      default:
        return "Bilinmeyen";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="backdrop-blur-xl bg-white/10 border-b border-white/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col gap-4">
            {/* Top Row */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => router.back()}
                className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span>Geri</span>
              </button>

              <h1 className="text-xl font-bold text-white">
                Arama Sonuçları
              </h1>

              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    setViewMode(viewMode === "grid" ? "list" : "grid")
                  }
                  className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                >
                  {viewMode === "grid" ? (
                    <List className="w-5 h-5 text-white" />
                  ) : (
                    <Grid className="w-5 h-5 text-white" />
                  )}
                </button>
              </div>
            </div>

            {/* Search Bar */}
            <form onSubmit={handleNewSearch} className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Yeni arama yapın..."
                  className="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                />
              </div>
              <button
                type="submit"
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium rounded-xl transition-all duration-200"
              >
                Ara
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Results Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">
              &quot;{query}&quot; için sonuçlar
            </h2>
            <p className="text-gray-300">
              {loading
                ? "Aranıyor..."
                : `${filteredResults.length} sonuç bulundu`}
            </p>
          </div>

          {/* Filter Buttons */}
          <div className="flex flex-wrap gap-2">
            {[
              { key: "all", label: "Tümü", count: results.length },
              {
                key: "user",
                label: "Kullanıcılar",
                count: results.filter((r) => r.type === "user").length,
              },
              {
                key: "product",
                label: "Ürünler",
                count: results.filter(
                  (r) => r.type === "product" || r.type === "shop_product"
                ).length,
              },
              {
                key: "shop",
                label: "Mağazalar",
                count: results.filter((r) => r.type === "shop").length,
              },
            ].map((filter) => (
              <button
                key={filter.key}
                onClick={() =>
                  setFilterType(
                    filter.key as "all" | "user" | "product" | "shop"
                  )
                }
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  filterType === filter.key
                    ? "bg-blue-600 text-white"
                    : "bg-white/10 text-gray-300 hover:bg-white/20"
                }`}
              >
                {filter.label} ({filter.count})
              </button>
            ))}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3 text-white">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>Arama yapılıyor...</span>
            </div>
          </div>
        )}

        {/* Results Grid/List */}
        {!loading && filteredResults.length > 0 && (
          <div
            className={
              viewMode === "grid"
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                : "space-y-4"
            }
          >
         {filteredResults.map((result) => {
  const isClickable = result.type === "user" || result.type === "shop" || result.type === "product" || result.type === "shop_product";
  
  const handleClick = () => {
    if (result.type === "user") {
      router.push(`/userdetails?userId=${result.id}`);
    } else if (result.type === "shop") {
      router.push(`/shopdetails?shopId=${result.id}`);
    } else if (result.type === "product" || result.type === "shop_product") {
      router.push(`/productdetails?productId=${result.id}`);
    }
  };

  return (
    <div
      key={`${result.type}-${result.id}`}
      onClick={isClickable ? handleClick : undefined}
      className={`backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-6 transition-all duration-200 ${
        isClickable 
          ? 'hover:bg-white/15 cursor-pointer hover:border-blue-500/50 hover:scale-[1.02] group' 
          : 'hover:bg-white/15'
      }`}
    >
      {/* Result Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {getResultIcon(result.type)}
          <div>
            <h3 className={`font-semibold text-white ${isClickable ? 'group-hover:text-blue-300' : ''}`}>
              {result.type === "user"
                ? (result as UserResult).displayName
                : result.type === "shop"
                ? (result as ShopResult).name
                : (result as ProductResult).productName}
            </h3>
            <span className="text-sm text-gray-400">
              {getResultTypeText(result.type)}
            </span>
          </div>
        </div>
        
        {/* Add a visual indicator for clickable items */}
        {isClickable && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <ArrowRight className="w-5 h-5 text-blue-400" />
          </div>
        )}
      </div>

                {/* Result Details */}
                <div className="space-y-2">
                  {result.type === "user" && (
                    <>
                      <div className="flex items-center gap-2 text-gray-300">
                        <Mail className="w-4 h-4" />
                        <span className="text-sm">
                          {(result as UserResult).email}
                        </span>
                      </div>
                      {(result as UserResult).phone && (
                        <div className="flex items-center gap-2 text-gray-300">
                          <Phone className="w-4 h-4" />
                          <span className="text-sm">
                            {(result as UserResult).phone}
                          </span>
                        </div>
                      )}
                    </>
                  )}

                  {(result.type === "product" ||
                    result.type === "shop_product") && (
                    <>
                      {(result as ProductResult).price && (
                        <div className="flex items-center gap-2 text-green-400">
                          <DollarSign className="w-4 h-4" />
                          <span className="text-sm font-medium">
                            {(result as ProductResult).price} TL
                          </span>
                        </div>
                      )}
                      {(result as ProductResult).category && (
                        <div className="flex items-center gap-2 text-gray-300">
                          <Tag className="w-4 h-4" />
                          <span className="text-sm">
                            {(result as ProductResult).category}
                          </span>
                        </div>
                      )}
                      {(result as ProductResult).description && (
                        <p className="text-sm text-gray-300 line-clamp-2">
                          {(result as ProductResult).description}
                        </p>
                      )}
                    </>
                  )}

                  {result.type === "shop" && (
                    <>
                      {(result as ShopResult).address && (
                        <div className="flex items-center gap-2 text-gray-300">
                          <MapPin className="w-4 h-4" />
                          <span className="text-sm">
                            {(result as ShopResult).address}
                          </span>
                        </div>
                      )}
                      {(result as ShopResult).phone && (
                        <div className="flex items-center gap-2 text-gray-300">
                          <Phone className="w-4 h-4" />
                          <span className="text-sm">
                            {(result as ShopResult).phone}
                          </span>
                        </div>
                      )}
                      {(result as ShopResult).description && (
                        <p className="text-sm text-gray-300 line-clamp-2">
                          {(result as ShopResult).description}
                        </p>
                      )}
                    </>
                  )}

                  <div className="flex items-center gap-2 text-gray-400 pt-2 border-t border-white/10">
                    <Calendar className="w-4 h-4" />
                    <span className="text-sm">
                      {formatDate(result.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
            )})}
          </div>
        )}

        {/* No Results */}
        {!loading && filteredResults.length === 0 && query && (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-600/20 rounded-full mb-4">
              <Search className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              Sonuç bulunamadı
            </h3>
            <p className="text-gray-300 mb-6">
              &quot;{query}&quot; araması için herhangi bir sonuç bulunamadı.
            </p>
            <button
              onClick={() => router.push("/dashboard")}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium rounded-xl transition-all duration-200"
            >
              Panele Dön
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

// Main exported component with Suspense wrapper
export default function SearchResults() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<SearchResultsLoading />}>
        <SearchResultsContent />
      </Suspense>
    </ProtectedRoute>
  );
}