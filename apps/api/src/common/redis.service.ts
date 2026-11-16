import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { env } from '../config/env';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  constructor() {
    this.client = new Redis(env().REDIS_URL, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: true,
      lazyConnect: false,
    });
    this.client.on('error', (e) => console.error('[redis]', e.message));
  }
  async onModuleDestroy() {
    await this.client.quit().catch(() => undefined);
  }

  /**
   * Sliding-window-ish fixed window limiter (atomic INCR + PEXPIRE).
   * Returns remaining count and reset time. Works across horizontally scaled instances.
   */
  async hit(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<{ allowed: boolean; remaining: number; resetMs: number }> {
    const bucket = Math.floor(Date.now() / windowMs);
    const k = `rl:${key}:${bucket}`;
    const res = await this.client
      .multi()
      .incr(k)
      .pexpire(k, windowMs + 1000)
      .exec();
    const count = Number(res?.[0]?.[1] ?? 0);
    const resetMs = (bucket + 1) * windowMs - Date.now();
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetMs };
  }

  /** Simple distributed lock for singleton jobs. */
  async withLock<T>(name: string, ttlMs: number, fn: () => Promise<T>): Promise<T | undefined> {
    const key = `lock:${name}`;
    const token = Math.random().toString(36).slice(2);
    const ok = await this.client.set(key, token, 'PX', ttlMs, 'NX');
    if (!ok) return undefined;
    try {
      return await fn();
    } finally {
      const cur = await this.client.get(key);
      if (cur === token) await this.client.del(key);
    }
  }
}
