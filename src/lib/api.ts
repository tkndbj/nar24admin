// src/lib/api.ts
// Authenticated fetch utility for making API calls with Firebase ID tokens

import { auth } from "@/app/lib/firebase";

export interface ApiError {
  message: string;
  status: number;
}

export class AuthenticatedApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthenticatedApiError";
    this.status = status;
  }
}

/**
 * Get the current user's ID token for API authentication
 */
async function getIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) {
    return null;
  }

  try {
    return await user.getIdToken(false);
  } catch (error) {
    console.error("Error getting ID token:", error);
    return null;
  }
}

/**
 * Authenticated fetch wrapper that automatically includes the Firebase ID token
 * in the Authorization header.
 *
 * Usage:
 * ```typescript
 * // GET request
 * const data = await authenticatedFetch('/api/metrics');
 *
 * // POST request with body
 * const result = await authenticatedFetch('/api/users', {
 *   method: 'POST',
 *   body: JSON.stringify({ name: 'John' }),
 * });
 * ```
 */
export async function authenticatedFetch<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getIdToken();

  if (!token) {
    throw new AuthenticatedApiError(
      "Not authenticated. Please sign in again.",
      401
    );
  }

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMessage = `API error: ${response.status}`;

    try {
      const errorData = await response.json();
      if (errorData.error) {
        errorMessage = errorData.error;
      } else if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch {
      // Response is not JSON, use default message
    }

    // If unauthorized or forbidden, the user may need to sign in again
    if (response.status === 401 || response.status === 403) {
      console.error("Authentication error:", errorMessage);
    }

    throw new AuthenticatedApiError(errorMessage, response.status);
  }

  // Handle empty responses
  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    return {} as T;
  }

  return response.json();
}

/**
 * Authenticated fetch with automatic retry on token expiration
 */
export async function authenticatedFetchWithRetry<T = unknown>(
  url: string,
  options: RequestInit = {},
  maxRetries: number = 1
): Promise<T> {
  let lastError: AuthenticatedApiError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await authenticatedFetch<T>(url, options);
    } catch (error) {
      if (error instanceof AuthenticatedApiError) {
        lastError = error;

        // Only retry on 401 (token might have expired)
        if (error.status === 401 && attempt < maxRetries) {
          // Force token refresh on retry
          const user = auth.currentUser;
          if (user) {
            try {
              await user.getIdToken(true); // Force refresh
              continue; // Retry the request
            } catch {
              // Token refresh failed, throw the original error
              throw error;
            }
          }
        }

        throw error;
      }

      throw error;
    }
  }

  throw lastError || new Error("Request failed after retries");
}

/**
 * Create a typed API client for a specific endpoint
 *
 * Usage:
 * ```typescript
 * const metricsApi = createApiClient<MetricsResponse>('/api/metrics');
 * const data = await metricsApi.get();
 * ```
 */
export function createApiClient<T>(baseUrl: string) {
  return {
    get: async (queryParams?: Record<string, string>): Promise<T> => {
      let url = baseUrl;
      if (queryParams) {
        const params = new URLSearchParams(queryParams);
        url = `${baseUrl}?${params.toString()}`;
      }
      return authenticatedFetch<T>(url);
    },

    post: async (body: unknown): Promise<T> => {
      return authenticatedFetch<T>(baseUrl, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    put: async (body: unknown): Promise<T> => {
      return authenticatedFetch<T>(baseUrl, {
        method: "PUT",
        body: JSON.stringify(body),
      });
    },

    delete: async (): Promise<T> => {
      return authenticatedFetch<T>(baseUrl, {
        method: "DELETE",
      });
    },
  };
}
