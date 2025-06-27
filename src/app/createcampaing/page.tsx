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
  Calendar,
  FileText,
  Sparkles,
  Eye,
  Trash2,
  Clock,
  AlertTriangle,
} from "lucide-react";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  Timestamp,
  addDoc,
  query,
  orderBy,
  writeBatch,
  where,
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
  createdAt?: any;
}

interface Campaign {
  id: string;
  name: string;
  description: string;
  createdAt: Timestamp;
  targetAudience: string;
  notificationsSent: number;
  isActive: boolean;
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
  
  // Enhanced state for better shop member management
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
  const [deletingCampaignId, setDeletingCampaignId] = useState<string | null>(null);

  // Form states
  const [campaignName, setCampaignName] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");
  const [activeField, setActiveField] = useState<"name" | "description" | null>(null);

  // Fetch all campaigns
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

  // ROBUST shop member fetching with proper deduplication and validation
  useEffect(() => {
    const fetchShopMembers = async () => {
      try {
        setFetchingMembers(true);
        setError(""); // Clear any previous errors

        console.log("🔍 Starting robust shop member fetch...");

        // Step 1: Fetch all shops
        const shopsRef = collection(db, "shops");
        const shopsSnapshot = await getDocs(shopsRef);

        if (shopsSnapshot.empty) {
          console.warn("⚠️ No shops found in database");
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

        console.log(`📊 Found ${shopsSnapshot.docs.length} shops`);

        // Step 2: Process each shop and extract all member relationships
        const allMembers: ShopMember[] = [];
        const shopDataList: ShopData[] = [];
        let activeShopsCount = 0;

        for (const shopDoc of shopsSnapshot.docs) {
          const shopData = shopDoc.data() as ShopData;
          const shopId = shopDoc.id;
          const shopName = shopData.name || "Unnamed Shop";
          const isActive = shopData.isActive !== false; // Default to true if not specified

          shopDataList.push({
            ...shopData,
            id: shopId,
          });

          if (isActive) {
            activeShopsCount++;
          }

          console.log(`🏪 Processing shop: ${shopName} (${shopId}) - Active: ${isActive}`);

          // Only process members from active shops
          if (!isActive) {
            console.log(`⏸️ Skipping inactive shop: ${shopName}`);
            continue;
          }

          // Add owner (validate that ownerId exists and is a string)
          if (shopData.ownerId && typeof shopData.ownerId === 'string' && shopData.ownerId.trim()) {
            allMembers.push({
              userId: shopData.ownerId.trim(),
              role: "owner",
              shopId,
              shopName,
            });
            console.log(`👑 Added owner: ${shopData.ownerId}`);
          } else {
            console.warn(`⚠️ Shop ${shopName} has invalid or missing ownerId`);
          }

          // Add co-owners (validate array and each member)
          if (shopData.coOwners && Array.isArray(shopData.coOwners)) {
            const validCoOwners = shopData.coOwners.filter(
              (userId): userId is string => 
                typeof userId === 'string' && userId.trim().length > 0
            );
            
            validCoOwners.forEach((userId) => {
              allMembers.push({
                userId: userId.trim(),
                role: "coOwner",
                shopId,
                shopName,
              });
            });
            console.log(`🤝 Added ${validCoOwners.length} co-owners`);
          }

          // Add editors (validate array and each member)
          if (shopData.editors && Array.isArray(shopData.editors)) {
            const validEditors = shopData.editors.filter(
              (userId): userId is string => 
                typeof userId === 'string' && userId.trim().length > 0
            );
            
            validEditors.forEach((userId) => {
              allMembers.push({
                userId: userId.trim(),
                role: "editor",
                shopId,
                shopName,
              });
            });
            console.log(`✏️ Added ${validEditors.length} editors`);
          }

          // Add viewers (validate array and each member)
          if (shopData.viewers && Array.isArray(shopData.viewers)) {
            const validViewers = shopData.viewers.filter(
              (userId): userId is string => 
                typeof userId === 'string' && userId.trim().length > 0
            );
            
            validViewers.forEach((userId) => {
              allMembers.push({
                userId: userId.trim(),
                role: "viewer",
                shopId,
                shopName,
              });
            });
            console.log(`👀 Added ${validViewers.length} viewers`);
          }
        }

        console.log(`📋 Total member relationships found: ${allMembers.length}`);

        // Step 3: Advanced deduplication and validation
        // Create a Set of unique user IDs to avoid sending duplicate notifications
        const uniqueUserIds = new Set<string>();
        const validatedMembers: ShopMember[] = [];

        // Keep track of each user's highest role for statistics
        const userRoles = new Map<string, string>();
        const roleHierarchy = { "owner": 4, "coOwner": 3, "editor": 2, "viewer": 1 };

        for (const member of allMembers) {
          // Validate user ID format (basic validation)
          if (!member.userId || member.userId.length < 10) {
            console.warn(`⚠️ Invalid user ID format: ${member.userId}`);
            continue;
          }

          // Add to unique set
          uniqueUserIds.add(member.userId);
          
          // Keep track of highest role for this user
          const currentRole = userRoles.get(member.userId);
          if (!currentRole || roleHierarchy[member.role as keyof typeof roleHierarchy] > roleHierarchy[currentRole as keyof typeof roleHierarchy]) {
            userRoles.set(member.userId, member.role);
          }

          validatedMembers.push(member);
        }

        // Step 4: Calculate statistics
        const stats = {
          totalUniqueMembers: uniqueUserIds.size,
          owners: 0,
          coOwners: 0,
          editors: 0,
          viewers: 0,
          activeShops: activeShopsCount,
          totalShops: shopDataList.length,
        };

        // Count roles based on highest role per user
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

        // Step 5: Final validation
        if (uniqueUserIds.size === 0) {
          console.warn("⚠️ No valid shop members found after processing");
          setError("Geçerli mağaza üyesi bulunamadı. Aktif mağaza bulunmuyor olabilir.");
        }

        // Step 6: Update state
        setShopMembers(validatedMembers);
        setUniqueShopMembers(Array.from(uniqueUserIds));
        setShopMemberStats(stats);

        console.log("✅ Shop member processing completed successfully");
        console.log(`📊 Final stats:`, stats);
        console.log(`👥 Unique members: ${uniqueUserIds.size}`);

      } catch (err) {
        console.error("❌ Error fetching shop members:", err);
        setError("Mağaza üyeleri alınırken hata oluştu: " + (err as Error).message);
        
        // Reset state on error
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

  const addEmojiToField = (emoji: string) => {
    if (activeField === "name") {
      setCampaignName((prev) => prev + emoji);
    } else if (activeField === "description") {
      setCampaignDescription((prev) => prev + emoji);
    }
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    const confirmMessage = `Bu kampanyayı silmek istediğinizden emin misiniz?\n\nBu işlem:\n• Kampanyayı tamamen silecek\n• Kampanyaya bağlı tüm ürünlerden kampanya bilgilerini kaldıracak\n• Bu işlem geri alınamaz\n\nDevam etmek istiyor musunuz?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    setDeletingCampaignId(campaignId);
    setError("");

    try {
      const deleteCampaignFunction = httpsCallable(functions, "deleteCampaign");
      console.log(`Starting deletion of campaign: ${campaignId}`);

      const result = await deleteCampaignFunction({ campaignId });
      const data = result.data as {
        success: boolean;
        productsUpdated: number;
        message: string;
      };

      if (data.success) {
        setCampaigns(campaigns.filter((c) => c.id !== campaignId));
        console.log(`Campaign deleted successfully: ${data.productsUpdated} products updated`);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 5000);
      } else {
        throw new Error("Campaign deletion failed");
      }
    } catch (err) {
      console.error("Error deleting campaign:", err);
      let errorMessage = "Kampanya silinemedi. ";

      if (err && typeof err === "object" && "code" in err) {
        const error = err as { code: string; message?: string };
        if (error.code === "functions/not-found") {
          errorMessage += "Kampanya bulunamadı.";
        } else if (error.code === "functions/permission-denied") {
          errorMessage += "Bu işlem için yetkiniz yok.";
        } else if (error.code === "functions/deadline-exceeded") {
          errorMessage += "İşlem zaman aşımına uğradı. Lütfen tekrar deneyin.";
        } else if (error.code === "functions/unavailable") {
          errorMessage += "Servis şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.";
        } else {
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

    // Enhanced validation
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
      setError("Bildirim gönderilecek mağaza üyesi bulunamadı. Aktif mağaza bulunmuyor olabilir.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      console.log("🚀 Starting campaign creation process...");
      console.log(`📊 Will send to ${uniqueShopMembers.length} unique shop members`);

      // Step 1: Create campaign document with enhanced metadata
      const campaignData = {
        name: campaignName.trim(),
        description: campaignDescription.trim(),
        createdAt: Timestamp.now(),
        targetAudience: "shop_members",
        notificationsSent: uniqueShopMembers.length,
        isActive: true,
        // Enhanced metadata for tracking
        stats: {
          uniqueRecipientsCount: uniqueShopMembers.length,
          totalShopMemberships: shopMembers.length,
          activeShopsCount: shopMemberStats.activeShops,
          roleDistribution: {
            owners: shopMemberStats.owners,
            coOwners: shopMemberStats.coOwners,
            editors: shopMemberStats.editors,
            viewers: shopMemberStats.viewers,
          }
        }
      };

      const campaignRef = await addDoc(collection(db, "campaigns"), campaignData);
      console.log("✅ Campaign document created:", campaignRef.id);

      // Step 2: Prepare notification data
      const baseNotificationData = {
        type: "campaign",
        timestamp: Timestamp.now(),
        isRead: false,
        campaignId: campaignRef.id,
        campaignName: campaignName.trim(),
        campaignDescription: campaignDescription.trim(),
        // Multilingual support
        message_en: campaignDescription.trim(),
        message_tr: campaignDescription.trim(),
        message_ru: campaignDescription.trim(),
      };

      // Step 3: Use batched writes for better performance and atomicity
      const batchSize = 500; // Firestore batch limit
      const batches: Promise<void>[] = [];

      for (let i = 0; i < uniqueShopMembers.length; i += batchSize) {
        const batch = writeBatch(db);
        const batchMembers = uniqueShopMembers.slice(i, i + batchSize);

        batchMembers.forEach((userId) => {
          const notificationRef = doc(collection(db, "users", userId, "notifications"));
          batch.set(notificationRef, baseNotificationData);
        });

        batches.push(batch.commit());
        console.log(`📦 Prepared batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(uniqueShopMembers.length / batchSize)}`);
      }

      // Step 4: Execute all batches
      console.log("📤 Sending notifications to all shop members...");
      await Promise.all(batches);
      console.log("✅ All notifications sent successfully");

      // Step 5: Update local state
      setCampaigns((prev) => [
        {
          id: campaignRef.id,
          ...campaignData,
        },
        ...prev,
      ]);

      // Step 6: Success feedback
      setSuccess(true);
      setCampaignName("");
      setCampaignDescription("");
      setActiveField(null);

      console.log("🎉 Campaign creation completed successfully");
      console.log(`📊 Sent to ${uniqueShopMembers.length} unique shop members`);

      setTimeout(() => setSuccess(false), 5000);

    } catch (err) {
      console.error("❌ Error creating campaign:", err);
      
      let errorMessage = "Kampanya oluşturulamadı: ";
      if (err instanceof Error) {
        errorMessage += err.message;
      } else {
        errorMessage += "Bilinmeyen bir hata oluştu";
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

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
                  <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-pink-500 to-purple-600 rounded-lg">
                    <Megaphone className="w-5 h-5 text-white" />
                  </div>
                  <h1 className="text-2xl font-bold text-white">Kampanya Yönetimi</h1>
                </div>
              </div>
              <div className="flex items-center gap-3 text-white">
                <Store className="w-5 h-5" />
                <span className="text-sm">
                  {fetchingMembers
                    ? "Yükleniyor..."
                    : `${shopMemberStats.totalUniqueMembers.toLocaleString()} benzersiz mağaza üyesi`}
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
                  <h3 className="font-semibold text-green-400">
                    Kampanya Başarıyla Oluşturuldu! 🎉
                  </h3>
                  <p className="text-sm text-green-300">
                    {shopMemberStats.totalUniqueMembers.toLocaleString()} benzersiz mağaza üyesine bildirim gönderildi.
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

          {/* Warning for no shop members */}
          {!fetchingMembers && shopMemberStats.totalUniqueMembers === 0 && (
            <div className="mb-6 backdrop-blur-xl bg-yellow-500/20 border border-yellow-500/30 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                <div>
                  <h3 className="font-semibold text-yellow-400">Uyarı</h3>
                  <p className="text-sm text-yellow-300">
                    Hiç mağaza üyesi bulunamadı. Kampanya oluşturmadan önce aktif mağazaların bulunduğundan emin olun.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Existing Campaigns Section */}
          <div className="mb-8 backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Eye className="w-6 h-6" />
              Mevcut Kampanyalar
            </h2>

            {fetchingCampaigns ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-white" />
                <span className="ml-2 text-white">Kampanyalar yükleniyor...</span>
              </div>
            ) : campaigns.length === 0 ? (
              <div className="text-center py-8">
                <Megaphone className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-400">Henüz kampanya oluşturulmamış</p>
              </div>
            ) : (
              <div className="space-y-4">
                {campaigns.map((campaign) => (
                  <div
                    key={campaign.id}
                    className="bg-white/10 border border-white/20 rounded-lg p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-white text-lg mb-2">
                          {campaign.name}
                        </h3>
                        <p className="text-gray-300 text-sm mb-3">
                          {campaign.description}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-gray-400">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDate(campaign.createdAt)}
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {campaign.notificationsSent.toLocaleString()} kişiye gönderildi
                          </div>
                          <div className="flex items-center gap-1">
                            <div
                              className={`w-2 h-2 rounded-full ${
                                campaign.isActive ? "bg-green-400" : "bg-gray-400"
                              }`}
                            />
                            {campaign.isActive ? "Aktif" : "Pasif"}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteCampaign(campaign.id)}
                        disabled={deletingCampaignId === campaign.id}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm rounded-lg transition-colors disabled:opacity-50"
                      >
                        {deletingCampaignId === campaign.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                        Sil
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Enhanced Shop Members Statistics */}
          <div className="mb-6 backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-4">
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Hedef Kitle: Aktif Mağaza Üyeleri
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div className="flex items-center justify-between p-3 bg-white/10 rounded-lg">
                <div className="flex items-center gap-2">
                  <Store className="w-5 h-5 text-blue-400" />
                  <span className="text-white font-medium">Sahipler</span>
                </div>
                <span className="text-purple-400 font-bold">
                  {shopMemberStats.owners.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-white/10 rounded-lg">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-green-400" />
                  <span className="text-white font-medium">Editörler</span>
                </div>
                <span className="text-green-400 font-bold">
                  {shopMemberStats.editors.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-white/10 rounded-lg">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-orange-400" />
                  <span className="text-white font-medium">İzleyiciler</span>
                </div>
                <span className="text-orange-400 font-bold">
                  {shopMemberStats.viewers.toLocaleString()}
                </span>
              </div>
            </div>
            
            {/* Additional Statistics Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-cyan-400" />
                  <span className="text-white text-sm">Aktif Mağaza</span>
                </div>
                <span className="text-cyan-400 font-bold">
                  {shopMemberStats.activeShops}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-gray-400" />
                  <span className="text-white text-sm">Toplam Mağaza</span>
                </div>
                <span className="text-gray-400 font-bold">
                  {shopMemberStats.totalShops}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-pink-400" />
                  <span className="text-white text-sm">Toplam Üyelik</span>
                </div>
                <span className="text-pink-400 font-bold">
                  {shopMembers.length.toLocaleString()}
                </span>
              </div>
            </div>

            {fetchingMembers && (
              <div className="mt-4 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-white mr-2" />
                <span className="text-white text-sm">Mağaza üyeleri analiz ediliyor...</span>
              </div>
            )}
          </div>

          {/* Create New Campaign Form */}
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Megaphone className="w-6 h-6" />
              Yeni Kampanya Oluştur
            </h2>

            <form onSubmit={handleCreateCampaign} className="space-y-6">
              {/* Campaign Name */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  Kampanya Adı *
                </label>
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  onFocus={() => setActiveField("name")}
                  placeholder="Kampanyanızın adını girin... (min. 3 karakter)"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  required
                  minLength={3}
                  maxLength={100}
                />
                <div className="mt-1 text-xs text-gray-400">
                  {campaignName.length}/100 karakter
                </div>
              </div>

              {/* Campaign Description */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  Kampanya Açıklaması *
                </label>
                <textarea
                  value={campaignDescription}
                  onChange={(e) => setCampaignDescription(e.target.value)}
                  onFocus={() => setActiveField("description")}
                  placeholder="Kampanyanızın detaylarını açıklayın... (min. 10 karakter)"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-none"
                  rows={4}
                  required
                  minLength={10}
                  maxLength={500}
                />
                <div className="mt-1 text-xs text-gray-400">
                  {campaignDescription.length}/500 karakter
                </div>
              </div>

              {/* Emoji Picker */}
              <div className="border border-white/10 rounded-lg p-4 bg-white/5">
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  😊 Emoji Ekle
                  {activeField && (
                    <span className="text-xs text-gray-400">
                      ({activeField === "name" ? "Kampanya adına" : "Açıklamaya"} eklenecek)
                    </span>
                  )}
                </h3>

                {!activeField && (
                  <p className="text-xs text-gray-400 mb-3">
                    Emoji eklemek için önce kampanya adı veya açıklama alanına tıklayın
                  </p>
                )}

                <div className="space-y-3">
                  {emojis.map((category) => (
                    <div key={category.category}>
                      <h4 className="text-xs font-medium text-gray-300 mb-2">
                        {category.category}
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {category.emojis.map((emoji, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => addEmojiToField(emoji)}
                            disabled={!activeField}
                            className={`w-8 h-8 text-lg rounded hover:bg-white/10 transition-colors ${
                              !activeField
                                ? "opacity-50 cursor-not-allowed"
                                : "hover:scale-110"
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

              {/* Enhanced Preview */}
              {(campaignName || campaignDescription) && (
                <div className="border border-purple-500/30 rounded-lg p-4 bg-purple-500/10">
                  <h3 className="text-sm font-semibold text-purple-300 mb-3 flex items-center gap-2">
                    <Megaphone className="w-4 h-4" />
                    Bildirim Önizlemesi
                  </h3>
                  <div className="bg-white/10 rounded-lg p-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-gradient-to-r from-pink-500 to-purple-600 rounded-lg flex items-center justify-center">
                        <Megaphone className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-white text-sm mb-1">
                          🎉 {campaignName || "Kampanya Adı"}
                        </h4>
                        <p className="text-gray-300 text-sm">
                          {campaignDescription || "Kampanya açıklaması burada görünecek..."}
                        </p>
                        <div className="mt-2 text-xs text-gray-400">
                          Az önce • Kampanya
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <div className="flex items-center justify-between pt-6 border-t border-white/10">
                <div className="flex items-center gap-2 text-gray-300">
                  <Store className="w-5 h-5 text-pink-400" />
                  <span className="text-sm">
                    {fetchingMembers 
                      ? "Hesaplanıyor..." 
                      : `${shopMemberStats.totalUniqueMembers.toLocaleString()} benzersiz mağaza üyesine kampanya bildirimi gönderilecek`
                    }
                  </span>
                </div>
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
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-600 text-white font-semibold rounded-lg transition-all duration-200 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Kampanya Oluşturuluyor...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Kampanya Oluştur ve Gönder
                    </>
                  )}
                </button>
              </div>

              {/* Additional Info */}
              {!fetchingMembers && shopMemberStats.totalUniqueMembers > 0 && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5" />
                    <div className="text-sm text-blue-300">
                      <p className="font-medium mb-1">Bildirim Gönderim Bilgisi:</p>
                      <ul className="text-xs space-y-1 text-blue-200">
                        <li>• Her kullanıcıya sadece bir bildirim gönderilir (duplikasyon yok)</li>
                        <li>• Sadece aktif mağaza üyelerine bildirim gönderilir</li>
                        <li>• Bildirimler batched write ile güvenli şekilde gönderilir</li>
                        <li>• Toplam {shopMemberStats.activeShops} aktif mağazadan üyeler dahil edilir</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </form>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}