// The panel root: open a PR and see recent reviews.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useBbNavigate, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { CONTROL_HOVER_TRANSITION } from "@/components/ui/motion";
import { cn } from "@/lib/utils";
import type { rpcContract } from "../shared/contract";
import { parsePrRef, prRefToSubPath, REVIEW_PANEL_PATH } from "../shared/pr-ref";
import type { ReviewSummary } from "../shared/schema";
import { FOCUS } from "./FileTree";
import { uiStore } from "./store";
import { errorMessage } from "./useReview";

export function useOpenPr() {
  const navigate = useBbNavigate();
  return useCallback(
    (input: string): string | null => {
      const ref = parsePrRef(input);
      if (ref === null) return "Paste a GitHub pull request URL, e.g. https://github.com/owner/repo/pull/123";
      uiStore.set({ focusOnOpen: true, openDialog: false });
      navigate.toPluginPanel(REVIEW_PANEL_PATH, { subPath: prRefToSubPath(ref) });
      return null;
    },
    [navigate],
  );
}

const STATUS_LABEL: Record<ReviewSummary["analysisStatus"], string> = {
  none: "not analysed",
  running: "analysing…",
  done: "analysed",
  failed: "analysis failed",
};

export function HomePage() {
  const rpc = useRpc<typeof rpcContract>();
  const openPr = useOpenPr();
  const navigate = useBbNavigate();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ReviewSummary[] | null>(null);
  // Kept apart from the URL error so a failed list load never reads as a bad URL.
  const [listError, setListError] = useState<string | null>(null);

  const load = useCallback(() => {
    rpc.call("review.recent").then(
      (result) => {
        setReviews(result.reviews);
        setListError(null);
      },
      (cause: unknown) => setListError(errorMessage(cause)),
    );
  }, [rpc]);
  useEffect(load, [load]);
  useRealtime("analysis-changed", load);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(openPr(url));
  };

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-5">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Paste a pull request to see its diff grouped by concern, with a visual explanation of the change.
          </p>
        </div>
        <form onSubmit={submit} className="flex items-center gap-2">
          <Input
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setError(null);
            }}
            placeholder="https://github.com/owner/repo/pull/123"
            aria-label="Pull request URL"
            aria-invalid={error !== null}
            aria-describedby={error ? "pr-url-error" : undefined}
            autoFocus
          />
          <Button type="submit" disabled={url.trim() === ""}>
            <Icon name="GitPullRequest" />
            Review
          </Button>
        </form>
        {error ? (
          <p id="pr-url-error" role="alert" className="-mt-4 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Recent reviews</h2>
          {reviews === null && listError ? (
            <div role="alert" className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm text-destructive">
              <Icon name="AlertTriangle" className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">{listError}</span>
              <Button size="sm" variant="outline" onClick={load}>
                Retry
              </Button>
            </div>
          ) : reviews === null ? (
            <RecentSkeleton />
          ) : reviews.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              No reviews yet. Use the command palette (“PR X-ray: Review a pull request”) from anywhere in bb.
            </div>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {reviews.map((review) => (
                <li key={`${review.ref.owner}/${review.ref.repo}/${review.ref.number}`}>
                  <button
                    type="button"
                    className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-state-hover focus-visible:ring-inset", CONTROL_HOVER_TRANSITION, FOCUS)}
                    onClick={() => navigate.toPluginPanel(REVIEW_PANEL_PATH, { subPath: prRefToSubPath(review.ref) })}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{review.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {review.ref.owner}/{review.ref.repo}#{review.ref.number}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground",
                        review.analysisStatus === "failed" && "text-destructive",
                      )}
                    >
                      {review.analysisStatus === "running" ? <Icon name="Spinner" className="size-3 animate-spin" /> : null}
                      {STATUS_LABEL[review.analysisStatus]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** Placeholder rows in the list's own shape, so the page doesn't jump when reviews arrive. */
function RecentSkeleton() {
  return (
    <div role="status" aria-label="Loading recent reviews" className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {[60, 45, 52].map((width) => (
        <div key={width} className="flex items-center gap-3 px-4 py-2.5 motion-safe:animate-pulse">
          <div className="min-w-0 flex-1 space-y-1.5 py-0.5">
            <div className="h-3.5 rounded-sm bg-muted" style={{ width: `${width}%` }} />
            <div className="h-3 w-32 rounded-sm bg-muted" />
          </div>
          <div className="h-3 w-14 rounded-sm bg-muted" />
        </div>
      ))}
    </div>
  );
}
