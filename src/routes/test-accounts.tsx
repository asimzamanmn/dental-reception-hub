import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, RotateCcw } from "lucide-react";
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
  const [resetTarget, setResetTarget] = useState<TestAccount | null>(null);

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

  const resetAccount = useMutation({
    mutationFn: async (acc: TestAccount) => {
      const igId = acc.instagram_user_id;

      // 1. Find the customer record
      const { data: customer, error: customerErr } = await supabase
        .from("customers")
        .select("id")
        .eq("instagram_user_id", igId)
        .maybeSingle();

      if (customerErr) throw customerErr;

      // If customer doesn't exist, we can still try to delete inbound_events
      if (!customer) {
        const { error: err } = await supabase
          .from("inbound_events")
          .delete()
          .eq("instagram_user_id", igId);
        if (err) throw err;
        return;
      }

      const customerId = customer.id;

      // 2. Fetch booking requests to delete associated appointments & timelines
      const { data: bookings, error: bookingsErr } = await supabase
        .from("booking_requests")
        .select("id")
        .eq("customer_id", customerId);
      if (bookingsErr) throw bookingsErr;
      const bookingIds = bookings?.map((b) => b.id) || [];

      // 3. Fetch conversations to delete associated messages, batches, summaries, etc.
      const { data: convs, error: convsErr } = await supabase
        .from("conversations")
        .select("id")
        .eq("customer_id", customerId);
      if (convsErr) throw convsErr;
      const convIds = convs?.map((c) => c.id) || [];

      // 4. Delete booking sub-records
      if (bookingIds.length > 0) {
        const { error: err1 } = await supabase
          .from("appointments")
          .delete()
          .in("booking_request_id", bookingIds);
        if (err1) throw err1;

        const { error: err2 } = await supabase
          .from("booking_timeline")
          .delete()
          .in("booking_request_id", bookingIds);
        if (err2) throw err2;
      }

      // 5. Delete conversation sub-records
      if (convIds.length > 0) {
        const { error: err3 } = await supabase
          .from("outbound_messages")
          .delete()
          .in("conversation_id", convIds);
        if (err3) throw err3;

        const { error: err4 } = await supabase
          .from("ai_interactions")
          .delete()
          .in("conversation_id", convIds);
        if (err4) throw err4;

        const { error: err5 } = await supabase
          .from("conversation_summaries")
          .delete()
          .in("conversation_id", convIds);
        if (err5) throw err5;

        const { error: err6 } = await supabase
          .from("messages")
          .delete()
          .in("conversation_id", convIds);
        if (err6) throw err6;

        const { error: err7 } = await supabase
          .from("conversation_batches")
          .delete()
          .in("conversation_id", convIds);
        if (err7) throw err7;
      }

      // 6. Delete conversations and booking requests
      const { error: err8 } = await supabase
        .from("booking_requests")
        .delete()
        .eq("customer_id", customerId);
      if (err8) throw err8;

      const { error: err9 } = await supabase
        .from("conversations")
        .delete()
        .eq("customer_id", customerId);
      if (err9) throw err9;

      // 7. Delete inbound events for this instagram user id
      const { error: err10 } = await supabase
        .from("inbound_events")
        .delete()
        .eq("instagram_user_id", igId);
      if (err10) throw err10;

      // 8. Finally delete the customer record
      const { error: err11 } = await supabase
        .from("customers")
        .delete()
        .eq("id", customerId);
      if (err11) throw err11;
    },
    onSuccess: () => {
      toast.success("Test account data reset successfully!");
      setResetTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error("Failed to reset test account: " + e.message),
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
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Reset test account data"
                            onClick={() => setResetTarget(acc)}
                            disabled={resetAccount.isPending}
                          >
                            <RotateCcw className="h-4 w-4 text-amber-500 hover:text-amber-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Remove test account"
                            onClick={() => setDeleteTarget(acc)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
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

      <AlertDialog open={Boolean(resetTarget)} onOpenChange={(o) => !o && setResetTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset test account data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all messages, conversations, booking requests, appointments, and custom limits/history associated with Instagram ID {resetTarget?.instagram_user_id}. The test account configuration itself will not be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resetTarget && resetAccount.mutate(resetTarget)}
              className="bg-amber-600 text-white hover:bg-amber-700"
              disabled={resetAccount.isPending}
            >
              {resetAccount.isPending ? "Resetting..." : "Reset Data"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
