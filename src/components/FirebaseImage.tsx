"use client";

import { useState, useEffect } from "react";
import { ref, getDownloadURL, getStorage } from "firebase/storage";
import { Loader2, ImageOff } from "lucide-react";

interface FirebaseImageProps {
  src: string;
  alt: string;
  fill?: boolean;
  className?: string;
  onClick?: () => void;
}

/**
 * A custom image component that fetches Firebase Storage images
 * through the SDK (with App Check tokens) and displays them as blob URLs.
 */
export default function FirebaseImage({
  src,
  alt,
  fill = false,
  className = "",
  onClick,
}: FirebaseImageProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function fetchImage() {
      if (!src) {
        setLoading(false);
        setError(true);
        return;
      }

      try {
        setLoading(true);
        setError(false);

        // If it's already a blob URL or data URL, use it directly
        if (src.startsWith("blob:") || src.startsWith("data:")) {
          setBlobUrl(src);
          setLoading(false);
          return;
        }

        // Extract the storage path from the Firebase Storage URL
        // URL format: https://firebasestorage.googleapis.com/v0/b/BUCKET/o/PATH?alt=media...
        let storagePath: string | null = null;

        if (src.includes("firebasestorage.googleapis.com")) {
          const match = src.match(/\/o\/(.+?)(\?|$)/);
          if (match) {
            storagePath = decodeURIComponent(match[1]);
          }
        }

        if (!storagePath) {
          // Not a Firebase Storage URL, try loading directly
          setBlobUrl(src);
          setLoading(false);
          return;
        }

        // Get a fresh download URL with token using Firebase SDK
        const storage = getStorage();
        const storageRef = ref(storage, storagePath);
        const downloadUrl = await getDownloadURL(storageRef);

        // Fetch the image as a blob
        const response = await fetch(downloadUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);

        if (isMounted) {
          setBlobUrl(objectUrl);
          setLoading(false);
        }
      } catch (err) {
        console.error("FirebaseImage fetch error:", err);
        if (isMounted) {
          setError(true);
          setLoading(false);
        }
      }
    }

    fetchImage();

    return () => {
      isMounted = false;
      // Clean up blob URL when component unmounts
      if (blobUrl && blobUrl.startsWith("blob:")) {
        URL.revokeObjectURL(blobUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // Clean up old blob URL when src changes
  useEffect(() => {
    return () => {
      if (blobUrl && blobUrl.startsWith("blob:")) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  if (loading) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-100 ${
          fill ? "absolute inset-0" : ""
        } ${className}`}
      >
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-100 ${
          fill ? "absolute inset-0" : ""
        } ${className}`}
      >
        <ImageOff className="w-6 h-6 text-gray-400" />
      </div>
    );
  }

  return (
    <img
      src={blobUrl}
      alt={alt}
      className={`${fill ? "absolute inset-0 w-full h-full" : ""} ${className}`}
      onClick={onClick}
    />
  );
}
