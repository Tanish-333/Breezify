import { onCLS, onFID, onFCP, onLCP, onTTFB, Metric } from "web-vitals";

export function trackWebVitals(
  callback?: (metric: Metric) => void
) {
  const trackMetric = (metric: Metric) => {
    // Send to analytics service
    const body = JSON.stringify({
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
      id: metric.id,
      timestamp: new Date().toISOString(),
    });

    // Use `navigator.sendBeacon()` if available, falling back to `fetch()`
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/metrics", body);
    } else {
      fetch("/api/metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {
        // Silently fail - don't interrupt page functionality
      });
    }

    if (callback) {
      callback(metric);
    }
  };

  // Register all Web Vitals
  onCLS(trackMetric);
  onFID(trackMetric);
  onFCP(trackMetric);
  onLCP(trackMetric);
  onTTFB(trackMetric);
}
