"use client";

import { useState, useEffect } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  Send,
  Users,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Loader2,
  Store,
  Megaphone,
  FileText,
  Eye,
  Trash2,
  Clock,
  AlertTriangle,
  TrendingUp,
  BarChart3,
  Activity,
  RefreshCw,
} from "lucide-react";
import {
  collection,
  getDocs,
  doc,
  Timestamp,
  addDoc,
  query,
  orderBy,
  writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useRouter } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";

interface ShopMember {
  userId: string;
  role: string;
  shopId: string;
  shopName: string;
}

interface ShopData {
  id: string;
  name: string;
  ownerId: string;
  coOwners?: string[];
  editors?: string[];
  viewers?: string[];
  isActive?: boolean;
  createdAt?: Timestamp;
}

interface Campaign {
  id: string;
  name: string;
  description: string;
  createdAt: Timestamp;
  targetAudience: string;
  notificationsSent: number;
  isActive: boolean;
  stats?: {
    uniqueRecipientsCount: number;
    totalShopMemberships: number;
    activeShopsCount: number;
    roleDistribution: {
      owners: number;
      coOwners: number;
      editors: number;
      viewers: number;
    };
  };
}

interface DeletionStatus {
  found: boolean;
  queueId?: string;
  status?: string;
  campaignId?: string;
  campaignName?: string;
  totalProducts?: number;
  productsProcessed?: number;
  productsReverted?: number;
  productsFailed?: number;
  progress?: number;
  retryCount?: number;
  maxRetries?: number;
  errors?: Array<{ message: string; timestamp: Timestamp }>;
  lastError?: string;
  estimatedTimeRemaining?: {
    seconds: number;
    minutes: number;
  };
  message?: string;
}

const emojis = [
  {
    category: "Campaign",
    emojis: ["🎉", "🎊", "🎈", "🎁", "💫", "⭐", "🌟", "✨"],
  },
  {
    category: "Shopping",
    emojis: ["🛍️", "🛒", "💳", "💰", "💎", "🏷️", "🔥", "⚡"],
  },
  {
    category: "Fashion",
    emojis: ["👗", "👔", "👕", "👖", "👠", "👜", "💄", "💍"],
  },
  {
    category: "Food",
    emojis: ["🍕", "🍔", "🍰", "🍪", "☕", "🍺", "🥂", "🍷"],
  },
  {
    category: "Tech",
    emojis: ["📱", "💻", "⌚", "🎧", "📷", "🖥️", "⚙️", "🔧"],
  },
  {
    category: "Hearts",
    emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍"],
  },
  {
    category: "Nature",
    emojis: ["🌸", "🌺", "🌻", "🌷", "🌹", "🍀", "🌿", "🌱"],
  },
  {
    category: "Faces",
    emojis: ["😊", "😍", "🥳", "😎", "🤩", "😋", "🤗", "😘"],
  },
];

