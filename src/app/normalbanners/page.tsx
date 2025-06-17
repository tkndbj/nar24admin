"use client";

import { useState, useEffect, useRef } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Upload,
  Loader2,
  AlertCircle,
  CheckCircle,
  Grid3X3,
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
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, getStorage } from "firebase/storage";
import { db } from "../lib/firebase";
import { useRouter } from "next/navigation";
import Image from "next/image";

interface MarketBanner {
  id: string;
  imageUrl: string;
  createdAt: Timestamp;
}

export default function NormalBannersPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [banners, setBanners] = useState<MarketBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "market_banners"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bannersData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as MarketBanner[];

      setBanners(bannersData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const uploadBanner = async (file: File) => {
    setUploading(true);
    try {
      // Create storage path exactly like Flutter version
      const fileName = `market_banners/${Date.now()}_${file.name}`;

      // Upload to Firebase Storage
      const storage = getStorage();
      const uploadRef = ref(storage, fileName);
      await uploadBytes(uploadRef, file);

      // Get download URL
      const downloadURL = await getDownloadURL(uploadRef);

      // Add to Firestore exactly like Flutter version
      await addDoc(collection(db, "market_banners"), {
        imageUrl: downloadURL,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error uploading banner:", error);
      // You could add a toast notification here
    } finally {
      setUploading(false);
    }
  };

  const deleteBanner = async (bannerId: string) => {
    try {
      // If you also want to delete from storage, you'd need the storage path
      // stored alongside the imageUrl. For now, just remove from Firestore.
      // This matches the Flutter implementation
      await deleteDoc(doc(db, "market_banners", bannerId));
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
                <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg">
                  <Grid3X3 className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-xl font-bold text-white">
                  Market Banner Yönetimi
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
                ? "border-indigo-400 bg-indigo-500/10"
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
                  <Loader2 className="w-12 h-12 text-indigo-400 animate-spin mb-4" />
                  <p className="text-white font-medium">
                    Market banner yükleniyor...
                  </p>
                  <p className="text-gray-300 text-sm mt-1">
                    Lütfen bekleyin, işlem tamamlanıyor
                  </p>
                </>
              ) : (
                <>
                  <Upload className="w-12 h-12 text-gray-400 mb-4" />
                  <p className="text-white font-medium mb-2">
                    Market banner yüklemek için tıklayın veya sürükleyip bırakın
                  </p>
                  <p className="text-gray-300 text-sm">
                    PNG, JPG, GIF dosyaları desteklenir
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Info Card */}
          <div className="mb-8 backdrop-blur-xl bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-indigo-400 mt-0.5" />
              <div>
                <h3 className="text-indigo-300 font-medium mb-1">
                  Market Banner Hakkında
                </h3>
                <p className="text-indigo-200 text-sm">
                  Market bannerlar uygulamanın market bölümünde görüntülenir.
                  Kullanıcılar bu bannerları görerek özel kampanyalar ve
                  tekliflerden haberdar olur.
                </p>
              </div>
            </div>
          </div>

          {/* Banners Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
              <span className="ml-3 text-gray-300">
                Market bannerlar yükleniyor...
              </span>
            </div>
          ) : banners.length === 0 ? (
            <div className="text-center py-12">
              <div className="flex items-center justify-center w-16 h-16 bg-gray-500/20 rounded-full mx-auto mb-4">
                <Grid3X3 className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">
                Henüz market banner eklenmemiş
              </h3>
              <p className="text-gray-300">
                İlk market bannerınızı eklemek için yukarıdaki alana tıklayın
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {banners.map((banner, index) => (
                <div
                  key={banner.id}
                  className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl overflow-hidden group hover:bg-white/15 transition-all duration-200"
                >
                  {/* Banner Image */}
                  <div className="relative h-48 bg-gradient-to-r from-gray-800 to-gray-900">
                    <Image
                      src={banner.imageUrl}
                      alt={`Market Banner ${index + 1}`}
                      fill
                      className="object-cover"
                    />

                    {/* Delete Button */}
                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => deleteBanner(banner.id)}
                        className="flex items-center justify-center w-8 h-8 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-white" />
                      </button>
                    </div>

                    {/* Banner Number */}
                    <div className="absolute top-3 left-3">
                      <div className="flex items-center justify-center w-8 h-8 bg-indigo-600 rounded-lg">
                        <span className="text-white text-sm font-bold">
                          #{index + 1}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Banner Info */}
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Grid3X3 className="w-4 h-4 text-indigo-400" />
                      <h3 className="text-white font-medium">Market Banner</h3>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-gray-300 mb-2">
                      <AlertCircle className="w-4 h-4" />
                      <span>{formatDate(banner.createdAt)}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      <span className="text-sm text-green-300">Aktif</span>
                    </div>
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
              <Loader2 className="w-12 h-12 text-indigo-400 animate-spin mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">
                Market Banner Yükleniyor
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
