import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarCheck, Clock, Search, User, UserCheck, AlertTriangle, ShieldAlert, Sparkles, Filter, MoreHorizontal, Check, X, Calendar, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime, type RecentBooking } from "@/lib/db";
import { useAuth } from "@/hooks/use-auth";

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

export const Route = createFileRoute("/bookings")({
  head: () => ({
    meta: [
      { title: "Bookings — Dental AI Receptionist Console" },
      {
        name: "description",
        content: "Search, filter and manage patient booking requests, appointments and AI receptionist summaries.",
      },
    ],
  }),
  component: BookingsPage,
});

function BookingsPage() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  
  // Filtering and Searching States
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Action Dialog States
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("");
  const [appointmentDate, setAppointmentDate] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("09:00");
  const [endTime, setEndTime] = useState<string>("09:30");
  const [notes, setNotes] = useState<string>("");
  const [isDeclineMode, setIsDeclineMode] = useState<boolean>(false);

  // Manual Booking States
  const [isManualBookingOpen, setIsManualBookingOpen] = useState(false);
  const [manualPatientName, setManualPatientName] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualServiceId, setManualServiceId] = useState("");
  const [manualDate, setManualDate] = useState("");
  const [manualStartTime, setManualStartTime] = useState("09:00");
  const [manualEndTime, setManualEndTime] = useState("09:30");
  const [manualNotes, setManualNotes] = useState("");

  // Queries
  const bookingsQuery = useQuery({
    queryKey: ["all-bookings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_requests")
        .select(
          "id, status, preferred_date, preferred_time_text, urgency, ai_summary, patient_notes, created_at, service_id, email, customers(display_name, instagram_username, phone), services(name, duration_minutes), appointments(appointment_date, start_time, end_time)"
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const servicesQuery = useQuery({
    queryKey: ["services-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, duration_minutes")
        .eq("active", true);
      if (error) throw error;
      return data || [];
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

  // Mutations
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
      const { error: updateError } = await supabase
        .from("booking_requests")
        .update({
          status: "CONFIRMED",
          confirmed_at: new Date().toISOString(),
          reviewed_at: new Date().toISOString(),
          reviewed_by: role === "admin" ? "Admin" : "Staff",
        })
        .eq("id", bookingId);
      if (updateError) throw updateError;

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
      
      const booking = bookingsQuery.data?.find((b) => b.id === variables.bookingId);
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
      void queryClient.invalidateQueries({ queryKey: ["all-bookings"] });
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
          reviewed_by: role === "admin" ? "Admin" : "Staff",
        })
        .eq("id", bookingId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Booking request declined.");
      setSelectedBooking(null);
      void queryClient.invalidateQueries({ queryKey: ["all-bookings"] });
    },
    onError: (err: any) => {
      toast.error("Failed to decline booking: " + err.message);
    },
  });

  const addManualBookingMutation = useMutation({
    mutationFn: async () => {
      if (!manualPatientName.trim()) throw new Error("Patient name is required.");
      if (!manualDate) throw new Error("Appointment date is required.");

      // 1. Find or create placeholder customer
      let customerId;
      if (manualPhone.trim()) {
        const { data } = await supabase
          .from("customers")
          .select("id")
          .eq("phone", manualPhone.trim())
          .maybeSingle();
        customerId = data?.id;
      }
      if (!customerId) {
        const display = manualPatientName.trim();
        const instaId = "manual_" + Date.now();
        const { data, error } = await supabase
          .from("customers")
          .insert({
            instagram_user_id: instaId,
            instagram_username: "manual_" + display.replace(/\s+/g, "_").toLowerCase(),
            display_name: display,
            phone: manualPhone.trim() || null,
            preferred_language: "en",
          })
          .select("id")
          .single();
        if (error) throw error;
        customerId = data.id;
      }

      // 2. Insert dummy conversation
      const { data: conv, error: convErr } = await supabase
        .from("conversations")
        .insert({
          customer_id: customerId,
          status: "CLOSED",
          lead_stage: "CONVERTED",
          booking_state: "CONFIRMED",
          last_intent: "phone_booking",
          summary: "Manual booking created via phone call.",
        })
        .select("id")
        .single();
      if (convErr) throw convErr;

      // 3. Insert booking request
      const { data: request, error: reqErr } = await supabase
        .from("booking_requests")
        .insert({
          customer_id: customerId,
          conversation_id: conv.id,
          service_id: manualServiceId || null,
          status: "CONFIRMED",
          preferred_date: manualDate,
          preferred_time_text: manualStartTime,
          urgency: 3,
          patient_notes: manualNotes || null,
          email: manualEmail.trim() || null,
          reviewed_by: role === "admin" ? "Admin" : "Staff",
          reviewed_at: new Date().toISOString(),
          confirmed_at: new Date().toISOString(),
          created_by_ai: false,
        })
        .select("id")
        .single();
      if (reqErr) throw reqErr;

      // 4. Insert appointment
      const { error: apptErr } = await supabase.from("appointments").insert({
        booking_request_id: request.id,
        doctor_id: null,
        appointment_date: manualDate,
        start_time: manualStartTime + ":00",
        end_time: manualEndTime + ":00",
        status: "SCHEDULED",
        notes: manualNotes || null,
      });
      if (apptErr) throw apptErr;

      return request.id;
    },
    onSuccess: (bookingId) => {
      toast.success("Manual booking created!");
      
      const selectedService = servicesQuery.data?.find((s) => s.id === manualServiceId);
      void triggerN8nWebhook({
        bookingId,
        customerName: manualPatientName,
        customerEmail: manualEmail,
        customerPhone: manualPhone,
        serviceName: selectedService?.name || "Dental Checkup",
        appointmentDate: manualDate,
        startTime: manualStartTime,
        endTime: manualEndTime,
        notes: manualNotes,
      });

      // Clear states
      setIsManualBookingOpen(false);
      setManualPatientName("");
      setManualEmail("");
      setManualPhone("");
      setManualServiceId("");
      setManualDate("");
      setManualStartTime("09:00");
      setManualEndTime("09:30");
      setManualNotes("");

      void queryClient.invalidateQueries({ queryKey: ["all-bookings"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
    },
  });

  const handleOpenBooking = (booking: any) => {
    setSelectedBooking(booking);
    setAppointmentDate(booking.preferred_date || "");
    setNotes(booking.patient_notes || "");
    setSelectedDoctorId("");
    setIsDeclineMode(false);
    setStartTime("09:00");
    const duration = booking.services?.duration_minutes || 30;
    setEndTime(duration === 60 ? "10:00" : "09:30");
  };

  const handleTimeChange = (type: "start" | "end", val: string) => {
    if (type === "start") {
      setStartTime(val);
      const [h, m] = val.split(":").map(Number);
      const duration = selectedBooking?.services?.duration_minutes || 30;
      const endMins = h * 60 + m + duration;
      const endH = Math.floor(endMins / 60) % 24;
      const endM = endMins % 60;
      setEndTime(
        `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`
      );
    } else {
      setEndTime(val);
    }
  };

  const getUrgencyBadge = (level: number) => {
    const configs: Record<number, { bg: string; text: string; label: string }> = {
      5: { bg: "bg-red-500/10 text-red-500 border border-red-500/20", text: "text-red-500", label: "Critical" },
      4: { bg: "bg-orange-500/10 text-orange-500 border border-orange-500/20", text: "text-orange-500", label: "High" },
      3: { bg: "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20", text: "text-yellow-500", label: "Medium" },
      2: { bg: "bg-blue-500/10 text-blue-500 border border-blue-500/20", text: "text-blue-500", label: "Mild" },
      1: { bg: "bg-slate-500/10 text-slate-400 border border-slate-500/20", text: "text-slate-400", label: "Routine" },
    };
    const c = configs[level] || configs[1];
    return (
      <Badge variant="outline" className={`${c.bg} font-medium`}>
        {c.label}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "CONFIRMED":
        return <Badge className="bg-emerald-500/15 text-emerald-500 border border-emerald-500/25">Confirmed</Badge>;
      case "DECLINED":
        return <Badge className="bg-red-500/15 text-red-500 border border-red-500/25">Declined</Badge>;
      case "PENDING_STAFF":
      default:
        return <Badge className="bg-amber-500/15 text-amber-500 border border-amber-500/25 animate-pulse">Pending Review</Badge>;
    }
  };

  const filteredBookings = (bookingsQuery.data || []).filter((b) => {
    const matchesStatus =
      statusFilter === "ALL" ||
      (statusFilter === "PENDING" && b.status === "PENDING_STAFF") ||
      b.status === statusFilter;

    const patientName = b.customers?.display_name?.toLowerCase() || "";
    const instaUser = b.customers?.instagram_username?.toLowerCase() || "";
    const phone = b.customers?.phone?.toLowerCase() || "";
    const email = b.email?.toLowerCase() || "";
    const matchesSearch =
      !searchQuery ||
      patientName.includes(searchQuery.toLowerCase()) ||
      instaUser.includes(searchQuery.toLowerCase()) ||
      phone.includes(searchQuery.toLowerCase()) ||
      email.includes(searchQuery.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  return (
    <AppShell
      title="Bookings"
      description="Review patient requests and finalize schedules"
      actions={
        <Button onClick={() => setIsManualBookingOpen(true)} className="font-semibold">
          <Plus className="mr-2 h-4 w-4" /> Add Manual Booking
        </Button>
      }
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* Search Bar */}
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9 bg-background border-border"
            placeholder="Search patient, phone or Instagram ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap gap-1 bg-secondary/40 border border-border p-1 rounded-lg self-start">
          {[
            { id: "ALL", label: "All Bookings" },
            { id: "PENDING", label: "Pending Review" },
            { id: "CONFIRMED", label: "Confirmed" },
            { id: "DECLINED", label: "Declined" },
          ].map((tab) => (
            <Button
              key={tab.id}
              variant={statusFilter === tab.id ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setStatusFilter(tab.id)}
              className={`text-xs rounded-md ${
                statusFilter === tab.id ? "bg-background shadow-sm border border-border/40 font-semibold" : ""
              }`}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Bookings List/Table */}
      <div className="mt-6">
        {bookingsQuery.isLoading ? (
          <div className="grid gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="surface p-12 text-center">
            <Calendar className="mx-auto h-8 w-8 text-muted-foreground animate-bounce" />
            <h3 className="mt-4 text-sm font-semibold">No bookings found</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Try adjusting your search criteria or status filter.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden lg:block surface overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient Details</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Preferred Date & Time</TableHead>
                    <TableHead>Urgency</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBookings.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-semibold text-sm">{b.customers?.display_name || "Guest User"}</span>
                          <span className="text-xs text-muted-foreground font-mono">@{b.customers?.instagram_username}</span>
                          {b.customers?.phone && <span className="text-xs text-muted-foreground mt-0.5">{b.customers?.phone}</span>}
                          {b.email && <span className="text-xs text-muted-foreground font-mono mt-0.5">{b.email}</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{b.services?.name || "General Checkup"}</span>
                          <span className="text-xs text-muted-foreground">{b.services?.duration_minutes || 30} mins duration</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col text-sm">
                          {b.status === "CONFIRMED" && b.appointments?.[0] ? (
                            <>
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                {new Date(b.appointments[0].appointment_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                              </span>
                              <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                                {b.appointments[0].start_time.slice(0, 5)} - {b.appointments[0].end_time.slice(0, 5)}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="font-medium">{b.preferred_date ? new Date(b.preferred_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : "—"}</span>
                              <span className="text-muted-foreground text-xs">{b.preferred_time_text || "Flexible time"}</span>
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getUrgencyBadge(b.urgency)}</TableCell>
                      <TableCell>{getStatusBadge(b.status)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant={b.status === "PENDING_STAFF" ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleOpenBooking(b)}
                        >
                          {b.status === "PENDING_STAFF" ? "Process Request" : "View Info"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Card Grid View */}
            <div className="grid gap-4 sm:grid-cols-2 lg:hidden">
              {filteredBookings.map((b) => (
                <div key={b.id} className="surface p-4 flex flex-col justify-between gap-4 border border-border bg-card shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between">
                      <div className="flex flex-col">
                        <span className="font-semibold text-sm">{b.customers?.display_name || "Guest User"}</span>
                        <span className="text-xs text-muted-foreground font-mono">@{b.customers?.instagram_username}</span>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {getStatusBadge(b.status)}
                        {getUrgencyBadge(b.urgency)}
                      </div>
                    </div>

                    <div className="border-t border-border/60 my-1" />

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Service</p>
                        <p className="font-medium mt-0.5">{b.services?.name || "General Checkup"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Request Time</p>
                        <p className="font-medium mt-0.5">
                          {b.status === "CONFIRMED" && b.appointments?.[0] ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                              {new Date(b.appointments[0].appointment_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {b.appointments[0].start_time.slice(0, 5)}
                            </span>
                          ) : (
                            <span>
                              {b.preferred_date ? new Date(b.preferred_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : "—"} · {b.preferred_time_text || "Flexible"}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    {b.ai_summary && (
                      <div className="mt-2 rounded-lg bg-primary/5 border border-primary/10 p-2.5">
                        <p className="text-[11px] font-semibold text-primary flex items-center gap-1">
                          <Sparkles className="h-3 w-3" /> AI Summary
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                          {b.ai_summary}
                        </p>
                      </div>
                    )}
                  </div>

                  <Button
                    className="w-full text-xs font-semibold"
                    variant={b.status === "PENDING_STAFF" ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleOpenBooking(b)}
                  >
                    {b.status === "PENDING_STAFF" ? "Process Request" : "View Info"}
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Process/Info Dialog */}
      <Dialog open={Boolean(selectedBooking)} onOpenChange={(o) => !o && setSelectedBooking(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedBooking?.status === "PENDING_STAFF" ? "Process Booking Request" : "Booking Request Details"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Requested by {selectedBooking?.customers?.display_name || "Guest User"} (@{selectedBooking?.customers?.instagram_username})
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Urgency and AI Summary details */}
            <div className="grid gap-2 border border-border rounded-lg p-3 bg-secondary/20">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Urgency Level:</span>
                {selectedBooking && getUrgencyBadge(selectedBooking.urgency)}
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Service Name:</span>
                <span className="font-semibold">{selectedBooking?.services?.name || "General Checkup"}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Requested Date & Time:</span>
                <span className="font-semibold text-right">
                  {selectedBooking?.preferred_date ? new Date(selectedBooking.preferred_date).toLocaleDateString() : "—"} · {selectedBooking?.preferred_time_text || "Flexible"}
                </span>
              </div>
            </div>

            {selectedBooking?.ai_summary && (
              <div className="rounded-lg bg-primary/5 border border-primary/10 p-3 text-xs">
                <span className="font-semibold text-primary flex items-center gap-1.5 mb-1">
                  <Sparkles className="h-4 w-4" /> AI Receptionist Summary
                </span>
                <p className="text-muted-foreground leading-relaxed">{selectedBooking.ai_summary}</p>
              </div>
            )}

            {selectedBooking?.patient_notes && (
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Patient Notes / Health History</Label>
                <div className="rounded-md border border-border p-2 bg-background text-xs text-foreground">
                  {selectedBooking.patient_notes}
                </div>
              </div>
            )}

            {selectedBooking?.status === "PENDING_STAFF" && (
              <div className="border-t border-border pt-4 grid gap-3">
                <div className="flex items-center gap-2 mb-1">
                  <input
                    type="checkbox"
                    id="decline-mode"
                    className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                    checked={isDeclineMode}
                    onChange={(e) => setIsDeclineMode(e.target.checked)}
                  />
                  <Label htmlFor="decline-mode" className="text-xs font-semibold text-destructive cursor-pointer">
                    Decline this booking request instead
                  </Label>
                </div>

                {!isDeclineMode && (
                  <div className="grid gap-3">
                    {/* Doctor assignment omitted as requested */}

                    <div className="grid gap-1.5">
                      <Label htmlFor="app-date" className="text-xs">Confirmed Date</Label>
                      <Input
                        id="app-date"
                        type="date"
                        className="h-9 bg-background border-border"
                        value={appointmentDate}
                        onChange={(e) => setAppointmentDate(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="grid gap-1.5">
                        <Label htmlFor="app-start" className="text-xs">Start Time</Label>
                        <Input
                          id="app-start"
                          type="time"
                          className="h-9 bg-background border-border"
                          value={startTime}
                          onChange={(e) => handleTimeChange("start", e.target.value)}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="app-end" className="text-xs">End Time</Label>
                        <Input
                          id="app-end"
                          type="time"
                          className="h-9 bg-background border-border"
                          value={endTime}
                          onChange={(e) => handleTimeChange("end", e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid gap-1.5">
                      <Label htmlFor="app-notes" className="text-xs">Staff Notes (Optional)</Label>
                      <Textarea
                        id="app-notes"
                        rows={2}
                        className="bg-background border-border text-xs"
                        placeholder="Add scheduling or patient notes..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="mt-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedBooking(null)}>
              {selectedBooking?.status === "PENDING_STAFF" ? "Cancel" : "Close"}
            </Button>

            {selectedBooking?.status === "PENDING_STAFF" && (
              <>
                {isDeclineMode ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => declineMutation.mutate(selectedBooking.id)}
                    disabled={declineMutation.isPending}
                  >
                    {declineMutation.isPending ? "Declining..." : "Confirm Decline"}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() =>
                      confirmMutation.mutate({
                        bookingId: selectedBooking.id,
                        date: appointmentDate,
                        start: startTime,
                        end: endTime,
                        notesText: notes,
                      })
                    }
                    disabled={!appointmentDate || confirmMutation.isPending}
                  >
                    {confirmMutation.isPending ? "Confirming..." : "Approve & Schedule"}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Booking Creation Dialog */}
      <Dialog open={isManualBookingOpen} onOpenChange={setIsManualBookingOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Manual Booking</DialogTitle>
            <DialogDescription className="text-xs">
              Enter phone or offline customer booking details directly.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              addManualBookingMutation.mutate();
            }}
            className="space-y-4 py-2"
          >
            <div className="grid gap-1.5">
              <Label htmlFor="mb-name" className="text-xs">Patient Name *</Label>
              <Input
                id="mb-name"
                required
                placeholder="John Doe"
                value={manualPatientName}
                onChange={(e) => setManualPatientName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="mb-phone" className="text-xs">Phone Number</Label>
                <Input
                  id="mb-phone"
                  placeholder="+91 9876543210"
                  value={manualPhone}
                  onChange={(e) => setManualPhone(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="mb-email" className="text-xs">Email (Optional)</Label>
                <Input
                  id="mb-email"
                  type="email"
                  placeholder="patient@example.com"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">Selected Service</Label>
              <Select value={manualServiceId} onValueChange={setManualServiceId}>
                <SelectTrigger className="w-full h-9 bg-background border-border">
                  <SelectValue placeholder="Select service..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {servicesQuery.data?.map((srv: any) => (
                    <SelectItem key={srv.id} value={srv.id}>
                      {srv.name} ({srv.duration_minutes} min)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="mb-date" className="text-xs">Appointment Date *</Label>
              <Input
                id="mb-date"
                type="date"
                required
                className="h-9 bg-background border-border"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="mb-start" className="text-xs">Start Time</Label>
                <Input
                  id="mb-start"
                  type="time"
                  className="h-9 bg-background border-border"
                  value={manualStartTime}
                  onChange={(e) => setManualStartTime(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="mb-end" className="text-xs">End Time</Label>
                <Input
                  id="mb-end"
                  type="time"
                  className="h-9 bg-background border-border"
                  value={manualEndTime}
                  onChange={(e) => setManualEndTime(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="mb-notes" className="text-xs">Notes / Details (Optional)</Label>
              <Textarea
                id="mb-notes"
                rows={2}
                placeholder="Details of the booking call..."
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
              />
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="ghost" size="sm" onClick={() => setIsManualBookingOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={addManualBookingMutation.isPending}>
                {addManualBookingMutation.isPending ? "Creating..." : "Confirm & Trigger Email"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

