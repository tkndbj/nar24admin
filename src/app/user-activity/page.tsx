"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  ArrowLeft,
  Search,
  User,
  Activity,
  ShoppingCart,
  Heart,
  CreditCard,
  SearchIcon,
  RefreshCw,
  AlertCircle,
  Hash,
  Tag,
  BarChart3,
  TrendingUp,
  Eye,
  Star,
  ExternalLink,
  Layers,
  Target,
  MousePointer,
  Trash2,
  Filter,
} from "lucide-react";
import {
  collection,
  query,
  where,
  limit,
  getDocs,
  doc,
  getDoc,
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
    totalClicks?: number;
    totalViews?: number;
    totalCartAdds?: number;
    totalFavorites?: number;
    totalSearches?: number;
  };
  categoryScores?: Record<string, number>;
  subcategoryScores?: Record<string, number>;
  brandScores?: Record<string, number>;
  genderScores?: Record<string, number>;
  recentActivity?: ActivityEntry[];
  recentlyViewed?: Array<{ productId: string; timestamp: Timestamp }>;
  preferences?: {
    topCategories?: Array<{ category: string; score: number }>;
    topBrands?: Array<{ brand: string; score: number }>;
    avgPurchasePrice?: number;
    computedAt?: Timestamp;
  };
}

interface ActivityEntry {
  t: string;
  pid?: string | null;
  pn?: string | null;
  cat?: string | null;
  br?: string | null;
  pr?: number | null;
  q?: string | null;
  ts: number;
}

interface SearchResult {
  id: string;
  displayName: string;
  email?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ACTIVITY_CONFIG: Record<
  string,
  {
    label: string;
    icon: React.ElementType;
    color: string;
    bgColor: string;
    borderColor: string;
  }
> = {
  click: {
    label: "Tıklama",
    icon: MousePointer,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
  },
  view: {
    label: "Görüntüleme",
    icon: Eye,
    color: "text-indigo-600",
    bgColor: "bg-indigo-50",
    borderColor: "border-indigo-200",
  },
  addToCart: {
    label: "Sepete Ekleme",
    icon: ShoppingCart,
    color: "text-green-600",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
  },
  removeFromCart: {
    label: "Sepetten Çıkarma",
    icon: Trash2,
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
  },
  favorite: {
    label: "Favori",
    icon: Heart,
    color: "text-pink-600",
    bgColor: "bg-pink-50",
    borderColor: "border-pink-200",
  },
  unfavorite: {
    label: "Favori Kaldırma",
    icon: Heart,
    color: "text-gray-500",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200",
  },
  purchase: {
    label: "Satın Alma",
    icon: CreditCard,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
  },
  search: {
    label: "Arama",
    icon: SearchIcon,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
  },
};

// ============================================================================
// HELPERS
// ============================================================================

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatTimestamp(timestamp: number | Timestamp): string {
  const date =
    typeof timestamp === "number" ? new Date(timestamp) : timestamp.toDate();
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 60000) return "Az önce";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}dk önce`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}sa önce`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}g önce`;
  return date.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sortedEntries(
  obj: Record<string, number> | undefined,
): [string, number][] {
  if (!obj) return [];
  return Object.entries(obj).sort((a, b) => b[1] - a[1]);
}

// ============================================================================
// COMPONENTS
// ============================================================================

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}) {
  const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
    blue: { bg: "bg-blue-50", text: "text-blue-700", icon: "text-blue-500" },
    green: {
      bg: "bg-green-50",
      text: "text-green-700",
      icon: "text-green-500",
    },
    emerald: {
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      icon: "text-emerald-500",
    },
    purple: {
      bg: "bg-purple-50",
      text: "text-purple-700",
      icon: "text-purple-500",
    },
    pink: { bg: "bg-pink-50", text: "text-pink-700", icon: "text-pink-500" },
    orange: {
      bg: "bg-orange-50",
      text: "text-orange-700",
      icon: "text-orange-500",
    },
    indigo: {
      bg: "bg-indigo-50",
      text: "text-indigo-700",
      icon: "text-indigo-500",
    },
    red: { bg: "bg-red-50", text: "text-red-700", icon: "text-red-500" },
  };
  const c = colorMap[color] || colorMap.blue;
  return (
    <div className={`${c.bg} rounded-xl p-3 flex items-center gap-3`}>
      <div
        className={`w-9 h-9 rounded-lg ${c.bg} border border-white/60 flex items-center justify-center`}
      >
        <Icon className={`w-4 h-4 ${c.icon}`} />
      </div>
      <div>
        <p className={`text-lg font-bold ${c.text} leading-none`}>{value}</p>
        <p className={`text-[10px] ${c.text} opacity-70 mt-0.5`}>{label}</p>
      </div>
    </div>
  );
}

function ScoreBar({
  label,
  score,
  maxScore,
  color,
}: {
  label: string;
  score: number;
  maxScore: number;
  color: string;
}) {
  const pct = maxScore > 0 ? Math.min((score / maxScore) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-32 truncate text-gray-700 font-medium" title={label}>
        {label}
      </span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-12 text-right text-gray-500 tabular-nums font-medium">
        {score.toFixed(1)}
      </span>
    </div>
  );
}

function ScoreSection({
  title,
  icon: Icon,
  iconColor,
  entries,
  barColor,
  maxItems = 10,
}: {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  entries: [string, number][];
  barColor: string;
  maxItems?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? entries : entries.slice(0, maxItems);
  const maxScore = entries.length > 0 ? entries[0][1] : 1;
  if (entries.length === 0) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${iconColor}`} />
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
            {entries.length}
          </span>
        </div>
      </div>
      <div className="space-y-1.5">
        {visible.map(([name, score]) => (
          <ScoreBar
            key={name}
            label={name}
            score={score}
            maxScore={maxScore}
            color={barColor}
          />
        ))}
      </div>
      {entries.length > maxItems && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-2 text-xs text-blue-600 hover:underline"
        >
          {showAll
            ? "Daha az göster"
            : `+${entries.length - maxItems} daha göster`}
        </button>
      )}
    </div>
  );
}

