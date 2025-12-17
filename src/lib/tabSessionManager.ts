// src/lib/tabSessionManager.ts
// Production-grade multi-tab session management
// Properly handles page refresh vs. tab close using sessionStorage

const CHANNEL_NAME = "nar24_tab_session";
const TAB_COUNT_KEY = "nar24_tab_count";
const SESSION_VALID_KEY = "nar24_session_valid";
const SESSION_TIMESTAMP_KEY = "nar24_session_timestamp";

// SessionStorage keys (persist during refresh, clear on tab close)
const TAB_ALIVE_KEY = "nar24_tab_alive";
const TAB_ID_SESSION_KEY = "nar24_tab_id";

// Grace period for detecting refresh vs close (in milliseconds)
const REFRESH_GRACE_PERIOD = 3000;

type MessageType =
  | { type: "TAB_OPENED"; tabId: string }
  | { type: "TAB_CLOSED"; tabId: string }
  | { type: "TAB_PING"; tabId: string }
  | { type: "TAB_PONG"; tabId: string }
  | { type: "LOGOUT_ALL"; reason: string }
  | { type: "SESSION_VALIDATED" };

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
  private activeTabs: Set<string> = new Set();
  private isUnloading = false;

  constructor() {
    this.tabId = this.getOrCreateTabId();
  }

  private getOrCreateTabId(): string {
    if (typeof window === "undefined") {
      return `tab_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    try {
      // Check if we have an existing tab ID in sessionStorage (survives refresh)
      const existingId = sessionStorage.getItem(TAB_ID_SESSION_KEY);
      if (existingId) {
        return existingId;
      }

      // Generate new ID for new tab
      const newId = `tab_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      sessionStorage.setItem(TAB_ID_SESSION_KEY, newId);
      return newId;
    } catch {
      return `tab_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
  }

  /**
   * Initialize the tab session manager
   */
  initialize(config: TabSessionManagerConfig = {}): void {
    if (this.isInitialized) return;
    if (typeof window === "undefined") return;

    this.onLastTabClosed = config.onLastTabClosed;
    this.onLogoutBroadcast = config.onLogoutBroadcast;

    // Mark this tab as alive in sessionStorage
    // This key will PERSIST through refresh but CLEAR on actual tab close
    this.markTabAlive();

    // Create BroadcastChannel for cross-tab communication
    try {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = this.handleMessage.bind(this);
    } catch {
      console.warn("BroadcastChannel not supported, using storage events fallback");
      window.addEventListener("storage", this.handleStorageEvent.bind(this));
    }

    // Register this tab
    this.registerTab();

    // Use pagehide instead of beforeunload - more reliable and has persisted property
    window.addEventListener("pagehide", this.handlePageHide.bind(this));

    // Also listen to beforeunload as backup
    window.addEventListener("beforeunload", this.handleBeforeUnload.bind(this));

    // Handle visibility changes
    document.addEventListener("visibilitychange", this.handleVisibilityChange.bind(this));

    // Start heartbeat
    this.startHeartbeat();

    this.isInitialized = true;
  }

  /**
   * Mark this tab as alive in sessionStorage
   */
  private markTabAlive(): void {
    try {
      sessionStorage.setItem(TAB_ALIVE_KEY, Date.now().toString());
    } catch {
      // sessionStorage might not be available
    }
  }

  /**
   * Check if this tab was alive before (i.e., this is a refresh)
   */
  private wasTabAlive(): boolean {
    try {
      return sessionStorage.getItem(TAB_ALIVE_KEY) !== null;
    } catch {
      return false;
    }
  }

  /**
   * Handle incoming messages from other tabs
   */
  private handleMessage(event: MessageEvent<MessageType>): void {
    const message = event.data;

    switch (message.type) {
      case "TAB_OPENED":
        this.activeTabs.add(message.tabId);
        this.updateTabCount();
        break;

      case "TAB_CLOSED":
        this.activeTabs.delete(message.tabId);
        this.updateTabCount();
        break;

      case "TAB_PING":
        // Respond to ping from other tabs
        this.broadcastMessage({ type: "TAB_PONG", tabId: this.tabId });
        break;

      case "TAB_PONG":
        // Another tab is alive
        this.activeTabs.add(message.tabId);
        break;

      case "LOGOUT_ALL":
        this.onLogoutBroadcast?.(message.reason);
        break;

      case "SESSION_VALIDATED":
        // Another tab validated the session
        break;
    }
  }

  /**
   * Fallback for browsers without BroadcastChannel support
   */
  private handleStorageEvent(event: StorageEvent): void {
    if (event.key === SESSION_VALID_KEY && event.newValue === "false") {
      // Check if this was set by us during unload
      if (!this.isUnloading) {
        this.onLogoutBroadcast?.("session_invalidated");
      }
    }
  }

  /**
   * Handle visibility changes
   */
  private handleVisibilityChange(): void {
    if (document.visibilityState === "visible") {
      // Tab became visible, ensure we're registered
      this.markTabAlive();
      this.activeTabs.add(this.tabId);
      this.broadcastMessage({ type: "TAB_OPENED", tabId: this.tabId });
      this.updateTabCount();
    }
  }

  /**
   * Handle pagehide event - fires when page is being unloaded
   */
  private handlePageHide(event: PageTransitionEvent): void {
    // If persisted is true, page is going into bfcache (back/forward cache)
    // This is NOT a tab close, just navigation
    if (event.persisted) {
      return;
    }

    this.handleUnload();
  }

  /**
   * Handle beforeunload event as backup
   */
  private handleBeforeUnload(): void {
    this.handleUnload();
  }

  /**
   * Common unload handling
   */
  private handleUnload(): void {
    if (this.isUnloading) return;
    this.isUnloading = true;

    // Broadcast that this tab is closing
    this.broadcastMessage({ type: "TAB_CLOSED", tabId: this.tabId });
    this.activeTabs.delete(this.tabId);

    // Check if sessionStorage marker exists
    // If it exists, this MIGHT be a refresh (we can't be 100% sure yet)
    // We'll store a timestamp and let the next page load decide
    const wasAlive = this.wasTabAlive();

    // Get current tab count from other tabs
    const otherTabs = this.activeTabs.size;

    try {
      if (otherTabs === 0) {
        // This might be the last tab
        // Store a close timestamp instead of immediately invalidating
        // The next load will check this timestamp
        localStorage.setItem(SESSION_TIMESTAMP_KEY, Date.now().toString());

        // Only invalidate if this wasn't marked as alive (i.e., not a refresh)
        // For refresh scenarios, sessionStorage will persist and we'll detect it on reload
        if (!wasAlive) {
          localStorage.setItem(SESSION_VALID_KEY, "false");
        }
        localStorage.setItem(TAB_COUNT_KEY, "0");
      } else {
        localStorage.setItem(TAB_COUNT_KEY, otherTabs.toString());
      }
    } catch {
      // Storage might not be available
    }

    this.stopHeartbeat();
  }

  /**
   * Register this tab in the system
   */
  private registerTab(): void {
    this.activeTabs.add(this.tabId);

    // Broadcast that this tab opened
    this.broadcastMessage({ type: "TAB_OPENED", tabId: this.tabId });

    // Ping other tabs to discover them
    this.broadcastMessage({ type: "TAB_PING", tabId: this.tabId });

    this.updateTabCount();
  }

  /**
   * Start heartbeat to maintain tab presence and discover other tabs
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      // Ping other tabs periodically
      this.broadcastMessage({ type: "TAB_PING", tabId: this.tabId });
      this.updateTabCount();
    }, 5000);
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
      const count = Math.max(1, this.activeTabs.size);
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
   */
  isSessionValid(): boolean | null {
    try {
      const valid = localStorage.getItem(SESSION_VALID_KEY);
      if (valid === null) return null;
      return valid === "true";
    } catch {
      return null;
    }
  }

  /**
   * Mark session as valid
   */
  markSessionValid(): void {
    try {
      localStorage.setItem(SESSION_VALID_KEY, "true");
      localStorage.removeItem(SESSION_TIMESTAMP_KEY);
      this.broadcastMessage({ type: "SESSION_VALIDATED" });
    } catch {
      // Storage might not be available
    }
  }

  /**
   * Mark session as invalid
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
   * (all tabs were closed and user is returning after grace period)
   *
   * Key insight: sessionStorage persists during refresh but clears on actual tab close
   */
  isFreshBrowserSession(): boolean {
    try {
      // If sessionStorage has our alive marker, this tab was just refreshed, not closed
      if (this.wasTabAlive()) {
        // This is a refresh - NOT a fresh session
        // Re-mark as alive and return false
        this.markTabAlive();
        return false;
      }

      // Check if session was explicitly invalidated
      const sessionValid = this.isSessionValid();

      // If no session data exists, this is a first-time user
      if (sessionValid === null) {
        return false;
      }

      // If session is explicitly valid, not a fresh session
      if (sessionValid === true) {
        return false;
      }

      // Session is marked as invalid
      // Check the timestamp to see if this is within the grace period
      const closeTimestamp = localStorage.getItem(SESSION_TIMESTAMP_KEY);
      if (closeTimestamp) {
        const elapsed = Date.now() - parseInt(closeTimestamp, 10);
        if (elapsed < REFRESH_GRACE_PERIOD) {
          // Within grace period - likely a refresh or quick navigation
          // Clear the timestamp and allow the session
          localStorage.removeItem(SESSION_TIMESTAMP_KEY);
          return false;
        }
      }

      // Session is invalid and outside grace period
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reset session state (called on explicit login)
   */
  resetSession(): void {
    this.markSessionValid();
    this.markTabAlive();
    this.activeTabs.clear();
    this.activeTabs.add(this.tabId);
    this.updateTabCount();
    this.isUnloading = false;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopHeartbeat();

    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }

    this.isInitialized = false;
  }

  /**
   * Get this tab's ID
   */
  getTabId(): string {
    return this.tabId;
  }

  /**
   * Force re-initialization (useful for testing)
   */
  reinitialize(): void {
    this.isUnloading = false;
    if (!this.isInitialized) {
      this.initialize({
        onLastTabClosed: this.onLastTabClosed,
        onLogoutBroadcast: this.onLogoutBroadcast,
      });
    }
  }
}

// Export singleton instance
export const tabSessionManager = new TabSessionManager();

// Export helper functions
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
