import { typesenseClient } from "./client";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface AlgoliaShopHit {
  id: string;
  objectID: string;
  name?: string;
  shopId: string;
  shopName: string;
  ownerName: string;
  ownerId: string;
  category?: string;
  location?: {
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    province?: string;
    country?: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  status: "active" | "inactive" | "pending" | "suspended";
  rating?: number;
  totalProducts?: number;
  verified?: boolean;
  createdAt?: {
    _seconds: number;
    _nanoseconds: number;
  };
  [key: string]: unknown;
}

export interface AlgoliaProductHit {
  id: string;
  objectID: string;
  productId: string;
  productName: string;
  brandModel?: string;
  category: string;
  subCategory?: string;
  description?: string;
  price: number;
  stockQuantity?: number;
  status: "active" | "inactive" | "out_of_stock" | "discontinued";
  images?: string[];
  tags?: string[];
  specifications?: Record<string, unknown>;
  rating?: number;
  reviewCount?: number;
  createdAt?: {
    _seconds: number;
    _nanoseconds: number;
  };
  updatedAt?: {
    _seconds: number;
    _nanoseconds: number;
  };
  [key: string]: unknown;
}

export interface AlgoliaShopProductHit {
  id: string;
  objectID: string;
  shopProductId: string;
  shopId: string;
  shopName: string;
  productId: string;
  productName: string;
  brandModel?: string;
  category: string;
  price: number;
  shopPrice?: number;
  stockQuantity?: number;
  status: "active" | "inactive" | "out_of_stock";
  discount?: number;
  featured?: boolean;
  createdAt?: {
    _seconds: number;
    _nanoseconds: number;
  };
  [key: string]: unknown;
}

// ============================================================================
// SEARCH FILTERS
// ============================================================================

export interface ShopFilters {
  status?: string | string[];
  category?: string | string[];
  verified?: boolean;
  city?: string | string[];
  minRating?: number;
  [key: string]: unknown;
}

export interface ProductFilters {
  status?: string | string[];
  category?: string | string[];
  subCategory?: string | string[];
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  minRating?: number;
  [key: string]: unknown;
}

export interface ShopProductFilters {
  status?: string | string[];
  shopId?: string | string[];
  productId?: string | string[];
  category?: string | string[];
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  featured?: boolean;
  [key: string]: unknown;
}

// ============================================================================
// SEARCH OPTIONS
// ============================================================================

export interface BaseSearchOptions<T> {
  hitsPerPage?: number;
  page?: number;
  filters?: T;
  attributesToRetrieve?: string[];
  sortBy?: string;
}

export type ShopSearchOptions = BaseSearchOptions<ShopFilters>;
export type ProductSearchOptions = BaseSearchOptions<ProductFilters>;
export type ShopProductSearchOptions = BaseSearchOptions<ShopProductFilters>;

// ============================================================================
// SEARCH RESPONSE TYPE
// ============================================================================

export interface AlgoliaSearchResult<T> {
  hits: T[];
  nbHits: number;
  page: number;
  nbPages: number;
  hitsPerPage: number;
  processingTimeMS?: number;
  query: string;
}

// ============================================================================
// FILTER BUILDER
// ============================================================================

/**
 * Build Typesense filter_by string from filter object
 */
function buildFilterString<T extends Record<string, unknown>>(
  filters?: T
): string {
  if (!filters) return "";

  const filterParts: string[] = [];

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null) return;

    // Handle numeric range filters
    if (key.startsWith("min") && typeof value === "number") {
      const fieldName =
        key.replace("min", "").charAt(0).toLowerCase() +
        key.replace("min", "").slice(1);
      filterParts.push(`${fieldName}:>=${value}`);
      return;
    }

    if (key.startsWith("max") && typeof value === "number") {
      const fieldName =
        key.replace("max", "").charAt(0).toLowerCase() +
        key.replace("max", "").slice(1);
      filterParts.push(`${fieldName}:<=${value}`);
      return;
    }

    // Handle boolean filters
    if (typeof value === "boolean") {
      filterParts.push(`${key}:=${value}`);
      return;
    }

    // Handle array filters (OR condition)
    if (Array.isArray(value)) {
      if (value.length > 0) {
        filterParts.push(`${key}:=[${value.map(v => `\`${v}\``).join(",")}]`);
      }
      return;
    }

    // Handle string filters
    if (typeof value === "string") {
      filterParts.push(`${key}:=\`${value}\``);
    }
  });

  return filterParts.join(" && ");
}

