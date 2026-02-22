import type {
  NodeConfig,
  NodeType,
  TopologyConfig,
  ServiceSnapshot,
  SystemSnapshot
} from '../simulation/types/simulation.js';

export type { NodeConfig, NodeType, TopologyConfig, ServiceSnapshot, SystemSnapshot };

export interface RunStartPayload {
  runId: string;
  topologyName: string;
  nodeCount: number;
}

export interface RunEndPayload {
  runId: string;
}

export interface GenerateTopologyPayload {
  prompt: string;
}

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const NODE_TYPES: NodeType[] = [
  'producer',
  'kafka',
  'worker',
  'database',
  'cache',
  'load_balancer',
  'api_gateway',
  'circuit_breaker',
  'dead_letter_queue',
  'consumer_group'
];

const STATUSES = ['healthy', 'degraded', 'crashed'] as const;

export function validateServiceSnapshot(value: unknown): value is ServiceSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.nodeId === 'string' &&
    NODE_TYPES.includes(v.nodeType as NodeType) &&
    typeof v.throughputPerSec === 'number' &&
    typeof v.avgLatencyMs === 'number' &&
    typeof v.p95LatencyMs === 'number' &&
    typeof v.errorRate === 'number' &&
    typeof v.queueDepth === 'number' &&
    typeof v.healthScore === 'number' &&
    STATUSES.includes(v.status as (typeof STATUSES)[number])
  );
}

export function isSystemSnapshot(value: unknown): value is SystemSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.runId !== 'string' || typeof v.timestamp !== 'number') return false;

  if (!v.services || typeof v.services !== 'object') return false;
  const services = Object.values(v.services as Record<string, unknown>);
  if (!services.every(validateServiceSnapshot)) return false;

  if (!v.system || typeof v.system !== 'object') return false;
  const system = v.system as Record<string, unknown>;
  return (
    typeof system.totalThroughput === 'number' &&
    typeof system.overallHealthScore === 'number' &&
    (typeof system.bottleneckService === 'string' || system.bottleneckService === null)
  );
}

export function isTopologyConfig(value: unknown): value is TopologyConfig {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.nodes) || !Array.isArray(v.edges)) return false;

  const nodesValid = v.nodes.every((node) => {
    if (!node || typeof node !== 'object') return false;
    const n = node as Record<string, unknown>;
    return (
      typeof n.id === 'string' &&
      typeof n.label === 'string' &&
      NODE_TYPES.includes(n.type as NodeType) &&
      typeof n.x === 'number' &&
      typeof n.y === 'number'
    );
  });

  const edgesValid = v.edges.every((edge) => {
    if (!edge || typeof edge !== 'object') return false;
    const e = edge as Record<string, unknown>;
    return typeof e.id === 'string' && typeof e.sourceId === 'string' && typeof e.targetId === 'string';
  });

  return nodesValid && edgesValid;
}
