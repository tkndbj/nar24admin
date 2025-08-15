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
  Shield,
  LogOut,
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
}

// Google Maps Component
const MapComponent = ({
  pickupPoints,
  onMapClick,
  onMarkerClick,
  selectedPoint,
  editingPoint,
}: MapComponentProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);

  const initializeMap = useCallback(() => {
    if (!mapRef.current || !window.google) return;

    // Cyprus coordinates
    const cyprusCenter = { lat: 35.1264, lng: 33.4299 };

    const map = new google.maps.Map(mapRef.current, {
      zoom: 10,
      center: cyprusCenter,
      styles: [
        {
          featureType: "all",
          elementType: "geometry",
          stylers: [{ color: "#1f2937" }],
        },
        {
          featureType: "all",
          elementType: "labels.text.fill",
          stylers: [{ color: "#fbbf24" }],
        },
        {
          featureType: "all",
          elementType: "labels.text.stroke",
          stylers: [{ color: "#1f2937" }],
        },
        {
          featureType: "water",
          elementType: "geometry",
          stylers: [{ color: "#1e40af" }],
        },
        {
          featureType: "water",
          elementType: "labels.text.fill",
          stylers: [{ color: "#60a5fa" }],
        },
      ],
    });

    mapInstanceRef.current = map;

    // Add click listener
    map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (e.latLng) {
        onMapClick(e.latLng.lat(), e.latLng.lng());
      }
    });

    updateMarkers();
  }, [onMapClick]);

  const updateMarkers = useCallback(() => {
    if (!mapInstanceRef.current) return;

    // Clear existing markers
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];

    // Add markers for pickup points
    pickupPoints.forEach((point) => {
      const isSelected = selectedPoint?.id === point.id;
      const isEditing = editingPoint?.id === point.id;

      const marker = new google.maps.Marker({
        position: { lat: point.latitude, lng: point.longitude },
        map: mapInstanceRef.current,
        title: point.name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: isSelected || isEditing ? 12 : 8,
          fillColor: point.isActive
            ? isEditing
              ? "#f59e0b"
              : isSelected
              ? "#10b981"
              : "#3b82f6"
            : "#ef4444",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });

      marker.addListener("click", () => {
        onMarkerClick(point);
      });

      markersRef.current.push(marker);
    });
  }, [pickupPoints, selectedPoint, editingPoint, onMarkerClick]);

  useEffect(() => {
    const loadGoogleMaps = () => {
      if (window.google && window.google.maps) {
        initializeMap();
        return;
      }

      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = initializeMap;
      document.head.appendChild(script);
    };

    loadGoogleMaps();
  }, [initializeMap]);

  useEffect(() => {
    updateMarkers();
  }, [updateMarkers]);

  return (
    <div
      ref={mapRef}
      className="w-full h-full rounded-xl overflow-hidden border border-white/20"
      style={{ minHeight: "500px" }}
    />
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

  // Form state
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

  // Real-time listener for pickup points
  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, "pickup_points"), orderBy("createdAt", "desc")),
      (snapshot) => {
        const points = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as PickupPoint[];
        setPickupPoints(points);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching pickup points:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleMapClick = (lat: number, lng: number) => {
    if (showAddForm || editingPoint) {
      setFormData((prev) => ({
        ...prev,
        latitude: lat,
        longitude: lng,
      }));
    }
  };

  const handleMarkerClick = (point: PickupPoint) => {
    setSelectedPoint(point);
  };

  const handleAddNew = () => {
    setShowAddForm(true);
    setEditingPoint(null);
    setSelectedPoint(null);
    setFormData({
      name: "",
      address: "",
      latitude: 35.1264, // Default to Cyprus center
      longitude: 33.4299,
      contactPerson: "",
      contactPhone: "",
      operatingHours: "09:00 - 18:00",
      isActive: true,
      notes: "",
    });
  };

  const handleEdit = (point: PickupPoint) => {
    setEditingPoint(point);
    setShowAddForm(false);
    setSelectedPoint(null);
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
      const data = {
        ...formData,
        updatedAt: Timestamp.now(),
      };

      if (editingPoint) {
        // Update existing point
        await updateDoc(doc(db, "pickup_points", editingPoint.id), data);
      } else {
        // Add new point
        await addDoc(collection(db, "pickup_points"), {
          ...data,
          createdAt: Timestamp.now(),
        });
      }

      // Reset form
      setShowAddForm(false);
      setEditingPoint(null);
      setSelectedPoint(null);
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
    } catch (error) {
      console.error("Error deleting pickup point:", error);
      alert("Pickup point silinirken hata oluştu!");
    }
  };

  const handleCancel = () => {
    setShowAddForm(false);
    setEditingPoint(null);
    setSelectedPoint(null);
  };

  const handleLogout = async () => {
    await logout();
  };

  // Filter pickup points based on search
  const filteredPoints = pickupPoints.filter(
    (point) =>
      point.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      point.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      point.contactPerson.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        {/* Header */}
        <header className="backdrop-blur-xl bg-white/10 border-b border-white/20 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push("/dashboard")}
                  className="flex items-center justify-center w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg hover:scale-105 transition-transform"
                >
                  <Shield className="w-5 h-5 text-white" />
                </button>
                <h1 className="text-xl font-bold text-white">
                  Pickup Points Yönetimi
                </h1>
                <div className="flex items-center gap-2 text-gray-300">
                  <MapPin className="w-4 h-4" />
                  <span className="text-sm">{pickupPoints.length} nokta</span>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-gray-300">
                  <User className="w-4 h-4" />
                  <span className="text-sm hidden sm:block">{user?.email}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-3 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-sm hidden sm:block">Çıkış</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Map Section */}
            <div className="lg:col-span-8">
              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Navigation className="w-5 h-5" />
                    Kıbrıs Haritası
                  </h2>
                  <div className="flex items-center gap-2 text-sm text-gray-300">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                      <span>Aktif</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                      <span>Pasif</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <span>Seçili</span>
                    </div>
                  </div>
                </div>

                {(showAddForm || editingPoint) && (
                  <div className="mb-4 p-3 bg-yellow-600/20 border border-yellow-500/30 rounded-lg">
                    <p className="text-yellow-300 text-sm flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Haritaya tıklayarak pickup point konumunu seçin
                    </p>
                  </div>
                )}

                <MapComponent
                  pickupPoints={pickupPoints}
                  onMapClick={handleMapClick}
                  onMarkerClick={handleMarkerClick}
                  selectedPoint={selectedPoint}
                  editingPoint={editingPoint}
                />
              </div>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-4 space-y-4">
              {/* Controls */}
              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">
                    Kontroller
                  </h3>
                  <button
                    onClick={handleAddNew}
                    disabled={showAddForm || !!editingPoint}
                    className="flex items-center gap-2 px-3 py-2 bg-green-600/20 hover:bg-green-600/30 disabled:bg-gray-600/20 text-green-400 disabled:text-gray-400 rounded-lg transition-colors disabled:cursor-not-allowed"
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
                    className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Active Form */}
                {(showAddForm || editingPoint) && (
                  <div className="space-y-3 p-3 bg-white/5 border border-white/10 rounded-lg">
                    <h4 className="font-semibold text-white">
                      {editingPoint
                        ? "Pickup Point Düzenle"
                        : "Yeni Pickup Point"}
                    </h4>

                    <input
                      type="text"
                      placeholder="Nokta adı"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />

                    <input
                      type="text"
                      placeholder="Adres"
                      value={formData.address}
                      onChange={(e) =>
                        setFormData({ ...formData, address: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        step="0.000001"
                        placeholder="Enlem"
                        value={formData.latitude}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            latitude: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="number"
                        step="0.000001"
                        placeholder="Boylam"
                        value={formData.longitude}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            longitude: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />

                    <textarea
                      placeholder="Notlar (opsiyonel)"
                      value={formData.notes}
                      onChange={(e) =>
                        setFormData({ ...formData, notes: e.target.value })
                      }
                      rows={2}
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />

                    <label className="flex items-center gap-2 text-white">
                      <input
                        type="checkbox"
                        checked={formData.isActive}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            isActive: e.target.checked,
                          })
                        }
                        className="rounded"
                      />
                      Aktif
                    </label>

                    <div className="flex gap-2">
                      <button
                        onClick={handleSave}
                        disabled={!formData.name || !formData.address}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600/20 hover:bg-green-600/30 disabled:bg-gray-600/20 text-green-400 disabled:text-gray-400 rounded-lg transition-colors disabled:cursor-not-allowed"
                      >
                        <Save className="w-4 h-4" />
                        Kaydet
                      </button>
                      <button
                        onClick={handleCancel}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors"
                      >
                        <X className="w-4 h-4" />
                        İptal
                      </button>
                    </div>
                  </div>
                )}

                {/* Selected Point Info */}
                {selectedPoint && !showAddForm && !editingPoint && (
                  <div className="space-y-3 p-3 bg-white/5 border border-white/10 rounded-lg">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-white">
                        {selectedPoint.name}
                      </h4>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(selectedPoint)}
                          className="p-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(selectedPoint.id)}
                          className="p-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-gray-300">
                        <MapPin className="w-4 h-4" />
                        <span>{selectedPoint.address}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-300">
                        <User className="w-4 h-4" />
                        <span>{selectedPoint.contactPerson}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-300">
                        <Phone className="w-4 h-4" />
                        <span>{selectedPoint.contactPhone}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-300">
                        <Clock className="w-4 h-4" />
                        <span>{selectedPoint.operatingHours}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            selectedPoint.isActive
                              ? "bg-green-500"
                              : "bg-red-500"
                          }`}
                        ></div>
                        <span
                          className={`text-sm ${
                            selectedPoint.isActive
                              ? "text-green-400"
                              : "text-red-400"
                          }`}
                        >
                          {selectedPoint.isActive ? "Aktif" : "Pasif"}
                        </span>
                      </div>
                      {selectedPoint.notes && (
                        <div className="mt-2 p-2 bg-white/5 rounded text-gray-300 text-xs">
                          {selectedPoint.notes}
                        </div>
                      )}
                      <div className="text-xs text-gray-400 mt-2">
                        Koordinatlar: {selectedPoint.latitude.toFixed(6)},{" "}
                        {selectedPoint.longitude.toFixed(6)}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Pickup Points List */}
              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4">
                <h3 className="text-lg font-semibold text-white mb-4">
                  Pickup Points ({filteredPoints.length})
                </h3>

                {loading ? (
                  <div className="text-center text-gray-400 py-4">
                    Yükleniyor...
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {filteredPoints.map((point) => (
                      <div
                        key={point.id}
                        onClick={() => setSelectedPoint(point)}
                        className={`p-3 rounded-lg cursor-pointer transition-colors ${
                          selectedPoint?.id === point.id
                            ? "bg-blue-600/20 border border-blue-500/30"
                            : editingPoint?.id === point.id
                            ? "bg-yellow-600/20 border border-yellow-500/30"
                            : "bg-white/5 hover:bg-white/10"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium text-white text-sm">
                              {point.name}
                            </h4>
                            <p className="text-xs text-gray-300 truncate">
                              {point.address}
                            </p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-xs text-gray-400">
                                {point.contactPerson}
                              </span>
                              <div
                                className={`w-2 h-2 rounded-full ${
                                  point.isActive ? "bg-green-500" : "bg-red-500"
                                }`}
                              ></div>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(point);
                              }}
                              className="p-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(point.id);
                              }}
                              className="p-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
