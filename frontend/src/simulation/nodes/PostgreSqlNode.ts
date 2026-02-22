import type { MessageRouter } from '../engine/MessageRouter';
import { BaseNode } from './BaseNode';

export class PostgreSqlNode extends BaseNode {
  private carry = 0;

  onTick(_simTimeMs: number, router: MessageRouter): void {
    if (this.isCrashed()) {
      return;
    }

    const throughput = this.config.throughputPerSec ?? 24;
    const budget = (throughput / 10) + this.carry;
    const toProcess = Math.floor(budget);
    this.carry = budget - toProcess;

    for (let i = 0; i < toProcess; i += 1) {
      const incoming = this.popNextMessage();
      if (!incoming) {
        break;
      }

      const loadFactor = Math.max(0, this.queueDepth / Math.max(1, throughput));
      const dynamicFailureRate = Math.min(0.9, (this.config.failureRate ?? 0.02) + loadFactor * 0.12);
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

      const base = this.config.latencyMs ?? 30;
      const latency = Math.max(12, Math.round(base * (0.8 + Math.random() * 0.7)));
      this.send(router, incoming.message, latency);
    }
  }
}
