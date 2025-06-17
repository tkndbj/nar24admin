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
  AlertCircle,
  CheckCircle,
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
import Image from "next/image";

interface TopBanner {
  id: string;
  imageUrl?: string;
  storagePath?: string;
  createdAt: Timestamp;
  dominantColor?: string;
}

export default function TopBannerPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [banners, setBanners] = useState<TopBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

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

  const uploadBanner = async (file: File) => {
    setUploading(true);
    try {
      // Build the exact same storage path the Flutter function expects
      const storagePath = `market_top_ads_banners/${Date.now()}_${file.name}`;

      // Upload to storage only - the cloud function will handle Firestore
      const storage = getStorage();
      const uploadRef = ref(storage, storagePath);
      await uploadBytes(uploadRef, file);

      // Cloud function will automatically:
      // - compute dominantColor
      // - write imageUrl, storagePath, createdAt & dominantColor
      // - into market_top_ads_banners/{docId}
    } catch (error) {
      console.error("Error uploading banner:", error);
      // You could add a toast notification here
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
    // Reset input
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
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        {/* Header */}
        <header className="backdrop-blur-xl bg-white/10 border-b border-white/20 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.back()}
                  className="flex items-center justify-center w-8 h-8 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-r from-orange-500 to-red-600 rounded-lg">
                  <ImageIcon className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-xl font-bold text-white">
                  Üst Banner Yönetimi
                </h1>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-medium rounded-lg transition-all duration-200 disabled:cursor-not-allowed"
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
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Upload Zone */}
          <div
            className={`mb-8 border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${
              dragOver
                ? "border-blue-400 bg-blue-500/10"
                : "border-white/30 bg-white/5 hover:bg-white/10"
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => !uploading && fileInputRef.current?.click()}
          >
            <div className="flex flex-col items-center">
              {uploading ? (
                <>
                  <Loader2 className="w-12 h-12 text-blue-400 animate-spin mb-4" />
                  <p className="text-white font-medium">Banner yükleniyor...</p>
                  <p className="text-gray-300 text-sm mt-1">
                    Lütfen bekleyin, işlem tamamlanıyor
                  </p>
                </>
              ) : (
                <>
                  <Upload className="w-12 h-12 text-gray-400 mb-4" />
                  <p className="text-white font-medium mb-2">
                    Banner yüklemek için tıklayın veya sürükleyip bırakın
                  </p>
                  <p className="text-gray-300 text-sm">
                    PNG, JPG, GIF dosyaları desteklenir
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Banners List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
              <span className="ml-3 text-gray-300">
                Bannerlar yükleniyor...
              </span>
            </div>
          ) : banners.length === 0 ? (
            <div className="text-center py-12">
              <div className="flex items-center justify-center w-16 h-16 bg-gray-500/20 rounded-full mx-auto mb-4">
                <ImageIcon className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">
                Henüz banner eklenmemiş
              </h3>
              <p className="text-gray-300">
                İlk bannerınızı eklemek için yukarıdaki alana tıklayın
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {banners.map((banner) => (
                <div
                  key={banner.id}
                  className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl overflow-hidden group hover:bg-white/15 transition-all duration-200"
                >
                  {/* Banner Image */}
                  <div className="relative h-48 bg-gradient-to-r from-gray-800 to-gray-900">
                    {banner.imageUrl ? (
                      <Image
                        src={banner.imageUrl}
                        alt="Top Ad Banner"
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <ImageIcon className="w-16 h-16 text-gray-400" />
                      </div>
                    )}

                    {/* Dominant Color Indicator */}
                    {banner.dominantColor && (
                      <div className="absolute top-3 left-3">
                        <div
                          className="w-6 h-6 rounded-full border-2 border-white shadow-lg"
                          style={{ backgroundColor: banner.dominantColor }}
                          title={`Dominant Color: ${banner.dominantColor}`}
                        />
                      </div>
                    )}

                    {/* Delete Button */}
                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => deleteBanner(banner.id)}
                        className="flex items-center justify-center w-8 h-8 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  </div>

                  {/* Banner Info */}
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <ImageIcon className="w-4 h-4 text-blue-400" />
                      <h3 className="text-white font-medium">
                        Üst Reklam Banneri
                      </h3>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-gray-300">
                      <AlertCircle className="w-4 h-4" />
                      <span>{formatDate(banner.createdAt)}</span>
                    </div>

                    {banner.imageUrl && (
                      <div className="flex items-center gap-2 mt-2">
                        <CheckCircle className="w-4 h-4 text-green-400" />
                        <span className="text-sm text-green-300">Aktif</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Upload Overlay */}
        {uploading && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-8 text-center">
              <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">
                Banner Yükleniyor
              </h3>
              <p className="text-gray-300">
                İşlem tamamlanana kadar lütfen bekleyin...
              </p>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