function PreferencesSection({
  preferences,
}: {
  preferences: UserProfile["preferences"];
}) {
  if (!preferences) return null;
  const { topCategories, topBrands, avgPurchasePrice, computedAt } =
    preferences;
  const hasData =
    (topCategories && topCategories.length > 0) ||
    (topBrands && topBrands.length > 0);
  if (!hasData) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-gray-900">
            Hesaplanan Tercihler
          </h3>
        </div>
        {computedAt && (
          <span className="text-[10px] text-gray-400">
            Hesaplandı: {formatTimestamp(computedAt)}
          </span>
        )}
      </div>
      {avgPurchasePrice !== undefined && avgPurchasePrice > 0 && (
        <div className="mb-3 px-3 py-2 bg-amber-50 rounded-lg border border-amber-100">
          <span className="text-xs text-amber-700">
            Ortalama Sepet: <strong>{formatCurrency(avgPurchasePrice)}</strong>
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        {topCategories && topCategories.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Top Kategoriler
            </p>
            <div className="space-y-1">
              {topCategories.map((cat, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-gray-700 truncate pr-2">
                    {cat.category}
                  </span>
                  <span className="text-gray-500 tabular-nums flex-shrink-0">
                    {cat.score.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {topBrands && topBrands.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Top Markalar
            </p>
            <div className="space-y-1">
              {topBrands.map((brand, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-gray-700 truncate pr-2">
                    {brand.brand}
                  </span>
                  <span className="text-gray-500 tabular-nums flex-shrink-0">
                    {brand.score.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// ACTIVITY FEED
// ============================================================================

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const config = ACTIVITY_CONFIG[entry.t] || {
    label: entry.t,
    icon: Activity,
    color: "text-gray-600",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200",
  };
  const Icon = config.icon;
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 ${config.bgColor} border ${config.borderColor} rounded-lg`}
    >
      <div
        className={`w-7 h-7 rounded-md flex items-center justify-center ${config.bgColor} border ${config.borderColor}`}
      >
        <Icon className={`w-3.5 h-3.5 ${config.color}`} />
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span
          className={`text-xs font-semibold ${config.color} whitespace-nowrap`}
        >
          {config.label}
        </span>
        {entry.pn && (
          <span
            className="text-xs text-gray-700 truncate max-w-[200px]"
            title={entry.pn}
          >
            {entry.pn}
          </span>
        )}
        {!entry.pn && entry.pid && (
          <span
            className="text-[10px] text-gray-400 font-mono truncate max-w-[160px]"
            title={entry.pid}
          >
            {entry.pid}
          </span>
        )}
        {entry.q && (
          <span className="text-xs text-gray-700 truncate max-w-[200px]">
            &quot;{entry.q}&quot;
          </span>
        )}
        {entry.cat && !entry.pn && !entry.q && (
          <span className="text-xs text-gray-500 truncate">{entry.cat}</span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {entry.cat && (
          <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded hidden sm:inline">
            {entry.cat}
          </span>
        )}
        {entry.br && (
          <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded hidden sm:inline">
            {entry.br}
          </span>
        )}
        {entry.pr !== undefined && entry.pr !== null && (
          <span className="text-xs font-medium text-gray-700">
            {formatCurrency(entry.pr)}
          </span>
        )}
        <span className="text-[10px] text-gray-400 w-16 text-right">
          {formatTimestamp(entry.ts)}
        </span>
      </div>
    </div>
  );
}

function ActivityFeed({ activities }: { activities: ActivityEntry[] }) {
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const activityCounts = activities.reduce(
    (acc, a) => {
      acc[a.t] = (acc[a.t] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const filtered =
    selectedTypes.size > 0
      ? activities.filter((a) => selectedTypes.has(a.t))
      : activities;

  const toggleType = (type: string) => {
    if (type === "all") {
      setSelectedTypes(new Set());
    } else {
      setSelectedTypes((prev) => {
        const next = new Set(prev);
        if (next.has(type)) next.delete(type);
        else next.add(type);
        return next;
      });
    }
  };

  if (activities.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
        <Activity className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500">Henüz aktivite kaydı yok</p>
        <p className="text-[10px] text-gray-400 mt-1">
          Kullanıcı etkileşimde bulundukça burada görünecek (son 50)
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900">
              Son Aktiviteler
            </h3>
            <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
              {selectedTypes.size > 0
                ? `${filtered.length} / ${activities.length}`
                : `${activities.length}`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => toggleType("all")}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${selectedTypes.size === 0 ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            <Filter className="w-3 h-3" />
            Tümü
          </button>
          {Object.entries(ACTIVITY_CONFIG).map(([type, config]) => {
            const count = activityCounts[type] || 0;
            if (count === 0) return null;
            const TypeIcon = config.icon;
            const isSelected = selectedTypes.has(type);
            return (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${isSelected ? `${config.bgColor} ${config.color} border ${config.borderColor}` : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
              >
                <TypeIcon className="w-3 h-3" />
                {config.label}
                <span
                  className={`text-[10px] ${isSelected ? "opacity-70" : "text-gray-400"}`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="divide-y divide-gray-100">
        {filtered.length > 0 ? (
          filtered.map((entry, idx) => (
            <div key={`${entry.ts}-${entry.t}-${idx}`} className="px-2 py-1">
              <ActivityRow entry={entry} />
            </div>
          ))
        ) : (
          <div className="p-6 text-center">
            <Filter className="w-6 h-6 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">
              Seçilen filtreye uygun aktivite yok
            </p>
            <button
              onClick={() => setSelectedTypes(new Set())}
              className="mt-2 text-xs text-blue-600 hover:underline"
            >
              Filtreyi temizle
            </button>
          </div>
        )}
      </div>
      <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
        <p className="text-[10px] text-gray-400 text-center">
          Son 50 aktivite gösteriliyor · Detaylı geçmiş için GA4 User Explorer
          kullanın
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function UserActivityPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const searchUsers = useCallback(async (queryStr: string) => {
    if (queryStr.length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const q = query(
        collection(db, "users"),
        where("displayName", ">=", queryStr),
        where("displayName", "<=", queryStr + "\uf8ff"),
        limit(8),
      );
      const snapshot = await getDocs(q);
      setSearchResults(
        snapshot.docs.map((d) => ({
          id: d.id,
          displayName: d.data().displayName || "İsimsiz",
          email: d.data().email,
        })),
      );
      setShowSearchDropdown(true);
    } catch (error) {
      console.error("Search error:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }
    const timer = setTimeout(() => searchUsers(searchQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchUsers]);

  const loadProfile = useCallback(
    async (userId: string, displayName: string, email?: string) => {
      setSearchQuery("");
      setSearchResults([]);
      setShowSearchDropdown(false);
      setIsLoadingProfile(true);
      setProfileError(null);
      setSelectedUser({ id: userId, displayName, email });
      try {
        const profileDoc = await getDoc(doc(db, "user_profiles", userId));
        if (profileDoc.exists()) {
          setSelectedUser({
            id: userId,
            displayName,
            email,
            ...profileDoc.data(),
          } as UserProfile);
        } else {
          setSelectedUser({ id: userId, displayName, email, stats: {} });
        }
      } catch (error) {
        console.error("Error loading profile:", error);
        setProfileError("Profil yüklenirken hata oluştu");
      } finally {
        setIsLoadingProfile(false);
      }
    },
    [],
  );

  const refreshProfile = useCallback(() => {
    if (selectedUser)
      loadProfile(
        selectedUser.id,
        selectedUser.displayName || "",
        selectedUser.email,
      );
  }, [selectedUser, loadProfile]);

  useEffect(() => {
    const handler = () => setShowSearchDropdown(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  const stats = selectedUser?.stats || {};
  const categoryEntries = sortedEntries(selectedUser?.categoryScores);
  const subcategoryEntries = sortedEntries(selectedUser?.subcategoryScores);
  const brandEntries = sortedEntries(selectedUser?.brandScores);
  const genderEntries = sortedEntries(selectedUser?.genderScores);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 py-2">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push("/")}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-gray-600" />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                  <BarChart3 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h1 className="text-sm font-bold text-gray-900">
                    Kullanıcı Aktiviteleri
                  </h1>
                  <p className="text-[10px] text-gray-500">
                    Skorlar, tercihler & son aktiviteler
                  </p>
                </div>
              </div>
              <div
                className="flex-1 max-w-md ml-4 relative"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Kullanıcı ara..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() =>
                      searchResults.length > 0 && setShowSearchDropdown(true)
                    }
                    className="w-full pl-9 pr-4 py-1.5 bg-gray-100 border border-transparent rounded-lg text-sm focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                  {isSearching && (
                    <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 animate-spin" />
                  )}
                </div>
                {showSearchDropdown && searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50">
                    {searchResults.map((result) => (
                      <button
                        key={result.id}
                        onClick={() =>
                          loadProfile(
                            result.id,
                            result.displayName,
                            result.email,
                          )
                        }
                        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center">
                          <User className="w-3.5 h-3.5 text-blue-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {result.displayName}
                          </p>
                          {result.email && (
                            <p className="text-xs text-gray-500 truncate">
                              {result.email}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedUser && (
                <button
                  onClick={refreshProfile}
                  disabled={isLoadingProfile}
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                  title="Yenile"
                >
                  <RefreshCw
                    className={`w-4 h-4 text-gray-600 ${isLoadingProfile ? "animate-spin" : ""}`}
                  />
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-4">
          {isLoadingProfile ? (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
              <RefreshCw className="w-6 h-6 text-gray-400 animate-spin mx-auto mb-2" />
              <p className="text-sm text-gray-500">Profil yükleniyor...</p>
            </div>
          ) : profileError ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
              <AlertCircle className="w-6 h-6 text-red-500 mx-auto mb-2" />
              <p className="text-red-700 text-sm">{profileError}</p>
              <button
                onClick={refreshProfile}
                className="mt-2 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-xs"
              >
                Tekrar Dene
              </button>
            </div>
          ) : selectedUser ? (
            <div className="space-y-4">
              {/* User Header */}
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-bold text-gray-900 truncate">
                      {selectedUser.displayName || "İsimsiz"}
                    </h2>
                    <p className="text-xs text-gray-500 truncate">
                      {selectedUser.email || selectedUser.id}
                    </p>
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                      UID: {selectedUser.id}
                    </p>
                  </div>
                  {selectedUser.lastActivityAt && (
                    <div className="text-right flex-shrink-0">
                      <p className="text-[10px] text-gray-400">Son Aktivite</p>
                      <p className="text-xs text-gray-600">
                        {formatTimestamp(selectedUser.lastActivityAt)}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                <StatCard
                  icon={Activity}
                  label="Toplam Etkinlik"
                  value={stats.totalEvents || 0}
                  color="blue"
                />
                <StatCard
                  icon={CreditCard}
                  label="Satın Alma"
                  value={stats.totalPurchases || 0}
                  color="green"
                />
                <StatCard
                  icon={TrendingUp}
                  label="Harcama"
                  value={
                    stats.totalSpent ? formatCurrency(stats.totalSpent) : "₺0"
                  }
                  color="emerald"
                />
                <StatCard
                  icon={Eye}
                  label="Görüntüleme"
                  value={stats.totalViews || 0}
                  color="indigo"
                />
                <StatCard
                  icon={Target}
                  label="Tıklama"
                  value={stats.totalClicks || 0}
                  color="orange"
                />
                <StatCard
                  icon={ShoppingCart}
                  label="Sepete Ekleme"
                  value={stats.totalCartAdds || 0}
                  color="purple"
                />
                <StatCard
                  icon={Heart}
                  label="Favori"
                  value={stats.totalFavorites || 0}
                  color="pink"
                />
                <StatCard
                  icon={SearchIcon}
                  label="Arama"
                  value={stats.totalSearches || 0}
                  color="red"
                />
              </div>

              {/* Activity Feed */}
              <ActivityFeed activities={selectedUser.recentActivity || []} />

              {/* Preferences */}
              <PreferencesSection preferences={selectedUser.preferences} />

              {/* Score Sections */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ScoreSection
                  title="Kategori Skorları"
                  icon={Tag}
                  iconColor="text-blue-500"
                  entries={categoryEntries}
                  barColor="bg-blue-500"
                />
                <ScoreSection
                  title="Marka Skorları"
                  icon={Hash}
                  iconColor="text-purple-500"
                  entries={brandEntries}
                  barColor="bg-purple-500"
                />
                <ScoreSection
                  title="Alt Kategori Skorları"
                  icon={Layers}
                  iconColor="text-cyan-500"
                  entries={subcategoryEntries}
                  barColor="bg-cyan-500"
                />
                <ScoreSection
                  title="Cinsiyet Skorları"
                  icon={Target}
                  iconColor="text-amber-500"
                  entries={genderEntries}
                  barColor="bg-amber-500"
                />
              </div>

              {/* GA4 Link */}
              <div className="bg-gray-100 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ExternalLink className="w-4 h-4 text-gray-500" />
                  <span className="text-xs text-gray-600">
                    Detaylı olay geçmişi için GA4 User Explorer kullanın
                  </span>
                </div>
                <a
                  href="https://analytics.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline font-medium"
                >
                  GA4&apos;ü Aç →
                </a>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
              <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Search className="w-7 h-7 text-gray-400" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-1">
                Kullanıcı Seçin
              </h3>
              <p className="text-sm text-gray-500 max-w-xs mx-auto">
                Profil ve aktiviteleri görüntülemek için yukarıdaki arama
                kutusunu kullanın
              </p>
            </div>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
