"use client";

import React from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { getAuth, sendPasswordResetEmail } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import {
  ArrowLeft,
  X,
  Loader2,
  User,
  ShoppingBag,
  Store,
  Edit,
  Check,
  Package,
  Search,
  Database,
  Copy,
  Mail,
  Phone,
  Calendar,
  MapPin,
  Activity,
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
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { db, functions } from "../lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { toast } from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";

// Types
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

interface ProductData {
  id: string;
  productName: string;
  price: number;
  currency: string;
  imageUrls: string[];
  sold: boolean;
}

interface ShopData {
  id: string;
  name: string;
  profileImageUrl?: string;
}

interface OrderData {
  id: string;
  totalPrice: number;
  timestamp: Timestamp;
  itemCount: number;
}

// Create a separate component that uses useSearchParams
function UserDetailsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId");
  const { user: authUser } = useAuth();

  // Check if current user is a full admin (not semi-admin)
  const isFullAdmin = authUser?.isAdmin === true && !authUser?.isSemiAdmin;

  // Refs
  const allFieldsContainerRef = useRef<HTMLDivElement | null>(null);

  // State Management
  const [user, setUser] = useState<UserData | null>(null);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [shops, setShops] = useState<ShopData[]>([]);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingField, setSavingField] = useState<string | null>(null);

  // Search states
  const [productSearch, setProductSearch] = useState("");
  const [shopSearch, setShopSearch] = useState("");
  const [orderSearch, setOrderSearch] = useState("");

  // Active tab
  const [activeTab, setActiveTab] = useState<"products" | "shops" | "orders">(
    "products"
  );

  const deleteUserAccountCallable = httpsCallable(
    functions,
    "deleteUserAccount"
  );

  // Fetch user data
  const fetchUserData = useCallback(async () => {
    if (!userId) {
      toast.error("Kullanıcı ID'si bulunamadı");
      router.push("/dashboard");
      return;
    }

    try {
      setLoading(true);

      // Fetch user
      const userDoc = await getDoc(doc(db, "users", userId));
      if (!userDoc.exists()) {
        toast.error("Kullanıcı bulunamadı");
        router.push("/dashboard");
        return;
      }

      const userData = { id: userDoc.id, ...userDoc.data() } as UserData;
      setUser(userData);

      // Fetch products (limit to 50 for performance)
      const productsQuery = query(
        collection(db, "products"),
        where("userId", "==", userId),
        firestoreOrderBy("createdAt", "desc"),
        limit(50)
      );
      const productsSnapshot = await getDocs(productsQuery);
      const productsData = productsSnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as ProductData)
      );
      setProducts(productsData);

      // Fetch shops (limit to 20 for performance)
      const shopsQuery = query(
        collection(db, "shops"),
        where("ownerId", "==", userId),
        limit(20)
      );
      const shopsSnapshot = await getDocs(shopsQuery);
      const shopsData = shopsSnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as ShopData)
      );
      setShops(shopsData);

      // Fetch orders (limit to 30 for performance)
      const ordersQuery = query(
        collection(db, "orders"),
        where("buyerId", "==", userId),
        firestoreOrderBy("timestamp", "desc"),
        limit(30)
      );
      const ordersSnapshot = await getDocs(ordersQuery);
      const ordersData = ordersSnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as OrderData)
      );
      setOrders(ordersData);
    } catch (error) {
      console.error("Error fetching user data:", error);
      toast.error("Kullanıcı verileri yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [userId, router]);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  // Save individual field
  const saveIndividualField = async (
    field: string,
    value: string | number | boolean | string[]
  ) => {
    if (!user) return;

    try {
      setSavingField(field);

      await updateDoc(doc(db, "users", user.id), {
        [field]: value,
        updatedAt: Timestamp.now(),
      });

      setUser((prev) => (prev ? { ...prev, [field]: value } : null));
      toast.success(`${field} güncellendi!`);
    } catch (error) {
      console.error("Error updating field:", error);
      toast.error(`${field} güncellenirken hata oluştu`);
    } finally {
      setSavingField(null);
    }
  };

  // Handle password reset
  const handleResetPassword = async () => {
    if (!user?.email) return;

    if (
      !window.confirm(
        `${user.email} adresine şifre sıfırlama e-postası gönderilecek. Devam edilsin mi?`
      )
    ) {
      return;
    }

    try {
      const auth = getAuth();
      await sendPasswordResetEmail(auth, user.email);
      toast.success("Şifre sıfırlama e-postası gönderildi!");
    } catch (error) {
      console.error("Error sending password reset email:", error);
      toast.error("Şifre sıfırlama e-postası gönderilemedi");
    }
  };

  // Handle delete account
  const handleDeleteAccount = async () => {
    if (!user) return;

    const confirmText = window.prompt(
      `Bu kullanıcının hesabını silmek istediğinize emin misiniz?\n\nOnaylamak için kullanıcının e-postasını yazın: ${user.email}`
    );

    if (confirmText !== user.email) {
      toast.error("E-posta adresi eşleşmiyor");
      return;
    }

    try {
      await deleteUserAccountCallable({ userId: user.id });
      toast.success("Kullanıcı hesabı silindi");
      router.push("/dashboard");
    } catch (error) {
      console.error("Error deleting account:", error);
      toast.error("Hesap silinirken hata oluştu");
    }
  };

  // Filtered data
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products;
    const searchLower = productSearch.toLowerCase();
    return products.filter((product) =>
      product.productName.toLowerCase().includes(searchLower)
    );
  }, [products, productSearch]);

  const filteredShops = useMemo(() => {
    if (!shopSearch.trim()) return shops;
    const searchLower = shopSearch.toLowerCase();
    return shops.filter((shop) =>
      shop.name.toLowerCase().includes(searchLower)
    );
  }, [shops, shopSearch]);

  const filteredOrders = useMemo(() => {
    if (!orderSearch.trim()) return orders;
    const searchLower = orderSearch.toLowerCase();
    return orders.filter((order) =>
      order.id.toLowerCase().includes(searchLower)
    );
  }, [orders, orderSearch]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-900">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          <span>Kullanıcı bilgileri yükleniyor...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2 text-gray-900">
            Kullanıcı Bulunamadı
          </h2>
          <p className="text-gray-600">Aradığınız kullanıcı mevcut değil.</p>
        </div>
      </div>
    );
  }

  // All Fields Display Component
  const AllFieldsDisplay = ({
    user,
    onFieldSave,
    savingField,
    setSavingField,
    canEdit,
  }: {
    user: UserData;
    onFieldSave: (
      field: string,
      value: string | number | boolean
    ) => Promise<void>;
    savingField: string | null;
    setSavingField: (field: string | null) => void;
    canEdit: boolean;
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
        case "null":
          return "text-gray-500";
        case "undefined":
          return "text-gray-500";
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

      const nonEditableFields = ["id", "createdAt", "updatedAt"];

      const userData = { ...user } as Record<string, unknown>;

      Object.keys(userData).forEach((key) => {
        const value = userData[key];
        const { type } = formatFieldValue(value);
        const editable = !nonEditableFields.includes(key);
        fields.push({ key, value, type, editable });
      });

      return fields.sort((a, b) => a.key.localeCompare(b.key));
    };

    const filteredFields = useMemo(() => {
      const allFields = getAllFields();

      if (!searchTerm.trim()) {
        return allFields;
      }

      const searchLower = searchTerm.toLowerCase();
      return allFields.filter(
        (field) =>
          field.key.toLowerCase().includes(searchLower) ||
          formatFieldValue(field.value)
            .display.toLowerCase()
            .includes(searchLower)
      );
    }, [user, searchTerm]);

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
                Tüm Kullanıcı Alanları
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

                    {isEditing && canEdit ? (
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
                          {canEdit && field.editable && type !== "timestamp" && (
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
                {user.displayName}
              </h1>
              <p className="text-xs text-gray-600 truncate">{user.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleResetPassword}
                className="px-2 py-1 bg-green-100 hover:bg-green-200 text-green-700 rounded text-xs transition-colors"
              >
                Parola Sıfırla
              </button>
              <button
                onClick={handleDeleteAccount}
                className="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs transition-colors"
              >
                Hesabı Sil
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1800px] mx-auto px-4 py-4 h-screen overflow-hidden">
        {/* Main Content Grid */}
        <div className="grid grid-cols-12 gap-4 h-full overflow-hidden">
          {/* Left Column - User Info */}
          <div className="col-span-3 space-y-2 overflow-y-auto h-full">
            {/* Profile Image */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
              <div className="relative aspect-square">
                {user.profileImage ? (
                  <Image
                    src={user.profileImage}
                    alt={user.displayName}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                    <User className="w-12 h-12 text-gray-400" />
                  </div>
                )}
              </div>
            </div>

            {/* User Info Cards */}
            <div className="bg-white border border-gray-200 rounded-lg p-2 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-900 mb-2 flex items-center gap-1">
                <User className="w-3 h-3" />
                Kişisel Bilgiler
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <Mail className="w-3 h-3 text-gray-500" />
                  <span className="text-gray-700 truncate">{user.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-3 h-3 text-gray-500" />
                  <span className="text-gray-700 truncate">
                    {user.phone || "N/A"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <User className="w-3 h-3 text-gray-500" />
                  <span className="text-gray-700 truncate">
                    {user.gender || "N/A"}
                  </span>
                </div>
                {user.address && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3 h-3 text-gray-500" />
                    <span className="text-gray-700 truncate">
                      {user.address}
                    </span>
                  </div>
                )}
                {user.playPoints !== undefined && (
                  <div className="flex items-center gap-2">
                    <Activity className="w-3 h-3 text-gray-500" />
                    <span className="text-gray-700">
                      {user.playPoints} Puan
                    </span>
                  </div>
                )}
                {user.createdAt && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3 h-3 text-gray-500" />
                    <span className="text-gray-700 text-[10px]">
                      {user.createdAt.toDate().toLocaleDateString("tr-TR")}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Stats */}
            <div className="bg-white border border-gray-200 rounded-lg p-2 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-900 mb-2">Özet</h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Package className="w-3 h-3 text-blue-600" />
                    <span className="text-gray-700">Ürünler</span>
                  </div>
                  <span className="text-gray-900 font-semibold">
                    {products.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Store className="w-3 h-3 text-green-600" />
                    <span className="text-gray-700">Mağazalar</span>
                  </div>
                  <span className="text-gray-900 font-semibold">
                    {shops.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <ShoppingBag className="w-3 h-3 text-purple-600" />
                    <span className="text-gray-700">Siparişler</span>
                  </div>
                  <span className="text-gray-900 font-semibold">
                    {orders.length}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Middle Column - All Fields */}
          <div className="col-span-5 h-full overflow-hidden">
            <AllFieldsDisplay
              user={user}
              onFieldSave={saveIndividualField}
              savingField={savingField}
              setSavingField={setSavingField}
              canEdit={isFullAdmin}
            />
          </div>

          {/* Right Column - Tabs (Products, Shops, Orders) */}
          <div className="col-span-4 h-full overflow-hidden">
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm h-full flex flex-col">
              {/* Tab Headers */}
              <div className="flex items-center border-b border-gray-200 flex-shrink-0">
                <button
                  onClick={() => setActiveTab("products")}
                  className={`flex-1 py-2 px-3 text-xs font-medium transition-colors relative ${
                    activeTab === "products"
                      ? "text-gray-900 bg-gray-50"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <div className="flex items-center justify-center gap-1">
                    <Package className="w-3 h-3" />
                    Ürünler ({products.length})
                  </div>
                  {activeTab === "products" && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                  )}
                </button>

                <button
                  onClick={() => setActiveTab("shops")}
                  className={`flex-1 py-2 px-3 text-xs font-medium transition-colors relative ${
                    activeTab === "shops"
                      ? "text-gray-900 bg-gray-50"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <div className="flex items-center justify-center gap-1">
                    <Store className="w-3 h-3" />
                    Mağazalar ({shops.length})
                  </div>
                  {activeTab === "shops" && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                  )}
                </button>

                <button
                  onClick={() => setActiveTab("orders")}
                  className={`flex-1 py-2 px-3 text-xs font-medium transition-colors relative ${
                    activeTab === "orders"
                      ? "text-gray-900 bg-gray-50"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <div className="flex items-center justify-center gap-1">
                    <ShoppingBag className="w-3 h-3" />
                    Siparişler ({orders.length})
                  </div>
                  {activeTab === "orders" && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                  )}
                </button>
              </div>

              {/* Content Area - Scrollable */}
              <div className="p-3 overflow-y-auto flex-1">
                {/* Products Tab Content */}
                {activeTab === "products" && (
                  <div>
                    {/* Search */}
                    <div className="relative mb-3">
                      <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400" />
                      <input
                        type="text"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        placeholder="Ürün ara..."
                        className="w-full pl-7 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded text-gray-900 text-xs placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    {/* Products List */}
                    {filteredProducts.length > 0 ? (
                      <div className="space-y-2">
                        {filteredProducts.map((product) => (
                          <div
                            key={product.id}
                            onClick={() =>
                              router.push(
                                `/productdetails?productId=${product.id}`
                              )
                            }
                            className="p-2 bg-gray-50 rounded border border-gray-200 hover:bg-gray-100 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <div className="relative w-10 h-10 rounded overflow-hidden flex-shrink-0">
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
                                <div className="flex items-center gap-2 text-[10px] text-gray-600">
                                  <span>
                                    {product.price} {product.currency}
                                  </span>
                                  {product.sold && (
                                    <span className="px-1 py-0.5 bg-red-100 text-red-700 rounded">
                                      Satıldı
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
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

                {/* Shops Tab Content */}
                {activeTab === "shops" && (
                  <div>
                    {/* Search */}
                    <div className="relative mb-3">
                      <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400" />
                      <input
                        type="text"
                        value={shopSearch}
                        onChange={(e) => setShopSearch(e.target.value)}
                        placeholder="Mağaza ara..."
                        className="w-full pl-7 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded text-gray-900 text-xs placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    {/* Shops List */}
                    {filteredShops.length > 0 ? (
                      <div className="space-y-2">
                        {filteredShops.map((shop) => (
                          <div
                            key={shop.id}
                            onClick={() =>
                              router.push(`/shopdetails?shopId=${shop.id}`)
                            }
                            className="p-2 bg-gray-50 rounded border border-gray-200 hover:bg-gray-100 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                                {shop.profileImageUrl ? (
                                  <Image
                                    src={shop.profileImageUrl}
                                    alt={shop.name}
                                    fill
                                    className="object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                                    <Store className="w-4 h-4 text-gray-400" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-gray-900 text-xs truncate">
                                  {shop.name}
                                </h4>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <Store className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-600 text-xs">
                          Mağaza bulunamadı
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Orders Tab Content */}
                {activeTab === "orders" && (
                  <div>
                    {/* Search */}
                    <div className="relative mb-3">
                      <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400" />
                      <input
                        type="text"
                        value={orderSearch}
                        onChange={(e) => setOrderSearch(e.target.value)}
                        placeholder="Sipariş ara..."
                        className="w-full pl-7 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded text-gray-900 text-xs placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    {/* Orders List */}
                    {filteredOrders.length > 0 ? (
                      <div className="space-y-2">
                        {filteredOrders.map((order) => (
                          <div
                            key={order.id}
                            className="p-2 bg-gray-50 rounded border border-gray-200"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-mono text-gray-600">
                                #{order.id.substring(0, 8)}
                              </span>
                              <span className="text-xs text-gray-900 font-semibold">
                                {order.totalPrice} TL
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-gray-600">
                              <span>
                                {order.timestamp
                                  .toDate()
                                  .toLocaleDateString("tr-TR")}
                              </span>
                              <span>{order.itemCount} ürün</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <ShoppingBag className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-600 text-xs">
                          Sipariş bulunamadı
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
export default function UserDetails() {
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
        <UserDetailsContent />
      </Suspense>
    </ProtectedRoute>
  );
}
