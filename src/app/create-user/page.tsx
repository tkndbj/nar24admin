"use client";

import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useState, useEffect, useCallback } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Trash2,
  RefreshCw,
  Users,
  Copy,
  Check,
  AlertCircle,
  CheckCircle2,
  UserPlus,
  Bike,
  X,
  Shield,
  Eye,
  EyeOff,
} from "lucide-react";

const functions = getFunctions(undefined, "europe-west3");

interface TestAccount {
  uid: string;
  email: string;
  displayName: string;
  prefix: string;
  foodcargoguy: boolean;
  createdAt: string | null;
}

interface Toast {
  type: "success" | "error";
  message: string;
}

export default function CreateUserPage() {
  const router = useRouter();

  // ── State ──
  const [accounts, setAccounts] = useState<TestAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null); // uid being deleted
  const [deletingAll, setDeletingAll] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Create form
  const [createCount, setCreateCount] = useState(10);
  const [createPrefix, setCreatePrefix] = useState("courier");
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Confirm delete modal
  const [confirmDelete, setConfirmDelete] = useState<{
    type: "single" | "selected" | "all";
    uid?: string;
    count: number;
  } | null>(null);

  const globalPassword = "Test123456";

  // ── Toast auto-dismiss ──
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Fetch accounts ──
  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const fn = httpsCallable(functions, "listTestCouriers");
      const result = await fn({});
      const data = result.data as {
        accounts: TestAccount[];
        count: number;
      };
      setAccounts(data.accounts || []);
    } catch (err: unknown) {
      console.error("Failed to fetch test accounts:", err);
      setToast({ type: "error", message: "Hesaplar yüklenemedi" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // ── Create accounts ──
  const handleCreate = useCallback(async () => {
    setCreating(true);
    try {
      const fn = httpsCallable(functions, "createTestCouriers");
      const result = await fn({ count: createCount, prefix: createPrefix });
      const data = result.data as {
        created: number;
        skipped: number;
        errors: number;
      };

      const parts = [];
      if (data.created > 0) parts.push(`${data.created} oluşturuldu`);
      if (data.skipped > 0) parts.push(`${data.skipped} zaten vardı`);
      if (data.errors > 0) parts.push(`${data.errors} hata`);

      setToast({
        type: data.created > 0 ? "success" : "error",
        message: parts.join(" · "),
      });
      setShowCreateForm(false);
      await fetchAccounts();
    } catch (err: unknown) {
      console.error("Failed to create test accounts:", err);
      setToast({ type: "error", message: "Hesap oluşturma başarısız" });
    } finally {
      setCreating(false);
    }
  }, [createCount, createPrefix, fetchAccounts]);

  // ── Delete single ──
  const handleDeleteSingle = useCallback(
    async (uid: string) => {
      setDeleting(uid);
      setConfirmDelete(null);
      try {
        const fn = httpsCallable(functions, "deleteTestCouriers");
        await fn({ uids: [uid] });
        setToast({ type: "success", message: "Hesap silindi" });
        setSelectedUids((prev) => {
          const next = new Set(prev);
          next.delete(uid);
          return next;
        });
        await fetchAccounts();
      } catch (err: unknown) {
        console.error("Failed to delete account:", err);
        setToast({ type: "error", message: "Silme başarısız" });
      } finally {
        setDeleting(null);
      }
    },
    [fetchAccounts],
  );

  // ── Delete selected ──
  const handleDeleteSelected = useCallback(async () => {
    const uids = Array.from(selectedUids);
    if (uids.length === 0) return;
    setDeletingAll(true);
    setConfirmDelete(null);
    try {
      const fn = httpsCallable(functions, "deleteTestCouriers");
      const result = await fn({ uids });
      const data = result.data as { deleted: number; errors: number };
      setToast({
        type: "success",
        message: `${data.deleted} hesap silindi${data.errors > 0 ? ` · ${data.errors} hata` : ""}`,
      });
      setSelectedUids(new Set());
      await fetchAccounts();
    } catch (err: unknown) {
      console.error("Failed to delete accounts:", err);
      setToast({ type: "error", message: "Toplu silme başarısız" });
    } finally {
      setDeletingAll(false);
    }
  }, [selectedUids, fetchAccounts]);

  // ── Delete all ──
  const handleDeleteAll = useCallback(async () => {
    setDeletingAll(true);
    setConfirmDelete(null);
    try {
      const fn = httpsCallable(functions, "deleteTestCouriers");
      const result = await fn({ prefix: createPrefix || "courier" });
      const data = result.data as { deleted: number; errors: number };
      setToast({
        type: "success",
        message: `${data.deleted} hesap silindi${data.errors > 0 ? ` · ${data.errors} hata` : ""}`,
      });
      setSelectedUids(new Set());
      await fetchAccounts();
    } catch (err: unknown) {
      console.error("Failed to delete all:", err);
      setToast({ type: "error", message: "Toplu silme başarısız" });
    } finally {
      setDeletingAll(false);
    }
  }, [createPrefix, fetchAccounts]);

  // ── Copy to clipboard ──
  const copyToClipboard = useCallback(
    (text: string, label: string) => {
      navigator.clipboard.writeText(text);
      setCopiedField(label);
      setTimeout(() => setCopiedField(null), 1500);
    },
    [],
  );

  // ── Toggle selection ──
  const toggleSelect = (uid: string) => {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedUids.size === accounts.length) {
      setSelectedUids(new Set());
    } else {
      setSelectedUids(new Set(accounts.map((a) => a.uid)));
    }
  };

  // ── Group by prefix ──
  const prefixGroups = accounts.reduce(
    (acc, a) => {
      const p = a.prefix || "other";
      if (!acc[p]) acc[p] = [];
      acc[p].push(a);
      return acc;
    },
    {} as Record<string, TestAccount[]>,
  );

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push("/")}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-gray-500" />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                  <Bike className="w-4 h-4 text-orange-600" />
                </div>
                <div>
                  <h1 className="text-sm font-bold text-gray-900">
                    Test Kurye Hesapları
                  </h1>
                  <p className="text-[10px] text-gray-400">
                    Oluştur, yönet, sil
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={fetchAccounts}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
                />
                Yenile
              </button>
              <button
                onClick={() => setShowCreateForm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Oluştur
              </button>
            </div>
          </div>
        </header>

        <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
          {/* Info Banner */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
            <Shield className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-orange-800">
                Test Hesapları
              </p>
              <p className="text-xs text-orange-600 mt-0.5 leading-relaxed">
                Bu hesaplar <code className="bg-orange-100 px-1 rounded">@test.local</code> uzantılı sahte email ile oluşturulur.
                Kurye uygulamasına giriş yapabilir, konum paylaşabilir ve sipariş alabilir.
                İstediğiniz zaman temizleyebilirsiniz.
              </p>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-[10px] text-orange-500 font-medium uppercase tracking-wider">
                  Şifre
                </span>
                <div className="flex items-center gap-1.5 bg-white border border-orange-200 rounded-lg px-2 py-1">
                  <code className="text-xs font-mono text-gray-800">
                    {showPassword ? globalPassword : "••••••••"}
                  </code>
                  <button
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-orange-400 hover:text-orange-600"
                  >
                    {showPassword ? (
                      <EyeOff className="w-3 h-3" />
                    ) : (
                      <Eye className="w-3 h-3" />
                    )}
                  </button>
                  <button
                    onClick={() => copyToClipboard(globalPassword, "password")}
                    className="text-orange-400 hover:text-orange-600"
                  >
                    {copiedField === "password" ? (
                      <Check className="w-3 h-3 text-green-500" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-white border border-orange-200 rounded-lg px-2.5 py-1.5 flex-shrink-0">
              <Users className="w-3.5 h-3.5 text-orange-500" />
              <span className="text-sm font-bold text-orange-700">
                {accounts.length}
              </span>
              <span className="text-[10px] text-orange-500">hesap</span>
            </div>
          </div>

          {/* Bulk Actions */}
          {selectedUids.size > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <span className="text-sm font-medium text-red-700">
                  {selectedUids.size} hesap seçili
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedUids(new Set())}
                  className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-white transition-colors"
                >
                  Seçimi kaldır
                </button>
                <button
                  onClick={() =>
                    setConfirmDelete({
                      type: "selected",
                      count: selectedUids.size,
                    })
                  }
                  disabled={deletingAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" />
                  Seçilenleri Sil
                </button>
              </div>
            </div>
          )}

          {/* Accounts Table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {/* Table header */}
            <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {accounts.length > 0 && (
                  <input
                    type="checkbox"
                    checked={
                      selectedUids.size === accounts.length &&
                      accounts.length > 0
                    }
                    onChange={toggleSelectAll}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
                  />
                )}
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  Test Kurye Hesapları
                </span>
              </div>
              {accounts.length > 0 && (
                <button
                  onClick={() =>
                    setConfirmDelete({ type: "all", count: accounts.length })
                  }
                  disabled={deletingAll}
                  className="flex items-center gap-1 text-[10px] font-medium text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" />
                  Tümünü Sil
                </button>
              )}
            </div>

            {/* Loading */}
            {loading ? (
              <div className="py-16 flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                <p className="text-xs text-gray-400">Yükleniyor…</p>
              </div>
            ) : accounts.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-3">
                <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center">
                  <Users className="w-5 h-5 text-gray-300" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-500">
                    Henüz test hesabı yok
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    &quot;Oluştur&quot; butonuna tıklayarak başlayın
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {Object.entries(prefixGroups).map(([prefix, group]) => (
                  <div key={prefix}>
                    {Object.keys(prefixGroups).length > 1 && (
                      <div className="px-4 py-1.5 bg-gray-50 border-b border-gray-100">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                          {prefix} · {group.length} hesap
                        </span>
                      </div>
                    )}
                    {group.map((account) => (
                      <div
                        key={account.uid}
                        className={`px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors ${
                          selectedUids.has(account.uid) ? "bg-orange-50/50" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedUids.has(account.uid)}
                          onChange={() => toggleSelect(account.uid)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
                        />

                        <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <Bike className="w-3.5 h-3.5 text-orange-600" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {account.displayName}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-400 font-mono truncate">
                              {account.email}
                            </span>
                            <button
                              onClick={() =>
                                copyToClipboard(account.email, account.uid)
                              }
                              className="text-gray-300 hover:text-gray-500 flex-shrink-0"
                            >
                              {copiedField === account.uid ? (
                                <Check className="w-3 h-3 text-green-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {account.foodcargoguy && (
                            <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 text-[9px] font-bold rounded">
                              KURYE
                            </span>
                          )}
                          {account.createdAt && (
                            <span className="text-[10px] text-gray-400">
                              {new Date(account.createdAt).toLocaleDateString(
                                "tr-TR",
                                { day: "numeric", month: "short" },
                              )}
                            </span>
                          )}
                          <button
                            onClick={() =>
                              setConfirmDelete({
                                type: "single",
                                uid: account.uid,
                                count: 1,
                              })
                            }
                            disabled={deleting === account.uid}
                            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50"
                          >
                            {deleting === account.uid ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Create Modal ─────────────────────────────────────────── */}
        {showCreateForm && (
          <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
            onClick={() => setShowCreateForm(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-orange-500" />
                  <p className="text-sm font-bold text-gray-900">
                    Test Kurye Oluştur
                  </p>
                </div>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Prefix
                  </label>
                  <input
                    type="text"
                    value={createPrefix}
                    onChange={(e) => setCreatePrefix(e.target.value)}
                    placeholder="courier"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-400 focus:border-orange-400"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    Emailler: {createPrefix || "courier"}1@test.local,{" "}
                    {createPrefix || "courier"}2@test.local, …
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Hesap Sayısı
                  </label>
                  <div className="flex items-center gap-2">
                    {[5, 10, 20, 30].map((n) => (
                      <button
                        key={n}
                        onClick={() => setCreateCount(n)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                          createCount === n
                            ? "bg-orange-50 border-orange-300 text-orange-700"
                            : "border-gray-200 text-gray-500 hover:bg-gray-50"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                    <input
                      type="number"
                      value={createCount}
                      onChange={(e) =>
                        setCreateCount(
                          Math.min(50, Math.max(1, Number(e.target.value) || 1)),
                        )
                      }
                      min={1}
                      max={50}
                      className="w-16 px-2 py-1.5 text-xs text-center border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-400"
                    />
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Özet
                  </p>
                  <div className="space-y-1 text-xs text-gray-600">
                    <p>
                      📧 <strong>{createCount}</strong> hesap oluşturulacak
                    </p>
                    <p>
                      🔑 Şifre: <code className="bg-white px-1 rounded">{globalPassword}</code>
                    </p>
                    <p>
                      🏷️ Claim: <code className="bg-white px-1 rounded">foodcargoguy: true</code>
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors disabled:opacity-50"
                >
                  {creating ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <Plus className="w-3 h-3" />
                  )}
                  {creating ? "Oluşturuluyor…" : "Oluştur"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Confirm Delete Modal ─────────────────────────────────── */}
        {confirmDelete && (
          <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
            onClick={() => setConfirmDelete(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 text-center">
                <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Trash2 className="w-5 h-5 text-red-500" />
                </div>
                <p className="text-sm font-bold text-gray-900 mb-1">
                  {confirmDelete.type === "all"
                    ? "Tüm Test Hesaplarını Sil"
                    : confirmDelete.type === "selected"
                      ? "Seçili Hesapları Sil"
                      : "Hesabı Sil"}
                </p>
                <p className="text-xs text-gray-500">
                  <strong>{confirmDelete.count}</strong> test hesabı kalıcı
                  olarak silinecek. Bu işlem geri alınamaz.
                </p>
              </div>
              <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  Vazgeç
                </button>
                <button
                  onClick={() => {
                    if (confirmDelete.type === "single" && confirmDelete.uid) {
                      handleDeleteSingle(confirmDelete.uid);
                    } else if (confirmDelete.type === "selected") {
                      handleDeleteSelected();
                    } else {
                      handleDeleteAll();
                    }
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Sil
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Toast ────────────────────────────────────────────────── */}
        {toast && (
          <div
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-white text-xs font-semibold ${
              toast.type === "success" ? "bg-emerald-600" : "bg-red-500"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            {toast.message}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}