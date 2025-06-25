"use client";

import { useState, useEffect } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  Plus,
  Trash2,
  Edit3,
  Save,
  X,
  GripVertical,
  Filter,
  Settings,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle,
  Clock,
  Package,
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
  limit,
  where,
  Timestamp,
  FieldValue,
  WhereFilterOp,
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

interface FilterConfig {
  id: string;
  name: string;
  displayName: Record<string, string>; // Multi-language support
  type: "collection" | "attribute" | "query";
  isActive: boolean;
  order: number;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;

  // For collection-based filters
  collection?: string;

  // For attribute-based filters
  attribute?: string;
  attributeValue?:
    | string
    | number
    | boolean
    | string[]
    | number[]
    | boolean[]
    | null;
  operator?:
    | "=="
    | "!="
    | ">"
    | ">="
    | "<"
    | "<="
    | "array-contains"
    | "array-contains-any"
    | "in"
    | "not-in";

  // For complex query filters
  queryConditions?: Array<{
    field: string;
    operator: string;
    value: string | number | boolean | string[] | number[] | boolean[] | null;
    logicalOperator?: "AND" | "OR";
  }>;

  // Sorting configuration
  sortBy?: string;
  sortOrder?: "asc" | "desc";

  // Additional configurations
  limit?: number;
  description?: string;
  icon?: string;
  color?: string;
}

interface FilterStats {
  filterId: string;
  productCount: number;
  lastUpdated: Timestamp;
  isValid: boolean;
  errorMessage?: string;
}

const SUPPORTED_COLLECTIONS = [
  "shop_products",
  "products",
  "featured_products",
  "promoted_products",
];

const COMMON_ATTRIBUTES = [
  "category",
  "subcategory",
  "subsubcategory",
  "brandModel",
  "isActive",
  "isBoosted",
  "isFeatured",
  "isPromoted",
  "discountPercentage",
  "averageRating",
  "purchaseCount",
  "dailyClickCount",
  "weeklyClickCount",
  "monthlyClickCount",
  "tags",
  "colors",
  "sizes",
  "price",
  "salePrice",
  "stockQuantity",
  "isNewArrival",
  "isBestSeller",
  "campaign",
  "season",
  "gender",
  "ageGroup",
];

const OPERATORS = [
  { value: "==", label: "Eşittir", icon: "=" },
  { value: "!=", label: "Eşit değildir", icon: "≠" },
  { value: ">", label: "Büyüktür", icon: ">" },
  { value: ">=", label: "Büyük eşittir", icon: "≥" },
  { value: "<", label: "Küçüktür", icon: "<" },
  { value: "<=", label: "Küçük eşittir", icon: "≤" },
  { value: "array-contains", label: "İçerir", icon: "⊃" },
  { value: "array-contains-any", label: "Herhangi birini içerir", icon: "⊃?" },
  { value: "in", label: "İçinde", icon: "∈" },
  { value: "not-in", label: "İçinde değil", icon: "∉" },
];

