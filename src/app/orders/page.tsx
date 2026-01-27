"use client";

import { useState, useEffect, useMemo } from "react";
import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  where,
  Timestamp,
  DocumentData,
  QueryDocumentSnapshot,
  Query,
} from "firebase/firestore";
import { db } from "@/app/lib/firebase";
import {
  Package,
  ChevronLeft,
  ChevronRight,
  Search,
  Download,
  User,
  Store,
  MapPin,
  Truck,
  DollarSign,
  TrendingUp,
  Calendar,
} from "lucide-react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { Pause, Play } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface OrderItem {
  id: string;
  orderId: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  isShopProduct: boolean;
  shopId: string | null;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  currency: string;
  ourComission: number;
  deliveryOption: string;
  selectedAttributes?: Record<
    string,
    string | number | boolean | string[] | number[]
  >;
  calculatedTotal: number;
  calculatedUnitPrice: number;
  timestamp: Timestamp;
}

interface OrderHeader {
  id: string;
  buyerId: string;
  address?: {
    addressLine1: string;
    addressLine2: string;
    city: string;
    phoneNumber: string;
  };
  pickupPoint?: {
    pickupPointName: string;
    pickupPointAddress: string;
  };
  deliveryOption: string;
  deliveryPrice: number;
  totalPrice: number;
  totalQuantity: number;
  itemCount: number;
  paymentMethod: string;
  timestamp: Timestamp;
  couponCode?: string;
  couponDiscount?: number;
  freeShippingApplied?: boolean;
  originalDeliveryPrice?: number;
}

interface CombinedOrder {
  orderHeader: OrderHeader;
  items: OrderItem[];
}

interface Filters {
  deliveryOption: string;
  startDate: string;
  endDate: string;
  searchTerm: string;
}

