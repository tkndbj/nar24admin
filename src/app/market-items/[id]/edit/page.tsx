"use client";

import { useRouter, useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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
  Flame,
} from "lucide-react";
import {
  MARKET_CATEGORIES,
  MARKET_CATEGORY_MAP,
} from "@/constants/marketCategories";
import {
  doc,
  getDoc,
  updateDoc,
  deleteField,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../../lib/firebase";

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
  // Nutrition (optional — all strings for input handling)
  servingSize: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
  sugar: string;
  salt: string;
}

const EMPTY_FORM: FormState = {
  category: "",
  name: "",
  brand: "",
  type: "",
  price: "",
  stock: "",
  description: "",
  isAvailable: true,
  servingSize: "",
  calories: "",
  protein: "",
  carbs: "",
  fat: "",
  fiber: "",
  sugar: "",
  salt: "",
};

type NutritionKey =
  | "calories"
  | "protein"
  | "carbs"
  | "fat"
  | "fiber"
  | "sugar"
  | "salt";

const NUTRITION_FIELDS: {
  key: NutritionKey;
  label: string;
  unit: string;
  placeholder: string;
}[] = [
  { key: "calories", label: "Kalori", unit: "kcal", placeholder: "0" },
  { key: "protein", label: "Protein", unit: "g", placeholder: "0" },
  { key: "carbs", label: "Karbonhidrat", unit: "g", placeholder: "0" },
  { key: "fat", label: "Yağ", unit: "g", placeholder: "0" },
  { key: "fiber", label: "Lif", unit: "g", placeholder: "0" },
  { key: "sugar", label: "Şeker", unit: "g", placeholder: "0" },
  { key: "salt", label: "Tuz", unit: "g", placeholder: "0" },
];

const numToStr = (v: unknown): string =>
  typeof v === "number" && !isNaN(v) ? String(v) : "";