export default function MarketScreenFilters() {
  const [filters, setFilters] = useState<FilterConfig[]>([]);
  const [filterStats, setFilterStats] = useState<Record<string, FilterStats>>(
    {}
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingFilter, setEditingFilter] = useState<FilterConfig | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [testingFilter, setTestingFilter] = useState<string | null>(null);
  const [validationResults, setValidationResults] = useState<
    Record<string, unknown>
  >({});

  // Form state for creating/editing filters
  const [formData, setFormData] = useState<Partial<FilterConfig>>({
    name: "",
    displayName: { tr: "", en: "" },
    type: "attribute",
    isActive: true,
    collection: "shop_products",
    attribute: "",
    attributeValue: "",
    operator: "==",
    queryConditions: [],
    sortBy: "createdAt",
    sortOrder: "desc",
    limit: 50,
    description: "",
    color: "#FF6B35",
  });

  // Real-time listener for filters
  useEffect(() => {
    const filtersQuery = query(
      collection(db, "market_screen_filters"),
      orderBy("order", "asc")
    );

    const unsubscribe = onSnapshot(filtersQuery, (snapshot) => {
      const filterData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as FilterConfig[];

      setFilters(filterData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Real-time listener for filter statistics
  useEffect(() => {
    const statsQuery = query(collection(db, "market_filter_stats"));

    const unsubscribe = onSnapshot(statsQuery, (snapshot) => {
      const stats: Record<string, FilterStats> = {};
      snapshot.docs.forEach((doc) => {
        const data = doc.data() as FilterStats;
        stats[data.filterId] = data;
      });
      setFilterStats(stats);
    });

    return () => unsubscribe();
  }, []);

  // Validate filter configuration before saving
  const validateFilter = async (
    filterConfig: Partial<FilterConfig>
  ): Promise<{ isValid: boolean; errors: string[] }> => {
    const errors: string[] = [];

    // Basic validation
    if (!filterConfig.name?.trim()) {
      errors.push("Filter adı gereklidir");
    }

    if (!filterConfig.displayName?.tr?.trim()) {
      errors.push("Türkçe görünen ad gereklidir");
    }

    if (filterConfig.type === "attribute") {
      if (!filterConfig.attribute?.trim()) {
        errors.push("Attribute alanı gereklidir");
      }
      if (!filterConfig.operator) {
        errors.push("Operator seçimi gereklidir");
      }
      if (
        filterConfig.attributeValue === undefined ||
        filterConfig.attributeValue === ""
      ) {
        errors.push("Attribute değeri gereklidir");
      }
    }

    if (filterConfig.type === "collection" && !filterConfig.collection) {
      errors.push("Collection seçimi gereklidir");
    }

    if (filterConfig.type === "query") {
      if (!filterConfig.queryConditions?.length) {
        errors.push("En az bir query koşulu gereklidir");
      } else {
        filterConfig.queryConditions.forEach((condition, index) => {
          if (!condition.field?.trim()) {
            errors.push(`${index + 1}. koşul: Alan adı gereklidir`);
          }
          if (!condition.operator) {
            errors.push(`${index + 1}. koşul: Operator gereklidir`);
          }
          if (condition.value === undefined || condition.value === "") {
            errors.push(`${index + 1}. koşul: Değer gereklidir`);
          }
        });
      }
    }

    // Test the filter by running a query
    if (errors.length === 0) {
      try {
        await testFilterQuery(filterConfig);
      } catch (error) {
        errors.push(
          `Query testi başarısız: ${
            error instanceof Error ? error.message : "Bilinmeyen hata"
          }`
        );
      }
    }

    return { isValid: errors.length === 0, errors };
  };

  // Test filter query to ensure it works
  const testFilterQuery = async (
    filterConfig: Partial<FilterConfig>
  ): Promise<number> => {
    if (!filterConfig.collection) {
      throw new Error("Collection belirtilmemiş");
    }

    let testQuery = query(collection(db, filterConfig.collection));

    if (
      filterConfig.type === "attribute" &&
      filterConfig.attribute &&
      filterConfig.operator
    ) {
      testQuery = query(
        testQuery,
        where(
          filterConfig.attribute,
          filterConfig.operator as WhereFilterOp,
          filterConfig.attributeValue
        )
      );
    } else if (
      filterConfig.type === "query" &&
      filterConfig.queryConditions?.length
    ) {
      for (const condition of filterConfig.queryConditions) {
        testQuery = query(
          testQuery,
          where(
            condition.field,
            condition.operator as WhereFilterOp,
            condition.value
          )
        );
      }
    }

    if (filterConfig.sortBy) {
      testQuery = query(
        testQuery,
        orderBy(filterConfig.sortBy, filterConfig.sortOrder || "desc")
      );
    }

    testQuery = query(testQuery, limit(5));

    const snapshot = await getDocs(testQuery);
    return snapshot.size;
  };

  // Create new filter
  const handleCreateFilter = async () => {
    setSaving(true);
    try {
      const validation = await validateFilter(formData);

      if (!validation.isValid) {
        alert(`Validasyon hataları:\n${validation.errors.join("\n")}`);
        return;
      }

      const maxOrder = Math.max(...filters.map((f) => f.order || 0), 0);

      const newFilter: Omit<FilterConfig, "id"> = {
        ...(formData as FilterConfig),
        order: maxOrder + 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "market_screen_filters"), newFilter);

      // Reset form and close modal
      setFormData({
        name: "",
        displayName: { tr: "", en: "" },
        type: "attribute",
        isActive: true,
        collection: "shop_products",
        attribute: "",
        attributeValue: "",
        operator: "==",
        queryConditions: [],
        sortBy: "createdAt",
        sortOrder: "desc",
        limit: 50,
        description: "",
        color: "#FF6B35",
      });
      setShowCreateModal(false);

      // Update filter statistics
      await updateFilterStats();
    } catch (error) {
      console.error("Error creating filter:", error);
      alert(
        "Filter oluştururken hata oluştu: " +
          (error instanceof Error ? error.message : "Bilinmeyen hata")
      );
    } finally {
      setSaving(false);
    }
  };

  // Update filter
  const handleUpdateFilter = async (
    filterId: string,
    updates: Partial<FilterConfig>
  ) => {
    setSaving(true);
    try {
      const validation = await validateFilter({ ...editingFilter, ...updates });

      if (!validation.isValid) {
        alert(`Validasyon hataları:\n${validation.errors.join("\n")}`);
        return;
      }

      await updateDoc(doc(db, "market_screen_filters", filterId), {
        ...updates,
        updatedAt: serverTimestamp(),
      });

      setEditingFilter(null);

      // Update filter statistics
      await updateFilterStats();
    } catch (error) {
      console.error("Error updating filter:", error);
      alert(
        "Filter güncellenirken hata oluştu: " +
          (error instanceof Error ? error.message : "Bilinmeyen hata")
      );
    } finally {
      setSaving(false);
    }
  };

  // Delete filter
  const handleDeleteFilter = async (filterId: string) => {
    if (
      !confirm(
        "Bu filtreyi silmek istediğinizden emin misiniz? Bu işlem geri alınamaz."
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      await deleteDoc(doc(db, "market_screen_filters", filterId));

      // Delete associated stats
      const statsSnapshot = await getDocs(
        query(
          collection(db, "market_filter_stats"),
          where("filterId", "==", filterId)
        )
      );

      for (const statDoc of statsSnapshot.docs) {
        await deleteDoc(statDoc.ref);
      }
    } catch (error) {
      console.error("Error deleting filter:", error);
      alert(
        "Filter silinirken hata oluştu: " +
          (error instanceof Error ? error.message : "Bilinmeyen hata")
      );
    } finally {
      setSaving(false);
    }
  };

  // Update filter order
  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(filters);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Update the order field for all filters
    setSaving(true);
    try {
      const updatePromises = items.map((filter, index) =>
        updateDoc(doc(db, "market_screen_filters", filter.id), {
          order: index + 1,
          updatedAt: serverTimestamp(),
        })
      );

      await Promise.all(updatePromises);
    } catch (error) {
      console.error("Error updating filter order:", error);
      alert("Filter sıralama güncellenirken hata oluştu");
    } finally {
      setSaving(false);
    }
  };

  // Update filter statistics
  const updateFilterStats = async () => {
    try {
      for (const filter of filters) {
        if (!filter.isActive) continue;

        try {
          const productCount = await testFilterQuery(filter);

          await updateDoc(doc(db, "market_filter_stats", filter.id), {
            filterId: filter.id,
            productCount,
            lastUpdated: serverTimestamp(),
            isValid: true,
            errorMessage: null,
          });
        } catch (error) {
          await updateDoc(doc(db, "market_filter_stats", filter.id), {
            filterId: filter.id,
            productCount: 0,
            lastUpdated: serverTimestamp(),
            isValid: false,
            errorMessage:
              error instanceof Error ? error.message : "Bilinmeyen hata",
          });
        }
      }
    } catch (error) {
      console.error("Error updating filter stats:", error);
    }
  };

  // Test a specific filter
  const handleTestFilter = async (filterId: string) => {
    setTestingFilter(filterId);
    const filter = filters.find((f) => f.id === filterId);

    if (!filter) return;

    try {
      const productCount = await testFilterQuery(filter);
      setValidationResults((prev) => ({
        ...prev,
        [filterId]: {
          isValid: true,
          productCount,
          message: `✅ Test başarılı: ${productCount} ürün bulundu`,
        },
      }));
    } catch (error) {
      setValidationResults((prev) => ({
        ...prev,
        [filterId]: {
          isValid: false,
          productCount: 0,
          message: `❌ Test başarısız: ${
            error instanceof Error ? error.message : "Bilinmeyen hata"
          }`,
        },
      }));
    } finally {
      setTestingFilter(null);
    }
  };

  const totalActiveFilters = filters.filter((f) => f.isActive).length;
  const totalProducts = Object.values(filterStats).reduce(
    (sum, stat) => sum + (stat.productCount || 0),
    0
  );

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        {/* Header */}
        <header className="backdrop-blur-xl bg-white/10 border-b border-white/20 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg">
                  <Filter className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">
                    Market Ekran Filtreleri
                  </h1>
                  <p className="text-sm text-gray-300">
                    Mobil uygulamadaki filtre yapılandırması
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-gray-300">
                      Aktif: {totalActiveFilters}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-blue-400" />
                    <span className="text-gray-300">
                      Toplam Ürün: {totalProducts.toLocaleString("tr-TR")}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-medium rounded-xl transition-all duration-200"
                >
                  <Plus className="w-4 h-4" />
                  Yeni Filter
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
              <Droppable droppableId="filters">
                {(provided: DroppableProvided) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className="space-y-4"
                  >
                    {filters.map((filter, index) => (
                      <Draggable
                        key={filter.id}
                        draggableId={filter.id}
                        index={index}
                      >
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
                                  <div
                                    className="w-4 h-4 rounded-full border-2 border-white/20"
                                    style={{
                                      backgroundColor:
                                        filter.color || "#FF6B35",
                                    }}
                                  ></div>
                                  <div>
                                    <h3 className="text-lg font-semibold text-white">
                                      {filter.displayName?.tr || filter.name}
                                    </h3>
                                    <div className="flex items-center gap-4 text-sm text-gray-300">
                                      <span>Sıra: {filter.order}</span>
                                      <span>Tip: {filter.type}</span>
                                      {filter.type === "attribute" && (
                                        <span>
                                          {filter.attribute} {filter.operator}{" "}
                                          {String(filter.attributeValue)}
                                        </span>
                                      )}
                                      {filter.collection && (
                                        <span>
                                          Koleksiyon: {filter.collection}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                {/* Filter Stats */}
                                {filterStats[filter.id] && (
                                  <div className="flex items-center gap-2 px-3 py-1 bg-black/20 rounded-lg">
                                    {filterStats[filter.id].isValid ? (
                                      <CheckCircle className="w-4 h-4 text-green-400" />
                                    ) : (
                                      <AlertTriangle className="w-4 h-4 text-red-400" />
                                    )}
                                    <span className="text-sm text-gray-300">
                                      {filterStats[filter.id].productCount || 0}{" "}
                                      ürün
                                    </span>
                                  </div>
                                )}

                                {/* Test Button */}
                                <button
                                  onClick={() => handleTestFilter(filter.id)}
                                  disabled={testingFilter === filter.id}
                                  className="p-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg transition-colors disabled:opacity-50"
                                >
                                  {testingFilter === filter.id ? (
                                    <Clock className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Settings className="w-4 h-4" />
                                  )}
                                </button>

                                {/* Active Toggle */}
                                <button
                                  onClick={() =>
                                    handleUpdateFilter(filter.id, {
                                      isActive: !filter.isActive,
                                    })
                                  }
                                  className={`p-2 rounded-lg transition-colors ${
                                    filter.isActive
                                      ? "bg-green-600/20 text-green-400 hover:bg-green-600/30"
                                      : "bg-gray-600/20 text-gray-400 hover:bg-gray-600/30"
                                  }`}
                                >
                                  {filter.isActive ? (
                                    <Eye className="w-4 h-4" />
                                  ) : (
                                    <EyeOff className="w-4 h-4" />
                                  )}
                                </button>

                                {/* Edit Button */}
                                <button
                                  onClick={() => setEditingFilter(filter)}
                                  className="p-2 bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 rounded-lg transition-colors"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>

                                {/* Delete Button */}
                                <button
                                  onClick={() => handleDeleteFilter(filter.id)}
                                  className="p-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {/* Test Results */}
                            {(() => {
                              const result = validationResults[filter.id];
                              if (
                                result &&
                                typeof result === "object" &&
                                result !== null &&
                                "message" in result &&
                                typeof (result as { message?: unknown })
                                  .message === "string"
                              ) {
                                return (
                                  <div className="mt-4 p-3 bg-black/20 rounded-lg">
                                    <p className="text-sm text-gray-300">
                                      {(result as { message: string }).message}
                                    </p>
                                  </div>
                                );
                              }
                              return null;
                            })()}

                            {/* Filter Description */}
                            {filter.description && (
                              <div className="mt-3 text-sm text-gray-400">
                                {filter.description}
                              </div>
                            )}
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

        {/* Create Filter Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-white/20 rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">
                  Yeni Filter Oluştur
                </h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-2 text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Filter Adı (Sistem)
                    </label>
                    <input
                      type="text"
                      value={formData.name || ""}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="electronics_sale"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Filter Tipi
                    </label>
                    <select
                      value={formData.type || "attribute"}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          type: e.target.value as FilterConfig["type"],
                        }))
                      }
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="attribute">Attribute Bazlı</option>
                      <option value="collection">Collection Bazlı</option>
                      <option value="query">Complex Query</option>
                    </select>
                  </div>
                </div>

                {/* Display Names */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Türkçe Görünen Ad
                    </label>
                    <input
                      type="text"
                      value={formData.displayName?.tr || ""}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          displayName: {
                            ...prev.displayName,
                            tr: e.target.value,
                          },
                        }))
                      }
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Elektronik İndirim"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      İngilizce Görünen Ad
                    </label>
                    <input
                      type="text"
                      value={formData.displayName?.en || ""}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          displayName: {
                            ...prev.displayName,
                            en: e.target.value,
                          },
                        }))
                      }
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Electronics Sale"
                    />
                  </div>
                </div>

                {/* Collection Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Collection
                  </label>
                  <select
                    value={formData.collection || "shop_products"}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        collection: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {SUPPORTED_COLLECTIONS.map((collection) => (
                      <option key={collection} value={collection}>
                        {collection}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Attribute-based Filter Configuration */}
                {formData.type === "attribute" && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Attribute
                      </label>
                      <select
                        value={formData.attribute || ""}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            attribute: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Attribute Seçin</option>
                        {COMMON_ATTRIBUTES.map((attr) => (
                          <option key={attr} value={attr}>
                            {attr}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Operator
                      </label>
                      <select
                        value={formData.operator || "=="}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            operator: e.target
                              .value as FilterConfig["operator"],
                          }))
                        }
                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {OPERATORS.map((op) => (
                          <option key={op.value} value={op.value}>
                            {op.icon} {op.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Değer
                      </label>
                      <input
                        type="text"
                        value={String(formData.attributeValue || "")}
                        onChange={(e) => {
                          let value: string | number | boolean = e.target.value;

                          // Enhanced type conversion based on attribute
                          if (formData.attribute) {
                            const numericFields = [
                              "averageRating",
                              "price",
                              "salePrice",
                              "discountPercentage",
                              "stockQuantity",
                              "purchaseCount",
                              "dailyClickCount",
                              "weeklyClickCount",
                              "monthlyClickCount",
                            ];

                            const booleanFields = [
                              "isActive",
                              "isBoosted",
                              "isFeatured",
                              "isPromoted",
                              "isNewArrival",
                              "isBestSeller",
                            ];

                            if (booleanFields.includes(formData.attribute)) {
                              // Handle boolean fields
                              if (value === "true" || value === "1")
                                value = true;
                              else if (value === "false" || value === "0")
                                value = false;
                            } else if (
                              numericFields.includes(formData.attribute)
                            ) {
                              // Handle numeric fields
                              if (value !== "" && !isNaN(Number(value))) {
                                // For rating fields, ensure proper decimal handling
                                if (formData.attribute === "averageRating") {
                                  value = parseFloat(value);
                                } else {
                                  value = Number(value);
                                }
                              }
                            }
                            // For array fields like tags, colors, sizes - keep as string for now
                            // (you can enhance this later to handle arrays)
                          } else {
                            // Default conversion logic
                            if (value === "true") value = true;
                            else if (value === "false") value = false;
                            else if (!isNaN(Number(value)) && value !== "") {
                              value = Number(value);
                            }
                          }

                          console.log(
                            `Setting attribute value: ${value} (${typeof value}) for field: ${
                              formData.attribute
                            }`
                          );

                          setFormData((prev) => ({
                            ...prev,
                            attributeValue: value,
                          }));
                        }}
                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter value (will auto-convert type based on field)"
                      />

                      {/* Helper text showing what type will be stored */}
                      {formData.attribute && (
                        <div className="mt-1 text-xs text-gray-400">
                          {[
                            "averageRating",
                            "price",
                            "salePrice",
                            "discountPercentage",
                            "stockQuantity",
                            "purchaseCount",
                            "dailyClickCount",
                            "weeklyClickCount",
                            "monthlyClickCount",
                          ].includes(formData.attribute) &&
                            "Will be stored as number"}
                          {[
                            "isActive",
                            "isBoosted",
                            "isFeatured",
                            "isPromoted",
                            "isNewArrival",
                            "isBestSeller",
                          ].includes(formData.attribute) &&
                            "Will be stored as boolean (true/false)"}
                          {![
                            "averageRating",
                            "price",
                            "salePrice",
                            "discountPercentage",
                            "stockQuantity",
                            "purchaseCount",
                            "dailyClickCount",
                            "weeklyClickCount",
                            "monthlyClickCount",
                            "isActive",
                            "isBoosted",
                            "isFeatured",
                            "isPromoted",
                            "isNewArrival",
                            "isBestSeller",
                          ].includes(formData.attribute) &&
                            "Will be stored as string"}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Complex Query Configuration */}
                {formData.type === "query" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Query Koşulları
                    </label>
                    <div className="space-y-3">
                      {(formData.queryConditions || []).map(
                        (condition, index) => (
                          <div
                            key={index}
                            className="grid grid-cols-4 gap-2 p-3 bg-black/20 rounded-lg"
                          >
                            <input
                              type="text"
                              value={condition.field}
                              onChange={(e) => {
                                const newConditions = [
                                  ...(formData.queryConditions || []),
                                ];
                                newConditions[index] = {
                                  ...condition,
                                  field: e.target.value,
                                };
                                setFormData((prev) => ({
                                  ...prev,
                                  queryConditions: newConditions,
                                }));
                              }}
                              placeholder="Field"
                              className="px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-sm"
                            />
                            <select
                              value={condition.operator}
                              onChange={(e) => {
                                const newConditions = [
                                  ...(formData.queryConditions || []),
                                ];
                                newConditions[index] = {
                                  ...condition,
                                  operator: e.target.value,
                                };
                                setFormData((prev) => ({
                                  ...prev,
                                  queryConditions: newConditions,
                                }));
                              }}
                              className="px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-sm"
                            >
                              {OPERATORS.map((op) => (
                                <option key={op.value} value={op.value}>
                                  {op.icon}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={String(condition.value)}
                              onChange={(e) => {
                                let value: string | number | boolean =
                                  e.target.value;
                                if (value === "true") value = true;
                                else if (value === "false") value = false;
                                else if (!isNaN(Number(value)) && value !== "")
                                  value = Number(value);

                                const newConditions = [
                                  ...(formData.queryConditions || []),
                                ];
                                newConditions[index] = { ...condition, value };
                                setFormData((prev) => ({
                                  ...prev,
                                  queryConditions: newConditions,
                                }));
                              }}
                              placeholder="Value"
                              className="px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-sm"
                            />
                            <button
                              onClick={() => {
                                const newConditions = (
                                  formData.queryConditions || []
                                ).filter((_, i) => i !== index);
                                setFormData((prev) => ({
                                  ...prev,
                                  queryConditions: newConditions,
                                }));
                              }}
                              className="px-2 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded text-sm"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )
                      )}
                      <button
                        onClick={() => {
                          const newConditions = [
                            ...(formData.queryConditions || []),
                            {
                              field: "",
                              operator: "==",
                              value: "",
                              logicalOperator: "AND" as
                                | "AND"
                                | "OR"
                                | undefined,
                            },
                          ];
                          setFormData((prev) => ({
                            ...prev,
                            queryConditions: newConditions,
                          }));
                        }}
                        className="w-full py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg transition-colors"
                      >
                        <Plus className="w-4 h-4 inline mr-2" />
                        Koşul Ekle
                      </button>
                    </div>
                  </div>
                )}

                {/* Sorting and Limits */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Sıralama
                    </label>
                    <select
                      value={formData.sortBy || "createdAt"}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          sortBy: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="createdAt">Oluşturulma Tarihi</option>
                      <option value="updatedAt">Güncellenme Tarihi</option>
                      <option value="price">Fiyat</option>
                      <option value="discountPercentage">İndirim Oranı</option>
                      <option value="averageRating">Ortalama Puan</option>
                      <option value="purchaseCount">Satış Sayısı</option>
                      <option value="dailyClickCount">Günlük Tıklanma</option>
                      <option value="title">Başlık</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Sıralama Yönü
                    </label>
                    <select
                      value={formData.sortOrder || "desc"}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          sortOrder: e.target.value as "asc" | "desc",
                        }))
                      }
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="desc">Azalan</option>
                      <option value="asc">Artan</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Limit
                    </label>
                    <input
                      type="number"
                      value={formData.limit || 50}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          limit: parseInt(e.target.value) || 50,
                        }))
                      }
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="1"
                      max="100"
                    />
                  </div>
                </div>

                {/* Style Configuration */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Renk
                    </label>
                    <input
                      type="color"
                      value={formData.color || "#FF6B35"}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          color: e.target.value,
                        }))
                      }
                      className="w-full h-10 bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      İkon (Opsiyonel)
                    </label>
                    <input
                      type="text"
                      value={formData.icon || ""}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          icon: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="🔥, ⭐, 💎, vb."
                    />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Açıklama (Opsiyonel)
                  </label>
                  <textarea
                    value={formData.description || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    rows={3}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Bu filter ile ilgili açıklama..."
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-4">
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
                  >
                    İptal
                  </button>
                  <button
                    onClick={handleCreateFilter}
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
                        Oluştur
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Filter Modal */}
        {editingFilter && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-white/20 rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">Filter Düzenle</h2>
                <button
                  onClick={() => setEditingFilter(null)}
                  className="p-2 text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Türkçe Görünen Ad
                    </label>
                    <input
                      type="text"
                      value={editingFilter.displayName?.tr || ""}
                      onChange={(e) =>
                        setEditingFilter((prev) =>
                          prev
                            ? {
                                ...prev,
                                displayName: {
                                  ...prev.displayName,
                                  tr: e.target.value,
                                },
                              }
                            : null
                        )
                      }
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      İngilizce Görünen Ad
                    </label>
                    <input
                      type="text"
                      value={editingFilter.displayName?.en || ""}
                      onChange={(e) =>
                        setEditingFilter((prev) =>
                          prev
                            ? {
                                ...prev,
                                displayName: {
                                  ...prev.displayName,
                                  en: e.target.value,
                                },
                              }
                            : null
                        )
                      }
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Style Configuration */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Renk
                    </label>
                    <input
                      type="color"
                      value={editingFilter.color || "#FF6B35"}
                      onChange={(e) =>
                        setEditingFilter((prev) =>
                          prev ? { ...prev, color: e.target.value } : null
                        )
                      }
                      className="w-full h-10 bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Limit
                    </label>
                    <input
                      type="number"
                      value={editingFilter.limit || 50}
                      onChange={(e) =>
                        setEditingFilter((prev) =>
                          prev
                            ? { ...prev, limit: parseInt(e.target.value) || 50 }
                            : null
                        )
                      }
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="1"
                      max="100"
                    />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Açıklama
                  </label>
                  <textarea
                    value={editingFilter.description || ""}
                    onChange={(e) =>
                      setEditingFilter((prev) =>
                        prev ? { ...prev, description: e.target.value } : null
                      )
                    }
                    rows={3}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-4">
                  <button
                    onClick={() => setEditingFilter(null)}
                    className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
                  >
                    İptal
                  </button>
                  <button
                    onClick={() =>
                      handleUpdateFilter(editingFilter.id, editingFilter)
                    }
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
