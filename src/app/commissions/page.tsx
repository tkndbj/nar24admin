"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  ArrowLeft,
  Store,
  Loader2,
  Search,
  Percent,
 
  X,
  Check,
  AlertCircle,
  TrendingUp,
  Building2,

  ArrowUpDown,
  Edit2,
  RefreshCw,
} from "lucide-react";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  Timestamp,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "react-hot-toast";

interface ShopData {
  id: string;
  name: string;
  profileImageUrl?: string;
  categories?: string[];
  address?: string;
  ourComission?: number;
  isActive?: boolean;
  isBoosted?: boolean;
  createdAt?: Timestamp;
}

type SortField = "name" | "ourComission" | "createdAt";
type SortOrder = "asc" | "desc";

export default function CommissionsPage() {
  const router = useRouter();
  const [shops, setShops] = useState<ShopData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingShopId, setEditingShopId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [savingShopId, setSavingShopId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");

  // Fetch all shops
  const fetchShops = useCallback(async () => {
    try {
      setLoading(true);
      const shopsQuery = query(
        collection(db, "shops"),
        orderBy("name", "asc")
      );
      const snapshot = await getDocs(shopsQuery);
      const shopsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as ShopData[];
      setShops(shopsData);
    } catch (error) {
      console.error("Error fetching shops:", error);
      toast.error("Mağazalar yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShops();
  }, [fetchShops]);

  // Filter and sort shops
  const filteredShops = useMemo(() => {
    let filtered = [...shops];

    // Search filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (shop) =>
          shop.name.toLowerCase().includes(searchLower) ||
          shop.address?.toLowerCase().includes(searchLower) ||
          shop.categories?.some((cat) =>
            cat.toLowerCase().includes(searchLower)
          )
      );
    }

    // Active filter
    if (filterActive === "active") {
      filtered = filtered.filter((shop) => shop.isActive === true);
    } else if (filterActive === "inactive") {
      filtered = filtered.filter((shop) => shop.isActive === false);
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: string | number | Date;
      let bVal: string | number | Date;

      switch (sortField) {
        case "name":
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case "ourComission":
          aVal = a.ourComission ?? 0;
          bVal = b.ourComission ?? 0;
          break;
        case "createdAt":
          aVal = a.createdAt?.toDate() ?? new Date(0);
          bVal = b.createdAt?.toDate() ?? new Date(0);
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [shops, searchTerm, sortField, sortOrder, filterActive]);

  // Start editing
  const startEditing = (shop: ShopData) => {
    setEditingShopId(shop.id);
    setEditValue((shop.ourComission ?? 0).toString());
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingShopId(null);
    setEditValue("");
  };

  // Save commission
  const saveCommission = async (shopId: string) => {
    const newValue = parseFloat(editValue);

    if (isNaN(newValue) || newValue < 0 || newValue > 100) {
      toast.error("Geçerli bir komisyon değeri girin (0-100)");
      return;
    }

    try {
      setSavingShopId(shopId);
      await updateDoc(doc(db, "shops", shopId), {
        ourComission: newValue,
        updatedAt: Timestamp.now(),
      });

      setShops((prev) =>
        prev.map((shop) =>
          shop.id === shopId ? { ...shop, ourComission: newValue } : shop
        )
      );

      toast.success("Komisyon güncellendi!");
      setEditingShopId(null);
      setEditValue("");
    } catch (error) {
      console.error("Error updating commission:", error);
      toast.error("Komisyon güncellenirken hata oluştu");
    } finally {
      setSavingShopId(null);
    }
  };

  // Toggle sort
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  // Stats
  const stats = useMemo(() => {
    const activeShops = shops.filter((s) => s.isActive);
    const shopsWithCommission = shops.filter(
      (s) => s.ourComission !== undefined && s.ourComission > 0
    );
    const avgCommission =
      shopsWithCommission.length > 0
        ? shopsWithCommission.reduce((sum, s) => sum + (s.ourComission ?? 0), 0) /
          shopsWithCommission.length
        : 0;

    return {
      total: shops.length,
      active: activeShops.length,
      withCommission: shopsWithCommission.length,
      avgCommission: avgCommission.toFixed(1),
    };
  }, [shops]);

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
                  <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
                    <Percent className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-gray-900">
                      Komisyon Yönetimi
                    </h1>
                    <p className="text-xs text-gray-500">
                      Mağaza komisyon oranlarını düzenleyin
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={fetchShops}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                Yenile
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-4">
          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Store className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-medium text-gray-500">
                  Toplam Mağaza
                </span>
              </div>
              <p className="text-xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="w-4 h-4 text-green-600" />
                <span className="text-xs font-medium text-gray-500">
                  Aktif Mağaza
                </span>
              </div>
              <p className="text-xl font-bold text-gray-900">{stats.active}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Percent className="w-4 h-4 text-purple-600" />
                <span className="text-xs font-medium text-gray-500">
                  Komisyonlu
                </span>
              </div>
              <p className="text-xl font-bold text-gray-900">
                {stats.withCommission}
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-medium text-gray-500">
                  Ort. Komisyon
                </span>
              </div>
              <p className="text-xl font-bold text-gray-900">
                %{stats.avgCommission}
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white border border-gray-200 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Mağaza ara..."
                  className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>

              {/* Active Filter */}
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setFilterActive("all")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    filterActive === "all"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Tümü
                </button>
                <button
                  onClick={() => setFilterActive("active")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    filterActive === "active"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Aktif
                </button>
                <button
                  onClick={() => setFilterActive("inactive")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    filterActive === "inactive"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Pasif
                </button>
              </div>

              {/* Results count */}
              <div className="text-sm text-gray-500">
                {filteredShops.length} mağaza
              </div>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3 text-gray-600">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Mağazalar yükleniyor...</span>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!loading && filteredShops.length === 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <Store className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">
                Mağaza bulunamadı
              </h3>
              <p className="text-gray-500 text-sm">
                {searchTerm
                  ? "Arama kriterlerinize uygun mağaza yok"
                  : "Henüz kayıtlı mağaza bulunmuyor"}
              </p>
            </div>
          )}

          {/* Shops Table */}
          {!loading && filteredShops.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              {/* Table Header */}
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
                <div className="grid grid-cols-12 gap-4 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  <div className="col-span-1">Görsel</div>
                  <div className="col-span-3">
                    <button
                      onClick={() => toggleSort("name")}
                      className="flex items-center gap-1 hover:text-gray-900 transition-colors"
                    >
                      Mağaza Adı
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="col-span-3">Kategoriler</div>
                  <div className="col-span-1">Durum</div>
                  <div className="col-span-2">
                    <button
                      onClick={() => toggleSort("ourComission")}
                      className="flex items-center gap-1 hover:text-gray-900 transition-colors"
                    >
                      Komisyon
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="col-span-2 text-center">İşlemler</div>
                </div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-gray-100">
                {filteredShops.map((shop) => {
                  const isEditing = editingShopId === shop.id;
                  const isSaving = savingShopId === shop.id;

                  return (
                    <div
                      key={shop.id}
                      className="px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="grid grid-cols-12 gap-4 items-center">
                        {/* Profile Image */}
                        <div className="col-span-1">
                          <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-gray-100">
                            {shop.profileImageUrl ? (
                              <Image
                                src={shop.profileImageUrl}
                                alt={shop.name}
                                fill
                                className="object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Store className="w-5 h-5 text-gray-400" />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Shop Name */}
                        <div className="col-span-3">
                          <h3
                            className="font-medium text-gray-900 text-sm truncate cursor-pointer hover:text-emerald-600 transition-colors"
                            onClick={() =>
                              router.push(`/shopdetails?shopId=${shop.id}`)
                            }
                          >
                            {shop.name}
                          </h3>
                          {shop.address && (
                            <p className="text-xs text-gray-500 truncate">
                              {shop.address}
                            </p>
                          )}
                        </div>

                        {/* Categories */}
                        <div className="col-span-3">
                          <div className="flex flex-wrap gap-1">
                            {(shop.categories || []).slice(0, 2).map((cat, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs"
                              >
                                {cat}
                              </span>
                            ))}
                            {(shop.categories || []).length > 2 && (
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">
                                +{(shop.categories || []).length - 2}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Status */}
                        <div className="col-span-1">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                              shop.isActive
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            <div
                              className={`w-1.5 h-1.5 rounded-full ${
                                shop.isActive ? "bg-green-500" : "bg-gray-400"
                              }`}
                            />
                            {shop.isActive ? "Aktif" : "Pasif"}
                          </span>
                        </div>

                        {/* Commission */}
                        <div className="col-span-2">
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <div className="relative flex-1">
                                <input
                                  type="number"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  min="0"
                                  max="100"
                                  step="0.1"
                                  className="w-full px-2 py-1.5 pr-6 bg-white border border-emerald-500 rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      saveCommission(shop.id);
                                    } else if (e.key === "Escape") {
                                      cancelEditing();
                                    }
                                  }}
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                                  %
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-sm font-semibold ${
                                  shop.ourComission
                                    ? "text-emerald-600"
                                    : "text-gray-400"
                                }`}
                              >
                                %{shop.ourComission ?? 0}
                              </span>
                              {!shop.ourComission && (
                                <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                              )}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="col-span-2">
                          <div className="flex items-center justify-center gap-1">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => saveCommission(shop.id)}
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
                                onClick={() => startEditing(shop)}
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
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}