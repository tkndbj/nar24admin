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
  Maximize2,
  Search,
  X,
  Store,
  Package,
  Link,
  Calendar,
  ExternalLink,
  Info,
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

interface ThinBanner {
  id: string;
  imageUrl: string;
  createdAt: Timestamp;
  linkType?: string;
  linkId?: string;
}

interface SearchResult {
  id: string;
  title: string;
  type: "shop" | "product" | "shop_product";
  subtitle?: string;
}

export default function ThinBannerPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [banners, setBanners] = useState<ThinBanner[]>([]);
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
      collection(db, "market_thin_banners"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bannersData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as ThinBanner[];

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
        where("name", ">=", searchTerm),
        where("name", "<=", searchTerm + "\uf8ff"),
        limit(5)
      );
      const shopsSnapshot = await getDocs(shopsQuery);
      shopsSnapshot.forEach((doc) => {
        const data = doc.data() as { name?: string; description?: string };
        results.push({
          id: doc.id,
          title: data.name || "İsimsiz Mağaza",
          type: "shop",
          subtitle: data.description || "Mağaza",
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
        const data = doc.data() as { productName?: string; price?: number };
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
        const data = doc.data() as { productName?: string; price?: number };
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
      const path = `market_thin_banners/${Date.now()}_${file.name}`;
      const storage = getStorage();
      const uploadRef = ref(storage, path);
      await uploadBytes(uploadRef, file);
      const downloadUrl = await getDownloadURL(uploadRef);

      await addDoc(collection(db, "market_thin_banners"), {
        imageUrl: downloadUrl,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error uploading banner:", error);
    } finally {
      setUploading(false);
    }
  };

  const deleteBanner = async (bannerId: string) => {
    if (!confirm("Bu banner'ı silmek istediğinizden emin misiniz?")) {
      return;
    }

    try {
      await deleteDoc(doc(db, "market_thin_banners", bannerId));
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
      await updateDoc(doc(db, "market_thin_banners", bannerId), {
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
      await updateDoc(doc(db, "market_thin_banners", bannerId), {
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

  const getTypeBadge = (type: string) => {
    const config = {
      shop: { label: "Mağaza", color: "bg-blue-100 text-blue-700" },
      product: { label: "Ürün", color: "bg-green-100 text-green-700" },
      shop_product: {
        label: "Mağaza Ürünü",
        color: "bg-purple-100 text-purple-700",
      },
    };

    const typeConfig = config[type as keyof typeof config] || config.product;

    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${typeConfig.color}`}
      >
        {getTypeIcon(type)}
        {typeConfig.label}
      </span>
    );
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.back()}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-gray-600" />
                </button>

                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <Maximize2 className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <h1 className="text-xl font-semibold text-gray-900">
                      İnce Banner Yönetimi
                    </h1>
                    <p className="text-sm text-gray-500">
                      Ana ekran ince bannerlarını yönetin
                    </p>
                  </div>
                </div>
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
        </header>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="max-w-7xl mx-auto px-6 py-6">
          {/* Info Card */}
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-blue-900 font-medium mb-1">
                  İnce Banner Kullanım Bilgisi
                </h3>
                <p className="text-blue-700 text-sm">
                  İnce bannerlar uygulamanın ana ekranında yatay olarak
                  görüntülenir. En iyi sonuç için yatay (landscape)
                  orientasyonda, ince format resimler kullanın. Her bannerı bir
                  mağaza veya ürüne bağlayabilirsiniz.
                </p>
              </div>
            </div>
          </div>

          {/* Upload Zone */}
          <div
            className={`mb-6 border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200 cursor-pointer ${
              dragOver
                ? "border-blue-400 bg-blue-50"
                : "border-gray-300 bg-gray-50 hover:bg-gray-100"
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => !uploading && fileInputRef.current?.click()}
          >
            <div className="flex flex-col items-center">
              {uploading ? (
                <>
                  <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                  <p className="text-gray-900 font-medium">
                    Banner yükleniyor...
                  </p>
                  <p className="text-gray-600 text-sm mt-1">
                    Lütfen bekleyin, işlem tamamlanıyor
                  </p>
                </>
              ) : (
                <>
                  <Upload className="w-12 h-12 text-gray-400 mb-4" />
                  <p className="text-gray-900 font-medium mb-2">
                    Banner yüklemek için tıklayın veya sürükleyip bırakın
                  </p>
                  <p className="text-gray-600 text-sm">
                    PNG, JPG, GIF dosyaları desteklenir • İnce format önerilir
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Banners List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <span className="ml-3 text-gray-600">
                Bannerlar yükleniyor...
              </span>
            </div>
          ) : banners.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <div className="flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4">
                <Maximize2 className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-xl font-medium text-gray-900 mb-2">
                Henüz banner eklenmemiş
              </h3>
              <p className="text-gray-600">
                İlk bannerınızı eklemek için yukarıdaki alana tıklayın
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {banners.map((banner) => (
                <div
                  key={banner.id}
                  className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow"
                >
                  <div className="flex flex-col">
                    <div className="flex flex-col lg:flex-row">
                      {/* Banner Image - Thin/Wide format */}
                      <div className="relative w-full lg:w-80 h-32 bg-gray-100 flex-shrink-0">
                        <Image
                          src={banner.imageUrl}
                          alt="Thin Banner"
                          fill
                          className="object-cover"
                        />
                      </div>

                      {/* Banner Info */}
                      <div className="flex-1 p-4 flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-3">
                            <Maximize2 className="w-5 h-5 text-orange-600" />
                            <h3 className="text-lg font-medium text-gray-900">
                              İnce Banner
                            </h3>
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                              <CheckCircle className="w-3 h-3" />
                              Aktif
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-2">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              <span>{formatDate(banner.createdAt)}</span>
                            </div>
                          </div>

                          {/* Link info */}
                          {banner.linkType && banner.linkId ? (
                            <div className="flex items-center gap-2">
                              <ExternalLink className="w-4 h-4 text-blue-600" />
                              <span className="text-sm text-gray-600 mr-2">
                                Bağlantı:
                              </span>
                              {getTypeBadge(banner.linkType)}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-gray-500">
                              <AlertCircle className="w-4 h-4" />
                              <span className="text-sm">
                                Bağlantı eklenmemiş
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 ml-4">
                          <button
                            onClick={() => setEditingBanner(banner.id)}
                            className="flex items-center justify-center w-9 h-9 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-lg transition-colors"
                            title="Bağlantı ekle/düzenle"
                          >
                            <Link className="w-4 h-4" />
                          </button>
                          {banner.linkType && (
                            <button
                              onClick={() => removeBannerLink(banner.id)}
                              className="flex items-center justify-center w-9 h-9 bg-orange-100 hover:bg-orange-200 text-orange-600 rounded-lg transition-colors"
                              title="Bağlantıyı kaldır"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => deleteBanner(banner.id)}
                            className="flex items-center justify-center w-9 h-9 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg transition-colors"
                            title="Banner'ı sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Link Editor */}
                    {editingBanner === banner.id && (
                      <div className="border-t border-gray-200 p-4 bg-gray-50">
                        <div className="space-y-4">
                          <h4 className="text-lg font-medium text-gray-900">
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
                              className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                          </div>

                          {/* Search Results */}
                          {searchLoading && (
                            <div className="flex items-center justify-center py-4">
                              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                              <span className="ml-2 text-gray-600">
                                Aranıyor...
                              </span>
                            </div>
                          )}

                          {searchResults.length > 0 && (
                            <div className="max-h-48 overflow-y-auto space-y-2 border border-gray-200 rounded-lg bg-white">
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
                                  className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors text-left border-b border-gray-100 last:border-b-0"
                                >
                                  <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-lg">
                                    {getTypeIcon(result.type)}
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-gray-900 font-medium">
                                      {result.title}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1">
                                      {getTypeBadge(result.type)}
                                      <span className="text-gray-500 text-sm">
                                        {result.subtitle}
                                      </span>
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}

                          {searchQuery &&
                            !searchLoading &&
                            searchResults.length === 0 && (
                              <div className="text-center py-4 text-gray-500">
                                <AlertCircle className="w-6 h-6 mx-auto mb-2" />
                                <p>Aramanızla eşleşen sonuç bulunamadı</p>
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
        </div>

        {/* Upload Overlay */}
        {uploading && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-8 text-center shadow-xl">
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
