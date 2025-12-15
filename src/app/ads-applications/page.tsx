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
  Calendar,
  Loader2,
  Eye,
  AlertCircle,
  Search,
  Filter,
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
  status: "pending" | "approved" | "rejected" | "paid" | "active";
  price: number;
  createdAt: Timestamp;
  reviewedAt?: Timestamp;
  rejectionReason?: string;
  paymentLink?: string;
}

const AD_TYPE_CONFIG = {
  topBanner: {
    label: "Top Banner",
    color: "bg-blue-100 text-blue-700 border-blue-200",
    icon: "📊",
    description: "Appears at the top of market screen with dominant color",
  },
  thinBanner: {
    label: "Thin Banner",
    color: "bg-orange-100 text-orange-700 border-orange-200",
    icon: "📏",
    description: "Horizontal thin banner below the top banner",
  },
  marketBanner: {
    label: "Market Banner",
    color: "bg-purple-100 text-purple-700 border-purple-200",
    icon: "🎯",
    description: "Square banners in the market grid section",
  },
};

const DURATION_CONFIG = {
  oneWeek: { label: "1 Hafta", days: 7 },
  twoWeeks: { label: "2 Hafta", days: 14 },
  oneMonth: { label: "1 Ay", days: 30 },
};

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
      q = query(
        collection(db, "ad_submissions"),
        orderBy("createdAt", "desc")
      );
    } else {
      q = query(
        collection(db, "ad_submissions"),
        where("status", "==", filterStatus),
        orderBy("createdAt", "desc")
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
        sub.id.toLowerCase().includes(term)
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
      await addDoc(
        collection(db, "users", submission.userId, "notifications"),
        {
          type: "ad_approved",
          timestamp: serverTimestamp(), // ✅ CHANGED FROM createdAt
          isRead: false,
          adTypeLabel: AD_TYPE_CONFIG[submission.adType].label,
          message: `${submission.shopName} mağazanız için ${AD_TYPE_CONFIG[submission.adType].label} başvurunuz onaylandı. Ödeme yapmak için tıklayın.`,
          message_en: `Your ${AD_TYPE_CONFIG[submission.adType].label} application for ${submission.shopName} has been approved. Click to proceed with payment.`,
          message_tr: `${submission.shopName} mağazanız için ${AD_TYPE_CONFIG[submission.adType].label} başvurunuz onaylandı. Ödeme yapmak için tıklayın.`,
          adType: submission.adType,
          duration: submission.duration,
          price: submission.price,
          imageUrl: submission.imageUrl,
          shopId: submission.shopId,
          paymentLink,
          submissionId: submission.id,
          shopName: submission.shopName,
        }
      );

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
        (s) => s.id === rejectModal.submissionId
      );
      if (!submission) return;

      // Update submission status
      await updateDoc(doc(db, "ad_submissions", rejectModal.submissionId), {
        status: "rejected",
        reviewedAt: serverTimestamp(),
        rejectionReason: rejectionReason.trim(),
      });

      // Send notification to user - FIXED: Changed createdAt to timestamp
      await addDoc(
        collection(db, "users", submission.userId, "notifications"),
        {
          type: "ad_rejected",
          timestamp: serverTimestamp(), // ✅ CHANGED FROM createdAt
          isRead: false,
          message: `${submission.shopName} mağazanız için ${AD_TYPE_CONFIG[submission.adType].label} başvurunuz reddedildi. Neden: ${rejectionReason.trim()}`,
          message_en: `Your ${AD_TYPE_CONFIG[submission.adType].label} application for ${submission.shopName} has been rejected. Reason: ${rejectionReason.trim()}`,
          message_tr: `${submission.shopName} mağazanız için ${AD_TYPE_CONFIG[submission.adType].label} başvurunuz reddedildi. Neden: ${rejectionReason.trim()}`,
          adType: submission.adType,
          shopId: submission.shopId,
          rejectionReason: rejectionReason.trim(),
          submissionId: submission.id,          
          shopName: submission.shopName,
        }
      );

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
        color: "bg-yellow-100 text-yellow-700 border-yellow-200",
        icon: <Clock className="w-3 h-3" />,
      },
      approved: {
        label: "Onaylandı",
        color: "bg-green-100 text-green-700 border-green-200",
        icon: <CheckCircle className="w-3 h-3" />,
      },
      rejected: {
        label: "Reddedildi",
        color: "bg-red-100 text-red-700 border-red-200",
        icon: <XCircle className="w-3 h-3" />,
      },
      paid: {
        label: "Ödendi",
        color: "bg-blue-100 text-blue-700 border-blue-200",
        icon: <DollarSign className="w-3 h-3" />,
      },
      active: {
        label: "Aktif",
        color: "bg-green-100 text-green-700 border-green-200",
        icon: <CheckCircle className="w-3 h-3" />,
      },
    };

    const statusConfig = config[status as keyof typeof config] || config.pending;

    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border ${statusConfig.color}`}
      >
        {statusConfig.icon}
        {statusConfig.label}
      </span>
    );
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.back()}
                  className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-100"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="font-medium">Geri</span>
                </button>

                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 bg-purple-600 rounded-lg">
                    <ImageIcon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h1 className="text-xl font-semibold text-gray-900">
                      Reklam Başvuruları
                    </h1>
                    <p className="text-sm text-gray-500">
                      Kullanıcı reklam başvurularını yönetin
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="bg-purple-50 px-4 py-2 rounded-lg border border-purple-200">
                  <span className="text-sm text-purple-700 font-medium">
                    {loading ? "..." : `${filteredSubmissions.length} Başvuru`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-6 py-6">
          {/* Filters and Search */}
          <div className="mb-6 flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Mağaza adı, ID ile ara..."
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm"
              >
                <option value="pending">Bekleyen</option>
                <option value="approved">Onaylanan</option>
                <option value="rejected">Reddedilen</option>
                <option value="paid">Ödenen</option>
                <option value="active">Aktif</option>
                <option value="all">Tümü</option>
              </select>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3 text-gray-600">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Başvurular yükleniyor...</span>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!loading && filteredSubmissions.length === 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                <ImageIcon className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Başvuru bulunamadı
              </h3>
              <p className="text-gray-500">
                {searchTerm
                  ? "Arama kriterlerine uygun başvuru bulunamadı"
                  : "Henüz başvuru yapılmamış"}
              </p>
            </div>
          )}

          {/* Submissions Grid */}
          {!loading && filteredSubmissions.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredSubmissions.map((submission) => (
                <div
                  key={submission.id}
                  className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow"
                >
                  {/* Image */}
                  <div className="relative aspect-video bg-gray-100 group">
                    <Image
                      src={submission.imageUrl}
                      alt="Ad submission"
                      fill
                      className="object-cover"
                    />
                    <button
                      onClick={() => setSelectedImage(submission.imageUrl)}
                      className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100"
                    >
                      <div className="bg-white rounded-full p-3">
                        <Eye className="w-5 h-5 text-gray-900" />
                      </div>
                    </button>
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Store className="w-4 h-4 text-gray-500" />
                          <h3 className="font-semibold text-gray-900">
                            {submission.shopName}
                          </h3>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border ${
                            AD_TYPE_CONFIG[submission.adType].color
                          }`}
                        >
                          <span>{AD_TYPE_CONFIG[submission.adType].icon}</span>
                          {AD_TYPE_CONFIG[submission.adType].label}
                        </span>
                      </div>
                      {getStatusBadge(submission.status)}
                    </div>

                    {/* Info */}
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Calendar className="w-4 h-4" />
                        <span>{formatDate(submission.createdAt)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                          <Clock className="w-4 h-4" />
                          <span>{DURATION_CONFIG[submission.duration].label}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <DollarSign className="w-4 h-4 text-gray-900" />
                          <span className="font-bold text-gray-900">
                            {submission.price.toLocaleString("tr-TR")} TL
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-gray-500 mb-4">
                      {AD_TYPE_CONFIG[submission.adType].description}
                    </p>

                    {/* Rejection Reason */}
                    {submission.status === "rejected" &&
                      submission.rejectionReason && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-xs font-medium text-red-900 mb-1">
                                Red Nedeni:
                              </p>
                              <p className="text-xs text-red-700">
                                {submission.rejectionReason}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                    {/* Actions */}
                    {submission.status === "pending" && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(submission)}
                          disabled={processingId === submission.id}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors disabled:cursor-not-allowed text-sm"
                        >
                          {processingId === submission.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4" />
                              Onayla
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleRejectClick(submission)}
                          disabled={processingId === submission.id}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors disabled:cursor-not-allowed text-sm"
                        >
                          <XCircle className="w-4 h-4" />
                          Reddet
                        </button>
                      </div>
                    )}

                    {/* Info for approved/paid/active */}
                    {(submission.status === "approved" ||
                      submission.status === "paid" ||
                      submission.status === "active") && (
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-xs text-blue-900">
                          {submission.status === "approved" &&
                            "✅ Onaylandı - Ödeme bekleniyor"}
                          {submission.status === "paid" &&
                            "💳 Ödeme tamamlandı"}
                          {submission.status === "active" && "🎉 Reklam aktif"}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
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
          <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
            <div
              className="bg-white rounded-xl max-w-md w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Başvuruyu Reddet
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
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
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Red Nedeni *
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Başvurunun neden reddedildiğini açıklayın..."
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm resize-none"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Bu mesaj kullanıcıya bildirim olarak gönderilecektir.
                  </p>
                </div>

                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  <p className="text-xs text-red-700">
                    Bu işlem geri alınamaz. Kullanıcı reddetme sebebini
                    görebilecektir.
                  </p>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex gap-3 p-6 border-t border-gray-200">
                <button
                  onClick={() =>
                    setRejectModal({
                      isOpen: false,
                      submissionId: null,
                      shopName: "",
                    })
                  }
                  disabled={!!processingId}
                  className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-900 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  İptal
                </button>
                <button
                  onClick={handleRejectConfirm}
                  disabled={!rejectionReason.trim() || !!processingId}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors disabled:cursor-not-allowed text-sm"
                >
                  {processingId === rejectModal.submissionId ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <XCircle className="w-4 h-4" />
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