/**
 * Sistema de cache simples em memória para melhorar performance
 */

import { logger } from './logger';

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
}

export class SimpleCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Limpar cache expirado a cada 5 minutos
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  set(key: string, value: T, ttlMs: number = 5 * 60 * 1000): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttlMs,
    });
    logger.debug(`Cache set: ${key}`, { ttl: `${ttlMs}ms` });
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      logger.debug(`Cache miss: ${key}`);
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      logger.debug(`Cache expired: ${key}`);
      return null;
    }

    logger.debug(`Cache hit: ${key}`);
    return entry.value;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    logger.info(`Cache cleared`, { itemsCleared: size });
  }

  private cleanup(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug(`Cache cleanup: ${removed} items removed`);
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
  }

  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

/**
 * Rate limiter com token bucket algorithm
 */
export class RateLimiter {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillRate: number;
  private lastRefillTime: number;

  constructor(capacity: number = 10, refillRateMs: number = 1000) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRate = refillRateMs;
    this.lastRefillTime = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefillTime;
    const tokensToAdd = (timePassed / this.refillRate) * (this.capacity / 10);

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefillTime = now;
  }

  canRequest(tokensRequired: number = 1): boolean {
    this.refill();

    if (this.tokens >= tokensRequired) {
      this.tokens -= tokensRequired;
      return true;
    }

    logger.warn(`Rate limit exceeded`, {
      available: this.tokens,
      required: tokensRequired,
    });
    return false;
  }

  async waitAndRequest(tokensRequired: number = 1): Promise<void> {
    const maxWaitTime = 5000; // 5 seconds max wait
    const startTime = Date.now();

    while (!this.canRequest(tokensRequired)) {
      if (Date.now() - startTime > maxWaitTime) {
        throw new Error('Rate limiter: request timeout');
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  getStatus(): { available: number; capacity: number; utilization: string } {
    this.refill();
    return {
      available: Math.floor(this.tokens),
      capacity: this.capacity,
      utilization: `${((1 - this.tokens / this.capacity) * 100).toFixed(2)}%`,
    };
  }
}
