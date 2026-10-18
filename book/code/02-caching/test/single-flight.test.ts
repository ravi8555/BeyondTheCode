import { describe, expect, it } from 'vitest';
import { SingleFlight } from '../src/cache/single-flight.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('SingleFlight (unit, no infra)', () => {
  it('coalesces 100 concurrent same-key calls into ONE loader invocation', async () => {
    const sf = new SingleFlight();
    let calls = 0;
    const loader = async (): Promise<string> => {
      calls++;
      await sleep(20);
      return 'value';
    };
    const results = await Promise.all(
      Array.from({ length: 100 }, () => sf.do('k', loader)),
    );
    expect(calls).toBe(1);
    expect(results.every((r) => r === 'value')).toBe(true);
  });

  it('runs different keys in parallel', async () => {
    const sf = new SingleFlight();
    const started: string[] = [];
    const finished: string[] = [];
    await Promise.all([
      sf.do('a', async () => {
        started.push('a');
        await sleep(20);
        finished.push('a');
      }),
      sf.do('b', async () => {
        started.push('b');
        await sleep(5);
        finished.push('b');
      }),
    ]);
    expect(started.sort()).toEqual(['a', 'b']);
    expect(finished).toEqual(['b', 'a']); // b finished first => not serialized
  });

  it('clears the inflight entry when the loader REJECTS (no poisoned key)', async () => {
    const sf = new SingleFlight();
    let calls = 0;
    await expect(
      sf.do('k', async (): Promise<number> => {
        calls++;
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    // The failure must not be cached in the flight map: next call retries.
    const ok = await sf.do('k', async (): Promise<number> => {
      calls++;
      return 42;
    });
    expect(ok).toBe(42);
    expect(calls).toBe(2);
    expect(sf.size).toBe(0);
  });
});
