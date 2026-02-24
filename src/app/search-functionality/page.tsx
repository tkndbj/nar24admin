"use client";

import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  Search,
  Zap,
  Database,
  ArrowLeft,
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
  Info,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { doc, setDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db } from "@/app/lib/firebase";
import { useRouter } from "next/navigation";

// ─── Types ───────────────────────────────────────────────────────────────────

type SearchProviderType = "typesense" | "firestore";

interface SearchConfig {
  provider: SearchProviderType;
  updatedAt: Date | null;
  updatedBy: string | null;
  reason: string | null;
}

// ─── Provider Card ───────────────────────────────────────────────────────────

const ProviderCard = ({
  type,
  isActive,
  isLoading,
  onSelect,
}: {
  type: SearchProviderType;
  isActive: boolean;
  isLoading: boolean;
  onSelect: () => void;
}) => {
  const isTypesense = type === "typesense";

  const config = isTypesense
    ? {
        icon: Zap,
        title: "Typesense (Varsayilan)",
        description:
          "Dogrudan Typesense SDK ile arama. Dusuk gecikme, hizli sonuclar. Uretim icin onerilir.",
        features: [
          "Dogrudan istemci baglantisi",
          "~50ms gecikme",
          "Typo tolerance & ranking",
          "Acik kaynak maliyet avantaji",
        ],
        activeColor: "border-blue-500 bg-blue-50",
        activeDot: "bg-blue-500",
        activeText: "text-blue-700",
        iconBg: "bg-blue-100 text-blue-600",
      }
    : {
        icon: Database,
        title: "Firestore (Yedek)",
        description:
          "Cloud Firestore keyword araması. Typesense cokerse veya bakim gerektiginde kullanin.",
        features: [
          "Sunucu tarafli arama",
          "~200-500ms gecikme",
          "Temel keyword eslesmesi",
          "Firestore okuma maliyeti",
        ],
        activeColor: "border-orange-500 bg-orange-50",
        activeDot: "bg-orange-500",
        activeText: "text-orange-700",
        iconBg: "bg-orange-100 text-orange-600",
      };

  const Icon = config.icon;

  return (
    <button
      onClick={onSelect}
      disabled={isLoading || isActive}
      className={`relative flex-1 p-5 rounded-xl border-2 text-left transition-all ${
        isActive
          ? config.activeColor
          : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
      } ${isLoading ? "opacity-60 cursor-not-allowed" : isActive ? "cursor-default" : "cursor-pointer"}`}
    >
      {/* Active indicator */}
      {isActive && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          <div
            className={`w-2 h-2 rounded-full ${config.activeDot} animate-pulse`}
          />
          <span className={`text-xs font-semibold ${config.activeText}`}>
            Aktif
          </span>
        </div>
      )}

      <div className={`inline-flex p-2.5 rounded-lg ${config.iconBg} mb-3`}>
        <Icon className="w-5 h-5" />
      </div>

      <h3 className="text-base font-semibold text-gray-900 mb-1">
        {config.title}
      </h3>
      <p className="text-sm text-gray-500 mb-3">{config.description}</p>

      <div className="space-y-1.5">
        {config.features.map((feature, i) => (
          <div key={i} className="flex items-center gap-2">
            <CheckCircle
              className={`w-3.5 h-3.5 ${isActive ? config.activeText : "text-gray-400"}`}
            />
            <span className="text-xs text-gray-600">{feature}</span>
          </div>
        ))}
      </div>
    </button>
  );
};

// ─── Confirmation Modal ──────────────────────────────────────────────────────

