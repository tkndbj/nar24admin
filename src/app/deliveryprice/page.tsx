"use client";

import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  ArrowLeft,
  Truck,
  Zap,
  Package,
  DollarSign,
  Save,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Info,
  History,
  Settings,
  Calculator,
  Gift,
  TrendingUp,
  Clock,
  Loader2,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useActivityLog, createPageLogger } from "@/hooks/useActivityLog";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useRouter } from "next/navigation";

interface DeliverySettings {
  normal: {
    enabled: boolean;
    price: number;
    freeThreshold: number;
    estimatedDays: string;
  };
  express: {
    enabled: boolean;
    price: number;
    freeThreshold: number;
    estimatedDays: string;
  };
  pickup: {
    enabled: boolean;
  };
  updatedAt?: Timestamp;
  updatedBy?: string;
}

interface ChangeLogEntry {
  id: string;
  changes: string;
  updatedBy: string;
  updatedAt: Timestamp;
  previousSettings: Partial<DeliverySettings>;
  newSettings: Partial<DeliverySettings>;
}

const DEFAULT_SETTINGS: DeliverySettings = {
  normal: {
    enabled: true,
    price: 50,
    freeThreshold: 2000,
    estimatedDays: "3-5",
  },
  express: {
    enabled: true,
    price: 100,
    freeThreshold: 10000,
    estimatedDays: "1-2",
  },
  pickup: {
    enabled: true,
  },
};

