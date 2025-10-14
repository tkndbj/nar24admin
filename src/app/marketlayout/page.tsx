"use client";

import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useState, useEffect, useCallback, useRef } from "react";
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
  AlertTriangle,
} from "lucide-react";
import {
  doc,
  
  setDoc,
  onSnapshot,
  serverTimestamp,
  
} from "firebase/firestore";
import { db } from "../lib/firebase";

// Widget types based on Flutter code
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
    | "shop_horizontal_list"
    | "boosted_product_carousel";
  isVisible: boolean;
  order: number;
  icon: React.ReactNode;
  description: string;
}

// Helper function to get icon by widget type
const getIconByType = (type: string): React.ReactNode => {
  const iconMap: Record<string, React.ReactNode> = {
    ads_banner: <Image className="w-4 h-4" />,
    market_bubbles: <Layout className="w-4 h-4" />,
    thin_banner: <Layout className="w-4 h-4" />,
    preference_product: <Star className="w-4 h-4" />,
    dynamic_product_list: <TrendingUp className="w-4 h-4" />,
    market_banner: <Image className="w-4 h-4" />,
    shop_horizontal_list: <Store className="w-4 h-4" />,
    boosted_product_carousel: <Package className="w-4 h-4" />,
  };
  return iconMap[type] || <Package className="w-4 h-4" />;
};

