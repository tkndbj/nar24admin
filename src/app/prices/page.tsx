"use client";

import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  ArrowLeft,
  Save,
  RefreshCw,
  Image,
  Layout,
  BarChart3,
  AlertCircle,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useActivityLog, createPageLogger } from "@/hooks/useActivityLog";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useRouter } from "next/navigation";

// Type definitions
interface AdTypePrices {
  oneWeek: number;
  twoWeeks: number;
  oneMonth: number;
}

interface AdPrices {
  topBanner: AdTypePrices;
  thinBanner: AdTypePrices;
  marketBanner: AdTypePrices;
  updatedAt?: Date;
  updatedBy?: string;
}

// Default prices (fallback)
const DEFAULT_PRICES: AdPrices = {
  topBanner: {
    oneWeek: 4000,
    twoWeeks: 7500,
    oneMonth: 14000,
  },
  thinBanner: {
    oneWeek: 2000,
    twoWeeks: 3500,
    oneMonth: 6500,
  },
  marketBanner: {
    oneWeek: 2500,
    twoWeeks: 4500,
    oneMonth: 8500,
  },
};

// Ad type configuration for UI
const AD_TYPES = [
  {
    key: "topBanner" as const,
    label: "Büyük Banner",
    description: "Ana sayfada en üstte görünen büyük carousel banner",
    icon: Image,
    color: "blue",
    bgClass: "bg-blue-100",
    textClass: "text-blue-600",
    borderClass: "border-blue-200",
    inputBgClass: "bg-blue-50",
  },
  {
    key: "thinBanner" as const,
    label: "İnce Banner",
    description: "Ürün listesi arasında görünen yatay ince banner",
    icon: Layout,
    color: "orange",
    bgClass: "bg-orange-100",
    textClass: "text-orange-600",
    borderClass: "border-orange-200",
    inputBgClass: "bg-orange-50",
  },
  {
    key: "marketBanner" as const,
    label: "Market Banner",
    description: "Market ekranında görünen standart reklam banner",
    icon: BarChart3,
    color: "purple",
    bgClass: "bg-purple-100",
    textClass: "text-purple-600",
    borderClass: "border-purple-200",
    inputBgClass: "bg-purple-50",
  },
];

const DURATION_LABELS = {
  oneWeek: "1 Hafta",
  twoWeeks: "2 Hafta",
  oneMonth: "1 Ay",
};

export default function AdPricesPage() {
  const { user } = useAuth();
  const router = useRouter();

  // State
  const [prices, setPrices] = useState<AdPrices>(DEFAULT_PRICES);
  const [originalPrices, setOriginalPrices] = useState<AdPrices>(DEFAULT_PRICES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [serviceEnabled, setServiceEnabled] = useState(true);
const [togglingService, setTogglingService] = useState(false);

  // Activity logging
  const { logActivity } = useActivityLog();
  const logger = createPageLogger(logActivity, "Ad Prices");

  // Fetch prices from Firestore
  const fetchPrices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const docRef = doc(db, "app_config", "ad_prices");
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data() as AdPrices & { serviceEnabled?: boolean };
        setPrices(data);
        setOriginalPrices(data);
        setServiceEnabled(data.serviceEnabled !== false); // Default to true
        logger.action("Loaded ad prices");
      } else {
        // Document doesn't exist, use defaults and create it
        setPrices(DEFAULT_PRICES);
        setOriginalPrices(DEFAULT_PRICES);
        logger.action("Using default ad prices");
      }
    } catch (err) {
      console.error("Error fetching ad prices:", err);
      setError("Fiyatlar yüklenirken hata oluştu. Lütfen sayfayı yenileyin.");
      logger.action("Error loading ad prices", { error: String(err) });
    } finally {
      setLoading(false);
    }
  }, [logger]);

  // Initial fetch
  useEffect(() => {
    if (user) {
      fetchPrices();
    }
  }, [user, fetchPrices]);

  // Check for changes
  useEffect(() => {
    const changed = JSON.stringify(prices) !== JSON.stringify(originalPrices);
    setHasChanges(changed);
  }, [prices, originalPrices]);

  // Handle price change
  const handlePriceChange = (
    adType: keyof AdPrices,
    duration: keyof AdTypePrices,
    value: string
  ) => {
    const numValue = parseInt(value) || 0;
    setPrices((prev) => ({
      ...prev,
      [adType]: {
        ...(prev[adType] as AdTypePrices),
        [duration]: numValue,
      },
    }));
    setSuccess(null);
  };

  // Save prices to Firestore
  const handleSave = async () => {
    if (!hasChanges) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const docRef = doc(db, "app_config", "ad_prices");
      await setDoc(docRef, {
        ...prices,
        updatedAt: serverTimestamp(),
        updatedBy: user?.email || "unknown",
      });

      setOriginalPrices(prices);
      setSuccess("Fiyatlar başarıyla kaydedildi!");
      logger.action("Saved ad prices", { prices });

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error("Error saving ad prices:", err);
      setError("Fiyatlar kaydedilirken hata oluştu. Lütfen tekrar deneyin.");
      logger.action("Error saving ad prices", { error: String(err) });
    } finally {
      setSaving(false);
    }
  };

  // Toggle service status
