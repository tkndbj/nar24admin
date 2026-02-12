"use client";

import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  AlertTriangle,
  ArrowLeft,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  CreditCard,
  User,
  Package,
  Phone,
  Mail,
  MapPin,
  Truck,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Copy,
  Search,
  DollarSign,
  ShieldAlert,
  Loader2,
  Tag,
  Store,
  Hash,
  Palette,
  Info,
  Zap,
  FileText,
  QrCode,
  ShoppingCart,
  Bell,
  Activity,
  BarChart3,
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/app/lib/firebase";
import { useRouter } from "next/navigation";

// ============================================================================
// TYPES
// ============================================================================

interface PaymentIssue {
  id: string;
  userId: string;
  status: string;
  amount: number;
  clientAmount?: number;
  formattedAmount: string;
  orderNumber: string;
  orderId?: string;
  customerInfo: {
    name: string;
    email: string;
    phone: string;
  };
  cartData: {
    items: CartItem[];
    cartCalculatedTotal: number;
    deliveryOption: string;
    deliveryPrice: number;
    clientDeliveryPrice?: number;
    address?: {
      addressLine1: string;
      addressLine2?: string;
      city: string;
      phoneNumber: string;
      location?: { latitude: number; longitude: number };
    };
    couponId?: string;
    freeShippingBenefitId?: string;
    paymentMethod?: string;
  };
  serverCalculation?: {
    itemsSubtotal: number;
    couponDiscount: number;
    couponCode?: string;
    deliveryPrice: number;
    deliveryPriceBeforeFreeShipping?: number;
    freeShippingApplied: boolean;
    finalTotal: number;
    deliveryOption: string;
    calculatedAt: string;
  };
  errorMessage?: string;
  orderError?: string;
  createdAt: Timestamp;
  expiresAt?: Timestamp;
  rawResponse?: Record<string, string>;
  callbackLogId?: string;
  adminNotes?: string;
  resolvedAt?: Timestamp;
  resolvedBy?: string;
}

interface TaskAlert {
  id: string;
  type: string;
  severity: string;
  orderNumber: string;
  orderId: string;
  userId: string;
  buyerName: string;
  amount: number;
  errorMessage: string;
  isRead: boolean;
  isResolved: boolean;
  timestamp: Timestamp;
  detectedBy: string;
  // Fields from alertOnPaymentIssue / detectPaymentAnomalies
  pendingPaymentId?: string;
  buyerEmail?: string;
  buyerPhone?: string;
  clientAmount?: number;
  serverCalculation?: Record<string, unknown>;
  itemCount?: number;
  itemsSummary?: string[];
  previousStatus?: string;
}

interface CartItem {
  productId: string;
  quantity: number;
  selectedColor?: string;
  [key: string]: unknown;
}

interface ProductInfo {
  productName: string;
  imageUrl: string;
  sellerName: string;
  sellerId: string;
  shopId?: string;
  isShop: boolean;
  price: number;
  currency: string;
}

type StatusFilter =
  | "all"
  | "critical"
  | "failed"
  | "stuck"
  | "expired"
  | "task_failures"
  | "resolved";

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    color: string;
    bgColor: string;
    borderColor: string;
    icon: React.ElementType;
    severity: number;
  }
> = {
  payment_succeeded_order_failed: {
    label: "Ödeme Alındı - Sipariş Oluşturulamadı",
    color: "text-red-700",
    bgColor: "bg-red-50",
    borderColor: "border-red-300",
    icon: AlertTriangle,
    severity: 1,
  },
  hash_verification_failed: {
    label: "Hash Doğrulama Hatası",
    color: "text-orange-700",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-300",
    icon: ShieldAlert,
    severity: 2,
  },
  processing: {
    label: "İşlem Takıldı",
    color: "text-amber-700",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-300",
    icon: Loader2,
    severity: 3,
  },
  payment_failed: {
    label: "Ödeme Başarısız",
    color: "text-gray-700",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-300",
    icon: XCircle,
    severity: 4,
  },
  awaiting_3d: {
    label: "3D Secure Bekliyor / Süresi Dolmuş",
    color: "text-blue-700",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-300",
    icon: Clock,
    severity: 5,
  },
  resolved: {
    label: "Çözüldü",
    color: "text-green-700",
    bgColor: "bg-green-50",
    borderColor: "border-green-300",
    icon: CheckCircle2,
    severity: 10,
  },
};

const TASK_TYPE_CONFIG: Record<
  string,
  {
    label: string;
    icon: React.ElementType;
    color: string;
    bgColor: string;
    borderColor: string;
    description: string;
  }
> = {
  task_receipt_generation_failed: {
    label: "Fatura Oluşturulamadı",
    icon: FileText,
    color: "text-purple-700",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-300",
    description: "Sipariş başarılı ama PDF fatura oluşturulamadı.",
  },
  task_qr_code_failed: {
    label: "QR Kod Oluşturulamadı",
    icon: QrCode,
    color: "text-indigo-700",
    bgColor: "bg-indigo-50",
    borderColor: "border-indigo-300",
    description: "Sipariş başarılı ama QR kod oluşturulamadı.",
  },
  task_cart_clear_failed: {
    label: "Sepet Temizlenemedi",
    icon: ShoppingCart,
    color: "text-teal-700",
    bgColor: "bg-teal-50",
    borderColor: "border-teal-300",
    description: "Sipariş başarılı ama sepet temizlenemedi.",
  },
  task_notifications_failed: {
    label: "Bildirimler Gönderilemedi",
    icon: Bell,
    color: "text-amber-700",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-300",
    description: "Sipariş başarılı ama bildirimler gönderilemedi.",
  },
  task_notification_partial_failed: {
    label: "Bazı Bildirimler Başarısız",
    icon: Bell,
    color: "text-yellow-700",
    bgColor: "bg-yellow-50",
    borderColor: "border-yellow-300",
    description: "Sipariş başarılı ama bazı bildirimler gönderilemedi.",
  },
  task_activity_tracking_failed: {
    label: "Aktivite Takibi Başarısız",
    icon: Activity,
    color: "text-cyan-700",
    bgColor: "bg-cyan-50",
    borderColor: "border-cyan-300",
    description: "Sipariş başarılı ama kullanıcı aktivitesi kaydedilemedi.",
  },
  task_ad_conversion_failed: {
    label: "Reklam Dönüşümü Başarısız",
    icon: BarChart3,
    color: "text-rose-700",
    bgColor: "bg-rose-50",
    borderColor: "border-rose-300",
    description: "Sipariş başarılı ama reklam dönüşüm takibi başarısız.",
  },
};

