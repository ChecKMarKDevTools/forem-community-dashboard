"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { SignalItem } from "@/components/ui/SignalItem";
import { ScoreBar } from "@/components/ui/ScoreBar";
import { PostMeta } from "@/components/ui/PostMeta";
import { SectionCard } from "@/components/ui/SectionCard";
import { QueueCard } from "@/components/ui/QueueCard";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { AlertCircle, ChevronRight, ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getAttentionVariant,
  getCategoryLabel,
  getCategoryDisplayName,
  getRecentPostBadgeVariant,
  getScoreQualitativeLabel,
  getScoreBarClass,
  extractWordCount,
  parseScoreBreakdown,
  getScoreNarrative,
  getBehaviorDescription,
  getWhatsHappening,
  getSignalName,
  formatSignalDisplay,
  computeAgeHours,
  sortByAttentionPriority,
  SIGNAL_TOOLTIPS,
  SCORE_BREAKDOWN_SIGNALS,
} from "@/lib/dashboard-helpers";
import type { Post, PostDetails, RecentPost } from "@/types/dashboard";

type DetailPanelProps = Readonly<{
  selectedPostId: number | null;
  detailsLoading: boolean;
  postDetails: PostDetails | null;
  onBack: () => void;
  onClose: () => void;
}>;

