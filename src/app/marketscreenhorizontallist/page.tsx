"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  Plus,
  Trash2,
  Edit3,
  Save,
  X,
  GripVertical,
  Package,
  Store,
  Eye,
  EyeOff,
  Search,
  CheckCircle,
  Clock,
  List,
  ArrowLeft,
  Building,
  ChevronDown,
  ChevronRight,
  Loader2,
  Filter,
} from "lucide-react";
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  orderBy,
  query,
  getDocs,
  where,
  Timestamp,
  FieldValue,
  limit as firestoreLimit,
  startAfter,
  DocumentSnapshot,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DroppableProvided,
  DraggableProvided,
  DraggableStateSnapshot,
} from "@hello-pangea/dnd";
import type { DropResult } from "@hello-pangea/dnd";
import { AllInOneCategoryData } from "@/constants/categoryData";

// Constants
const PRODUCTS_PER_PAGE = 20;
const SHOP_SEARCH_DEBOUNCE_MS = 300;

interface ProductListConfig {
  id: string;
  title: string;
  selectedProductIds?: string[];
  selectedShopId?: string;
  gradientStart: string;
  gradientEnd: string;
  isActive: boolean;
  order: number;
  limit: number;
  showViewAllButton: boolean;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

interface Product {
  id: string;
  productName: string;
  shopId: string;
  shopName?: string;
  sellerName?: string;
  imageUrls?: string[];
  price?: number;
  isActive?: boolean;
  category?: string;
  subcategory?: string;
  subsubcategory?: string;
  brandModel?: string;
  description?: string;
}

interface Shop {
  id: string;
  name: string;
  ownerId: string;
  category?: string;
  profileImageUrl?: string;
  coverImageUrls?: string[];
}

// Selection mode types - removed 'shop_all'
type SelectionMode = "all_products" | "shop_specific";

export default function MarketScreenHorizontalProductList() {
  const [lists, setLists] = useState<ProductListConfig[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingList, setEditingList] = useState<ProductListConfig | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

  // Category selection state
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>("");
  const [selectedSubSubcategory, setSelectedSubSubcategory] = useState<string>("");

  // Products with pagination
  const [categoryProducts, setCategoryProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [lastProductDoc, setLastProductDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const [totalProductsLoaded, setTotalProductsLoaded] = useState(0);

  // Shop search state
  const [shopSearchTerm, setShopSearchTerm] = useState("");
  const [shopSearchResults, setShopSearchResults] = useState<Shop[]>([]);
  const [searchingShops, setSearchingShops] = useState(false);
  const shopSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Selection mode state
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("all_products");
  const [selectedShopForProducts, setSelectedShopForProducts] = useState<string>("");
  const [shopProducts, setShopProducts] = useState<Product[]>([]);
  const [loadingShopProducts, setLoadingShopProducts] = useState(false);
  const [lastShopProductDoc, setLastShopProductDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMoreShopProducts, setHasMoreShopProducts] = useState(true);

  // Form state
  const [formData, setFormData] = useState<Partial<ProductListConfig>>({
    title: "",
    selectedProductIds: [],
    selectedShopId: "",
    gradientStart: "#6366f1",
    gradientEnd: "#8b5cf6",
    isActive: true,
    limit: 10,
    showViewAllButton: true,
  });

  // Get categories, subcategories, and subsubcategories from categoryData
  const categories = useMemo(() => {
    return AllInOneCategoryData.kCategories.map((c) => c.key);
  }, []);

  const subcategories = useMemo(() => {
    if (!selectedCategory) return [];
    return AllInOneCategoryData.kSubcategories[selectedCategory] || [];
  }, [selectedCategory]);

  const subSubcategories = useMemo(() => {
    if (!selectedCategory || !selectedSubcategory) return [];
    return AllInOneCategoryData.kSubSubcategories[selectedCategory]?.[selectedSubcategory] || [];
  }, [selectedCategory, selectedSubcategory]);

  // Load products from selected category with pagination
  const loadProductsByCategory = useCallback(
    async (isInitial: boolean = true) => {
      if (!selectedCategory) {
        setCategoryProducts([]);
        setLastProductDoc(null);
        setHasMoreProducts(true);
        return;
      }

      if (!isInitial && !hasMoreProducts) return;

      setLoadingProducts(true);
      try {
        let q = query(
          collection(db, "shop_products"),
          where("category", "==", selectedCategory)
        );

        // Add subcategory filter if selected
        if (selectedSubcategory) {
          q = query(
            collection(db, "shop_products"),
            where("category", "==", selectedCategory),
            where("subcategory", "==", selectedSubcategory)
          );
        }

        // Add subsubcategory filter if selected
        if (selectedSubSubcategory) {
          q = query(
            collection(db, "shop_products"),
            where("category", "==", selectedCategory),
            where("subcategory", "==", selectedSubcategory),
            where("subsubcategory", "==", selectedSubSubcategory)
          );
        }

        // Add pagination
        if (!isInitial && lastProductDoc) {
          q = query(q, startAfter(lastProductDoc), firestoreLimit(PRODUCTS_PER_PAGE));
        } else {
          q = query(q, firestoreLimit(PRODUCTS_PER_PAGE));
        }

        const snapshot = await getDocs(q);
        const productsData = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            shopName: data.sellerName || "Bilinmeyen Mağaza",
            isActive: true,
          };
        }) as Product[];

        if (isInitial) {
          setCategoryProducts(productsData);
          setTotalProductsLoaded(productsData.length);
        } else {
          setCategoryProducts((prev) => [...prev, ...productsData]);
          setTotalProductsLoaded((prev) => prev + productsData.length);
        }

        const lastDoc = snapshot.docs[snapshot.docs.length - 1];
        setLastProductDoc(lastDoc || null);
        setHasMoreProducts(snapshot.docs.length === PRODUCTS_PER_PAGE);
      } catch (error) {
        console.error("Error loading products by category:", error);
      } finally {
        setLoadingProducts(false);
      }
    },
    [selectedCategory, selectedSubcategory, selectedSubSubcategory, lastProductDoc, hasMoreProducts]
  );

