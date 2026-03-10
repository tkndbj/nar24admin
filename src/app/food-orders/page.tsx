"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Admin › Food Orders  —  /admin/food-orders/page.tsx
//
// • Four status tabs — each tab is lazy-loaded (no DB hit until first click)
// • 30 orders per page with "Load More" cursor pagination
// • "Kuryeleri Yönet" modal — lookup user by email, toggle foodcargoguy field
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  doc,
  updateDoc,
  DocumentData,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/app/lib/firebase";
import {
  UtensilsCrossed,
  ArrowLeft,
  Truck,
  Users,
  Search,
  X,
  CheckCircle,
  Clock,
  Package,
  MapPin,
  Phone,
  CreditCard,
  ChefHat,
  Loader2,
  UserCheck,
  UserX,
  RefreshCw,
  AlertCircle,
  ChevronDown,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface DeliveryAddress {
  addressLine1: string;
  addressLine2?: string;
  city?: string;
  mainRegion?: string;
  phoneNumber?: string;
}

interface OrderItem {
  foodId: string;
  name: string;
  quantity: number;
  price: number;
  itemTotal: number;
  extras?: { name: string; quantity: number; price: number }[];
  specialNotes?: string;
}

interface FoodOrder {
  id: string;
  buyerName: string;
  buyerPhone?: string;
  restaurantName: string;
  restaurantPhone?: string;
  restaurantProfileImage?: string;
  items: OrderItem[];
  itemCount: number;
  subtotal: number;
  deliveryFee: number;
  totalPrice: number;
  currency: string;
  paymentMethod: "pay_at_door" | "card";
  isPaid: boolean;
  deliveryType: "delivery" | "pickup";
  deliveryAddress?: DeliveryAddress;
  orderNotes?: string;
  estimatedPrepTime?: number;
  status: string;
  cargoName?: string;
  cargoUserId?: string;
  createdAt: { toDate: () => Date } | null;
  updatedAt: { toDate: () => Date } | null;
}

interface TabState {
  orders: FoodOrder[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  initialized: boolean;
  error: string | null;
}

interface CargoUser {
  id: string;
  displayName?: string;
  name?: string;
  email?: string;
  phoneNumber?: string;
  foodcargoguy?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30;

// Status groups per tab
const TAB_STATUSES: Record<string, string[]> = {
  pending: ["pending"],
  accepted: ["accepted", "preparing"],
  ready: ["ready", "out_for_delivery"],
  delivered: ["delivered"],
};

const TABS = [
  { key: "pending", label: "Beklemede", icon: Clock, color: "yellow" },
  { key: "accepted", label: "Kabul Edildi", icon: ChefHat, color: "blue" },
  { key: "ready", label: "Yolda", icon: Truck, color: "orange" },
  {
    key: "delivered",
    label: "Teslim Edildi",
    icon: CheckCircle,
    color: "green",
  },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const INITIAL_TAB_STATE: TabState = {
  orders: [],
  lastDoc: null,
  hasMore: true,
  loading: false,
  loadingMore: false,
  initialized: false,
  error: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function docToOrder(d: QueryDocumentSnapshot<DocumentData>): FoodOrder {
  return { id: d.id, ...(d.data() as Omit<FoodOrder, "id">) };
}

function formatDate(ts: FoodOrder["createdAt"]): string {
  if (!ts) return "—";
  const d = ts.toDate();
  return d.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPhone(phone?: string) {
  if (!phone) return null;
  const clean = phone.replace(/\s/g, "");
  return (
    <a
      href={`tel:${clean}`}
      className="text-blue-600 hover:underline flex items-center gap-1"
    >
      <Phone className="w-3 h-3" /> {phone}
    </a>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Status badge
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  pending: { label: "Beklemede", className: "bg-yellow-100 text-yellow-800" },
  accepted: { label: "Kabul Edildi", className: "bg-blue-100   text-blue-800" },
  preparing: {
    label: "Hazırlanıyor",
    className: "bg-indigo-100 text-indigo-800",
  },
  ready: { label: "Hazır", className: "bg-orange-100 text-orange-800" },
  out_for_delivery: {
    label: "Yolda",
    className: "bg-purple-100 text-purple-800",
  },
  delivered: {
    label: "Teslim Edildi",
    className: "bg-green-100  text-green-800",
  },
  rejected: { label: "Reddedildi", className: "bg-red-100    text-red-800" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_MAP[status] ?? {
    label: status,
    className: "bg-gray-100 text-gray-700",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Order Card
// ─────────────────────────────────────────────────────────────────────────────

function OrderCard({ order }: { order: FoodOrder }) {
  const [expanded, setExpanded] = useState(false);

  const addr = order.deliveryAddress;
  const addressLine = addr
    ? [addr.addressLine1, addr.addressLine2, addr.city, addr.mainRegion]
        .filter(Boolean)
        .join(", ")
    : null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
      {/* Header row */}
      <div
        className="flex items-start justify-between px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Restaurant avatar */}
          <div className="w-9 h-9 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {order.restaurantProfileImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={order.restaurantProfileImage}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <UtensilsCrossed className="w-4 h-4 text-orange-400" />
            )}
          </div>

          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {order.restaurantName}
            </p>
            <p className="text-xs text-gray-500 font-mono">
              #{order.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          <StatusBadge status={order.status} />
          <ChevronDown
            className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </div>

      {/* Compact info row */}
      <div className="px-4 pb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-600 border-b border-gray-100">
        <span className="flex items-center gap-1">
          <Users className="w-3 h-3 text-gray-400" />
          {order.buyerName}
        </span>
        <span className="flex items-center gap-1">
          <Package className="w-3 h-3 text-gray-400" />
          {order.itemCount} ürün
        </span>
        <span className="flex items-center gap-1 font-medium text-gray-800">
          {order.totalPrice} {order.currency}
          {" · "}
          <span className={order.isPaid ? "text-green-600" : "text-orange-600"}>
            {order.isPaid ? "Ödendi" : "Kapıda Öde"}
          </span>
        </span>
        {order.deliveryType === "pickup" && (
          <span className="text-purple-600 font-medium">Gel-Al</span>
        )}
        {order.cargoName && (
          <span className="flex items-center gap-1 text-indigo-600">
            <Truck className="w-3 h-3" /> {order.cargoName}
          </span>
        )}
        <span className="text-gray-400 ml-auto">
          {formatDate(order.createdAt)}
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 py-3 space-y-3 bg-gray-50/60 text-sm">
          {/* Customer */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-gray-100 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-500 mb-1">Müşteri</p>
              <p className="font-semibold text-gray-900">{order.buyerName}</p>
              {formatPhone(
                order.buyerPhone ?? order.deliveryAddress?.phoneNumber,
              )}
            </div>
            <div className="bg-white border border-gray-100 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-500 mb-1">Restoran</p>
              <p className="font-semibold text-gray-900">
                {order.restaurantName}
              </p>
              {formatPhone(order.restaurantPhone)}
            </div>
          </div>

          {/* Delivery address */}
          {addressLine && (
            <div className="bg-white border border-gray-100 rounded-lg p-3 flex gap-2">
              <MapPin className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-gray-500 mb-0.5">
                  Teslimat Adresi
                </p>
                <p className="text-gray-800">{addressLine}</p>
              </div>
            </div>
          )}

          {/* Items */}
          <div className="bg-white border border-gray-100 rounded-lg overflow-hidden">
            <p className="text-xs font-medium text-gray-500 px-3 pt-3 pb-2">
              Sipariş İçeriği
            </p>
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-t border-b border-gray-100">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium text-gray-600">
                    Ürün
                  </th>
                  <th className="px-3 py-1.5 text-center font-medium text-gray-600">
                    Adet
                  </th>
                  <th className="px-3 py-1.5 text-right font-medium text-gray-600">
                    Fiyat
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(order.items ?? []).map((item, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-900">{item.name}</p>
                      {item.extras && item.extras.length > 0 && (
                        <p className="text-gray-400 mt-0.5">
                          + {item.extras.map((e) => e.name).join(", ")}
                        </p>
                      )}
                      {item.specialNotes && (
                        <p className="text-orange-500 mt-0.5 italic">
                          Not: {item.specialNotes}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-gray-700">
                      {item.quantity}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">
                      {item.itemTotal} {order.currency}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Totals */}
            <div className="border-t border-gray-100 px-3 py-2 space-y-1">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Ara toplam</span>
                <span>
                  {order.subtotal} {order.currency}
                </span>
              </div>
              {order.deliveryFee > 0 && (
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Teslimat ücreti</span>
                  <span>
                    {order.deliveryFee} {order.currency}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-gray-900 border-t border-gray-100 pt-1">
                <span>Toplam</span>
                <span>
                  {order.totalPrice} {order.currency}
                </span>
              </div>
            </div>
          </div>

          {/* Notes + Payment */}
          <div className="flex flex-wrap gap-3">
            {order.orderNotes && (
              <div className="flex-1 min-w-[180px] bg-amber-50 border border-amber-100 rounded-lg p-3">
                <p className="text-xs font-medium text-amber-700 mb-1">
                  Sipariş Notu
                </p>
                <p className="text-amber-900 text-xs">{order.orderNotes}</p>
              </div>
            )}
            <div className="flex items-center gap-3 bg-white border border-gray-100 rounded-lg px-3 py-2 text-xs text-gray-600">
              <CreditCard className="w-4 h-4 text-gray-400" />
              <div>
                <p className="font-medium text-gray-800">
                  {order.paymentMethod === "card"
                    ? "Kredi / Banka Kartı"
                    : "Kapıda Ödeme"}
                </p>
                <p
                  className={
                    order.isPaid ? "text-green-600" : "text-orange-600"
                  }
                >
                  {order.isPaid ? "✓ Ödeme alındı" : "⚠ Kapıda ödenecek"}
                </p>
              </div>
            </div>
            {order.estimatedPrepTime != null && order.estimatedPrepTime > 0 && (
              <div className="flex items-center gap-2 bg-white border border-gray-100 rounded-lg px-3 py-2 text-xs text-gray-600">
                <Clock className="w-4 h-4 text-gray-400" />
                Tahmini hazırlık:{" "}
                <span className="font-medium">
                  {order.estimatedPrepTime} dk
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cargo Manager Modal
// ─────────────────────────────────────────────────────────────────────────────

function CargoManagerModal({ onClose }: { onClose: () => void }) {
  const [emailInput, setEmailInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [foundUser, setFoundUser] = useState<CargoUser | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // List of current cargo guys
  const [cargoGuys, setCargoGuys] = useState<CargoUser[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // Fetch cargo guys on mount
  const fetchCargoGuys = useCallback(async () => {
    setLoadingList(true);
    try {
      const snap = await getDocs(
        query(collection(db, "users"), where("foodcargoguy", "==", true)),
      );
      setCargoGuys(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<CargoUser, "id">),
        })),
      );
    } catch {
      // silently ignore
    } finally {
      setLoadingList(false);
    }
  }, []);

  // Fetch on mount
  useState(() => {
    fetchCargoGuys();
  });

  const handleSearch = async () => {
    const email = emailInput.trim().toLowerCase();
    if (!email) return;

    setSearching(true);
    setFoundUser(null);
    setSearchError(null);
    setSuccessMsg(null);

    try {
      const snap = await getDocs(
        query(collection(db, "users"), where("email", "==", email), limit(1)),
      );

      if (snap.empty) {
        setSearchError("Bu e-posta adresiyle kayıtlı kullanıcı bulunamadı.");
      } else {
        const d = snap.docs[0];
        setFoundUser({ id: d.id, ...(d.data() as Omit<CargoUser, "id">) });
      }
    } catch {
      setSearchError("Arama sırasında bir hata oluştu.");
    } finally {
      setSearching(false);
    }
  };

  const handleToggle = async (user: CargoUser, makeCargoGuy: boolean) => {
    setSaving(true);
    setSuccessMsg(null);
    try {
      await updateDoc(doc(db, "users", user.id), {
        foodcargoguy: makeCargoGuy,
      });
      setSuccessMsg(
        makeCargoGuy
          ? `${user.displayName ?? user.email} kurye olarak eklendi.`
          : `${user.displayName ?? user.email} kuryelikten çıkarıldı.`,
      );
      setFoundUser(null);
      setEmailInput("");
      await fetchCargoGuys();
    } catch {
      setSearchError("İşlem sırasında bir hata oluştu.");
    } finally {
      setSaving(false);
    }
  };

  const displayName = (u: CargoUser) =>
    u.displayName ?? u.name ?? u.email ?? u.id;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
              <Truck className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">
                Kuryeleri Yönet
              </h3>
              <p className="text-xs text-gray-500">
                Kullanıcıya e-posta ile kurye yetkisi ver
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-indigo-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              E-posta ile kullanıcı ara
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => {
                    setEmailInput(e.target.value);
                    setFoundUser(null);
                    setSearchError(null);
                    setSuccessMsg(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="kullanici@email.com"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={searching || !emailInput.trim()}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {searching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                Ara
              </button>
            </div>

            {/* Error */}
            {searchError && (
              <div className="mt-2 flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {searchError}
              </div>
            )}

            {/* Success */}
            {successMsg && (
              <div className="mt-2 flex items-center gap-2 text-green-700 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                {successMsg}
              </div>
            )}

            {/* Found user */}
            {foundUser && (
              <div className="mt-3 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <Users className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {foundUser.displayName ?? foundUser.name ?? "İsimsiz"}
                    </p>
                    <p className="text-xs text-gray-500">{foundUser.email}</p>
                    {foundUser.foodcargoguy && (
                      <p className="text-xs text-indigo-600 font-medium mt-0.5">
                        ✓ Zaten kurye
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {foundUser.foodcargoguy ? (
                    <button
                      onClick={() => handleToggle(foundUser, false)}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {saving ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <UserX className="w-3 h-3" />
                      )}
                      Kuryelikten Çıkar
                    </button>
                  ) : (
                    <button
                      onClick={() => handleToggle(foundUser, true)}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {saving ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <UserCheck className="w-3 h-3" />
                      )}
                      Kurye Yap
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Current cargo guys */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-800">
                Mevcut Kuryeler ({cargoGuys.length})
              </h4>
              <button
                onClick={fetchCargoGuys}
                disabled={loadingList}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <RefreshCw
                  className={`w-4 h-4 text-gray-500 ${loadingList ? "animate-spin" : ""}`}
                />
              </button>
            </div>

            {loadingList ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
              </div>
            ) : cargoGuys.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-sm bg-gray-50 rounded-lg border border-dashed border-gray-200">
                Henüz kayıtlı kurye yok
              </div>
            ) : (
              <div className="space-y-2">
                {cargoGuys.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <Truck className="w-3.5 h-3.5 text-indigo-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {displayName(u)}
                        </p>
                        {u.email && u.email !== displayName(u) && (
                          <p className="text-xs text-gray-500 truncate">
                            {u.email}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggle(u, false)}
                      className="flex items-center gap-1 px-2.5 py-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-md text-xs font-medium transition-colors flex-shrink-0 ml-2"
                    >
                      <UserX className="w-3 h-3" />
                      Çıkar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab content
// ─────────────────────────────────────────────────────────────────────────────

function TabContent({
  tabKey,
  state,
  onLoadMore,
}: {
  tabKey: TabKey;
  state: TabState;
  onLoadMore: () => void;
}) {
  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-7 h-7 animate-spin text-orange-500" />
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center py-16 text-red-500 gap-2">
        <AlertCircle className="w-5 h-5" />
        <span className="text-sm">{state.error}</span>
      </div>
    );
  }

  if (state.orders.length === 0) {
    const TAB = TABS.find((t) => t.key === tabKey)!;
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <TAB.icon className="w-12 h-12 mb-4 opacity-20" />
        <p className="text-sm font-medium">Bu sekme şu an boş</p>
        <p className="text-xs mt-1">{TAB.label} durumunda sipariş yok</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {state.orders.map((order) => (
        <OrderCard key={order.id} order={order} />
      ))}

      {/* Load more */}
      {state.hasMore && (
        <div className="flex justify-center pt-2">
          <button
            onClick={onLoadMore}
            disabled={state.loadingMore}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700 transition-colors disabled:opacity-50"
          >
            {state.loadingMore ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            {state.loadingMore ? "Yükleniyor..." : "Daha Fazla Yükle"}
          </button>
        </div>
      )}

      {!state.hasMore && state.orders.length >= PAGE_SIZE && (
        <p className="text-center text-xs text-gray-400 py-2">
          Tüm siparişler gösteriliyor ({state.orders.length} adet)
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab colour helpers
// ─────────────────────────────────────────────────────────────────────────────

const TAB_ACTIVE_CLASSES: Record<string, string> = {
  yellow: "border-yellow-500  text-yellow-700  bg-yellow-50",
  blue: "border-blue-500    text-blue-700    bg-blue-50",
  orange: "border-orange-500  text-orange-700  bg-orange-50",
  green: "border-green-500   text-green-700   bg-green-50",
};

const TAB_ICON_ACTIVE: Record<string, string> = {
  yellow: "text-yellow-600",
  blue: "text-blue-600",
  orange: "text-orange-600",
  green: "text-green-600",
};

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function FoodOrdersPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("pending");
  const [showCargoModal, setShowCargoModal] = useState(false);

  // Per-tab state — keyed by TabKey
  const [tabStates, setTabStates] = useState<Record<TabKey, TabState>>({
    pending: { ...INITIAL_TAB_STATE },
    accepted: { ...INITIAL_TAB_STATE },
    ready: { ...INITIAL_TAB_STATE },
    delivered: { ...INITIAL_TAB_STATE },
  });

  // Prevent concurrent fetches for the same tab
  const fetchingRef = useRef<Set<TabKey>>(new Set());

  // Keep a ref to tabStates so fetchTabSafe can read lastDoc without
  // being included in the useCallback dependency array (avoids re-creation loop).
  const tabStatesRef = useRef(tabStates);
  tabStatesRef.current = tabStates;

  // ── Fetch function ───────────────────────────────────────────────────────────

  const fetchTabSafe = useCallback(
    async (tabKey: TabKey, mode: "initial" | "more") => {
      if (fetchingRef.current.has(tabKey)) return;
      fetchingRef.current.add(tabKey);

      const statuses = TAB_STATUSES[tabKey];

      setTabStates((prev) => ({
        ...prev,
        [tabKey]: {
          ...prev[tabKey],
          loading: mode === "initial",
          loadingMore: mode === "more",
          error: null,
        },
      }));

      try {
        const constraints: Parameters<typeof query>[1][] = [
          statuses.length === 1
            ? where("status", "==", statuses[0])
            : where("status", "in", statuses),
          orderBy("createdAt", "desc"),
        ];

        if (mode === "more") {
          const lastDoc = tabStatesRef.current[tabKey].lastDoc;
          if (!lastDoc) {
            fetchingRef.current.delete(tabKey);
            setTabStates((prev) => ({
              ...prev,
              [tabKey]: { ...prev[tabKey], loadingMore: false },
            }));
            return;
          }
          constraints.push(startAfter(lastDoc));
        }

        constraints.push(limit(PAGE_SIZE));

        const q = query(collection(db, "orders-food"), ...constraints);
        const snap = await getDocs(q);

        const newOrders = snap.docs.map(docToOrder);
        const lastVisible = snap.docs[snap.docs.length - 1] ?? null;
        const hasMore = snap.docs.length === PAGE_SIZE;

        setTabStates((prev) => ({
          ...prev,
          [tabKey]: {
            orders:
              mode === "initial"
                ? newOrders
                : [...prev[tabKey].orders, ...newOrders],
            lastDoc: lastVisible,
            hasMore,
            loading: false,
            loadingMore: false,
            initialized: true,
            error: null,
          },
        }));
      } catch (err) {
        console.error(`[FoodOrders] fetchTab ${tabKey}:`, err);
        setTabStates((prev) => ({
          ...prev,
          [tabKey]: {
            ...prev[tabKey],
            loading: false,
            loadingMore: false,
            error: "Siparişler yüklenemedi. Lütfen tekrar deneyin.",
          },
        }));
      } finally {
        fetchingRef.current.delete(tabKey);
      }
    },
    [],
  );

  // ── Tab click handler — lazy initialise ─────────────────────────────────────

  const handleTabClick = (tabKey: TabKey) => {
    setActiveTab(tabKey);
    if (!tabStatesRef.current[tabKey].initialized) {
      fetchTabSafe(tabKey, "initial");
    }
  };

  // Initialise the default tab once on mount
  // (use a one-time ref so strict mode double-invoke is harmless)
  const mountedRef = useRef(false);
  if (!mountedRef.current) {
    mountedRef.current = true;
    // Defer to avoid calling setState during render
    setTimeout(() => fetchTabSafe("pending", "initial"), 0);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-5xl mx-auto">
        {/* Page header */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => window.history.back()}
                className="flex items-center justify-center w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-gray-600" />
              </button>
              <div className="flex items-center justify-center w-10 h-10 bg-orange-500 rounded-lg">
                <UtensilsCrossed className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  Yemek Siparişleri
                </h1>
                <p className="text-xs text-gray-500">
                  Tüm yemek siparişlerini görüntüle ve yönet
                </p>
              </div>
            </div>

            {/* Kuryeleri Yönet button */}
            <button
              onClick={() => setShowCargoModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Truck className="w-4 h-4" />
              Kuryeleri Yönet
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-4">
          <div className="flex border-b border-gray-200 overflow-x-auto">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              const Icon = tab.icon;
              const count = tabStates[tab.key].orders.length;
              const initialized = tabStates[tab.key].initialized;

              return (
                <button
                  key={tab.key}
                  onClick={() => handleTabClick(tab.key)}
                  className={`
                    flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap
                    ${
                      isActive
                        ? `${TAB_ACTIVE_CLASSES[tab.color]} border-b-2`
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                    }
                  `}
                >
                  <Icon
                    className={`w-4 h-4 ${isActive ? TAB_ICON_ACTIVE[tab.color] : "text-gray-400"}`}
                  />
                  {tab.label}
                  {initialized && count > 0 && (
                    <span
                      className={`
                        inline-flex items-center justify-center px-1.5 min-w-[20px] h-5 rounded-full text-xs font-semibold
                        ${
                          isActive
                            ? `bg-${tab.color}-600 text-white`
                            : "bg-gray-200 text-gray-600"
                        }
                      `}
                      style={
                        isActive
                          ? {
                              backgroundColor: {
                                yellow: "#ca8a04",
                                blue: "#2563eb",
                                orange: "#ea580c",
                                green: "#16a34a",
                              }[tab.color],
                              color: "white",
                            }
                          : undefined
                      }
                    >
                      {count}
                      {tabStates[tab.key].hasMore ? "+" : ""}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="p-4">
            <TabContent
              tabKey={activeTab}
              state={tabStates[activeTab]}
              onLoadMore={() => fetchTabSafe(activeTab, "more")}
            />
          </div>
        </div>
      </div>

      {/* Cargo manager modal */}
      {showCargoModal && (
        <CargoManagerModal onClose={() => setShowCargoModal(false)} />
      )}
    </div>
  );
}
