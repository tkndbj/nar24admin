"use client";

import { useState, useEffect } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  ArrowLeft,
  Phone,
  FileText,
  Store,
  User,
  CheckCircle,
  XCircle,
  Loader2,
  X,
  MessageSquare,
  Download,
  ChevronLeft,
  ChevronRight,
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
  latitude: number;
  longitude: number;
}

interface RejectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  shopName: string;
  isLoading: boolean;
}

interface ImageModalProps {
  isOpen: boolean;
  images: { url: string; type: string; title: string }[];
  currentIndex: number;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  shopName: string;
}

const ImageModal: React.FC<ImageModalProps> = ({
  isOpen,
  images,
  currentIndex,
  onClose,
  onPrevious,
  onNext,
  shopName,
}) => {
  if (!isOpen || !images[currentIndex]) return null;

  const currentImage = images[currentIndex];

  const downloadImage = async () => {
    try {
      const response = await fetch(currentImage.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${shopName}_${currentImage.type}_${
        currentIndex + 1
      }.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-[70] flex items-center justify-center">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 bg-black/50 backdrop-blur-sm p-4 z-10">
        <div className="flex items-center justify-between text-white">
          <div>
            <h3 className="text-lg font-semibold">{shopName}</h3>
            <p className="text-sm text-gray-300">{currentImage.title}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={downloadImage}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              <span className="text-sm">İndir</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Navigation */}
      {images.length > 1 && (
        <>
          <button
            onClick={onPrevious}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors z-10"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={onNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors z-10"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      {/* Image */}
      <div className="relative max-w-7xl max-h-full p-16">
        <img
          src={currentImage.url}
          alt={currentImage.title}
          className="max-w-full max-h-full object-contain"
        />
      </div>

      {/* Thumbnail Navigation */}
      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 bg-black/50 backdrop-blur-sm p-3 rounded-lg">
          {images.map((image, index) => (
            <button
              key={index}
              onClick={() => {
                /* You can add index selection logic here */
              }}
              className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                index === currentIndex
                  ? "border-blue-400"
                  : "border-white/30 hover:border-white/60"
              }`}
            >
              <img
                src={image.url}
                alt={`Thumbnail ${index + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white border border-gray-200 rounded-xl max-w-md w-full shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">
            Reddetme Nedeni
          </h3>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4">
          <p className="text-sm text-gray-600 mb-3">
            <strong className="text-gray-900">{shopName}</strong> mağaza
            başvurusunu neden reddediyorsunuz?
          </p>

          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reddetme nedeninizi buraya yazın..."
            className="w-full h-24 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
            disabled={isLoading}
            required
          />

          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="flex-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors disabled:opacity-50 text-sm"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isLoading || !reason.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-medium rounded-lg transition-colors text-sm"
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
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [rejectionModal, setRejectionModal] = useState({
    isOpen: false,
    application: null as ShopApplication | null,
  });
  const [imageModal, setImageModal] = useState({
    isOpen: false,
    images: [] as { url: string; type: string; title: string }[],
    currentIndex: 0,
    shopName: "",
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
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getCategoryName = (categoryCode: string) => {
    const categoryMap: { [key: string]: string } = {
      electronics: "Elektronik",
      clothing: "Giyim",
      food: "Yiyecek",
      books: "Kitap",
      home: "Ev & Yaşam",
      sports: "Spor",
      beauty: "Güzellik",
      automotive: "Otomotiv",
    };
    return categoryMap[categoryCode] || categoryCode;
  };

  const openImageModal = (
    application: ShopApplication,
    imageType: "cover" | "profile" | "tax"
  ) => {
    const images = [];

    if (imageType === "cover" && application.coverImageUrl) {
      const coverUrls = application.coverImageUrl
        .split(",")
        .map((url) => url.trim())
        .filter((url) => url);
      coverUrls.forEach((url, index) => {
        images.push({
          url,
          type: "cover",
          title: `Kapak Resmi ${index + 1}`,
        });
      });
    } else if (imageType === "profile" && application.profileImageUrl) {
      images.push({
        url: application.profileImageUrl,
        type: "profile",
        title: "Profil Resmi",
      });
    } else if (imageType === "tax" && application.taxPlateCertificateUrl) {
      images.push({
        url: application.taxPlateCertificateUrl,
        type: "tax",
        title: "Vergi Levhası",
      });
    }

    if (images.length > 0) {
      setImageModal({
        isOpen: true,
        images,
        currentIndex: 0,
        shopName: application.name,
      });
    }
  };

  const approveApplication = async (application: ShopApplication) => {
    setProcessing(true);
    try {
      const coverImageUrls = application.coverImageUrl
        .split(",")
        .map((url) => url.trim())
        .filter((url) => url.length > 0);

      const shopRef = await addDoc(collection(db, "shops"), {
        ownerId: application.ownerId,
        name: application.name,
        contactNo: application.contactNo,
        address: application.address,
        categories: application.categories,
        latitude: application.latitude, // ADD THIS LINE
        longitude: application.longitude,
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

      await updateDoc(doc(db, "shopApplications", application.id), {
        status: "approved",
      });

      await updateDoc(doc(db, "users", application.ownerId), {
        [`memberOfShops.${shopRef.id}`]: "owner",
        verified: true,
      });

      await addDoc(
        collection(db, "users", application.ownerId, "notifications"),
        {
          type: "shop_approved",
          shopId: shopRef.id,
          timestamp: serverTimestamp(),
          isRead: false,
          message: "Tap to visit your shop.",
          message_en: "Tap to visit your shop.",
          message_tr: "Mağazanızı ziyaret etmek için dokunun.",
          message_ru: "Нажмите, чтобы посетить свой магазин.",
        }
      );

      alert("Başvuru başarıyla onaylandı!");
    } catch (error) {
      console.error("Error approving application:", error);
      alert("Onaylama sırasında hata oluştu");
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
      await updateDoc(doc(db, "shopApplications", application.id), {
        status: "disapproved",
      });

      await addDoc(
        collection(db, "users", application.ownerId, "notifications"),
        {
          type: "shop_disapproved",
          timestamp: serverTimestamp(),
          isRead: false,
          message: "Your shop application has been rejected.",
          message_en: "Your shop application has been rejected.",
          message_tr: "Mağaza başvurunuz reddedildi.",
          message_ru: "Ваша заявка на магазин была отклонена.",
          rejectionReason: rejectionReason,
        }
      );

      setRejectionModal({ isOpen: false, application: null });
      alert("Başvuru başarıyla reddedildi!");
    } catch (error) {
      console.error("Error rejecting application:", error);
      alert("Reddetme sırasında hata oluştu");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 shadow-sm">
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
                  <div className="flex items-center justify-center w-8 h-8 bg-green-600 rounded-lg">
                    <Store className="w-4 h-4 text-white" />
                  </div>
                  <h1 className="text-xl font-semibold text-gray-900">
                    Mağaza Başvuruları
                  </h1>
                </div>
              </div>

              <div className="bg-blue-50 px-4 py-2 rounded-lg border border-blue-200">
                <span className="text-sm text-blue-700 font-medium">
                  {loading ? "Yükleniyor..." : `${applications.length} Başvuru`}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-6 py-6">
          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3 text-gray-600">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Başvurular yükleniyor...</span>
              </div>
            </div>
          )}

          {/* No Applications */}
          {!loading && applications.length === 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-gray-100 rounded-lg mb-4">
                <Store className="w-6 h-6 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Başvuru bulunamadı
              </h3>
              <p className="text-gray-500">
                Henüz onay bekleyen mağaza başvurusu bulunmamaktadır.
              </p>
            </div>
          )}

          {/* Applications Table */}
          {!loading && applications.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* Table Header */}
              <div className="bg-gray-50 border-b border-gray-200 px-6 py-3">
                <div className="grid grid-cols-12 gap-4 text-xs font-medium text-gray-700 uppercase tracking-wide">
                  <div className="col-span-1">Profil</div>
                  <div className="col-span-2">Mağaza Bilgileri</div>
                  <div className="col-span-2">İletişim</div>
                  <div className="col-span-2">Kategoriler</div>
                  <div className="col-span-2">Görseller</div>
                  <div className="col-span-1">Tarih</div>
                  <div className="col-span-2 text-center">İşlemler</div>
                </div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-gray-200">
                {applications.map((application) => (
                  <div
                    key={application.id}
                    className="px-6 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="grid grid-cols-12 gap-4 items-center">
                      {/* Profile Image */}
                      <div className="col-span-1">
                        {application.profileImageUrl ? (
                          <img
                            src={application.profileImageUrl}
                            alt="Profil"
                            className="w-12 h-12 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() =>
                              openImageModal(application, "profile")
                            }
                          />
                        ) : (
                          <div className="w-12 h-12 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center">
                            <User className="w-5 h-5 text-gray-400" />
                          </div>
                        )}
                      </div>

                      {/* Shop Info */}
                      <div className="col-span-2">
                        <h3 className="font-medium text-gray-900 line-clamp-1 mb-1">
                          {application.name}
                        </h3>
                        <p className="text-sm text-gray-600 line-clamp-2">
                          {application.address}
                        </p>
                      </div>

                      {/* Contact */}
                      <div className="col-span-2">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Phone className="w-4 h-4" />
                          <span>{application.contactNo}</span>
                        </div>
                      </div>

                      {/* Categories */}
                      <div className="col-span-2">
                        <div className="flex flex-wrap gap-1">
                          {(application.categories || [])
                            .slice(0, 2)
                            .map((category, index) => (
                              <span
                                key={index}
                                className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium"
                              >
                                {getCategoryName(category)}
                              </span>
                            ))}
                          {(application.categories || []).length > 2 && (
                            <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-medium">
                              +{(application.categories || []).length - 2}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Images */}
                      <div className="col-span-2">
                        <div className="flex items-center gap-2">
                          {/* Cover Images */}
                          {application.coverImageUrl && (
                            <button
                              onClick={() =>
                                openImageModal(application, "cover")
                              }
                              className="relative"
                            >
                              <img
                                src={application.coverImageUrl
                                  .split(",")[0]
                                  .trim()}
                                alt="Kapak"
                                className="w-8 h-8 object-cover rounded border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity"
                              />
                              {application.coverImageUrl.split(",").length >
                                1 && (
                                <div className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-medium">
                                  {application.coverImageUrl.split(",").length}
                                </div>
                              )}
                            </button>
                          )}

                          {/* Tax Certificate */}
                          {application.taxPlateCertificateUrl && (
                            <button
                              onClick={() => openImageModal(application, "tax")}
                              className="w-8 h-8 bg-green-100 rounded border border-green-200 flex items-center justify-center cursor-pointer hover:bg-green-200 transition-colors"
                            >
                              <FileText className="w-4 h-4 text-green-600" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Date */}
                      <div className="col-span-1">
                        <span className="text-sm text-gray-600">
                          {formatDate(application.createdAt)}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="col-span-2">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => approveApplication(application)}
                            disabled={processing}
                            className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
                          >
                            {processing ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <CheckCircle className="w-4 h-4" />
                            )}
                            <span>Onayla</span>
                          </button>

                          <button
                            onClick={() => handleReject(application)}
                            disabled={processing}
                            className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
                          >
                            {processing ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <XCircle className="w-4 h-4" />
                            )}
                            <span>Reddet</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* Image Modal */}
        <ImageModal
          isOpen={imageModal.isOpen}
          images={imageModal.images}
          currentIndex={imageModal.currentIndex}
          onClose={() => setImageModal((prev) => ({ ...prev, isOpen: false }))}
          onPrevious={() =>
            setImageModal((prev) => ({
              ...prev,
              currentIndex: Math.max(0, prev.currentIndex - 1),
            }))
          }
          onNext={() =>
            setImageModal((prev) => ({
              ...prev,
              currentIndex: Math.min(
                prev.images.length - 1,
                prev.currentIndex + 1
              ),
            }))
          }
          shopName={imageModal.shopName}
        />

        {/* Rejection Modal */}
        <RejectionModal
          isOpen={rejectionModal.isOpen}
          onClose={() =>
            setRejectionModal({ isOpen: false, application: null })
          }
          onConfirm={handleRejectConfirm}
          shopName={rejectionModal.application?.name || ""}
          isLoading={processing}
        />
      </div>
    </ProtectedRoute>
  );
}
