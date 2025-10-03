"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import {
  ArrowLeft,
  Store,
  Loader2,
  Image as ImageIcon,
  Package,
  MapPin,
  Star,
  Eye,
  Heart,
  Search,
  Grid3x3,
  List,
  Users,
  Phone,
  Calendar,
  ExternalLink,
  User,
  Zap,
  BadgeCheck,
  Building2,
  FolderOpen,
} from "lucide-react";
import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  Suspense,
} from "react";
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
  Timestamp,
  DocumentSnapshot,
  updateDoc,
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
  ourComission?: number;
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

interface ReviewData {
  id: string;
  rating: number;
  review: string;
  userId: string;
  sellerId: string;
  sellerName: string;
  timestamp: Timestamp;
  transactionId?: string;
  imageUrls?: string[];
  productId?: string;
  productName?: string;
  productImage?: string;
  price?: number;
  currency?: string;
}

interface CollectionData {
  id: string;
  name: string;
  imageUrl: string;
  productIds: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

type ViewMode = "grid" | "list";
type FilterStatus = "all" | "active" | "sold" | "featured";
type SortBy = "newest" | "oldest" | "price_high" | "price_low" | "popular";
type TabType =
  | "products"
  | "about"
  | "reviews"
  | "collections"
  | "members"
  | "analytics";

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
  const [reviews, setReviews] = useState<ReviewData[]>([]);
  const [collections, setCollections] = useState<CollectionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("products");

  const [showCommissionModal, setShowCommissionModal] = useState(false);
const [commissionPercentage, setCommissionPercentage] = useState<number>(0);
const [savingCommission, setSavingCommission] = useState(false);

  // Filter and Search States
  const [productSearch, setProductSearch] = useState("");
  const [productViewMode, setProductViewMode] = useState<ViewMode>("grid");
  const [productFilter, setProductFilter] = useState<FilterStatus>("all");
  const [productSort, setProductSort] = useState<SortBy>("newest");

  // Pagination
  const [lastProductDoc, setLastProductDoc] = useState<DocumentSnapshot | null>(
    null
  );
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const ITEMS_PER_PAGE = 20;

  const [members, setMembers] = useState<{
    owner?: UserData;
    coOwners: UserData[];
    editors: UserData[];
    viewers: UserData[];
  }>({
    coOwners: [],
    editors: [],
    viewers: [],
  });
  const [membersLoading, setMembersLoading] = useState(false);

  // Fetch functions
  const fetchSellerInfo = useCallback(async (shopId: string) => {
    try {
      const sellerInfoQuery = query(
        collection(db, "shops", shopId, "seller_info")
      );
      const sellerInfoSnapshot = await getDocs(sellerInfoQuery);

      if (!sellerInfoSnapshot.empty) {
        const sellerInfoDoc = sellerInfoSnapshot.docs[0];
        const sellerInfo = sellerInfoDoc.data();
        return sellerInfo;
      }

      return null;
    } catch (error) {
      console.error("Error fetching seller info:", error);
      return null;
    }
  }, []);

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
      const sellerInfo = await fetchSellerInfo(shopId);

      if (sellerInfo) {
        shopData.seller_info = { info: sellerInfo };
      }

