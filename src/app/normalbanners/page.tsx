"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { logAdminActivity } from "@/services/activityLogService";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Upload,
  Loader2,
  AlertCircle,
  CheckCircle,
  Grid3X3,
  X,
  Store as StoreIcon,
  Link as LinkIcon,
  Pause,
  Play,
  Clock,
  Eye,
  Download,
} from "lucide-react";
import {
  collection,
  onSnapshot,
  doc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
  limit,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, getStorage } from "firebase/storage";
import { db } from "../lib/firebase";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { compressImage, formatFileSize } from "@/utils/imageCompression";
import SearchModal, { type SearchSelection } from "@/components/SearchModal";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type AdStatus = "pending" | "approved" | "active" | "expired" | "rejected";
type AdType = "topBanner" | "thinBanner" | "marketBanner";
type LinkType = "shop" | "product" | "shop_product";

interface BaseAd {
  id: string;
  imageUrl: string;
  createdAt: Timestamp;
  isActive: boolean;
  linkType?: LinkType;
  linkedShopId?: string;
  linkedProductId?: string;
  linkedName?: string;
}

interface AdSubmission {
  id: string;
  userId: string;
  shopId: string;
  shopName: string;
  adType: AdType;
  imageUrl: string;
  price: number;
  duration: string;
  status: AdStatus;
  paymentLink?: string;
  activeAdId?: string;
  createdAt: Timestamp;
  approvedAt?: Timestamp;
  activatedAt?: Timestamp;
  expiresAt?: Timestamp;
  linkType?: LinkType;
  linkedShopId?: string;
  linkedProductId?: string;
  linkedName?: string;
}

interface MarketBannerAd extends BaseAd {
  submissionId?: string;
  isManual?: boolean;
}

interface ImageModalProps {
  isOpen: boolean;
  imageUrl: string;
  onClose: () => void;
  bannerName: string;
}

interface FilterState {
  status: "manual" | "pending" | "active" | "expired";
  hasLink: "all" | "linked" | "unlinked";
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PAGE_SIZE = 20;
const ACTIVE_ADS_COLLECTION = "market_banners";
const SUBMISSIONS_COLLECTION = "ad_submissions";

const STATUS_TABS = [
  { value: "active", label: "Aktif" },
  { value: "manual", label: "Manuel" },
  { value: "pending", label: "Beklemede" },
  { value: "expired", label: "Süresi Dolan" },
] as const;

const LINK_TABS = [
  { value: "all", label: "Tümü" },
  { value: "linked", label: "Bağlantılı" },
  { value: "unlinked", label: "Bağlantısız" },
] as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const formatDate = (timestamp: Timestamp | undefined): string => {
  if (!timestamp) return "—";
  const date = timestamp.toDate();
  return new Intl.DateTimeFormat("tr-TR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const formatPrice = (price: number | undefined): string => {
  if (!price) return "—";
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
  }).format(price);
};

const getDurationLabel = (duration: string | undefined): string => {
  switch (duration) {
    case "oneWeek":
      return "1 Hafta";
    case "twoWeeks":
      return "2 Hafta";
    case "oneMonth":
      return "1 Ay";
    default:
      return "—";
  }
};

const getStatusColor = (status: AdStatus | "manual"): string => {
  switch (status) {
    case "pending":
      return "bg-amber-50 text-amber-700";
    case "approved":
      return "bg-blue-50 text-blue-700";
    case "active":
      return "bg-emerald-50 text-emerald-700";
    case "expired":
      return "bg-gray-100 text-gray-500";
    case "rejected":
      return "bg-red-50 text-red-700";
    case "manual":
      return "bg-indigo-50 text-indigo-700";
    default:
      return "bg-gray-100 text-gray-500";
  }
};

const getStatusLabel = (status: AdStatus | "manual"): string => {
  switch (status) {
    case "pending":
      return "Beklemede";
    case "approved":
      return "Onaylandı";
    case "active":
      return "Aktif";
    case "expired":
      return "Süresi Doldu";
    case "rejected":
      return "Reddedildi";
    case "manual":
      return "Manuel";
    default:
      return "Bilinmiyor";
  }
};

// ============================================================================
// IMAGE MODAL COMPONENT
// ============================================================================

