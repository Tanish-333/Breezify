"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { Loader2, Monitor, Smartphone } from "lucide-react";
import { useAppAnalytics } from "@/lib/use-apps";
import type { DailyAnalytics } from "@/lib/types";

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  GB: "United Kingdom",
  CA: "Canada",
  IN: "India",
  DE: "Germany",
  FR: "France",
  AU: "Australia",
  BR: "Brazil",
  JP: "Japan",
  CN: "China",
  MX: "Mexico",
  ES: "Spain",
  IT: "Italy",
  NL: "Netherlands",
  SE: "Sweden",
  Unknown: "Unknown",
};

function countryLabel(code: string) {
  return COUNTRY_NAMES[code] ?? code;
}

/** Sums a dimension's map (e.g. `countries`) across every day in the window, ranked descending. */
function rank(days: DailyAnalytics[], dimension: "countries" | "referrers" | "devices" | "paths") {
  const totals: Record<string, number> = {};
  for (const day of days) {
    for (const [key, count] of Object.entries(day[dimension])) {
      totals[key] = (totals[key] ?? 0) + count;
    }
  }
  return Object.entries(totals).sort((a, b) => b[1] - a[1]);
}

function RankedBars({
  title,
  rows,
  labelFor,
}: {
  title: string;
  rows: [string, number][];
  labelFor?: (key: string) => string;
}) {
  const max = rows[0]?.[1] ?? 0;
  return (
    <div>
      <p className="mb-2.5 text-xs font-medium text-muted-foreground">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No data yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.slice(0, 5).map(([key, count]) => (
            <div key={key} className="flex items-center gap-2.5">
              <span className="w-24 shrink-0 truncate text-xs" title={labelFor ? labelFor(key) : key}>
                {labelFor ? labelFor(key) : key}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-foreground/70"
                  style={{ width: `${max > 0 ? Math.max((count / max) * 100, 4) : 0}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DeviceSplit({ devices }: { devices: [string, number][] }) {
  const total = devices.reduce((sum, [, n]) => sum + n, 0);
  const desktop = devices.find(([k]) => k === "desktop")?.[1] ?? 0;
  const mobile = devices.find(([k]) => k === "mobile")?.[1] ?? 0;
  const desktopPct = total > 0 ? Math.round((desktop / total) * 100) : 0;

  return (
    <div>
      <p className="mb-2.5 text-xs font-medium text-muted-foreground">Devices</p>
      {total === 0 ? (
        <p className="text-xs text-muted-foreground">No data yet.</p>
      ) : (
        <>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-foreground/70" style={{ width: `${desktopPct}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Monitor className="h-3 w-3" /> Desktop {desktopPct}% ({desktop})
            </span>
            <span className="flex items-center gap-1">
              <Smartphone className="h-3 w-3" /> Mobile {100 - desktopPct}% ({mobile})
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/** Detailed per-app breakdown for the last 30 days — visits over time, top countries/referrers/pages, device split. */
export function AppAnalyticsPanel({ appId }: { appId: string }) {
  const { days, loading } = useAppAnalytics(appId);

  const chartData = useMemo(
    () =>
      days.map((d) => ({
        date: d.date.slice(5), // "MM-DD"
        visits: d.total,
      })),
    [days]
  );
  const countries = useMemo(() => rank(days, "countries"), [days]);
  const referrers = useMemo(() => rank(days, "referrers"), [days]);
  const devices = useMemo(() => rank(days, "devices"), [days]);
  const paths = useMemo(() => rank(days, "paths"), [days]);

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (days.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">
        No detailed traffic recorded yet — this fills in as the app gets real visits.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2.5 text-xs font-medium text-muted-foreground">Visits, last 30 days</p>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={{ stroke: "hsl(var(--border))" }}
                interval="preserveStartEnd"
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))" }}
                contentStyle={{
                  background: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Bar dataKey="visits" fill="hsl(var(--foreground) / 0.7)" radius={[3, 3, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <RankedBars title="Top countries" rows={countries} labelFor={countryLabel} />
        <RankedBars title="Top referrers" rows={referrers} />
        <RankedBars title="Top pages" rows={paths} />
        <DeviceSplit devices={devices as [string, number][]} />
      </div>
    </div>
  );
}
