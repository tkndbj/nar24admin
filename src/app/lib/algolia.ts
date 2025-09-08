// lib/services/algolia.ts - FIXED VERSION
import { Product, ProductUtils } from "../../models/Product";

interface AlgoliaConfig {
  applicationId: string;
  apiKey: string;
  mainIndexName: string;
  categoryIndexName: string;
}

interface SearchParams {
  query: string;
  page?: number;
  hitsPerPage?: number;
  filters?: string[];
}

interface ShopProductSearchParams extends SearchParams {
  shopId: string;
  sortOption: string;
  additionalFilters?: string[];
}

// NEW: Separate interface for shop order searches
interface ShopOrderSearchParams extends SearchParams {
  shopId: string; // Use shopId instead of userId
}

// Keep the old interface for user order searches (when users search their own orders)
interface OrderSearchParams extends SearchParams {
  userId: string;
  isSold: boolean;
}

interface AlgoliaResponse<T> {
  hits: T[];
  nbHits: number;
  page: number;
  nbPages: number;
  hitsPerPage: number;
  processingTimeMS: number;
}

interface RetryOptions {
  maxAttempts: number;
  delayFactor: number;
  randomizationFactor: number;
  maxDelay: number;
}

class AlgoliaService {
  private readonly applicationId: string;
  private readonly apiKey: string;
  private readonly mainIndexName: string;
  private readonly categoryIndexName: string;

  private productDebounceTimer: NodeJS.Timeout | null = null;
  private readonly debounceDuration = 300; // milliseconds

  // Enhanced retry configuration for production reliability
  private static readonly retryOptions: RetryOptions = {
    maxAttempts: 3,
    delayFactor: 500, // milliseconds
    randomizationFactor: 0.1,
    maxDelay: 2000, // milliseconds
  };

  // Progressive timeout strategy
  private static readonly timeoutProgression = [3000, 5000, 8000]; // milliseconds

  constructor(config: AlgoliaConfig) {
    this.applicationId = config.applicationId;
    this.apiKey = config.apiKey;
    this.mainIndexName = config.mainIndexName;
    this.categoryIndexName = config.categoryIndexName;
  }

  /**
   * Constructs the search URL based on the given index name
   */
  private constructSearchUri(indexName: string): string {
    return `https://${this.applicationId}-dsn.algolia.net/1/indexes/${indexName}/query`;
  }

