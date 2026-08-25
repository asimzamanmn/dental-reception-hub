import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  CalendarCheck,
  Clock,
  MessageSquare,
  MessagesSquare,
  Radio,
  Users,
  Inbox,
  Calendar,
  User,
  AlertTriangle,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { DayChart } from "@/components/day-chart";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  bucketByDay,
  daysAgo,
  formatDate,
  formatDateTime,
  startOfToday,
  type RecentBooking,
  type RecentConversation,
} from "@/lib/db";

async function triggerN8nWebhook(payload: {
  bookingId: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  serviceName: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  notes?: string;
}) {
  if (!payload.customerEmail?.trim()) {
    console.log("No customer email provided. Skipping email confirmation webhook trigger.");
    return;
  }

  const url = localStorage.getItem("n8n_email_webhook_url") || import.meta.env.VITE_N8N_EMAIL_WEBHOOK_URL;
  if (!url) {
    console.warn("No n8n webhook URL configured. Skipping email confirmation trigger.");
    return;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`n8n webhook returned status ${res.status}`);
    }
  } catch (err: any) {
    console.error("Failed to trigger n8n email confirmation:", err);
    toast.error("Booking processed but n8n webhook failed: " + err.message);
  }
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Dental AI Receptionist Console" },
      {
        name: "description",
        content:
          "Live overview of conversations, messages, booking requests and AI activity for your Instagram dental receptionist.",
      },
      { property: "og:title", content: "Dashboard — Dental AI Receptionist Console" },
      {
        property: "og:description",
        content: "Conversations, bookings and AI performance for your dental clinic at a glance.",
      },
    ],
  }),
  component: DashboardPage,
});

