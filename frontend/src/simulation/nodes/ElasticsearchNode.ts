import type { MessageRouter } from '../engine/MessageRouter';
import { BaseNode } from './BaseNode';

// Elasticsearch model: indexing/search backend with refresh-cycle overhead.
// It enforces per-tick indexing capacity and can reject traffic as queues grow.
// Latency includes configurable refresh influence, so tuning refresh interval affects end-to-end timing.
export class ElasticsearchNode extends BaseNode {
  private carry = 0;

  onTick(_simTimeMs: number, router: MessageRouter): void {
    if (this.isCrashed()) {
      return;
    }

    const throughput = this.config.throughputPerSec ?? 45;
    const budget = (throughput / 10) + this.carry;
    const toProcess = Math.floor(budget);
    this.carry = budget - toProcess;
    const refreshMs = this.config.indexRefreshMs ?? 1000;

    for (let i = 0; i < toProcess; i += 1) {
      const incoming = this.popNextMessage();
      if (!incoming) {
        break;
      }

      const rejectRate = Math.min(0.8, (this.config.failureRate ?? 0.01) + (this.queueDepth / Math.max(1, throughput)) * 0.1);
      if (Math.random() < rejectRate) {
        this.emit({
          type: 'message_error',
          sourceNodeId: this.id,
          targetNodeId: incoming.fromNodeId,
          messageId: incoming.message.id,
          failureInjected: false,
        });
        continue;
      }

      const base = this.config.latencyMs ?? 22;
      const latency = Math.max(5, Math.round(base * (0.8 + Math.random() * 0.6)) + Math.floor(refreshMs / 1000));
      this.send(router, incoming.message, latency);
    }
  }
}
