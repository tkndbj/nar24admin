"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import { useState, useEffect, useCallback } from "react";
import {
  collection,
  doc,
  Timestamp,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  X,
  Calendar,
  User,
  Store,
  Image as ImageIcon,
  Loader2,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Play,
  Tag,
  Truck,
  Palette,
  Phone,
  MapPin,
  Info,
  Layers,
  Eye,
  DollarSign,
  Box,
  Star,
  ShoppingCart,
  Heart,
  MousePointer,
  Zap,
  TrendingUp,
  Video,
  Archive,
  ArchiveRestore,
  AlertCircle,
  Shield,
  Clock,
  FileText,
} from "lucide-react";
import { ProductUtils } from "../../models/Product";

// ── Firebase Functions (europe-west3) ──
const functions = getFunctions(undefined, "europe-west3");
const adminToggleArchiveFn = httpsCallable(
  functions,
  "adminToggleProductArchiveStatus",
);

const PAGE_SIZE = 20;

// ── Types ──
interface ArchivedProduct {
  id: string;
  ilan_no: string;
  ilanNo: string;
  productName: string;
  description: string;
  price: number;
  currency: string;
  condition: string;
  brandModel?: string;
  imageUrls: string[];
  averageRating: number;
  reviewCount: number;
  gender?: string;
  colorQuantities: Record<string, number>;
  availableColors: string[];
  userId: string;
  ownerId: string;
  shopId?: string;
  createdAt: Timestamp;
  sellerName: string;
  category: string;
  subcategory: string;
  subsubcategory: string;
  quantity: number;
  sold: boolean;
  clickCount: number;
  favoritesCount: number;
  cartCount: number;
  purchaseCount: number;
  deliveryOption: string;
  isFeatured: boolean;
  isTrending: boolean;
  isBoosted: boolean;
  paused: boolean;
  colorImages: Record<string, string[]>;
  videoUrl?: string;
  attributes: Record<string, unknown>;
  phone?: string;
  region?: string;
  address?: string;
  // Archive-specific fields
  archivedByAdmin: boolean;
  archivedByAdminAt?: Timestamp;
  archivedByAdminId?: string;
  needsUpdate: boolean;
  archiveReason?: string;
  adminArchiveReason?: string;
  originalPrice?: number;
  discountPercentage?: number;
  maxQuantity?: number;
  bulkDiscountPercentage?: number;
  campaign?: string;
  campaignName?: string;
}

type TabType = "dukkan" | "vitrin";

