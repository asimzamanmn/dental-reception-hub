import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { BOOKING_MODES, formatPrice, type Service } from "@/lib/db";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/services")({
  head: () => ({
    meta: [
      { title: "Services — Dental AI Receptionist" },
      {
        name: "description",
        content:
          "Manage treatments the AI receptionist can quote and book: pricing, duration, booking mode and display order.",
      },
      { property: "og:title", content: "Services — Dental AI Receptionist" },
      {
        property: "og:description",
        content: "Create, edit and deactivate the treatments your AI receptionist offers.",
      },
    ],
  }),
  component: ServicesPage,
});

type Draft = Omit<Service, "id">;

const EMPTY: Draft = {
  name: "",
  description: "",
  category: "",
  duration_minutes: 30,
  price_from: null,
  price_to: null,
  currency: "INR",
  booking_mode: "STAFF",
  active: true,
  display_order: 0,
};

function ServicesPage() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Service | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null);

  const services = useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Service[];
    },
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["services"] });

  const upsert = useMutation({
    mutationFn: async () => {
      if (!draft.name.trim()) throw new Error("Service name is required.");
      if (editing) {
        const { error } = await supabase
          .from("services")
          .update({ ...draft, updated_at: new Date().toISOString() })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("services").insert(draft);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Service updated" : "Service added");
      setOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async (svc: Service) => {
      const { error } = await supabase
        .from("services")
        .update({ active: !svc.active })
        .eq("id", svc.id);
      if (error) throw error;
      return !svc.active;
    },
    onSuccess: (active) => {
      toast.success(active ? "Service activated" : "Service deactivated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (svc: Service) => {
      const { error } = await supabase.from("services").delete().eq("id", svc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Service deleted");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setEditing(null);
    setDraft(EMPTY);
    setOpen(true);
  };

  const openEdit = (svc: Service) => {
    const { id: _id, ...rest } = svc;
    setEditing(svc);
    setDraft({ ...EMPTY, ...rest });
    setOpen(true);
  };

  const filtered = (services.data ?? []).filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [s.name, s.category, s.description].some((v) => v?.toLowerCase().includes(q));
  });

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <AppShell
      title="Services"
      description="Treatments the AI can describe, quote and book"
      actions={
        role === "admin" ? (
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" /> Add service
          </Button>
        ) : null
      }
    >
      {role === "staff" && (
        <div className="mb-4 rounded-lg border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-400">
          <span className="font-semibold">Read-only View (Staff):</span> You can view the services, but only administrators can manage them.
        </div>
      )}
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search services…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="surface mt-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Booking mode</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <p className="font-medium">{s.name}</p>
                      {s.description ? (
                        <p className="max-w-xs truncate text-xs text-muted-foreground">
                          {s.description}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.category ?? "—"}</TableCell>
                    <TableCell>{s.duration_minutes ?? "—"} min</TableCell>
                    <TableCell>{formatPrice(s.price_from, s.price_to, s.currency)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{s.booking_mode ?? "—"}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{s.display_order ?? 0}</TableCell>
                    <TableCell>
                      <Switch
                        checked={Boolean(s.active)}
                        onCheckedChange={() => toggleActive.mutate(s)}
                        aria-label="Toggle service active"
                        disabled={role === "staff"}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      {role === "admin" && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(s)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            {!services.isLoading && !filtered.length ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  No services found.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit service" : "Add service"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="svc-name">Name</Label>
              <Input
                id="svc-name"
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="svc-desc">Description</Label>
              <Textarea
                id="svc-desc"
                rows={3}
                value={draft.description ?? ""}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="svc-cat">Category</Label>
                <Input
                  id="svc-cat"
                  value={draft.category ?? ""}
                  onChange={(e) => set("category", e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="svc-dur">Duration (minutes)</Label>
                <Input
                  id="svc-dur"
                  type="number"
                  min={5}
                  value={draft.duration_minutes ?? 30}
                  onChange={(e) => set("duration_minutes", Number(e.target.value))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="svc-from">Price from</Label>
                <Input
                  id="svc-from"
                  type="number"
                  value={draft.price_from ?? ""}
                  onChange={(e) =>
                    set("price_from", e.target.value === "" ? null : Number(e.target.value))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="svc-to">Price to</Label>
                <Input
                  id="svc-to"
                  type="number"
                  value={draft.price_to ?? ""}
                  onChange={(e) =>
                    set("price_to", e.target.value === "" ? null : Number(e.target.value))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Booking mode</Label>
                <Select
                  value={draft.booking_mode ?? "STAFF"}
                  onValueChange={(v) => set("booking_mode", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOOKING_MODES.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="svc-order">Display order</Label>
                <Input
                  id="svc-order"
                  type="number"
                  value={draft.display_order ?? 0}
                  onChange={(e) => set("display_order", Number(e.target.value))}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
              <Label htmlFor="svc-active">Active</Label>
              <Switch
                id="svc-active"
                checked={Boolean(draft.active)}
                onCheckedChange={(v) => set("active", v)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => upsert.mutate()} disabled={upsert.isPending}>
              {upsert.isPending ? "Saving…" : editing ? "Save changes" : "Add service"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the service. Existing booking requests that reference it stay
              intact.
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
