import type { MessageRouter } from '../engine/MessageRouter';
import { BaseNode } from './BaseNode';

// Kafka model: partitioned broker with queue isolation per partition.
// Incoming messages are assigned round-robin across partitions, then drained per partition throughput budget.
// This produces realistic lag/imbalance effects without requiring full broker semantics.
export class KafkaNode extends BaseNode {
  private readonly partitionQueues: Array<Array<{ id: string; createdAt: number }>>;

  private nextPartition = 0;

  private carryByPartition: number[];

  constructor(config: ConstructorParameters<typeof BaseNode>[0]) {
    super(config);
    const partitions = Math.max(1, config.partitions ?? 3);
    this.partitionQueues = Array.from({ length: partitions }, () => []);
    this.carryByPartition = Array.from({ length: partitions }, () => 0);
  }

  override reset(): void {
    super.reset();
    for (const q of this.partitionQueues) {
      q.length = 0;
    }
    this.nextPartition = 0;
    this.carryByPartition = this.carryByPartition.map(() => 0);
  }

  override receiveMessage(message: { id: string; createdAt: number }, fromNodeId: string, receivedAt: number): void {
    super.receiveMessage(message, fromNodeId, receivedAt);
    const partition = this.nextPartition % this.partitionQueues.length;
    this.nextPartition += 1;
    this.partitionQueues[partition]?.push(message);
    this.queueDepth = this.partitionQueues.reduce((sum, q) => sum + q.length, 0);
  }

  onTick(_simTimeMs: number, router: MessageRouter): void {
    if (this.isCrashed()) {
      return;
    }

    const throughput = this.config.throughputPerSec ?? 50;
    const partRate = throughput / this.partitionQueues.length;

    for (let i = 0; i < this.partitionQueues.length; i += 1) {
      const queue = this.partitionQueues[i];
      if (!queue) {
        continue;
      }
      const toProcessF = (partRate / 10) + (this.carryByPartition[i] ?? 0);
      const toProcess = Math.floor(toProcessF);
      this.carryByPartition[i] = toProcessF - toProcess;
      for (let n = 0; n < toProcess; n += 1) {
        const message = queue.shift();
        if (!message) {
          break;
        }
        this.send(router, message, this.config.latencyMs ?? 5);
      }
    }

    this.queueDepth = this.partitionQueues.reduce((sum, q) => sum + q.length, 0);
  }

  emitPartitionSplit(): void {
    this.emit({
      type: 'partition_split',
      sourceNodeId: this.id,
      messageId: `${this.id}:partition_split:${this.simTimeMs}`,
      failureInjected: true,
    });
  }
}
