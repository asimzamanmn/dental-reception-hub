export type Settings = {
  id: string;
  clinic_name: string;
  whatsapp_number: string | null;
  booking_provider: string | null;
  calendly_url: string | null;
  booking_manual_window_days: number | null;
  session_timeout_hours: number | null;
  message_retention_days: number | null;
  intro_message: string | null;
  emergency_message: string | null;
  updated_at: string | null;
};

export type Service = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  duration_minutes: number | null;
  price_from: number | null;
  price_to: number | null;
  currency: string | null;
  booking_mode: string | null;
  active: boolean | null;
  display_order: number | null;
};

export type Knowledge = {
  id: string;
  title: string;
  category: string;
  tags: string[] | null;
  content: string;
  priority: number | null;
  approved: boolean | null;
  active: boolean | null;
  updated_at: string | null;
};

export type Doctor = {
  id: string;
  name: string;
  specialization: string | null;
  slot_duration_minutes: number | null;
  active: boolean | null;
};

export type DoctorAvailability = {
  id: string;
  doctor_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  active: boolean | null;
};

export type TestAccount = {
  instagram_user_id: string;
  name: string | null;
  active: boolean | null;
  created_at: string | null;
};

export type AuthorizedEmail = {
  email: string;
  role: "admin" | "staff";
  created_at: string;
};

export type InstagramCommentCampaign = {
  id: number;
  post_id: string;
  active: boolean;
  created_at: string;
};

export type InstagramCommentKeyword = {
  id: number;
  campaign_id: number;
  keyword: string;
  dm_message: string;
  active: boolean;
  created_at: string;
};

export type InstagramProcessedComment = {
  id: number;
  comment_id: string;
  campaign_id: number;
  processed_at: string;
};

export type RecentConversation = {
  id: string;
  status: string | null;
  lead_stage: string | null;
  booking_state: string | null;
  last_intent: string | null;
  last_activity_at: string | null;
  customers: { display_name: string | null; instagram_username: string | null } | null;
};

export type RecentBooking = {
  id: string;
  status: string;
  preferred_date: string | null;
  preferred_time_text: string | null;
  urgency: number | null;
  ai_summary: string | null;
  created_at: string | null;
  customers: { display_name: string | null; instagram_username: string | null } | null;
  services: { name: string } | null;
};

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const BOOKING_MODES = ["STAFF", "AUTO", "CALENDLY", "MANUAL"];
export const BOOKING_PROVIDERS = ["MANUAL", "CALENDLY"];

export function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const dayLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** Buckets rows with a timestamp column into the last `days` calendar days. */
export function bucketByDay(
  rows: Array<Record<string, unknown>>,
  column: string,
  days: number,
): Array<{ day: string; count: number }> {
  const buckets = new Map<string, number>();
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    keys.push(key);
    buckets.set(key, 0);
  }
  for (const row of rows) {
    const raw = row[column];
    if (typeof raw !== "string") continue;
    const key = raw.slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return keys.map((key) => ({
    day: dayLabel.format(new Date(`${key}T00:00:00`)),
    count: buckets.get(key) ?? 0,
  }));
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatPrice(from: number | null, to: number | null, currency?: string | null) {
  const c = (currency ?? "INR").trim();
  if (from == null && to == null) return "—";
  if (to == null || to === from) return `${c} ${from}`;
  if (from == null) return `${c} ${to}`;
  return `${c} ${from} – ${to}`;
}
