import Redis from 'ioredis';
import { env } from './env.js';

/**
 * Resilient In-Memory Fallback Store
 * Used automatically when Redis server is offline/restarting so the app NEVER hangs or crashes.
 */
class MemoryFallbackStore {
  constructor() {
    this.store = new Map();
    this.ttls = new Map();
  }

  _isExpired(key) {
    const expiry = this.ttls.get(key);
    if (expiry && Date.now() > expiry) {
      this.store.delete(key);
      this.ttls.delete(key);
      return true;
    }
    return false;
  }

  async get(key) {
    if (this._isExpired(key)) return null;
    return this.store.has(key) ? String(this.store.get(key)) : null;
  }

  async set(key, val, ...args) {
    this.store.set(key, String(val));
    if (args.length >= 2 && String(args[0]).toUpperCase() === 'EX') {
      const seconds = Number(args[1]);
      if (seconds > 0) {
        this.ttls.set(key, Date.now() + seconds * 1000);
      }
    }
    return 'OK';
  }

  async del(...keys) {
    let count = 0;
    for (const k of keys) {
      if (this.store.delete(k)) count++;
      this.ttls.delete(k);
    }
    return count;
  }

  async incr(key) {
    if (this._isExpired(key)) {
      this.store.set(key, '0');
    }
    const current = parseInt(this.store.get(key) || '0', 10);
    const next = isNaN(current) ? 1 : current + 1;
    this.store.set(key, String(next));
    return next;
  }

  async expire(key, seconds) {
    if (!this.store.has(key) || this._isExpired(key)) return 0;
    this.ttls.set(key, Date.now() + Number(seconds) * 1000);
    return 1;
  }

  async ttl(key) {
    if (!this.store.has(key) || this._isExpired(key)) return -2;
    const expiry = this.ttls.get(key);
    if (!expiry) return -1;
    return Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
  }

  async ping() {
    return 'PONG';
  }

  async flushall() {
    this.store.clear();
    this.ttls.clear();
    return 'OK';
  }

  async keys(pattern = '*') {
    const res = [];
    for (const k of this.store.keys()) {
      if (!this._isExpired(k)) {
        res.push(k);
      }
    }
    return res;
  }

  async quit() {
    this.store.clear();
    this.ttls.clear();
    return 'OK';
  }
}

const memoryFallback = new MemoryFallbackStore();
let isConnected = false;
let hasReportedError = false;

// Configure real ioredis client
const client = new Redis(env.REDIS_URL, {
  enableOfflineQueue: false, // Prevents HTTP requests from hanging when Redis is offline
  maxRetriesPerRequest: 1,
  retryStrategy(times) {
    return Math.min(times * 500, 3000);
  },
});

client.on('connect', () => {
  isConnected = true;
  hasReportedError = false;
  if (process.env.NODE_ENV !== 'test') {
    console.log('✅ [ChatLeaf] Connected to Redis server successfully.');
  }
});

client.on('ready', () => {
  isConnected = true;
  hasReportedError = false;
});

client.on('error', (err) => {
  if (process.env.NODE_ENV === 'test') return;

  if (!hasReportedError) {
    hasReportedError = true;
    console.warn(`ℹ️  [ChatLeaf] Redis is offline (${err.message}).`);
    console.warn('⚡ [ChatLeaf] Safe In-Memory Fallback activated (App runs smoothly without downtime).');
    console.warn('👉 For production hosting, set REDIS_URL in your cloud environment variables (Upstash, Render, Railway, etc.).\n');
  }
});

client.on('close', () => {
  if (isConnected && process.env.NODE_ENV !== 'test') {
    console.warn('⚠️  [ChatLeaf] Redis connection closed. Falling back to memory while reconnecting...');
  }
  isConnected = false;
});

/**
 * Helper to ensure Redis has connected before running operations
 */
export async function ensureRedisConnected(timeoutMs = 3000) {
  if (client.status === 'ready') {
    isConnected = true;
    return true;
  }
  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(isConnected);
      }
    }, timeoutMs);

    client.once('ready', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        isConnected = true;
        resolve(true);
      }
    });

    client.once('error', () => {
      if (client.status === 'end' && !resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(false);
      }
    });
  });
}

/**
 * Resilient Redis Proxy:
 * Routes to real Redis when online, seamlessly falls back to MemoryStore when offline.
 */
export const redis = new Proxy(client, {
  get(target, prop, receiver) {
    const fallbackMethods = ['get', 'set', 'del', 'incr', 'expire', 'ttl', 'ping', 'flushall', 'keys'];

    if (fallbackMethods.includes(prop)) {
      return async function (...args) {
        if (isConnected || target.status === 'ready') {
          isConnected = true;
          try {
            return await target[prop](...args);
          } catch (err) {
            // Immediate failover if Redis socket drops mid-request
            return await memoryFallback[prop](...args);
          }
        }
        return await memoryFallback[prop](...args);
      };
    }

    if (prop === 'quit') {
      return async function () {
        try {
          if (isConnected || target.status === 'ready') await target.quit();
        } catch (_) {}
        return await memoryFallback.quit();
      };
    }

    const val = Reflect.get(target, prop, receiver);
    if (typeof val === 'function') {
      return val.bind(target);
    }
    return val;
  },
});
