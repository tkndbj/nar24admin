// utils/imageCompression.ts
//
// Marketplace-grade image compression.
//
// Design principles:
// ─ Never upscale  — scale is capped at 1.0 so small images are untouched
// ─ Never bloat    — if the compressed blob ≥ original, the original is returned
// ─ Never reject   — always resolves; falls back to the original file on any error
// ─ PNG-aware      — transparent PNGs stay PNG; everything else → JPEG
// ─ Memory-safe    — object URLs are always revoked in both success and error paths


// ── Marketplace constants ────────────────────────────────────────────────────
//
// Product gallery : max 1500 px · quality 85 → target ~200–400 KB JPEG
//   1500 px covers a 750 px UI slot at 2× DPI — crisp on retina without
//   serving unnecessarily large files.
//
// Color variant   : max  800 px · quality 82 → target  ~80–150 KB JPEG
//   Shown at smaller sizes; smaller file is appropriate.
//
// Skip threshold  : 200 KB — already well-optimised, skip recompression.
//   Matches the Flutter constant so both platforms behave identically.

const PRODUCT_MAX_DIMENSION = 1500;
const COLOR_MAX_DIMENSION   = 800;
const PRODUCT_QUALITY       = 0.85;
const COLOR_QUALITY         = 0.82;
const SKIP_THRESHOLD_BYTES  = 200 * 1024; // 200 KB


// ── Types ────────────────────────────────────────────────────────────────────

export type CompressionUseCase = 'gallery' | 'color' | 'thumbnail';

export interface CompressionResult {
  /** The compressed file, or the original when skipped or on error. */
  compressedFile: File;
  originalSize: number;
  compressedSize: number;
  /** Percentage of original size saved. 0 when the file was returned unchanged. */
  compressionRatio: number;
  /** True when the file was returned unchanged (too small / error / blob larger). */
  skipped: boolean;
}


// ── Primary API ──────────────────────────────────────────────────────────────

/**
 * Compress a single image for marketplace product listings.
 *
 * Always resolves — never rejects.
 * Falls back silently to the original file on canvas failure or any error.
 *
 * @param file     The image File to compress.
 * @param useCase  'gallery' (default) | 'color' | 'thumbnail'
 */
export const smartCompress = (
  file: File,
  useCase: CompressionUseCase = 'gallery',
): Promise<CompressionResult> => {
  const originalSize = file.size;

  // Skip: already small enough — no meaningful gain from compression.
  if (originalSize < SKIP_THRESHOLD_BYTES) {
    return Promise.resolve(_unchanged(file));
  }

  // Resolve target dimensions and quality for this use-case.
  let maxDimension: number;
  let quality: number;

  switch (useCase) {
    case 'color':
      maxDimension = COLOR_MAX_DIMENSION;
      quality      = COLOR_QUALITY;
      break;
    case 'thumbnail':
      maxDimension = 400;
      quality      = 0.80;
      break;
    case 'gallery':
    default:
      maxDimension = PRODUCT_MAX_DIMENSION;
      quality      = PRODUCT_QUALITY;
  }

  // Preserve PNG transparency; everything else → JPEG.
  const isPng         = file.type === 'image/png';
  const outputFormat  = isPng ? 'image/png' as const : 'image/jpeg' as const;

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img       = new Image();

    // Always revoke the object URL — in both success and error paths.
    const cleanup = () => URL.revokeObjectURL(objectUrl);

    img.onerror = () => {
      cleanup();
      console.error(`[imageCompression] Failed to load image: ${file.name}`);
      resolve(_unchanged(file));
    };

    img.onload = () => {
      cleanup();

      try {
        // Calculate scale factor.
        // Math.min(..., 1.0) ensures we never upscale an image that is
        // already smaller than the dimension cap.
        const scale = Math.min(
          maxDimension / img.naturalWidth,
          maxDimension / img.naturalHeight,
          1.0,
        );

        const targetWidth  = Math.round(img.naturalWidth  * scale);
        const targetHeight = Math.round(img.naturalHeight * scale);

        const canvas = document.createElement('canvas');
        canvas.width  = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          console.error('[imageCompression] Canvas 2D context unavailable');
          resolve(_unchanged(file));
          return;
        }

        // High-quality downscaling.
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(_unchanged(file));
              return;
            }

            // Safety: if the compressed blob is somehow larger than the
            // input (can happen with already-compressed low-res files),
            // return the original unchanged.
            if (blob.size >= originalSize) {
              resolve(_unchanged(file));
              return;
            }

            const compressedFile = new File([blob], file.name, {
              type:         outputFormat,
              lastModified: Date.now(),
            });

            const compressionRatio =
              ((originalSize - blob.size) / originalSize) * 100;

            console.log(
              `🖼  [${useCase}] ${formatFileSize(originalSize)} → ` +
              `${formatFileSize(blob.size)} ` +
              `(-${compressionRatio.toFixed(1)}%)  ` +
              `[${img.naturalWidth}×${img.naturalHeight} → ` +
              `${targetWidth}×${targetHeight}]`,
            );

            resolve({
              compressedFile,
              originalSize,
              compressedSize:  blob.size,
              compressionRatio,
              skipped:         false,
            });
          },
          outputFormat,
          quality,
        );
      } catch (err) {
        console.error('[imageCompression] Compression error:', err);
        resolve(_unchanged(file));
      }
    };

    img.src = objectUrl;
  });
};

/**
 * Returns true when the file is large enough to benefit from compression.
 *
 * @param file        The file to check.
 * @param thresholdKB Minimum size in KB before compression is applied.
 *                    Default 200 KB matches the Flutter constant.
 */
export const shouldCompress = (
  file: File,
  thresholdKB = 200,
): boolean => file.size > thresholdKB * 1024;

/**
 * Human-readable file size string.
 * e.g. 1536 → "1.5 KB",  2097152 → "2.0 MB"
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k     = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i     = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};


// ── Internal helpers ─────────────────────────────────────────────────────────

/** Returns a CompressionResult that wraps the original file unchanged. */
const _unchanged = (file: File): CompressionResult => ({
  compressedFile:   file,
  originalSize:     file.size,
  compressedSize:   file.size,
  compressionRatio: 0,
  skipped:          true,
});