import type { MessageRouter } from '../engine/MessageRouter';
import { BaseNode } from './BaseNode';

// Rate limiter model: token-bucket admission control for upstream protection.
// Tokens refill over time from configured rate and burst; requests without tokens are dropped immediately.
// This node is useful for testing how aggressive throttling shifts failures from downstream to ingress.
export class RateLimiterNode extends BaseNode {
  private tokens = 0;

  private lastRefillMs = 0;

  onTick(simTimeMs: number, router: MessageRouter): void {
    if (this.isCrashed()) {
      return;
    }

    const rate = Math.max(1, this.config.rateLimitPerSec ?? this.config.throughputPerSec ?? 20);
    const burst = Math.max(1, this.config.burstCapacity ?? rate);
    if (this.lastRefillMs === 0) {
      this.lastRefillMs = simTimeMs;
      this.tokens = burst;
    }

    const elapsedMs = Math.max(0, simTimeMs - this.lastRefillMs);
    const refill = (rate * elapsedMs) / 1_000;
    this.tokens = Math.min(burst, this.tokens + refill);
    this.lastRefillMs = simTimeMs;

    const pending = this.inbox.length;
    for (let i = 0; i < pending; i += 1) {
      const incoming = this.popNextMessage();
      if (!incoming) {
        break;
      }

      if (this.tokens < 1) {
        this.emit({
          type: 'message_dropped',
          sourceNodeId: this.id,
          targetNodeId: incoming.fromNodeId,
          messageId: incoming.message.id,
          failureInjected: false,
        });
        continue;
      }

      this.tokens -= 1;
      this.send(router, incoming.message, this.config.latencyMs ?? 1);
    }
  }

  override reset(): void {
    super.reset();
    this.tokens = 0;
    this.lastRefillMs = 0;
  }
}
