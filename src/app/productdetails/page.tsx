"use client";

import React from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  ArrowLeft,
  Package,
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
  Grid,
  List,
  MessageCircle,
  Palette,
  Ruler,
  Info,
  Zap,
  Copy,
  Database,
  ArrowRight,
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
  where,
  orderBy,
  limit,
  startAfter,
  Timestamp,
  DocumentSnapshot,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { toast } from "react-hot-toast";
import BoostModal from "@/components/boostproduct";
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

type ViewMode = "grid" | "list";
type FilterStatus = "all" | "active" | "sold" | "featured";
type SortBy = "newest" | "oldest" | "price_high" | "price_low" | "popular";

// Create a separate component that uses useSearchParams
function ProductDetailsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const productId = searchParams.get("productId");

  // Refs for infinite scroll
  const lastRelatedProductElementRef = useRef<HTMLDivElement | null>(null);

  // State Management
  const [product, setProduct] = useState<ProductData | null>(null);
  const [shop, setShop] = useState<ShopData | null>(null);

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

  const [relatedProducts, setRelatedProducts] = useState<ProductData[]>([]);
  const [reviews, setReviews] = useState<ReviewData[]>([]);
  const [loading, setLoading] = useState(true);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  const [showBoostModal, setShowBoostModal] = useState(false);
  const [isBoostLoading, setIsBoostLoading] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null);

  // Image Gallery State
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  // Filter and Search States for Related Products
  const [relatedSearch, setRelatedSearch] = useState("");
  const [relatedViewMode, setRelatedViewMode] = useState<ViewMode>("grid");
  const [relatedFilter, setRelatedFilter] = useState<FilterStatus>("all");
  const [relatedSort, setRelatedSort] = useState<SortBy>("newest");

  // Pagination for Related Products
  const [lastRelatedDoc, setLastRelatedDoc] = useState<DocumentSnapshot | null>(
    null
  );

  const ITEMS_PER_PAGE = 8;

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

      // Try both collections
      let productDoc = await getDoc(doc(db, "shop_products", productId));
      let isShopProduct = true;

      if (!productDoc.exists()) {
        productDoc = await getDoc(doc(db, "products", productId));
        isShopProduct = false;
      }

      if (!productDoc.exists()) {
        toast.error("Ürün bulunamadı");
        router.push("/dashboard");
        return;
      }

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
      await fetchProductReviews(productId, isShopProduct);
      await fetchProductQuestions(productId, isShopProduct);
    } catch (error) {
      console.error("Error fetching product:", error);
      toast.error("Ürün bilgileri yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  }, [productId, router]);

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
        <div className="relative bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-white">
                {flowState.step === "category" && "Kategori Seç"}
                {flowState.step === "subcategory" && "Alt Kategori Seç"}
                {flowState.step === "subsubcategory" && "Alt Alt Kategori Seç"}
              </h3>
              {/* Show progress breadcrumb */}
              <div className="text-sm text-gray-400 mt-1">
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
            <button onClick={onClose} className="p-1 hover:bg-white/10 rounded">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Warning message for cascading changes */}
          {fieldType === "category" && flowState.step === "category" && (
            <div className="mb-4 p-3 bg-yellow-600/20 border border-yellow-600/30 rounded-lg">
              <p className="text-yellow-300 text-sm">
                ⚠️ Kategori değiştirildiğinde alt kategori ve alt alt kategori
                de seçilmelidir.
              </p>
            </div>
          )}
          {fieldType === "subcategory" && flowState.step === "subcategory" && (
            <div className="mb-4 p-3 bg-yellow-600/20 border border-yellow-600/30 rounded-lg">
              <p className="text-yellow-300 text-sm">
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
                    : "bg-white/10 text-gray-300 hover:bg-white/15"
                }`}
              >
                {option}
              </button>
            ))}
          </div>

          {options.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-400">Bu kategoride seçenek bulunmuyor</p>
            </div>
          )}

          <div className="flex gap-2">
            {/* Back button */}
            {flowState.step !== "category" &&
              fieldType !== "subsubcategory" && (
                <button
                  onClick={handleBack}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  Geri
                </button>
              )}

            {/* Next/Save button */}
            {isLastStep() ? (
              <button
                onClick={handleSave}
                disabled={!canProceed()}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-600/50 text-white rounded-lg transition-colors"
              >
                Kaydet
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={!canProceed()}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-lg transition-colors"
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

      // Debug logging - let's see what we have
      console.log("=== BOOST DEBUG INFO ===");
      console.log("Product data:", {
        id: product.id,
        shopId: product.shopId,
        userId: product.userId,
        isBoosted: product.isBoosted,
        boostEndTime: product.boostEndTime,
      });

      // Check current user's auth state
      const { currentUser } = auth;
      console.log("Current user:", {
        uid: currentUser?.uid,
        email: currentUser?.email,
      });

      // Check shop data if available
      if (shop) {
        console.log("Shop data:", {
          id: shop.id,
          ownerId: shop.ownerId,
          name: shop.name,
        });
      }

      // Determine collection and shopId
      const collection = product.shopId ? "shop_products" : "products";

      // CRITICAL FIX: Ensure shopId is provided for shop_products
      if (collection === "shop_products" && !product.shopId) {
        throw new Error("Shop products must have a shopId");
      }

      // Build the item object according to cloud function requirements
      const item: {
        itemId: string;
        collection: string;
        shopId?: string;
      } = {
        itemId: productId,
        collection: collection,
      };

      // Only add shopId if it exists and collection is shop_products
      if (collection === "shop_products" && product.shopId) {
        item.shopId = product.shopId;
      }

      const request = {
        items: [item],
        boostDuration: durationInMinutes,
      };

      console.log("Request payload:", JSON.stringify(request, null, 2));
      console.log("=== END DEBUG INFO ===");

      const result = await boostProducts(request);

      console.log("Boost result:", result.data);

      // Check if the response indicates success
      if (result.data && (result.data as { success: boolean }).success) {
        // Update local product state
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
        // Handle case where cloud function returns success: false
        throw new Error(
          (result.data as { message: string }).message ||
            "Boost işlemi başarısız oldu"
        );
      }
    } catch (error: unknown) {
      console.error("=== BOOST ERROR ===");
      console.error("Full error object:", error);

      let errorMessage = "Boost işlemi sırasında hata oluştu";

      // Better error handling
      if (error && typeof error === "object") {
        if ("code" in error) {
          const errorCode = (error as { code: string }).code;
          console.error("Error code:", errorCode);

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
          console.error("Error message:", message);

          // Extract more specific error messages
          if (message.includes("No valid items found")) {
            errorMessage = `Ürün boost edilemedi. Olası nedenler:
            • Ürün zaten boost edilmiş olabilir
            • Bu mağaza için yetkiniz bulunmuyor olabilir
            • Ürün geçerli olmayabilir`;
          } else if (message.includes("permissions")) {
            errorMessage = "Bu ürünü boost etme yetkiniz yok";
          } else if (message.includes("shopId")) {
            errorMessage = "Mağaza ürünü için geçerli mağaza ID'si gerekli";
          } else {
            errorMessage = message;
          }
        }
      }

      console.error("=== END BOOST ERROR ===");
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

    // Determine which collection to update
    const collectionName = product?.shopId ? "shop_products" : "products";

    // Update the specific field in Firestore
    const productRef = doc(db, collectionName, productId);
    await updateDoc(productRef, {
      [field]: value,
      updatedAt: Timestamp.now(),
    });

    // Update local state
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

      // Apply all the changes
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

  // Fetch product reviews
  const fetchProductReviews = useCallback(
    async (prodId: string, isShopProduct: boolean) => {
      try {
        setReviewsLoading(true);
        const collection_name = isShopProduct ? "shop_products" : "products";

        const reviewsQuery = query(
          collection(db, collection_name, prodId, "reviews"),
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
    async (prodId: string, isShopProduct: boolean) => {
      try {
        setQuestionsLoading(true);
        const collection_name = isShopProduct ? "shop_products" : "products";

        const questionsQuery = query(
          collection(db, collection_name, prodId, "product_questions"),
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

  // Fetch related products
  const fetchRelatedProducts = useCallback(
    async (append = false) => {
      if (!product || relatedLoading) return;

      try {
        setRelatedLoading(true);

        let q = query(
          collection(db, "shop_products"),
          where("shopId", "==", product.shopId),
          orderBy(
            relatedSort === "newest"
              ? "createdAt"
              : relatedSort === "oldest"
              ? "createdAt"
              : relatedSort === "price_high"
              ? "price"
              : relatedSort === "price_low"
              ? "price"
              : "clickCount",
            relatedSort === "oldest" || relatedSort === "price_low"
              ? "asc"
              : "desc"
          ),
          limit(ITEMS_PER_PAGE)
        );

        // Apply pagination
        if (append && lastRelatedDoc) {
          q = query(q, startAfter(lastRelatedDoc));
        }

        const snapshot = await getDocs(q);
        const newProducts = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() } as ProductData))
          .filter((p) => p.id !== product.id); // Exclude current product

        if (append) {
          setRelatedProducts((prev) => [...prev, ...newProducts]);
        } else {
          setRelatedProducts(newProducts);
          setLastRelatedDoc(null);
        }

        // Set last document for pagination
        if (newProducts.length > 0) {
          setLastRelatedDoc(snapshot.docs[snapshot.docs.length - 1]);
        }
      } catch (error) {
        console.error("Error fetching related products:", error);
        toast.error("İlgili ürünler yüklenirken hata oluştu");
      } finally {
        setRelatedLoading(false);
      }
    },
    [product, relatedSort, lastRelatedDoc, relatedLoading]
  );

  // Filter related products
  const filteredRelatedProducts = useMemo(() => {
    let filtered = relatedProducts;

    // Apply search filter
    if (relatedSearch.trim()) {
      const searchTerm = relatedSearch.toLowerCase().trim();
      filtered = filtered.filter(
        (product) =>
          product.productName?.toLowerCase().includes(searchTerm) ||
          product.category?.toLowerCase().includes(searchTerm) ||
          product.brandModel?.toLowerCase().includes(searchTerm)
      );
    }

    // Apply status filter
    if (relatedFilter !== "all") {
      filtered = filtered.filter((product) => {
        switch (relatedFilter) {
          case "active":
            return !product.sold;
          case "sold":
            return product.sold;
          case "featured":
            return product.isFeatured || product.isBoosted;
          default:
            return true;
        }
      });
    }

    return filtered;
  }, [relatedProducts, relatedSearch, relatedFilter]);

  const filteredQuestions = useMemo(() => {
    if (questionFilter === "all") {
      return questions;
    }
    return questions.filter((question) => question.answered);
  }, [questions, questionFilter]);

  // Handle color selection
  const handleColorSelect = (color: string) => {
    if (selectedColor === color) {
      setSelectedColor(null);
      setSelectedImageIndex(0);
    } else {
      setSelectedColor(color);
      setSelectedImageIndex(0);
    }
  };

  // Format price
  const formatPrice = (price: number, currency: string = "TRY") => {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: currency === "TL" ? "TRY" : currency,
      minimumFractionDigits: 0,
    }).format(price);
  };

  // Effects
  useEffect(() => {
    fetchProductData();
  }, [fetchProductData]);

  useEffect(() => {
    if (product && product.shopId) {
      setRelatedProducts([]);
      setLastRelatedDoc(null);
      fetchRelatedProducts();
    }
  }, [product]);

  // Reset related products when sort changes
  useEffect(() => {
    if (product && product.shopId) {
      setRelatedProducts([]);
      setLastRelatedDoc(null);
      fetchRelatedProducts();
    }
  }, [relatedSort]);

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
          // Boost has expired
          setTimeRemaining({ days: 0, hours: 0, minutes: 0, seconds: 0 });
          // Update the product state to reflect that boost has ended
          setProduct((prev) => (prev ? { ...prev, isBoosted: false } : null));
        }
      };

      // Update immediately
      updateCountdown();

      // Update every second
      const interval = setInterval(updateCountdown, 1000);

      return () => clearInterval(interval);
    }, [boostEndTime]);

    const formatTime = (time: number) => time.toString().padStart(2, "0");

    return (
      <div className="p-2 bg-gradient-to-r from-purple-600/90 to-pink-600/90 text-white rounded-lg shadow-lg backdrop-blur-sm border border-purple-500/50">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="w-4 h-4 animate-pulse" />
          <span className="text-xs font-medium">Boost Aktif</span>
        </div>
        <div className="text-xs font-mono">
          {timeRemaining.days > 0 && <span>{timeRemaining.days}g </span>}
          {formatTime(timeRemaining.hours)}:{formatTime(timeRemaining.minutes)}:
          {formatTime(timeRemaining.seconds)}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="flex items-center gap-3 text-white">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Ürün bilgileri yükleniyor...</span>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center text-white">
          <h2 className="text-xl font-semibold mb-2">Ürün Bulunamadı</h2>
          <p className="text-gray-400">Aradığınız ürün mevcut değil.</p>
        </div>
      </div>
    );
  }

  // Add this new component after the EditableField component definition:

  const AllFieldsDisplay = ({
    product,
    onFieldSave,
    savingField,
    setSavingField,
  }: {
    product: ProductData;
    onFieldSave: (
      field: string,
      value: string | number | boolean
    ) => Promise<void>;
    savingField: string | null;
    setSavingField: (field: string | null) => void;
  }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [editingField, setEditingField] = useState<string | null>(null);
    const [editValue, setEditValue] = useState<string>("");

    // Function to format field values based on their type
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
            // Firestore Timestamp
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

    // Function to get color based on type
    const getTypeColor = (type: string): string => {
      switch (type) {
        case "string":
          return "text-green-400";
        case "number":
          return "text-blue-400";
        case "boolean":
          return "text-purple-400";
        case "timestamp":
          return "text-yellow-400";
        case "date":
          return "text-yellow-400";
        case "array":
          return "text-orange-400";
        case "object":
          return "text-pink-400";
        case "null":
          return "text-gray-500";
        case "undefined":
          return "text-gray-500";
        default:
          return "text-white";
      }
    };

    // Get all fields from the product object
    const getAllFields = () => {
      const fields: Array<{
        key: string;
        value: unknown;
        type: string;
        editable: boolean;
      }> = [];

      // Define non-editable fields
      const nonEditableFields = [
        "id",
        "createdAt",
        "updatedAt",
        "userId",
        "shopId",
      ];

      // Convert the product object to a plain object to get all fields
      const productData = { ...product } as Record<string, unknown>;

      Object.keys(productData).forEach((key) => {
        const value = productData[key];
        const { type } = formatFieldValue(value);
        const editable = !nonEditableFields.includes(key);
        fields.push({ key, value, type, editable });
      });

      // Sort fields alphabetically
      return fields.sort((a, b) => a.key.localeCompare(b.key));
    };

    // Filter fields based on search term
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

    // Start editing a field
    const startEditing = (fieldKey: string, currentValue: unknown) => {
      // Check if this is a category-related field
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

      // For other fields, use the normal editing
      setEditingField(fieldKey);
      const { display } = formatFieldValue(currentValue);
      setEditValue(display);
    };

    // Cancel editing
    const cancelEditing = () => {
      setEditingField(null);
      setEditValue("");
    };

    // Save field changes
    const saveField = async (fieldKey: string, type: string) => {
      try {
        setSavingField(fieldKey);

        let convertedValue: string | number | boolean = editValue;

        // Convert the string input to the appropriate type
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

    if (!isExpanded) {
      return (
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
          <button
            onClick={() => setIsExpanded(true)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-semibold text-white">
                Tüm Ürün Alanları
              </h3>
              <span className="text-sm text-gray-400">
                ({getAllFields().length} alan)
              </span>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <span className="text-sm">Genişlet</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </button>
        </div>
      );
    }

    return (
      <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-semibold text-white">
              Tüm Ürün Alanları
            </h3>
            <span className="text-sm text-gray-400">
              ({filteredFields.length} alan)
            </span>
          </div>
          <button
            onClick={() => setIsExpanded(false)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Alan adı veya değer ara..."
            className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Fields List */}
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {filteredFields.map((field) => {
            const { display, type } = formatFieldValue(field.value);
            const isEditing = editingField === field.key;
            const isSaving = savingField === field.key;
            const canEdit = field.editable && type !== "timestamp";

            return (
              <div
                key={field.key}
                className={`border rounded-lg p-2 transition-all group ${
                  field.editable
                    ? "border-white/10 bg-white/5 hover:border-white/20"
                    : "border-gray-600/50 bg-gray-800/20"
                } ${isEditing ? "border-blue-500/50 bg-blue-600/10" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    {/* Field Name */}
                    <div className="flex items-center gap-2 mb-0">
                      <span className="font-mono font-semibold text-blue-300">
                        {field.key}
                      </span>
                      <span
                        className={`text-xs px-2 py-1 rounded ${getTypeColor(
                          type
                        )} bg-white/10`}
                      >
                        {type}
                      </span>
                      {!field.editable && (
                        <span className="text-xs px-2 py-1 rounded bg-gray-600/50 text-gray-400">
                          Salt Okunur
                        </span>
                      )}
                      {isEditing && (
                        <span className="text-xs px-2 py-1 rounded bg-blue-600/50 text-blue-300">
                          Düzenleniyor
                        </span>
                      )}
                    </div>

                    {/* Field Value */}
                    <div className="ml-1">
                      {isEditing ? (
                        <div className="space-y-2">
                          {type === "boolean" ? (
                            <select
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full p-2 bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              disabled={isSaving}
                            >
                              <option value="true">true</option>
                              <option value="false">false</option>
                            </select>
                          ) : type === "array" || type === "object" ? (
                            <textarea
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full p-2 bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                              rows={4}
                              placeholder="JSON formatında giriniz"
                              disabled={isSaving}
                            />
                          ) : (
                            <input
                              type={type === "number" ? "number" : "text"}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full p-2 bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              disabled={isSaving}
                            />
                          )}

                          {/* Edit Actions */}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => saveField(field.key, type)}
                              disabled={isSaving}
                              className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-green-600/50 text-white rounded text-sm transition-colors flex items-center gap-1"
                            >
                              {isSaving ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Check className="w-3 h-3" />
                              )}
                              Kaydet
                            </button>
                            <button
                              onClick={cancelEditing}
                              disabled={isSaving}
                              className="px-3 py-1 bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 text-white rounded text-sm transition-colors flex items-center gap-1"
                            >
                              <X className="w-3 h-3" />
                              İptal
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono text-sm ${getTypeColor(
                              type
                            )} flex-1`}
                          >
                            {type === "array" || type === "object" ? (
                              <details className="group">
                                <summary className="cursor-pointer hover:text-white transition-colors">
                                  {type === "array"
                                    ? `Array(${
                                        Array.isArray(field.value)
                                          ? (field.value as unknown as string[])
                                              .length
                                          : 0
                                      })`
                                    : `Object(${
                                        field.value &&
                                        typeof field.value === "object"
                                          ? Object.keys(field.value).length
                                          : 0
                                      })`}
                                </summary>
                                <div className="mt-2 ml-4 p-3 bg-black/20 rounded border-l-2 border-white/20">
                                  <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                                    {JSON.stringify(field.value, null, 2)}
                                  </pre>
                                </div>
                              </details>
                            ) : (
                              display
                            )}
                          </span>
                          {canEdit && (
                            <button
                              onClick={() =>
                                startEditing(field.key, field.value)
                              }
                              className="p-1 hover:bg-white/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                              title={
                                [
                                  "category",
                                  "subcategory",
                                  "subsubcategory",
                                ].includes(field.key)
                                  ? "Seçeneklerden seç"
                                  : "Düzenle"
                              }
                            >
                              {[
                                "category",
                                "subcategory",
                                "subsubcategory",
                              ].includes(field.key) ? (
                                <Grid className="w-3 h-3 text-blue-400" />
                              ) : (
                                <Edit className="w-3 h-3 text-blue-400" />
                              )}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Copy Button */}
                  {!isEditing && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(
                          type === "array" || type === "object"
                            ? JSON.stringify(field.value, null, 2)
                            : String(field.value)
                        );
                        toast.success("Kopyalandı!");
                      }}
                      className="p-1 hover:bg-white/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                      title="Değeri kopyala"
                    >
                      <Copy className="w-4 h-4 text-gray-400" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* No Results */}
        {filteredFields.length === 0 && (
          <div className="text-center py-8">
            <Search className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-400">
              Arama kriterinize uygun alan bulunamadı
            </p>
          </div>
        )}

        {/* Summary */}
        <div className="mt-4 pt-4 border-t border-white/20">
          <div className="flex flex-wrap gap-4 text-sm text-gray-400">
            <span>Toplam: {getAllFields().length} alan</span>
            <span>Gösterilen: {filteredFields.length} alan</span>
            <span>
              Düzenlenebilir: {getAllFields().filter((f) => f.editable).length}{" "}
              alan
            </span>
            <span>Ürün ID: {product.id}</span>
            {editingField && (
              <span className="text-blue-400">Düzenlenen: {editingField}</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const ProductCard = ({
    product: relatedProduct,
    viewMode,
    isLast = false,
  }: {
    product: ProductData;
    viewMode: ViewMode;
    isLast?: boolean;
  }) => {
    // Add click handler
    const handleProductClick = () => {
      router.push(`/productdetails?productId=${relatedProduct.id}`);
    };

    if (viewMode === "list") {
      return (
        <div
          ref={isLast ? lastRelatedProductElementRef : null}
          onClick={handleProductClick}
          className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4 transition-all duration-200 hover:bg-white/15 hover:border-white/30 cursor-pointer hover:border-blue-500/50 hover:scale-[1.02] group"
        >
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
              {relatedProduct.imageUrls?.[0] ? (
                <Image
                  src={relatedProduct.imageUrls[0]}
                  alt={relatedProduct.productName || "Product"}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                  <ImageIcon className="w-8 h-8 text-gray-400" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-white truncate group-hover:text-blue-300">
                {relatedProduct.productName || "Ürün Adı Yok"}
              </h3>
              <p className="text-sm text-gray-400">
                {relatedProduct.brandModel || "Marka Model Yok"}
              </p>
              <div className="flex items-center gap-4 mt-1">
                <span className="text-lg font-bold text-green-400">
                  {formatPrice(
                    relatedProduct.price || 0,
                    relatedProduct.currency || "TRY"
                  )}
                </span>
                <span className="text-xs text-gray-400">
                  {relatedProduct.condition || "Durum Belirtilmemiş"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-6 text-sm text-gray-400">
              <div className="flex items-center gap-1">
                <Eye className="w-4 h-4" />
                <span>{relatedProduct.clickCount || 0}</span>
              </div>
              <div className="flex items-center gap-1">
                <Heart className="w-4 h-4" />
                <span>{relatedProduct.favoritesCount || 0}</span>
              </div>
              <div className="flex items-center gap-1">
                <ShoppingBag className="w-4 h-4" />
                <span>{relatedProduct.purchaseCount || 0}</span>
              </div>
            </div>

            {/* Add visual indicator for clickable item */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <ExternalLink className="w-5 h-5 text-blue-400" />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        ref={isLast ? lastRelatedProductElementRef : null}
        onClick={handleProductClick}
        className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl overflow-hidden transition-all duration-200 hover:bg-white/15 hover:border-white/30 hover:shadow-lg group cursor-pointer hover:border-blue-500/50 hover:scale-[1.02]"
      >
        <div className="relative aspect-square">
          {relatedProduct.imageUrls?.[0] ? (
            <Image
              src={relatedProduct.imageUrls[0]}
              alt={relatedProduct.productName || "Product"}
              fill
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gray-700 flex items-center justify-center">
              <ImageIcon className="w-12 h-12 text-gray-400" />
            </div>
          )}

          {(relatedProduct.isFeatured || relatedProduct.isBoosted) && (
            <div className="absolute top-2 left-2 flex flex-col gap-1">
              {relatedProduct.isFeatured && (
                <span className="px-2 py-1 bg-yellow-600/90 text-white text-xs rounded">
                  ÖNE ÇIKAN
                </span>
              )}
              {relatedProduct.isBoosted && (
                <span className="px-2 py-1 bg-purple-600/90 text-white text-xs rounded">
                  BOOST
                </span>
              )}
            </div>
          )}

          {/* Add visual indicator for clickable item */}
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="p-1 bg-blue-600/90 rounded-full">
              <ExternalLink className="w-3 h-3 text-white" />
            </div>
          </div>
        </div>

        <div className="p-4">
          <h3 className="font-semibold text-white mb-1 line-clamp-2 group-hover:text-blue-300">
            {relatedProduct.productName || "Ürün Adı Yok"}
          </h3>
          <p className="text-sm text-gray-400 mb-2">
            {relatedProduct.brandModel || "Marka Model Yok"}
          </p>
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-green-400">
              {formatPrice(
                relatedProduct.price || 0,
                relatedProduct.currency || "TRY"
              )}
            </span>
            <span className="text-xs text-gray-400">
              {relatedProduct.condition || "Durum Belirtilmemiş"}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="backdrop-blur-xl bg-white/10 border-b border-white/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4 py-4">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-white">Ürün Detayları</h1>
              <p className="text-sm text-gray-400">{product.productName}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Product Details Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Product Images */}
          <div className="space-y-4">
            {/* Main Image */}
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl overflow-hidden">
              <div className="relative aspect-square">
                {currentImageUrls[selectedImageIndex] ? (
                  <Image
                    src={currentImageUrls[selectedImageIndex]}
                    alt={product.productName || "Product"}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                    <ImageIcon className="w-16 h-16 text-gray-400" />
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
                      className="absolute left-2 top-1/2 transform -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() =>
                        setSelectedImageIndex((prev) =>
                          prev < currentImageUrls.length - 1 ? prev + 1 : 0
                        )
                      }
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4 rotate-180" />
                    </button>
                  </>
                )}

                <div className="absolute top-2 right-2">
                  {!product.isBoosted ? (
                    <button
                      onClick={() => setShowBoostModal(true)}
                      className="p-2 bg-purple-600/90 hover:bg-purple-700/90 text-white rounded-lg transition-colors shadow-lg backdrop-blur-sm border border-purple-500/50 flex items-center gap-2"
                      title="Ürünü Öne Çıkar"
                    >
                      <Zap className="w-4 h-4" />
                      <span className="text-sm font-medium">Boost</span>
                    </button>
                  ) : // Replace the old static boost active div with the countdown component
                  product.boostEndTime ? (
                    <BoostCountdown boostEndTime={product.boostEndTime} />
                  ) : (
                    <div className="p-2 bg-gradient-to-r from-purple-600/90 to-pink-600/90 text-white rounded-lg shadow-lg backdrop-blur-sm border border-purple-500/50 flex items-center gap-2">
                      <Zap className="w-4 h-4 animate-pulse" />
                      <span className="text-sm font-medium">Boost Aktif</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Image Thumbnails */}
            {currentImageUrls.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {currentImageUrls.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImageIndex(index)}
                    className={`relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-colors ${
                      selectedImageIndex === index
                        ? "border-blue-400"
                        : "border-white/20 hover:border-white/40"
                    }`}
                  >
                    <Image
                      src={image}
                      alt={`Product thumbnail ${index + 1}`}
                      fill
                      className="object-cover"
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Color Selection */}
            {product.availableColors && product.availableColors.length > 0 && (
              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <Palette className="w-4 h-4" />
                  Mevcut Renkler
                </h3>
                <div className="flex flex-wrap gap-2">
                  {product.availableColors.map((color, index) => (
                    <button
                      key={index}
                      onClick={() => handleColorSelect(color)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        selectedColor === color
                          ? "bg-blue-600 text-white border-2 border-blue-400"
                          : "bg-white/10 text-gray-300 border-2 border-white/20 hover:bg-white/15 hover:border-white/30"
                      }`}
                    >
                      {color}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Size Selection */}
            {product.availableSizes && product.availableSizes.length > 0 && (
              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <Ruler className="w-4 h-4" />
                  Mevcut Bedenler
                </h3>
                <div className="flex flex-wrap gap-2">
                  {product.availableSizes.map((size, index) => (
                    <span
                      key={index}
                      className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-sm text-gray-300"
                    >
                      {size}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Product Information */}
          <div className="space-y-6">
            <AllFieldsDisplay
              product={product}
              onFieldSave={saveIndividualField}
              savingField={savingField}
              setSavingField={setSavingField}
            />

            {/* Statistics */}
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">
                İstatistikler
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-blue-400" />
                    <span className="text-sm text-gray-300">Görüntülenme</span>
                  </div>
                  <span className="text-white font-semibold">
                    {product.clickCount || 0}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Heart className="w-4 h-4 text-red-400" />
                    <span className="text-sm text-gray-300">Beğeni</span>
                  </div>
                  <span className="text-white font-semibold">
                    {product.favoritesCount || 0}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-green-400" />
                    <span className="text-sm text-gray-300">Sepete Ekleme</span>
                  </div>
                  <span className="text-white font-semibold">
                    {product.cartCount || 0}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-purple-400" />
                    <span className="text-sm text-gray-300">Satın Alma</span>
                  </div>
                  <span className="text-white font-semibold">
                    {product.purchaseCount || 0}
                  </span>
                </div>

                <div className="flex items-center justify-between col-span-2">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-yellow-400" />
                    <span className="text-sm text-gray-300">Ortalama Puan</span>
                  </div>
                  <span className="text-white font-semibold">
                    {product.averageRating
                      ? product.averageRating.toFixed(1)
                      : "0.0"}
                    <span className="text-gray-400 text-xs ml-1">
                      ({product.reviewCount || 0} değerlendirme)
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {/* Shop & Seller Info */}
            <div className="space-y-4">
              {/* Shop Info */}
              {shop && (
                <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
                  <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <Store className="w-5 h-5" />
                    Mağaza Bilgileri
                  </h3>
                  <div className="flex items-center gap-4">
                    <div className="relative w-12 h-12 rounded-full overflow-hidden flex-shrink-0">
                      {shop.profileImageUrl ? (
                        <Image
                          src={shop.profileImageUrl}
                          alt={shop.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                          <Store className="w-6 h-6 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-white">
                          {shop.name}
                        </h4>
                        {shop.verified && (
                          <Badge className="w-4 h-4 text-blue-400" />
                        )}
                        {shop.isBoosted && (
                          <span className="px-2 py-1 bg-purple-600/20 text-purple-400 text-xs rounded">
                            BOOST
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-400">
                        <div className="flex items-center gap-1">
                          <Star className="w-3 h-3 text-yellow-400" />
                          <span>{shop.averageRating?.toFixed(1) || "0.0"}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          <span>{shop.followerCount || 0} takipçi</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          <span>{shop.totalProductsSold || 0} satış</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        router.push(`/shopdetails?shopId=${shop.id}`)
                      }
                      className="p-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Additional Info */}
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <Info className="w-5 h-5" />
                Ek Bilgiler
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300">Oluşturulma Tarihi</span>
                  <span className="text-white">
                    {product.createdAt?.toDate().toLocaleDateString("tr-TR")}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-300">Son Güncelleme</span>
                  <span className="text-white">
                    {product.updatedAt?.toDate().toLocaleDateString("tr-TR")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Reviews and Questions Section */}
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-6 mb-8">
          {/* Tab Headers */}
          <div className="flex items-center gap-4 mb-6 border-b border-white/20">
            <button
              onClick={() => setActiveTab("reviews")}
              className={`pb-3 px-1 text-sm font-medium transition-colors relative ${
                activeTab === "reviews"
                  ? "text-white border-b-2 border-blue-400"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4" />
                Değerlendirmeler ({reviews.length})
              </div>
            </button>

            <button
              onClick={() => setActiveTab("questions")}
              className={`pb-3 px-1 text-sm font-medium transition-colors relative ${
                activeTab === "questions"
                  ? "text-white border-b-2 border-blue-400"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4" />
                Sorular ({questions.length})
              </div>
            </button>
          </div>

          {/* Reviews Tab Content */}
          {activeTab === "reviews" && (
            <div>
              {reviewsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                  <span className="text-gray-400 ml-2">
                    Değerlendirmeler yükleniyor...
                  </span>
                </div>
              ) : reviews.length > 0 ? (
                <div className="space-y-4">
                  {reviews.map((review) => (
                    <div
                      key={review.id}
                      className="p-4 bg-white/5 rounded-lg border border-white/10"
                    >
                      <div className="flex items-start gap-3">
                        <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                          {review.userImage ? (
                            <Image
                              src={review.userImage}
                              alt={review.userName}
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                              <User className="w-5 h-5 text-gray-400" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-white text-sm">
                              {review.userName}
                            </h4>
                            {review.verified && (
                              <Badge className="w-3 h-3 text-blue-400" />
                            )}
                            <div className="flex items-center gap-1">
                              {[...Array(5)].map((_, i) => (
                                <Star
                                  key={i}
                                  className={`w-3 h-3 ${
                                    i < review.rating
                                      ? "text-yellow-400 fill-current"
                                      : "text-gray-600"
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                          <p className="text-gray-300 text-sm mb-2">
                            {review.review}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-gray-400">
                            <span>
                              {review.timestamp
                                ?.toDate()
                                .toLocaleDateString("tr-TR")}
                            </span>
                            <div className="flex items-center gap-1">
                              <Heart className="w-3 h-3" />
                              <span>{review.likes?.length || 0}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <MessageCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-400">
                    Henüz değerlendirme bulunmuyor
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Questions Tab Content */}
          {activeTab === "questions" && (
            <div>
              {/* Question Filter Toggle */}
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => setQuestionFilter("all")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    questionFilter === "all"
                      ? "bg-blue-600 text-white"
                      : "bg-white/10 text-gray-300 hover:bg-white/15 hover:text-white"
                  }`}
                >
                  Hepsi ({questions.length})
                </button>
                <button
                  onClick={() => setQuestionFilter("answered")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    questionFilter === "answered"
                      ? "bg-blue-600 text-white"
                      : "bg-white/10 text-gray-300 hover:bg-white/15 hover:text-white"
                  }`}
                >
                  Cevaplananlar ({questions.filter((q) => q.answered).length})
                </button>
              </div>

              {/* Questions List */}
              {questionsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                  <span className="text-gray-400 ml-2">
                    Sorular yükleniyor...
                  </span>
                </div>
              ) : filteredQuestions.length > 0 ? (
                <div className="space-y-4">
                  {filteredQuestions.map((question) => (
                    <div
                      key={question.id}
                      className="p-4 bg-white/5 rounded-lg border border-white/10"
                    >
                      {/* Question */}
                      <div className="mb-3">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold text-white text-sm">
                            {question.askerNameVisible
                              ? question.askerName
                              : "Anonim"}
                          </h4>
                          <span className="text-xs text-gray-400">
                            {question.timestamp
                              ?.toDate()
                              .toLocaleDateString("tr-TR")}
                          </span>
                        </div>
                        <p className="text-gray-300 text-sm">
                          {question.questionText}
                        </p>
                      </div>

                      {/* Answer */}
                      {question.answered && question.answerText && (
                        <div className="ml-4 pl-4 border-l-2 border-blue-400/30 bg-white/5 rounded-r-lg p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="relative w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
                              {question.answererProfileImage ? (
                                <Image
                                  src={question.answererProfileImage}
                                  alt="Seller"
                                  fill
                                  className="object-cover"
                                />
                              ) : (
                                <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                                  <User className="w-3 h-3 text-gray-400" />
                                </div>
                              )}
                            </div>
                            <h5 className="font-semibold text-blue-300 text-sm">
                              {question.answererName || shop?.name || "Satıcı"}
                            </h5>
                            <span className="text-xs text-gray-400">
                              {question.answerTimestamp
                                ?.toDate()
                                .toLocaleDateString("tr-TR")}
                            </span>
                          </div>
                          <p className="text-gray-300 text-sm">
                            {question.answerText}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <MessageCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-400">
                    {questionFilter === "all"
                      ? "Henüz soru bulunmuyor"
                      : "Henüz cevaplanmış soru bulunmuyor"}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Related Products Section */}
        {product.shopId && (
          <div className="space-y-6">
            {/* Related Product Controls */}
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">
                  Mağazadaki Diğer Ürünler
                </h2>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Package className="w-4 h-4" />
                  <span>{filteredRelatedProducts.length} ürün</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={relatedSearch}
                      onChange={(e) => setRelatedSearch(e.target.value)}
                      placeholder="Ürün ara..."
                      className="pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
                    />
                  </div>

                  {/* Filter */}
                  <select
                    value={relatedFilter}
                    onChange={(e) =>
                      setRelatedFilter(e.target.value as FilterStatus)
                    }
                    className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ color: "white" }}
                  >
                    <option
                      value="all"
                      style={{ backgroundColor: "#1f2937", color: "white" }}
                    >
                      Tüm Ürünler
                    </option>
                    <option
                      value="active"
                      style={{ backgroundColor: "#1f2937", color: "white" }}
                    >
                      Aktif
                    </option>
                    <option
                      value="sold"
                      style={{ backgroundColor: "#1f2937", color: "white" }}
                    >
                      Satılan
                    </option>
                    <option
                      value="featured"
                      style={{ backgroundColor: "#1f2937", color: "white" }}
                    >
                      Öne Çıkan
                    </option>
                  </select>

                  {/* Sort */}
                  <select
                    value={relatedSort}
                    onChange={(e) => setRelatedSort(e.target.value as SortBy)}
                    className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ color: "white" }}
                  >
                    <option
                      value="newest"
                      style={{ backgroundColor: "#1f2937", color: "white" }}
                    >
                      En Yeni
                    </option>
                    <option
                      value="oldest"
                      style={{ backgroundColor: "#1f2937", color: "white" }}
                    >
                      En Eski
                    </option>
                    <option
                      value="price_high"
                      style={{ backgroundColor: "#1f2937", color: "white" }}
                    >
                      Fiyat: Yüksek → Düşük
                    </option>
                    <option
                      value="price_low"
                      style={{ backgroundColor: "#1f2937", color: "white" }}
                    >
                      Fiyat: Düşük → Yüksek
                    </option>
                    <option
                      value="popular"
                      style={{ backgroundColor: "#1f2937", color: "white" }}
                    >
                      En Popüler
                    </option>
                  </select>
                </div>

                {/* View Mode Toggle */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRelatedViewMode("grid")}
                    className={`p-2 rounded-lg transition-colors ${
                      relatedViewMode === "grid"
                        ? "bg-blue-600 text-white"
                        : "bg-white/10 text-gray-400 hover:text-white hover:bg-white/15"
                    }`}
                  >
                    <Grid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setRelatedViewMode("list")}
                    className={`p-2 rounded-lg transition-colors ${
                      relatedViewMode === "list"
                        ? "bg-blue-600 text-white"
                        : "bg-white/10 text-gray-400 hover:text-white hover:bg-white/15"
                    }`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Related Products Grid/List */}
            {filteredRelatedProducts.length === 0 && !relatedLoading ? (
              <div className="text-center py-12">
                <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">
                  İlgili Ürün Bulunamadı
                </h3>
                <p className="text-gray-400">
                  {relatedSearch || relatedFilter !== "all"
                    ? "Arama kriterlerinize uygun ürün bulunamadı."
                    : "Bu mağazanın başka ürünü bulunmuyor."}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div
                  className={`grid gap-4 ${
                    relatedViewMode === "grid"
                      ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                      : "grid-cols-1"
                  }`}
                >
                  {filteredRelatedProducts.map((relatedProduct, index) => (
                    <ProductCard
                      key={relatedProduct.id}
                      product={relatedProduct}
                      viewMode={relatedViewMode}
                      isLast={index === filteredRelatedProducts.length - 1}
                    />
                  ))}
                </div>

                {/* Loading indicator for infinite scroll */}
                {relatedLoading && (
                  <div className="flex items-center justify-center py-8">
                    <div className="flex items-center gap-3 text-white">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Daha fazla ürün yükleniyor...</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Analytics Summary */}
        <div className="mt-8 backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Ürün Performans Özeti
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">
                {product.clickCount || 0}
              </div>
              <div className="text-sm text-gray-400">Görüntülenme</div>
            </div>

            <div className="text-center">
              <div className="text-2xl font-bold text-red-400">
                {product.favoritesCount || 0}
              </div>
              <div className="text-sm text-gray-400">Beğeni</div>
            </div>

            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">
                {product.cartCount || 0}
              </div>
              <div className="text-sm text-gray-400">Sepete Ekleme</div>
            </div>

            <div className="text-center">
              <div className="text-2xl font-bold text-purple-400">
                {product.purchaseCount || 0}
              </div>
              <div className="text-sm text-gray-400">Satış</div>
            </div>

            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-400">
                {product.averageRating?.toFixed(1) || "0.0"}
              </div>
              <div className="text-sm text-gray-400">Ortalama Puan</div>
            </div>
          </div>
        </div>
      </main>
      <BoostModal
        isOpen={showBoostModal}
        onClose={() => setShowBoostModal(false)}
        onBoost={handleBoostProduct}
        productName={product.productName || "Ürün"}
        isLoading={isBoostLoading}
      />
      <CategorySelectionModal
        isOpen={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        fieldType={categoryModalType}
        currentValue={String(
          product[categoryModalField as keyof ProductData] || ""
        )}
        onSave={handleCategorySave}
        currentCategory={product.category}
        currentSubcategory={product.subcategory}
      />
    </div>
  );
}

// Main component that wraps the content with Suspense
export default function ProductDetailsPage() {
  return (
    <ProtectedRoute>
      <Suspense
        fallback={
          <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
            <div className="flex items-center gap-3 text-white">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>Sayfa yükleniyor...</span>
            </div>
          </div>
        }
      >
        <ProductDetailsContent />
      </Suspense>
    </ProtectedRoute>
  );
}
