"use client";

import { useState, useMemo, useEffect } from "react";
import {
  collection,
  query as firestoreQuery,
  getDocs,
  doc,
  updateDoc,
  Timestamp,
  where,
  orderBy as firestoreOrderBy,
} from "firebase/firestore";
import { db } from "@/app/lib/firebase";
import { Package, MapPin, CheckCircle, Truck, X, Phone } from "lucide-react";
import { CombinedOrder, OrderHeader, OrderItem, CargoUser } from "./types";

interface DistributionTabProps {
  cargoUsers: CargoUser[];
  searchTerm: string;
  selectedOrders: Set<string>;
  setSelectedOrders: React.Dispatch<React.SetStateAction<Set<string>>>;
  onTransferToGathering: (orderIds: string[]) => Promise<void>;
  transferringItems: boolean;
}

export default function DistributionTab({
  cargoUsers,
  searchTerm,
  selectedOrders,
  setSelectedOrders,
  onTransferToGathering,
  transferringItems,
}: DistributionTabProps) {
  const [unassignedOrders, setUnassignedOrders] = useState<CombinedOrder[]>([]);
  const [assignedOrders, setAssignedOrders] = useState<CombinedOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigningCargo, setAssigningCargo] = useState(false);

  useEffect(() => {
    loadDistributionOrders();
  }, []);

  // Load orders that are ready for distribution (all items gathered)
  const loadDistributionOrders = async () => {
    setLoading(true);
    try {
      // Query for unassigned orders (ready for distribution)
      const unassignedQuery = firestoreQuery(
        collection(db, "orders"),
        where("allItemsGathered", "==", true),
        where("distributionStatus", "==", "ready"),
        firestoreOrderBy("timestamp", "desc")
      );
  
      // Query for assigned/distributed orders
      const assignedQuery = firestoreQuery(
        collection(db, "orders"),
        where("allItemsGathered", "==", true),
        where("distributionStatus", "in", ["assigned", "distributed"]),
        firestoreOrderBy("timestamp", "desc")
      );
  
      // Query for failed orders
      const failedQuery = firestoreQuery(
        collection(db, "orders"),
        where("allItemsGathered", "==", true),
        where("distributionStatus", "==", "failed"),
        firestoreOrderBy("timestamp", "desc")
      );
  
      const [unassignedSnapshot, assignedSnapshot, failedSnapshot] = await Promise.all([
        getDocs(unassignedQuery),
        getDocs(assignedQuery),
        getDocs(failedQuery),
      ]);
  
      // Process unassigned orders
      const unassignedOrdersData: CombinedOrder[] = await Promise.all(
        unassignedSnapshot.docs.map(async (orderDoc) => {
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
  
      // Process assigned orders
      const assignedOrdersData: CombinedOrder[] = await Promise.all(
        assignedSnapshot.docs.map(async (orderDoc) => {
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
  
      // Process failed orders
      const failedOrdersData: CombinedOrder[] = await Promise.all(
        failedSnapshot.docs.map(async (orderDoc) => {
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
  
      setUnassignedOrders(unassignedOrdersData);
      // Combine assigned and failed orders for the right column
      setAssignedOrders([...assignedOrdersData, ...failedOrdersData]);
    } catch (error) {
      console.error("Error loading distribution orders:", error);
      alert("Siparişler yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  // Unassign distributor from order
  const handleUnassignDistributor = async (orderId: string) => {
    if (!confirm("Bu siparişten dağıtıcıyı kaldırmak istiyor musunuz?")) {
      return;
    }

    try {
      const orderRef = doc(db, "orders", orderId);
      await updateDoc(orderRef, {
        distributionStatus: "ready",
        distributedBy: null,
        distributedByName: null,
        distributedAt: null,
        deliveredAt: null,
      });

      alert("Dağıtıcı atama kaldırıldı");
      loadDistributionOrders();
    } catch (error) {
      console.error("Error unassigning distributor:", error);
      alert("Atama kaldırılırken hata oluştu");
    }
  };

  // Filter orders by search term
  const filteredUnassignedOrders = useMemo(() => {
    if (!searchTerm) return unassignedOrders;

    const term = searchTerm.toLowerCase();
    return unassignedOrders.filter(
      (order) =>
        order.orderHeader.buyerName?.toLowerCase().includes(term) ||
        order.items.some((item) =>
          item.productName.toLowerCase().includes(term)
        ) ||
        order.orderHeader.id.toLowerCase().includes(term)
    );
  }, [unassignedOrders, searchTerm]);

  const filteredAssignedOrders = useMemo(() => {
    if (!searchTerm) return assignedOrders;

    const term = searchTerm.toLowerCase();
    return assignedOrders.filter(
      (order) =>
        order.orderHeader.buyerName?.toLowerCase().includes(term) ||
        order.items.some((item) =>
          item.productName.toLowerCase().includes(term)
        ) ||
        order.orderHeader.id.toLowerCase().includes(term)
    );
  }, [assignedOrders, searchTerm]);

  // Assign selected orders to distributor
  const handleAssignToDistributor = async (cargoUserId: string) => {
    if (selectedOrders.size === 0) {
      alert("Lütfen en az bir sipariş seçin");
      return;
    }

    const cargoUser = cargoUsers.find((u) => u.id === cargoUserId);
    if (!cargoUser) {
      alert("Kargo personeli bulunamadı");
      return;
    }

    setAssigningCargo(true);
    try {
      await Promise.all(
        Array.from(selectedOrders).map(async (orderId) => {
          const orderRef = doc(db, "orders", orderId);
          await updateDoc(orderRef, {
            distributionStatus: "assigned",
            distributedBy: cargoUserId,
            distributedByName: cargoUser.displayName,
            distributedAt: Timestamp.now(),
          });
        })
      );

      alert(
        `${selectedOrders.size} sipariş ${cargoUser.displayName} tarafından dağıtılacak`
      );
      setSelectedOrders(new Set());
      loadDistributionOrders();
    } catch (error) {
      console.error("Error assigning orders:", error);
      alert("Sipariş atama sırasında hata oluştu");
    } finally {
      setAssigningCargo(false);
    }
  };

  // Mark orders as delivered
  const handleMarkAsDelivered = async (orderIds: string[]) => {
    if (
      !confirm(
        `${orderIds.length} siparişi teslim edildi olarak işaretlemek istiyor musunuz?`
      )
    ) {
      return;
    }

    try {
      await Promise.all(
        orderIds.map(async (orderId) => {
          const orderRef = doc(db, "orders", orderId);
          await updateDoc(orderRef, {
            distributionStatus: "delivered",
            deliveredAt: Timestamp.now(),
          });
        })
      );

      alert(`${orderIds.length} sipariş teslim edildi olarak işaretlendi`);
      loadDistributionOrders();
    } catch (error) {
      console.error("Error marking orders as delivered:", error);
      alert("Siparişler işaretlenirken hata oluştu");
    }
  };

  // Toggle order selection
  const handleToggleOrder = (orderId: string) => {
    setSelectedOrders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const formatAddress = (order: OrderHeader) => {
    if (order.address) {
      return `${order.address.addressLine1}, ${order.address.city}`;
    } else if (order.pickupPoint) {
      return order.pickupPoint.pickupPointName;
    }
    return "-";
  };

  const formatDateTime = (timestamp: Timestamp) => {
    return timestamp.toDate().toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string = "ready") => {
    const badges = {
      ready: {
        label: "Hazır",
        color: "bg-green-100 text-green-800",
        icon: CheckCircle,
      },
      assigned: {
        label: "Atandı",
        color: "bg-yellow-100 text-yellow-800",
        icon: Truck,
      },
      distributed: {
        label: "Yolda",
        color: "bg-blue-100 text-blue-800",
        icon: Truck,
      },
      delivered: {
        label: "Teslim Edildi",
        color: "bg-gray-100 text-gray-800",
        icon: CheckCircle,
      },
      failed: {
        label: "Başarısız",
        color: "bg-red-100 text-red-800",
        icon: X,
      },
    };
  
    const badge = badges[status as keyof typeof badges] || badges.ready;
    const Icon = badge.icon;
  
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}
      >
        <Icon className="w-3 h-3" />
        {badge.label}
      </span>
    );
  };

  const renderOrderCard = (order: CombinedOrder) => {
    const isSelected = selectedOrders.has(order.orderHeader.id);

    return (
      <div
        key={order.orderHeader.id}
        className="bg-white border border-gray-200 rounded-lg overflow-hidden"
      >
        {/* Order Header */}
        <div className="bg-gray-50 p-3 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => handleToggleOrder(order.orderHeader.id)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded"
              />
              <div>
                <p className="font-semibold text-gray-900">
                  {order.orderHeader.buyerName || "Alıcı"}
                </p>
                <div className="flex items-center gap-3 text-xs text-gray-600">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {formatAddress(order.orderHeader)}
                  </span>
                  {order.orderHeader.address?.phoneNumber && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {order.orderHeader.address.phoneNumber}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">
                #{order.orderHeader.id.substring(0, 8)}
              </span>
              {getStatusBadge(order.orderHeader.distributionStatus)}
            </div>
          </div>
        </div>

        {/* Order Items */}
        <div className="divide-y divide-gray-200">
          {order.items.map((item) => (
            <div key={item.id} className="p-3 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <Package className="w-4 h-4 text-gray-400" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {item.productName}
                    </p>
                    <p className="text-xs text-gray-500">
                      Satıcı: {item.sellerName}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-medium text-gray-900">
                  x{item.quantity}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer with distributor info */}
{(order.orderHeader.distributedByName ||
  order.orderHeader.deliveredAt ||
  order.orderHeader.distributionStatus === "failed") && (
  <div className="bg-gray-50 p-3 border-t border-gray-200">
    <div className="flex items-center justify-between">
      <div className="flex flex-col gap-2 flex-1">
        <div className="flex items-center gap-3">
          {order.orderHeader.distributedByName && (
            <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 rounded">
              <span className="text-xs text-blue-800 font-medium">
                {order.orderHeader.distributedByName}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleUnassignDistributor(order.orderHeader.id);
                }}
                className="text-red-500 hover:text-red-700 ml-1"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          {order.orderHeader.deliveredAt && (
            <span className="text-xs text-green-600">
              ✓ Teslim Edildi:{" "}
              {formatDateTime(order.orderHeader.deliveredAt)}
            </span>
          )}
          {order.orderHeader.distributedAt &&
            !order.orderHeader.deliveredAt &&
            order.orderHeader.distributionStatus !== "failed" && (
              <span className="text-xs text-gray-500">
                Atandı: {formatDateTime(order.orderHeader.distributedAt)}
              </span>
            )}
        </div>
        
        {/* Failure information */}
        {order.orderHeader.distributionStatus === "failed" && (
          <div className="space-y-1">
            <p className="text-xs text-red-600 font-medium">
              ✗ Başarısız: {order.orderHeader.failureReason}
            </p>
            {order.orderHeader.failureNotes && (
              <p className="text-xs text-red-500">
                Not: {order.orderHeader.failureNotes}
              </p>
            )}
            {order.orderHeader.failedAt && (
              <p className="text-xs text-gray-500">
                {formatDateTime(order.orderHeader.failedAt)}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  </div>
)}
      </div>
    );
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Yükleniyor...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      {selectedOrders.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-900">
              {selectedOrders.size} sipariş seçildi
            </span>
            <div className="flex items-center gap-2">
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleAssignToDistributor(e.target.value);
                    e.target.value = "";
                  }
                }}
                disabled={assigningCargo || transferringItems}
                className="px-3 py-1.5 border border-blue-300 rounded-lg text-sm bg-white"
              >
                <option value="">Dağıtıcıya Ata</option>
                {cargoUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName}
                  </option>
                ))}
              </select>

              <button
                onClick={() =>
                  handleMarkAsDelivered(Array.from(selectedOrders))
                }
                disabled={transferringItems}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                Teslim Edildi
              </button>

              <button
                onClick={() =>
                  onTransferToGathering(Array.from(selectedOrders))
                }
                disabled={transferringItems}
                className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {transferringItems
                  ? "Gönderiliyor..."
                  : "Toplanacaklara Geri Gönder"}
              </button>

              <button
                onClick={() => setSelectedOrders(new Set())}
                disabled={transferringItems}
                className="px-3 py-1.5 bg-white border border-blue-300 rounded-lg text-sm font-medium text-blue-900 disabled:opacity-50"
              >
                Temizle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-2 gap-4">
        {/* LEFT: Unassigned Orders */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 px-1">
            Atanmamış Siparişler ({filteredUnassignedOrders.length})
          </h2>
          {filteredUnassignedOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500 bg-white rounded-lg border border-gray-200">
              Atanmamış sipariş yok
            </div>
          ) : (
            <div className="space-y-3">
              {filteredUnassignedOrders.map((order) => renderOrderCard(order))}
            </div>
          )}
        </div>

        {/* RIGHT: Assigned Orders */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 px-1">
            Atanmış Siparişler ({filteredAssignedOrders.length})
          </h2>
          {filteredAssignedOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500 bg-white rounded-lg border border-gray-200">
              Atanmış sipariş yok
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAssignedOrders.map((order) => renderOrderCard(order))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
