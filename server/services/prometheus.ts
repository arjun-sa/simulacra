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

export function toPrometheusText(snapshot: SystemSnapshot): string {
  const out: string[] = [];
  for (const service of Object.values(snapshot.services)) {
    const labels = { service: service.nodeId, run_id: snapshot.runId };
    out.push(line('sim_throughput_msgs_per_sec', labels, service.throughputPerSec));
    out.push(line('sim_latency_ms', labels, service.avgLatencyMs));
    out.push(line('sim_p95_latency_ms', labels, service.p95LatencyMs));
    out.push(line('sim_error_rate', labels, service.errorRate));
    out.push(line('sim_queue_depth', labels, service.queueDepth));
    out.push(line('sim_health_score', labels, service.healthScore));
  }
  out.push(line('sim_total_throughput', { run_id: snapshot.runId }, snapshot.system.totalThroughput));
  out.push(line('sim_overall_health', { run_id: snapshot.runId }, snapshot.system.overallHealthScore));
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
