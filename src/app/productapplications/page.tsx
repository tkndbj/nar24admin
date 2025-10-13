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
  arrayRemove,
  getDoc,
  writeBatch,
  arrayUnion,
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
import { Product, ProductUtils } from "../../models/Product";

// Extended interface for product applications (includes fields not in final Product)
interface ProductApplication extends Omit<Product, "id" | "createdAt"> {
  id: string;
  ilan_no: string;
  createdAt: Timestamp;
  phone?: string;
  region?: string;
  address?: string;
  ibanOwnerName?: string;
  ibanOwnerSurname?: string;
  iban?: string;
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
        const applicationsData = snapshot.docs.map((doc) => {
          const data = doc.data();

          return {
            id: doc.id,
            productName: ProductUtils.safeString(data.productName),
            description: ProductUtils.safeString(data.description),
            price: ProductUtils.safeDouble(data.price),
            currency: ProductUtils.safeString(data.currency, "TL"),
            condition: ProductUtils.safeString(data.condition, "Brand New"),
            brandModel: ProductUtils.safeStringNullable(data.brandModel),
            imageUrls: ProductUtils.safeStringArray(data.imageUrls),
            averageRating: ProductUtils.safeDouble(data.averageRating),
            reviewCount: ProductUtils.safeInt(data.reviewCount),
            gender: ProductUtils.safeStringNullable(data.gender),
            bundleIds: ProductUtils.safeStringArray(data.bundleIds),
            bundlePrice:
              data.bundlePrice != null
                ? ProductUtils.safeDouble(data.bundlePrice)
                : undefined,
            originalPrice:
              data.originalPrice != null
                ? ProductUtils.safeDouble(data.originalPrice)
                : undefined,
            discountPercentage:
              data.discountPercentage != null
                ? ProductUtils.safeInt(data.discountPercentage)
                : undefined,
            colorQuantities: ProductUtils.safeColorQuantities(
              data.colorQuantities
            ),
            boostClickCountAtStart: ProductUtils.safeInt(
              data.boostClickCountAtStart
            ),
            availableColors: ProductUtils.safeStringArray(data.availableColors),
            userId: ProductUtils.safeString(data.userId),
            discountThreshold:
              data.discountThreshold != null
                ? ProductUtils.safeInt(data.discountThreshold)
                : undefined,
            rankingScore: ProductUtils.safeDouble(data.rankingScore),
            promotionScore: ProductUtils.safeDouble(data.promotionScore),
            ownerId: ProductUtils.safeString(data.ownerId),
            shopId: ProductUtils.safeStringNullable(data.shopId),
            ilan_no: ProductUtils.safeString(
              data.ilan_no ?? data.ilanNo ?? doc.id
            ),
            ilanNo: ProductUtils.safeString(
              data.ilan_no ?? data.ilanNo ?? doc.id
            ),
            searchIndex: ProductUtils.safeStringArray(data.searchIndex),
            createdAt: data.createdAt as Timestamp,
            sellerName: ProductUtils.safeString(data.sellerName, "Unknown"),
            category: ProductUtils.safeString(data.category, "Uncategorized"),
            subcategory: ProductUtils.safeString(data.subcategory),
            subsubcategory: ProductUtils.safeString(data.subsubcategory),
            quantity: ProductUtils.safeInt(data.quantity),
            bestSellerRank:
              data.bestSellerRank != null
                ? ProductUtils.safeInt(data.bestSellerRank)
                : undefined,
            sold: Boolean(data.sold),
            clickCount: ProductUtils.safeInt(data.clickCount),
            clickCountAtStart: ProductUtils.safeInt(data.clickCountAtStart),
            favoritesCount: ProductUtils.safeInt(data.favoritesCount),
            cartCount: ProductUtils.safeInt(data.cartCount),
            purchaseCount: ProductUtils.safeInt(data.purchaseCount),
            deliveryOption: ProductUtils.safeString(
              data.deliveryOption,
              "Self Delivery"
            ),
            boostedImpressionCount: ProductUtils.safeInt(
              data.boostedImpressionCount
            ),
            boostImpressionCountAtStart: ProductUtils.safeInt(
              data.boostImpressionCountAtStart
            ),
            isFeatured: Boolean(data.isFeatured),
            isTrending: Boolean(data.isTrending),
            isBoosted: Boolean(data.isBoosted),
            boostStartTime: ProductUtils.safeDateNullable(data.boostStartTime),
            boostEndTime: ProductUtils.safeDateNullable(data.boostEndTime),
            dailyClickCount: ProductUtils.safeInt(data.dailyClickCount),
            lastClickDate: ProductUtils.safeDateNullable(data.lastClickDate),
            paused: Boolean(data.paused),
            colorImages: ProductUtils.safeColorImages(data.colorImages),
            videoUrl: ProductUtils.safeStringNullable(data.videoUrl),
            attributes: ProductUtils.safeAttributes(data.attributes),

            // Application-specific fields
            phone: ProductUtils.safeStringNullable(data.phone),
            region: ProductUtils.safeStringNullable(data.region),
            address: ProductUtils.safeStringNullable(data.address),
            ibanOwnerName: ProductUtils.safeStringNullable(data.ibanOwnerName),
            ibanOwnerSurname: ProductUtils.safeStringNullable(
              data.ibanOwnerSurname
            ),
            iban: ProductUtils.safeStringNullable(data.iban),
            needsSync: Boolean(data.needsSync),
            updatedAt: data.updatedAt as Timestamp | undefined,
            relatedProductIds: ProductUtils.safeStringArray(
              data.relatedProductIds
            ),
          } as ProductApplication;
        }) as ProductApplication[];

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

