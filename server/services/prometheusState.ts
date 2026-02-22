import type { SystemSnapshot } from '../types.js';
import { toPrometheusText } from './prometheus.js';

export class PrometheusSnapshotStore {
  private latestSnapshot: SystemSnapshot | null = null;

  setLatest(snapshot: SystemSnapshot): void {
    this.latestSnapshot = snapshot;
  }

  clear(): void {
    this.latestSnapshot = null;
  }

  hasSnapshot(): boolean {
    return this.latestSnapshot !== null;
  }

  getText(): string {
    if (!this.latestSnapshot) {
      return '# No snapshots received yet\n';
    }
    return toPrometheusText(this.latestSnapshot);
  }
}
