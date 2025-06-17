"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import {
  ArrowLeft,
  ArrowRight,
  User,  
  ShoppingBag,
  Store,
  Edit,  
  X,
  Check,
  Loader2,
  Image as ImageIcon,
  Package,
  MapPin,  
  Star,
  Eye,
  Heart,
  TrendingUp,
  Activity,  
  Search,
  Grid,
  List,  
  Users,  
} from "lucide-react";
import { useState, useEffect, useMemo, useCallback, useRef, Suspense } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  updateDoc,
  Timestamp,
  DocumentSnapshot,  
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { toast } from "react-hot-toast";

// Types (keeping all the same types)
interface UserData {
  id: string;
  displayName: string;
  email: string;
  phone: string;
  gender: "Male" | "Female" | "";  
  profileImage?: string;  
  address?: string;  
  playPoints?: number;  
  totalProductsSold?: number;
  averageRating?: number;
  reviewCount?: number;  
  createdAt?: Timestamp;
  updatedAt?: Timestamp;  
}

interface OrderData {
    id: string;
    buyerId: string;
    totalPrice: number;
    totalQuantity: number;
    paymentMethod: 'PlayPoints' | 'Card';
    timestamp: Timestamp;
    address: {
      addressLine1: string;
      addressLine2?: string;
      city: string;
      phoneNumber: string;
      location: {
        latitude: number;
        longitude: number;
      };
    };
    itemCount: number;
  }
  
  interface OrderItemData {
    id: string;
    orderId: string;
    buyerId: string;
    productId: string;
    productName: string;
    price: number;
    currency: string;
    quantity: number;
    sellerName: string;
    buyerName: string;
    productImage: string;
    selectedColor?: string;
    selectedSize?: string;
    selectedFootwearSize?: string;
    selectedWaistSize?: string;
    selectedHeightSize?: string;
    sellerId: string;
    shopId?: string;
    shipmentStatus: string;
    timestamp: Timestamp;
    needsProductReview: boolean;
    needsSellerReview: boolean;
    needsAnyReview: boolean;
  }

interface ProductData {
  id: string;
  productName: string;
  price: number;
  currency: string;
  category: string;
  subcategory: string;
  imageUrls: string[];
  condition: string;
  clickCount: number;
  favoritesCount: number;
  purchaseCount: number;
  averageRating: number;
  reviewCount: number;
  sold: boolean;
  isFeatured: boolean;
  isBoosted: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  address: string;
  region: string;
}

interface ShopData {
  id: string;
  name: string;
  profileImageUrl?: string;
  coverImageUrls?: string[];
  categories?: string[];
  address?: string;
  contactNo?: string;
  followerCount?: number;
  averageRating?: number;
  reviewCount?: number;
  clickCount?: number;
  isBoosted?: boolean;
  createdAt?: Timestamp;
}

interface EditableField {
  field: keyof UserData;
  value: string;
  isEditing: boolean;
}

type ViewMode = "grid" | "list";
type FilterStatus = "all" | "active" | "sold" | "featured";
type SortBy = "newest" | "oldest" | "price_high" | "price_low" | "popular";

