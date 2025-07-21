"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
  deleteDoc,
  addDoc,
  Timestamp,
  getDoc,
  writeBatch,
  WriteBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import ProtectedRoute from "../../components/ProtectedRoute";
import {
  ArrowLeft,
  Package,
  User,
  Calendar,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  MapPin,
  Phone,
  CreditCard,
  Edit2,
  X,
  MessageSquare,
} from "lucide-react";

interface ProductAttributes {
  [key: string]: string | number | boolean | string[] | number[];
}

interface OriginalProductData {
  productName?: string;
  description?: string;
  price?: number;
  condition?: string;
  brandModel?: string;
  imageUrls?: string[];
  category?: string;
  subcategory?: string;
  subsubcategory?: string;
  quantity?: number;
  deliveryOption?: string;
  videoUrl?: string;
  colorImages?: Record<string, string[]>;
  colorQuantities?: Record<string, number>;
  attributes?: ProductAttributes;
  userId?: string;
  shopId?: string;
  createdAt?: Timestamp;
  modifiedAt?: Timestamp;
}

interface EditApplication {
  id: string;
  originalProductId: string;
  editType: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: Timestamp;
  userId: string;
  shopId?: string;
  productName: string;
  description: string;
  price: number;
  condition: string;
  brandModel: string;
  imageUrls: string[];
  category: string;
  subcategory: string;
  subsubcategory: string;
  quantity: number;
  deliveryOption: string;
  videoUrl?: string;
  colorImages: Record<string, string[]>;
  colorQuantities: Record<string, number>;
  attributes: ProductAttributes;
  originalProductData: OriginalProductData;
  phone: string;
  region: string;
  address: string;
  ibanOwnerName: string;
  ibanOwnerSurname: string;
  iban: string;
}

interface ShopMember {
  userId: string;
  role: "owner" | "coOwner" | "editor" | "viewer";
}

interface RejectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  productName: string;
  isLoading: boolean;
}

type ComparisonValue =
  | string
  | number
  | boolean
  | string[]
  | number[]
  | undefined
  | null;

interface NotificationData {
  type: string;
  productId: string;
  productName: string;
  timestamp: Timestamp;
  isRead: boolean;
  message_tr: string;
  message_en: string;
  message_ru: string;
  rejectionReason?: string | null;
  shopId?: string;
  recipientRole?: string;
}

interface FirebaseError extends Error {
  code: string;
}

const isFirebaseError = (error: unknown): error is FirebaseError => {
  return error instanceof Error && "code" in error;
};

