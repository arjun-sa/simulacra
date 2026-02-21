import type { MessageRouter } from '../engine/MessageRouter';
import { BaseNode } from './BaseNode';

export class LoadBalancerNode extends BaseNode {
  private rrIndex = 0;

  private healthyTargets = new Set<string>();

  initializeTargets(targetIds: string[]): void {
    this.healthyTargets = new Set(targetIds);
  }

  onNodeCrashed(nodeId: string): void {
    this.healthyTargets.delete(nodeId);
  }

  onNodeRecovered(nodeId: string): void {
    this.healthyTargets.add(nodeId);
  }

  onTick(_simTimeMs: number, router: MessageRouter): void {
    if (this.isCrashed()) {
      return;
    }

    const targetIds = Array.from(this.healthyTargets);
    if (targetIds.length === 0) {
      while (this.popNextMessage()) {
        // Drop backlog if all targets are down.
      }
      return;
    }

    const pending = this.inbox.length;
    for (let i = 0; i < pending; i += 1) {
      const incoming = this.popNextMessage();
      if (!incoming) {
        break;
      }
      const target = targetIds[this.rrIndex % targetIds.length];
      this.rrIndex += 1;
      if (!target) {
        continue;
      }
      this.send(router, incoming.message, this.config.latencyMs ?? 2, [target]);
    }
  }
}
