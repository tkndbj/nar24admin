"use client";

import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Eye,
  EyeOff,
  Save,
  RotateCcw,
  Smartphone,
  Layout,
  Image,
  Package,
  Store,
  Star,
  TrendingUp,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

// Widget types based on your Flutter code
interface MarketWidget {
  id: string;
  name: string;
  type:
    | "ads_banner"
    | "market_bubbles"
    | "thin_banner"
    | "preference_product"
    | "dynamic_product_list"
    | "market_banner"
    | "shop_horizontal_list";
  isVisible: boolean;
  order: number;
  icon: React.ReactNode;
  description: string;
}

// Helper function to get icon by widget type
const getIconByType = (type: string): React.ReactNode => {
  switch (type) {
    case "ads_banner":
      return <Image className="w-4 h-4" />;
    case "market_bubbles":
      return <Layout className="w-4 h-4" />;
    case "thin_banner":
      return <Layout className="w-4 h-4" />;
    case "preference_product":
      return <Star className="w-4 h-4" />;
    case "dynamic_product_list":
      return <TrendingUp className="w-4 h-4" />;
    case "market_banner":
      return <Image className="w-4 h-4" />;
    case "shop_horizontal_list":
      return <Store className="w-4 h-4" />;
    default:
      return <Package className="w-4 h-4" />;
  }
};

// Default widget configuration based on your Flutter _buildHomeContent
const DEFAULT_WIDGETS: MarketWidget[] = [
  {
    id: "ads_banner",
    name: "Ads Banner",
    type: "ads_banner",
    isVisible: true,
    order: 0,
    icon: getIconByType("ads_banner"),
    description: "Top advertising banner with dynamic background color",
  },
  {
    id: "market_bubbles",
    name: "Market Bubbles",
    type: "market_bubbles",
    isVisible: true,
    order: 1,
    icon: getIconByType("market_bubbles"),
    description: "Navigation bubbles for quick access",
  },
  {
    id: "thin_banner",
    name: "Thin Banner",
    type: "thin_banner",
    isVisible: true,
    order: 2,
    icon: getIconByType("thin_banner"),
    description: "Slim promotional banner",
  },
  {
    id: "preference_product",
    name: "Preference Products",
    type: "preference_product",
    isVisible: true,
    order: 3,
    icon: getIconByType("preference_product"),
    description: "User preference based product recommendations",
  },
  {
    id: "dynamic_product_list",
    name: "Dynamic Product Lists",
    type: "dynamic_product_list",
    isVisible: true,
    order: 4,
    icon: getIconByType("dynamic_product_list"),
    description: "Dynamic product lists widget",
  },
  {
    id: "market_banner",
    name: "Market Banner",
    type: "market_banner",
    isVisible: true,
    order: 5,
    icon: getIconByType("market_banner"),
    description: "Main market promotional banners",
  },
  {
    id: "shop_horizontal_list",
    name: "Shop Horizontal List",
    type: "shop_horizontal_list",
    isVisible: true,
    order: 6,
    icon: getIconByType("shop_horizontal_list"),
    description: "Horizontal scrollable shop list",
  },
];

