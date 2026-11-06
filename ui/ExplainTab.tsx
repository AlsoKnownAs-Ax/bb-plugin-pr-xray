// The visual explanation: PR Lens diagrams with pinned design comments, and
// what to look at closely.
import { useMemo, useState } from "react";
import { experimental_useCodeTheme as useCodeTheme, useBbNavigate } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { diagramTabs } from "../shared/diagram-tabs";
import type { AnalysisRecord, ReviewGroup, StoredComment } from "../shared/schema";
import { TagChip } from "./comments";
import { DiagramCanvas } from "./DiagramCanvas";
import { useAgentConfirmContext } from "./agent-confirm";
import { SafeMarkdown } from "./SafeMarkdown";
import { errorMessage, type ReviewGet, type Rpc } from "./useReview";

const SEVERITY_STYLE = {
  high: "border-destructive/60 text-destructive",
  medium: "border-warning/60 text-warning-text",
  low: "border-border text-muted-foreground",
} as const;

export function ExplainTab({
  data,
  analysis,
  rpc,
  groups,
  onOpenGroup,
}: {
  data: ReviewGet;
  analysis: AnalysisRecord;
  rpc: Rpc;
  groups: ReviewGroup[];
  onOpenGroup: (groupId: string) => void;
}) {
  const result = analysis.result!;
  const navigate = useBbNavigate();
  const theme = useCodeTheme().mode;
  const groupTitles = useMemo(() => new Map(groups.map((group) => [group.id, group.title])), [groups]);
  const tabs = useMemo(() => diagramTabs(result.graph), [result.graph]);
  const [tabId, setTabId] = useState(tabs[0]!.id);
  const tab = tabs.find((candidate) => candidate.id === tabId) ?? tabs[0]!;
  const render = result.renders[tab.id]?.[theme];
  const diagramComments = data.comments.filter((comment) => comment.source === "diagram");

  const { confirmAgent } = useAgentConfirmContext();
  const fixAll = async () => {
    if (!(await confirmAgent("fix"))) return;
    try {
      const { threadId } = await rpc.call("fix.allDiagram", { ref: data.pr.ref });
      // Stay here; open the thread from the toast when the plan is ready.
      toast.success("Started a redesign thread; it will post a plan first", {
        action: { label: "Open", onClick: () => navigate.toThread(threadId) },
      });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const GroupLinks = ({ ids }: { ids: string[] }) =>
    ids.length === 0 ? null : (
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {ids
          .filter((id) => groupTitles.has(id))
          .map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onOpenGroup(id)}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-state-hover hover:text-foreground"
            >
              <Icon name="FileDiff" className="size-3" />
              {groupTitles.get(id)}
            </button>
          ))}
      </div>
    );

  const open = diagramComments.filter((comment) => comment.status === "open");
  const outdated = diagramComments.filter((comment) => comment.status === "outdated");
  const resolved = diagramComments.filter((comment) => comment.status === "resolved");
  const selectComment = (comment: StoredComment) => {
    if (tabs.some((candidate) => candidate.id === comment.diagramId)) setTabId(comment.diagramId!);
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-6">
          <section className="space-y-2">
            <h2 className="text-base font-semibold">What this PR does</h2>
            <SafeMarkdown content={result.summary} />
            {result.ticket.url ? (
              <p className="text-xs text-muted-foreground">
                Ticket:{" "}
                <a className="underline" href={result.ticket.url} target="_blank" rel="noreferrer">
                  {result.ticket.title ?? result.ticket.url}
                </a>
                {result.ticket.projectTitle ? ` · Project: ${result.ticket.projectTitle}` : ""}
              </p>
            ) : null}
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">Diagrams</h2>
              <div className="flex flex-wrap gap-1">
                {tabs.map((candidate) => (
                  <Button key={candidate.id} size="sm" variant="ghost" aria-pressed={candidate.id === tab.id} onClick={() => setTabId(candidate.id)}>
                    {candidate.title}
                  </Button>
                ))}
              </div>
              <span className="ml-auto text-xs text-muted-foreground">⌘/Ctrl + scroll to zoom · drag to pan</span>
            </div>
            <div className="relative h-[60vh] overflow-hidden rounded-lg border border-border">
              {render ? <DiagramCanvas key={tab.id} render={render} /> : null}
            </div>
          </section>

          {result.lookClosely.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-base font-semibold">Where to look closely</h2>
              <ul className="space-y-2">
                {result.lookClosely.map((item, index) => (
                  <li key={index} className={cn("rounded-lg border bg-card px-3 py-2", SEVERITY_STYLE[item.severity])}>
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      {item.title}
                      <span className="text-[11px] font-normal uppercase">{item.severity}</span>
                    </div>
                    <SafeMarkdown content={item.reason} className="text-sm text-muted-foreground" />
                    <GroupLinks ids={item.groupIds} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>

      <aside className="flex w-80 shrink-0 flex-col border-l border-border">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-border p-3">
            <div className="text-sm font-medium">Design comments</div>
            <p className="text-xs text-muted-foreground">Kept in bb only. Comment on a node when the design is wrong.</p>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
            {diagramComments.length === 0 ? <p className="text-sm text-muted-foreground">No design comments yet.</p> : null}
            <CommentList title="Open" comments={open} rpc={rpc} onSelect={selectComment} />
            <CommentList title="Outdated" hint="The node no longer exists in the latest analysis." comments={outdated} rpc={rpc} />
            <CommentList title="Resolved" comments={resolved} rpc={rpc} onSelect={selectComment} />
          </div>
          {/* The right padding keeps this clear of the floating chat button. */}
          <div className="border-t border-border p-3 pr-20">
            <Button className="w-full" size="sm" disabled={open.length === 0} onClick={() => void fixAll()}>
              <Icon name="Bot" />
              Fix all diagram comments{open.length ? ` (${open.length})` : ""}
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function CommentList({
  title,
  hint,
  comments,
  rpc,
  onSelect,
}: {
  title: string;
  hint?: string;
  comments: StoredComment[];
  rpc: Rpc;
  onSelect?: (comment: StoredComment) => void;
}) {
  if (comments.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">
        {title} ({comments.length})
      </div>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      {comments.map((comment) => (
        <DiagramCommentCard key={comment.id} comment={comment} rpc={rpc} onSelect={onSelect} />
      ))}
    </div>
  );
}

function DiagramCommentCard({ comment, rpc, onSelect }: { comment: StoredComment; rpc: Rpc; onSelect?: (comment: StoredComment) => void }) {
  const call = (promise: Promise<unknown>) => promise.catch((error: unknown) => toast.error(errorMessage(error)));
  // Deleting can't be undone, so the first click asks.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  return (
    <div className="space-y-1.5 rounded-md border border-border bg-card p-2 text-sm">
      <div className="flex items-center gap-2">
        <button type="button" className="min-w-0 truncate text-xs font-medium hover:underline" onClick={() => onSelect?.(comment)} disabled={!onSelect}>
          {comment.nodeLabel}
        </button>
        <TagChip className="ml-auto" tag={comment.tag} onChange={(tag) => void call(rpc.call("comment.setTag", { commentId: comment.id, tag }))} onAutoTag={() => rpc.call("comment.autoTag", { commentId: comment.id })} />
      </div>
      <SafeMarkdown content={comment.body} className="text-sm" />
      <div className="flex gap-1">
        {comment.status !== "resolved" ? (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => void call(rpc.call("diagram.updateComment", { id: comment.id, status: "resolved" }))}>
            Resolve
          </Button>
        ) : (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => void call(rpc.call("diagram.updateComment", { id: comment.id, status: "open" }))}>
            Reopen
          </Button>
        )}
        {confirmingDelete ? (
          <>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-destructive" onClick={() => void call(rpc.call("diagram.deleteComment", { id: comment.id }))}>
              Delete for good
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setConfirmingDelete(false)}>
              Keep
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setConfirmingDelete(true)}>
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