const ImageModal: React.FC<ImageModalProps> = ({
  isOpen,
  imageUrl,
  onClose,
  bannerName,
}) => {
  if (!isOpen) return null;

  const downloadImage = async () => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${bannerName}_banner.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-[70] flex items-center justify-center">
      <div className="absolute top-0 left-0 right-0 p-3 z-10 flex items-center justify-between">
        <div className="text-white">
          <p className="text-sm font-medium">{bannerName}</p>
          <p className="text-[11px] text-gray-400">Banner Görseli</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadImage}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/10 hover:bg-white/20 rounded text-xs text-white transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            İndir
          </button>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/20 rounded transition-colors"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>
      <div className="relative max-w-7xl max-h-full p-16">
        <img
          src={imageUrl}
          alt="Banner"
          className="max-w-full max-h-full object-contain"
        />
      </div>
    </div>
  );
};

// ============================================================================
// AD ROW COMPONENT
// ============================================================================

const AdRow: React.FC<{
  ad: MarketBannerAd;
  onViewImage: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  onAddLink: () => void;
  onRemoveLink: () => void;
}> = ({ ad, onViewImage, onToggleStatus, onDelete, onAddLink, onRemoveLink }) => {
  const hasLink = ad.linkedShopId || ad.linkedProductId;

  return (
    <tr className="group hover:bg-gray-50/50 transition-colors">
      {/* Thumbnail (square) */}
      <td className="pl-3 pr-2 py-2">
        <button
          onClick={onViewImage}
          className="relative w-10 h-10 rounded overflow-hidden bg-gray-100 group/img block flex-shrink-0"
        >
          <Image src={ad.imageUrl} alt="Banner" fill className="object-cover" />
          <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover/img:opacity-100">
            <Eye className="w-3 h-3 text-white" />
          </div>
        </button>
      </td>

      {/* Status */}
      <td className="px-2 py-2">
        {ad.isActive ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            Yayında
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-500">
            Duraklatıldı
          </span>
        )}
      </td>

      {/* Type */}
      <td className="px-2 py-2">
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${getStatusColor(ad.isManual ? "manual" : "active")}`}>
          {ad.isManual ? "Manuel" : "Kullanıcı"}
        </span>
      </td>

      {/* Link */}
      <td className="px-2 py-2">
        {hasLink ? (
          <div className="flex items-center gap-1.5">
            <LinkIcon className="w-3 h-3 text-gray-400 flex-shrink-0" />
            <span className="text-xs text-gray-700 truncate max-w-[120px]">{ad.linkedName}</span>
          </div>
        ) : (
          <button
            onClick={onAddLink}
            className="text-[11px] text-indigo-600 hover:text-indigo-700 font-medium"
          >
            + Bağlantı Ekle
          </button>
        )}
      </td>

      {/* Date */}
      <td className="px-2 py-2">
        <span className="text-[11px] text-gray-400 tabular-nums">{formatDate(ad.createdAt)}</span>
      </td>

      {/* Actions */}
      <td className="pl-2 pr-3 py-2">
        <div className="flex items-center justify-end gap-0.5">
          <button
            onClick={onToggleStatus}
            className={`p-1.5 rounded transition-colors ${
              ad.isActive
                ? "text-orange-500 hover:bg-orange-50"
                : "text-emerald-600 hover:bg-emerald-50"
            }`}
            title={ad.isActive ? "Duraklat" : "Aktif Et"}
          >
            {ad.isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          {hasLink && (
            <button
              onClick={onRemoveLink}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              title="Bağlantıyı Kaldır"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onDelete}
            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            title="Sil"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function MarketBannerPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, setCompressionInfo] = useState<string>("");
  // State
  const [activeAds, setActiveAds] = useState<MarketBannerAd[]>([]);
  const [submissions, setSubmissions] = useState<AdSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [linkingAdId, setLinkingAdId] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [imageModal, setImageModal] = useState({
    isOpen: false,
    imageUrl: "",
    bannerName: "",
  });
  const [filters, setFilters] = useState<FilterState>({
    status: "active",
    hasLink: "all",
  });

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  useEffect(() => {
    const q = query(
      collection(db, ACTIVE_ADS_COLLECTION),
      orderBy("createdAt", "desc"),
      limit(PAGE_SIZE)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const adsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as MarketBannerAd[];

      setActiveAds(adsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, SUBMISSIONS_COLLECTION),
      where("adType", "==", "marketBanner"),
      orderBy("createdAt", "desc"),
      limit(PAGE_SIZE)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const submissionsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as AdSubmission[];

      setSubmissions(submissionsData);
    });

    return () => unsubscribe();
  }, []);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      await uploadBanner(file);
    }
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) {
      await uploadBanner(file);
    }
  };

  const uploadBanner = async (file: File) => {
    try {
      setUploading(true);
      setCompressionInfo("");

      let fileToUpload = file;

      if (file.type.startsWith("image/")) {
        try {
          const result = await compressImage(file, {
            maxWidth: 800,
            maxHeight: 800,
            quality: 0.85,
            format: "image/jpeg",
            maintainAspectRatio: true,
          });

          fileToUpload = result.compressedFile;
          setCompressionInfo(
            `Sıkıştırıldı: ${formatFileSize(
              result.originalSize
            )} → ${formatFileSize(
              result.compressedSize
            )} (${result.compressionRatio.toFixed(1)}% tasarruf)`
          );
        } catch (compressionError) {
          console.error("Compression failed:", compressionError);
          setCompressionInfo(
            "Sıkıştırma başarısız, orijinal dosya yükleniyor..."
          );
        }
      }

      const storage = getStorage();
      const timestamp = Date.now();
      const storageRef = ref(
        storage,
        `market_banners/${timestamp}_${fileToUpload.name}`
      );

      await uploadBytes(storageRef, fileToUpload);
      const downloadUrl = await getDownloadURL(storageRef);

      await addDoc(collection(db, ACTIVE_ADS_COLLECTION), {
        imageUrl: downloadUrl,
        isActive: true,
        isManual: true,
        createdAt: serverTimestamp(),
      });

      logAdminActivity("Market Banner yüklendi", { bannerType: "marketBanner" });

      setTimeout(() => setCompressionInfo(""), 5000);
    } catch (error) {
      console.error("Upload error:", error);
      alert("Yükleme başarısız oldu. Lütfen tekrar deneyin.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const toggleAdStatus = async (adId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, ACTIVE_ADS_COLLECTION, adId), {
        isActive: !currentStatus,
      });
    } catch (error) {
      console.error("Toggle status error:", error);
      alert("Durum güncellenemedi.");
    }
  };

  const deleteAd = async (adId: string, submissionId?: string) => {
    if (!confirm("Bu reklamı silmek istediğinizden emin misiniz?")) return;

    try {
      await deleteDoc(doc(db, ACTIVE_ADS_COLLECTION, adId));

      if (submissionId) {
        await updateDoc(doc(db, SUBMISSIONS_COLLECTION, submissionId), {
          status: "expired" as AdStatus,
          activeAdId: null,
        });
      }

      logAdminActivity("Market Banner silindi", { bannerType: "marketBanner" });
    } catch (error) {
      console.error("Delete error:", error);
      alert("Silme işlemi başarısız oldu.");
    }
  };

  const updateAdLink = async (
    adId: string,
    linkData: {
      linkType: LinkType | null;
      linkId: string | null;
      linkedName: string | null;
    }
  ) => {
    try {
      const updateData: Record<string, string | null> = {
        linkType: linkData.linkType,
        linkedName: linkData.linkedName,
      };

      if (linkData.linkType === "shop") {
        updateData.linkedShopId = linkData.linkId;
        updateData.linkedProductId = null;
      } else if (linkData.linkType === "shop_product") {
        updateData.linkedProductId = linkData.linkId;
        updateData.linkedShopId = null;
      } else {
        updateData.linkedShopId = null;
        updateData.linkedProductId = null;
      }

      await updateDoc(doc(db, ACTIVE_ADS_COLLECTION, adId), updateData);
      setLinkingAdId(null);
      setIsSearchOpen(false);
    } catch (error) {
      console.error("Update link error:", error);
      alert("Bağlantı güncellenemedi.");
    }
  };

  const activateSubmission = async (submission: AdSubmission) => {
    if (!confirm("Bu başvuruyu manuel olarak aktif etmek istiyor musunuz?"))
      return;

    try {
      const adRef = await addDoc(collection(db, ACTIVE_ADS_COLLECTION), {
        imageUrl: submission.imageUrl,
        isActive: true,
        isManual: false,
        submissionId: submission.id,
        linkType: submission.linkType || null,
        linkedShopId:
          submission.linkType === "shop" ? submission.linkedShopId : null,
        linkedProductId:
          submission.linkType === "shop_product"
            ? submission.linkedProductId
            : null,
        linkedName: submission.linkedName || null,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, SUBMISSIONS_COLLECTION, submission.id), {
        status: "active" as AdStatus,
        activeAdId: adRef.id,
        activatedAt: serverTimestamp(),
      });

      logAdminActivity("Market Banner başvurusu onaylandı", {
        shopName: submission.shopName,
        bannerType: "marketBanner",
      });
    } catch (error) {
      console.error("Activate error:", error);
      alert("Aktivasyon başarısız oldu.");
    }
  };

  const deleteSubmission = async (submissionId: string) => {
    if (!confirm("Bu başvuruyu silmek istediğinizden emin misiniz?")) return;

    try {
      await deleteDoc(doc(db, SUBMISSIONS_COLLECTION, submissionId));
    } catch (error) {
      console.error("Delete submission error:", error);
      alert("Silme işlemi başarısız oldu.");
    }
  };

  // ============================================================================
  // FILTERING
  // ============================================================================

  const getFilteredActiveAds = useCallback(() => {
    let filtered = [...activeAds];

    if (filters.status === "manual") {
      filtered = filtered.filter(
        (ad) => ad.isManual === true && ad.isActive === true
      );
    } else if (filters.status === "active") {
      filtered = filtered.filter((ad) => ad.isActive === true);
    }

    if (filters.hasLink === "linked") {
      filtered = filtered.filter((ad) => ad.linkedShopId || ad.linkedProductId);
    } else if (filters.hasLink === "unlinked") {
      filtered = filtered.filter(
        (ad) => !ad.linkedShopId && !ad.linkedProductId
      );
    }

    return filtered;
  }, [activeAds, filters]);

  const getFilteredPausedManualAds = useCallback(() => {
    return activeAds.filter(
      (ad) => ad.isManual === true && ad.isActive === false
    );
  }, [activeAds]);

  const getFilteredSubmissions = useCallback(() => {
    let filtered = [...submissions];

    if (filters.status === "pending") {
      filtered = filtered.filter((sub) => sub.status === "pending");
    } else if (filters.status === "active") {
      filtered = filtered.filter((sub) => sub.status === "active");
    } else if (filters.status === "expired") {
      filtered = filtered.filter((sub) => sub.status === "expired");
    }

    return filtered;
  }, [submissions, filters]);

  const filteredActiveAds = getFilteredActiveAds();
  const filteredPausedManualAds = getFilteredPausedManualAds();
  const filteredSubmissions = getFilteredSubmissions();

  // Stats
  const statsActive = activeAds.filter((ad) => ad.isActive).length;
  const statsPending = submissions.filter((sub) => sub.status === "pending").length;
  const statsManual = activeAds.filter((ad) => ad.isManual).length;
  const statsExpired = submissions.filter((sub) => sub.status === "expired").length;

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50/50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
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
                  <div className="flex items-center justify-center w-7 h-7 bg-indigo-600 rounded-md">
                    <Grid3X3 className="w-3.5 h-3.5 text-white" />
                  </div>
                  <h1 className="text-sm font-semibold text-gray-900">
                    Market Banner Yönetimi
                  </h1>
                </div>
              </div>

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
                Manuel Banner Ekle
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 space-y-4">
          {/* Stats Bar */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Aktif", value: statsActive, color: "text-emerald-600", bg: "bg-emerald-50", icon: <CheckCircle className="w-3.5 h-3.5" /> },
              { label: "Bekleyen", value: statsPending, color: "text-amber-600", bg: "bg-amber-50", icon: <Clock className="w-3.5 h-3.5" /> },
              { label: "Manuel", value: statsManual, color: "text-indigo-600", bg: "bg-indigo-50", icon: <Grid3X3 className="w-3.5 h-3.5" /> },
              { label: "Süresi Dolan", value: statsExpired, color: "text-gray-500", bg: "bg-gray-100", icon: <AlertCircle className="w-3.5 h-3.5" /> },
            ].map((stat) => (
              <div key={stat.label} className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 flex items-center gap-3">
                <div className={`w-8 h-8 ${stat.bg} rounded-md flex items-center justify-center ${stat.color}`}>
                  {stat.icon}
                </div>
                <div>
                  <p className="text-lg font-semibold text-gray-900 leading-none tabular-nums">{stat.value}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Upload Drop Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border border-dashed rounded-lg px-4 py-5 text-center cursor-pointer transition-colors ${
              dragOver
                ? "border-indigo-400 bg-indigo-50"
                : "border-gray-300 bg-white hover:border-gray-400"
            }`}
          >
            <Upload className="w-6 h-6 text-gray-300 mx-auto mb-1.5" />
            <p className="text-xs text-gray-500">
              Görseli sürükleyin veya tıklayın
              <span className="text-gray-400 ml-1">(PNG, JPG — kare format 800x800)</span>
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Main Content Card with Filters */}
          <div className="bg-white border border-gray-200 rounded-lg">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-4 px-3 py-2 border-b border-gray-100">
              <div className="flex items-center gap-0.5">
                {STATUS_TABS.map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() =>
                      setFilters((prev) => ({
                        ...prev,
                        status: tab.value as FilterState["status"],
                      }))
                    }
                    className={`px-2.5 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                      filters.status === tab.value
                        ? "bg-indigo-50 text-indigo-700"
                        : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
                <div className="w-px h-4 bg-gray-200 mx-1" />
                {LINK_TABS.map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() =>
                      setFilters((prev) => ({
                        ...prev,
                        hasLink: tab.value as FilterState["hasLink"],
                      }))
                    }
                    className={`px-2.5 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                      filters.hasLink === tab.value
                        ? "bg-gray-100 text-gray-900"
                        : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <span className="text-[11px] text-gray-400 tabular-nums">
                {filters.status !== "pending" && filters.status !== "expired"
                  ? `${filteredActiveAds.length} reklam`
                  : `${filteredSubmissions.length} başvuru`}
              </span>
            </div>

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-16">
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Yükleniyor...
                </div>
              </div>
            )}

            {/* ===================== ACTIVE / MANUAL ADS TABLE ===================== */}
            {!loading && filters.status !== "pending" && filters.status !== "expired" && (
              <>
                {filteredActiveAds.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                      <Grid3X3 className="w-5 h-5 text-gray-300" />
                    </div>
                    <p className="text-sm font-medium text-gray-900 mb-1">Reklam bulunamadı</p>
                    <p className="text-xs text-gray-400">Bu filtrelere uygun reklam yok</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                          <th className="pl-3 pr-2 py-2.5">Görsel</th>
                          <th className="px-2 py-2.5">Durum</th>
                          <th className="px-2 py-2.5">Tip</th>
                          <th className="px-2 py-2.5">Bağlantı</th>
                          <th className="px-2 py-2.5">Tarih</th>
                          <th className="pl-2 pr-3 py-2.5 text-right">İşlem</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {filteredActiveAds.map((ad) => (
                          <AdRow
                            key={ad.id}
                            ad={ad}
                            onViewImage={() =>
                              setImageModal({
                                isOpen: true,
                                imageUrl: ad.imageUrl,
                                bannerName: `MarketBanner_${ad.id.slice(-6)}`,
                              })
                            }
                            onToggleStatus={() => toggleAdStatus(ad.id, ad.isActive)}
                            onDelete={() => deleteAd(ad.id, ad.submissionId)}
                            onAddLink={() => {
                              setLinkingAdId(ad.id);
                              setIsSearchOpen(true);
                            }}
                            onRemoveLink={() =>
                              updateAdLink(ad.id, {
                                linkType: null,
                                linkId: null,
                                linkedName: null,
                              })
                            }
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Paused Manual Ads (only in Manual tab) */}
                {filters.status === "manual" && filteredPausedManualAds.length > 0 && (
                  <>
                    <div className="px-3 py-2 border-t border-gray-100">
                      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                        Duraklatılmış ({filteredPausedManualAds.length})
                      </p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-gray-50">
                          {filteredPausedManualAds.map((ad) => (
                            <AdRow
                              key={ad.id}
                              ad={ad}
                              onViewImage={() =>
                                setImageModal({
                                  isOpen: true,
                                  imageUrl: ad.imageUrl,
                                  bannerName: `MarketBanner_${ad.id.slice(-6)}`,
                                })
                              }
                              onToggleStatus={() => toggleAdStatus(ad.id, ad.isActive)}
                              onDelete={() => deleteAd(ad.id, ad.submissionId)}
                              onAddLink={() => {
                                setLinkingAdId(ad.id);
                                setIsSearchOpen(true);
                              }}
                              onRemoveLink={() =>
                                updateAdLink(ad.id, {
                                  linkType: null,
                                  linkId: null,
                                  linkedName: null,
                                })
                              }
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}

            {/* ===================== SUBMISSIONS TABLE ===================== */}
            {!loading && (filters.status === "pending" || filters.status === "expired") && (
              <>
                {filteredSubmissions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                      <Clock className="w-5 h-5 text-gray-300" />
                    </div>
                    <p className="text-sm font-medium text-gray-900 mb-1">Başvuru bulunamadı</p>
                    <p className="text-xs text-gray-400">Bu filtrelere uygun başvuru yok</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                          <th className="pl-3 pr-2 py-2.5">Görsel</th>
                          <th className="px-2 py-2.5">Mağaza</th>
                          <th className="px-2 py-2.5">Süre</th>
                          <th className="px-2 py-2.5">Fiyat</th>
                          <th className="px-2 py-2.5">Durum</th>
                          <th className="px-2 py-2.5">Bitiş</th>
                          <th className="px-2 py-2.5">Tarih</th>
                          <th className="pl-2 pr-3 py-2.5 text-right">İşlem</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {filteredSubmissions.map((submission) => (
                          <tr
                            key={submission.id}
                            className="group hover:bg-gray-50/50 transition-colors"
                          >
                            {/* Thumbnail (square) */}
                            <td className="pl-3 pr-2 py-2">
                              <button
                                onClick={() =>
                                  setImageModal({
                                    isOpen: true,
                                    imageUrl: submission.imageUrl,
                                    bannerName: `Submission_${submission.id.slice(-6)}`,
                                  })
                                }
                                className="relative w-10 h-10 rounded overflow-hidden bg-gray-100 group/img block flex-shrink-0"
                              >
                                <Image
                                  src={submission.imageUrl}
                                  alt="Submission"
                                  fill
                                  className="object-cover"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover/img:opacity-100">
                                  <Eye className="w-3 h-3 text-white" />
                                </div>
                              </button>
                            </td>

                            {/* Shop */}
                            <td className="px-2 py-2">
                              <div className="flex items-center gap-1.5">
                                <StoreIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                <span className="font-medium text-gray-900 text-xs truncate max-w-[120px]">
                                  {submission.shopName}
                                </span>
                              </div>
                            </td>

                            {/* Duration */}
                            <td className="px-2 py-2">
                              <span className="text-xs text-gray-600">
                                {getDurationLabel(submission.duration)}
                              </span>
                            </td>

                            {/* Price */}
                            <td className="px-2 py-2">
                              <span className="text-xs font-semibold text-gray-900 tabular-nums">
                                {formatPrice(submission.price)}
                              </span>
                            </td>

                            {/* Status */}
                            <td className="px-2 py-2">
                              <span
                                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${getStatusColor(
                                  submission.status
                                )}`}
                              >
                                {getStatusLabel(submission.status)}
                              </span>
                            </td>

                            {/* Expires */}
                            <td className="px-2 py-2">
                              <span className="text-[11px] text-gray-400 tabular-nums">
                                {formatDate(submission.expiresAt)}
                              </span>
                            </td>

                            {/* Created */}
                            <td className="px-2 py-2">
                              <span className="text-[11px] text-gray-400 tabular-nums">
                                {formatDate(submission.createdAt)}
                              </span>
                            </td>

                            {/* Actions */}
                            <td className="pl-2 pr-3 py-2 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {submission.status === "pending" && (
                                  <button
                                    onClick={() => activateSubmission(submission)}
                                    className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded text-[11px] font-medium transition-colors"
                                  >
                                    <Play className="w-3 h-3" />
                                    Aktif Et
                                  </button>
                                )}
                                <button
                                  onClick={() => deleteSubmission(submission.id)}
                                  className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="Sil"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </main>

        {/* Image Modal */}
        <ImageModal
          isOpen={imageModal.isOpen}
          imageUrl={imageModal.imageUrl}
          onClose={() => setImageModal((prev) => ({ ...prev, isOpen: false }))}
          bannerName={imageModal.bannerName}
        />

        {/* Upload Overlay */}
        {uploading && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg px-6 py-5 text-center shadow-xl">
              <Loader2 className="w-6 h-6 text-indigo-600 animate-spin mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-900">Banner Yükleniyor</p>
              <p className="text-xs text-gray-400 mt-1">Lütfen bekleyin...</p>
            </div>
          </div>
        )}
      </div>
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => {
          setIsSearchOpen(false);
          setLinkingAdId(null);
        }}
        searchType="both"
        title="Bağlantı Ekle"
        placeholder="Mağaza veya mağaza ürünü ara..."
        onSelect={(selection: SearchSelection) => {
          if (!linkingAdId) return;
          updateAdLink(linkingAdId, {
            linkType: selection.type === "shop" ? "shop" : "shop_product",
            linkId: selection.id,
            linkedName: selection.name,
          });
          setIsSearchOpen(false);
          setLinkingAdId(null);
        }}
      />
    </ProtectedRoute>
  );
}
