"use client";

import { useState, useEffect, useMemo } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { logAdminActivity } from "@/services/activityLogService";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  Image as ImageIcon,
  Store,

  Loader2,
  Eye,
  AlertCircle,
  Search,
 
  DollarSign,
  X,
} from "lucide-react";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  query,
  where,
  addDoc,
  orderBy,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useRouter } from "next/navigation";
import Image from "next/image";

interface AdSubmission {
  id: string;
  userId: string;
  shopId: string;
  shopName: string;
  adType: "topBanner" | "thinBanner" | "marketBanner";
  duration: "oneWeek" | "twoWeeks" | "oneMonth";
  imageUrl: string;
  status: "pending" | "approved" | "rejected" | "paid" | "active" | "expired";
  price: number;
  createdAt: Timestamp;
  reviewedAt?: Timestamp;
  rejectionReason?: string;
  paymentLink?: string;
}

const AD_TYPE_CONFIG = {
  topBanner: {
    label: "Top Banner",
    color: "bg-blue-50 text-blue-700",
    icon: "📊",
    description: "Appears at the top of market screen with dominant color",
  },
  thinBanner: {
    label: "Thin Banner",
    color: "bg-orange-50 text-orange-700",
    icon: "📏",
    description: "Horizontal thin banner below the top banner",
  },
  marketBanner: {
    label: "Market Banner",
    color: "bg-purple-50 text-purple-700",
    icon: "🎯",
    description: "Square banners in the market grid section",
  },
};

const DURATION_CONFIG = {
  oneWeek: { label: "1 Hafta", days: 7 },
  twoWeeks: { label: "2 Hafta", days: 14 },
  oneMonth: { label: "1 Ay", days: 30 },
};

const STATUS_TABS = [
  { value: "pending", label: "Bekleyen" },
  { value: "approved", label: "Onaylanan" },
  { value: "rejected", label: "Reddedilen" },
  { value: "paid", label: "Ödenen" },
  { value: "active", label: "Aktif" },
  { value: "expired", label: "Süresi Dolmuş" },
  { value: "all", label: "Tümü" },
];

