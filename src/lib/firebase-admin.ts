// src/lib/firebase-admin.ts
// Server-side Firebase Admin SDK initialization for secure token verification

import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getAuth, Auth } from "firebase-admin/auth";
import { getFirestore, Firestore } from "firebase-admin/firestore";

let adminApp: App | null = null;
let adminAuth: Auth | null = null;
let adminDb: Firestore | null = null;

function getPrivateKey(): string {
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error("FIREBASE_PRIVATE_KEY environment variable is not set");
  }

  // Handle different private key formats from environment variables
  privateKey = privateKey
    .replace(/\\n/g, "\n") // Replace literal \n with actual newlines
    .replace(/"/g, "") // Remove any quotes
    .trim();

  // Ensure proper formatting if newlines are missing
  if (!privateKey.includes("\n")) {
    privateKey = privateKey
      .replace("-----BEGIN PRIVATE KEY-----", "-----BEGIN PRIVATE KEY-----\n")
      .replace("-----END PRIVATE KEY-----", "\n-----END PRIVATE KEY-----");

    const keyBody = privateKey
      .split("\n")[1]
      .replace("-----END PRIVATE KEY-----", "");
    const formattedKeyBody = keyBody.match(/.{1,64}/g)?.join("\n") || keyBody;
    privateKey = `-----BEGIN PRIVATE KEY-----\n${formattedKeyBody}\n-----END PRIVATE KEY-----`;
  }

  return privateKey;
}

function initializeAdminApp(): App {
  if (adminApp) {
    return adminApp;
  }

  const existingApps = getApps();
  if (existingApps.length > 0) {
    adminApp = existingApps[0];
    return adminApp;
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  // Log which env vars are present (not their values for security)
  console.log("Firebase Admin init - checking env vars:", {
    hasClientEmail: !!clientEmail,
    hasProjectId: !!projectId,
    hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
  });

  if (!clientEmail) {
    throw new Error("FIREBASE_CLIENT_EMAIL environment variable is not set");
  }

  if (!projectId) {
    throw new Error("NEXT_PUBLIC_FIREBASE_PROJECT_ID environment variable is not set");
  }

  const privateKey = getPrivateKey();

  adminApp = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    projectId,
  });

  console.log("✅ Firebase Admin SDK initialized successfully");
  return adminApp;
}

export function getAdminAuth(): Auth {
  if (adminAuth) {
    return adminAuth;
  }

  const app = initializeAdminApp();
  adminAuth = getAuth(app);
  return adminAuth;
}

export function getAdminFirestore(): Firestore {
  if (adminDb) {
    return adminDb;
  }

  const app = initializeAdminApp();
  adminDb = getFirestore(app);
  return adminDb;
}

export { initializeAdminApp };
