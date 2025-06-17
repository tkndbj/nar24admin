import React, { useState, useEffect } from "react";
import { X, Clock, Zap, Loader2, Calendar, Timer, Sun } from "lucide-react";

interface BoostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBoost: (duration: number) => Promise<void>;
  productName: string;
  isLoading: boolean;
}

const BoostModal: React.FC<BoostModalProps> = ({
  isOpen,
  onClose,
  onBoost,
  productName,
  isLoading,
}) => {
  const [duration, setDuration] = useState<number>(60);
  const [timeUnit, setTimeUnit] = useState<"minutes" | "hours" | "days">(
    "minutes"
  );
  const [customDuration, setCustomDuration] = useState<string>("60");

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      // Prevent scroll to top when modal opens
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
    } else {
      // Restore scroll position
      const scrollY = document.body.style.top;
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.overflow = "";
      document.body.style.width = "";
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || "0", 10) * -1);
      }
    }

    // Cleanup on unmount
    return () => {
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.overflow = "";
      document.body.style.width = "";
    };
  }, [isOpen]);

  // Predefined duration options (in minutes)
  const quickOptions = [
    { label: "1 Saat", value: 60, unit: "minutes" },
    { label: "6 Saat", value: 360, unit: "minutes" },
    { label: "12 Saat", value: 720, unit: "minutes" },
    { label: "1 Gün", value: 1440, unit: "minutes" },
    { label: "3 Gün", value: 4320, unit: "minutes" },
    { label: "7 Gün", value: 10080, unit: "minutes" },
  ];

  const calculateDurationInMinutes = () => {
    const value = parseInt(customDuration) || 0;
    switch (timeUnit) {
      case "hours":
        return value * 60;
      case "days":
        return value * 1440;
      default:
        return value;
    }
  };

  const calculatePrice = (durationInMinutes: number) => {
    return durationInMinutes * 150; // 150 TL per minute as per your cloud function
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) {
      return `${minutes} dakika`;
    } else if (minutes < 1440) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return remainingMinutes > 0
        ? `${hours} saat ${remainingMinutes} dakika`
        : `${hours} saat`;
    } else {
      const days = Math.floor(minutes / 1440);
      const remainingHours = Math.floor((minutes % 1440) / 60);
      const remainingMinutes = minutes % 60;

      let result = `${days} gün`;
      if (remainingHours > 0) result += ` ${remainingHours} saat`;
      if (remainingMinutes > 0) result += ` ${remainingMinutes} dakika`;

      return result;
    }
  };

  const handleQuickSelect = (value: number) => {
    setDuration(value);
    setCustomDuration(value.toString());
    setTimeUnit("minutes");
  };

  const handleCustomDurationChange = (value: string) => {
    setCustomDuration(value);
    const calculatedDuration = calculateDurationInMinutes();
    setDuration(calculatedDuration);
  };

  const handleTimeUnitChange = (unit: "minutes" | "hours" | "days") => {
    setTimeUnit(unit);
    const calculatedDuration = calculateDurationInMinutes();
    setDuration(calculatedDuration);
  };

  const handleBoost = async () => {
    const finalDuration = calculateDurationInMinutes();
    if (finalDuration > 0 && finalDuration <= 10080) {
      // Max 7 days as per cloud function
      await onBoost(finalDuration);
    }
  };

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isLoading) {
      onClose();
    }
  };

  // Handle escape key
  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscapeKey);
    }

    return () => {
      document.removeEventListener("keydown", handleEscapeKey);
    };
  }, [isOpen, isLoading, onClose]);

  const currentDuration = calculateDurationInMinutes();
  const currentPrice = calculatePrice(currentDuration);
  const isValidDuration = currentDuration > 0 && currentDuration <= 10080;

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[999999] flex items-center justify-center min-h-screen p-4"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 999999,
        }}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={handleBackdropClick}
        />

        {/* Modal Content */}
        <div
          className="relative bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-white/20 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto transform animate-in fade-in zoom-in duration-300"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-white/20">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-600/20 rounded-lg">
                <Zap className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">
                  Ürünü Öne Çıkar
                </h2>
                <p className="text-sm text-gray-400 truncate max-w-64">
                  {productName}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isLoading}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Quick Options */}
            <div>
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Hızlı Seçenekler
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {quickOptions.map((option) => {
                  const isSelected = duration === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => handleQuickSelect(option.value)}
                      disabled={isLoading}
                      className={`p-3 rounded-lg border transition-all text-sm font-medium disabled:opacity-50 ${
                        isSelected
                          ? "bg-purple-600 border-purple-500 text-white shadow-lg"
                          : "bg-white/5 border-white/20 text-gray-300 hover:bg-white/10 hover:border-white/30"
                      }`}
                    >
                      <div className="text-center">
                        <div className="font-semibold">{option.label}</div>
                        <div className="text-xs opacity-75">
                          {calculatePrice(option.value).toLocaleString()} TL
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Duration */}
            <div>
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Timer className="w-4 h-4" />
                Özel Süre
              </h3>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <input
                    type="number"
                    value={customDuration}
                    onChange={(e) => handleCustomDurationChange(e.target.value)}
                    min="1"
                    max={
                      timeUnit === "minutes"
                        ? "10080"
                        : timeUnit === "hours"
                        ? "168"
                        : "7"
                    }
                    disabled={isLoading}
                    className="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                    placeholder="Süre girin"
                  />
                  <select
                    value={timeUnit}
                    onChange={(e) =>
                      handleTimeUnitChange(
                        e.target.value as "minutes" | "hours" | "days"
                      )
                    }
                    disabled={isLoading}
                    className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                  >
                    <option
                      value="minutes"
                      style={{ backgroundColor: "#1f2937", color: "white" }}
                    >
                      Dakika
                    </option>
                    <option
                      value="hours"
                      style={{ backgroundColor: "#1f2937", color: "white" }}
                    >
                      Saat
                    </option>
                    <option
                      value="days"
                      style={{ backgroundColor: "#1f2937", color: "white" }}
                    >
                      Gün
                    </option>
                  </select>
                </div>

                {/* Duration Limits Info */}
                <div className="text-xs text-gray-400">
                  {timeUnit === "minutes" && "Maksimum 10,080 dakika (7 gün)"}
                  {timeUnit === "hours" && "Maksimum 168 saat (7 gün)"}
                  {timeUnit === "days" && "Maksimum 7 gün"}
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Özet
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Boost Süresi:</span>
                  <span className="text-white font-medium">
                    {isValidDuration
                      ? formatDuration(currentDuration)
                      : "Geçersiz süre"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Dakika Başı Ücret:</span>
                  <span className="text-white">150 TL</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-white/10">
                  <span className="text-gray-400">Toplam Ücret:</span>
                  <span className="text-green-400 font-bold text-lg">
                    {isValidDuration ? currentPrice.toLocaleString() : "0"} TL
                  </span>
                </div>
              </div>
            </div>

            {/* Warning */}
            {!isValidDuration && currentDuration > 10080 && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <p className="text-red-400 text-sm">
                  Maksimum boost süresi 7 gün (10,080 dakika) olabilir.
                </p>
              </div>
            )}

            {/* Benefits */}
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-purple-300 mb-2 flex items-center gap-2">
                <Sun className="w-4 h-4" />
                Boost Avantajları
              </h4>
              <ul className="text-xs text-purple-200 space-y-1">
                <li>• Arama sonuçlarında öncelikli gösterim</li>
                <li>• Daha fazla görüntülenme ve etkileşim</li>
                <li>• Özel &quot;BOOST&quot; etiketiyle öne çıkma</li>
                <li>• Satış potansiyeli artışı</li>
              </ul>
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-3 p-6 border-t border-white/20">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              İptal
            </button>
            <button
              onClick={handleBoost}
              disabled={isLoading || !isValidDuration || currentDuration === 0}
              className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Boost Yapılıyor...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Boost Yap ({currentPrice.toLocaleString()} TL)
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Add global styles for modal animation */}
      <style jsx global>{`
        @keyframes animate-in {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .animate-in {
          animation: animate-in 0.2s ease-out;
        }

        .fade-in {
          animation: fade-in 0.2s ease-out;
        }

        .zoom-in {
          animation: zoom-in 0.2s ease-out;
        }

        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes zoom-in {
          from {
            transform: scale(0.95);
          }
          to {
            transform: scale(1);
          }
        }
      `}</style>
    </>
  );
};

export default BoostModal;
