import type { MessageRouter } from '../engine/MessageRouter';
import { generateId } from '../utils/id';
import { BaseNode } from './BaseNode';

export class ProducerNode extends BaseNode {
  private carry = 0;

  onTick(_simTimeMs: number, router: MessageRouter): void {
    if (this.isCrashed()) {
      return;
    }

    const throughput = this.config.throughputPerSec ?? 10;
    const perTick = (throughput / 10) + this.carry;
    const toProduce = Math.floor(perTick);
    this.carry = perTick - toProduce;

    for (let i = 0; i < toProduce; i += 1) {
      const message = { id: generateId(), createdAt: this.simTimeMs };
      this.send(router, message, this.config.latencyMs ?? 0);
    }
  }
}
