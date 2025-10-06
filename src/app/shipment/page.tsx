"use client";

import { useState, useEffect } from "react";
import { db } from "@/app/lib/firebase";
import { TruckIcon, UserPlus, X, Search, User } from "lucide-react";
import { CargoUser } from "./types";
import GatheringTab from "./GatheringTab";
import DistributionTab from "./DistributionTab";
import DeliveredTab from "./DeliveredTab";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
export default function ShipmentPage() {
  const [activeTab, setActiveTab] = useState<
    "gathering" | "distribution" | "delivered"
  >("gathering");
  const [cargoUsers, setCargoUsers] = useState<CargoUser[]>([]);
  const [showCargoModal, setShowCargoModal] = useState(false);
  const [cargoEmail, setCargoEmail] = useState("");
  const [processingCargo, setProcessingCargo] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [transferringItems, setTransferringItems] = useState(false);
  const [gatheringSelectedItems, setGatheringSelectedItems] = useState<
    Set<string>
  >(new Set());
  const [distributionSelectedOrders, setDistributionSelectedOrders] = useState<
    Set<string>
  >(new Set());

  useEffect(() => {
    fetchCargoUsers();
  }, []);

  const fetchCargoUsers = async () => {
    try {
      const usersRef = collection(db, "users");
      const cargoQuery = query(usersRef, where("cargoGuy", "==", true));
      const snapshot = await getDocs(cargoQuery);

      const users: CargoUser[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        displayName: doc.data().displayName || "Unknown",
        email: doc.data().email || "",
      }));

      setCargoUsers(users);
    } catch (error) {
      console.error("Error fetching cargo users:", error);
    }
  };

  // Transfer items from gathering to distribution
  // Transfer items from gathering to distribution
  const handleTransferToDistribution = async (itemKeys: string[]) => {
    if (
      !confirm(
        `${itemKeys.length} ürünü dağıtılacaklara aktarmak istiyor musunuz?`
      )
    ) {
      return;
    }

    setTransferringItems(true);
    try {
      // Import getDoc if not already imported
      const { getDoc } = await import("firebase/firestore");

      await Promise.all(
        itemKeys.map(async (itemKey) => {
          const [orderId, itemId] = itemKey.split("|");
          const itemRef = doc(db, "orders", orderId, "items", itemId);

          // Get current item data first
          const itemSnapshot = await getDoc(itemRef);
          const itemData = itemSnapshot.data();

          // Build the update object based on current state
          const updateData = {
            gatheringStatus: "at_warehouse",
            arrivedAt: Timestamp.now(),
            // If item was never gathered, mark it as gathered
            ...(!itemData?.gatheredAt && { gatheredAt: Timestamp.now() }),
            // If item has no gatherer assigned, assign a system gatherer
            ...(!itemData?.gatheredBy && {
              gatheredBy: "SYSTEM",
              gatheredByName: "Admin Transfer",
            }),
          };

          await updateDoc(itemRef, updateData);
        })
      );

      // Check each order if all items are at warehouse
      const orderIds = [...new Set(itemKeys.map((key) => key.split("|")[0]))];

      for (const orderId of orderIds) {
        const itemsSnapshot = await getDocs(
          collection(db, "orders", orderId, "items")
        );

        const allAtWarehouse = itemsSnapshot.docs.every(
          (doc) => doc.data().gatheringStatus === "at_warehouse"
        );

        if (allAtWarehouse) {
          const orderRef = doc(db, "orders", orderId);
          await updateDoc(orderRef, {
            allItemsGathered: true,
            distributionStatus: "ready", // Ready for distribution, not assigned yet
          });
        }
      }

      alert(`${itemKeys.length} ürün dağıtılacaklara aktarıldı`);
      setGatheringSelectedItems(new Set());
    } catch (error) {
      console.error("Error transferring items:", error);
      alert("Ürünler aktarılırken hata oluştu");
    } finally {
      setTransferringItems(false);
    }
  };

  // Transfer orders from distribution back to gathering
  const handleTransferToGathering = async (orderIds: string[]) => {
    if (
      !confirm(
        `${orderIds.length} siparişi toplanacaklara geri göndermek istiyor musunuz?`
      )
    ) {
      return;
    }

    setTransferringItems(true);
    try {
      await Promise.all(
        orderIds.map(async (orderId) => {
          // Reset order header distribution fields only
          const orderRef = doc(db, "orders", orderId);
          await updateDoc(orderRef, {
            allItemsGathered: false,
            distributionStatus: null,
            distributedBy: null,
            distributedByName: null,
            distributedAt: null,
            deliveredAt: null, // Also clear delivery status
          });

          // Reset items to "assigned" status if they had a gatherer
          // Otherwise set to "pending"
          const itemsSnapshot = await getDocs(
            collection(db, "orders", orderId, "items")
          );

          await Promise.all(
            itemsSnapshot.docs.map(async (itemDoc) => {
              const itemData = itemDoc.data();
              const itemRef = doc(db, "orders", orderId, "items", itemDoc.id);

              // If item had a gatherer, keep them assigned but reset to "assigned" status
              // This preserves the assignment while allowing re-gathering
              if (itemData.gatheredBy && itemData.gatheredBy !== "SYSTEM") {
                await updateDoc(itemRef, {
                  gatheringStatus: "assigned",
                  arrivedAt: null, // Clear warehouse arrival
                  // CRITICAL: Clear partial delivery tracking fields
                  deliveredInPartial: null,
                  partialDeliveryAt: null,
                  // Keep gatheredBy, gatheredByName, gatheredAt intact
                });
              } else {
                // No gatherer or system transfer, reset to pending
                await updateDoc(itemRef, {
                  gatheringStatus: "pending",
                  gatheredBy: null,
                  gatheredByName: null,
                  gatheredAt: null,
                  arrivedAt: null,
                  // CRITICAL: Clear partial delivery tracking fields
                  deliveredInPartial: null,
                  partialDeliveryAt: null,
                });
              }
            })
          );
        })
      );

      alert(`${orderIds.length} sipariş toplanacaklara geri gönderildi`);
      setDistributionSelectedOrders(new Set());
    } catch (error) {
      console.error("Error transferring orders:", error);
      alert("Siparişler aktarılırken hata oluştu");
    } finally {
      setTransferringItems(false);
    }
  };

  const handleAddCargo = async () => {
    if (!cargoEmail.trim()) {
      alert("Lütfen bir e-posta adresi girin");
      return;
    }

    setProcessingCargo(true);
    try {
      const usersRef = collection(db, "users");
      const q = query(
        usersRef,
        where("email", "==", cargoEmail.trim().toLowerCase())
      );
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        alert("Bu e-posta adresiyle kayıtlı kullanıcı bulunamadı");
        return;
      }

      const userDoc = snapshot.docs[0];
      const userData = userDoc.data();

      if (userData.cargoGuy === true) {
        alert("Bu kullanıcı zaten kargo personeli olarak eklenmiş");
        return;
      }

      const { updateDoc, doc } = await import("firebase/firestore");
      const userRef = doc(db, "users", userDoc.id);
      await updateDoc(userRef, { cargoGuy: true });

      alert(
        `${userData.displayName || cargoEmail} kargo personeli olarak eklendi`
      );
      setCargoEmail("");
      setShowCargoModal(false);
      fetchCargoUsers();
    } catch (error) {
      console.error("Error adding cargo user:", error);
      alert("Kargo personeli eklenirken bir hata oluştu");
    } finally {
      setProcessingCargo(false);
    }
  };

  const handleRemoveCargo = async (userId: string, userName: string) => {
    if (!confirm(`${userName} kargo personeli listesinden çıkarılsın mı?`)) {
      return;
    }

    setProcessingCargo(true);
    try {
      const { updateDoc, doc, getDoc } = await import("firebase/firestore");
      const userRef = doc(db, "users", userId);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        alert("Kullanıcı bulunamadı");
        return;
      }

      await updateDoc(userRef, { cargoGuy: false });
      alert(`${userName} kargo personeli listesinden çıkarıldı`);
      fetchCargoUsers();
    } catch (error) {
      console.error("Error removing cargo user:", error);
      alert("Kargo personeli çıkarılırken bir hata oluştu");
    } finally {
      setProcessingCargo(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-[1900px] mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 bg-orange-600 rounded-lg">
                <TruckIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Kargo Yönetimi
                </h1>
                <p className="text-sm text-gray-600">
                  İki aşamalı kargo sistemi: Toplama ve Dağıtım
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowCargoModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Kargocu Ekle/Çıkar
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Ara (alıcı, satıcı, ürün)"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab("gathering")}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === "gathering"
                  ? "text-orange-600 border-b-2 border-orange-600"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Toplanacaklar
            </button>
            <button
              onClick={() => setActiveTab("distribution")}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === "distribution"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Dağıtılacaklar
            </button>
            {/* ADD THIS NEW BUTTON */}
            <button
              onClick={() => setActiveTab("delivered")}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === "delivered"
                  ? "text-green-600 border-b-2 border-green-600"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Teslim Edilenler
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="mt-4">
          {activeTab === "gathering" ? (
            <GatheringTab
              cargoUsers={cargoUsers}
              searchTerm={searchTerm}
              selectedItems={gatheringSelectedItems}
              setSelectedItems={setGatheringSelectedItems}
              onTransferToDistribution={handleTransferToDistribution}
              transferringItems={transferringItems}
            />
          ) : activeTab === "distribution" ? (
            <DistributionTab
              cargoUsers={cargoUsers}
              searchTerm={searchTerm}
              selectedOrders={distributionSelectedOrders}
              setSelectedOrders={setDistributionSelectedOrders}
              onTransferToGathering={handleTransferToGathering}
              transferringItems={transferringItems}
            />
          ) : (
            <DeliveredTab searchTerm={searchTerm} />
          )}
        </div>
      </div>

      {/* Cargo Management Modal */}
      {showCargoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">
                Kargo Personeli Yönetimi
              </h2>
              <button
                onClick={() => {
                  setShowCargoModal(false);
                  setCargoEmail("");
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[calc(80vh-140px)]">
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  Yeni Kargo Personeli Ekle
                </h3>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={cargoEmail}
                    onChange={(e) => setCargoEmail(e.target.value)}
                    placeholder="Kullanıcının e-posta adresi"
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    disabled={processingCargo}
                  />
                  <button
                    onClick={handleAddCargo}
                    disabled={processingCargo || !cargoEmail.trim()}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processingCargo ? "Ekleniyor..." : "Ekle"}
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  Mevcut Kargo Personeli ({cargoUsers.length})
                </h3>
                {cargoUsers.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    Henüz kargo personeli eklenmemiş
                  </div>
                ) : (
                  <div className="space-y-2">
                    {cargoUsers.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                            <User className="w-4 h-4 text-orange-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {user.displayName}
                            </p>
                            <p className="text-xs text-gray-500">
                              {user.email}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() =>
                            handleRemoveCargo(user.id, user.displayName)
                          }
                          disabled={processingCargo}
                          className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Çıkar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => {
                  setShowCargoModal(false);
                  setCargoEmail("");
                }}
                className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium transition-colors"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
