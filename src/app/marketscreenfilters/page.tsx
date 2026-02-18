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
  
  Package,
  ArrowLeft,
  Loader2,
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
import { useRouter } from "next/navigation";
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
  displayName: Record<string, string>;
  type: "collection" | "attribute" | "query";
  isActive: boolean;
  order: number;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
  collection?: string;
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
  queryConditions?: Array<{
    field: string;
    operator: string;
    value: string | number | boolean | string[] | number[] | boolean[] | null;
    logicalOperator?: "AND" | "OR";
  }>;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
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

const NUMERIC_FIELDS = [
  "averageRating", "price", "salePrice", "discountPercentage", "stockQuantity",
  "purchaseCount", "dailyClickCount", "weeklyClickCount", "monthlyClickCount",
];

const BOOLEAN_FIELDS = [
  "isActive", "isBoosted", "isFeatured", "isPromoted", "isNewArrival", "isBestSeller",
];

// ============================================================================
// FORM INPUT COMPONENT
// ============================================================================

const FormField: React.FC<{
  label: string;
  children: React.ReactNode;
  hint?: string;
}> = ({ label, children, hint }) => (
  <div>
    <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">
      {label}
    </label>
    {children}
    {hint && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
  </div>
);

const inputClass =
  "w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500";

const selectClass =
  "w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500";

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function MarketScreenFilters() {
  const router = useRouter();
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

  const validateFilter = async (
    filterConfig: Partial<FilterConfig>
  ): Promise<{ isValid: boolean; errors: string[] }> => {
    const errors: string[] = [];

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

  const handleCreateFilter = async () => {
    setSaving(true);
    try {
      const validation = await validateFilter(formData);

      if (!validation.isValid) {
        console.error("❌ Filter validation failed:");
        console.error("Validation errors:", validation.errors);
        console.log("📋 Error details:");
        validation.errors.forEach((error, index) => {
          console.log(`${index + 1}. ${error}`);
        });
        console.log("🔧 Form data that failed validation:", formData);
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

      await updateFilterStats();
    } catch (error) {
      console.error("Error creating filter:", error);
      console.error("❌ Error creating filter:");
      console.error(error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      console.log("🔧 Form data when error occurred:", formData);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateFilter = async (
    filterId: string,
    updates: Partial<FilterConfig>
  ) => {
    setSaving(true);
    try {
      const validation = await validateFilter({ ...editingFilter, ...updates });

      if (!validation.isValid) {
        console.error("❌ Filter update validation failed:");
        console.error("Validation errors:", validation.errors);
        console.log("📋 Error details:");
        validation.errors.forEach((error, index) => {
          console.log(`${index + 1}. ${error}`);
        });
        console.log("🔧 Filter data that failed validation:", {
          ...editingFilter,
          ...updates,
        });
        return;
      }

      await updateDoc(doc(db, "market_screen_filters", filterId), {
        ...updates,
        updatedAt: serverTimestamp(),
      });

      setEditingFilter(null);

      await updateFilterStats();
    } catch (error) {
      console.error("Error updating filter:", error);
      console.error("❌ Error updating filter:");
      console.error(error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      console.log("🔧 Update data when error occurred:", {
        filterId,
        updates,
      });
    } finally {
      setSaving(false);
    }
  };

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
      console.error("❌ Error deleting filter:");
      console.error(error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      console.log("🔧 Filter ID when error occurred:", filterId);
    } finally {
      setSaving(false);
    }
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(filters);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

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
      console.error("❌ Error updating filter order:");
      console.error(error);
      console.log("🔧 Drag result when error occurred:", result);
    } finally {
      setSaving(false);
    }
  };

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

  const getTypeHint = (attr: string | undefined) => {
    if (!attr) return null;
    if (NUMERIC_FIELDS.includes(attr)) return "Sayı olarak kaydedilecek";
    if (BOOLEAN_FIELDS.includes(attr)) return "Boolean (true/false)";
    return "Metin olarak kaydedilecek";
  };

  const convertAttributeValue = (
    value: string,
    attribute: string | undefined
  ): string | number | boolean => {
    if (attribute && BOOLEAN_FIELDS.includes(attribute)) {
      if (value === "true" || value === "1") return true;
      if (value === "false" || value === "0") return false;
    }
    if (attribute && NUMERIC_FIELDS.includes(attribute)) {
      if (value !== "" && !isNaN(Number(value))) {
        return attribute === "averageRating" ? parseFloat(value) : Number(value);
      }
    }
    if (!attribute) {
      if (value === "true") return true;
      if (value === "false") return false;
      if (!isNaN(Number(value)) && value !== "") return Number(value);
    }
    return value;
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50/50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
            <div className="flex items-center justify-between h-14">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push("/dashboard")}
                  className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition-colors text-sm"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Geri
                </button>
                <div className="w-px h-5 bg-gray-200" />
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-7 h-7 bg-blue-600 rounded-md">
                    <Filter className="w-3.5 h-3.5 text-white" />
                  </div>
                  <h1 className="text-sm font-semibold text-gray-900">
                    Market Ekran Filtreleri
                  </h1>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-4 text-[11px] text-gray-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                    Aktif: {totalActiveFilters}
                  </span>
                  <span className="flex items-center gap-1">
                    <Package className="w-3 h-3" />
                    {totalProducts.toLocaleString("tr-TR")} ürün
                  </span>
                </div>

                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-medium transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Yeni Filter
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4">
          <div className="bg-white border border-gray-200 rounded-lg">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Yükleniyor...
                </div>
              </div>
            ) : filters.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                  <Filter className="w-5 h-5 text-gray-300" />
                </div>
                <p className="text-sm font-medium text-gray-900 mb-1">Filter bulunamadı</p>
                <p className="text-xs text-gray-400">Henüz filter oluşturulmamış</p>
              </div>
            ) : (
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="filters">
                  {(provided: DroppableProvided) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                    >
                      {/* Table Header */}
                      <div className="grid grid-cols-[32px_1fr_100px_100px_80px_60px_140px] gap-2 px-3 py-2 border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                        <div />
                        <div>Filter</div>
                        <div>Tip</div>
                        <div>Koşul</div>
                        <div>Ürün</div>
                        <div>Durum</div>
                        <div className="text-right">İşlem</div>
                      </div>

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
                              className={`border-b border-gray-50 last:border-b-0 transition-shadow ${
                                snapshot.isDragging ? "shadow-lg bg-white rounded-lg z-10" : ""
                              }`}
                            >
                              <div className="grid grid-cols-[32px_1fr_100px_100px_80px_60px_140px] gap-2 items-center px-3 py-2.5 hover:bg-gray-50/50 transition-colors">
                                {/* Drag Handle */}
                                <div
                                  {...provided.dragHandleProps}
                                  className="cursor-grab active:cursor-grabbing flex items-center justify-center"
                                >
                                  <GripVertical className="w-3.5 h-3.5 text-gray-300" />
                                </div>

                                {/* Name + Description */}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                      style={{
                                        backgroundColor:
                                          filter.color || "#FF6B35",
                                      }}
                                    />
                                    <span className="text-xs font-medium text-gray-900 truncate">
                                      {filter.displayName?.tr || filter.name}
                                    </span>
                                    <span className="text-[10px] text-gray-400">
                                      #{filter.order}
                                    </span>
                                  </div>
                                  {filter.description && (
                                    <p className="text-[10px] text-gray-400 mt-0.5 truncate pl-[18px]">
                                      {filter.description}
                                    </p>
                                  )}
                                </div>

                                {/* Type */}
                                <div>
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                                    {filter.type === "attribute"
                                      ? "Attribute"
                                      : filter.type === "collection"
                                      ? "Collection"
                                      : "Query"}
                                  </span>
                                </div>

                                {/* Condition */}
                                <div>
                                  {filter.type === "attribute" && (
                                    <span className="text-[10px] text-gray-500 font-mono truncate block">
                                      {filter.attribute} {filter.operator}{" "}
                                      {String(filter.attributeValue)}
                                    </span>
                                  )}
                                  {filter.type === "collection" && (
                                    <span className="text-[10px] text-gray-500 truncate block">
                                      {filter.collection}
                                    </span>
                                  )}
                                  {filter.type === "query" && (
                                    <span className="text-[10px] text-gray-500">
                                      {filter.queryConditions?.length || 0} koşul
                                    </span>
                                  )}
                                </div>

                                {/* Product Count */}
                                <div>
                                  {filterStats[filter.id] && (
                                    <span className="flex items-center gap-1 text-[11px] tabular-nums">
                                      {filterStats[filter.id].isValid ? (
                                        <CheckCircle className="w-3 h-3 text-emerald-500" />
                                      ) : (
                                        <AlertTriangle className="w-3 h-3 text-red-400" />
                                      )}
                                      <span className="text-gray-600">
                                        {filterStats[filter.id].productCount || 0}
                                      </span>
                                    </span>
                                  )}
                                </div>

                                {/* Active Status */}
                                <div>
                                  {filter.isActive ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700">
                                      <span className="w-1 h-1 bg-emerald-500 rounded-full" />
                                      Aktif
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500">
                                      Pasif
                                    </span>
                                  )}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center justify-end gap-0.5">
                                  <button
                                    onClick={() => handleTestFilter(filter.id)}
                                    disabled={testingFilter === filter.id}
                                    className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-40"
                                    title="Test Et"
                                  >
                                    {testingFilter === filter.id ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Settings className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleUpdateFilter(filter.id, {
                                        isActive: !filter.isActive,
                                      })
                                    }
                                    className={`p-1.5 rounded transition-colors ${
                                      filter.isActive
                                        ? "text-emerald-500 hover:bg-emerald-50"
                                        : "text-gray-400 hover:bg-gray-100"
                                    }`}
                                    title={filter.isActive ? "Pasif Yap" : "Aktif Yap"}
                                  >
                                    {filter.isActive ? (
                                      <Eye className="w-3.5 h-3.5" />
                                    ) : (
                                      <EyeOff className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                  <button
                                    onClick={() => setEditingFilter(filter)}
                                    className="p-1.5 text-amber-500 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                                    title="Düzenle"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteFilter(filter.id)}
                                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                    title="Sil"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Test Result */}
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
                                    <div className="mx-3 mb-2 px-2.5 py-1.5 bg-gray-50 rounded text-[11px] text-gray-600">
                                      {(result as { message: string }).message}
                                    </div>
                                  );
                                }
                                return null;
                              })()}
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
          </div>
        </main>

        {/* Create Filter Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white z-10">
                <h2 className="text-sm font-semibold text-gray-900">
                  Yeni Filter Oluştur
                </h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              <div className="px-4 py-3 space-y-3">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Filter Adı (Sistem)">
                    <input
                      type="text"
                      value={formData.name || ""}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, name: e.target.value }))
                      }
                      className={inputClass}
                      placeholder="electronics_sale"
                    />
                  </FormField>

                  <FormField label="Filter Tipi">
                    <select
                      value={formData.type || "attribute"}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          type: e.target.value as FilterConfig["type"],
                        }))
                      }
                      className={selectClass}
                    >
                      <option value="attribute">Attribute Bazlı</option>
                      <option value="collection">Collection Bazlı</option>
                      <option value="query">Complex Query</option>
                    </select>
                  </FormField>
                </div>

                {/* Display Names */}
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Türkçe Ad">
                    <input
                      type="text"
                      value={formData.displayName?.tr || ""}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          displayName: { ...prev.displayName, tr: e.target.value },
                        }))
                      }
                      className={inputClass}
                      placeholder="Elektronik İndirim"
                    />
                  </FormField>

                  <FormField label="İngilizce Ad">
                    <input
                      type="text"
                      value={formData.displayName?.en || ""}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          displayName: { ...prev.displayName, en: e.target.value },
                        }))
                      }
                      className={inputClass}
                      placeholder="Electronics Sale"
                    />
                  </FormField>
                </div>

                {/* Collection */}
                <FormField label="Collection">
                  <select
                    value={formData.collection || "shop_products"}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, collection: e.target.value }))
                    }
                    className={selectClass}
                  >
                    {SUPPORTED_COLLECTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </FormField>

                {/* Attribute-based */}
                {formData.type === "attribute" && (
                  <div className="grid grid-cols-3 gap-3">
                    <FormField label="Attribute">
                      <select
                        value={formData.attribute || ""}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            attribute: e.target.value,
                          }))
                        }
                        className={selectClass}
                      >
                        <option value="">Seçin</option>
                        {COMMON_ATTRIBUTES.map((attr) => (
                          <option key={attr} value={attr}>
                            {attr}
                          </option>
                        ))}
                      </select>
                    </FormField>

                    <FormField label="Operator">
                      <select
                        value={formData.operator || "=="}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            operator: e.target.value as FilterConfig["operator"],
                          }))
                        }
                        className={selectClass}
                      >
                        {OPERATORS.map((op) => (
                          <option key={op.value} value={op.value}>
                            {op.icon} {op.label}
                          </option>
                        ))}
                      </select>
                    </FormField>

                    <FormField
                      label="Değer"
                      hint={getTypeHint(formData.attribute) || undefined}
                    >
                      <input
                        type="text"
                        value={String(formData.attributeValue || "")}
                        onChange={(e) => {
                          const value = convertAttributeValue(
                            e.target.value,
                            formData.attribute
                          );
                          console.log(
                            `Setting attribute value: ${value} (${typeof value}) for field: ${formData.attribute}`
                          );
                          setFormData((prev) => ({
                            ...prev,
                            attributeValue: value,
                          }));
                        }}
                        className={inputClass}
                        placeholder="Değer girin"
                      />
                    </FormField>
                  </div>
                )}

                {/* Complex Query */}
                {formData.type === "query" && (
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">
                      Query Koşulları
                    </label>
                    <div className="space-y-2">
                      {(formData.queryConditions || []).map(
                        (condition, index) => (
                          <div
                            key={index}
                            className="grid grid-cols-[1fr_100px_1fr_28px] gap-1.5 p-2 bg-gray-50 rounded"
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
                              className={inputClass}
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
                              className={selectClass}
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
                                else if (
                                  !isNaN(Number(value)) &&
                                  value !== ""
                                )
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
                              className={inputClass}
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
                              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
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
                              logicalOperator: "AND" as "AND" | "OR" | undefined,
                            },
                          ];
                          setFormData((prev) => ({
                            ...prev,
                            queryConditions: newConditions,
                          }));
                        }}
                        className="w-full py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded text-xs transition-colors"
                      >
                        <Plus className="w-3 h-3 inline mr-1" />
                        Koşul Ekle
                      </button>
                    </div>
                  </div>
                )}

                {/* Sorting and Limits */}
                <div className="grid grid-cols-3 gap-3">
                  <FormField label="Sıralama">
                    <select
                      value={formData.sortBy || "createdAt"}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, sortBy: e.target.value }))
                      }
                      className={selectClass}
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
                  </FormField>

                  <FormField label="Yön">
                    <select
                      value={formData.sortOrder || "desc"}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          sortOrder: e.target.value as "asc" | "desc",
                        }))
                      }
                      className={selectClass}
                    >
                      <option value="desc">Azalan</option>
                      <option value="asc">Artan</option>
                    </select>
                  </FormField>

                  <FormField label="Limit">
                    <input
                      type="number"
                      value={formData.limit || 50}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          limit: parseInt(e.target.value) || 50,
                        }))
                      }
                      className={inputClass}
                      min="1"
                      max="100"
                    />
                  </FormField>
                </div>

                {/* Style */}
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Renk">
                    <input
                      type="color"
                      value={formData.color || "#FF6B35"}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, color: e.target.value }))
                      }
                      className="w-full h-8 bg-white border border-gray-200 rounded cursor-pointer"
                    />
                  </FormField>

                  <FormField label="İkon (Opsiyonel)">
                    <input
                      type="text"
                      value={formData.icon || ""}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, icon: e.target.value }))
                      }
                      className={inputClass}
                      placeholder="🔥, ⭐, 💎"
                    />
                  </FormField>
                </div>

                {/* Description */}
                <FormField label="Açıklama (Opsiyonel)">
                  <textarea
                    value={formData.description || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    rows={2}
                    className={inputClass + " resize-none"}
                    placeholder="Bu filter ile ilgili açıklama..."
                  />
                </FormField>
              </div>

              {/* Footer */}
              <div className="flex gap-2 px-4 py-3 border-t border-gray-100 sticky bottom-0 bg-white">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-medium rounded transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={handleCreateFilter}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-xs font-medium rounded transition-colors disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <>
                      <Save className="w-3 h-3" />
                      Oluştur
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Filter Modal */}
        {editingFilter && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto shadow-xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white z-10">
                <h2 className="text-sm font-semibold text-gray-900">
                  Filter Düzenle
                </h2>
                <button
                  onClick={() => setEditingFilter(null)}
                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              <div className="px-4 py-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Türkçe Ad">
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
                      className={inputClass}
                    />
                  </FormField>

                  <FormField label="İngilizce Ad">
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
                      className={inputClass}
                    />
                  </FormField>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Renk">
                    <input
                      type="color"
                      value={editingFilter.color || "#FF6B35"}
                      onChange={(e) =>
                        setEditingFilter((prev) =>
                          prev ? { ...prev, color: e.target.value } : null
                        )
                      }
                      className="w-full h-8 bg-white border border-gray-200 rounded cursor-pointer"
                    />
                  </FormField>

                  <FormField label="Limit">
                    <input
                      type="number"
                      value={editingFilter.limit || 50}
                      onChange={(e) =>
                        setEditingFilter((prev) =>
                          prev
                            ? {
                                ...prev,
                                limit: parseInt(e.target.value) || 50,
                              }
                            : null
                        )
                      }
                      className={inputClass}
                      min="1"
                      max="100"
                    />
                  </FormField>
                </div>

                <FormField label="Açıklama">
                  <textarea
                    value={editingFilter.description || ""}
                    onChange={(e) =>
                      setEditingFilter((prev) =>
                        prev
                          ? { ...prev, description: e.target.value }
                          : null
                      )
                    }
                    rows={2}
                    className={inputClass + " resize-none"}
                  />
                </FormField>
              </div>

              <div className="flex gap-2 px-4 py-3 border-t border-gray-100 sticky bottom-0 bg-white">
                <button
                  onClick={() => setEditingFilter(null)}
                  className="flex-1 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-medium rounded transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={() =>
                    handleUpdateFilter(editingFilter.id, editingFilter)
                  }
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-xs font-medium rounded transition-colors disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <>
                      <Save className="w-3 h-3" />
                      Güncelle
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
