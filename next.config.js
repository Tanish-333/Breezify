const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
};

// Safe without any Sentry env vars set: instrumentation.ts/sentry.*.config.ts
// already no-op without NEXT_PUBLIC_SENTRY_DSN, and source map upload here
// just silently skips without SENTRY_AUTH_TOKEN.
module.exports = withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  widenClientFileUpload: false,
  webpack: {
    automaticVercelMonitors: false,
    treeshake: { removeDebugLogging: true },
  },
});
