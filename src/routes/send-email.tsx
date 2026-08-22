import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Mail, Send, User, Calendar, Clock, BookOpen, AlertCircle } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/send-email")({
  head: () => ({
    meta: [
      { title: "Send Email Confirmation — Dental AI Receptionist" },
      {
        name: "description",
        content: "Send manual email confirmation to patients.",
      },
    ],
  }),
  component: SendEmailPage,
});

function SendEmailPage() {
  const [patientName, setPatientName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [apptDate, setApptDate] = useState("");
  const [apptTime, setApptTime] = useState("");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !patientName.trim()) {
      toast.error("Patient Name and Email are required.");
      return;
    }

    const url = localStorage.getItem("n8n_email_webhook_url") || import.meta.env.VITE_N8N_EMAIL_WEBHOOK_URL;
    if (!url) {
      toast.error("n8n Email Webhook URL is not configured in Settings!");
      return;
    }

    setSending(true);
    try {
      const payload = {
        bookingId: "manual_send_" + Date.now(),
        customerName: patientName.trim(),
        customerEmail: email.trim(),
        customerPhone: phone.trim() || undefined,
        serviceName: serviceName.trim() || "Dental Checkup",
        appointmentDate: apptDate,
        startTime: apptTime,
        endTime: apptTime,
        notes: notes.trim() || undefined,
      };

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

      toast.success("Email confirmation request sent to n8n successfully!");
      // Reset form
      setPatientName("");
      setEmail("");
      setPhone("");
      setServiceName("");
      setApptDate("");
      setApptTime("");
      setNotes("");
    } catch (err: any) {
      toast.error("Failed to send: " + err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <AppShell title="Send Email" description="Manually trigger email notifications through n8n workflow">
      <div className="max-w-2xl surface p-6">
        <div className="flex items-center gap-2 mb-6 border-b border-border pb-4">
          <Mail className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Send Confirmation Manually</h2>
        </div>

        <form onSubmit={handleSend} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="se-name">Patient Name *</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="se-name"
                  required
                  placeholder="John Doe"
                  className="pl-9"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="se-email">Patient Email *</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="se-email"
                  type="email"
                  required
                  placeholder="patient@example.com"
                  className="pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="se-phone">Patient Phone (Optional)</Label>
              <Input
                id="se-phone"
                placeholder="+1 234 567 8900"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="se-service">Service Name</Label>
              <div className="relative">
                <BookOpen className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="se-service"
                  placeholder="Root Canal, Checkup, etc."
                  className="pl-9"
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="se-date">Appointment Date</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="se-date"
                  type="date"
                  className="pl-9"
                  value={apptDate}
                  onChange={(e) => setApptDate(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="se-time">Appointment Time</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="se-time"
                  type="time"
                  className="pl-9"
                  value={apptTime}
                  onChange={(e) => setApptTime(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="se-notes">Message / Custom Notes</Label>
            <Textarea
              id="se-notes"
              rows={4}
              placeholder="Provide clinic address, appointment instructions, or dentist assignment notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="pt-2 border-t border-border flex justify-between items-center">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" /> * Indicates required fields.
            </p>
            <Button type="submit" disabled={sending} className="w-full sm:w-auto font-semibold">
              <Send className="mr-2 h-4 w-4" />
              {sending ? "Sending..." : "Send Email"}
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