export default function DeliveryPricePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [settings, setSettings] = useState<DeliverySettings>(DEFAULT_SETTINGS);
  const [originalSettings, setOriginalSettings] =
    useState<DeliverySettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [changeLog, setChangeLog] = useState<ChangeLogEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [simulationAmount, setSimulationAmount] = useState<number>(1500);

  // Initialize activity logging
  const { logActivity } = useActivityLog();
  const logger = createPageLogger(logActivity, "DeliveryPrice");

  // Fetch current settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, "settings", "delivery");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data() as DeliverySettings;
          setSettings(data);
          setOriginalSettings(data);
        } else {
          // Initialize with defaults if no settings exist
          await setDoc(docRef, {
            ...DEFAULT_SETTINGS,
            updatedAt: serverTimestamp(),
            updatedBy: user?.email || "system",
          });
          setSettings(DEFAULT_SETTINGS);
          setOriginalSettings(DEFAULT_SETTINGS);
        }
      } catch (error) {
        console.error("Error fetching delivery settings:", error);
        setSaveError("Ayarlar yüklenirken hata oluştu");
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchSettings();
    }
  }, [user]);

  // Fetch change history
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "settings", "delivery", "history"),
      orderBy("updatedAt", "desc"),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as ChangeLogEntry[];
      setChangeLog(logs);
    });

    return () => unsubscribe();
  }, [user]);

  // Check if settings have changed
  const hasChanges = useCallback(() => {
    return JSON.stringify(settings) !== JSON.stringify(originalSettings);
  }, [settings, originalSettings]);

  // Save settings
  const handleSave = async () => {
    if (!hasChanges()) return;

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const docRef = doc(db, "settings", "delivery");

      // Save to history first
      await addDoc(collection(db, "settings", "delivery", "history"), {
        previousSettings: originalSettings,
        newSettings: settings,
        changes: generateChangeDescription(originalSettings, settings),
        updatedBy: user?.email || "unknown",
        updatedAt: serverTimestamp(),
      });

      // Update main settings
      await setDoc(docRef, {
        ...settings,
        updatedAt: serverTimestamp(),
        updatedBy: user?.email || "unknown",
      });

      setOriginalSettings(settings);
      setSaveSuccess(true);
      logger.action("Delivery settings updated", { settings });

      // Hide success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error("Error saving delivery settings:", error);
      setSaveError("Ayarlar kaydedilirken hata oluştu");
    } finally {
      setSaving(false);
    }
  };

  // Reset to original settings
  const handleReset = () => {
    setSettings(originalSettings);
    logger.action("Reset delivery settings to original");
  };

  // Generate change description
  const generateChangeDescription = (
    oldSettings: DeliverySettings,
    newSettings: DeliverySettings
  ): string => {
    const changes: string[] = [];

    if (oldSettings.normal.price !== newSettings.normal.price) {
      changes.push(
        `Normal kargo: ${oldSettings.normal.price} TL → ${newSettings.normal.price} TL`
      );
    }
    if (oldSettings.normal.freeThreshold !== newSettings.normal.freeThreshold) {
      changes.push(
        `Normal ücretsiz eşik: ${oldSettings.normal.freeThreshold} TL → ${newSettings.normal.freeThreshold} TL`
      );
    }
    if (oldSettings.express.price !== newSettings.express.price) {
      changes.push(
        `Express kargo: ${oldSettings.express.price} TL → ${newSettings.express.price} TL`
      );
    }
    if (
      oldSettings.express.freeThreshold !== newSettings.express.freeThreshold
    ) {
      changes.push(
        `Express ücretsiz eşik: ${oldSettings.express.freeThreshold} TL → ${newSettings.express.freeThreshold} TL`
      );
    }
    if (oldSettings.normal.enabled !== newSettings.normal.enabled) {
      changes.push(
        `Normal kargo: ${newSettings.normal.enabled ? "Aktif" : "Pasif"}`
      );
    }
    if (oldSettings.express.enabled !== newSettings.express.enabled) {
      changes.push(
        `Express kargo: ${newSettings.express.enabled ? "Aktif" : "Pasif"}`
      );
    }
    if (oldSettings.pickup.enabled !== newSettings.pickup.enabled) {
      changes.push(`Gel-Al: ${newSettings.pickup.enabled ? "Aktif" : "Pasif"}`);
    }

    return changes.join(", ") || "Değişiklik yapılmadı";
  };

  // Calculate delivery price for simulation
  const calculateDeliveryPrice = (
    amount: number,
    type: "normal" | "express"
  ): { price: number; isFree: boolean } => {
    const option = settings[type];
    if (!option.enabled) return { price: 0, isFree: false };

    if (amount >= option.freeThreshold) {
      return { price: 0, isFree: true };
    }
    return { price: option.price, isFree: false };
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            <p className="text-gray-600">Yükleniyor...</p>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50 shadow-sm">
          <div className="max-w-[1400px] mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.push("/")}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-gray-600" />
                </button>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
                    <Truck className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-gray-900">
                      Kargo Fiyatlandırma
                    </h1>
                    <p className="text-xs text-gray-500">
                      Teslimat seçenekleri ve fiyatlarını yönetin
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {hasChanges() && (
                  <button
                    onClick={handleReset}
                    className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span className="text-sm font-medium">Sıfırla</span>
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={!hasChanges() || saving}
                  className={`flex items-center gap-2 px-5 py-2 rounded-lg transition-all shadow-sm ${
                    hasChanges()
                      ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span className="text-sm font-medium">
                    {saving ? "Kaydediliyor..." : "Kaydet"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Success/Error Messages */}
        {saveSuccess && (
          <div className="max-w-[1400px] mx-auto px-6 pt-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              <p className="text-emerald-800 font-medium">
                Ayarlar başarıyla kaydedildi!
              </p>
            </div>
          </div>
        )}

        {saveError && (
          <div className="max-w-[1400px] mx-auto px-6 pt-4">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <p className="text-red-800 font-medium">{saveError}</p>
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="max-w-[1400px] mx-auto px-6 py-6">
          <div className="grid grid-cols-3 gap-6">
            {/* Left Column - Delivery Options */}
            <div className="col-span-2 space-y-6">
              {/* Normal Delivery Card */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                        <Package className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-white">
                          Normal Teslimat
                        </h2>
                        <p className="text-blue-100 text-sm">
                          Standart kargo seçeneği
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.normal.enabled}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            normal: {
                              ...settings.normal,
                              enabled: e.target.checked,
                            },
                          })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-14 h-7 bg-white/30 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-white/50"></div>
                      <span className="ml-3 text-sm font-medium text-white">
                        {settings.normal.enabled ? "Aktif" : "Pasif"}
                      </span>
                    </label>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    {/* Price Input */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-gray-400" />
                          Kargo Ücreti
                        </div>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={settings.normal.price}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              normal: {
                                ...settings.normal,
                                price: parseFloat(e.target.value) || 0,
                              },
                            })
                          }
                          disabled={!settings.normal.enabled}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed text-lg font-semibold"
                          min="0"
                          step="0.01"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">
                          TL
                        </span>
                      </div>
                    </div>

                    {/* Free Threshold Input */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <div className="flex items-center gap-2">
                          <Gift className="w-4 h-4 text-gray-400" />
                          Ücretsiz Kargo Eşiği
                        </div>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={settings.normal.freeThreshold}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              normal: {
                                ...settings.normal,
                                freeThreshold: parseFloat(e.target.value) || 0,
                              },
                            })
                          }
                          disabled={!settings.normal.enabled}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed text-lg font-semibold"
                          min="0"
                          step="100"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">
                          TL
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Estimated Days */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-400" />
                        Tahmini Teslimat Süresi
                      </div>
                    </label>
                    <input
                      type="text"
                      value={settings.normal.estimatedDays}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          normal: {
                            ...settings.normal,
                            estimatedDays: e.target.value,
                          },
                        })
                      }
                      disabled={!settings.normal.enabled}
                      placeholder="örn: 3-5"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Kullanıcılara gösterilecek tahmini gün sayısı (örn: 3-5
                      gün)
                    </p>
                  </div>

                  {/* Info Box */}
                  <div className="bg-blue-50 rounded-xl p-4 flex items-start gap-3">
                    <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-800">
                      <p className="font-medium mb-1">Nasıl Çalışır?</p>
                      <p>
                        Sepet tutarı{" "}
                        <span className="font-semibold">
                          {settings.normal.freeThreshold.toLocaleString(
                            "tr-TR"
                          )}{" "}
                          TL
                        </span>{" "}
                        ve üzerinde olduğunda kargo ücretsiz olur. Aksi halde{" "}
                        <span className="font-semibold">
                          {settings.normal.price.toLocaleString("tr-TR")} TL
                        </span>{" "}
                        kargo ücreti uygulanır.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Express Delivery Card */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                        <Zap className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-white">
                          Hızlı Teslimat
                        </h2>
                        <p className="text-amber-100 text-sm">
                          Express kargo seçeneği
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.express.enabled}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            express: {
                              ...settings.express,
                              enabled: e.target.checked,
                            },
                          })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-14 h-7 bg-white/30 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-white/50"></div>
                      <span className="ml-3 text-sm font-medium text-white">
                        {settings.express.enabled ? "Aktif" : "Pasif"}
                      </span>
                    </label>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    {/* Price Input */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-gray-400" />
                          Kargo Ücreti
                        </div>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={settings.express.price}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              express: {
                                ...settings.express,
                                price: parseFloat(e.target.value) || 0,
                              },
                            })
                          }
                          disabled={!settings.express.enabled}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed text-lg font-semibold"
                          min="0"
                          step="0.01"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">
                          TL
                        </span>
                      </div>
                    </div>

                    {/* Free Threshold Input */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <div className="flex items-center gap-2">
                          <Gift className="w-4 h-4 text-gray-400" />
                          Ücretsiz Kargo Eşiği
                        </div>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={settings.express.freeThreshold}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              express: {
                                ...settings.express,
                                freeThreshold: parseFloat(e.target.value) || 0,
                              },
                            })
                          }
                          disabled={!settings.express.enabled}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed text-lg font-semibold"
                          min="0"
                          step="100"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">
                          TL
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Estimated Days */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-400" />
                        Tahmini Teslimat Süresi
                      </div>
                    </label>
                    <input
                      type="text"
                      value={settings.express.estimatedDays}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          express: {
                            ...settings.express,
                            estimatedDays: e.target.value,
                          },
                        })
                      }
                      disabled={!settings.express.enabled}
                      placeholder="örn: 1-2"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Kullanıcılara gösterilecek tahmini gün sayısı (örn: 1-2
                      gün)
                    </p>
                  </div>

                  {/* Info Box */}
                  <div className="bg-amber-50 rounded-xl p-4 flex items-start gap-3">
                    <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-800">
                      <p className="font-medium mb-1">Nasıl Çalışır?</p>
                      <p>
                        Sepet tutarı{" "}
                        <span className="font-semibold">
                          {settings.express.freeThreshold.toLocaleString(
                            "tr-TR"
                          )}{" "}
                          TL
                        </span>{" "}
                        ve üzerinde olduğunda express kargo ücretsiz olur. Aksi
                        halde{" "}
                        <span className="font-semibold">
                          {settings.express.price.toLocaleString("tr-TR")} TL
                        </span>{" "}
                        kargo ücreti uygulanır.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pickup Option Card */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                        <Settings className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-white">
                          Gel-Al Seçeneği
                        </h2>
                        <p className="text-emerald-100 text-sm">
                          Mağazadan teslim alma
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.pickup.enabled}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            pickup: { enabled: e.target.checked },
                          })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-14 h-7 bg-white/30 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-white/50"></div>
                      <span className="ml-3 text-sm font-medium text-white">
                        {settings.pickup.enabled ? "Aktif" : "Pasif"}
                      </span>
                    </label>
                  </div>
                </div>

                <div className="p-6">
                  <div className="bg-emerald-50 rounded-xl p-4 flex items-start gap-3">
                    <Info className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-emerald-800">
                      <p className="font-medium mb-1">Gel-Al Seçeneği</p>
                      <p>
                        Kullanıcılar siparişlerini belirlenen noktalardan
                        ücretsiz olarak teslim alabilir. Bu seçenek aktif
                        olduğunda ödeme ekranında görüntülenir.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Simulation & History */}
            <div className="space-y-6">
              {/* Price Simulation Card */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <Calculator className="w-5 h-5 text-indigo-600" />
                    <h3 className="font-semibold text-gray-900">
                      Fiyat Simülasyonu
                    </h3>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Farklı sepet tutarları için kargo ücretlerini test edin
                  </p>
                </div>

                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Sepet Tutarı
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={simulationAmount}
                        onChange={(e) =>
                          setSimulationAmount(parseFloat(e.target.value) || 0)
                        }
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-lg font-semibold"
                        min="0"
                        step="100"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">
                        TL
                      </span>
                    </div>
                  </div>

                  {/* Quick Amount Buttons */}
                  <div className="flex flex-wrap gap-2">
                    {[500, 1000, 1500, 2000, 5000, 10000].map((amount) => (
                      <button
                        key={amount}
                        onClick={() => setSimulationAmount(amount)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          simulationAmount === amount
                            ? "bg-indigo-100 text-indigo-700"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {amount.toLocaleString("tr-TR")} TL
                      </button>
                    ))}
                  </div>

                  {/* Results */}
                  <div className="space-y-3 pt-4 border-t border-gray-100">
                    {/* Normal Delivery Result */}
                    {settings.normal.enabled && (
                      <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-blue-600" />
                          <span className="text-sm font-medium text-gray-700">
                            Normal
                          </span>
                        </div>
                        <div className="text-right">
                          {calculateDeliveryPrice(simulationAmount, "normal")
                            .isFree ? (
                            <span className="text-sm font-bold text-emerald-600">
                              ÜCRETSİZ
                            </span>
                          ) : (
                            <span className="text-sm font-bold text-gray-900">
                              {calculateDeliveryPrice(
                                simulationAmount,
                                "normal"
                              ).price.toLocaleString("tr-TR")}{" "}
                              TL
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Express Delivery Result */}
                    {settings.express.enabled && (
                      <div className="flex items-center justify-between p-3 bg-amber-50 rounded-xl">
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-amber-600" />
                          <span className="text-sm font-medium text-gray-700">
                            Express
                          </span>
                        </div>
                        <div className="text-right">
                          {calculateDeliveryPrice(simulationAmount, "express")
                            .isFree ? (
                            <span className="text-sm font-bold text-emerald-600">
                              ÜCRETSİZ
                            </span>
                          ) : (
                            <span className="text-sm font-bold text-gray-900">
                              {calculateDeliveryPrice(
                                simulationAmount,
                                "express"
                              ).price.toLocaleString("tr-TR")}{" "}
                              TL
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Pickup Result */}
                    {settings.pickup.enabled && (
                      <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl">
                        <div className="flex items-center gap-2">
                          <Settings className="w-4 h-4 text-emerald-600" />
                          <span className="text-sm font-medium text-gray-700">
                            Gel-Al
                          </span>
                        </div>
                        <span className="text-sm font-bold text-emerald-600">
                          ÜCRETSİZ
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Free Shipping Progress */}
                  {settings.normal.enabled &&
                    simulationAmount < settings.normal.freeThreshold && (
                      <div className="pt-4 border-t border-gray-100">
                        <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
                          <span>Ücretsiz kargoya</span>
                          <span className="font-medium">
                            {(
                              settings.normal.freeThreshold - simulationAmount
                            ).toLocaleString("tr-TR")}{" "}
                            TL kaldı
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.min(
                                (simulationAmount /
                                  settings.normal.freeThreshold) *
                                  100,
                                100
                              )}%`,
                            }}
                          ></div>
                        </div>
                      </div>
                    )}
                </div>
              </div>

              {/* Current Settings Summary */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-purple-600" />
                    <h3 className="font-semibold text-gray-900">Özet</h3>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-4 bg-blue-50 rounded-xl">
                      <p className="text-xs text-gray-600 mb-1">Normal Kargo</p>
                      <p className="text-xl font-bold text-blue-600">
                        {settings.normal.price} TL
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {settings.normal.freeThreshold.toLocaleString("tr-TR")}{" "}
                        TL üzeri ücretsiz
                      </p>
                    </div>
                    <div className="text-center p-4 bg-amber-50 rounded-xl">
                      <p className="text-xs text-gray-600 mb-1">
                        Express Kargo
                      </p>
                      <p className="text-xl font-bold text-amber-600">
                        {settings.express.price} TL
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {settings.express.freeThreshold.toLocaleString("tr-TR")}{" "}
                        TL üzeri ücretsiz
                      </p>
                    </div>
                  </div>

                  {/* Active Options */}
                  <div className="flex flex-wrap gap-2">
                    {settings.normal.enabled && (
                      <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                        Normal Aktif
                      </span>
                    )}
                    {settings.express.enabled && (
                      <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                        Express Aktif
                      </span>
                    )}
                    {settings.pickup.enabled && (
                      <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                        Gel-Al Aktif
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Change History */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="w-full px-6 py-4 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <History className="w-5 h-5 text-gray-600" />
                    <h3 className="font-semibold text-gray-900">
                      Değişiklik Geçmişi
                    </h3>
                  </div>
                  <span className="text-gray-400">
                    {showHistory ? "▲" : "▼"}
                  </span>
                </button>

                {showHistory && (
                  <div className="p-4 max-h-80 overflow-y-auto">
                    {changeLog.length === 0 ? (
                      <p className="text-center text-gray-500 text-sm py-4">
                        Henüz değişiklik yok
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {changeLog.map((log) => (
                          <div
                            key={log.id}
                            className="p-3 bg-gray-50 rounded-xl text-sm"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-gray-500">
                                {log.updatedAt
                                  ?.toDate()
                                  .toLocaleString("tr-TR")}
                              </span>
                              <span className="text-xs font-medium text-gray-600">
                                {log.updatedBy}
                              </span>
                            </div>
                            <p className="text-gray-700">{log.changes}</p>
                          </div>
                        ))}
                      </div>
                    )}
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
