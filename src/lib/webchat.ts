import { supabase } from "@/integrations/supabase/client";

export interface WebchatCustomer {
  id: string;
  name: string | null;
  phone: string | null;
  session_id: string;
  contact_captured?: boolean;
}

export interface WebchatBookingRequest {
  id: string;
  session_id: string;
  customer_id: string | null;
  service_id: string | null;
  status: string;
  preferred_time_text: string | null;
  preferred_date?: string | null;
  patient_notes: string | null;
  ai_summary: string | null;
  created_at: string;
  communication_status?: string | null;
  email?: string | null;
  created_by_ai?: boolean;
  urgency?: number;
}

export interface WebchatMediaRequest {
  id: string;
  session_id: string;
  customer_id: string | null;
  message_id?: string | null;
  media_type: "image" | "voice" | "audio" | "video" | string;
  media_url: string;
  patient_note: string | null;
  status: string;
  customer_name: string | null;
  customer_phone: string | null;
  contact_attempts: number;
  created_at: string;
}

/**
 * Fetch all booking requests from webchat.booking_requests
 * Normalizes customer details and joins linked appointments if scheduled.
 */
export async function fetchWebchatBookings(): Promise<any[]> {
  try {
    const { data: bookings, error } = await supabase
      .schema("webchat")
      .from("booking_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      if (error.code === "PGRST106" || error.message?.includes("Invalid schema")) {
        console.warn(
          "[Webchat] Schema 'webchat' is not exposed in PostgREST API yet. Please add 'webchat' to 'Exposed schemas' in Supabase Dashboard (Settings > API).",
        );
        return [];
      }
      console.warn("[Webchat] Error fetching booking_requests:", error.message);
      return [];
    }

    if (!bookings || bookings.length === 0) return [];

    // 1. Fetch webchat customers for customer names & phones
    const customerIds = Array.from(
      new Set(bookings.map((b: any) => b.customer_id).filter(Boolean)),
    );
    const customerMap = new Map<string, WebchatCustomer>();
    if (customerIds.length > 0) {
      const { data: customers, error: custErr } = await supabase
        .schema("webchat")
        .from("customers")
        .select("id, name, phone, session_id")
        .in("id", customerIds);

      if (!custErr && customers) {
        for (const c of customers) {
          customerMap.set(c.id, c as WebchatCustomer);
        }
      }
    }

    // 2. Fetch linked appointments from public.appointments
    const bookingIds = bookings.map((b: any) => b.id);
    const apptMap = new Map<string, any>();
    if (bookingIds.length > 0) {
      const { data: appts, error: apptErr } = await supabase
        .from("appointments")
        .select("id, booking_request_id, appointment_date, start_time, end_time, notes")
        .in("booking_request_id", bookingIds);

      if (!apptErr && appts) {
        for (const a of appts) {
          apptMap.set(a.booking_request_id, a);
        }
      }
    }

    // 3. Fetch services from public.services to link names
    const serviceIds = Array.from(
      new Set(bookings.map((b: any) => b.service_id).filter(Boolean)),
    );
    const servicesMap = new Map<string, { name: string; duration_minutes: number }>();
    if (serviceIds.length > 0) {
      const { data: srvs } = await supabase
        .from("services")
        .select("id, name, duration_minutes")
        .in("id", serviceIds);
      if (srvs) {
        for (const s of srvs) {
          servicesMap.set(s.id, {
            name: s.name,
            duration_minutes: s.duration_minutes || 30,
          });
        }
      }
    }

    return bookings.map((b: any) => {
      const cust = customerMap.get(b.customer_id);
      const appt = apptMap.get(b.id);
      const srv = servicesMap.get(b.service_id);

      return {
        id: b.id,
        source: "webchat" as const,
        status: b.status || "PENDING_STAFF",
        preferred_date: b.preferred_date || null,
        preferred_time_text: b.preferred_time_text || null,
        urgency: b.urgency ?? 2,
        ai_summary: b.ai_summary || null,
        patient_notes: b.patient_notes || null,
        created_at: b.created_at,
        service_id: b.service_id || null,
        email: b.email || null,
        session_id: b.session_id,
        customers: {
          display_name: cust?.name || (b.session_id ? `Webchat Guest #${b.session_id.slice(0, 6)}` : "Webchat Guest"),
          instagram_username: null,
          phone: cust?.phone || null,
        },
        services: srv || (b.service_id ? { name: "Dental Service", duration_minutes: 30 } : null),
        appointments: appt ? [appt] : [],
      };
    });
  } catch (err: any) {
    console.warn("[Webchat] Unexpected error fetching webchat bookings:", err?.message || err);
    return [];
  }
}