const SYSTEM_FIELDS = new Set([
  "productId",
  "quantity",
  "selectedColor",
  "addedAt",
  "updatedAt",
  "sellerId",
  "sellerName",
  "isShop",
  "productName",
  "unitPrice",
  "currency",
  "productImage",
  "allImages",
  "availableStock",
  "maxQuantity",
  "salePreferences",
  "calculatedUnitPrice",
  "calculatedTotal",
  "isBundleItem",
  "price",
  "finalPrice",
  "totalPrice",
  "bundleInfo",
  "isBundle",
  "bundleId",
  "mainProductPrice",
  "bundlePrice",
  "bundleData",
  "bundleIds",
  "selectedColorImage",
  "brandModel",
  "category",
  "subcategory",
  "subsubcategory",
  "condition",
  "averageRating",
  "reviewCount",
  "deliveryOption",
  "shopId",
  "colorImages",
  "colorQuantities",
  "availableColors",
  "description",
  "videoUrl",
  "discountPercentage",
  "originalPrice",
  "discountThreshold",
  "bulkDiscountPercentage",
  "cachedPrice",
  "cachedDiscountPercentage",
  "cachedDiscountThreshold",
  "cachedBulkDiscountPercentage",
  "cachedMaxQuantity",
  "cachedBundlePrice",
  "ilanNo",
  "createdAt",
  "clickCount",
  "favoritesCount",
  "cartCount",
  "purchaseCount",
  "isFeatured",
  "isTrending",
  "isBoosted",
  "paused",
  "gender",
  "rankingScore",
  "promotionScore",
  "attributes",
  "selectedAttributes",
  "showSellerHeader",
  "sellerContactNo",
  "ourComission",
]);

// ============================================================================
// HELPERS
// ============================================================================

function getStatusCategory(
  status: string,
  createdAt?: Timestamp,
): StatusFilter {
  if (status === "payment_succeeded_order_failed") return "critical";
  if (status === "payment_failed" || status === "hash_verification_failed")
    return "failed";
  if (status === "processing") {
    if (createdAt) {
      const age = Date.now() - createdAt.toMillis();
      if (age > 5 * 60 * 1000) return "stuck";
    }
    return "stuck";
  }
  if (status === "awaiting_3d") {
    if (createdAt) {
      const age = Date.now() - createdAt.toMillis();
      if (age > 15 * 60 * 1000) return "expired";
    }
    return "expired";
  }
  if (status === "resolved") return "resolved";
  return "failed";
}

function timeAgo(timestamp: Timestamp): string {
  const now = Date.now();
  const diff = now - timestamp.toMillis();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Az önce";
  if (minutes < 60) return `${minutes} dk önce`;
  if (hours < 24) return `${hours} saat önce`;
  return `${days} gün önce`;
}

function formatDate(timestamp: Timestamp): string {
  return timestamp.toDate().toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function extractDynamicAttributes(item: CartItem): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (
      !SYSTEM_FIELDS.has(key) &&
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      attrs[key] = value;
    }
  }
  return attrs;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

function isTaskAlert(type: string): boolean {
  return type.startsWith("task_");
}

function getTaskConfig(type: string) {
  return (
    TASK_TYPE_CONFIG[type] || {
      label: type.replace("task_", "").replace(/_/g, " "),
      icon: Zap,
      color: "text-gray-700",
      bgColor: "bg-gray-50",
      borderColor: "border-gray-300",
      description: "Sipariş başarılı ama bir görev başarısız oldu.",
    }
  );
}

// ============================================================================
// COMPONENTS
// ============================================================================

// --- Status Badge ---
function StatusBadge({
  status,
  createdAt,
}: {
  status: string;
  createdAt?: Timestamp;
}) {
  const config = STATUS_CONFIG[status] || {
    label: status,
    color: "text-gray-600",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200",
    icon: Info,
    severity: 99,
  };
  const Icon = config.icon;

  const isStuck =
    status === "processing" &&
    createdAt &&
    Date.now() - createdAt.toMillis() > 5 * 60 * 1000;

  const isExpired =
    status === "awaiting_3d" &&
    createdAt &&
    Date.now() - createdAt.toMillis() > 15 * 60 * 1000;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${config.bgColor} ${config.color} ${config.borderColor}`}
    >
      <Icon
        className={`w-3 h-3 ${status === "processing" ? "animate-spin" : ""}`}
      />
      {config.label}
      {isStuck && <span className="text-red-600 font-bold ml-1">⚠ TAKILI</span>}
      {isExpired && (
        <span className="text-blue-600 font-bold ml-1">⏰ SÜRESİ DOLMUŞ</span>
      )}
    </span>
  );
}

// --- Task Alert Badge ---
function TaskAlertBadge({ type }: { type: string }) {
  const config = getTaskConfig(type);
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${config.bgColor} ${config.color} ${config.borderColor}`}
    >
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

