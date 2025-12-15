// src/lib/tabSessionManager.ts
// Production-grade multi-tab session management using BroadcastChannel API
// Only triggers logout when the LAST tab is closed

const CHANNEL_NAME = "nar24_tab_session";
const TAB_COUNT_KEY = "nar24_tab_count";
const TAB_ID_KEY = "nar24_tab_id";
const SESSION_VALID_KEY = "nar24_session_valid";

type MessageType =
  | { type: "TAB_OPENED"; tabId: string }
  | { type: "TAB_CLOSED"; tabId: string }
  | { type: "TAB_COUNT_REQUEST"; tabId: string }
  | { type: "TAB_COUNT_RESPONSE"; tabId: string; count: number }
  | { type: "LOGOUT_ALL"; reason: string }
  | { type: "SESSION_INVALIDATED" };

interface TabSessionManagerConfig {
  onLastTabClosed?: () => void;
  onLogoutBroadcast?: (reason: string) => void;
}

class TabSessionManager {
  private channel: BroadcastChannel | null = null;
  private tabId: string;
  private isInitialized = false;
  private onLastTabClosed?: () => void;
  private onLogoutBroadcast?: (reason: string) => void;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private registeredTabs: Set<string> = new Set();

  constructor() {
    this.tabId = this.generateTabId();
  }

