"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
  useRef,
} from "react";
import { User, onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/app/lib/firebase";
import { useRouter } from "next/navigation";
import {
  clearLastActivity,
  updateLastActivity,
  isSessionExpiredByInactivity,
  DEFAULT_IDLE_TIMEOUT,
} from "@/hooks/useIdleTimeout";
import {
  tabSessionManager,
  isFreshBrowserSession,
  markSessionValid,
  markSessionInvalid,
  broadcastLogout,
  resetTabSession,
} from "@/lib/tabSessionManager";

interface UserData {
  uid: string;
  email: string;
  isAdmin: boolean;
  isSemiAdmin?: boolean;
  displayName?: string;
  photoURL?: string;
}

type LogoutReason = "manual" | "idle_timeout" | "session_expired" | "not_admin" | "verification_failed";

interface AuthContextType {
  user: UserData | null;
  loading: boolean;
  logout: (reason?: LogoutReason) => Promise<void>;
  getIdToken: () => Promise<string | null>;
  logoutReason: LogoutReason | null;
  verifyAndLogin: () => Promise<boolean>;
  isVerifying: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => {},
  getIdToken: async () => null,
  logoutReason: null,
  verifyAndLogin: async () => false,
  isVerifying: false,
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Verify user's admin status via server-side API
 */
async function verifyAdminStatusServerSide(idToken: string): Promise<{
  success: boolean;
  user?: UserData;
  error?: string;
  code?: string;
}> {
  try {
    const response = await fetch("/api/auth/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ idToken }),
    });

    const data = await response.json();

    if (data.success) {
      return {
        success: true,
        user: {
          uid: data.user.uid,
          email: data.user.email || "",
          isAdmin: data.user.isAdmin,
          isSemiAdmin: data.user.isSemiAdmin,
          displayName: data.user.displayName,
          photoURL: data.user.photoURL,
        },
      };
    }

    return {
      success: false,
      error: data.error,
      code: data.code,
    };
  } catch (error) {
    console.error("Server-side verification failed:", error);
    return {
      success: false,
      error: "Failed to verify authentication",
      code: "NETWORK_ERROR",
    };
  }
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [logoutReason, setLogoutReason] = useState<LogoutReason | null>(null);
  const router = useRouter();

  // Store the Firebase User reference for token retrieval
  const firebaseUserRef = useRef<User | null>(null);

  // Track if we've done initial session check
  const sessionCheckDone = useRef(false);

  // Get the current ID token for API calls
  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (!firebaseUserRef.current) {
      return null;
    }

    try {
      const token = await firebaseUserRef.current.getIdToken(false);
      return token;
    } catch (error) {
      console.error("Error getting ID token:", error);
      return null;
    }
  }, []);

  // Logout function
  const logout = useCallback(async (reason: LogoutReason = "manual", broadcast: boolean = true) => {
    try {
      // Clear the idle timeout activity tracking
      clearLastActivity();

      // Mark session as invalid and broadcast to other tabs
      markSessionInvalid();
      if (broadcast) {
        broadcastLogout(reason);
      }

      // Set the logout reason before signing out
      setLogoutReason(reason);

      await signOut(auth);
      firebaseUserRef.current = null;
      setUser(null);
      router.push("/");
    } catch (error) {
      console.error("Logout error:", error);
    }
  }, [router]);

  // Manual verify and login function (used after Firebase auth)
  const verifyAndLogin = useCallback(async (): Promise<boolean> => {
    if (!firebaseUserRef.current) {
      return false;
    }

    setIsVerifying(true);

    try {
      const idToken = await firebaseUserRef.current.getIdToken(true);
      const result = await verifyAdminStatusServerSide(idToken);

      if (result.success && result.user) {
        setUser(result.user);
        setLogoutReason(null);
        // Update last activity on successful verification
        updateLastActivity();
        // Reset tab session - mark as valid and register this tab
        resetTabSession();
        return true;
      }

      // Verification failed - sign out
      const reason: LogoutReason = result.code === "NOT_ADMIN" ? "not_admin" : "verification_failed";
      await logout(reason);
      return false;
    } catch (error) {
      console.error("Verify and login error:", error);
      await logout("verification_failed");
      return false;
    } finally {
      setIsVerifying(false);
    }
  }, [logout]);

  // Initialize TabSessionManager and handle auth state changes
  useEffect(() => {
    // Initialize tab session manager FIRST with callbacks
    tabSessionManager.initialize({
      onLastTabClosed: () => {
        console.log("Last tab closing - session will be invalidated");
      },
      onLogoutBroadcast: (reason: string) => {
        // Another tab triggered logout
        console.log("Logout broadcast received from another tab:", reason);
        setLogoutReason("session_expired");
        signOut(auth).then(() => {
          firebaseUserRef.current = null;
          setUser(null);
          router.push("/");
        });
      },
    });

    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser: User | null) => {
        // Store the Firebase user reference
        firebaseUserRef.current = firebaseUser;

        if (firebaseUser) {
          // User has a Firebase session - need to verify

          // Only check session validity on first load (not on subsequent auth state changes)
          if (!sessionCheckDone.current) {
            sessionCheckDone.current = true;

            // Check 1: Was session invalidated (all tabs were closed)?
            // The tabSessionManager.isFreshBrowserSession() now properly handles refresh vs close
            if (isFreshBrowserSession()) {
              console.log("Session expired - all tabs were closed");
              setLogoutReason("session_expired");
              await signOut(auth);
              firebaseUserRef.current = null;
              setUser(null);
              setLoading(false);
              router.push("/");
              return;
            }

            // Check 2: Inactivity timeout
            if (isSessionExpiredByInactivity(DEFAULT_IDLE_TIMEOUT)) {
              console.log("Session expired due to inactivity");
              setLogoutReason("idle_timeout");
              markSessionInvalid();
              await signOut(auth);
              firebaseUserRef.current = null;
              setUser(null);
              setLoading(false);
              router.push("/");
              return;
            }
          }

          // Session is valid, now verify admin status server-side
          setIsVerifying(true);

          try {
            const idToken = await firebaseUser.getIdToken(true);
            const result = await verifyAdminStatusServerSide(idToken);

            if (result.success && result.user) {
              setUser(result.user);
              setLogoutReason(null);
              // Update last activity on successful verification
              updateLastActivity();
              // Mark session as valid and register this tab
              markSessionValid();
            } else {
              // Server-side verification failed
              console.error("Server-side verification failed:", result.error);

              const reason: LogoutReason =
                result.code === "NOT_ADMIN" ? "not_admin" : "verification_failed";

              setLogoutReason(reason);
              await signOut(auth);
              firebaseUserRef.current = null;
              setUser(null);
              router.push("/");
            }
          } catch (error) {
            console.error("Error during server-side verification:", error);
            setLogoutReason("verification_failed");
            await signOut(auth);
            firebaseUserRef.current = null;
            setUser(null);
            router.push("/");
          } finally {
            setIsVerifying(false);
          }
        } else {
          // No Firebase user
          setUser(null);
          // Reset session check flag when user logs out so it will check again on next login
          sessionCheckDone.current = false;
        }

        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [router, logout]);

  // Clear logout reason when user logs back in
  useEffect(() => {
    if (user) {
      setLogoutReason(null);
    }
  }, [user]);

  const value = {
    user,
    loading,
    logout,
    getIdToken,
    logoutReason,
    verifyAndLogin,
    isVerifying,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
