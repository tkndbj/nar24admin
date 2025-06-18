"use client";

import { useState, useEffect } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  Send,
  Users,
  Bell,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Globe,
  MessageSquare,  
  Store,
  TrendingUp,
  Truck,
  Star,
  AlertTriangle,
  User,
  ShoppingBag,
} from "lucide-react";
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc,   
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useRouter } from "next/navigation";

interface NotificationData {
  type: string;
  message: string;
  timestamp: Timestamp | null;
  isRead: boolean;
  // Optional fields for navigation
  productId?: string;
  shopId?: string;
}

interface LanguageStats {
  tr: number;
  en: number;
  ru: number;
  total: number;
}

const notificationTypes = [
  { value: 'general', label: 'Genel', icon: Bell, color: 'text-blue-500' },
  { value: 'company_update', label: 'Şirket Güncellemesi', icon: Globe, color: 'text-green-500' },
  { value: 'boosted', label: 'Öne Çıkarıldı', icon: TrendingUp, color: 'text-purple-500' },
  { value: 'boost_expired', label: 'Öne Çıkarma Süresi Doldu', icon: TrendingUp, color: 'text-orange-500' },
  { value: 'product_review', label: 'Ürün Değerlendirmesi', icon: Star, color: 'text-yellow-500' },
  { value: 'shipment', label: 'Kargo', icon: Truck, color: 'text-blue-600' },
  { value: 'shop_approved', label: 'Mağaza Onaylandı', icon: Store, color: 'text-green-600' },
  { value: 'shop_disapproved', label: 'Mağaza Reddedildi', icon: Store, color: 'text-red-500' },
  { value: 'message', label: 'Mesaj', icon: MessageSquare, color: 'text-indigo-500' },
  { value: 'product_sold', label: 'Ürün Satıldı', icon: ShoppingBag, color: 'text-green-700' },
  { value: 'product_out_of_stock', label: 'Stok Tükendi', icon: AlertTriangle, color: 'text-red-600' },
  { value: 'seller_review', label: 'Satıcı Değerlendirmesi', icon: User, color: 'text-pink-500' },
];

const languages = [
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
];

