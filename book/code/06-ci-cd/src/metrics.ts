/**
 * Minimal in-process metrics sink mirroring Prometheus counter shape
 * (name + labels). In production swap for `prom-client` with an exposition
 * endpoint so Prometheus can scrape (chapter 06, section 3).
 */
export interface MetricLabels {
  [key: string]: string | number | boolean;
}

export interface MetricsSink {
  inc(name: string, labels?: MetricLabels): void;
  get(name: string, labels?: MetricLabels): number;
}

class InMemoryMetrics implements MetricsSink {
  private store = new Map<string, number>();

  inc(name: string, labels: MetricLabels = {}): void {
    const key = `${name}:${JSON.stringify(labels)}`;
    this.store.set(key, (this.store.get(key) ?? 0) + 1);
  }

  get(name: string, labels: MetricLabels = {}): number {
    return this.store.get(`${name}:${JSON.stringify(labels)}`) ?? 0;
  }
}

export const metrics = new InMemoryMetrics();
export function createMetrics(): MetricsSink {
  return new InMemoryMetrics();
}