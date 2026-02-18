"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, useMemo, Suspense } from "react";
import { collection, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  searchShops,
  searchProducts,
  searchShopProducts,
  type AlgoliaShopHit,
  type AlgoliaProductHit,
  type AlgoliaShopProductHit,
} from "../lib/algolia/dashboardSearchService";
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
  Loader2,
  X,
  TrendingUp,
  ShoppingBag,
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

// Helper function to extract Firestore doc ID from Algolia objectID
function extractFirestoreId(objectID: string, collectionName: string): string {
  // Your Algolia objectID format: "collectionName_firestoreDocId"
  // Example: "shops_ocKXxNqJ5lB5sfEoNzZR" -> "ocKXxNqJ5lB5sfEoNzZR"
  const prefix = `${collectionName}_`;
  if (objectID.startsWith(prefix)) {
    return objectID.substring(prefix.length);
  }
  // Fallback if format is unexpected
  return objectID;
}

// Loading component for Suspense fallback
function SearchResultsLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <span className="text-sm font-medium text-gray-600">
            Yükleniyor...
          </span>
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
      // Execute all searches in parallel for better performance
      const [usersData, shopsData, productsData, shopProductsData] =
        await Promise.all([
          searchUsersInFirestore(searchLower),
          searchShops(searchQuery, { hitsPerPage: 100 }),
          searchProducts(searchQuery, { hitsPerPage: 100 }),
          searchShopProducts(searchQuery, { hitsPerPage: 100 }),
        ]);

      // Add users to results
      searchResults.push(...usersData);

      // Transform and add Algolia shop results
      shopsData.hits.forEach((shop: AlgoliaShopHit) => {
        const firestoreDocId = extractFirestoreId(shop.objectID, "shops");

        searchResults.push({
          id: firestoreDocId,
          type: "shop",
          name: shop.shopName || shop.name || "",
          description: shop.location?.city || "",
          address: shop.location?.addressLine1 || "",
          phone: "",
          email: "",
          imageUrl: "",
          createdAt: shop.createdAt || Timestamp.now(),
          category: shop.category || "",
        } as ShopResult);
      });

      // Transform and add Algolia product results
      productsData.hits.forEach((product: AlgoliaProductHit) => {
        const firestoreDocId = extractFirestoreId(product.objectID, "products");

        searchResults.push({
          id: firestoreDocId,
          type: "product",
          productName: product.productName,
          price: product.price,
          category: product.category,
          imageUrl: product.images?.[0] || "",
          createdAt: product.createdAt || Timestamp.now(),
          description: product.description || "",
        } as ProductResult);
      });

      // Transform and add Algolia shop product results
      shopProductsData.hits.forEach((shopProduct: AlgoliaShopProductHit) => {
        const firestoreDocId = extractFirestoreId(
          shopProduct.objectID,
          "shop_products"
        );

        searchResults.push({
          id: firestoreDocId,
          type: "shop_product",
          productName: shopProduct.productName,
          price: shopProduct.shopPrice || shopProduct.price,
          category: shopProduct.category,
          shopId: shopProduct.shopId,
          shopName: shopProduct.shopName,
          imageUrl: "",
          createdAt: shopProduct.createdAt || Timestamp.now(),
          description: "",
        } as ProductResult);
      });

      setResults(searchResults);
    } catch (error) {
      console.error("Arama hatası:", error);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to search users in Firestore
  async function searchUsersInFirestore(
    searchLower: string
  ): Promise<UserResult[]> {
    const userResults: UserResult[] = [];

    try {
      const usersSnapshot = await getDocs(collection(db, "users"));

      usersSnapshot.forEach((doc) => {
        const data = doc.data();
        if (
          data.displayName?.toLowerCase().includes(searchLower) ||
          data.email?.toLowerCase().includes(searchLower) ||
          doc.id?.toLowerCase().includes(searchLower)
        ) {
          userResults.push({
            id: doc.id,
            type: "user",
            displayName: data.displayName,
            email: data.email,
            createdAt: data.createdAt,
            photoURL: data.photoURL,
            phone: data.phone,
            location: data.location,
          } as UserResult);
        }
      });
    } catch (error) {
      console.error("Firestore user search error:", error);
    }

    return userResults;
  }

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

  // Calculate counts for each type
  const counts = useMemo(() => {
    return {
      all: results.length,
      user: results.filter((r) => r.type === "user").length,
      product: results.filter(
        (r) => r.type === "product" || r.type === "shop_product"
      ).length,
      shop: results.filter((r) => r.type === "shop").length,
    };
  }, [results]);

  const handleNewSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      router.push(`/searchresults?q=${encodeURIComponent(searchTerm.trim())}`);
    }
  };

  const formatDate = (timestamp: Timestamp) => {
    if (!timestamp) return "";
    try {
      return timestamp.toDate().toLocaleDateString("tr-TR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "";
    }
  };

  const getResultIcon = (type: string) => {
    switch (type) {
      case "user":
        return <User className="w-4 h-4 text-blue-600" />;
      case "product":
      case "shop_product":
        return <Package className="w-4 h-4 text-purple-600" />;
      case "shop":
        return <Store className="w-4 h-4 text-green-600" />;
      default:
        return <Search className="w-4 h-4 text-gray-600" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "user":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "product":
      case "shop_product":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "shop":
        return "bg-green-50 text-green-700 border-green-200";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };

  const getResultTypeText = (type: string) => {
    switch (type) {
      case "user":
        return "Kullanıcı";
      case "product":
        return "Ürün";
      case "shop_product":
        return "Dükkan Ürünü";
      case "shop":
        return "Dükkan";
      default:
        return type;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Compact Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Back Button & Title */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push("/dashboard")}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">
                  Arama Sonuçları
                </h1>
                {!loading && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {filteredResults.length} sonuç bulundu
                  </p>
                )}
              </div>
            </div>

            {/* Search Bar */}
            <form onSubmit={handleNewSearch} className="flex-1 max-w-xl mx-8">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Yeni arama yap..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-10 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Filter Tabs - Compact */}
        {!loading && results.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 mb-6">
            <div className="flex items-center gap-2 overflow-x-auto">
              <button
                onClick={() => setFilterType("all")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all ${
                  filterType === "all"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                }`}
              >
                Tümü ({counts.all})
              </button>
              {counts.user > 0 && (
                <button
                  onClick={() => setFilterType("user")}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all ${
                    filterType === "user"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  Kullanıcılar ({counts.user})
                </button>
              )}
              {counts.shop > 0 && (
                <button
                  onClick={() => setFilterType("shop")}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all ${
                    filterType === "shop"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  Dükkanlar ({counts.shop})
                </button>
              )}
              {counts.product > 0 && (
                <button
                  onClick={() => setFilterType("product")}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all ${
                    filterType === "product"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  Ürünler ({counts.product})
                </button>
              )}
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />
            <span className="text-sm text-gray-600">Aranıyor...</span>
          </div>
        )}

        {/* Results Grid - Compact */}
        {!loading && filteredResults.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
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
                  className={`bg-white border border-gray-200 rounded-lg p-3.5 transition-all duration-200 ${
                    isClickable
                      ? "hover:border-blue-300 hover:shadow-md cursor-pointer group"
                      : ""
                  }`}
                >
                  {/* Header - Compact */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-9 h-9 bg-gray-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      {getResultIcon(result.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3
                        className={`font-medium text-sm text-gray-900 truncate mb-1 ${
                          isClickable ? "group-hover:text-blue-700" : ""
                        }`}
                      >
                        {result.type === "user"
                          ? (result as UserResult).displayName
                          : result.type === "shop"
                          ? (result as ShopResult).name
                          : (result as ProductResult).productName}
                      </h3>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${getTypeColor(
                          result.type
                        )}`}
                      >
                        {getResultTypeText(result.type)}
                      </span>
                    </div>
                  </div>

                  {/* Details - Compact */}
                  <div className="space-y-1.5 text-xs">
                    {result.type === "user" && (
                      <>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">
                            {(result as UserResult).email}
                          </span>
                        </div>
                        {(result as UserResult).phone && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>{(result as UserResult).phone}</span>
                          </div>
                        )}
                      </>
                    )}

                    {(result.type === "product" ||
                      result.type === "shop_product") && (
                      <>
                        {(result as ProductResult).price && (
                          <div className="flex items-center gap-2 text-green-600 font-semibold">
                            <TrendingUp className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>
                              {(result as ProductResult).price?.toLocaleString(
                                "tr-TR"
                              )}{" "}
                              ₺
                            </span>
                          </div>
                        )}
                        {(result as ProductResult).category && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <Tag className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">
                              {(result as ProductResult).category}
                            </span>
                          </div>
                        )}
                        {result.type === "shop_product" &&
                          (result as ProductResult).shopName && (
                            <div className="flex items-center gap-2 text-gray-600">
                              <ShoppingBag className="w-3.5 h-3.5 flex-shrink-0" />
                              <span className="truncate">
                                {(result as ProductResult).shopName}
                              </span>
                            </div>
                          )}
                      </>
                    )}

                    {result.type === "shop" && (
                      <>
                        {(result as ShopResult).address && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">
                              {(result as ShopResult).address}
                            </span>
                          </div>
                        )}
                        {(result as ShopResult).category && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <Tag className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">
                              {(result as ShopResult).category}
                            </span>
                          </div>
                        )}
                      </>
                    )}

                    {/* Date - Always shown, compact */}
                    <div className="flex items-center gap-2 text-gray-400 pt-1.5 mt-1.5 border-t border-gray-100">
                      <Calendar className="w-3 h-3 flex-shrink-0" />
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

        {/* No Results - Compact */}
        {!loading && filteredResults.length === 0 && query && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Sonuç bulunamadı
            </h3>
            <p className="text-sm text-gray-600 mb-6 text-center max-w-md">
              &quot;{query}&quot; için herhangi bir sonuç bulunamadı. Farklı
              anahtar kelimeler deneyin.
            </p>
            <button
              onClick={() => router.push("/dashboard")}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
            >
              Panele Dön
            </button>
          </div>
        )}

        {/* No Query State */}
        {!loading && !query && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Arama yapmaya başlayın
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              Kullanıcı, dükkan veya ürün aramak için yukarıdaki arama çubuğunu
              kullanın.
            </p>
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