export default function CreateCampaignPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // Shop member states
  const [shopMembers, setShopMembers] = useState<ShopMember[]>([]);
  const [uniqueShopMembers, setUniqueShopMembers] = useState<string[]>([]);
  const [shopMemberStats, setShopMemberStats] = useState({
    totalUniqueMembers: 0,
    owners: 0,
    coOwners: 0,
    editors: 0,
    viewers: 0,
    activeShops: 0,
    totalShops: 0,
  });
  const [fetchingMembers, setFetchingMembers] = useState(true);

  // Campaign states
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [fetchingCampaigns, setFetchingCampaigns] = useState(true);
  const [deletingCampaignId, setDeletingCampaignId] = useState<string | null>(
    null
  );
  const [deletionStatus, setDeletionStatus] = useState<
    Record<string, DeletionStatus>
  >({});
  const [pollingIntervals, setPollingIntervals] = useState<
    Record<string, NodeJS.Timeout>
  >({});

  // Form states
  const [campaignName, setCampaignName] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");
  const [activeField, setActiveField] = useState<"name" | "description" | null>(
    null
  );

  // Fetch campaigns
  useEffect(() => {
    const fetchCampaigns = async () => {
      try {
        setFetchingCampaigns(true);
        const campaignsRef = collection(db, "campaigns");
        const q = query(campaignsRef, orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);

        const campaignsList: Campaign[] = [];
        snapshot.docs.forEach((doc) => {
          campaignsList.push({
            id: doc.id,
            ...doc.data(),
          } as Campaign);
        });

        setCampaigns(campaignsList);
      } catch (err) {
        console.error("Error fetching campaigns:", err);
        setError("Kampanyalar alınamadı");
      } finally {
        setFetchingCampaigns(false);
      }
    };

    fetchCampaigns();
  }, []);

  // Fetch shop members
  useEffect(() => {
    const fetchShopMembers = async () => {
      try {
        setFetchingMembers(true);
        setError("");

        console.log("🔍 Starting shop member fetch...");

        const shopsRef = collection(db, "shops");
        const shopsSnapshot = await getDocs(shopsRef);

        if (shopsSnapshot.empty) {
          console.warn("⚠️ No shops found");
          setShopMembers([]);
          setUniqueShopMembers([]);
          setShopMemberStats({
            totalUniqueMembers: 0,
            owners: 0,
            coOwners: 0,
            editors: 0,
            viewers: 0,
            activeShops: 0,
            totalShops: 0,
          });
          return;
        }

        const allMembers: ShopMember[] = [];
        const shopDataList: ShopData[] = [];
        let activeShopsCount = 0;

        for (const shopDoc of shopsSnapshot.docs) {
          const shopData = shopDoc.data() as ShopData;
          const shopId = shopDoc.id;
          const shopName = shopData.name || "Unnamed Shop";
          const isActive = shopData.isActive !== false;

          shopDataList.push({ ...shopData, id: shopId });

          if (isActive) {
            activeShopsCount++;
          }

          if (!isActive) {
            continue;
          }

          if (
            shopData.ownerId &&
            typeof shopData.ownerId === "string" &&
            shopData.ownerId.trim()
          ) {
            allMembers.push({
              userId: shopData.ownerId.trim(),
              role: "owner",
              shopId,
              shopName,
            });
          }

          if (shopData.coOwners && Array.isArray(shopData.coOwners)) {
            const validCoOwners = shopData.coOwners.filter(
              (userId): userId is string =>
                typeof userId === "string" && userId.trim().length > 0
            );
            validCoOwners.forEach((userId) => {
              allMembers.push({
                userId: userId.trim(),
                role: "coOwner",
                shopId,
                shopName,
              });
            });
          }

          if (shopData.editors && Array.isArray(shopData.editors)) {
            const validEditors = shopData.editors.filter(
              (userId): userId is string =>
                typeof userId === "string" && userId.trim().length > 0
            );
            validEditors.forEach((userId) => {
              allMembers.push({
                userId: userId.trim(),
                role: "editor",
                shopId,
                shopName,
              });
            });
          }

          if (shopData.viewers && Array.isArray(shopData.viewers)) {
            const validViewers = shopData.viewers.filter(
              (userId): userId is string =>
                typeof userId === "string" && userId.trim().length > 0
            );
            validViewers.forEach((userId) => {
              allMembers.push({
                userId: userId.trim(),
                role: "viewer",
                shopId,
                shopName,
              });
            });
          }
        }

        const uniqueUserIds = new Set<string>();
        const validatedMembers: ShopMember[] = [];
        const userRoles = new Map<string, string>();
        const roleHierarchy = { owner: 4, coOwner: 3, editor: 2, viewer: 1 };

        for (const member of allMembers) {
          if (!member.userId || member.userId.length < 10) {
            continue;
          }

          uniqueUserIds.add(member.userId);

          const currentRole = userRoles.get(member.userId);
          if (
            !currentRole ||
            roleHierarchy[member.role as keyof typeof roleHierarchy] >
              roleHierarchy[currentRole as keyof typeof roleHierarchy]
          ) {
            userRoles.set(member.userId, member.role);
          }

          validatedMembers.push(member);
        }

        const stats = {
          totalUniqueMembers: uniqueUserIds.size,
          owners: 0,
          coOwners: 0,
          editors: 0,
          viewers: 0,
          activeShops: activeShopsCount,
          totalShops: shopDataList.length,
        };

        userRoles.forEach((role) => {
          switch (role) {
            case "owner":
              stats.owners++;
              break;
            case "coOwner":
              stats.coOwners++;
              break;
            case "editor":
              stats.editors++;
              break;
            case "viewer":
              stats.viewers++;
              break;
          }
        });

        if (uniqueUserIds.size === 0) {
          setError("Geçerli mağaza üyesi bulunamadı.");
        }

        setShopMembers(validatedMembers);
        setUniqueShopMembers(Array.from(uniqueUserIds));
        setShopMemberStats(stats);

        console.log("✅ Shop member processing completed");
      } catch (err) {
        console.error("❌ Error fetching shop members:", err);
        setError("Mağaza üyeleri alınırken hata oluştu");
        setShopMembers([]);
        setUniqueShopMembers([]);
        setShopMemberStats({
          totalUniqueMembers: 0,
          owners: 0,
          coOwners: 0,
          editors: 0,
          viewers: 0,
          activeShops: 0,
          totalShops: 0,
        });
      } finally {
        setFetchingMembers(false);
      }
    };

    fetchShopMembers();
  }, []);

  // Cleanup polling intervals on unmount
  useEffect(() => {
    return () => {
      Object.values(pollingIntervals).forEach((interval) =>
        clearInterval(interval)
      );
    };
  }, [pollingIntervals]);

  const addEmojiToField = (emoji: string) => {
    if (activeField === "name") {
      setCampaignName((prev) => prev + emoji);
    } else if (activeField === "description") {
      setCampaignDescription((prev) => prev + emoji);
    }
  };

  const checkDeletionStatus = async (campaignId: string, queueId?: string) => {
    try {
      const getStatusFunction = httpsCallable(
        functions,
        "getCampaignDeletionStatus"
      );
      const result = await getStatusFunction({ campaignId, queueId });
      const status = result.data as DeletionStatus;

      setDeletionStatus((prev) => ({
        ...prev,
        [campaignId]: status,
      }));

      // Stop polling if completed or failed
      if (status.status === "completed" || status.status === "failed") {
        if (pollingIntervals[campaignId]) {
          clearInterval(pollingIntervals[campaignId]);
          setPollingIntervals((prev) => {
            const newIntervals = { ...prev };
            delete newIntervals[campaignId];
            return newIntervals;
          });
        }

        // Remove from campaigns list if completed
        if (status.status === "completed") {
          setCampaigns((prev) => prev.filter((c) => c.id !== campaignId));
        }
      }

      return status;
    } catch (err) {
      console.error("Error checking deletion status:", err);
      return null;
    }
  };

  const startStatusPolling = (campaignId: string, queueId?: string) => {
    // Clear existing interval if any
    if (pollingIntervals[campaignId]) {
      clearInterval(pollingIntervals[campaignId]);
    }

    // Poll every 2 seconds
    const interval = setInterval(() => {
      checkDeletionStatus(campaignId, queueId);
    }, 2000);

    setPollingIntervals((prev) => ({
      ...prev,
      [campaignId]: interval,
    }));
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    const campaign = campaigns.find((c) => c.id === campaignId);
    const confirmMessage = `⚠️ KAMPANYA SİLME ONAY

Kampanya: ${campaign?.name || "Bilinmeyen"}

Bu işlem:
✓ Kampanyayı tamamen silecek
✓ Kampanyaya bağlı TÜM ürünlerden kampanya bilgilerini kaldıracak
✓ Ürün fiyatlarını orijinal fiyatlarına geri döndürecek
✓ Arka planda çalışacak ve ilerleme takibi yapabileceksiniz

⚠️ BU İŞLEM GERİ ALINAMAZ

Devam etmek istiyor musunuz?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    setDeletingCampaignId(campaignId);
    setError("");

    try {
      const deleteCampaignFunction = httpsCallable(functions, "deleteCampaign");
      console.log(`🗑️ Starting deletion of campaign: ${campaignId}`);

      const result = await deleteCampaignFunction({ campaignId });
      const data = result.data as {
        success: boolean;
        queueId: string;
        totalProducts: number;
        message: string;
      };

      if (data.success) {
        console.log(`✅ Campaign deletion queued: ${data.message}`);

        // Start polling for status
        startStatusPolling(campaignId, data.queueId);

        // Show success message
        setSuccess(true);
        setTimeout(() => setSuccess(false), 5000);
      } else {
        throw new Error("Campaign deletion failed");
      }
    } catch (err) {
      console.error("❌ Error deleting campaign:", err);
      let errorMessage = "Kampanya silinemedi: ";

      if (err && typeof err === "object" && "code" in err) {
        const error = err as { code: string; message?: string };
        switch (error.code) {
          case "functions/not-found":
            errorMessage += "Kampanya bulunamadı.";
            break;
          case "functions/already-exists":
            errorMessage += "Bu kampanya zaten silinme sürecinde.";
            break;
          case "functions/permission-denied":
            errorMessage += "Bu işlem için yetkiniz yok.";
            break;
          case "functions/deadline-exceeded":
            errorMessage += "İşlem zaman aşımına uğradı.";
            break;
          case "functions/unavailable":
            errorMessage += "Servis şu anda kullanılamıyor.";
            break;
          default:
            errorMessage += error.message || "Bilinmeyen bir hata oluştu.";
        }
      } else {
        errorMessage += "Bilinmeyen bir hata oluştu.";
      }

      setError(errorMessage);
    } finally {
      setDeletingCampaignId(null);
    }
  };

  const formatDate = (timestamp: Timestamp) => {
    return timestamp.toDate().toLocaleDateString("tr-TR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!campaignName.trim() || !campaignDescription.trim()) {
      setError("Kampanya adı ve açıklama alanları dolu olmalıdır");
      return;
    }

    if (campaignName.trim().length < 3) {
      setError("Kampanya adı en az 3 karakter olmalıdır");
      return;
    }

    if (campaignDescription.trim().length < 10) {
      setError("Kampanya açıklaması en az 10 karakter olmalıdır");
      return;
    }

    if (uniqueShopMembers.length === 0) {
      setError("Bildirim gönderilecek mağaza üyesi bulunamadı.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      console.log("🚀 Starting campaign creation...");

      const campaignData = {
        name: campaignName.trim(),
        description: campaignDescription.trim(),
        createdAt: Timestamp.now(),
        targetAudience: "shop_members",
        notificationsSent: uniqueShopMembers.length,
        isActive: true,
        stats: {
          uniqueRecipientsCount: uniqueShopMembers.length,
          totalShopMemberships: shopMembers.length,
          activeShopsCount: shopMemberStats.activeShops,
          roleDistribution: {
            owners: shopMemberStats.owners,
            coOwners: shopMemberStats.coOwners,
            editors: shopMemberStats.editors,
            viewers: shopMemberStats.viewers,
          },
        },
      };

      const campaignRef = await addDoc(
        collection(db, "campaigns"),
        campaignData
      );
      console.log("✅ Campaign document created:", campaignRef.id);

      const baseNotificationData = {
        type: "campaign",
        timestamp: Timestamp.now(),
        isRead: false,
        campaignId: campaignRef.id,
        campaignName: campaignName.trim(),
        campaignDescription: campaignDescription.trim(),
        message_en: campaignDescription.trim(),
        message_tr: campaignDescription.trim(),
        message_ru: campaignDescription.trim(),
      };

      const batchSize = 500;
      const batches: Promise<void>[] = [];

      for (let i = 0; i < uniqueShopMembers.length; i += batchSize) {
        const batch = writeBatch(db);
        const batchMembers = uniqueShopMembers.slice(i, i + batchSize);

        batchMembers.forEach((userId) => {
          const notificationRef = doc(
            collection(db, "users", userId, "notifications")
          );
          batch.set(notificationRef, baseNotificationData);
        });

        batches.push(batch.commit());
      }

      await Promise.all(batches);
      console.log("✅ All notifications sent");

      setCampaigns((prev) => [
        { id: campaignRef.id, ...campaignData },
        ...prev,
      ]);

      setSuccess(true);
      setCampaignName("");
      setCampaignDescription("");
      setActiveField(null);

      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      console.error("❌ Error creating campaign:", err);
      setError(
        "Kampanya oluşturulamadı: " +
          (err instanceof Error ? err.message : "Bilinmeyen hata")
      );
    } finally {
      setLoading(false);
    }
  };

  const getDeletionStatusColor = (status?: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "processing":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "retrying":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "completed":
        return "bg-green-100 text-green-800 border-green-200";
      case "failed":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between py-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.back()}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl">
                    <Megaphone className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-gray-900">
                      Kampanya Yönetimi
                    </h1>
                    <p className="text-sm text-gray-500">
                      Kampanya oluştur ve yönet
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-gray-50 px-4 py-2 rounded-lg border border-gray-200">
                <Users className="w-5 h-5 text-gray-600" />
                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-900">
                    {fetchingMembers
                      ? "..."
                      : shopMemberStats.totalUniqueMembers.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500">Benzersiz üye</div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Success Alert */}
          {success && (
            <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <div>
                  <h3 className="font-semibold text-green-900">
                    İşlem Başarılı!
                  </h3>
                  <p className="text-sm text-green-700">
                    Kampanya oluşturuldu veya silme işlemi başlatıldı.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error Alert */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-600" />
                <div>
                  <h3 className="font-semibold text-red-900">Hata Oluştu</h3>
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Warning */}
          {!fetchingMembers && shopMemberStats.totalUniqueMembers === 0 && (
            <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
                <div>
                  <h3 className="font-semibold text-yellow-900">Uyarı</h3>
                  <p className="text-sm text-yellow-700">
                    Hiç mağaza üyesi bulunamadı. Aktif mağazaların bulunduğundan
                    emin olun.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Existing Campaigns (2/3 width) */}
            <div className="lg:col-span-2 space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Store className="w-5 h-5 text-blue-600" />
                    <TrendingUp className="w-4 h-4 text-green-500" />
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {shopMemberStats.owners.toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-500">Mağaza Sahipleri</div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <FileText className="w-5 h-5 text-green-600" />
                    <Activity className="w-4 h-4 text-green-500" />
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {shopMemberStats.editors.toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-500">Editörler</div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Eye className="w-5 h-5 text-purple-600" />
                    <BarChart3 className="w-4 h-4 text-green-500" />
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {shopMemberStats.viewers.toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-500">İzleyiciler</div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Store className="w-5 h-5 text-orange-600" />
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {shopMemberStats.activeShops}
                  </div>
                  <div className="text-sm text-gray-500">Aktif Mağaza</div>
                </div>
              </div>

              {/* Existing Campaigns */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <Megaphone className="w-5 h-5 text-purple-600" />
                    Mevcut Kampanyalar
                  </h2>
                  <div className="text-sm text-gray-500">
                    {campaigns.length} kampanya
                  </div>
                </div>

                {fetchingCampaigns ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    <span className="ml-2 text-gray-600">
                      Kampanyalar yükleniyor...
                    </span>
                  </div>
                ) : campaigns.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Megaphone className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-gray-500">
                      Henüz kampanya oluşturulmamış
                    </p>
                    <p className="text-sm text-gray-400 mt-1">
                      Sağ taraftan yeni kampanya oluşturabilirsiniz
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {campaigns.map((campaign) => {
                      const status = deletionStatus[campaign.id];
                      const isDeleting =
                        status && status.status !== "completed";

                      return (
                        <div
                          key={campaign.id}
                          className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <h3 className="font-semibold text-gray-900 text-base mb-1">
                                {campaign.name}
                              </h3>
                              <p className="text-gray-600 text-sm mb-3">
                                {campaign.description}
                              </p>

                              {/* Deletion Progress */}
                              {isDeleting && (
                                <div className="mb-3 bg-white rounded-lg border border-gray-200 p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <span
                                      className={`text-xs font-semibold px-2 py-1 rounded border ${getDeletionStatusColor(
                                        status.status
                                      )}`}
                                    >
                                      {status.status === "pending" &&
                                        "Beklemede"}
                                      {status.status === "processing" &&
                                        "İşleniyor"}
                                      {status.status === "retrying" &&
                                        "Yeniden Deneniyor"}
                                      {status.status === "failed" &&
                                        "Başarısız"}
                                    </span>
                                    {status.progress !== undefined && (
                                      <span className="text-sm font-semibold text-gray-700">
                                        %{status.progress}
                                      </span>
                                    )}
                                  </div>

                                  {status.progress !== undefined && (
                                    <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                                      <div
                                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                        style={{ width: `${status.progress}%` }}
                                      />
                                    </div>
                                  )}

                                  <div className="grid grid-cols-3 gap-2 text-xs">
                                    <div>
                                      <span className="text-gray-500">
                                        İşlenen:
                                      </span>
                                      <span className="ml-1 font-semibold text-gray-900">
                                        {status.productsProcessed || 0}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-gray-500">
                                        Geri Dönen:
                                      </span>
                                      <span className="ml-1 font-semibold text-green-600">
                                        {status.productsReverted || 0}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-gray-500">
                                        Başarısız:
                                      </span>
                                      <span className="ml-1 font-semibold text-red-600">
                                        {status.productsFailed || 0}
                                      </span>
                                    </div>
                                  </div>

                                  {status.estimatedTimeRemaining && (
                                    <div className="mt-2 text-xs text-gray-500">
                                      Tahmini kalan süre:{" "}
                                      {status.estimatedTimeRemaining.minutes}{" "}
                                      dakika
                                    </div>
                                  )}
                                </div>
                              )}

                              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatDate(campaign.createdAt)}
                                </div>
                                <div className="flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {campaign.notificationsSent.toLocaleString()}{" "}
                                  kişi
                                </div>
                                {campaign.stats && (
                                  <div className="flex items-center gap-1">
                                    <Store className="w-3 h-3" />
                                    {campaign.stats.activeShopsCount} mağaza
                                  </div>
                                )}
                                <div className="flex items-center gap-1">
                                  <div
                                    className={`w-2 h-2 rounded-full ${
                                      campaign.isActive
                                        ? "bg-green-500"
                                        : "bg-gray-400"
                                    }`}
                                  />
                                  {campaign.isActive ? "Aktif" : "Pasif"}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 ml-4">
                              {status && status.status === "processing" && (
                                <button
                                  onClick={() =>
                                    checkDeletionStatus(campaign.id)
                                  }
                                  className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors"
                                  title="Durumu Yenile"
                                >
                                  <RefreshCw className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() =>
                                  handleDeleteCampaign(campaign.id)
                                }
                                disabled={
                                  deletingCampaignId === campaign.id ||
                                  isDeleting
                                }
                                className="flex items-center gap-1 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {deletingCampaignId === campaign.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                                Sil
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Create Campaign Form (1/3 width) */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl border border-gray-200 p-6 sticky top-24">
                <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                  <Send className="w-5 h-5 text-purple-600" />
                  Yeni Kampanya
                </h2>

                <form onSubmit={handleCreateCampaign} className="space-y-5">
                  {/* Campaign Name */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Kampanya Adı *
                    </label>
                    <input
                      type="text"
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                      onFocus={() => setActiveField("name")}
                      placeholder="Örn: Yaz İndirimleri 🌞"
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                      required
                      minLength={3}
                      maxLength={100}
                    />
                    <div className="mt-1 text-xs text-gray-500">
                      {campaignName.length}/100 karakter
                    </div>
                  </div>

                  {/* Campaign Description */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Açıklama *
                    </label>
                    <textarea
                      value={campaignDescription}
                      onChange={(e) => setCampaignDescription(e.target.value)}
                      onFocus={() => setActiveField("description")}
                      placeholder="Kampanya detaylarını yazın..."
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none transition-all"
                      rows={4}
                      required
                      minLength={10}
                      maxLength={500}
                    />
                    <div className="mt-1 text-xs text-gray-500">
                      {campaignDescription.length}/500 karakter
                    </div>
                  </div>

                  {/* Emoji Picker */}
                  <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">
                      😊 Emoji Ekle
                      {activeField && (
                        <span className="text-xs text-gray-500 ml-2">
                          ({activeField === "name" ? "Ada" : "Açıklamaya"}{" "}
                          eklenecek)
                        </span>
                      )}
                    </h3>

                    {!activeField && (
                      <p className="text-xs text-gray-500 mb-3">
                        Emoji eklemek için bir alana tıklayın
                      </p>
                    )}

                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {emojis.map((category) => (
                        <div key={category.category}>
                          <h4 className="text-xs font-medium text-gray-600 mb-2">
                            {category.category}
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {category.emojis.map((emoji, index) => (
                              <button
                                key={index}
                                type="button"
                                onClick={() => addEmojiToField(emoji)}
                                disabled={!activeField}
                                className={`w-8 h-8 text-lg rounded hover:bg-white transition-all ${
                                  !activeField
                                    ? "opacity-40 cursor-not-allowed"
                                    : "hover:scale-110 cursor-pointer"
                                }`}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Preview */}
                  {(campaignName || campaignDescription) && (
                    <div className="border border-purple-200 rounded-lg p-4 bg-purple-50">
                      <h3 className="text-sm font-semibold text-purple-900 mb-3">
                        Önizleme
                      </h3>
                      <div className="bg-white rounded-lg p-3 border border-purple-100">
                        <div className="flex items-start gap-2">
                          <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Megaphone className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-gray-900 text-sm mb-1 truncate">
                              {campaignName || "Kampanya Adı"}
                            </h4>
                            <p className="text-gray-600 text-xs line-clamp-2">
                              {campaignDescription || "Açıklama..."}
                            </p>
                            <div className="mt-2 text-xs text-gray-400">
                              Az önce
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={
                      loading ||
                      fetchingMembers ||
                      !campaignName.trim() ||
                      campaignName.trim().length < 3 ||
                      !campaignDescription.trim() ||
                      campaignDescription.trim().length < 10 ||
                      shopMemberStats.totalUniqueMembers === 0
                    }
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-400 disabled:to-gray-400 text-white font-semibold rounded-lg transition-all duration-200 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Oluşturuluyor...
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        Kampanyayı Gönder
                      </>
                    )}
                  </button>

                  {/* Info */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div className="text-xs text-blue-700">
                        <p className="font-medium mb-1">Bilgi:</p>
                        <p>
                          {shopMemberStats.totalUniqueMembers.toLocaleString()}{" "}
                          benzersiz mağaza üyesine bildirim gönderilecek.
                        </p>
                      </div>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
