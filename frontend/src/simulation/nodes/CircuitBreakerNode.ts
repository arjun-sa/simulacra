import type { MessageRouter } from '../engine/MessageRouter';
import { BaseNode } from './BaseNode';

type CircuitState = 'closed' | 'open' | 'half-open';

// Circuit breaker model: protects downstream calls with closed/open/half-open behavior.
// It tracks recent success/failure outcomes and opens when error ratio crosses threshold.
// While open it rejects traffic, then probes in half-open mode and closes only after consecutive successes.
export class CircuitBreakerNode extends BaseNode {
  private state: CircuitState = 'closed';

  private stateChangedAt = 0;

  private recent: Array<{ t: number; ok: boolean }> = [];

  private halfOpenSuccesses = 0;

  onTick(simTimeMs: number, router: MessageRouter): void {
    if (this.isCrashed()) {
      return;
    }

    this.recent = this.recent.filter((entry) => simTimeMs - entry.t <= 10_000);

    if (this.state === 'open' && simTimeMs - this.stateChangedAt >= 5_000) {
      this.transition('half-open');
    }

    const pending = this.inbox.length;
    for (let i = 0; i < pending; i += 1) {
      const incoming = this.popNextMessage();
      if (!incoming) {
        break;
      }

      if (this.state === 'open') {
        this.emit({
          type: 'message_error',
          sourceNodeId: this.id,
          targetNodeId: incoming.fromNodeId,
          messageId: incoming.message.id,
          failureInjected: false,
        });
        continue;
      }

      const failureRate = Math.max(0, Math.min(1, this.config.failureRate ?? 0));
      const failed = Math.random() < failureRate;
      this.recent.push({ t: simTimeMs, ok: !failed });

      if (this.state === 'half-open') {
        if (failed) {
          this.transition('open');
          this.halfOpenSuccesses = 0;
          this.emit({
            type: 'message_error',
            sourceNodeId: this.id,
            targetNodeId: incoming.fromNodeId,
            messageId: incoming.message.id,
            failureInjected: false,
          });
          continue;
        }

        this.halfOpenSuccesses += 1;
        if (this.halfOpenSuccesses >= 3) {
          this.transition('closed');
          this.halfOpenSuccesses = 0;
        }
      }

      if (this.state === 'closed') {
        const errors = this.recent.filter((r) => !r.ok).length;
        const errorRate = this.recent.length === 0 ? 0 : errors / this.recent.length;
        const threshold = this.config.circuitBreakerThreshold ?? 0.5;
        if (errorRate > threshold) {
          this.transition('open');
          this.emit({
            type: 'message_error',
            sourceNodeId: this.id,
            targetNodeId: incoming.fromNodeId,
            messageId: incoming.message.id,
            failureInjected: false,
          });
          continue;
        }
      }

      if (failed) {
        this.emit({
          type: 'message_error',
          sourceNodeId: this.id,
          targetNodeId: incoming.fromNodeId,
          messageId: incoming.message.id,
          failureInjected: false,
        });
        continue;
      }

      this.send(router, incoming.message, this.config.latencyMs ?? 2);
    }
  }

  private transition(next: CircuitState): void {
    if (this.state === next) {
      return;
    }
    this.state = next;
    this.stateChangedAt = this.simTimeMs;
    this.emit({
      type: 'latency_spike',
      sourceNodeId: this.id,
      messageId: `${this.id}:state:${next}:${this.simTimeMs}`,
      failureInjected: false,
    });
  }

  override getCircuitBreakerState(): CircuitState {
    return this.state;
  }
}
