import type { SystemSnapshot } from '../types.js';

function snapshotFingerprint(snapshot: SystemSnapshot): string {
  const services = Object.values(snapshot.services)
    .map((svc) => ({
      nodeId: svc.nodeId,
      nodeType: svc.nodeType,
      throughputPerSec: svc.throughputPerSec,
      avgLatencyMs: svc.avgLatencyMs,
      p95LatencyMs: svc.p95LatencyMs,
      errorRate: svc.errorRate,
      queueDepth: svc.queueDepth,
      healthScore: svc.healthScore,
      status: svc.status
    }))
    .sort((a, b) => a.nodeId.localeCompare(b.nodeId));

  return JSON.stringify({
    runId: snapshot.runId,
    services,
    system: snapshot.system
  });
}

export class RunStateStore {
  private readonly activeRuns = new Set<string>();
  private readonly endedRuns = new Set<string>();
  private readonly lastSnapshotHashByRun = new Map<string, string>();

  markStarted(runId: string): void {
    this.endedRuns.delete(runId);
    this.activeRuns.add(runId);
    this.lastSnapshotHashByRun.delete(runId);
  }

  markEnded(runId: string): void {
    this.activeRuns.delete(runId);
    this.endedRuns.add(runId);
    this.lastSnapshotHashByRun.delete(runId);
  }

  evaluateSnapshot(snapshot: SystemSnapshot): { persist: boolean; reason: string } {
    if (Object.keys(snapshot.services).length === 0) return { persist: false, reason: 'empty_services' };
    if (this.endedRuns.has(snapshot.runId)) return { persist: false, reason: 'run_ended' };

    // Fallback for MVP: if /runs/start failed or wasn't called, start tracking
    // the run when first non-empty snapshot arrives.
    if (!this.activeRuns.has(snapshot.runId)) {
      this.activeRuns.add(snapshot.runId);
    }

    const nextHash = snapshotFingerprint(snapshot);
    const prevHash = this.lastSnapshotHashByRun.get(snapshot.runId);
    if (prevHash === nextHash) return { persist: false, reason: 'duplicate' };

    this.lastSnapshotHashByRun.set(snapshot.runId, nextHash);
    return { persist: true, reason: 'accepted' };
  }
}
