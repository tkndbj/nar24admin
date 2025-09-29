"use client";

import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  ArrowLeft,
  MessageSquare,
  User,
  Mail,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  Calendar,
  Filter,
  Search,
  AlertCircle,
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
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useRouter } from "next/navigation";

interface HelpForm {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  description: string;
  status: "pending" | "resolved" | "in-progress";
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  adminNote?: string;
}

export default function HelpFormsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [helpForms, setHelpForms] = useState<HelpForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedForm, setSelectedForm] = useState<HelpForm | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [adminNote, setAdminNote] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "resolved" | "in-progress"
  >("all");

  // Fetch help forms from Firestore
  useEffect(() => {
    const q = query(
      collection(db, "help-forms"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const formsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as HelpForm[];
      setHelpForms(formsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Filter and search forms
  const filteredForms = useMemo(() => {
    let filtered = helpForms;

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((form) => form.status === statusFilter);
    }

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (form) =>
          form.displayName.toLowerCase().includes(term) ||
          form.email.toLowerCase().includes(term) ||
          form.id.toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [helpForms, statusFilter, searchTerm]);

  // Handle form detail view
  const handleViewDetails = (form: HelpForm) => {
    setSelectedForm(form);
    setAdminNote(form.adminNote || "");
    setShowDetailModal(true);
  };

  // Handle status update
  const handleUpdateStatus = async (
    formId: string,
    newStatus: "resolved" | "in-progress"
  ) => {
    if (!formId) return;

    setUpdatingStatus(true);
    try {
      const formRef = doc(db, "help-forms", formId);
      await updateDoc(formRef, {
        status: newStatus,
        adminNote: adminNote.trim() || null,
        updatedAt: Timestamp.now(),
      });

      alert(
        `Destek talebi ${
          newStatus === "resolved" ? "çözüldü" : "işleme alındı"
        }`
      );
      setShowDetailModal(false);
      setSelectedForm(null);
      setAdminNote("");
    } catch (error) {
      console.error("Error updating status:", error);
      alert("Durum güncellenirken bir hata oluştu");
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Format date
  const formatDate = (timestamp: Timestamp): string => {
    const date = timestamp.toDate();
    return date.toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <Clock className="w-3 h-3" />
            Beklemede
          </span>
        );
      case "in-progress":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            <AlertCircle className="w-3 h-3" />
            İşlemde
          </span>
        );
      case "resolved":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3" />
            Çözüldü
          </span>
        );
      default:
        return null;
    }
  };

  // Calculate statistics
  const stats = useMemo(() => {
    return {
      total: helpForms.length,
      pending: helpForms.filter((f) => f.status === "pending").length,
      inProgress: helpForms.filter((f) => f.status === "in-progress").length,
      resolved: helpForms.filter((f) => f.status === "resolved").length,
    };
  }, [helpForms]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push("/dashboard")}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-gray-600" />
                </button>
                <div className="flex items-center justify-center w-8 h-8 bg-blue-600 rounded-lg">
                  <MessageSquare className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-xl font-bold text-gray-900">
                  Destek Talepleri
                </h1>
              </div>

              <div className="flex items-center gap-2 text-gray-600">
                <User className="w-4 h-4" />
                <span className="text-sm hidden sm:block">{user?.email}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Statistics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-lg">
                  <MessageSquare className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-600">
                    Toplam Talep
                  </h3>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.total}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 bg-yellow-100 rounded-lg">
                  <Clock className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-600">
                    Beklemede
                  </h3>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.pending}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-600">
                    İşlemde
                  </h3>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.inProgress}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 bg-green-100 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-600">
                    Çözüldü
                  </h3>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.resolved}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Filters and Search */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm mb-6">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Search */}
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="İsim, e-posta veya ID ile ara..."
                    className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-600" />
                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(
                      e.target.value as
                        | "all"
                        | "pending"
                        | "resolved"
                        | "in-progress"
                    )
                  }
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  <option value="all">Tüm Durumlar</option>
                  <option value="pending">Beklemede</option>
                  <option value="in-progress">İşlemde</option>
                  <option value="resolved">Çözüldü</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            ) : filteredForms.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                <MessageSquare className="w-12 h-12 mb-3 text-gray-400" />
                <p className="text-sm">
                  {searchTerm || statusFilter !== "all"
                    ? "Arama kriterlerine uygun sonuç bulunamadı"
                    : "Henüz destek talebi bulunmuyor"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Tarih
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Kullanıcı
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        E-posta
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Açıklama Önizleme
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Durum
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        İşlem
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredForms.map((form) => (
                      <tr
                        key={form.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2 text-sm text-gray-900">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            {formatDate(form.createdAt)}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {form.displayName}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm text-gray-600">
                            {form.email}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-600 max-w-xs truncate">
                            {form.description}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {getStatusBadge(form.status)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <button
                            onClick={() => handleViewDetails(form)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors text-sm font-medium"
                          >
                            <Eye className="w-4 h-4" />
                            Detaylar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>

        {/* Detail Modal */}
        {showDetailModal && selectedForm && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-gray-900">
                    Destek Talebi Detayları
                  </h2>
                  <button
                    onClick={() => {
                      setShowDetailModal(false);
                      setSelectedForm(null);
                      setAdminNote("");
                    }}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <XCircle className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6">
                {/* Status */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Durum
                  </label>
                  {getStatusBadge(selectedForm.status)}
                </div>

                {/* Created Date */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Oluşturma Tarihi
                  </label>
                  <div className="flex items-center gap-2 text-gray-900">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    {formatDate(selectedForm.createdAt)}
                  </div>
                </div>

                {/* User Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      <User className="w-4 h-4 inline mr-1" />
                      Kullanıcı Adı
                    </label>
                    <p className="text-gray-900">{selectedForm.displayName}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      <Mail className="w-4 h-4 inline mr-1" />
                      E-posta
                    </label>
                    <p className="text-gray-900">{selectedForm.email}</p>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    <MessageSquare className="w-4 h-4 inline mr-1" />
                    Açıklama
                  </label>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <p className="text-gray-900 whitespace-pre-wrap">
                      {selectedForm.description}
                    </p>
                  </div>
                </div>

                {/* Admin Note */}
                {selectedForm.status !== "resolved" && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Yönetici Notu (İsteğe Bağlı)
                    </label>
                    <textarea
                      value={adminNote}
                      onChange={(e) => setAdminNote(e.target.value)}
                      placeholder="Karar için not ekleyin..."
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    />
                  </div>
                )}

                {/* Existing Admin Note */}
                {selectedForm.adminNote && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Yönetici Notu
                    </label>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-gray-900">{selectedForm.adminNote}</p>
                    </div>
                  </div>
                )}

                {/* User ID */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Kullanıcı ID
                  </label>
                  <p className="text-gray-600 font-mono text-sm">
                    {selectedForm.userId}
                  </p>
                </div>

                {/* Form ID */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Talep ID
                  </label>
                  <p className="text-gray-600 font-mono text-sm">
                    {selectedForm.id}
                  </p>
                </div>
              </div>

              {/* Modal Footer */}
              {selectedForm.status !== "resolved" && (
                <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 rounded-b-2xl">
                  <div className="flex gap-3">
                    <button
                      onClick={() =>
                        handleUpdateStatus(selectedForm.id, "in-progress")
                      }
                      disabled={updatingStatus}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors disabled:cursor-not-allowed"
                    >
                      {updatingStatus ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                      ) : (
                        <>
                          <AlertCircle className="w-5 h-5" />
                          İşleme Al
                        </>
                      )}
                    </button>
                    <button
                      onClick={() =>
                        handleUpdateStatus(selectedForm.id, "resolved")
                      }
                      disabled={updatingStatus}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors disabled:cursor-not-allowed"
                    >
                      {updatingStatus ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                      ) : (
                        <>
                          <CheckCircle className="w-5 h-5" />
                          Çözüldü Olarak İşaretle
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}