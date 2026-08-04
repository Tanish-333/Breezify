import { NextRequest, NextResponse } from "next/server";

interface RateLimitStore {
  [key: string]: { count: number; resetTime: number };
}

const store: RateLimitStore = {};

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

      if (!store[key]) {
        store[key] = { count: 0, resetTime: now + windowMs };
      }

      const entry = store[key];
      if (now > entry.resetTime) {
        entry.count = 0;
        entry.resetTime = now + windowMs;
      }

      entry.count++;

      const response = await handler(req, context);

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

      return response;
    };
  };
}
