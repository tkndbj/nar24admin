import { typesenseClient } from "./client";
import type { SearchParams } from "typesense/lib/Typesense/Documents";

// ============================================================================
// TYPE DEFINITIONS — match actual Typesense schemas
// ============================================================================

/** Matches the 'shops' collection: id, name, profileImageUrl, isActive, categories, searchableText */
export interface AlgoliaShopHit {
  id: string;
  objectID: string;
  name?: string;
  profileImageUrl?: string;
  isActive?: boolean;
  categories?: string[];
  searchableText?: string;
  // backward compat — these won't exist in Typesense but pages may reference them
  shopName?: string;
  shopId?: string;
  ownerName?: string;
  ownerId?: string;
  category?: string;
  verified?: boolean;
  rating?: number;
  totalProducts?: number;
  location?: {
    addressLine1?: string;
    city?: string;
    province?: string;
    country?: string;
  };
  [key: string]: unknown;
}

/** Matches the 'products' / 'shop_products' collection */
export interface AlgoliaProductHit {
  id: string;
  objectID: string;
  productName?: string;
  brandModel?: string;
  category?: string;
  subcategory?: string;
  subsubcategory?: string;
  description?: string;
  price?: number;
  originalPrice?: number;
  discountPercentage?: number;
  condition?: string;
  currency?: string;
  sellerName?: string;
  ownerId?: string;
  shopId?: string;
  userId?: string;
  quantity?: number;
  paused?: boolean;
  imageUrls?: string[];
  bundleIds?: string[];
  gender?: string;
  productType?: string;
  availableColors?: string[];
  promotionScore?: number;
  isBoosted?: boolean;
  isFeatured?: boolean;
  campaignName?: string;
  averageRating?: number;
  reviewCount?: number;
  purchaseCount?: number;
  deliveryOption?: string;
  createdAt?: number;
  [key: string]: unknown;
}

export interface AlgoliaShopProductHit {
  id: string;
  objectID: string;
  productName?: string;
  brandModel?: string;
  category?: string;
  subcategory?: string;
  subsubcategory?: string;
  description?: string;
  price?: number;
  originalPrice?: number;
  discountPercentage?: number;
  condition?: string;
  currency?: string;
  sellerName?: string;
  ownerId?: string;
  shopId?: string;
  userId?: string;
  quantity?: number;
  paused?: boolean;
  imageUrls?: string[];
  bundleIds?: string[];
  gender?: string;
  productType?: string;
  availableColors?: string[];
  promotionScore?: number;
  isBoosted?: boolean;
  isFeatured?: boolean;
  campaignName?: string;
  averageRating?: number;
  reviewCount?: number;
  purchaseCount?: number;
  deliveryOption?: string;
  createdAt?: number;
  // backward compat aliases
  shopName?: string;
  productId?: string;
  shopProductId?: string;
  shopPrice?: number;
  featured?: boolean;
  [key: string]: unknown;
}

// ============================================================================
// SEARCH FILTERS — only fields that exist in schemas
// ============================================================================

export interface ShopFilters {
  isActive?: boolean;
  categories?: string | string[];
  [key: string]: unknown;
}

export interface ProductFilters {
  category?: string | string[];
  subcategory?: string | string[];
  paused?: boolean;
  isBoosted?: boolean;
  isFeatured?: boolean;
  shopId?: string | string[];
  gender?: string | string[];
  minPrice?: number;
  maxPrice?: number;
  [key: string]: unknown;
}

export interface ShopProductFilters {
  category?: string | string[];
  subcategory?: string | string[];
  shopId?: string | string[];
  paused?: boolean;
  isBoosted?: boolean;
  isFeatured?: boolean;
  gender?: string | string[];
  minPrice?: number;
  maxPrice?: number;
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

function buildFilterString<T extends Record<string, unknown>>(
  filters?: T
): string {
  if (!filters) return "";

  const filterParts: string[] = [];

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null) return;

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

    if (typeof value === "boolean") {
      filterParts.push(`${key}:=${value}`);
      return;
    }

