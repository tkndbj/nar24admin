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

  // Tab configuration
  const tabs: TabConfig[] = [
    {
      id: "shop_products",
      label: "Ürünler",
      icon: <Package className="w-4 h-4" />,
      description: "Mağaza ürünlerini ara",
    },
    {
      id: "shops",
      label: "Mağazalar",
      icon: <Store className="w-4 h-4" />,
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
        if (searchType === "both" || searchType === "shops") {
          const shopsResult = await dashboardSearchService.searchShops(searchQuery, {
            hitsPerPage: maxResults,
            filters: { status: "active" },
          });
          setShops(shopsResult.hits);
        }

        if (searchType === "both" || searchType === "shop_products") {
          const productsResult = await dashboardSearchService.searchShopProducts(searchQuery, {
            hitsPerPage: maxResults,
            filters: { status: "active" },
          });
          setShopProducts(productsResult.hits);
        }
      } catch (err) {
        console.error("Search error:", err);
        setError("Arama yapılırken bir hata oluştu. Lütfen tekrar deneyin.");
      } finally {
        setLoading(false);
      }
    },
    [searchType, maxResults]
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

  // Handle selection
  const handleSelect = (item: AlgoliaShopHit | AlgoliaShopProductHit, type: SelectionType) => {
    const selection: SearchSelection = {
      id: type === "shop" ? (item as AlgoliaShopHit).shopId : (item as AlgoliaShopProductHit).shopProductId,
      name: type === "shop" ? (item as AlgoliaShopHit).shopName : (item as AlgoliaShopProductHit).productName,
      type,
      data: item,
    };

    setSelected(selection.id);
    onSelect(selection);
    
    // Close modal after selection
    setTimeout(() => {
      onClose();
    }, 200);
  };

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setShops([]);
      setShopProducts([]);
      setError(null);
      setSelected(selectedId);
    } else {
      // Focus search input when modal opens
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, selectedId]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
              <p className="text-sm text-gray-600 mt-1">
                Arama yaparak mağaza veya ürün seçin
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Search Bar */}
          <div className="p-6 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={handleQueryChange}
                placeholder={placeholder}
                className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
              />
              {loading && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <Loader2 className="w-5 h-5 text-orange-600 animate-spin" />
                </div>
              )}
            </div>
          </div>

          {/* Tabs - Only show if searchType is "both" */}
          {searchType === "both" && availableTabs.length > 1 && (
            <div className="flex gap-1 p-2 bg-gray-50 border-b border-gray-200">
              {availableTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as "shops" | "shop_products")}
                  className={`
                    flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all
                    ${
                      activeTab === tab.id
                        ? "bg-white text-orange-600 shadow-sm border border-gray-200"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                    }
                  `}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {activeTab === tab.id && (
                    <span className="ml-1 px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs">
                      {tab.id === "shops" ? shops.length : shopProducts.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Results */}
          <div className="flex-1 overflow-y-auto p-6">
            {error && (
              <div className="flex items-center gap-3 p-4 bg-red-50 text-red-700 rounded-lg mb-4">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            )}

            {!query && !loading && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <Search className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Aramaya Başlayın
                </h3>
                <p className="text-sm text-gray-600 max-w-sm">
                  Bağlamak istediğiniz mağaza veya ürünü bulmak için yukarıdaki arama kutusunu kullanın
                </p>
              </div>
            )}

            {query && !loading && !error && (
              <>
                {/* Shop Products Results */}
                {(searchType === "shop_products" || (searchType === "both" && activeTab === "shop_products")) && (
                  <div className="space-y-2">
                    {shopProducts.length === 0 ? (
                      <div className="text-center py-12">
                        <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-600">
                          "{query}" ile eşleşen ürün bulunamadı
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        {shopProducts.map((product) => (
                          <button
                            key={product.shopProductId}
                            onClick={() => handleSelect(product, "shop_product")}
                            className={`
                              w-full text-left p-4 rounded-xl border transition-all
                              ${
                                selected === product.shopProductId
                                  ? "border-orange-500 bg-orange-50 shadow-md"
                                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                              }
                            `}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <Package className="w-4 h-4 text-green-600 flex-shrink-0" />
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

                              {selected === product.shopProductId && (
                                <div className="ml-4 flex-shrink-0">
                                  <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center">
                                    <Check className="w-5 h-5 text-white" />
                                  </div>
                                </div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Shops Results */}
                {(searchType === "shops" || (searchType === "both" && activeTab === "shops")) && (
                  <div className="space-y-2">
                    {shops.length === 0 ? (
                      <div className="text-center py-12">
                        <Store className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-600">
                          "{query}" ile eşleşen mağaza bulunamadı
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        {shops.map((shop) => (
                          <button
                            key={shop.shopId}
                            onClick={() => handleSelect(shop, "shop")}
                            className={`
                              w-full text-left p-4 rounded-xl border transition-all
                              ${
                                selected === shop.shopId
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

                              {selected === shop.shopId && (
                                <div className="ml-4 flex-shrink-0">
                                  <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center">
                                    <Check className="w-5 h-5 text-white" />
                                  </div>
                                </div>
                              )}
                            </div>
                          </button>
                        ))}
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