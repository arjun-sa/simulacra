import type { NodeConfig, ServiceSnapshot, SimEvent, SystemSnapshot } from '../types/simulation';
import type { BaseNode } from '../nodes/BaseNode';

const WINDOW_MS = 10_000;

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx] ?? 0;
}

export class MetricsAggregator {
  computeSnapshot(params: {
    runId: string;
    simTimeMs: number;
    snapshotAt: number;
    nodes: Map<string, BaseNode>;
    nodeConfigs: Map<string, NodeConfig>;
    events: readonly SimEvent[];
  }): SystemSnapshot {
    const { runId, simTimeMs, snapshotAt, nodes, nodeConfigs, events } = params;
    const windowStart = Math.max(0, simTimeMs - WINDOW_MS);

    const services: Record<string, ServiceSnapshot> = {};
    let totalThroughput = 0;
    let totalHealth = 0;
    let minThroughput = Number.POSITIVE_INFINITY;
    let bottleneckNodeId: string | null = null;

    for (const [nodeId, node] of nodes.entries()) {
      const nodeEvents = events.filter((evt) => evt.sourceNodeId === nodeId && evt.timestamp >= windowStart);
      const sent = nodeEvents.filter((evt) => evt.type === 'message_sent').length;
      const errors = nodeEvents.filter((evt) => evt.type === 'message_error' || evt.type === 'message_dropped').length;
      const latencies = nodeEvents
        .map((evt) => evt.latencyMs)
        .filter((v): v is number => typeof v === 'number');

      const throughputPerSec = sent / (WINDOW_MS / 1_000);
      const avgLatencyMs = latencies.length === 0 ? 0 : latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
      const p95LatencyMs = percentile(latencies, 0.95);
      const errorRate = sent === 0 ? 0 : errors / sent;
      const queueDepth = node.queueDepth;
      const config = nodeConfigs.get(nodeId);
      const nominalThroughput = config?.throughputPerSec ?? 10;
      const saturationPenalty = Math.min(1, queueDepth / Math.max(1, nominalThroughput));
      const healthScore = Math.max(0, Math.min(1, 1 - errorRate * 0.6 - saturationPenalty * 0.3 - Math.min(1, avgLatencyMs / 1000) * 0.1));

      services[nodeId] = {
        nodeId,
        snapshotAt,
        throughputPerSec,
        avgLatencyMs,
        p95LatencyMs,
        errorRate,
        queueDepth,
        healthScore,
        circuitBreakerState: node.type === 'circuit_breaker' ? node.getCircuitBreakerState() : undefined,
      };

      totalThroughput += throughputPerSec;
      totalHealth += healthScore;

      if (throughputPerSec < minThroughput) {
        minThroughput = throughputPerSec;
        bottleneckNodeId = nodeId;
      }
    }

    const overallHealthScore = nodes.size === 0 ? 0 : totalHealth / nodes.size;

    return {
      runId,
      snapshotAt,
      services,
      totalThroughput,
      bottleneckNodeId,
      overallHealthScore,
    };
  }
}
