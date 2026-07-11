/**
 * Request Scheduler — enforces minimum delay between LLM requests.
 *
 * All LLM calls (initial and retries) pass through `acquire()` which
 * ensures at least `minDelayMs` has elapsed since the last request.
 * This prevents retry storms and respects provider rate limits.
 */

export class RequestScheduler {
  private readonly minDelayMs: number;
  private lastRequestTime = 0;
  private queue: (() => void)[] = [];
  private processing = false;

  constructor(minDelayMs: number) {
    this.minDelayMs = minDelayMs;
  }

  /**
   * Wait until it is safe to make the next LLM request.
   * Resolves in FIFO order — requests are serialized through this gate.
   */
  async acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const elapsed = Date.now() - this.lastRequestTime;
      const wait = Math.max(0, this.minDelayMs - elapsed);

      if (wait > 0) {
        await new Promise<void>((r) => setTimeout(r, wait));
      }

      this.lastRequestTime = Date.now();
      const resolve = this.queue.shift();
      if (resolve) resolve();
    }

    this.processing = false;
  }
}
