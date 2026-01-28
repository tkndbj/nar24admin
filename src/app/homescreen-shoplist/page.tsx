"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
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
  Plus,
  X,
  GripVertical,
  Save,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  Star,
  ImageIcon,
  Loader2,
} from "lucide-react";

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
  createdAt?: Date;
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

/**
 * Debounce hook for search input
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// ============================================================================
// COMPONENTS
// ============================================================================

/**
 * Sortable shop card for the selected list
 */
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
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-100 rounded"
      >
        <GripVertical className="w-4 h-4 text-gray-400" />
      </div>

      {/* Position Badge */}
      <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
        {index + 1}
      </span>

      {/* Shop Image */}
      <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
        {shop.profileImageUrl || shop.coverImageUrl ? (
          <img
            src={shop.profileImageUrl || shop.coverImageUrl}
            alt={shop.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Store className="w-5 h-5 text-gray-400" />
          </div>
        )}
      </div>

      {/* Shop Info */}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-gray-900 truncate">
          {shop.name}
        </h4>
        {shop.averageRating !== undefined && shop.averageRating > 0 && (
          <div className="flex items-center gap-1 mt-0.5">
            <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
            <span className="text-xs text-gray-500">
              {shop.averageRating.toFixed(1)}
            </span>
          </div>
        )}
      </div>

      {/* Remove Button */}
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

/**
 * Search result shop card
 */
function SearchResultCard({
  shop,
  isSelected,
  onAdd,
  disabled,
}: {
  shop: Shop;
  isSelected: boolean;
  onAdd: (shop: Shop) => void;
  disabled: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 p-3 border rounded-lg transition-all ${
        isSelected
          ? "bg-green-50 border-green-200"
          : "bg-white border-gray-200 hover:border-gray-300"
      }`}
    >
      {/* Shop Image */}
      <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
        {shop.profileImageUrl || shop.coverImageUrl ? (
          <img
            src={shop.profileImageUrl || shop.coverImageUrl}
            alt={shop.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Store className="w-5 h-5 text-gray-400" />
          </div>
        )}
      </div>

      {/* Shop Info */}
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
          {shop.isActive === false && (
            <span className="text-xs text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
              Inactive
            </span>
          )}
        </div>
      </div>

      {/* Add/Selected Button */}
      {isSelected ? (
        <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-lg">
          <CheckCircle className="w-3.5 h-3.5" />
          Selected
        </span>
      ) : (
        <button
          onClick={() => onAdd(shop)}
          disabled={disabled}
          className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:bg-gray-100 disabled:text-gray-400 text-xs font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      )}
    </div>
  );
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function HomescreenShopListPage() {
  const { user } = useAuth();

  // Selected shops state
  const [selectedShops, setSelectedShops] = useState<Shop[]>([]);
  const [originalShopIds, setOriginalShopIds] = useState<string[]>([]);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Shop[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");

  // Refs
  const isMountedRef = useRef(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // ========================================================================
  // LOAD FEATURED SHOPS CONFIG
  // ========================================================================

  useEffect(() => {
    isMountedRef.current = true;

    const loadFeaturedShops = async () => {
      try {
        setIsLoading(true);

        // Get config document
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
  // SEARCH SHOPS
  // ========================================================================

  useEffect(() => {
    const searchShops = async () => {
      if (!debouncedSearchQuery.trim()) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);

      try {
        // Search by name prefix (case-sensitive limitation of Firestore)
        // For production, consider Algolia or Elasticsearch
        const searchLower = debouncedSearchQuery.toLowerCase();
        const searchUpper = searchLower + "\uf8ff";

        const shopsQuery = query(
          collection(db, "shops"),
          where("nameLowercase", ">=", searchLower),
          where("nameLowercase", "<=", searchUpper),
          orderBy("nameLowercase"),
          limit(20)
        );

        const snapshot = await getDocs(shopsQuery);
        
        const shops: Shop[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name || "Unknown Shop",
            profileImageUrl: data.profileImageUrl,
            coverImageUrl: data.coverImageUrl || data.coverImageUrls?.[0],
            averageRating: data.averageRating,
            isActive: data.isActive,
          };
        });

        if (isMountedRef.current) {
          setSearchResults(shops);
        }
      } catch (error) {
        console.error("Error searching shops:", error);
        
        // Fallback: try searching without lowercase field
        try {
          const fallbackQuery = query(
            collection(db, "shops"),
            where("isActive", "==", true),
            orderBy("name"),
            limit(50)
          );
          
          const snapshot = await getDocs(fallbackQuery);
          const searchLower = debouncedSearchQuery.toLowerCase();
          
          const shops: Shop[] = snapshot.docs
            .filter((doc) => {
              const name = doc.data().name?.toLowerCase() || "";
              return name.includes(searchLower);
            })
            .slice(0, 20)
            .map((doc) => {
              const data = doc.data();
              return {
                id: doc.id,
                name: data.name || "Unknown Shop",
                profileImageUrl: data.profileImageUrl,
                coverImageUrl: data.coverImageUrl || data.coverImageUrls?.[0],
                averageRating: data.averageRating,
                isActive: data.isActive,
              };
            });

          if (isMountedRef.current) {
            setSearchResults(shops);
          }
        } catch (fallbackError) {
          console.error("Fallback search failed:", fallbackError);
          setSearchResults([]);
        }
      } finally {
        if (isMountedRef.current) {
          setIsSearching(false);
        }
      }
    };

    searchShops();
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
    // Reload from original
    setSelectedShops([]);
    setSearchQuery("");
    setSearchResults([]);
    // Re-trigger load
    window.location.reload();
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
                {/* Unsaved Changes Indicator */}
                {hasChanges && (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-md">
                    Unsaved changes
                  </span>
                )}

                {/* Save Status */}
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

                {/* Reset Button */}
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>

                {/* Save Button */}
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
                </div>

                {/* Search Input */}
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by shop name..."
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {isSearching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
                  )}
                </div>

                {/* Capacity Indicator */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-xs text-gray-500">
                    {canAddMore
                      ? `${MAX_FEATURED_SHOPS - selectedShops.length} slots remaining`
                      : "Maximum reached"}
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      canAddMore ? "text-green-600" : "text-amber-600"
                    }`}
                  >
                    {selectedShops.length}/{MAX_FEATURED_SHOPS}
                  </span>
                </div>

                {/* Search Results */}
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {searchQuery.trim() === "" ? (
                    <div className="text-center py-8 text-gray-400">
                      <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">
                        Enter a shop name to search
                      </p>
                    </div>
                  ) : isSearching ? (
                    <div className="text-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Searching...</p>
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <Store className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No shops found</p>
                    </div>
                  ) : (
                    searchResults.map((shop) => (
                      <SearchResultCard
                        key={shop.id}
                        shop={shop}
                        isSelected={selectedShopIds.has(shop.id)}
                        onAdd={handleAddShop}
                        disabled={!canAddMore}
                      />
                    ))
                  )}
                </div>
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
                  ℹ️ How it works
                </h3>
                <ul className="text-xs text-blue-800 space-y-1">
                  <li>• Search for shops by name in the left panel</li>
                  <li>• Click "Add" to include a shop in featured list</li>
                  <li>• Drag and drop to reorder the display sequence</li>
                  <li>• Click "Save" to publish changes to all apps</li>
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