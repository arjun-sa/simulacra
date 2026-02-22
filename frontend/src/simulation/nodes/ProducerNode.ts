import type { MessageRouter } from '../engine/MessageRouter';
import { generateId } from '../utils/id';
import { BaseNode } from './BaseNode';

// Producer model: synthetic ingress source for the whole topology.
// It creates new message IDs each tick using fractional carry so sub-10 TPS values still behave smoothly.
// It has no inbox dependency, so downstream pressure appears as queue growth in later nodes.
export class ProducerNode extends BaseNode {
  private carry = 0;

  onTick(_simTimeMs: number, router: MessageRouter): void {
    if (this.isCrashed()) {
      return;
    }

    const throughput = this.config.throughputPerSec ?? 1;
    const perTick = (throughput / 10) + this.carry;
    const toProduce = Math.floor(perTick);
    this.carry = perTick - toProduce;

    for (let i = 0; i < toProduce; i += 1) {
      const message = { id: generateId(), createdAt: this.simTimeMs };
      this.send(router, message, this.config.latencyMs ?? 0);
    }
  }
}
