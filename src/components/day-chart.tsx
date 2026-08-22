import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

type Point = { day: string; count: number };

export function DayChart({
  title,
  data,
  loading,
  color = "var(--chart-1)",
  kind = "area",
}: {
  title: string;
  data: Point[] | undefined;
  loading?: boolean;
  color?: string;
  kind?: "area" | "bar";
}) {
  const gradientId = `grad-${title.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="surface p-4">
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-4 h-48">
        {loading ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {kind === "bar" ? (
              <BarChart data={data ?? []}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  stroke="var(--muted-foreground)"
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  width={28}
                  stroke="var(--muted-foreground)"
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    color: "var(--popover-foreground)",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" fill={color} radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <AreaChart data={data ?? []}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  stroke="var(--muted-foreground)"
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  width={28}
                  stroke="var(--muted-foreground)"
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    color: "var(--popover-foreground)",
                    fontSize: 12,
                  }}
                />
                <Area
                  dataKey="count"
                  stroke={color}
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
