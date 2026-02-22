import type { MessageRouter } from '../engine/MessageRouter';
import { BaseNode } from './BaseNode';

// Cassandra model: partition-friendly datastore with high-ish throughput and eventual-consistency style behavior.
// Throughput budget limits per tick processing while queue pressure increases rejection/error probability.
// Latency jitter is narrower than slow object stores but wider than in-memory services.
export class CassandraNode extends BaseNode {
  private carry = 0;

  onTick(_simTimeMs: number, router: MessageRouter): void {
    if (this.isCrashed()) {
      return;
    }

    const throughput = this.config.throughputPerSec ?? 65;
    const budget = (throughput / 10) + this.carry;
    const toProcess = Math.floor(budget);
    this.carry = budget - toProcess;

    for (let i = 0; i < toProcess; i += 1) {
      const incoming = this.popNextMessage();
      if (!incoming) {
        break;
      }

      const loadFactor = Math.max(0, this.queueDepth / Math.max(1, throughput));
      const dynamicFailureRate = Math.min(0.85, (this.config.failureRate ?? 0.01) + loadFactor * 0.05);
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

      const base = this.config.latencyMs ?? 18;
      const latency = Math.max(6, Math.round(base * (0.7 + Math.random() * 0.6)));
      this.send(router, incoming.message, latency);
    }
  }
}
