"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  ArrowLeft,
  Store,
  Mail,
  Phone,
  MapPin,
  X,
  Camera,
  FileText,
  ChevronDown,
  Upload,
  CheckCircle,
  AlertCircle,
  UtensilsCrossed,
  Clock,
  CalendarDays,
  Globe,
  Plus,
  Trash2,
  DollarSign,
  User,
  Loader2,
} from "lucide-react";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
} from "firebase/storage";
import { db, storage, auth, functions } from "@/app/lib/firebase";
import { httpsCallable } from "firebase/functions";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { mainRegions, regionHierarchy } from "@/constants/regions";
import { FoodCategoryData } from "@/constants/foodData";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

// ─── Types ────────────────────────────────────────────────────────────────────

interface MinOrderRegion {
  mainRegion: string;
  subregion: string;
  minOrderPrice: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_DAYS = [
  "Monday", "Tuesday", "Wednesday", "Thursday",
  "Friday", "Saturday", "Sunday",
] as const;

const DAY_LABELS: Record<string, string> = {
  Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu",
  Friday: "Fri", Saturday: "Sat", Sunday: "Sun",
};

const CUISINE_OPTIONS = [
  "Turkish Cuisine", "Japanese Cuisine", "Chinese Cuisine",
  "Persian Cuisine", "Arabic Cuisine", "Italian Cuisine",
  "Korean Cuisine", "Vietnamese Cuisine", "Vegan / Vegetarian",
] as const;

// ─── Image upload helper ──────────────────────────────────────────────────────

async function uploadToStorage(file: File, path: string): Promise<string> {
  const ref = storageRef(storage, path);
  const task = uploadBytesResumable(ref, file, { contentType: file.type });
  return new Promise<string>((resolve, reject) => {
    task.on("state_changed", null, reject, async () => {
      try {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve(url);
      } catch (err) {
        reject(err);
      }
    });
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function AdminCreateRestaurantContent() {
  const router = useRouter();
  const { user: authUser } = useAuth();

  // ── Basic info ────────────────────────────────────────────────────────────
  const [name, setName]           = useState("");
  const [email, setEmail]         = useState("");
  const [contactNo, setContactNo] = useState("");
  const [address, setAddress]     = useState("");

  // ── Owner assignment ──────────────────────────────────────────────────────
  const [ownerEmail, setOwnerEmail]           = useState("");
  const [ownerLookupStatus, setOwnerLookupStatus] =
    useState<"idle" | "searching" | "found" | "not_found">("idle");
  const [resolvedOwner, setResolvedOwner] = useState<{
    uid: string;
    displayName: string;
    email: string;
  } | null>(null);

  // ── Location ──────────────────────────────────────────────────────────────
  const [coordinates, setCoordinates] = useState<{
    latitude: number | null;
    longitude: number | null;
  }>({ latitude: null, longitude: null });
  const [showMapModal, setShowMapModal] = useState(false);

  // ── Food type ─────────────────────────────────────────────────────────────
  const [foodType, setFoodType]           = useState<string[]>([]);
  const [showFoodTypeModal, setShowFoodTypeModal] = useState(false);

  // ── Cuisine ───────────────────────────────────────────────────────────────
  const [cuisineTypes, setCuisineTypes] = useState<string[]>([]);

  // ── Min order prices ──────────────────────────────────────────────────────
  const [minOrderPrices, setMinOrderPrices]     = useState<MinOrderRegion[]>([]);
  const [selectedMainRegion, setSelectedMainRegion] = useState("");
  const [selectedSubregion, setSelectedSubregion]   = useState("");
  const [minPriceInput, setMinPriceInput]           = useState("");

  const availableSubregions = selectedMainRegion
    ? (regionHierarchy[selectedMainRegion] ?? [])
    : [];
  const isSubregionAlreadyAdded = (sub: string) =>
    minOrderPrices.some((e) => e.subregion === sub);

  const addMinOrderPrice = () => {
    if (!selectedMainRegion || !selectedSubregion || !minPriceInput) return;
    const price = parseFloat(minPriceInput);
    if (isNaN(price) || price <= 0) return;
    if (isSubregionAlreadyAdded(selectedSubregion)) return;
    setMinOrderPrices((prev) => [
      ...prev,
      { mainRegion: selectedMainRegion, subregion: selectedSubregion, minOrderPrice: price },
    ]);
    setSelectedSubregion("");
    setMinPriceInput("");
  };

  // ── Working schedule ──────────────────────────────────────────────────────
  const [workingDays, setWorkingDays]           = useState<string[]>([]);
  const [workingHoursOpen, setWorkingHoursOpen]   = useState("09:00");
  const [workingHoursClose, setWorkingHoursClose] = useState("22:00");

  const toggleDay = (day: string) =>
    setWorkingDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );

  // ── Images ────────────────────────────────────────────────────────────────
  const profileImageRef   = useRef<HTMLInputElement>(null);
  const taxCertRef        = useRef<HTMLInputElement>(null);
  const [profileFile, setProfileFile]         = useState<File | null>(null);
  const [profilePreview, setProfilePreview]   = useState("");
  const [taxFile, setTaxFile]                 = useState<File | null>(null);
  const [taxPreview, setTaxPreview]           = useState("");

  const handleFileSelect = (file: File | null, type: "profile" | "tax") => {
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) { toast.error("File too large (max 30MB)"); return; }
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    if (!allowed.includes(file.type)) { toast.error("Invalid file type"); return; }
    const reader = new FileReader();
    reader.onloadend = () => {
      if (type === "profile") { setProfileFile(file); setProfilePreview(reader.result as string); }
      else                    { setTaxFile(file);     setTaxPreview(reader.result as string); }
    };
    reader.readAsDataURL(file);
  };

  // ── UI state ──────────────────────────────────────────────────────────────
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  // ── Google Maps ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showMapModal) return;

    const initMap = () => {
      const el = document.getElementById("admin-restaurant-map");
      if (!el) return;

      const defaultLoc = {
        lat: coordinates.latitude  ?? 35.1264,
        lng: coordinates.longitude ?? 33.9293,
      };

      const map = new google.maps.Map(el, {
        center: defaultLoc, zoom: 15, gestureHandling: "greedy",
      });

      el.addEventListener("wheel", (e) => e.stopPropagation(), { passive: false });

      const marker = new google.maps.Marker({
        position: defaultLoc, map, draggable: true, title: "Restaurant location",
      });

      marker.addListener("dragend", () => {
        const pos = marker.getPosition();
        if (pos) setCoordinates({ latitude: pos.lat(), longitude: pos.lng() });
      });

      map.addListener("click", (e: google.maps.MapMouseEvent) => {
        if (e.latLng) {
          marker.setPosition(e.latLng);
          setCoordinates({ latitude: e.latLng.lat(), longitude: e.latLng.lng() });
        }
      });
    };

    if (window.google?.maps?.Map) { requestAnimationFrame(initMap); return; }

    const existing = document.querySelector('script[src*="maps.googleapis.com"]');
    (window as unknown as Record<string, () => void>).__gmapsAdminCb = () =>
      requestAnimationFrame(initMap);

    if (existing) return;

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&loading=async&callback=__gmapsAdminCb`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, [showMapModal]);

  // ── Owner lookup ──────────────────────────────────────────────────────────
  const lookupOwner = useCallback(async () => {
    if (!ownerEmail.trim()) return;
    setOwnerLookupStatus("searching");
    setResolvedOwner(null);

    try {
      const q = query(
        collection(db, "users"),
        where("email", "==", ownerEmail.trim().toLowerCase()),
        limit(1)
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setOwnerLookupStatus("not_found");
      } else {
        const d = snap.docs[0];
        const data = d.data();
        setResolvedOwner({
          uid:         d.id,
          displayName: data.displayName ?? "",
          email:       data.email ?? ownerEmail.trim().toLowerCase(),
        });
        setOwnerLookupStatus("found");
      }
    } catch {
      setOwnerLookupStatus("not_found");
      toast.error("Failed to look up user");
    }
  }, [ownerEmail]);

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    if (!name.trim())    { setError("Restaurant name is required"); return false; }
    if (!contactNo.trim()) { setError("Contact number is required"); return false; }
    if (!address.trim()) { setError("Address is required"); return false; }
    if (coordinates.latitude === null || coordinates.longitude === null) {
      setError("Location pin is required"); return false;
    }
    if (foodType.length === 0) { setError("At least one food type is required"); return false; }
    if (cuisineTypes.length === 0) { setError("At least one cuisine type is required"); return false; }
    if (workingDays.length === 0) { setError("At least one working day is required"); return false; }
    if (minOrderPrices.length === 0) { setError("At least one minimum order price is required"); return false; }
    if (!profileFile)    { setError("Profile image is required"); return false; }
    return true;
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setError("");
    if (!validate()) return;

    setSaving(true);
    try {
      // Pre-generate restaurant ID so we can use it in storage paths
      const restaurantRef = doc(collection(db, "restaurants"));
      const restaurantId  = restaurantRef.id;

      // Upload profile image
      const profileUrl = await uploadToStorage(
        profileFile!,
        `restaurants/${restaurantId}/profile_image_${Date.now()}.jpg`
      );

      // Upload tax cert (optional)
      let taxUrl = "";
      if (taxFile) {
        taxUrl = await uploadToStorage(
          taxFile,
          `restaurants/${restaurantId}/tax_plate_certificate_${Date.now()}.jpg`
        );
      }

      const ownerId = resolvedOwner?.uid ?? "";

      // ── Create restaurant document (matches approval flow exactly) ────────
      await setDoc(restaurantRef, {
        ownerId,
        businessType:           "restaurant",
        name:                   name.trim(),
        email:                  email.trim(),
        contactNo:              contactNo.trim(),
        address:                address.trim(),
        foodType,
        cuisineTypes,
        workingDays,
        workingHours:           { open: workingHoursOpen, close: workingHoursClose },
        minOrderPrices,
        profileImageUrl:        profileUrl,
        taxPlateCertificateUrl: taxUrl,
        latitude:               coordinates.latitude!,
        longitude:              coordinates.longitude!,
        createdAt:              serverTimestamp(),
        isBoosted:              false,
        isActive:               true,
        averageRating:          0.0,
        reviewCount:            0,
        clickCount:             0,
        followerCount:          0,
      });

      // ── Assign owner if found ─────────────────────────────────────────────
      if (resolvedOwner) {
        await updateDoc(doc(db, "users", resolvedOwner.uid), {
          [`memberOfRestaurants.${restaurantId}`]: "owner",
          verified: true,
        });

        // Sync claims
        const idToken = await auth.currentUser!.getIdToken();
        await fetch("/api/sync-claims", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ uid: resolvedOwner.uid }),
        });

        // Approval notification
        try {
          const notifRef = doc(collection(db, "users", resolvedOwner.uid, "notifications"));
          await setDoc(notifRef, {
            type:        "restaurant_approved",
            shopId:      restaurantId,
            timestamp:   serverTimestamp(),
            isRead:      false,
            message:     "Your restaurant has been created.",
            message_en:  "Tap to visit your restaurant.",
            message_tr:  "Restoranınızı ziyaret etmek için dokunun.",
            message_ru:  "Нажмите, чтобы посетить свой ресторан.",
          });
        } catch { /* non-fatal */ }

        // Welcome email
        try {
          const shopWelcomeEmail = httpsCallable(functions, "shopWelcomeEmail");
          await shopWelcomeEmail({ shopId: restaurantId, email: resolvedOwner.email });
        } catch { /* non-fatal */ }
      }

      toast.success("Restaurant created successfully!");
      router.push(`/restaurantdetails?restaurantId=${restaurantId}`);
    } catch (err) {
      console.error("Failed to create restaurant:", err);
      setError("Failed to create restaurant. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const getCategoryName = (key: string): string => {
    const tKey = FoodCategoryData.kCategoryTranslationKeys[key];
    return tKey ?? key;
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50/50">

      {/* Header */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
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
            <h1 className="text-[15px] font-semibold text-gray-900">Create Restaurant</h1>
            <p className="text-[11px] text-gray-400">Admin — direct creation</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-4 pb-16">

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-[13px] text-red-600">{error}</p>
          </div>
        )}

        {/* ── Section 1: Basic Info ─────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-7 h-7 bg-orange-50 rounded-lg flex items-center justify-center">
              <Store className="w-3.5 h-3.5 text-orange-600" />
            </div>
            <h3 className="text-[15px] font-semibold text-gray-900">Basic Information</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Name */}
            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Restaurant Name *
              </label>
              <div className="relative">
                <UtensilsCrossed className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Istanbul Kitchen"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Business Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="restaurant@example.com"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all"
                />
              </div>
            </div>

            {/* Contact */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Contact Number *
              </label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="tel"
                  value={contactNo}
                  onChange={(e) => setContactNo(e.target.value)}
                  placeholder="05XX XXX XX XX"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all"
                />
              </div>
            </div>

            {/* Address */}
            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Address *
              </label>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-400" />
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={3}
                  placeholder="Full address..."
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all resize-none"
                />
              </div>
            </div>

            {/* Location pin */}
            <div className="md:col-span-2">
              <button
                type="button"
                onClick={() => setShowMapModal(true)}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed font-medium text-[13px] transition-all ${
                  coordinates.latitude && coordinates.longitude
                    ? "border-emerald-200 bg-emerald-50/50 text-emerald-600"
                    : "border-orange-200 bg-orange-50/50 text-orange-600 hover:bg-orange-50"
                }`}
              >
                <MapPin className="w-4 h-4" />
                <span>
                  {coordinates.latitude && coordinates.longitude
                    ? "Location pinned ✓"
                    : "Pin restaurant location *"}
                </span>
              </button>
              {coordinates.latitude && coordinates.longitude && (
                <p className="text-[11px] text-gray-400 mt-1.5 text-center">
                  {coordinates.latitude.toFixed(6)}, {coordinates.longitude.toFixed(6)}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Section 2: Owner Assignment ───────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-7 h-7 bg-indigo-50 rounded-lg flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-gray-900">Owner Assignment</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Optional — you can invite an owner later from the restaurant details page
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={ownerEmail}
                onChange={(e) => {
                  setOwnerEmail(e.target.value);
                  setOwnerLookupStatus("idle");
                  setResolvedOwner(null);
                }}
                onKeyDown={(e) => { if (e.key === "Enter") lookupOwner(); }}
                placeholder="Owner's account email..."
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
              />
            </div>
            <button
              type="button"
              onClick={lookupOwner}
              disabled={!ownerEmail.trim() || ownerLookupStatus === "searching"}
              className="px-4 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-[13px] font-medium transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {ownerLookupStatus === "searching" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Find"
              )}
            </button>
          </div>

          {/* Lookup result */}
          {ownerLookupStatus === "found" && resolvedOwner && (
            <div className="mt-3 flex items-center gap-3 px-3.5 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-gray-900 truncate">
                  {resolvedOwner.displayName || "—"}
                </p>
                <p className="text-[11px] text-gray-500 truncate">{resolvedOwner.email}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setResolvedOwner(null);
                  setOwnerEmail("");
                  setOwnerLookupStatus("idle");
                }}
                className="w-7 h-7 flex items-center justify-center hover:bg-emerald-100 rounded-lg transition-colors"
              >
                <X className="w-3.5 h-3.5 text-emerald-600" />
              </button>
            </div>
          )}

          {ownerLookupStatus === "not_found" && (
            <div className="mt-3 flex items-center gap-2.5 px-3.5 py-3 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-[12px] text-red-600">No account found with that email address.</p>
            </div>
          )}
        </div>

        {/* ── Section 3: Food Type ──────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-7 h-7 bg-violet-50 rounded-lg flex items-center justify-center">
              <UtensilsCrossed className="w-3.5 h-3.5 text-violet-600" />
            </div>
            <h3 className="text-[15px] font-semibold text-gray-900">Food Types *</h3>
          </div>

          <button
            type="button"
            onClick={() => setShowFoodTypeModal(true)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 bg-white text-[13px] hover:border-gray-300 transition-all"
          >
            <span className={foodType.length > 0 ? "text-gray-900 font-medium" : "text-gray-400"}>
              {foodType.length > 0
                ? `${foodType.length} food type${foodType.length > 1 ? "s" : ""} selected`
                : "Select food types..."}
            </span>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </button>

          {foodType.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {foodType.map((ft) => (
                <span
                  key={ft}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-violet-50 text-violet-700 rounded-lg text-[11px] font-medium"
                >
                  {getCategoryName(ft)}
                  <button onClick={() => setFoodType((p) => p.filter((x) => x !== ft))}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Food Type Modal */}
        {showFoodTypeModal && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h3 className="text-[15px] font-semibold text-gray-900">Select Food Types</h3>
                <button
                  type="button"
                  onClick={() => setShowFoodTypeModal(false)}
                  className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                {FoodCategoryData.kCategories.map((cat) => (
                  <label
                    key={cat.key}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer rounded-lg transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={foodType.includes(cat.key)}
                      onChange={() =>
                        setFoodType((p) =>
                          p.includes(cat.key) ? p.filter((x) => x !== cat.key) : [...p, cat.key]
                        )
                      }
                      className="h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                    />
                    <span className="text-[13px] text-gray-700">{getCategoryName(cat.key)}</span>
                  </label>
                ))}
              </div>
              <div className="px-5 py-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowFoodTypeModal(false)}
                  className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-xl text-[13px] font-medium transition-colors"
                >
                  Confirm ({foodType.length} selected)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Section 4: Cuisine Types ──────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-7 h-7 bg-indigo-50 rounded-lg flex items-center justify-center">
              <Globe className="w-3.5 h-3.5 text-indigo-600" />
            </div>
            <h3 className="text-[15px] font-semibold text-gray-900">Cuisine Types *</h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CUISINE_OPTIONS.map((cuisine) => {
              const isSelected = cuisineTypes.includes(cuisine);
              return (
                <button
                  key={cuisine}
                  type="button"
                  onClick={() =>
                    setCuisineTypes((p) =>
                      p.includes(cuisine) ? p.filter((c) => c !== cuisine) : [...p, cuisine]
                    )
                  }
                  className={`px-3 py-2.5 rounded-xl text-[12px] font-semibold border-2 transition-all ${
                    isSelected
                      ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                      : "bg-white border-gray-200 text-gray-500 hover:border-indigo-200 hover:bg-indigo-50/30"
                  }`}
                >
                  {cuisine}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Section 5: Min Order Prices ───────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-7 h-7 bg-emerald-50 rounded-lg flex items-center justify-center">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-gray-900">
                Minimum Order Prices by Region *
              </h3>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Set a minimum order price for each delivery region
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            {/* Main Region */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Main Region
              </label>
              <select
                value={selectedMainRegion}
                onChange={(e) => { setSelectedMainRegion(e.target.value); setSelectedSubregion(""); }}
                className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all"
              >
                <option value="">Select region...</option>
                {mainRegions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            {/* Subregion */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Subregion
              </label>
              <select
                value={selectedSubregion}
                onChange={(e) => setSelectedSubregion(e.target.value)}
                disabled={!selectedMainRegion}
                className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                <option value="">Select subregion...</option>
                {availableSubregions.map((s) => (
                  <option key={s} value={s} disabled={isSubregionAlreadyAdded(s)}>
                    {s}{isSubregionAlreadyAdded(s) ? " (added)" : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Price */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Min Price (TL)
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={minPriceInput}
                  onChange={(e) => setMinPriceInput(e.target.value)}
                  disabled={!selectedSubregion}
                  placeholder="0.00"
                  className="flex-1 px-3 py-3 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={addMinOrderPrice}
                  disabled={!selectedMainRegion || !selectedSubregion || !minPriceInput || isSubregionAlreadyAdded(selectedSubregion)}
                  className="px-3 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {minOrderPrices.length > 0 && (
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {minOrderPrices.map((entry, i) => (
                <div
                  key={`${entry.mainRegion}-${entry.subregion}`}
                  className="flex items-center justify-between px-3.5 py-2.5 bg-emerald-50/50 border border-emerald-100 rounded-xl"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-medium text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                      {entry.mainRegion}
                    </span>
                    <span className="text-[13px] text-gray-700 font-medium truncate">
                      {entry.subregion}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 flex-shrink-0 ml-2">
                    <span className="text-[13px] font-semibold text-gray-900">
                      {entry.minOrderPrice.toFixed(2)} TL
                    </span>
                    <button
                      type="button"
                      onClick={() => setMinOrderPrices((p) => p.filter((_, idx) => idx !== i))}
                      className="w-7 h-7 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Section 6: Working Schedule ───────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-7 h-7 bg-orange-50 rounded-lg flex items-center justify-center">
              <CalendarDays className="w-3.5 h-3.5 text-orange-600" />
            </div>
            <h3 className="text-[15px] font-semibold text-gray-900">Working Schedule *</h3>
          </div>

          {/* Days */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2.5">
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Working Days
              </label>
              <button
                type="button"
                onClick={() =>
                  setWorkingDays((p) =>
                    p.length === ALL_DAYS.length ? [] : [...ALL_DAYS]
                  )
                }
                className="text-[11px] font-medium text-indigo-500 hover:text-indigo-600 transition-colors"
              >
                {workingDays.length === ALL_DAYS.length ? "Deselect all" : "Select all"}
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {ALL_DAYS.map((day) => {
                const sel = workingDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`py-2 rounded-xl text-[11px] font-semibold border-2 transition-all ${
                      sel
                        ? "bg-orange-50 border-orange-300 text-orange-700"
                        : "bg-white border-gray-200 text-gray-500 hover:border-orange-200 hover:bg-orange-50/30"
                    }`}
                  >
                    {DAY_LABELS[day]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Hours */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">
              Working Hours
            </label>
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="time"
                  value={workingHoursOpen}
                  onChange={(e) => setWorkingHoursOpen(e.target.value)}
                  className="w-full pl-10 pr-3 py-3 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
                />
                <span className="block text-[10px] text-gray-400 mt-1 text-center">Open</span>
              </div>
              <span className="text-gray-300 font-medium text-[14px] mt-[-16px]">–</span>
              <div className="flex-1 relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="time"
                  value={workingHoursClose}
                  onChange={(e) => setWorkingHoursClose(e.target.value)}
                  className="w-full pl-10 pr-3 py-3 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
                />
                <span className="block text-[10px] text-gray-400 mt-1 text-center">Close</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Section 7: Images ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-7 h-7 bg-emerald-50 rounded-lg flex items-center justify-center">
              <Camera className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <h3 className="text-[15px] font-semibold text-gray-900">Images</h3>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Profile Image */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Profile Photo *
              </label>
              <input
                ref={profileImageRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null, "profile")}
                className="hidden"
              />
              {profilePreview ? (
                <div className="relative group">
                  <img
                    src={profilePreview}
                    alt="Profile"
                    className="w-full h-36 object-cover rounded-xl border border-gray-200"
                  />
                  <button
                    type="button"
                    onClick={() => { setProfileFile(null); setProfilePreview(""); }}
                    className="absolute -top-2 -right-2 w-7 h-7 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors shadow-md"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => profileImageRef.current?.click()}
                  className="w-full h-36 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center hover:border-orange-300 hover:bg-orange-50/30 transition-all group"
                >
                  <Camera className="w-8 h-8 text-gray-300 group-hover:text-orange-400 mb-1.5 transition-colors" />
                  <span className="text-[12px] font-medium text-gray-400 group-hover:text-orange-500">
                    Upload profile photo
                  </span>
                </button>
              )}
            </div>

            {/* Tax Certificate */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Tax Certificate
                <span className="ml-1.5 text-gray-300 normal-case font-normal">(optional)</span>
              </label>
              <input
                ref={taxCertRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null, "tax")}
                className="hidden"
              />
              {taxPreview ? (
                <div className="relative group">
                  <img
                    src={taxPreview}
                    alt="Tax certificate"
                    className="w-full h-36 object-cover rounded-xl border border-gray-200"
                  />
                  <button
                    type="button"
                    onClick={() => { setTaxFile(null); setTaxPreview(""); }}
                    className="absolute -top-2 -right-2 w-7 h-7 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors shadow-md"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => taxCertRef.current?.click()}
                  className="w-full h-36 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center hover:border-orange-300 hover:bg-orange-50/30 transition-all group"
                >
                  <FileText className="w-8 h-8 text-gray-300 group-hover:text-orange-400 mb-1.5 transition-colors" />
                  <span className="text-[12px] font-medium text-gray-400 group-hover:text-orange-500">
                    Upload tax certificate
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Submit ─────────────────────────────────────────────────────────── */}
        <div className="flex justify-end pb-4">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 px-8 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-[14px] font-semibold transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating restaurant...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Create Restaurant
              </>
            )}
          </button>
        </div>

      </div>

      {/* ── Map Modal ─────────────────────────────────────────────────────────── */}
      {showMapModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 bg-orange-50 rounded-lg flex items-center justify-center">
                  <MapPin className="w-3.5 h-3.5 text-orange-600" />
                </div>
                <h3 className="text-[15px] font-semibold text-gray-900">Pin Restaurant Location</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowMapModal(false)}
                className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 p-4">
              <div
                id="admin-restaurant-map"
                className="w-full h-[500px] rounded-xl border border-gray-200"
              />
              <p className="text-[12px] text-gray-400 mt-3 text-center">
                Click on the map or drag the marker to set the location
              </p>
              {coordinates.latitude && coordinates.longitude && (
                <p className="text-[12px] font-semibold text-orange-600 mt-1 text-center">
                  {coordinates.latitude.toFixed(6)}, {coordinates.longitude.toFixed(6)}
                </p>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button
                type="button"
                onClick={() => setShowMapModal(false)}
                className="flex-1 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-[13px] font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setShowMapModal(false)}
                disabled={!coordinates.latitude || !coordinates.longitude}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-xl text-[13px] font-medium transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                Confirm Location
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default function AdminCreateRestaurantPage() {
  return (
    <ProtectedRoute>
      <AdminCreateRestaurantContent />
    </ProtectedRoute>
  );
}