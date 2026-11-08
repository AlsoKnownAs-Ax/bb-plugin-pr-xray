// The visual explanation: PR Lens diagrams with pinned design comments, and
// what to look at closely.
import { useMemo, useState, type ReactNode } from "react";
import { experimental_useCodeTheme as useCodeTheme, useBbNavigate } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { diagramTabs } from "../shared/diagram-tabs";
import type { AnalysisRecord, ReviewGroup, StoredComment } from "../shared/schema";
import { Composer, TagChip } from "./comments";
import { DiagramCanvas } from "./DiagramCanvas";
import { overlayTargets, type OverlayTarget } from "./diagram-overlay";
import { useAgentConfirmContext } from "./agent-confirm";
import { SafeMarkdown } from "./SafeMarkdown";
import { errorMessage, type ReviewGet, type Rpc } from "./useReview";
import { citeTarget, FOCUS_PAD, focusBoxes, nodeTab, stepTarget, type Focus, type Target } from "./walkthrough";
import { WALKTHROUGH_PANEL_WIDTH, WalkthroughPanel } from "./WalkthroughPanel";
import type { CiteRef, GraphDoc } from "@coldtea/pr-lens-schema";

const SEVERITY_STYLE = {
  high: "border-destructive/60 text-destructive",
  medium: "border-warning/60 text-warning-text",
  low: "border-border text-muted-foreground",
} as const;

type Result = NonNullable<AnalysisRecord["result"]>;

type ExplainTabProps = {
  data: ReviewGet;
  analysis: AnalysisRecord;
  rpc: Rpc;
  groups: ReviewGroup[];
  onOpenGroup: (groupId: string) => void;
  onOpenFile: (path: string) => void;
  onReanalyse: () => void;
};

export function ExplainTab(props: ExplainTabProps) {
  const result = props.analysis.result!;
  const { graph, renders } = result;
  if (graph && renders) {
    return <DiagramExplain {...props} graph={graph} renders={renders} />;
  }

  // A legacy analysis: its summary and look-closely still hold; only the diagrams need a re-run.
  return (
    <div className="h-full overflow-y-auto">
      <Explanation result={result} groups={props.groups} onOpenGroup={props.onOpenGroup}>
        <div className="flex flex-col items-start gap-3 rounded-lg border border-border p-6 text-sm text-muted-foreground">
          Re-run analysis to see the new diagrams.
          <Button size="sm" variant="outline" onClick={props.onReanalyse}>
            <Icon name="Sparkles" />
            Re-run analysis
          </Button>
        </div>
      </Explanation>
    </div>
  );
}

function DiagramExplain({
  data,
  analysis,
  rpc,
  groups,
  onOpenGroup,
  onOpenFile,
  graph,
  renders,
}: ExplainTabProps & { graph: GraphDoc; renders: NonNullable<Result["renders"]> }) {
  const navigate = useBbNavigate();
  const theme = useCodeTheme().mode;
  const tabs = useMemo(() => diagramTabs(graph), [graph]);
  const [tabId, setTabId] = useState(tabs[0]!.id);
  const tab = tabs.find((candidate) => candidate.id === tabId) ?? tabs[0]!;
  const render = renders[tab.id]?.[theme];
  const diagramComments = data.comments.filter((comment) => comment.source === "diagram");
  const targets = render ? overlayTargets(graph, tab, render.atlas, diagramComments) : [];
  // A node or table on the current tab, by id.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = targets.find((target) => target.id === selectedId);
  const steps = graph.walkthrough?.steps ?? [];
  const [step, setStep] = useState<number | null>(null);
  const [focus, setFocus] = useState<Focus>({ kind: "all" });
  const focused = render ? focusBoxes(focus, render.atlas, tab.flow) : [];
  const show = (target: Target) => {
    if (target.tab) setTabId(target.tab);
    setFocus(target.focus);
  };
  const selectStep = (index: number | null) => {
    setStep(index);
    const chosen = index === null ? undefined : steps[index];
    if (chosen) show(stepTarget(chosen));
    else setFocus({ kind: "all" });
  };
  const citeAction = (ref: CiteRef) => {
    if (ref.kind === "file") return () => onOpenFile(ref.path);
    // Node and table cites open the node panel; column cites stay plain text.
    if (ref.kind === "node" || ref.kind === "table") {
      const id = partId(ref);
      const onTab = nodeTab(graph, tabs, tab.id, id);
      return onTab
        ? () => {
            // The step's zoom belongs to its own tab; drop it when switching away.
            if (onTab !== tab.id) setFocus({ kind: "all" });
            setTabId(onTab);
            setSelectedId(id);
          }
        : null;
    }
    const target = citeTarget(graph, tabs, ref);
    return target ? () => show(target) : null;
  };

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

  const open = diagramComments.filter((comment) => comment.status === "open");
  const outdated = diagramComments.filter((comment) => comment.status === "outdated");
  const resolved = diagramComments.filter((comment) => comment.status === "resolved");
  const selectComment = (comment: StoredComment) => {
    if (!tabs.some((candidate) => candidate.id === comment.diagramId)) return;
    setTabId(comment.diagramId!);
    setSelectedId(comment.nodeId);
    selectStep(null);
  };

  return (
    <div className="flex h-full min-h-0">
      {/* A size container, so the diagram area can take the column's visible height. */}
      <div className="min-w-0 flex-1 overflow-y-auto [container-type:size]">
        <Explanation result={analysis.result!} groups={groups} onOpenGroup={onOpenGroup}>
          {/* The column's height less its padding, so the canvas fills the view once scrolled to. */}
          <section className="flex h-[calc(100cqh-2rem)] flex-col gap-3 md:h-[calc(100cqh-3rem)]">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">Diagrams</h2>
              <div className="flex flex-wrap gap-1">
                {tabs.map((candidate) => (
                  <Button
                    key={candidate.id}
                    size="sm"
                    variant="ghost"
                    aria-pressed={candidate.id === tab.id}
                    onClick={() => {
                      setTabId(candidate.id);
                      setSelectedId(null);
                      selectStep(null);
                    }}
                  >
                    {candidate.title}
                  </Button>
                ))}
              </div>
              <span className="ml-auto text-xs text-muted-foreground">⌘/Ctrl + scroll to zoom · drag to pan</span>
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
              {render ? (
                <DiagramCanvas
                  key={tab.id}
                  render={render}
                  onBackgroundClick={() => {
                    setSelectedId(null);
                    selectStep(null);
                  }}
                  overlay={(scale) => <DiagramOverlay targets={targets} selectedId={selectedId} scale={scale} onSelect={setSelectedId} />}
                  focus={focused}
                  reserveRight={steps.length ? WALKTHROUGH_PANEL_WIDTH : 0}
                />
              ) : null}
              {steps.length ? <WalkthroughPanel steps={steps} current={step} onSelect={selectStep} citeAction={citeAction} /> : null}
            </div>
          </section>
        </Explanation>
      </div>

      <aside className="flex w-80 shrink-0 flex-col border-l border-border">
        {selected ? (
          <NodePanel
            data={data}
            analysis={analysis}
            tabId={tab.id}
            target={selected}
            comments={diagramComments.filter((comment) => comment.diagramId === tab.id && comment.nodeId === selected.id)}
            rpc={rpc}
            onOpenFile={onOpenFile}
            onClose={() => setSelectedId(null)}
          />
        ) : (
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
        )}
      </aside>
    </div>
  );
}

