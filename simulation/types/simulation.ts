export type NodeType =
  | 'producer'
  | 'kafka'
  | 'worker'
  | 'database'
  | 'cache'
  | 'load_balancer'
  | 'api_gateway'
  | 'circuit_breaker'
  | 'dead_letter_queue'
  | 'consumer_group';

export type RoutingMode = 'single' | 'broadcast';

export interface NodeConfig {
  id: string;
  type: NodeType;
  label: string;
  x: number;
  y: number;
  latencyMs?: number;
  throughputPerSec?: number;
  replicas?: number;
  partitions?: number;
  failureRate?: number;
  timeoutMs?: number;
  cacheHitRate?: number;
  circuitBreakerThreshold?: number;
  sink?: boolean;
  routingMode?: RoutingMode;
}

export interface EdgeConfig {
  id: string;
  sourceId: string;
  targetId: string;
}

export interface TopologyConfig {
  nodes: NodeConfig[];
  edges: EdgeConfig[];
}

export interface ServiceSnapshot {
  nodeId: string;
  nodeType: NodeType;
  throughputPerSec: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  errorRate: number;
  queueDepth: number;
  healthScore: number;
  status: 'healthy' | 'degraded' | 'crashed';
}

export interface SystemSnapshot {
  runId: string;
  timestamp: number;
  services: Record<string, ServiceSnapshot>;
  system: {
    totalThroughput: number;
    overallHealthScore: number;
    bottleneckService: string | null;
  };
}
