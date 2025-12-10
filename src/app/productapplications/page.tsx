"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import { useState, useEffect } from "react";
import {
  collection,
  onSnapshot,
  doc,
  Timestamp,
  arrayRemove,
  getDoc,
  writeBatch,
  arrayUnion,
  updateDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Package,
  X,
  Calendar,
  User,
  Store,
  Image as ImageIcon,
  Loader2,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Play,
  Tag,
  Truck,
  Palette,
  Phone,
  MapPin,
  CreditCard,
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
} from "lucide-react";
import { ProductUtils } from "../../models/Product";

// Extended interface for product applications (includes fields not in final Product)
interface ProductApplication {
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
  bundleIds: string[];
  bundlePrice?: number;
  originalPrice?: number;
  discountPercentage?: number;
  colorQuantities: Record<string, number>;
  boostClickCountAtStart: number;
  availableColors: string[];
  userId: string;
  discountThreshold?: number;
  rankingScore: number;
  promotionScore: number;
  ownerId: string;
  shopId?: string;
  searchIndex: string[];
  createdAt: Timestamp;
  sellerName: string;
  category: string;
  subcategory: string;
  subsubcategory: string;
  quantity: number;
  bestSellerRank?: number;
  sold: boolean;
  clickCount: number;
  clickCountAtStart: number;
  favoritesCount: number;
  cartCount: number;
  purchaseCount: number;
  deliveryOption: string;
  boostedImpressionCount: number;
  boostImpressionCountAtStart: number;
  isFeatured: boolean;
  isTrending: boolean;
  isBoosted: boolean;
  boostStartTime?: Date;
  boostEndTime?: Date;
  dailyClickCount: number;
  lastClickDate?: Date;
  paused: boolean;
  colorImages: Record<string, string[]>;
  videoUrl?: string;
  attributes: Record<string, unknown>;
  phone?: string;
  region?: string;
  address?: string;
  ibanOwnerName?: string;
  ibanOwnerSurname?: string;
  iban?: string;
  needsSync?: boolean;
  updatedAt?: Timestamp;
  relatedProductIds?: string[];
  maxQuantity?: number;
  bulkDiscountPercentage?: number;
  campaign?: string;
  campaignName?: string;
  status?: string;
}