function DetailPanel({
  selectedPostId,
  detailsLoading,
  postDetails,
  onBack,
  onClose,
}: DetailPanelProps) {
  if (!selectedPostId) {
    return null;
  }

  if (detailsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!postDetails) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="mx-auto max-w-4xl space-y-6 pb-20"
    >
      {/* Mobile back button */}
      <div className="mb-4 md:hidden">
        <button
          onClick={onBack}
          className="text-accent-primary hover:text-accent-hover flex items-center gap-1 text-sm font-medium"
        >
          <ChevronRight className="h-4 w-4 rotate-180" /> Back to queue
        </button>
      </div>

      <div className="border-surface-border bg-paper-clue rounded-2xl border p-6 shadow-sm md:p-8">
        {/* Desktop close button */}
        <div className="mb-2 hidden justify-end md:flex">
          <button
            onClick={onClose}
            aria-label="Close detail panel"
            className="text-text-muted hover:text-text-primary rounded-lg p-1.5 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-text-primary text-2xl leading-tight font-bold md:text-3xl">
              <a
                href={postDetails.dev_url || postDetails.canonical_url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent-primary transition-colors hover:underline"
              >
                {postDetails.title}
              </a>
            </h2>
            <PostMeta
              author={postDetails.author}
              date={postDetails.published_at}
              variant="full"
              className="mt-4"
            />
          </div>
          <Badge
            variant={getAttentionVariant(postDetails.attention_level)}
            className="shrink-0 px-3 py-1 text-sm"
          >
            {getCategoryLabel(postDetails.attention_level)}
          </Badge>
        </div>

        <p className="text-text-muted border-surface-border mb-8 border-y py-4 text-sm">
          {postDetails.reactions} reactions &middot; {postDetails.comments}{" "}
          comments &middot; ~{extractWordCount(postDetails.explanations)} words
          &middot; {computeAgeHours(postDetails.published_at)}h old
        </p>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Conversation Signals — LEFT/first */}
          <SectionCard>
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-text-secondary text-lg">
                Conversation Signals
              </CardTitle>
              <CardDescription>
                Signals computed from the conversation
              </CardDescription>
            </CardHeader>
            <CardContent>
              {postDetails.explanations &&
              postDetails.explanations.length > 0 ? (
                <ul className="space-y-3">
                  {postDetails.explanations
                    .filter(
                      (exp) => !SCORE_BREAKDOWN_SIGNALS.has(getSignalName(exp)),
                    )
                    .map((exp: string) => (
                      <SignalItem
                        key={exp}
                        tooltip={SIGNAL_TOOLTIPS[getSignalName(exp)]}
                      >
                        {formatSignalDisplay(exp)}
                      </SignalItem>
                    ))}
                </ul>
              ) : (
                <p className="text-text-muted text-sm italic">
                  No specific flags raised. Routine interaction patterns
                  detected.
                </p>
              )}
            </CardContent>
          </SectionCard>

          {/* Discussion State — RIGHT/second */}
          <SectionCard variant="muted">
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-text-secondary text-lg">
                Discussion State
              </CardTitle>
              <CardDescription>
                Observed patterns in the current window
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(
                parseScoreBreakdown(postDetails.explanations),
              ).map(([category, value]) => (
                <ScoreBar
                  key={category}
                  label={getCategoryDisplayName(category)}
                  sublabel={getScoreQualitativeLabel(category, value)}
                  description={getScoreNarrative(category, value)}
                  value={value}
                  max={50}
                  colorClass={getScoreBarClass(value)}
                />
              ))}
            </CardContent>
          </SectionCard>
        </div>

        {/* Thread Momentum — full-width card below the grid */}
        <SectionCard variant="muted" className="mt-6">
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-text-secondary text-lg">
              Thread Momentum
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-text-secondary text-sm leading-relaxed">
              {getWhatsHappening(postDetails.explanations)}
            </p>
          </CardContent>
        </SectionCard>
      </div>

      {/* Author History */}
      {postDetails.recent_posts && postDetails.recent_posts.length > 0 && (
        <div className="mt-8">
          <h3 className="font-heading text-text-primary mb-4 px-1 text-xl font-bold">
            Recent Posts by Author
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {postDetails.recent_posts.map((rp: RecentPost) => (
              <SectionCard
                key={rp.id}
                className="hover:border-surface-raised transition-colors"
              >
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-text-secondary line-clamp-2 text-base">
                    <a
                      href={rp.dev_url || rp.canonical_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {rp.title}
                    </a>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-text-muted text-xs">
                      {new Date(rp.published_at).toLocaleDateString()}
                    </span>
                    <Badge
                      variant={getRecentPostBadgeVariant(rp.attention_level)}
                      className="px-2 py-0 text-[10px]"
                    >
                      {getCategoryLabel(rp.attention_level)}
                    </Badge>
                  </div>
                </CardContent>
              </SectionCard>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

export function Dashboard() {
  const [posts, setPosts] = React.useState<Post[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedPostId, setSelectedPostId] = React.useState<number | null>(
    null,
  );
  const [postDetails, setPostDetails] = React.useState<PostDetails | null>(
    null,
  );
  const [detailsLoading, setDetailsLoading] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/posts")
      .then((res) => {
        if (!res.ok) throw new Error(`API error ${res.status}`);
        return res.json();
      })
      .then((data: Post[]) => {
        setPosts(sortByAttentionPriority(data));
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  React.useEffect(() => {
    if (selectedPostId) {
      setDetailsLoading(true);
      fetch(`/api/posts/${selectedPostId}`)
        .then((res) => res.json())
        .then((data) => {
          setPostDetails(data);
          setDetailsLoading(false);
        })
        .catch(() => setDetailsLoading(false));
    } else {
      setPostDetails(null);
    }
  }, [selectedPostId]);

  /* Close detail panel on Escape key */
  React.useEffect(() => {
    if (!selectedPostId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedPostId(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedPostId]);

  if (loading) {
    return (
      <div className="bg-surface-primary flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left panel: Post List */}
      <div
        className={cn(
          "border-surface-border bg-paper-clue flex w-full flex-col border-r transition-all duration-300",
          selectedPostId ? "hidden md:flex md:w-1/2 lg:w-4/12" : "w-full",
        )}
      >
        <div className="from-surface-secondary via-surface-raised to-surface-secondary border-surface-border border-b bg-gradient-to-r p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-heading text-text-primary text-2xl font-bold tracking-tight">
                Attention Queue
              </h1>
              <p className="text-text-muted mt-1 text-sm">
                Conversations surfaced for review.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <a
                href="https://github.com/ChecKMarKDevTools/forem-community-dashboard/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="border-surface-border text-accent-primary hover:bg-surface-secondary hover:text-accent-hover inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
              >
                Feedback <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {posts.map((post) => (
            <QueueCard
              key={post.id}
              selected={selectedPostId === post.id}
              onClick={() => setSelectedPostId(post.id)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="font-heading text-text-primary truncate font-semibold">
                    {post.title}
                  </h3>
                  <PostMeta
                    author={post.author}
                    date={post.published_at}
                    className="mt-2"
                  />
                </div>
                <Badge
                  variant={getAttentionVariant(post.attention_level)}
                  className="shrink-0"
                >
                  {getBehaviorDescription(post)}
                </Badge>
              </div>
            </QueueCard>
          ))}
          {posts.length === 0 && (
            <EmptyState
              icon={AlertCircle}
              title="No posts found. Waiting for data sync."
            />
          )}
        </div>
      </div>

      {/* Right panel: Post Details — only rendered when a post is selected */}
      {selectedPostId !== null && (
        <div className="bg-surface-primary/50 relative flex-1 overflow-y-auto p-6 md:p-8">
          <DetailPanel
            selectedPostId={selectedPostId}
            detailsLoading={detailsLoading}
            postDetails={postDetails}
            onBack={() => setSelectedPostId(null)}
            onClose={() => setSelectedPostId(null)}
          />
        </div>
      )}
    </div>
  );
}