  private generateTabId(): string {
    return `tab_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Initialize the tab session manager
   * Call this once when the app loads
   */
  initialize(config: TabSessionManagerConfig = {}): void {
    if (this.isInitialized) return;
    if (typeof window === "undefined") return;

    this.onLastTabClosed = config.onLastTabClosed;
    this.onLogoutBroadcast = config.onLogoutBroadcast;

    // Create BroadcastChannel for cross-tab communication
    try {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = this.handleMessage.bind(this);
    } catch {
      // BroadcastChannel not supported, fallback to storage events
      console.warn("BroadcastChannel not supported, using storage events fallback");
      window.addEventListener("storage", this.handleStorageEvent.bind(this));
    }

    // Store this tab's ID
    try {
      sessionStorage.setItem(TAB_ID_KEY, this.tabId);
    } catch {
      // sessionStorage might not be available
    }

    // Register this tab
    this.registerTab();

    // Listen for beforeunload to handle tab close
    window.addEventListener("beforeunload", this.handleTabClose.bind(this));

    // Handle visibility changes (tab might be hidden but not closed)
    document.addEventListener("visibilitychange", this.handleVisibilityChange.bind(this));

    // Start heartbeat to maintain tab presence
    this.startHeartbeat();

    this.isInitialized = true;
  }

  /**
   * Handle incoming messages from other tabs
   */
  private handleMessage(event: MessageEvent<MessageType>): void {
    const message = event.data;

    switch (message.type) {
      case "TAB_OPENED":
        this.registeredTabs.add(message.tabId);
        this.updateTabCount();
        break;

      case "TAB_CLOSED":
        this.registeredTabs.delete(message.tabId);
        this.updateTabCount();
        break;

      case "TAB_COUNT_REQUEST":
        // Respond with our presence
        this.broadcastMessage({
          type: "TAB_COUNT_RESPONSE",
          tabId: this.tabId,
          count: this.registeredTabs.size,
        });
        break;

      case "TAB_COUNT_RESPONSE":
        this.registeredTabs.add(message.tabId);
        break;

      case "LOGOUT_ALL":
        // Another tab triggered logout, propagate to this tab
        this.onLogoutBroadcast?.(message.reason);
        break;

      case "SESSION_INVALIDATED":
        // Session was invalidated in another tab
        this.markSessionInvalid();
        break;
    }
  }

  /**
   * Fallback for browsers without BroadcastChannel support
   */
  private handleStorageEvent(event: StorageEvent): void {
    if (event.key === TAB_COUNT_KEY) {
      // Tab count changed in another tab
      const newCount = parseInt(event.newValue || "0", 10);
      if (newCount === 0) {
        this.onLastTabClosed?.();
      }
    }

    if (event.key === SESSION_VALID_KEY && event.newValue === "false") {
      this.onLogoutBroadcast?.("session_invalidated");
    }
  }

  /**
   * Handle visibility changes
   */
  private handleVisibilityChange(): void {
    if (document.visibilityState === "visible") {
      // Tab became visible, re-register
      this.registerTab();
    }
  }

  /**
   * Register this tab in the system
   * Note: Does NOT mark session as valid - that should only happen on explicit login
   */
  private registerTab(): void {
    this.registeredTabs.add(this.tabId);
    this.updateTabCount();

    // Broadcast that this tab opened
    this.broadcastMessage({ type: "TAB_OPENED", tabId: this.tabId });

    // Request count from other tabs
    this.broadcastMessage({ type: "TAB_COUNT_REQUEST", tabId: this.tabId });

    // DO NOT mark session as valid here!
    // Session validity should only be set during explicit login
    // This allows isFreshBrowserSession() to correctly detect when all tabs were closed
  }

  /**
   * Handle tab close
   */
  private handleTabClose(): void {
    // Broadcast that this tab is closing
    this.broadcastMessage({ type: "TAB_CLOSED", tabId: this.tabId });

    // Remove from registered tabs
    this.registeredTabs.delete(this.tabId);

    // Update tab count
    const currentCount = this.getTabCount();
    const newCount = Math.max(0, currentCount - 1);

    try {
      if (newCount === 0) {
        // This is the last tab - mark session for invalidation
        // Note: We can't do async operations in beforeunload reliably
        // So we set a flag that will be checked on next load
        localStorage.setItem(SESSION_VALID_KEY, "false");
        localStorage.setItem(TAB_COUNT_KEY, "0");
      } else {
        localStorage.setItem(TAB_COUNT_KEY, newCount.toString());
      }
    } catch {
      // Storage might not be available
    }

    // Stop heartbeat
    this.stopHeartbeat();
  }

  /**
   * Start heartbeat to maintain tab presence
   */
  private startHeartbeat(): void {
    // Update tab count periodically to handle crashed tabs
    this.heartbeatInterval = setInterval(() => {
      this.updateTabCount();
      // Request count from other tabs to verify
      this.broadcastMessage({ type: "TAB_COUNT_REQUEST", tabId: this.tabId });
    }, 5000); // Every 5 seconds
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Update tab count in localStorage
   */
  private updateTabCount(): void {
    try {
      const count = Math.max(1, this.registeredTabs.size);
      localStorage.setItem(TAB_COUNT_KEY, count.toString());
    } catch {
      // Storage might not be available
    }
  }

  /**
   * Broadcast a message to all tabs
   */
  private broadcastMessage(message: MessageType): void {
    if (this.channel) {
      try {
        this.channel.postMessage(message);
      } catch {
        // Channel might be closed
      }
    }
  }

  /**
   * Get current tab count
   */
  getTabCount(): number {
    try {
      const count = localStorage.getItem(TAB_COUNT_KEY);
      return count ? parseInt(count, 10) : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Check if session is valid
   * Returns null if no session data exists (first time user)
   */
  isSessionValid(): boolean | null {
    try {
      const valid = localStorage.getItem(SESSION_VALID_KEY);
      // If no value, return null to indicate no session data exists
      if (valid === null) return null;
      return valid === "true";
    } catch {
      return null;
    }
  }

  /**
   * Mark session as valid (called on successful login)
   */
  markSessionValid(): void {
    try {
      localStorage.setItem(SESSION_VALID_KEY, "true");
    } catch {
      // Storage might not be available
    }
  }

  /**
   * Mark session as invalid (called on logout)
   */
  markSessionInvalid(): void {
    try {
      localStorage.setItem(SESSION_VALID_KEY, "false");
    } catch {
      // Storage might not be available
    }
  }

  /**
   * Broadcast logout to all tabs
   */
  broadcastLogout(reason: string): void {
    this.markSessionInvalid();
    this.broadcastMessage({ type: "LOGOUT_ALL", reason });
  }

  /**
   * Check if this appears to be a fresh browser session
   * (all tabs were closed and user is returning)
   *
   * Returns true ONLY if:
   * - Session was explicitly marked as invalid (user logged out or last tab was closed)
   *
   * Returns false if:
   * - No session data exists (first time user - let them login)
   * - Session is marked as valid
   */
  isFreshBrowserSession(): boolean {
    const sessionValid = this.isSessionValid();

    // If no session data exists (null), this is a first-time user
    // They haven't logged in before, so this is NOT a "fresh browser session" that needs logout
    if (sessionValid === null) {
      return false;
    }

    // If session is explicitly marked as invalid, user closed all tabs
    // and should be logged out
    if (sessionValid === false) {
      return true;
    }

    // Session is valid
    return false;
  }

  /**
   * Reset session state (called on explicit login)
   */
  resetSession(): void {
    this.markSessionValid();
    this.registeredTabs.clear();
    this.registeredTabs.add(this.tabId);
    this.updateTabCount();
  }

  /**
   * Cleanup when component unmounts
   */
  destroy(): void {
    this.stopHeartbeat();

    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }

    window.removeEventListener("beforeunload", this.handleTabClose.bind(this));
    document.removeEventListener("visibilitychange", this.handleVisibilityChange.bind(this));

    this.isInitialized = false;
  }

  /**
   * Get this tab's ID
   */
  getTabId(): string {
    return this.tabId;
  }
}

// Export singleton instance
export const tabSessionManager = new TabSessionManager();

// Export helper functions for convenience
export function initializeTabSession(config: TabSessionManagerConfig = {}): void {
  tabSessionManager.initialize(config);
}

export function isSessionValid(): boolean | null {
  return tabSessionManager.isSessionValid();
}

export function isFreshBrowserSession(): boolean {
  return tabSessionManager.isFreshBrowserSession();
}

export function markSessionValid(): void {
  tabSessionManager.markSessionValid();
}

export function markSessionInvalid(): void {
  tabSessionManager.markSessionInvalid();
}

export function broadcastLogout(reason: string): void {
  tabSessionManager.broadcastLogout(reason);
}

export function resetTabSession(): void {
  tabSessionManager.resetSession();
}

export function getTabCount(): number {
  return tabSessionManager.getTabCount();
}
