"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  AlertCircle,
  ChevronRight,
  Clock,
  ExternalLink,
  HelpCircle,
  User,
  MessageSquare,
  Heart,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Category strings stored in DB `articles.attention_level` by the scoring pipeline.
type AttentionCategory =
  | "NEEDS_RESPONSE"
  | "POSSIBLY_LOW_QUALITY"
  | "NEEDS_REVIEW"
  | "BOOST_VISIBILITY"
  | "NORMAL";

// Matches the DB `articles` table schema returned by /api/posts and /api/posts/[id].
type Post = {
  id: number;
  title: string;
  canonical_url: string;
  score: number;
  attention_level: AttentionCategory;
  explanations: string[];
  published_at: string;
  author: string;
  reactions: number;
  comments: number;
};

// Subset returned for recent posts by /api/posts/[id] (includes canonical_url for linking).
type RecentPost = {
  id: number;
  title: string;
  canonical_url: string;
  dev_url: string;
  published_at: string;
  score: number;
  attention_level: AttentionCategory;
};
type PostDetails = Post & {
  dev_url: string;
  recent_posts?: RecentPost[];
};

/** Attention-level metadata: badge variant and human-readable label.
 *  No traffic-light grading — each category has a distinct semantic color.
 *  neutral = gray (routine), info = soft blue (active), teal = interaction (waiting),
 *  attention = amber (escalating), critical = red (policy risk).
 */
const ATTENTION_META: Record<
  string,
  {
    variant: "neutral" | "info" | "teal" | "attention" | "critical" | "outline";
    label: string;
  }
> = {
  NORMAL: { variant: "neutral", label: "Routine Discussion" },
  BOOST_VISIBILITY: { variant: "info", label: "Active Conversation" },
  NEEDS_RESPONSE: { variant: "teal", label: "Community Waiting" },
  NEEDS_REVIEW: { variant: "attention", label: "Escalating Discussion" },
  POSSIBLY_LOW_QUALITY: { variant: "critical", label: "Potential Rule Issue" },
};

const DEFAULT_ATTENTION = {
  variant: "neutral" as const,
  label: "Routine Discussion",
};

function getAttentionVariant(
  level: string,
): "neutral" | "info" | "teal" | "attention" | "critical" {
  const v = (ATTENTION_META[level] ?? DEFAULT_ATTENTION).variant;
  // "outline" only applies in the recent-posts context; main badges fall back to neutral
  return v === "outline" ? "neutral" : v;
}

function getCategoryLabel(level: string): string {
  return (ATTENTION_META[level] ?? DEFAULT_ATTENTION).label;
}

function getRecentPostBadgeVariant(
  level: string,
): "neutral" | "info" | "teal" | "attention" | "critical" | "outline" {
  const v = (ATTENTION_META[level] ?? DEFAULT_ATTENTION).variant;
  // neutral (routine) maps to outline for recent-posts context
  return v === "neutral" ? "outline" : v;
}

/** Overall qualitative level for the total score. */
const QUALITATIVE_HIGH = 50;
const QUALITATIVE_MODERATE = 20;

function getQualitativeLevel(score: number): string {
  if (score >= QUALITATIVE_HIGH) return "High";
  if (score >= QUALITATIVE_MODERATE) return "Moderate";
  return "Low";
}

/** Score-specific qualitative labels for breakdown bars. */
function getScoreQualitativeLabel(category: string, value: number): string {
  if (category === "heat") {
    if (value >= 10) return "High";
    if (value >= 5) return "Moderate";
    return "Low";
  }
  if (category === "risk") {
    if (value >= 4) return "High";
    if (value >= 1) return "Moderate";
    return "Low";
  }
  if (category === "support") {
    if (value >= 4) return "High";
    if (value >= 2) return "Moderate";
    return "Low";
  }
  return getQualitativeLevel(value);
}

function getScoreBarClass(value: number): string {
  if (value > 20) return "bg-danger-500";
  if (value > 10) return "bg-warning-500";
  return "bg-brand-500";
}