// Rejection Modal Component
const RejectionModal: React.FC<RejectionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  productName,
  isLoading,
}) => {
  const [reason, setReason] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim()) {
      onConfirm(reason.trim());
    }
  };

  const handleClose = () => {
    setReason("");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-white/20 rounded-xl max-w-md w-full">
        <div className="flex items-center justify-between p-4 border-b border-white/20">
          <h3 className="text-lg font-bold text-white">Reddetme Nedeni</h3>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4">
          <p className="text-sm text-gray-300 mb-4">
            <strong>{productName}</strong> ürünü için düzenleme başvurusunu
            neden reddediyorsunuz?
          </p>

          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reddetme nedeninizi buraya yazın..."
            className="w-full h-32 px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-red-500"
            disabled={isLoading}
            required
          />

          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isLoading || !reason.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 text-white rounded-lg transition-colors"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Reddediliyor...
                </>
              ) : (
                <>
                  <MessageSquare className="w-4 h-4" />
                  Reddet
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default function EditProductApplicationsPage() {
  const router = useRouter();
  const [applications, setApplications] = useState<EditApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApplication, setSelectedApplication] =
    useState<EditApplication | null>(null);
  const [processing, setProcessing] = useState(false);
  const [rejectionModal, setRejectionModal] = useState({
    isOpen: false,
    application: null as EditApplication | null,
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(
        collection(db, "product_edit_applications"),
        orderBy("submittedAt", "desc")
      ),
      (snapshot) => {
        const apps = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as EditApplication[];
        setApplications(apps);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching applications:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Get shop members for notification purposes
  const getShopMembers = async (shopId: string): Promise<ShopMember[]> => {
    try {
      const shopDoc = await getDoc(doc(db, "shops", shopId));
      if (!shopDoc.exists()) {
        console.warn(`Shop ${shopId} not found`);
        return [];
      }

      const shopData = shopDoc.data();
      const members: ShopMember[] = [];

      // Add owner
      if (shopData.ownerId) {
        members.push({ userId: shopData.ownerId, role: "owner" });
      }

      // Add co-owners
      if (shopData.coOwners && Array.isArray(shopData.coOwners)) {
        shopData.coOwners.forEach((userId: string) => {
          members.push({ userId, role: "coOwner" });
        });
      }

      // Add editors
      if (shopData.editors && Array.isArray(shopData.editors)) {
        shopData.editors.forEach((userId: string) => {
          members.push({ userId, role: "editor" });
        });
      }

      // Add viewers
      if (shopData.viewers && Array.isArray(shopData.viewers)) {
        shopData.viewers.forEach((userId: string) => {
          members.push({ userId, role: "viewer" });
        });
      }

      return members;
    } catch (error) {
      console.error("Error fetching shop members:", error);
      return [];
    }
  };

  // Send notification to a single user
  const sendUserNotification = async (
    userId: string,
    notificationData: NotificationData,
    batch?: WriteBatch
  ) => {
    try {
      const userNotificationRef = doc(
        collection(db, "users", userId, "notifications")
      );

      if (batch) {
        batch.set(userNotificationRef, notificationData);
      } else {
        await addDoc(
          collection(db, "users", userId, "notifications"),
          notificationData
        );
      }
    } catch (error) {
      console.error(`Error sending notification to user ${userId}:`, error);
    }
  };

  // Send notifications based on product type (shop vs individual)
  const sendNotifications = async (
    application: EditApplication,
    type: "approved" | "rejected",
    rejectionReason?: string
  ) => {
    const baseNotificationData = {
      type: `product_edit_${type}`,
      productId: application.originalProductId,
      productName: application.productName,
      timestamp: Timestamp.now(),
      isRead: false,
      ...(type === "approved"
        ? {
            message_tr: "✅ Ürün düzenleme başvurunuz onaylandı! 🎉",
            message_en:
              "✅ Your product edit application has been approved! 🎉",
            message_ru: "✅ Ваша заявка на редактирование товара одобрена! 🎉",
          }
        : {
            message_tr: rejectionReason
              ? `❌ Ürün düzenleme başvurunuz reddedildi.`
              : "❌ Ürün düzenleme başvurunuz reddedildi",
            message_en: rejectionReason
              ? `❌ Your product edit application has been rejected.`
              : "❌ Your product edit application has been rejected",
            message_ru: rejectionReason
              ? `❌ Ваша заявка на редактирование товара отклонена.`
              : "❌ Ваша заявка на редактирование товара отклонена",
            rejectionReason: rejectionReason || null,
          }),
    };

    // Check if this is a shop product or individual user product
    const isShopProduct =
      application.shopId || application.originalProductData?.shopId;

    if (isShopProduct) {
      // Send notification to all shop members
      console.log(
        `Sending notifications to shop members for shop: ${isShopProduct}`
      );

      try {
        const shopMembers = await getShopMembers(isShopProduct);

        if (shopMembers.length === 0) {
          console.warn(
            `No members found for shop ${isShopProduct}, falling back to application submitter`
          );
          await sendUserNotification(application.userId, baseNotificationData);
          return;
        }

        // Use batch write for better performance and atomicity
        const batch = writeBatch(db);

        for (const member of shopMembers) {
          const userNotificationRef = doc(
            collection(db, "users", member.userId, "notifications")
          );

          const memberNotificationData: NotificationData = {
            ...baseNotificationData,
            shopId: isShopProduct,
            recipientRole: member.role,
          };

          batch.set(userNotificationRef, memberNotificationData);
        }

        await batch.commit();
        console.log(
          `Successfully sent notifications to ${shopMembers.length} shop members`
        );
      } catch (error) {
        console.error("Error sending shop notifications:", error);
        // Fallback: send to original submitter
        await sendUserNotification(application.userId, baseNotificationData);
      }
    } else {
      // Send notification only to the individual user who submitted the application
      console.log(
        `Sending notification to individual user: ${application.userId}`
      );
      await sendUserNotification(application.userId, baseNotificationData);
    }
  };

  const handleApprove = async (application: EditApplication) => {
    setProcessing(true);
    try {
      console.log("Approving application:", application.id);
      console.log("Original product ID:", application.originalProductId);
      console.log(
        "Shop ID:",
        application.shopId || application.originalProductData?.shopId || "None"
      );

      // Determine the correct collection based on shopId
      const isShopProduct =
        application.shopId || application.originalProductData?.shopId;
      const collection_name = isShopProduct ? "shop_products" : "products";

      console.log(`Using collection: ${collection_name}`);

      // Check if the original product exists
      const productRef = doc(
        db,
        collection_name,
        application.originalProductId
      );
      const productSnapshot = await getDoc(productRef);

      if (!productSnapshot.exists()) {
        console.error(
          `Original product not found in ${collection_name}:`,
          application.originalProductId
        );
        alert(
          `Hata: Orijinal ürün bulunamadı (ID: ${application.originalProductId}, Collection: ${collection_name}). Bu ürün silinmiş olabilir.`
        );
        return;
      }

      console.log("Original product found, proceeding with update...");

      // Update the original product with the new data
      const updateData: Partial<OriginalProductData> = {
        productName: application.productName,
        description: application.description,
        price: application.price,
        condition: application.condition,
        brandModel: application.brandModel,
        imageUrls: application.imageUrls,
        category: application.category,
        subcategory: application.subcategory,
        subsubcategory: application.subsubcategory,
        quantity: application.quantity,
        deliveryOption: application.deliveryOption,
        colorImages: application.colorImages,
        colorQuantities: application.colorQuantities,
        attributes: application.attributes,
        modifiedAt: Timestamp.now(),
      };

      if (application.videoUrl) {
        updateData.videoUrl = application.videoUrl;
      }

      await updateDoc(productRef, updateData);
      console.log("Product updated successfully");

      // Delete the edit application
      await deleteDoc(doc(db, "product_edit_applications", application.id));
      console.log("Edit application deleted");

      // Send notifications based on product type
      await sendNotifications(application, "approved");
      console.log("Notifications sent successfully");

      setSelectedApplication(null);
      alert("Başvuru başarıyla onaylandı!");
    } catch (error) {
      console.error("Error approving application:", error);

      // More specific error handling
      if (isFirebaseError(error)) {
        if (error.code === "not-found") {
          alert(
            "Hata: Güncellenecek ürün bulunamadı. Ürün ID'sini kontrol edin."
          );
        } else if (error.code === "permission-denied") {
          alert("Hata: Bu işlem için yetkiniz yok.");
        } else {
          alert(`Onaylama sırasında hata oluştu: ${error.message}`);
        }
      } else {
        alert("Onaylama sırasında bilinmeyen bir hata oluştu.");
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (application: EditApplication) => {
    setRejectionModal({
      isOpen: true,
      application: application,
    });
  };

  const handleRejectConfirm = async (rejectionReason: string) => {
    const application = rejectionModal.application;
    if (!application) return;

    setProcessing(true);
    try {
      console.log("Rejecting application:", application.id);
      console.log("Rejection reason:", rejectionReason);
      console.log(
        "Shop ID:",
        application.shopId || application.originalProductData?.shopId || "None"
      );

      // Delete the edit application
      await deleteDoc(doc(db, "product_edit_applications", application.id));
      console.log("Edit application deleted");

      // Send notifications with rejection reason
      await sendNotifications(application, "rejected", rejectionReason);
      console.log("Rejection notifications sent successfully");

      // Close modal and clear selection
      setRejectionModal({ isOpen: false, application: null });
      setSelectedApplication(null);
      alert("Başvuru başarıyla reddedildi!");
    } catch (error) {
      console.error("Error rejecting application:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Bilinmeyen hata";
      alert(`Reddetme sırasında hata oluştu: ${errorMessage}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectCancel = () => {
    setRejectionModal({ isOpen: false, application: null });
  };

  const formatValue = (value: ComparisonValue): string => {
    if (value === null || value === undefined) return "Belirtilmemiş";
    if (typeof value === "boolean") return value ? "Evet" : "Hayır";
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  const CompactComparisonField = ({
    label,
    oldValue,
    newValue,
  }: {
    label: string;
    oldValue: ComparisonValue;
    newValue: ComparisonValue;
  }) => {
    const hasChanged = JSON.stringify(oldValue) !== JSON.stringify(newValue);

    if (!hasChanged) return null;

    return (
      <div className="grid grid-cols-3 gap-2 py-2 border-b border-white/10">
        <div className="text-xs font-medium text-white">{label}</div>
        <div className="text-xs text-red-300 bg-red-500/10 rounded px-2 py-1">
          {formatValue(oldValue)}
        </div>
        <div className="text-xs text-green-300 bg-green-500/10 rounded px-2 py-1">
          {formatValue(newValue)}
        </div>
      </div>
    );
  };

  const ImageComparison = ({
    label,
    oldImages,
    newImages,
  }: {
    label: string;
    oldImages: string[];
    newImages: string[];
  }) => {
    const hasChanged = JSON.stringify(oldImages) !== JSON.stringify(newImages);

    if (!hasChanged) return null;

    return (
      <div className="mb-4">
        <h4 className="text-sm font-medium text-white mb-2">{label}</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-400 mb-1">Eski:</p>
            <div className="flex gap-1 flex-wrap">
              {oldImages.map((url, index) => (
                <img
                  key={index}
                  src={url}
                  alt={`Eski ${index + 1}`}
                  className="w-12 h-12 object-cover rounded"
                />
              ))}
              {oldImages.length === 0 && (
                <span className="text-xs text-gray-500">Resim yok</span>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Yeni:</p>
            <div className="flex gap-1 flex-wrap">
              {newImages.map((url, index) => (
                <img
                  key={index}
                  src={url}
                  alt={`Yeni ${index + 1}`}
                  className="w-12 h-12 object-cover rounded border border-green-400"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
          <div className="text-white text-center">
            <div className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full mx-auto mb-4"></div>
            <p>Başvurular yükleniyor...</p>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        {/* Header */}
        <header className="backdrop-blur-xl bg-white/10 border-b border-white/20 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between py-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.back()}
                  className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Geri
                </button>
                <div>
                  <h1 className="text-xl font-bold text-white">
                    Ürün Düzenleme Başvuruları
                  </h1>
                  <p className="text-sm text-gray-300">
                    {applications.length} başvuru
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {applications.length === 0 ? (
            <div className="text-center py-12">
              <Edit2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">
                Ürün Güncelleme Yok
              </h2>
              <p className="text-gray-300">
                Henüz hiç ürün düzenleme başvurusu yapılmamış.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {applications.map((app) => (
                <div
                  key={app.id}
                  className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4 cursor-pointer hover:bg-white/20 transition-colors"
                  onClick={() => setSelectedApplication(app)}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex items-center justify-center w-10 h-10 bg-blue-500/20 rounded-lg">
                      <Package className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-semibold truncate">
                        {app.productName}
                      </h3>
                      <p className="text-gray-400 text-xs">
                        ID: {app.id.substring(0, 8)}...
                        {(app.shopId || app.originalProductData?.shopId) && (
                          <span className="ml-2 px-1 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs">
                            SHOP
                          </span>
                        )}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        app.status === "pending"
                          ? "bg-yellow-500/20 text-yellow-400"
                          : app.status === "approved"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {app.status === "pending"
                        ? "Beklemede"
                        : app.status === "approved"
                        ? "Onaylandı"
                        : "Reddedildi"}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-gray-300">
                    <div className="flex items-center gap-2">
                      <User className="w-3 h-3" />
                      <span>{app.userId.substring(0, 8)}...</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3 h-3" />
                      <span>
                        {app.submittedAt
                          ?.toDate?.()
                          ?.toLocaleDateString("tr-TR")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-3 h-3" />
                      <span>₺{app.price}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Main Modal */}
        {selectedApplication && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-white/20 rounded-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b border-white/20">
                <div>
                  <h2 className="text-xl font-bold text-white">
                    {selectedApplication.productName}
                  </h2>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-gray-300">
                      ID: {selectedApplication.originalProductId}
                    </p>
                    {(selectedApplication.shopId ||
                      selectedApplication.originalProductData?.shopId) && (
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">
                        SHOP PRODUCT
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {selectedApplication.status === "pending" && (
                    <>
                      <button
                        onClick={() => handleApprove(selectedApplication)}
                        disabled={processing}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-600/50 text-white rounded-lg transition-colors text-sm"
                      >
                        <CheckCircle className="w-4 h-4" />
                        {processing ? "Onaylanıyor..." : "Onayla"}
                      </button>
                      <button
                        onClick={() => handleReject(selectedApplication)}
                        disabled={processing}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 text-white rounded-lg transition-colors text-sm"
                      >
                        <XCircle className="w-4 h-4" />
                        {processing ? "Reddediliyor..." : "Reddet"}
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setSelectedApplication(null)}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>

              {/* Modal Content - keeping existing content structure */}
              <div className="p-4 overflow-y-auto max-h-[calc(90vh-80px)]">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left Column - Changes */}
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4">
                      Değişiklikler
                    </h3>
                    <div className="space-y-1">
                      <div className="grid grid-cols-3 gap-2 py-2 border-b border-white/20 text-xs font-medium text-gray-400">
                        <div>Alan</div>
                        <div>Eski</div>
                        <div>Yeni</div>
                      </div>

                      <CompactComparisonField
                        label="Ürün Adı"
                        oldValue={
                          selectedApplication.originalProductData?.productName
                        }
                        newValue={selectedApplication.productName}
                      />
                      <CompactComparisonField
                        label="Fiyat"
                        oldValue={
                          selectedApplication.originalProductData?.price
                        }
                        newValue={selectedApplication.price}
                      />
                      <CompactComparisonField
                        label="Miktar"
                        oldValue={
                          selectedApplication.originalProductData?.quantity
                        }
                        newValue={selectedApplication.quantity}
                      />
                      <CompactComparisonField
                        label="Durum"
                        oldValue={
                          selectedApplication.originalProductData?.condition
                        }
                        newValue={selectedApplication.condition}
                      />
                      <CompactComparisonField
                        label="Marka"
                        oldValue={
                          selectedApplication.originalProductData?.brandModel
                        }
                        newValue={selectedApplication.brandModel}
                      />
                      <CompactComparisonField
                        label="Kategori"
                        oldValue={
                          selectedApplication.originalProductData?.category
                        }
                        newValue={selectedApplication.category}
                      />
                      <CompactComparisonField
                        label="Teslimat"
                        oldValue={
                          selectedApplication.originalProductData
                            ?.deliveryOption
                        }
                        newValue={selectedApplication.deliveryOption}
                      />

                      {/* Description */}
                      {selectedApplication.originalProductData?.description !==
                        selectedApplication.description && (
                        <div className="py-2 border-b border-white/10">
                          <div className="text-xs font-medium text-white mb-2">
                            Açıklama
                          </div>
                          <div className="grid grid-cols-1 gap-2">
                            <div className="text-xs text-red-300 bg-red-500/10 rounded px-2 py-1 max-h-20 overflow-y-auto">
                              {formatValue(
                                selectedApplication.originalProductData
                                  ?.description
                              )}
                            </div>
                            <div className="text-xs text-green-300 bg-green-500/10 rounded px-2 py-1 max-h-20 overflow-y-auto">
                              {formatValue(selectedApplication.description)}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Dynamic Attributes */}
                      {Object.keys({
                        ...selectedApplication.originalProductData?.attributes,
                        ...selectedApplication.attributes,
                      }).map((key) => (
                        <CompactComparisonField
                          key={key}
                          label={key}
                          oldValue={
                            selectedApplication.originalProductData
                              ?.attributes?.[key]
                          }
                          newValue={selectedApplication.attributes?.[key]}
                        />
                      ))}
                    </div>

                    {/* Images */}
                    <div className="mt-6">
                      <ImageComparison
                        label="Ürün Resimleri"
                        oldImages={
                          selectedApplication.originalProductData?.imageUrls ||
                          []
                        }
                        newImages={selectedApplication.imageUrls}
                      />

                      {/* Color Images */}
                      {Object.keys({
                        ...selectedApplication.originalProductData?.colorImages,
                        ...selectedApplication.colorImages,
                      }).map((color) => (
                        <ImageComparison
                          key={color}
                          label={`${color} Resimleri`}
                          oldImages={
                            selectedApplication.originalProductData
                              ?.colorImages?.[color] || []
                          }
                          newImages={
                            selectedApplication.colorImages?.[color] || []
                          }
                        />
                      ))}

                      {/* Video */}
                      {(selectedApplication.originalProductData?.videoUrl ||
                        selectedApplication.videoUrl) &&
                        selectedApplication.originalProductData?.videoUrl !==
                          selectedApplication.videoUrl && (
                          <div className="mb-4">
                            <h4 className="text-sm font-medium text-white mb-2">
                              Video
                            </h4>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-xs text-gray-400 mb-1">
                                  Eski:
                                </p>
                                {selectedApplication.originalProductData
                                  ?.videoUrl ? (
                                  <video
                                    src={
                                      selectedApplication.originalProductData
                                        .videoUrl
                                    }
                                    controls
                                    className="w-full h-20 rounded"
                                  />
                                ) : (
                                  <span className="text-xs text-gray-500">
                                    Video yok
                                  </span>
                                )}
                              </div>
                              <div>
                                <p className="text-xs text-gray-400 mb-1">
                                  Yeni:
                                </p>
                                {selectedApplication.videoUrl ? (
                                  <video
                                    src={selectedApplication.videoUrl}
                                    controls
                                    className="w-full h-20 rounded border border-green-400"
                                  />
                                ) : (
                                  <span className="text-xs text-gray-500">
                                    Video yok
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                    </div>
                  </div>

                  {/* Right Column - User & Product Info */}
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4">
                      Başvuru Bilgileri
                    </h3>

                    {/* Application Info */}
                    <div className="bg-white/5 border border-white/10 rounded-lg p-3 mb-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center gap-2 text-gray-300">
                          <User className="w-4 h-4" />
                          <span>Kullanıcı: {selectedApplication.userId}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-300">
                          <Calendar className="w-4 h-4" />
                          <span>
                            Tarih:{" "}
                            {selectedApplication.submittedAt
                              ?.toDate?.()
                              ?.toLocaleDateString("tr-TR")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-300">
                          <Clock className="w-4 h-4" />
                          <span>
                            Durum:{" "}
                            {selectedApplication.status === "pending"
                              ? "Beklemede"
                              : selectedApplication.status === "approved"
                              ? "Onaylandı"
                              : "Reddedildi"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-300">
                          <Package className="w-4 h-4" />
                          <span>
                            Orijinal ID: {selectedApplication.originalProductId}
                          </span>
                        </div>
                        {(selectedApplication.shopId ||
                          selectedApplication.originalProductData?.shopId) && (
                          <div className="col-span-2 flex items-center gap-2 text-blue-300">
                            <Package className="w-4 h-4" />
                            <span>
                              Shop ID:{" "}
                              {selectedApplication.shopId ||
                                selectedApplication.originalProductData?.shopId}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Seller Info */}
                    <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                      <h4 className="text-sm font-semibold text-white mb-3">
                        Satıcı Bilgileri
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2 text-gray-300">
                          <Phone className="w-4 h-4" />
                          <span>{selectedApplication.phone}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-300">
                          <MapPin className="w-4 h-4" />
                          <span>{selectedApplication.region}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-300">
                          <CreditCard className="w-4 h-4" />
                          <span>
                            {selectedApplication.ibanOwnerName}{" "}
                            {selectedApplication.ibanOwnerSurname}
                          </span>
                        </div>
                        <div className="text-gray-300">
                          <strong>Adres:</strong> {selectedApplication.address}
                        </div>
                        <div className="text-gray-300">
                          <strong>IBAN:</strong> {selectedApplication.iban}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Rejection Modal */}
        <RejectionModal
          isOpen={rejectionModal.isOpen}
          onClose={handleRejectCancel}
          onConfirm={handleRejectConfirm}
          productName={rejectionModal.application?.productName || ""}
          isLoading={processing}
        />
      </div>
    </ProtectedRoute>
  );
}
