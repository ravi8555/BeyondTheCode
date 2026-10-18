/**
 * Request coalescing ("single-flight"): N concurrent misses on one key
 * result in ONE loader call (chapter 02, section 6 case 1).
 *
 * Scope: PER INSTANCE only. Cross-instance stampede damping needs a
 * distributed lease (SET NX — exercise 3 / ch 38) or happens at the CDN.
 */
export class SingleFlight {
  private readonly inflight = new Map<string, Promise<unknown>>();

  do<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const p = fn().finally(() => {
      this.inflight.delete(key); // rejected loaders must clear too (no poison)
    });
    this.inflight.set(key, p);
    return p;
  }

  get size(): number {
    return this.inflight.size;
  }
}
