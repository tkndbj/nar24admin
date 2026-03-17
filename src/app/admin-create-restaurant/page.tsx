"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Image from "next/image";
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
  ExternalLink,
  ChevronRight,
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
  orderBy,
  startAfter,
  serverTimestamp,
  QueryDocumentSnapshot,
  DocumentData,
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
import { mainRegions, regionHierarchy } from "@/constants/regions";
import { FoodCategoryData } from "@/constants/foodData";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const PAGE_SIZE = 20;

// ─── Types ────────────────────────────────────────────────────────────────────

interface MinOrderRegion {
  mainRegion: string;
  subregion: string;
  minOrderPrice: number;
}

interface RestaurantListItem {
  id: string;
  name: string;
  address?: string;
  contactNo?: string;
  isActive?: boolean;
  profileImageUrl?: string;
  cuisineTypes?: string[];
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
      try { resolve(await getDownloadURL(task.snapshot.ref)); }
      catch (err) { reject(err); }
    });
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function AdminCreateRestaurantContent() {
  const router = useRouter();

  // ── Basic info ────────────────────────────────────────────────────────────
  const [name, setName]           = useState("");
  const [email, setEmail]         = useState("");
  const [contactNo, setContactNo] = useState("");
  const [address, setAddress]     = useState("");

  // ── Owner assignment ──────────────────────────────────────────────────────
  const [ownerEmail, setOwnerEmail]               = useState("");
  const [ownerLookupStatus, setOwnerLookupStatus] =
    useState<"idle" | "searching" | "found" | "not_found">("idle");
  const [resolvedOwner, setResolvedOwner] = useState<{
    uid: string; displayName: string; email: string;
  } | null>(null);

  // ── Location ──────────────────────────────────────────────────────────────
  const [coordinates, setCoordinates] = useState<{
    latitude: number | null; longitude: number | null;
  }>({ latitude: null, longitude: null });
  const [showMapModal, setShowMapModal] = useState(false);

  // ── Food type ─────────────────────────────────────────────────────────────
  const [foodType, setFoodType]                   = useState<string[]>([]);
  const [showFoodTypeModal, setShowFoodTypeModal] = useState(false);

  // ── Cuisine ───────────────────────────────────────────────────────────────
  const [cuisineTypes, setCuisineTypes] = useState<string[]>([]);

  // ── Min order prices ──────────────────────────────────────────────────────
  const [minOrderPrices, setMinOrderPrices]         = useState<MinOrderRegion[]>([]);
  const [selectedMainRegion, setSelectedMainRegion] = useState("");
  const [selectedSubregion, setSelectedSubregion]   = useState("");
  const [minPriceInput, setMinPriceInput]           = useState("");

  const availableSubregions = selectedMainRegion ? (regionHierarchy[selectedMainRegion] ?? []) : [];
  const isSubregionAlreadyAdded = (sub: string) => minOrderPrices.some((e) => e.subregion === sub);

  const addMinOrderPrice = () => {
    if (!selectedMainRegion || !selectedSubregion || !minPriceInput) return;
    const price = parseFloat(minPriceInput);
    if (isNaN(price) || price <= 0 || isSubregionAlreadyAdded(selectedSubregion)) return;
    setMinOrderPrices((prev) => [...prev, { mainRegion: selectedMainRegion, subregion: selectedSubregion, minOrderPrice: price }]);
    setSelectedSubregion(""); setMinPriceInput("");
  };

  // ── Working schedule ──────────────────────────────────────────────────────
  const [workingDays, setWorkingDays]             = useState<string[]>([]);
  const [workingHoursOpen, setWorkingHoursOpen]   = useState("09:00");
  const [workingHoursClose, setWorkingHoursClose] = useState("22:00");

  const toggleDay = (day: string) =>
    setWorkingDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);

  // ── Images ────────────────────────────────────────────────────────────────
  const profileImageRef = useRef<HTMLInputElement>(null);
  const taxCertRef      = useRef<HTMLInputElement>(null);
  const [profileFile, setProfileFile]       = useState<File | null>(null);
  const [profilePreview, setProfilePreview] = useState("");
  const [taxFile, setTaxFile]               = useState<File | null>(null);
  const [taxPreview, setTaxPreview]         = useState("");

  const handleFileSelect = (file: File | null, type: "profile" | "tax") => {
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) { toast.error("Dosya çok büyük (max 30MB)"); return; }
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    if (!allowed.includes(file.type)) { toast.error("Geçersiz dosya türü"); return; }
    const reader = new FileReader();
    reader.onloadend = () => {
      if (type === "profile") { setProfileFile(file); setProfilePreview(reader.result as string); }
      else                    { setTaxFile(file);     setTaxPreview(reader.result as string); }
    };
    reader.readAsDataURL(file);
  };

  // ── Form UI state ─────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  // ── Restaurant list state ─────────────────────────────────────────────────
  const [restaurants, setRestaurants] = useState<RestaurantListItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]         = useState(true);
  const lastDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);

  const fetchRestaurants = useCallback(async (after?: QueryDocumentSnapshot<DocumentData>) => {
    try {
      const constraints = after
        ? [orderBy("createdAt", "desc"), startAfter(after), limit(PAGE_SIZE)]
        : [orderBy("createdAt", "desc"), limit(PAGE_SIZE)];

      const snap = await getDocs(query(collection(db, "restaurants"), ...constraints));

      const items: RestaurantListItem[] = snap.docs.map((d) => ({
        id:              d.id,
        name:            d.data().name ?? "Unnamed",
        address:         d.data().address,
        contactNo:       d.data().contactNo,
        isActive:        d.data().isActive,
        profileImageUrl: d.data().profileImageUrl,
        cuisineTypes:    d.data().cuisineTypes ?? [],
      }));

      if (after) setRestaurants((prev) => [...prev, ...items]);
      else        setRestaurants(items);

      lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (err) {
      console.error("Failed to fetch restaurants:", err);
      toast.error("Restoranlar yüklenemedi");
    }
  }, []);

  useEffect(() => {
    fetchRestaurants().finally(() => setLoadingList(false));
  }, [fetchRestaurants]);

  const handleLoadMore = async () => {
    if (!lastDocRef.current || loadingMore) return;
    setLoadingMore(true);
    await fetchRestaurants(lastDocRef.current);
    setLoadingMore(false);
  };

  const [togglingId, setTogglingId] = useState<string | null>(null);

  const toggleActive = async (restaurant: RestaurantListItem) => {
    const newVal = restaurant.isActive === false ? true : false;
    setTogglingId(restaurant.id);
    try {
      await updateDoc(doc(db, "restaurants", restaurant.id), { isActive: newVal });
      setRestaurants((prev) =>
        prev.map((r) => r.id === restaurant.id ? { ...r, isActive: newVal } : r)
      );
      toast.success(newVal ? "Restoran aktif edildi" : "Restoran pasif edildi");
    } catch (err) {
      console.error("Failed to toggle active:", err);
      toast.error("Durum değiştirilemedi");
    } finally {
      setTogglingId(null);
    }
  };

  // ── Google Maps ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showMapModal) return;
    const initMap = () => {
      const el = document.getElementById("admin-restaurant-map");
      if (!el) return;
      const defaultLoc = { lat: coordinates.latitude ?? 35.1264, lng: coordinates.longitude ?? 33.9293 };
      const map = new google.maps.Map(el, { center: defaultLoc, zoom: 15, gestureHandling: "greedy" });
      el.addEventListener("wheel", (e) => e.stopPropagation(), { passive: false });
      const marker = new google.maps.Marker({ position: defaultLoc, map, draggable: true });
      marker.addListener("dragend", () => {
        const pos = marker.getPosition();
        if (pos) setCoordinates({ latitude: pos.lat(), longitude: pos.lng() });
      });
      map.addListener("click", (e: google.maps.MapMouseEvent) => {
        if (e.latLng) { marker.setPosition(e.latLng); setCoordinates({ latitude: e.latLng.lat(), longitude: e.latLng.lng() }); }
      });
    };
    if (window.google?.maps?.Map) { requestAnimationFrame(initMap); return; }
    const existing = document.querySelector('script[src*="maps.googleapis.com"]');
    (window as unknown as Record<string, () => void>).__gmapsAdminCb = () => requestAnimationFrame(initMap);
    if (existing) return;
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&loading=async&callback=__gmapsAdminCb`;
    script.async = true; script.defer = true;
    document.head.appendChild(script);
  }, [showMapModal]);

  // ── Owner lookup ──────────────────────────────────────────────────────────
  const lookupOwner = useCallback(async () => {
    if (!ownerEmail.trim()) return;
    setOwnerLookupStatus("searching"); setResolvedOwner(null);
    try {
      const snap = await getDocs(
        query(collection(db, "users"), where("email", "==", ownerEmail.trim().toLowerCase()), limit(1))
      );
      if (snap.empty) {
        setOwnerLookupStatus("not_found");
      } else {
        const d = snap.docs[0]; const data = d.data();
        setResolvedOwner({ uid: d.id, displayName: data.displayName ?? "", email: data.email ?? ownerEmail.trim().toLowerCase() });
        setOwnerLookupStatus("found");
      }
    } catch {
      setOwnerLookupStatus("not_found");
      toast.error("Kullanıcı araması başarısız");
    }
  }, [ownerEmail]);

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    if (!name.trim())       { setError("Restoran adı zorunludur"); return false; }
    if (!contactNo.trim())  { setError("Telefon numarası zorunludur"); return false; }
    if (!address.trim())    { setError("Adres zorunludur"); return false; }
    if (!coordinates.latitude || !coordinates.longitude) { setError("Konum sabitleme zorunludur"); return false; }
    if (foodType.length === 0)       { setError("En az bir yemek türü seçiniz"); return false; }
    if (cuisineTypes.length === 0)   { setError("En az bir mutfak türü seçiniz"); return false; }
    if (workingDays.length === 0)    { setError("En az bir çalışma günü seçiniz"); return false; }
    if (minOrderPrices.length === 0) { setError("En az bir minimum sipariş fiyatı ekleyiniz"); return false; }
    if (!profileFile)                { setError("Profil fotoğrafı zorunludur"); return false; }
    return true;
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setError("");
    if (!validate()) return;
    setSaving(true);
    try {
      const restaurantRef = doc(collection(db, "restaurants"));
      const restaurantId  = restaurantRef.id;

      const profileUrl = await uploadToStorage(profileFile!, `restaurants/${restaurantId}/profile_image_${Date.now()}.jpg`);
      let taxUrl = "";
      if (taxFile) taxUrl = await uploadToStorage(taxFile, `restaurants/${restaurantId}/tax_plate_certificate_${Date.now()}.jpg`);

      const ownerId = resolvedOwner?.uid ?? "";

      await setDoc(restaurantRef, {
        ownerId, businessType: "restaurant",
        name: name.trim(), email: email.trim(),
        contactNo: contactNo.trim(), address: address.trim(),
        foodType, cuisineTypes, workingDays,
        workingHours: { open: workingHoursOpen, close: workingHoursClose },
        minOrderPrices,
        profileImageUrl: profileUrl, taxPlateCertificateUrl: taxUrl,
        latitude: coordinates.latitude!, longitude: coordinates.longitude!,
        createdAt: serverTimestamp(),
        isBoosted: false, isActive: true,
        averageRating: 0.0, reviewCount: 0, clickCount: 0, followerCount: 0,
      });

      if (resolvedOwner) {
        await updateDoc(doc(db, "users", resolvedOwner.uid), {
          [`memberOfRestaurants.${restaurantId}`]: "owner", verified: true,
        });
        const idToken = await auth.currentUser!.getIdToken();
        await fetch("/api/sync-claims", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ uid: resolvedOwner.uid }),
        });
        try {
          await setDoc(doc(collection(db, "users", resolvedOwner.uid, "notifications")), {
            type: "restaurant_approved", shopId: restaurantId, timestamp: serverTimestamp(),
            isRead: false, message: "Your restaurant has been created.",
            message_en: "Tap to visit your restaurant.",
            message_tr: "Restoranınızı ziyaret etmek için dokunun.",
            message_ru: "Нажмите, чтобы посетить свой ресторан.",
          });
        } catch { /* non-fatal */ }
        try {
          const shopWelcomeEmail = httpsCallable(functions, "shopWelcomeEmail");
          await shopWelcomeEmail({ shopId: restaurantId, email: resolvedOwner.email });
        } catch { /* non-fatal */ }
      }

      toast.success("Restoran başarıyla oluşturuldu!");

      // Prepend new restaurant to list immediately
      setRestaurants((prev) => [{
        id: restaurantId, name: name.trim(), address: address.trim(),
        contactNo: contactNo.trim(), isActive: true,
        profileImageUrl: profileUrl, cuisineTypes,
      }, ...prev]);

      // Reset form
      setName(""); setEmail(""); setContactNo(""); setAddress("");
      setCoordinates({ latitude: null, longitude: null });
      setFoodType([]); setCuisineTypes([]); setWorkingDays([]);
      setWorkingHoursOpen("09:00"); setWorkingHoursClose("22:00");
      setMinOrderPrices([]); setProfileFile(null); setProfilePreview("");
      setTaxFile(null); setTaxPreview("");
      setResolvedOwner(null); setOwnerEmail(""); setOwnerLookupStatus("idle");

    } catch (err) {
      console.error("Failed to create restaurant:", err);
      setError("Restoran oluşturulamadı. Lütfen tekrar deneyin.");
    } finally {
      setSaving(false);
    }
  };

  const getCategoryName = (key: string): string => FoodCategoryData.kCategoryTranslationKeys[key] ?? key;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50/50">

      {/* Header */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="w-9 h-9 flex items-center justify-center bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors">
            <ArrowLeft className="w-4 h-4 text-gray-600" />
          </button>
          <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center">
            <UtensilsCrossed className="w-4 h-4 text-orange-600" />
          </div>
          <div>
            <h1 className="text-[15px] font-semibold text-gray-900">Restoran Yönetimi</h1>
            <p className="text-[11px] text-gray-400">Oluştur ve yönet</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-5 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ═══ LEFT COLUMN: Create Form ═══════════════════════════════════════ */}
        <div className="space-y-5 order-2 lg:order-1">

        {/* Error banner */}
        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-[13px] text-red-600">{error}</p>
          </div>
        )}

        {/* ═══ BÖLÜM B: Yeni Restoran Formu ══════════════════════════════════ */}

        {/* Basic Info */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-7 h-7 bg-orange-50 rounded-lg flex items-center justify-center">
              <Store className="w-3.5 h-3.5 text-orange-600" />
            </div>
            <h3 className="text-[15px] font-semibold text-gray-900">Temel Bilgiler</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Restoran Adı *</label>
              <div className="relative">
                <UtensilsCrossed className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="örn. İstanbul Mutfağı"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all" />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">İş E-postası</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="restoran@example.com"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all" />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Telefon *</label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="tel" value={contactNo} onChange={(e) => setContactNo(e.target.value)} placeholder="05XX XXX XX XX"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all" />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Adres *</label>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-400" />
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={3} placeholder="Tam adres..."
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all resize-none" />
              </div>
            </div>
            <div className="md:col-span-2">
              <button type="button" onClick={() => setShowMapModal(true)}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed font-medium text-[13px] transition-all ${
                  coordinates.latitude && coordinates.longitude
                    ? "border-emerald-200 bg-emerald-50/50 text-emerald-600"
                    : "border-orange-200 bg-orange-50/50 text-orange-600 hover:bg-orange-50"
                }`}>
                <MapPin className="w-4 h-4" />
                {coordinates.latitude && coordinates.longitude ? "Konum sabitlendi ✓" : "Konumu sabitle *"}
              </button>
              {coordinates.latitude && coordinates.longitude && (
                <p className="text-[11px] text-gray-400 mt-1.5 text-center">
                  {coordinates.latitude.toFixed(6)}, {coordinates.longitude.toFixed(6)}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Owner Assignment */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-7 h-7 bg-indigo-50 rounded-lg flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-gray-900">Sahip Atama</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">İsteğe bağlı — daha sonra detay sayfasından davet edebilirsiniz</p>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="email" value={ownerEmail}
                onChange={(e) => { setOwnerEmail(e.target.value); setOwnerLookupStatus("idle"); setResolvedOwner(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") lookupOwner(); }}
                placeholder="Sahibin e-posta adresi..."
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all" />
            </div>
            <button type="button" onClick={lookupOwner} disabled={!ownerEmail.trim() || ownerLookupStatus === "searching"}
              className="px-4 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-[13px] font-medium transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed flex items-center gap-1.5">
              {ownerLookupStatus === "searching" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ara"}
            </button>
          </div>
          {ownerLookupStatus === "found" && resolvedOwner && (
            <div className="mt-3 flex items-center gap-3 px-3.5 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-gray-900 truncate">{resolvedOwner.displayName || "—"}</p>
                <p className="text-[11px] text-gray-500 truncate">{resolvedOwner.email}</p>
              </div>
              <button type="button" onClick={() => { setResolvedOwner(null); setOwnerEmail(""); setOwnerLookupStatus("idle"); }}
                className="w-7 h-7 flex items-center justify-center hover:bg-emerald-100 rounded-lg transition-colors">
                <X className="w-3.5 h-3.5 text-emerald-600" />
              </button>
            </div>
          )}
          {ownerLookupStatus === "not_found" && (
            <div className="mt-3 flex items-center gap-2.5 px-3.5 py-3 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-[12px] text-red-600">Bu e-posta adresiyle kayıtlı hesap bulunamadı.</p>
            </div>
          )}
        </div>

        {/* Food Types */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-7 h-7 bg-violet-50 rounded-lg flex items-center justify-center">
              <UtensilsCrossed className="w-3.5 h-3.5 text-violet-600" />
            </div>
            <h3 className="text-[15px] font-semibold text-gray-900">Yemek Türleri *</h3>
          </div>
          <button type="button" onClick={() => setShowFoodTypeModal(true)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 bg-white text-[13px] hover:border-gray-300 transition-all">
            <span className={foodType.length > 0 ? "text-gray-900 font-medium" : "text-gray-400"}>
              {foodType.length > 0 ? `${foodType.length} yemek türü seçildi` : "Yemek türü seçin..."}
            </span>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </button>
          {foodType.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {foodType.map((ft) => (
                <span key={ft} className="inline-flex items-center gap-1 px-2.5 py-1 bg-violet-50 text-violet-700 rounded-lg text-[11px] font-medium">
                  {getCategoryName(ft)}
                  <button onClick={() => setFoodType((p) => p.filter((x) => x !== ft))}><X className="w-3 h-3" /></button>
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
                <h3 className="text-[15px] font-semibold text-gray-900">Yemek Türü Seç</h3>
                <button type="button" onClick={() => setShowFoodTypeModal(false)} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                {FoodCategoryData.kCategories.map((cat) => (
                  <label key={cat.key} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer rounded-lg transition-colors">
                    <input type="checkbox" checked={foodType.includes(cat.key)}
                      onChange={() => setFoodType((p) => p.includes(cat.key) ? p.filter((x) => x !== cat.key) : [...p, cat.key])}
                      className="h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" />
                    <span className="text-[13px] text-gray-700">{getCategoryName(cat.key)}</span>
                  </label>
                ))}
              </div>
              <div className="px-5 py-4 border-t border-gray-100">
                <button type="button" onClick={() => setShowFoodTypeModal(false)}
                  className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-xl text-[13px] font-medium transition-colors">
                  Onayla ({foodType.length} seçili)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cuisine Types */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-7 h-7 bg-indigo-50 rounded-lg flex items-center justify-center">
              <Globe className="w-3.5 h-3.5 text-indigo-600" />
            </div>
            <h3 className="text-[15px] font-semibold text-gray-900">Mutfak Türleri *</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CUISINE_OPTIONS.map((cuisine) => {
              const isSelected = cuisineTypes.includes(cuisine);
              return (
                <button key={cuisine} type="button"
                  onClick={() => setCuisineTypes((p) => p.includes(cuisine) ? p.filter((c) => c !== cuisine) : [...p, cuisine])}
                  className={`px-3 py-2.5 rounded-xl text-[12px] font-semibold border-2 transition-all ${
                    isSelected ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-white border-gray-200 text-gray-500 hover:border-indigo-200 hover:bg-indigo-50/30"
                  }`}>
                  {cuisine}
                </button>
              );
            })}
          </div>
        </div>

        {/* Min Order Prices */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-7 h-7 bg-emerald-50 rounded-lg flex items-center justify-center">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-gray-900">Bölgeye Göre Min. Sipariş *</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">Her teslimat bölgesi için minimum sipariş tutarı belirleyin</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Ana Bölge</label>
              <select value={selectedMainRegion} onChange={(e) => { setSelectedMainRegion(e.target.value); setSelectedSubregion(""); }}
                className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all">
                <option value="">Bölge seçin...</option>
                {mainRegions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Alt Bölge</label>
              <select value={selectedSubregion} onChange={(e) => setSelectedSubregion(e.target.value)} disabled={!selectedMainRegion}
                className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed">
                <option value="">Alt bölge seçin...</option>
                {availableSubregions.map((s) => (
                  <option key={s} value={s} disabled={isSubregionAlreadyAdded(s)}>{s}{isSubregionAlreadyAdded(s) ? " (eklendi)" : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Min. Fiyat (TL)</label>
              <div className="flex gap-2">
                <input type="number" min="0" step="0.01" value={minPriceInput} onChange={(e) => setMinPriceInput(e.target.value)}
                  disabled={!selectedSubregion} placeholder="0.00"
                  className="flex-1 px-3 py-3 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed" />
                <button type="button" onClick={addMinOrderPrice}
                  disabled={!selectedMainRegion || !selectedSubregion || !minPriceInput || isSubregionAlreadyAdded(selectedSubregion)}
                  className="px-3 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
          {minOrderPrices.length > 0 && (
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {minOrderPrices.map((entry, i) => (
                <div key={`${entry.mainRegion}-${entry.subregion}`} className="flex items-center justify-between px-3.5 py-2.5 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-medium text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full whitespace-nowrap">{entry.mainRegion}</span>
                    <span className="text-[13px] text-gray-700 font-medium truncate">{entry.subregion}</span>
                  </div>
                  <div className="flex items-center gap-2.5 flex-shrink-0 ml-2">
                    <span className="text-[13px] font-semibold text-gray-900">{entry.minOrderPrice.toFixed(2)} TL</span>
                    <button type="button" onClick={() => setMinOrderPrices((p) => p.filter((_, idx) => idx !== i))}
                      className="w-7 h-7 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Working Schedule */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-7 h-7 bg-orange-50 rounded-lg flex items-center justify-center">
              <CalendarDays className="w-3.5 h-3.5 text-orange-600" />
            </div>
            <h3 className="text-[15px] font-semibold text-gray-900">Çalışma Saatleri *</h3>
          </div>
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2.5">
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Çalışma Günleri</label>
              <button type="button" onClick={() => setWorkingDays((p) => p.length === ALL_DAYS.length ? [] : [...ALL_DAYS])}
                className="text-[11px] font-medium text-indigo-500 hover:text-indigo-600 transition-colors">
                {workingDays.length === ALL_DAYS.length ? "Tümünü kaldır" : "Tümünü seç"}
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {ALL_DAYS.map((day) => {
                const sel = workingDays.includes(day);
                return (
                  <button key={day} type="button" onClick={() => toggleDay(day)}
                    className={`py-2 rounded-xl text-[11px] font-semibold border-2 transition-all ${
                      sel ? "bg-orange-50 border-orange-300 text-orange-700" : "bg-white border-gray-200 text-gray-500 hover:border-orange-200 hover:bg-orange-50/30"
                    }`}>
                    {DAY_LABELS[day]}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">Çalışma Saatleri</label>
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="time" value={workingHoursOpen} onChange={(e) => setWorkingHoursOpen(e.target.value)}
                  className="w-full pl-10 pr-3 py-3 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all" />
                <span className="block text-[10px] text-gray-400 mt-1 text-center">Açılış</span>
              </div>
              <span className="text-gray-300 font-medium text-[14px] mt-[-16px]">–</span>
              <div className="flex-1 relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="time" value={workingHoursClose} onChange={(e) => setWorkingHoursClose(e.target.value)}
                  className="w-full pl-10 pr-3 py-3 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all" />
                <span className="block text-[10px] text-gray-400 mt-1 text-center">Kapanış</span>
              </div>
            </div>
          </div>
        </div>

        {/* Images */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-7 h-7 bg-emerald-50 rounded-lg flex items-center justify-center">
              <Camera className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <h3 className="text-[15px] font-semibold text-gray-900">Görseller</h3>
          </div>
          <div className="grid grid-cols-1 gap-5">
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Profil Fotoğrafı *</label>
              <input ref={profileImageRef} type="file" accept="image/*"
                onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null, "profile")} className="hidden" />
              {profilePreview ? (
                <div className="relative">
                  <img src={profilePreview} alt="Profile" className="w-full h-36 object-cover rounded-xl border border-gray-200" />
                  <button type="button" onClick={() => { setProfileFile(null); setProfilePreview(""); }}
                    className="absolute -top-2 -right-2 w-7 h-7 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors shadow-md">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => profileImageRef.current?.click()}
                  className="w-full h-36 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center hover:border-orange-300 hover:bg-orange-50/30 transition-all group">
                  <Camera className="w-8 h-8 text-gray-300 group-hover:text-orange-400 mb-1.5 transition-colors" />
                  <span className="text-[12px] font-medium text-gray-400 group-hover:text-orange-500">Profil fotoğrafı yükle</span>
                </button>
              )}
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Vergi Levhası <span className="text-gray-300 normal-case font-normal">(isteğe bağlı)</span>
              </label>
              <input ref={taxCertRef} type="file" accept="image/*"
                onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null, "tax")} className="hidden" />
              {taxPreview ? (
                <div className="relative">
                  <img src={taxPreview} alt="Tax" className="w-full h-36 object-cover rounded-xl border border-gray-200" />
                  <button type="button" onClick={() => { setTaxFile(null); setTaxPreview(""); }}
                    className="absolute -top-2 -right-2 w-7 h-7 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors shadow-md">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => taxCertRef.current?.click()}
                  className="w-full h-36 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center hover:border-orange-300 hover:bg-orange-50/30 transition-all group">
                  <FileText className="w-8 h-8 text-gray-300 group-hover:text-orange-400 mb-1.5 transition-colors" />
                  <span className="text-[12px] font-medium text-gray-400 group-hover:text-orange-500">Vergi levhası yükle</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end pb-4">
          <button type="button" onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-2 px-8 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-[14px] font-semibold transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed">
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Oluşturuluyor...</>
            ) : (
              <><Upload className="w-4 h-4" /> Restoran Oluştur</>
            )}
          </button>
        </div>

        </div>{/* end left column */}

        {/* ═══ RIGHT COLUMN: Restaurant List ══════════════════════════════════ */}
        <div className="order-1 lg:order-2">
        <div className="lg:sticky lg:top-20 space-y-5">

        {/* ═══ BÖLÜM A: Mevcut Restoranlar ═══════════════════════════════════ */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-orange-50 rounded-lg flex items-center justify-center">
                <Store className="w-3.5 h-3.5 text-orange-600" />
              </div>
              <h3 className="text-[15px] font-semibold text-gray-900">Mevcut Restoranlar</h3>
              {restaurants.length > 0 && (
                <span className="text-[11px] font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                  {restaurants.length}{hasMore ? "+" : ""}
                </span>
              )}
            </div>
          </div>

          {/* Loading skeleton */}
          {loadingList && (
            <div className="divide-y divide-gray-50">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3.5 animate-pulse">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-gray-100 rounded w-1/3" />
                    <div className="h-2.5 bg-gray-50 rounded w-1/2" />
                  </div>
                  <div className="flex gap-2">
                    <div className="h-8 w-28 bg-gray-100 rounded-lg" />
                    <div className="h-8 w-28 bg-gray-100 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty */}
          {!loadingList && restaurants.length === 0 && (
            <div className="py-12 text-center">
              <UtensilsCrossed className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-[13px] text-gray-400">Henüz restoran yok</p>
              <p className="text-[11px] text-gray-300 mt-1">Aşağıdan ilk restoranı oluşturun</p>
            </div>
          )}

          {/* Rows */}
          {!loadingList && restaurants.length > 0 && (
            <div className="divide-y divide-gray-50">
              {restaurants.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
                  {/* Avatar */}
                  <div className="relative w-10 h-10 rounded-xl overflow-hidden flex-shrink-0">
                    {r.profileImageUrl ? (
                      <Image src={r.profileImageUrl} alt={r.name} fill className="object-cover" />
                    ) : (
                      <div className="w-full h-full bg-orange-50 flex items-center justify-center">
                        <UtensilsCrossed className="w-4 h-4 text-orange-400" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13px] font-semibold text-gray-900 truncate">{r.name}</p>
                      <button
                        onClick={() => toggleActive(r)}
                        disabled={togglingId === r.id}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${
                          r.isActive !== false ? "bg-emerald-500" : "bg-gray-300"
                        }`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                          r.isActive !== false ? "translate-x-[18px]" : "translate-x-[3px]"
                        }`} />
                      </button>
                      <span className={`text-[9px] font-bold ${r.isActive !== false ? "text-emerald-600" : "text-red-500"}`}>
                        {r.isActive !== false ? "Aktif" : "Pasif"}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 truncate mt-0.5">
                      {r.address || r.contactNo || "—"}
                    </p>
                    {r.cuisineTypes && r.cuisineTypes.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {r.cuisineTypes.slice(0, 2).map((c) => (
                          <span key={c} className="text-[9px] text-orange-600 bg-orange-50 border border-orange-100 px-1.5 py-0.5 rounded-full">{c}</span>
                        ))}
                        {r.cuisineTypes.length > 2 && (
                          <span className="text-[9px] text-gray-400">+{r.cuisineTypes.length - 2}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => router.push(`/restaurantdetails?restaurantId=${r.id}`)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[11px] font-semibold rounded-lg transition-colors whitespace-nowrap"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Detayları Gör
                    </button>
                    <button
                      onClick={() => router.push(`/admin-restaurant-list-food?restaurantId=${r.id}`)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-semibold rounded-lg transition-colors whitespace-nowrap"
                    >
                      <UtensilsCrossed className="w-3 h-3" />
                      Yemek Listele
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Load more */}
          {!loadingList && hasMore && (
            <div className="px-5 py-4 border-t border-gray-100">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 text-[13px] font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                {loadingMore ? "Yükleniyor..." : "Daha fazla yükle"}
              </button>
            </div>
          )}
        </div>

        </div>{/* end sticky wrapper */}
        </div>{/* end right column */}

        </div>{/* end grid */}
      </div>

      {/* Map Modal */}
      {showMapModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 bg-orange-50 rounded-lg flex items-center justify-center">
                  <MapPin className="w-3.5 h-3.5 text-orange-600" />
                </div>
                <h3 className="text-[15px] font-semibold text-gray-900">Restoran Konumunu Sabitle</h3>
              </div>
              <button type="button" onClick={() => setShowMapModal(false)} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 p-4">
              <div id="admin-restaurant-map" className="w-full h-[500px] rounded-xl border border-gray-200" />
              <p className="text-[12px] text-gray-400 mt-3 text-center">Konumu belirlemek için haritaya tıklayın veya işaretçiyi sürükleyin</p>
              {coordinates.latitude && coordinates.longitude && (
                <p className="text-[12px] font-semibold text-orange-600 mt-1 text-center">
                  {coordinates.latitude.toFixed(6)}, {coordinates.longitude.toFixed(6)}
                </p>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button type="button" onClick={() => setShowMapModal(false)}
                className="flex-1 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-[13px] font-medium transition-colors">
                İptal
              </button>
              <button type="button" onClick={() => setShowMapModal(false)} disabled={!coordinates.latitude || !coordinates.longitude}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-xl text-[13px] font-medium transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed">
                Konumu Onayla
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