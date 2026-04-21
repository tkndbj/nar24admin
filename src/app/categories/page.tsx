"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronLeft,
  Layers,
  X,
  Upload,
  AlertCircle,
  CheckCircle2,
  LayoutList,
} from "lucide-react";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase"; // adjust to your firebase config path
import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { DEFAULT_CATEGORY_DATA } from "../defaultCategoryData"; // see separate file

// ─── Types ──────────────────────────────────────────────────────────────────

interface BuyerSubcategory {
  key: string;
  subSubcategories: string[];
}

interface BuyerCategory {
  key: string;
  image: string;
  subcategories: BuyerSubcategory[];
}

interface CategoryStructure {
  buyerCategories: BuyerCategory[];
  buyerToProductMapping: Record<string, Record<string, string>>;
}

interface CategoryMeta {
  version: string;
  updatedAt: unknown;
  updatedBy: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const ACCENT_COLORS = [
  "bg-blue-500", "bg-violet-500", "bg-pink-500", "bg-orange-500",
  "bg-emerald-500", "bg-cyan-500", "bg-amber-500", "bg-indigo-500",
  "bg-teal-500", "bg-lime-500", "bg-red-500", "bg-slate-500",
];

function getAccent(i: number) {
  return ACCENT_COLORS[i % ACCENT_COLORS.length];
}

function generateVersion(): string {
  const now = new Date();
  return now.toISOString().slice(0, 16).replace("T", "-");
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CategoriesPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [structure, setStructure] = useState<CategoryStructure | null>(null);
  const [meta, setMeta] = useState<CategoryMeta | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [expandedSubs, setExpandedSubs] = useState<Set<number>>(new Set());
  const [newSubInputs, setNewSubInputs] = useState<Record<number, string>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "warn" } | null>(null);

  // ── Toast ─────────────────────────────────────────────────────────────────