export default function AdsApplicationsPage() {
  const router = useRouter();
  const [submissions, setSubmissions] = useState<AdSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("pending");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{
    isOpen: boolean;
    submissionId: string | null;
    shopName: string;
  }>({
    isOpen: false,
    submissionId: null,
    shopName: "",
  });
  const [rejectionReason, setRejectionReason] = useState("");

  // Real-time listener for ad submissions
  useEffect(() => {
    let q;

    if (filterStatus === "all") {
      q = query(collection(db, "ad_submissions"), orderBy("createdAt", "desc"));
    } else {
      q = query(
        collection(db, "ad_submissions"),
        where("status", "==", filterStatus),
        orderBy("createdAt", "desc"),
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as AdSubmission[];

      setSubmissions(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [filterStatus]);

  // Filter submissions based on search
  const filteredSubmissions = useMemo(() => {
    if (!searchTerm.trim()) return submissions;

    const term = searchTerm.toLowerCase();
    return submissions.filter(
      (sub) =>
        sub.shopName.toLowerCase().includes(term) ||
        sub.shopId.toLowerCase().includes(term) ||
        sub.userId.toLowerCase().includes(term) ||
        sub.id.toLowerCase().includes(term),
    );
  }, [submissions, searchTerm]);

  const handleApprove = async (submission: AdSubmission) => {
    if (processingId) return;

    try {
      setProcessingId(submission.id);

      const paymentLink = `ad-payment-${submission.id}-${Date.now()}`;

      // Update submission status
      await updateDoc(doc(db, "ad_submissions", submission.id), {
        status: "approved",
        reviewedAt: serverTimestamp(),
        paymentLink,
      });

      // Send notification to user - FIXED: Changed createdAt to timestamp
      await addDoc(collection(db, "shop_notifications"), {
        type: "ad_approved",
        shopId: submission.shopId,
        timestamp: serverTimestamp(),
        isRead: {},
        adType: submission.adType,
        duration: submission.duration,
        price: submission.price,
        imageUrl: submission.imageUrl,
        paymentLink,
        submissionId: submission.id,
        shopName: submission.shopName,
      });

      // Log admin activity
      logAdminActivity("Reklam başvurusu onaylandı", {
        shopName: submission.shopName,
        adType: submission.adType,
      });

      // Show success message
      alert(`✅ Başvuru onaylandı! Kullanıcıya bildirim gönderildi.`);
    } catch (error) {
      console.error("Error approving submission:", error);
      alert("❌ Hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectClick = (submission: AdSubmission) => {
    setRejectModal({
      isOpen: true,
      submissionId: submission.id,
      shopName: submission.shopName,
    });
    setRejectionReason("");
  };

  const handleRejectConfirm = async () => {
    if (!rejectModal.submissionId || !rejectionReason.trim()) {
      alert("Lütfen red nedeni girin.");
      return;
    }

    if (processingId) return;

    try {
      setProcessingId(rejectModal.submissionId);

      const submission = submissions.find(
        (s) => s.id === rejectModal.submissionId,
      );
      if (!submission) return;

      // Update submission status
      await updateDoc(doc(db, "ad_submissions", rejectModal.submissionId), {
        status: "rejected",
        reviewedAt: serverTimestamp(),
        rejectionReason: rejectionReason.trim(),
      });

      // Send notification to user - FIXED: Changed createdAt to timestamp
      await addDoc(collection(db, "shop_notifications"), {
        type: "ad_rejected",
        shopId: submission.shopId,
        timestamp: serverTimestamp(),
        isRead: {},
        adType: submission.adType,
        rejectionReason: rejectionReason.trim(),
        submissionId: submission.id,
        shopName: submission.shopName,
      });

      // Log admin activity
      logAdminActivity("Reklam başvurusu reddedildi", {
        shopName: submission.shopName,
        adType: submission.adType,
      });

      // Close modal and show success
      setRejectModal({ isOpen: false, submissionId: null, shopName: "" });
      setRejectionReason("");
      alert(`✅ Başvuru reddedildi. Kullanıcıya bildirim gönderildi.`);
    } catch (error) {
      console.error("Error rejecting submission:", error);
      alert("❌ Hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (timestamp: Timestamp) => {
    return timestamp.toDate().toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    const config = {
      pending: {
        label: "Beklemede",
        color: "bg-amber-50 text-amber-700",
        icon: <Clock className="w-3 h-3" />,
      },
      approved: {
        label: "Onaylandı",
        color: "bg-emerald-50 text-emerald-700",
        icon: <CheckCircle className="w-3 h-3" />,
      },
      rejected: {
        label: "Reddedildi",
        color: "bg-red-50 text-red-700",
        icon: <XCircle className="w-3 h-3" />,
      },
      paid: {
        label: "Ödendi",
        color: "bg-blue-50 text-blue-700",
        icon: <DollarSign className="w-3 h-3" />,
      },
      active: {
        label: "Aktif",
        color: "bg-emerald-50 text-emerald-700",
        icon: <CheckCircle className="w-3 h-3" />,
      },
      expired: {
        label: "Süresi Dolmuş",
        color: "bg-gray-100 text-gray-500",
        icon: <Clock className="w-3 h-3" />,
      },
    };

    const statusConfig =
      config[status as keyof typeof config] || config.pending;

    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${statusConfig.color}`}
      >
        {statusConfig.icon}
        {statusConfig.label}
      </span>
    );
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50/50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
            <div className="flex items-center justify-between h-14">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.back()}
                  className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition-colors text-sm"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Geri
                </button>
                <div className="w-px h-5 bg-gray-200" />
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-7 h-7 bg-purple-600 rounded-md">
                    <ImageIcon className="w-3.5 h-3.5 text-white" />
                  </div>
                  <h1 className="text-sm font-semibold text-gray-900">
                    Reklam Başvuruları
                  </h1>
                </div>
              </div>

              <span className="text-xs text-gray-500 tabular-nums">
                {loading ? "..." : `${filteredSubmissions.length} başvuru`}
              </span>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4">
          {/* Toolbar: Tabs + Search */}
          <div className="bg-white border border-gray-200 rounded-lg mb-4">
            <div className="flex items-center justify-between gap-4 px-3 py-2 border-b border-gray-100">
              {/* Status Tabs */}
              <div className="flex items-center gap-0.5 overflow-x-auto">
                {STATUS_TABS.map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => setFilterStatus(tab.value)}
                    className={`px-2.5 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                      filterStatus === tab.value
                        ? "bg-purple-50 text-purple-700"
                        : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Ara..."
                  className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="flex items-center justify-center py-16">
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Yükleniyor...
                </div>
              </div>
            )}

            {/* Empty State */}
            {!loading && filteredSubmissions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                  <ImageIcon className="w-5 h-5 text-gray-300" />
                </div>
                <p className="text-sm font-medium text-gray-900 mb-1">
                  Başvuru bulunamadı
                </p>
                <p className="text-xs text-gray-400">
                  {searchTerm
                    ? "Arama kriterlerine uygun başvuru yok"
                    : "Henüz başvuru yapılmamış"}
                </p>
              </div>
            )}

            {/* Table */}
            {!loading && filteredSubmissions.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                      <th className="pl-3 pr-2 py-2.5">Görsel</th>
                      <th className="px-2 py-2.5">Mağaza</th>
                      <th className="px-2 py-2.5">Reklam Tipi</th>
                      <th className="px-2 py-2.5">Süre</th>
                      <th className="px-2 py-2.5">Fiyat</th>
                      <th className="px-2 py-2.5">Tarih</th>
                      <th className="px-2 py-2.5">Durum</th>
                      <th className="pl-2 pr-3 py-2.5 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredSubmissions.map((submission) => (
                      <tr
                        key={submission.id}
                        className="group hover:bg-gray-50/50 transition-colors"
                      >
                        {/* Thumbnail */}
                        <td className="pl-3 pr-2 py-2.5">
                          <button
                            onClick={() =>
                              setSelectedImage(submission.imageUrl)
                            }
                            className="relative w-12 h-8 rounded overflow-hidden bg-gray-100 group/img flex-shrink-0 block"
                          >
                            <Image
                              src={submission.imageUrl}
                              alt="Ad"
                              fill
                              className="object-cover"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover/img:opacity-100">
                              <Eye className="w-3 h-3 text-white" />
                            </div>
                          </button>
                        </td>

                        {/* Shop */}
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <Store className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="font-medium text-gray-900 text-xs truncate max-w-[140px]">
                              {submission.shopName}
                            </span>
                          </div>
                        </td>

                        {/* Ad Type */}
                        <td className="px-2 py-2.5">
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${
                              AD_TYPE_CONFIG[submission.adType].color
                            }`}
                          >
                            <span className="text-[10px]">
                              {AD_TYPE_CONFIG[submission.adType].icon}
                            </span>
                            {AD_TYPE_CONFIG[submission.adType].label}
                          </span>
                        </td>

                        {/* Duration */}
                        <td className="px-2 py-2.5">
                          <span className="text-xs text-gray-600">
                            {DURATION_CONFIG[submission.duration].label}
                          </span>
                        </td>

                        {/* Price */}
                        <td className="px-2 py-2.5">
                          <span className="text-xs font-semibold text-gray-900 tabular-nums">
                            {submission.price.toLocaleString("tr-TR")} ₺
                          </span>
                        </td>

                        {/* Date */}
                        <td className="px-2 py-2.5">
                          <span className="text-[11px] text-gray-400 tabular-nums">
                            {formatDate(submission.createdAt)}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-2 py-2.5">
                          <div className="flex flex-col gap-1">
                            {getStatusBadge(submission.status)}
                            {submission.status === "rejected" &&
                              submission.rejectionReason && (
                                <span
                                  className="text-[10px] text-red-500 truncate max-w-[120px] block"
                                  title={submission.rejectionReason}
                                >
                                  {submission.rejectionReason}
                                </span>
                              )}
                            {submission.status === "approved" && (
                              <span className="text-[10px] text-gray-400">
                                Ödeme bekleniyor
                              </span>
                            )}
                            {submission.status === "paid" && (
                              <span className="text-[10px] text-blue-500">
                                Ödeme tamamlandı
                              </span>
                            )}
                            {submission.status === "active" && (
                              <span className="text-[10px] text-emerald-500">
                                Reklam aktif
                              </span>
                            )}
                            {submission.status === "expired" && (
                              <span className="text-[10px] text-gray-400">
                                Süre doldu
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="pl-2 pr-3 py-2.5 text-right">
                          {submission.status === "pending" && (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleApprove(submission)}
                                disabled={processingId === submission.id}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded text-[11px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {processingId === submission.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <>
                                    <CheckCircle className="w-3 h-3" />
                                    Onayla
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => handleRejectClick(submission)}
                                disabled={processingId === submission.id}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded text-[11px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <XCircle className="w-3 h-3" />
                                Reddet
                              </button>
                            </div>
                          )}
                          {submission.status !== "pending" && (
                            <button
                              onClick={() =>
                                setSelectedImage(submission.imageUrl)
                              }
                              className="inline-flex items-center gap-1 px-2 py-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded text-[11px] transition-colors"
                            >
                              <Eye className="w-3 h-3" />
                              Görüntüle
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>

        {/* Image Modal */}
        {selectedImage && (
          <div
            className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4"
            onClick={() => setSelectedImage(null)}
          >
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-6 h-6 text-white" />
            </button>
            <div className="relative max-w-6xl max-h-[90vh] w-full h-full">
              <Image
                src={selectedImage}
                alt="Ad preview"
                fill
                className="object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        )}

        {/* Rejection Modal */}
        {rejectModal.isOpen && (
          <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4">
            <div
              className="bg-white rounded-lg max-w-sm w-full shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    Başvuruyu Reddet
                  </h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {rejectModal.shopName}
                  </p>
                </div>
                <button
                  onClick={() =>
                    setRejectModal({
                      isOpen: false,
                      submissionId: null,
                      shopName: "",
                    })
                  }
                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="px-4 py-3">
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Red Nedeni *
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Başvurunun neden reddedildiğini açıklayın..."
                  rows={3}
                  className="w-full px-2.5 py-2 border border-gray-200 rounded text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 resize-none"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Bu mesaj kullanıcıya bildirim olarak gönderilecektir.
                </p>

                <div className="flex items-center gap-1.5 mt-3 p-2 bg-red-50 rounded text-[11px] text-red-600">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  Bu işlem geri alınamaz.
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex gap-2 px-4 py-3 border-t border-gray-100">
                <button
                  onClick={() =>
                    setRejectModal({
                      isOpen: false,
                      submissionId: null,
                      shopName: "",
                    })
                  }
                  disabled={!!processingId}
                  className="flex-1 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  İptal
                </button>
                <button
                  onClick={handleRejectConfirm}
                  disabled={!rejectionReason.trim() || !!processingId}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white text-xs font-medium rounded transition-colors disabled:cursor-not-allowed"
                >
                  {processingId === rejectModal.submissionId ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <>
                      <XCircle className="w-3 h-3" />
                      Reddet
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
