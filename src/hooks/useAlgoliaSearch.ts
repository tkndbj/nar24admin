import { useState, useEffect, useCallback, useRef } from 'react';
import { searchOrders, AlgoliaOrderHit, SearchFilters } from '@/app/lib/algolia/searchService';

interface UseAlgoliaSearchOptions {
  filters?: SearchFilters;
  debounceMs?: number;
  enabled?: boolean;
}

interface UseAlgoliaSearchResult {
  results: AlgoliaOrderHit[];
  isSearching: boolean;
  error: string | null;
  totalResults: number;
  search: (query: string) => void;
  clearSearch: () => void;
}

export function useAlgoliaSearch(
  options: UseAlgoliaSearchOptions = {}
): UseAlgoliaSearchResult {
  const { filters, debounceMs = 300, enabled = true } = options;

  const [results, setResults] = useState<AlgoliaOrderHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalResults, setTotalResults] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const performSearch = useCallback(async (query: string) => {
    if (!enabled) return;

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    setIsSearching(true);
    setError(null);

    try {
      const searchResult = await searchOrders(query, {
        filters,
        hitsPerPage: 1000,
      });

      setResults(searchResult.hits);
      setTotalResults(searchResult.nbHits);
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Search error:', err);
        setError('Arama sırasında bir hata oluştu');
        setResults([]);
        setTotalResults(0);
      }
    } finally {
      setIsSearching(false);
    }
  }, [filters, enabled]);

  useEffect(() => {
    if (!enabled || searchQuery === '') {
      setResults([]);
      setTotalResults(0);
      return;
    }

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer
    debounceTimerRef.current = setTimeout(() => {
      performSearch(searchQuery);
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery, performSearch, debounceMs, enabled]);

  const search = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setResults([]);
    setTotalResults(0);
    setError(null);
  }, []);

  return {
    results,
    isSearching,
    error,
    totalResults,
    search,
    clearSearch,
  };
}