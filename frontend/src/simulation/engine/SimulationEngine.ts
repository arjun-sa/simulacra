import type { NodeConfig, SimEvent, SystemSnapshot, TopologyConfig } from '../types/simulation';
import { MetricsCollector } from './MetricsCollector';
import { MetricsAggregator } from './MetricsAggregator';
import { FailureInjector } from './FailureInjector';
import { MessageRouter } from './MessageRouter';
import type { ScheduledDelivery, SimMessage } from './InternalTypes';
import { generateId } from '../utils/id';
import { BaseNode } from '../nodes/BaseNode';
import { ProducerNode } from '../nodes/ProducerNode';
import { KafkaNode } from '../nodes/KafkaNode';
import { WorkerNode } from '../nodes/WorkerNode';
import { DatabaseNode } from '../nodes/DatabaseNode';
import { CacheNode } from '../nodes/CacheNode';
import { LoadBalancerNode } from '../nodes/LoadBalancerNode';
import { ApiGatewayNode } from '../nodes/ApiGatewayNode';
import { CircuitBreakerNode } from '../nodes/CircuitBreakerNode';
import { DeadLetterQueueNode } from '../nodes/DeadLetterQueueNode';
import { ConsumerGroupNode } from '../nodes/ConsumerGroupNode';

const DEFAULT_TICK_MS = 100;
type MessageLifecycleStatus = 'in_flight' | 'routing_to_dlq' | 'delivered' | 'dlq';

export class SimulationEngine {
  private readonly topology: TopologyConfig;

  private readonly collector = MetricsCollector.getInstance();

  private readonly aggregator = new MetricsAggregator();

  readonly failureInjector = new FailureInjector();

  private readonly nodeConfigs = new Map<string, NodeConfig>();

  private readonly nodes = new Map<string, BaseNode>();

  private readonly callbacks: Array<(snapshot: SystemSnapshot) => void> = [];

  private readonly scheduledDeliveries: ScheduledDelivery[] = [];
  private readonly sinkNodeIds = new Set<string>();
  private readonly dlqNodeIds: string[] = [];
  private readonly messageLifecycle = new Map<string, MessageLifecycleStatus>();
  private readonly messageCache = new Map<string, SimMessage>();
  private processedEventIndex = 0;

  private runId = generateId();

  private simTimeMs = 0;

  private tickTimer: ReturnType<typeof setInterval> | undefined;

  private snapshotTimer: ReturnType<typeof setInterval> | undefined;

  private speedMultiplier = 1;

  private paused = false;

  private readonly router: MessageRouter;

  constructor(topology: TopologyConfig) {
    this.topology = topology;
    for (const config of topology.nodes) {
      this.nodeConfigs.set(config.id, config);
      const node = this.createNode(config);
      this.nodes.set(config.id, node);
      if (config.type === 'dead_letter_queue') {
        this.dlqNodeIds.push(config.id);
      }
      if (config.sink) {
        this.sinkNodeIds.add(config.id);
      }
    }

    this.router = new MessageRouter(topology, (delivery) => this.scheduleDelivery(delivery), () => this.simTimeMs);

    for (const node of this.nodes.values()) {
      if (node instanceof LoadBalancerNode) {
        node.initializeTargets(this.router.getDownstreamNodeIds(node.id));
      }
    }
  }

  start(): void {
    if (this.tickTimer) {
      return;
    }

    this.paused = false;
    const interval = Math.max(10, Math.floor(DEFAULT_TICK_MS / this.speedMultiplier));
    this.tickTimer = setInterval(() => this.tick(), interval);
    this.snapshotTimer = setInterval(() => this.publishSnapshot(), 2_000);
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  reset(): void {
    this.stopTimers();
    this.runId = generateId();
    this.simTimeMs = 0;
    this.paused = false;
    this.scheduledDeliveries.length = 0;
    this.messageLifecycle.clear();
    this.messageCache.clear();
    this.processedEventIndex = 0;
    this.collector.clear();
    this.failureInjector.reset();

    for (const node of this.nodes.values()) {
      node.reset();
    }

    for (const node of this.nodes.values()) {
      if (node instanceof LoadBalancerNode) {
        node.initializeTargets(this.router.getDownstreamNodeIds(node.id));
      }
    }
  }

  setSpeed(multiplier: number): void {
    const clamped = Math.max(0.5, Math.min(5, multiplier));
    this.speedMultiplier = clamped;

    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      const interval = Math.max(10, Math.floor(DEFAULT_TICK_MS / this.speedMultiplier));
      this.tickTimer = setInterval(() => this.tick(), interval);
    }
  }