  // Reset products when category selection changes
  useEffect(() => {
    setCategoryProducts([]);
    setLastProductDoc(null);
    setHasMoreProducts(true);
    setTotalProductsLoaded(0);

    if (selectedCategory) {
      loadProductsByCategory(true);
    }
  }, [selectedCategory, selectedSubcategory, selectedSubSubcategory]);

  // Shop search with debounce
  const searchShops = useCallback(async (term: string) => {
    if (!term || term.length < 2) {
      setShopSearchResults([]);
      return;
    }

    setSearchingShops(true);
    try {
      // Search by name using where queries
      // Note: Firestore doesn't support native full-text search, so we use prefix matching
      const searchLower = term.toLowerCase();

      // Get all shops and filter client-side for better search experience
      const shopsSnapshot = await getDocs(collection(db, "shops"));
      const allShops = shopsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Shop[];

      const filtered = allShops.filter(
        (shop) =>
          shop.name?.toLowerCase().includes(searchLower) ||
          shop.category?.toLowerCase().includes(searchLower)
      );

      setShopSearchResults(filtered.slice(0, 10)); // Limit to 10 results
    } catch (error) {
      console.error("Error searching shops:", error);
      setShopSearchResults([]);
    } finally {
      setSearchingShops(false);
    }
  }, []);

  // Debounced shop search
  useEffect(() => {
    if (shopSearchTimeoutRef.current) {
      clearTimeout(shopSearchTimeoutRef.current);
    }

    shopSearchTimeoutRef.current = setTimeout(() => {
      searchShops(shopSearchTerm);
    }, SHOP_SEARCH_DEBOUNCE_MS);

    return () => {
      if (shopSearchTimeoutRef.current) {
        clearTimeout(shopSearchTimeoutRef.current);
      }
    };
  }, [shopSearchTerm, searchShops]);

  // Load shop products with pagination
  const loadShopProducts = useCallback(
    async (shopId: string, isInitial: boolean = true) => {
      if (!shopId) {
        setShopProducts([]);
        setLastShopProductDoc(null);
        setHasMoreShopProducts(true);
        return;
      }

      if (!isInitial && !hasMoreShopProducts) return;

      setLoadingShopProducts(true);
      try {
        let q = query(
          collection(db, "shop_products"),
          where("shopId", "==", shopId),
          firestoreLimit(PRODUCTS_PER_PAGE)
        );

        if (!isInitial && lastShopProductDoc) {
          q = query(
            collection(db, "shop_products"),
            where("shopId", "==", shopId),
            startAfter(lastShopProductDoc),
            firestoreLimit(PRODUCTS_PER_PAGE)
          );
        }

        const snapshot = await getDocs(q);
        const shopProductsData = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            shopName: data.sellerName || "Bilinmeyen Mağaza",
            isActive: true,
          };
        }) as Product[];

