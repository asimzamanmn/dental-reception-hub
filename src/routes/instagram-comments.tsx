import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Plus,
  Trash2,
  Copy,
  ExternalLink,
  MessageSquare,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Instagram,
  Calendar,
  Key,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
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
  DialogDescription,
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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/db";

export const Route = createFileRoute("/instagram-comments")({
  head: () => ({
    meta: [
      { title: "Comment Automation — Dental AI Receptionist" },
      {
        name: "description",
        content: "Set up keywords and automated DM replies for Instagram posts.",
      },
    ],
  }),
  component: CommentCampaignsPage,
});

interface CampaignKeyword {
  id: number;
  campaign_id: number;
  keyword: string;
  dm_message: string;
  active: boolean;
  created_at: string;
}

interface Campaign {
  id: number;
  post_id: string;
  active: boolean;
  created_at: string;
  instagram_comment_keywords: CampaignKeyword[];
}

interface ProcessedComment {
  id: number;
  comment_id: string;
  campaign_id: number;
  processed_at: string;
}

interface InstagramPost {
  id: string;
  caption?: string;
  media_url?: string;
  media_type?: string;
  permalink?: string;
  timestamp?: string;
}

function CommentCampaignsPage() {
  const queryClient = useQueryClient();
  
  // Dialog and input states
  const [isCampaignDialogOpen, setIsCampaignDialogOpen] = useState(false);
  const [isKeywordDialogOpen, setIsKeywordDialogOpen] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  
  // Form draft states
  const [newCampaignPostId, setNewCampaignPostId] = useState("");
  const [newKeyword, setNewKeyword] = useState("");
  const [newDmMessage, setNewDmMessage] = useState("");
  
  // Delete dialog targets
  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);
  const [keywordToDelete, setKeywordToDelete] = useState<CampaignKeyword | null>(null);

  // 1. Fetch Meta Access Token
  const tokenQuery = useQuery({
    queryKey: ["meta-token"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_tokens")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const accessToken = tokenQuery.data?.access_token;

  // 2. Fetch Recent Instagram Posts from Facebook/Instagram Graph API
  const instagramPostsQuery = useQuery<InstagramPost[]>({
    queryKey: ["instagram-posts", accessToken],
    queryFn: async () => {
      if (!accessToken) return [];
      
      // Attempt 1: Direct Instagram User Endpoint (Instagram Graph API / Basic Display API)
      try {
        const directRes = await fetch(
          `https://graph.instagram.com/me/media?fields=id,caption,media_url,media_type,permalink,timestamp&access_token=${accessToken}&limit=15`
        );
        if (directRes.ok) {
          const mediaData = await directRes.json();
          if (mediaData.data && Array.isArray(mediaData.data)) {
            return mediaData.data;
          }
        }
      } catch (e) {
        console.warn("Direct Instagram Graph API fetch failed, trying Meta Graph API...", e);
      }

      // Attempt 2: Facebook Graph API accounts listing (Instagram Business Account)
      const response = await fetch(
        `https://graph.facebook.com/v20.0/me/accounts?fields=instagram_business_account,name&access_token=${accessToken}`
      );
      
      let igAccountId = "";
      if (response.ok) {
        const accountsData = await response.json();
        const accounts = accountsData.data || [];
        const found = accounts.find((acc: any) => acc.instagram_business_account?.id);
        if (found) {
          igAccountId = found.instagram_business_account.id;
        }
      }
      
      // Attempt 3: Fallback direct query on Meta profile
      if (!igAccountId) {
        const fallbackRes = await fetch(
          `https://graph.facebook.com/v20.0/me?fields=instagram_business_account&access_token=${accessToken}`
        );
        if (fallbackRes.ok) {
          const data = await fallbackRes.json();
          igAccountId = data?.instagram_business_account?.id || "";
        }
      }
      
      if (!igAccountId) {
        throw new Error("Could not find a connected Instagram Account on this Meta account. Check that your token is correct.");
      }
      
      // Fetch media via Instagram Business Account
      const mediaRes = await fetch(
        `https://graph.facebook.com/v20.0/${igAccountId}/media?fields=id,caption,media_url,media_type,permalink,timestamp&access_token=${accessToken}&limit=15`
      );
      if (!mediaRes.ok) {
        const errJson = await mediaRes.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || "Failed to fetch Instagram posts.");
      }
      
      const mediaData = await mediaRes.json();
      return mediaData.data || [];
    },
    enabled: !!accessToken,
  });

  // 3. Fetch Campaigns
  const campaignsQuery = useQuery<Omit<Campaign, "instagram_comment_keywords">[]>({
    queryKey: ["comment-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instagram_comment_campaigns")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Error fetching campaigns:", error);
        throw error;
      }
      return data || [];
    },
  });

  // 3b. Fetch Keywords
  const keywordsQuery = useQuery<CampaignKeyword[]>({
    queryKey: ["comment-keywords"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instagram_comment_keywords")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) {
        console.error("Error fetching keywords:", error);
        throw error;
      }
      return data || [];
    },
  });

  // Combine campaigns and keywords in-memory
  const campaigns: Campaign[] = (campaignsQuery.data || []).map((camp) => ({
    ...camp,
    instagram_comment_keywords: (keywordsQuery.data || []).filter(
      (kw) => kw.campaign_id === camp.id
    ),
  }));

  const isLoadingCampaigns = campaignsQuery.isLoading || keywordsQuery.isLoading;
  const campaignsError = campaignsQuery.error || keywordsQuery.error;

  // 4. Fetch Processed Comments Log
  const processedCommentsQuery = useQuery<ProcessedComment[]>({
    queryKey: ["processed-comments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instagram_processed_comments")
        .select("*")
        .order("processed_at", { ascending: false })
        .limit(200);
      if (error) {
        console.error("Error fetching processed comments:", error);
        throw error;
      }
      return (data || []) as ProcessedComment[];
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["comment-campaigns"] });
    void queryClient.invalidateQueries({ queryKey: ["comment-keywords"] });
    void queryClient.invalidateQueries({ queryKey: ["processed-comments"] });
  };

  // Helper copy post ID
  const copyToClipboard = (text: string, description: string) => {
    void navigator.clipboard.writeText(text);
    toast.success(`${description} copied to clipboard!`);
  };

  // Mutations
  const createCampaign = useMutation({
    mutationFn: async () => {
      const cleanPostId = newCampaignPostId.trim();
      if (!cleanPostId) throw new Error("Instagram Post ID is required.");
      
      const { error } = await supabase.from("instagram_comment_campaigns").insert({
        post_id: cleanPostId,
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Comment campaign created successfully!");
      setNewCampaignPostId("");
      setIsCampaignDialogOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleCampaign = useMutation({
    mutationFn: async (campaign: Campaign) => {
      const { error } = await supabase
        .from("instagram_comment_campaigns")
        .update({ active: !campaign.active })
        .eq("id", campaign.id);
      if (error) throw error;
      return !campaign.active;
    },
    onSuccess: (nextActive) => {
      toast.success(nextActive ? "Campaign enabled" : "Campaign disabled");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteCampaign = useMutation({
    mutationFn: async (campaign: Campaign) => {
      // First delete associated keywords
      const { error: kwError } = await supabase
        .from("instagram_comment_keywords")
        .delete()
        .eq("campaign_id", campaign.id);
      if (kwError) throw kwError;

      // Delete associated processed comment logs
      const { error: pcError } = await supabase
        .from("instagram_processed_comments")
        .delete()
        .eq("campaign_id", campaign.id);
      if (pcError) throw pcError;

      // Finally delete campaign
      const { error } = await supabase
        .from("instagram_comment_campaigns")
        .delete()
        .eq("id", campaign.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campaign removed successfully");
      setCampaignToDelete(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createKeyword = useMutation({
    mutationFn: async () => {
      if (!selectedCampaignId) throw new Error("No campaign selected.");
      const cleanKeyword = newKeyword.trim().toUpperCase();
      const cleanMessage = newDmMessage.trim();
      if (!cleanKeyword) throw new Error("Keyword is required.");
      if (!cleanMessage) throw new Error("DM message reply is required.");

      const { error } = await supabase.from("instagram_comment_keywords").insert({
        campaign_id: selectedCampaignId,
        keyword: cleanKeyword,
        dm_message: cleanMessage,
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Keyword reply trigger added!");
      setNewKeyword("");
      setNewDmMessage("");
      setIsKeywordDialogOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleKeyword = useMutation({
    mutationFn: async (kw: CampaignKeyword) => {
      const { error } = await supabase
        .from("instagram_comment_keywords")
        .update({ active: !kw.active })
        .eq("id", kw.id);
      if (error) throw error;
      return !kw.active;
    },
    onSuccess: (nextActive) => {
      toast.success(nextActive ? "Keyword enabled" : "Keyword disabled");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteKeyword = useMutation({
    mutationFn: async (kw: CampaignKeyword) => {
      const { error } = await supabase
        .from("instagram_comment_keywords")
        .delete()
        .eq("id", kw.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Keyword reply trigger removed");
      setKeywordToDelete(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell
      title="Comment Automation"
      description="Manage automated Instagram Direct Messages when users comment specific keywords on your posts."
      actions={
        <Button onClick={() => setIsCampaignDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Create Campaign
        </Button>
      }
    >
      <Tabs defaultValue="campaigns" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="campaigns">Active Campaigns</TabsTrigger>
          <TabsTrigger value="instagram-posts">Recent Posts</TabsTrigger>
          <TabsTrigger value="logs">Auto-Reply Logs</TabsTrigger>
        </TabsList>

        {/* Tab 1: Active Campaigns & Keywords */}
        <TabsContent value="campaigns" className="space-y-6">
          <div className="grid gap-6">
            {isLoadingCampaigns ? (
              Array.from({ length: 2 }).map((_, idx) => (
                <Card key={idx} className="overflow-hidden border border-border bg-card">
                  <CardHeader>
                    <Skeleton className="h-6 w-1/3" />
                    <Skeleton className="h-4 w-1/4" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))
            ) : campaignsError ? (
              <Card className="border-destructive/20 bg-destructive/5">
                <CardContent className="flex flex-col items-center justify-center p-8 text-center space-y-2 text-destructive">
                  <AlertCircle className="h-8 w-8" />
                  <h4 className="font-semibold">Failed to load campaigns</h4>
                  <p className="text-xs max-w-md text-muted-foreground">
                    {(campaignsError as Error).message || "An error occurred while fetching database records."}
                  </p>
                </CardContent>
              </Card>
            ) : campaigns.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed rounded-xl border-border bg-card">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
                  <MessageSquare className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold">No Comment Campaigns Active</h3>
                <p className="text-sm text-muted-foreground max-w-sm mt-1">
                  Create a campaign by copying a post ID from Instagram or selecting from the "Recent Posts" tab, then add keywords to auto-respond.
                </p>
                <Button onClick={() => setIsCampaignDialogOpen(true)} className="mt-4 gap-2">
                  <Plus className="h-4 w-4" /> Create Campaign
                </Button>
              </div>
            ) : (
              campaigns.map((campaign) => {
                const processedCount = processedCommentsQuery.data?.filter(
                  (pc) => pc.campaign_id === campaign.id
                ).length || 0;

                return (
                  <Card key={campaign.id} className="overflow-hidden border border-border bg-card">
                    <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0 pb-4 border-b border-border/40">
                      <div>
                        <div className="flex items-center gap-3">
                          <CardTitle className="font-mono text-sm tracking-tight text-foreground">
                            Post ID: {campaign.post_id}
                          </CardTitle>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            title="Copy Post ID"
                            onClick={() => copyToClipboard(campaign.post_id, "Post ID")}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <CardDescription className="flex items-center gap-1.5 mt-1.5">
                          <Calendar className="h-3 w-3" />
                          Created {formatDateTime(campaign.created_at)}
                        </CardDescription>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Processed comments</p>
                          <Badge variant="secondary" className="mt-0.5 font-semibold">
                            {processedCount} replies sent
                          </Badge>
                        </div>

                        <div className="flex items-center gap-2">
                          <Switch
                            checked={campaign.active}
                            onCheckedChange={() => toggleCampaign.mutate(campaign)}
                            aria-label="Toggle campaign activity"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:bg-destructive/10"
                            title="Delete Campaign"
                            onClick={() => setCampaignToDelete(campaign)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="pt-6">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold flex items-center gap-1.5">
                            <Key className="h-4 w-4 text-primary" />
                            Keywords & Messages Trigger ({campaign.instagram_comment_keywords?.length || 0})
                          </h4>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5 text-xs"
                            onClick={() => {
                              setSelectedCampaignId(campaign.id);
                              setIsKeywordDialogOpen(true);
                            }}
                          >
                            <Plus className="h-3.5 w-3.5" /> Add Keyword
                          </Button>
                        </div>

                        {!campaign.instagram_comment_keywords || campaign.instagram_comment_keywords.length === 0 ? (
                          <div className="text-center py-6 border border-dashed rounded-lg border-border/60 bg-muted/20">
                            <p className="text-xs text-muted-foreground">No keyword replies configured yet.</p>
                            <Button
                              size="sm"
                              variant="link"
                              className="text-xs mt-1"
                              onClick={() => {
                                setSelectedCampaignId(campaign.id);
                                setIsKeywordDialogOpen(true);
                              }}
                            >
                              Add the first keyword trigger
                            </Button>
                          </div>
                        ) : (
                          <div className="overflow-x-auto border border-border/50 rounded-lg">
                            <Table>
                              <TableHeader className="bg-muted/30">
                                <TableRow>
                                  <TableHead className="w-1/4">Keyword Trigger</TableHead>
                                  <TableHead className="w-1/2">DM Response Message</TableHead>
                                  <TableHead className="w-16">Active</TableHead>
                                  <TableHead className="text-right w-16">Action</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {campaign.instagram_comment_keywords.map((kw) => (
                                  <TableRow key={kw.id}>
                                    <TableCell className="font-semibold text-primary">
                                      <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-xs py-0.5">
                                        {kw.keyword}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="max-w-xs truncate text-sm text-foreground/80" title={kw.dm_message}>
                                      {kw.dm_message}
                                    </TableCell>
                                    <TableCell>
                                      <Switch
                                        checked={kw.active}
                                        onCheckedChange={() => toggleKeyword.mutate(kw)}
                                        aria-label="Toggle keyword trigger"
                                      />
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive hover:bg-destructive/5"
                                        onClick={() => setKeywordToDelete(kw)}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        {/* Tab 2: Recent Instagram Posts */}
        <TabsContent value="instagram-posts" className="space-y-6">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Instagram className="h-5 w-5 text-pink-500" />
                  Recent Instagram Posts
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Fetch posts directly from your connected business page and use them to create campaigns.
                </p>
              </div>

              {accessToken && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void queryClient.invalidateQueries({ queryKey: ["instagram-posts"] })}
                  disabled={instagramPostsQuery.isFetching}
                  className="gap-2 self-start"
                >
                  <RefreshCw className={`h-4 w-4 ${instagramPostsQuery.isFetching ? "animate-spin" : ""}`} />
                  Refresh Feed
                </Button>
              )}
            </div>

            {!accessToken ? (
              <Card className="border-amber-500/20 bg-amber-500/5">
                <CardContent className="flex flex-col items-center justify-center p-8 text-center space-y-3">
                  <AlertCircle className="h-8 w-8 text-amber-500" />
                  <div className="space-y-1">
                    <h4 className="font-semibold text-amber-800 dark:text-amber-400">Meta Access Token Not Connected</h4>
                    <p className="text-xs text-muted-foreground max-w-md">
                      To fetch posts directly from your feed, ensure a valid access token is configured in your database meta_tokens table or Clinic Settings page. You can still create campaigns by manually entering the post ID.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : instagramPostsQuery.isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <Card key={idx} className="overflow-hidden border border-border">
                    <Skeleton className="aspect-video w-full" />
                    <CardHeader className="p-3">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </CardHeader>
                  </Card>
                ))}
              </div>
            ) : instagramPostsQuery.isError ? (
              <Card className="border-destructive/20 bg-destructive/5">
                <CardContent className="flex flex-col items-center justify-center p-8 text-center space-y-2 text-destructive">
                  <AlertCircle className="h-8 w-8" />
                  <h4 className="font-semibold">Failed to load posts</h4>
                  <p className="text-xs max-w-md text-muted-foreground">
                    {instagramPostsQuery.error.message}
                  </p>
                </CardContent>
              </Card>
            ) : !instagramPostsQuery.data || instagramPostsQuery.data.length === 0 ? (
              <div className="text-center p-12 border border-dashed rounded-xl">
                <p className="text-sm text-muted-foreground">No media posts found on the connected Instagram Account.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {instagramPostsQuery.data.map((post) => (
                  <Card key={post.id} className="overflow-hidden border border-border hover:shadow-md transition bg-card">
                    {post.media_url && (post.media_type === "IMAGE" || post.media_type === "CAROUSEL_ALBUM") ? (
                      <div className="relative aspect-video w-full overflow-hidden bg-slate-900">
                        <img
                          src={post.media_url}
                          alt="Instagram content"
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : post.media_url && post.media_type === "VIDEO" ? (
                      <div className="relative aspect-video w-full bg-slate-900 flex items-center justify-center">
                        <video src={post.media_url} className="h-full w-full object-cover" muted playsInline />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <Badge variant="outline" className="text-white border-white bg-black/35 font-mono text-[10px]">
                            REEL / VIDEO
                          </Badge>
                        </div>
                      </div>
                    ) : (
                      <div className="aspect-video w-full bg-slate-900 flex items-center justify-center text-muted-foreground text-xs">
                        No Preview Available
                      </div>
                    )}
                    
                    <CardHeader className="p-3 pb-2 space-y-1">
                      <p className="text-xs text-muted-foreground">
                        {post.timestamp ? formatDate(post.timestamp) : "—"}
                      </p>
                      <p className="text-sm line-clamp-2 font-medium text-foreground/90 h-10">
                        {post.caption || <span className="italic text-muted-foreground text-xs">No caption</span>}
                      </p>
                    </CardHeader>
                    
                    <CardContent className="p-3 pt-0 flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1 text-xs gap-1.5 h-8"
                        onClick={() => {
                          setNewCampaignPostId(post.id);
                          setIsCampaignDialogOpen(true);
                        }}
                      >
                        <Plus className="h-3 w-3" /> Create Campaign
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        title="Copy ID"
                        onClick={() => copyToClipboard(post.id, "Instagram Post ID")}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      {post.permalink && (
                        <a
                          href={post.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input hover:bg-muted text-muted-foreground"
                          title="Open on Instagram"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Tab 3: Reply History Logs */}
        <TabsContent value="logs">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle>Auto-Reply Log</CardTitle>
              <CardDescription>
                Review comments that have been automatically processed by the chatbot helper.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {processedCommentsQuery.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : !processedCommentsQuery.data || processedCommentsQuery.data.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No automated comments processed yet.
                </div>
              ) : (
                <div className="overflow-x-auto border rounded-lg">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead>Comment ID</TableHead>
                        <TableHead>Campaign ID</TableHead>
                        <TableHead>Processed At</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {processedCommentsQuery.data.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono text-xs">{log.comment_id}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            Campaign #{log.campaign_id}
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatDateTime(log.processed_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="inline-flex items-center gap-1 text-xs text-green-500 font-semibold">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Sent Reply
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog: Create Campaign */}
      <Dialog open={isCampaignDialogOpen} onOpenChange={setIsCampaignDialogOpen}>
        <DialogContent className="sm:max-w-md bg-background text-foreground border border-border">
          <DialogHeader>
            <DialogTitle>Create Comment Campaign</DialogTitle>
            <DialogDescription>
              Enter the Instagram Post ID to monitor. Anyone who comments matching keywords on this post will get the configured DM auto-reply.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-3">
            <div className="grid gap-1.5">
              <Label htmlFor="post-id">Instagram Post ID</Label>
              <Input
                id="post-id"
                placeholder="e.g. 17841400000000000"
                value={newCampaignPostId}
                onChange={(e) => setNewCampaignPostId(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                You can copy this ID from the "Recent Posts" feed or directly from the URL or Graph Explorer.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsCampaignDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createCampaign.mutate()} disabled={createCampaign.isPending}>
              {createCampaign.isPending ? "Creating..." : "Create Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Add Keyword */}
      <Dialog open={isKeywordDialogOpen} onOpenChange={setIsKeywordDialogOpen}>
        <DialogContent className="sm:max-w-md bg-background text-foreground border border-border">
          <DialogHeader>
            <DialogTitle>Add Keyword Trigger</DialogTitle>
            <DialogDescription>
              Define the keyword that will trigger the automated DM and the response template.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-3">
            <div className="grid gap-1.5">
              <Label htmlFor="keyword">Keyword</Label>
              <Input
                id="keyword"
                placeholder="e.g. BOOK"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Matches are case-insensitive (e.g. "book", "Book", "BOOK" will trigger).
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="dm-message">Automated DM Message Reply</Label>
              <Textarea
                id="dm-message"
                placeholder="Hi there! Thanks for your comment. Click here to book your appointment..."
                rows={4}
                value={newDmMessage}
                onChange={(e) => setNewDmMessage(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsKeywordDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createKeyword.mutate()} disabled={createKeyword.isPending}>
              {createKeyword.isPending ? "Adding..." : "Add Trigger"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: Delete Campaign */}
      <AlertDialog open={Boolean(campaignToDelete)} onOpenChange={(o) => !o && setCampaignToDelete(null)}>
        <AlertDialogContent className="bg-background text-foreground border border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Comment Campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the campaign monitoring post ID <strong>{campaignToDelete?.post_id}</strong> along with all of its associated keywords and automated replies. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/95"
              onClick={() => campaignToDelete && deleteCampaign.mutate(campaignToDelete)}
              disabled={deleteCampaign.isPending}
            >
              {deleteCampaign.isPending ? "Deleting..." : "Delete Campaign"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog: Delete Keyword */}
      <AlertDialog open={Boolean(keywordToDelete)} onOpenChange={(o) => !o && setKeywordToDelete(null)}>
        <AlertDialogContent className="bg-background text-foreground border border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Keyword Reply?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the trigger keyword <strong>{keywordToDelete?.keyword}</strong>? Comments with this keyword will no longer receive automated responses.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/95"
              onClick={() => keywordToDelete && deleteKeyword.mutate(keywordToDelete)}
              disabled={deleteKeyword.isPending}
            >
              {deleteKeyword.isPending ? "Removing..." : "Delete Keyword"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
