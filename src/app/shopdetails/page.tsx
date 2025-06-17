"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import {
  ArrowLeft,
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
  Phone,
  Calendar,
  ShoppingBag,
  Award,
  Zap,  
  Badge,  
  DollarSign,  
  ExternalLink,
  User,
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

// Types
interface ShopData {
    id: string;
    name: string;
    ownerId: string;
    profileImageUrl?: string;
    coverImageUrls?: string[];
    homeImageUrls?: string[];
    homeImageLinks?: { [key: string]: string };
    categories?: string[];
    category?: string;
    address?: string;
    contactNo?: string;
    averageRating?: number;
    reviewCount?: number;
    followerCount?: number;
    clickCount?: number;
    totalProductsSold?: number;
    isBoosted?: boolean;
    stockBadgeAcknowledged?: boolean;
    transactionsBadgeAcknowledged?: boolean;
    taxPlateCertificateUrl?: string;
    editors?: string[];
    viewers?: string[];
    coOwners?: string[];
    seller_info?: {
        info?: {
          address?: string;
          iban?: string;
          ibanOwnerName?: string;
          ibanOwnerSurname?: string;
          phone?: string;
          region?: string;
        };
      };
    createdAt?: Timestamp;
    updatedAt?: Timestamp;
  }

interface UserData {
    id: string;
    displayName: string;
    email: string;
    profileImage?: string;
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
  shopId: string;
  userId: string;
  description?: string;
  address?: string;
  region?: string;
}

interface EditableField {
  field: keyof ShopData;
  value: string;
  isEditing: boolean;
}

type ViewMode = "grid" | "list";
type FilterStatus = "all" | "active" | "sold" | "featured";
type SortBy = "newest" | "oldest" | "price_high" | "price_low" | "popular";

