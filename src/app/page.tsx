"use client";

import { useState, useEffect } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "./lib/firebase";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  Shield,
  Lock,
  Mail,
  AlertCircle,
  Loader2,
  CheckCircle,
  Zap,
  Clock,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// Session message configuration based on logout reason
const SESSION_MESSAGES: Record<string, { title: string; message: string; icon: "clock" | "shield" }> = {
  idle_timeout: {
    title: "Oturum Zaman Aşımı",
    message: "Güvenliğiniz için, 30 dakika hareketsizlik sonrası oturumunuz sonlandırıldı.",
    icon: "clock",
  },
  session_expired: {
    title: "Oturum Sona Erdi",
    message: "Başka bir sekmeden çıkış yapıldı. Lütfen tekrar giriş yapın.",
    icon: "clock",
  },
  not_admin: {
    title: "Yetkisiz Erişim",
    message: "Bu hesap yönetici yetkilerine sahip değil.",
    icon: "shield",
  },
  verification_failed: {
    title: "Doğrulama Hatası",
    message: "Kimlik doğrulama başarısız oldu. Lütfen tekrar deneyin.",
    icon: "shield",
  },
};

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verificationStep, setVerificationStep] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sessionMessage, setSessionMessage] = useState<{
    title: string;
    message: string;
    icon: "clock" | "shield";
  } | null>(null);
  const router = useRouter();
  const { logoutReason, user, isVerifying, loading: authLoading } = useAuth();

  // Redirect if already authenticated or reset loading on auth failure
  useEffect(() => {
    if (user && !isVerifying && !authLoading) {
      router.push("/dashboard");
    }
    // Reset loading state when auth verification completes (success or failure)
    if (!authLoading && !isVerifying && loading) {
      setLoading(false);
      setVerificationStep(null);
    }
  }, [user, isVerifying, authLoading, router, loading]);

  // Show message based on logout reason
  useEffect(() => {
    if (logoutReason && SESSION_MESSAGES[logoutReason]) {
      setSessionMessage(SESSION_MESSAGES[logoutReason]);
    }
  }, [logoutReason]);

  // Clear session message when user starts typing
  const handleInputChange = (setter: (value: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value);
    if (sessionMessage) {
      setSessionMessage(null);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSessionMessage(null);

    try {
      // Step 1: Firebase Authentication
      setVerificationStep("Kimlik bilgileri doğrulanıyor...");
      await signInWithEmailAndPassword(auth, email, password);

      // Step 2: Wait for AuthContext to verify (it happens automatically via onAuthStateChanged)
      setVerificationStep("Yönetici yetkileri kontrol ediliyor...");
      // The redirect will happen automatically via the useEffect above
      // when the user state is set after verification
    } catch (error) {
      console.error("Login error:", error);

      // Parse Firebase auth errors
      let errorMessage = "Giriş başarısız. Lütfen tekrar deneyin.";

      if (error instanceof Error) {
        const errorCode = (error as { code?: string }).code;

        switch (errorCode) {
          case "auth/user-not-found":
            errorMessage = "Bu e-posta adresiyle kayıtlı kullanıcı bulunamadı.";
            break;
          case "auth/wrong-password":
            errorMessage = "Şifre hatalı. Lütfen tekrar deneyin.";
            break;
          case "auth/invalid-email":
            errorMessage = "Geçersiz e-posta adresi formatı.";
            break;
          case "auth/user-disabled":
            errorMessage = "Bu hesap devre dışı bırakılmış.";
            break;
          case "auth/too-many-requests":
            errorMessage = "Çok fazla başarısız deneme. Lütfen daha sonra tekrar deneyin.";
            break;
          case "auth/invalid-credential":
            errorMessage = "E-posta veya şifre hatalı.";
            break;
          default:
            errorMessage = error.message;
        }
      }

      setError(errorMessage);
      setLoading(false);
      setVerificationStep(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-purple-600/20 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-cyan-400/20 to-blue-600/20 rounded-full mix-blend-multiply filter blur-xl animate-pulse delay-1000"></div>
        <div className="absolute top-40 left-1/2 w-40 h-40 bg-gradient-to-br from-purple-400/20 to-pink-600/20 rounded-full mix-blend-multiply filter blur-xl animate-pulse delay-500"></div>
      </div>

      {/* Floating Elements */}
      <div className="absolute top-20 left-20 w-2 h-2 bg-blue-500/30 rounded-full animate-bounce delay-300"></div>
      <div className="absolute top-40 right-32 w-1 h-1 bg-purple-500/40 rounded-full animate-bounce delay-700"></div>
      <div className="absolute bottom-32 left-32 w-1.5 h-1.5 bg-cyan-500/30 rounded-full animate-bounce delay-1000"></div>

      <div className="relative w-full max-w-md">
        {/* Main Login Card */}
        <div className="bg-white/80 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl p-8 relative">
          {/* Decorative Elements */}
          <div className="absolute -top-2 -right-2 w-4 h-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full opacity-60"></div>
          <div className="absolute -bottom-2 -left-2 w-3 h-3 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full opacity-60"></div>

          {/* Header Section */}
          <div className="text-center mb-8">
            {/* Logo/Icon with Glow Effect */}
            <div className="relative inline-block mb-6">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl blur-lg opacity-30 scale-110"></div>
              <div className="relative bg-gradient-to-br from-blue-600 to-purple-700 rounded-2xl p-4 shadow-xl">
                <Shield className="w-8 h-8 text-white" />
              </div>
            </div>

            <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent mb-2">
              Nar24 Admin
            </h1>
            <p className="text-gray-600 font-medium">
              Yönetici paneline hoş geldiniz
            </p>
          </div>

          {/* Session Message (Timeout, Expired, Not Admin, etc.) */}
          {sessionMessage && (
            <div className={`mb-6 p-4 rounded-xl flex items-start gap-3 animate-in slide-in-from-top duration-300 ${
              sessionMessage.icon === "shield"
                ? "bg-red-50 border border-red-200"
                : "bg-amber-50 border border-amber-200"
            }`}>
              {sessionMessage.icon === "shield" ? (
                <ShieldAlert className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              ) : (
                <Clock className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p className={`text-sm font-medium ${
                  sessionMessage.icon === "shield" ? "text-red-800" : "text-amber-800"
                }`}>
                  {sessionMessage.title}
                </p>
                <p className={`text-sm ${
                  sessionMessage.icon === "shield" ? "text-red-700" : "text-amber-700"
                }`}>
                  {sessionMessage.message}
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 animate-in slide-in-from-top duration-300">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-800 text-sm font-medium">Giriş Hatası</p>
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-6">
            {/* Email Field */}
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="block text-sm font-semibold text-gray-700"
              >
                E-posta Adresi
              </label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={handleInputChange(setEmail)}
                  className="w-full pl-12 pr-4 py-4 bg-gray-50/50 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all duration-200 hover:border-gray-300"
                  placeholder="admin@nar24.com"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <label
                htmlFor="password"
                className="block text-sm font-semibold text-gray-700"
              >
                Şifre
              </label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={handleInputChange(setPassword)}
                  className="w-full pl-12 pr-14 py-4 bg-gray-50/50 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all duration-200 hover:border-gray-300"
                  placeholder="Şifrenizi girin"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
                  disabled={loading}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-3 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] relative overflow-hidden group"
            >
              {/* Button Background Animation */}
              <div className="absolute inset-0 bg-gradient-to-r from-blue-700 to-purple-700 opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>

              <div className="relative flex items-center gap-3">
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{verificationStep || "Erişim Doğrulanıyor..."}</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-5 h-5" />
                    <span>Güvenli Giriş</span>
                    <Zap className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </>
                )}
              </div>
            </button>
          </form>

          {/* Security Features */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="flex items-center justify-center gap-6 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>SSL Şifreli</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-500" />
                <span>2FA Korumalı</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Decorative Text */}
        <div className="text-center mt-6">
          <p className="text-gray-500 text-sm font-medium">
            Gelişmiş güvenlik protokolleri ile korunmaktadır
          </p>
        </div>
      </div>
    </div>
  );
}
