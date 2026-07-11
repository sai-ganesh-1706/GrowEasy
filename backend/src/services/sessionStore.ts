import { ISessionStore } from '../types';

/** An entry in the in-memory store with expiration tracking */
interface StoreEntry<T> {
  value: T;
  expiresAt: number; // Unix ms
}

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // sweep every 5 minutes

/**
 * In-memory session store backed by a Map with automatic TTL expiry.
 *
 * Drop-in replaceable: any class implementing ISessionStore<T> can be
 * substituted (e.g. a Redis-backed store) without touching consumers.
 */
export class InMemorySessionStore<T> implements ISessionStore<T> {
  private readonly store = new Map<string, StoreEntry<T>>();
  private readonly defaultTtlMs: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(defaultTtlMs: number = DEFAULT_TTL_MS) {
    this.defaultTtlMs = defaultTtlMs;
    this.startCleanupLoop();
  }

  set(key: string, value: T, ttlMs?: number): void {
    const expiresAt = Date.now() + (ttlMs ?? this.defaultTtlMs);
    this.store.set(key, { value, expiresAt });
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  has(key: string): boolean {
    return this.get(key) !== undefined; // triggers expiry check
  }

  clear(): void {
    this.store.clear();
  }

  /** Remove all expired entries */
  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  private startCleanupLoop(): void {
    this.cleanupTimer = setInterval(() => this.sweep(), CLEANUP_INTERVAL_MS);
    // Don't block Node from exiting
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /** Call on graceful shutdown */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.store.clear();
  }
}
