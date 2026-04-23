"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  ArrowLeft,
  Loader2,
  Search,
  X,
  Check,
  AlertCircle,
  ArrowUpDown,
  Edit2,
  ChevronDown,
  UtensilsCrossed,
  Truck,
} from "lucide-react";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  Timestamp,
  query,
  orderBy,
  where,
  limit,
  startAfter,
  DocumentSnapshot,
  QueryConstraint,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "react-hot-toast";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

type ActiveFilter = "all" | "active" | "inactive";

interface RestaurantData {
  id: string;
  name: string;
  profileImageUrl?: string;
  imageUrl?: string;
  categories?: string[];
  address?: string;
  ourComission?: number;
  ourShipmentFee?: number;
  isActive?: boolean;
  createdAt?: Timestamp;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const PAGE_SIZE = 20;
const COLLECTION_NAME = "restaurants";

// ═══════════════════════════════════════════════════════════════
// RESTAURANT COMMISSION LIST
// ═══════════════════════════════════════════════════════════════

function RestaurantCommissionList({
  activeFilter,
  searchTerm,
}: {
  activeFilter: ActiveFilter;
  searchTerm: string;
}) {
  const router = useRouter();

  const [items, setItems] = useState<RestaurantData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Editing state — we edit commission + shipment fee together in one "session"
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCommission, setEditCommission] = useState("");
  const [editShipmentFee, setEditShipmentFee] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const queryKey = `${activeFilter}-${sortOrder}`;
  const prevQueryKey = useRef(queryKey);

  // ── Build query ────────────────────────────────────────────
  const buildQuery = useCallback(
    (cursor: DocumentSnapshot | null) => {
      const constraints: QueryConstraint[] = [];

      if (activeFilter === "active") {
        constraints.push(where("isActive", "==", true));
      } else if (activeFilter === "inactive") {
        constraints.push(where("isActive", "==", false));
      }

      constraints.push(orderBy("name", sortOrder));

      if (cursor) {
        constraints.push(startAfter(cursor));
      }

      constraints.push(limit(PAGE_SIZE));

      return query(collection(db, COLLECTION_NAME), ...constraints);
    },
    [activeFilter, sortOrder],
  );

  // ── Fetch first page ───────────────────────────────────────
  const fetchFirstPage = useCallback(async () => {
    setLoading(true);
    setEditingId(null);
    try {
      const q = buildQuery(null);
      const snap = await getDocs(q);
      const data = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as RestaurantData,
      );
      setItems(data);
      setLastDoc(snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (err) {
      console.error("Error fetching restaurants:", err);
      toast.error("Veriler yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    if (prevQueryKey.current !== queryKey) {
      prevQueryKey.current = queryKey;
    }
    fetchFirstPage();
  }, [fetchFirstPage, queryKey]);

  // ── Load more ──────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (!lastDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const q = buildQuery(lastDoc);
      const snap = await getDocs(q);
      const data = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as RestaurantData,
      );
      setItems((prev) => [...prev, ...data]);
      setLastDoc(snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (err) {
      console.error("Error loading more:", err);
      toast.error("Daha fazla yüklenirken hata oluştu");
    } finally {
      setLoadingMore(false);
    }
  }, [lastDoc, loadingMore, buildQuery]);

