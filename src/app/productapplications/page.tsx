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
  User,
  Store,
  Image as ImageIcon,
  Loader2,
  CheckCircle,
  XCircle,
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
    setProcessingIds((prev) => new Set(prev).add(application.id));

    try {
      const { id, ...rest } = application;
      const newDocId =
        typeof rest.ilan_no === "string" && rest.ilan_no.trim() !== ""
          ? rest.ilan_no
          : id;

      const payload = {
        ...rest,
        needsSync: true,
        updatedAt: Timestamp.now(),
        relatedProductIds: [],
      };

      const isShopProduct = rest.shopId && rest.shopId.trim() !== "";
      const collectionName = isShopProduct ? "shop_products" : "products";

      await setDoc(doc(db, collectionName, newDocId), payload);
      await deleteDoc(doc(db, "product_applications", id));

      showNotification("Ürün başarıyla onaylandı!");
    } catch (error) {
      console.error("Onaylama hatası:", error);
      showNotification("Ürün onaylanırken hata oluştu");
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
                  <div className="flex items-center justify-center w-8 h-8 bg-blue-600 rounded-lg">
                    <Package className="w-4 h-4 text-white" />
                  </div>
                  <h1 className="text-xl font-semibold text-gray-900">
                    Ürün Başvuruları
                  </h1>
                </div>
              </div>

              <div className="bg-blue-50 px-4 py-2 rounded-lg border border-blue-200">
                <span className="text-sm text-blue-700 font-medium">
                  {loading ? "Yükleniyor..." : `${applications.length} Başvuru`}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-6 py-6">
          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3 text-gray-600">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Başvurular yükleniyor...</span>
              </div>
            </div>
          )}

          {/* No Applications */}
          {!loading && applications.length === 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-gray-100 rounded-lg mb-4">
                <Package className="w-6 h-6 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Başvuru bulunamadı
              </h3>
              <p className="text-gray-500">
                Henüz onay bekleyen ürün başvurusu bulunmamaktadır.
              </p>
            </div>
          )}

          {/* Applications Table */}
          {!loading && applications.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* Table Header */}
              <div className="bg-gray-50 border-b border-gray-200 px-6 py-3">
                <div className="grid grid-cols-12 gap-4 text-xs font-medium text-gray-700 uppercase tracking-wide">
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
                    className="px-6 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="grid grid-cols-12 gap-4 items-center">
                      {/* Image */}
                      <div className="col-span-1">
                        {application.imageUrls &&
                        application.imageUrls.length > 0 ? (
                          <div className="relative">
                            <img
                              src={application.imageUrls[0]}
                              alt="Ürün"
                              className="w-12 h-12 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => {
                                setSelectedApplication(application);
                                setSelectedImageIndex(0);
                                setShowImageModal(true);
                              }}
                            />
                            {application.imageUrls.length > 1 && (
                              <div className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium">
                                {application.imageUrls.length}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="w-12 h-12 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center">
                            <ImageIcon className="w-5 h-5 text-gray-400" />
                          </div>
                        )}
                      </div>

                      {/* Product Info */}
                      <div className="col-span-3">
                        <h3 className="font-medium text-gray-900 line-clamp-1 mb-1">
                          {application.productName}
                        </h3>
                        <p className="text-sm text-gray-600 line-clamp-2">
                          {application.description}
                        </p>
                      </div>

                      {/* Category */}
                      <div className="col-span-2">
                        <div className="text-sm text-gray-900 font-medium">
                          {application.category}
                        </div>
                        {application.subcategory && (
                          <div className="text-xs text-gray-500">
                            {application.subcategory}
                          </div>
                        )}
                      </div>

                      {/* Price */}
                      <div className="col-span-1">
                        <span className="text-sm font-semibold text-green-600">
                          {formatPrice(application.price, application.currency)}
                        </span>
                      </div>

                      {/* Type */}
                      <div className="col-span-1">
                        <div className="flex items-center gap-2">
                          {application.shopId ? (
                            <>
                              <Store className="w-4 h-4 text-blue-600" />
                              <span className="text-sm text-blue-600 font-medium">
                                Mağaza
                              </span>
                            </>
                          ) : (
                            <>
                              <User className="w-4 h-4 text-gray-600" />
                              <span className="text-sm text-gray-600 font-medium">
                                Bireysel
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Date */}
                      <div className="col-span-2">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Calendar className="w-4 h-4" />
                          <span>{formatDate(application.createdAt)}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="col-span-2">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => approveApplication(application)}
                            disabled={processingIds.has(application.id)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
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
                            className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
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
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* Image Modal */}
        {showImageModal && selectedApplication && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="relative max-w-4xl max-h-full bg-white rounded-xl overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  {selectedApplication.productName} - Görseller
                </h3>
                <button
                  onClick={() => setShowImageModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="p-6">
                <div className="mb-4">
                  <img
                    src={selectedApplication.imageUrls[selectedImageIndex]}
                    alt={`Ürün görseli ${selectedImageIndex + 1}`}
                    className="w-full max-h-96 object-contain rounded-lg border border-gray-200"
                  />
                </div>

                {selectedApplication.imageUrls.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto">
                    {selectedApplication.imageUrls.map((url, index) => (
                      <button
                        key={index}
                        onClick={() => setSelectedImageIndex(index)}
                        className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
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
