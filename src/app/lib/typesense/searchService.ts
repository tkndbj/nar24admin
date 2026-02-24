import { typesenseClient } from './client';
import type { SearchParams } from 'typesense/lib/Typesense/Documents';

export interface OrderHit {
  id: string;
  orderId: string;
  productName: string;
  brandModel: string;
  buyerName: string;
  sellerName: string;
  category: string;
  gatheringStatus: string;
  shipmentStatus: string;
  price: number;
  quantity: number;
  timestamp: {
    _seconds: number;
    _nanoseconds: number;
  };
  [key: string]: string | number | boolean | { _seconds: number; _nanoseconds: number; } | string[] | number[] | {
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
  };
}

/** @deprecated Use OrderHit instead */
export type AlgoliaOrderHit = OrderHit;

export interface SearchFilters {
  gatheringStatus?: string | string[];
  shipmentStatus?: string | string[];
  distributionStatus?: string | string[];
  allItemsGathered?: boolean;
}

export interface SearchOptions {
  hitsPerPage?: number;
  page?: number;
  filters?: SearchFilters;
  attributesToRetrieve?: string[];
}

/**
 * Build Typesense filter_by string from filter object
 */
function buildFilterString(filters?: SearchFilters): string {
  if (!filters) return '';

  const filterParts: string[] = [];

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null) return;

    if (Array.isArray(value)) {
      if (value.length > 0) {
        filterParts.push(`${key}:=[${value.map(v => `\`${v}\``).join(',')}]`);
      }
    } else if (typeof value === 'boolean') {
      filterParts.push(`${key}:=${value}`);
    } else {
      filterParts.push(`${key}:=\`${value}\``);
    }
  });

  return filterParts.join(' && ');
}

/**
 * Search orders in Typesense with advanced filtering
 */
export async function searchOrders(
  query: string = '',
  options: SearchOptions = {}
): Promise<{
  hits: OrderHit[];
  nbHits: number;
  page: number;
  nbPages: number;
  hitsPerPage: number;
}> {
  try {
    const {
      hitsPerPage = 1000,
      page = 0,
      filters,
      attributesToRetrieve,
    } = options;

    const filterString = buildFilterString(filters);
    const collectionName = process.env.NEXT_PUBLIC_TYPESENSE_ORDERS_COLLECTION || 'orders';

    const searchParams: Record<string, unknown> = {
      q: query.trim() || '*',
      query_by: 'productName,brandModel,buyerName,sellerName,category,orderId',
      per_page: hitsPerPage,
      page: page + 1, // Typesense is 1-indexed
    };

    if (filterString) {
      searchParams.filter_by = filterString;
    }

    if (attributesToRetrieve && attributesToRetrieve.length > 0) {
      searchParams.include_fields = attributesToRetrieve.join(',');
    }

    const result = await typesenseClient
      .collections(collectionName)
      .documents()
      .search(searchParams as SearchParams<object>);

    const hits = (result.hits || []).map(hit => {
      const doc = hit.document as Record<string, unknown> | undefined;
      return {
        ...doc,
        id: String(doc?.id ?? ''),
      } as OrderHit;
    });

    const found = result.found || 0;

    return {
      hits,
      nbHits: found,
      page,
      nbPages: Math.ceil(found / hitsPerPage),
      hitsPerPage,
    };
  } catch (error) {
    console.error('Typesense search error:', error);
    throw new Error('Failed to search orders');
  }
}

/**
 * Search orders by specific field
 */
export async function searchOrdersByField(
  fieldName: string,
  value: string,
  options: SearchOptions = {}
): Promise<OrderHit[]> {
  try {
    const result = await searchOrders('', {
      ...options,
      filters: {
        ...options.filters,
        [fieldName]: value,
      },
    });

    return result.hits;
  } catch (error) {
    console.error(`Error searching orders by ${fieldName}:`, error);
    return [];
  }
}

/**
 * Get gathering items (pending or assigned status)
 */
export async function searchGatheringItems(
  query: string = ''
): Promise<OrderHit[]> {
  try {
    const result = await searchOrders(query, {
      filters: {
        gatheringStatus: ['pending', 'assigned'],
      },
      hitsPerPage: 1000,
    });

    return result.hits;
  } catch (error) {
    console.error('Error searching gathering items:', error);
    return [];
  }
}

/**
 * Get distribution items (ready for distribution or assigned to distributor)
 */
export async function searchDistributionItems(
  query: string = ''
): Promise<OrderHit[]> {
  try {
    const result = await searchOrders(query, {
      filters: {
        allItemsGathered: true,
        distributionStatus: ['ready', 'assigned'],
      },
      hitsPerPage: 1000,
    });

    return result.hits;
  } catch (error) {
    console.error('Error searching distribution items:', error);
    return [];
  }
}

/**
 * Get delivered items
 */
export async function searchDeliveredItems(
  query: string = ''
): Promise<OrderHit[]> {
  try {
    const result = await searchOrders(query, {
      filters: {
        distributionStatus: 'delivered',
      },
      hitsPerPage: 1000,
    });

    return result.hits;
  } catch (error) {
    console.error('Error searching delivered items:', error);
    return [];
  }
}

/**
 * Get orders by multiple IDs
 */
export async function getOrdersByIds(
  orderIds: string[]
): Promise<OrderHit[]> {
  if (orderIds.length === 0) return [];

  try {
    const collectionName = process.env.NEXT_PUBLIC_TYPESENSE_ORDERS_COLLECTION || 'orders';

    // Split into chunks to avoid overly long filter strings
    const chunks: string[][] = [];
    for (let i = 0; i < orderIds.length; i += 100) {
      chunks.push(orderIds.slice(i, i + 100));
    }

    const results = await Promise.all(
      chunks.map(async (chunk) => {
        const filterString = `id:[${chunk.join(',')}]`;

        const result = await typesenseClient
          .collections(collectionName)
          .documents()
          .search({
            q: '*',
            query_by: 'productName',
            filter_by: filterString,
            per_page: chunk.length,
            page: 1,
          });

        return (result.hits || []).map(hit => hit.document as OrderHit);
      })
    );

    return results.flat();
  } catch (error) {
    console.error('Error getting orders by IDs:', error);
    return [];
  }
}

/**
 * Clear cache (no-op for Typesense)
 */
export async function clearSearchCache(): Promise<void> {
  console.log('Cache clearing is not needed for Typesense');
}
