import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime, type TestAccount } from "@/lib/db";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/test-accounts")({
  head: () => ({
    meta: [
      { title: "Test Accounts — Dental AI Receptionist" },
      {
        name: "description",
        content:
          "Allow-list Instagram accounts used for safely testing the AI dental receptionist before going live.",
      },
      { property: "og:title", content: "Test Accounts — Dental AI Receptionist" },
      {
        property: "og:description",
        content: "Add, disable and remove Instagram test accounts for the AI receptionist.",
      },
    ],
  }),
  component: TestAccountsPage,
});

function TestAccountsPage() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ instagram_user_id: "", name: "" });
  const [deleteTarget, setDeleteTarget] = useState<TestAccount | null>(null);

  const accounts = useQuery({
    queryKey: ["test-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instagram_test_accounts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TestAccount[];
    },
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["test-accounts"] });

  const add = useMutation({
    mutationFn: async () => {
      if (!draft.instagram_user_id.trim()) throw new Error("Instagram user ID is required.");
      const { error } = await supabase.from("instagram_test_accounts").insert({
        instagram_user_id: draft.instagram_user_id.trim(),
        name: draft.name.trim() || null,
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Test account added");
      setDraft({ instagram_user_id: "", name: "" });
      setOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (acc: TestAccount) => {
      const { error } = await supabase
        .from("instagram_test_accounts")
        .update({ active: !acc.active })
        .eq("instagram_user_id", acc.instagram_user_id);
      if (error) throw error;
      return !acc.active;
    },
    onSuccess: (active) => {
      toast.success(active ? "Test account enabled" : "Test account disabled");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (acc: TestAccount) => {
      const { error } = await supabase
        .from("instagram_test_accounts")
        .delete()
        .eq("instagram_user_id", acc.instagram_user_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Test account removed");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell
      title="Test Accounts"
      description="Instagram accounts allowed to exercise the AI safely"
      actions={
        role === "admin" ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Add account
          </Button>
        ) : null
      }
    >
      {role === "staff" && (
        <div className="mb-4 rounded-lg border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-400">
          <span className="font-semibold">Read-only View (Staff):</span> You can view the test accounts, but only administrators can manage them.
        </div>
      )}
      <div className="surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Instagram user ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Added</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : (accounts.data ?? []).map((acc) => (
                  <TableRow key={acc.instagram_user_id}>
                    <TableCell className="font-mono text-xs">{acc.instagram_user_id}</TableCell>
                    <TableCell>{acc.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(acc.created_at)}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={Boolean(acc.active)}
                        onCheckedChange={() => toggle.mutate(acc)}
                        aria-label="Toggle test account"
                        disabled={role === "staff"}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      {role === "admin" && (
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(acc)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            {!accounts.isLoading && !(accounts.data ?? []).length ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  No test accounts yet.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add test account</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="ta-id">Instagram user ID</Label>
              <Input
                id="ta-id"
                value={draft.instagram_user_id}
                onChange={(e) => setDraft({ ...draft, instagram_user_id: e.target.value })}
                placeholder="17841400000000000"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ta-name">Name (optional)</Label>
              <Input
                id="ta-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => add.mutate()} disabled={add.isPending}>
              {add.isPending ? "Adding…" : "Add account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove test account?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.instagram_user_id} will no longer be treated as a test account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && remove.mutate(deleteTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
