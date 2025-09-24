"use client";

import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  MapPin,
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  Clock,
  Phone,
  User,
  Navigation,
  Search,
  LogOut,
  ArrowLeft,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useRouter } from "next/navigation";

interface PickupPoint {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  contactPerson: string;
  contactPhone: string;
  operatingHours: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  notes?: string;
}

interface MapComponentProps {
  pickupPoints: PickupPoint[];
  onMapClick: (lat: number, lng: number) => void;
  onMarkerClick: (point: PickupPoint) => void;
  selectedPoint: PickupPoint | null;
  editingPoint: PickupPoint | null;
  tempLocation: { lat: number; lng: number } | null;
  showAddForm: boolean;
}

// Check if Google Maps API is loaded
const isGoogleMapsLoaded = () => {
  return (
    typeof window !== "undefined" &&
    window.google &&
    window.google.maps &&
    window.google.maps.Map
  );
};

// Google Maps Component
const MapComponent = ({
  pickupPoints,
  onMapClick,
  onMarkerClick,
  selectedPoint,
  editingPoint,
  tempLocation,
  showAddForm,
}: MapComponentProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const tempMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(
    null
  );
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((marker) => {
      marker.map = null;
    });
    markersRef.current = [];
  }, []);

  const clearTempMarker = useCallback(() => {
    if (tempMarkerRef.current) {
      tempMarkerRef.current.map = null;
      tempMarkerRef.current = null;
    }
  }, []);

  const createTempMarker = useCallback(
    async (lat: number, lng: number) => {
      if (!mapInstanceRef.current || !isGoogleMapsLoaded()) {
        console.log("Map or Google Maps not ready for temp marker");
        return;
      }

      console.log("Creating temp marker at:", lat, lng);
      clearTempMarker();

      try {
        const { AdvancedMarkerElement, PinElement } =
          (await google.maps.importLibrary(
            "marker"
          )) as google.maps.MarkerLibrary;

        const pinElement = new PinElement({
          background: "#f59e0b",
          borderColor: "#ffffff",
          glyphColor: "#ffffff",
          scale: 1.2,
        });

        const tempMarker = new AdvancedMarkerElement({
          position: { lat, lng },
          map: mapInstanceRef.current,
          title: "Selected Location",
          content: pinElement.element,
        });

        tempMarkerRef.current = tempMarker;
        console.log("Temp marker created successfully");
      } catch (error) {
        console.error("Error creating temp marker:", error);
      }
    },
    [clearTempMarker]
  );

  const updateMarkers = useCallback(async () => {
    if (!mapInstanceRef.current || !isGoogleMapsLoaded()) {
      console.log("Map not ready for marker update");
      return;
    }

    console.log("Updating markers, pickup points count:", pickupPoints.length);
    clearMarkers();

    try {
      const { AdvancedMarkerElement, PinElement } =
        (await google.maps.importLibrary(
          "marker"
        )) as google.maps.MarkerLibrary;

      pickupPoints.forEach((point) => {
        if (
          !point.latitude ||
          !point.longitude ||
          isNaN(point.latitude) ||
          isNaN(point.longitude) ||
          (point.latitude === 0 && point.longitude === 0)
        ) {
          console.warn(
            "Invalid coordinates for point:",
            point.name,
            point.latitude,
            point.longitude
          );
          return;
        }

        const isSelected = selectedPoint?.id === point.id;
        const isEditing = editingPoint?.id === point.id;

        try {
          let pinColor = "#2563eb";
          if (!point.isActive) {
            pinColor = "#ef4444";
          } else if (isEditing) {
            pinColor = "#f59e0b";
          } else if (isSelected) {
            pinColor = "#059669";
          }

          const pinElement = new PinElement({
            background: pinColor,
            borderColor: "#ffffff",
            glyphColor: "#ffffff",
            scale: isSelected || isEditing ? 1.2 : 1.0,
          });

          const marker = new AdvancedMarkerElement({
            position: { lat: point.latitude, lng: point.longitude },
            map: mapInstanceRef.current,
            title: point.name,
            content: pinElement.element,
          });

          marker.addListener("click", () => {
            console.log("Marker clicked:", point.name);
            onMarkerClick(point);
          });

          markersRef.current.push(marker);
          console.log(
            "Created marker for:",
            point.name,
            "at",
            point.latitude,
            point.longitude
          );
        } catch (error) {
          console.error("Error creating marker for:", point.name, error);
        }
      });

      console.log("Total markers created:", markersRef.current.length);
    } catch (error) {
      console.error("Error importing marker library:", error);
    }
  }, [pickupPoints, selectedPoint, editingPoint, onMarkerClick, clearMarkers]);

  const initializeMap = useCallback(() => {
    if (!mapRef.current || !isGoogleMapsLoaded()) {
      console.log("Map ref or Google Maps not available");
      return;
    }

    try {
      const cyprusCenter = { lat: 35.1264, lng: 33.4299 };

      const map = new google.maps.Map(mapRef.current, {
        zoom: 10,
        center: cyprusCenter,
        mapId: "DEMO_MAP_ID",
        styles: [],
      });

      mapInstanceRef.current = map;
      setIsMapLoaded(true);
      setLoadError(null);

      map.addListener("click", (e: google.maps.MapMouseEvent) => {
        if (e.latLng) {
          const lat = e.latLng.lat();
          const lng = e.latLng.lng();
          console.log("Map clicked:", lat, lng);
          onMapClick(lat, lng);
        }
      });

      console.log("Map initialized successfully");
    } catch (error) {
      console.error("Error initializing map:", error);
      setLoadError("Failed to initialize map");
    }
  }, [onMapClick]);

  const loadGoogleMapsScript = useCallback(() => {
    if (isGoogleMapsLoaded()) {
      initializeMap();
      return;
    }

    const existingScript = document.querySelector(
      'script[src*="maps.googleapis.com"]'
    );
    if (existingScript) {
      existingScript.addEventListener("load", initializeMap);
      return;
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setLoadError("Google Maps API key not found");
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker,places`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      console.log("Google Maps script loaded");
      setTimeout(initializeMap, 100);
    };

    script.onerror = () => {
      console.error("Failed to load Google Maps script");
      setLoadError("Failed to load Google Maps");
    };

    document.head.appendChild(script);
  }, [initializeMap]);

  useEffect(() => {
    loadGoogleMapsScript();
    return () => {
      clearMarkers();
      clearTempMarker();
    };
  }, [loadGoogleMapsScript, clearMarkers, clearTempMarker]);

  useEffect(() => {
    if (isMapLoaded && mapInstanceRef.current) {
      console.log("Effect triggered - updating markers");
      const timeoutId = setTimeout(() => {
        updateMarkers();
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [
    pickupPoints.length,
    pickupPoints,
    selectedPoint,
    editingPoint,
    isMapLoaded,
    updateMarkers,
  ]);

  useEffect(() => {
    console.log(
      "Temp marker effect - tempLocation:",
      tempLocation,
      "isMapLoaded:",
      isMapLoaded,
      "showAddForm:",
      showAddForm,
      "editingPoint:",
      !!editingPoint
    );

    if (
      isMapLoaded &&
      (showAddForm || editingPoint) &&
      tempLocation &&
      tempLocation.lat !== 0 &&
      tempLocation.lng !== 0
    ) {
      console.log(
        "Creating temp marker at:",
        tempLocation.lat,
        tempLocation.lng
      );
      createTempMarker(tempLocation.lat, tempLocation.lng);
    } else {
      console.log("Clearing temp marker");
      clearTempMarker();
    }
  }, [
    tempLocation,
    isMapLoaded,
    showAddForm,
    editingPoint,
    createTempMarker,
    clearTempMarker,
  ]);

  if (loadError) {
    return (
      <div className="w-full h-full rounded-lg border border-red-200 flex items-center justify-center bg-red-50">
        <div className="text-center text-red-600">
          <AlertCircle className="w-8 h-8 mx-auto mb-2" />
          <p className="font-medium">Map Load Error</p>
          <p className="text-sm text-red-500">{loadError}</p>
          <button
            onClick={() => {
              setLoadError(null);
              loadGoogleMapsScript();
            }}
            className="mt-2 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full rounded-lg border border-gray-200 overflow-hidden relative bg-white">
      {!isMapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
          <div className="text-center text-gray-600">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
            <p>Loading map...</p>
          </div>
        </div>
      )}
      <div
        ref={mapRef}
        className="w-full h-full"
        style={{ minHeight: "500px" }}
      />
    </div>
  );
};

export default function PickupPointsPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [pickupPoints, setPickupPoints] = useState<PickupPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPoint, setSelectedPoint] = useState<PickupPoint | null>(null);
  const [editingPoint, setEditingPoint] = useState<PickupPoint | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [tempLocation, setTempLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    address: "",
    latitude: 0,
    longitude: 0,
    contactPerson: "",
    contactPhone: "",
    operatingHours: "",
    isActive: true,
    notes: "",
  });

  useEffect(() => {
    console.log("Setting up Firebase listener");
    const unsubscribe = onSnapshot(
      query(collection(db, "pickup_points"), orderBy("createdAt", "desc")),
      (snapshot) => {
        console.log(
          "Firebase snapshot received, docs count:",
          snapshot.docs.length
        );
        const points = snapshot.docs.map((doc) => {
          const data = doc.data();
          console.log("Document data:", doc.id, data);
          return {
            id: doc.id,
            ...data,
          };
        }) as PickupPoint[];

        console.log("Processed pickup points:", points);
        setPickupPoints(points);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching pickup points:", error);
        setLoading(false);
      }
    );

    return () => {
      console.log("Cleaning up Firebase listener");
      unsubscribe();
    };
  }, []);

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      console.log(
        "Map click handler called:",
        lat,
        lng,
        "showAddForm:",
        showAddForm,
        "editingPoint:",
        !!editingPoint
      );

      if (showAddForm || editingPoint) {
        console.log("Updating form data and temp location");

        setFormData((prev) => ({
          ...prev,
          latitude: lat,
          longitude: lng,
        }));

        setTempLocation({ lat, lng });

        console.log("Form data updated with coordinates:", lat, lng);
        console.log("Temp location set:", { lat, lng });
      }
    },
    [showAddForm, editingPoint]
  );

  const handleMarkerClick = useCallback(
    (point: PickupPoint) => {
      console.log("Marker click handler called:", point.name);
      if (!showAddForm && !editingPoint) {
        setSelectedPoint(point);
      }
    },
    [showAddForm, editingPoint]
  );

  const handleAddNew = () => {
    console.log("Add new clicked");
    setShowAddForm(true);
    setEditingPoint(null);
    setSelectedPoint(null);
    setTempLocation(null);
    setFormData({
      name: "",
      address: "",
      latitude: 0,
      longitude: 0,
      contactPerson: "",
      contactPhone: "",
      operatingHours: "09:00 - 18:00",
      isActive: true,
      notes: "",
    });
  };

  const handleEdit = (point: PickupPoint) => {
    console.log("Edit clicked for:", point.name);
    setEditingPoint(point);
    setShowAddForm(false);
    setSelectedPoint(null);

    setTempLocation({ lat: point.latitude, lng: point.longitude });

    setFormData({
      name: point.name,
      address: point.address,
      latitude: point.latitude,
      longitude: point.longitude,
      contactPerson: point.contactPerson,
      contactPhone: point.contactPhone,
      operatingHours: point.operatingHours,
      isActive: point.isActive,
      notes: point.notes || "",
    });
  };

  const handleSave = async () => {
    try {
      if (
        !formData.name ||
        !formData.address ||
        formData.latitude === 0 ||
        formData.longitude === 0
      ) {
        alert("Lütfen tüm gerekli alanları doldurun ve haritadan konum seçin!");
        return;
      }

      const latitude = Number(formData.latitude);
      const longitude = Number(formData.longitude);

      if (isNaN(latitude) || isNaN(longitude)) {
        alert("Geçersiz koordinatlar!");
        return;
      }

      const data = {
        name: formData.name.trim(),
        address: formData.address.trim(),
        latitude: latitude,
        longitude: longitude,
        contactPerson: formData.contactPerson.trim(),
        contactPhone: formData.contactPhone.trim(),
        operatingHours: formData.operatingHours.trim() || "09:00 - 18:00",
        isActive: formData.isActive,
        notes: formData.notes.trim(),
        updatedAt: Timestamp.now(),
      };

      console.log("Saving pickup point with data:", data);

      if (editingPoint) {
        await updateDoc(doc(db, "pickup_points", editingPoint.id), data);
        console.log("Pickup point updated successfully");
      } else {
        const docRef = await addDoc(collection(db, "pickup_points"), {
          ...data,
          createdAt: Timestamp.now(),
        });
        console.log("Pickup point added successfully with ID:", docRef.id);
      }

      setShowAddForm(false);
      setEditingPoint(null);
      setSelectedPoint(null);
      setTempLocation(null);
      setFormData({
        name: "",
        address: "",
        latitude: 0,
        longitude: 0,
        contactPerson: "",
        contactPhone: "",
        operatingHours: "09:00 - 18:00",
        isActive: true,
        notes: "",
      });
    } catch (error) {
      console.error("Error saving pickup point:", error);
      alert("Pickup point kaydedilirken hata oluştu!");
    }
  };

  const handleDelete = async (pointId: string) => {
    if (!confirm("Bu pickup point'i silmek istediğinizden emin misiniz?")) {
      return;
    }

    try {
      await deleteDoc(doc(db, "pickup_points", pointId));
      setSelectedPoint(null);
      console.log("Pickup point deleted successfully");
    } catch (error) {
      console.error("Error deleting pickup point:", error);
      alert("Pickup point silinirken hata oluştu!");
    }
  };

  const handleCancel = () => {
    setShowAddForm(false);
    setEditingPoint(null);
    setSelectedPoint(null);
    setTempLocation(null);
    setFormData({
      name: "",
      address: "",
      latitude: 0,
      longitude: 0,
      contactPerson: "",
      contactPhone: "",
      operatingHours: "09:00 - 18:00",
      isActive: true,
      notes: "",
    });
  };

  const handleLogout = async () => {
    await logout();
  };

  const filteredPoints = pickupPoints.filter(
    (point) =>
      point.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      point.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      point.contactPerson.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.push("/dashboard")}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-gray-600" />
                </button>

                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <MapPin className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h1 className="text-xl font-semibold text-gray-900">
                      Pickup Points
                    </h1>
                    <p className="text-sm text-gray-500">
                      Teslimat noktaları yönetimi
                    </p>
                  </div>
                </div>

                <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-lg">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="text-sm text-gray-600">
                    {pickupPoints.length} nokta
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-2 text-gray-600">
                  <User className="w-4 h-4" />
                  <span className="text-sm">{user?.email}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:block">Çıkış</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {/* Map Section */}
            <div className="xl:col-span-8">
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Navigation className="w-5 h-5 text-gray-600" />
                      <h2 className="text-lg font-medium text-gray-900">
                        Kıbrıs Haritası
                      </h2>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        <span className="text-gray-600">Aktif</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                        <span className="text-gray-600">Pasif</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <span className="text-gray-600">Seçili</span>
                      </div>
                      {(showAddForm || editingPoint) && (
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                          <span className="text-gray-600">Yeni Konum</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {(showAddForm || editingPoint) && (
                    <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-center gap-2 text-yellow-800">
                        <MapPin className="w-4 h-4" />
                        <span className="text-sm font-medium">
                          Haritaya tıklayarak konum seçin
                        </span>
                        {tempLocation &&
                        tempLocation.lat !== 0 &&
                        tempLocation.lng !== 0 ? (
                          <span className="ml-2 text-green-700 text-sm font-medium">
                            ✓ Konum seçildi
                          </span>
                        ) : (
                          <span className="ml-2 text-red-700 text-sm font-medium">
                            ⚠ Konum seçilmedi
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="h-96 lg:h-[500px]">
                  <MapComponent
                    pickupPoints={pickupPoints}
                    onMapClick={handleMapClick}
                    onMarkerClick={handleMarkerClick}
                    selectedPoint={selectedPoint}
                    editingPoint={editingPoint}
                    tempLocation={tempLocation}
                    showAddForm={showAddForm}
                  />
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="xl:col-span-4 space-y-6">
              {/* Controls */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    Kontroller
                  </h3>
                  <button
                    onClick={handleAddNew}
                    disabled={showAddForm || !!editingPoint}
                    className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                    Yeni Ekle
                  </button>
                </div>

                {/* Search */}
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Pickup point ara..."
                    className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Active Form */}
                {(showAddForm || editingPoint) && (
                  <div className="space-y-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                    <h4 className="font-medium text-gray-900">
                      {editingPoint
                        ? "Pickup Point Düzenle"
                        : "Yeni Pickup Point"}
                    </h4>

                    <div className="space-y-3">
                      <input
                        type="text"
                        placeholder="Nokta adı *"
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />

                      <input
                        type="text"
                        placeholder="Adres *"
                        value={formData.address}
                        onChange={(e) =>
                          setFormData({ ...formData, address: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />

                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          step="0.000001"
                          placeholder="Enlem *"
                          value={formData.latitude || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              latitude: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <input
                          type="number"
                          step="0.000001"
                          placeholder="Boylam *"
                          value={formData.longitude || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              longitude: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>

                      <input
                        type="text"
                        placeholder="İletişim kişisi"
                        value={formData.contactPerson}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            contactPerson: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />

                      <input
                        type="text"
                        placeholder="Telefon"
                        value={formData.contactPhone}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            contactPhone: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />

                      <input
                        type="text"
                        placeholder="Çalışma saatleri"
                        value={formData.operatingHours}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            operatingHours: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />

                      <textarea
                        placeholder="Notlar (opsiyonel)"
                        value={formData.notes}
                        onChange={(e) =>
                          setFormData({ ...formData, notes: e.target.value })
                        }
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />

                      <label className="flex items-center gap-2 text-gray-700">
                        <input
                          type="checkbox"
                          checked={formData.isActive}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              isActive: e.target.checked,
                            })
                          }
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm">Aktif</span>
                      </label>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={handleSave}
                        disabled={
                          !formData.name ||
                          !formData.address ||
                          formData.latitude === 0 ||
                          formData.longitude === 0
                        }
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
                      >
                        <Save className="w-4 h-4" />
                        Kaydet
                      </button>
                      <button
                        onClick={handleCancel}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        <X className="w-4 h-4" />
                        İptal
                      </button>
                    </div>
                  </div>
                )}

                {/* Selected Point Info */}
                {selectedPoint && !showAddForm && !editingPoint && (
                  <div className="space-y-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-gray-900">
                        {selectedPoint.name}
                      </h4>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(selectedPoint)}
                          className="p-1.5 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(selectedPoint.id)}
                          className="p-1.5 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-gray-600">
                        <MapPin className="w-4 h-4 flex-shrink-0" />
                        <span>{selectedPoint.address}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <User className="w-4 h-4 flex-shrink-0" />
                        <span>{selectedPoint.contactPerson}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <Phone className="w-4 h-4 flex-shrink-0" />
                        <span>{selectedPoint.contactPhone}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <Clock className="w-4 h-4 flex-shrink-0" />
                        <span>{selectedPoint.operatingHours}</span>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        {selectedPoint.isActive ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600" />
                        )}
                        <span
                          className={`text-sm font-medium ${
                            selectedPoint.isActive
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {selectedPoint.isActive ? "Aktif" : "Pasif"}
                        </span>
                      </div>

                      {selectedPoint.notes && (
                        <div className="mt-2 p-2 bg-white rounded text-gray-600 text-xs border">
                          {selectedPoint.notes}
                        </div>
                      )}

                      <div className="text-xs text-gray-500 pt-1 font-mono">
                        {selectedPoint.latitude.toFixed(6)},{" "}
                        {selectedPoint.longitude.toFixed(6)}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Pickup Points List */}
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">
                    Pickup Points ({filteredPoints.length})
                  </h3>
                </div>

                <div className="p-4">
                  {loading ? (
                    <div className="text-center text-gray-500 py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-2"></div>
                      Yükleniyor...
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {filteredPoints.map((point) => (
                        <div
                          key={point.id}
                          onClick={() => {
                            if (!showAddForm && !editingPoint) {
                              setSelectedPoint(point);
                            }
                          }}
                          className={`p-3 rounded-lg border cursor-pointer transition-all ${
                            selectedPoint?.id === point.id
                              ? "bg-blue-50 border-blue-200"
                              : editingPoint?.id === point.id
                              ? "bg-yellow-50 border-yellow-200"
                              : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                          } ${
                            showAddForm || editingPoint
                              ? "cursor-not-allowed opacity-50"
                              : ""
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium text-gray-900 text-sm truncate">
                                  {point.name}
                                </h4>
                                {point.isActive ? (
                                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                ) : (
                                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                )}
                              </div>
                              <p className="text-xs text-gray-600 truncate">
                                {point.address}
                              </p>
                              <p className="text-xs text-gray-500">
                                {point.contactPerson}
                              </p>
                            </div>
                            {!showAddForm && !editingPoint && (
                              <div className="flex gap-1 ml-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEdit(point);
                                  }}
                                  className="p-1 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded transition-colors"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(point.id);
                                  }}
                                  className="p-1 bg-red-100 hover:bg-red-200 text-red-600 rounded transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}

                      {filteredPoints.length === 0 && !loading && (
                        <div className="text-center text-gray-500 py-8">
                          <MapPin className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                          <p>Pickup point bulunamadı</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
