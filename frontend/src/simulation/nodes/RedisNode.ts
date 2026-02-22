import type { MessageRouter } from '../engine/MessageRouter';
import { BaseNode } from './BaseNode';

// Redis model: high-throughput in-memory service with fast-path hit behavior.
// Hit rate biases latency lower to approximate memory hits vs slower fallback operations.
// Unlike CacheNode, this node always forwards, so it behaves like an inline cache/service tier.
export class RedisNode extends BaseNode {
  private carry = 0;

  onTick(_simTimeMs: number, router: MessageRouter): void {
    if (this.isCrashed()) {
      return;
    }

    const throughput = this.config.throughputPerSec ?? 120;
    const budget = (throughput / 10) + this.carry;
    const toProcess = Math.floor(budget);
    this.carry = budget - toProcess;
    const hitRate = Math.max(0, Math.min(1, this.config.cacheHitRate ?? 0.8));

    for (let i = 0; i < toProcess; i += 1) {
      const incoming = this.popNextMessage();
      if (!incoming) {
        break;
      }

      const isHit = Math.random() < hitRate;
      const latency = isHit ? 1 + Math.floor(Math.random() * 3) : (this.config.latencyMs ?? 6);
      this.send(router, incoming.message, latency);
    }
  }
}