      setShop(shopData);
    } catch (error) {
      console.error("Error fetching shop:", error);
      toast.error("Mağaza bilgileri yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  }, [shopId, router, fetchSellerInfo]);

  const fetchReviews = useCallback(async () => {
    if (!shopId) return;

    try {
      setReviewsLoading(true);
      const reviewsQuery = query(
        collection(db, "shops", shopId, "reviews"),
        orderBy("timestamp", "desc")
      );
      const reviewsSnapshot = await getDocs(reviewsQuery);

      const reviewsData = reviewsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as ReviewData[];

      setReviews(reviewsData);
    } catch (error) {
      console.error("Error fetching reviews:", error);
      toast.error("Yorumlar yüklenirken hata oluştu");
    } finally {
      setReviewsLoading(false);
    }
  }, [shopId]);

  const fetchCollections = useCallback(async () => {
    if (!shopId) return;

    try {
      setCollectionsLoading(true);
      const collectionsQuery = query(
        collection(db, "shops", shopId, "collections"),
        orderBy("createdAt", "desc")
      );
      const collectionsSnapshot = await getDocs(collectionsQuery);

      const collectionsData = collectionsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as CollectionData[];

      setCollections(collectionsData);
    } catch (error) {
      console.error("Error fetching collections:", error);
      toast.error("Koleksiyonlar yüklenirken hata oluştu");
    } finally {
      setCollectionsLoading(false);
    }
  }, [shopId]);

  const fetchMemberDetails = useCallback(async (shop: ShopData) => {
    if (!shop) return;

    setMembersLoading(true);

    try {
      const memberIds: string[] = [];
      const roleMap: { [key: string]: string } = {};

      if (shop.ownerId) {
        memberIds.push(shop.ownerId);
        roleMap[shop.ownerId] = "owner";
      }

      if (shop.coOwners) {
        shop.coOwners.forEach((id) => {
          memberIds.push(id);
          roleMap[id] = "coOwner";
        });
      }

      if (shop.editors) {
        shop.editors.forEach((id) => {
          memberIds.push(id);
          roleMap[id] = "editor";
        });
      }

      if (shop.viewers) {
        shop.viewers.forEach((id) => {
          memberIds.push(id);
          roleMap[id] = "viewer";
        });
      }

      const uniqueIds = [...new Set(memberIds)];
      const users: UserData[] = [];

      for (let i = 0; i < uniqueIds.length; i += 10) {
        const batch = uniqueIds.slice(i, i + 10);
        if (batch.length > 0) {
          const usersQuery = query(
            collection(db, "users"),
            where("__name__", "in", batch)
          );
          const snapshot = await getDocs(usersQuery);
          const batchUsers = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as UserData[];
          users.push(...batchUsers);
        }
      }

      const organizedMembers = {
        owner: undefined as UserData | undefined,
        coOwners: [] as UserData[],
        editors: [] as UserData[],
        viewers: [] as UserData[],
      };

      users.forEach((user) => {
        const role = roleMap[user.id];
        switch (role) {
          case "owner":
            organizedMembers.owner = user;
            break;
          case "coOwner":
            organizedMembers.coOwners.push(user);
            break;
          case "editor":
            organizedMembers.editors.push(user);
            break;
          case "viewer":
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

  const fetchShopProducts = useCallback(
    async (append = false) => {
      if (!shopId || productsLoading) return;

      try {
        setProductsLoading(true);

        let q = query(
          collection(db, "shop_products"),
          where("shopId", "==", shopId),
          orderBy(
            productSort === "newest"
              ? "createdAt"
              : productSort === "oldest"
              ? "createdAt"
              : productSort === "price_high"
              ? "price"
              : productSort === "price_low"
              ? "price"
              : "clickCount",
            productSort === "oldest" || productSort === "price_low"
              ? "asc"
              : "desc"
          ),
          limit(ITEMS_PER_PAGE)
        );

        if (append && lastProductDoc) {
          q = query(q, startAfter(lastProductDoc));
        }

        const snapshot = await getDocs(q);
        const newProducts = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as ProductData[];

        if (append) {
          setProducts((prev) => [...prev, ...newProducts]);
        } else {
          setProducts(newProducts);
          setLastProductDoc(null);
        }

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
    },
    [shopId, productSort, lastProductDoc, productsLoading]
  );

  const handleSaveCommission = async () => {
    if (!shopId) return;
    
    try {
      setSavingCommission(true);
      await updateDoc(doc(db, "shops", shopId), {
        ourComission: commissionPercentage,
        updatedAt: Timestamp.now()
      });
      
      toast.success("Komisyon oranı kaydedildi");
      setShowCommissionModal(false);
      
      // Update local state
      if (shop) {
        setShop({ ...shop, ourComission: commissionPercentage });
      }
    } catch (error) {
      console.error("Error saving commission:", error);
      toast.error("Komisyon oranı kaydedilirken hata oluştu");
    } finally {
      setSavingCommission(false);
    }
  };

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

  const filteredProducts = useMemo(() => {
    let filtered = products;

    if (productSearch.trim()) {
      const searchTerm = productSearch.toLowerCase().trim();
      filtered = filtered.filter(
        (product) =>
          product.productName?.toLowerCase().includes(searchTerm) ||
          product.category?.toLowerCase().includes(searchTerm) ||
          product.subcategory?.toLowerCase().includes(searchTerm)
      );
    }

    if (productFilter !== "all") {
      filtered = filtered.filter((product) => {
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
      fetchMemberDetails(shop);
      fetchReviews();
      fetchCollections();
    }
  }, [shop, fetchMemberDetails, fetchReviews, fetchCollections]);

  useEffect(() => {
    if (shop?.ourComission) {
      setCommissionPercentage(shop.ourComission);
    }
  }, [shop]);

  useEffect(() => {
    if (shop) {
      setProducts([]);
      setLastProductDoc(null);
      setHasMoreProducts(true);
      fetchShopProducts();
    }
  }, [productSort]);

  useEffect(() => {
    setupProductsInfiniteScroll();

    return () => {
      if (productsObserverRef.current) {
        productsObserverRef.current.disconnect();
      }
    };
  }, [filteredProducts.length, setupProductsInfiniteScroll]);

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: currency === "TL" ? "TRY" : currency,
      minimumFractionDigits: 0,
    }).format(price);
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatDate = (timestamp: Timestamp) => {
    const date = timestamp.toDate();
    return new Intl.DateTimeFormat("tr-TR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-600">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Mağaza bilgileri yükleniyor...</span>
        </div>
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Mağaza Bulunamadı
          </h2>
          <p className="text-sm text-gray-500">
            Aradığınız mağaza mevcut değil.
          </p>
        </div>
      </div>
    );
  }

  const ProductCard = ({
    product,
    viewMode,
    isLast = false,
  }: {
    product: ProductData;
    viewMode: ViewMode;
    isLast?: boolean;
  }) => {
    const handleProductClick = () => {
      router.push(`/productdetails?productId=${product.id}`);
    };

    if (viewMode === "list") {
      return (
        <div
          ref={isLast ? lastProductElementRef : null}
          onClick={handleProductClick}
          className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md transition-all duration-200 cursor-pointer group"
        >
          <div className="flex items-center gap-3">
            <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
              {product.imageUrls?.[0] ? (
                <Image
                  src={product.imageUrls[0]}
                  alt={product.productName || "Ürün"}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                  <ImageIcon className="w-6 h-6 text-gray-400" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-gray-900 truncate group-hover:text-indigo-600">
                {product.productName || "Ürün Adı Yok"}
              </h3>
              <p className="text-xs text-gray-500">
                {product.category || "Kategori Yok"}
              </p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-sm font-bold text-gray-900">
                  {formatPrice(product.price || 0, product.currency || "TRY")}
                </span>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="flex items-center gap-0.5">
                    <Eye className="w-3 h-3" />
                    {formatNumber(product.clickCount || 0)}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Heart className="w-3 h-3" />
                    {formatNumber(product.favoritesCount || 0)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {product.isFeatured && (
                <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-[10px] font-semibold rounded">
                  ÖNE ÇIKAN
                </span>
              )}
              {product.isBoosted && (
                <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-semibold rounded">
                  BOOST
                </span>
              )}
              {product.sold && (
                <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-semibold rounded">
                  SATILDI
                </span>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        ref={isLast ? lastProductElementRef : null}
        onClick={handleProductClick}
        className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-all duration-200 cursor-pointer group"
      >
        <div className="relative aspect-square">
          {product.imageUrls?.[0] ? (
            <Image
              src={product.imageUrls[0]}
              alt={product.productName || "Ürün"}
              fill
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gray-100 flex items-center justify-center">
              <ImageIcon className="w-8 h-8 text-gray-400" />
            </div>
          )}

          {(product.isFeatured || product.isBoosted) && (
            <div className="absolute top-2 left-2 flex flex-col gap-1">
              {product.isFeatured && (
                <span className="px-1.5 py-0.5 bg-yellow-500 text-white text-[10px] font-semibold rounded">
                  ÖNE ÇIKAN
                </span>
              )}
              {product.isBoosted && (
                <span className="px-1.5 py-0.5 bg-purple-500 text-white text-[10px] font-semibold rounded">
                  BOOST
                </span>
              )}
            </div>
          )}

          <button className="absolute top-2 right-2 w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50 opacity-0 group-hover:opacity-100 transition-opacity">
            <Heart className="w-3.5 h-3.5 text-gray-600" />
          </button>

          {product.sold && (
            <div className="absolute inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center">
              <span className="text-white font-bold text-sm">SATILDI</span>
            </div>
          )}
        </div>

        <div className="p-3">
          <h3 className="text-sm font-medium text-gray-900 line-clamp-1 group-hover:text-indigo-600">
            {product.productName || "Ürün Adı Yok"}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {product.category || "Kategori Yok"}
          </p>
          <div className="flex items-center justify-between mt-2">
            <span className="text-sm font-bold text-gray-900">
              {formatPrice(product.price || 0, product.currency || "TRY")}
            </span>
            {product.averageRating > 0 && (
              <div className="flex items-center gap-1">
                <Star className="w-3 h-3 text-yellow-400 fill-current" />
                <span className="text-xs text-gray-600">
                  {product.averageRating.toFixed(1)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-gray-600" />
              </button>
              <div>
                <h1 className="text-sm font-semibold text-gray-900">
                  Mağaza Detayları
                </h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Shop Profile Card */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <div className="flex items-start gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-xl overflow-hidden">
                {shop.profileImageUrl ? (
                  <Image
                    src={shop.profileImageUrl}
                    alt={shop.name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                    <Store className="w-6 h-6 text-gray-400" />
                  </div>
                )}
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
            </div>

            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2">
  <h2 className="text-lg font-bold text-gray-900">
    {shop.name}
  </h2>
  <button
    onClick={() => setShowCommissionModal(true)}
    className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-medium rounded-lg transition-colors"
  >
    Komisyon Detayları
  </button>
</div>
                    {shop.isBoosted && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-semibold rounded">
                        <Zap className="w-2.5 h-2.5" />
                        BOOST
                      </span>
                    )}
                    {shop.transactionsBadgeAcknowledged && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-semibold rounded">
                        <BadgeCheck className="w-2.5 h-2.5" />
                        DOĞRULANMIŞ
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                    {shop.address && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {shop.address}
                      </span>
                    )}
                    {shop.contactNo && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {shop.contactNo}
                      </span>
                    )}
                    {shop.createdAt && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {shop.createdAt.toDate().getFullYear()} yılından beri
                      </span>
                    )}
                  </div>
                  {shop.categories && shop.categories.length > 0 && (
                    <div className="flex items-center gap-2 mt-2">
                      {shop.categories.slice(0, 3).map((category, index) => (
                        <span
                          key={index}
                          className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded"
                        >
                          {category}
                        </span>
                      ))}
                      {shop.categories.length > 3 && (
                        <span className="text-xs text-gray-500">
                          +{shop.categories.length - 3} daha
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-6 gap-2 mt-4">
            <div className="text-center p-2 bg-gray-50 rounded-lg">
              <div className="text-sm font-bold text-gray-900">
                {formatNumber(products.length)}
              </div>
              <div className="text-xs text-gray-500">Ürünler</div>
            </div>
            <div className="text-center p-2 bg-gray-50 rounded-lg">
              <div className="text-sm font-bold text-gray-900">
                {formatNumber(shop.followerCount || 0)}
              </div>
              <div className="text-xs text-gray-500">Takipçi</div>
            </div>
            <div className="text-center p-2 bg-gray-50 rounded-lg">
              <div className="text-sm font-bold text-gray-900">
                {shop.averageRating ? shop.averageRating.toFixed(1) : "0.0"}
              </div>
              <div className="text-xs text-gray-500">Puan</div>
            </div>
            <div className="text-center p-2 bg-gray-50 rounded-lg">
              <div className="text-sm font-bold text-gray-900">
                {shop.reviewCount
                  ? `${Math.min(
                      Math.round((shop.reviewCount / products.length) * 100),
                      100
                    )}%`
                  : "0%"}
              </div>
              <div className="text-xs text-gray-500">Yanıt</div>
            </div>
            <div className="text-center p-2 bg-gray-50 rounded-lg">
              <div className="text-sm font-bold text-gray-900">
                {formatNumber(shop.totalProductsSold || 0)}
              </div>
              <div className="text-xs text-gray-500">Satıldı</div>
            </div>
            <div className="text-center p-2 bg-gray-50 rounded-lg">
              <div className="text-sm font-bold text-gray-900">
                {formatNumber(shop.clickCount || 0)}
              </div>
              <div className="text-xs text-gray-500">Görüntü</div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white rounded-xl border border-gray-200 mb-4">
          <div className="flex items-center gap-6 px-4 overflow-x-auto">
            <button
              onClick={() => setActiveTab("products")}
              className={`py-3 text-sm font-medium whitespace-nowrap border-b-2 ${
                activeTab === "products"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-900"
              }`}
            >
              Ürünler
            </button>
            <button
              onClick={() => setActiveTab("collections")}
              className={`py-3 text-sm font-medium whitespace-nowrap border-b-2 ${
                activeTab === "collections"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-900"
              }`}
            >
              Koleksiyonlar
            </button>
            <button
              onClick={() => setActiveTab("about")}
              className={`py-3 text-sm font-medium whitespace-nowrap border-b-2 ${
                activeTab === "about"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-900"
              }`}
            >
              Hakkında
            </button>
            <button
              onClick={() => setActiveTab("reviews")}
              className={`py-3 text-sm font-medium whitespace-nowrap border-b-2 ${
                activeTab === "reviews"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-900"
              }`}
            >
              Yorumlar
            </button>
            <button
              onClick={() => setActiveTab("members")}
              className={`py-3 text-sm font-medium whitespace-nowrap border-b-2 ${
                activeTab === "members"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-900"
              }`}
            >
              Üyeler
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`py-3 text-sm font-medium whitespace-nowrap border-b-2 ${
                activeTab === "analytics"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-900"
              }`}
            >
              İstatistikler
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === "products" && (
          <>
            {/* Filter Bar */}
            <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      type="text"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder="Ürün ara..."
                      className="pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-48"
                    />
                  </div>

                  <select
                    value={productFilter}
                    onChange={(e) =>
                      setProductFilter(e.target.value as FilterStatus)
                    }
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="all">Tüm Ürünler</option>
                    <option value="active">Aktif</option>
                    <option value="sold">Satıldı</option>
                    <option value="featured">Öne Çıkan</option>
                  </select>

                  <select
                    value={productSort}
                    onChange={(e) => setProductSort(e.target.value as SortBy)}
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="newest">En Yeni</option>
                    <option value="oldest">En Eski</option>
                    <option value="price_high">Fiyat: Yüksekten Düşüğe</option>
                    <option value="price_low">Fiyat: Düşükten Yükseğe</option>
                    <option value="popular">En Popüler</option>
                  </select>
                </div>

                <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                  <button
                    onClick={() => setProductViewMode("grid")}
                    className={`p-1.5 rounded transition-colors ${
                      productViewMode === "grid"
                        ? "bg-white text-gray-900"
                        : "text-gray-400 hover:text-gray-600"
                    }`}
                  >
                    <Grid3x3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setProductViewMode("list")}
                    className={`p-1.5 rounded transition-colors ${
                      productViewMode === "list"
                        ? "bg-white text-gray-900"
                        : "text-gray-400 hover:text-gray-600"
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Products Grid/List */}
            {filteredProducts.length === 0 && !productsLoading ? (
              <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-gray-900 mb-1">
                  Ürün Bulunamadı
                </h3>
                <p className="text-sm text-gray-500">
                  {productSearch || productFilter !== "all"
                    ? "Arama kriterlerinize uygun ürün bulunamadı."
                    : "Bu mağazada henüz ürün bulunmuyor."}
                </p>
              </div>
            ) : (
              <div
                className={`grid gap-3 ${
                  productViewMode === "grid"
                    ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
                    : "grid-cols-1"
                }`}
              >
                {filteredProducts.map((product, index) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    viewMode={productViewMode}
                    isLast={index === filteredProducts.length - 1}
                  />
                ))}
              </div>
            )}

            {productsLoading && (
              <div className="flex items-center justify-center py-8">
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Daha fazla ürün yükleniyor...</span>
                </div>
              </div>
            )}

            {!productsLoading &&
              hasMoreProducts &&
              filteredProducts.length > 0 && (
                <div className="flex justify-center mt-6">
                  <button
                    onClick={() => fetchShopProducts(true)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <Package className="w-3.5 h-3.5 inline mr-2" />
                    Daha Fazla Ürün Yükle
                  </button>
                </div>
              )}
          </>
        )}

        {activeTab === "collections" && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              Koleksiyonlar
            </h3>

            {collectionsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Koleksiyonlar yükleniyor...</span>
                </div>
              </div>
            ) : collections.length === 0 ? (
              <div className="text-center py-12">
                <FolderOpen className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-500">
                  Henüz koleksiyon bulunmuyor
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {collections.map((collection) => (
                  <div
                    key={collection.id}
                    className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-all duration-200 cursor-pointer"
                  >
                    <div className="relative aspect-square">
                      {collection.imageUrl ? (
                        <Image
                          src={collection.imageUrl}
                          alt={collection.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                          <FolderOpen className="w-8 h-8 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <h4 className="text-sm font-medium text-gray-900">
                        {collection.name}
                      </h4>
                      <p className="text-xs text-gray-500 mt-1">
                        {collection.productIds?.length || 0} ürün
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "about" && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              Mağaza Hakkında
            </h3>

            {shop.seller_info?.info && (
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-gray-700">
                  Satıcı Bilgileri
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {shop.seller_info.info.ibanOwnerName && (
                    <div className="flex items-start gap-3">
                      <User className="w-4 h-4 text-gray-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-500">Hesap Sahibi</p>
                        <p className="text-sm text-gray-900">
                          {shop.seller_info.info.ibanOwnerName}{" "}
                          {shop.seller_info.info.ibanOwnerSurname}
                        </p>
                      </div>
                    </div>
                  )}

                  {shop.seller_info.info.phone && (
                    <div className="flex items-start gap-3">
                      <Phone className="w-4 h-4 text-gray-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-500">Telefon</p>
                        <p className="text-sm text-gray-900">
                          {shop.seller_info.info.phone}
                        </p>
                      </div>
                    </div>
                  )}

                  {shop.seller_info.info.address && (
                    <div className="flex items-start gap-3">
                      <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-500">Adres</p>
                        <p className="text-sm text-gray-900">
                          {shop.seller_info.info.address}
                        </p>
                      </div>
                    </div>
                  )}

                  {shop.seller_info.info.region && (
                    <div className="flex items-start gap-3">
                      <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-500">Bölge</p>
                        <p className="text-sm text-gray-900">
                          {shop.seller_info.info.region}
                        </p>
                      </div>
                    </div>
                  )}

                  {shop.seller_info.info.iban && (
                    <div className="flex items-start gap-3 md:col-span-2">
                      <Building2 className="w-4 h-4 text-gray-400 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs text-gray-500">IBAN</p>
                        <p className="text-sm text-gray-900 font-mono bg-gray-50 p-2 rounded mt-1">
                          {shop.seller_info.info.iban}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {shop.taxPlateCertificateUrl && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-700">
                      Vergi Levhası
                    </h4>
                    <p className="text-xs text-gray-500 mt-1">
                      Resmi vergi kayıt belgesi
                    </p>
                  </div>
                  <a
                    href={shop.taxPlateCertificateUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-sm rounded-lg transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Belgeyi Görüntüle
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "reviews" && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              Müşteri Yorumları
            </h3>

            {reviewsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Yorumlar yükleniyor...</span>
                </div>
              </div>
            ) : reviews.length === 0 ? (
              <div className="text-center py-12">
                <Star className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Henüz yorum bulunmuyor</p>
              </div>
            ) : (
              <div className="space-y-4">
                {reviews.map((review) => (
                  <div
                    key={review.id}
                    className="border-b border-gray-200 pb-4 last:border-0"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex items-center">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={`w-3.5 h-3.5 ${
                                  i < review.rating
                                    ? "text-yellow-400 fill-current"
                                    : "text-gray-300"
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-xs text-gray-500">
                            {formatDate(review.timestamp)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-900">{review.review}</p>
                        {review.imageUrls && review.imageUrls.length > 0 && (
                          <div className="flex gap-2 mt-2">
                            {review.imageUrls.map((url, index) => (
                              <div
                                key={index}
                                className="relative w-16 h-16 rounded-lg overflow-hidden"
                              >
                                <Image
                                  src={url}
                                  alt={`Yorum görseli ${index + 1}`}
                                  fill
                                  className="object-cover"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "members" && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              Mağaza Üyeleri
            </h3>

            {membersLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Üyeler yükleniyor...</span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {members.owner && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                        {members.owner.profileImage ? (
                          <Image
                            src={members.owner.profileImage}
                            alt={members.owner.displayName}
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-yellow-200 flex items-center justify-center">
                            <User className="w-5 h-5 text-yellow-600" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-gray-900">
                          {members.owner.displayName}
                        </h4>
                        <p className="text-xs text-yellow-600">Sahip</p>
                      </div>
                    </div>
                  </div>
                )}

                {members.coOwners.map((coOwner, index) => (
                  <div
                    key={`coowner-${index}`}
                    className="p-3 bg-orange-50 border border-orange-200 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                        {coOwner.profileImage ? (
                          <Image
                            src={coOwner.profileImage}
                            alt={coOwner.displayName}
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-orange-200 flex items-center justify-center">
                            <User className="w-5 h-5 text-orange-600" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-gray-900">
                          {coOwner.displayName}
                        </h4>
                        <p className="text-xs text-orange-600">Ortak Sahip</p>
                      </div>
                    </div>
                  </div>
                ))}

                {members.editors.map((editor, index) => (
                  <div
                    key={`editor-${index}`}
                    className="p-3 bg-blue-50 border border-blue-200 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                        {editor.profileImage ? (
                          <Image
                            src={editor.profileImage}
                            alt={editor.displayName}
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-blue-200 flex items-center justify-center">
                            <User className="w-5 h-5 text-blue-600" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-gray-900">
                          {editor.displayName}
                        </h4>
                        <p className="text-xs text-blue-600">Editör</p>
                      </div>
                    </div>
                  </div>
                ))}

                {members.viewers.map((viewer, index) => (
                  <div
                    key={`viewer-${index}`}
                    className="p-3 bg-green-50 border border-green-200 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                        {viewer.profileImage ? (
                          <Image
                            src={viewer.profileImage}
                            alt={viewer.displayName}
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-green-200 flex items-center justify-center">
                            <User className="w-5 h-5 text-green-600" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-gray-900">
                          {viewer.displayName}
                        </h4>
                        <p className="text-xs text-green-600">İzleyici</p>
                      </div>
                    </div>
                  </div>
                ))}

                {!members.owner &&
                  members.coOwners.length === 0 &&
                  members.editors.length === 0 &&
                  members.viewers.length === 0 && (
                    <div className="text-center py-8">
                      <Users className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">
                        Üye bilgisi bulunmuyor
                      </p>
                    </div>
                  )}
              </div>
            )}
          </div>
        )}

        {activeTab === "analytics" && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              Mağaza İstatistikleri
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-indigo-600">
                  {products.length}
                </div>
                <div className="text-xs text-gray-500 mt-1">Toplam Ürün</div>
              </div>

              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {products.filter((p) => p.sold).length}
                </div>
                <div className="text-xs text-gray-500 mt-1">Satılan Ürün</div>
              </div>

              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">
                  {products.filter((p) => p.isFeatured || p.isBoosted).length}
                </div>
                <div className="text-xs text-gray-500 mt-1">Öne Çıkan</div>
              </div>

              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  {formatNumber(
                    products.reduce((sum, p) => sum + (p.clickCount || 0), 0)
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-1">Toplam Görüntü</div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-3">
                Performans Metrikleri
              </h4>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-600">Dönüşüm Oranı</span>
                    <span className="font-medium text-gray-900">
                      {products.length > 0
                        ? `${Math.round(
                            (products.filter((p) => p.sold).length /
                              products.length) *
                              100
                          )}%`
                        : "0%"}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full"
                      style={{
                        width:
                          products.length > 0
                            ? `${Math.round(
                                (products.filter((p) => p.sold).length /
                                  products.length) *
                                  100
                              )}%`
                            : "0%",
                      }}
                    ></div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-600">Ortalama Ürün Puanı</span>
                    <span className="font-medium text-gray-900">
                      {products.length > 0
                        ? (
                            products.reduce(
                              (sum, p) => sum + (p.averageRating || 0),
                              0
                            ) /
                              products.filter((p) => p.averageRating > 0)
                                .length || 0
                          ).toFixed(1)
                        : "0.0"}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-yellow-600 h-2 rounded-full"
                      style={{
                        width:
                          products.length > 0
                            ? `${
                                (products.reduce(
                                  (sum, p) => sum + (p.averageRating || 0),
                                  0
                                ) /
                                  (products.filter((p) => p.averageRating > 0)
                                    .length || 1) /
                                  5) *
                                100
                              }%`
                            : "0%",
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            </div> 
          </div>
        )}
                   {/* Commission Modal */}
{showCommissionModal && (
  <div className="fixed inset-0 bg-opacity-30 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Komisyon Ayarları
          </h3>
          <button
            onClick={() => setShowCommissionModal(false)}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
            disabled={savingCommission}
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Komisyon Oranı (%)
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={commissionPercentage}
                onChange={(e) => setCommissionPercentage(parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Örn: 15"
                disabled={savingCommission}
              />
              <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500">
                %
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Bu mağazadan alınacak komisyon oranını girin
            </p>
          </div>

          {shop?.ourComission !== undefined && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600">
                Mevcut Komisyon: <span className="font-semibold text-gray-900">{shop.ourComission}%</span>
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={() => setShowCommissionModal(false)}
            className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
            disabled={savingCommission}
          >
            İptal
          </button>
          <button
            onClick={handleSaveCommission}
            disabled={savingCommission}
            className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {savingCommission ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Kaydediliyor...
              </>
            ) : (
              "Kaydet"
            )}
          </button>
        </div>
      </div>
    </div>
  </div>
)}
      </main>
    </div>
  );
}

export default function ShopDetailsPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div>Loading...</div>}>
        <ShopDetailsContent />
      </Suspense>
    </ProtectedRoute>
  );
}