// ── Detail Modal ──
function ArchivedProductDetailModal({
  product,
  shopName,
  adminName,
  onClose,
  onUnarchive,
  isProcessing,
}: {
  product: ArchivedProduct;
  shopName?: string;
  adminName?: string;
  onClose: () => void;
  onUnarchive: () => void;
  isProcessing: boolean;
}) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<"images" | "colors" | "video">(
    "images",
  );
  const [selectedColorForPreview, setSelectedColorForPreview] = useState<
    string | null
  >(null);

  const allImages = product.imageUrls || [];
  const hasColorImages = Object.keys(product.colorImages || {}).length > 0;
  const hasVideo = !!product.videoUrl;

  const formatDate = (timestamp: Timestamp | undefined) => {
    if (!timestamp) return null;
    try {
      return timestamp.toDate().toLocaleDateString("tr-TR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return null;
    }
  };

  const formatPrice = (price: number, currency: string = "TL") =>
    `${price?.toLocaleString("tr-TR")} ${currency}`;

  const Section = ({
    title,
    icon: Icon,
    children,
    className = "",
  }: {
    title: string;
    icon: React.ElementType;
    children: React.ReactNode;
    className?: string;
  }) => (
    <div
      className={`bg-white rounded-lg border border-gray-200 overflow-hidden ${className}`}
    >
      <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 text-gray-600" />
        <h3 className="font-semibold text-gray-800 text-xs">{title}</h3>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );

  const DetailRow = ({
    label,
    value,
    icon: Icon,
    valueClassName = "",
  }: {
    label: string;
    value: React.ReactNode;
    icon?: React.ElementType;
    valueClassName?: string;
  }) => {
    if (
      value === null ||
      value === undefined ||
      value === "" ||
      (Array.isArray(value) && value.length === 0)
    )
      return null;
    return (
      <div className="flex items-start justify-between py-1 border-b border-gray-100 last:border-b-0">
        <div className="flex items-center gap-1.5 text-gray-600 text-xs">
          {Icon && <Icon className="w-3.5 h-3.5" />}
          <span>{label}</span>
        </div>
        <div
          className={`text-xs font-medium text-gray-900 text-right max-w-[60%] ${valueClassName}`}
        >
          {value}
        </div>
      </div>
    );
  };

  const Badge = ({
    children,
    variant = "default",
  }: {
    children: React.ReactNode;
    variant?: "default" | "success" | "warning" | "error" | "info";
  }) => {
    const variants = {
      default: "bg-gray-100 text-gray-700",
      success: "bg-green-100 text-green-700",
      warning: "bg-yellow-100 text-yellow-700",
      error: "bg-red-100 text-red-700",
      info: "bg-blue-100 text-blue-700",
    };
    return (
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${variants[variant]}`}
      >
        {children}
      </span>
    );
  };

  const getAttributeDisplayName = (key: string): string => {
    const names: Record<string, string> = {
      gender: "Cinsiyet",
      clothingSizes: "Beden",
      clothingSize: "Beden",
      clothingFit: "Kalıp",
      clothingType: "Giysi Tipi",
      footwearSizes: "Ayakkabı Numarası",
      footwearGender: "Cinsiyet",
      pantSizes: "Pantolon Bedeni",
      jewelryType: "Takı Tipi",
      jewelryMaterial: "Malzeme",
      jewelryMaterials: "Malzemeler",
      computerComponent: "Bilgisayar Parçası",
      consoleBrand: "Konsol Markası",
      consoleVariant: "Konsol Varyantı",
      kitchenAppliance: "Mutfak Aleti",
      whiteGood: "Beyaz Eşya",
      fantasyWearType: "Fantezi Giyim Tipi",
      selectedFantasyWearType: "Fantezi Giyim Tipi",
    };
    return (
      names[key] ||
      key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, " $1")
    );
  };

  const formatAttributeValue = (value: unknown): string => {
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "boolean") return value ? "Evet" : "Hayır";
    return String(value);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-gray-50 rounded-xl shadow-2xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
              <Archive className="w-4 h-4 text-red-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900 line-clamp-1">
                {product.productName}
              </h2>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-500">
                  ID: {product.ilan_no || product.id}
                </span>
                <Badge variant="error">Arşivlenmiş</Badge>
                {product.needsUpdate && (
                  <Badge variant="warning">Güncelleme Gerekli</Badge>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Left Column */}
            <div className="space-y-3">
              {/* Archive Info Banner */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <div className="space-y-1 flex-1">
                    <p className="text-xs font-semibold text-red-800">
                      Arşivlenme Bilgisi
                    </p>
                    {product.archivedByAdminAt && (
                      <p className="text-[11px] text-red-700">
                        <Clock className="w-3 h-3 inline mr-1" />
                        {formatDate(product.archivedByAdminAt)}
                      </p>
                    )}
                    {adminName && (
                      <p className="text-[11px] text-red-700">
                        <Shield className="w-3 h-3 inline mr-1" />
                        {adminName}
                      </p>
                    )}
                    {product.archiveReason && (
                      <p className="text-[11px] text-red-700">
                        <FileText className="w-3 h-3 inline mr-1" />
                        {product.archiveReason}
                      </p>
                    )}
                    {!product.archiveReason && product.adminArchiveReason && (
                      <p className="text-[11px] text-red-700">
                        <FileText className="w-3 h-3 inline mr-1" />
                        {product.adminArchiveReason}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Media */}
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="flex border-b border-gray-200">
                  <button
                    onClick={() => setActiveTab("images")}
                    className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${activeTab === "images" ? "bg-blue-50 text-blue-700 border-b-2 border-blue-600" : "text-gray-600 hover:bg-gray-50"}`}
                  >
                    <ImageIcon className="w-3.5 h-3.5 inline mr-1" />
                    Görseller ({allImages.length})
                  </button>
                  {hasColorImages && (
                    <button
                      onClick={() => setActiveTab("colors")}
                      className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${activeTab === "colors" ? "bg-blue-50 text-blue-700 border-b-2 border-blue-600" : "text-gray-600 hover:bg-gray-50"}`}
                    >
                      <Palette className="w-3.5 h-3.5 inline mr-1" />
                      Renkler
                    </button>
                  )}
                  {hasVideo && (
                    <button
                      onClick={() => setActiveTab("video")}
                      className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${activeTab === "video" ? "bg-blue-50 text-blue-700 border-b-2 border-blue-600" : "text-gray-600 hover:bg-gray-50"}`}
                    >
                      <Video className="w-3.5 h-3.5 inline mr-1" />
                      Video
                    </button>
                  )}
                </div>
                <div className="p-2">
                  {activeTab === "images" && (
                    <>
                      {allImages.length > 0 ? (
                        <>
                          <div className="relative aspect-[4/3] bg-gray-100 rounded-lg overflow-hidden mb-2">
                            <img
                              src={allImages[activeImageIndex]}
                              alt={`Ürün görseli ${activeImageIndex + 1}`}
                              className="w-full h-full object-contain"
                            />
                            {allImages.length > 1 && (
                              <>
                                <button
                                  onClick={() =>
                                    setActiveImageIndex((p) =>
                                      p === 0 ? allImages.length - 1 : p - 1,
                                    )
                                  }
                                  className="absolute left-1.5 top-1/2 -translate-y-1/2 p-1.5 bg-white/90 rounded-full shadow-lg hover:bg-white transition-colors"
                                >
                                  <ChevronLeft className="w-4 h-4 text-gray-700" />
                                </button>
                                <button
                                  onClick={() =>
                                    setActiveImageIndex((p) =>
                                      p === allImages.length - 1 ? 0 : p + 1,
                                    )
                                  }
                                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 bg-white/90 rounded-full shadow-lg hover:bg-white transition-colors"
                                >
                                  <ChevronRight className="w-4 h-4 text-gray-700" />
                                </button>
                                <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                                  {activeImageIndex + 1} / {allImages.length}
                                </div>
                              </>
                            )}
                          </div>
                          {allImages.length > 1 && (
                            <div className="flex gap-1.5 overflow-x-auto pb-1">
                              {allImages.map((url, i) => (
                                <button
                                  key={i}
                                  onClick={() => setActiveImageIndex(i)}
                                  className={`flex-shrink-0 w-12 h-12 rounded overflow-hidden border-2 transition-all ${i === activeImageIndex ? "border-blue-500 ring-1 ring-blue-200" : "border-gray-200 hover:border-gray-300"}`}
                                >
                                  <img
                                    src={url}
                                    alt={`Thumb ${i + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="aspect-[4/3] bg-gray-100 rounded-lg flex items-center justify-center">
                          <div className="text-center text-gray-400">
                            <ImageIcon className="w-8 h-8 mx-auto mb-1" />
                            <p className="text-xs">Görsel yok</p>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {activeTab === "colors" && hasColorImages && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {Object.keys(product.colorImages).map((color) => (
                          <button
                            key={color}
                            onClick={() =>
                              setSelectedColorForPreview(
                                selectedColorForPreview === color
                                  ? null
                                  : color,
                              )
                            }
                            className={`px-2 py-1 rounded text-xs font-medium transition-all ${selectedColorForPreview === color ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                          >
                            {color}
                            {product.colorQuantities?.[color] !== undefined && (
                              <span className="ml-0.5 opacity-70">
                                ({product.colorQuantities[color]})
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                      {selectedColorForPreview &&
                        product.colorImages[selectedColorForPreview] && (
                          <div className="grid grid-cols-3 gap-1.5">
                            {product.colorImages[selectedColorForPreview].map(
                              (url, idx) => (
                                <div
                                  key={idx}
                                  className="aspect-square bg-gray-100 rounded overflow-hidden"
                                >
                                  <img
                                    src={url}
                                    alt={`${selectedColorForPreview} - ${idx + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              ),
                            )}
                          </div>
                        )}
                      {!selectedColorForPreview && (
                        <p className="text-xs text-gray-500 text-center py-2">
                          Görüntülemek için bir renk seçin
                        </p>
                      )}
                    </div>
                  )}
                  {activeTab === "video" && hasVideo && (
                    <div className="aspect-video bg-black rounded-lg overflow-hidden">
                      <video
                        src={product.videoUrl}
                        controls
                        className="w-full h-full"
                        poster={allImages[0]}
                      >
                        Tarayıcınız video etiketini desteklemiyor.
                      </video>
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              {product.description && (
                <Section title="Açıklama" icon={Info}>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto">
                    {product.description}
                  </p>
                </Section>
              )}
            </div>

            {/* Right Column */}
            <div className="space-y-2">
              {/* Price & Stock */}
              <Section title="Fiyat ve Stok" icon={DollarSign}>
                <div className="space-y-0.5">
                  <DetailRow
                    label="Fiyat"
                    value={formatPrice(product.price, product.currency)}
                    icon={Tag}
                    valueClassName="text-green-600 text-sm font-bold"
                  />
                  {product.originalPrice &&
                    product.originalPrice > product.price && (
                      <DetailRow
                        label="Orijinal Fiyat"
                        value={
                          <span className="line-through text-gray-400">
                            {formatPrice(
                              product.originalPrice,
                              product.currency,
                            )}
                          </span>
                        }
                      />
                    )}
                  {product.discountPercentage &&
                    product.discountPercentage > 0 && (
                      <DetailRow
                        label="İndirim"
                        value={
                          <Badge variant="error">
                            %{product.discountPercentage}
                          </Badge>
                        }
                      />
                    )}
                  <DetailRow
                    label="Stok Miktarı"
                    value={product.quantity}
                    icon={Box}
                  />
                  <DetailRow
                    label="Durum"
                    value={product.condition}
                    icon={Star}
                  />
                </div>
              </Section>

              {/* Category */}
              <Section title="Kategori" icon={Layers}>
                <div className="space-y-1">
                  <DetailRow label="Ana Kategori" value={product.category} />
                  {product.subcategory && (
                    <DetailRow
                      label="Alt Kategori"
                      value={product.subcategory}
                    />
                  )}
                  {product.subsubcategory && (
                    <DetailRow
                      label="Alt Alt Kategori"
                      value={product.subsubcategory}
                    />
                  )}
                  {product.brandModel && (
                    <DetailRow
                      label="Marka / Model"
                      value={product.brandModel}
                    />
                  )}
                </div>
              </Section>

              {/* Attributes */}
              {(product.gender ||
                (product.attributes &&
                  Object.keys(product.attributes).length > 0)) && (
                <Section title="Ürün Özellikleri" icon={Tag}>
                  <div className="space-y-1">
                    {product.gender && (
                      <DetailRow label="Cinsiyet" value={product.gender} />
                    )}
                    {product.attributes &&
                      Object.entries(product.attributes).map(([key, value]) => {
                        if (key === "gender" || !value) return null;
                        const dv = formatAttributeValue(value);
                        if (!dv) return null;
                        return (
                          <DetailRow
                            key={key}
                            label={getAttributeDisplayName(key)}
                            value={dv}
                          />
                        );
                      })}
                  </div>
                </Section>
              )}

              {/* Colors */}
              {product.availableColors &&
                product.availableColors.length > 0 && (
                  <Section title="Renkler ve Stok" icon={Palette}>
                    <div className="space-y-1">
                      {product.availableColors.map((color) => (
                        <div
                          key={color}
                          className="flex items-center justify-between py-1 px-2 bg-gray-50 rounded"
                        >
                          <span className="text-xs font-medium text-gray-700">
                            {color}
                          </span>
                          {product.colorQuantities?.[color] !== undefined && (
                            <Badge variant="info">
                              {product.colorQuantities[color]} adet
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

              {/* Delivery */}
              <Section title="Teslimat" icon={Truck}>
                <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                  <div
                    className={`w-7 h-7 rounded flex items-center justify-center ${product.deliveryOption === "Fast Delivery" ? "bg-yellow-100" : "bg-blue-100"}`}
                  >
                    {product.deliveryOption === "Fast Delivery" ? (
                      <Zap className="w-3.5 h-3.5 text-yellow-600" />
                    ) : (
                      <Truck className="w-3.5 h-3.5 text-blue-600" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-xs">
                      {product.deliveryOption}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {product.deliveryOption === "Fast Delivery"
                        ? "Hızlı teslimat"
                        : "Satıcı gönderimi"}
                    </p>
                  </div>
                </div>
              </Section>

              {/* Seller Info */}
              <Section title="Satıcı Bilgileri" icon={User}>
                <div className="space-y-1">
                  {product.shopId && shopName && (
                    <DetailRow label="Mağaza" value={shopName} icon={Store} />
                  )}
                  <DetailRow label="Satıcı Adı" value={product.sellerName} />
                  {product.phone && (
                    <DetailRow
                      label="Telefon"
                      value={product.phone}
                      icon={Phone}
                    />
                  )}
                  {product.region && (
                    <DetailRow
                      label="Bölge"
                      value={product.region}
                      icon={MapPin}
                    />
                  )}
                  {product.address && (
                    <DetailRow
                      label="Adres"
                      value={product.address}
                      icon={MapPin}
                    />
                  )}
                </div>
              </Section>

              {/* Stats */}
              {(product.clickCount > 0 ||
                product.favoritesCount > 0 ||
                product.cartCount > 0 ||
                product.purchaseCount > 0 ||
                product.averageRating > 0) && (
                <Section title="İstatistikler" icon={TrendingUp}>
                  <div className="grid grid-cols-4 gap-1.5">
                    {product.clickCount > 0 && (
                      <div className="bg-gray-50 rounded p-1.5 text-center">
                        <MousePointer className="w-3.5 h-3.5 text-gray-400 mx-auto" />
                        <p className="text-sm font-bold text-gray-900">
                          {product.clickCount}
                        </p>
                        <p className="text-[10px] text-gray-500">Tıklama</p>
                      </div>
                    )}
                    {product.favoritesCount > 0 && (
                      <div className="bg-gray-50 rounded p-1.5 text-center">
                        <Heart className="w-3.5 h-3.5 text-red-400 mx-auto" />
                        <p className="text-sm font-bold text-gray-900">
                          {product.favoritesCount}
                        </p>
                        <p className="text-[10px] text-gray-500">Favori</p>
                      </div>
                    )}
                    {product.cartCount > 0 && (
                      <div className="bg-gray-50 rounded p-1.5 text-center">
                        <ShoppingCart className="w-3.5 h-3.5 text-blue-400 mx-auto" />
                        <p className="text-sm font-bold text-gray-900">
                          {product.cartCount}
                        </p>
                        <p className="text-[10px] text-gray-500">Sepet</p>
                      </div>
                    )}
                    {product.purchaseCount > 0 && (
                      <div className="bg-gray-50 rounded p-1.5 text-center">
                        <CheckCircle className="w-3.5 h-3.5 text-green-400 mx-auto" />
                        <p className="text-sm font-bold text-gray-900">
                          {product.purchaseCount}
                        </p>
                        <p className="text-[10px] text-gray-500">Satış</p>
                      </div>
                    )}
                  </div>
                  {product.averageRating > 0 && (
                    <div className="mt-1.5 flex items-center justify-center gap-1.5 bg-yellow-50 rounded p-1.5">
                      <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                      <span className="text-sm font-bold text-gray-900">
                        {product.averageRating.toFixed(1)}
                      </span>
                      <span className="text-[10px] text-gray-500">
                        ({product.reviewCount} değerlendirme)
                      </span>
                    </div>
                  )}
                </Section>
              )}

              {/* Timestamps */}
              <Section title="Tarihler" icon={Calendar}>
                <div className="space-y-1">
                  <DetailRow
                    label="Oluşturulma"
                    value={formatDate(product.createdAt)}
                  />
                  {product.archivedByAdminAt && (
                    <DetailRow
                      label="Arşivlenme"
                      value={formatDate(product.archivedByAdminAt)}
                    />
                  )}
                </div>
              </Section>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-white border-t border-gray-200 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium text-sm"
          >
            Kapat
          </button>
          <button
            onClick={onUnarchive}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors disabled:cursor-not-allowed text-sm"
          >
            {isProcessing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ArchiveRestore className="w-3.5 h-3.5" />
            )}
            <span>Arşivden Çıkar</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──
export default function ArchivedProducts() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>("dukkan");

  // Dükkan state
  const [dukkanProducts, setDukkanProducts] = useState<ArchivedProduct[]>([]);
  const [dukkanLoading, setDukkanLoading] = useState(true);
  const [dukkanLoadingMore, setDukkanLoadingMore] = useState(false);
  const [dukkanLastDoc, setDukkanLastDoc] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [dukkanHasMore, setDukkanHasMore] = useState(true);

  // Vitrin state
  const [vitrinProducts, setVitrinProducts] = useState<ArchivedProduct[]>([]);
  const [vitrinLoading, setVitrinLoading] = useState(false);
  const [vitrinLoadingMore, setVitrinLoadingMore] = useState(false);
  const [vitrinLastDoc, setVitrinLastDoc] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [vitrinHasMore, setVitrinHasMore] = useState(true);
  const [vitrinLoaded, setVitrinLoaded] = useState(false);

  // Shared state
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [selectedProduct, setSelectedProduct] =
    useState<ArchivedProduct | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [shopNames, setShopNames] = useState<Record<string, string>>({});
  const [adminNames, setAdminNames] = useState<Record<string, string>>({});

  // Current tab helpers
  const products = activeTab === "dukkan" ? dukkanProducts : vitrinProducts;
  const loading = activeTab === "dukkan" ? dukkanLoading : vitrinLoading;
  const loadingMore =
    activeTab === "dukkan" ? dukkanLoadingMore : vitrinLoadingMore;
  const hasMore = activeTab === "dukkan" ? dukkanHasMore : vitrinHasMore;

  // ── Parse document ──
  const parseDocument = useCallback(
    (docSnap: QueryDocumentSnapshot<DocumentData>): ArchivedProduct => {
      const d = docSnap.data();
      return {
        id: docSnap.id,
        ilan_no: ProductUtils.safeString(d.ilan_no ?? d.ilanNo ?? docSnap.id),
        ilanNo: ProductUtils.safeString(d.ilan_no ?? d.ilanNo ?? docSnap.id),
        productName: ProductUtils.safeString(d.productName),
        description: ProductUtils.safeString(d.description),
        price: ProductUtils.safeDouble(d.price),
        currency: ProductUtils.safeString(d.currency, "TL"),
        condition: ProductUtils.safeString(d.condition, "Brand New"),
        brandModel: ProductUtils.safeStringNullable(d.brandModel) ?? undefined,
        imageUrls: ProductUtils.safeStringArray(d.imageUrls),
        averageRating: ProductUtils.safeDouble(d.averageRating),
        reviewCount: ProductUtils.safeInt(d.reviewCount),
        gender: ProductUtils.safeStringNullable(d.gender) ?? undefined,
        colorQuantities: ProductUtils.safeColorQuantities(d.colorQuantities),
        availableColors: ProductUtils.safeStringArray(d.availableColors),
        userId: ProductUtils.safeString(d.userId),
        ownerId: ProductUtils.safeString(d.ownerId),
        shopId: ProductUtils.safeStringNullable(d.shopId) ?? undefined,
        createdAt: d.createdAt as Timestamp,
        sellerName: ProductUtils.safeString(d.sellerName, "Unknown"),
        category: ProductUtils.safeString(d.category, "Uncategorized"),
        subcategory: ProductUtils.safeString(d.subcategory),
        subsubcategory: ProductUtils.safeString(d.subsubcategory),
        quantity: ProductUtils.safeInt(d.quantity),
        sold: Boolean(d.sold),
        clickCount: ProductUtils.safeInt(d.clickCount),
        favoritesCount: ProductUtils.safeInt(d.favoritesCount),
        cartCount: ProductUtils.safeInt(d.cartCount),
        purchaseCount: ProductUtils.safeInt(d.purchaseCount),
        deliveryOption: ProductUtils.safeString(
          d.deliveryOption,
          "Self Delivery",
        ),
        isFeatured: Boolean(d.isFeatured),
        isTrending: Boolean(d.isTrending),
        isBoosted: Boolean(d.isBoosted),
        paused: Boolean(d.paused),
        colorImages: ProductUtils.safeColorImages(d.colorImages),
        videoUrl: ProductUtils.safeStringNullable(d.videoUrl) ?? undefined,
        attributes: ProductUtils.safeAttributes(d.attributes),
        phone: ProductUtils.safeStringNullable(d.phone) ?? undefined,
        region: ProductUtils.safeStringNullable(d.region) ?? undefined,
        address: ProductUtils.safeStringNullable(d.address) ?? undefined,
        archivedByAdmin: Boolean(d.archivedByAdmin),
        archivedByAdminAt: d.archivedByAdminAt as Timestamp | undefined,
        archivedByAdminId:
          ProductUtils.safeStringNullable(d.archivedByAdminId) ?? undefined,
        needsUpdate: Boolean(d.needsUpdate),
        archiveReason:
          ProductUtils.safeStringNullable(d.archiveReason) ?? undefined,
        adminArchiveReason:
          ProductUtils.safeStringNullable(d.adminArchiveReason) ?? undefined,
        originalPrice:
          d.originalPrice != null
            ? ProductUtils.safeDouble(d.originalPrice)
            : undefined,
        discountPercentage:
          d.discountPercentage != null
            ? ProductUtils.safeInt(d.discountPercentage)
            : undefined,
        maxQuantity:
          d.maxQuantity != null
            ? ProductUtils.safeInt(d.maxQuantity)
            : undefined,
        bulkDiscountPercentage:
          d.bulkDiscountPercentage != null
            ? ProductUtils.safeInt(d.bulkDiscountPercentage)
            : undefined,
        campaign: ProductUtils.safeStringNullable(d.campaign) ?? undefined,
        campaignName:
          ProductUtils.safeStringNullable(d.campaignName) ?? undefined,
      };
    },
    [],
  );

  // ── Fetch page ──
  const fetchPage = useCallback(
    async (
      collectionName: string,
      afterDoc: QueryDocumentSnapshot<DocumentData> | null,
    ) => {
      const ref = collection(db, collectionName);
      const q = afterDoc
        ? query(
            ref,
            orderBy("archivedByAdminAt", "desc"),
            startAfter(afterDoc),
            limit(PAGE_SIZE),
          )
        : query(ref, orderBy("archivedByAdminAt", "desc"), limit(PAGE_SIZE));

      const snapshot = await getDocs(q);
      const items = snapshot.docs.map(parseDocument);
      const last = snapshot.docs[snapshot.docs.length - 1] || null;
      const more = snapshot.docs.length === PAGE_SIZE;

      return { items, lastDoc: last, hasMore: more };
    },
    [parseDocument],
  );

  // ── Load Dükkan (initial) ──
  useEffect(() => {
    const load = async () => {
      setDukkanLoading(true);
      try {
        const {
          items,
          lastDoc: ld,
          hasMore: hm,
        } = await fetchPage("paused_shop_products", null);
        setDukkanProducts(items);
        setDukkanLastDoc(ld);
        setDukkanHasMore(hm);
      } catch (error) {
        console.error("Error loading paused shop products:", error);
      } finally {
        setDukkanLoading(false);
      }
    };
    load();
  }, [fetchPage]);

  // ── Load Vitrin (lazy) ──
  useEffect(() => {
    if (activeTab !== "vitrin" || vitrinLoaded) return;
    const load = async () => {
      setVitrinLoading(true);
      try {
        const {
          items,
          lastDoc: ld,
          hasMore: hm,
        } = await fetchPage("paused_products", null);
        setVitrinProducts(items);
        setVitrinLastDoc(ld);
        setVitrinHasMore(hm);
        setVitrinLoaded(true);
      } catch (error) {
        console.error("Error loading paused products:", error);
      } finally {
        setVitrinLoading(false);
      }
    };
    load();
  }, [activeTab, vitrinLoaded, fetchPage]);

  // ── Load more ──
  const loadMore = useCallback(async () => {
    const isDukkan = activeTab === "dukkan";
    const collectionName = isDukkan
      ? "paused_shop_products"
      : "paused_products";
    const afterDoc = isDukkan ? dukkanLastDoc : vitrinLastDoc;

    if (isDukkan) setDukkanLoadingMore(true);
    else setVitrinLoadingMore(true);

    try {
      const {
        items,
        lastDoc: ld,
        hasMore: hm,
      } = await fetchPage(collectionName, afterDoc);

      if (isDukkan) {
        setDukkanProducts((prev) => [...prev, ...items]);
        setDukkanLastDoc(ld);
        setDukkanHasMore(hm);
      } else {
        setVitrinProducts((prev) => [...prev, ...items]);
        setVitrinLastDoc(ld);
        setVitrinHasMore(hm);
      }
    } catch (error) {
      console.error("Error loading more:", error);
    } finally {
      if (isDukkan) setDukkanLoadingMore(false);
      else setVitrinLoadingMore(false);
    }
  }, [activeTab, dukkanLastDoc, vitrinLastDoc, fetchPage]);

  // ── Fetch shop names ──
  useEffect(() => {
    const fetchNames = async () => {
      const ids = products
        .filter(
          (p) => p.shopId && p.shopId.trim() !== "" && !shopNames[p.shopId!],
        )
        .map((p) => p.shopId!)
        .filter((id, i, self) => self.indexOf(id) === i);

      if (ids.length === 0) return;

      const newNames: Record<string, string> = {};
      for (const id of ids) {
        try {
          const snap = await getDoc(doc(db, "shops", id));
          if (snap.exists()) newNames[id] = snap.data().name || "Unknown Shop";
        } catch (e) {
          console.error(`Error fetching shop ${id}:`, e);
        }
      }
      if (Object.keys(newNames).length > 0)
        setShopNames((prev) => ({ ...prev, ...newNames }));
    };
    if (products.length > 0) fetchNames();
  }, [products, shopNames]);

  // ── Fetch admin names ──
  useEffect(() => {
    const fetchNames = async () => {
      const ids = products
        .filter((p) => p.archivedByAdminId && !adminNames[p.archivedByAdminId!])
        .map((p) => p.archivedByAdminId!)
        .filter((id, i, self) => self.indexOf(id) === i);

      if (ids.length === 0) return;

      const newNames: Record<string, string> = {};
      for (const id of ids) {
        try {
          const snap = await getDoc(doc(db, "users", id));
          if (snap.exists()) {
            const d = snap.data();
            newNames[id] = d.displayName || d.name || d.email || "Admin";
          }
        } catch (e) {
          console.error(`Error fetching admin ${id}:`, e);
        }
      }
      if (Object.keys(newNames).length > 0)
        setAdminNames((prev) => ({ ...prev, ...newNames }));
    };
    if (products.length > 0) fetchNames();
  }, [products, adminNames]);

  // ── Unarchive ──
  const unarchiveProduct = useCallback(
    async (product: ArchivedProduct) => {
      if (processingIds.has(product.id)) return;
      setProcessingIds((prev) => new Set(prev).add(product.id));

      const isDukkan = activeTab === "dukkan";
      const sourceCollectionType = isDukkan
        ? "paused_shop_products"
        : "paused_products";

      try {
        await adminToggleArchiveFn({
          productId: product.id,
          shopId: product.shopId || null,
          archiveStatus: false,
          collection: sourceCollectionType,
          needsUpdate: false,
          archiveReason: null,
        });

        // Remove from local state
        if (isDukkan) {
          setDukkanProducts((prev) => prev.filter((p) => p.id !== product.id));
        } else {
          setVitrinProducts((prev) => prev.filter((p) => p.id !== product.id));
        }

        setShowDetailModal(false);
        setSelectedProduct(null);
        alert("Ürün başarıyla arşivden çıkarıldı!");
      } catch (error: unknown) {
        console.error("Unarchive error:", error);
        const fbError = error as { code?: string; message?: string };
        if (fbError.code === "functions/not-found") {
          alert("Ürün bulunamadı — zaten arşivden çıkarılmış olabilir");
        } else {
          alert(fbError.message || "Arşivden çıkarılırken hata oluştu");
        }
      } finally {
        setProcessingIds((prev) => {
          const s = new Set(prev);
          s.delete(product.id);
          return s;
        });
      }
    },
    [activeTab, processingIds],
  );

  // ── Helpers ──
  const formatDate = (timestamp: Timestamp | undefined) => {
    if (!timestamp) return "—";
    try {
      return timestamp
        .toDate()
        .toLocaleDateString("tr-TR", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
    } catch {
      return "—";
    }
  };

  const formatPrice = (price: number, currency: string) =>
    `${price?.toLocaleString("tr-TR")} ${currency || "TL"}`;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.back()}
                  className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900 transition-colors px-2 py-1 rounded-lg hover:bg-gray-100 text-sm"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span className="font-medium">Geri</span>
                </button>
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-7 h-7 bg-red-600 rounded-lg">
                    <Archive className="w-3.5 h-3.5 text-white" />
                  </div>
                  <h1 className="text-base font-semibold text-gray-900">
                    Arşivlenmiş Ürünler
                  </h1>
                </div>
              </div>
              <div className="bg-red-50 px-3 py-1 rounded-lg border border-red-200">
                <span className="text-xs text-red-700 font-medium">
                  {loading ? "Yükleniyor..." : `${products.length} Ürün`}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4 pt-3">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
            <button
              onClick={() => setActiveTab("dukkan")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === "dukkan" ? "bg-white text-red-600 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
            >
              <Store className="w-4 h-4 inline-block mr-1.5" />
              Dükkan Arşivi
              {!dukkanLoading && (
                <span className="ml-1.5 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                  {dukkanProducts.length}
                  {dukkanHasMore ? "+" : ""}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("vitrin")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === "vitrin" ? "bg-white text-purple-600 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
            >
              <Eye className="w-4 h-4 inline-block mr-1.5" />
              Vitrin Arşivi
              {vitrinLoaded && !vitrinLoading && (
                <span className="ml-1.5 text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full">
                  {vitrinProducts.length}
                  {vitrinHasMore ? "+" : ""}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 py-3">
          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-2 text-gray-600 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Arşivlenmiş ürünler yükleniyor...</span>
              </div>
            </div>
          )}

          {/* Empty */}
          {!loading && products.length === 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
              <div className="inline-flex items-center justify-center w-10 h-10 bg-gray-100 rounded-lg mb-3">
                <Archive className="w-5 h-5 text-gray-400" />
              </div>
              <h3 className="text-sm font-medium text-gray-900 mb-1">
                Arşivlenmiş ürün yok
              </h3>
              <p className="text-gray-500 text-xs">
                Bu kategoride arşivlenmiş ürün bulunmamaktadır.
              </p>
            </div>
          )}

          {/* Table */}
          {!loading && products.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* Table Header */}
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-2">
                <div className="grid grid-cols-12 gap-3 text-[10px] font-medium text-gray-700 uppercase tracking-wide">
                  <div className="col-span-1">Görsel</div>
                  <div className="col-span-3">Ürün Bilgileri</div>
                  <div className="col-span-2">Kategori</div>
                  <div className="col-span-1">Fiyat</div>
                  <div className="col-span-2">Arşiv Bilgisi</div>
                  <div className="col-span-1">Satıcı</div>
                  <div className="col-span-2 text-center">İşlemler</div>
                </div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-gray-200">
                {products.map((product) => (
                  <div
                    key={product.id}
                    className="px-4 py-2 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedProduct(product);
                      setShowDetailModal(true);
                    }}
                  >
                    <div className="grid grid-cols-12 gap-3 items-center">
                      {/* Image */}
                      <div className="col-span-1">
                        {product.imageUrls && product.imageUrls.length > 0 ? (
                          <div className="relative">
                            <img
                              src={product.imageUrls[0]}
                              alt="Ürün"
                              className="w-10 h-10 object-cover rounded border border-gray-200 opacity-75"
                            />
                            {product.imageUrls.length > 1 && (
                              <div className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-medium">
                                {product.imageUrls.length}
                              </div>
                            )}
                            {product.videoUrl && (
                              <div className="absolute -bottom-1 -right-1 bg-purple-600 text-white rounded-full w-4 h-4 flex items-center justify-center">
                                <Play className="w-2.5 h-2.5" />
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="w-10 h-10 bg-gray-100 rounded border border-gray-200 flex items-center justify-center">
                            <ImageIcon className="w-4 h-4 text-gray-400" />
                          </div>
                        )}
                      </div>

                      {/* Product Info */}
                      <div className="col-span-3">
                        <h3 className="font-medium text-gray-900 line-clamp-1 text-xs">
                          {product.productName}
                        </h3>
                        <p className="text-[11px] text-gray-600 line-clamp-1">
                          {product.description}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[10px] text-gray-400">
                            ID: {product.ilan_no || product.id}
                          </span>
                          {product.needsUpdate && (
                            <span className="inline-flex items-center px-1 py-0 rounded text-[9px] font-medium bg-yellow-100 text-yellow-700">
                              Güncelleme Gerekli
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Category */}
                      <div className="col-span-2">
                        <div className="text-xs text-gray-900 font-medium">
                          {product.category}
                        </div>
                        {product.subcategory && (
                          <div className="text-[10px] text-gray-500">
                            {product.subcategory}
                          </div>
                        )}
                      </div>

                      {/* Price */}
                      <div className="col-span-1">
                        <span className="text-xs font-semibold text-green-600">
                          {formatPrice(product.price, product.currency)}
                        </span>
                      </div>

                      {/* Archive Info */}
                      <div className="col-span-2">
                        <div className="flex items-center gap-1 text-xs text-gray-600">
                          <Calendar className="w-3 h-3 text-red-400" />
                          <span>{formatDate(product.archivedByAdminAt)}</span>
                        </div>
                        {product.archiveReason && (
                          <p className="text-[10px] text-red-500 line-clamp-1 mt-0.5">
                            {product.archiveReason}
                          </p>
                        )}
                        {!product.archiveReason &&
                          product.adminArchiveReason &&
                          product.adminArchiveReason !==
                            "Archived by admin" && (
                            <p className="text-[10px] text-red-500 line-clamp-1 mt-0.5">
                              {product.adminArchiveReason}
                            </p>
                          )}
                      </div>

                      {/* Seller */}
                      <div className="col-span-1">
                        {product.shopId ? (
                          <div>
                            <div className="flex items-center gap-1">
                              <Store className="w-3 h-3 text-blue-600" />
                              <span className="text-xs text-blue-600 font-medium">
                                Mağaza
                              </span>
                            </div>
                            {shopNames[product.shopId] && (
                              <div className="text-[10px] text-gray-500 truncate max-w-[80px]">
                                {shopNames[product.shopId]}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <User className="w-3 h-3 text-gray-600" />
                            <span className="text-xs text-gray-600 font-medium truncate max-w-[60px]">
                              {product.sellerName}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="col-span-2">
                        <div
                          className="flex items-center justify-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedProduct(product);
                              setShowDetailModal(true);
                            }}
                            className="flex items-center gap-1 px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Detay</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              unarchiveProduct(product);
                            }}
                            disabled={processingIds.has(product.id)}
                            className="flex items-center gap-1 px-2 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-xs font-medium rounded transition-colors disabled:cursor-not-allowed"
                          >
                            {processingIds.has(product.id) ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <ArchiveRestore className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Load More */}
              {hasMore && (
                <div className="border-t border-gray-200 px-4 py-3 flex justify-center">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-gray-700 disabled:text-gray-400 text-xs font-medium rounded-lg transition-colors"
                  >
                    {loadingMore ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {loadingMore ? "Yükleniyor..." : "Daha Fazla Yükle"}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}
        </main>

        {/* Detail Modal */}
        {showDetailModal && selectedProduct && (
          <ArchivedProductDetailModal
            product={selectedProduct}
            shopName={
              selectedProduct.shopId
                ? shopNames[selectedProduct.shopId]
                : undefined
            }
            adminName={
              selectedProduct.archivedByAdminId
                ? adminNames[selectedProduct.archivedByAdminId]
                : undefined
            }
            onClose={() => {
              setShowDetailModal(false);
              setSelectedProduct(null);
            }}
            onUnarchive={() => unarchiveProduct(selectedProduct)}
            isProcessing={processingIds.has(selectedProduct.id)}
          />
        )}
      </div>
    </ProtectedRoute>
  );
}
