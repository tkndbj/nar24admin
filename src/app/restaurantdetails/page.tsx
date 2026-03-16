"use client";

import React from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  ArrowLeft,
  UtensilsCrossed,
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
  Database,
  Copy,
  Edit,
  Check,
  X,
  Clock,
  Globe,
  CalendarDays,
  DollarSign,
  UserMinus,
  UserPlus,
  Shield,
  Eye,
  PenLine,
  CheckCircle,
  XCircle,
  FileText,
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
import { db, functions } from "../lib/firebase";
import { httpsCallable } from "firebase/functions";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { toast } from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface MinOrderPrice {
  mainRegion: string;
  subregion: string;
  minOrderPrice: number;
}

interface WorkingHours {
  open: string;
  close: string;
}

interface RestaurantData {
  id: string;
  name: string;
  ownerId: string;
  coOwners?: string[];
  editors?: string[];
  viewers?: string[];
  profileImageUrl?: string;
  taxPlateCertificateUrl?: string;
  address?: string;
  contactNo?: string;
  businessType?: string;
  foodType?: string[];
  cuisineTypes?: string[];
  workingDays?: string[];
  workingHours?: WorkingHours;
  minOrderPrices?: MinOrderPrice[];
  averageRating?: number;
  reviewCount?: number;
  followerCount?: number;
  clickCount?: number;
  isActive?: boolean;
  isBoosted?: boolean;
  latitude?: number;
  longitude?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

interface MenuItemData {
    id: string;
    name: string;
    description?: string;
    price: number;
    imageUrl: string;        // single string, not an array
    isAvailable: boolean;
    restaurantId: string;
    foodCategory?: string;
    foodType?: string;
    preparationTime?: number;
    extras?: { name: string; price: number }[];
    createdAt?: Timestamp;
  }

interface ReviewData {
  id: string;
  rating: number;
  review: string;
  userId: string;
  timestamp: Timestamp;
}

interface UserData {
  id: string;
  displayName: string;
  email: string;
  profileImage?: string;
}

type ViewMode    = "grid" | "list";
type FilterStatus = "all" | "available" | "unavailable";
type SortBy      = "newest" | "oldest" | "price_high" | "price_low";
type TabType     = "menu" | "reviews" | "members";
type InviteRole  = "co-owner" | "editor" | "viewer";

// ─── Constants ─────────────────────────────────────────────────────────────────

const DAY_LABELS: Record<string, string> = {
  Monday:    "Pzt",
  Tuesday:   "Sal",
  Wednesday: "Çar",
  Thursday:  "Per",
  Friday:    "Cum",
  Saturday:  "Cmt",
  Sunday:    "Paz",
};

const ROLE_META: Record<
  string,
  { label: string; color: string; icon: React.ReactNode }
> = {
  owner: {
    label: "Sahip",
    color: "bg-amber-50 text-amber-700 border-amber-200",
    icon: <Shield className="w-3 h-3" />,
  },
  "co-owner": {
    label: "Ortak Sahip",
    color: "bg-purple-50 text-purple-700 border-purple-200",
    icon: <Shield className="w-3 h-3" />,
  },
  editor: {
    label: "Editör",
    color: "bg-blue-50 text-blue-700 border-blue-200",
    icon: <PenLine className="w-3 h-3" />,
  },
  viewer: {
    label: "İzleyici",
    color: "bg-gray-100 text-gray-600 border-gray-200",
    icon: <Eye className="w-3 h-3" />,
  },
};

// ─── AllFieldsDisplay ───────────────────────────────────────────────────────

interface AllFieldsDisplayProps {
  restaurant: RestaurantData;
  onFieldSave: (
    field: string,
    value: string | number | boolean | string[]
  ) => Promise<void>;
  savingField: string | null;
  setSavingField: (field: string | null) => void;
  canEdit: boolean;
}

function AllFieldsDisplay({
  restaurant,
  onFieldSave,
  savingField,
  setSavingField,
  canEdit,
}: AllFieldsDisplayProps) {
  const containerRef                    = useRef<HTMLDivElement | null>(null);
  const [searchTerm, setSearchTerm]     = useState("");
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue]       = useState<string>("");

  const NON_EDITABLE = new Set([
    "id", "createdAt", "updatedAt", "ownerId",
    "averageRating", "reviewCount", "clickCount", "followerCount",
  ]);

