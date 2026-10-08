// Best-effort fixed-window limiter per warm instance. On Vercel, use platform
// Firewall rules for global abuse protection, especially when enabling TURN.
type Entry = { count: number; resetAt: number };
import { isIP } from "node:net";

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
    if (store.size >= 10000) {
      for (const [expiredKey, value] of store) if (value.resetAt <= now) store.delete(expiredKey);
      if (store.size >= 10000 && !store.has(key)) return { ok: false, remaining: 0, resetAt: now + windowMs };
    }
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
  // Trust only a single address header explicitly overwritten by your reverse proxy.
  const header = process.env.VERCEL === "1" ? "x-vercel-forwarded-for" : process.env.TRUSTED_IP_HEADER;
  if (!header) return "shared";
  const value = req.headers.get(header)?.trim() ?? "";
  return value.length <= 45 && isIP(value) ? value : "shared";
}
