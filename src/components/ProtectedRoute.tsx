"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, Shield, Clock, AlertTriangle } from "lucide-react";
import {
  useIdleTimeout,
  DEFAULT_IDLE_TIMEOUT,
  DEFAULT_WARNING_DURATION,
} from "@/hooks/useIdleTimeout";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [showWarningModal, setShowWarningModal] = useState(false);

  // Idle timeout configuration
  const { isWarning, remainingSeconds, resetTimer } = useIdleTimeout({
    timeout: DEFAULT_IDLE_TIMEOUT, // 30 minutes
    warningDuration: DEFAULT_WARNING_DURATION, // 2 minutes warning
    onWarning: () => {
      setShowWarningModal(true);
    },
    onTimeout: () => {
      setShowWarningModal(false);
      logout("idle_timeout");
    },
    onActive: () => {
      setShowWarningModal(false);
    },
    enabled: !!user, // Only enable when user is logged in
  });

  // Handle "Stay Logged In" button click
  const handleStayLoggedIn = () => {
    resetTimer();
    setShowWarningModal(false);
  };

  // Handle "Logout Now" button click
  const handleLogoutNow = () => {
    setShowWarningModal(false);
    logout("manual");
  };

  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
    }
  }, [user, loading, router]);

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <div className="flex items-center justify-center gap-2 text-white">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-lg">Verifying admin access...</span>
          </div>
        </div>
      </div>
    );
  }

  // Show nothing while redirecting non-authenticated users
  if (!user) {
    return null;
  }

  // Format remaining time for display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // User is authenticated and is admin, show the protected content
  return (
    <>
      {children}

      {/* Idle Timeout Warning Modal */}
      {showWarningModal && isWarning && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-full">
                  <AlertTriangle className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-xl font-bold text-white">Session Expiring</h2>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-6">
              <div className="flex items-center justify-center mb-6">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full border-4 border-amber-100 flex items-center justify-center">
                    <div className="text-center">
                      <Clock className="w-6 h-6 text-amber-500 mx-auto mb-1" />
                      <span className="text-2xl font-bold text-amber-600">
                        {formatTime(remainingSeconds)}
                      </span>
                    </div>
                  </div>
                  {/* Animated ring */}
                  <svg
                    className="absolute inset-0 w-24 h-24 -rotate-90"
                    viewBox="0 0 100 100"
                  >
                    <circle
                      cx="50"
                      cy="50"
                      r="46"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="4"
                      strokeDasharray={`${(remainingSeconds / 120) * 289} 289`}
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>

              <p className="text-gray-600 text-center mb-6">
                You&apos;ve been inactive for a while. For your security, you&apos;ll be
                automatically logged out in{" "}
                <span className="font-semibold text-amber-600">
                  {formatTime(remainingSeconds)}
                </span>
                .
              </p>

              <p className="text-sm text-gray-500 text-center mb-6">
                Click &quot;Stay Logged In&quot; to continue your session.
              </p>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleLogoutNow}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                >
                  Logout Now
                </button>
                <button
                  onClick={handleStayLoggedIn}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl text-white font-medium hover:from-amber-600 hover:to-orange-600 transition-colors shadow-lg shadow-amber-500/30"
                >
                  Stay Logged In
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
