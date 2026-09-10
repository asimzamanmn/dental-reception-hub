import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useMemo } from "react";
import { toast } from "sonner";
import {
  Film,
  Image as ImageIcon,
  Mic,
  Video as VideoIcon,
  Phone,
  PhoneCall,
  CheckCircle2,
  Clock,
  Search,
  Maximize2,
  Download,
  Play,
  Pause,
  RotateCcw,
  Copy,
  MessageCircle,
  AlertCircle,
  Users,
  Layers,
  MessageSquare,
  ArrowRight,
  Archive,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime, type MediaRequest } from "@/lib/db";
import { useAuth } from "@/hooks/use-auth";
import { formatIndianPhone, getCleanIndianPhone, getTelLink, getWhatsAppLink } from "@/lib/utils";

export const Route = createFileRoute("/media-requests")({
  head: () => ({
    meta: [
      { title: "Media Requests — Dental AI Receptionist Console" },
      {
        name: "description",
        content:
          "Review incoming images, voice notes, and videos sent by dental patients via Instagram chat.",
      },
    ],
  }),
  component: MediaRequestsPage,
});

type MediaTypeFilter = "ALL" | "image" | "voice" | "video";
type ActiveSection = "pending" | "resolved" | "all";

interface PatientGroup {
  groupKey: string;
  customer_id: string;
  conversation_id: string;
  customer_name: string;
  customer_phone: string | null;
  items: MediaRequest[];
  latestCreatedAt: string;
  allResolved: boolean;
  hasPending: boolean;
  contact_attempts: number;
}

