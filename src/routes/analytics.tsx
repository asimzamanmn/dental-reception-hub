import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { DayChart } from "@/components/day-chart";
import { StatCard } from "@/components/stat-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { bucketByDay, daysAgo } from "@/lib/db";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Dental AI Receptionist" },
      {
        name: "description",
        content:
          "Read-only analytics across customers, conversations, messages, booking requests, appointments and AI interactions.",
      },
      { property: "og:title", content: "Analytics — Dental AI Receptionist" },
      {
        property: "og:description",
        content: "Trends and totals for your AI receptionist across the last 30 days.",
      },
    ],
  }),
  component: AnalyticsPage,
});

async function countRows(table: string, build?: (q: any) => any) {
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  if (build) query = build(query);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
];

function AnalyticsPage() {
  const [range, setRange] = useState("14");
  const days = Number(range);
  const since = daysAgo(days - 1);

  const totals = useQuery({
    queryKey: ["analytics-totals"],
    queryFn: async () => {
      const [customers, conversations, messages, bookings, appointments, ai] = await Promise.all([
        countRows("customers"),
        countRows("conversations"),
        countRows("messages"),
        countRows("booking_requests"),
        countRows("appointments"),
        countRows("ai_interactions"),
      ]);
      return { customers, conversations, messages, bookings, appointments, ai };
    },
  });

  const series = useQuery({
    queryKey: ["analytics-series", days],
    queryFn: async () => {
      const [conv, msg, book, appt, ai, cust] = await Promise.all([
        supabase.from("conversations").select("started_at").gte("started_at", since),
        supabase.from("messages").select("created_at").gte("created_at", since),
        supabase.from("booking_requests").select("created_at").gte("created_at", since),
        supabase.from("appointments").select("created_at").gte("created_at", since),
        supabase.from("ai_interactions").select("created_at, latency_ms").gte("created_at", since),
        supabase.from("customers").select("first_seen_at").gte("first_seen_at", since),
      ]);
      for (const res of [conv, msg, book, appt, ai, cust]) {
        if (res.error) throw res.error;
      }
      const aiRows = (ai.data ?? []) as Array<{ created_at: string; latency_ms: number | null }>;
      const latencies = aiRows.map((r) => r.latency_ms).filter((v): v is number => v != null);
      return {
        conversations: bucketByDay(conv.data ?? [], "started_at", days),
        messages: bucketByDay(msg.data ?? [], "created_at", days),
        bookings: bucketByDay(book.data ?? [], "created_at", days),
        appointments: bucketByDay(appt.data ?? [], "created_at", days),
        ai: bucketByDay(aiRows, "created_at", days),
        customers: bucketByDay(cust.data ?? [], "first_seen_at", days),
        avgLatency: latencies.length
          ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
          : null,
        p95Latency: latencies.length
          ? [...latencies].sort((a, b) => a - b)[Math.floor(latencies.length * 0.95) - 1 < 0 ? 0 : Math.floor(latencies.length * 0.95) - 1]
          : null,
      };
    },
  });

  const t = totals.data;

  return (
    <AppShell
      title="Analytics"
      description="Read-only performance across the whole pipeline"
      actions={
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Customers" value={t?.customers} loading={totals.isLoading} />
        <StatCard label="Conversations" value={t?.conversations} loading={totals.isLoading} />
        <StatCard label="Messages" value={t?.messages} loading={totals.isLoading} />
        <StatCard label="Booking requests" value={t?.bookings} loading={totals.isLoading} />
        <StatCard label="Appointments" value={t?.appointments} loading={totals.isLoading} />
        <StatCard label="AI interactions" value={t?.ai} loading={totals.isLoading} />
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <DayChart
          title="Conversations started"
          data={series.data?.conversations}
          loading={series.isLoading}
          color="var(--chart-1)"
        />
        <DayChart
          title="Messages exchanged"
          data={series.data?.messages}
          loading={series.isLoading}
          color="var(--chart-3)"
        />
        <DayChart
          title="Booking requests"
          data={series.data?.bookings}
          loading={series.isLoading}
          color="var(--chart-2)"
          kind="bar"
        />
        <DayChart
          title="Appointments created"
          data={series.data?.appointments}
          loading={series.isLoading}
          color="var(--chart-4)"
          kind="bar"
        />
        <DayChart
          title="AI interactions"
          data={series.data?.ai}
          loading={series.isLoading}
          color="var(--chart-5)"
        />
        <DayChart
          title="New customers"
          data={series.data?.customers}
          loading={series.isLoading}
          color="var(--chart-1)"
          kind="bar"
        />
      </div>

      <section className="surface mt-4 overflow-x-auto">
        <div className="px-4 pt-4">
          <p className="text-sm font-medium">AI response latency</p>
          <p className="text-xs text-muted-foreground">Across the selected period</p>
        </div>
        {series.isLoading ? (
          <Skeleton className="m-4 h-20" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Average latency</TableCell>
                <TableCell className="text-right tabular-nums">
                  {series.data?.avgLatency != null ? `${series.data.avgLatency} ms` : "—"}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>95th percentile latency</TableCell>
                <TableCell className="text-right tabular-nums">
                  {series.data?.p95Latency != null ? `${series.data.p95Latency} ms` : "—"}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </section>
    </AppShell>
  );
}
