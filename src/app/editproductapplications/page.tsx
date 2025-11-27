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
  FileEdit,
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
  videoUrl?: string | null;
  availableColors?: string[];
  colorImages?: Record<string, string[]>;
  colorQuantities?: Record<string, number>;
  attributes?: ProductAttributes;
  userId?: string;
  shopId?: string;
  createdAt?: Timestamp;
  modifiedAt?: Timestamp;
  gender?: string | null;
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
  gender?: string | null;
  imageUrls: string[];
  category: string;
  subcategory: string;
  subsubcategory: string;
  quantity: number;
  deliveryOption: string;
  videoUrl?: string;
  availableColors: string[];
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-800">Reddetme Nedeni</h3>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="p-1.5 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5">
          <p className="text-sm text-gray-600 mb-3">
            <span className="font-medium text-gray-800">{productName}</span> ürünü için düzenleme başvurusunu neden reddediyorsunuz?
          </p>

          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reddetme nedeninizi buraya yazın..."
            className="w-full h-28 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-gray-800 placeholder-gray-400 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400"
            disabled={isLoading}
            required
          />

          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors text-sm font-medium disabled:opacity-50"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isLoading || !reason.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-md transition-colors text-sm font-medium"
            >
              {isLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Reddediliyor...
                </>
              ) : (
                <>
                  <MessageSquare className="w-3.5 h-3.5" />
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

      // CLEAN THE UPDATE DATA - Remove undefined, null values and empty arrays/objects
      const cleanUpdateData = (obj: unknown): unknown => {
        if (obj === null || obj === undefined) {
          return null;
        }

        if (Array.isArray(obj)) {
          const cleaned = obj
            .map((item) => cleanUpdateData(item))
            .filter((item) => item !== null && item !== undefined);
          return cleaned.length > 0 ? cleaned : null;
        }

        if (typeof obj === "object") {
          const cleaned: Record<string, unknown> = {};
          Object.keys(obj).forEach((key) => {
            const cleanedValue = cleanUpdateData(
              (obj as Record<string, unknown>)[key]
            );

            if (cleanedValue !== null && cleanedValue !== undefined) {
              cleaned[key] = cleanedValue;
            }
          });
          return Object.keys(cleaned).length > 0 ? cleaned : null;
        }

        return obj;
      };

      // ✅ FIX: Check if colors were completely removed
      const hasColors =
        application.availableColors &&
        application.availableColors.length > 0;

      const hasColorQuantities =
        application.colorQuantities &&
        Object.keys(application.colorQuantities).length > 0;

      const hasColorImages =
        application.colorImages &&
        Object.keys(application.colorImages).length > 0;

      console.log("Color data status:", {
        hasColors,
        hasColorQuantities,
        hasColorImages,
        availableColors: application.availableColors,
        colorQuantities: application.colorQuantities,
        colorImages: application.colorImages
      });

      // Build update data with cleaning
      const rawUpdateData: Partial<OriginalProductData> = {
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
        availableColors: hasColors && application.availableColors
        ? application.availableColors
        : [],
        colorImages: hasColors && hasColorImages ? application.colorImages : {},
        colorQuantities: hasColors && hasColorQuantities ? application.colorQuantities : {},
        attributes: application.attributes,
        gender: (() => {
          // Priority 1: Root level from application
          if (application.gender) return application.gender;

          // Priority 2: Root level from original
          if (application.originalProductData?.gender) {
            console.log("⚠️ Preserving gender from original root level");
            return application.originalProductData.gender;
          }

          // Priority 3: Attributes from original (Flutter products)
          if (application.originalProductData?.attributes?.gender &&
              typeof application.originalProductData.attributes.gender === "string") {
            console.log("⚠️ Preserving gender from original attributes");
            return application.originalProductData.attributes.gender;
          }

          return null;
        })(),
        modifiedAt: Timestamp.now(),
      };

      // ✅ FIXED: Handle videoUrl properly (set to null if removed)
      if (application.videoUrl !== undefined) {
        rawUpdateData.videoUrl = application.videoUrl || null;
      }

      // Clean the update data
      const updateData: Record<string, unknown> = {};
      Object.keys(rawUpdateData).forEach((key) => {
        const cleanedValue = cleanUpdateData(
          rawUpdateData[key as keyof typeof rawUpdateData]
        );
        if (cleanedValue !== null && cleanedValue !== undefined) {
          updateData[key] = cleanedValue;
        }
      });

      // ✅ FIX: Explicitly set colorImages and colorQuantities to empty objects if no colors
      if (!hasColors) {
        updateData.availableColors = [];
        updateData.colorImages = {};
        updateData.colorQuantities = {};
      } else {
        // ✅ ADD THIS: Ensure availableColors is explicitly set when colors exist
        if (application.availableColors && application.availableColors.length > 0) {
          updateData.availableColors = application.availableColors;
        }
      }

      // Always include modifiedAt
      updateData.modifiedAt = Timestamp.now();



      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await updateDoc(productRef, updateData as any);


      // Delete the edit application
      await updateDoc(doc(db, "product_edit_applications", application.id), {
        status: "approved",
        reviewedAt: Timestamp.now(),
      });


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
      await updateDoc(doc(db, "product_edit_applications", application.id), {
        status: "rejected",
        reviewedAt: Timestamp.now(),
        rejectionReason: rejectionReason,
      });
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
      <div className="grid grid-cols-3 gap-2 py-2 border-b border-gray-100">
        <div className="text-xs font-medium text-gray-700">{label}</div>
        <div className="text-xs text-red-700 bg-red-50 rounded px-2 py-1 truncate">
          {formatValue(oldValue)}
        </div>
        <div className="text-xs text-green-700 bg-green-50 rounded px-2 py-1 truncate">
          {formatValue(newValue)}
        </div>
      </div>
    );
  };

  const ensureArray = (value: unknown): string[] => {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") return [value];
    if (value === null || value === undefined) return [];
    return [];
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
    // Add runtime guard
    if (!Array.isArray(oldImages)) {
      console.warn("oldImages is not an array:", oldImages);
      oldImages = [];
    }
    if (!Array.isArray(newImages)) {
      console.warn("newImages is not an array:", newImages);
      newImages = [];
    }

    const hasChanged = JSON.stringify(oldImages) !== JSON.stringify(newImages);
    if (!hasChanged) return null;

    return (
      <div className="mb-4">
        <h4 className="text-xs font-medium text-gray-700 mb-2">{label}</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-red-50 rounded-md p-2">
            <p className="text-xs text-red-600 mb-1 font-medium">Eski:</p>
            <div className="flex gap-1 flex-wrap">
              {oldImages.map((url, index) => (
                <img
                  key={index}
                  src={url}
                  alt={`Eski ${index + 1}`}
                  className="w-10 h-10 object-cover rounded border border-red-200"
                />
              ))}
              {oldImages.length === 0 && (
                <span className="text-xs text-red-400">Resim yok</span>
              )}
            </div>
          </div>
          <div className="bg-green-50 rounded-md p-2">
            <p className="text-xs text-green-600 mb-1 font-medium">Yeni:</p>
            <div className="flex gap-1 flex-wrap">
              {newImages.map((url, index) => (
                <img
                  key={index}
                  src={url}
                  alt={`Yeni ${index + 1}`}
                  className="w-10 h-10 object-cover rounded border border-green-300"
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
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full mx-auto mb-3"></div>
            <p className="text-gray-600 text-sm">Başvurular yükleniyor...</p>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="flex items-center justify-between h-14">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.back()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors text-sm"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Geri
                </button>
                <div className="h-5 w-px bg-gray-200"></div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-blue-100 rounded-md">
                    <FileEdit className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <h1 className="text-sm font-semibold text-gray-900">
                      Ürün Düzenleme Başvuruları
                    </h1>
                    <p className="text-xs text-gray-500">
                      {applications.length} başvuru
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5">
          {applications.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
              <Edit2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                Ürün Güncelleme Yok
              </h2>
              <p className="text-sm text-gray-500">
                Henüz hiç ürün düzenleme başvurusu yapılmamış.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {applications.map((app) => (
                <div
                  key={app.id}
                  className="bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all"
                  onClick={() => setSelectedApplication(app)}
                >
                  <div className="flex items-start gap-2.5 mb-2.5">
                    <div className="flex items-center justify-center w-9 h-9 bg-blue-50 rounded-lg flex-shrink-0">
                      <Package className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-gray-900 truncate">
                        {app.productName}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-gray-400">
                          {app.id.substring(0, 8)}...
                        </span>
                        {(app.shopId || app.originalProductData?.shopId) && (
                          <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-medium">
                            SHOP
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-[10px] font-medium flex-shrink-0 ${
                        app.status === "pending"
                          ? "bg-amber-50 text-amber-700"
                          : app.status === "approved"
                          ? "bg-green-50 text-green-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {app.status === "pending"
                        ? "Beklemede"
                        : app.status === "approved"
                        ? "Onaylandı"
                        : "Reddedildi"}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-gray-500 pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      <span>{app.userId.substring(0, 6)}...</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>
                        {app.submittedAt
                          ?.toDate?.()
                          ?.toLocaleDateString("tr-TR")}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 ml-auto">
                      <DollarSign className="w-3 h-3" />
                      <span className="font-medium text-gray-700">₺{app.price}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Main Modal */}
        {selectedApplication && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden border border-gray-200">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Package className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">
                      {selectedApplication.productName}
                    </h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-gray-500">
                        ID: {selectedApplication.originalProductId}
                      </p>
                      {(selectedApplication.shopId ||
                        selectedApplication.originalProductData?.shopId) && (
                        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded text-[10px] font-medium">
                          SHOP PRODUCT
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedApplication.status === "pending" && (
                    <>
                      <button
                        onClick={() => handleApprove(selectedApplication)}
                        disabled={processing}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-md transition-colors text-sm font-medium"
                      >
                        <CheckCircle className="w-4 h-4" />
                        {processing ? "İşleniyor..." : "Onayla"}
                      </button>
                      <button
                        onClick={() => handleReject(selectedApplication)}
                        disabled={processing}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-md transition-colors text-sm font-medium"
                      >
                        <XCircle className="w-4 h-4" />
                        {processing ? "İşleniyor..." : "Reddet"}
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setSelectedApplication(null)}
                    className="p-1.5 hover:bg-gray-200 rounded-md transition-colors ml-1"
                  >
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-5 overflow-y-auto max-h-[calc(90vh-64px)]">
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                  {/* Left Column - Changes (3/5) */}
                  <div className="lg:col-span-3">
                    <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                      <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <Edit2 className="w-4 h-4 text-blue-600" />
                        Değişiklikler
                      </h3>
                      <div className="space-y-0">
                        <div className="grid grid-cols-3 gap-2 py-2 border-b border-gray-200 text-xs font-medium text-gray-500">
                          <div>Alan</div>
                          <div>Eski Değer</div>
                          <div>Yeni Değer</div>
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
                          label="Cinsiyet"
                          oldValue={(() => {
                            const orig = selectedApplication.originalProductData;
                            if (orig?.attributes?.gender) return orig.attributes.gender;
                            return orig?.gender;
                          })()}
                          newValue={(() => {
                            const app = selectedApplication;
                            if (app.gender) return app.gender;
                            if (app.attributes?.gender) return app.attributes.gender;
                            const orig = app.originalProductData;
                            if (orig?.gender) return orig.gender;
                            if (orig?.attributes?.gender) return orig.attributes.gender;
                            return null;
                          })()}
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
                          <div className="py-2 border-b border-gray-100">
                            <div className="text-xs font-medium text-gray-700 mb-2">
                              Açıklama
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="text-xs text-red-700 bg-red-50 rounded px-2 py-1.5 max-h-16 overflow-y-auto">
                                {formatValue(
                                  selectedApplication.originalProductData
                                    ?.description
                                )}
                              </div>
                              <div className="text-xs text-green-700 bg-green-50 rounded px-2 py-1.5 max-h-16 overflow-y-auto">
                                {formatValue(selectedApplication.description)}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Dynamic Attributes */}
                        {Object.keys({
                          ...selectedApplication.originalProductData?.attributes,
                          ...selectedApplication.attributes,
                        }).map((key) => {
                          if (key === 'gender') return null;
                          return (
                            <CompactComparisonField
                              key={key}
                              label={key}
                              oldValue={
                                selectedApplication.originalProductData
                                  ?.attributes?.[key]
                              }
                              newValue={selectedApplication.attributes?.[key]}
                            />
                          );
                        })}
                      </div>
                    </div>

                    {/* Images Section */}
                    <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 mt-4">
                      <h3 className="text-sm font-semibold text-gray-900 mb-3">Medya Değişiklikleri</h3>
                      <ImageComparison
                        label="Ürün Resimleri"
                        oldImages={ensureArray(
                          selectedApplication.originalProductData?.imageUrls
                        )}
                        newImages={ensureArray(selectedApplication.imageUrls)}
                      />

                      {/* Color Images */}
                      {Object.keys({
                        ...selectedApplication.originalProductData?.colorImages,
                        ...selectedApplication.colorImages,
                      }).map((color) => (
                        <ImageComparison
                          key={color}
                          label={`${color} Resimleri`}
                          oldImages={ensureArray(
                            selectedApplication.originalProductData
                              ?.colorImages?.[color]
                          )}
                          newImages={ensureArray(
                            selectedApplication.colorImages?.[color]
                          )}
                        />
                      ))}

                      {/* Video */}
                      {(selectedApplication.originalProductData?.videoUrl ||
                        selectedApplication.videoUrl) &&
                        selectedApplication.originalProductData?.videoUrl !==
                          selectedApplication.videoUrl && (
                          <div className="mb-3">
                            <h4 className="text-xs font-medium text-gray-700 mb-2">
                              Video
                            </h4>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="bg-red-50 rounded-md p-2">
                                <p className="text-xs text-red-600 mb-1 font-medium">
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
                                    className="w-full h-16 rounded"
                                  />
                                ) : (
                                  <span className="text-xs text-red-400">
                                    Video yok
                                  </span>
                                )}
                              </div>
                              <div className="bg-green-50 rounded-md p-2">
                                <p className="text-xs text-green-600 mb-1 font-medium">
                                  Yeni:
                                </p>
                                {selectedApplication.videoUrl ? (
                                  <video
                                    src={selectedApplication.videoUrl}
                                    controls
                                    className="w-full h-16 rounded border border-green-300"
                                  />
                                ) : (
                                  <span className="text-xs text-green-400">
                                    Video yok
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                    </div>
                  </div>

                  {/* Right Column - User & Product Info (2/5) */}
                  <div className="lg:col-span-2 space-y-4">
                    {/* Application Info */}
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                      <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-500" />
                        Başvuru Bilgileri
                      </h3>
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <User className="w-3.5 h-3.5" />
                            <span>Kullanıcı</span>
                          </div>
                          <span className="text-xs text-gray-700 font-medium">{selectedApplication.userId.substring(0, 12)}...</span>
                        </div>
                        <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>Tarih</span>
                          </div>
                          <span className="text-xs text-gray-700 font-medium">
                            {selectedApplication.submittedAt
                              ?.toDate?.()
                              ?.toLocaleDateString("tr-TR")}
                          </span>
                        </div>
                        <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Durum</span>
                          </div>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                            selectedApplication.status === "pending"
                              ? "bg-amber-50 text-amber-700"
                              : selectedApplication.status === "approved"
                              ? "bg-green-50 text-green-700"
                              : "bg-red-50 text-red-700"
                          }`}>
                            {selectedApplication.status === "pending"
                              ? "Beklemede"
                              : selectedApplication.status === "approved"
                              ? "Onaylandı"
                              : "Reddedildi"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Package className="w-3.5 h-3.5" />
                            <span>Ürün ID</span>
                          </div>
                          <span className="text-xs text-gray-700 font-mono">{selectedApplication.originalProductId.substring(0, 12)}...</span>
                        </div>
                        {(selectedApplication.shopId ||
                          selectedApplication.originalProductData?.shopId) && (
                          <div className="flex items-center justify-between py-1.5">
                            <div className="flex items-center gap-2 text-xs text-blue-500">
                              <Package className="w-3.5 h-3.5" />
                              <span>Shop ID</span>
                            </div>
                            <span className="text-xs text-blue-600 font-mono">
                              {(selectedApplication.shopId ||
                                selectedApplication.originalProductData?.shopId || '').substring(0, 12)}...
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Seller Info */}
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                      <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-500" />
                        Satıcı Bilgileri
                      </h3>
                      <div className="space-y-2.5">
                        <div className="flex items-center gap-2 py-1.5 border-b border-gray-100">
                          <Phone className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-xs text-gray-700">{selectedApplication.phone}</span>
                        </div>
                        <div className="flex items-center gap-2 py-1.5 border-b border-gray-100">
                          <MapPin className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-xs text-gray-700">{selectedApplication.region}</span>
                        </div>
                        <div className="flex items-center gap-2 py-1.5 border-b border-gray-100">
                          <CreditCard className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-xs text-gray-700">
                            {selectedApplication.ibanOwnerName}{" "}
                            {selectedApplication.ibanOwnerSurname}
                          </span>
                        </div>
                        <div className="py-1.5 border-b border-gray-100">
                          <div className="text-xs text-gray-500 mb-1">Adres</div>
                          <div className="text-xs text-gray-700">{selectedApplication.address}</div>
                        </div>
                        <div className="py-1.5">
                          <div className="text-xs text-gray-500 mb-1">IBAN</div>
                          <div className="text-xs text-gray-700 font-mono">{selectedApplication.iban}</div>
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
