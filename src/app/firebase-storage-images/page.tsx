"use client";

import { useState, useEffect, useCallback } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { authenticatedFetch } from "@/lib/api";
import {
  ArrowLeft,
  Trash2,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  ChevronRight,
  HardDrive,
  RefreshCw,
  X,
  AlertTriangle,
  Home,
} from "lucide-react";
import { useRouter } from "next/navigation";

interface StorageFile {
  name: string;
  size: number;
  contentType: string;
  updated: string;
  downloadUrl: string;
}

interface StorageResponse {
  success: boolean;
  files: StorageFile[];
  folders: string[];
  nextPageToken: string | null;
  currentPrefix: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFileName(fullPath: string): string {
  const parts = fullPath.split("/");
  return parts[parts.length - 1] || fullPath;
}

function getFolderDisplayName(folderPath: string): string {
  // Remove trailing slash and get last segment
  const clean = folderPath.replace(/\/$/, "");
  const parts = clean.split("/");
  return parts[parts.length - 1] || folderPath;
}

export default function FirebaseStorageImagesPage() {
  const router = useRouter();
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentPrefix, setCurrentPrefix] = useState("");
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<StorageFile | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Preview state
  const [previewImage, setPreviewImage] = useState<StorageFile | null>(null);

  // Stats
  const [totalSize, setTotalSize] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);

  const fetchFiles = useCallback(
    async (prefix: string, pageToken?: string) => {
      try {
        if (pageToken) {
          setLoadingMore(true);
        } else {
          setLoading(true);
          setFiles([]);
          setFolders([]);
          setTotalSize(0);
          setTotalFiles(0);
        }
        setError(null);

        const params = new URLSearchParams();
        if (prefix) params.set("prefix", prefix);
        params.set("pageSize", "30");
        if (pageToken) params.set("pageToken", pageToken);

        const data = await authenticatedFetch<StorageResponse>(
          `/api/storage?${params.toString()}`
        );

        if (data.success) {
          if (pageToken) {
            setFiles((prev) => {
              const updated = [...prev, ...data.files];
              setTotalSize(updated.reduce((sum, f) => sum + f.size, 0));
              setTotalFiles(updated.length);
              return updated;
            });
          } else {
            setFiles(data.files);
            setTotalSize(data.files.reduce((sum, f) => sum + f.size, 0));
            setTotalFiles(data.files.length);
          }
          setFolders(data.folders);
          setNextPageToken(data.nextPageToken);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load files"
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchFiles(currentPrefix);
  }, [currentPrefix, fetchFiles]);

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      await authenticatedFetch("/api/storage", {
        method: "DELETE",
        body: JSON.stringify({ filePath: deleteTarget.name }),
      });

      // Remove from list
      setFiles((prev) => {
        const updated = prev.filter((f) => f.name !== deleteTarget.name);
        setTotalSize(updated.reduce((sum, f) => sum + f.size, 0));
        setTotalFiles(updated.length);
        return updated;
      });
      setDeleteTarget(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete file"
      );
    } finally {
      setDeleting(false);
    }
  };

  const navigateToFolder = (folder: string) => {
    setCurrentPrefix(folder);
    setNextPageToken(null);
  };

  const navigateUp = () => {
    if (!currentPrefix) return;
    const parts = currentPrefix.replace(/\/$/, "").split("/");
    parts.pop();
    const newPrefix = parts.length > 0 ? parts.join("/") + "/" : "";
    setCurrentPrefix(newPrefix);
    setNextPageToken(null);
  };

  const breadcrumbs = currentPrefix
    ? currentPrefix
        .replace(/\/$/, "")
        .split("/")
        .map((part, index, arr) => ({
          label: part,
          path: arr.slice(0, index + 1).join("/") + "/",
        }))
    : [];

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push("/dashboard")}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-gray-600" />
                </button>
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-amber-50 rounded-lg">
                    <HardDrive className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h1 className="text-lg font-semibold text-gray-900">
                      Firebase Storage
                    </h1>
                    <p className="text-xs text-gray-500">
                      {totalFiles} gorsel &bull; {formatBytes(totalSize)}
                    </p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => fetchFiles(currentPrefix)}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                />
                Yenile
              </button>
            </div>

            {/* Breadcrumbs */}
            <div className="flex items-center gap-1 mt-2 text-sm overflow-x-auto">
              <button
                onClick={() => {
                  setCurrentPrefix("");
                  setNextPageToken(null);
                }}
                className="flex items-center gap-1 px-2 py-1 hover:bg-gray-100 rounded text-gray-600 hover:text-gray-900 transition-colors shrink-0"
              >
                <Home className="w-3.5 h-3.5" />
                Root
              </button>
              {breadcrumbs.map((crumb, i) => (
                <div key={crumb.path} className="flex items-center gap-1 shrink-0">
                  <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                  <button
                    onClick={() => navigateToFolder(crumb.path)}
                    className={`px-2 py-1 rounded transition-colors ${
                      i === breadcrumbs.length - 1
                        ? "text-amber-700 font-medium bg-amber-50"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                  >
                    {crumb.label}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 py-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
              <button
                onClick={() => setError(null)}
                className="ml-auto p-1 hover:bg-red-100 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
            </div>
          ) : (
            <>
              {/* Folders */}
              {folders.length > 0 && (
                <div className="mb-4">
                  <h2 className="text-sm font-medium text-gray-500 mb-2">
                    Klasorler
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {currentPrefix && (
                      <button
                        onClick={navigateUp}
                        className="flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors text-left"
                      >
                        <ArrowLeft className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-600 truncate">
                          ..
                        </span>
                      </button>
                    )}
                    {folders.map((folder) => (
                      <button
                        key={folder}
                        onClick={() => navigateToFolder(folder)}
                        className="flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-lg hover:bg-amber-50 hover:border-amber-200 transition-colors text-left"
                      >
                        <FolderOpen className="w-4 h-4 text-amber-500 shrink-0" />
                        <span className="text-sm text-gray-700 truncate">
                          {getFolderDisplayName(folder)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Images Grid */}
              {files.length > 0 ? (
                <>
                  <h2 className="text-sm font-medium text-gray-500 mb-2">
                    Gorseller ({totalFiles})
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {files.map((file) => (
                      <div
                        key={file.name}
                        className="group bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md hover:border-gray-300 transition-all"
                      >
                        {/* Image Preview */}
                        <div
                          className="relative aspect-square bg-gray-100 cursor-pointer"
                          onClick={() => setPreviewImage(file)}
                        >
                          <img
                            src={file.downloadUrl}
                            alt={getFileName(file.name)}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          {/* Delete Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(file);
                            }}
                            className="absolute top-1.5 right-1.5 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-sm"
                            title="Sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* File Info */}
                        <div className="p-2">
                          <p
                            className="text-xs font-medium text-gray-700 truncate"
                            title={file.name}
                          >
                            {getFileName(file.name)}
                          </p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[10px] text-gray-400">
                              {formatBytes(file.size)}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {formatDate(file.updated)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Load More */}
                  {nextPageToken && (
                    <div className="flex justify-center mt-6">
                      <button
                        onClick={() =>
                          fetchFiles(currentPrefix, nextPageToken)
                        }
                        disabled={loadingMore}
                        className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 text-sm font-medium"
                      >
                        {loadingMore ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Yukleniyor...
                          </>
                        ) : (
                          "Daha Fazla Yukle"
                        )}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                !loading &&
                folders.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                    <ImageIcon className="w-12 h-12 mb-3" />
                    <p className="text-sm">
                      Bu klasorde gorsel bulunamadi
                    </p>
                  </div>
                )
              )}
            </>
          )}
        </div>

        {/* Delete Confirmation Modal */}
        {deleteTarget && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => !deleting && setDeleteTarget(null)}
          >
            <div
              className="bg-white rounded-xl shadow-xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Gorseli Sil
                </h3>
              </div>

              <div className="mb-4">
                <div className="w-full h-32 bg-gray-100 rounded-lg overflow-hidden mb-3">
                  <img
                    src={deleteTarget.downloadUrl}
                    alt={getFileName(deleteTarget.name)}
                    className="w-full h-full object-contain"
                  />
                </div>
                <p className="text-sm text-gray-600 break-all">
                  <span className="font-medium">Dosya:</span>{" "}
                  {deleteTarget.name}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {formatBytes(deleteTarget.size)} &bull;{" "}
                  {deleteTarget.contentType}
                </p>
              </div>

              <p className="text-sm text-red-600 mb-4">
                Bu islem geri alinamaz. Gorsel Firebase Storage&apos;dan kalici olarak silinecektir.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  Iptal
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Siliniyor...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Evet, Sil
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Image Preview Modal */}
        {previewImage && (
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setPreviewImage(null)}
          >
            <div
              className="relative max-w-4xl max-h-[90vh] w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setPreviewImage(null)}
                className="absolute -top-10 right-0 p-2 text-white/80 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              <img
                src={previewImage.downloadUrl}
                alt={getFileName(previewImage.name)}
                className="w-full h-full object-contain rounded-lg"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4 rounded-b-lg">
                <p className="text-white text-sm font-medium truncate">
                  {previewImage.name}
                </p>
                <p className="text-white/70 text-xs mt-1">
                  {formatBytes(previewImage.size)} &bull;{" "}
                  {previewImage.contentType} &bull;{" "}
                  {formatDate(previewImage.updated)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
