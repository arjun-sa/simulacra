import { CanvasNode, NodeType } from '../types';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { X } from 'lucide-react';

interface NodeConfigPanelProps {
  node: CanvasNode | null;
  onUpdate: (updates: Partial<CanvasNode>) => void;
  onClose: () => void;
}

const TYPE_FIELDS: Record<NodeType, string[]> = {
  producer: ['latencyMs', 'throughputPerSec'],
  kafka: ['partitions', 'throughputPerSec', 'latencyMs'],
  worker: ['replicas', 'latencyMs', 'throughputPerSec', 'failureRate'],
  database: ['latencyMs', 'throughputPerSec', 'failureRate'],
  postgresql: ['latencyMs', 'throughputPerSec', 'failureRate'],
  mongodb: ['replicas', 'latencyMs', 'throughputPerSec', 'failureRate'],
  cassandra: ['replicationFactor', 'latencyMs', 'throughputPerSec', 'failureRate'],
  elasticsearch: ['indexRefreshMs', 'latencyMs', 'throughputPerSec', 'failureRate'],
  cache: ['cacheHitRate', 'latencyMs', 'throughputPerSec'],
  redis: ['cacheHitRate', 'latencyMs', 'throughputPerSec', 'maxMemoryMb'],
  rabbitmq: ['prefetchCount', 'ackTimeoutMs', 'latencyMs', 'throughputPerSec'],
  s3: ['multipartThresholdMb', 'latencyMs', 'throughputPerSec', 'failureRate'],
  rate_limiter: ['rateLimitPerSec', 'burstCapacity', 'latencyMs'],
  load_balancer: ['replicas', 'latencyMs', 'throughputPerSec'],
  api_gateway: ['latencyMs', 'throughputPerSec', 'timeoutMs'],
  circuit_breaker: ['circuitBreakerThreshold', 'timeoutMs', 'failureRate'],
  dead_letter_queue: ['throughputPerSec'],
  consumer_group: ['replicas', 'latencyMs', 'throughputPerSec'],
};

const FIELD_LABELS: Record<string, string> = {
  latencyMs: 'Latency (ms)',
  throughputPerSec: 'Throughput (req/s)',
  replicas: 'Replicas',
  partitions: 'Partitions',
  failureRate: 'Failure Rate (0-1)',
  timeoutMs: 'Timeout (ms)',
  ackTimeoutMs: 'Ack Timeout (ms)',
  cacheHitRate: 'Cache Hit Rate (0-1)',
  maxMemoryMb: 'Max Memory (MB)',
  prefetchCount: 'Prefetch Count',
  replicationFactor: 'Replication Factor',
  indexRefreshMs: 'Index Refresh (ms)',
  multipartThresholdMb: 'Multipart Threshold (MB)',
  rateLimitPerSec: 'Rate Limit (req/s)',
  burstCapacity: 'Burst Capacity',
  circuitBreakerThreshold: 'CB Threshold (0-1)',
};

export function NodeConfigPanel({ node, onUpdate, onClose }: NodeConfigPanelProps) {
  if (!node) {
    return null;
  }

  const relevantFields = TYPE_FIELDS[node.type] || [];

  return (
    <div className="w-80 bg-white border-l border-gray-200 p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Node Configuration</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="label">Label</Label>
          <Input
            id="label"
            value={node.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
            className="mt-1"
          />
        </div>

        <div>
          <Label>Type</Label>
          <div className="mt-1 p-2 bg-gray-100 rounded text-sm">{node.type}</div>
        </div>

        <div>
          <Label htmlFor="routingMode">Routing Mode</Label>
          <select
            id="routingMode"
            value={node.routingMode ?? 'single'}
            onChange={(e) => onUpdate({ routingMode: e.target.value as CanvasNode['routingMode'] })}
            className="mt-1 w-full h-9 rounded-md border border-gray-300 bg-white px-3 text-sm"
          >
            <option value="single">Single (deterministic)</option>
            <option value="broadcast">Broadcast</option>
          </select>
        </div>

        <label htmlFor="sink" className="flex items-center gap-2">
          <input
            id="sink"
            type="checkbox"
            checked={Boolean(node.sink)}
            onChange={(e) => onUpdate({ sink: e.target.checked })}
            className="h-4 w-4"
          />
          <span className="text-sm">Mark as sink node</span>
        </label>

        {relevantFields.map((field) => (
          <div key={field}>
            <Label htmlFor={field}>{FIELD_LABELS[field] || field}</Label>
            <Input
              id={field}
              type="number"
              value={(node as any)[field] || ''}
              onChange={(e) => {
                const value = e.target.value === '' ? undefined : parseFloat(e.target.value);
                onUpdate({ [field]: value });
              }}
              placeholder="Optional"
              className="mt-1"
              step={field.includes('Rate') || field.includes('Threshold') ? '0.01' : '1'}
              min="0"
              max={field.includes('Rate') || field.includes('Threshold') ? '1' : undefined}
            />
          </div>
        ))}

        <div className="pt-4 border-t">
          <div className="text-xs text-gray-500 space-y-1">
            <div>ID: {node.id}</div>
            <div>Position: ({Math.round(node.x)}, {Math.round(node.y)})</div>
          </div>
        </div>
      </div>
    </div>
  );
}