// --- Summary Stats ---
function SummaryStats({
  issues,
  taskAlerts,
}: {
  issues: PaymentIssue[];
  taskAlerts: TaskAlert[];
}) {
  const critical = issues.filter(
    (i) => i.status === "payment_succeeded_order_failed",
  ).length;
  const failed = issues.filter(
    (i) =>
      i.status === "payment_failed" || i.status === "hash_verification_failed",
  ).length;
  const stuck = issues.filter(
    (i) =>
      i.status === "processing" &&
      i.createdAt &&
      Date.now() - i.createdAt.toMillis() > 5 * 60 * 1000,
  ).length;
  const expired = issues.filter(
    (i) =>
      i.status === "awaiting_3d" &&
      i.createdAt &&
      Date.now() - i.createdAt.toMillis() > 15 * 60 * 1000,
  ).length;

  const unresolvedTaskAlerts = taskAlerts.filter((a) => !a.isResolved).length;

  const totalAtRisk = issues
    .filter((i) => i.status === "payment_succeeded_order_failed")
    .reduce((sum, i) => sum + (i.amount || 0), 0);

  return (
    <div className="grid grid-cols-6 gap-3 mb-4">
      <div className="bg-white border border-gray-100 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="p-1.5 rounded-md bg-red-100">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
          </div>
          <span className="text-xs font-medium text-gray-500">Kritik</span>
        </div>
        <span
          className={`text-xl font-bold ${critical > 0 ? "text-red-600" : "text-gray-900"}`}
        >
          {critical}
        </span>
      </div>
      <div className="bg-white border border-gray-100 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="p-1.5 rounded-md bg-amber-100">
            <Loader2 className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <span className="text-xs font-medium text-gray-500">Takılı</span>
        </div>
        <span
          className={`text-xl font-bold ${stuck > 0 ? "text-amber-600" : "text-gray-900"}`}
        >
          {stuck}
        </span>
      </div>
      <div className="bg-white border border-gray-100 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="p-1.5 rounded-md bg-gray-100">
            <XCircle className="w-3.5 h-3.5 text-gray-600" />
          </div>
          <span className="text-xs font-medium text-gray-500">Başarısız</span>
        </div>
        <span className="text-xl font-bold text-gray-900">{failed}</span>
      </div>
      <div className="bg-white border border-gray-100 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="p-1.5 rounded-md bg-blue-100">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <span className="text-xs font-medium text-gray-500">
            Süresi Dolmuş
          </span>
        </div>
        <span className="text-xl font-bold text-gray-900">{expired}</span>
      </div>
      <div className="bg-white border border-gray-100 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="p-1.5 rounded-md bg-purple-100">
            <Zap className="w-3.5 h-3.5 text-purple-600" />
          </div>
          <span className="text-xs font-medium text-gray-500">
            Görev Hatası
          </span>
        </div>
        <span
          className={`text-xl font-bold ${unresolvedTaskAlerts > 0 ? "text-purple-600" : "text-gray-900"}`}
        >
          {unresolvedTaskAlerts}
        </span>
      </div>
      <div className="bg-white border border-gray-100 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="p-1.5 rounded-md bg-red-100">
            <DollarSign className="w-3.5 h-3.5 text-red-600" />
          </div>
          <span className="text-xs font-medium text-gray-500">Risk Tutar</span>
        </div>
        <span
          className={`text-xl font-bold ${totalAtRisk > 0 ? "text-red-600" : "text-gray-900"}`}
        >
          {totalAtRisk.toFixed(2)} TL
        </span>
      </div>
    </div>
  );
}