  tick(): void {
    if (this.paused) {
      return;
    }

    this.runTick();
  }

  step(): void {
    this.runTick();
  }

  private runTick(): void {
    this.simTimeMs += DEFAULT_TICK_MS;
    this.collector.setCurrentSimTime(this.simTimeMs);

    this.syncFailureState();

    for (const node of this.nodes.values()) {
      node.setSimTime(this.simTimeMs);
      node.onTick(this.simTimeMs, this.router);
    }

    this.processDueDeliveries();
    this.processNewEvents();
    this.processDueDeliveries();
    this.processNewEvents();
  }

  onSnapshot(cb: (snapshot: SystemSnapshot) => void): void {
    this.callbacks.push(cb);
  }

  getRunId(): string {
    return this.runId;
  }

  getSimTimeMs(): number {
    return this.simTimeMs;
  }

  getNode(nodeId: string): BaseNode | undefined {
    return this.nodes.get(nodeId);
  }

  getEvents() {
    return this.collector.getEvents();
  }

  getSnapshot(): SystemSnapshot {
    return this.aggregator.computeSnapshot({
      runId: this.runId,
      simTimeMs: this.simTimeMs,
      snapshotAt: Date.now(),
      nodes: this.nodes,
      nodeConfigs: this.nodeConfigs,
      events: this.collector.getEvents(),
    });
  }

  private publishSnapshot(): void {
    const snapshot = this.getSnapshot();

    for (const cb of this.callbacks) {
      cb(snapshot);
    }
  }

  private scheduleDelivery(delivery: ScheduledDelivery): void {
    this.messageCache.set(delivery.message.id, delivery.message);
    if (this.shouldSkipDelivery(delivery.message.id, delivery.targetNodeId)) {
      return;
    }
    this.scheduledDeliveries.push(delivery);
    this.scheduledDeliveries.sort((a, b) => a.deliverAt - b.deliverAt);
  }

  private processDueDeliveries(): void {
    while (this.scheduledDeliveries.length > 0) {
      const next = this.scheduledDeliveries[0];
      if (!next || next.deliverAt > this.simTimeMs) {
        break;
      }
      this.scheduledDeliveries.shift();
      if (this.shouldSkipDelivery(next.message.id, next.targetNodeId)) {
        continue;
      }

      if (next.forcedEventType) {
        this.collector.recordEvent({
          type: next.forcedEventType,
          sourceNodeId: next.sourceNodeId,
          targetNodeId: next.targetNodeId,
          messageId: next.message.id,
          failureInjected: next.failureInjected ?? false,
        });
        continue;
      }

      const target = this.nodes.get(next.targetNodeId);
      if (!target) {
        continue;
      }

      target.receiveMessage(next.message, next.sourceNodeId, this.simTimeMs);
    }
  }

  private processNewEvents(): void {
    const events = this.collector.getEvents();
    for (let i = this.processedEventIndex; i < events.length; i += 1) {
      const event = events[i];
      if (!event) {
        continue;
      }

      if (event.type === 'message_received') {
        this.handleMessageReceived(event);
        continue;
      }

      if (event.type === 'message_error' || event.type === 'message_dropped') {
        this.handleMessageFailure(event);
      }
    }
    this.processedEventIndex = events.length;
  }

  private handleMessageReceived(event: SimEvent): void {
    if (!event.targetNodeId) {
      return;
    }

    if (this.isDlqNode(event.targetNodeId)) {
      this.messageLifecycle.set(event.messageId, 'dlq');
      return;
    }

    if (this.sinkNodeIds.has(event.targetNodeId)) {
      this.messageLifecycle.set(event.messageId, 'delivered');
    }
  }

