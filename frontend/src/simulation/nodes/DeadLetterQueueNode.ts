import type { MessageRouter } from '../engine/MessageRouter';
import { BaseNode } from './BaseNode';

// DLQ model: terminal failure sink.
// Failed messages can be routed here by engine-level failure handling when explicit DLQ edges exist.
// It intentionally never forwards, so queue depth reflects unresolved operational debt.
export class DeadLetterQueueNode extends BaseNode {
  onTick(_simTimeMs: number, _router: MessageRouter): void {
    // Intentionally no processing. DLQ accumulates.
    this.queueDepth = this.inbox.length;
  }
}