  // ── Client-side search filter ──────────────────────────────
  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return items;
    const term = searchTerm.toLowerCase();
    return items.filter(
      (item) =>
        item.name?.toLowerCase().includes(term) ||
        item.address?.toLowerCase().includes(term) ||
        item.categories?.some((c) => c.toLowerCase().includes(term)),
    );
  }, [items, searchTerm]);

  // ── Edit handlers ──────────────────────────────────────────
  const startEditing = (item: RestaurantData) => {
    setEditingId(item.id);
    setEditCommission((item.ourComission ?? 0).toString());
    setEditShipmentFee((item.ourShipmentFee ?? 0).toString());
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditCommission("");
    setEditShipmentFee("");
  };

  const saveChanges = async (id: string) => {
    const commissionValue = parseFloat(editCommission);
    const shipmentValue = parseFloat(editShipmentFee);

    if (
      isNaN(commissionValue) ||
      commissionValue < 0 ||
      commissionValue > 100
    ) {
      toast.error("Geçerli bir komisyon değeri girin (0-100)");
      return;
    }
    if (isNaN(shipmentValue) || shipmentValue < 0) {
      toast.error("Geçerli bir teslimat ücreti girin (0 veya daha fazla)");
      return;
    }

    try {
      setSavingId(id);
      await updateDoc(doc(db, COLLECTION_NAME, id), {
        ourComission: commissionValue,
        ourShipmentFee: shipmentValue,
        updatedAt: Timestamp.now(),
      });
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                ourComission: commissionValue,
                ourShipmentFee: shipmentValue,
              }
            : item,
        ),
      );
      toast.success("Komisyon ve teslimat ücreti güncellendi!");
      setEditingId(null);
      setEditCommission("");
      setEditShipmentFee("");
    } catch (err) {
      console.error("Error updating restaurant fees:", err);
      toast.error("Güncellenirken hata oluştu");
    } finally {
      setSavingId(null);
    }
  };

  const toggleSort = () =>
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));

  // ── Loading state ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
        <UtensilsCrossed className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-gray-900 mb-1">
          Sonuç bulunamadı
        </h3>
        <p className="text-gray-500 text-sm">
          {searchTerm
            ? "Arama kriterlerinize uygun restoran yok"
            : "Bu filtreleme ile restoran bulunmuyor"}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {/* Table Header */}
        <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
          <div className="grid grid-cols-12 gap-4 text-xs font-semibold text-gray-600 uppercase tracking-wide">
            <div className="col-span-1">Görsel</div>
            <div className="col-span-3">
              <button
                onClick={toggleSort}
                className="flex items-center gap-1 hover:text-gray-900 transition-colors"
              >
                Ad
                <ArrowUpDown className="w-3 h-3" />
              </button>
            </div>
            <div className="col-span-2">Durum</div>
            <div className="col-span-2">Komisyon (%)</div>
            <div className="col-span-2">Teslimat Ücreti</div>
            <div className="col-span-2 text-center">İşlemler</div>
          </div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-100">
          {filtered.map((item) => {
            const isEditing = editingId === item.id;
            const isSaving = savingId === item.id;
            const imgUrl = item.profileImageUrl || item.imageUrl;

            return (
              <div
                key={item.id}
                className="px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="grid grid-cols-12 gap-4 items-center">
                  {/* Image */}
                  <div className="col-span-1">
                    <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-gray-100">
                      {imgUrl ? (
                        <Image
                          src={imgUrl}
                          alt={item.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <UtensilsCrossed className="w-5 h-5 text-gray-400" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Name */}
                  <div className="col-span-3">
                    <h3
                      className="font-medium text-gray-900 text-sm truncate cursor-pointer hover:text-emerald-600 transition-colors"
                      onClick={() => {
                        router.push(
                          `/restaurantdetails?restaurantId=${item.id}`,
                        );
                      }}
                    >
                      {item.name}
                    </h3>
                    {item.address && (
                      <p className="text-xs text-gray-500 truncate">
                        {item.address}
                      </p>
                    )}
                  </div>

                  {/* Status */}
                  <div className="col-span-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                        item.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      <div
                        className={`w-1.5 h-1.5 rounded-full ${item.isActive ? "bg-green-500" : "bg-gray-400"}`}
                      />
                      {item.isActive ? "Aktif" : "Pasif"}
                    </span>
                  </div>

                  {/* Commission */}
                  <div className="col-span-2">
                    {isEditing ? (
                      <div className="relative max-w-[110px]">
                        <input
                          type="number"
                          value={editCommission}
                          onChange={(e) => setEditCommission(e.target.value)}
                          min="0"
                          max="100"
                          step="0.1"
                          className="w-full px-2 py-1.5 pr-6 bg-white border border-emerald-500 rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveChanges(item.id);
                            else if (e.key === "Escape") cancelEditing();
                          }}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                          %
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-semibold ${item.ourComission ? "text-emerald-600" : "text-gray-400"}`}
                        >
                          %{item.ourComission ?? 0}
                        </span>
                        {!item.ourComission && (
                          <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Shipment Fee */}
                  <div className="col-span-2">
                    {isEditing ? (
                      <div className="relative max-w-[110px]">
                        <input
                          type="number"
                          value={editShipmentFee}
                          onChange={(e) => setEditShipmentFee(e.target.value)}
                          min="0"
                          step="0.01"
                          className="w-full px-2 py-1.5 pr-8 bg-white border border-emerald-500 rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveChanges(item.id);
                            else if (e.key === "Escape") cancelEditing();
                          }}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                          ₺
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Truck className="w-3.5 h-3.5 text-gray-400" />
                        <span
                          className={`text-sm font-semibold ${item.ourShipmentFee ? "text-blue-600" : "text-gray-400"}`}
                        >
                          {item.ourShipmentFee ?? 0} ₺
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="col-span-2">
                    <div className="flex items-center justify-center gap-1">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => saveChanges(item.id)}
                            disabled={isSaving}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-xs font-medium rounded-lg transition-colors"
                          >
                            {isSaving ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            Kaydet
                          </button>
                          <button
                            onClick={cancelEditing}
                            disabled={isSaving}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                          >
                            <X className="w-3.5 h-3.5" />
                            İptal
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => startEditing(item)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-medium rounded-lg transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          Düzenle
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Load more */}
      {hasMore && !searchTerm && (
        <div className="flex justify-center mt-4">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-50"
          >
            {loadingMore ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
            Daha Fazla Yükle ({PAGE_SIZE} kayıt daha)
          </button>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-2 text-center">
        {filtered.length} restoran gösteriliyor{searchTerm ? " (filtreli)" : ""}
      </p>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════

export default function CommissionsRestaurantsPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterActive, setFilterActive] = useState<ActiveFilter>("all");

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.back()}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-4 h-4 text-gray-600" />
                </button>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center">
                    <UtensilsCrossed className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-gray-900">
                      Restoran Komisyon Yönetimi
                    </h1>
                    <p className="text-xs text-gray-500">
                      Komisyon oranlarını ve teslimat ücretlerini düzenleyin
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-4">
          {/* Filters */}
          <div className="bg-white border border-gray-200 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Restoran ara..."
                  className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>

              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                {(
                  [
                    ["all", "Tümü"],
                    ["active", "Aktif"],
                    ["inactive", "Pasif"],
                  ] as [ActiveFilter, string][]
                ).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setFilterActive(val)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      filterActive === val
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <RestaurantCommissionList
            activeFilter={filterActive}
            searchTerm={searchTerm}
          />
        </main>
      </div>
    </ProtectedRoute>
  );
}