/** The summary, then `children` (the diagrams, or the prompt to re-run for them), then what to look at closely. */
function Explanation({
  result,
  groups,
  onOpenGroup,
  children,
}: {
  result: Result;
  groups: ReviewGroup[];
  onOpenGroup: (groupId: string) => void;
  children: ReactNode;
}) {
  const groupTitles = useMemo(() => new Map(groups.map((group) => [group.id, group.title])), [groups]);
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

  return (
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

      {children}

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
  );
}

/** The node or table a cite names. */
function partId(ref: Extract<CiteRef, { kind: "node" | "table" }>): string {
  if (ref.kind === "node") {
    return ref.node;
  }

  return ref.table;
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

/** Click targets and comment pins over the SVG, in its viewBox units, so they stay on their card at any zoom. */
function DiagramOverlay({
  targets,
  selectedId,
  scale,
  onSelect,
}: {
  targets: OverlayTarget[];
  selectedId: string | null;
  scale: number;
  onSelect: (id: string) => void;
}) {
  return targets.map((target) => (
    <button
      key={target.id}
      type="button"
      aria-label={`${target.label}: details and comments`}
      aria-pressed={target.id === selectedId}
      className="absolute rounded-lg outline-2 outline-primary hover:outline aria-pressed:outline"
      // The outline sits FOCUS_PAD out so it clears the delta badge on the card's top edge.
      style={{ left: target.box.x, top: target.box.y, width: target.box.width, height: target.box.height, outlineOffset: FOCUS_PAD }}
      onClick={() => onSelect(target.id)}
    >
      {target.pins > 0 ? (
        <span
          className={cn(
            "absolute -right-2.5 -top-2.5 flex h-6 min-w-6 origin-bottom-left items-center justify-center rounded-full rounded-bl-none border-2 border-background px-1 text-[11px] font-semibold shadow",
            target.openPins > 0 ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
          )}
          // Counter the zoom so the pin keeps its size on screen.
          style={{ transform: `scale(${1 / scale})` }}
          aria-label={`${target.pins} comments, ${target.openPins} open`}
        >
          {target.pins}
        </span>
      ) : null}
    </button>
  ));
}

function NodePanel({
  data,
  analysis,
  tabId,
  target,
  comments,
  rpc,
  onOpenFile,
  onClose,
}: {
  data: ReviewGet;
  analysis: AnalysisRecord;
  tabId: string;
  target: OverlayTarget;
  comments: StoredComment[];
  rpc: Rpc;
  onOpenFile: (path: string) => void;
  onClose: () => void;
}) {
  const isCurrent = analysis.headSha === data.pr.headSha;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start gap-2 border-b border-border p-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase text-muted-foreground">
            {target.kind} · {target.delta}
          </div>
          <div className="font-medium">{target.label}</div>
          {target.files.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5">
              {target.files.map((path) => (
                <li key={path}>
                  <button
                    type="button"
                    onClick={() => onOpenFile(path)}
                    className="inline-flex max-w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    <Icon name="FileDiff" className="size-3 shrink-0" />
                    <span className="truncate">{path}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <Button size="icon" variant="ghost" className="size-7" onClick={onClose} aria-label="Close">
          <Icon name="X" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {comments.map((comment) => (
          <DiagramCommentCard key={comment.id} comment={comment} rpc={rpc} />
        ))}
        <Composer
          key={`${target.id}-${comments.length}`}
          placeholder="What is wrong with this part of the design?"
          autoFocus={comments.length === 0}
          actions={[
            {
              label: "Comment",
              primary: true,
              run: async (body) => {
                await rpc.call("diagram.addComment", { ref: data.pr.ref, analysisId: analysis.id, diagramId: tabId, nodeId: target.id, body });
              },
            },
          ]}
        />
        {!isCurrent ? (
          <p className="text-[11px] text-muted-foreground">This diagram is from an older commit; re-analyse to comment on the latest design.</p>
        ) : null}
      </div>
    </div>
  );
}
