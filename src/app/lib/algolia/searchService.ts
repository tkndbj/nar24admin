import { liteClient as algoliasearch } from 'algoliasearch/lite';
import type { SearchResponse } from 'algoliasearch';

// Initialize client
const searchClient = algoliasearch(
  process.env.NEXT_PUBLIC_ALGOLIA_APP_ID!,
  process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY!
);

export interface AlgoliaOrderHit {
  objectID: string;
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
  [key: string]: any;
}

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
 * Build Algolia filter string from filter object
 */
function buildFilterString(filters?: SearchFilters): string {
  if (!filters) return '';

  const filterParts: string[] = [];

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null) return;

    if (Array.isArray(value)) {
      if (value.length > 0) {
        const orFilters = value.map(v => `${key}:"${v}"`).join(' OR ');
        filterParts.push(`(${orFilters})`);
      }
    } else if (typeof value === 'boolean') {
      filterParts.push(`${key}:${value}`);
    } else {
      filterParts.push(`${key}:"${value}"`);
    }
  });

  return filterParts.join(' AND ');
}

/**
 * Search orders in Algolia with advanced filtering
 */
export async function searchOrders(
    query: string = '',
    options: SearchOptions = {}
  ): Promise<{
    hits: AlgoliaOrderHit[];
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
      const indexName = process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME || 'orders';
  
      const searchParams: any = {
        indexName,
        query: query.trim(),
        hitsPerPage,
        page,
      };
  
      if (filterString) {
        searchParams.filters = filterString;
      }
  
      if (attributesToRetrieve && attributesToRetrieve.length > 0) {
        searchParams.attributesToRetrieve = attributesToRetrieve;
      }
  
      const { results } = await searchClient.search({
        requests: [searchParams]
      });
      
      // Type assertion for the search response
      const result = results[0] as SearchResponse<AlgoliaOrderHit>;
  
      // Check if it's a search response (not facet values response)
      if ('hits' in result) {
        return {
          hits: result.hits,
          nbHits: result.nbHits ?? 0,
          page: result.page ?? 0,
          nbPages: result.nbPages ?? 0,
          hitsPerPage: result.hitsPerPage ?? hitsPerPage,
        };
      }
  
      // Fallback in case of unexpected response type
      return {
        hits: [],
        nbHits: 0,
        page: 0,
        nbPages: 0,
        hitsPerPage: hitsPerPage,
      };
    } catch (error) {
      console.error('Algolia search error:', error);
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
): Promise<AlgoliaOrderHit[]> {
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
): Promise<AlgoliaOrderHit[]> {
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
): Promise<AlgoliaOrderHit[]> {
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
): Promise<AlgoliaOrderHit[]> {
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
  ): Promise<AlgoliaOrderHit[]> {
    if (orderIds.length === 0) return [];
  
    try {
      const indexName = process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME || 'orders';
      
      // Use search with objectID filters instead of getObjects
      // Split into chunks to avoid hitting URL length limits
      const chunks = [];
      for (let i = 0; i < orderIds.length; i += 100) {
        chunks.push(orderIds.slice(i, i + 100));
      }
  
      const results = await Promise.all(
        chunks.map(async (chunk) => {
          // Create OR filter for objectIDs
          const filterString = chunk.map(id => `objectID:"${id}"`).join(' OR ');
          
          const { results } = await searchClient.search({
            requests: [{
              indexName,
              query: '',
              filters: filterString,
              hitsPerPage: chunk.length,
            }]
          });
          
          const result = results[0] as SearchResponse<AlgoliaOrderHit>;
          
          if ('hits' in result) {
            return result.hits;
          }
          
          return [];
        })
      );
  
      return results.flat();
    } catch (error) {
      console.error('Error getting orders by IDs:', error);
      return [];
    }
  }

/**
 * Clear cache (useful for testing)
 */
export async function clearSearchCache(): Promise<void> {
  // Note: v5 doesn't have a direct cache clear method
  // Cache is managed automatically
  console.log('Cache clearing is handled automatically in Algolia v5');
}