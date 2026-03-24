"use client";

import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  Upload,
  Trash2,
  GripVertical,
  Image as ImageIcon,
  ArrowLeft,
  Plus,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { db, storage } from "../lib/firebase";
import { useRouter } from "next/navigation";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Banner {
  id: string;
  imageUrl: string;
  storagePath: string;
  title: string;
  isActive: boolean;
  order: number;
  createdAt: Date | null;
}

interface UploadTask {
  file: File;
  preview: string;
  title: string;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

const Toast = ({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error";
  onClose: () => void;
}) => (
  <div
    className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border text-sm font-medium animate-in slide-in-from-bottom-2 ${
      type === "success"
        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
        : "bg-red-50 border-red-200 text-red-800"
    }`}
  >
    {type === "success" ? (
      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
    ) : (
      <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
    )}
    {message}
    <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100">
      <X className="w-3.5 h-3.5" />
    </button>
  </div>
);

// ─── Banner Card ──────────────────────────────────────────────────────────────

const BannerCard = ({
  banner,
  index,
  total,
  onDelete,
  onToggle,
  onMoveUp,
  onMoveDown,
  dragHandleProps,
}: {
  banner: Banner;
  index: number;
  total: number;
  onDelete: (b: Banner) => void;
  onToggle: (b: Banner) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}) => (
  <div
    className={`group flex items-center gap-3 bg-white border rounded-xl p-3 transition-all hover:shadow-sm ${
      banner.isActive
        ? "border-gray-200"
        : "border-dashed border-gray-200 opacity-60"
    }`}
  >
    {/* Drag handle */}
    <div
      {...dragHandleProps}
      className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 transition-colors shrink-0"
    >
      <GripVertical className="w-4 h-4" />
    </div>

    {/* Order badge */}
    <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
      <span className="text-xs font-bold text-gray-500">{index + 1}</span>
    </div>

    {/* Image preview */}
    <div className="w-28 h-14 rounded-lg overflow-hidden bg-gray-100 shrink-0 border border-gray-200">
      <img
        src={banner.imageUrl}
        alt={banner.title || `Banner ${index + 1}`}
        className="w-full h-full object-cover"
      />
    </div>

    {/* Info */}
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-gray-900 truncate">
        {banner.title || `Banner ${index + 1}`}
      </p>
      <p className="text-xs text-gray-400 mt-0.5">
        {banner.createdAt
          ? banner.createdAt.toLocaleDateString("tr-TR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "—"}
      </p>
    </div>

    {/* Status badge */}
    <span
      className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${
        banner.isActive
          ? "bg-emerald-50 text-emerald-700"
          : "bg-gray-100 text-gray-500"
      }`}
    >
      {banner.isActive ? "Aktif" : "Pasif"}
    </span>

    {/* Actions */}
    <div className="flex items-center gap-1 shrink-0">
      <button
        onClick={() => onMoveUp(index)}
        disabled={index === 0}
        className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500 text-xs font-bold transition-colors"
        title="Yukarı taşı"
      >
        ↑
      </button>
      <button
        onClick={() => onMoveDown(index)}
        disabled={index === total - 1}
        className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500 text-xs font-bold transition-colors"
        title="Aşağı taşı"
      >
        ↓
      </button>
      <button
        onClick={() => onToggle(banner)}
        className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
        title={banner.isActive ? "Pasif yap" : "Aktif yap"}
      >
        {banner.isActive ? (
          <Eye className="w-4 h-4 text-emerald-600" />
        ) : (
          <EyeOff className="w-4 h-4 text-gray-400" />
        )}
      </button>
      <button
        onClick={() => onDelete(banner)}
        className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
        title="Sil"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  </div>
);

// ─── Upload Row ───────────────────────────────────────────────────────────────

