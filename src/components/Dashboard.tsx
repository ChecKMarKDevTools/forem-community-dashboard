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
  User,
  MessageSquare,
  Heart,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Post = {
  id: string;
  title: string;
  url: string;
  score: number;
  attention_level: "low" | "medium" | "high";
  explanations: string[];
  created_at: string;
  author_name: string;
  author_username: string;
  comments_count: number;
  public_reactions_count: number;
  page_views_count: number;
};

type PostDetails = Post & {
  score_breakdown?: Record<string, number>;
  recent_posts?: Post[];
};

export function Dashboard() {
  const [posts, setPosts] = React.useState<Post[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedPostId, setSelectedPostId] = React.useState<string | null>(
    null,
  );
  const [postDetails, setPostDetails] = React.useState<PostDetails | null>(
    null,
  );
  const [detailsLoading, setDetailsLoading] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/posts")
      .then((res) => res.json())
      .then((data) => {
        setPosts(data);
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
          <h1 className="text-brand-900 text-2xl font-bold tracking-tight">
            Community Queue
          </h1>
          <p className="text-brand-500 mt-1 text-sm">
            Posts requiring moderation attention.
          </p>
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
                        <User className="h-3 w-3" /> {post.author_name}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />{" "}
                        {new Date(post.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Badge
                      variant={
                        post.attention_level === "high"
                          ? "destructive"
                          : post.attention_level === "medium"
                            ? "warning"
                            : "success"
                      }
                    >
                      {post.attention_level.toUpperCase()}
                    </Badge>
                    <span className="text-brand-600 text-xs font-medium">
                      Score: {post.score}
                    </span>
                  </div>
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
      {(selectedPostId || (!selectedPostId && window.innerWidth >= 768)) && (
        <div
          className={cn(
            "bg-brand-50/50 relative flex-1 overflow-y-auto p-6 md:p-8",
            !selectedPostId && "hidden items-center justify-center md:flex",
          )}
        >
          {!selectedPostId ? (
            <div className="text-brand-400 max-w-sm text-center">
              <div className="bg-brand-100 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
                <MessageSquare className="text-brand-300 h-8 w-8" />
              </div>
              <p className="text-brand-700 text-lg font-medium">
                Select a post to view details
              </p>
              <p className="mt-2 text-sm">
                The detailed moderation breakdown will appear here.
              </p>
            </div>
          ) : detailsLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="border-brand-600 h-8 w-8 animate-spin rounded-full border-b-2"></div>
            </div>
          ) : postDetails ? (
            <div className="mx-auto max-w-4xl space-y-6 pb-20">
              <div className="mb-4 md:hidden">
                <button
                  onClick={() => setSelectedPostId(null)}
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
                        href={postDetails.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-brand-600 transition-colors hover:underline"
                      >
                        {postDetails.title}
                      </a>
                    </h2>
                    <div className="text-brand-600 mt-4 flex flex-wrap items-center gap-4 text-sm">
                      <span className="bg-brand-50 flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium">
                        <User className="h-4 w-4" /> @
                        {postDetails.author_username}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4" />{" "}
                        {new Date(postDetails.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <Badge
                    variant={
                      postDetails.attention_level === "high"
                        ? "destructive"
                        : postDetails.attention_level === "medium"
                          ? "warning"
                          : "success"
                    }
                    className="px-3 py-1 text-sm"
                  >
                    {postDetails.attention_level.toUpperCase()} PRIORITY
                  </Badge>
                </div>

                <div className="border-brand-100 mb-8 flex items-center gap-6 border-y py-4">
                  <div className="text-brand-700 flex items-center gap-2">
                    <Heart className="text-danger-500 h-5 w-5" />{" "}
                    <span className="font-semibold">
                      {postDetails.public_reactions_count}
                    </span>
                  </div>
                  <div className="text-brand-700 flex items-center gap-2">
                    <MessageSquare className="text-brand-500 h-5 w-5" />{" "}
                    <span className="font-semibold">
                      {postDetails.comments_count}
                    </span>
                  </div>
                  <div className="text-brand-700 flex items-center gap-2">
                    <Eye className="text-brand-400 h-5 w-5" />{" "}
                    <span className="font-semibold">
                      {postDetails.page_views_count}
                    </span>
                  </div>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  {/* Score Breakdown */}
                  <Card className="border-brand-100 bg-brand-50/30">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-brand-800 text-lg">
                        Score Breakdown
                      </CardTitle>
                      <CardDescription>
                        Total calculated score: {postDetails.score}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {Object.entries(postDetails.score_breakdown || {}).map(
                        ([category, value]) => (
                          <div key={category} className="flex flex-col gap-1.5">
                            <div className="text-brand-700 flex justify-between text-sm font-medium">
                              <span className="capitalize">
                                {category} Score
                              </span>
                              <span>{value as number} pts</span>
                            </div>
                            <div className="bg-brand-100 h-2 w-full overflow-hidden rounded-full">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  (value as number) > 20
                                    ? "bg-danger-500"
                                    : (value as number) > 10
                                      ? "bg-warning-500"
                                      : "bg-brand-500",
                                )}
                                style={{
                                  width: `${Math.min(((value as number) / 50) * 100, 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                        ),
                      )}
                    </CardContent>
                  </Card>

                  {/* Context & Flags */}
                  <Card className="border-brand-100">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-brand-800 text-lg">
                        Investigation Context
                      </CardTitle>
                      <CardDescription>
                        Flags triggered by the system
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {postDetails.explanations &&
                      postDetails.explanations.length > 0 ? (
                        <ul className="space-y-3">
                          {postDetails.explanations.map(
                            (exp: string, i: number) => (
                              <li
                                key={i}
                                className="text-brand-700 bg-brand-50 border-brand-100 flex gap-3 rounded-lg border p-3 text-sm"
                              >
                                <AlertCircle className="text-brand-500 mt-0.5 h-4 w-4 shrink-0" />
                                <span className="leading-snug">{exp}</span>
                              </li>
                            ),
                          )}
                        </ul>
                      ) : (
                        <p className="text-brand-500 text-sm italic">
                          No specific flags raised. Routine interaction patterns
                          detected.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Author History */}
              {postDetails.recent_posts &&
                postDetails.recent_posts.length > 0 && (
                  <div className="mt-8">
                    <h3 className="text-brand-900 mb-4 px-1 text-xl font-bold">
                      Recent Posts by Author
                    </h3>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {postDetails.recent_posts.map((rp: Post) => (
                        <Card
                          key={rp.id}
                          className="border-brand-100 hover:border-brand-300 transition-colors"
                        >
                          <CardHeader className="p-4 pb-2">
                            <CardTitle className="text-brand-800 line-clamp-2 text-base">
                              <a
                                href={rp.url}
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
                                {new Date(rp.created_at).toLocaleDateString()}
                              </span>
                              <Badge
                                variant={
                                  rp.attention_level === "high"
                                    ? "destructive"
                                    : rp.attention_level === "medium"
                                      ? "warning"
                                      : "outline"
                                }
                                className="px-2 py-0 text-[10px]"
                              >
                                SCORE: {Math.round(rp.score)}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
