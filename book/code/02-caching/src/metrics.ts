/**
 * Minimal in-process counter registry — a stand-in for prom-client with the
 * same name+labels shape (chapter 02, section 5 metric table).
 */

export interface MetricsSink {
  inc(name: string, labels?: Record<string, string>): void;
  get(name: string, labels?: Record<string, string>): number;
  reset(): void;
}

function labelKey(name: string, labels?: Record<string, string>): string {
  if (!labels || Object.keys(labels).length === 0) return name;
  const parts = Object.entries(labels)
    .map(([k, v]) => `${k}="${v}"`)
    .sort();
  return `${name}{${parts.join(',')}}`;
}

export function createMetrics(): MetricsSink {
  const counters = new Map<string, number>();
  return {
    inc(name, labels) {
      const key = labelKey(name, labels);
      counters.set(key, (counters.get(key) ?? 0) + 1);
    },
    get(name, labels) {
      return counters.get(labelKey(name, labels)) ?? 0;
    },
    reset() {
      counters.clear();
    },
  };
}

export const metrics = createMetrics();
