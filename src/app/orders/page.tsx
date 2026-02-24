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
  ArrowLeft,
  Clock,
} from "lucide-react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { Pause, Play, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { searchOrders, type OrderHit as AlgoliaOrderHit } from "@/app/lib/typesense/searchService";

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
  productImage?: string;
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
  distributionStatus?: string;
  distributedByName?: string;
  allItemsGathered?: boolean;
  gatheringStatus?: string;
  gatheredByName?: string;
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
  const [selectedOrder, setSelectedOrder] = useState<CombinedOrder | null>(null);

  // Typesense search state
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<AlgoliaOrderHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearchMode, setIsSearchMode] = useState(false);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        (item.selectedAttributes as Record<string, unknown>)?.calculatedTotal as number ||
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

  // Typesense search handler - only called on Enter or button click
  const handleSearch = async () => {
    const query = searchInput.trim();

    if (!query) {
      // Clear search and return to normal view
      setSearchResults([]);
      setIsSearchMode(false);
      setSearchError(null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setIsSearchMode(true);

    try {
      const result = await searchOrders(query, {
        hitsPerPage: 100,
      });
      setSearchResults(result.hits);
    } catch (error) {
      console.error("Search error:", error);
      setSearchError("Arama sırasında bir hata oluştu. Lütfen tekrar deneyin.");
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Handle Enter key press in search input
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  // Clear search and return to normal view
  const handleClearSearch = () => {
    setSearchInput("");
    setSearchResults([]);
    setIsSearchMode(false);
    setSearchError(null);
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
          (item.selectedAttributes as Record<string, unknown>)?.calculatedTotal as number ||
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

  // Format search timestamp
  const formatSearchTimestamp = (timestamp: { _seconds: number; _nanoseconds: number } | null) => {
    if (!timestamp) return "—";
    const date = new Date(timestamp._seconds * 1000);
    return date.toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Get delivery status badge for search results
  const getDeliveryStatus = (hit: AlgoliaOrderHit) => {
    const distributionStatus = hit.distributionStatus as string | undefined;
    const gatheringStatus = hit.gatheringStatus;
    const allItemsGathered = hit.allItemsGathered as boolean | undefined;

    if (distributionStatus === "delivered") {
      return { label: "Teslim Edildi", className: "bg-green-100 text-green-700" };
    }
    if (distributionStatus === "assigned" || distributionStatus === "in_progress" || distributionStatus === "distributed") {
      return { label: "Dağıtımda", className: "bg-blue-100 text-blue-700" };
    }
    if (allItemsGathered || gatheringStatus === "at_warehouse") {
      return { label: "Depoda", className: "bg-purple-100 text-purple-700" };
    }
    if (gatheringStatus === "assigned") {
      return { label: "Toplanıyor", className: "bg-orange-100 text-orange-700" };
    }
    return { label: "Bekliyor", className: "bg-gray-100 text-gray-600" };
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="w-full">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => window.history.back()}
                className="flex items-center justify-center w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
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

          {/* Search Bar */}
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Ara (alıcı, satıcı, ürün) - Enter ile ara"
                  className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {searchInput && (
                  <button
                    onClick={handleClearSearch}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                onClick={handleSearch}
                disabled={isSearching}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {isSearching ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                Ara
              </button>
              {isSearchMode && (
                <span className="text-sm text-gray-600">
                  {searchResults.length} sonuç bulundu
                </span>
              )}
            </div>
            {searchError && (
              <p className="mt-2 text-sm text-red-600">{searchError}</p>
            )}
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
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

        {/* Search Results or Orders Table */}
        {isSearchMode ? (
          /* Search Results */
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-blue-50 border-b border-blue-200 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-900">
                  Arama Sonuçları: &quot;{searchInput}&quot;
                </span>
              </div>
              <button
                onClick={handleClearSearch}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Aramayı Temizle
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-900">Tarih</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-900">Sipariş ID</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-900">Ürün</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-900">Alıcı</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-900">Satıcı</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-900">Adet</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-900">Fiyat</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-900">Kategori</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-900">Teslimat Durumu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {isSearching ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-8 text-center text-gray-500">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                          Aranıyor...
                        </div>
                      </td>
                    </tr>
                  ) : searchResults.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-8 text-center text-gray-500">
                        Sonuç bulunamadı
                      </td>
                    </tr>
                  ) : (
                    searchResults.map((hit) => {
                      const deliveryStatus = getDeliveryStatus(hit);
                      const isDelivered = (hit.distributionStatus as string) === "delivered";
                      const isPending = !hit.distributionStatus && !hit.gatheringStatus && !hit.allItemsGathered;
                      const rowBgClass = isDelivered
                        ? "bg-green-50 hover:bg-green-100"
                        : isPending
                          ? "bg-yellow-50 hover:bg-yellow-100"
                          : "hover:bg-gray-50";

                      return (
                        <tr key={hit.id} className={rowBgClass}>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                            {formatSearchTimestamp(hit.timestamp)}
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-gray-500 font-mono text-xs">
                              #{hit.orderId.slice(0, 8)}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col">
                              <span className="text-gray-900 font-medium truncate max-w-[200px]">
                                {hit.productName}
                              </span>
                              {hit.brandModel && (
                                <span className="text-gray-500 text-xs">{hit.brandModel}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1">
                              <User className="w-3 h-3 text-blue-600 flex-shrink-0" />
                              <span className="text-gray-900 font-medium truncate max-w-[120px]">
                                {hit.buyerName}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1">
                              <Store className="w-3 h-3 text-purple-600 flex-shrink-0" />
                              <span className="text-gray-900 font-medium truncate max-w-[120px]">
                                {hit.sellerName}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className="inline-flex items-center justify-center px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full font-medium">
                              {hit.quantity}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className="text-gray-900 font-medium">
                              {hit.price} {(hit.currency as string) || "TL"}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-gray-600 truncate max-w-[100px] block">
                              {hit.category || "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${deliveryStatus.className}`}>
                              {deliveryStatus.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Regular Orders Table */
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
                  <th className="px-2 py-2 text-left font-semibold text-gray-900">
                    Teslimat Durumu
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td
                      colSpan={15}
                      className="px-2 py-8 text-center text-gray-500"
                    >
                      Yükleniyor...
                    </td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td
                      colSpan={15}
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
                  
                      // Calculate financials
                      const commission = (itemTotal * commissionRate) / 100;
                      const totalWithDelivery = itemTotal + deliveryPrice;
                      const sellerEarnings = itemTotal - commission;
                      
                      // ✅ FIXED: Nar24 profit = commission + delivery - coupon discount
                      const ourProfit = commission + deliveryPrice - couponDiscount;

                      // Determine row background color based on delivery status
                      const isDelivered = order.orderHeader.distributionStatus === "delivered";
                      const isPending = !order.orderHeader.distributionStatus && !order.orderHeader.gatheringStatus && !order.orderHeader.allItemsGathered;

                      const rowBgClass = isDelivered
                        ? "bg-green-50 hover:bg-green-100"
                        : isPending
                          ? "bg-yellow-50 hover:bg-yellow-100"
                          : "hover:bg-gray-50";

                      return (
                        <tr
                          key={`${order.orderHeader.id}-${item.id}`}
                          className={`${rowBgClass} cursor-pointer`}
                          onClick={() => setSelectedOrder(order)}
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
                          <td className="px-2 py-2">
                            {idx === 0 && (
                              <div className="flex flex-col gap-1">
                                {order.orderHeader.distributionStatus === "delivered" ? (
                                  <span className="inline-flex items-center px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                    Teslim Edildi
                                  </span>
                                ) : order.orderHeader.distributionStatus === "assigned" || order.orderHeader.distributionStatus === "in_progress" || order.orderHeader.distributionStatus === "distributed" ? (
                                  <div className="flex flex-col gap-0.5">
                                    <span className="inline-flex items-center px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                                      Dağıtımda
                                    </span>
                                    {order.orderHeader.distributedByName && (
                                      <span className="text-xs text-gray-600 truncate max-w-[100px]">
                                        {order.orderHeader.distributedByName}
                                      </span>
                                    )}
                                  </div>
                                ) : order.orderHeader.allItemsGathered || order.orderHeader.gatheringStatus === "at_warehouse" ? (
                                  <span className="inline-flex items-center px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                                    Depoda
                                  </span>
                                ) : order.orderHeader.gatheringStatus === "assigned" ? (
                                  <div className="flex flex-col gap-0.5">
                                    <span className="inline-flex items-center px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                                      Toplanıyor
                                    </span>
                                    {order.orderHeader.gatheredByName && (
                                      <span className="text-xs text-gray-600 truncate max-w-[100px]">
                                        {order.orderHeader.gatheredByName}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                                    Bekliyor
                                  </span>
                                )}
                              </div>
                            )}
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
        )}
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

{/* Order Detail Modal */}
{selectedOrder && (() => {
  const o = selectedOrder;
  const header = o.orderHeader;
  const date = header.timestamp.toDate();

  // Calculate order-level totals
  let itemsTotal = 0;
  let totalCommission = 0;
  o.items.forEach((item) => {
    const t = Number(item.calculatedTotal) || Number(item.price) * Number(item.quantity || 1) || 0;
    itemsTotal += t;
    totalCommission += (t * (Number(item.ourComission) || 0)) / 100;
  });
  const deliveryPrice = Number(header.deliveryPrice) || 0;
  const couponDiscount = Number(header.couponDiscount) || 0;
  const grandTotal = itemsTotal + deliveryPrice;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedOrder(null)}>
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="bg-blue-50 px-6 py-4 border-b border-blue-100 flex items-center justify-between sticky top-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-full">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Sipariş Detayı</h3>
              <p className="text-xs text-gray-500 font-mono">#{header.id.slice(0, 12)}</p>
            </div>
          </div>
          <button onClick={() => setSelectedOrder(null)} className="p-2 hover:bg-blue-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Date & Delivery Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Calendar className="w-4 h-4" />
              <span>{date.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" })}</span>
              <span className="text-gray-400">|</span>
              <Clock className="w-4 h-4" />
              <span>{date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            {header.distributionStatus === "delivered" ? (
              <span className="inline-flex items-center px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Teslim Edildi</span>
            ) : header.distributionStatus === "assigned" || header.distributionStatus === "in_progress" || header.distributionStatus === "distributed" ? (
              <span className="inline-flex items-center px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">Dağıtımda</span>
            ) : header.allItemsGathered || header.gatheringStatus === "at_warehouse" ? (
              <span className="inline-flex items-center px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">Depoda</span>
            ) : header.gatheringStatus === "assigned" ? (
              <span className="inline-flex items-center px-2.5 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">Toplanıyor</span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">Bekliyor</span>
            )}
          </div>

          {/* Buyer & Seller Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <User className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-medium text-blue-900">Alıcı</span>
              </div>
              <p className="text-sm font-semibold text-gray-900">{o.items[0]?.buyerName || "—"}</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                {o.items[0]?.isShopProduct ? (
                  <Store className="w-4 h-4 text-purple-600" />
                ) : (
                  <User className="w-4 h-4 text-green-600" />
                )}
                <span className="text-xs font-medium text-purple-900">Satıcı</span>
              </div>
              <p className="text-sm font-semibold text-gray-900">{o.items[0]?.sellerName || "—"}</p>
              <p className="text-xs text-gray-500">{o.items[0]?.isShopProduct ? "Mağaza" : "Bireysel"}</p>
            </div>
          </div>

          {/* Delivery & Address */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-orange-50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Truck className="w-4 h-4 text-orange-600" />
                <span className="text-xs font-medium text-orange-900">Teslimat</span>
              </div>
              <p className="text-sm font-semibold text-gray-900">{getDeliveryLabel(header.deliveryOption)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="w-4 h-4 text-gray-600" />
                <span className="text-xs font-medium text-gray-700">Adres</span>
              </div>
              <p className="text-sm text-gray-900">{formatAddress(header.address || header.pickupPoint)}</p>
              {header.address?.phoneNumber && (
                <p className="text-xs text-gray-500 mt-1">{header.address.phoneNumber}</p>
              )}
            </div>
          </div>

          {/* Products */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Ürünler ({o.items.length})</h4>
            <div className="space-y-3">
              {o.items.map((item) => {
                const imageUrl = (item.selectedAttributes?.selectedColorImage as string) || item.productImage;
                const itemTotal = Number(item.calculatedTotal) || Number(item.price) * Number(item.quantity || 1) || 0;
                return (
                  <div key={item.id} className="flex gap-4 bg-gray-50 rounded-lg p-3">
                    {/* Product Image */}
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={item.productName}
                        className="w-20 h-20 object-cover rounded-lg border border-gray-200 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-20 h-20 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Package className="w-8 h-8 text-gray-400" />
                      </div>
                    )}
                    {/* Product Details */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{item.productName}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{formatDynamicAttributes(item.selectedAttributes)}</p>
                      <div className="flex items-center gap-4 mt-2">
                        <span className="text-xs text-gray-600">Adet: <span className="font-medium text-gray-900">{item.quantity}</span></span>
                        <span className="text-xs text-gray-600">Birim: <span className="font-medium text-gray-900">{Number(item.calculatedUnitPrice || item.price || 0).toFixed(2)} TL</span></span>
                        <span className="text-xs text-gray-600">Komisyon: <span className="font-medium text-purple-700">%{item.ourComission}</span></span>
                      </div>
                      <p className="text-sm font-bold text-gray-900 mt-1">{itemTotal.toFixed(2)} TL</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Price Breakdown */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Ürün Toplamı</span>
              <span className="text-gray-900 font-medium">{itemsTotal.toFixed(2)} TL</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Teslimat Ücreti</span>
              <span className="text-gray-900 font-medium">
                {header.freeShippingApplied ? (
                  <span className="flex items-center gap-2">
                    <span className="line-through text-gray-400">{(header.originalDeliveryPrice || deliveryPrice).toFixed(2)} TL</span>
                    <span className="text-green-600">Ücretsiz</span>
                  </span>
                ) : (
                  `${deliveryPrice.toFixed(2)} TL`
                )}
              </span>
            </div>
            {couponDiscount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Kupon İndirimi {header.couponCode && <span className="text-xs text-gray-400">({header.couponCode})</span>}</span>
                <span className="text-green-600 font-medium">-{couponDiscount.toFixed(2)} TL</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Komisyon Toplamı</span>
              <span className="text-purple-700 font-medium">{totalCommission.toFixed(2)} TL</span>
            </div>
            <div className="border-t border-gray-200 pt-2 flex justify-between text-sm">
              <span className="font-semibold text-gray-900">Genel Toplam</span>
              <span className="font-bold text-gray-900 text-base">{grandTotal.toFixed(2)} TL</span>
            </div>
          </div>

          {/* Payment Method */}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <DollarSign className="w-4 h-4" />
            <span>Ödeme: <span className="font-medium text-gray-900">{header.paymentMethod || "—"}</span></span>
          </div>
        </div>
      </div>
    </div>
  );
})()}
    </div>
  );
}
