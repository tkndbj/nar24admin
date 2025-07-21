"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import { useState, useEffect } from "react";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Package,
  X,
  Calendar,
  Tag,
  DollarSign,
  User,
  Store,
  Image as ImageIcon,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";

interface ProductApplication {
  id: string;
  productName: string;
  category: string;
  subcategory?: string;
  price: number;
  currency: string;
  description: string;
  imageUrls: string[];
  shopId?: string;
  userId: string;
  ilan_no: string;
  createdAt: Timestamp;
  needsSync?: boolean;
  updatedAt?: Timestamp;
  relatedProductIds?: string[];
}

export default function ProductApplications() {
  const router = useRouter();
  const [applications, setApplications] = useState<ProductApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [selectedApplication, setSelectedApplication] =
    useState<ProductApplication | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  // Real-time listener for product applications
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "product_applications"),
      (snapshot) => {
        const applicationsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as ProductApplication[];

        // Sort by creation date (newest first)
        applicationsData.sort((a, b) => {
          if (!a.createdAt || !b.createdAt) return 0;
          return (
            b.createdAt.toDate().getTime() - a.createdAt.toDate().getTime()
          );
        });

        setApplications(applicationsData);
        setLoading(false);
      },
      (error) => {
        console.error("Başvuruları dinlerken hata:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const approveApplication = async (application: ProductApplication) => {
    if (processingIds.has(application.id)) return;
    setProcessingIds(prev => new Set(prev).add(application.id));
  
    try {
      // Copy all application fields except the client‑only `id`
      const { id, ...rest } = application;
  
      // Ensure we have a valid string ID to write under:
      //   prefer ilan_no, otherwise fall back to the original Firestore doc ID
      const newDocId = typeof rest.ilan_no === "string" && rest.ilan_no.trim() !== ""
        ? rest.ilan_no
        : id;
  
      // Build the payload
      const payload = {
        ...rest,
        needsSync: true,
        updatedAt: Timestamp.now(),
        relatedProductIds: [],
      };
  
      // Determine collection
      const isShopProduct = rest.shopId && rest.shopId.trim() !== "";
      const collectionName = isShopProduct ? "shop_products" : "products";
  
      // Write into the target collection under newDocId
      await setDoc(doc(db, collectionName, newDocId), payload);
  
      // Remove the application
      await deleteDoc(doc(db, "product_applications", id));
  
      showNotification("Ürün başarıyla onaylandı!");
    } catch (error) {
      console.error("Onaylama hatası:", error);
      showNotification("Ürün onaylanırken hata oluştu");
    } finally {
      setProcessingIds(prev => {
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
      await deleteDoc(doc(db, "product_applications", application.id));
      showNotification("Ürün başvurusu reddedildi");
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
    // You can integrate with a toast library here
    // For now, using a simple alert
    alert(message);
  };

  const formatDate = (timestamp: Timestamp) => {
    if (!timestamp) return "Tarih yok";
    try {
      return timestamp.toDate().toLocaleDateString("tr-TR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Tarih yok";
    }
  };

  const formatPrice = (price: number, currency: string) => {
    return `${price?.toLocaleString("tr-TR")} ${currency || "TL"}`;
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        {/* Header */}
        <header className="backdrop-blur-xl bg-white/10 border-b border-white/20 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.back()}
                  className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                  <span>Geri</span>
                </button>

                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-r from-orange-500 to-red-600 rounded-lg">
                    <Package className="w-5 h-5 text-white" />
                  </div>
                  <h1 className="text-xl font-bold text-white">
                    Ürün Başvuruları
                  </h1>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm text-gray-300">Toplam Başvuru</p>
                  <p className="text-lg font-bold text-white">
                    {loading ? "..." : applications.length}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3 text-white">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>Başvurular yükleniyor...</span>
              </div>
            </div>
          )}

          {/* No Applications */}
          {!loading && applications.length === 0 && (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-600/20 rounded-full mb-4">
                <Package className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">
                Başvuru bulunamadı
              </h3>
              <p className="text-gray-300">
                Henüz onay bekleyen ürün başvurusu bulunmamaktadır.
              </p>
            </div>
          )}

          {/* Applications Grid */}
          {!loading && applications.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {applications.map((application) => (
                <div
                  key={application.id}
                  className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl overflow-hidden hover:bg-white/15 transition-all duration-200"
                >
                  {/* Application Header */}
                  <div className="p-6 border-b border-white/10">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-lg font-bold text-white line-clamp-2">
                        {application.productName}
                      </h3>
                      <div className="flex items-center gap-1 text-orange-400">
                        <Clock className="w-4 h-4" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-gray-300">
                        <Tag className="w-4 h-4" />
                        <span className="text-sm">
                          {application.category}
                          {application.subcategory &&
                            ` • ${application.subcategory}`}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-green-400">
                        <DollarSign className="w-4 h-4" />
                        <span className="text-sm font-medium">
                          {formatPrice(application.price, application.currency)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-gray-300">
                        {application.shopId ? (
                          <Store className="w-4 h-4" />
                        ) : (
                          <User className="w-4 h-4" />
                        )}
                        <span className="text-sm">
                          {application.shopId
                            ? "Mağaza Ürünü"
                            : "Bireysel Ürün"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-gray-400">
                        <Calendar className="w-4 h-4" />
                        <span className="text-xs">
                          {formatDate(application.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="p-6 border-b border-white/10">
                    <p className="text-gray-300 text-sm line-clamp-3">
                      {application.description}
                    </p>
                  </div>

                  {/* Images */}
                  {application.imageUrls &&
                    application.imageUrls.length > 0 && (
                      <div className="p-6 border-b border-white/10">
                        <div className="flex items-center gap-2 mb-3">
                          <ImageIcon className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-300">
                            {application.imageUrls.length} Görsel
                          </span>
                        </div>
                        <div className="flex gap-2 overflow-x-auto">
                          {application.imageUrls
                            .slice(0, 4)
                            .map((url, index) => (
                              <div
                                key={index}
                                className="relative flex-shrink-0 w-16 h-16 bg-white/5 rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => {
                                  setSelectedApplication(application);
                                  setSelectedImageIndex(index);
                                  setShowImageModal(true);
                                }}
                              >
                                <img
                                  src={url}
                                  alt={`Ürün görseli ${index + 1}`}
                                  className="w-full h-full object-cover"
                                />
                                {index === 3 &&
                                  application.imageUrls.length > 4 && (
                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                      <span className="text-white text-xs font-medium">
                                        +{application.imageUrls.length - 4}
                                      </span>
                                    </div>
                                  )}
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                  {/* Action Buttons */}
                  <div className="p-6">
                    <div className="flex gap-3">
                      <button
                        onClick={() => approveApplication(application)}
                        disabled={processingIds.has(application.id)}
                        className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-600 text-white font-medium rounded-lg transition-all duration-200 disabled:cursor-not-allowed"
                      >
                        {processingIds.has(application.id) ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle className="w-4 h-4" />
                        )}
                        <span>Onayla</span>
                      </button>

                      <button
                        onClick={() => rejectApplication(application)}
                        disabled={processingIds.has(application.id)}
                        className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 disabled:from-gray-600 disabled:to-gray-600 text-white font-medium rounded-lg transition-all duration-200 disabled:cursor-not-allowed"
                      >
                        {processingIds.has(application.id) ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                        <span>Reddet</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Image Modal */}
        {showImageModal && selectedApplication && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="relative max-w-4xl max-h-full bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-white/20">
                <h3 className="text-lg font-semibold text-white">
                  {selectedApplication.productName} - Görseller
                </h3>
                <button
                  onClick={() => setShowImageModal(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>

              <div className="p-4">
                <div className="mb-4">
                  <img
                    src={selectedApplication.imageUrls[selectedImageIndex]}
                    alt={`Ürün görseli ${selectedImageIndex + 1}`}
                    className="w-full max-h-96 object-contain rounded-lg"
                  />
                </div>

                <div className="flex gap-2 overflow-x-auto">
                  {selectedApplication.imageUrls.map((url, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedImageIndex(index)}
                      className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                        index === selectedImageIndex
                          ? "border-blue-400"
                          : "border-white/20 hover:border-white/40"
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
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
