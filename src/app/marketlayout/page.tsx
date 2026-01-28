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
  Monitor,
  Layers,
} from "lucide-react";
import {
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";

// ============================================================================
// TYPES
// ============================================================================

type PlatformTarget = "both" | "flutter" | "web";

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

// ============================================================================
// CONSTANTS
// ============================================================================

const FIRESTORE_DOCS = {
  both: "market_layout",
  flutter: "market_layout_flutter",
  web: "market_layout_web",
} as const;

const PLATFORM_OPTIONS: { value: PlatformTarget; label: string; icon: React.ReactNode; description: string }[] = [
  {
    value: "both",
    label: "Both Platforms",
    icon: <Layers className="w-4 h-4" />,
    description: "Changes apply to Flutter & Web",
  },
  {
    value: "flutter",
    label: "Flutter Only",
    icon: <Smartphone className="w-4 h-4" />,
    description: "Mobile app layout",
  },
  {
    value: "web",
    label: "Web Only",
    icon: <Monitor className="w-4 h-4" />,
    description: "Web app layout",
  },
];

// Helper function to get icon by widget type
const getIconByType = (type: string): React.ReactNode => {
  const iconMap: Record<string, React.ReactNode> = {
    ads_banner: <Image className="w-3.5 h-3.5" />,
    market_bubbles: <Layout className="w-3.5 h-3.5" />,
    thin_banner: <Layout className="w-3.5 h-3.5" />,
    preference_product: <Star className="w-3.5 h-3.5" />,
    dynamic_product_list: <TrendingUp className="w-3.5 h-3.5" />,
    market_banner: <Image className="w-3.5 h-3.5" />,
    shop_horizontal_list: <Store className="w-3.5 h-3.5" />,
    boosted_product_carousel: <Package className="w-3.5 h-3.5" />,
  };
  return iconMap[type] || <Package className="w-3.5 h-3.5" />;
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

// ============================================================================
// COMPONENTS
// ============================================================================

// Platform Selector Component
function PlatformSelector({
  selected,
  onChange,
  disabled,
}: {
  selected: PlatformTarget;
  onChange: (platform: PlatformTarget) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-2">
      {PLATFORM_OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          disabled={disabled}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
            selected === option.value
              ? option.value === "both"
                ? "bg-purple-50 border-purple-300 text-purple-700"
                : option.value === "flutter"
                ? "bg-blue-50 border-blue-300 text-blue-700"
                : "bg-green-50 border-green-300 text-green-700"
              : "bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
          } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <span
            className={
              selected === option.value
                ? option.value === "both"
                  ? "text-purple-600"
                  : option.value === "flutter"
                  ? "text-blue-600"
                  : "text-green-600"
                : "text-gray-400"
            }
          >
            {option.icon}
          </span>
          <div className="text-left">
            <div className="text-xs font-semibold">{option.label}</div>
            <div className="text-[10px] opacity-70">{option.description}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

// Platform Badge Component
function PlatformBadge({ platform }: { platform: PlatformTarget }) {
  const config = {
    both: { bg: "bg-purple-100", text: "text-purple-700", label: "Both" },
    flutter: { bg: "bg-blue-100", text: "text-blue-700", label: "Flutter" },
    web: { bg: "bg-green-100", text: "text-green-700", label: "Web" },
  };

  const { bg, text, label } = config[platform];

  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${bg} ${text}`}>
      {label}
    </span>
  );
}

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
      className={`flex items-center gap-2 p-2.5 bg-gray-50 border border-gray-200 rounded-lg transition-all ${
        isDragging
          ? "opacity-50 scale-[1.02] shadow-md bg-white"
          : "hover:bg-gray-100 hover:border-gray-300"
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-200 rounded"
      >
        <GripVertical className="w-3.5 h-3.5 text-gray-400" />
      </div>

      <div
        className={`flex items-center justify-center w-7 h-7 rounded-md ${
          widget.isVisible
            ? "bg-blue-100 text-blue-600"
            : "bg-gray-200 text-gray-400"
        }`}
      >
        {widget.icon}
      </div>

      <div className="flex-1 min-w-0">
        <h4
          className={`font-medium text-xs truncate ${
            widget.isVisible ? "text-gray-900" : "text-gray-400"
          }`}
        >
          {widget.name}
        </h4>
        <p className="text-[10px] text-gray-500 truncate">{widget.description}</p>
      </div>

      <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-medium">
        #{widget.order + 1}
      </span>

      <button
        onClick={() => onToggleVisibility(widget.id)}
        className={`p-1.5 rounded-md transition-colors ${
          widget.isVisible
            ? "bg-green-100 text-green-600 hover:bg-green-200"
            : "bg-red-100 text-red-500 hover:bg-red-200"
        }`}
      >
        {widget.isVisible ? (
          <Eye className="w-3.5 h-3.5" />
        ) : (
          <EyeOff className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}

// Phone preview component
function PhonePreview({
  widgets,
  platform,
}: {
  widgets: MarketWidget[];
  platform: PlatformTarget;
}) {
  const visibleWidgets = widgets
    .filter((w) => w.isVisible)
    .sort((a, b) => a.order - b.order);

  const isWeb = platform === "web";
  const previewWidth = isWeb ? 280 : 220;
  const previewHeight = isWeb ? 400 : 440;

  return (
    <div className="bg-gray-800 rounded-2xl p-2 shadow-lg">
      <div className="bg-gray-900 rounded-xl p-0.5">
        <div
          className="bg-white rounded-lg overflow-hidden transition-all duration-300"
          style={{ width: previewWidth, height: previewHeight }}
        >
          {/* Status bar */}
          <div className="bg-gray-100 h-5 flex items-center justify-between px-2">
            <div className="flex items-center gap-0.5">
              <div className="w-0.5 h-0.5 bg-gray-800 rounded-full"></div>
              <div className="w-0.5 h-0.5 bg-gray-800 rounded-full"></div>
              <div className="w-0.5 h-0.5 bg-gray-800 rounded-full"></div>
            </div>
            <div className="text-[8px] font-medium text-gray-600">
              {isWeb ? "browser" : "9:41"}
            </div>
            <div className="w-3 h-1.5 bg-green-500 rounded-sm"></div>
          </div>

          {/* Header */}
          <div className="bg-gradient-to-r from-orange-400 to-pink-500 h-8 flex items-center justify-center gap-1">
            {platform === "web" && <Monitor className="w-3 h-3 text-white/70" />}
            {platform === "flutter" && <Smartphone className="w-3 h-3 text-white/70" />}
            {platform === "both" && <Layers className="w-3 h-3 text-white/70" />}
            <span className="text-white font-semibold text-[10px]">Market</span>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto bg-gray-50 text-[8px]">
            {visibleWidgets.map((widget, index) => (
              <div key={widget.id} className="border-b border-gray-100">
                <div className="p-1.5 flex items-center gap-1">
                  <div className="flex items-center justify-center w-4 h-4 bg-blue-50 rounded text-blue-600">
                    {widget.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[7px] font-medium text-gray-700 truncate">
                      {widget.name}
                    </div>
                    <div className="text-[6px] text-gray-400">#{index + 1}</div>
                  </div>
                </div>
                <div className="mx-1.5 mb-1.5">
                  {widget.type === "ads_banner" && (
                    <div className="bg-gradient-to-r from-purple-100 to-pink-100 h-10 rounded flex items-center justify-center">
                      <span className="text-[6px] text-purple-600">Ad Banner</span>
                    </div>
                  )}
                  {widget.type === "market_bubbles" && (
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center"
                        >
                          <span className="text-[6px] text-blue-600">{i}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {widget.type === "thin_banner" && (
                    <div className="bg-yellow-100 h-4 rounded flex items-center justify-center">
                      <span className="text-[6px] text-yellow-700">Thin Banner</span>
                    </div>
                  )}
                  {widget.type === "preference_product" && (
                    <div className="grid grid-cols-2 gap-1">
                      {[1, 2].map((i) => (
                        <div
                          key={i}
                          className="bg-green-100 h-10 rounded flex items-center justify-center"
                        >
                          <Package className="w-2.5 h-2.5 text-green-600" />
                        </div>
                      ))}
                    </div>
                  )}
                  {widget.type === "dynamic_product_list" && (
                    <div className="space-y-1">
                      {[1, 2].map((i) => (
                        <div
                          key={i}
                          className="bg-orange-100 h-6 rounded flex items-center justify-center"
                        >
                          <span className="text-[6px] text-orange-600">List {i}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {widget.type === "market_banner" && (
                    <div className="bg-red-100 h-12 rounded flex items-center justify-center">
                      <span className="text-[6px] text-red-600">Market Banner</span>
                    </div>
                  )}
                  {widget.type === "shop_horizontal_list" && (
                    <div className="flex gap-1 overflow-x-auto">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="bg-purple-100 w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
                        >
                          <Store className="w-2.5 h-2.5 text-purple-600" />
                        </div>
                      ))}
                    </div>
                  )}
                  {widget.type === "boosted_product_carousel" && (
                    <div className="flex gap-1 overflow-x-auto">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="bg-indigo-100 w-10 h-10 rounded flex items-center justify-center flex-shrink-0"
                        >
                          <Star className="w-2.5 h-2.5 text-indigo-600" />
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
  platform,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isResetting: boolean;
  platform: PlatformTarget;
}) {
  if (!isOpen) return null;

  const platformLabel =
    platform === "both"
      ? "both platforms"
      : platform === "flutter"
      ? "Flutter app"
      : "Web app";

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white border border-red-200 rounded-xl p-5 max-w-sm w-full mx-4 shadow-xl">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">Emergency Reset</h3>
            <PlatformBadge platform={platform} />
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-5">
          This will reset the layout configuration for <strong>{platformLabel}</strong> to
          default values. All custom changes will be lost. This action cannot be undone.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={isResetting}
            className="flex-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isResetting}
            className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5"
          >
            {isResetting ? (
              <>
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
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

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function MarketLayoutPage() {
  const { user } = useAuth();

  // Platform selection
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformTarget>("both");

  // Widget state
  const [widgets, setWidgets] = useState<MarketWidget[]>(DEFAULT_WIDGETS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [showResetModal, setShowResetModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Track if platform-specific config exists
  const [hasFlutterConfig, setHasFlutterConfig] = useState(false);
  const [hasWebConfig, setHasWebConfig] = useState(false);

  // Refs
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
  const validateWidget = useCallback(
    (widget: unknown): widget is MarketWidget => {
      return (
        widget !== null &&
        typeof widget === "object" &&
        typeof (widget as Record<string, unknown>).id === "string" &&
        (widget as Record<string, unknown>).id !== "" &&
        typeof (widget as Record<string, unknown>).type === "string" &&
        (widget as Record<string, unknown>).type !== "" &&
        typeof (widget as Record<string, unknown>).isVisible === "boolean" &&
        typeof (widget as Record<string, unknown>).order === "number" &&
        !isNaN((widget as Record<string, unknown>).order as number)
      );
    },
    []
  );

  // Parse widgets from Firestore data
  const parseWidgetsFromData = useCallback(
    (data: unknown): MarketWidget[] => {
      if (!data || typeof data !== "object" || data === null) {
        return DEFAULT_WIDGETS;
      }

      const dataObj = data as Record<string, unknown>;
      if (!dataObj.widgets || !Array.isArray(dataObj.widgets)) {
        return DEFAULT_WIDGETS;
      }

      const seenIds = new Set<string>();
      const validWidgets: MarketWidget[] = [];

      for (const widget of dataObj.widgets) {
        if (!validateWidget(widget)) continue;
        if (seenIds.has(widget.id)) continue;

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

  // Check if platform-specific configs exist
  const checkPlatformConfigs = useCallback(async () => {
    try {
      const [flutterSnap, webSnap] = await Promise.all([
        getDoc(doc(db, "app_config", FIRESTORE_DOCS.flutter)),
        getDoc(doc(db, "app_config", FIRESTORE_DOCS.web)),
      ]);

      setHasFlutterConfig(flutterSnap.exists() && !!flutterSnap.data()?.widgets?.length);
      setHasWebConfig(webSnap.exists() && !!webSnap.data()?.widgets?.length);
    } catch (error) {
      console.error("Error checking platform configs:", error);
    }
  }, []);

  // Setup real-time listener based on selected platform
  useEffect(() => {
    isMountedRef.current = true;
    let retryCount = 0;
    const maxRetries = 3;

    const setupListener = () => {
      try {
        const docName = FIRESTORE_DOCS[selectedPlatform];
        const docRef = doc(db, "app_config", docName);

        // Cleanup previous listener
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
        }

        setLoading(true);

        const unsubscribe = onSnapshot(
          docRef,
          { includeMetadataChanges: false },
          (snapshot) => {
            if (!isMountedRef.current) return;

            try {
              if (snapshot.exists()) {
                const data = snapshot.data();
                const parsedWidgets = parseWidgetsFromData(data);
                setWidgets(parsedWidgets);
                console.log(
                  `✅ [${selectedPlatform}] Layout synced:`,
                  parsedWidgets.length,
                  "widgets"
                );
              } else {
                console.log(`ℹ️ [${selectedPlatform}] No layout found, using defaults`);
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
    checkPlatformConfigs();

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
  }, [selectedPlatform, parseWidgetsFromData, checkPlatformConfigs]);

  // Handle platform change
  const handlePlatformChange = useCallback((platform: PlatformTarget) => {
    setSelectedPlatform(platform);
    setSaveStatus("idle");
  }, []);

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
      const validWidgets = widgets.filter(validateWidget);

      if (validWidgets.length === 0) {
        throw new Error("No valid widgets to save");
      }

      const serializableWidgets = validWidgets.map((widget) => ({
        id: widget.id,
        name: widget.name || "",
        type: widget.type,
        isVisible: widget.isVisible,
        order: widget.order,
        description: widget.description || "",
      }));

      const payload = {
        widgets: serializableWidgets,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        version: Date.now(),
        platform: selectedPlatform,
      };

      // Determine which documents to update
      const docsToUpdate: string[] = [];

      if (selectedPlatform === "both") {
        // Update all three documents
        docsToUpdate.push(FIRESTORE_DOCS.both, FIRESTORE_DOCS.flutter, FIRESTORE_DOCS.web);
      } else {
        // Update only the selected platform
        docsToUpdate.push(FIRESTORE_DOCS[selectedPlatform]);
      }

      // Save to all relevant documents
      await Promise.race([
        Promise.all(
          docsToUpdate.map((docName) =>
            setDoc(doc(db, "app_config", docName), payload, { merge: true })
          )
        ),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Save timeout")), 10000)
        ),
      ]);

      if (isMountedRef.current) {
        setSaveStatus("success");
        checkPlatformConfigs(); // Refresh config status

        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            setSaveStatus("idle");
          }
        }, 3000);
      }

      console.log(`✅ Layout saved for ${selectedPlatform}:`, docsToUpdate);
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
  }, [saving, user, widgets, validateWidget, selectedPlatform, checkPlatformConfigs]);

  // Emergency reset
  const handleEmergencyReset = useCallback(async () => {
    if (isResetting || !user) return;

    setIsResetting(true);

    try {
      const defaultData = DEFAULT_WIDGETS.map((w) => ({
        id: w.id,
        name: w.name,
        type: w.type,
        isVisible: w.isVisible,
        order: w.order,
        description: w.description,
      }));

      const payload = {
        widgets: defaultData,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        resetReason: "Emergency reset",
        version: Date.now(),
        platform: selectedPlatform,
      };

      // Determine which documents to reset
      const docsToReset: string[] = [];

      if (selectedPlatform === "both") {
        docsToReset.push(FIRESTORE_DOCS.both, FIRESTORE_DOCS.flutter, FIRESTORE_DOCS.web);
      } else {
        docsToReset.push(FIRESTORE_DOCS[selectedPlatform]);
      }

      await Promise.race([
        Promise.all(
          docsToReset.map((docName) => setDoc(doc(db, "app_config", docName), payload))
        ),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Reset timeout")), 10000)
        ),
      ]);

      if (isMountedRef.current) {
        setWidgets(DEFAULT_WIDGETS);
        setShowResetModal(false);
        checkPlatformConfigs();
        console.log(`✅ Emergency reset completed for ${selectedPlatform}`);
      }
    } catch (error) {
      console.error("❌ Emergency reset failed:", error);
      if (isMountedRef.current) {
        setWidgets(DEFAULT_WIDGETS);
      }
    } finally {
      if (isMountedRef.current) {
        setIsResetting(false);
      }
    }
  }, [isResetting, user, selectedPlatform, checkPlatformConfigs]);

  // Loading state
  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
            <p className="text-gray-600 text-sm">Loading layout configuration...</p>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50 shadow-sm">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="flex justify-between items-center py-3">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg shadow">
                  <Smartphone className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h1 className="text-base font-bold text-gray-900">Market Layout</h1>
                  <p className="text-[10px] text-gray-500">Widget Configuration</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {saveStatus === "success" && (
                  <div className="flex items-center gap-1.5 text-green-600 bg-green-50 px-2 py-1 rounded-md">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">Saved</span>
                  </div>
                )}

                {saveStatus === "error" && (
                  <div className="flex items-center gap-1.5 text-red-600 bg-red-50 px-2 py-1 rounded-md">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">Error</span>
                  </div>
                )}

                <button
                  onClick={() => setShowResetModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-colors"
                  title="Reset to default layout"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>

                <button
                  onClick={saveLayout}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-400 text-white text-xs font-medium rounded-lg transition-all disabled:cursor-not-allowed shadow-sm"
                >
                  {saving ? (
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          {/* Platform Selector */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Layers className="w-4 h-4 text-purple-600" />
                </div>
                <h2 className="text-sm font-semibold text-gray-900">Target Platform</h2>
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                {hasFlutterConfig && (
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">
                    Flutter config exists
                  </span>
                )}
                {hasWebConfig && (
                  <span className="px-2 py-0.5 bg-green-50 text-green-600 rounded-full">
                    Web config exists
                  </span>
                )}
              </div>
            </div>
            <PlatformSelector
              selected={selectedPlatform}
              onChange={handlePlatformChange}
              disabled={saving}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Widget Configuration Panel */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Layout className="w-4 h-4 text-blue-600" />
                    </div>
                    <h2 className="text-sm font-semibold text-gray-900">Widget Configuration</h2>
                    <PlatformBadge platform={selectedPlatform} />
                  </div>
                  <p className="text-[10px] text-gray-500">Drag to reorder, click eye to toggle</p>
                </div>

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={widgets.map((w) => w.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-1.5">
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
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Statistics</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-gray-900">{widgets.length}</div>
                    <div className="text-[10px] text-gray-500 font-medium">Total Widgets</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-green-600">
                      {widgets.filter((w) => w.isVisible).length}
                    </div>
                    <div className="text-[10px] text-gray-500 font-medium">Active</div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-red-500">
                      {widgets.filter((w) => !w.isVisible).length}
                    </div>
                    <div className="text-[10px] text-gray-500 font-medium">Hidden</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Phone Preview */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 sticky top-20">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 bg-purple-100 rounded-lg flex items-center justify-center">
                    {selectedPlatform === "web" ? (
                      <Monitor className="w-4 h-4 text-purple-600" />
                    ) : (
                      <Smartphone className="w-4 h-4 text-purple-600" />
                    )}
                  </div>
                  <h2 className="text-sm font-semibold text-gray-900">Preview</h2>
                  <PlatformBadge platform={selectedPlatform} />
                </div>

                <div className="flex justify-center">
                  <PhonePreview widgets={widgets} platform={selectedPlatform} />
                </div>

                <p className="text-[10px] text-gray-400 text-center mt-3">Real-time preview</p>
              </div>
            </div>
          </div>
        </main>

        <EmergencyResetModal
          isOpen={showResetModal}
          onClose={() => setShowResetModal(false)}
          onConfirm={handleEmergencyReset}
          isResetting={isResetting}
          platform={selectedPlatform}
        />
      </div>
    </ProtectedRoute>
  );
}