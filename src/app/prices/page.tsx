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
  Rocket,
  Clock,
  Package,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useActivityLog, createPageLogger } from "@/hooks/useActivityLog";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useRouter } from "next/navigation";

// ==================== TYPE DEFINITIONS ====================

interface AdTypePrices {
  oneWeek: number;
  twoWeeks: number;
  oneMonth: number;
}

interface AdPrices {
  topBanner: AdTypePrices;
  thinBanner: AdTypePrices;
  marketBanner: AdTypePrices;
  serviceEnabled: boolean;
  updatedAt?: Date;
  updatedBy?: string;
}

interface BoostPrices {
  pricePerProductPerMinute: number;
  minDuration: number;
  maxDuration: number;
  maxProducts: number;
  serviceEnabled: boolean;
  updatedAt?: Date;
  updatedBy?: string;
}

// ==================== DEFAULT VALUES ====================

const DEFAULT_AD_PRICES: AdPrices = {
  topBanner: { oneWeek: 4000, twoWeeks: 7500, oneMonth: 14000 },
  thinBanner: { oneWeek: 2000, twoWeeks: 3500, oneMonth: 6500 },
  marketBanner: { oneWeek: 2500, twoWeeks: 4500, oneMonth: 8500 },
  serviceEnabled: true,
};

const DEFAULT_BOOST_PRICES: BoostPrices = {
  pricePerProductPerMinute: 1.0,
  minDuration: 5,
  maxDuration: 35,
  maxProducts: 5,
  serviceEnabled: true,
};

// ==================== UI CONFIGURATION ====================

