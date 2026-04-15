"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useActivityLog, createPageLogger } from "@/hooks/useActivityLog";
import {
  ArrowLeft,
  ShoppingBag,
  Save,
  Loader2,
  ImagePlus,
  Trash2,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import {
  MARKET_CATEGORIES,
  MARKET_CATEGORY_MAP,
} from "@/constants/marketCategories";
import { collection, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../lib/firebase";

const COLLECTION_NAME = "market-items";

interface FormState {
  category: string;
  name: string;
  brand: string;
  type: string;
  price: string;
  stock: string;
  description: string;
  isAvailable: boolean;
}

const INITIAL_FORM: FormState = {
  category: "",
  name: "",
  brand: "",
  type: "",
  price: "",
  stock: "",
  description: "",
  isAvailable: true,
};

export default function CreateMarketItemPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { logActivity } = useActivityLog();
  const logger = createPageLogger(logActivity, "CreateMarketItem");

  const preselectedCategory = searchParams.get("category") || "";

  const [form, setForm] = useState<FormState>({
    ...INITIAL_FORM,
    category: preselectedCategory,
  });
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // ── Form handlers ───────────────────────────────────────────────
  const updateField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleImageSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      // Max 5 images
      const remaining = 5 - images.length;
      const toAdd = files.slice(0, remaining);

      setImages((prev) => [...prev, ...toAdd]);

      // Generate previews
      toAdd.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setImagePreviews((prev) => [...prev, ev.target?.result as string]);
        };
        reader.readAsDataURL(file);
      });
    },
    [images.length],
  );

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Submit ──────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    setError(null);

    // Validation
    if (!form.category) return setError("Kategori seçiniz.");
    if (!form.name.trim()) return setError("Ürün adı giriniz.");
    if (!form.brand.trim()) return setError("Marka giriniz.");
    if (!form.type.trim()) return setError("Tür giriniz.");

    const price = parseFloat(form.price);
    if (isNaN(price) || price <= 0)
      return setError("Geçerli bir fiyat giriniz.");

    const stock = parseInt(form.stock, 10);
    if (isNaN(stock) || stock < 0) return setError("Geçerli bir stok giriniz.");

    setSaving(true);

    try {
      // 1. Generate doc ID
      const docRef = doc(collection(db, COLLECTION_NAME));
      const itemId = docRef.id;

      // 2. Upload images (parallel)
      const imageUrls: string[] = [];
      if (images.length > 0) {
        const uploadPromises = images.map(async (file, i) => {
          const ext = file.name.split(".").pop() || "jpg";
          const storagePath = `market-items/${itemId}/${i}.${ext}`;
          const storageRef = ref(storage, storagePath);
          await uploadBytes(storageRef, file);
          return getDownloadURL(storageRef);
        });
        const urls = await Promise.all(uploadPromises);
        imageUrls.push(...urls);
      }

      // 3. Write Firestore doc
      // These fields are what Typesense will index via the trigger
      await setDoc(docRef, {
        name: form.name.trim(),
        brand: form.brand.trim(),
        type: form.type.trim(),
        category: form.category,
        price,
        stock,
        description: form.description.trim() || "",
        imageUrl: imageUrls[0] || "",
        imageUrls,
        isAvailable: form.isAvailable,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      logger.action("Created market item", {
        itemId,
        category: form.category,
        name: form.name.trim(),
      });

      setSuccess(true);
      setForm({ ...INITIAL_FORM, category: form.category });
      setImages([]);
      setImagePreviews([]);

      // Navigate to items list after brief delay
      setTimeout(() => {
        router.push(`/market-items?category=${form.category}`);
      }, 1500);
    } catch (err) {
      console.error("[CreateMarketItem] Error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Ürün eklenirken bir hata oluştu.",
      );
    } finally {
      setSaving(false);
    }
  }, [form, images, router, logger]);

  // ── Render ──────────────────────────────────────────────────────
  const activeCat = MARKET_CATEGORY_MAP.get(form.category);
  const CategoryIcon = activeCat?.icon || ShoppingBag;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
        {/* ── Header ─────────────────────────────────────────── */}
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-[900px] mx-auto px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center shadow-sm">
                <CategoryIcon className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-gray-900 leading-tight">
                  Yeni Market Ürünü
                </h1>
                <p className="text-[11px] text-gray-500 leading-tight">
                  {activeCat?.labelTr || "Kategori seçiniz"}
                </p>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all text-xs font-medium shadow-sm"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </header>

        <main className="max-w-[900px] mx-auto px-6 py-8">
          {/* Status messages */}
          {error && (
            <div className="flex items-center gap-3 p-4 mb-6 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-3 p-4 mb-6 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <p>Ürün başarıyla eklendi! Yönlendiriliyorsunuz...</p>
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-6">
            {/* ── Category ─────────────────────────────────────── */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Kategori <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-[280px] overflow-y-auto p-1">
                {MARKET_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isSelected = form.category === cat.slug;
                  return (
                    <button
                      key={cat.slug}
                      type="button"
                      onClick={() => updateField("category", cat.slug)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-center transition-all ${
                        isSelected
                          ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <Icon
                        className={`w-5 h-5 ${
                          isSelected ? "text-emerald-600" : "text-gray-400"
                        }`}
                      />
                      <span
                        className={`text-[10px] font-medium leading-tight ${
                          isSelected ? "text-emerald-700" : "text-gray-600"
                        }`}
                      >
                        {cat.labelTr}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Name ─────────────────────────────────────────── */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Ürün Adı <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="Ör: Coca-Cola 1L"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all"
              />
            </div>

            {/* ── Brand & Type (side by side) ──────────────────── */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Marka <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.brand}
                  onChange={(e) => updateField("brand", e.target.value)}
                  placeholder="Ör: Coca-Cola"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Tür <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.type}
                  onChange={(e) => updateField("type", e.target.value)}
                  placeholder="Ör: Gazlı İçecek"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all"
                />
              </div>
            </div>

            {/* ── Price & Stock ────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Fiyat (TL) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={(e) => updateField("price", e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Stok <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.stock}
                  onChange={(e) => updateField("stock", e.target.value)}
                  placeholder="0"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all"
                />
              </div>
            </div>

            {/* ── Description ──────────────────────────────────── */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Açıklama
              </label>
              <textarea
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
                placeholder="Ürün açıklaması (opsiyonel)"
                rows={3}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all resize-none"
              />
            </div>

            {/* ── Images ───────────────────────────────────────── */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Görseller{" "}
                <span className="text-gray-400 font-normal">(maks. 5)</span>
              </label>
              <div className="flex flex-wrap gap-3">
                {imagePreviews.map((src, i) => (
                  <div
                    key={i}
                    className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200 group"
                  >
                    <img
                      src={src}
                      alt={`Preview ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                {images.length < 5 && (
                  <label className="w-24 h-24 flex flex-col items-center justify-center gap-1 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-all">
                    <ImagePlus className="w-5 h-5 text-gray-400" />
                    <span className="text-[10px] text-gray-400">Ekle</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            {/* ── Availability toggle ──────────────────────────── */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-semibold text-gray-700">
                  Ürün Durumu
                </p>
                <p className="text-xs text-gray-500">
                  Pasif ürünler müşterilere gösterilmez
                </p>
              </div>
              <button
                type="button"
                onClick={() => updateField("isAvailable", !form.isAvailable)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  form.isAvailable ? "bg-emerald-500" : "bg-gray-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    form.isAvailable ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
