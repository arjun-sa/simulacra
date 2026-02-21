import type { MessageRouter } from '../engine/MessageRouter';
import { BaseNode } from './BaseNode';

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