// Create a separate component that uses useSearchParams
function UserDetailsContent() {  
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId");

  // Refs for infinite scroll
  const productsObserverRef = useRef<IntersectionObserver | null>(null);
  const shopsObserverRef = useRef<IntersectionObserver | null>(null);
  const lastProductElementRef = useRef<HTMLDivElement | null>(null);
  const lastShopElementRef = useRef<HTMLDivElement | null>(null);

  // State Management
  const [user, setUser] = useState<UserData | null>(null);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [shops, setShops] = useState<ShopData[]>([]);
  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);
  const [shopsLoading, setShopsLoading] = useState(false);
  const [editableFields, setEditableFields] = useState<EditableField[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const [orders, setOrders] = useState<OrderData[]>([]);
const [orderItems, setOrderItems] = useState<OrderItemData[]>([]);
const [ordersLoading, setOrdersLoading] = useState(false);
const [lastOrderDoc, setLastOrderDoc] = useState<DocumentSnapshot | null>(null);
const [hasMoreOrders, setHasMoreOrders] = useState(true);
const ordersObserverRef = useRef<IntersectionObserver | null>(null);
const lastOrderElementRef = useRef<HTMLDivElement | null>(null);

  // Filter and Search States
  const [productSearch, setProductSearch] = useState("");
  const [shopSearch, setShopSearch] = useState("");
  const [productViewMode, setProductViewMode] = useState<ViewMode>("grid");
  const [shopViewMode, setShopViewMode] = useState<ViewMode>("grid");
  const [productFilter, setProductFilter] = useState<FilterStatus>("all");
  const [productSort, setProductSort] = useState<SortBy>("newest");
  const [activeTab, setActiveTab] = useState<"products" | "shops" | "orders">("products");

  // Pagination
  const [lastProductDoc, setLastProductDoc] = useState<DocumentSnapshot | null>(null);
  const [lastShopDoc, setLastShopDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const [hasMoreShops, setHasMoreShops] = useState(true);
  const ITEMS_PER_PAGE = 12;

  // Initialize editable fields
  const initializeEditableFields = useCallback((userData: UserData) => {
    setEditableFields([
      { field: "displayName", value: userData.displayName || "", isEditing: false },
      { field: "email", value: userData.email || "", isEditing: false },
      { field: "phone", value: userData.phone || "", isEditing: false },
      { field: "gender", value: userData.gender || "", isEditing: false },
    ]);
  }, []);

  // Fetch user data
  const fetchUserData = useCallback(async () => {
    if (!userId) {
      toast.error("Kullanıcı ID'si bulunamadı");
      router.push("/dashboard");
      return;
    }

    try {
      setLoading(true);
      const userDoc = await getDoc(doc(db, "users", userId));
      
      if (!userDoc.exists()) {
        toast.error("Kullanıcı bulunamadı");
        router.push("/dashboard");
        return;
      }

      const userData = { id: userDoc.id, ...userDoc.data() } as UserData;
      setUser(userData);
      initializeEditableFields(userData);
    } catch (error) {
      console.error("Error fetching user:", error);
      toast.error("Kullanıcı bilgileri yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  }, [userId, router, initializeEditableFields]);

  const fetchUserOrders = useCallback(async (append = false) => {
    if (!userId || ordersLoading) return;
  
    try {
      setOrdersLoading(true);
      let q = query(
        collection(db, "orders"),
        where("buyerId", "==", userId),
        orderBy("timestamp", "desc"),
        limit(ITEMS_PER_PAGE)
      );
  
      // Apply pagination
      if (append && lastOrderDoc) {
        q = query(q, startAfter(lastOrderDoc));
      }
  
      const snapshot = await getDocs(q);
      const ordersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as OrderData[];
  
      // Fetch order items for each order
      const allOrderItems: OrderItemData[] = [];
      for (const order of ordersData) {
        const itemsQuery = query(
          collection(db, "orders", order.id, "items"),
          orderBy("timestamp", "desc")
        );
        const itemsSnapshot = await getDocs(itemsQuery);
        const items = itemsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as OrderItemData[];
        allOrderItems.push(...items);
      }
  
      if (append) {
        setOrders(prev => [...prev, ...ordersData]);
        setOrderItems(prev => [...prev, ...allOrderItems]);
      } else {
        setOrders(ordersData);
        setOrderItems(allOrderItems);
        setLastOrderDoc(null);
      }
  
      // Set last document for pagination
      if (ordersData.length > 0) {
        setLastOrderDoc(snapshot.docs[snapshot.docs.length - 1]);
      }
  
      setHasMoreOrders(ordersData.length === ITEMS_PER_PAGE);
    } catch (error) {
      console.error("Error fetching orders:", error);
      toast.error("Siparişler yüklenirken hata oluştu");
    } finally {
      setOrdersLoading(false);
    }
  }, [userId, lastOrderDoc, ordersLoading]);

  // Fetch user products with pagination and filters
  const fetchUserProducts = useCallback(async (append = false) => {
    if (!userId || productsLoading) return;

    try {
      setProductsLoading(true);
      
      let q = query(
        collection(db, "products"),
        where("userId", "==", userId),
        orderBy(
          productSort === "newest" ? "createdAt" :
          productSort === "oldest" ? "createdAt" :
          productSort === "price_high" ? "price" :
          productSort === "price_low" ? "price" : "clickCount",
          productSort === "oldest" || productSort === "price_low" ? "asc" : "desc"
        ),
        limit(ITEMS_PER_PAGE)
      );

      // Apply pagination
      if (append && lastProductDoc) {
        q = query(q, startAfter(lastProductDoc));
      }

      const snapshot = await getDocs(q);
      const newProducts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ProductData[];

      if (append) {
        setProducts(prev => [...prev, ...newProducts]);
      } else {
        setProducts(newProducts);
        setLastProductDoc(null);
      }

      // Set last document for pagination
      if (newProducts.length > 0) {
        setLastProductDoc(snapshot.docs[snapshot.docs.length - 1]);
      }

      setHasMoreProducts(newProducts.length === ITEMS_PER_PAGE);
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error("Ürünler yüklenirken hata oluştu");
    } finally {
      setProductsLoading(false);
    }
  }, [userId, productSort, lastProductDoc, productsLoading]);

  // Fetch user shops
  const fetchUserShops = useCallback(async (append = false) => {
    if (!userId || shopsLoading) return;

    try {
      setShopsLoading(true);
      let q = query(
        collection(db, "shops"),
        where("ownerId", "==", userId),
        orderBy("createdAt", "desc"),
        limit(ITEMS_PER_PAGE)
      );

      // Apply pagination
      if (append && lastShopDoc) {
        q = query(q, startAfter(lastShopDoc));
      }

      const snapshot = await getDocs(q);
      const shopsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ShopData[];

      if (append) {
        setShops(prev => [...prev, ...shopsData]);
      } else {
        setShops(shopsData);
        setLastShopDoc(null);
      }

      // Set last document for pagination
      if (shopsData.length > 0) {
        setLastShopDoc(snapshot.docs[snapshot.docs.length - 1]);
      }

      setHasMoreShops(shopsData.length === ITEMS_PER_PAGE);
    } catch (error) {
      console.error("Error fetching shops:", error);
      toast.error("Mağazalar yüklenirken hata oluştu");
    } finally {
      setShopsLoading(false);
    }
  }, [userId, lastShopDoc, shopsLoading]);

  // Setup infinite scroll for products
  const setupProductsInfiniteScroll = useCallback(() => {
    if (productsObserverRef.current) {
      productsObserverRef.current.disconnect();
    }

    productsObserverRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreProducts && !productsLoading) {
          fetchUserProducts(true);
        }
      },
      { threshold: 0.1 }
    );

    if (lastProductElementRef.current) {
      productsObserverRef.current.observe(lastProductElementRef.current);
    }
  }, [hasMoreProducts, productsLoading, fetchUserProducts]);

  // Setup infinite scroll for shops
  const setupShopsInfiniteScroll = useCallback(() => {
    if (shopsObserverRef.current) {
      shopsObserverRef.current.disconnect();
    }

    shopsObserverRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreShops && !shopsLoading) {
          fetchUserShops(true);
        }
      },
      { threshold: 0.1 }
    );

    if (lastShopElementRef.current) {
      shopsObserverRef.current.observe(lastShopElementRef.current);
    }
  }, [hasMoreShops, shopsLoading, fetchUserShops]);

  const setupOrdersInfiniteScroll = useCallback(() => {
    if (ordersObserverRef.current) {
      ordersObserverRef.current.disconnect();
    }
  
    ordersObserverRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreOrders && !ordersLoading) {
          fetchUserOrders(true);
        }
      },
      { threshold: 0.1 }
    );
  
    if (lastOrderElementRef.current) {
      ordersObserverRef.current.observe(lastOrderElementRef.current);
    }
  }, [hasMoreOrders, ordersLoading, fetchUserOrders]);

  // Filter products based on search and filter criteria
  const filteredProducts = useMemo(() => {
    let filtered = products;

    // Apply search filter
    if (productSearch.trim()) {
      const searchTerm = productSearch.toLowerCase().trim();
      filtered = filtered.filter(product =>
        product.productName?.toLowerCase().includes(searchTerm) ||
        product.category?.toLowerCase().includes(searchTerm) ||
        product.subcategory?.toLowerCase().includes(searchTerm)
      );
    }

    // Apply status filter
    if (productFilter !== "all") {
      filtered = filtered.filter(product => {
        switch (productFilter) {
          case "active":
            return !product.sold;
          case "sold":
            return product.sold;
          case "featured":
            return product.isFeatured || product.isBoosted;
          default:
            return true;
        }
      });
    }

    return filtered;
  }, [products, productSearch, productFilter]);

  // Filter shops based on search
  const filteredShops = useMemo(() => {
    if (!shopSearch.trim()) return shops;
    
    const searchTerm = shopSearch.toLowerCase().trim();
    return shops.filter(shop =>
      shop.name?.toLowerCase().includes(searchTerm) ||
      (shop.categories && shop.categories.some(cat => cat.toLowerCase().includes(searchTerm)))
    );
  }, [shops, shopSearch]);

  // Handle field editing
  const handleFieldEdit = (field: keyof UserData) => {
    setEditableFields(prev =>
      prev.map(item =>
        item.field === field ? { ...item, isEditing: true } : item
      )
    );
  };

  const handleFieldChange = (field: keyof UserData, value: string) => {
    setEditableFields(prev =>
      prev.map(item =>
        item.field === field ? { ...item, value } : item
      )
    );
  };

  const handleFieldSave = async (field: keyof UserData) => {
    if (!userId || !user) return;

    const fieldData = editableFields.find(item => item.field === field);
    if (!fieldData) return;

    try {
      setIsSaving(true);
      
      await updateDoc(doc(db, "users", userId), {
        [field]: fieldData.value,
        updatedAt: new Date()
      });

      setUser(prev => prev ? { ...prev, [field]: fieldData.value } : null);
      setEditableFields(prev =>
        prev.map(item =>
          item.field === field ? { ...item, isEditing: false } : item
        )
      );

      toast.success("Bilgi başarıyla güncellendi");
    } catch (error) {
      console.error("Error updating field:", error);
      toast.error("Güncelleme sırasında hata oluştu");
    } finally {
      setIsSaving(false);
    }
  };

  const handleFieldCancel = (field: keyof UserData) => {
    const originalValue = user?.[field]?.toString() || "";
    setEditableFields(prev =>
      prev.map(item =>
        item.field === field
          ? { ...item, value: originalValue, isEditing: false }
          : item
      )
    );
  };

  // Effects
  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  useEffect(() => {
    if (user) {
      setProducts([]);
      setShops([]);
      setOrders([]);
      setOrderItems([]);
      setLastProductDoc(null);
      setLastShopDoc(null);
      setLastOrderDoc(null);
      setHasMoreProducts(true);
      setHasMoreShops(true);
      setHasMoreOrders(true);
      fetchUserProducts();
      fetchUserShops();
      fetchUserOrders();
    }
  }, [user]);

  // Reset products when sort changes
  useEffect(() => {
    if (user) {
      setProducts([]);
      setLastProductDoc(null);
      setHasMoreProducts(true);
      fetchUserProducts();

    }
  }, [productSort]);

  // Setup infinite scroll
  useEffect(() => {
  if (activeTab === "products") {
    setupProductsInfiniteScroll();
  } else if (activeTab === "shops") {
    setupShopsInfiniteScroll();
  } else if (activeTab === "orders") {
    setupOrdersInfiniteScroll();
  }

  return () => {
    if (productsObserverRef.current) {
      productsObserverRef.current.disconnect();
    }
    if (shopsObserverRef.current) {
      shopsObserverRef.current.disconnect();
    }
    if (ordersObserverRef.current) {
      ordersObserverRef.current.disconnect();
    }
  };
}, [activeTab, filteredProducts.length, filteredShops.length, orders.length, setupProductsInfiniteScroll, setupShopsInfiniteScroll, setupOrdersInfiniteScroll]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="flex items-center gap-3 text-white">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Kullanıcı bilgileri yükleniyor...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center text-white">
          <h2 className="text-xl font-semibold mb-2">Kullanıcı Bulunamadı</h2>
          <p className="text-gray-400">Aradığınız kullanıcı mevcut değil.</p>
        </div>
      </div>
    );
  }

  const EditableField = ({ field, label, type = "text" }: {
    field: keyof UserData;
    label: string;
    type?: string;
  }) => {
    const fieldData = editableFields.find(item => item.field === field);
    if (!fieldData) return null;

    return (
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-300">{label}</label>
        <div className="flex items-center gap-2">
          {fieldData.isEditing ? (
            <>
              {field === "gender" ? (
                <select
                  value={fieldData.value}
                  onChange={(e) => handleFieldChange(field, e.target.value)}
                  className="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ color: 'white' }}
                  disabled={isSaving}
                >
                  <option value="" style={{ backgroundColor: '#1f2937', color: 'white' }}>Seçiniz</option>
                  <option value="Male" style={{ backgroundColor: '#1f2937', color: 'white' }}>Erkek</option>
                  <option value="Female" style={{ backgroundColor: '#1f2937', color: 'white' }}>Kadın</option>
                </select>
              ) : (
                <input
                  type={type}
                  value={fieldData.value}
                  onChange={(e) => handleFieldChange(field, e.target.value)}
                  className="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
                  disabled={isSaving}
                  autoFocus
                />
              )}
              <button
                onClick={() => handleFieldSave(field)}
                disabled={isSaving}
                className="p-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </button>
              <button
                onClick={() => handleFieldCancel(field)}
                disabled={isSaving}
                className="p-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <span className="flex-1 text-white">
                {fieldData.value || "Belirtilmemiş"}
              </span>
              <button
                onClick={() => handleFieldEdit(field)}
                className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex-shrink-0"
              >
                <Edit className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  const ProductCard = ({ product, viewMode, isLast = false }: { 
    product: ProductData; 
    viewMode: ViewMode;
    isLast?: boolean;
  }) => {
    const formatPrice = (price: number, currency: string) => {
      return new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: currency === 'TL' ? 'TRY' : currency,
        minimumFractionDigits: 0
      }).format(price);
    };
  
    // Add click handler
    const handleProductClick = () => {
      router.push(`/productdetails?productId=${product.id}`);
    };
  
    if (viewMode === "list") {
      return (
        <div 
          ref={isLast ? lastProductElementRef : null}
          onClick={handleProductClick}
          className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4 transition-all duration-200 hover:bg-white/15 hover:border-white/30 cursor-pointer hover:border-blue-500/50 hover:scale-[1.02] group"
        >
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
              {product.imageUrls?.[0] ? (
                <Image
                  src={product.imageUrls[0]}
                  alt={product.productName || 'Product'}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                  <ImageIcon className="w-8 h-8 text-gray-400" />
                </div>
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-white truncate group-hover:text-blue-300">{product.productName || 'Ürün Adı Yok'}</h3>
              <p className="text-sm text-gray-400">{product.category || 'Kategori Yok'} • {product.subcategory || 'Alt Kategori Yok'}</p>
              <div className="flex items-center gap-4 mt-1">
                <span className="text-lg font-bold text-green-400">
                  {formatPrice(product.price || 0, product.currency || 'TRY')}
                </span>
                <span className="text-xs text-gray-400">{product.condition || 'Durum Belirtilmemiş'}</span>
              </div>
            </div>
  
            <div className="flex items-center gap-6 text-sm text-gray-400">
              <div className="flex items-center gap-1">
                <Eye className="w-4 h-4" />
                <span>{product.clickCount || 0}</span>
              </div>
              <div className="flex items-center gap-1">
                <Heart className="w-4 h-4" />
                <span>{product.favoritesCount || 0}</span>
              </div>
              <div className="flex items-center gap-1">
                <ShoppingBag className="w-4 h-4" />
                <span>{product.purchaseCount || 0}</span>
              </div>
            </div>
  
            {(product.isFeatured || product.isBoosted) && (
              <div className="flex flex-col gap-1">
                {product.isFeatured && (
                  <span className="px-2 py-1 bg-yellow-600/20 text-yellow-400 text-xs rounded">
                    ÖNE ÇIKAN
                  </span>
                )}
                {product.isBoosted && (
                  <span className="px-2 py-1 bg-purple-600/20 text-purple-400 text-xs rounded">
                    BOOST
                  </span>
                )}
              </div>
            )}
            
            {/* Add visual indicator for clickable item */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <ArrowRight className="w-5 h-5 text-blue-400" />
            </div>
          </div>
        </div>
      );
    }
  
    return (
      <div 
        ref={isLast ? lastProductElementRef : null}
        onClick={handleProductClick}
        className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl overflow-hidden transition-all duration-200 hover:bg-white/15 hover:border-white/30 hover:shadow-lg group cursor-pointer hover:border-blue-500/50 hover:scale-[1.02]"
      >
        <div className="relative aspect-square">
          {product.imageUrls?.[0] ? (
            <Image
              src={product.imageUrls[0]}
              alt={product.productName || 'Product'}
              fill
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gray-700 flex items-center justify-center">
              <ImageIcon className="w-12 h-12 text-gray-400" />
            </div>
          )}
  
          {(product.isFeatured || product.isBoosted) && (
            <div className="absolute top-2 left-2 flex flex-col gap-1">
              {product.isFeatured && (
                <span className="px-2 py-1 bg-yellow-600/90 text-white text-xs rounded">
                  ÖNE ÇIKAN
                </span>
              )}
              {product.isBoosted && (
                <span className="px-2 py-1 bg-purple-600/90 text-white text-xs rounded">
                  BOOST
                </span>
              )}
            </div>
          )}
  
          {/* Add visual indicator for clickable item */}
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="p-1 bg-blue-600/90 rounded-full">
              <ArrowRight className="w-3 h-3 text-white" />
            </div>
          </div>
  
          <div className="absolute bottom-2 right-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex items-center gap-1 bg-black/50 rounded px-2 py-1">
              <Eye className="w-3 h-3 text-white" />
              <span className="text-white text-xs">{product.clickCount || 0}</span>
            </div>
            <div className="flex items-center gap-1 bg-black/50 rounded px-2 py-1">
              <Heart className="w-3 h-3 text-white" />
              <span className="text-white text-xs">{product.favoritesCount || 0}</span>
            </div>
          </div>
        </div>
  
        <div className="p-4">
          <h3 className="font-semibold text-white mb-1 line-clamp-2 group-hover:text-blue-300">{product.productName || 'Ürün Adı Yok'}</h3>
          <p className="text-sm text-gray-400 mb-2">{product.category || 'Kategori Yok'}</p>
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-green-400">
              {formatPrice(product.price || 0, product.currency || 'TRY')}
            </span>
            <span className="text-xs text-gray-400">{product.condition || 'Durum Belirtilmemiş'}</span>
          </div>
          
          {product.averageRating > 0 && (
            <div className="flex items-center gap-1 mt-2">
              <Star className="w-4 h-4 text-yellow-400 fill-current" />
              <span className="text-sm text-white">{product.averageRating.toFixed(1)}</span>
              <span className="text-xs text-gray-400">({product.reviewCount || 0})</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const OrderCard = ({ order, isLast = false }: { 
    order: OrderData; 
    isLast?: boolean;
  }) => {
    const orderItemsForThisOrder = orderItems.filter(item => item.orderId === order.id);
    
    const formatPrice = (price: number) => {
      return new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: 'TRY',
        minimumFractionDigits: 0
      }).format(price);
    };
  
    const formatDate = (timestamp: Timestamp) => {
      return timestamp.toDate().toLocaleString('tr-TR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };
  
    return (
      <div 
        ref={isLast ? lastOrderElementRef : null}
        className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-6 transition-all duration-200 hover:bg-white/15 hover:border-white/30"
      >
        {/* Order Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Sipariş #{order.id.slice(-8)}</h3>
            <p className="text-sm text-gray-400">{formatDate(order.timestamp)}</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-green-400">{formatPrice(order.totalPrice)}</p>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-1 text-xs rounded-full ${
                order.paymentMethod === 'PlayPoints' 
                  ? 'bg-purple-600/20 text-purple-400' 
                  : 'bg-blue-600/20 text-blue-400'
              }`}>
                {order.paymentMethod === 'PlayPoints' ? 'Play Points' : 'Kredi Kartı'}
              </span>
            </div>
          </div>
        </div>
  
        {/* Order Items */}
        <div className="space-y-3 mb-4">
          <h4 className="text-sm font-medium text-gray-300">Ürünler ({orderItemsForThisOrder.length})</h4>
          <div className="grid gap-3">
            {orderItemsForThisOrder.map((item) => (
              <div key={item.id} className="flex items-center gap-3 bg-white/5 rounded-lg p-3">
                <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                  {item.productImage ? (
                    <Image
                      src={item.productImage}
                      alt={item.productName}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                      <Package className="w-5 h-5 text-gray-400" />
                    </div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <h5 className="font-medium text-white truncate">{item.productName}</h5>
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <span>Adet: {item.quantity}</span>
                    {item.selectedColor && <span>• {item.selectedColor}</span>}
                    {item.selectedSize && <span>• {item.selectedSize}</span>}
                  </div>
                  <p className="text-xs text-gray-500">Satıcı: {item.sellerName}</p>
                </div>
                
                <div className="text-right">
                  <p className="font-semibold text-white">{formatPrice(item.price * item.quantity)}</p>
                  <span className={`px-2 py-1 text-xs rounded ${
                    item.shipmentStatus === 'Delivered' ? 'bg-green-600/20 text-green-400' :
                    item.shipmentStatus === 'Shipped' ? 'bg-blue-600/20 text-blue-400' :
                    item.shipmentStatus === 'Processing' ? 'bg-yellow-600/20 text-yellow-400' :
                    'bg-gray-600/20 text-gray-400'
                  }`}>
                    {item.shipmentStatus}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
  
        {/* Order Address */}
        <div className="border-t border-white/10 pt-4">
          <h4 className="text-sm font-medium text-gray-300 mb-2">Teslimat Adresi</h4>
          <div className="flex items-start gap-2 text-sm text-gray-400">
            <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p>{order.address.addressLine1}</p>
              {order.address.addressLine2 && <p>{order.address.addressLine2}</p>}
              <p>{order.address.city}</p>
              <p>{order.address.phoneNumber}</p>
            </div>
          </div>
        </div>
      </div>
    );
  };


const ShopCard = ({ shop, viewMode, isLast = false }: { 
  shop: ShopData; 
  viewMode: ViewMode;
  isLast?: boolean;
}) => {
  const router = useRouter(); // Add this line to get router access
  
  // Safe access to categories with fallback
  const categories = shop.categories || [];
  const categoriesText = categories.length > 0 ? categories.join(", ") : "Kategori Belirtilmemiş";

  // Add click handler
  const handleShopClick = () => {
    router.push(`/shopdetails?shopId=${shop.id}`);
  };

  if (viewMode === "list") {
    return (
      <div 
        ref={isLast ? lastShopElementRef : null}
        onClick={handleShopClick} // Add click handler
        className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4 transition-all duration-200 hover:bg-white/15 hover:border-white/30 cursor-pointer hover:border-blue-500/50 hover:scale-[1.02] group" // Add cursor and hover effects
      >
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16 rounded-full overflow-hidden flex-shrink-0">
            {shop.profileImageUrl ? (
              <Image
                src={shop.profileImageUrl}
                alt={shop.name || 'Shop'}
                fill
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                <Store className="w-6 h-6 text-gray-400" />
              </div>
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white group-hover:text-blue-300">{shop.name || 'Mağaza Adı Yok'}</h3> {/* Add hover color change */}
            <p className="text-sm text-gray-400">{categoriesText}</p>
            <p className="text-xs text-gray-500">{shop.address || 'Adres Belirtilmemiş'}</p>
          </div>

          <div className="flex items-center gap-4 text-sm text-gray-400">
            <div className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              <span>{shop.followerCount || 0}</span>
            </div>
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4" />
              <span>{(shop.averageRating || 0).toFixed(1)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Eye className="w-4 h-4" />
              <span>{shop.clickCount || 0}</span>
            </div>
          </div>
          
          {/* Add visual indicator for clickable item */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <ArrowRight className="w-5 h-5 text-blue-400" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={isLast ? lastShopElementRef : null}
      onClick={handleShopClick} // Add click handler
      className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl overflow-hidden transition-all duration-200 hover:bg-white/15 hover:border-white/30 hover:shadow-lg cursor-pointer hover:border-blue-500/50 hover:scale-[1.02] group" // Add cursor and hover effects
    >
      <div className="relative h-32">
        {shop.coverImageUrls?.[0] ? (
          <Image
            src={shop.coverImageUrls[0]}
            alt={shop.name || 'Shop'}
            fill
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gray-700 flex items-center justify-center">
            <Store className="w-8 h-8 text-gray-400" />
          </div>
        )}
        
        {shop.isBoosted && (
          <div className="absolute top-2 left-2">
            <span className="px-2 py-1 bg-purple-600/90 text-white text-xs rounded">
              BOOST
            </span>
          </div>
        )}
        
        {/* Add visual indicator for clickable item */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <ArrowRight className="w-5 h-5 text-blue-400 bg-black/50 rounded p-1" />
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="relative w-12 h-12 rounded-full overflow-hidden">
            {shop.profileImageUrl ? (
              <Image
                src={shop.profileImageUrl}
                alt={shop.name || 'Shop'}
                fill
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                <Store className="w-5 h-5 text-gray-400" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white truncate group-hover:text-blue-300">{shop.name || 'Mağaza Adı Yok'}</h3> {/* Add hover color change */}
            <p className="text-xs text-gray-400">{shop.address || 'Adres Belirtilmemiş'}</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm text-gray-400">{categoriesText}</p>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-1 text-yellow-400">
              <Star className="w-4 h-4 fill-current" />
              <span>{(shop.averageRating || 0).toFixed(1)}</span>
              <span className="text-gray-400">({shop.reviewCount || 0})</span>
            </div>
            <div className="flex items-center gap-1 text-blue-400">
              <Users className="w-4 h-4" />
              <span>{shop.followerCount || 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="backdrop-blur-xl bg-white/10 border-b border-white/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4 py-4">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-white">Kullanıcı Detayları</h1>
              <p className="text-sm text-gray-400">{user.displayName}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* User Profile Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Profile Info */}
          <div className="lg:col-span-2">
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-6">
              <div className="flex items-start gap-6 mb-6">
                <div className="relative w-24 h-24 rounded-full overflow-hidden flex-shrink-0">
                  {user.profileImage ? (
                    <Image
                      src={user.profileImage}
                      alt={user.displayName}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                      <User className="w-10 h-10 text-gray-400" />
                    </div>
                  )}
                  
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-2xl font-bold text-white">{user.displayName}</h2>
                    
                  </div>
                  <p className="text-gray-400 mb-1">{user.email}</p>                   
                  
                </div>
              </div>

              {/* Editable Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <EditableField field="displayName" label="Adı Soyadı" />
                <EditableField field="email" label="E-posta" type="email" />
                <EditableField field="phone" label="Telefon" type="tel" />
                <EditableField field="gender" label="Cinsiyet" />
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="space-y-4">
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
              <h3 className="text-lg font-semibold text-white mb-4">İstatistikler</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-blue-400" />
                    <span className="text-sm text-gray-300">Toplam Ürün</span>
                  </div>
                  <span className="text-white font-semibold">{products.length}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Store className="w-4 h-4 text-green-400" />
                    <span className="text-sm text-gray-300">Mağaza Sayısı</span>
                  </div>
                  <span className="text-white font-semibold">{shops.length}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-purple-400" />
                    <span className="text-sm text-gray-300">Satılan Ürün</span>
                  </div>
                  <span className="text-white font-semibold">{user.totalProductsSold || 0}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-yellow-400" />
                    <span className="text-sm text-gray-300">Ortalama Puan</span>
                  </div>
                  <span className="text-white font-semibold">
                    {user.averageRating ? user.averageRating.toFixed(1) : "0.0"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-orange-400" />
                    <span className="text-sm text-gray-300">Oyun Puanı</span>
                  </div>
                  <span className="text-white font-semibold">{user.playPoints || 0}</span>
                </div>
              </div>
            </div>         
          </div>
        </div>

        {/* Tabs */}
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl mb-6">
          <div className="flex border-b border-white/20">
            <button
              onClick={() => setActiveTab("products")}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === "products"
                  ? "text-blue-400 border-b-2 border-blue-400"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4" />
                <span>Ürünler ({products.length})</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab("shops")}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === "shops"
                  ? "text-blue-400 border-b-2 border-blue-400"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4" />
                <span>Mağazalar ({shops.length})</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab("orders")}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === "orders"
                  ? "text-blue-400 border-b-2 border-blue-400"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4" />
                <span>Siparişler ({orders.length})</span>
              </div>
            </button>
          </div>
        </div>

        {/* Products Tab */}
        {activeTab === "products" && (
          <div className="space-y-6">
            {/* Product Controls */}
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder="Ürün ara..."
                      className="pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
                    />
                  </div>

                  {/* Filter */}
                  <select
                    value={productFilter}
                    onChange={(e) => setProductFilter(e.target.value as FilterStatus)}
                    className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ color: 'white' }}
                  >
                    <option value="all" style={{ backgroundColor: '#1f2937', color: 'white' }}>Tüm Ürünler</option>
                    <option value="active" style={{ backgroundColor: '#1f2937', color: 'white' }}>Aktif</option>
                    <option value="sold" style={{ backgroundColor: '#1f2937', color: 'white' }}>Satılan</option>
                    <option value="featured" style={{ backgroundColor: '#1f2937', color: 'white' }}>Öne Çıkan</option>
                  </select>

                  {/* Sort */}
                  <select
                    value={productSort}
                    onChange={(e) => setProductSort(e.target.value as SortBy)}
                    className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ color: 'white' }}
                  >
                    <option value="newest" style={{ backgroundColor: '#1f2937', color: 'white' }}>En Yeni</option>
                    <option value="oldest" style={{ backgroundColor: '#1f2937', color: 'white' }}>En Eski</option>
                    <option value="price_high" style={{ backgroundColor: '#1f2937', color: 'white' }}>Fiyat: Yüksek → Düşük</option>
                    <option value="price_low" style={{ backgroundColor: '#1f2937', color: 'white' }}>Fiyat: Düşük → Yüksek</option>
                    <option value="popular" style={{ backgroundColor: '#1f2937', color: 'white' }}>En Popüler</option>
                  </select>
                </div>

                {/* View Mode Toggle */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setProductViewMode("grid")}
                    className={`p-2 rounded-lg transition-colors ${
                      productViewMode === "grid"
                        ? "bg-blue-600 text-white"
                        : "bg-white/10 text-gray-400 hover:text-white hover:bg-white/15"
                    }`}
                  >
                    <Grid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setProductViewMode("list")}
                    className={`p-2 rounded-lg transition-colors ${
                      productViewMode === "list"
                        ? "bg-blue-600 text-white"
                        : "bg-white/10 text-gray-400 hover:text-white hover:bg-white/15"
                    }`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Products Grid/List */}
            {filteredProducts.length === 0 && !productsLoading ? (
              <div className="text-center py-12">
                <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">Ürün Bulunamadı</h3>
                <p className="text-gray-400">
                  {productSearch || productFilter !== "all"
                    ? "Arama kriterlerinize uygun ürün bulunamadı."
                    : "Bu kullanıcının henüz ürünü bulunmuyor."}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className={`grid gap-4 ${
                  productViewMode === "grid"
                    ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                    : "grid-cols-1"
                }`}>
                  {filteredProducts.map((product, index) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      viewMode={productViewMode}
                      isLast={index === filteredProducts.length - 1}
                    />
                  ))}
                </div>

                {/* Loading indicator for infinite scroll */}
                {productsLoading && (
                  <div className="flex items-center justify-center py-8">
                    <div className="flex items-center gap-3 text-white">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Daha fazla ürün yükleniyor...</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Shops Tab */}
        {activeTab === "shops" && (
          <div className="space-y-6">
            {/* Shop Controls */}
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={shopSearch}
                      onChange={(e) => setShopSearch(e.target.value)}
                      placeholder="Mağaza ara..."
                      className="pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
                    />
                  </div>
                </div>

                {/* View Mode Toggle */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShopViewMode("grid")}
                    className={`p-2 rounded-lg transition-colors ${
                      shopViewMode === "grid"
                        ? "bg-blue-600 text-white"
                        : "bg-white/10 text-gray-400 hover:text-white hover:bg-white/15"
                    }`}
                  >
                    <Grid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShopViewMode("list")}
                    className={`p-2 rounded-lg transition-colors ${
                      shopViewMode === "list"
                        ? "bg-blue-600 text-white"
                        : "bg-white/10 text-gray-400 hover:text-white hover:bg-white/15"
                    }`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Shops Grid/List */}
            {filteredShops.length === 0 && !shopsLoading ? (
              <div className="text-center py-12">
                <Store className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">Mağaza Bulunamadı</h3>
                <p className="text-gray-400">
                  {shopSearch
                    ? "Arama kriterlerinize uygun mağaza bulunamadı."
                    : "Bu kullanıcının henüz mağazası bulunmuyor."}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className={`grid gap-4 ${
                  shopViewMode === "grid"
                    ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                    : "grid-cols-1"
                }`}>
                  {filteredShops.map((shop, index) => (
                    <ShopCard
                      key={shop.id}
                      shop={shop}
                      viewMode={shopViewMode}
                      isLast={index === filteredShops.length - 1}
                    />
                  ))}
                </div>

                {/* Loading indicator for infinite scroll */}
                {shopsLoading && (
                  <div className="flex items-center justify-center py-8">
                    <div className="flex items-center gap-3 text-white">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Daha fazla mağaza yükleniyor...</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {/* Orders Tab */}
        {activeTab === "orders" && (
          <div className="space-y-6">
            {/* Orders List */}
            {orders.length === 0 && !ordersLoading ? (
              <div className="text-center py-12">
                <ShoppingBag className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">Sipariş Bulunamadı</h3>
                <p className="text-gray-400">Bu kullanıcının henüz siparişi bulunmuyor.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-6">
                  {orders.map((order, index) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      isLast={index === orders.length - 1}
                    />
                  ))}
                </div>

                {/* Loading indicator for infinite scroll */}
                {ordersLoading && (
                  <div className="flex items-center justify-center py-8">
                    <div className="flex items-center gap-3 text-white">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Daha fazla sipariş yükleniyor...</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// Main component that wraps the content with Suspense
export default function UserDetailsPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
          <div className="flex items-center gap-3 text-white">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>Sayfa yükleniyor...</span>
          </div>
        </div>
      }>
        <UserDetailsContent />
      </Suspense>
    </ProtectedRoute>
  );
}