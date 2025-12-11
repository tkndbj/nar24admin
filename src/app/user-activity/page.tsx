"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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
  Clock,
  Package,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  Calendar,
  Hash,
  Tag,
  Store,
  X,
  Filter,
  BarChart3,
} from "lucide-react";
import {
  collection,
  query,
  where,
  orderBy,
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
  orderId?: string;
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
  dateShard?: string;
}

interface SearchResult {
  id: string;
  displayName: string;
  email?: string;
  photoURL?: string;
}

interface PaginationState {
  lastTimestamp: number | null;
  lastDateShard: string | null;
  currentDateShard: string | null;
  hasMore: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ACTIVITY_CONFIG: Record<string, { 
  label: string; 
  icon: React.ElementType; 
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  click: { 
    label: "Tıklama", 
    icon: MousePointer, 
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200"
  },
  view: { 
    label: "Görüntüleme", 
    icon: Eye, 
    color: "text-indigo-600",
    bgColor: "bg-indigo-50",
    borderColor: "border-indigo-200"
  },
  addToCart: { 
    label: "Sepete Ekleme", 
    icon: ShoppingCart, 
    color: "text-green-600",
    bgColor: "bg-green-50",
    borderColor: "border-green-200"
  },
  removeFromCart: { 
    label: "Sepetten Çıkarma", 
    icon: Trash2, 
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200"
  },
  favorite: { 
    label: "Favori", 
    icon: Heart, 
    color: "text-pink-600",
    bgColor: "bg-pink-50",
    borderColor: "border-pink-200"
  },
  unfavorite: { 
    label: "Favori Kaldırma", 
    icon: Heart, 
    color: "text-gray-500",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200"
  },
  purchase: { 
    label: "Satın Alma", 
    icon: CreditCard, 
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200"
  },
  search: { 
    label: "Arama", 
    icon: SearchIcon, 
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200"
  },
};

const PAGE_SIZE = 50;
const RETENTION_DAYS = 90;
const MAX_SHARDS_PER_LOAD = 30;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatTimestamp(timestamp: number | Timestamp): string {
  const date = typeof timestamp === "number" 
    ? new Date(timestamp) 
    : timestamp.toDate();
  
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  if (diff < 60000) return "Az önce";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}dk`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}sa`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}g`;
  
  return date.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function getDateShard(date: Date): string {
  return date.toISOString().split("T")[0];
}

function getPreviousDateShard(dateShard: string): string {
  const date = new Date(dateShard);
  date.setDate(date.getDate() - 1);
  return getDateShard(date);
}

function getCutoffDateShard(): string {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  return getDateShard(cutoff);
}

// ============================================================================
// COMPONENTS
// ============================================================================

function CompactActivityRow({ event, onClick }: { event: ActivityEvent; onClick?: () => void }) {
  const config = ACTIVITY_CONFIG[event.type] || { 
    label: event.type, 
    icon: Activity, 
    color: "text-gray-600",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200"
  };
  const Icon = config.icon;

  return (
    <div 
      className={`flex items-center gap-3 px-3 py-2 ${config.bgColor} border ${config.borderColor} rounded-lg hover:shadow-sm transition-all cursor-pointer group`}
      onClick={onClick}
    >
      {/* Icon */}
      <div className={`w-7 h-7 rounded-md flex items-center justify-center ${config.bgColor} border ${config.borderColor}`}>
        <Icon className={`w-3.5 h-3.5 ${config.color}`} />
      </div>

      {/* Main Info */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className={`text-xs font-semibold ${config.color} whitespace-nowrap`}>
          {config.label}
        </span>
        
        {event.productName && (
          <span className="text-xs text-gray-700 truncate max-w-[200px]" title={event.productName}>
            {event.productName}
          </span>
        )}
        
        {event.searchQuery && (
          <span className="text-xs text-gray-700 truncate max-w-[200px]">
            &quot;{event.searchQuery}&quot;
          </span>
        )}
        
        {event.category && !event.productName && (
          <span className="text-xs text-gray-500 truncate">
            {event.category}
          </span>
        )}
      </div>

      {/* Meta Info */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {event.price !== undefined && (
          <span className="text-xs font-medium text-gray-700">
            {formatCurrency(event.price)}
          </span>
        )}
        
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
          event.weight > 0 
            ? "bg-green-100 text-green-700" 
            : event.weight < 0 
            ? "bg-red-100 text-red-700"
            : "bg-gray-100 text-gray-600"
        }`}>
          {event.weight > 0 ? "+" : ""}{event.weight}
        </span>
        
        <span className="text-[10px] text-gray-400 w-12 text-right">
          {formatTimestamp(event.timestamp)}
        </span>
      </div>
    </div>
  );
}