  const formatFieldValue = (value: unknown): { display: string; type: string } => {
    if (value === null)      return { display: "null",      type: "null" };
    if (value === undefined) return { display: "undefined", type: "undefined" };
    const t = typeof value;
    if (t === "string")  return { display: value as string, type: "string" };
    if (t === "number")  return { display: String(value),   type: "number" };
    if (t === "boolean") return { display: String(value),   type: "boolean" };
    if (t === "object") {
      if (value instanceof Date)
        return { display: value.toLocaleString("tr-TR"), type: "date" };
      if (typeof (value as { toDate?: unknown }).toDate === "function")
        return {
          display: (value as { toDate: () => Date }).toDate().toLocaleString("tr-TR"),
          type: "timestamp",
        };
      if (Array.isArray(value))
        return { display: JSON.stringify(value), type: "array" };
      return { display: JSON.stringify(value), type: "object" };
    }
    return { display: String(value), type: t };
  };

  const TYPE_COLORS: Record<string, string> = {
    string:    "text-green-600",
    number:    "text-blue-600",
    boolean:   "text-purple-600",
    timestamp: "text-orange-600",
    date:      "text-orange-600",
    array:     "text-pink-600",
    object:    "text-indigo-600",
  };

  const allFields = useMemo(() => {
    const data = { ...restaurant } as Record<string, unknown>;
    return Object.keys(data)
      .map((key) => {
        const value = data[key];
        const { type } = formatFieldValue(value);
        return { key, value, type, editable: !NON_EDITABLE.has(key) };
      })
      .sort((a, b) => a.key.localeCompare(b.key));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant]);

