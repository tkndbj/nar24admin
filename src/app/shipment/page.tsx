"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { db } from "@/app/lib/firebase";
import { TruckIcon, UserPlus, X, Search, User, Package, MapPin, Calendar, Phone } from "lucide-react";
import { CargoUser, CombinedOrder, OrderHeader, OrderItem } from "./types";
import GatheringTab from "./GatheringTab";
import DistributionTab from "./DistributionTab";
import DeliveredTab from "./DeliveredTab";
import { useAlgoliaSearch } from "@/hooks/useAlgoliaSearch";
import { getDoc } from "firebase/firestore";
import { debounce } from 'lodash';
import { AlgoliaOrderHit } from "@/app/lib/algolia/searchService";
import { runTransaction } from 'firebase/firestore';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  Timestamp,
  query as firestoreQuery,
  collectionGroup,
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
  const [enrichedResults, setEnrichedResults] = useState<AlgoliaOrderHit[]>([]);
const [enrichingData, setEnrichingData] = useState(false);
const [showCargoTrackingModal, setShowCargoTrackingModal] = useState(false);
const [cargoTrackingData, setCargoTrackingData] = useState<{
  [cargoUserId: string]: {
    user: CargoUser;
    gatheringItems: OrderItem[];
    distributionOrders: CombinedOrder[];
  };
}>({});
const [loadingTracking, setLoadingTracking] = useState(false);
  const [transferringItems, setTransferringItems] = useState(false);
  const [gatheringSelectedItems, setGatheringSelectedItems] = useState<
    Set<string>
  >(new Set());
  const [distributionSelectedOrders, setDistributionSelectedOrders] = useState<
    Set<string>
  >(new Set());

  const enrichAbortControllerRef = useRef<AbortController | null>(null);


  const loadCargoTrackingData = async () => {
    setLoadingTracking(true);
    try {
      const trackingData: {
        [cargoUserId: string]: {
          user: CargoUser;
          gatheringItems: OrderItem[];
          distributionOrders: CombinedOrder[];
        };
      } = {};
  
      // Load data for each cargo user
      await Promise.all(
        cargoUsers.map(async (cargoUser) => {
          // Get gathering items assigned to this cargo user
          const gatheringQuery = firestoreQuery(
            collectionGroup(db, "items"),
            where("gatheredBy", "==", cargoUser.id),
            where("gatheringStatus", "in", ["assigned", "gathered"])
          );
          const gatheringSnap = await getDocs(gatheringQuery);
          const gatheringItems: OrderItem[] = gatheringSnap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            orderId: doc.ref.parent.parent?.id || "",
          })) as OrderItem[];
  
          // Get distribution orders assigned to this cargo user
          const distributionQuery = firestoreQuery(
            collection(db, "orders"),
            where("distributedBy", "==", cargoUser.id),
            where("distributionStatus", "in", ["assigned", "distributed"])
          );
          const distributionSnap = await getDocs(distributionQuery);
  
          const distributionOrders: CombinedOrder[] = await Promise.all(
            distributionSnap.docs.map(async (orderDoc) => {
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
  
          trackingData[cargoUser.id] = {
            user: cargoUser,
            gatheringItems,
            distributionOrders,
          };
        })
      );
  
      setCargoTrackingData(trackingData);
    } catch (error) {
      console.error("Error loading cargo tracking data:", error);
      alert("Takip verileri yüklenirken hata oluştu");
    } finally {
      setLoadingTracking(false);
    }
  };

  const enrichSearchResults = async (results: AlgoliaOrderHit[]) => {
    const controller = new AbortController();
    
    // ✅ GOOD: Just use the ref that was created at top level
    enrichAbortControllerRef.current = controller;
    
    setEnrichingData(true);
    
    try {
      const enriched = await Promise.all(
        results.map(async (result) => {
          if (controller.signal.aborted) return result;
          
          try {
            const orderRef = doc(db, "orders", result.orderId);
            const orderSnap = await getDoc(orderRef);
            
            if (controller.signal.aborted) return result;
            
            if (orderSnap.exists()) {
              const orderData = orderSnap.data();
              return {
                ...result,
                gatheringStatus: orderData.gatheringStatus || result.gatheringStatus,
                distributionStatus: orderData.distributionStatus || result.distributionStatus,
                allItemsGathered: orderData.allItemsGathered || result.allItemsGathered,
              };
            }
            return result;
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
              console.log('Request was aborted');
              return result;
            }
            console.error(`Error fetching order ${result.orderId}:`, error);
            return result;
          }
        })
      );
      
      if (!controller.signal.aborted) {
        setEnrichedResults(enriched);
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Error enriching results:', error);
        setEnrichedResults(results);
      }
    } finally {
      if (!controller.signal.aborted) {
        setEnrichingData(false);
      }
    }
    
    // ✅ REMOVE the return statement that was here
  };
  
  // Call this when modal opens
  useEffect(() => {
    if (showCargoTrackingModal && cargoUsers.length > 0) {
      loadCargoTrackingData();
    }
  }, [showCargoTrackingModal, cargoUsers]); 
  

  // Single unified search without filters
  const unifiedSearch = useAlgoliaSearch({
    enabled: searchTerm.length > 0,
  });

  useEffect(() => {
    fetchCargoUsers();
  }, []);

  useEffect(() => {
    if (searchTerm.trim().length === 0) {
      unifiedSearch.clearSearch();
      setEnrichedResults([]);
      return;
    }
    // Call search directly - the hook already has debouncing built in
    unifiedSearch.search(searchTerm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  useEffect(() => {
    if (unifiedSearch.results.length > 0 && !unifiedSearch.isSearching) {
      enrichSearchResults(unifiedSearch.results);
    } else {
      setEnrichedResults([]);
    }
  }, [unifiedSearch.results, unifiedSearch.isSearching]);

  useEffect(() => {
    let mounted = true;
    
    const loadData = async () => {
      if (showCargoTrackingModal && cargoUsers.length > 0 && mounted) {
        await loadCargoTrackingData();
      }
    };
    
    loadData();
    
    return () => {
      mounted = false;
    };
  }, [showCargoTrackingModal, cargoUsers]);

  useEffect(() => {
    setGatheringSelectedItems(new Set());
    setDistributionSelectedOrders(new Set());
  }, [activeTab]);

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

  const handleTransferToDistribution = async (itemKeys: string[]) => {
    if (!confirm(`${itemKeys.length} ürünü dağıtılacaklara aktarmak istiyor musunuz?`)) {
      return;
    }
  
    setTransferringItems(true);
    
    try {
      await runTransaction(db, async (transaction) => {
        // First, get all documents we need to update
        const itemRefs = new Map<string, any>();
        const orderRefs = new Map<string, any>();
        
        // Read phase - get all documents
        for (const itemKey of itemKeys) {
          const [orderId, itemId] = itemKey.split("|");
          const itemRef = doc(db, "orders", orderId, "items", itemId);
          const itemDoc = await transaction.get(itemRef);
          
          if (!itemDoc.exists()) {
            throw new Error(`Item ${itemId} not found`);
          }
          
          itemRefs.set(itemKey, { ref: itemRef, data: itemDoc.data() });
          
          // Also get the order document
          if (!orderRefs.has(orderId)) {
            const orderRef = doc(db, "orders", orderId);
            const orderDoc = await transaction.get(orderRef);
            
            if (orderDoc.exists()) {
              orderRefs.set(orderId, { ref: orderRef, data: orderDoc.data() });
            }
          }
        }
        
        // Write phase - update all documents atomically
        for (const [itemKey, { ref: itemRef, data: itemData }] of itemRefs) {
          const updateData = {
            gatheringStatus: "at_warehouse",
            arrivedAt: Timestamp.now(),
            ...(!itemData?.gatheredAt && { gatheredAt: Timestamp.now() }),
            ...(!itemData?.gatheredBy && {
              gatheredBy: "SYSTEM",
              gatheredByName: "Admin Transfer",
            }),
          };
          
          transaction.update(itemRef, updateData);
        }
        
        // Check and update order status
        const orderIds = [...new Set(itemKeys.map((key) => key.split("|")[0]))];
        
        for (const orderId of orderIds) {
          // Get all items for this order
          const itemsRef = collection(db, "orders", orderId, "items");
          const itemsSnapshot = await getDocs(itemsRef);
          
          const allAtWarehouse = itemsSnapshot.docs.every(
            (doc) => {
              const itemKey = `${orderId}|${doc.id}`;
              const updatedItem = itemRefs.get(itemKey);
              
              if (updatedItem) {
                return true; // This item is being updated to at_warehouse
              }
              return doc.data().gatheringStatus === "at_warehouse";
            }
          );
          
          if (allAtWarehouse && orderRefs.has(orderId)) {
            const { ref: orderRef } = orderRefs.get(orderId);
            transaction.update(orderRef, {
              allItemsGathered: true,
              distributionStatus: "ready",
            });
          }
        }
      });
      
      
      setGatheringSelectedItems(new Set());
      
      // Reload data to reflect changes
      if (activeTab === "gathering") {
        // Trigger reload in GatheringTab
      }
    } catch (error) {
      console.error("Transaction failed:", error);
      alert("İşlem sırasında hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setTransferringItems(false);
    }
  };

  const handleTransferToGathering = async (orderIds: string[]) => {
    

    setTransferringItems(true);
    try {
      await Promise.all(
        orderIds.map(async (orderId) => {
          const orderRef = doc(db, "orders", orderId);
          await updateDoc(orderRef, {
            allItemsGathered: false,
            distributionStatus: null,
            distributedBy: null,
            distributedByName: null,
            distributedAt: null,
            deliveredAt: null,
          });

          const itemsSnapshot = await getDocs(
            collection(db, "orders", orderId, "items")
          );

          await Promise.all(
            itemsSnapshot.docs.map(async (itemDoc) => {
              const itemData = itemDoc.data();
              const itemRef = doc(db, "orders", orderId, "items", itemDoc.id);

              if (itemData.gatheredBy && itemData.gatheredBy !== "SYSTEM") {
                await updateDoc(itemRef, {
                  gatheringStatus: "assigned",
                  arrivedAt: null,
                  deliveredInPartial: null,
                  partialDeliveryAt: null,
                });
              } else {
                await updateDoc(itemRef, {
                  gatheringStatus: "pending",
                  gatheredBy: null,
                  gatheredByName: null,
                  gatheredAt: null,
                  arrivedAt: null,
                  deliveredInPartial: null,
                  partialDeliveryAt: null,
                });
              }
            })
          );
        })
      );

      
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
      
      fetchCargoUsers();
    } catch (error) {
      console.error("Error removing cargo user:", error);
      alert("Kargo personeli çıkarılırken bir hata oluştu");
    } finally {
      setProcessingCargo(false);
    }
  };

  // Get status badge based on order state
  const getStatusBadge = (order: AlgoliaOrderHit) => {
    const gatheringStatus = order.gatheringStatus;
    const distributionStatus = order.distributionStatus;
    const allItemsGathered = order.allItemsGathered;

    if (distributionStatus === "delivered") {
      return {
        label: "Dağıtıldı",
        color: "bg-green-100 text-green-700 border-green-200",
      };
    }

    if (distributionStatus === "assigned" || distributionStatus === "in_progress") {
      return {
        label: "Dağıtımda",
        color: "bg-blue-100 text-blue-700 border-blue-200",
      };
    }

    if (gatheringStatus === "at_warehouse" || allItemsGathered) {
      return {
        label: "Depoda",
        color: "bg-purple-100 text-purple-700 border-purple-200",
      };
    }

    if (gatheringStatus === "assigned" || gatheringStatus === "pending") {
      return {
        label: "Toplanacak",
        color: "bg-orange-100 text-orange-700 border-orange-200",
      };
    }

    return {
      label: "Bilinmiyor",
      color: "bg-gray-100 text-gray-700 border-gray-200",
    };
  };

  // Format timestamp
  const formatDate = (timestamp: { _seconds: number; _nanoseconds: number } | null) => {
    if (!timestamp) return "—";
    const date = new Date(timestamp._seconds * 1000);
    return date.toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
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
              placeholder="Ara (alıcı, satıcı, ürün, marka, kategori...)"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            {unifiedSearch.isSearching && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-600"></div>
              </div>
            )}
          </div>

          {/* Search Results Info */}
          {searchTerm.trim().length > 0 && !unifiedSearch.isSearching && (
            <div className="mb-4 text-sm text-gray-600">
              {unifiedSearch.totalResults > 0 ? (
                <span>
                  <strong>{unifiedSearch.totalResults}</strong> sonuç bulundu
                </span>
              ) : (
                <span className="text-orange-600">Sonuç bulunamadı</span>
              )}
            </div>
          )}

          {/* Error Message */}
          {unifiedSearch.error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {unifiedSearch.error}
            </div>
          )}

          {/* Tabs - Only show when NOT searching */}
          {searchTerm.trim().length === 0 && (
  <div className="flex items-center justify-between border-b border-gray-200">
    {/* LEFT SIDE - Tabs */}
    <div className="flex">
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

    {/* RIGHT SIDE - Tracking Button */}
    <button
      onClick={() => setShowCargoTrackingModal(true)}
      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg text-sm font-medium transition-all shadow-md hover:shadow-lg mr-2"
    >
      <User className="w-4 h-4" />
      Kargocu Takip
    </button>
  </div>
)} 
        </div>

        {/* Content Area */}
        <div className="mt-4">
          {/* Show search results when searching */}
          {searchTerm.trim().length > 0 ? (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200">
    {unifiedSearch.isSearching || enrichingData ? (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
          <p className="text-sm text-gray-600">
            {unifiedSearch.isSearching ? 'Aranıyor...' : 'Veriler güncelleniyor...'}
          </p>
        </div>
      </div>
    ) : enrichedResults.length === 0 ? (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-sm text-gray-600">
            Arama kriterlerine uygun sonuç bulunamadı
          </p>
        </div>
      </div>
    ) : (
                <div className="divide-y divide-gray-200">
                  {enrichedResults.map((order) => {
                    const status = getStatusBadge(order);
                    return (
                      <div
                        key={order.objectID}
                        className="p-4 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          {/* Product Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-3">
                              {/* Product Image */}
                              {order.productImage && (
                                <img
                                  src={order.productImage}
                                  alt={order.productName}
                                  className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                                />
                              )}
                              
                              <div className="flex-1 min-w-0">
                                {/* Product Name & Brand */}
                                <div className="flex items-center gap-2 mb-1">
                                  <h3 className="text-sm font-semibold text-gray-900 truncate">
                                    {order.productName}
                                  </h3>
                                  {order.brandModel && (
                                    <span className="text-xs text-gray-500 flex-shrink-0">
                                      • {order.brandModel}
                                    </span>
                                  )}
                                </div>

                                {/* Category & Condition */}
                                <div className="flex items-center gap-2 text-xs text-gray-600 mb-2">
                                  <span>{order.category}</span>
                                  {order.condition && (
                                    <>
                                      <span>•</span>
                                      <span>{order.condition}</span>
                                    </>
                                  )}
                                </div>

                                {/* Buyer & Seller Info */}
                                <div className="grid grid-cols-2 gap-4 text-xs">
                                  <div>
                                    <p className="text-gray-500 mb-0.5">Alıcı</p>
                                    <p className="font-medium text-gray-900">{order.buyerName}</p>
                                  </div>
                                  <div>
                                    <p className="text-gray-500 mb-0.5">Satıcı</p>
                                    <p className="font-medium text-gray-900">{order.sellerName}</p>
                                    {order.sellerContactNo && (
                                      <p className="text-gray-600 flex items-center gap-1 mt-0.5">
                                        <Phone className="w-3 h-3" />
                                        {order.sellerContactNo}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                {/* Address */}
                                {order.orderAddress && (
                                  <div className="mt-2 text-xs">
                                    <p className="text-gray-500 mb-0.5 flex items-center gap-1">
                                      <MapPin className="w-3 h-3" />
                                      Teslimat Adresi
                                    </p>
                                    <p className="text-gray-700">
                                      {order.orderAddress.addressLine1}
                                      {order.orderAddress.addressLine2 && `, ${order.orderAddress.addressLine2}`}
                                      {order.orderAddress.city && `, ${order.orderAddress.city}`}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Status & Details */}
                          <div className="flex flex-col items-end gap-2 flex-shrink-0">
                            {/* Status Badge */}
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-medium border ${status.color}`}
                            >
                              {status.label}
                            </span>

                            {/* Price & Quantity */}
                            <div className="text-right">
                              <p className="text-sm font-bold text-gray-900">
                                {order.price} {order.currency}
                              </p>
                              <p className="text-xs text-gray-500">
                                Miktar: {order.quantity}
                              </p>
                            </div>

                            {/* Order Date */}
                            {order.timestamp && (
                              <div className="text-xs text-gray-500 flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {formatDate(order.timestamp)}
                              </div>
                            )}

                            {/* Order ID */}
                            <p className="text-xs text-gray-400">
                              #{order.orderId.slice(0, 8)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            // Show tabs when not searching
            <>
              {activeTab === "gathering" ? (
                <GatheringTab
                  cargoUsers={cargoUsers}
                  searchTerm=""               
                  
                  selectedItems={gatheringSelectedItems}
                  setSelectedItems={setGatheringSelectedItems}
                  onTransferToDistribution={handleTransferToDistribution}
                  transferringItems={transferringItems}
                />
              ) : activeTab === "distribution" ? (
                <DistributionTab
                  cargoUsers={cargoUsers}
                  searchTerm=""
                  
                  selectedOrders={distributionSelectedOrders}
                  setSelectedOrders={setDistributionSelectedOrders}
                  onTransferToGathering={handleTransferToGathering}
                  transferringItems={transferringItems}
                />
              ) : (
                <DeliveredTab
                  searchTerm=""
                  
                />
              )}
            </>
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
      {/* Cargo Tracking Modal */}
{showCargoTrackingModal && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-xl shadow-2xl max-w-7xl w-full max-h-[90vh] overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/20 rounded-lg backdrop-blur-sm">
              <User className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Kargocu Takip Sistemi</h2>
              <p className="text-sm text-blue-100">
                Aktif görevleri ve durumları görüntüle
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCargoTrackingModal(false)}
            className="text-white/80 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
        {loadingTracking ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-sm text-gray-600">Veriler yükleniyor...</p>
            </div>
          </div>
        ) : cargoUsers.length === 0 ? (
          <div className="text-center py-12">
            <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600">Henüz kargo personeli eklenmemiş</p>
          </div>
        ) : (
          <div className="space-y-6">
            {cargoUsers.map((cargoUser) => {
              const userData = cargoTrackingData[cargoUser.id];
              const gatheringItems = userData?.gatheringItems || [];
              const distributionOrders = userData?.distributionOrders || [];
              const totalTasks = gatheringItems.length + distributionOrders.length;

              return (
                <div
                  key={cargoUser.id}
                  className="bg-gradient-to-br from-gray-50 to-white border-2 border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow"
                >
                  {/* Cargo User Header */}
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-md">
                          {cargoUser.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">
                            {cargoUser.displayName}
                          </h3>
                          <p className="text-sm text-gray-600">{cargoUser.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-center px-4 py-2 bg-white rounded-lg shadow-sm">
                          <p className="text-2xl font-bold text-orange-600">
                            {gatheringItems.length}
                          </p>
                          <p className="text-xs text-gray-600">Toplama</p>
                        </div>
                        <div className="text-center px-4 py-2 bg-white rounded-lg shadow-sm">
                          <p className="text-2xl font-bold text-blue-600">
                            {distributionOrders.length}
                          </p>
                          <p className="text-xs text-gray-600">Dağıtım</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Tasks Content */}
                  <div className="p-4">
                    {totalTasks === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <Package className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm">Aktif görev yok</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        {/* Gathering Items */}
                        <div>
                          <h4 className="text-sm font-semibold text-orange-600 mb-3 flex items-center gap-2">
                            <Package className="w-4 h-4" />
                            Toplama Görevleri ({gatheringItems.length})
                          </h4>
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {gatheringItems.map((item) => (
                              <div
                                key={`${item.orderId}-${item.id}`}
                                className="p-3 bg-white border border-orange-200 rounded-lg hover:shadow-md transition-shadow"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">
                                      {item.productName}
                                    </p>
                                    <p className="text-xs text-gray-600 mt-1">
                                      Satıcı: {item.sellerName}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      Sipariş: #{item.orderId.substring(0, 8)}
                                    </p>
                                  </div>
                                  <div className="flex flex-col items-end gap-1">
                                    <span className="text-xs font-medium text-gray-900">
                                      x{item.quantity}
                                    </span>
                                    <span
                                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                        item.gatheringStatus === "gathered"
                                          ? "bg-green-100 text-green-700"
                                          : "bg-yellow-100 text-yellow-700"
                                      }`}
                                    >
                                      {item.gatheringStatus === "gathered"
                                        ? "Toplandı"
                                        : "Atandı"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Distribution Orders */}
                        <div>
                          <h4 className="text-sm font-semibold text-blue-600 mb-3 flex items-center gap-2">
                            <TruckIcon className="w-4 h-4" />
                            Dağıtım Görevleri ({distributionOrders.length})
                          </h4>
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {distributionOrders.map((order) => (
                              <div
                                key={order.orderHeader.id}
                                className="p-3 bg-white border border-blue-200 rounded-lg hover:shadow-md transition-shadow"
                              >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900">
                                      {order.orderHeader.buyerName}
                                    </p>
                                    <p className="text-xs text-gray-600 flex items-center gap-1 mt-1">
                                      <MapPin className="w-3 h-3" />
                                      {order.orderHeader.address?.city || "—"}
                                    </p>
                                  </div>
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                      order.orderHeader.distributionStatus ===
                                      "distributed"
                                        ? "bg-blue-100 text-blue-700"
                                        : "bg-yellow-100 text-yellow-700"
                                    }`}
                                  >
                                    {order.orderHeader.distributionStatus ===
                                    "distributed"
                                      ? "Yolda"
                                      : "Atandı"}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                  <Package className="w-3 h-3" />
                                  <span>{order.items.length} ürün</span>
                                  <span>•</span>
                                  <span>#{order.orderHeader.id.substring(0, 8)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  </div>
)}
    </div>
  );
}