function ActivityDetailModal({ 
  event, 
  onClose 
}: { 
  event: ActivityEvent; 
  onClose: () => void;
}) {
  const config = ACTIVITY_CONFIG[event.type] || { 
    label: event.type, 
    icon: Activity, 
    color: "text-gray-600",
    bgColor: "bg-gray-50"
  };
  const Icon = config.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className={`${config.bgColor} px-4 py-3 rounded-t-xl border-b flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <Icon className={`w-5 h-5 ${config.color}`} />
            <span className={`font-semibold ${config.color}`}>{config.label}</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/50 rounded">
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* Timestamp */}
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-gray-600">
              {new Date(event.timestamp).toLocaleString("tr-TR")}
            </span>
          </div>

          {/* Product */}
          {event.productId && (
            <div className="flex items-start gap-2 text-sm">
              <Package className="w-4 h-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-gray-900 font-medium">{event.productName || "Ürün"}</p>
                <p className="text-xs text-gray-500 font-mono">{event.productId}</p>
              </div>
            </div>
          )}

          {/* Shop */}
          {event.shopId && (
            <div className="flex items-center gap-2 text-sm">
              <Store className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600 font-mono text-xs">{event.shopId}</span>
            </div>
          )}

          {/* Category */}
          {event.category && (
            <div className="flex items-center gap-2 text-sm">
              <Tag className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600">
                {event.category}
                {event.subcategory && ` → ${event.subcategory}`}
              </span>
            </div>
          )}

          {/* Brand */}
          {event.brand && (
            <div className="flex items-center gap-2 text-sm">
              <Hash className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600">{event.brand}</span>
            </div>
          )}

          {/* Search Query */}
          {event.searchQuery && (
            <div className="flex items-center gap-2 text-sm">
              <SearchIcon className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600">&quot;{event.searchQuery}&quot;</span>
            </div>
          )}

          {/* Price & Quantity */}
          {event.price !== undefined && (
            <div className="flex items-center gap-4 text-sm pt-2 border-t">
              <div>
                <span className="text-gray-500">Fiyat: </span>
                <span className="font-semibold text-gray-900">{formatCurrency(event.price)}</span>
              </div>
              {event.quantity && event.quantity > 1 && (
                <div>
                  <span className="text-gray-500">Adet: </span>
                  <span className="font-semibold text-gray-900">{event.quantity}</span>
                </div>
              )}
              {event.totalValue && event.totalValue !== event.price && (
                <div>
                  <span className="text-gray-500">Toplam: </span>
                  <span className="font-semibold text-emerald-600">{formatCurrency(event.totalValue)}</span>
                </div>
              )}
            </div>
          )}

          {/* Weight */}
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-sm text-gray-500">Puan Etkisi</span>
            <span className={`text-sm font-bold px-2 py-1 rounded ${
              event.weight > 0 
                ? "bg-green-100 text-green-700" 
                : event.weight < 0 
                ? "bg-red-100 text-red-700"
                : "bg-gray-100 text-gray-600"
            }`}>
              {event.weight > 0 ? "+" : ""}{event.weight} puan
            </span>
          </div>

          {/* Date Shard (debug info) */}
          {event.dateShard && (
            <div className="text-[10px] text-gray-400 pt-2 border-t">
              Shard: {event.dateShard}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CompactStatsBar({ profile }: { profile: UserProfile }) {
  const stats = profile.stats || {};
  const preferences = profile.preferences || {};

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 mb-4">
      <div className="flex items-center justify-between gap-4">
        {/* User Info */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 text-sm truncate">
              {profile.displayName || "İsimsiz"}
            </h3>
            <p className="text-xs text-gray-500 truncate">{profile.email || profile.id}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-center px-3 py-1 bg-blue-50 rounded-lg">
            <p className="text-lg font-bold text-blue-600">{stats.totalEvents || 0}</p>
            <p className="text-[10px] text-blue-600/70">Etkinlik</p>
          </div>
          <div className="text-center px-3 py-1 bg-green-50 rounded-lg">
            <p className="text-lg font-bold text-green-600">{stats.totalPurchases || 0}</p>
            <p className="text-[10px] text-green-600/70">Satın Alma</p>
          </div>
          <div className="text-center px-3 py-1 bg-emerald-50 rounded-lg">
            <p className="text-lg font-bold text-emerald-600">
              {stats.totalSpent ? formatCurrency(stats.totalSpent) : "₺0"}
            </p>
            <p className="text-[10px] text-emerald-600/70">Harcama</p>
          </div>
          <div className="text-center px-3 py-1 bg-purple-50 rounded-lg">
            <p className="text-lg font-bold text-purple-600">
              {preferences.avgPurchasePrice ? formatCurrency(preferences.avgPurchasePrice) : "—"}
            </p>
            <p className="text-[10px] text-purple-600/70">Ort. Sepet</p>
          </div>
        </div>
      </div>

      {/* Top Categories & Brands - Compact */}
      {(preferences.topCategories?.length || preferences.topBrands?.length) && (
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
          {preferences.topCategories && preferences.topCategories.length > 0 && (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <Tag className="w-3 h-3 text-gray-400 flex-shrink-0" />
              <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                {preferences.topCategories.slice(0, 4).map((cat, idx) => (
                  <span 
                    key={idx}
                    className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded whitespace-nowrap"
                  >
                    {cat.category}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {preferences.topBrands && preferences.topBrands.length > 0 && (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <Hash className="w-3 h-3 text-gray-400 flex-shrink-0" />
              <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                {preferences.topBrands.slice(0, 4).map((brand, idx) => (
                  <span 
                    key={idx}
                    className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded whitespace-nowrap"
                  >
                    {brand.brand}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActivityTypeFilter({
  selectedTypes,
  onToggle,
  activities,
}: {
  selectedTypes: Set<string>;
  onToggle: (type: string) => void;
  activities: ActivityEvent[];
}) {
  const allTypes = Object.keys(ACTIVITY_CONFIG);
  
  // Calculate counts from actual loaded activities
  const activityCounts = activities.reduce((acc, activity) => {
    acc[activity.type] = (acc[activity.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-hide">
      <button
        onClick={() => onToggle("all")}
        className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
          selectedTypes.size === 0 
            ? "bg-gray-900 text-white" 
            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
        }`}
      >
        <Filter className="w-3 h-3" />
        Tümü ({activities.length})
      </button>
      {allTypes.map((type) => {
        const config = ACTIVITY_CONFIG[type];
        const Icon = config.icon;
        const isSelected = selectedTypes.has(type);
        const count = activityCounts[type] || 0;
        
        if (count === 0) return null; // Hide types with no activities
        
        return (
          <button
            key={type}
            onClick={() => onToggle(type)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
              isSelected 
                ? `${config.bgColor} ${config.color} border ${config.borderColor}` 
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            <Icon className="w-3 h-3" />
            {config.label}
            <span className={`text-[10px] ${isSelected ? "opacity-70" : "text-gray-400"}`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function UserActivityPage() {
  const router = useRouter();
  const activitiesContainerRef = useRef<HTMLDivElement>(null);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  
  // Selected user state
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  const [activitiesError, setActivitiesError] = useState<string | null>(null);
  
  // Pagination state
  const [pagination, setPagination] = useState<PaginationState>({
    lastTimestamp: null,
    lastDateShard: null,
    currentDateShard: null,
    hasMore: true,
  });
  
  // Filter state - filters are client-side only
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  
  // Detail modal
  const [selectedEvent, setSelectedEvent] = useState<ActivityEvent | null>(null);

  // Search users by displayName
  const searchUsers = useCallback(async (queryStr: string) => {
    if (queryStr.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);

    try {
      const usersRef = collection(db, "users");
      const q = query(
        usersRef,
        where("displayName", ">=", queryStr),
        where("displayName", "<=", queryStr + "\uf8ff"),
        limit(8)
      );

      const snapshot = await getDocs(q);
      const results: SearchResult[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        displayName: docSnap.data().displayName || "İsimsiz",
        email: docSnap.data().email,
        photoURL: docSnap.data().photoURL,
      }));

      setSearchResults(results);
      setShowSearchDropdown(true);
    } catch (error) {
      console.error("Search error:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }

    const timer = setTimeout(() => {
      searchUsers(searchQuery.trim());
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchUsers]);

  // Load activities with cross-shard pagination
  const loadActivities = useCallback(async (
    userId: string,
    paginationState: PaginationState,
    append: boolean = false
  ) => {
    setIsLoadingActivities(true);
    setActivitiesError(null);

    try {
      const newActivities: ActivityEvent[] = [];
      
      // Determine starting point
      let currentDateShard = paginationState.currentDateShard || getDateShard(new Date());
      let lastTimestamp = paginationState.lastTimestamp;
      const cutoffDateShard = getCutoffDateShard();
      
      let shardsChecked = 0;
      let remainingToFetch = PAGE_SIZE;
      let reachedCutoff = false;

      // Query across multiple date shards
      while (remainingToFetch > 0 && !reachedCutoff && shardsChecked < MAX_SHARDS_PER_LOAD) {
        // Check if we've gone past the cutoff
        if (currentDateShard < cutoffDateShard) {
          reachedCutoff = true;
          break;
        }

        try {
          const eventsRef = collection(db, "activity_events", currentDateShard, "events");
          
          let q;
          if (lastTimestamp && shardsChecked === 0 && append) {
            // Continuing from previous load - get events BEFORE the last timestamp
            q = query(
              eventsRef,
              where("userId", "==", userId),
              where("timestamp", "<", lastTimestamp),
              orderBy("timestamp", "desc"),
              limit(remainingToFetch)
            );
          } else if (shardsChecked === 0 && append) {
            // Same shard but no timestamp (shouldn't happen, but handle it)
            q = query(
              eventsRef,
              where("userId", "==", userId),
              orderBy("timestamp", "desc"),
              limit(remainingToFetch)
            );
          } else {
            // New shard or initial load
            q = query(
              eventsRef,
              where("userId", "==", userId),
              orderBy("timestamp", "desc"),
              limit(remainingToFetch)
            );
          }

          const snapshot = await getDocs(q);
          
          for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            const event: ActivityEvent = {
              id: docSnap.id,
              ...data,
              dateShard: currentDateShard,
            } as ActivityEvent;
            
            newActivities.push(event);
          }

          remainingToFetch = PAGE_SIZE - newActivities.length;
        } catch {
          // Shard might not exist, continue to previous day
          console.log(`No data in shard ${currentDateShard}`);
        }

        // Move to previous day for next iteration
        currentDateShard = getPreviousDateShard(currentDateShard);
        lastTimestamp = null; // Reset for new shard
        shardsChecked++;
      }

      // Sort all new activities by timestamp descending
      newActivities.sort((a, b) => b.timestamp - a.timestamp);

      // Update activities state
      if (append) {
        setActivities(prev => {
          // Create a Set of existing IDs to prevent duplicates
          const existingIds = new Set(prev.map(a => `${a.dateShard}-${a.id}`));
          const uniqueNew = newActivities.filter(a => !existingIds.has(`${a.dateShard}-${a.id}`));
          return [...prev, ...uniqueNew];
        });
      } else {
        setActivities(newActivities);
      }
      
      // Update pagination state
      const lastActivity = newActivities[newActivities.length - 1];
      
      // Determine if there's more to load
      const hasMoreToLoad = !reachedCutoff && 
        newActivities.length > 0 && 
        currentDateShard >= cutoffDateShard;
      
      setPagination({
        lastTimestamp: lastActivity?.timestamp || null,
        lastDateShard: lastActivity?.dateShard || null,
        currentDateShard: currentDateShard, // Next shard to query
        hasMore: hasMoreToLoad,
      });

    } catch (error) {
      console.error("Error loading activities:", error);
      setActivitiesError("Aktiviteler yüklenirken hata oluştu");
    } finally {
      setIsLoadingActivities(false);
    }
  }, []);

  // Load user profile
  const loadUserProfile = useCallback(async (userId: string): Promise<UserProfile | null> => {
    try {
      const profileDoc = await getDoc(doc(db, "user_profiles", userId));
      if (profileDoc.exists()) {
        return { id: userId, ...profileDoc.data() } as UserProfile;
      }
      return null;
    } catch (error) {
      console.error("Error loading profile:", error);
      return null;
    }
  }, []);

  // Select user
  const selectUser = useCallback(async (userId: string, displayName: string, email?: string) => {
    setSearchQuery("");
    setSearchResults([]);
    setShowSearchDropdown(false);
    setActivities([]);
    setSelectedTypes(new Set());
    
    // Set initial user data
    setSelectedUser({ id: userId, displayName, email });
    
    // Reset pagination
    const initialPagination: PaginationState = {
      lastTimestamp: null,
      lastDateShard: null,
      currentDateShard: null,
      hasMore: true,
    };
    setPagination(initialPagination);

    // Load profile in background
    const profile = await loadUserProfile(userId);
    if (profile) {
      setSelectedUser(prev => ({ ...prev, ...profile }));
    }

    // Load initial activities
    await loadActivities(userId, initialPagination, false);
  }, [loadActivities, loadUserProfile]);

  // Load more activities
  const loadMore = useCallback(() => {
    if (selectedUser && pagination.hasMore && !isLoadingActivities) {
      loadActivities(selectedUser.id, pagination, true);
    }
  }, [selectedUser, pagination, isLoadingActivities, loadActivities]);

  // Refresh activities
  const refreshActivities = useCallback(() => {
    if (selectedUser) {
      setActivities([]);
      const initialPagination: PaginationState = {
        lastTimestamp: null,
        lastDateShard: null,
        currentDateShard: null,
        hasMore: true,
      };
      setPagination(initialPagination);
      loadActivities(selectedUser.id, initialPagination, false);
    }
  }, [selectedUser, loadActivities]);

  // Toggle filter type (client-side filtering only)
  const toggleFilterType = useCallback((type: string) => {
    if (type === "all") {
      setSelectedTypes(new Set());
    } else {
      setSelectedTypes(prev => {
        const newSet = new Set(prev);
        if (newSet.has(type)) {
          newSet.delete(type);
        } else {
          newSet.add(type);
        }
        return newSet;
      });
    }
  }, []);

  // Filtered activities (client-side)
  const filteredActivities = selectedTypes.size > 0
    ? activities.filter(a => selectedTypes.has(a.type))
    : activities;

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setShowSearchDropdown(false);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Compact Header */}
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
                  <h1 className="text-sm font-bold text-gray-900">Kullanıcı Aktiviteleri</h1>
                  <p className="text-[10px] text-gray-500">Son {RETENTION_DAYS} gün</p>
                </div>
              </div>

              {/* Search Bar - Inline in Header */}
              <div className="flex-1 max-w-md ml-4 relative" onClick={(e) => e.stopPropagation()}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Kullanıcı ara..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => searchResults.length > 0 && setShowSearchDropdown(true)}
                    className="w-full pl-9 pr-4 py-1.5 bg-gray-100 border border-transparent rounded-lg text-sm focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                  {isSearching && (
                    <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 animate-spin" />
                  )}
                </div>

                {/* Search Dropdown */}
                {showSearchDropdown && searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50">
                    {searchResults.map((result) => (
                      <button
                        key={result.id}
                        onClick={() => selectUser(result.id, result.displayName, result.email)}
                        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center">
                          <User className="w-3.5 h-3.5 text-blue-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{result.displayName}</p>
                          {result.email && (
                            <p className="text-xs text-gray-500 truncate">{result.email}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Refresh Button */}
              {selectedUser && (
                <button
                  onClick={refreshActivities}
                  disabled={isLoadingActivities}
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                  title="Yenile"
                >
                  <RefreshCw className={`w-4 h-4 text-gray-600 ${isLoadingActivities ? "animate-spin" : ""}`} />
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 py-4">
          {selectedUser ? (
            <>
              {/* Compact Stats Bar */}
              <CompactStatsBar profile={selectedUser} />
              
              {/* Filters - counts calculated from loaded activities */}
              <div className="bg-white border border-gray-200 rounded-lg p-2 mb-4">
                <ActivityTypeFilter
                  selectedTypes={selectedTypes}
                  onToggle={toggleFilterType}
                  activities={activities}
                />
              </div>

              {/* Activities List */}
              {activitiesError ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
                  <AlertCircle className="w-6 h-6 text-red-500 mx-auto mb-2" />
                  <p className="text-red-700 text-sm">{activitiesError}</p>
                  <button
                    onClick={refreshActivities}
                    className="mt-2 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-xs"
                  >
                    Tekrar Dene
                  </button>
                </div>
              ) : (
                <div 
                  ref={activitiesContainerRef}
                  className="bg-white border border-gray-200 rounded-lg overflow-hidden"
                >
                  {/* Activity Count Header */}
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-gray-500" />
                      <span className="text-xs font-medium text-gray-700">
                        {selectedTypes.size > 0 
                          ? `${filteredActivities.length} / ${activities.length} aktivite (filtrelenmiş)`
                          : `${activities.length} aktivite yüklendi`
                        }
                      </span>
                    </div>
                    {pagination.lastDateShard && (
                      <span className="text-[10px] text-gray-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Son: {pagination.lastDateShard}
                      </span>
                    )}
                  </div>

                  {/* Activities */}
                  <div className="divide-y divide-gray-100">
                    {filteredActivities.length > 0 ? (
                      <>
                        {filteredActivities.map((activity, index) => (
                          <div key={`${activity.dateShard}-${activity.id}-${index}`} className="px-2 py-1">
                            <CompactActivityRow 
                              event={activity} 
                              onClick={() => setSelectedEvent(activity)}
                            />
                          </div>
                        ))}
                        
                        {/* Load More - only show when not filtering or when filter matches all */}
                        {pagination.hasMore && (
                          <div className="p-3">
                            <button
                              onClick={loadMore}
                              disabled={isLoadingActivities}
                              className="w-full py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-gray-700 text-xs font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                              {isLoadingActivities ? (
                                <>
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                  Yükleniyor...
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="w-3 h-3" />
                                  Daha Fazla Yükle
                                </>
                              )}
                            </button>
                          </div>
                        )}
                        
                        {!pagination.hasMore && activities.length > 0 && (
                          <p className="text-center text-[10px] text-gray-400 py-3">
                            ✓ Tüm aktiviteler yüklendi ({activities.length} adet)
                          </p>
                        )}
                      </>
                    ) : isLoadingActivities ? (
                      <div className="p-8 text-center">
                        <RefreshCw className="w-6 h-6 text-gray-400 animate-spin mx-auto mb-2" />
                        <p className="text-xs text-gray-500">Yükleniyor...</p>
                      </div>
                    ) : selectedTypes.size > 0 ? (
                      <div className="p-8 text-center">
                        <Filter className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">Seçilen filtreye uygun aktivite yok</p>
                        <button
                          onClick={() => setSelectedTypes(new Set())}
                          className="mt-2 text-xs text-blue-600 hover:underline"
                        >
                          Filtreyi temizle
                        </button>
                      </div>
                    ) : (
                      <div className="p-8 text-center">
                        <Activity className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">Aktivite bulunamadı</p>
                        <p className="text-[10px] text-gray-400 mt-1">
                          Son {RETENTION_DAYS} gün içinde kayıt yok
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Empty State */
            <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
              <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Search className="w-7 h-7 text-gray-400" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-1">
                Kullanıcı Seçin
              </h3>
              <p className="text-sm text-gray-500 max-w-xs mx-auto">
                Aktiviteleri görüntülemek için yukarıdaki arama kutusunu kullanın
              </p>
            </div>
          )}
        </main>

        {/* Detail Modal */}
        {selectedEvent && (
          <ActivityDetailModal
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
          />
        )}
      </div>
    </ProtectedRoute>
  );
}