import { describe, expect, it } from 'vitest';
import { Quota } from '../src/models/index.js';
import { consumeQuota } from '../src/utils/quota.js';

describe('consumeQuota', () => {
  it('lets exactly `limit` of many parallel calls through, every time', async () => {
    for (let round = 0; round < 5; round += 1) {
      const results = await Promise.all(Array.from({ length: 40 }, () => consumeQuota(`t:${round}`, 10, 60_000)));
      expect(results.filter((r) => r.allowed)).toHaveLength(10);
    }
  });

  it('starts a fresh window once the old one has expired', async () => {
    await consumeQuota('w', 1, 60_000);
    expect((await consumeQuota('w', 1, 60_000)).allowed).toBe(false);
    await Quota.updateOne({ _id: 'w' }, { $set: { windowStart: new Date(Date.now() - 61_000) } });
    const again = await consumeQuota('w', 1, 60_000);
    expect(again).toMatchObject({ allowed: true, count: 1 });
  });

  it('reports a sensible retry time and keeps keys separate', async () => {
    await consumeQuota('a', 1, 60_000);
    const blocked = await consumeQuota('a', 1, 60_000);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
    expect((await consumeQuota('b', 1, 60_000)).allowed).toBe(true);
  });
});
