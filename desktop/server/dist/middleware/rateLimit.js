"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimit = rateLimit;
const buckets = new Map();
// Periodic cleanup of expired buckets to bound memory
setInterval(() => {
    const now = Date.now();
    for (const [key, b] of buckets) {
        if (b.resetAt < now)
            buckets.delete(key);
    }
}, 60_000).unref();
function rateLimit(opts) {
    return (req, res, next) => {
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
//# sourceMappingURL=rateLimit.js.map