// Default widget configuration
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
    id: "boosted_product_carousel",
    name: "Boosted Products",
    type: "boosted_product_carousel",
    isVisible: true,
    order: 4,
    icon: getIconByType("boosted_product_carousel"),
    description: "Carousel showcasing boosted/promoted products",
  },
  {
    id: "dynamic_product_list",
    name: "Dynamic Product Lists",
    type: "dynamic_product_list",
    isVisible: true,
    order: 5,
    icon: getIconByType("dynamic_product_list"),
    description: "Dynamic product lists widget",
  },
  {
    id: "market_banner",
    name: "Market Banner",
    type: "market_banner",
    isVisible: true,
    order: 6,
    icon: getIconByType("market_banner"),
    description: "Main market promotional banners",
  },
  {
    id: "shop_horizontal_list",
    name: "Shop Horizontal List",
    type: "shop_horizontal_list",
    isVisible: true,
    order: 7,
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
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 hover:bg-white/10 rounded"
      >
        <GripVertical className="w-4 h-4 text-gray-400" />
      </div>

      <div
        className={`flex items-center justify-center w-8 h-8 rounded-lg ${
          widget.isVisible ? "bg-blue-500/20" : "bg-gray-500/20"
        }`}
      >
        {widget.icon}
      </div>

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

      <div className="text-xs text-gray-400 bg-gray-500/20 px-2 py-1 rounded">
        #{widget.order + 1}
      </div>

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
      <div className="bg-black rounded-2xl p-1">
        <div
          className="bg-white rounded-xl overflow-hidden"
          style={{ width: "300px", height: "600px" }}
        >
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

          <div className="bg-gradient-to-r from-orange-400 to-pink-500 h-12 flex items-center justify-center">
            <div className="text-white font-semibold text-sm">Market</div>
          </div>

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
                  {widget.type === "boosted_product_carousel" && (
                    <div className="flex gap-2 overflow-x-auto">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="bg-indigo-200 w-20 h-20 rounded flex items-center justify-center flex-shrink-0"
                        >
                          <Star className="w-4 h-4 text-indigo-800" />
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

// Emergency Reset Modal
function EmergencyResetModal({
  isOpen,
  onClose,
  onConfirm,
  isResetting,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isResetting: boolean;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-red-500/50 rounded-xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-red-500" />
          <h3 className="text-xl font-bold text-white">Emergency Reset</h3>
        </div>
        <p className="text-gray-300 mb-6">
          This will reset the layout configuration to default values. All custom
          changes will be lost. This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isResetting}
            className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isResetting}
            className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isResetting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Resetting...
              </>
            ) : (
              "Reset to Default"
            )}
          </button>
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
  const [showResetModal, setShowResetModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Refs to prevent race conditions
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

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

  // Validate widget data
  const validateWidget = useCallback((widget: unknown): widget is MarketWidget => {
    return (
      widget !== null &&
      typeof widget === "object" &&
      widget !== null &&
      typeof (widget as Record<string, unknown>).id === "string" &&
      (widget as Record<string, unknown>).id !== "" &&
      typeof (widget as Record<string, unknown>).type === "string" &&
      (widget as Record<string, unknown>).type !== "" &&
      typeof (widget as Record<string, unknown>).isVisible === "boolean" &&
      typeof (widget as Record<string, unknown>).order === "number" &&
      !isNaN((widget as Record<string, unknown>).order as number)
    );
  }, []);

  // Parse widgets from Firestore data
  const parseWidgetsFromData = useCallback(
    (data: unknown): MarketWidget[] => {
      if (!data || typeof data !== "object" || data === null) {
        console.warn("Invalid data format");
        return DEFAULT_WIDGETS;
      }
      
      const dataObj = data as Record<string, unknown>;
      if (!dataObj.widgets || !Array.isArray(dataObj.widgets)) {
        console.warn("No widgets array found in data");
        return DEFAULT_WIDGETS;
      }

      const seenIds = new Set<string>();
      const validWidgets: MarketWidget[] = [];

      for (const widget of dataObj.widgets) {
        if (!validateWidget(widget)) {
          console.warn("Invalid widget data:", widget);
          continue;
        }

        if (seenIds.has(widget.id)) {
          console.warn("Duplicate widget ID:", widget.id);
          continue;
        }

        seenIds.add(widget.id);
        validWidgets.push({
          ...widget,
          icon: getIconByType(widget.type),
        });
      }

      return validWidgets.length > 0 ? validWidgets : DEFAULT_WIDGETS;
    },
    [validateWidget]
  );

  // Setup real-time listener
  useEffect(() => {
    isMountedRef.current = true;
    let retryCount = 0;
    const maxRetries = 3;

    const setupListener = () => {
      try {
        const docRef = doc(db, "app_config", "market_layout");

        // Cleanup previous listener
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
        }

        // Setup new listener
        const unsubscribe = onSnapshot(
          docRef,
          {
            includeMetadataChanges: false,
          },
          (snapshot) => {
            if (!isMountedRef.current) return;

            try {
              if (snapshot.exists()) {
                const data = snapshot.data();
                const parsedWidgets = parseWidgetsFromData(data);
                setWidgets(parsedWidgets);
                console.log("✅ Layout synced:", parsedWidgets.length, "widgets");
              } else {
                console.log("ℹ️ No layout found, using defaults");
                setWidgets(DEFAULT_WIDGETS);
              }
            } catch (error) {
              console.error("❌ Error processing snapshot:", error);
            } finally {
              if (isMountedRef.current) {
                setLoading(false);
              }
            }
          },
          (error) => {
            console.error("❌ Snapshot error:", error);

            if (!isMountedRef.current) return;

            if (retryCount < maxRetries) {
              retryCount++;
              console.log(`🔄 Retrying listener (${retryCount}/${maxRetries})...`);
              setTimeout(setupListener, Math.pow(2, retryCount) * 1000);
            } else {
              setWidgets(DEFAULT_WIDGETS);
              setLoading(false);
            }
          }
        );

        unsubscribeRef.current = unsubscribe;
      } catch (error) {
        console.error("❌ Error setting up listener:", error);
        if (isMountedRef.current) {
          setWidgets(DEFAULT_WIDGETS);
          setLoading(false);
        }
      }
    };

    setupListener();

    // Cleanup on unmount
    return () => {
      isMountedRef.current = false;
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [parseWidgetsFromData]);

  // Handle drag end
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setWidgets((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        if (oldIndex === -1 || newIndex === -1) return items;

        const newItems = arrayMove(items, oldIndex, newIndex);

        return newItems.map((item, index) => ({
          ...item,
          order: index,
        }));
      });
    }
  }, []);

  // Toggle widget visibility
  const toggleVisibility = useCallback((id: string) => {
    setWidgets((prevWidgets) =>
      prevWidgets.map((widget) =>
        widget.id === id ? { ...widget, isVisible: !widget.isVisible } : widget
      )
    );
  }, []);

  // Save layout to Firestore
  const saveLayout = useCallback(async () => {
    if (saving || !user) return;

    setSaving(true);
    setSaveStatus("idle");

    try {
      // Validate all widgets before saving
      const validWidgets = widgets.filter(validateWidget);

      if (validWidgets.length === 0) {
        throw new Error("No valid widgets to save");
      }

      // Create serializable version
      const serializableWidgets = validWidgets.map((widget) => ({
        id: widget.id,
        name: widget.name || "",
        type: widget.type,
        isVisible: widget.isVisible,
        order: widget.order,
        description: widget.description || "",
      }));

      const docRef = doc(db, "app_config", "market_layout");

      // Save with timeout protection
      await Promise.race([
        setDoc(
          docRef,
          {
            widgets: serializableWidgets,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
            version: Date.now(),
          },
          { merge: true }
        ),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Save timeout")), 10000)
        ),
      ]);

      if (isMountedRef.current) {
        setSaveStatus("success");
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            setSaveStatus("idle");
          }
        }, 3000);
      }

      console.log("✅ Layout saved successfully");
    } catch (error) {
      console.error("❌ Error saving layout:", error);

      if (isMountedRef.current) {
        setSaveStatus("error");
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            setSaveStatus("idle");
          }
        }, 5000);
      }
    } finally {
      if (isMountedRef.current) {
        setSaving(false);
      }
    }
  }, [saving, user, widgets, validateWidget]);

  // Emergency reset to default layout
  const handleEmergencyReset = useCallback(async () => {
    if (isResetting || !user) return;

    setIsResetting(true);

    try {
      const docRef = doc(db, "app_config", "market_layout");

      const defaultData = DEFAULT_WIDGETS.map((w) => ({
        id: w.id,
        name: w.name,
        type: w.type,
        isVisible: w.isVisible,
        order: w.order,
        description: w.description,
      }));

      await Promise.race([
        setDoc(docRef, {
          widgets: defaultData,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
          resetReason: "Emergency reset",
          version: Date.now(),
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Reset timeout")), 10000)
        ),
      ]);

      if (isMountedRef.current) {
        setWidgets(DEFAULT_WIDGETS);
        setShowResetModal(false);
        console.log("✅ Emergency reset completed");
      }
    } catch (error) {
      console.error("❌ Emergency reset failed:", error);
      // Still update local state
      if (isMountedRef.current) {
        setWidgets(DEFAULT_WIDGETS);
      }
    } finally {
      if (isMountedRef.current) {
        setIsResetting(false);
      }
    }
  }, [isResetting, user]);

  // Reset to default (local only)
  const resetLayout = useCallback(() => {
    setShowResetModal(true);
  }, []);

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-white text-sm">Loading layout configuration...</p>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <header className="backdrop-blur-xl bg-white/10 border-b border-white/20 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg">
                  <Smartphone className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-xl font-bold text-white">
                  Market Layout Management
                </h1>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={resetLayout}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-600/20 hover:bg-gray-600/30 text-gray-300 rounded-lg transition-colors"
                  title="Reset to default layout"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset
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
                  {saving ? "Saving..." : "Save Changes"}
                </button>

                {saveStatus === "success" && (
                  <div className="flex items-center gap-2 text-green-400">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-sm">Saved!</span>
                  </div>
                )}

                {saveStatus === "error" && (
                  <div className="flex items-center gap-2 text-red-400">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm">Error!</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Layout className="w-5 h-5" />
                  Widget Configuration
                </h2>

                <p className="text-sm text-gray-300 mb-4">
                  Drag to reorder, toggle visibility
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

              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
                <h3 className="text-lg font-semibold text-white mb-3">
                  Statistics
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-400">
                      {widgets.filter((w) => w.isVisible).length}
                    </div>
                    <div className="text-sm text-gray-300">Active Widgets</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-400">
                      {widgets.filter((w) => !w.isVisible).length}
                    </div>
                    <div className="text-sm text-gray-300">Hidden Widgets</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center">
              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-6 w-full">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Smartphone className="w-5 h-5" />
                  Mobile Preview
                </h2>

                <div className="flex justify-center">
                  <PhonePreview widgets={widgets} />
                </div>

                <div className="mt-4 text-center">
                  <p className="text-xs text-gray-400">
                    Real-time preview - Changes reflect instantly
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>

        <EmergencyResetModal
          isOpen={showResetModal}
          onClose={() => setShowResetModal(false)}
          onConfirm={handleEmergencyReset}
          isResetting={isResetting}
        />
      </div>
    </ProtectedRoute>
  );
}