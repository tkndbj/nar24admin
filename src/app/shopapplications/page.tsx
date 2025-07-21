"use client";

import { useState, useEffect } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  ArrowLeft,
  Eye,
  Calendar,
  Phone,
  MapPin,
  Tag,
  Image as ImageIcon,
  FileText,
  Store,
  User,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  X, // ADD THIS
  MessageSquare,
} from "lucide-react";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useRouter } from "next/navigation";
import Image from "next/image";

interface ShopApplication {
  id: string;
  name: string;
  contactNo: string;
  address: string;
  categories?: string[];
  coverImageUrl: string;
  profileImageUrl: string;
  taxPlateCertificateUrl: string;
  ownerId: string;
  status: string;
  createdAt: Timestamp;
}

interface RejectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  shopName: string;
  isLoading: boolean;
}

const RejectionModal: React.FC<RejectionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  shopName,
  isLoading,
}) => {
  const [reason, setReason] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim()) {
      onConfirm(reason.trim());
    }
  };

  const handleClose = () => {
    setReason("");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-slate-900 border border-white/20 rounded-xl max-w-md w-full">
        <div className="flex items-center justify-between p-4 border-b border-white/20">
          <h3 className="text-lg font-bold text-white">Reddetme Nedeni</h3>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4">
          <p className="text-sm text-gray-300 mb-4">
            <strong>{shopName}</strong> mağaza başvurusunu neden
            reddediyorsunuz?
          </p>

          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reddetme nedeninizi buraya yazın..."
            className="w-full h-32 px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-red-500"
            disabled={isLoading}
            required
          />

          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isLoading || !reason.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 text-white rounded-lg transition-colors"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Reddediliyor...
                </>
              ) : (
                <>
                  <MessageSquare className="w-4 h-4" />
                  Reddet
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default function ShopApplicationsPage() {
  const router = useRouter();
  const [applications, setApplications] = useState<ShopApplication[]>([]);
  const [selectedApplication, setSelectedApplication] =
    useState<ShopApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [rejectionModal, setRejectionModal] = useState({
    isOpen: false,
    application: null as ShopApplication | null,
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "shopApplications"),
      (snapshot) => {
        const applicationsData = snapshot.docs
          .map(
            (doc) =>
              ({
                id: doc.id,
                ...doc.data(),
              } as ShopApplication)
          )
          .filter((app) => app.status === "pending");

        setApplications(applicationsData);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const formatDate = (timestamp: Timestamp) => {
    return timestamp.toDate().toLocaleDateString("tr-TR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getCategoryName = (categoryCode: string) => {
    // You can expand this mapping based on your category codes
    const categoryMap: { [key: string]: string } = {
      electronics: "Elektronik",
      clothing: "Giyim",
      food: "Yiyecek",
      books: "Kitap",
      home: "Ev & Yaşam",
      sports: "Spor",
      beauty: "Güzellik",
      automotive: "Otomotiv",
      // Add more categories as needed
    };
    return categoryMap[categoryCode] || categoryCode;
  };

  const approveApplication = async (application: ShopApplication) => {
    setProcessing(true);
    try {
      // Process cover images
      const coverImageUrls = application.coverImageUrl
        .split(",")
        .map((url) => url.trim())
        .filter((url) => url.length > 0);

      // Create the shop
      const shopRef = await addDoc(collection(db, "shops"), {
        ownerId: application.ownerId,
        name: application.name,
        contactNo: application.contactNo,
        address: application.address,
        categories: application.categories,
        coverImageUrls: coverImageUrls,
        profileImageUrl: application.profileImageUrl,
        taxPlateCertificateUrl: application.taxPlateCertificateUrl,
        createdAt: serverTimestamp(),
        isBoosted: false,
        stockBadgeAcknowledged: true,
        transactionsBadgeAcknowledged: true,
        averageRating: 0.0,
        reviewCount: 0,
        clickCount: 0,
        followerCount: 0,
      });

      // Update application status
      await updateDoc(doc(db, "shopApplications", application.id), {
        status: "approved",
      });

      // Update user verified status
      await updateDoc(doc(db, "users", application.ownerId), {
        verified: true,
      });

      // UPDATED: Send notification with proper fields and shopId
      await addDoc(
        collection(db, "users", application.ownerId, "notifications"),
        {
          type: "shop_approved",
          shopId: shopRef.id, // ADD: The newly created shop's ID
          timestamp: serverTimestamp(),
          isRead: false,
          // ADD: All message variants
          message: "Tap to visit your shop.",
          message_en: "Tap to visit your shop.",
          message_tr: "Mağazanızı ziyaret etmek için dokunun.",
          message_ru: "Нажмите, чтобы посетить свой магазин.",
          // REMOVE: title field (not needed, handled by notification type)
        }
      );

      setSelectedApplication(null);
    } catch (error) {
      console.error("Error approving application:", error);
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = (application: ShopApplication) => {
    setRejectionModal({
      isOpen: true,
      application: application,
    });
  };

  const handleRejectConfirm = async (rejectionReason: string) => {
    const application = rejectionModal.application;
    if (!application) return;

    setProcessing(true);
    try {
      console.log("Rejecting shop application:", application.id);
      console.log("Rejection reason:", rejectionReason);

      // Update application status
      await updateDoc(doc(db, "shopApplications", application.id), {
        status: "disapproved",
      });

      // UPDATED: Send notification with rejection reason
      await addDoc(
        collection(db, "users", application.ownerId, "notifications"),
        {
          type: "shop_disapproved",
          timestamp: serverTimestamp(),
          isRead: false,
          // ADD: All message variants with rejection reason
          message: "Your shop application has been rejected.",
          message_en: "Your shop application has been rejected.",
          message_tr: "Mağaza başvurunuz reddedildi.",
          message_ru: "Ваша заявка на магазин была отклонена.",
          rejectionReason: rejectionReason, // ADD: Store the rejection reason
        }
      );

      // Close modal and clear selection
      setRejectionModal({ isOpen: false, application: null });
      setSelectedApplication(null);
      alert("Başvuru başarıyla reddedildi!");
    } catch (error) {
      console.error("Error rejecting application:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Bilinmeyen hata";
      alert(`Reddetme sırasında hata oluştu: ${errorMessage}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectCancel = () => {
    setRejectionModal({ isOpen: false, application: null });
  };

  if (selectedApplication) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
          {/* Header */}
          <header className="backdrop-blur-xl bg-white/10 border-b border-white/20 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedApplication(null)}
                    className="flex items-center justify-center w-8 h-8 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5 text-white" />
                  </button>
                  <h1 className="text-xl font-bold text-white">
                    Başvuru Detayları
                  </h1>
                </div>
              </div>
            </div>
          </header>

          {/* Application Details */}
          <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl overflow-hidden">
              {/* Cover Images */}
              <div className="h-64 bg-gradient-to-r from-gray-800 to-gray-900 relative">
                {selectedApplication.coverImageUrl ? (
                  <div className="flex gap-2 p-4 overflow-x-auto h-full">
                    {selectedApplication.coverImageUrl
                      .split(",")
                      .map((url, index) => (
                        <div
                          key={index}
                          className="relative h-full w-64 flex-shrink-0"
                        >
                          <Image
                            src={url.trim()}
                            alt={`Cover ${index + 1}`}
                            fill
                            className="object-cover rounded-lg"
                          />
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <ImageIcon className="w-16 h-16 text-gray-400" />
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-6 sm:p-8">
                {/* Shop Name */}
                <div className="flex items-center gap-3 mb-6">
                  <Store className="w-8 h-8 text-blue-400" />
                  <h2 className="text-3xl font-bold text-white">
                    {selectedApplication.name}
                  </h2>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Phone className="w-5 h-5 text-green-400" />
                      <div>
                        <p className="text-sm text-gray-300">
                          İletişim Numarası
                        </p>
                        <p className="text-white font-medium">
                          {selectedApplication.contactNo}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <MapPin className="w-5 h-5 text-red-400 mt-1" />
                      <div>
                        <p className="text-sm text-gray-300">Adres</p>
                        <p className="text-white font-medium">
                          {selectedApplication.address}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <Tag className="w-5 h-5 text-purple-400 mt-1" />
                      <div>
                        <p className="text-sm text-gray-300">Kategoriler</p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {(selectedApplication.categories || []).map(
                            (category, index) => (
                              <span
                                key={index}
                                className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded-md text-sm"
                              >
                                {getCategoryName(category)}
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Calendar className="w-5 h-5 text-yellow-400" />
                      <div>
                        <p className="text-sm text-gray-300">Başvuru Tarihi</p>
                        <p className="text-white font-medium">
                          {formatDate(selectedApplication.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Images Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  {/* Profile Image */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <User className="w-5 h-5 text-blue-400" />
                      <h3 className="text-lg font-semibold text-white">
                        Profil Resmi
                      </h3>
                    </div>
                    <div className="relative h-48 bg-gray-800 rounded-lg overflow-hidden">
                      {selectedApplication.profileImageUrl ? (
                        <Image
                          src={selectedApplication.profileImageUrl}
                          alt="Profile"
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <ImageIcon className="w-12 h-12 text-gray-400" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tax Certificate */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <FileText className="w-5 h-5 text-green-400" />
                      <h3 className="text-lg font-semibold text-white">
                        Vergi Levhası
                      </h3>
                    </div>
                    <div className="relative h-48 bg-gray-800 rounded-lg overflow-hidden">
                      {selectedApplication.taxPlateCertificateUrl ? (
                        <Image
                          src={selectedApplication.taxPlateCertificateUrl}
                          alt="Tax Certificate"
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <FileText className="w-12 h-12 text-gray-400" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={() => approveApplication(selectedApplication)}
                    disabled={processing}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold rounded-lg transition-all duration-200 disabled:cursor-not-allowed"
                  >
                    {processing ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <CheckCircle className="w-5 h-5" />
                    )}
                    Onayla
                  </button>
                  <button
                    onClick={() => handleReject(selectedApplication)}
                    disabled={processing}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold rounded-lg transition-all duration-200 disabled:cursor-not-allowed"
                  >
                    {processing ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <XCircle className="w-5 h-5" />
                    )}
                    Reddet
                  </button>
                </div>
              </div>
            </div>
          </main>
        </div>
        <RejectionModal
          isOpen={rejectionModal.isOpen}
          onClose={handleRejectCancel}
          onConfirm={handleRejectConfirm}
          shopName={rejectionModal.application?.name || ""}
          isLoading={processing}
        />
      </ProtectedRoute>
    );
  }

  return (
    <>
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
          {/* Header */}
          <header className="backdrop-blur-xl bg-white/10 border-b border-white/20 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => router.back()}
                    className="flex items-center justify-center w-8 h-8 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5 text-white" />
                  </button>
                  <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg">
                    <Store className="w-5 h-5 text-white" />
                  </div>
                  <h1 className="text-xl font-bold text-white">
                    Dükkan Başvuruları
                  </h1>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/20 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-blue-300">
                    {applications.length} bekleyen başvuru
                  </span>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                <span className="ml-3 text-gray-300">
                  Başvurular yükleniyor...
                </span>
              </div>
            ) : applications.length === 0 ? (
              <div className="text-center py-12">
                <div className="flex items-center justify-center w-16 h-16 bg-gray-500/20 rounded-full mx-auto mb-4">
                  <Store className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">
                  Bekleyen başvuru yok
                </h3>
                <p className="text-gray-300">
                  Şu anda onay bekleyen dükkan başvurusu bulunmuyor.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {applications.map((application) => (
                  <div
                    key={application.id}
                    className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-6 hover:bg-white/15 transition-all duration-200 cursor-pointer group"
                    onClick={() => setSelectedApplication(application)}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="relative w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg overflow-hidden flex-shrink-0">
                          {application.profileImageUrl ? (
                            <Image
                              src={application.profileImageUrl}
                              alt={application.name}
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex items-center justify-center h-full">
                              <Store className="w-6 h-6 text-white" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-white group-hover:text-blue-300 transition-colors">
                            {application.name}
                          </h3>
                          <div className="flex items-center gap-4 mt-1 text-sm text-gray-300">
                            <div className="flex items-center gap-1">
                              <Phone className="w-4 h-4" />
                              {application.contactNo}
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {formatDate(application.createdAt)}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {(application.categories || [])
                              .slice(0, 3)
                              .map((category, index) => (
                                <span
                                  key={index}
                                  className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded text-xs"
                                >
                                  {getCategoryName(category)}
                                </span>
                              ))}
                            {(application.categories || []).length > 3 && (
                              <span className="px-2 py-1 bg-gray-500/20 text-gray-300 rounded text-xs">
                                +{(application.categories || []).length - 3}{" "}
                                daha
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 px-3 py-1 bg-yellow-500/20 text-yellow-300 rounded-full text-sm">
                          <AlertCircle className="w-4 h-4" />
                          Bekliyor
                        </div>
                        <div className="flex items-center justify-center w-8 h-8 bg-white/10 group-hover:bg-white/20 rounded-lg transition-colors">
                          <Eye className="w-4 h-4 text-white" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>
        </div>
      </ProtectedRoute>
    </>
  );
}
