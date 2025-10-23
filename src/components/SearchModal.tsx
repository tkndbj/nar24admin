"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  Search,
  Store,
  Package,
  Loader2,
  AlertCircle,
  Check,
  Tag,
  MapPin,
  Star,
  TrendingUp,
} from "lucide-react";

import type {
  AlgoliaShopHit,
  AlgoliaShopProductHit,
} from "@/app/lib/algolia/dashboardSearchService";
import * as dashboardSearchService from "@/app/lib/algolia/dashboardSearchService";
// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type SearchType = "shops" | "shop_products" | "both";
export type SelectionType = "shop" | "shop_product";

export interface SearchSelection {
  id: string;
  name: string;
  type: SelectionType;
  data?: AlgoliaShopHit | AlgoliaShopProductHit;
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (selection: SearchSelection) => void;
  searchType?: SearchType;
  title?: string;
  placeholder?: string;
  selectedId?: string | null;
  maxResults?: number;
}

interface TabConfig {
  id: SearchType;
  label: string;
  icon: React.ReactNode;
  description: string;
}

// ============================================================================
// SEARCH MODAL COMPONENT
// ============================================================================

export default function SearchModal({
  isOpen,
  onClose,
  onSelect,
  searchType = "both",
  title = "Bağlantı Ekle",
  placeholder = "Mağaza veya ürün ara...",
  selectedId = null,
  maxResults = 20,
}: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"shops" | "shop_products">(
    searchType === "shops" ? "shops" : "shop_products"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shops, setShops] = useState<AlgoliaShopHit[]>([]);
  const [shopProducts, setShopProducts] = useState<AlgoliaShopProductHit[]>([]);
  const [selected, setSelected] = useState<string | null>(selectedId);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (searchType === "shops") setActiveTab("shops");
    else if (searchType === "shop_products") setActiveTab("shop_products");
    else setActiveTab("shop_products"); // both için varsayılan ürünler
  }, [searchType]);

  // Tab configuration
  const tabs: TabConfig[] = [
    {
      id: "shop_products" as SearchType,
      label: "Ürünler",
      icon: <Package className="w-4 h-4" key="products-icon" />,
      description: "Mağaza ürünlerini ara",
    },
    {
      id: "shops" as SearchType,
      label: "Mağazalar",
      icon: <Store className="w-4 h-4" key="shops-icon" />,
      description: "Mağazaları ara",
    },
  ];

  // Filter tabs based on searchType prop
  const availableTabs = tabs.filter((tab) => {
    if (searchType === "both") return true;
    if (searchType === "shops") return tab.id === "shops";
    if (searchType === "shop_products") return tab.id === "shop_products";
    return false;
  });

  // Perform search
  const performSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setShops([]);
        setShopProducts([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        let nextShops: AlgoliaShopHit[] = [];
        let nextShopProducts: AlgoliaShopProductHit[] = [];

        // Search without status filter (FIXED)
        if (searchType === "both" || searchType === "shops") {
          const shopsResult = await dashboardSearchService.searchShops(
            searchQuery,
            {
              hitsPerPage: maxResults,
              // No status filter - this was causing the issue
            }
          );

          nextShops = shopsResult.hits;
          setShops(nextShops);
        }

        if (searchType === "both" || searchType === "shop_products") {
          const productsResult =
            await dashboardSearchService.searchShopProducts(searchQuery, {
              hitsPerPage: maxResults,
              // No status filter - this was causing the issue
            });

          nextShopProducts = productsResult.hits;
          setShopProducts(nextShopProducts);
        }

        // Otomatik sekme geçişi: aktif sekmede sonuç yoksa, diğerinde varsa oraya geç
        if (searchType === "both") {
          if (
            activeTab === "shop_products" &&
            nextShopProducts.length === 0 &&
            nextShops.length > 0
          ) {
            setActiveTab("shops");
          } else if (
            activeTab === "shops" &&
            nextShops.length === 0 &&
            nextShopProducts.length > 0
          ) {
            setActiveTab("shop_products");
          }
        }
      } catch (err) {
        console.error("Search error:", err);
        setError("Arama yapılırken bir hata oluştu. Lütfen tekrar deneyin.");
      } finally {
        setLoading(false);
      }
    },
    [searchType, maxResults, activeTab]
  );

  // Debounced search
  const debouncedSearch = useCallback(
    (value: string) => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      debounceTimer.current = setTimeout(() => {
        performSearch(value);
      }, 300);
    },
    [performSearch]
  );

  // Handle query change
  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    debouncedSearch(value);
  };

  // FIXED VERSION:
  const handleSelect = (
    item: AlgoliaShopHit | AlgoliaShopProductHit,
    type: SelectionType
  ) => {
    // Extract Firestore ID from Algolia objectID
    let firestoreId: string;

    if (type === "shop") {
      // objectID format: "shops_FIRESTORE_ID"
      firestoreId = (item as AlgoliaShopHit).objectID.replace("shops_", "");
    } else {
      // objectID format: "shop_products_FIRESTORE_ID"
      firestoreId = (item as AlgoliaShopProductHit).objectID.replace(
        "shop_products_",
        ""
      );
    }

    const selection: SearchSelection = {
      id: firestoreId, // Use extracted Firestore ID
      name:
        type === "shop"
          ? (item as AlgoliaShopHit).name || (item as AlgoliaShopHit).shopName
          : (item as AlgoliaShopProductHit).productName,
      type,
      data: item,
    };

    setSelected(firestoreId);
    onSelect(selection);
  };

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    } else {
      // Reset state when modal closes
      setQuery("");
      setShops([]);
      setShopProducts([]);
      setError(null);
      setSelected(selectedId);
    }
  }, [isOpen, selectedId]);

  // Handle ESC key - FIXED: Removed onClose from dependencies
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen]); // Only depend on isOpen

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-label="Close modal"
      />

      <div className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-600 mt-1">
              Aramak istediğiniz mağaza veya ürünü bulun
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-6 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={handleQueryChange}
              placeholder={placeholder}
              className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
            />
          </div>
        </div>

        {/* Tabs - Only show if searchType is "both" */}
        {searchType === "both" && availableTabs.length > 1 && (
          <div className="px-6 pt-4 border-b border-gray-200">
            <div className="flex gap-2">
              {availableTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() =>
                    setActiveTab(tab.id as "shops" | "shop_products")
                  }
                  className={`
                    flex items-center gap-2 px-4 py-2.5 rounded-t-lg font-medium transition-all
                    ${
                      activeTab === tab.id
                        ? "bg-orange-50 text-orange-600 border-b-2 border-orange-500"
                        : "text-gray-600 hover:bg-gray-50"
                    }
                  `}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {tab.id === "shop_products" && shopProducts.length > 0 && (
                    <span className="ml-1 px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full text-xs font-semibold">
                      {shopProducts.length}
                    </span>
                  )}
                  {tab.id === "shops" && shops.length > 0 && (
                    <span className="ml-1 px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full text-xs font-semibold">
                      {shops.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {!query ? (
            <div className="text-center py-12">
              <Search className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 text-lg">
                Aramaya başlamak için bir anahtar kelime girin
              </p>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 text-orange-600 animate-spin mb-4" />
              <p className="text-gray-600">Aranıyor...</p>
            </div>
          ) : (
            <>
              {/* Shop Products Results */}
              {(searchType === "shop_products" ||
                (searchType === "both" && activeTab === "shop_products")) && (
                <div className="space-y-2">
                  {shopProducts.length === 0 ? (
                    <div className="text-center py-12">
                      <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600">
                        &quot;{query}&quot; ile eşleşen ürün bulunamadı
                      </p>
                      <p className="text-gray-500 text-sm mt-2">
                        Farklı anahtar kelimeler deneyin veya mağazalar
                        sekmesine bakın
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {shopProducts.map((product) => {
                        const productFirestoreId = product.objectID.replace(
                          "shop_products_",
                          ""
                        );
                        return (
                          <button
                            key={product.objectID}
                            onClick={() =>
                              handleSelect(product, "shop_product")
                            }
                            className={`
                            w-full text-left p-4 rounded-xl border transition-all
                            ${
                              selected === productFirestoreId
                                ? "border-orange-500 bg-orange-50 shadow-md"
                                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                            }
                          `}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <Package className="w-4 h-4 text-orange-600 flex-shrink-0" />
                                  <h4 className="font-semibold text-gray-900 line-clamp-1">
                                    {product.productName}
                                  </h4>
                                </div>

                                <div className="flex flex-wrap items-center gap-4 text-sm">
                                  {product.brandModel && (
                                    <span className="text-gray-600">
                                      {product.brandModel}
                                    </span>
                                  )}
                                  <div className="flex items-center gap-1">
                                    <Store className="w-3 h-3 text-gray-400" />
                                    <span className="text-gray-600">
                                      {product.shopName}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Tag className="w-3 h-3 text-gray-400" />
                                    <span className="text-gray-600">
                                      {product.category}
                                    </span>
                                  </div>
                                  {product.price && (
                                    <span className="font-semibold text-green-700">
                                      ₺{product.price.toLocaleString("tr-TR")}
                                    </span>
                                  )}
                                </div>

                                {product.featured && (
                                  <div className="mt-2">
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
                                      <TrendingUp className="w-3 h-3" />
                                      Öne Çıkan
                                    </span>
                                  </div>
                                )}
                              </div>

                              {selected === productFirestoreId && (
                                <div className="ml-4 flex-shrink-0">
                                  <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center">
                                    <Check className="w-5 h-5 text-white" />
                                  </div>
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Shops Results */}
              {(searchType === "shops" ||
                (searchType === "both" && activeTab === "shops")) && (
                <div className="space-y-2">
                  {shops.length === 0 ? (
                    <div className="text-center py-12">
                      <Store className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600">
                        &quot;{query}&quot; ile eşleşen mağaza bulunamadı
                      </p>
                      <p className="text-gray-500 text-sm mt-2">
                        Farklı anahtar kelimeler deneyin veya ürünler sekmesine
                        bakın
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {shops.map((shop) => {
                        const shopFirestoreId = shop.objectID.replace(
                          "shops_",
                          ""
                        );
                        return (
                          <button
                            key={shop.objectID}
                            onClick={() => handleSelect(shop, "shop")}
                            className={`
                            w-full text-left p-4 rounded-xl border transition-all
                            ${
                              selected === shopFirestoreId
                                ? "border-orange-500 bg-orange-50 shadow-md"
                                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                            }
                          `}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <Store className="w-4 h-4 text-blue-600 flex-shrink-0" />
                                  <h4 className="font-semibold text-gray-900 line-clamp-1">
                                    {shop.shopName}
                                  </h4>
                                  {shop.verified && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                                      <Check className="w-3 h-3" />
                                      Onaylı
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-4 text-sm">
                                  {shop.ownerName && (
                                    <span className="text-gray-600">
                                      Sahip: {shop.ownerName}
                                    </span>
                                  )}
                                  {shop.category && (
                                    <div className="flex items-center gap-1">
                                      <Tag className="w-3 h-3 text-gray-400" />
                                      <span className="text-gray-600">
                                        {shop.category}
                                      </span>
                                    </div>
                                  )}
                                  {shop.location?.city && (
                                    <div className="flex items-center gap-1">
                                      <MapPin className="w-3 h-3 text-gray-400" />
                                      <span className="text-gray-600">
                                        {shop.location.city}
                                      </span>
                                    </div>
                                  )}
                                  {shop.rating && (
                                    <div className="flex items-center gap-1">
                                      <Star className="w-3 h-3 text-yellow-500" />
                                      <span className="font-medium text-gray-700">
                                        {shop.rating.toFixed(1)}
                                      </span>
                                    </div>
                                  )}
                                  {shop.totalProducts && (
                                    <span className="text-gray-600">
                                      {shop.totalProducts} ürün
                                    </span>
                                  )}
                                </div>
                              </div>

                              {selected === shopFirestoreId && (
                                <div className="ml-4 flex-shrink-0">
                                  <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center">
                                    <Check className="w-5 h-5 text-white" />
                                  </div>
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200">
          <p className="text-sm text-gray-600">
            {query && (
              <span>
                {searchType === "both" && activeTab === "shops"
                  ? `${shops.length} mağaza bulundu`
                  : searchType === "both" && activeTab === "shop_products"
                  ? `${shopProducts.length} ürün bulundu`
                  : searchType === "shops"
                  ? `${shops.length} mağaza bulundu`
                  : `${shopProducts.length} ürün bulundu`}
              </span>
            )}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium"
            >
              İptal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// EXPORT ADDITIONAL UTILITIES
// ============================================================================

// Hook for using the search modal
export function useSearchModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [selection, setSelection] = useState<SearchSelection | null>(null);

  const openModal = () => setIsOpen(true);
  const closeModal = () => setIsOpen(false);

  const handleSelect = (newSelection: SearchSelection) => {
    setSelection(newSelection);
    closeModal();
  };

  return {
    isOpen,
    selection,
    openModal,
    closeModal,
    handleSelect,
    setSelection,
  };
}
