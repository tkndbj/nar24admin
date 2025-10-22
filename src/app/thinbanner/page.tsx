"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Upload,
  Loader2,
  AlertCircle,
  CheckCircle,
  Maximize2,
  Search,
  X,
  Store as StoreIcon,
  Package,
  Link as LinkIcon,
  Calendar,
  ExternalLink,
  Pause,
  Play,
  Clock,
  Eye,
  Download,
  Filter,
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
  getDocs,
  where,
  limit,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, getStorage } from "firebase/storage";
import { db } from "../lib/firebase";
import { useRouter } from "next/navigation";
import Image from "next/image";

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

interface ThinBannerAd extends BaseAd {
  submissionId?: string;
  isManual?: boolean;
}

interface SearchResult {
  id: string;
  title: string;
  type: LinkType;
  subtitle?: string;
}

interface ImageModalProps {
  isOpen: boolean;
  imageUrl: string;
  onClose: () => void;
  bannerName: string;
}

interface FilterState {
  status: "manual" | "pending" | "active" | "expired";
  hasLink: "linked" | "unlinked";
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PAGE_SIZE = 20;
const ACTIVE_ADS_COLLECTION = "market_thin_banners";
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

const getTypeIcon = (type: LinkType): React.ReactNode => {
  switch (type) {
    case "shop":
      return <StoreIcon className="w-4 h-4 text-blue-600" />;
    case "product":
    case "shop_product":
      return <Package className="w-4 h-4 text-green-600" />;
  }
};

const getTypeBadge = (type: LinkType): React.ReactNode => {
  const labels: Record<LinkType, string> = {
    shop: "Mağaza",
    product: "Ürün",
    shop_product: "Mağaza Ürünü",
  };

  const colors: Record<LinkType, string> = {
    shop: "bg-blue-100 text-blue-700",
    product: "bg-green-100 text-green-700",
    shop_product: "bg-purple-100 text-purple-700",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[type]}`}
    >
      {labels[type]}
    </span>
  );
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

export default function ThinBannerPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [activeAds, setActiveAds] = useState<ThinBannerAd[]>([]);
  const [submissions, setSubmissions] = useState<AdSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [editingAdId, setEditingAdId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [imageModal, setImageModal] = useState({
    isOpen: false,
    imageUrl: "",
    bannerName: "",
  });
  const [filters, setFilters] = useState<FilterState>({
    status: "active",
    hasLink: "linked",
  });

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
      })) as ThinBannerAd[];

      setActiveAds(adsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Fetch submissions (pending, approved, expired)
  useEffect(() => {
    const q = query(
      collection(db, SUBMISSIONS_COLLECTION),
      where("adType", "==", "thinBanner"),
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
    if (!editingAdId || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      const results: SearchResult[] = [];

      try {
        // Search shops
        const shopsQuery = query(
          collection(db, "shops"),
          where("name", ">=", searchQuery),
          where("name", "<=", searchQuery + "\uf8ff"),
          limit(5)
        );
        const shopsSnapshot = await getDocs(shopsQuery);
        shopsSnapshot.forEach((doc) => {
          const data = doc.data();
          results.push({
            id: doc.id,
            title: data.name || "İsimsiz Mağaza",
            type: "shop",
            subtitle: "Mağaza",
          });
        });

        // Search products
        const productsQuery = query(
          collection(db, "products"),
          where("productName", ">=", searchQuery),
          where("productName", "<=", searchQuery + "\uf8ff"),
          limit(5)
        );
        const productsSnapshot = await getDocs(productsQuery);
        productsSnapshot.forEach((doc) => {
          const data = doc.data();
          results.push({
            id: doc.id,
            title: data.productName || "İsimsiz Ürün",
            type: "product",
            subtitle: `${data.price || 0} TL`,
          });
        });

        // Search shop products
        const shopProductsQuery = query(
          collection(db, "shop_products"),
          where("productName", ">=", searchQuery),
          where("productName", "<=", searchQuery + "\uf8ff"),
          limit(5)
        );
        const shopProductsSnapshot = await getDocs(shopProductsQuery);
        shopProductsSnapshot.forEach((doc) => {
          const data = doc.data();
          results.push({
            id: doc.id,
            title: data.productName || "İsimsiz Mağaza Ürünü",
            type: "shop_product",
            subtitle: `${data.price || 0} TL`,
          });
        });

        setSearchResults(results);
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, editingAdId]);

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

      // Upload to storage
      const storage = getStorage();
      const timestamp = Date.now();
      const storageRef = ref(
        storage,
        `thin_banners/manual/${timestamp}_${file.name}`
      );

      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);

      // Add to active ads collection
      await addDoc(collection(db, ACTIVE_ADS_COLLECTION), {
        imageUrl: downloadUrl,
        isActive: true,
        isManual: true,
        createdAt: serverTimestamp(),
      });
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
      setSearchQuery("");
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
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50">
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
                    İnce Banner Yönetimi
                  </h1>
                  <p className="text-sm text-gray-600">
                    Ana ekran ince banner yönetimi
                  </p>
                </div>
              </div>

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <Maximize2 className="w-5 h-5 text-orange-600" />
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
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
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
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="linked">Bağlantılı</option>
                  <option value="unlinked">Bağlantısız</option>
                </select>
              </div>
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
                ? "border-orange-500 bg-orange-50"
                : "border-gray-300 bg-white"
            }`}
          >
            <Upload
              className={`w-12 h-12 mx-auto mb-4 ${
                dragOver ? "text-orange-600" : "text-gray-400"
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

          {/* Active Ads List */}
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
                <Loader2 className="w-8 h-8 text-orange-600 animate-spin mx-auto mb-4" />
                <p className="text-gray-600">Yükleniyor...</p>
              </div>
            ) : filteredActiveAds.length === 0 ? (
              <div className="p-12 text-center">
                <Maximize2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Henüz aktif reklam yok</p>
              </div>
            ) : (
              <div className="p-6 space-y-4">
                {filteredActiveAds.map((ad) => (
                  <div
                    key={ad.id}
                    className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
                  >
                    <div className="flex flex-col lg:flex-row">
                      {/* Thin Banner Image */}
                      <div className="relative w-full lg:w-96 h-32 bg-gray-100 flex-shrink-0 group">
                        <Image
                          src={ad.imageUrl}
                          alt="Thin Banner"
                          fill
                          className="object-cover"
                        />

                        {/* Hover Overlay */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <button
                            onClick={() =>
                              setImageModal({
                                isOpen: true,
                                imageUrl: ad.imageUrl,
                                bannerName: `ThinBanner_${ad.id.slice(-6)}`,
                              })
                            }
                            className="p-2 bg-white/90 hover:bg-white rounded-lg transition-colors"
                            title="Görseli Görüntüle"
                          >
                            <Eye className="w-4 h-4 text-gray-900" />
                          </button>
                        </div>

                        {/* Status Badge */}
                        <div className="absolute top-3 left-3">
                          {ad.isActive ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200 shadow-lg">
                              <div className="w-1.5 h-1.5 bg-green-600 rounded-full animate-pulse" />
                              Yayında
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200 shadow-lg">
                              Duraklatıldı
                            </span>
                          )}
                        </div>

                        {/* Type Badge */}
                        <div className="absolute top-3 right-3">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border shadow-lg ${getStatusColor(
                              ad.isManual ? "manual" : "active"
                            )}`}
                          >
                            {ad.isManual ? "Manuel" : "Kullanıcı"}
                          </span>
                        </div>
                      </div>