const AD_TYPES = [
  {
    key: "topBanner" as const,
    label: "Büyük Banner",
    description: "Ana sayfada en üstte görünen büyük carousel banner",
    icon: Image,
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

// ==================== MAIN COMPONENT ====================

export default function PricingPage() {
  const { user } = useAuth();
  const router = useRouter();

  // Ad Prices State
  const [adPrices, setAdPrices] = useState<AdPrices>(DEFAULT_AD_PRICES);
  const [originalAdPrices, setOriginalAdPrices] =
    useState<AdPrices>(DEFAULT_AD_PRICES);

  // Boost Prices State
  const [boostPrices, setBoostPrices] =
    useState<BoostPrices>(DEFAULT_BOOST_PRICES);
  const [originalBoostPrices, setOriginalBoostPrices] =
    useState<BoostPrices>(DEFAULT_BOOST_PRICES);

  // UI State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"ads" | "boost">("ads");

  // Toggling states
  const [togglingAdService, setTogglingAdService] = useState(false);
  const [togglingBoostService, setTogglingBoostService] = useState(false);

  // Activity logging
  const { logActivity } = useActivityLog();
  const loggerRef = useRef(createPageLogger(logActivity, "Pricing"));
  const hasFetched = useRef(false);

  // ==================== COMPUTED VALUES ====================

  const hasAdChanges =
    JSON.stringify(adPrices) !== JSON.stringify(originalAdPrices);
  const hasBoostChanges =
    JSON.stringify(boostPrices) !== JSON.stringify(originalBoostPrices);
  const hasChanges = hasAdChanges || hasBoostChanges;

  // Example boost prices
  const exampleBoostPrices = [
    {
      products: 1,
      duration: 5,
      price: boostPrices.pricePerProductPerMinute * 1 * 5,
    },
    {
      products: 3,
      duration: 15,
      price: boostPrices.pricePerProductPerMinute * 3 * 15,
    },
    {
      products: 5,
      duration: 35,
      price: boostPrices.pricePerProductPerMinute * 5 * 35,
    },
  ];

  // ==================== DATA FETCHING ====================

  useEffect(() => {
    if (!user || hasFetched.current) return;

    const fetchAllPrices = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch both documents in parallel
        const [adDocSnap, boostDocSnap] = await Promise.all([
          getDoc(doc(db, "app_config", "ad_prices")),
          getDoc(doc(db, "app_config", "boost_prices")),
        ]);

        // Process ad prices
        if (adDocSnap.exists()) {
          const data = adDocSnap.data() as AdPrices;
          setAdPrices(data);
          setOriginalAdPrices(data);
        }

        // Process boost prices
        if (boostDocSnap.exists()) {
          const data = boostDocSnap.data() as BoostPrices;
          setBoostPrices(data);
          setOriginalBoostPrices(data);
        }

        loggerRef.current.action("Loaded pricing data");
        hasFetched.current = true;
      } catch (err) {
        console.error("Error fetching prices:", err);
        setError("Fiyatlar yüklenirken hata oluştu. Lütfen sayfayı yenileyin.");
        loggerRef.current.action("Error loading prices", {
          error: String(err),
        });
      } finally {
        setLoading(false);
      }
    };

    fetchAllPrices();
  }, [user]);

  // ==================== HANDLERS ====================

  const handleAdPriceChange = (
    adType: keyof Omit<AdPrices, "serviceEnabled" | "updatedAt" | "updatedBy">,
    duration: keyof AdTypePrices,
    value: string
  ) => {
    const numValue = parseInt(value) || 0;
    setAdPrices((prev) => ({
      ...prev,
      [adType]: {
        ...(prev[adType] as AdTypePrices),
        [duration]: numValue,
      },
    }));
    setSuccess(null);
  };

  const handleBoostPriceChange = (
    field: keyof Omit<
      BoostPrices,
      "serviceEnabled" | "updatedAt" | "updatedBy"
    >,
    value: string
  ) => {
    const numValue =
      field === "pricePerProductPerMinute"
        ? parseFloat(value) || 0
        : parseInt(value) || 0;
    setBoostPrices((prev) => ({
      ...prev,
      [field]: numValue,
    }));
    setSuccess(null);
  };

  const handleSave = async () => {
    if (!hasChanges) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const savePromises = [];

      // Save ad prices if changed
      if (hasAdChanges) {
        savePromises.push(
          setDoc(doc(db, "app_config", "ad_prices"), {
            ...adPrices,
            updatedAt: serverTimestamp(),
            updatedBy: user?.email || "unknown",
          })
        );
      }

      // Save boost prices if changed
      if (hasBoostChanges) {
        savePromises.push(
          setDoc(doc(db, "app_config", "boost_prices"), {
            ...boostPrices,
            updatedAt: serverTimestamp(),
            updatedBy: user?.email || "unknown",
          })
        );
      }

      await Promise.all(savePromises);

      // Update original values
      if (hasAdChanges) setOriginalAdPrices(adPrices);
      if (hasBoostChanges) setOriginalBoostPrices(boostPrices);

      setSuccess("Tüm fiyatlar başarıyla kaydedildi!");
      loggerRef.current.action("Saved pricing data", { adPrices, boostPrices });

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error("Error saving prices:", err);
      setError("Fiyatlar kaydedilirken hata oluştu. Lütfen tekrar deneyin.");
      loggerRef.current.action("Error saving prices", { error: String(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAdService = async () => {
    try {
      setTogglingAdService(true);
      const newStatus = !adPrices.serviceEnabled;

      await setDoc(
        doc(db, "app_config", "ad_prices"),
        {
          serviceEnabled: newStatus,
          updatedAt: serverTimestamp(),
          updatedBy: user?.email || "unknown",
        },
        { merge: true }
      );

      setAdPrices((prev) => ({ ...prev, serviceEnabled: newStatus }));
      setOriginalAdPrices((prev) => ({ ...prev, serviceEnabled: newStatus }));
      loggerRef.current.action(
        newStatus ? "Enabled ad service" : "Disabled ad service"
      );
    } catch (err) {
      console.error("Error toggling ad service:", err);
      setError("Reklam servisi durumu değiştirilemedi.");
    } finally {
      setTogglingAdService(false);
    }
  };

  const handleToggleBoostService = async () => {
    try {
      setTogglingBoostService(true);
      const newStatus = !boostPrices.serviceEnabled;

      await setDoc(
        doc(db, "app_config", "boost_prices"),
        {
          serviceEnabled: newStatus,
          updatedAt: serverTimestamp(),
          updatedBy: user?.email || "unknown",
        },
        { merge: true }
      );

      setBoostPrices((prev) => ({ ...prev, serviceEnabled: newStatus }));
      setOriginalBoostPrices((prev) => ({
        ...prev,
        serviceEnabled: newStatus,
      }));
      loggerRef.current.action(
        newStatus ? "Enabled boost service" : "Disabled boost service"
      );
    } catch (err) {
      console.error("Error toggling boost service:", err);
      setError("Boost servisi durumu değiştirilemedi.");
    } finally {
      setTogglingBoostService(false);
    }
  };

  const handleReset = () => {
    setAdPrices(originalAdPrices);
    setBoostPrices(originalBoostPrices);
    setSuccess(null);
    setError(null);
  };

  // ==================== RENDER HELPERS ====================

  const renderServiceToggle = (
    enabled: boolean,
    toggling: boolean,
    onToggle: () => void,
    title: string,
    activeText: string,
    inactiveText: string,
    colorClass: string
  ) => (
    <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              enabled ? "bg-green-100" : "bg-red-100"
            }`}
          >
            {enabled ? (
              <CheckCircle className="w-6 h-6 text-green-600" />
            ) : (
              <AlertCircle className="w-6 h-6 text-red-600" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500">
              {enabled ? activeText : inactiveText}
            </p>
          </div>
        </div>
        <button
          onClick={onToggle}
          disabled={toggling}
          className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${
            enabled ? colorClass : "bg-gray-300"
          } ${toggling ? "opacity-50" : ""}`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
              enabled ? "translate-x-8" : "translate-x-1"
            }`}
          />
        </button>
      </div>
    </div>
  );

  // ==================== MAIN RENDER ====================

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
                <div>
                  <h1 className="text-xl font-bold text-gray-900">
                    Fiyatlandırma Yönetimi
                  </h1>
                  <p className="text-sm text-gray-500">
                    Reklam ve boost fiyatlarını tek yerden yönetin
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
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-lg"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span className="text-sm font-medium">
                    {saving ? "Kaydediliyor..." : "Tümünü Kaydet"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-[1400px] mx-auto px-6 py-8">
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

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <p className="text-gray-500">Fiyatlar yükleniyor...</p>
              </div>
            </div>
          ) : (
            <>
              {/* Tab Navigation */}
              <div className="mb-8">
                <div className="flex gap-2 p-1.5 bg-white rounded-xl border border-gray-200 shadow-sm w-fit">
                  <button
                    onClick={() => setActiveTab("ads")}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all ${
                      activeTab === "ads"
                        ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <Image className="w-4 h-4" />
                    <span>Reklam Fiyatları</span>
                    {hasAdChanges && (
                      <span className="w-2 h-2 bg-amber-400 rounded-full" />
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab("boost")}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all ${
                      activeTab === "boost"
                        ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <Rocket className="w-4 h-4" />
                    <span>Boost Fiyatları</span>
                    {hasBoostChanges && (
                      <span className="w-2 h-2 bg-amber-400 rounded-full" />
                    )}
                  </button>
                </div>
              </div>

              {/* ==================== ADS TAB ==================== */}
              {activeTab === "ads" && (
                <div className="space-y-6">
                  {/* Info Banner */}
                  <div className="p-5 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-100 rounded-xl">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Image className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-1">
                          Reklam Fiyatlandırması
                        </h3>
                        <p className="text-sm text-gray-600 leading-relaxed">
                          Banner reklamları için haftalık ve aylık fiyatları
                          belirleyin. Değişiklikler kaydedildiğinde mobil
                          uygulamada anlık olarak yansıyacaktır.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Service Toggle */}
                  {renderServiceToggle(
                    adPrices.serviceEnabled,
                    togglingAdService,
                    handleToggleAdService,
                    "Reklam Servisi",
                    "Servis aktif - Kullanıcılar reklam başvurusu yapabilir",
                    "Servis kapalı - Yeni başvurular engellenmiş",
                    "bg-green-500"
                  )}

                  {/* Ad Price Cards */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {AD_TYPES.map((adType) => {
                      const Icon = adType.icon;
                      const prices = adPrices[adType.key] as AdTypePrices;

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
                                <Icon
                                  className={`w-6 h-6 ${adType.textClass}`}
                                />
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
                                    value={prices[duration]}
                                    onChange={(e) =>
                                      handleAdPriceChange(
                                        adType.key,
                                        duration,
                                        e.target.value
                                      )
                                    }
                                    className={`w-full px-4 py-3 ${adType.inputBgClass} border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg font-semibold text-gray-900 pr-12`}
                                  />
                                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">
                                    TL
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Card Footer */}
                          <div className="px-5 pb-5">
                            <div
                              className={`p-3 ${adType.inputBgClass} rounded-xl`}
                            >
                              <p className="text-xs text-gray-500 mb-2">
                                Fiyat Aralığı
                              </p>
                              <p
                                className={`text-lg font-bold ${adType.textClass}`}
                              >
                                {Math.min(
                                  prices.oneWeek,
                                  prices.twoWeeks,
                                  prices.oneMonth
                                ).toLocaleString("tr-TR")}{" "}
                                -{" "}
                                {Math.max(
                                  prices.oneWeek,
                                  prices.twoWeeks,
                                  prices.oneMonth
                                ).toLocaleString("tr-TR")}{" "}
                                TL
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ==================== BOOST TAB ==================== */}
              {activeTab === "boost" && (
                <div className="space-y-6">
                  {/* Info Banner */}
                  <div className="p-5 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 rounded-xl">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Rocket className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-1">
                          Boost Fiyatlandırması
                        </h3>
                        <p className="text-sm text-gray-600 leading-relaxed">
                          Boost fiyatı şu formülle hesaplanır:{" "}
                          <strong>
                            Ürün Sayısı × Süre (dakika) × Dakika Başı Fiyat
                          </strong>
                          . Değişiklikler kaydedildiğinde tüm kullanıcılar yeni
                          fiyatları görecektir.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Service Toggle */}
                  {renderServiceToggle(
                    boostPrices.serviceEnabled,
                    togglingBoostService,
                    handleToggleBoostService,
                    "Boost Servisi",
                    "Servis aktif - Kullanıcılar ürün boost yapabilir",
                    "Servis kapalı - Yeni boost işlemleri engellenmiş",
                    "bg-emerald-500"
                  )}

                  {/* Boost Settings Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Price Card */}
                    <div className="bg-white rounded-2xl border-2 border-emerald-200 shadow-sm overflow-hidden">
                      <div className="p-5 bg-emerald-50">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                            <span className="text-2xl">💰</span>
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-900">
                              Fiyatlandırma
                            </h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Dakika başına ürün fiyatı
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="p-5">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Dakika Başı Fiyat (TL)
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0.1"
                            step="0.1"
                            value={boostPrices.pricePerProductPerMinute}
                            onChange={(e) =>
                              handleBoostPriceChange(
                                "pricePerProductPerMinute",
                                e.target.value
                              )
                            }
                            className="w-full px-4 py-3 bg-emerald-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-lg font-semibold text-gray-900 pr-12"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">
                            TL
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-gray-500">
                          Her ürün için dakika başına alınacak ücret
                        </p>
                      </div>
                    </div>

                    {/* Limits Card */}
                    <div className="bg-white rounded-2xl border-2 border-teal-200 shadow-sm overflow-hidden">
                      <div className="p-5 bg-teal-50">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center">
                            <Clock className="w-6 h-6 text-teal-600" />
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-900">
                              Limitler
                            </h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Süre ve ürün limitleri
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="p-5 space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            <div className="flex items-center gap-2">
                              <Package className="w-4 h-4" />
                              Maksimum Ürün Sayısı
                            </div>
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="10"
                            value={boostPrices.maxProducts}
                            onChange={(e) =>
                              handleBoostPriceChange(
                                "maxProducts",
                                e.target.value
                              )
                            }
                            className="w-full px-4 py-3 bg-teal-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-lg font-semibold text-gray-900"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Min Süre (dk)
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={boostPrices.minDuration}
                              onChange={(e) =>
                                handleBoostPriceChange(
                                  "minDuration",
                                  e.target.value
                                )
                              }
                              className="w-full px-4 py-3 bg-teal-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent font-semibold text-gray-900"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Max Süre (dk)
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={boostPrices.maxDuration}
                              onChange={(e) =>
                                handleBoostPriceChange(
                                  "maxDuration",
                                  e.target.value
                                )
                              }
                              className="w-full px-4 py-3 bg-teal-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent font-semibold text-gray-900"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Example Prices */}
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-5 bg-gray-50 border-b border-gray-200">
                      <h3 className="font-bold text-gray-900">
                        Örnek Fiyatlar
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        Mevcut ayarlara göre hesaplanan örnek fiyatlar
                      </p>
                    </div>
                    <div className="p-5">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {exampleBoostPrices.map((example, index) => (
                          <div
                            key={index}
                            className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border border-emerald-100"
                          >
                            <div className="text-sm text-gray-600 mb-2">
                              {example.products} ürün × {example.duration}{" "}
                              dakika
                            </div>
                            <div className="text-2xl font-bold text-emerald-600">
                              {example.price.toFixed(2)} TL
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Unsaved Changes Warning */}
              {hasChanges && (
                <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-500" />
                    <p className="text-sm text-amber-700">
                      Kaydedilmemiş değişiklikler var
                      {hasAdChanges && hasBoostChanges
                        ? " (Reklam ve Boost)"
                        : hasAdChanges
                        ? " (Reklam)"
                        : " (Boost)"}
                      . Sayfadan ayrılmadan önce kaydetmeyi unutmayın.
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
