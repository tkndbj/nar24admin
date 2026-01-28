"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Search,
  Store,
  X,
  GripVertical,
  Save,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  Star,
  Loader2,
  MapPin,
  ArrowLeft,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  searchShops,
  type AlgoliaShopHit,
} from "../lib/algolia/dashboardSearchService";

// ============================================================================
// TYPES
// ============================================================================

interface Shop {
  id: string;
  name: string;
  profileImageUrl?: string;
  coverImageUrl?: string;
  averageRating?: number;
  isActive?: boolean;
  city?: string;
}

interface FeaturedShopsConfig {
  shopIds: string[];
  updatedAt?: Date;
  updatedBy?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_FEATURED_SHOPS = 10;
const SEARCH_DEBOUNCE_MS = 300;
const FIRESTORE_CONFIG_DOC = "featured_shops";
const FIRESTORE_CONFIG_COLLECTION = "app_config";

// ============================================================================
// HOOKS
// ============================================================================

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// Helper to extract Firestore doc ID from Algolia objectID
function extractFirestoreId(objectID: string, collectionName: string): string {
  const prefix = `${collectionName}_`;
  if (objectID.startsWith(prefix)) {
    return objectID.substring(prefix.length);
  }
  return objectID;
}

// ============================================================================
// COMPONENTS
// ============================================================================

function SortableShopCard({
  shop,
  index,
  onRemove,
}: {
  shop: Shop;
  index: number;
  onRemove: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: shop.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 bg-white border rounded-lg transition-all ${
        isDragging
          ? "opacity-50 shadow-lg scale-[1.02] border-blue-300"
          : "border-gray-200 hover:border-gray-300"
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-100 rounded"
      >
        <GripVertical className="w-4 h-4 text-gray-400" />
      </div>

      <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
        {index + 1}
      </span>

      <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 relative">
        {shop.profileImageUrl || shop.coverImageUrl ? (
          <Image
            src={shop.profileImageUrl || shop.coverImageUrl || ""}
            alt={shop.name}
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Store className="w-5 h-5 text-gray-400" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-gray-900 truncate">
          {shop.name}
        </h4>
        <div className="flex items-center gap-2 mt-0.5">
          {shop.averageRating !== undefined && shop.averageRating > 0 && (
            <div className="flex items-center gap-1">
              <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
              <span className="text-xs text-gray-500">
                {shop.averageRating.toFixed(1)}
              </span>
            </div>
          )}
          {shop.city && (
            <div className="flex items-center gap-1 text-gray-400">
              <MapPin className="w-3 h-3" />
              <span className="text-xs">{shop.city}</span>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={() => onRemove(shop.id)}
        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
        title="Remove from featured"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// Search Dropdown Item
function SearchDropdownItem({
  shop,
  isSelected,
  onSelect,
}: {
  shop: Shop;
  isSelected: boolean;
  onSelect: (shop: Shop) => void;
}) {
  return (
    <button
      onClick={() => !isSelected && onSelect(shop)}
      disabled={isSelected}
      className={`w-full flex items-center gap-3 p-3 text-left transition-all ${
        isSelected
          ? "bg-green-50 cursor-not-allowed"
          : "hover:bg-blue-50 cursor-pointer"
      }`}
    >
      <div className="w-9 h-9 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 relative">
        {shop.profileImageUrl || shop.coverImageUrl ? (
          <Image
            src={shop.profileImageUrl || shop.coverImageUrl || ""}
            alt={shop.name}
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Store className="w-4 h-4 text-gray-400" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-gray-900 truncate">
          {shop.name}
        </h4>
        <div className="flex items-center gap-2 mt-0.5">
          {shop.averageRating !== undefined && shop.averageRating > 0 && (
            <div className="flex items-center gap-1">
              <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
              <span className="text-xs text-gray-500">
                {shop.averageRating.toFixed(1)}
              </span>
            </div>
          )}
          {shop.city && (
            <span className="text-xs text-gray-400">{shop.city}</span>
          )}
        </div>
      </div>

      {isSelected ? (
        <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
          <CheckCircle className="w-3 h-3" />
          Added
        </span>
      ) : (
        <span className="text-xs text-blue-600 font-medium">+ Add</span>
      )}
    </button>
  );
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function HomescreenShopListPage() {
  const { user } = useAuth();
  const router = useRouter();

  // Selected shops state
  const [selectedShops, setSelectedShops] = useState<Shop[]>([]);
  const [originalShopIds, setOriginalShopIds] = useState<string[]>([]);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Shop[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");

  // Refs
  const isMountedRef = useRef(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search query
  const debouncedSearchQuery = useDebounce(searchQuery, SEARCH_DEBOUNCE_MS);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Check if there are unsaved changes
  const hasChanges = useMemo(() => {
    const currentIds = selectedShops.map((s) => s.id);
    if (currentIds.length !== originalShopIds.length) return true;
    return currentIds.some((id, index) => id !== originalShopIds[index]);
  }, [selectedShops, originalShopIds]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ========================================================================
  // LOAD FEATURED SHOPS CONFIG
  // ========================================================================

  useEffect(() => {
    isMountedRef.current = true;

    const loadFeaturedShops = async () => {
      try {
        setIsLoading(true);

        const configRef = doc(db, FIRESTORE_CONFIG_COLLECTION, FIRESTORE_CONFIG_DOC);
        const configSnap = await getDoc(configRef);

        if (!configSnap.exists()) {
          setSelectedShops([]);
          setOriginalShopIds([]);
          setIsLoading(false);
          return;
        }

        const config = configSnap.data() as FeaturedShopsConfig;
        const shopIds = config.shopIds || [];

        if (shopIds.length === 0) {
          setSelectedShops([]);
          setOriginalShopIds([]);
          setIsLoading(false);
          return;
        }

        // Fetch shop details for each ID
        const shopPromises = shopIds.map(async (id) => {
          try {
            const shopRef = doc(db, "shops", id);
            const shopSnap = await getDoc(shopRef);
            if (shopSnap.exists()) {
              const data = shopSnap.data();
              return {
                id: shopSnap.id,
                name: data.name || "Unknown Shop",
                profileImageUrl: data.profileImageUrl,
                coverImageUrl: data.coverImageUrl || data.coverImageUrls?.[0],
                averageRating: data.averageRating,
                isActive: data.isActive,
                city: data.location?.city,
              } as Shop;
            }
            return null;
          } catch (e) {
            console.error(`Error fetching shop ${id}:`, e);
            return null;
          }
        });

        const shops = (await Promise.all(shopPromises)).filter(
          (s): s is Shop => s !== null
        );

        if (isMountedRef.current) {
          setSelectedShops(shops);
          setOriginalShopIds(shops.map((s) => s.id));
        }
      } catch (error) {
        console.error("Error loading featured shops:", error);
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    loadFeaturedShops();

    return () => {
      isMountedRef.current = false;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // ========================================================================
  // SEARCH SHOPS WITH ALGOLIA
  // ========================================================================

  useEffect(() => {
    const performSearch = async () => {
      if (!debouncedSearchQuery.trim()) {
        setSearchResults([]);
        setShowDropdown(false);
        return;
      }

      setIsSearching(true);

      try {
        const result = await searchShops(debouncedSearchQuery, {
          hitsPerPage: 15,
        });

        const shops: Shop[] = result.hits.map((hit: AlgoliaShopHit) => {
          const firestoreId = extractFirestoreId(hit.objectID, "shops");
          return {
            id: firestoreId,
            name: hit.shopName || hit.name || "Unknown Shop",
            profileImageUrl: undefined,
            coverImageUrl: undefined,
            averageRating: hit.rating,
            isActive: hit.status === "active",
            city: hit.location?.city,
          };
        });

        if (isMountedRef.current) {
          setSearchResults(shops);
          setShowDropdown(true);
        }
      } catch (error) {
        console.error("Algolia search error:", error);
        setSearchResults([]);
      } finally {
        if (isMountedRef.current) {
          setIsSearching(false);
        }
      }
    };

    performSearch();
  }, [debouncedSearchQuery]);

  // ========================================================================
  // HANDLERS
  // ========================================================================

  const handleAddShop = useCallback((shop: Shop) => {
    setSelectedShops((prev) => {
      if (prev.length >= MAX_FEATURED_SHOPS) return prev;
      if (prev.some((s) => s.id === shop.id)) return prev;
      return [...prev, shop];
    });
    // Keep dropdown open so user can add more
  }, []);

  const handleRemoveShop = useCallback((shopId: string) => {
    setSelectedShops((prev) => prev.filter((s) => s.id !== shopId));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setSelectedShops((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!user || isSaving) return;

    setIsSaving(true);
    setSaveStatus("idle");

    try {
      const shopIds = selectedShops.map((s) => s.id);

      const configRef = doc(db, FIRESTORE_CONFIG_COLLECTION, FIRESTORE_CONFIG_DOC);
      await setDoc(configRef, {
        shopIds,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });

      if (isMountedRef.current) {
        setOriginalShopIds(shopIds);
        setSaveStatus("success");

        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) setSaveStatus("idle");
        }, 3000);
      }

      console.log("✅ Featured shops saved:", shopIds.length, "shops");
    } catch (error) {
      console.error("Error saving featured shops:", error);

      if (isMountedRef.current) {
        setSaveStatus("error");

        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) setSaveStatus("idle");
        }, 5000);
      }
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  }, [user, isSaving, selectedShops]);

  const handleReset = useCallback(() => {
    setSelectedShops([]);
    setSearchQuery("");
    setSearchResults([]);
    setShowDropdown(false);
    window.location.reload();
  }, []);

  const handleInputFocus = useCallback(() => {
    if (searchResults.length > 0) {
      setShowDropdown(true);
    }
  }, [searchResults.length]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
    setShowDropdown(false);
    inputRef.current?.focus();
  }, []);

  // ========================================================================
  // RENDER
  // ========================================================================

  if (isLoading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
            <p className="text-gray-600 text-sm">Loading featured shops...</p>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  const selectedShopIds = new Set(selectedShops.map((s) => s.id));
  const canAddMore = selectedShops.length < MAX_FEATURED_SHOPS;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50 shadow-sm">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="flex justify-between items-center py-3">
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => router.push("/dashboard")}
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Back to Dashboard"
                >
                  <ArrowLeft className="w-5 h-5 text-gray-600" />
                </button>
                <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg shadow">
                  <Store className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h1 className="text-base font-bold text-gray-900">
                    Featured Shops
                  </h1>
                  <p className="text-[10px] text-gray-500">
                    Homescreen Shop List
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {hasChanges && (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-md">
                    Unsaved changes
                  </span>
                )}

                {saveStatus === "success" && (
                  <div className="flex items-center gap-1.5 text-green-600 bg-green-50 px-2 py-1 rounded-md">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">Saved</span>
                  </div>
                )}

                {saveStatus === "error" && (
                  <div className="flex items-center gap-1.5 text-red-600 bg-red-50 px-2 py-1 rounded-md">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">Error</span>
                  </div>
                )}

                <button
                  onClick={handleReset}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>

                <button
                  onClick={handleSave}
                  disabled={isSaving || !hasChanges}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-400 text-white text-xs font-medium rounded-lg transition-all disabled:cursor-not-allowed shadow-sm"
                >
                  {isSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  {isSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Panel - Search & Add */}
            <div className="space-y-4">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Search className="w-4 h-4 text-blue-600" />
                  </div>
                  <h2 className="text-sm font-semibold text-gray-900">
                    Search Shops
                  </h2>
                  <span className="text-xs text-gray-400 ml-auto">
                    Powered by Algolia
                  </span>
                </div>

                {/* Search Input with Dropdown */}
                <div ref={searchContainerRef} className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      ref={inputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={handleInputFocus}
                      placeholder="Type shop name to search..."
                      className="w-full pl-10 pr-10 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {isSearching ? (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 animate-spin" />
                    ) : searchQuery && (
                      <button
                        onClick={handleClearSearch}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Dropdown Results */}
                  {showDropdown && searchQuery.trim() && (
                    <div className="absolute z-40 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[400px] overflow-y-auto">
                      {isSearching ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-5 h-5 animate-spin text-blue-500 mr-2" />
                          <span className="text-sm text-gray-500">Searching...</span>
                        </div>
                      ) : searchResults.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                          <Store className="w-8 h-8 mb-2 opacity-50" />
                          <p className="text-sm">No shops found for &quot;{searchQuery}&quot;</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {!canAddMore && (
                            <div className="px-3 py-2 bg-amber-50 text-amber-700 text-xs font-medium">
                              Maximum {MAX_FEATURED_SHOPS} shops reached. Remove a shop to add more.
                            </div>
                          )}
                          {searchResults.map((shop) => (
                            <SearchDropdownItem
                              key={shop.id}
                              shop={shop}
                              isSelected={selectedShopIds.has(shop.id)}
                              onSelect={canAddMore ? handleAddShop : () => {}}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Capacity Indicator */}
                <div className="flex items-center justify-between mt-4 px-1">
                  <span className="text-xs text-gray-500">
                    {canAddMore
                      ? `${MAX_FEATURED_SHOPS - selectedShops.length} slots remaining`
                      : "Maximum reached"}
                  </span>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      canAddMore
                        ? "text-green-700 bg-green-100"
                        : "text-amber-700 bg-amber-100"
                    }`}
                  >
                    {selectedShops.length}/{MAX_FEATURED_SHOPS}
                  </span>
                </div>

                {/* Empty State */}
                {!searchQuery && (
                  <div className="text-center py-8 mt-4 border-2 border-dashed border-gray-200 rounded-lg">
                    <Search className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                    <p className="text-sm text-gray-500 font-medium">
                      Search for shops to add
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Type a shop name in the search box above
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Panel - Selected Shops */}
            <div className="space-y-4">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-purple-100 rounded-lg flex items-center justify-center">
                      <Store className="w-4 h-4 text-purple-600" />
                    </div>
                    <h2 className="text-sm font-semibold text-gray-900">
                      Featured Shops
                    </h2>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {selectedShops.length}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500">
                    Drag to reorder
                  </p>
                </div>

                {selectedShops.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <Store className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">No shops selected</p>
                    <p className="text-xs mt-1">
                      Search and add shops to feature them
                    </p>
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={selectedShops.map((s) => s.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {selectedShops.map((shop, index) => (
                          <SortableShopCard
                            key={shop.id}
                            shop={shop}
                            index={index}
                            onRemove={handleRemoveShop}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </div>

              {/* Info Card */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-blue-900 mb-2">
                  How it works
                </h3>
                <ul className="text-xs text-blue-800 space-y-1">
                  <li>• Type shop name in the search box</li>
                  <li>• Click on a shop from dropdown to add it</li>
                  <li>• Drag and drop to reorder the display sequence</li>
                  <li>• Click &quot;Save&quot; to publish changes to all apps</li>
                  <li>• Maximum {MAX_FEATURED_SHOPS} shops can be featured</li>
                </ul>
              </div>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
