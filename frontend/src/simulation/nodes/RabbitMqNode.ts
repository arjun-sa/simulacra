import type { MessageRouter } from '../engine/MessageRouter';
import { BaseNode } from './BaseNode';

// RabbitMQ model: broker-consumer behavior with prefetch and ack timeout semantics.
// Prefetch caps in-flight processing per tick, so large backlogs can persist even with high throughput config.
// Messages whose simulated processing latency exceeds ack timeout are dropped as timeout failures.
export class RabbitMqNode extends BaseNode {
  private carry = 0;

  onTick(_simTimeMs: number, router: MessageRouter): void {
    if (this.isCrashed()) {
      return;
    }

    const throughput = this.config.throughputPerSec ?? 80;
    const prefetch = Math.max(1, this.config.prefetchCount ?? 20);
    const budget = (throughput / 10) + this.carry;
    const toProcess = Math.min(Math.floor(budget), prefetch);
    this.carry = budget - Math.floor(budget);
    const ackTimeoutMs = this.config.ackTimeoutMs ?? 200;

    for (let i = 0; i < toProcess; i += 1) {
      const incoming = this.popNextMessage();
      if (!incoming) {
        break;
      }

      const latency = Math.max(2, Math.round((this.config.latencyMs ?? 8) * (0.8 + Math.random() * 0.4)));
      if (latency > ackTimeoutMs) {
        this.emit({
          type: 'message_dropped',
          sourceNodeId: this.id,
          targetNodeId: incoming.fromNodeId,
          messageId: incoming.message.id,
          latencyMs: latency,
          failureInjected: false,
        });
        continue;
      }

      this.send(router, incoming.message, latency);
    }
  }
}
