"use client";

import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  ArrowLeft,
  FileText,
  User,
  Mail,
  Receipt,
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  Calendar,
  Search,
  Package,
  Store,
  DollarSign,
  X,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
  Timestamp,
  getDoc,
  addDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useRouter } from "next/navigation";

interface RefundForm {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  receiptNo: string;
  description: string;
  status: "pending" | "approved" | "rejected";
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  adminNote?: string;
  productName?: string;
  sellerName?: string;
  price?: number;
  productImage?: string;
}

export default function RefundFormsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [refundForms, setRefundForms] = useState<RefundForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedForm, setSelectedForm] = useState<RefundForm | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "approved" | "rejected"
  >("all");

  useEffect(() => {
    const q = query(
      collection(db, "refund-forms"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const formsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as RefundForm[];
      setRefundForms(formsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredForms = useMemo(() => {
    let filtered = refundForms;

    if (statusFilter !== "all") {
      filtered = filtered.filter((form) => form.status === statusFilter);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (form) =>
          form.displayName.toLowerCase().includes(term) ||
          form.email.toLowerCase().includes(term) ||
          form.receiptNo.toLowerCase().includes(term) ||
          form.productName?.toLowerCase().includes(term) ||
          form.sellerName?.toLowerCase().includes(term) ||
          form.id.toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [refundForms, statusFilter, searchTerm]);

  const handleViewDetails = (form: RefundForm) => {
    setSelectedForm(form);
    setAdminNote(form.adminNote || "");
  };

  const handleCloseModal = () => {
    setSelectedForm(null);
    setAdminNote("");
  };

  const handleUpdateStatus = async (
    formId: string,
    newStatus: "approved" | "rejected"
  ) => {
    if (!formId) return;

    setUpdatingStatus(true);
    try {
      const formRef = doc(db, "refund-forms", formId);

      const formDoc = await getDoc(formRef);
      if (!formDoc.exists()) {
        throw new Error("Form not found");
      }

      const formData = formDoc.data() as RefundForm;

      await updateDoc(formRef, {
        status: newStatus,
        adminNote: adminNote.trim() || null,
        updatedAt: Timestamp.now(),
      });

      await addDoc(collection(db, "users", formData.userId, "notifications"), {
        type:
          newStatus === "approved"
            ? "refund_request_approved"
            : "refund_request_rejected",
        status: newStatus,
        message:
          newStatus === "approved"
            ? "Your refund request has been approved"
            : "Your refund request has been rejected",
        messageEn:
          newStatus === "approved"
            ? "Your refund request has been approved"
            : "Your refund request has been rejected",
        messageTr:
          newStatus === "approved"
            ? "İade talebiniz onaylandı"
            : "İade talebiniz reddedildi",
        messageRu:
          newStatus === "approved"
            ? "Ваш запрос на возврат одобрен"
            : "Ваш запрос на возврат отклонен",
        receiptNo: formData.receiptNo,
        refundFormId: formId,
        ...(newStatus === "rejected" &&
          adminNote.trim() && {
            rejectionReason: adminNote.trim(),
          }),
        timestamp: Timestamp.now(),
        isRead: false,
      });

      alert(
        `İade talebi ${newStatus === "approved" ? "onaylandı" : "reddedildi"}`
      );
      handleCloseModal();
    } catch (error) {
      console.error("Error updating status:", error);
      alert("Durum güncellenirken bir hata oluştu");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const formatDate = (timestamp: Timestamp): string => {
    const date = timestamp.toDate();
    return date.toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <Clock className="w-3 h-3" />
            Beklemede
          </span>
        );
      case "approved":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3" />
            Onaylandı
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XCircle className="w-3 h-3" />
            Reddedildi
          </span>
        );
      default:
        return null;
    }
  };

  const stats = useMemo(() => {
    return {
      total: refundForms.length,
      pending: refundForms.filter((f) => f.status === "pending").length,
      approved: refundForms.filter((f) => f.status === "approved").length,
      rejected: refundForms.filter((f) => f.status === "rejected").length,
    };
  }, [refundForms]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="w-full">
          {/* Header */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push("/dashboard")}
                  className="flex items-center justify-center w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-gray-600" />
                </button>
                <div className="flex items-center justify-center w-10 h-10 bg-orange-600 rounded-lg">
                  <FileText className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    İade Talepleri
                  </h1>
                  <p className="text-sm text-gray-600">
                    Tüm iade taleplerini görüntüle ve yönet
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <User className="w-4 h-4" />
                <span className="hidden sm:block">{user?.email}</span>
              </div>
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-medium text-blue-900">Toplam</span>
                </div>
                <p className="text-xl font-bold text-blue-900">{stats.total}</p>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-yellow-600" />
                  <span className="text-xs font-medium text-yellow-900">Beklemede</span>
                </div>
                <p className="text-xl font-bold text-yellow-900">{stats.pending}</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-xs font-medium text-green-900">Onaylanan</span>
                </div>
                <p className="text-xl font-bold text-green-900">{stats.approved}</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <XCircle className="w-4 h-4 text-red-600" />
                  <span className="text-xs font-medium text-red-900">Reddedilen</span>
                </div>
                <p className="text-xl font-bold text-red-900">{stats.rejected}</p>
              </div>
            </div>

            {/* Search & Filter */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="İsim, e-posta, fiş no, ürün veya satıcı ile ara..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(
                    e.target.value as "all" | "pending" | "approved" | "rejected"
                  )
                }
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="all">Tüm Durumlar</option>
                <option value="pending">Beklemede</option>
                <option value="approved">Onaylanan</option>
                <option value="rejected">Reddedilen</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredForms.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                <FileText className="w-10 h-10 mb-2 text-gray-300" />
                <p className="text-sm">
                  {searchTerm || statusFilter !== "all"
                    ? "Arama kriterlerine uygun sonuç bulunamadı"
                    : "Henüz iade talebi bulunmuyor"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-900">Tarih</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-900">Kullanıcı</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-900">Ürün</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-900">Satıcı</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-900">Fiyat</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-900">Fiş No</th>
                      <th className="px-3 py-2 text-center font-semibold text-gray-900">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredForms.map((form) => (
                      <tr
                        key={form.id}
                        onClick={() => handleViewDetails(form)}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                          {formatDate(form.createdAt)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <User className="w-3 h-3 text-blue-600 flex-shrink-0" />
                            <span className="text-gray-900 font-medium truncate max-w-[120px]">
                              {form.displayName}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-gray-900 truncate max-w-[150px] block">
                            {form.productName || "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <Store className="w-3 h-3 text-purple-600 flex-shrink-0" />
                            <span className="text-gray-900 truncate max-w-[120px]">
                              {form.sellerName || "—"}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className="text-gray-900 font-medium">
                            {form.price != null ? `${form.price.toFixed(2)} TL` : "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-gray-500 font-mono">
                            {form.receiptNo}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {getStatusBadge(form.status)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Detail Modal */}
        {selectedForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={handleCloseModal}>
            <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              {/* Modal Header */}
              <div className="bg-orange-50 px-6 py-4 border-b border-orange-100 flex items-center justify-between sticky top-0">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 bg-orange-100 rounded-full">
                    <FileText className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">İade Talebi Detayı</h3>
                    <p className="text-xs text-gray-500 font-mono">#{selectedForm.id.slice(0, 12)}</p>
                  </div>
                </div>
                <button onClick={handleCloseModal} className="p-2 hover:bg-orange-100 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                {/* Status & Date */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="w-4 h-4" />
                    <span>
                      {selectedForm.createdAt.toDate().toLocaleDateString("tr-TR", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                    <span className="text-gray-400">|</span>
                    <Clock className="w-4 h-4" />
                    <span>
                      {selectedForm.createdAt.toDate().toLocaleTimeString("tr-TR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {getStatusBadge(selectedForm.status)}
                </div>

                {/* Product Info */}
                {(selectedForm.productName || selectedForm.productImage) && (
                  <div className="flex gap-4 bg-gray-50 rounded-lg p-3">
                    {selectedForm.productImage ? (
                      <img
                        src={selectedForm.productImage}
                        alt={selectedForm.productName || "Ürün"}
                        className="w-20 h-20 object-cover rounded-lg border border-gray-200 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-20 h-20 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Package className="w-8 h-8 text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{selectedForm.productName || "—"}</p>
                      {selectedForm.sellerName && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <Store className="w-3.5 h-3.5 text-purple-600" />
                          <span className="text-xs text-gray-600">{selectedForm.sellerName}</span>
                        </div>
                      )}
                      {selectedForm.price != null && (
                        <p className="text-sm font-bold text-gray-900 mt-2">{selectedForm.price.toFixed(2)} TL</p>
                      )}
                    </div>
                  </div>
                )}

                {/* User & Seller Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <User className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-medium text-blue-900">Kullanıcı</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">{selectedForm.displayName}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Mail className="w-3 h-3 text-gray-400" />
                      <span className="text-xs text-gray-600">{selectedForm.email}</span>
                    </div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Store className="w-4 h-4 text-purple-600" />
                      <span className="text-xs font-medium text-purple-900">Satıcı</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">{selectedForm.sellerName || "—"}</p>
                    {selectedForm.price != null && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <DollarSign className="w-3 h-3 text-gray-400" />
                        <span className="text-xs text-gray-600">{selectedForm.price.toFixed(2)} TL</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Receipt Number */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Receipt className="w-4 h-4 text-gray-600" />
                    <span className="text-xs font-medium text-gray-700">Fiş Numarası</span>
                  </div>
                  <p className="text-sm font-mono text-gray-900">{selectedForm.receiptNo}</p>
                </div>

                {/* Description */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="w-4 h-4 text-gray-600" />
                    <span className="text-sm font-semibold text-gray-700">Açıklama</span>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <p className="text-sm text-gray-900 whitespace-pre-wrap">{selectedForm.description}</p>
                  </div>
                </div>

                {/* Admin Note - editable for pending */}
                {selectedForm.status === "pending" && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Yönetici Notu
                    </label>
                    <textarea
                      value={adminNote}
                      onChange={(e) => setAdminNote(e.target.value)}
                      placeholder="Karar için not ekleyin..."
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                    />
                  </div>
                )}

                {/* Existing Admin Note - read only */}
                {selectedForm.status !== "pending" && selectedForm.adminNote && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Yönetici Notu
                    </label>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm text-gray-900">{selectedForm.adminNote}</p>
                    </div>
                  </div>
                )}

                {/* IDs */}
                <div className="flex gap-4 text-xs text-gray-400">
                  <span>Kullanıcı: <span className="font-mono">{selectedForm.userId.slice(0, 12)}...</span></span>
                  <span>Talep: <span className="font-mono">{selectedForm.id.slice(0, 12)}...</span></span>
                </div>
              </div>

              {/* Footer Actions */}
              {selectedForm.status === "pending" && (
                <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex gap-3">
                  <button
                    onClick={() => handleUpdateStatus(selectedForm.id, "rejected")}
                    disabled={updatingStatus}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
                  >
                    {updatingStatus ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <XCircle className="w-4 h-4" />
                        Reddet
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(selectedForm.id, "approved")}
                    disabled={updatingStatus}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
                  >
                    {updatingStatus ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Onayla
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