  async function updateCategoryShopsIndex(
    shopId: string | null | undefined,
    category: string,
    subcategory: string,
    subsubcategory: string,
    operation: "add" | "remove"
  ) {
    // Early return if no shopId (individual products don't need this)
    if (!shopId || shopId.trim() === "") return;

    try {
      const shopDoc = await getDoc(doc(db, "shops", shopId));
      if (!shopDoc.exists()) {
        console.warn(`Shop ${shopId} not found, skipping category index`);
        return;
      }

      const shopData = shopDoc.data();
      const shopInfo = {
        shopId: shopId,
        shopName: shopData.name || "Unknown Shop",
      };

      // Normalize category strings
      const normalize = (s: string) => {
        if (!s || s.trim() === "") return "";
        return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
      };

      const categories = [
        { key: normalize(subsubcategory), level: "subsubcategory" },
        { key: normalize(subcategory), level: "subcategory" },
        { key: normalize(category), level: "category" },
      ].filter((cat) => cat.key !== "");

      // Use batch for atomic operations
      const batch = writeBatch(db);

      for (const { key, level } of categories) {
        const docRef = doc(db, "category_shops", key);

        if (operation === "add") {
          batch.set(
            docRef,
            {
              shops: arrayUnion(shopInfo),
              level: level,
              categoryPath: key,
              lastUpdated: Timestamp.now(),
            },
            { merge: true }
          );
        } else {
          batch.set(
            docRef,
            {
              shops: arrayRemove(shopInfo),
              lastUpdated: Timestamp.now(),
            },
            { merge: true }
          );
        }
      }

      await batch.commit();
      console.log(`✅ Category index updated for shop ${shopId}`);
    } catch (error) {
      console.error("Error updating category shops index:", error);
      // Don't throw - we don't want to fail the entire approval if indexing fails
    }
  }

  const approveApplication = async (application: ProductApplication) => {
    if (processingIds.has(application.id)) return;
    setProcessingIds((prev) => new Set(prev).add(application.id));

    try {
      const {
        id,
        ilan_no,
        createdAt: applicationCreatedAt,
        phone,
        region,
        address,
        ibanOwnerName,
        ibanOwnerSurname,
        iban,
        ...productData
      } = application;

      void applicationCreatedAt;
      void phone;
      void region;
      void address;
      void ibanOwnerName;
      void ibanOwnerSurname;
      void iban;

      const newDocId = ilan_no && ilan_no.trim() !== "" ? ilan_no : id;

      const payload = {
        ...productData,
        id: newDocId,
        ilanNo: newDocId,
        createdAt: Timestamp.now(),
        needsSync: true,
        updatedAt: Timestamp.now(),
        relatedProductIds: [],
      };

      // Remove undefined values
      Object.keys(payload).forEach((key) => {
        if (payload[key as keyof typeof payload] === undefined) {
          delete payload[key as keyof typeof payload];
        }
      });

      console.log("📤 Approving product with data:", {
        id: newDocId,
        shopId: payload.shopId,
        category: payload.category,
        subcategory: payload.subcategory,
        subsubcategory: payload.subsubcategory,
      });

      const isShopProduct = payload.shopId && payload.shopId.trim() !== "";
      const collectionName = isShopProduct ? "shop_products" : "products";

      // ✅ STEP 1: Add product to main collection
      await setDoc(doc(db, collectionName, newDocId), payload);

      // ✅ STEP 2: Update category_shops index (only for shop products)
      if (isShopProduct) {
        await updateCategoryShopsIndex(
          payload.shopId!,
          payload.category,
          payload.subcategory,
          payload.subsubcategory,
          "add"
        );
      }

      // ✅ STEP 3: Delete the application
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