async function countRows(table: string, build?: (q: any) => any) {
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  if (build) query = build(query);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

function DashboardPage() {
  const today = startOfToday();
  const since = daysAgo(13);
  const queryClient = useQueryClient();

  // Booking action states
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("");
  const [appointmentDate, setAppointmentDate] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("09:00");
  const [endTime, setEndTime] = useState<string>("09:30");
  const [notes, setNotes] = useState<string>("");
  const [isDeclineMode, setIsDeclineMode] = useState<boolean>(false);

  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [
        customers,
        conversations,
        activeConversations,
        messagesToday,
        pendingBookings,
        confirmedAppointments,
        aiToday,
      ] = await Promise.all([
        countRows("customers"),
        countRows("conversations"),
        countRows("conversations", (q) => q.eq("status", "ACTIVE")),
        countRows("messages", (q) => q.gte("created_at", today)),
        countRows("booking_requests", (q) => q.eq("status", "PENDING_STAFF")),
        countRows("appointments"),
        countRows("ai_interactions", (q) => q.gte("created_at", today)),
      ]);
      const { data: latency, error } = await supabase
        .from("ai_interactions")
        .select("latency_ms")
        .gte("created_at", today)
        .not("latency_ms", "is", null);
      if (error) throw error;
      const values = (latency ?? []).map((r: { latency_ms: number }) => r.latency_ms);
      const avg = values.length
        ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
        : null;
      return {
        customers,
        conversations,
        activeConversations,
        messagesToday,
        pendingBookings,
        confirmedAppointments,
        aiToday,
        avgLatency: avg,
      };
    },
  });

  const trends = useQuery({
    queryKey: ["dashboard-trends"],
    queryFn: async () => {
      const [conv, msg, book] = await Promise.all([
        supabase.from("conversations").select("started_at").gte("started_at", since),
        supabase.from("messages").select("created_at").gte("created_at", since),
        supabase.from("booking_requests").select("created_at").gte("created_at", since),
      ]);
      if (conv.error) throw conv.error;
      if (msg.error) throw msg.error;
      if (book.error) throw book.error;
      return {
        conversations: bucketByDay(conv.data ?? [], "started_at", 14),
        messages: bucketByDay(msg.data ?? [], "created_at", 14),
        bookings: bucketByDay(book.data ?? [], "created_at", 14),
      };
    },
  });

  const recentConversations = useQuery({
    queryKey: ["recent-conversations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select(
          "id, status, lead_stage, booking_state, last_intent, last_activity_at, customers(display_name, instagram_username)",
        )
        .order("last_activity_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data ?? []) as unknown as RecentConversation[];
    },
  });

  const recentBookings = useQuery({
    queryKey: ["recent-bookings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_requests")
        .select(
          "id, status, preferred_date, preferred_time_text, urgency, ai_summary, patient_notes, created_at, service_id, email, customers(display_name, instagram_username, phone), services(name, duration_minutes), appointments(appointment_date, start_time, end_time)",
        )
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data as any[];
    },
  });

  const pendingBookingsList = useQuery({
    queryKey: ["pending-bookings-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_requests")
        .select(
          "id, status, preferred_date, preferred_time_text, urgency, ai_summary, patient_notes, created_at, service_id, email, customers(display_name, instagram_username, phone), services(name, duration_minutes), appointments(appointment_date, start_time, end_time)",
        )
        .eq("status", "PENDING_STAFF")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const doctorsQuery = useQuery({
    queryKey: ["doctors-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doctors")
        .select("id, name, slot_duration_minutes")
        .eq("active", true);
      if (error) throw error;
      return data || [];
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async ({
      bookingId,
      date,
      start,
      end,
      notesText,
    }: {
      bookingId: string;
      date: string;
      start: string;
      end: string;
      notesText: string;
    }) => {
      // 1. Update booking request status
      const { error: updateError } = await supabase
        .from("booking_requests")
        .update({
          status: "CONFIRMED",
          confirmed_at: new Date().toISOString(),
          reviewed_at: new Date().toISOString(),
          reviewed_by: "Staff",
        })
        .eq("id", bookingId);
      if (updateError) throw updateError;

      // 2. Create appointment
      const { error: insertError } = await supabase.from("appointments").insert({
        booking_request_id: bookingId,
        doctor_id: null,
        appointment_date: date,
        start_time: start + ":00",
        end_time: end + ":00",
        status: "SCHEDULED",
        notes: notesText || null,
      });
      if (insertError) throw insertError;
    },
    onSuccess: (_, variables) => {
      toast.success("Booking request confirmed!");

      const booking = recentBookings.data?.find((b) => b.id === variables.bookingId) ||
                      pendingBookingsList.data?.find((b) => b.id === variables.bookingId);
      if (booking) {
        void triggerN8nWebhook({
          bookingId: variables.bookingId,
          customerName: booking.customers?.display_name || "Guest",
          customerEmail: booking.email || "",
          customerPhone: booking.customers?.phone || "",
          serviceName: booking.services?.name || "Dental Checkup",
          appointmentDate: variables.date,
          startTime: variables.start,
          endTime: variables.end,
          notes: variables.notesText,
        });
      }

      setSelectedBooking(null);
      void queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-trends"] });
      void queryClient.invalidateQueries({ queryKey: ["recent-bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["pending-bookings-list"] });
    },
    onError: (err: any) => {
      toast.error("Failed to confirm booking: " + err.message);
    },
  });

  const declineMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase
        .from("booking_requests")
        .update({
          status: "DECLINED",
          reviewed_at: new Date().toISOString(),
          reviewed_by: "Staff",
        })
        .eq("id", bookingId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Booking request declined.");
      setSelectedBooking(null);
      void queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-trends"] });
      void queryClient.invalidateQueries({ queryKey: ["recent-bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["pending-bookings-list"] });
    },
    onError: (err: any) => {
      toast.error("Failed to decline booking: " + err.message);
    },
  });

  const handleOpenBooking = (booking: any) => {
    setSelectedBooking(booking);
    setAppointmentDate(booking.preferred_date || "");
    setNotes(booking.patient_notes || "");
    setSelectedDoctorId("");
    setIsDeclineMode(false);

    // Set default times
    setStartTime("09:00");
    const duration = booking.services?.duration_minutes || 30;
    const endMinutes = 9 * 60 + duration;
    const endH = Math.floor(endMinutes / 60);
    const endM = endMinutes % 60;
    setEndTime(`${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`);
  };

  const handleStartTimeChange = (start: string) => {
    setStartTime(start);
    if (selectedBooking) {
      const duration = selectedBooking.services?.duration_minutes || 30;
      const [h, m] = start.split(":").map(Number);
      const endMinutes = h * 60 + m + duration;
      const endH = Math.floor(endMinutes / 60) % 24;
      const endM = endMinutes % 60;
      setEndTime(`${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`);
    }
  };

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBooking) return;
    if (!appointmentDate) {
      toast.error("Please select an appointment date");
      return;
    }
    confirmMutation.mutate({
      bookingId: selectedBooking.id,
      date: appointmentDate,
      start: startTime,
      end: endTime,
      notesText: notes,
    });
  };

  const s = stats.data;

  return (
    <AppShell title="Dashboard" description="Live activity from your AI Instagram receptionist">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total customers" value={s?.customers} icon={Users} loading={stats.isLoading} />
        <StatCard
          label="Total conversations"
          value={s?.conversations}
          icon={MessagesSquare}
          loading={stats.isLoading}
        />
        <StatCard
          label="Active conversations"
          value={s?.activeConversations}
          icon={Radio}
          loading={stats.isLoading}
        />
        <StatCard
          label="Messages today"
          value={s?.messagesToday}
          icon={MessageSquare}
          loading={stats.isLoading}
        />
        <StatCard
          label="Pending bookings"
          value={s?.pendingBookings}
          hint="Awaiting staff review"
          icon={Inbox}
          loading={stats.isLoading}
        />
        <StatCard
          label="Confirmed appointments"
          value={s?.confirmedAppointments}
          icon={CalendarCheck}
          loading={stats.isLoading}
        />
        <StatCard
          label="AI interactions today"
          value={s?.aiToday}
          icon={Activity}
          loading={stats.isLoading}
        />
        <StatCard
          label="Avg AI response time"
          value={s?.avgLatency != null ? `${s.avgLatency} ms` : "—"}
          hint="Today's mean latency"
          icon={Clock}
          loading={stats.isLoading}
        />
      </div>

      {stats.error ? (
        <p className="mt-4 text-sm text-destructive">
          Could not load analytics: {(stats.error as Error).message}
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 xl:grid-cols-3">
        <DayChart
          title="Conversations per day"
          data={trends.data?.conversations}
          loading={trends.isLoading}
          color="var(--chart-1)"
        />
        <DayChart
          title="Bookings per day"
          data={trends.data?.bookings}
          loading={trends.isLoading}
          color="var(--chart-2)"
          kind="bar"
        />
        <DayChart
          title="Messages per day"
          data={trends.data?.messages}
          loading={trends.isLoading}
          color="var(--chart-3)"
        />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {/* Column 1: Conversations */}
        <section className="surface p-4">
          <p className="text-sm font-medium">Recent conversations</p>
          <div className="mt-3 divide-y divide-border">
            {recentConversations.isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="my-2 h-10 w-full" />
                ))
              : (recentConversations.data ?? []).map((c) => (
                  <div key={c.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {c.customers?.display_name ??
                          (c.customers?.instagram_username
                            ? `@${c.customers.instagram_username}`
                            : "Unknown customer")}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.last_intent ?? "No intent detected"} · {formatDateTime(c.last_activity_at)}
                      </p>
                    </div>
                    <Badge variant={c.status === "ACTIVE" ? "default" : "secondary"}>
                      {c.status ?? "—"}
                    </Badge>
                  </div>
                ))}
            {!recentConversations.isLoading && !(recentConversations.data ?? []).length ? (
              <p className="py-6 text-sm text-muted-foreground">No conversations yet.</p>
            ) : null}
          </div>
        </section>

        {/* Column 2: Pending Bookings */}
        <section className="surface p-4">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <p className="text-sm font-medium text-amber-500">Pending bookings</p>
          </div>
          <div className="mt-3 divide-y divide-border">
            {pendingBookingsList.isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="my-2 h-10 w-full" />
                ))
              : (pendingBookingsList.data ?? []).map((b) => (
                  <button
                    key={b.id}
                    onClick={() => handleOpenBooking(b)}
                    className="flex w-full items-start justify-between gap-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus:outline-none"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          {b.customers?.display_name ??
                            (b.customers?.instagram_username
                              ? `@${b.customers.instagram_username}`
                              : "Unknown customer")}
                        </p>
                        {b.urgency && b.urgency > 70 ? (
                          <Badge variant="destructive" className="h-4 px-1 text-[9px] uppercase tracking-wider">
                            Urgent
                          </Badge>
                        ) : null}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {b.services?.name ?? "No service"} ·{" "}
                        {b.preferred_date ? formatDate(b.preferred_date) : (b.preferred_time_text ?? "No preference")}
                      </p>
                    </div>
                    <Badge variant="default">{b.status}</Badge>
                  </button>
                ))}
            {!pendingBookingsList.isLoading && !(pendingBookingsList.data ?? []).length ? (
              <p className="py-6 text-sm text-muted-foreground">No pending booking requests.</p>
            ) : null}
          </div>
        </section>

        {/* Column 3: Recent booking requests (All history) */}
        <section className="surface p-4">
          <p className="text-sm font-medium">Recent booking requests</p>
          <div className="mt-3 divide-y divide-border">
            {recentBookings.isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="my-2 h-10 w-full" />
                ))
              : (recentBookings.data ?? []).map((b) => (
                  <button
                    key={b.id}
                    onClick={() => handleOpenBooking(b)}
                    className="flex w-full items-start justify-between gap-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus:outline-none"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          {b.customers?.display_name ??
                            (b.customers?.instagram_username
                              ? `@${b.customers.instagram_username}`
                              : "Unknown customer")}
                        </p>
                        {b.urgency && b.urgency > 70 ? (
                          <Badge variant="destructive" className="h-4 px-1 text-[9px] uppercase tracking-wider">
                            Urgent
                          </Badge>
                        ) : null}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {b.services?.name ?? "No service"} ·{" "}
                        {b.status === "CONFIRMED" && b.appointments?.[0] ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            Confirmed: {formatDate(b.appointments[0].appointment_date)} @ {b.appointments[0].start_time.slice(0, 5)}
                          </span>
                        ) : (
                          b.preferred_date ? formatDate(b.preferred_date) : (b.preferred_time_text ?? "No preference")
                        )}
                      </p>
                    </div>
                    <Badge
                      variant={
                        b.status === "PENDING_STAFF"
                          ? "default"
                          : b.status === "CONFIRMED"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {b.status}
                    </Badge>
                  </button>
                ))}
            {!recentBookings.isLoading && !(recentBookings.data ?? []).length ? (
              <p className="py-6 text-sm text-muted-foreground">No booking requests yet.</p>
            ) : null}
          </div>
        </section>
      </div>

      {/* Booking detailed Dialog */}
      <Dialog open={!!selectedBooking} onOpenChange={(open) => !open && setSelectedBooking(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review Booking Request</DialogTitle>
            <DialogDescription>
              Requested by{" "}
              <span className="font-semibold text-foreground">
                {selectedBooking?.customers?.display_name ?? "Unknown"}
              </span>{" "}
              {selectedBooking?.customers?.instagram_username && (
                <span className="text-xs text-muted-foreground">
                  (@{selectedBooking.customers.instagram_username})
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedBooking && (
            <div className="space-y-4 py-2">
              {/* Request Metadata */}
              <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/30 p-3 text-xs">
                <div>
                  <span className="block text-muted-foreground">Treatment:</span>
                  <span className="font-medium">{selectedBooking.services?.name ?? "—"}</span>
                </div>
                <div>
                  <span className="block text-muted-foreground">Duration:</span>
                  <span className="font-medium">
                    {selectedBooking.services?.duration_minutes
                      ? `${selectedBooking.services.duration_minutes} mins`
                      : "—"}
                  </span>
                </div>
                <div>
                  <span className="block text-muted-foreground">Preferred Date:</span>
                  <span className="font-medium">
                    {selectedBooking.preferred_date ? formatDate(selectedBooking.preferred_date) : "—"}
                  </span>
                </div>
                <div>
                  <span className="block text-muted-foreground">Preferred Time Context:</span>
                  <span className="font-medium">{selectedBooking.preferred_time_text ?? "—"}</span>
                </div>
                <div className="col-span-2">
                  <span className="block text-muted-foreground">Patient Phone Number:</span>
                  <span className="font-medium text-primary">{selectedBooking.customers?.phone ?? "—"}</span>
                </div>
              </div>

              {/* AI Summary and patient notes */}
              {selectedBooking.ai_summary && (
                <div className="rounded-lg border border-border bg-card p-3 text-xs">
                  <span className="font-semibold text-muted-foreground block mb-1">AI Assistant Summary:</span>
                  <p className="text-foreground">{selectedBooking.ai_summary}</p>
                </div>
              )}

              {selectedBooking.patient_notes && (
                <div className="rounded-lg border border-border bg-card p-3 text-xs">
                  <span className="font-semibold text-muted-foreground block mb-1">Patient Notes:</span>
                  <p className="text-foreground">{selectedBooking.patient_notes}</p>
                </div>
              )}

              {/* Action Modes */}
              {selectedBooking.status === "PENDING_STAFF" ? (
                !isDeclineMode ? (
                  <form onSubmit={handleConfirm} className="space-y-3 border-t border-border pt-4">
                    <h4 className="text-sm font-medium">Schedule Appointment Details</h4>

                    {/* Doctor assignment omitted as requested */}

                      <div className="space-y-1">
                        <Label htmlFor="appt-date" className="text-xs">Appointment Date</Label>
                        <Input
                          id="appt-date"
                          type="date"
                          required
                          className="h-9"
                          value={appointmentDate}
                          onChange={(e) => setAppointmentDate(e.target.value)}
                        />
                      </div>


                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="start-time" className="text-xs">Start Time</Label>
                        <Input
                          id="start-time"
                          type="time"
                          required
                          className="h-9"
                          value={startTime}
                          onChange={(e) => handleStartTimeChange(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="end-time" className="text-xs">End Time (calculated)</Label>
                        <Input
                          id="end-time"
                          type="time"
                          required
                          className="h-9"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="notes" className="text-xs">Appointment Notes</Label>
                      <Textarea
                        id="notes"
                        placeholder="Add scheduling notes or instructions..."
                        rows={2}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </div>

                    <DialogFooter className="pt-2">
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => setIsDeclineMode(true)}
                      >
                        Decline Request
                      </Button>
                      <Button type="submit" disabled={confirmMutation.isPending}>
                        {confirmMutation.isPending ? "Confirming..." : "Confirm & Schedule"}
                      </Button>
                    </DialogFooter>
                  </form>
                ) : (
                  <div className="space-y-3 border-t border-border pt-4">
                    <h4 className="text-sm font-medium text-destructive flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4" /> Decline Booking Request
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Are you sure you want to decline this booking request? This action will set the request status to DECLINED.
                    </p>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" onClick={() => setIsDeclineMode(false)}>
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={declineMutation.isPending}
                        onClick={() => declineMutation.mutate(selectedBooking.id)}
                      >
                        {declineMutation.isPending ? "Declining..." : "Decline Booking"}
                      </Button>
                    </div>
                  </div>
                )
              ) : (
                <div className="border-t border-border pt-4 flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">
                    This booking has already been reviewed as <span className="font-semibold text-foreground">{selectedBooking.status}</span>.
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setSelectedBooking(null)}>
                    Close
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

