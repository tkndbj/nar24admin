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
  Image as ImageIcon,
  Search,
  X,
  Store,
  Package,
  Link,
  Palette,
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

interface AdsBanner {
  id: string;
  imageUrl: string;
  createdAt: Timestamp;
  dominantColor?: number;
  linkType?: string;
  linkId?: string;
}

interface SearchResult {
  id: string;
  title: string;
  type: "shop" | "product" | "shop_product";
  subtitle?: string;
}

// Color extraction utility (simplified version)
const extractDominantColor = async (imageUrl: string): Promise<number> => {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(0xff808080); // Default gray
        return;
      }

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        let r = 0,
          g = 0,
          b = 0;
        const sampleSize = 10; // Sample every 10th pixel for performance

        for (let i = 0; i < data.length; i += 4 * sampleSize) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
        }

        const pixelCount = data.length / (4 * sampleSize);
        r = Math.round(r / pixelCount);
        g = Math.round(g / pixelCount);
        b = Math.round(b / pixelCount);

        // Convert to single integer (ARGB format)
        const color = (0xff << 24) | (r << 16) | (g << 8) | b;
        resolve(color);
      } catch {
        resolve(0xff808080); // Default gray on error
      }
    };
    img.onerror = () => resolve(0xff808080);
    img.src = imageUrl;
  });
};