export default function EditMarketItemPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const itemId = params?.id || "";
  const { logActivity } = useActivityLog();
  const logger = createPageLogger(logActivity, "EditMarketItem");

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [newImagePreviews, setNewImagePreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // ── Load item ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!itemId) return;
      setLoading(true);
      setError(null);
      try {
        const snap = await getDoc(doc(db, COLLECTION_NAME, itemId));
        if (cancelled) return;
        if (!snap.exists()) {
          setNotFound(true);
          return;
        }
        const d = snap.data();
        const nutrition = (d.nutrition || {}) as Record<string, unknown>;
        setForm({
          category: d.category || "",
          name: d.name || "",
          brand: d.brand || "",
          type: d.type || "",
          price: numToStr(d.price),
          stock: numToStr(d.stock),
          description: d.description || "",
          isAvailable: d.isAvailable !== false,
          servingSize:
            typeof nutrition.servingSize === "string"
              ? nutrition.servingSize
              : "",
          calories: numToStr(nutrition.calories),
          protein: numToStr(nutrition.protein),
          carbs: numToStr(nutrition.carbs),
          fat: numToStr(nutrition.fat),
          fiber: numToStr(nutrition.fiber),
          sugar: numToStr(nutrition.sugar),
          salt: numToStr(nutrition.salt),
        });
        const urls: string[] = Array.isArray(d.imageUrls)
          ? d.imageUrls
          : d.imageUrl
            ? [d.imageUrl]
            : [];
        setExistingImageUrls(urls);
      } catch (err: unknown) {
        console.error("[EditMarketItem] Load error:", err);
        setError(
          err instanceof Error ? err.message : "Ürün yüklenirken hata oluştu.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  // ── Form handlers ───────────────────────────────────────────────
  const updateField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const totalImages = existingImageUrls.length + newImages.length;

  const handleImageSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      const remaining = 5 - totalImages;
      const toAdd = files.slice(0, remaining);

      setNewImages((prev) => [...prev, ...toAdd]);

      toAdd.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setNewImagePreviews((prev) => [
            ...prev,
            ev.target?.result as string,
          ]);
        };
        reader.readAsDataURL(file);
      });
    },
    [totalImages],
  );

  const removeExistingImage = useCallback((index: number) => {
    setExistingImageUrls((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const removeNewImage = useCallback((index: number) => {
    setNewImages((prev) => prev.filter((_, i) => i !== index));
    setNewImagePreviews((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Submit ──────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    setError(null);

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
      // 1. Upload new images (parallel)
      let finalImageUrls = [...existingImageUrls];
      if (newImages.length > 0) {
        const baseIndex = Date.now();
        const uploadPromises = newImages.map(async (file, i) => {
          const ext = file.name.split(".").pop() || "jpg";
          const storagePath = `market-items/${itemId}/${baseIndex}-${i}.${ext}`;
          const storageRef = ref(storage, storagePath);
          await uploadBytes(storageRef, file);
          return getDownloadURL(storageRef);
        });
        const urls = await Promise.all(uploadPromises);
        finalImageUrls = [...finalImageUrls, ...urls];
      }

      // 2. Build nutrition object
      const parseNum = (s: string): number | null => {
        const t = s.trim().replace(",", ".");
        if (!t) return null;
        const n = parseFloat(t);
        return isNaN(n) ? null : n;
      };
      const nutritionEntries: Record<string, number | string> = {};
      const servingSizeTrim = form.servingSize.trim();
      if (servingSizeTrim) nutritionEntries.servingSize = servingSizeTrim;
      for (const f of NUTRITION_FIELDS) {
        const v = parseNum(form[f.key]);
        if (v !== null) nutritionEntries[f.key] = v;
      }
      const hasNutrition = Object.keys(nutritionEntries).length > 0;

      // 3. Update Firestore doc
      await updateDoc(doc(db, COLLECTION_NAME, itemId), {
        name: form.name.trim(),
        brand: form.brand.trim(),
        type: form.type.trim(),
        category: form.category,
        price,
        stock,
        description: form.description.trim() || "",
        imageUrl: finalImageUrls[0] || "",
        imageUrls: finalImageUrls,
        isAvailable: form.isAvailable,
        nutrition: hasNutrition ? nutritionEntries : deleteField(),
        updatedAt: serverTimestamp(),
      });

      logger.action("Updated market item", {
        itemId,
        category: form.category,
        name: form.name.trim(),
      });

      setSuccess(true);
      setNewImages([]);
      setNewImagePreviews([]);

      setTimeout(() => {
        router.push(`/market-items?category=${form.category}`);
      }, 1200);
    } catch (err: unknown) {
      console.error("[EditMarketItem] Error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Ürün güncellenirken bir hata oluştu.",
      );
    } finally {
      setSaving(false);
    }
  }, [form, newImages, existingImageUrls, itemId, router, logger]);

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
                  Ürünü Düzenle
                </h1>
                <p className="text-[11px] text-gray-500 leading-tight">
                  {activeCat?.labelTr || "Kategori"}
                </p>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={saving || loading || notFound}
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
          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">Yükleniyor...</span>
            </div>
          )}

          {/* Not found */}
          {!loading && notFound && (
            <div className="flex items-center gap-3 p-4 mb-6 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>Ürün bulunamadı.</p>
            </div>
          )}

          {/* Status messages */}
          {!loading && !notFound && error && (
            <div className="flex items-center gap-3 p-4 mb-6 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}
          {!loading && !notFound && success && (
            <div className="flex items-center gap-3 p-4 mb-6 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <p>Ürün güncellendi! Yönlendiriliyorsunuz...</p>
            </div>
          )}

          {!loading && !notFound && (
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

              {/* ── Brand & Type ─────────────────────────────────── */}
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
                  {existingImageUrls.map((src, i) => (
                    <div
                      key={`existing-${i}`}
                      className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200 group"
                    >
                      <img
                        src={src}
                        alt={`Existing ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeExistingImage(i)}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  {newImagePreviews.map((src, i) => (
                    <div
                      key={`new-${i}`}
                      className="relative w-24 h-24 rounded-lg overflow-hidden border border-emerald-300 group"
                    >
                      <img
                        src={src}
                        alt={`New ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-emerald-500 text-white text-[9px] font-semibold rounded">
                        YENİ
                      </span>
                      <button
                        type="button"
                        onClick={() => removeNewImage(i)}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  {totalImages < 5 && (
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

              {/* ── Nutrition (optional) ─────────────────────────── */}
              <div className="border-t border-gray-100 pt-6">
                <div className="flex items-center gap-2 mb-1">
                  <Flame className="w-4 h-4 text-amber-500" />
                  <label className="block text-sm font-semibold text-gray-700">
                    Besin Değerleri
                  </label>
                  <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    Opsiyonel
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  Doldurulan alanlar ürün detayında gösterilir. Tüm alanları
                  boşaltırsanız besin değerleri kaldırılır.
                </p>

                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Porsiyon
                  </label>
                  <input
                    type="text"
                    value={form.servingSize}
                    onChange={(e) =>
                      updateField("servingSize", e.target.value)
                    }
                    placeholder="Ör: 100g, 1 adet, 250ml"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {NUTRITION_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">
                        {f.label}{" "}
                        <span className="text-gray-400 font-normal">
                          ({f.unit})
                        </span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form[f.key]}
                        onChange={(e) => updateField(f.key, e.target.value)}
                        placeholder={f.placeholder}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all"
                      />
                    </div>
                  ))}
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
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
