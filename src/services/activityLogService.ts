import { db, auth } from '@/app/lib/firebase';
import {
  collection,
  writeBatch,
  Timestamp,
  doc
} from 'firebase/firestore';

// Types
export interface ActivityLogEntry {
  time: Timestamp;
  displayName: string;
  email: string;
  activity: string;
  metadata?: Record<string, unknown>;
}

export interface AdminUser {
  displayName: string;
  email: string;
}

interface QueuedLog {
  activity: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// Configuration
const CONFIG = {
  COLLECTION_NAME: 'admin_activity_logs',
  BATCH_INTERVAL_MS: 30000, // 30 seconds
  MAX_BATCH_SIZE: 500, // Firestore limit is 500 operations per batch
  MAX_QUEUE_SIZE: 1000, // Prevent memory issues
  RETRY_ATTEMPTS: 2, // Reduced from 3 - fail faster
  RETRY_DELAY_MS: 1000,
} as const;

/**
 * Check if user is authenticated with Firebase
 */
function isUserAuthenticated(): boolean {
  return !!auth.currentUser;
}

/**
 * Production-grade Admin Activity Log Service
 *
 * Features:
 * - Batched writes every 30 seconds for optimal Firestore usage
 * - Automatic flush on tab visibility change or window close
 * - Memory-efficient queue with size limits
 * - Retry logic for failed writes
 * - Singleton pattern to prevent duplicate instances
 */
class ActivityLogService {
  private static instance: ActivityLogService | null = null;

  private queue: QueuedLog[] = [];
  private adminUser: AdminUser | null = null;
  private batchIntervalId: ReturnType<typeof setInterval> | null = null;
  private isInitialized = false;
  private isFlushing = false;
  private pendingFlush: Promise<void> | null = null;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): ActivityLogService {
    if (!ActivityLogService.instance) {
      ActivityLogService.instance = new ActivityLogService();
    }
    return ActivityLogService.instance;
  }

  /**
   * Initialize the service with admin user info
   * Sets up batch interval and event listeners
   */
  initialize(adminUser: AdminUser): void {
    if (this.isInitialized && this.adminUser?.email === adminUser.email) {
      return; // Already initialized for this user
    }

    this.adminUser = adminUser;
    this.isInitialized = true;

    // Clear any existing interval
    this.clearBatchInterval();

    // Start batch interval
    this.batchIntervalId = setInterval(() => {
      this.flushQueue();
    }, CONFIG.BATCH_INTERVAL_MS);

    // Set up event listeners for tab visibility and window close
    this.setupEventListeners();

    console.log('[ActivityLogService] Initialized for:', adminUser.email);
  }

  /**
   * Clean up the service
   */
  destroy(): void {
    // Flush remaining logs synchronously if possible
    this.flushQueueSync();

    this.clearBatchInterval();
    this.removeEventListeners();
    this.queue = [];
    this.adminUser = null;
    this.isInitialized = false;

    console.log('[ActivityLogService] Destroyed');
  }

  /**
   * Log an admin activity
   */
  logActivity(activity: string, metadata?: Record<string, unknown>): void {
    if (!this.isInitialized || !this.adminUser) {
      // Silently skip - service not ready
      return;
    }

    // Don't queue if user is not authenticated
    if (!isUserAuthenticated()) {
      return;
    }

    // Prevent queue from growing too large
    if (this.queue.length >= CONFIG.MAX_QUEUE_SIZE) {
      this.flushQueue();

      // If still full after flush attempt, drop oldest entries
      if (this.queue.length >= CONFIG.MAX_QUEUE_SIZE) {
        this.queue = this.queue.slice(-Math.floor(CONFIG.MAX_QUEUE_SIZE / 2));
      }
    }

    this.queue.push({
      activity,
      timestamp: Date.now(),
      metadata,
    });
  }

  /**
   * Get current queue length (for debugging/monitoring)
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Force flush the queue immediately
   */
  async forceFlush(): Promise<void> {
    await this.flushQueue();
  }

  // Private methods

  private setupEventListeners(): void {
    if (typeof window === 'undefined') return;

    // Handle tab visibility change
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    // Handle page unload/close
    window.addEventListener('beforeunload', this.handleBeforeUnload);

    // Handle page hide (more reliable on mobile)
    window.addEventListener('pagehide', this.handlePageHide);
  }

  private removeEventListeners(): void {
    if (typeof window === 'undefined') return;

    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    window.removeEventListener('pagehide', this.handlePageHide);
  }