// Sortable item component
function SortableWidget({
  widget,
  onToggleVisibility,
}: {
  widget: MarketWidget;
  onToggleVisibility: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-4 bg-white/10 border border-white/20 rounded-xl transition-all ${
        isDragging ? "opacity-50 scale-105 shadow-lg" : "hover:bg-white/15"
      }`}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 hover:bg-white/10 rounded"
      >
        <GripVertical className="w-4 h-4 text-gray-400" />
      </div>

      {/* Widget icon */}
      <div
        className={`flex items-center justify-center w-8 h-8 rounded-lg ${
          widget.isVisible ? "bg-blue-500/20" : "bg-gray-500/20"
        }`}
      >
        {widget.icon}
      </div>

      {/* Widget info */}
      <div className="flex-1">
        <h4
          className={`font-semibold text-sm ${
            widget.isVisible ? "text-white" : "text-gray-400"
          }`}
        >
          {widget.name}
        </h4>
        <p className="text-xs text-gray-400">{widget.description}</p>
      </div>

      {/* Order indicator */}
      <div className="text-xs text-gray-400 bg-gray-500/20 px-2 py-1 rounded">
        #{widget.order + 1}
      </div>

      {/* Visibility toggle */}
      <button
        onClick={() => onToggleVisibility(widget.id)}
        className={`p-2 rounded-lg transition-colors ${
          widget.isVisible
            ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
            : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
        }`}
      >
        {widget.isVisible ? (
          <Eye className="w-4 h-4" />
        ) : (
          <EyeOff className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}

// Phone preview component
function PhonePreview({ widgets }: { widgets: MarketWidget[] }) {
  const visibleWidgets = widgets
    .filter((w) => w.isVisible)
    .sort((a, b) => a.order - b.order);

  return (
    <div className="bg-gray-900 rounded-3xl p-4 shadow-2xl">
      {/* Phone frame */}
      <div className="bg-black rounded-2xl p-1">
        <div
          className="bg-white rounded-xl overflow-hidden"
          style={{ width: "300px", height: "600px" }}
        >
          {/* Status bar */}
          <div className="bg-gray-100 h-8 flex items-center justify-between px-4">
            <div className="flex items-center gap-1">
              <div className="w-1 h-1 bg-black rounded-full"></div>
              <div className="w-1 h-1 bg-black rounded-full"></div>
              <div className="w-1 h-1 bg-black rounded-full"></div>
            </div>
            <div className="text-xs font-medium">9:41</div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-2 bg-green-500 rounded-sm"></div>
            </div>
          </div>

          {/* App bar */}
          <div className="bg-gradient-to-r from-orange-400 to-pink-500 h-12 flex items-center justify-center">
            <div className="text-white font-semibold text-sm">Market</div>
          </div>

          {/* Widget preview area */}
          <div className="flex-1 overflow-y-auto bg-gray-50">
            {visibleWidgets.map((widget, index) => (
              <div key={widget.id} className="border-b border-gray-200">
                <div className="p-3 flex items-center gap-2">
                  <div className="flex items-center justify-center w-6 h-6 bg-blue-100 rounded">
                    {widget.icon}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-medium text-gray-700">
                      {widget.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      Position #{index + 1}
                    </div>
                  </div>
                </div>
                {/* Mock widget content */}
                <div className="mx-3 mb-3">
                  {widget.type === "ads_banner" && (
                    <div className="bg-gradient-to-r from-purple-200 to-pink-200 h-16 rounded flex items-center justify-center">
                      <span className="text-xs text-purple-800">Ad Banner</span>
                    </div>
                  )}
                  {widget.type === "market_bubbles" && (
                    <div className="flex gap-2">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className="w-12 h-12 bg-blue-200 rounded-full flex items-center justify-center"
                        >
                          <span className="text-xs">{i}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {widget.type === "thin_banner" && (
                    <div className="bg-yellow-200 h-8 rounded flex items-center justify-center">
                      <span className="text-xs text-yellow-800">
                        Thin Banner
                      </span>
                    </div>
                  )}
                  {widget.type === "preference_product" && (
                    <div className="grid grid-cols-2 gap-2">
                      {[1, 2].map((i) => (
                        <div
                          key={i}
                          className="bg-green-200 h-20 rounded flex items-center justify-center"
                        >
                          <Package className="w-4 h-4 text-green-800" />
                        </div>
                      ))}
                    </div>
                  )}
                  {widget.type === "dynamic_product_list" && (
                    <div className="space-y-2">
                      {[1, 2].map((i) => (
                        <div
                          key={i}
                          className="bg-orange-200 h-12 rounded flex items-center justify-center"
                        >
                          <span className="text-xs text-orange-800">
                            Dynamic List {i}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {widget.type === "market_banner" && (
                    <div className="bg-red-200 h-24 rounded flex items-center justify-center">
                      <span className="text-xs text-red-800">
                        Market Banner
                      </span>
                    </div>
                  )}
                  {widget.type === "shop_horizontal_list" && (
                    <div className="flex gap-2 overflow-x-auto">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="bg-purple-200 w-16 h-16 rounded flex items-center justify-center flex-shrink-0"
                        >
                          <Store className="w-4 h-4 text-purple-800" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MarketLayoutPage() {
  const { user } = useAuth();
  const [widgets, setWidgets] = useState<MarketWidget[]>(DEFAULT_WIDGETS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">(
    "idle"
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load layout from Firestore
  useEffect(() => {
    const loadLayout = async () => {
      let retryCount = 0;
      const maxRetries = 3;

      const attemptLoad = async (): Promise<void> => {
        try {
          const docRef = doc(db, "app_config", "market_layout");
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data?.widgets && Array.isArray(data.widgets)) {
              // Validate each widget before reconstructing
              const validWidgets = data.widgets.filter(
                (widget: MarketWidget) =>
                  widget &&
                  typeof widget === "object" &&
                  widget.id &&
                  widget.type &&
                  typeof widget.isVisible === "boolean" &&
                  typeof widget.order === "number"
              );

              if (validWidgets.length > 0) {
                const loadedWidgets = validWidgets.map(
                  (widget: MarketWidget) => ({
                    ...widget,
                    icon: getIconByType(widget.type),
                  })
                );
                setWidgets(loadedWidgets);
              } else {
                console.warn("No valid widgets found, using defaults");
                setWidgets(DEFAULT_WIDGETS);
              }
            } else {
              setWidgets(DEFAULT_WIDGETS);
            }
          } else {
            setWidgets(DEFAULT_WIDGETS);
          }
        } catch (error) {
          console.error(
            `Error loading layout (attempt ${retryCount + 1}):`,
            error
          );

          if (retryCount < maxRetries) {
            retryCount++;
            // Exponential backoff: 1s, 2s, 4s
            const delay = Math.pow(2, retryCount - 1) * 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
            return attemptLoad();
          } else {
            // After all retries failed, use defaults
            console.error("All retry attempts failed, using default widgets");
            setWidgets(DEFAULT_WIDGETS);
          }
        }
      };

      await attemptLoad();
      setLoading(false);
    };

    loadLayout();
  }, []);

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setWidgets((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        const newItems = arrayMove(items, oldIndex, newIndex);

        // Update order property
        return newItems.map((item, index) => ({
          ...item,
          order: index,
        }));
      });
    }
  };

  // Toggle widget visibility
  const toggleVisibility = (id: string) => {
    setWidgets(
      widgets.map((widget) =>
        widget.id === id ? { ...widget, isVisible: !widget.isVisible } : widget
      )
    );
  };

  // Save layout to Firestore
  const saveLayout = async () => {
    if (saving) return; // Prevent double-saves

    setSaving(true);
    setSaveStatus("idle");

    try {
      // Validate widgets before saving
      const validWidgets = widgets.filter(
        (widget) =>
          widget.id &&
          widget.type &&
          typeof widget.isVisible === "boolean" &&
          typeof widget.order === "number"
      );

      if (validWidgets.length === 0) {
        throw new Error("No valid widgets to save");
      }

      // Create a serializable version
      const serializableWidgets = validWidgets.map((widget) => ({
        id: widget.id,
        name: widget.name || "",
        type: widget.type,
        isVisible: widget.isVisible,
        order: widget.order,
        description: widget.description || "",
      }));

      const docRef = doc(db, "app_config", "market_layout");

      // Use a timeout for the operation
      const savePromise = setDoc(
        docRef,
        {
          widgets: serializableWidgets,
          updatedAt: new Date(),
          updatedBy: user?.uid || "unknown",
          version: Date.now(), // Add versioning for conflict resolution
        },
        { merge: true }
      );

      // 10 second timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Save operation timed out")), 10000)
      );

      await Promise.race([savePromise, timeoutPromise]);

      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (error) {
      console.error("Error saving layout:", error);
      setSaveStatus("error");

      // Show user-friendly error message
      if (error instanceof Error) {
        if (error.message.includes("timeout")) {
          console.error("Save timed out - please check your connection");
        } else if (error.message.includes("permission")) {
          console.error("Permission denied - please check your access rights");
        } else {
          console.error("Failed to save layout - please try again");
        }
      }

      setTimeout(() => setSaveStatus("idle"), 5000);
    } finally {
      setSaving(false);
    }
  };

  // Reset to default layout
  const resetLayout = () => {
    setWidgets(DEFAULT_WIDGETS);
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        {/* Header */}
        <header className="backdrop-blur-xl bg-white/10 border-b border-white/20 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg">
                  <Smartphone className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-xl font-bold text-white">
                  Market Layout Yönetimi
                </h1>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={resetLayout}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-600/20 hover:bg-gray-600/30 text-gray-300 rounded-lg transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Sıfırla
                </button>

                <button
                  onClick={saveLayout}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-600 text-white rounded-lg transition-all duration-200 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {saving ? "Kaydediliyor..." : "Kaydet"}
                </button>

                {saveStatus === "success" && (
                  <div className="flex items-center gap-2 text-green-400">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-sm">Kaydedildi!</span>
                  </div>
                )}

                {saveStatus === "error" && (
                  <div className="flex items-center gap-2 text-red-400">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm">Hata oluştu!</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Side - Widget Configuration */}
            <div className="space-y-4">
              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Layout className="w-5 h-5" />
                  Widget Düzenleme
                </h2>

                <p className="text-sm text-gray-300 mb-4">
                  Widgetları sürükleyerek sıralayın, görünürlüklerini ayarlayın
                </p>

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={widgets.map((w) => w.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-3">
                      {widgets
                        .sort((a, b) => a.order - b.order)
                        .map((widget) => (
                          <SortableWidget
                            key={widget.id}
                            widget={widget}
                            onToggleVisibility={toggleVisibility}
                          />
                        ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>

              {/* Statistics */}
              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
                <h3 className="text-lg font-semibold text-white mb-3">
                  İstatistikler
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-400">
                      {widgets.filter((w) => w.isVisible).length}
                    </div>
                    <div className="text-sm text-gray-300">Aktif Widget</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-400">
                      {widgets.filter((w) => !w.isVisible).length}
                    </div>
                    <div className="text-sm text-gray-300">Gizli Widget</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Side - Phone Preview */}
            <div className="flex flex-col items-center">
              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-6 w-full">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Smartphone className="w-5 h-5" />
                  Mobil Önizleme
                </h2>

                <div className="flex justify-center">
                  <PhonePreview widgets={widgets} />
                </div>

                <div className="mt-4 text-center">
                  <p className="text-xs text-gray-400">
                    Gerçek zamanlı önizleme - Değişiklikler anında yansır
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
