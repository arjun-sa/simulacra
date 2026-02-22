import type { SystemSnapshot } from '../types.js';

export type PrometheusMode = 'pushgateway' | 'scrape' | 'both';

export interface PrometheusConfig {
  enabled: boolean;
  mode: PrometheusMode;
  pushgatewayUrl?: string;
  jobName: string;
}

function esc(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function line(name: string, labels: Record<string, string>, value: number): string {
  const labelText = Object.entries(labels)
    .map(([k, v]) => `${k}="${esc(v)}"`)
    .join(',');
  return `${name}{${labelText}} ${Number.isFinite(value) ? value : 0}`;
}

function metricMeta(name: string, type: 'gauge' | 'counter', help: string): string[] {
  return [`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`];
}

export function toPrometheusText(snapshot: SystemSnapshot): string {
  const out: string[] = [];

  out.push(...metricMeta('sim_node_info', 'gauge', 'Static node identity labels for this run.'));
  out.push(...metricMeta('sim_node_throughput_msgs_per_sec', 'gauge', 'Per-node throughput in messages/second.'));
  out.push(...metricMeta('sim_node_latency_avg_ms', 'gauge', 'Per-node average latency in milliseconds.'));
  out.push(...metricMeta('sim_node_latency_p95_ms', 'gauge', 'Per-node p95 latency in milliseconds.'));
  out.push(...metricMeta('sim_node_error_rate_ratio', 'gauge', 'Per-node error ratio between 0 and 1.'));
  out.push(...metricMeta('sim_node_error_rate_percent', 'gauge', 'Per-node error rate percentage.'));
  out.push(...metricMeta('sim_node_queue_depth', 'gauge', 'Per-node queue depth.'));
  out.push(...metricMeta('sim_node_health_score_ratio', 'gauge', 'Per-node health score between 0 and 1.'));
  out.push(...metricMeta('sim_node_status_code', 'gauge', 'Per-node status encoded as healthy=2, degraded=1, crashed=0.'));
  out.push(...metricMeta('sim_node_status', 'gauge', 'Per-node status as one-hot labels (status=healthy|degraded|crashed).'));
  out.push(...metricMeta('sim_node_backpressure_ratio', 'gauge', 'Per-node backpressure approximation using queue depth vs throughput.'));
  out.push(...metricMeta('sim_snapshot_timestamp_ms', 'gauge', 'Snapshot wall-clock timestamp in unix milliseconds.'));
  out.push(...metricMeta('sim_total_throughput', 'gauge', 'Run-level total throughput in messages/second.'));
  out.push(...metricMeta('sim_overall_health', 'gauge', 'Run-level overall health score between 0 and 1.'));
  out.push(...metricMeta('sim_bottleneck_info', 'gauge', 'Run-level bottleneck node label emitted as metric labels.'));

  for (const [serviceKey, service] of Object.entries(snapshot.services)) {
    const common = {
      run_id: snapshot.runId,
      node_id: serviceKey,
      node_name: service.nodeId,
      node_type: service.nodeType
    };
    const statusCode =
      service.status === 'healthy' ? 2 :
      service.status === 'degraded' ? 1 : 0;

    out.push(line('sim_node_info', { ...common, status: service.status }, 1));
    out.push(line('sim_node_throughput_msgs_per_sec', common, service.throughputPerSec));
    out.push(line('sim_node_latency_avg_ms', common, service.avgLatencyMs));
    out.push(line('sim_node_latency_p95_ms', common, service.p95LatencyMs));
    out.push(line('sim_node_error_rate_ratio', common, service.errorRate));
    out.push(line('sim_node_error_rate_percent', common, service.errorRate * 100));
    out.push(line('sim_node_queue_depth', common, service.queueDepth));
    out.push(line('sim_node_health_score_ratio', common, service.healthScore));
    out.push(line('sim_node_status_code', common, statusCode));
    out.push(line('sim_node_backpressure_ratio', common, service.queueDepth / Math.max(1, service.throughputPerSec)));

    for (const status of ['healthy', 'degraded', 'crashed'] as const) {
      out.push(line('sim_node_status', { ...common, status }, service.status === status ? 1 : 0));
    }
  }

  out.push(line('sim_snapshot_timestamp_ms', { run_id: snapshot.runId }, snapshot.timestamp));
  out.push(line('sim_total_throughput', { run_id: snapshot.runId }, snapshot.system.totalThroughput));
  out.push(line('sim_overall_health', { run_id: snapshot.runId }, snapshot.system.overallHealthScore));
  out.push(
    line(
      'sim_bottleneck_info',
      { run_id: snapshot.runId, node_name: snapshot.system.bottleneckService ?? 'none' },
      snapshot.system.bottleneckService ? 1 : 0
    )
  );
  return `${out.join('\n')}\n`;
}

export function shouldPushToGateway(config: PrometheusConfig): boolean {
  return config.enabled && (config.mode === 'pushgateway' || config.mode === 'both');
}

export function shouldExposeScrape(config: PrometheusConfig): boolean {
  return config.enabled && (config.mode === 'scrape' || config.mode === 'both');
}

export async function pushSnapshotToPushgateway(
  snapshot: SystemSnapshot,
  pushgatewayUrl: string,
  jobName = 'simulation'
): Promise<void> {
  const res = await fetch(`${pushgatewayUrl}/metrics/job/${encodeURIComponent(jobName)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; version=0.0.4' },
    body: toPrometheusText(snapshot)
  });
  if (!res.ok) throw new Error(`Pushgateway push failed (${res.status})`);
}

export async function checkPushgateway(pushgatewayUrl: string): Promise<'connected' | 'error'> {
  try {
    const res = await fetch(`${pushgatewayUrl}/-/healthy`);
    if (res.ok) return 'connected';

    // Some Pushgateway deployments don't expose /-/healthy.
    const fallback = await fetch(pushgatewayUrl);
    return fallback.ok ? 'connected' : 'error';
  } catch {
    return 'error';
  }
}
