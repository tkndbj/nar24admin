"use client";

import { useState, useMemo, useEffect } from "react";
import {
  collection,
  query as firestoreQuery,
  getDocs,
  where,
  orderBy as firestoreOrderBy,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/app/lib/firebase";
import {
  Package,
  MapPin,
  Phone,
  CheckCircle,
  Calendar,
  User,
  Clock,
} from "lucide-react";
import { CombinedOrder, OrderHeader, OrderItem } from "./types";

interface DeliveredTabProps {
  searchTerm: string;
}

export default function DeliveredTab({ searchTerm }: DeliveredTabProps) {
  const [deliveredOrders, setDeliveredOrders] = useState<CombinedOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateFilter, setDateFilter] = useState<
    "today" | "week" | "month" | "all"
  >("week");
  const [stats, setStats] = useState({
    totalDelivered: 0,
    todayDelivered: 0,
    weekDelivered: 0,
  });

  useEffect(() => {
    loadDeliveredOrders();
  }, [dateFilter]);

  const loadDeliveredOrders = async () => {
    setLoading(true);
    try {
      // Calculate date range
      const now = new Date();
      let startDate = new Date();

      switch (dateFilter) {
        case "today":
          startDate.setHours(0, 0, 0, 0);
          break;
        case "week":
          startDate.setDate(now.getDate() - 7);
          break;
        case "month":
          startDate.setMonth(now.getMonth() - 1);
          break;
        default:
          startDate = new Date(2020, 0, 1); // All time
      }

      // Query for ALL orders that have been delivered at least once
      // This includes partial deliveries that may now be "assigned" for completion
      const deliveredQuery = firestoreQuery(
        collection(db, "orders"),
        where("deliveredAt", ">=", Timestamp.fromDate(startDate)),
        firestoreOrderBy("deliveredAt", "desc")
      );

      const ordersSnapshot = await getDocs(deliveredQuery);

      // Fetch items for each order
      const ordersWithItems: CombinedOrder[] = await Promise.all(
        ordersSnapshot.docs.map(async (orderDoc) => {
          const orderData = orderDoc.data() as OrderHeader;
          orderData.id = orderDoc.id;

          const itemsSnapshot = await getDocs(
            collection(db, "orders", orderDoc.id, "items")
          );

          const items: OrderItem[] = itemsSnapshot.docs.map((itemDoc) => ({
            id: itemDoc.id,
            ...itemDoc.data(),
          })) as OrderItem[];

          return { orderHeader: orderData, items };
        })
      );

      setDeliveredOrders(ordersWithItems);

      // Calculate stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekAgo = new Date();
      weekAgo.setDate(today.getDate() - 7);

      const todayCount = ordersWithItems.filter((order) => {
        const deliveredAt = order.orderHeader.deliveredAt?.toDate();
        return deliveredAt && deliveredAt >= today;
      }).length;

      const weekCount = ordersWithItems.filter((order) => {
        const deliveredAt = order.orderHeader.deliveredAt?.toDate();
        return deliveredAt && deliveredAt >= weekAgo;
      }).length;

      setStats({
        totalDelivered: ordersWithItems.length,
        todayDelivered: todayCount,
        weekDelivered: weekCount,
      });
    } catch (error) {
      console.error("Error loading delivered orders:", error);
      alert("Teslim edilmiş siparişler yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  // Filter by search term
  const filteredOrders = useMemo(() => {
    if (!searchTerm) return deliveredOrders;

    const term = searchTerm.toLowerCase();
    return deliveredOrders.filter(
      (order) =>
        order.orderHeader.buyerName?.toLowerCase().includes(term) ||
        order.orderHeader.distributedByName?.toLowerCase().includes(term) ||
        order.items.some((item) =>
          item.productName.toLowerCase().includes(term)
        ) ||
        order.orderHeader.id.toLowerCase().includes(term)
    );
  }, [deliveredOrders, searchTerm]);

  const formatAddress = (order: OrderHeader) => {
    if (order.address) {
      return `${order.address.addressLine1}, ${order.address.city}`;
    } else if (order.pickupPoint) {
      return order.pickupPoint.pickupPointName;
    }
    return "-";
  };

  const formatDateTime = (timestamp: Timestamp | undefined) => {
    if (!timestamp) return "-";
    return timestamp.toDate().toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDateShort = (timestamp: Timestamp | undefined) => {
    if (!timestamp) return "-";
    return timestamp.toDate().toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  };

  const calculateDeliveryTime = (order: OrderHeader) => {
    if (!order.distributedAt || !order.deliveredAt) return "-";

    const distributed = order.distributedAt.toDate();
    const delivered = order.deliveredAt.toDate();
    const diffMs = delivered.getTime() - distributed.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHours > 0) {
      return `${diffHours} saat ${diffMinutes} dakika`;
    }
    return `${diffMinutes} dakika`;
  };

  // Helper function to check if an item is delivered
  const isItemDelivered = (item: OrderItem): boolean => {
    return (
      item.gatheringStatus === "delivered" ||
      item.deliveryStatus === "delivered" ||
      item.deliveredInPartial === true
    );
  };

  const isPartialDelivery = (order: CombinedOrder): boolean => {
    // If all items are delivered, it's NOT a partial delivery
    const allDelivered = order.items.every(isItemDelivered);
    if (allDelivered) {
      return false;
    }

    // If some items are delivered but not all, it IS a partial delivery
    const someDelivered = order.items.some(isItemDelivered);
    return someDelivered;
  };

  const renderOrderCard = (order: CombinedOrder) => {
    const isPartial = isPartialDelivery(order);

    // Determine colors based on delivery status
    const headerBgColor = isPartial ? "bg-amber-50" : "bg-green-50";
    const headerBorderColor = isPartial
      ? "border-amber-200"
      : "border-green-200";
    const iconColor = isPartial ? "text-amber-600" : "text-green-600";
    const textColor = isPartial ? "text-amber-600" : "text-green-600";
    const deliveryLabel = isPartial ? "Kısmi Teslimat:" : "Teslim Edildi:";

    return (
      <div
        key={order.orderHeader.id}
        className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow"
      >
        {/* Order Header with Delivery Info */}
        <div className={`${headerBgColor} p-3 border-b ${headerBorderColor}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                {isPartial ? (
                  <Clock className={`w-5 h-5 ${iconColor}`} />
                ) : (
                  <CheckCircle className={`w-5 h-5 ${iconColor}`} />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900">
                      {order.orderHeader.buyerName || "Alıcı"}
                    </p>
                    {isPartial && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-amber-700 bg-amber-100">
                        Kısmi Teslimat - Tamamlanması Gerekiyor
                      </span>
                    )}
                  </div>
                  <p className={`text-xs ${textColor}`}>
                    {deliveryLabel}{" "}
                    {formatDateTime(order.orderHeader.deliveredAt)}
                  </p>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">
                #{order.orderHeader.id.substring(0, 8)}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Teslimat Süresi: {calculateDeliveryTime(order.orderHeader)}
              </p>
            </div>
          </div>
        </div>

        {/* Address and Contact Info */}
        <div className="p-3 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-gray-500">Teslimat Adresi</p>
                <p className="text-sm text-gray-700">
                  {formatAddress(order.orderHeader)}
                </p>
              </div>
            </div>
            {order.orderHeader.address?.phoneNumber && (
              <div className="flex items-start gap-2">
                <Phone className="w-4 h-4 text-gray-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs text-gray-500">Telefon</p>
                  <p className="text-sm text-gray-700">
                    {order.orderHeader.address.phoneNumber}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Order Items */}
        <div className="p-3">
          <p className="text-xs text-gray-500 mb-2">
            Ürünler ({order.items.length})
          </p>
          <div className="space-y-2">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between py-1"
              >
                <div className="flex items-center gap-2">
                  <Package className="w-3 h-3 text-gray-400" />
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-700">
                      {item.productName}
                    </span>
                    {/* Show delivery status for all items */}
                    {(() => {
                      // Check if item is delivered (any method)
                      const isDelivered =
                        item.gatheringStatus === "delivered" ||
                        item.deliveryStatus === "delivered" ||
                        item.deliveredInPartial;

                      if (isDelivered) {
                        return (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white bg-green-600">
                            Teslim Edildi
                          </span>
                        );
                      } else if (item.gatheringStatus === "at_warehouse") {
                        return (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-blue-700 bg-blue-50">
                            Teslimata Hazır
                          </span>
                        );
                      } else {
                        return (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-amber-700 bg-amber-50">
                            {item.gatheringStatus === "pending" && "Toplanacak"}
                            {item.gatheringStatus === "assigned" &&
                              "Toplanıyor"}
                            {item.gatheringStatus === "gathered" && "Yolda"}
                            {item.gatheringStatus === "failed" && "Başarısız"}
                          </span>
                        );
                      }
                    })()}
                  </div>
                </div>
                <span className="text-sm font-medium text-gray-900">
                  x{item.quantity}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer with Distributor Info */}
        <div className="bg-gray-50 p-3 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-blue-600" />
              <div>
                <p className="text-xs text-gray-500">Teslim Eden</p>
                <p className="text-sm font-medium text-blue-900">
                  {order.orderHeader.distributedByName || "-"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Sipariş Tarihi</p>
                <p className="text-sm text-gray-700">
                  {formatDateShort(order.orderHeader.timestamp)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Yükleniyor...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Bugün Teslim</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.todayDelivered}
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <Clock className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Bu Hafta</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.weekDelivered}
              </p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <Calendar className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Toplam Gösterilen</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.totalDelivered}
              </p>
            </div>
            <div className="p-3 bg-purple-100 rounded-lg">
              <Package className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Date Filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">
          Tarih Filtresi:
        </span>
        <div className="flex gap-2">
          {["today", "week", "month", "all"].map((filter) => (
            <button
              key={filter}
              onClick={() =>
                setDateFilter(filter as "today" | "week" | "month" | "all")
              }
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                dateFilter === filter
                  ? "bg-green-600 text-white"
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {filter === "today" && "Bugün"}
              {filter === "week" && "Bu Hafta"}
              {filter === "month" && "Bu Ay"}
              {filter === "all" && "Tümü"}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Grid */}
      {filteredOrders.length === 0 ? (
        <div className="text-center py-8 text-gray-500 bg-white rounded-lg border border-gray-200">
          Teslim edilmiş sipariş bulunamadı
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredOrders.map((order) => renderOrderCard(order))}
        </div>
      )}
    </div>
  );
}
