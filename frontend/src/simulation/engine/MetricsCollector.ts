import type { SimEvent } from '../types/simulation';
import { generateId } from '../utils/id';

export class MetricsCollector {
  private static instance: MetricsCollector;

  private events: SimEvent[] = [];

  private currentSimTime = 0;

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  setCurrentSimTime(simTimeMs: number): void {
    this.currentSimTime = simTimeMs;
  }

  recordEvent(event: Omit<SimEvent, 'id' | 'timestamp'>): SimEvent {
    const enriched: SimEvent = {
      ...event,
      id: generateId(),
      timestamp: this.currentSimTime,
    };
    this.events.push(enriched);
    return enriched;
  }

  getEvents(): readonly SimEvent[] {
    return this.events;
  }

  clear(): void {
    this.events = [];
    this.currentSimTime = 0;
  }
}
