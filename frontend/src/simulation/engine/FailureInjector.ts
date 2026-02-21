import type { NodeConfig } from '../types/simulation';

export interface FailureDecision {
  drop: boolean;
  error: boolean;
  latencySpikeMs: number;
}

export class FailureInjector {
  private crashedNodes = new Set<string>();

  private latencySpikes = new Map<string, number>();

  private partitionSplits = new Set<string>();

  shouldFailMessage(node: NodeConfig): FailureDecision {
    const failureRate = Math.min(1, Math.max(0, node.failureRate ?? 0));
    const roll = Math.random();
    const error = roll < failureRate;
    const drop = !error && roll < failureRate * 0.5;
    const latencySpikeMs = this.latencySpikes.get(node.id) ?? 0;

    return { drop, error, latencySpikeMs };
  }

  crashNode(nodeId: string): void {
    this.crashedNodes.add(nodeId);
  }

  recoverNode(nodeId: string): void {
    this.crashedNodes.delete(nodeId);
  }

  isNodeCrashed(nodeId: string): boolean {
    return this.crashedNodes.has(nodeId);
  }

  injectLatencySpike(nodeId: string, spikeMs: number): void {
    this.latencySpikes.set(nodeId, Math.max(0, spikeMs));
  }

  clearLatencySpike(nodeId: string): void {
    this.latencySpikes.delete(nodeId);
  }

  triggerPartitionSplit(nodeId: string): void {
    this.partitionSplits.add(nodeId);
  }

  consumePartitionSplit(nodeId: string): boolean {
    if (!this.partitionSplits.has(nodeId)) {
      return false;
    }
    this.partitionSplits.delete(nodeId);
    return true;
  }

  reset(): void {
    this.crashedNodes.clear();
    this.latencySpikes.clear();
    this.partitionSplits.clear();
  }
}