  const filteredFields = useMemo(() => {
    if (!searchTerm.trim()) return allFields;
    const lower = searchTerm.toLowerCase();
    return allFields.filter(
      (f) =>
        f.key.toLowerCase().includes(lower) ||
        formatFieldValue(f.value).display.toLowerCase().includes(lower)
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allFields, searchTerm]);

  const startEditing = (key: string, value: unknown) => {
    setEditingField(key);
    setEditValue(formatFieldValue(value).display);
  };

  const cancelEditing = () => {
    setEditingField(null);
    setEditValue("");
  };

  const saveField = async (key: string, type: string) => {
    try {
      setSavingField(key);
      let converted: string | number | boolean | string[] = editValue;

      switch (type) {
        case "number": {
          const n = Number(editValue);
          if (editValue !== "" && isNaN(n)) { toast.error("Geçersiz sayı formatı"); return; }
          converted = editValue === "" ? 0 : n;
          break;
        }
        case "boolean":
          converted = editValue.toLowerCase() === "true";
          break;
        case "array":
          try {
            const parsed = JSON.parse(editValue);
            converted = Array.isArray(parsed) ? parsed : [editValue];
          } catch { toast.error("Geçersiz JSON array formatı"); return; }
          break;
        case "object":
          try { converted = JSON.parse(editValue); }
          catch { toast.error("Geçersiz JSON object formatı"); return; }
          break;
        default:
          converted = editValue;
      }

      await onFieldSave(key, converted);
      cancelEditing();
    } catch (error) {
      console.error("Error saving field:", error);
      toast.error(`${key} güncellenirken hata oluştu`);
    } finally {
      setSavingField(null);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm h-full flex flex-col">
      <div className="p-3 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <Database className="w-4 h-4 text-orange-600" />
          <h3 className="text-sm font-semibold text-gray-900">Tüm Restoran Alanları</h3>
          <span className="text-xs text-gray-500">({filteredFields.length})</span>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Alan ara..."
            className="w-full pl-7 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded text-gray-900 text-xs placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
          />
        </div>
      </div>

      <div ref={containerRef} className="p-2 space-y-1 overflow-y-auto flex-1">
        {filteredFields.map((field) => {
          const { display, type } = formatFieldValue(field.value);
          const isEditing     = editingField === field.key;
          const isSaving      = savingField === field.key;
          const canEditField  = canEdit && field.editable && type !== "timestamp";

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
                    <span className={`text-[9px] px-1 py-0.5 rounded font-medium bg-white ${TYPE_COLORS[type] ?? "text-gray-900"}`}>
                      {type}
                    </span>
                  </div>

                  {isEditing && canEdit ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter")  saveField(field.key, type);
                          if (e.key === "Escape") cancelEditing();
                        }}
                        className="flex-1 px-2 py-1 text-xs bg-white border border-orange-500 rounded focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                      <button
                        onClick={() => saveField(field.key, type)}
                        disabled={isSaving}
                        className="p-1 bg-green-600 hover:bg-green-700 text-white rounded transition-colors disabled:opacity-50"
                      >
                        {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
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
                                ? `[${Array.isArray(field.value) ? field.value.length : 0}]`
                                : `{${field.value && typeof field.value === "object" ? Object.keys(field.value as object).length : 0}}`}
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
                        {canEditField && (
                          <button
                            onClick={() => startEditing(field.key, field.value)}
                            title="Düzenle"
                            className="p-0.5 hover:bg-gray-200 rounded transition-colors"
                          >
                            <Edit className="w-3 h-3 text-orange-600" />
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
                          title="Kopyala"
                          className="p-0.5 hover:bg-gray-200 rounded transition-colors"
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

        {filteredFields.length === 0 && (
          <div className="text-center py-6">
            <Search className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-600 text-xs">Alan bulunamadı</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page content ───────────────────────────────────────────────────────

function RestaurantDetailsContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const restaurantId = searchParams.get("restaurantId");
  const { user: authUser } = useAuth();

  const isFullAdmin = authUser?.isAdmin === true && !authUser?.isSemiAdmin;

  // ── Core data ──────────────────────────────────────────────────────────────
  const [restaurant, setRestaurant] = useState<RestaurantData | null>(null);
  const [menuItems, setMenuItems]   = useState<MenuItemData[]>([]);
  const [reviews, setReviews]       = useState<ReviewData[]>([]);
  const [members, setMembers]       = useState<{
    owner?: UserData;
    coOwners: UserData[];
    editors:  UserData[];
    viewers:  UserData[];
  }>({ coOwners: [], editors: [], viewers: [] });

  // ── UI state ───────────────────────────────────────────────────────────────
  const [loading, setLoading]         = useState(true);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [activeTab, setActiveTab]     = useState<TabType>("menu");

  // Menu tab
  const [menuSearch, setMenuSearch]       = useState("");
  const [menuViewMode, setMenuViewMode]   = useState<ViewMode>("grid");
  const [menuFilter, setMenuFilter]       = useState<FilterStatus>("all");
  const [menuSort, setMenuSort]           = useState<SortBy>("newest");

  // Members tab
  const [revokingId, setRevokingId]         = useState<string | null>(null);
  const [inviteEmail, setInviteEmail]       = useState("");
  const [inviteRole, setInviteRole]         = useState<InviteRole>("editor");
  const [sendingInvite, setSendingInvite]   = useState(false);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const fetchUsersByIds = useCallback(async (ids: string[]): Promise<UserData[]> => {
    if (!ids?.length) return [];
    const snaps = await Promise.all(ids.map((id) => getDoc(doc(db, "users", id))));
    return snaps
      .filter((s) => s.exists())
      .map((s) => ({ id: s.id, ...s.data() } as UserData));
  }, []);

  // ── Fetch restaurant data ──────────────────────────────────────────────────

  const fetchRestaurantData = useCallback(async () => {
    if (!restaurantId) {
      toast.error("Restoran ID'si bulunamadı");
      router.push("/dashboard");
      return;
    }

    try {
      setLoading(true);

      const restaurantDoc = await getDoc(doc(db, "restaurants", restaurantId));
      if (!restaurantDoc.exists()) {
        toast.error("Restoran bulunamadı");
        router.push("/dashboard");
        return;
      }
      const restaurantData = { id: restaurantDoc.id, ...restaurantDoc.data() } as RestaurantData;
      setRestaurant(restaurantData);

      // Menu items (limit 50)
      const menuSnap = await getDocs(
        query(
          collection(db, "foods"),
          where("restaurantId", "==", restaurantId),
          firestoreOrderBy("createdAt", "desc"),
          limit(50)
        )
      );
      setMenuItems(
        menuSnap.docs.map((d) => ({ id: d.id, ...d.data() } as MenuItemData))
      );

      // Reviews (limit 30)
      const reviewsSnap = await getDocs(
        query(
          collection(db, "restaurants", restaurantId, "reviews"),
          firestoreOrderBy("timestamp", "desc"),
          limit(30)
        )
      );
      setReviews(
        reviewsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as ReviewData))
      );

      // Members — all in parallel
      const [ownerSnap, coOwners, editors, viewers] = await Promise.all([
        restaurantData.ownerId
          ? getDoc(doc(db, "users", restaurantData.ownerId))
          : Promise.resolve(null),
        fetchUsersByIds(restaurantData.coOwners ?? []),
        fetchUsersByIds(restaurantData.editors  ?? []),
        fetchUsersByIds(restaurantData.viewers  ?? []),
      ]);

      setMembers({
        owner: ownerSnap?.exists()
          ? ({ id: ownerSnap.id, ...ownerSnap.data() } as UserData)
          : undefined,
        coOwners,
        editors,
        viewers,
      });
    } catch (error) {
      console.error("Error fetching restaurant data:", error);
      toast.error("Restoran bilgileri yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  }, [restaurantId, router, fetchUsersByIds]);

  useEffect(() => {
    fetchRestaurantData();
  }, [fetchRestaurantData]);

  // ── Field save ─────────────────────────────────────────────────────────────

  const saveIndividualField = async (
    field: string,
    value: string | number | boolean | string[]
  ) => {
    if (!restaurant) return;
    try {
      setSavingField(field);
      await updateDoc(doc(db, "restaurants", restaurant.id), {
        [field]: value,
        updatedAt: Timestamp.now(),
      });
      setRestaurant((prev) => (prev ? { ...prev, [field]: value } : null));
      toast.success(`${field} güncellendi!`);
    } catch (error) {
      console.error("Error updating field:", error);
      toast.error(`${field} güncellenirken hata oluştu`);
    } finally {
      setSavingField(null);
    }
  };

  // ── Members: revoke ────────────────────────────────────────────────────────

  const handleRevokeAccess = async (targetUserId: string, role: InviteRole) => {
    if (!restaurant) return;
    if (
      !confirm(`Bu üyenin (${role}) erişimini iptal etmek istediğinizden emin misiniz?`)
    )
      return;

    setRevokingId(targetUserId);
    try {
      const revokeShopAccessFn = httpsCallable(functions, "revokeShopAccess");
      await revokeShopAccessFn({
        targetUserId,
        shopId: restaurant.id,
        role,
        businessType: "restaurant",
      });

      setMembers((prev) => ({
        ...prev,
        coOwners: prev.coOwners.filter((u) => u.id !== targetUserId),
        editors:  prev.editors.filter((u)  => u.id !== targetUserId),
        viewers:  prev.viewers.filter((u)  => u.id !== targetUserId),
      }));

      toast.success("Üye erişimi başarıyla iptal edildi.");
    } catch (error: unknown) {
      console.error("Revoke failed:", error);
      toast.error((error as { message?: string })?.message ?? "Erişim iptal edilirken hata oluştu.");
    } finally {
      setRevokingId(null);
    }
  };

  // ── Members: invite ────────────────────────────────────────────────────────

  const handleSendInvite = async () => {
    if (!restaurant || !inviteEmail.trim()) return;

    setSendingInvite(true);
    try {
      const sendShopInvitationFn = httpsCallable(functions, "sendShopInvitation");
      await sendShopInvitationFn({
        shopId: restaurant.id,
        inviteeEmail: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        businessType: "restaurant",
      });
      toast.success(`Davet gönderildi: ${inviteEmail.trim()}`);
      setInviteEmail("");
    } catch (error: unknown) {
      console.error("Invite failed:", error);
      toast.error((error as { message?: string })?.message ?? "Davet gönderilemedi.");
    } finally {
      setSendingInvite(false);
    }
  };

  // ── Filtered menu items ────────────────────────────────────────────────────

  const filteredMenuItems = useMemo(() => {
    let result = [...menuItems];

    if (menuSearch.trim()) {
      const lower = menuSearch.toLowerCase();
      result = result.filter((item) => item.name.toLowerCase().includes(lower));
    }

    if (menuFilter === "available")   result = result.filter((i) =>  i.isAvailable);
    if (menuFilter === "unavailable") result = result.filter((i) => !i.isAvailable);

    if (menuSort === "price_high") result.sort((a, b) => b.price - a.price);
    if (menuSort === "price_low")  result.sort((a, b) => a.price - b.price);
    if (menuSort === "oldest")     result.reverse();

    return result;
  }, [menuItems, menuSearch, menuFilter, menuSort]);

  // ── Loading / not found ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-900">
          <Loader2 className="w-6 h-6 animate-spin text-orange-600" />
          <span>Restoran bilgileri yükleniyor...</span>
        </div>
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2 text-gray-900">Restoran Bulunamadı</h2>
          <p className="text-gray-600">Aradığınız restoran mevcut değil.</p>
        </div>
      </div>
    );
  }

  const totalNonOwnerMembers =
    members.coOwners.length + members.editors.length + members.viewers.length;

  const allDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50">

      {/* Header */}
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
              <h1 className="text-sm font-bold text-gray-900 truncate">{restaurant.name}</h1>
              <p className="text-xs text-gray-600 truncate">
                {restaurant.address || "Adres belirtilmemiş"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {restaurant.isActive !== undefined && (
                <span
                  className={`inline-flex items-center gap-0.5 px-2 py-1 text-xs font-semibold rounded ${
                    restaurant.isActive
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {restaurant.isActive ? (
                    <CheckCircle className="w-3 h-3" />
                  ) : (
                    <XCircle className="w-3 h-3" />
                  )}
                  {restaurant.isActive ? "Aktif" : "Pasif"}
                </span>
              )}
              {restaurant.isBoosted && (
                <span className="inline-flex items-center gap-0.5 px-2 py-1 bg-purple-100 text-purple-700 text-xs font-semibold rounded">
                  <Zap className="w-3 h-3" />
                  BOOST
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1800px] mx-auto px-4 py-4 h-screen overflow-hidden">
        <div className="grid grid-cols-12 gap-4 h-full overflow-hidden">

          {/* ── Left column: restaurant info ───────────────────────────────── */}
          <div className="col-span-3 space-y-2 overflow-y-auto h-full pb-4">

            {/* Profile image */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
              <div className="relative aspect-square">
                {restaurant.profileImageUrl ? (
                  <Image
                    src={restaurant.profileImageUrl}
                    alt={restaurant.name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                    <UtensilsCrossed className="w-12 h-12 text-gray-400" />
                  </div>
                )}
              </div>
            </div>

            {/* Basic info */}
            <div className="bg-white border border-gray-200 rounded-lg p-2.5 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-900 mb-2 flex items-center gap-1">
                <UtensilsCrossed className="w-3 h-3 text-orange-600" />
                Restoran Bilgileri
              </h3>
              <div className="space-y-1.5 text-xs">
                {restaurant.address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3 h-3 text-gray-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">{restaurant.address}</span>
                  </div>
                )}
                {restaurant.contactNo && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3 h-3 text-gray-500 flex-shrink-0" />
                    <span className="text-gray-700">{restaurant.contactNo}</span>
                  </div>
                )}
                {restaurant.averageRating !== undefined && (
                  <div className="flex items-center gap-2">
                    <Star className="w-3 h-3 text-yellow-500 flex-shrink-0" />
                    <span className="text-gray-700">
                      {restaurant.averageRating.toFixed(1)} ({restaurant.reviewCount ?? 0} yorum)
                    </span>
                  </div>
                )}
                {restaurant.createdAt && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3 h-3 text-gray-500 flex-shrink-0" />
                    <span className="text-gray-700 text-[10px]">
                      {restaurant.createdAt.toDate().toLocaleDateString("tr-TR")}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Working schedule */}
            <div className="bg-white border border-gray-200 rounded-lg p-2.5 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-900 mb-2 flex items-center gap-1">
                <CalendarDays className="w-3 h-3 text-orange-600" />
                Çalışma Saatleri
              </h3>

              {/* Hours */}
              {restaurant.workingHours && (
                <div className="flex items-center gap-1.5 mb-2 text-xs text-gray-700">
                  <Clock className="w-3 h-3 text-gray-500 flex-shrink-0" />
                  <span>
                    {restaurant.workingHours.open} – {restaurant.workingHours.close}
                  </span>
                </div>
              )}

              {/* Days grid */}
              {restaurant.workingDays && restaurant.workingDays.length > 0 && (
                <div className="grid grid-cols-7 gap-0.5">
                  {allDays.map((day) => {
                    const active = restaurant.workingDays!.includes(day);
                    return (
                      <div
                        key={day}
                        className={`flex items-center justify-center py-1 rounded text-[9px] font-bold ${
                          active
                            ? "bg-orange-100 text-orange-700 border border-orange-200"
                            : "bg-gray-100 text-gray-400 border border-gray-200"
                        }`}
                      >
                        {DAY_LABELS[day]}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Cuisine types */}
            {restaurant.cuisineTypes && restaurant.cuisineTypes.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-2.5 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-900 mb-2 flex items-center gap-1">
                  <Globe className="w-3 h-3 text-orange-600" />
                  Mutfak Türleri
                </h3>
                <div className="flex flex-wrap gap-1">
                  {restaurant.cuisineTypes.map((c, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-1.5 py-0.5 bg-orange-50 border border-orange-200 text-orange-700 rounded-full"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Food types */}
            {restaurant.foodType && restaurant.foodType.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-2.5 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-900 mb-2 flex items-center gap-1">
                  <UtensilsCrossed className="w-3 h-3 text-orange-600" />
                  Yemek Türleri
                </h3>
                <div className="flex flex-wrap gap-1">
                  {restaurant.foodType.map((f, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-full"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Min order prices */}
            {restaurant.minOrderPrices && restaurant.minOrderPrices.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-2.5 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-900 mb-2 flex items-center gap-1">
                  <DollarSign className="w-3 h-3 text-orange-600" />
                  Min. Sipariş Fiyatları
                </h3>
                <div className="space-y-1">
                  {restaurant.minOrderPrices.map((entry, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-2 py-1.5 bg-emerald-50 border border-emerald-100 rounded-lg"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                          {entry.mainRegion}
                        </span>
                        <span className="text-[10px] text-gray-700 truncate">
                          {entry.subregion}
                        </span>
                      </div>
                      <span className="text-[11px] font-semibold text-gray-900 ml-2 flex-shrink-0">
                        {entry.minOrderPrice} TL
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tax certificate */}
            {restaurant.taxPlateCertificateUrl && (
              <div className="bg-white border border-gray-200 rounded-lg p-2.5 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-900 mb-2 flex items-center gap-1">
                  <FileText className="w-3 h-3 text-orange-600" />
                  Vergi Levhası
                </h3>
                <a
                  href={restaurant.taxPlateCertificateUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <div className="relative w-full h-28 rounded-lg overflow-hidden border border-gray-200 hover:opacity-90 transition-opacity">
                    <Image
                      src={restaurant.taxPlateCertificateUrl}
                      alt="Vergi Levhası"
                      fill
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors flex items-end">
                      <span className="w-full text-center text-[10px] text-white bg-black/40 py-1">
                        Büyütmek için tıkla
                      </span>
                    </div>
                  </div>
                </a>
              </div>
            )}

            {/* Owner */}
            {members.owner && (
              <div className="bg-white border border-gray-200 rounded-lg p-2.5 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-900 mb-2 flex items-center gap-1">
                  <User className="w-3 h-3" />
                  Restoran Sahibi
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
                    <p className="font-semibold text-gray-900 text-xs truncate">
                      {members.owner.displayName}
                    </p>
                    <p className="text-[10px] text-gray-600 truncate">
                      {members.owner.email}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Middle column: all fields ──────────────────────────────────── */}
          <div className="col-span-5 h-full overflow-hidden">
            <AllFieldsDisplay
              restaurant={restaurant}
              onFieldSave={saveIndividualField}
              savingField={savingField}
              setSavingField={setSavingField}
              canEdit={isFullAdmin}
            />
          </div>

          {/* ── Right column: tabs ─────────────────────────────────────────── */}
          <div className="col-span-4 h-full overflow-hidden">
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm h-full flex flex-col">

              {/* Tab headers */}
              <div className="flex items-center border-b border-gray-200 flex-shrink-0">
                {(
                  [
                    { key: "menu",    label: "Menü",    icon: <Package className="w-3 h-3" /> },
                    { key: "reviews", label: "Yorumlar", icon: <Star className="w-3 h-3" /> },
                    { key: "members", label: "Üyeler",  icon: <User className="w-3 h-3" />, badge: totalNonOwnerMembers },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key as TabType)}
                    className={`flex-1 py-2 px-2 text-xs font-medium transition-colors relative whitespace-nowrap ${
                      activeTab === tab.key
                        ? "text-gray-900 bg-gray-50"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      {tab.icon}
                      {tab.label}
                      {"badge" in tab && tab.badge > 0 && (
                        <span className="ml-0.5 min-w-[16px] h-4 px-1 bg-orange-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                          {tab.badge}
                        </span>
                      )}
                    </div>
                    {activeTab === tab.key && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600" />
                    )}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="p-3 overflow-y-auto flex-1">

                {/* ── Menu ── */}
                {activeTab === "menu" && (
                  <div>
                    <div className="space-y-2 mb-3">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                        <input
                          type="text"
                          value={menuSearch}
                          onChange={(e) => setMenuSearch(e.target.value)}
                          placeholder="Ürün ara..."
                          className="w-full pl-7 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded text-gray-900 text-xs placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={menuFilter}
                          onChange={(e) => setMenuFilter(e.target.value as FilterStatus)}
                          className="flex-1 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
                        >
                          <option value="all">Tüm Ürünler</option>
                          <option value="available">Mevcut</option>
                          <option value="unavailable">Mevcut Değil</option>
                        </select>
                        <select
                          value={menuSort}
                          onChange={(e) => setMenuSort(e.target.value as SortBy)}
                          className="flex-1 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
                        >
                          <option value="newest">En Yeni</option>
                          <option value="oldest">En Eski</option>
                          <option value="price_high">Fiyat ↓</option>
                          <option value="price_low">Fiyat ↑</option>
                        </select>
                        <div className="flex items-center bg-gray-100 rounded p-0.5">
                          <button
                            onClick={() => setMenuViewMode("grid")}
                            className={`p-1 rounded transition-colors ${menuViewMode === "grid" ? "bg-white text-gray-900" : "text-gray-400"}`}
                          >
                            <Grid3x3 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setMenuViewMode("list")}
                            className={`p-1 rounded transition-colors ${menuViewMode === "list" ? "bg-white text-gray-900" : "text-gray-400"}`}
                          >
                            <List className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {filteredMenuItems.length > 0 ? (
                      <div
                        className={`grid gap-2 ${
                          menuViewMode === "grid" ? "grid-cols-2" : "grid-cols-1"
                        }`}
                      >
                        {filteredMenuItems.map((item) => (
                          <div
                            key={item.id}
                            className={`bg-gray-50 rounded border overflow-hidden transition-colors ${
                              item.isAvailable
                                ? "border-gray-200 hover:bg-gray-100"
                                : "border-red-100 bg-red-50/30 opacity-70"
                            }`}
                          >
                            {menuViewMode === "grid" ? (
  <div>
    <div className="relative aspect-square">
      {item.imageUrl ? (
        <Image
          src={item.imageUrl}
          alt={item.name}
          fill
          className="object-cover"
        />
      ) : (
        <div className="w-full h-full bg-gray-200 flex items-center justify-center">
          <UtensilsCrossed className="w-6 h-6 text-gray-400" />
        </div>
      )}
      {!item.isAvailable && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
          <span className="text-[9px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded">
            MEVCUT DEĞİL
          </span>
        </div>
      )}
    </div>
    <div className="p-2">
      <h4 className="font-semibold text-gray-900 text-xs truncate">{item.name}</h4>
      <p className="text-[10px] text-gray-600 mt-0.5">{item.price} TL</p>
      {item.foodCategory && (
        <p className="text-[9px] text-orange-600 mt-0.5">{item.foodCategory}</p>
      )}
      {item.preparationTime && (
        <p className="text-[9px] text-gray-400 mt-0.5">{item.preparationTime} dk</p>
      )}
    </div>
  </div>
) : (
                              <div className="flex items-center gap-2 p-2">
                                <div className="relative w-12 h-12 rounded overflow-hidden flex-shrink-0">
                                  {item.imageUrl ? (
                                    <Image
                                      src={item.imageUrl}
                                      alt={item.name}
                                      fill
                                      className="object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                                      <UtensilsCrossed className="w-4 h-4 text-gray-400" />
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1">
                                    <h4 className="font-semibold text-gray-900 text-xs truncate">
                                      {item.name}
                                    </h4>
                                    {!item.isAvailable && (
                                      <span className="text-[9px] font-bold text-red-500 bg-red-50 border border-red-200 px-1 rounded flex-shrink-0">
                                        MEVCUT DEĞİL
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-gray-600">
                                    {item.price} TL
                                  </p>
                                  {item.foodCategory && (
                                    <p className="text-[9px] text-orange-600">{item.foodCategory}</p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <UtensilsCrossed className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-600 text-xs">Menü öğesi bulunamadı</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Reviews ── */}
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
                                {review.timestamp.toDate().toLocaleDateString("tr-TR")}
                              </span>
                            </div>
                            <p className="text-xs text-gray-700">{review.review}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <Star className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-600 text-xs">Yorum bulunamadı</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Members ── */}
                {activeTab === "members" && (
                  <div className="space-y-4">

                    {/* Role groups */}
                    {(
                      [
                        { roleKey: "owner",    label: "Sahip",       users: members.owner ? [members.owner] : [], revokable: false },
                        { roleKey: "co-owner", label: "Ortak Sahip", users: members.coOwners, revokable: true },
                        { roleKey: "editor",   label: "Editör",      users: members.editors,  revokable: true },
                        { roleKey: "viewer",   label: "İzleyici",    users: members.viewers,  revokable: true },
                      ] as const
                    ).map(({ roleKey, label, users, revokable }) => {
                      const meta = ROLE_META[roleKey];
                      return (
                        <div key={roleKey}>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${meta.color}`}>
                              {meta.icon}
                              {label}
                            </span>
                            <span className="text-[10px] text-gray-400">({users.length})</span>
                          </div>

                          {users.length === 0 ? (
                            <p className="text-[11px] text-gray-400 italic pl-1 mb-1">Yok</p>
                          ) : (
                            <div className="space-y-1">
                              {users.map((member) => (
                                <div
                                  key={member.id}
                                  className="flex items-center gap-2 p-2 bg-gray-50 rounded border border-gray-200"
                                >
                                  <div className="relative w-7 h-7 rounded-full overflow-hidden flex-shrink-0">
                                    {member.profileImage ? (
                                      <Image
                                        src={member.profileImage}
                                        alt={member.displayName}
                                        fill
                                        className="object-cover"
                                      />
                                    ) : (
                                      <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                                        <User className="w-3.5 h-3.5 text-gray-400" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-gray-900 truncate">
                                      {member.displayName}
                                    </p>
                                    <p className="text-[10px] text-gray-500 truncate">
                                      {member.email}
                                    </p>
                                  </div>
                                  {revokable && (
                                    <button
                                      onClick={() => handleRevokeAccess(member.id, roleKey)}
                                      disabled={revokingId === member.id}
                                      title="Erişimi iptal et"
                                      className="flex-shrink-0 flex items-center gap-1 px-2 py-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 text-[10px] font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {revokingId === member.id ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <UserMinus className="w-3 h-3" />
                                      )}
                                      İptal
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Invite form */}
                    <div className="border-t border-gray-200 pt-3">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <UserPlus className="w-3 h-3" />
                        Yeni Davet Gönder
                      </p>
                      <div className="space-y-2">
                        <input
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSendInvite();
                          }}
                          placeholder="E-posta adresi..."
                          className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                        />
                        <div className="flex gap-2">
                          <select
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value as InviteRole)}
                            className="flex-1 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
                          >
                            <option value="co-owner">Ortak Sahip</option>
                            <option value="editor">Editör</option>
                            <option value="viewer">İzleyici</option>
                          </select>
                          <button
                            onClick={handleSendInvite}
                            disabled={sendingInvite || !inviteEmail.trim()}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium rounded transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                          >
                            {sendingInvite ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <UserPlus className="w-3 h-3" />
                            )}
                            Davet Et
                          </button>
                        </div>
                      </div>
                    </div>
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

// ─── Export with Suspense ─────────────────────────────────────────────────────

export default function RestaurantDetails() {
  return (
    <ProtectedRoute>
      <Suspense
        fallback={
          <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 flex items-center justify-center">
            <div className="flex items-center gap-3 text-gray-900">
              <Loader2 className="w-6 h-6 animate-spin text-orange-600" />
              <span>Yükleniyor...</span>
            </div>
          </div>
        }
      >
        <RestaurantDetailsContent />
      </Suspense>
    </ProtectedRoute>
  );
}