        if (isInitial) {
          setShopProducts(shopProductsData);
        } else {
          setShopProducts((prev) => [...prev, ...shopProductsData]);
        }

        const lastDoc = snapshot.docs[snapshot.docs.length - 1];
        setLastShopProductDoc(lastDoc || null);
        setHasMoreShopProducts(snapshot.docs.length === PRODUCTS_PER_PAGE);
      } catch (error) {
        console.error("Error loading shop products:", error);
      } finally {
        setLoadingShopProducts(false);
      }
    },
    [lastShopProductDoc, hasMoreShopProducts]
  );

  // Handle selection mode change
  const handleSelectionModeChange = useCallback((mode: SelectionMode) => {
    setSelectionMode(mode);
    setSelectedProducts([]);
    setSelectedShopForProducts("");
    setShopProducts([]);
    setSearchTerm("");
    setShopSearchTerm("");
    setShopSearchResults([]);
    setSelectedCategory("");
    setSelectedSubcategory("");
    setSelectedSubSubcategory("");
    setCategoryProducts([]);
    setLastProductDoc(null);
    setHasMoreProducts(true);
    setLastShopProductDoc(null);
    setHasMoreShopProducts(true);

    setFormData((prev) => ({
      ...prev,
      selectedProductIds: [],
      selectedShopId: "",
    }));
  }, []);

  // Handle shop selection for specific product selection
  const handleShopSelectionForProducts = useCallback(
    async (shop: Shop) => {
      setSelectedShopForProducts(shop.id);
      setSelectedProducts([]);
      setShopSearchTerm("");
      setShopSearchResults([]);
      setLastShopProductDoc(null);
      setHasMoreShopProducts(true);

      setFormData((prev) => ({
        ...prev,
        selectedShopId: "",
        selectedProductIds: [],
      }));

      await loadShopProducts(shop.id, true);
    },
    [loadShopProducts]
  );

  // Data loading - Only load lists initially (shops loaded on search)
  useEffect(() => {
    let unsubscribeLists: (() => void) | undefined;

    const loadData = async () => {
      setLoading(true);

      try {
        // Load product lists with real-time listener
        const listsQuery = query(
          collection(db, "dynamic_product_lists"),
          orderBy("order", "asc")
        );

        unsubscribeLists = onSnapshot(
          listsQuery,
          (snapshot) => {
            const listsData = snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            })) as ProductListConfig[];
            setLists(listsData);
          },
          (error) => {
            console.error("Error listening to lists:", error);
          }
        );

        // Load shops for display purposes (for showing shop names in lists)
        const shopsSnapshot = await getDocs(collection(db, "shops"));
        const shopsData = shopsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Shop[];
        setShops(shopsData);
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    return () => {
      if (unsubscribeLists) {
        unsubscribeLists();
      }
    };
  }, []);

  // Get products to display based on selection mode
  const displayProducts = useMemo(() => {
    switch (selectionMode) {
      case "all_products":
        return categoryProducts;
      case "shop_specific":
        return shopProducts;
      default:
        return [];
    }
  }, [selectionMode, categoryProducts, shopProducts]);

  // Filtered products by search term
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return displayProducts;

    const term = searchTerm.toLowerCase().trim();
    return displayProducts.filter((product) => {
      const nameMatch = product.productName?.toLowerCase().includes(term);
      const shopMatch = product.shopName?.toLowerCase().includes(term);
      const sellerMatch = product.sellerName?.toLowerCase().includes(term);
      const brandMatch = product.brandModel?.toLowerCase().includes(term);
      return nameMatch || shopMatch || sellerMatch || brandMatch;
    });
  }, [displayProducts, searchTerm]);

  // Create new list
  const handleCreateList = async () => {
    setSaving(true);
    try {
      if (!formData.title?.trim()) {
        alert("Başlık gereklidir");
        return;
      }

      const hasProducts = formData.selectedProductIds && formData.selectedProductIds.length > 0;
      const hasShop = formData.selectedShopId;

      if (!hasProducts && !hasShop) {
        alert("En az bir ürün seçmelisiniz");
        return;
      }

      const maxOrder = Math.max(...lists.map((l) => l.order || 0), 0);

      const newList: Omit<ProductListConfig, "id"> = {
        ...(formData as ProductListConfig),
        order: maxOrder + 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "dynamic_product_lists"), newList);

      resetForm();
      setShowCreateModal(false);
    } catch (error) {
      console.error("Error creating list:", error);
      alert("Liste oluşturulurken hata oluştu");
    } finally {
      setSaving(false);
    }
  };

  // Reset form helper
  const resetForm = useCallback(() => {
    setFormData({
      title: "",
      selectedProductIds: [],
      selectedShopId: "",
      gradientStart: "#6366f1",
      gradientEnd: "#8b5cf6",
      isActive: true,
      limit: 10,
      showViewAllButton: true,
    });
    setSelectedProducts([]);
    setSearchTerm("");
    setSelectionMode("all_products");
    setSelectedShopForProducts("");
    setShopProducts([]);
    setShopSearchTerm("");
    setShopSearchResults([]);
    setSelectedCategory("");
    setSelectedSubcategory("");
    setSelectedSubSubcategory("");
    setCategoryProducts([]);
    setLastProductDoc(null);
    setHasMoreProducts(true);
    setLastShopProductDoc(null);
    setHasMoreShopProducts(true);
  }, []);

  // Update list
  const handleUpdateList = async (listId: string, updates: Partial<ProductListConfig>) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "dynamic_product_lists", listId), {
        ...updates,
        updatedAt: serverTimestamp(),
      });
      setEditingList(null);
    } catch (error) {
      console.error("Error updating list:", error);
      alert("Liste güncellenirken hata oluştu");
    } finally {
      setSaving(false);
    }
  };

  // Delete list
  const handleDeleteList = async (listId: string) => {
    if (!confirm("Bu listeyi silmek istediğinizden emin misiniz?")) {
      return;
    }

    setSaving(true);
    try {
      await deleteDoc(doc(db, "dynamic_product_lists", listId));
    } catch (error) {
      console.error("Error deleting list:", error);
      alert("Liste silinirken hata oluştu");
    } finally {
      setSaving(false);
    }
  };

  // Handle drag and drop for reordering
  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(lists);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setSaving(true);
    try {
      const updatePromises = items.map((list, index) =>
        updateDoc(doc(db, "dynamic_product_lists", list.id), {
          order: index + 1,
          updatedAt: serverTimestamp(),
        })
      );

      await Promise.all(updatePromises);
    } catch (error) {
      console.error("Error updating list order:", error);
    } finally {
      setSaving(false);
    }
  };

  // Toggle product selection
  const toggleProductSelection = useCallback((productId: string) => {
    setSelectedProducts((prev) => {
      const newSelection = prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId];

      setFormData((prevForm) => ({
        ...prevForm,
        selectedProductIds: newSelection,
      }));

      return newSelection;
    });
  }, []);

  const totalActiveLists = lists.filter((l) => l.isActive).length;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-14">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 bg-indigo-100 rounded-lg">
                  <List className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">Yatay Ürün Listeleri</h1>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5 text-gray-600">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    Aktif: {totalActiveLists}
                  </span>
                  <span className="flex items-center gap-1.5 text-gray-600">
                    <Package className="w-3.5 h-3.5" />
                    Toplam: {lists.length}
                  </span>
                </div>

                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Yeni Liste
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
            </div>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="lists">
                {(provided: DroppableProvided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                    {lists.map((list, index) => (
                      <Draggable key={list.id} draggableId={list.id} index={index}>
                        {(provided: DraggableProvided, snapshot: DraggableStateSnapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`bg-white border border-gray-200 rounded-lg px-4 py-3 transition-all ${
                              snapshot.isDragging ? "shadow-lg scale-[1.02]" : "hover:border-gray-300"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1">
                                <div
                                  {...provided.dragHandleProps}
                                  className="cursor-grab active:cursor-grabbing p-1 -m-1 text-gray-400 hover:text-gray-600"
                                >
                                  <GripVertical className="w-4 h-4" />
                                </div>

                                <div
                                  className="w-6 h-6 rounded border border-gray-200 flex-shrink-0"
                                  style={{
                                    background: `linear-gradient(90deg, ${list.gradientStart}, ${list.gradientEnd})`,
                                  }}
                                ></div>

                                <div className="min-w-0 flex-1">
                                  <h3 className="text-sm font-medium text-gray-900 truncate">
                                    {list.title}
                                  </h3>
                                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                                    <span>#{list.order}</span>
                                    {list.selectedProductIds && list.selectedProductIds.length > 0 && (
                                      <span>{list.selectedProductIds.length} ürün</span>
                                    )}
                                    {list.selectedShopId && (
                                      <span className="truncate max-w-[150px]">
                                        {shops.find((s) => s.id === list.selectedShopId)?.name ||
                                          "Mağaza"}
                                      </span>
                                    )}
                                    <span>Limit: {list.limit}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                    list.isActive
                                      ? "bg-green-50 text-green-700"
                                      : "bg-gray-100 text-gray-600"
                                  }`}
                                >
                                  {list.isActive ? "Aktif" : "Pasif"}
                                </span>

                                <button
                                  onClick={() => handleUpdateList(list.id, { isActive: !list.isActive })}
                                  className={`p-1.5 rounded-md transition-colors ${
                                    list.isActive
                                      ? "text-green-600 hover:bg-green-50"
                                      : "text-gray-400 hover:bg-gray-100"
                                  }`}
                                >
                                  {list.isActive ? (
                                    <Eye className="w-4 h-4" />
                                  ) : (
                                    <EyeOff className="w-4 h-4" />
                                  )}
                                </button>

                                <button
                                  onClick={() => setEditingList(list)}
                                  className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-md transition-colors"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>

                                <button
                                  onClick={() => handleDeleteList(list.id)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}

                    {lists.length === 0 && (
                      <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                        <List className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm text-gray-500">Henüz liste oluşturulmamış</p>
                        <button
                          onClick={() => setShowCreateModal(true)}
                          className="mt-3 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                        >
                          İlk listeyi oluştur
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </main>

        {/* Create List Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50">
                <h2 className="text-base font-semibold text-gray-900">Yeni Liste Oluştur</h2>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    resetForm();
                  }}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded-md"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-5">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  {/* Left Column - Settings */}
                  <div className="space-y-4">
                    {/* Title */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Liste Başlığı
                      </label>
                      <input
                        type="text"
                        value={formData.title || ""}
                        onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="Özel Ürünler"
                      />
                    </div>

                    {/* Selection Mode */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-2">
                        Seçim Modu
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleSelectionModeChange("all_products")}
                          className={`p-2.5 rounded-lg border text-left transition-all ${
                            selectionMode === "all_products"
                              ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500"
                              : "border-gray-200 hover:border-gray-300 bg-white"
                          }`}
                        >
                          <Filter
                            className={`w-4 h-4 mb-1 ${
                              selectionMode === "all_products" ? "text-indigo-600" : "text-gray-400"
                            }`}
                          />
                          <div
                            className={`text-xs font-medium ${
                              selectionMode === "all_products" ? "text-indigo-900" : "text-gray-700"
                            }`}
                          >
                            Kategoriden Seç
                          </div>
                          <div className="text-[10px] text-gray-500 mt-0.5">
                            Kategori bazlı seçim
                          </div>
                        </button>

                        <button
                          onClick={() => handleSelectionModeChange("shop_specific")}
                          className={`p-2.5 rounded-lg border text-left transition-all ${
                            selectionMode === "shop_specific"
                              ? "border-purple-500 bg-purple-50 ring-1 ring-purple-500"
                              : "border-gray-200 hover:border-gray-300 bg-white"
                          }`}
                        >
                          <Building
                            className={`w-4 h-4 mb-1 ${
                              selectionMode === "shop_specific" ? "text-purple-600" : "text-gray-400"
                            }`}
                          />
                          <div
                            className={`text-xs font-medium ${
                              selectionMode === "shop_specific" ? "text-purple-900" : "text-gray-700"
                            }`}
                          >
                            Mağazadan Seç
                          </div>
                          <div className="text-[10px] text-gray-500 mt-0.5">
                            Belirli mağaza ürünleri
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* Gradient Colors */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Başlangıç Rengi
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={formData.gradientStart || "#6366f1"}
                            onChange={(e) =>
                              setFormData((prev) => ({ ...prev, gradientStart: e.target.value }))
                            }
                            className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
                          />
                          <input
                            type="text"
                            value={formData.gradientStart || "#6366f1"}
                            onChange={(e) =>
                              setFormData((prev) => ({ ...prev, gradientStart: e.target.value }))
                            }
                            className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Bitiş Rengi
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={formData.gradientEnd || "#8b5cf6"}
                            onChange={(e) =>
                              setFormData((prev) => ({ ...prev, gradientEnd: e.target.value }))
                            }
                            className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
                          />
                          <input
                            type="text"
                            value={formData.gradientEnd || "#8b5cf6"}
                            onChange={(e) =>
                              setFormData((prev) => ({ ...prev, gradientEnd: e.target.value }))
                            }
                            className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Preview */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Önizleme:</span>
                      <div
                        className="flex-1 h-6 rounded border border-gray-200"
                        style={{
                          background: `linear-gradient(90deg, ${formData.gradientStart || "#6366f1"}, ${formData.gradientEnd || "#8b5cf6"})`,
                        }}
                      ></div>
                    </div>

                    {/* Limit & View All */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Ürün Limiti
                        </label>
                        <input
                          type="number"
                          value={formData.limit || 10}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              limit: parseInt(e.target.value) || 10,
                            }))
                          }
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          min="1"
                          max="20"
                        />
                      </div>
                      <div className="flex items-end pb-1">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.showViewAllButton || false}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                showViewAllButton: e.target.checked,
                              }))
                            }
                            className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                          />
                          <span className="text-xs text-gray-700">Tümünü Gör</span>
                        </label>
                      </div>
                    </div>

                    {/* Summary */}
                    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <h4 className="text-xs font-medium text-gray-700 mb-2">Özet</h4>
                      <div className="text-xs text-gray-600 space-y-1">
                        <div className="flex justify-between">
                          <span>Mod:</span>
                          <span className="font-medium">
                            {selectionMode === "all_products"
                              ? "Kategoriden Seçim"
                              : "Mağazadan Seçim"}
                          </span>
                        </div>
                        {selectedCategory && (
                          <div className="flex justify-between">
                            <span>Kategori:</span>
                            <span className="font-medium truncate max-w-[120px]">
                              {selectedCategory}
                            </span>
                          </div>
                        )}
                        {selectedShopForProducts && (
                          <div className="flex justify-between">
                            <span>Mağaza:</span>
                            <span className="font-medium truncate max-w-[120px]">
                              {shopSearchResults.find((s) => s.id === selectedShopForProducts)
                                ?.name || shops.find((s) => s.id === selectedShopForProducts)?.name}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span>Seçili Ürün:</span>
                          <span className="font-medium text-indigo-600">
                            {selectedProducts.length}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column - Product Selection */}
                  <div className="lg:col-span-2 space-y-4">
                    {/* Category Selection (for all_products mode) */}
                    {selectionMode === "all_products" && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-3">
                          {/* Category Dropdown */}
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Kategori
                            </label>
                            <div className="relative">
                              <select
                                value={selectedCategory}
                                onChange={(e) => {
                                  setSelectedCategory(e.target.value);
                                  setSelectedSubcategory("");
                                  setSelectedSubSubcategory("");
                                }}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none bg-white pr-8"
                              >
                                <option value="">Seçiniz...</option>
                                {categories.map((cat) => (
                                  <option key={cat} value={cat}>
                                    {cat}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                            </div>
                          </div>

                          {/* Subcategory Dropdown */}
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Alt Kategori
                            </label>
                            <div className="relative">
                              <select
                                value={selectedSubcategory}
                                onChange={(e) => {
                                  setSelectedSubcategory(e.target.value);
                                  setSelectedSubSubcategory("");
                                }}
                                disabled={!selectedCategory || subcategories.length === 0}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none bg-white pr-8 disabled:bg-gray-100 disabled:text-gray-400"
                              >
                                <option value="">Tümü</option>
                                {subcategories.map((sub) => (
                                  <option key={sub} value={sub}>
                                    {sub}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                            </div>
                          </div>

                          {/* Sub-subcategory Dropdown */}
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Alt Alt Kategori
                            </label>
                            <div className="relative">
                              <select
                                value={selectedSubSubcategory}
                                onChange={(e) => setSelectedSubSubcategory(e.target.value)}
                                disabled={
                                  !selectedSubcategory || subSubcategories.length === 0
                                }
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none bg-white pr-8 disabled:bg-gray-100 disabled:text-gray-400"
                              >
                                <option value="">Tümü</option>
                                {subSubcategories.map((subsub) => (
                                  <option key={subsub} value={subsub}>
                                    {subsub}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                            </div>
                          </div>
                        </div>

                        {selectedCategory && (
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Package className="w-3 h-3" />
                              {totalProductsLoaded} ürün yüklendi
                            </span>
                            {hasMoreProducts && (
                              <span className="text-indigo-600">• Daha fazla mevcut</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Shop Search (for shop_specific mode) */}
                    {selectionMode === "shop_specific" && !selectedShopForProducts && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Mağaza Ara
                          </label>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                              type="text"
                              value={shopSearchTerm}
                              onChange={(e) => setShopSearchTerm(e.target.value)}
                              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                              placeholder="Mağaza adı yazın... (en az 2 karakter)"
                            />
                            {searchingShops && (
                              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-500 animate-spin" />
                            )}
                          </div>
                        </div>

                        {/* Shop Search Results */}
                        {shopSearchResults.length > 0 && (
                          <div className="border border-gray-200 rounded-lg overflow-hidden">
                            {shopSearchResults.map((shop) => (
                              <button
                                key={shop.id}
                                onClick={() => handleShopSelectionForProducts(shop)}
                                className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors text-left"
                              >
                                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                  <Store className="w-5 h-5 text-purple-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-gray-900 truncate">
                                    {shop.name}
                                  </div>
                                  <div className="text-xs text-gray-500 truncate">
                                    {shop.category || "Kategori belirtilmemiş"}
                                  </div>
                                </div>
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                              </button>
                            ))}
                          </div>
                        )}

                        {shopSearchTerm.length >= 2 &&
                          !searchingShops &&
                          shopSearchResults.length === 0 && (
                            <div className="text-center py-8 text-gray-500">
                              <Store className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                              <p className="text-sm">Mağaza bulunamadı</p>
                            </div>
                          )}

                        {shopSearchTerm.length < 2 && (
                          <div className="text-center py-8 text-gray-400">
                            <Search className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                            <p className="text-sm">Mağaza aramak için en az 2 karakter girin</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Selected Shop Info */}
                    {selectionMode === "shop_specific" && selectedShopForProducts && (
                      <div className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                        <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                          <Store className="w-4 h-4 text-purple-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-purple-900">
                            {shops.find((s) => s.id === selectedShopForProducts)?.name ||
                              "Mağaza"}
                          </div>
                          <div className="text-xs text-purple-600">
                            {shopProducts.length} ürün yüklendi
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedShopForProducts("");
                            setShopProducts([]);
                            setLastShopProductDoc(null);
                            setHasMoreShopProducts(true);
                            setSelectedProducts([]);
                          }}
                          className="p-1 text-purple-400 hover:text-purple-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Product Search */}
                    {((selectionMode === "all_products" && selectedCategory) ||
                      (selectionMode === "shop_specific" && selectedShopForProducts)) && (
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="Ürün ara..."
                        />
                      </div>
                    )}

                    {/* Products Grid */}
                    {((selectionMode === "all_products" && selectedCategory) ||
                      (selectionMode === "shop_specific" && selectedShopForProducts)) && (
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="max-h-[340px] overflow-y-auto bg-gray-50 p-3">
                          {loadingProducts || loadingShopProducts ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                              <span className="ml-2 text-sm text-gray-500">
                                Ürünler yükleniyor...
                              </span>
                            </div>
                          ) : filteredProducts.length > 0 ? (
                            <>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {filteredProducts.map((product) => (
                                  <div
                                    key={product.id}
                                    onClick={() => toggleProductSelection(product.id)}
                                    className={`p-2 rounded-lg border cursor-pointer transition-all ${
                                      selectedProducts.includes(product.id)
                                        ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500"
                                        : "border-gray-200 bg-white hover:border-gray-300"
                                    }`}
                                  >
                                    <div className="flex items-start gap-2">
                                      <div className="flex-shrink-0">
                                        {product.imageUrls && product.imageUrls.length > 0 ? (
                                          <img
                                            src={product.imageUrls[0]}
                                            alt={product.productName}
                                            className="w-10 h-10 object-cover rounded"
                                          />
                                        ) : (
                                          <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center">
                                            <Package className="w-5 h-5 text-gray-400" />
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <h4 className="text-xs font-medium text-gray-900 line-clamp-2">
                                          {product.productName}
                                        </h4>
                                        <p className="text-[10px] text-gray-500 truncate mt-0.5">
                                          {product.sellerName || product.shopName}
                                        </p>
                                        {product.price && (
                                          <p className="text-[10px] font-medium text-green-600 mt-0.5">
                                            ₺{product.price.toLocaleString()}
                                          </p>
                                        )}
                                      </div>
                                      {selectedProducts.includes(product.id) && (
                                        <CheckCircle className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* Load More Button */}
                              {((selectionMode === "all_products" && hasMoreProducts) ||
                                (selectionMode === "shop_specific" && hasMoreShopProducts)) && (
                                <div className="mt-3 text-center">
                                  <button
                                    onClick={() => {
                                      if (selectionMode === "all_products") {
                                        loadProductsByCategory(false);
                                      } else if (selectionMode === "shop_specific") {
                                        loadShopProducts(selectedShopForProducts, false);
                                      }
                                    }}
                                    disabled={loadingProducts || loadingShopProducts}
                                    className="px-4 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors disabled:opacity-50"
                                  >
                                    {loadingProducts || loadingShopProducts ? (
                                      <span className="flex items-center gap-1">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        Yükleniyor...
                                      </span>
                                    ) : (
                                      "Daha Fazla Yükle"
                                    )}
                                  </button>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="text-center py-8">
                              <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                              <p className="text-sm text-gray-500">
                                {searchTerm
                                  ? "Arama kriterine uygun ürün bulunamadı"
                                  : "Bu kategoride ürün bulunamadı"}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Empty State */}
                    {selectionMode === "all_products" && !selectedCategory && (
                      <div className="flex items-center justify-center py-16 border border-gray-200 rounded-lg bg-gray-50">
                        <div className="text-center">
                          <Filter className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                          <p className="text-sm text-gray-500">
                            Ürünleri görüntülemek için kategori seçin
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50">
                <div className="text-xs text-gray-500">
                  {selectedProducts.length > 0 && (
                    <span className="flex items-center gap-1">
                      <CheckCircle className="w-3 h-3 text-green-500" />
                      {selectedProducts.length} ürün seçildi
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      resetForm();
                    }}
                    className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 transition-colors"
                  >
                    İptal
                  </button>
                  <button
                    onClick={handleCreateList}
                    disabled={saving || selectedProducts.length === 0 || !formData.title?.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Oluşturuluyor...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Liste Oluştur
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit List Modal */}
        {editingList && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50">
                <h2 className="text-base font-semibold text-gray-900">Liste Düzenle</h2>
                <button
                  onClick={() => setEditingList(null)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded-md"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-5 space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Liste Başlığı
                  </label>
                  <input
                    type="text"
                    value={editingList.title}
                    onChange={(e) =>
                      setEditingList((prev) => (prev ? { ...prev, title: e.target.value } : null))
                    }
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Gradient Colors */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Başlangıç Rengi
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={editingList.gradientStart}
                        onChange={(e) =>
                          setEditingList((prev) =>
                            prev ? { ...prev, gradientStart: e.target.value } : null
                          )
                        }
                        className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={editingList.gradientStart}
                        onChange={(e) =>
                          setEditingList((prev) =>
                            prev ? { ...prev, gradientStart: e.target.value } : null
                          )
                        }
                        className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Bitiş Rengi
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={editingList.gradientEnd}
                        onChange={(e) =>
                          setEditingList((prev) =>
                            prev ? { ...prev, gradientEnd: e.target.value } : null
                          )
                        }
                        className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={editingList.gradientEnd}
                        onChange={(e) =>
                          setEditingList((prev) =>
                            prev ? { ...prev, gradientEnd: e.target.value } : null
                          )
                        }
                        className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded"
                      />
                    </div>
                  </div>
                </div>

                {/* Preview */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Önizleme:</span>
                  <div
                    className="flex-1 h-6 rounded border border-gray-200"
                    style={{
                      background: `linear-gradient(90deg, ${editingList.gradientStart}, ${editingList.gradientEnd})`,
                    }}
                  ></div>
                </div>

                {/* Settings */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Ürün Limiti
                    </label>
                    <input
                      type="number"
                      value={editingList.limit}
                      onChange={(e) =>
                        setEditingList((prev) =>
                          prev ? { ...prev, limit: parseInt(e.target.value) || 10 } : null
                        )
                      }
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      min="1"
                      max="20"
                    />
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingList.showViewAllButton}
                        onChange={(e) =>
                          setEditingList((prev) =>
                            prev ? { ...prev, showViewAllButton: e.target.checked } : null
                          )
                        }
                        className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                      />
                      <span className="text-xs text-gray-700">Tümünü Gör Butonu</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => setEditingList(null)}
                  className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={() => handleUpdateList(editingList.id, editingList)}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Güncelleniyor...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Güncelle
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
