import type { ICachePort } from './cache.interface';

interface CacheEntry {
  readonly value: string;
  readonly expiresAt: number | null;
}

export class InMemoryCacheAdapter implements ICachePort {
  private readonly cache: Map<string, CacheEntry> = new Map();

  async get(key: string): Promise<string | null> {
    const item = this.cache.get(key);
    if (!item) return null;

    if (item.expiresAt !== null && Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    const expiresAt = ttlMs !== undefined && ttlMs > 0 ? Date.now() + ttlMs : null;
    this.cache.set(key, Object.freeze({ value, expiresAt }));
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    const item = this.cache.get(key);
    if (!item) return false;

    if (item.expiresAt !== null && Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  async incr(key: string, ttlMs?: number): Promise<number> {
    const current = await this.get(key);
    const count = (current ? parseInt(current, 10) : 0) + 1;
    await this.set(key, String(count), ttlMs);
    return count;
  }
}
