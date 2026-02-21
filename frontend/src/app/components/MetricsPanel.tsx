import { SystemSnapshot } from '../types';
import { Card } from './ui/card';
import { Badge } from './ui/badge';

interface MetricsPanelProps {
  snapshot: SystemSnapshot | null;
}

export function MetricsPanel({ snapshot }: MetricsPanelProps) {
  if (!snapshot) {
    return (
      <div className="h-full p-4 bg-white border-b border-gray-200 overflow-y-auto">
        <div className="text-gray-500 text-sm text-center">No metrics available. Start simulation to see metrics.</div>
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
    </div>
  );
}