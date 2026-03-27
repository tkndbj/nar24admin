// src/app/api/storage/route.ts
// API route for listing and deleting Firebase Storage files

import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/auth";
import { getAdminStorage } from "@/lib/firebase-admin";
import { apiRateLimiter } from "@/lib/rate-limit";

interface StorageFile {
  name: string;
  size: number;
  contentType: string;
  updated: string;
  downloadUrl: string;
}

// GET /api/storage?prefix=&pageSize=&pageToken=
export async function GET(request: NextRequest) {
  // Rate limit
  const rateLimitResult = await apiRateLimiter.check(request);
  if (!rateLimitResult.success) {
    return rateLimitResult.response;
  }

  // Auth check
  const authResult = await verifyAdminAuth(request);
  if (!authResult.success) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const prefix = searchParams.get("prefix") || "";
    const pageSize = Math.min(
      parseInt(searchParams.get("pageSize") || "30", 10),
      100
    );
    const pageToken = searchParams.get("pageToken") || undefined;

    const storage = getAdminStorage();
    const bucket = storage.bucket(
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!
    );

    // List files with pagination
    const [files, , apiResponse] = await bucket.getFiles({
      prefix: prefix || undefined,
      maxResults: pageSize,
      pageToken,
      autoPaginate: false,
    });

    // Get file metadata and generate signed URLs
    const storageFiles: StorageFile[] = await Promise.all(
      files
        .filter((file) => {
          // Skip "folder" placeholders (0-byte files ending with /)
          if (file.name.endsWith("/")) return false;
          // Only include image files
          const contentType =
            file.metadata.contentType || "";
          return contentType.startsWith("image/");
        })
        .map(async (file) => {
          // Generate a signed URL valid for 1 hour
          const [signedUrl] = await file.getSignedUrl({
            action: "read",
            expires: Date.now() + 60 * 60 * 1000, // 1 hour
          });

          return {
            name: file.name,
            size: parseInt(file.metadata.size as string, 10) || 0,
            contentType: (file.metadata.contentType as string) || "unknown",
            updated: (file.metadata.updated as string) || "",
            downloadUrl: signedUrl,
          };
        })
    );

    // Extract unique folder prefixes for navigation
    const folderSet = new Set<string>();
    files.forEach((file) => {
      const relativePath = prefix
        ? file.name.slice(prefix.length)
        : file.name;
      const slashIndex = relativePath.indexOf("/");
      if (slashIndex > 0) {
        const folder = prefix + relativePath.slice(0, slashIndex + 1);
        folderSet.add(folder);
      }
    });

    // Also list "directory" prefixes using delimiter
    const [, , prefixResponse] = await bucket.getFiles({
      prefix: prefix || undefined,
      delimiter: "/",
      autoPaginate: false,
    });

    const prefixes: string[] =
      (prefixResponse as Record<string, unknown>)?.prefixes as string[] || [];

    // Merge folders
    prefixes.forEach((p: string) => folderSet.add(p));

    const nextPageToken =
      (apiResponse as Record<string, unknown>)?.nextPageToken as string | null || null;

    return NextResponse.json({
      success: true,
      files: storageFiles,
      folders: Array.from(folderSet).sort(),
      nextPageToken,
      currentPrefix: prefix,
    });
  } catch (error) {
    console.error("Storage list error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to list storage files",
      },
      { status: 500 }
    );
  }
}

// DELETE /api/storage
export async function DELETE(request: NextRequest) {
  // Rate limit
  const rateLimitResult = await apiRateLimiter.check(request);
  if (!rateLimitResult.success) {
    return rateLimitResult.response;
  }

  // Auth check - only full admins can delete
  const authResult = await verifyAdminAuth(request);
  if (!authResult.success) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  try {
    const body = await request.json();
    const { filePath } = body;

    if (!filePath || typeof filePath !== "string") {
      return NextResponse.json(
        { error: "filePath is required" },
        { status: 400 }
      );
    }

    const storage = getAdminStorage();
    const bucket = storage.bucket(
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!
    );

    const file = bucket.file(filePath);

    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }

    // Delete the file
    await file.delete();

    console.log(
      `[Storage] File deleted by ${authResult.user.email}: ${filePath}`
    );

    return NextResponse.json({
      success: true,
      message: "File deleted successfully",
      deletedFile: filePath,
    });
  } catch (error) {
    console.error("Storage delete error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete file",
      },
      { status: 500 }
    );
  }
}