// ============================================================================
// QUERY_BY FIELDS PER COLLECTION
// ============================================================================

const QUERY_BY: Record<string, string> = {
  shops: "shopName,ownerName,category",
  products: "productName,brandModel,category,description",
  shop_products: "productName,brandModel,shopName,category",
};

// ============================================================================
// BASE SEARCH FUNCTION
// ============================================================================

/**
 * Generic search function using Typesense
 */
async function performSearch<T extends { id?: string }>(
  collectionName: string,
  query: string = "",
  options: BaseSearchOptions<unknown> = {}
): Promise<AlgoliaSearchResult<T>> {
  try {
    const {
      hitsPerPage = 100,
      page = 0,
      filters,
      attributesToRetrieve,
      sortBy,
    } = options;

    const filterString = buildFilterString(filters as Record<string, unknown>);

    const searchParams: Record<string, unknown> = {
      q: query.trim() || "*",
      query_by: QUERY_BY[collectionName] || "productName",
      per_page: hitsPerPage,
      page: page + 1, // Typesense is 1-indexed
    };

    if (filterString) {
      searchParams.filter_by = filterString;
    }

    if (attributesToRetrieve && attributesToRetrieve.length > 0) {
      searchParams.include_fields = attributesToRetrieve.join(",");
    }

    if (sortBy) {
      searchParams.sort_by = sortBy;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await typesenseClient
      .collections(collectionName)
      .documents()
      .search(searchParams as any);

    const hits = ((result.hits as any[]) || []).map(hit => {
      const doc = hit.document as T & { id?: string };
      // Map Typesense `id` to `objectID` for backward compatibility
      return {
        ...doc,
        objectID: doc.id || "",
      } as T;
    });

    const found = result.found || 0;

    return {
      hits,
      nbHits: found,
      page,
      nbPages: Math.ceil(found / (hitsPerPage || 1)),
      hitsPerPage,
      processingTimeMS: result.search_time_ms,
      query: query.trim(),
    };
  } catch (error) {
    console.error(`Typesense search error for ${collectionName}:`, error);
    throw new Error(`Failed to search ${collectionName}`);
  }
}

// ============================================================================
// SHOPS SEARCH FUNCTIONS
// ============================================================================

/**
 * Search shops with advanced filtering
 */
export async function searchShops(
  query: string = "",
  options: ShopSearchOptions = {}
): Promise<AlgoliaSearchResult<AlgoliaShopHit>> {
  const collectionName = process.env.NEXT_PUBLIC_TYPESENSE_SHOPS_COLLECTION || "shops";
  return performSearch<AlgoliaShopHit>(collectionName, query, options);
}

/**
 * Get shop by ID
 */
export async function getShopById(
  shopId: string
): Promise<AlgoliaShopHit | null> {
  try {
    const result = await searchShops("", {
      filters: { shopId } as ShopFilters,
      hitsPerPage: 1,
    });

    return result.hits[0] || null;
  } catch (error) {
    console.error("Error getting shop by ID:", error);
    return null;
  }
}

/**
 * Get shops by multiple IDs (optimized with chunking)
 */
export async function getShopsByIds(
  shopIds: string[]
): Promise<AlgoliaShopHit[]> {
  if (shopIds.length === 0) return [];

  try {
    const collectionName = process.env.NEXT_PUBLIC_TYPESENSE_SHOPS_COLLECTION || "shops";

    const chunks: string[][] = [];
    for (let i = 0; i < shopIds.length; i += 100) {
      chunks.push(shopIds.slice(i, i + 100));
    }

    const results = await Promise.all(
      chunks.map(async (chunk) => {
        const filterString = `shopId:=[${chunk.map(id => `\`${id}\``).join(",")}]`;

        const result = await typesenseClient
          .collections(collectionName)
          .documents()
          .search({
            q: "*",
            query_by: "shopName",
            filter_by: filterString,
            per_page: chunk.length,
            page: 1,
          });

        return (result.hits || []).map(hit => ({
          ...hit.document,
          objectID: (hit.document as AlgoliaShopHit).id || "",
        })) as AlgoliaShopHit[];
      })
    );

    return results.flat();
  } catch (error) {
    console.error("Error getting shops by IDs:", error);
    return [];
  }
}

/**
 * Get active shops
 */
export async function searchActiveShops(
  query: string = "",
  options: Omit<ShopSearchOptions, "filters"> = {}
): Promise<AlgoliaShopHit[]> {
  try {
    const result = await searchShops(query, {
      ...options,
      filters: { status: "active" },
    });

    return result.hits;
  } catch (error) {
    console.error("Error searching active shops:", error);
    return [];
  }
}

/**
 * Get verified shops
 */
export async function searchVerifiedShops(
  query: string = "",
  options: Omit<ShopSearchOptions, "filters"> = {}
): Promise<AlgoliaShopHit[]> {
  try {
    const result = await searchShops(query, {
      ...options,
      filters: { status: "active", verified: true },
    });

    return result.hits;
  } catch (error) {
    console.error("Error searching verified shops:", error);
    return [];
  }
}

// ============================================================================
// PRODUCTS SEARCH FUNCTIONS
// ============================================================================

/**
 * Search products with advanced filtering
 */
export async function searchProducts(
  query: string = "",
  options: ProductSearchOptions = {}
): Promise<AlgoliaSearchResult<AlgoliaProductHit>> {
  const collectionName =
    process.env.NEXT_PUBLIC_TYPESENSE_PRODUCTS_COLLECTION || "products";
  return performSearch<AlgoliaProductHit>(collectionName, query, options);
}

/**
 * Get product by ID
 */
export async function getProductById(
  productId: string
): Promise<AlgoliaProductHit | null> {
  try {
    const result = await searchProducts("", {
      filters: { productId } as ProductFilters,
      hitsPerPage: 1,
    });

    return result.hits[0] || null;
  } catch (error) {
    console.error("Error getting product by ID:", error);
    return null;
  }
}

/**
 * Get products by multiple IDs (optimized with chunking)
 */
export async function getProductsByIds(
  productIds: string[]
): Promise<AlgoliaProductHit[]> {
  if (productIds.length === 0) return [];

  try {
    const collectionName =
      process.env.NEXT_PUBLIC_TYPESENSE_PRODUCTS_COLLECTION || "products";

    const chunks: string[][] = [];
    for (let i = 0; i < productIds.length; i += 100) {
      chunks.push(productIds.slice(i, i + 100));
    }

    const results = await Promise.all(
      chunks.map(async (chunk) => {
        const filterString = `productId:=[${chunk.map(id => `\`${id}\``).join(",")}]`;

        const result = await typesenseClient
          .collections(collectionName)
          .documents()
          .search({
            q: "*",
            query_by: "productName",
            filter_by: filterString,
            per_page: chunk.length,
            page: 1,
          });

        return (result.hits || []).map(hit => ({
          ...hit.document,
          objectID: (hit.document as AlgoliaProductHit).id || "",
        })) as AlgoliaProductHit[];
      })
    );

    return results.flat();
  } catch (error) {
    console.error("Error getting products by IDs:", error);
    return [];
  }
}

/**
 * Get active products
 */
export async function searchActiveProducts(
  query: string = "",
  options: Omit<ProductSearchOptions, "filters"> = {}
): Promise<AlgoliaProductHit[]> {
  try {
    const result = await searchProducts(query, {
      ...options,
      filters: { status: "active" },
    });

    return result.hits;
  } catch (error) {
    console.error("Error searching active products:", error);
    return [];
  }
}

/**
 * Get in-stock products
 */
export async function searchInStockProducts(
  query: string = "",
  options: Omit<ProductSearchOptions, "filters"> = {}
): Promise<AlgoliaProductHit[]> {
  try {
    const result = await searchProducts(query, {
      ...options,
      filters: { status: "active", inStock: true },
    });

    return result.hits;
  } catch (error) {
    console.error("Error searching in-stock products:", error);
    return [];
  }
}

/**
 * Search products by category
 */
export async function searchProductsByCategory(
  category: string,
  query: string = "",
  options: Omit<ProductSearchOptions, "filters"> = {}
): Promise<AlgoliaProductHit[]> {
  try {
    const result = await searchProducts(query, {
      ...options,
      filters: { category, status: "active" },
    });

    return result.hits;
  } catch (error) {
    console.error("Error searching products by category:", error);
    return [];
  }
}

// ============================================================================
// SHOP PRODUCTS SEARCH FUNCTIONS
// ============================================================================

/**
 * Search shop products with advanced filtering
 */
export async function searchShopProducts(
  query: string = "",
  options: ShopProductSearchOptions = {}
): Promise<AlgoliaSearchResult<AlgoliaShopProductHit>> {
  const collectionName =
    process.env.NEXT_PUBLIC_TYPESENSE_SHOP_PRODUCTS_COLLECTION || "shop_products";
  return performSearch<AlgoliaShopProductHit>(collectionName, query, options);
}

/**
 * Get shop product by ID
 */
export async function getShopProductById(
  shopProductId: string
): Promise<AlgoliaShopProductHit | null> {
  try {
    const result = await searchShopProducts("", {
      filters: { shopProductId } as ShopProductFilters,
      hitsPerPage: 1,
    });

    return result.hits[0] || null;
  } catch (error) {
    console.error("Error getting shop product by ID:", error);
    return null;
  }
}

/**
 * Get shop products by multiple IDs (optimized with chunking)
 */
export async function getShopProductsByIds(
  shopProductIds: string[]
): Promise<AlgoliaShopProductHit[]> {
  if (shopProductIds.length === 0) return [];

  try {
    const collectionName =
      process.env.NEXT_PUBLIC_TYPESENSE_SHOP_PRODUCTS_COLLECTION || "shop_products";

    const chunks: string[][] = [];
    for (let i = 0; i < shopProductIds.length; i += 100) {
      chunks.push(shopProductIds.slice(i, i + 100));
    }

    const results = await Promise.all(
      chunks.map(async (chunk) => {
        const filterString = `shopProductId:=[${chunk.map(id => `\`${id}\``).join(",")}]`;

        const result = await typesenseClient
          .collections(collectionName)
          .documents()
          .search({
            q: "*",
            query_by: "productName",
            filter_by: filterString,
            per_page: chunk.length,
            page: 1,
          });

        return (result.hits || []).map(hit => ({
          ...hit.document,
          objectID: (hit.document as AlgoliaShopProductHit).id || "",
        })) as AlgoliaShopProductHit[];
      })
    );

    return results.flat();
  } catch (error) {
    console.error("Error getting shop products by IDs:", error);
    return [];
  }
}

/**
 * Get products for a specific shop
 */
export async function searchProductsByShop(
  shopId: string,
  query: string = "",
  options: Omit<ShopProductSearchOptions, "filters"> = {}
): Promise<AlgoliaShopProductHit[]> {
  try {
    const result = await searchShopProducts(query, {
      ...options,
      filters: { shopId, status: "active" },
    });

    return result.hits;
  } catch (error) {
    console.error("Error searching products by shop:", error);
    return [];
  }
}

/**
 * Get featured products
 */
export async function searchFeaturedProducts(
  query: string = "",
  options: Omit<ShopProductSearchOptions, "filters"> = {}
): Promise<AlgoliaShopProductHit[]> {
  try {
    const result = await searchShopProducts(query, {
      ...options,
      filters: { featured: true, status: "active" },
    });

    return result.hits;
  } catch (error) {
    console.error("Error searching featured products:", error);
    return [];
  }
}

/**
 * Get in-stock shop products
 */
export async function searchInStockShopProducts(
  query: string = "",
  options: Omit<ShopProductSearchOptions, "filters"> = {}
): Promise<AlgoliaShopProductHit[]> {
  try {
    const result = await searchShopProducts(query, {
      ...options,
      filters: { status: "active", inStock: true },
    });

    return result.hits;
  } catch (error) {
    console.error("Error searching in-stock shop products:", error);
    return [];
  }
}

// ============================================================================
// MULTI-INDEX SEARCH (Advanced)
// ============================================================================

/**
 * Search across multiple collections simultaneously
 */
export async function multiIndexSearch(
  query: string,
  options?: {
    shopOptions?: ShopSearchOptions;
    productOptions?: ProductSearchOptions;
    shopProductOptions?: ShopProductSearchOptions;
  }
): Promise<{
  shops: AlgoliaSearchResult<AlgoliaShopHit>;
  products: AlgoliaSearchResult<AlgoliaProductHit>;
  shopProducts: AlgoliaSearchResult<AlgoliaShopProductHit>;
}> {
  try {
    const [shops, products, shopProducts] = await Promise.all([
      searchShops(query, options?.shopOptions || { hitsPerPage: 20 }),
      searchProducts(query, options?.productOptions || { hitsPerPage: 20 }),
      searchShopProducts(
        query,
        options?.shopProductOptions || { hitsPerPage: 20 }
      ),
    ]);

    return { shops, products, shopProducts };
  } catch (error) {
    console.error("Error in multi-collection search:", error);
    throw new Error("Failed to perform multi-collection search");
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get total counts for dashboard statistics (optimized - only fetches count, not hits)
 */
export async function getDashboardCounts(): Promise<{
  totalShops: number;
  activeShops: number;
  totalProducts: number;
  activeProducts: number;
  totalShopProducts: number;
  activeShopProducts: number;
}> {
  try {
    const [
      allShops,
      activeShops,
      allProducts,
      activeProducts,
      allShopProducts,
      activeShopProducts,
    ] = await Promise.all([
      searchShops("", { hitsPerPage: 0 }),
      searchShops("", { hitsPerPage: 0, filters: { status: "active" } }),
      searchProducts("", { hitsPerPage: 0 }),
      searchProducts("", { hitsPerPage: 0, filters: { status: "active" } }),
      searchShopProducts("", { hitsPerPage: 0 }),
      searchShopProducts("", { hitsPerPage: 0, filters: { status: "active" } }),
    ]);

    return {
      totalShops: allShops.nbHits,
      activeShops: activeShops.nbHits,
      totalProducts: allProducts.nbHits,
      activeProducts: activeProducts.nbHits,
      totalShopProducts: allShopProducts.nbHits,
      activeShopProducts: activeShopProducts.nbHits,
    };
  } catch (error) {
    console.error("Error getting dashboard counts:", error);
    return {
      totalShops: 0,
      activeShops: 0,
      totalProducts: 0,
      activeProducts: 0,
      totalShopProducts: 0,
      activeShopProducts: 0,
    };
  }
}

/**
 * Clear cache (no-op for Typesense)
 */
export function clearSearchCache(): void {
  console.log("Cache clearing is not needed for Typesense");
}