  /**
   * Returns the replica index name based on the sort option
   */
  private getReplicaIndexName(indexName: string, sortOption: string): string {
    if (indexName === "shop_products") {
      return indexName;
    }

    switch (sortOption) {
      case "date":
        return `${indexName}_createdAt_desc`;
      case "alphabetical":
        return `${indexName}_alphabetical`;
      case "price_asc":
        return `${indexName}_price_asc`;
      case "price_desc":
        return `${indexName}_price_desc`;
      default:
        return indexName;
    }
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Calculate retry delay with randomization
   */
  private calculateRetryDelay(attempt: number): number {
    const { delayFactor, randomizationFactor, maxDelay } =
      AlgoliaService.retryOptions;
    const baseDelay = delayFactor * Math.pow(2, attempt - 1);
    const randomization =
      baseDelay * randomizationFactor * (Math.random() * 2 - 1);
    const delay = baseDelay + randomization;
    return Math.min(delay, maxDelay);
  }

  /**
   * Enhanced search method with comprehensive error handling and retry logic
   */
  private async searchInIndex<T>({
    indexName,
    query,
    sortOption,
    mapper,
    page = 0,
    hitsPerPage = 50,
    filters,
  }: {
    indexName: string;
    query: string;
    sortOption: string;
    mapper: (hit: Record<string, unknown>) => T;
    page?: number;
    hitsPerPage?: number;
    filters?: string[];
  }): Promise<T[]> {
    const replicaIndex = this.getReplicaIndexName(indexName, sortOption);
    const uri = this.constructSearchUri(replicaIndex);

    // Build query parameters
    const paramsMap: Record<string, string> = {
      query,
      page: page.toString(),
      hitsPerPage: hitsPerPage.toString(),
      attributesToRetrieve:
        "objectID,productName,price,imageUrls,campaignName,discountPercentage,isBoosted,dailyClickCount,averageRating,purchaseCount,createdAt,isFeatured,isTrending,colorImages,brandModel,category,subcategory,subsubcategory,condition,userId,sellerName,reviewCount,originalPrice,currency,clickCount,rankingScore,collection,isBoosted,deliveryOption,shopId,quantity",
      attributesToHighlight: "",
    };

    if (filters && filters.length > 0) {
      paramsMap.filters = filters.join(" AND ");
    }

    const params = Object.entries(paramsMap)
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
      )
      .join("&");

    const requestBody = JSON.stringify({ params });

    // Execute with retry logic and progressive timeouts
    let lastError: Error | null = null;

    for (
      let attempt = 1;
      attempt <= AlgoliaService.retryOptions.maxAttempts;
      attempt++
    ) {
      try {
        const timeoutIndex = Math.min(
          attempt - 1,
          AlgoliaService.timeoutProgression.length - 1
        );
        const currentTimeout = AlgoliaService.timeoutProgression[timeoutIndex];

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), currentTimeout);

        try {
          const response = await fetch(uri, {
            method: "POST",
            headers: {
              "X-Algolia-Application-Id": this.applicationId,
              "X-Algolia-API-Key": this.apiKey,
              "Content-Type": "application/json",
              "User-Agent": "YourApp/1.0 (Web)",
            },
            body: requestBody,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (response.ok) {
            const data: AlgoliaResponse<Record<string, unknown>> =
              await response.json();
            const hits = data.hits || [];
            return hits.map((hit) => mapper(hit));
          } else if (response.status >= 500) {
            // Server errors should be retried
            throw new Error(`Algolia server error: ${response.status}`);
          } else {
            // Client errors (4xx) shouldn't be retried
            console.error(
              `Algolia client error (${response.status}):`,
              await response.text()
            );
            return [];
          }
        } catch (error) {
          clearTimeout(timeoutId);

          if (error instanceof Error && error.name === "AbortError") {
            throw new Error(
              `Algolia request timeout after ${currentTimeout}ms`
            );
          }
          throw error;
        }
      } catch (error) {
        lastError = error as Error;

        // Check if we should retry
        const shouldRetry =
          this.shouldRetryError(error as Error) &&
          attempt < AlgoliaService.retryOptions.maxAttempts;

        if (!shouldRetry) {
          break;
        }

        console.log(
          `Retrying Algolia search after error (attempt ${attempt}):`,
          error
        );

        if (attempt < AlgoliaService.retryOptions.maxAttempts) {
          const delay = this.calculateRetryDelay(attempt);
          await this.sleep(delay);
        }
      }
    }

    // If we get here, all retries failed
    console.error("All Algolia search attempts failed:", lastError);
    return [];
  }