/** Extract word count from explanations array (e.g., "Word Count: 1000") */
function extractWordCount(explanations?: string[]): number {
  if (!explanations) return 0;
  const match = explanations
    .find((e) => e.startsWith("Word Count:"))
    ?.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

/**
 * Parse the explanations array into a score_breakdown object.
 * The sync pipeline stores scores as strings like "Heat Score: 7.50",
 * "Risk Score: 2 (freq: 0, promo: 1, engage: -2)", "Support Score: 3".
 */
function parseScoreBreakdown(explanations?: string[]): Record<string, number> {
  if (!explanations) return {};
  const breakdown: Record<string, number> = {};
  for (const exp of explanations) {
    if (exp.startsWith("Heat Score:")) {
      breakdown.heat = Number.parseFloat(exp.split(":")[1]);
    } else if (exp.startsWith("Risk Score:")) {
      // "Risk Score: 2 (freq: ...)" — grab the leading number
      const match = exp.match(/Risk Score:\s*([\d.]+)/);
      if (match) breakdown.risk = Number.parseFloat(match[1]);
    } else if (exp.startsWith("Support Score:")) {
      breakdown.support = Number.parseFloat(exp.split(":")[1]);
    }
  }
  return breakdown;
}

/** Plain-English explanation for each score type so moderators understand what they mean. */
function getScoreNarrative(category: string, value: number): string {
  if (category === "heat") {
    if (value >= 10)
      return "Very active discussion with rapid comments and mixed sentiment.";
    if (value >= 5)
      return "Elevated activity — comments are arriving faster than typical.";
    return "Normal conversation pace with steady engagement.";
  }
  if (category === "risk") {
    if (value >= 6)
      return "Multiple risk signals detected: possible spam or self-promotion.";
    if (value >= 4)
      return "Some risk flags raised — short content or promotional language.";
    if (value >= 1) return "Minor flags present but likely not concerning.";
    return "No risk indicators found.";
  }
  if (category === "support") {
    if (value >= 4)
      return "Author appears to need community help — new user with little engagement.";
    if (value >= 2)
      return "Some signs the author could use encouragement or a response.";
    return "Author seems established with normal engagement.";
  }
  return "";
}

/** Derive a contextual behavior description from explanation signals for list-view badges. */
function getBehaviorDescription(post: Post): string {
  const breakdown = parseScoreBreakdown(post.explanations);
  const heat = breakdown.heat ?? 0;
  const risk = breakdown.risk ?? 0;
  const support = breakdown.support ?? 0;

  if (heat >= 10) return "Rapidly Growing Discussion";
  if (risk >= 4) return "Risk Signals Detected";
  if (heat >= 5) return "Active Discussion";
  if (support >= 3) return "New Author Awaiting Response";

  // Check for attention delta spike
  const deltaExp = post.explanations?.find((e) =>
    e.startsWith("Attention Delta:"),
  );
  if (deltaExp) {
    const deltaMatch = deltaExp.match(/Attention Delta:\s*([\d.]+)/);
    if (deltaMatch && Number.parseFloat(deltaMatch[1]) >= 5) {
      return "Sudden Attention Spike";
    }
  }

  return getCategoryLabel(post.attention_level);
}

/** Derive a soft recommendation based on signals for the Suggested Action card. */
function getSuggestedAction(explanations?: string[]): string {
  const breakdown = parseScoreBreakdown(explanations);
  const heat = breakdown.heat ?? 0;
  const risk = breakdown.risk ?? 0;
  const support = breakdown.support ?? 0;

  if (risk >= 6)
    return "Review for potential policy violations — multiple risk signals are present.";
  if (risk >= 4)
    return "Skim for promotional or low-quality content — some risk flags were raised.";
  if (heat >= 10)
    return "Monitor this conversation — it is growing rapidly and may need moderation soon.";
  if (heat >= 5)
    return "Conversation is active, check back later if it continues to escalate.";
  if (support >= 3)
    return "Author may benefit from a welcome message or community response.";
  return "No action needed. Routine community activity.";
}

/** Hover-text descriptions for each signal in the Conversation Pattern Signals card. */
const SIGNAL_TOOLTIPS: Record<string, string> = {
  "Word Count":
    "Total words across the conversation; long threads usually mean debate or explanation, not automatically a problem.",
  "Unique Commenters":
    "How many different people joined; higher numbers suggest community interest rather than one person arguing with themselves.",
  Effort:
    "Rough estimate of how much thinking and replying participants put in; long thoughtful replies raise it, short reactions barely move it.",
  "Attention Delta":
    "Measures how quickly people started paying attention compared to normal; spikes mean the topic suddenly caught eyes.",
  "Heat Score":
    "Emotional intensity of replies; disagreement and passion raise it, calm discussion lowers it.",
  "Risk Score":
    "Probability the thread breaks platform rules; zero means nothing looks unsafe, even if people disagree loudly.",
  "Support Score":
    "Signs of constructive interaction like helping, clarifying, or agreeing; higher means collaborative tone.",
};

/** Extract the signal name (text before the colon) from an explanation string. */
function getSignalName(explanation: string): string {
  const colonIndex = explanation.indexOf(":");
  if (colonIndex === -1) return "";
  return explanation.slice(0, colonIndex).trim();
}

/** Signals already shown in the Score Breakdown card — filter them from Activity Signals. */
const SCORE_BREAKDOWN_SIGNALS = new Set([
  "Heat Score",
  "Risk Score",
  "Support Score",
]);

/** Compute age in hours from published_at timestamp */
function computeAgeHours(published_at: string): number {
  const ageMs = Date.now() - new Date(published_at).getTime();
  return Math.round(ageMs / (1000 * 60 * 60));
}

/** Priority order for attention levels in the queue list */
const ATTENTION_PRIORITY: Record<string, number> = {
  NEEDS_RESPONSE: 0,
  BOOST_VISIBILITY: 1,
  NEEDS_REVIEW: 2,
  POSSIBLY_LOW_QUALITY: 3,
  NORMAL: 4,
};

/** Sort posts by attention level priority, then by score descending within each group */
function sortByAttentionPriority(posts: Post[]): Post[] {
  return posts.toSorted((a, b) => {
    const priorityDiff =
      (ATTENTION_PRIORITY[a.attention_level] ?? 4) -
      (ATTENTION_PRIORITY[b.attention_level] ?? 4);
    if (priorityDiff !== 0) return priorityDiff;
    return b.score - a.score;
  });
}

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
      <div className="text-brand-400 max-w-sm text-center">
        <div className="bg-brand-100 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
          <MessageSquare className="text-brand-300 h-8 w-8" />
        </div>
        <p className="text-brand-700 text-lg font-medium">
          Select a post to view details
        </p>
        <p className="mt-2 text-sm">
          The conversation analysis will appear here.
        </p>
      </div>
    );
  }

  if (detailsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="border-brand-600 h-8 w-8 animate-spin rounded-full border-b-2"></div>
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
            <div className="text-brand-600 mt-4 flex flex-wrap items-center gap-4 text-sm">
              <span className="bg-brand-50 flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium">
                <User className="h-4 w-4" /> @{postDetails.author}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />{" "}
                {new Date(postDetails.published_at).toLocaleString()}
              </span>
            </div>
          </div>
          <Badge
            variant={getAttentionVariant(postDetails.attention_level)}
            className="px-3 py-1 text-sm"
          >
            {getCategoryLabel(postDetails.attention_level)}
          </Badge>
        </div>

        <div className="border-brand-100 mb-8 flex items-center gap-6 border-y py-4">
          <div className="text-brand-700 flex items-center gap-2">
            <Heart className="text-danger-500 h-5 w-5" />{" "}
            <span className="font-semibold">{postDetails.reactions}</span>
          </div>
          <div className="text-brand-700 flex items-center gap-2">
            <MessageSquare className="text-brand-500 h-5 w-5" />{" "}
            <span className="font-semibold">
              {postDetails.comments} Comments
            </span>
          </div>
          <div className="text-brand-700 flex items-center gap-2">
            <span className="font-semibold">
              ~{extractWordCount(postDetails.explanations)} Words
            </span>
          </div>
          <div className="text-brand-700 flex items-center gap-2">
            <span className="font-semibold">
              {computeAgeHours(postDetails.published_at)} Hours Old
            </span>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Conversation Pattern Signals — LEFT/first */}
          <Card className="border-brand-100">
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
                    .map((exp: string) => {
                      const signalName = getSignalName(exp);
                      const tooltip = SIGNAL_TOOLTIPS[signalName];
                      return (
                        <li
                          key={exp}
                          className="text-brand-700 bg-brand-50 border-brand-100 flex items-center gap-3 rounded-lg border p-3 text-sm"
                        >
                          {tooltip ? (
                            <span className="group relative shrink-0 cursor-help">
                              <HelpCircle className="text-brand-400 group-hover:text-brand-600 h-4 w-4" />
                              <span
                                role="tooltip"
                                className="bg-brand-900 pointer-events-none absolute top-1/2 left-6 z-10 w-56 -translate-y-1/2 rounded-lg px-3 py-2 text-xs leading-relaxed text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
                              >
                                {tooltip}
                              </span>
                            </span>
                          ) : (
                            <span className="w-4 shrink-0" />
                          )}
                          <span className="min-w-0 flex-1 leading-snug">
                            {exp}
                          </span>
                        </li>
                      );
                    })}
                </ul>
              ) : (
                <p className="text-brand-500 text-sm italic">
                  No specific flags raised. Routine interaction patterns
                  detected.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Why This Surfaced — RIGHT/second */}
          <Card className="border-brand-100 bg-brand-50/30">
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
                <div key={category} className="flex flex-col gap-1.5">
                  <div className="text-brand-700 flex justify-between text-sm font-medium">
                    <span className="capitalize">{category}</span>
                    <span>{getScoreQualitativeLabel(category, value)}</span>
                  </div>
                  <div className="bg-brand-100 h-2 w-full overflow-hidden rounded-full">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        getScoreBarClass(value),
                      )}
                      style={{
                        width: `${Math.min((value / 50) * 100, 100)}%`,
                      }}
                    />
                  </div>
                  <p className="text-brand-500 text-xs leading-snug">
                    {getScoreNarrative(category, value)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Suggested Action — full-width card below the grid */}
        <Card className="border-brand-100 bg-brand-50/30 mt-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-brand-800 text-lg">
              Suggested Action
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-brand-700 text-sm leading-relaxed">
              {getSuggestedAction(postDetails.explanations)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Author History */}
      {postDetails.recent_posts && postDetails.recent_posts.length > 0 && (
        <div className="mt-8">
          <h3 className="text-brand-900 mb-4 px-1 text-xl font-bold">
            Recent Posts by Author
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {postDetails.recent_posts.map((rp: RecentPost) => (
              <Card
                key={rp.id}
                className="border-brand-100 hover:border-brand-300 transition-colors"
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
                      {getQualitativeLevel(rp.score)}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
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
        <div className="border-brand-600 h-12 w-12 animate-spin rounded-full border-b-2"></div>
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
            <Card
              key={post.id}
              className={cn(
                "border-brand-100 hover:border-brand-300 cursor-pointer transition-all duration-200 hover:shadow-md",
                selectedPostId === post.id
                  ? "ring-brand-500 bg-brand-50 ring-2"
                  : "bg-white",
              )}
              onClick={() => setSelectedPostId(post.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-brand-900 truncate font-semibold">
                      {post.title}
                    </h3>
                    <div className="text-brand-500 mt-2 flex items-center gap-2 text-xs">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" /> @{post.author}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />{" "}
                        {new Date(post.published_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <Badge
                    variant={getAttentionVariant(post.attention_level)}
                    className="shrink-0"
                  >
                    {getBehaviorDescription(post)}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
          {posts.length === 0 && (
            <div className="text-brand-400 py-12 text-center">
              <AlertCircle className="mx-auto mb-3 h-8 w-8 opacity-50" />
              <p>No posts found. Waiting for data sync.</p>
            </div>
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
