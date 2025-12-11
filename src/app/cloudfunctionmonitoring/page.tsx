"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  Filter,
  SortAsc,
  SortDesc,
  ExternalLink,
  Terminal,
  Cpu,
  MemoryStick,
  Timer,
  AlertCircle,
  ChevronDown,
  Copy,
  MoreVertical,
  X,
  Loader2,
  AlertTriangle,
  Info,
} from "lucide-react";

type FunctionStatus = "active" | "error" | "deploying" | "unknown";
type SortField = "name" | "lastExecution" | "executions" | "errors" | "avgDuration";
type SortOrder = "asc" | "desc";
type StatusFilter = "all" | "healthy" | "error" | "warning";
type LogSeverity = "DEBUG" | "INFO" | "NOTICE" | "WARNING" | "ERROR" | "CRITICAL" | "ALERT" | "EMERGENCY" | "DEFAULT";

interface CloudFunction {
  name: string;
  status: FunctionStatus;
  lastExecution: number | null;
  lastError: number | null;
  executions24h: number;
  errors24h: number;
  avgDuration: number;
  memory: number;
  timeout: number;
  runtime: string;
  region: string;
  trigger: string;
  lastDeployed: number;
}

interface LogEntry {
  timestamp: string;
  severity: LogSeverity;
  message: string;
  executionId?: string;
  trace?: string;
}

interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

