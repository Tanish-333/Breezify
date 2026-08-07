const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = withSentryConfig(nextConfig, {
  // No SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN configured yet — the
  // plugin degrades gracefully (skips source map upload, keeps building)
  // when those are absent, so this is safe to ship ahead of setting them.
  silent: true,
  telemetry: false,
  // Sourcemaps require the auth token above to actually upload; leaving
  // this on is harmless without it, just unused until that's configured.
  widenClientFileUpload: false,
});