// Create a separate component that uses useSearchParams
function ShopDetailsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shopId = searchParams.get("shopId");

  // Refs for infinite scroll
  const productsObserverRef = useRef<IntersectionObserver | null>(null);
  const lastProductElementRef = useRef<HTMLDivElement | null>(null);

  // State Management
  const [shop, setShop] = useState<ShopData | null>(null);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);
  const [editableFields, setEditableFields] = useState<EditableField[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Filter and Search States
  const [productSearch, setProductSearch] = useState("");
  const [productViewMode, setProductViewMode] = useState<ViewMode>("grid");
  const [productFilter, setProductFilter] = useState<FilterStatus>("all");
  const [productSort, setProductSort] = useState<SortBy>("newest");

  // Pagination
  const [lastProductDoc, setLastProductDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const ITEMS_PER_PAGE = 12;

  const [members, setMembers] = useState<{
    owner?: UserData;
    coOwners: UserData[];
    editors: UserData[];
    viewers: UserData[];
  }>({
    coOwners: [],
    editors: [],
    viewers: []
  });
  const [membersLoading, setMembersLoading] = useState(false);

  // Initialize editable fields
  const initializeEditableFields = useCallback((shopData: ShopData) => {
    setEditableFields([
      { field: "name", value: shopData.name || "", isEditing: false },
      { field: "address", value: shopData.address || "", isEditing: false },
      { field: "contactNo", value: shopData.contactNo || "", isEditing: false },
      { field: "category", value: shopData.category || "", isEditing: false },
    ]);
  }, []);

  const fetchSellerInfo = useCallback(async (shopId: string) => {
    try {
      const sellerInfoQuery = query(
        collection(db, "shops", shopId, "seller_info")
      );
      const sellerInfoSnapshot = await getDocs(sellerInfoQuery);
      
      if (!sellerInfoSnapshot.empty) {
        // Get the first document (there should only be one)
        const sellerInfoDoc = sellerInfoSnapshot.docs[0];
        const sellerInfo = sellerInfoDoc.data();
        
        console.log("Seller info from subcollection:", sellerInfo);
        return sellerInfo;
      }
      
      console.log("No seller info found in subcollection");
      return null;
    } catch (error) {
      console.error("Error fetching seller info:", error);
      return null;
    }
  }, []);
  
  // Update your fetchShopData function
  const fetchShopData = useCallback(async () => {
    if (!shopId) {
      toast.error("Mağaza ID'si bulunamadı");
      router.push("/dashboard");
      return;
    }
  
    try {
      setLoading(true);
      const shopDoc = await getDoc(doc(db, "shops", shopId));
      
      if (!shopDoc.exists()) {
        toast.error("Mağaza bulunamadı");
        router.push("/dashboard");
        return;
      }
  
      const shopData = { id: shopDoc.id, ...shopDoc.data() } as ShopData;
      
      // Fetch seller info from subcollection
      const sellerInfo = await fetchSellerInfo(shopId);
      
      // Add seller info to shop data if it exists
      if (sellerInfo) {
        shopData.seller_info = { info: sellerInfo };
      }
      
      console.log("Final shop data with seller info:", shopData);
      console.log("Seller info:", shopData.seller_info);
      
      setShop(shopData);
      initializeEditableFields(shopData);
    } catch (error) {
      console.error("Error fetching shop:", error);
      toast.error("Mağaza bilgileri yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  }, [shopId, router, initializeEditableFields, fetchSellerInfo]);

  const fetchMemberDetails = useCallback(async (shop: ShopData) => {
    if (!shop) return;
    
    setMembersLoading(true);
    
    try {
      const memberIds: string[] = [];
      const roleMap: { [key: string]: string } = {};
      
      // Collect all member IDs and map their roles
      if (shop.ownerId) {
        memberIds.push(shop.ownerId);
        roleMap[shop.ownerId] = 'owner';
      }
      
      if (shop.coOwners) {
        shop.coOwners.forEach(id => {
          memberIds.push(id);
          roleMap[id] = 'coOwner';
        });
      }
      
      if (shop.editors) {
        shop.editors.forEach(id => {
          memberIds.push(id);
          roleMap[id] = 'editor';
        });
      }
      
      if (shop.viewers) {
        shop.viewers.forEach(id => {
          memberIds.push(id);
          roleMap[id] = 'viewer';
        });
      }
      
      // Remove duplicates
      const uniqueIds = [...new Set(memberIds)];
      
      // Fetch user details in batches (Firestore 'in' query limit is 10)
      const users: UserData[] = [];
      for (let i = 0; i < uniqueIds.length; i += 10) {
        const batch = uniqueIds.slice(i, i + 10);
        if (batch.length > 0) {
          const usersQuery = query(
            collection(db, "users"),
            where("__name__", "in", batch)
          );
          const snapshot = await getDocs(usersQuery);
          const batchUsers = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as UserData[];
          users.push(...batchUsers);
        }
      }
      
      // Organize users by role
      const organizedMembers = {
        owner: undefined as UserData | undefined,
        coOwners: [] as UserData[],
        editors: [] as UserData[],
        viewers: [] as UserData[]
      };
      
      users.forEach(user => {
        const role = roleMap[user.id];
        switch (role) {
          case 'owner':
            organizedMembers.owner = user;
            break;
          case 'coOwner':
            organizedMembers.coOwners.push(user);
            break;
          case 'editor':
            organizedMembers.editors.push(user);
            break;
          case 'viewer':
            organizedMembers.viewers.push(user);
            break;
        }
      });
      
      setMembers(organizedMembers);
    } catch (error) {
      console.error("Error fetching member details:", error);
      toast.error("Üye bilgileri yüklenirken hata oluştu");
    } finally {
      setMembersLoading(false);
    }
  }, []);

  // Fetch shop products with pagination and filters
  const fetchShopProducts = useCallback(async (append = false) => {
    if (!shopId || productsLoading) return;

    try {
      setProductsLoading(true);
      
      let q = query(
        collection(db, "shop_products"),
        where("shopId", "==", shopId),
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
  }, [shopId, productSort, lastProductDoc, productsLoading]);

  // Setup infinite scroll for products
  const setupProductsInfiniteScroll = useCallback(() => {
    if (productsObserverRef.current) {
      productsObserverRef.current.disconnect();
    }

    productsObserverRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreProducts && !productsLoading) {
          fetchShopProducts(true);
        }
      },
      { threshold: 0.1 }
    );

    if (lastProductElementRef.current) {
      productsObserverRef.current.observe(lastProductElementRef.current);
    }
  }, [hasMoreProducts, productsLoading, fetchShopProducts]);

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

  // Handle field editing
  const handleFieldEdit = (field: keyof ShopData) => {
    setEditableFields(prev =>
      prev.map(item =>
        item.field === field ? { ...item, isEditing: true } : item
      )
    );
  };

  const handleFieldChange = (field: keyof ShopData, value: string) => {
    setEditableFields(prev =>
      prev.map(item =>
        item.field === field ? { ...item, value } : item
      )
    );
  };

  const handleFieldSave = async (field: keyof ShopData) => {
    if (!shopId || !shop) return;

    const fieldData = editableFields.find(item => item.field === field);
    if (!fieldData) return;

    try {
      setIsSaving(true);
      
      await updateDoc(doc(db, "shops", shopId), {
        [field]: fieldData.value,
        updatedAt: new Date()
      });

      setShop(prev => prev ? { ...prev, [field]: fieldData.value } : null);
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

  const handleFieldCancel = (field: keyof ShopData) => {
    const originalValue = shop?.[field]?.toString() || "";
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
    fetchShopData();
  }, [fetchShopData]);

  useEffect(() => {
    if (shop) {
      setProducts([]);
      setLastProductDoc(null);
      setHasMoreProducts(true);
      fetchShopProducts();
      fetchMemberDetails(shop); // Add this line
    }
  }, [shop, fetchMemberDetails]);

  // Reset products when sort changes
  useEffect(() => {
    if (shop) {
      setProducts([]);
      setLastProductDoc(null);
      setHasMoreProducts(true);
      fetchShopProducts();
    }
  }, [productSort]);

  // Setup infinite scroll
  useEffect(() => {
    setupProductsInfiniteScroll();

    return () => {
      if (productsObserverRef.current) {
        productsObserverRef.current.disconnect();
      }
    };
  }, [filteredProducts.length, setupProductsInfiniteScroll]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="flex items-center gap-3 text-white">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Mağaza bilgileri yükleniyor...</span>
        </div>
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center text-white">
          <h2 className="text-xl font-semibold mb-2">Mağaza Bulunamadı</h2>
          <p className="text-gray-400">Aradığınız mağaza mevcut değil.</p>
        </div>
      </div>
    );
  }

  const EditableField = ({ field, label, type = "text" }: {
    field: keyof ShopData;
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
              <input
                type={type}
                value={fieldData.value}
                onChange={(e) => handleFieldChange(field, e.target.value)}
                className="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
                disabled={isSaving}
                autoFocus
              />
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
              <ExternalLink className="w-5 h-5 text-blue-400" />
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
              <ExternalLink className="w-3 h-3 text-white" />
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

  const ImageGallery = ({ images, title }: { images: string[]; title: string }) => {
    const [selectedImage, setSelectedImage] = useState(0);

    if (!images || images.length === 0) {
      return (
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
          <div className="aspect-video bg-gray-700 rounded-lg flex items-center justify-center">
            <div className="text-center text-gray-400">
              <ImageIcon className="w-12 h-12 mx-auto mb-2" />
              <p>Resim bulunamadı</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
        
        {/* Main Image */}
        <div className="relative aspect-video rounded-lg overflow-hidden mb-4">
          <Image
            src={images[selectedImage]}
            alt={`${title} ${selectedImage + 1}`}
            fill
            className="object-cover"
          />
        </div>

        {/* Thumbnail Strip */}
        {images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {images.map((image, index) => (
              <button
                key={index}
                onClick={() => setSelectedImage(index)}
                className={`relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-colors ${
                  selectedImage === index 
                    ? 'border-blue-400' 
                    : 'border-white/20 hover:border-white/40'
                }`}
              >
                <Image
                  src={image}
                  alt={`${title} thumbnail ${index + 1}`}
                  fill
                  className="object-cover"
                />
              </button>
            ))}
          </div>
        )}
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
              <h1 className="text-xl font-bold text-white">Mağaza Detayları</h1>
              <p className="text-sm text-gray-400">{shop.name}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Shop Profile Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Shop Info */}
          <div className="lg:col-span-2">
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-6">
              <div className="flex items-start gap-6 mb-6">
                <div className="relative w-24 h-24 rounded-full overflow-hidden flex-shrink-0">
                  {shop.profileImageUrl ? (
                    <Image
                      src={shop.profileImageUrl}
                      alt={shop.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                      <Store className="w-10 h-10 text-gray-400" />
                    </div>
                  )}
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-2xl font-bold text-white">{shop.name}</h2>
                    {shop.isBoosted && (
                      <span className="px-3 py-1 bg-purple-600/20 text-purple-400 text-sm rounded-full flex items-center gap-1">
                        <Zap className="w-4 h-4" />
                        BOOST
                      </span>
                    )}
                  </div>
                  
                  <div className="space-y-1 text-sm text-gray-400">
                    {shop.address && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        <span>{shop.address}</span>
                      </div>
                    )}
                    {shop.contactNo && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        <span>{shop.contactNo}</span>
                      </div>
                    )}
                    {shop.createdAt && (
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        <span>Açılış: {shop.createdAt.toDate().toLocaleDateString('tr-TR')}</span>
                      </div>
                    )}
                  </div>

                  {/* Categories */}
                  {(shop.categories && shop.categories.length > 0) && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {shop.categories.map((category, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 bg-blue-600/20 text-blue-400 text-xs rounded"
                        >
                          {category}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Badges */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {shop.stockBadgeAcknowledged && (
                      <span className="px-2 py-1 bg-green-600/20 text-green-400 text-xs rounded flex items-center gap-1">
                        <Badge className="w-3 h-3" />
                        Stok Onaylı
                      </span>
                    )}
                    {shop.transactionsBadgeAcknowledged && (
                      <span className="px-2 py-1 bg-blue-600/20 text-blue-400 text-xs rounded flex items-center gap-1">
                        <Award className="w-3 h-3" />
                        İşlem Onaylı
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Editable Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <EditableField field="name" label="Mağaza Adı" />         
                
                <EditableField field="category" label="Ana Kategori" />
              </div>

              {/* Tax Certificate */}
              {shop.taxPlateCertificateUrl && (
                <div className="mt-6 pt-6 border-t border-white/20">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold text-white">Vergi Levhası Belgesi</h3>
                    <a
                      href={shop.taxPlateCertificateUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg transition-colors text-sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Belgeyi Görüntüle
                    </a>
                  </div>
                </div>
              )}  
              </div>           
{/* Seller Information */}
<div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-6 mt-6">
  <h3 className="text-lg font-semibold text-white mb-4">Satıcı Bilgileri</h3>
  
  {shop.seller_info?.info ? (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Address */}
      {shop.seller_info.info.address && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Adres</label>
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <span className="text-white text-sm">{shop.seller_info.info.address}</span>
          </div>
        </div>
      )}

      {/* Region */}
      {shop.seller_info.info.region && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Bölge</label>
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-green-400 flex-shrink-0" />
            <span className="text-white text-sm">{shop.seller_info.info.region}</span>
          </div>
        </div>
      )}

      {/* Phone */}
      {shop.seller_info.info.phone && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Telefon</label>
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-purple-400 flex-shrink-0" />
            <span className="text-white text-sm">{shop.seller_info.info.phone}</span>
          </div>
        </div>
      )}

      {/* IBAN Owner Name */}
      {shop.seller_info.info.ibanOwnerName && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">IBAN Sahibi Adı</label>
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-yellow-400 flex-shrink-0" />
            <span className="text-white text-sm">{shop.seller_info.info.ibanOwnerName}</span>
          </div>
        </div>
      )}

      {/* IBAN Owner Surname */}
      {shop.seller_info.info.ibanOwnerSurname && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">IBAN Sahibi Soyadı</label>
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-yellow-400 flex-shrink-0" />
            <span className="text-white text-sm">{shop.seller_info.info.ibanOwnerSurname}</span>
          </div>
        </div>
      )}

      {/* IBAN - Full width */}
      {shop.seller_info.info.iban && (
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-gray-300">IBAN</label>
          <div className="flex items-center gap-2 p-3 bg-white/5 rounded-lg border border-white/10">
            <DollarSign className="w-4 h-4 text-green-400 flex-shrink-0" />
            <span className="text-white text-sm font-mono tracking-wider">
              {shop.seller_info.info.iban}
            </span>
          </div>
        </div>
      )}
    </div>
  ) : (
    <div className="text-center py-8">
      <User className="w-12 h-12 text-gray-400 mx-auto mb-3" />
      <p className="text-gray-400">Satıcı bilgileri bulunamadı</p>
    </div>
  )}
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
                    <TrendingUp className="w-4 h-4 text-green-400" />
                    <span className="text-sm text-gray-300">Satılan Ürün</span>
                  </div>
                  <span className="text-white font-semibold">{shop.totalProductsSold || 0}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-purple-400" />
                    <span className="text-sm text-gray-300">Takipçi</span>
                  </div>
                  <span className="text-white font-semibold">{shop.followerCount || 0}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-yellow-400" />
                    <span className="text-sm text-gray-300">Ortalama Puan</span>
                  </div>
                  <span className="text-white font-semibold">
                    {shop.averageRating ? shop.averageRating.toFixed(1) : "0.0"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-orange-400" />
                    <span className="text-sm text-gray-300">Görüntülenme</span>
                  </div>
                  <span className="text-white font-semibold">{shop.clickCount || 0}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-pink-400" />
                    <span className="text-sm text-gray-300">Değerlendirme</span>
                  </div>
                  <span className="text-white font-semibold">{shop.reviewCount || 0}</span>
                </div>
              </div>
            </div>

            {/* Members */}
<div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
  <h3 className="text-lg font-semibold text-white mb-4">Üyeler</h3>
  
  {membersLoading ? (
    <div className="flex items-center justify-center py-4">
      <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      <span className="text-gray-400 ml-2 text-sm">Yükleniyor...</span>
    </div>
  ) : (
    <div className="space-y-3">
      {/* Owner */}
      {members.owner && (
        <div className="p-3 bg-yellow-600/20 border border-yellow-500/30 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
              {members.owner.profileImage ? (
                <Image
                  src={members.owner.profileImage}
                  alt={members.owner.displayName}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full bg-yellow-600 flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-white text-sm">{members.owner.displayName}</h4>
              <p className="text-xs text-yellow-400">Sahibi</p>
            </div>
          </div>
        </div>
      )}

      {/* Co-Owners */}
      {members.coOwners.map((coOwner, index) => (
        <div key={`coowner-${index}`} className="p-3 bg-orange-600/20 border border-orange-500/30 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
              {coOwner.profileImage ? (
                <Image
                  src={coOwner.profileImage}
                  alt={coOwner.displayName}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full bg-orange-600 flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-white text-sm">{coOwner.displayName}</h4>
              <p className="text-xs text-orange-400">Ortak Sahibi</p>
            </div>
          </div>
        </div>
      ))}

      {/* Editors */}
      {members.editors.map((editor, index) => (
        <div key={`editor-${index}`} className="p-3 bg-blue-600/20 border border-blue-500/30 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
              {editor.profileImage ? (
                <Image
                  src={editor.profileImage}
                  alt={editor.displayName}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full bg-blue-600 flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-white text-sm">{editor.displayName}</h4>
              <p className="text-xs text-blue-400">Editör</p>
            </div>
          </div>
        </div>
      ))}

      {/* Viewers */}
      {members.viewers.map((viewer, index) => (
        <div key={`viewer-${index}`} className="p-3 bg-green-600/20 border border-green-500/30 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
              {viewer.profileImage ? (
                <Image
                  src={viewer.profileImage}
                  alt={viewer.displayName}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full bg-green-600 flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-white text-sm">{viewer.displayName}</h4>
              <p className="text-xs text-green-400">Görüntüleyici</p>
            </div>
          </div>
        </div>
      ))}

      {/* No members message */}
      {!members.owner && members.coOwners.length === 0 && members.editors.length === 0 && members.viewers.length === 0 && (
        <div className="text-center py-4">
          <Users className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-400 text-sm">Üye bilgisi bulunamadı</p>
        </div>
      )}
    </div>
  )}
</div>
          </div>
        </div>

        {/* Image Galleries */}
        {(shop.coverImageUrls || shop.homeImageUrls) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {shop.coverImageUrls && shop.coverImageUrls.length > 0 && (
              <ImageGallery images={shop.coverImageUrls} title="Kapak Resimleri" />
            )}
            {shop.homeImageUrls && shop.homeImageUrls.length > 0 && (
              <ImageGallery images={shop.homeImageUrls} title="Ana Sayfa Resimleri" />
            )}
          </div>
        )}

        {/* Products Section */}
        <div className="space-y-6">
          {/* Product Controls */}
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Mağaza Ürünleri</h2>
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Package className="w-4 h-4" />
                <span>{filteredProducts.length} ürün</span>
              </div>
            </div>

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
                  : "Bu mağazanın henüz ürünü bulunmuyor."}
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

        {/* Analytics Summary */}
        <div className="mt-8 backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Mağaza Özeti</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">
                {products.length}
              </div>
              <div className="text-sm text-gray-400">Toplam Ürün</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">
                {products.filter(p => p.sold).length}
              </div>
              <div className="text-sm text-gray-400">Satılan</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-400">
                {products.filter(p => p.isFeatured || p.isBoosted).length}
              </div>
              <div className="text-sm text-gray-400">Öne Çıkan</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-400">
                {products.reduce((sum, p) => sum + (p.clickCount || 0), 0)}
              </div>
              <div className="text-sm text-gray-400">Toplam Görünüm</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// Main component that wraps the content with Suspense
export default function ShopDetailsPage() {
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
        <ShopDetailsContent />
      </Suspense>
    </ProtectedRoute>
  );
}