"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  ArrowLeft,
  Search,
  User,
  Activity,
  MousePointer,
  Eye,
  ShoppingCart,
  Heart,
  CreditCard,
  SearchIcon,
  Trash2,
  ChevronDown,
  Clock,
  Package,
  TrendingUp,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  DocumentSnapshot,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";

// ============================================================================
// TYPES
// ============================================================================

interface UserProfile {
  id: string;
  displayName?: string;
  email?: string;
  lastActivityAt?: Timestamp;
  stats?: {
    totalEvents?: number;
    totalPurchases?: number;
    totalSpent?: number;
  };
  categoryScores?: Record<string, number>;
  brandScores?: Record<string, number>;
  preferences?: {
    topCategories?: Array<{ category: string; score: number }>;
    topBrands?: Array<{ brand: string; score: number }>;
    avgPurchasePrice?: number;
    computedAt?: Timestamp;
  };
}

interface ActivityEvent {
  id: string;
  userId: string;
  type: string;
  productId?: string;
  productName?: string;
  shopId?: string;
  category?: string;
  subcategory?: string;
  brand?: string;
  price?: number;
  quantity?: number;
  totalValue?: number;
  searchQuery?: string;
  weight: number;
  timestamp: number;
  serverTimestamp?: Timestamp;
}

interface SearchResult {
  id: string;
  displayName: string;
  email?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ACTIVITY_CONFIG: Record<string, { 
  label: string; 
  icon: React.ElementType; 
  color: string;
  bgColor: string;
}> = {
  click: { 
    label: "Tıklama", 
    icon: MousePointer, 
    color: "text-blue-600",
    bgColor: "bg-blue-100"
  },
  view: { 
    label: "Görüntüleme", 
    icon: Eye, 
    color: "text-indigo-600",
    bgColor: "bg-indigo-100"
  },
  addToCart: { 
    label: "Sepete Ekleme", 
    icon: ShoppingCart, 
    color: "text-green-600",
    bgColor: "bg-green-100"
  },
  removeFromCart: { 
    label: "Sepetten Çıkarma", 
    icon: Trash2, 
    color: "text-red-600",
    bgColor: "bg-red-100"
  },
  favorite: { 
    label: "Favorilere Ekleme", 
    icon: Heart, 
    color: "text-pink-600",
    bgColor: "bg-pink-100"
  },
  unfavorite: { 
    label: "Favorilerden Çıkarma", 
    icon: Heart, 
    color: "text-gray-600",
    bgColor: "bg-gray-100"
  },
  purchase: { 
    label: "Satın Alma", 
    icon: CreditCard, 
    color: "text-emerald-600",
    bgColor: "bg-emerald-100"
  },
  search: { 
    label: "Arama", 
    icon: SearchIcon, 
    color: "text-purple-600",
    bgColor: "bg-purple-100"
  },
};

const PAGE_SIZE = 20;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatTimestamp(timestamp: number | Timestamp): string {
  const date = typeof timestamp === "number" 
    ? new Date(timestamp) 
    : timestamp.toDate();
  
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  // Less than 1 minute
  if (diff < 60000) {
    return "Az önce";
  }
  
  // Less than 1 hour
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes} dakika önce`;
  }
  
  // Less than 24 hours
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} saat önce`;
  }
  
  // Less than 7 days
  if (diff < 604800000) {
    const days = Math.floor(diff / 86400000);
    return `${days} gün önce`;
  }
  
  // Format as date
  return date.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
  }).format(amount);
}

// ============================================================================
// COMPONENTS
// ============================================================================

function ActivityIcon({ type }: { type: string }) {
  const config = ACTIVITY_CONFIG[type] || { 
    label: type, 
    icon: Activity, 
    color: "text-gray-600",
    bgColor: "bg-gray-100"
  };
  const Icon = config.icon;
  
  return (
    <div className={`w-10 h-10 ${config.bgColor} rounded-xl flex items-center justify-center`}>
      <Icon className={`w-5 h-5 ${config.color}`} />
    </div>
  );
}

