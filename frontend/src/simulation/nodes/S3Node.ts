import type { MessageRouter } from '../engine/MessageRouter';
import { BaseNode } from './BaseNode';

// S3 model: object storage sink/profile with high latency and lower request throughput.
// Multipart threshold increases effective latency to represent large-object upload overhead.
// Failure rate is typically low but non-zero, which helps model durable-store write failures.
export class S3Node extends BaseNode {
  private carry = 0;

  onTick(_simTimeMs: number, router: MessageRouter): void {
    if (this.isCrashed()) {
      return;
    }

    const throughput = this.config.throughputPerSec ?? 15;
    const budget = (throughput / 10) + this.carry;
    const toProcess = Math.floor(budget);
    this.carry = budget - toProcess;
    const multipartThresholdMb = this.config.multipartThresholdMb ?? 16;

    for (let i = 0; i < toProcess; i += 1) {
      const incoming = this.popNextMessage();
      if (!incoming) {
        break;
      }

      if (Math.random() < Math.max(0, Math.min(0.5, this.config.failureRate ?? 0.005))) {
        this.emit({
          type: 'message_error',
          sourceNodeId: this.id,
          targetNodeId: incoming.fromNodeId,
          messageId: incoming.message.id,
          failureInjected: false,
        });
        continue;
      }

      const base = this.config.latencyMs ?? 90;
      const latency = Math.max(20, Math.round(base * (0.85 + Math.random() * 0.8)) + Math.floor(multipartThresholdMb / 8));
      this.send(router, incoming.message, latency);
    }
  }
}
