import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  CalendarCheck,
  Clock,
  Search,
  AlertTriangle,
  Sparkles,
  Calendar as CalendarIcon,
  Plus,
  CalendarDays,
  Phone,
  MessageCircle,
  CheckCircle2,
  CalendarClock,
  ListFilter,
  Trash2,
  XCircle,
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
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
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
import { useAuth } from "@/hooks/use-auth";
import { formatIndianPhone, getTelLink, getWhatsAppLink } from "@/lib/utils";
import {
  fetchWebchatBookings,
  updateWebchatBookingStatus,
  deleteWebchatBooking,
} from "@/lib/webchat";

function toDateKey(val: Date | string | null | undefined): string {
  if (!val) return "";
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof val === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
      return val.slice(0, 10);
    }
    const d = new Date(val);
    if (isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return "";
}

function parseLocalDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

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

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Booking Calendar — Dental AI Receptionist Console" },
      {
        name: "description",
        content: "Track processed appointments, view clinic schedules by day and month on an interactive calendar.",
      },
    ],
  }),
  component: CalendarPage,
});

function CalendarPage() {
  const { role } = useAuth();
  const queryClient = useQueryClient();

  // Calendar selection state
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isRescheduleMode, setIsRescheduleMode] = useState<boolean>(false);

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
      const [publicRes, webchatBookings] = await Promise.all([
        supabase
          .from("booking_requests")
          .select(
            "id, status, preferred_date, preferred_time_text, urgency, ai_summary, patient_notes, created_at, service_id, email, customers(display_name, instagram_username, phone), services(name, duration_minutes), appointments(id, appointment_date, start_time, end_time, notes)"
          )
          .order("created_at", { ascending: false }),
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

      // Check if appointment already exists (rescheduling)
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

  // Filtered bookings according to search & status
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
      const matchesSearch =
        !searchQuery ||
        patientName.includes(searchQuery.toLowerCase()) ||
        instaUser.includes(searchQuery.toLowerCase()) ||
        phone.includes(searchQuery.toLowerCase()) ||
        email.includes(searchQuery.toLowerCase());

      return matchesStatus && matchesSearch;
    });
  }, [bookingsQuery.data, statusFilter, searchQuery]);

  const selectedDateKey = useMemo(() => toDateKey(selectedDate), [selectedDate]);
  const todayKey = useMemo(() => toDateKey(new Date()), []);

  // Bookings that match the selected date on the calendar
  const selectedDayBookings = useMemo(() => {
    if (!selectedDateKey) return [];
    return filteredBookings.filter((b) => {
      if (b.status === "CONFIRMED") {
        const dateStr = b.appointments?.[0]?.appointment_date || b.preferred_date;
        return toDateKey(dateStr) === selectedDateKey;
      }
      if (b.status === "PENDING_STAFF" && b.preferred_date) {
        return toDateKey(b.preferred_date) === selectedDateKey;
      }
      if (b.status === "DECLINED" && b.preferred_date) {
        return toDateKey(b.preferred_date) === selectedDateKey;
      }
      return false;
    }).sort((a, b) => {
      const timeA = a.appointments?.[0]?.start_time || a.preferred_time_text || "99:99";
      const timeB = b.appointments?.[0]?.start_time || b.preferred_time_text || "99:99";
      return timeA.localeCompare(timeB);
    });
  }, [filteredBookings, selectedDateKey]);

  // Dates with confirmed and pending bookings for calendar modifiers
  const confirmedDates = useMemo(() => {
    const set = new Set<string>();
    (bookingsQuery.data || []).forEach((b) => {
      if (b.status === "CONFIRMED") {
        const dateStr = b.appointments?.[0]?.appointment_date || b.preferred_date;
        const key = toDateKey(dateStr);
        if (key) set.add(key);
      }
    });
    return Array.from(set).map(parseLocalDate);
  }, [bookingsQuery.data]);

  const pendingDates = useMemo(() => {
    const set = new Set<string>();
    (bookingsQuery.data || []).forEach((b) => {
      if (b.status === "PENDING_STAFF" && b.preferred_date) {
        const key = toDateKey(b.preferred_date);
        if (key) set.add(key);
      }
    });
    return Array.from(set).map(parseLocalDate);
  }, [bookingsQuery.data]);

  // Operational metrics
  const stats = useMemo(() => {
    const all = bookingsQuery.data || [];
    let todayCount = 0;
    let upcomingCount = 0;
    let thisMonthCount = 0;
    let pendingCount = 0;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    all.forEach((b) => {
      if (b.status === "PENDING_STAFF") {
        pendingCount++;
      }
      if (b.status === "CONFIRMED") {
        const dateStr = b.appointments?.[0]?.appointment_date || b.preferred_date;
        const key = toDateKey(dateStr);
        if (key) {
          if (key === todayKey) {
            todayCount++;
          }
          if (key >= todayKey) {
            upcomingCount++;
          }
          const [y, m] = key.split("-").map(Number);
          if (y === currentYear && m === currentMonth + 1) {
            thisMonthCount++;
          }
        }
      }
    });

    return { todayCount, upcomingCount, thisMonthCount, pendingCount };
  }, [bookingsQuery.data, todayKey]);

  const confirmedOnDay = useMemo(() => {
    return selectedDayBookings.filter((b) => b.status === "CONFIRMED");
  }, [selectedDayBookings]);

  const pendingOnDay = useMemo(() => {
    return selectedDayBookings.filter((b) => b.status === "PENDING_STAFF");
  }, [selectedDayBookings]);

  return (
    <AppShell
      title="Booking Calendar"
      description="Track processed appointments, view schedules by day/month, and manage clinic bookings"
      actions={
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex text-xs font-semibold">
            <Link to="/bookings">
              <ListFilter className="h-3.5 w-3.5 mr-1.5" /> Bookings List
            </Link>
          </Button>
          <Button
            onClick={() => {
              setManualDate(selectedDateKey || todayKey);
              setIsManualBookingOpen(true);
            }}
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

        {/* Filter Tabs & Link to Bookings List */}
        <div className="flex items-center gap-2">
          <div className="flex overflow-x-auto max-w-full scrollbar-none gap-1 bg-secondary/40 border border-border p-1 rounded-lg">
            {[
              { id: "ALL", label: "All" },
              { id: "CONFIRMED", label: "Confirmed" },
              { id: "PENDING", label: "Pending" },
            ].map((tab) => (
              <Button
                key={tab.id}
                variant={statusFilter === tab.id ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setStatusFilter(tab.id)}
                className={`h-8 text-xs rounded-md whitespace-nowrap px-3 ${
                  statusFilter === tab.id ? "bg-background shadow-xs border border-border/40 font-semibold text-foreground" : ""
                }`}
              >
                {tab.label}
              </Button>
            ))}
          </div>

          <Button asChild variant="ghost" size="sm" className="sm:hidden h-8 text-xs px-2">
            <Link to="/bookings">
              <ListFilter className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Quick Metrics Bar */}
      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="surface p-4 border border-border rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Today's Schedule</p>
            <p className="text-2xl font-bold text-foreground mt-0.5">{stats.todayCount}</p>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5 font-medium">
              Confirmed appointments
            </p>
          </div>
          <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <CalendarCheck className="h-5 w-5" />
          </div>
        </div>

        <div className="surface p-4 border border-border rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Upcoming (From Today)</p>
            <p className="text-2xl font-bold text-foreground mt-0.5">{stats.upcomingCount}</p>
            <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-0.5 font-medium">
              Scheduled ahead
            </p>
          </div>
          <div className="h-10 w-10 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
            <Clock className="h-5 w-5" />
          </div>
        </div>

        <div className="surface p-4 border border-border rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">This Month Total</p>
            <p className="text-2xl font-bold text-foreground mt-0.5">{stats.thisMonthCount}</p>
            <p className="text-[11px] text-purple-600 dark:text-purple-400 mt-0.5 font-medium">
              Processed bookings
            </p>
          </div>
          <div className="h-10 w-10 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center">
            <CalendarDays className="h-5 w-5" />
          </div>
        </div>

        <Link
          to="/bookings"
          className="surface p-4 border border-border rounded-xl flex items-center justify-between hover:border-amber-500/40 transition-colors"
          title="Click to review pending requests in Bookings page"
        >
          <div>
            <p className="text-xs text-muted-foreground font-medium">Pending Review</p>
            <p className="text-2xl font-bold text-amber-500 mt-0.5">{stats.pendingCount}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">
              Manage in Bookings &rarr;
            </p>
          </div>
          <div className="h-10 w-10 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5" />
          </div>
        </Link>
      </div>

      {/* Main 2-Column Calendar & Daily Schedule Layout */}
      <div className="mt-6">
        {bookingsQuery.isLoading ? (
          <div className="grid gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Interactive Month Calendar Picker (5 cols) */}
            <div className="lg:col-span-5 surface p-4 sm:p-5 border border-border rounded-xl flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-border/60">
                <div>
                  <h3 className="font-semibold text-sm text-foreground">Select Schedule Date</h3>
                  <p className="text-xs text-muted-foreground">Pick a day to inspect booked appointments</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedDate(new Date())}
                  className="h-7 text-xs px-2.5"
                >
                  Today
                </Button>
              </div>

              {/* DayPicker Calendar */}
              <div className="flex justify-center w-full">
                <CalendarPicker
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  modifiers={{
                    hasConfirmed: confirmedDates,
                    hasPending: pendingDates,
                  }}
                  modifiersClassNames={{
                    hasConfirmed:
                      "relative after:content-[''] after:absolute after:bottom-1 after:left-1.5 after:w-1.5 after:h-1.5 after:bg-emerald-500 after:rounded-full font-semibold",
                    hasPending:
                      "relative before:content-[''] before:absolute before:bottom-1 before:right-1.5 before:w-1.5 before:h-1.5 before:bg-amber-500 before:rounded-full font-semibold",
                  }}
                  className="w-full rounded-lg"
                />
              </div>

              {/* Calendar Dot Legend */}
              <div className="pt-3 border-t border-border/60 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                  <span>Confirmed Appointment</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                  <span>Pending Review</span>
                </div>
              </div>
            </div>

            {/* Right Column: Day's Appointments Timeline (7 cols) */}
            <div className="lg:col-span-7 surface p-4 sm:p-5 border border-border rounded-xl flex flex-col gap-4 min-h-[450px]">
              {/* Header for the Selected Day */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-border/60">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base sm:text-lg font-bold text-foreground">
                      {selectedDate.toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </h3>
                    {selectedDateKey === todayKey && (
                      <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-xs font-semibold">
                        Today
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {confirmedOnDay.length} Confirmed {confirmedOnDay.length === 1 ? "Appointment" : "Appointments"}
                    {pendingOnDay.length > 0 ? ` · ${pendingOnDay.length} Pending Review` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setManualDate(selectedDateKey);
                    setIsManualBookingOpen(true);
                  }}
                  className="h-8 text-xs font-semibold self-start sm:self-auto"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Book for this Day
                </Button>
              </div>

              {/* Selected Day Bookings List */}
              {selectedDayBookings.length === 0 ? (
                <div className="my-auto py-12 text-center flex flex-col items-center justify-center border border-dashed border-border/80 rounded-xl bg-card/40">
                  <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
                    <CalendarCheck className="h-6 w-6" />
                  </div>
                  <h4 className="font-semibold text-sm text-foreground">No bookings for this date</h4>
                  <p className="text-xs text-muted-foreground max-w-sm mt-1 px-4">
                    {searchQuery || statusFilter !== "ALL"
                      ? "No bookings match your current search or status filter on this date."
                      : `The clinic schedule is clear for ${selectedDate.toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}. You can manually schedule an appointment or select another day.`}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-4 text-xs font-semibold"
                    onClick={() => {
                      setManualDate(selectedDateKey);
                      setIsManualBookingOpen(true);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" /> Schedule for this Day
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedDayBookings.map((b) => (
                    <div
                      key={b.id}
                      className={`p-4 rounded-xl border transition-all ${
                        b.status === "CONFIRMED"
                          ? "border-emerald-500/30 bg-card hover:border-emerald-500/60 shadow-xs"
                          : b.status === "PENDING_STAFF"
                          ? "border-amber-500/30 bg-card hover:border-amber-500/60 shadow-xs"
                          : "border-border bg-card/60"
                      }`}
                    >
                      {/* Header: Time Slot + Status Badges + Action Button */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary/80 border border-border/60 text-xs font-semibold text-foreground">
                            <Clock className="h-3.5 w-3.5 text-primary" />
                            <span>
                              {b.appointments?.[0]
                                ? `${b.appointments[0].start_time.slice(0, 5)} - ${b.appointments[0].end_time.slice(0, 5)}`
                                : b.preferred_time_text || "Flexible Time"}
                            </span>
                          </div>
                          {getStatusBadge(b.status)}
                          {getUrgencyBadge(b.urgency)}
                        </div>

                        <Button
                          variant={b.status === "PENDING_STAFF" ? "default" : "outline"}
                          size="sm"
                          className="h-8 text-xs font-semibold self-start sm:self-auto"
                          onClick={() => handleOpenBooking(b)}
                        >
                          {b.status === "PENDING_STAFF" ? "Process Request" : "Manage / Details"}
                        </Button>
                      </div>

                      {/* Patient & Service Details */}
                      <div className="mt-3 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="font-bold text-sm text-foreground">
                              {b.customers?.display_name || "Guest Patient"}
                            </h4>
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
                          {b.customers?.instagram_username ? (
                            <p className="text-xs text-muted-foreground font-mono">
                              @{b.customers.instagram_username}
                            </p>
                          ) : b.source === "webchat" && b.session_id ? (
                            <p className="text-xs text-muted-foreground font-mono">
                              Session #{b.session_id.slice(0, 8)}
                            </p>
                          ) : null}

                          {/* Service and Duration */}
                          <div className="mt-2 flex items-center gap-1.5 text-xs">
                            <span className="font-medium text-muted-foreground">Service:</span>
                            <Badge variant="outline" className="text-xs py-0 font-medium">
                              {b.services?.name || "General Checkup"} ({b.services?.duration_minutes || 30} mins)
                            </Badge>
                          </div>
                        </div>

                        {/* Contact Info & 1-Click Call / WhatsApp (+91 format) */}
                        {b.customers?.phone && (
                          <div className="flex flex-col sm:items-end gap-1.5">
                            <span className="text-xs font-mono font-medium text-foreground">
                              {formatIndianPhone(b.customers.phone)}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <Button
                                asChild
                                variant="outline"
                                size="sm"
                                className="h-7 text-[11px] px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-500/10 border-blue-500/30"
                              >
                                <a href={getTelLink(b.customers.phone)}>
                                  <Phone className="h-3 w-3 mr-1" /> Call
                                </a>
                              </Button>
                              <Button
                                asChild
                                variant="outline"
                                size="sm"
                                className="h-7 text-[11px] px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 border-emerald-500/30"
                              >
                                <a
                                  href={getWhatsAppLink(
                                    b.customers.phone,
                                    `Hello ${b.customers?.display_name || ""}, this is regarding your dental appointment on ${selectedDate.toLocaleDateString(
                                      undefined,
                                      { weekday: "short", month: "short", day: "numeric" }
                                    )} at our dental clinic.`
                                  )}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <MessageCircle className="h-3 w-3 mr-1" /> WhatsApp
                                </a>
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* AI Summary */}
                      {b.ai_summary && (
                        <div className="mt-3 rounded-lg bg-primary/5 border border-primary/10 p-2.5 text-xs">
                          <p className="font-semibold text-primary flex items-center gap-1 text-[11px] mb-0.5">
                            <Sparkles className="h-3 w-3" /> AI Receptionist Summary
                          </p>
                          <p className="text-muted-foreground leading-relaxed text-[11px]">
                            {b.ai_summary}
                          </p>
                        </div>
                      )}

                      {/* Patient Notes */}
                      {b.patient_notes && !b.ai_summary && (
                        <div className="mt-3 rounded-lg bg-secondary/30 border border-border p-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Notes: </span>
                          {b.patient_notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
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
                          <Label htmlFor="delete-mode-switch-cal" className="text-xs font-semibold text-destructive cursor-pointer">
                            Delete pending booking request
                          </Label>
                          <p className="text-[11px] text-muted-foreground">
                            Permanently erase this request from the database
                          </p>
                        </div>
                      </div>
                      <Switch
                        id="delete-mode-switch-cal"
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
                            <Label htmlFor="decline-mode-switch-cal" className="text-xs font-semibold text-foreground cursor-pointer">
                              Decline booking request
                            </Label>
                            <p className="text-[11px] text-muted-foreground">
                              Mark request as declined without deleting it
                            </p>
                          </div>
                        </div>
                        <Switch
                          id="decline-mode-switch-cal"
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
    </AppShell>
  );
}
