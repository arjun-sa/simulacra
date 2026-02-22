import type { MessageRouter } from '../engine/MessageRouter';
import { BaseNode } from './BaseNode';

// Generic database model: latency-sensitive persistent store with limited write/read throughput.
// Processing budget is throughput-bound each tick, so backlog naturally accumulates under burst traffic.
// Error probability increases with queue pressure to mimic saturation and timeout amplification.
export class DatabaseNode extends BaseNode {
  private carry = 0;

  onTick(_simTimeMs: number, router: MessageRouter): void {
    if (this.isCrashed()) {
      return;
    }

    const throughput = this.config.throughputPerSec ?? 20;
    const budget = (throughput / 10) + this.carry;
    const toProcess = Math.floor(budget);
    this.carry = budget - toProcess;

    for (let i = 0; i < toProcess; i += 1) {
      const incoming = this.popNextMessage();
      if (!incoming) {
        break;
      }

      const loadFactor = Math.max(0, this.queueDepth / Math.max(1, throughput));
      const dynamicFailureRate = Math.min(0.95, (this.config.failureRate ?? 0.02) + loadFactor * 0.2);
      if (Math.random() < dynamicFailureRate) {
        this.emit({
          type: 'message_error',
          sourceNodeId: this.id,
          targetNodeId: incoming.fromNodeId,
          messageId: incoming.message.id,
          failureInjected: false,
        });
        continue;
      }

      const base = this.config.latencyMs ?? 40;
      const latency = Math.max(20, Math.min(80, Math.round(base * (0.75 + Math.random() * 0.75))));
      this.send(router, incoming.message, latency);
    }
  }
}
