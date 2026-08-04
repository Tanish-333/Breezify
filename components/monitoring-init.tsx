"use client";

import { useEffect } from "react";
import { trackWebVitals } from "@/lib/web-vitals";
import "@/lib/client-error-log";

export function MonitoringInit() {
  useEffect(() => {
    // Initialize Web Vitals tracking
    trackWebVitals((metric) => {
      // Log poor performance metrics
      if (metric.rating === "poor") {
        console.warn(`Poor ${metric.name}: ${metric.value}ms`);
      }
    });
  }, []);

  return null;
}