// --- Product Card in Issue Detail ---
function ProductDetail({
  item,
  productInfo,
}: {
  item: CartItem;
  productInfo?: ProductInfo;
}) {
  const dynamicAttrs = extractDynamicAttributes(item);

  return (
    <div className="flex gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
      <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
        {productInfo?.imageUrl ? (
          <img
            src={productInfo.imageUrl}
            alt={productInfo.productName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-5 h-5 text-gray-400" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900 truncate">
              {productInfo?.productName || item.productId}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-gray-500 flex items-center gap-1">
                {productInfo?.isShop ? (
                  <Store className="w-3 h-3" />
                ) : (
                  <User className="w-3 h-3" />
                )}
                {productInfo?.sellerName || "Bilinmiyor"}
              </span>
              {productInfo?.price && (
                <span className="text-xs font-medium text-orange-600">
                  {productInfo.price.toFixed(2)} {productInfo.currency || "TL"}
                </span>
              )}
            </div>
          </div>
          <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
            x{item.quantity}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-2">
          {item.selectedColor && (
            <span className="inline-flex items-center gap-1 text-xs bg-white border border-gray-200 rounded-md px-2 py-0.5">
              <Palette className="w-3 h-3 text-gray-400" />
              {item.selectedColor}
            </span>
          )}
          {Object.entries(dynamicAttrs).map(([key, value]) => (
            <span
              key={key}
              className="inline-flex items-center gap-1 text-xs bg-white border border-gray-200 rounded-md px-2 py-0.5"
            >
              <Tag className="w-3 h-3 text-gray-400" />
              {key}: {String(value)}
            </span>
          ))}
        </div>

        <button
          onClick={() => copyToClipboard(item.productId)}
          className="flex items-center gap-1 mt-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          <Hash className="w-3 h-3" />
          {item.productId.substring(0, 16)}...
          <Copy className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// --- Task Alert Card ---
function TaskAlertCard({
  alert,
  onResolve,
}: {
  alert: TaskAlert;
  onResolve: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const config = getTaskConfig(alert.type);
  const Icon = config.icon;

  return (
    <div
      className={`bg-white border rounded-lg overflow-hidden transition-all ${
        alert.isResolved
          ? "border-gray-200 opacity-60"
          : `${config.borderColor} shadow-sm`
      }`}
    >
      {/* Header Row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-4 text-left hover:bg-gray-50/50 transition-colors"
      >
        {/* Severity indicator */}
        <div
          className={`w-1 h-10 rounded-full flex-shrink-0 ${
            alert.isResolved ? "bg-green-400" : "bg-purple-500"
          }`}
        />

        {/* Status Badge */}
        <div className="w-72 flex-shrink-0">
          <TaskAlertBadge type={alert.type} />
        </div>

        {/* Order ID */}
        <div className="w-48 flex-shrink-0">
          <p className="text-xs text-gray-500">Sipariş / Order</p>
          <p className="text-sm font-mono font-medium text-gray-900 truncate">
            {alert.orderId
              ? alert.orderId.substring(0, 16) + "..."
              : alert.orderNumber || "-"}
          </p>
        </div>

        {/* Customer */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500">Müşteri</p>
          <p className="text-sm font-medium text-gray-900 truncate">
            {alert.buyerName || "Bilinmiyor"}
          </p>
        </div>

        {/* Order Status Indicator */}
        <div className="w-32 flex-shrink-0 text-right">
          <p className="text-xs text-gray-500">Sipariş</p>
          <p className="text-sm font-semibold text-green-600 flex items-center justify-end gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Başarılı
          </p>
        </div>

        {/* Time */}
        <div className="w-28 flex-shrink-0 text-right">
          <p className="text-xs text-gray-500">Zaman</p>
          <p className="text-sm text-gray-600">
            {alert.timestamp ? timeAgo(alert.timestamp) : "-"}
          </p>
        </div>

        {/* Resolved badge */}
        <div className="w-20 flex-shrink-0 text-right">
          {alert.isResolved ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
              <CheckCircle2 className="w-3 h-3" />
              Çözüldü
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600">
              <Clock className="w-3 h-3" />
              Bekliyor
            </span>
          )}
        </div>

        {/* Expand */}
        <div className="flex-shrink-0">
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded Detail */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <div className="grid grid-cols-3 gap-4 mt-4">
            {/* Column 1: What happened */}
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Ne Oldu?
                </h4>
                <div
                  className={`rounded-lg p-4 border ${config.bgColor} ${config.borderColor}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg bg-white/80`}>
                      <Icon className={`w-5 h-5 ${config.color}`} />
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${config.color}`}>
                        {config.label}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {config.description}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Error message */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Hata Mesajı
                </h4>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-800 break-words font-mono">
                    {alert.errorMessage || "Hata detayı yok"}
                  </p>
                </div>
              </div>

              {/* Detection info */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Tespit Bilgisi
                </h4>
                <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Tespit Eden:</span>
                    <span className="font-mono">
                      {alert.detectedBy === "task_catch"
                        ? "Cloud Function catch bloğu"
                        : alert.detectedBy === "scheduler"
                          ? "Zamanlanmış tarama"
                          : alert.detectedBy || "-"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Zaman:</span>
                    <span className="font-mono">
                      {alert.timestamp ? formatDate(alert.timestamp) : "-"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Önem:</span>
                    <span className="font-mono capitalize">
                      {alert.severity || "low"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Column 2: Order & User info */}
            <div className="space-y-4">
              {/* Order success confirmation */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Sipariş Durumu
                </h4>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <span className="text-sm font-semibold text-green-700">
                      Sipariş Başarıyla Oluşturuldu
                    </span>
                  </div>
                  <p className="text-xs text-green-600">
                    Ödeme alındı ve sipariş oluşturuldu. Sadece yukarıdaki görev
                    başarısız oldu. Müşterinin siparişi etkilenmez.
                  </p>
                </div>
              </div>

              {/* User Info */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Müşteri Bilgileri
                </h4>
                <div className="space-y-2 bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-sm text-gray-900">
                      {alert.buyerName || "-"}
                    </span>
                  </div>
                  {alert.buyerEmail && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-sm text-gray-700">
                        {alert.buyerEmail}
                      </span>
                    </div>
                  )}
                  {alert.buyerPhone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-sm text-gray-700">
                        {alert.buyerPhone}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Hash className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-xs text-gray-500 font-mono">
                      {alert.userId}
                    </span>
                    <button
                      onClick={() => copyToClipboard(alert.userId)}
                      className="ml-auto"
                    >
                      <Copy className="w-3 h-3 text-gray-400 hover:text-gray-600" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Items summary if present */}
              {alert.itemsSummary && alert.itemsSummary.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Ürünler ({alert.itemCount || alert.itemsSummary.length})
                  </h4>
                  <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                    {alert.itemsSummary.map((item, idx) => (
                      <p key={idx} className="text-xs text-gray-700">
                        • {item}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Column 3: Actions & IDs */}
            <div className="space-y-4">
              {/* Quick IDs */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Referans Numaraları
                </h4>
                <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                  {alert.orderId && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Order ID:</span>
                      <button
                        onClick={() => copyToClipboard(alert.orderId)}
                        className="flex items-center gap-1 text-xs font-mono text-gray-700 hover:text-blue-600 transition-colors"
                      >
                        {alert.orderId.substring(0, 16)}...
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  {alert.orderNumber && alert.orderNumber !== alert.orderId && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Sipariş No:</span>
                      <button
                        onClick={() => copyToClipboard(alert.orderNumber)}
                        className="flex items-center gap-1 text-xs font-mono text-gray-700 hover:text-blue-600 transition-colors"
                      >
                        {alert.orderNumber.substring(0, 20)}...
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">User ID:</span>
                    <button
                      onClick={() => copyToClipboard(alert.userId)}
                      className="flex items-center gap-1 text-xs font-mono text-gray-700 hover:text-blue-600 transition-colors"
                    >
                      {alert.userId.substring(0, 16)}...
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Alert ID:</span>
                    <button
                      onClick={() => copyToClipboard(alert.id)}
                      className="flex items-center gap-1 text-xs font-mono text-gray-700 hover:text-blue-600 transition-colors"
                    >
                      {alert.id.substring(0, 20)}...
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>

              {/* What to do */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Ne Yapılmalı?
                </h4>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  {alert.type === "task_receipt_generation_failed" && (
                    <p className="text-xs text-blue-800">
                      Firebase Console → receiptTasks koleksiyonunda bu
                      siparişin dokümanını bulun ve status&apos;u
                      &quot;pending&quot; yaparak retryCount&apos;u sıfırlayın.
                      Fonksiyon otomatik tekrar deneyecektir.
                    </p>
                  )}
                  {alert.type === "task_qr_code_failed" && (
                    <p className="text-xs text-blue-800">
                      QR kod siparişin takibi için gereklidir. Firebase
                      Console&apos;dan ilgili Cloud Function loglarını kontrol
                      edin ve gerekirse manuel olarak tetikleyin.
                    </p>
                  )}
                  {alert.type === "task_cart_clear_failed" && (
                    <p className="text-xs text-blue-800">
                      Müşterinin sepetinde satın alınan ürünler hâlâ
                      görünebilir. Kullanıcı sayfayı yenileyince muhtemelen
                      düzelecektir. Kritik değil.
                    </p>
                  )}
                  {(alert.type === "task_notifications_failed" ||
                    alert.type === "task_notification_partial_failed") && (
                    <p className="text-xs text-blue-800">
                      Satıcılar satış bildirimi almamış olabilir. Sipariş
                      yönetim panelinden satıcıların siparişi görebildiğini
                      kontrol edin.
                    </p>
                  )}
                  {alert.type === "task_activity_tracking_failed" && (
                    <p className="text-xs text-blue-800">
                      Kullanıcı aktivite kaydı oluşturulamadı. Öneri
                      algoritmasını etkiler ama sipariş etkilenmez. Düşük
                      öncelik.
                    </p>
                  )}
                  {alert.type === "task_ad_conversion_failed" && (
                    <p className="text-xs text-blue-800">
                      Reklam dönüşüm takibi başarısız oldu. Reklam raporlarını
                      etkiler ama sipariş etkilenmez. Düşük öncelik.
                    </p>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                {!alert.isResolved && (
                  <button
                    onClick={() => onResolve(alert.id)}
                    className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    Çözüldü Olarak İşaretle
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Issue Card (Expandable) ---
function IssueCard({
  issue,
  productInfoMap,
  onResolve,
  onAddNote,
}: {
  issue: PaymentIssue;
  productInfoMap: Map<string, ProductInfo>;
  onResolve: (id: string) => void;
  onAddNote: (id: string, note: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [noteText, setNoteText] = useState(issue.adminNotes || "");
  const [saving, setSaving] = useState(false);

  const isCritical = issue.status === "payment_succeeded_order_failed";

  const handleSaveNote = async () => {
    setSaving(true);
    await onAddNote(issue.id, noteText);
    setSaving(false);
  };

  return (
    <div
      className={`bg-white border rounded-lg overflow-hidden transition-all ${
        isCritical
          ? "border-red-300 shadow-sm shadow-red-100"
          : "border-gray-200 hover:border-gray-300"
      }`}
    >
      {/* Header Row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-4 text-left hover:bg-gray-50/50 transition-colors"
      >
        <div
          className={`w-1 h-10 rounded-full flex-shrink-0 ${
            isCritical
              ? "bg-red-500"
              : issue.status === "processing"
                ? "bg-amber-500"
                : issue.status === "hash_verification_failed"
                  ? "bg-orange-500"
                  : issue.status === "awaiting_3d"
                    ? "bg-blue-400"
                    : issue.status === "resolved"
                      ? "bg-green-500"
                      : "bg-gray-400"
          }`}
        />

        <div className="w-72 flex-shrink-0">
          <StatusBadge status={issue.status} createdAt={issue.createdAt} />
        </div>

        <div className="w-48 flex-shrink-0">
          <p className="text-xs text-gray-500">Sipariş No</p>
          <p className="text-sm font-mono font-medium text-gray-900 truncate">
            {issue.orderNumber}
          </p>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500">Müşteri</p>
          <p className="text-sm font-medium text-gray-900 truncate">
            {issue.customerInfo?.name || "Bilinmiyor"}
          </p>
        </div>

        <div className="w-32 flex-shrink-0 text-right">
          <p className="text-xs text-gray-500">Tutar</p>
          <p
            className={`text-sm font-bold ${isCritical ? "text-red-600" : "text-gray-900"}`}
          >
            {(issue.amount || 0).toFixed(2)} TL
          </p>
        </div>

        <div className="w-28 flex-shrink-0 text-right">
          <p className="text-xs text-gray-500">Zaman</p>
          <p className="text-sm text-gray-600">
            {issue.createdAt ? timeAgo(issue.createdAt) : "-"}
          </p>
        </div>

        <div className="flex-shrink-0">
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded Detail */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <div className="grid grid-cols-3 gap-4 mt-4">
            {/* Column 1: Customer & Payment Details */}
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Müşteri Bilgileri
                </h4>
                <div className="space-y-2 bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-sm text-gray-900">
                      {issue.customerInfo?.name || "-"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-sm text-gray-700">
                      {issue.customerInfo?.email || "-"}
                    </span>
                    {issue.customerInfo?.email && (
                      <button
                        onClick={() =>
                          copyToClipboard(issue.customerInfo.email)
                        }
                        className="ml-auto"
                      >
                        <Copy className="w-3 h-3 text-gray-400 hover:text-gray-600" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-sm text-gray-700">
                      {issue.customerInfo?.phone || "-"}
                    </span>
                    {issue.customerInfo?.phone && (
                      <button
                        onClick={() =>
                          copyToClipboard(issue.customerInfo.phone)
                        }
                        className="ml-auto"
                      >
                        <Copy className="w-3 h-3 text-gray-400 hover:text-gray-600" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Hash className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-xs text-gray-500 font-mono">
                      {issue.userId}
                    </span>
                    <button
                      onClick={() => copyToClipboard(issue.userId)}
                      className="ml-auto"
                    >
                      <Copy className="w-3 h-3 text-gray-400 hover:text-gray-600" />
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Ödeme Detayı
                </h4>
                <div className="space-y-1.5 bg-gray-50 rounded-lg p-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Ürün Toplamı</span>
                    <span className="font-medium">
                      {(
                        issue.serverCalculation?.itemsSubtotal ||
                        issue.cartData?.cartCalculatedTotal ||
                        0
                      ).toFixed(2)}{" "}
                      TL
                    </span>
                  </div>
                  {(issue.serverCalculation?.couponDiscount ?? 0) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-green-600 flex items-center gap-1">
                        <Tag className="w-3 h-3" />
                        Kupon ({issue.serverCalculation?.couponCode || "?"})
                      </span>
                      <span className="font-medium text-green-600">
                        -{issue.serverCalculation!.couponDiscount.toFixed(2)} TL
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 flex items-center gap-1">
                      <Truck className="w-3 h-3" />
                      Kargo ({issue.cartData?.deliveryOption || "normal"})
                    </span>
                    <span
                      className={`font-medium ${
                        issue.serverCalculation?.freeShippingApplied
                          ? "text-green-600"
                          : ""
                      }`}
                    >
                      {issue.serverCalculation?.freeShippingApplied
                        ? "Ücretsiz"
                        : `${(issue.serverCalculation?.deliveryPrice ?? issue.cartData?.deliveryPrice ?? 0).toFixed(2)} TL`}
                    </span>
                  </div>
                  <div className="border-t border-gray-200 my-1" />
                  <div className="flex justify-between text-sm font-bold">
                    <span>Sunucu Toplamı</span>
                    <span>
                      {(
                        issue.serverCalculation?.finalTotal ??
                        issue.amount ??
                        0
                      ).toFixed(2)}{" "}
                      TL
                    </span>
                  </div>
                  {issue.clientAmount !== undefined &&
                    Math.abs((issue.clientAmount || 0) - (issue.amount || 0)) >
                      0.01 && (
                      <div className="flex justify-between text-xs mt-1 p-1.5 bg-amber-50 rounded border border-amber-200">
                        <span className="text-amber-700">⚠ İstemci tutarı</span>
                        <span className="text-amber-700 font-medium">
                          {issue.clientAmount?.toFixed(2)} TL
                        </span>
                      </div>
                    )}
                </div>
              </div>

              {issue.cartData?.address && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Teslimat Adresi
                  </h4>
                  <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5" />
                      <div>
                        <p className="text-sm text-gray-900">
                          {issue.cartData.address.addressLine1}
                        </p>
                        {issue.cartData.address.addressLine2 && (
                          <p className="text-sm text-gray-600">
                            {issue.cartData.address.addressLine2}
                          </p>
                        )}
                        <p className="text-sm text-gray-600">
                          {issue.cartData.address.city}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Column 2: Products */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Ürünler ({issue.cartData?.items?.length || 0})
              </h4>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {issue.cartData?.items?.map((item, idx) => (
                  <ProductDetail
                    key={`${item.productId}-${idx}`}
                    item={item}
                    productInfo={productInfoMap.get(item.productId)}
                  />
                ))}
                {(!issue.cartData?.items ||
                  issue.cartData.items.length === 0) && (
                  <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4 text-center">
                    Ürün bilgisi bulunamadı
                  </div>
                )}
              </div>
            </div>

            {/* Column 3: Error Details & Actions */}
            <div className="space-y-4">
              {(issue.errorMessage || issue.orderError) && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Hata Detayı
                  </h4>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-800 break-words">
                      {issue.orderError || issue.errorMessage}
                    </p>
                  </div>
                </div>
              )}

              {issue.rawResponse && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Banka Yanıtı
                  </h4>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      {issue.rawResponse.Response && (
                        <>
                          <span className="text-gray-500">Yanıt:</span>
                          <span className="font-mono">
                            {String(issue.rawResponse.Response)}
                          </span>
                        </>
                      )}
                      {issue.rawResponse.mdStatus && (
                        <>
                          <span className="text-gray-500">mdStatus:</span>
                          <span className="font-mono">
                            {String(issue.rawResponse.mdStatus)}
                          </span>
                        </>
                      )}
                      {issue.rawResponse.ProcReturnCode && (
                        <>
                          <span className="text-gray-500">ReturnCode:</span>
                          <span className="font-mono">
                            {String(issue.rawResponse.ProcReturnCode)}
                          </span>
                        </>
                      )}
                      {issue.rawResponse.ErrMsg && (
                        <>
                          <span className="text-gray-500">Hata:</span>
                          <span className="font-mono text-red-600">
                            {String(issue.rawResponse.ErrMsg)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Zaman Bilgileri
                </h4>
                <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Oluşturulma:</span>
                    <span className="font-mono">
                      {issue.createdAt ? formatDate(issue.createdAt) : "-"}
                    </span>
                  </div>
                  {issue.expiresAt && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Son Geçerlilik:</span>
                      <span className="font-mono">
                        {formatDate(issue.expiresAt)}
                      </span>
                    </div>
                  )}
                  {issue.resolvedAt && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Çözülme:</span>
                      <span className="font-mono text-green-600">
                        {formatDate(issue.resolvedAt)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Admin Notları
                </h4>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Not ekle..."
                  rows={3}
                  className="w-full text-sm border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleSaveNote}
                    disabled={saving}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {saving ? "Kaydediliyor..." : "Notu Kaydet"}
                  </button>
                  {issue.status !== "resolved" && (
                    <button
                      onClick={() => onResolve(issue.id)}
                      className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      Çözüldü Olarak İşaretle
                    </button>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Hızlı Bağlantılar
                </h4>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => copyToClipboard(issue.orderNumber)}
                    className="inline-flex items-center gap-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-md px-2 py-1 transition-colors"
                  >
                    <Copy className="w-3 h-3" />
                    Sipariş No Kopyala
                  </button>
                  <button
                    onClick={() => copyToClipboard(issue.userId)}
                    className="inline-flex items-center gap-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-md px-2 py-1 transition-colors"
                  >
                    <Copy className="w-3 h-3" />
                    User ID Kopyala
                  </button>
                  {issue.orderId && (
                    <button
                      onClick={() => copyToClipboard(issue.orderId!)}
                      className="inline-flex items-center gap-1 text-xs bg-green-100 hover:bg-green-200 text-green-700 rounded-md px-2 py-1 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Order ID Kopyala
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function PaymentIssuesPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [issues, setIssues] = useState<PaymentIssue[]>([]);
  const [taskAlerts, setTaskAlerts] = useState<TaskAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [productInfoMap, setProductInfoMap] = useState<
    Map<string, ProductInfo>
  >(new Map());
  const [showResolved, setShowResolved] = useState(false);

  // --- Fetch task failure alerts from _payment_alerts ---
  const fetchTaskAlerts = useCallback(async () => {
    try {
      const alertsRef = collection(db, "_payment_alerts");

      let q;
      if (showResolved) {
        q = query(alertsRef, orderBy("timestamp", "desc"), limit(200));
      } else {
        q = query(
          alertsRef,
          where("isResolved", "==", false),
          orderBy("timestamp", "desc"),
          limit(200),
        );
      }

      const snapshot = await getDocs(q);
      const alerts: TaskAlert[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        alerts.push({
          id: docSnap.id,
          type: data.type || "",
          severity: data.severity || "low",
          orderNumber: data.orderNumber || "",
          orderId: data.orderId || "",
          userId: data.userId || "",
          buyerName: data.buyerName || "",
          amount: data.amount || 0,
          errorMessage: data.errorMessage || "",
          isRead: data.isRead || false,
          isResolved: data.isResolved || false,
          timestamp: data.timestamp,
          detectedBy: data.detectedBy || "",
          pendingPaymentId: data.pendingPaymentId,
          buyerEmail: data.buyerEmail,
          buyerPhone: data.buyerPhone,
          clientAmount: data.clientAmount,
          serverCalculation: data.serverCalculation,
          itemCount: data.itemCount,
          itemsSummary: data.itemsSummary,
          previousStatus: data.previousStatus,
        });
      });

      setTaskAlerts(alerts);
    } catch (error) {
      console.error("Error fetching task alerts:", error);
    }
  }, [showResolved]);

  // --- Fetch payment issues ---
  const fetchIssues = useCallback(async () => {
    try {
      const pendingRef = collection(db, "pendingPayments");

      const problemStatuses = [
        "payment_succeeded_order_failed",
        "payment_failed",
        "hash_verification_failed",
        "processing",
        "awaiting_3d",
      ];

      if (showResolved) {
        problemStatuses.push("resolved");
      }

      const q = query(
        pendingRef,
        where("status", "in", problemStatuses),
        orderBy("createdAt", "desc"),
        limit(200),
      );

      const snapshot = await getDocs(q);
      const fetchedIssues: PaymentIssue[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        fetchedIssues.push({
          id: docSnap.id,
          userId: data.userId || "",
          status: data.status || "unknown",
          amount: data.amount || 0,
          clientAmount: data.clientAmount,
          formattedAmount: data.formattedAmount || "0",
          orderNumber: data.orderNumber || docSnap.id,
          orderId: data.orderId,
          customerInfo: data.customerInfo || { name: "", email: "", phone: "" },
          cartData: data.cartData || {
            items: [],
            cartCalculatedTotal: 0,
            deliveryOption: "normal",
            deliveryPrice: 0,
          },
          serverCalculation: data.serverCalculation,
          errorMessage: data.errorMessage,
          orderError: data.orderError,
          createdAt: data.createdAt,
          expiresAt: data.expiresAt,
          rawResponse: data.rawResponse,
          callbackLogId: data.callbackLogId,
          adminNotes: data.adminNotes,
          resolvedAt: data.resolvedAt,
          resolvedBy: data.resolvedBy,
        });
      });

      const now = Date.now();
      const filteredIssues = fetchedIssues.filter((issue) => {
        if (issue.status === "awaiting_3d" && issue.createdAt) {
          return now - issue.createdAt.toMillis() > 15 * 60 * 1000;
        }
        if (issue.status === "processing" && issue.createdAt) {
          return now - issue.createdAt.toMillis() > 5 * 60 * 1000;
        }
        return true;
      });

      filteredIssues.sort((a, b) => {
        const sevA = STATUS_CONFIG[a.status]?.severity ?? 99;
        const sevB = STATUS_CONFIG[b.status]?.severity ?? 99;
        if (sevA !== sevB) return sevA - sevB;
        const timeA = a.createdAt?.toMillis() ?? 0;
        const timeB = b.createdAt?.toMillis() ?? 0;
        return timeB - timeA;
      });

      setIssues(filteredIssues);

      const allProductIds = new Set<string>();
      filteredIssues.forEach((issue) => {
        issue.cartData?.items?.forEach((item) => {
          if (item.productId) allProductIds.add(item.productId);
        });
      });

      if (allProductIds.size > 0) {
        await fetchProductInfo(Array.from(allProductIds));
      }
    } catch (error) {
      console.error("Error fetching payment issues:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showResolved]);

  // --- Fetch product details ---
  const fetchProductInfo = async (productIds: string[]) => {
    const infoMap = new Map<string, ProductInfo>();
    const BATCH_SIZE = 10;

    for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
      const batch = productIds.slice(i, i + BATCH_SIZE);

      try {
        const q = query(
          collection(db, "shop_products"),
          where("__name__", "in", batch),
        );
        const snapshot = await getDocs(q);

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          infoMap.set(docSnap.id, {
            productName: data.productName || "Bilinmeyen Ürün",
            imageUrl:
              data.imageUrls && data.imageUrls.length > 0
                ? data.imageUrls[0]
                : "",
            sellerName: data.sellerName || "Bilinmiyor",
            sellerId: data.shopId || data.userId || "",
            shopId: data.shopId,
            isShop: !!data.shopId,
            price: data.price || 0,
            currency: data.currency || "TL",
          });
        });
      } catch (error) {
        console.error("Error fetching product batch:", error);
      }
    }

    setProductInfoMap(infoMap);
  };

  // --- Resolve payment issue ---
  const handleResolve = async (issueId: string) => {
    try {
      const ref = doc(db, "pendingPayments", issueId);
      await updateDoc(ref, {
        status: "resolved",
        resolvedAt: Timestamp.now(),
        resolvedBy: user?.email || user?.uid || "admin",
      });

      setIssues((prev) =>
        prev.map((i) =>
          i.id === issueId
            ? {
                ...i,
                status: "resolved",
                resolvedAt: Timestamp.now(),
                resolvedBy: user?.email || "admin",
              }
            : i,
        ),
      );
    } catch (error) {
      console.error("Error resolving issue:", error);
    }
  };

  // --- Resolve task alert ---
  const handleResolveTaskAlert = async (alertId: string) => {
    try {
      const ref = doc(db, "_payment_alerts", alertId);
      await updateDoc(ref, {
        isResolved: true,
        resolvedAt: Timestamp.now(),
        resolvedBy: user?.email || user?.uid || "admin",
      });

      setTaskAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, isResolved: true } : a)),
      );
    } catch (error) {
      console.error("Error resolving task alert:", error);
    }
  };

  // --- Add admin note ---
  const handleAddNote = async (issueId: string, note: string) => {
    try {
      const ref = doc(db, "pendingPayments", issueId);
      await updateDoc(ref, {
        adminNotes: note,
      });

      setIssues((prev) =>
        prev.map((i) => (i.id === issueId ? { ...i, adminNotes: note } : i)),
      );
    } catch (error) {
      console.error("Error saving note:", error);
    }
  };

  // --- Refresh ---
  const handleRefresh = () => {
    setRefreshing(true);
    fetchIssues();
    fetchTaskAlerts();
  };

  // --- Initial fetch ---
  useEffect(() => {
    if (user) {
      fetchIssues();
      fetchTaskAlerts();
    }
  }, [user, fetchIssues, fetchTaskAlerts]);

  // --- Only task alerts that are actual task failures ---
  const taskFailureAlerts = useMemo(() => {
    return taskAlerts.filter((a) => isTaskAlert(a.type));
  }, [taskAlerts]);

  // --- Non-task alerts (payment-level alerts from alertOnPaymentIssue / detectPaymentAnomalies) ---
  // These are already covered by the pendingPayments query, so we don't show them separately

  // --- Filtered & searched issues ---
  const displayedIssues = useMemo(() => {
    let result = issues;

    if (filter === "task_failures") return []; // Task failures shown separately

    if (filter !== "all") {
      result = result.filter(
        (i) => getStatusCategory(i.status, i.createdAt) === filter,
      );
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (i) =>
          i.orderNumber.toLowerCase().includes(term) ||
          i.customerInfo?.name?.toLowerCase().includes(term) ||
          i.customerInfo?.email?.toLowerCase().includes(term) ||
          i.customerInfo?.phone?.includes(term) ||
          i.userId.toLowerCase().includes(term),
      );
    }

    return result;
  }, [issues, filter, searchTerm]);

  // --- Filtered task alerts ---
  const displayedTaskAlerts = useMemo(() => {
    if (filter !== "all" && filter !== "task_failures") return [];

    let result = taskFailureAlerts;

    if (!showResolved) {
      result = result.filter((a) => !a.isResolved);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (a) =>
          a.orderId?.toLowerCase().includes(term) ||
          a.orderNumber?.toLowerCase().includes(term) ||
          a.buyerName?.toLowerCase().includes(term) ||
          a.userId?.toLowerCase().includes(term) ||
          a.errorMessage?.toLowerCase().includes(term),
      );
    }

    return result;
  }, [taskFailureAlerts, filter, searchTerm, showResolved]);

  // --- Filter counts ---
  const filterCounts = useMemo(() => {
    const unresolvedTaskFailures = taskFailureAlerts.filter(
      (a) => !a.isResolved,
    ).length;
    return {
      all: issues.length + unresolvedTaskFailures,
      critical: issues.filter(
        (i) => getStatusCategory(i.status, i.createdAt) === "critical",
      ).length,
      failed: issues.filter(
        (i) => getStatusCategory(i.status, i.createdAt) === "failed",
      ).length,
      stuck: issues.filter(
        (i) => getStatusCategory(i.status, i.createdAt) === "stuck",
      ).length,
      expired: issues.filter(
        (i) => getStatusCategory(i.status, i.createdAt) === "expired",
      ).length,
      task_failures: unresolvedTaskFailures,
      resolved: issues.filter((i) => i.status === "resolved").length,
    };
  }, [issues, taskFailureAlerts]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-[1600px] mx-auto px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push("/")}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-gray-600" />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-red-500 to-orange-600 rounded-lg flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h1 className="text-base font-bold text-gray-900">
                    Ödeme Sorunları
                  </h1>
                  <p className="text-xs text-gray-500">
                    Ödeme anomalileri, hatalar ve görev başarısızlıkları
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Sipariş no, müşteri adı, email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showResolved}
                  onChange={(e) => {
                    setShowResolved(e.target.checked);
                    setLoading(true);
                  }}
                  className="rounded border-gray-300"
                />
                Çözülenleri göster
              </label>

              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all text-xs font-medium disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
                />
                Yenile
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-[1600px] mx-auto p-4">
          <SummaryStats issues={issues} taskAlerts={taskAlerts} />

          {/* Filter Tabs */}
          <div className="flex gap-1 mb-4 bg-white border border-gray-100 rounded-lg p-1">
            {(
              [
                { key: "all", label: "Tümü" },
                { key: "critical", label: "Kritik" },
                { key: "stuck", label: "Takılı" },
                { key: "failed", label: "Başarısız" },
                { key: "expired", label: "Süresi Dolmuş" },
                { key: "task_failures", label: "Görev Hataları" },
                { key: "resolved", label: "Çözüldü" },
              ] as { key: StatusFilter; label: string }[]
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  filter === tab.key
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {tab.key === "task_failures" && <Zap className="w-3 h-3" />}
                {tab.label}
                {filterCounts[tab.key] > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-xs ${
                      filter === tab.key
                        ? "bg-white/20 text-white"
                        : tab.key === "critical" && filterCounts.critical > 0
                          ? "bg-red-100 text-red-700"
                          : tab.key === "task_failures" &&
                              filterCounts.task_failures > 0
                            ? "bg-purple-100 text-purple-700"
                            : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {filterCounts[tab.key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Issues List */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex items-center gap-3 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Yükleniyor...</span>
              </div>
            </div>
          ) : (
            <>
              {/* Payment Issues */}
              {filter !== "task_failures" && displayedIssues.length > 0 && (
                <div className="space-y-2">
                  {displayedIssues.map((issue) => (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      productInfoMap={productInfoMap}
                      onResolve={handleResolve}
                      onAddNote={handleAddNote}
                    />
                  ))}
                </div>
              )}

              {/* Task Failure Alerts */}
              {(filter === "all" || filter === "task_failures") &&
                displayedTaskAlerts.length > 0 && (
                  <div
                    className={
                      filter === "all" && displayedIssues.length > 0
                        ? "mt-6"
                        : ""
                    }
                  >
                    {filter === "all" && displayedTaskAlerts.length > 0 && (
                      <div className="flex items-center gap-2 mb-3">
                        <Zap className="w-4 h-4 text-purple-600" />
                        <h2 className="text-sm font-semibold text-gray-700">
                          Görev Hataları
                        </h2>
                        <span className="text-xs text-gray-500">
                          Sipariş başarılı ama bir post-order görevi başarısız
                          oldu
                        </span>
                      </div>
                    )}
                    <div className="space-y-2">
                      {displayedTaskAlerts.map((alert) => (
                        <TaskAlertCard
                          key={alert.id}
                          alert={alert}
                          onResolve={handleResolveTaskAlert}
                        />
                      ))}
                    </div>
                  </div>
                )}

              {/* Empty state */}
              {displayedIssues.length === 0 &&
                displayedTaskAlerts.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 bg-white rounded-lg border border-gray-100">
                    <CheckCircle2 className="w-12 h-12 text-green-400 mb-3" />
                    <p className="text-sm font-medium text-gray-900">
                      Sorun bulunamadı
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {filter !== "all"
                        ? "Bu filtrede herhangi bir sorun yok"
                        : "Tüm ödemeler ve görevler sorunsuz çalışıyor"}
                    </p>
                  </div>
                )}
            </>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
