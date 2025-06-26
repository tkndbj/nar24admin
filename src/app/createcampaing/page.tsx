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
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useRouter } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";

interface ShopMember {
  shopId: string;
  shopName: string;
  userId: string;
  role: string;
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
  const [shopMembers, setShopMembers] = useState<ShopMember[]>([]);
  const [fetchingMembers, setFetchingMembers] = useState(true);

  // New states for campaigns
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [fetchingCampaigns, setFetchingCampaigns] = useState(true);
  const [deletingCampaignId, setDeletingCampaignId] = useState<string | null>(
    null
  );

  // Form states
  const [campaignName, setCampaignName] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");
  const [activeField, setActiveField] = useState<"name" | "description" | null>(
    null
  );

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

  // Fetch all shop members on component mount
  useEffect(() => {
    const fetchShopMembers = async () => {
      try {
        setFetchingMembers(true);
        const shopsRef = collection(db, "shops");
        const snapshot = await getDocs(shopsRef);

        const members: ShopMember[] = [];

        snapshot.docs.forEach((doc) => {
          const shopData = doc.data();
          const shopId = doc.id;
          const shopName = shopData.name || "Unnamed Shop";

          // Add owner
          if (shopData.ownerId) {
            members.push({
              shopId,
              shopName,
              userId: shopData.ownerId,
              role: "owner",
            });
          }

          // Add co-owners
          if (shopData.coOwners && Array.isArray(shopData.coOwners)) {
            shopData.coOwners.forEach((userId: string) => {
              members.push({
                shopId,
                shopName,
                userId,
                role: "coOwner",
              });
            });
          }

          // Add editors
          if (shopData.editors && Array.isArray(shopData.editors)) {
            shopData.editors.forEach((userId: string) => {
              members.push({
                shopId,
                shopName,
                userId,
                role: "editor",
              });
            });
          }

          // Add viewers
          if (shopData.viewers && Array.isArray(shopData.viewers)) {
            shopData.viewers.forEach((userId: string) => {
              members.push({
                shopId,
                shopName,
                userId,
                role: "viewer",
              });
            });
          }
        });

        // Remove duplicates based on userId
        const uniqueMembers = members.filter(
          (member, index, self) =>
            index === self.findIndex((m) => m.userId === member.userId)
        );

        setShopMembers(uniqueMembers);
      } catch (err) {
        console.error("Error fetching shop members:", err);
        setError("Mağaza üyeleri alınamadı");
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
    setError(""); // Clear any previous errors

    try {
      // Create callable function reference
      const deleteCampaignFunction = httpsCallable(functions, "deleteCampaign");

      console.log(`Starting deletion of campaign: ${campaignId}`);

      // Call the Cloud Function
      const result = await deleteCampaignFunction({ campaignId });
      const data = result.data as {
        success: boolean;
        productsUpdated: number;
        message: string;
      };

      if (data.success) {
        // Update local state - remove the campaign from the list
        setCampaigns(campaigns.filter((c) => c.id !== campaignId));

        // Show success message with details
        console.log(
          `Campaign deleted successfully: ${data.productsUpdated} products updated`
        );

        // Optional: Show a success toast/notification
        // You can add a success state if you want to show a green alert
        setSuccess(true);
        setTimeout(() => setSuccess(false), 5000);
      } else {
        throw new Error("Campaign deletion failed");
      }
    } catch (err) {
      console.error("Error deleting campaign:", err);

      let errorMessage = "Kampanya silinemedi. ";

      // Handle specific error types from Cloud Function
      if (err && typeof err === "object" && "code" in err) {
        const error = err as { code: string; message?: string };

        if (error.code === "functions/not-found") {
          errorMessage += "Kampanya bulunamadı.";
        } else if (error.code === "functions/permission-denied") {
          errorMessage += "Bu işlem için yetkiniz yok.";
        } else if (error.code === "functions/deadline-exceeded") {
          errorMessage += "İşlem zaman aşımına uğradı. Lütfen tekrar deneyin.";
        } else if (error.code === "functions/unavailable") {
          errorMessage +=
            "Servis şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.";
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

    if (!campaignName.trim() || !campaignDescription.trim()) {
      setError("Kampanya adı ve açıklama alanları dolu olmalıdır");
      return;
    }

    if (shopMembers.length === 0) {
      setError("Bildirim gönderilecek mağaza üyesi bulunamadı");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      // Create campaign document
      const campaignData = {
        name: campaignName.trim(),
        description: campaignDescription.trim(),
        createdAt: Timestamp.now(),
        targetAudience: "shop_members",
        notificationsSent: shopMembers.length,
        isActive: true,
      };

      const campaignRef = await addDoc(
        collection(db, "campaigns"),
        campaignData
      );

      // Add the new campaign to the local state
      setCampaigns((prev) => [
        {
          id: campaignRef.id,
          ...campaignData,
        },
        ...prev,
      ]);

      // Prepare notification data
      const notificationData = {
        type: "campaign",
        title: `🎉 Yeni Kampanya: ${campaignName.trim()}`,
        message: campaignDescription.trim(),
        timestamp: Timestamp.now(),
        isRead: false,
        campaignId: campaignRef.id,
        // Add campaign metadata
        campaignName: campaignName.trim(),
      };

      // Send notification to each shop member
      const promises = shopMembers.map(async (member) => {
        const notificationRef = doc(
          collection(db, "users", member.userId, "notifications")
        );
        await setDoc(notificationRef, notificationData);
      });

      await Promise.all(promises);

      setSuccess(true);
      // Clear form
      setCampaignName("");
      setCampaignDescription("");
      setActiveField(null);

      // Hide success message after 5 seconds
      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      console.error("Error creating campaign:", err);
      setError("Kampanya oluşturulamadı. Lütfen tekrar deneyin.");
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
                  <h1 className="text-2xl font-bold text-white">
                    Kampanya Yönetimi
                  </h1>
                </div>
              </div>
              <div className="flex items-center gap-3 text-white">
                <Store className="w-5 h-5" />
                <span className="text-sm">
                  {fetchingMembers
                    ? "Yükleniyor..."
                    : `${shopMembers.length.toLocaleString()} mağaza üyesi`}
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
                    {shopMembers.length.toLocaleString()} mağaza üyesine
                    bildirim gönderildi.
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

          {/* Existing Campaigns Section */}
          <div className="mb-8 backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Eye className="w-6 h-6" />
              Mevcut Kampanyalar
            </h2>

            {fetchingCampaigns ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-white" />
                <span className="ml-2 text-white">
                  Kampanyalar yükleniyor...
                </span>
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
                            {campaign.notificationsSent.toLocaleString()} kişiye
                            gönderildi
                          </div>
                          <div className="flex items-center gap-1">
                            <div
                              className={`w-2 h-2 rounded-full ${
                                campaign.isActive
                                  ? "bg-green-400"
                                  : "bg-gray-400"
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

          {/* Shop Members Statistics */}
          <div className="mb-6 backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-4">
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Hedef Kitle: Mağaza Üyeleri
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="flex items-center justify-between p-3 bg-white/10 rounded-lg">
                <div className="flex items-center gap-2">
                  <Store className="w-5 h-5 text-blue-400" />
                  <span className="text-white font-medium">Toplam Üye</span>
                </div>
                <span className="text-blue-400 font-bold">
                  {shopMembers.length.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-white/10 rounded-lg">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-400" />
                  <span className="text-white font-medium">Sahipler</span>
                </div>
                <span className="text-purple-400 font-bold">
                  {shopMembers.filter((m) => m.role === "owner").length}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-white/10 rounded-lg">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-green-400" />
                  <span className="text-white font-medium">Editörler</span>
                </div>
                <span className="text-green-400 font-bold">
                  {shopMembers.filter((m) => m.role === "editor").length}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-white/10 rounded-lg">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-orange-400" />
                  <span className="text-white font-medium">İzleyiciler</span>
                </div>
                <span className="text-orange-400 font-bold">
                  {shopMembers.filter((m) => m.role === "viewer").length}
                </span>
              </div>
            </div>
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
                  Kampanya Adı
                </label>
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  onFocus={() => setActiveField("name")}
                  placeholder="Kampanyanızın adını girin..."
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  required
                />
              </div>

              {/* Campaign Description */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  Kampanya Açıklaması
                </label>
                <textarea
                  value={campaignDescription}
                  onChange={(e) => setCampaignDescription(e.target.value)}
                  onFocus={() => setActiveField("description")}
                  placeholder="Kampanyanızın detaylarını açıklayın..."
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-none"
                  rows={4}
                  required
                />
              </div>

              {/* Emoji Picker */}
              <div className="border border-white/10 rounded-lg p-4 bg-white/5">
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  😊 Emoji Ekle
                  {activeField && (
                    <span className="text-xs text-gray-400">
                      (
                      {activeField === "name" ? "Kampanya adına" : "Açıklamaya"}{" "}
                      eklenecek)
                    </span>
                  )}
                </h3>

                {!activeField && (
                  <p className="text-xs text-gray-400 mb-3">
                    Emoji eklemek için önce kampanya adı veya açıklama alanına
                    tıklayın
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

              {/* Preview */}
              {(campaignName || campaignDescription) && (
                <div className="border border-purple-500/30 rounded-lg p-4 bg-purple-500/10">
                  <h3 className="text-sm font-semibold text-purple-300 mb-3 flex items-center gap-2">
                    <Megaphone className="w-4 h-4" />
                    Bildirim Önizlemesi
                  </h3>
                  <div className="bg-white/10 rounded-lg p-3">
                    <h4 className="font-semibold text-white text-sm">
                      🎉 Yeni Kampanya: {campaignName || "Kampanya Adı"}
                    </h4>
                    <p className="text-gray-300 text-sm mt-1">
                      {campaignDescription ||
                        "Kampanya açıklaması burada görünecek..."}
                    </p>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <div className="flex items-center justify-between pt-6 border-t border-white/10">
                <div className="flex items-center gap-2 text-gray-300">
                  <Store className="w-5 h-5 text-pink-400" />
                  <span className="text-sm">
                    {shopMembers.length.toLocaleString()} mağaza üyesine
                    kampanya bildirimi gönderilecek
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={
                    loading ||
                    fetchingMembers ||
                    !campaignName.trim() ||
                    !campaignDescription.trim()
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
            </form>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
