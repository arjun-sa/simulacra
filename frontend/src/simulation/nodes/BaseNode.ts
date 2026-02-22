import type { NodeConfig, NodeType, SimEvent } from '../types/simulation';
import type { MessageRouter } from '../engine/MessageRouter';
import type { IncomingMessage, SimMessage } from '../engine/InternalTypes';
import { MetricsCollector } from '../engine/MetricsCollector';

// Base node contract shared by all simulated services.
// It owns inbox/queue bookkeeping, emits receive/send/crash/recover events, and blocks traffic while crashed.
// Concrete nodes only implement onTick processing logic; routing and event shapes stay consistent here.
export abstract class BaseNode {
  readonly id: string;

  readonly type: NodeType;

  readonly config: NodeConfig;

  queueDepth = 0;

  protected inbox: IncomingMessage[] = [];

  protected readonly collector = MetricsCollector.getInstance();

  protected simTimeMs = 0;

  private crashed = false;

  constructor(config: NodeConfig) {
    this.id = config.id;
    this.type = config.type;
    this.config = config;
  }

  abstract onTick(simTimeMs: number, router: MessageRouter): void;

  setSimTime(simTimeMs: number): void {
    this.simTimeMs = simTimeMs;
  }

  reset(): void {
    this.queueDepth = 0;
    this.inbox = [];
    this.crashed = false;
  }

  receiveMessage(message: SimMessage, fromNodeId: string, receivedAt: number): void {
    if (this.crashed) {
      this.emit({
        type: 'message_dropped',
        sourceNodeId: fromNodeId,
        targetNodeId: this.id,
        messageId: message.id,
        failureInjected: true,
      });
      return;
    }

    this.inbox.push({ message, fromNodeId, receivedAt });
    this.queueDepth = this.inbox.length;
    this.emit({
      type: 'message_received',
      sourceNodeId: fromNodeId,
      targetNodeId: this.id,
      messageId: message.id,
      failureInjected: false,
    });
  }

  popNextMessage(): IncomingMessage | undefined {
    const next = this.inbox.shift();
    this.queueDepth = this.inbox.length;
    return next;
  }

  protected send(router: MessageRouter, message: SimMessage, latencyMs = 0, onlyTargetIds?: string[], failureInjected = false): number {
    const fanout = router.routeMessage(this.id, message, {
      latencyMs,
      onlyTargetIds,
      failureInjected,
    });

    if (fanout > 0) {
      this.emit({
        type: 'message_sent',
        sourceNodeId: this.id,
        messageId: message.id,
        latencyMs,
        failureInjected,
      });
    }

    return fanout;
  }

  protected emit(event: Omit<SimEvent, 'id' | 'timestamp'>): void {
    this.collector.recordEvent(event);
  }

  markCrashed(): void {
    if (this.crashed) {
      return;
    }
    this.crashed = true;
    this.emit({
      type: 'node_crashed',
      sourceNodeId: this.id,
      messageId: `${this.id}:crash:${this.simTimeMs}`,
      failureInjected: true,
    });
  }

  markRecovered(): void {
    if (!this.crashed) {
      return;
    }
    this.crashed = false;
    this.emit({
      type: 'node_recovered',
      sourceNodeId: this.id,
      messageId: `${this.id}:recover:${this.simTimeMs}`,
      failureInjected: true,
    });
  }

  isCrashed(): boolean {
    return this.crashed;
  }

  getCircuitBreakerState(): 'closed' | 'open' | 'half-open' | undefined {
    return undefined;
  }
}