function ActivityCard({ event }: { event: ActivityEvent }) {
  const config = ACTIVITY_CONFIG[event.type] || { 
    label: event.type, 
    color: "text-gray-600" 
  };

  return (
    <div className="flex items-start gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all">
      <ActivityIcon type={event.type} />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className={`font-semibold ${config.color}`}>
            {config.label}
          </span>
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatTimestamp(event.timestamp)}
          </span>
        </div>
        
        <div className="space-y-1">
        {event.productId && (
  <p className="text-sm text-gray-700">
    <span className="text-gray-500">Ürün:</span>{" "}
    {event.productName ? (
      <span className="font-medium text-gray-900">{event.productName}</span>
    ) : (
      <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
        {event.productId.substring(0, 12)}...
      </span>
    )}
  </p>
)}
          
          {event.searchQuery && (
            <p className="text-sm text-gray-700">
              <span className="text-gray-500">Arama:</span>{" "}
              <span className="font-medium">&quot;{event.searchQuery}&quot;</span>
            </p>
          )}
          
          {event.category && (
            <p className="text-sm text-gray-600">
              <span className="text-gray-500">Kategori:</span>{" "}
              {event.category}
              {event.subcategory && ` → ${event.subcategory}`}
            </p>
          )}
          
          {event.brand && (
            <p className="text-sm text-gray-600">
              <span className="text-gray-500">Marka:</span>{" "}
              {event.brand}
            </p>
          )}
          
          {event.price !== undefined && (
            <p className="text-sm text-gray-600">
              <span className="text-gray-500">Fiyat:</span>{" "}
              {formatCurrency(event.price)}
              {event.quantity && event.quantity > 1 && (
                <span className="text-gray-500"> × {event.quantity}</span>
              )}
            </p>
          )}
          
          {event.totalValue !== undefined && event.totalValue !== event.price && (
            <p className="text-sm font-medium text-emerald-600">
              Toplam: {formatCurrency(event.totalValue)}
            </p>
          )}
        </div>
      </div>
      
      <div className="flex flex-col items-end gap-1">
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${
          event.weight > 0 
            ? "bg-green-100 text-green-700" 
            : event.weight < 0 
            ? "bg-red-100 text-red-700"
            : "bg-gray-100 text-gray-700"
        }`}>
          {event.weight > 0 ? "+" : ""}{event.weight} puan
        </span>
      </div>
    </div>
  );
}

function UserStatsCard({ profile }: { profile: UserProfile }) {
  const stats = profile.stats || {};
  const preferences = profile.preferences || {};
  
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center">
          <User className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900">{profile.displayName || "İsimsiz Kullanıcı"}</h3>
          <p className="text-sm text-gray-500">{profile.email || profile.id}</p>
        </div>
      </div>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <div className="text-center p-3 bg-blue-50 rounded-lg">
          <Activity className="w-5 h-5 text-blue-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-900">{stats.totalEvents || 0}</p>
          <p className="text-xs text-gray-600">Toplam Etkinlik</p>
        </div>
        <div className="text-center p-3 bg-green-50 rounded-lg">
          <Package className="w-5 h-5 text-green-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-900">{stats.totalPurchases || 0}</p>
          <p className="text-xs text-gray-600">Satın Alma</p>
        </div>
        <div className="text-center p-3 bg-emerald-50 rounded-lg">
          <CreditCard className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-900">
            {stats.totalSpent ? formatCurrency(stats.totalSpent) : "₺0"}
          </p>
          <p className="text-xs text-gray-600">Toplam Harcama</p>
        </div>
        <div className="text-center p-3 bg-purple-50 rounded-lg">
          <TrendingUp className="w-5 h-5 text-purple-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-900">
            {preferences.avgPurchasePrice ? formatCurrency(preferences.avgPurchasePrice) : "—"}
          </p>
          <p className="text-xs text-gray-600">Ort. Sepet</p>
        </div>
      </div>
      
      {/* Top Categories & Brands */}
      <div className="grid grid-cols-2 gap-4">
        {preferences.topCategories && preferences.topCategories.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">En Çok İlgilenilen Kategoriler</p>
            <div className="flex flex-wrap gap-1">
              {preferences.topCategories.slice(0, 5).map((cat, idx) => (
                <span 
                  key={idx}
                  className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full"
                >
                  {cat.category} ({cat.score})
                </span>
              ))}
            </div>
          </div>
        )}
        
        {preferences.topBrands && preferences.topBrands.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">En Çok İlgilenilen Markalar</p>
            <div className="flex flex-wrap gap-1">
              {preferences.topBrands.slice(0, 5).map((brand, idx) => (
                <span 
                  key={idx}
                  className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full"
                >
                  {brand.brand} ({brand.score})
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {profile.lastActivityAt && (
        <p className="text-xs text-gray-400 mt-4 pt-4 border-t border-gray-100">
          Son aktivite: {formatTimestamp(profile.lastActivityAt)}
        </p>
      )}
    </div>
  );
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function UserActivityPage() {
  const router = useRouter();
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  
  // Selected user state
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  const [lastActivityDoc, setLastActivityDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMoreActivities, setHasMoreActivities] = useState(true);
  const [activitiesError, setActivitiesError] = useState<string | null>(null);

  // Search users by displayName
  const searchUsers = useCallback(async (queryStr: string) => {
    if (queryStr.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    try {
      // Search in users collection with prefix matching
      const usersRef = collection(db, "users");
      const q = query(
        usersRef,
        where("displayName", ">=", queryStr),
        where("displayName", "<=", queryStr + "\uf8ff"),
        limit(10)
      );

      const snapshot = await getDocs(q);

      const results: SearchResult[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        displayName: doc.data().displayName || "İsimsiz",
        email: doc.data().email,
      }));

      setSearchResults(results);
    } catch (error) {
      console.error("Search error:", error);
      setSearchError("Arama sırasında bir hata oluştu");
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    const timer = setTimeout(() => {
      searchUsers(searchQuery.trim());
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchUsers]);

  // Load activities with pagination
  const loadActivities = useCallback(async (
    userId: string,
    lastDoc: DocumentSnapshot | null
  ) => {
    setIsLoadingActivities(true);
    setActivitiesError(null);

    try {
      // Get today's date shard (most recent first)
      const today = new Date().toISOString().split("T")[0];

      // Query activity events for this user
      // Note: This queries the date-sharded collection
      const eventsRef = collection(db, "activity_events", today, "events");

      let q = query(
        eventsRef,
        where("userId", "==", userId),
        orderBy("timestamp", "desc"),
        limit(PAGE_SIZE + 1)
      );

      if (lastDoc) {
        q = query(
          eventsRef,
          where("userId", "==", userId),
          orderBy("timestamp", "desc"),
          startAfter(lastDoc),
          limit(PAGE_SIZE + 1)
        );
      }

      const snapshot = await getDocs(q);

      const newActivities: ActivityEvent[] = [];
      let hasMore = false;
      let lastVisible: DocumentSnapshot | null = null;

      snapshot.docs.forEach((doc, index) => {
        if (index < PAGE_SIZE) {
          newActivities.push({
            id: doc.id,
            ...doc.data(),
          } as ActivityEvent);
          lastVisible = doc;
        } else {
          hasMore = true;
        }
      });

      if (lastDoc) {
        setActivities((prev) => [...prev, ...newActivities]);
      } else {
        setActivities(newActivities);
      }

      setLastActivityDoc(lastVisible);
      setHasMoreActivities(hasMore);
    } catch (error) {
      console.error("Error loading activities:", error);
      setActivitiesError("Aktiviteler yüklenirken bir hata oluştu");
    } finally {
      setIsLoadingActivities(false);
    }
  }, []);

  // Load user profile and activities
  const selectUser = useCallback(async (userId: string, displayName: string) => {
    setSelectedUser({ id: userId, displayName });
    setActivities([]);
    setLastActivityDoc(null);
    setHasMoreActivities(true);
    setActivitiesError(null);
    setSearchQuery("");
    setSearchResults([]);

    // Load user profile from user_profiles collection
    try {
      const profileRef = collection(db, "user_profiles");
      const profileQuery = query(profileRef, where("__name__", "==", userId));
      const profileSnapshot = await getDocs(profileQuery);

      if (!profileSnapshot.empty) {
        const profileData = profileSnapshot.docs[0].data();
        setSelectedUser({
          id: userId,
          displayName,
          ...profileData,
        } as UserProfile);
      }
    } catch (error) {
      console.error("Error loading profile:", error);
    }

    // Load initial activities
    await loadActivities(userId, null);
  }, [loadActivities]);

  // Load more activities
  const loadMore = useCallback(() => {
    if (selectedUser && lastActivityDoc && hasMoreActivities && !isLoadingActivities) {
      loadActivities(selectedUser.id, lastActivityDoc);
    }
  }, [selectedUser, lastActivityDoc, hasMoreActivities, isLoadingActivities, loadActivities]);

  // Refresh activities
  const refreshActivities = useCallback(() => {
    if (selectedUser) {
      setActivities([]);
      setLastActivityDoc(null);
      setHasMoreActivities(true);
      loadActivities(selectedUser.id, null);
    }
  }, [selectedUser, loadActivities]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50 shadow-sm">
          <div className="max-w-6xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.push("/")}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-gray-600" />
                </button>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                    <Activity className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-gray-900">
                      Kullanıcı Aktiviteleri
                    </h1>
                    <p className="text-xs text-gray-500">
                      Kullanıcı davranışlarını takip edin
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-6xl mx-auto px-6 py-6">
          {/* Search Section */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Search className="w-5 h-5 text-gray-600" />
              <h2 className="font-semibold text-gray-900">Kullanıcı Ara</h2>
            </div>
            
            <div className="relative">
              <input
                type="text"
                placeholder="Kullanıcı adı ile ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
              
              {isSearching && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />
                </div>
              )}
              
              {/* Search Results Dropdown */}
              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-10">
                  {searchResults.map((result) => (
                    <button
                      key={result.id}
                      onClick={() => selectUser(result.id, result.displayName)}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <User className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{result.displayName}</p>
                        {result.email && (
                          <p className="text-xs text-gray-500">{result.email}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              
              {searchError && (
                <p className="text-sm text-red-500 mt-2">{searchError}</p>
              )}
              
              {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
                <p className="text-sm text-gray-500 mt-2">
                  &quot;{searchQuery}&quot; için sonuç bulunamadı
                </p>
              )}
            </div>
          </div>

          {/* Selected User Section */}
          {selectedUser ? (
            <>
              {/* User Stats */}
              <UserStatsCard profile={selectedUser} />
              
              {/* Activities Header */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-gray-600" />
                  Son Aktiviteler
                </h2>
                <button
                  onClick={refreshActivities}
                  disabled={isLoadingActivities}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoadingActivities ? "animate-spin" : ""}`} />
                  Yenile
                </button>
              </div>
              
              {/* Activities List */}
              {activitiesError ? (
                <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
                  <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                  <p className="text-red-700">{activitiesError}</p>
                  <button
                    onClick={refreshActivities}
                    className="mt-3 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors text-sm"
                  >
                    Tekrar Dene
                  </button>
                </div>
              ) : activities.length > 0 ? (
                <div className="space-y-3">
                  {activities.map((activity) => (
                    <ActivityCard key={activity.id} event={activity} />
                  ))}
                  
                  {/* Load More Button */}
                  {hasMoreActivities && (
                    <button
                      onClick={loadMore}
                      disabled={isLoadingActivities}
                      className="w-full py-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl text-gray-700 font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isLoadingActivities ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Yükleniyor...
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-4 h-4" />
                          Daha Fazla Yükle
                        </>
                      )}
                    </button>
                  )}
                  
                  {!hasMoreActivities && activities.length > 0 && (
                    <p className="text-center text-sm text-gray-500 py-4">
                      Tüm aktiviteler yüklendi
                    </p>
                  )}
                </div>
              ) : isLoadingActivities ? (
                <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
                  <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-3" />
                  <p className="text-gray-500">Aktiviteler yükleniyor...</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
                  <Activity className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Bu kullanıcı için aktivite bulunamadı</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Aktiviteler son 90 gün içinde kaydedilir
                  </p>
                </div>
              )}
            </>
          ) : (
            /* Empty State */
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Kullanıcı Seçin
              </h3>
              <p className="text-gray-500 max-w-sm mx-auto">
                Aktivitelerini görüntülemek için yukarıdaki arama kutusunu kullanarak bir kullanıcı seçin
              </p>
            </div>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}