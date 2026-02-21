import type { MessageRouter } from '../engine/MessageRouter';
import { BaseNode } from './BaseNode';

export class DeadLetterQueueNode extends BaseNode {
  onTick(_simTimeMs: number, _router: MessageRouter): void {
    // Intentionally no processing. DLQ accumulates.
    this.queueDepth = this.inbox.length;
  }
}
