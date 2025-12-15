'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getActivityLogService,
  logAdminActivity as serviceLogActivity,
} from '@/services/activityLogService';

interface UseActivityLogReturn {
  /**
   * Log an admin activity
   * @param activity - Description of the activity (e.g., "Clicked Orders button")
   * @param metadata - Optional additional data to store with the log
   */
  logActivity: (activity: string, metadata?: Record<string, unknown>) => void;

  /**
   * Force flush all pending logs to Firestore immediately
   */
  forceFlush: () => Promise<void>;

  /**
   * Check if the service is initialized and ready
   */
  isReady: boolean;
}

/**
 * React hook for admin activity logging
 *
 * Usage:
 * ```tsx
 * const { logActivity } = useActivityLog();
 *
 * const handleClick = () => {
 *   logActivity('Clicked Orders button');
 *   router.push('/orders');
 * };
 * ```
 *
 * Features:
 * - Automatically initializes with current user info
 * - Batches logs and writes to Firestore every 30 seconds
 * - Flushes logs when tab is hidden or window closes
 * - Provides type-safe activity logging
 */
export function useActivityLog(): UseActivityLogReturn {
  const { user } = useAuth();
  const isInitializedRef = useRef(false);

  // Initialize service when user is available
  useEffect(() => {
    if (user?.email && user?.displayName) {
      const service = getActivityLogService();
      service.initialize({
        displayName: user.displayName,
        email: user.email,
      });
      isInitializedRef.current = true;
    }

    // Cleanup on unmount
    return () => {
      // Note: We don't destroy the service on component unmount
      // because other components might still be using it.
      // The service handles cleanup via visibility/beforeunload events.
    };
  }, [user?.email, user?.displayName]);

  // Memoized log function
  const logActivity = useCallback(
    (activity: string, metadata?: Record<string, unknown>) => {
      if (!user?.email) {
        console.warn('[useActivityLog] User not authenticated, skipping log');
        return;
      }
      serviceLogActivity(activity, metadata);
    },
    [user?.email]
  );

  // Force flush function
  const forceFlush = useCallback(async () => {
    const service = getActivityLogService();
    await service.forceFlush();
  }, []);

  return {
    logActivity,
    forceFlush,
    isReady: isInitializedRef.current && !!user?.email,
  };
}

/**
 * Higher-order function to wrap click handlers with activity logging
 *
 * Usage:
 * ```tsx
 * const { logActivity } = useActivityLog();
 *
 * <button onClick={withActivityLog(logActivity, 'Clicked Submit', handleSubmit)}>
 *   Submit
 * </button>
 * ```
 */
export function withActivityLog<T extends (...args: unknown[]) => void>(
  logFn: (activity: string, metadata?: Record<string, unknown>) => void,
  activity: string,
  handler?: T,
  metadata?: Record<string, unknown>
): (...args: Parameters<T>) => void {
  return (...args: Parameters<T>) => {
    logFn(activity, metadata);
    handler?.(...args);
  };
}

/**
 * Create a pre-configured activity logger for a specific page/section
 *
 * Usage:
 * ```tsx
 * const { logActivity } = useActivityLog();
 * const logger = createPageLogger(logActivity, 'Dashboard');
 *
 * logger.click('Orders button'); // Logs: "Dashboard: Clicked Orders button"
 * logger.navigate('Orders'); // Logs: "Dashboard: Navigated to Orders"
 * logger.action('Refresh data'); // Logs: "Dashboard: Refresh data"
 * ```
 */
export function createPageLogger(
  logFn: (activity: string, metadata?: Record<string, unknown>) => void,
  pageName: string
) {
  return {
    click: (element: string, metadata?: Record<string, unknown>) => {
      logFn(`${pageName}: Clicked ${element}`, metadata);
    },
    navigate: (destination: string, metadata?: Record<string, unknown>) => {
      logFn(`${pageName}: Navigated to ${destination}`, metadata);
    },
    action: (action: string, metadata?: Record<string, unknown>) => {
      logFn(`${pageName}: ${action}`, metadata);
    },
    view: (item: string, metadata?: Record<string, unknown>) => {
      logFn(`${pageName}: Viewed ${item}`, metadata);
    },
    search: (query: string, metadata?: Record<string, unknown>) => {
      logFn(`${pageName}: Searched for "${query}"`, metadata);
    },
  };
}

export default useActivityLog;
