// Monitoring and error tracking configuration
// Set these environment variables in Vercel to enable various monitoring features

export const MONITORING_CONFIG = {
  // Sentry error tracking (optional)
  SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Cron job secret for database cleanup
  // Generate a secure random string and set as CRON_SECRET in Vercel
  CRON_SECRET: process.env.CRON_SECRET,

  // Enable performance monitoring (default: enabled at 10% sample rate)
  ENABLE_PERFORMANCE_MONITORING: true,

  // Enable client error logging (default: enabled)
  ENABLE_ERROR_LOGGING: true,

  // Enable Web Vitals tracking (default: enabled, sampled at 10%)
  ENABLE_WEB_VITALS: true,
};

export function getMonitoringStatus(): Record<string, boolean> {
  return {
    sentry: !!MONITORING_CONFIG.SENTRY_DSN,
    cronjobs: !!MONITORING_CONFIG.CRON_SECRET,
    errorLogging: MONITORING_CONFIG.ENABLE_ERROR_LOGGING,
    webVitals: MONITORING_CONFIG.ENABLE_WEB_VITALS,
    performanceMonitoring: MONITORING_CONFIG.ENABLE_PERFORMANCE_MONITORING,
  };
}
