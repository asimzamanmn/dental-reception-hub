import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  CalendarCheck,
  Search,
  Sparkles,
  Calendar as CalendarIcon,
  Plus,
  CalendarDays,
  Phone,
  MessageCircle,
  CheckCircle2,
  CalendarClock,
  Trash2,
  AlertTriangle,
  XCircle,
  Instagram,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatIndianPhone, getTelLink, getWhatsAppLink } from "@/lib/utils";
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

export const Route = createFileRoute("/bookings")({
  head: () => ({
    meta: [
      { title: "Bookings — Dental AI Receptionist Console" },
      {
        name: "description",
        content: "Search, filter and process patient booking requests and appointments.",
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
  const [appointmentDate, setAppointmentDate] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("09:00");
  const [endTime, setEndTime] = useState<string>("09:30");
  const [notes, setNotes] = useState<string>("");
  const [isDeclineMode, setIsDeclineMode] = useState<boolean>(false);
  const [isDeleteMode, setIsDeleteMode] = useState<boolean>(false);
  const [isRescheduleMode, setIsRescheduleMode] = useState<boolean>(false);

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

  // Instagram Message States
  const [isIgMessageOpen, setIsIgMessageOpen] = useState(false);
  const [igMessageText, setIgMessageText] = useState("");
  const [igMessageCustomer, setIgMessageCustomer] = useState<any>(null);

  // Queries
  const bookingsQuery = useQuery({
    queryKey: ["all-bookings"],
    queryFn: async () => {
      const [publicRes, webchatBookings] = await Promise.all([
        supabase
          .from("booking_requests")
          .select(
            "id, status, preferred_date, preferred_time_text, urgency, ai_summary, patient_notes, created_at, service_id, email, customers(display_name, instagram_username, instagram_user_id, phone), services(name, duration_minutes), appointments(id, appointment_date, start_time, end_time, notes)"
          )
          .order("created_at", { ascending: false }),
        fetchWebchatBookings(),
      ]);

      if (publicRes.error) throw publicRes.error;

      const publicList = (publicRes.data || []).map((b: any) => ({
        ...b,
        source: "instagram" as const,
      }));

      // Combine both streams and sort chronologically descending
      const combined = [...publicList, ...webchatBookings];
      combined.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      return combined;
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

  const sendIgMessageMutation = useMutation({
    mutationFn: async () => {
      const url = localStorage.getItem("n8n_instagram_webhook_url") || "https://n8n.srv1893940.hstgr.cloud/webhook/ig-send";
      if (!igMessageText.trim()) throw new Error("Message cannot be empty.");
      if (!igMessageCustomer?.instagram_user_id) throw new Error("This customer does not have an Instagram ID associated.");

      const payload = {
        instagram_user_id: igMessageCustomer.instagram_user_id,
        message_text: igMessageText,
      };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Webhook failed with status " + res.status);
    },
    onSuccess: () => {
      toast.success("Message sent successfully!");
      setIsIgMessageOpen(false);
      setIgMessageText("");
      setIgMessageCustomer(null);
    },
    onError: (e: Error) => {
      toast.error(e.message);
    }
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
      const booking = bookingsQuery.data?.find((b) => b.id === bookingId);
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
            reviewed_by: role === "admin" ? "Admin" : "Staff",
          })
          .eq("id", bookingId);
        if (updateError) throw updateError;
      }

      // Sync appointment schedule
      const { data: existingAppt } = await supabase
        .from("appointments")
        .select("id")
        .eq("booking_request_id", bookingId)
        .maybeSingle();

      if (existingAppt) {
        const { error: updErr } = await supabase
          .from("appointments")
          .update({
            appointment_date: date,
            start_time: start.length === 5 ? start + ":00" : start,
            end_time: end.length === 5 ? end + ":00" : end,
            status: "SCHEDULED",
            notes: notesText || null,
          })
          .eq("id", existingAppt.id);
        if (updErr) throw updErr;
      } else {
        const { error: insertError } = await supabase.from("appointments").insert({
          booking_request_id: bookingId,
          doctor_id: null,
          appointment_date: date,
          start_time: start.length === 5 ? start + ":00" : start,
          end_time: end.length === 5 ? end + ":00" : end,
          status: "SCHEDULED",
          notes: notesText || null,
        });
        if (insertError) {
          console.warn("Could not insert linked appointment:", insertError.message);
        }
      }
    },
    onSuccess: (_, variables) => {
      toast.success("Appointment schedule updated successfully!");

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
      setIsRescheduleMode(false);
      void queryClient.invalidateQueries({ queryKey: ["all-bookings"] });
    },
    onError: (err: any) => {
      toast.error("Failed to update appointment: " + err.message);
    },
  });

  const declineMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const booking = bookingsQuery.data?.find((b) => b.id === bookingId);
      if (booking?.source === "webchat") {
        await updateWebchatBookingStatus(bookingId, "DECLINED");
      } else {
        const { error } = await supabase
          .from("booking_requests")
          .update({
            status: "DECLINED",
            reviewed_at: new Date().toISOString(),
            reviewed_by: role === "admin" ? "Admin" : "Staff",
          })
          .eq("id", bookingId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Booking request declined.");
      setSelectedBooking(null);
      setIsRescheduleMode(false);
      void queryClient.invalidateQueries({ queryKey: ["all-bookings"] });
    },
    onError: (err: any) => {
      toast.error("Failed to decline booking: " + err.message);
    },
  });

  const deleteBookingMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const booking = bookingsQuery.data?.find((b) => b.id === bookingId);
      if (booking?.source === "webchat") {
        await deleteWebchatBooking(bookingId);
      } else {
        // 1. Delete associated appointment if any
        const { error: apptErr } = await supabase
          .from("appointments")
          .delete()
          .eq("booking_request_id", bookingId);
        if (apptErr) console.warn("Failed deleting linked appointment:", apptErr);

        // 2. Delete booking request itself
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
      setIsRescheduleMode(false);
      setIsDeclineMode(false);
      setIsDeleteMode(false);
      void queryClient.invalidateQueries({ queryKey: ["all-bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-pending-bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["calendar-appointments"] });
      void queryClient.invalidateQueries({ queryKey: ["calendar-requests"] });
    },
    onError: (err: any) => {
      toast.error("Failed to delete booking request: " + err.message);
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
      toast.success("Manual booking created & scheduled!");

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
    const existingAppt = booking.appointments?.[0];
    setAppointmentDate(existingAppt?.appointment_date || booking.preferred_date || "");
    setNotes(existingAppt?.notes || booking.patient_notes || "");
    setIsDeclineMode(false);
    setIsDeleteMode(false);
    setIsRescheduleMode(false);

    if (existingAppt?.start_time) {
      setStartTime(existingAppt.start_time.slice(0, 5));
      setEndTime(existingAppt.end_time ? existingAppt.end_time.slice(0, 5) : "09:30");
    } else {
      setStartTime("09:00");
      const duration = booking.services?.duration_minutes || 30;
      setEndTime(duration === 60 ? "10:00" : "09:30");
    }
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
    const configs: Record<number, { bg: string; label: string }> = {
      5: { bg: "bg-red-500/10 text-red-500 border border-red-500/20", label: "Critical" },
      4: { bg: "bg-orange-500/10 text-orange-500 border border-orange-500/20", label: "High" },
      3: { bg: "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20", label: "Medium" },
      2: { bg: "bg-blue-500/10 text-blue-500 border border-blue-500/20", label: "Mild" },
      1: { bg: "bg-slate-500/10 text-slate-400 border border-slate-500/20", label: "Routine" },
    };
    const c = configs[level] || configs[1];
    return (
      <Badge variant="outline" className={`${c.bg} font-medium text-[11px]`}>
        {c.label}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "CONFIRMED":
        return <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 text-[11px]">Confirmed</Badge>;
      case "DECLINED":
        return <Badge className="bg-red-500/15 text-red-500 border border-red-500/25 text-[11px]">Declined</Badge>;
      case "PENDING_STAFF":
      default:
        return <Badge className="bg-amber-500/15 text-amber-500 border border-amber-500/25 animate-pulse text-[11px]">Pending Review</Badge>;
    }
  };

  const filteredBookings = useMemo(() => {
    return (bookingsQuery.data || []).filter((b) => {
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "PENDING" && b.status === "PENDING_STAFF") ||
        b.status === statusFilter;

      const patientName = b.customers?.display_name?.toLowerCase() || "";
      const instaUser = b.customers?.instagram_username?.toLowerCase() || "";
      const phone = b.customers?.phone?.toLowerCase() || "";
      const email = b.email?.toLowerCase() || "";
      const isWebchat = b.source === "webchat";
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        patientName.includes(q) ||
        instaUser.includes(q) ||
        phone.includes(q) ||
        email.includes(q) ||
        (isWebchat && "webchat".includes(q)) ||
        (!isWebchat && "instagram".includes(q));

      return matchesStatus && matchesSearch;
    });
  }, [bookingsQuery.data, statusFilter, searchQuery]);

  return (
    <AppShell
      title="Bookings"
      description="Review patient requests, process pending approvals, and schedule appointments"
      actions={
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="text-xs font-semibold">
            <Link to="/calendar">
              <CalendarDays className="h-3.5 w-3.5 mr-1.5 text-primary" /> Booking Calendar
            </Link>
          </Button>
          <Button
            onClick={() => setIsManualBookingOpen(true)}
            className="font-semibold px-2.5 sm:px-4 text-xs"
          >
            <Plus className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Add Manual Booking</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
      }
    >
      {/* Top Filter and Search Toolbar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* Search Bar */}
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9 bg-background border-border text-xs"
            placeholder="Search patient, phone or Instagram ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex overflow-x-auto max-w-full scrollbar-none gap-1 bg-secondary/40 border border-border p-1 rounded-lg self-start w-full sm:w-auto">
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
              className={`text-xs rounded-md whitespace-nowrap flex-1 sm:flex-none px-3 ${
                statusFilter === tab.id ? "bg-background shadow-xs border border-border/40 font-semibold text-foreground" : ""
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
            <CalendarIcon className="mx-auto h-8 w-8 text-muted-foreground animate-bounce" />
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
                    <TableHead>Scheduled / Preferred Time</TableHead>
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
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-sm">{b.customers?.display_name || "Guest User"}</span>
                            {b.source === "webchat" ? (
                              <Badge variant="outline" className="bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25 text-[10px] px-1.5 py-0 font-semibold">
                                Webchat
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/25 text-[10px] px-1.5 py-0 font-medium">
                                Instagram
                              </Badge>
                            )}
                          </div>
                          {b.source === "webchat" && b.session_id && (
                            <span className="text-xs text-muted-foreground font-mono">Session #{b.session_id.slice(0, 8)}</span>
                          )}
                          {b.customers?.phone && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-xs text-muted-foreground font-mono">
                                {formatIndianPhone(b.customers.phone)}
                              </span>
                              <a
                                href={getTelLink(b.customers.phone)}
                                title="Call Patient"
                                className="text-blue-500 hover:text-blue-600 ml-1"
                              >
                                <Phone className="h-3 w-3" />
                              </a>
                              <a
                                href={getWhatsAppLink(
                                  b.customers.phone,
                                  `Hello ${b.customers?.display_name || ""}, regarding your dental booking...`
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="WhatsApp Patient"
                                className="text-emerald-500 hover:text-emerald-600"
                              >
                                <MessageCircle className="h-3 w-3" />
                              </a>
                            </div>
                          )}
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
                                {new Date(b.appointments[0].appointment_date).toLocaleDateString(undefined, {
                                  weekday: "short",
                                  month: "short",
                                  day: "numeric",
                                })}
                              </span>
                              <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                                {b.appointments[0].start_time.slice(0, 5)} - {b.appointments[0].end_time.slice(0, 5)}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="font-medium">
                                {b.preferred_date
                                  ? new Date(b.preferred_date).toLocaleDateString(undefined, {
                                      weekday: "short",
                                      month: "short",
                                      day: "numeric",
                                    })
                                  : "—"}
                              </span>
                              <span className="text-muted-foreground text-xs">{b.preferred_time_text || "Flexible time"}</span>
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getUrgencyBadge(b.urgency)}</TableCell>
                      <TableCell>{getStatusBadge(b.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant={b.status === "PENDING_STAFF" ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleOpenBooking(b)}
                          >
                            {b.status === "PENDING_STAFF" ? "Process Request" : "Manage / Details"}
                          </Button>
                          {b.status === "PENDING_STAFF" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              title="Delete pending booking request"
                              onClick={() => {
                                handleOpenBooking(b);
                                setIsDeleteMode(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Card Grid View */}
            <div className="grid gap-4 sm:grid-cols-2 lg:hidden">
              {filteredBookings.map((b) => (
                <div
                  key={b.id}
                  className="surface p-4 flex flex-col justify-between gap-4 border border-border bg-card shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-sm">{b.customers?.display_name || "Guest User"}</span>
                          {b.source === "webchat" ? (
                            <Badge variant="outline" className="bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25 text-[10px] px-1.5 py-0 font-semibold">
                              Webchat
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/25 text-[10px] px-1.5 py-0 font-medium">
                              Instagram
                            </Badge>
                          )}
                        </div>
                        {b.source === "webchat" && b.session_id && (
                          <span className="text-xs text-muted-foreground font-mono mt-0.5">Session #{b.session_id.slice(0, 8)}</span>
                        )}
                      </div>
                      <div className="flex items-col items-end gap-1">
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
                              {new Date(b.appointments[0].appointment_date).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })}{" "}
                              · {b.appointments[0].start_time.slice(0, 5)}
                            </span>
                          ) : (
                            <span>
                              {b.preferred_date
                                ? new Date(b.preferred_date).toLocaleDateString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                  })
                                : "—"}{" "}
                              · {b.preferred_time_text || "Flexible"}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    {b.customers?.phone && (
                      <div className="flex items-center justify-between mt-1 text-xs border-t border-border/40 pt-2">
                        <span className="font-mono text-muted-foreground">
                          {formatIndianPhone(b.customers.phone)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="h-6 text-[11px] px-2 text-blue-600 hover:bg-blue-500/10 border-blue-500/30"
                          >
                            <a href={getTelLink(b.customers.phone)}>
                              <Phone className="h-2.5 w-2.5 mr-1" /> Call
                            </a>
                          </Button>
                          <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="h-6 text-[11px] px-2 text-emerald-600 hover:bg-emerald-500/10 border-emerald-500/30"
                          >
                            <a
                              href={getWhatsAppLink(
                                b.customers.phone,
                                `Hello ${b.customers?.display_name || ""}, regarding your dental booking...`
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <MessageCircle className="h-2.5 w-2.5 mr-1" /> WhatsApp
                            </a>
                          </Button>
                        </div>
                      </div>
                    )}

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

                  <div className="flex items-center gap-2">
                    <Button
                      className="w-full text-xs font-semibold"
                      variant={b.status === "PENDING_STAFF" ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleOpenBooking(b)}
                    >
                      {b.status === "PENDING_STAFF" ? "Process Request" : "Manage / Details"}
                    </Button>
                    {b.status === "PENDING_STAFF" && (
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 border-border"
                        title="Delete pending booking request"
                        onClick={() => {
                          handleOpenBooking(b);
                          setIsDeleteMode(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Process / Details / Reschedule Dialog */}
      <Dialog
        open={Boolean(selectedBooking)}
        onOpenChange={(o) => {
          if (!o) {
            setSelectedBooking(null);
            setIsRescheduleMode(false);
            setIsDeclineMode(false);
            setIsDeleteMode(false);
          }
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedBooking?.status === "PENDING_STAFF"
                ? "Process Booking Request"
                : isRescheduleMode
                ? "Reschedule Appointment"
                : "Booking Request Details"}
            </DialogTitle>
            <DialogDescription className="text-xs flex items-center gap-1.5 flex-wrap">
              <span>Patient: {selectedBooking?.customers?.display_name || "Guest User"}</span>
              {selectedBooking?.source === "webchat" ? (
                <Badge variant="outline" className="bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25 text-[10px] px-1.5 py-0 font-semibold">
                  Webchat
                </Badge>
              ) : selectedBooking?.customers?.instagram_username ? (
                <span className="font-mono">(@{selectedBooking.customers.instagram_username})</span>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Urgency and AI Summary details */}
            <div className="grid gap-2 border border-border rounded-lg p-3 bg-secondary/20">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Source Channel:</span>
                {selectedBooking?.source === "webchat" ? (
                  <Badge variant="outline" className="bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25 text-[10px] px-1.5 py-0 font-semibold">
                    Webchat
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/25 text-[10px] px-1.5 py-0 font-medium">
                    Instagram
                  </Badge>
                )}
              </div>
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

            {/* Confirmed Appointment Banner if already scheduled */}
            {selectedBooking?.status === "CONFIRMED" && selectedBooking?.appointments?.[0] && (
              <div className="flex items-center justify-between text-xs bg-emerald-500/10 border border-emerald-500/25 rounded-md p-2.5">
                <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Scheduled:</span>
                </div>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">
                  {new Date(selectedBooking.appointments[0].appointment_date).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}{" "}
                  · {selectedBooking.appointments[0].start_time.slice(0, 5)} - {selectedBooking.appointments[0].end_time.slice(0, 5)}
                </span>
              </div>
            )}

            {(selectedBooking?.customers?.phone || selectedBooking?.customers?.instagram_user_id) && (
              <div className="grid gap-2">
                {selectedBooking?.customers?.phone && (
                  <div className="flex items-center justify-between text-xs border border-border rounded-md p-2.5 bg-background">
                    <span className="text-muted-foreground font-medium">Contact Phone:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold">{formatIndianPhone(selectedBooking.customers.phone)}</span>
                      <a
                        href={getTelLink(selectedBooking.customers.phone)}
                        title="Call"
                        className="text-blue-500 hover:text-blue-600"
                      >
                        <Phone className="h-3.5 w-3.5" />
                      </a>
                      <a
                        href={getWhatsAppLink(
                          selectedBooking.customers.phone,
                          `Hello ${selectedBooking.customers?.display_name || ""}, regarding your dental booking...`
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="WhatsApp"
                        className="text-emerald-500 hover:text-emerald-600"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                )}
                
                {selectedBooking?.customers?.instagram_user_id && (
                  <div className="flex items-center justify-between text-xs border border-border rounded-md p-2.5 bg-background">
                    <span className="text-muted-foreground font-medium">Instagram Contact:</span>
                    <button
                      onClick={() => {
                        setIgMessageCustomer(selectedBooking.customers);
                        setIsIgMessageOpen(true);
                      }}
                      title="Send Message on Instagram"
                      className="flex items-center gap-1.5 text-pink-500 hover:text-pink-600 font-semibold"
                    >
                      <Instagram className="h-3.5 w-3.5" />
                      <span>Send Message</span>
                    </button>
                  </div>
                )}
              </div>
            )}

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

            {/* If Confirmed, give option to Reschedule */}
            {selectedBooking?.status === "CONFIRMED" && !isRescheduleMode && (
              <div className="border-t border-border pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full text-xs font-semibold"
                  onClick={() => setIsRescheduleMode(true)}
                >
                  <CalendarClock className="h-3.5 w-3.5 mr-1.5 text-primary" /> Reschedule / Edit Appointment
                </Button>
              </div>
            )}

            {/* Reschedule Form or Process Pending Form */}
            {(selectedBooking?.status === "PENDING_STAFF" || isRescheduleMode) && (
              <div className="border-t border-border pt-4 grid gap-3">
                {selectedBooking?.status === "PENDING_STAFF" && (
                  <div className="space-y-2 mb-1">
                    {/* Switch to Delete Pending Booking Request */}
                    <div className="flex items-center justify-between rounded-lg border border-destructive/25 bg-destructive/5 p-2.5 transition-colors">
                      <div className="flex items-center gap-2">
                        <Trash2 className="h-4 w-4 text-destructive shrink-0" />
                        <div>
                          <Label htmlFor="delete-mode-switch" className="text-xs font-semibold text-destructive cursor-pointer">
                            Delete pending booking request
                          </Label>
                          <p className="text-[11px] text-muted-foreground">
                            Permanently erase this request from the database
                          </p>
                        </div>
                      </div>
                      <Switch
                        id="delete-mode-switch"
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
                            <Label htmlFor="decline-mode-switch" className="text-xs font-semibold text-foreground cursor-pointer">
                              Decline booking request
                            </Label>
                            <p className="text-[11px] text-muted-foreground">
                              Mark request as declined without deleting it
                            </p>
                          </div>
                        </div>
                        <Switch
                          id="decline-mode-switch"
                          checked={isDeclineMode}
                          onCheckedChange={(checked) => {
                            setIsDeclineMode(checked);
                            if (checked) setIsDeleteMode(false);
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {isDeleteMode ? (
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
                ) : isDeclineMode ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-1.5 text-amber-700 dark:text-amber-400 animate-in fade-in duration-200">
                    <div className="flex items-center gap-2 font-semibold text-xs">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>Decline Booking Request</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      This will change the request status to DECLINED. The customer record will be preserved.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="app-date" className="text-xs">
                        {isRescheduleMode ? "New Appointment Date" : "Confirmed Date"}
                      </Label>
                      <Input
                        id="app-date"
                        type="date"
                        className="h-9 bg-background border-border text-xs"
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
                          className="h-9 bg-background border-border text-xs"
                          value={startTime}
                          onChange={(e) => handleTimeChange("start", e.target.value)}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="app-end" className="text-xs">End Time</Label>
                        <Input
                          id="app-end"
                          type="time"
                          className="h-9 bg-background border-border text-xs"
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedBooking(null);
                setIsRescheduleMode(false);
                setIsDeclineMode(false);
                setIsDeleteMode(false);
              }}
            >
              {selectedBooking?.status === "PENDING_STAFF" || isRescheduleMode ? "Cancel" : "Close"}
            </Button>

            {selectedBooking?.status === "PENDING_STAFF" && (
              <>
                {isDeleteMode ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="font-semibold shadow-xs"
                    onClick={() => deleteBookingMutation.mutate(selectedBooking.id)}
                    disabled={deleteBookingMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    {deleteBookingMutation.isPending ? "Deleting..." : "Permanently Delete Request"}
                  </Button>
                ) : isDeclineMode ? (
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

            {selectedBooking?.status === "CONFIRMED" && isRescheduleMode && (
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
                {confirmMutation.isPending ? "Updating..." : "Save Rescheduled Time"}
              </Button>
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
              Enter phone or offline customer booking details directly into clinic schedule.
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="mb-phone" className="text-xs">Phone Number</Label>
                <Input
                  id="mb-phone"
                  placeholder="+91 98765 43210"
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

      {/* Instagram Message Dialog */}
      <Dialog open={isIgMessageOpen} onOpenChange={setIsIgMessageOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Send Instagram Message</DialogTitle>
            <DialogDescription className="text-xs">
              Sending a message to {igMessageCustomer?.display_name || igMessageCustomer?.instagram_username}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-1.5">
              <Label htmlFor="ig-message">Message</Label>
              <Textarea
                id="ig-message"
                placeholder="Type your message here..."
                rows={4}
                value={igMessageText}
                onChange={(e) => setIgMessageText(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setIsIgMessageOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => sendIgMessageMutation.mutate()}
              disabled={sendIgMessageMutation.isPending || !igMessageText.trim()}
            >
              {sendIgMessageMutation.isPending ? "Sending..." : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