export default function OrdersPage() {
  const { isAuthenticated, user } = useAuth();
  const [orders, setOrders] = useState<CombinedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [lastVisible, setLastVisible] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [firstVisible, setFirstVisible] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [salesPaused, setSalesPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const [loadingSalesConfig, setLoadingSalesConfig] = useState(true);
  const [togglingPause, setTogglingPause] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);

  // Server-side filters
  const [filters, setFilters] = useState<Filters>({
    deliveryOption: "all",
    startDate: "",
    endDate: "",
    searchTerm: "",
  });

  const [appliedFilters, setAppliedFilters] = useState<Filters>({
    deliveryOption: "all",
    startDate: "",
    endDate: "",
    searchTerm: "",
  });

  const ITEMS_PER_PAGE = 20;

  // Build Firestore query with server-side filters
  const buildQuery = (
    direction: "next" | "prev" | "initial" = "initial"
  ): Query<DocumentData> => {
    const constraints: Array<
      | ReturnType<typeof orderBy>
      | ReturnType<typeof where>
      | ReturnType<typeof startAfter>
      | ReturnType<typeof limit>
    > = [orderBy("timestamp", "desc")];

    // Delivery option filter
    if (appliedFilters.deliveryOption !== "all") {
      constraints.push(
        where("deliveryOption", "==", appliedFilters.deliveryOption)
      );
    }

    // Date range filter
    if (appliedFilters.startDate) {
      const startDate = new Date(appliedFilters.startDate);
      startDate.setHours(0, 0, 0, 0);
      constraints.push(where("timestamp", ">=", Timestamp.fromDate(startDate)));
    }

    if (appliedFilters.endDate) {
      const endDate = new Date(appliedFilters.endDate);
      endDate.setHours(23, 59, 59, 999);
      constraints.push(where("timestamp", "<=", Timestamp.fromDate(endDate)));
    }

    // Pagination
    if (direction === "next" && lastVisible) {
      constraints.push(startAfter(lastVisible));
    } else if (direction === "prev" && firstVisible) {
      // For previous page, we need to reverse the query
      const prevConstraints: Array<
        | ReturnType<typeof orderBy>
        | ReturnType<typeof where>
        | ReturnType<typeof startAfter>
        | ReturnType<typeof limit>
      > = [orderBy("timestamp", "asc")];

      if (appliedFilters.deliveryOption !== "all") {
        prevConstraints.push(
          where("deliveryOption", "==", appliedFilters.deliveryOption)
        );
      }

      if (appliedFilters.startDate) {
        const startDate = new Date(appliedFilters.startDate);
        startDate.setHours(0, 0, 0, 0);
        prevConstraints.push(
          where("timestamp", ">=", Timestamp.fromDate(startDate))
        );
      }

      if (appliedFilters.endDate) {
        const endDate = new Date(appliedFilters.endDate);
        endDate.setHours(23, 59, 59, 999);
        prevConstraints.push(
          where("timestamp", "<=", Timestamp.fromDate(endDate))
        );
      }

      prevConstraints.push(startAfter(firstVisible));
      constraints.push(...prevConstraints);
      return query(collection(db, "orders"), ...prevConstraints);
    }

    constraints.push(limit(ITEMS_PER_PAGE));

    return query(collection(db, "orders"), ...constraints);
  };

  // Fetch orders with server-side filtering and pagination
  const fetchOrders = async (
    direction: "next" | "prev" | "initial" = "initial"
  ) => {
    try {
      setLoading(true);

      const ordersQuery = buildQuery(direction);
      const ordersSnapshot = await getDocs(ordersQuery);

      if (ordersSnapshot.empty) {
        setHasMore(false);
        setOrders([]);
        setLoading(false);
        return;
      }

      let docs = ordersSnapshot.docs;

      // Reverse docs if fetching previous page
      if (direction === "prev") {
        docs = docs.reverse();
      }

      setFirstVisible(docs[0]);
      setLastVisible(docs[docs.length - 1]);
      setHasMore(docs.length === ITEMS_PER_PAGE);
      setHasPrevious(currentPage > 1);

      // Fetch items for each order in parallel with batching
      const ordersWithItems: CombinedOrder[] = await Promise.all(
        docs.map(async (orderDoc) => {
          const orderData = orderDoc.data() as OrderHeader;
          orderData.id = orderDoc.id;

          const itemsSnapshot = await getDocs(
            collection(db, "orders", orderDoc.id, "items")
          );

          const items: OrderItem[] = itemsSnapshot.docs.map((itemDoc) => {
            const itemData = itemDoc.data();
          
            // Get price from root level, fallback to selectedAttributes for legacy data
            const unitPrice = 
              itemData.price || 
              itemData.selectedAttributes?.calculatedUnitPrice || 
              0;
            
            const quantity = itemData.quantity || 1;
            
            // Calculate total: try selectedAttributes first (legacy), then compute from price * quantity
            const calculatedTotal =
              itemData.selectedAttributes?.calculatedTotal || 
              (unitPrice * quantity);
            
            const calculatedUnitPrice = unitPrice;
          
            console.log("Raw item data from Firestore:", {
              docId: itemDoc.id,
              price: itemData.price,
              quantity: quantity,
              calculatedTotal,
              calculatedUnitPrice,
              ourComission: itemData.ourComission,
              selectedAttributes: itemData.selectedAttributes,
            });
          
            return {
              id: itemDoc.id,
              ...itemData,
              calculatedTotal,
              calculatedUnitPrice,
            } as OrderItem;
          });

          return {
            orderHeader: orderData,
            items,
          };
        })
      );

      setOrders(ordersWithItems);
      setLoading(false);
    } catch (error) {
      console.error("Error loading orders:", error);
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only fetch when authenticated
    if (!isAuthenticated) {
      return;
    }

    const fetchSalesConfig = async () => {
      try {
        const docRef = doc(db, "settings", "salesConfig");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setSalesPaused(data.salesPaused || false);
          setPauseReason(data.pauseReason || "");
        }
      } catch (error) {
        console.error("Error fetching sales config:", error);
      } finally {
        setLoadingSalesConfig(false);
      }
    };

    fetchSalesConfig();
  }, [isAuthenticated]);

  useEffect(() => {
    // Only fetch when authenticated
    if (!isAuthenticated) {
      return;
    }

    setCurrentPage(1);
    setLastVisible(null);
    setFirstVisible(null);
    fetchOrders("initial");
  }, [appliedFilters, isAuthenticated]);

  // Client-side search filter (for current page only)
  const filteredOrders = useMemo(() => {
    if (!appliedFilters.searchTerm) return orders;

    const term = appliedFilters.searchTerm.toLowerCase();
    return orders.filter((order) =>
      order.items.some(
        (item) =>
          item.buyerName?.toLowerCase().includes(term) ||
          item.sellerName?.toLowerCase().includes(term) ||
          item.productName?.toLowerCase().includes(term) ||
          order.orderHeader.id.toLowerCase().includes(term)
      )
    );
  }, [orders, appliedFilters.searchTerm]);

  const handleToggleSalesPause = async (pause: boolean, reason?: string) => {
    setTogglingPause(true);
    try {
      // Check if user is authenticated
      if (!user) {
        alert("Oturum açmanız gerekiyor. Lütfen tekrar giriş yapın.");
        setTogglingPause(false);
        return;
      }

      await setDoc(doc(db, "settings", "salesConfig"), {
        salesPaused: pause,
        pausedAt: pause ? serverTimestamp() : null,
        pausedBy: pause ? user.uid : null,
        pauseReason: pause ? (reason || "") : "",
        updatedAt: serverTimestamp(),
      });

      setSalesPaused(pause);
      setPauseReason(pause ? (reason || "") : "");
      setShowPauseModal(false);
    } catch (error) {
      console.error("Error toggling sales pause:", error);
      alert("Satış durumu değiştirilemedi. Lütfen tekrar deneyin.");
    } finally {
      setTogglingPause(false);
    }
  };

  // Calculate statistics based on DISPLAYED orders
  const statistics = useMemo(() => {
    let totalRevenue = 0;
    let totalCommission = 0;
    let totalDelivery = 0;
    let totalCouponDiscounts = 0;
    let freeShippingCount = 0;
    const totalOrders = filteredOrders.length;
  
    filteredOrders.forEach((order) => {
      const orderDeliveryPrice = order.orderHeader.deliveryPrice || 0;
      const couponDiscount = order.orderHeader.couponDiscount || 0;
  
      totalDelivery += orderDeliveryPrice;
      totalCouponDiscounts += couponDiscount;
      
      if (order.orderHeader.freeShippingApplied) {
        freeShippingCount++;
      }
  
      order.items.forEach((item) => {
        // ✅ FIXED: Get item total correctly
        const itemTotal = 
          item.calculatedTotal || 
          (item.selectedAttributes as any)?.calculatedTotal ||
          ((item.price || 0) * (item.quantity || 1));
        
        const commissionRate = item.ourComission || 0;
        const commission = (itemTotal * commissionRate) / 100;
        
        totalRevenue += itemTotal;
        totalCommission += commission;
      });
    });
  
    // Add delivery to total revenue
    totalRevenue += totalDelivery;
  
    // ✅ FIXED: Net profit = commission + delivery - coupon discounts
    const totalProfit = totalCommission + totalDelivery - totalCouponDiscounts;
  
    return {
      totalRevenue,
      totalCommission,
      totalDelivery,
      totalProfit,
      totalOrders,
      totalCouponDiscounts,
      freeShippingCount,
    };
  }, [filteredOrders]);

  const handleApplyFilters = () => {
    setAppliedFilters({ ...filters });
  };

  const handleNextPage = () => {
    if (hasMore) {
      setCurrentPage((prev) => prev + 1);
      fetchOrders("next");
    }
  };

  const handlePrevPage = () => {
    if (hasPrevious) {
      setCurrentPage((prev) => prev - 1);
      fetchOrders("prev");
    }
  };

  // FIXED: Excel export functionality
  const handleExportToExcel = async () => {
    setExporting(true);
    try {
      // Fetch ALL orders matching the filters (without pagination)
      let allOrders: CombinedOrder[] = [];
      let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null;
      let hasMoreData = true;

      while (hasMoreData) {
        const batchConstraints: Array<
          | ReturnType<typeof orderBy>
          | ReturnType<typeof where>
          | ReturnType<typeof startAfter>
          | ReturnType<typeof limit>
        > = [orderBy("timestamp", "desc")];

        if (appliedFilters.deliveryOption !== "all") {
          batchConstraints.push(
            where("deliveryOption", "==", appliedFilters.deliveryOption)
          );
        }

        if (appliedFilters.startDate) {
          const startDate = new Date(appliedFilters.startDate);
          startDate.setHours(0, 0, 0, 0);
          batchConstraints.push(
            where("timestamp", ">=", Timestamp.fromDate(startDate))
          );
        }

        if (appliedFilters.endDate) {
          const endDate = new Date(appliedFilters.endDate);
          endDate.setHours(23, 59, 59, 999);
          batchConstraints.push(
            where("timestamp", "<=", Timestamp.fromDate(endDate))
          );
        }

        if (lastDoc) {
          batchConstraints.push(startAfter(lastDoc));
        }

        batchConstraints.push(limit(100)); // Fetch in batches of 100

        const batchQuery = query(collection(db, "orders"), ...batchConstraints);
        const batchSnapshot = await getDocs(batchQuery);

        if (batchSnapshot.empty) {
          hasMoreData = false;
          break;
        }

        const batchOrders = await Promise.all(
          batchSnapshot.docs.map(async (orderDoc) => {
            const orderData = orderDoc.data() as OrderHeader;
            orderData.id = orderDoc.id;

            const itemsSnapshot = await getDocs(
              collection(db, "orders", orderDoc.id, "items")
            );

            const items: OrderItem[] = itemsSnapshot.docs.map(
              (itemDoc) =>
                ({
                  id: itemDoc.id,
                  ...itemDoc.data(),
                } as OrderItem)
            );

            return {
              orderHeader: orderData,
              items,
            };
          })
        );

        allOrders = [...allOrders, ...batchOrders];
        lastDoc = batchSnapshot.docs[batchSnapshot.docs.length - 1];
        hasMoreData = batchSnapshot.docs.length === 100;
      }

      // Generate CSV content
      const csvRows: string[] = [];

      // Header row
      csvRows.push(
        [
          "Sipariş ID",
          "Tarih",
          "Alıcı",
          "Satıcı",
          "Satıcı Tipi",
          "Adres",
          "Ürün",
          "Adet",
          "Özellikler",
          "Ürün Fiyatı (TL)",
          "Teslimat Tipi",
          "Teslimat Ücreti (TL)",
          "Kupon İndirimi (TL)", // ✅ ADD
    "Ücretsiz Kargo",
          "Komisyon Oranı (%)",
          "Komisyon Tutarı (TL)",
          "Toplam (TL)",
          "Satıcı Kazancı (TL)",
          "Net Karımız (TL)",
        ].join(",")
      );

      // Data rows
      allOrders.forEach((order) => {
        order.items.forEach((item, idx) => {
          // ✅ FIXED: Get item total from price * quantity if calculatedTotal is missing
          const itemTotal = 
            item.calculatedTotal || 
            (item.selectedAttributes as any)?.calculatedTotal ||
            ((item.price || 0) * (item.quantity || 1));
          
          const commissionRate = item.ourComission || 0;
          const deliveryPrice = idx === 0 ? order.orderHeader.deliveryPrice || 0 : 0;
          const couponDiscount = idx === 0 ? order.orderHeader.couponDiscount || 0 : 0;
          const freeShippingApplied = idx === 0 && order.orderHeader.freeShippingApplied ? "Evet" : "";
      
          // ✅ FIXED calculations
          const commission = (itemTotal * commissionRate) / 100;
          const totalWithDelivery = itemTotal + deliveryPrice;
          const sellerEarnings = itemTotal - commission;
          const ourProfit = commission + deliveryPrice - couponDiscount;

          csvRows.push(
            [
              order.orderHeader.id,
              idx === 0
                ? order.orderHeader.timestamp.toDate().toLocaleString("tr-TR")
                : "",
              `"${item.buyerName}"`,
              `"${item.sellerName}"`,
              item.isShopProduct ? "Mağaza" : "Bireysel",
              idx === 0
                ? `"${formatAddress(
                    order.orderHeader.address || order.orderHeader.pickupPoint
                  )}"`
                : "",
              `"${item.productName}"`,
              item.quantity,
              `"${formatDynamicAttributes(item.selectedAttributes)}"`,
              itemTotal.toFixed(2),
              idx === 0
                ? getDeliveryLabel(order.orderHeader.deliveryOption)
                : "",
              deliveryPrice.toFixed(2),
              couponDiscount.toFixed(2), // ✅ ADD
        freeShippingApplied,
              commissionRate,
              commission.toFixed(2),
              totalWithDelivery.toFixed(2),
              sellerEarnings.toFixed(2),
              ourProfit.toFixed(2),
            ].join(",")
          );
        });
      });

      // Create and download file
      const csvContent = "\uFEFF" + csvRows.join("\n"); // BOM for Excel UTF-8
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);

      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `siparisler_${new Date().toISOString().split("T")[0]}.csv`
      );
      link.style.visibility = "hidden";

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      alert("Excel dışa aktarma sırasında bir hata oluştu.");
    } finally {
      setExporting(false);
    }
  };

  const formatAddress = (
    address: OrderHeader["address"] | OrderHeader["pickupPoint"]
  ) => {
    if (!address) return "-";
    if ("addressLine1" in address) {
      return `${address.addressLine1}, ${address.city}`;
    }
    if ("pickupPointName" in address) {
      return address.pickupPointName;
    }
    return "-";
  };

  const formatDynamicAttributes = (
    attributes?: Record<string, string | number | boolean | string[] | number[]>
  ) => {
    if (!attributes) return "-";

    const filtered = Object.entries(attributes).filter(
      ([key]) =>
        ![
          "calculatedTotal",
          "calculatedUnitPrice",
          "currency",
          "isBundleItem",
          "ourComission",
          "unitPrice",
          "selectedColorImage",
        ].includes(key)
    );

    if (filtered.length === 0) return "-";

    return filtered
      .map(([key, value]) => {
        const displayKey =
          key === "selectedColor"
            ? "Renk"
            : key === "clothingSizes"
            ? "Beden"
            : key === "clothingFit"
            ? "Kesim"
            : key === "clothingType"
            ? "Kumaş"
            : key === "gender"
            ? "Cinsiyet"
            : key;
        return `${displayKey}: ${value}`;
      })
      .join(", ");
  };

  const getDeliveryLabel = (option: string) => {
    const labels: Record<string, string> = {
      normal: "Normal",
      express: "Hızlı",
      gelal: "Gelal",
      pickup: "Teslim Alma",
    };
    return labels[option] || option;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">           

              <div className="flex items-center justify-center w-10 h-10 bg-blue-600 rounded-lg">
                <Package className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Sipariş Yönetimi
                </h1>
                <p className="text-sm text-gray-600">
                  Tüm siparişleri görüntüle ve yönet
                </p>
              </div>
            </div>
             {/* Sales Pause Toggle */}
  {loadingSalesConfig ? (
    <div className="px-4 py-2 bg-gray-100 rounded-lg animate-pulse w-32 h-10" />
  ) : (
    <button
      onClick={() => {
        if (salesPaused) {
          handleToggleSalesPause(false);
        } else {
          setShowPauseModal(true);
        }
      }}
      disabled={togglingPause}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 ${
        salesPaused
          ? "bg-red-100 text-red-700 border border-red-300 hover:bg-red-200"
          : "bg-green-100 text-green-700 border border-green-300 hover:bg-green-200"
      }`}
    >
      {togglingPause ? (
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : salesPaused ? (
        <Play className="w-4 h-4" />
      ) : (
        <Pause className="w-4 h-4" />
      )}
      {salesPaused ? "Resume Sales" : "Pause Sales"}
    </button>
  )}
          </div>

          {/* Statistics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-medium text-blue-900">
                  Toplam Sipariş
                </span>
              </div>
              <p className="text-xl font-bold text-blue-900">
                {statistics.totalOrders}
              </p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-green-600" />
                <span className="text-xs font-medium text-green-900">
                  Toplam Ciro
                </span>
              </div>
              <p className="text-xl font-bold text-green-900">
                {statistics.totalRevenue.toFixed(2)} TL
              </p>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-purple-600" />
                <span className="text-xs font-medium text-purple-900">
                  Komisyon
                </span>
              </div>
              <p className="text-xl font-bold text-purple-900">
                {statistics.totalCommission.toFixed(2)} TL
              </p>
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Truck className="w-4 h-4 text-orange-600" />
                <span className="text-xs font-medium text-orange-900">
                  Teslimat
                </span>
              </div>
              <p className="text-xl font-bold text-orange-900">
                {statistics.totalDelivery.toFixed(2)} TL
              </p>
            </div>

            <div className="bg-pink-50 border border-pink-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-pink-600" />
                <span className="text-xs font-medium text-pink-900">
                  Nar24 Kazanç (Komisyon + Teslimat)
                </span>
              </div>
              <p className="text-xl font-bold text-pink-900">
                {statistics.totalProfit.toFixed(2)} TL
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={filters.searchTerm}
                onChange={(e) =>
                  setFilters({ ...filters, searchTerm: e.target.value })
                }
                placeholder="Ara (alıcı, satıcı, ürün)"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <select
              value={filters.deliveryOption}
              onChange={(e) =>
                setFilters({ ...filters, deliveryOption: e.target.value })
              }
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tüm Teslimat Tipleri</option>
              <option value="normal">Normal</option>
              <option value="express">Hızlı</option>
              <option value="gelal">Gelal</option>
              <option value="pickup">Teslim Alma</option>
            </select>

            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) =>
                  setFilters({ ...filters, startDate: e.target.value })
                }
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Başlangıç"
              />
            </div>

            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) =>
                  setFilters({ ...filters, endDate: e.target.value })
                }
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Bitiş"
              />
            </div>

            <button
              onClick={handleApplyFilters}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Filtrele
            </button>

            <button
              onClick={handleExportToExcel}
              disabled={exporting}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              {exporting ? "İndiriliyor..." : "Excel İndir"}
            </button>
          </div>
        </div>

        {/* Orders Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-2 py-2 text-left font-semibold text-gray-900">
                    Tarih
                  </th>
                  <th className="px-2 py-2 text-left font-semibold text-gray-900">
                    Alıcı
                  </th>
                  <th className="px-2 py-2 text-left font-semibold text-gray-900">
                    Satıcı
                  </th>
                  <th className="px-2 py-2 text-left font-semibold text-gray-900">
                    Adres
                  </th>
                  <th className="px-2 py-2 text-left font-semibold text-gray-900">
                    Ürün
                  </th>
                  <th className="px-2 py-2 text-center font-semibold text-gray-900">
                    Adet
                  </th>
                  <th className="px-2 py-2 text-left font-semibold text-gray-900">
                    Özellikler
                  </th>
                  <th className="px-2 py-2 text-right font-semibold text-gray-900">
                    Fiyat
                  </th>
                  <th className="px-2 py-2 text-left font-semibold text-gray-900">
                    Teslimat
                  </th>
                  <th className="px-2 py-2 text-center font-semibold text-gray-900">
  Kupon / İndirim
</th>
                  <th className="px-2 py-2 text-right font-semibold text-gray-900">
                    Komisyon
                  </th>
                  <th className="px-2 py-2 text-right font-semibold text-gray-900">
                    Toplam
                  </th>
                  <th className="px-2 py-2 text-right font-semibold text-gray-900">
                    Satıcı Kazancı
                  </th>
                  <th className="px-2 py-2 text-right font-semibold text-gray-900">
                    Nar24 Kazanç
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td
                      colSpan={14}
                      className="px-2 py-8 text-center text-gray-500"
                    >
                      Yükleniyor...
                    </td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td
                      colSpan={14}
                      className="px-2 py-8 text-center text-gray-500"
                    >
                      Sipariş bulunamadı
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) =>
                    order.items.map((item, idx) => {
                      // Get values from the item data
                      const itemTotal = Number(item.calculatedTotal) || Number(item.price) * Number(item.quantity || 1) || 0;
                      const commissionRate = Number(item.ourComission) || 0;
                      const deliveryPrice = idx === 0 ? Number(order.orderHeader.deliveryPrice) || 0 : 0;
                      
                      // ✅ NEW: Get coupon discount (only for first item row)
                      const couponDiscount = idx === 0 ? Number(order.orderHeader.couponDiscount) || 0 : 0;
                  
                      // Debug log for first item
                      if (idx === 0) {
                        console.log("Order Item Debug:", {
                          orderId: order.orderHeader.id,
                          itemPrice: item.price,
                          itemQuantity: item.quantity,
                          itemTotal,
                          commissionRate,
                          deliveryPrice,
                          couponDiscount,
                          rawItem: item,
                        });
                      }
                  
                      // ✅ FIXED: Correct calculations
                      const commission = (itemTotal * commissionRate) / 100;
                      const totalWithDelivery = itemTotal + deliveryPrice;
                      const sellerEarnings = itemTotal - commission;
                      
                      // ✅ FIXED: Nar24 profit = commission + delivery - coupon discount
                      const ourProfit = commission + deliveryPrice - couponDiscount;

                      return (
                        <tr
                          key={`${order.orderHeader.id}-${item.id}`}
                          className="hover:bg-gray-50"
                        >
                          <td className="px-2 py-2 text-gray-600 whitespace-nowrap">
                            {idx === 0
                              ? order.orderHeader.timestamp
                                  .toDate()
                                  .toLocaleDateString("tr-TR", {
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "2-digit",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                              : ""}
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-1">
                              <User className="w-3 h-3 text-blue-600 flex-shrink-0" />
                              <span className="text-gray-900 font-medium truncate max-w-[100px]">
                                {item.buyerName}
                              </span>
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-1">
                              {item.isShopProduct ? (
                                <Store className="w-3 h-3 text-purple-600 flex-shrink-0" />
                              ) : (
                                <User className="w-3 h-3 text-green-600 flex-shrink-0" />
                              )}
                              <span className="text-gray-900 font-medium truncate max-w-[120px]">
                                {item.sellerName}
                              </span>
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-orange-600 flex-shrink-0" />
                              <span className="text-gray-600 truncate max-w-[120px]">
                                {idx === 0
                                  ? formatAddress(
                                      order.orderHeader.address ||
                                        order.orderHeader.pickupPoint
                                    )
                                  : ""}
                              </span>
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <span className="text-gray-900 truncate max-w-[150px] block">
                              {item.productName}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-center">
                            <span className="inline-flex items-center justify-center px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full font-medium">
                              {item.quantity}
                            </span>
                          </td>
                          <td className="px-2 py-2">
                            <span className="text-gray-600 text-xs truncate max-w-[120px] block">
                              {formatDynamicAttributes(item.selectedAttributes)}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-right">
                            <span className="text-gray-900 font-medium">
                              {itemTotal.toFixed(2)} TL
                            </span>
                          </td>
                          <td className="px-2 py-2">
                            {idx === 0 && (
                              <div className="flex flex-col">
                                <span className="text-gray-900 text-xs">
                                  {getDeliveryLabel(
                                    order.orderHeader.deliveryOption
                                  )}
                                </span>
                                <span className="text-gray-600 text-xs">
                                  {deliveryPrice.toFixed(2)} TL
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2">
  {idx === 0 && (
    <div className="flex flex-col gap-1">
      {/* Coupon */}
      {order.orderHeader.couponDiscount && order.orderHeader.couponDiscount > 0 ? (
        <div className="flex items-center gap-1">
          <span className="inline-flex items-center px-1.5 py-0.5 bg-green-100 text-green-800 rounded text-xs font-medium">
            🎟️ -{order.orderHeader.couponDiscount.toFixed(0)} TL
          </span>
        </div>
      ) : null}
      
      {/* Free Shipping */}
      {order.orderHeader.freeShippingApplied ? (
        <div className="flex items-center gap-1">
          <span className="inline-flex items-center px-1.5 py-0.5 bg-teal-100 text-teal-800 rounded text-xs font-medium">
            🚚 Ücretsiz
          </span>
          {order.orderHeader.originalDeliveryPrice ? (
            <span className="text-gray-400 line-through text-xs">
              {order.orderHeader.originalDeliveryPrice.toFixed(0)} TL
            </span>
          ) : null}
        </div>
      ) : null}
      
      {/* No discount */}
      {!order.orderHeader.couponDiscount && !order.orderHeader.freeShippingApplied && (
        <span className="text-gray-400 text-xs">-</span>
      )}
    </div>
  )}
</td>
                          <td className="px-2 py-2 text-right">
                            <div className="flex flex-col items-end">
                              <span className="text-purple-900 font-medium">
                                %{commissionRate}
                              </span>
                              <span className="text-purple-600 text-xs">
                                ({commission.toFixed(2)} TL)
                              </span>
                            </div>
                          </td>
                          <td className="px-2 py-2 text-right">
                            <span className="text-gray-900 font-bold">
                              {totalWithDelivery.toFixed(2)} TL
                            </span>
                          </td>
                          <td className="px-2 py-2 text-right">
                            <span className="text-green-900 font-medium">
                              {sellerEarnings.toFixed(2)} TL
                            </span>
                          </td>
                          <td className="px-2 py-2 text-right">
                            <span className="text-pink-900 font-bold">
                              {ourProfit.toFixed(2)} TL
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Sayfa {currentPage} - Bu sayfada {filteredOrders.length} sipariş
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevPage}
                disabled={!hasPrevious || loading}
                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Önceki
              </button>
              <button
                onClick={handleNextPage}
                disabled={!hasMore || loading}
                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Sonraki
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* Pause Sales Modal */}
{showPauseModal && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
      <div className="bg-orange-50 px-6 py-4 border-b border-orange-100">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 bg-orange-100 rounded-full">
            <Pause className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Satışları Durdur
            </h3>
            <p className="text-sm text-gray-600">
              Tüm siparişler geçici olarak durdurulacak
            </p>
          </div>
        </div>
      </div>

      <div className="p-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Durdurma Sebebi (İsteğe bağlı)
        </label>
        <textarea
          value={pauseReason}
          onChange={(e) => setPauseReason(e.target.value)}
          placeholder="Örn: Sistem bakımı, stok sayımı..."
          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
          rows={3}
        />
        <p className="text-xs text-gray-500 mt-2">
          Bu mesaj kullanıcılara gösterilecektir.
        </p>
      </div>

      <div className="bg-gray-50 px-6 py-4 flex gap-3 justify-end">
        <button
          onClick={() => {
            setShowPauseModal(false);
            setPauseReason("");
          }}
          className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          İptal
        </button>
        <button
          onClick={() => handleToggleSalesPause(true, pauseReason)}
          disabled={togglingPause}
          className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {togglingPause && (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          )}
          Satışları Durdur
        </button>
      </div>
    </div>
  </div>
)}
    </div>
  );
}
