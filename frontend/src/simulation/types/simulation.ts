export type NodeType =
  | 'producer'
  | 'kafka'
  | 'worker'
  | 'database'
  | 'postgresql'
  | 'mongodb'
  | 'cassandra'
  | 'elasticsearch'
  | 'cache'
  | 'redis'
  | 'rabbitmq'
  | 's3'
  | 'rate_limiter'
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
  latencyMs?: number;
  throughputPerSec?: number;
  replicas?: number;
  partitions?: number;
  failureRate?: number;
  timeoutMs?: number;
  cacheHitRate?: number;
  circuitBreakerThreshold?: number;
  maxMemoryMb?: number;
  evictionPolicy?: 'allkeys-lru' | 'volatile-lru' | 'noeviction';
  readPreference?: 'primary' | 'secondary' | 'nearest';
  writeConcern?: 1 | 2 | 3;
  replicationFactor?: number;
  consistencyLevel?: 'one' | 'quorum' | 'all';
  ackTimeoutMs?: number;
  prefetchCount?: number;
  indexRefreshMs?: number;
  multipartThresholdMb?: number;
  rateLimitPerSec?: number;
  burstCapacity?: number;
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

export interface SimEvent {
  id: string;
  timestamp: number;
  type:
    | 'message_sent'
    | 'message_received'
    | 'message_dropped'
    | 'message_error'
    | 'node_crashed'
    | 'node_recovered'
    | 'latency_spike'
    | 'partition_split';
  sourceNodeId: string;
  targetNodeId?: string;
  messageId: string;
  latencyMs?: number;
  failureInjected: boolean;
}

export interface ServiceSnapshot {
  nodeId: string;
  snapshotAt: number;
  throughputPerSec: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  errorRate: number;
  queueDepth: number;
  healthScore: number;
  circuitBreakerState?: 'closed' | 'open' | 'half-open';
}

export interface SystemSnapshot {
  runId: string;
  snapshotAt: number;
  services: Record<string, ServiceSnapshot>;
  totalThroughput: number;
  bottleneckNodeId: string | null;
  overallHealthScore: number;
}
