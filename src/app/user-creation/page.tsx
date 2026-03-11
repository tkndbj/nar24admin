"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  UserPlus,
  Mail,
  Lock,
  User,
  CheckCircle,
  AlertCircle,
  Loader2,
  Copy,
  Eye,
  EyeOff,
} from "lucide-react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { authenticatedFetch } from "@/lib/api";

interface CreatedUser {
  uid: string;
  email: string;
  displayName: string;
}

export default function UserCreationPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdUser, setCreatedUser] = useState<CreatedUser | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setCreatedUser(null);

    // Client-side validation
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!password) {
      setError("Password is required.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    try {
      const result = await authenticatedFetch<{
        success: boolean;
        user: CreatedUser;
      }>("/api/users/create", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          password,
          displayName: displayName.trim() || undefined,
        }),
      });

      setCreatedUser(result.user);
      // Keep the form values so admin can copy credentials to share
    } catch (err: unknown) {
      if (err && typeof err === "object" && "message" in err) {
        setError((err as { message: string }).message);
      } else {
        setError("An unexpected error occurred.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setEmail("");
    setPassword("");
    setDisplayName("");
    setCreatedUser(null);
    setError("");
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-purple-600" />
                <h1 className="text-xl font-semibold text-gray-900">
                  Create User Account
                </h1>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* Info Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium">How this works</p>
              <p className="mt-1">
                This creates a new account in your Firebase app. After creation,
                share the credentials with the user so they can sign in. The
                user will not receive any automatic email.
              </p>
            </div>
          </div>

          {/* Success Card */}
          {createdUser && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <h3 className="font-semibold text-green-900">
                  Account Created Successfully
                </h3>
              </div>

              <div className="space-y-3">
                <div className="text-sm text-green-800">
                  <span className="font-medium">UID:</span>{" "}
                  <code className="bg-green-100 px-2 py-0.5 rounded text-xs">
                    {createdUser.uid}
                  </code>
                </div>

                {/* Copyable credentials */}
                <div className="bg-white rounded-lg border border-green-200 p-4 space-y-3">
                  <p className="text-sm font-medium text-gray-700">
                    Share these credentials with the user:
                  </p>

                  <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div className="text-sm">
                      <span className="text-gray-500">Email: </span>
                      <span className="font-medium text-gray-900">
                        {createdUser.email}
                      </span>
                    </div>
                    <button
                      onClick={() => handleCopy(createdUser.email, "email")}
                      className="p-1.5 hover:bg-gray-200 rounded-md transition-colors"
                      title="Copy email"
                    >
                      {copiedField === "email" ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-500" />
                      )}
                    </button>
                  </div>

                  <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div className="text-sm">
                      <span className="text-gray-500">Password: </span>
                      <span className="font-medium text-gray-900">
                        {password}
                      </span>
                    </div>
                    <button
                      onClick={() => handleCopy(password, "password")}
                      className="p-1.5 hover:bg-gray-200 rounded-md transition-colors"
                      title="Copy password"
                    >
                      {copiedField === "password" ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-500" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <button
                onClick={handleReset}
                className="mt-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Create Another User
              </button>
            </div>
          )}

          {/* Error Alert */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Form */}
          {!createdUser && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-5">
                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setError("");
                      }}
                      placeholder="user@example.com"
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-colors"
                      disabled={loading}
                      autoComplete="off"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setError("");
                      }}
                      placeholder="Minimum 6 characters"
                      className="w-full pl-10 pr-11 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-colors"
                      disabled={loading}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-200 rounded transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4 text-gray-400" />
                      ) : (
                        <Eye className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                  {password.length > 0 && password.length < 6 && (
                    <p className="text-xs text-amber-600 mt-1">
                      {6 - password.length} more character
                      {6 - password.length > 1 ? "s" : ""} needed
                    </p>
                  )}
                </div>

                {/* Display Name (Optional) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Display Name{" "}
                    <span className="text-gray-400 font-normal">
                      (optional)
                    </span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="John Doe"
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-colors"
                      disabled={loading}
                      autoComplete="off"
                    />
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || !email.trim() || password.length < 6}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    Create Account
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
