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
  QuerySnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "@/app/lib/firebase";
import {
  Package,
  MapPin,
  CheckCircle,
  Truck,
  X,
  Phone,
  Clock,
} from "lucide-react";
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

  const [noteModal, setNoteModal] = useState<{
    show: boolean;
    orderId: string;
    currentNote: string;
  }>({
    show: false,
    orderId: "",
    currentNote: "",
  });

  const [savingNote, setSavingNote] = useState(false);

  const [incompleteOrderModal, setIncompleteOrderModal] = useState<{
    show: boolean;
    order: CombinedOrder | null;
    cargoUserId: string;
  }>({
    show: false,
    order: null,
    cargoUserId: "",
  });

  const handleOpenNoteModal = (order: CombinedOrder) => {
    setNoteModal({
      show: true,
      orderId: order.orderHeader.id,
      currentNote: order.orderHeader.warehouseNote || "",
    });
  };

  const handleSaveNote = async () => {
    setSavingNote(true);
    try {
      const orderRef = doc(db, "orders", noteModal.orderId);
      await updateDoc(orderRef, {
        warehouseNote: noteModal.currentNote.trim() || null,
        warehouseNoteUpdatedAt: Timestamp.now(),
      });

      
      setNoteModal({
        show: false,
        orderId: "",
        currentNote: "",
      });
      loadDistributionOrders();
    } catch (error) {
      console.error("Error saving note:", error);
      alert("Not kaydedilirken hata oluştu");
    } finally {
      setSavingNote(false);
    }
  };

  // Add this after the state declarations
  const getDeliveryLabel = (deliveryOption: string = "normal") => {
    if (deliveryOption === "express") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white bg-gradient-to-r from-orange-500 to-pink-500">
          Express Kargo
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white bg-green-600">
        Normal Kargo
      </span>
    );
  };

  const getTimeAgo = (timestamp: Timestamp | undefined) => {
    if (!timestamp) return "";

    const now = Date.now();
    const orderTime = timestamp.toMillis();
    const diffInHours = Math.floor((now - orderTime) / (1000 * 60 * 60));

    if (diffInHours === 0) return "Az önce";
    if (diffInHours === 1) return "1 saat önce";
    return `${diffInHours} saat önce`;
  };

  const isOrderIncomplete = (order: CombinedOrder): boolean => {
    if (order.orderHeader.allItemsGathered) return false;

    // Check if any items are NOT at warehouse
    return order.items.some((item) => item.gatheringStatus !== "at_warehouse");
  };

  const getIncompleteItemsCount = (order: CombinedOrder): number => {
    return order.items.filter((item) => item.gatheringStatus !== "at_warehouse")
      .length;
  };

  // Add this function after isOrderIncomplete
  const isPartialDeliveryNeedingCompletion = (
    order: CombinedOrder
  ): boolean => {
    // Order was delivered but now has all items and no distributor
    // This means it was a partial delivery that needs completion
    return (
      order.orderHeader.distributionStatus === "delivered" &&
      order.orderHeader.allItemsGathered === true &&
      !order.orderHeader.distributedBy &&
      order.orderHeader.deliveredAt !== null
    );
  };

  const hasPartialDeliveryHistory = (order: CombinedOrder): boolean => {
    // If order is delivered and has a deliveredAt timestamp but some items arrived after
    if (!order.orderHeader.deliveredAt) return false;

    return order.items.some(
      (item) =>
        item.arrivedAt &&
        item.arrivedAt.toMillis() > order.orderHeader.deliveredAt!.toMillis()
    );
  };

  useEffect(() => {
    loadDistributionOrders();
  }, []);

  const loadDistributionOrders = async () => {
    setLoading(true);
    try {
      // Define all queries upfront for better readability
      const queries = [
        // Query 1: Complete orders ready for distribution
        firestoreQuery(
          collection(db, "orders"),
          where("allItemsGathered", "==", true),
          where("distributionStatus", "==", "ready"),
          firestoreOrderBy("timestamp", "desc")
        ),
        // Query 2: ALL assigned/distributed orders (complete or incomplete)
        firestoreQuery(
          collection(db, "orders"),
          where("distributionStatus", "in", ["assigned", "distributed"]),
          firestoreOrderBy("timestamp", "desc")
        ),
        // Query 3: ALL failed orders (complete or incomplete)
        firestoreQuery(
          collection(db, "orders"),
          where("distributionStatus", "==", "failed"),
          firestoreOrderBy("timestamp", "desc")
        ),
        // Query 4: Incomplete orders (will filter for unassigned only)
        firestoreQuery(
          collection(db, "orders"),
          where("allItemsGathered", "==", false),
          firestoreOrderBy("timestamp", "desc")
        ),
        // Query 5: INCOMPLETE DELIVERED ORDERS
        firestoreQuery(
          collection(db, "orders"),
          where("allItemsGathered", "==", false),
          where("distributionStatus", "==", "delivered"),
          firestoreOrderBy("timestamp", "desc")
        ),
        // Query 6: COMPLETE DELIVERED ORDERS WITHOUT DISTRIBUTOR (partial deliveries that now have all items)
        firestoreQuery(
          collection(db, "orders"),
          where("allItemsGathered", "==", true),
          where("distributionStatus", "==", "delivered"),
          firestoreOrderBy("timestamp", "desc")
        ),
      ];
  
      // Execute all queries in parallel with error resilience
      const snapshotResults = await Promise.allSettled(
        queries.map(query => getDocs(query))
      );
  
      // Extract snapshots with fallback to empty results
      const snapshots = snapshotResults.map((result, index) => {
        if (result.status === "fulfilled") {
          return result.value;
        } else {
          console.error(`Query ${index + 1} failed:`, result.reason);
          // Return empty snapshot structure
          return { docs: [], empty: true } as unknown as QuerySnapshot<DocumentData>;
        }
      });
  
      const [
        unassignedSnapshot,
        assignedSnapshot,
        failedSnapshot,
        incompleteSnapshot,
        incompleteDeliveredSnapshot,
        completeDeliveredNoDistributorSnapshot,
      ] = snapshots;
  
      // Optimized helper function with batching and robust error handling
      const processOrders = async (
        snapshot: QuerySnapshot<DocumentData>,
        isIncomplete: boolean = false
      ): Promise<CombinedOrder[]> => {
        // Early return for empty snapshots
        if (!snapshot || snapshot.empty || snapshot.docs.length === 0) {
          return [];
        }
  
        const BATCH_SIZE = 15; // Process 15 orders at a time
        const allOrders: CombinedOrder[] = [];
        const totalDocs = snapshot.docs.length;
  
        // Process orders in batches to avoid overwhelming Firestore
        for (let i = 0; i < totalDocs; i += BATCH_SIZE) {
          const batch = snapshot.docs.slice(i, Math.min(i + BATCH_SIZE, totalDocs));
          
          // Use Promise.allSettled to handle individual failures gracefully
          const batchResults = await Promise.allSettled(
            batch.map(async (orderDoc) => {
              try {
                const orderData = { ...orderDoc.data(), id: orderDoc.id } as OrderHeader;
  
                // Fetch items for this order
                const itemsSnapshot = await getDocs(
                  collection(db, "orders", orderDoc.id, "items")
                );
  
                const items: OrderItem[] = itemsSnapshot.docs.map((itemDoc) => ({
                  id: itemDoc.id,
                  ...itemDoc.data(),
                })) as OrderItem[];
  
                // For incomplete orders, only include if at least one item is at warehouse
                if (isIncomplete) {
                  const hasWarehouseItems = items.some(
                    (item) => item.gatheringStatus === "at_warehouse"
                  );
                  if (!hasWarehouseItems) {
                    return null;
                  }
                }
  
                return { orderHeader: orderData, items };
              } catch (error) {
                console.error(`Error processing order ${orderDoc.id}:`, error);
                // Return null for failed orders instead of breaking the entire operation
                return null;
              }
            })
          );
  
          // Extract successful results from this batch
          for (const result of batchResults) {
            if (result.status === "fulfilled" && result.value !== null) {
              allOrders.push(result.value);
            } else if (result.status === "rejected") {
              console.error("Batch processing error:", result.reason);
            }
          }
        }
  
        return allOrders;
      };
  
      // Process all snapshots in parallel with batching
      const processingResults = await Promise.allSettled([
        processOrders(unassignedSnapshot),
        processOrders(assignedSnapshot),
        processOrders(failedSnapshot),
        processOrders(incompleteSnapshot, true),
        processOrders(incompleteDeliveredSnapshot, true),
        processOrders(completeDeliveredNoDistributorSnapshot),
      ]);
  
      // Extract results with fallback to empty arrays
      const [
        unassignedOrdersData,
        assignedOrdersData,
        failedOrdersData,
        incompleteOrdersData,
        incompleteDeliveredOrdersData,
        completeDeliveredNoDistributorData,
      ] = processingResults.map((result) => 
        result.status === "fulfilled" ? result.value : []
      );
  
      // Filter incomplete orders to only include unassigned ones
      const unassignedIncompleteOrders = incompleteOrdersData.filter(
        (order) =>
          !order.orderHeader.distributionStatus ||
          order.orderHeader.distributionStatus === "ready"
      );
  
      // Filter complete delivered orders to only include those without distributor (need reassignment)
      const deliveredNeedingReassignment =
        completeDeliveredNoDistributorData.filter(
          (order) => !order.orderHeader.distributedBy
        );
  
      // Combine for unassigned column: ready orders, incomplete unassigned, and delivered needing reassignment
      setUnassignedOrders([
        ...unassignedOrdersData,
        ...unassignedIncompleteOrders,
        ...deliveredNeedingReassignment,
      ]);
  
      // Combine assigned, failed, and incomplete delivered for the right column
      setAssignedOrders([
        ...assignedOrdersData,
        ...failedOrdersData,
        ...incompleteDeliveredOrdersData,
      ]);
  
    } catch (error) {
      console.error("Critical error loading distribution orders:", error);
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

    // Check if any selected orders are incomplete
    const selectedOrdersList = Array.from(selectedOrders);
    const ordersData = unassignedOrders.filter((order) =>
      selectedOrdersList.includes(order.orderHeader.id)
    );

    const incompleteOrders = ordersData.filter((order) =>
      isOrderIncomplete(order)
    );

    // If there are incomplete orders, show modal for the first one
    if (incompleteOrders.length > 0) {
      setIncompleteOrderModal({
        show: true,
        order: incompleteOrders[0],
        cargoUserId: cargoUserId,
      });
      return;
    }

    // All orders are complete, proceed normally
    await assignOrdersToDistributor(
      selectedOrdersList,
      cargoUserId,
      cargoUser.displayName
    );
  };

  const assignOrdersToDistributor = async (
    orderIds: string[],
    cargoUserId: string,
    cargoUserName: string,
    skipIncomplete: boolean = false
  ) => {
    setAssigningCargo(true);
    try {
      const assignPromises = orderIds.map(async (orderId) => {
        const orderData = unassignedOrders.find(
          (o) => o.orderHeader.id === orderId
        );

        // Skip incomplete orders if requested
        if (skipIncomplete && orderData && isOrderIncomplete(orderData)) {
          return;
        }

        const orderRef = doc(db, "orders", orderId);
        await updateDoc(orderRef, {
          distributionStatus: "assigned",
          distributedBy: cargoUserId,
          distributedByName: cargoUserName,
          distributedAt: Timestamp.now(),
        });
      });

      await Promise.all(assignPromises);

      
      setSelectedOrders(new Set());
      loadDistributionOrders();
    } catch (error) {
      console.error("Error assigning orders:", error);
      alert("Sipariş atama sırasında hata oluştu");
    } finally {
      setAssigningCargo(false);
    }
  };

  const handleConfirmIncompleteAssignment = async () => {
    if (!incompleteOrderModal.order) return;

    const cargoUser = cargoUsers.find(
      (u) => u.id === incompleteOrderModal.cargoUserId
    );
    if (!cargoUser) return;

    // Close modal
    setIncompleteOrderModal({ show: false, order: null, cargoUserId: "" });

    // Assign all selected orders
    await assignOrdersToDistributor(
      Array.from(selectedOrders),
      incompleteOrderModal.cargoUserId,
      cargoUser.displayName,
      false // Don't skip incomplete orders
    );
  };

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
          const orderData = unassignedOrders
            .concat(assignedOrders)
            .find((o) => o.orderHeader.id === orderId);

          const orderRef = doc(db, "orders", orderId);

          // Check if this order was PREVIOUSLY partially delivered
          const wasPreviouslyPartiallyDelivered =
            orderData?.orderHeader.deliveredAt &&
            !orderData?.orderHeader.distributedBy;

          // Check if this is CURRENTLY an incomplete order
          const isCurrentlyIncomplete =
            orderData && isOrderIncomplete(orderData);

          // Mark which items are being delivered RIGHT NOW
          if (orderData) {
            const itemsAtWarehouse = orderData.items.filter(
              (item) => item.gatheringStatus === "at_warehouse"
            );

            // Mark each item at warehouse as delivered
            // CRITICAL: ALWAYS set deliveredInPartial to TRUE when actually delivering
            await Promise.all(
              itemsAtWarehouse.map(async (item) => {
                const itemRef = doc(db, "orders", orderId, "items", item.id);
                await updateDoc(itemRef, {
                  deliveredInPartial: true, // ALWAYS TRUE when marking as delivered
                  partialDeliveryAt: Timestamp.now(),
                });
              })
            );
          }

          // For orders that are currently incomplete OR were previously partially delivered
          if (isCurrentlyIncomplete || wasPreviouslyPartiallyDelivered) {
            // Mark as delivered BUT unassign distributor for reassignment
            await updateDoc(orderRef, {
              distributionStatus: "delivered",
              deliveredAt: Timestamp.now(),
              // Clear distributor assignment
              distributedBy: null,
              distributedByName: null,
              distributedAt: null,
            });
          } else {
            // For complete deliveries: just mark as delivered (keep distributor info)
            await updateDoc(orderRef, {
              distributionStatus: "delivered",
              deliveredAt: Timestamp.now(),
            });
          }
        })
      );

        

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
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900">
                    {order.orderHeader.buyerName || "Alıcı"}
                  </p>
                  {/* ADD INCOMPLETE BADGE */}
                  {isOrderIncomplete(order) && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white bg-amber-500">
                      Sipariş tamamlanmadı, {getIncompleteItemsCount(order)}{" "}
                      eksik ürün
                    </span>
                  )}
                  {isPartialDeliveryNeedingCompletion(order) && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white bg-orange-500">
                      Kısmi teslimat - Tamamlanması gerekiyor
                    </span>
                  )}
                </div>
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
              {getDeliveryLabel(order.orderHeader.deliveryOption)}
              <span className="text-xs text-gray-500 whitespace-nowrap">
                {getTimeAgo(order.orderHeader.timestamp)}
              </span>
              {isOrderIncomplete(order) ? (
                order.orderHeader.deliveredAt ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                    <CheckCircle className="w-3 h-3" />
                    Kısmi Teslimat
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                    <Clock className="w-3 h-3" />
                    Bekliyor
                  </span>
                )
              ) : isPartialDeliveryNeedingCompletion(order) ||
                hasPartialDeliveryHistory(order) ? (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                  <Clock className="w-3 h-3" />
                  Kısmi Teslim - Tamamlanacak
                </span>
              ) : (
                getStatusBadge(order.orderHeader.distributionStatus)
              )}
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
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">
                        {item.productName}
                      </p>

                      {/* Item status labels */}
                      {(() => {
                        // For orders with delivery history
                        if (order.orderHeader.deliveredAt) {
                          const isPartialScenario =
                            isOrderIncomplete(order) ||
                            isPartialDeliveryNeedingCompletion(order) ||
                            hasPartialDeliveryHistory(order);

                          if (isPartialScenario) {
                            if (item.gatheringStatus === "at_warehouse") {
                              // Check if this item was marked as delivered in a partial delivery
                              if (
                                item.deliveredInPartial &&
                                item.partialDeliveryAt
                              ) {
                                return (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white bg-green-600">
                                    Teslim Edildi
                                  </span>
                                );
                              } else {
                                return (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-blue-700 bg-blue-50">
                                    Teslimata Hazır
                                  </span>
                                );
                              }
                            }

                            // Item NOT at warehouse
                            if (
                              (item.gatheringStatus as string) !==
                              "at_warehouse"
                            ) {
                              return (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-amber-700 bg-amber-50">
                                  {item.gatheringStatus === "pending" &&
                                    "Toplanacak"}
                                  {item.gatheringStatus === "assigned" &&
                                    "Toplanıyor"}
                                  {item.gatheringStatus === "gathered" &&
                                    "Yolda"}
                                  {item.gatheringStatus === "failed" &&
                                    "Başarısız"}
                                </span>
                              );
                            }
                          }
                        }

                        // For orders without delivery history
                        if (item.gatheringStatus !== "at_warehouse") {
                          return (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-amber-700 bg-amber-50">
                              {item.gatheringStatus === "pending" &&
                                "Toplanacak"}
                              {item.gatheringStatus === "assigned" &&
                                "Toplanıyor"}
                              {item.gatheringStatus === "gathered" && "Yolda"}
                              {item.gatheringStatus === "failed" && "Başarısız"}
                            </span>
                          );
                        }

                        return null;
                      })()}
                    </div>
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
                    <div className="flex items-center gap-1">
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
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenNoteModal(order);
                        }}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                          order.orderHeader.warehouseNote
                            ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                        title={order.orderHeader.warehouseNote || "Not ekle"}
                      >
                        Not {order.orderHeader.warehouseNote ? "✓" : "bırak"}
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
                        Atandı:{" "}
                        {formatDateTime(order.orderHeader.distributedAt)}
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
                onClick={() => {
                  // Check if any selected orders are partially delivered
                  const selectedOrdersList = Array.from(selectedOrders);
                  const partiallyDeliveredOrders = selectedOrdersList.filter(
                    (orderId) => {
                      const order = unassignedOrders
                        .concat(assignedOrders)
                        .find((o) => o.orderHeader.id === orderId);
                      return (
                        order &&
                        isOrderIncomplete(order) &&
                        order.orderHeader.deliveredAt
                      );
                    }
                  );

                  if (partiallyDeliveredOrders.length > 0) {
                    alert(
                      `${partiallyDeliveredOrders.length} sipariş kısmen teslim edilmiş ve geri gönderilemez. Lütfen bu siparişleri seçimden çıkarın.`
                    );
                    return;
                  }

                  onTransferToGathering(selectedOrdersList);
                }}
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
      {/* Incomplete Order Warning Modal */}
      {incompleteOrderModal.show && incompleteOrderModal.order && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-amber-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center">
                  <Clock className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-lg font-bold text-gray-900">
                  Eksik Sipariş Uyarısı
                </h2>
              </div>
              <button
                onClick={() =>
                  setIncompleteOrderModal({
                    show: false,
                    order: null,
                    cargoUserId: "",
                  })
                }
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[calc(80vh-140px)]">
              <div className="mb-4">
                <p className="text-sm text-gray-700 mb-2">
                  <span className="font-semibold">
                    {incompleteOrderModal.order.orderHeader.buyerName}
                  </span>{" "}
                  adlı müşterinin siparişi henüz tamamlanmadı.
                </p>
                <p className="text-sm font-medium text-amber-700 bg-amber-50 p-3 rounded-lg">
                  Bu siparişi yine de atamak istiyor musunuz? Sadece depoda
                  bulunan ürünler dağıtılacaktır.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  Eksik Ürünler:
                </h3>
                {incompleteOrderModal.order.items
                  .filter((item) => item.gatheringStatus !== "at_warehouse")
                  .map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded"
                    >
                      <Package className="w-4 h-4 text-red-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {item.productName}
                        </p>
                        <p className="text-xs text-gray-600">
                          Satıcı: {item.sellerName} • Miktar: x{item.quantity}
                        </p>
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-red-700 bg-red-100 whitespace-nowrap">
                        {item.gatheringStatus === "pending" && "Toplanacak"}
                        {item.gatheringStatus === "assigned" && "Toplanıyor"}
                        {item.gatheringStatus === "gathered" && "Yolda"}
                        {item.gatheringStatus === "failed" && "Başarısız"}
                      </span>
                    </div>
                  ))}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  Depoda Hazır Ürünler:
                </h3>
                {incompleteOrderModal.order.items
                  .filter((item) => item.gatheringStatus === "at_warehouse")
                  .map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded mb-2"
                    >
                      <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {item.productName}
                        </p>
                        <p className="text-xs text-gray-600">
                          Satıcı: {item.sellerName} • Miktar: x{item.quantity}
                        </p>
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-green-700 bg-green-100">
                        Depoda
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() =>
                  setIncompleteOrderModal({
                    show: false,
                    order: null,
                    cargoUserId: "",
                  })
                }
                className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleConfirmIncompleteAssignment}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Yine de Ata
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Note Modal */}
      {/* Note Modal */}
      {noteModal.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Depo Notu</h2>
              <button
                onClick={() =>
                  setNoteModal({
                    show: false,
                    orderId: "",
                    currentNote: "",
                  })
                }
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-4">
              <textarea
                value={noteModal.currentNote}
                onChange={(e) =>
                  setNoteModal({ ...noteModal, currentNote: e.target.value })
                }
                placeholder="Kargo personeline not bırakın..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={4}
              />
            </div>

            <div className="flex items-center justify-between gap-2 p-4 border-t border-gray-200 bg-gray-50">
              {/* Delete button on the left */}
              {noteModal.currentNote && (
                <button
                  onClick={async () => {
                    if (!confirm("Notu silmek istediğinizden emin misiniz?")) {
                      return;
                    }
                    setSavingNote(true);
                    try {
                      const orderRef = doc(db, "orders", noteModal.orderId);
                      await updateDoc(orderRef, {
                        warehouseNote: null,
                        warehouseNoteUpdatedAt: null,
                      });
                      alert("Not silindi");
                      setNoteModal({
                        show: false,
                        orderId: "",
                        currentNote: "",
                      });
                      loadDistributionOrders();
                    } catch (error) {
                      console.error("Error deleting note:", error);
                      alert("Not silinirken hata oluştu");
                    } finally {
                      setSavingNote(false);
                    }
                  }}
                  disabled={savingNote}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Notu Sil
                </button>
              )}

              {/* Action buttons on the right */}
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() =>
                    setNoteModal({
                      show: false,
                      orderId: "",
                      currentNote: "",
                    })
                  }
                  disabled={savingNote}
                  className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  İptal
                </button>
                <button
                  onClick={handleSaveNote}
                  disabled={savingNote}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {savingNote ? "Kaydediliyor..." : "Kaydet"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
