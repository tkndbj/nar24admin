"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { User, onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/app/lib/firebase";
import { useRouter } from "next/navigation";

interface UserData {
  uid: string;
  email: string;
  isAdmin: boolean;
  displayName?: string;
  photoURL?: string;
}

interface AuthContextType {
  user: UserData | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => {},
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

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser: User | null) => {
        if (firebaseUser) {
          try {
            // Get user data from Firestore
            const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));

            if (userDoc.exists()) {
              const userData = userDoc.data();

              // Only set user if they are admin
              if (userData.isAdmin) {
                setUser({
                  uid: firebaseUser.uid,
                  email: firebaseUser.email || "",
                  isAdmin: userData.isAdmin,
                  displayName: userData.displayName || firebaseUser.displayName,
                  photoURL: userData.photoURL || firebaseUser.photoURL,
                });
              } else {
                // Sign out non-admin users
                await signOut(auth);
                setUser(null);
                router.push("/");
              }
            } else {
              // User document doesn't exist, sign them out
              await signOut(auth);
              setUser(null);
              router.push("/");
            }
          } catch (error) {
            console.error("Error fetching user data:", error);
            await signOut(auth);
            setUser(null);
            router.push("/");
          }
        } else {
          setUser(null);
        }

        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [router]);

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      router.push("/");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const value = {
    user,
    loading,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
