"use client";

import React from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  ArrowLeft,
  X,
  Loader2,
  Image as ImageIcon,
  Store,
  Star,
  Eye,
  Heart,
  TrendingUp,
  ShoppingBag,
  Badge,
  ExternalLink,
  User,
  Edit,
  Check,
  Search,
  MessageCircle,
  Palette,
  Ruler,
  Zap,
  Copy,
  Database,
  Archive,
  ArchiveRestore,
  AlertTriangle,
  Shield,
} from "lucide-react";
import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  Suspense,
} from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { toast } from "react-hot-toast";
import BoostModal from "@/components/boostproduct";
import { useAuth } from "@/contexts/AuthContext";
import {
  categories,
  subcategoriesMap,
  subSubcategoriesMap,
} from "@/constants/productData";

// Types
interface ProductData {
  id: string;
  productName: string;
  brandModel: string;
  price: number;
  currency: string;
  category: string;
  subcategory: string;
  subsubcategory?: string;
  imageUrls: string[];
  colorImages?: { [key: string]: string[] };
  availableColors?: string[];
  availableSizes?: string[];
  condition: string;
  description?: string;
  clickCount: number;
  favoritesCount: number;
  cartCount: number;
  purchaseCount: number;
  averageRating: number;
  reviewCount: number;
  sold: boolean;
  isFeatured: boolean;
  isBoosted: boolean;
  boostStartTime?: Timestamp;
  boostEndTime?: Timestamp;
  boostDuration?: number;
  isApproved: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  shopId: string;
  userId: string;
  address?: string;
  region?: string;
  deliveryOptions?: string[];
  tags?: string[];
  specifications?: { [key: string]: string };
  warranty?: string;
  returnPolicy?: string;
  stock?: number;
  discountPercentage?: number;
  originalPrice?: number;
  // Admin archive fields
  paused?: boolean;
  archivedByAdmin?: boolean;
  archivedByAdminAt?: Timestamp;
  archivedByAdminId?: string;
  adminArchiveReason?: string;
  needsUpdate?: boolean;
  archiveReason?: string;
}

interface ShopData {
  id: string;
  name: string;
  ownerId: string;
  profileImageUrl?: string;
  averageRating?: number;
  reviewCount?: number;
  followerCount?: number;
  totalProductsSold?: number;
  verified?: boolean;
  isBoosted?: boolean;
  address?: string;
  contactNo?: string;
  createdAt?: Timestamp;
}

interface QuestionData {
  id: string;
  questionId: string;
  productId: string;
  askerId: string;
  askerName: string;
  askerNameVisible: boolean;
  questionText: string;
  timestamp: Timestamp;
  answered: boolean;
  answerText?: string;
  answererName?: string;
  answererProfileImage?: string;
  answerTimestamp?: Timestamp;
}

interface ReviewData {
  id: string;
  userId: string;
  userName: string;
  userImage?: string;
  rating: number;
  review: string;
  timestamp: Timestamp;
  likes: string[];
  imageUrls?: string[];
  verified?: boolean;
}