// Detail Modal Component
function ProductDetailModal({
  application,
  shopName,
  onClose,
  onApprove,
  onReject,
  isProcessing,
}: {
  application: ProductApplication;
  shopName?: string;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  isProcessing: boolean;
}) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<"images" | "colors" | "video">(
    "images"
  );
  const [selectedColorForPreview, setSelectedColorForPreview] = useState<
    string | null
  >(null);

  const allImages = application.imageUrls || [];
  const hasColorImages = Object.keys(application.colorImages || {}).length > 0;
  const hasVideo = !!application.videoUrl;

  const formatDate = (timestamp: Timestamp | Date | undefined) => {
    if (!timestamp) return null;
    try {
      const date =
        timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
      return date.toLocaleDateString("tr-TR", {
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

  const formatPrice = (price: number, currency: string = "TL") => {
    return `${price?.toLocaleString("tr-TR")} ${currency}`;
  };

  // Section Component
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

  // Detail Row Component
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
    ) {
      return null;
    }
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

  // Badge Component
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

  // Get attribute display name
  const getAttributeDisplayName = (key: string): string => {
    const attributeNames: Record<string, string> = {
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
      attributeNames[key] ||
      key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, " $1")
    );
  };

  // Format attribute value
  const formatAttributeValue = (value: unknown): string => {
    if (Array.isArray(value)) {
      return value.join(", ");
    }
    if (typeof value === "boolean") {
      return value ? "Evet" : "Hayır";
    }
    return String(value);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-gray-50 rounded-xl shadow-2xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <Package className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900 line-clamp-1">
                {application.productName}
              </h2>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-500">
                  ID: {application.ilan_no || application.id}
                </span>
                {application.shopId ? (
                  <Badge variant="info">
                    <Store className="w-2.5 h-2.5 mr-0.5" />
                    Mağaza
                  </Badge>
                ) : (
                  <Badge variant="default">
                    <User className="w-2.5 h-2.5 mr-0.5" />
                    Bireysel
                  </Badge>
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
            {/* Left Column - Media */}
            <div className="space-y-3">
              {/* Media Tabs */}
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="flex border-b border-gray-200">
                  <button
                    onClick={() => setActiveTab("images")}
                    className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${
                      activeTab === "images"
                        ? "bg-blue-50 text-blue-700 border-b-2 border-blue-600"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <ImageIcon className="w-3.5 h-3.5 inline mr-1" />
                    Görseller ({allImages.length})
                  </button>
                  {hasColorImages && (
                    <button
                      onClick={() => setActiveTab("colors")}
                      className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${
                        activeTab === "colors"
                          ? "bg-blue-50 text-blue-700 border-b-2 border-blue-600"
                          : "text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <Palette className="w-3.5 h-3.5 inline mr-1" />
                      Renkler
                    </button>
                  )}
                  {hasVideo && (
                    <button
                      onClick={() => setActiveTab("video")}
                      className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${
                        activeTab === "video"
                          ? "bg-blue-50 text-blue-700 border-b-2 border-blue-600"
                          : "text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <Video className="w-3.5 h-3.5 inline mr-1" />
                      Video
                    </button>
                  )}
                </div>

                <div className="p-2">
                  {/* Main Images Tab */}
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
                                    setActiveImageIndex((prev) =>
                                      prev === 0
                                        ? allImages.length - 1
                                        : prev - 1
                                    )
                                  }
                                  className="absolute left-1.5 top-1/2 -translate-y-1/2 p-1.5 bg-white/90 rounded-full shadow-lg hover:bg-white transition-colors"
                                >
                                  <ChevronLeft className="w-4 h-4 text-gray-700" />
                                </button>
                                <button
                                  onClick={() =>
                                    setActiveImageIndex((prev) =>
                                      prev === allImages.length - 1
                                        ? 0
                                        : prev + 1
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
                              {allImages.map((url, index) => (
                                <button
                                  key={index}
                                  onClick={() => setActiveImageIndex(index)}
                                  className={`flex-shrink-0 w-12 h-12 rounded overflow-hidden border-2 transition-all ${
                                    index === activeImageIndex
                                      ? "border-blue-500 ring-1 ring-blue-200"
                                      : "border-gray-200 hover:border-gray-300"
                                  }`}
                                >
                                  <img
                                    src={url}
                                    alt={`Thumbnail ${index + 1}`}
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

                  {/* Color Images Tab */}
                  {activeTab === "colors" && hasColorImages && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {Object.keys(application.colorImages).map((color) => (
                          <button
                            key={color}
                            onClick={() =>
                              setSelectedColorForPreview(
                                selectedColorForPreview === color ? null : color
                              )
                            }
                            className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                              selectedColorForPreview === color
                                ? "bg-blue-600 text-white"
                                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            }`}
                          >
                            {color}
                            {application.colorQuantities?.[color] && (
                              <span className="ml-0.5 opacity-70">
                                ({application.colorQuantities[color]})
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                      {selectedColorForPreview &&
                        application.colorImages[selectedColorForPreview] && (
                          <div className="grid grid-cols-3 gap-1.5">
                            {application.colorImages[
                              selectedColorForPreview
                            ].map((url, idx) => (
                              <div
                                key={idx}
                                className="aspect-square bg-gray-100 rounded overflow-hidden"
                              >
                                <img
                                  src={url}
                                  alt={`${selectedColorForPreview} - ${
                                    idx + 1
                                  }`}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      {!selectedColorForPreview && (
                        <p className="text-xs text-gray-500 text-center py-2">
                          Görüntülemek için bir renk seçin
                        </p>
                      )}
                    </div>
                  )}

                  {/* Video Tab */}
                  {activeTab === "video" && hasVideo && (
                    <div className="aspect-video bg-black rounded-lg overflow-hidden">
                      <video
                        src={application.videoUrl}
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
              {application.description && (
                <Section title="Açıklama" icon={Info}>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto">
                    {application.description}
                  </p>
                </Section>
              )}
            </div>

            {/* Right Column - Details */}
            <div className="space-y-2">
              {/* Price & Basic Info */}
              <Section title="Fiyat ve Stok" icon={DollarSign}>
                <div className="space-y-0.5">
                  <DetailRow
                    label="Fiyat"
                    value={formatPrice(application.price, application.currency)}
                    icon={Tag}
                    valueClassName="text-green-600 text-sm font-bold"
                  />
                  {application.originalPrice &&
                    application.originalPrice > application.price && (
                      <DetailRow
                        label="Orijinal Fiyat"
                        value={
                          <span className="line-through text-gray-400">
                            {formatPrice(
                              application.originalPrice,
                              application.currency
                            )}
                          </span>
                        }
                      />
                    )}
                  {application.discountPercentage &&
                    application.discountPercentage > 0 && (
                      <DetailRow
                        label="İndirim"
                        value={
                          <Badge variant="error">
                            %{application.discountPercentage}
                          </Badge>
                        }
                      />
                    )}
                  <DetailRow
                    label="Stok Miktarı"
                    value={application.quantity}
                    icon={Box}
                  />
                  {application.maxQuantity && (
                    <DetailRow
                      label="Maksimum Miktar"
                      value={application.maxQuantity}
                    />
                  )}
                  <DetailRow
                    label="Durum"
                    value={application.condition}
                    icon={Star}
                  />
                  {application.bulkDiscountPercentage &&
                    application.bulkDiscountPercentage > 0 && (
                      <DetailRow
                        label="Toplu İndirim"
                        value={`%${application.bulkDiscountPercentage}`}
                      />
                    )}
                  {application.discountThreshold &&
                    application.discountThreshold > 0 && (
                      <DetailRow
                        label="İndirim Eşiği"
                        value={`${application.discountThreshold} adet`}
                      />
                    )}
                </div>
              </Section>

              {/* Category */}
              <Section title="Kategori" icon={Layers}>
                <div className="space-y-1">
                  <DetailRow
                    label="Ana Kategori"
                    value={application.category}
                  />
                  {application.subcategory && (
                    <DetailRow
                      label="Alt Kategori"
                      value={application.subcategory}
                    />
                  )}
                  {application.subsubcategory && (
                    <DetailRow
                      label="Alt Alt Kategori"
                      value={application.subsubcategory}
                    />
                  )}
                  {application.brandModel && (
                    <DetailRow
                      label="Marka / Model"
                      value={application.brandModel}
                    />
                  )}
                </div>
              </Section>

              {/* Gender & Attributes */}
              {(application.gender ||
                (application.attributes &&
                  Object.keys(application.attributes).length > 0)) && (
                <Section title="Ürün Özellikleri" icon={Tag}>
                  <div className="space-y-1">
                    {application.gender && (
                      <DetailRow label="Cinsiyet" value={application.gender} />
                    )}
                    {application.attributes &&
                      Object.entries(application.attributes).map(
                        ([key, value]) => {
                          if (key === "gender" || !value) return null;
                          const displayValue = formatAttributeValue(value);
                          if (!displayValue || displayValue === "") return null;
                          return (
                            <DetailRow
                              key={key}
                              label={getAttributeDisplayName(key)}
                              value={displayValue}
                            />
                          );
                        }
                      )}
                  </div>
                </Section>
              )}

              {/* Colors */}
              {application.availableColors &&
                application.availableColors.length > 0 && (
                  <Section title="Renkler ve Stok" icon={Palette}>
                    <div className="space-y-1">
                      {application.availableColors.map((color) => (
                        <div
                          key={color}
                          className="flex items-center justify-between py-1 px-2 bg-gray-50 rounded"
                        >
                          <span className="text-xs font-medium text-gray-700">
                            {color}
                          </span>
                          {application.colorQuantities?.[color] !==
                            undefined && (
                            <Badge variant="info">
                              {application.colorQuantities[color]} adet
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
                    className={`w-7 h-7 rounded flex items-center justify-center ${
                      application.deliveryOption === "Fast Delivery"
                        ? "bg-yellow-100"
                        : "bg-blue-100"
                    }`}
                  >
                    {application.deliveryOption === "Fast Delivery" ? (
                      <Zap className="w-3.5 h-3.5 text-yellow-600" />
                    ) : (
                      <Truck className="w-3.5 h-3.5 text-blue-600" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-xs">
                      {application.deliveryOption}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {application.deliveryOption === "Fast Delivery"
                        ? "Hızlı teslimat"
                        : "Satıcı gönderimi"}
                    </p>
                  </div>
                </div>
              </Section>

              {/* Seller Info */}
              {(application.shopId ||
                application.phone ||
                application.region ||
                application.address ||
                application.iban) && (
                <Section title="Satıcı Bilgileri" icon={User}>
                  <div className="space-y-1">
                    {application.shopId && shopName && (
                      <DetailRow label="Mağaza" value={shopName} icon={Store} />
                    )}
                    <DetailRow
                      label="Satıcı Adı"
                      value={application.sellerName}
                    />
                    {application.ibanOwnerName &&
                      application.ibanOwnerSurname && (
                        <DetailRow
                          label="Hesap Sahibi"
                          value={`${application.ibanOwnerName} ${application.ibanOwnerSurname}`}
                        />
                      )}
                    {application.phone && (
                      <DetailRow
                        label="Telefon"
                        value={application.phone}
                        icon={Phone}
                      />
                    )}
                    {application.region && (
                      <DetailRow
                        label="Bölge"
                        value={application.region}
                        icon={MapPin}
                      />
                    )}
                    {application.address && (
                      <DetailRow
                        label="Adres"
                        value={application.address}
                        icon={MapPin}
                      />
                    )}
                    {application.iban && (
                      <DetailRow
                        label="IBAN"
                        value={application.iban}
                        icon={CreditCard}
                      />
                    )}
                  </div>
                </Section>
              )}

              {/* Stats (if any exist) */}
              {(application.clickCount > 0 ||
                application.favoritesCount > 0 ||
                application.cartCount > 0 ||
                application.purchaseCount > 0 ||
                application.averageRating > 0) && (
                <Section title="İstatistikler" icon={TrendingUp}>
                  <div className="grid grid-cols-4 gap-1.5">
                    {application.clickCount > 0 && (
                      <div className="bg-gray-50 rounded p-1.5 text-center">
                        <MousePointer className="w-3.5 h-3.5 text-gray-400 mx-auto" />
                        <p className="text-sm font-bold text-gray-900">
                          {application.clickCount}
                        </p>
                        <p className="text-[10px] text-gray-500">Tıklama</p>
                      </div>
                    )}
                    {application.favoritesCount > 0 && (
                      <div className="bg-gray-50 rounded p-1.5 text-center">
                        <Heart className="w-3.5 h-3.5 text-red-400 mx-auto" />
                        <p className="text-sm font-bold text-gray-900">
                          {application.favoritesCount}
                        </p>
                        <p className="text-[10px] text-gray-500">Favori</p>
                      </div>
                    )}
                    {application.cartCount > 0 && (
                      <div className="bg-gray-50 rounded p-1.5 text-center">
                        <ShoppingCart className="w-3.5 h-3.5 text-blue-400 mx-auto" />
                        <p className="text-sm font-bold text-gray-900">
                          {application.cartCount}
                        </p>
                        <p className="text-[10px] text-gray-500">Sepet</p>
                      </div>
                    )}
                    {application.purchaseCount > 0 && (
                      <div className="bg-gray-50 rounded p-1.5 text-center">
                        <CheckCircle className="w-3.5 h-3.5 text-green-400 mx-auto" />
                        <p className="text-sm font-bold text-gray-900">
                          {application.purchaseCount}
                        </p>
                        <p className="text-[10px] text-gray-500">Satış</p>
                      </div>
                    )}
                  </div>
                  {application.averageRating > 0 && (
                    <div className="mt-1.5 flex items-center justify-center gap-1.5 bg-yellow-50 rounded p-1.5">
                      <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                      <span className="text-sm font-bold text-gray-900">
                        {application.averageRating.toFixed(1)}
                      </span>
                      <span className="text-[10px] text-gray-500">
                        ({application.reviewCount} değerlendirme)
                      </span>
                    </div>
                  )}
                </Section>
              )}

              {/* Flags */}
              {(application.isFeatured ||
                application.isTrending ||
                application.isBoosted ||
                application.paused) && (
                <Section title="Durum Etiketleri" icon={Tag}>
                  <div className="flex flex-wrap gap-2">
                    {application.isFeatured && (
                      <Badge variant="warning">⭐ Öne Çıkan</Badge>
                    )}
                    {application.isTrending && (
                      <Badge variant="info">📈 Trend</Badge>
                    )}
                    {application.isBoosted && (
                      <Badge variant="success">🚀 Boost Edilmiş</Badge>
                    )}
                    {application.paused && (
                      <Badge variant="error">⏸️ Duraklatılmış</Badge>
                    )}
                  </div>
                </Section>
              )}

              {/* Timestamps */}
              <Section title="Tarihler" icon={Calendar}>
                <div className="space-y-1">
                  <DetailRow
                    label="Başvuru Tarihi"
                    value={formatDate(application.createdAt)}
                  />
                  {application.updatedAt && (
                    <DetailRow
                      label="Güncelleme Tarihi"
                      value={formatDate(application.updatedAt)}
                    />
                  )}
                </div>
              </Section>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-white border-t border-gray-200 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium text-sm"
          >
            Kapat
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onReject}
              disabled={isProcessing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors disabled:cursor-not-allowed text-sm"
            >
              {isProcessing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <XCircle className="w-3.5 h-3.5" />
              )}
              <span>Reddet</span>
            </button>
            <button
              onClick={onApprove}
              disabled={isProcessing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors disabled:cursor-not-allowed text-sm"
            >
              {isProcessing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle className="w-3.5 h-3.5" />
              )}
              <span>Onayla</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProductApplications() {
  const router = useRouter();
  const [applications, setApplications] = useState<ProductApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [selectedApplication, setSelectedApplication] =
    useState<ProductApplication | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [shopNames, setShopNames] = useState<Record<string, string>>({});

  // Real-time listener for product applications
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "product_applications"),
      (snapshot) => {
        const applicationsData = snapshot.docs.map((doc) => {
          const data = doc.data();

          return {
            id: doc.id,
            productName: ProductUtils.safeString(data.productName),
            description: ProductUtils.safeString(data.description),
            price: ProductUtils.safeDouble(data.price),
            currency: ProductUtils.safeString(data.currency, "TL"),
            condition: ProductUtils.safeString(data.condition, "Brand New"),
            brandModel: ProductUtils.safeStringNullable(data.brandModel),
            imageUrls: ProductUtils.safeStringArray(data.imageUrls),
            averageRating: ProductUtils.safeDouble(data.averageRating),
            reviewCount: ProductUtils.safeInt(data.reviewCount),
            gender: ProductUtils.safeStringNullable(data.gender),
            bundleIds: ProductUtils.safeStringArray(data.bundleIds),
            bundlePrice:
              data.bundlePrice != null
                ? ProductUtils.safeDouble(data.bundlePrice)
                : undefined,
            originalPrice:
              data.originalPrice != null
                ? ProductUtils.safeDouble(data.originalPrice)
                : undefined,
            discountPercentage:
              data.discountPercentage != null
                ? ProductUtils.safeInt(data.discountPercentage)
                : undefined,
            colorQuantities: ProductUtils.safeColorQuantities(
              data.colorQuantities
            ),
            boostClickCountAtStart: ProductUtils.safeInt(
              data.boostClickCountAtStart
            ),
            availableColors: ProductUtils.safeStringArray(data.availableColors),
            userId: ProductUtils.safeString(data.userId),
            discountThreshold:
              data.discountThreshold != null
                ? ProductUtils.safeInt(data.discountThreshold)
                : undefined,
            rankingScore: ProductUtils.safeDouble(data.rankingScore),
            promotionScore: ProductUtils.safeDouble(data.promotionScore),
            ownerId: ProductUtils.safeString(data.ownerId),
            shopId: ProductUtils.safeStringNullable(data.shopId),
            ilan_no: ProductUtils.safeString(
              data.ilan_no ?? data.ilanNo ?? doc.id
            ),
            ilanNo: ProductUtils.safeString(
              data.ilan_no ?? data.ilanNo ?? doc.id
            ),
            searchIndex: ProductUtils.safeStringArray(data.searchIndex),
            createdAt: data.createdAt as Timestamp,
            sellerName: ProductUtils.safeString(data.sellerName, "Unknown"),
            category: ProductUtils.safeString(data.category, "Uncategorized"),
            subcategory: ProductUtils.safeString(data.subcategory),
            subsubcategory: ProductUtils.safeString(data.subsubcategory),
            quantity: ProductUtils.safeInt(data.quantity),
            bestSellerRank:
              data.bestSellerRank != null
                ? ProductUtils.safeInt(data.bestSellerRank)
                : undefined,
            sold: Boolean(data.sold),
            clickCount: ProductUtils.safeInt(data.clickCount),
            clickCountAtStart: ProductUtils.safeInt(data.clickCountAtStart),
            favoritesCount: ProductUtils.safeInt(data.favoritesCount),
            cartCount: ProductUtils.safeInt(data.cartCount),
            purchaseCount: ProductUtils.safeInt(data.purchaseCount),
            deliveryOption: ProductUtils.safeString(
              data.deliveryOption,
              "Self Delivery"
            ),
            boostedImpressionCount: ProductUtils.safeInt(
              data.boostedImpressionCount
            ),
            boostImpressionCountAtStart: ProductUtils.safeInt(
              data.boostImpressionCountAtStart
            ),
            isFeatured: Boolean(data.isFeatured),
            isTrending: Boolean(data.isTrending),
            isBoosted: Boolean(data.isBoosted),
            boostStartTime: ProductUtils.safeDateNullable(data.boostStartTime),
            boostEndTime: ProductUtils.safeDateNullable(data.boostEndTime),
            dailyClickCount: ProductUtils.safeInt(data.dailyClickCount),
            lastClickDate: ProductUtils.safeDateNullable(data.lastClickDate),
            paused: Boolean(data.paused),
            colorImages: ProductUtils.safeColorImages(data.colorImages),
            videoUrl: ProductUtils.safeStringNullable(data.videoUrl),
            attributes: ProductUtils.safeAttributes(data.attributes),

            // Application-specific fields
            phone: ProductUtils.safeStringNullable(data.phone),
            region: ProductUtils.safeStringNullable(data.region),
            address: ProductUtils.safeStringNullable(data.address),
            ibanOwnerName: ProductUtils.safeStringNullable(data.ibanOwnerName),
            ibanOwnerSurname: ProductUtils.safeStringNullable(
              data.ibanOwnerSurname
            ),
            iban: ProductUtils.safeStringNullable(data.iban),
            needsSync: Boolean(data.needsSync),
            updatedAt: data.updatedAt as Timestamp | undefined,
            relatedProductIds: ProductUtils.safeStringArray(
              data.relatedProductIds
            ),
            maxQuantity:
              data.maxQuantity != null
                ? ProductUtils.safeInt(data.maxQuantity)
                : undefined,
            bulkDiscountPercentage:
              data.bulkDiscountPercentage != null
                ? ProductUtils.safeInt(data.bulkDiscountPercentage)
                : undefined,
            campaign: ProductUtils.safeStringNullable(data.campaign),
            campaignName: ProductUtils.safeStringNullable(data.campaignName),
            status: ProductUtils.safeStringNullable(data.status),
          } as ProductApplication;
        }) as ProductApplication[];

        // Filter to only show pending applications (not approved or rejected)
        const pendingApplications = applicationsData.filter(
          (app) => !app.status || app.status === "pending"
        );

        // Sort by creation date (newest first)
        pendingApplications.sort((a, b) => {
          if (!a.createdAt || !b.createdAt) return 0;
          return (
            b.createdAt.toDate().getTime() - a.createdAt.toDate().getTime()
          );
        });

        setApplications(pendingApplications);
        setLoading(false);
      },
      (error) => {
        console.error("Başvuruları dinlerken hata:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Fetch shop names for applications with shopId
  useEffect(() => {
    const fetchShopNames = async () => {
      const shopIds = applications
        .filter((app) => app.shopId && app.shopId.trim() !== "")
        .map((app) => app.shopId!)
        .filter((id, index, self) => self.indexOf(id) === index);

      const newShopNames: Record<string, string> = {};
      for (const shopId of shopIds) {
        if (!shopNames[shopId]) {
          try {
            const shopDoc = await getDoc(doc(db, "shops", shopId));
            if (shopDoc.exists()) {
              newShopNames[shopId] = shopDoc.data().name || "Unknown Shop";
            }
          } catch (error) {
            console.error(`Error fetching shop ${shopId}:`, error);
          }
        }
      }

      if (Object.keys(newShopNames).length > 0) {
        setShopNames((prev) => ({ ...prev, ...newShopNames }));
      }
    };

    if (applications.length > 0) {
      fetchShopNames();
    }
  }, [applications]);

  async function updateCategoryShopsIndex(
    shopId: string | null | undefined,
    category: string,
    subcategory: string,
    subsubcategory: string,
    operation: "add" | "remove"
  ) {
    // Early return if no shopId (individual products don't need this)
    if (!shopId || shopId.trim() === "") return;

    try {
      const shopDoc = await getDoc(doc(db, "shops", shopId));
      if (!shopDoc.exists()) {
        console.warn(`Shop ${shopId} not found, skipping category index`);
        return;
      }

      const shopData = shopDoc.data();
      const shopInfo = {
        shopId: shopId,
        shopName: shopData.name || "Unknown Shop",
      };

      // Normalize category strings
      const normalize = (s: string) => {
        if (!s || s.trim() === "") return "";
        return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
      };

      const categories = [
        { key: normalize(subsubcategory), level: "subsubcategory" },
        { key: normalize(subcategory), level: "subcategory" },
        { key: normalize(category), level: "category" },
      ].filter((cat) => cat.key !== "");

      // Use batch for atomic operations
      const batch = writeBatch(db);

      for (const { key, level } of categories) {
        const docRef = doc(db, "category_shops", key);

        if (operation === "add") {
          batch.set(
            docRef,
            {
              shops: arrayUnion(shopInfo),
              level: level,
              categoryPath: key,
              lastUpdated: Timestamp.now(),
            },
            { merge: true }
          );
        } else {
          batch.set(
            docRef,
            {
              shops: arrayRemove(shopInfo),
              lastUpdated: Timestamp.now(),
            },
            { merge: true }
          );
        }
      }

      await batch.commit();
      console.log(`✅ Category index updated for shop ${shopId}`);
    } catch (error) {
      console.error("Error updating category shops index:", error);
      // Don't throw - we don't want to fail the entire approval if indexing fails
    }
  }

  const approveApplication = async (application: ProductApplication) => {
    if (processingIds.has(application.id)) return;
    setProcessingIds((prev) => new Set(prev).add(application.id));

    try {
      // ✅ STEP 0: Verify application still exists and is pending
      const applicationRef = doc(db, "product_applications", application.id);
      const applicationSnap = await getDoc(applicationRef);

      if (!applicationSnap.exists()) {
        showNotification("Başvuru bulunamadı - zaten işlenmiş olabilir");
        return;
      }

      const currentStatus = applicationSnap.data()?.status;
      if (currentStatus && currentStatus !== "pending") {
        showNotification("Bu başvuru zaten işlenmiş");
        return;
      }

      // ✅ Destructure and EXPLICITLY list ALL excluded fields
      const {
        id,
        ilan_no,
        ilanNo: _ilanNo, // Also exclude this to avoid duplication
        createdAt: applicationCreatedAt,
        phone,
        region,
        address,
        ibanOwnerName,
        ibanOwnerSurname,
        iban,
        needsSync: _needsSync, // Exclude - will set fresh
        updatedAt: _updatedAt, // Exclude - will set fresh
        relatedProductIds: _relatedProductIds, // Exclude - will set fresh
        status: _status, // ✅ CRITICAL: Exclude status field!
        ...productData
      } = application;

      // Suppress unused variable warnings
      void applicationCreatedAt;
      void phone;
      void region;
      void address;
      void ibanOwnerName;
      void ibanOwnerSurname;
      void iban;
      void _ilanNo;
      void _needsSync;
      void _updatedAt;
      void _relatedProductIds;
      void _status;

      const newDocId = ilan_no && ilan_no.trim() !== "" ? ilan_no : id;
      const isShopProduct =
        productData.shopId && productData.shopId.trim() !== "";
      const collectionName = isShopProduct ? "shop_products" : "products";

      // ✅ STEP 1: Check if product already exists (prevent overwrites)
      const productRef = doc(db, collectionName, newDocId);
      const existingProduct = await getDoc(productRef);

      if (existingProduct.exists()) {
        showNotification(
          `Ürün zaten mevcut (ID: ${newDocId}). Lütfen kontrol edin.`
        );
        // Optionally: Mark application as duplicate instead of failing
        await updateDoc(applicationRef, {
          status: "duplicate",
          reviewedAt: Timestamp.now(),
          existingProductId: newDocId,
        });
        return;
      }

      // ✅ Build payload with explicit field control
      const payload = {
        ...productData,
        id: newDocId,
        ilanNo: newDocId,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        needsSync: true,
        relatedProductIds: [],
      };

      // Remove undefined values (keep null values as they may be intentional)
      const cleanedPayload = Object.fromEntries(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        Object.entries(payload).filter(([_, value]) => value !== undefined)
      );

      // ✅ STEP 2: Use BATCH for atomic write
      const batch = writeBatch(db);

      // Add product
      batch.set(productRef, cleanedPayload);

      // Mark application as approved
      batch.update(applicationRef, {
        status: "approved",
        reviewedAt: Timestamp.now(),
        approvedProductId: newDocId,
        approvedCollection: collectionName,
      });

      // ✅ COMMIT ATOMICALLY - both succeed or both fail
      await batch.commit();

      console.log(`✅ Product approved: ${newDocId} in ${collectionName}`);

      // ✅ STEP 3: Update category index AFTER successful commit
      // This is non-critical - if it fails, product still exists
      if (isShopProduct) {
        try {
          await updateCategoryShopsIndex(
            productData.shopId!,
            productData.category,
            productData.subcategory,
            productData.subsubcategory,
            "add"
          );
        } catch (indexError) {
          console.error(
            "Category index update failed (non-critical):",
            indexError
          );
          // Don't fail the approval - product is already created
        }
      }

      showNotification("Ürün başarıyla onaylandı!");
      setShowDetailModal(false);
      setSelectedApplication(null);
    } catch (error) {
      console.error("Onaylama hatası:", error);

      // ✅ More specific error messages
      if (error instanceof Error) {
        if (error.message.includes("permission")) {
          showNotification("Yetki hatası - lütfen tekrar giriş yapın");
        } else if (error.message.includes("network")) {
          showNotification("Ağ hatası - lütfen tekrar deneyin");
        } else {
          showNotification(`Hata: ${error.message}`);
        }
      } else {
        showNotification("Ürün onaylanırken hata oluştu");
      }
    } finally {
      setProcessingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(application.id);
        return newSet;
      });
    }
  };

  const rejectApplication = async (application: ProductApplication) => {
    if (processingIds.has(application.id)) return;
    setProcessingIds((prev) => new Set(prev).add(application.id));

    try {
      // ✅ Verify still pending
      const applicationRef = doc(db, "product_applications", application.id);
      const applicationSnap = await getDoc(applicationRef);

      if (!applicationSnap.exists()) {
        showNotification("Başvuru bulunamadı");
        return;
      }

      const currentStatus = applicationSnap.data()?.status;
      if (currentStatus && currentStatus !== "pending") {
        showNotification("Bu başvuru zaten işlenmiş");
        return;
      }

      // ✅ Consider adding a reason modal
      await updateDoc(applicationRef, {
        status: "rejected",
        reviewedAt: Timestamp.now(),
        rejectionReason: "Başvuru reddedildi",
      });

      showNotification("Ürün başvurusu reddedildi");
      setShowDetailModal(false);
      setSelectedApplication(null);
    } catch (error) {
      console.error("Reddetme hatası:", error);
      showNotification("Ürün reddedilirken hata oluştu");
    } finally {
      setProcessingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(application.id);
        return newSet;
      });
    }
  };

  const showNotification = (message: string) => {
    alert(message);
  };

  const formatDate = (timestamp: Timestamp) => {
    if (!timestamp) return "—";
    try {
      return timestamp.toDate().toLocaleDateString("tr-TR", {
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

  const formatPrice = (price: number, currency: string) => {
    return `${price?.toLocaleString("tr-TR")} ${currency || "TL"}`;
  };

  const openDetailModal = (application: ProductApplication) => {
    setSelectedApplication(application);
    setShowDetailModal(true);
  };

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
                  <div className="flex items-center justify-center w-7 h-7 bg-blue-600 rounded-lg">
                    <Package className="w-3.5 h-3.5 text-white" />
                  </div>
                  <h1 className="text-base font-semibold text-gray-900">
                    Ürün Başvuruları
                  </h1>
                </div>
              </div>

              <div className="bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">
                <span className="text-xs text-blue-700 font-medium">
                  {loading ? "Yükleniyor..." : `${applications.length} Başvuru`}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 py-3">
          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-2 text-gray-600 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Başvurular yükleniyor...</span>
              </div>
            </div>
          )}

          {/* No Applications */}
          {!loading && applications.length === 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
              <div className="inline-flex items-center justify-center w-10 h-10 bg-gray-100 rounded-lg mb-3">
                <Package className="w-5 h-5 text-gray-400" />
              </div>
              <h3 className="text-sm font-medium text-gray-900 mb-1">
                Başvuru bulunamadı
              </h3>
              <p className="text-gray-500 text-xs">
                Henüz onay bekleyen ürün başvurusu bulunmamaktadır.
              </p>
            </div>
          )}

          {/* Applications Table */}
          {!loading && applications.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* Table Header */}
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-2">
                <div className="grid grid-cols-12 gap-3 text-[10px] font-medium text-gray-700 uppercase tracking-wide">
                  <div className="col-span-1">Görsel</div>
                  <div className="col-span-3">Ürün Bilgileri</div>
                  <div className="col-span-2">Kategori</div>
                  <div className="col-span-1">Fiyat</div>
                  <div className="col-span-1">Tip</div>
                  <div className="col-span-2">Tarih</div>
                  <div className="col-span-2 text-center">İşlemler</div>
                </div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-gray-200">
                {applications.map((application) => (
                  <div
                    key={application.id}
                    className="px-4 py-2 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => openDetailModal(application)}
                  >
                    <div className="grid grid-cols-12 gap-3 items-center">
                      {/* Image */}
                      <div className="col-span-1">
                        {application.imageUrls &&
                        application.imageUrls.length > 0 ? (
                          <div className="relative">
                            <img
                              src={application.imageUrls[0]}
                              alt="Ürün"
                              className="w-10 h-10 object-cover rounded border border-gray-200 hover:opacity-80 transition-opacity"
                            />
                            {application.imageUrls.length > 1 && (
                              <div className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-medium">
                                {application.imageUrls.length}
                              </div>
                            )}
                            {application.videoUrl && (
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
                          {application.productName}
                        </h3>
                        <p className="text-[11px] text-gray-600 line-clamp-1">
                          {application.description}
                        </p>
                        {application.brandModel && (
                          <p className="text-[10px] text-gray-500">
                            {application.brandModel}
                          </p>
                        )}
                      </div>

                      {/* Category */}
                      <div className="col-span-2">
                        <div className="text-xs text-gray-900 font-medium">
                          {application.category}
                        </div>
                        {application.subcategory && (
                          <div className="text-[10px] text-gray-500">
                            {application.subcategory}
                          </div>
                        )}
                      </div>

                      {/* Price */}
                      <div className="col-span-1">
                        <span className="text-xs font-semibold text-green-600">
                          {formatPrice(application.price, application.currency)}
                        </span>
                        {application.originalPrice &&
                          application.originalPrice > application.price && (
                            <div className="text-[10px] text-gray-400 line-through">
                              {formatPrice(
                                application.originalPrice,
                                application.currency
                              )}
                            </div>
                          )}
                      </div>

                      {/* Type */}
                      <div className="col-span-1">
                        <div className="flex items-center gap-1">
                          {application.shopId ? (
                            <>
                              <Store className="w-3.5 h-3.5 text-blue-600" />
                              <div>
                                <span className="text-xs text-blue-600 font-medium">
                                  Mağaza
                                </span>
                                {shopNames[application.shopId] && (
                                  <div className="text-[10px] text-gray-500 truncate max-w-[60px]">
                                    {shopNames[application.shopId]}
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            <>
                              <User className="w-3.5 h-3.5 text-gray-600" />
                              <span className="text-xs text-gray-600 font-medium">
                                Bireysel
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Date */}
                      <div className="col-span-2">
                        <div className="flex items-center gap-1 text-xs text-gray-600">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{formatDate(application.createdAt)}</span>
                        </div>
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
                              openDetailModal(application);
                            }}
                            className="flex items-center gap-1 px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Detay</span>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              approveApplication(application);
                            }}
                            disabled={processingIds.has(application.id)}
                            className="flex items-center gap-1 px-2 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-xs font-medium rounded transition-colors disabled:cursor-not-allowed"
                          >
                            {processingIds.has(application.id) ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CheckCircle className="w-3.5 h-3.5" />
                            )}
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              rejectApplication(application);
                            }}
                            disabled={processingIds.has(application.id)}
                            className="flex items-center gap-1 px-2 py-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white text-xs font-medium rounded transition-colors disabled:cursor-not-allowed"
                          >
                            {processingIds.has(application.id) ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* Detail Modal */}
        {showDetailModal && selectedApplication && (
          <ProductDetailModal
            application={selectedApplication}
            shopName={
              selectedApplication.shopId
                ? shopNames[selectedApplication.shopId]
                : undefined
            }
            onClose={() => {
              setShowDetailModal(false);
              setSelectedApplication(null);
            }}
            onApprove={() => approveApplication(selectedApplication)}
            onReject={() => rejectApplication(selectedApplication)}
            isProcessing={processingIds.has(selectedApplication.id)}
          />
        )}

        {/* Legacy Image Modal (kept for backwards compatibility) */}
        {showImageModal && selectedApplication && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-2">
            <div className="relative max-w-3xl max-h-full bg-white rounded-lg overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between p-3 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900">
                  {selectedApplication.productName} - Görseller
                </h3>
                <button
                  onClick={() => setShowImageModal(false)}
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              <div className="p-4">
                <div className="mb-3">
                  <img
                    src={selectedApplication.imageUrls[selectedImageIndex]}
                    alt={`Ürün görseli ${selectedImageIndex + 1}`}
                    className="w-full max-h-80 object-contain rounded border border-gray-200"
                  />
                </div>

                {selectedApplication.imageUrls.length > 1 && (
                  <div className="flex gap-1.5 overflow-x-auto">
                    {selectedApplication.imageUrls.map((url, index) => (
                      <button
                        key={index}
                        onClick={() => setSelectedImageIndex(index)}
                        className={`flex-shrink-0 w-12 h-12 rounded overflow-hidden border-2 transition-all ${
                          index === selectedImageIndex
                            ? "border-blue-500"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <img
                          src={url}
                          alt={`Thumbnail ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
