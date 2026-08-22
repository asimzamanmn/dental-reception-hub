import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { BOOKING_PROVIDERS, formatDateTime, type Settings, type AuthorizedEmail } from "@/lib/db";
import { useAuth } from "@/hooks/use-auth";
import { Plus, Trash2, ShieldAlert, UserCheck } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Clinic Settings — Dental AI Receptionist" },
      {
        name: "description",
        content:
          "Edit clinic name, WhatsApp number, booking provider, booking window and AI message templates.",
      },
      { property: "og:title", content: "Clinic Settings — Dental AI Receptionist" },
      {
        property: "og:description",
        content: "Configure booking behaviour and AI messaging for your dental clinic.",
      },
    ],
  }),
  component: SettingsPage,
});

type Form = Omit<Settings, "id" | "updated_at">;

const EMPTY: Form = {
  clinic_name: "",
  whatsapp_number: "",
  booking_provider: "MANUAL",
  calendly_url: "",
  booking_manual_window_days: 14,
  session_timeout_hours: 24,
  message_retention_days: 30,
  intro_message: "",
  emergency_message: "",
};

function SettingsPage() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form>(EMPTY);

  // States for user invitation allowlist
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "staff">("staff");

  const [webhookUrl, setWebhookUrl] = useState(
    () => localStorage.getItem("n8n_email_webhook_url") || ""
  );

  const handleSaveWebhook = () => {
    localStorage.setItem("n8n_email_webhook_url", webhookUrl.trim());
    toast.success("n8n webhook URL saved locally!");
  };

  // Query authorized emails (only for admin)
  const authorizedEmails = useQuery({
    queryKey: ["authorized-emails"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("authorized_emails")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AuthorizedEmail[];
    },
    enabled: role === "admin",
  });

  const addEmail = useMutation({
    mutationFn: async () => {
      const emailClean = inviteEmail.trim().toLowerCase();
      if (!emailClean) throw new Error("Email address is required.");
      const { error } = await supabase
        .from("authorized_emails")
        .insert({ email: emailClean, role: inviteRole });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Staff email authorized successfully.");
      setInviteEmail("");
      void queryClient.invalidateQueries({ queryKey: ["authorized-emails"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeEmail = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase
        .from("authorized_emails")
        .delete()
        .eq("email", email);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Authorized email removed.");
      void queryClient.invalidateQueries({ queryKey: ["authorized-emails"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data as Settings | null;
    },
  });

  useEffect(() => {
    if (settings.data) {
      const { id: _id, updated_at: _u, ...rest } = settings.data;
      setForm({ ...EMPTY, ...rest });
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!settings.data?.id) throw new Error("No settings row found in the database.");
      const { error } = await supabase
        .from("settings")
        .update({ ...form, updated_at: new Date().toISOString() })
        .eq("id", settings.data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Clinic settings saved");
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  if (settings.isLoading) {
    return (
      <AppShell title="Clinic Settings">
        <div className="grid max-w-3xl gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Clinic Settings"
      description={
        settings.data?.updated_at
          ? `Last updated ${formatDateTime(settings.data.updated_at)}`
          : "Configure how the AI receptionist behaves"
      }
      actions={
        role === "admin" ? (
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        ) : null
      }
    >
      {role === "staff" && (
        <div className="mb-4 rounded-lg border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-400">
          <span className="font-semibold">Read-only View (Staff):</span> You can view the clinic settings, but only administrators can change them.
        </div>
      )}
      {!settings.data ? (
        <p className="text-sm text-destructive">
          No settings row exists in the database yet, so there is nothing to edit.
        </p>
      ) : (
        <div className="grid max-w-4xl gap-3 lg:grid-cols-2">
          <section className="surface p-4 lg:col-span-2">
            <p className="text-sm font-medium">Clinic</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="clinic_name">Clinic name</Label>
                <Input
                  id="clinic_name"
                  value={form.clinic_name}
                  onChange={(e) => set("clinic_name", e.target.value)}
                  disabled={role === "staff"}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="whatsapp">WhatsApp number</Label>
                <Input
                  id="whatsapp"
                  value={form.whatsapp_number ?? ""}
                  onChange={(e) => set("whatsapp_number", e.target.value)}
                  placeholder="+91 98765 43210"
                  disabled={role === "staff"}
                />
              </div>
            </div>
          </section>

          <section className="surface p-4">
            <p className="text-sm font-medium">Booking</p>
            <div className="mt-3 grid gap-4">
              <div className="grid gap-1.5">
                <Label>Booking provider</Label>
                <Select
                  value={form.booking_provider ?? "MANUAL"}
                  onValueChange={(v) => set("booking_provider", v)}
                  disabled={role === "staff"}
                >
                  <SelectTrigger disabled={role === "staff"}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOOKING_PROVIDERS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="calendly">Calendly URL</Label>
                <Input
                  id="calendly"
                  value={form.calendly_url ?? ""}
                  onChange={(e) => set("calendly_url", e.target.value)}
                  placeholder="https://calendly.com/your-clinic"
                  disabled={role === "staff"}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="window">Booking window (days)</Label>
                <Input
                  id="window"
                  type="number"
                  min={1}
                  value={form.booking_manual_window_days ?? 14}
                  onChange={(e) => set("booking_manual_window_days", Number(e.target.value))}
                  disabled={role === "staff"}
                />
              </div>
            </div>
          </section>

          <section className="surface p-4">
            <p className="text-sm font-medium">Sessions & retention</p>
            <div className="mt-3 grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="timeout">Session timeout (hours)</Label>
                <Input
                  id="timeout"
                  type="number"
                  min={1}
                  value={form.session_timeout_hours ?? 24}
                  onChange={(e) => set("session_timeout_hours", Number(e.target.value))}
                  disabled={role === "staff"}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="retention">Message retention (days)</Label>
                <Input
                  id="retention"
                  type="number"
                  min={1}
                  value={form.message_retention_days ?? 30}
                  onChange={(e) => set("message_retention_days", Number(e.target.value))}
                  disabled={role === "staff"}
                />
              </div>
            </div>
          </section>

          <section className="surface p-4">
            <p className="text-sm font-medium">n8n Email Integration</p>
            <div className="mt-3 grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="webhook-url">n8n Webhook URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="webhook-url"
                    type="url"
                    placeholder="https://your-n8n.webhook.url"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    disabled={role === "staff"}
                  />
                  {role === "admin" && (
                    <Button onClick={handleSaveWebhook} size="sm" className="font-semibold">
                      Save
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="surface p-4 lg:col-span-2">
            <p className="text-sm font-medium">AI messages</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="intro">Intro message</Label>
                <Textarea
                  id="intro"
                  rows={5}
                  value={form.intro_message ?? ""}
                  onChange={(e) => set("intro_message", e.target.value)}
                  disabled={role === "staff"}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="emergency">Emergency message</Label>
                <Textarea
                  id="emergency"
                  rows={5}
                  value={form.emergency_message ?? ""}
                  onChange={(e) => set("emergency_message", e.target.value)}
                  disabled={role === "staff"}
                />
              </div>
            </div>
          </section>

          {/* User Management Allowlist (Admins Only) */}
          {role === "admin" && (
            <section className="surface p-4 lg:col-span-2 space-y-4">
              <div>
                <h3 className="text-base font-semibold">Authorized Staff & Access Control</h3>
                <p className="text-xs text-muted-foreground">
                  Pre-approve staff emails. Only users whose emails are registered here can complete sign-up.
                </p>
              </div>

              {/* Add form */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="grid gap-1.5 flex-1">
                  <Label htmlFor="invite-email">Staff Email Address</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="staff@yourclinic.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5 w-full sm:w-48">
                  <Label>Assigned Role</Label>
                  <Select
                    value={inviteRole}
                    onValueChange={(v) => setInviteRole(v as "admin" | "staff")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="staff">Staff (Read-only settings)</SelectItem>
                      <SelectItem value="admin">Administrator (Full access)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => addEmail.mutate()}
                  disabled={addEmail.isPending}
                  className="w-full sm:w-auto"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {addEmail.isPending ? "Adding..." : "Add Email"}
                </Button>
              </div>

              {/* Table */}
              <div className="mt-4 overflow-x-auto border border-border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Authorized Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Authorized Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {authorizedEmails.isLoading ? (
                      <TableRow>
                        <TableCell colSpan={4}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      </TableRow>
                    ) : (authorizedEmails.data ?? []).map((acc) => (
                      <TableRow key={acc.email}>
                        <TableCell className="font-mono text-sm">{acc.email}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium ${
                            acc.role === 'admin' 
                              ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' 
                              : 'bg-sky-500/10 text-sky-500 border border-sky-500/20'
                          }`}>
                            {acc.role === 'admin' ? (
                              <>
                                <ShieldAlert className="h-3 w-3" />
                                Admin
                              </>
                            ) : (
                              <>
                                <UserCheck className="h-3 w-3" />
                                Staff
                              </>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {formatDateTime(acc.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={removeEmail.isPending}
                            onClick={() => removeEmail.mutate(acc.email)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!authorizedEmails.isLoading && !(authorizedEmails.data ?? []).length && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                          No authorized emails registered. Add one above.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
