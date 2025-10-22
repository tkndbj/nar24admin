"use client";

import React from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  ArrowLeft,
  Store,
  Loader2,
  Package,
  MapPin,
  Star,
  Search,
  Grid3x3,
  List,
  Phone,
  Calendar,
  User,
  Zap,
  BadgeCheck,
  FolderOpen,
  Database,
  Copy,
  Edit,
  Check,
  X,
  Building2,
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
  orderBy as firestoreOrderBy,
  limit,
  Timestamp,
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
  transactionsBadgeAcknowledged?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  ourComission?: number;
}

interface ProductData {
  id: string;
  productName: string;
  price: number;
  currency: string;
  imageUrls: string[];
  sold: boolean;
  shopId: string;
}

interface ReviewData {
  id: string;
  rating: number;
  review: string;
  userId: string;
  timestamp: Timestamp;
}

interface CollectionData {
  id: string;
  name: string;
  imageUrl: string;
  productIds: string[];
}

interface UserData {
  id: string;
  displayName: string;
  email: string;
  profileImage?: string;
}

type ViewMode = "grid" | "list";
type FilterStatus = "all" | "active" | "sold";
type SortBy = "newest" | "oldest" | "price_high" | "price_low";
type TabType = "products" | "collections" | "about" | "reviews" | "members";

function ShopDetailsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shopId = searchParams.get("shopId");

  // Refs
  const allFieldsContainerRef = useRef<HTMLDivElement | null>(null);

  // State Management
  const [shop, setShop] = useState<ShopData | null>(null);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [reviews, setReviews] = useState<ReviewData[]>([]);
  const [collections, setCollections] = useState<CollectionData[]>([]);
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
  const [loading, setLoading] = useState(true);
  const [savingField, setSavingField] = useState<string | null>(null);

  // Filter and Search States
  const [productSearch, setProductSearch] = useState("");
  const [productViewMode, setProductViewMode] = useState<ViewMode>("grid");
  const [productFilter, setProductFilter] = useState<FilterStatus>("all");
  const [productSort, setProductSort] = useState<SortBy>("newest");
  const [activeTab, setActiveTab] = useState<TabType>("products");

  // Fetch shop data
  const fetchShopData = useCallback(async () => {
    if (!shopId) {
      toast.error("Mağaza ID'si bulunamadı");
      router.push("/dashboard");
      return;
    }

    try {
      setLoading(true);

      // Fetch shop
      const shopDoc = await getDoc(doc(db, "shops", shopId));
      if (!shopDoc.exists()) {
        toast.error("Mağaza bulunamadı");
        router.push("/dashboard");
        return;
      }

      const shopData = { id: shopDoc.id, ...shopDoc.data() } as ShopData;
      setShop(shopData);

      // Fetch products (limit to 50 for performance)
      const productsQuery = query(
        collection(db, "shop_products"),
        where("shopId", "==", shopId),
        firestoreOrderBy("createdAt", "desc"),
        limit(50)
      );
      const productsSnapshot = await getDocs(productsQuery);
      const productsData = productsSnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as ProductData)
      );
      setProducts(productsData);

      // Fetch reviews (limit to 30)
      const reviewsQuery = query(
        collection(db, "shops", shopId, "reviews"),
        firestoreOrderBy("timestamp", "desc"),
        limit(30)
      );
      const reviewsSnapshot = await getDocs(reviewsQuery);
      const reviewsData = reviewsSnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as ReviewData)
      );
      setReviews(reviewsData);

      // Fetch collections (limit to 20)
      const collectionsQuery = query(
        collection(db, "shops", shopId, "collections"),
        firestoreOrderBy("createdAt", "desc"),
        limit(20)
      );
      const collectionsSnapshot = await getDocs(collectionsQuery);
      const collectionsData = collectionsSnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as CollectionData)
      );
      setCollections(collectionsData);

      // Fetch owner
      if (shopData.ownerId) {
        const ownerDoc = await getDoc(doc(db, "users", shopData.ownerId));
        if (ownerDoc.exists()) {
          setMembers((prev) => ({
            ...prev,
            owner: { id: ownerDoc.id, ...ownerDoc.data() } as UserData,
          }));
        }
      }
    } catch (error) {
      console.error("Error fetching shop data:", error);
      toast.error("Mağaza bilgileri yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  }, [shopId, router]);

  useEffect(() => {
    fetchShopData();
  }, [fetchShopData]);

  // Save individual field
  const saveIndividualField = async (
    field: string,
    value: string | number | boolean | string[]
  ) => {
    if (!shop) return;

    try {
      setSavingField(field);

      await updateDoc(doc(db, "shops", shop.id), {
        [field]: value,
        updatedAt: Timestamp.now(),
      });

      setShop((prev) => (prev ? { ...prev, [field]: value } : null));
      toast.success(`${field} güncellendi!`);
    } catch (error) {
      console.error("Error updating field:", error);
      toast.error(`${field} güncellenirken hata oluştu`);
    } finally {
      setSavingField(null);
    }
  };

  // Filtered and sorted products
  const filteredProducts = useMemo(() => {
    let filtered = [...products];

    // Search filter
    if (productSearch.trim()) {
      const searchLower = productSearch.toLowerCase();
      filtered = filtered.filter((product) =>
        product.productName.toLowerCase().includes(searchLower)
      );
    }

    // Status filter
    if (productFilter === "active") {
      filtered = filtered.filter((product) => !product.sold);
    } else if (productFilter === "sold") {
      filtered = filtered.filter((product) => product.sold);
    }

    // Sorting
    filtered.sort((a, b) => {
      switch (productSort) {
        case "newest":
          return 0; // Already sorted by createdAt desc
        case "oldest":
          return 0; // Would need to reverse
        case "price_high":
          return b.price - a.price;
        case "price_low":
          return a.price - b.price;
        default:
          return 0;
      }
    });

    return filtered;
  }, [products, productSearch, productFilter, productSort]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-900">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          <span>Mağaza bilgileri yükleniyor...</span>
        </div>
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2 text-gray-900">
            Mağaza Bulunamadı
          </h2>
          <p className="text-gray-600">Aradığınız mağaza mevcut değil.</p>
        </div>
      </div>
    );
  }

  // All Fields Display Component
  const AllFieldsDisplay = ({
    shop,
    onFieldSave,
    savingField,
    setSavingField,
  }: {
    shop: ShopData;
    onFieldSave: (
      field: string,
      value: string | number | boolean
    ) => Promise<void>;
    savingField: string | null;
    setSavingField: (field: string | null) => void;
  }) => {
    const [searchTerm, setSearchTerm] = useState("");
    const [editingField, setEditingField] = useState<string | null>(null);
    const [editValue, setEditValue] = useState<string>("");

    const formatFieldValue = (
      value: unknown
    ): { display: string; type: string } => {
      if (value === null) return { display: "null", type: "null" };
      if (value === undefined)
        return { display: "undefined", type: "undefined" };

      const type = typeof value;

      switch (type) {
        case "string":
          return { display: value as string, type: "string" };
        case "number":
          return { display: value.toString(), type: "number" };
        case "boolean":
          return { display: value.toString(), type: "boolean" };
        case "object":
          if (value instanceof Date) {
            return { display: value.toLocaleString("tr-TR"), type: "date" };
          }
          if (
            value &&
            typeof value === "object" &&
            "toDate" in value &&
            typeof (value as { toDate: () => Date }).toDate === "function"
          ) {
            return {
              display: (value as { toDate: () => Date })
                .toDate()
                .toLocaleString("tr-TR"),
              type: "timestamp",
            };
          }
          if (Array.isArray(value)) {
            return { display: JSON.stringify(value), type: "array" };
          }
          if (value && typeof value === "object") {
            return { display: JSON.stringify(value), type: "object" };
          }
          return { display: JSON.stringify(value), type: "object" };
        default:
          return { display: String(value), type: type };
      }
    };

    const getTypeColor = (type: string): string => {
      switch (type) {
        case "string":
          return "text-green-600";
        case "number":
          return "text-blue-600";
        case "boolean":
          return "text-purple-600";
        case "timestamp":
          return "text-orange-600";
        case "date":
          return "text-orange-600";
        case "array":
          return "text-pink-600";
        case "object":
          return "text-indigo-600";
        default:
          return "text-gray-900";
      }
    };

    const getAllFields = () => {
      const fields: Array<{
        key: string;
        value: unknown;
        type: string;
        editable: boolean;
      }> = [];

      const nonEditableFields = ["id", "createdAt", "updatedAt", "ownerId"];
      const shopData = { ...shop } as Record<string, unknown>;

      Object.keys(shopData).forEach((key) => {
        const value = shopData[key];
        const { type } = formatFieldValue(value);
        const editable = !nonEditableFields.includes(key);
        fields.push({ key, value, type, editable });
      });

      return fields.sort((a, b) => a.key.localeCompare(b.key));
    };

    const filteredFields = useMemo(() => {
      const allFields = getAllFields();
      if (!searchTerm.trim()) return allFields;

      const searchLower = searchTerm.toLowerCase();
      return allFields.filter(
        (field) =>
          field.key.toLowerCase().includes(searchLower) ||
          formatFieldValue(field.value)
            .display.toLowerCase()
            .includes(searchLower)
      );
    }, [shop, searchTerm]);

    const startEditing = (fieldKey: string, currentValue: unknown) => {
      setEditingField(fieldKey);
      const { display } = formatFieldValue(currentValue);
      setEditValue(display);
    };

    const cancelEditing = () => {
      setEditingField(null);
      setEditValue("");
    };

    const saveField = async (fieldKey: string, type: string) => {
      try {
        setSavingField(fieldKey);
        let convertedValue: string | number | boolean = editValue;

        switch (type) {
          case "number":
            convertedValue = editValue === "" ? 0 : Number(editValue);
            if (isNaN(convertedValue)) {
              toast.error("Geçersiz sayı formatı");
              return;
            }
            break;
          case "boolean":
            convertedValue = editValue.toLowerCase() === "true";
            break;
          case "array":
            try {
              convertedValue = JSON.parse(editValue);
              if (!Array.isArray(convertedValue)) {
                convertedValue = [editValue] as unknown as
                  | string
                  | number
                  | boolean;
              }
            } catch {
              toast.error("Geçersiz JSON array formatı");
              return;
            }
            break;
          case "object":
            try {
              convertedValue = JSON.parse(editValue);
            } catch {
              toast.error("Geçersiz JSON object formatı");
              return;
            }
            break;
          default:
            convertedValue = editValue;
        }

        await onFieldSave(fieldKey, convertedValue);
        setEditingField(null);
        setEditValue("");
        toast.success(`${fieldKey} başarıyla güncellendi!`);
      } catch (error) {
        console.error("Error saving field:", error);
        toast.error(`${fieldKey} güncellenirken hata oluştu`);
      } finally {
        setSavingField(null);
      }
    };

    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm h-full flex flex-col">
        {/* Header with Search */}
        <div className="p-3 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-gray-900">
                Tüm Dükkan Alanları
              </h3>
              <span className="text-xs text-gray-600">
                ({filteredFields.length})
              </span>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Alan ara..."
              className="w-full pl-7 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded text-gray-900 text-xs placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Fields List - Scrollable */}
        <div
          ref={allFieldsContainerRef}
          className="p-2 space-y-1 overflow-y-auto flex-1"
        >
          {filteredFields.map((field) => {
            const { display, type } = formatFieldValue(field.value);
            const isEditing = editingField === field.key;
            const isSaving = savingField === field.key;
            const canEdit = field.editable && type !== "timestamp";

            return (
              <div
                key={field.key}
                className="group bg-gray-50 hover:bg-gray-100 rounded border border-gray-200 p-2 transition-colors"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="font-mono text-[11px] font-semibold text-gray-700 truncate">
                        {field.key}
                      </span>
                      <span
                        className={`text-[9px] px-1 py-0.5 rounded font-medium ${getTypeColor(
                          type
                        )} bg-white`}
                      >
                        {type}
                      </span>
                    </div>

                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="flex-1 px-2 py-1 text-xs bg-white border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              saveField(field.key, type);
                            } else if (e.key === "Escape") {
                              cancelEditing();
                            }
                          }}
                        />
                        <button
                          onClick={() => saveField(field.key, type)}
                          disabled={isSaving}
                          className="p-1 bg-green-600 hover:bg-green-700 text-white rounded transition-colors disabled:opacity-50"
                        >
                          {isSaving ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Check className="w-3 h-3" />
                          )}
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="p-1 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-700 truncate flex-1">
                          {type === "array" || type === "object" ? (
                            <details className="cursor-pointer">
                              <summary className="text-xs text-gray-600 hover:text-gray-900">
                                {type === "array"
                                  ? `[${
                                      Array.isArray(field.value)
                                        ? field.value.length
                                        : 0
                                    }]`
                                  : `{${
                                      field.value &&
                                      typeof field.value === "object"
                                        ? Object.keys(field.value).length
                                        : 0
                                    }}`}
                              </summary>
                              <div className="mt-1 p-2 bg-gray-100 rounded border-l border-gray-300">
                                <pre className="text-[10px] overflow-x-auto whitespace-pre-wrap text-gray-700">
                                  {JSON.stringify(field.value, null, 2)}
                                </pre>
                              </div>
                            </details>
                          ) : (
                            display
                          )}
                        </span>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {canEdit && (
                            <button
                              onClick={() =>
                                startEditing(field.key, field.value)
                              }
                              className="p-0.5 hover:bg-gray-200 rounded transition-colors"
                              title="Düzenle"
                            >
                              <Edit className="w-3 h-3 text-blue-600" />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(
                                type === "array" || type === "object"
                                  ? JSON.stringify(field.value, null, 2)
                                  : String(field.value)
                              );
                              toast.success("Kopyalandı!");
                            }}
                            className="p-0.5 hover:bg-gray-200 rounded transition-colors"
                            title="Kopyala"
                          >
                            <Copy className="w-3 h-3 text-gray-600" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* No Results */}
        {filteredFields.length === 0 && (
          <div className="text-center py-6">
            <Search className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-600 text-xs">Alan bulunamadı</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Compact Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1800px] mx-auto px-4 py-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-1.5 hover:bg-gray-100 rounded transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-gray-700" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-bold text-gray-900 truncate">
                {shop.name}
              </h1>
              <p className="text-xs text-gray-600 truncate">
                {shop.address || "Adres belirtilmemiş"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {shop.isBoosted && (
                <span className="inline-flex items-center gap-0.5 px-2 py-1 bg-purple-100 text-purple-700 text-xs font-semibold rounded">
                  <Zap className="w-3 h-3" />
                  BOOST
                </span>
              )}
              {shop.transactionsBadgeAcknowledged && (
                <span className="inline-flex items-center gap-0.5 px-2 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded">
                  <BadgeCheck className="w-3 h-3" />
                  DOĞRULANMIŞ
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1800px] mx-auto px-4 py-4 h-screen overflow-hidden">
        {/* Main Content Grid */}
        <div className="grid grid-cols-12 gap-4 h-full overflow-hidden">
          {/* Left Column - Shop Info */}
          <div className="col-span-3 space-y-2 overflow-y-auto h-full">
            {/* Profile Image */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
              <div className="relative aspect-square">
                {shop.profileImageUrl ? (
                  <Image
                    src={shop.profileImageUrl}
                    alt={shop.name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                    <Store className="w-12 h-12 text-gray-400" />
                  </div>
                )}
              </div>
            </div>

            {/* Shop Info Cards */}
            <div className="bg-white border border-gray-200 rounded-lg p-2 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-900 mb-2 flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                Mağaza Bilgileri
              </h3>
              <div className="space-y-2 text-xs">
                {shop.address && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3 h-3 text-gray-500" />
                    <span className="text-gray-700 truncate">
                      {shop.address}
                    </span>
                  </div>
                )}
                {shop.contactNo && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3 h-3 text-gray-500" />
                    <span className="text-gray-700 truncate">
                      {shop.contactNo}
                    </span>
                  </div>
                )}
                {shop.averageRating !== undefined && (
                  <div className="flex items-center gap-2">
                    <Star className="w-3 h-3 text-yellow-500" />
                    <span className="text-gray-700">
                      {shop.averageRating.toFixed(1)} ({shop.reviewCount || 0}{" "}
                      yorum)
                    </span>
                  </div>
                )}
                {shop.createdAt && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3 h-3 text-gray-500" />
                    <span className="text-gray-700 text-[10px]">
                      {shop.createdAt.toDate().toLocaleDateString("tr-TR")}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Categories */}
            {shop.categories && shop.categories.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-2 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-900 mb-2">
                  Kategoriler
                </h3>
                <div className="flex flex-wrap gap-1">
                  {shop.categories.map((category, index) => (
                    <span
                      key={index}
                      className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded"
                    >
                      {category}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Owner Info */}
            {members.owner && (
              <div className="bg-white border border-gray-200 rounded-lg p-2 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-900 mb-2 flex items-center gap-1">
                  <User className="w-3 h-3" />
                  Mağaza Sahibi
                </h3>
                <div className="flex items-center gap-2">
                  <div className="relative w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                    {members.owner.profileImage ? (
                      <Image
                        src={members.owner.profileImage}
                        alt={members.owner.displayName}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                        <User className="w-4 h-4 text-gray-400" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-900 text-xs truncate">
                      {members.owner.displayName}
                    </h4>
                    <p className="text-[10px] text-gray-600 truncate">
                      {members.owner.email}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Middle Column - All Fields */}
          <div className="col-span-5 h-full overflow-hidden">
            <AllFieldsDisplay
              shop={shop}
              onFieldSave={saveIndividualField}
              savingField={savingField}
              setSavingField={setSavingField}
            />
          </div>

          {/* Right Column - Tabs */}
          <div className="col-span-4 h-full overflow-hidden">
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm h-full flex flex-col">
              {/* Tab Headers */}
              <div className="flex items-center border-b border-gray-200 flex-shrink-0 overflow-x-auto">
                <button
                  onClick={() => setActiveTab("products")}
                  className={`flex-1 py-2 px-2 text-xs font-medium transition-colors relative whitespace-nowrap ${
                    activeTab === "products"
                      ? "text-gray-900 bg-gray-50"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <div className="flex items-center justify-center gap-1">
                    <Package className="w-3 h-3" />
                    Ürünler
                  </div>
                  {activeTab === "products" && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                  )}
                </button>

                <button
                  onClick={() => setActiveTab("collections")}
                  className={`flex-1 py-2 px-2 text-xs font-medium transition-colors relative whitespace-nowrap ${
                    activeTab === "collections"
                      ? "text-gray-900 bg-gray-50"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <div className="flex items-center justify-center gap-1">
                    <FolderOpen className="w-3 h-3" />
                    Koleksiyonlar
                  </div>
                  {activeTab === "collections" && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                  )}
                </button>

                <button
                  onClick={() => setActiveTab("reviews")}
                  className={`flex-1 py-2 px-2 text-xs font-medium transition-colors relative whitespace-nowrap ${
                    activeTab === "reviews"
                      ? "text-gray-900 bg-gray-50"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <div className="flex items-center justify-center gap-1">
                    <Star className="w-3 h-3" />
                    Yorumlar
                  </div>
                  {activeTab === "reviews" && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                  )}
                </button>
              </div>

              {/* Content Area - Scrollable */}
              <div className="p-3 overflow-y-auto flex-1">
                {/* Products Tab */}
                {activeTab === "products" && (
                  <div>
                    {/* Controls */}
                    <div className="space-y-2 mb-3">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400" />
                        <input
                          type="text"
                          value={productSearch}
                          onChange={(e) => setProductSearch(e.target.value)}
                          placeholder="Ürün ara..."
                          className="w-full pl-7 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded text-gray-900 text-xs placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          value={productFilter}
                          onChange={(e) =>
                            setProductFilter(e.target.value as FilterStatus)
                          }
                          className="flex-1 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="all">Tüm Ürünler</option>
                          <option value="active">Aktif</option>
                          <option value="sold">Satıldı</option>
                        </select>

                        <select
                          value={productSort}
                          onChange={(e) =>
                            setProductSort(e.target.value as SortBy)
                          }
                          className="flex-1 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="newest">En Yeni</option>
                          <option value="oldest">En Eski</option>
                          <option value="price_high">Fiyat ↓</option>
                          <option value="price_low">Fiyat ↑</option>
                        </select>

                        <div className="flex items-center bg-gray-100 rounded p-0.5">
                          <button
                            onClick={() => setProductViewMode("grid")}
                            className={`p-1 rounded transition-colors ${
                              productViewMode === "grid"
                                ? "bg-white text-gray-900"
                                : "text-gray-400"
                            }`}
                          >
                            <Grid3x3 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setProductViewMode("list")}
                            className={`p-1 rounded transition-colors ${
                              productViewMode === "list"
                                ? "bg-white text-gray-900"
                                : "text-gray-400"
                            }`}
                          >
                            <List className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Products List */}
                    {filteredProducts.length > 0 ? (
                      <div
                        className={`grid gap-2 ${
                          productViewMode === "grid"
                            ? "grid-cols-2"
                            : "grid-cols-1"
                        }`}
                      >
                        {filteredProducts.map((product) => (
                          <div
                            key={product.id}
                            onClick={() =>
                              router.push(
                                `/productdetails?productId=${product.id}`
                              )
                            }
                            className="bg-gray-50 rounded border border-gray-200 hover:bg-gray-100 cursor-pointer transition-colors overflow-hidden"
                          >
                            {productViewMode === "grid" ? (
                              <div>
                                <div className="relative aspect-square">
                                  {product.imageUrls?.[0] ? (
                                    <Image
                                      src={product.imageUrls[0]}
                                      alt={product.productName}
                                      fill
                                      className="object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                                      <Package className="w-6 h-6 text-gray-400" />
                                    </div>
                                  )}
                                </div>
                                <div className="p-2">
                                  <h4 className="font-semibold text-gray-900 text-xs truncate">
                                    {product.productName}
                                  </h4>
                                  <div className="flex items-center justify-between text-[10px] text-gray-600 mt-1">
                                    <span>
                                      {product.price} {product.currency}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 p-2">
                                <div className="relative w-12 h-12 rounded overflow-hidden flex-shrink-0">
                                  {product.imageUrls?.[0] ? (
                                    <Image
                                      src={product.imageUrls[0]}
                                      alt={product.productName}
                                      fill
                                      className="object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                                      <Package className="w-4 h-4 text-gray-400" />
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-semibold text-gray-900 text-xs truncate">
                                    {product.productName}
                                  </h4>
                                  <div className="flex items-center justify-between text-[10px] text-gray-600">
                                    <span>
                                      {product.price} {product.currency}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <Package className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-600 text-xs">Ürün bulunamadı</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Collections Tab */}
                {activeTab === "collections" && (
                  <div>
                    {collections.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {collections.map((collection) => (
                          <div
                            key={collection.id}
                            className="bg-gray-50 rounded border border-gray-200 overflow-hidden"
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
                                <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                                  <FolderOpen className="w-6 h-6 text-gray-400" />
                                </div>
                              )}
                            </div>
                            <div className="p-2">
                              <h4 className="font-semibold text-gray-900 text-xs truncate">
                                {collection.name}
                              </h4>
                              <p className="text-[10px] text-gray-600">
                                {collection.productIds?.length || 0} ürün
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <FolderOpen className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-600 text-xs">
                          Koleksiyon bulunamadı
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Reviews Tab */}
                {activeTab === "reviews" && (
                  <div>
                    {reviews.length > 0 ? (
                      <div className="space-y-2">
                        {reviews.map((review) => (
                          <div
                            key={review.id}
                            className="p-2 bg-gray-50 rounded border border-gray-200"
                          >
                            <div className="flex items-center gap-1 mb-1">
                              <div className="flex items-center gap-0.5">
                                {[...Array(5)].map((_, i) => (
                                  <Star
                                    key={i}
                                    className={`w-2.5 h-2.5 ${
                                      i < review.rating
                                        ? "text-yellow-500 fill-current"
                                        : "text-gray-300"
                                    }`}
                                  />
                                ))}
                              </div>
                              <span className="text-[10px] text-gray-500">
                                {review.timestamp
                                  .toDate()
                                  .toLocaleDateString("tr-TR")}
                              </span>
                            </div>
                            <p className="text-xs text-gray-700">
                              {review.review}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <Star className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-600 text-xs">
                          Yorum bulunamadı
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// Main export with Suspense wrapper
export default function ShopDetails() {
  return (
    <ProtectedRoute>
      <Suspense
        fallback={
          <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
            <div className="flex items-center gap-3 text-gray-900">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <span>Yükleniyor...</span>
            </div>
          </div>
        }
      >
        <ShopDetailsContent />
      </Suspense>
    </ProtectedRoute>
  );
}
