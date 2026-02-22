import type { EdgeConfig, TopologyConfig } from '../types/simulation';
import type { ScheduledDelivery, SimMessage } from './InternalTypes';

export interface RouteOptions {
  onlyTargetIds?: string[];
  latencyMs?: number;
  forcedEventType?: 'message_error' | 'message_dropped';
  failureInjected?: boolean;
}

export class MessageRouter {
  private readonly edgeMap = new Map<string, EdgeConfig[]>();
  private readonly routingModeByNode = new Map<string, 'single' | 'broadcast'>();
  private readonly dlqNodeIds = new Set<string>();

  constructor(
    topology: TopologyConfig,
    private readonly scheduleDelivery: (delivery: ScheduledDelivery) => void,
    private readonly getSimTime: () => number,
  ) {
    for (const edge of topology.edges) {
      const list = this.edgeMap.get(edge.sourceId) ?? [];
      list.push(edge);
      this.edgeMap.set(edge.sourceId, list);
    }
    for (const node of topology.nodes) {
      this.routingModeByNode.set(node.id, node.routingMode ?? 'single');
      if (node.type === 'dead_letter_queue') {
        this.dlqNodeIds.add(node.id);
      }
    }
  }

  routeMessage(fromNodeId: string, message: SimMessage, options?: RouteOptions): number {
    const outgoing = this.edgeMap.get(fromNodeId) ?? [];
    const nonDlqOutgoing = outgoing.filter((edge) => !this.dlqNodeIds.has(edge.targetId));
    const candidates = nonDlqOutgoing.length > 0 ? nonDlqOutgoing : outgoing;
    const targets = options?.onlyTargetIds
      ? outgoing.filter((edge) => options.onlyTargetIds?.includes(edge.targetId))
      : this.selectTargets(fromNodeId, message.id, candidates);

    const latencyMs = options?.latencyMs ?? 0;
    const now = this.getSimTime();

    for (const edge of targets) {
      this.scheduleDelivery({
        deliverAt: now + latencyMs,
        sourceNodeId: fromNodeId,
        targetNodeId: edge.targetId,
        message,
        forcedEventType: options?.forcedEventType,
        failureInjected: options?.failureInjected,
      });
    }

    return targets.length;
  }

  getDownstreamNodeIds(nodeId: string): string[] {
    return (this.edgeMap.get(nodeId) ?? []).map((edge) => edge.targetId);
  }

  private selectTargets(fromNodeId: string, messageId: string, outgoing: EdgeConfig[]): EdgeConfig[] {
    if (outgoing.length <= 1) {
      return outgoing;
    }

    const routingMode = this.routingModeByNode.get(fromNodeId) ?? 'single';
    if (routingMode === 'broadcast') {
      return outgoing;
    }

    const index = this.deterministicIndex(messageId, outgoing.length);
    const selected = outgoing[index];
    return selected ? [selected] : [];
  }

  private deterministicIndex(key: string, size: number): number {
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) {
      hash = ((hash * 31) + key.charCodeAt(i)) >>> 0;
    }
    return hash % size;
  }
}
