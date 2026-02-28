"use client";

import * as React from "react";
import {
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatPill } from "@/components/ui/StatPill";
import { SignalItem } from "@/components/ui/SignalItem";
import { ScoreBar } from "@/components/ui/ScoreBar";
import { PostMeta } from "@/components/ui/PostMeta";
import { SectionCard } from "@/components/ui/SectionCard";
import { QueueCard } from "@/components/ui/QueueCard";
import {
  AlertCircle,
  ChevronRight,
  ExternalLink,
  MessageSquare,
  Heart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getAttentionVariant,
  getCategoryLabel,
  getRecentPostBadgeVariant,
  getScoreQualitativeLabel,
  getScoreBarClass,
  extractWordCount,
  parseScoreBreakdown,
  getScoreNarrative,
  getBehaviorDescription,
  getWhatsHappening,
  getSignalName,
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
}>;

function DetailPanel({
  selectedPostId,
  detailsLoading,
  postDetails,
  onBack,
}: DetailPanelProps) {
  if (!selectedPostId) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="Select a post to view details"
        description="The conversation analysis will appear here."
        variant="prominent"
      />
    );
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
    <div className="mx-auto max-w-4xl space-y-6 pb-20">
      <div className="mb-4 md:hidden">
        <button
          onClick={onBack}
          className="text-brand-600 hover:text-brand-800 flex items-center gap-1 text-sm font-medium"
        >
          <ChevronRight className="h-4 w-4 rotate-180" /> Back to queue
        </button>
      </div>

      <div className="border-brand-100 rounded-2xl border bg-white p-6 shadow-sm md:p-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-brand-900 text-2xl leading-tight font-bold md:text-3xl">
              <a
                href={postDetails.dev_url || postDetails.canonical_url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-brand-600 transition-colors hover:underline"
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
            className="px-3 py-1 text-sm"
          >
            {getCategoryLabel(postDetails.attention_level)}
          </Badge>
        </div>

        <div className="border-brand-100 mb-8 flex items-center gap-6 border-y py-4">
          <StatPill icon={Heart} iconClassName="text-danger-500">
            {postDetails.reactions}
          </StatPill>
          <StatPill icon={MessageSquare} iconClassName="text-brand-500">
            {postDetails.comments} Comments
          </StatPill>
          <StatPill>
            ~{extractWordCount(postDetails.explanations)} Words
          </StatPill>
          <StatPill>
            {computeAgeHours(postDetails.published_at)} Hours Old
          </StatPill>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Conversation Pattern Signals — LEFT/first */}
          <SectionCard>
            <CardHeader className="pb-3">
              <CardTitle className="text-brand-800 text-lg">
                Conversation Pattern Signals
              </CardTitle>
              <CardDescription>
                Behavioral signals from the discussion
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
                        {exp}
                      </SignalItem>
                    ))}
                </ul>
              ) : (
                <p className="text-brand-500 text-sm italic">
                  No specific flags raised. Routine interaction patterns
                  detected.
                </p>
              )}
            </CardContent>
          </SectionCard>

          {/* Why This Surfaced — RIGHT/second */}
          <SectionCard variant="muted">
            <CardHeader className="pb-3">
              <CardTitle className="text-brand-800 text-lg">
                Why This Surfaced
              </CardTitle>
              <CardDescription>
                Factors that brought this conversation to your attention
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(
                parseScoreBreakdown(postDetails.explanations),
              ).map(([category, value]) => (
                <ScoreBar
                  key={category}
                  label={category}
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

        {/* What's Happening — full-width card below the grid */}
        <SectionCard variant="muted" className="mt-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-brand-800 text-lg">
              What&apos;s Happening
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-brand-700 text-sm leading-relaxed">
              {getWhatsHappening(postDetails.explanations)}
            </p>
          </CardContent>
        </SectionCard>
      </div>

      {/* Author History */}
      {postDetails.recent_posts && postDetails.recent_posts.length > 0 && (
        <div className="mt-8">
          <h3 className="text-brand-900 mb-4 px-1 text-xl font-bold">
            Recent Posts by Author
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {postDetails.recent_posts.map((rp: RecentPost) => (
              <SectionCard
                key={rp.id}
                className="hover:border-brand-300 transition-colors"
              >
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-brand-800 line-clamp-2 text-base">
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
                    <span className="text-brand-500 text-xs">
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
    </div>
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

  if (loading) {
    return (
      <div className="bg-brand-50 flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const showRightPanel = selectedPostId !== null || window.innerWidth >= 768;

  return (
    <div className="bg-brand-50 flex h-screen overflow-hidden">
      {/* Left panel: Post List */}
      <div
        className={cn(
          "border-brand-200 flex w-full flex-col border-r bg-white transition-all duration-300",
          selectedPostId ? "hidden md:flex md:w-1/2 lg:w-4/12" : "w-full",
        )}
      >
        <div className="border-brand-100 border-b bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-brand-900 text-2xl font-bold tracking-tight">
                Attention Queue
              </h1>
              <p className="text-brand-500 mt-1 text-sm">
                Conversations surfaced for review.
              </p>
            </div>
            <a
              href="https://github.com/ChecKMarKDevTools/forem-community-dashboard/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="border-brand-200 text-brand-600 hover:bg-brand-50 hover:text-brand-800 inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
            >
              Feedback <ExternalLink className="h-3 w-3" />
            </a>
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
                  <h3 className="text-brand-900 truncate font-semibold">
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

      {/* Right panel: Post Details */}
      {showRightPanel && (
        <div
          className={cn(
            "bg-brand-50/50 relative flex-1 overflow-y-auto p-6 md:p-8",
            selectedPostId === null &&
              "hidden items-center justify-center md:flex",
          )}
        >
          <DetailPanel
            selectedPostId={selectedPostId}
            detailsLoading={detailsLoading}
            postDetails={postDetails}
            onBack={() => setSelectedPostId(null)}
          />
        </div>
      )}
    </div>
  );
}