interface LogsState {
  functionName: string | null;
  logs: LogEntry[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  nextCursor: string | null;
  expandedLogs: Set<number>;
}

export default function FunctionsMonitoring() {
  const [functions, setFunctions] = useState<CloudFunction[]>([]);
  const [filteredFunctions, setFilteredFunctions] = useState<CloudFunction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortField, setSortField] = useState<SortField>("lastExecution");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [selectedFunctions, setSelectedFunctions] = useState<Set<string>>(new Set());
  const [expandedFunction, setExpandedFunction] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    pageSize: 50,
    total: 0,
    hasMore: false,
  });
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [logsState, setLogsState] = useState<LogsState>({
    functionName: null,
    logs: [],
    loading: false,
    loadingMore: false,
    hasMore: false,
    nextCursor: null,
    expandedLogs: new Set(),
  });
  const logsContainerRef = useRef<HTMLDivElement>(null);

  const fetchFunctions = useCallback(async (page: number = 1, isRefresh: boolean = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const response = await fetch(
        `/api/functions?page=${page}&pageSize=${pagination.pageSize}`
      );
      
      if (response.ok) {
        const data = await response.json();
        setFunctions(data.functions || []);
        setPagination({
          page: data.page || 1,
          pageSize: data.pageSize || 50,
          total: data.total || 0,
          hasMore: data.hasMore || false,
        });
        setLastRefresh(new Date());
      }
    } catch (error) {
      console.error("Error fetching functions:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [pagination.pageSize]);

  const fetchLogs = useCallback(async (functionName: string, cursor?: string) => {
    try {
      if (cursor) {
        setLogsState(prev => ({ ...prev, loadingMore: true }));
      } else {
        setLogsState(prev => ({ 
          ...prev, 
          functionName, 
          logs: [], 
          loading: true,
          nextCursor: null,
          expandedLogs: new Set(),
        }));
      }
  
      const url = cursor 
        ? `/api/functions/logs?name=${encodeURIComponent(functionName)}&before=${encodeURIComponent(cursor)}`
        : `/api/functions/logs?name=${encodeURIComponent(functionName)}`;
  
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        setLogsState(prev => ({
          ...prev,
          logs: cursor ? [...prev.logs, ...data.logs] : data.logs,
          hasMore: !!data.nextCursor,
          nextCursor: data.nextCursor || null,
          loading: false,
          loadingMore: false,
        }));
      }
    } catch (error) {
      console.error("Error fetching logs:", error);
      setLogsState(prev => ({ ...prev, loading: false, loadingMore: false }));
    }
  }, []);

  const handleLogsScroll = useCallback(() => {
    const container = logsContainerRef.current;
    if (!container) return;
  
    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
  
    if (isNearBottom && logsState.hasMore && !logsState.loadingMore && logsState.nextCursor) {
      fetchLogs(logsState.functionName!, logsState.nextCursor);
    }
  }, [logsState, fetchLogs]);

  const closeLogs = () => {
    setLogsState({
      functionName: null,
      logs: [],
      loading: false,
      loadingMore: false,
      hasMore: false,
      nextCursor: null,
      expandedLogs: new Set(),
    });
  };

  const toggleLogExpanded = (index: number) => {
    setLogsState(prev => {
      const newExpanded = new Set(prev.expandedLogs);
      if (newExpanded.has(index)) {
        newExpanded.delete(index);
      } else {
        newExpanded.add(index);
      }
      return { ...prev, expandedLogs: newExpanded };
    });
  };

  useEffect(() => {
    fetchFunctions(1);
  }, [fetchFunctions]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => fetchFunctions(pagination.page, true), 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, pagination.page, fetchFunctions]);

  useEffect(() => {
    let filtered = [...functions];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (fn) =>
          fn.name.toLowerCase().includes(query) ||
          fn.runtime.toLowerCase().includes(query) ||
          fn.region.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((fn) => {
        const errorRate = fn.executions24h > 0 ? (fn.errors24h / fn.executions24h) * 100 : 0;
        switch (statusFilter) {
          case "healthy":
            return errorRate === 0;
          case "warning":
            return errorRate > 0 && errorRate < 5;
          case "error":
            return errorRate >= 5 || fn.status === "error";
          default:
            return true;
        }
      });
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: string | number, bVal: string | number;

      switch (sortField) {
        case "name":
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case "lastExecution":
          aVal = a.lastExecution || 0;
          bVal = b.lastExecution || 0;
          break;
        case "executions":
          aVal = a.executions24h;
          bVal = b.executions24h;
          break;
        case "errors":
          aVal = a.errors24h;
          bVal = b.errors24h;
          break;
        case "avgDuration":
          aVal = a.avgDuration;
          bVal = b.avgDuration;
          break;
        default:
          return 0;
      }

      if (sortOrder === "asc") {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      }
      return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
    });

    setFilteredFunctions(filtered);
  }, [functions, searchQuery, statusFilter, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const toggleSelectAll = () => {
    if (selectedFunctions.size === filteredFunctions.length) {
      setSelectedFunctions(new Set());
    } else {
      setSelectedFunctions(new Set(filteredFunctions.map((fn) => fn.name)));
    }
  };

  const toggleSelect = (name: string) => {
    const newSelected = new Set(selectedFunctions);
    if (newSelected.has(name)) {
      newSelected.delete(name);
    } else {
      newSelected.add(name);
    }
    setSelectedFunctions(newSelected);
  };

  const getStatusIndicator = (fn: CloudFunction) => {
    const errorRate = fn.executions24h > 0 ? (fn.errors24h / fn.executions24h) * 100 : 0;
    
    if (fn.status === "error" || errorRate >= 5) {
      return <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" />;
    }
    if (errorRate > 0) {
      return <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]" />;
    }
    if (fn.status === "deploying") {
      return <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />;
    }
    return <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />;
  };

  const getStatusBadge = (fn: CloudFunction) => {
    const errorRate = fn.executions24h > 0 ? (fn.errors24h / fn.executions24h) * 100 : 0;
    
    if (fn.status === "error" || errorRate >= 5) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-red-500/10 text-red-400 rounded border border-red-500/20">
          <XCircle className="w-3 h-3" />
          Error
        </span>
      );
    }
    if (errorRate > 0) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/10 text-amber-400 rounded border border-amber-500/20">
          <AlertCircle className="w-3 h-3" />
          Warning
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20">
        <CheckCircle2 className="w-3 h-3" />
        Healthy
      </span>
    );
  };

  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return "—";
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const copyFunctionName = (name: string) => {
    navigator.clipboard.writeText(name);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortOrder === "asc" ? (
      <SortAsc className="w-3 h-3 text-blue-400" />
    ) : (
      <SortDesc className="w-3 h-3 text-blue-400" />
    );
  };

  const getSeverityIcon = (severity: LogSeverity) => {
    switch (severity) {
      case "ERROR":
      case "CRITICAL":
      case "ALERT":
      case "EMERGENCY":
        return <XCircle className="w-3.5 h-3.5 text-red-400" />;
      case "WARNING":
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
      case "INFO":
      case "NOTICE":
        return <Info className="w-3.5 h-3.5 text-blue-400" />;
      default:
        return <Terminal className="w-3.5 h-3.5 text-gray-500" />;
    }
  };

  const getSeverityStyle = (severity: LogSeverity) => {
    switch (severity) {
      case "ERROR":
      case "CRITICAL":
      case "ALERT":
      case "EMERGENCY":
        return "bg-red-500/10 border-red-500/20 text-red-400";
      case "WARNING":
        return "bg-amber-500/10 border-amber-500/20 text-amber-400";
      case "INFO":
      case "NOTICE":
        return "bg-blue-500/10 border-blue-500/20 text-blue-400";
      default:
        return "bg-gray-500/10 border-gray-500/20 text-gray-400";
    }
  };

  // Stats summary
  const stats = {
    total: filteredFunctions.length,
    healthy: filteredFunctions.filter(
      (fn) => fn.executions24h === 0 || fn.errors24h === 0
    ).length,
    warning: filteredFunctions.filter((fn) => {
      const rate = fn.executions24h > 0 ? (fn.errors24h / fn.executions24h) * 100 : 0;
      return rate > 0 && rate < 5;
    }).length,
    error: filteredFunctions.filter((fn) => {
      const rate = fn.executions24h > 0 ? (fn.errors24h / fn.executions24h) * 100 : 0;
      return rate >= 5 || fn.status === "error";
    }).length,
    totalExecutions: filteredFunctions.reduce((sum, fn) => sum + fn.executions24h, 0),
    totalErrors: filteredFunctions.reduce((sum, fn) => sum + fn.errors24h, 0),
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-100 font-mono">
      {/* Header */}
      <header className="bg-[#161b22] border-b border-[#30363d] sticky top-0 z-50">
        <div className="max-w-[1800px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-lg border border-[#30363d]">
                <Terminal className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h1 className="text-sm font-semibold text-gray-100">Cloud Functions</h1>
                <p className="text-[10px] text-gray-500">
                  {pagination.total} functions • Last refresh: {lastRefresh.toLocaleTimeString()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`px-2 py-1 text-[10px] rounded border transition-all ${
                  autoRefresh
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : "bg-gray-500/10 border-gray-500/30 text-gray-400"
                }`}
              >
                Auto-refresh {autoRefresh ? "ON" : "OFF"}
              </button>
              <button
                onClick={() => fetchFunctions(pagination.page, true)}
                disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#21262d] border border-[#30363d] rounded-md hover:bg-[#30363d] transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Stats Bar */}
      <div className="bg-[#161b22]/50 border-b border-[#30363d]">
        <div className="max-w-[1800px] mx-auto px-4 py-2">
          <div className="flex items-center gap-6 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Functions:</span>
              <span className="text-gray-100 font-medium">{stats.total}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-gray-400">{stats.healthy} healthy</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-gray-400">{stats.warning} warning</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-gray-400">{stats.error} error</span>
            </div>
            <div className="h-4 w-px bg-[#30363d]" />
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-gray-500">24h:</span>
              <span className="text-gray-100">{stats.totalExecutions.toLocaleString()} exec</span>
              <span className="text-gray-500">/</span>
              <span className={stats.totalErrors > 0 ? "text-red-400" : "text-gray-400"}>
                {stats.totalErrors.toLocaleString()} errors
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1800px] mx-auto px-4 py-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-3 gap-4">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Filter functions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-[#0d1117] border border-[#30363d] rounded-md text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
            />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-[#21262d] rounded-md border border-[#30363d]">
              {(["all", "healthy", "warning", "error"] as StatusFilter[]).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded transition-all ${
                    statusFilter === filter
                      ? "bg-[#30363d] text-gray-100"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-[auto_2fr_1fr_100px_100px_100px_100px_80px] gap-4 px-4 py-2 bg-[#21262d] border-b border-[#30363d] text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={selectedFunctions.size === filteredFunctions.length && filteredFunctions.length > 0}
                onChange={toggleSelectAll}
                className="w-3.5 h-3.5 rounded border-[#30363d] bg-[#0d1117] text-blue-500 focus:ring-0 focus:ring-offset-0"
              />
            </div>
            <button
              onClick={() => handleSort("name")}
              className="flex items-center gap-1 hover:text-gray-200 transition-colors text-left"
            >
              Function Name <SortIcon field="name" />
            </button>
            <div>Runtime / Region</div>
            <button
              onClick={() => handleSort("lastExecution")}
              className="flex items-center gap-1 hover:text-gray-200 transition-colors"
            >
              Last Run <SortIcon field="lastExecution" />
            </button>
            <button
              onClick={() => handleSort("executions")}
              className="flex items-center gap-1 hover:text-gray-200 transition-colors"
            >
              Executions <SortIcon field="executions" />
            </button>
            <button
              onClick={() => handleSort("errors")}
              className="flex items-center gap-1 hover:text-gray-200 transition-colors"
            >
              Errors <SortIcon field="errors" />
            </button>
            <button
              onClick={() => handleSort("avgDuration")}
              className="flex items-center gap-1 hover:text-gray-200 transition-colors"
            >
              Avg Duration <SortIcon field="avgDuration" />
            </button>
            <div className="text-center">Status</div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-[#21262d]">
            {loading ? (
              <div className="px-4 py-12 text-center">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-500" />
                <p className="text-sm text-gray-500">Loading functions...</p>
              </div>
            ) : filteredFunctions.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Terminal className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                <p className="text-sm text-gray-500">No functions found</p>
                <p className="text-xs text-gray-600 mt-1">Try adjusting your filters</p>
              </div>
            ) : (
              filteredFunctions.map((fn) => (
                <div key={fn.name}>
                  <div
                    className={`grid grid-cols-[auto_2fr_1fr_100px_100px_100px_100px_80px] gap-4 px-4 py-2.5 text-sm hover:bg-[#21262d]/50 transition-colors cursor-pointer group ${
                      selectedFunctions.has(fn.name) ? "bg-blue-500/5" : ""
                    }`}
                    onClick={() => setExpandedFunction(expandedFunction === fn.name ? null : fn.name)}
                  >
                    <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedFunctions.has(fn.name)}
                        onChange={() => toggleSelect(fn.name)}
                        className="w-3.5 h-3.5 rounded border-[#30363d] bg-[#0d1117] text-blue-500 focus:ring-0 focus:ring-offset-0"
                      />
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      {getStatusIndicator(fn)}
                      <span className="truncate font-medium text-gray-100">{fn.name}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyFunctionName(fn.name);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[#30363d] rounded transition-all"
                        title="Copy name"
                      >
                        <Copy className="w-3 h-3 text-gray-500" />
                      </button>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-gray-500 transition-transform ${
                          expandedFunction === fn.name ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <span className="px-1.5 py-0.5 bg-[#21262d] rounded text-[10px]">{fn.runtime}</span>
                      <span className="text-gray-600">{fn.region}</span>
                    </div>
                    <div className="flex items-center text-xs text-gray-400">
                      <Clock className="w-3 h-3 mr-1.5 text-gray-600" />
                      {formatTime(fn.lastExecution)}
                    </div>
                    <div className="flex items-center text-xs font-mono text-gray-300">
                      {fn.executions24h.toLocaleString()}
                    </div>
                    <div className={`flex items-center text-xs font-mono ${fn.errors24h > 0 ? "text-red-400" : "text-gray-500"}`}>
                      {fn.errors24h.toLocaleString()}
                    </div>
                    <div className="flex items-center text-xs font-mono text-gray-400">
                      {formatDuration(fn.avgDuration)}
                    </div>
                    <div className="flex items-center justify-center">
                      {getStatusBadge(fn)}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedFunction === fn.name && (
                    <div className="px-4 py-3 bg-[#0d1117] border-t border-[#21262d]">
                      <div className="grid grid-cols-4 gap-4 text-xs">
                        <div className="space-y-2">
                          <p className="text-gray-500 uppercase text-[10px] font-semibold">Configuration</p>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <MemoryStick className="w-3 h-3 text-gray-600" />
                              <span className="text-gray-400">Memory:</span>
                              <span className="text-gray-200">{fn.memory}MB</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Timer className="w-3 h-3 text-gray-600" />
                              <span className="text-gray-400">Timeout:</span>
                              <span className="text-gray-200">{fn.timeout}s</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Cpu className="w-3 h-3 text-gray-600" />
                              <span className="text-gray-400">Trigger:</span>
                              <span className="text-gray-200">{fn.trigger}</span>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="text-gray-500 uppercase text-[10px] font-semibold">Last Error</p>
                          <p className="text-gray-300">
                            {fn.lastError ? formatTime(fn.lastError) : "No recent errors"}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <p className="text-gray-500 uppercase text-[10px] font-semibold">Last Deployed</p>
                          <p className="text-gray-300">{formatTime(fn.lastDeployed)}</p>
                        </div>
                        <div className="flex items-end justify-end gap-2">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              fetchLogs(fn.name);
                            }}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] bg-[#21262d] border border-[#30363d] rounded hover:bg-[#30363d] transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                            View Logs
                          </button>
                          <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] bg-[#21262d] border border-[#30363d] rounded hover:bg-[#30363d] transition-colors">
                            <MoreVertical className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
          <div>
            Showing {(pagination.page - 1) * pagination.pageSize + 1}–
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchFunctions(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#21262d] border border-[#30363d] rounded-md hover:bg-[#30363d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Previous
            </button>
            <span className="px-3 py-1.5 bg-[#161b22] border border-[#30363d] rounded-md">
              Page {pagination.page}
            </span>
            <button
              onClick={() => fetchFunctions(pagination.page + 1)}
              disabled={!pagination.hasMore}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#21262d] border border-[#30363d] rounded-md hover:bg-[#30363d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Logs Panel */}
      {logsState.functionName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-4xl max-h-[80vh] bg-[#161b22] border border-[#30363d] rounded-lg shadow-2xl flex flex-col mx-4">
            {/* Logs Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363d]">
              <div className="flex items-center gap-3">
                <Terminal className="w-4 h-4 text-blue-400" />
                <div>
                  <h3 className="text-sm font-semibold text-gray-100">Logs</h3>
                  <p className="text-[10px] text-gray-500">{logsState.functionName}</p>
                </div>
              </div>
              <button
                onClick={closeLogs}
                className="p-1.5 hover:bg-[#21262d] rounded transition-colors"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {/* Logs Content */}
            <div
              ref={logsContainerRef}
              onScroll={handleLogsScroll}
              className="flex-1 overflow-y-auto p-4 space-y-2"
            >
              {logsState.loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
                  <span className="ml-2 text-sm text-gray-500">Loading logs...</span>
                </div>
              ) : logsState.logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Terminal className="w-8 h-8 text-gray-600 mb-2" />
                  <p className="text-sm text-gray-500">No logs found</p>
                  <p className="text-xs text-gray-600">Logs from the last 24 hours will appear here</p>
                </div>
              ) : (
                <>
                  {logsState.logs.map((log, index) => {
  const isLongMessage = log.message.length > 200 || log.message.split('\n').length > 3;
  const isExpanded = logsState.expandedLogs.has(index);
  
  return (
    <div
      key={`${log.timestamp}-${index}`}
      className={`p-3 rounded border ${getSeverityStyle(log.severity)}`}
    >
      <div className="flex items-start gap-3">
        {getSeverityIcon(log.severity)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-medium px-1.5 py-0.5 bg-[#0d1117] rounded">
              {log.severity}
            </span>
            <span className="text-[10px] text-gray-500">
              {new Date(log.timestamp).toLocaleString()}
            </span>
            {log.executionId && (
              <span className="text-[10px] text-gray-600 truncate">
                {log.executionId}
              </span>
            )}
          </div>
          <pre 
            className={`text-xs text-gray-300 whitespace-pre-wrap break-words font-mono ${
              !isExpanded && isLongMessage ? "max-h-[60px] overflow-hidden" : ""
            }`}
          >
            {log.message}
          </pre>
          {isLongMessage && (
            <button
              onClick={() => toggleLogExpanded(index)}
              className="mt-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
            >
              {isExpanded ? "▲ Collapse" : "▼ Expand"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
})}
                  {logsState.loadingMore && (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                      <span className="ml-2 text-xs text-gray-500">Loading more...</span>
                    </div>
                  )}
                  {!logsState.hasMore && logsState.logs.length > 0 && (
                    <div className="text-center py-4">
                      <span className="text-xs text-gray-600">End of logs</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}