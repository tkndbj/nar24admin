// src/hooks/useIdleTimeout.ts
// Tracks user activity and triggers logout after period of inactivity

import { useEffect, useRef, useCallback, useState } from "react";

export interface IdleTimeoutConfig {
  /** Timeout duration in milliseconds (default: 30 minutes) */
  timeout: number;
  /** Warning duration before logout in milliseconds (default: 2 minutes) */
  warningDuration: number;
  /** Callback when user becomes idle (warning phase) */
  onWarning?: () => void;
  /** Callback when timeout expires (logout) */
  onTimeout: () => void;
  /** Callback when user activity resets the timer */
  onActive?: () => void;
  /** Whether the timeout is enabled */
  enabled: boolean;
}

export interface IdleTimeoutState {
  /** Whether the user is in the warning phase */
  isWarning: boolean;
  /** Seconds remaining until logout (only during warning phase) */
  remainingSeconds: number;
  /** Reset the idle timer manually */
  resetTimer: () => void;
}

const ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "scroll",
  "touchstart",
  "click",
  "wheel",
] as const;

// Storage key for last activity timestamp (for cross-tab sync)
const LAST_ACTIVITY_KEY = "nar24_last_activity";
// Session marker key - uses sessionStorage which is cleared on browser/tab close
const SESSION_MARKER_KEY = "nar24_session_active";

export function useIdleTimeout({
  timeout,
  warningDuration,
  onWarning,
  onTimeout,
  onActive,
  enabled,
}: IdleTimeoutConfig): IdleTimeoutState {
  const [isWarning, setIsWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  // Clear all timers
  const clearAllTimers = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  // Start the countdown during warning phase
  const startCountdown = useCallback((seconds: number) => {
    setRemainingSeconds(seconds);

    countdownRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Reset the idle timer
  const resetTimer = useCallback(() => {
    if (!enabled) return;

    clearAllTimers();
    setIsWarning(false);
    setRemainingSeconds(0);

    const now = Date.now();
    lastActivityRef.current = now;

    // Store in localStorage for cross-tab sync and update session marker
    try {
      localStorage.setItem(LAST_ACTIVITY_KEY, now.toString());
      sessionStorage.setItem(SESSION_MARKER_KEY, "true");
    } catch {
      // Storage might not be available
    }

    // Set warning timer (fires before the full timeout)
    const warningTime = timeout - warningDuration;
    if (warningTime > 0) {
      warningTimeoutRef.current = setTimeout(() => {
        setIsWarning(true);
        onWarning?.();
        startCountdown(Math.floor(warningDuration / 1000));

        // Set final timeout
        timeoutRef.current = setTimeout(() => {
          onTimeout();
        }, warningDuration);
      }, warningTime);
    } else {
      // If warning duration >= timeout, just set the timeout directly
      timeoutRef.current = setTimeout(() => {
        onTimeout();
      }, timeout);
    }

    onActive?.();
  }, [enabled, timeout, warningDuration, onWarning, onTimeout, onActive, clearAllTimers, startCountdown]);

  // Handle user activity
  const handleActivity = useCallback(() => {
    // Throttle activity handling to avoid excessive resets
    const now = Date.now();
    if (now - lastActivityRef.current < 1000) {
      return; // Ignore if less than 1 second since last activity
    }

    resetTimer();
  }, [resetTimer]);

  // Check for activity in other tabs
  const handleStorageChange = useCallback((event: StorageEvent) => {
    if (event.key === LAST_ACTIVITY_KEY && event.newValue) {
      const otherTabActivity = parseInt(event.newValue, 10);
      if (otherTabActivity > lastActivityRef.current) {
        // Another tab had more recent activity, reset our timer
        resetTimer();
      }
    }
  }, [resetTimer]);

  // Check if session expired on mount (e.g., user navigated directly to URL)
  const checkInitialState = useCallback(() => {
    try {
      const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
      if (lastActivity) {
        const lastActivityTime = parseInt(lastActivity, 10);
        const elapsed = Date.now() - lastActivityTime;

        if (elapsed >= timeout) {
          // Session already expired, trigger timeout immediately
          onTimeout();
          return false;
        }
      }
    } catch {
      // localStorage might not be available
    }
    return true;
  }, [timeout, onTimeout]);

  // Set up event listeners and timers
  useEffect(() => {
    if (!enabled) {
      clearAllTimers();
      return;
    }

    // Check if session already expired
    if (!checkInitialState()) {
      return;
    }

    // Add activity listeners
    ACTIVITY_EVENTS.forEach((event) => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Listen for activity in other tabs
    window.addEventListener("storage", handleStorageChange);

    // Start the initial timer
    resetTimer();

    // Cleanup
    return () => {
      ACTIVITY_EVENTS.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });
      window.removeEventListener("storage", handleStorageChange);
      clearAllTimers();
    };
  }, [enabled, handleActivity, handleStorageChange, resetTimer, clearAllTimers, checkInitialState]);

  return {
    isWarning,
    remainingSeconds,
    resetTimer,
  };
}

// Helper to clear last activity on logout
export function clearLastActivity(): void {
  try {
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    sessionStorage.removeItem(SESSION_MARKER_KEY);
  } catch {
    // Storage might not be available
  }
}

// Helper to update last activity (called on successful login)
export function updateLastActivity(): void {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
    // Set session marker - this gets cleared automatically when browser/tab closes
    sessionStorage.setItem(SESSION_MARKER_KEY, "true");
  } catch {
    // Storage might not be available
  }
}

// Helper to get last activity timestamp
export function getLastActivity(): number | null {
  try {
    const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (lastActivity) {
      return parseInt(lastActivity, 10);
    }
  } catch {
    // localStorage might not be available
  }
  return null;
}

// Helper to check if session marker exists (indicates browser session is still active)
export function hasActiveSessionMarker(): boolean {
  try {
    return sessionStorage.getItem(SESSION_MARKER_KEY) === "true";
  } catch {
    // sessionStorage might not be available
    return false;
  }
}

/**
 * Check if the session has expired based on:
 * 1. Browser/tab close - sessionStorage marker is cleared automatically
 * 2. Inactivity timeout - more than 30 minutes since last activity
 *
 * @param timeoutMs - The timeout duration in milliseconds
 * @returns true if session has expired, false otherwise
 */
export function isSessionExpiredByInactivity(timeoutMs: number = DEFAULT_IDLE_TIMEOUT): boolean {
  // Check 1: Session marker must exist (cleared on browser/tab close)
  if (!hasActiveSessionMarker()) {
    // No session marker = browser/tab was closed = session expired
    return true;
  }

  // Check 2: Inactivity timeout
  const lastActivity = getLastActivity();

  if (lastActivity === null) {
    // Session marker exists but no activity timestamp - shouldn't happen
    // Treat as expired for safety
    return true;
  }

  const elapsed = Date.now() - lastActivity;
  return elapsed >= timeoutMs;
}

// Default configuration
export const DEFAULT_IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes
export const DEFAULT_WARNING_DURATION = 2 * 60 * 1000; // 2 minutes warning
