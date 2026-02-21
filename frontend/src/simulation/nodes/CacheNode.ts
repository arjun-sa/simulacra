import type { MessageRouter } from '../engine/MessageRouter';
import { BaseNode } from './BaseNode';

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
        const latency = 1 + Math.floor(Math.random() * 5);
        this.send(router, incoming.message, latency);
      } else {
        this.send(router, incoming.message, this.config.latencyMs ?? 5);
      }
    }
  }
}
