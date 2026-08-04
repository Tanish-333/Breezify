import { NextRequest, NextResponse } from "next/server";

// In-memory only: on Vercel each serverless instance has its own memory, so
// this throttles per-instance, not globally across every region/instance.
// Still meaningfully better than no limit at all for the public, unauthenticated
// ingestion endpoints this guards (errors/metrics/track), and needs no extra
// infra (e.g. Redis) to exist.
interface RateLimitStore {
  [key: string]: { count: number; resetTime: number };
}

const store: RateLimitStore = {};

// Without this, `store` grows by one entry per distinct IP:path forever,
// since expired entries are only ever reset in place when that exact key is
// hit again, never removed. Sweep periodically instead.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let lastSweep = Date.now();
function sweepExpired(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const key in store) {
    if (store[key].resetTime < now) delete store[key];
  }
}

export function rateLimit(
  requests: number = 100,
  windowMs: number = 60000
) {
  return (handler: Function) => {
    return async (req: NextRequest, context?: any) => {
      const ip =
        req.headers.get("x-forwarded-for") ||
        req.headers.get("x-real-ip") ||
        "unknown";
      const key = `${ip}:${req.nextUrl.pathname}`;
      const now = Date.now();
      sweepExpired(now);

      if (!store[key]) {
        store[key] = { count: 0, resetTime: now + windowMs };
      }

      const entry = store[key];
      if (now > entry.resetTime) {
        entry.count = 0;
        entry.resetTime = now + windowMs;
      }

      entry.count++;

      // Reject BEFORE running the handler: the whole point is to stop the
      // request from doing its (costly) work once a caller is over the
      // limit, not to let it run and only complain afterwards.
      if (entry.count > requests) {
        return NextResponse.json(
          { error: "Too many requests" },
          {
            status: 429,
            headers: {
              "Retry-After": String(
                Math.ceil((entry.resetTime - now) / 1000)
              ),
            },
          }
        );
      }

      return handler(req, context);
    };
  };
}
