import { Redis, type RedisOptions } from 'ioredis';
import type { ICachePort } from './cache.interface';
import { withSpan } from '../tracing';

export class RealRedisCacheAdapter implements ICachePort {
  private readonly client: Redis;

  constructor(redisUrlOrOptions?: string | RedisOptions) {
    if (typeof redisUrlOrOptions === 'string') {
      this.client = new Redis(redisUrlOrOptions, {
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        enableOfflineQueue: false,
        retryStrategy: (times) => (times > 3 ? null : Math.min(times * 100, 1000)),
      });
    } else if (redisUrlOrOptions && typeof redisUrlOrOptions === 'object') {
      this.client = new Redis({
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        enableOfflineQueue: false,
        retryStrategy: (times) => (times > 3 ? null : Math.min(times * 100, 1000)),
        ...redisUrlOrOptions,
      });
    } else {
      const url = process.env.REDIS_URL || 'redis://localhost:6379';
      this.client = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        enableOfflineQueue: false,
        retryStrategy: (times) => (times > 3 ? null : Math.min(times * 100, 1000)),
      });
    }

    this.client.on('error', (err) => {
      console.warn('[RealRedisCacheAdapter] Redis warning:', err?.message || err);
    });
  }

  private async ensureConnected(): Promise<void> {
    if (this.client.status === 'wait') {
      try {
        await this.client.connect();
      } catch (err: any) {
        console.warn('[RealRedisCacheAdapter] Redis connect failed:', err?.message || err);
      }
    }
  }

  async get(key: string): Promise<string | null> {
    return withSpan('RealRedisCacheAdapter.get', async (span) => {
      span.setAttribute('redis.key', key);
      await this.ensureConnected();
      return await this.client.get(key);
    });
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    return withSpan('RealRedisCacheAdapter.set', async (span) => {
      span.setAttribute('redis.key', key);
      if (ttlMs !== undefined) {
        span.setAttribute('redis.ttl_ms', ttlMs);
      }
      await this.ensureConnected();
      if (ttlMs !== undefined && ttlMs > 0) {
        await this.client.set(key, value, 'PX', Math.max(1, Math.floor(ttlMs)));
      } else {
        await this.client.set(key, value);
      }
    });
  }

  async del(key: string): Promise<void> {
    return withSpan('RealRedisCacheAdapter.del', async (span) => {
      span.setAttribute('redis.key', key);
      await this.ensureConnected();
      await this.client.del(key);
    });
  }

  async exists(key: string): Promise<boolean> {
    return withSpan('RealRedisCacheAdapter.exists', async (span) => {
      span.setAttribute('redis.key', key);
      await this.ensureConnected();
      const count = await this.client.exists(key);
      return count > 0;
    });
  }

  async incr(key: string, ttlMs?: number): Promise<number> {
    return withSpan('RealRedisCacheAdapter.incr', async (span) => {
      span.setAttribute('redis.key', key);
      await this.ensureConnected();
      const multi = this.client.multi();
      multi.incr(key);
      if (ttlMs !== undefined && ttlMs > 0) {
        multi.pexpire(key, Math.max(1, Math.floor(ttlMs)));
      }
      const results = await multi.exec();
      if (!results || results.length === 0) return 1;
      const [err, val] = results[0]!;
      if (err) throw err;
      return typeof val === 'number' ? val : parseInt(String(val), 10);
    });
  }

  async disconnect(): Promise<void> {
    try {
      this.client.disconnect();
    } catch {}
  }
}