/**
 * Fetch all media requests from webchat.media_requests
 * Normalizes customer details to match the MediaRequest type.
 */
export async function fetchWebchatMediaRequests(): Promise<any[]> {
  try {
    const { data: requests, error } = await supabase
      .schema("webchat")
      .from("media_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      if (error.code === "PGRST106" || error.message?.includes("Invalid schema")) {
        console.warn(
          "[Webchat] Schema 'webchat' is not exposed in PostgREST API yet. Please add 'webchat' to 'Exposed schemas' in Supabase Dashboard (Settings > API).",
        );
        return [];
      }
      console.warn("[Webchat] Error fetching media_requests:", error.message);
      return [];
    }

    if (!requests || requests.length === 0) return [];

    return requests.map((item: any) => ({
      id: item.id,
      source: "webchat" as const,
      conversation_id: item.session_id || item.customer_id || item.id,
      session_id: item.session_id,
      customer_id: item.customer_id,
      message_id: item.message_id,
      media_type: item.media_type || "image",
      media_url: item.media_url,
      patient_note: item.patient_note,
      status: item.status || "PENDING_STAFF",
      customer_name: item.customer_name || "Webchat Patient",
      customer_phone: item.customer_phone || null,
      contact_attempts: item.contact_attempts || 0,
      created_at: item.created_at,
      resolved_at: item.resolved_at || null,
    }));
  } catch (err: any) {
    console.warn("[Webchat] Unexpected error fetching webchat media requests:", err?.message || err);
    return [];
  }
}

/**
 * Update webchat booking status (CONFIRMED, DECLINED, etc.)
 */
export async function updateWebchatBookingStatus(bookingId: string, status: string) {
  const { error } = await supabase
    .schema("webchat")
    .from("booking_requests")
    .update({ status })
    .eq("id", bookingId);
  if (error) throw error;
}

/**
 * Delete a webchat booking request and any linked appointment
 */
export async function deleteWebchatBooking(bookingId: string) {
  // 1. Delete associated appointment if any
  const { error: apptErr } = await supabase
    .from("appointments")
    .delete()
    .eq("booking_request_id", bookingId);
  if (apptErr) console.warn("[Webchat] Failed deleting linked appointment:", apptErr);

  // 2. Delete webchat booking
  const { error } = await supabase
    .schema("webchat")
    .from("booking_requests")
    .delete()
    .eq("id", bookingId);
  if (error) throw error;
}

/**
 * Update webchat media requests status (RESOLVED, CONTACTED, PENDING_STAFF)
 */
export async function updateWebchatMediaStatus(ids: string[], newStatus: string) {
  const { error } = await supabase
    .schema("webchat")
    .from("media_requests")
    .update({ status: newStatus })
    .in("id", ids);
  if (error) throw error;
}

/**
 * Increment contact attempts for webchat media requests
 */
export async function incrementWebchatMediaContact(ids: string[], currentAttempts: number) {
  const { error } = await supabase
    .schema("webchat")
    .from("media_requests")
    .update({
      contact_attempts: (currentAttempts || 0) + 1,
      status: "CONTACTED",
    })
    .in("id", ids);
  if (error) throw error;
}
