import { SimEvent, SystemSnapshot } from '../types';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import {
  AlertCircle,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Activity,
  Zap,
} from 'lucide-react';

interface MetricsPanelProps {
  snapshot: SystemSnapshot | null;
  events: SimEvent[];
}

const EVENT_ICONS: Record<SimEvent['type'], React.ReactNode> = {
  message_sent: <Activity className="w-4 h-4 text-blue-500" />,
  message_received: <CheckCircle className="w-4 h-4 text-green-500" />,
  message_dropped: <XCircle className="w-4 h-4 text-orange-500" />,
  message_error: <AlertCircle className="w-4 h-4 text-red-500" />,
  node_crashed: <XCircle className="w-4 h-4 text-red-600" />,
  node_recovered: <CheckCircle className="w-4 h-4 text-green-600" />,
  latency_spike: <Zap className="w-4 h-4 text-yellow-500" />,
  partition_split: <AlertTriangle className="w-4 h-4 text-purple-500" />,
};

const formatEventType = (type: string) =>
  type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

export function MetricsPanel({ snapshot, events }: MetricsPanelProps) {
  if (!snapshot) {
    return (
      <div className="h-full p-4 bg-white border-b border-gray-200 overflow-y-auto">
        <div className="text-gray-500 text-sm text-center">
          No metrics available. Start simulation to see metrics.
        </div>
      </div>
    );
  }

  const healthColor =
    snapshot.overallHealthScore > 0.7
      ? 'bg-green-500'
      : snapshot.overallHealthScore > 0.4
      ? 'bg-yellow-500'
      : 'bg-red-500';

  return (
    <div className="h-full p-4 bg-white border-b border-gray-200 overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">System Metrics</h3>
        <Badge variant="outline" className="text-xs">
          Run ID: {snapshot.runId}
        </Badge>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card className="p-3">
          <div className="text-xs text-gray-500 mb-1">Total Throughput</div>
          <div className="text-lg font-semibold">{snapshot.totalThroughput.toFixed(1)}</div>
          <div className="text-xs text-gray-400">req/s</div>
        </Card>

        <Card className="p-3">
          <div className="text-xs text-gray-500 mb-1">Health Score</div>
          <div className="flex items-center gap-2">
            <div className="text-lg font-semibold">
              {(snapshot.overallHealthScore * 100).toFixed(0)}%
            </div>
            <div className={`w-2 h-2 rounded-full ${healthColor}`} />
          </div>
        </Card>

        <Card className="p-3">
          <div className="text-xs text-gray-500 mb-1">Bottleneck</div>
          <div className="text-sm font-medium truncate">
            {snapshot.bottleneckNodeId || 'None'}
          </div>
        </Card>

        <Card className="p-3">
          <div className="text-xs text-gray-500 mb-1">Active Services</div>
          <div className="text-lg font-semibold">
            {Object.keys(snapshot.services).length}
          </div>
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {Object.entries(snapshot.services).slice(0, 6).map(([nodeId, service]) => (
          <div key={nodeId} className="text-xs p-2 bg-gray-50 rounded">
            <div className="font-medium truncate mb-1">{nodeId}</div>
            <div className="flex gap-3 text-gray-600">
              <span>{service.throughputPerSec.toFixed(1)} req/s</span>
              <span>{service.avgLatencyMs.toFixed(0)}ms</span>
              <span className={service.errorRate > 0.1 ? 'text-red-600' : ''}>
                {(service.errorRate * 100).toFixed(0)}% err
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-gray-200 pt-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold text-sm">Event Timeline</h4>
          <span className="text-xs text-gray-500">{events.length} events</span>
        </div>
        <div className="max-h-48 overflow-y-auto pr-1 space-y-1">
          {events.length === 0 ? (
            <div className="text-center text-gray-500 text-xs py-4">
              No events yet. Start simulation to see events.
            </div>
          ) : (
            events.map((event) => (
              <div
                key={event.id}
                className="flex items-start gap-2 p-2 rounded hover:bg-gray-50 text-xs"
              >
                <div className="mt-0.5">{EVENT_ICONS[event.type]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{formatEventType(event.type)}</span>
                    <span className="text-gray-400">{event.timestamp}ms</span>
                  </div>
                  <div className="text-gray-600 truncate">
                    {event.sourceNodeId}
                    {event.targetNodeId && ` -> ${event.targetNodeId}`}
                  </div>
                  {event.latencyMs && (
                    <div className="text-gray-500">Latency: {event.latencyMs}ms</div>
                  )}
                  {event.failureInjected && (
                    <div className="text-orange-600 font-medium">Failure Injected</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
