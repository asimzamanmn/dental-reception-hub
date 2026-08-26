import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime, type Knowledge } from "@/lib/db";

export const Route = createFileRoute("/knowledge")({
  head: () => ({
    meta: [
      { title: "Knowledge Base — Dental AI Receptionist" },
      {
        name: "description",
        content:
          "Curate the answers your AI receptionist uses: articles, categories, tags, priority and approval state.",
      },
      { property: "og:title", content: "Knowledge Base — Dental AI Receptionist" },
      {
        property: "og:description",
        content: "Search, edit and approve the knowledge your AI receptionist replies with.",
      },
    ],
  }),
  component: KnowledgePage,
});

type Draft = {
  title: string;
  category: string;
  tags: string;
  content: string;
  priority: number;
  approved: boolean;
  active: boolean;
};

const CATEGORIES = [
  "AI_POLICY",
  "BOOKING",
  "EMERGENCY",
  "FAQ",
  "GENERAL",
  "PAYMENT",
  "POLICY",
  "PRICING",
  "TREATMENT",
] as const;

const EMPTY: Draft = {
  title: "",
  category: "",
  tags: "",
  content: "",
  priority: 50,
  approved: true,
  active: true,
};

function KnowledgePage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Knowledge | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [deleteTarget, setDeleteTarget] = useState<Knowledge | null>(null);

  const entries = useQuery({
    queryKey: ["knowledge"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge")
        .select("*")
        .order("priority", { ascending: false })
        .order("title", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Knowledge[];
    },
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["knowledge"] });

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries.data ?? []) if (e.category) set.add(e.category);
    return Array.from(set).sort();
  }, [entries.data]);

  const filtered = (entries.data ?? []).filter((e) => {
    if (category !== "all" && e.category !== category) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      e.title.toLowerCase().includes(q) ||
      e.content.toLowerCase().includes(q) ||
      (e.tags ?? []).some((t) => t.toLowerCase().includes(q))
    );
  });

  const upsert = useMutation({
    mutationFn: async () => {
      if (!draft.title.trim()) throw new Error("Title is required.");
      if (!draft.category.trim()) throw new Error("Category is required.");
      if (!draft.content.trim()) throw new Error("Content is required.");
      const payload = {
        title: draft.title,
        category: draft.category,
        content: draft.content,
        priority: draft.priority,
        approved: draft.approved,
        active: draft.active,
        tags: draft.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      };
      if (editing) {
        const { error } = await supabase
          .from("knowledge")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("knowledge").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Entry updated" : "Entry added");
      setOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patch = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<Knowledge> }) => {
      const { error } = await supabase.from("knowledge").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entry updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (entry: Knowledge) => {
      const { error } = await supabase.from("knowledge").delete().eq("id", entry.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entry deleted");
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

  const openEdit = (entry: Knowledge) => {
    setEditing(entry);
    setDraft({
      title: entry.title,
      category: entry.category,
      tags: (entry.tags ?? []).join(", "),
      content: entry.content,
      priority: entry.priority ?? 50,
      approved: Boolean(entry.approved),
      active: Boolean(entry.active),
    });
    setOpen(true);
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <AppShell
      title="Knowledge Base"
      description="What the AI is allowed to say"
      actions={
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" /> Add entry
        </Button>
      }
    >
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search titles, content, tags…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 grid gap-3">
        {entries.isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)
          : filtered.map((e) => (
              <article key={e.id} className="surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold">{e.title}</h2>
                      <Badge variant="secondary">{e.category}</Badge>
                      <Badge variant="outline">Priority {e.priority ?? 50}</Badge>
                    </div>
                    <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{e.content}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {(e.tags ?? []).map((t) => (
                        <span
                          key={t}
                          className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                        >
                          #{t}
                        </span>
                      ))}
                      <span className="text-xs text-muted-foreground">
                        Updated {formatDateTime(e.updated_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      Active
                      <Switch
                        checked={Boolean(e.active)}
                        onCheckedChange={(v) => patch.mutate({ id: e.id, values: { active: v } })}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      Approved
                      <Switch
                        checked={Boolean(e.approved)}
                        onCheckedChange={(v) => patch.mutate({ id: e.id, values: { approved: v } })}
                      />
                    </label>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(e)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(e)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </article>
            ))}
        {!entries.isLoading && !filtered.length ? (
          <p className="surface p-10 text-center text-sm text-muted-foreground">
            No knowledge entries match your filters.
          </p>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit entry" : "Add entry"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="kb-title">Title</Label>
              <Input
                id="kb-title"
                value={draft.title}
                onChange={(e) => set("title", e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="kb-cat">Category</Label>
                <Select
                  value={draft.category}
                  onValueChange={(v) => set("category", v)}
                >
                  <SelectTrigger id="kb-cat">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="kb-prio">Priority</Label>
                <Input
                  id="kb-prio"
                  type="number"
                  min={0}
                  max={100}
                  value={draft.priority}
                  onChange={(e) => set("priority", Number(e.target.value))}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="kb-tags">Tags (comma separated)</Label>
              <Input
                id="kb-tags"
                value={draft.tags}
                onChange={(e) => set("tags", e.target.value)}
                placeholder="whitening, insurance"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="kb-content">Content</Label>
              <Textarea
                id="kb-content"
                rows={7}
                value={draft.content}
                onChange={(e) => set("content", e.target.value)}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
                <Label htmlFor="kb-active">Active</Label>
                <Switch
                  id="kb-active"
                  checked={draft.active}
                  onCheckedChange={(v) => set("active", v)}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
                <Label htmlFor="kb-approved">Approved</Label>
                <Switch
                  id="kb-approved"
                  checked={draft.approved}
                  onCheckedChange={(v) => set("approved", v)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => upsert.mutate()} disabled={upsert.isPending}>
              {upsert.isPending ? "Saving…" : editing ? "Save changes" : "Add entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The AI will no longer use this entry when answering patients.
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
