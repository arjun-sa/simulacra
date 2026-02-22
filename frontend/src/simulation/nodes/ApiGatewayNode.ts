import type { MessageRouter } from '../engine/MessageRouter';
import { BaseNode } from './BaseNode';

// API gateway model: applies admission control before requests enter the internal system.
// It enforces a per-tick throughput budget and drops over-capacity traffic to simulate shedding.
// It also drops when configured latency exceeds timeout to mimic gateway timeout behavior.
export class ApiGatewayNode extends BaseNode {
  private carry = 0;

  onTick(_simTimeMs: number, router: MessageRouter): void {
    if (this.isCrashed()) {
      return;
    }

    const throughput = Math.max(1, this.config.throughputPerSec ?? 100);
    const capacityFloat = (throughput / 10) + this.carry;
    const capacity = Math.floor(capacityFloat);
    this.carry = capacityFloat - capacity;

    let processed = 0;
    while (this.inbox.length > 0) {
      const incoming = this.popNextMessage();
      if (!incoming) {
        break;
      }

      if (processed >= capacity) {
        this.emit({
          type: 'message_dropped',
          sourceNodeId: this.id,
          targetNodeId: incoming.fromNodeId,
          messageId: incoming.message.id,
          failureInjected: false,
        });
        continue;
      }

      processed += 1;

      const timeoutMs = this.config.timeoutMs ?? 250;
      const latency = this.config.latencyMs ?? 20;
      if (latency > timeoutMs) {
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