    if (Array.isArray(value)) {
      if (value.length > 0) {
        filterParts.push(`${key}:=[${value.map(v => `\`${v}\``).join(",")}]`);
      }
      return;
    }

    if (typeof value === "string") {
      filterParts.push(`${key}:=\`${value}\``);
    }
  });

  return filterParts.join(" && ");
}

// ============================================================================
// QUERY_BY FIELDS — must match actual schema fields
// ============================================================================

const QUERY_BY: Record<string, string> = {
  shops: "name,searchableText",
  products: "productName,brandModel,category,description,sellerName",
  shop_products: "productName,brandModel,category,description,sellerName",
};

// ============================================================================
// BASE SEARCH FUNCTION
// ============================================================================

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
      page: page + 1,
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

    const result = await typesenseClient
      .collections(collectionName)
      .documents()
      .search(searchParams as SearchParams<object>);

    const hits = (result.hits || []).map(hit => {
      const doc = hit.document as (T & { id?: string }) | undefined;
      return {
        ...doc,
        objectID: doc?.id || "",
      } as unknown as T;
    });

    const found = result.found || 0;

    return {
      hits,
      nbHits: found,
      page,
      nbPages: hitsPerPage > 0 ? Math.ceil(found / hitsPerPage) : 0,
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

export async function searchShops(
  query: string = "",
  options: ShopSearchOptions = {}
): Promise<AlgoliaSearchResult<AlgoliaShopHit>> {
  const collectionName = process.env.NEXT_PUBLIC_TYPESENSE_SHOPS_COLLECTION || "shops";
  return performSearch<AlgoliaShopHit>(collectionName, query, options);
}

export async function getShopById(
  shopId: string
): Promise<AlgoliaShopHit | null> {
  try {
    // Typesense id format: "shops_{firestoreId}"
    const typesenseId = shopId.startsWith("shops_") ? shopId : `shops_${shopId}`;
    const result = await searchShops("", {
      filters: { id: typesenseId } as ShopFilters,
      hitsPerPage: 1,
    });
    return result.hits[0] || null;
  } catch (error) {
    console.error("Error getting shop by ID:", error);
    return null;
  }
}

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
        // IDs in Typesense are "shops_{firestoreId}"
        const ids = chunk.map(id => id.startsWith("shops_") ? id : `shops_${id}`);
        const filterString = `id:[${ids.join(",")}]`;

        const result = await typesenseClient
          .collections(collectionName)
          .documents()
          .search({
            q: "*",
            query_by: "name",
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

export async function searchActiveShops(
  query: string = "",
  options: Omit<ShopSearchOptions, "filters"> = {}
): Promise<AlgoliaShopHit[]> {
  try {
    const result = await searchShops(query, {
      ...options,
      filters: { isActive: true },
    });
    return result.hits;
  } catch (error) {
    console.error("Error searching active shops:", error);
    return [];
  }
}

export async function searchVerifiedShops(
  query: string = "",
  options: Omit<ShopSearchOptions, "filters"> = {}
): Promise<AlgoliaShopHit[]> {
  try {
    // No 'verified' field in schema — just return active shops
    const result = await searchShops(query, {
      ...options,
      filters: { isActive: true },
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

export async function searchProducts(
  query: string = "",
  options: ProductSearchOptions = {}
): Promise<AlgoliaSearchResult<AlgoliaProductHit>> {
  const collectionName =
    process.env.NEXT_PUBLIC_TYPESENSE_PRODUCTS_COLLECTION || "products";
  return performSearch<AlgoliaProductHit>(collectionName, query, options);
}

export async function getProductById(
  productId: string
): Promise<AlgoliaProductHit | null> {
  try {
    const typesenseId = productId.startsWith("products_") ? productId : `products_${productId}`;
    const result = await searchProducts("", {
      filters: { id: typesenseId } as ProductFilters,
      hitsPerPage: 1,
    });
    return result.hits[0] || null;
  } catch (error) {
    console.error("Error getting product by ID:", error);
    return null;
  }
}

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
        const ids = chunk.map(id => id.startsWith("products_") ? id : `products_${id}`);
        const filterString = `id:[${ids.join(",")}]`;

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

export async function searchActiveProducts(
  query: string = "",
  options: Omit<ProductSearchOptions, "filters"> = {}
): Promise<AlgoliaProductHit[]> {
  try {
    // No 'status' field — use paused:!=true to get active products
    const result = await searchProducts(query, {
      ...options,
      filters: { paused: false },
    });
    return result.hits;
  } catch (error) {
    console.error("Error searching active products:", error);
    return [];
  }
}

export async function searchInStockProducts(
  query: string = "",
  options: Omit<ProductSearchOptions, "filters"> = {}
): Promise<AlgoliaProductHit[]> {
  try {
    const result = await searchProducts(query, {
      ...options,
      filters: { paused: false },
    });
    return result.hits;
  } catch (error) {
    console.error("Error searching in-stock products:", error);
    return [];
  }
}

export async function searchProductsByCategory(
  category: string,
  query: string = "",
  options: Omit<ProductSearchOptions, "filters"> = {}
): Promise<AlgoliaProductHit[]> {
  try {
    const result = await searchProducts(query, {
      ...options,
      filters: { category },
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

export async function searchShopProducts(
  query: string = "",
  options: ShopProductSearchOptions = {}
): Promise<AlgoliaSearchResult<AlgoliaShopProductHit>> {
  const collectionName =
    process.env.NEXT_PUBLIC_TYPESENSE_SHOP_PRODUCTS_COLLECTION || "shop_products";
  return performSearch<AlgoliaShopProductHit>(collectionName, query, options);
}

export async function getShopProductById(
  shopProductId: string
): Promise<AlgoliaShopProductHit | null> {
  try {
    const typesenseId = shopProductId.startsWith("shop_products_") ? shopProductId : `shop_products_${shopProductId}`;
    const result = await searchShopProducts("", {
      filters: { id: typesenseId } as ShopProductFilters,
      hitsPerPage: 1,
    });
    return result.hits[0] || null;
  } catch (error) {
    console.error("Error getting shop product by ID:", error);
    return null;
  }
}

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
        const ids = chunk.map(id => id.startsWith("shop_products_") ? id : `shop_products_${id}`);
        const filterString = `id:[${ids.join(",")}]`;

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

export async function searchProductsByShop(
  shopId: string,
  query: string = "",
  options: Omit<ShopProductSearchOptions, "filters"> = {}
): Promise<AlgoliaShopProductHit[]> {
  try {
    const result = await searchShopProducts(query, {
      ...options,
      filters: { shopId },
    });
    return result.hits;
  } catch (error) {
    console.error("Error searching products by shop:", error);
    return [];
  }
}

export async function searchFeaturedProducts(
  query: string = "",
  options: Omit<ShopProductSearchOptions, "filters"> = {}
): Promise<AlgoliaShopProductHit[]> {
  try {
    const result = await searchShopProducts(query, {
      ...options,
      filters: { isFeatured: true },
    });
    return result.hits;
  } catch (error) {
    console.error("Error searching featured products:", error);
    return [];
  }
}

export async function searchInStockShopProducts(
  query: string = "",
  options: Omit<ShopProductSearchOptions, "filters"> = {}
): Promise<AlgoliaShopProductHit[]> {
  try {
    const result = await searchShopProducts(query, {
      ...options,
      filters: { paused: false },
    });
    return result.hits;
  } catch (error) {
    console.error("Error searching in-stock shop products:", error);
    return [];
  }
}

// ============================================================================
// MULTI-INDEX SEARCH
// ============================================================================

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
      searchShops("", { hitsPerPage: 1 }),
      searchShops("", { hitsPerPage: 1, filters: { isActive: true } }),
      searchProducts("", { hitsPerPage: 1 }),
      searchProducts("", { hitsPerPage: 1, filters: { paused: false } }),
      searchShopProducts("", { hitsPerPage: 1 }),
      searchShopProducts("", { hitsPerPage: 1, filters: { paused: false } }),
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

export function clearSearchCache(): void {
  console.log("Cache clearing is not needed for Typesense");
}
