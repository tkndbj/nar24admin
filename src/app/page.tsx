"use client";

import { useState, useEffect } from "react";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
} from "firebase/auth";
import { auth } from "./lib/firebase";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  Clock,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const SESSION_MESSAGES: Record<
  string,
  { title: string; message: string; icon: "clock" | "shield" }
> = {
  idle_timeout: {
    title: "Oturum Zaman Asimi",
    message:
      "Guvenliginiz icin, 30 dakika hareketsizlik sonrasi oturumunuz sonlandirildi.",
    icon: "clock",
  },
  session_expired: {
    title: "Oturum Sona Erdi",
    message: "Baska bir sekmeden cikis yapildi. Lutfen tekrar giris yapin.",
    icon: "clock",
  },
  not_admin: {
    title: "Yetkisiz Erisim",
    message: "Bu hesap yonetici yetkilerine sahip degil.",
    icon: "shield",
  },
  verification_failed: {
    title: "Dogrulama Hatasi",
    message: "Kimlik dogrulama basarisiz oldu. Lutfen tekrar deneyin.",
    icon: "shield",
  },
};

const googleProvider = new GoogleAuthProvider();

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [verificationStep, setVerificationStep] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sessionMessage, setSessionMessage] = useState<{
    title: string;
    message: string;
    icon: "clock" | "shield";
  } | null>(null);
  const router = useRouter();
  const {
    logoutReason,
    user,
    isVerifying,
    loading: authLoading,
  } = useAuth();

  useEffect(() => {
    if (user && !isVerifying && !authLoading) {
      router.push("/dashboard");
    }
    if (!authLoading && !isVerifying && (loading || googleLoading)) {
      setLoading(false);
      setGoogleLoading(false);
      setVerificationStep(null);
    }
  }, [user, isVerifying, authLoading, router, loading, googleLoading]);

  useEffect(() => {
    if (logoutReason && SESSION_MESSAGES[logoutReason]) {
      setSessionMessage(SESSION_MESSAGES[logoutReason]);
    }
  }, [logoutReason]);

  const clearMessages = () => {
    if (sessionMessage) setSessionMessage(null);
    if (error) setError(null as unknown as string);
  };

  const handleInputChange =
    (setter: (value: string) => void) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setter(e.target.value);
      clearMessages();
    };

  const getFirebaseErrorMessage = (errorCode: string): string => {
    switch (errorCode) {
      case "auth/user-not-found":
        return "Bu e-posta adresiyle kayitli kullanici bulunamadi.";
      case "auth/wrong-password":
        return "Sifre hatali. Lutfen tekrar deneyin.";
      case "auth/invalid-email":
        return "Gecersiz e-posta adresi formati.";
      case "auth/user-disabled":
        return "Bu hesap devre disi birakilmis.";
      case "auth/too-many-requests":
        return "Cok fazla basarisiz deneme. Lutfen daha sonra tekrar deneyin.";
      case "auth/invalid-credential":
        return "E-posta veya sifre hatali.";
      case "auth/popup-closed-by-user":
        return "Giris penceresi kapatildi. Lutfen tekrar deneyin.";
      case "auth/popup-blocked":
        return "Giris penceresi engellendi. Lutfen popup engelleyicinizi kontrol edin.";
      case "auth/account-exists-with-different-credential":
        return "Bu e-posta adresi farkli bir giris yontemiyle kayitli.";
      default:
        return "Giris basarisiz. Lutfen tekrar deneyin.";
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSessionMessage(null);

    try {
      setVerificationStep("Kimlik bilgileri dogrulaniyor...");
      await signInWithEmailAndPassword(auth, email, password);
      setVerificationStep("Yonetici yetkileri kontrol ediliyor...");
    } catch (err) {
      const errorCode = (err as { code?: string }).code || "";
      setError(getFirebaseErrorMessage(errorCode));
      setLoading(false);
      setVerificationStep(null);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError("");
    setSessionMessage(null);

    try {
      setVerificationStep("Google ile giris yapiliyor...");
      await signInWithPopup(auth, googleProvider);
      setVerificationStep("Yonetici yetkileri kontrol ediliyor...");
    } catch (err) {
      const errorCode = (err as { code?: string }).code || "";
      setError(getFirebaseErrorMessage(errorCode));
      setGoogleLoading(false);
      setVerificationStep(null);
    }
  };

  const isLoading = loading || googleLoading;

  return (
    <div className="min-h-screen bg-[#fafafa] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-neutral-900 rounded-xl mb-4">
            <span className="text-white font-bold text-lg">N</span>
          </div>
          <h1 className="text-xl font-semibold text-neutral-900">
            Nar24 Admin
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Yonetici paneline giris yapin
          </p>
        </div>

        {/* Card */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm">
          {/* Session Message */}
          {sessionMessage && (
            <div
              className={`mb-5 p-3 rounded-lg flex items-start gap-2.5 text-sm ${
                sessionMessage.icon === "shield"
                  ? "bg-red-50 text-red-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              {sessionMessage.icon === "shield" ? (
                <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
              ) : (
                <Clock className="w-4 h-4 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-medium">{sessionMessage.title}</p>
                <p className="opacity-80">{sessionMessage.message}</p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-5 p-3 rounded-lg flex items-start gap-2.5 text-sm bg-red-50 text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          {/* Google Sign-In */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full py-2.5 px-4 bg-white border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2.5"
          >
            {googleLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{verificationStep || "Giris yapiliyor..."}</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                <span>Google ile giris yap</span>
              </>
            )}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-neutral-200" />
            <span className="text-xs text-neutral-400 uppercase tracking-wider">
              veya
            </span>
            <div className="flex-1 h-px bg-neutral-200" />
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-neutral-700 mb-1.5"
              >
                E-posta
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={handleInputChange(setEmail)}
                className="w-full px-3 py-2.5 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent transition-shadow"
                placeholder="admin@nar24.com"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-neutral-700 mb-1.5"
              >
                Sifre
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={handleInputChange(setPassword)}
                  className="w-full px-3 py-2.5 pr-10 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent transition-shadow"
                  placeholder="Sifrenizi girin"
                  required
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                  disabled={isLoading}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !email || !password}
              className="w-full py-2.5 px-4 bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-300 text-white text-sm font-medium rounded-lg transition-colors disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    {verificationStep || "Dogrulaniyor..."}
                  </span>
                </>
              ) : (
                <span>Giris Yap</span>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-neutral-400 mt-6">
          Yalnizca yetkili yoneticiler giris yapabilir
        </p>
      </div>
    </div>
  );
}
