import Redis from "ioredis";
import type { BrowserCookie } from "../browser/playwright-runtime";

type CookieRecord = {
  expiresAt: number;
  cookies: BrowserCookie[];
};

type CookieJarKey = string;

export interface CookieJarStore {
  get(key: CookieJarKey): Promise<BrowserCookie[] | null>;
  set(key: CookieJarKey, cookies: BrowserCookie[]): Promise<void>;
  close(): Promise<void>;
}

export class InMemoryCookieJarStore implements CookieJarStore {
  private readonly records = new Map<CookieJarKey, CookieRecord>();

  constructor(private readonly ttlMs: number) {}

  async get(key: CookieJarKey): Promise<BrowserCookie[] | null> {
    const record = this.records.get(key);
    if (!record) {
      return null;
    }

    if (record.expiresAt <= Date.now()) {
      this.records.delete(key);
      return null;
    }

    return record.cookies;
  }

  async set(key: CookieJarKey, cookies: BrowserCookie[]): Promise<void> {
    this.records.set(key, {
      expiresAt: Date.now() + this.ttlMs,
      cookies,
    });
  }

  async close() {
    this.records.clear();
  }
}

export class RedisCookieJarStore implements CookieJarStore {
  private readonly redis: Redis;

  constructor(
    redisUrl: string,
    private readonly ttlSeconds: number,
    private readonly keyPrefix = "relay:browser:cookie_jar",
  ) {
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
  }

  private formatKey(key: CookieJarKey) {
    return `${this.keyPrefix}:${key}`;
  }

  async get(key: CookieJarKey): Promise<BrowserCookie[] | null> {
    try {
      if (this.redis.status === "wait") {
        await this.redis.connect();
      }
      const payload = await this.redis.get(this.formatKey(key));
      if (!payload) {
        return null;
      }
      return JSON.parse(payload) as BrowserCookie[];
    } catch {
      return null;
    }
  }

  async set(key: CookieJarKey, cookies: BrowserCookie[]): Promise<void> {
    try {
      if (this.redis.status === "wait") {
        await this.redis.connect();
      }
      await this.redis.set(this.formatKey(key), JSON.stringify(cookies), "EX", this.ttlSeconds);
    } catch {
      // Redis failures are tolerated so extraction can continue with in-memory state.
    }
  }

  async close() {
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}

export class CompositeCookieJarStore implements CookieJarStore {
  constructor(
    private readonly memory: InMemoryCookieJarStore,
    private readonly redis: RedisCookieJarStore | null,
  ) {}

  async get(key: CookieJarKey): Promise<BrowserCookie[] | null> {
    const fromMemory = await this.memory.get(key);
    if (fromMemory) {
      return fromMemory;
    }

    if (!this.redis) {
      return null;
    }

    const fromRedis = await this.redis.get(key);
    if (fromRedis) {
      await this.memory.set(key, fromRedis);
    }
    return fromRedis;
  }

  async set(key: CookieJarKey, cookies: BrowserCookie[]): Promise<void> {
    await this.memory.set(key, cookies);
    if (this.redis) {
      await this.redis.set(key, cookies);
    }
  }

  async close() {
    await this.memory.close();
    if (this.redis) {
      await this.redis.close();
    }
  }
}
