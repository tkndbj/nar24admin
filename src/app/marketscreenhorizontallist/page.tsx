"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
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

// Selection mode types
type SelectionMode = 'all_products' | 'shop_all' | 'shop_specific';

export default function MarketScreenHorizontalProductList() {
  const [lists, setLists] = useState<ProductListConfig[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingList, setEditingList] = useState<ProductListConfig | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  // New state for shop-specific selection
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('all_products');
  const [selectedShopForProducts, setSelectedShopForProducts] = useState<string>("");
  const [shopProducts, setShopProducts] = useState<Product[]>([]);
  const [loadingShopProducts, setLoadingShopProducts] = useState(false);

  // Form state for creating/editing lists
  const [formData, setFormData] = useState<Partial<ProductListConfig>>({
    title: "",
    selectedProductIds: [],
    selectedShopId: "",
    gradientStart: "#FF6B35",
    gradientEnd: "#FF8A65",
    isActive: true,
    limit: 10,
    showViewAllButton: true,
  });

  // Load shop products when a shop is selected
  const loadShopProducts = useCallback(async (shopId: string) => {
    if (!shopId) {
      setShopProducts([]);
      return;
    }

    setLoadingShopProducts(true);
    try {
      console.log('Loading products for shop:', shopId);
      
      const shopProductsQuery = query(
        collection(db, "shop_products"),
        where("shopId", "==", shopId)
      );
      
      const snapshot = await getDocs(shopProductsQuery);
      const shopProductsData = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          shopName: data.sellerName || shops.find(s => s.id === data.shopId)?.name || "Bilinmeyen Mağaza",
          isActive: true
        };
      }) as Product[];

      console.log(`Loaded ${shopProductsData.length} products for shop ${shopId}`);
      setShopProducts(shopProductsData);
    } catch (error) {
      console.error("Error loading shop products:", error);
      setShopProducts([]);
    } finally {
      setLoadingShopProducts(false);
    }
  }, [shops]);

  // Handle selection mode change
  const handleSelectionModeChange = useCallback((mode: SelectionMode) => {
    console.log('Selection mode changed to:', mode);
    
    setSelectionMode(mode);
    
    // Clear previous selections
    setSelectedProducts([]);
    setSelectedShopForProducts("");
    setShopProducts([]);
    setSearchTerm("");
    setShowSearchSuggestions(false);
    setSearchFocused(false);

    // Update form data based on mode
    setFormData(prev => ({
      ...prev,
      selectedProductIds: [],
      selectedShopId: mode === 'shop_all' ? prev.selectedShopId : "",
    }));
  }, []);

  // Handle shop selection for specific product selection
  const handleShopSelectionForProducts = useCallback(async (shopId: string) => {
    console.log('Shop selected for product selection:', shopId);
    
    setSelectedShopForProducts(shopId);
    setSelectedProducts([]);
    
    // Clear shop selection from form data since we're selecting specific products
    setFormData(prev => ({
      ...prev,
      selectedShopId: "",
      selectedProductIds: [],
    }));

    if (shopId) {
      await loadShopProducts(shopId);
    } else {
      setShopProducts([]);
    }
  }, [loadShopProducts]);

  // Data loading - Enhanced with better error handling
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

        // Load all shops
        console.log('Loading shops...');
        const shopsSnapshot = await getDocs(collection(db, "shops"));
        
        const shopsData = shopsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Shop[];

        console.log('Shops loaded:', shopsData.length);
        setShops(shopsData);

        // Create a map for quick shop lookup
        const shopMap = new Map();
        shopsData.forEach(shop => {
          shopMap.set(shop.id, shop.name);
        });

        // Load all products
        console.log('Loading products...');
        const productsSnapshot = await getDocs(collection(db, "shop_products"));

        const productsData = productsSnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            shopName: data.sellerName || shopMap.get(data.shopId) || "Bilinmeyen Mağaza",
            isActive: true
          };
        }) as Product[];

        console.log('Products loaded:', productsData.length);
        setProducts(productsData);
        
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // Cleanup function
    return () => {
      if (unsubscribeLists) {
        unsubscribeLists();
      }
    };
  }, []);

  // Get products to display based on selection mode
  const displayProducts = useMemo(() => {
    switch (selectionMode) {
      case 'all_products':
        return products;
      case 'shop_specific':
        return shopProducts;
      default:
        return [];
    }
  }, [selectionMode, products, shopProducts]);

  // Filtered products logic
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return displayProducts;
    
    const term = searchTerm.toLowerCase().trim();
    console.log('Filtering products with term:', term);
    
    const filtered = displayProducts.filter((product) => {
      const nameMatch = product.productName?.toLowerCase().includes(term);
      const shopMatch = product.shopName?.toLowerCase().includes(term);
      const sellerMatch = product.sellerName?.toLowerCase().includes(term);
      const brandMatch = product.brandModel?.toLowerCase().includes(term);
      return nameMatch || shopMatch || sellerMatch || brandMatch;
    });
    
    console.log('Filtered products count:', filtered.length);
    return filtered;
  }, [displayProducts, searchTerm]);

  // Search suggestions
  const searchSuggestions = useMemo(() => {
    if (!searchTerm.trim() || searchTerm.length < 2) {
      return { products: [], shops: [] };
    }
    
    const term = searchTerm.toLowerCase().trim();
    
    // For shop_specific mode, only suggest from shop products
    const searchProducts = selectionMode === 'shop_specific' ? shopProducts : products;
    
    const suggestedProducts = searchProducts
      .filter((product) => {
        return product.productName?.toLowerCase().includes(term) ||
               product.shopName?.toLowerCase().includes(term) ||
               product.sellerName?.toLowerCase().includes(term) ||
               product.brandModel?.toLowerCase().includes(term);
      })
      .slice(0, 5);
    
    // Only show shop suggestions in appropriate modes
    const suggestedShops = (selectionMode === 'all_products' || selectionMode === 'shop_all') 
      ? shops
          .filter((shop) => {
            return shop.name?.toLowerCase().includes(term) ||
                   shop.category?.toLowerCase().includes(term);
          })
          .slice(0, 3)
      : [];
    
    return { products: suggestedProducts, shops: suggestedShops };
  }, [products, shopProducts, shops, searchTerm, selectionMode]);

  // Handle search suggestion selection
  const handleSuggestionSelect = useCallback((type: 'product' | 'shop', item: Product | Shop) => {
    console.log('Suggestion selected:', type, item);
    
    if (type === 'product') {
      const product = item as Product;
      toggleProductSelection(product.id);
    } else {
      const shop = item as Shop;
      if (selectionMode === 'shop_all') {
        setFormData((prev) => ({
          ...prev,
          selectedShopId: shop.id,
          selectedProductIds: [],
        }));
        setSelectedProducts([]);
      } else if (selectionMode === 'shop_specific') {
        handleShopSelectionForProducts(shop.id);
      }
    }
    
    setSearchTerm('');
    setShowSearchSuggestions(false);
    setSearchFocused(false);
  }, [selectionMode, handleShopSelectionForProducts]);

  // Create new list
  const handleCreateList = async () => {
    setSaving(true);
    try {
      if (!formData.title?.trim()) {
        alert("Başlık gereklidir");
        return;
      }

      // Validation based on selection mode
      const hasProducts = formData.selectedProductIds && formData.selectedProductIds.length > 0;
      const hasShop = formData.selectedShopId;

      if (!hasProducts && !hasShop) {
        alert("En az bir ürün veya bir mağaza seçmelisiniz");
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

      // Reset form
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
      gradientStart: "#FF6B35",
      gradientEnd: "#FF8A65",
      isActive: true,
      limit: 10,
      showViewAllButton: true,
    });
    setSelectedProducts([]);
    setSearchTerm("");
    setShowSearchSuggestions(false);
    setSearchFocused(false);
    setSelectionMode('all_products');
    setSelectedShopForProducts("");
    setShopProducts([]);
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
    console.log('Toggling product selection:', productId);
    
    setSelectedProducts((prev) => {
      const newSelection = prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId];
      
      console.log('New product selection:', newSelection);
      
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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        {/* Header */}
        <header className="backdrop-blur-xl bg-white/10 border-b border-white/20 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-orange-500 to-pink-600 rounded-lg">
                  <List className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">
                    Yatay Ürün Listeleri
                  </h1>
                  <p className="text-sm text-gray-300">
                    Market ekranında gösterilecek ürün listelerini yönetin
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-gray-300">Aktif: {totalActiveLists}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-blue-400" />
                    <span className="text-gray-300">
                      Toplam Liste: {lists.length}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-medium rounded-xl transition-all duration-200"
                >
                  <Plus className="w-4 h-4" />
                  Yeni Liste
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            </div>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="lists">
                {(provided: DroppableProvided) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className="space-y-4"
                  >
                    {lists.map((list, index) => (
                      <Draggable key={list.id} draggableId={list.id} index={index}>
                        {(
                          provided: DraggableProvided,
                          snapshot: DraggableStateSnapshot
                        ) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-6 transition-all duration-200 ${
                              snapshot.isDragging ? "scale-105 shadow-2xl" : ""
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4 flex-1">
                                <div
                                  {...provided.dragHandleProps}
                                  className="cursor-grab active:cursor-grabbing"
                                >
                                  <GripVertical className="w-5 h-5 text-gray-400" />
                                </div>

                                <div className="flex items-center gap-3">
                                  {/* Gradient Preview */}
                                  <div
                                    className="w-8 h-8 rounded-lg border border-white/20"
                                    style={{
                                      background: `linear-gradient(90deg, ${list.gradientStart}, ${list.gradientEnd})`,
                                    }}
                                  ></div>
                                  
                                  <div>
                                    <h3 className="text-lg font-semibold text-white">
                                      {list.title}
                                    </h3>
                                    <div className="flex items-center gap-4 text-sm text-gray-300">
                                      <span>Sıra: {list.order}</span>
                                      {list.selectedProductIds && list.selectedProductIds.length > 0 && (
                                        <span>{list.selectedProductIds.length} özel ürün</span>
                                      )}
                                      {list.selectedShopId && (
                                        <span>
                                          Mağaza: {shops.find(s => s.id === list.selectedShopId)?.name || "Bilinmeyen"}
                                        </span>
                                      )}
                                      <span>Limit: {list.limit}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                {/* Status indicator */}
                                <div className="flex items-center gap-2 px-3 py-1 bg-black/20 rounded-lg">
                                  {list.isActive ? (
                                    <CheckCircle className="w-4 h-4 text-green-400" />
                                  ) : (
                                    <Clock className="w-4 h-4 text-gray-400" />
                                  )}
                                  <span className="text-sm text-gray-300">
                                    {list.isActive ? "Aktif" : "Pasif"}
                                  </span>
                                </div>

                                {/* Active Toggle */}
                                <button
                                  onClick={() =>
                                    handleUpdateList(list.id, { isActive: !list.isActive })
                                  }
                                  className={`p-2 rounded-lg transition-colors ${
                                    list.isActive
                                      ? "bg-green-600/20 text-green-400 hover:bg-green-600/30"
                                      : "bg-gray-600/20 text-gray-400 hover:bg-gray-600/30"
                                  }`}
                                >
                                  {list.isActive ? (
                                    <Eye className="w-4 h-4" />
                                  ) : (
                                    <EyeOff className="w-4 h-4" />
                                  )}
                                </button>

                                {/* Edit Button */}
                                <button
                                  onClick={() => setEditingList(list)}
                                  className="p-2 bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 rounded-lg transition-colors"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>

                                {/* Delete Button */}
                                <button
                                  onClick={() => handleDeleteList(list.id)}
                                  className="p-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors"
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
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </main>

        {/* Create List Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-white/20 rounded-xl p-6 max-w-5xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">Yeni Liste Oluştur</h2>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    resetForm();
                  }}
                  className="p-2 text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                {/* Basic Settings */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Liste Başlığı
                  </label>
                  <input
                    type="text"
                    value={formData.title || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, title: e.target.value }))
                    }
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Özel Ürünler"
                  />
                </div>

                {/* Selection Mode */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Seçim Modu
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <button
                      onClick={() => handleSelectionModeChange('all_products')}
                      className={`p-4 rounded-lg border transition-all ${
                        selectionMode === 'all_products'
                          ? 'border-blue-500 bg-blue-600/20 text-blue-300'
                          : 'border-white/20 bg-white/5 text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      <Package className="w-6 h-6 mx-auto mb-2" />
                      <div className="text-sm font-medium">Tüm Ürünlerden Seç</div>
                      <div className="text-xs opacity-75 mt-1">Herhangi bir üründen seçim yap</div>
                    </button>

                    <button
                      onClick={() => handleSelectionModeChange('shop_all')}
                      className={`p-4 rounded-lg border transition-all ${
                        selectionMode === 'shop_all'
                          ? 'border-green-500 bg-green-600/20 text-green-300'
                          : 'border-white/20 bg-white/5 text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      <Store className="w-6 h-6 mx-auto mb-2" />
                      <div className="text-sm font-medium">Mağaza - Tüm Ürünler</div>
                      <div className="text-xs opacity-75 mt-1">Bir mağazanın tüm ürünlerini al</div>
                    </button>

                    <button
                      onClick={() => handleSelectionModeChange('shop_specific')}
                      className={`p-4 rounded-lg border transition-all ${
                        selectionMode === 'shop_specific'
                          ? 'border-purple-500 bg-purple-600/20 text-purple-300'
                          : 'border-white/20 bg-white/5 text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      <Building className="w-6 h-6 mx-auto mb-2" />
                      <div className="text-sm font-medium">Mağaza - Belirli Ürünler</div>
                      <div className="text-xs opacity-75 mt-1">Bir mağazadan belirli ürünleri seç</div>
                    </button>
                  </div>
                </div>

                {/* Shop Selection for shop_specific mode */}
                {selectionMode === 'shop_specific' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-3">
                      Mağaza Seçimi
                    </label>
                    
                    {!selectedShopForProducts ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-48 overflow-y-auto">
                        {shops.map((shop) => (
                          <button
                            key={shop.id}
                            onClick={() => handleShopSelectionForProducts(shop.id)}
                            className="p-3 text-left border border-white/20 bg-white/5 hover:bg-white/10 rounded-lg transition-all"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex items-center justify-center w-10 h-10 bg-purple-600/20 rounded-lg">
                                <Store className="w-5 h-5 text-purple-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-white truncate">{shop.name}</div>
                                <div className="text-xs text-gray-400 truncate">
                                  {shop.category || "Kategori yok"}
                                </div>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 bg-purple-600/10 border border-purple-500/20 rounded-lg">
                        <div className="flex items-center gap-3 mb-3">
                          <CheckCircle className="w-5 h-5 text-purple-400" />
                          <span className="text-purple-300 font-medium">
                            {shops.find(s => s.id === selectedShopForProducts)?.name || "Mağaza bulunamadı"}
                          </span>
                          <button
                            onClick={() => handleShopSelectionForProducts("")}
                            className="ml-auto p-1 text-gray-400 hover:text-white"
                          >
                            <ArrowLeft className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="text-xs text-gray-400">
                          Bu mağazadan istediğiniz ürünleri aşağıdan seçebilirsiniz
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Shop Selection for shop_all mode */}
                {selectionMode === 'shop_all' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-3">
                      Mağaza Seçimi (Tüm Ürünler)
                    </label>
                    
                    {formData.selectedShopId ? (
                      <div className="p-4 bg-green-600/10 border border-green-500/20 rounded-lg">
                        <div className="flex items-center gap-3">
                          <CheckCircle className="w-5 h-5 text-green-400" />
                          <span className="text-green-300 font-medium">
                            {shops.find(s => s.id === formData.selectedShopId)?.name || "Mağaza bulunamadı"}
                          </span>
                          <button
                            onClick={() => {
                              setFormData(prev => ({ ...prev, selectedShopId: "" }));
                            }}
                            className="ml-auto p-1 text-red-400 hover:text-red-300"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="text-xs text-gray-400 mt-2">
                          Bu mağazadaki tüm aktif ürünler listeye dahil edilecek
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-48 overflow-y-auto">
                        {shops.map((shop) => (
                          <button
                            key={shop.id}
                            onClick={() => {
                              setFormData(prev => ({ ...prev, selectedShopId: shop.id }));
                            }}
                            className="p-3 text-left border border-white/20 bg-white/5 hover:bg-white/10 rounded-lg transition-all"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex items-center justify-center w-10 h-10 bg-green-600/20 rounded-lg">
                                <Store className="w-5 h-5 text-green-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-white truncate">{shop.name}</div>
                                <div className="text-xs text-gray-400 truncate">
                                  {shop.category || "Kategori yok"}
                                </div>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Gradient Colors */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Gradient Başlangıç Rengi
                    </label>
                    <input
                      type="color"
                      value={formData.gradientStart || "#FF6B35"}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, gradientStart: e.target.value }))
                      }
                      className="w-full h-10 bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Gradient Bitiş Rengi
                    </label>
                    <input
                      type="color"
                      value={formData.gradientEnd || "#FF8A65"}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, gradientEnd: e.target.value }))
                      }
                      className="w-full h-10 bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Gradient Preview */}
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-300">Önizleme:</span>
                  <div
                    className="w-32 h-8 rounded-lg border border-white/20"
                    style={{
                      background: `linear-gradient(90deg, ${formData.gradientStart || "#FF6B35"}, ${formData.gradientEnd || "#FF8A65"})`,
                    }}
                  ></div>
                </div>

                {/* Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Ürün Limiti
                    </label>
                    <input
                      type="number"
                      value={formData.limit || 10}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, limit: parseInt(e.target.value) || 10 }))
                      }
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="1"
                      max="20"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="showViewAll"
                      checked={formData.showViewAllButton || false}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, showViewAllButton: e.target.checked }))
                      }
                      className="w-4 h-4 text-blue-600 bg-white/10 border-white/20 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="showViewAll" className="text-sm text-gray-300">
                      &quot;Tümünü Gör&quot; Butonu Göster
                    </label>
                  </div>
                </div>

                {/* Product Selection - Only show for relevant modes */}
                {(selectionMode === 'all_products' || (selectionMode === 'shop_specific' && selectedShopForProducts)) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Ürün Seçimi
                      {selectedProducts.length > 0 && (
                        <span className="ml-2 text-blue-400">({selectedProducts.length} ürün seçili)</span>
                      )}
                    </label>
                    
                    {/* Debug Info - Only in development */}
                    {process.env.NODE_ENV === 'development' && (
                      <div className="mb-4 p-3 bg-gray-800/50 rounded-lg text-xs">
                        <div className="text-gray-400 mb-2">Debug Info:</div>
                        <div>Selection Mode: {selectionMode}</div>
                        <div>Display Products: {displayProducts.length}</div>
                        <div>Shop Products: {shopProducts.length}</div>
                        <div>Total Products: {products.length}</div>
                        <div>Loading Shop Products: {loadingShopProducts.toString()}</div>
                        <div>Selected Shop: {selectedShopForProducts}</div>
                        <div>Search Term: &quot;{searchTerm}&quot; (length: {searchTerm.length})</div>
                        <div>Filtered Products: {filteredProducts.length}</div>
                      </div>
                    )}
                      
                    {/* Search */}
                    <div className="relative mb-4">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => {
                          const value = e.target.value;
                          setSearchTerm(value);
                          setShowSearchSuggestions(value.length >= 2);
                        }}
                        onFocus={() => {
                          setSearchFocused(true);
                          setShowSearchSuggestions(searchTerm.length >= 2);
                        }}
                        onBlur={() => {
                          setTimeout(() => {
                            setShowSearchSuggestions(false);
                            setSearchFocused(false);
                          }, 200);
                        }}
                        placeholder={
                          selectionMode === 'shop_specific' 
                            ? "Seçili mağazadan ürün ara..." 
                            : "Ürün veya mağaza ara... (en az 2 karakter)"
                        }
                        className={`w-full pl-10 pr-4 py-2 bg-white/10 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          searchTerm.length >= 2 ? 'border-blue-500' : 'border-white/20'
                        }`}
                      />
                      
                      {/* Search Status */}
                      {searchTerm.length > 0 && searchTerm.length < 2 && (
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-yellow-400">
                          {2 - searchTerm.length} more
                        </div>
                      )}
                      
                      {/* Search Suggestions */}
                      {showSearchSuggestions && searchFocused && searchTerm.length >= 2 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-slate-700 border border-white/20 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                          {searchSuggestions.products.length === 0 && searchSuggestions.shops.length === 0 && (
                            <div className="p-4 text-center text-gray-400">
                              <div className="text-sm">&quot;{searchTerm}&quot; için sonuç bulunamadı</div>
                            </div>
                          )}
                          
                          {/* Shop Suggestions */}
                          {searchSuggestions.shops.length > 0 && (
                            <div className="p-2 border-b border-white/10">
                              <div className="text-xs font-medium text-gray-300 mb-2 px-2">Mağazalar</div>
                              {searchSuggestions.shops.map((shop) => (
                                <div
                                  key={`shop-${shop.id}`}
                                  className="flex items-center gap-3 p-2 hover:bg-white/10 rounded-lg cursor-pointer transition-colors"
                                  onClick={() => handleSuggestionSelect('shop', shop)}
                                >
                                  <div className="flex items-center justify-center w-8 h-8 bg-green-600/20 rounded-lg">
                                    <Store className="w-4 h-4 text-green-400" />
                                  </div>
                                  <div className="flex-1">
                                    <div className="text-sm font-medium text-white">{shop.name}</div>
                                    <div className="text-xs text-gray-400">
                                      {selectionMode === 'all_products' ? 'Mağaza • Tüm ürünleri seç' : 'Mağaza • Belirli ürünleri seç'}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          
                          {/* Product Suggestions */}
                          {searchSuggestions.products.length > 0 && (
                            <div className="p-2">
                              <div className="text-xs font-medium text-gray-300 mb-2 px-2">Ürünler</div>
                              {searchSuggestions.products.map((product) => (
                                <div
                                  key={`product-${product.id}`}
                                  className="flex items-center gap-3 p-2 hover:bg-white/10 rounded-lg cursor-pointer transition-colors"
                                  onClick={() => handleSuggestionSelect('product', product)}
                                >
                                  <div className="flex-shrink-0">
                                    {product.imageUrls && product.imageUrls.length > 0 ? (
                                      <img
                                        src={product.imageUrls[0]}
                                        alt={product.productName}
                                        className="w-8 h-8 object-cover rounded-lg"
                                      />
                                    ) : (
                                      <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center">
                                        <Package className="w-4 h-4 text-blue-400" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-white truncate">{product.productName}</div>
                                    <div className="text-xs text-gray-400 truncate">
                                      {product.sellerName || product.shopName || "Mağaza bilgisi yok"}
                                      {product.price && ` • ₺${product.price.toLocaleString()}`}
                                    </div>
                                  </div>
                                  {selectedProducts.includes(product.id) && (
                                    <CheckCircle className="w-4 h-4 text-blue-400 flex-shrink-0" />
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Loading indicator for shop products */}
                    {selectionMode === 'shop_specific' && loadingShopProducts && (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400"></div>
                        <span className="ml-2 text-gray-400">Mağaza ürünleri yükleniyor...</span>
                      </div>
                    )}

                    {/* Products Grid */}
                    {!loadingShopProducts && (
                      <div className="max-h-64 overflow-y-auto bg-black/20 rounded-lg p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {filteredProducts.map((product) => (
                            <div
                              key={product.id}
                              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                                selectedProducts.includes(product.id)
                                  ? "border-blue-500 bg-blue-600/20"
                                  : "border-white/20 bg-white/5 hover:bg-white/10"
                              }`}
                              onClick={() => toggleProductSelection(product.id)}
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex-shrink-0">
                                  {product.imageUrls && product.imageUrls.length > 0 ? (
                                    <img
                                      src={product.imageUrls[0]}
                                      alt={product.productName}
                                      className="w-12 h-12 object-cover rounded-lg"
                                    />
                                  ) : (
                                    <div className="w-12 h-12 bg-gray-600 rounded-lg flex items-center justify-center">
                                      <Package className="w-6 h-6 text-gray-400" />
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-sm font-medium text-white truncate">
                                    {product.productName}
                                  </h4>
                                  <p className="text-xs text-gray-400 truncate">
                                    {product.sellerName || product.shopName || "Mağaza bilgisi yok"}
                                  </p>
                                  {product.price && (
                                    <p className="text-xs text-green-400">
                                      ₺{product.price.toLocaleString()}
                                    </p>
                                  )}
                                </div>
                                {selectedProducts.includes(product.id) && (
                                  <CheckCircle className="w-5 h-5 text-blue-400 flex-shrink-0" />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        {/* Empty states */}
                        {filteredProducts.length === 0 && searchTerm.trim() && (
                          <div className="text-center py-8">
                            <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                            <p className="text-gray-400 mb-2">
                              Arama kriterine uygun ürün bulunamadı
                            </p>
                            <p className="text-xs text-gray-500">
                              Farklı arama terimleri deneyin
                            </p>
                          </div>
                        )}
                        
                        {filteredProducts.length === 0 && !searchTerm.trim() && displayProducts.length === 0 && (
                          <div className="text-center py-8">
                            <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                            <p className="text-gray-400">
                              {selectionMode === 'shop_specific' 
                                ? "Bu mağazada ürün bulunamadı" 
                                : "Ürün bulunamadı"
                              }
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Summary */}
                <div className="p-4 bg-slate-700/50 rounded-lg">
                  <h4 className="text-sm font-medium text-white mb-2">Özet</h4>
                  <div className="text-sm text-gray-300 space-y-1">
                    <div>Mod: {
                      selectionMode === 'all_products' ? 'Tüm Ürünlerden Seçim' :
                      selectionMode === 'shop_all' ? 'Mağaza - Tüm Ürünler' :
                      'Mağaza - Belirli Ürünler'
                    }</div>
                    {formData.selectedShopId && (
                      <div>Seçili Mağaza: {shops.find(s => s.id === formData.selectedShopId)?.name}</div>
                    )}
                    {selectedShopForProducts && (
                      <div>Ürün Seçimi Yapılan Mağaza: {shops.find(s => s.id === selectedShopForProducts)?.name}</div>
                    )}
                    {selectedProducts.length > 0 && (
                      <div>Seçili Ürün Sayısı: {selectedProducts.length}</div>
                    )}
                    <div>Görüntüleme Limiti: {formData.limit}</div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/20">
                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      resetForm();
                    }}
                    className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
                  >
                    İptal
                  </button>
                  <button
                    onClick={handleCreateList}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-600 text-white font-medium rounded-lg transition-all duration-200"
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
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
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-white/20 rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">Liste Düzenle</h2>
                <button
                  onClick={() => setEditingList(null)}
                  className="p-2 text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Basic Settings */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Liste Başlığı
                  </label>
                  <input
                    type="text"
                    value={editingList.title}
                    onChange={(e) =>
                      setEditingList((prev) =>
                        prev ? { ...prev, title: e.target.value } : null
                      )
                    }
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Gradient Colors */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Gradient Başlangıç Rengi
                    </label>
                    <input
                      type="color"
                      value={editingList.gradientStart}
                      onChange={(e) =>
                        setEditingList((prev) =>
                          prev ? { ...prev, gradientStart: e.target.value } : null
                        )
                      }
                      className="w-full h-10 bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Gradient Bitiş Rengi
                    </label>
                    <input
                      type="color"
                      value={editingList.gradientEnd}
                      onChange={(e) =>
                        setEditingList((prev) =>
                          prev ? { ...prev, gradientEnd: e.target.value } : null
                        )
                      }
                      className="w-full h-10 bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
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
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="1"
                      max="20"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="editShowViewAll"
                      checked={editingList.showViewAllButton}
                      onChange={(e) =>
                        setEditingList((prev) =>
                          prev ? { ...prev, showViewAllButton: e.target.checked } : null
                        )
                      }
                      className="w-4 h-4 text-blue-600 bg-white/10 border-white/20 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="editShowViewAll" className="text-sm text-gray-300">
                      &quot;Tümünü Gör&quot; Butonu Göster
                    </label>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/20">
                  <button
                    onClick={() => setEditingList(null)}
                    className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
                  >
                    İptal
                  </button>
                  <button
                    onClick={() => handleUpdateList(editingList.id, editingList)}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-600 text-white font-medium rounded-lg transition-all duration-200"
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
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
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}