import type { MessageRouter } from '../engine/MessageRouter';
import { BaseNode } from './BaseNode';

// Cache model: read-through style cache gate in front of downstream dependencies.
// Hits terminate locally (no forward), which directly reduces downstream load and queue pressure.
// Misses incur cache latency and continue downstream to the next dependency.
export class CacheNode extends BaseNode {
  onTick(_simTimeMs: number, router: MessageRouter): void {
    if (this.isCrashed()) {
      return;
    }

    const toProcess = this.inbox.length;
    const hitRate = Math.max(0, Math.min(1, this.config.cacheHitRate ?? 0.7));

    for (let i = 0; i < toProcess; i += 1) {
      const incoming = this.popNextMessage();
      if (!incoming) {
        break;
      }

      const isHit = Math.random() < hitRate;
      if (isHit) {
        // Cache hit is served here; do not forward downstream.
        // This makes hits reduce load on dependent services.
        continue;
      } else {
        this.send(router, incoming.message, this.config.latencyMs ?? 5);
      }
    }
  }
}
