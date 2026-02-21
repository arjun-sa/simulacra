import type { MessageRouter } from '../engine/MessageRouter';
import { BaseNode } from './BaseNode';

export class WorkerNode extends BaseNode {
  private carry = 0;

  onTick(_simTimeMs: number, router: MessageRouter): void {
    if (this.isCrashed()) {
      return;
    }

    const replicas = Math.max(1, this.config.replicas ?? 1);
    const throughput = this.config.throughputPerSec ?? replicas * 10;
    const limitFloat = (throughput / 10) + this.carry;
    const limit = Math.floor(limitFloat);
    this.carry = limitFloat - limit;
    const toProcess = Math.min(limit, this.inbox.length, replicas * 10);

    for (let i = 0; i < toProcess; i += 1) {
      const incoming = this.popNextMessage();
      if (!incoming) {
        break;
      }

      const failureRate = Math.max(0, Math.min(1, this.config.failureRate ?? 0));
      if (Math.random() < failureRate) {
        this.emit({
          type: 'message_error',
          sourceNodeId: this.id,
          targetNodeId: incoming.fromNodeId,
          messageId: incoming.message.id,
          failureInjected: false,
        });
        continue;
      }

      const baseLatency = this.config.latencyMs ?? 30;
      const jitter = 0.8 + (Math.random() * 0.4);
      this.send(router, incoming.message, Math.round(baseLatency * jitter));
    }
  }
}
