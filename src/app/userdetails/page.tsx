"use client";

import React from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { getAuth, sendPasswordResetEmail } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import {
  ArrowLeft,
  X,
  Loader2,
  User,
  ShoppingBag,
  Store,
  Edit,
  Check,
  Package,
  Search,
  Database,
  Copy,
  Mail,
  Phone,
  Calendar,
  MapPin,
  Activity,
  ClipboardList,
  Gift,
  Truck,
  Ticket,
  Trash2,
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
  orderBy as firestoreOrderBy,
  limit,
  updateDoc,
  Timestamp,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { db, functions } from "../lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { toast } from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";

// Types
interface UserData {
  id: string;
  displayName: string;
  email: string;
  phone: string;
  gender: "Male" | "Female" | "";
  profileImage?: string;
  address?: string;
  playPoints?: number;
  totalProductsSold?: number;
  averageRating?: number;
  reviewCount?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

interface ProductData {
  id: string;
  productName: string;
  price: number;
  currency: string;
  imageUrls: string[];
  sold: boolean;
}

interface ShopData {
  id: string;
  name: string;
  profileImageUrl?: string;
}

interface OrderItemData {
  id: string;
  productName: string;
  quantity: number;
  gatheringStatus?: string;
  productImage?: string;
  selectedColorImage?: string;
  sellerName?: string; // ADD THIS
  price?: number; // ADD THIS
}

interface OrderData {
  id: string;
  totalPrice: number;
  timestamp: Timestamp;
  itemCount: number;
  items: OrderItemData[];
  distributionStatus?: string;
  allItemsGathered?: boolean;
  // NEW FIELDS
  deliveryOption?: string;
  deliveryPrice?: number;
  couponCode?: string;
  couponDiscount?: number;
  freeShippingApplied?: boolean;
  itemsSubtotal?: number;
  paymentOrderId?: string;
  // For failed payments
  status?: 'completed' | 'payment_succeeded_order_failed' | 'payment_failed';
  orderError?: string;
  isFailedPayment?: boolean;
}

// Create a separate component that uses useSearchParams
function UserDetailsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId");
  const { user: authUser } = useAuth();

  // Check if current user is a full admin (not semi-admin)
  const isFullAdmin = authUser?.isAdmin === true && !authUser?.isSemiAdmin;

  // Refs
  const allFieldsContainerRef = useRef<HTMLDivElement | null>(null);

  // State Management
  const [user, setUser] = useState<UserData | null>(null);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [shops, setShops] = useState<ShopData[]>([]);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingField, setSavingField] = useState<string | null>(null);

  const [showCouponModal, setShowCouponModal] = useState(false);
const [couponAmount, setCouponAmount] = useState("");
const [couponDescription, setCouponDescription] = useState("");
const [couponExpiryDays, setCouponExpiryDays] = useState("30");
const [grantingCoupon, setGrantingCoupon] = useState(false);

// Free Shipping Modal State
const [showFreeShippingModal, setShowFreeShippingModal] = useState(false);
const [freeShippingExpiryDays, setFreeShippingExpiryDays] = useState("30");
const [grantingFreeShipping, setGrantingFreeShipping] = useState(false);

const [userCoupons, setUserCoupons] = useState<Array<{
  id: string;
  amount: number;
  currency: string;
  code: string;
  isUsed: boolean;
  createdAt: string;
  expiresAt?: string;
}>>([]);
const [userBenefits, setUserBenefits] = useState<Array<{
  id: string;
  type: string;
  isUsed: boolean;
  createdAt: string;
  expiresAt?: string;
}>>([]);

  // Search states
  const [productSearch, setProductSearch] = useState("");
  const [shopSearch, setShopSearch] = useState("");
  const [orderSearch, setOrderSearch] = useState("");

  // Orders pagination state
  const [ordersLastDoc, setOrdersLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreOrders, setHasMoreOrders] = useState(true);
  const [loadingMoreOrders, setLoadingMoreOrders] = useState(false);
  const ORDERS_PER_PAGE = 10;

  // Admin Activity Logs Modal State
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [activityLogs, setActivityLogs] = useState<Array<{
    id: string;
    time: Timestamp;
    displayName: string;
    email: string;
    activity: string;
    metadata?: {
      productName?: string;
      sellerName?: string;
      shopName?: string;
      bannerType?: string;
      adType?: string;
      path?: string;
    };
  }>>([]);
  const [activityLogsLastDoc, setActivityLogsLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreActivityLogs, setHasMoreActivityLogs] = useState(true);
  const [loadingActivityLogs, setLoadingActivityLogs] = useState(false);
  const ACTIVITY_LOGS_PER_PAGE = 20;
  const activityLogsContainerRef = useRef<HTMLDivElement | null>(null);

  const grantUserCouponCallable = httpsCallable(functions, "grantUserCoupon");
const grantFreeShippingCallable = httpsCallable(functions, "grantFreeShipping");
const getUserCouponsAndBenefitsCallable = httpsCallable(functions, "getUserCouponsAndBenefits");
const revokeCouponCallable = httpsCallable(functions, "revokeCoupon");
const revokeBenefitCallable = httpsCallable(functions, "revokeBenefit");

  // Active tab
  const [activeTab, setActiveTab] = useState<"products" | "shops" | "orders">(
    "products"
  );

  const deleteUserAccountCallable = httpsCallable(
    functions,
    "deleteUserAccount"
  );

  // Fetch user data
  const fetchUserData = useCallback(async () => {
    if (!userId) {
      toast.error("Kullanıcı ID'si bulunamadı");
      router.push("/dashboard");
      return;
    }

    try {
      setLoading(true);

      // Fetch user
      const userDoc = await getDoc(doc(db, "users", userId));
      if (!userDoc.exists()) {
        toast.error("Kullanıcı bulunamadı");
        router.push("/dashboard");
        return;
      }

      const userData = { id: userDoc.id, ...userDoc.data() } as UserData;
      setUser(userData);

      // Fetch products (limit to 50 for performance)
      const productsQuery = query(
        collection(db, "products"),
        where("userId", "==", userId),
        firestoreOrderBy("createdAt", "desc"),
        limit(50)
      );
      const productsSnapshot = await getDocs(productsQuery);
      const productsData = productsSnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as ProductData)
      );
      setProducts(productsData);

      // Fetch shops (limit to 20 for performance)
      const shopsQuery = query(
        collection(db, "shops"),
        where("ownerId", "==", userId),
        limit(20)
      );
      const shopsSnapshot = await getDocs(shopsQuery);
      const shopsData = shopsSnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as ShopData)
      );
      setShops(shopsData);

      // Fetch orders with pagination (10 at a time) and include items
      const ordersQuery = query(
        collection(db, "orders"),
        where("buyerId", "==", userId),
        firestoreOrderBy("timestamp", "desc"),
        limit(ORDERS_PER_PAGE)
      );
      const ordersSnapshot = await getDocs(ordersQuery);
      
      // Fetch items for each order
      const ordersData = await Promise.all(
        ordersSnapshot.docs.map(async (orderDoc) => {
          const orderData = orderDoc.data();
      
          // Fetch items subcollection
          const itemsSnapshot = await getDocs(
            collection(db, "orders", orderDoc.id, "items")
          );
          const items: OrderItemData[] = itemsSnapshot.docs.map((itemDoc) => {
            const data = itemDoc.data();
            return {
              id: itemDoc.id,
              productName: data.productName || "Bilinmeyen Ürün",
              quantity: data.quantity || 1,
              gatheringStatus: data.gatheringStatus,
              productImage: data.productImage,
              selectedColorImage: data.selectedColorImage,
              sellerName: data.sellerName,
              price: data.price,
            };
          });
      
          return {
            id: orderDoc.id,
            totalPrice: orderData.totalPrice,
            timestamp: orderData.timestamp,
            itemCount: orderData.itemCount || items.length,
            items,
            distributionStatus: orderData.distributionStatus,
            allItemsGathered: orderData.allItemsGathered,
            // NEW FIELDS
            deliveryOption: orderData.deliveryOption,
            deliveryPrice: orderData.deliveryPrice,
            couponCode: orderData.couponCode,
            couponDiscount: orderData.couponDiscount,
            freeShippingApplied: orderData.freeShippingApplied,
            itemsSubtotal: orderData.itemsSubtotal,
            paymentOrderId: orderData.paymentOrderId,
            status: 'completed',
          } as OrderData;
        })
      );

      const failedPaymentsQuery = query(
        collection(db, "pendingPayments"),
        where("userId", "==", userId),
        where("status", "in", ["payment_succeeded_order_failed", "payment_failed"]),
        firestoreOrderBy("createdAt", "desc"),
        limit(20)
      );
      const failedPaymentsSnapshot = await getDocs(failedPaymentsQuery);
      
      const failedPaymentsData: OrderData[] = failedPaymentsSnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          totalPrice: data.amount || 0,
          timestamp: data.createdAt,
          itemCount: data.cartData?.items?.length || 0,
          items: (data.cartData?.items || []).map((item: { productId: string; quantity?: number }, idx: number) => ({
            id: `item-${idx}`,
            productName: item.productId, // We only have productId in cartData
            quantity: item.quantity || 1,
          })),
          status: data.status,
          orderError: data.orderError,
          isFailedPayment: true,
          deliveryOption: data.cartData?.deliveryOption,
          couponCode: undefined,
          couponDiscount: 0,
          freeShippingApplied: data.cartData?.freeShippingBenefitId ? true : false,
        } as unknown as OrderData;
      });
      
      // Combine and sort by timestamp
      const allOrders = [...ordersData, ...failedPaymentsData].sort((a, b) => {
        const timeA = a.timestamp?.toDate?.() || new Date(0);
        const timeB = b.timestamp?.toDate?.() || new Date(0);
        return timeB.getTime() - timeA.getTime();
      });

      setOrders(allOrders);

      // Set pagination state
      if (ordersSnapshot.docs.length > 0) {
        setOrdersLastDoc(ordersSnapshot.docs[ordersSnapshot.docs.length - 1]);
      }
      setHasMoreOrders(ordersSnapshot.docs.length === ORDERS_PER_PAGE);
    } catch (error) {
      console.error("Error fetching user data:", error);
      toast.error("Kullanıcı verileri yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [userId, router]);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  const fetchUserCouponsAndBenefits = useCallback(async () => {
    if (!userId) return;
    try {
      const result = await getUserCouponsAndBenefitsCallable({ userId });
      const data = result.data as { coupons: typeof userCoupons; benefits: typeof userBenefits };
      setUserCoupons(data.coupons || []);
      setUserBenefits(data.benefits || []);
    } catch (error) {
      console.error("Error fetching coupons/benefits:", error);
    }
  }, [userId]);
  
  // Call on mount
  useEffect(() => {
    if (user) {
      fetchUserCouponsAndBenefits();
    }
  }, [user, fetchUserCouponsAndBenefits]);
  
  // Grant coupon handler
  const handleGrantCoupon = async () => {
    if (!user || !couponAmount) return;
    
    const amount = parseFloat(couponAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Geçerli bir tutar girin");
      return;
    }
  
    setGrantingCoupon(true);
    try {
      await grantUserCouponCallable({
        userId: user.id,
        amount: amount,
        description: couponDescription || undefined,
        expiresInDays: parseInt(couponExpiryDays) || 30,
      });
      toast.success(`${amount} TL kupon verildi!`);
      setShowCouponModal(false);
      setCouponAmount("");
      setCouponDescription("");
      fetchUserCouponsAndBenefits();
    } catch (error) {
      console.error("Error granting coupon:", error);
      toast.error("Kupon verilemedi");
    } finally {
      setGrantingCoupon(false);
    }
  };
  

  // Grant free shipping handler
  const handleGrantFreeShipping = async () => {
    if (!user) return;
  
    setGrantingFreeShipping(true);
    try {
      await grantFreeShippingCallable({
        userId: user.id,
        expiresInDays: parseInt(freeShippingExpiryDays) || 30,
      });
      toast.success("Ücretsiz kargo verildi!");
      setShowFreeShippingModal(false);
      fetchUserCouponsAndBenefits();
    } catch (error) {
      console.error("Error granting free shipping:", error);
      toast.error("Ücretsiz kargo verilemedi");
    } finally {
      setGrantingFreeShipping(false);
    }
  };
  
  // Revoke coupon handler
  const handleRevokeCoupon = async (couponId: string) => {
    if (!user) return;
    if (!window.confirm("Bu kuponu iptal etmek istediğinize emin misiniz?")) return;
  
    try {
      await revokeCouponCallable({ userId: user.id, couponId });
      toast.success("Kupon iptal edildi");
      fetchUserCouponsAndBenefits();
    } catch (error: unknown) {
      console.error("Error revoking coupon:", error);
      toast.error((error as Error).message || "Kupon iptal edilemedi");
    }
  };
  
  // Revoke benefit handler
  const handleRevokeBenefit = async (benefitId: string) => {
    if (!user) return;
    if (!window.confirm("Bu avantajı iptal etmek istediğinize emin misiniz?")) return;
  
    try {
      await revokeBenefitCallable({ userId: user.id, benefitId });
      toast.success("Avantaj iptal edildi");
      fetchUserCouponsAndBenefits();
    } catch (error: unknown) {
      console.error("Error revoking benefit:", error);
      toast.error((error as Error).message || "Avantaj iptal edilemedi");
    }
  };

  // Load more orders function for pagination
  const loadMoreOrders = useCallback(async () => {
    if (!userId || !ordersLastDoc || loadingMoreOrders || !hasMoreOrders) return;
  
    try {
      setLoadingMoreOrders(true);
  
      const ordersQuery = query(
        collection(db, "orders"),
        where("buyerId", "==", userId),
        firestoreOrderBy("timestamp", "desc"),
        startAfter(ordersLastDoc),
        limit(ORDERS_PER_PAGE)
      );
      const ordersSnapshot = await getDocs(ordersQuery);
  
      // Fetch items for each order
      const newOrdersData = await Promise.all(
        ordersSnapshot.docs.map(async (orderDoc) => {
          const orderData = orderDoc.data();
  
          // Fetch items subcollection
          const itemsSnapshot = await getDocs(
            collection(db, "orders", orderDoc.id, "items")
          );
          const items: OrderItemData[] = itemsSnapshot.docs.map((itemDoc) => {
            const data = itemDoc.data();
            return {
              id: itemDoc.id,
              productName: data.productName || "Bilinmeyen Ürün",
              quantity: data.quantity || 1,
              gatheringStatus: data.gatheringStatus,
              productImage: data.productImage,
              selectedColorImage: data.selectedColorImage,
              sellerName: data.sellerName,
              price: data.price,
            };
          });
  
          return {
            id: orderDoc.id,
            totalPrice: orderData.totalPrice,
            timestamp: orderData.timestamp,
            itemCount: orderData.itemCount || items.length,
            items,
            distributionStatus: orderData.distributionStatus,
            allItemsGathered: orderData.allItemsGathered,
            // NEW FIELDS
            deliveryOption: orderData.deliveryOption,
            deliveryPrice: orderData.deliveryPrice,
            couponCode: orderData.couponCode,
            couponDiscount: orderData.couponDiscount,
            freeShippingApplied: orderData.freeShippingApplied,
            itemsSubtotal: orderData.itemsSubtotal,
            paymentOrderId: orderData.paymentOrderId,
            status: 'completed' as const,
          } as OrderData;
        })
      );
  
      // Append new orders to existing ones
      setOrders((prev) => [...prev, ...newOrdersData]);
  
      // Update pagination state
      if (ordersSnapshot.docs.length > 0) {
        setOrdersLastDoc(ordersSnapshot.docs[ordersSnapshot.docs.length - 1]);
      }
      setHasMoreOrders(ordersSnapshot.docs.length === ORDERS_PER_PAGE);
    } catch (error) {
      console.error("Error loading more orders:", error);
      toast.error("Daha fazla sipariş yüklenemedi");
    } finally {
      setLoadingMoreOrders(false);
    }
  }, [userId, ordersLastDoc, loadingMoreOrders, hasMoreOrders]);

  // Fetch admin activity logs for the specific user being viewed
  const fetchActivityLogs = useCallback(async (isInitial = true) => {
    if (loadingActivityLogs) return;
    if (!isInitial && !hasMoreActivityLogs) return;
    if (!user?.email) return; // Need the user's email to filter

    try {
      setLoadingActivityLogs(true);

      let logsQuery;
      if (isInitial || !activityLogsLastDoc) {
        logsQuery = query(
          collection(db, "admin_activity_logs"),
          where("email", "==", user.email),
          firestoreOrderBy("time", "desc"),
          limit(ACTIVITY_LOGS_PER_PAGE)
        );
      } else {
        logsQuery = query(
          collection(db, "admin_activity_logs"),
          where("email", "==", user.email),
          firestoreOrderBy("time", "desc"),
          startAfter(activityLogsLastDoc),
          limit(ACTIVITY_LOGS_PER_PAGE)
        );
      }

      const snapshot = await getDocs(logsQuery);
      const logs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Array<{
        id: string;
        time: Timestamp;
        displayName: string;
        email: string;
        activity: string;
      }>;

      if (isInitial) {
        setActivityLogs(logs);
      } else {
        setActivityLogs((prev) => [...prev, ...logs]);
      }

      if (snapshot.docs.length > 0) {
        setActivityLogsLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      }
      setHasMoreActivityLogs(snapshot.docs.length === ACTIVITY_LOGS_PER_PAGE);
    } catch (error) {
      console.error("Error fetching activity logs:", error);
      toast.error("Aktivite logları yüklenemedi");
    } finally {
      setLoadingActivityLogs(false);
    }
  }, [loadingActivityLogs, hasMoreActivityLogs, activityLogsLastDoc, ACTIVITY_LOGS_PER_PAGE, user?.email]);

  // Open activity modal and fetch logs
  const openActivityModal = useCallback(() => {
    setShowActivityModal(true);
    setActivityLogs([]);
    setActivityLogsLastDoc(null);
    setHasMoreActivityLogs(true);
    fetchActivityLogs(true);
  }, [fetchActivityLogs]);

  // Handle scroll for infinite loading
  const handleActivityScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const bottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 100;
    if (bottom && hasMoreActivityLogs && !loadingActivityLogs) {
      fetchActivityLogs(false);
    }
  }, [hasMoreActivityLogs, loadingActivityLogs, fetchActivityLogs]);

  // Save individual field
  const saveIndividualField = async (
    field: string,
    value: string | number | boolean | string[]
  ) => {
    if (!user) return;

    try {
      setSavingField(field);

      await updateDoc(doc(db, "users", user.id), {
        [field]: value,
        updatedAt: Timestamp.now(),
      });

      setUser((prev) => (prev ? { ...prev, [field]: value } : null));
      toast.success(`${field} güncellendi!`);
    } catch (error) {
      console.error("Error updating field:", error);
      toast.error(`${field} güncellenirken hata oluştu`);
    } finally {
      setSavingField(null);
    }
  };

  // Handle password reset
  const handleResetPassword = async () => {
    if (!user?.email) return;

    if (
      !window.confirm(
        `${user.email} adresine şifre sıfırlama e-postası gönderilecek. Devam edilsin mi?`
      )
    ) {
      return;
    }

    try {
      const auth = getAuth();
      await sendPasswordResetEmail(auth, user.email);
      toast.success("Şifre sıfırlama e-postası gönderildi!");
    } catch (error) {
      console.error("Error sending password reset email:", error);
      toast.error("Şifre sıfırlama e-postası gönderilemedi");
    }
  };

  // Handle delete account
  const handleDeleteAccount = async () => {
    if (!user) return;

    const confirmText = window.prompt(
      `Bu kullanıcının hesabını silmek istediğinize emin misiniz?\n\nOnaylamak için kullanıcının e-postasını yazın: ${user.email}`
    );

    if (confirmText !== user.email) {
      toast.error("E-posta adresi eşleşmiyor");
      return;
    }

    try {
      await deleteUserAccountCallable({ userId: user.id });
      toast.success("Kullanıcı hesabı silindi");
      router.push("/dashboard");
    } catch (error) {
      console.error("Error deleting account:", error);
      toast.error("Hesap silinirken hata oluştu");
    }
  };

  // Filtered data
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products;
    const searchLower = productSearch.toLowerCase();
    return products.filter((product) =>
      product.productName.toLowerCase().includes(searchLower)
    );
  }, [products, productSearch]);

  const filteredShops = useMemo(() => {
    if (!shopSearch.trim()) return shops;
    const searchLower = shopSearch.toLowerCase();
    return shops.filter((shop) =>
      shop.name.toLowerCase().includes(searchLower)
    );
  }, [shops, shopSearch]);

  const filteredOrders = useMemo(() => {
    if (!orderSearch.trim()) return orders;
    const searchLower = orderSearch.toLowerCase();
    return orders.filter((order) =>
      order.id.toLowerCase().includes(searchLower)
    );
  }, [orders, orderSearch]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-900">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          <span>Kullanıcı bilgileri yükleniyor...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2 text-gray-900">
            Kullanıcı Bulunamadı
          </h2>
          <p className="text-gray-600">Aradığınız kullanıcı mevcut değil.</p>
        </div>
      </div>
    );
  }

  // All Fields Display Component
  const AllFieldsDisplay = ({
    user,
    onFieldSave,
    savingField,
    setSavingField,
    canEdit,
  }: {
    user: UserData;
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

      const nonEditableFields = ["id", "createdAt", "updatedAt"];

      const userData = { ...user } as Record<string, unknown>;

      Object.keys(userData).forEach((key) => {
        const value = userData[key];
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
    }, [user, searchTerm]);

    const startEditing = (fieldKey: string, currentValue: unknown) => {
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
                Tüm Kullanıcı Alanları
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

            return (
              <div
                key={field.key}
                className="group bg-gray-50 hover:bg-gray-100 rounded border border-gray-200 p-2 transition-colors"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="font-mono text-[11px] font-semibold text-gray-700 truncate">
                        {field.key}
                      </span>
                      <span
                        className={`text-[9px] px-1 py-0.5 rounded font-medium ${getTypeColor(
                          type
                        )} bg-white`}
                      >
                        {type}
                      </span>
                    </div>

                    {isEditing && canEdit ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="flex-1 px-2 py-1 text-xs bg-white border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              saveField(field.key, type);
                            } else if (e.key === "Escape") {
                              cancelEditing();
                            }
                          }}
                        />
                        <button
                          onClick={() => saveField(field.key, type)}
                          disabled={isSaving}
                          className="p-1 bg-green-600 hover:bg-green-700 text-white rounded transition-colors disabled:opacity-50"
                        >
                          {isSaving ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Check className="w-3 h-3" />
                          )}
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="p-1 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-700 truncate flex-1">
                          {type === "array" || type === "object" ? (
                            <details className="cursor-pointer">
                              <summary className="text-xs text-gray-600 hover:text-gray-900">
                                {type === "array"
                                  ? `[${
                                      Array.isArray(field.value)
                                        ? field.value.length
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
                          {canEdit && field.editable && type !== "timestamp" && (
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
              <h1 className="text-sm font-bold text-gray-900 truncate">
                {user.displayName}
              </h1>
              <p className="text-xs text-gray-600 truncate">{user.email}</p>
            </div>
            <div className="flex items-center gap-2">
              {authUser?.isAdmin && (
                <button
                  onClick={openActivityModal}
                  className="px-2 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded text-xs transition-colors flex items-center gap-1"
                >
                  <ClipboardList className="w-3 h-3" />
                  Aktivite
                </button>
                
              )}
              <button
                onClick={handleResetPassword}
                className="px-2 py-1 bg-green-100 hover:bg-green-200 text-green-700 rounded text-xs transition-colors"
              >
                Parola Sıfırla
              </button>
              <button
  onClick={() => setShowCouponModal(true)}
  className="px-2 py-1 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded text-xs transition-colors flex items-center gap-1"
>
  <Ticket className="w-3 h-3" />
  Kupon Ver
</button>
<button
  onClick={() => setShowFreeShippingModal(true)}
  className="px-2 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded text-xs transition-colors flex items-center gap-1"
>
  <Truck className="w-3 h-3" />
  Ücretsiz Kargo
</button>
              <button
                onClick={handleDeleteAccount}
                className="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs transition-colors"
              >
                Hesabı Sil
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1800px] mx-auto px-4 py-4 h-screen overflow-hidden">
        {/* Main Content Grid */}
        <div className="grid grid-cols-12 gap-4 h-full overflow-hidden">
          {/* Left Column - User Info */}
          <div className="col-span-3 space-y-2 overflow-y-auto h-full">
            {/* Profile Image */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
              <div className="relative aspect-square">
                {user.profileImage ? (
                  <Image
                    src={user.profileImage}
                    alt={user.displayName}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                    <User className="w-12 h-12 text-gray-400" />
                  </div>
                )}
              </div>
            </div>

            {/* User Info Cards */}
            <div className="bg-white border border-gray-200 rounded-lg p-2 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-900 mb-2 flex items-center gap-1">
                <User className="w-3 h-3" />
                Kişisel Bilgiler
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <Mail className="w-3 h-3 text-gray-500" />
                  <span className="text-gray-700 truncate">{user.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-3 h-3 text-gray-500" />
                  <span className="text-gray-700 truncate">
                    {user.phone || "N/A"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <User className="w-3 h-3 text-gray-500" />
                  <span className="text-gray-700 truncate">
                    {user.gender || "N/A"}
                  </span>
                </div>
                {user.address && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3 h-3 text-gray-500" />
                    <span className="text-gray-700 truncate">
                      {user.address}
                    </span>
                  </div>
                )}
                {user.playPoints !== undefined && (
                  <div className="flex items-center gap-2">
                    <Activity className="w-3 h-3 text-gray-500" />
                    <span className="text-gray-700">
                      {user.playPoints} Puan
                    </span>
                  </div>
                )}
                {user.createdAt && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3 h-3 text-gray-500" />
                    <span className="text-gray-700 text-[10px]">
                      {user.createdAt.toDate().toLocaleDateString("tr-TR")}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Stats */}
            <div className="bg-white border border-gray-200 rounded-lg p-2 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-900 mb-2">Özet</h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Package className="w-3 h-3 text-blue-600" />
                    <span className="text-gray-700">Ürünler</span>
                  </div>
                  <span className="text-gray-900 font-semibold">
                    {products.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Store className="w-3 h-3 text-green-600" />
                    <span className="text-gray-700">Mağazalar</span>
                  </div>
                  <span className="text-gray-900 font-semibold">
                    {shops.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <ShoppingBag className="w-3 h-3 text-purple-600" />
                    <span className="text-gray-700">Siparişler</span>
                  </div>
                  <span className="text-gray-900 font-semibold">
                    {orders.length}
                  </span>
                </div>
              </div>
            </div>
            {/* User Coupons & Benefits */}
<div className="bg-white border border-gray-200 rounded-lg p-2 shadow-sm">
  <h3 className="text-xs font-semibold text-gray-900 mb-2 flex items-center gap-1">
    <Gift className="w-3 h-3 text-orange-600" />
    Kuponlar & Avantajlar
  </h3>
  <div className="space-y-2 text-xs max-h-48 overflow-y-auto">
    {/* Coupons */}
    {userCoupons.filter(c => !c.isUsed).map((coupon) => (
      <div key={coupon.id} className="flex items-center justify-between p-2 bg-orange-50 rounded border border-orange-200">
        <div>
          <span className="font-semibold text-orange-700">{coupon.amount} {coupon.currency}</span>
          <span className="ml-1 text-gray-500">({coupon.code})</span>
        </div>
        <button
          onClick={() => handleRevokeCoupon(coupon.id)}
          className="p-1 hover:bg-orange-200 rounded transition-colors"
          title="İptal Et"
        >
          <Trash2 className="w-3 h-3 text-red-500" />
        </button>
      </div>
    ))}
    
    {/* Free Shipping Benefits */}
    {userBenefits.filter(b => !b.isUsed && b.type === 'free_shipping').map((benefit) => (
      <div key={benefit.id} className="flex items-center justify-between p-2 bg-purple-50 rounded border border-purple-200">
        <div className="flex items-center gap-1">
          <Truck className="w-3 h-3 text-purple-600" />
          <span className="text-purple-700">Ücretsiz Kargo</span>
        </div>
        <button
          onClick={() => handleRevokeBenefit(benefit.id)}
          className="p-1 hover:bg-purple-200 rounded transition-colors"
          title="İptal Et"
        >
          <Trash2 className="w-3 h-3 text-red-500" />
        </button>
      </div>
    ))}
    
    {userCoupons.filter(c => !c.isUsed).length === 0 && 
     userBenefits.filter(b => !b.isUsed).length === 0 && (
      <p className="text-gray-500 text-center py-2">Aktif kupon/avantaj yok</p>
    )}
  </div>
</div>
          </div>

          {/* Middle Column - All Fields */}
          <div className="col-span-5 h-full overflow-hidden">
            <AllFieldsDisplay
              user={user}
              onFieldSave={saveIndividualField}
              savingField={savingField}
              setSavingField={setSavingField}
              canEdit={isFullAdmin}
            />
          </div>

          {/* Right Column - Tabs (Products, Shops, Orders) */}
          <div className="col-span-4 h-full overflow-hidden">
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm h-full flex flex-col">
              {/* Tab Headers */}
              <div className="flex items-center border-b border-gray-200 flex-shrink-0">
                <button
                  onClick={() => setActiveTab("products")}
                  className={`flex-1 py-2 px-3 text-xs font-medium transition-colors relative ${
                    activeTab === "products"
                      ? "text-gray-900 bg-gray-50"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <div className="flex items-center justify-center gap-1">
                    <Package className="w-3 h-3" />
                    Ürünler ({products.length})
                  </div>
                  {activeTab === "products" && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                  )}
                </button>

                <button
                  onClick={() => setActiveTab("shops")}
                  className={`flex-1 py-2 px-3 text-xs font-medium transition-colors relative ${
                    activeTab === "shops"
                      ? "text-gray-900 bg-gray-50"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <div className="flex items-center justify-center gap-1">
                    <Store className="w-3 h-3" />
                    Mağazalar ({shops.length})
                  </div>
                  {activeTab === "shops" && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                  )}
                </button>

                <button
                  onClick={() => setActiveTab("orders")}
                  className={`flex-1 py-2 px-3 text-xs font-medium transition-colors relative ${
                    activeTab === "orders"
                      ? "text-gray-900 bg-gray-50"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <div className="flex items-center justify-center gap-1">
                    <ShoppingBag className="w-3 h-3" />
                    Siparişler ({orders.length})
                  </div>
                  {activeTab === "orders" && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                  )}
                </button>
              </div>

              {/* Content Area - Scrollable */}
              <div className="p-3 overflow-y-auto flex-1">
                {/* Products Tab Content */}
                {activeTab === "products" && (
                  <div>
                    {/* Search */}
                    <div className="relative mb-3">
                      <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400" />
                      <input
                        type="text"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        placeholder="Ürün ara..."
                        className="w-full pl-7 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded text-gray-900 text-xs placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    {/* Products List */}
                    {filteredProducts.length > 0 ? (
                      <div className="space-y-2">
                        {filteredProducts.map((product) => (
                          <div
                            key={product.id}
                            onClick={() =>
                              router.push(
                                `/productdetails?productId=${product.id}`
                              )
                            }
                            className="p-2 bg-gray-50 rounded border border-gray-200 hover:bg-gray-100 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <div className="relative w-10 h-10 rounded overflow-hidden flex-shrink-0">
                                {product.imageUrls?.[0] ? (
                                  <Image
                                    src={product.imageUrls[0]}
                                    alt={product.productName}
                                    fill
                                    className="object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                                    <Package className="w-4 h-4 text-gray-400" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-gray-900 text-xs truncate">
                                  {product.productName}
                                </h4>
                                <div className="flex items-center gap-2 text-[10px] text-gray-600">
                                  <span>
                                    {product.price} {product.currency}
                                  </span>
                                  {product.sold && (
                                    <span className="px-1 py-0.5 bg-red-100 text-red-700 rounded">
                                      Satıldı
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <Package className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-600 text-xs">Ürün bulunamadı</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Shops Tab Content */}
                {activeTab === "shops" && (
                  <div>
                    {/* Search */}
                    <div className="relative mb-3">
                      <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400" />
                      <input
                        type="text"
                        value={shopSearch}
                        onChange={(e) => setShopSearch(e.target.value)}
                        placeholder="Mağaza ara..."
                        className="w-full pl-7 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded text-gray-900 text-xs placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    {/* Shops List */}
                    {filteredShops.length > 0 ? (
                      <div className="space-y-2">
                        {filteredShops.map((shop) => (
                          <div
                            key={shop.id}
                            onClick={() =>
                              router.push(`/shopdetails?shopId=${shop.id}`)
                            }
                            className="p-2 bg-gray-50 rounded border border-gray-200 hover:bg-gray-100 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                                {shop.profileImageUrl ? (
                                  <Image
                                    src={shop.profileImageUrl}
                                    alt={shop.name}
                                    fill
                                    className="object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                                    <Store className="w-4 h-4 text-gray-400" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-gray-900 text-xs truncate">
                                  {shop.name}
                                </h4>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <Store className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-600 text-xs">
                          Mağaza bulunamadı
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Orders Tab Content */}
                {activeTab === "orders" && (
  <div>
    {/* Search */}
    <div className="relative mb-3">
      <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400" />
      <input
        type="text"
        value={orderSearch}
        onChange={(e) => setOrderSearch(e.target.value)}
        placeholder="Sipariş ara..."
        className="w-full pl-7 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded text-gray-900 text-xs placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
      />
    </div>

    {/* Orders List */}
    {filteredOrders.length > 0 ? (
      <div className="space-y-3">
        {filteredOrders.map((order) => {
          // Check if this is a failed payment
          const isFailedPayment = order.isFailedPayment || order.status === 'payment_succeeded_order_failed' || order.status === 'payment_failed';
          
          // Determine shipment status with distinct colors
          const getShipmentStatus = () => {
            if (isFailedPayment) {
              if (order.status === 'payment_succeeded_order_failed') {
                return { label: "Ödeme Alındı - Sipariş Hatalı", textColor: "text-red-600", bgColor: "bg-red-50", borderColor: "border-red-300", icon: "⚠️" };
              }
              return { label: "Ödeme Başarısız", textColor: "text-gray-600", bgColor: "bg-gray-50", borderColor: "border-gray-300", icon: "❌" };
            }
            if (order.distributionStatus === "delivered") {
              return { label: "Teslim Edildi", textColor: "text-green-600", bgColor: "bg-green-50", borderColor: "border-green-200", icon: "✓" };
            }
            if (order.distributionStatus === "distributed" || order.distributionStatus === "assigned") {
              return { label: "Dağıtımda", textColor: "text-blue-600", bgColor: "bg-blue-50", borderColor: "border-blue-200", icon: "🚚" };
            }
            if (order.allItemsGathered || order.distributionStatus === "ready") {
              return { label: "Depoda", textColor: "text-purple-600", bgColor: "bg-purple-50", borderColor: "border-purple-200", icon: "📦" };
            }
            const hasGatheredItems = order.items.some(
              (item) => item.gatheringStatus === "gathered" || item.gatheringStatus === "at_warehouse"
            );
            if (hasGatheredItems) {
              return { label: "Toplanıyor", textColor: "text-amber-600", bgColor: "bg-amber-50", borderColor: "border-amber-200", icon: "⏳" };
            }
            return { label: "Beklemede", textColor: "text-orange-600", bgColor: "bg-orange-50", borderColor: "border-orange-200", icon: "🕐" };
          };

          const shipmentStatus = getShipmentStatus();
          
          // Get unique sellers
          const uniqueSellers = [...new Set(order.items.map(item => item.sellerName).filter(Boolean))];

          return (
            <div
              key={order.id}
              className={`p-3 rounded-lg border transition-colors ${
                isFailedPayment 
                  ? 'bg-red-50 border-red-200 hover:bg-red-100' 
                  : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
              }`}
            >
              {/* Order Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-600">
                    #{order.id.substring(0, 8)}
                  </span>
                  {order.paymentOrderId && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(order.paymentOrderId || '');
                        toast.success("Ödeme ID kopyalandı!");
                      }}
                      className="text-[9px] px-1.5 py-0.5 bg-gray-200 hover:bg-gray-300 rounded cursor-pointer"
                      title="Ödeme ID'yi kopyala"
                    >
                      💳 {order.paymentOrderId.substring(0, 10)}...
                    </button>
                  )}
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${shipmentStatus.textColor} ${shipmentStatus.bgColor} ${shipmentStatus.borderColor}`}
                >
                  {shipmentStatus.icon} {shipmentStatus.label}
                </span>
              </div>

              {/* Error Message for Failed Orders */}
              {isFailedPayment && order.orderError && (
                <div className="mb-2 p-2 bg-red-100 border border-red-300 rounded text-xs text-red-700">
                  <span className="font-semibold">Hata: </span>
                  {order.orderError}
                </div>
              )}

              {/* Delivery & Discount Info Row */}
              {!isFailedPayment && (
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  {/* Delivery Type */}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                    order.deliveryOption === 'express' 
                      ? 'bg-blue-50 text-blue-700 border-blue-200' 
                      : 'bg-gray-100 text-gray-600 border-gray-200'
                  }`}>
                    {order.deliveryOption === 'express' ? '🚀 Ekspres' : '📦 Normal'} 
                    {order.deliveryPrice !== undefined && ` (${order.deliveryPrice} TL)`}
                  </span>

                  {/* Free Shipping Badge */}
                  {order.freeShippingApplied && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded">
                      🎁 Ücretsiz Kargo
                    </span>
                  )}

                  {/* Coupon Badge */}
                  {order.couponCode && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-orange-50 text-orange-700 border border-orange-200 rounded">
                      🎟️ {order.couponCode} (-{order.couponDiscount} TL)
                    </span>
                  )}
                </div>
              )}

              {/* Sellers Row */}
              {uniqueSellers.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 mb-2">
                  <span className="text-[10px] text-gray-500">Satıcılar:</span>
                  {uniqueSellers.slice(0, 3).map((seller, idx) => (
                    <span 
                      key={idx}
                      className="text-[10px] px-1.5 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded"
                    >
                      {seller}
                    </span>
                  ))}
                  {uniqueSellers.length > 3 && (
                    <span className="text-[10px] text-gray-500">
                      +{uniqueSellers.length - 3} daha
                    </span>
                  )}
                </div>
              )}

              {/* Product Items with Thumbnails */}
              <div className="mb-2 space-y-1.5">
                {order.items.slice(0, 3).map((item) => {
                  const thumbnailUrl = item.selectedColorImage || item.productImage;

                  return (
                    <div key={item.id} className="flex items-center gap-2">
                      {/* Thumbnail */}
                      <div className="relative w-8 h-8 rounded overflow-hidden flex-shrink-0 bg-gray-100">
                        {thumbnailUrl ? (
                          <Image
                            src={thumbnailUrl}
                            alt={item.productName}
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="w-3 h-3 text-gray-400" />
                          </div>
                        )}
                      </div>
                      {/* Product Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-700 truncate">{item.productName}</span>
                          {item.quantity > 1 && (
                            <span className="text-[10px] text-gray-500 flex-shrink-0">x{item.quantity}</span>
                          )}
                        </div>
                        {item.sellerName && (
                          <span className="text-[9px] text-gray-500">{item.sellerName}</span>
                        )}
                      </div>
                      {item.price !== undefined && (
                        <span className="text-[10px] text-gray-600 flex-shrink-0">
                          {item.price} TL
                        </span>
                      )}
                    </div>
                  );
                })}
                {order.items.length > 3 && (
                  <div className="text-[10px] text-gray-500 ml-10">
                    +{order.items.length - 3} daha fazla ürün
                  </div>
                )}
              </div>

              {/* Order Footer */}
              <div className="flex items-center justify-between text-[10px] text-gray-600 pt-2 border-t border-gray-200">
                <span>
                  {order.timestamp?.toDate?.()?.toLocaleDateString("tr-TR") || "N/A"}
                </span>
                <div className="flex items-center gap-2">
                  {/* Show subtotal if there's a discount */}
                  {order.itemsSubtotal && order.couponDiscount && order.couponDiscount > 0 && (
                    <span className="line-through text-gray-400">
                      {order.itemsSubtotal} TL
                    </span>
                  )}
                  <span className={`font-semibold ${isFailedPayment ? 'text-red-600' : 'text-gray-900'}`}>
                    {order.totalPrice} TL
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Load More Button */}
        {hasMoreOrders && !orderSearch.trim() && (
          <button
            onClick={loadMoreOrders}
            disabled={loadingMoreOrders}
            className="w-full py-2 px-4 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loadingMoreOrders ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Yükleniyor...
              </>
            ) : (
              "Daha fazla yükle"
            )}
          </button>
        )}
      </div>
    ) : (
      <div className="text-center py-6">
        <ShoppingBag className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-gray-600 text-xs">
          Sipariş bulunamadı
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

      {/* Admin Activity Logs Modal */}
      {showActivityModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-3 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-indigo-600" />
                <h2 className="text-sm font-semibold text-gray-900">Admin Aktivite Logları</h2>
                <span className="text-xs text-gray-500">({activityLogs.length})</span>
              </div>
              <button
                onClick={() => setShowActivityModal(false)}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
              >
                <X className="w-4 h-4 text-gray-600" />
              </button>
            </div>

            {/* Modal Content - Scrollable */}
            <div
              ref={activityLogsContainerRef}
              onScroll={handleActivityScroll}
              className="flex-1 overflow-y-auto p-3"
            >
              {activityLogs.length > 0 ? (
                <div className="space-y-1.5">
                  {activityLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-2 bg-gray-50 rounded border border-gray-200 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-900">{log.activity}</p>
                          {/* Show metadata if exists */}
                          {log.metadata && (log.metadata.productName || log.metadata.sellerName || log.metadata.shopName) && (
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {log.metadata.productName && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                                  {log.metadata.productName}
                                </span>
                              )}
                              {(log.metadata.sellerName || log.metadata.shopName) && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
                                  {log.metadata.sellerName || log.metadata.shopName}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-500 whitespace-nowrap flex-shrink-0">
                          {log.time?.toDate().toLocaleString("tr-TR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* Loading indicator */}
                  {loadingActivityLogs && (
                    <div className="flex items-center justify-center py-3">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                      <span className="ml-2 text-xs text-gray-600">Yükleniyor...</span>
                    </div>
                  )}

                  {/* End of list */}
                  {!hasMoreActivityLogs && activityLogs.length > 0 && (
                    <p className="text-center text-[10px] text-gray-400 py-2">Tüm loglar yüklendi</p>
                  )}
                </div>
              ) : loadingActivityLogs ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                  <span className="ml-2 text-xs text-gray-600">Loglar yükleniyor...</span>
                </div>
              ) : (
                <div className="text-center py-12">
                  <ClipboardList className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-xs text-gray-600">Aktivite logu bulunamadı</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Coupon Modal */}
{showCouponModal && (
  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Ticket className="w-5 h-5 text-orange-600" />
          <h2 className="text-lg font-semibold text-gray-900">Kupon Ver</h2>
        </div>
        <button
          onClick={() => setShowCouponModal(false)}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
        >
          <X className="w-5 h-5 text-gray-600" />
        </button>
      </div>
      
      <div className="p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tutar (TL) *
          </label>
          <input
            type="number"
            value={couponAmount}
            onChange={(e) => setCouponAmount(e.target.value)}
            placeholder="50"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Açıklama (Opsiyonel)
          </label>
          <input
            type="text"
            value={couponDescription}
            onChange={(e) => setCouponDescription(e.target.value)}
            placeholder="Teşekkür kuponu"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Geçerlilik Süresi (Gün)
          </label>
          <select
            value={couponExpiryDays}
            onChange={(e) => setCouponExpiryDays(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="7">7 gün</option>
            <option value="14">14 gün</option>
            <option value="30">30 gün</option>
            <option value="60">60 gün</option>
            <option value="90">90 gün</option>
            <option value="365">1 yıl</option>
          </select>
        </div>
      </div>
      
      <div className="flex gap-3 p-4 border-t border-gray-200">
        <button
          onClick={() => setShowCouponModal(false)}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          İptal
        </button>
        <button
          onClick={handleGrantCoupon}
          disabled={grantingCoupon || !couponAmount}
          className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {grantingCoupon ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Veriliyor...
            </>
          ) : (
            <>
              <Gift className="w-4 h-4" />
              Kupon Ver
            </>
          )}
        </button>
      </div>
    </div>
  </div>
)}

{/* Free Shipping Modal */}
{showFreeShippingModal && (
  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Truck className="w-5 h-5 text-purple-600" />
          <h2 className="text-lg font-semibold text-gray-900">Ücretsiz Kargo Ver</h2>
        </div>
        <button
          onClick={() => setShowFreeShippingModal(false)}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
        >
          <X className="w-5 h-5 text-gray-600" />
        </button>
      </div>
      
      <div className="p-4 space-y-4">
        <p className="text-gray-600 text-sm">
          Bu kullanıcıya bir sonraki siparişinde ücretsiz kargo hakkı verilecek.
        </p>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Geçerlilik Süresi (Gün)
          </label>
          <select
            value={freeShippingExpiryDays}
            onChange={(e) => setFreeShippingExpiryDays(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="7">7 gün</option>
            <option value="14">14 gün</option>
            <option value="30">30 gün</option>
            <option value="60">60 gün</option>
            <option value="90">90 gün</option>
          </select>
        </div>
      </div>
      
      <div className="flex gap-3 p-4 border-t border-gray-200">
        <button
          onClick={() => setShowFreeShippingModal(false)}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          İptal
        </button>
        <button
          onClick={handleGrantFreeShipping}
          disabled={grantingFreeShipping}
          className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {grantingFreeShipping ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Veriliyor...
            </>
          ) : (
            <>
              <Truck className="w-4 h-4" />
              Ücretsiz Kargo Ver
            </>
          )}
        </button>
      </div>
    </div>
  </div>
)}
    </div>
  );
}

// Main export with Suspense wrapper
export default function UserDetails() {
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
        <UserDetailsContent />
      </Suspense>
    </ProtectedRoute>
  );
}
