"use client";

import { useState, useEffect, useRef } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Upload,
  Image as ImageIcon,
  Loader2,
  CheckCircle,
  Calendar,
  Link as LinkIcon,
  X,
  Download,
  Eye,
} from "lucide-react";
import {
  collection,
  onSnapshot,
  doc,
  deleteDoc,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getStorage } from "firebase/storage";
import { db } from "../lib/firebase";
import { useRouter } from "next/navigation";
import { where, limit, getDocs, updateDoc } from "firebase/firestore";

interface TopBanner {
  id: string;
  imageUrl?: string;
  storagePath?: string;
  createdAt: Timestamp;
  dominantColor?: string;
  linkType?: "shop" | "product" | "shop_product";
  linkId?: string;
  linkedName?: string;
}

interface ImageModalProps {
  isOpen: boolean;
  imageUrl: string;
  onClose: () => void;
  bannerName: string;
}

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
      {/* Header */}
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

      {/* Image */}
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

export default function TopBannerPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [banners, setBanners] = useState<TopBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [editingBannerId, setEditingBannerId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<
    { type: TopBanner["linkType"]; id: string; name: string }[]
  >([]);
  const [imageModal, setImageModal] = useState({
    isOpen: false,
    imageUrl: "",
    bannerName: "",
  });
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(
      collection(db, "market_top_ads_banners"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bannersData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as TopBanner[];

      setBanners(bannersData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!editingBannerId || searchTerm.length < 2) return;
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
          name: d.data().name,
        })),
        ...prodsSnap.docs.map((d) => ({
          type: "product" as const,
          id: d.id,
          name: d.data().productName,
        })),
        ...shopProdsSnap.docs.map((d) => ({
          type: "shop_product" as const,
          id: d.id,
          name: d.data().productName,
        })),
      ]);
    }, 300);

    return () => clearTimeout(handler);
  }, [searchTerm, editingBannerId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setEditingBannerId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const uploadBanner = async (file: File) => {
    setUploading(true);
    try {
      const storagePath = `market_top_ads_banners/${Date.now()}_${file.name}`;
      const storage = getStorage();
      const uploadRef = ref(storage, storagePath);
      await uploadBytes(uploadRef, file);
    } catch (error) {
      console.error("Error uploading banner:", error);
    } finally {
      setUploading(false);
    }
  };

  const deleteBanner = async (bannerId: string) => {
    try {
      await deleteDoc(doc(db, "market_top_ads_banners", bannerId));
    } catch (error) {
      console.error("Error deleting banner:", error);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      uploadBanner(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);

    const files = Array.from(event.dataTransfer.files);
    const imageFile = files.find((file) => file.type.startsWith("image/"));

    if (imageFile) {
      uploadBanner(imageFile);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
  };

  const formatDate = (timestamp: Timestamp) => {
    return timestamp.toDate().toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.back()}
                  className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-100"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="font-medium">Geri</span>
                </button>

                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 bg-orange-600 rounded-lg">
                    <ImageIcon className="w-4 h-4 text-white" />
                  </div>
                  <h1 className="text-xl font-semibold text-gray-900">
                    Banner Yönetimi
                  </h1>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="bg-blue-50 px-4 py-2 rounded-lg border border-blue-200">
                  <span className="text-sm text-blue-700 font-medium">
                    {loading ? "Yükleniyor..." : `${banners.length} Banner`}
                  </span>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
                >
                  {uploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  Banner Ekle
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-6 py-6">
          {/* Upload Zone */}
          <div
            className={`mb-6 border-2 border-dashed rounded-xl p-6 text-center transition-all duration-200 cursor-pointer ${
              dragOver
                ? "border-blue-400 bg-blue-50"
                : "border-gray-300 bg-white hover:bg-gray-50"
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => !uploading && fileInputRef.current?.click()}
          >
            <div className="flex flex-col items-center">
              {uploading ? (
                <>
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
                  <p className="text-gray-900 font-medium">
                    Banner yükleniyor...
                  </p>
                  <p className="text-gray-500 text-sm mt-1">
                    Lütfen bekleyin, işlem tamamlanıyor
                  </p>
                </>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-gray-400 mb-3" />
                  <p className="text-gray-900 font-medium mb-1">
                    Banner yüklemek için tıklayın veya sürükleyip bırakın
                  </p>
                  <p className="text-gray-500 text-sm">
                    PNG, JPG, GIF dosyaları desteklenir
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3 text-gray-600">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Bannerlar yükleniyor...</span>
              </div>
            </div>
          )}

          {/* No Banners */}
          {!loading && banners.length === 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-gray-100 rounded-lg mb-4">
                <ImageIcon className="w-6 h-6 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Banner bulunamadı
              </h3>
              <p className="text-gray-500">
                İlk bannerınızı eklemek için yukarıdaki alana tıklayın.
              </p>
            </div>
          )}

          {/* Banners Table */}
          {!loading && banners.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* Table Header */}
              <div className="bg-gray-50 border-b border-gray-200 px-6 py-3">
                <div className="grid grid-cols-12 gap-4 text-xs font-medium text-gray-700 uppercase tracking-wide">
                  <div className="col-span-2">Banner</div>
                  <div className="col-span-2">Dominant Renk</div>
                  <div className="col-span-2">Durum</div>
                  <div className="col-span-3">Bağlantı</div>
                  <div className="col-span-2">Tarih</div>
                  <div className="col-span-1 text-center">İşlemler</div>
                </div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-gray-200">
                {banners.map((banner) => (
                  <div
                    key={banner.id}
                    className="px-6 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="grid grid-cols-12 gap-4 items-center">
                      {/* Banner Image */}
                      <div className="col-span-2">
                        {banner.imageUrl ? (
                          <div className="flex items-center gap-3">
                            <img
                              src={banner.imageUrl}
                              alt="Banner"
                              className="w-16 h-10 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() =>
                                setImageModal({
                                  isOpen: true,
                                  imageUrl: banner.imageUrl!,
                                  bannerName: `Banner_${banner.id.slice(-6)}`,
                                })
                              }
                            />
                            <button
                              onClick={() =>
                                setImageModal({
                                  isOpen: true,
                                  imageUrl: banner.imageUrl!,
                                  bannerName: `Banner_${banner.id.slice(-6)}`,
                                })
                              }
                              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="w-16 h-10 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center">
                            <ImageIcon className="w-4 h-4 text-gray-400" />
                          </div>
                        )}
                      </div>

                      {/* Dominant Color */}
                      <div className="col-span-2">
                        {banner.dominantColor ? (
                          <div className="flex items-center gap-2">
                            <div
                              className="w-6 h-6 rounded border border-gray-300"
                              style={{ backgroundColor: banner.dominantColor }}
                            />
                            <span className="text-sm text-gray-600 font-mono">
                              {banner.dominantColor}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </div>

                      {/* Status */}
                      <div className="col-span-2">
                        {banner.imageUrl ? (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            <span className="text-sm text-green-600 font-medium">
                              Aktif
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
                            <span className="text-sm text-orange-600 font-medium">
                              İşleniyor
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Link */}
                      <div
                        className="col-span-3"
                        ref={editingBannerId === banner.id ? wrapperRef : null}
                      >
                        {!banner.linkId ? (
                          editingBannerId === banner.id ? (
                            <div className="relative">
                              <input
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Mağaza veya ürün ara..."
                                value={searchTerm}
                                autoFocus
                                onChange={(e) => setSearchTerm(e.target.value)}
                              />
                              {searchResults.length > 0 && (
                                <ul className="absolute left-0 right-0 bg-white border border-gray-200 mt-1 rounded-lg shadow-lg max-h-40 overflow-auto z-50">
                                  {searchResults.map((r) => (
                                    <li
                                      key={r.id}
                                      className="p-2 hover:bg-gray-50 cursor-pointer text-gray-900 text-sm"
                                      onMouseDown={async () => {
                                        await updateDoc(
                                          doc(
                                            db,
                                            "market_top_ads_banners",
                                            banner.id
                                          ),
                                          {
                                            linkType: r.type,
                                            linkId: r.id,
                                            linkedName: r.name,
                                          }
                                        );
                                        setEditingBannerId(null);
                                      }}
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
                              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                              onClick={() => {
                                setEditingBannerId(banner.id);
                                setSearchTerm("");
                                setSearchResults([]);
                              }}
                            >
                              <LinkIcon className="w-4 h-4" />
                              Bağlantı Ekle
                            </button>
                          )
                        ) : (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <LinkIcon className="w-4 h-4 text-green-600" />
                              <span className="text-sm text-gray-900 font-medium">
                                {banner.linkedName}
                              </span>
                            </div>
                            <button
                              className="text-xs text-red-600 hover:text-red-700 font-medium"
                              onClick={async () => {
                                await updateDoc(
                                  doc(db, "market_top_ads_banners", banner.id),
                                  {
                                    linkType: null,
                                    linkId: null,
                                    linkedName: null,
                                  }
                                );
                              }}
                            >
                              Kaldır
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Date */}
                      <div className="col-span-2">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Calendar className="w-4 h-4" />
                          <span>{formatDate(banner.createdAt)}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="col-span-1">
                        <div className="flex items-center justify-center">
                          <button
                            onClick={() => deleteBanner(banner.id)}
                            className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
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
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
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
