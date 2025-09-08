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
  ChevronRight,
  Filter,
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
    <div className="min-h-screen bg-white">
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex items-center gap-3 text-gray-600">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <span className="font-medium">Sayfa yükleniyor...</span>
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
          data.email?.toLowerCase().includes(searchLower) ||
          doc.id?.toLowerCase().includes(searchLower)
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
          data.category?.toLowerCase().includes(searchLower) ||
          doc.id?.toLowerCase().includes(searchLower)
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
          data.category?.toLowerCase().includes(searchLower) ||
          doc.id?.toLowerCase().includes(searchLower)
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
          data.category?.toLowerCase().includes(searchLower) ||
          doc.id?.toLowerCase().includes(searchLower)
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
        return <User className="w-4 h-4 text-blue-600" />;
      case "product":
      case "shop_product":
        return <Package className="w-4 h-4 text-green-600" />;
      case "shop":
        return <Store className="w-4 h-4 text-purple-600" />;
      default:
        return <Search className="w-4 h-4 text-gray-500" />;
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

  const getTypeColor = (type: string) => {
    switch (type) {
      case "user":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "product":
      case "shop_product":
        return "bg-green-50 text-green-700 border-green-200";
      case "shop":
        return "bg-purple-50 text-purple-700 border-purple-200";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col gap-4">
            {/* Top Row */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => router.back()}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors font-medium"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Geri</span>
              </button>

              <h1 className="text-lg font-semibold text-gray-900">
                Arama Sonuçları
              </h1>

              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    setViewMode(viewMode === "grid" ? "list" : "grid")
                  }
                  className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  {viewMode === "grid" ? (
                    <List className="w-4 h-4 text-gray-700" />
                  ) : (
                    <Grid className="w-4 h-4 text-gray-700" />
                  )}
                </button>
              </div>
            </div>

            {/* Search Bar */}
            <form onSubmit={handleNewSearch} className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Kullanıcı, ürün, mağaza ara (isim veya ID ile)"
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                Ara
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Results Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-1">
              &quot;{query}&quot; için sonuçlar
            </h2>
            <p className="text-sm text-gray-600">
              {loading
                ? "Aranıyor..."
                : `${filteredResults.length} sonuç bulundu`}
            </p>
          </div>

          {/* Filter Buttons */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
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
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                    filterType === filter.key
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {filter.label} ({filter.count})
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3 text-gray-600">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              <span>Arama yapılıyor...</span>
            </div>
          </div>
        )}

        {/* Results Grid/List */}
        {!loading && filteredResults.length > 0 && (
          <div
            className={
              viewMode === "grid"
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                : "space-y-3"
            }
          >
            {filteredResults.map((result) => {
              const isClickable =
                result.type === "user" ||
                result.type === "shop" ||
                result.type === "product" ||
                result.type === "shop_product";

              const handleClick = () => {
                if (result.type === "user") {
                  router.push(`/userdetails?userId=${result.id}`);
                } else if (result.type === "shop") {
                  router.push(`/shopdetails?shopId=${result.id}`);
                } else if (
                  result.type === "product" ||
                  result.type === "shop_product"
                ) {
                  router.push(`/productdetails?productId=${result.id}`);
                }
              };

              return (
                <div
                  key={`${result.type}-${result.id}`}
                  onClick={isClickable ? handleClick : undefined}
                  className={`bg-white border border-gray-200 rounded-lg p-4 transition-all duration-200 ${
                    isClickable
                      ? "hover:border-blue-300 hover:shadow-md cursor-pointer group"
                      : "hover:border-gray-300"
                  }`}
                >
                  {/* Result Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="p-2 bg-gray-50 rounded-md">
                        {getResultIcon(result.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3
                            className={`font-medium text-gray-900 truncate ${
                              isClickable ? "group-hover:text-blue-700" : ""
                            }`}
                          >
                            {result.type === "user"
                              ? (result as UserResult).displayName
                              : result.type === "shop"
                              ? (result as ShopResult).name
                              : (result as ProductResult).productName}
                          </h3>
                        </div>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border ${getTypeColor(
                            result.type
                          )}`}
                        >
                          {getResultTypeText(result.type)}
                        </span>
                      </div>
                    </div>

                    {isClickable && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </div>
                    )}
                  </div>

                  {/* Result Details */}
                  <div className="space-y-2">
                    {result.type === "user" && (
                      <>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Mail className="w-3.5 h-3.5" />
                          <span className="text-sm truncate">
                            {(result as UserResult).email}
                          </span>
                        </div>
                        {(result as UserResult).phone && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <Phone className="w-3.5 h-3.5" />
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
                          <div className="flex items-center gap-2 text-green-600">
                            <DollarSign className="w-3.5 h-3.5" />
                            <span className="text-sm font-medium">
                              {(result as ProductResult).price} TL
                            </span>
                          </div>
                        )}
                        {(result as ProductResult).category && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <Tag className="w-3.5 h-3.5" />
                            <span className="text-sm">
                              {(result as ProductResult).category}
                            </span>
                          </div>
                        )}
                        {(result as ProductResult).description && (
                          <p className="text-sm text-gray-600 line-clamp-2">
                            {(result as ProductResult).description}
                          </p>
                        )}
                      </>
                    )}

                    {result.type === "shop" && (
                      <>
                        {(result as ShopResult).address && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <MapPin className="w-3.5 h-3.5" />
                            <span className="text-sm truncate">
                              {(result as ShopResult).address}
                            </span>
                          </div>
                        )}
                        {(result as ShopResult).phone && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <Phone className="w-3.5 h-3.5" />
                            <span className="text-sm">
                              {(result as ShopResult).phone}
                            </span>
                          </div>
                        )}
                        {(result as ShopResult).description && (
                          <p className="text-sm text-gray-600 line-clamp-2">
                            {(result as ShopResult).description}
                          </p>
                        )}
                      </>
                    )}

                    <div className="flex items-center gap-2 text-gray-500 pt-2 border-t border-gray-100">
                      <Calendar className="w-3.5 h-3.5" />
                      <span className="text-xs">
                        {formatDate(result.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* No Results */}
        {!loading && filteredResults.length === 0 && query && (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
              <Search className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Sonuç bulunamadı
            </h3>
            <p className="text-gray-600 mb-6">
              &quot;{query}&quot; araması için herhangi bir sonuç bulunamadı.
            </p>
            <button
              onClick={() => router.push("/dashboard")}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
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