// Archive Confirmation Modal Component
const ArchiveConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
  productName,
  isArchiving,
  isAdminArchived,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (needsUpdate: boolean, archiveReason: string) => void;
  isLoading: boolean;
  productName: string;
  isArchiving: boolean;
  isAdminArchived: boolean;
}) => {
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setNeedsUpdate(false);
      setArchiveReason("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(needsUpdate, archiveReason);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-full ${
                isArchiving ? "bg-orange-100" : "bg-green-100"
              }`}
            >
              {isArchiving ? (
                <Archive className={`w-6 h-6 text-orange-600`} />
              ) : (
                <ArchiveRestore className={`w-6 h-6 text-green-600`} />
              )}
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              {isArchiving ? "Ürünü Arşivle" : "Arşivden Çıkar"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            disabled={isLoading}
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="mb-6">
          <p className="text-gray-700 mb-3">
            <span className="font-semibold">&quot;{productName}&quot;</span>{" "}
            ürününü {isArchiving ? "arşivlemek" : "arşivden çıkarmak"}{" "}
            istediğinizden emin misiniz?
          </p>

          {isArchiving && (
            <>
              {/* Standard Admin Archive Warning */}
              <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg mb-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-orange-800 text-sm font-medium">
                      Önemli Uyarı
                    </p>
                    <p className="text-orange-700 text-sm mt-1">
                      Admin tarafından arşivlenen ürünler, mağaza sahipleri
                      tarafından arşivden çıkarılamaz.
                    </p>
                  </div>
                </div>
              </div>

              {/* NEW: Needs Update Checkbox */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={needsUpdate}
                    onChange={(e) => setNeedsUpdate(e.target.checked)}
                    className="mt-1 w-5 h-5 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                    disabled={isLoading}
                  />
                  <div>
                    <span className="text-blue-800 font-semibold text-sm">
                      Güncellemeye İhtiyacı Var
                    </span>
                    <p className="text-blue-700 text-xs mt-1">
                      Bu seçeneği işaretlerseniz, mağaza sahibi ürünü
                      güncelleyip tekrar onaya gönderebilir. Güncelleme
                      onaylandığında ürün otomatik olarak aktif hale gelir.
                    </p>
                  </div>
                </label>
              </div>

              {/* NEW: Archive Reason Textarea (shows when needsUpdate is checked) */}
              {needsUpdate && (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg mb-4">
                  <label className="block">
                    <div className="flex items-center gap-2 mb-2">
                      <MessageCircle className="w-4 h-4 text-gray-600" />
                      <span className="text-gray-800 font-semibold text-sm">
                        Arşivleme Nedeni (Mağaza sahibi görecek)
                      </span>
                    </div>
                    <textarea
                      value={archiveReason}
                      onChange={(e) => setArchiveReason(e.target.value)}
                      placeholder="Örn: Ürün görselleri eksik, fiyat bilgisi hatalı, açıklama yetersiz..."
                      className="w-full p-3 border border-gray-300 rounded-lg text-gray-900 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                      rows={4}
                      disabled={isLoading}
                    />
                    <p className="text-gray-500 text-xs mt-2">
                      Bu mesaj mağaza sahibine gösterilecek ve neden güncelleme
                      yapması gerektiğini açıklayacak.
                    </p>
                  </label>
                </div>
              )}
            </>
          )}

          {!isArchiving && isAdminArchived && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-2">
                <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-blue-800 text-sm font-medium">
                    Admin Arşivi
                  </p>
                  <p className="text-blue-700 text-sm mt-1">
                    Bu ürün daha önce bir admin tarafından arşivlenmiş. Arşivden
                    çıkardığınızda normal bir ürün olarak işlem görecek.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-100 text-gray-700 rounded-lg transition-colors font-medium"
          >
            İptal
          </button>
          <button
            onClick={handleConfirm}
            disabled={
              isLoading || (isArchiving && needsUpdate && !archiveReason.trim())
            }
            className={`flex-1 px-4 py-2 rounded-lg transition-colors font-medium flex items-center justify-center gap-2 ${
              isArchiving
                ? "bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300 text-white"
                : "bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white"
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>İşleniyor...</span>
              </>
            ) : (
              <>
                {isArchiving ? (
                  <Archive className="w-4 h-4" />
                ) : (
                  <ArchiveRestore className="w-4 h-4" />
                )}
                <span>{isArchiving ? "Arşivle" : "Arşivden Çıkar"}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// Create a separate component that uses useSearchParams
function ProductDetailsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const productId = searchParams.get("productId");
  const isArchivedParam = searchParams.get("isArchived") === "true";
  const { user: authUser } = useAuth();

  // Check if current user is a full admin (not semi-admin)
  const isFullAdmin = authUser?.isAdmin === true && !authUser?.isSemiAdmin;

  // Refs
  const allFieldsContainerRef = useRef<HTMLDivElement | null>(null);

  // State Management
  const [product, setProduct] = useState<ProductData | null>(null);
  const [shop, setShop] = useState<ShopData | null>(null);
  const [isArchived, setIsArchived] = useState(isArchivedParam);
  const [productCollection, setProductCollection] = useState<string>("");

  const [activeTab, setActiveTab] = useState<"reviews" | "questions">(
    "reviews"
  );
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionFilter, setQuestionFilter] = useState<"all" | "answered">(
    "all"
  );

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryModalType, setCategoryModalType] = useState<
    "category" | "subcategory" | "subsubcategory"
  >("category");
  const [categoryModalField, setCategoryModalField] = useState<string>("");

  const [reviews, setReviews] = useState<ReviewData[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  const [showBoostModal, setShowBoostModal] = useState(false);
  const [isBoostLoading, setIsBoostLoading] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null);

  // Archive modal state
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [isArchiveLoading, setIsArchiveLoading] = useState(false);

  // Image Gallery State
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  // Get current image URLs based on selected color
  const currentImageUrls = useMemo(() => {
    if (selectedColor && product?.colorImages?.[selectedColor]) {
      return product.colorImages[selectedColor];
    }
    return product?.imageUrls || [];
  }, [product, selectedColor]);

  // Fetch product data
  const fetchProductData = useCallback(async () => {
    if (!productId) {
      toast.error("Ürün ID'si bulunamadı");
      router.push("/dashboard");
      return;
    }

    try {
      setLoading(true);

      // Define collection search order based on isArchived param
      const collectionsToSearch = isArchivedParam
        ? [
            "paused_shop_products",
            "paused_products",
            "shop_products",
            "products",
          ]
        : [
            "shop_products",
            "products",
            "paused_shop_products",
            "paused_products",
          ];

      let productDoc = null;
      let foundCollection = "";
      let isShopProduct = false;
      let foundIsArchived = false;

      for (const collectionName of collectionsToSearch) {
        const docRef = doc(db, collectionName, productId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          productDoc = docSnap;
          foundCollection = collectionName;
          isShopProduct = collectionName.includes("shop");
          foundIsArchived = collectionName.includes("paused");
          break;
        }
      }

      if (!productDoc) {
        toast.error("Ürün bulunamadı");
        router.push("/dashboard");
        return;
      }

      setProductCollection(foundCollection);
      setIsArchived(foundIsArchived);

      const productData = {
        id: productDoc.id,
        ...productDoc.data(),
      } as ProductData;
      setProduct(productData);

      // Fetch shop data if it's a shop product
      if (isShopProduct && productData.shopId) {
        const shopDoc = await getDoc(doc(db, "shops", productData.shopId));
        if (shopDoc.exists()) {
          setShop({ id: shopDoc.id, ...shopDoc.data() } as ShopData);
        }
      }

      // Fetch reviews
      await fetchProductReviews(productId, foundCollection);
      await fetchProductQuestions(productId, foundCollection);
    } catch (error) {
      console.error("Error fetching product:", error);
      toast.error("Ürün bilgileri yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  }, [productId, router, isArchivedParam]);

  // Handle Archive/Unarchive
  const handleArchiveToggle = async (
    needsUpdate: boolean = false,
    archiveReason: string = ""
  ) => {
    if (!product || !productId) return;

    try {
      setIsArchiveLoading(true);

      const functions = getFunctions(undefined, "europe-west3");
      const adminToggleArchive = httpsCallable(
        functions,
        "adminToggleProductArchiveStatus"
      );

      const request = {
        productId: productId,
        shopId: product.shopId || null,
        archiveStatus: !isArchived,
        collection: productCollection,
        needsUpdate: needsUpdate, // NEW
        archiveReason: archiveReason, // NEW
      };

      const result = await adminToggleArchive(request);
      const data = result.data as {
        success: boolean;
        archived: boolean;
        message?: string;
      };

      if (data.success) {
        setIsArchived(data.archived);
        setShowArchiveModal(false);

        // Update local product state
        setProduct((prev) =>
          prev
            ? {
                ...prev,
                paused: data.archived,
                archivedByAdmin: data.archived,
                archivedByAdminAt: data.archived ? Timestamp.now() : undefined,
                needsUpdate: data.archived ? needsUpdate : false,
                archiveReason: data.archived ? archiveReason : undefined,
              }
            : null
        );

        // Update the collection name
        if (data.archived) {
          setProductCollection((prev) =>
            prev === "shop_products"
              ? "paused_shop_products"
              : prev === "products"
              ? "paused_products"
              : prev
          );
        } else {
          setProductCollection((prev) =>
            prev === "paused_shop_products"
              ? "shop_products"
              : prev === "paused_products"
              ? "products"
              : prev
          );
        }

        toast.success(
          data.archived
            ? "Ürün başarıyla arşivlendi!"
            : "Ürün arşivden çıkarıldı!"
        );
      } else {
        throw new Error(data.message || "İşlem başarısız oldu");
      }
    } catch (error: unknown) {
      console.error("Archive error:", error);

      let errorMessage = "Arşiv işlemi sırasında hata oluştu";

      if (error && typeof error === "object") {
        if ("code" in error) {
          const errorCode = (error as { code: string }).code;
          if (errorCode === "unauthenticated") {
            errorMessage = "Bu işlem için giriş yapmanız gerekiyor";
          } else if (errorCode === "permission-denied") {
            errorMessage = "Bu işlemi gerçekleştirme yetkiniz yok";
          }
        } else if ("message" in error) {
          errorMessage = (error as { message: string }).message;
        }
      }

      toast.error(errorMessage);
    } finally {
      setIsArchiveLoading(false);
    }
  };

  const CategorySelectionModal = ({
    isOpen,
    onClose,
    fieldType,
    currentValue,
    onSave,
    currentCategory,
    currentSubcategory,
  }: {
    isOpen: boolean;
    onClose: () => void;
    fieldType: "category" | "subcategory" | "subsubcategory";
    currentValue: string;
    onSave: (values: {
      category?: string;
      subcategory?: string;
      subsubcategory?: string;
    }) => void;
    currentCategory?: string;
    currentSubcategory?: string;
  }) => {
    const [flowState, setFlowState] = useState(() => {
      if (fieldType === "subsubcategory") {
        return {
          step: "subsubcategory" as const,
          selectedCategory: currentCategory || "",
          selectedSubcategory: currentSubcategory || "",
          selectedSubsubcategory: currentValue,
        };
      } else if (fieldType === "subcategory") {
        return {
          step: "subcategory" as const,
          selectedCategory: currentCategory || "",
          selectedSubcategory: currentValue,
          selectedSubsubcategory: "",
        };
      } else {
        return {
          step: "category" as const,
          selectedCategory: currentValue,
          selectedSubcategory: "",
          selectedSubsubcategory: "",
        };
      }
    });

    // Reset flow state when modal opens
    useEffect(() => {
      if (isOpen) {
        if (fieldType === "subsubcategory") {
          setFlowState({
            step: "subsubcategory",
            selectedCategory: currentCategory || "",
            selectedSubcategory: currentSubcategory || "",
            selectedSubsubcategory: currentValue,
          });
        } else if (fieldType === "subcategory") {
          setFlowState({
            step: "subcategory",
            selectedCategory: currentCategory || "",
            selectedSubcategory: currentValue,
            selectedSubsubcategory: "",
          });
        } else {
          setFlowState({
            step: "category",
            selectedCategory: currentValue,
            selectedSubcategory: "",
            selectedSubsubcategory: "",
          });
        }
      }
    }, [isOpen, fieldType, currentValue, currentCategory, currentSubcategory]);

    if (!isOpen) return null;

    const getOptions = () => {
      switch (flowState.step) {
        case "category":
          return categories.map((cat) => cat.key);
        case "subcategory":
          return flowState.selectedCategory
            ? subcategoriesMap[flowState.selectedCategory] || []
            : [];
        case "subsubcategory":
          return flowState.selectedCategory && flowState.selectedSubcategory
            ? subSubcategoriesMap[flowState.selectedCategory]?.[
                flowState.selectedSubcategory
              ] || []
            : [];
        default:
          return [];
      }
    };

    const options = getOptions();

    const handleNext = () => {
      if (flowState.step === "category") {
        setFlowState((prev) => ({ ...prev, step: "subcategory" }));
      } else if (flowState.step === "subcategory") {
        setFlowState((prev) => ({ ...prev, step: "subsubcategory" }));
      }
    };

    const handleBack = () => {
      if (flowState.step === "subsubcategory") {
        setFlowState((prev) => ({ ...prev, step: "subcategory" }));
      } else if (flowState.step === "subcategory") {
        setFlowState((prev) => ({ ...prev, step: "category" }));
      }
    };

    const handleSave = () => {
      const updates: {
        category?: string;
        subcategory?: string;
        subsubcategory?: string;
      } = {};

      if (fieldType === "category") {
        updates.category = flowState.selectedCategory;
        updates.subcategory = flowState.selectedSubcategory;
        updates.subsubcategory = flowState.selectedSubsubcategory;
      } else if (fieldType === "subcategory") {
        updates.subcategory = flowState.selectedSubcategory;
        updates.subsubcategory = flowState.selectedSubsubcategory;
      } else {
        updates.subsubcategory = flowState.selectedSubsubcategory;
      }

      onSave(updates);
      onClose();
    };

    const canProceed = () => {
      switch (flowState.step) {
        case "category":
          return flowState.selectedCategory !== "";
        case "subcategory":
          return flowState.selectedSubcategory !== "";
        case "subsubcategory":
          return flowState.selectedSubsubcategory !== "";
        default:
          return false;
      }
    };

    const isLastStep = () => {
      if (fieldType === "subsubcategory") return true;
      if (fieldType === "subcategory")
        return flowState.step === "subsubcategory";
      return flowState.step === "subsubcategory";
    };

    const getCurrentValue = () => {
      switch (flowState.step) {
        case "category":
          return flowState.selectedCategory;
        case "subcategory":
          return flowState.selectedSubcategory;
        case "subsubcategory":
          return flowState.selectedSubsubcategory;
        default:
          return "";
      }
    };

    const setCurrentValue = (value: string) => {
      switch (flowState.step) {
        case "category":
          setFlowState((prev) => ({
            ...prev,
            selectedCategory: value,
            selectedSubcategory: "",
            selectedSubsubcategory: "",
          }));
          break;
        case "subcategory":
          setFlowState((prev) => ({
            ...prev,
            selectedSubcategory: value,
            selectedSubsubcategory: "",
          }));
          break;
        case "subsubcategory":
          setFlowState((prev) => ({ ...prev, selectedSubsubcategory: value }));
          break;
      }
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {flowState.step === "category" && "Kategori Seç"}
                {flowState.step === "subcategory" && "Alt Kategori Seç"}
                {flowState.step === "subsubcategory" && "Alt Alt Kategori Seç"}
              </h3>
              <div className="text-sm text-gray-600 mt-1">
                {flowState.step === "subcategory" &&
                  flowState.selectedCategory && (
                    <span>{flowState.selectedCategory}</span>
                  )}
                {flowState.step === "subsubcategory" &&
                  flowState.selectedCategory &&
                  flowState.selectedSubcategory && (
                    <span>
                      {flowState.selectedCategory} →{" "}
                      {flowState.selectedSubcategory}
                    </span>
                  )}
              </div>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          {fieldType === "category" && flowState.step === "category" && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-yellow-800 text-sm">
                ⚠️ Kategori değiştirildiğinde alt kategori ve alt alt kategori
                de seçilmelidir.
              </p>
            </div>
          )}
          {fieldType === "subcategory" && flowState.step === "subcategory" && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-yellow-800 text-sm">
                ⚠️ Alt kategori değiştirildiğinde alt alt kategori de
                seçilmelidir.
              </p>
            </div>
          )}

          <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
            {options.map((option) => (
              <button
                key={option}
                onClick={() => setCurrentValue(option)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  getCurrentValue() === option
                    ? "bg-blue-600 text-white"
                    : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                }`}
              >
                {option}
              </button>
            ))}
          </div>

          {options.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-600">Bu kategoride seçenek bulunmuyor</p>
            </div>
          )}

          <div className="flex gap-2">
            {flowState.step !== "category" &&
              fieldType !== "subsubcategory" && (
                <button
                  onClick={handleBack}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-colors"
                >
                  Geri
                </button>
              )}

            {isLastStep() ? (
              <button
                onClick={handleSave}
                disabled={!canProceed()}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white rounded-lg transition-colors"
              >
                Kaydet
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={!canProceed()}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg transition-colors"
              >
                İleri
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            >
              İptal
            </button>
          </div>
        </div>
      </div>
    );
  };

  const handleBoostProduct = async (durationInMinutes: number) => {
    if (!product || !productId) return;

    try {
      setIsBoostLoading(true);

      const functions = getFunctions(undefined, "europe-west3");
      const boostProducts = httpsCallable(functions, "boostProducts");

      const collection = product.shopId ? "shop_products" : "products";

      if (collection === "shop_products" && !product.shopId) {
        throw new Error("Shop products must have a shopId");
      }

      const item: {
        itemId: string;
        collection: string;
        shopId?: string;
      } = {
        itemId: productId,
        collection: collection,
      };

      if (collection === "shop_products" && product.shopId) {
        item.shopId = product.shopId;
      }

      const request = {
        items: [item],
        boostDuration: durationInMinutes,
      };

      const result = await boostProducts(request);

      if (result.data && (result.data as { success: boolean }).success) {
        setProduct((prev) =>
          prev
            ? {
                ...prev,
                isBoosted: true,
                boostStartTime: Timestamp.fromDate(new Date()),
                boostEndTime: Timestamp.fromDate(
                  new Date(Date.now() + durationInMinutes * 60 * 1000)
                ),
                boostDuration: durationInMinutes,
              }
            : null
        );

        setShowBoostModal(false);
        toast.success(`Ürün ${durationInMinutes} dakika boyunca boost edildi!`);
      } else {
        throw new Error(
          (result.data as { message: string }).message ||
            "Boost işlemi başarısız oldu"
        );
      }
    } catch (error: unknown) {
      console.error("Boost error:", error);

      let errorMessage = "Boost işlemi sırasında hata oluştu";

      if (error && typeof error === "object") {
        if ("code" in error) {
          const errorCode = (error as { code: string }).code;

          if (errorCode === "unauthenticated") {
            errorMessage = "Bu işlem için giriş yapmanız gerekiyor";
          } else if (errorCode === "permission-denied") {
            errorMessage = "Bu ürünü boost etme yetkiniz yok";
          } else if (errorCode === "failed-precondition") {
            errorMessage = "Ürün zaten boost edilmiş durumda";
          } else if (errorCode === "invalid-argument") {
            errorMessage = "Geçersiz parametreler. Lütfen tekrar deneyin.";
          }
        } else if ("message" in error) {
          const message = (error as { message: string }).message;
          if (message.includes("No valid items found")) {
            errorMessage =
              "Ürün boost edilemedi. Ürün geçerli olmayabilir veya yetkiniz bulunmuyor olabilir.";
          } else if (message.includes("permissions")) {
            errorMessage = "Bu ürünü boost etme yetkiniz yok";
          } else if (message.includes("shopId")) {
            errorMessage = "Mağaza ürünü için geçerli mağaza ID'si gerekli";
          } else {
            errorMessage = message;
          }
        }
      }

      toast.error(errorMessage);
    } finally {
      setIsBoostLoading(false);
    }
  };

  const saveIndividualField = async (
    field: string,
    value: string | number | boolean
  ) => {
    if (!productId) throw new Error("Product ID not found");

    const productRef = doc(db, productCollection, productId);
    await updateDoc(productRef, {
      [field]: value,
      updatedAt: Timestamp.now(),
    });

    setProduct((prev) =>
      prev ? { ...prev, [field]: value, updatedAt: Timestamp.now() } : null
    );
  };

  const handleCategorySave = async (values: {
    category?: string;
    subcategory?: string;
    subsubcategory?: string;
  }) => {
    try {
      setSavingField(categoryModalField);

      if (values.category !== undefined) {
        await saveIndividualField("category", values.category);
      }
      if (values.subcategory !== undefined) {
        await saveIndividualField("subcategory", values.subcategory);
      }
      if (values.subsubcategory !== undefined) {
        await saveIndividualField("subsubcategory", values.subsubcategory);
      }

      setShowCategoryModal(false);
      toast.success(`Kategori bilgileri başarıyla güncellendi!`);
    } catch (error) {
      console.error("Error saving category fields:", error);
      toast.error(`Kategori bilgileri güncellenirken hata oluştu`);
    } finally {
      setSavingField(null);
    }
  };

  const fetchProductReviews = useCallback(
    async (prodId: string, collectionName: string) => {
      try {
        setReviewsLoading(true);

        const reviewsQuery = query(
          collection(db, collectionName, prodId, "reviews"),
          orderBy("timestamp", "desc"),
          limit(10)
        );

        const snapshot = await getDocs(reviewsQuery);
        const reviewsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as ReviewData[];

        setReviews(reviewsData);
      } catch (error) {
        console.error("Error fetching reviews:", error);
      } finally {
        setReviewsLoading(false);
      }
    },
    []
  );

  const fetchProductQuestions = useCallback(
    async (prodId: string, collectionName: string) => {
      try {
        setQuestionsLoading(true);

        const questionsQuery = query(
          collection(db, collectionName, prodId, "product_questions"),
          orderBy("timestamp", "desc"),
          limit(20)
        );

        const snapshot = await getDocs(questionsQuery);
        const questionsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as QuestionData[];

        setQuestions(questionsData);
      } catch (error) {
        console.error("Error fetching questions:", error);
      } finally {
        setQuestionsLoading(false);
      }
    },
    []
  );

  const filteredQuestions = useMemo(() => {
    if (questionFilter === "all") {
      return questions;
    }
    return questions.filter((question) => question.answered);
  }, [questions, questionFilter]);

  const handleColorSelect = (color: string) => {
    if (selectedColor === color) {
      setSelectedColor(null);
      setSelectedImageIndex(0);
    } else {
      setSelectedColor(color);
      setSelectedImageIndex(0);
    }
  };

  useEffect(() => {
    fetchProductData();
  }, [fetchProductData]);

  const BoostCountdown = ({ boostEndTime }: { boostEndTime: Timestamp }) => {
    const [timeRemaining, setTimeRemaining] = useState<{
      days: number;
      hours: number;
      minutes: number;
      seconds: number;
    }>({ days: 0, hours: 0, minutes: 0, seconds: 0 });

    useEffect(() => {
      const updateCountdown = () => {
        const now = new Date().getTime();
        const endTime = boostEndTime.toDate().getTime();
        const difference = endTime - now;

        if (difference > 0) {
          const days = Math.floor(difference / (1000 * 60 * 60 * 24));
          const hours = Math.floor(
            (difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
          );
          const minutes = Math.floor(
            (difference % (1000 * 60 * 60)) / (1000 * 60)
          );
          const seconds = Math.floor((difference % (1000 * 60)) / 1000);

          setTimeRemaining({ days, hours, minutes, seconds });
        } else {
          setTimeRemaining({ days: 0, hours: 0, minutes: 0, seconds: 0 });
          setProduct((prev) => (prev ? { ...prev, isBoosted: false } : null));
        }
      };

      updateCountdown();
      const interval = setInterval(updateCountdown, 1000);
      return () => clearInterval(interval);
    }, [boostEndTime]);

    const formatTime = (time: number) => time.toString().padStart(2, "0");

    return (
      <div className="px-2 py-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded text-xs font-medium flex items-center gap-1 shadow-sm">
        <Zap className="w-3 h-3" />
        <span>
          {timeRemaining.days > 0 && <span>{timeRemaining.days}g </span>}
          {formatTime(timeRemaining.hours)}:{formatTime(timeRemaining.minutes)}:
          {formatTime(timeRemaining.seconds)}
        </span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-900">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          <span>Ürün bilgileri yükleniyor...</span>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2 text-gray-900">
            Ürün Bulunamadı
          </h2>
          <p className="text-gray-600">Aradığınız ürün mevcut değil.</p>
        </div>
      </div>
    );
  }

  const AllFieldsDisplay = ({
    product,
    onFieldSave,
    savingField,
    setSavingField,
    canEdit,
  }: {
    product: ProductData;
    onFieldSave: (
      field: string,
      value: string | number | boolean
    ) => Promise<void>;
    savingField: string | null;
    setSavingField: (field: string | null) => void;
    canEdit: boolean;
  }) => {
    const [searchTerm, setSearchTerm] = useState("");
    const [editingField, setEditingField] = useState<string | null>(null);
    const [editValue, setEditValue] = useState<string>("");

    const formatFieldValue = (
      value: unknown
    ): { display: string; type: string } => {
      if (value === null) return { display: "null", type: "null" };
      if (value === undefined)
        return { display: "undefined", type: "undefined" };

      const type = typeof value;

      switch (type) {
        case "string":
          return { display: value as string, type: "string" };
        case "number":
          return { display: value.toString(), type: "number" };
        case "boolean":
          return { display: value.toString(), type: "boolean" };
        case "object":
          if (value instanceof Date) {
            return { display: value.toLocaleString("tr-TR"), type: "date" };
          }
          if (
            value &&
            typeof value === "object" &&
            value !== null &&
            "toDate" in value &&
            typeof (value as { toDate: () => Date }).toDate === "function"
          ) {
            return {
              display: (value as { toDate: () => Date })
                .toDate()
                .toLocaleString("tr-TR"),
              type: "timestamp",
            };
          }
          if (Array.isArray(value)) {
            return { display: JSON.stringify(value), type: "array" };
          }
          if (value && typeof value === "object") {
            return { display: JSON.stringify(value), type: "object" };
          }
          return { display: JSON.stringify(value), type: "object" };
        default:
          return { display: String(value), type: type };
      }
    };

    const getTypeColor = (type: string): string => {
      switch (type) {
        case "string":
          return "text-green-600";
        case "number":
          return "text-blue-600";
        case "boolean":
          return "text-purple-600";
        case "timestamp":
          return "text-orange-600";
        case "date":
          return "text-orange-600";
        case "array":
          return "text-pink-600";
        case "object":
          return "text-indigo-600";
        case "null":
          return "text-gray-500";
        case "undefined":
          return "text-gray-500";
        default:
          return "text-gray-900";
      }
    };

    const getAllFields = () => {
      const fields: Array<{
        key: string;
        value: unknown;
        type: string;
        editable: boolean;
      }> = [];

      const nonEditableFields = [
        "id",
        "createdAt",
        "updatedAt",
        "userId",
        "shopId",
      ];

      const productData = { ...product } as Record<string, unknown>;

      Object.keys(productData).forEach((key) => {
        const value = productData[key];
        const { type } = formatFieldValue(value);
        const editable = !nonEditableFields.includes(key);
        fields.push({ key, value, type, editable });
      });

      return fields.sort((a, b) => a.key.localeCompare(b.key));
    };

    const filteredFields = useMemo(() => {
      const allFields = getAllFields();

      if (!searchTerm.trim()) {
        return allFields;
      }

      const searchLower = searchTerm.toLowerCase();
      return allFields.filter(
        (field) =>
          field.key.toLowerCase().includes(searchLower) ||
          formatFieldValue(field.value)
            .display.toLowerCase()
            .includes(searchLower)
      );
    }, [product, searchTerm]);

    const startEditing = (fieldKey: string, currentValue: unknown) => {
      if (
        fieldKey === "category" ||
        fieldKey === "subcategory" ||
        fieldKey === "subsubcategory"
      ) {
        setCategoryModalType(
          fieldKey as "category" | "subcategory" | "subsubcategory"
        );
        setCategoryModalField(fieldKey);
        setShowCategoryModal(true);
        return;
      }

      setEditingField(fieldKey);
      const { display } = formatFieldValue(currentValue);
      setEditValue(display);
    };

    const cancelEditing = () => {
      setEditingField(null);
      setEditValue("");
    };

    const saveField = async (fieldKey: string, type: string) => {
      try {
        setSavingField(fieldKey);

        let convertedValue: string | number | boolean = editValue;

        switch (type) {
          case "number":
            convertedValue = editValue === "" ? 0 : Number(editValue);
            if (isNaN(convertedValue)) {
              toast.error("Geçersiz sayı formatı");
              return;
            }
            break;
          case "boolean":
            convertedValue = editValue.toLowerCase() === "true";
            break;
          case "array":
            try {
              convertedValue = JSON.parse(editValue);
              if (!Array.isArray(convertedValue)) {
                convertedValue = [editValue] as unknown as
                  | string
                  | number
                  | boolean;
              }
            } catch {
              toast.error("Geçersiz JSON array formatı");
              return;
            }
            break;
          case "object":
            try {
              convertedValue = JSON.parse(editValue);
            } catch {
              toast.error("Geçersiz JSON object formatı");
              return;
            }
            break;
          default:
            convertedValue = editValue;
        }

        await onFieldSave(fieldKey, convertedValue);
        setEditingField(null);
        setEditValue("");
        toast.success(`${fieldKey} başarıyla güncellendi!`);
      } catch (error) {
        console.error("Error saving field:", error);
        toast.error(`${fieldKey} güncellenirken hata oluştu`);
      } finally {
        setSavingField(null);
      }
    };

    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm h-full flex flex-col">
        {/* Header with Search */}
        <div className="p-3 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-gray-900">
                Tüm Ürün Alanları
              </h3>
              <span className="text-xs text-gray-600">
                ({filteredFields.length})
              </span>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Alan ara..."
              className="w-full pl-7 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded text-gray-900 text-xs placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Fields List - Scrollable */}
        <div
          ref={allFieldsContainerRef}
          className="p-2 space-y-1 overflow-y-auto flex-1"
        >
          {filteredFields.map((field) => {
            const { display, type } = formatFieldValue(field.value);
            const isEditing = editingField === field.key;
            const isSaving = savingField === field.key;
            const fieldEditable = field.editable && type !== "timestamp";

            return (
              <div
                key={field.key}
                className={`border rounded p-2 transition-all text-xs ${
                  field.editable
                    ? "border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100"
                    : "border-gray-200 bg-gray-100"
                } ${isEditing ? "border-blue-400 bg-blue-50" : ""}`}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    {/* Field Name */}
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="font-mono font-semibold text-blue-700 text-xs">
                        {field.key}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${getTypeColor(
                          type
                        )} bg-gray-100 font-medium`}
                      >
                        {type}
                      </span>
                      {!field.editable && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">
                          RO
                        </span>
                      )}
                    </div>

                    {/* Field Value */}
                    <div>
                      {isEditing && canEdit ? (
                        <div className="space-y-1">
                          {type === "boolean" ? (
                            <select
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full p-1.5 bg-white border border-gray-300 rounded text-gray-900 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                              disabled={isSaving}
                            >
                              <option value="true">true</option>
                              <option value="false">false</option>
                            </select>
                          ) : type === "array" || type === "object" ? (
                            <textarea
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full p-1.5 bg-white border border-gray-300 rounded text-gray-900 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                              rows={3}
                              placeholder="JSON formatında giriniz"
                              disabled={isSaving}
                            />
                          ) : (
                            <input
                              type={type === "number" ? "number" : "text"}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full p-1.5 bg-white border border-gray-300 rounded text-gray-900 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                              disabled={isSaving}
                            />
                          )}

                          {/* Edit Actions */}
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => saveField(field.key, type)}
                              disabled={isSaving}
                              className="px-2 py-1 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white rounded text-[10px] transition-colors flex items-center gap-1"
                            >
                              {isSaving ? (
                                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              ) : (
                                <Check className="w-2.5 h-2.5" />
                              )}
                              Kaydet
                            </button>
                            <button
                              onClick={cancelEditing}
                              disabled={isSaving}
                              className="px-2 py-1 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded text-[10px] transition-colors flex items-center gap-1"
                            >
                              <X className="w-2.5 h-2.5" />
                              İptal
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 group">
                          <span
                            className={`font-mono ${getTypeColor(
                              type
                            )} flex-1 truncate text-xs`}
                            title={display}
                          >
                            {type === "array" || type === "object" ? (
                              <details className="inline">
                                <summary className="cursor-pointer hover:text-gray-900 transition-colors inline">
                                  {type === "array"
                                    ? `[${
                                        Array.isArray(field.value)
                                          ? (field.value as unknown as string[])
                                              .length
                                          : 0
                                      }]`
                                    : `{${
                                        field.value &&
                                        typeof field.value === "object"
                                          ? Object.keys(field.value).length
                                          : 0
                                      }}`}
                                </summary>
                                <div className="mt-1 p-2 bg-gray-100 rounded border-l border-gray-300">
                                  <pre className="text-[10px] overflow-x-auto whitespace-pre-wrap text-gray-700">
                                    {JSON.stringify(field.value, null, 2)}
                                  </pre>
                                </div>
                              </details>
                            ) : (
                              display
                            )}
                          </span>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {canEdit && fieldEditable && (
                              <button
                                onClick={() =>
                                  startEditing(field.key, field.value)
                                }
                                className="p-0.5 hover:bg-gray-200 rounded transition-colors"
                                title="Düzenle"
                              >
                                <Edit className="w-3 h-3 text-blue-600" />
                              </button>
                            )}
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  type === "array" || type === "object"
                                    ? JSON.stringify(field.value, null, 2)
                                    : String(field.value)
                                );
                                toast.success("Kopyalandı!");
                              }}
                              className="p-0.5 hover:bg-gray-200 rounded transition-colors"
                              title="Kopyala"
                            >
                              <Copy className="w-3 h-3 text-gray-600" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* No Results */}
        {filteredFields.length === 0 && (
          <div className="text-center py-6">
            <Search className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-600 text-xs">Alan bulunamadı</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Compact Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1800px] mx-auto px-4 py-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-1.5 hover:bg-gray-100 rounded transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-gray-700" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-gray-900 truncate">
                  {product.productName}
                </h1>
                {/* Archive Status Badge */}
                {isArchived && (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                      product.archivedByAdmin
                        ? "bg-red-100 text-red-700 border border-red-200"
                        : "bg-orange-100 text-orange-700 border border-orange-200"
                    }`}
                  >
                    <Archive className="w-3 h-3" />
                    {product.archivedByAdmin ? "Admin Arşivi" : "Arşivde"}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-600 truncate">
                {product.brandModel} • {product.category} •{" "}
                <span className="font-mono text-blue-600">
                  {productCollection}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Archive/Unarchive Button - Only for Full Admins */}
              {isFullAdmin && (
                <button
                  onClick={() => setShowArchiveModal(true)}
                  disabled={isArchiveLoading}
                  className={`px-2 py-1 rounded text-xs transition-colors flex items-center gap-1 ${
                    isArchived
                      ? "bg-green-100 hover:bg-green-200 text-green-700"
                      : "bg-orange-100 hover:bg-orange-200 text-orange-700"
                  } disabled:opacity-50`}
                >
                  {isArchiveLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : isArchived ? (
                    <ArchiveRestore className="w-3 h-3" />
                  ) : (
                    <Archive className="w-3 h-3" />
                  )}
                  <span>{isArchived ? "Arşivden Çıkar" : "Arşivle"}</span>
                </button>
              )}

              {/* Boost Button - Only show for non-archived products */}
              {!isArchived && (
                <>
                  {!product.isBoosted ? (
                    <button
                      onClick={() => setShowBoostModal(true)}
                      className="px-2 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded text-xs transition-colors flex items-center gap-1"
                    >
                      <Zap className="w-3 h-3" />
                      <span>Boost</span>
                    </button>
                  ) : product.boostEndTime ? (
                    <BoostCountdown boostEndTime={product.boostEndTime} />
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1800px] mx-auto px-4 py-4 h-screen overflow-hidden">
        {/* Admin Archive Warning Banner */}
        {isArchived && product.archivedByAdmin && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-800 font-medium text-sm">
                  Admin Tarafından Arşivlendi
                </p>
                <p className="text-red-700 text-xs mt-1">
                  Bu ürün bir yönetici tarafından arşivlenmiştir. Mağaza sahibi
                  bu ürünü arşivden çıkaramaz.
                  {product.archivedByAdminAt && (
                    <span className="block mt-1 text-red-600">
                      Arşivlenme tarihi:{" "}
                      {product.archivedByAdminAt
                        .toDate()
                        .toLocaleString("tr-TR")}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Grid - Maximized Width & Height Usage */}
        <div className="grid grid-cols-12 gap-4 h-full overflow-hidden">
          {/* Left Column - Product Images (Compact) */}
          <div className="col-span-3 space-y-2 overflow-y-auto h-full">
            {/* Main Image */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
              <div className="relative aspect-square">
                {currentImageUrls[selectedImageIndex] ? (
                  <Image
                    src={currentImageUrls[selectedImageIndex]}
                    alt={product.productName || "Product"}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                    <ImageIcon className="w-12 h-12 text-gray-400" />
                  </div>
                )}

                {/* Archive Overlay */}
                {isArchived && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <div className="bg-white/90 px-3 py-2 rounded-lg flex items-center gap-2">
                      <Archive className="w-4 h-4 text-orange-600" />
                      <span className="text-sm font-medium text-gray-900">
                        Arşivde
                      </span>
                    </div>
                  </div>
                )}

                {/* Image Navigation */}
                {currentImageUrls.length > 1 && (
                  <>
                    <button
                      onClick={() =>
                        setSelectedImageIndex((prev) =>
                          prev > 0 ? prev - 1 : currentImageUrls.length - 1
                        )
                      }
                      className="absolute left-1 top-1/2 transform -translate-y-1/2 p-1 bg-white/90 hover:bg-white text-gray-700 rounded-full transition-colors shadow"
                    >
                      <ArrowLeft className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() =>
                        setSelectedImageIndex((prev) =>
                          prev < currentImageUrls.length - 1 ? prev + 1 : 0
                        )
                      }
                      className="absolute right-1 top-1/2 transform -translate-y-1/2 p-1 bg-white/90 hover:bg-white text-gray-700 rounded-full transition-colors shadow"
                    >
                      <ArrowLeft className="w-3 h-3 rotate-180" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Image Thumbnails */}
            {currentImageUrls.length > 1 && (
              <div className="flex gap-1 overflow-x-auto pb-1">
                {currentImageUrls.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImageIndex(index)}
                    className={`relative w-14 h-14 rounded overflow-hidden flex-shrink-0 border-2 transition-colors ${
                      selectedImageIndex === index
                        ? "border-blue-500"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <Image
                      src={image}
                      alt={`Thumbnail ${index + 1}`}
                      fill
                      className="object-cover"
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Color/Size Selection - Compact */}
            {product.availableColors && product.availableColors.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-2 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-900 mb-1.5 flex items-center gap-1">
                  <Palette className="w-3 h-3" />
                  Renkler
                </h3>
                <div className="flex flex-wrap gap-1">
                  {product.availableColors.map((color, index) => (
                    <button
                      key={index}
                      onClick={() => handleColorSelect(color)}
                      className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                        selectedColor === color
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {color}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {product.availableSizes && product.availableSizes.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-2 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-900 mb-1.5 flex items-center gap-1">
                  <Ruler className="w-3 h-3" />
                  Bedenler
                </h3>
                <div className="flex flex-wrap gap-1">
                  {product.availableSizes.map((size, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-gray-100 border border-gray-200 rounded text-[10px] text-gray-700"
                    >
                      {size}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Stats - Compact */}
            <div className="bg-white border border-gray-200 rounded-lg p-2 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-900 mb-2">
                İstatistikler
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Eye className="w-3 h-3 text-blue-600" />
                    <span className="text-gray-700">Görüntülenme</span>
                  </div>
                  <span className="text-gray-900 font-semibold">
                    {product.clickCount || 0}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Heart className="w-3 h-3 text-red-500" />
                    <span className="text-gray-700">Beğeni</span>
                  </div>
                  <span className="text-gray-900 font-semibold">
                    {product.favoritesCount || 0}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <ShoppingBag className="w-3 h-3 text-green-600" />
                    <span className="text-gray-700">Sepet</span>
                  </div>
                  <span className="text-gray-900 font-semibold">
                    {product.cartCount || 0}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-purple-600" />
                    <span className="text-gray-700">Satış</span>
                  </div>
                  <span className="text-gray-900 font-semibold">
                    {product.purchaseCount || 0}
                  </span>
                </div>

                <div className="flex items-center justify-between col-span-2">
                  <div className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-yellow-500" />
                    <span className="text-gray-700">Ortalama Puan</span>
                  </div>
                  <span className="text-gray-900 font-semibold">
                    {product.averageRating
                      ? product.averageRating.toFixed(1)
                      : "0.0"}
                    <span className="text-gray-600 text-[10px] ml-1">
                      ({product.reviewCount || 0})
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {/* Shop Info - Compact */}
            {shop && (
              <div className="bg-white border border-gray-200 rounded-lg p-2 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-900 mb-2 flex items-center gap-1">
                  <Store className="w-3 h-3" />
                  Mağaza
                </h3>
                <div className="flex items-center gap-2">
                  <div className="relative w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                    {shop.profileImageUrl ? (
                      <Image
                        src={shop.profileImageUrl}
                        alt={shop.name}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                        <Store className="w-4 h-4 text-gray-500" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <h4 className="font-semibold text-gray-900 text-xs truncate">
                        {shop.name}
                      </h4>
                      {shop.verified && (
                        <Badge className="w-3 h-3 text-blue-600" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-gray-600">
                      <div className="flex items-center gap-0.5">
                        <Star className="w-2.5 h-2.5 text-yellow-500" />
                        <span>{shop.averageRating?.toFixed(1) || "0.0"}</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <User className="w-2.5 h-2.5" />
                        <span>{shop.followerCount || 0}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      router.push(`/shopdetails?shopId=${shop.id}`)
                    }
                    className="p-1 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Middle Column - All Fields (Extended Height) */}
          <div className="col-span-5 h-full overflow-hidden">
            <AllFieldsDisplay
              product={product}
              onFieldSave={saveIndividualField}
              savingField={savingField}
              setSavingField={setSavingField}
              canEdit={isFullAdmin}
            />
          </div>

          {/* Right Column - Reviews & Questions (Extended Height) */}
          <div className="col-span-4 h-full overflow-hidden">
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm h-full flex flex-col">
              {/* Tab Headers */}
              <div className="flex items-center border-b border-gray-200 flex-shrink-0">
                <button
                  onClick={() => setActiveTab("reviews")}
                  className={`flex-1 py-2 px-3 text-xs font-medium transition-colors relative ${
                    activeTab === "reviews"
                      ? "text-gray-900 bg-gray-50"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <div className="flex items-center justify-center gap-1">
                    <MessageCircle className="w-3 h-3" />
                    Değerlendirmeler ({reviews.length})
                  </div>
                  {activeTab === "reviews" && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                  )}
                </button>

                <button
                  onClick={() => setActiveTab("questions")}
                  className={`flex-1 py-2 px-3 text-xs font-medium transition-colors relative ${
                    activeTab === "questions"
                      ? "text-gray-900 bg-gray-50"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <div className="flex items-center justify-center gap-1">
                    <MessageCircle className="w-3 h-3" />
                    Sorular ({questions.length})
                  </div>
                  {activeTab === "questions" && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                  )}
                </button>
              </div>

              {/* Content Area - Scrollable with Extended Height */}
              <div className="p-3 overflow-y-auto flex-1">
                {/* Reviews Tab Content */}
                {activeTab === "reviews" && (
                  <div>
                    {reviewsLoading ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                        <span className="text-gray-600 ml-2 text-xs">
                          Yükleniyor...
                        </span>
                      </div>
                    ) : reviews.length > 0 ? (
                      <div className="space-y-2">
                        {reviews.map((review) => (
                          <div
                            key={review.id}
                            className="p-2 bg-gray-50 rounded border border-gray-200"
                          >
                            <div className="flex items-start gap-2">
                              <div className="relative w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
                                {review.userImage ? (
                                  <Image
                                    src={review.userImage}
                                    alt={review.userName}
                                    fill
                                    className="object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                                    <User className="w-3 h-3 text-gray-500" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1 mb-0.5">
                                  <h4 className="font-semibold text-gray-900 text-xs truncate">
                                    {review.userName}
                                  </h4>
                                  <div className="flex items-center gap-0.5">
                                    {[...Array(5)].map((_, i) => (
                                      <Star
                                        key={i}
                                        className={`w-2.5 h-2.5 ${
                                          i < review.rating
                                            ? "text-yellow-500 fill-current"
                                            : "text-gray-300"
                                        }`}
                                      />
                                    ))}
                                  </div>
                                </div>
                                <p className="text-gray-700 text-xs">
                                  {review.review}
                                </p>
                                <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-1">
                                  <span>
                                    {review.timestamp
                                      ?.toDate()
                                      .toLocaleDateString("tr-TR")}
                                  </span>
                                  <div className="flex items-center gap-0.5">
                                    <Heart className="w-2.5 h-2.5" />
                                    <span>{review.likes?.length || 0}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <MessageCircle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-600 text-xs">
                          Henüz değerlendirme bulunmuyor
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Questions Tab Content */}
                {activeTab === "questions" && (
                  <div>
                    {/* Question Filter */}
                    <div className="flex items-center gap-2 mb-3">
                      <button
                        onClick={() => setQuestionFilter("all")}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                          questionFilter === "all"
                            ? "bg-blue-600 text-white"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        Hepsi ({questions.length})
                      </button>
                      <button
                        onClick={() => setQuestionFilter("answered")}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                          questionFilter === "answered"
                            ? "bg-blue-600 text-white"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        Cevaplananlar (
                        {questions.filter((q) => q.answered).length})
                      </button>
                    </div>

                    {/* Questions List */}
                    {questionsLoading ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                        <span className="text-gray-600 ml-2 text-xs">
                          Yükleniyor...
                        </span>
                      </div>
                    ) : filteredQuestions.length > 0 ? (
                      <div className="space-y-2">
                        {filteredQuestions.map((question) => (
                          <div
                            key={question.id}
                            className="p-2 bg-gray-50 rounded border border-gray-200"
                          >
                            {/* Question */}
                            <div className="mb-2">
                              <div className="flex items-center gap-1 mb-0.5">
                                <h4 className="font-semibold text-gray-900 text-xs">
                                  {question.askerNameVisible
                                    ? question.askerName
                                    : "Anonim"}
                                </h4>
                                <span className="text-[10px] text-gray-500">
                                  {question.timestamp
                                    ?.toDate()
                                    .toLocaleDateString("tr-TR")}
                                </span>
                              </div>
                              <p className="text-gray-700 text-xs">
                                {question.questionText}
                              </p>
                            </div>

                            {/* Answer */}
                            {question.answered && question.answerText && (
                              <div className="ml-2 pl-2 border-l border-blue-400 bg-blue-50 rounded-r p-2">
                                <div className="flex items-center gap-1 mb-0.5">
                                  <div className="relative w-4 h-4 rounded-full overflow-hidden flex-shrink-0">
                                    {question.answererProfileImage ? (
                                      <Image
                                        src={question.answererProfileImage}
                                        alt="Seller"
                                        fill
                                        className="object-cover"
                                      />
                                    ) : (
                                      <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                                        <User className="w-2.5 h-2.5 text-gray-500" />
                                      </div>
                                    )}
                                  </div>
                                  <h5 className="font-semibold text-blue-700 text-xs">
                                    {question.answererName ||
                                      shop?.name ||
                                      "Satıcı"}
                                  </h5>
                                  <span className="text-[10px] text-gray-500">
                                    {question.answerTimestamp
                                      ?.toDate()
                                      .toLocaleDateString("tr-TR")}
                                  </span>
                                </div>
                                <p className="text-gray-700 text-xs">
                                  {question.answerText}
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <MessageCircle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-600 text-xs">
                          {questionFilter === "all"
                            ? "Henüz soru bulunmuyor"
                            : "Henüz cevaplanmış soru bulunmuyor"}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      {showBoostModal && (
        <BoostModal
          isOpen={showBoostModal}
          productName={product?.productName || ""}
          onClose={() => setShowBoostModal(false)}
          onBoost={handleBoostProduct}
          isLoading={isBoostLoading}
        />
      )}

      {showCategoryModal && (
        <CategorySelectionModal
          isOpen={showCategoryModal}
          onClose={() => setShowCategoryModal(false)}
          fieldType={categoryModalType}
          currentValue={
            categoryModalType === "category"
              ? product.category
              : categoryModalType === "subcategory"
              ? product.subcategory
              : product.subsubcategory || ""
          }
          onSave={handleCategorySave}
          currentCategory={product.category}
          currentSubcategory={product.subcategory}
        />
      )}

      {/* Archive Confirmation Modal */}
      <ArchiveConfirmationModal
        isOpen={showArchiveModal}
        onClose={() => setShowArchiveModal(false)}
        onConfirm={handleArchiveToggle}
        isLoading={isArchiveLoading}
        productName={product?.productName || ""}
        isArchiving={!isArchived}
        isAdminArchived={product?.archivedByAdmin || false}
      />
    </div>
  );
}

// Main export with Suspense wrapper
export default function ProductDetails() {
  return (
    <ProtectedRoute>
      <Suspense
        fallback={
          <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
            <div className="flex items-center gap-3 text-gray-900">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <span>Yükleniyor...</span>
            </div>
          </div>
        }
      >
        <ProductDetailsContent />
      </Suspense>
    </ProtectedRoute>
  );
}
