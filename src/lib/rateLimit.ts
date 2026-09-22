// Simple in-memory sliding window rate limiter (per IP)
// For production, replace with Upstash Redis / Vercel KV
type Entry = { count: number; resetAt: number };

declare global {
  var __RATE_LIMIT__: Map<string, Entry> | undefined;
}

function getStore(): Map<string, Entry> {
  if (!globalThis.__RATE_LIMIT__) globalThis.__RATE_LIMIT__ = new Map();
  return globalThis.__RATE_LIMIT__!;
}

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const store = getStore();
  const entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, resetAt };
  }
  if (entry.count >= limit) {
    return { ok: false, remaining: 0, resetAt: entry.resetAt };
  }
  entry.count++;
  return { ok: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

// Periodic cleanup (every 5 min)
if (!globalThis.__RATE_LIMIT__) {
  setInterval(() => {
    const now = Date.now();
    const s = getStore();
    for (const [k, v] of s.entries()) if (now > v.resetAt) s.delete(k);
  }, 5 * 60 * 1000).unref?.();
}

export function getClientIp(req: Request): string {
  const h = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  if (h) return h;
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf;
  // NextRequest ip not available in edge without header
  return "unknown";
}
