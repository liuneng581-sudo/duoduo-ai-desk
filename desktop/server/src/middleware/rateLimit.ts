/**
 * Lightweight in-memory fixed-window rate limiter (no external dependency).
 *
 * Adequate for a single-process desktop app. Keyed by IP (+ optional identifier).
 * For multi-process deployments, swap for a Redis-backed limiter.
 */
import { Request, Response, NextFunction } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Periodic cleanup of expired buckets to bound memory
setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) {
    if (b.resetAt < now) buckets.delete(key);
  }
}, 60_000).unref();

interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Extra key component (e.g. ':login' to namespace per-route). */
  keySuffix?: string;
  message?: string;
}

export function rateLimit(opts: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${ip}${opts.keySuffix ? ':' + opts.keySuffix : ''}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      bucket = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > opts.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      res.status(429).json({ error: opts.message || '请求过于频繁，请稍后再试' });
      return;
    }

    next();
  };
}
