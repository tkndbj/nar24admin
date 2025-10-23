"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Upload,
  Image as ImageIcon,
  Loader2,
  CheckCircle,
  Link as LinkIcon,
  X,
  Download,
  Eye,
  Pause,
  Play,
  Clock,
  Store as StoreIcon,
  Package,
  AlertCircle,
  Filter,
  XCircle,
} from "lucide-react";
import {
  collection,
  onSnapshot,
  doc,
  deleteDoc,
  orderBy,
  query,
  Timestamp,
  where,
  limit,
  getDocs,
  updateDoc,
  addDoc,
  serverTimestamp,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, getStorage } from "firebase/storage";
import { db } from "../lib/firebase";
import { useRouter } from "next/navigation";
import { compressImage, formatFileSize } from "@/utils/imageCompression";

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
  linkId?: string;
  linkedName?: string;
  dominantColor?: number;
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

interface TopBannerAd extends BaseAd {
  submissionId?: string;
  isManual?: boolean;
}

interface SearchResult {
  type: LinkType;
  id: string;
  name: string;
}

interface ImageModalProps {
  isOpen: boolean;
  imageUrl: string;
  onClose: () => void;
  bannerName: string;
}

interface FilterState {
  status: "all" | "manual" | "pending" | "active" | "expired";
  hasLink: "all" | "linked" | "unlinked";
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PAGE_SIZE = 20;
const ACTIVE_ADS_COLLECTION = "market_top_ads_banners";
const SUBMISSIONS_COLLECTION = "ad_submissions";

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
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "approved":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "active":
      return "bg-green-100 text-green-800 border-green-200";
    case "expired":
      return "bg-gray-100 text-gray-800 border-gray-200";
    case "rejected":
      return "bg-red-100 text-red-800 border-red-200";
    case "manual":
      return "bg-purple-100 text-purple-800 border-purple-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
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
      <div className="absolute top-0 left-0 right-0 bg-black/50 backdrop-blur-sm p-4 z-10">
        <div className="flex items-center justify-between text-white">
          <div>
            <h3 className="text-lg font-semibold">{bannerName}</h3>
            <p className="text-sm text-gray-300">Banner Görseli</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={downloadImage}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              <span className="text-sm">İndir</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
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
// MAIN COMPONENT
// ============================================================================

export default function TopBannerPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // State
  const [activeAds, setActiveAds] = useState<TopBannerAd[]>([]);
  const [submissions, setSubmissions] = useState<AdSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [editingAdId, setEditingAdId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [imageModal, setImageModal] = useState({
    isOpen: false,
    imageUrl: "",
    bannerName: "",
  });
  const [filters, setFilters] = useState<FilterState>({
    status: "all",
    hasLink: "all",
  });
  const [, setLastVisible] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [, setHasMore] = useState(true);
  const [, setCompressionInfo] = useState<string>("");
  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  // Fetch active ads
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
      })) as TopBannerAd[];

      setActiveAds(adsData);
      setLastVisible(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === PAGE_SIZE);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Fetch submissions (pending, approved, expired)
  useEffect(() => {
    const q = query(
      collection(db, SUBMISSIONS_COLLECTION),
      where("adType", "==", "topBanner"),
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

  // Search for shops/products
  useEffect(() => {
    if (!editingAdId || searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }

    const handler = setTimeout(async () => {
      const shopsQ = query(
        collection(db, "shops"),
        where("name", ">=", searchTerm),
        where("name", "<=", searchTerm + "\uf8ff"),
        limit(5)
      );
      const prodsQ = query(
        collection(db, "products"),
        where("productName", ">=", searchTerm),
        where("productName", "<=", searchTerm + "\uf8ff"),
        limit(5)
      );
      const shopProdsQ = query(
        collection(db, "shop_products"),
        where("productName", ">=", searchTerm),
        where("productName", "<=", searchTerm + "\uf8ff"),
        limit(5)
      );

      const [shopsSnap, prodsSnap, shopProdsSnap] = await Promise.all([
        getDocs(shopsQ),
        getDocs(prodsQ),
        getDocs(shopProdsQ),
      ]);

      setSearchResults([
        ...shopsSnap.docs.map((d) => ({
          type: "shop" as const,
          id: d.id,
          name: d.data().name as string,
        })),
        ...prodsSnap.docs.map((d) => ({
          type: "product" as const,
          id: d.id,
          name: d.data().productName as string,
        })),
        ...shopProdsSnap.docs.map((d) => ({
          type: "shop_product" as const,
          id: d.id,
          name: d.data().productName as string,
        })),
      ]);
    }, 300);

    return () => clearTimeout(handler);
  }, [searchTerm, editingAdId]);

  // Click outside to close search
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setEditingAdId(null);
        setSearchTerm("");
        setSearchResults([]);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
      
      // Compress image before uploading
      if (file.type.startsWith('image/')) {
        try {
          console.log(`Original: ${formatFileSize(file.size)}`);
          
          const result = await compressImage(file, {
            maxWidth: 1920,
            maxHeight: 1920,
            quality: 0.85,
            format: 'image/jpeg',
            maintainAspectRatio: true,
          });
  
          fileToUpload = result.compressedFile;
          
          const compressionMsg = `Sıkıştırıldı: ${formatFileSize(result.originalSize)} → ${formatFileSize(result.compressedSize)} (${result.compressionRatio.toFixed(1)}% tasarruf)`;
          setCompressionInfo(compressionMsg);
          console.log(compressionMsg);
          
        } catch (compressionError) {
          console.error("Compression failed:", compressionError);
          setCompressionInfo("Sıkıştırma başarısız, orijinal dosya yükleniyor...");
        }
      }
  
      // Upload compressed file
      const storage = getStorage();
      const timestamp = Date.now();
      const storageRef = ref(
        storage,
        `market_top_ads_banners/${timestamp}_${file.name}`  // ✅ CORRECT
      );
  
      await uploadBytes(storageRef, fileToUpload);
      const downloadUrl = await getDownloadURL(storageRef);
  
      await addDoc(collection(db, ACTIVE_ADS_COLLECTION), {
        imageUrl: downloadUrl,
        isActive: true,
        isManual: true,
        createdAt: serverTimestamp(),
      });
  
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
      // Delete from active ads
      await deleteDoc(doc(db, ACTIVE_ADS_COLLECTION, adId));

      // If has submission, update it
      if (submissionId) {
        await updateDoc(doc(db, SUBMISSIONS_COLLECTION, submissionId), {
          status: "expired" as AdStatus,
          activeAdId: null,
        });
      }
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
      await updateDoc(doc(db, ACTIVE_ADS_COLLECTION, adId), linkData);
      setEditingAdId(null);
      setSearchTerm("");
      setSearchResults([]);
    } catch (error) {
      console.error("Update link error:", error);
      alert("Bağlantı güncellenemedi.");
    }
  };

  const activateSubmission = async (submission: AdSubmission) => {
    if (!confirm("Bu başvuruyu manuel olarak aktif etmek istiyor musunuz?"))
      return;

    try {
      // Create active ad
      const adRef = await addDoc(collection(db, ACTIVE_ADS_COLLECTION), {
        imageUrl: submission.imageUrl,
        isActive: true,
        isManual: false,
        submissionId: submission.id,
        linkType: submission.linkType || null,
        linkId: submission.linkedShopId || submission.linkedProductId || null,
        linkedName: submission.linkedName || null,
        createdAt: serverTimestamp(),
      });

      // Update submission
      await updateDoc(doc(db, SUBMISSIONS_COLLECTION, submission.id), {
        status: "active" as AdStatus,
        activeAdId: adRef.id,
        activatedAt: serverTimestamp(),
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
      filtered = filtered.filter((ad) => ad.isManual === true);
    } else if (filters.status === "active") {
      filtered = filtered.filter((ad) => ad.isActive === true);
    }

    if (filters.hasLink === "linked") {
      filtered = filtered.filter((ad) => ad.linkId);
    } else if (filters.hasLink === "unlinked") {
      filtered = filtered.filter((ad) => !ad.linkId);
    }

    return filtered;
  }, [activeAds, filters]);

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
  const filteredSubmissions = getFilteredSubmissions();

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-40 shadow-sm">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.push("/dashboard")}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-gray-600" />
                </button>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    Büyük Banner Yönetimi
                  </h1>
                  <p className="text-sm text-gray-600">
                    Ana ekran üst banner yönetimi
                  </p>
                </div>
              </div>

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                <span className="font-medium">Manuel Banner Ekle</span>
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-1">Aktif Reklamlar</p>
              <p className="text-2xl font-bold text-gray-900">
                {activeAds.filter((ad) => ad.isActive).length}
              </p>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <Clock className="w-5 h-5 text-yellow-600" />
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-1">Bekleyen Başvurular</p>
              <p className="text-2xl font-bold text-gray-900">
                {submissions.filter((sub) => sub.status === "pending").length}
              </p>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <ImageIcon className="w-5 h-5 text-purple-600" />
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-1">Manuel Reklamlar</p>
              <p className="text-2xl font-bold text-gray-900">
                {activeAds.filter((ad) => ad.isManual).length}
              </p>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-gray-600" />
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-1">Süresi Dolan</p>
              <p className="text-2xl font-bold text-gray-900">
                {submissions.filter((sub) => sub.status === "expired").length}
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-4">
              <Filter className="w-5 h-5 text-gray-600" />
              <div className="flex items-center gap-2 flex-1">
                <span className="text-sm font-medium text-gray-700">
                  Durum:
                </span>
                <select
                  value={filters.status}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      status: e.target.value as FilterState["status"],
                    }))
                  }
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="all">Tümü</option>
                  <option value="manual">Manuel</option>
                  <option value="pending">Beklemede</option>
                  <option value="active">Aktif</option>
                  <option value="expired">Süresi Dolan</option>
                </select>

                <span className="text-sm font-medium text-gray-700 ml-4">
                  Bağlantı:
                </span>
                <select
                  value={filters.hasLink}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      hasLink: e.target.value as FilterState["hasLink"],
                    }))
                  }
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="all">Tümü</option>
                  <option value="linked">Bağlantılı</option>
                  <option value="unlinked">Bağlantısız</option>
                </select>
              </div>

              {(filters.status !== "all" || filters.hasLink !== "all") && (
                <button
                  onClick={() => setFilters({ status: "all", hasLink: "all" })}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  Temizle
                </button>
              )}
            </div>
          </div>

          {/* Upload Area */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              dragOver
                ? "border-purple-500 bg-purple-50"
                : "border-gray-300 bg-white"
            }`}
          >
            <Upload
              className={`w-12 h-12 mx-auto mb-4 ${
                dragOver ? "text-purple-600" : "text-gray-400"
              }`}
            />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Banner Yükle
            </h3>
            <p className="text-gray-600 mb-4">
              Dosyayı buraya sürükleyin veya tıklayarak seçin
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Active Ads Section */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  Aktif & Manuel Reklamlar
                </h2>
                <span className="text-sm text-gray-600">
                  {filteredActiveAds.length} reklam
                </span>
              </div>
            </div>

            {loading ? (
              <div className="p-12 text-center">
                <Loader2 className="w-8 h-8 text-purple-600 animate-spin mx-auto mb-4" />
                <p className="text-gray-600">Yükleniyor...</p>
              </div>
            ) : filteredActiveAds.length === 0 ? (
              <div className="p-12 text-center">
                <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Henüz aktif reklam yok</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredActiveAds.map((ad) => (
                  <div
                    key={ad.id}
                    className="p-6 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-6">
                      {/* Image Preview */}
                      <div className="flex-shrink-0">
                        <div className="relative group">
                          <img
                            src={ad.imageUrl}
                            alt="Banner"
                            className="w-32 h-20 object-cover rounded-lg border border-gray-200"
                          />
                          <button
                            onClick={() =>
                              setImageModal({
                                isOpen: true,
                                imageUrl: ad.imageUrl,
                                bannerName: `Banner_${ad.id.slice(-6)}`,
                              })
                            }
                            className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg"
                          >
                            <Eye className="w-6 h-6 text-white" />
                          </button>
                        </div>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                              ad.isManual ? "manual" : "active"
                            )}`}
                          >
                            {ad.isManual ? "Manuel" : "Kullanıcı Reklamı"}
                          </span>
                          {ad.isActive ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                              <div className="w-1.5 h-1.5 bg-green-600 rounded-full animate-pulse" />
                              Yayında
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                              Duraklatıldı
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-gray-600 mb-1">Oluşturulma</p>
                            <p className="text-gray-900 font-medium">
                              {formatDate(ad.createdAt)}
                            </p>
                          </div>

                          <div>
                            <p className="text-gray-600 mb-1">Bağlantı</p>
                            {ad.linkId ? (
                              <div className="flex items-center gap-2">
                                {ad.linkType === "shop" ? (
                                  <StoreIcon className="w-4 h-4 text-green-600" />
                                ) : (
                                  <Package className="w-4 h-4 text-blue-600" />
                                )}
                                <span className="text-gray-900 font-medium truncate">
                                  {ad.linkedName || ad.linkId.slice(0, 8)}
                                </span>
                              </div>
                            ) : editingAdId === ad.id ? (
                              <div
                                className="relative"
                                ref={editingAdId === ad.id ? wrapperRef : null}
                              >
                                <input
                                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                  placeholder="Ara..."
                                  value={searchTerm}
                                  autoFocus
                                  onChange={(e) =>
                                    setSearchTerm(e.target.value)
                                  }
                                />
                                {searchResults.length > 0 && (
                                  <ul className="absolute left-0 right-0 bg-white border border-gray-200 mt-1 rounded-lg shadow-lg max-h-40 overflow-auto z-50">
                                    {searchResults.map((r) => (
                                      <li
                                        key={r.id}
                                        className="p-2 hover:bg-gray-50 cursor-pointer text-sm"
                                        onMouseDown={() =>
                                          updateAdLink(ad.id, {
                                            linkType: r.type,
                                            linkId: r.id,
                                            linkedName: r.name,
                                          })
                                        }
                                      >
                                        {r.type === "shop" ? "🏬 " : "📦 "}
                                        {r.name}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            ) : (
                              <button
                                className="text-purple-600 hover:text-purple-700 font-medium"
                                onClick={() => {
                                  setEditingAdId(ad.id);
                                  setSearchTerm("");
                                }}
                              >
                                + Ekle
                              </button>
                            )}
                          </div>

                          {ad.dominantColor && (
                            <div>
                              <p className="text-gray-600 mb-1">
                                Dominant Renk
                              </p>
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-6 h-6 rounded border border-gray-300"
                                  style={{
                                    backgroundColor: `#${ad.dominantColor
                                      .toString(16)
                                      .padStart(8, "0")
                                      .slice(2)}`,
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleAdStatus(ad.id, ad.isActive)}
                          className={`p-2 rounded-lg transition-colors ${
                            ad.isActive
                              ? "text-orange-600 hover:bg-orange-50"
                              : "text-green-600 hover:bg-green-50"
                          }`}
                          title={ad.isActive ? "Duraklat" : "Aktif Et"}
                        >
                          {ad.isActive ? (
                            <Pause className="w-5 h-5" />
                          ) : (
                            <Play className="w-5 h-5" />
                          )}
                        </button>

                        {ad.linkId && (
                          <button
                            onClick={() =>
                              updateAdLink(ad.id, {
                                linkType: null,
                                linkId: null,
                                linkedName: null,
                              })
                            }
                            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Bağlantıyı Kaldır"
                          >
                            <LinkIcon className="w-5 h-5" />
                          </button>
                        )}

                        <button
                          onClick={() => deleteAd(ad.id, ad.submissionId)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Sil"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submissions Section */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  Kullanıcı Başvuruları
                </h2>
                <span className="text-sm text-gray-600">
                  {filteredSubmissions.length} başvuru
                </span>
              </div>
            </div>

            {filteredSubmissions.length === 0 ? (
              <div className="p-12 text-center">
                <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Henüz başvuru yok</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredSubmissions.map((submission) => (
                  <div
                    key={submission.id}
                    className="p-6 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-6">
                      {/* Image */}
                      <div className="flex-shrink-0">
                        <img
                          src={submission.imageUrl}
                          alt="Banner"
                          className="w-32 h-20 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() =>
                            setImageModal({
                              isOpen: true,
                              imageUrl: submission.imageUrl,
                              bannerName: `Submission_${submission.id.slice(
                                -6
                              )}`,
                            })
                          }
                        />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-3">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                              submission.status
                            )}`}
                          >
                            {getStatusLabel(submission.status)}
                          </span>
                          {submission.status === "active" &&
                            submission.expiresAt && (
                              <span className="text-xs text-gray-600">
                                Bitiş: {formatDate(submission.expiresAt)}
                              </span>
                            )}
                        </div>

                        <div className="grid grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-gray-600 mb-1">Dükkan</p>
                            <p className="text-gray-900 font-medium truncate">
                              {submission.shopName}
                            </p>
                          </div>

                          <div>
                            <p className="text-gray-600 mb-1">Süre</p>
                            <p className="text-gray-900 font-medium">
                              {getDurationLabel(submission.duration)}
                            </p>
                          </div>

                          <div>
                            <p className="text-gray-600 mb-1">Fiyat</p>
                            <p className="text-gray-900 font-medium">
                              {formatPrice(submission.price)}
                            </p>
                          </div>

                          <div>
                            <p className="text-gray-600 mb-1">Tarih</p>
                            <p className="text-gray-900 font-medium">
                              {formatDate(submission.createdAt)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {submission.status === "pending" && (
                          <button
                            onClick={() => activateSubmission(submission)}
                            className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                          >
                            Aktif Et
                          </button>
                        )}

                        <button
                          onClick={() => deleteSubmission(submission.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Sil"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-8 text-center shadow-2xl">
              <Loader2 className="w-12 h-12 text-purple-600 animate-spin mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Banner Yükleniyor
              </h3>
              <p className="text-gray-600">
                İşlem tamamlanana kadar lütfen bekleyin...
              </p>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
