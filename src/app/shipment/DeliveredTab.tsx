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
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { CombinedOrder, OrderHeader, OrderItem } from "./types";
import { DeliveredTabShimmer } from "./ShipmentShimmer";

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
    const allDelivered = order.items.every(isItemDelivered);
    if (allDelivered) return false;
    const someDelivered = order.items.some(isItemDelivered);
    return someDelivered;
  };

  const formatProducts = (items: OrderItem[]): string => {
    return items.map((item) => `${item.productName} (x${item.quantity})`).join(", ");
  };

  if (loading) {
    return <DeliveredTabShimmer />;
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

      {/* Orders Table */}
      {filteredOrders.length === 0 ? (
        <div className="text-center py-8 text-gray-500 bg-white rounded-lg border border-gray-200">
          Teslim edilmiş sipariş bulunamadı
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Durum
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Sipariş No
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Alıcı
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Ürünler
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Adres
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Telefon
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Teslim Eden
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Teslim Tarihi
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Süre
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredOrders.map((order) => {
                  const isPartial = isPartialDelivery(order);
                  return (
                    <tr
                      key={order.orderHeader.id}
                      className={`hover:bg-gray-50 ${isPartial ? "bg-amber-50/50" : ""}`}
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        {isPartial ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                            <AlertCircle className="w-3 h-3" />
                            Kısmi
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            <CheckCircle className="w-3 h-3" />
                            Teslim
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="text-xs font-mono text-gray-600">
                          #{order.orderHeader.id.substring(0, 8)}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-medium text-gray-900">
                          {order.orderHeader.buyerName || "-"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className="text-gray-700 max-w-xs truncate block"
                          title={formatProducts(order.items)}
                        >
                          {formatProducts(order.items)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-gray-600 max-w-xs truncate block" title={formatAddress(order.orderHeader)}>
                          {formatAddress(order.orderHeader)}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="text-gray-600">
                          {order.orderHeader.address?.phoneNumber || "-"}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="text-blue-700 font-medium">
                          {order.orderHeader.distributedByName || "-"}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="text-gray-600">
                          {formatDateTime(order.orderHeader.deliveredAt)}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="text-gray-500 text-xs">
                          {calculateDeliveryTime(order.orderHeader)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