                      {/* Banner Info */}
                      <div className="flex-1 p-4 flex items-center justify-between">
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center gap-3">
                            <Maximize2 className="w-5 h-5 text-orange-600" />
                            <h3 className="text-lg font-medium text-gray-900">
                              İnce Banner
                            </h3>
                          </div>

                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Calendar className="w-4 h-4" />
                            <span>{formatDate(ad.createdAt)}</span>
                          </div>

                          {/* Link Info */}
                          {ad.linkId ? (
                            <div className="flex items-center gap-2">
                              <ExternalLink className="w-4 h-4 text-blue-600" />
                              <div className="flex items-center gap-2">
                                {ad.linkType && getTypeBadge(ad.linkType)}
                                <span className="text-sm text-gray-900 font-medium">
                                  {ad.linkedName || ad.linkId.slice(0, 8)}
                                </span>
                              </div>
                            </div>
                          ) : editingAdId === ad.id ? (
                            <div className="space-y-2 max-w-md">
                              <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                  <Search className="h-4 w-4 text-gray-400" />
                                </div>
                                <input
                                  type="text"
                                  placeholder="Ara..."
                                  value={searchQuery}
                                  autoFocus
                                  onChange={(e) =>
                                    setSearchQuery(e.target.value)
                                  }
                                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                />
                              </div>

                              {searchLoading && (
                                <div className="flex items-center justify-center py-2">
                                  <Loader2 className="w-4 h-4 animate-spin text-orange-600" />
                                </div>
                              )}

                              {searchResults.length > 0 && (
                                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg bg-white">
                                  {searchResults.map((result) => (
                                    <button
                                      key={`${result.type}-${result.id}`}
                                      onClick={() => {
                                        updateAdLink(ad.id, {
                                          linkType: result.type,
                                          linkId: result.id,
                                          linkedName: result.title,
                                        });
                                      }}
                                      className="w-full flex items-center gap-2 p-2 hover:bg-gray-50 transition-colors text-left text-sm"
                                    >
                                      {getTypeIcon(result.type)}
                                      <div className="flex-1 min-w-0">
                                        <p className="font-medium truncate">
                                          {result.title}
                                        </p>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}

                              <button
                                onClick={() => {
                                  setEditingAdId(null);
                                  setSearchQuery("");
                                  setSearchResults([]);
                                }}
                                className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors text-sm"
                              >
                                İptal
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingAdId(ad.id);
                                setSearchQuery("");
                              }}
                              className="flex items-center gap-2 text-sm text-orange-600 hover:text-orange-700 font-medium"
                            >
                              <LinkIcon className="w-4 h-4" />
                              Bağlantı Ekle
                            </button>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 ml-4">
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
                              <X className="w-5 h-5" />
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
              <div className="p-6 space-y-4">
                {filteredSubmissions.map((submission) => (
                  <div
                    key={submission.id}
                    className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
                  >
                    <div className="flex flex-col lg:flex-row">
                      <div className="relative w-full lg:w-96 h-32 bg-gray-100">
                        <Image
                          src={submission.imageUrl}
                          alt="Submission"
                          fill
                          className="object-cover cursor-pointer"
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
                        <div className="absolute top-3 right-3">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border shadow-lg ${getStatusColor(
                              submission.status
                            )}`}
                          >
                            {getStatusLabel(submission.status)}
                          </span>
                        </div>
                      </div>

                      <div className="flex-1 p-4 flex items-center justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <StoreIcon className="w-4 h-4 text-gray-600" />
                            <span className="font-medium text-gray-900">
                              {submission.shopName}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-gray-600">
                              {getDurationLabel(submission.duration)}
                            </span>
                            <span className="font-semibold text-gray-900">
                              {formatPrice(submission.price)}
                            </span>
                          </div>
                          {submission.expiresAt && (
                            <div className="text-xs text-gray-600">
                              Bitiş: {formatDate(submission.expiresAt)}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {submission.status === "pending" && (
                            <button
                              onClick={() => activateSubmission(submission)}
                              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                            >
                              Aktif Et
                            </button>
                          )}
                          <button
                            onClick={() => deleteSubmission(submission.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
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
              <Loader2 className="w-12 h-12 text-orange-600 animate-spin mx-auto mb-4" />
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