  private handleMessageFailure(event: SimEvent): void {
    const current = this.messageLifecycle.get(event.messageId) ?? 'in_flight';
    if (current !== 'in_flight') {
      return;
    }

    this.messageLifecycle.set(event.messageId, 'routing_to_dlq');
    const fromNodeId = event.sourceNodeId;
    const dlqTargetId = this.pickDlqTarget(fromNodeId);
    if (!dlqTargetId) {
      this.messageLifecycle.set(event.messageId, 'dlq');
      return;
    }

    const message = this.messageCache.get(event.messageId) ?? {
      id: event.messageId,
      createdAt: this.simTimeMs,
    };

    this.scheduleDelivery({
      deliverAt: this.simTimeMs,
      sourceNodeId: fromNodeId,
      targetNodeId: dlqTargetId,
      message,
      failureInjected: event.failureInjected,
    });
  }

  private pickDlqTarget(sourceNodeId: string): string | undefined {
    const downstreamDlq = this.router
      .getDownstreamNodeIds(sourceNodeId)
      .filter((nodeId) => this.isDlqNode(nodeId));
    if (downstreamDlq.length > 0) {
      return downstreamDlq[0];
    }
    return this.dlqNodeIds[0];
  }

  private shouldSkipDelivery(messageId: string, targetNodeId: string): boolean {
    const state = this.messageLifecycle.get(messageId) ?? 'in_flight';
    if (state === 'delivered' || state === 'dlq') {
      return true;
    }
    if (state === 'routing_to_dlq' && !this.isDlqNode(targetNodeId)) {
      return true;
    }
    return false;
  }

  private isDlqNode(nodeId: string): boolean {
    return this.nodeConfigs.get(nodeId)?.type === 'dead_letter_queue';
  }

  private syncFailureState(): void {
    for (const [nodeId, node] of this.nodes.entries()) {
      const shouldCrash = this.failureInjector.isNodeCrashed(nodeId);
      if (shouldCrash && !node.isCrashed()) {
        node.markCrashed();
        for (const maybeLb of this.nodes.values()) {
          if (maybeLb instanceof LoadBalancerNode) {
            maybeLb.onNodeCrashed(nodeId);
          }
        }
      } else if (!shouldCrash && node.isCrashed()) {
        node.markRecovered();
        for (const maybeLb of this.nodes.values()) {
          if (maybeLb instanceof LoadBalancerNode) {
            maybeLb.onNodeRecovered(nodeId);
          }
        }
      }

      if (node instanceof KafkaNode && this.failureInjector.consumePartitionSplit(nodeId)) {
        node.emitPartitionSplit();
      }

      const spike = this.failureInjector.shouldFailMessage(node.config).latencySpikeMs;
      if (spike > 0) {
        this.collector.recordEvent({
          type: 'latency_spike',
          sourceNodeId: nodeId,
          messageId: `${nodeId}:spike:${this.simTimeMs}`,
          latencyMs: spike,
          failureInjected: true,
        });
      }
    }
  }

  private createNode(config: NodeConfig): BaseNode {
    switch (config.type) {
      case 'producer':
        return new ProducerNode(config);
      case 'kafka':
        return new KafkaNode(config);
      case 'worker':
        return new WorkerNode(config);
      case 'database':
        return new DatabaseNode(config);
      case 'cache':
        return new CacheNode(config);
      case 'load_balancer':
        return new LoadBalancerNode(config);
      case 'api_gateway':
        return new ApiGatewayNode(config);
      case 'circuit_breaker':
        return new CircuitBreakerNode(config);
      case 'dead_letter_queue':
        return new DeadLetterQueueNode(config);
      case 'consumer_group':
        return new ConsumerGroupNode(config);
      default:
        throw new Error(`Unsupported node type: ${String(config.type)}`);
    }
  }

  private stopTimers(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = undefined;
    }
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = undefined;
    }
  }
}
