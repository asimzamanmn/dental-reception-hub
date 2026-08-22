import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { WEEKDAYS, type Doctor, type DoctorAvailability } from "@/lib/db";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/doctors")({
  head: () => ({
    meta: [
      { title: "Doctors — Dental AI Receptionist" },
      {
        name: "description",
        content:
          "Manage dentists, their specialisations, slot durations and weekly availability used for AI booking.",
      },
      { property: "og:title", content: "Doctors — Dental AI Receptionist" },
      {
        property: "og:description",
        content: "Add dentists and maintain the weekly availability the AI books against.",
      },
    ],
  }),
  component: DoctorsPage,
});

type Draft = { name: string; specialization: string; slot_duration_minutes: number; active: boolean };
const EMPTY: Draft = { name: "", specialization: "", slot_duration_minutes: 30, active: true };

function DoctorsPage() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Doctor | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [deleteTarget, setDeleteTarget] = useState<Doctor | null>(null);
  const [availabilityFor, setAvailabilityFor] = useState<Doctor | null>(null);
  const [slot, setSlot] = useState({ weekday: "1", start_time: "09:00", end_time: "17:00" });

  const doctors = useQuery({
    queryKey: ["doctors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doctors")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Doctor[];
    },
  });

  const availability = useQuery({
    queryKey: ["doctor-availability", availabilityFor?.id],
    enabled: Boolean(availabilityFor),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doctor_availability")
        .select("*")
        .eq("doctor_id", availabilityFor!.id)
        .order("weekday", { ascending: true })
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DoctorAvailability[];
    },
  });

  const refreshDoctors = () => void queryClient.invalidateQueries({ queryKey: ["doctors"] });
  const refreshAvailability = () =>
    void queryClient.invalidateQueries({ queryKey: ["doctor-availability"] });

  const upsert = useMutation({
    mutationFn: async () => {
      if (!draft.name.trim()) throw new Error("Doctor name is required.");
      if (editing) {
        const { error } = await supabase
          .from("doctors")
          .update({ ...draft, updated_at: new Date().toISOString() })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("doctors").insert(draft);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Doctor updated" : "Doctor added");
      setOpen(false);
      refreshDoctors();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async (doc: Doctor) => {
      const { error } = await supabase
        .from("doctors")
        .update({ active: !doc.active })
        .eq("id", doc.id);
      if (error) throw error;
      return !doc.active;
    },
    onSuccess: (active) => {
      toast.success(active ? "Doctor activated" : "Doctor deactivated");
      refreshDoctors();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (doc: Doctor) => {
      const { error } = await supabase.from("doctors").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Doctor deleted");
      setDeleteTarget(null);
      refreshDoctors();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addSlot = useMutation({
    mutationFn: async () => {
      if (!availabilityFor) return;
      if (slot.end_time <= slot.start_time) throw new Error("End time must be after start time.");
      const { error } = await supabase.from("doctor_availability").insert({
        doctor_id: availabilityFor.id,
        weekday: Number(slot.weekday),
        start_time: slot.start_time,
        end_time: slot.end_time,
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Availability added");
      refreshAvailability();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patchSlot = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("doctor_availability").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refreshAvailability,
    onError: (e: Error) => toast.error(e.message),
  });

  const removeSlot = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("doctor_availability").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Availability removed");
      refreshAvailability();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setEditing(null);
    setDraft(EMPTY);
    setOpen(true);
  };

  const openEdit = (doc: Doctor) => {
    setEditing(doc);
    setDraft({
      name: doc.name,
      specialization: doc.specialization ?? "",
      slot_duration_minutes: doc.slot_duration_minutes ?? 30,
      active: Boolean(doc.active),
    });
    setOpen(true);
  };

  return (
    <AppShell
      title="Doctors"
      description="Dentists and their weekly availability"
      actions={
        role === "admin" ? (
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" /> Add doctor
          </Button>
        ) : null
      }
    >
      {role === "staff" && (
        <div className="mb-4 rounded-lg border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-400">
          <span className="font-semibold">Read-only View (Staff):</span> You can view the doctors and availability, but only administrators can manage them.
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {doctors.isLoading
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)
          : (doctors.data ?? []).map((doc) => (
              <article key={doc.id} className="surface flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold">{doc.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {doc.specialization ?? "General dentistry"} ·{" "}
                      {doc.slot_duration_minutes ?? 30} min slots
                    </p>
                  </div>
                  <Switch
                    checked={Boolean(doc.active)}
                    onCheckedChange={() => toggleActive.mutate(doc)}
                    aria-label="Toggle doctor active"
                    disabled={role === "staff"}
                  />
                </div>
                <div className="mt-auto flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setAvailabilityFor(doc)}>
                    <CalendarClock className="h-4 w-4" /> Availability
                  </Button>
                  {role === "admin" && (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(doc)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(doc)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              </article>
            ))}
        {!doctors.isLoading && !(doctors.data ?? []).length ? (
          <p className="surface p-10 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
            No doctors added yet.
          </p>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit doctor" : "Add doctor"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="doc-name">Name</Label>
              <Input
                id="doc-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="doc-spec">Specialization</Label>
              <Input
                id="doc-spec"
                value={draft.specialization}
                onChange={(e) => setDraft({ ...draft, specialization: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="doc-slot">Slot duration (minutes)</Label>
              <Input
                id="doc-slot"
                type="number"
                min={5}
                value={draft.slot_duration_minutes}
                onChange={(e) =>
                  setDraft({ ...draft, slot_duration_minutes: Number(e.target.value) })
                }
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
              <Label htmlFor="doc-active">Active</Label>
              <Switch
                id="doc-active"
                checked={draft.active}
                onCheckedChange={(v) => setDraft({ ...draft, active: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => upsert.mutate()} disabled={upsert.isPending}>
              {upsert.isPending ? "Saving…" : editing ? "Save changes" : "Add doctor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(availabilityFor)} onOpenChange={(o) => !o && setAvailabilityFor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Weekly availability — {availabilityFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            {role === "admin" && (
              <div className="grid grid-cols-[1fr_auto_auto_auto] items-end gap-2">
                <div className="grid gap-1.5">
                  <Label>Day</Label>
                  <Select value={slot.weekday} onValueChange={(v) => setSlot({ ...slot, weekday: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((d, i) => (
                        <SelectItem key={d} value={String(i)}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>From</Label>
                  <Input
                    type="time"
                    value={slot.start_time}
                    onChange={(e) => setSlot({ ...slot, start_time: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>To</Label>
                  <Input
                    type="time"
                    value={slot.end_time}
                    onChange={(e) => setSlot({ ...slot, end_time: e.target.value })}
                  />
                </div>
                <Button onClick={() => addSlot.mutate()} disabled={addSlot.isPending}>
                  Add
                </Button>
              </div>
            )}

            <div className="divide-y divide-border">
              {availability.isLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="my-2 h-8 w-full" />
                  ))
                : (availability.data ?? []).map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2 py-2">
                      <p className="text-sm">
                        <span className="font-medium">{WEEKDAYS[a.weekday]}</span>{" "}
                        <span className="text-muted-foreground">
                          {a.start_time.slice(0, 5)} – {a.end_time.slice(0, 5)}
                        </span>
                      </p>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={Boolean(a.active)}
                          onCheckedChange={(v) => patchSlot.mutate({ id: a.id, active: v })}
                          aria-label="Toggle slot active"
                          disabled={role === "staff"}
                        />
                        {role === "admin" && (
                          <Button variant="ghost" size="icon" onClick={() => removeSlot.mutate(a.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
              {!availability.isLoading && !(availability.data ?? []).length ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No availability configured.
                </p>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the doctor and their availability. Deactivate instead if they may return.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && remove.mutate(deleteTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
