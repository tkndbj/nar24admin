"use client";

import { useState, useMemo, useEffect } from "react";
import {
  query as firestoreQuery,
  getDocs,
  doc,
  updateDoc,
  Timestamp,
  where,
  collectionGroup,
  limit,
  orderBy,
} from "firebase/firestore";
import { db } from "@/app/lib/firebase";
import {
  Package,
  Store,
  User,
  MapPin,
  CheckCircle,
  Clock,
  Warehouse,
  X,
  Phone,
} from "lucide-react";
import { OrderItem, SellerGroup, CargoUser } from "./types";

interface GatheringTabProps {
  cargoUsers: CargoUser[];
  searchTerm: string;
  selectedItems: Set<string>;
  setSelectedItems: React.Dispatch<React.SetStateAction<Set<string>>>;
  onTransferToDistribution: (itemKeys: string[]) => Promise<void>;
  transferringItems: boolean;
}

export default function GatheringTab({
  cargoUsers,
  searchTerm,
  selectedItems,
  setSelectedItems,
  onTransferToDistribution,
  transferringItems,
}: GatheringTabProps) {
  const [unassignedGroups, setUnassignedGroups] = useState<SellerGroup[]>([]);
  const [assignedGroups, setAssignedGroups] = useState<SellerGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigningCargo, setAssigningCargo] = useState(false);

  const [noteModal, setNoteModal] = useState<{
    show: boolean;
    itemKey: string;
    orderId: string;
    itemId: string;
    currentNote: string;
  }>({
    show: false,
    itemKey: "",
    orderId: "",
    itemId: "",
    currentNote: "",
  });

  const [savingNote, setSavingNote] = useState(false);

  const handleOpenNoteModal = (item: OrderItem) => {
    setNoteModal({
      show: true,
      itemKey: `${item.orderId}|${item.id}`,
      orderId: item.orderId,
      itemId: item.id,
      currentNote: item.warehouseNote || "",
    });
  };

  const handleSaveNote = async () => {
    setSavingNote(true);
    try {
      const itemRef = doc(
        db,
        "orders",
        noteModal.orderId,
        "items",
        noteModal.itemId
      );
      await updateDoc(itemRef, {
        warehouseNote: noteModal.currentNote.trim() || null,
        warehouseNoteUpdatedAt: Timestamp.now(),
      });

      alert("Not kaydedildi");
      setNoteModal({
        show: false,
        itemKey: "",
        orderId: "",
        itemId: "",
        currentNote: "",
      });
      loadGatheringItems();
    } catch (error) {
      console.error("Error saving note:", error);
      alert("Not kaydedilirken hata oluştu");
    } finally {
      setSavingNote(false);
    }
  };

  useEffect(() => {
    loadGatheringItems();
  }, []);

  // Load all items that need gathering
  const loadGatheringItems = async () => {
    setLoading(true);
    try {
      // Query for pending items (unassigned)
      const pendingQuery = firestoreQuery(
        collectionGroup(db, "items"),
        where("gatheringStatus", "==", "pending"),
        orderBy("timestamp", "desc"),
        limit(30) // Load in chunks
      )

      // Query for assigned items
      const assignedQuery = firestoreQuery(
        collectionGroup(db, "items"),
        where("gatheringStatus", "==", "assigned"),
        orderBy("timestamp", "desc"),
        limit(30) // Load in chunks
      );

      // Query for gathered items (waiting to be marked as arrived)
      const gatheredQuery = firestoreQuery(
        collectionGroup(db, "items"),
        where("gatheringStatus", "==", "gathered"),
        orderBy("timestamp", "desc"),
        limit(30) // Load in chunks
      );

      // Query for failed items
      const failedQuery = firestoreQuery(
        collectionGroup(db, "items"),
        where("gatheringStatus", "==", "failed"),
        orderBy("timestamp", "desc"),
        limit(30) // Load in chunks
      );

      // Execute all queries
      const [
        pendingSnapshot,
        assignedSnapshot,
        gatheredSnapshot,
        failedSnapshot,
      ] = await Promise.all([
        getDocs(pendingQuery),
        getDocs(assignedQuery),
        getDocs(gatheredQuery),
        getDocs(failedQuery),
      ]);

      // Process pending items (unassigned)
      const pendingItems: OrderItem[] = pendingSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        orderId: doc.ref.parent.parent?.id || "",
      })) as OrderItem[];

      // Process assigned items
      const assignedItems: OrderItem[] = assignedSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        orderId: doc.ref.parent.parent?.id || "",
      })) as OrderItem[];

      // Process gathered items
      const gatheredItems: OrderItem[] = gatheredSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        orderId: doc.ref.parent.parent?.id || "",
      })) as OrderItem[];

      // Process failed items
      const failedItems: OrderItem[] = failedSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        orderId: doc.ref.parent.parent?.id || "",
      })) as OrderItem[];

      // Group items appropriately
      setUnassignedGroups(groupItemsBySeller(pendingItems));

      // Combine assigned, gathered, and failed items for the right column
      const assignedAndGatheredItems = [
        ...assignedItems,
        ...gatheredItems,
        ...failedItems,
      ];
      setAssignedGroups(groupItemsBySeller(assignedAndGatheredItems));
    } catch (error) {
      console.error("Error loading gathering items:", error);
      alert("Ürünler yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  };

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

  // Unassign cargo person from items
  const handleUnassignGatherer = async (orderId: string, itemId: string) => {
    if (!confirm("Bu üründen toplayıcıyı kaldırmak istiyor musunuz?")) {
      return;
    }

    try {
      const itemRef = doc(db, "orders", orderId, "items", itemId);
      await updateDoc(itemRef, {
        gatheringStatus: "pending",
        gatheredBy: null,
        gatheredByName: null,
        gatheredAt: null,
      });

      alert("Toplayıcı atama kaldırıldı");
      loadGatheringItems();
    } catch (error) {
      console.error("Error unassigning gatherer:", error);
      alert("Atama kaldırılırken hata oluştu");
    }
  };

  // Group items by seller
  const groupItemsBySeller = (items: OrderItem[]): SellerGroup[] => {
    const groups = new Map<string, SellerGroup>();

    items.forEach((item) => {
      const key = item.sellerId;

      if (!groups.has(key)) {
        groups.set(key, {
          sellerId: item.sellerId,
          sellerName: item.sellerName,
          isShopProduct: item.isShopProduct,
          items: [],
          totalItems: 0,
          sellerAddress: item.sellerAddress,
          sellerContactNo: item.sellerContactNo,
        });
      }

      const group = groups.get(key)!;
      group.items.push(item);
      group.totalItems += item.quantity;
    });

    return Array.from(groups.values());
  };

  // Filter by search term
  const filteredUnassignedGroups = useMemo(() => {
    if (!searchTerm) return unassignedGroups;

    const term = searchTerm.toLowerCase();
    return unassignedGroups.filter(
      (group) =>
        group.sellerName.toLowerCase().includes(term) ||
        group.items.some((item) =>
          item.productName.toLowerCase().includes(term)
        )
    );
  }, [unassignedGroups, searchTerm]);

  const filteredAssignedGroups = useMemo(() => {
    if (!searchTerm) return assignedGroups;

    const term = searchTerm.toLowerCase();
    return assignedGroups.filter(
      (group) =>
        group.sellerName.toLowerCase().includes(term) ||
        group.items.some((item) =>
          item.productName.toLowerCase().includes(term)
        )
    );
  }, [assignedGroups, searchTerm]);

  // Assign selected items to gatherer
  const handleAssignToGatherer = async (cargoUserId: string) => {
    if (selectedItems.size === 0) {
      alert("Lütfen en az bir ürün seçin");
      return;
    }
  
    const cargoUser = cargoUsers.find((u) => u.id === cargoUserId);
    if (!cargoUser) {
      alert("Kargo personeli bulunamadı");
      return;
    }
  
    setAssigningCargo(true);
    
    // Store previous state for rollback
    const previousUnassigned = [...unassignedGroups];
    const previousAssigned = [...assignedGroups];
    
    // Optimistic update - immediately move items to assigned
    const itemKeysArray = Array.from(selectedItems);
    const optimisticUnassigned = unassignedGroups.map(group => ({
      ...group,
      items: group.items.filter(item => 
        !itemKeysArray.includes(`${item.orderId}|${item.id}`)
      )
    })).filter(group => group.items.length > 0);
    
    const optimisticItems = itemKeysArray.map(key => {
      const [orderId, itemId] = key.split("|");
      for (const group of unassignedGroups) {
        const item = group.items.find(i => i.orderId === orderId && i.id === itemId);
        if (item) {
          return {
            ...item,
            gatheringStatus: "assigned" as const,
            gatheredBy: cargoUserId,
            gatheredByName: cargoUser.displayName,
            gatheredAt: Timestamp.now()
          };
        }
      }
      return null;
    }).filter(Boolean) as OrderItem[];
    
    // Apply optimistic updates
    setUnassignedGroups(optimisticUnassigned);
    setAssignedGroups(prev => {
      const newGroups = groupItemsBySeller(optimisticItems);
      return [...prev, ...newGroups];
    });
    setSelectedItems(new Set());
  
    try {
      await Promise.all(
        itemKeysArray.map(async (itemKey) => {
          const [orderId, itemId] = itemKey.split("|");
          const itemRef = doc(db, "orders", orderId, "items", itemId);
  
          await updateDoc(itemRef, {
            gatheringStatus: "assigned",
            gatheredBy: cargoUserId,
            gatheredByName: cargoUser.displayName,
            gatheredAt: Timestamp.now(),
          });
        })
      );
  
     
    } catch (error) {
      console.error("Error assigning items:", error);
      alert("Ürün atama sırasında hata oluştu");
      
      // Rollback on error
      setUnassignedGroups(previousUnassigned);
      setAssignedGroups(previousAssigned);
      setSelectedItems(new Set(itemKeysArray));
    } finally {
      setAssigningCargo(false);
    }
  };

  // Mark items as arrived at warehouse
  const handleMarkAsArrived = async (itemKeys: string[]) => {
    

    try {
      await Promise.all(
        itemKeys.map(async (itemKey) => {
          const [orderId, itemId] = itemKey.split("|");
          const itemRef = doc(db, "orders", orderId, "items", itemId);

          await updateDoc(itemRef, {
            gatheringStatus: "at_warehouse",
            arrivedAt: Timestamp.now(),
          });
        })
      );

      
      loadGatheringItems();
    } catch (error) {
      console.error("Error marking items as arrived:", error);
      alert("Ürünler işaretlenirken hata oluştu");
    }
  };

  // Toggle item selection
  const handleToggleItem = (orderId: string, itemId: string) => {
    const key = `${orderId}|${itemId}`;
    setSelectedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  // Toggle all items in a seller group
  const handleToggleSellerGroup = (group: SellerGroup) => {
    const groupKeys = group.items.map((item) => `${item.orderId}|${item.id}`);
    const allSelected = groupKeys.every((key) => selectedItems.has(key));

    setSelectedItems((prev) => {
      const newSet = new Set(prev);
      if (allSelected) {
        groupKeys.forEach((key) => newSet.delete(key));
      } else {
        groupKeys.forEach((key) => newSet.add(key));
      }
      return newSet;
    });
  };

  const getStatusBadge = (status: string = "pending") => {
    const badges = {
      pending: {
        label: "Bekliyor",
        color: "bg-gray-100 text-gray-800",
        icon: Clock,
      },
      assigned: {
        label: "Atandı",
        color: "bg-yellow-100 text-yellow-800",
        icon: Package,
      },
      gathered: {
        label: "Toplandı",
        color: "bg-blue-100 text-blue-800",
        icon: CheckCircle,
      },
      at_warehouse: {
        label: "Depoda",
        color: "bg-green-100 text-green-800",
        icon: Warehouse,
      },
      failed: {
        label: "Başarısız",
        color: "bg-red-100 text-red-800",
        icon: X,
      },
    };

    const badge = badges[status as keyof typeof badges] || badges.pending;
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

  const formatDateTime = (timestamp: Timestamp) => {
    return timestamp.toDate().toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const renderSellerGroup = (group: SellerGroup) => {
    const groupKeys = group.items.map((item) => `${item.orderId}|${item.id}`);
    const allSelected = groupKeys.every((key) => selectedItems.has(key));

    return (
      <div
        key={group.sellerId}
        className="bg-white border border-gray-200 rounded-lg overflow-hidden"
      >
        {/* Seller Header */}
        <div className="bg-gray-50 p-3 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => handleToggleSellerGroup(group)}
                className="w-4 h-4 text-orange-600 border-gray-300 rounded"
              />
              <div className="flex items-center gap-2">
                {group.isShopProduct ? (
                  <Store className="w-5 h-5 text-purple-600" />
                ) : (
                  <User className="w-5 h-5 text-green-600" />
                )}
                <div>
                  <p className="font-semibold text-gray-900">
                    {group.sellerName}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-gray-600">
                    {group.sellerAddress && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {group.sellerAddress.addressLine1}
                      </span>
                    )}
                    {group.sellerContactNo && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {group.sellerContactNo}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="text-sm text-gray-600">
              {group.items.length} ürün • {group.totalItems} adet
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="divide-y divide-gray-200">
          {group.items.map((item) => (
            <div key={item.id} className="p-3 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <input
                    type="checkbox"
                    checked={selectedItems.has(`${item.orderId}|${item.id}`)}
                    onChange={() => handleToggleItem(item.orderId, item.id)}
                    className="w-4 h-4 text-orange-600 border-gray-300 rounded"
                  />
                  <Package className="w-4 h-4 text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {item.productName}
                      </p>
                      {getDeliveryLabel(item.deliveryOption)}
                      <span className="text-xs text-gray-500 whitespace-nowrap">
                        {getTimeAgo(item.timestamp)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Sipariş: #{item.orderId.substring(0, 8)} • Alıcı:{" "}
                      {item.buyerName}
                    </p>
                    {item.gatheringStatus === "gathered" && item.gatheredAt && (
                      <p className="text-xs text-blue-600 mt-1">
                        ✓ Toplandı: {formatDateTime(item.gatheredAt)}
                      </p>
                    )}
                    {item.gatheringStatus === "failed" && (
                      <div className="mt-1 space-y-1">
                        <p className="text-xs text-red-600 font-medium">
                          ✗ Başarısız: {item.failureReason}
                        </p>
                        {item.failureNotes && (
                          <p className="text-xs text-red-500">
                            Not: {item.failureNotes}
                          </p>
                        )}
                        {item.failedAt && (
                          <p className="text-xs text-gray-500">
                            {formatDateTime(item.failedAt)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-900">
                    x{item.quantity}
                  </span>
                  {getStatusBadge(item.gatheringStatus)}
                  {item.gatheredByName && (
                    <div className="flex items-center gap-1">
                      <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded">
                        <span className="text-xs text-gray-600">
                          {item.gatheredByName}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUnassignGatherer(item.orderId, item.id);
                          }}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenNoteModal(item);
                        }}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                          item.warehouseNote
                            ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                        title={item.warehouseNote || "Not ekle"}
                      >
                        Not {item.warehouseNote ? "✓" : "bırak"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Yükleniyor...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      {selectedItems.size > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-orange-900">
              {selectedItems.size} ürün seçildi
            </span>
            <div className="flex items-center gap-2">
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleAssignToGatherer(e.target.value);
                    e.target.value = "";
                  }
                }}
                disabled={assigningCargo || transferringItems}
                className="px-3 py-1.5 border border-orange-300 rounded-lg text-sm bg-white"
              >
                <option value="">Toplayıcıya Ata</option>
                {cargoUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName}
                  </option>
                ))}
              </select>

              <button
                onClick={() => handleMarkAsArrived(Array.from(selectedItems))}
                disabled={transferringItems}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                Depoya Geldi
              </button>

              <button
                onClick={() =>
                  onTransferToDistribution(Array.from(selectedItems))
                }
                disabled={transferringItems}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {transferringItems ? "Aktarılıyor..." : "Dağıtılacaklara Aktar"}
              </button>

              <button
                onClick={() => setSelectedItems(new Set())}
                disabled={transferringItems}
                className="px-3 py-1.5 bg-white border border-orange-300 rounded-lg text-sm font-medium text-orange-900 disabled:opacity-50"
              >
                Temizle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-2 gap-4">
        {/* LEFT: Unassigned Items */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 px-1">
            Atanmamış Siparişler ({filteredUnassignedGroups.length})
          </h2>
          {filteredUnassignedGroups.length === 0 ? (
            <div className="text-center py-8 text-gray-500 bg-white rounded-lg border border-gray-200">
              Atanmamış ürün yok
            </div>
          ) : (
            <div className="space-y-3">
              {filteredUnassignedGroups.map((group) =>
                renderSellerGroup(group)
              )}
            </div>
          )}
        </div>

        {/* RIGHT: Assigned Items */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 px-1">
            Atanmış Siparişler ({filteredAssignedGroups.length})
          </h2>
          {filteredAssignedGroups.length === 0 ? (
            <div className="text-center py-8 text-gray-500 bg-white rounded-lg border border-gray-200">
              Atanmış ürün yok
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAssignedGroups.map((group) => renderSellerGroup(group))}
            </div>
          )}
        </div>
      </div>
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
                    itemKey: "",
                    itemId: "",
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
                      
                      setNoteModal({
                        show: false,
                        itemKey: "",
                        itemId: "",
                        orderId: "",
                        currentNote: "",
                      });
                      loadGatheringItems();
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
                      itemKey: "",
                      itemId: "",
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