const UploadRow = ({
  task,
  onRemove,
  onTitleChange,
}: {
  task: UploadTask;
  onRemove: () => void;
  onTitleChange: (v: string) => void;
}) => (
  <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-3">
    <div className="w-20 h-12 rounded-lg overflow-hidden bg-gray-100 shrink-0 border border-gray-200">
      <img src={task.preview} alt="" className="w-full h-full object-cover" />
    </div>

    <div className="flex-1 min-w-0">
      <input
        type="text"
        placeholder="Banner başlığı (opsiyonel)"
        value={task.title}
        onChange={(e) => onTitleChange(e.target.value)}
        disabled={task.status === "uploading" || task.status === "done"}
        className="w-full text-sm bg-transparent border-0 outline-none text-gray-800 placeholder-gray-400 font-medium disabled:opacity-60"
      />
      <p className="text-xs text-gray-400 mt-0.5 truncate">{task.file.name}</p>

      {/* Progress bar */}
      {task.status === "uploading" && (
        <div className="mt-1.5 w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${task.progress}%` }}
          />
        </div>
      )}
      {task.status === "error" && (
        <p className="text-xs text-red-500 mt-0.5">{task.error}</p>
      )}
    </div>

    {/* Status icon */}
    <div className="shrink-0">
      {task.status === "pending" && (
        <button
          onClick={onRemove}
          className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}
      {task.status === "uploading" && (
        <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
      )}
      {task.status === "done" && (
        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
      )}
      {task.status === "error" && (
        <AlertCircle className="w-4 h-4 text-red-500" />
      )}
    </div>
  </div>
);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RestaurantBannerPage() {
  const { user } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Banner | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Fetch banners ──────────────────────────────────────────────────────────

  const fetchBanners = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, "restaurant_banners"),
        orderBy("order", "asc"),
      );
      const snap = await getDocs(q);
      const data: Banner[] = snap.docs.map((d) => ({
        id: d.id,
        imageUrl: d.data().imageUrl,
        storagePath: d.data().storagePath,
        title: d.data().title || "",
        isActive: d.data().isActive ?? true,
        order: d.data().order ?? 0,
        createdAt: d.data().createdAt?.toDate() ?? null,
      }));
      setBanners(data);
    } catch {
      showToast("Bannerlar yüklenemedi.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchBanners();
  }, [user, fetchBanners]);

  // ── File handling ──────────────────────────────────────────────────────────

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!arr.length) return;
    const tasks: UploadTask[] = arr.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      title: "",
      progress: 0,
      status: "pending",
    }));
    setUploadTasks((prev) => [...prev, ...tasks]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    addFiles(e.dataTransfer.files);
  };

  const removeTask = (index: number) => {
    setUploadTasks((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const updateTaskTitle = (index: number, title: string) => {
    setUploadTasks((prev) =>
      prev.map((t, i) => (i === index ? { ...t, title } : t)),
    );
  };

  // ── Upload ─────────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    const pending = uploadTasks.filter((t) => t.status === "pending");
    if (!pending.length) return;

    setSaving(true);
    const maxOrder = banners.length
      ? Math.max(...banners.map((b) => b.order))
      : -1;

    for (let i = 0; i < uploadTasks.length; i++) {
      const task = uploadTasks[i];
      if (task.status !== "pending") continue;

      // Mark as uploading
      setUploadTasks((prev) =>
        prev.map((t, idx) =>
          idx === i ? { ...t, status: "uploading", progress: 0 } : t,
        ),
      );

      try {
        const storagePath = `restaurant_banners/${Date.now()}_${task.file.name}`;
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, task.file);

        await new Promise<void>((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snap) => {
              const pct = Math.round(
                (snap.bytesTransferred / snap.totalBytes) * 100,
              );
              setUploadTasks((prev) =>
                prev.map((t, idx) => (idx === i ? { ...t, progress: pct } : t)),
              );
            },
            reject,
            resolve,
          );
        });

        const imageUrl = await getDownloadURL(storageRef);
        const orderVal = maxOrder + 1 + i;

        await addDoc(collection(db, "restaurant_banners"), {
          imageUrl,
          storagePath,
          title: task.title,
          isActive: true,
          order: orderVal,
          createdAt: serverTimestamp(),
        });

        setUploadTasks((prev) =>
          prev.map((t, idx) =>
            idx === i ? { ...t, status: "done", progress: 100 } : t,
          ),
        );
      } catch {
        setUploadTasks((prev) =>
          prev.map((t, idx) =>
            idx === i
              ? { ...t, status: "error", error: "Yükleme başarısız." }
              : t,
          ),
        );
      }
    }

    setSaving(false);
    await fetchBanners();
    // Clear done tasks after a moment
    setTimeout(() => {
      setUploadTasks((prev) => prev.filter((t) => t.status !== "done"));
    }, 1500);
    showToast("Bannerlar başarıyla yüklendi.", "success");
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async (banner: Banner) => {
    try {
      await deleteDoc(doc(db, "restaurant_banners", banner.id));
      if (banner.storagePath) {
        try {
          await deleteObject(ref(storage, banner.storagePath));
        } catch {
          // storage object may already be gone
        }
      }
      setBanners((prev) => prev.filter((b) => b.id !== banner.id));
      setDeleteConfirm(null);
      showToast("Banner silindi.", "success");
    } catch {
      showToast("Silme işlemi başarısız.", "error");
    }
  };

  // ── Toggle active ──────────────────────────────────────────────────────────

  const handleToggle = async (banner: Banner) => {
    try {
      await updateDoc(doc(db, "restaurant_banners", banner.id), {
        isActive: !banner.isActive,
      });
      setBanners((prev) =>
        prev.map((b) =>
          b.id === banner.id ? { ...b, isActive: !b.isActive } : b,
        ),
      );
    } catch {
      showToast("Güncelleme başarısız.", "error");
    }
  };

  // ── Reorder ────────────────────────────────────────────────────────────────

  const moveItem = async (index: number, direction: "up" | "down") => {
    const newBanners = [...banners];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    [newBanners[index], newBanners[targetIndex]] = [
      newBanners[targetIndex],
      newBanners[index],
    ];
    setBanners(newBanners);

    // Persist new order
    const batch = writeBatch(db);
    newBanners.forEach((b, i) => {
      batch.update(doc(db, "restaurant_banners", b.id), { order: i });
    });
    try {
      await batch.commit();
    } catch {
      showToast("Sıralama kaydedilemedi.", "error");
      fetchBanners(); // revert
    }
  };

  const pendingCount = uploadTasks.filter((t) => t.status === "pending").length;
  const activeBanners = banners.filter((b) => b.isActive).length;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center">
                <ImageIcon className="w-3.5 h-3.5 text-white" />
              </div>
              <h1 className="text-base font-bold text-gray-900">
                Restoran Banner Yönetimi
              </h1>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
                {activeBanners} aktif / {banners.length} toplam
              </span>
            </div>
          </div>
        </header>

        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {/* Upload Zone */}
          <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-gray-500" />
                <h2 className="text-sm font-semibold text-gray-900">
                  Yeni Banner Ekle
                </h2>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Dosya Seç
              </button>
            </div>

            {/* Drop zone */}
            <div
              ref={dropRef}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingOver(true);
              }}
              onDragLeave={() => setIsDraggingOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`mx-5 my-4 border-2 border-dashed rounded-xl flex flex-col items-center justify-center py-8 cursor-pointer transition-all ${
                isDraggingOver
                  ? "border-blue-400 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center mb-3">
                <ImageIcon className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-600">
                Görsel sürükleyin veya seçin
              </p>
              <p className="text-xs text-gray-400 mt-1">
                PNG, JPG, WEBP · Çoklu seçim desteklenir
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && addFiles(e.target.files)}
              />
            </div>

            {/* Upload queue */}
            {uploadTasks.length > 0 && (
              <div className="px-5 pb-4 space-y-2">
                {uploadTasks.map((task, i) => (
                  <UploadRow
                    key={i}
                    task={task}
                    onRemove={() => removeTask(i)}
                    onTitleChange={(v) => updateTaskTitle(i, v)}
                  />
                ))}

                {pendingCount > 0 && (
                  <button
                    onClick={handleUpload}
                    disabled={saving}
                    className="mt-2 w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold py-2.5 rounded-xl transition-all"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    {saving ? "Yükleniyor..." : `${pendingCount} Banner Yükle`}
                  </button>
                )}
              </div>
            )}
          </section>

          {/* Existing Banners */}
          <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-900">
                Mevcut Bannerlar
              </h2>
              <span className="ml-auto text-xs text-gray-400">
                Sırayı değiştirmek için ↑↓ kullanın
              </span>
            </div>

            <div className="p-4 space-y-2">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <Loader2 className="w-6 h-6 animate-spin mb-2" />
                  <p className="text-sm">Yükleniyor...</p>
                </div>
              ) : banners.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <ImageIcon className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm font-medium">Henüz banner eklenmedi</p>
                  <p className="text-xs mt-1">
                    Yukarıdan görsel yükleyerek başlayın
                  </p>
                </div>
              ) : (
                banners.map((banner, i) => (
                  <BannerCard
                    key={banner.id}
                    banner={banner}
                    index={i}
                    total={banners.length}
                    onDelete={(b) => setDeleteConfirm(b)}
                    onToggle={handleToggle}
                    onMoveUp={(idx) => moveItem(idx, "up")}
                    onMoveDown={(idx) => moveItem(idx, "down")}
                  />
                ))
              )}
            </div>
          </section>

          {/* Preview hint */}
          {banners.length > 0 && (
            <p className="text-center text-xs text-gray-400 pb-4">
              Sadece <span className="font-medium text-gray-600">aktif</span>{" "}
              bannerlar uygulamada gösterilir · Sıra değişiklikleri otomatik
              kaydedilir
            </p>
          )}
        </div>

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
              <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-base font-bold text-gray-900 text-center">
                Banner Silinsin mi?
              </h3>
              <p className="text-sm text-gray-500 text-center mt-1.5">
                {deleteConfirm.title ? `"${deleteConfirm.title}"` : "Bu banner"}{" "}
                kalıcı olarak silinecek ve geri alınamaz.
              </p>
              <div className="flex gap-2 mt-5">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Vazgeç
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
                >
                  Sil
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </div>
    </ProtectedRoute>
  );
}