  /**
   * Determine if an error should trigger a retry
   */
  private shouldRetryError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes("timeout") ||
      message.includes("network") ||
      message.includes("fetch") ||
      message.includes("server error") ||
      message.includes("failed to fetch") ||
      message.includes("failed host lookup")
    );
  }

  /**
   * Search for shop products
   */
  async searchShopProducts({
    shopId,
    query,
    sortOption,
    page = 0,
    hitsPerPage = 100,
    additionalFilters,
  }: ShopProductSearchParams): Promise<Product[]> {
    try {
      // Always include shop filter
      const filters = [`shopId:"${shopId}"`];

      // Add any additional filters
      if (additionalFilters && additionalFilters.length > 0) {
        filters.push(...additionalFilters);
      }

      return await this.searchInIndex<Product>({
        indexName: "shop_products",
        query,
        sortOption,
        mapper: (hit) => ProductUtils.fromAlgolia(hit),
        page,
        hitsPerPage,
        filters,
      });
    } catch (error) {
      console.error(
        `Shop-specific Algolia search failure for shopId ${shopId}:`,
        error
      );
      return [];
    }
  }

  /**
   * Debounced search for shop products
   */
  async debouncedSearchShopProducts(
    params: ShopProductSearchParams
  ): Promise<Product[]> {
    return new Promise((resolve) => {
      if (this.productDebounceTimer) {
        clearTimeout(this.productDebounceTimer);
      }

      this.productDebounceTimer = setTimeout(async () => {
        try {
          const results = await this.searchShopProducts(params);
          resolve(results);
        } catch (error) {
          console.error("Debounced shop search error:", error);
          resolve([]);
        }
      }, this.debounceDuration);
    });
  }

  /**
   * NEW: Search for shop orders (FIXED - matches Flutter implementation)
   */
  async searchShopOrdersInAlgolia({
    query,
    shopId,
    page = 0,
    hitsPerPage = 20,
  }: ShopOrderSearchParams): Promise<Record<string, unknown>[]> {
    const uri = this.constructSearchUri("orders");

    const paramsMap: Record<string, string> = {
      query,
      page: page.toString(),
      hitsPerPage: hitsPerPage.toString(),
      filters: `shopId:"${shopId}"`, // ✅ FIXED: Use shopId filter like Flutter
      attributesToRetrieve:
        "objectID,productName,brandModel,buyerName,sellerName,orderId,productId,price,currency,quantity,productImage,selectedColorImage,selectedColor,productAverageRating,buyerId,sellerId,shopId,timestamp,selectedAttributes",
      attributesToHighlight: "",
      attributesToSnippet: "",
      typoTolerance: "true",
      minWordSizefor1Typo: "4",
      minWordSizefor2Typos: "8",
    };

    const params = Object.entries(paramsMap)
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
      )
      .join("&");

    const requestBody = JSON.stringify({ params });

    console.log("🔍 === ALGOLIA ORDERS SEARCH DEBUG ===");
    console.log("🔍 Query:", `"${query}"`);
    console.log("🔍 Shop Filter:", `shopId:"${shopId}"`);
    console.log("🔍 Shop ID:", shopId);
    console.log("🔍 Full URL:", uri);
    console.log("🔍 Request Body:", requestBody);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(uri, {
        method: "POST",
        headers: {
          "X-Algolia-Application-Id": this.applicationId,
          "X-Algolia-API-Key": this.apiKey,
          "Content-Type": "application/json",
          "User-Agent": "YourApp/1.0 (Web)",
        },
        body: requestBody,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log("🔍 Response Status:", response.status);
      console.log(
        "🔍 Response Headers:",
        Object.fromEntries(response.headers.entries())
      );

      const responseText = await response.text();
      console.log("🔍 Response Body:", responseText);

      if (response.ok) {
        const data: AlgoliaResponse<Record<string, unknown>> =
          JSON.parse(responseText);
        const hits = data.hits || [];
        const nbHits = data.nbHits || 0;
        const processingTimeMS = data.processingTimeMS?.toString() || "unknown";

        console.log("🔍 Total hits in index:", nbHits);
        console.log("🔍 Hits returned:", hits.length);
        console.log("🔍 Processing time:", `${processingTimeMS}ms`);

        if (hits.length > 0) {
          console.log("🔍 First hit keys:", Object.keys(hits[0]));
          console.log(
            "🔍 First hit productName:",
            (hits[0] as Record<string, unknown>).productName
          );
          console.log(
            "🔍 First hit shopId:",
            (hits[0] as Record<string, unknown>).shopId
          );
          console.log(
            "🔍 First hit orderId:",
            (hits[0] as Record<string, unknown>).orderId
          );
        }

        return hits;
      } else {
        console.error("❌ Algolia error: Status", response.status);
        console.error("❌ Error body:", responseText);
        return [];
      }
    } catch (error) {
      console.error("❌ Exception during Algolia search:", error);
      return [];
    }
  }

  /**
   * Original: Search for user orders (keep for user-centric order searches)
   */
  async searchOrdersInAlgolia({
    query,
    userId,
    isSold,
    page = 0,
    hitsPerPage = 20,
  }: OrderSearchParams): Promise<Record<string, unknown>[]> {
    const uri = this.constructSearchUri("orders");

    // Build filters based on whether user is searching for sold or bought items
    const userFilter = isSold ? `sellerId:"${userId}"` : `buyerId:"${userId}"`;

    const paramsMap: Record<string, string> = {
      query,
      page: page.toString(),
      hitsPerPage: hitsPerPage.toString(),
      filters: userFilter,
      attributesToRetrieve:
        "objectID,productName,brandModel,buyerName,sellerName,orderId,productId,price,currency,quantity,productImage,selectedColorImage,selectedColor,productAverageRating,buyerId,sellerId,shopId,timestamp",
      attributesToHighlight: "",
      attributesToSnippet: "",
      typoTolerance: "true",
      minWordSizefor1Typo: "4",
      minWordSizefor2Typos: "8",
    };

    const params = Object.entries(paramsMap)
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
      )
      .join("&");

    const requestBody = JSON.stringify({ params });

    console.log("🔍 === ALGOLIA USER ORDERS SEARCH DEBUG ===");
    console.log("🔍 Query:", `"${query}"`);
    console.log("🔍 User Filter:", userFilter);
    console.log("🔍 Is Sold:", isSold);
    console.log("🔍 User ID:", userId);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(uri, {
        method: "POST",
        headers: {
          "X-Algolia-Application-Id": this.applicationId,
          "X-Algolia-API-Key": this.apiKey,
          "Content-Type": "application/json",
          "User-Agent": "YourApp/1.0 (Web)",
        },
        body: requestBody,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();

      if (response.ok) {
        const data: AlgoliaResponse<Record<string, unknown>> =
          JSON.parse(responseText);
        const hits = data.hits || [];
        return hits;
      } else {
        console.error("❌ Algolia error: Status", response.status);
        console.error("❌ Error body:", responseText);
        return [];
      }
    } catch (error) {
      console.error("❌ Exception during Algolia search:", error);
      return [];
    }
  }

  /**
   * Check if Algolia service is reachable (useful for health checks)
   */
  async isServiceReachable(): Promise<boolean> {
    try {
      const uri = this.constructSearchUri(this.mainIndexName);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(uri, {
        method: "POST",
        headers: {
          "X-Algolia-Application-Id": this.applicationId,
          "X-Algolia-API-Key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ params: "query=&hitsPerPage=1" }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.status < 500;
    } catch (error) {
      console.error("Algolia service unreachable:", error);
      return false;
    }
  }
}

// Algolia Service Manager - Singleton pattern
class AlgoliaServiceManager {
  private static instance: AlgoliaServiceManager | null = null;

  private shopService: AlgoliaService | null = null;
  private ordersService: AlgoliaService | null = null;

  // Configuration
  private static readonly applicationId = "3QVVGQH4ME";
  private static readonly apiKey = "dcca6685e21c2baed748ccea7a6ddef1";

  private constructor() {}

  static getInstance(): AlgoliaServiceManager {
    if (!AlgoliaServiceManager.instance) {
      AlgoliaServiceManager.instance = new AlgoliaServiceManager();
    }
    return AlgoliaServiceManager.instance;
  }

  /**
   * Get shop products service (lazy initialization)
   */
  getShopService(): AlgoliaService {
    if (!this.shopService) {
      this.shopService = new AlgoliaService({
        applicationId: AlgoliaServiceManager.applicationId,
        apiKey: AlgoliaServiceManager.apiKey,
        mainIndexName: "shop_products",
        categoryIndexName: "categories",
      });
    }
    return this.shopService;
  }

  /**
   * Get orders service (lazy initialization)
   */
  getOrdersService(): AlgoliaService {
    if (!this.ordersService) {
      this.ordersService = new AlgoliaService({
        applicationId: AlgoliaServiceManager.applicationId,
        apiKey: AlgoliaServiceManager.apiKey,
        mainIndexName: "orders",
        categoryIndexName: "categories",
      });
    }
    return this.ordersService;
  }

  /**
   * Check if services are initialized (for debugging)
   */
  get isInitialized(): boolean {
    return this.shopService !== null && this.ordersService !== null;
  }

  /**
   * Reset services (if needed for testing or configuration changes)
   */
  resetServices(): void {
    this.shopService = null;
    this.ordersService = null;
  }

  /**
   * Health check - verify services are reachable
   */
  async isHealthy(): Promise<boolean> {
    try {
      const [shopHealthy, ordersHealthy] = await Promise.all([
        this.getShopService().isServiceReachable(),
        this.getOrdersService().isServiceReachable(),
      ]);

      return shopHealthy && ordersHealthy;
    } catch (error) {
      console.error("AlgoliaServiceManager health check failed:", error);
      return false;
    }
  }
}

// Export singleton instance
export const algoliaServiceManager = AlgoliaServiceManager.getInstance();
export { AlgoliaService, AlgoliaServiceManager };
export type {
  ShopProductSearchParams,
  ShopOrderSearchParams,
  OrderSearchParams,
  AlgoliaConfig,
};
