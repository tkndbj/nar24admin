// src/lib/firebase.ts
import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  AppCheck,
} from "firebase/app-check";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID!,
};

// Avoid re-initializing
const app: FirebaseApp = !getApps().length
  ? initializeApp(firebaseConfig)
  : getApps()[0];

// Initialize App Check (client-side only)
let appCheck: AppCheck | null = null;

function initializeAppCheckInstance(): AppCheck | null {
  // Only initialize on client side
  if (typeof window === "undefined") {
    return null;
  }

  // Already initialized
  if (appCheck) {
    return appCheck;
  }

  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

  if (!siteKey) {
    console.warn(
      "App Check: NEXT_PUBLIC_RECAPTCHA_SITE_KEY is not set. App Check will not be initialized."
    );
    return null;
  }

  try {
    // Enable debug mode in development
    // To use debug mode, you need to register the debug token in Firebase Console
    if (process.env.NODE_ENV === "development") {
      // This enables debug tokens for local development
      // Register the debug token shown in browser console at:
      // Firebase Console > App Check > Apps > Manage debug tokens
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }

    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      // Optional: Set to true to allow auto-refresh of App Check tokens
      isTokenAutoRefreshEnabled: true,
    });

    console.log("✅ Firebase App Check initialized successfully");
    return appCheck;
  } catch (error) {
    console.error("Failed to initialize App Check:", error);
    return null;
  }
}

// Initialize App Check when this module loads on the client
if (typeof window !== "undefined") {
  initializeAppCheckInstance();
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "europe-west3");
export { appCheck, initializeAppCheckInstance };
