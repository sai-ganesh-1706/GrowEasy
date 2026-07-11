/**
 * Tests for the RequestScheduler.
 */

import { RequestScheduler } from '../services/requestScheduler';

describe('RequestScheduler', () => {
  it('resolves immediately when no minimum delay', async () => {
    const scheduler = new RequestScheduler(0);
    const start = Date.now();
    await scheduler.acquire();
    await scheduler.acquire();
    await scheduler.acquire();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it('enforces minimum delay between acquisitions', async () => {
    const scheduler = new RequestScheduler(100);

    const timestamps: number[] = [];
    for (let i = 0; i < 3; i++) {
      await scheduler.acquire();
      timestamps.push(Date.now());
    }

    // Second call should be ~100ms after first
    expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(80);
    // Third call should be ~100ms after second
    expect(timestamps[2] - timestamps[1]).toBeGreaterThanOrEqual(80);
  });

  it('processes queue in FIFO order', async () => {
    const scheduler = new RequestScheduler(50);
    const order: number[] = [];

    // Acquire first to set the baseline time
    await scheduler.acquire();

    // Fire 3 concurrent acquires
    const promises = [1, 2, 3].map(async (id) => {
      await scheduler.acquire();
      order.push(id);
    });

    await Promise.all(promises);
    expect(order).toEqual([1, 2, 3]);
  });
});
