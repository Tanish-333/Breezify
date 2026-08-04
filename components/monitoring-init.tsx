"use client";

import { useEffect } from "react";
import { trackWebVitals } from "@/lib/web-vitals";
import "@/lib/client-error-log";

export function MonitoringInit() {
  useEffect(() => {
    // trackWebVitals posts each metric to /api/metrics itself (sampled
    // server-side); this callback is just for local dev visibility.
    trackWebVitals((metric) => {
      if (metric.rating === "poor") {
        console.warn(`Poor ${metric.name}: ${metric.value}`);
      }
    });
  }, []);

  return null;
}
