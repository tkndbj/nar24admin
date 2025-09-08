// lib/types/algoliaMonitoring.ts

export type Period = "minute" | "hour" | "day" | "week" | "month";
export type MetricName =
  | "*"
  | "avg_build_time"
  | "cpu_usage"
  | "ram_indexing_usage"
  | "ram_search_usage"
  | "ssd_usage";

export interface TSPoint {
  /** Unix timestamp in seconds or milliseconds depending on endpoint */
  t: number;
  /** value */
  v: number;
}

export interface MetricsSeries {
  [clusterOrInstance: string]: TSPoint[];
}

export interface InfrastructureMetricsResponse {
  metrics: {
    [metric: string]: MetricsSeries;
  };
}

export interface StatusResponse {
  status: {
    [cluster: string]:
      | "operational"
      | "degraded_performance"
      | "partial_outage"
      | "major_outage";
  };
}

export interface IncidentsEntryValue {
  title: string;
  status:
    | "operational"
    | "degraded_performance"
    | "partial_outage"
    | "major_outage"
    | "maintenance";
}

export interface IncidentItem {
  t: number; // ms timestamp
  v: IncidentsEntryValue;
}

export interface IncidentsResponse {
  incidents: {
    [cluster: string]: IncidentItem[];
  };
}

export interface InventoryServerItem {
  name: string;
  region: string;
  is_slave: boolean;
  is_replica: boolean;
  cluster: string;
  status: "PRODUCTION" | "STAGING" | "UNKNOWN";
  type: "cluster" | "host";
}

export interface InventoryServersResponse {
  inventory: InventoryServerItem[];
}

export interface LatencyMetricsResponse {
  metrics: {
    latency: {
      [cluster: string]: TSPoint[];
    };
  };
}

export interface IndexingMetricsResponse {
  metrics: {
    indexing: {
      [cluster: string]: TSPoint[];
    };
  };
}

export interface ReachabilityResponse {
  // e.g. { "c16-de": { "sdn-probe-frankfurt": true, ... } }
  [cluster: string]: {
    [probe: string]: boolean;
  };
}

export interface ErrorPayload {
  message: string;
}