export default function AdsBannerPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [banners, setBanners] = useState<AdsBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Link management states
  const [editingBanner, setEditingBanner] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "market_top_ads_banners"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bannersData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as AdsBanner[];

      setBanners(bannersData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Search functionality
  const searchContent = async (searchTerm: string) => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    const results: SearchResult[] = [];

    try {
      // Search shops
      const shopsQuery = query(
        collection(db, "shops"),
        where("shopName", ">=", searchTerm),
        where("shopName", "<=", searchTerm + "\uf8ff"),
        limit(5)
      );
      const shopsSnapshot = await getDocs(shopsQuery);
      shopsSnapshot.forEach((doc) => {
        const data = doc.data();
        results.push({
          id: doc.id,
          title: data.shopName || "İsimsiz Mağaza",
          type: "shop",
          subtitle: data.shopDescription || "Mağaza",
        });
      });

      // Search products
      const productsQuery = query(
        collection(db, "products"),
        where("productName", ">=", searchTerm),
        where("productName", "<=", searchTerm + "\uf8ff"),
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
        where("productName", ">=", searchTerm),
        where("productName", "<=", searchTerm + "\uf8ff"),
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
  };

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      searchContent(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const uploadBanner = async (file: File) => {
    setUploading(true);
    try {
      // Create storage path
      const path = `market_top_ads_banners/${Date.now()}_${file.name}`;

      // Upload to Firebase Storage
      const storage = getStorage();
      const uploadRef = ref(storage, path);
      await uploadBytes(uploadRef, file);

      // Get download URL
      const downloadUrl = await getDownloadURL(uploadRef);

      // Extract dominant color
      const dominantColor = await extractDominantColor(downloadUrl);

      // Add to Firestore with dominant color
      await addDoc(collection(db, "market_top_ads_banners"), {
        imageUrl: downloadUrl,
        dominantColor: dominantColor,
        createdAt: serverTimestamp(),
      });
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

  const updateBannerLink = async (
    bannerId: string,
    linkType: string,
    linkId: string
  ) => {
    try {
      await updateDoc(doc(db, "market_top_ads_banners", bannerId), {
        linkType,
        linkId,
      });
      setEditingBanner(null);
      setSearchQuery("");
      setSearchResults([]);
    } catch (error) {
      console.error("Error updating banner link:", error);
    }
  };

  const removeBannerLink = async (bannerId: string) => {
    try {
      await updateDoc(doc(db, "market_top_ads_banners", bannerId), {
        linkType: null,
        linkId: null,
      });
    } catch (error) {
      console.error("Error removing banner link:", error);
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

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "shop":
        return <Store className="w-4 h-4" />;
      case "product":
      case "shop_product":
        return <Package className="w-4 h-4" />;
      default:
        return <Package className="w-4 h-4" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "shop":
        return "Mağaza";
      case "product":
        return "Ürün";
      case "shop_product":
        return "Mağaza Ürünü";
      default:
        return "Bilinmeyen";
    }
  };

  const formatColor = (colorInt?: number) => {
    if (!colorInt) return "#808080";
    const hex = (colorInt & 0xffffff).toString(16).padStart(6, "0");
    return `#${hex}`;
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
                <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-r from-orange-500 to-pink-600 rounded-lg">
                  <ImageIcon className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-xl font-bold text-white">
                  Ana Banner Yönetimi
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
                Ana Banner Ekle
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
                ? "border-orange-400 bg-orange-500/10"
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
                  <Loader2 className="w-12 h-12 text-orange-400 animate-spin mb-4" />
                  <p className="text-white font-medium">
                    Ana banner yükleniyor...
                  </p>
                  <p className="text-gray-300 text-sm mt-1">
                    Dominant renk çıkarılıyor ve işlem tamamlanıyor
                  </p>
                </>
              ) : (
                <>
                  <Upload className="w-12 h-12 text-gray-400 mb-4" />
                  <p className="text-white font-medium mb-2">
                    Ana banner yüklemek için tıklayın veya sürükleyip bırakın
                  </p>
                  <p className="text-gray-300 text-sm">
                    PNG, JPG, GIF dosyaları desteklenir. Dominant renk otomatik
                    çıkarılır.
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Info Card */}
          <div className="mb-8 backdrop-blur-xl bg-orange-500/10 border border-orange-500/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-orange-400 mt-0.5" />
              <div>
                <h3 className="text-orange-300 font-medium mb-1">
                  Ana Banner Hakkında
                </h3>
                <p className="text-orange-200 text-sm">
                  Ana bannerlar uygulamanın üst kısmında carousel olarak
                  görüntülenir. Arka plan rengi otomatik olarak bannerin
                  dominant rengine göre ayarlanır. Her bannerı bir mağaza veya
                  ürüne bağlayabilirsiniz.
                </p>
              </div>
            </div>
          </div>

          {/* Banners List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
              <span className="ml-3 text-gray-300">
                Ana bannerlar yükleniyor...
              </span>
            </div>
          ) : banners.length === 0 ? (
            <div className="text-center py-12">
              <div className="flex items-center justify-center w-16 h-16 bg-gray-500/20 rounded-full mx-auto mb-4">
                <ImageIcon className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">
                Henüz ana banner eklenmemiş
              </h3>
              <p className="text-gray-300">
                İlk ana bannerınızı eklemek için yukarıdaki alana tıklayın
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {banners.map((banner) => (
                <div
                  key={banner.id}
                  className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl overflow-hidden group hover:bg-white/15 transition-all duration-200"
                >
                  <div className="flex flex-col">
                    <div className="flex flex-col sm:flex-row">
                      {/* Banner Image - Standard banner format */}
                      <div className="relative w-full sm:w-80 h-32 bg-gradient-to-r from-gray-800 to-gray-900 flex-shrink-0">
                        <Image
                          src={banner.imageUrl}
                          alt="Main Banner"
                          fill
                          className="object-cover"
                        />
                        {/* Dominant color indicator */}
                        {banner.dominantColor && (
                          <div
                            className="absolute top-2 right-2 w-6 h-6 rounded-full border-2 border-white shadow-md"
                            style={{
                              backgroundColor: formatColor(
                                banner.dominantColor
                              ),
                            }}
                          />
                        )}
                      </div>

                      {/* Banner Info */}
                      <div className="flex-1 p-4 flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <ImageIcon className="w-4 h-4 text-orange-400" />
                            <h3 className="text-white font-medium">
                              Ana Banner
                            </h3>
                          </div>

                          <div className="flex items-center gap-4 text-sm text-gray-300 mb-2">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="w-4 h-4" />
                              <span>{formatDate(banner.createdAt)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-green-400" />
                              <span className="text-green-300">Aktif</span>
                            </div>
                          </div>

                          {/* Dominant color info */}
                          {banner.dominantColor && (
                            <div className="flex items-center gap-2 text-sm text-gray-300 mb-2">
                              <Palette className="w-4 h-4 text-purple-400" />
                              <span className="text-purple-300">
                                Dominant renk:{" "}
                                {formatColor(banner.dominantColor)}
                              </span>
                            </div>
                          )}

                          {/* Link info */}
                          {banner.linkType && banner.linkId && (
                            <div className="flex items-center gap-2 text-sm">
                              <Link className="w-4 h-4 text-blue-400" />
                              <span className="text-blue-300">
                                {getTypeLabel(banner.linkType)} bağlantısı var
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setEditingBanner(banner.id)}
                            className="flex items-center justify-center w-10 h-10 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                          >
                            <Link className="w-4 h-4 text-white" />
                          </button>
                          {banner.linkType && (
                            <button
                              onClick={() => removeBannerLink(banner.id)}
                              className="flex items-center justify-center w-10 h-10 bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors"
                            >
                              <X className="w-4 h-4 text-white" />
                            </button>
                          )}
                          <button
                            onClick={() => deleteBanner(banner.id)}
                            className="flex items-center justify-center w-10 h-10 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4 text-white" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Link Editor */}
                    {editingBanner === banner.id && (
                      <div className="border-t border-white/20 p-4">
                        <div className="space-y-4">
                          <h4 className="text-white font-medium">
                            Banner Bağlantısı Ekle
                          </h4>

                          {/* Search Input */}
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <Search className="h-5 w-5 text-gray-400" />
                            </div>
                            <input
                              type="text"
                              placeholder="Mağaza veya ürün ara..."
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              className="block w-full pl-10 pr-3 py-2 border border-white/20 rounded-lg bg-white/10 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>

                          {/* Search Results */}
                          {searchLoading && (
                            <div className="flex items-center justify-center py-4">
                              <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                              <span className="ml-2 text-gray-300">
                                Aranıyor...
                              </span>
                            </div>
                          )}

                          {searchResults.length > 0 && (
                            <div className="max-h-48 overflow-y-auto space-y-2">
                              {searchResults.map((result) => (
                                <button
                                  key={`${result.type}-${result.id}`}
                                  onClick={() => {
                                    updateBannerLink(
                                      banner.id,
                                      result.type,
                                      result.id
                                    );
                                  }}
                                  className="w-full flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-left"
                                >
                                  <div className="flex items-center justify-center w-8 h-8 bg-blue-500/20 rounded-lg">
                                    {getTypeIcon(result.type)}
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-white font-medium">
                                      {result.title}
                                    </p>
                                    <p className="text-gray-400 text-sm">
                                      {getTypeLabel(result.type)} •{" "}
                                      {result.subtitle}
                                    </p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Cancel Button */}
                          <div className="flex justify-end">
                            <button
                              onClick={() => {
                                setEditingBanner(null);
                                setSearchQuery("");
                                setSearchResults([]);
                              }}
                              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                            >
                              İptal
                            </button>
                          </div>
                        </div>
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
              <Loader2 className="w-12 h-12 text-orange-400 animate-spin mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">
                Ana Banner Yükleniyor
              </h3>
              <p className="text-gray-300">
                Resim yükleniyor ve dominant renk çıkarılıyor...
              </p>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