  const showToast = useCallback((msg: string, type: "success" | "warn" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Load from Firestore ───────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const [metaSnap, structSnap] = await Promise.all([
          getDoc(doc(db, "categories", "meta")),
          getDoc(doc(db, "categories", "structure")),
        ]);

        if (structSnap.exists()) {
          setStructure(structSnap.data() as CategoryStructure);
        } else {
          // First time: use bundled defaults
          setStructure(DEFAULT_CATEGORY_DATA);
        }

        if (metaSnap.exists()) {
          setMeta(metaSnap.data() as CategoryMeta);
        }
      } catch (err) {
        console.error("Failed to load categories:", err);
        setStructure(DEFAULT_CATEGORY_DATA);
        showToast("Firestore'dan yüklenemedi, varsayılan veri kullanılıyor.", "warn");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [showToast]);

  // ── Mark changed ─────────────────────────────────────────────────────────

  const markChanged = useCallback(() => setHasChanges(true), []);

  // ── Publish ───────────────────────────────────────────────────────────────

  async function handlePublish() {
    if (!structure) return;
    setPublishing(true);
    try {
      const version = generateVersion();
      const batch = [
        setDoc(doc(db, "categories", "structure"), structure),
        setDoc(doc(db, "categories", "meta"), {
          version,
          updatedAt: serverTimestamp(),
          updatedBy: user?.email ?? "admin",
        }),
      ];
      await Promise.all(batch);
      setMeta({ version, updatedAt: new Date(), updatedBy: user?.email ?? "admin" });
      setHasChanges(false);
      showToast("Firestore'a başarıyla yayınlandı!");
    } catch (err) {
      console.error("Publish error:", err);
      showToast("Yayınlama başarısız. Tekrar deneyin.", "warn");
    } finally {
      setPublishing(false);
    }
  }

  // ── Category mutations ────────────────────────────────────────────────────

  function updateStructure(updater: (draft: CategoryStructure) => void) {
    setStructure((prev) => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev)) as CategoryStructure;
      updater(next);
      return next;
    });
    markChanged();
  }

  function renameBuyerCategory(i: number, val: string) {
    if (!val.trim()) return;
    updateStructure((d) => { d.buyerCategories[i].key = val.trim(); });
  }

  function deleteBuyerCategory(i: number) {
    const key = structure!.buyerCategories[i].key;
    if (!confirm(`"${key}" kategorisi silinsin mi?`)) return;
    updateStructure((d) => { d.buyerCategories.splice(i, 1); });
    if (selectedIndex === i) setSelectedIndex(null);
    else if (selectedIndex !== null && selectedIndex > i) setSelectedIndex(selectedIndex - 1);
    showToast(`"${key}" silindi`, "warn");
  }

  function addBuyerCategory() {
    const name = prompt("Yeni alıcı kategori adı:");
    if (!name?.trim()) return;
    updateStructure((d) => {
      d.buyerCategories.push({ key: name.trim(), image: "", subcategories: [] });
    });
    setSelectedIndex((structure?.buyerCategories.length ?? 0)); // will be the new index
    showToast(`"${name.trim()}" eklendi`);
  }

  function renameSubcategory(si: number, val: string) {
    if (selectedIndex === null || !val.trim()) return;
    updateStructure((d) => {
      d.buyerCategories[selectedIndex].subcategories[si].key = val.trim();
    });
  }

  function addSubcategory() {
    if (selectedIndex === null) return;
    const name = prompt("Yeni alt kategori adı:");
    if (!name?.trim()) return;
    updateStructure((d) => {
      d.buyerCategories[selectedIndex].subcategories.push({
        key: name.trim(),
        subSubcategories: [],
      });
    });
    showToast(`"${name.trim()}" eklendi`);
  }

  function deleteSubcategory(si: number) {
    if (selectedIndex === null) return;
    const key = structure!.buyerCategories[selectedIndex].subcategories[si].key;
    if (!confirm(`"${key}" silinsin mi?`)) return;
    updateStructure((d) => {
      d.buyerCategories[selectedIndex].subcategories.splice(si, 1);
    });
    showToast(`"${key}" silindi`, "warn");
  }

  function addSubSubcategory(si: number) {
    if (selectedIndex === null) return;
    const val = (newSubInputs[si] ?? "").trim();
    if (!val) return;
    updateStructure((d) => {
      d.buyerCategories[selectedIndex].subcategories[si].subSubcategories.push(val);
    });
    setNewSubInputs((prev) => ({ ...prev, [si]: "" }));
  }

  function deleteSubSubcategory(si: number, ti: number) {
    if (selectedIndex === null) return;
    updateStructure((d) => {
      d.buyerCategories[selectedIndex].subcategories[si].subSubcategories.splice(ti, 1);
    });
  }

  function toggleSub(si: number) {
    setExpandedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(si)) {
        next.delete(si);
      } else {
        next.add(si);
      }
      return next;
    });
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = structure
    ? structure.buyerCategories.reduce(
        (acc, c) => {
          acc.subs += c.subcategories.length;
          c.subcategories.forEach((s) => (acc.subsubs += s.subSubcategories.length));
          return acc;
        },
        { subs: 0, subsubs: 0 }
      )
    : { subs: 0, subsubs: 0 };

  const selectedCat = selectedIndex !== null ? structure?.buyerCategories[selectedIndex] : null;

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500">Kategoriler yükleniyor...</p>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">

        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
                <Layers className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-gray-900 leading-tight">Kategori Yönetimi</h1>
                <p className="text-[11px] text-gray-500 leading-tight">
                  {meta ? `Son yayın: ${meta.version}` : "Henüz yayınlanmadı"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {hasChanges && (
                <div className="flex items-center gap-1.5 text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">Yayınlanmamış değişiklikler</span>
                </div>
              )}
              <button
                onClick={handlePublish}
                disabled={!hasChanges || publishing}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold shadow-sm transition-all ${
                  hasChanges && !publishing
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-blue-200"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
              >
                {publishing ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                {publishing ? "Yayınlanıyor..." : "Firestore'a Yayınla"}
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-[1400px] mx-auto px-6 py-8">

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: "Alıcı Kategorileri", value: structure?.buyerCategories.length ?? 0 },
              { label: "Alt Kategoriler", value: stats.subs },
              { label: "Alt-Alt Kategoriler", value: stats.subsubs },
            ].map((s) => (
              <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="text-xs text-gray-500 mb-1">{s.label}</div>
                <div className="text-2xl font-bold text-gray-900">{s.value}</div>
              </div>
            ))}
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center gap-3">
              {hasChanges ? (
                <>
                  <div className="w-2 h-2 bg-amber-400 rounded-full" />
                  <div>
                    <div className="text-xs text-gray-500">Durum</div>
                    <div className="text-xs font-semibold text-amber-600">Yayınlanmamış</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 bg-emerald-400 rounded-full" />
                  <div>
                    <div className="text-xs text-gray-500">Durum</div>
                    <div className="text-xs font-semibold text-emerald-600">Güncel</div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Layout */}
          <div className="grid grid-cols-[280px_1fr] gap-4 items-start">

            {/* LEFT: Buyer category list */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <LayoutList className="w-4 h-4 text-gray-400" />
                  <span className="text-xs font-semibold text-gray-700">Alıcı Kategorileri</span>
                </div>
                <button
                  onClick={addBuyerCategory}
                  className="flex items-center gap-1 text-[11px] text-blue-600 bg-blue-50 border border-blue-200 rounded-md px-2 py-1 hover:bg-blue-100 transition-colors font-medium"
                >
                  <Plus className="w-3 h-3" />
                  Ekle
                </button>
              </div>
              <div className="max-h-[600px] overflow-y-auto">
                {structure?.buyerCategories.map((cat, i) => (
                  <button
                    key={i}
                    onClick={() => { setSelectedIndex(i); setExpandedSubs(new Set()); }}
                    className={`w-full flex items-center justify-between px-4 py-3 text-left border-b border-gray-50 transition-colors group ${
                      selectedIndex === i ? "bg-blue-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 ${getAccent(i)} rounded-lg flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0`}>
                        {cat.key.charAt(0)}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-gray-800">{cat.key}</div>
                        <div className="text-[10px] text-gray-400">{cat.subcategories.length} alt kategori</div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteBuyerCategory(i); }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 hover:text-red-500 text-gray-300 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </button>
                ))}
              </div>
            </div>

            {/* RIGHT: Editor */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm min-h-[400px]">
              {!selectedCat ? (
                <div className="flex flex-col items-center justify-center h-[400px] text-gray-400">
                  <Layers className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm font-medium">Düzenlemek için sol taraftan bir kategori seçin</p>
                </div>
              ) : (
                <>
                  {/* Editor header */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 ${getAccent(selectedIndex!)} rounded-xl flex items-center justify-center text-sm font-bold text-white`}>
                        {selectedCat.key.charAt(0)}
                      </div>
                      <div>
                        <input
                          defaultValue={selectedCat.key}
                          onBlur={(e) => renameBuyerCategory(selectedIndex!, e.target.value)}
                          className="text-sm font-bold text-gray-900 border-none outline-none bg-transparent focus:bg-blue-50 focus:rounded focus:px-1 transition-all w-48"
                        />
                        <p className="text-[11px] text-gray-400">{selectedCat.subcategories.length} alt kategori · Adı tıklayarak düzenleyin</p>
                      </div>
                    </div>
                    <button
                      onClick={addSubcategory}
                      className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 hover:bg-blue-100 transition-colors font-semibold"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Alt Kategori Ekle
                    </button>
                  </div>

                  {/* Subcategories */}
                  <div className="p-4 flex flex-col gap-3">
                    {selectedCat.subcategories.length === 0 && (
                      <div className="text-center py-8 text-gray-400 text-sm">
                        Henüz alt kategori yok. &quot;Alt Kategori Ekle&quot; butonunu kullanın.
                      </div>
                    )}
                    {selectedCat.subcategories.map((sub, si) => {
                      const isOpen = expandedSubs.has(si);
                      return (
                        <div key={si} className="border border-gray-200 rounded-xl overflow-hidden hover:border-blue-200 transition-colors">
                          {/* Sub header */}
                          <div
                            className="flex items-center gap-2 px-4 py-3 bg-gray-50 cursor-pointer select-none"
                            onClick={() => toggleSub(si)}
                          >
                            <ChevronDown
                              className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? "" : "-rotate-90"}`}
                            />
                            <input
                              value={sub.key}
                              onChange={(e) => renameSubcategory(si, e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs font-semibold text-gray-700 flex-1 border-none outline-none bg-transparent focus:bg-white focus:rounded focus:px-1 transition-all"
                            />
                            <span className="text-[10px] text-gray-400 bg-white border border-gray-200 rounded-full px-2 py-0.5">
                              {sub.subSubcategories.length}
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteSubcategory(si); }}
                              className="p-1 hover:bg-red-50 hover:text-red-500 text-gray-300 rounded transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Sub-sub tags */}
                          {isOpen && (
                            <div className="px-4 py-3 border-t border-gray-100">
                              <div className="flex flex-wrap gap-1.5 mb-3">
                                {sub.subSubcategories.length === 0 && (
                                  <span className="text-[11px] text-gray-400 italic">Henüz alt-alt kategori yok</span>
                                )}
                                {sub.subSubcategories.map((tag, ti) => (
                                  <span
                                    key={ti}
                                    className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-[11px] text-slate-600"
                                  >
                                    {tag}
                                    <button
                                      onClick={() => deleteSubSubcategory(si, ti)}
                                      className="text-slate-300 hover:text-red-500 transition-colors leading-none"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={newSubInputs[si] ?? ""}
                                  onChange={(e) => setNewSubInputs((prev) => ({ ...prev, [si]: e.target.value }))}
                                  onKeyDown={(e) => { if (e.key === "Enter") addSubSubcategory(si); }}
                                  placeholder="Yeni ekle..."
                                  className="text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all w-44"
                                />
                                <button
                                  onClick={() => addSubSubcategory(si)}
                                  className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 hover:bg-blue-100 transition-colors font-medium"
                                >
                                  Ekle
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </main>

        {/* Toast */}
        {toast && (
          <div className={`fixed bottom-6 right-6 flex items-center gap-2.5 px-4 py-3 rounded-xl text-white text-sm font-medium shadow-xl z-50 transition-all ${
            toast.type === "success" ? "bg-gray-900" : "bg-amber-600"
          }`}>
            {toast.type === "success"
              ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              : <AlertCircle className="w-4 h-4 text-white" />
            }
            {toast.msg}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}