  private handleVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') {
      // Tab is being hidden, flush immediately
      this.flushQueueSync();
    }
  };

  private handleBeforeUnload = (): void => {
    // Window is closing, flush synchronously
    this.flushQueueSync();
  };

  private handlePageHide = (event: PageTransitionEvent): void => {
    if (event.persisted) {
      // Page is being cached (bfcache), flush logs
      this.flushQueueSync();
    }
  };

  private clearBatchInterval(): void {
    if (this.batchIntervalId) {
      clearInterval(this.batchIntervalId);
      this.batchIntervalId = null;
    }
  }

  /**
   * Flush queue asynchronously with retry logic
   */
  private async flushQueue(): Promise<void> {
    if (this.queue.length === 0 || !this.adminUser || this.isFlushing) {
      return;
    }

    // If there's already a pending flush, wait for it
    if (this.pendingFlush) {
      await this.pendingFlush;
      return;
    }

    this.isFlushing = true;

    // Take current queue and clear it
    const logsToWrite = [...this.queue];
    this.queue = [];

    this.pendingFlush = this.writeLogsWithRetry(logsToWrite);

    try {
      await this.pendingFlush;
    } finally {
      this.isFlushing = false;
      this.pendingFlush = null;
    }
  }

  /**
   * Synchronous flush for reliability on page unload
   * Note: Since Firestore SDK doesn't support synchronous writes,
   * we trigger the async flush and clear the queue immediately
   */
  private flushQueueSync(): void {
    if (this.queue.length === 0 || !this.adminUser) {
      return;
    }

    // Don't try to flush if not authenticated
    if (!isUserAuthenticated()) {
      this.queue = []; // Clear queue to prevent memory buildup
      return;
    }

    // Capture current queue before clearing
    const logsToFlush = [...this.queue];

    // Clear queue immediately to prevent duplicate writes on subsequent calls
    this.queue = [];

    // Trigger async flush with captured logs
    // Note: This may not complete if the page unloads quickly,
    // but it's the best we can do with Firestore client SDK
    this.writeLogsWithRetry(logsToFlush).catch(() => {
      // Silently ignore - user may have logged out
    });
  }

  /**
   * Write logs to Firestore with retry logic
   */
  private async writeLogsWithRetry(logs: QueuedLog[], attempt = 1): Promise<void> {
    if (logs.length === 0 || !this.adminUser) return;

    // Check auth state before attempting to write
    if (!isUserAuthenticated()) {
      // User is not authenticated, discard logs silently
      // Don't re-queue as they'll just fail again
      return;
    }

    try {
      // Split into batches if necessary (Firestore limit is 500)
      const batches: QueuedLog[][] = [];
      for (let i = 0; i < logs.length; i += CONFIG.MAX_BATCH_SIZE) {
        batches.push(logs.slice(i, i + CONFIG.MAX_BATCH_SIZE));
      }

      // Write each batch
      for (const batchLogs of batches) {
        await this.writeBatch(batchLogs);
      }

      console.log(`[ActivityLogService] Successfully wrote ${logs.length} log(s)`);
    } catch (error) {
      // Check if this is a permission error - don't retry permission errors
      const isPermissionError = error instanceof Error &&
        (error.message.includes('permission') || error.message.includes('PERMISSION_DENIED'));

      if (isPermissionError) {
        // Permission error - user may have logged out, discard logs
        console.warn('[ActivityLogService] Permission denied, discarding logs');
        return;
      }

      if (attempt < CONFIG.RETRY_ATTEMPTS) {
        // Wait before retry with exponential backoff
        await this.delay(CONFIG.RETRY_DELAY_MS * Math.pow(2, attempt - 1));
        return this.writeLogsWithRetry(logs, attempt + 1);
      }

      // After all retries failed, discard logs to prevent infinite loop
      console.warn('[ActivityLogService] All retry attempts failed, discarding logs');
    }
  }

  /**
   * Write a batch of logs to Firestore
   */
  private async writeBatch(logs: QueuedLog[]): Promise<void> {
    const batch = writeBatch(db);
    const collectionRef = collection(db, CONFIG.COLLECTION_NAME);

    for (const log of logs) {
      const docRef = doc(collectionRef);
      const logEntry: ActivityLogEntry = {
        time: Timestamp.fromMillis(log.timestamp),
        displayName: this.adminUser!.displayName,
        email: this.adminUser!.email,
        activity: log.activity,
        ...(log.metadata && { metadata: log.metadata }),
      };
      batch.set(docRef, logEntry);
    }

    await batch.commit();
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance getter
export const getActivityLogService = (): ActivityLogService => {
  return ActivityLogService.getInstance();
};

// Export convenience function for logging
export const logAdminActivity = (
  activity: string,
  metadata?: Record<string, unknown>
): void => {
  getActivityLogService().logActivity(activity, metadata);
};