export default function NotificationsPage() {
  
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [languageStats, setLanguageStats] = useState<LanguageStats>({
    tr: 0,
    en: 0,
    ru: 0,
    total: 0
  });
  const [fetchingUsers, setFetchingUsers] = useState(true);

  // Form states
  const [notificationType, setNotificationType] = useState('general');
  const [selectedLanguage, setSelectedLanguage] = useState('tr');
  const [message, setMessage] = useState('');
  const [productId, setProductId] = useState('');
  const [shopId, setShopId] = useState('');

  // Fetch user language statistics on component mount
  useEffect(() => {
    const fetchLanguageStats = async () => {
      try {
        setFetchingUsers(true);
        const usersRef = collection(db, "users");
        const snapshot = await getDocs(usersRef);
        
        const stats: LanguageStats = { tr: 0, en: 0, ru: 0, total: 0 };
        
        snapshot.docs.forEach(doc => {
          const userData = doc.data();
          const langCode = userData.languageCode;
          
          if (langCode === 'tr') stats.tr++;
          else if (langCode === 'en') stats.en++;
          else if (langCode === 'ru') stats.ru++;
          
          stats.total++;
        });
        
        setLanguageStats(stats);
      } catch (err) {
        console.error("Error fetching user language stats:", err);
        setError("Kullanıcı istatistikleri alınamadı");
      } finally {
        setFetchingUsers(false);
      }
    };

    fetchLanguageStats();
  }, []);

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim()) {
      setError("Mesaj alanı dolu olmalıdır");
      return;
    }

    // Validate that only one of productId or shopId is filled
    if (productId.trim() && shopId.trim()) {
      setError("Sadece Ürün ID veya Mağaza ID'den birini girebilirsiniz");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      // Query users by selected language
      const usersRef = collection(db, "users");
      const languageQuery = query(usersRef, where("languageCode", "==", selectedLanguage));
      const usersSnapshot = await getDocs(languageQuery);

      if (usersSnapshot.empty) {
        setError(`${selectedLanguage.toUpperCase()} dili için kullanıcı bulunamadı`);
        setLoading(false);
        return;
      }

      // Prepare notification data
      const notificationData: NotificationData = {
        type: notificationType,
        message: message.trim(),
        timestamp: Timestamp.now(),
        isRead: false,
      };

      // Add optional fields only if they have values
      if (productId.trim()) {
        notificationData.productId = productId.trim();
      }
      if (shopId.trim()) {
        notificationData.shopId = shopId.trim();
      }

      // Send notification to each user with the selected language
      const promises = usersSnapshot.docs.map(async (userDoc) => {
        const userId = userDoc.id;
        const notificationRef = doc(collection(db, "users", userId, "notifications"));
        await setDoc(notificationRef, notificationData);
      });

      await Promise.all(promises);

      setSuccess(true);
      // Clear form
      setMessage('');
      setProductId('');
      setShopId('');

      // Hide success message after 5 seconds
      setTimeout(() => setSuccess(false), 5000);

    } catch (err) {
      console.error("Error sending notifications:", err);
      setError("Bildirimler gönderilemedi. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  const selectedTypeData = notificationTypes.find(type => type.value === notificationType);
  const IconComponent = selectedTypeData?.icon || Bell;
  const currentLanguageStats = languageStats[selectedLanguage as keyof LanguageStats] || 0;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        {/* Header */}
        <header className="backdrop-blur-xl bg-white/10 border-b border-white/20 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between py-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.back()}
                  className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  
                </button>
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg">
                    <Bell className="w-5 h-5 text-white" />
                  </div>
                  <h1 className="text-2xl font-bold text-white">Bildirim Gönder</h1>
                </div>
              </div>
              <div className="flex items-center gap-3 text-white">
                <Users className="w-5 h-5" />
                <span className="text-sm">
                  {fetchingUsers ? "Yükleniyor..." : `${languageStats.total.toLocaleString()} toplam kullanıcı`}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Success Alert */}
          {success && (
            <div className="mb-6 backdrop-blur-xl bg-green-500/20 border border-green-500/30 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <div>
                  <h3 className="font-semibold text-green-400">Bildirimler Başarıyla Gönderildi!</h3>
                  <p className="text-sm text-green-300">
                    {currentLanguageStats.toLocaleString()} {selectedLanguage.toUpperCase()} kullanıcısına bildirim gönderildi.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error Alert */}
          {error && (
            <div className="mb-6 backdrop-blur-xl bg-red-500/20 border border-red-500/30 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-400" />
                <div>
                  <h3 className="font-semibold text-red-400">Hata</h3>
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Language Statistics */}
          <div className="mb-6 backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-4">
            <h3 className="text-lg font-semibold text-white mb-3">Dil İstatistikleri</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              {languages.map((lang) => (
                <div key={lang.code} className="flex items-center justify-between p-3 bg-white/10 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{lang.flag}</span>
                    <span className="text-white font-medium">{lang.label}</span>
                  </div>
                  <span className="text-blue-400 font-bold">
                    {languageStats[lang.code as keyof LanguageStats].toLocaleString()}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-600/20 to-blue-600/20 rounded-lg border border-purple-500/30">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-400" />
                  <span className="text-white font-medium">Toplam</span>
                </div>
                <span className="text-purple-400 font-bold">
                  {languageStats.total.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-6">
            <form onSubmit={handleSendNotification} className="space-y-6">
              {/* Language Selection */}
              <div>
                <label className="block text-sm font-semibold text-white mb-3">
                  Hedef Dil Seçin
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => setSelectedLanguage(lang.code)}
                      className={`p-4 rounded-lg border transition-all ${
                        selectedLanguage === lang.code
                          ? 'bg-white/20 border-white/40 text-white'
                          : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{lang.flag}</span>
                        <div className="text-left">
                          <div className="font-medium">{lang.label}</div>
                          <div className="text-sm opacity-70">
                            {languageStats[lang.code as keyof LanguageStats].toLocaleString()} kullanıcı
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Notification Type */}
              <div>
                <label className="block text-sm font-semibold text-white mb-3">
                  Bildirim Türü
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {notificationTypes.map((type) => {
                    const TypeIcon = type.icon;
                    return (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => setNotificationType(type.value)}
                        className={`p-3 rounded-lg border transition-all ${
                          notificationType === type.value
                            ? 'bg-white/20 border-white/40 text-white'
                            : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                        }`}
                      >
                        <div className="flex flex-col items-center gap-2">
                          <TypeIcon className={`w-5 h-5 ${type.color}`} />
                          <span className="text-xs font-medium text-center">{type.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Message Field */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  Mesaj ({selectedLanguage.toUpperCase()})
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={`${selectedLanguage.toUpperCase()} dilinde mesajınızı girin...`}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  rows={4}
                  required
                />
              </div>

              {/* Optional Navigation Fields */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">İsteğe Bağlı Yönlendirme</h3>
                <p className="text-sm text-gray-300 mb-4">
                  Bildirime tıklandığında kullanıcıyı belirli bir sayfaya yönlendirmek için ID girin (sadece birini doldurun)
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Ürün ID
                    </label>
                    <input
                      type="text"
                      value={productId}
                      onChange={(e) => setProductId(e.target.value)}
                      placeholder="Ürün sayfasına yönlendirmek için ürün ID'si"
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      disabled={!!shopId.trim()}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Mağaza ID
                    </label>
                    <input
                      type="text"
                      value={shopId}
                      onChange={(e) => setShopId(e.target.value)}
                      placeholder="Mağaza sayfasına yönlendirmek için mağaza ID'si"
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      disabled={!!productId.trim()}
                    />
                  </div>
                </div>
              </div>

              {/* Send Button */}
              <div className="flex items-center justify-between pt-6 border-t border-white/10">
                <div className="flex items-center gap-2 text-gray-300">
                  <IconComponent className={`w-5 h-5 ${selectedTypeData?.color}`} />
                  <span className="text-sm">
                  &quot;{selectedTypeData?.label}&quot; bildirimi {currentLanguageStats.toLocaleString()} {selectedLanguage.toUpperCase()} kullanıcısına gönderiliyor
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={loading || fetchingUsers}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-600 text-white font-semibold rounded-lg transition-all duration-200 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Gönderiliyor...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Bildirim Gönder
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}