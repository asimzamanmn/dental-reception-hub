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
  Trash2,
  XCircle,
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
import { Switch } from "@/components/ui/switch";
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
import { formatIndianPhone } from "@/lib/utils";
import {
  fetchWebchatBookings,
  updateWebchatBookingStatus,
  deleteWebchatBooking,
} from "@/lib/webchat";

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
  const [isDeleteMode, setIsDeleteMode] = useState<boolean>(false);

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
        webchatBookings,
      ] = await Promise.all([
        countRows("customers"),
        countRows("conversations"),
        countRows("conversations", (q) => q.eq("status", "ACTIVE")),
        countRows("messages", (q) => q.gte("created_at", today)),
        countRows("booking_requests", (q) => q.eq("status", "PENDING_STAFF")),
        countRows("appointments"),
        countRows("ai_interactions", (q) => q.gte("created_at", today)),
        fetchWebchatBookings(),
      ]);
      const webchatPending = (webchatBookings || []).filter(
        (b: any) => b.status === "PENDING_STAFF"
      ).length;
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
        pendingBookings: pendingBookings + webchatPending,
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
      const [publicRes, webchatBookings] = await Promise.all([
        supabase
          .from("booking_requests")
          .select(
            "id, status, preferred_date, preferred_time_text, urgency, ai_summary, patient_notes, created_at, service_id, email, customers(display_name, instagram_username, phone), services(name, duration_minutes), appointments(appointment_date, start_time, end_time)",
          )
          .order("created_at", { ascending: false })
          .limit(10),
        fetchWebchatBookings(),
      ]);

      if (publicRes.error) throw publicRes.error;
      const publicList = (publicRes.data || []).map((b: any) => ({
        ...b,
        source: "instagram" as const,
      }));

      const combined = [...publicList, ...webchatBookings];
      combined.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      return combined.slice(0, 6);
    },
  });

  const pendingBookingsList = useQuery({
    queryKey: ["pending-bookings-list"],
    queryFn: async () => {
      const [publicRes, webchatBookings] = await Promise.all([
        supabase
          .from("booking_requests")
          .select(
            "id, status, preferred_date, preferred_time_text, urgency, ai_summary, patient_notes, created_at, service_id, email, customers(display_name, instagram_username, phone), services(name, duration_minutes), appointments(appointment_date, start_time, end_time)",
          )
          .eq("status", "PENDING_STAFF")
          .order("created_at", { ascending: false }),
        fetchWebchatBookings(),
      ]);

      if (publicRes.error) throw publicRes.error;
      const publicList = (publicRes.data || []).map((b: any) => ({
        ...b,
        source: "instagram" as const,
      }));

      const webchatPending = webchatBookings.filter(
        (b: any) => b.status === "PENDING_STAFF"
      );

      const combined = [...publicList, ...webchatPending];
      combined.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      return combined;
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
      const booking =
        recentBookings.data?.find((b) => b.id === bookingId) ||
        pendingBookingsList.data?.find((b) => b.id === bookingId);
      const isWebchat = booking?.source === "webchat";

      if (isWebchat) {
        await updateWebchatBookingStatus(bookingId, "CONFIRMED");
      } else {
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
      }

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
      if (insertError) {
        console.warn("Could not insert linked appointment:", insertError.message);
      }
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
      const booking =
        recentBookings.data?.find((b) => b.id === bookingId) ||
        pendingBookingsList.data?.find((b) => b.id === bookingId);

      if (booking?.source === "webchat") {
        await updateWebchatBookingStatus(bookingId, "DECLINED");
      } else {
        const { error } = await supabase
          .from("booking_requests")
          .update({
            status: "DECLINED",
            reviewed_at: new Date().toISOString(),
            reviewed_by: "Staff",
          })
          .eq("id", bookingId);
        if (error) throw error;
      }
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

  const deleteBookingMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const booking =
        recentBookings.data?.find((b) => b.id === bookingId) ||
        pendingBookingsList.data?.find((b) => b.id === bookingId);

      if (booking?.source === "webchat") {
        await deleteWebchatBooking(bookingId);
      } else {
        const { error: apptErr } = await supabase
          .from("appointments")
          .delete()
          .eq("booking_request_id", bookingId);
        if (apptErr) console.warn("Failed deleting linked appointments:", apptErr);

        const { error } = await supabase
          .from("booking_requests")
          .delete()
          .eq("id", bookingId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Pending booking request deleted successfully.");
      setSelectedBooking(null);
      setIsDeleteMode(false);
      setIsDeclineMode(false);
      void queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-trends"] });
      void queryClient.invalidateQueries({ queryKey: ["recent-bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["pending-bookings-list"] });
    },
    onError: (err: any) => {
      toast.error("Failed to delete booking request: " + err.message);
    },
  });

  const handleOpenBooking = (booking: any) => {
    setSelectedBooking(booking);
    setAppointmentDate(booking.preferred_date || "");
    setNotes(booking.patient_notes || "");
    setSelectedDoctorId("");
    setIsDeclineMode(false);
    setIsDeleteMode(false);

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
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="truncate text-sm font-medium">
                          {b.customers?.display_name ||
                            (b.customers?.instagram_username
                              ? `@${b.customers.instagram_username}`
                              : b.source === "webchat"
                              ? (b.session_id ? `Session #${b.session_id.slice(0, 8)}` : "Webchat Patient")
                              : "Guest Patient")}
                        </p>
                        {b.source === "webchat" ? (
                          <Badge variant="outline" className="bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25 text-[10px] px-1.5 py-0 font-semibold">
                            Webchat
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/25 text-[10px] px-1.5 py-0 font-medium">
                            Instagram
                          </Badge>
                        )}
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
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="truncate text-sm font-medium">
                          {b.customers?.display_name ||
                            (b.customers?.instagram_username
                              ? `@${b.customers.instagram_username}`
                              : b.source === "webchat"
                              ? (b.session_id ? `Session #${b.session_id.slice(0, 8)}` : "Webchat Patient")
                              : "Guest Patient")}
                        </p>
                        {b.source === "webchat" ? (
                          <Badge variant="outline" className="bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25 text-[10px] px-1.5 py-0 font-semibold">
                            Webchat
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/25 text-[10px] px-1.5 py-0 font-medium">
                            Instagram
                          </Badge>
                        )}
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
      <Dialog
        open={!!selectedBooking}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedBooking(null);
            setIsDeclineMode(false);
            setIsDeleteMode(false);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review Booking Request</DialogTitle>
            <DialogDescription className="text-xs flex items-center gap-1.5 flex-wrap">
              <span>
                Requested by{" "}
                <span className="font-semibold text-foreground">
                  {selectedBooking?.customers?.display_name ?? "Unknown"}
                </span>
              </span>
              {selectedBooking?.source === "webchat" ? (
                <Badge variant="outline" className="bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25 text-[10px] px-1.5 py-0 font-semibold">
                  Webchat
                </Badge>
              ) : selectedBooking?.customers?.instagram_username ? (
                <span className="text-xs text-muted-foreground font-mono">
                  (@{selectedBooking.customers.instagram_username})
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          {selectedBooking && (
            <div className="space-y-4 py-2">
              {/* Request Metadata */}
              <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/30 p-3 text-xs">
                <div className="col-span-2 flex items-center justify-between border-b border-border/50 pb-2 mb-1">
                  <span className="text-muted-foreground">Source Channel:</span>
                  {selectedBooking.source === "webchat" ? (
                    <Badge variant="outline" className="bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25 text-[10px] px-1.5 py-0 font-semibold">
                      Webchat
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/25 text-[10px] px-1.5 py-0 font-medium">
                      Instagram
                    </Badge>
                  )}
                </div>
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
                  <span className="font-medium text-primary font-mono">{formatIndianPhone(selectedBooking.customers?.phone) || "—"}</span>
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
                <div className="space-y-3 border-t border-border pt-4">
                  {/* Delete Switch & Decline Switch */}
                  <div className="space-y-2 mb-1">
                    {/* Switch to Delete Pending Booking Request */}
                    <div className="flex items-center justify-between rounded-lg border border-destructive/25 bg-destructive/5 p-2.5 transition-colors">
                      <div className="flex items-center gap-2">
                        <Trash2 className="h-4 w-4 text-destructive shrink-0" />
                        <div>
                          <Label htmlFor="delete-mode-switch-idx" className="text-xs font-semibold text-destructive cursor-pointer">
                            Delete pending booking request
                          </Label>
                          <p className="text-[11px] text-muted-foreground">
                            Permanently erase this request from the database
                          </p>
                        </div>
                      </div>
                      <Switch
                        id="delete-mode-switch-idx"
                        checked={isDeleteMode}
                        onCheckedChange={(checked) => {
                          setIsDeleteMode(checked);
                          if (checked) setIsDeclineMode(false);
                        }}
                      />
                    </div>

                    {/* Switch to Decline Booking Request */}
                    {!isDeleteMode && (
                      <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/15 p-2.5 transition-colors">
                        <div className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                          <div>
                            <Label htmlFor="decline-mode-switch-idx" className="text-xs font-semibold text-foreground cursor-pointer">
                              Decline booking request
                            </Label>
                            <p className="text-[11px] text-muted-foreground">
                              Mark request as declined without deleting it
                            </p>
                          </div>
                        </div>
                        <Switch
                          id="decline-mode-switch-idx"
                          checked={isDeclineMode}
                          onCheckedChange={(checked) => {
                            setIsDeclineMode(checked);
                            if (checked) setIsDeleteMode(false);
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {isDeleteMode ? (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 space-y-1.5 text-destructive animate-in fade-in duration-200">
                        <div className="flex items-center gap-2 font-semibold text-xs">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span>Permanent Deletion Warning</span>
                        </div>
                        <p className="text-[11px] text-destructive/90 leading-relaxed">
                          Are you sure you want to permanently delete this pending booking request for{" "}
                          <strong className="font-semibold">{selectedBooking?.customers?.display_name || "Guest"}</strong>?
                          This action cannot be undone.
                        </p>
                      </div>
                      <DialogFooter className="pt-2">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setSelectedBooking(null);
                            setIsDeleteMode(false);
                            setIsDeclineMode(false);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="font-semibold shadow-xs"
                          disabled={deleteBookingMutation.isPending}
                          onClick={() => deleteBookingMutation.mutate(selectedBooking.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                          {deleteBookingMutation.isPending ? "Deleting..." : "Permanently Delete Request"}
                        </Button>
                      </DialogFooter>
                    </div>
                  ) : isDeclineMode ? (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-1.5 text-amber-700 dark:text-amber-400 animate-in fade-in duration-200">
                        <div className="flex items-center gap-2 font-semibold text-xs">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span>Decline Booking Request</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Are you sure you want to decline this booking request? This will set the request status to DECLINED.
                        </p>
                      </div>
                      <DialogFooter className="pt-2">
                        <Button variant="outline" onClick={() => setIsDeclineMode(false)}>
                          Cancel
                        </Button>
                        <Button
                          variant="destructive"
                          disabled={declineMutation.isPending}
                          onClick={() => declineMutation.mutate(selectedBooking.id)}
                        >
                          {declineMutation.isPending ? "Declining..." : "Confirm Decline"}
                        </Button>
                      </DialogFooter>
                    </div>
                  ) : (
                    <form onSubmit={handleConfirm} className="space-y-3">
                      <h4 className="text-sm font-medium">Schedule Appointment Details</h4>

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
                          onClick={() => {
                            setSelectedBooking(null);
                            setIsDeleteMode(false);
                            setIsDeclineMode(false);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button type="submit" disabled={confirmMutation.isPending}>
                          {confirmMutation.isPending ? "Confirming..." : "Confirm & Schedule"}
                        </Button>
                      </DialogFooter>
                    </form>
                  )}
                </div>
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

