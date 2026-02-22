import type { MessageRouter } from '../engine/MessageRouter';
import { BaseNode } from './BaseNode';

// Consumer group model: consumes broker backlog with replica-scaled capacity.
// Effective throughput is reduced when replicas are marked down, and carry preserves fractional rates across ticks.
// It tracks lag as a first-class signal so backlog pressure is visible in metrics.
export class ConsumerGroupNode extends BaseNode {
  private carry = 0;

  private downReplicas = 0;

  private lag = 0;

  setDownReplicas(count: number): void {
    this.downReplicas = Math.max(0, count);
  }

  getLag(): number {
    return this.lag;
  }

  onTick(_simTimeMs: number, router: MessageRouter): void {
    if (this.isCrashed()) {
      return;
    }

    const replicas = Math.max(1, this.config.replicas ?? 1);
    const activeReplicas = Math.max(1, replicas - this.downReplicas);
    const throughput = this.config.throughputPerSec ?? replicas * 10;
    const perTick = ((throughput * (activeReplicas / replicas)) / 10) + this.carry;
    const toProcess = Math.floor(perTick);
    this.carry = perTick - toProcess;

    for (let i = 0; i < toProcess; i += 1) {
      const incoming = this.popNextMessage();
      if (!incoming) {
        break;
      }
      this.send(router, incoming.message, this.config.latencyMs ?? 10);
    }

    this.lag = Math.max(0, this.inbox.length - toProcess);
    this.queueDepth = this.inbox.length;
  }
}