const ConfirmationModal = ({
  targetProvider,
  reason,
  setReason,
  onConfirm,
  onCancel,
  isLoading,
}: {
  targetProvider: SearchProviderType;
  reason: string;
  setReason: (r: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}) => {
  const isToFirestore = targetProvider === "firestore";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div
            className={`p-2 rounded-lg ${
              isToFirestore ? "bg-orange-100" : "bg-blue-100"
            }`}
          >
            <AlertTriangle
              className={`w-5 h-5 ${
                isToFirestore ? "text-orange-600" : "text-blue-600"
              }`}
            />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              {isToFirestore ? "Firestore'a Gecis Yap" : "Typesense'e Geri Don"}
            </h3>
            <p className="text-xs text-gray-500">
              Bu degisiklik tum kullanicilari aninda etkiler
            </p>
          </div>
        </div>

        {isToFirestore && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            <div className="flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-800">
                <p className="font-medium mb-1">Dikkat:</p>
                <p>
                  Firestore aramasi Typesense&apos;e kiyasla daha yavas ve daha
                  sinirlidir. Sadece Typesense&apos;de bir sorun oldugunda veya
                  bakim gerektiginde kullanin.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mb-4">
          <label className="text-xs font-medium text-gray-700 mb-1 block">
            Degisiklik Sebebi (opsiyonel)
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="orn: Typesense 500 hatasi veriyor..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            maxLength={200}
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-50"
          >
            Iptal
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
              isToFirestore
                ? "bg-orange-600 hover:bg-orange-700"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {isLoading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <>{isToFirestore ? "Firestore'a Gec" : "Typesense'e Don"}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SearchFunctionalityPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [config, setConfig] = useState<SearchConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [targetProvider, setTargetProvider] =
    useState<SearchProviderType>("typesense");
  const [reason, setReason] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ── Real-time listener on config/search ──────────────────────────────────

  useEffect(() => {
    if (!user) return;

    const docRef = doc(db, "config", "search");

    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setConfig({
            provider: (data.provider as SearchProviderType) || "typesense",
            updatedAt: data.updatedAt?.toDate() ?? null,
            updatedBy: data.updatedBy ?? null,
            reason: data.reason ?? null,
          });
        } else {
          // Document doesn't exist yet — default config
          setConfig({
            provider: "typesense",
            updatedAt: null,
            updatedBy: null,
            reason: null,
          });
        }
        setIsLoading(false);
      },
      (error) => {
        console.error("Error listening to search config:", error);
        setConfig({
          provider: "typesense",
          updatedAt: null,
          updatedBy: null,
          reason: null,
        });
        setIsLoading(false);
      },
    );

    return () => unsubscribe();
  }, [user]);

  // ── Switch provider ──────────────────────────────────────────────────────

  const handleProviderSelect = useCallback(
    (provider: SearchProviderType) => {
      if (provider === config?.provider) return;
      setTargetProvider(provider);
      setReason("");
      setShowConfirm(true);
    },
    [config?.provider],
  );

  const handleConfirm = useCallback(async () => {
    if (!user) return;
    setIsSaving(true);

    try {
      const docRef = doc(db, "config", "search");
      await setDoc(
        docRef,
        {
          provider: targetProvider,
          updatedAt: serverTimestamp(),
          updatedBy: user.displayName || user.email || user.uid,
          reason: reason.trim() || null,
        },
        { merge: false },
      );

      setSaveSuccess(true);
      setShowConfirm(false);
      setReason("");

      // Clear success indicator after 3s
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error("Error updating search config:", error);
      alert("Hata: Yapilandirma guncellenemedi. Lutfen tekrar deneyin.");
    } finally {
      setIsSaving(false);
    }
  }, [user, targetProvider, reason]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push("/")}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-all"
              >
                <ArrowLeft className="w-4 h-4 text-gray-600" />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                  <Search className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h1 className="text-base font-bold text-gray-900">
                    Arama Yapilandirmasi
                  </h1>
                  <p className="text-xs text-gray-500">
                    Arama saglayicisini uzaktan yonetin
                  </p>
                </div>
              </div>
            </div>

            {saveSuccess && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                <span className="text-xs font-medium text-green-700">
                  Kaydedildi
                </span>
              </div>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="max-w-4xl mx-auto px-4 py-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* How it works info box */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex gap-3">
                  <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">Nasil Calisir?</p>
                    <p className="text-xs leading-relaxed text-blue-700">
                      Flutter uygulamasi bu yapilandirmayi canli dinler.
                      Saglayiciyi degistirdiginizde, tum aktif kullanicilar
                      birkaç saniye icinde otomatik olarak gecis yapar.
                      Varsayilan olarak Typesense aktiftir — yalnizca
                      Typesense&apos;de sorun yasandiginda Firestore&apos;a gecin.
                    </p>
                  </div>
                </div>
              </div>

              {/* Provider Selection */}
              <div>
                <h2 className="text-sm font-semibold text-gray-900 mb-3">
                  Aktif Arama Saglayicisi
                </h2>
                <div className="flex gap-4">
                  <ProviderCard
                    type="typesense"
                    isActive={config?.provider === "typesense"}
                    isLoading={isSaving}
                    onSelect={() => handleProviderSelect("typesense")}
                  />
                  <ProviderCard
                    type="firestore"
                    isActive={config?.provider === "firestore"}
                    isLoading={isSaving}
                    onSelect={() => handleProviderSelect("firestore")}
                  />
                </div>
              </div>

              {/* Current Status */}
              {config && (
                <div className="bg-white border border-gray-100 rounded-xl p-5">
                  <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400" />
                    Mevcut Durum
                  </h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">
                        Aktif Saglayici
                      </p>
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            config.provider === "typesense"
                              ? "bg-blue-500"
                              : "bg-orange-500"
                          } animate-pulse`}
                        />
                        <p className="text-sm font-medium text-gray-900 capitalize">
                          {config.provider}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">
                        Son Guncelleme
                      </p>
                      <p className="text-sm font-medium text-gray-900">
                        {config.updatedAt
                          ? config.updatedAt.toLocaleString("tr-TR")
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">
                        Guncelleyen
                      </p>
                      <p className="text-sm font-medium text-gray-900">
                        {config.updatedBy ?? "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Sebep</p>
                      <p className="text-sm font-medium text-gray-900">
                        {config.reason ?? "—"}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Firestore active warning */}
              {config?.provider === "firestore" && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
                  <div className="flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800">
                        Firestore Yedek Modu Aktif
                      </p>
                      <p className="text-xs text-amber-700 mt-1">
                        Kullanicilar su an sinirli arama deneyimi yasiyor.
                        Typesense sorunu cozuldugunde geri gecmeyi unutmayin.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        {/* Confirmation Modal */}
        {showConfirm && (
          <ConfirmationModal
            targetProvider={targetProvider}
            reason={reason}
            setReason={setReason}
            onConfirm={handleConfirm}
            onCancel={() => setShowConfirm(false)}
            isLoading={isSaving}
          />
        )}
      </div>
    </ProtectedRoute>
  );
}