function MediaRequestsPage() {
  const { role } = useAuth();
  const queryClient = useQueryClient();

  // Primary Section: First section shows ONLY pending requests by default!
  const [activeSection, setActiveSection] = useState<ActiveSection>("pending");

  // Secondary Filters
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaTypeFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grouped" | "individual">("grouped");

  // Lightbox preview for full-screen images/videos
  const [previewMedia, setPreviewMedia] = useState<{
    url: string;
    type: string;
    title: string;
  } | null>(null);

  // Fetch Media Requests
  const mediaQuery = useQuery({
    queryKey: ["media-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as MediaRequest[];
    },
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["media-requests"] });

  // Mutation: Update status for multiple or single items
  const updateStatusMutation = useMutation({
    mutationFn: async ({
      ids,
      newStatus,
    }: {
      ids: string[];
      newStatus: "RESOLVED" | "CONTACTED" | "PENDING_STAFF";
    }) => {
      const isResolving = newStatus === "RESOLVED";
      const { error } = await supabase
        .from("media_requests")
        .update({
          status: newStatus,
          resolved_at: isResolving ? new Date().toISOString() : null,
        })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_, { newStatus, ids }) => {
      if (newStatus === "RESOLVED") {
        toast.success(
          ids.length > 1
            ? `Marked ${ids.length} requests as resolved! Moved to Resolved section.`
            : "Marked as resolved! Moved to Resolved section.",
        );
      } else {
        toast.success("Reopened and moved back to Pending section");
      }
      invalidate();
    },
    onError: (err: any) => {
      toast.error("Failed to update status: " + err.message);
    },
  });

  // Mutation: Increment contact attempts for items in group
  const incrementContactMutation = useMutation({
    mutationFn: async ({
      ids,
      currentAttempts,
    }: {
      ids: string[];
      currentAttempts: number;
    }) => {
      const { error } = await supabase
        .from("media_requests")
        .update({
          contact_attempts: (currentAttempts || 0) + 1,
          status: "CONTACTED",
        })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Logged patient call attempt");
      invalidate();
    },
    onError: (err: any) => {
      toast.error("Failed to log attempt: " + err.message);
    },
  });

  const allItems = mediaQuery.data ?? [];

  // Global counts
  const totalRequests = allItems.length;
  const pendingRequests = allItems.filter(
    (i) => (i.status || "").toUpperCase() !== "RESOLVED",
  ).length;
  const resolvedRequests = totalRequests - pendingRequests;

  const uniquePatientsCount = new Set(
    allItems.map(
      (i) =>
        i.conversation_id ||
        i.customer_id ||
        getCleanIndianPhone(i.customer_phone) ||
        i.customer_name,
    ),
  ).size;

  const totalImageCount = allItems.filter(
    (i) => (i.media_type || "").toLowerCase() === "image",
  ).length;
  const totalVoiceCount = allItems.filter((i) => {
    const t = (i.media_type || "").toLowerCase();
    return t === "voice" || t === "audio";
  }).length;
  const totalVideoCount = allItems.filter(
    (i) => (i.media_type || "").toLowerCase() === "video",
  ).length;

  // Items in active section (before media type and search filtering)
  const sectionItems = useMemo(() => {
    return allItems.filter((item) => {
      const isItemResolved = (item.status || "").toUpperCase() === "RESOLVED";
      if (activeSection === "pending" && isItemResolved) return false;
      if (activeSection === "resolved" && !isItemResolved) return false;
      return true;
    });
  }, [allItems, activeSection]);

  const sectionImageCount = sectionItems.filter(
    (i) => (i.media_type || "").toLowerCase() === "image",
  ).length;
  const sectionVoiceCount = sectionItems.filter((i) => {
    const t = (i.media_type || "").toLowerCase();
    return t === "voice" || t === "audio";
  }).length;
  const sectionVideoCount = sectionItems.filter(
    (i) => (i.media_type || "").toLowerCase() === "video",
  ).length;

  // Filtered individual items (applying section, media type, and search)
  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      // 1. Primary Section filter: Pending vs Resolved vs All
      const isItemResolved = (item.status || "").toUpperCase() === "RESOLVED";
      if (activeSection === "pending" && isItemResolved) return false;
      if (activeSection === "resolved" && !isItemResolved) return false;

      // 2. Media type filter
      if (mediaTypeFilter !== "ALL") {
        const itemType = (item.media_type || "").toLowerCase();
        if (mediaTypeFilter === "voice" && (itemType === "voice" || itemType === "audio")) {
          // match
        } else if (itemType !== mediaTypeFilter) {
          return false;
        }
      }

      // 3. Search query (name, phone, note)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = (item.customer_name || "").toLowerCase().includes(q);
        const matchPhone = (item.customer_phone || "").toLowerCase().includes(q);
        const matchFormattedPhone = formatIndianPhone(item.customer_phone).toLowerCase().includes(q);
        const matchNote = (item.patient_note || "").toLowerCase().includes(q);
        return matchName || matchPhone || matchFormattedPhone || matchNote;
      }

      return true;
    });
  }, [allItems, activeSection, mediaTypeFilter, searchQuery]);

  // Group items by Patient / Conversation
  const patientGroups = useMemo(() => {
    const map = new Map<string, PatientGroup>();

    for (const item of filteredItems) {
      const groupKey =
        item.conversation_id ||
        item.customer_id ||
        getCleanIndianPhone(item.customer_phone) ||
        item.customer_name ||
        item.id;

      if (!map.has(groupKey)) {
        map.set(groupKey, {
          groupKey,
          customer_id: item.customer_id,
          conversation_id: item.conversation_id,
          customer_name: item.customer_name || "Instagram Patient",
          customer_phone: item.customer_phone,
          items: [],
          latestCreatedAt: item.created_at,
          allResolved: true,
          hasPending: false,
          contact_attempts: item.contact_attempts || 0,
        });
      }

      const group = map.get(groupKey)!;
      group.items.push(item);
      if ((item.contact_attempts || 0) > group.contact_attempts) {
        group.contact_attempts = item.contact_attempts;
      }
      if (new Date(item.created_at).getTime() > new Date(group.latestCreatedAt).getTime()) {
        group.latestCreatedAt = item.created_at;
      }
    }

    const groups = Array.from(map.values()).map((g) => {
      // Sort items chronologically inside the chat bubble (oldest to newest)
      g.items.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      g.allResolved = g.items.every(
        (i) => (i.status || "").toUpperCase() === "RESOLVED",
      );
      g.hasPending = g.items.some(
        (i) => (i.status || "").toUpperCase() !== "RESOLVED",
      );
      return g;
    });

    // Sort patient cards by latest activity first
    groups.sort(
      (a, b) =>
        new Date(b.latestCreatedAt).getTime() -
        new Date(a.latestCreatedAt).getTime(),
    );

    return groups;
  }, [filteredItems]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${label} to clipboard`);
  };

  return (
    <AppShell
      title="Media Requests"
      description="Review patient-submitted images, voice notes, and videos from Instagram chat"
    >
      {/* Supabase Guidance banner if error occurs */}
      {mediaQuery.isError && (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-amber-600 dark:text-amber-400">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold">
                Unable to load media requests: {mediaQuery.error?.message}
              </p>
              <p className="text-xs text-muted-foreground">
                If table permissions are required, run the following in your Supabase SQL Editor:
              </p>
              <pre className="mt-2 rounded bg-black/20 p-2 font-mono text-xs select-all">
                ALTER TABLE public.media_requests DISABLE ROW LEVEL SECURITY;
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Overview Stat Cards with 1-Click Filter Links */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 mb-6">
        <div className="surface flex flex-col p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Users className="h-3.5 w-3.5 text-primary" />
            <span>Patients</span>
          </div>
          <span className="mt-1 text-2xl font-bold text-foreground">{uniquePatientsCount}</span>
          <span className="text-[11px] text-muted-foreground mt-0.5">
            {totalRequests} total media
          </span>
        </div>

        {/* Pending Review Card - Click to switch to Pending section */}
        <div
          onClick={() => setActiveSection("pending")}
          className={`surface flex flex-col p-4 cursor-pointer transition-all border ${
            activeSection === "pending"
              ? "border-amber-500 ring-2 ring-amber-500/20 bg-amber-500/10 shadow-xs"
              : "border-amber-500/30 bg-amber-500/5 hover:border-amber-500/60"
          }`}
          title="Click to view Pending Requests section"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
              Pending Review
            </span>
            <Clock className="h-3.5 w-3.5 text-amber-500" />
          </div>
          <span className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {pendingRequests}
          </span>
          <span className="text-[11px] text-amber-600/80 dark:text-amber-400/80 mt-0.5 font-medium">
            First section {activeSection === "pending" ? "(active)" : ""}
          </span>
        </div>

        {/* Resolved Card - Click to switch to Resolved section */}
        <div
          onClick={() => setActiveSection("resolved")}
          className={`surface flex flex-col p-4 cursor-pointer transition-all border ${
            activeSection === "resolved"
              ? "border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-500/10 shadow-xs"
              : "border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/60"
          }`}
          title="Click to view Resolved Requests section"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              Resolved
            </span>
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          </div>
          <span className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {resolvedRequests}
          </span>
          <span className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5 font-medium">
            Resolved section {activeSection === "resolved" ? "(active)" : ""}
          </span>
        </div>

        <div className="surface flex flex-col p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ImageIcon className="h-3.5 w-3.5 text-purple-500" />
            <span>Images</span>
          </div>
          <span className="mt-1 text-2xl font-bold text-foreground">{totalImageCount}</span>
        </div>

        <div className="surface flex flex-col p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Mic className="h-3.5 w-3.5 text-amber-500" />
            <span>Voice Notes</span>
          </div>
          <span className="mt-1 text-2xl font-bold text-foreground">{totalVoiceCount}</span>
        </div>

        <div className="surface flex flex-col p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <VideoIcon className="h-3.5 w-3.5 text-rose-500" />
            <span>Videos</span>
          </div>
          <span className="mt-1 text-2xl font-bold text-foreground">{totalVideoCount}</span>
        </div>
      </div>

      {/* Primary Section Switcher Tabs (Pending vs Resolved) */}
      <div className="surface mb-6 p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-3">
          {/* Section Navigation */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveSection("pending")}
              className={`relative flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                activeSection === "pending"
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent"
              }`}
            >
              <Clock className="h-4 w-4 text-amber-500" />
              <span>Pending Requests</span>
              <span
                className={`ml-1 text-xs px-2 py-0.5 rounded-full font-bold transition-colors ${
                  activeSection === "pending"
                    ? "bg-amber-500 text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {pendingRequests}
              </span>
            </button>

            <button
              onClick={() => setActiveSection("resolved")}
              className={`relative flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                activeSection === "resolved"
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent"
              }`}
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>Resolved Requests</span>
              <span
                className={`ml-1 text-xs px-2 py-0.5 rounded-full font-bold transition-colors ${
                  activeSection === "resolved"
                    ? "bg-emerald-600 text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {resolvedRequests}
              </span>
            </button>

            <button
              onClick={() => setActiveSection("all")}
              className={`relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                activeSection === "all"
                  ? "bg-secondary text-foreground border border-border shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent"
              }`}
            >
              <span>All History ({totalRequests})</span>
            </button>
          </div>

          {/* View Mode Toggle: By Patient vs All Items */}
          <div className="flex items-center rounded-lg border border-border bg-muted/40 p-1 self-start sm:self-auto">
            <button
              onClick={() => setViewMode("grouped")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                viewMode === "grouped"
                  ? "bg-background text-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Group all requests from the same Instagram patient into a single chat"
            >
              <Users className="h-3.5 w-3.5 text-primary" />
              By Patient ({patientGroups.length})
            </button>
            <button
              onClick={() => setViewMode("individual")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                viewMode === "individual"
                  ? "bg-background text-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="View every individual media item separately"
            >
              <Layers className="h-3.5 w-3.5 text-muted-foreground" />
              All Items ({filteredItems.length})
            </button>
          </div>
        </div>

        {/* Media Type Sub-Filters & Search Bar */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Media Type Filters */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-muted/30 p-1">
            <button
              onClick={() => setMediaTypeFilter("ALL")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mediaTypeFilter === "ALL"
                  ? "bg-background text-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Film className="h-3.5 w-3.5" />
              All Media ({sectionItems.length})
            </button>
            <button
              onClick={() => setMediaTypeFilter("image")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mediaTypeFilter === "image"
                  ? "bg-background text-purple-600 dark:text-purple-400 shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Images ({sectionImageCount})
            </button>
            <button
              onClick={() => setMediaTypeFilter("voice")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mediaTypeFilter === "voice"
                  ? "bg-background text-amber-600 dark:text-amber-400 shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Mic className="h-3.5 w-3.5" />
              Voice Notes ({sectionVoiceCount})
            </button>
            <button
              onClick={() => setMediaTypeFilter("video")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mediaTypeFilter === "video"
                  ? "bg-background text-rose-600 dark:text-rose-400 shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <VideoIcon className="h-3.5 w-3.5" />
              Videos ({sectionVideoCount})
            </button>
          </div>

          {/* Search Input */}
          <div className="relative w-full lg:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search patient, +91 phone, or notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="space-y-4">
        {mediaQuery.isLoading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="surface p-5 space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-36 w-full max-w-lg rounded-xl" />
            </div>
          ))
        ) : filteredItems.length === 0 ? (
          /* Empty States based on active section */
          activeSection === "pending" && pendingRequests === 0 ? (
            <div className="surface p-8 sm:p-12 text-center space-y-3 border border-dashed border-emerald-500/30 rounded-xl bg-emerald-500/5">
              <div className="h-12 w-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-foreground">All caught up! No pending requests</h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                All patient-submitted images, voice notes, and videos have been resolved. When patients send new media via Instagram, it will appear here automatically.
              </p>
              {resolvedRequests > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs font-semibold mt-2 gap-1.5"
                  onClick={() => setActiveSection("resolved")}
                >
                  <Archive className="h-3.5 w-3.5 text-emerald-500" />
                  View {resolvedRequests} Resolved {resolvedRequests === 1 ? "Request" : "Requests"} &rarr;
                </Button>
              )}
            </div>
          ) : activeSection === "resolved" && resolvedRequests === 0 ? (
            <div className="surface p-8 sm:p-12 text-center space-y-3 border border-dashed border-border rounded-xl">
              <div className="h-12 w-12 rounded-full bg-muted text-muted-foreground flex items-center justify-center mx-auto">
                <Archive className="h-6 w-6" />
              </div>
              <h3 className="text-base font-semibold text-foreground">No resolved requests yet</h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                When you click "Mark as Resolved" on pending patient requests, they will automatically move to this section for archival and records.
              </p>
              {pendingRequests > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs font-semibold mt-2 gap-1.5"
                  onClick={() => setActiveSection("pending")}
                >
                  <Clock className="h-3.5 w-3.5 text-amber-500" />
                  Back to {pendingRequests} Pending {pendingRequests === 1 ? "Request" : "Requests"} &rarr;
                </Button>
              )}
            </div>
          ) : (
            <div className="surface p-8 sm:p-12 text-center space-y-3 border border-dashed border-border rounded-xl">
              <Film className="h-10 w-10 text-muted-foreground/50 mx-auto" />
              <h3 className="text-base font-semibold text-foreground">No matching media requests</h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                {searchQuery || mediaTypeFilter !== "ALL"
                  ? "No requests match your current search or media type filter. Try resetting filters."
                  : `No media requests found in the ${activeSection === "pending" ? "Pending" : "Resolved"} section.`}
              </p>
              {(searchQuery || mediaTypeFilter !== "ALL") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs font-semibold"
                  onClick={() => {
                    setSearchQuery("");
                    setMediaTypeFilter("ALL");
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          )
        ) : viewMode === "grouped" ? (
          /* Grouped by Patient / Chat Thread */
          patientGroups.map((group) => (
            <PatientChatThreadCard
              key={group.groupKey}
              group={group}
              activeSection={activeSection}
              onPreview={(url, type, title) =>
                setPreviewMedia({ url, type, title })
              }
              onToggleStatus={(ids, newStatus) =>
                updateStatusMutation.mutate({ ids, newStatus })
              }
              onIncrementContact={(ids, currentAttempts) =>
                incrementContactMutation.mutate({ ids, currentAttempts })
              }
              onCopy={copyToClipboard}
              isUpdating={
                updateStatusMutation.isPending ||
                incrementContactMutation.isPending
              }
            />
          ))
        ) : (
          /* Individual Item View */
          filteredItems.map((item) => (
            <IndividualMediaCard
              key={item.id}
              item={item}
              activeSection={activeSection}
              onPreview={(url, type, title) =>
                setPreviewMedia({ url, type, title })
              }
              onToggleStatus={(newStatus) =>
                updateStatusMutation.mutate({ ids: [item.id], newStatus })
              }
              onIncrementContact={() =>
                incrementContactMutation.mutate({
                  ids: [item.id],
                  currentAttempts: item.contact_attempts,
                })
              }
              onCopy={copyToClipboard}
              isUpdating={
                updateStatusMutation.isPending ||
                incrementContactMutation.isPending
              }
            />
          ))
        )}
      </div>

      {/* Media Lightbox / Fullscreen Dialog */}
      <Dialog
        open={Boolean(previewMedia)}
        onOpenChange={(open) => !open && setPreviewMedia(null)}
      >
        <DialogContent className="max-w-4xl p-2 sm:p-4">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-sm font-medium flex items-center justify-between">
              <span>{previewMedia?.title || "Media Preview"}</span>
              {previewMedia?.url && (
                <a
                  href={previewMedia.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <Download className="h-3.5 w-3.5" />
                  Open / Download Original
                </a>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center justify-center overflow-hidden rounded-lg bg-black/90 p-1">
            {previewMedia?.type === "image" ? (
              <img
                src={previewMedia.url}
                alt={previewMedia.title}
                className="max-h-[75vh] w-auto rounded object-contain"
              />
            ) : previewMedia?.type === "video" ? (
              <video
                src={previewMedia.url}
                controls
                autoPlay
                className="max-h-[75vh] w-full rounded"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

/**
 * Patient Chat Thread Card
 * Groups all media sent by the SAME patient into a unified chat conversation
 */
function PatientChatThreadCard({
  group,
  activeSection,
  onPreview,
  onToggleStatus,
  onIncrementContact,
  onCopy,
  isUpdating,
}: {
  group: PatientGroup;
  activeSection: ActiveSection;
  onPreview: (url: string, type: string, title: string) => void;
  onToggleStatus: (
    ids: string[],
    newStatus: "RESOLVED" | "CONTACTED" | "PENDING_STAFF",
  ) => void;
  onIncrementContact: (ids: string[], currentAttempts: number) => void;
  onCopy: (text: string, label: string) => void;
  isUpdating: boolean;
}) {
  const isResolved = group.allResolved;
  const name = group.customer_name || "Instagram Patient";
  const formattedPhone = formatIndianPhone(group.customer_phone);
  const telLink = getTelLink(group.customer_phone);
  const whatsAppLink = getWhatsAppLink(group.customer_phone);
  const allIds = group.items.map((i) => i.id);

  // Initial for avatar
  const initials =
    name
      .split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "P";

  // Count item types in this chat thread
  const imageCount = group.items.filter(
    (i) => (i.media_type || "").toLowerCase() === "image",
  ).length;
  const voiceCount = group.items.filter((i) => {
    const t = (i.media_type || "").toLowerCase();
    return t === "voice" || t === "audio";
  }).length;
  const videoCount = group.items.filter(
    (i) => (i.media_type || "").toLowerCase() === "video",
  ).length;

  return (
    <article
      className={`surface p-4 sm:p-5 transition-all border ${
        isResolved
          ? "border-border/70 bg-card/60"
          : "border-amber-500/30 bg-card shadow-xs hover:border-amber-500/50"
      }`}
    >
      {/* Patient Conversation Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/40 pb-3 mb-4">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-primary to-sky-500 font-bold text-primary-foreground shadow-sm text-sm">
            {initials}
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-base font-semibold text-foreground">{name}</h4>

              {/* Badges for media inside this chat */}
              <div className="flex items-center gap-1">
                {imageCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-600 dark:text-purple-400 border border-purple-500/20">
                    <ImageIcon className="h-3 w-3" /> {imageCount} {imageCount > 1 ? "Images" : "Image"}
                  </span>
                )}
                {voiceCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    <Mic className="h-3 w-3" /> {voiceCount} {voiceCount > 1 ? "Voice Notes" : "Voice"}
                  </span>
                )}
                {videoCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-600 dark:text-rose-400 border border-rose-500/20">
                    <VideoIcon className="h-3 w-3" /> {videoCount} {videoCount > 1 ? "Videos" : "Video"}
                  </span>
                )}
              </div>
            </div>

            {/* Phone (+91) with 1-Click Call and WhatsApp shortcuts */}
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
              {formattedPhone ? (
                <>
                  <span className="font-mono font-medium text-foreground">{formattedPhone}</span>
                  <a
                    href={telLink}
                    className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-primary hover:bg-primary/20 text-[11px] font-medium transition-colors"
                    title="Call patient on +91"
                  >
                    <Phone className="h-3 w-3" /> Call
                  </a>
                  <a
                    href={whatsAppLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 text-[11px] font-medium transition-colors"
                    title="Chat on WhatsApp (+91)"
                  >
                    <MessageCircle className="h-3 w-3" /> WhatsApp
                  </a>
                </>
              ) : (
                <span className="italic text-muted-foreground/70">No phone provided</span>
              )}
            </div>
          </div>
        </div>

        {/* Right Header: Status & Call Attempts */}
        <div className="flex flex-wrap items-center gap-2 sm:self-auto self-start">
          {/* Status Badge */}
          {isResolved ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
              <CheckCircle2 className="h-3.5 w-3.5" /> All Resolved
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400 border border-amber-500/25">
              <Clock className="h-3.5 w-3.5" /> Pending ({group.items.length} {group.items.length > 1 ? "items" : "item"})
            </span>
          )}

          {/* Contact Attempts */}
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground border border-border">
            <PhoneCall className="h-3 w-3" />
            {group.contact_attempts > 0
              ? `${group.contact_attempts} call attempt${group.contact_attempts > 1 ? "s" : ""}`
              : "0 attempts"}
          </span>

          <span className="text-[11px] text-muted-foreground">
            Latest: {formatDateTime(group.latestCreatedAt)}
          </span>
        </div>
      </div>

      {/* Chat Thread Messages */}
      <div className="space-y-3 pl-1 sm:pl-4 border-l-2 border-primary/20 ml-2 sm:ml-4 py-1">
        <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5 mb-2">
          <MessageSquare className="h-3 w-3 text-primary" />
          Patient Chat Stream ({group.items.length} {group.items.length > 1 ? "messages" : "message"})
        </div>

        {group.items.map((item, idx) => {
          const mediaType = (item.media_type || "image").toLowerCase();
          const itemResolved = (item.status || "").toUpperCase() === "RESOLVED";

          return (
            <div
              key={item.id}
              className="relative max-w-2xl rounded-2xl rounded-tl-none border border-border/80 bg-muted/40 p-3 sm:p-4 shadow-sm space-y-2.5"
            >
              {/* Message Header Inside Chat Bubble */}
              <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-border/30 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-foreground">
                    #{idx + 1}
                  </span>
                  {mediaType === "image" && (
                    <span className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400 font-medium text-[11px]">
                      <ImageIcon className="h-3 w-3" /> Photo
                    </span>
                  )}
                  {(mediaType === "voice" || mediaType === "audio") && (
                    <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium text-[11px]">
                      <Mic className="h-3 w-3" /> Voice Note
                    </span>
                  )}
                  {mediaType === "video" && (
                    <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-medium text-[11px]">
                      <VideoIcon className="h-3 w-3" /> Video
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px]">{formatDateTime(item.created_at)}</span>
                  {itemResolved ? (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                      ✓ Resolved
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-500 font-medium">
                      Pending
                    </span>
                  )}
                </div>
              </div>

              {/* Media Content */}
              {mediaType === "image" && (
                <div className="relative group overflow-hidden rounded-xl border border-border bg-black/5 dark:bg-black/30 max-w-sm">
                  <img
                    src={item.media_url}
                    alt={item.patient_note || "Patient image"}
                    className="max-h-72 w-auto object-contain transition-transform duration-200 group-hover:scale-[1.02] cursor-pointer"
                    onClick={() =>
                      onPreview(item.media_url, "image", `${name} — Image #${idx + 1}`)
                    }
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="pointer-events-auto h-8 text-xs gap-1.5 shadow-lg"
                      onClick={() =>
                        onPreview(item.media_url, "image", `${name} — Image #${idx + 1}`)
                      }
                    >
                      <Maximize2 className="h-3.5 w-3.5" /> View Full
                    </Button>
                    <a
                      href={item.media_url}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pointer-events-auto inline-flex items-center gap-1.5 h-8 rounded-md bg-secondary text-secondary-foreground px-3 text-xs font-medium shadow-lg hover:bg-secondary/80"
                    >
                      <Download className="h-3.5 w-3.5" /> Save
                    </a>
                  </div>
                </div>
              )}

              {(mediaType === "voice" || mediaType === "audio") && (
                <VoiceNotePlayer
                  src={item.media_url}
                  title={`${name} — Voice Note #${idx + 1}`}
                />
              )}

              {mediaType === "video" && (
                <div className="rounded-xl overflow-hidden border border-border bg-black max-w-sm">
                  <video
                    src={item.media_url}
                    controls
                    preload="metadata"
                    className="max-h-80 w-full object-contain"
                  />
                </div>
              )}

              {/* Patient Message / Caption */}
              {item.patient_note && (
                <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap pt-1">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase block mb-0.5">
                    Message:
                  </span>
                  {item.patient_note}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Patient Card Action Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 border-t border-border/40 text-xs">
        <div className="flex items-center gap-2">
          {/* Log contact attempt button for this patient */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onIncrementContact(allIds, group.contact_attempts)}
            disabled={isUpdating}
            className="h-8 text-xs gap-1.5"
            title="Log another call attempt for this patient"
          >
            <PhoneCall className="h-3.5 w-3.5 text-primary" />
            +1 Call Attempt
          </Button>

          {/* Mark as Resolved (moves from Pending to Resolved section) / Reopen */}
          {isResolved ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onToggleStatus(allIds, "CONTACTED")}
              disabled={isUpdating}
              className="h-8 text-xs gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5 text-amber-500" />
              Reopen Conversation
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={() => onToggleStatus(allIds, "RESOLVED")}
              disabled={isUpdating}
              className="h-8 text-xs gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 font-semibold"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Mark as Resolved ({group.items.length})
            </Button>
          )}
        </div>

        {/* Technical IDs for staff */}
        <div className="flex items-center gap-2 text-muted-foreground">
          {formattedPhone && (
            <button
              onClick={() => onCopy(formattedPhone, "Phone Number")}
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors font-mono text-[10px]"
              title="Copy Phone Number"
            >
              <Copy className="h-3 w-3" /> {formattedPhone}
            </button>
          )}
          {group.conversation_id && (
            <button
              onClick={() => onCopy(group.conversation_id, "Conversation ID")}
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors font-mono text-[10px]"
              title="Copy Conversation ID"
            >
              <Copy className="h-3 w-3" /> Conv #{group.conversation_id.slice(0, 6)}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * Individual Media Card (used when user toggles to "All Items" view)
 */
function IndividualMediaCard({
  item,
  activeSection,
  onPreview,
  onToggleStatus,
  onIncrementContact,
  onCopy,
  isUpdating,
}: {
  item: MediaRequest;
  activeSection: ActiveSection;
  onPreview: (url: string, type: string, title: string) => void;
  onToggleStatus: (newStatus: "RESOLVED" | "CONTACTED" | "PENDING_STAFF") => void;
  onIncrementContact: () => void;
  onCopy: (text: string, label: string) => void;
  isUpdating: boolean;
}) {
  const mediaType = (item.media_type || "image").toLowerCase();
  const rawStatus = (item.status || "PENDING_STAFF").toUpperCase();
  const isResolved = rawStatus === "RESOLVED";
  const name = item.customer_name || "Instagram Patient";
  const formattedPhone = formatIndianPhone(item.customer_phone);
  const telLink = getTelLink(item.customer_phone);
  const whatsAppLink = getWhatsAppLink(item.customer_phone);

  const initials =
    name
      .split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "P";

  return (
    <article
      className={`surface p-4 sm:p-5 transition-all border ${
        isResolved
          ? "border-border/70 bg-card/60"
          : "border-amber-500/30 bg-card shadow-xs hover:border-amber-500/50"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/40 pb-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-primary/80 to-sky-500 font-semibold text-primary-foreground shadow-sm">
            {initials}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">{name}</h4>
              {mediaType === "image" && (
                <span className="inline-flex items-center gap-1 rounded bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-600 dark:text-purple-400 border border-purple-500/20">
                  <ImageIcon className="h-3 w-3" /> Image
                </span>
              )}
              {(mediaType === "voice" || mediaType === "audio") && (
                <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  <Mic className="h-3 w-3" /> Voice Note
                </span>
              )}
              {mediaType === "video" && (
                <span className="inline-flex items-center gap-1 rounded bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-600 dark:text-rose-400 border border-rose-500/20">
                  <VideoIcon className="h-3 w-3" /> Video
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
              {formattedPhone ? (
                <>
                  <span className="font-mono font-medium text-foreground">{formattedPhone}</span>
                  <a href={telLink} className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-primary hover:bg-primary/20 text-[11px] font-medium">
                    <Phone className="h-3 w-3" /> Call
                  </a>
                  <a href={whatsAppLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 text-[11px] font-medium">
                    <MessageCircle className="h-3 w-3" /> WhatsApp
                  </a>
                </>
              ) : (
                <span className="italic text-muted-foreground/70">No phone provided</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isResolved ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
              <CheckCircle2 className="h-3.5 w-3.5" /> Resolved
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400 border border-amber-500/25">
              <Clock className="h-3.5 w-3.5" /> Pending
            </span>
          )}
          <span className="text-[11px] text-muted-foreground">
            {formatDateTime(item.created_at)}
          </span>
        </div>
      </div>

      <div className="max-w-xl rounded-2xl rounded-tl-none border border-border/80 bg-muted/30 p-3 sm:p-4 shadow-sm space-y-3">
        {mediaType === "image" && (
          <div className="relative group overflow-hidden rounded-xl border border-border bg-black/5 max-w-sm">
            <img
              src={item.media_url}
              alt={item.patient_note || "Patient image"}
              className="max-h-72 w-auto object-contain cursor-pointer"
              onClick={() => onPreview(item.media_url, "image", `${name} — Image`)}
            />
          </div>
        )}
        {(mediaType === "voice" || mediaType === "audio") && (
          <VoiceNotePlayer src={item.media_url} title={`${name} — Voice Note`} />
        )}
        {mediaType === "video" && (
          <video src={item.media_url} controls className="max-h-80 w-full object-contain rounded-xl" />
        )}
        {item.patient_note && (
          <p className="text-sm text-foreground pt-1">{item.patient_note}</p>
        )}
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/40 text-xs">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onIncrementContact} disabled={isUpdating} className="h-8 text-xs gap-1.5">
            <PhoneCall className="h-3.5 w-3.5 text-primary" /> +1 Call Attempt
          </Button>
          {isResolved ? (
            <Button variant="outline" size="sm" onClick={() => onToggleStatus("CONTACTED")} disabled={isUpdating} className="h-8 text-xs gap-1.5">
              <RotateCcw className="h-3.5 w-3.5 text-amber-500" /> Reopen Request
            </Button>
          ) : (
            <Button variant="default" size="sm" onClick={() => onToggleStatus("RESOLVED")} disabled={isUpdating} className="h-8 text-xs gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" /> Mark as Resolved
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * Custom Voice Note Player
 * Modern audio scrubber with play/pause, playback speed toggle, and duration display
 */
function VoiceNotePlayer({ src, title }: { src: string; title: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = target;
      setCurrentTime(target);
    }
  };

  const cycleSpeed = () => {
    const speeds = [1, 1.5, 2];
    const nextSpeed = speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length];
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
    setPlaybackRate(nextSpeed);
  };

  const formatSeconds = (sec: number) => {
    if (isNaN(sec) || !isFinite(sec)) return "0:00";
    const mins = Math.floor(sec / 60);
    const remainder = Math.floor(sec % 60);
    return `${mins}:${remainder < 10 ? "0" : ""}${remainder}`;
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 max-w-md">
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
        className="hidden"
      />

      <div className="flex items-center gap-3">
        {/* Play/Pause Button */}
        <button
          onClick={togglePlay}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white hover:bg-amber-600 transition-colors shadow-md"
          title={isPlaying ? "Pause" : "Play voice note"}
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
        </button>

        {/* Progress & Waveform Bar */}
        <div className="flex-1 flex flex-col justify-center gap-1">
          <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
            <span>{formatSeconds(currentTime)}</span>
            <span>{formatSeconds(duration || 0)}</span>
          </div>

          <input
            type="range"
            min="0"
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="h-1.5 w-full cursor-pointer accent-amber-500 rounded-lg bg-muted"
          />
        </div>

        {/* Speed button */}
        <button
          onClick={cycleSpeed}
          className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
          title="Playback speed"
        >
          {playbackRate}x
        </button>

        {/* Download original */}
        <a
          href={src}
          download
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
          title="Download audio file"
        >
          <Download className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}