const handleToggleService = async () => {
    try {
      setTogglingService(true);
      const newStatus = !serviceEnabled;
      
      const docRef = doc(db, "app_config", "ad_prices");
      await setDoc(docRef, {
        ...prices,
        serviceEnabled: newStatus,
        updatedAt: serverTimestamp(),
        updatedBy: user?.email || "unknown",
      }, { merge: true });
      
      setServiceEnabled(newStatus);
      logger.action(newStatus ? "Enabled ad service" : "Disabled ad service");
    } catch (err) {
      console.error("Error toggling service:", err);
      setError("Servis durumu değiştirilemedi.");
    } finally {
      setTogglingService(false);
    }
  };

  // Reset to original values
  const handleReset = () => {
    setPrices(originalPrices);
    setSuccess(null);
    setError(null);
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50 shadow-sm">
          <div className="max-w-[1200px] mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.push("/")}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-gray-600" />
                </button>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">
                    Reklam Fiyatları
                  </h1>
                  <p className="text-sm text-gray-500">
                    Banner reklam fiyatlarını yönetin
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {hasChanges && (
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
                  disabled={!hasChanges || saving}
                  className={`flex items-center gap-2 px-5 py-2 rounded-lg transition-all ${
                    hasChanges && !saving
                      ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:shadow-lg"
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

        {/* Main Content */}
        <main className="max-w-[1200px] mx-auto px-6 py-8">
          {/* Status Messages */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              <p className="text-sm text-green-700">{success}</p>
            </div>
          )}

          {/* Loading State */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <p className="text-gray-500">Fiyatlar yükleniyor...</p>
              </div>
            </div>
          ) : (
            <>
              {/* Info Card */}
              <div className="mb-8 p-5 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-100 rounded-xl">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">
                      Fiyat Güncellemeleri
                    </h3>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      Burada belirlediğiniz fiyatlar, mobil uygulamada anlık
                      olarak gösterilecektir. Değişiklikler kaydedildiğinde tüm
                      kullanıcılar yeni fiyatları görecektir. Fiyatlar TL (Türk
                      Lirası) cinsinden girilmelidir.
                    </p>
                  </div>
                </div>
              </div>

              {/* Service Toggle Card */}
<div className="mb-8 p-5 bg-white border border-gray-200 rounded-xl shadow-sm">
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${serviceEnabled ? 'bg-green-100' : 'bg-red-100'}`}>
        {serviceEnabled ? (
          <CheckCircle className="w-6 h-6 text-green-600" />
        ) : (
          <AlertCircle className="w-6 h-6 text-red-600" />
        )}
      </div>
      <div>
        <h3 className="font-semibold text-gray-900">Reklam Servisi</h3>
        <p className="text-sm text-gray-500">
          {serviceEnabled 
            ? "Servis aktif - Kullanıcılar reklam başvurusu yapabilir" 
            : "Servis kapalı - Yeni başvurular engellenmiş"}
        </p>
      </div>
    </div>
    <button
      onClick={handleToggleService}
      disabled={togglingService}
      className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${
        serviceEnabled ? 'bg-green-500' : 'bg-gray-300'
      } ${togglingService ? 'opacity-50' : ''}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
          serviceEnabled ? 'translate-x-8' : 'translate-x-1'
        }`}
      />
    </button>
  </div>
</div>

              {/* Price Cards Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {AD_TYPES.map((adType) => {
                  const Icon = adType.icon;
                  const adPrices = prices[adType.key] as AdTypePrices;

                  return (
                    <div
                      key={adType.key}
                      className={`bg-white rounded-2xl border-2 ${adType.borderClass} shadow-sm hover:shadow-md transition-shadow overflow-hidden`}
                    >
                      {/* Card Header */}
                      <div className={`p-5 ${adType.inputBgClass}`}>
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-12 h-12 ${adType.bgClass} rounded-xl flex items-center justify-center`}
                          >
                            <Icon className={`w-6 h-6 ${adType.textClass}`} />
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-900">
                              {adType.label}
                            </h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {adType.description}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Price Inputs */}
                      <div className="p-5 space-y-4">
                        {(
                          Object.keys(DURATION_LABELS) as Array<
                            keyof typeof DURATION_LABELS
                          >
                        ).map((duration) => (
                          <div key={duration}>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              {DURATION_LABELS[duration]}
                            </label>
                            <div className="relative">
                              <input
                                type="number"
                                min="0"
                                step="100"
                                value={adPrices[duration]}
                                onChange={(e) =>
                                  handlePriceChange(
                                    adType.key,
                                    duration,
                                    e.target.value
                                  )
                                }
                                className={`w-full px-4 py-3 ${adType.inputBgClass} border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-${adType.color}-500 focus:border-transparent text-lg font-semibold text-gray-900 pr-12`}
                              />
                              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">
                                TL
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Card Footer - Price Summary */}
                      <div className="px-5 pb-5">
                        <div
                          className={`p-3 ${adType.inputBgClass} rounded-xl`}
                        >
                          <p className="text-xs text-gray-500 mb-2">
                            Toplam Fiyat Aralığı
                          </p>
                          <p className={`text-lg font-bold ${adType.textClass}`}>
                            {Math.min(
                              adPrices.oneWeek,
                              adPrices.twoWeeks,
                              adPrices.oneMonth
                            ).toLocaleString("tr-TR")}{" "}
                            -{" "}
                            {Math.max(
                              adPrices.oneWeek,
                              adPrices.twoWeeks,
                              adPrices.oneMonth
                            ).toLocaleString("tr-TR")}{" "}
                            TL
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Unsaved Changes Warning */}
              {hasChanges && (
                <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-500" />
                    <p className="text-sm text-amber-700">
                      Kaydedilmemiş değişiklikler var. Sayfadan ayrılmadan önce
                      kaydetmeyi unutmayın.
                    </p>
                  </div>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Şimdi Kaydet
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}