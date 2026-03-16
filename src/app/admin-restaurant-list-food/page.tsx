"use client";

import React, { useState, useEffect, useCallback, useRef, Suspense } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { db, storage, auth } from "@/app/lib/firebase";
import {
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
 
  orderBy,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
} from "firebase/storage";
import { toast } from "react-hot-toast";
import {
  ArrowLeft,
  Camera,
  ChefHat,
  UtensilsCrossed,
  Clock,
  DollarSign,
  FileText,
  ListChecks,
  Loader2,
  Search,
  CheckCircle,
  X,
  ImageIcon,
} from "lucide-react";
import { FoodCategoryData } from "@/constants/foodData";
import { FoodExtrasData } from "@/constants/foodExtras";
import {
  smartCompress,
  shouldCompress,
} from "@/utils/imageCompression";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RestaurantOption {
  id: string;
  name: string;
  profileImageUrl?: string;
  address?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE  = 10 * 1024 * 1024;
const ACCEPTED_TYPES = [
  "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp",
];

// ─── Restaurant Picker ────────────────────────────────────────────────────────

function RestaurantPicker({
  selected,
  onSelect,
}: {
  selected: RestaurantOption | null;
  onSelect: (r: RestaurantOption) => void;
}) {
  const [searchQuery, setSearchQuery]     = useState("");
  const [restaurants, setRestaurants]     = useState<RestaurantOption[]>([]);
  const [loading, setLoading]             = useState(true);
  const [showDropdown, setShowDropdown]   = useState(false);
  const containerRef                      = useRef<HTMLDivElement>(null);

  // Load all restaurants on mount
  useEffect(() => {
    const fetch = async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, "restaurants"),
            orderBy("name"),
            limit(100)
          )
        );
        setRestaurants(
          snap.docs.map((d) => ({
            id:              d.id,
            name:            d.data().name ?? "Unnamed",
            profileImageUrl: d.data().profileImageUrl,
            address:         d.data().address,
          }))
        );
      } catch (err) {
        console.error("Failed to load restaurants:", err);
        toast.error("Failed to load restaurants");
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = restaurants.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div ref={containerRef} className="relative">
      {selected ? (
        /* Selected state */
        <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
          <div className="relative w-9 h-9 rounded-lg overflow-hidden flex-shrink-0">
            {selected.profileImageUrl ? (
              <Image
                src={selected.profileImageUrl}
                alt={selected.name}
                fill
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full bg-emerald-100 flex items-center justify-center">
                <UtensilsCrossed className="w-4 h-4 text-emerald-600" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-gray-900 truncate">{selected.name}</p>
            {selected.address && (
              <p className="text-[11px] text-gray-500 truncate">{selected.address}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <button
              type="button"
              onClick={() => { onSelect(null as unknown as RestaurantOption); setSearchQuery(""); }}
              className="w-7 h-7 flex items-center justify-center hover:bg-emerald-100 rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5 text-emerald-600" />
            </button>
          </div>
        </div>
      ) : (
        /* Search input */
        <div>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              placeholder="Search restaurants..."
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all"
            />
          </div>

          {showDropdown && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-6 gap-2 text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-[12px]">Loading...</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-[12px] text-gray-400">No restaurants found</p>
                </div>
              ) : (
                filtered.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => { onSelect(r); setShowDropdown(false); setSearchQuery(""); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="relative w-8 h-8 rounded-lg overflow-hidden flex-shrink-0">
                      {r.profileImageUrl ? (
                        <Image src={r.profileImageUrl} alt={r.name} fill className="object-cover" />
                      ) : (
                        <div className="w-full h-full bg-orange-100 flex items-center justify-center">
                          <UtensilsCrossed className="w-3.5 h-3.5 text-orange-600" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-900 truncate">{r.name}</p>
                      {r.address && (
                        <p className="text-[11px] text-gray-400 truncate">{r.address}</p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Food Form ────────────────────────────────────────────────────────────────

function AdminFoodFormContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const editId       = searchParams.get("edit");
  const preloadId    = searchParams.get("restaurantId");
  const isEditMode   = Boolean(editId);

  // ── Restaurant selection ──────────────────────────────────────────────────
  const [selectedRestaurant, setSelectedRestaurant] = useState<RestaurantOption | null>(null);
  const [loadingPreload, setLoadingPreload]          = useState(Boolean(preloadId));

  // Pre-load restaurant if restaurantId is in query params
  useEffect(() => {
    if (!preloadId) return;
    const fetch = async () => {
      try {
        const snap = await getDoc(doc(db, "restaurants", preloadId));
        if (snap.exists()) {
          setSelectedRestaurant({
            id:              snap.id,
            name:            snap.data().name ?? "Unnamed",
            profileImageUrl: snap.data().profileImageUrl,
            address:         snap.data().address,
          });
        }
      } catch (err) {
        console.error("Failed to preload restaurant:", err);
      } finally {
        setLoadingPreload(false);
      }
    };
    fetch();
  }, [preloadId]);

  // ── Form state — mirrors RestaurantListFoodPage exactly ──────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName]               = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice]             = useState("");
  const [category, setCategory]       = useState("");
  const [foodType, setFoodType]       = useState("");
  const [preparationTime, setPrepTime] = useState("");
  const [selectedExtras, setSelectedExtras] = useState<Record<string, number>>({});
  const [imageFile, setImageFile]           = useState<File | null>(null);
  const [imagePreview, setImagePreview]     = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [saving, setSaving]             = useState(false);
  const [loadingFood, setLoadingFood]   = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [errors, setErrors]             = useState<Record<string, string>>({});

  // Cleanup preview on unmount
  useEffect(() => {
    return () => { if (imagePreview && !imagePreview.startsWith("http")) URL.revokeObjectURL(imagePreview); };
  }, [imagePreview]);

  // Fetch existing food in edit mode
  useEffect(() => {
    if (!editId) return;
    const fetch = async () => {
      setLoadingFood(true);
      try {
        const snap = await getDoc(doc(db, "foods", editId));
        if (snap.exists()) {
          const data = snap.data();
          setName(data.name || "");
          setDescription(data.description || "");
          setPrice(data.price?.toString() || "");
          setCategory(data.foodCategory || "");
          setFoodType(data.foodType || "");
          setPrepTime(data.preparationTime?.toString() || "");
          if (data.extras && Array.isArray(data.extras)) {
            const extrasMap: Record<string, number> = {};
            for (const ex of data.extras) {
              if (typeof ex === "string") extrasMap[ex] = 0;
              else if (ex?.name != null)  extrasMap[ex.name] = ex.price ?? 0;
            }
            setSelectedExtras(extrasMap);
          }
          if (data.imageUrl) {
            setExistingImageUrl(data.imageUrl);
            setImagePreview(data.imageUrl);
          }
          // Pre-fill restaurant if not already set
          if (data.restaurantId && !selectedRestaurant) {
            try {
              const rSnap = await getDoc(doc(db, "restaurants", data.restaurantId));
              if (rSnap.exists()) {
                setSelectedRestaurant({
                  id:              rSnap.id,
                  name:            rSnap.data().name ?? "Unnamed",
                  profileImageUrl: rSnap.data().profileImageUrl,
                  address:         rSnap.data().address,
                });
              }
            } catch { /* non-fatal */ }
          }
        }
      } catch (err) {
        console.error("Failed to fetch food:", err);
        toast.error("Failed to load food data");
      } finally {
        setLoadingFood(false);
      }
    };
    fetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const getCategoryName = useCallback((key: string): string => {
    return FoodCategoryData.kCategoryTranslationKeys[key] ?? key;
  }, []);

  const getFoodTypeName = useCallback((key: string): string => {
    return FoodCategoryData.kFoodTypeTranslationKeys?.[key] ?? key;
  }, []);

  const getExtraName = useCallback((key: string): string => {
    return FoodExtrasData.kExtrasTranslationKeys[key] ?? key;
  }, []);

  const availableFoodTypes = category ? FoodCategoryData.kFoodTypes[category] ?? [] : [];
  const availableExtras    = category ? FoodExtrasData.kExtras[category]       ?? [] : [];

  // ── Handlers ──────────────────────────────────────────────────────────────

  const clearError = useCallback((field: string) => {
    setErrors((p) => { const n = { ...p }; delete n[field]; return n; });
  }, []);

  const handleCategoryChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setCategory(e.target.value);
      setFoodType("");
      setSelectedExtras({});
      setErrors((p) => { const n = { ...p }; delete n.category; delete n.foodType; return n; });
    }, []
  );

  const handleExtraToggle = useCallback((extra: string) => {
    setSelectedExtras((p) => {
      if (extra in p) { const n = { ...p }; delete n[extra]; return n; }
      return { ...p, [extra]: 0 };
    });
  }, []);

  const handleExtraPriceChange = useCallback((extra: string, value: string) => {
    const parsed = parseFloat(value);
    setSelectedExtras((p) => ({ ...p, [extra]: isNaN(parsed) ? 0 : parsed }));
  }, []);

  const handleImageSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";

      if (!ACCEPTED_TYPES.includes(file.type)) { toast.error("Invalid file type"); return; }
      if (file.size > MAX_FILE_SIZE)            { toast.error("File too large (max 10MB)"); return; }

      clearError("image");

      let finalFile = file;
      if (shouldCompress(file, 500)) {
        setIsCompressing(true);
        try {
          const result = await smartCompress(file, "gallery");
          finalFile = result.compressedFile;
        } catch { /* use original */ }
        finally { setIsCompressing(false); }
      }

      if (imagePreview && !imagePreview.startsWith("http")) URL.revokeObjectURL(imagePreview);
      setImageFile(finalFile);
      setImagePreview(URL.createObjectURL(finalFile));
    },
    [clearError, imagePreview]
  );

  // ── Validation (matches user's validate function exactly) ─────────────────

  const validate = useCallback((): boolean => {
    const errs: Record<string, string> = {};
    if (!selectedRestaurant)           errs.restaurant = "Please select a restaurant";
    if (!name.trim())                  errs.name = "Name is required";
    else if (name.trim().length < 2)   errs.name = "Name must be at least 2 characters";
    if (description.trim() && description.trim().length < 10)
                                       errs.description = "Description must be at least 10 characters";
    if (!price.trim())                 errs.price = "Price is required";
    else if (parseFloat(price) <= 0)   errs.price = "Price must be positive";
    if (!category)                     errs.category = "Category is required";
    if (!foodType)                     errs.foodType = "Food type is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [selectedRestaurant, name, description, price, category, foodType]);

  // ── Image upload (same path structure as user's page) ─────────────────────

  const uploadImage = useCallback(async (file: File, restaurantId: string): Promise<string> => {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");
    const path = `foods/${uid}/${restaurantId}/${Date.now()}_${file.name}`;
    const ref  = storageRef(storage, path);
    const task = uploadBytesResumable(ref, file, { contentType: file.type });
    return new Promise<string>((resolve, reject) => {
      task.on("state_changed", null, reject, async () => {
        try { resolve(await getDownloadURL(task.snapshot.ref)); }
        catch (err) { reject(err); }
      });
    });
  }, []);

  // ── Submit (produces identical document to user's page) ───────────────────

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      // Image: upload new, keep existing, or empty
      let imageUrl = "";
      if (imageFile) {
        imageUrl = await uploadImage(imageFile, selectedRestaurant!.id);
      } else if (isEditMode && existingImageUrl) {
        imageUrl = existingImageUrl;
      }

      // Food data — identical structure to RestaurantListFoodPage
      const foodData = {
        name:            name.trim(),
        description:     description.trim(),
        price:           parseFloat(price),
        foodCategory:    category,
        foodType:        foodType,
        imageUrl,
        preparationTime: preparationTime ? parseInt(preparationTime, 10) : null,
        extras: Object.entries(selectedExtras).map(([extraName, extraPrice]) => ({
          name:  extraName,
          price: extraPrice,
        })),
      };

      if (isEditMode && editId) {
        await updateDoc(doc(db, "foods", editId), foodData);
        toast.success("Food updated successfully!");
      } else {
        await addDoc(collection(db, "foods"), {
          ...foodData,
          restaurantId: selectedRestaurant!.id,
          isAvailable:  true,
          createdAt:    serverTimestamp(),
        });
        toast.success("Food listed successfully!");
      }

      // Navigate to restaurant details after success
      router.push(`/restaurantdetails?restaurantId=${selectedRestaurant!.id}`);
    } catch (err) {
      console.error("Failed to save food:", err);
      toast.error(isEditMode ? "Failed to update food" : "Failed to list food");
    } finally {
      setSaving(false);
    }
  }, [
    validate, imageFile, uploadImage, selectedRestaurant, isEditMode,
    editId, existingImageUrl, name, description, price, category,
    foodType, preparationTime, selectedExtras, router,
  ]);

  // ── Loading states ────────────────────────────────────────────────────────

  if (loadingPreload) {
    return (
      <div className="min-h-screen bg-gray-50/50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-600">
          <Loader2 className="w-5 h-5 animate-spin text-orange-600" />
          <span className="text-[13px]">Loading...</span>
        </div>
      </div>
    );
  }

  if (loadingFood) {
    return (
      <div className="min-h-screen bg-gray-50/50 pt-14">
        <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse">
              <div className="h-4 bg-gray-100 rounded w-1/3 mb-4" />
              <div className="h-10 bg-gray-50 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50/50">

      {/* Header */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 flex items-center justify-center bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-gray-600" />
          </button>
          <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center">
            <UtensilsCrossed className="w-4 h-4 text-orange-600" />
          </div>
          <div>
            <h1 className="text-[15px] font-semibold text-gray-900">
              {isEditMode ? "Edit Food Item" : "List Food Item"}
            </h1>
            <p className="text-[11px] text-gray-400">Admin — direct listing</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4 pb-16">

        {/* ── Section 0: Restaurant Selector ───────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-7 h-7 bg-orange-50 rounded-lg flex items-center justify-center">
              <UtensilsCrossed className="w-3.5 h-3.5 text-orange-600" />
            </div>
            <h2 className="text-[15px] font-semibold text-gray-900">Restaurant *</h2>
          </div>

          <RestaurantPicker
            selected={selectedRestaurant}
            onSelect={(r) => setSelectedRestaurant(r)}
          />

          {errors.restaurant && (
            <p className="text-[11px] text-red-500 mt-1.5">{errors.restaurant}</p>
          )}
        </div>

        {/* ── Section 1: Image ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-7 h-7 bg-orange-50 rounded-lg flex items-center justify-center">
              <ImageIcon className="w-3.5 h-3.5 text-orange-600" />
            </div>
            <h2 className="text-[15px] font-semibold text-gray-900">Image</h2>
            <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
              Optional
            </span>
          </div>

          <div
            onClick={() => !isCompressing && fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-xl overflow-hidden transition-all cursor-pointer ${
              errors.image
                ? "border-red-300 bg-red-50/30"
                : imagePreview
                  ? "border-gray-200"
                  : "border-gray-200 hover:border-orange-300 hover:bg-orange-50/30"
            }`}
          >
            {isCompressing && (
              <div className="absolute inset-0 bg-white/90 flex items-center justify-center z-20">
                <div className="text-center">
                  <div className="w-8 h-8 mx-auto mb-2 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                  <p className="text-[11px] text-gray-400">Compressing...</p>
                </div>
              </div>
            )}
            {imagePreview ? (
              <div className="relative aspect-[16/10] w-full">
                <Image src={imagePreview} alt="Preview" fill className="object-cover" />
                <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center">
                  <span className="opacity-0 hover:opacity-100 text-white text-[13px] font-medium bg-black/50 px-3 py-1.5 rounded-lg backdrop-blur-sm transition-opacity">
                    Change image
                  </span>
                </div>
              </div>
            ) : (
              <div className="py-10 text-center">
                <Camera className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-[13px] font-medium text-gray-500">
                  Click to upload food photo
                </p>
                <p className="text-[11px] text-gray-400 mt-1">JPEG, PNG, WebP up to 10MB</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
          </div>
          {errors.image && (
            <p className="text-[11px] text-red-500 mt-1.5">{errors.image}</p>
          )}
        </div>

        {/* ── Section 2: Food Details ───────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-7 h-7 bg-orange-50 rounded-lg flex items-center justify-center">
              <FileText className="w-3.5 h-3.5 text-orange-600" />
            </div>
            <h2 className="text-[15px] font-semibold text-gray-900">Food Details</h2>
          </div>

          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-[12px] font-medium text-gray-500 mb-1.5">
                Food Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  const val = e.target.value;
                  const titled = val
                    .split(" ")
                    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ""))
                    .join(" ");
                  setName(titled);
                  clearError("name");
                }}
                placeholder="e.g. Bacon Burger"
                className={`w-full px-3 py-2.5 rounded-xl border bg-white text-[13px] text-gray-800 transition-all placeholder:text-gray-300 ${
                  errors.name
                    ? "border-red-300 focus:ring-2 focus:ring-red-500/20 focus:border-red-400"
                    : "border-gray-200 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
                }`}
              />
              {errors.name && <p className="text-[11px] text-red-500 mt-1">{errors.name}</p>}
            </div>

            {/* Description */}
            <div>
              <label className="flex items-center gap-1.5 text-[12px] font-medium text-gray-500 mb-1.5">
                Description
                <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                  Optional
                </span>
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => {
                  const val = e.target.value;
                  setDescription(val ? val.charAt(0).toUpperCase() + val.slice(1) : "");
                  clearError("description");
                }}
                placeholder="Brief description of this dish..."
                className={`w-full px-3 py-2.5 rounded-xl border bg-white text-[13px] text-gray-800 transition-all placeholder:text-gray-300 resize-none ${
                  errors.description
                    ? "border-red-300 focus:ring-2 focus:ring-red-500/20 focus:border-red-400"
                    : "border-gray-200 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
                }`}
              />
              {errors.description && (
                <p className="text-[11px] text-red-500 mt-1">{errors.description}</p>
              )}
            </div>

            {/* Price */}
            <div>
              <label className="block text-[12px] font-medium text-gray-500 mb-1.5">
                Price *
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={price}
                  onChange={(e) => { setPrice(e.target.value); clearError("price"); }}
                  placeholder="0.00"
                  className={`w-full pl-9 pr-12 py-2.5 rounded-xl border bg-white text-[13px] text-gray-800 transition-all placeholder:text-gray-300 ${
                    errors.price
                      ? "border-red-300 focus:ring-2 focus:ring-red-500/20 focus:border-red-400"
                      : "border-gray-200 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
                  }`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-medium text-gray-400">
                  TL
                </span>
              </div>
              {errors.price && <p className="text-[11px] text-red-500 mt-1">{errors.price}</p>}
            </div>
          </div>
        </div>

        {/* ── Section 3: Category ───────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-7 h-7 bg-orange-50 rounded-lg flex items-center justify-center">
              <ChefHat className="w-3.5 h-3.5 text-orange-600" />
            </div>
            <h2 className="text-[15px] font-semibold text-gray-900">Category *</h2>
          </div>

          <div className="space-y-4">
            {/* Food Category */}
            <div>
              <label className="block text-[12px] font-medium text-gray-500 mb-1.5">
                Food Category
              </label>
              <select
                value={category}
                onChange={handleCategoryChange}
                className={`w-full px-3 py-2.5 rounded-xl border bg-white text-[13px] text-gray-800 transition-all ${
                  errors.category
                    ? "border-red-300 focus:ring-2 focus:ring-red-500/20 focus:border-red-400"
                    : "border-gray-200 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
                }`}
              >
                <option value="">Select category...</option>
                {FoodCategoryData.kCategories.map(({ key }) => (
                  <option key={key} value={key}>{getCategoryName(key)}</option>
                ))}
              </select>
              {errors.category && (
                <p className="text-[11px] text-red-500 mt-1">{errors.category}</p>
              )}
            </div>

            {/* Food Type */}
            <div>
              <label className="block text-[12px] font-medium text-gray-500 mb-1.5">
                Food Type
              </label>
              <select
                value={foodType}
                onChange={(e) => { setFoodType(e.target.value); clearError("foodType"); }}
                disabled={!category}
                className={`w-full px-3 py-2.5 rounded-xl border bg-white text-[13px] transition-all ${
                  !category ? "text-gray-300 cursor-not-allowed" : "text-gray-800"
                } ${
                  errors.foodType
                    ? "border-red-300 focus:ring-2 focus:ring-red-500/20 focus:border-red-400"
                    : "border-gray-200 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
                }`}
              >
                <option value="">
                  {category ? "Select type..." : "Select category first"}
                </option>
                {availableFoodTypes.map((type) => (
                  <option key={type} value={type}>{getFoodTypeName(type)}</option>
                ))}
              </select>
              {errors.foodType && (
                <p className="text-[11px] text-red-500 mt-1">{errors.foodType}</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Section 4: Extras ─────────────────────────────────────────────── */}
        {foodType && availableExtras.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-7 h-7 bg-orange-50 rounded-lg flex items-center justify-center">
                <ListChecks className="w-3.5 h-3.5 text-orange-600" />
              </div>
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-semibold text-gray-900">Extras</h2>
                <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                  Optional
                </span>
                {Object.keys(selectedExtras).length > 0 && (
                  <span className="text-[10px] font-semibold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full">
                    {Object.keys(selectedExtras).length} selected
                  </span>
                )}
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mb-3">
              Select extras and set their additional price
            </p>
            <div className="grid grid-cols-2 gap-2">
              {availableExtras.map((extra) => {
                const isSelected = extra in selectedExtras;
                return (
                  <div key={extra} className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleExtraToggle(extra)}
                      className={`px-3 py-2 rounded-xl text-[12px] font-medium border transition-all text-left ${
                        isSelected
                          ? "bg-orange-50 border-orange-300 text-orange-700"
                          : "bg-white border-gray-200 text-gray-600 hover:border-orange-200 hover:bg-orange-50/30"
                      }`}
                    >
                      <span className="mr-1.5">{isSelected ? "✓" : "+"}</span>
                      {getExtraName(extra)}
                    </button>
                    {isSelected && (
                      <div className="relative">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          value={selectedExtras[extra] || ""}
                          onChange={(e) => handleExtraPriceChange(extra, e.target.value)}
                          placeholder="0.00"
                          className="w-full pl-2.5 pr-8 py-1.5 rounded-lg border border-orange-200 bg-orange-50/30 text-[11px] text-gray-800 focus:ring-1 focus:ring-orange-500/20 focus:border-orange-400 transition-all placeholder:text-gray-300"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-medium text-gray-400">
                          TL
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Section 5: Preparation Time ───────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-7 h-7 bg-gray-50 rounded-lg flex items-center justify-center">
              <Clock className="w-3.5 h-3.5 text-gray-500" />
            </div>
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-semibold text-gray-900">Preparation Time</h2>
              <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                Optional
              </span>
            </div>
          </div>
          <div className="relative">
            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
            <input
              type="number"
              inputMode="numeric"
              min="1"
              value={preparationTime}
              onChange={(e) => setPrepTime(e.target.value)}
              placeholder="e.g. 15"
              className="w-full pl-9 pr-16 py-2.5 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-800 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all placeholder:text-gray-300"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-medium text-gray-400">
              min
            </span>
          </div>
        </div>

        {/* ── Submit ─────────────────────────────────────────────────────────── */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[14px] font-semibold rounded-xl transition-colors"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {isEditMode ? "Updating..." : "Saving..."}
            </>
          ) : (
            <>
              <UtensilsCrossed className="w-4 h-4" />
              {isEditMode ? "Update Food" : "List Food"}
            </>
          )}
        </button>

        <div className="h-4" />
      </div>
    </div>
  );
}

// ─── Export with Suspense ─────────────────────────────────────────────────────

export default function AdminRestaurantListFoodPage() {
  return (
    <ProtectedRoute>
      <Suspense
        fallback={
          <div className="min-h-screen bg-gray-50/50 flex items-center justify-center">
            <div className="flex items-center gap-3 text-gray-600">
              <Loader2 className="w-5 h-5 animate-spin text-orange-600" />
              <span className="text-[13px]">Loading...</span>
            </div>
          </div>
        }
      >
        <AdminFoodFormContent />
      </Suspense>
    </ProtectedRoute>
  );
}